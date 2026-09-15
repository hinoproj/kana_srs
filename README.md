# Kana SRS

A standalone, offline hiragana/katakana drill app. One static page, no server, no build step —
open it in a browser and it runs.

## Decks

| Deck | Kana | Modes |
| --- | --- | --- |
| Hiragana · basic | 46 | Read, Recall, Type |
| Hiragana · dakuten | 25 | Read, Recall, Type |
| Hiragana · yōon | 36 | Read, Recall, Type |
| Katakana · basic | 46 | Read, Recall |
| Katakana · dakuten | 25 | Read, Recall |
| Katakana · yōon | 36 | Read, Recall |

Modes: **Read** (kana → pick rōmaji), **Recall** (rōmaji → pick kana), **Type** (kana → type rōmaji).
Type mode is hiragana only. Every mode keeps its own score for every kana — the three never share.

## Scoring

| | Correct | Wrong |
| --- | --- | --- |
| Multiple choice | ≤3s **+5** · ≤5s **+3** · slower **+1** | **−5** |
| Typing (untimed) | **+3** | **−5** |

Scores floor at 0. `learned` at 10, `confident` at 25.

A run is 10, 15 or 20 cards: at most 3 already-learned kana and 1 confident kana ride along for
maintenance, and the rest are the earliest not-yet-learned kana in gojūon row order. That row order
is the whole introduction schedule — there are no tiers and no locked modes.

Typed answers accept Nihon-shiki and wāpuro spellings as well as Hepburn (`si`/`shi`, `tu`/`tsu`,
`sya`/`sha`, `zi`/`ji`, `nn`/`n`).

## Themes

Settings → Theme: **Dark** (default), **Light**, or **Kids** — a warmer palette that cheers on
correct answers. The choice is saved with your progress and follows an export/import. The OS
colour scheme is ignored on purpose.

## Running it on a tablet

**Recommended — install it as an app.** Publish this repo with GitHub Pages
(Settings → Pages → deploy from `main`, root), open the Pages URL in Chrome on the tablet, then
use the browser menu → *Add to Home screen*. The service worker caches everything on first load,
so afterwards it opens and works with no network. Progress is kept in `localStorage` for that
origin, which survives app restarts and reboots.

**Also works — opening `index.html` directly** from the filesystem. Everything runs, but `file://`
pages get an opaque origin: some browsers refuse to let them store anything, and there is no
service worker. The app detects this, warns on the home screen, and keeps progress in memory for
the session only. Export before closing if you go this route.

Either way, **Settings → Export progress** writes a JSON file, and **Import progress** restores it —
the only backup that survives clearing site data or switching devices.

## Development

```
node tools/selftest.js      # data tables + SRS rules, no dependencies
```

For the UI, serve the repo root with any static server and open
`http://127.0.0.1:<port>/tools/browser-smoke.html` — it drives a real run in an iframe and prints
`SMOKE PASSED` / `SMOKE FAILED`. It clears saved progress in that browser profile before running.

No build, no bundler, no package manager. The browser loads the same files that ship — plain
classic scripts, deliberately not ES modules, because ES module imports are blocked on `file://`.

After changing any file listed in `sw.js`, bump `CACHE_NAME` there or installed copies will keep
serving the old bundle.
