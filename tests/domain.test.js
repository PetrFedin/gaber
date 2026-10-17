import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,estimate,validate,normalize,csv,dimensions,families} from '../src/domain.js';
test('all families produce consistent BOM and margin',()=>{for(const f of families){const c=initialConfig(f.id),e=estimate(c);assert.equal(e.cost,e.rows.reduce((s,r)=>s+r.cost,0));assert.ok(e.price>e.cost);assert.ok(e.margin>=40);assert.equal(e.illustrative,true);}});
test('geometry and cost respond to configuration',()=>{const c=initialConfig(),e=estimate(c),large=estimate({...c,width:320});assert.ok(large.fabricMeters>e.fabricMeters);assert.ok(large.price>e.price);assert.equal(dimensions({...c,layout:'left'}).depth,165);});
test('reject impossible assemblies and unsafe input',()=>{assert.ok(validate({...initialConfig(),width:180,layout:'right'}).length);assert.ok(validate({...initialConfig(),width:NaN}).length);assert.equal(normalize({category:'foreign'}),null);assert.throws(()=>estimate({...initialConfig('chair'),layout:'left'}));assert.throws(()=>estimate(initialConfig(),-1));assert.throws(()=>estimate(initialConfig(),NaN));});
test('discount changes revenue and margin, never manufacturing cost',()=>{const a=estimate(initialConfig()),b=estimate(initialConfig(),15);assert.equal(a.cost,b.cost);assert.ok(b.margin<a.margin);assert.equal(b.requiresApproval,true);});
test('normalization strips arbitrary fields and rejects wrong options',()=>{const c=normalize({...initialConfig(),price:1,role:'admin'});assert.equal(c.price,undefined);assert.equal(c.role,undefined);assert.equal(normalize({...c,legs:'unknown'}),null);});
test('CSV escapes delimiters, quotations and spreadsheet formulas',()=>{assert.match(csv([['=HYPERLINK("x")','a;b']]),/"'=HYPERLINK\(""x""\)"/);});
