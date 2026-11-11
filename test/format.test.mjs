import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, formatDateTime, formatDuration, formatNumber, sourceLabel, timeAgo, updatedText } from "../public/lib/format.js";
import { d } from "./helpers.mjs";

const now = d("2026-11-11T13:12:00Z").getTime();

test("durations like the dashboard", () => {
  assert.equal(formatDuration(0), "nu");
  assert.equal(formatDuration(-5), "nu");
  assert.equal(formatDuration(30_000), "1m");
  assert.equal(formatDuration(20 * 60_000), "20m");
  assert.equal(formatDuration(15 * 3_600_000), "15u");
  assert.equal(formatDuration(15 * 3_600_000 + 20 * 60_000), "15u 20m");
  assert.equal(formatDuration(4 * 86_400_000 + 15 * 3_600_000 + 59 * 60_000), "4d 15u");
  assert.equal(formatDuration(2 * 86_400_000), "2d");
});

test("relative time", () => {
  assert.equal(timeAgo(new Date(now), now), "net");
  assert.equal(timeAgo(new Date(now - 59_000), now), "net");
  assert.equal(timeAgo(new Date(now - 180_000), now), "3m geleden");
  assert.equal(timeAgo(new Date(now - 7_200_000), now), "2u geleden");
  assert.equal(timeAgo(new Date(now + 300_000), now), "net", "clock skew");
  assert.equal(updatedText(new Date(now - 180_000), now), "Bijgewerkt 3m geleden");
});

test("Dutch numbers", () => {
  assert.equal(formatNumber(49_488), "49.488");
  assert.equal(formatNumber(4.5), "4,5");
  assert.equal(formatNumber(300), "300");
  assert.equal(formatNumber(12.6), "13");
});

test("date and time in a given time zone", () => {
  const text = formatDateTime(d("2026-12-09T08:00:00Z"), "Europe/Amsterdam");
  assert.match(text, /9 dec/);
  assert.match(text, /09:00$/);
  assert.equal(formatClock(d("2026-11-11T13:05:00Z"), now, "Europe/Amsterdam"), "14:05");
  assert.equal(formatClock(d("2026-11-10T13:05:00Z"), now, "Europe/Amsterdam"), "10 nov 14:05");
});

test("source labels", () => {
  assert.equal(sourceLabel("api"), "live");
  assert.equal(sourceLabel("local"), "gesynchroniseerd");
  assert.equal(sourceLabel("manual"), "handmatig");
  assert.equal(sourceLabel("scraper"), "scraper");
});
