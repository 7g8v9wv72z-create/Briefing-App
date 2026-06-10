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
| **TomTom** | Verkehr (Routing + Geocoding, Echtzeit-Traffic) | Ja | https://developer.tomtom.com → kostenloses Konto, „Maps API Key" erstellen |
| **Anthropic** | Nachrichten (Claude `claude-sonnet-4-20250514` + Web Search) | Ja | https://console.anthropic.com → „API Keys" |

> **Hinweis Open-Meteo:** Der Wetterdienst ist kostenlos und benötigt **keinen**
> API-Key. Ohne TomTom-Key wird die Geocodierung über Open-Meteo durchgeführt;
> die Verkehrslage bleibt dann allerdings leer.

### Sicherheit der Keys
Die Keys werden ausschließlich im Browser (`localStorage`) gespeichert und
direkt an die jeweiligen APIs gesendet – es gibt **kein Backend**. Der
Anthropic-Aufruf nutzt den Header `anthropic-dangerous-direct-browser-access`,
um den Direktzugriff aus dem Browser zu erlauben. Verwende für den
persönlichen Gebrauch idealerweise einen Key mit begrenztem Budget.

## Einstellungen

- **Heimadresse** (Vorbelegung: `89284`)
- **Arbeitsadresse** (Vorbelegung: `Driventic, Heidenheim`)
- **Anthropic API Key**
- **Traffic API Key (TomTom)**

## Dateistruktur

```
index.html          App-Struktur & Screens
app.js              Logik: Daten laden, Briefing bauen, TTS-Player
style.css           Dunkles, kontrastreiches Design
manifest.json       PWA-Manifest
service-worker.js   Caching & Offline-Fallback
icon.svg            App-Icon
README.md           Diese Datei
```

## Technische Hinweise

- **Verkehr:** TomTom *Calculate Route* API mit `traffic=true` – liefert aktuelle
  Fahrzeit, Normalzeit und Verzögerung.
- **Wetter:** Open-Meteo *Forecast* API (7 Tage, Zeitzone Europe/Berlin).
- **Nachrichten:** Claude API mit aktiviertem **Web-Search-Tool**; das aktuelle
  Datum wird übergeben, es werden nur Meldungen von heute/gestern berücksichtigt.
  Donnerstags wird die Wochenend-Wettervorschau lokal aus den Forecast-Daten ergänzt.
- Begrüßung, Verkehr und Wetter werden **lokal** aus den API-Daten formuliert
  (zuverlässig & ohne Halluzinationen); nur die Nachrichten kommen von Claude.
