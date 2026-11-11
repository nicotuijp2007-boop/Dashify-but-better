import assert from "node:assert/strict";
import { test } from "node:test";
import { ContractError, levelForLeft, normalizeResponse } from "../public/lib/contract.js";
import { d, fixture } from "./helpers.mjs";

test("full fixture decodes everything", () => {
  const r = normalizeResponse(fixture("full"));
  assert.equal(r.version, 1);
  assert.deepEqual(r.generatedAt, d("2026-11-11T13:09:00Z"));
  assert.equal(r.dashboardUrl, "https://usage-dashboard-e00568.netlify.app");
  assert.deepEqual(r.summary, {
    ok: 4,
    warn: 1,
    danger: 1,
    headline: "1 kritiek, 1 let op · krapst: Claude (Pro) Sessie, 8% over",
  });
  assert.equal(r.limits.length, 6);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].hasValues, true);
});

test("server order is kept", () => {
  assert.deepEqual(
    normalizeResponse(fixture("full")).limits.map((l) => l.id),
    ["claude|Sessie", "supabase|Database", "claude|Week", "netlify|Credits", "supabase|Egress", "supabase|MAU"],
  );
});

test("all limit fields", () => {
  const l = normalizeResponse(fixture("full")).limits[0];
  assert.deepEqual(l, {
    id: "claude|Sessie",
    service: "claude",
    serviceName: "Claude (Pro)",
    metric: "Sessie",
    leftPct: 8,
    usedPct: 92,
    used: 92,
    limit: 100,
    unit: "%",
    leftText: "8% over",
    level: "danger",
    resetsAt: d("2026-11-11T15:00:00Z"),
    elapsed: 0.6,
    runsOutAt: d("2026-11-11T13:30:00Z"),
    urgency: "Op over ~21m, vóór de reset",
    source: "manual",
    fetchedAt: d("2026-11-11T13:05:00Z"),
    stale: false,
  });
});

test("stale limit with null fields", () => {
  const l = normalizeResponse(fixture("full")).limits[1];
  assert.equal(l.stale, true);
  assert.equal(l.resetsAt, null);
  assert.equal(l.elapsed, null);
  assert.equal(l.runsOutAt, null);
  assert.equal(l.urgency, null);
});

test("contract example from the docs", () => {
  const r = normalizeResponse(fixture("contract-example"));
  const l = r.limits[0];
  assert.equal(l.id, "netlify|Credits");
  assert.equal(l.leftPct, 50);
  assert.equal(l.used, 150);
  assert.equal(l.limit, 300);
  assert.equal(l.elapsed, 0.07);
  assert.equal(r.summary.headline, "Alles binnen marge · krapst: Netlify (Free) Credits, 150 credits over");
});

test("missing optional fields get defaults and a computed summary", () => {
  const r = normalizeResponse(fixture("minimal"));
  assert.equal(r.generatedAt, null);
  assert.equal(r.dashboardUrl, null);
  assert.deepEqual(r.problems, []);
  const [bandwidth, week] = r.limits;
  assert.equal(bandwidth.service, "netlify");
  assert.equal(bandwidth.serviceName, "netlify");
  assert.equal(bandwidth.metric, "Bandwidth");
  assert.equal(bandwidth.leftText, "64% over");
  assert.equal(bandwidth.level, "ok");
  assert.equal(bandwidth.source, "api");
  assert.equal(bandwidth.stale, false);
  assert.equal(week.leftPct, 25, "derived from usedPct");
  assert.equal(week.level, "warn");
  assert.deepEqual(r.summary, { ok: 1, warn: 1, danger: 0, headline: "1 let op · krapst: netlify Bandwidth, 64% over" });
});

test("0% and 100% left", () => {
  const [empty, full] = normalizeResponse(fixture("edge-zero-hundred")).limits;
  assert.equal(empty.leftPct, 0);
  assert.equal(empty.level, "danger");
  assert.equal(full.leftPct, 100);
  assert.equal(full.elapsed, 1);
  assert.equal(full.source, "local");
});

test("unknown fields and values are tolerated, broken entries skipped", () => {
  const r = normalizeResponse(fixture("unknown-fields"));
  assert.deepEqual(r.limits.map((l) => l.id), ["claude|Opus", "netlify|Credits"]);
  const [opus, credits] = r.limits;
  assert.equal(opus.level, "warn", "unknown level falls back to the threshold rule");
  assert.equal(opus.source, "scraper");
  assert.equal(opus.resetsAt, null, "unparseable date becomes null");
  assert.equal("trend" in opus, false);
  assert.equal(credits.used, null);
  assert.equal(credits.fetchedAt, null);
  assert.equal(r.summary.headline, "1 let op");
});

test("empty limits", () => {
  const r = normalizeResponse(fixture("empty"));
  assert.deepEqual(r.limits, []);
  assert.equal(r.summary.headline, "Nog geen gegevens");
});

test("rejects error bodies, garbage and other versions", () => {
  for (const body of [fixture("error-401"), null, [], "x", { version: "abc" }]) {
    assert.throws(() => normalizeResponse(body), (err) => err instanceof ContractError && err.code === "upstream_invalid");
  }
  assert.throws(() => normalizeResponse(fixture("version-2")), (err) => err.code === "unsupported_version");
});

test("level thresholds", () => {
  assert.equal(levelForLeft(0), "danger");
  assert.equal(levelForLeft(9.9), "danger");
  assert.equal(levelForLeft(10), "warn");
  assert.equal(levelForLeft(30), "warn");
  assert.equal(levelForLeft(30.1), "ok");
  assert.equal(levelForLeft(100), "ok");
});

test("leftPct is clamped and rounded", () => {
  const r = normalizeResponse({ version: 1, limits: [{ id: "a|b", leftPct: 140 }, { id: "c|d", leftPct: -3 }, { id: "e|f", leftPct: 49.6 }] });
  assert.deepEqual(r.limits.map((l) => l.leftPct), [100, 0, 50]);
});
