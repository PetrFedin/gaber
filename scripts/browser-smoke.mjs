import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const dueDate = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
let vite;
let browser;
let page;
const errors = [];
const checkpoints = [];
const stage = (name) => {
  checkpoints.push({ name, at: new Date().toISOString() });
  console.log(`[browser-smoke] ${name}`);
};
const watch = (target) => {
  target.on("pageerror", (error) => errors.push(error.message));
  target.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
};

async function readProjects(targetPage = page) {
  return targetPage.evaluate(async () => {
    const { readProjects } = await import("/src/storage.js");
    return readProjects();
  });
}
async function readOrder(targetPage = page) {
  const row = await targetPage.evaluate(() => {
    const journal = JSON.parse(
      localStorage.getItem("gaber.order-workflow.v1") || "null",
    );
    return journal?.orders?.[0] || null;
  });
  if (!row) return null;
  return targetPage.evaluate(async (events) => {
    const { replayOrder, orderFinancials } = await import(
      "/src/orderWorkflow.js"
    );
    const { getPartnerCommissionStatus } = await import(
      "/src/orderExperience.js"
    );
    const state = replayOrder(events);
    const financials = orderFinancials(state);
    return {
      state,
      financials,
      commission: getPartnerCommissionStatus(state, financials),
      eventCount: events.length,
    };
  }, row.events);
}
async function waitStage(expected) {
  await page.waitForFunction(async (stage) => {
    const journal = JSON.parse(
      localStorage.getItem("gaber.order-workflow.v1") || "null",
    );
    const events = journal?.orders?.[0]?.events;
    if (!events) return false;
    const { replayOrder } = await import("/src/orderWorkflow.js");
    return replayOrder(events).stage === stage;
  }, expected);
}
async function go(role) {
  const route =
    role === "partner"
      ? "partner"
      : role === "factory"
        ? "factory"
        : "projects";
  await page.goto(`${url}/#${route}`, { waitUntil: "networkidle" });
  await page.locator(".order-workspace").waitFor();
}
async function click(name) {
  const button = page.getByRole("button", { name, exact: true });
  await button.scrollIntoViewIfNeeded();
  await button.click({ noWaitAfter: true });
}
async function fill(label, value) {
  const field = page.getByLabel(label, { exact: true });
  await field.scrollIntoViewIfNeeded();
  await field.fill(value);
}
async function downloadText(name) {
  const pending = page.waitForEvent("download");
  await click(name);
  const download = await pending;
  return fs.readFileSync(await download.path(), "utf8");
}

