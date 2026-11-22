/** Admin-only bootstrap for synthetic DEV warehouse. Never refresh or invent
 * quantities after depletion; ON CONFLICT DO NOTHING. Production prohibited.
 */
import {deriveDemoStockPlan} from '../inventoryPlan.js';
import {getInvestorDemoTemplates} from '../../src/investorDemo.js';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
export async function seedDevStockConfig({pool,tenantId,factoryId,config,copies=4}){
 if(process.env.NODE_ENV==='production'||!/^TENANT-(DEV|TEST)(?:-|$)/.test(tenantId)||
  !id(factoryId)||!Number.isSafeInteger(copies)||copies<1||copies>100)
  throw Error('DEV_STOCK_SEED_FORBIDDEN');
 const plan=deriveDemoStockPlan(config);
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  for(const line of plan.lines){
   const qty=line.requiredQty*copies;
   await c.query(`INSERT INTO gaber_orders.dev_stock_skus
    (tenant_id,factory_id,sku_id,part_ref,source_signature,name,on_hand_qty)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [tenantId,factoryId,line.skuId,line.partRef,line.sourceSignature,line.name,qty]);
  }
  await c.query('COMMIT');
  return plan;
 }catch(error){await c.query('ROLLBACK');throw error;}
 finally{c.release();}
}
export async function seedFiveDemoStockArticles({pool,tenantId,factoryId}){
 if(process.env.NODE_ENV==='production')throw Error('DEV_STOCK_SEED_FORBIDDEN');
 const articles=getInvestorDemoTemplates(),result=[];
 for(const item of articles)result.push({
  article:item.id,plan:await seedDevStockConfig({
   pool,tenantId,factoryId,config:item.config,copies:10
  })
 });
 return result;
}
