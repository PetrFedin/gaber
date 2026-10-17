export const CATALOG_VERSION = 'demo-2026.10.17';
export const families = [
 {id:'sofa',name:'Диван',collection:'Linea',subtitle:'Модульная свобода',label:'LINEA / 01',description:'Спокойные линии, глубокая посадка и композиция, которая подстраивается под ваш ритм.',min:160,max:360,step:10},
 {id:'chair',name:'Кресло',collection:'Forma',subtitle:'Личное пространство',label:'FORMA / 02',description:'Мягкое кресло для любимого места. Выберите фактуру, характер опор и комфорт посадки.',min:75,max:120,step:5},
 {id:'chairbed',name:'Кресло-кровать',collection:'Cambio',subtitle:'Два сценария одного места',label:'CAMBIO / 04',description:'Компактное кресло с раскладным спальным местом.',min:80,max:140,step:5},
 {id:'bed',name:'Кровать',collection:'Notte',subtitle:'Тихая архитектура спальни',label:'NOTTE / 05',description:'Мягкая кровать с индивидуальным изголовьем и хранением.',min:140,max:240,step:10},
 {id:'headboard',name:'Изголовье',collection:'Tela',subtitle:'Архитектура отдыха',label:'TELA / 03',description:'Тактильные панели, деликатные пропорции и собственный цвет вашей спальни.',min:140,max:320,step:10}
];
export const fabrics = [
 {id:'linen',name:'Рогожка',collection:'Lino',price:1800,roughness:.95,sheen:.25,scale:100,desc:'Выразительное переплетение, матовая поверхность.',composition:'Демонстрационный материал',texture:'woven'},
 {id:'boucle',name:'Букле',collection:'Nuvola',price:2400,roughness:1,sheen:.4,scale:70,desc:'Объёмная фактура с мягким петлистым рисунком.',composition:'Демонстрационный материал',texture:'boucle'},
 {id:'velvet',name:'Велюр',collection:'Velluto',price:2900,roughness:.72,sheen:1,scale:150,desc:'Глубокий цвет и деликатный направленный блеск.',composition:'Демонстрационный материал',texture:'velvet'}
];
fabrics.push(...[ ['chenille','Шенилл','Chene',2200,.92,.5,'woven'],['microfiber','Микрофибра','Micro',1600,.85,.35,'velvet'],['corduroy','Микровельвет','Riga',2600,.9,.6,'ribbed'],['leather','Кожа · имитация','Pelle',4200,.52,.15,'leather'],['felt','Фетр','Feltro',2000,1,.1,'felt'] ].map(([id,name,collection,price,roughness,sheen,texture])=>({id,name,collection,price,roughness,sheen,texture,scale:100,desc:'Процедурный цифровой образец. Характер поверхности требует сверки с физическим материалом.',composition:'Демонстрационный материал'})));
export const colors = [
 {id:'sand',name:'Тёплый песок',hex:'#b9aa91'},
 {id:'cream',name:'Молочный',hex:'#ded5c5'},
 {id:'sage',name:'Шалфей',hex:'#7f8d76'},
 {id:'clay',name:'Терракота',hex:'#a4664f'},
 {id:'ink',name:'Графит',hex:'#4a4e4b'},
 {id:'blue',name:'Сумеречный синий',hex:'#637985'}
];
colors.push(...[['olive','Олива','#62664b'],['wine','Вино','#683f46'],['ochre','Охра','#bd914d'],['rose','Пыльная роза','#be9790'],['cocoa','Какао','#796355'],['white','Слоновая кость','#eee8db']].map(([id,name,hex])=>({id,name,hex})));
export const isHead=c=>c.category==='headboard';
export const isBed=c=>c.category==='bed';
export const isChair=c=>['chair','chairbed'].includes(c.category);
export const bounds=c=>({depth:isHead(c)?[12,30]:isBed(c)?[200,230]:[85,125],height:isHead(c)||isBed(c)?[90,160]:[75,110]});
export const initialConfig = (category='sofa') => ({category,width:category==='sofa'?280:['chair','chairbed'].includes(category)?90:200,depth:category==='headboard'?15:category==='bed'?215:100,height:['headboard','bed'].includes(category)?120:82,layout:'straight',fabric:'boucle',color:'sand',legs:'wood',arm:'rounded',comfort:'balanced',pillows:category==='sofa'?2:['chair','chairbed','bed'].includes(category)?1:0,panels:5,shape:'rounded',backShape:'straight',backDepth:23,pillowHeight:35,pillowWidth:40,pillowShape:'square',pillowColors:Array(8).fill('inherit'),seatColor:'inherit',backColor:'inherit',armColor:'inherit',seam:'single',covers:'fixed',storage:false,mechanism:category==='chairbed'?'fold':'none',woodArms:false,charging:false,lamps:false,room:'studio',roomWidth:500,roomDepth:450,expanded:false,exploded:false,moduleCount:3});
export const money = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(n);
export const getFamily=c=>families.find(x=>x.id===c.category);
export const getFabric=c=>fabrics.find(x=>x.id===c.fabric);
export const getColor=c=>colors.find(x=>x.id===c.color);
export function validate(c){
 const errors=[],f=getFamily(c);if(!f)return ['Неизвестная категория изделия'];
 const range=(key,min,max,step=1)=>{if(!Number.isFinite(c[key])||c[key]<min||c[key]>max||Math.abs((c[key]-min)/step-Math.round((c[key]-min)/step))>.001)errors.push(`${key}: ${min}–${max}, шаг ${step}`);};
 range('width',f.min,f.max,f.step);range('depth',...bounds(c).depth);range('height',...bounds(c).height);range('pillows',0,8);range('panels',3,8);range('backDepth',15,40);range('pillowHeight',20,65);range('pillowWidth',25,70);range('roomWidth',250,1000,10);range('roomDepth',250,1000,10);range('moduleCount',2,5);
 const enums={legs:['wood','black','brass','none'],arm:['rounded','slim','none'],comfort:['balanced','soft','firm'],layout:['straight','left','right'],shape:['rounded','linear','organic'],backShape:['straight','arched','winged'],pillowShape:['square','lumbar','bolster'],seam:['single','double','piping','none'],covers:['fixed','removable'],mechanism:['none','fold','slide','recliner'],room:['studio','apartment','house','loft','hotel']};
 for(const [k,v] of Object.entries(enums))if(!v.includes(c[k]))errors.push(`Неизвестное значение: ${k}`);
 if(!getFabric(c)||!getColor(c))errors.push('Неизвестный материал или цвет');
 for(const k of ['seatColor','backColor','armColor'])if(c[k]!=='inherit'&&!colors.some(x=>x.id===c[k]))errors.push('Неизвестный цвет зоны');
 if(!Array.isArray(c.pillowColors)||c.pillowColors.length!==8||c.pillowColors.some(x=>x!=='inherit'&&!colors.some(y=>y.id===x)))errors.push('Неверная палитра подушек');
 for(const k of ['storage','woodArms','charging','lamps','expanded','exploded'])if(typeof c[k]!=='boolean')errors.push(`Неверный переключатель: ${k}`);
 if(c.category!=='sofa'&&c.layout!=='straight')errors.push('Шезлонг доступен только для дивана');
 if(c.layout!=='straight'&&c.width<220)errors.push('Для шезлонга нужна ширина от 220 см');
 if(c.category==='chairbed'&&!['fold','slide'].includes(c.mechanism))errors.push('Для кресла-кровати нужен раскладной механизм');
 if(isHead(c)&&(c.storage||c.mechanism!=='none'||c.woodArms||c.pillows))errors.push('Изголовье не содержит сиденье, подлокотники и хранение');
 if(isBed(c)&&c.mechanism!=='none')errors.push('Для кровати используется подъёмный узел хранения');
 if(c.woodArms&&(c.arm==='none'||isBed(c)))errors.push('Деревянные вставки требуют подлокотников');
 if(c.mechanism==='recliner'&&(c.storage||c.layout!=='straight'))errors.push('Реклайнер несовместим с хранением и шезлонгом в демо-модели');
 return errors;
}
export {estimate} from './costing.js';
export function dimensions(c){return {width:c.width,depth:c.category==='sofa'&&c.layout!=='straight'?c.depth+65:c.depth,height:c.height};}
export function normalize(input){
 if(!input||typeof input!=='object')return null;
 const base=initialConfig(input.category),out=Object.fromEntries(Object.keys(base).map(k=>[k,input[k]??base[k]]));
 return validate(out).length?null:out;
}
export function csv(rows){const cell=v=>'"'+String(v).replace(/^[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n');}
