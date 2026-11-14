# Clear Round – Springreit-Spiel

Browserspiel mit Tageskurs, Live-Rennen, Bestenlisten und App-Installation, gehostet auf Cloudflare.

## Was das Spiel kann

- **Gezeichnete Grafik in hoher Auflösung:** anatomisches Pferd mit gelenkigen Beinen, echtem 4-Takt-Galopp und Sprungphasen (Absprung, Bascule, Landung), wehender Mähne und Schweif, Fellzeichnungen je Pferd (Blesse, Socken, Apfelschimmel, Aalstrich, Schecken). Reiter in leichtem Sitz und Sprungsitz mit Helm, Jacket, Stiefeln, Sattel, Schabracke in Jackenfarbe, Trense und Gamaschen. Show-Sprünge mit Fängen und Blumenkästen, Hufabdrücke im Sand, Gras im Vordergrund.
- **Freier Ritt** in drei Stufen (Einsteiger, Normal, Profi) durch Alpweide, Zürich, Herbstwald, Seeufer und Winterland, mit Tag und Nacht, Gewitter, Regenbogen, Pegasus-Flügeln, Sternengalopp und Fotofinish beim Sturz.
- **Tageskurs:** Jeden Tag ein neuer Parcours, der für alle gleich ist. Eigene Tagesrangliste, und du reitest gegen den Geist des Tagesbesten. Eine Fahne zeigt, wie weit er kam.
- **Wettrennen mit Freunden:** Öffentlicher Raum oder privater Raum mit Code und Einladungslink. Bei „Gemeinsam starten“ reiten alle auf demselben Parcours.
- **Bestenlisten:** Tageskurs heute und Allzeit pro Stufe.
- **22 Abzeichen**, jedes bringt 25 Karotten für den Pferde-Shop.
- **Als App installierbar** (Handy und Computer), läuft danach auch ohne Internet. Vollbild mit Querformat auf dem Handy, Controller-Unterstützung.
- **Gerät wechseln:** Mit einem 6-stelligen Speicher-Code nimmst du Karotten, Pferde, Abzeichen, Rekord und Namen auf ein anderes Gerät mit.
- **Grafik automatisch:** Auf älteren Geräten schaltet das Spiel selbst in einen sparsamen Modus.

## Inhalt

```
public/index.html             Das komplette Spiel
public/sw.js                  Offline-Funktion (Service Worker)
public/manifest.webmanifest   App-Beschreibung für die Installation
public/icons/                 App-Symbole
public/og.jpg                 Vorschaubild beim Teilen des Links
public/_headers, robots.txt   Sicherheits- und Suchmaschinen-Einstellungen
src/worker.js                 Server: Rennen, Bestenlisten, Tageskurs, Speicher-Codes
wrangler.toml                 Cloudflare-Konfiguration
package.json                  Werkzeug für das Veröffentlichen (wrangler)
```

## Veröffentlichen (ohne Programmierkenntnisse)

Die Bezeichnungen in GitHub und Cloudflare können sich leicht ändern; sinngemäss bleibt der Ablauf gleich.

### 1. Code auf GitHub
1. Konto auf https://github.com erstellen (gratis).
2. Oben rechts **+** → **New repository**. Name: `clear-round`. Privat oder öffentlich geht beides. **Create repository**.
3. Auf der leeren Seite **uploading an existing file** anklicken.
4. Den **Inhalt** des entpackten Ordners `clear-round` hineinziehen: die Ordner `public` und `src` sowie `wrangler.toml`, `package.json`, `package-lock.json`, `README.md` und `.gitignore`. Wichtig: `wrangler.toml` muss direkt im Hauptverzeichnis liegen, nicht in einem Unterordner. Den Ordner `node_modules` nicht hochladen (er ist im ZIP nicht enthalten).
5. Unten **Commit changes**.

Hinweis: Beim Hochladen über die Webseite werden versteckte Dateien (`.gitignore`) auf manchen Computern nicht angezeigt. Das ist nicht schlimm, sie ist optional.

### 2. Mit Cloudflare veröffentlichen
1. Konto auf https://dash.cloudflare.com erstellen (gratis).
2. Links **Workers & Pages** (bzw. **Compute**) → **Erstellen** → **Repository importieren** / **Import a repository**.
3. GitHub verbinden und `clear-round` auswählen.
4. Build-Befehl leer lassen, Deploy-Befehl `npx wrangler deploy` (meist schon eingetragen). **Bereitstellen** / **Deploy**.
5. Nach ein bis zwei Minuten läuft das Spiel unter `https://clear-round.<dein-konto>.workers.dev`.

### 3. Änderungen
Jede Änderung, die du auf GitHub speicherst, wird automatisch neu veröffentlicht. Wenn du Dateien in `public` änderst, in `public/sw.js` die Zeile `const VERSION = 'clear-round-v2';` auf `v3`, `v4` usw. erhöhen, damit installierte Apps sicher die neue Version laden.

### Eigene Domain (optional)
Beim Worker `clear-round` unter **Einstellungen → Domains & Routes** eine eigene Domain hinzufügen, sofern sie bei Cloudflare verwaltet wird.

### QR-Code für den Link
Adresse kopieren und z. B. auf https://goqr.me einfügen, Bild herunterladen. Praktisch zum Aufhängen im Stall.

## Mit der Kommandozeile (optional)

Voraussetzung: Node.js (https://nodejs.org).

```bash
npm install
npx wrangler dev        # lokal testen auf http://localhost:8787
npx wrangler login      # einmalig bei Cloudflare anmelden
npx wrangler deploy     # veröffentlichen
```

## Gut zu wissen

- **Kosten:** Für ein Hobbyprojekt reicht in der Regel der Gratis-Plan. Durable Objects mit SQLite-Speicher sind nach aktuellem Stand darin enthalten; die Limits stehen auf der Cloudflare-Preisseite.
- **Öffentlich sichtbar** sind nur Spielername, Punkte, Meter und Pferdefarbe in den Bestenlisten sowie der Geist des Tagesbesten. Es gibt keine Anmeldung; jeder Browser bekommt eine zufällige Spieler-ID. Ein einfacher Filter ersetzt grobe Schimpfwörter in Namen durch „Reiter“.
- **Nur auf dem Gerät** bleiben: Fotoalbum, eigene Fotos und alle Einstellungen.
- **Speicher-Codes** sind 30 Tage gültig. Alte Tageskurs-Daten werden nach einer Woche automatisch gelöscht.
- **Tageskurs-Wechsel** ist um Mitternacht UTC (in der Schweiz 1 Uhr im Winter, 2 Uhr im Sommer).
- **App installieren:** Android/Chrome und Computer zeigen den Knopf „Als App installieren“. Auf dem iPhone geht es über Safari → Teilen → „Zum Home-Bildschirm“; der Knopf erklärt das.
- **Allzeit-Bestenliste zurücksetzen:** In `src/worker.js` `idFromName('main')` z. B. auf `idFromName('saison2')` ändern und neu veröffentlichen.
- **Ohne Server:** `public/index.html` läuft auch allein (z. B. per Doppelklick). Dann fehlen Online-Funktionen und App-Installation, der Rest funktioniert.
