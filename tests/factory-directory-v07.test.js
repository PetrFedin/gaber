import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPostgresOrderRepository} from '../server/postgresOrderRepository.js';

function mockPool(statusByFactory){
 const statements=[];
 const pool={async connect(){
  return {
   async query(sql,params=[]){
    statements.push({sql,params});
    if(sql.includes('FROM gaber_orders.factory_directory')){
     const [tenantId,factoryId]=params;
     return {rowCount:tenantId==='TENANT-ONE'&&statusByFactory.get(factoryId)==='approved'?1:0,
      rows:[]};
    }
    return {rowCount:0,rows:[]};
   },
   release(){}
  };
 }};
 return {pool,statements};
}
test('factory roster is tenant-scoped, approved-only and never inferred from a string',async()=>{
 const {pool,statements}=mockPool(new Map([
  ['FACTORY-OK','approved'],['FACTORY-REVOKED','suspended']
 ]));
 const repo=createPostgresOrderRepository({pool});
 await repo.withOrderTransaction({tenantId:'TENANT-ONE',orderId:'ORDER-1'},async tx=>{
  assert.equal(await tx.isFactoryApproved({factoryId:'FACTORY-OK'}),true);
  assert.equal(await tx.isFactoryApproved({factoryId:'FACTORY-REVOKED'}),false);
  assert.equal(await tx.isFactoryApproved({factoryId:'UNREGISTERED'}),false);
  assert.equal(await tx.isFactoryApproved({factoryId:'FACTORY-OK OR 1=1'}),false);
  assert.equal(await tx.isFactoryApproved({factoryId:null}),false);
 });
 const rosterQueries=statements.filter(x=>x.sql.includes('FROM gaber_orders.factory_directory'));
 assert.equal(rosterQueries.length,3,'Invalid IDs must not reach SQL');
 for(const row of rosterQueries){
  assert.equal(row.params[0],'TENANT-ONE');
  assert.match(row.sql,/status='approved'/);
  assert.match(row.sql,/verified_at IS NOT NULL/);
  assert.match(row.sql,/tenant_id=\$1 AND factory_id=\$2/);
 }
 assert.equal(statements[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
 assert.equal(statements.at(-1).sql,'COMMIT');
});
test('unknown factory cannot bypass the tenant key via caller-supplied scope',async()=>{
 const {pool,statements}=mockPool(new Map([['FACTORY-OK','approved']]));
 const repo=createPostgresOrderRepository({pool});
 await repo.withOrderTransaction({tenantId:'TENANT-TWO',orderId:'ORDER-1'},async tx=>{
  // A different tenant is allowed to query its own directory, never TENANT-ONE.
  assert.equal(await tx.isFactoryApproved({factoryId:'FACTORY-OK'}),false);
 });
 const q=statements.find(x=>x.sql.includes('FROM gaber_orders.factory_directory'));
 assert.deepEqual(q.params,['TENANT-TWO','FACTORY-OK']);
});
test('staging migration 007 requires approved directory FK and keeps onboarding separate',()=>{
 const sql=readFileSync(new URL('../server/migrations/007_verified_factory_directory_hold.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE gaber_orders\.factory_directory/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/REFERENCES gaber_orders\.factory_directory\(tenant_id,factory_id\)/);
 assert.match(sql,/UNVERIFIED_LEGACY_FACTORY_ASSIGNMENTS/);
 assert.match(sql,/REVOKE ALL ON gaber_orders\.factory_directory FROM PUBLIC/);
 assert.doesNotMatch(sql,/INSERT INTO gaber_orders\.factory_directory/,
  'Never seed unverified factories as approved during migration');
});
