import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedUpstream, readConfig } from "../netlify/lib/config.mjs";
import { COOKIE_NAME, createSessionValue, isValidSessionValue } from "../netlify/lib/session.mjs";
import { handleLimits } from "../netlify/functions/limits.mjs";
import { handleLogin } from "../netlify/functions/login.mjs";
import { handleLogout } from "../netlify/functions/logout.mjs";
import { fixture } from "./helpers.mjs";

const env = {
  SITE_PASSWORD: "correct horse battery staple",
  WIDGET_TOKEN: "server-side-widget-token",
  DASHBOARD_URL: "https://dash.example.com/",
};
const config = readConfig(env);
const base = "https://limieten.example.com";

function cookieFor(c = config) {
  return `${COOKIE_NAME}=${createSessionValue(c)}`;
}

function limitsRequest(cookie = cookieFor()) {
  return new Request(`${base}/api/limits`, { headers: cookie ? { cookie } : {} });
}

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
}

test("config", () => {
  assert.equal(config.dashboardUrl, "https://dash.example.com");
  assert.deepEqual(readConfig({}).missing, ["SITE_PASSWORD", "WIDGET_TOKEN"]);
  assert.equal(readConfig({}).dashboardUrl, "https://usage-dashboard-e00568.netlify.app");
  assert.equal(isAllowedUpstream("https://x.netlify.app"), true);
  assert.equal(isAllowedUpstream("http://localhost:8888/x"), true);
  assert.equal(isAllowedUpstream("http://x.netlify.app"), false);
});

test("session values: valid, expired, tampered, other secrets", () => {
  const now = Date.now();
  const value = createSessionValue(config, now);
  assert.equal(isValidSessionValue(config, value, now), true);
  assert.equal(isValidSessionValue(config, value, now + 181 * 86_400_000), false);
  const [exp, sig] = value.split(".");
  assert.equal(isValidSessionValue(config, `${Number(exp) + 1}.${sig}`, now), false);
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert.equal(isValidSessionValue(config, `${exp}.${flipped}`, now), false);
  assert.equal(isValidSessionValue(readConfig({ ...env, SITE_PASSWORD: "new" }), value, now), false);
  assert.equal(isValidSessionValue(readConfig({ ...env, WIDGET_TOKEN: "rotated" }), value, now), false);
  assert.equal(isValidSessionValue(config, "garbage", now), false);
  assert.equal(isValidSessionValue(config, null, now), false);
});

test("limits: proxies the body and sends the token only upstream", async () => {
  const calls = [];
  const res = await handleLimits(limitsRequest(), { env, fetchImpl: fakeFetch(200, fixture("full"), calls) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), fixture("full"));
  assert.equal(text.includes(env.WIDGET_TOKEN), false);
  assert.equal(calls[0].url, "https://dash.example.com/api/widget");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${env.WIDGET_TOKEN}`);
});

test("limits: needs a session", async () => {
  const calls = [];
  for (const cookie of [null, `${COOKIE_NAME}=nope`, `other=1`]) {
    const res = await handleLimits(limitsRequest(cookie), { env, fetchImpl: fakeFetch(200, {}, calls) });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "login_required" });
  }
  assert.equal(calls.length, 0, "no upstream call without a session");
});

test("limits: not configured", async () => {
  const res = await handleLimits(limitsRequest(), { env: { SITE_PASSWORD: "x" } });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "not_configured", missing: ["WIDGET_TOKEN"] });
});

test("limits: upstream errors are mapped", async () => {
  const cases = [
    [401, {}, 502, { error: "upstream_unauthorized" }],
    [404, "nope", 502, { error: "upstream_not_found" }],
    [503, {}, 502, { error: "upstream_not_configured" }],
    [500, {}, 502, { error: "upstream_status", status: 500 }],
    [200, "<html>", 502, { error: "upstream_invalid" }],
    [200, [], 502, { error: "upstream_invalid" }],
  ];
  for (const [upstreamStatus, body, status, expected] of cases) {
    const res = await handleLimits(limitsRequest(), { env, fetchImpl: fakeFetch(upstreamStatus, body) });
    assert.equal(res.status, status, `upstream ${upstreamStatus}`);
    assert.deepEqual(await res.json(), expected);
  }
});

test("limits: network failures", async () => {
  const timeout = async () => {
    throw Object.assign(new Error("t"), { name: "TimeoutError" });
  };
  const down = async () => {
    throw new TypeError("fetch failed");
  };
  let res = await handleLimits(limitsRequest(), { env, fetchImpl: timeout });
  assert.equal(res.status, 504);
  assert.deepEqual(await res.json(), { error: "upstream_timeout" });
  res = await handleLimits(limitsRequest(), { env, fetchImpl: down });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: "upstream_unreachable" });
});

test("limits: refuses a non-https upstream and other methods", async () => {
  let res = await handleLimits(limitsRequest(), { env: { ...env, DASHBOARD_URL: "http://dash.example.com" } });
  assert.equal(res.status, 503);
  res = await handleLimits(new Request(`${base}/api/limits`, { method: "POST" }), { env });
  assert.equal(res.status, 405);
});

function loginRequest(password, headers = {}) {
  return new Request(`${base}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, ...headers },
    body: JSON.stringify({ password }),
  });
}

test("login: right password sets a secure session cookie", async () => {
  const res = await handleLogin(loginRequest(env.SITE_PASSWORD), { env, delay: 0 });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /^limieten_session=\d+\.[\w-]+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Strict$/);
  const value = cookie.split(";")[0].split("=")[1];
  assert.equal(isValidSessionValue(config, value), true);

  const check = await handleLogin(new Request(`${base}/api/login`, { headers: { cookie: cookie.split(";")[0] } }), { env });
  assert.deepEqual(await check.json(), { loggedIn: true });
});

test("login: wrong password, wrong content type, cross-site", async () => {
  let res = await handleLogin(loginRequest("wrong"), { env, delay: 0 });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.deepEqual(await res.json(), { error: "login_failed" });

  res = await handleLogin(loginRequest(""), { env, delay: 0 });
  assert.equal(res.status, 401);

  res = await handleLogin(loginRequest(env.SITE_PASSWORD, { "content-type": "application/x-www-form-urlencoded" }), { env, delay: 0 });
  assert.equal(res.status, 403);

  res = await handleLogin(loginRequest(env.SITE_PASSWORD, { origin: "https://evil.example" }), { env, delay: 0 });
  assert.equal(res.status, 403);

  const check = await handleLogin(new Request(`${base}/api/login`), { env });
  assert.deepEqual(await check.json(), { loggedIn: false });
});

test("logout clears the cookie", async () => {
  const res = await handleLogout(new Request(`${base}/api/logout`, { method: "POST", headers: { origin: base } }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie"), /^limieten_session=; Path=\/; Max-Age=0;/);
  const cross = await handleLogout(new Request(`${base}/api/logout`, { method: "POST", headers: { origin: "https://evil.example" } }));
  assert.equal(cross.status, 403);
});
