import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig, estimate, validate, normalize, csv, dimensions, families} from '../shared/domain.js';
test('all families produce consistent BOM and margin', () => {
  for (const f of families) {
    const c = initialConfig(f.id),
      e = estimate(c);
    assert.equal(
      e.cost,
      e.rows.reduce((s, r) => s + r.cost, 0)
    );
    assert.ok(e.price > e.cost);
    assert.ok(e.margin >= 40);
    assert.equal(e.illustrative, true);
  }
});
test('geometry and cost respond to configuration', () => {
  const c = initialConfig(),
    e = estimate(c),
    large = estimate({...c, width: 320});
  assert.ok(large.fabricMeters > e.fabricMeters);
  assert.ok(large.price > e.price);
  assert.equal(dimensions({...c, layout: 'left'}).depth, 165);
});
test('reject impossible assemblies and unsafe input', () => {
  assert.ok(validate({...initialConfig(), width: 180, layout: 'right'}).length);
  assert.ok(validate({...initialConfig(), width: NaN}).length);
  assert.equal(normalize({category: 'foreign'}), null);
  assert.throws(() => estimate({...initialConfig('chair'), layout: 'left'}));
  assert.throws(() => estimate(initialConfig(), -1));
  assert.throws(() => estimate(initialConfig(), NaN));
});
test('discount changes revenue and margin, never manufacturing cost', () => {
  const a = estimate(initialConfig()),
    b = estimate(initialConfig(), 15);
  assert.equal(a.cost, b.cost);
  assert.ok(b.margin < a.margin);
  assert.equal(b.requiresApproval, true);
});
test('normalization strips arbitrary fields and rejects wrong options', () => {
  const c = normalize({...initialConfig(), price: 1, role: 'admin'});
  assert.equal(c.price, undefined);
  assert.equal(c.role, undefined);
  assert.equal(normalize({...c, legs: 'unknown'}), null);
});
test('CSV escapes delimiters, quotations and spreadsheet formulas', () => {
  assert.match(csv([['=HYPERLINK("x")', 'a;b']]), /"'=HYPERLINK\(""x""\)"/);
});

test('new configuration rejects incompatible mechanisms and malformed colors', () => {
  const chair = initialConfig('chairbed');
  assert.deepEqual(validate(chair), []);
  assert.throws(() => estimate({...chair, mechanism: 'none'}));
  assert.throws(() => estimate({...initialConfig(), mechanism: 'recliner', storage: true}));
  assert.throws(() => estimate({...initialConfig('headboard'), storage: true}));
  assert.throws(() => estimate({...initialConfig(), pillowColors: ['sand']}));
  assert.throws(() => estimate({...initialConfig(), storage: 'yes'}));
});
test('every costed accessory adds an explicit line and increases cost', () => {
  const base = initialConfig(),
    e = estimate(base);
  for (const patch of [
    {storage: true},
    {woodArms: true},
    {charging: true},
    {lamps: true},
    {covers: 'removable'},
    {seam: 'piping'},
    {mechanism: 'fold'},
    {mechanism: 'slide'}
  ]) {
    const next = estimate({...base, ...patch});
    assert.ok(next.cost > e.cost, JSON.stringify(patch));
    assert.ok(next.rows.length > e.rows.length);
  }
  assert.ok(estimate({...base, legs: 'none'}).cost < e.cost);
  assert.ok(estimate({...base, backDepth: 40}).cost > e.cost);
  assert.ok(estimate({...base, pillowHeight: 65}).cost > e.cost);
});
import {defaultProfile, validProfile} from '../shared/costing.js';
test('editable profile feeds price, records sources and preserves snapshots', () => {
  const c = initialConfig(),
    p = defaultProfile(),
    a = estimate(c, 0, p);
  p.rates.labor = 1200;
  p.sources.labor = 'Тариф цеха от 17.10.2026';
  const b = estimate(c, 0, p);
  assert.ok(b.cost > a.cost);
  assert.equal(a.profileSnapshot.rates.labor, 650);
  assert.equal(b.rows.find((x) => x.id === 'labor').source, p.sources.labor);
  assert.equal(b.rows.find((x) => x.id === 'labor').rate, 1200);
  assert.equal(
    b.cost,
    b.rows.reduce((s, x) => s + x.cost, 0)
  );
  assert.ok(b.margin >= p.rates.targetMargin);
  p.rates.targetMargin = 100;
  assert.equal(validProfile(p), false);
  assert.throws(() => estimate(c, 0, p));
});
test('legacy configurations migrate safely to detailed config schema', () => {
  const legacy = {
    category: 'chair',
    width: 90,
    depth: 100,
    height: 82,
    fabric: 'boucle',
    color: 'sand',
    legs: 'wood',
    arm: 'rounded',
    comfort: 'balanced',
    pillows: 1,
    panels: 5,
    layout: 'straight'
  };
  const migrated = normalize(legacy);
  assert.ok(migrated);
  assert.equal(migrated.pillowHeight, 35);
  assert.equal(migrated.pillowColors.length, 8);
  assert.deepEqual(validate(migrated), []);
});
test('all combinations of category and surface produce finite auditable estimates', () => {
  for (const f of families)
    for (const fabric of [
      'linen',
      'boucle',
      'velvet',
      'leather',
      'felt',
      'chenille',
      'corduroy',
      'microfiber'
    ]) {
      const c = {...initialConfig(f.id), fabric},
        e = estimate(c);
      assert.ok(Number.isFinite(e.cost) && Number.isFinite(e.price));
      assert.ok(e.rows.every((x) => x.qty >= 0 && x.cost >= 0));
      assert.equal(
        e.cost,
        e.rows.reduce((s, x) => s + x.cost, 0)
      );
    }
});
