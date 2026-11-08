// Качество изображения и достоверность просмотра.
// Всё здесь — только про то, как модель выглядит на экране. Размеры, цены и
// конфигурация изделия сюда не попадают и не изменяются.
import * as THREE from 'three';

/* ---------- Свет ---------- */

// Один и тот же диван выглядит по-разному днём, вечером и под холодным светом.
// Клиент должен увидеть оттенок во всех трёх, а не только на «удобном» свету.
export const LIGHT_PRESETS = {
  day: {label: 'День', key: '#fff4dd', keyI: 3.4, fill: '#e5edf7', fillI: 1.2, hemi: '#fff9ef', ground: '#a79c86', hemiI: 2.4, env: 1, exposure: 1.12},
  evening: {label: 'Вечер', key: '#ffb877', keyI: 2.6, fill: '#6f84ad', fillI: 0.35, hemi: '#ffd9ab', ground: '#6d5a45', hemiI: 1, env: 0.45, exposure: 1.05},
  cool: {label: 'Холодный', key: '#e9f2ff', keyI: 3.6, fill: '#dbe7ff', fillI: 1.5, hemi: '#eef4ff', ground: '#9aa3ad', hemiI: 2.6, env: 1, exposure: 1.1}
};

/* ---------- Качество ---------- */

export const QUALITY = {
  standard: {label: 'Стандарт', segments: 7, shadow: 1024, ao: false, pixelRatio: 1.6, anisotropy: 4},
  high: {label: 'Высокое', segments: 14, shadow: 2048, ao: true, pixelRatio: 2, anisotropy: 8}
};

export function defaultQuality() {
  try {
    const touch = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
    return touch ? 'standard' : 'high';
  } catch {
    return 'standard';
  }
}

/* ---------- Фактуры ткани в реальном масштабе ---------- */

// Сторона одного повтора рисунка, в метрах. UV модели считаются от размеров
// детали в метрах, поэтому плетение одинаково на подушке и на подлокотнике.
const TILE = {woven: 0.09, boucle: 0.12, velvet: 0.1, ribbed: 0.08, leather: 0.15, felt: 0.1};
export const tileSize = kind => TILE[kind] || 0.12;

// Сила рельефа по типу ткани (bumpScale в MeshPhysicalMaterial).
const BUMP = {woven: 0.7, boucle: 1, velvet: 0.3, ribbed: 0.7, leather: 0.6, felt: 0.35};
export const bumpStrength = kind => BUMP[kind] || 0.015;

