"use strict";

/* =========================================================================
 * Morgen-Briefing PWA
 * - Begrüßung, Verkehr (TomTom), Wetter (Open-Meteo) lokal zusammengesetzt
 * - Nachrichten aus kostenlosen Feeds (news.json, täglich via GitHub Action gebaut)
 * - Vorlesen via Web Speech API (de-DE)
 * ========================================================================= */

/* ---------- Konfiguration / Konstanten ---------- */
const SPEECH_RATE = 0.92;
const SPEECH_PITCH = 1.0;
const LS_KEY = "morgenBriefingSettings";

const DEFAULT_SETTINGS = {
  home: "89284",
  work: "Driventic, Heidenheim",
  trafficKey: ""
};

/* Fallback-Koordinaten für PLZ 89284 (Pfaffenhofen a.d. Roth), falls keine
 * Geocodierung möglich ist – damit das Wetter trotzdem funktioniert. */
const FALLBACK_HOME_COORDS = { lat: 48.314, lon: 10.151 };

/* WMO-Wettercodes → deutsche Beschreibung */
const WEATHER_CODES = {
  0: "klarer Himmel", 1: "überwiegend klar", 2: "teils bewölkt", 3: "bedeckt",
  45: "Nebel", 48: "gefrierender Nebel",
  51: "leichter Nieselregen", 53: "Nieselregen", 55: "starker Nieselregen",
  56: "leichter gefrierender Niesel", 57: "gefrierender Niesel",
  61: "leichter Regen", 63: "Regen", 65: "starker Regen",
  66: "leichter gefrierender Regen", 67: "gefrierender Regen",
  71: "leichter Schneefall", 73: "Schneefall", 75: "starker Schneefall",
  77: "Schneegriesel",
  80: "leichte Regenschauer", 81: "Regenschauer", 82: "heftige Regenschauer",
  85: "leichte Schneeschauer", 86: "Schneeschauer",
  95: "Gewitter", 96: "Gewitter mit leichtem Hagel", 99: "Gewitter mit Hagel"
};

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/* ---------- Settings (localStorage) ---------- */
function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
  } catch (_) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}
function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

/* ---------- Bildschirm-Navigation ---------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  const el = document.getElementById("screen-" + id);
  if (el) el.classList.add("active");
}

/* ---------- Hilfsfunktionen ---------- */
function $(id) { return document.getElementById(id); }

function formatGermanDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(date);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function splitSentences(text) {
  if (!text) return [];
  // Auf Satzende aufteilen, kurze Fragmente an den Vorgänger anhängen.
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch (_) {}
    throw new Error("HTTP " + res.status + (detail ? " – " + detail : ""));
  }
  return res.json();
}

/* =========================================================================
 * Datenquellen
 * ========================================================================= */

/* ---- Geocoding (TomTom bevorzugt, sonst Open-Meteo) ---- */
async function geocode(query, trafficKey) {
  if (trafficKey) {
    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json` +
      `?key=${encodeURIComponent(trafficKey)}&limit=1&countrySet=DE`;
    const data = await fetchJSON(url);
    const r = data.results && data.results[0];
    if (r && r.position) return { lat: r.position.lat, lon: r.position.lon };
  }
  // Fallback: Open-Meteo Geocoding (kein Key nötig)
  const url2 = `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(query)}&count=1&language=de&format=json`;
  const data2 = await fetchJSON(url2);
  const r2 = data2.results && data2.results[0];
  if (r2) return { lat: r2.latitude, lon: r2.longitude };
  return null;
}

/* ---- Verkehr (TomTom Routing mit Echtzeit-Traffic) ---- */
async function getTraffic(homeCoords, workCoords, trafficKey) {
  if (!trafficKey) {
    return { error: "Kein Traffic API Key hinterlegt – Verkehrslage nicht verfügbar." };
  }
  if (!homeCoords || !workCoords) {
    return { error: "Start- oder Zieladresse konnte nicht ermittelt werden." };
  }
  const loc = `${homeCoords.lat},${homeCoords.lon}:${workCoords.lat},${workCoords.lon}`;
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${loc}/json` +
    `?key=${encodeURIComponent(trafficKey)}&traffic=true&travelMode=car&routeType=fastest`;
  const data = await fetchJSON(url);
  const s = data.routes && data.routes[0] && data.routes[0].summary;
  if (!s) return { error: "Keine Route gefunden." };

  const liveMin = Math.round(s.travelTimeInSeconds / 60);
  const baseSec = (s.noTrafficTravelTimeInSeconds != null)
    ? s.noTrafficTravelTimeInSeconds
    : s.travelTimeInSeconds - (s.trafficDelayInSeconds || 0);
  const baseMin = Math.round(baseSec / 60);
  const delayMin = Math.max(0, Math.round((s.trafficDelayInSeconds || 0) / 60));
  const km = (s.lengthInMeters / 1000).toFixed(0);

  return { liveMin, baseMin, delayMin, km };
}

