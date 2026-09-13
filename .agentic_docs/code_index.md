# Code Index — kana_srs

Project-wide module graph. Authoritative for module slugs, dependency edges, `crosses:`
boundaries and `group:` values: on any conflict with an `AGENTS.md`, this file wins.

## Dependency Graph

| Module | File | Layer | needs | feeds | crosses |
| --- | --- | --- | --- | --- | --- |
| kana-data | js/kana-data.js | data | — | srs, app, index, selftest | — |
| srs | js/srs.js | domain | kana-data | app, index, selftest | — |
| storage | js/storage.js | infrastructure | — | app, index | browser localStorage |
| app | js/app.js | presentation | kana-data, srs, storage, sw | index | browser DOM, service worker |
| app-css | css/app.css | presentation | — | index | — |
| index | index.html | presentation | app-css, kana-data, srs, storage, app | browser-smoke | browser DOM |
| sw | sw.js | infrastructure | — | app | Cache Storage API |
| selftest | tools/selftest.js | tooling | kana-data, srs | — | node:fs, node:vm |
| browser-smoke | tools/browser-smoke.html | tooling | index | — | browser DOM, localStorage |

## External Boundary Map

| Boundary | Modules | Notes |
| --- | --- | --- |
| browser localStorage | storage, browser-smoke | Only `storage` reads/writes app data; every access is try/guarded because `file://` origins may refuse it. The smoke test clears the key before running. |
| browser DOM | app, index, browser-smoke | All DOM work is confined to `app`; `index` supplies the nodes it expects by id. |
| service worker | app | Registration only, and skipped entirely on `file://`. |
| Cache Storage API | sw | Precaches the asset list in `sw.js`. Bump `CACHE_NAME` on release. |
| node:fs, node:vm | selftest | Evaluates the shipped browser scripts as-is, so there is no separate test build. |

## Group Registry

| Group | Meaning | Members |
| --- | --- | --- |
| data | Static content tables with no behaviour | kana-data |
| domain | Pure rules: no DOM, no storage, no I/O | srs |
| infrastructure | Talks to a browser/platform API | storage, sw |
| presentation | Screens, markup, styling, event handling | app, app-css, index |
| tooling | Developer-only checks, never shipped in the app's load path | selftest, browser-smoke |

---

## kana-data

**File**: `js/kana-data.js` · **Layer**: data

Six decks: hiragana/katakana × basic (46) / dakuten+handakuten (25) / yōon (36) = 214 kana.
Item order within a deck **is** the introduction order (gojūon rows), which is why no separate
tier table exists. Katakana decks are generated from the hiragana tables plus a glyph string, so
the two scripts cannot drift in rōmaji or in ordering.

`pr` (prompt rōmaji) differs from `r` only for ぢ/づ/ぢゃ/ぢゅ/ぢょ, which are homophones of
じ/ず/じゃ/じゅ/じょ — they prompt as `di`/`du`/`dya`… so a rōmaji prompt has exactly one right kana.

`confusionWeight(a, b)` scores how tempting `b` is as a wrong option for `a`: `SHAPE_WEIGHT` (4)
for a listed look-alike pair (compared on base glyphs, so ざ inherits さ's confusions), +2 for a
shared consonant, +1 for a shared vowel.

**Exposes**: `decks`, `deckById`, `byKey`, `SHAPE_WEIGHT`, `confusionWeight`, `baseGlyph`

## srs

**File**: `js/srs.js` · **Layer**: domain

Timed point scoring (MCQ +5/+3/+1, typed +3, wrong −5, floor 0), state thresholds
(learned 10, confident 25), run composition and question construction. Scores are held per kana
**per mode** — the three modes never share. No dates, no intervals, no mode gating.

`buildRun` takes the earliest not-learned kana in deck order plus ≤3 learned and ≤1 confident for
maintenance; those caps relax only when the deck is mastered enough that the run would otherwise
be short. `buildQuestion` draws 1–2 look-alike distractors before filling weighted at random, and
never lets two options share a rōmaji.

**Exposes**: `MODES`, `MODE_INFO`, `MODE_MCQ_K2R`, `MODE_MCQ_R2K`, `MODE_TYPE`, `FAST_MS`, `OK_MS`,
`LEARNED_AT`, `CONFIDENT_AT`, `RUN_SIZES`, `OPTION_COUNT`, `MAX_LEARNED_PER_RUN`,
`MAX_CONFIDENT_PER_RUN`, `STATE_*`, `modesForDeck`, `stateOf`, `pointsFor`, `applyPoints`,
`buildRun`, `buildQuestion`, `checkTyped`, `shuffle`

## storage

**File**: `js/storage.js` · **Layer**: infrastructure

The only module that touches `localStorage` (key `kana_srs_v1`). Every access is wrapped: a
`file://` page may refuse storage entirely, in which case `isAvailable()` is false, the app warns,
and everything runs in memory for the session. `importText` re-normalises any file it is given, so
a hand-edited or truncated export cannot corrupt the in-memory shape.

**Exposes**: `STORAGE_KEY`, `load`, `save`, `stats`, `record`, `getSettings`, `setRunSize`,
`exportText`, `importText`, `reset`, `isAvailable`, `raw`

## app

**File**: `js/app.js` · **Layer**: presentation

Screen routing, run lifecycle, timer ring, answer handling, settings/backup UI. Holds no rules of
its own: it calls `srs` for every decision and `storage` for every score. Answers are persisted
per answer rather than per run, so a sleeping tablet loses nothing.

The verdict and the summary report the points the answer **earned** (the nominal rule value), not
the net change to the stored score — a miss against a kana already at 0 would otherwise read
"Wrong +0".

## app-css

**File**: `css/app.css` · **Layer**: presentation

Tablet-first, dark by default with a light `prefers-color-scheme` palette. Contains a global
`[hidden] { display: none !important; }` because the hideable blocks set `display: flex/grid`,
which would otherwise beat the browser's `[hidden]` rule.

## index

**File**: `index.html` · **Layer**: presentation

Five `<section class="screen">` containers, the timer ring SVG, and the script order
(kana-data → srs → storage → app). Scripts are classic, not ES modules, so the page also runs
from `file://`.

## sw

**File**: `sw.js` · **Layer**: infrastructure

Cache-first precache of the asset list. Never revalidates, so `CACHE_NAME` must be bumped whenever
any precached file changes.

## selftest

**File**: `tools/selftest.js` · **Layer**: tooling

`node tools/selftest.js`. Evaluates `kana-data` and `srs` in a `vm` context and asserts deck sizes,
katakana/hiragana parity, scoring tiers, typed-answer variants, run composition caps, and
well-formed questions for every kana in every deck. No dependencies.

## browser-smoke

**File**: `tools/browser-smoke.html` · **Layer**: tooling

End-to-end UI check. Loads `../index.html` in a same-origin iframe, plays a full run, and asserts
screens, scores, persistence and the export/import round trip. Must be served over http(s).
