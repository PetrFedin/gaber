import {createServer} from 'node:http';
const PATH=/^\/api\/v1\/orders\/([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})(\/commands)?$/;
const TOKEN=/^Bearer ([A-Za-z0-9_-]{32,256})$/;
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const output=(res,status,value)=>{res.writeHead(status,HEADERS);res.end(JSON.stringify({productionRelease:{allowed:false},...value}));};
async function parse(req){
 const chunks=[];let length=0;
 for await(const c of req){
  length+=c.length;if(length>65536)throw Object.assign(Error('BODY_TOO_LARGE'),{status:413});
  chunks.push(c);
 }
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw Object.assign(Error('INVALID_JSON'),{status:400});}
}
const READ_MISSING=new Set(['RESOURCE_NOT_AUTHORIZED','RESOURCE_MEMBERSHIP_DENIED',
 'TENANT_SCOPE_MISMATCH','ORDER_MISSING','NO_AUTHORITATIVE_RESOURCE']);
const CLIENT_BAD=new Set(['INVALID_ORDER_REQUEST','INVALID_JSON_REQUEST',
 'COMMAND_UNKNOWN','UNTRUSTED_COMMAND_ROLE','PERSPECTIVE_MISMATCH','PERSPECTIVE_NOT_SUPPORTED']);
const FORBIDDEN=new Set(['ROLE_FORBIDDEN','MFA_REQUIRED','EXTERNAL_AUTHORITY_REQUIRED',
 'PARTNER_THREAD_NOT_ASSIGNED','PARTNER_THREAD_NOT_AVAILABLE',
 'LEGACY_PRIVATE_THREAD_REMOVED','MESSAGE_CHANNEL_FORBIDDEN']);
const VERSION_CONFLICT=new Set(['STALE_ORDER_VERSION','IDEMPOTENCY_CONFLICT','AMBIGUOUS_ROLE']);
function statusFor(code,read=false){
 if(code==='NO_VERIFIED_SESSION')return 401;
 if(READ_MISSING.has(code))return 404;
 if(VERSION_CONFLICT.has(code))return 409;
 if(FORBIDDEN.has(code))return 403;
 if(CLIENT_BAD.has(code))return 400;
 if(code==='ORDER_TRANSITION_REJECTED')return 422;
 return read?503:422;
}
/**
 * This HTTP adapter deliberately has NO parallel, user-supplied "readOrder"
 * projection. Both read and write run through the same authoritative journal.
 * resolveSession MUST be an independently verified, revocable server session.
 * It is NOT a login implementation; production remains HOLD.
 */
export function createOrderHttpHandler({journal,resolveSession,clock=Date.now}){
 if(typeof journal?.execute!=='function'||typeof journal?.read!=='function'||
    typeof resolveSession!=='function'||typeof clock!=='function')throw TypeError('INVALID_HTTP_DEPS');
 return async(req,res)=>{
  try{
   if(req.url==='/health'&&req.method==='GET'){output(res,200,{status:'live',databaseVerified:false});return;}
   const path=new URL(req.url,'http://localhost'),match=path.pathname.match(PATH);
   if(!match||path.search){output(res,404,{code:'NOT_FOUND'});return;}
   const orderId=match[1],write=!!match[2];
   if((write&&req.method!=='POST')||(!write&&req.method!=='GET')){
    output(res,405,{code:'METHOD_NOT_ALLOWED'});return;
   }
   const token=typeof req.headers.authorization==='string'?req.headers.authorization.match(TOKEN):null;
   if(!token){output(res,401,{code:'SESSION_REQUIRED'});return;}
   const nowMs=clock(),principal=await resolveSession(token[1]);
   if(!Number.isSafeInteger(nowMs)||nowMs<=0||!principal||
      principal.authenticated!==true||principal.identitySource!=='server-session'||
      !Number.isSafeInteger(principal.sessionExpiresAtMs)||principal.sessionExpiresAtMs<=nowMs||
      typeof principal.tenantId!=='string'||typeof principal.subject!=='string'){
    output(res,401,{code:'SESSION_INVALID'});return;
   }
   if(!write){
    // Access control before event read, replay, integrity check and role DTO are
    // all performed inside journal.read under a tenant-scoped transaction.
    const result=await journal.read({principal,request:{orderId}});
    if(!result?.accepted){
     const code=result?.code??'ORDER_READ_FAILED';
     output(res,statusFor(code,true),{code:READ_MISSING.has(code)?'ORDER_NOT_FOUND':code});return;
    }
    if(result.code!=='ORDER_READ'||result.order?.orderId!==orderId||
       result.order?.productionRelease?.allowed!==false)throw Error('INVALID_JOURNAL_READ_RESULT');
    output(res,200,{ok:true,order:result.order});return;
   }
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){
    output(res,415,{code:'JSON_REQUIRED'});return;
   }
   const body=await parse(req);
   if(!body||typeof body!=='object'||Array.isArray(body)||
      ['role','principal','actorId','orderId'].some(k=>Object.hasOwn(body,k))){
    output(res,400,{code:'UNTRUSTED_REQUEST_FIELD'});return;
   }
   const result=await journal.execute({principal,request:{orderId,...body}});
   if(result?.accepted){
    output(res,result.code==='ALREADY_COMMITTED'?200:201,{
     ok:true,code:result.code,version:result.version,eventSeq:result.eventSeq,stage:result.stage??null
    });return;
   }
   const code=result?.code??'ORDER_REJECTED';
   output(res,statusFor(code),{code:READ_MISSING.has(code)?'ORDER_NOT_FOUND':code});
  }catch(e){
   output(res,e.status===400||e.status===413?e.status:503,{
    code:e.status===400||e.status===413?e.message:'SERVER_OPERATION_FAILED'
   });
  }
 };
}
export function createOrderHttpServer(deps){return createServer(createOrderHttpHandler(deps));}
