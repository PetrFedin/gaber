import { visibleOrderMessages } from "./orderMessageChannels.js";

export const PICKUP_CARRIER = "Самовывоз с фабрики · демо";

const JOURNEY_STEPS = [
  ["project", "Проект"],
  ["estimate", "Смета и ТЗ"],
  ["offer", "Цена и оплата"],
  ["production", "Производство"],
  ["readiness", "Готовность"],
  ["fulfilment", "Получение"],
  ["closed", "Приёмка"],
];

const STAGE_INDEX = {
  requested: 0,
  awaiting_factory: 1,
  factory_confirmed: 1,
  factory_changes: 1,
  offered: 2,
  accepted: 2,
  change_requested: 2,
  production: 3,
  quality: 4,
  ready: 4,
  shipped: 5,
  delivered: 5,
  disputed: 5,
  closed: 6,
};

export function isPickupOrder(state) {
  return state?.shipment?.carrier === PICKUP_CARRIER;
}

export function orderStageLabel(state) {
  if (isPickupOrder(state)) {
    if (state.stage === "shipped") return "Ожидает самовывоза";
    if (state.stage === "delivered") return "Выдан клиенту";
  }
  return null;
}

export function getOrderJourney(state) {
  const activeIndex = STAGE_INDEX[state.stage] ?? 0;
  return JOURNEY_STEPS.map(([id, label], index) => ({
    id,
    label,
    status:
      state.stage === "closed" || index < activeIndex
        ? "done"
        : index === activeIndex
          ? "current"
          : "upcoming",
  }));
}

export function getNextOrderAction(state, role, financials) {
  const factoryAssigned = Boolean(state.assignedFactoryId);
  if (state.stage === "closed") {
    return role === "partner"
      ? "Заказ принят, полный расчёт учтён локально. Проверьте итоговый демо-расчёт комиссии."
      : "Заказ принят. Демо-инструкция по сборке и документы доступны ниже.";
  }
  if (state.stage === "requested" && role === "partner") {
    return factoryAssigned
      ? "Заполните смету и ТЗ, затем отправьте их фабрике на подтверждение."
      : "Назначьте фабрику, затем подготовьте смету и техническое задание.";
  }
  if (state.stage === "awaiting_factory") {
    return role === "factory"
      ? "Проверьте концепт-ТЗ, стоимость и срок, затем подтвердите или верните его."
      : "Ожидается проверка ТЗ фабрикой.";
  }
  if (state.stage === "factory_confirmed" && role === "partner") {
    return "Фабрика ответила. Опубликуйте клиенту предложение с ценой, авансом и сроком.";
  }
  if (state.stage === "offered" && role === "client") {
    return "Проверьте комплектацию, полную цену, аванс и срок, затем согласуйте предложение или запросите изменения.";
  }
  if (state.stage === "accepted") {
    if (financials.advanceDueKopecks > 0) {
      if (role === "partner")
        return "Добавьте локальную запись аванса. Это демо-учёт, не подтверждение банка.";
      if (role === "client")
        return "Сообщите об оплате аванса. Запуск откроется после локального учёта аванса партнёром.";
      return "Ожидается локальный учёт аванса партнёром.";
    }
    return role === "factory"
      ? "Аванс учтён в демо. Запустите производственный сценарий."
      : "Всё готово для запуска демо-производства фабрикой.";
  }
  if (state.stage === "production")
    return role === "factory"
      ? "После завершения работ передайте изделие на контроль качества."
      : "Фабрика выполняет демо-производство. Плановая дата указана в предложении.";
  if (state.stage === "quality")
    return role === "factory"
      ? "Зафиксируйте акт контроля качества, чтобы открыть этап готовности."
      : "Идёт демо-контроль качества. Сведения о готовности появятся после акта фабрики.";
  if (state.stage === "ready") {
    if (financials.balanceKopecks > 0) {
      if (role === "partner")
        return "Изделие готово в демо. Учтите остаток оплаты перед выдачей или отгрузкой.";
      return "Изделие готово в демо. Ожидается полный расчёт перед получением.";
    }
    return role === "factory"
      ? "Выберите доставку или самовывоз и зафиксируйте следующий этап."
      : "Изделие готово. Фабрика выбирает и фиксирует способ получения.";
  }
  if (state.stage === "shipped")
    return role === "factory"
      ? isPickupOrder(state)
        ? "Подтвердите выдачу заказа клиенту документом получения."
        : "Подтвердите доставку документом перевозчика или получения."
      : isPickupOrder(state)
        ? "Заказ ожидает самовывоза. Возьмите документ получения и проверьте комплектность."
        : "Заказ отгружен. Следите за реквизитами отправления и ожидайте доставку.";
  if (state.stage === "delivered") {
    if (role === "client")
      return "Проверьте изделие и комплектность, затем примите заказ или сообщите о замечании.";
    if (role === "factory")
      return isPickupOrder(state)
        ? "Выдача клиенту зафиксирована в демо. Ожидается приёмка заказа клиентом."
        : "Доставка зафиксирована в демо. Ожидается приёмка заказа клиентом.";
    return "Получение зафиксировано в демо. Ожидается приёмка заказа клиентом.";
  }
  if (state.stage === "disputed") {
    if (state.issue?.status === "response_proposed") {
      return role === "client"
        ? "Проверьте предложенное решение замечания: примите его или верните на доработку с пояснением."
        : "Решение замечания предложено. Ожидается подтверждение или мотивированный отказ клиента.";
    }
    if (role === "client")
      return "Замечание записано. Фабрика или GABER должны предложить решение в этом заказе.";
    return "Изучите замечание клиента и предложите решение. Это локальное согласование, не подтверждённый акт ремонта.";
  }
  if (["factory_changes", "change_requested"].includes(state.stage))
    return role === "partner"
      ? "Подготовьте новую ревизию ТЗ и сметы с учётом замечаний."
      : "Ожидается новая ревизия от партнёра и фабрики.";
  return "Следующий шаг появится после обновления журнала заказа.";
}

