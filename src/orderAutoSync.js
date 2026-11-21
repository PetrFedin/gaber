/** Safe, low-noise polling for authoritative order projections.
 * Do not replace any editable draft while the operator types.
 * A timer is a read optimisation, not a permission/security boundary.
 */
export const SERVER_ORDER_SYNC_MS=7000;
export function shouldSyncOrders({authenticated,busy=false,hidden=false,editing=false}){
 return Boolean(authenticated)&&!busy&&!hidden&&!editing;
}
export function sameOrderVersions(previous,next){
 if(!Array.isArray(previous)||!Array.isArray(next)||previous.length!==next.length)return false;
 const a=previous.map(o=>o.orderId+':'+o.version).sort();
 const b=next.map(o=>o.orderId+':'+o.version).sort();
 return a.every((value,i)=>value===b[i]);
}
