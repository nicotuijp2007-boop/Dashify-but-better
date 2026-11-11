import assert from "node:assert/strict";
import { test } from "node:test";
import { handleNetlifyAction } from "../netlify/functions/netlify-action.mjs";
import { readConfig } from "../netlify/lib/config.mjs";
import { COOKIE_NAME, createSessionValue } from "../netlify/lib/session.mjs";
import { fakeNetlifyFetch } from "./netlify-fake.mjs";

const env = { SITE_PASSWORD: "pw", WIDGET_TOKEN: "wt", NETLIFY_TOKEN: "fake-netlify-token" };
const cookie = `${COOKIE_NAME}=${createSessionValue(readConfig(env))}`;
const base = "https://limieten.example.com";
const DASH = "400c3de6-bdbf-4cd3-8a07-9a9242f9f874";
const LIFT = "9ebc9459-e904-4899-be57-f7959a12f4e2";
const PUBLISHED = "6af489e879d43befe5e13c82";
const PREVIOUS = "6af3bbbb5555666677778888";
const FAILED = "6af44f757a95d347949b9288";
const BUILDING = "6af4aaaa1111222233334444";

function action(body, headers = {}) {
  return new Request(`${base}/api/netlify/action`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: base, ...headers },
    body: JSON.stringify(body),
  });
}

async function run(body, headers) {
  const calls = [];
  const res = await handleNetlifyAction(action(body, headers), { env, fetchImpl: fakeNetlifyFetch({ calls }) });
  return { res, body: await res.json(), posts: calls.filter((c) => c.init.method === "POST").map((c) => new URL(c.url).pathname) };
}

test("rebuild starts a build of the linked repo", async () => {
  const { res, body, posts } = await run({ action: "rebuild", siteId: DASH });
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, action: "rebuild", deployId: "6af4cccc9999000011112222" });
  assert.deepEqual(posts, [`/api/v1/sites/${DASH}/builds`]);
});

test("restore publishes an earlier ready deploy of the same site", async () => {
  const { res, posts } = await run({ action: "restore", siteId: DASH, deployId: PREVIOUS });
  assert.equal(res.status, 200);
  assert.deepEqual(posts, [`/api/v1/sites/${DASH}/deploys/${PREVIOUS}/restore`]);
});

test("restore refuses failed deploys and deploys of another site", async () => {
  let r = await run({ action: "restore", siteId: DASH, deployId: FAILED });
  assert.equal(r.res.status, 409);
  assert.equal(r.body.error, "netlify_not_ready");
  assert.deepEqual(r.posts, []);
  r = await run({ action: "restore", siteId: LIFT, deployId: PUBLISHED });
  assert.equal(r.res.status, 404);
  assert.deepEqual(r.posts, []);
});

test("lock and unlock auto-publishing", async () => {
  let r = await run({ action: "lock", siteId: DASH, deployId: PUBLISHED });
  assert.deepEqual(r.body, { ok: true, action: "lock", deployId: PUBLISHED, locked: true });
  assert.deepEqual(r.posts, [`/api/v1/deploys/${PUBLISHED}/lock`]);
  r = await run({ action: "unlock", siteId: DASH, deployId: PUBLISHED });
  assert.equal(r.body.locked, false);
  assert.deepEqual(r.posts, [`/api/v1/deploys/${PUBLISHED}/unlock`]);
});

test("cancel only running deploys", async () => {
  let r = await run({ action: "cancel", siteId: DASH, deployId: BUILDING });
  assert.equal(r.res.status, 200);
  assert.deepEqual(r.posts, [`/api/v1/deploys/${BUILDING}/cancel`]);
  r = await run({ action: "cancel", siteId: DASH, deployId: PUBLISHED });
  assert.equal(r.res.status, 409);
  assert.equal(r.body.error, "netlify_not_running");
  assert.deepEqual(r.posts, []);
});

test("guards: session, same origin, JSON, method, unknown actions, bad ids", async () => {
  const fetchImpl = fakeNetlifyFetch();
  let res = await handleNetlifyAction(action({ action: "rebuild", siteId: DASH }, { cookie: "" }), { env, fetchImpl });
  assert.equal(res.status, 401);
  res = await handleNetlifyAction(action({ action: "rebuild", siteId: DASH }, { origin: "https://evil.example" }), { env, fetchImpl });
  assert.equal(res.status, 403);
  res = await handleNetlifyAction(action({ action: "rebuild", siteId: DASH }, { "content-type": "text/plain" }), { env, fetchImpl });
  assert.equal(res.status, 403);
  res = await handleNetlifyAction(new Request(`${base}/api/netlify/action`, { headers: { cookie } }), { env, fetchImpl });
  assert.equal(res.status, 405);
  for (const body of [
    { action: "delete", siteId: DASH },
    { action: "restore", siteId: DASH },
    { action: "rebuild", siteId: "../accounts" },
    { action: "cancel", siteId: DASH, deployId: "x/y" },
  ]) {
    const r = await run(body);
    assert.equal(r.res.status, 400, JSON.stringify(body));
    assert.deepEqual(r.posts, []);
  }
});
