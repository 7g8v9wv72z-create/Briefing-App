# Morgen-Briefing PWA – „Guten Morgen, Jan"

Eine installierbare Progressive Web App (PWA), die werktags ein
personalisiertes Morgen-Briefing erstellt und auf **Deutsch vorliest** –
optimiert für die Autofahrt von PLZ **89284** nach **Heidenheim (Driventic)**.

## Inhalt des Briefings

1. **Begrüßung** – Wochentag & Datum
2. **Verkehrslage** – feste Route 89284 → Driventic (Echtzeit-Fahrzeit, Verzögerung, Stau/Frei)
3. **Wetter** – heutige Vorhersage; **donnerstags** zusätzlich Wochenend-Vorschau (Sa + So)
4. **Weltweite Top-News** – 5–7 internationale Schlagzeilen
5. **Wirtschaft & Finanzen** – 2–3 Meldungen
6. **Automotive & Mobilität** – 2–3 Meldungen
7. **Technologie & KI** – 2–3 Meldungen
8. **Lokale Nachrichten** – Region 89284 / Neu-Ulm / Ulm / Heidenheim (~30 km)
9. **Abschluss** – Verabschiedung

Am Wochenende (Sa/So) erscheint stattdessen: *„Heute kein Briefing – genieße dein Wochenende!"*

## Funktionen

- **Vorlesen** via Web Speech API (`de-DE`, Rate 0.92, Pitch 1.0)
- Der aktuell gesprochene Satz wird **farblich hervorgehoben**
- Steuerung: **Pause / Fortsetzen**, **Abschnitt vor / zurück**
- **Offline-Fallback**, wenn keine Verbindung besteht
- Alle Einstellungen & API-Keys werden **nur lokal** (`localStorage`) gespeichert

## Lokal starten

Die App muss über HTTP(S) ausgeliefert werden (Service Worker & PWA-Installation
funktionieren nicht über `file://`). Ein einfacher lokaler Server genügt:

```bash
# Python 3
python3 -m http.server 8080
# danach im Browser: http://localhost:8080
```

Für die Installation auf dem Handy empfiehlt sich ein HTTPS-Hosting
(z. B. GitHub Pages, Netlify, Vercel).

## Installation als App

### iOS (Safari)
1. Seite in **Safari** öffnen (nicht Chrome – nur Safari kann auf iOS installieren).
2. **Teilen-Symbol** (Quadrat mit Pfeil nach oben) antippen.
3. **„Zum Home-Bildschirm"** wählen → **„Hinzufügen"**.
4. Die App startet im Vollbild (`standalone`).
   - Hinweis: Das Vorlesen startet auf iOS aus technischen Gründen erst nach
     dem Tippen auf **„Briefing starten"** (erforderliche Nutzer-Geste).

### Android (Chrome)
1. Seite in **Chrome** öffnen.
2. Es erscheint ggf. automatisch ein Banner **„App installieren"**.
3. Alternativ: **Menü (⋮)** → **„App installieren"** bzw. **„Zum Startbildschirm hinzufügen"**.

## Benötigte API-Keys

In den **Einstellungen** (Zahnrad-Symbol) eintragen:

| Dienst | Zweck | Key nötig? | Bezug |
|--------|-------|-----------|-------|
| **Open-Meteo** | Wetter | **Nein – kostenlos & ohne Key** | https://open-meteo.com |
| **Öffentliche News-Feeds** | Nachrichten | **Nein – kostenlos & ohne Key** | siehe „Nachrichten" unten |
| **TomTom** | Verkehr (Routing + Geocoding, Echtzeit-Traffic) | Ja (nur für Verkehr) | https://developer.tomtom.com → kostenloses Konto, „Maps API Key" erstellen |

> **Komplett kostenlos außer Verkehr:** Wetter und Nachrichten laufen ohne Key.
> Nur die Verkehrslage braucht einen (kostenlosen) TomTom-Key. Ohne TomTom-Key
> bleibt der Verkehrs-Abschnitt leer, der Rest funktioniert.

### Sicherheit des Keys
Der TomTom-Key wird ausschließlich im Browser (`localStorage`) gespeichert und
direkt an TomTom gesendet – es gibt **kein Backend**.

## Nachrichten (kostenlos, ohne Key)

Die Nachrichten kommen aus **öffentlichen RSS/Atom-Feeds** (Tagesschau, Golem,
t3n, electrive, SWR). Damit es in einer reinen Browser-App **kein CORS-Problem**
gibt, werden die Feeds **server-seitig** geholt:

- Der GitHub-Action-Workflow `.github/workflows/news.yml` läuft werktags früh
  morgens (Cron `30 4 * * 1-5` ≈ 06:30 Uhr MESZ) und kann unter **Actions →
  „Build news.json" → „Run workflow"** auch manuell ausgelöst werden.
- Das Skript `scripts/build-news.mjs` baut daraus eine `news.json` und committet
  sie ins Repo.
- Die PWA lädt `news.json` vom **selben Server** (same-origin) – kein Key, kein CORS.

Der News-Stand entspricht also dem letzten Workflow-Lauf. Feeds/Kategorien lassen
sich oben in `scripts/build-news.mjs` anpassen.

## Einstellungen

- **Heimadresse** (Vorbelegung: `89284`)
- **Arbeitsadresse** (Vorbelegung: `Driventic, Heidenheim`)
- **Traffic API Key (TomTom)**
- **Vorlese-Stimme** – Auswahl aus den auf dem Gerät installierten deutschen
  Stimmen (Standard: automatisch die beste verfügbare). Mit „Stimme testen"
  vorhören.
- **Geschwindigkeit** – Vorlese-Tempo (0.6×–1.2×, Standard 0.95×).

> **Natürlichere Stimme:** Auf dem iPhone unter *Einstellungen →
> Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch* eine
> „Premium"/„Erweitert"-Stimme laden; auf Android/Chrome ist „Google Deutsch"
> die beste Wahl. Danach in den App-Einstellungen auswählen.

## Dateistruktur

```
index.html               App-Struktur & Screens
app.js                   Logik: Daten laden, Briefing bauen, TTS-Player
style.css                Dunkles, kontrastreiches Design
manifest.json            PWA-Manifest
service-worker.js        Caching & Offline-Fallback
icon.svg                 App-Icon
news.json                Tagesaktuelle Nachrichten (automatisch erzeugt)
scripts/build-news.mjs   Baut news.json aus kostenlosen Feeds
.github/workflows/       Pages-Deploy + täglicher News-Build
README.md                Diese Datei
```

## Technische Hinweise

- **Verkehr:** TomTom *Calculate Route* API mit `traffic=true` – liefert aktuelle
  Fahrzeit, Normalzeit und Verzögerung.
- **Wetter:** Open-Meteo *Forecast* API (7 Tage, Zeitzone Europe/Berlin).
- **Nachrichten:** kostenlose öffentliche RSS/Atom-Feeds, server-seitig per
  GitHub Action in `news.json` gebaut (kein Key, kein CORS). Donnerstags wird die
  Wochenend-Wettervorschau lokal aus den Forecast-Daten ergänzt.
- Begrüßung, Verkehr und Wetter werden **lokal** aus den API-Daten formuliert
  (zuverlässig & ohne Halluzinationen).
