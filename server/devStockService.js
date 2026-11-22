/**
 * DEV ONLY: tenant-isolated synthetic stock/reservation and batch receipt service.
 * Shared SERIALIZABLE order row lock + signed journal verification bind all
 * warehouse claims to exact approved revision. Not real supplier, WMS or carrier.
 */
import {createHash} from 'node:crypto';
import {authorizeGaberAction} from './accessPolicy.js';
import {replayOrder} from '../src/orderWorkflow.js';
import {verifyOrderJournalSnapshot} from './orderJournalService.js';
import {deriveDemoStockPlan,validateBatchPick,validateIndependentBatchReceipt} from './inventoryPlan.js';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0&&x.length<=160;
const copy=x=>structuredClone(x);
const reject=(code,more={})=>({accepted:false,code,...more,productionRelease:{allowed:false}});
const snapshot=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const TYPES={reserve:{role:'factory',action:'factory.technical_review'},
 ship_batch:{role:'factory',action:'shipments.record'},
 receive_batch:{role:'client',action:'delivery.accept'},
 release:{role:'partner',action:'catalog.manage'}};
const quote=x=>({status:x.status,code:x.code,productionRelease:{allowed:false}});
export function createDevStockService({repository,clock=Date.now,enabled=false}){
 if(typeof repository?.withOrderTransaction!=='function')throw TypeError('STOCK_REPOSITORY_REQUIRED');
 const devAllowed=actor=>enabled&&process.env.NODE_ENV!=='production'&&
  /^TENANT-(DEV|TEST)(?:-|$)/.test(actor?.tenantId??'');
 async function context(tx,actor,orderId,action){
  const resource=await tx.getResourceForUpdate();
  if(!resource)return {error:reject('RESOURCE_NOT_AUTHORIZED')};
  const auth=authorizeGaberAction({principal:actor,resource,action,nowMs:clock()});
  if(!auth.allowed)return {error:reject(auth.reason)};
  if(auth.role==='factory'){
   if(!await tx.isFactoryApproved({factoryId:resource.factoryId}))
    return {error:reject('FACTORY_NOT_APPROVED')};
  }
  const head=await tx.getHeadForUpdate();
  if(!head)return {error:reject('ORDER_MISSING')};
  const rows=await tx.getEvents();
  const {state}=verifyOrderJournalSnapshot(head,rows,{tenantId:actor.tenantId,orderId},replayOrder);
  if(!state)return {error:reject('ORDER_MISSING')};
  if(!id(resource.factoryId))return {error:reject('FACTORY_NOT_ASSIGNED')};
  return {resource,state,auth,head};
 }
 const fetchReservations=async(tx,actor,orderId,rev,lock=false)=>{
  const q=await tx.stockQuery(
   \`SELECT part_ref AS "partRef",sku_id AS "skuId",required_qty AS "requiredQty",
     reserved_qty AS "reservedQty",shipped_qty AS "shippedQty",factory_id AS "factoryId"
    FROM gaber_orders.dev_stock_reservations WHERE tenant_id=$1 AND order_id=$2
     AND revision_id=$3 ORDER BY part_ref\${lock?' FOR UPDATE':''}\`,
   [actor.tenantId,orderId,rev]);
  return q.rows;
 };
 const fetchDocuments=async(tx,actor,orderId)=>{
  const docs=(await tx.stockQuery(
   \`SELECT document_id AS "documentId",revision_id AS "revisionId",kind,
     reference,batch_id AS "batchId",actor_id AS "actorId",
     order_version AS "orderVersion",evidence,created_at AS "createdAt"
    FROM gaber_orders.dev_stock_documents
    WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at,document_id\`,
   [actor.tenantId,orderId])).rows;
  const lines=(await tx.stockQuery(
   \`SELECT l.document_id AS "documentId",l.part_ref AS "partRef",
     l.sku_id AS "skuId",l.quantity,l.damaged_qty AS "damagedQty"
    FROM gaber_orders.dev_stock_document_lines l
    WHERE l.tenant_id=$1 AND l.order_id=$2 ORDER BY l.document_id,l.part_ref\`,
   [actor.tenantId,orderId])).rows;
  for(const d of docs)d.lines=lines.filter(x=>x.documentId===d.documentId)
   .map(({documentId,...x})=>x);
  return docs;
 };
 const planFor=(state,revisionId)=>{
  const revision=state.revisions.find(r=>r.id===revisionId);
  if(!revision)throw Error('STOCK_REVISION_NOT_FOUND');
  return deriveDemoStockPlan(revision.config);
 };
 return {
  async read({principal,orderId}){
   if(!devAllowed(principal))return reject('DEV_STOCK_DISABLED');
   if(!id(orderId)||!id(principal?.tenantId))return reject('INVALID_STOCK_REQUEST');
   const actor=snapshot(principal);
   return repository.withOrderTransaction({tenantId:actor.tenantId,orderId},async tx=>{
    const ctx=await context(tx,actor,orderId,'orders.read');
    if(ctx.error)return ctx.error;
    const state=ctx.state,revisionId=state.revisions.at(-1)?.id??null;
    const plan=revisionId?planFor(state,revisionId):null;
    const reservations=revisionId?await fetchReservations(tx,actor,orderId,revisionId):[];
    const docs=await fetchDocuments(tx,actor,orderId);
    // No buyer prices, unit purchase costs, or tenant-wide stock quantities in client DTO.
    return {accepted:true,code:'DEV_STOCK_READ',devStock:{
     schemaVersion:'gaber-dev-stock-ledger/1',orderId,revisionId,
     orderVersion:state.version,stage:state.stage,plan,reservations,documents:docs,
     authority:'DEV_SYNTHETIC_SELF_REPORTED_NOT_REAL_WAREHOUSE',
     realWarehouseAuthority:false,productionRelease:{allowed:false}}};
   });
  },
  async execute({principal,request}){
   if(!devAllowed(principal))return reject('DEV_STOCK_DISABLED');
   if(!request||typeof request!=='object'||Array.isArray(request)||
      Object.keys(request).some(k=>!['orderId','requestId','expectedVersion','revisionId','type','payload'].includes(k))||
      !id(request.orderId)||!id(request.requestId)||!id(request.revisionId)||
      !Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<1||
      !Object.hasOwn(TYPES,request.type)||
      !request.payload||typeof request.payload!=='object'||Array.isArray(request.payload))
    return reject('INVALID_STOCK_REQUEST');
   let actor,input;
   try{actor=snapshot(principal);input=snapshot(request);}
   catch{return reject('INVALID_STOCK_REQUEST');}
   const kind=input.type,meta=TYPES[kind],p=input.payload;
   const allowedKeys=kind==='reserve'?['reference']:kind==='ship_batch'?
    ['reference','batchId','lines']:kind==='receive_batch'?
    ['reference','batchId','lines']:['reference'];
   if(Object.keys(p).some(k=>!allowedKeys.includes(k))||!nonempty(p.reference)||
      (kind.endsWith('_batch')&&(!id(p.batchId)||!Array.isArray(p.lines))))
    return reject('INVALID_STOCK_PAYLOAD');
   const orderId=input.orderId,scope={tenantId:actor.tenantId,orderId};
   return repository.withOrderTransaction(scope,async tx=>{
    const ctx=await context(tx,actor,orderId,meta.action);
    if(ctx.error)return ctx.error;
    if(ctx.auth.role!==meta.role)return reject('ROLE_FORBIDDEN');
    const s=ctx.state,rev=input.revisionId;
    if(input.expectedVersion!==s.version)return reject('STALE_ORDER_VERSION',{currentVersion:s.version});
    const plan=planFor(s,rev),factoryId=ctx.resource.factoryId;
    const requestHash=hash({tenantId:actor.tenantId,orderId,actorId:actor.subject,request:input});
    const old=await tx.stockQuery(\`SELECT document_id,request_hash FROM gaber_orders.dev_stock_documents
     WHERE tenant_id=$1 AND order_id=$2 AND request_id=$3\`,
     [actor.tenantId,orderId,input.requestId]);
    if(old.rowCount){
     if(old.rows[0].request_hash!==requestHash)return reject('STOCK_IDEMPOTENCY_CONFLICT');
     return {accepted:true,code:'STOCK_ALREADY_COMMITTED',
      documentId:old.rows[0].document_id,productionRelease:{allowed:false}};
    }
    if(kind==='ship_batch'||kind==='receive_batch'){
     const existing=await tx.stockQuery(`SELECT document_id FROM gaber_orders.dev_stock_documents
      WHERE tenant_id=$1 AND order_id=$2 AND kind=$3 AND batch_id=$4`,
      [actor.tenantId,orderId,kind,p.batchId]);
     if(existing.rowCount)return reject(kind==='ship_batch'?
       'STOCK_BATCH_ALREADY_SHIPPED':'STOCK_BATCH_ALREADY_RECEIVED');
    }
    let lines=[];
    const active=s.acceptedRevisionId===rev&&s.revisions.at(-1)?.id===rev;
    if(kind==='reserve'){
     if(!active||!['accepted','production','quality','ready'].includes(s.stage))
      return reject('STOCK_RESERVATION_STAGE');
     const previous=await fetchReservations(tx,actor,orderId,rev,true);
     if(previous.length)return reject('STOCK_ALREADY_RESERVED');
     lines=plan.lines.map(x=>({partRef:x.partRef,skuId:x.skuId,quantity:x.requiredQty}));
     // Lock in lexical SKU order to protect shared warehouse balance across
     // multiple orders and concurrent operators under SERIALIZABLE retries.
     for(const line of [...lines].sort((a,b)=>a.skuId.localeCompare(b.skuId,'en'))){
      const expected=plan.lines.find(x=>x.partRef===line.partRef);
      const q=await tx.stockQuery(\`SELECT part_ref AS "partRef",
         source_signature AS "sourceSignature",on_hand_qty AS "onHand",
         reserved_qty AS "reservedQty",supplier_sku AS "supplierSku"
        FROM gaber_orders.dev_stock_skus WHERE tenant_id=$1 AND factory_id=$2
         AND sku_id=$3 FOR UPDATE\`,
        [actor.tenantId,factoryId,line.skuId]);
      if(q.rowCount!==1)return reject('STOCK_SKU_NOT_SEEDED');
      const stock=q.rows[0];
      if(stock.partRef!==line.partRef||stock.sourceSignature.trim()!==expected.sourceSignature||
         stock.supplierSku!==null)return reject('STOCK_SKU_SOURCE_MISMATCH');
      if(stock.onHand-stock.reservedQty<line.quantity)return reject('STOCK_INSUFFICIENT');
     }
     for(const line of lines){
      await tx.stockQuery(\`UPDATE gaber_orders.dev_stock_skus SET reserved_qty=reserved_qty+$4
       WHERE tenant_id=$1 AND factory_id=$2 AND sku_id=$3\`,
       [actor.tenantId,factoryId,line.skuId,line.quantity]);
      await tx.stockQuery(\`INSERT INTO gaber_orders.dev_stock_reservations
       (tenant_id,order_id,revision_id,part_ref,factory_id,sku_id,required_qty,reserved_qty)
       VALUES($1,$2,$3,$4,$5,$6,$7,$7)\`,
       [actor.tenantId,orderId,rev,line.partRef,factoryId,line.skuId,line.quantity]);
     }
    }else if(kind==='ship_batch'){
     if(!active||s.stage!=='ready'||s.packout?.complete!==true||
        s.packout.revisionId!==rev)return reject('STOCK_SHIPMENT_STAGE');
     const reserves=await fetchReservations(tx,actor,orderId,rev,true);
     if(reserves.length!==plan.lines.length)return reject('STOCK_RESERVATION_REQUIRED');
     const byPart=Object.fromEntries(reserves.map(x=>[x.partRef,x.reservedQty-x.shippedQty]));
     lines=validateBatchPick(plan,p.lines,byPart);
     for(const line of [...lines].sort((a,b)=>a.skuId.localeCompare(b.skuId,'en'))){
      const locked=await tx.stockQuery(\`SELECT on_hand_qty AS "onHand",
       reserved_qty AS "reservedQty" FROM gaber_orders.dev_stock_skus
       WHERE tenant_id=$1 AND factory_id=$2 AND sku_id=$3 FOR UPDATE\`,
       [actor.tenantId,factoryId,line.skuId]);
      if(locked.rowCount!==1||locked.rows[0].reservedQty<line.quantity||
       locked.rows[0].onHand<line.quantity)return reject('STOCK_BALANCE_INVALID');
     }
     for(const line of lines){
      await tx.stockQuery(\`UPDATE gaber_orders.dev_stock_reservations
       SET shipped_qty=shipped_qty+$5 WHERE tenant_id=$1 AND order_id=$2
       AND revision_id=$3 AND part_ref=$4\`,
       [actor.tenantId,orderId,rev,line.partRef,line.quantity]);
      await tx.stockQuery(\`UPDATE gaber_orders.dev_stock_skus SET
       reserved_qty=reserved_qty-$4,on_hand_qty=on_hand_qty-$4
       WHERE tenant_id=$1 AND factory_id=$2 AND sku_id=$3\`,
       [actor.tenantId,factoryId,line.skuId,line.quantity]);
     }
    }else if(kind==='receive_batch'){
     if(!['ready','shipped','delivered'].includes(s.stage))
      return reject('STOCK_RECEIPT_STAGE');
     const shipped=await tx.stockQuery(\`SELECT d.document_id AS "documentId",
       d.revision_id AS "revisionId",l.part_ref AS "partRef",l.sku_id AS "skuId",
       l.quantity
       FROM gaber_orders.dev_stock_documents d JOIN
       gaber_orders.dev_stock_document_lines l ON
        l.tenant_id=d.tenant_id AND l.order_id=d.order_id
        AND l.document_id=d.document_id
       WHERE d.tenant_id=$1 AND d.order_id=$2 AND d.kind='ship_batch'
       AND d.batch_id=$3 ORDER BY l.part_ref\`,
       [actor.tenantId,orderId,p.batchId]);
     if(!shipped.rowCount||shipped.rows.some(x=>x.revisionId!==rev))
      return reject('STOCK_BATCH_NOT_FOUND');
     const result=validateIndependentBatchReceipt(shipped.rows,p.lines);
     lines=result.lines.map(x=>({
      partRef:x.partRef,skuId:x.skuId,quantity:x.receivedQty,
      damagedQty:x.damagedQty
     }));
    }else{
     // Cancel unused reservations only when the approved revision has been
     // withdrawn. No automatic reversal of previously shipped quantities.
     if(active)return reject('STOCK_RELEASE_ACTIVE_REVISION');
     const reserves=await fetchReservations(tx,actor,orderId,rev,true);
     if(!reserves.length)return reject('STOCK_RESERVATION_REQUIRED');
     lines=reserves.filter(x=>x.reservedQty>x.shippedQty)
       .map(x=>({partRef:x.partRef,skuId:x.skuId,
         quantity:x.reservedQty-x.shippedQty}));
     if(!lines.length)return reject('STOCK_NOTHING_TO_RELEASE');
     for(const line of [...lines].sort((a,b)=>a.skuId.localeCompare(b.skuId,'en'))){
      const locked=await tx.stockQuery(\`SELECT reserved_qty FROM gaber_orders.dev_stock_skus
       WHERE tenant_id=$1 AND factory_id=$2 AND sku_id=$3 FOR UPDATE\`,
       [actor.tenantId,factoryId,line.skuId]);
      if(locked.rowCount!==1||locked.rows[0].reserved_qty<line.quantity)
       return reject('STOCK_BALANCE_INVALID');
     }
     for(const line of lines){
      await tx.stockQuery(\`UPDATE gaber_orders.dev_stock_reservations
       SET reserved_qty=shipped_qty WHERE tenant_id=$1 AND order_id=$2
       AND revision_id=$3 AND part_ref=$4\`,
       [actor.tenantId,orderId,rev,line.partRef]);
      await tx.stockQuery(\`UPDATE gaber_orders.dev_stock_skus
       SET reserved_qty=reserved_qty-$4 WHERE tenant_id=$1
       AND factory_id=$2 AND sku_id=$3\`,
       [actor.tenantId,factoryId,line.skuId,line.quantity]);
     }
    }
    const documentId=input.requestId;
    await tx.stockQuery(\`INSERT INTO gaber_orders.dev_stock_documents
     (tenant_id,order_id,revision_id,document_id,request_id,request_hash,
      kind,batch_id,reference,actor_id,order_version)
     VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10)\`,
     [actor.tenantId,orderId,rev,documentId,requestHash,kind,p.batchId??null,
      p.reference,actor.subject,s.version]);
    for(const line of lines){
     await tx.stockQuery(\`INSERT INTO gaber_orders.dev_stock_document_lines
      (tenant_id,order_id,document_id,part_ref,sku_id,quantity,damaged_qty)
      VALUES($1,$2,$3,$4,$5,$6,$7)\`,
      [actor.tenantId,orderId,documentId,line.partRef,line.skuId,line.quantity,
       line.damagedQty??0]);
    }
    return {accepted:true,code:'DEV_STOCK_DOCUMENT_RECORDED',documentId,
     revisionId:rev,kind,batchId:p.batchId??null,
     authority:'DEV_SYNTHETIC_SELF_REPORTED_NOT_REAL_WAREHOUSE',
     productionRelease:{allowed:false}};
   });
  }
 };
}
