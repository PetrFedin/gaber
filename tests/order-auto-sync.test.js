import test from 'node:test';
import assert from 'node:assert/strict';
import {SERVER_ORDER_SYNC_MS,shouldSyncOrders,sameOrderVersions} from '../src/orderAutoSync.js';
test('background and focused form entries never silently refresh protected orders',()=>{
 assert.equal(SERVER_ORDER_SYNC_MS,7000);
 for(const input of [
  {authenticated:false,busy:false,hidden:false,editing:false},
  {authenticated:true,busy:true,hidden:false,editing:false},
  {authenticated:true,busy:false,hidden:true,editing:false},
  {authenticated:true,busy:false,hidden:false,editing:true}
 ]) assert.equal(shouldSyncOrders(input),false);
 assert.equal(shouldSyncOrders({authenticated:true}),true);
});
test('unchanged versions preserve React action drafts even if read order changes',()=>{
 const v=[{orderId:'o1',version:2},{orderId:'o2',version:8}];
 assert.equal(sameOrderVersions(v,[{orderId:'o2',version:8},{orderId:'o1',version:2}]),true);
 assert.equal(sameOrderVersions(v,[{orderId:'o1',version:3},{orderId:'o2',version:8}]),false);
 assert.equal(sameOrderVersions(v,[{orderId:'o1',version:2}]),false);
 assert.equal(sameOrderVersions([],[]),true);
});
