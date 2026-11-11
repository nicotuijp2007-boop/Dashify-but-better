// Small JSON response helpers for the functions.

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function error(status, code, extra = {}, headers = {}) {
  return json(status, { error: code, ...extra }, headers);
}

/** Rejects cross-site requests: the Origin (when sent) must match the request's host. */
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
