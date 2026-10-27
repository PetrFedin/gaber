/** Tenant-isolated PostgreSQL order journal; server-held pg Pool only. */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
export function createPostgresOrderRepository({pool}){
 if(typeof pool?.connect!=='function')throw TypeError('INVALID_DB_POOL');
 return {async withOrderTransaction({tenantId,orderId},work){
  if(!id(tenantId)||!id(orderId)||typeof work!=='function')throw TypeError('INVALID_SCOPE');
  for(let attempt=0;attempt<3;attempt++){
   const c=await pool.connect();let started=false;
   try{
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');started=true;
    await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const key=[tenantId,orderId];
    const tx={
     async getResourceForUpdate(){
      const q=await c.query(`SELECT tenant_id AS "tenantId",order_id AS "orderId",
       client_id AS "clientId",brand_id AS "brandId",factory_id AS "factoryId",partner_ids AS "partnerIds"
       FROM gaber_orders.order_resources WHERE tenant_id=$1 AND order_id=$2 FOR UPDATE`,key);
      return q.rows[0]?{...q.rows[0],source:'server-repository'}:null;
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
