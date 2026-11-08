import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {
  LIGHT_PRESETS,
  QUALITY,
  fabricMaps,
  tileSize,
  bumpStrength,
  shapeCushion,
  cushionGeometry,
  applySag,
  maxSag,
  mannequin,
  fitDistance,
  halton
} from './fidelity.js';
import {getColor, getFabric, colors} from './domain.js';

function release(group) {
  const gs = new Set(),
    ms = new Set(),
    ts = new Set();
  group.traverse((o) => {
    if (o.geometry) gs.add(o.geometry);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.filter(Boolean).forEach((m) => {
      ms.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) ts.add(v);
    });
  });
  for (const m of group.userData.materials || []) {
    ms.add(m);
    for (const v of Object.values(m)) if (v?.isTexture) ts.add(v);
  }
  gs.forEach((x) => x.dispose());
  ms.forEach((x) => x.dispose());
  ts.forEach((x) => x.dispose());
}
function furniture(config, simplified = false, opts = {}) {
  const group = new THREE.Group(),
    col = getColor(config),
    fab = getFabric(config),
    maps = fabricMaps(fab.texture, opts.anisotropy || 4),
    bump = maps.bump;
  const cloth = new THREE.MeshPhysicalMaterial({
    color: col.hex,
    roughness: fab.roughness,
    metalness: 0,
    sheen: fab.sheen,
    sheenColor: new THREE.Color(col.hex).lerp(new THREE.Color('#ffffff'), 0.22),
    sheenRoughness: 0.8,
    map: maps.albedo,
    bumpMap: bump,
    bumpScale: bumpStrength(fab.texture)
  });
  const darker = cloth.clone();
  darker.color.multiplyScalar(0.9);
  const zone = (id) => {
    const m = cloth.clone(),
      color = colors.find((x) => x.id === id);
    if (color) m.color.set(color.hex);
    return m;
  };
  const seatCloth = zone(config.seatColor),
    backCloth = zone(config.backColor),
    armCloth = zone(config.armColor);
  group.userData.materials = [cloth, darker, seatCloth, backCloth, armCloth];
  let uvSeed = 7;
  const seedRand = () => {
    uvSeed = (uvSeed * 1664525 + 1013904223) >>> 0;
    return uvSeed / 4294967296;
  };
  const timber = new THREE.MeshStandardMaterial({color: '#876345', roughness: 0.75});
  const radius = config.shape === 'linear' ? 0.025 : config.shape === 'organic' ? 0.16 : 0.08;
  const wood = new THREE.MeshStandardMaterial({
    color: config.legs === 'wood' ? '#785339' : config.legs === 'black' ? '#343531' : '#9c7b43',
    roughness: config.legs === 'brass' ? 0.3 : 0.65,
    metalness: config.legs === 'wood' ? 0 : 0.65
  });
  const pipingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(col.hex).multiplyScalar(0.82),
    roughness: 0.85
  });
  group.userData.materials.push(pipingMat);
  const seamMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(col.hex).multiplyScalar(0.73),
    transparent: true,
    opacity: 0.48
  });
  const box = (w, h, d, x, y, z, material = cloth, r = 0.08, part = 'seat') => {
    const rad = Math.min(
        config.shape === 'linear' ? 0.02 : config.shape === 'organic' ? r * 1.5 : r,
        w / 3,
        h / 3,
        d / 3
      ),
      isCloth = !simplified && !!material.bumpMap;
    const g = isCloth
      ? cushionGeometry(w, h, d, rad, opts.segments || 7)
      : new RoundedBoxGeometry(w, h, d, simplified ? 1 : opts.segments || 7, rad);
    if (isCloth) {
      const puff = material === darker ? 0.006 : part === 'pillow' ? 0.04 : part === 'arm' ? 0.016 : 0.03;
      shapeCushion(g, {puff, tile: tileSize(fab.texture), uvOffset: [seedRand(), seedRand()]});
    }
    const m = new THREE.Mesh(g, material);
    if (isCloth && part === 'seat' && material !== darker) m.userData.sag = true;
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.part = part;
    group.add(m);
    return m;
  };
  const leg = (x, z) => {
    if (config.legs === 'none') return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.019, 0.155, 16), wood);
    m.position.set(x, 0.09, z);
    m.castShadow = true;
    m.userData.part = 'legs';
    group.add(m);
  };
  const seam = (w, d, x, y, z) => {
    if (config.seam === 'none') return;
    const pts = [];
    const radius = 0.08;
    for (let i = 0; i <= 80; i++) {
      const angle = (i / 80) * Math.PI * 2;
      const xx = (w / 2 - radius) * Math.sign(Math.cos(angle)) + radius * Math.cos(angle),
        zz = (d / 2 - radius) * Math.sign(Math.sin(angle)) + radius * Math.sin(angle);
      pts.push(new THREE.Vector3(xx + x, y, zz + z));
    }
    if (simplified) group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), seamMat));
    else {
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.0045, 6, true),
        pipingMat
      );
      tube.castShadow = true;
      group.add(tube);
    }
  };
  const w = config.width / 100,
    depth = config.depth / 100;
  if (config.category === 'headboard') {
    const h = config.height / 100,
      n = config.panels;
    box(w, 0.1, 0.16, 0, 0.16, 0, darker, 0.025, 'back');
    for (let i = 0; i < n; i++) {
      const ph = h - (config.backShape === 'arched' ? Math.abs(i - (n - 1) / 2) * 0.07 : 0);
      box(
        w / n - 0.012,
        ph,
        depth,
        -w / 2 + (w / n) * (i + 0.5),
        ph / 2,
        config.exploded ? i * 0.025 : 0,
        backCloth,
        radius,
        'back'
      );
    }
    if (config.backShape === 'winged')
      for (const side of [-1, 1]) box(0.12, h, 0.35, (side * w) / 2, h / 2, 0.12, backCloth, radius, 'back');
    if (config.lamps)
      for (const x of [-w * 0.35, w * 0.35]) box(0.05, 0.45, 0.05, x, h * 0.75, 0.22, timber, 0.02, 'back');
    if (config.charging) box(0.12, 0.07, 0.025, w * 0.35, 0.35, depth / 2 + 0.02, timber, 0.01, 'back');
    leg(-w * 0.35, 0);
    leg(w * 0.35, 0);
    return group;
  }
  if (config.category === 'bed') {
    box(w, 0.32, depth, 0, 0.3, 0.0, darker, 0.09, 'seat');
    const mattress = new THREE.MeshStandardMaterial({color: '#e9e4d8', roughness: 1});
    box(
      w - 0.13,
      0.22,
      depth - 0.22,
      0,
      config.storage && config.exploded ? 0.92 : 0.57,
      0.03,
      mattress,
      0.09,
      'seat'
    );
    for (let i = 0; i < config.panels; i++) {
      const ph =
        config.height / 100 -
        (config.backShape === 'arched' ? Math.abs(i - (config.panels - 1) / 2) * 0.06 : 0);
      box(
        w / config.panels - 0.012,
        ph,
        0.16,
        -w / 2 + (w / config.panels) * (i + 0.5),
        ph / 2,
        -depth / 2,
        backCloth,
        radius,
        'back'
      );
    }
    if (config.backShape === 'winged')
      for (const side of [-1, 1])
        box(
          0.1,
          config.height / 100,
          0.35,
          (side * w) / 2,
          config.height / 200,
          -depth / 2 + 0.12,
          backCloth,
          radius,
          'back'
        );
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15])
      for (const z of [-depth / 2 + 0.14, depth / 2 - 0.14]) leg(x, z);
    for (let i = 0; i < config.pillows; i++)
      box(
        config.pillowWidth / 100,
        config.pillowHeight / 100,
        0.14,
        -w * 0.3 + (i % 3) * w * 0.3,
        0.8,
        -depth / 2 + 0.4,
        zone(config.pillowColors[i]),
        0.06,
        'pillow'
      );
    if (config.charging) box(0.14, 0.08, 0.035, w * 0.38, 0.8, -depth / 2 + 0.1, timber, 0.01, 'back');
    if (config.lamps)
      for (const x of [-w * 0.42, w * 0.42]) {
        box(0.025, 0.5, 0.025, x, 1.15, -depth / 2 + 0.12, timber, 0.01, 'back');
        box(0.15, 0.08, 0.1, x, 1.4, -depth / 2 + 0.15, mattress, 0.02, 'back');
      }
    return group;
  }
  const arm = config.arm === 'none' ? 0 : config.arm === 'slim' ? 0.12 : 0.23,
    inner = w - arm * 2;
  const count = ['chair', 'chairbed'].includes(config.category) ? 1 : config.moduleCount,
    seatW = inner / count;
  if (config.legs === 'none') box(w - 0.2, 0.18, depth - 0.2, 0, 0.09, 0, darker, 0.03, 'legs');
  const chaise = config.category === 'sofa' && config.layout !== 'straight';
  box(w - 0.08, 0.23, depth - 0.09, 0, 0.29, 0, darker, 0.08, 'seat');
  for (let i = 0; i < count; i++) {
    const x = -inner / 2 + seatW * (i + 0.5),
      extended =
        chaise && ((config.layout === 'left' && i === 0) || (config.layout === 'right' && i === count - 1));
    const sd = depth - 0.22 + (extended ? 0.65 : 0),
      z = 0.075 + (extended ? 0.325 : 0);
    box(
      seatW - 0.025,
      0.225,
      sd,
      x + (config.exploded ? (i - (count - 1) / 2) * 0.12 : 0),
      config.exploded ? 0.82 : config.storage ? 0.52 : 0.495,
      z + (config.expanded ? 0.4 : 0),
      seatCloth,
      radius,
      'seat'
    );
    seam(seatW - 0.045, sd - 0.025, x, 0.586, z);
    const backHeight = config.height / 100 - 0.44;
    const bh =
      backHeight + (config.backShape === 'arched' ? 0.12 * (1 - Math.abs(i - (count - 1) / 2) / count) : 0);
    const back = box(
      seatW - 0.028,
      bh,
      config.backDepth / 100,
      x,
      0.44 + bh / 2 + (config.exploded ? 0.3 : 0),
      -depth / 2 + 0.14 - (config.exploded ? 0.3 : 0),
      backCloth,
      radius,
      'back'
    );
    back.rotation.x = -0.06;
  }
  if (arm) {
    for (const side of [-1, 1]) {
      const a = box(
        arm,
        0.44,
        depth,
        side * (w / 2 - arm / 2),
        0.49,
        0,
        armCloth,
        config.arm === 'slim' ? 0.045 : radius * 1.3,
        'arm'
      );
      a.rotation.z = side * 0.012;
    }
  }
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15])
    for (const z of [-depth / 2 + 0.14, depth / 2 - 0.14]) leg(x, z);
  if (chaise) {
    const x = (config.layout === 'left' ? -1 : 1) * (inner / 2 - seatW / 2);
    box(seatW - 0.04, 0.23, 0.67, x, 0.29, depth / 2 + 0.29, darker, 0.07);
    for (const lx of [x - seatW * 0.35, x + seatW * 0.35]) leg(lx, depth / 2 + 0.53);
  }
  if (config.backShape === 'winged')
    for (const side of [-1, 1])
      box(0.12, 0.45, 0.35, side * (inner / 2), 0.7, -depth / 2 + 0.25, backCloth, radius, 'back');
  if (config.woodArms)
    for (const side of [-1, 1])
      box(arm + 0.025, 0.045, depth * 0.75, side * (w / 2 - arm / 2), 0.73, 0, timber, 0.02, 'arm');
  if (config.charging) box(0.13, 0.07, 0.035, w / 2 - arm / 2, 0.74, 0.12, timber, 0.01, 'arm');
  if (config.lamps) {
    box(0.025, 0.55, 0.025, -w / 2 + 0.08, 0.96, -depth / 2 + 0.12, timber, 0.01, 'arm');
    box(
      0.18,
      0.08,
      0.14,
      -w / 2 + 0.08,
      1.23,
      -depth / 2 + 0.16,
      new THREE.MeshStandardMaterial({color: '#e7d7b1', emissive: '#987c35', emissiveIntensity: 0.3}),
      0.03,
      'arm'
    );
  }
  if (config.storage) {
    box(w * 0.72, 0.12, depth * 0.6, 0, 0.2, 0.08, timber, 0.02, 'seat');
  }
  if (config.expanded && config.mechanism !== 'none') {
    box(
      inner,
      0.16,
      config.mechanism === 'recliner' ? 0.5 : 0.9,
      0,
      0.47,
      depth / 2 + 0.4,
      seatCloth,
      radius,
      'seat'
    );
    for (const x of [-inner * 0.4, inner * 0.4]) leg(x, depth / 2 + 0.75);
  }
  if (config.seam === 'double') {
    seam(inner - 0.04, depth - 0.21, 0, 0.6, 0.075);
  }
  for (let i = 0; i < config.pillows; i++) {
    const n = Math.min(config.pillows, 8),
      x = n === 1 ? 0 : -inner * 0.36 + i * ((inner * 0.72) / (n - 1));
    const ph = (config.pillowHeight / 100) * (config.pillowShape === 'lumbar' ? 0.65 : 1),
      pw = config.pillowWidth / 100;
    const p = box(
      pw,
      ph,
      config.pillowShape === 'bolster' ? 0.23 : 0.13,
      x,
      0.55 + ph / 2 + (config.exploded ? 0.35 : 0),
      -depth / 2 + 0.4,
      zone(config.pillowColors[i]),
      config.pillowShape === 'bolster' ? 0.12 : 0.065,
      'pillow'
    );
    p.rotation.set(-0.18, 0, (i % 2 === 0 ? 1 : -1) * 0.12);
  }
  return group;
}
function addRoom(group, c, simplified = false) {
  if (c.room === 'studio') return;
  const dark = c.room === 'loft',
    warm = c.room === 'house';
  const mat = new THREE.MeshStandardMaterial({
      color: dark ? '#8b8981' : warm ? '#c9b396' : '#ded9ce',
      roughness: 1
    }),
    floorMat = new THREE.MeshStandardMaterial({color: dark ? '#918f87' : '#b6a58b', roughness: 0.9});
  const cube = (w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.userData.room = true;
    group.add(mesh);
  };
  const rw = c.roomWidth / 100,
    rd = c.roomDepth / 100;
  if (!simplified) cube(rw, 0.03, rd, 0, -0.03, 0.2, floorMat);
  cube(rw, 2.8, 0.04, 0, 1.38, -rd / 2 + 0.2, mat);
  cube(0.04, 2.8, rd, -rw / 2, 1.38, 0.2, mat);
  const art = new THREE.MeshStandardMaterial({color: dark ? '#4f574c' : '#9d997b', roughness: 1});
  cube(0.8, 0.9, 0.04, rw * 0.25, 1.7, -rd / 2 + 0.24, art);
  const rug = new THREE.MeshStandardMaterial({color: '#cbc5b5', roughness: 1});
  if (!simplified)
    cube(
      Math.min(rw - 0.3, c.width / 100 + 0.5),
      0.015,
      Math.min(rd - 0.3, c.depth / 100 + 1),
      0,
      0.005,
      0.3,
      rug
    );
  if (c.room === 'hotel') cube(0.45, 0.5, 0.45, c.width / 200 + 0.35, 0.25, -0.5, art);
}
const CAN_SIT = ['sofa', 'chair', 'chairbed'];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ставит в модель человека для масштаба (стоящего и сидящего).
function attachPeople(model, config) {
  const w = config.width / 100,
    depth = config.depth / 100;
  const standing = mannequin('standing');
  if (config.category === 'bed') standing.position.set(w / 2 + 0.55, 0, 0);
  else if (config.category === 'headboard') standing.position.set(w / 2 - 0.2, 0, 0.8);
  else standing.position.set(w / 2 - 0.15, 0, depth / 2 + 0.5);
  standing.visible = false;
  model.add(standing);
  model.userData.materials.push(...standing.userData.materials);

  const seats = [];
  model.traverse((o) => {
    if (o.userData.sag) seats.push(o);
  });
  let seated = null,
    seat = null;
  if (CAN_SIT.includes(config.category) && seats.length) {
    // Садим на самую обычную по глубине подушку ближе к середине, не на шезлонг.
    const minDepth = Math.min(...seats.map((s) => s.geometry.parameters.depth));
    const normal = seats
      .filter((s) => s.geometry.parameters.depth <= minDepth + 0.01)
      .sort((a, b) => a.position.x - b.position.x);
    seat = normal[Math.floor((normal.length - 1) / 2)];
    const top = seat.position.y + seat.geometry.parameters.height / 2 + seat.geometry.userData.puff;
    seated = mannequin('seated', {seatTop: top});
    seated.visible = false;
    model.add(seated);
    model.userData.materials.push(...seated.userData.materials);
  }
  return {standing, seated, seats, seat};
}

