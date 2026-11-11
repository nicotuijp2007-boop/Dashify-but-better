# Limieten

Een web-app (PWA) op Netlify die laat zien wat er **over** is van je limieten: Claude Pro,
Supabase Free en Netlify Free. Hij leest het alleen-lezen endpoint `GET /api/widget` van je
dashboard ([overvieuw-](https://github.com/nicotuijp2007-boop/overvieuw-), contract v1). Hij
praat nooit rechtstreeks met Netlify, Supabase of Claude.

Op je iPhone zet je hem op het beginscherm. Hij opent dan schermvullend als een app en werkt
offline met de laatst bewaarde gegevens. Er is geen Mac, geen Xcode en geen Apple-account nodig,
en er geldt geen 7-dagengrens.

> **Widgets:** een web-app kan op iOS geen beginscherm- of vergrendelschermwidgets maken. Daarvoor
> blijft de Scriptable-widget uit de dashboard-repo de oplossing (die gebruikt hetzelfde endpoint).

## Hoe het werkt

```
iPhone (PWA)  --cookie-->  Netlify Function /api/limits  --Bearer WIDGET_TOKEN-->  dashboard /api/widget
```

- De **widgettoken staat alleen op de server**, als Netlify-omgevingsvariabele. De browser ziet hem nooit.
- De site is beveiligd met een **wachtwoord** (`SITE_PASSWORD`). Na het inloggen krijgt het toestel
  een ondertekende cookie (`HttpOnly`, `Secure`, `SameSite=Strict`), die 180 dagen geldig is.
  Zonder geldige cookie haalt de functie niets op.
- Wil je alle toestellen uitloggen? Wijzig `SITE_PASSWORD` of `WIDGET_TOKEN`.
- Er is geen build-stap en er zijn geen dependencies: gewone HTML, CSS en JavaScript-modules.

| Map | Inhoud |
| --- | --- |
| `public/` | De PWA: `index.html`, `app.js`, `styles.css`, service worker, manifest, iconen |
| `public/lib/` | Pure logica (contract, opmaak, weergaveregels, cache, routes), ook gebruikt door de tests |
| `netlify/functions/` | `limits.mjs` (`GET /api/limits`), `netlify.mjs` (`GET /api/netlify`), `netlify-action.mjs` (`POST /api/netlify/action`), `login.mjs`, `logout.mjs` |
| `netlify/lib/` | Configuratie, sessie-cookie, JSON-hulpjes |
| `test/` | Tests (`node --test`) met JSON-fixtures volgens contract v1 |
| `scripts/` | Lokale dev-server; script dat de PNG-iconen maakt |

## Wat de app doet

Drie tabs onderin: **Netlify**, **Usage** en **Instellingen**.

- **Netlify** (startscherm, zoals Dashify): je account, de laatste deploy (status, context, site,
  commitbericht, auteur, branch, commit, buildtijd), al je sites met een preview en hun laatste
  deploy, en de status van Netlify zelf. Tik op een site voor de gepubliceerde deploy (aangemaakt,
  buildtijd, framework, link, commit, branch, deploy-ID), de deploy-samenvatting en de recente
  deploys.
- **Acties per site**, steeds na bevestiging:
  - *Opnieuw deployen*: nieuwe build van de gekoppelde branch (een productie-deploy kost ~15 credits);
  - *Zet live*: een eerdere geslaagde deploy terugzetten (geen nieuwe build);
  - *Auto-publish aan/uit*: nieuwe deploys wel of niet vanzelf live zetten;
  - *Annuleer*: een build die nog loopt stoppen.
- **Usage**: een grote meter met je krapste limiet, statuschips om te filteren, en al je limieten
  (zoals de Netlify-credits) in dezelfde volgorde als het dashboard. Supabase wordt niet getoond.
  Tik op een limiet voor de details.
- **Offline of fout:** je ziet de laatst bewaarde gegevens met een lichte melding en het tijdstip.
- **Weergave:** donker als basis met een turquoise accent, licht volgt het toestel. Status altijd
  als icoon plus woord (OK, Let op, Kritiek). De tekstgrootte volgt de iOS-instelling, alles heeft
  labels voor VoiceOver, en animaties staan uit bij "Verminder beweging".

## Op Netlify zetten

1. Ga in Netlify naar **Add new site > Import an existing project**, kies GitHub en deze repo.
   Netlify leest `netlify.toml`, dus je hoeft niets in te vullen bij build command of publish directory.
2. Zet bij **Site configuration > Environment variables**:

   | Variabele | Waarde |
   | --- | --- |
   | `SITE_PASSWORD` | Een lang wachtwoord om in te loggen (bijvoorbeeld vier losse woorden) |
   | `WIDGET_TOKEN` | Dezelfde waarde als `WIDGET_TOKEN` op je dashboard-site |
   | `DASHBOARD_URL` | Optioneel. Standaard `https://usage-dashboard-e00568.netlify.app` |
   | `NETLIFY_TOKEN` | Netlify-token voor het Netlify-deel (sites en deploys). Alleen leesverzoeken worden gedaan |

   Markeer `SITE_PASSWORD` en `WIDGET_TOKEN` als *secret*. Zet ze nooit in de code of in een chat.
3. Start een deploy (**Deploys > Trigger deploy**). Daarna open je de site-URL en log je in.

Let op de credits van Netlify Free:
- Elke productie-deploy kost credits. `netlify.toml` slaat een deploy over als er niets aan de site
  is veranderd (bijvoorbeeld alleen de README).
- Elke verversing is één functie-aanroep. De app ververst alleen als hij open en zichtbaar is: bij
  openen, elke 5 minuten, en als je zelf ververst.

Het endpoint `/api/widget` moet live staan op het dashboard (aparte taak in de dashboard-repo).
Tot die tijd geeft de app de melding "/api/widget staat nog niet live op het dashboard".

## Op je iPhone zetten

1. Open de site in **Safari** en log in.
2. Tik op **Deel** (vierkantje met pijl) > **Zet op beginscherm** > **Voeg toe**.
3. Open Limieten vanaf het beginscherm. Een app op het beginscherm heeft eigen cookies, dus je logt
   daar **nog één keer in**. Daarna blijf je 180 dagen ingelogd.

## Lokaal ontwikkelen en testen

Vereist Node 22.

```bash
npm test
```

```bash
npm run dev
```

`npm run dev` start http://localhost:8888 met een nep-dashboard op basis van
`test/fixtures/full.json` (wachtwoord: `dev`). Met een andere fixture of een foutstatus:

```bash
FIXTURE=edge-zero-hundred npm run dev
```

```bash
FIXTURE=status-401 npm run dev
```

De fixtures volgen contract v1, met randgevallen: `stale`, `problems`, ontbrekende optionele
velden, onbekende velden en waarden, 0% en 100% over, een lege lijst, versie 2, en de foutbodies
van 401 en 503.

Iconen opnieuw maken na een wijziging van `public/icons/icon.svg` (gebruikt Playwright):

```bash
node scripts/make-icons.mjs
```

Na wijzigingen aan bestanden in `public/` hoef je de service worker niet bij te werken: die haalt
eerst het netwerk op en valt alleen offline terug op de cache. Voeg je een nieuw bestand toe dat
offline nodig is, zet het dan in de lijst `SHELL` in `public/sw.js` en verhoog `CACHE`.

## Geheimen

- Geen tokens of wachtwoorden in de repo. `.env`-bestanden staan in `.gitignore`.
- `NETLIFY_TOKEN` blijft op de server. `/api/netlify` doet alleen vaste GET-verzoeken en stuurt
  alleen een vaste selectie velden door (geen omgevingsvariabelen of build-instellingen).
  `/api/netlify/action` kent alleen de vier acties hierboven, werkt alleen ingelogd, vanaf deze site
  zelf en met JSON, en controleert dat een deploy echt bij de site hoort.
- `WIDGET_TOKEN` gaat alleen van de Netlify Function naar het dashboard, in de
  `Authorization`-header. Hij komt nooit in de browser, in een URL of in een antwoord.
