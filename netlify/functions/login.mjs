// POST /api/login with JSON { password }: sets the session cookie.
// GET /api/login: tells whether this browser is logged in (for the start screen).

import { readConfig } from "../lib/config.mjs";
import { error, isSameOrigin, json } from "../lib/http.mjs";
import { createSessionValue, hasValidSession, safeEqual, sessionCookie } from "../lib/session.mjs";

/** Slows down password guessing a little; functions keep no state to count attempts. */
export const FAILURE_DELAY_MS = 1_000;

export async function handleLogin(request, { env = process.env, now = Date.now(), delay = FAILURE_DELAY_MS } = {}) {
  const config = readConfig(env);
  if (config.missing.length) return error(503, "not_configured", { missing: config.missing });

  if (request.method === "GET") {
    return json(200, { loggedIn: hasValidSession(config, request, now) });
  }
  if (request.method !== "POST") return error(405, "method_not_allowed", {}, { Allow: "GET, POST" });

  // JSON-only plus a same-origin check: a plain cross-site form cannot log in.
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json") || !isSameOrigin(request)) return error(403, "forbidden");

  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    // Treated as a wrong password below.
  }

  if (!password || !safeEqual(password, config.sitePassword)) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    return error(401, "login_failed");
  }
  return json(200, { loggedIn: true }, { "Set-Cookie": sessionCookie(createSessionValue(config, now)) });
}

export default (request) => handleLogin(request);

export const config = { path: "/api/login" };
