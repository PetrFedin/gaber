import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

/** TOTP по RFC 6238 (HMAC-SHA1, 6 цифр, шаг 30 с) без внешних зависимостей. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw Error('INVALID_BASE32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export function hotp(secret, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}
export const totpStep = (nowMs, period = 30) => Math.floor(nowMs / 1000 / period);
/**
 * Проверка кода в окне ±window шагов. Шаги не больше lastStep отвергаются: один код нельзя использовать дважды.
 * Возвращает {ok, step}.
 */
export function verifyTotp(secret, code, nowMs, {window = 1, lastStep = -1} = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return {ok: false};
  const now = totpStep(nowMs);
  for (let d = -window; d <= window; d++) {
    const step = now + d;
    if (step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) return {ok: true, step};
  }
  return {ok: false};
}
export const newTotpSecret = () => randomBytes(20);
export const otpauthUri = (email, secret) =>
  `otpauth://totp/GABER:${encodeURIComponent(email)}?secret=${base32Encode(secret)}&issuer=GABER&algorithm=SHA1&digits=6&period=30`;

// Секрет в базе хранится зашифрованным (AES-256-GCM), ключ только в окружении сервера.
export function encryptSecret(secret, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('INVALID_ENC_KEY');
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(secret), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
export function decryptSecret(text, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32 || !text?.startsWith('v1:')) throw Error('INVALID_ENC_KEY');
  const raw = Buffer.from(text.slice(3), 'base64url');
  const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}
