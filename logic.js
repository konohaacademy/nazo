// 怪盗からの挑戦状 — 暗号を作る・答えを確かめる・タグの合言葉（画面に触らない。node の tests/logic.js でそのまま確かめる）
//
// ⚠ 暗号の答えは「次の隠し場所の読み」そのもの。隠し場所は親の準備画面で家に合わせて変えるので、
//   暗号は毎回ここで作り直す（文字暗号＝場所1・時計暗号＝場所2）。作れない読みは準備画面で名指しする。
// ⚠ タグに書くURLの合言葉（?t=）は、記録の無い端末でも読み戻せる形にしてある。
//   iPhone はタグをかざすと Safari が別のページとして開くので、ホーム画面のアプリとは記録が別になる。
//   そのときは捜査コードを画面に出して、手で入れてもらう。
(function (root) {
  'use strict';

  // ---------- かな ----------
  function toHira(s) {
    return String(s || '').replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }
  // 比べる形：全角半角・空白・記号を落としてひらがなへ
  function normKana(s) {
    var t = String(s || '').normalize('NFKC');
    t = toHira(t);
    t = t.replace(/[\s　。、，．,.!！?？・「」『』（）()〜~…:：;；"'“”‘’]/g, '');
    return t;
  }
  var SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ' };
  // 小さい字と大きい字は同じとみなす（小2が「べつど」と打っても通す）
  function looseKana(s) {
    return normKana(s).replace(/[ぁぃぅぇぉっゃゅょゎ]/g, function (c) { return SMALL[c]; });
  }
  function sameAnswer(input, answer) {
    var a = looseKana(answer);
    return a !== '' && looseKana(input) === a;
  }
  // 書いた字の数（きって＝3・でんしゃ＝4）
  function kanaList(s) { return Array.from(normKana(s)); }
  function isHiraOnly(s) { return /^[ぁ-ゖー]+$/.test(normKana(s)); }

  // ---------- seed から決まる乱数 ----------
  function rng(seed) {
    var a = (Number(seed) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- 文字暗号に使う言葉（小2が知っている、ひらがなの名詞） ----------
  // ⚠ 1つの字に1語では同じ問題しか作れないので、なるべく2語以上ある形にする（tests/logic.js が数える）。
  var WORDS = [
    'あり', 'あひる', 'あめ', 'あさがお', 'いぬ', 'いちご', 'いるか', 'いす', 'うさぎ', 'うし', 'うみ',
    'えんぴつ', 'えび', 'えき', 'おに', 'おにぎり', 'おばけ', 'かめ', 'かさ', 'かに', 'きりん', 'きつね', 'きのこ',
    'くま', 'くつ', 'くじら', 'けむし', 'けいと', 'こあら', 'こま', 'こおり', 'さる', 'さかな', 'さくら',
    'しか', 'しまうま', 'しろ', 'すいか', 'すずめ', 'すし', 'せみ', 'せなか', 'そら', 'そり', 'たぬき', 'たこ',
    'たいこ', 'ちず', 'ちくわ', 'つくえ', 'つき', 'つみき', 'てがみ', 'てぶくろ', 'とけい', 'とまと', 'とり',
    'なす', 'なつ', 'なべ', 'にわとり', 'にんじん', 'にじ', 'ぬいぐるみ', 'ぬの', 'ねこ', 'ねずみ', 'ねぎ',
    'のり', 'のこぎり', 'のはら', 'はさみ', 'はな', 'はし', 'ひこうき', 'ひよこ', 'ひまわり', 'ふね', 'ふうせん',
    'ふくろう', 'へび', 'へそ', 'へや', 'ほし', 'ほたる', 'ほん', 'まくら', 'まど', 'まめ', 'みかん', 'みみ', 'みず',
    'むし', 'むぎ', 'むかで', 'めがね', 'めだか', 'めろん', 'もも', 'もみじ', 'もり', 'やま', 'やかん', 'やさい',
    'ゆき', 'ゆびわ', 'ゆうびん', 'よる', 'よみせ', 'らいおん', 'らくだ', 'らっぱ', 'りんご', 'りす', 'りゅう',
    'くるま', 'るすばん', 'さるすべり', 'れもん', 'れんこん', 'ろうそく', 'ろけっと', 'ろば', 'わに', 'わたあめ', 'わたし',
    'ぱん',
    'がっこう', 'しがつ', 'ぎゅうにゅう', 'どんぐり', 'ぐみ', 'げた', 'ひげ', 'ごりら', 'ごま', 'ざる', 'かざぐるま',
    'じてんしゃ', 'ぜんまい', 'かぜ', 'ぞう', 'なぞ', 'くだもの', 'だんご', 'はなぢ', 'みかづき', 'つづみ',
    'でんしゃ', 'でんわ', 'どうろ', 'ばなな', 'ばった', 'ぶどう', 'ぶた', 'べんとう', 'かべ', 'ぼうし', 'ぼたん',
    'ぱんだ', 'ぴあの', 'ぴんく', 'ぷりん', 'ぷうる', 'ぺんぎん', 'たんぽぽ', 'ぽすと', 'きって', 'きゃべつ',
    'おもちゃ', 'きゅうり', 'ちょう', 'きょうりゅう', 'じょうろ', 'しゃべる', 'ちゃわん'
  ];

  // 答えの読みを、言葉から1文字ずつ拾う問題にする
  function letterPuzzle(yomi, seed) {
    var ks = kanaList(yomi);
    if (!ks.length) return { ok: false, missing: [], reason: 'empty' };
    var answer = ks.join('');
    var r = rng((Number(seed) ^ 0x1F2E3D) >>> 0);
    var used = {};
    var items = [], missing = [];
    ks.forEach(function (k) {
      var cands = [];
      WORDS.forEach(function (w) {
        // ⚠ 答えを含む言葉・答えの一部になっている言葉は使わない（「ほんだな」に「ほん」を出すと見ただけで分かる）
        if (used[w] || w.indexOf(answer) >= 0 || answer.indexOf(w) >= 0) return;
        Array.from(w).forEach(function (c, p) { if (c === k) cands.push({ word: w, pos: p + 1 }); });
      });
      if (!cands.length) { missing.push(k); return; }
      // 1文字目ばかりだと「頭の字を読むだけ」になるので、2文字目より後を少し多めに選ぶ
      var later = cands.filter(function (c) { return c.pos > 1; });
      var pool = (later.length && r() < 0.65) ? later : cands;
      var pick = pool[Math.floor(r() * pool.length)];
      used[pick.word] = true;
      items.push({ word: pick.word, pos: pick.pos, kana: k });
    });
    if (missing.length) return { ok: false, missing: uniq(missing) };
    return { ok: true, items: items, answer: answer };
  }

  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  // ---------- 時計の暗号 ----------
  var DECOY = Array.from('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ');

  // h（1〜12）になる計算を1つ作る。小2〜小3の計算（たし算・ひき算・九九）
  function makeExpr(h, r) {
    var kind = Math.floor(r() * 3);
    if (kind === 2) {
      var fs = [];
      for (var a = 2; a <= 9; a++) if (h % a === 0 && h / a >= 2 && h / a <= 9) fs.push([a, h / a]);
      if (fs.length) { var f = fs[Math.floor(r() * fs.length)]; return f[0] + '×' + f[1]; }
    }
    if (kind === 1 || h === 1) {
      var b = 2 + Math.floor(r() * Math.min(8, 19 - h)); // ひかれる数は20まで
      return (h + b) + '−' + b;
    }
    var x = 1 + Math.floor(r() * (h - 1));
    return x + '＋' + (h - x);
  }
  function evalExpr(e) {
    var m = String(e).match(/^(\d+)([＋−×])(\d+)$/);
    if (!m) return NaN;
    var a = +m[1], b = +m[3];
    return m[2] === '＋' ? a + b : m[2] === '−' ? a - b : a * b;
  }

  // 文字ばん（1〜12時に1文字ずつ）と、読む順の計算の並び
  function clockPuzzle(yomi, seed) {
    var ks = kanaList(yomi);
    if (!ks.length) return { ok: false, reason: 'empty' };
    var r = rng((Number(seed) ^ 0xC10C4) >>> 0);
    var distinct = uniq(ks);
    if (distinct.length > 12) return { ok: false, reason: 'long' };
    var hours = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], r);
    var dial = new Array(12);
    var hourOf = {};
    distinct.forEach(function (k, i) { hourOf[k] = hours[i]; dial[hours[i] - 1] = k; });
    var decoys = shuffle(DECOY.filter(function (k) { return distinct.indexOf(k) < 0; }), r);
    // ⚠ 小さい字と大きい字は同じとみなすので、答えの字の大きい版はおとりにしない（「つ」と「っ」が両方あると迷う）
    var bigs = distinct.map(function (k) { return SMALL[k] || k; });
    decoys = decoys.filter(function (k) { return bigs.indexOf(k) < 0; });
    for (var i = 0; i < 12; i++) if (!dial[i]) dial[i] = decoys.shift();
    var seq = ks.map(function (k) { var h = hourOf[k]; return { hour: h, expr: makeExpr(h, r), kana: k }; });
    return { ok: true, dial: dial, seq: seq, answer: ks.join('') };
  }

  // ---------- 捜査コードとタグの合言葉 ----------
  function sceneCode(seed, idx) {
    var r = rng(((Number(seed) >>> 0) * 31 + (idx + 1) * 7919) >>> 0);
    r(); r();
    return String(1000 + Math.floor(r() * 9000));
  }
  var TAG_MASK = 0x2B5A7;
  function encodeTag(idx, code) {
    var n = ((Number(code) * 10 + idx) ^ TAG_MASK) >>> 0;
    return 'T' + n.toString(36).toUpperCase();
  }
  function decodeTag(t) {
    var m = String(t || '').trim().match(/^T([0-9A-Z]+)$/i);
    if (!m) return null;
    var n = (parseInt(m[1], 36) ^ TAG_MASK) >>> 0;
    var idx = n % 10, code = Math.floor(n / 10);
    if (code < 1000 || code > 9999) return null;
    return { idx: idx, code: String(code) };
  }

  // ---------- 金庫 ----------
  function safeCode(setup) {
    var d1 = kanaList(setup.places[0].yomi).length;
    var d2 = kanaList(setup.places[1].yomi).length;
    var d34 = Number(setup.keyNo) * 2;
    return { d1: d1, d2: d2, d34: d34, code: '' + d1 + d2 + d34 };
  }

  // ---------- 準備の点検（準備画面で名指しする） ----------
  function checkSetup(setup) {
    var errs = [];
    var p = setup.places || [];
    [0, 1].forEach(function (i) {
      var pl = p[i] || {};
      var lab = '隠し場所' + (i + 1);
      if (!String(pl.name || '').trim()) errs.push(lab + 'の名前が空です');
      if (!isHiraOnly(pl.yomi || '')) errs.push(lab + 'の読みは ひらがなだけで書いてください');
      var n = kanaList(pl.yomi || '').length;
      if (n < 2 || n > 9) errs.push(lab + 'の読みは 2〜9文字にしてください（いま' + n + '文字。金庫の番号に1けたで入るため）');
      if (/ー/.test(normKana(pl.yomi || ''))) errs.push(lab + 'の読みに「ー」は使えません');
    });
    if (p[0] && p[1] && looseKana(p[0].yomi) && looseKana(p[0].yomi) === looseKana(p[1].yomi)) errs.push('隠し場所1と2が同じです');
    if (!errs.length) {
      var lp = letterPuzzle(p[0].yomi, setup.seed);
      if (!lp.ok) errs.push('隠し場所1の読みの「' + (lp.missing || []).join('・') + '」を使う言葉が手持ちにありません。読みか場所を変えてください');
      var cp = clockPuzzle(p[1].yomi, setup.seed);
      if (!cp.ok) errs.push('隠し場所2で時計の暗号が作れません');
    }
    var k = Number(setup.keyNo);
    if (!(k >= 10 && k <= 49)) errs.push('カギの数は 10〜49 にしてください');
    return errs;
  }

  // ---------- 文章 ----------
  function fill(str, vars) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // [漢字|よみ] → ルビ。改行は <br>
  function rubyHtml(str) {
    return esc(str).replace(/\[([^\[\]|]+)\|([^\[\]|]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>').replace(/\n/g, '<br>');
  }
  // 読み上げ用：ルビは読みのほうを読む
  function speechText(str) {
    return String(str).replace(/\[([^\[\]|]+)\|([^\[\]|]+)\]/g, '$2');
  }
  // 画面に出る字（ルビは本文だけ）
  function plainText(str) {
    return String(str).replace(/\[([^\[\]|]+)\|([^\[\]|]+)\]/g, '$1');
  }

  var api = {
    toHira: toHira, normKana: normKana, looseKana: looseKana, sameAnswer: sameAnswer,
    kanaList: kanaList, isHiraOnly: isHiraOnly, rng: rng, shuffle: shuffle,
    WORDS: WORDS, letterPuzzle: letterPuzzle, clockPuzzle: clockPuzzle, makeExpr: makeExpr, evalExpr: evalExpr,
    sceneCode: sceneCode, encodeTag: encodeTag, decodeTag: decodeTag, safeCode: safeCode,
    checkSetup: checkSetup, fill: fill, esc: esc, rubyHtml: rubyHtml, speechText: speechText, plainText: plainText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NazoLogic = api;
})(this);
