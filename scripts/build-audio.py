#!/usr/bin/env python3
"""Erzeugt aus news.json natürliche MP3s pro Kategorie via edge-tts
(kostenlose Microsoft-Neural-Stimmen, kein API-Key).

Läuft server-seitig im GitHub-Action-Job. Fehler einzelner Kategorien sind
nicht fatal – die App fällt für fehlende MP3s automatisch auf die
Gerätestimme zurück.
"""
import asyncio
import json
import os
import sys

VOICE = "de-DE-ConradNeural"  # natürliche männliche Stimme; Alternative: de-DE-KatjaNeural (weiblich)
RATE = "-8%"                  # etwas ruhiger – leichter zu folgen
CATEGORIES = ["world", "economy", "automotive", "tech", "local"]


def build_text(items):
    parts = []
    for it in items:
        title = (it.get("title") or "").strip()
        text = (it.get("text") or "").strip()
        if title and not title.endswith((".", "!", "?")):
            title += "."
        parts.append((title + " " + text).strip())
    # Etwas Pause zwischen Meldungen durch Punkt/Umbruch.
    return "\n".join(parts).strip()


async def synth(edge_tts, cat, items):
    text = build_text(items)
    if not text:
        return False
    out = f"news-{cat}.mp3"
    try:
        comm = edge_tts.Communicate(text, VOICE, rate=RATE)
        await comm.save(out)
        size = os.path.getsize(out) if os.path.exists(out) else 0
        if size < 1000:  # offensichtlich fehlgeschlagen
            print(f"[warn] {out} zu klein ({size} Bytes) – wird entfernt.")
            if os.path.exists(out):
                os.remove(out)
            return False
        print(f"{out}: {size} Bytes")
        return True
    except Exception as e:  # pragma: no cover
        print(f"[warn] Audio für '{cat}' fehlgeschlagen: {e}")
        if os.path.exists(out):
            os.remove(out)
        return False


async def main():
    try:
        import edge_tts  # noqa
    except Exception as e:
        print(f"[warn] edge-tts nicht verfügbar: {e} – überspringe Audio.")
        return

    with open("news.json", encoding="utf-8") as f:
        data = json.load(f)

    ok = 0
    for cat in CATEGORIES:
        if await synth(edge_tts, cat, data.get(cat) or []):
            ok += 1
    print(f"{ok} von {len(CATEGORIES)} Audio-Dateien erzeugt.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        # Niemals den Deploy wegen Audio abbrechen.
        print(f"[warn] Audio-Build übersprungen: {e}")
        sys.exit(0)
