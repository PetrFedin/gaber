import test from 'node:test';
import assert from 'node:assert/strict';
import {LIGHT_PRESETS, getLightPreset} from '../src/visualLighting.js';

test('three source-attributed lighting profiles are available', () => {
  assert.deepEqual(Object.keys(LIGHT_PRESETS), ['day', 'evening', 'cool']);
  for (const name of Object.keys(LIGHT_PRESETS)) {
    const preset = getLightPreset(name);
    assert.equal(typeof preset.label, 'string');
    for (const property of ['keyI', 'fillI', 'hemiI', 'env', 'exposure']) {
      assert.ok(Number.isFinite(preset[property]) && preset[property] > 0);
    }
    for (const property of ['key', 'fill', 'hemi', 'ground']) {
      assert.match(preset[property], /^#[0-9a-f]{6}$/);
    }
    assert.ok(Object.isFrozen(preset));
  }
});

test('unknown lighting modes are rejected, never silently substituted', () => {
  assert.throws(() => getLightPreset('cinema'), /UNSUPPORTED_LIGHT_PRESET/);
  assert.throws(() => getLightPreset('__proto__'), /UNSUPPORTED_LIGHT_PRESET/);
  assert.throws(() => getLightPreset(undefined), /UNSUPPORTED_LIGHT_PRESET/);
});
