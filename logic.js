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
    'おもちゃ', 'きゅうり', 'ちょう', 'きょうりゅう', 'じょうろ', 'しゃべる', 'ちゃわん',
    'けーき', 'すぷーん', 'ぼーる', 'ちーず', 'かれー', 'すーぷ'
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

  // ---------- 暗号カード（隠し場所の読みから作る。絵は cards.js が描く） ----------
  // ⚠ どの種類も答えは読みそのもの。作れない読みは ok:false と理由を返し、準備画面で選べなくする。
  var CARD_KINDS = ['mirror', 'tanuki', 'gojuon', 'arrow', 'alien', 'anaume', 'wordsearch', 'shiritori', 'sakanobori'];
  var DAKU_OF = { 'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ', 'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ', 'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と', 'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ' };
  var HAN_OF = { 'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ' };
  // あいうえお表（列＝あ行〜ん。行＝上から1〜5。空きは ''）
  var GOJUON = [
    'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも',
    'や ゆ よ', 'らりるれろ', 'わ   を', 'ん    '
  ];
  // 字を あいうえお表の場所と しるし（゛゜小）に分ける
  function gojuonPos(k) {
    if (k === 'ー') return { bar: true, kana: k };   // のばす 字は 表に ないので、そのまま 書く
    var mark = '', base = k;
    if (DAKU_OF[k]) { base = DAKU_OF[k]; mark = 'daku'; }
    else if (HAN_OF[k]) { base = HAN_OF[k]; mark = 'han'; }
    else if (SMALL[k]) { base = SMALL[k]; mark = 'small'; }
    for (var c = 0; c < GOJUON.length; c++) {
      var r = GOJUON[c].indexOf(base);
      if (r >= 0 && base !== ' ') return { col: c, row: r, mark: mark, kana: k };
    }
    return null;
  }
  // たぬき（「た」ぬき）・ことり（「こ」とり）：読みに よけいな字を まぜ、絵が「どの字を とるか」を教える
  var TANUKI = [{ ch: 'た', pic: 'tanuki', name: 'たぬき' }, { ch: 'こ', pic: 'kotori', name: 'ことり' }];
  // include＝ほんやく表に かならず入れる字（あとの仕掛けで使う字。物語の JSON の padWord）
  function cardPuzzle(kind, yomi, seed, include) {
    var ks = kanaList(yomi);
    if (!ks.length) return { ok: false, reason: '読みが空です' };
    var answer = ks.join('');
    var r = rng(((Number(seed) >>> 0) ^ 0x51ED) + kind.length * 101);
    if (kind === 'mirror') return { ok: true, kind: kind, answer: answer, text: answer };
    if (kind === 'tanuki') {
      var t = null;
      for (var i = 0; i < TANUKI.length && !t; i++) if (ks.indexOf(TANUKI[i].ch) < 0) t = TANUKI[i];
      if (!t) return { ok: false, reason: '読みに「た」と「こ」が両方あるので作れません' };
      // 字と字のあいだ（はじめと終わりもふくむ）に、よけいな字を1こずつ。同じ すきまに 2こ入れない（「たたた」は すぐ ばれる）。
      // 入れるのは3〜4か所で、はじめか終わりは どちらか1つまで
      var n = Math.min(ks.length <= 3 ? 3 : 4, ks.length + 1);
      var inner = [], ends = shuffle([0, ks.length], r);
      for (var q = 1; q < ks.length; q++) inner.push(q);
      inner = shuffle(inner, r);
      var gaps = inner.slice(0, n - 1).concat([ends[0]]);
      if (gaps.length < n) gaps = gaps.concat(ends.slice(1));
      gaps = gaps.slice(0, n);
      var out = [];
      for (var g = 0; g <= ks.length; g++) {
        gaps.forEach(function (x) { if (x === g) out.push(t.ch); });
        if (g < ks.length) out.push(ks[g]);
      }
      return { ok: true, kind: kind, answer: answer, ch: t.ch, pic: t.pic, picName: t.name, text: out.join('') };
    }
    if (kind === 'gojuon') {
      var codes = [];
      for (var j = 0; j < ks.length; j++) {
        var pos = gojuonPos(ks[j]);
        if (!pos) return { ok: false, reason: '「' + ks[j] + '」は あいうえお表に ありません' };
        codes.push(pos);
      }
      // 列のしるし（形）は seed で入れかえる（毎回同じ形にしない）
      var shapes = shuffle(['star', 'circle', 'triangle', 'square', 'diamond', 'heart', 'moon', 'drop', 'cross', 'hexagon', 'clover'], r);
      return { ok: true, kind: kind, answer: answer, table: GOJUON, shapes: shapes, codes: codes };
    }
    if (kind === 'arrow') {
      // やじるし迷路：スタートが 3つ。どれも ゴールに つくが、とおった 字が ことばに なるのは 1つだけ
      var L0 = ks.length;
      return branchMaze(ks, L0 <= 4 ? 4 : L0 <= 7 ? 5 : 6, r, {
        kind: 'arrow', decoys: 2, cycles: false, minLen: Math.max(2, L0 - 1), maxLen: L0 + 1,
        pool: WORDS.join('').split('').filter(function (c) { return ks.indexOf(c) < 0 && c !== 'ー'; })
      });
    }
    if (kind === 'alien') {
      var msg = [];
      for (var m = 0; m < ks.length; m++) {
        if (ks[m] === 'ー') { msg.push({ bar: true, kana: 'ー' }); continue; }
        var bk = baseKana(ks[m]), gi = alienIndex(bk);
        if (gi < 0) return { ok: false, reason: '「' + ks[m] + '」は 宇宙文字に ありません' };
        msg.push({ glyph: gi, mark: markOf(ks[m]), kana: ks[m] });
      }
      var need = {};
      msg.forEach(function (c) { if (!c.bar) need[ALIEN_KANA[c.glyph]] = 1; });
      kanaList(include || '').forEach(function (k) { if (alienIndex(baseKana(k)) >= 0) need[baseKana(k)] = 1; });
      // ほんやく表は 15字。足りないぶんは ほかの字（まぎらわしい ものも 入る）
      var rest = shuffle(ALIEN_KANA.filter(function (k) { return !need[k]; }), r);
      while (Object.keys(need).length < 15 && rest.length) need[rest.pop()] = 1;
      var dec = ALIEN_KANA.filter(function (k) { return need[k]; }).map(function (k) { return { kana: k, glyph: alienIndex(k) }; });
      return { ok: true, kind: kind, answer: answer, codes: msg, decoder: dec };
    }
    if (kind === 'anaume') return anaumePuzzle(yomi, seed);
    if (kind === 'wordsearch') return wordSearchPuzzle(yomi, seed);
    if (kind === 'shiritori') return shiritoriPuzzle(yomi, seed);
    if (kind === 'sakanobori') return sakanoboriPuzzle(yomi, seed);
    return { ok: false, reason: '知らない種類です' };
  }
  // 宇宙文字のカードを、ほんやく表だけで 読み戻す（テスト用）
  function readAlien(cp) {
    var BACK = {};
    Object.keys(DAKU_OF).forEach(function (k) { BACK['daku' + DAKU_OF[k]] = k; });
    Object.keys(HAN_OF).forEach(function (k) { BACK['han' + HAN_OF[k]] = k; });
    Object.keys(SMALL).forEach(function (k) { BACK['small' + SMALL[k]] = k; });
    var map = {}; cp.decoder.forEach(function (d) { map[d.glyph] = d.kana; });
    return cp.codes.map(function (c) { if (c.bar) return 'ー'; var b = map[c.glyph]; if (!b) return '?'; return c.mark ? BACK[c.mark + b] : b; }).join('');
  }
  // ---------- 宇宙文字（キラリ星の 文字） ----------
  // 3×3 の点を つなぐ 3本の線（＋点1つ）で 1字。あいうえお表の 46字に 1つずつ。決まった形なので、遊ぶたびに同じ字になる
  // （覚えてしまっても よい。物語の中の「ことば」なので）
  var ALIEN_KANA = GOJUON.join('').replace(/ /g, '').split('');
  var ALIEN_GLYPHS = (function () {
    var pts = [], segs = [];
    for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) pts.push([x, y]);
    // となりどうし（たて・よこ）と、小さい四角の ななめ
    for (var a = 0; a < 9; a++) for (var b = a + 1; b < 9; b++) {
      var dx = Math.abs(pts[a][0] - pts[b][0]), dy = Math.abs(pts[a][1] - pts[b][1]);
      if (dx + dy === 1 || (dx === 1 && dy === 1)) segs.push([a, b]);
    }
    var r = rng(20261026), out = [], seen = {};
    while (out.length < ALIEN_KANA.length) {
      var pick = shuffle(segs, r).slice(0, 3);
      // 3本が つながっていること（ばらばらの線は 字に見えない）
      var nodes = {}; pick.forEach(function (sg) { nodes[sg[0]] = (nodes[sg[0]] || 0) + 1; nodes[sg[1]] = (nodes[sg[1]] || 0) + 1; });
      var keys = Object.keys(nodes).map(Number), grp = {}, stack = [keys[0]];
      while (stack.length) { var n = stack.pop(); if (grp[n]) continue; grp[n] = 1; pick.forEach(function (sg) { if (sg[0] === n) stack.push(sg[1]); if (sg[1] === n) stack.push(sg[0]); }); }
      if (Object.keys(grp).length !== keys.length) continue;
      // 点は 線の通らない ところに1つ
      var free = []; for (var q = 0; q < 9; q++) if (!nodes[q]) free.push(q);
      var dot = free.length ? free[Math.floor(r() * free.length)] : -1;
      var key = pick.map(function (sg) { return sg.join('-'); }).sort().join('|') + '#' + dot;
      // 左右反対の形も 同じとみなす（見分けにくいので）
      var mir = function (i) { return (2 - (i % 3)) + Math.floor(i / 3) * 3; };
      var mkey = pick.map(function (sg) { return [mir(sg[0]), mir(sg[1])].sort(function (u, v) { return u - v; }).join('-'); }).sort().join('|') + '#' + (dot >= 0 ? mir(dot) : -1);
      if (seen[key] || seen[mkey]) continue;
      seen[key] = seen[mkey] = 1;
      out.push({ segs: pick.map(function (sg) { return [pts[sg[0]], pts[sg[1]]]; }), dot: dot >= 0 ? pts[dot] : null });
    }
    return out;
  })();
  function alienIndex(base) { return ALIEN_KANA.indexOf(base); }
  // ゛゜小 をはがした字（あいうえお表のもと）
  function baseKana(k) { return DAKU_OF[k] || HAN_OF[k] || SMALL[k] || k; }
  function markOf(k) { return DAKU_OF[k] ? 'daku' : HAN_OF[k] ? 'han' : SMALL[k] ? 'small' : ''; }
  // 矢印迷路を、スタートから実際にたどって読む（テストと準備画面の下見で使う）
  function walkArrow(cp) {
    var x = cp.start[0], y = cp.start[1], out = '', guard = 0;
    while (guard++ < 100) {
      var c = cp.grid[y][x];
      out += c.kana;
      if (c.dir === 'goal') return out;
      x += c.dir === 'r' ? 1 : c.dir === 'l' ? -1 : 0;
      y += c.dir === 'd' ? 1 : c.dir === 'u' ? -1 : 0;
    }
    return null;
  }
  // あいうえお表のカードを、しるしから読み戻す
  function readGojuon(cp) {
    var BACK = {};
    Object.keys(DAKU_OF).forEach(function (k) { BACK['daku' + DAKU_OF[k]] = k; });
    Object.keys(HAN_OF).forEach(function (k) { BACK['han' + HAN_OF[k]] = k; });
    Object.keys(SMALL).forEach(function (k) { BACK['small' + SMALL[k]] = k; });
    return cp.codes.map(function (c) {
      if (c.bar) return 'ー';
      var base = cp.table[c.col].charAt(c.row);
      return c.mark ? BACK[c.mark + base] : base;
    }).join('');
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


  // ---------- 忍者やしき：3だんの関門（天びん → うそつき → ずらし文字）・まほうじん・からくり錠 ----------
  // どれも seed から決まる（開きなおしても同じ）。答えは かならず1つに決まる（tests/logic.js が全部たしかめる）
  var KANA46 = GOJUON.join('').replace(/ /g, '').split('');   // あ〜ん（を を ふくむ 46字）
  function withMark(base, mark) {
    if (!mark) return base;
    var src = mark === 'daku' ? DAKU_OF : mark === 'han' ? HAN_OF : SMALL;
    for (var k in src) if (src[k] === base) return k;
    return null;
  }
  // 一の関門：天びん。● を 1つの おもりとして、■ が ● なんこ分かを 答える（答え＝ずらす数 3〜5）
  function rep(x, n) { var a = []; for (var i = 0; i < n; i++) a.push(x); return a; }
  function balancePuzzle(seed) {
    var r = rng(((Number(seed) >>> 0) ^ 0xBA1A) + 3);
    var tpl = Math.floor(r() * 3), a = 2 + Math.floor(r() * 2), b = 1 + Math.floor(r() * 2), eqs, n;
    if (tpl === 0) { n = a + b; eqs = [{ L: ['t'], R: rep('c', a) }, { L: ['s'], R: ['t'].concat(rep('c', b)) }]; }
    else if (tpl === 1) { n = a + b; eqs = [{ L: ['t', 't'], R: rep('c', a * 2) }, { L: ['s'], R: ['t'].concat(rep('c', b)) }]; }
    else { n = 2 * a - 1; eqs = [{ L: ['t'], R: rep('c', a) }, { L: ['s', 'c'], R: ['t', 't'] }]; }
    return { ok: true, tpl: tpl, eqs: eqs, answer: n, tri: a };
  }
  // おもさ（● を 1）で 天びんが つりあうか（テスト用）
  function balanceWeight(eqs, n, tri) {
    var w = { c: 1, t: tri, s: n };
    return eqs.every(function (e) {
      var sum = function (side) { return side.reduce(function (x, k) { return x + w[k]; }, 0); };
      return sum(e.L) === sum(e.R);
    });
  }
  // 二の関門：3人の 使い。ほんものは 1人で ほんとうの ことを、にせものは うそを 言う
  var MESSENGERS = [{ id: 'momiji', name: 'もみじ', icon: '🍁' }, { id: 'sakura', name: 'さくら', icon: '🌸' }, { id: 'himawari', name: 'ひまわり', icon: '🌻' }];
  function liarTruth(s, real) { return (s.x === real) === s.pol; }
  function liarSolutions(ss) {
    var out = [];
    for (var c = 0; c < 3; c++) if (ss.every(function (s, i) { return liarTruth(s, c) === (i === c); })) out.push(c);
    return out;
  }
  function liarText(s, i) {
    if (s.x === i) return s.pol ? 'わたしが ほんものの 使いだよ' : 'わたしは にせものだよ';
    return MESSENGERS[s.x].name + (s.pol ? 'が ほんものの 使いだよ' : 'は にせものだよ');
  }
  function liarPuzzle(seed) {
    var r = rng(((Number(seed) >>> 0) ^ 0x11A2) + 7);
    var real = Math.floor(r() * 3), opts = [], good = [];
    for (var x = 0; x < 3; x++) { opts.push({ x: x, pol: true }); opts.push({ x: x, pol: false }); }
    opts.forEach(function (a) { opts.forEach(function (b) { opts.forEach(function (c) {
      var ss = [a, b, c];
      var self = ss.filter(function (s, i) { return s.x === i; }).length;
      if (self > 1) return;                      // 「わたしが ほんもの」ばかりだと つまらない
      if (a.x === b.x && a.pol === b.pol || a.x === c.x && a.pol === c.pol || b.x === c.x && b.pol === c.pol) return;   // 同じ ことを 2人が 言わない
      var sol = liarSolutions(ss);
      if (sol.length === 1 && sol[0] === real) good.push(ss);
    }); }); });
    if (!good.length) return { ok: false, reason: 'うそつきの 問題が 作れません' };
    var ss = good[Math.floor(r() * good.length)];
    // ヒント2：ちがう人を1人ためして、どこで おかしく なるかを 言う
    var wrong = [0, 1, 2].filter(function (c) { return c !== real; })[Math.floor(r() * 2)];
    var j = 0;
    for (var k = 0; k < 3; k++) if (liarTruth(ss[k], wrong) !== (k === wrong)) { j = k; break; }
    var why = j === wrong
      ? MESSENGERS[wrong].name + 'の ことばが うそに なってしまう'
      : 'にせものの ' + MESSENGERS[j].name + 'が ほんとうの ことを 言っている ことに なってしまう';
    return {
      ok: true, real: real, says: ss.map(function (s, i) { return { x: s.x, pol: s.pol, text: liarText(s, i) }; }),
      hint: 'ためしに ' + MESSENGERS[wrong].name + 'が ほんものだと すると、' + why + '。だから ' + MESSENGERS[wrong].name + 'は ちがう'
    };
  }
  // 三の関門：ずらし文字。字を あいうえお表の じゅんで n 字 うしろへ ずらして 書く（゛゜小は しるしで のこす）
  function shiftCells(ks, n) {
    var out = [];
    for (var i = 0; i < ks.length; i++) {
      if (ks[i] === 'ー') { out.push({ k: 'ー', m: '' }); continue; }   // のばす 字は ずらさない
      var b = baseKana(ks[i]), at = KANA46.indexOf(b);
      if (at < 0) return null;
      out.push({ k: KANA46[(at + n) % 46], m: markOf(ks[i]) });
    }
    return out;
  }
  function readShift(cells, n) {
    return cells.map(function (c) { if (c.k === 'ー') return 'ー'; return withMark(KANA46[(KANA46.indexOf(c.k) - n + 46 * 2) % 46], c.m) || '?'; }).join('');
  }
  var DECOYS = ['たんす', 'まくら', 'かびん', 'ふとん', 'とだな', 'くつばこ', 'まど', 'かがみ', 'つくえ', 'げんかん', 'ほんだな', 'れいぞうこ',
    'おしいれ', 'いす', 'てれび', 'ごみばこ', 'かさたて', 'ぴあの', 'たたみ', 'こたつ', 'せんたくき', 'ふろば', 'ろうか', 'かいだん', 'ぬいぐるみ', 'まくらもと',
    'すいっち', 'ひきだし', 'せんめんじょ', 'とびら', 'こんせんと', 'りびんぐ', 'くろーぜっと', 'こどもふく', 'だいどころ', 'べらんだ'];
  function chainPuzzle(yomi, seed, avoid) {
    var ks = kanaList(yomi);
    if (!ks.length) return { ok: false, reason: '読みが空です' };
    var bal = balancePuzzle(seed), n = bal.answer;
    var liar = liarPuzzle(seed);
    if (!liar.ok) return liar;
    var cells = shiftCells(ks, n);
    if (!cells) return { ok: false, reason: '読みに あいうえお表に ない字が あります' };
    var r = rng(((Number(seed) >>> 0) ^ 0x5F17) + 11);
    var ng = [looseKana(yomi)].concat((avoid || []).map(looseKana));
    var pool = shuffle(DECOYS.filter(function (w) { return ng.indexOf(looseKana(w)) < 0; }), r);
    pool.sort(function (a, b) { return Math.abs(kanaList(a).length - ks.length) - Math.abs(kanaList(b).length - ks.length); });
    var decoys = pool.slice(0, 2);
    var scrolls = [], d = 0;
    for (var i = 0; i < 3; i++) scrolls.push(i === liar.real ? cells : shiftCells(kanaList(decoys[d++]), n));
    return { ok: true, answer: ks.join(''), n: n, balance: bal, liar: liar, scrolls: scrolls, decoys: decoys };
  }
  // からくり箱：まほうじん（たて・よこ・ななめ どれも 15。1〜9 を 1回ずつ）。★の 数を 答える
  var MG_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  var MG_LINE_NAME = ['上の よこの 列', 'まん中の よこの 列', '下の よこの 列', '左の たての 列', 'まん中の たての 列', '右の たての 列', '左上から 右下への ななめ', '右上から 左下への ななめ'];
  var MG_SQUARES = (function () {
    var b = [2, 7, 6, 9, 5, 1, 4, 3, 8], out = [];
    var rot = function (q) { return [q[6], q[3], q[0], q[7], q[4], q[1], q[8], q[5], q[2]]; };
    var flip = function (q) { return [q[2], q[1], q[0], q[5], q[4], q[3], q[8], q[7], q[6]]; };
    for (var i = 0; i < 4; i++) { out.push(b); out.push(flip(b)); b = rot(b); }
    return out;
  })();
  // わかっている ます目から、2つ わかった 列の のこりを 1回ずつ うめていく。★が わかる 回を かえす（わからなければ -1）
  function mgSolveRound(shown, star) {
    var known = shown.slice(), round = 0;
    while (round < 9) {
      if (known.indexOf(star) >= 0) return round;
      round++;
      var add = [];
      MG_LINES.forEach(function (l) {
        var k = l.filter(function (c) { return known.indexOf(c) >= 0; });
        if (k.length === 2) l.forEach(function (c) { if (known.indexOf(c) < 0 && add.indexOf(c) < 0) add.push(c); });
      });
      if (!add.length) return -1;
      known = known.concat(add);
    }
    return -1;
  }
  function magicPuzzle(seed) {
    var r = rng(((Number(seed) >>> 0) ^ 0x3A61) + 5);
    var sq = MG_SQUARES[Math.floor(r() * 8)];
    for (var t = 0; t < 400; t++) {
      var star = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(r() * 8)];
      var others = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8].filter(function (c) { return c !== star; }), r);
      var shown = others.slice(0, t < 200 ? 3 : 4);
      if (mgSolveRound(shown, star) >= 2) {
        // ヒント2：さいしょに うめられる 列
        var hint = '';
        for (var i = 0; i < MG_LINES.length && !hint; i++) {
          var l = MG_LINES[i], k = l.filter(function (c) { return shown.indexOf(c) >= 0; });
          if (k.length === 2) {
            var v = k.map(function (c) { return sq[c]; });
            hint = MG_LINE_NAME[i] + 'は ' + v[0] + 'と ' + v[1] + '。15−' + v[0] + '−' + v[1] + '＝' + (15 - v[0] - v[1]) + ' で、のこりの ます目は ' + (15 - v[0] - v[1]);
          }
        }
        return { ok: true, square: sq, star: star, shown: shown.slice().sort(), answer: sq[star], hint: hint };
      }
    }
    return { ok: false, reason: 'まほうじんが 作れません' };
  }
  // からくり錠：4つの 絵（月・火・水・葉）を 左から ならべる。切れはしの 3つの 文で 1とおりに きまる
  var LOCK_ITEMS = [{ id: 'tsuki', e: '🌙', n: '月' }, { id: 'hi', e: '🔥', n: '火' }, { id: 'mizu', e: '💧', n: '水' }, { id: 'ha', e: '🍃', n: '葉' }];
  function lockName(i) { return '「' + LOCK_ITEMS[i].n + LOCK_ITEMS[i].e + '」'; }
  function lockClueTrue(c, pos) {
    switch (c.t) {
      case 'L': return pos[c.x] === 0;
      case 'R': return pos[c.x] === 3;
      case 'next': return pos[c.y] === pos[c.x] + 1;
      case 'adj': return Math.abs(pos[c.x] - pos[c.y]) === 1;
      case 'nadj': return Math.abs(pos[c.x] - pos[c.y]) !== 1;
      case 'left': return pos[c.x] < pos[c.y];
      case 'mid': return pos[c.x] === 1 || pos[c.x] === 2;
    }
    return false;
  }
  function lockClueText(c) {
    switch (c.t) {
      case 'L': return lockName(c.x) + 'は いちばん 左';
      case 'R': return lockName(c.x) + 'は いちばん 右';
      case 'next': return lockName(c.x) + 'の すぐ 右どなりに ' + lockName(c.y);
      case 'adj': return lockName(c.x) + 'と ' + lockName(c.y) + 'は となりどうし';
      case 'nadj': return lockName(c.x) + 'と ' + lockName(c.y) + 'は となりどうしでは ない';
      case 'left': return lockName(c.x) + 'は ' + lockName(c.y) + 'より 左の ほう';
      case 'mid': return lockName(c.x) + 'は はしっこでは ない';
    }
    return '';
  }
  function perms4() {
    var out = [];
    (function go(a, rest) {
      if (!rest.length) { out.push(a); return; }
      rest.forEach(function (x, i) { go(a.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1))); });
    })([], [0, 1, 2, 3]);
    return out;
  }
  function posOf(p) { var pos = []; p.forEach(function (x, i) { pos[x] = i; }); return pos; }
  function lockSolutions(clues) {
    return perms4().filter(function (p) { var pos = posOf(p); return clues.every(function (c) { return lockClueTrue(c, pos); }); });
  }
  function orderPuzzle(seed) {
    var r = rng(((Number(seed) >>> 0) ^ 0x70C4) + 9);
    var all = perms4(), ans = all[Math.floor(r() * all.length)], pos = posOf(ans);
    var cand = [];
    for (var x = 0; x < 4; x++) {
      ['L', 'R', 'mid'].forEach(function (t) { cand.push({ t: t, x: x }); });
      for (var y = 0; y < 4; y++) if (x !== y) ['next', 'left', 'adj', 'nadj'].forEach(function (t) { if (t === 'next' || t === 'left' || x < y) cand.push({ t: t, x: x, y: y }); });
    }
    cand = shuffle(cand.filter(function (c) { return lockClueTrue(c, pos); }), r);
    for (var i = 0; i < cand.length; i++) for (var j = i + 1; j < cand.length; j++) for (var k = j + 1; k < cand.length; k++) {
      var cs = [cand[i], cand[j], cand[k]];
      var edge = cs.filter(function (c) { return c.t === 'L' || c.t === 'R'; }).length;
      if (edge > 1) continue;                       // はしの 文ばかりだと すぐ わかる
      if (lockSolutions(cs).length === 1) {
        return { ok: true, answer: ans, clues: cs.map(function (c) { return { t: c.t, x: c.x, y: c.y, text: lockClueText(c) }; }), items: LOCK_ITEMS };
      }
    }
    return { ok: false, reason: 'からくり錠が 作れません' };
  }

  // ========== ことばの 材料（words.js：もじかずクイズの 辞書から 作る） ==========
  var _W = null;
  function WD() {
    if (_W) return _W;
    var src = null;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') { try { src = require('./words.js'); } catch (e) { src = null; } }
    if (!src) src = root.NazoWords || { dict: '', kid: '' };
    var dict = {}, kid = [], kid2 = [], cat = {}, kata = {};
    src.dict.split(' ').forEach(function (w) { if (w) dict[w] = 1; });
    src.kid.split(' ').forEach(function (x) { if (!x) return; var p = x.split('/'); kid.push(p[0]); cat[p[0]] = p[1]; if (p[2] === 'k') kata[p[0]] = 1; dict[p[0]] = 1; });
    (src.kid2 || '').split(' ').forEach(function (x) { if (!x) return; var p = x.split('/'); kid2.push(p[0]); cat[p[0]] = p[1]; if (p[2] === 'k') kata[p[0]] = 1; dict[p[0]] = 1; });
    WORDS.forEach(function (w) { dict[w] = 1; });
    // ひらがなで 書く ことばを 先に（カタカナ語は、その字が ほかに ない ときだけ 使う）
    _W = { dict: dict, kid: kid, kid2: kid2, cat: cat, kata: kata, native: kid.filter(function (w) { return !kata[w]; }) };
    return _W;
  }
  var KANA_ALL = Array.from('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょー');
  function bigKana(k) { return SMALL[k] || k; }
  // カタカナ語は カタカナで 見せる（スニーカー）
  function showWord(w) {
    if (!WD().kata[w]) return w;
    return String(w).replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }

  // ---------- あなうめカード：□に 入る 字は 3つとも 同じ。その字を じゅんに 読む ----------
  // ⚠ ほかの 字を 入れても 3つ とも ことばに なる ときは 出さない（辞書 ぜんぶで たしかめる）
  function anaumeAlts(ks, at) {
    var d = WD().dict, out = [];
    KANA_ALL.forEach(function (x) {
      if (bigKana(x) === bigKana(ks[at])) return;   // 小さい字と大きい字は 同じ 答え
      var t = ks.slice(); t[at] = x;
      if (d[t.join('')]) out.push(x);
    });
    return out;
  }
  function anaumePuzzle(yomi, seed) {
    var ks = kanaList(yomi), ans = ks.join('');
    var r = rng(((Number(seed) >>> 0) ^ 0xA7A0) + 13);
    var used = {}, rows = [];
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i], pick = null;
      for (var pass = 0; pass < 3 && !pick; pass++) pick = anaumePick(k, pass === 0 ? WD().native : pass === 1 ? WD().kid : WD().kid.concat(WD().kid2), used, ans, r);
      if (!pick) return { ok: false, reason: '「' + k + '」の あなうめが 作れません' };
      pick.forEach(function (t) { used[t.w] = 1; });
      rows.push({ kana: k, words: pick.map(function (t) { return { w: t.w, at: t.at, show: showWord(t.w) }; }) });
    }
    return { ok: true, kind: 'anaume', answer: ans, rows: rows };
  }
  function anaumePick(k, list, used, ans, r) {
      var cands = [];
      list.forEach(function (w) {
        if (used[w] || w.indexOf(ans) >= 0 || ans.indexOf(w) >= 0) return;
        var a = Array.from(w), at = a.indexOf(k);
        if (at < 0 || a.indexOf(k, at + 1) >= 0 || a.length > 5) return;
        if (k === 'ー' && at === 0) return;
        cands.push({ w: w, at: at, alts: anaumeAlts(a, at) });
      });
      cands = shuffle(cands, r);
      // ほかの字の 入る ことばが 少ない ものから 見る（すぐ 決まる 組を さがしやすい）
      cands.sort(function (x, y) { return x.alts.length - y.alts.length; });
      cands = cands.slice(0, 40);
      cands = shuffle(cands, r);
      var pick = null;
      for (var a = 0; a < cands.length && !pick; a++) for (var b = a + 1; b < cands.length && !pick; b++) {
        var ab = cands[a].alts.filter(function (x) { return cands[b].alts.indexOf(x) >= 0; });
        for (var c = b + 1; c < cands.length && !pick; c++) {
          var tri = [cands[a], cands[b], cands[c]];
          if (tri.every(function (t) { return t.at === 0; })) continue;   // 頭の字ばかりは かんたんすぎる
          var pats = tri.map(function (t) { var q = Array.from(t.w); q[t.at] = '□'; return q.join(''); });
          if (new Set(pats).size < 3) continue;
          if (ab.filter(function (x) { return tri[2].alts.indexOf(x) >= 0; }).length) continue;
          pick = tri;
        }
      }
      return pick;
  }
  function anaumeBlank(x) { var q = Array.from(x.show || x.w); q[x.at] = '□'; return q.join(''); }
  // 3つ とも ことばに なる 字（テスト用。1つだけで、答えの字と 同じ）
  function anaumeFits(row) {
    var d = WD().dict;
    return KANA_ALL.filter(function (x) {
      return row.words.every(function (o) { var q = Array.from(o.w); q[o.at] = x; return d[q.join('')]; });
    });
  }

  // ---------- かくれんぼ文字カード：ことばを ぜんぶ 消すと、のこった 字が 答え ----------
  var WS_CATS = [{ id: 'どうぶつ', word: 'どうぶつ', unit: 'ひき' }, { id: 'たべもの', word: 'たべもの', unit: 'こ' }];
  var DIR8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  function wsClean(g, n, catSet, placed) {
    var ok = {};
    placed.forEach(function (p) { ok[p.cells.join(',')] = 1; });
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) for (var d = 0; d < 8; d++) {
      var s = '', cells = [];
      for (var i = 0; i < n; i++) {
        var xx = x + DIR8[d][0] * i, yy = y + DIR8[d][1] * i;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) break;
        s += g[yy * n + xx]; cells.push(yy * n + xx);
        if (i >= 1 && catSet[s] && !ok[cells.join(',')]) return false;
      }
    }
    return true;
  }
  function wordSearchPuzzle(yomi, seed) {
    var ks = kanaList(yomi), L = ks.length, ans = ks.join('');
    var r = rng(((Number(seed) >>> 0) ^ 0x5EA7) + 17);
    var n = L <= 3 ? 4 : 5;
    var cats = shuffle(WS_CATS, r);
    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci], catSet = {};
      var all = WD().kid.filter(function (w) { return WD().cat[w] === cat.id; });
      all.forEach(function (w) { catSet[w] = 1; });
      var pool = all.filter(function (w) {
        if (WD().kata[w]) return false;
        var m = Array.from(w).length;
        return m >= 2 && m <= 4 && !/[ぁぃぅぇぉっゃゅょゎ]/.test(w) && w.indexOf(ans) < 0 && ans.indexOf(w) < 0;
      });
      for (var t = 0; t < 400; t++) {
        var g = [], placed = [], empty = n * n, guard = 0;
        for (var q = 0; q < n * n; q++) g.push(null);
        while (empty > L && guard++ < 500) {
          var w = pool[Math.floor(r() * pool.length)];
          if (placed.some(function (p) { return p.w === w; })) continue;
          var a = Array.from(w), m = a.length;
          if (empty - m < L) continue;
          var d = DIR8[Math.floor(r() * 4)], x0 = Math.floor(r() * n), y0 = Math.floor(r() * n), cells = [];
          for (var i = 0; i < m; i++) {
            var xx = x0 + d[0] * i, yy = y0 + d[1] * i;
            if (xx < 0 || yy < 0 || xx >= n || yy >= n || g[yy * n + xx] !== null) { cells = null; break; }
            cells.push(yy * n + xx);
          }
          if (!cells) continue;
          cells.forEach(function (c, j) { g[c] = a[j]; });
          placed.push({ w: w, cells: cells });
          empty -= m;
        }
        if (empty !== L || placed.length < 3) continue;
        var j = 0, rest = [];
        for (var c = 0; c < n * n; c++) if (g[c] === null) { g[c] = ks[j++]; rest.push(c); }
        // 答えの 字が ぜんぶ ならんで 見えたら 消さなくても 読めてしまう
        if (rest.every(function (x, k) { return !k || x === rest[k - 1] + 1; }) && L >= 3) continue;
        if (!wsClean(g, n, catSet, placed)) continue;
        return { ok: true, kind: 'wordsearch', answer: ans, n: n, grid: g, words: placed.map(function (p) { return p.w; }), placed: placed, rest: rest, cat: cat.word, unit: cat.unit };
      }
    }
    return { ok: false, reason: 'かくれんぼ文字の 表が 作れません' };
  }

  // ---------- しりとりカード：しりとりで つなぐと、○の 字が 答えに なる ----------
  var SHIRI_BAD_END = /[んーぁぃぅぇぉっゃゅょゎ]$/;
  function firstKana(w) { return Array.from(w)[0]; }
  function lastKana(w) { var a = Array.from(w); return a[a.length - 1]; }
  // つながるか（子どもは「が」→「か」も つなげるので ゆるく 見る）
  function shiriLink(a, b) { return baseKana(lastKana(a)) === baseKana(firstKana(b)); }
  function shiritoriPaths(ws, limit) {
    var n = ws.length, cnt = 0, used = [];
    function go(cur, k) {
      if (cnt >= limit) return;
      if (k === n) { cnt++; return; }
      for (var i = 0; i < n; i++) if (!used[i] && (cur < 0 || shiriLink(ws[cur], ws[i]))) { used[i] = 1; go(i, k + 1); used[i] = 0; }
    }
    go(-1, 0);
    return cnt;
  }
  function shiritoriPuzzle(yomi, seed) {
    var ks = kanaList(yomi), L = ks.length, ans = ks.join('');
    if (L < 3) return { ok: false, reason: '2文字の 読みでは しりとりが みじかすぎます' };
    var r = rng(((Number(seed) >>> 0) ^ 0x5419) + 19);
    var all = WD().kid.filter(function (w) {
      var m = Array.from(w).length;
      return m >= 2 && m <= 5 && !SHIRI_BAD_END.test(w) && w.indexOf(ans) < 0 && ans.indexOf(w) < 0;
    });
    var native = all.filter(function (w) { return !WD().kata[w]; });
    var maxWords = Math.min(12, L + 3);
    // ○の ある ことば（答えの 字を じゅんに ふくむ）と、○の ない つなぎの ことばを まぜて、1本の しりとりに する
    var byFirst = function (list) { var m = {}; list.forEach(function (w) { var f = firstKana(w); (m[f] = m[f] || []).push(w); }); return m; };
    var idxN = byFirst(native), idxA = byFirst(all);
    for (var t = 0; t < 60; t++) {
      var pool = t < 30 ? native : all, idx = t < 30 ? idxN : idxA;
      var chain = [], used = {}, nodes = 0;
      var dfs = function (i, prev, run) {
        if (nodes++ > 1500) return false;
        if (i === L) return true;
        if (chain.length >= maxWords) return false;
        var next = (prev ? idx[lastKana(prev)] || [] : pool).filter(function (w) { return !used[w]; });
        var circ = shuffle(next.filter(function (w) { return Array.from(w).indexOf(ks[i]) >= 0; }), r).slice(0, 10);
        var fill = run < 2 && chain.length + (L - i) < maxWords ? shuffle(next, r).slice(0, 6) : [];
        var opts = circ.map(function (w) { return { w: w, c: true }; }).concat(fill.map(function (w) { return { w: w, c: false }; }));
        if (r() < 0.25 && fill.length) opts = opts.slice(circ.length).concat(opts.slice(0, circ.length));   // ときどき つなぎから ためす
        for (var c = 0; c < opts.length; c++) {
          var w = opts[c].w, a = Array.from(w), pos = [];
          if (opts[c].c) a.forEach(function (x, p) { if (x === ks[i]) pos.push(p); });
          used[w] = 1;
          chain.push({ w: w, at: opts[c].c ? pos[Math.floor(r() * pos.length)] : -1, show: showWord(w) });
          if (dfs(opts[c].c ? i + 1 : i, w, opts[c].c ? 0 : run + 1)) return true;
          chain.pop(); used[w] = 0;
        }
        return false;
      };
      if (!dfs(0, null, 0)) continue;
      var ws = chain.map(function (c) { return c.w; });
      if (chain.length < 4 || shiritoriPaths(ws, 2) !== 1) continue;
      var circled = chain.filter(function (c) { return c.at >= 0; });
      // ○が 頭の 字ばかりだと しりとりを しなくても 読める
      if (circled.filter(function (c) { return c.at === 0; }).length > Math.floor(L / 2)) continue;
      var show = shuffle(chain.map(function (c, i) { return i; }), r);
      if (show.every(function (x, i) { return x === i; })) show.reverse();
      return { ok: true, kind: 'shiritori', answer: ans, chain: chain, show: show };
    }
    return { ok: false, reason: 'しりとりが 作れません' };
  }
  function readShiritori(cp) {
    return cp.chain.filter(function (c) { return c.at >= 0; }).map(function (c) { return Array.from(c.w)[c.at]; }).join('');
  }

  // ---------- やじるし迷路の しくみ（やじるし迷路・さかのぼり迷路で 同じ） ----------
  // ゴールに つく 道が いくつも ある（答えの 道や ほかの 道に、とちゅうから 合流する）。
  // どの 道も 読めるが、ことばに なるのは 答えの 道 1本だけ（ほかの 道の 読みは 辞書に ない。濁点・小さい字の ちがいも 見る）。
  var ARW_OF = { '1,0': 'r', '-1,0': 'l', '0,1': 'd', '0,-1': 'u' };
  // ほかの 道の 字（ぱ行・ぬ・へ などの めずらしい 字は 入れない。見ただけで ことばで ないと わかって しまうので）
  var MAZE_KANA = Array.from('あいうえおかきくけこさしすせそたちつてとなにのはひふほまみめもやゆよらりるれろわんがぎぐござじずだでどばびぶ');
  var _loose = null;
  function looseKey(w) { return Array.from(w).map(baseKana).join(''); }
  // ことばか（辞書に あるか。「は」と「ば」、「や」と「ゃ」の ちがいだけの ものも ことばと みる）
  function isWordish(w) {
    var d = WD().dict;
    if (d[w]) return true;
    if (!_loose) { _loose = {}; Object.keys(d).forEach(function (x) { _loose[looseKey(x)] = 1; }); }
    return !!_loose[looseKey(w)];
  }
  // opt：decoys＝ほかの 道の 数／cycles＝のこりの マスを ぐるぐる まわる 輪に する（さかのぼり迷路）／minLen・maxLen＝ほかの 道の 字数／pool＝のこりの マスの 字
  function branchMaze(ks, n, r, opt) {
    var L = ks.length, ans = ks.join('');
    var key = function (x, y) { return x + ',' + y; };
    var pt = function (k) { return k.split(',').map(Number); };
    var inb = function (x, y) { return x >= 0 && y >= 0 && x < n && y < n; };
    var D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var tries = 0; tries < 1500; tries++) {
      // 答えの 道
      var path = [], nxt = {}, kana = {}, suf = {}, used = {}, x = Math.floor(r() * n), y = Math.floor(r() * n), okp = true;
      path.push([x, y]); used[key(x, y)] = 1;
      while (path.length < L) {
        var ds = shuffle(D4, r).filter(function (d) { return inb(x + d[0], y + d[1]) && !used[key(x + d[0], y + d[1])]; });
        if (!ds.length) { okp = false; break; }
        x += ds[0][0]; y += ds[0][1]; path.push([x, y]); used[key(x, y)] = 1;
      }
      if (!okp) continue;
      path.forEach(function (p, i) {
        var k = key(p[0], p[1]); kana[k] = ks[i]; suf[k] = ks.slice(i).join('');
        if (i < L - 1) nxt[k] = key(path[i + 1][0], path[i + 1][1]);
      });
      // ほかの 道：合流する マス（答えの 道の 2マス目から先・ほかの 道の とちゅう）から 外へ のばす
      var targets = path.slice(1).map(function (p) { return key(p[0], p[1]); });
      var starts = [key(path[0][0], path[0][1])], reads = [ans], made = 0, guard = 0;
      while (made < opt.decoys && guard++ < 80) {
        var t = targets[Math.floor(r() * targets.length)];
        var tl = opt.minLen + Math.floor(r() * (opt.maxLen - opt.minLen + 1));
        var b = tl - Array.from(suf[t]).length;
        if (b < 1 || b > 4) continue;
        var cells = [], cur = pt(t), taken = {}, ok2 = true;
        for (var s2 = 0; s2 < b; s2++) {
          var cand = shuffle(D4, r).map(function (d) { return [cur[0] + d[0], cur[1] + d[1]]; })
            .filter(function (q) { return inb(q[0], q[1]) && !used[key(q[0], q[1])] && !taken[key(q[0], q[1])]; });
          if (!cand.length) { ok2 = false; break; }
          cur = cand[0]; cells.push(key(cur[0], cur[1])); taken[key(cur[0], cur[1])] = 1;
        }
        if (!ok2) continue;
        // 字：その 道の 読みが ことばに ならない ものを 選ぶ（答えの 字も まぜて、まぎらわしく する）
        var letters = null;
        for (var lt = 0; lt < 60 && !letters; lt++) {
          var ls = cells.map(function () {
            var c = r() < 0.45 ? ks[Math.floor(r() * L)] : '';
            if (!c || MAZE_KANA.indexOf(c) < 0) c = MAZE_KANA[Math.floor(r() * MAZE_KANA.length)];
            return c;
          });
          var head = ls.slice().reverse();   // cells[0] が 合流先の となり・cells[b-1] が スタート
          if (head[0] === 'ん') continue;
          var rd = head.join('') + suf[t];
          if (reads.indexOf(rd) >= 0 || isWordish(rd)) continue;
          letters = ls; reads.push(rd);
        }
        if (!letters) continue;
        cells.forEach(function (c, i) {
          used[c] = 1; kana[c] = letters[i]; nxt[c] = i ? cells[i - 1] : t;
          suf[c] = letters.slice(0, i + 1).reverse().join('') + suf[t];
          if (i < b - 1) targets.push(c);
        });
        starts.push(cells[b - 1]);
        made++;
      }
      if (made < opt.decoys) continue;
      // のこりの マス
      var free = [];
      for (var yy = 0; yy < n; yy++) for (var xx = 0; xx < n; xx++) if (!used[key(xx, yy)]) free.push(key(xx, yy));
      if (opt.cycles) {
        if (!cycleCover(free, nxt, r, pt)) continue;
        // 2マスで さしあう 組が 多すぎると 輪が すぐ 見える
        var pairs = 0;
        free.forEach(function (k) { if (nxt[nxt[k]] === k) pairs++; });
        if (pairs / 2 > Math.ceil(free.length / 8)) continue;
      } else {
        free.forEach(function (k) {
          var p = pt(k), d = shuffle(D4, r).filter(function (d2) { return inb(p[0] + d2[0], p[1] + d2[1]); })[0];
          nxt[k] = key(p[0] + d[0], p[1] + d[1]);
        });
      }
      var pool = shuffle(opt.pool.slice(), r);
      free.forEach(function (k) { kana[k] = pool.pop() || 'ぬ'; });
      var isStart = {};
      starts.forEach(function (k) { isStart[k] = 1; });
      var grid = [];
      for (var gy = 0; gy < n; gy++) {
        var row = [];
        for (var gx = 0; gx < n; gx++) {
          var k2 = key(gx, gy), cell = { kana: kana[k2] };
          if (!nxt[k2]) cell.dir = 'goal';
          else { var to = pt(nxt[k2]); cell.dir = ARW_OF[(to[0] - gx) + ',' + (to[1] - gy)]; }
          if (opt.kind === 'arrow' && isStart[k2]) cell.start = true;
          row.push(cell);
        }
        grid.push(row);
      }
      return { ok: true, kind: opt.kind, answer: ans, size: n, grid: grid, start: path[0], path: path,
        starts: shuffle(starts, r).map(pt), paths: starts.length };
    }
    return { ok: false, reason: opt.kind === 'arrow' ? '迷路が作れませんでした' : 'さかのぼり迷路が 作れません' };
  }
  // のこりの マスを、ぐるぐる まわる 輪で うめる（まず 2マスずつ ならべ、となりあう 輪を つなげて 大きく する）
  function cycleCover(free, nxt, r, pt) {
    var inFree = {}, taken = {}, cyc = {}, id = 0, nodes = 0;
    free.forEach(function (k) { inFree[k] = 1; });
    var tile = function () {
      if (nodes++ > 2000) return false;
      var f = null;
      for (var i = 0; i < free.length; i++) if (!taken[free[i]]) { f = free[i]; break; }
      if (!f) return true;
      var p = pt(f), ps = shuffle([[1, 0], [0, 1], [-1, 0], [0, -1]], r);
      for (var k = 0; k < ps.length; k++) {
        var q = (p[0] + ps[k][0]) + ',' + (p[1] + ps[k][1]);
        if (!inFree[q] || taken[q]) continue;
        taken[f] = taken[q] = 1; nxt[f] = q; nxt[q] = f; cyc[f] = cyc[q] = id++;
        if (tile()) return true;
        taken[f] = taken[q] = 0; delete nxt[f]; delete nxt[q];
      }
      return false;
    };
    if (!tile()) return false;
    var adj = function (a, b) { var A = pt(a), B = pt(b); return Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) === 1; };
    for (var round = 0; round < 40; round++) {
      var keys = shuffle(free.slice(), r), done = false;
      for (var i2 = 0; i2 < keys.length && !done; i2++) {
        var u = keys[i2], v = nxt[u];
        for (var j2 = 0; j2 < keys.length && !done; j2++) {
          var yk = keys[j2], xk = nxt[yk];
          if (cyc[yk] === cyc[u] || !adj(u, xk) || !adj(yk, v)) continue;
          // u→v と y→x を、u→x と y→v に かえる（2つの 輪が 1つに なる）
          nxt[u] = xk; nxt[yk] = v;
          var old = cyc[yk];
          free.forEach(function (c) { if (cyc[c] === old) cyc[c] = cyc[u]; });
          done = true;
        }
      }
      if (!done || r() < 0.08) break;
    }
    return true;
  }

  // ---------- さかのぼり迷路カード：スタートが かいていない やじるし迷路 ----------
  // ゴールから さかのぼると 道が わかれる。わかれた 先を ぜんぶ たどると、だれにも さされていない マス（スタートの 候補）が いくつか ある。
  // その 道を 読み くらべて、ことばに なる 1本を えらぶ。ほかの マスは ぐるぐる まわる 輪（ゴールに つかない）
  function sakanoboriPuzzle(yomi, seed) {
    var ks = kanaList(yomi), L = ks.length;
    if (L < 3) return { ok: false, reason: '2文字の 読みでは 迷路が かんたんすぎます' };
    var r = rng(((Number(seed) >>> 0) ^ 0x5A1C) + 23);
    return branchMaze(ks, L <= 4 ? 4 : L <= 7 ? 5 : 6, r, {
      kind: 'sakanobori', decoys: L <= 3 ? 2 : (r() < 0.5 ? 2 : 3), cycles: true, minLen: Math.max(3, L - 1), maxLen: L + 2,
      pool: WORDS.join('').split('').filter(function (c) { return c !== 'ー'; })
    });
  }
  function cellNext(cp, x, y) {
    var c = cp.grid[y][x];
    if (c.dir === 'goal') return null;
    return [x + (c.dir === 'r' ? 1 : c.dir === 'l' ? -1 : 0), y + (c.dir === 'd' ? 1 : c.dir === 'u' ? -1 : 0)];
  }
  // さされている 数（テスト用）
  function inDegrees(cp) {
    var n = cp.size, deg = [];
    for (var i = 0; i < n * n; i++) deg.push(0);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { var t = cellNext(cp, x, y); if (t) deg[t[1] * n + t[0]]++; }
    return deg;
  }

  // ========== ロボット研究所（4つ目の 物語） ==========
  // ---------- 一：光の ぼうの 式（マッチぼう）。1本だけ うごかして 正しい 式に する ----------
  // ぼうの 場所：a上 b右上 c右下 d下 e左下 f左上 g中（1・2・4・8・16・32・64）
  var SEG7 = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F];
  // 式の ぼう 22本：A の7本・＋の たて棒1本・B の7本・C の7本（「＝」と ＋の よこ棒は うごかさない）
  function eqBits(a, plus, b, c) {
    var bits = [];
    [[a, 0]].forEach(function () {});
    for (var i = 0; i < 7; i++) bits.push(!!(SEG7[a] & (1 << i)));
    bits.push(!!plus);
    for (var j = 0; j < 7; j++) bits.push(!!(SEG7[b] & (1 << j)));
    for (var k = 0; k < 7; k++) bits.push(!!(SEG7[c] & (1 << k)));
    return bits;
  }
  function digitOf(bits, off) {
    var m = 0;
    for (var i = 0; i < 7; i++) if (bits[off + i]) m |= 1 << i;
    return SEG7.indexOf(m);
  }
  function readEq(bits) {
    var a = digitOf(bits, 0), b = digitOf(bits, 8), c = digitOf(bits, 15);
    if (a < 0 || b < 0 || c < 0) return null;
    return { a: a, plus: bits[7], b: b, c: c, ok: (bits[7] ? a + b : a - b) === c };
  }
  var _MATCH = null;
  function matchPool() {
    if (_MATCH) return _MATCH;
    var out = [];
    for (var a = 0; a <= 9; a++) for (var b = 0; b <= 9; b++) for (var c = 0; c <= 9; c++) for (var p = 0; p < 2; p++) {
      if ((p ? a + b : a - b) === c) continue;
      var bits = eqBits(a, p, b, c), sols = [];
      for (var f = 0; f < 22; f++) {
        if (!bits[f]) continue;
        for (var t = 0; t < 22; t++) {
          if (t === f || bits[t]) continue;
          var nb = bits.slice(); nb[f] = false; nb[t] = true;
          var e = readEq(nb);
          if (e && e.ok) sols.push({ from: f, to: t, eq: e });
        }
      }
      // 答えは 1つだけ。＝の 右の 数が かわる もの（見ただけでは 次の 数が わからない）
      if (sols.length === 1 && sols[0].eq.c !== c && a && b && sols[0].eq.a && sols[0].eq.b) out.push({ a: a, plus: !!p, b: b, c: c, sol: sols[0] });
    }
    _MATCH = out;
    return out;
  }
  function matchPuzzle(seed) {
    var pool = matchPool(), r = rng(((Number(seed) >>> 0) ^ 0x3A7C) + 29);
    // ちがう 数字へ ぼうを うつす ものを 多めに（同じ 数字の 中で うごかすより ひらめきが いる）
    var cross = pool.filter(function (q) { return Math.floor(q.sol.from / 7.5) !== Math.floor(q.sol.to / 7.5); });
    var src = cross.length && r() < 0.7 ? cross : pool;
    var q = src[Math.floor(r() * src.length)];
    return { ok: true, a: q.a, plus: q.plus, b: q.b, c: q.c, sol: q.sol, answer: q.sol.eq.c, bits: eqBits(q.a, q.plus, q.b, q.c) };
  }
  function eqText(e) { return e.a + (e.plus ? '＋' : '−') + e.b + '＝' + e.c; }

  // ---------- 二：かがみに うつった 時計（数字の ない 時計。上の「12」だけ かがみ文字） ----------
  function mirrorClockPuzzle(seed) {
    var r = rng(((Number(seed) >>> 0) ^ 0x31C0) + 31);
    var hs = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
    var h = hs[Math.floor(r() * hs.length)];
    return { ok: true, answer: h, shown: 12 - h };
  }

  // ---------- 三：すける シートと パネルを かさねる ----------
  // シート（時こく）と パネル（数）の 組で、文字が うかぶ。正しい 組は（ほんとうの 時こく・正しい 式の 答え）だけ。
  // まちがえた 組の いくつかは、ほかの 場所の 名前が うかぶ（にせもの）
  function labPuzzle(yomi, seed, avoid) {
    var ks = kanaList(yomi);
    if (!ks.length) return { ok: false, reason: '読みが空です' };
    if (ks.length > 9) return { ok: false, reason: '読みが 長すぎます' };
    var m = matchPuzzle(seed), mc = mirrorClockPuzzle(seed);
    var r = rng(((Number(seed) >>> 0) ^ 0x1AB0) + 37);
    var N = m.answer, nums = [N, m.c];
    shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], r).forEach(function (d) { if (nums.length < 4 && nums.indexOf(d) < 0) nums.push(d); });
    var h = mc.answer, times = [h, 12 - h];
    shuffle([1, 2, 3, 4, 5, 7, 8, 9, 10, 11], r).forEach(function (t) { if (times.length < 3 && times.indexOf(t) < 0) times.push(t); });
    var ng = [looseKana(yomi)].concat((avoid || []).map(looseKana));
    var dpool = shuffle(DECOYS.filter(function (w) { return ng.indexOf(looseKana(w)) < 0 && kanaList(w).length <= 9; }), r);
    dpool.sort(function (a, b) { return Math.abs(kanaList(a).length - ks.length) - Math.abs(kanaList(b).length - ks.length); });
    var dec = dpool.slice(0, 3);
    var panels = [
      { num: N, top: h, word: ks.join(''), real: true },
      { num: m.c, top: h, word: dec[0] },            // 式を なおさずに 読んだ とき
      { num: nums[2], top: 12 - h, word: dec[1] },   // 時計を かがみの まま 読んだ とき
      { num: nums[3], top: times[2], word: dec[2] }
    ];
    return {
      ok: true, answer: ks.join(''), match: m, mclock: mc, N: N, h: h,
      tops: shuffle(times, r), panels: shuffle(panels, r), decoys: dec
    };
  }
  // シートと パネルを かさねたときに うかぶ ことば（テスト用。うかばなければ ''）
  function overlayWord(lab, top, num) {
    var p = lab.panels.filter(function (x) { return x.num === num; })[0];
    return p && p.top === top ? p.word : '';
  }

  // ---------- からくり箱：ロボットの プログラム（ボルトから 見て 右・左） ----------
  var RB_D = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 0上 1右 2下 3左
  function runProg(rb, mode) {
    var x = rb.start[0], y = rb.start[1], d = rb.dir, n = rb.n, out = false;
    var step = function (c) {
      if (c === 'F') { x += RB_D[d][0]; y += RB_D[d][1]; if (x < 0 || y < 0 || x >= n || y >= n) out = true; }
      else if (mode === 'abs') d = c === 'R' ? 1 : 3;
      else if ((c === 'R') !== (mode === 'swap')) d = (d + 1) % 4;
      else d = (d + 3) % 4;
    };
    rb.prog.forEach(function (it) {
      if (typeof it === 'string') step(it);
      else for (var k = 0; k < (mode === 'once' ? 1 : it.rep); k++) it.body.forEach(step);
    });
    return out ? null : [x, y];
  }
  function robotPuzzle(seed) {
    var r = rng(((Number(seed) >>> 0) ^ 0x7B07) + 41), n = 5;
    var cmd = function () { var q = r(); return q < 0.5 ? 'F' : q < 0.75 ? 'R' : 'L'; };
    for (var t = 0; t < 3000; t++) {
      var rb = { n: n, start: [Math.floor(r() * n), Math.floor(r() * n)], dir: r() < 0.8 ? 1 + Math.floor(r() * 3) : 0, prog: [] };
      if (r() < 0.6) rb.prog.push(cmd());
      var body = [], bl = 2 + Math.floor(r() * 2);
      for (var i = 0; i < bl; i++) body.push(cmd());
      if (body.indexOf('F') < 0 || (body.indexOf('R') < 0 && body.indexOf('L') < 0)) continue;
      rb.prog.push({ rep: 2 + Math.floor(r() * 3), body: body });
      var sl = 1 + Math.floor(r() * 2);
      for (var s2 = 0; s2 < sl; s2++) rb.prog.push(cmd());
      if (rb.prog[rb.prog.length - 1] !== 'F') rb.prog.push('F');
      var end = runProg(rb, 'ok');
      if (!end || (end[0] === rb.start[0] && end[1] === rb.start[1])) continue;
      var fs = 0, turns = 0;
      rb.prog.forEach(function (it) {
        var list = typeof it === 'string' ? [it] : [].concat.apply([], Array(it.rep).fill(it.body));
        list.forEach(function (c) { if (c === 'F') fs++; else turns++; });
      });
      if (fs < 5 || turns < 3) continue;
      var same = ['abs', 'once', 'swap'].some(function (md) { var e = runProg(rb, md); return e && e[0] === end[0] && e[1] === end[1]; });
      if (same) continue;
      var labels = shuffle(Array.from({ length: n * n }, function (_, i) { return i + 1; }), r);
      rb.labels = labels; rb.end = end; rb.answer = labels[end[1] * n + end[0]]; rb.ok = true;
      return rb;
    }
    return { ok: false, reason: 'プログラムが 作れません' };
  }

  // ヒント用：はじめの 命令と くりかえし 1回目が おわった ところ
  function robotHint(rb) {
    var part = { n: rb.n, start: rb.start, dir: rb.dir, prog: [] };
    for (var i = 0; i < rb.prog.length; i++) {
      var it = rb.prog[i];
      if (typeof it === 'string') part.prog.push(it);
      else { part.prog.push({ rep: 1, body: it.body }); break; }
    }
    var x = rb.start[0], y = rb.start[1], d = rb.dir;
    var all = [];
    part.prog.forEach(function (q) { if (typeof q === 'string') all.push(q); else all = all.concat(q.body); });
    all.forEach(function (c) { if (c === 'F') { x += RB_D[d][0]; y += RB_D[d][1]; } else d = c === 'R' ? (d + 1) % 4 : (d + 3) % 4; });
    return { label: rb.labels[y * rb.n + x], dir: d };
  }
  // ---------- さいご：2つの タンクで ちょうどの オイルを はかる ----------
  var JUG_OPS = ['fillA', 'fillB', 'emptyA', 'emptyB', 'AtoB', 'BtoA'];
  function jugStep(s, op, a, b) {
    var x = s[0], y = s[1], m;
    if (op === 'fillA') x = a; else if (op === 'fillB') y = b;
    else if (op === 'emptyA') x = 0; else if (op === 'emptyB') y = 0;
    else if (op === 'AtoB') { m = Math.min(x, b - y); x -= m; y += m; }
    else if (op === 'BtoA') { m = Math.min(y, a - x); y -= m; x += m; }
    return [x, y];
  }
  function jugSolve(a, b, t) {
    var seen = { '0,0': null }, q = [[0, 0]];
    while (q.length) {
      var s = q.shift();
      if (s[0] === t || s[1] === t) {
        var path = [], k = s.join(',');
        while (seen[k]) { path.unshift(seen[k].op); k = seen[k].from; }
        return path;
      }
      for (var i = 0; i < JUG_OPS.length; i++) {
        var ns = jugStep(s, JUG_OPS[i], a, b), nk = ns.join(',');
        if (!(nk in seen)) { seen[nk] = { from: s.join(','), op: JUG_OPS[i] }; q.push(ns); }
      }
    }
    return null;
  }
  var _JUGS = null;
  function jugPool() {
    if (_JUGS) return _JUGS;
    var out = [];
    for (var a = 3; a <= 7; a++) for (var b = a + 2; b <= 9; b++) for (var t = 1; t < b; t++) {
      if (t === a) continue;
      var p = jugSolve(a, b, t);
      if (p && p.length >= 5 && p.length <= 8) out.push({ a: a, b: b, t: t, steps: p.length, sol: p });
    }
    _JUGS = out;
    return out;
  }
  function jugPuzzle(seed) {
    var pool = jugPool(), r = rng(((Number(seed) >>> 0) ^ 0x10C5) + 43);
    var q = pool[Math.floor(r() * pool.length)];
    return { ok: true, a: q.a, b: q.b, t: q.t, steps: q.steps, sol: q.sol };
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
      if (/^ー/.test(normKana(pl.yomi || ''))) errs.push(lab + 'の読みは「ー」から はじめられません');
    });
    if (p[0] && p[1] && looseKana(p[0].yomi) && looseKana(p[0].yomi) === looseKana(p[1].yomi)) errs.push('隠し場所1と2が同じです');
    if (!errs.length) {
      var cards = setup.cards || {};
      var k1 = (cards.p1 && cards.p1.kind) || 'letter', k2 = (cards.p2 && cards.p2.kind) || 'clock';
      [[k1, 0, '暗号その1'], [k2, 1, '暗号その2']].forEach(function (x) {
        var kind = x[0], y = p[x[1]].yomi, lab = x[2];
        if (kind === 'letter') {
          var lp = letterPuzzle(y, setup.seed);
          if (!lp.ok) errs.push(lab + '（文字ひろい）：読みの「' + (lp.missing || []).join('・') + '」を使う言葉が手持ちにありません。暗号の種類か場所を変えてください');
        } else if (kind === 'clock') {
          if (!clockPuzzle(y, setup.seed).ok) errs.push(lab + '：時計の暗号が作れません。暗号の種類を変えてください');
        } else if (kind === 'shift') {
          var ch = chainPuzzle(y, setup.seed, [p[1 - x[1]].yomi]);
          if (!ch.ok) errs.push(lab + '（ずらし文字）：' + ch.reason);
        } else if (kind === 'overlay') {
          var lb = labPuzzle(y, setup.seed, [p[1 - x[1]].yomi]);
          if (!lb.ok) errs.push(lab + '（すける シート）：' + lb.reason);
        } else if (kind === 'image') {
          var c = cards[x[1] ? 'p2' : 'p1'] || {};
          if (!c.img) errs.push(lab + '：画像のURLか写真を入れてください');
        } else {
          var cp = cardPuzzle(kind, y, (Number(setup.seed) >>> 0) + x[1]);
          if (!cp.ok) errs.push(lab + '：' + cp.reason + '。暗号の種類を変えてください');
        }
      });
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
    WORDS: WORDS, letterPuzzle: letterPuzzle, CARD_KINDS: CARD_KINDS, cardPuzzle: cardPuzzle, walkArrow: walkArrow, readAlien: readAlien, ALIEN_KANA: ALIEN_KANA, ALIEN_GLYPHS: ALIEN_GLYPHS, alienIndex: alienIndex, baseKana: baseKana, markOf: markOf, readGojuon: readGojuon, gojuonPos: gojuonPos, clockPuzzle: clockPuzzle, makeExpr: makeExpr, evalExpr: evalExpr,
    KANA46: KANA46, balancePuzzle: balancePuzzle, balanceWeight: balanceWeight, MESSENGERS: MESSENGERS, liarPuzzle: liarPuzzle, liarSolutions: liarSolutions, chainPuzzle: chainPuzzle, readShift: readShift, magicPuzzle: magicPuzzle, MG_LINES: MG_LINES, MG_SQUARES: MG_SQUARES, LOCK_ITEMS: LOCK_ITEMS, orderPuzzle: orderPuzzle, lockSolutions: lockSolutions,
    WD: WD, showWord: showWord, KANA_ALL: KANA_ALL, anaumeFits: anaumeFits, anaumeBlank: anaumeBlank, shiritoriPaths: shiritoriPaths, readShiritori: readShiritori, shiriLink: shiriLink, inDegrees: inDegrees, cellNext: cellNext, isWordish: isWordish,
    SEG7: SEG7, eqBits: eqBits, readEq: readEq, eqText: eqText, matchPool: matchPool, matchPuzzle: matchPuzzle, mirrorClockPuzzle: mirrorClockPuzzle, labPuzzle: labPuzzle, overlayWord: overlayWord,
    robotPuzzle: robotPuzzle, runProg: runProg, robotHint: robotHint, jugPuzzle: jugPuzzle, jugPool: jugPool, jugStep: jugStep, jugSolve: jugSolve, JUG_OPS: JUG_OPS,
    sceneCode: sceneCode, encodeTag: encodeTag, decodeTag: decodeTag, safeCode: safeCode,
    checkSetup: checkSetup, fill: fill, esc: esc, rubyHtml: rubyHtml, speechText: speechText, plainText: plainText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NazoLogic = api;
})(this);
