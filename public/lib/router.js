// Hash routes: "#/" (Netlify), "#/site/<id>", "#/usage" (limits), "#/limit/<id>", "#/instellingen".

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
      return { name: "netlify" };
    }
  }
  if (path === "/instellingen") return { name: "settings" };
  if (path === "/usage") return { name: "usage" };
  return { name: "netlify" };
}

export function limitHref(id) {
  return `#/limit/${encodeURIComponent(id)}`;
}

export function siteHref(id) {
  return `#/site/${encodeURIComponent(id)}`;
}

/** Which tab a route belongs to: netlify | usage | settings. */
export function tabFor(route) {
  if (route.name === "usage" || route.name === "limit") return "usage";
  if (route.name === "settings") return "settings";
  return "netlify";
}
