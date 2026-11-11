// DOM helpers shared by all screens. Text is always inserted as text nodes (no innerHTML).

import { updatedText } from "../lib/format.js";
import { STATUS } from "../lib/view.js";

export function h(tag, attrs = {}, ...children) {
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

export function badge(level) {
  return h("span", { class: "badge" }, statusIcon(level), STATUS[level].label);
}

export const ICONS = {
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

ICONS.clock = [
  ["circle", { cx: "12", cy: "12", r: "9", fill: "none", stroke: "currentColor", "stroke-width": "2" }],
  ["path", { d: "M12 7v5l3 2", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }],
];
ICONS.minus = [
  ["circle", { cx: "12", cy: "12", r: "9", fill: "none", stroke: "currentColor", "stroke-width": "2" }],
  ["path", { d: "M8 12h8", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }],
];
ICONS.chevron = [["path", { d: "m9 6 6 6-6 6", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }]];

/** Icon for a deploy kind: ok | danger | busy | neutral. */
export function kindIcon(kind) {
  if (kind === "ok" || kind === "danger") return statusIcon(kind);
  const el = icon(kind === "busy" ? "clock" : "minus");
  el.setAttribute("class", "status-icon neutral");
  return el;
}

export function icon(name) {
  return svg("0 0 24 24", null, ICONS[name]);
}

/** Text that shows a relative time and is refreshed by the ticker. */
export function ago(date) {
  return h("span", { "data-ago": date.toISOString() }, updatedText(date));
}
