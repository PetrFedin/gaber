export const CATALOG_VERSION = 'demo-2026.10.17';
export const families = [
 {id:'sofa',name:'Диван',collection:'Linea',subtitle:'Модульная свобода',label:'LINEA / 01',description:'Спокойные линии, глубокая посадка и композиция, которая подстраивается под ваш ритм.',min:160,max:360,step:10},
 {id:'chair',name:'Кресло',collection:'Forma',subtitle:'Личное пространство',label:'FORMA / 02',description:'Мягкое кресло для любимого места. Выберите фактуру, характер опор и комфорт посадки.',min:75,max:120,step:5},
 {id:'headboard',name:'Изголовье',collection:'Tela',subtitle:'Архитектура отдыха',label:'TELA / 03',description:'Тактильные панели, деликатные пропорции и собственный цвет вашей спальни.',min:140,max:320,step:10}
];
export const fabrics = [
 {id:'linen',name:'Рогожка',collection:'Lino',price:1800,roughness:.95,sheen:.25,scale:100,desc:'Выразительное переплетение, матовая поверхность.',composition:'Демонстрационный материал',texture:'woven'},
 {id:'boucle',name:'Букле',collection:'Nuvola',price:2400,roughness:1,sheen:.4,scale:70,desc:'Объёмная фактура с мягким петлистым рисунком.',composition:'Демонстрационный материал',texture:'boucle'},
 {id:'velvet',name:'Велюр',collection:'Velluto',price:2900,roughness:.72,sheen:1,scale:150,desc:'Глубокий цвет и деликатный направленный блеск.',composition:'Демонстрационный материал',texture:'velvet'}
];
export const colors = [
 {id:'sand',name:'Тёплый песок',hex:'#b9aa91'},
 {id:'cream',name:'Молочный',hex:'#ded5c5'},
 {id:'sage',name:'Шалфей',hex:'#7f8d76'},
 {id:'clay',name:'Терракота',hex:'#a4664f'},
 {id:'ink',name:'Графит',hex:'#4a4e4b'},
 {id:'blue',name:'Сумеречный синий',hex:'#637985'}
];
export const initialConfig = (category='sofa') => ({category,width:category==='sofa'?280:category==='chair'?90:200,depth:category==='headboard'?15:100,height:category==='headboard'?120:82,layout:'straight',fabric:'boucle',color:'sand',legs:'wood',arm:'rounded',comfort:'balanced',pillows:category==='sofa'?2:category==='chair'?1:0,panels:5});
export const money = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(n);
export const getFamily=c=>families.find(x=>x.id===c.category);
export const getFabric=c=>fabrics.find(x=>x.id===c.fabric);
export const getColor=c=>colors.find(x=>x.id===c.color);
export function validate(c){
 const errors=[];const f=getFamily(c);
 if(!f)return ['Неизвестная категория изделия'];
 if(!Number.isFinite(c.width)||c.width<f.min||c.width>f.max||Math.abs((c.width-f.min)/f.step-Math.round((c.width-f.min)/f.step))>.001)errors.push(`Ширина: от ${f.min} до ${f.max} см с шагом ${f.step} см`);
 if(!getFabric(c))errors.push('Выберите материал');
 if(!getColor(c))errors.push('Выберите цвет');
 if(!['wood','black','brass'].includes(c.legs))errors.push('Неизвестный тип опор');
 if(!['rounded','slim','none'].includes(c.arm))errors.push('Неизвестный тип подлокотников');
 if(!['balanced','soft','firm'].includes(c.comfort))errors.push('Неизвестный вариант комфорта');
 if(!Number.isInteger(c.pillows)||c.pillows<0||c.pillows>6)errors.push('Количество подушек: от 0 до 6');
 if(!['straight','left','right'].includes(c.layout))errors.push('Неизвестная композиция');
 if(c.category!=='sofa'&&c.layout!=='straight')errors.push('Шезлонг доступен только для дивана');
 if(!Number.isFinite(c.depth)||c.depth<(c.category==='headboard'?12:85)||c.depth>(c.category==='headboard'?25:115))errors.push('Глубина вне диапазона');
 if(!Number.isFinite(c.height)||c.height<(c.category==='headboard'?90:75)||c.height>(c.category==='headboard'?150:100))errors.push('Высота вне диапазона');
 if(!Number.isInteger(c.panels)||c.panels<3||c.panels>8)errors.push('Количество панелей: от 3 до 8');
 if(c.category==='sofa'&&c.layout!=='straight'&&c.width<220)errors.push('Для шезлонга нужна ширина от 220 см');
 return errors;
}
export function estimate(c,discount=0){
 const errors=validate(c);if(errors.length)throw new Error(errors.join('. '));
 if(!Number.isFinite(discount)||discount<0||discount>30)throw new Error('Скидка: от 0 до 30%');
 const f=getFabric(c),w=c.width/100,d=c.depth/100,head=c.category==='headboard',chaise=c.category==='sofa'&&c.layout!=='straight';
 const fabricMeters=Math.round((head?w*(c.height/100)*1.65:w*d*2.4+2.8+(chaise?2.5:0)+c.pillows*.45)*10)/10;
 const hours=Math.round((head?6+w*1.8+c.panels*.35:9+w*3+(chaise?4:0)+c.pillows*.5+(c.arm==='rounded'?1:c.arm==='slim'?.5:0))*10)/10;
 const frame=Math.round(head?3500+w*2300+c.panels*120:(6500+w*3200+(chaise?4000:0))*(c.arm==='none'?.93:c.arm==='slim'?.98:1));
 const filling=Math.round((head?2200+w*1200:4500+w*2100+(chaise?2800:0))*(c.comfort==='soft'?1.22:c.comfort==='firm'?1.08:1));
 const legPrice=head?950:c.legs==='brass'?5400:c.legs==='black'?3200:3800;
 const rows=[
 {id:'fabric',name:`Обивка ${f.collection}`,qty:fabricMeters,unit:'пог. м',rate:f.price,cost:Math.round(fabricMeters*f.price),source:'Демонстрационная норма'},
 {id:'frame',name:head?'Основа и панели':'Каркас и соединения',qty:1,unit:'компл.',rate:frame,cost:frame,source:'Демонстрационная комплектация'},
 {id:'filling',name:'Мягкие слои и наполнение',qty:1,unit:'компл.',rate:filling,cost:filling,source:'Демонстрационная рецептура'},
 {id:'legs',name:head?'Монтажный комплект':'Опоры и фурнитура',qty:1,unit:'компл.',rate:legPrice,cost:legPrice,source:'Демонстрационный артикул'},
 {id:'labor',name:'Производственные работы',qty:hours,unit:'ч',rate:650,cost:Math.round(hours*650),source:'Демонстрационный маршрут'},
 {id:'packing',name:'Упаковка',qty:1,unit:'компл.',rate:1800,cost:1800,source:'Демонстрационная норма'}
 ];
 const direct=rows.reduce((s,r)=>s+r.cost,0);const overhead=Math.round(direct*.12);rows.push({id:'overhead',name:'Производственные накладные',qty:1,unit:'компл.',rate:overhead,cost:overhead,source:'12% от прямых затрат — демо'});
 const cost=direct+overhead,price=Math.ceil(cost/.6/100)*100,finalPrice=Math.round(price*(1-discount/100));
 return {catalogVersion:CATALOG_VERSION,rows,fabricMeters,hours,cost,price,finalPrice,discount,profit:finalPrice-cost,margin:(finalPrice-cost)/finalPrice*100,requiresApproval:(finalPrice-cost)/finalPrice<.35,illustrative:true};
}
export function dimensions(c){return {width:c.width,depth:c.category==='sofa'&&c.layout!=='straight'?c.depth+65:c.depth,height:c.height};}
export function normalize(input){
 if(!input||typeof input!=='object')return null;
 const base=initialConfig(input.category),out=Object.fromEntries(Object.keys(base).map(k=>[k,input[k]??base[k]]));
 return validate(out).length?null:out;
}
export function csv(rows){const cell=v=>'"'+String(v).replace(/^[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n');}
