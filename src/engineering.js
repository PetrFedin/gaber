import {validate,dimensions,getFabric} from './domain.js';

/**
 * GABER engineering concept model.
 * Every number below is a preliminary design assumption, NOT a factory norm,
 * measured CAD geometry, load calculation, material certificate or approval.
 * One deterministic config drives this model, inspection geometry and tech exports.
 */
export const ENGINEERING_VERSION = 'gaber-engineering-concept-0.4.2';
const cmToMm = n => Math.round(n * 10);
const round1 = n => Math.round(n * 10) / 10;
const makePart = (id, name, quantity, sizeMm, material, operation, sourceFields) => ({
  id,name,quantity,sizeMm,material,operation,sourceFields,approval:'factory-review-required'
});
const makeLayer = (id, zone, label, thicknessMm, densityKgM3, role, evidence) => ({
  id,zone,label,thicknessMm,densityKgM3,role,
  evidence:evidence || 'Паспорт поставщика: плотность, IFD/CLD, остаточная деформация и партия'
});
const gate = (id, status, message) => ({id,status,message});

function seatStack(c) {
  if(c.seatCore === 'pocket') return [
    makeLayer('seat-pocket','seat','Кассета Pocket Spring в текстильных карманах',80,null,'Упругий сердечник','Артикул, диаметр проволоки, число/м², зона жёсткости, тест усталости'),
    makeLayer('seat-hr35','seat','ППУ HR35 — номинальная проектная плотность',50,35,'Распределение нагрузки'),
    makeLayer('seat-periotek','seat','Периотек / объёмный настил',10,null,'Разделительный мягкий настил','Плотность, толщина и паспорт конкретного полотна')
  ];
  const core = c.comfort === 'soft' ? [85,45,35,30] : c.comfort === 'firm' ? [110,20,40,30] : [100,30,35,30];
  return [
    makeLayer('seat-core','seat','Основной ППУ HR' + core[2] + ' — проектный класс',core[0],core[2],'Опорный слой'),
    makeLayer('seat-top','seat','Верхний ППУ HR' + core[3] + ' — проектный класс',core[1],core[3],'Комфортный слой'),
    makeLayer('seat-periotek','seat','Периотек / объёмный настил',10,null,'Защитный настил','Паспорт материала, толщина, масса на м²')
  ];
}

