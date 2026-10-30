/**
 * Exact planned partner deal economics in integer kopecks.
 * This is a proposal, NOT actual COGS, bank settlement or earned commission.
 */
export const PARTNER_ECONOMICS_SCHEMA='gaber-partner-economics/1';
const amount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
const positive=n=>amount(n)&&n>0;
export function calculatePartnerEconomics(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(k=>![
      'customerPriceKopecks','factoryCostKopecks','platformCommissionKopecks',
      'logisticsKopecks','taxKopecks','otherCostsKopecks'
    ].includes(k)))throw Error('ECONOMICS_INVALID');
 const {customerPriceKopecks,factoryCostKopecks,platformCommissionKopecks,
  logisticsKopecks,taxKopecks,otherCostsKopecks}=input;
 if(!positive(customerPriceKopecks)||!positive(factoryCostKopecks)||
    !amount(platformCommissionKopecks)||!amount(logisticsKopecks)||
    !amount(taxKopecks)||!amount(otherCostsKopecks))
  throw Error('ECONOMICS_INVALID');
 const total=BigInt(factoryCostKopecks)+BigInt(platformCommissionKopecks)+
  BigInt(logisticsKopecks)+BigInt(taxKopecks)+BigInt(otherCostsKopecks);
 if(total>BigInt(customerPriceKopecks))throw Error('NEGATIVE_DEAL_BALANCE');
 const reserve=BigInt(customerPriceKopecks)-total;
 const commissionBps=Number(BigInt(platformCommissionKopecks)*10000n/BigInt(customerPriceKopecks));
 return Object.freeze({
  schemaVersion:PARTNER_ECONOMICS_SCHEMA,
  customerPriceKopecks,factoryCostKopecks,platformCommissionKopecks,
  logisticsKopecks,taxKopecks,otherCostsKopecks,
  plannedReserveKopecks:Number(reserve),
  plannedCommissionBps:commissionBps,
  status:'PLANNED_UNVERIFIED',
  bankVerifiedKopecks:null,
  earnedCommissionKopecks:null,
  actualFactoryCostKopecks:null,
  productionRelease:{allowed:false}
 });
}
