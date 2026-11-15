import {colors, getColor, getFabric} from './domain.js';

export const DESIGN_GUIDANCE_SCHEMA = 'gaber-design-guidance/1';

export const PART_LABELS = Object.freeze({
  seat: 'Сиденье и основание',
  back: 'Спинка и изголовье',
  arm: 'Подлокотники',
  legs: 'Опоры и цоколь',
  pillow: 'Декоративные подушки',
  frame: 'Несущий каркас',
  filling: 'Слои наполнения',
  support: 'Опорная система'
});

const colorName = id => id === 'inherit'
  ? 'как основная обивка'
  : colors.find(color => color.id === id)?.name || 'цвет требует проверки';
const seating = config => ['sofa', 'chair', 'chairbed'].includes(config.category);
const bedLike = config => ['bed', 'headboard'].includes(config.category);
const mechanismName = {none: 'без механизма', fold: 'раскладной', slide: 'выкатной', recliner: 'реклайнер'};

export function getAvailableParts(config, inspection = false) {
  if (!config || typeof config !== 'object') return [];
  const parts = [];
  if (config.category === 'headboard') parts.push('back', 'legs');
  else if (config.category === 'bed') {
    parts.push('seat', 'back', 'legs');
    if (config.pillows > 0) parts.push('pillow');
  } else if (seating(config)) {
    parts.push('seat', 'back');
    if (config.arm !== 'none') parts.push('arm');
    parts.push('legs');
    if (config.pillows > 0) parts.push('pillow');
  }
  if (inspection) {
    parts.push('frame', 'filling');
    if (config.category !== 'headboard') parts.push('support');
  }
  return [...new Set(parts)].filter(id => PART_LABELS[id]);
}

