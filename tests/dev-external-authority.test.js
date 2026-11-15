import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeGaberAction, SIMULATABLE_EXTERNAL_ACTIONS} from '../server/accessPolicy.js';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
import {createOrderJournalService} from '../server/orderJournalService.js';
import {createDevExternalAuthority, DEV_SIMULATED_COMMANDS} from '../server/devExternalAuthority.js';
import {loadConfig} from '../server/config.js';

const now = 1_800_000_000_000;
const factory = {authenticated: true, identitySource: 'server-session', subject: 'U-f', tenantId: 'TENANT-DEV', roles: ['factory'], factoryId: 'FAB-1', sessionExpiresAtMs: now + 60_000, mfaVerified: true};
const order = {source: 'server-repository', tenantId: 'TENANT-DEV', orderId: 'O-1', clientId: 'U-c', factoryId: 'FAB-1'};
const sim = createDevExternalAuthority({production: false, tenantId: 'TENANT-DEV'});

test('по умолчанию внешние полномочия закрыты, grants открывают только два имитируемых действия', () => {
  const ask = (action, externalGrants) => authorizeGaberAction({principal: factory, resource: order, action, nowMs: now, externalGrants});
  assert.equal(ask('production.start').reason, 'EXTERNAL_AUTHORITY_REQUIRED');
  assert.equal(ask('production.start', new Set()).reason, 'EXTERNAL_AUTHORITY_REQUIRED');
  assert.equal(ask('production.start', sim.grants).allowed, true);
  assert.equal(ask('shipments.confirm_carrier', sim.grants).allowed, true);
  // банк и допуск производства имитировать нельзя, даже если их передать в grants
  for (const action of ['payments.verify_bank', 'payments.charge', 'payments.refund', 'factory.production_release'])
    assert.equal(ask(action, new Set([action])).reason, 'EXTERNAL_AUTHORITY_REQUIRED', action);
  assert.deepEqual([...SIMULATABLE_EXTERNAL_ACTIONS].sort(), ['production.start', 'shipments.confirm_carrier']);
});
test('admission: start закрыт без симулятора и открыт с ним; роль и MFA по-прежнему проверяются', () => {
  const cmd = {type: 'start', role: 'factory', payload: {}};
  assert.equal(admitOrderCommand({principal: factory, resource: order, command: cmd, nowMs: now}).code, 'EXTERNAL_AUTHORITY_REQUIRED');
  assert.equal(admitOrderCommand({principal: factory, resource: order, command: cmd, nowMs: now, externalGrants: sim.grants}).allowed, true);
  const noMfa = {...factory, mfaVerified: false};
  assert.equal(admitOrderCommand({principal: noMfa, resource: order, command: {type: 'ship', role: 'factory', payload: {}}, nowMs: now, externalGrants: sim.grants}).code, 'MFA_REQUIRED');
  const client = {authenticated: true, identitySource: 'server-session', subject: 'U-c', tenantId: 'TENANT-DEV', roles: ['client'], clientId: 'U-c', sessionExpiresAtMs: now + 60_000};
  assert.equal(admitOrderCommand({principal: client, resource: order, command: cmd, nowMs: now, externalGrants: sim.grants}).code, 'ROLE_FORBIDDEN');
});
test('журнал: без симулятора закрытые команды отклоняются до обращения к базе, с ним доходят до неё', async () => {
  let touched = 0;
  const repository = {withOrderTransaction: async () => { touched++; return {accepted: false, code: 'STUB'}; }};
  const base = {repository, admission: admitOrderCommand, reducer: {replayOrder() {}, appendOrderCommand() {}}, clock: () => now};
  const request = {orderId: 'O-1', requestId: 'R-1', expectedVersion: 1, type: 'start', payload: {}, revisionId: 'R1'};
  const closed = createOrderJournalService(base);
  assert.equal((await closed.execute({principal: factory, request})).code, 'EXTERNAL_AUTHORITY_REQUIRED');
  assert.equal(touched, 0);
  const open = createOrderJournalService({...base, simulatedExternalAuthority: sim});
  await open.execute({principal: factory, request});
  assert.equal(touched, 1);
});
test('симулятор нельзя создать в production и для не-dev tenant, команды ограничены шестью', () => {
  assert.throws(() => createDevExternalAuthority({production: true, tenantId: 'TENANT-DEV'}), /FORBIDDEN_IN_PRODUCTION/);
  assert.throws(() => createDevExternalAuthority({production: false, tenantId: 'TENANT-ACME'}), /REQUIRES_DEV_TENANT/);
  assert.throws(() => createDevExternalAuthority({production: false, tenantId: 'PROD-TENANT'}), /REQUIRES_DEV_TENANT/);
  assert.ok(createDevExternalAuthority({production: false, tenantId: 'TENANT-TEST-1'}));
  assert.deepEqual([...sim.commandTypes].sort(), [...DEV_SIMULATED_COMMANDS].sort());
  assert.equal(sim.commandTypes.size, 6);
  assert.ok(Object.isFrozen(sim));
});
test('конфигурация: флаг симулятора запрещён в production, как и dev-флаг MFA', () => {
  const env = {GABER_ORDERS_DATABASE_URL: 'x', GABER_AUTH_DATABASE_URL: 'y', GABER_TENANT_ID: 'TENANT-DEV'};
  assert.equal(loadConfig({...env, GABER_DEV_SIMULATE_EXTERNAL_AUTHORITY: '1'}).simulateExternalAuthority, true);
  assert.equal(loadConfig(env).simulateExternalAuthority, false);
  assert.throws(() => loadConfig({...env, NODE_ENV: 'production', GABER_DEV_SIMULATE_EXTERNAL_AUTHORITY: '1'}), /запрещён в production/);
  assert.throws(() => loadConfig({...env, NODE_ENV: 'production', GABER_DEV_ASSUME_MFA: '1'}), /запрещён в production/);
});
