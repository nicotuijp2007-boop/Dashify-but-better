// POST /api/logout: removes the session cookie from this browser.

import { error, isSameOrigin, json } from "../lib/http.mjs";
import { clearedSessionCookie } from "../lib/session.mjs";

export async function handleLogout(request) {
  if (request.method !== "POST") return error(405, "method_not_allowed", {}, { Allow: "POST" });
  if (!isSameOrigin(request)) return error(403, "forbidden");
  return json(200, { loggedIn: false }, { "Set-Cookie": clearedSessionCookie() });
}

export default (request) => handleLogout(request);

export const config = { path: "/api/logout" };
