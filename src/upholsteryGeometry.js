import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const UPHOLSTERY_GEOMETRY_SCHEMA = 'gaber-soft-upholstery-geometry/1';

const PROFILES = Object.freeze({
  tailored: Object.freeze({ bulge: 0.008, crown: 0.006, sag: 0 }),
  soft: Object.freeze({ bulge: 0.034, crown: 0.032, sag: 0.008 }),
  relaxed: Object.freeze({ bulge: 0.062, crown: 0.052, sag: 0.016 })
});

const positive = (value, limit = 10) =>
  Number.isFinite(value) && value > 0 && value <= limit;
const clamp = (value) => Math.max(-1, Math.min(1, value));
const smoothFace = (a, b) => Math.max(0, (1 - a * a) * (1 - b * b));

/**
 * Deforms Three's rounded-box topology into a restrained upholstered form.
 * The final mesh is normalised back to the requested engineering envelope.
 * UVs and six material groups are preserved for physical fabric mapping.
 */
export function createUpholsteredGeometry({
  widthM,
  heightM,
  depthM,
  radiusM = 0.06,
  segments = 6,
  profile = 'soft',
  surface = 'generic'
}) {
  if (![widthM, heightM, depthM].every((value) => positive(value)) ||
      !Number.isFinite(radiusM) || radiusM < 0 ||
      !Number.isInteger(segments) || segments < 2 || segments > 12 ||
      !Object.hasOwn(PROFILES, profile) || !['generic', 'seat'].includes(surface)) {
    throw RangeError('INVALID_UPHOLSTERY_GEOMETRY');
  }

  const radius = Math.min(radiusM, widthM / 3, heightM / 3, depthM / 3);
  const geometry = new RoundedBoxGeometry(widthM, heightM, depthM, segments, radius);
  const position = geometry.getAttribute('position');
  const halfW = widthM / 2, halfH = heightM / 2, halfD = depthM / 2;
  const shape = PROFILES[profile];

  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const nx = clamp(x / halfW), ny = clamp(y / halfH), nz = clamp(z / halfD);
    const sideX = smoothFace(ny, nz) * Math.abs(nx);
    const sideZ = smoothFace(nx, ny) * Math.abs(nz);
    const horizontal = smoothFace(nx, nz) * Math.abs(ny);

    let nextX = x + Math.sign(x) * halfW * shape.bulge * sideX;
    let nextY = y + Math.sign(y) * halfH * shape.crown * horizontal;
    let nextZ = z + Math.sign(z) * halfD * shape.bulge * 0.72 * sideZ;

    if (surface === 'seat' && ny > 0 && shape.sag > 0) {
      const centre = Math.exp(-2.4 * (nx * nx + nz * nz));
      nextY -= heightM * shape.sag * centre * ny;
    }

    position.setXYZ(index, nextX, nextY, nextZ);
  }

  // Organic shaping must never silently change the configured overall size.
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  if (![size.x, size.y, size.z].every((value) => positive(value))) {
    geometry.dispose();
    throw Error('UPHOLSTERY_ENVELOPE_COLLAPSED');
  }
  for (let index = 0; index < position.count; index++) {
    position.setXYZ(
      index,
      (position.getX(index) - centre.x) * widthM / size.x,
      (position.getY(index) - centre.y) * heightM / size.y,
      (position.getZ(index) - centre.z) * depthM / size.z
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.upholstery = {
    schemaVersion: UPHOLSTERY_GEOMETRY_SCHEMA,
    profile,
    surface,
    previewOnly: true,
    envelopeM: [widthM, heightM, depthM]
  };
  return geometry;
}

export function upholsteryProfileFor({ shape, comfort }) {
  if (shape === 'linear' || comfort === 'firm') return 'tailored';
  if (shape === 'organic' || comfort === 'soft') return 'relaxed';
  return 'soft';
}
