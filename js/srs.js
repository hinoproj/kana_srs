// [MODULE] srs | Pure SRS rules: timed point scoring, kana states, run composition, question construction
// [IFACE] layer: domain | in: item/score/elapsed values -> out: points, state, run item list, question object | crosses: []
// [GRAPH] needs: [kana-data] | feeds: [app, index, selftest] | group: domain
// [STATE] stateless | persists: nothing | raises: nothing

/**
 * Kana SRS rules.
 *
 * Deliberately NOT SuperMemo-2 and not the point/run-count scheme used by the
 * kanji track in JLPT_coach. Kana are ~180 items of pure recognition speed, so
 * the signal we care about is HOW FAST the answer comes, not when it is due:
 *
 *   MCQ      correct <=3s  +5 | <=5s  +3 | slower  +1 | wrong  -5
 *   Type     correct       +3                         | wrong  -5
 *
 * Scores float at 0 (a bad session cannot bury a kana in debt) and are kept
 * per kana PER MODE -- recognising か instantly says nothing about being able
 * to type it, so the three modes never share a score.
 *
 *   new 0 | learning 1-9 | learned 10-24 | confident 25+
 *
 * There is no introduction tier and no mode gating: runs pull the earliest
 * not-yet-learned kana in gojuon row order, which is the drip-feed.
 */
