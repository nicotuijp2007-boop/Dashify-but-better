// Netlify screens: status, latest deploy, sites grid, and one site's details.

import { formatDateTime, timeAgo } from "../lib/format.js";
import { contextLabel, deployState, deployTitle, formatSeconds, frameworkLabel, hostOf, netlifyStatus } from "../lib/netlify.js";
import { siteHref } from "../lib/router.js";
import { h, kindIcon, statusIcon } from "./dom.js";

function when(iso, now) {
  if (!iso) return null;
  return timeAgo(new Date(iso), now);
}

function stateBadge(deploy, published) {
  const info = deployState(deploy, { published });
  return h("span", { class: `pill pill-${info.kind}` }, kindIcon(info.kind), info.label);
}

function meta(...parts) {
  return h("div", { class: "chiprow" }, parts.filter(Boolean).map((p) => h("span", { class: "tag" }, p)));
}

export function statusLine(status) {
  const info = netlifyStatus(status);
  if (!info) return null;
  return h("p", { class: "netlify-status", role: "status" }, statusIcon(info.level), h("span", {}, info.label));
}

/** "Laatste deploy" card, like the top of Dashify. */
export function latestDeployCard(deploy, now) {
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
    meta(deploy.committer, deploy.branch && `⎇ ${deploy.branch}`, deploy.commitShort, formatSeconds(deploy.deployTime) && `⏱ ${formatSeconds(deploy.deployTime)}`),
  );
}

function screenshot(url, className) {
  if (!url) return h("div", { class: `${className} shot-empty`, "aria-hidden": "true" });
  return h("img", {
    class: className,
    src: url,
    alt: "",
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    // No broken-image icon when the preview can't load (offline, expired URL).
    onerror: (event) => event.target.replaceWith(h("div", { class: `${className} shot-empty`, "aria-hidden": "true" })),
  });
}

/** Grid of sites with a preview and their latest deploy. */
export function sitesGrid(sites, now) {
  return h(
    "ul",
    { class: "site-grid", "aria-label": "Sites" },
    sites.map((site) => {
      const deploy = site.lastDeploy ?? site.published;
      const info = deploy ? deployState(deploy, { published: deploy.id === site.published?.id }) : null;
      return h(
        "li",
        {},
        h(
          "a",
          {
            class: "site-card",
            href: siteHref(site.id),
            "aria-label": `${site.name}${info ? `, laatste deploy ${info.label}, ${when(deploy.createdAt, now) ?? ""}` : ""}`,
          },
          screenshot(site.screenshotUrl, "shot"),
          h(
            "div",
            { class: "site-body" },
            h("div", { class: "site-name" }, site.name),
            site.url ? h("div", { class: "site-host" }, hostOf(site.url)) : null,
            site.repo ? h("div", { class: "muted tiny ellipsis" }, site.repo) : null,
          ),
          deploy
            ? h(
                "div",
                { class: "site-foot" },
                kindIcon(info.kind),
                h("span", { class: "ellipsis" }, deployTitle(deploy), h("br"), h("span", { class: "muted" }, when(deploy.createdAt, now))),
              )
            : null,
        ),
      );
    }),
  );
}

/** The Netlify section under the limits on the home screen. */
export function netlifySection(netlify, now, message) {
  const nodes = [h("h2", { class: "section-title" }, netlify?.data?.account?.name ? `Netlify · ${netlify.data.account.name}` : "Netlify")];
  const data = netlify?.data;
  if (!data) {
    nodes.push(h("p", { class: "muted small" }, message ?? "Netlify-gegevens ophalen…"));
    return nodes;
  }
  if (message) nodes.push(h("p", { class: "notice", role: "status" }, h("span", {}, message)));
  nodes.push(latestDeployCard(data.latestDeploy, now));
  nodes.push(h("h2", { class: "section-title" }, "Sites ", h("span", { class: "count-badge" }, String(data.sites.length))));
  nodes.push(data.sites.length ? sitesGrid(data.sites, now) : h("p", { class: "muted" }, "Geen sites."));
  nodes.push(statusLine(data.status));
  return nodes;
}

