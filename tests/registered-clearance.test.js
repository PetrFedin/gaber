import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
import {registeredClearanceRefs,inspectRegisteredClearance} from '../src/registeredClearance.js';

for (const type of ['chairbed','bed','sofa']) {
  test(type+': production references match geometric inspector, manufacturing stays blocked', () => {
    const config=initialConfig(type);
    const pkg=createManufacturingPackage(config), refs=registeredClearanceRefs(pkg);
    assert.ok(refs.length>=2);
    const record=inspectRegisteredClearance(config,refs[0],refs.at(-1),5);
    assert.equal(record.movingRef,refs[0]);
    assert.equal(record.stationaryRef,refs.at(-1));
    assert.equal(record.productionRelease,'blocked-no-approved-kinematics-or-clearance-validation');
    assert.equal(record.manufacturingApproved,false);
    assert.equal(record.continuousCollisionDetection,false);
    assert.equal(record.inspectedPairs,1);
    assert.ok(['sample-clear','review-required'].includes(record.status));
  });
}

test('invalid and duplicate references do not become fabricated 3D part matches', () => {
  const config=initialConfig('chairbed');
  const refs=registeredClearanceRefs(createManufacturingPackage(config));
  assert.throws(()=>inspectRegisteredClearance(config,'forged',refs[0]),/CLEARANCE_UNKNOWN_PRODUCTION_REFERENCE/);
  assert.throws(()=>inspectRegisteredClearance(config,refs[0],refs[0]),/CLEARANCE_SAME_PRODUCTION_REFERENCE/);
  assert.throws(()=>inspectRegisteredClearance(config,refs[0],refs[1],-5),/CLEARANCE_INVALID_MARGIN_MM/);
});
