import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig, estimate, validate, colors, fabrics, families} from '../src/domain.js';

// Параметры, которые намеренно не меняют себестоимость, и почему.
const NO_COST_EFFECT = {
  color: 'цвет ткани не меняет закупку: цену определяет коллекция ткани',
  seatColor: 'цвет зоны, оформление',
  backColor: 'цвет зоны, оформление',
  armColor: 'цвет зоны, оформление',
  room: 'интерьерная сцена, только визуализация',
  roomWidth: 'интерьерная сцена, только визуализация',
  roomDepth: 'интерьерная сцена, только визуализация',
  expanded: 'режим просмотра раскладки',
  exploded: 'режим просмотра разнесённой сборки',
  seatHeight: 'эргономический размер внутри общего габарита: цена считается по габаритам',
  seatDepth: 'эргономический размер внутри общего габарита: цена считается по габаритам',
  backLeanDeg: 'угол наклона спинки: геометрия, без отдельной нормы'
};
const VARIANTS = {
  width: (b) => [b.width + 20], depth: (b) => [b.depth + 10], height: (b) => [b.height + 10],
  layout: () => ['left'], fabric: () => fabrics.map((f) => f.id), color: () => colors.map((c) => c.id),
  legs: () => ['wood', 'black', 'brass', 'none'], arm: () => ['rounded', 'slim', 'none'], comfort: () => ['balanced', 'soft', 'firm'],
  pillows: () => [0, 2, 4, 8], panels: () => [3, 5, 8], shape: () => ['rounded', 'linear', 'organic'],
  backShape: () => ['straight', 'arched', 'winged'], backDepth: () => [15, 23, 40], pillowHeight: () => [20, 35, 65],
  pillowWidth: () => [25, 40, 70], pillowShape: () => ['square', 'lumbar', 'bolster'], seam: () => ['single', 'double', 'piping', 'none'],
  covers: () => ['fixed', 'removable'], storage: () => [true], mechanism: () => ['none', 'fold', 'slide', 'recliner'],
  woodArms: () => [true], charging: () => [true], lamps: () => [true], seatColor: () => ['sand', 'clay'],
  backColor: () => ['sand', 'clay'], armColor: () => ['sand', 'clay'], room: () => ['studio', 'loft'], roomWidth: () => [300, 800],
  roomDepth: () => [300, 800], seatHeight: () => [41, 50], seatDepth: () => [48, 65], backLeanDeg: () => [6, 18],
  support: () => ['zigzag', 'webbing'], seatCore: () => ['foam', 'pocket'], moduleCount: () => [2, 5], expanded: () => [true], exploded: () => [true]
};
test('каждый параметр конфигурации либо меняет себестоимость, либо явно назван неценовым', () => {
  const affects = {};
  for (const f of families) {
    const base = initialConfig(f.id), cost = estimate(base).cost;
    for (const [key, make] of Object.entries(VARIANTS))
      for (const v of make(base)) {
        const c = {...base, [key]: v};
        if (validate(c).length) continue;
        if (estimate(c).cost !== cost) affects[key] = true;
      }
  }
  for (const key of Object.keys(initialConfig())) {
    if (key === 'category' || key === 'pillowColors') continue;
    assert.ok(Object.hasOwn(VARIANTS, key), `параметр ${key} не описан в тесте: решите, влияет ли он на цену`);
    if (NO_COST_EFFECT[key]) assert.ok(!affects[key], `${key} помечен неценовым, но меняет цену`);
    else assert.ok(affects[key], `${key} не влияет на себестоимость ни в одной категории и не назван неценовым`);
  }
});
test('форма спинки, подлокотники, панели и подушки меняют трудоёмкость в нужных категориях', () => {
  const sofa = initialConfig('sofa'), head = initialConfig('headboard');
  const hours = (c) => estimate(c).hours;
  assert.ok(hours({...sofa, backShape: 'winged'}) > hours({...sofa, backShape: 'arched'}));
  assert.ok(hours({...sofa, backShape: 'arched'}) > hours(sofa));
  assert.ok(hours({...sofa, arm: 'none'}) < hours({...sofa, arm: 'slim'}));
  assert.ok(hours({...sofa, arm: 'slim'}) < hours(sofa));
  assert.ok(hours({...sofa, pillowShape: 'bolster'}) > hours(sofa));
  assert.ok(hours({...head, panels: 8}) > hours({...head, panels: 3}));
  // у изголовья нет спинки и подлокотников: эти параметры не создают скрытых затрат
  assert.equal(hours({...head, backShape: 'winged'}), hours(head));
  assert.equal(hours({...head, arm: 'none'}), hours(head));
});
