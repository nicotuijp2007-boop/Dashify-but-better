// Hash routes: "#/" (overview), "#/limit/<id>" (detail), "#/instellingen".

export function parseRoute(hash) {
  const path = (hash ?? "").replace(/^#/, "") || "/";
  if (path.startsWith("/limit/")) {
    const encoded = path.slice("/limit/".length);
    if (encoded) {
      try {
        return { name: "limit", id: decodeURIComponent(encoded) };
      } catch {
        return { name: "home" };
      }
    }
  }
  if (path === "/instellingen") return { name: "settings" };
  return { name: "home" };
}

export function limitHref(id) {
  return `#/limit/${encodeURIComponent(id)}`;
}
