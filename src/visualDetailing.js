import * as THREE from 'three';

export const VISUAL_DETAIL_SCHEMA = 'gaber-procedural-visual-detail/1';
const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Adjust box-face UVs to repeat by physical model size, not by mesh count.
 * UVs are decorative preview data, not millimetre-accurate fabric cutting maps.
 * The six BoxGeometry / RoundedBoxGeometry material groups have separate vertices.
 */
export function applyPhysicalBoxUv(geometry, {widthM, heightM, depthM, tileMm}) {
  if (![widthM, heightM, depthM, tileMm].every(positive)) throw RangeError('INVALID_SURFACE_SCALE');
  const uv = geometry?.getAttribute?.('uv');
  const groups = geometry?.groups;
  if (!uv || !Array.isArray(groups) || groups.length !== 6) throw TypeError('BOX_UV_REQUIRED');
  const dims = [
    [depthM, heightM], [depthM, heightM],
    [widthM, depthM], [widthM, depthM],
    [widthM, heightM], [widthM, heightM]
  ];
  const before = Float32Array.from(uv.array);
  const index = geometry.getIndex();
  const seen = new Set();
  for (const group of groups) {
    const face = group.materialIndex;
    if (!Number.isInteger(face) || face < 0 || face > 5) throw TypeError('BOX_FACE_REQUIRED');
    const [faceW, faceH] = dims[face];
    for (let i = group.start; i < group.start + group.count; i++) {
      const vertex = index ? index.getX(i) : i;
      if (seen.has(vertex)) continue;
      seen.add(vertex);
      const u = before[vertex * 2], v = before[vertex * 2 + 1];
      uv.setXY(vertex, u * (faceW * 1000 / tileMm), v * (faceH * 1000 / tileMm));
    }
  }
  if (seen.size !== uv.count) throw Error('UNMAPPED_BOX_UV');
  uv.needsUpdate = true;
  geometry.userData.surfaceTileMm = tileMm;
  geometry.userData.previewOnly = true;
  return geometry;
}

export function applyPhysicalBolsterUv(geometry, {widthM, diameterM, tileMm}) {
  if (![widthM, diameterM, tileMm].every(positive)) throw RangeError('INVALID_BOLSTER_SURFACE');
  const uv = geometry.getAttribute('uv'), index = geometry.getIndex();
  const groups = geometry.groups;
  if (!uv || !Array.isArray(groups) || !groups.some((g) => g.materialIndex === 0)) {
    throw TypeError('CYLINDER_UV_REQUIRED');
  }
  const seen = new Set();
  // Side unrolls as circumference x cylinder height; caps span the diameter.
  for (const group of groups) {
    const side = group.materialIndex === 0;
    const uScale = (side ? Math.PI * diameterM : diameterM) * 1000 / tileMm;
    const vScale = (side ? widthM : diameterM) * 1000 / tileMm;
    for (let i = group.start; i < group.start + group.count; i++) {
      const vertex = index ? index.getX(i) : i;
      if (seen.has(vertex)) continue;
      seen.add(vertex);
      uv.setXY(vertex, uv.getX(vertex) * uScale, uv.getY(vertex) * vScale);
    }
  }
  uv.needsUpdate = true;
  geometry.userData.surfaceTileMm = tileMm;
  geometry.userData.previewOnly = true;
  return geometry;
}

export function roundedPerimeter(widthM, heightM, radiusM, steps = 12) {
  if (![widthM, heightM].every(positive) || !Number.isFinite(radiusM) ||
      radiusM < 0 || !Number.isInteger(steps) || steps < 2 || steps > 64) {
    throw RangeError('INVALID_TRIM_GEOMETRY');
  }
  const r = Math.min(radiusM, widthM / 2 - 0.0001, heightM / 2 - 0.0001);
  const halfW = widthM / 2, halfH = heightM / 2, points = [];
  const corners = [
    [halfW - r, halfH - r, 0],
    [-halfW + r, halfH - r, Math.PI / 2],
    [-halfW + r, -halfH + r, Math.PI],
    [halfW - r, -halfH + r, Math.PI * 1.5]
  ];
  for (const [cx, cy, offset] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = offset + i * Math.PI / (2 * steps);
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return points;
}

/**
 * True 3D decorative seam geometry: either stitches or raised piping.
 * Top and front faces use the same local-space outline.
 */
export function makeUpholsteryTrim({
  widthM, heightM, depthM, radiusM = 0.05,
  face = 'top', mode = 'single', color = '#6f6154', simplified = false
}) {
  if (![widthM, heightM, depthM].every(positive) || !['top', 'front'].includes(face) ||
      !['none', 'single', 'double', 'piping'].includes(mode)) throw RangeError('INVALID_TRIM_REQUEST');
  const group = new THREE.Group();
  group.name = 'GABER / decorative upholstery trim';
  group.userData = {detail: VISUAL_DETAIL_SCHEMA, mode, face, previewOnly: true};
  if (mode === 'none') return group;
  const faceH = face === 'top' ? depthM : heightM;
  const steps = simplified ? 4 : 12;
  const yOrZ = (face === 'top' ? heightM : depthM) / 2 + 0.001;
  const makePoints = (inset) => {
    const w = widthM - inset * 2, h = faceH - inset * 2;
    if (w <= 0.02 || h <= 0.02) return null;
    const coords = roundedPerimeter(w, h, Math.max(0.003, radiusM - inset), steps);
    return coords.map(([x, v]) => face === 'top'
      ? new THREE.Vector3(x, yOrZ, v)
      : new THREE.Vector3(x, v, yOrZ));
  };
  const insets = mode === 'double' ? [0.010, 0.018] : [0.008];
  for (const inset of insets) {
    const points = makePoints(inset);
    if (!points) continue;
    if (mode === 'piping') {
      const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, points.length * 2, 0.0032, simplified ? 4 : 8, true),
        new THREE.MeshStandardMaterial({color, roughness: 0.96})
      );
      mesh.userData = {detail: 'piping', previewOnly: true};
      group.add(mesh);
    } else {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([...points, points[0]]),
        new THREE.LineDashedMaterial({color, dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.9})
      );
      line.computeLineDistances();
      line.userData = {detail: 'stitches', previewOnly: true};
      group.add(line);
    }
  }
  return group;
}

export function createBolsterPillow({widthM, diameterM, material, threadColor = '#746457', tileMm = 100}) {
  if (![widthM, diameterM, tileMm].every(positive) || !material?.isMaterial) {
    throw TypeError('INVALID_BOLSTER');
  }
  const group = new THREE.Group();
  group.name = 'GABER / bolster cushion preview';
  group.userData = {detail: 'bolster', previewOnly: true};
  const radius = diameterM / 2;
  const geometry = applyPhysicalBolsterUv(
    new THREE.CylinderGeometry(radius, radius, widthM, 32, 1), {widthM, diameterM, tileMm}
  );
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.rotation.z = Math.PI / 2;
  cylinder.castShadow = cylinder.receiveShadow = true;
  cylinder.userData.part = 'pillow';
  group.add(cylinder);
  const endMaterial = new THREE.MeshStandardMaterial({color: threadColor, roughness: 1});
  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(radius - 0.007, radius * 0.8), 0.0025, 6, 32),
      endMaterial
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * (widthM / 2 - 0.003);
    ring.userData.previewOnly = true;
    group.add(ring);
  }
  return group;
}
