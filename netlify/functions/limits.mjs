// GET /api/limits: fetches {DASHBOARD_URL}/api/widget server-side with WIDGET_TOKEN and
// returns the body unchanged. The browser never sees the token.

import { isAllowedUpstream, readConfig } from "../lib/config.mjs";
import { error, json } from "../lib/http.mjs";
import { hasValidSession } from "../lib/session.mjs";

export const UPSTREAM_TIMEOUT_MS = 10_000;

export async function handleLimits(request, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  if (request.method !== "GET") return error(405, "method_not_allowed", {}, { Allow: "GET" });

  const config = readConfig(env);
  if (config.missing.length) return error(503, "not_configured", { missing: config.missing });
  if (!hasValidSession(config, request, now)) return error(401, "login_required");
  if (!isAllowedUpstream(config.dashboardUrl)) return error(503, "not_configured", { missing: ["DASHBOARD_URL"] });

  let upstream;
  try {
    upstream = await fetchImpl(`${config.dashboardUrl}/api/widget`, {
      headers: { Authorization: `Bearer ${config.widgetToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: "error",
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return error(timedOut ? 504 : 502, timedOut ? "upstream_timeout" : "upstream_unreachable");
  }

  // A Basic-auth challenge comes from the dashboard's login proxy, not from /api/widget:
  // the endpoint is not live yet (or not excluded from the proxy).
  if (upstream.status === 401 && /^basic/i.test(upstream.headers.get("www-authenticate") ?? "")) {
    return error(502, "upstream_not_found");
  }
  if (upstream.status === 401 || upstream.status === 403) return error(502, "upstream_unauthorized");
  if (upstream.status === 404) return error(502, "upstream_not_found");
  if (upstream.status === 503) return error(502, "upstream_not_configured");
  if (upstream.status !== 200) return error(502, "upstream_status", { status: upstream.status });

  let body;
  try {
    body = await upstream.json();
  } catch {
    return error(502, "upstream_invalid");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return error(502, "upstream_invalid");
  return json(200, body);
}

export default (request) => handleLimits(request);

export const config = { path: "/api/limits" };
