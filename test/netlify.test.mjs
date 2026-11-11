import assert from "node:assert/strict";
import { test } from "node:test";
import { handleNetlify } from "../netlify/functions/netlify.mjs";
import { isValidId, mapDeploy, mapSite, mapStatus, stripMarkdownLinks } from "../netlify/lib/netlify-api.mjs";
import { readConfig } from "../netlify/lib/config.mjs";
import { COOKIE_NAME, createSessionValue } from "../netlify/lib/session.mjs";
import { contextLabel, deployState, deployTitle, formatSeconds, frameworkLabel, hostOf, netlifyStatus } from "../public/lib/netlify.js";
import { parseRoute, siteHref } from "../public/lib/router.js";
import { fakeNetlifyFetch } from "./netlify-fake.mjs";

const env = { SITE_PASSWORD: "pw", WIDGET_TOKEN: "wt", NETLIFY_TOKEN: "fake-netlify-token" };
const cookie = `${COOKIE_NAME}=${createSessionValue(readConfig(env))}`;
const base = "https://limieten.example.com";
const DASH = "400c3de6-bdbf-4cd3-8a07-9a9242f9f874";

function req(query, withCookie = true) {
  return new Request(`${base}/api/netlify${query}`, { headers: withCookie ? { cookie } : {} });
}

test("overview: account, status, latest deploy, sites sorted by latest deploy", async () => {
  const calls = [];
  const res = await handleNetlify(req("?view=overview"), { env, fetchImpl: fakeNetlifyFetch({ calls }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const text = await res.text();
  const body = JSON.parse(text);
  assert.deepEqual(body.account, { name: "personal", slug: "nicotuijp2007-boop", plan: "Free" });
  assert.deepEqual(body.status, { indicator: "none", description: "All Systems Operational" });
  assert.deepEqual(body.sites.map((s) => s.name), ["usage-dashboard-e00568", "stalwart-sprite-de8731"]);
  assert.equal(body.latestDeploy.siteName, "usage-dashboard-e00568");
  assert.equal(body.latestDeploy.commitShort, "9ae7482");
  assert.equal(body.latestDeploy.deployTime, 27);
  const site = body.sites[0];
  assert.equal(site.url, "https://usage-dashboard-e00568.netlify.app");
  assert.equal(site.repo, "nicotuijp2007-boop/overvieuw-");
  assert.match(site.screenshotUrl, /^https:\/\/d33wubrfki0l68\.cloudfront\.net\//);
  // Nothing beyond the mapped fields leaves the server.
  for (const secret of ["secret-value", "never-sent", "fake-netlify-token", "SHOULD_NOT_LEAK"]) {
    assert.equal(text.includes(secret), false, secret);
  }
  // Only GET requests, token only to api.netlify.com.
  for (const call of calls) {
    assert.equal(call.init.method ?? "GET", "GET");
    if (!call.url.startsWith("https://api.netlify.com/")) assert.equal(call.init.headers?.Authorization, undefined);
  }
});

test("site view: published deploy with summary, recent deploys", async () => {
  const res = await handleNetlify(req(`?view=site&id=${DASH}`), { env, fetchImpl: fakeNetlifyFetch() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.site.name, "usage-dashboard-e00568");
  assert.equal(body.published.id, "6af489e879d43befe5e13c82");
  assert.equal(body.published.framework, "next");
  assert.equal(body.published.summary.length, 5);
  assert.equal(body.published.summary[3].description, "We have deployed 1 function. Visit your Functions for more information.");
  assert.deepEqual(body.deploys.map((d) => d.state), ["ready", "error", "ready"]);
  assert.equal(body.site.hasRepo, true);
  assert.equal(body.published.locked, false);
  assert.equal(body.deploys[1].errorMessage, "Build script returned non-zero exit code: 2");
});

test("netlify function: auth, config, validation, errors", async () => {
  let res = await handleNetlify(req("?view=overview", false), { env, fetchImpl: fakeNetlifyFetch() });
  assert.equal(res.status, 401);
  res = await handleNetlify(req("?view=overview"), { env: { ...env, NETLIFY_TOKEN: "" }, fetchImpl: fakeNetlifyFetch() });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "netlify_not_configured", missing: ["NETLIFY_TOKEN"] });
  res = await handleNetlify(req("?view=site&id=../../accounts"), { env, fetchImpl: fakeNetlifyFetch() });
  assert.equal(res.status, 400);
  res = await handleNetlify(req("?view=delete"), { env, fetchImpl: fakeNetlifyFetch() });
  assert.equal(res.status, 400);
  res = await handleNetlify(req("?view=site&id=00000000-0000-0000-0000-000000000000"), { env, fetchImpl: fakeNetlifyFetch() });
  assert.equal(res.status, 404);
  res = await handleNetlify(req("?view=overview"), { env: { ...env, NETLIFY_TOKEN: "wrong" }, fetchImpl: fakeNetlifyFetch() });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: "netlify_unauthorized", status: 401 });
  res = await handleNetlify(new Request(`${base}/api/netlify`, { method: "POST", headers: { cookie } }), { env });
  assert.equal(res.status, 405);
});

test("status page failure does not break the overview", async () => {
  const inner = fakeNetlifyFetch();
  const fetchImpl = (url, init) => (String(url).includes("netlifystatus") ? Promise.reject(new TypeError("down")) : inner(url, init));
  const res = await handleNetlify(req("?view=overview"), { env, fetchImpl });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, null);
});

