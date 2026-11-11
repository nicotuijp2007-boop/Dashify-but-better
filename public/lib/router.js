// Hash routes: "#/" (overview), "#/limit/<id>", "#/site/<id>", "#/instellingen".

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
  return { name: "home" };
}

export function limitHref(id) {
  return `#/limit/${encodeURIComponent(id)}`;
}

export function siteHref(id) {
  return `#/site/${encodeURIComponent(id)}`;
}
