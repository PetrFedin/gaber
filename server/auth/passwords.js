import argon2 from 'argon2';

/** Пароли хранятся только как argon2id-хеш; открытый пароль не логируется и не сохраняется. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
export const hashPassword = (password) => argon2.hash(password, {type: argon2.argon2id});

let dummyHash;
/** Для несуществующего пользователя тоже тратим время хеширования, чтобы не раскрывать, зарегистрирована ли почта. */
export async function verifyPassword(hash, password) {
  if (!hash) {
    dummyHash ??= await hashPassword('gaber-dummy-password-for-timing');
    await argon2.verify(dummyHash, password).catch(() => false);
    return false;
  }
  return argon2.verify(hash, password).catch(() => false);
}