test("mapping helpers", () => {
  assert.equal(stripMarkdownLinks("See [logs](/x/y) now"), "See logs now");
  assert.equal(isValidId(DASH), true);
  assert.equal(isValidId("6af489e879d43befe5e13c82"), true);
  assert.equal(isValidId("a/b"), false);
  assert.equal(isValidId(null), false);
  assert.equal(mapDeploy(null), null);
  assert.equal(mapDeploy({ id: "x", title: null, commit_message: "msg" }).title, "msg");
  assert.equal(mapSite({ id: "s", screenshot_url: "https://evil.example/x.png" }).screenshotUrl, null);
  assert.equal(mapSite({ id: "s", ssl_url: "javascript:alert(1)", url: "https://ok.example" }).url, "https://ok.example");
  assert.equal(mapStatus({}), null);
});

test("client presentation", () => {
  assert.deepEqual(deployState({ state: "ready" }, { published: true }), { label: "Gepubliceerd", kind: "ok" });
  assert.deepEqual(deployState({ state: "ready" }), { label: "Klaar", kind: "ok" });
  assert.deepEqual(deployState({ state: "error" }), { label: "Mislukt", kind: "danger" });
  assert.deepEqual(deployState({ state: "building" }), { label: "Bouwen", kind: "busy" });
  assert.deepEqual(deployState({ state: "enqueued" }), { label: "In de wachtrij", kind: "busy" });
  assert.deepEqual(deployState({ state: "skipped" }), { label: "Overgeslagen", kind: "neutral" });
  assert.equal(contextLabel("production"), "Productie");
  assert.equal(contextLabel("deploy-preview"), "Deploy preview");
  assert.equal(frameworkLabel("next"), "Next.js");
  assert.equal(formatSeconds(27), "27s");
  assert.equal(formatSeconds(65), "1m 5s");
  assert.equal(formatSeconds(3720), "1u 2m");
  assert.equal(formatSeconds(null), null);
  assert.deepEqual(netlifyStatus({ indicator: "none" }), { label: "Alle systemen werken", level: "ok" });
  assert.equal(netlifyStatus({ indicator: "major" }).level, "danger");
  assert.equal(netlifyStatus(null), null);
  assert.equal(hostOf("https://a.netlify.app/x"), "a.netlify.app");
  assert.equal(deployTitle({ title: "T" }), "T");
  assert.equal(deployTitle({ manual: true }), "Handmatige deploy");
  assert.equal(deployTitle({ commitShort: "abc1234" }), "Commit abc1234");
  assert.deepEqual(parseRoute(siteHref(DASH)), { name: "site", id: DASH });
});
