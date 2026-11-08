// Только для локальной разработки и тестов. Пользователи и пароли ДЕМОНСТРАЦИОННЫЕ.
// Не использовать в продакшене: seed.js отказывается запускаться при NODE_ENV=production.
export const seedUsers = [
  {email: 'manager@gaber.local', name: 'Демо-менеджер', role: 'manager', password: 'dev-manager-Zk3-pass'},
  {email: 'tech@gaber.local', name: 'Демо-технолог', role: 'technologist', password: 'dev-tech-Qm7-pass'},
  {email: 'client@gaber.local', name: 'Демо-клиент', role: 'client', password: 'dev-client-Wp5-pass'}
];
