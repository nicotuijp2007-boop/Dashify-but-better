// Netlify screens in the Dashify style: account, latest deploy, sites grid, status,
// and one site's details.

import { formatDateTime, timeAgo } from "../lib/format.js";
import { contextLabel, deployState, deployTitle, formatSeconds, frameworkLabel, hostOf, netlifyStatus } from "../lib/netlify.js";
import { siteHref } from "../lib/router.js";
import { h, icon, kindIcon, statusIcon } from "./dom.js";

function when(iso, now) {
  return iso ? timeAgo(new Date(iso), now) : null;
}

function stateBadge(deploy, published) {
  const info = deployState(deploy, { published });
  return h("span", { class: `pill pill-${info.kind}` }, kindIcon(info.kind), info.label);
}

function tag(iconName, text) {
  return text ? h("span", { class: "tag" }, icon(iconName), h("span", {}, text)) : null;
}

function statusLine(status) {
  const info = netlifyStatus(status);
  if (!info) return null;
  return h("p", { class: "netlify-status", role: "status" }, statusIcon(info.level), h("span", {}, info.label));
}

function accountRow(account) {
  if (!account) return null;
  const initials = (account.name ?? "?").slice(0, 2).toUpperCase();
  return h(
    "div",
    { class: "account" },
    h("span", { class: "avatar", "aria-hidden": "true" }, initials),
    h("div", { class: "grow" }, h("div", { class: "metric" }, account.name), account.slug ? h("div", { class: "muted small" }, account.slug) : null),
    account.plan ? h("span", { class: "plan" }, account.plan) : null,
  );
}

/** "Laatste deploy" card, like the top of Dashify. */
function latestDeployCard(deploy, now) {
  if (!deploy) return null;
  const published = deploy.state === "ready" && deploy.context === "production";
  return h(
    "section",
    { class: "card deploy-card", "aria-label": "Laatste deploy" },
    h(
      "div",
      { class: "deploy-head" },
      stateBadge(deploy, published),
      deploy.context ? h("span", { class: "secondary small" }, contextLabel(deploy.context)) : null,
      h("span", { class: "muted small push" }, when(deploy.createdAt, now)),
    ),
    deploy.siteId ? h("a", { class: "site-link", href: siteHref(deploy.siteId) }, deploy.siteName ?? "Site") : null,
    h("p", { class: "deploy-title" }, deployTitle(deploy)),
    h(
      "div",
      { class: "chiprow" },
      tag("person", deploy.committer),
      tag("branch", deploy.branch),
      tag("commit", deploy.commitShort),
      tag("timer", formatSeconds(deploy.deployTime)),
    ),
  );
}

function screenshot(url, className) {
  const empty = () => h("div", { class: `${className} shot-empty`, "aria-hidden": "true" }, icon("grid"));
  if (!url) return empty();
  return h("img", {
    class: className,
    src: url,
    alt: "",
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    // No broken-image icon when the preview can't load (offline, expired URL).
    onerror: (event) => event.target.replaceWith(empty()),
  });
}

function sitesGrid(sites, now) {
  return h(
    "ul",
    { class: "site-grid", "aria-label": "Sites" },
    sites.map((site, i) => {
      const deploy = site.lastDeploy ?? site.published;
      const info = deploy ? deployState(deploy, { published: deploy.id === site.published?.id }) : null;
      return h(
        "li",
        { vars: { "--i": String(i) } },
        h(
          "a",
          {
            class: "site-card",
            href: siteHref(site.id),
            "aria-label": `${site.name}${info ? `, laatste deploy ${info.label}, ${when(deploy.createdAt, now) ?? ""}` : ""}`,
          },
          h("div", { class: "shot-wrap" }, screenshot(site.screenshotUrl, "shot")),
          h(
            "div",
            { class: "site-body" },
            h("div", { class: "site-name" }, site.name),
            site.url ? h("div", { class: "site-host" }, hostOf(site.url)) : null,
            site.repo ? h("div", { class: "site-repo" }, icon("branch"), h("span", {}, site.repo)) : null,
          ),
          deploy
            ? h(
                "div",
                { class: "site-foot" },
                kindIcon(info.kind),
                h("span", { class: "grow ellipsis" }, h("span", { class: "foot-title" }, deployTitle(deploy)), h("span", { class: "muted" }, when(deploy.createdAt, now))),
                icon("chevron", "icon chevron"),
              )
            : null,
        ),
      );
    }),
  );
}

