// Normalizes a `GET /api/widget` response (contract v1) into a predictable shape.
// Lenient on purpose: unknown fields are ignored, missing optional fields get defaults,
// and a malformed limit is skipped instead of breaking the whole response.

export const SUPPORTED_VERSION = 1;

/** Thrown when the body is not a usable v1 response. `code` matches errors.js. */
export class ContractError extends Error {
  constructor(code, detail) {
    super(detail ?? code);
    this.code = code;
    this.detail = detail;
  }
}

/** Level from the share left: OK > 30%, Let op 10–30%, Kritiek < 10%. */
export function levelForLeft(leftPct) {
  if (leftPct < 10) return "danger";
  if (leftPct <= 30) return "warn";
  return "ok";
}

const LEVELS = new Set(["ok", "warn", "danger"]);

function str(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function date(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** One limit, or null when it has no id or no way to know what is left. */
export function normalizeLimit(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id);
  if (!id) return null;

  const [idService, ...rest] = id.split("|");
  const service = str(raw.service) ?? idService;
  const metric = str(raw.metric) ?? (rest.length ? rest.join("|") : id);
  const serviceName = str(raw.serviceName) ?? service;

  const usedPct = num(raw.usedPct);
  const used = num(raw.used);
  const limit = num(raw.limit);

  let leftPct = num(raw.leftPct);
  if (leftPct == null && usedPct != null) leftPct = Math.max(0, 100 - Math.round(usedPct));
  if (leftPct == null && used != null && limit != null && limit > 0) {
    leftPct = Math.max(0, 100 - Math.round((used / limit) * 100));
  }
  if (leftPct == null) return null;
  leftPct = clamp(leftPct, 0, 100);
  const leftRounded = Math.round(leftPct);

  const elapsed = num(raw.elapsed);
  const urgency = str(raw.urgency);

  return {
    id,
    service,
    serviceName,
    metric,
    leftPct: leftRounded,
    usedPct,
    used,
    limit,
    unit: str(raw.unit),
    leftText: str(raw.leftText) ?? `${leftRounded}% over`,
    level: LEVELS.has(raw.level) ? raw.level : levelForLeft(leftPct),
    resetsAt: date(raw.resetsAt),
    elapsed: elapsed == null ? null : clamp(elapsed, 0, 1),
    runsOutAt: date(raw.runsOutAt),
    urgency,
    source: str(raw.source) ?? "api",
    fetchedAt: date(raw.fetchedAt),
    stale: raw.stale === true,
  };
}

function normalizeProblem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const service = str(raw.service) ?? "";
  return {
    service,
    name: str(raw.name) ?? service,
    hasValues: raw.hasValues === true,
    message: str(raw.message) ?? "",
  };
}

/** Counts and a headline computed from the limits, for when the server sends none. */
export function computeSummary(limits) {
  const count = (level) => limits.filter((l) => l.level === level).length;
  const ok = count("ok");
  const warn = count("warn");
  const danger = count("danger");
  const tightest = limits[0];
  if (!tightest) return { ok: 0, warn: 0, danger: 0, headline: "Geen limieten" };
  const parts = [];
  if (danger) parts.push(`${danger} kritiek`);
  if (warn) parts.push(`${warn} let op`);
  const lead = parts.length ? parts.join(", ") : "Alles binnen marge";
  return {
    ok,
    warn,
    danger,
    headline: `${lead} · krapst: ${tightest.serviceName} ${tightest.metric}, ${tightest.leftText}`,
  };
}

/**
 * Normalizes a parsed JSON body. Throws ContractError("upstream_invalid") for anything
 * that is not a response object and ContractError("unsupported_version") for version != 1.
 * Keeps the server order of `limits` (most urgent first, like the dashboard).
 */
export function normalizeResponse(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new ContractError("upstream_invalid", "Not an object");
  }
  const version = num(json.version);
  if (version == null) throw new ContractError("upstream_invalid", "Missing version");
  if (version !== SUPPORTED_VERSION) throw new ContractError("unsupported_version", String(version));

  const limits = (Array.isArray(json.limits) ? json.limits : []).map(normalizeLimit).filter(Boolean);
  const problems = (Array.isArray(json.problems) ? json.problems : []).map(normalizeProblem).filter(Boolean);

  const computed = computeSummary(limits);
  const s = json.summary && typeof json.summary === "object" ? json.summary : {};
  const summary = {
    ok: num(s.ok) ?? computed.ok,
    warn: num(s.warn) ?? computed.warn,
    danger: num(s.danger) ?? computed.danger,
    headline: str(s.headline) ?? computed.headline,
  };

  return {
    version,
    generatedAt: date(json.generatedAt),
    dashboardUrl: str(json.dashboardUrl),
    summary,
    limits,
    problems,
  };
}
