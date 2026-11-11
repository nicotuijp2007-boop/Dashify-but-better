// DOM helpers shared by all screens. Text is always inserted as text nodes (no innerHTML).

import { updatedText } from "../lib/format.js";
import { STATUS } from "../lib/view.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style") Object.assign(el.style, value);
    else if (key === "vars") for (const [k, v] of Object.entries(value)) el.style.setProperty(k, v);
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

export const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(viewBox, className, parts) {
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
export function statusIcon(level) {
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

/** Icon + word, the word in normal text color. */
export function badge(level) {
  return h("span", { class: "badge" }, statusIcon(level), STATUS[level].label);
}

/** Pill with icon + word, for prominent status (hero, deploy cards). */
export function statusPill(level, label = STATUS[level].label) {
  return h("span", { class: `pill pill-${level}` }, statusIcon(level), label);
}

const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" };
const p = (d) => ["path", { d, ...stroke }];
const c = (cx, cy, r) => ["circle", { cx, cy, r, ...stroke }];

export const ICONS = {
  refresh: [p("M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7")],
  gear: [c("12", "12", "3"), p("M12 2v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1")],
  cloudOff: [p("M3 3l18 18M8 7.5A5 5 0 0 1 17 10h1a4 4 0 0 1 2.4 7.2M17 18H7a4 4 0 0 1-1.2-7.8")],
  gauge: [p("M4 17a8 8 0 1 1 16 0"), p("M12 17l4-5")],
  back: [p("m15 5-7 7 7 7")],
  chevron: [p("m9 6 6 6-6 6")],
  external: [p("M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5")],
  clock: [c("12", "12", "9"), p("M12 7v5l3 2")],
  minus: [c("12", "12", "9"), p("M8 12h8")],
  calendar: [["rect", { x: "3.5", y: "5", width: "17", height: "15", rx: "2.5", ...stroke }], p("M3.5 10h17M8 3v4m8-4v4")],
  timer: [c("12", "13", "8"), p("M12 13V9m-3-7h6")],
  wand: [p("m4 20 11-11m-2-2 4 4M17 3v3m-1.5-1.5h3M20 9v2m-1-1h2M9 3v2M8 4h2")],
  link: [p("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"), p("M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1")],
  commit: [c("12", "12", "3.5"), p("M3 12h5.5m7 0H21")],
  branch: [c("6", "5", "2"), c("6", "19", "2"), c("18", "7", "2"), p("M6 7v10M18 9c0 5-6 4-11.5 8.5")],
  fingerprint: [p("M12 11v3a8 8 0 0 1-1.5 4.5M8.5 8.5A5 5 0 0 1 17 12v1.5a14 14 0 0 1-.8 4.5M5 15.5c.6-1.2 1-2.5 1-4A6 6 0 0 1 12 5.5a6 6 0 0 1 3 .8M20 12c0 2-.3 3.8-.8 5.4")],
  person: [c("12", "8", "4"), p("M4.5 20a7.5 7.5 0 0 1 15 0")],
  grid: [
    ["rect", { x: "4", y: "4", width: "7", height: "7", rx: "1.5", ...stroke }],
    ["rect", { x: "13", y: "4", width: "7", height: "7", rx: "1.5", ...stroke }],
    ["rect", { x: "4", y: "13", width: "7", height: "7", rx: "1.5", ...stroke }],
    ["rect", { x: "13", y: "13", width: "7", height: "7", rx: "1.5", ...stroke }],
  ],
  sparkle: [p("M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7Z"), p("M19 16.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z")],
  database: [["ellipse", { cx: "12", cy: "6", rx: "7", ry: "3", ...stroke }], p("M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3")],
  nodes: [c("12", "5", "2.2"), c("5", "18", "2.2"), c("19", "18", "2.2"), p("M11 7 6 16m7-9 5 9M7.2 18h9.6")],
  logout: [p("M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10")],
  trash: [p("M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3")],
  phone: [["rect", { x: "6.5", y: "2.5", width: "11", height: "19", rx: "2.5", ...stroke }], p("M11 18.5h2")],
  plug: [p("M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5")],
  lock: [["rect", { x: "5", y: "11", width: "14", height: "10", rx: "2", ...stroke }], p("M8 11V8a4 4 0 0 1 8 0v3")],
};

export function icon(name, className) {
  return svg("0 0 24 24", className ?? `icon icon-${name}`, ICONS[name]);
}

/** Icon for a deploy kind: ok | danger | busy | neutral. */
export function kindIcon(kind) {
  if (kind === "ok" || kind === "danger") return statusIcon(kind);
  return icon(kind === "busy" ? "clock" : "minus", "status-icon neutral");
}

/**
 * Own, simple service icons (no brand logos), each in a hue that does not clash with the
 * status colors: Claude violet, Supabase blue, Netlify teal.
 */
const SERVICES = {
  claude: { glyph: "sparkle", hue: "violet" },
  supabase: { glyph: "database", hue: "blue" },
  netlify: { glyph: "nodes", hue: "teal" },
};

export function serviceTile(service, label, size = "") {
  const known = SERVICES[service];
  const tile = h("span", { class: `tile tile-${known?.hue ?? "gray"} ${size}`.trim(), "aria-hidden": "true" });
  tile.append(known ? icon(known.glyph, "tile-glyph") : document.createTextNode((label ?? service ?? "?").slice(0, 1).toUpperCase()));
  return tile;
}

/** Text that shows a relative time and is refreshed by the ticker. */
export function ago(date) {
  return h("span", { "data-ago": date.toISOString() }, updatedText(date));
}

// ---------------------------------------------------------------- Gauge

const CX = 100;
const CY = 100;
const R = 80;
const START = 135; // degrees, clockwise from 3 o'clock; the arc spans 270 degrees.

function point(angle, radius = R) {
  const rad = (angle * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)].map((n) => n.toFixed(2));
}

const [sx, sy] = point(START);
const [ex, ey] = point(START + 270);
const ARC = `M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`;

/**
 * Big 270-degree gauge of what is left. `fill` and `marker` are 0..1 (marker = time left in
 * the period, like the bars). Colors come from CSS via the level class.
 */
export function gauge({ fill, marker, level, label }) {
  const pct = Math.round(Math.min(Math.max(fill, 0), 1) * 100);
  const parts = [
    ["path", { d: ARC, class: "gauge-track", pathLength: "100" }],
    ["path", { d: ARC, class: "gauge-fill", pathLength: "100", "stroke-dasharray": `${pct} 100` }],
  ];
  if (marker != null) {
    const angle = START + 270 * Math.min(Math.max(marker, 0), 1);
    const [x1, y1] = point(angle, R - 15);
    const [x2, y2] = point(angle, R + 15);
    parts.push(["line", { x1, y1, x2, y2, class: "gauge-marker" }]);
  }
  const el = svg("0 0 200 200", `gauge gauge-${level}`, parts);
  el.removeAttribute("aria-hidden");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  return el;
}
