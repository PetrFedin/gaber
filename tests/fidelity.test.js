import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cushionGeometry,
  shapeCushion,
  applySag,
  maxSag,
  halton,
  tileSize,
  bumpStrength,
  LIGHT_PRESETS,
  QUALITY
} from '../src/fidelity.js';

const cushion = (puff = 0.03) => {
  const g = cushionGeometry(0.8, 0.22, 0.7, 0.08, 8);
  shapeCushion(g, {puff, tile: 0.1});
  return g;
};
// Высота верхней грани ближе всего к центру подушки.
const topCenter = (g) => {
  const pos = g.attributes.position;
  let best = -1,
    bestD = Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0.05) continue;
    const d = pos.getX(i) ** 2 + pos.getZ(i) ** 2;
    if (d < bestD) {
      bestD = d;
      best = pos.getY(i);
    }
  }
  return best;
};

test('подушка набухает по центру грани, но не больше заданной величины', () => {
  const flat = cushionGeometry(0.8, 0.22, 0.7, 0.08, 8);
  const puffy = cushion(0.03);
  assert.ok(topCenter(puffy) > topCenter(flat) + 0.025);
  const edge = (g) => {
    let m = -Infinity;
    for (let i = 0; i < g.attributes.position.count; i++) m = Math.max(m, g.attributes.position.getX(i));
    return m;
  };
  // Боковая грань тоже набухает, но не больше заданной величины.
  const growth = edge(puffy) - edge(flat);
  assert.ok(growth > 0.02 && growth <= 0.03 + 1e-3);
});

test('нормали остаются единичными, а UV считаются в метрах', () => {
  const g = cushion();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    assert.ok(Math.abs(len - 1) < 1e-3, `normal ${i}: ${len}`);
  }
  const uv = g.attributes.uv;
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    min = Math.min(min, uv.getX(i));
    max = Math.max(max, uv.getX(i));
  }
  // Ширина 0.8 м при повторе 0.1 м даёт около 8 повторов рисунка.
  assert.ok(max - min > 6 && max - min < 10);
});

test('просадка опускает центр сиденья и полностью возвращается', () => {
  const g = cushion();
  const mesh = new THREE.Mesh(g);
  const before = topCenter(g);
  applySag(mesh, 1);
  const sunk = topCenter(g);
  assert.ok(before - sunk > maxSag(0.22) * 0.8);
  assert.ok(before - sunk <= maxSag(0.22) + 1e-6);
  applySag(mesh, 0);
  assert.ok(Math.abs(topCenter(g) - before) < 1e-6);
});

test('просадка ограничена и не зависит от формы задним числом', () => {
  assert.ok(maxSag(0.1) <= 0.075 && maxSag(1) === 0.075);
});

test('последовательность Хэлтона лежит в [0,1) и не повторяется', () => {
  const seen = new Set();
  for (let i = 1; i <= 24; i++) {
    const v = halton(i, 2);
    assert.ok(v >= 0 && v < 1);
    seen.add(v);
  }
  assert.equal(seen.size, 24);
});

test('для каждого света и качества есть полные настройки', () => {
  for (const p of Object.values(LIGHT_PRESETS))
    for (const k of ['label', 'key', 'keyI', 'fill', 'fillI', 'hemi', 'ground', 'hemiI', 'env', 'exposure'])
      assert.ok(p[k] !== undefined, k);
  assert.deepEqual(Object.keys(LIGHT_PRESETS), ['day', 'evening', 'cool']);
  for (const q of Object.values(QUALITY)) assert.ok(q.segments > 1 && q.shadow >= 1024);
  assert.ok(QUALITY.high.segments > QUALITY.standard.segments);
  assert.ok(tileSize('boucle') > 0 && tileSize('unknown') > 0 && bumpStrength('unknown') > 0);
});
