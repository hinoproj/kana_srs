// [MODULE] selftest | Node-run assertions over the kana tables and the SRS rules
// [IFACE] layer: tooling | in: nothing -> out: pass/fail report on stdout, exit code | crosses: [node:fs, node:vm]
// [GRAPH] needs: [kana-data, srs] | feeds: [] | group: tooling
// [STATE] stateless | persists: nothing | raises: exits 1 on any failed assertion

/**
 * Run with:  node tools/selftest.js
 *
 * The browser modules are plain classic scripts that attach to the global
 * object, so they are simply evaluated here -- no build step, no module
 * wrapper, and the file the browser loads is the file under test.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['js/kana-data.js', 'js/srs.js'].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
});

const DATA = sandbox.KANA_DATA;
const SRS = sandbox.KanaSRS;

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log('  ok   ' + name);
  } else {
    failures += 1;
    console.log('  FAIL ' + name + (detail ? ' -- ' + detail : ''));
  }
}

function section(title) { console.log('\n' + title); }

// --- Deck tables ------------------------------------------------------

section('Deck tables');

const EXPECTED_SIZES = {
  hira_basic: 46, hira_dakuten: 25, hira_yoon: 36,
  kata_basic: 46, kata_dakuten: 25, kata_yoon: 36
};

Object.keys(EXPECTED_SIZES).forEach((id) => {
  const deck = DATA.deckById[id];
  check(id + ' has ' + EXPECTED_SIZES[id] + ' kana', deck && deck.items.length === EXPECTED_SIZES[id],
    deck ? 'got ' + deck.items.length : 'deck missing');
});

const allKeys = [];
DATA.decks.forEach((d) => d.items.forEach((i) => allKeys.push(i.key)));
check('no kana appears twice across decks', new Set(allKeys).size === allKeys.length,
  allKeys.length + ' items, ' + new Set(allKeys).size + ' unique');
check('214 kana in total', allKeys.length === 214, 'got ' + allKeys.length);

check('every item accepts its own Hepburn spelling',
  DATA.decks.every((d) => d.items.every((i) => i.accept.indexOf(i.r) >= 0)));

check('katakana decks mirror hiragana romaji exactly',
  ['basic', 'dakuten', 'yoon'].every((kind) => {
    const h = DATA.decks.find((d) => d.script === 'hiragana' && d.kind === kind);
    const k = DATA.decks.find((d) => d.script === 'katakana' && d.kind === kind);
    return h.items.length === k.items.length &&
      h.items.every((item, i) => item.r === k.items[i].r && item.pr === k.items[i].pr);
  }));

check('ji/zu homophones prompt distinctly',
  DATA.byKey['ぢ'].pr === 'di' && DATA.byKey['づ'].pr === 'du' &&
  DATA.byKey['じ'].pr === 'ji' && DATA.byKey['ず'].pr === 'zu');

check('yoon inherit base-glyph confusion (じゃ vs ちゃ share shape roots)',
  DATA.confusionWeight(DATA.byKey['じゃ'], DATA.byKey['ちゃ']) > 0);

// --- Scoring ----------------------------------------------------------

section('Scoring');

check('MCQ correct under 3s is +5', SRS.pointsFor(SRS.MODE_MCQ_K2R, true, 2999) === 5);
check('MCQ correct at exactly 3s is +5', SRS.pointsFor(SRS.MODE_MCQ_K2R, true, 3000) === 5);
check('MCQ correct at 4s is +3', SRS.pointsFor(SRS.MODE_MCQ_R2K, true, 4000) === 3);
check('MCQ correct past 5s is +1', SRS.pointsFor(SRS.MODE_MCQ_K2R, true, 9000) === 1);
check('MCQ wrong is -5', SRS.pointsFor(SRS.MODE_MCQ_K2R, false, 1000) === -5);
check('typed correct is +3 regardless of time', SRS.pointsFor(SRS.MODE_TYPE, true, 60000) === 3);
check('typed wrong is -5', SRS.pointsFor(SRS.MODE_TYPE, false, 100) === -5);
check('score floors at 0', SRS.applyPoints(3, -5) === 0 && SRS.applyPoints(0, -5) === 0);

check('state boundaries', SRS.stateOf(0) === 'new' && SRS.stateOf(1) === 'learning' &&
  SRS.stateOf(9) === 'learning' && SRS.stateOf(10) === 'learned' &&
  SRS.stateOf(24) === 'learned' && SRS.stateOf(25) === 'confident');

// --- Typed answers ----------------------------------------------------

section('Typed answers');

check('Hepburn accepted', SRS.checkTyped('shi', DATA.byKey['し']));
check('Nihon-shiki accepted', SRS.checkTyped('si', DATA.byKey['し']));
check('case and padding ignored', SRS.checkTyped('  SHI ', DATA.byKey['し']));
check('wapuro yoon accepted', SRS.checkTyped('sya', DATA.byKey['しゃ']) && SRS.checkTyped('zyu', DATA.byKey['じゅ']));
check('du accepted for づ', SRS.checkTyped('du', DATA.byKey['づ']) && SRS.checkTyped('zu', DATA.byKey['づ']));
check('n variants accepted', SRS.checkTyped('nn', DATA.byKey['ん']) && SRS.checkTyped("n'", DATA.byKey['ん']));
check('wrong answer rejected', !SRS.checkTyped('sa', DATA.byKey['し']));
check('empty answer rejected', !SRS.checkTyped('   ', DATA.byKey['し']));

// --- Run composition --------------------------------------------------

section('Run composition');

function statsFrom(scores) {
  return (key) => ({ score: scores[key] || 0, lastSeen: 0 });
}

const deck = DATA.deckById.hira_basic;

const freshRun = SRS.buildRun(deck, statsFrom({}), 15);
check('fresh run has the requested size', freshRun.length === 15, 'got ' + freshRun.length);
check('fresh run is the first 15 kana in row order',
  freshRun.map((i) => i.index).sort((a, b) => a - b).join(',') ===
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].join(','));

const mixed = {};
deck.items.slice(0, 8).forEach((i) => { mixed[i.key] = 12; });    // learned
deck.items.slice(8, 12).forEach((i) => { mixed[i.key] = 30; });   // confident
const mixedRun = SRS.buildRun(deck, statsFrom(mixed), 20);
const byState = { learned: 0, confident: 0, other: 0 };
mixedRun.forEach((item) => {
  const s = SRS.stateOf(mixed[item.key] || 0);
  if (s === 'learned') byState.learned += 1;
  else if (s === 'confident') byState.confident += 1;
  else byState.other += 1;
});
check('run size honoured with a mixed deck', mixedRun.length === 20, 'got ' + mixedRun.length);
check('at most 3 learned kana per run', byState.learned <= 3, 'got ' + byState.learned);
check('at most 1 confident kana per run', byState.confident <= 1, 'got ' + byState.confident);
check('the rest come from not-learned', byState.other === 20 - byState.learned - byState.confident);
check('no kana repeats within a run', new Set(mixedRun.map((i) => i.key)).size === mixedRun.length);

const mastered = {};
deck.items.forEach((i) => { mastered[i.key] = 30; });
const masteredRun = SRS.buildRun(deck, statsFrom(mastered), 20);
check('a mastered deck still fills a full run', masteredRun.length === 20, 'got ' + masteredRun.length);
check('a mastered run does not repeat kana',
  new Set(masteredRun.map((i) => i.key)).size === masteredRun.length);

const small = DATA.deckById.hira_dakuten;
check('run never exceeds deck size', SRS.buildRun(small, statsFrom({}), 20).length === 20);

// --- Questions --------------------------------------------------------

section('Questions');

let optionProblems = [];
DATA.decks.forEach((d) => {
  [SRS.MODE_MCQ_K2R, SRS.MODE_MCQ_R2K].forEach((mode) => {
    d.items.forEach((item) => {
      for (let trial = 0; trial < 20; trial++) {
        const q = SRS.buildQuestion(item, d, mode);
        const texts = q.options.map((o) => o.text);
        const correct = q.options.filter((o) => o.correct);
        if (q.options.length !== SRS.OPTION_COUNT) optionProblems.push(item.key + ' ' + mode + ' option count');
        if (correct.length !== 1) optionProblems.push(item.key + ' ' + mode + ' correct count ' + correct.length);
        if (new Set(texts).size !== texts.length) optionProblems.push(item.key + ' ' + mode + ' duplicate option');
        if (q.options.some((o) => !o.correct && DATA.byKey[o.key].r === item.r)) {
          optionProblems.push(item.key + ' ' + mode + ' ambiguous homophone option');
        }
      }
    });
  });
});
check('every MCQ question is well-formed in every deck', optionProblems.length === 0,
  optionProblems.slice(0, 5).join('; '));

const typeQ = SRS.buildQuestion(DATA.byKey['か'], DATA.deckById.hira_basic, SRS.MODE_TYPE);
check('type questions have no options and no timer', typeQ.options === null && typeQ.timed === false);
check('type mode only offered on hiragana decks',
  SRS.modesForDeck(DATA.deckById.hira_basic).indexOf(SRS.MODE_TYPE) >= 0 &&
  SRS.modesForDeck(DATA.deckById.kata_basic).indexOf(SRS.MODE_TYPE) === -1);

// Distractor bias: confusable kana should show up far more often than chance.
let confusableHits = 0;
const trials = 400;
for (let i = 0; i < trials; i++) {
  const q = SRS.buildQuestion(DATA.byKey['シ'], DATA.deckById.kata_basic, SRS.MODE_MCQ_K2R);
  if (q.options.some((o) => o.key === 'ツ')) confusableHits += 1;
}
check('confusable distractors are favoured (ツ offered against シ)', confusableHits / trials > 0.4,
  'rate ' + (confusableHits / trials).toFixed(2));

// --- Report -----------------------------------------------------------

console.log('\n' + (failures === 0 ? 'All checks passed.' : failures + ' check(s) FAILED.'));
process.exit(failures === 0 ? 0 : 1);
