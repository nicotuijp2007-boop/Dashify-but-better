// Presentation rules for the Netlify part (sites, deploys, status). Pure functions, no DOM.

/** Deploy state -> Dutch label and a kind for the icon: ok | danger | busy | neutral. */
export function deployState(deploy, { published = false } = {}) {
  const state = deploy?.state ?? "unknown";
  if (state === "ready") return { label: published ? "Gepubliceerd" : "Klaar", kind: "ok" };
  if (state === "error") return { label: "Mislukt", kind: "danger" };
  if (state === "building") return { label: "Bouwen", kind: "busy" };
  if (["new", "enqueued", "pending_review", "accepted"].includes(state)) return { label: "In de wachtrij", kind: "busy" };
  if (["uploading", "uploaded", "preparing", "prepared", "processing", "processed", "retrying"].includes(state)) {
    return { label: "Bezig", kind: "busy" };
  }
  if (["skipped", "rejected", "cancelled"].includes(state)) return { label: "Overgeslagen", kind: "neutral" };
  return { label: state, kind: "neutral" };
}

const CONTEXTS = {
  production: "Productie",
  "deploy-preview": "Deploy preview",
  "branch-deploy": "Branch-deploy",
  dev: "Dev",
};

export function contextLabel(context) {
  return context ? (CONTEXTS[context] ?? context) : null;
}

const FRAMEWORKS = { next: "Next.js", gatsby: "Gatsby", astro: "Astro", vite: "Vite", hugo: "Hugo", remix: "Remix", nuxt: "Nuxt", sveltekit: "SvelteKit" };

export function frameworkLabel(framework) {
  return framework ? (FRAMEWORKS[framework] ?? framework) : null;
}

/** Build time: "25s", "1m 5s", "1u 2m". */
export function formatSeconds(seconds) {
  if (seconds == null || seconds < 0) return null;
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}u ${m % 60}m` : `${Math.floor(m / 60)}u`;
}

/** Netlify's own status (statuspage indicator) in Dutch, with a level for the icon. */
export function netlifyStatus(status) {
  switch (status?.indicator) {
    case "none":
      return { label: "Alle systemen werken", level: "ok" };
    case "minor":
      return { label: "Kleine storing bij Netlify", level: "warn" };
    case "maintenance":
      return { label: "Onderhoud bij Netlify", level: "warn" };
    case "major":
      return { label: "Grote storing bij Netlify", level: "danger" };
    case "critical":
      return { label: "Ernstige storing bij Netlify", level: "danger" };
    default:
      return null;
  }
}

/** "usage-dashboard-e00568.netlify.app" from a URL. */
export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url ?? null;
  }
}

/** The headline of a deploy: its title, or a sensible fallback. */
export function deployTitle(deploy) {
  if (deploy?.title) return deploy.title;
  if (deploy?.manual) return "Handmatige deploy";
  if (deploy?.commitShort) return `Commit ${deploy.commitShort}`;
  return "Deploy";
}
