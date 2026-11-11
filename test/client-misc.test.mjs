import assert from "node:assert/strict";
import { test } from "node:test";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "../public/lib/cache.js";
import { messageFor, titleFor } from "../public/lib/errors.js";
import { limitHref, parseRoute, tabFor } from "../public/lib/router.js";
import { d, fixture } from "./helpers.mjs";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("routes and links round-trip ids with | and spaces", () => {
  for (const id of ["netlify|Credits", "a/b c|ü?#"]) {
    assert.deepEqual(parseRoute(limitHref(id)), { name: "limit", id });
  }
  assert.equal(limitHref("netlify|Credits"), "#/limit/netlify%7CCredits");
  assert.deepEqual(parseRoute(""), { name: "netlify" });
  assert.deepEqual(parseRoute("#/"), { name: "netlify" });
  assert.deepEqual(parseRoute("#/usage"), { name: "usage" });
  assert.deepEqual(parseRoute("#/instellingen"), { name: "settings" });
  assert.equal(tabFor(parseRoute("#/")), "netlify");
  assert.equal(tabFor(parseRoute("#/site/x")), "netlify");
  assert.equal(tabFor(parseRoute("#/usage")), "usage");
  assert.equal(tabFor(parseRoute("#/limit/x")), "usage");
  assert.equal(tabFor(parseRoute("#/instellingen")), "settings");
  assert.deepEqual(parseRoute("#/limit/"), { name: "netlify" });
  assert.deepEqual(parseRoute("#/limit/%E0%A4%A"), { name: "netlify" });
});

test("cache round trip, corrupt data ignored", () => {
  const storage = memoryStorage();
  assert.equal(loadSnapshot(storage), null);
  saveSnapshot(storage, fixture("full"), d("2026-11-11T13:10:00Z"));
  const snap = loadSnapshot(storage);
  assert.deepEqual(snap.savedAt, d("2026-11-11T13:10:00Z"));
  assert.deepEqual(snap.body, fixture("full"));
  clearSnapshot(storage);
  assert.equal(loadSnapshot(storage), null);
  storage.setItem("limieten:last-response", "{nonsense");
  assert.equal(loadSnapshot(storage), null);
});

test("cache survives blocked storage", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(saveSnapshot(blocked, {}), false);
  assert.equal(loadSnapshot(blocked), null);
  clearSnapshot(blocked);
});

test("Dutch error messages", () => {
  assert.match(messageFor("upstream_unauthorized"), /401/);
  assert.equal(messageFor("offline"), "Geen internetverbinding.");
  assert.equal(messageFor("upstream_status", 500), "Onverwachte fout van het dashboard. (HTTP 500)");
  assert.equal(messageFor("something-new"), messageFor("server"));
  assert.equal(titleFor("upstream_unauthorized"), "Token geweigerd");
  assert.equal(titleFor("upstream_timeout"), "Netwerkfout");
});
