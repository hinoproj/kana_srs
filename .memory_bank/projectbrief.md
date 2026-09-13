# Project Brief — kana_srs

## What this is

A standalone, offline drill app for hiragana and katakana: multiple-choice and typing questions
over a point-based SRS, delivered as a static page with no server and no build step. It is a
sibling project to `JLPT_coach` (kanji/vocabulary, FastAPI) and shares none of its code.

## Why it exists

The owner wanted kana practice on an Android tablet, usable without a network and without running
a Python server. Kana are a small, fixed set (~200 items) where the thing worth training is
recognition *speed*, which the kanji track's date-free point scheme does not measure.

## Scope

- Six decks: hiragana and katakana × basic (46) / dakuten+handakuten (25) / yōon (36)
- Three modes: kana→rōmaji MCQ, rōmaji→kana MCQ (both timed), kana→rōmaji typing (untimed)
- Typing is hiragana-only — it trains the script you actually write in
- Fixed-length runs of 10, 15 or 20 cards, selectable
- Progress kept per kana **per mode**, in the browser, with JSON export/import as the durable backup

## Requirements that shaped the design

1. **Runs on an Android tablet, offline.** Installed as a PWA from GitHub Pages (service worker
   precache, `localStorage` progress); still functional, with a warning, when `index.html` is
   opened directly over `file://`.
2. **No build step and no dependencies** — the files in the repo are the files the browser loads.
3. **Speed is the signal**: ≤3 s +5, ≤5 s +3, slower +1, wrong −5 (typing +3/−5); scores floor at 0;
   learned at 10, confident at 25.
4. **Introduction order is gojūon row order** — the earliest not-yet-learned kana are what a run
   draws, so there is no tier machinery and no mode gating.
5. **Distractors must be diagnostic**: MCQ options are biased toward genuine look-alikes
   (シ/ツ, ソ/ン, ね/れ/わ …) rather than drawn uniformly.

## Out of scope

- Vocabulary, kanji, grammar — those live in `JLPT_coach`
- Accounts, sync, any server component
- Handwriting/stroke-order practice
- Typing practice for katakana
