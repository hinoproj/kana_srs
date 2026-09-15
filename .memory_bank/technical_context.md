# Technical Context — kana_srs

## Stack

Plain HTML/CSS/JavaScript (ES5-style, classic scripts). No framework, no bundler, no package
manager, no runtime or dev dependencies. Node is used only to run `tools/selftest.js`.

## Architecture

Four shipped layers, loaded in order by `index.html`:

```
kana-data.js   static tables (214 kana, 6 decks, confusion weights)
    ↓
srs.js         pure rules: scoring, states, run composition, question building
    ↓
app.js         all DOM work: screens, timer, answers, backup UI      ← storage.js (localStorage)
```

Plus `sw.js` (precache for the installed PWA) and `css/app.css`. Full graph, boundaries and
per-module notes: `.agentic_docs/code_index.md`.

The split is deliberate and enforced by `AGENTS.md`: rules stay testable in Node without a DOM,
and the DOM layer holds no rules.

## Key decisions

- **Classic scripts, not ES modules.** `file://` blocks module imports; opening the page directly
  is a supported path, so modules would break the fallback.
- **Own scoring scheme, not the kanji track's.** Kana are recognition-speed items: the timer tiers
  (3 s / 5 s) *are* the grading signal, replacing the kanji SRS's self-assessed 4-button grade.
- **Per-kana-per-mode scores.** Recognising か instantly implies nothing about typing it, so the
  three modes keep independent scores; the saved progress map is keyed by mode first.
- **No introduction tiers and no mode gating.** Deck order is gojūon row order and runs draw the
  earliest not-learned kana, which produces the drip-feed for free. With ~46 kana per deck, the
  kanji track's tier/unlock machinery would only add state to keep in sync.
- **Look-alike distractors.** Uniform sampling put a genuine confusable on screen only ~20 % of the
  time in a 46-kana deck; questions now draw 1–2 options from the answer's shape-confusion set.
- **Homophone guard.** ぢ/じ and づ/ず share rōmaji, so options are deduplicated by `r`, and the
  rōmaji-prompt direction shows the wāpuro forms (`di`, `du`, `dya`…) to keep one right answer.
- **Themes are an explicit setting, not OS-derived.** Dark / Light / Kids are chosen in Settings
  and stored with progress; `prefers-color-scheme` is ignored so a tablet handed to a child does
  not change look when the system theme flips. Kids is palette + playful feedback strings only —
  same layout, same system font, no bundled assets.
- **Storage is best-effort with a guaranteed manual path.** `localStorage` under `file://` is
  unreliable (opaque origin: refused in some browsers, throws in others), so every access is
  guarded, the UI states the situation, and JSON export/import is the durable backup.

## Deployment

GitHub Pages from `main` (root) → open on the tablet → *Add to Home screen*. The service worker
precaches everything on first load; afterwards it runs with no network. `CACHE_NAME` in `sw.js`
must be bumped whenever a precached file changes, since the fetch handler is cache-first and never
revalidates.

## Verification

- `node tools/selftest.js` — deck tables, scoring tiers, typed-answer variants, run caps, question
  well-formedness for every kana in every deck
- `tools/browser-smoke.html` served over http(s) — drives a real run in an iframe and asserts
  screens, persistence and the export/import round trip

There is no test runner or CI; both are single files run by hand.