function buildTrafficText(traffic, homeLabel, workLabel) {
  if (traffic.error) return traffic.error;
  const { liveMin, baseMin, delayMin, km } = traffic;
  let msg = `Die Strecke von ${homeLabel} nach ${workLabel} ist rund ${km} Kilometer lang. `;
  if (delayMin <= 1) {
    msg += `Die Strecke ist frei. Du brauchst aktuell etwa ${liveMin} Minuten, das entspricht der normalen Fahrzeit.`;
  } else if (delayMin <= 5) {
    msg += `Es gibt leichte Verzögerungen. Aktuelle Fahrzeit etwa ${liveMin} Minuten gegenüber normal ${baseMin} Minuten, also rund ${delayMin} Minuten mehr.`;
  } else {
    msg += `Achtung, erhöhtes Verkehrsaufkommen. Aktuelle Fahrzeit etwa ${liveMin} Minuten statt normal ${baseMin} Minuten – das sind rund ${delayMin} Minuten Verzögerung. Plane entsprechend mehr Zeit ein.`;
  }
  return msg;
}

/* ---- Wetter (Open-Meteo, kein Key) ---- */
async function getWeather(coords) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
    `&timezone=Europe%2FBerlin&forecast_days=7`;
  const data = await fetchJSON(url);
  return data.daily;
}

function describeDay(daily, idx) {
  const code = daily.weathercode[idx];
  const desc = WEATHER_CODES[code] || "wechselhaft";
  const tmin = Math.round(daily.temperature_2m_min[idx]);
  const tmax = Math.round(daily.temperature_2m_max[idx]);
  const pop = daily.precipitation_probability_max[idx];
  return { desc, tmin, tmax, pop };
}

function buildWeatherText(daily, today, isThursday) {
  if (!daily) return "Wetterdaten sind momentan nicht verfügbar.";
  const t = describeDay(daily, 0);
  let msg = `Heute wird es ${t.desc} bei Temperaturen zwischen ${t.tmin} und ${t.tmax} Grad. `;
  msg += (t.pop != null && t.pop >= 30)
    ? `Die Niederschlagswahrscheinlichkeit liegt bei ${t.pop} Prozent – nimm besser einen Regenschirm mit. `
    : `Niederschlag ist heute kaum zu erwarten. `;

  if (isThursday) {
    // Wochenend-Vorschau: passenden Samstag/Sonntag im 7-Tage-Forecast finden.
    msg += "Ein Blick aufs Wochenende: ";
    for (let i = 1; i < daily.time.length; i++) {
      const d = new Date(daily.time[i] + "T12:00:00");
      const day = d.getDay();
      if (day === 6 || day === 0) {
        const w = describeDay(daily, i);
        const name = day === 6 ? "Samstag" : "Sonntag";
        msg += `Am ${name} ${w.desc}, ${w.tmin} bis ${w.tmax} Grad` +
          (w.pop != null && w.pop >= 30 ? ` mit ${w.pop} Prozent Regenwahrscheinlichkeit` : "") + ". ";
      }
    }
  }
  return msg.trim();
}

