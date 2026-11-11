// Limieten PWA. Talks only to this site's own /api/* functions; the widget token stays
// on the server. All text from the API is inserted with textContent (no innerHTML).

import { clearSnapshot, loadSnapshot, saveSnapshot } from "./lib/cache.js";
import { ContractError, normalizeResponse } from "./lib/contract.js";
import { messageFor, titleFor } from "./lib/errors.js";
import { formatClock, formatNumber, updatedText } from "./lib/format.js";
import { limitHref, parseRoute } from "./lib/router.js";
import {
  LEVELS,
  STATUS,
  accessibilityLabel,
  barGeometry,
  countByLevel,
  detailRows,
  detailsUrl,
  filterByLevels,
  freshnessText,
  markerText,
  resetIn,
  usedText,
  usesFullRow,
} from "./lib/view.js";

const APP_VERSION = "1.0.0";
const AUTO_REFRESH_MS = 5 * 60_000;
const REFRESH_ON_RETURN_MS = 60_000;

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem() {}, removeItem() {} };
  }
})();

const state = {
  /** Normalized response, or null. */
  data: null,
  /** When `data` was received from the server. */
  receivedAt: null,
  /** Last refresh error: { code, status }. The previous data stays visible. */
  error: null,
  loading: false,
  /** "unknown" | "in" | "out" */
  auth: "unknown",
  filter: new Set(),
  route: parseRoute(location.hash),
  loginError: null,
  loginBusy: false,
  testResult: null,
  testBusy: false,
};

const app = document.getElementById("app");
const live = document.getElementById("live");

// ---------------------------------------------------------------- DOM helpers

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style") Object.assign(el.style, value);
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "text") el.textContent = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(viewBox, className, parts) {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", viewBox);
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
  if (className) el.setAttribute("class", className);
  for (const [tag, attrs] of parts) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
    el.append(child);
  }
  return el;
}

/** Status shape, never color alone: a check, an exclamation mark, or a cross. */
function statusIcon(level) {
  const parts = [["circle", { cx: "8", cy: "8", r: "8", fill: "currentColor" }]];
  if (level === "ok") {
    parts.push(["path", { d: "M4.5 8.2 7 10.6l4.6-5", stroke: "#fff", "stroke-width": "1.8", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }]);
  } else if (level === "warn") {
    parts.push(["path", { d: "M8 4v5", stroke: "#0b0b0b", "stroke-width": "1.8", "stroke-linecap": "round" }]);
    parts.push(["circle", { cx: "8", cy: "11.6", r: "1.1", fill: "#0b0b0b" }]);
  } else {
    parts.push(["path", { d: "m5.3 5.3 5.4 5.4m0-5.4-5.4 5.4", stroke: "#fff", "stroke-width": "1.8", "stroke-linecap": "round" }]);
  }
  return svg("0 0 16 16", `status-icon ${level}`, parts);
}

function badge(level) {
  return h("span", { class: "badge" }, statusIcon(level), STATUS[level].label);
}

