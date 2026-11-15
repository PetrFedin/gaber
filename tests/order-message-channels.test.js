import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ORDER_MESSAGE_CHANNELS,normalizeOrderMessageChannel,
 canAccessOrderMessageChannel,visibleOrderMessages
} from '../src/orderMessageChannels.js';

test('exactly three scopes, never an extra role',()=>{
 assert.deepEqual(ORDER_MESSAGE_CHANNELS,['shared','client_partner','factory_partner']);
 assert.equal(Object.isFrozen(ORDER_MESSAGE_CHANNELS),true);
 assert.equal(normalizeOrderMessageChannel(undefined),'shared');
 for(const invalid of [null,'','unknown','client_factory',{},0]){
  assert.equal(normalizeOrderMessageChannel(invalid),null);
 }
});
test('client/factory bilateral privacy and operator sees both',()=>{
 const matrix={
  client:['shared','client_partner'],
  factory:['shared','factory_partner'],
  partner:['shared','client_partner','factory_partner']
 };
 for(const role of Object.keys(matrix)){
  for(const channel of ORDER_MESSAGE_CHANNELS)
   assert.equal(canAccessOrderMessageChannel(role,channel),
    matrix[role].includes(channel),role+':'+channel);
 }
 for(const role of ['brand','owner','technologist',''])
  assert.equal(canAccessOrderMessageChannel(role,'shared'),false);
 for(const role of Object.keys(matrix))
  assert.equal(canAccessOrderMessageChannel(role,'internal_only'),false);
});
test('server-safe filtering preserves order, shares legacy messages only',()=>{
 const messages=[
  {note:'Legacy note'},
  {note:'Private client question',channel:'client_partner'},
  {note:'Factory cost negotiation',channel:'factory_partner'},
  {note:'Three-party status',channel:'shared'},
  {note:'Unknown channel must not leak',channel:'UNKNOWN'}
 ];
 assert.deepEqual(visibleOrderMessages(messages,'client').map(x=>x.note),
  ['Legacy note','Private client question','Three-party status']);
 assert.deepEqual(visibleOrderMessages(messages,'factory').map(x=>x.note),
  ['Legacy note','Factory cost negotiation','Three-party status']);
 assert.deepEqual(visibleOrderMessages(messages,'partner').map(x=>x.note),
  ['Legacy note','Private client question','Factory cost negotiation','Three-party status']);
 assert.throws(()=>visibleOrderMessages({},'client'),/INVALID_ORDER_MESSAGE_PROJECTION/);
 assert.throws(()=>visibleOrderMessages(messages,'owner'),/INVALID_ORDER_MESSAGE_PROJECTION/);
});
