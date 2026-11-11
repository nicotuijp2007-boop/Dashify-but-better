// Read-only access to the Netlify API for the Netlify part of the app.
// Only a fixed set of GET endpoints is called, and responses are reduced to a fixed set of
// fields before they reach the browser (no env vars, build settings or tokens).

export const NETLIFY_API = "https://api.netlify.com/api/v1";
export const STATUS_URL = "https://www.netlifystatus.com/api/v2/status.json";
export const TIMEOUT_MS = 10_000;
/** Where Netlify hosts site screenshots; the only image host the CSP allows besides 'self'. */
export const SCREENSHOT_ORIGIN = "https://d33wubrfki0l68.cloudfront.net";

const ID = /^[A-Za-z0-9-]{8,64}$/;

/** Deploy states that can still be cancelled. */
export const BUSY_STATES = new Set(["new", "enqueued", "building", "uploading", "uploaded", "preparing", "prepared", "processing", "processed", "retrying", "pending_review", "accepted"]);

export function isValidId(id) {
  return typeof id === "string" && ID.test(id);
}

export class NetlifyError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function str(v) {
  return typeof v === "string" && v.length ? v : null;
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function https(v) {
  const s = str(v);
  return s && s.startsWith("https://") ? s : null;
}

/** "[Visit your Functions](/projects/x/logs) for more" -> "Visit your Functions for more". */
export function stripMarkdownLinks(text) {
  return typeof text === "string" ? text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim() : null;
}

export function mapDeploy(d) {
  if (!d || typeof d !== "object" || !str(d.id)) return null;
  const commitRef = str(d.commit_ref);
  const messages = Array.isArray(d.summary?.messages) ? d.summary.messages : null;
  return {
    id: d.id,
    siteId: str(d.site_id),
    siteName: str(d.name),
    state: str(d.state) ?? "unknown",
    context: str(d.context),
    branch: str(d.branch),
    commitRef,
    commitShort: commitRef ? commitRef.slice(0, 7) : null,
    commitUrl: https(d.commit_url),
    title: str(d.title) ?? str(d.commit_message),
    committer: str(d.committer),
    createdAt: str(d.created_at),
    publishedAt: str(d.published_at),
    deployTime: num(d.deploy_time),
    framework: str(d.framework),
    permalink: https(d.links?.permalink),
    deployUrl: https(d.deploy_ssl_url),
    manual: d.manual_deploy === true,
    locked: d.locked === true,
    errorMessage: str(d.error_message),
    summary: messages
      ? messages
          .filter((m) => m && typeof m === "object")
          .map((m) => ({
            type: str(m.type) ?? "info",
            title: stripMarkdownLinks(m.title) ?? "",
            description: stripMarkdownLinks(m.description),
          }))
      : null,
  };
}

export function mapSite(s, lastDeploy = null) {
  if (!s || typeof s !== "object" || !str(s.id)) return null;
  const build = s.build_settings ?? {};
  const screenshot = https(s.screenshot_url);
  return {
    id: s.id,
    name: str(s.name) ?? s.id,
    url: https(s.ssl_url) ?? str(s.url),
    adminUrl: https(s.admin_url),
    screenshotUrl: screenshot && screenshot.startsWith(`${SCREENSHOT_ORIGIN}/`) ? screenshot : null,
    repo: str(build.repo_path),
    repoUrl: https(build.repo_url),
    repoBranch: str(build.repo_branch),
    hasRepo: Boolean(str(build.repo_url)),
    updatedAt: str(s.updated_at),
    published: mapDeploy(s.published_deploy),
    lastDeploy: mapDeploy(lastDeploy),
  };
}

export function mapAccount(a) {
  if (!a || typeof a !== "object") return null;
  return { name: str(a.name) ?? str(a.slug), slug: str(a.slug), plan: str(a.type_name) };
}

/** Statuspage.io status: { indicator: none|minor|major|critical|maintenance, description }. */
export function mapStatus(body) {
  const indicator = str(body?.status?.indicator);
  if (!indicator) return null;
  return { indicator, description: str(body.status.description) };
}

function newest(deploys) {
  return deploys
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0))[0] ?? null;
}