(function (global) {
  'use strict';

  var KANA_DATA = global.KANA_DATA;

  var MODE_MCQ_K2R = 'mcq_k2r';
  var MODE_MCQ_R2K = 'mcq_r2k';
  var MODE_TYPE = 'type_k2r';

  var MODES = [MODE_MCQ_K2R, MODE_MCQ_R2K, MODE_TYPE];

  var MODE_INFO = {};
  MODE_INFO[MODE_MCQ_K2R] = {
    id: MODE_MCQ_K2R,
    label: 'Read',
    description: 'See the kana, pick its rōmaji.',
    timed: true
  };
  MODE_INFO[MODE_MCQ_R2K] = {
    id: MODE_MCQ_R2K,
    label: 'Recall',
    description: 'See the rōmaji, pick the kana.',
    timed: true
  };
  MODE_INFO[MODE_TYPE] = {
    id: MODE_TYPE,
    label: 'Type',
    description: 'See the kana, type its rōmaji.',
    timed: false
  };

  // Timed reward tiers, in milliseconds from question render to answer tap.
  var FAST_MS = 3000;
  var OK_MS = 5000;

  var POINTS_FAST = 5;
  var POINTS_OK = 3;
  var POINTS_SLOW = 1;
  var POINTS_TYPED = 3;
  var POINTS_WRONG = -5;

  var LEARNED_AT = 10;
  var CONFIDENT_AT = 25;

  var STATE_NEW = 'new';
  var STATE_LEARNING = 'learning';
  var STATE_LEARNED = 'learned';
  var STATE_CONFIDENT = 'confident';

  // Run composition: how many already-known kana may ride along per run.
  var MAX_LEARNED_PER_RUN = 3;
  var MAX_CONFIDENT_PER_RUN = 1;

  var RUN_SIZES = [10, 15, 20];
  var OPTION_COUNT = 4;

  /** Type mode asks for rōmaji from kana, which only makes sense for the script you write in. */
  function modesForDeck(deck) {
    return deck.script === 'hiragana' ? MODES.slice() : [MODE_MCQ_K2R, MODE_MCQ_R2K];
  }

  function stateOf(score) {
    if (score >= CONFIDENT_AT) return STATE_CONFIDENT;
    if (score >= LEARNED_AT) return STATE_LEARNED;
    if (score > 0) return STATE_LEARNING;
    return STATE_NEW;
  }

  /** Points an answer earns. `elapsedMs` is ignored by untimed modes. */
  function pointsFor(mode, correct, elapsedMs) {
    if (!correct) return POINTS_WRONG;
    if (!MODE_INFO[mode].timed) return POINTS_TYPED;
    if (elapsedMs <= FAST_MS) return POINTS_FAST;
    if (elapsedMs <= OK_MS) return POINTS_OK;
    return POINTS_SLOW;
  }

  /** Apply points to a score, keeping the 0 floor. */
  function applyPoints(score, points) {
    return Math.max(0, (score || 0) + points);
  }

  function shuffle(list, rng) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /**
   * Compose one run.
   *
   * `stats(key)` returns {score, lastSeen} for a kana in the mode being run.
   * Fills the run with the earliest not-yet-learned kana in deck order, plus at
   * most MAX_LEARNED_PER_RUN learned and MAX_CONFIDENT_PER_RUN confident kana
   * as maintenance. When the deck is (nearly) mastered there are not enough
   * not-learned kana left, so those caps are relaxed to reach `size` -- the
   * alternative is a run that silently gets shorter as you improve.
   */
  function buildRun(deck, stats, size, rng) {
    rng = rng || Math.random;
    var notLearned = [];
    var learned = [];
    var confident = [];

    deck.items.forEach(function (item) {
      var st = stats(item.key);
      var state = stateOf(st.score);
      if (state === STATE_CONFIDENT) confident.push(item);
      else if (state === STATE_LEARNED) learned.push(item);
      else notLearned.push(item);
    });

    // Maintenance picks: stalest first, so review rotates instead of repeating.
    var staleFirst = function (a, b) {
      var sa = stats(a.key), sb = stats(b.key);
      return (sa.lastSeen || 0) - (sb.lastSeen || 0) || sa.score - sb.score;
    };
    learned.sort(staleFirst);
    confident.sort(staleFirst);

    var takeConfident = Math.min(MAX_CONFIDENT_PER_RUN, confident.length);
    var takeLearned = Math.min(MAX_LEARNED_PER_RUN, learned.length);
    var takeNew = Math.max(0, size - takeConfident - takeLearned);

    // notLearned is already in deck (gojuon row) order -- that IS the syllabus.
    var picked = notLearned.slice(0, takeNew)
      .concat(learned.slice(0, takeLearned))
      .concat(confident.slice(0, takeConfident));

    // Deck nearly mastered: backfill from the maintenance pools, stalest first.
    if (picked.length < size) {
      var chosen = {};
      picked.forEach(function (i) { chosen[i.key] = true; });
      var rest = learned.concat(confident).filter(function (i) { return !chosen[i.key]; });
      picked = picked.concat(rest.slice(0, size - picked.length));
    }

    return shuffle(picked, rng);
  }

  /** Weighted sample without replacement; weight 0 items stay eligible but unlikely. */
  function weightedPick(candidates, weightOf, count, rng) {
    var pool = candidates.slice();
    var picked = [];
    while (picked.length < count && pool.length) {
      var weights = pool.map(function (c) { return weightOf(c) + 1; });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var roll = rng() * total;
      var idx = 0;
      while (idx < pool.length - 1 && roll >= weights[idx]) {
        roll -= weights[idx];
        idx++;
      }
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return picked;
  }

  /**
   * Build one question.
   *
   * Distractors come from the same deck, with one or two drawn from the
   * answer's look-alikes whenever the deck has any -- pure weighted sampling
   * put a genuine confusable on screen only ~20% of the time in a 46-kana
   * deck, which is not often enough for the question to test shape at all.
   *
   * No two options may share a romaji: ぢ/じ and づ/ず are homophones, so the
   * answer's twin would render an identical option (kana->romaji) or a second
   * correct answer (romaji->kana).
   */
  function buildQuestion(item, deck, mode, rng) {
    rng = rng || Math.random;
    var info = MODE_INFO[mode];

    if (mode === MODE_TYPE) {
      return { item: item, mode: mode, prompt: item.k, answer: item.r, options: null, timed: info.timed };
    }

    var kanaPrompt = mode === MODE_MCQ_K2R;
    var weightOf = function (other) { return KANA_DATA.confusionWeight(item, other); };
    var candidates = deck.items.filter(function (other) { return other.key !== item.key; });

    var usedRomaji = {};
    usedRomaji[item.r] = true;
    var distractors = [];

    // One at a time: the eligibility filter has to be re-applied after every
    // pick, or two distractors drawn together can be homophones of each other
    // (ぢ and じ are both "ji", and neither is the answer).
    function draw(pool, count) {
      for (var n = 0; n < count; n++) {
        var eligible = pool.filter(function (c) { return !usedRomaji[c.r]; });
        if (!eligible.length) return;
        var chosen = weightedPick(eligible, weightOf, 1, rng)[0];
        usedRomaji[chosen.r] = true;
        distractors.push(chosen);
      }
    }

    var lookAlikes = candidates.filter(function (c) {
      return weightOf(c) >= KANA_DATA.SHAPE_WEIGHT;
    });
    // One or two look-alikes, so the same pair of wrong options does not come
    // back every single time a kana with few confusables is asked.
    draw(lookAlikes, Math.min(lookAlikes.length, 1 + Math.floor(rng() * 2)));
    draw(candidates, OPTION_COUNT - 1 - distractors.length);

    var options = shuffle([item].concat(distractors), rng).map(function (opt) {
      return { key: opt.key, text: kanaPrompt ? opt.r : opt.k, correct: opt.key === item.key };
    });

    return {
      item: item,
      mode: mode,
      prompt: kanaPrompt ? item.k : item.pr,
      answer: kanaPrompt ? item.r : item.k,
      options: options,
      timed: info.timed
    };
  }

  /** Typed answers accept Nihon-shiki/wapuro spellings, not just Hepburn. */
  function checkTyped(input, item) {
    var norm = String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[\s\-'’_]/g, '');
    if (!norm) return false;
    return item.accept.indexOf(norm) >= 0;
  }

  global.KanaSRS = {
    MODE_MCQ_K2R: MODE_MCQ_K2R,
    MODE_MCQ_R2K: MODE_MCQ_R2K,
    MODE_TYPE: MODE_TYPE,
    MODES: MODES,
    MODE_INFO: MODE_INFO,
    FAST_MS: FAST_MS,
    OK_MS: OK_MS,
    LEARNED_AT: LEARNED_AT,
    CONFIDENT_AT: CONFIDENT_AT,
    RUN_SIZES: RUN_SIZES,
    OPTION_COUNT: OPTION_COUNT,
    MAX_LEARNED_PER_RUN: MAX_LEARNED_PER_RUN,
    MAX_CONFIDENT_PER_RUN: MAX_CONFIDENT_PER_RUN,
    STATE_NEW: STATE_NEW,
    STATE_LEARNING: STATE_LEARNING,
    STATE_LEARNED: STATE_LEARNED,
    STATE_CONFIDENT: STATE_CONFIDENT,
    modesForDeck: modesForDeck,
    stateOf: stateOf,
    pointsFor: pointsFor,
    applyPoints: applyPoints,
    buildRun: buildRun,
    buildQuestion: buildQuestion,
    checkTyped: checkTyped,
    shuffle: shuffle
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
