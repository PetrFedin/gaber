import {estimateLeadTime} from './leadTime.js';

export const PRODUCTION_SCHEDULE_SCHEMA = 'gaber-demo-production-schedule/1';

function workPackagesFor(config) {
  const seating = ['sofa', 'chair', 'chairbed'].includes(config.category);
  return [
    {
      id: 'FRAME_AND_PANELS',
      label: config.category === 'headboard'
        ? 'Раскрой и подготовка панелей изголовья'
        : 'Раскрой, каркас и несущие узлы',
      durationWorkingDays: null,
      normStatus: 'factory_norm_required'
    },
    ...(seating ? [{
      id: 'SUPPORT_SYSTEM',
      label: 'Установка опорной системы и контроль крепления',
      durationWorkingDays: null,
      normStatus: 'factory_norm_required'
    }] : []),
    ...((config.mechanism && config.mechanism !== 'none') || config.storage ? [{
      id: 'MECHANISMS',
      label: 'Монтаж и проверка механизмов, зазоров и фиксации',
      durationWorkingDays: null,
      normStatus: 'factory_norm_required'
    }] : []),
    ...(config.charging || config.lamps ? [{
      id: 'ELECTRICAL',
      label: 'Электромодули и кабельные трассы по утверждённой схеме',
      durationWorkingDays: null,
      normStatus: 'factory_norm_required'
    }] : []),
    {
      id: 'UPHOLSTERY',
      label: config.covers === 'removable'
        ? 'Раскрой, пошив съёмных чехлов и обивка'
        : 'Раскрой, швейные операции и несъёмная обивка',
      durationWorkingDays: null,
      normStatus: 'factory_norm_required'
    },
    {
      id: 'FINAL_ASSEMBLY',
      label: 'Финальная сборка, комплектность и подготовка к контролю',
      durationWorkingDays: null,
      normStatus: 'factory_norm_required'
    }
  ];
}

/**
 * Working-day offsets derived from the same demo norms as the client summary.
 * No calendar dates, capacity reservation, operation-level duration or release.
 */
export function createProductionSchedule(config, hours) {
  const lead = estimateLeadTime(config, hours);
  const definitions = [
    {
      id: 'FACTORY_REVIEW_QUEUE',
      label: 'Проверка заказа и очередь',
      durationWorkingDays: lead.basis.queueWorkingDays,
      predecessor: 'factory_order_acceptance',
      gate: 'ORDER_REVIEW_AND_CAPACITY_UNCONFIRMED'
    },
    {
      id: 'PROCUREMENT',
      label: 'Материалы и комплектующие',
      durationWorkingDays: lead.basis.procurementWorkingDays,
      predecessor: 'FACTORY_REVIEW_QUEUE',
      gate: 'SUPPLIER_SKU_AND_AVAILABILITY_UNCONFIRMED'
    },
    {
      id: 'PRODUCTION',
      label: 'Производство · совокупная норма',
      durationWorkingDays: lead.basis.productionWorkingDays,
      predecessor: 'PROCUREMENT',
      gate: 'OPERATION_NORMS_AND_RELEASE_REQUIRED'
    },
    {
      id: 'QUALITY_CONTROL',
      label: 'Контроль качества и упаковка',
      durationWorkingDays: lead.basis.qualityControlWorkingDays,
      predecessor: 'PRODUCTION',
      gate: 'QC_ACT_AND_PACKING_RELEASE_REQUIRED'
    }
  ];

  let cursor = 0;
  const stages = definitions.map(stage => {
    const startWorkingDay = cursor + 1;
    cursor += stage.durationWorkingDays;
    return Object.freeze({
      ...stage,
      startWorkingDay,
      endWorkingDay: cursor,
      unit: 'working_days',
      status: 'illustrative_unconfirmed'
    });
  });

  if (cursor !== lead.minWorkingDays) throw new Error('SCHEDULE_LEAD_TIME_MISMATCH');

  return Object.freeze({
    schemaVersion: PRODUCTION_SCHEDULE_SCHEMA,
    normsVersion: lead.normsVersion,
    status: 'indicative',
    startEvent: lead.startEvent,
    startLabel: lead.startLabel,
    minWorkingDays: lead.minWorkingDays,
    maxWorkingDays: lead.maxWorkingDays,
    stages: Object.freeze(stages),
    workPackages: Object.freeze(workPackagesFor(config).map(Object.freeze)),
    uncertaintyReserve: Object.freeze({
      workingDays: lead.basis.uncertaintyWorkingDays,
      startsAfterWorkingDay: lead.minWorkingDays,
      endsAtWorkingDay: lead.maxWorkingDays,
      kind: 'schedule_contingency_not_an_operation'
    }),
    calendarDates: null,
    capacityStatus: 'unverified',
    operationNormsStatus: 'unverified',
    productionReleaseAllowed: false,
    excludes: lead.excludes,
    illustrative: true
  });
}
