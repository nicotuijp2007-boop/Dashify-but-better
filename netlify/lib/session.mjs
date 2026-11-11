// Login session as a signed, HttpOnly cookie. No server-side state.
//
// The signing key is derived from SITE_PASSWORD and WIDGET_TOKEN, so changing either
// one logs out every device. WIDGET_TOKEN adds entropy, so a stolen cookie cannot be
// used to guess a weak password offline.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "limieten_session";
export const SESSION_DAYS = 180;

function signingKey(config) {
  return createHash("sha256")
    .update(`limieten-session-v1\0${config.sitePassword}\0${config.widgetToken}`)
    .digest();
}

function sign(config, payload) {
  return createHmac("sha256", signingKey(config)).update(payload).digest("base64url");
}

/** Constant-time string comparison (via hashes, so lengths don't leak). */
export function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** Cookie value "<expiresAtSeconds>.<signature>". */
export function createSessionValue(config, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_DAYS * 86_400;
  const payload = `v1.${expires}`;
  return `${expires}.${sign(config, payload)}`;
}

export function isValidSessionValue(config, value, now = Date.now()) {
  if (typeof value !== "string") return false;
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{20,})$/.exec(value);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires * 1000 <= now) return false;
  return safeEqual(match[2], sign(config, `v1.${expires}`));
}

export function readCookie(request, name = COOKIE_NAME) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function hasValidSession(config, request, now = Date.now()) {
  return isValidSessionValue(config, readCookie(request), now);
}

export function sessionCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${SESSION_DAYS * 86_400}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