const SERVICE_ROLE_LABELS = {
  client: "Клиент",
  factory: "Фабрика",
  partner: "GABER",
  service: "Фабрика или GABER",
};

export function getOrderServiceOwner(state, financials = {}) {
  let role = null;
  if (state.stage === "requested") role = "partner";
  else if (state.stage === "awaiting_factory") role = "factory";
  else if (
    ["factory_confirmed", "factory_changes", "change_requested"].includes(
      state.stage,
    )
  )
    role = "partner";
  else if (state.stage === "offered") role = "client";
  else if (state.stage === "accepted")
    role = financials.advanceDueKopecks > 0 ? "partner" : "factory";
  else if (["production", "quality", "shipped"].includes(state.stage))
    role = "factory";
  else if (state.stage === "ready")
    role = financials.balanceKopecks > 0 ? "partner" : "factory";
  else if (state.stage === "delivered") role = "client";
  else if (state.stage === "disputed")
    role = state.issue?.status === "response_proposed" ? "client" : "service";
  return {
    role,
    label: role ? SERVICE_ROLE_LABELS[role] : "Заказ завершён",
  };
}

export function getOrderDueSignal(state, now = new Date()) {
  const dueDate = state.revisions.at(-1)?.dueDate;
  const active = [
    "offered",
    "accepted",
    "production",
    "quality",
    "ready",
    "shipped",
    "delivered",
    "disputed",
  ].includes(state.stage);
  const dueTime = dueDate ? Date.parse(`${dueDate}T00:00:00Z`) : NaN;
  const nowTime = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!active || !Number.isFinite(dueTime) || !Number.isFinite(nowTime))
    return null;
  const days = Math.ceil((dueTime - nowTime) / 86400000);
  return {
    dueDate,
    days,
    tone: days < 0 ? "alert" : days <= 3 ? "warning" : "neutral",
    text:
      days < 0
        ? `Плановая дата прошла на ${Math.abs(days)} дн. Нужна новая согласованная дата.`
        : days === 0
          ? "Плановая дата готовности — сегодня."
          : `До плановой даты ${days} дн. Календарь производства не подтверждён.`,
  };
}

export function getUnreadOrderMessages(state, role, readAt = null) {
  const marker = readAt ? Date.parse(readAt) : NaN;
  return visibleOrderMessages(state.messages ?? [], role).filter((message) => {
    const at = Date.parse(message.at);
    return (
      message.role !== role &&
      (!Number.isFinite(marker) || (Number.isFinite(at) && at > marker))
    );
  });
}

export function getPartnerCommissionStatus(state, financials) {
  const revision = state.revisions.at(-1);
  const economics = state.specs.at(-1)?.economics;
  const eligible = Boolean(
    revision &&
      economics &&
      state.stage === "closed" &&
      state.acceptedRevisionId === revision.id &&
      financials.balanceKopecks === 0,
  );
  return {
    amountKopecks: economics?.platformCommissionKopecks ?? 0,
    eligible,
    status: eligible ? "DEMO_SETTLEMENT_COMPLETE" : "PLANNED_UNVERIFIED",
    bankVerifiedKopecks: null,
  };
}

export function buildAssemblyGuide(state) {
  const revision = state.revisions.at(-1);
  const config = revision?.config ?? state.sourceConfig;
  const lines = [
    `Сверьте заказ «${state.name}» и ревизию ${revision?.id ?? "исходной конфигурации"} с маркировкой упаковки.`,
    "Распакуйте изделие без острых инструментов рядом с обивкой; проверьте видимые поверхности и комплектность.",
  ];
  if (config.category !== "headboard") {
    lines.push(
      "Установите опоры и штатные соединения по утверждённой фабричной карте. В демо артикулы крепежа и моменты затяжки не заданы.",
    );
  }
  if (config.category === "sofa" && Number.isSafeInteger(config.moduleCount) && config.moduleCount > 1) {
    lines.push(
      `Соедините ${config.moduleCount} модуля в последовательности фабричной маркировки; не используйте неутверждённые соединители.`,
    );
  }
  if (config.category === "headboard") {
    lines.push(
      "Монтаж изголовья выполняйте только по утверждённой схеме фабрики с учётом основания и крепежа; демо не задаёт несущую способность стены.",
    );
  } else {
    lines.push(
      "Уложите съёмные подушки и элементы обивки согласно их маркировке, не меняя конструктивные слои.",
    );
  }
  if (config.mechanism && config.mechanism !== "none") {
    lines.push(
      "Перед эксплуатацией механизма проверьте свободный ход без нагрузки. При перекосе или постороннем звуке остановитесь и сообщите о замечании.",
    );
  }
  lines.push(
    "Проверьте устойчивость без нагрузки и сохраните документы заказа. До утверждённой фабричной инструкции это только демонстрационный ориентир.",
  );
  return {
    title: `GABER · демо-инструкция по получению и сборке · ${state.name}`,
    lines,
    disclaimer:
      "Не является утверждённой производственной инструкцией. Крепёж, допуски, нагрузки и порядок монтажа должна подтвердить фабрика.",
  };
}
