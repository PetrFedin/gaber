export const ASSEMBLY_EXPLOSION_SCHEMA = 'gaber-assembly-explosion/1';

const SEAT_LAYERS = ['seat-pocket', 'seat-core', 'seat-hr35', 'seat-top', 'seat-periotek'];
const clamp = value => Math.min(1, Math.max(0, value));

export function normalizeExplosion(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw TypeError('INVALID_EXPLOSION_AMOUNT');
  }
  return clamp(value);
}

function layerIndex(id) {
  const index = SEAT_LAYERS.indexOf(id);
  return index < 0 ? 1 : index;
}

function directionFor(object, origin) {
  const part = object.userData.part;
  const side = origin.x < 0 ? -1 : 1;
  if (part === 'filling') {
    const layer = object.userData.sourceLayer || '';
    if (layer.startsWith('seat-')) {
      return {x: 0, y: 0.22 + layerIndex(layer) * 0.13, z: 0.12};
    }
    if (layer.startsWith('back-')) return {x: 0, y: 0.14, z: -0.38};
    return {x: 0, y: 0.12, z: 0.34};
  }
  if (part === 'support') return {x: 0, y: 0.17, z: 0.04};
  if (part === 'frame') return {x: Math.abs(origin.x) > 0.08 ? side * 0.09 : 0, y: 0, z: 0};
  if (part === 'seat') return {x: 0, y: 0.3, z: 0.2};
  if (part === 'back') return {x: 0, y: 0.18, z: -0.36};
  if (part === 'arm') return {x: side * 0.4, y: 0.1, z: 0};
  if (part === 'pillow') return {x: 0, y: 0.38, z: 0.32};
  if (part === 'legs') return {x: side * 0.12, y: 0, z: origin.z < 0 ? -0.1 : 0.1};
  return {x: 0, y: 0, z: 0};
}

/**
 * Moves only tagged furniture parts. Room geometry and untagged decorative
 * details stay attached to their parent. Original local transforms are kept
 * on each object, so repeated 0 → 1 → 0 transitions never accumulate drift.
 * This is a visual explanation of assembly order, not collision simulation.
 */
export function applyExplosion(model, value) {
  if (!model || typeof model.traverse !== 'function') throw TypeError('ASSEMBLY_MODEL_REQUIRED');
  const amount = normalizeExplosion(value);
  model.traverse(object => {
    if (!object.userData?.part || !object.position) return;
    if (!object.userData.explosionOrigin) {
      object.userData.explosionOrigin = object.position.toArray();
      object.userData.explosionSchema = ASSEMBLY_EXPLOSION_SCHEMA;
    }
    const origin = object.userData.explosionOrigin;
    const direction = directionFor(object, {
      x: origin[0], y: origin[1], z: origin[2]
    });
    object.position.set(
      origin[0] + direction.x * amount,
      origin[1] + direction.y * amount,
      origin[2] + direction.z * amount
    );
  });
  model.userData.explosionAmount = amount;
  return model;
}