/* ---- Nachrichten (kostenlose Feeds, täglich via GitHub Action in news.json gebaut) ---- */
async function getNews() {
  try {
    // cache-busting, damit immer die aktuelle news.json geladen wird
    const res = await fetch("./news.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (_) {
    return { error: "Nachrichten konnten nicht geladen werden." };
  }
}

/* =========================================================================
 * Briefing-Zusammenstellung
 * ========================================================================= */
async function buildBriefing(settings, setStep) {
  const now = new Date();
  const weekdayName = WEEKDAYS[now.getDay()];
  const dateStr = formatGermanDate(now);
  const isThursday = now.getDay() === 4;
  const homeLabel = settings.home || "deinem Zuhause";
  const workLabel = settings.work || "der Arbeit";

  // 1) Standorte ermitteln
  setStep("geo", "active");
  let homeCoords = null, workCoords = null;
  try {
    homeCoords = await geocode(settings.home, settings.trafficKey);
  } catch (_) { /* unten abgefangen */ }
  try {
    workCoords = await geocode(settings.work, settings.trafficKey);
  } catch (_) {}
  if (!homeCoords) homeCoords = FALLBACK_HOME_COORDS;
  setStep("geo", "done");

  // 2) Verkehr + 3) Wetter parallel, 4) Nachrichten parallel
  setStep("traffic", "active");
  setStep("weather", "active");
  setStep("news", "active");

  const [trafficRes, weatherRes, newsRes] = await Promise.allSettled([
    getTraffic(homeCoords, workCoords, settings.trafficKey),
    getWeather(homeCoords),
    getNews()
  ]);

  // Verkehr
  let trafficText;
  if (trafficRes.status === "fulfilled") {
    trafficText = buildTrafficText(trafficRes.value, homeLabel, workLabel);
  } else {
    trafficText = "Die Verkehrslage konnte nicht abgerufen werden.";
  }
  setStep("traffic", "done");

  // Wetter
  let weatherText;
  if (weatherRes.status === "fulfilled") {
    weatherText = buildWeatherText(weatherRes.value, now, isThursday);
  } else {
    weatherText = "Wetterdaten sind momentan nicht verfügbar.";
  }
  setStep("weather", "done");

  // Nachrichten
  const news = newsRes.status === "fulfilled" ? newsRes.value : { error: "Nachrichten nicht verfügbar." };
  setStep("news", "done");

  setStep("assemble", "active");

  // Sections zusammenbauen
  const sections = [];
  sections.push({
    label: "Begrüßung",
    items: [{ text: `Guten Morgen! Heute ist ${weekdayName}, der ${dateStr}. Hier ist dein Morgen-Briefing.` }]
  });
  sections.push({ label: "Verkehrslage", items: [{ text: trafficText }] });
  sections.push({ label: "Wetter", items: [{ text: weatherText }] });

  const newsSection = (label, key, fallback) => {
    let items;
    if (news.error) {
      items = [{ text: news.error }];
    } else if (Array.isArray(news[key]) && news[key].length) {
      items = news[key].map((it) => ({ title: it.title || "", text: it.text || "" }));
    } else {
      items = [{ text: fallback }];
    }
    sections.push({ label, items });
  };

  newsSection("Weltweite Top-News", "world", "Aktuell liegen keine internationalen Meldungen vor.");
  newsSection("Wirtschaft & Finanzen", "economy", "Aktuell liegen keine Wirtschaftsmeldungen vor.");
  newsSection("Automotive & Mobilität", "automotive", "Aktuell liegen keine Mobilitätsmeldungen vor.");
  newsSection("Technologie & KI", "tech", "Aktuell liegen keine Tech-Meldungen vor.");
  newsSection("Lokale Nachrichten", "local", "Aktuell liegen keine lokalen Meldungen vor.");

  sections.push({
    label: "Abschluss",
    items: [{ text: "Das war dein Briefing für heute. Gute Fahrt und einen erfolgreichen Tag!" }]
  });

  setStep("assemble", "done");
  return sections;
}

/* =========================================================================
 * Player (TTS)
 * ========================================================================= */
const Player = {
  sections: [],
  secIndex: 0,
  chunkIndex: 0,
  chunkEls: [],
  chunks: [],
  playing: false,
  token: 0,
  voice: null,

  init(sections) {
    this.sections = sections;
    this.secIndex = 0;
    this.chunkIndex = 0;
    this.playing = false;
    this.pickVoice();
    this.renderSection();
  },

  pickVoice() {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    this.voice = voices.find((v) => v.lang === "de-DE") ||
                 voices.find((v) => v.lang && v.lang.startsWith("de")) || null;
  },

  renderSection() {
    const sec = this.sections[this.secIndex];
    $("section-label").textContent = sec.label;
    $("player-progress").textContent = `${this.secIndex + 1} / ${this.sections.length} – ${sec.label}`;

    const container = $("section-content");
    container.innerHTML = "";
    this.chunkEls = [];
    this.chunks = [];

    sec.items.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = "item";
      if (item.title) {
        const titleEl = document.createElement("div");
        titleEl.className = "item-title";
        const span = document.createElement("span");
        span.className = "speak-chunk";
        span.textContent = item.title;
        titleEl.appendChild(span);
        itemEl.appendChild(titleEl);
        this.chunkEls.push(span);
        this.chunks.push(item.title);
      }
      const p = document.createElement("p");
      splitSentences(item.text).forEach((sentence) => {
        const span = document.createElement("span");
        span.className = "speak-chunk";
        span.textContent = sentence + " ";
        p.appendChild(span);
        this.chunkEls.push(span);
        this.chunks.push(sentence);
      });
      itemEl.appendChild(p);
      container.appendChild(itemEl);
    });

    $("section-content").scrollTop = 0;
  },

  highlight(i) {
    this.chunkEls.forEach((el, idx) => el.classList.toggle("speaking", idx === i));
    if (this.chunkEls[i]) {
      this.chunkEls[i].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  },

  speakCurrent() {
    if (!this.playing) return;
    if (this.chunkIndex >= this.chunks.length) {
      // Abschnitt fertig → nächster Abschnitt
      if (this.secIndex < this.sections.length - 1) {
        this.secIndex++;
        this.chunkIndex = 0;
        this.renderSection();
        this.speakCurrent();
      } else {
        this.finish();
      }
      return;
    }

    this.highlight(this.chunkIndex);
    const myToken = ++this.token;
    const u = new SpeechSynthesisUtterance(this.chunks[this.chunkIndex]);
    u.lang = "de-DE";
    u.rate = SPEECH_RATE;
    u.pitch = SPEECH_PITCH;
    if (this.voice) u.voice = this.voice;
    u.onend = () => {
      if (myToken !== this.token || !this.playing) return;
      this.chunkIndex++;
      this.speakCurrent();
    };
    u.onerror = () => {
      if (myToken !== this.token || !this.playing) return;
      this.chunkIndex++;
      this.speakCurrent();
    };
    window.speechSynthesis.speak(u);
  },

  play() {
    if (this.playing) return;
    this.playing = true;
    updatePlayPauseIcon(true);
    this.speakCurrent();
  },

  pause() {
    this.playing = false;
    this.token++; // laufende onend-Callbacks entwerten
    window.speechSynthesis.cancel();
    updatePlayPauseIcon(false);
  },

  toggle() { this.playing ? this.pause() : this.play(); },

  stopSpeech() {
    this.token++;
    window.speechSynthesis.cancel();
  },

  next() {
    if (this.secIndex >= this.sections.length - 1) return;
    const wasPlaying = this.playing;
    this.stopSpeech();
    this.secIndex++;
    this.chunkIndex = 0;
    this.renderSection();
    if (wasPlaying) { this.playing = true; this.speakCurrent(); }
  },

  prev() {
    const wasPlaying = this.playing;
    this.stopSpeech();
    // Wenn wir schon mitten im Abschnitt sind, zum Anfang dieses Abschnitts.
    if (this.chunkIndex > 0) {
      this.chunkIndex = 0;
    } else if (this.secIndex > 0) {
      this.secIndex--;
    }
    this.renderSection();
    if (wasPlaying) { this.playing = true; this.speakCurrent(); }
  },

  finish() {
    this.playing = false;
    this.highlight(-1);
    updatePlayPauseIcon(false);
  },

  stopAll() {
    this.playing = false;
    this.stopSpeech();
    updatePlayPauseIcon(false);
  }
};

