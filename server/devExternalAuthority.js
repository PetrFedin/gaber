import {SIMULATABLE_EXTERNAL_ACTIONS} from './accessPolicy.js';

/**
 * DEV-симулятор внешних полномочий (производство, перевозчик). ТОЛЬКО для локальной разработки и демонстрации.
 * Он снимает защиту PRODUCTION HOLD для команд start, complete, quality_pass, ship, deliver, accept_delivery,
 * но не имитирует банк: проверка оплаты, списания и возвраты остаются закрытыми, productionRelease.allowed=false.
 * Включить его в production или для не-dev tenant нельзя: функция выбрасывает ошибку при запуске сервера.
 */
export const DEV_SIMULATED_COMMANDS = Object.freeze(['start', 'complete', 'quality_pass', 'ship', 'deliver', 'accept_delivery']);
export const DEV_TENANT_PATTERN = /^TENANT-(DEV|TEST)[A-Za-z0-9_.:-]*$/;
export function createDevExternalAuthority({production, tenantId}) {
  if (production) throw Error('DEV_EXTERNAL_AUTHORITY_FORBIDDEN_IN_PRODUCTION');
  if (typeof tenantId !== 'string' || !DEV_TENANT_PATTERN.test(tenantId))
    throw Error('DEV_EXTERNAL_AUTHORITY_REQUIRES_DEV_TENANT');
  return Object.freeze({
    label: 'DEV_SIMULATED_EXTERNAL_AUTHORITY',
    grants: new Set(SIMULATABLE_EXTERNAL_ACTIONS),
    commandTypes: new Set(DEV_SIMULATED_COMMANDS)
  });
}
