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
  const repository=createPostgresOrderRepository({pool});
  const journal=createOrderJournalService({
    repository,
    admission:admitOrderCommand,
    reducer:{appendOrderCommand,replayOrder},clock
  });
  return {
    ...journal,
    /**
     * Заказы, которые принципал вправе читать. Идентификаторы берутся под RLS tenant, а доступ и роль-DTO
     * для каждого заказа определяет тот же journal.read: чужие заказы в список не попадают.
     */
    async list({principal,limit=50}){
      if(!principal||principal.identitySource!=='server-session'||principal.authenticated!==true||
        typeof principal.tenantId!=='string')return {accepted:false,code:'NO_VERIFIED_SESSION'};
      const ids=await repository.listOrderIds({tenantId:principal.tenantId,limit});
      const orders=[];
      for(const orderId of ids){
        const r=await journal.read({principal,request:{orderId}});
        if(r?.accepted&&r.code==='ORDER_READ')orders.push(r.order);
      }
      return {accepted:true,code:'ORDERS_LISTED',orders};
    }
  };
}