export function fabricBump(kind, anisotropy = 4) {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const c = canvas.getContext('2d');
  c.fillStyle = '#808080';
  c.fillRect(0, 0, S, S);

  let seed = 1143;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gray = v => {
    const k = Math.max(0, Math.min(255, Math.round(v)));
    return `rgb(${k},${k},${k})`;
  };
  // Рисуем с копиями по краям, чтобы фактура бесшовно повторялась.
  const wrap = (x, y, r, draw) => {
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        const px = x + dx, py = y + dy;
        if (px > -r && px < S + r && py > -r && py < S + r) draw(px, py);
      }
    }
  };
  const speckle = (count, alpha) => {
    for (let i = 0; i < count; i++) {
      const v = 60 + rand() * 140;
      c.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${alpha})`;
      c.fillRect(rand() * S, rand() * S, 2, 2);
    }
  };

  if (kind === 'boucle') {
    // Петли: светлый бугорок с тёмной бороздой вокруг.
    for (let i = 0; i < 1400; i++) {
      const x = rand() * S, y = rand() * S, r = 7 + rand() * 8;
      wrap(x, y, r, (px, py) => {
        const g = c.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, gray(205));
        g.addColorStop(0.65, gray(150));
        g.addColorStop(1, gray(70));
        c.fillStyle = g;
        c.beginPath();
        c.arc(px, py, r, 0, Math.PI * 2);
        c.fill();
      });
    }
  } else if (kind === 'ribbed') {
    // Микровельвет: валики с мягким профилем.
    const pitch = 32;
    for (let x = 0; x < S; x += pitch) {
      const g = c.createLinearGradient(x, 0, x + pitch, 0);
      g.addColorStop(0, gray(70));
      g.addColorStop(0.5, gray(205));
      g.addColorStop(1, gray(70));
      c.fillStyle = g;
      c.fillRect(x, 0, pitch, S);
    }
    speckle(5000, 0.2);
  } else if (kind === 'leather') {
    // Поры и тонкие заломы.
    for (let i = 0; i < 2600; i++) {
      const x = rand() * S, y = rand() * S, r = 2 + rand() * 2.5;
      wrap(x, y, r, (px, py) => {
        c.fillStyle = gray(60 + rand() * 40);
        c.beginPath();
        c.arc(px, py, r, 0, Math.PI * 2);
        c.fill();
      });
    }
    c.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = 'rgba(40,40,40,0.28)';
      c.beginPath();
      let x = rand() * S, y = rand() * S;
      c.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rand() - 0.5) * 70;
        y += (rand() - 0.5) * 70;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  } else if (kind === 'velvet') {
    // Короткий ворс: мелкие штрихи в одном направлении.
    c.lineWidth = 1;
    for (let i = 0; i < 14000; i++) {
      const x = rand() * S, y = rand() * S, len = 4 + rand() * 8;
      c.strokeStyle = gray(100 + rand() * 110);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + len * 0.3, y + len);
      c.stroke();
    }
  } else if (kind === 'felt') {
    // Войлок: беспорядочные волокна.
    c.lineWidth = 1;
    for (let i = 0; i < 9000; i++) {
      const x = rand() * S, y = rand() * S, a = rand() * Math.PI, len = 10 + rand() * 12;
      c.strokeStyle = `rgba(${(90 + rand() * 120) | 0},${(90 + rand() * 120) | 0},${(90 + rand() * 120) | 0},0.35)`;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    }
  } else {
    // Рогожка: переплетение нитей «через одну».
    const cell = 32;
    for (let j = 0; j < S / cell; j++) {
      for (let i = 0; i < S / cell; i++) {
        const x = i * cell, y = j * cell, horizontal = (i + j) % 2 === 0;
        const g = horizontal ? c.createLinearGradient(0, y, 0, y + cell) : c.createLinearGradient(x, 0, x + cell, 0);
        g.addColorStop(0, gray(80));
        g.addColorStop(0.5, gray(200));
        g.addColorStop(1, gray(80));
        c.fillStyle = g;
        c.fillRect(x, y, cell, cell);
      }
    }
    speckle(6000, 0.16);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// Рельеф плюс лёгкое изменение яркости. Только рельеф на светлой ткани при
// сильном свете «выгорает» и фактуры не видно, как на настоящей светлой ткани
// в солнечный день. Поэтому тот же рисунок слегка затемняет цвет в бороздах.
export function fabricMaps(kind, anisotropy = 4) {
  const bump = fabricBump(kind, anisotropy);
  const src = bump.image;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = 0.4;
  c.drawImage(src, 0, 0);
  const albedo = new THREE.CanvasTexture(canvas);
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = anisotropy;
  albedo.colorSpace = THREE.SRGBColorSpace;
  return {bump, albedo};
}

/* ---------- Заготовка подушки ---------- */

// RoundedBoxGeometry из three.js ставит вершины только на скруглениях: плоская
// середина грани — один большой четырёхугольник, и выпучить его нельзя.
// Здесь сетка равномерная в середине и сгущается к скруглению, поэтому подушка
// может набухать и проседать по всей поверхности.
const axisCoords = (half, radius, inner, band) => {
  const hi = half - radius, list = [];
  for (let k = 0; k <= band; k++) list.push(-(hi + radius * Math.tan(Math.PI / 4 * (band - k) / band)));
  for (let i = 1; i < inner; i++) list.push(-hi + 2 * hi * i / inner);
  for (let k = 0; k <= band; k++) list.push(hi + radius * Math.tan(Math.PI / 4 * k / band));
  return list;
};

export function cushionGeometry(width, height, depth, radius, segments = 7) {
  const half = [width / 2, height / 2, depth / 2];
  const r = Math.min(radius, ...half.map(h => h * 0.98));
  const inner = Math.max(6, Math.round(segments * 1.2)), band = segments > 10 ? 4 : 3;
  const coords = half.map(h => axisCoords(h, r, inner, band));
  const positions = [], normals = [], uvs = [], index = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3();

  for (let c = 0; c < 3; c++) {
    for (const s of [1, -1]) {
      let a = (c + 1) % 3, b = (c + 2) % 3;
      if (s < 0) [a, b] = [b, a];
      const ua = coords[a], vb = coords[b], base = positions.length / 3, cols = vb.length;
      for (let i = 0; i < ua.length; i++) {
        for (let j = 0; j < vb.length; j++) {
          const v = [0, 0, 0];
          v[c] = s * half[c]; v[a] = ua[i]; v[b] = vb[j];
          p.set(v[0], v[1], v[2]);
          q.set(
            Math.max(-(half[0] - r), Math.min(half[0] - r, p.x)),
            Math.max(-(half[1] - r), Math.min(half[1] - r, p.y)),
            Math.max(-(half[2] - r), Math.min(half[2] - r, p.z))
          );
          n.copy(p).sub(q).normalize();
          positions.push(q.x + n.x * r, q.y + n.y * r, q.z + n.z * r);
          normals.push(n.x, n.y, n.z);
          uvs.push(0, 0);
        }
      }
      for (let i = 0; i < ua.length - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const i0 = base + i * cols + j, i1 = i0 + cols, i2 = i1 + 1, i3 = i0 + 1;
          index.push(i0, i1, i2, i0, i2, i3);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.parameters = {width, height, depth, radius: r};
  return g;
}

/* ---------- Форма подушки ---------- */

// Превращает RoundedBoxGeometry в «набитую» подушку:
//  1) середина каждой грани выпучивается, края остаются на месте (там шов);
//  2) нормали наклоняются по тому же рельефу — свет скользит как по ткани;
//  3) UV пересчитываются в метрах, чтобы масштаб плетения был настоящим.
export function shapeCushion(geometry, {puff = 0, tile = 0.12, uvOffset = [0, 0]} = {}) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const {width: w, height: h, depth: d} = geometry.parameters;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const p = new THREE.Vector3(), n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);

    // UV в метрах по доминирующей оси нормали.
    let a, b;
    if (ax >= ay && ax >= az) { a = p.z; b = p.y; }
    else if (ay >= az) { a = p.x; b = p.z; }
    else { a = p.x; b = p.y; }
    uv.setXY(i, a / tile + uvOffset[0], b / tile + uvOffset[1]);

    if (puff <= 0) continue;

    // Рельеф грани: height = puff * wu * wv, максимум в центре, 0 на краях.
    const bulge = (s, ha, hb, ca, cb) => {
      const u = ca / ha, v = cb / hb;
      const wu = Math.max(0, 1 - u * u), wv = Math.max(0, 1 - v * v);
      return {h: puff * wu * wv, du: puff * (-2 * u / ha) * wv, dv: puff * (-2 * v / hb) * wu, s};
    };
    if (ax >= ay && ax >= az) {
      const r = bulge(Math.sign(n.x) || 1, hz, hy, p.z, p.y);
      p.x += r.s * r.h;
      n.z -= r.du; n.y -= r.dv;
    } else if (ay >= az) {
      const r = bulge(Math.sign(n.y) || 1, hx, hz, p.x, p.z);
      p.y += r.s * r.h;
      n.x -= r.du; n.z -= r.dv;
    } else {
      const r = bulge(Math.sign(n.z) || 1, hx, hy, p.x, p.y);
      p.z += r.s * r.h;
      n.x -= r.du; n.y -= r.dv;
    }
    n.normalize();
    pos.setXYZ(i, p.x, p.y, p.z);
    nor.setXYZ(i, n.x, n.y, n.z);
  }

  pos.needsUpdate = nor.needsUpdate = uv.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Исходная форма нужна, чтобы подушка могла проседать и возвращаться.
  geometry.userData.baseP = Float32Array.from(pos.array);
  geometry.userData.baseN = Float32Array.from(nor.array);
  geometry.userData.puff = puff;
}

/* ---------- Просадка сиденья под весом ---------- */

// Максимальная вмятина по центру подушки, м. Это иллюстрация, а не расчёт
// жёсткости: реальная просадка зависит от наполнения, которое фабрика не задавала.
export const maxSag = height => Math.min(0.075, height * 0.4);

export function applySag(mesh, amount) {
  const g = mesh.geometry;
  const baseP = g.userData.baseP, baseN = g.userData.baseN;
  if (!baseP) return;
  const {width: w, height: h, depth: d} = g.parameters;
  const sx = w * 0.28, sz = d * 0.26, depth = amount * maxSag(h);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const x = baseP[i * 3], y = baseP[i * 3 + 1], z = baseP[i * 3 + 2];
    const top = Math.min(1, Math.max(0, (y + h / 2) / h));
    const s = depth * top * top * Math.exp(-(x * x) / (2 * sx * sx)) * Math.exp(-(z * z) / (2 * sz * sz));
    pos.setY(i, y - s);
    n.set(baseN[i * 3], baseN[i * 3 + 1], baseN[i * 3 + 2]);
    if (n.y > 0) {
      n.x -= (s * x / (sx * sx)) * n.y;
      n.z -= (s * z / (sz * sz)) * n.y;
      n.normalize();
    }
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  g.computeBoundingSphere();
}

/* ---------- Человек для масштаба ---------- */

// Нейтральная фигура ростом около 175 см. Без лица и одежды: она нужна только
// для масштаба и посадки, а не как «ещё один предмет интерьера».
export function mannequin(pose, {seatTop = 0.6} = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({color: '#8e8779', roughness: 0.85});
  group.userData.materials = [material];

  const part = (geometry, x, y, z, rx = 0, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.raycast = () => {};
    group.add(mesh);
    return mesh;
  };
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 16);

  if (pose === 'standing') {
    for (const side of [-1, 1]) {
      part(capsule(0.045, 0.38), side * 0.09, 0.285, 0);
      part(capsule(0.07, 0.33), side * 0.09, 0.755, 0);
      part(capsule(0.045, 0.22), side * 0.2, 1.38, 0);
      part(capsule(0.04, 0.22), side * 0.2, 1.08, 0);
      part(new THREE.BoxGeometry(0.09, 0.05, 0.24), side * 0.09, 0.025, 0.05);
    }
    part(capsule(0.14, 0.38), 0, 1.25, 0, 0, 1.25, 1, 0.75);
    part(new THREE.SphereGeometry(0.1, 24, 16), 0, 1.64, 0);
    group.userData.height = 1.75;
    return group;
  }

  // Сидит: начало координат — точка касания таза и сиденья.
  const shin = Math.max(0.2, seatTop + 0.035);
  for (const side of [-1, 1]) {
    part(capsule(0.07, 0.33), side * 0.09, 0.075, 0.24, Math.PI / 2);
    part(capsule(0.045, Math.max(0.1, shin - 0.09)), side * 0.09, 0.075 - shin / 2 + 0.02, 0.47);
    part(new THREE.BoxGeometry(0.09, 0.05, 0.24), side * 0.09, -seatTop + 0.025, 0.52);
    part(capsule(0.045, 0.22), side * 0.2, 0.43, -0.02);
    part(capsule(0.04, 0.22), side * 0.2, 0.2, 0.14, Math.PI / 2);
  }
  part(capsule(0.14, 0.38), 0, 0.33, -0.08, -0.18, 1.25, 1, 0.75);
  part(new THREE.SphereGeometry(0.1, 24, 16), 0, 0.81, -0.17);
  group.userData.height = 1.75;
  return group;
}

/* ---------- Кадр для фото ---------- */

// Подбирает дистанцию камеры так, чтобы изделие целиком влезло в кадр.
export function fitDistance(box, camera, aspect) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  return (sphere.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.08;
}

// Последовательность Хэлтона: равномерный сдвиг субпикселя для сглаживания.
export function halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}