export function getPartDescriptor(config, partId) {
  if (!config || !PART_LABELS[partId] || !getAvailableParts(config, true).includes(partId)) return null;
  const fabric = getFabric(config);
  const color = getColor(config);
  const common = {
    id: partId,
    title: PART_LABELS[partId],
    status: 'Цифровой эскиз · требуется проверка фабрики'
  };
  if (partId === 'seat') {
    if (config.category === 'bed') return {...common,
      title: 'Основание кровати',
      description: `Основание показано в габарите ${config.width} × ${config.depth} см. Матрас в сцене условный и не входит в подтверждённую комплектацию.`,
      facts: [['Обивка', `${fabric?.name || '—'} / ${color?.name || '—'}`], ['Хранение', config.storage ? 'подъёмный узел предусмотрен в эскизе' : 'не выбрано']],
      assemblyNote: 'Ламели, крепления и подъёмный механизм выбираются по спецификации поставщика; нагрузка и зазоры здесь не рассчитаны.'
    };
    return {...common,
      title: 'Сиденье и посадка',
      description: `${config.seatCore === 'pocket' ? 'Кассета Pocket Spring с слоями ППУ' : 'Многослойный ППУ'} и ${config.support === 'webbing' ? 'эластичные ремни' : 'пружины-змейки'} в опорной системе. Посадка ${config.seatHeight} см, полезная глубина ${config.seatDepth} см.`,
      facts: [['Комфорт', {soft: 'мягкий', balanced: 'сбалансированный', firm: 'упругий'}[config.comfort]], ['Цвет сиденья', colorName(config.seatColor)], ['Чехол', config.covers === 'removable' ? 'съёмный' : 'несъёмный']],
      assemblyNote: 'Слои показаны условными прямоугольными контурами. Плотность, упругость и усадку материалов подтверждают паспортами и прототипом.'
    };
  }
  if (partId === 'back') return {...common,
    title: config.category === 'sofa' || seating(config) ? 'Спинка' : 'Изголовье',
    description: bedLike(config)
      ? `${config.panels} мягких панелей, высота ${config.height} см. Форма: ${config.backShape === 'arched' ? 'арочная' : config.backShape === 'winged' ? 'с боковыми крыльями' : 'прямая'}.`
      : `Толщина ${config.backDepth} см, наклон ${config.backLeanDeg}° от вертикали. Обивка: ${fabric?.name || '—'}, цвет — ${colorName(config.backColor)}.`,
    facts: [['Высота', `${config.height} см`], ['Шов', {single: 'одинарный', double: 'двойной', piping: 'кант', none: 'скрытый'}[config.seam]], ['Покрытие', config.covers === 'removable' ? 'съёмный чехол' : 'несъёмная обивка']],
    assemblyNote: 'Крепление, радиусы, направление ворса и припуски на пошив требуют рабочего чертежа и физического образца.'
  };
  if (partId === 'arm') return {...common,
    description: `${config.arm === 'slim' ? 'Тонкие' : 'Округлые'} подлокотники. ${config.woodArms ? 'Добавлены деревянные накладки. ' : ''}${config.charging || config.lamps ? 'Предусмотрена встроенная электрика.' : 'Без встроенной электрики.'}`,
    facts: [['Цвет', colorName(config.armColor)], ['Дерево', config.woodArms ? 'накладки выбраны' : 'не выбрано'], ['Оснащение', [config.charging && 'USB', config.lamps && 'свет'].filter(Boolean).join(' + ') || 'нет']],
    assemblyNote: 'Для USB и света нужны кабельный маршрут, сервисный доступ, защита от перегрева и проверка электробезопасности.'
  };
  if (partId === 'legs') return {...common,
    description: config.legs === 'none'
      ? 'Вместо отдельных ножек показан опорный цоколь. Его высоту и площадь опирания нужно проверить в конструкции.'
      : `Выбраны опоры: ${{wood: 'дерево', black: 'металл, графит', brass: 'латунь'}[config.legs]}. Положение в сцене показывает принцип опирания, а не утверждённые узлы крепления.`,
    facts: [['Тип', config.legs === 'none' ? 'цоколь' : 'отдельные опоры'], ['Механизм', mechanismName[config.mechanism] || 'проверить']],
    assemblyNote: 'Нагрузка, устойчивость, крепёж и дополнительные опоры шезлонга должны быть подтверждены расчётом и испытаниями.'
  };
  if (partId === 'pillow') return {...common,
    description: `${config.pillows} шт., форма — ${{square: 'квадратная', lumbar: 'поясничная', bolster: 'валик'}[config.pillowShape]}. Размер каждой подушки в эскизе: ${config.pillowWidth} × ${config.pillowHeight} см.`,
    facts: [['Первый цвет', colorName(config.pillowColors?.[0])], ['Наполнение', 'состав и масса не подтверждены']],
    assemblyNote: 'Восстановление объёма, массу набивки и посадку чехла проверяют на физическом образце.'
  };
  if (partId === 'frame') return {...common,
    description: `Пространственная схема несущих элементов для конфигурации ${config.width} × ${config.depth} × ${config.height} см. Используются те же проектные детали, что и в инженерном концепте.`,
    facts: [['Статус', 'концепт, не рабочий CAD'], ['Модули', config.category === 'sofa' ? `${config.moduleCount}` : config.category === 'bed' || config.category === 'headboard' ? 'панельная схема' : '1']],
    assemblyNote: 'Сечения, соединения, крепёж и допуски не утверждены. Разнесение деталей объясняет состав, но не моделирует порядок работ и коллизии.'
  };
  if (partId === 'filling') return {...common,
    description: seating(config)
      ? `Видны проектные слои сиденья и спинки. Основа сиденья: ${config.seatCore === 'pocket' ? 'Pocket Spring + ППУ' : 'многослойный ППУ'}; комфорт — ${config.comfort}.`
      : 'Видны условные слои ППУ и мягкого настила панелей изголовья.',
    facts: [['Профиль', config.comfort], ['Геометрия', 'неутверждённые прямоугольные контура']],
    assemblyNote: 'Это не симуляция сжатия. Плотность, IFD/CLD, остаточная деформация и совместимость слоёв требуют паспортов и испытаний.'
  };
  return {...common,
    title: config.category === 'bed' ? 'Ламели и опорные узлы' : 'Опорная система',
    description: config.category === 'bed'
      ? 'Ламели показаны как проектная опорная схема основания кровати.'
      : `${config.support === 'webbing' ? 'Эластичные ремни' : 'Пружины-змейки'} повторяют количество и положение из общей инженерной модели.`,
    facts: [['Механизм', mechanismName[config.mechanism] || 'проверить'], ['Хранение', config.storage ? 'выбрано' : 'нет']],
    assemblyNote: 'Артикулы, натяжение, крепления, ресурс, нагрузка и безопасные зазоры не подтверждены.'
  };
}

