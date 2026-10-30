import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyExplosion, normalizeExplosion, ASSEMBLY_EXPLOSION_SCHEMA} from '../src/assemblyExplosion.js';

const mesh = (part, position, extra = {}) => {
  const item = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial());
  item.position.set(...position);
  item.userData = {part, ...extra};
  return item;
};

test('explosion amount is finite and bounded', () => {
  assert.equal(normalizeExplosion(-2), 0);
  assert.equal(normalizeExplosion(.42), .42);
  assert.equal(normalizeExplosion(4), 1);
  assert.throws(() => normalizeExplosion(NaN), /INVALID_EXPLOSION_AMOUNT/);
  assert.throws(() => normalizeExplosion('1'), /INVALID_EXPLOSION_AMOUNT/);
  assert.throws(() => applyExplosion(null, 1), /ASSEMBLY_MODEL_REQUIRED/);
});

test('assembled model preserves exact positions and room geometry', () => {
  const group = new THREE.Group();
  const filling = mesh('filling', [0, .4, 0], {sourceLayer: 'seat-core'});
  const room = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4), new THREE.MeshBasicMaterial());
  room.position.set(0, 1, -2);
  group.add(filling, room);
  applyExplosion(group, 0);
  assert.deepEqual(filling.position.toArray(), [0, .4, 0]);
  assert.deepEqual(room.position.toArray(), [0, 1, -2]);
  assert.equal(filling.userData.explosionSchema, ASSEMBLY_EXPLOSION_SCHEMA);
  assert.equal(room.userData.explosionOrigin, undefined);
});

test('seat layers separate vertically while supports remain below them', () => {
  const group = new THREE.Group();
  const core = mesh('filling', [0, .4, 0], {sourceLayer: 'seat-core'});
  const top = mesh('filling', [0, .5, 0], {sourceLayer: 'seat-top'});
  const support = mesh('support', [0, .3, 0]);
  const back = mesh('filling', [0, .8, -.4], {sourceLayer: 'back-foam'});
  group.add(core, top, support, back);
  applyExplosion(group, 1);
  assert.ok(core.position.y > .4);
  assert.ok(top.position.y > core.position.y);
  assert.ok(support.position.y < core.position.y);
  assert.ok(back.position.z < -.4);
});

test('repeated assembly cycles never accumulate transform drift', () => {
  const group = new THREE.Group();
  const arm = mesh('arm', [-1, .5, 0]);
  const pillow = mesh('pillow', [.2, .8, -.2]);
  group.add(arm, pillow);
  const initialArm = arm.position.toArray();
  const initialPillow = pillow.position.toArray();
  for (let index = 0; index < 50; index++) {
    applyExplosion(group, index / 49);
    applyExplosion(group, 0);
  }
  assert.deepEqual(arm.position.toArray(), initialArm);
  assert.deepEqual(pillow.position.toArray(), initialPillow);
});

test('untagged trim follows its parent and is not exploded independently', () => {
  const group = new THREE.Group();
  const seat = mesh('seat', [0, .45, 0]);
  const trim = new THREE.Group();
  trim.position.set(0, .06, 0);
  seat.add(trim);
  group.add(seat);
  applyExplosion(group, 1);
  assert.deepEqual(trim.position.toArray(), [0, .06, 0]);
  assert.deepEqual(seat.position.toArray(), [0, .75, .2]);
  assert.equal(trim.userData.explosionOrigin, undefined);
});
