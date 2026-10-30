import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createUpholsteredGeometry, conformUpholsteryDetail, upholsteryProfileFor, UPHOLSTERY_GEOMETRY_SCHEMA } from '../src/upholsteryGeometry.js';

const envelope = (geometry) => {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return [size.x, size.y, size.z];
};
const closeEnvelope = (actual, expected) => actual.forEach((value, index) => {
  assert.ok(Math.abs(value - expected[index]) < 1e-6, `${value} != ${expected[index]}`);
});

test('soft upholstery preserves exact envelope, UVs and six material groups', () => {
  for (const expected of [[0.82, 0.14, 0.68], [0.7, 0.52, 0.2], [0.4, 0.35, 0.13]]) {
    const geometry = createUpholsteredGeometry({
      widthM: expected[0], heightM: expected[1], depthM: expected[2],
      radiusM: 0.06, profile: 'relaxed'
    });
    closeEnvelope(envelope(geometry), expected);
    assert.equal(geometry.groups.length, 6);
    assert.ok(geometry.getAttribute('uv')?.count > 0);
    assert.equal(geometry.userData.upholstery.schemaVersion, UPHOLSTERY_GEOMETRY_SCHEMA);
    assert.deepEqual(geometry.userData.upholstery.envelopeM, expected);
    for (const name of ['position', 'normal', 'uv']) {
      const array = geometry.getAttribute(name).array;
      assert.ok(array.every(Number.isFinite), `${name} contains a non-finite value`);
    }
    geometry.dispose();
  }
});

test('profiles and seat sag are deterministic and visibly change the mesh without randomness', () => {
  const input = { widthM: 0.82, heightM: 0.14, depthM: 0.68, segments: 6 };
  const tailored = createUpholsteredGeometry({ ...input, profile: 'tailored' });
  const relaxed = createUpholsteredGeometry({ ...input, profile: 'relaxed', surface: 'seat' });
  const repeated = createUpholsteredGeometry({ ...input, profile: 'relaxed', surface: 'seat' });
  assert.deepEqual(Array.from(relaxed.getAttribute('position').array), Array.from(repeated.getAttribute('position').array));
  assert.notDeepEqual(Array.from(tailored.getAttribute('position').array), Array.from(relaxed.getAttribute('position').array));
  assert.notDeepEqual(Array.from(tailored.getAttribute('uv').array), []);
  assert.deepEqual(Array.from(tailored.getAttribute('uv').array), Array.from(relaxed.getAttribute('uv').array));
  tailored.dispose(); relaxed.dispose(); repeated.dispose();
});

test('seams and piping inherit the exact cushion transform and shared geometry deforms once', () => {
  const input = { widthM: 0.82, heightM: 0.14, depthM: 0.68, radiusM: 0.06, segments: 6, profile: 'relaxed', surface: 'seat' };
  const radius = Math.min(input.radiusM, input.widthM / 3, input.heightM / 3, input.depthM / 3);
  const base = new RoundedBoxGeometry(input.widthM, input.heightM, input.depthM, input.segments, radius);
  const source = createUpholsteredGeometry(input);
  const original = base.getAttribute('position');
  const expected = source.getAttribute('position');
  const indices = [0, 17, 41];
  const detailGeometry = new THREE.BufferGeometry();
  detailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(indices.flatMap((index) => [
    original.getX(index), original.getY(index), original.getZ(index)
  ]), 3));
  const detail = new THREE.Group();
  detail.add(new THREE.Mesh(detailGeometry, new THREE.MeshBasicMaterial()));
  detail.add(new THREE.Mesh(detailGeometry, new THREE.MeshBasicMaterial()));
  conformUpholsteryDetail(detail, source);
  const actual = detailGeometry.getAttribute('position');
  indices.forEach((sourceIndex, detailIndex) => {
    for (const axis of ['x', 'y', 'z']) {
      const getter = `get${axis.toUpperCase()}`;
      assert.ok(Math.abs(actual[getter](detailIndex) - expected[getter](sourceIndex)) < 1e-6);
    }
  });
  assert.throws(() => conformUpholsteryDetail(detail, base), /INVALID_UPHOLSTERY_DETAIL_CONFORMANCE/);
  source.userData.upholstery.normalization.centreM[0] = Number.NaN;
  assert.throws(() => conformUpholsteryDetail(detail, source), /INVALID_UPHOLSTERY_DETAIL_CONFORMANCE/);
  base.dispose(); source.dispose(); detailGeometry.dispose();
});

test('thin, wide and high-detail upholstery keeps finite centred envelopes at boundary sizes', () => {
  for (const profile of ['tailored', 'soft', 'relaxed']) {
    for (const surface of ['generic', 'seat']) {
      for (const segments of [2, 12]) {
        for (const radiusM of [0, 0.5]) {
          for (const expected of [[0.05, 0.02, 0.03], [3.5, 0.08, 2.4]]) {
            const geometry = createUpholsteredGeometry({
              widthM: expected[0], heightM: expected[1], depthM: expected[2],
              radiusM, segments, profile, surface
            });
            closeEnvelope(envelope(geometry), expected);
            const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
            assert.ok(Math.abs(centre.x) + Math.abs(centre.y) + Math.abs(centre.z) < 1e-6);
            for (const name of ['position', 'normal', 'uv']) {
              assert.ok(geometry.getAttribute(name).array.every(Number.isFinite));
            }
            geometry.dispose();
          }
        }
      }
    }
  }
});

test('existing design controls map to stable upholstery profiles and invalid input fails closed', () => {
  assert.equal(upholsteryProfileFor({ shape: 'linear', comfort: 'soft' }), 'tailored');
  assert.equal(upholsteryProfileFor({ shape: 'rounded', comfort: 'firm' }), 'tailored');
  assert.equal(upholsteryProfileFor({ shape: 'rounded', comfort: 'balanced' }), 'soft');
  assert.equal(upholsteryProfileFor({ shape: 'organic', comfort: 'balanced' }), 'relaxed');
  assert.equal(upholsteryProfileFor({ shape: 'rounded', comfort: 'soft' }), 'relaxed');
  assert.throws(() => createUpholsteredGeometry({ widthM: 0, heightM: 0.2, depthM: 0.3 }), /INVALID_UPHOLSTERY_GEOMETRY/);
  assert.throws(() => createUpholsteredGeometry({ widthM: 1, heightM: 0.2, depthM: 0.3, profile: 'unknown' }), /INVALID_UPHOLSTERY_GEOMETRY/);
});