const ICONS = {
  refresh: [["path", { d: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  gear: [
    ["circle", { cx: "12", cy: "12", r: "3", fill: "none", stroke: "currentColor", "stroke-width": "2" }],
    ["path", { d: "M12 2v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }],
  ],
  cloudOff: [["path", { d: "M3 3l18 18M8 7.5A5 5 0 0 1 17 10h1a4 4 0 0 1 2.4 7.2M17 18H7a4 4 0 0 1-1.2-7.8", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  gauge: [
    ["path", { d: "M4 17a8 8 0 1 1 16 0", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }],
    ["path", { d: "M12 17l4-5", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }],
  ],
};

function icon(name) {
  return svg("0 0 24 24", null, ICONS[name]);
}

function announce(text) {
  live.textContent = "";
  // A tick later so screen readers notice the change.
  setTimeout(() => {
    live.textContent = text;
  }, 50);
}

/** Text that shows a relative time and is refreshed by the ticker. */
function ago(date) {
  return h("span", { "data-ago": date.toISOString() }, updatedText(date));
}

// ---------------------------------------------------------------- Data

function applyBody(body, receivedAt) {
  state.data = normalizeResponse(body);
  state.receivedAt = receivedAt;
}

function loadFromCache() {
  const snapshot = loadSnapshot(storage);
  if (!snapshot) return;
  try {
    applyBody(snapshot.body, snapshot.savedAt);
  } catch {
    clearSnapshot(storage);
  }
}

/** Calls /api/limits. Returns { ok, body } or { ok: false, code, status }. */
async function fetchLimits() {
  let response;
  try {
    response = await fetch("/api/limits", { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch {
    return { ok: false, code: navigator.onLine === false ? "offline" : "network" };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (for example an HTML error page).
  }
  if (response.ok && body) return { ok: true, body };
  return { ok: false, code: body?.error ?? "server", status: body?.status ?? response.status };
}

async function refresh({ quiet = false } = {}) {
  if (state.loading || state.auth === "out") return;
  state.loading = true;
  render();
  const result = await fetchLimits();
  state.loading = false;
  if (result.ok) {
    try {
      const now = new Date();
      applyBody(result.body, now);
      saveSnapshot(storage, result.body, now);
      state.error = null;
      state.auth = "in";
      if (!quiet) announce("Gegevens bijgewerkt");
    } catch (err) {
      state.error = { code: err instanceof ContractError ? err.code : "upstream_invalid" };
    }
  } else if (result.code === "login_required") {
    state.auth = "out";
  } else {
    state.auth = state.auth === "unknown" ? "in" : state.auth;
    state.error = { code: result.code, status: result.status };
    if (!quiet) announce(`Niet ververst: ${messageFor(result.code, result.status)}`);
  }
  render();
}

async function login(password) {
  state.loginBusy = true;
  state.loginError = null;
  render();
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      state.auth = "in";
      state.loginBusy = false;
      await refresh();
      return;
    }
    state.loginError = messageFor(body?.error ?? "server");
  } catch {
    state.loginError = messageFor(navigator.onLine === false ? "offline" : "network");
  }
  state.loginBusy = false;
  render();
  document.getElementById("password")?.focus();
}

async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    // The cookie stays until it expires; local data is cleared anyway.
  }
  clearSnapshot(storage);
  Object.assign(state, { data: null, receivedAt: null, error: null, auth: "out", testResult: null });
  location.hash = "#/";
  render();
}

async function testConnection() {
  state.testBusy = true;
  state.testResult = null;
  render();
  const result = await fetchLimits();
  state.testBusy = false;
  if (result.ok) {
    try {
      const now = new Date();
      applyBody(result.body, now);
      saveSnapshot(storage, result.body, now);
      state.error = null;
      state.testResult = { ok: true, count: state.data.limits.length };
    } catch (err) {
      state.testResult = { ok: false, code: err instanceof ContractError ? err.code : "upstream_invalid" };
    }
  } else {
    if (result.code === "login_required") state.auth = "out";
    state.testResult = { ok: false, code: result.code, status: result.status };
  }
  render();
  announce(state.testResult.ok ? "Verbonden" : titleFor(state.testResult.code));
}

// ---------------------------------------------------------------- Views

function topbar(title, { home = false } = {}) {
  const refreshButton = h(
    "button",
    {
      class: "icon-button",
      type: "button",
      "aria-label": "Vernieuwen",
      "aria-busy": state.loading ? "true" : "false",
      onclick: () => refresh(),
    },
    icon("refresh"),
  );
  return h(
    "header",
    { class: "topbar" },
    h("h1", { tabindex: "-1" }, title),
    h(
      "div",
      { class: "actions" },
      home ? refreshButton : null,
      home ? h("a", { class: "icon-button", href: "#/instellingen", "aria-label": "Instellingen" }, icon("gear")) : null,
    ),
  );
}

function meter(limit, now) {
  const geometry = barGeometry(limit);
  const fill = h("div", { class: "meter-fill" });
  // Same minimum visible sliver as the dashboard.
  fill.style.width = `${limit.leftPct > 0 ? Math.max(limit.leftPct, 1.5) : 0}%`;
  const wrap = h(
    "div",
    { class: "meter-wrap" },
    h(
      "div",
      {
        class: `meter ${limit.level}`,
        role: "meter",
        "aria-label": `${limit.serviceName} ${limit.metric}: ${limit.leftPct}% over`,
        "aria-valuenow": limit.leftPct,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
      },
      fill,
    ),
  );
  if (geometry.marker != null) {
    const marker = h("div", { class: "meter-marker", title: markerText(limit, now) });
    marker.style.left = `${geometry.marker * 100}%`;
    wrap.append(marker);
  }
  return wrap;
}

function legend() {
  return h(
    "p",
    { class: "legend" },
    h("span", { class: "legend-mark", "aria-hidden": "true" }),
    h("span", {}, "Streepje = tijd over tot de reset. Balk korter dan het streepje = op vóór de reset."),
  );
}

function fullRow(limit, now, showLegend) {
  const used = usedText(limit);
  const reset = resetIn(limit, now);
  const urgent = limit.level === "danger" || limit.runsOutAt != null;
  return h(
    "a",
    { class: "row", href: limitHref(limit.id), "aria-label": accessibilityLabel(limit, now) },
    h(
      "div",
      { class: "row-head" },
      h("div", {}, h("div", { class: "service" }, limit.serviceName), h("div", { class: "metric" }, limit.metric)),
      h(
        "div",
        { class: "left" },
        h("div", { class: "left-main" }, limit.leftText),
        limit.unit !== "%" ? h("div", { class: "left-sub" }, `${limit.leftPct}%`) : null,
      ),
    ),
    meter(limit, now),
    showLegend ? legend() : null,
    limit.urgency ? h("p", { class: `urgency${urgent ? " urgent" : ""}` }, limit.urgency) : null,
    h(
      "div",
      { class: "meta" },
      h("span", {}, badge(limit.level), used ? h("span", { class: "secondary" }, ` ${used}`) : null),
      h("span", {}, reset ? `Reset ${reset}` : "Geen vaste reset"),
      h("span", {}, freshnessText(limit, now), limit.stale ? " · niet ververst" : ""),
    ),
  );
}

function compactRow(limit, now) {
  return h(
    "a",
    { class: "row compact", href: limitHref(limit.id), "aria-label": accessibilityLabel(limit, now) },
    statusIcon(limit.level),
    h(
      "span",
      { class: "name" },
      h("span", { class: "service" }, limit.serviceName),
      h("span", { class: "metric" }, limit.metric),
      limit.stale ? h("span", { class: "muted tiny" }, " · niet ververst") : null,
    ),
    h("span", { class: "left-main" }, limit.leftText),
  );
}

function chips(limits) {
  const counts = countByLevel(limits);
  const list = h("ul", { class: "chips", "aria-label": "Filter op status" });
  for (const level of LEVELS) {
    const pressed = state.filter.has(level);
    list.append(
      h(
        "li",
        {},
        h(
          "button",
          {
            class: "chip",
            type: "button",
            "aria-pressed": pressed ? "true" : "false",
            "aria-label": `${STATUS[level].label}: ${counts[level]}. ${pressed ? "Filter actief" : "Tik om te filteren"}`,
            onclick: () => {
              if (state.filter.has(level)) state.filter.delete(level);
              else state.filter.add(level);
              render();
            },
          },
          statusIcon(level),
          STATUS[level].label,
          h("span", { class: "count" }, String(counts[level])),
        ),
      ),
    );
  }
  if (state.filter.size) {
    list.append(
      h(
        "li",
        {},
        h(
          "button",
          {
            class: "chip chip-clear",
            type: "button",
            onclick: () => {
              state.filter.clear();
              render();
            },
          },
          "Alles tonen",
        ),
      ),
    );
  }
  return list;
}

function staleNotice() {
  if (!state.error) return null;
  const when = state.receivedAt ? ` Laatste gegevens van ${formatClock(state.receivedAt)}.` : "";
  return h(
    "p",
    { class: "notice", role: "status" },
    icon("cloudOff"),
    h("span", {}, `Niet ververst: ${messageFor(state.error.code, state.error.status)}${when}`),
  );
}

function dashboardLinks(data, service) {
  const dashboardUrl = data?.dashboardUrl;
  if (!dashboardUrl) return null;
  const details = detailsUrl(dashboardUrl, service);
  return h(
    "nav",
    { class: "links", "aria-label": "Dashboard" },
    h("a", { href: dashboardUrl, target: "_blank", rel: "noopener noreferrer" }, "Open dashboard ↗"),
    details ? h("a", { href: details, target: "_blank", rel: "noopener noreferrer" }, "Details ↗") : null,
  );
}

function emptyState(title, text, action) {
  return h(
    "div",
    { class: "card empty" },
    icon("gauge"),
    h("h2", { class: "headline" }, title),
    h("p", { class: "secondary small" }, text),
    action ?? null,
  );
}

function homeView() {
  const now = Date.now();
  const data = state.data;
  const nodes = [topbar("Limieten", { home: true })];

  if (!data) {
    if (state.loading || state.auth === "unknown") {
      nodes.push(h("p", { class: "muted" }, "Gegevens ophalen…"));
    } else {
      const message = state.error ? messageFor(state.error.code, state.error.status) : "Nog geen gegevens.";
      nodes.push(
        emptyState(
          "Geen gegevens",
          message,
          h("button", { class: "button", type: "button", onclick: () => refresh() }, "Opnieuw proberen"),
        ),
      );
    }
    return nodes;
  }

  nodes.push(
    h(
      "section",
      { class: "card", "aria-label": "Samenvatting" },
      h("p", { class: "headline" }, data.summary.headline),
      h("p", { class: "updated muted small" }, state.receivedAt ? ago(state.receivedAt) : null),
      staleNotice(),
    ),
  );

  if (!data.limits.length) {
    nodes.push(emptyState("Geen limieten", "Het dashboard gaf (nog) geen limieten terug."));
  } else {
    nodes.push(chips(data.limits));
    const visible = filterByLevels(data.limits, state.filter);
    const list = h("ul", { class: "limits", "aria-label": "Limieten, meest urgent eerst" });
    let legendShown = false;
    for (const limit of visible) {
      const full = usesFullRow(limit);
      const showLegend = full && !legendShown && limit.elapsed != null;
      if (showLegend) legendShown = true;
      list.append(h("li", {}, full ? fullRow(limit, now, showLegend) : compactRow(limit, now)));
    }
    nodes.push(
      h(
        "section",
        { class: "card" },
        visible.length ? list : h("p", { class: "muted" }, "Geen limieten met deze status."),
      ),
    );
  }

  if (data.problems.length) {
    nodes.push(
      h("h2", { class: "section-title" }, "Bronnen met problemen"),
      h(
        "ul",
        { class: "card problems" },
        data.problems.map((p) =>
          h(
            "li",
            {},
            h("div", { class: "metric" }, p.name),
            h("div", { class: "secondary small" }, p.message || "Onbekende fout"),
            p.hasValues ? h("div", { class: "muted tiny" }, "Laatst bekende waarden worden getoond.") : null,
          ),
        ),
      ),
    );
  }

  nodes.push(dashboardLinks(data));
  return nodes;
}

function limitView(id) {
  const now = Date.now();
  const limit = state.data?.limits.find((l) => l.id === id);
  const nodes = [h("a", { class: "back", href: "#/" }, "‹ Overzicht")];
  if (!limit) {
    nodes.push(
      h("h1", { class: "detail-title", tabindex: "-1" }, "Limiet niet gevonden"),
      h("p", { class: "secondary" }, state.data ? "Deze limiet staat niet (meer) in de gegevens." : "Nog geen gegevens geladen."),
    );
    return nodes;
  }
  const facts = h("dl", { class: "facts" });
  for (const [label, value] of detailRows(limit, now)) {
    facts.append(h("dt", {}, label), h("dd", {}, value));
  }
  nodes.push(
    h("div", { class: "service" }, limit.serviceName),
    h("h1", { class: "detail-title", tabindex: "-1" }, limit.metric),
    h(
      "section",
      { class: "card", "aria-label": "Wat er over is" },
      h("p", { class: "big" }, `${limit.leftPct}%`, h("span", { class: "sr-only" }, " over")),
      h("p", { class: "secondary", style: { margin: "0.25rem 0 0" } }, limit.leftText),
      meter(limit, now),
      limit.elapsed != null ? legend() : null,
      h("p", { class: "meta", style: { marginTop: "0.5rem" } }, badge(limit.level), limit.stale ? h("span", {}, "niet ververst") : null),
    ),
    limit.urgency ? h("p", { class: "card urgency urgent" }, limit.urgency) : null,
    h("section", { class: "card", "aria-label": "Gegevens" }, facts),
    staleNotice(),
    dashboardLinks(state.data, limit.service),
  );
  return nodes;
}

function settingsView() {
  const host = (() => {
    try {
      return state.data?.dashboardUrl ? new URL(state.data.dashboardUrl).host : null;
    } catch {
      return null;
    }
  })();

  let result = null;
  if (state.testBusy) {
    result = h("p", { class: "muted small", role: "status" }, "Bezig met testen…");
  } else if (state.testResult?.ok) {
    const n = state.testResult.count;
    result = h(
      "div",
      { class: "result", role: "status" },
      statusIcon("ok"),
      h("p", {}, `Verbonden. ${formatNumber(n)} ${n === 1 ? "limiet" : "limieten"} opgehaald.`),
    );
  } else if (state.testResult) {
    const { code, status } = state.testResult;
    result = h(
      "div",
      { class: "result", role: "status" },
      statusIcon("danger"),
      h("div", {}, h("p", { class: "metric" }, titleFor(code)), h("p", { class: "secondary small" }, messageFor(code, status))),
    );
  }

  return [
    h("a", { class: "back", href: "#/" }, "‹ Overzicht"),
    h("h1", { class: "detail-title", tabindex: "-1" }, "Instellingen"),
    h("h2", { class: "section-title" }, "Verbinding"),
    h(
      "section",
      { class: "card stack" },
      h(
        "p",
        { class: "secondary small", style: { margin: "0" } },
        host ? `Dashboard: ${host}. ` : "",
        "De widgettoken staat alleen op de server (Netlify-omgevingsvariabele WIDGET_TOKEN), niet op dit toestel.",
      ),
      h("button", { class: "button", type: "button", disabled: state.testBusy, onclick: () => testConnection() }, "Verbinding testen"),
      result,
    ),
    h("h2", { class: "section-title" }, "Op dit toestel"),
    h(
      "section",
      { class: "card stack" },
      h(
        "button",
        {
          class: "button",
          type: "button",
          onclick: () => {
            clearSnapshot(storage);
            announce("Bewaarde gegevens gewist");
          },
        },
        "Bewaarde gegevens wissen",
      ),
      h(
        "button",
        {
          class: "button destructive",
          type: "button",
          onclick: () => {
            if (confirm("Uitloggen op dit toestel? Bewaarde gegevens worden ook gewist.")) logout();
          },
        },
        "Uitloggen",
      ),
    ),
    h("h2", { class: "section-title" }, "Op je beginscherm"),
    h(
      "section",
      { class: "card" },
      h(
        "p",
        { class: "secondary small", style: { margin: "0" } },
        "Open deze site in Safari, tik op Deel en kies ‘Zet op beginscherm’. De app opent dan schermvullend en werkt ook offline met de laatst bewaarde gegevens. Echte iOS-widgets kan een web-app niet maken; daarvoor is er de Scriptable-widget van het dashboard.",
      ),
    ),
    h("p", { class: "footer" }, `Limieten ${APP_VERSION}`),
  ];
}

function loginView() {
  const input = h("input", {
    id: "password",
    type: "password",
    name: "password",
    autocomplete: "current-password",
    required: true,
    "aria-describedby": state.loginError ? "login-error" : null,
  });
  const form = h(
    "form",
    {
      class: "card stack",
      onsubmit: (event) => {
        event.preventDefault();
        if (input.value) login(input.value);
      },
    },
    h("div", { style: { width: "100%" } }, h("label", { for: "password" }, "Wachtwoord"), input),
    state.loginError ? h("p", { id: "login-error", class: "secondary small", role: "alert", style: { margin: "0" } }, state.loginError) : null,
    h("button", { class: "button primary", type: "submit", disabled: state.loginBusy }, state.loginBusy ? "Bezig…" : "Inloggen"),
  );
  return [
    topbar("Limieten"),
    h("p", { class: "secondary" }, "Log in om te zien wat er over is van je limieten."),
    form,
  ];
}

let lastRouteKey = null;

function render() {
  state.route = parseRoute(location.hash);
  let nodes;
  if (state.auth === "out") nodes = loginView();
  else if (state.route.name === "limit") nodes = limitView(state.route.id);
  else if (state.route.name === "settings") nodes = settingsView();
  else nodes = homeView();

  const focused = document.activeElement;
  const focusedKey = focused?.getAttribute?.("aria-label") ?? focused?.textContent;
  app.replaceChildren(...nodes.flat().filter(Boolean));

  const routeKey = state.auth === "out" ? "login" : `${state.route.name}:${state.route.id ?? ""}`;
  if (routeKey !== lastRouteKey) {
    // New screen: move focus to its heading and start at the top.
    if (lastRouteKey !== null) {
      window.scrollTo(0, 0);
      app.querySelector("h1")?.focus();
    }
    lastRouteKey = routeKey;
  } else if (focused && focused !== document.body && !app.contains(focused)) {
    // Same screen re-rendered: keep focus on the equivalent control.
    const again = [...app.querySelectorAll("button, a, input")].find(
      (el) => (el.getAttribute("aria-label") ?? el.textContent) === focusedKey,
    );
    again?.focus();
  }
}

// ---------------------------------------------------------------- Ticker, pull-to-refresh

function tick() {
  for (const el of document.querySelectorAll("[data-ago]")) {
    el.textContent = updatedText(new Date(el.dataset.ago));
  }
}

function setupPullToRefresh() {
  const indicator = document.getElementById("ptr");
  const threshold = 70;
  let startY = null;
  let distance = 0;

  window.addEventListener(
    "touchstart",
    (event) => {
      startY = window.scrollY <= 0 && state.route.name === "home" && state.auth !== "out" ? event.touches[0].clientY : null;
      distance = 0;
    },
    { passive: true },
  );
  window.addEventListener(
    "touchmove",
    (event) => {
      if (startY == null) return;
      distance = Math.max(0, event.touches[0].clientY - startY);
      const progress = Math.min(distance / threshold, 1);
      indicator.style.opacity = String(progress);
      indicator.style.transform = `translateY(${-48 + progress * 64}px)`;
    },
    { passive: true },
  );
  window.addEventListener("touchend", async () => {
    if (startY == null) return;
    startY = null;
    if (distance >= threshold) {
      indicator.classList.add("loading");
      await refresh();
      indicator.classList.remove("loading");
    }
    indicator.style.opacity = "0";
    indicator.style.transform = "";
  });
}

// ---------------------------------------------------------------- Start

loadFromCache();
render();
refresh({ quiet: true });

window.addEventListener("hashchange", render);
setInterval(tick, 30_000);
setInterval(() => {
  if (document.visibilityState === "visible") refresh({ quiet: true });
}, AUTO_REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  tick();
  if (!state.receivedAt || Date.now() - state.receivedAt.getTime() > REFRESH_ON_RETURN_MS) refresh({ quiet: true });
});
window.addEventListener("online", () => refresh({ quiet: true }));
setupPullToRefresh();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Offline start is a bonus; the app works without it.
  });
}