function advisory(id, severity, title, explanation, recommendation) {
  return {id, severity, title, explanation, recommendation};
}

/** Gentle, deterministic heuristics. Hard incompatibilities remain in validate(). */
export function getDesignAdvisories(config) {
  if (!config || typeof config !== 'object') return [];
  const out = [];
  if (seating(config)) {
    const count = config.category === 'sofa' ? config.moduleCount : 1;
    const arm = config.arm === 'none' ? 0 : config.arm === 'slim' ? 12 : 23;
    const moduleWidth = (config.width - arm * 2) / count;
    if (Number.isFinite(moduleWidth) && moduleWidth < 58) out.push(advisory(
      'narrow-seat', moduleWidth < 52 ? 'review' : 'attention',
      'Проверьте ширину посадочного модуля',
      `По проектному расчёту на модуль остаётся около ${moduleWidth.toFixed(1).replace('.', ',')} см. Узкая посадка может быть менее удобной, а количество швов и соединений увеличится.`,
      'Уменьшите число модулей, увеличьте общую ширину или запросите эргономический прототип. Порог 52 см в инженерной модели является проектным, не нормативом.'
    ));
    if (config.seatHeight >= 49 && config.seatDepth >= 63) out.push(advisory(
      'high-deep-seat', 'attention', 'Высокая и глубокая посадка',
      'Сочетание может затруднить опору стопами на пол и удобный выход из кресла или дивана.',
      'Сравните высоту 45–48 см и глубину 55–62 см; итог проверьте на посадочном макете.'
    ));
    if (config.pillows > 0 && config.pillowHeight >= 55 && config.seatDepth <= 52) out.push(advisory(
      'pillow-depth', 'attention', 'Подушки сократят полезную глубину',
      'Высокие подушки на сравнительно короткой посадке могут оставить меньше места для спины и бёдер.',
      'Уменьшите подушки, увеличьте глубину посадки или проверьте компоновку на макете.'
    ));
    if (config.covers === 'removable' && config.mechanism !== 'none') out.push(advisory(
      'moving-cover', 'review', 'Съёмный чехол и подвижный механизм',
      'При трансформации чехол не должен попадать в зоны защемления или мешать ходу механизма.',
      'До пошива запросите кинематическую схему поставщика и проверьте зазоры на прототипе.'
    ));
    if (config.legs === 'none' && (config.mechanism !== 'none' || config.storage)) out.push(advisory(
      'plinth-clearance', 'review', 'Цоколь рядом с внутренним узлом',
      'Низкое основание может ограничить место для механизма, вентиляции или сервисного доступа.',
      'Согласуйте высоту цоколя с чертежом механизма и оставьте доступ для обслуживания.'
    ));
  }
  if (bedLike(config)) {
    const panelWidth = config.width / config.panels;
    if (Number.isFinite(panelWidth) && panelWidth < 28) out.push(advisory(
      'narrow-panels', 'attention', 'Частый ритм узких панелей',
      `Ширина панели около ${panelWidth.toFixed(1).replace('.', ',')} см. Больше стыков требует точного выравнивания и может визуально дробить изголовье.`,
      'Уменьшите количество панелей или закажите образец стыка и раскладки ткани.'
    ));
  }
  if (config.fabric === 'leather' && (config.shape === 'organic' || config.comfort === 'soft')) out.push(advisory(
    'leather-soft-form', 'review', 'Мягкая форма и кожаная обивка',
    'На плавных и мягких формах возможны заломы и неравномерное натяжение; цифровой материал не предсказывает поведение реального полотна.',
    'Проверьте растяжимость выбранного материала, крой и швы на физическом фрагменте.'
  ));
  if (config.charging || config.lamps) out.push(advisory(
    'integrated-electrics', 'review', 'Заложите обслуживание электрики',
    'Встроенные USB и светильники требуют кабельного маршрута, теплового режима и доступа для замены компонентов.',
    'До согласования выберите реальные модули и попросите фабрику показать схему подключения и сервисный люк.'
  ));
  return out;
}