// Сидящий человек: колени у переднего края сиденья, чтобы голени не уходили в каркас.
function placeSeated(r) {
  const {seat, seated} = r.rig || {};
  if (!seat || !seated) return;
  const g = seat.geometry.parameters;
  const top = seat.position.y + g.height / 2 + seat.geometry.userData.puff;
  seated.position.set(
    seat.position.x,
    top - r.sag * maxSag(g.height) - 0.012,
    seat.position.z + g.depth / 2 + 0.02 - 0.47
  );
}

const Scene = forwardRef(function Scene({config, onSelect, hero = false, view, onInspect}, ref) {
  const host = useRef(null),
    runtime = useRef(null),
    onSelectRef = useRef(onSelect),
    onInspectRef = useRef(onInspect);
  const [failed, setFailed] = useState(false),
    [simplified, setSimplified] = useState(false);
  const settings = {
    light: view?.light || 'day',
    person: !!view?.person,
    sit: !!view?.sit,
    quality: hero ? 'standard' : view?.quality || 'standard'
  };
  const settingsRef = useRef(settings);
  onSelectRef.current = onSelect;
  onInspectRef.current = onInspect;
  settingsRef.current = settings;

  // Выставляет человека, посадку и проседание под текущие настройки.
  const sync = () => {
    const r = runtime.current;
    if (!r || !r.rig) return;
    const s = settingsRef.current,
      canSit = !!r.rig.seated;
    const sitting = s.sit && canSit;
    r.rig.standing.visible = s.person && !sitting;
    if (r.rig.seated) r.rig.seated.visible = sitting;
    r.sagTarget = sitting ? 1 : 0;
    if (reducedMotion()) r.sag = r.sagTarget;
    r.invalidate();
  };

  useImperativeHandle(
    ref,
    () => ({
      view(mode) {
        const r = runtime.current;
        if (!r) return;
        const w = config.width / 100,
          scale = config.category === 'chair' ? 0.6 : config.category === 'headboard' ? 0.8 : 1;
        r.controls.target.set(0, config.category === 'headboard' ? 0.7 : 0.52, 0.12);
        if (mode === 'top') r.camera.position.set(0, Math.max(2.3, w * 1.7), 0.01);
        else if (mode === 'front') r.camera.position.set(0, 1, 4.8 * scale);
        else if (mode === 'side') r.camera.position.set(4.8 * scale, 1, 0.12);
        else if (mode === 'back') r.camera.position.set(0, 1, -4.8 * scale + 0.12);
        else if (mode === 'close') {
          const dir = r.camera.position.clone().sub(r.controls.target).normalize();
          r.camera.position.copy(r.controls.target).addScaledVector(dir, 1.25);
        } else r.camera.position.set(3.1 * scale, 2.05 * scale, 4.4 * scale);
        r.controls.update();
        r.invalidate();
      },
      zoom(amount) {
        const r = runtime.current;
        if (!r) return;
        r.camera.position.sub(r.controls.target).multiplyScalar(amount).add(r.controls.target);
        r.controls.update();
      },
      snapshot() {
        const r = runtime.current;
        if (!r) return null;
        r.draw();
        if (r.simplified) {
          const svg = r.renderer.domElement.cloneNode(true);
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          return (
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(new XMLSerializer().serializeToString(svg))
          );
        }
        const c = document.createElement('canvas');
        c.width = 540;
        c.height = 360;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#eeebe4';
        ctx.fillRect(0, 0, 540, 360);
        ctx.drawImage(r.renderer.domElement, 0, 0, 540, 360);
        return c.toDataURL('image/webp', 0.65);
      },
      // GLB только мебели, в метрах: комната и человек в файл не попадают.
      // Размер в метрах нужен, чтобы в AR изделие встало в натуральную величину.
      async exportGLB() {
        const r = runtime.current;
        if (!r || !r.model) throw new Error('Модель ещё не готова');
        const hidden = [];
        r.model.traverse((o) => {
          if (o.userData.room && o.visible) {
            o.visible = false;
            hidden.push(o);
          }
        });
        [r.rig?.standing, r.rig?.seated].forEach((o) => {
          if (o?.visible) {
            o.visible = false;
            hidden.push(o);
          }
        });
        try {
          const glb = await new GLTFExporter().parseAsync(r.model, {binary: true, onlyVisible: true});
          return new Blob([glb], {type: 'model/gltf-binary'});
        } finally {
          hidden.forEach((o) => (o.visible = true));
          r.invalidate();
        }
      },
      canSit() {
        return !!runtime.current?.rig?.seated;
      },
      // Фото: подушка света и субпиксельный сдвиг накапливаются за много проходов.
      // Получаются мягкие тени и чистые края без шума, но это всё ещё растеризация,
      // а не трассировка лучей: отражения и переотражения света здесь не считаются.
      async photo({width = 2400, passes = 24, onProgress} = {}) {
        const r = runtime.current;
        if (!r || r.simplified) throw new Error('Фото доступно только с WebGL');
        const model = r.model;
        const box = new THREE.Box3();
        model.traverse((o) => {
          if (o.isMesh && o.userData.part) box.expandByObject(o);
        });
        if (box.isEmpty()) throw new Error('Нет модели для съёмки');

        const aspect = 3 / 2,
          W = width,
          H = Math.round(width / aspect);
        const saved = {
          pos: r.camera.position.clone(),
          target: r.controls.target.clone(),
          aspect: r.camera.aspect,
          ratio: r.renderer.getPixelRatio(),
          size: r.renderer.getSize(new THREE.Vector2()),
          light: r.keyLight.position.clone()
        };
        r.busy = true;
        try {
          const center = box.getCenter(new THREE.Vector3());
          const dir = r.camera.position.clone().sub(r.controls.target).normalize();
          r.camera.aspect = aspect;
          r.camera.position.copy(center).addScaledVector(dir, fitDistance(box, r.camera, aspect));
          r.camera.lookAt(center);
          r.camera.updateProjectionMatrix();
          r.renderer.setPixelRatio(1);
          r.renderer.setSize(W, H, false);
          r.composer?.setPixelRatio(1);
          r.composer?.setSize(W, H);

          const out = document.createElement('canvas');
          out.width = W;
          out.height = H;
          const ctx = out.getContext('2d');
          ctx.fillStyle = '#eeebe4';
          ctx.fillRect(0, 0, W, H);
          for (let i = 0; i < passes; i++) {
            r.camera.setViewOffset(W, H, halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5, W, H);
            // Источник света не точка, а мягкая площадка около метра.
            r.keyLight.position.set(
              saved.light.x + (halton(i + 1, 5) - 0.5) * 1.6,
              saved.light.y + (halton(i + 1, 7) - 0.5) * 0.8,
              saved.light.z + (halton(i + 1, 11) - 0.5) * 1.6
            );
            r.draw();
            ctx.globalAlpha = 1 / (i + 1);
            ctx.drawImage(r.renderer.domElement, 0, 0, W, H);
            onProgress?.((i + 1) / passes);
            await new Promise((res) => requestAnimationFrame(res));
          }
          const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
          return {url: URL.createObjectURL(blob), blob, width: W, height: H};
        } finally {
          r.camera.clearViewOffset();
          r.camera.position.copy(saved.pos);
          r.controls.target.copy(saved.target);
          r.camera.aspect = saved.aspect;
          r.camera.updateProjectionMatrix();
          r.controls.update();
          r.keyLight.position.copy(saved.light);
          r.renderer.setPixelRatio(saved.ratio);
          r.renderer.setSize(saved.size.x, saved.size.y);
          r.composer?.setPixelRatio(saved.ratio);
          r.composer?.setSize(saved.size.x, saved.size.y);
          r.busy = false;
          r.invalidate();
        }
      }
    }),
    [config.width, config.category]
  );

  // 1. Рендерер, камера, свет.
  useEffect(() => {
    const element = host.current;
    let renderer, scene, camera, controls, env, pmrem, raf, observer;
    let disposed = false,
      isSVG = false,
      dirty = true;
    try {
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance'
        });
      } catch {
        renderer = new SVGRenderer();
        isSVG = true;
        setSimplified(true);
        renderer.setQuality('low');
      }
      if (!isSVG) {
        renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[settingsRef.current.quality].pixelRatio));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.setClearColor('#eeebe4', 0);
      } else renderer.setClearColor(new THREE.Color('#eeebe4'), 0);
      element.appendChild(renderer.domElement);
      renderer.domElement.setAttribute(
        'aria-label',
        'Интерактивная 3D-модель мебели. Вращайте указателем; настройки доступны рядом.'
      );
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
      camera.position.set(3.1, 2.05, 4.4);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.58, 0.1);
      controls.enableDamping = !isSVG;
      controls.dampingFactor = 0.075;
      controls.minDistance = 1.1;
      controls.maxDistance = 8;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.enablePan = false;
      controls.autoRotate = !isSVG && hero && !reducedMotion();
      controls.autoRotateSpeed = 0.35;
      controls.addEventListener('change', () => {
        dirty = true;
        // Какие ракурсы клиент уже видел: по ним строится список «проверено».
        const az = Math.abs(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()));
        const pol = THREE.MathUtils.radToDeg(controls.getPolarAngle());
        const report = onInspectRef.current;
        if (!report) return;
        if (pol < 28) report('angle:top');
        else if (az < 30) report('angle:front');
        else if (az > 150) report('angle:back');
        else if (az > 60 && az < 120) report('angle:side');
        if (camera.position.distanceTo(controls.target) < 2.6) report('close');
      });
      controls.update();

      if (!isSVG) {
        pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        env = pmrem.fromScene(room, 0.04);
        scene.environment = env.texture;
        room.dispose();
      }
      const hemi = isSVG
        ? new THREE.AmbientLight('#ffffff', 0.65)
        : new THREE.HemisphereLight('#fff9ef', '#a79c86', 2.4);
      scene.add(hemi);
      const keyLight = new THREE.DirectionalLight('#fff4dd', isSVG ? 0.7 : 3.4);
      keyLight.position.set(-3, 6, 4);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      Object.assign(keyLight.shadow.camera, {left: -4, right: 4, top: 4, bottom: -4});
      keyLight.shadow.normalBias = 0.04;
      keyLight.shadow.bias = -0.0001;
      keyLight.shadow.radius = 5;
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#e5edf7', isSVG ? 0.15 : 1.2);
      fillLight.position.set(4, 3, -3);
      scene.add(fillLight);
      if (!isSVG) {
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(200, 200),
          new THREE.ShadowMaterial({opacity: 0.13})
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.005;
        floor.receiveShadow = true;
        scene.add(floor);
      }

      const rt = {
        renderer,
        scene,
        camera,
        controls,
        host: element,
        model: null,
        simplified: isSVG,
        hemi,
        keyLight,
        fillLight,
        composer: null,
        busy: false,
        sag: 0,
        sagTarget: 0,
        invalidate: () => {
          dirty = true;
        },
        draw: () => {
          if (rt.composer) rt.composer.render();
          else renderer.render(scene, camera);
        }
      };
      runtime.current = rt;

      observer = new ResizeObserver(() => {
        const {width, height} = element.getBoundingClientRect();
        if (!width || !height || rt.busy) return;
        renderer.setSize(width, height);
        rt.composer?.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        dirty = true;
      });
      observer.observe(element);

      const animate = () => {
        if (disposed) return;
        raf = requestAnimationFrame(animate);
        if (document.hidden || rt.busy) return;
        const moved = controls.update();
        // Плавная просадка и возврат подушек.
        if (rt.rig && Math.abs(rt.sag - rt.sagTarget) > 0.001) {
          rt.sag += (rt.sagTarget - rt.sag) * 0.12;
          if (Math.abs(rt.sag - rt.sagTarget) <= 0.001) rt.sag = rt.sagTarget;
          rt.rig.seats.forEach((m) => applySag(m, rt.sag));
          placeSeated(rt);
          dirty = true;
        }
        if (dirty || moved) {
          rt.draw();
          dirty = false;
        }
      };
      animate();

      const ray = new THREE.Raycaster(),
        pointer = new THREE.Vector2();
      let down = null;
      const start = (e) => {
        down = [e.clientX, e.clientY];
      };
      const end = (e) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1
        );
        ray.setFromCamera(pointer, camera);
        const hits = runtime.current?.model ? ray.intersectObject(runtime.current.model, true) : [];
        const target = hits.find((x) => x.object.userData.part);
        if (target) onSelectRef.current?.(target.object.userData.part);
      };
      renderer.domElement.addEventListener('pointerdown', start);
      renderer.domElement.addEventListener('pointerup', end);
      const lost = (e) => {
        e.preventDefault();
        setFailed(true);
      };
      renderer.domElement.addEventListener('webglcontextlost', lost);
      rt.cleanup = () => {
        renderer.domElement.removeEventListener('pointerdown', start);
        renderer.domElement.removeEventListener('pointerup', end);
        renderer.domElement.removeEventListener('webglcontextlost', lost);
      };
    } catch {
      setFailed(true);
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      runtime.current?.cleanup?.();
      runtime.current?.composer?.dispose();
      controls?.dispose();
      if (runtime.current?.model) release(runtime.current.model);
      if (scene)
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
        });
      env?.dispose();
      pmrem?.dispose();
      renderer?.dispose?.();
      renderer?.domElement.remove();
      runtime.current = null;
    };
  }, [hero]);

  // 2. Уровень качества: затенение в складках, размер теней, плотность пикселей.
  useEffect(() => {
    const r = runtime.current;
    if (!r || r.simplified) return;
    const q = QUALITY[settings.quality];
    r.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    r.keyLight.shadow.mapSize.set(q.shadow, q.shadow);
    r.keyLight.shadow.map?.dispose();
    r.keyLight.shadow.map = null;
    r.composer?.dispose();
    r.composer = null;
    r.scene.background = null;
    if (q.ao && !hero) {
      try {
        const {width, height} = r.renderer.getSize(new THREE.Vector2());
        const dpr = r.renderer.getPixelRatio();
        const target = new THREE.WebGLRenderTarget(Math.max(1, width * dpr), Math.max(1, height * dpr), {
          type: THREE.HalfFloatType,
          samples: 4
        });
        const composer = new EffectComposer(r.renderer, target);
        const base = new RenderPass(r.scene, r.camera);
        base.clearAlpha = 0;
        composer.addPass(base);
        const ao = new GTAOPass(r.scene, r.camera, Math.max(1, width), Math.max(1, height));
        ao.updateGtaoMaterial({
          radius: 0.35,
          distanceExponent: 1.4,
          thickness: 1.2,
          scale: 1.1,
          samples: 12,
          distanceFallOff: 1,
          screenSpaceRadius: false
        });
        composer.addPass(ao);
        composer.addPass(new OutputPass());
        composer.setSize(Math.max(1, width), Math.max(1, height));
        r.composer = composer;
      } catch {
        r.composer = null;
        r.scene.background = null;
      }
    }
    r.invalidate();
  }, [settings.quality, hero]);

  // 3. Освещение: день, вечер, холодный свет.
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const p = LIGHT_PRESETS[settings.light] || LIGHT_PRESETS.day;
    if (!r.simplified) {
      r.hemi.color.set(p.hemi);
      r.hemi.groundColor.set(p.ground);
      r.hemi.intensity = p.hemiI;
      r.keyLight.color.set(p.key);
      r.keyLight.intensity = p.keyI;
      r.fillLight.color.set(p.fill);
      r.fillLight.intensity = p.fillI;
      r.scene.environmentIntensity = p.env;
      r.renderer.toneMappingExposure = p.exposure;
    }
    r.invalidate();
    if (!hero && settings.light) onInspectRef.current?.('light:' + settings.light);
  }, [settings.light]);

  // 4. Модель.
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    try {
      if (r.model) {
        r.scene.remove(r.model);
        release(r.model);
      }
      const q = QUALITY[settings.quality];
      r.model = furniture(config, r.simplified, {segments: q.segments, anisotropy: q.anisotropy});
      if (!hero) addRoom(r.model, config, r.simplified);
      r.model.userData.materials = r.model.userData.materials || [];
      r.rig = hero || r.simplified ? null : attachPeople(r.model, config);
      r.scene.add(r.model);
      r.sag = 0;
      r.controls.target.set(
        0,
        config.category === 'headboard' ? 0.7 : 0.55,
        config.layout === 'straight' ? 0 : 0.25
      );
      if (r.lastCategory !== config.category) {
        const scale = config.category === 'chair' ? 0.6 : config.category === 'headboard' ? 0.8 : 1;
        r.camera.position.set(3.1 * scale, 2.05 * scale, 4.4 * scale);
        r.lastCategory = config.category;
      }
      r.controls.update();
      sync();
      if (r.rig && r.sagTarget) {
        r.sag = r.sagTarget;
        r.rig.seats.forEach((m) => applySag(m, r.sag));
      }
      placeSeated(r);
      r.invalidate();
    } catch {
      setFailed(true);
    }
  }, [config, settings.quality]);

  // 5. Человек и посадка.
  useEffect(() => {
    sync();
    if (settings.person) onInspectRef.current?.('person');
    if (settings.sit && runtime.current?.rig?.seated) onInspectRef.current?.('sit');
  }, [settings.person, settings.sit]);

  return (
    <div className="scene-host" ref={host}>
      {simplified && !failed && <span className="simplified-badge">Упрощённый просмотр · без WebGL</span>}
      {failed && (
        <div className="scene-fallback">
          <span>3D-просмотр недоступен</span>
          <p>
            Параметры, расчёт и сохранение проекта продолжают работать. Попробуйте обновить страницу или
            использовать устройство с WebGL.
          </p>
        </div>
      )}
    </div>
  );
});
export default Scene;