export function getEngineeringModel(c) {
  const errors = validate(c);
  if(errors.length) throw new Error('Неверная конфигурация: ' + errors.join('; '));
  const d = dimensions(c);
  const head = c.category === 'headboard', bed = c.category === 'bed', seating = !head && !bed;
  const n = c.category === 'sofa' ? c.moduleCount : 1;
  const armCm = seating && c.arm !== 'none' ? (c.arm === 'slim' ? 12 : 23) : 0;
  const usableWidthCm = c.width - armCm * 2;
  const moduleWidthCm = round1(usableWidthCm / n);
  const frameDepthCm = seating ? round1(c.depth - c.backDepth - 7) : 0;
  const seatLayers = seating ? seatStack(c) : [];
  const seatStackMm = seatLayers.reduce((sum,layer) => sum + layer.thicknessMm,0);
  const frameTopCm = seating ? round1(c.seatHeight - seatStackMm / 10) : null;
  // 650 mm is added to the OUTER product depth. Frame rails are inset
  // from upholstery; the structural extension is calculated independently.
  const outerDepthExtensionMm=650;
  const conceptFrontRailInsetMm=40;
  const baseFrontRailZMm=round1(
    -c.depth*5+c.backDepth*10+c.seatDepth*5+frameDepthCm*5-20
  );
  const chaiseEndRailZMm=c.depth*5+outerDepthExtensionMm-conceptFrontRailInsetMm;
  const chaise = c.category==='sofa'&&c.layout!=='straight' ? {
    side:c.layout,moduleIndex:c.layout==='left'?0:n-1,
    outerDepthExtensionMm,frontRailInsetMm:conceptFrontRailInsetMm,
    baseFrontRailZMm,frontRailZMm:chaiseEndRailZMm,
    extensionMm:round1(chaiseEndRailZMm-baseFrontRailZMm),
    moduleWidthMm:cmToMm(moduleWidthCm),
    loadPath:'cantilever not assumed; forward rail requires separately rated supports',
    qualification:'concept-only: bending, connections, dynamic loading and stability unverified'
  } : null;
  const fabric = getFabric(c);
  const cutList = [];
  if(seating) {
    const longitudinal = cmToMm(moduleWidthCm - 8);
    const side = cmToMm(frameDepthCm - 8);
    cutList.push(
      makePart('FRAME-F','Передняя и задняя царги',2*n,{length:longitudinal,width:40,height:60},'Брус хвойных пород 40×60 мм, влажность/сорт на проверку','Распил, контроль геометрии, соединение',['width','moduleCount','arm']),
      makePart('FRAME-S','Боковые царги модулей',2*n,{length:side,width:40,height:60},'Брус хвойных пород 40×60 мм','Распил и соединение',['depth','backDepth']),
      makePart('FRAME-X','Поперечина жёсткости',n,{length:longitudinal,width:40,height:60},'Брус хвойных пород 40×60 мм','Усиление под опору',['width','moduleCount']),
      makePart('FRAME-K','Угловые косынки',4*n,{length:90,width:90,height:18},'Берёзовая фанера 18 мм, класс и эмиссия на проверку','Раскрой, крепёж по результатам расчёта',['moduleCount']),
      makePart('BACK-P','Основание спинки',n,{length:cmToMm(moduleWidthCm-2),width:cmToMm(Math.max(20,c.height-c.seatHeight+8)),height:12},'Берёзовая фанера 12 мм, проектный вариант','Раскрой, крепление, контроль угла',['width','height','seatHeight','backLeanDeg'])
    );
    if(armCm)cutList.push(makePart('ARM-P','Боковины подлокотников',2,{length:cmToMm(c.depth-4),width:cmToMm(Math.max(10,c.seatHeight+18)),height:18},'Берёзовая фанера 18 мм','Раскрой, закладные, крепление',['arm','depth','seatHeight']));
    if(chaise)cutList.push(
      makePart('CHAISE-F','Торцевая царга удлинения шезлонга',1,{length:cmToMm(moduleWidthCm-8),width:40,height:60},'Брус 40×60 мм; проектное сечение','Проверить торцевой узел и установку опор',['layout','width','moduleCount']),
      makePart('CHAISE-S','Продольная царга шезлонга',2,{length:chaise.extensionMm-40,width:40,height:60},'Брус 40×60 мм; проектное сечение','Стыковка с поперечной царгой модуля',['layout']),
      makePart('CHAISE-X','Поперечное усиление шезлонга',1,{length:cmToMm(moduleWidthCm-8),width:40,height:60},'Брус 40×60 мм; проектное сечение','Уточнить положение усиления',['layout','width','moduleCount']),
      makePart('CHAISE-K','Передние угловые косынки',2,{length:90,width:90,height:18},'Берёзовая фанера 18 мм; проектное сечение','Конструкция крепежа на проверку',['layout'])
    );
  } else if(bed) {
    cutList.push(
      makePart('BED-L','Продольные царги кровати',2,{length:cmToMm(c.depth-8),width:200,height:18},'Берёзовая фанера 18 мм; усиления по расчёту','Раскрой, кромка, стяжки',['depth']),
      makePart('BED-T','Поперечные царги кровати',2,{length:cmToMm(c.width-4),width:200,height:18},'Берёзовая фанера 18 мм','Раскрой, кромка, стяжки',['width']),
      makePart('HB-P','Несущие панели изголовья',c.panels,{length:cmToMm(c.width/c.panels-1),width:cmToMm(c.height),height:12},'Берёзовая фанера 12 мм; крепление к базе TBD','Раскрой, обивка, крепление',['width','height','panels'])
    );
  } else {
    cutList.push(
      makePart('HB-P','Несущие панели изголовья',c.panels,{length:cmToMm(c.width/c.panels-1),width:cmToMm(c.height),height:12},'Берёзовая фанера 12 мм','Раскрой, контроль радиусов/крепления',['width','height','panels']),
      makePart('HB-R','Монтажные рейки',2,{length:cmToMm(c.width-8),width:40,height:60},'Сухой хвойный брус 40×60 мм','Контроль крепления к стене или кровати',['width'])
    );
  }
  const layers = [
    ...seatLayers,
    ...(seating ? [
      makeLayer('back-foam','back','ППУ HR25 — проектный класс',50,25,'Мягкость спинки'),
      makeLayer('back-batting','back','Периотек / настил',10,null,'Мягкий переход к чехлу','Толщина и поверхностная плотность')
    ] : [
      makeLayer('head-foam','headboard','ППУ HR25 — проектный класс',40,25,'Мягкая панель'),
      makeLayer('head-batting','headboard','Периотек / настил',10,null,'Сглаживание рёбер','Толщина и поверхностная плотность')
    ]),
    ...(c.pillows ? [makeLayer('pillow-fill','pillow','Холлофайбер: состав и масса набивки TBD',null,null,'Декоративные подушки','Артикул волокна, масса набивки, восстановление объёма')] : [])
  ];
  const suspension = seating
    ? {type:c.support,spacingMm:c.support==='webbing'?85:90,
       countPerModule:Math.max(2,Math.ceil(moduleWidthCm/(c.support==='webbing'?8.5:9))),
       note:c.support==='webbing'
       ? 'Эластичные ленты, проектный шаг ≈85 мм; ширина ленты и предварительное натяжение по паспорту'
       : 'Пружины-змейки, проектный шаг ≈90 мм; калибр, длина и крепление по паспорту'}
    : {type:bed?'slats-by-supplier':'mounting-rails',spacingMm:null,countPerModule:null,
       note:bed?'Ламели, латодержатели и подъёмный механизм — только по спецификации выбранного поставщика':'Крепление на стене/раме требует расчёта анкеров и основания'};
  const seamNames = {single:'Одинарная стачная строчка',double:'Двойная отделочная строчка',piping:'Кант с кордом',none:'Скрытый шов'};
  const upholstery = {
    digitalFabricId:fabric.id,
    digitalCollection:fabric.collection,
    verifiedSupplierSku:null,
    seam:seamNames[c.seam],
    cover:c.covers==='removable'?'Съёмный чехол с технологическим доступом':'Несъёмная обивка',
    seamAllowanceMm:12,
    seamAllowanceStatus:'design-assumption',
    napDirection:'По техкарте и направлению ворса реального артикула',
    patternRepeatMm:null,
    cuttingPlanStatus:'not-calculated',
    inspection:['Раппорт и направление ворса','Совместимость кроя, толщины и растяжимости','Кант, утяжки и места технологических швов','Усадка, стойкость окраски, пиллинг, горючесть']
  };
  const hardware = [
    ...(seating && c.category==='sofa' ? [{id:'connector',qty:n-1,name:'Замки межмодульные',evidence:'Артикул, допуски, усилие разъёма, схема монтажа'}] : []),
    ...(c.mechanism!=='none' ? [{id:'mechanism',qty:1,name:'Механизм ' + c.mechanism,evidence:'Чертёж производителя, кинематика, крепление, нагрузки и безопасные зазоры'}] : []),
    ...(c.storage ? [{id:'storage',qty:1,name:bed?'Подъёмный механизм основания кровати':'Короб хранения',evidence:'Артикул, нагрузка, газлифты/петли, фиксация, доступ к обслуживанию'}] : []),
    ...(c.legs!=='none' && !head ? [{id:'legs',qty:1,name:'Комплект опор ' + c.legs,evidence:'Артикул, высота, узел крепления, допустимая нагрузка и испытания устойчивости'}] : []),
    ...(c.charging ? [{id:'charging',qty:1,name:'USB-электромодуль',evidence:'Модель блока питания, электробезопасность, кабельный маршрут, тепловой режим'}] : []),
    ...(c.lamps ? [{id:'lamps',qty:1,name:'Светильники',evidence:'Модель, драйвер, напряжение, температура, доступ к обслуживанию'}] : []),
    ...(c.covers==='removable' ? [{id:'zipper',qty:1,name:'Молнии/фиксация съёмного чехла',evidence:'Артикул, ресурс циклов, технологические припуски'}] : []),
    ...(chaise ? [{id:c.legs==='none'?'chaisePlinth':'chaiseFoot',qty:c.legs==='none'?1:2,
      name:c.legs==='none'?'Подпорный цоколь шезлонга':'Дополнительная передняя опора шезлонга',
      evidence:'Точки опирания, крепежи, устойчивость и паспорт допустимой нагрузки требуют подтверждения'}] : [])
  ];
  const checks = [
    gate('CONFIG_SCHEMA','pass','Все значения проходят схему конфигурации'),
    gate('PART_DIMENSIONS',cutList.every(p=>p.quantity>0&&Object.values(p.sizeMm).every(x=>Number.isFinite(x)&&x>0))?'pass':'review','Все детали должны иметь положительные технологические размеры'),
    ...(seating ? [
      gate('MODULE_CLEARANCE',moduleWidthCm>=52?'pass':'review', 'Ширина посадочного модуля >= 52 см — внутренний проектный порог, не норматив'),
      gate('SEAT_ENVELOPE',c.seatDepth+c.backDepth+7<=c.depth?'pass':'review','Глубина посадки + спинка + 7 см техзазора должны помещаться в габарит'),
      gate('SEAT_VERTICAL',frameTopCm>=22&&c.height>=c.seatHeight+18?'pass':'review','Высота базы под настил и высота спинки требуют компоновочной проверки')
    ] : []),
    ...(chaise ? [
      gate('CHAISE_LOAD_PATH','pending','Требуются испытания несущей схемы и соединений удлинения шезлонга'),
      gate('CHAISE_SUPPORT','pending','Требуется утверждённая конструкция опор шезлонга, устойчивость и предельные нагрузки')
    ] : []),
    gate('SUPPLIER_PROOFS','pending','Нужны реальные артикулы, сертификаты, партии и паспорта материалов'),
    gate('LOAD_STABILITY','pending','Нужны испытания конструкции, соединений, устойчивости и долговечности'),
    gate('CUTTING_AND_TOLERANCE','pending','Нужны утверждённые рабочие CAD-чертежи, раскрой, припуски и допуски'),
    gate('FOAM_TESTS','pending','Нужны плотность, IFD/CLD и испытания остаточной деформации реального ППУ'),
    gate('UPHOLSTERY_TESTS','pending','Нужны испытания обивки и применимые требования пожарной безопасности'),
    ...(c.mechanism!=='none'||c.storage?[gate('KINEMATICS','pending','Подтвердить механизм, коллизии, зоны защемления, ресурс и крепления')]:[]),
    ...(c.charging||c.lamps?[gate('ELECTRICAL','pending','Проверить схему, защиту, электробезопасность и тепловой режим')]:[])
  ];
  return {
    schemaVersion:ENGINEERING_VERSION,
    status:'CONCEPT_ONLY_NOT_FOR_PRODUCTION',
    source:{
      catalogCategory:c.category,
      configuration:structuredClone(c),
      dimensionSource:'src/domain.js:dimensions',
      engineeringBasis:'Проектные предположения GABER; не размеры готовой фабричной модели'
    },
    envelopeCm:d,
    geometry:{
      moduleCount:n,
      armCm,usableWidthCm,moduleWidthCm,frameDepthCm,
      seatHeightCm:seating?c.seatHeight:null,
      seatDepthCm:seating?c.seatDepth:null,
      backLeanDeg:seating?c.backLeanDeg:null,
      seatPitchDeg:seating?3:null,
      frameTopCm,seatStackMm,chaise
    },
    cutList,layers,suspension,upholstery,hardware,checks,
    productionRelease:{
      allowed:false,
      reason:'Нет утверждённой КД, подтверждённых поставщиков и результатов испытаний',
      blockingChecks:checks.filter(g=>g.status!=='pass').map(g=>g.id)
    }
  };
}