function updatePlayPauseIcon(playing) {
  $("btn-playpause").textContent = playing ? "⏸" : "▶";
}

/* =========================================================================
 * Ladeschritte-UI
 * ========================================================================= */
const STEP_LABELS = {
  geo: "Standorte werden ermittelt…",
  traffic: "Verkehr wird geprüft…",
  weather: "Wetter wird geladen…",
  news: "Nachrichten werden geladen…",
  assemble: "Briefing wird zusammengestellt…"
};

function renderLoadingSteps() {
  const ul = $("loading-steps");
  ul.innerHTML = "";
  Object.keys(STEP_LABELS).forEach((key) => {
    const li = document.createElement("li");
    li.id = "step-" + key;
    li.innerHTML = `<span class="mark">○</span><span>${STEP_LABELS[key]}</span>`;
    ul.appendChild(li);
  });
}

function setStep(key, state) {
  const li = $("step-" + key);
  if (!li) return;
  li.classList.remove("active", "done");
  const mark = li.querySelector(".mark");
  if (state === "active") { li.classList.add("active"); mark.textContent = "◐"; }
  else if (state === "done") { li.classList.add("done"); mark.textContent = "✓"; }
}

/* =========================================================================
 * Ablaufsteuerung
 * ========================================================================= */
async function startBriefing() {
  // iOS: speechSynthesis muss durch eine User-Geste „aufgeweckt“ werden.
  if (window.speechSynthesis) {
    try {
      const warmup = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(warmup);
      window.speechSynthesis.cancel();
    } catch (_) {}
  }

  if (!navigator.onLine) { showScreen("offline"); return; }

  const settings = loadSettings();
  if (!settings.trafficKey) {
    $("home-warning").textContent =
      "Hinweis: Ohne Traffic API Key (TomTom) bleibt die Verkehrslage leer. Wetter und Nachrichten funktionieren trotzdem.";
    $("home-warning").classList.remove("hidden");
  }

  renderLoadingSteps();
  $("loading-error").classList.add("hidden");
  $("btn-loading-retry").classList.add("hidden");
  showScreen("loading");

  try {
    const sections = await buildBriefing(settings, setStep);
    Player.init(sections);
    showScreen("player");
    Player.play();
  } catch (err) {
    $("loading-error").textContent = "Fehler beim Erstellen des Briefings: " + (err.message || err);
    $("loading-error").classList.remove("hidden");
    $("btn-loading-retry").classList.remove("hidden");
  }
}

