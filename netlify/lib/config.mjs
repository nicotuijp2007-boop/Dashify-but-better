// Server configuration from Netlify environment variables. Never sent to the browser.

export const DEFAULT_DASHBOARD_URL = "https://usage-dashboard-e00568.netlify.app";

/** Reads the config; `missing` lists required variables that are not set. */
export function readConfig(env = process.env) {
  const sitePassword = env.SITE_PASSWORD ?? "";
  const widgetToken = env.WIDGET_TOKEN ?? "";
  const dashboardUrl = (env.DASHBOARD_URL || DEFAULT_DASHBOARD_URL).replace(/\/+$/, "");
  const missing = [];
  if (!sitePassword) missing.push("SITE_PASSWORD");
  if (!widgetToken) missing.push("WIDGET_TOKEN");
  return { sitePassword, widgetToken, dashboardUrl, missing };
}

/** Upstream must be https, except localhost for development. */
export function isAllowedUpstream(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  } catch {
    return false;
  }
}
