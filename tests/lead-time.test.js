import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateLeadTime,
  formatLeadTime,
  LEAD_TIME_SCHEMA,
  LEAD_TIME_NORMS_VERSION
} from '../src/leadTime.js';

const sofa = {
  category: 'sofa',
  mechanism: 'none',
  storage: false,
  covers: 'fixed',
  charging: false,
  lamps: false
};

test('default lead time is deterministic, transparent and explicitly indicative', () => {
  const result = estimateLeadTime(sofa, 18.4);
  assert.deepEqual(result, estimateLeadTime(sofa, 18.4));
  assert.equal(result.schemaVersion, LEAD_TIME_SCHEMA);
  assert.equal(result.normsVersion, LEAD_TIME_NORMS_VERSION);
  assert.equal(result.status, 'indicative');
  assert.equal(result.illustrative, true);
  assert.equal(result.startEvent, 'factory_order_acceptance');
  assert.equal(result.basis.productionWorkingDays, 4);
  assert.equal(result.minWorkingDays, 14);
  assert.equal(result.maxWorkingDays, 17);
  assert.equal(
    result.minWorkingDays,
    result.basis.queueWorkingDays + result.basis.procurementWorkingDays +
      result.basis.productionWorkingDays + result.basis.qualityControlWorkingDays
  );
  assert.equal(formatLeadTime(result), '14–17 рабочих дней');
  assert.ok(result.excludes.includes('delivery'));
});

test('labour and non-default options affect production days without changing fixed stages', () => {
  const base = estimateLeadTime(sofa, 18.4);
  const complex = estimateLeadTime({
    ...sofa,
    mechanism: 'recliner',
    covers: 'removable',
    charging: true
  }, 28.1);
  assert.equal(complex.basis.optionWorkingDays, 3);
  assert.equal(complex.basis.productionWorkingDays, 8);
  assert.equal(complex.basis.queueWorkingDays, base.basis.queueWorkingDays);
  assert.equal(complex.basis.procurementWorkingDays, base.basis.procurementWorkingDays);
  assert.ok(complex.minWorkingDays > base.minWorkingDays);
  assert.ok(complex.maxWorkingDays > base.maxWorkingDays);
});

test('all accepted product families retain bounded ranges and category minimums', () => {
  for (const [category, minimum] of Object.entries({ sofa: 4, chair: 2, chairbed: 4, bed: 5, headboard: 3 })) {
    const result = estimateLeadTime({ ...sofa, category }, 1);
    assert.equal(result.basis.productionWorkingDays, minimum);
    assert.ok(result.maxWorkingDays >= result.minWorkingDays);
    assert.ok(result.maxWorkingDays - result.minWorkingDays >= 3);
  }
});

test('invalid product or labour inputs and malformed display results fail closed', () => {
  assert.throws(() => estimateLeadTime({ ...sofa, category: 'unknown' }, 10), /INVALID_LEAD_TIME_INPUT/);
  for (const hours of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 501, '18']) {
    assert.throws(() => estimateLeadTime(sofa, hours), /INVALID_LEAD_TIME_INPUT/);
  }
  assert.throws(() => formatLeadTime(null), /INVALID_LEAD_TIME_RESULT/);
  assert.throws(() => formatLeadTime({ ...estimateLeadTime(sofa, 18.4), minWorkingDays: 0 }), /INVALID_LEAD_TIME_RESULT/);
});
