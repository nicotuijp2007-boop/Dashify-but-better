// Presentation rules shared by the list and the detail screen. Pure functions, no DOM.
import { computeSummary } from "./contract.js";
import { formatDateTime, formatDuration, formatNumber, sourceLabel, timeAgo } from "./format.js";

export const LEVELS = ["danger", "warn", "ok"];

export const STATUS = {
  ok: { label: "OK", rule: "meer dan 30% over" },
  warn: { label: "Let op", rule: "10–30% over" },
  danger: { label: "Kritiek", rule: "minder dan 10% over" },
};

/**
 * The bar fills with what is LEFT. The marker sits at the time left in the period
 * (1 - elapsed); a fill shorter than the marker means "op vóór de reset".
 */
export function barGeometry(limit) {
  const fill = Math.min(Math.max(limit.leftPct / 100, 0), 1);
  const marker = limit.elapsed == null ? null : Math.min(Math.max(1 - limit.elapsed, 0), 1);
  return { fill, marker, behindPace: marker != null && fill < marker };
}

/** Dashboard rule: full row for limits with a reset or that are not OK, compact otherwise. */
export function usesFullRow(limit) {
  return limit.resetsAt != null || limit.level !== "ok";
}

/** "over 4d 15u", or null without a reset. */
export function resetIn(limit, now = Date.now()) {
  return limit.resetsAt ? `over ${formatDuration(limit.resetsAt.getTime() - now)}` : null;
}

/** "92% gebruikt" or "390 van 500 MB gebruikt", or null without numbers. */
export function usedText(limit) {
  if (limit.unit === "%" && limit.usedPct != null) return `${Math.round(limit.usedPct)}% gebruikt`;
  if (limit.used == null || limit.limit == null) {
    return limit.usedPct != null ? `${Math.round(limit.usedPct)}% gebruikt` : null;
  }
  const unit = limit.unit ? ` ${limit.unit}` : "";
  return `${formatNumber(limit.used)} van ${formatNumber(limit.limit)}${unit} gebruikt`;
}

/** "Bijgewerkt 3m geleden · live". */
export function freshnessText(limit, now = Date.now()) {
  const when = limit.fetchedAt ? `Bijgewerkt ${timeAgo(limit.fetchedAt, now)}` : "Tijdstip onbekend";
  return `${when} · ${sourceLabel(limit.source)}`;
}

/** Text for the meter marker tooltip. */
export function markerText(limit, now = Date.now()) {
  if (limit.elapsed == null) return null;
  const reset = resetIn(limit, now);
  return `${Math.round(limit.elapsed * 100)}% van de periode verstreken${reset ? ` · reset ${reset}` : ""}. Balk korter dan dit streepje = op vóór de reset.`;
}

/** One sentence for screen readers. */
export function accessibilityLabel(limit, now = Date.now()) {
  const parts = [`${limit.serviceName} ${limit.metric}`, limit.leftText, `status ${STATUS[limit.level].label}`];
  if (limit.urgency) parts.push(limit.urgency);
  const reset = resetIn(limit, now);
  if (reset) parts.push(`reset ${reset}`);
  if (limit.stale) parts.push("niet ververst");
  return parts.join(", ");
}

/** Detail rows: [label, value] pairs, only the ones that are known. */
export function detailRows(limit, now = Date.now(), timeZone) {
  const rows = [];
  const unit = limit.unit && limit.unit !== "%" ? ` ${limit.unit}` : limit.unit === "%" ? "%" : "";
  rows.push(["Over", `${limit.leftText} (${limit.leftPct}%)`]);
  if (limit.used != null) rows.push(["Gebruikt", `${formatNumber(limit.used)}${unit}`]);
  if (limit.limit != null) rows.push(["Limiet", `${formatNumber(limit.limit)}${unit}`]);
  rows.push(["Status", `${STATUS[limit.level].label} (${STATUS[limit.level].rule})`]);
  if (limit.resetsAt) {
    rows.push(["Reset", `${formatDateTime(limit.resetsAt, timeZone)} (${resetIn(limit, now)})`]);
  } else {
    rows.push(["Reset", "Geen vaste reset"]);
  }
  if (limit.elapsed != null) rows.push(["Periode verstreken", `${Math.round(limit.elapsed * 100)}%`]);
  if (limit.runsOutAt) {
    rows.push(["Raakt op", `${formatDateTime(limit.runsOutAt, timeZone)} (over ${formatDuration(limit.runsOutAt.getTime() - now)})`]);
  }
  if (limit.urgency) rows.push(["Urgentie", limit.urgency]);
  rows.push(["Bron", sourceLabel(limit.source)]);
  if (limit.fetchedAt) {
    rows.push(["Opgehaald", `${formatDateTime(limit.fetchedAt, timeZone)} (${timeAgo(limit.fetchedAt, now)})`]);
  }
  rows.push(["Versheid", limit.stale ? "Niet ververst: bron faalde, laatst bekende waarde" : "Actueel"]);
  return rows;
}

/** Keeps server order; an empty set means "all". */
export function filterByLevels(limits, levels) {
  return levels.size === 0 ? limits : limits.filter((l) => levels.has(l.level));
}

/** Counts per level, from the limits themselves. */
export function countByLevel(limits) {
  const counts = { ok: 0, warn: 0, danger: 0 };
  for (const l of limits) counts[l.level] += 1;
  return counts;
}

/** Link to the dashboard's details page for a service, if it has one. */
export const DETAILS_PATHS = { claude: "/claude-code" };

export function detailsUrl(dashboardUrl, service) {
  const path = DETAILS_PATHS[service];
  if (!dashboardUrl || !path) return null;
  return new URL(path, dashboardUrl).toString();
}

/** Services the app does not show (their limits and problems are left out): only Netlify usage stays. */
export const HIDDEN_SERVICES = new Set(["supabase", "claude"]);

/**
 * The response without the hidden services. When something was left out, the counts and
 * the headline are recomputed so they match what is shown.
 */
export function withoutServices(response, hidden = HIDDEN_SERVICES) {
  const limits = response.limits.filter((l) => !hidden.has(l.service));
  const problems = response.problems.filter((p) => !hidden.has(p.service));
  if (limits.length === response.limits.length && problems.length === response.problems.length) return response;
  return { ...response, limits, problems, summary: computeSummary(limits) };
}
