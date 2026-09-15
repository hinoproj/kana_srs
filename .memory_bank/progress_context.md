# Progress Context — kana_srs

## [2026-09-15] Themes: Dark / Light / Kids switcher in Settings

- `css/app.css`: palettes moved from a `prefers-color-scheme` media query to explicit
  `:root[data-theme="dark|light|kids"]` blocks; kids adds a warm gradient body, coral/teal accents,
  bolder options, a pop animation on the correct option and a shake on a wrong one.
- `js/storage.js`: `settings.theme` (validated against `THEMES`, default `dark`), `setTheme()`;
  unknown values in an import fall back to the default.
- `js/app.js`: `applyTheme()` stamps `<html data-theme>` and rewrites the `theme-color` meta;
  theme picker (segmented control) in Settings; kids-only verdict cheers (Yatta!/Sugoi!/…) and a
  summary line (Amazing!/Great job!/Keep going!).
- `index.html`: Theme panel, `#summary-cheer`, id on the theme-color meta. `sw.js`: `CACHE_NAME`
  bumped to v2.
- Verified: selftest still 45/45; browser smoke extended with 9 theme assertions (33/33 pass);
  screenshots of home/run/summary/settings reviewed in all three themes.

## [2026-09-13] Project created: full kana SRS app, first working version

Built the whole app from an empty repository in one session.

**Shipped**

- `js/kana-data.js` — 214 kana across 6 decks (hiragana/katakana × basic 46 / dakuten 25 /
  yōon 36), katakana generated from the hiragana tables so the two cannot drift; Hepburn plus
  accepted Nihon-shiki/wāpuro spellings; shape-confusion groups with base-glyph inheritance.
- `js/srs.js` — timed scoring (+5 ≤3 s, +3 ≤5 s, +1 slower, −5 wrong; typed +3/−5; floor 0),
  states (learned 10, confident 25), per-kana-per-mode scores, run composition
  (≤3 learned + ≤1 confident + earliest not-learned in row order), question building.
- `js/storage.js` — guarded `localStorage` (`kana_srs_v1`) with in-memory fallback, plus JSON
  export/import and reset.
- `js/app.js`, `index.html`, `css/app.css` — five screens (home, deck, run, summary, settings),
  SVG timer ring that tiers green/amber/grey at 3 s and 5 s, tablet-sized touch targets, dark
  and light palettes.
- `sw.js` + `manifest.webmanifest` + `icon.svg` — installable offline PWA.
- `tools/selftest.js` (45 assertions, Node, no deps) and `tools/browser-smoke.html` (24 assertions,
  drives a real run in an iframe).

**Decisions made with the owner**

Split dakuten and yōon into their own decks rather than one "advanced" deck; typing mode on
hiragana only; no mode gating; soft timer (the ring stops at 5 s, no auto-fail); score floor 0;
run lengths 10/15/20; row-order introduction without a fixed new-kana cap per run; confusable-
weighted distractors; accept rōmaji spelling variants; ship export/import backup.

**Bugs found and fixed during verification**

- Distractor sampling could offer two options with the same rōmaji (ぢ/じ, づ/ず) because the
  eligibility filter was applied once per batch instead of once per pick.
- Pure weighted sampling surfaced a genuine look-alike only ~20 % of the time; questions now draw
  1–2 distractors directly from the confusion set.
- `.type-form { display: flex }` beat the browser's `[hidden]` rule, leaving the typing input
  visible during multiple choice; added a global `[hidden] { display: none !important }`.
- A miss on a kana already at score 0 displayed "Wrong +0"; the verdict and summary now report the
  points the answer earned rather than the clipped net change.

**Verified**

`node tools/selftest.js` — all 45 checks pass. `tools/browser-smoke.html` in headless Chrome —
all 24 checks pass, including a full 10-card run scoring +50, persistence to `localStorage`, the
0 floor, typed answers, the katakana deck offering only 2 modes, and an export/import round trip.
Screenshots of every screen reviewed.

**Not done**

Nothing pushed to GitHub yet; GitHub Pages not enabled (owner action). Never run on the actual
tablet — all verification was desktop Chrome, headless.
