// GET /api/netlify?view=overview | ?view=site&id=<site id>
// Read-only Netlify data for the logged-in user. Uses NETLIFY_TOKEN server-side.

import { readConfig } from "../lib/config.mjs";
import { error, json } from "../lib/http.mjs";
import { createClient, isValidId, NetlifyError } from "../lib/netlify-api.mjs";
import { hasValidSession } from "../lib/session.mjs";

export async function handleNetlify(request, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  if (request.method !== "GET") return error(405, "method_not_allowed", {}, { Allow: "GET" });

  const config = readConfig(env);
  if (config.missing.length) return error(503, "not_configured", { missing: config.missing });
  if (!hasValidSession(config, request, now)) return error(401, "login_required");
  const token = env.NETLIFY_TOKEN;
  if (!token) return error(503, "netlify_not_configured", { missing: ["NETLIFY_TOKEN"] });

  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "overview";
  const client = createClient(token, fetchImpl);
  try {
    if (view === "overview") return json(200, await client.overview());
    if (view === "site") {
      const id = params.get("id");
      if (!isValidId(id)) return error(400, "bad_request");
      return json(200, await client.site(id));
    }
    return error(400, "bad_request");
  } catch (err) {
    if (err instanceof NetlifyError) {
      return error(err.code === "netlify_not_found" ? 404 : 502, err.code, err.status ? { status: err.status } : {});
    }
    return error(500, "server");
  }
}

export default (request) => handleNetlify(request);

export const config = { path: "/api/netlify" };
