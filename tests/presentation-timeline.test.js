import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENTATION_STEP_SECONDS, createPresentationTimeline,
  setPresentationTarget, advancePresentationTimeline
} from '../src/presentationTimeline.js';

function sampleAt(hz, seconds = 1) {
  const state = createPresentationTimeline();
  setPresentationTarget(state, 1);
  for (let frame = 0; frame < Math.round(hz * seconds); frame++) {
    advancePresentationTimeline(state, 1 / hz);
  }
  return state.value;
}

test('fixed presentation timestep is exactly 120 Hz', () => {
  assert.equal(PRESENTATION_STEP_SECONDS, 1 / 120);
});

test('position, target and frame inputs fail closed', () => {
  assert.throws(() => createPresentationTimeline(-0.1), /INVALID_PRESENTATION_POSITION/);
  assert.throws(() => createPresentationTimeline(NaN), /INVALID_PRESENTATION_POSITION/);
  assert.throws(() => setPresentationTarget(createPresentationTimeline(), 1.2), /INVALID_PRESENTATION_POSITION/);
  assert.throws(() => setPresentationTarget(createPresentationTimeline(), '0.4'), /INVALID_PRESENTATION_POSITION/);
  assert.throws(() => advancePresentationTimeline(createPresentationTimeline(), -1), /INVALID_PRESENTATION_DELTA/);
  assert.throws(() => advancePresentationTimeline(createPresentationTimeline(), Infinity), /INVALID_PRESENTATION_DELTA/);
  assert.throws(() => advancePresentationTimeline(null, 0), /INVALID_PRESENTATION_TIMELINE/);
});

test('presentation progress does not depend on 30/60/90/120 render FPS', () => {
  const reference = sampleAt(120);
  for (const hz of [30, 60, 90]) {
    assert.ok(Math.abs(sampleAt(hz) - reference) < 1e-10, String(hz));
  }
  assert.ok(reference > 0.99 && reference <= 1);
});

test('reduced motion snaps to target without animation', () => {
  const state = createPresentationTimeline();
  setPresentationTarget(state, 0.87);
  assert.equal(advancePresentationTimeline(state, 0, {reducedMotion: true}), 0.87);
  assert.equal(state.accumulatorSeconds, 0);
});

test('large elapsed gaps are bounded; reversal remains inside [0,1]', () => {
  const state = createPresentationTimeline();
  setPresentationTarget(state, 1);
  advancePresentationTimeline(state, 120);
  assert.ok(state.value < 0.9, 'one suspended frame cannot finish motion');
  setPresentationTarget(state, 0);
  for (let i = 0; i < 120; i++) advancePresentationTimeline(state, 1 / 60);
  assert.equal(state.value, 0);
  assert.equal(state.accumulatorSeconds, 0);
});
