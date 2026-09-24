import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("financial transfers stay disabled in source defaults", () => {
  const src = fs.readFileSync(new URL("../src/db.js", import.meta.url), "utf8");
  assert.match(src, /financial_transfers[\s\S]{0,40}0/);
});

test("server refuses silent authorized production deploy", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /cannot auto-deploy Mirror changes/);
});

test("slice 2 exposes streaming and webauthn routes", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /\/api\/chat\/stream/);
  assert.match(src, /\/api\/webauthn\/register\/options/);
  assert.match(src, /L3_REQUIRED/);
});
