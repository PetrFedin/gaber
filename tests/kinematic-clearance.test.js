import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {inspectPoseClearance, inspectKinematicSweep, KINEMATIC_CLEARANCE_SCHEMA} from '../src/kinematicClearance.js';
import {buildInspectionAssembly} from '../src/EngineeringAssembly.js';
import {initialConfig} from '../src/domain.js';

const box = (id, x = 0, width = 1) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(width, 1, 1), new THREE.MeshBasicMaterial());
  o.position.x = x; o.name = id; return o;
};

test('separated OBBs pass only the sampled proxy check, not manufacturing approval', () => {
  const result = inspectPoseClearance({moving: box('part', -3), stationary: [box('frame')]});
  assert.equal(result.schemaVersion, KINEMATIC_CLEARANCE_SCHEMA);
  assert.equal(result.status, 'sample-clear');
  assert.equal(result.manufacturingApproved, false);
  assert.equal(result.continuousCollisionDetection, false);
  assert.equal(result.inspectedPairs, 1);
});

test('actual oriented-box intersection produces auditable part names', () => {
  const m = box('movable', .2); m.rotation.z = Math.PI/4;
  const f = box('fixed');
  const result = inspectPoseClearance({moving: m, stationary: [f]});
  assert.equal(result.status, 'review-required');
  assert.deepEqual(result.issues, [{moving:'movable',stationary:'fixed',status:'overlap'}]);
});

test('positive buffer zone reports a shortfall without falsely calling physical penetration', () => {
  const m = box('m', 1.04), f = box('f');
  assert.equal(inspectPoseClearance({moving:m,stationary:[f]}).status,'sample-clear');
  const r = inspectPoseClearance({moving:m,stationary:[f],marginMm:50});
  assert.equal(r.issues[0].status,'buffer-zone');
  assert.equal(r.manufacturingApproved,false);
});

test('sweep detects intermediate collision and restores original transforms', () => {
  const moving=box('slide',-2), obstacle=box('obstacle',0,.5);
  const saved=moving.position.clone(), q=moving.quaternion.clone(), s=moving.scale.clone();
  const result=inspectKinematicSweep({moving,stationary:[obstacle],applyPose:(progress,obj)=>{
    obj.position.x=-2+4*progress;
    obj.rotation.z=progress*Math.PI/6;
  }});
  assert.equal(result.status,'review-required');
  assert.equal(result.frames.length,5);
  assert.equal(result.frames[2].issues[0].status,'overlap');
  assert.deepEqual(moving.position.toArray(), saved.toArray());
  assert.deepEqual(moving.quaternion.toArray(), q.toArray());
  assert.deepEqual(moving.scale.toArray(), s.toArray());
});

test('even an exception during sweep restores the moving root', () => {
  const moving=box('moving',-2), obstacle=box('obstacle',0);
  assert.throws(()=>inspectKinematicSweep({moving,stationary:[obstacle],applyPose:(progress,obj)=>{
    obj.position.x=progress*10;
    if(progress===.25)throw Error('broken pose');
  }}),/broken pose/);
  assert.equal(moving.position.x,-2);
});

test('invalid geometry, input, empty obstacles and overlapping roots fail closed', () => {
  const moving=box('m'),fixed=box('f');
  assert.throws(()=>inspectPoseClearance({moving,stationary:[]}),/CLEARANCE_STATIONARY_ROOTS_REQUIRED/);
  assert.throws(()=>inspectPoseClearance({moving,stationary:[moving]}),/CLEARANCE_OVERLAPPING_ROOTS/);
  assert.throws(()=>inspectPoseClearance({moving,stationary:[fixed],marginMm:-1}),/CLEARANCE_INVALID_MARGIN_MM/);
  const bad=box('bad');bad.geometry.attributes.position.setX(0,NaN);
  assert.throws(()=>inspectPoseClearance({moving:bad,stationary:[fixed]}),/CLEARANCE_NONFINITE_VERTEX/);
  assert.throws(()=>inspectKinematicSweep({moving,stationary:[fixed],applyPose:()=>{},samples:[0,0,1]}),/CLEARANCE_INVALID_SAMPLES/);
});

test('same API inspects real GABER assembly meshes with scene and part IDs', () => {
  const root=buildInspectionAssembly(initialConfig('chairbed'));
  const parts=[];root.traverse(x=>{if(x.isMesh&&x.userData.partId)parts.push(x);});
  assert.ok(parts.length>=2);
  const result=inspectPoseClearance({moving:parts[0],stationary:[parts.at(-1)]});
  assert.equal(result.inspectedPairs,1);
  assert.equal(result.manufacturingApproved,false);
  assert.ok(['sample-clear','review-required'].includes(result.status));
});
