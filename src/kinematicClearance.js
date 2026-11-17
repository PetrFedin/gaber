import {OBB} from 'three/addons/math/OBB.js';
import {Box3} from 'three';

// Narrow-phase oriented bounding BOX proxy checks, sampled at explicit poses.
// NOT CCD, triangle-mesh BVH, measured compliance or manufacturing approval.
export const KINEMATIC_CLEARANCE_SCHEMA = 'gaber/kinematic-clearance/1';
const DEFAULT_SAMPLES = Object.freeze([0, .25, .5, .75, 1]);
const MAX_MESH_PAIRS = 4096;
const MAX_SAMPLE_COUNT = 129;

function requireObject(value, code) {
  if (!value || !value.isObject3D) throw TypeError(code);
}
function positiveGeometryBox(mesh) {
  const geom = mesh.geometry;
  if (!geom?.isBufferGeometry || !geom.attributes?.position || geom.attributes.position.count < 3) {
    throw TypeError('CLEARANCE_INVALID_GEOMETRY');
  }
  // Avoid trusting a cached bound on malformed / modified geometry.
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (![pos.getX(i), pos.getY(i), pos.getZ(i)].every(Number.isFinite)) {
      throw TypeError('CLEARANCE_NONFINITE_VERTEX');
    }
  }
  const localBox = new Box3().setFromBufferAttribute(pos);
  const size = localBox.getSize(mesh.position.clone());
  if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) {
    throw TypeError('CLEARANCE_DEGENERATE_ENVELOPE');
  }
  const obb = new OBB().fromBox3(localBox).applyMatrix4(mesh.matrixWorld);
  if (![obb.center.x, obb.center.y, obb.center.z, obb.halfSize.x, obb.halfSize.y, obb.halfSize.z].every(Number.isFinite)) {
    throw TypeError('CLEARANCE_INVALID_WORLD_TRANSFORM');
  }
  return obb;
}
function descendants(root) {
  const found = [];
  root.traverse(node => {if (node.isMesh) found.push(node);});
  if (!found.length) throw TypeError('CLEARANCE_MESH_REQUIRED');
  return found;
}
function isAncestor(ancestor, child) {
  for (let p = child; p; p = p.parent) if (p === ancestor) return true;
  return false;
}
function validMargin(marginMm) {
  if (!Number.isFinite(marginMm) || marginMm < 0 || marginMm > 100) {
    throw RangeError('CLEARANCE_INVALID_MARGIN_MM');
  }
}
function nameOf(node) {return node.userData?.partId || node.name || node.uuid;}

/**
 * Tests explicit moving/stationary scene mesh envelopes in world coordinates.
 * Physical gaps are unknown: results only classify OBB overlap / buffer-zone overlap.
 */
export function inspectPoseClearance({moving, stationary, marginMm = 0}) {
  requireObject(moving, 'CLEARANCE_MOVING_ROOT_REQUIRED');
  if (!Array.isArray(stationary) || !stationary.length) throw TypeError('CLEARANCE_STATIONARY_ROOTS_REQUIRED');
  validMargin(marginMm);
  const fixed = stationary.map(root => {
    requireObject(root, 'CLEARANCE_STATIONARY_OBJECT_REQUIRED');
    if (isAncestor(root, moving) || isAncestor(moving, root)) {
      throw RangeError('CLEARANCE_OVERLAPPING_ROOTS');
    }
    return root;
  });
  const activeMeshes = descendants(moving);
  const fixedMeshes = fixed.flatMap(descendants);
  if (activeMeshes.length * fixedMeshes.length > MAX_MESH_PAIRS) throw RangeError('CLEARANCE_PAIR_LIMIT');
  moving.updateWorldMatrix(true, true);
  for (const root of fixed) root.updateWorldMatrix(true, true);
  const activeOBB = activeMeshes.map(positiveGeometryBox);
  const fixedOBB = fixedMeshes.map(positiveGeometryBox);
  const pairs = [];
  for (let i = 0; i < activeMeshes.length; i++) {
    for (let j = 0; j < fixedMeshes.length; j++) {
      if (activeMeshes[i] === fixedMeshes[j]) throw RangeError('CLEARANCE_IDENTICAL_MESH');
      const hit = activeOBB[i].intersectsOBB(fixedOBB[j]);
      let status = hit ? 'overlap' : 'clear';
      if (!hit && marginMm > 0) {
        const a = activeOBB[i].clone(), b = fixedOBB[j].clone();
        const buffer = marginMm / 2000;
        a.halfSize.addScalar(buffer);
        b.halfSize.addScalar(buffer);
        if (a.intersectsOBB(b)) status = 'buffer-zone';
      }
      if (status !== 'clear') pairs.push({moving: nameOf(activeMeshes[i]), stationary: nameOf(fixedMeshes[j]), status});
    }
  }
  return {schemaVersion: KINEMATIC_CLEARANCE_SCHEMA, method: 'sampled-obb-proxy', marginMm,
    inspectedPairs: activeMeshes.length * fixedMeshes.length, status: pairs.length ? 'review-required' : 'sample-clear',
    issues: pairs, manufacturingApproved: false, continuousCollisionDetection: false};
}

/**
 * applyPose may update the moving ROOT's position/quaternion/scale only.
 * The original root transform is restored even when an inspection throws.
 */
export function inspectKinematicSweep({moving, stationary, applyPose, samples = DEFAULT_SAMPLES, marginMm = 0}) {
  requireObject(moving, 'CLEARANCE_MOVING_ROOT_REQUIRED');
  if (typeof applyPose !== 'function') throw TypeError('CLEARANCE_POSE_CALLBACK_REQUIRED');
  if (!Array.isArray(samples) || samples.length < 2 || samples.length > MAX_SAMPLE_COUNT ||
      samples[0] !== 0 || samples.at(-1) !== 1 ||
      samples.some((v,i) => !Number.isFinite(v) || v < 0 || v > 1 || (i > 0 && v <= samples[i-1]))) {
    throw RangeError('CLEARANCE_INVALID_SAMPLES');
  }
  validMargin(marginMm);
  const original = {position: moving.position.clone(), quaternion: moving.quaternion.clone(), scale: moving.scale.clone()};
  try {
    const frames = [];
    for (const progress of samples) {
      applyPose(progress, moving);
      frames.push({progress, ...inspectPoseClearance({moving, stationary, marginMm})});
    }
    return {schemaVersion: KINEMATIC_CLEARANCE_SCHEMA, method: 'sampled-obb-proxy', marginMm,
      frames, status: frames.some(frame => frame.status !== 'sample-clear') ? 'review-required' : 'sample-clear',
      manufacturingApproved: false, continuousCollisionDetection: false};
  } finally {
    moving.position.copy(original.position);
    moving.quaternion.copy(original.quaternion);
    moving.scale.copy(original.scale);
    moving.updateWorldMatrix(true, true);
  }
}
