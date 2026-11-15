export const LEAD_TIME_SCHEMA = 'gaber-indicative-lead-time/1';
export const LEAD_TIME_NORMS_VERSION = 'demo-lead-time-v1';

const CATEGORY_MINIMUM_DAYS = Object.freeze({
  sofa: 4,
  chair: 2,
  chairbed: 4,
  bed: 5,
  headboard: 3
});

const QUEUE_DAYS = 5;
const PROCUREMENT_DAYS = 4;
const QC_DAYS = 1;
const HOURS_PER_WORKDAY = 7;

/**
 * Deterministic demo estimate, not a factory commitment or calendar promise.
 * The range starts only after a factory accepts the future order.
 */
export function estimateLeadTime(config, hours) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      !Object.hasOwn(CATEGORY_MINIMUM_DAYS, config.category) ||
      !Number.isFinite(hours) || hours <= 0 || hours > 500) {
    throw RangeError('INVALID_LEAD_TIME_INPUT');
  }

  const optionDays =
    (config.mechanism && config.mechanism !== 'none' ? 1 : 0) +
    (config.storage ? 1 : 0) +
    (config.covers === 'removable' ? 1 : 0) +
    (config.charging || config.lamps ? 1 : 0);
  const productionDays = Math.max(
    CATEGORY_MINIMUM_DAYS[config.category],
    Math.ceil(hours / HOURS_PER_WORKDAY)
  ) + optionDays;
  const minWorkingDays = QUEUE_DAYS + PROCUREMENT_DAYS + productionDays + QC_DAYS;
  const maxWorkingDays = minWorkingDays + 2 + Math.ceil(productionDays * 0.25);

  return Object.freeze({
    schemaVersion: LEAD_TIME_SCHEMA,
    normsVersion: LEAD_TIME_NORMS_VERSION,
    status: 'indicative',
    unit: 'working_days',
    minWorkingDays,
    maxWorkingDays,
    startEvent: 'factory_order_acceptance',
    startLabel: 'После принятия заказа фабрикой',
    basis: Object.freeze({
      queueWorkingDays: QUEUE_DAYS,
      procurementWorkingDays: PROCUREMENT_DAYS,
      productionWorkingDays: productionDays,
      qualityControlWorkingDays: QC_DAYS,
      uncertaintyWorkingDays: maxWorkingDays - minWorkingDays,
      productionHours: hours,
      hoursPerWorkday: HOURS_PER_WORKDAY,
      optionWorkingDays: optionDays
    }),
    excludes: Object.freeze(['delivery', 'installation', 'weekends_and_holidays']),
    illustrative: true
  });
}

export function formatLeadTime(leadTime) {
  if (leadTime?.schemaVersion !== LEAD_TIME_SCHEMA ||
      !Number.isInteger(leadTime.minWorkingDays) ||
      !Number.isInteger(leadTime.maxWorkingDays) ||
      leadTime.minWorkingDays <= 0 ||
      leadTime.maxWorkingDays < leadTime.minWorkingDays) {
    throw RangeError('INVALID_LEAD_TIME_RESULT');
  }
  return `${leadTime.minWorkingDays}–${leadTime.maxWorkingDays} рабочих дней`;
}
