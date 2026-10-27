/** This file is server-only and never imported by the browser's Vite entry. */
import {appendOrderCommand,replayOrder} from '../src/orderWorkflow.js';
import {admitOrderCommand} from './orderCommandAdmission.js';
import {createOrderJournalService} from './orderJournalService.js';
import {createPostgresOrderRepository} from './postgresOrderRepository.js';

/**
 * This is NOT an HTTP endpoint or login mechanism. Only trusted server
 * bootstrap code may supply an authenticated principal and the pg Pool.
 */
export function wirePostgresOrderJournal({pool,clock=Date.now}) {
  return createOrderJournalService({
    repository:createPostgresOrderRepository({pool}),
    admission:admitOrderCommand,
    reducer:{appendOrderCommand,replayOrder},clock
  });
}
