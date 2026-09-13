// [MODULE] kana-data | The six kana decks, their romaji/accepted spellings, and visual-confusion weighting
// [IFACE] layer: data | in: nothing (static tables) -> out: KANA_DATA {decks, byKey, confusionWeight} | crosses: []
// [GRAPH] needs: [] | feeds: [srs, app, index, selftest] | group: domain
// [STATE] stateless | persists: nothing | raises: nothing

/**
 * Static kana tables.
 *
 * A "deck" is one script (hiragana/katakana) crossed with one kana class
 * (basic gojuon / dakuten+handakuten / yoon digraphs) -- six decks in all.
 * Deck item order IS the introduction order: gojuon row order, top to bottom,
 * left to right. The run builder simply takes the earliest not-yet-learned
 * items, so row order alone produces the drip-feed -- there is no separate
 * tier/unlock mechanism to keep in sync.
 *
 * Each item:
 *   k      the kana itself
 *   r      Hepburn romaji -- what we DISPLAY as the answer
 *   pr     prompt romaji -- what we display when romaji is the QUESTION.
 *          Differs from `r` only for the four ji/zu homophones (di/du and
 *          their yoon), where showing "ji" as a prompt would have two correct
 *          kana answers; those prompt as the wapuro forms di/du/dya/...
 *   accept extra spellings accepted in type mode (Nihon-shiki / wapuro)
 */