try {
  if (!process.env.SMOKE_URL) {
    vite = spawn("npm", ["run", "dev", "--", "--strictPort"], {
      stdio: "ignore",
      detached: process.platform !== "win32",
    });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(url)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Vite did not become ready");
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  watch(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".hero h1").waitFor();
  await page.locator(".collection-grid").waitFor();
  stage("home");

  await page.locator(".collection-card").first().click({ noWaitAfter: true });
  await page.locator(".studio-canvas canvas").waitFor();
  await page.getByRole("heading", { name: "Архитектура предмета" }).waitFor();
  const studioMetrics = await page.evaluate(() => {
    const canvas = document.querySelector(".studio-canvas canvas");
    const panel = document.querySelector(".studio-panel");
    const rect = canvas?.getBoundingClientRect();
    return {
      canvasWidth: rect?.width,
      canvasHeight: rect?.height,
      panelWidth: panel?.getBoundingClientRect().width,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(studioMetrics.canvasWidth > 250);
  assert.ok(studioMetrics.canvasHeight > 250);
  assert.ok(studioMetrics.panelWidth > 250);
  assert.equal(studioMetrics.horizontalOverflow, false);
  await page.getByLabel("Трансформация", { exact: true }).selectOption("fold");
  await page
    .getByRole("button", { name: /^Обивка/ })
    .click({ noWaitAfter: true });
  await page.getByLabel("Материал", { exact: true }).selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Проверить и продолжить", exact: true })
    .click({ noWaitAfter: true });
  await page.getByRole("heading", { name: "Ваш предмет" }).waitFor();
  await page
    .getByRole("button", { name: "Создать демо-заявку", exact: true })
    .click({ noWaitAfter: true });
  await page.waitForFunction(() =>
    document.querySelector(".toast")?.textContent.includes("Заявка появилась"),
  );
  assert.equal((await readProjects()).length, 1);
  assert.equal((await readProjects())[0].status, "requested");
  stage("configure-and-save-project");

  const dataPage = await context.newPage();
  watch(dataPage);
  await dataPage.goto(`${url}/#projects`, { waitUntil: "networkidle" });
  assert.equal((await readProjects(dataPage)).length, 1);
  await dataPage.reload({ waitUntil: "networkidle" });
  assert.equal((await readProjects(dataPage)).length, 1);
  await dataPage.close();
  stage("project-reload-and-second-tab");

  await go("client");
  await page.locator(".project-card").waitFor();
  await click("Создать заказ из проекта");
  await waitStage("requested");
  await page.locator(".order-journey").waitFor();
  const initial = await readOrder();
  const orderId = initial.state.projectId;
  assert.ok(orderId);

  await go("partner");
  await fill("Код фабрики", "FACTORY-A");
  await click("Назначить фабрику · локально");
  for (const [label, value] of [
    ["Цена клиенту, ₽", "1200"],
    ["Себестоимость фабрики, ₽", "700"],
    ["Комиссия Габер, ₽", "200"],
    ["Логистика, ₽", "50"],
    ["Налоги, ₽", "50"],
    ["Прочие расходы, ₽", "0"],
    ["Плановая дата готовности", dueDate],
    [
      "Техническое задание фабрике",
      "Каркас, допуски, наполнитель, обивка и швы",
    ],
    ["Описание предложения", "Цена после заводского подтверждения"],
  ])
    await fill(label, value);
  await click("Отправить ТЗ фабрике на подтверждение");
  await go("factory");
  await fill("Документ подтверждения фабрики", "ACK-1");
  await fill("Комментарий фабрики", "Концепция подтверждена");
  await click("Подтвердить ТЗ · локально");
  await go("partner");
  await click("Опубликовать предложение клиенту");
  await waitStage("offered");
  stage("factory-review-and-offer");

  await go("client");
  await page.locator(".order-decision input").check();
  await click("Согласовать R1");
  await fill("Сумма, ₽", "600");
  await fill("Номер / ссылка на платёжный документ", "CLIENT-CLAIM");
  await click("Сообщить об оплате");
  await go("partner");
  await fill("Сумма, ₽", "600");
  await fill("Номер / ссылка на платёжный документ", "LOCAL-ADVANCE");
  await click("Добавить локальную запись оплаты");
  await go("factory");
  await click("Запустить производственный сценарий");
  await click("Передать на контроль качества");
  await fill("Акт контроля качества", "QC-CONCEPT");
  await click("Зафиксировать контроль · локально");
  await waitStage("ready");
  await go("partner");
  await fill("Сумма, ₽", "600");
  await fill("Номер / ссылка на платёжный документ", "LOCAL-BALANCE");
  await click("Добавить локальную запись оплаты");
  stage("payment-production-and-readiness");

  await go("factory");
  await page.locator(".order-readiness").waitFor();
  await fill("Перевозчик", "TEST carrier");
  await fill("Номер отправления", "TRACK-1");
  await fill("Отгрузочный документ", "PACK-1");
  await click("Зафиксировать отгрузку · локально");
  await fill("Подтверждение доставки", "POD-1");
  await click("Зафиксировать доставку · локально");
  await go("client");
  const guide = await downloadText("Скачать демо-инструкцию");
  assert.match(guide, /Не является утверждённой производственной инструкцией/);
  await click("Принять доставленный заказ");
  await waitStage("closed");
  const closed = await readOrder();
  assert.equal(closed.financials.balanceKopecks, 0);
  assert.ok(closed.financials.priceKopecks > 0);
  assert.equal(closed.financials.verifiedBankKopecks, null);
  assert.equal(closed.commission.status, "DEMO_SETTLEMENT_COMPLETE");
  assert.equal(closed.commission.bankVerifiedKopecks, null);
  await go("partner");
  await page
    .getByText("Итоговый расчёт комиссии завершён", { exact: true })
    .waitFor();
  const settlement = await downloadText("Скачать демо-сверку сделки");
  assert.match(settlement, /20000/);
  assert.match(settlement.toLowerCase(), /банк не/);
  stage("delivery-assembly-guide-and-demo-settlement");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".order-workspace").waitFor();
  const reloaded = await readOrder();
  assert.equal(reloaded.state.stage, "closed");
  assert.equal(reloaded.financials.balanceKopecks, 0);
  await page
    .getByText("Итоговый расчёт комиссии завершён", { exact: true })
    .waitFor();
  stage("closed-order-reload");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".collection-grid").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator(".collection-card").first().click({ noWaitAfter: true });
  await page.locator(".studio-canvas canvas").waitFor();
  const mobileStudio = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    canvas: document
      .querySelector(".studio-canvas canvas")
      ?.getBoundingClientRect().width,
  }));
  assert.equal(mobileStudio.overflow, false);
  assert.ok(mobileStudio.canvas > 200);
  stage("mobile-constructor");

  const isolated = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const second = await isolated.newPage();
  watch(second);
  await second.goto(`${url}/#projects`, { waitUntil: "networkidle" });
  await second
    .getByRole("heading", { name: "Здесь начнётся ваша коллекция" })
    .waitFor();
  assert.equal((await readProjects(second)).length, 0);
  await second.evaluate(() =>
    localStorage.setItem("gaber.order-workflow.v1", "not-json"),
  );
  await second.reload({ waitUntil: "networkidle" });
  await second
    .getByRole("alert")
    .filter({ hasText: "Журнал заказов недоступен или повреждён" })
    .waitFor();
  assert.equal(
    await second.evaluate(() =>
      localStorage.getItem("gaber.order-workflow.v1"),
    ),
    "not-json",
  );
  await isolated.close();
  stage("fresh-browser-and-corrupt-journal-protection");

  const unknown = await context.newPage();
  watch(unknown);
  await unknown.goto(`${url}/this-route-does-not-exist`, {
    waitUntil: "networkidle",
  });
  await unknown.locator(".hero h1").waitFor();
  await unknown.close();
  assert.deepEqual(errors, []);
  stage("unknown-route-and-console");

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkpoints,
        orderId,
        events: closed.eventCount,
        stages:
          "requested → offered → accepted → production → quality → ready → shipped → delivered → closed",
        scope:
          "LOCAL SMOKE ONLY — no real payments, production, bank or factory acceptance",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        checkpoints,
        error: error.stack || error.message,
        consoleErrors: errors,
        url: page?.url(),
      },
      null,
      2,
    ),
  );
  if (page && process.env.SMOKE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.SMOKE_SCREENSHOT,
      fullPage: true,
    });
    console.error(`Screenshot: ${process.env.SMOKE_SCREENSHOT}`);
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (vite) {
    try {
      if (process.platform === "win32") vite.kill();
      else process.kill(-vite.pid, "SIGTERM");
    } catch {}
  }
}
