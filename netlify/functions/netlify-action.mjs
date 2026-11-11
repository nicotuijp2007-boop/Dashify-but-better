// POST /api/netlify/action with JSON { action, siteId, deployId? }
// Actions: rebuild | restore | lock | unlock | cancel. Logged-in, same-origin, JSON only.

import { readConfig } from "../lib/config.mjs";
import { error, isSameOrigin, json } from "../lib/http.mjs";
import { createClient, isValidId, NetlifyError } from "../lib/netlify-api.mjs";
import { hasValidSession } from "../lib/session.mjs";

const NEEDS_DEPLOY = new Set(["restore", "lock", "unlock", "cancel"]);

export async function handleNetlifyAction(request, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  if (request.method !== "POST") return error(405, "method_not_allowed", {}, { Allow: "POST" });

  const config = readConfig(env);
  if (config.missing.length) return error(503, "not_configured", { missing: config.missing });
  if (!hasValidSession(config, request, now)) return error(401, "login_required");
  // JSON-only plus a same-origin check: a cross-site form or link cannot trigger an action.
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json") || !isSameOrigin(request)) return error(403, "forbidden");
  const token = env.NETLIFY_TOKEN;
  if (!token) return error(503, "netlify_not_configured", { missing: ["NETLIFY_TOKEN"] });

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "bad_request");
  }
  const { action, siteId, deployId } = body ?? {};
  if (!isValidId(siteId)) return error(400, "bad_request");
  if (NEEDS_DEPLOY.has(action) && !isValidId(deployId)) return error(400, "bad_request");

  const client = createClient(token, fetchImpl);
  try {
    let result;
    if (action === "rebuild") result = await client.rebuild(siteId);
    else if (action === "restore") result = await client.restore(siteId, deployId);
    else if (action === "lock") result = await client.lock(siteId, deployId, true);
    else if (action === "unlock") result = await client.lock(siteId, deployId, false);
    else if (action === "cancel") result = await client.cancel(siteId, deployId);
    else return error(400, "bad_request");
    return json(200, { ok: true, action, ...result });
  } catch (err) {
    if (err instanceof NetlifyError) {
      const status = err.code === "netlify_not_found" ? 404 : ["netlify_no_repo", "netlify_not_ready", "netlify_not_running"].includes(err.code) ? 409 : 502;
      return error(status, err.code, err.status ? { status: err.status } : {});
    }
    return error(500, "server");
  }
}

export default (request) => handleNetlifyAction(request);

export const config = { path: "/api/netlify/action" };
