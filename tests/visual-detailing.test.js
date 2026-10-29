import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  applyPhysicalBoxUv, applyPhysicalBolsterUv, roundedPerimeter, makeUpholsteryTrim, createBolsterPillow
} from '../src/visualDetailing.js';

function groupMaxUvs(g, face) {
  const attr = g.getAttribute('uv'), index = g.getIndex();
  const group = g.groups.find((v) => v.materialIndex === face);
  const verts = new Set();
  for (let i = group.start; i < group.start + group.count; i++) verts.add(index ? index.getX(i) : i);
  return [
    Math.max(...[...verts].map((v) => attr.getX(v))),
    Math.max(...[...verts].map((v) => attr.getY(v)))
  ];
}
test('physical fabric tile scale is uniform across different rectangular parts and faces', () => {
  for (const size of [[1, 0.14, 0.68], [0.7, 0.2, 0.3]]) {
    const g = applyPhysicalBoxUv(new RoundedBoxGeometry(...size, 4, 0.02), {
      widthM: size[0], heightM: size[1], depthM: size[2], tileMm: 100
    });
    assert.equal(g.userData.surfaceTileMm, 100);
    const front = groupMaxUvs(g, 4), side = groupMaxUvs(g, 0), top = groupMaxUvs(g, 2);
    assert.ok(Math.abs(front[0] - size[0] * 10) < 1e-4);
    assert.ok(Math.abs(front[1] - size[1] * 10) < 1e-4);
    assert.ok(Math.abs(side[0] - size[2] * 10) < 1e-4);
    assert.ok(Math.abs(top[1] - size[2] * 10) < 1e-4);
    g.dispose();
  }
  assert.throws(() => applyPhysicalBoxUv(new THREE.BoxGeometry(1, 1, 1), {
    widthM: 1, heightM: 1, depthM: 1, tileMm: 0
  }), /INVALID_SURFACE_SCALE/);
});
test('trim path is bounded, regular and supports actual piping versus dashed stitches', () => {
  const points = roundedPerimeter(0.7, 0.3, 0.05, 12);
  assert.equal(points.length, 52);
  assert.ok(points.every(([x, y]) => Math.abs(x) <= 0.35001 && Math.abs(y) <= 0.15001));
  const tube = makeUpholsteryTrim({
    widthM: 0.7, heightM: 0.14, depthM: 0.5, face: 'top', mode: 'piping'
  });
  assert.equal(tube.children.length, 1);
  assert.ok(tube.children[0].isMesh);
  const doubles = makeUpholsteryTrim({
    widthM: 0.7, heightM: 0.35, depthM: 0.2, face: 'front', mode: 'double'
  });
  assert.equal(doubles.children.length, 2);
  assert.ok(doubles.children.every((mesh) => mesh.isLine));
  const none = makeUpholsteryTrim({
    widthM: 0.7, heightM: 0.35, depthM: 0.2, mode: 'none'
  });
  assert.equal(none.children.length, 0);
  [tube, doubles].forEach((g) => g.traverse((o) => {o.geometry?.dispose();o.material?.dispose();}));
});
test('bolster has cylindrical geometry and repeatable millimetre-based surface scale', () => {
  const material = new THREE.MeshPhysicalMaterial({roughness: 0.9});
  const p = createBolsterPillow({widthM: 0.52, diameterM: 0.25, material, tileMm: 75});
  assert.equal(p.children.length, 3);
  assert.ok(p.children[0].geometry.type === 'CylinderGeometry');
  assert.equal(p.children[0].geometry.userData.surfaceTileMm, 75);
  assert.equal(p.children[0].userData.part, 'pillow');
  p.traverse((o) => o.geometry?.dispose());
  p.children[1].material.dispose();
  material.dispose();
  const cylinder = new THREE.CylinderGeometry(0.1, 0.1, 0.4);
  applyPhysicalBolsterUv(cylinder, {widthM: 0.4, diameterM: 0.2, tileMm: 80});
  cylinder.dispose();
});
