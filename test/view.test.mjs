import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeResponse } from "../public/lib/contract.js";
import {
  accessibilityLabel,
  barGeometry,
  countByLevel,
  detailRows,
  detailsUrl,
  filterByLevels,
  freshnessText,
  resetIn,
  usedText,
  usesFullRow,
  withoutServices,
} from "../public/lib/view.js";
import { d, fixture } from "./helpers.mjs";

const now = d("2026-11-11T13:12:00Z").getTime();
const limits = normalizeResponse(fixture("full")).limits;
const [session, database, week, credits, egress, mau] = limits;

test("bar fills with what is left, marker at time left", () => {
  const g = barGeometry(session);
  assert.equal(g.fill, 0.08);
  assert.ok(Math.abs(g.marker - 0.4) < 1e-9);
  assert.equal(g.behindPace, true);
  assert.equal(barGeometry(credits).behindPace, true);
  assert.equal(barGeometry(week).behindPace, false);
  assert.deepEqual(barGeometry(database), { fill: 0.22, marker: null, behindPace: false });
});

test("0% and 100% bars", () => {
  const [empty, full] = normalizeResponse(fixture("edge-zero-hundred")).limits;
  assert.equal(barGeometry(empty).fill, 0);
  assert.equal(barGeometry(full).fill, 1);
  assert.equal(barGeometry(full).marker, 0);
});

test("full rows for limits with a reset or not OK, compact for the rest", () => {
  assert.deepEqual(limits.map(usesFullRow), [true, true, true, true, true, false]);
});

test("texts", () => {
  assert.equal(resetIn(week, now), "over 1d 18u");
  assert.equal(resetIn(database, now), null);
  assert.equal(usedText(session), "92% gebruikt");
  assert.equal(usedText(database), "390 van 500 MB gebruikt");
  assert.equal(usedText(egress), "0,5 van 5 GB gebruikt");
  assert.equal(usedText(mau), "512 van 50.000 gebruikers gebruikt");
  assert.equal(freshnessText(database, now), "Bijgewerkt 1u 32m geleden · live");
  assert.equal(freshnessText(session, now), "Bijgewerkt 7m geleden · handmatig");
});

test("accessibility label", () => {
  assert.equal(
    accessibilityLabel(database, now),
    "Supabase (Free) Database, 110 MB over, status Let op, niet ververst",
  );
  assert.equal(
    accessibilityLabel(session, now),
    "Claude (Pro) Sessie, 8% over, status Kritiek, Op over ~21m, vóór de reset, reset over 1u 48m",
  );
});

test("detail rows", () => {
  const rows = Object.fromEntries(detailRows(session, now, "Europe/Amsterdam"));
  assert.equal(rows.Over, "8% over (8%)");
  assert.equal(rows.Gebruikt, "92%");
  assert.equal(rows.Status, "Kritiek (minder dan 10% over)");
  assert.match(rows.Reset, /16:00 \(over 1u 48m\)$/);
  assert.equal(rows["Periode verstreken"], "60%");
  assert.match(rows["Raakt op"], /14:30 \(over 18m\)$/);
  assert.equal(rows.Bron, "handmatig");
  assert.equal(rows.Versheid, "Actueel");

  const db = Object.fromEntries(detailRows(database, now, "Europe/Amsterdam"));
  assert.equal(db.Gebruikt, "390 MB");
  assert.equal(db.Limiet, "500 MB");
  assert.equal(db.Reset, "Geen vaste reset");
  assert.equal(db.Versheid, "Niet ververst: bron faalde, laatst bekende waarde");
  assert.equal("Raakt op" in db, false);
});

test("filter keeps order; counts", () => {
  assert.equal(filterByLevels(limits, new Set()).length, 6);
  assert.deepEqual(filterByLevels(limits, new Set(["warn", "danger"])).map((l) => l.id), ["claude|Sessie", "supabase|Database"]);
  assert.deepEqual(countByLevel(limits), { ok: 4, warn: 1, danger: 1 });
});

test("details link only for services that have one", () => {
  assert.equal(detailsUrl("https://usage-dashboard-e00568.netlify.app", "claude"), "https://usage-dashboard-e00568.netlify.app/claude-code");
  assert.equal(detailsUrl("https://usage-dashboard-e00568.netlify.app", "netlify"), null);
  assert.equal(detailsUrl(null, "claude"), null);
});

test("Supabase and Claude are left out, counts and headline recomputed", () => {
  const r = withoutServices(normalizeResponse(fixture("full")));
  assert.deepEqual(r.limits.map((l) => l.id), ["netlify|Credits"]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.summary, { ok: 1, warn: 0, danger: 0, headline: "Alles binnen marge · krapst: Netlify (Free) Credits, 150 credits over" });
  const untouched = normalizeResponse(fixture("contract-example"));
  untouched.problems = [];
  assert.equal(withoutServices(untouched), untouched, "same object when nothing is hidden");
});
