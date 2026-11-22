/** Tenant-isolated PostgreSQL order journal; server-held pg Pool only. */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
export function createPostgresOrderRepository({pool}){
 if(typeof pool?.connect!=='function')throw TypeError('INVALID_DB_POOL');
 return {
 /** Read-only список идентификаторов заказов tenant под RLS; права на каждый заказ проверяет журнал. */
 async listOrderIds({tenantId,limit=50}){
  if(!id(tenantId)||!Number.isInteger(limit)||limit<1||limit>100)throw TypeError('INVALID_SCOPE');
  const c=await pool.connect();
  try{
   await c.query('BEGIN READ ONLY');
   await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
   const q=await c.query(`SELECT r.order_id FROM gaber_orders.order_resources r
    LEFT JOIN gaber_orders.order_heads h ON h.tenant_id=r.tenant_id AND h.order_id=r.order_id
    WHERE r.tenant_id=$1 ORDER BY h.updated_at DESC NULLS LAST,r.order_id LIMIT $2`,[tenantId,limit]);
   await c.query('COMMIT');
   return q.rows.map(r=>r.order_id);
  }catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}
  finally{c.release();}
 },
 async withOrderTransaction({tenantId,orderId},work){
  if(!id(tenantId)||!id(orderId)||typeof work!=='function')throw TypeError('INVALID_SCOPE');
  for(let attempt=0;attempt<3;attempt++){
   const c=await pool.connect();let started=false;
   try{
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');started=true;
    await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const key=[tenantId,orderId];
    const tx={
     /** Trusted parameterized stock SQL, same tenant-scoped serializable transaction. */
     async stockQuery(sql,params){
      if(typeof sql!=='string'||!Array.isArray(params))throw TypeError('INVALID_STOCK_QUERY');
      return c.query(sql,params);
     },
     async getResourceForUpdate(){
      const q=await c.query(`SELECT r.tenant_id AS "tenantId",r.order_id AS "orderId",
       r.client_id AS "clientId",r.brand_id AS "brandId",
       COALESCE(a.factory_id,r.factory_id) AS "factoryId",
       r.partner_ids AS "partnerIds"
       FROM gaber_orders.order_resources AS r
       LEFT JOIN gaber_orders.order_factory_assignments AS a
         ON a.tenant_id=r.tenant_id AND a.order_id=r.order_id
       WHERE r.tenant_id=$1 AND r.order_id=$2 FOR UPDATE OF r`,key);
      return q.rows[0]?{...q.rows[0],source:'server-repository'}:null;
     },
     async createResource({clientId}){
      if(!id(clientId))throw TypeError('INVALID_CUSTOMER');
      const q=await c.query(`INSERT INTO gaber_orders.order_resources
       (tenant_id,order_id,client_id) VALUES($1,$2,$3)
       ON CONFLICT(tenant_id,order_id) DO NOTHING RETURNING order_id`,
       [...key,clientId]);
      return q.rowCount===1;
     },
     async isFactoryApproved({factoryId}){
      if(!id(factoryId))return false;
      // Trusted organisation roster; scoped by the same tenant GUC and the
      // exact tenant key. The outer SERIALIZABLE transaction protects against
      // inconsistent acknowledgement/revocation snapshots.
      const q=await c.query(`SELECT factory_id FROM gaber_orders.factory_directory
       WHERE tenant_id=$1 AND factory_id=$2
         AND status='approved' AND verified_at IS NOT NULL LIMIT 1`,
       [tenantId,factoryId]);
      return q.rowCount===1;
     },
     async assignFactory({factoryId,assignedBy}){
      if(!id(factoryId)||!id(assignedBy))throw TypeError('INVALID_FACTORY_ASSIGNMENT');
      const q=await c.query(`INSERT INTO gaber_orders.order_factory_assignments
       (tenant_id,order_id,factory_id,assigned_by)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(tenant_id,order_id) DO NOTHING RETURNING factory_id`,
       [...key,factoryId,assignedBy]);
      return q.rowCount===1;
     },
     async ensureHead(){await c.query(`INSERT INTO gaber_orders.order_heads
      (tenant_id,order_id,version,head_hash) VALUES($1,$2,0,NULL)
      ON CONFLICT(tenant_id,order_id) DO NOTHING`,key);},
     async getHeadForUpdate(){
      const q=await c.query(`SELECT version,head_hash AS "headHash" FROM gaber_orders.order_heads
       WHERE tenant_id=$1 AND order_id=$2 FOR UPDATE`,key);
      return q.rows[0]??null;
     },
     async getEvents(){
      const q=await c.query(`SELECT seq,actor_id AS "actorId",request_id AS "requestId",
       request_hash AS "requestHash",previous_hash AS "previousHash",
       event_hash AS "eventHash",command FROM gaber_orders.order_events
       WHERE tenant_id=$1 AND order_id=$2 ORDER BY seq`,key);return q.rows;
     },
     async appendEvent(r){
      const q=await c.query(`INSERT INTO gaber_orders.order_events
       (tenant_id,order_id,seq,actor_id,request_id,request_hash,previous_hash,event_hash,command)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[...key,r.seq,r.actorId,r.requestId,r.requestHash,
       r.previousHash,r.eventHash,r.command]);
      if(q.rowCount!==1)throw Error('EVENT_INSERT_FAILED');
     },
     async advanceHead({expectedVersion,nextVersion,headHash}){
      const q=await c.query(`UPDATE gaber_orders.order_heads SET version=$3,head_hash=$4,
       updated_at=now() WHERE tenant_id=$1 AND order_id=$2 AND version=$5`,
       [...key,nextVersion,headHash,expectedVersion]);
      return q.rowCount===1;
     }
    };
    const result=await work(tx);
    await c.query('COMMIT');
    return result;
   }catch(e){
    if(started){try{await c.query('ROLLBACK');}catch(rollback){e.cause=rollback;throw e;}}
    if((e.code==='40001'||e.code==='40P01')&&attempt<2)continue;
    throw e;
   }finally{c.release();}
  }
 }};
}
