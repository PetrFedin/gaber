import {createServer} from 'node:http';
const PATH=/^\/api\/v1\/orders\/([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})(\/commands)?$/;
const TOKEN=/^Bearer ([A-Za-z0-9_-]{32,256})$/;
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const output=(res,status,value)=>{res.writeHead(status,HEADERS);res.end(JSON.stringify({productionRelease:{allowed:false},...value}));};
async function parse(req){const chunks=[];let length=0;for await(const c of req){length+=c.length;if(length>65536)throw Object.assign(Error('BODY_TOO_LARGE'),{status:413});chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('INVALID_JSON'),{status:400});}}
export function createOrderHttpHandler({journal,resolveSession,readOrder,authorize,clock=Date.now}){
 if(typeof journal?.execute!=='function'||![resolveSession,readOrder,authorize,clock].every(x=>typeof x==='function'))throw TypeError('INVALID_HTTP_DEPS');
 return async(req,res)=>{
  try{
   if(req.url==='/health'&&req.method==='GET'){output(res,200,{status:'live',databaseVerified:false});return;}
   const path=new URL(req.url,'http://localhost');const match=path.pathname.match(PATH);
   if(!match||path.search){output(res,404,{code:'NOT_FOUND'});return;}
   const orderId=match[1],write=!!match[2];
   if((write&&req.method!=='POST')||(!write&&req.method!=='GET')){output(res,405,{code:'METHOD_NOT_ALLOWED'});return;}
   const token=typeof req.headers.authorization==='string'?req.headers.authorization.match(TOKEN):null;
   if(!token){output(res,401,{code:'SESSION_REQUIRED'});return;}
   const nowMs=clock();const principal=await resolveSession(token[1]);
   if(!Number.isSafeInteger(nowMs)||!principal||principal.authenticated!==true||
      principal.identitySource!=='server-session'||principal.sessionExpiresAtMs<=nowMs||
      !principal.tenantId||!principal.subject){output(res,401,{code:'SESSION_INVALID'});return;}
   if(!write){
    const found=await readOrder({tenantId:principal.tenantId,orderId});
    if(!found||found.resource?.tenantId!==principal.tenantId||
      found.resource?.orderId!==orderId||found.resource?.source!=='server-repository'){
      output(res,404,{code:'NOT_FOUND'});return;}
    if(!authorize({principal,resource:found.resource,action:'orders.read',nowMs}).allowed){
      output(res,403,{code:'FORBIDDEN'});return;}
    const state=found.summary??{};
    output(res,200,{ok:true,order:{id:orderId,version:state.version??0,stage:state.stage??null,revisionId:state.revisionId??null}});
    return;
   }
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){output(res,415,{code:'JSON_REQUIRED'});return;}
   const body=await parse(req);
   if(!body||typeof body!=='object'||Array.isArray(body)||['role','principal','actorId','orderId'].some(k=>Object.hasOwn(body,k))){
    output(res,400,{code:'UNTRUSTED_REQUEST_FIELD'});return;}
   const outcome=await journal.execute({principal,request:{orderId,...body}});
   if(outcome?.accepted){output(res,outcome.code==='ALREADY_COMMITTED'?200:201,{ok:true,code:outcome.code,version:outcome.version,eventSeq:outcome.eventSeq,stage:outcome.stage??null});return;}
   const code=outcome?.code??'ORDER_REJECTED',status=code==='STALE_ORDER_VERSION'||code==='IDEMPOTENCY_CONFLICT'?409:code==='EXTERNAL_AUTHORITY_REQUIRED'||code.includes('FORBIDDEN')?403:422;
   output(res,status,{code});
  }catch(e){output(res,e.status===400||e.status===413?e.status:503,{code:e.status===400||e.status===413?e.message:'SERVER_OPERATION_FAILED'});}
 };
}
export function createOrderHttpServer(deps){return createServer(createOrderHttpHandler(deps));}
