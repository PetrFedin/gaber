/**
 * PostgreSQL 17 adapter for GABER technical DOCUMENTATION review only.
 * Requires a server-owned pg Pool, and a factory ID verified by auth middleware.
 * Never expose this adapter or arbitrary SQL to a browser/RPC client.
 * No production release API is implemented.
 */
const identifier=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const named=x=>typeof x==='string'&&identifier.test(x);
const retryable=e=>e?.code==='40001'||e?.code==='40P01';
const MAX_ATTEMPTS=3;

export function createPostgresFactoryReviewRepository({pool,factoryId}){
  if(!pool||typeof pool.connect!=='function')throw new TypeError('INVALID_DB_POOL');
  if(!named(factoryId))throw new TypeError('INVALID_FACTORY_SCOPE');
  return Object.freeze({
    factoryId,
    async withSerializableTransaction(work){
      if(typeof work!=='function')throw new TypeError('INVALID_TRANSACTION_CALLBACK');
      for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
        const client=await pool.connect();
        let begun=false;
        try{
          await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
          begun=true;
          // RLS is defense-in-depth: every query ALSO uses explicit factory_id.
          // This trusted server role must never be exposed to client SQL execution.
          await client.query("SELECT set_config('app.factory_id', $1, true)",[factoryId]);
          const tx=Object.freeze({
            async getRevisionForUpdate(projectId,revisionId){
              if(!named(projectId)||!named(revisionId))throw new TypeError('INVALID_REVISION_ID');
              const result=await client.query(`
                SELECT project_id AS "projectId", revision_id AS "revisionId",
                       config_hash AS "configHash", bom_hash AS "bomHash",
                       cost_hash AS "costHash", state
                  FROM gaber_factory.revisions
                 WHERE factory_id=$1 AND project_id=$2 AND revision_id=$3
                 FOR UPDATE`,[factoryId,projectId,revisionId]);
              return result.rows[0]??null;
            },
            async getEvidenceForRevision(projectId,revisionId){
              if(!named(projectId)||!named(revisionId))throw new TypeError('INVALID_REVISION_ID');
              const result=await client.query(`
                SELECT envelope FROM gaber_factory.evidence
                 WHERE factory_id=$1 AND project_id=$2 AND revision_id=$3
                 ORDER BY kind, evidence_id`,[factoryId,projectId,revisionId]);
              return result.rows.map(row=>row.envelope);
            },
            async getTechnicalReviewByKey(requestId){
              if(!named(requestId))throw new TypeError('INVALID_REQUEST_ID');
              const result=await client.query(`
                SELECT review_id::text AS id, project_id AS "projectId",
                       revision_id AS "revisionId", reviewer_id AS "reviewerId",
                       config_hash AS "configHash", bom_hash AS "bomHash",
                       cost_hash AS "costHash"
                  FROM gaber_factory.technical_reviews
                 WHERE factory_id=$1 AND idempotency_key=$2`,[factoryId,requestId]);
              return result.rows[0]??null;
            },
            async insertImmutableTechnicalReview(event){
              if(!event||event.kind!=='TECHNICAL_REVIEW_ACCEPTED_NOT_RELEASED'||
                ![event.idempotencyKey,event.projectId,event.revisionId,event.reviewerId].every(named))
                throw new TypeError('INVALID_TECHNICAL_REVIEW_EVENT');
              const result=await client.query(`
                INSERT INTO gaber_factory.technical_reviews
                  (factory_id,idempotency_key,project_id,revision_id,reviewer_id,
                   config_hash,bom_hash,cost_hash,statement,signature,created_at_ms,kind)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                RETURNING review_id::text AS id`,[
                 factoryId,event.idempotencyKey,event.projectId,event.revisionId,
                 event.reviewerId,event.configHash,event.bomHash,event.costHash,
                 event.statement,event.signature,event.createdAtMs,event.kind
                ]);
              return result.rows[0]??null;
            }
          });
          const response=await work(tx);
          await client.query('COMMIT'); // success only after durable commit acknowledged
          return response;
        }catch(error){
          if(begun){
            try{await client.query('ROLLBACK');}
            catch(rollbackError){error.cause=rollbackError;throw error;}
          }
          if(retryable(error)&&attempt<MAX_ATTEMPTS)continue;
          throw error;
        }finally{client.release();}
      }
      throw new Error('SERIALIZABLE_RETRIES_EXHAUSTED');
    }
  });
}