function fact(label, value) {
  return value == null || value === "" ? null : [h("dt", {}, label), h("dd", {}, value)];
}

function extLink(href, text) {
  return href ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text) : text;
}

/** One site: preview, published deploy facts and summary, recent deploys. */
export function siteView(entry, id, now, message) {
  const nodes = [h("a", { class: "back", href: "#/" }, "‹ Overzicht")];
  const data = entry?.data;
  if (!data) {
    nodes.push(
      h("h1", { class: "detail-title", tabindex: "-1" }, "Site"),
      h("p", { class: "secondary" }, message ?? "Gegevens ophalen…"),
    );
    return nodes;
  }
  const { site, published, deploys } = data;
  nodes.push(h("h1", { class: "detail-title", tabindex: "-1" }, site.name));
  if (message) nodes.push(h("p", { class: "notice", role: "status" }, h("span", {}, message)));
  nodes.push(screenshot(site.screenshotUrl, "shot shot-large"));

  if (published) {
    const facts = h("dl", { class: "facts" });
    for (const row of [
      fact("Aangemaakt", published.createdAt && `${formatDateTime(new Date(published.createdAt))} (${when(published.createdAt, now)})`),
      fact("Buildtijd", formatSeconds(published.deployTime)),
      fact("Framework", frameworkLabel(published.framework)),
      fact("Link", published.deployUrl && extLink(published.deployUrl, hostOf(published.deployUrl))),
      fact("Commit", published.commitShort && extLink(published.commitUrl, published.commitShort)),
      fact("Branch", published.branch),
      fact("Deploy-ID", published.id),
    ]) {
      if (row) facts.append(...row);
    }
    nodes.push(
      h(
        "section",
        { class: "card", "aria-label": "Gepubliceerde deploy" },
        h("div", { class: "deploy-head" }, stateBadge(published, true), published.context ? h("span", { class: "secondary small" }, contextLabel(published.context)) : null),
        h("p", { class: "deploy-title" }, deployTitle(published)),
        facts,
      ),
    );
    if (published.summary?.length) {
      nodes.push(
        h("h2", { class: "section-title" }, "Deploy-samenvatting"),
        h(
          "ul",
          { class: "card summary" },
          published.summary.map((m) =>
            h(
              "li",
              {},
              m.type === "warning" || m.type === "error" ? statusIcon(m.type === "error" ? "danger" : "warn") : statusIcon("ok"),
              h("div", {}, h("div", { class: "metric" }, m.title), m.description ? h("div", { class: "secondary small" }, m.description) : null),
            ),
          ),
        ),
      );
    }
  } else {
    nodes.push(h("p", { class: "secondary" }, "Nog geen gepubliceerde deploy."));
  }

  if (deploys.length) {
    nodes.push(
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
              h(
                "div",
                { class: "muted tiny" },
                [info.label, contextLabel(d.context), d.branch, d.commitShort, formatSeconds(d.deployTime)].filter(Boolean).join(" · "),
              ),
              d.errorMessage ? h("div", { class: "secondary small" }, d.errorMessage) : null,
            ),
            h("span", { class: "muted tiny nowrap" }, when(d.createdAt, now)),
          );
        }),
      ),
    );
  }

  nodes.push(
    h(
      "nav",
      { class: "links", "aria-label": "Links" },
      site.url ? h("a", { href: site.url, target: "_blank", rel: "noopener noreferrer" }, "Open site ↗") : null,
      site.adminUrl ? h("a", { href: site.adminUrl, target: "_blank", rel: "noopener noreferrer" }, "Open in Netlify ↗") : null,
      site.repoUrl ? h("a", { href: site.repoUrl, target: "_blank", rel: "noopener noreferrer" }, "Repo ↗") : null,
    ),
  );
  return nodes;
}
