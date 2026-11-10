// Только для локальной разработки и тестов. Пользователи и пароли ДЕМОНСТРАЦИОННЫЕ, организации вымышленные.
// Это не проверенные бизнес-личности и не onboarding. setup.mjs отказывается работать при NODE_ENV=production.
export const DEV_TENANT = 'TENANT-DEV';
export const DEV_FACTORY = 'FAB-DEV-1';
export const devUsers = [
  {email: 'partner@gaber.local', name: 'Демо-партнёр GABER', role: 'partner', password: 'dev-partner-Rt4-pass'},
  {email: 'factory@gaber.local', name: 'Демо-фабрика', role: 'factory', factoryId: DEV_FACTORY, password: 'dev-factory-Lm8-pass'},
  {email: 'client@gaber.local', name: 'Демо-клиент', role: 'client', password: 'dev-client-Hz2-pass'}
];
