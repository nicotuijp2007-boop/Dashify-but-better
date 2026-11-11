// Limieten PWA. Talks only to this site's own /api/* functions; the widget token stays
// on the server. All text from the API is inserted with textContent (no innerHTML).

import { clearSnapshot, loadSnapshot, NETLIFY_KEY, saveSnapshot } from "./lib/cache.js";
import { ContractError, normalizeResponse } from "./lib/contract.js";
import { messageFor, titleFor } from "./lib/errors.js";
import { formatClock, formatNumber, updatedText } from "./lib/format.js";
import { limitHref, parseRoute } from "./lib/router.js";
import { ago, badge, h, icon, statusIcon } from "./ui/dom.js";
import { netlifySection, siteView } from "./ui/netlify-views.js";
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

const APP_VERSION = "1.1.0";
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
  /** Netlify overview: { data, receivedAt, error }. */
  netlify: { data: null, receivedAt: null, error: null },
  /** Per site id: { data, error, loading }. */
  sites: {},
};

const app = document.getElementById("app");
const live = document.getElementById("live");

// ---------------------------------------------------------------- Live region

function announce(text) {
  live.textContent = "";
  // A tick later so screen readers notice the change.
  setTimeout(() => {
    live.textContent = text;
  }, 50);
}

// ---------------------------------------------------------------- Data

function applyBody(body, receivedAt) {
  state.data = normalizeResponse(body);
  state.receivedAt = receivedAt;
}

function loadFromCache() {
  const snapshot = loadSnapshot(storage);
  if (snapshot) {
    try {
      applyBody(snapshot.body, snapshot.savedAt);
    } catch {
      clearSnapshot(storage);
    }
  }
  const netlify = loadSnapshot(storage, NETLIFY_KEY);
  if (netlify && Array.isArray(netlify.body.sites)) {
    state.netlify = { data: netlify.body, receivedAt: netlify.savedAt, error: null };
  }
}

/** Calls one of this site's /api/* endpoints. Returns { ok, body } or { ok: false, code, status }. */
async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
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

function fetchLimits() {
  return fetchJson("/api/limits");
}

function applyNetlify(result) {
  if (result.ok && Array.isArray(result.body?.sites)) {
    const now = new Date();
    state.netlify = { data: result.body, receivedAt: now, error: null };
    saveSnapshot(storage, result.body, now, NETLIFY_KEY);
  } else if (!result.ok && result.code !== "login_required") {
    state.netlify = { ...state.netlify, error: { code: result.code, status: result.status } };
  }
}

async function loadSite(id) {
  const entry = state.sites[id] ?? {};
  if (entry.loading) return;
  state.sites[id] = { ...entry, loading: true };
  const result = await fetchJson(`/api/netlify?view=site&id=${encodeURIComponent(id)}`);
  if (result.ok) state.sites[id] = { data: result.body, error: null, loading: false };
  else {
    if (result.code === "login_required") state.auth = "out";
    state.sites[id] = { ...state.sites[id], error: { code: result.code, status: result.status }, loading: false };
  }
  render();
}

async function refresh({ quiet = false } = {}) {
  if (state.loading || state.auth === "out") return;
  state.loading = true;
  render();
  const [result, netlify] = await Promise.all([fetchLimits(), fetchJson("/api/netlify?view=overview")]);
  state.loading = false;
  applyNetlify(netlify);
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
  clearSnapshot(storage, NETLIFY_KEY);
  Object.assign(state, {
    data: null,
    receivedAt: null,
    error: null,
    auth: "out",
    testResult: null,
    netlify: { data: null, receivedAt: null, error: null },
    sites: {},
  });
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

/** Light message for the Netlify part: why it is missing or not refreshed. */
function netlifyMessage(entry) {
  if (!entry?.error) return null;
  const text = messageFor(entry.error.code, entry.error.status);
  if (!entry.data) return text;
  const when = entry.receivedAt ? ` Laatste gegevens van ${formatClock(entry.receivedAt)}.` : "";
  return `Niet ververst: ${text}${when}`;
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
  nodes.push(...netlifySection(state.netlify, now, netlifyMessage(state.netlify)));
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
            clearSnapshot(storage, NETLIFY_KEY);
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
  else if (state.route.name === "site") nodes = siteView(state.sites[state.route.id], state.route.id, Date.now(), netlifyMessage(state.sites[state.route.id]));
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
    // Site screens always fetch fresh details; cached ones show meanwhile.
    if (state.route.name === "site" && state.auth !== "out") loadSite(state.route.id);
  } else if (focused?.tagName === "H1" && !app.contains(focused)) {
    // The heading was re-rendered (for example when data arrived): keep the reader there.
    app.querySelector("h1")?.focus();
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
