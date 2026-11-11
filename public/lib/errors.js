// Error codes from /api/* (and the client itself), with Dutch messages.

const MESSAGES = {
  login_required: "Log in om je limieten te zien.",
  login_failed: "Onjuist wachtwoord.",
  not_configured: "De site is nog niet ingesteld: zet de omgevingsvariabelen in Netlify.",
  upstream_unauthorized: "Het dashboard weigerde de widgettoken (401). Controleer WIDGET_TOKEN in Netlify.",
  upstream_not_configured: "Het dashboard heeft nog geen WIDGET_TOKEN ingesteld (503).",
  upstream_not_found: "/api/widget staat nog niet live op het dashboard.",
  upstream_timeout: "Het dashboard reageerde niet op tijd.",
  upstream_unreachable: "Het dashboard is niet bereikbaar.",
  upstream_invalid: "Onverwacht antwoord van het dashboard.",
  upstream_status: "Onverwachte fout van het dashboard.",
  unsupported_version: "Het dashboard gebruikt een nieuwere API-versie. Werk deze app bij.",
  offline: "Geen internetverbinding.",
  network: "Netwerkfout.",
  server: "Onverwachte fout van deze site.",
  netlify_not_configured: "Zet NETLIFY_TOKEN op deze site om je Netlify-sites te zien.",
  netlify_unauthorized: "Netlify weigerde de token (NETLIFY_TOKEN).",
  netlify_not_found: "Niet gevonden in je Netlify-account.",
  netlify_timeout: "Netlify reageerde niet op tijd.",
  netlify_unreachable: "Netlify is niet bereikbaar.",
  netlify_invalid: "Onverwacht antwoord van Netlify.",
  netlify_status: "Onverwachte fout van Netlify.",
  bad_request: "Ongeldig verzoek.",
  forbidden: "Niet toegestaan.",
  netlify_no_repo: "Deze site is niet gekoppeld aan een repo, dus Netlify kan hem niet opnieuw bouwen.",
  netlify_not_ready: "Alleen een geslaagde deploy kan worden teruggezet.",
  netlify_not_running: "Deze deploy is al klaar en kan niet meer worden geannuleerd.",
};

export function messageFor(code, status) {
  const base = MESSAGES[code] ?? MESSAGES.server;
  return (code === "upstream_status" || code === "netlify_status") && status ? `${base} (HTTP ${status})` : base;
}

/** Short title for the connection test. */
export function titleFor(code) {
  if (code === "upstream_unauthorized") return "Token geweigerd";
  if (["offline", "network", "upstream_timeout", "upstream_unreachable"].includes(code)) return "Netwerkfout";
  if (code === "login_required") return "Niet ingelogd";
  return "Mislukt";
}
