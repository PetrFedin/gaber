import assert from "node:assert/strict";
import test from "node:test";
import {
  PICKUP_CARRIER,
  buildAssemblyGuide,
  getNextOrderAction,
  getOrderDueSignal,
  getOrderJourney,
  getOrderServiceOwner,
  getPartnerCommissionStatus,
  getUnreadOrderMessages,
  isPickupOrder,
  orderStageLabel,
} from "../src/orderExperience.js";

const economics = {
  customerPriceKopecks: 15000000,
  factoryCostKopecks: 9000000,
  platformCommissionKopecks: 1500000,
  plannedReserveKopecks: 2500000,
};

function state(stage = "requested") {
  return {
    name: "Диван Linea",
    stage,
    assignedFactoryId: "factory-linea",
    sourceConfig: { category: "sofa", modules: 3, mechanism: "none" },
    specs: [{ id: "S1", economics }],
    revisions: [
      {
        id: "R1",
        config: { category: "sofa", modules: 3, mechanism: "none" },
        priceKopecks: 15000000,
        dueDate: "2026-12-15",
      },
    ],
    acceptedRevisionId: "R1",
    shipment: null,
    quality: null,
  };
}

const paid = {
  priceKopecks: 15000000,
  currentKopecks: 15000000,
  advanceDueKopecks: 0,
  balanceKopecks: 0,
};

test("journey exposes the complete demo path and finishes every step on acceptance", () => {
  const initial = getOrderJourney(state());
  assert.equal(initial.length, 7);
  assert.deepEqual(
    initial.map((step) => step.label),
    [
      "Проект",
      "Смета и ТЗ",
      "Цена и оплата",
      "Производство",
      "Готовность",
      "Получение",
      "Приёмка",
    ],
  );
  assert.equal(initial[0].status, "current");
  assert.equal(getOrderJourney(state("production"))[3].status, "current");
  assert.equal(
    getOrderJourney(state("closed")).every((step) => step.status === "done"),
    true,
  );
});

test("pickup uses existing journal shipment evidence without inventing a new command", () => {
  const order = state("shipped");
  order.shipment = {
    carrier: PICKUP_CARRIER,
    tracking: "Выдача на фабрике · PICKUP-1",
    reference: "PICKUP-1",
  };
  assert.equal(isPickupOrder(order), true);
  assert.equal(orderStageLabel(order), "Ожидает самовывоза");
  order.stage = "delivered";
  assert.equal(orderStageLabel(order), "Выдан клиенту");
  assert.match(getNextOrderAction(order, "factory"), /выдач/i);
});

test("readiness and final payment unlock the handover instruction", () => {
  const order = state("ready");
  assert.match(
    getNextOrderAction(order, "factory", paid),
    /доставку или самовывоз/,
  );
  assert.equal(
    getNextOrderAction(order, "client", paid).includes("готово"),
    true,
  );
});

test("assembly guide reflects modules and preserves factory safety limits", () => {
  const guide = buildAssemblyGuide(state("delivered"));
  assert.equal(
    guide.lines.some((line) => line.includes("3 модуля")),
    true,
  );
  assert.equal(
    guide.lines.some((line) => line.includes("Р1")),
    false,
  );
  assert.match(
    guide.disclaimer,
    /Не является утверждённой производственной инструкцией/,
  );
  const headboard = state("delivered");
  headboard.revisions[0].config = {
    category: "headboard",
    modules: 1,
    mechanism: "none",
  };
  assert.equal(
    buildAssemblyGuide(headboard).lines.some((line) =>
      line.includes("несущую способность стены"),
    ),
    true,
  );
});

test("commission becomes a completed demo calculation only after paid client acceptance", () => {
  assert.deepEqual(getPartnerCommissionStatus(state("ready"), paid), {
    amountKopecks: 1500000,
    eligible: false,
    status: "PLANNED_UNVERIFIED",
    bankVerifiedKopecks: null,
  });
  const completed = getPartnerCommissionStatus(state("closed"), paid);
  assert.equal(completed.eligible, true);
  assert.equal(completed.amountKopecks, 1500000);
  assert.equal(completed.status, "DEMO_SETTLEMENT_COMPLETE");
  assert.equal(completed.bankVerifiedKopecks, null);
  assert.equal(
    getPartnerCommissionStatus(state("closed"), { ...paid, balanceKopecks: 1 })
      .eligible,
    false,
  );
});

