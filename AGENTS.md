# AGENTS.md — kana_srs (root)

Binding local contract for this repository. Read this before editing anything here.

## Bootstrap

- Project context: `.memory_bank/` — `projectbrief.md`, `technical_context.md`, `progress_context.md`
- Module graph, boundary map, group registry: `.agentic_docs/code_index.md` (**authoritative** —
  it wins over this file on any conflict about module names, edges or groups)
- Per-file 4-line headers (`[MODULE]`/`[IFACE]`/`[GRAPH]`/`[STATE]`) sit at the top of every
  source file, including `index.html`, `css/app.css` and the tools

This repo is small enough to have no child `AGENTS.md`. If a directory grows its own conventions,
add one and register it in the Child Index below.

## Local contracts

1. **No build step, ever.** The browser loads exactly the files in the repo. No bundler, no
   transpiler, no `package.json`, no dependencies — runtime or dev.
2. **Classic scripts only, no ES modules.** `import`/`export` are blocked on `file://`, and
   opening `index.html` directly is a supported way to run this app. Modules attach a single
   global (`KANA_DATA`, `KanaSRS`, `KanaStore`) from inside an IIFE.
3. **Layer split is hard**: `kana-data` (tables) → `srs` (pure rules) → `app` (DOM). `srs` must
   never touch the DOM or storage; `app` must never contain a scoring or selection rule. New
   rules go in `srs.js` and get a `tools/selftest.js` assertion in the same change.
4. **`storage.js` is the only module allowed to touch `localStorage`**, and every access stays
   inside try/catch. The app must remain fully usable when storage is unavailable.
5. **Never break the export format silently.** `kana_srs_v1` is a user's only durable backup. A
   shape change needs a new key plus a migration in `normalize()`, not an in-place redefinition.
6. **Bump `CACHE_NAME` in `sw.js`** in any change that touches a file listed in its `ASSETS`
   array. Cache-first never revalidates, so skipping this ships nothing to installed tablets.
7. **Tests before "done".** `node tools/selftest.js` must pass, and any change to screens, run
   flow or persistence must also pass `tools/browser-smoke.html` served over http(s).
8. Error/warning logs use the project-wide format:
   `[<filename>][<functionName>] <message>: <error>`.

## Cross-cutting relations

| Change this | Must co-edit | Why |
| --- | --- | --- |
| `js/kana-data.js` deck ids, item shape or `SHAPE_WEIGHT` | `js/srs.js`, `tools/selftest.js` | `srs` reads `item.r`/`item.pr`/`consonant`/`vowel` and compares weights against `SHAPE_WEIGHT`; the selftest asserts deck sizes and parity. |
| `js/srs.js` mode ids or `MODE_INFO` | `js/app.js`, `js/storage.js` consumers | Mode ids are the top-level keys of the saved progress map — renaming one orphans that mode's scores in every existing export. |
| Any file in `sw.js` `ASSETS` | `sw.js` (`CACHE_NAME`) | Installed copies otherwise keep serving the old bundle. |
| New element ids in `index.html` | `js/app.js` `cacheDom()` | `app` looks up every node by id at boot. |
| Scoring constants in `js/srs.js` | `index.html` Settings panel, `README.md` | The rules are printed to the user in two places; drift makes the app lie about its own scoring. |
| `THEMES` in `js/storage.js` | `css/app.css` `:root[data-theme=…]` blocks, `js/app.js` `THEME_BAR_COLOR` | A theme id is the `data-theme` value the palette is keyed on and the key of its status-bar colour; adding one without all three gives an unstyled page. |

## Verification

```bash
node tools/selftest.js                    # data tables + rules, no dependencies

# UI check (needs any static server on the repo root)
# then open http://127.0.0.1:<port>/tools/browser-smoke.html and read the result block
```

The smoke page ends with `SMOKE PASSED` or `SMOKE FAILED`. It clears `kana_srs_v1` when it runs,
so do not point it at a browser profile holding real progress you care about.

## Child Index

_None._ Add child `AGENTS.md` files here if a subdirectory grows its own conventions.
