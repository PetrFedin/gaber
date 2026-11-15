/**
 * Exact form input at the HTTP order boundary. Never round customer-entered
 * money or percentages: the authoritative reducers use integer kopecks/bps.
 */
export const MAX_ORDER_KOPECKS = 1_000_000_000_000;
const MONEY = /^(?:\d{1,11}|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?$/;
const PERCENT = /^\d{1,3}(?:[.,]\d{1,2})?$/;
const fail = (code) => { throw Object.assign(new RangeError(code), {code}); };

/** Ruble string -> integer kopecks. Non-positive costs can be left blank. */
export function parseOrderKopecks(input, {positive = false, allowEmpty = false} = {}) {
  if (typeof input !== 'string') fail('INVALID_MONEY_FORMAT');
  const raw = input.trim();
  if (!raw && allowEmpty && !positive) return 0;
  if (!MONEY.test(raw)) fail('INVALID_MONEY_FORMAT');
  const [rubles, decimals = ''] = raw.replace(/[ \u00a0\u202f]/g, '').replace(',', '.').split('.');
  const amount = Number(rubles) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > MAX_ORDER_KOPECKS || (positive && amount === 0))
    fail('MONEY_OUT_OF_RANGE');
  return amount;
}

/** Percentage points -> integer basis points, exactly 0..10000. */
export function parseOrderBasisPoints(input, {allowEmpty = false} = {}) {
  if (typeof input !== 'string') fail('INVALID_PERCENT_FORMAT');
  const raw = input.trim();
  if (!raw && allowEmpty) return 0;
  if (!PERCENT.test(raw)) fail('INVALID_PERCENT_FORMAT');
  const [whole, decimals = ''] = raw.replace(',', '.').split('.');
  const bps = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (bps > 10_000) fail('PERCENT_OUT_OF_RANGE');
  return bps;
}