test("service ownership follows the actor who must unblock the order", () => {
  assert.deepEqual(getOrderServiceOwner(state("requested"), paid), {
    role: "partner",
    label: "GABER",
  });
  assert.equal(
    getOrderServiceOwner(state("awaiting_factory"), paid).role,
    "factory",
  );
  assert.equal(
    getOrderServiceOwner(state("accepted"), { ...paid, advanceDueKopecks: 100 })
      .role,
    "partner",
  );
  assert.equal(getOrderServiceOwner(state("accepted"), paid).role, "factory");
  assert.equal(
    getOrderServiceOwner(state("ready"), { ...paid, balanceKopecks: 100 }).role,
    "partner",
  );
  const disputed = state("disputed");
  disputed.issue = { status: "open" };
  assert.equal(getOrderServiceOwner(disputed, paid).role, "service");
  disputed.issue.status = "response_proposed";
  assert.equal(getOrderServiceOwner(disputed, paid).role, "client");
  assert.equal(getOrderServiceOwner(state("closed"), paid).role, null);
});

test("due signal is planning guidance rather than a fabricated production calendar", () => {
  const order = state("production");
  assert.deepEqual(getOrderDueSignal(order, new Date("2026-12-12T12:00:00Z")), {
    dueDate: "2026-12-15",
    days: 3,
    tone: "warning",
    text: "До плановой даты 3 дн. Календарь производства не подтверждён.",
  });
  assert.equal(
    getOrderDueSignal(order, new Date("2026-12-18T12:00:00Z")).tone,
    "alert",
  );
  assert.match(
    getOrderDueSignal(order, new Date("2026-12-18T12:00:00Z")).text,
    /Нужна новая согласованная дата/,
  );
  assert.equal(
    getOrderDueSignal(state("closed"), new Date("2026-12-18")),
    null,
  );
});

test("unread projection preserves bilateral privacy and excludes own messages", () => {
  const order = state("offered");
  order.messages = [
    {
      role: "partner",
      note: "Клиенту",
      channel: "client_partner",
      at: "2026-11-01T10:00:00.000Z",
    },
    {
      role: "partner",
      note: "Фабрике",
      channel: "factory_partner",
      at: "2026-11-01T10:01:00.000Z",
    },
    {
      role: "factory",
      note: "Общее",
      channel: "shared",
      at: "2026-11-01T10:02:00.000Z",
    },
    {
      role: "client",
      note: "Своё",
      channel: "client_partner",
      at: "2026-11-01T10:03:00.000Z",
    },
  ];
  assert.deepEqual(
    getUnreadOrderMessages(order, "client").map((message) => message.note),
    ["Клиенту", "Общее"],
  );
  assert.deepEqual(
    getUnreadOrderMessages(order, "client", "2026-11-01T10:00:00.000Z").map(
      (message) => message.note,
    ),
    ["Общее"],
  );
  assert.deepEqual(
    getUnreadOrderMessages(order, "factory").map((message) => message.note),
    ["Фабрике"],
  );
  assert.equal(getUnreadOrderMessages(order, "partner").length, 2);
});

test("dispute guidance and partner response cover the complete service loop", () => {
  const order = state("disputed");
  order.issue = { status: "open" };
  assert.match(
    getNextOrderAction(order, "partner", paid),
    /предложите решение/i,
  );
  assert.match(getNextOrderAction(order, "client", paid), /Фабрика или GABER/);
  order.issue.status = "response_proposed";
  assert.match(
    getNextOrderAction(order, "client", paid),
    /примите его или верните/i,
  );
  assert.match(
    getNextOrderAction(order, "partner", paid),
    /Ожидается подтверждение/,
  );
});
