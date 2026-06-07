#!/usr/bin/env python3
"""Genera MP3 di pronuncia (Microsoft Neural) per il vocabolario."""
import asyncio
import json
import re
import unicodedata
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
PHRASES_PATH = ROOT / "data" / "vocabulary-phrases.json"
OUT_DIR = ROOT / "assets" / "audio" / "vocab"
MANIFEST_PATH = ROOT / "data" / "vocabulary-audio.json"


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text)
    t = t.encode("ascii", "ignore").decode("ascii")
    t = t.lower().strip()
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-") or "phrase"


def phrase_key(lang: str, text: str) -> str:
    return f"{lang}/{slugify(text)}"


async def generate_one(voice: str, text: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(out_path))


async def main() -> None:
    data = json.loads(PHRASES_PATH.read_text(encoding="utf-8"))
    voices = data["voices"]
    clips: dict[str, str] = {}
    seen: set[str] = set()

    for item in data["phrases"]:
        lang = item["lang"]
        text = item["text"].strip()
        key = phrase_key(lang, text)
        if key in seen:
            continue
        seen.add(key)
        rel = f"assets/audio/vocab/{key}.mp3"
        out_path = ROOT / rel
        voice = voices[lang]
        print(f"  {voice}: {text}")
        await generate_one(voice, text, out_path)
        clips[key] = rel.replace("\\", "/")

    manifest = {
        "version": 1,
        "engine": "edge-tts-neural",
        "voices": voices,
        "clips": clips,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ {len(clips)} clip → {MANIFEST_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    asyncio.run(main())
