// [MODULE] storage | Progress persistence: best-effort localStorage plus explicit JSON export/import
// [IFACE] layer: infrastructure | in: mode/kana score updates, settings (run size, theme), imported JSON -> out: stats reads, export text | crosses: [browser localStorage]
// [GRAPH] needs: [] | feeds: [app, index] | group: infrastructure
// [STATE] stateful | persists: localStorage key kana_srs_v1 | raises: nothing (all storage access is try/guarded)

/**
 * Progress storage.
 *
 * Every read and write is wrapped: a page opened over file:// gets an opaque
 * origin, where localStorage is unavailable in some browsers and throws on
 * access in others. The app must stay fully usable in that case -- it simply
 * runs in memory for the session -- so `available` is reported to the UI and
 * the JSON export/import is the guaranteed-durable path regardless.
 *
 * Shape:
 *   { version, settings: {runSize, theme}, progress: { <mode>: { <kana>: entry } } }
 *   entry = { score, seen, right, lastSeen }  (lastSeen = epoch ms)
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'kana_srs_v1';
  var VERSION = 1;
  var DEFAULT_RUN_SIZE = 15;

  // Theme ids double as the data-theme value css/app.css keys its palettes on.
  var THEMES = ['dark', 'light', 'kids'];
  var DEFAULT_THEME = 'dark';

  var EMPTY_ENTRY = { score: 0, seen: 0, right: 0, lastSeen: 0 };

  var available = false;
  var state = blankState();

  function blankState() {
    return { version: VERSION, settings: { runSize: DEFAULT_RUN_SIZE, theme: DEFAULT_THEME }, progress: {}, updatedAt: 0 };
  }

  function backend() {
    try {
      var ls = global.localStorage;
      if (!ls) return null;
      var probe = '__kana_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (err) {
      console.warn('[storage.js][backend] localStorage unavailable, running in memory: ' + err.message);
      return null;
    }
  }

  function normalize(raw) {
    var next = blankState();
    if (!raw || typeof raw !== 'object') return next;
    if (raw.settings && typeof raw.settings.runSize === 'number') {
      next.settings.runSize = raw.settings.runSize;
    }
    if (raw.settings && THEMES.indexOf(raw.settings.theme) >= 0) {
      next.settings.theme = raw.settings.theme;
    }
    if (raw.progress && typeof raw.progress === 'object') {
      Object.keys(raw.progress).forEach(function (mode) {
        var modeEntries = raw.progress[mode];
        if (!modeEntries || typeof modeEntries !== 'object') return;
        next.progress[mode] = {};
        Object.keys(modeEntries).forEach(function (key) {
          var e = modeEntries[key] || {};
          next.progress[mode][key] = {
            score: Math.max(0, Number(e.score) || 0),
            seen: Number(e.seen) || 0,
            right: Number(e.right) || 0,
            lastSeen: Number(e.lastSeen) || 0
          };
        });
      });
    }
    next.updatedAt = Number(raw.updatedAt) || 0;
    return next;
  }

  function load() {
    var ls = backend();
    available = !!ls;
    if (!ls) return state;
    try {
      var text = ls.getItem(STORAGE_KEY);
      state = text ? normalize(JSON.parse(text)) : blankState();
    } catch (err) {
      console.error('[storage.js][load] could not read saved progress, starting fresh: ' + err.message);
      state = blankState();
    }
    return state;
  }

  function save() {
    state.updatedAt = Date.now();
    if (!available) return false;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('[storage.js][save] could not persist progress: ' + err.message);
      available = false;
      return false;
    }
  }

  function stats(mode, key) {
    var modeEntries = state.progress[mode];
    var entry = modeEntries && modeEntries[key];
    return entry || EMPTY_ENTRY;
  }

  /** Apply an answer's points and return {before, after} scores. */
  function record(mode, key, points, correct) {
    if (!state.progress[mode]) state.progress[mode] = {};
    var entry = state.progress[mode][key];
    if (!entry) {
      entry = { score: 0, seen: 0, right: 0, lastSeen: 0 };
      state.progress[mode][key] = entry;
    }
    var before = entry.score;
    entry.score = Math.max(0, entry.score + points);
    entry.seen += 1;
    if (correct) entry.right += 1;
    entry.lastSeen = Date.now();
    return { before: before, after: entry.score };
  }

  function getSettings() {
    return state.settings;
  }

  function setRunSize(size) {
    state.settings.runSize = size;
    save();
  }

  function setTheme(theme) {
    if (THEMES.indexOf(theme) < 0) {
      console.warn('[storage.js][setTheme] unknown theme ignored: ' + theme);
      return;
    }
    state.settings.theme = theme;
    save();
  }

  function exportText() {
    return JSON.stringify(state, null, 2);
  }

  /** Replace all progress with an exported file's contents. Returns true on success. */
  function importText(text) {
    try {
      state = normalize(JSON.parse(text));
      save();
      return true;
    } catch (err) {
      console.error('[storage.js][importText] import failed: ' + err.message);
      return false;
    }
  }

  function reset() {
    state = blankState();
    save();
  }

  global.KanaStore = {
    STORAGE_KEY: STORAGE_KEY,
    THEMES: THEMES,
    load: load,
    save: save,
    stats: stats,
    record: record,
    getSettings: getSettings,
    setRunSize: setRunSize,
    setTheme: setTheme,
    exportText: exportText,
    importText: importText,
    reset: reset,
    isAvailable: function () { return available; },
    raw: function () { return state; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
