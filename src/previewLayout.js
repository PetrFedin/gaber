import {getEngineeringModel} from './engineering.js';

export const PREVIEW_LAYOUT_SCHEMA = 'gaber-upholstery-preview/1';

/**
 * A single visual seat stack derived from the engineering concept.
 * This is a proportion study, NOT measured foam compression or approved CAD.
 * All scene positions are metres; engineering stack measurements are millimetres.
 */
export function planSeatingPreview(config) {
  if (!['sofa', 'chair', 'chairbed'].includes(config?.category)) return null;
  const model = getEngineeringModel(config);
  const g = model.geometry;
  const topM = g.seatHeightCm / 100;
  const thicknessM = g.seatStackMm / 1000;
  const frameTopM = g.frameTopCm / 100;
  if (![topM, thicknessM, frameTopM].every((v) => Number.isFinite(v) && v > 0) ||
      Math.abs(topM - frameTopM - thicknessM) > 0.0001 ||
      frameTopM <= 0.15) throw Error('INVALID_SEATING_STACK');

  const depthM = config.depth / 100;
  // Preview cushioning may cover part of the back panel; usable seat depth
  // remains a separate design input, not a verified ergonomic dimension.
  const depthSeatM = Math.min(depthM - 0.06, (config.seatDepth + config.backDepth * 0.6) / 100);
  const frontM = depthM / 2 - 0.025;
  const backHeightM = config.height / 100 - topM + 0.04;
  const armTopM = topM + 0.18;
  return {
    schemaVersion: PREVIEW_LAYOUT_SCHEMA,
    engineeringSchema: model.schemaVersion,
    previewOnly: true,
    seat: {
      topM, thicknessM, centerYM: topM - thicknessM / 2,
      depthM: depthSeatM, centerZM: frontM - depthSeatM / 2
    },
    base: {
      topM: frameTopM, bottomM: 0.15,
      heightM: frameTopM - 0.15, centerYM: (frameTopM + 0.15) / 2
    },
    back: {
      heightM: backHeightM,
      centerYM: config.height / 100 - backHeightM / 2,
      centerZM: -depthM / 2 + config.backDepth / 200 + 0.02,
      leanRad: -config.backLeanDeg * Math.PI / 180
    },
    arm: {
      heightM: armTopM - 0.16,
      centerYM: (armTopM + 0.16) / 2,
      topM: armTopM
    }
  };
}
