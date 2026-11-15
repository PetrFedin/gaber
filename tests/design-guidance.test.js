import test from 'node:test';
import assert from 'node:assert/strict';
import {families, initialConfig, validate} from '../src/domain.js';
import {getAvailableParts, getDesignAdvisories, getPartDescriptor} from '../src/designGuidance.js';

const ids = items => items.map(item => item.id);

test('every family exposes configuration-aware descriptions for all inspectable parts', () => {
  for (const family of families) {
    const config = initialConfig(family.id);
    const parts = getAvailableParts(config, true);
    assert.ok(parts.includes('frame'));
    assert.ok(parts.includes('filling'));
    for (const part of parts) {
      const detail = getPartDescriptor(config, part);
      assert.ok(detail, `${family.id}:${part}`);
      assert.equal(detail.id, part);
      assert.ok(detail.description.length > 40);
      assert.ok(detail.assemblyNote.length > 40);
      assert.doesNotMatch(JSON.stringify(detail), /NaN|undefined/);
    }
  }
});

test('descriptions follow selected dimensions, materials and options', () => {
  const base = initialConfig('sofa');
  const changed = {...base, width: 340, fabric: 'velvet', seatCore: 'pocket', seatHeight: 48, pillows: 3, pillowShape: 'bolster'};
  assert.match(getPartDescriptor(changed, 'seat').description, /Pocket Spring/);
  assert.match(getPartDescriptor(changed, 'seat').description, /48 см/);
  assert.match(getPartDescriptor(changed, 'pillow').description, /3 шт\./);
  assert.match(getPartDescriptor(changed, 'pillow').description, /валик/);
  assert.equal(getPartDescriptor(changed, 'unknown'), null);
  assert.equal(getAvailableParts(null).length, 0);
});

test('module-width guidance agrees with engineering review threshold', () => {
  const base = {...initialConfig('sofa'), width: 160, moduleCount: 3, arm: 'rounded'};
  assert.deepEqual(validate(base), []);
  const review = getDesignAdvisories(base).find(item => item.id === 'narrow-seat');
  assert.equal(review.severity, 'review');
  assert.match(review.explanation, /38,0 см/);
  const attention = getDesignAdvisories({...base, width: 210, moduleCount: 3}).find(item => item.id === 'narrow-seat');
  assert.equal(attention.severity, 'attention');
  assert.match(attention.recommendation, /Уменьшите число модулей/);
});

test('ergonomic and upholstery risks include a practical next step', () => {
  const config = {...initialConfig('chair'), seatHeight: 50, seatDepth: 65, pillowHeight: 60, fabric: 'leather', shape: 'organic'};
  const found = ids(getDesignAdvisories(config));
  assert.ok(found.includes('high-deep-seat'));
  assert.ok(!found.includes('pillow-depth'));
  assert.ok(found.includes('leather-soft-form'));
  for (const item of getDesignAdvisories(config)) assert.ok(item.recommendation.length > 40);
  const pillow = getDesignAdvisories({...config, seatDepth: 50});
  assert.ok(ids(pillow).includes('pillow-depth'));
});

test('moving covers, plinth clearance and electrics fail neither silently nor destructively', () => {
  const config = {...initialConfig('sofa'), covers: 'removable', mechanism: 'fold', legs: 'none', charging: true};
  const snapshot = structuredClone(config);
  const first = getDesignAdvisories(config);
  const second = getDesignAdvisories(config);
  assert.deepEqual(first, second);
  assert.deepEqual(config, snapshot);
  for (const id of ['moving-cover', 'plinth-clearance', 'integrated-electrics']) {
    assert.ok(ids(first).includes(id));
  }
});

test('arm-free seating rejects stranded built-in electrics', () => {
  const base = {...initialConfig('sofa'), arm: 'none', charging: true};
  assert.match(validate(base).join(' '), /требуют подлокотника/);
  assert.deepEqual(validate({...base, charging: false}), []);
  const headboard = {...initialConfig('headboard'), charging: true, lamps: true};
  assert.deepEqual(validate(headboard), []);
});
