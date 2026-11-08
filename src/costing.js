import {validate, getFabric, dimensions, CATALOG_VERSION} from './domain.js';
export const rateDefinitions = [
  ['labor', 'Час производства', '₽/ч', 650],
  ['frame', 'Каркас: базовая норма', '₽/м²', 3700],
  ['foam', 'Наполнение: базовая норма', '₽/м²', 2800],
  ['packing', 'Упаковка', '₽/компл.', 1800],
  ['wood', 'Опоры из дерева', '₽/компл.', 3800],
  ['black', 'Металлические опоры', '₽/компл.', 3200],
  ['brass', 'Латунные опоры', '₽/компл.', 5400],
  ['mount', 'Крепёж изголовья', '₽/компл.', 950],
  ['fold', 'Раскладной механизм', '₽/компл.', 14500],
  ['slide', 'Выкатной механизм', '₽/компл.', 11000],
  ['recliner', 'Реклайнер', '₽/компл.', 26000],
  ['storage', 'Короб и подъёмный узел', '₽/компл.', 6500],
  ['woodArms', 'Деревянные вставки', '₽/компл.', 4200],
  ['charging', 'USB-модуль и проводка', '₽/компл.', 2800],
  ['lamps', 'Комплект светильников', '₽/компл.', 4600],
  ['covers', 'Молнии, липучки, съёмный чехол', '₽/компл.', 2400],
  ['seam', 'Усложнённый шов', '₽/м', 180],
  ['connector', 'Модульное соединение', '₽/стык', 650],
  ['waste', 'Отходы обивки', '%', 12],
  ['overhead', 'Накладные от прямых затрат', '%', 12],
  ['targetMargin', 'Целевая валовая маржа', '%', 40]
];
export function defaultProfile() {
  return {
    version: 'demo-rates-v2',
    name: 'Демонстрационные нормы GABER',
    updatedAt: new Date().toISOString(),
    rates: Object.fromEntries(rateDefinitions.map(([k, , , v]) => [k, v])),
    sources: Object.fromEntries(
      rateDefinitions.map(([k]) => [k, 'Демонстрационная ставка · заменить данными фабрики'])
    ),
    fabricPrices: {},
    fabricSources: {}
  };
}
export function validProfile(p) {
  return (
    !!p &&
    rateDefinitions.every(
      ([k]) =>
        Number.isFinite(p.rates?.[k]) &&
        p.rates[k] >= 0 &&
        p.rates[k] < (k === 'targetMargin' ? 90 : ['waste', 'overhead'].includes(k) ? 100 : 1000000)
    ) &&
    Object.values(p.fabricPrices || {}).every((n) => Number.isFinite(n) && n >= 0 && n < 1000000)
  );
}
export function readProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('gaber.costing.v2'));
    return validProfile(p) ? p : defaultProfile();
  } catch {
    return defaultProfile();
  }
}
const round = (n) => Math.round(n * 10) / 10;
export function estimate(c, discount = 0, profile = defaultProfile()) {
  const errors = validate(c);
  if (errors.length) throw Error(errors.join('. '));
  if (!validProfile(profile)) throw Error('Неверные ставки калькуляции');
  if (!Number.isFinite(discount) || discount < 0 || discount > 30) throw Error('Скидка: от 0 до 30%');
  const r = profile.rates,
    f = getFabric(c),
    w = c.width / 100,
    d = c.depth / 100,
    h = c.height / 100,
    head = c.category === 'headboard',
    bed = c.category === 'bed',
    chaise = c.layout !== 'straight',
    area = head ? w * h : bed ? w * d : w * d + (chaise ? 0.65 * (w / Math.max(2, c.moduleCount)) : 0),
    complexity = c.shape === 'organic' ? 1.18 : c.shape === 'linear' ? 0.96 : 1;
  const backFactor = head || bed ? 1 : 1 + (c.backDepth - 23) / 200;
  const netFabric = round(
    (head ? area * 1.6 : bed ? area * 0.85 + w * h : area * 2.4 * backFactor + 2.8) +
      ((((c.pillows * c.pillowWidth) / 100) * c.pillowHeight) / 100) * 3 +
      (chaise ? 1.2 : 0) +
      (c.covers === 'removable' ? 1 : 0)
  );
  const fabricMeters = round(netFabric * (1 + r.waste / 100));
  const hours = round(
    (head ? 6 + area * 1.8 : bed ? 12 + area * 2 : 9 + w * 3) * complexity +
      c.pillows * 0.5 +
      (c.mechanism !== 'none' ? 3 : 0) +
      (c.storage ? 2 : 0) +
      (c.covers === 'removable' ? 2 : 0) +
      (c.charging ? 1 : 0) +
      (c.lamps ? 1.5 : 0)
  );
  const rows = [],
    add = (id, name, qty, unit, rate, source) => {
      if (qty > 0)
        rows.push({
          id,
          name,
          qty,
          unit,
          rate,
          cost: Math.round(qty * rate),
          source: source || profile.sources[id] || 'Норма цифрового прототипа'
        });
    };
  add(
    'fabric',
    `Обивка ${f.collection} · с отходами ${r.waste}%`,
    fabricMeters,
    'пог. м',
    profile.fabricPrices[f.id] ?? f.price,
    profile.fabricSources[f.id] || 'Демонстрационная цена ткани'
  );
  add('frame', 'Каркас / основа', round(area * complexity), 'м² нормы', r.frame);
  add(
    'filling',
    'Мягкие слои и подушки',
    round(
      area * backFactor * (head ? 0.5 : 1) * (c.comfort === 'soft' ? 1.22 : c.comfort === 'firm' ? 1.08 : 1) +
        c.pillows * 0.12
    ),
    'м² нормы',
    r.foam,
    profile.sources.foam
  );
  add(
    head ? 'mount' : 'legs',
    head
      ? 'Крепёж изголовья'
      : `Опоры · ${{wood: 'дерево', black: 'графит', brass: 'латунь', none: 'без ножек'}[c.legs]}`,
    head || c.legs !== 'none' ? 1 : 0,
    'компл.',
    head ? r.mount : r[c.legs] || 0,
    profile.sources[head ? 'mount' : c.legs]
  );
  for (const [id, name, enabled] of [
    ['storage', 'Хранение и подъёмный узел', c.storage],
    ['woodArms', 'Деревянные детали подлокотников', c.woodArms],
    ['charging', 'Зарядка USB', c.charging],
    ['lamps', 'Встроенное освещение', c.lamps],
    ['covers', 'Съёмные чехлы', c.covers === 'removable']
  ])
    add(id, name, enabled ? 1 : 0, 'компл.', r[id]);
  if (c.mechanism !== 'none') add(c.mechanism, 'Механизм трансформации', 1, 'компл.', r[c.mechanism]);
  const seamMeters = round((w + d) * 2 + (c.pillows * (c.pillowWidth + c.pillowHeight)) / 50);
  add(
    'seam',
    c.seam === 'piping' ? 'Кант' : 'Дополнительная строчка',
    c.seam === 'single' || c.seam === 'none' ? 0 : seamMeters,
    'м',
    r.seam * (c.seam === 'double' ? 1.25 : 1)
  );
  add('connector', 'Соединения модулей', c.category === 'sofa' ? c.moduleCount - 1 : 0, 'стык', r.connector);
  add('labor', 'Производственные работы', hours, 'ч', r.labor);
  add('packing', 'Упаковка', 1, 'компл.', r.packing);
  const direct = rows.reduce((s, x) => s + x.cost, 0);
  add(
    'overhead',
    `Накладные ${r.overhead}%`,
    1,
    'компл.',
    Math.round((direct * r.overhead) / 100),
    profile.sources.overhead
  );
  const cost = rows.reduce((s, x) => s + x.cost, 0),
    price = Math.ceil(cost / (1 - r.targetMargin / 100) / 100) * 100,
    finalPrice = Math.round(price * (1 - discount / 100));
  return {
    catalogVersion: CATALOG_VERSION,
    rows,
    netFabric,
    fabricMeters,
    hours,
    area: round(area),
    direct,
    cost,
    price,
    finalPrice,
    discount,
    profit: finalPrice - cost,
    margin: finalPrice ? ((finalPrice - cost) / finalPrice) * 100 : 0,
    requiresApproval: finalPrice === 0 || (finalPrice - cost) / finalPrice < 0.35,
    illustrative: true,
    profileSnapshot: structuredClone(profile),
    formula: {netFabric, area: round(area), complexity, waste: r.waste, targetMargin: r.targetMargin},
    footprint: dimensions(c)
  };
}
