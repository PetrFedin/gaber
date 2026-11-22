/**
 * Narrow DEV-only stock endpoint; httpOnly cookie becomes independently
 * authenticated session. Not a public catalog or real warehouse API.
 */
const PATH=/^\/api\/v1\/orders\/([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})\/dev-stock(\/commands)?$/;
const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff'};
const write=(res,status,data)=>{res.writeHead(status,HEAD);
 res.end(JSON.stringify({productionRelease:{allowed:false},...data}));};
const codeStatus=code=>code==='NO_VERIFIED_SESSION'?401:
 ['RESOURCE_NOT_AUTHORIZED','ORDER_MISSING','RESOURCE_MEMBERSHIP_DENIED'].includes(code)?404:
 ['ROLE_FORBIDDEN','MFA_REQUIRED','FACTORY_NOT_APPROVED'].includes(code)?403:
 ['STALE_ORDER_VERSION','STOCK_INSUFFICIENT','STOCK_IDEMPOTENCY_CONFLICT',
  'STOCK_BATCH_ALREADY_RECEIVED','STOCK_BATCH_ALREADY_SHIPPED'].includes(code)?409:
 ['DEV_STOCK_DISABLED','STOCK_SERVICE_UNAVAILABLE'].includes(code)?503:
 ['INVALID_STOCK_REQUEST','INVALID_STOCK_PAYLOAD'].includes(code)?400:422;
async function jsonBody(req){
 let chunks=[],size=0;
 for await(const chunk of req){
  size+=chunk.length;if(size>65536)throw Object.assign(Error('BODY_TOO_LARGE'),{status:413});
  chunks.push(chunk);
 }
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw Object.assign(Error('INVALID_JSON'),{status:400});}
}
export function createDevStockHttpHandler({service,resolveSession}){
 if(typeof resolveSession!=='function')throw TypeError('INVALID_STOCK_HTTP_DEPS');
 return async(req,res)=>{
  const path=new URL(req.url,'http://localhost');
  const m=path.pathname.match(PATH);if(!m)return false;
  if(path.search){write(res,404,{code:'NOT_FOUND'});return true;}
  const orderId=m[1],commands=!!m[2];
  if((commands&&req.method!=='POST')||(!commands&&req.method!=='GET')){
   write(res,405,{code:'METHOD_NOT_ALLOWED'});return true;
  }
  if(!service){write(res,503,{code:'STOCK_SERVICE_UNAVAILABLE'});return true;}
  const token=String(req.headers.authorization??'').match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  const principal=token?await resolveSession(token):null;
  if(!principal){write(res,401,{code:'SESSION_REQUIRED'});return true;}
  try{
   let result;
   if(!commands)result=await service.read({principal,orderId});
   else{
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){
     write(res,415,{code:'JSON_REQUIRED'});return true;
    }
    const body=await jsonBody(req);
    if(!body||typeof body!=='object'||Array.isArray(body)||
      ['principal','role','actorId','tenantId','orderId'].some(k=>Object.hasOwn(body,k))){
      write(res,400,{code:'UNTRUSTED_REQUEST_FIELD'});return true;
    }
    result=await service.execute({principal,request:{orderId,...body}});
   }
   if(!result?.accepted){
    const code=result?.code??'STOCK_REJECTED';
    write(res,codeStatus(code),{code});return true;
   }
   write(res,commands?(result.code==='STOCK_ALREADY_COMMITTED'?200:201):200,
    {ok:true,...result});return true;
  }catch(e){
   write(res,e.status===413||e.status===400?e.status:503,
    {code:e.status===413||e.status===400?e.message:'STOCK_OPERATION_FAILED'});
   return true;
  }
 };
}