/** Body of the Netlify tab. */
export function netlifyBody(netlify, now, message) {
  const data = netlify?.data;
  if (!data) {
    return [
      message ? h("p", { class: "notice", role: "status" }, icon("cloudOff"), h("span", {}, message)) : null,
      message ? null : h("div", { class: "skeleton skel-row", "aria-hidden": "true" }),
      message ? null : h("div", { class: "skeleton skel-grid", "aria-hidden": "true" }),
    ];
  }
  return [
    accountRow(data.account),
    message ? h("p", { class: "notice", role: "status" }, icon("cloudOff"), h("span", {}, message)) : null,
    data.latestDeploy ? h("h2", { class: "section-title" }, "Laatste deploy") : null,
    latestDeployCard(data.latestDeploy, now),
    h("h2", { class: "section-title section-big" }, "Sites ", h("span", { class: "count-badge" }, String(data.sites.length))),
    data.sites.length ? sitesGrid(data.sites, now) : h("p", { class: "muted" }, "Geen sites."),
    statusLine(data.status),
  ];
}

function infoRow(iconName, label, value) {
  if (value == null || value === "") return null;
  return h("div", { class: "info-row" }, icon(iconName, "icon info-icon"), h("dt", {}, label), h("dd", {}, value));
}

function extLink(href, text) {
  return href ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text) : text;
}

function linkButton(href, text) {
  return href ? h("a", { class: "link-btn", href, target: "_blank", rel: "noopener noreferrer" }, h("span", {}, text), icon("external")) : null;
}

function actionButton(actions, key, label, run, { primary = false } = {}) {
  const busy = actions?.busy === key;
  return h(
    "button",
    { class: `button small-btn${primary ? " primary" : ""}`, type: "button", disabled: Boolean(actions?.busy), "aria-busy": busy ? "true" : "false", onclick: run },
    busy ? "Bezig…" : label,
  );
}

function actionRow(iconName, title, text, button) {
  return h(
    "div",
    { class: "set-row" },
    h("span", { class: "tile tile-teal tile-sm", "aria-hidden": "true" }, icon(iconName, "tile-glyph")),
    h("div", { class: "grow" }, h("div", { class: "metric" }, title), text ? h("div", { class: "secondary small" }, text) : null),
    button,
  );
}

/** Rebuild and auto-publish for a site. */
function actionsCard(site, published, actions) {
  const rows = [];
  rows.push(
    actionRow(
      "refresh",
      "Opnieuw deployen",
      site.hasRepo
        ? `Nieuwe build van ${site.repoBranch ?? "de branch"}. Kost ongeveer 15 credits.`
        : "Niet gekoppeld aan een repo; deploy deze site vanaf je computer.",
      site.hasRepo
        ? actionButton(actions, "rebuild", "Deployen", () =>
            actions.run({
              action: "rebuild",
              siteId: site.id,
              key: "rebuild",
              confirmText: `${site.name} opnieuw bouwen en publiceren vanaf ${site.repoBranch ?? "de branch"}?\n\nEen productie-deploy kost ongeveer 15 credits.`,
            }),
          { primary: true })
        : null,
    ),
  );
  if (published) {
    const locked = published.locked;
    rows.push(
      actionRow(
        "lock",
        `Auto-publish ${locked ? "uit" : "aan"}`,
        locked
          ? `Vergrendeld op deploy ${published.id.slice(0, 7)}. Nieuwe deploys gaan niet vanzelf live.`
          : "Nieuwe geslaagde deploys gaan automatisch live.",
        actionButton(actions, "lock", locked ? "Aanzetten" : "Uitzetten", () =>
          actions.run({
            action: locked ? "unlock" : "lock",
            siteId: site.id,
            deployId: published.id,
            key: "lock",
            confirmText: locked
              ? `Auto-publish weer aanzetten voor ${site.name}? Nieuwe deploys gaan dan weer vanzelf live.`
              : `Auto-publish uitzetten voor ${site.name}? De huidige deploy blijft live; nieuwe deploys moet je zelf live zetten.`,
          }),
        ),
      ),
    );
  }
  const result = actions?.result
    ? h("div", { class: "result", role: "status" }, statusIcon(actions.result.ok ? "ok" : "danger"), h("p", {}, actions.result.text))
    : null;
  return [h("h2", { class: "section-title" }, "Acties"), h("section", { class: "card group" }, rows, result)];
}

/** Restore or cancel button for one deploy in the list, if it applies. */
function deployAction(site, d, published, actions) {
  const info = deployState(d, { published: d.id === published?.id });
  if (info.kind === "busy") {
    return actionButton(actions, `cancel:${d.id}`, "Annuleer", () =>
      actions.run({ action: "cancel", siteId: site.id, deployId: d.id, key: `cancel:${d.id}`, confirmText: `Deze build van ${site.name} annuleren?` }),
    );
  }
  if (d.state === "ready" && d.id !== published?.id) {
    return actionButton(actions, `restore:${d.id}`, "Zet live", () =>
      actions.run({
        action: "restore",
        siteId: site.id,
        deployId: d.id,
        key: `restore:${d.id}`,
        confirmText: `Deze deploy van ${site.name} weer live zetten?\n\n“${deployTitle(d)}”\n\nEr wordt niets opnieuw gebouwd.`,
      }),
    );
  }
  return null;
}

