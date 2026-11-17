// Lighting presets adapted from visual-fidelity/src/fidelity.js at commit 746015a.
// Screen preview only: no calibrated HDRI, real fabric measurements or colour proof.
export const LIGHT_PRESETS = Object.freeze({
  day: Object.freeze({
    label: 'День', key: '#fff4dd', keyI: 3.4, fill: '#e5edf7', fillI: 1.2,
    hemi: '#fff9ef', ground: '#a79c86', hemiI: 2.4, env: 1, exposure: 1.12
  }),
  evening: Object.freeze({
    label: 'Вечер', key: '#ffb877', keyI: 2.6, fill: '#6f84ad', fillI: 0.35,
    hemi: '#ffd9ab', ground: '#6d5a45', hemiI: 1, env: 0.45, exposure: 1.05
  }),
  cool: Object.freeze({
    label: 'Холодный', key: '#e9f2ff', keyI: 3.6, fill: '#dbe7ff', fillI: 1.5,
    hemi: '#eef4ff', ground: '#9aa3ad', hemiI: 2.6, env: 1, exposure: 1.1
  })
});

export function getLightPreset(name) {
  if (typeof name !== 'string' || !Object.hasOwn(LIGHT_PRESETS, name)) {
    throw RangeError('UNSUPPORTED_LIGHT_PRESET');
  }
  return LIGHT_PRESETS[name];
}
