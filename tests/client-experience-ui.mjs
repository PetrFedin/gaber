import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "http://localhost/",
});
const expose = (name, value) =>
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
for (const name of [
  "window",
  "document",
  "navigator",
  "location",
  "localStorage",
  "HTMLElement",
  "HTMLDialogElement",
  "HTMLCanvasElement",
  "SVGElement",
  "Element",
  "Node",
  "MutationObserver",
  "getComputedStyle",
]) {
  expose(
    name,
    name === "window"
      ? dom.window
      : name === "document"
        ? dom.window.document
        : name === "navigator"
          ? dom.window.navigator
          : dom.window[name],
  );
}
expose("IS_REACT_ACT_ENVIRONMENT", true);
expose("requestAnimationFrame", (callback) => setTimeout(callback, 0));
expose("cancelAnimationFrame", clearTimeout);
expose("matchMedia", () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}));
expose(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
dom.window.scrollTo = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  logLevel: "silent",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { default: App } = await server.ssrLoadModule("/src/App.jsx");
const root = createRoot(document.getElementById("root"));
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
const button = (text) =>
  Array.from(document.querySelectorAll("button")).find((item) =>
    item.textContent.includes(text),
  );

try {
  await act(async () => {
    root.render(React.createElement(App));
  });
  assert.equal(document.querySelectorAll(".home-assurance>div").length, 3);
  assert.equal(
    document.querySelector(
      'nav[aria-label="Основная навигация"] a[href="#partner"]',
    ).textContent,
    "Партнёр GABER",
  );
  for (const hash of ["operations", "partner"]) {
    await act(async () => {
      dom.window.location.hash = hash;
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    await flush();
    assert.equal(document.querySelector(".gaber-operations") !== null, true);
    assert.equal(
      document.querySelector(
        '#gaber-order-workspace[aria-label="Кабинет партнёра GABER · заказы"]',
      ) !== null,
      true,
    );
  }
  await act(async () => {
    dom.window.location.hash = "home";
    dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  });
  await flush();
  await act(async () => {
    button("Создать свой предмет").click();
  });
  await flush();
  assert.equal(document.querySelectorAll(".studio-step-nav>button").length, 6);
  assert.match(
    document.querySelector(".studio-progress").textContent,
    /Шаг 1 из 6/,
  );
  await act(async () => {
    Array.from(document.querySelectorAll(".studio-step-nav>button"))
      .find((item) => item.textContent.includes("Размеры"))
      .click();
  });
  assert.match(
    document.querySelector(".studio-progress").textContent,
    /Шаг 2 из 6/,
  );
  assert.equal(
    document
      .querySelector('.studio-step-nav [aria-current="step"]')
      .textContent.includes("Размеры"),
    true,
  );
  await act(async () => {
    button("Проверить и продолжить").click();
  });
  assert.equal(document.querySelector("dialog").open, true);
  assert.match(
    document.querySelector(".summary-next").textContent,
    /Перед следующим шагом/,
  );
  await act(async () => {
    document.querySelector('button[aria-label="Закрыть"]').click();
  });
  assert.equal(document.querySelector("dialog"), null);
  await act(async () => {
    document.querySelector(".menu-toggle").click();
  });
  assert.equal(
    document.querySelector(".menu-toggle").getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(
    document.querySelector(".menu-toggle").getAttribute("aria-label"),
    "Закрыть меню",
  );
  await act(async () => {
    document.querySelector(".menu-toggle").click();
  });
  assert.equal(
    document.querySelector(".menu-toggle").getAttribute("aria-expanded"),
    "false",
  );
  console.log(
    "client-experience-ui: home, studio journey, summary and menu passed",
  );
} finally {
  await act(async () => root.unmount());
  await server.close();
  dom.window.close();
}
