// Baut news.json aus kostenlosen RSS/Atom-Feeds (läuft server-seitig im GitHub-Action-Job,
// daher kein CORS-Problem). Keine externen Abhängigkeiten – nur Node 20+ (global fetch).

const FEEDS = {
  world: [
    "https://www.tagesschau.de/ausland/index~rss2.xml",
    "https://www.tagesschau.de/inland/index~rss2.xml"
  ],
  economy: [
    "https://www.tagesschau.de/wirtschaft/index~rss2.xml"
  ],
  automotive: [
    "https://www.electrive.net/feed/"
  ],
  tech: [
    "https://rss.golem.de/rss.php?feed=RSS2.0",
    "https://t3n.de/rss.xml"
  ],
  local: [
    "https://www.swr.de/swraktuell/baden-wuerttemberg/index~rss2.xml",
    "https://www.tagesschau.de/inland/regional/badenwuerttemberg/index~rss2.xml"
  ]
};

const COUNTS = { world: 6, economy: 3, automotive: 3, tech: 3, local: 4 };

const LOCAL_KEYWORDS = [
  "Heidenheim", "Ulm", "Neu-Ulm", "Günzburg", "Alb-Donau", "Ostalb",
  "Aalen", "Giengen", "Pfaffenhofen", "Roth", "Schwaben"
];

const UA = "Mozilla/5.0 (compatible; MorgenBriefingBot/1.0)";

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());

    // Charset bestimmen: HTTP-Header → XML-Deklaration → UTF-8 (Fallback).
    let charset = (res.headers.get("content-type") || "").match(/charset=([^;]+)/i)?.[1];
    if (!charset) {
      const head = buf.subarray(0, 200).toString("latin1");
      charset = head.match(/encoding=["']([^"']+)["']/i)?.[1];
    }
    charset = (charset || "utf-8").toLowerCase().trim();
    try {
      return new TextDecoder(charset).decode(buf);
    } catch (_) {
      return new TextDecoder("utf-8").decode(buf);
    }
  } finally {
    clearTimeout(t);
  }
}

function pick(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

function decodeEntities(s) {
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
  s = s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // &amp; zuletzt
  return s;
}

function clean(s) {
  if (!s) return "";
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Erst Entities dekodieren (macht aus &lt;a&gt; echtes <a>), dann ALLE Tags strippen.
  s = decodeEntities(s);
  s = s.replace(/<[^>]+>/g, " ");
  // Von Feeds angehängte Kategorie-/Tracking-Reste am Ende entfernen, z. B. "(Politik, KI)".
  s = s.replace(/\(\s*[A-Za-zÄÖÜäöü/ ,.&-]+\s*\)\s*$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function truncate(s, max) {
  if (!s || s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastDot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastDot > max * 0.5 ? cut.slice(0, lastDot + 1) : cut.trim()) + " …";
}

function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[0];
    const title = clean(pick(block, "title"));
    let text = clean(pick(block, "description") || pick(block, "summary") || pick(block, "content"));
    if (!title) continue;
    // Werbung und (oft englische) Plus-Teaser überspringen.
    if (/^\(g\+\)/i.test(title) || /^anzeige\b/i.test(title) || /\bsponsored\b/i.test(title)) continue;
    // Titel-Wiederholung am Anfang der Beschreibung vermeiden
    if (text && text.startsWith(title)) text = text.slice(title.length).trim();
    items.push({ title, text: truncate(text, 350) });
  }
  return items;
}

async function collect(urls) {
  const all = [];
  const seen = new Set();
  for (const url of urls) {
    try {
      const xml = await fetchText(url);
      for (const it of parseFeed(xml)) {
        const key = it.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(it);
      }
    } catch (e) {
      console.warn(`[warn] Feed fehlgeschlagen: ${url} – ${e.message}`);
    }
  }
  return all;
}

function filterLocal(items) {
  const matches = items.filter((it) => {
    const hay = (it.title + " " + it.text).toLowerCase();
    return LOCAL_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
  });
  // Mit Top-Meldungen auffüllen, falls zu wenige regionale Treffer.
  const rest = items.filter((it) => !matches.includes(it));
  return matches.concat(rest);
}

async function main() {
  const out = { generatedAt: new Date().toISOString(), world: [], economy: [], automotive: [], tech: [], local: [] };

  for (const [cat, urls] of Object.entries(FEEDS)) {
    let items = await collect(urls);
    if (cat === "local") items = filterLocal(items);
    out[cat] = items.slice(0, COUNTS[cat]);
    console.log(`${cat}: ${out[cat].length} Meldungen`);
  }

  const total = Object.values(COUNTS).reduce((a, b, i) => a + out[Object.keys(COUNTS)[i]].length, 0);
  if (total === 0) {
    console.warn("[warn] Keine Meldungen gesammelt – news.json wird trotzdem geschrieben.");
  }

  const { writeFileSync } = await import("node:fs");
  writeFileSync("news.json", JSON.stringify(out, null, 2) + "\n");
  console.log("news.json geschrieben.");
}

main().catch((e) => {
  console.error("Fehler:", e);
  process.exit(1);
});
