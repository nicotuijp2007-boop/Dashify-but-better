# Limieten

Native iOS-app (SwiftUI, iOS 17+) met widgets voor mijn eigen gebruikslimieten-dashboard
(Claude Pro, Supabase Free, Netlify Free). De app leest alleen het alleen-lezen endpoint
`GET {dashboard}/api/widget` met een widgettoken. Hij praat nooit rechtstreeks met Netlify,
Supabase of Claude en bewaart geen tokens van die diensten.

> **Status: fase 1 van 4.** Skelet, `LimitenKit` met tests, en een minimale app die de verbinding
> test en de ruwe lijst toont. Het volledige hoofdscherm volgt in fase 2, de widgets in fase 3.

## Opbouw

| Map | Inhoud |
| --- | --- |
| `project.yml` | XcodeGen-definitie van het Xcode-project (het `.xcodeproj` staat niet in git) |
| `Configs/` | `Base.xcconfig` (gedeeld) en `Local.xcconfig` (jouw team en bundle-ID, niet in git) |
| `App/` | De SwiftUI-app |
| `LimitenKit/` | Swift Package met alle niet-UI-logica: modellen volgens API-contract v1, API-client, cache, Nederlandse opmaak, selectie voor de widgets, deeplinks. Met XCTest-tests en JSON-fixtures |

## Vereisten

