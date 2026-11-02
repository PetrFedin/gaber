import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/OrderWorkspace.jsx", import.meta.url), "utf8");

test("factory code input uses a valid HTML pattern and accepts its documented identifier contract", () => {
  const match = source.match(/pattern="([^"]+)"/);
  assert.ok(match, "factory code pattern must be present");
  const pattern = new RegExp(`^(?:${match[1]})$`, "v");
  assert.equal(pattern.test("factory-linea"), true);
  assert.equal(pattern.test("factory_linea:01"), true);
  assert.equal(pattern.test("фабрика"), false);
  assert.equal(pattern.test("factory linea"), false);
  assert.equal(pattern.test("-factory"), false);
});
