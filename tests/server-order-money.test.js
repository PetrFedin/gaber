import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_ORDER_KOPECKS, parseOrderKopecks, parseOrderBasisPoints} from '../src/serverOrderMoney.js';

test('exact kopecks preserve comma/dot inputs and optionally grouped thousands', () => {
  for (const [raw, value] of [
    ['2100,05', 210005], ['1000.01', 100001], ['1 000,05', 100005],
    ['1\u202f000,05', 100005], ['1\u00a0000,05', 100005],
    ['0', 0], ['0,01', 1], ['1,2', 120], [' 2,00 ', 200],
    ['10000000000', MAX_ORDER_KOPECKS]
  ]) assert.equal(parseOrderKopecks(raw), value, raw);
  assert.equal(parseOrderKopecks('', {allowEmpty: true}), 0);
});

test('exact money rejects rounding, malformed grouping, exponent, negative and out-of-range', () => {
  for (const raw of ['2100,005', '1000.999', '1 00,01', '1e4', 'Infinity',
    '-1', '+1', '1.0.0', '1,', '', '10000000000,01', '10000000001',
    '1,000,000', '1_000', '.5', '12,345']) {
    assert.throws(() => parseOrderKopecks(raw), RangeError, raw);
  }
  assert.throws(() => parseOrderKopecks(100), RangeError);
  assert.throws(() => parseOrderKopecks('0', {positive: true}), {code: 'MONEY_OUT_OF_RANGE'});
  assert.throws(() => parseOrderKopecks('', {allowEmpty: true, positive: true}), {code: 'INVALID_MONEY_FORMAT'});
});

test('percentage is exact to 0.01pp and bounded to 0..100', () => {
  for (const [raw, bps] of [['0', 0], ['50', 5000], ['12,34', 1234], ['12.3', 1230], ['100', 10000], ['100,00', 10000]])
    assert.equal(parseOrderBasisPoints(raw), bps, raw);
  assert.equal(parseOrderBasisPoints('', {allowEmpty: true}), 0);
  for (const raw of ['50,999', '100,01', '101', '-1', '+1', '1e2', '12 3', '', '10,', '0x10'])
    assert.throws(() => parseOrderBasisPoints(raw), RangeError, raw);
});
