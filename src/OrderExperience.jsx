import React from "react";
import { orderMoney } from "./orderMoney.js";
import {
  buildAssemblyGuide,
  getNextOrderAction,
  getOrderJourney,
  getPartnerCommissionStatus,
  isPickupOrder,
} from "./orderExperience.js";
import "./orderExperience.css";

function downloadText(filename, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OrderJourney({ state, role, financials }) {
  const journey = getOrderJourney(state);
  const paymentPercent = financials.priceKopecks
    ? Math.min(
        100,
        Math.round((financials.currentKopecks / financials.priceKopecks) * 100),
      )
    : 0;
  return (
    <section className="order-journey" aria-label="Путь демо-заказа">
      <ol>
        {journey.map((step, index) => (
          <li
            key={step.id}
            className={step.status}
            aria-current={step.status === "current" ? "step" : undefined}
          >
            <span>
              {step.status === "done"
                ? "✓"
                : String(index + 1).padStart(2, "0")}
            </span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
      <div className="order-next-action">
        <span>
          Следующий шаг ·{" "}
          {role === "client"
            ? "клиент"
            : role === "factory"
              ? "фабрика"
              : "GABER"}
        </span>
        <p>{getNextOrderAction(state, role, financials)}</p>
      </div>
      {financials.priceKopecks > 0 && (
        <div className="order-payment-progress">
          <div>
            <span>Локальный учёт оплаты</span>
            <strong>
              {orderMoney(financials.currentKopecks)} /{" "}
              {orderMoney(financials.priceKopecks)}
            </strong>
          </div>
          <progress
            max={100}
            value={paymentPercent}
            aria-label={`Локально учтено ${paymentPercent}% цены`}
          />
          <small>Демо-записи, не подтверждение банка · {paymentPercent}%</small>
        </div>
      )}
    </section>
  );
}

export function OrderReadiness({ state }) {
  if (!state.quality) return null;
  const revision = state.revisions.at(-1);
  return (
    <section className="order-readiness" aria-label="Информация о готовности">
      <span className="eyebrow">ГОТОВНОСТЬ · ДЕМО</span>
      <div>
        <h4>Контроль качества зафиксирован</h4>
        <p>
          Акт {state.quality.reference} · ревизия {state.quality.revisionId}.
          Плановая дата готовности: {revision?.dueDate ?? "не указана"}.
        </p>
      </div>
    </section>
  );
}

export function OrderFulfilmentGuide({ state }) {
  if (
    !["ready", "shipped", "delivered", "disputed", "closed"].includes(
      state.stage,
    )
  )
    return null;
  const guide = buildAssemblyGuide(state);
  const pickup = isPickupOrder(state);
  const text = [
    guide.title,
    "",
    ...guide.lines.map((line, index) => `${index + 1}. ${line}`),
    "",
    guide.disclaimer,
  ].join("\n");
  return (
    <details
      className="order-fulfilment-guide"
      open={state.stage === "delivered"}
    >
      <summary>Получение и демо-инструкция по сборке</summary>
      <div>
        <h4>
          {pickup
            ? state.stage === "ready"
              ? "Самовывоз будет оформлен фабрикой"
              : "Самовывоз с фабрики"
            : state.shipment
              ? "Доставка заказа"
              : "Способ получения выберет фабрика"}
        </h4>
        {state.shipment && (
          <p>
            {pickup ? "Место и реквизиты выдачи" : "Перевозчик и отправление"}:{" "}
            {state.shipment.carrier} · {state.shipment.tracking}
          </p>
        )}
        <ol>
          {guide.lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ol>
        <p className="order-guide-disclaimer">{guide.disclaimer}</p>
        <button
          className="button outline"
          type="button"
          onClick={() => downloadText("gaber-demo-assembly-guide.txt", text)}
        >
          Скачать демо-инструкцию
        </button>
      </div>
    </details>
  );
}

export function PartnerCommissionSummary({ state, financials }) {
  const commission = getPartnerCommissionStatus(state, financials);
  const economics = state.specs.at(-1)?.economics;
  const revision = state.revisions.at(-1);
  if (!economics || !revision) return null;
  const downloadAct = () => {
    const rows = [
      ["GABER · демо-сверка завершённой сделки"],
      ["Заказ", state.name],
      ["Ревизия", revision.id],
      ["Цена клиенту, коп.", revision.priceKopecks],
      ["Локально учтено, коп.", financials.currentKopecks],
      ["Стоимость фабрики, коп.", economics.factoryCostKopecks],
      ["Демо-комиссия GABER, коп.", commission.amountKopecks],
      ["Плановый резерв, коп.", economics.plannedReserveKopecks],
      ["Статус", "Демо-расчёт завершён; банк не подтверждён"],
    ];
    downloadText(
      "gaber-demo-settlement.txt",
      rows.map((row) => row.join(": ")).join("\n"),
    );
  };
  return (
    <section
      className={`partner-commission ${commission.eligible ? "complete" : ""}`}
      aria-label="Итоговая комиссия платформы"
    >
      <div>
        <span className="eyebrow">ЭКОНОМИКА GABER · ДЕМО</span>
        <h4>
          {commission.eligible
            ? "Итоговый расчёт комиссии завершён"
            : "Плановая комиссия платформы"}
        </h4>
        <p>
          {commission.eligible
            ? "Клиент принял заказ, полный расчёт учтён локально. Условия демо-начисления выполнены; банковского поступления не было."
            : "Итоговый демо-расчёт станет доступен после полного локального расчёта и приёмки заказа клиентом."}
        </p>
      </div>
      <dl>
        <div>
          <dt>Комиссия GABER</dt>
          <dd>{orderMoney(commission.amountKopecks)}</dd>
        </div>
        <div>
          <dt>Стоимость изготовления</dt>
          <dd>{orderMoney(economics.factoryCostKopecks)}</dd>
        </div>
        <div>
          <dt>Плановый резерв</dt>
          <dd>{orderMoney(economics.plannedReserveKopecks)}</dd>
        </div>
        <div>
          <dt>Банковское подтверждение</dt>
          <dd>Нет данных</dd>
        </div>
      </dl>
      {commission.eligible && (
        <button className="button outline" type="button" onClick={downloadAct}>
          Скачать демо-сверку сделки
        </button>
      )}
    </section>
  );
}
