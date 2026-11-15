import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {getEngineeringModel} from '../src/engineering.js';
import {planSeatingPreview, PREVIEW_LAYOUT_SCHEMA} from '../src/previewLayout.js';

test('seat upholstery preview is traceable to exact engineering stack and design height', () => {
  for (const category of ['sofa', 'chair', 'chairbed']) {
    for (const seatHeight of [40, 45, 52]) {
      const config = {...initialConfig(category), seatHeight};
      const p = planSeatingPreview(config), m = getEngineeringModel(config);
      assert.equal(p.schemaVersion, PREVIEW_LAYOUT_SCHEMA);
      assert.equal(p.seat.topM, seatHeight / 100);
      assert.ok(Math.abs(p.base.topM + p.seat.thicknessM - p.seat.topM) < 1e-9);
      assert.equal(p.seat.thicknessM * 1000, m.geometry.seatStackMm);
      assert.ok(p.base.heightM > 0 && p.seat.depthM > 0);
      assert.ok(p.back.centerYM + p.back.heightM / 2 <= config.height / 100 + 1e-9);
    }
  }
});
test('depth and back angle change preview; spring core preserves actual engineering stack envelope', () => {
  const c = initialConfig('sofa'), a = planSeatingPreview(c);
  const higher = planSeatingPreview({...c, seatHeight: 51});
  assert.ok(higher.seat.centerYM > a.seat.centerYM);
  const deep = planSeatingPreview({...c, seatDepth: 65});
  assert.ok(deep.seat.depthM > a.seat.depthM);
  const tilted = planSeatingPreview({...c, backLeanDeg: 20});
  assert.ok(Math.abs(tilted.back.leanRad) > Math.abs(a.back.leanRad));
  // Pocket Spring and foam variants both happen to be 140 mm in this concept.
  // Test exact source linkage, not a fabricated expectation of an increased height.
  const springConfig = {...c, seatCore: 'pocket'};
  const spring = planSeatingPreview(springConfig);
  assert.equal(spring.seat.thicknessM, getEngineeringModel(springConfig).geometry.seatStackMm / 1000);
  assert.equal(spring.seat.topM, a.seat.topM);
  assert.equal(planSeatingPreview(initialConfig('bed')), null);
  assert.equal(planSeatingPreview(initialConfig('headboard')), null);
});