/** One site: preview, actions, published deploy facts and summary, recent deploys. Returns { bar, body }. */
export function siteView(entry, id, now, message, actions) {
  const data = entry?.data;
  const bar = { back: "#/", title: data?.site?.name ?? "Site", always: true };
  if (!data) {
    return {
      bar,
      body: [
        h("h1", { class: "detail-title", tabindex: "-1" }, "Site"),
        message ? h("p", { class: "notice", role: "status" }, icon("cloudOff"), h("span", {}, message)) : h("div", { class: "skeleton skel-hero", "aria-hidden": "true" }),
      ],
    };
  }
  const { site, published, deploys } = data;
  const body = [
    h("h1", { class: "detail-title", tabindex: "-1" }, site.name),
    site.url ? h("a", { class: "site-host big-host", href: site.url, target: "_blank", rel: "noopener noreferrer" }, hostOf(site.url)) : null,
    message ? h("p", { class: "notice", role: "status" }, icon("cloudOff"), h("span", {}, message)) : null,
    h("div", { class: "shot-wrap shot-hero" }, screenshot(site.screenshotUrl, "shot")),
  ];

  if (published) {
    body.push(
      h(
        "section",
        { class: "card", "aria-label": "Gepubliceerde deploy" },
        h(
          "div",
          { class: "deploy-head" },
          stateBadge(published, true),
          published.context ? h("span", { class: "secondary small" }, contextLabel(published.context)) : null,
          published.locked ? h("span", { class: "tag" }, icon("lock"), h("span", {}, "Vergrendeld")) : null,
        ),
        h("p", { class: "deploy-title" }, deployTitle(published)),
      ),
    );
  }
  if (actions) body.push(...actionsCard(site, published, actions));

  if (published) {
    body.push(
      h("h2", { class: "section-title" }, "Gepubliceerde deploy"),
      h(
        "dl",
        { class: "card info-list" },
        [
          infoRow("calendar", "Aangemaakt", published.createdAt && `${formatDateTime(new Date(published.createdAt))} · ${when(published.createdAt, now)}`),
          infoRow("timer", "Buildtijd", formatSeconds(published.deployTime)),
          infoRow("wand", "Framework", frameworkLabel(published.framework)),
          infoRow("link", "Link", published.deployUrl && extLink(published.deployUrl, hostOf(published.deployUrl))),
          infoRow("commit", "Commit", published.commitShort && extLink(published.commitUrl, published.commitShort)),
          infoRow("branch", "Branch", published.branch),
          infoRow("fingerprint", "Deploy-ID", h("span", { class: "mono" }, published.id)),
        ].filter(Boolean),
      ),
    );
    if (published.summary?.length) {
      body.push(
        h("h2", { class: "section-title" }, "Deploy-samenvatting"),
        h(
          "ul",
          { class: "card summary" },
          published.summary.map((m) =>
            h(
              "li",
              {},
              statusIcon(m.type === "error" ? "danger" : m.type === "warning" ? "warn" : "ok"),
              h("div", {}, h("div", { class: "metric" }, m.title), m.description ? h("div", { class: "secondary small" }, m.description) : null),
            ),
          ),
        ),
      );
    }
  } else {
    body.push(h("p", { class: "secondary" }, "Nog geen gepubliceerde deploy."));
  }

  if (deploys.length) {
    body.push(
      h("h2", { class: "section-title" }, "Recente deploys"),
      h(
        "ul",
        { class: "card deploys" },
        deploys.map((d) => {
          const info = deployState(d, { published: d.id === published?.id });
          return h(
            "li",
            {},
            kindIcon(info.kind),
            h(
              "div",
              { class: "grow" },
              h("div", { class: "metric ellipsis" }, deployTitle(d)),
              h("div", { class: "muted tiny" }, [info.label, contextLabel(d.context), d.branch, d.commitShort, formatSeconds(d.deployTime), when(d.createdAt, now)].filter(Boolean).join(" · ")),
              d.errorMessage ? h("div", { class: "secondary small" }, d.errorMessage) : null,
            ),
            actions ? deployAction(site, d, published, actions) : null,
          );
        }),
      ),
    );
  }

  body.push(
    h(
      "nav",
      { class: "links", "aria-label": "Links" },
      linkButton(site.url, "Open site"),
      linkButton(site.adminUrl, "Open in Netlify"),
      linkButton(site.repoUrl, "Repo"),
    ),
  );
  return { bar, body };
}
