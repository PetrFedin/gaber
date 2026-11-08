// Клиентская точка входа в общий домен. Расчёт (estimate) и нормы сюда намеренно не экспортируются:
// они живут только на сервере (shared/costing.js). Это проверяет tests/server.test.js.
export {
  CATALOG_VERSION,
  families,
  fabrics,
  colors,
  isHead,
  isBed,
  isChair,
  bounds,
  initialConfig,
  money,
  getFamily,
  getFabric,
  getColor,
  validate,
  checkConfig,
  dimensions,
  normalize,
  csv
} from '../shared/domain.js';
