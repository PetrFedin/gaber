import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {FACTORY_SCRATCH_KEY,readFactoryScratch,writeFactoryScratch,
 clearFactoryScratch} from '../src/factoryScratch.js';
function session(){
 const d=new Map();
 return {getItem:key=>d.has(key)?d.get(key):null,
  setItem:(key,value)=>d.set(key,value),
  raw:(value)=>d.set(FACTORY_SCRATCH_KEY,value)};
}
test('v0.4.10: unsaved raw text survives component remount and different configurations',()=>{
 const s=session(),c=initialConfig(),other={...c,width:c.width+10};
 assert.equal(readFactoryScratch(c,s),null);
 writeFactoryScratch(c,'{"unfinished":',s);
 writeFactoryScratch(other,'{"different":',s);
 assert.equal(readFactoryScratch(c,s),'{"unfinished":');
 assert.equal(readFactoryScratch(other,s),'{"different":');
 writeFactoryScratch(c,'{"updated":',s);
 assert.equal(readFactoryScratch(c,s),'{"updated":');
 clearFactoryScratch(c,s);
 assert.equal(readFactoryScratch(c,s),null);
 assert.equal(readFactoryScratch(other,s),'{"different":');
});
test('v0.4.10: damaged session storage never gets overwritten silently',()=>{
 const s=session(),c=initialConfig();
 s.raw('{broken JSON');
 assert.throws(()=>writeFactoryScratch(c,'new text',s),/SCRATCH_CORRUPT/);
 assert.equal(s.getItem(FACTORY_SCRATCH_KEY),'{broken JSON');
});
test('v0.4.10: invalid storage quotas and oversized drafts fail closed',()=>{
 const c=initialConfig(),s=session();
 assert.throws(()=>writeFactoryScratch(c,'X'.repeat(513*1024),s),/SCRATCH_TEXT_TOO_LARGE/);
 s.setItem=()=>{throw Error('QuotaExceededError');};
 assert.throws(()=>writeFactoryScratch(c,'draft',s),/SCRATCH_WRITE_FAILED/);
});
