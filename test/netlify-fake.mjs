// A fake fetch for the Netlify API and status page, backed by test/fixtures/netlify.
// Used by the tests and by the dev server.
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/netlify/${name}.json`, import.meta.url), "utf8"));

export function fakeNetlifyFetch({ token = "fake-netlify-token", calls = [] } = {}) {
  const accounts = read("accounts");
  const sites = read("sites");
  const deploys = read("deploys");
  const details = read("deploy-details");
  const status = read("status");
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = new URL(url);
    if (u.host === "www.netlifystatus.com") return json(status);
    if (u.host !== "api.netlify.com") throw new TypeError("fetch failed");
    if (init.headers?.Authorization !== `Bearer ${token}`) return json({ code: 401, message: "Access Denied" }, 401);
    const path = u.pathname.replace("/api/v1", "");
    if (path === "/accounts") return json(accounts);
    if (path === "/sites") return json(sites);
    let m = /^\/sites\/([^/]+)\/deploys$/.exec(path);
    if (m) {
      const list = deploys[m[1]];
      return list ? json(list.slice(0, Number(u.searchParams.get("per_page") ?? 100))) : json({ code: 404 }, 404);
    }
    m = /^\/sites\/([^/]+)$/.exec(path);
    if (m) {
      const site = sites.find((s) => s.id === m[1]);
      return site ? json(site) : json({ code: 404 }, 404);
    }
    m = /^\/deploys\/([^/]+)$/.exec(path);
    if (m) return details[m[1]] ? json(details[m[1]]) : json({ code: 404 }, 404);
    return json({ code: 404 }, 404);
  };
}