/* =========================================================================
 * Initialisierung
 * ========================================================================= */
function initHome() {
  const now = new Date();
  $("home-date").textContent = formatGermanDate(now);
  const day = now.getDay();
  if (day === 0 || day === 6) {
    // Wochenende
    $("home-hint").textContent = "Heute ist Wochenende.";
  }
}

function fillSettingsForm() {
  const s = loadSettings();
  $("set-home").value = s.home;
  $("set-work").value = s.work;
  $("set-traffic").value = s.trafficKey;
}

function wireEvents() {
  // Navigation per data-goto
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-goto");
      if (target === "home") {
        Player.stopAll();
        $("home-warning").classList.add("hidden");
      }
      showScreen(target);
    });
  });

  $("btn-open-settings").addEventListener("click", () => {
    fillSettingsForm();
    $("settings-saved").classList.add("hidden");
    showScreen("settings");
  });

  $("btn-start").addEventListener("click", () => {
    const day = new Date().getDay();
    if (day === 0 || day === 6) { showScreen("weekend"); return; }
    startBriefing();
  });

  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings({
      home: $("set-home").value.trim() || DEFAULT_SETTINGS.home,
      work: $("set-work").value.trim() || DEFAULT_SETTINGS.work,
      trafficKey: $("set-traffic").value.trim()
    });
    $("settings-saved").classList.remove("hidden");
  });

  // Player-Steuerung
  $("btn-playpause").addEventListener("click", () => Player.toggle());
  $("btn-next").addEventListener("click", () => Player.next());
  $("btn-prev").addEventListener("click", () => Player.prev());

  // Stimmen werden u.U. asynchron geladen
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => Player.pickVoice();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initHome();
  wireEvents();
  showScreen("home");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});
