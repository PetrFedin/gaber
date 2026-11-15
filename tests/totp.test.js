import test from 'node:test';
import assert from 'node:assert/strict';
import {base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, otpauthUri, totpStep, verifyTotp} from '../server/auth/totp.js';

const secret = Buffer.from('12345678901234567890');
test('RFC 6238: контрольные значения для SHA-1', () => {
  // Таблица RFC 6238 (8 цифр); шестизначный код — её последние шесть цифр.
  for (const [t, code8] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037']])
    assert.equal(hotp(secret, Math.floor(t / 30), 8), code8, 't=' + t);
  assert.equal(hotp(secret, 1), '287082');
});
test('base32: круговое преобразование и ошибка на чужих символах', () => {
  assert.equal(base32Encode(secret), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), secret);
  assert.throws(() => base32Decode('1!'), /INVALID_BASE32/);
});
test('проверка кода: окно ±1 шаг, формат, повторное использование', () => {
  const now = 1_700_000_000_000, step = totpStep(now);
  assert.equal(verifyTotp(secret, hotp(secret, step), now).ok, true);
  assert.equal(verifyTotp(secret, hotp(secret, step - 1), now).ok, true);
  assert.equal(verifyTotp(secret, hotp(secret, step + 1), now).ok, true);
  assert.equal(verifyTotp(secret, hotp(secret, step + 2), now).ok, false, 'вне окна');
  assert.equal(verifyTotp(secret, hotp(secret, step - 2), now).ok, false, 'вне окна');
  for (const bad of ['12345', '1234567', 'abcdef', '', null, 123456]) assert.equal(verifyTotp(secret, bad, now).ok, false);
  const first = verifyTotp(secret, hotp(secret, step), now);
  assert.equal(verifyTotp(secret, hotp(secret, step), now, {lastStep: first.step}).ok, false, 'тот же код второй раз отвергается');
  assert.equal(verifyTotp(secret, hotp(secret, step + 1), now, {lastStep: first.step}).ok, true, 'следующий шаг допустим');
});
test('секрет шифруется AES-256-GCM: расшифровка верна, подмена и чужой ключ отвергаются', () => {
  const key = Buffer.alloc(32, 7), other = Buffer.alloc(32, 8);
  const enc = encryptSecret(secret, key);
  assert.match(enc, /^v1:/);
  assert.ok(!enc.includes(base32Encode(secret)));
  assert.deepEqual(decryptSecret(enc, key), secret);
  assert.notEqual(encryptSecret(secret, key), enc, 'случайный вектор инициализации');
  assert.throws(() => decryptSecret(enc, other));
  assert.throws(() => decryptSecret(enc.slice(0, -2) + 'AA', key));
  assert.throws(() => encryptSecret(secret, Buffer.alloc(16)), /INVALID_ENC_KEY/);
});
test('otpauth-ссылка содержит издателя, секрет и параметры', () => {
  const uri = otpauthUri('a@example.test', secret);
  assert.match(uri, /^otpauth:\/\/totp\/GABER:a%40example\.test\?secret=GEZDGNBV/);
  assert.match(uri, /issuer=GABER&algorithm=SHA1&digits=6&period=30$/);
});