- Een Mac met **Xcode 15 of nieuwer** (iOS 17 SDK).
- [Homebrew](https://brew.sh) voor XcodeGen.
- Een iPhone met iOS 17 of nieuwer, met een kabel (of hetzelfde wifi-netwerk na de eerste keer).
- Een Apple ID. Een gratis account is genoeg om te beginnen (zie "Gratis Apple-account").
- Het dashboard met `/api/widget` live, en de `WIDGET_TOKEN` die daar is ingesteld.

## Project maken en bouwen

1. Installeer XcodeGen en maak het project:

   ```bash
   brew install xcodegen
   ```

   ```bash
   xcodegen generate
   ```

   Draai `xcodegen generate` opnieuw na elke `git pull` waarin `project.yml` of bestanden zijn
   toegevoegd of verwijderd.

2. **Team en bundle-ID instellen (één keer).** Kopieer het voorbeeld:

   ```bash
   cp Configs/Local.xcconfig.example Configs/Local.xcconfig
   ```

   Vul in `Configs/Local.xcconfig` in:
   - `LIMIETEN_BUNDLE_ID`: iets unieks, bijvoorbeeld `nl.jouwnaam.limieten`. Gebruik niet
     `com.example.limieten`; die bundle-ID kan bij Apple al bezet zijn.
   - `DEVELOPMENT_TEAM`: je team-ID. Die vind je in Xcode > Settings > Accounts > je Apple ID;
     bij een gratis account heet het team "*Jouw Naam* (Personal Team)". Als je de ID niet ziet:
     laat het veld leeg, open het project, kies bij de target **Limieten** > *Signing &
     Capabilities* > *Team* je Personal Team, en kopieer daarna de waarde van `DEVELOPMENT_TEAM`
     uit *Build Settings* naar `Local.xcconfig`.

   Waarom niet gewoon in Xcode kiezen? Dat werkt ook, maar `xcodegen generate` maakt het project
   opnieuw en dan ben je die keuze kwijt. `Local.xcconfig` blijft bestaan en staat niet in git.

3. Open `Limieten.xcodeproj`, kies je iPhone als bestemming en druk op **Run** (⌘R).

## Op je iPhone installeren

1. Sluit de iPhone aan en vertrouw de Mac als daarom gevraagd wordt.
2. Zet **Ontwikkelaarsmodus** aan: Instellingen > Privacy en beveiliging > Ontwikkelaarsmodus
   (verschijnt nadat Xcode het toestel één keer heeft gezien), herstart en bevestig.
3. Druk in Xcode op Run. De eerste keer meldt iOS dat de ontwikkelaar niet vertrouwd is: ga naar
   Instellingen > Algemeen > VPN en apparaatbeheer > je Apple ID > **Vertrouw**.

## Gratis Apple-account

- Een app die je met een gratis account (Personal Team) installeert, werkt **7 dagen**. Daarna
  start hij niet meer. Opnieuw installeren via Xcode (Run) geeft weer 7 dagen; je instellingen en
  token blijven bewaard zolang je de app niet verwijdert.
- Limieten van een Personal Team: maximaal 3 eigen apps per toestel tegelijk en 10 App ID's per
  7 dagen. De app plus de widgetextensie gebruiken er 2.
- Niet alle capabilities zijn beschikbaar. Zie hieronder.
- Met een betaald account ($99 per jaar) werkt de app een jaar en zijn alle capabilities beschikbaar.
  Je hoeft dan alleen je team in `Local.xcconfig` aan te passen.

### Gedeelde opslag voor de widget (keuze voor fase 3)

Een widget draait als aparte extensie en kan niet zomaar bij de opslag van de app. Er zijn twee
manieren om te delen:

1. **App Group**: gedeelde `UserDefaults` en een gedeelde map voor de cache.
2. **Keychain Sharing**: een gedeelde Keychain-toegangsgroep voor de token.

Ik heb niet kunnen vaststellen of Apple App Groups voor een Personal Team toestaat: oudere Xcode-
versies weigerden dat ("Personal development teams do not support the App Groups capability"),
nieuwere lijken het toe te staan. Keychain Sharing werkt naar mijn weten wel met een gratis account.
Daarom het plan voor fase 3:

- **Voorkeur:** App Group voor URL en cache, plus gedeelde Keychain voor de token.
- **Als App Groups niet mag:** alles wat de widget nodig heeft gaat in de gedeelde Keychain: de
  token, de dashboard-URL en de laatst opgehaalde respons (een paar kB JSON). De widget haalt zelf
  de gegevens op met de token uit de Keychain. Even veilig, want alles blijft op het toestel en is
  alleen leesbaar voor apps van jouw eigen team.

In beide gevallen staat de token alleen in de Keychain van het toestel
(`AfterFirstUnlockThisDeviceOnly`: niet in iCloud, wel leesbaar voor de widget nadat je het toestel
na het opstarten één keer hebt ontgrendeld).

## Instellen in de app

1. Open de app en tik op het tandwiel (Instellingen).
2. **Dashboard-URL**: standaard `https://usage-dashboard-e00568.netlify.app`. Alleen https-adressen
   worden geaccepteerd; `/api/widget` hoef je niet zelf toe te voegen.
3. **Widgettoken**: plak de waarde van `WIDGET_TOKEN` uit de Netlify-omgevingsvariabelen. Plak hem
   nergens anders, ook niet in een chat.
4. Tik op **Verbinding testen**. Pas na een geslaagde test worden URL en token bewaard (token in de
   Keychain). Je ziet duidelijk het verschil tussen:
   - *Verbonden*: aantal opgehaalde limieten;
   - *Token geweigerd* (401);
   - *Netwerkfout* (geen internet, time-out, server niet gevonden);
   - overige fouten, zoals 404 (endpoint nog niet live) of 503 (`WIDGET_TOKEN` niet ingesteld op de server).
5. **Token wissen** verwijdert de token uit de Keychain en de bewaarde gegevens van het toestel.

## Widgets toevoegen (vanaf fase 3)

- **Beginscherm:** houd het beginscherm ingedrukt > **+** (linksboven) > zoek "Limieten" > kies
  klein, middel of groot > **Voeg widget toe**.
- **Vergrendelscherm:** houd het vergrendelscherm ingedrukt > **Pas aan** > Vergrendelscherm >
  tik op het widgetvak onder de klok > kies "Limieten" (rond of rechthoekig).

## Tests voor `LimitenKit`

Op de Mac:

```bash
cd LimitenKit && swift test
```

Of open `LimitenKit/Package.swift` in Xcode en druk op ⌘U. De tests draaien ook op Linux met de
Swift-toolchain van swift.org (zo zijn ze tijdens de ontwikkeling gecontroleerd).

De fixtures in `LimitenKit/Tests/LimitenKitTests/Fixtures/` volgen API-contract v1, met randgevallen:
`stale`, `problems`, ontbrekende optionele velden, onbekende velden en waarden, 0% en 100% over, een
lege lijst, versie 2, en de foutbodies van 401 en 503. `SampleData.fullJSON` (voor de SwiftUI-
previews) is gelijk aan `full.json`; een test bewaakt dat.

## Geheimen

- Geen tokens in code, commits of `xcconfig`-bestanden. `Configs/Local.xcconfig` bevat alleen je
  team-ID en bundle-ID en staat in `.gitignore`.
- De widgettoken wordt alleen in de app ingevuld en in de Keychain van het toestel bewaard. Hij gaat
  alleen mee in de `Authorization`-header, nooit in de URL.