/** Small API client. `fetchImpl` is injectable for tests. */
export function createClient(token, fetchImpl = fetch) {
  async function request(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${NETLIFY_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new NetlifyError(timedOut ? "netlify_timeout" : "netlify_unreachable");
    }
    if (res.status === 401 || res.status === 403) throw new NetlifyError("netlify_unauthorized", res.status);
    if (res.status === 404) throw new NetlifyError("netlify_not_found", 404);
    if (!res.ok) throw new NetlifyError("netlify_status", res.status);
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new NetlifyError("netlify_invalid");
    }
  }

  const get = (path) => request("GET", path);
  const post = (path, body) => request("POST", path, body);

  /** Fetches a deploy and checks that it belongs to the given site. */
  async function deployOf(siteId, deployId) {
    const deploy = await get(`/deploys/${encodeURIComponent(deployId)}`);
    if (!deploy || deploy.site_id !== siteId) throw new NetlifyError("netlify_not_found", 404);
    return deploy;
  }

  async function status() {
    try {
      const res = await fetchImpl(STATUS_URL, { signal: AbortSignal.timeout(5_000) });
      return res.ok ? mapStatus(await res.json()) : null;
    } catch {
      return null;
    }
  }

  return {
    /** Account, Netlify status, all sites with their latest deploy, and the newest deploy overall. */
    async overview() {
      const [accounts, sites, netlifyStatus] = await Promise.all([get("/accounts"), get("/sites?filter=all&per_page=100"), status()]);
      const list = Array.isArray(sites) ? sites.slice(0, 30) : [];
      const latest = await Promise.all(
        list.map((s) =>
          get(`/sites/${encodeURIComponent(s.id)}/deploys?per_page=1`)
            .then((d) => (Array.isArray(d) ? d[0] : null))
            .catch(() => null),
        ),
      );
      const mapped = list.map((s, i) => mapSite(s, latest[i])).filter(Boolean);
      mapped.sort((a, b) => Date.parse(b.lastDeploy?.createdAt ?? b.updatedAt ?? 0) - Date.parse(a.lastDeploy?.createdAt ?? a.updatedAt ?? 0));
      return {
        account: mapAccount(Array.isArray(accounts) ? accounts[0] : null),
        status: netlifyStatus,
        latestDeploy: newest(mapped.map((s) => s.lastDeploy && { ...s.lastDeploy, siteName: s.name, siteId: s.id })),
        sites: mapped,
      };
    },

    /** One site: details, the published deploy with its summary, and recent deploys. */
    async site(id) {
      const [site, deploys] = await Promise.all([
        get(`/sites/${encodeURIComponent(id)}`),
        get(`/sites/${encodeURIComponent(id)}/deploys?per_page=10`),
      ]);
      const list = (Array.isArray(deploys) ? deploys : []).map(mapDeploy).filter(Boolean);
      const publishedId = site?.published_deploy?.id;
      let published = mapDeploy(site?.published_deploy);
      if (publishedId) {
        published = mapDeploy(await get(`/deploys/${encodeURIComponent(publishedId)}`).catch(() => site.published_deploy));
      }
      return { site: mapSite(site, list[0] ? deploys[0] : null), published, deploys: list };
    },

    /** Actions. Each one checks that the deploy belongs to the site before changing anything. */
    async rebuild(siteId) {
      const site = await get(`/sites/${encodeURIComponent(siteId)}`);
      if (!site?.build_settings?.repo_url) throw new NetlifyError("netlify_no_repo");
      const build = await post(`/sites/${encodeURIComponent(siteId)}/builds`, {});
      return { deployId: str(build?.deploy_id) };
    },

    async restore(siteId, deployId) {
      const deploy = await deployOf(siteId, deployId);
      if (deploy.state !== "ready") throw new NetlifyError("netlify_not_ready");
      await post(`/sites/${encodeURIComponent(siteId)}/deploys/${encodeURIComponent(deployId)}/restore`);
      return { deployId };
    },

    async lock(siteId, deployId, locked) {
      await deployOf(siteId, deployId);
      await post(`/deploys/${encodeURIComponent(deployId)}/${locked ? "lock" : "unlock"}`);
      return { deployId, locked };
    },

    async cancel(siteId, deployId) {
      const deploy = await deployOf(siteId, deployId);
      if (!BUSY_STATES.has(deploy.state)) throw new NetlifyError("netlify_not_running");
      await post(`/deploys/${encodeURIComponent(deployId)}/cancel`);
      return { deployId };
    },
  };
}
