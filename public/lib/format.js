// Dutch formatting, matching the dashboard (overvieuw- src/lib/format.ts).
// Times are shown in the device's time zone.

const LOCALE = "nl-NL";

/** "1.284", "4,5": one decimal below 10, none above. */
export function formatNumber(n) {
  return n.toLocaleString(LOCALE, { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
}

/** "3d 4u", "2u 15m", "5m". Zero or negative durations return "nu". */
export function formatDuration(ms) {
  if (ms <= 0) return "nu";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return h ? `${d}d ${h}u` : `${d}d`;
  if (h > 0) return min ? `${h}u ${min}m` : `${h}u`;
  return `${Math.max(min, 1)}m`;
}

/** "net", "3m geleden", "2u 15m geleden". */
export function timeAgo(date, now = Date.now()) {
  const ms = now - date.getTime();
  if (ms < 60_000) return "net";
  return `${formatDuration(ms)} geleden`;
}

/** "Bijgewerkt 3m geleden". */
export function updatedText(date, now = Date.now()) {
  return `Bijgewerkt ${timeAgo(date, now)}`;
}

/** "9 dec 2026, 09:00" in the given (or the device's) time zone. */
export function formatDateTime(date, timeZone) {
  return date.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone });
}

/** "14:02" for today, otherwise "10 nov 14:02". */
export function formatClock(date, now = Date.now(), timeZone) {
  const day = (d) => new Date(d).toLocaleDateString(LOCALE, { timeZone });
  const time = date.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone });
  if (day(date) === day(now)) return time;
  return `${date.toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone })} ${time}`;
}

export const SOURCE_LABEL = { api: "live", local: "gesynchroniseerd", manual: "handmatig" };

/** "live", "gesynchroniseerd", "handmatig", or the raw value for unknown sources. */
export function sourceLabel(source) {
  return SOURCE_LABEL[source] ?? source;
}
