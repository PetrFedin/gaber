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

function deformUpholsteryPoint(x, y, z, envelopeM, profile, surface, out) {
  const [widthM, heightM, depthM] = envelopeM;
  const halfW = widthM / 2, halfH = heightM / 2, halfD = depthM / 2;
  const shape = PROFILES[profile];
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
  out[0] = nextX; out[1] = nextY; out[2] = nextZ;
  return out;
}

function normalizeUpholsteryPoint(x, y, z, normalization, out) {
  const [centreX, centreY, centreZ] = normalization.centreM;
  const [scaleX, scaleY, scaleZ] = normalization.scale;
  const [widthM, heightM, depthM] = normalization.envelopeM;
  out[0] = (x - centreX) * widthM / scaleX;
  out[1] = (y - centreY) * heightM / scaleY;
  out[2] = (z - centreZ) * depthM / scaleZ;
  return out;
}

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
  const envelopeM = [widthM, heightM, depthM];
  const point = [0, 0, 0];

  for (let index = 0; index < position.count; index++) {
    deformUpholsteryPoint(
      position.getX(index), position.getY(index), position.getZ(index),
      envelopeM, profile, surface, point
    );
    position.setXYZ(index, point[0], point[1], point[2]);
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
  const normalization = {
    centreM: centre.toArray(),
    scale: size.toArray(),
    envelopeM
  };
  for (let index = 0; index < position.count; index++) {
    normalizeUpholsteryPoint(
      position.getX(index), position.getY(index), position.getZ(index),
      normalization, point
    );
    position.setXYZ(index, point[0], point[1], point[2]);
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
    envelopeM,
    normalization
  };
  return geometry;
}

/**
 * Applies the source cushion's exact warp to local-space seams and piping.
 * Shared geometries are processed once; simplified details need no conformance.
 */
export function conformUpholsteryDetail(detail, sourceGeometry) {
  const upholstery = sourceGeometry?.userData?.upholstery;
  const normalization = upholstery?.normalization;
  if (upholstery?.schemaVersion !== UPHOLSTERY_GEOMETRY_SCHEMA ||
      !Object.hasOwn(PROFILES, upholstery?.profile) ||
      !['generic', 'seat'].includes(upholstery?.surface) ||
      !Array.isArray(normalization?.centreM) || normalization.centreM.length !== 3 ||
      !normalization.centreM.every(Number.isFinite) ||
      !Array.isArray(normalization?.scale) || normalization.scale.length !== 3 ||
      !normalization.scale.every((value) => positive(value)) ||
      !Array.isArray(normalization?.envelopeM) || normalization.envelopeM.length !== 3 ||
      !normalization.envelopeM.every((value) => positive(value)) ||
      !detail?.traverse) {
    throw RangeError('INVALID_UPHOLSTERY_DETAIL_CONFORMANCE');
  }

  const geometries = new Set();
  const point = [0, 0, 0];
  detail.traverse((object) => {
    const geometry = object.geometry;
    const position = geometry?.getAttribute?.('position');
    if (!position || geometries.has(geometry)) return;
    geometries.add(geometry);
    for (let index = 0; index < position.count; index++) {
      deformUpholsteryPoint(
        position.getX(index), position.getY(index), position.getZ(index),
        normalization.envelopeM, upholstery.profile, upholstery.surface, point
      );
      normalizeUpholsteryPoint(point[0], point[1], point[2], normalization, point);
      position.setXYZ(index, point[0], point[1], point[2]);
    }
    position.needsUpdate = true;
    if (object.isMesh) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
  return detail;
}

export function upholsteryProfileFor({ shape, comfort }) {
  if (shape === 'linear' || comfort === 'firm') return 'tailored';
  if (shape === 'organic' || comfort === 'soft') return 'relaxed';
  return 'soft';
}
