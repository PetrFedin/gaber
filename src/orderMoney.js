/** Order amounts are integer kopecks; display must preserve every kopeck. */
const formatter=new Intl.NumberFormat('ru-RU',{
 style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2
});
export function orderMoney(kopecks){
 if(!Number.isSafeInteger(kopecks)||kopecks<0)throw TypeError('INVALID_MONEY_KOPECKS');
 const amount=BigInt(kopecks);
 return formatter.formatToParts(amount/100n).map(part=>part.type==='fraction'
  ?String(amount%100n).padStart(2,'0'):part.value).join('');
}
