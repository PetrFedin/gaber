import assert from "node:assert/strict";
import test from "node:test";
import {
  PICKUP_CARRIER,
  buildAssemblyGuide,
  getNextOrderAction,
  getOrderJourney,
  getPartnerCommissionStatus,
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
