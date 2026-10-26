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

  // ---------- 暗号カード（隠し場所の読みから作る。絵は cards.js が描く） ----------
  // ⚠ どの種類も答えは読みそのもの。作れない読みは ok:false と理由を返し、準備画面で選べなくする。
  var CARD_KINDS = ['mirror', 'tanuki', 'gojuon', 'arrow'];
  var DAKU_OF = { 'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ', 'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ', 'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と', 'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ' };
  var HAN_OF = { 'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ' };
  // あいうえお表（列＝あ行〜ん。行＝上から1〜5。空きは ''）
  var GOJUON = [
    'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも',
    'や ゆ よ', 'らりるれろ', 'わ   を', 'ん    '
  ];
  // 字を あいうえお表の場所と しるし（゛゜小）に分ける
  function gojuonPos(k) {
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
  function cardPuzzle(kind, yomi, seed) {
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
      // やじるし迷路：スタートから矢印のとおりに進むと読みが出る。ほかの マスは まぎらわしい字と矢印
      var size = ks.length <= 5 ? 4 : 5;
      for (var tries = 0; tries < 400; tries++) {
        var path = [], used = {}, x = Math.floor(r() * size), y = Math.floor(r() * size);
        path.push([x, y]); used[x + ',' + y] = 1;
        var okp = true;
        while (path.length < ks.length) {
          var dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], r).filter(function (d) {
            var nx = x + d[0], ny = y + d[1];
            return nx >= 0 && ny >= 0 && nx < size && ny < size && !used[nx + ',' + ny];
          });
          if (!dirs.length) { okp = false; break; }
          x += dirs[0][0]; y += dirs[0][1]; path.push([x, y]); used[x + ',' + y] = 1;
        }
        if (!okp) continue;
        var grid = [], pool = shuffle(WORDS.join('').split('').filter(function (c) { return ks.indexOf(c) < 0; }), r);
        var ARW = { '1,0': 'r', '-1,0': 'l', '0,1': 'd', '0,-1': 'u' };
        for (var yy = 0; yy < size; yy++) {
          var row = [];
          for (var xx = 0; xx < size; xx++) {
            var dd = shuffle(['r', 'l', 'd', 'u'], r).filter(function (a) {
              var nx = xx + (a === 'r' ? 1 : a === 'l' ? -1 : 0), ny = yy + (a === 'd' ? 1 : a === 'u' ? -1 : 0);
              return nx >= 0 && ny >= 0 && nx < size && ny < size;
            });
            row.push({ kana: pool.pop() || 'ぬ', dir: dd[0] });
          }
          grid.push(row);
        }
        path.forEach(function (pt, i) {
          var c = grid[pt[1]][pt[0]];
          c.kana = ks[i];
          c.dir = i < path.length - 1 ? ARW[(path[i + 1][0] - pt[0]) + ',' + (path[i + 1][1] - pt[1])] : 'goal';
        });
        grid[path[0][1]][path[0][0]].start = true;
        return { ok: true, kind: kind, answer: answer, size: size, grid: grid, start: path[0], path: path };
      }
      return { ok: false, reason: '迷路が作れませんでした' };
    }
    return { ok: false, reason: '知らない種類です' };
  }
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
      var cards = setup.cards || {};
      var k1 = (cards.p1 && cards.p1.kind) || 'letter', k2 = (cards.p2 && cards.p2.kind) || 'clock';
      [[k1, 0, '暗号その1'], [k2, 1, '暗号その2']].forEach(function (x) {
        var kind = x[0], y = p[x[1]].yomi, lab = x[2];
        if (kind === 'letter') {
          var lp = letterPuzzle(y, setup.seed);
          if (!lp.ok) errs.push(lab + '（文字ひろい）：読みの「' + (lp.missing || []).join('・') + '」を使う言葉が手持ちにありません。暗号の種類か場所を変えてください');
        } else if (kind === 'clock') {
          if (!clockPuzzle(y, setup.seed).ok) errs.push(lab + '：時計の暗号が作れません。暗号の種類を変えてください');
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
    WORDS: WORDS, letterPuzzle: letterPuzzle, CARD_KINDS: CARD_KINDS, cardPuzzle: cardPuzzle, walkArrow: walkArrow, readGojuon: readGojuon, gojuonPos: gojuonPos, clockPuzzle: clockPuzzle, makeExpr: makeExpr, evalExpr: evalExpr,
    sceneCode: sceneCode, encodeTag: encodeTag, decodeTag: decodeTag, safeCode: safeCode,
    checkSetup: checkSetup, fill: fill, esc: esc, rubyHtml: rubyHtml, speechText: speechText, plainText: plainText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NazoLogic = api;
})(this);