(function (global) {
  'use strict';

  // [kana, hepburn, promptRomaji?, acceptExtra?]
  var HIRA_BASIC = [
    ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
    ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
    ['さ', 'sa'], ['し', 'shi', null, ['si']], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
    ['た', 'ta'], ['ち', 'chi', null, ['ti']], ['つ', 'tsu', null, ['tu']], ['て', 'te'], ['と', 'to'],
    ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
    ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu', null, ['hu']], ['へ', 'he'], ['ほ', 'ho'],
    ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
    ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
    ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
    ['わ', 'wa'], ['を', 'wo', null, ['o']],
    ['ん', 'n', null, ['nn']]
  ];

  var HIRA_DAKUTEN = [
    ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
    ['ざ', 'za'], ['じ', 'ji', null, ['zi']], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
    ['だ', 'da'], ['ぢ', 'ji', 'di', ['di', 'zi']], ['づ', 'zu', 'du', ['du', 'dzu']], ['で', 'de'], ['ど', 'do'],
    ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
    ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']
  ];

  var HIRA_YOON = [
    ['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo'],
    ['しゃ', 'sha', null, ['sya']], ['しゅ', 'shu', null, ['syu']], ['しょ', 'sho', null, ['syo']],
    ['ちゃ', 'cha', null, ['tya', 'cya']], ['ちゅ', 'chu', null, ['tyu', 'cyu']], ['ちょ', 'cho', null, ['tyo', 'cyo']],
    ['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo'],
    ['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo'],
    ['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo'],
    ['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo'],
    ['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo'],
    ['じゃ', 'ja', null, ['jya', 'zya']], ['じゅ', 'ju', null, ['jyu', 'zyu']], ['じょ', 'jo', null, ['jyo', 'zyo']],
    ['ぢゃ', 'ja', 'dya', ['dya', 'zya']], ['ぢゅ', 'ju', 'dyu', ['dyu', 'zyu']], ['ぢょ', 'jo', 'dyo', ['dyo', 'zyo']],
    ['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo'],
    ['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo']
  ];

  // Katakana mirrors hiragana one-for-one, so only the glyphs differ.
  var KATA_BASIC_GLYPHS =
    'アイウエオカキクケコ' +
    'サシスセソタチツテト' +
    'ナニヌネノハヒフヘホ' +
    'マミムメモヤユヨ' +
    'ラリルレロワヲン';

  var KATA_DAKUTEN_GLYPHS =
    'ガギグゲゴザジズゼゾ' +
    'ダヂヅデドバビブベボ' +
    'パピプペポ';

  var KATA_YOON_GLYPHS = [
    'キャ', 'キュ', 'キョ',
    'シャ', 'シュ', 'ショ',
    'チャ', 'チュ', 'チョ',
    'ニャ', 'ニュ', 'ニョ',
    'ヒャ', 'ヒュ', 'ヒョ',
    'ミャ', 'ミュ', 'ミョ',
    'リャ', 'リュ', 'リョ',
    'ギャ', 'ギュ', 'ギョ',
    'ジャ', 'ジュ', 'ジョ',
    'ヂャ', 'ヂュ', 'ヂョ',
    'ビャ', 'ビュ', 'ビョ',
    'ピャ', 'ピュ', 'ピョ'
  ];

  function katakanaOf(hiraRows, glyphs) {
    var list = typeof glyphs === 'string' ? Array.from(glyphs) : glyphs;
    if (list.length !== hiraRows.length) {
      throw new Error('[kana-data.js][katakanaOf] glyph/row count mismatch: ' + list.length + ' vs ' + hiraRows.length);
    }
    return hiraRows.map(function (row, i) {
      return [list[i], row[1], row[2] || null, row[3] || null];
    });
  }

  var VOWELS = ['a', 'i', 'u', 'e', 'o'];

  function buildItem(raw, deckId, index) {
    var r = raw[1];
    var vowel = VOWELS.indexOf(r.slice(-1)) >= 0 ? r.slice(-1) : '';
    var accept = {};
    accept[r] = true;
    (raw[3] || []).forEach(function (v) { accept[v] = true; });
    return {
      key: raw[0],
      k: raw[0],
      r: r,
      pr: raw[2] || r,
      deck: deckId,
      index: index,
      vowel: vowel,
      consonant: vowel ? r.slice(0, -1) : r,
      accept: Object.keys(accept)
    };
  }

  var DECK_DEFS = [
    { id: 'hira_basic', label: 'Hiragana · basic', script: 'hiragana', kind: 'basic', rows: HIRA_BASIC },
    { id: 'hira_dakuten', label: 'Hiragana · dakuten', script: 'hiragana', kind: 'dakuten', rows: HIRA_DAKUTEN },
    { id: 'hira_yoon', label: 'Hiragana · yōon', script: 'hiragana', kind: 'yoon', rows: HIRA_YOON },
    { id: 'kata_basic', label: 'Katakana · basic', script: 'katakana', kind: 'basic', rows: katakanaOf(HIRA_BASIC, KATA_BASIC_GLYPHS) },
    { id: 'kata_dakuten', label: 'Katakana · dakuten', script: 'katakana', kind: 'dakuten', rows: katakanaOf(HIRA_DAKUTEN, KATA_DAKUTEN_GLYPHS) },
    { id: 'kata_yoon', label: 'Katakana · yōon', script: 'katakana', kind: 'yoon', rows: katakanaOf(HIRA_YOON, KATA_YOON_GLYPHS) }
  ];

  var decks = DECK_DEFS.map(function (def) {
    return {
      id: def.id,
      label: def.label,
      script: def.script,
      kind: def.kind,
      items: def.rows.map(function (raw, i) { return buildItem(raw, def.id, i); })
    };
  });

  var byKey = {};
  var deckById = {};
  decks.forEach(function (d) {
    deckById[d.id] = d;
    d.items.forEach(function (item) { byKey[item.key] = item; });
  });

  /**
   * Glyph pairs learners actually mix up, by shape rather than by sound.
   * Used to bias multiple-choice distractors: a question is only diagnostic if
   * the wrong options are ones you could plausibly have picked.
   * Advanced decks inherit these through their base kana (za -> sa).
   */
  var CONFUSION_GROUPS = [
    ['あ', 'お'], ['ぬ', 'め'], ['ね', 'れ', 'わ'],
    ['は', 'ほ', 'ま'], ['は', 'け'], ['る', 'ろ'],
    ['い', 'り'], ['う', 'つ'], ['さ', 'き', 'ち'],
    ['す', 'む'], ['た', 'な'], ['そ', 'ろ'],
    ['ま', 'も'], ['ん', 'そ'], ['せ', 'さ'], ['く', 'へ'],
    ['シ', 'ツ'], ['ソ', 'ン', 'ノ'], ['ク', 'ワ', 'ラ', 'タ'],
    ['マ', 'ム', 'ア'], ['ウ', 'ワ', 'フ'], ['ス', 'ヌ'],
    ['ナ', 'メ'], ['チ', 'テ'], ['ミ', 'ニ'], ['コ', 'ユ', 'ロ'],
    ['ヨ', 'ヲ'], ['セ', 'ヤ'], ['レ', 'リ'], ['ホ', 'オ'],
    ['エ', 'コ'], ['ル', 'レ'], ['シ', 'ミ'], ['ケ', 'サ']
  ];

  // Dakuten/handakuten/yoon glyphs are their base glyph plus a mark, so their
  // shape confusions are their base's confusions.
  var DAKUTEN_BASE = {};
  (function () {
    var pairs = [
      'がか', 'ぎき', 'ぐく', 'げけ', 'ごこ',
      'ざさ', 'じし', 'ずす', 'ぜせ', 'ぞそ',
      'だた', 'ぢち', 'づつ', 'でて', 'どと',
      'ばは', 'びひ', 'ぶふ', 'べへ', 'ぼほ',
      'ぱは', 'ぴひ', 'ぷふ', 'ぺへ', 'ぽほ',
      'ガカ', 'ギキ', 'グク', 'ゲケ', 'ゴコ',
      'ザサ', 'ジシ', 'ズス', 'ゼセ', 'ゾソ',
      'ダタ', 'ヂチ', 'ヅツ', 'デテ', 'ドト',
      'バハ', 'ビヒ', 'ブフ', 'ベヘ', 'ボホ',
      'パハ', 'ピヒ', 'プフ', 'ペヘ', 'ポホ'
    ];
    pairs.forEach(function (p) { DAKUTEN_BASE[p[0]] = p[1]; });
  })();

  function baseGlyph(kana) {
    var head = kana[0];
    return DAKUTEN_BASE[head] || head;
  }

  var CONFUSION_INDEX = {};
  CONFUSION_GROUPS.forEach(function (group) {
    group.forEach(function (a) {
      group.forEach(function (b) {
        if (a !== b) CONFUSION_INDEX[a + '|' + b] = true;
      });
    });
  });

  // Weight contributed by a listed shape confusion. Exported so the question
  // builder can ask "is this a genuine look-alike?" without hardcoding a number
  // that only means something here.
  var SHAPE_WEIGHT = 4;

  /**
   * How plausible `b` is as a wrong answer when the right answer is `a`.
   * 0 = unrelated (still selectable, just not favoured); higher = more tempting.
   */
  function confusionWeight(a, b) {
    if (!a || !b || a.key === b.key) return 0;
    var w = 0;
    if (CONFUSION_INDEX[baseGlyph(a.k) + '|' + baseGlyph(b.k)]) w += SHAPE_WEIGHT;
    if (a.consonant && a.consonant === b.consonant) w += 2;
    if (a.vowel && a.vowel === b.vowel) w += 1;
    return w;
  }

  global.KANA_DATA = {
    decks: decks,
    deckById: deckById,
    byKey: byKey,
    SHAPE_WEIGHT: SHAPE_WEIGHT,
    confusionWeight: confusionWeight,
    baseGlyph: baseGlyph
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
