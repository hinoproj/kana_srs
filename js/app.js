// [MODULE] app | Controller: screen routing, run lifecycle, timer widget, answer handling, theme, backup UI
// [IFACE] layer: presentation | in: DOM events -> out: rendered screens, recorded answers, exported JSON | crosses: [browser DOM, service worker]
// [GRAPH] needs: [kana-data, srs, storage, sw] | feeds: [index] | group: presentation
// [STATE] stateful | persists: via storage module | raises: nothing

/**
 * All DOM work for the kana SRS.
 *
 * Rules live in srs.js and persistence in storage.js; this file only turns
 * events into rule calls and rule results into pixels. Answers are written
 * through to storage the moment they are given rather than at end of run, so
 * a tablet that sleeps or a tab that is evicted mid-run loses nothing.
 */
(function (global) {
  'use strict';

  var KANA_DATA = global.KANA_DATA;
  var SRS = global.KanaSRS;
  var Store = global.KanaStore;

  var CIRCUMFERENCE = 2 * Math.PI * 52;
  var ADVANCE_OK_MS = 650;
  var ADVANCE_WRONG_MS = 1700;

  // Android paints the status bar with this, so it has to follow the palette.
  var THEME_BAR_COLOR = { dark: '#11131a', light: '#f5f6fa', kids: '#fff6e5' };

  // Kids theme swaps the flat verdicts for something to grin at. Picked at
  // random so the same word does not come back ten times in one run.
  var KIDS_CHEERS = ['Yatta! ✨', 'Sugoi! 🌟', 'Nice one! 🎉', 'Yes! 🙌'];
  var KIDS_MISS = 'Not quite 🙈';

  var el = {};
  var session = null;   // { deck, mode, queue, index, results }
  var question = null;
  var timer = { start: 0, raf: 0, running: false };
  var advanceHandle = 0;

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    ['screen-home', 'screen-deck', 'screen-run', 'screen-summary', 'screen-settings',
      'deck-grid', 'deck-title', 'run-size', 'mode-list', 'storage-notice',
      'run-title', 'run-bar', 'run-count', 'timer', 'timer-bar', 'timer-value', 'timer-tier',
      'prompt', 'prompt-hint', 'options', 'type-form', 'type-input', 'verdict',
      'stat-correct', 'stat-points', 'stat-fast', 'review-list', 'summary-title',
      'storage-status', 'import-file', 'theme-picker', 'theme-color', 'summary-cheer'].forEach(function (id) {
      el[id] = $(id);
    });
  }

  // --- Theme -----------------------------------------------------------

  function isKids() {
    return Store.getSettings().theme === 'kids';
  }

  function applyTheme() {
    var theme = Store.getSettings().theme;
    document.documentElement.setAttribute('data-theme', theme);
    el['theme-color'].setAttribute('content', THEME_BAR_COLOR[theme] || THEME_BAR_COLOR.dark);
  }

  function renderThemePicker() {
    var current = Store.getSettings().theme;
    el['theme-picker'].innerHTML = '';
    Store.THEMES.forEach(function (theme) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
      b.setAttribute('aria-pressed', String(theme === current));
      b.addEventListener('click', function () {
        Store.setTheme(theme);
        applyTheme();
        renderThemePicker();
      });
      el['theme-picker'].appendChild(b);
    });
  }

  // --- Screens ---------------------------------------------------------

  function show(screenId) {
    ['screen-home', 'screen-deck', 'screen-run', 'screen-summary', 'screen-settings']
      .forEach(function (id) { el[id].hidden = id !== screenId; });
    global.scrollTo(0, 0);
  }

  /** Count kana by state for one deck/mode pair. */
  function deckStats(deck, mode) {
    var counts = { total: deck.items.length, learning: 0, learned: 0, confident: 0 };
    deck.items.forEach(function (item) {
      var state = SRS.stateOf(Store.stats(mode, item.key).score);
      if (state === SRS.STATE_CONFIDENT) counts.confident += 1;
      else if (state === SRS.STATE_LEARNED) counts.learned += 1;
      else if (state === SRS.STATE_LEARNING) counts.learning += 1;
    });
    return counts;
  }

  function meterHtml(counts) {
    var pct = function (n) { return (n / counts.total * 100).toFixed(2) + '%'; };
    return '<div class="meter">' +
      '<span class="seg-confident" style="width:' + pct(counts.confident) + '"></span>' +
      '<span class="seg-learned" style="width:' + pct(counts.learned) + '"></span>' +
      '<span class="seg-learning" style="width:' + pct(counts.learning) + '"></span>' +
      '</div>';
  }

  function renderHome() {
    el['storage-notice'].hidden = Store.isAvailable();
    el['deck-grid'].innerHTML = '';

    KANA_DATA.decks.forEach(function (deck) {
      var modes = SRS.modesForDeck(deck);
      // Deck-level mastery is the average across the modes that deck offers --
      // a deck is only "done" when every mode it has is done.
      var totals = { total: deck.items.length * modes.length, learning: 0, learned: 0, confident: 0 };
      modes.forEach(function (mode) {
        var c = deckStats(deck, mode);
        totals.learning += c.learning;
        totals.learned += c.learned;
        totals.confident += c.confident;
      });
      var known = totals.learned + totals.confident;

      var card = document.createElement('button');
      card.className = 'deck-card';
      card.type = 'button';
      card.innerHTML =
        '<div class="deck-name">' + deck.label + '</div>' +
        // Digraphs are twice as wide, so fewer of them fit on the sample line.
        '<div class="deck-sample">' + deck.items.slice(0, deck.kind === 'yoon' ? 3 : 5)
          .map(function (i) { return i.k; }).join('') + '</div>' +
        meterHtml(totals) +
        '<div class="meter-label"><span>' + deck.items.length + ' kana · ' + modes.length + ' modes</span>' +
        '<span>' + Math.round(known / totals.total * 100) + '% known</span></div>';
      card.addEventListener('click', function () { openDeck(deck); });
      el['deck-grid'].appendChild(card);
    });

    show('screen-home');
  }

  function renderRunSizes() {
    var current = Store.getSettings().runSize;
    el['run-size'].innerHTML = '';
    SRS.RUN_SIZES.forEach(function (size) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(size);
      b.setAttribute('aria-pressed', String(size === current));
      b.addEventListener('click', function () {
        Store.setRunSize(size);
        renderRunSizes();
      });
      el['run-size'].appendChild(b);
    });
  }

  var currentDeck = null;

  function openDeck(deck) {
    currentDeck = deck;
    el['deck-title'].innerHTML = deck.label + ' <span class="sub">' + deck.items.length + ' kana</span>';
    renderRunSizes();
    renderModeList();
    show('screen-deck');
  }

  function renderModeList() {
    el['mode-list'].innerHTML = '';
    SRS.modesForDeck(currentDeck).forEach(function (mode) {
      var info = SRS.MODE_INFO[mode];
      var counts = deckStats(currentDeck, mode);
      var row = document.createElement('div');
      row.className = 'mode-row';
      row.innerHTML =
        '<div><div class="mode-name">' + info.label + '</div>' +
        '<div class="mode-desc">' + info.description + '</div></div>' +
        '<div></div>' +
        '<div class="mode-progress">' + meterHtml(counts) +
        '<div class="meter-label"><span>' + counts.confident + ' confident · ' + counts.learned +
        ' learned · ' + counts.learning + ' learning</span><span>' +
        (counts.total - counts.learning - counts.learned - counts.confident) + ' new</span></div></div>';

      var start = document.createElement('button');
      start.className = 'primary';
      start.type = 'button';
      start.textContent = 'Start';
      start.addEventListener('click', function () { startRun(currentDeck, mode); });
      row.children[1].appendChild(start);

      el['mode-list'].appendChild(row);
    });
  }

  // --- Run lifecycle ---------------------------------------------------

  function startRun(deck, mode) {
    var size = Store.getSettings().runSize;
    var queue = SRS.buildRun(deck, function (key) { return Store.stats(mode, key); }, size);
    if (!queue.length) {
      global.alert('This deck has no cards to show.');
      return;
    }
    session = { deck: deck, mode: mode, queue: queue, index: 0, results: [] };
    el['run-title'].innerHTML = deck.label + ' <span class="sub">' + SRS.MODE_INFO[mode].label + '</span>';
    show('screen-run');
    nextQuestion();
  }

  function nextQuestion() {
    clearTimeout(advanceHandle);
    if (session.index >= session.queue.length) {
      finishRun();
      return;
    }
    question = SRS.buildQuestion(session.queue[session.index], session.deck, session.mode);

    el['run-count'].textContent = (session.index + 1) + ' / ' + session.queue.length;
    el['run-bar'].style.width = (session.index / session.queue.length * 100) + '%';
    el.verdict.textContent = '';
    el.verdict.removeAttribute('data-mark');

    var romajiPrompt = session.mode === SRS.MODE_MCQ_R2K;
    el.prompt.textContent = question.prompt;
    el.prompt.className = 'prompt' + (romajiPrompt ? ' romaji' : '');
    el['prompt-hint'].textContent = romajiPrompt ? 'Pick the kana' :
      (session.mode === SRS.MODE_TYPE ? 'Type the rōmaji' : 'Pick the rōmaji');

    if (question.options) {
      renderOptions();
      el.options.hidden = false;
      el['type-form'].hidden = true;
    } else {
      el.options.hidden = true;
      el['type-form'].hidden = false;
      el['type-form'].removeAttribute('data-mark');
      el['type-input'].value = '';
      el['type-input'].disabled = false;
      el['type-input'].focus();
    }

    if (question.timed) startTimer(); else stopTimer(true);
  }

  function renderOptions() {
    el.options.innerHTML = '';
    var romajiOptions = session.mode === SRS.MODE_MCQ_K2R;
    question.options.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.text;
      if (romajiOptions) b.className = 'romaji-option';
      b.addEventListener('click', function () { answerMcq(opt, b); });
      el.options.appendChild(b);
    });
  }

  // --- Timer widget ----------------------------------------------------

  /**
   * The ring drains over the 5s window that still earns bonus points and then
   * stops: past that every correct answer is worth +1, so a ring that kept
   * shrinking would imply a deadline the scoring does not actually have.
   */
  function startTimer() {
    el.timer.hidden = false;
    timer.start = performance.now();
    timer.running = true;
    tickTimer();
  }

  function tickTimer() {
    if (!timer.running) return;
    var elapsed = performance.now() - timer.start;
    var ratio = Math.min(1, elapsed / SRS.OK_MS);
    el['timer-bar'].setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * ratio));
    el['timer-value'].textContent = (elapsed / 1000).toFixed(1);

    var tier = elapsed <= SRS.FAST_MS ? 'fast' : (elapsed <= SRS.OK_MS ? 'ok' : 'slow');
    el.timer.setAttribute('data-tier', tier);
    el['timer-tier'].textContent = tier === 'fast' ? '+5' : (tier === 'ok' ? '+3' : '+1');

    timer.raf = requestAnimationFrame(tickTimer);
  }

  function stopTimer(hide) {
    timer.running = false;
    cancelAnimationFrame(timer.raf);
    if (hide) el.timer.hidden = true;
  }

  // --- Answering -------------------------------------------------------

  function answerMcq(opt, button) {
    if (!question || question.answered) return;
    var elapsed = performance.now() - timer.start;
    question.answered = true;
    stopTimer(false);

    Array.prototype.forEach.call(el.options.children, function (child) {
      child.disabled = true;
    });
    button.setAttribute('data-mark', opt.correct ? 'correct' : 'wrong');
    if (!opt.correct) {
      Array.prototype.forEach.call(el.options.children, function (child, i) {
        if (question.options[i].correct) child.setAttribute('data-mark', 'correct');
      });
    }
    commitAnswer(opt.correct, elapsed);
  }

  function answerTyped(raw) {
    if (!question || question.answered) return;
    question.answered = true;
    var correct = SRS.checkTyped(raw, question.item);
    el['type-form'].setAttribute('data-mark', correct ? 'correct' : 'wrong');
    el['type-input'].disabled = true;
    commitAnswer(correct, 0);
  }

  function commitAnswer(correct, elapsed) {
    var points = SRS.pointsFor(session.mode, correct, elapsed);
    var change = Store.record(session.mode, question.item.key, points, correct);
    Store.save();

    // Report the points the answer EARNED, not the net change to the score.
    // A wrong answer against a kana already at 0 changes nothing, and showing
    // that as "Wrong +0" reads like the miss was free.
    session.results.push({
      item: question.item,
      correct: correct,
      elapsed: elapsed,
      points: points,
      after: change.after
    });

    var headline = isKids()
      ? (correct ? KIDS_CHEERS[Math.floor(Math.random() * KIDS_CHEERS.length)] : KIDS_MISS)
      : (correct ? 'Correct' : 'Wrong');
    el.verdict.setAttribute('data-mark', correct ? 'correct' : 'wrong');
    el.verdict.innerHTML = headline + ' ' +
      (points >= 0 ? '+' : '') + points +
      '<span class="detail">' + question.item.k + ' = ' + question.item.r +
      ' · score ' + change.after + ' (' + SRS.stateOf(change.after) + ')</span>';

    session.index += 1;
    advanceHandle = setTimeout(nextQuestion, correct ? ADVANCE_OK_MS : ADVANCE_WRONG_MS);
  }

  // --- Summary ---------------------------------------------------------

  function finishRun() {
    stopTimer(true);
    var correct = session.results.filter(function (r) { return r.correct; }).length;
    var points = session.results.reduce(function (sum, r) { return sum + r.points; }, 0);
    var fast = session.results.filter(function (r) {
      return r.correct && SRS.MODE_INFO[session.mode].timed && r.elapsed <= SRS.FAST_MS;
    }).length;

    el['summary-title'].innerHTML = session.deck.label +
      ' <span class="sub">' + SRS.MODE_INFO[session.mode].label + '</span>';
    el['stat-correct'].textContent = correct + '/' + session.results.length;
    el['stat-points'].textContent = (points >= 0 ? '+' : '') + points;
    el['stat-fast'].textContent = SRS.MODE_INFO[session.mode].timed ? String(fast) : '—';

    var ratio = correct / session.results.length;
    el['summary-cheer'].hidden = !isKids();
    el['summary-cheer'].textContent = ratio >= 0.9 ? 'Amazing! 🏆' : (ratio >= 0.7 ? 'Great job! 🎉' : 'Keep going! 💪');

    el['review-list'].innerHTML = '';
    session.results.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'review-row';
      row.innerHTML =
        '<div class="kana">' + r.item.k + '</div>' +
        '<div>' + r.item.r + ' <span class="sub">· ' + SRS.stateOf(r.after) + ' (' + r.after + ')</span></div>' +
        '<div class="delta ' + (r.points >= 0 ? 'up' : 'down') + '">' +
        (r.points >= 0 ? '+' : '') + r.points + '</div>';
      el['review-list'].appendChild(row);
    });

    show('screen-summary');
  }

  // --- Settings / backup ----------------------------------------------

  function renderSettings() {
    renderThemePicker();
    el['storage-status'].textContent = Store.isAvailable()
      ? 'Progress is being saved in this browser (localStorage). Installing the page to the home screen keeps it safest.'
      : 'This browser is blocking storage for this page, so progress only lasts for the current session. Export before you close it, or serve the app over http(s) instead of opening the file directly.';
    show('screen-settings');
  }

  function exportProgress() {
    var stamp = new Date().toISOString().slice(0, 10);
    var blob = new Blob([Store.exportText()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'kana-srs-progress-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function importProgress(file) {
    var reader = new FileReader();
    reader.onload = function () {
      if (Store.importText(String(reader.result))) {
        global.alert('Progress imported.');
        renderHome();
      } else {
        global.alert('That file could not be read as a Kana SRS export.');
      }
    };
    reader.onerror = function () {
      console.error('[app.js][importProgress] file read failed: ' + reader.error);
      global.alert('Could not read that file.');
    };
    reader.readAsText(file);
  }

  // --- Wiring ----------------------------------------------------------

  function bind() {
    document.querySelectorAll('[data-nav="home"]').forEach(function (b) {
      b.addEventListener('click', renderHome);
    });
    $('btn-settings').addEventListener('click', renderSettings);
    $('btn-quit').addEventListener('click', function () {
      clearTimeout(advanceHandle);
      stopTimer(true);
      openDeck(session.deck);
    });
    $('btn-again').addEventListener('click', function () { startRun(session.deck, session.mode); });
    $('btn-to-deck').addEventListener('click', function () { openDeck(session.deck); });
    $('btn-export').addEventListener('click', exportProgress);
    $('btn-import').addEventListener('click', function () { el['import-file'].click(); });
    el['import-file'].addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importProgress(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-reset').addEventListener('click', function () {
      if (global.confirm('Erase all progress in every deck and mode? This cannot be undone.')) {
        Store.reset();
        renderHome();
      }
    });
    el['type-form'].addEventListener('submit', function (e) {
      e.preventDefault();
      if (question && question.answered) return;
      answerTyped(el['type-input'].value);
    });
  }

  function registerServiceWorker() {
    // file:// has no service worker support; skip silently rather than erroring.
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('[app.js][registerServiceWorker] offline cache unavailable: ' + err.message);
    });
  }

  function init() {
    cacheDom();
    Store.load();
    applyTheme();
    bind();
    renderHome();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
