// Hash routes: "#/" (limits), "#/limit/<id>", "#/netlify", "#/site/<id>", "#/instellingen".

export function parseRoute(hash) {
  const path = (hash ?? "").replace(/^#/, "") || "/";
  for (const name of ["limit", "site"]) {
    const prefix = `/${name}/`;
    if (!path.startsWith(prefix)) continue;
    const encoded = path.slice(prefix.length);
    if (!encoded) break;
    try {
      return { name, id: decodeURIComponent(encoded) };
    } catch {
      return { name: "home" };
    }
  }
  if (path === "/instellingen") return { name: "settings" };
  if (path === "/netlify") return { name: "netlify" };
  return { name: "home" };
}

export function limitHref(id) {
  return `#/limit/${encodeURIComponent(id)}`;
}

export function siteHref(id) {
  return `#/site/${encodeURIComponent(id)}`;
}

/** Which tab a route belongs to: limits | netlify | settings. */
export function tabFor(route) {
  if (route.name === "netlify" || route.name === "site") return "netlify";
  if (route.name === "settings") return "settings";
  return "limits";
}
