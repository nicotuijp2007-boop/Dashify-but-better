// Local development server: serves public/, runs the Netlify Functions, and (unless
// DASHBOARD_URL is set) fakes the dashboard's /api/widget with a test fixture.
//
//   npm run dev                         -> http://localhost:8888, password "dev" (Netlify API faked too)
//   FIXTURE=edge-zero-hundred npm run dev
//   DASHBOARD_URL=https://... WIDGET_TOKEN=... SITE_PASSWORD=... npm run dev  (real dashboard)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleLimits } from "../netlify/functions/limits.mjs";
import { handleLogin } from "../netlify/functions/login.mjs";
import { handleLogout } from "../netlify/functions/logout.mjs";
import { handleNetlify } from "../netlify/functions/netlify.mjs";
import { fakeNetlifyFetch } from "../test/netlify-fake.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT ?? 8888);
const fixture = process.env.FIXTURE ?? "full";
const fakeToken = "dev-widget-token";

const env = {
  ...process.env,
  SITE_PASSWORD: process.env.SITE_PASSWORD ?? "dev",
  WIDGET_TOKEN: process.env.WIDGET_TOKEN ?? fakeToken,
  DASHBOARD_URL: process.env.DASHBOARD_URL ?? `http://localhost:${port}/__fake-dashboard`,
  NETLIFY_TOKEN: process.env.NETLIFY_TOKEN ?? "fake-netlify-token",
};
// Without a real NETLIFY_TOKEN, the Netlify API is faked with test/fixtures/netlify.
const netlifyFetch = process.env.NETLIFY_TOKEN ? fetch : fakeNetlifyFetch();
const usesFake = !process.env.DASHBOARD_URL;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

function toRequest(req, body) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  return new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
  });
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function fakeDashboard(req, res) {
  if (req.headers.authorization !== `Bearer ${fakeToken}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  if (fixture.startsWith("status-")) {
    res.writeHead(Number(fixture.slice(7)), { "Content-Type": "application/json" });
    return res.end("{}");
  }
  const body = await readFile(join(root, "test/fixtures", `${fixture}.json`));
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

const routes = {
  "/api/limits": handleLimits,
  "/api/login": handleLogin,
  "/api/logout": handleLogout,
  "/api/netlify": (request, options) => handleNetlify(request, { ...options, fetchImpl: netlifyFetch }),
};

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (usesFake && path === "/__fake-dashboard/api/widget") return await fakeDashboard(req, res);

    const handler = routes[path];
    if (handler) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = toRequest(req, Buffer.concat(chunks));
      return await send(res, await handler(request, { env, delay: 300 }));
    }

    const file = normalize(join(root, "public", path === "/" ? "index.html" : path));
    if (!file.startsWith(join(root, "public"))) {
      res.writeHead(403);
      return res.end();
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch (err) {
    res.writeHead(err?.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain" });
    res.end(err?.code === "ENOENT" ? "Not found" : "Server error");
  }
}).listen(port, () => {
  console.log(`Limieten dev server: http://localhost:${port}`);
  console.log(usesFake ? `Fake dashboard with fixture "${fixture}". Password: ${env.SITE_PASSWORD}` : `Dashboard: ${env.DASHBOARD_URL}`);
});
