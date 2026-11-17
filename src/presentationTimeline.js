// Deterministic presentation timing for the existing exploded furniture view.
// This does NOT calculate forces, collisions, rigid-body dynamics, or safety.
export const PRESENTATION_STEP_SECONDS = 1 / 120;
export const PRESENTATION_SCHEMA = 'gaber-presentation-timeline/1';
const MAX_FRAME_SECONDS = 0.1;
const RESPONSE_PER_SECOND = 15;
const SNAP_EPSILON = 0.0005;

function validPosition(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function assertTimeline(state) {
  if (!state || !validPosition(state.value) || !validPosition(state.target) ||
      !Number.isFinite(state.accumulatorSeconds) || state.accumulatorSeconds < 0) {
    throw TypeError('INVALID_PRESENTATION_TIMELINE');
  }
}

export function createPresentationTimeline(initialValue = 0) {
  if (!validPosition(initialValue)) throw RangeError('INVALID_PRESENTATION_POSITION');
  return {schemaVersion: PRESENTATION_SCHEMA, value: initialValue, target: initialValue, accumulatorSeconds: 0};
}

export function setPresentationTarget(state, target) {
  assertTimeline(state);
  if (!validPosition(target)) throw RangeError('INVALID_PRESENTATION_POSITION');
  if (state.target !== target) {
    state.target = target;
    state.accumulatorSeconds = 0;
  }
  return state;
}

export function advancePresentationTimeline(state, deltaSeconds, {reducedMotion = false} = {}) {
  assertTimeline(state);
  if (typeof deltaSeconds !== 'number' || !Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw RangeError('INVALID_PRESENTATION_DELTA');
  }
  if (reducedMotion || Math.abs(state.target - state.value) <= SNAP_EPSILON) {
    state.value = state.target;
    state.accumulatorSeconds = 0;
    return state.value;
  }

  // A paused or hidden tab cannot advance the mechanism by a huge elapsed gap.
  const available = state.accumulatorSeconds + Math.min(deltaSeconds, MAX_FRAME_SECONDS);
  const steps = Math.min(12, Math.floor((available + 1e-12) / PRESENTATION_STEP_SECONDS));
  state.accumulatorSeconds = Math.max(0, available - steps * PRESENTATION_STEP_SECONDS);

  // Same number of physics-free presentation ticks regardless of render FPS.
  const blend = 1 - Math.exp(-RESPONSE_PER_SECOND * PRESENTATION_STEP_SECONDS);
  for (let i = 0; i < steps; i++) state.value += (state.target - state.value) * blend;
  if (Math.abs(state.target - state.value) <= SNAP_EPSILON) {
    state.value = state.target;
    state.accumulatorSeconds = 0;
  }
  return state.value;
}
