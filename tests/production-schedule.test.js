import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionSchedule, PRODUCTION_SCHEDULE_SCHEMA} from '../src/productionSchedule.js';
import {estimateLeadTime} from '../src/leadTime.js';

const sofa = {
  category: 'sofa',
  mechanism: 'none',
  storage: false,
  covers: 'fixed',
  charging: false,
  lamps: false
};

test('default schedule reconciles exactly with the client lead-time range', () => {
  const schedule = createProductionSchedule(sofa, 18.4);
  const lead = estimateLeadTime(sofa, 18.4);
  assert.equal(schedule.schemaVersion, PRODUCTION_SCHEDULE_SCHEMA);
  assert.equal(schedule.normsVersion, lead.normsVersion);
  assert.equal(schedule.minWorkingDays, 14);
  assert.equal(schedule.maxWorkingDays, 17);
  assert.deepEqual(schedule.stages.map(stage => [
    stage.id, stage.startWorkingDay, stage.endWorkingDay, stage.durationWorkingDays
  ]), [
    ['FACTORY_REVIEW_QUEUE', 1, 5, 5],
    ['PROCUREMENT', 6, 9, 4],
    ['PRODUCTION', 10, 13, 4],
    ['QUALITY_CONTROL', 14, 14, 1]
  ]);
  assert.equal(schedule.stages.reduce((sum, stage) => sum + stage.durationWorkingDays, 0), lead.minWorkingDays);
  assert.equal(schedule.uncertaintyReserve.workingDays, 3);
  assert.equal(schedule.uncertaintyReserve.endsAtWorkingDay, lead.maxWorkingDays);
  assert.equal(schedule.calendarDates, null);
  assert.equal(schedule.capacityStatus, 'unverified');
  assert.equal(schedule.productionReleaseAllowed, false);
});

test('selected options add work packages without inventing operation-level durations', () => {
  const schedule = createProductionSchedule({
    ...sofa,
    mechanism: 'recliner',
    storage: true,
    covers: 'removable',
    charging: true
  }, 28.1);
  const ids = schedule.workPackages.map(item => item.id);
  assert.ok(ids.includes('SUPPORT_SYSTEM'));
  assert.ok(ids.includes('MECHANISMS'));
  assert.ok(ids.includes('ELECTRICAL'));
  assert.ok(ids.includes('UPHOLSTERY'));
  assert.ok(schedule.workPackages.every(item => item.durationWorkingDays === null));
  assert.ok(schedule.workPackages.every(item => item.normStatus === 'factory_norm_required'));
  assert.ok(schedule.workPackages.find(item => item.id === 'UPHOLSTERY').label.includes('съёмных'));
  assert.equal(schedule.stages.find(stage => stage.id === 'PRODUCTION').durationWorkingDays, 9);
  assert.equal(schedule.minWorkingDays, estimateLeadTime({...sofa, mechanism: 'recliner', storage: true, covers: 'removable', charging: true}, 28.1).minWorkingDays);
});

test('all product families and boundary labour inputs retain contiguous bounded stages', () => {
  for (const category of ['sofa', 'chair', 'chairbed', 'bed', 'headboard']) {
    for (const hours of [0.1, 7, 500]) {
      const schedule = createProductionSchedule({...sofa, category}, hours);
      let previousEnd = 0;
      for (const stage of schedule.stages) {
        assert.equal(stage.startWorkingDay, previousEnd + 1);
        assert.ok(stage.durationWorkingDays > 0);
        assert.equal(stage.endWorkingDay, stage.startWorkingDay + stage.durationWorkingDays - 1);
        previousEnd = stage.endWorkingDay;
      }
      assert.equal(previousEnd, schedule.minWorkingDays);
      assert.ok(schedule.maxWorkingDays >= schedule.minWorkingDays);
      assert.ok(schedule.workPackages.some(item => item.id === 'FRAME_AND_PANELS'));
      assert.ok(schedule.workPackages.some(item => item.id === 'FINAL_ASSEMBLY'));
    }
  }
});

test('invalid schedule inputs fail closed through the shared lead-time contract', () => {
  for (const hours of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 501, '18']) {
    assert.throws(() => createProductionSchedule(sofa, hours), /INVALID_LEAD_TIME_INPUT/);
  }
  assert.throws(() => createProductionSchedule({...sofa, category: 'unknown'}, 10), /INVALID_LEAD_TIME_INPUT/);
  assert.throws(() => createProductionSchedule(null, 10), /INVALID_LEAD_TIME_INPUT/);
});
