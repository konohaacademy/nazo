// 怪盗からの挑戦状 — 探偵ケータイ D-PHONE の画面（暗号の中身は logic.js、お話は stories/*.json）
//
// 事件ファイル：1つの事件＝物語（story）＋その家の準備（setup：隠し場所・seed・カギの数）＋進み具合（state）。
// 同じ物語でも準備が違えば別の事件（捜査コードもちがう）。タイトル画面で事件をえらんで遊ぶ。
//
// ⚠ 記録はこの端末の localStorage だけ（名前もここにしか残らない）。
// ⚠ iPhone はタグをかざすと Safari が別のページとして開く。Safari で遊んでいれば記録は同じなのでそのまま進む。
//   ホーム画面のアイコンから遊んでいると記録が別なので、開いたページに捜査コードを出して手で入れてもらう。
// ⚠ 隠し場所の準備（setup）も端末ごと。親が別の端末で準備したら「この準備を写すURL」で子どもの端末へ写す。
// 探偵（遊ぶ人）：同じ端末で何人も遊べる。進み具合は 事件×探偵 ごと。名前＋（つけたいときだけ）絵の合言葉3つでログインする。
(function () {
  'use strict';
  var NL = window.NazoLogic;
  var $app = document.getElementById('app');
  var $layer = document.getElementById('layer');
  var K_CASES = 'nazo.v2.cases', K_CUR = 'nazo.v2.cur', K_PIN = 'nazo.v2.pin', K_PREF = 'nazo.v1.pref', K_PARENT = 'nazo.v1.parent';
  // ⚠ v1（事件が1つだけだった版）の置き場。最初に開いたとき事件1へ写す（消さない）
  var K_V1_SETUP = 'nazo.v1.setup', K_V1_STATE = 'nazo.v1.state';
  var K_AGENTS = 'nazo.v2.agents', K_ME = 'nazo.v2.me';
  var K_SEEN = 'nazo.v2.seenStories';   // 事件ファイルに 一度 出した 物語
  // 進み具合は 事件×探偵 ごと。ログインしていなければ置き場が無い（null）
  function stateKey(cid, aid) { aid = aid || (ME && ME.id); return aid ? 'nazo.v2.state.' + cid + '.' + aid : null; }
  // ⚠ 探偵を作る前（2026-10-26 まで）の置き場。最初に開いたとき、記録の名前の探偵へ写す（消さない）
  function legacyKey(cid) { return 'nazo.v2.state.' + cid; }

  var SC = null, PRESETS = [], STEPS = [], STORIES = {}, REG = [], CASES = [], kase = null, PIN = '';
  var AGENTS = [], ME = null;   // 探偵の一覧（{id, name, icon, pass}）と、いまログインしている探偵
  var setup = null, state = null, pref = { sound: true, autoSpeak: false, lastName: '' };
  var route = 'title';
  var V = {};            // いまの画面だけの一時的なもの
  var RV = null;         // 「もどる」で 見返している step の番号（null＝いまの ところ）。V とは別に持つ（入れかけの答えを消さない）
  var tagView = null;    // タグから開いたときに出すもの
  var timers = [];
  var nfc = null;        // { ac: AbortController, step: stepId }

  // ---------- しまう ----------
  function lsGet(k) { if (!k) return null; try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { if (!k) return false; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { if (!k) return; try { localStorage.removeItem(k); } catch (e) { /* 使えない環境 */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 使えない環境 */ } }

  function newSeed() { return (Math.floor(Math.random() * 0x7ffffffe) + 1) >>> 0; }
  function defaultSetup(story) {
    var s = newSeed();
    var df = (STORIES[story] && STORIES[story].defaults) || {};
    return {
      v: 1, seed: s, ready: false, title: '', keyNo: 10 + (s % 40),
      modes: { tag: true, code: true, tap: false },
      places: JSON.parse(JSON.stringify(df.places || [])),
      cards: JSON.parse(JSON.stringify(df.cards || {}))
    };
  }
  function newCaseId() { return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function addCase(story, setupObj) {
    var c = { id: newCaseId(), story: story, setup: setupObj || defaultSetup(story), createdAt: Date.now() };
    CASES.push(c); saveCases();
    return c;
  }
  function saveCases() { lsSet(K_CASES, CASES); }
  function saveSetup() { if (kase) kase.setup = setup; saveCases(); PZ = null; if (SC) flatten(); }
  function caseById(id) { for (var i = 0; i < CASES.length; i++) if (CASES[i].id === id) return CASES[i]; return null; }
  // 遊ぶ事件を切りかえる（setup・state・お話をその事件のものにする）
  function selectCase(id) {
    kase = caseById(id) || CASES[0] || null;
    if (!kase) { setup = null; state = null; SC = null; STEPS = []; return; }
    setup = kase.setup; SC = STORIES[kase.story]; flatten(); PZ = null;
    state = lsGet(stateKey(kase.id));
    if (state && state.seed !== setup.seed) state = null;
    lsSet(K_CUR, kase.id);
  }
  function caseState(c) { var st = lsGet(stateKey(c.id)); return st && st.seed === c.setup.seed ? st : null; }
  function caseName(c) { return (c.setup && c.setup.title) || (STORIES[c.story] && STORIES[c.story].subtitle) || '事件'; }

  // ---------- 探偵（遊ぶ人） ----------
  var AVATARS = ['🕵️', '🦊', '🐱', '🐼', '🦁', '🐸', '🐧', '🦖', '🐰', '🐻', '🦄', '🤖'];
  // 合言葉は絵を3つ（字が読めない子でも入れられる）。順番も合わせる
  var PASS_SYM = ['🍎', '🐶', '⭐', '🚀', '🌙', '🍙', '🚗', '🎈', '🐟'];
  function newAgentId() { return 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function saveAgents() { lsSet(K_AGENTS, AGENTS); }
  function agentById(id) { for (var i = 0; i < AGENTS.length; i++) if (AGENTS[i].id === id) return AGENTS[i]; return null; }
  function sameName(a, b) { return NL.normKana(String(a || '').trim()) === NL.normKana(String(b || '').trim()); }
  function agentByName(nm) { for (var i = 0; i < AGENTS.length; i++) if (sameName(AGENTS[i].name, nm)) return AGENTS[i]; return null; }
  function addAgent(name, icon, pass) {
    var a = { id: newAgentId(), name: String(name).slice(0, 12), icon: icon || AVATARS[AGENTS.length % AVATARS.length], pass: pass || '', createdAt: Date.now() };
    AGENTS.push(a); saveAgents();
    return a;
  }
  // ログイン（null でログアウト）。いま選んでいる事件の記録をその探偵のものにする
  function login(a) {
    ME = a || null;
    if (ME) lsSet(K_ME, ME.id); else lsDel(K_ME);
    selectCase(kase && kase.id);
  }
  function agentLabel(a) { return a ? a.icon + ' ' + esc(a.name) : ''; }
  // 事件ごとに、この端末の探偵それぞれの記録（準備画面で使う）
  function caseStates(c) {
    return AGENTS.map(function (a) {
      var st = lsGet(stateKey(c.id, a.id));
      return { agent: a, st: st && st.seed === c.setup.seed ? st : null };
    });
  }
  function delCaseStates(cid) { AGENTS.forEach(function (a) { lsDel(stateKey(cid, a.id)); }); }
  // 別のページ（タグで開いた Safari のタブ）が先に進めていたら、上書きせずにそちらを採る
  function save() {
    if (!kase) return false;
    if (!state) { lsDel(stateKey(kase.id)); return true; }
    var cur = lsGet(stateKey(kase.id));
    if (cur && cur.seed === state.seed && (cur.rev || 0) > (state.rev || 0)) { state = cur; render(); return false; }
    state.rev = (state.rev || 0) + 1;
    lsSet(stateKey(kase.id), state);
    return true;
  }
  function reloadState() {
    if (!kase) return false;
    var cur = lsGet(stateKey(kase.id));
    if (!cur) return false;
    if (!state || cur.seed !== state.seed || (cur.rev || 0) > (state.rev || 0)) { state = cur; return true; }
    return false;
  }

  // ---------- 暗号（準備が変わるまで使い回す） ----------
  var PZ = null;
  function puz() {
    var key = JSON.stringify(setup.places) + setup.keyNo + JSON.stringify(cardKinds());
    if (PZ && PZ.seed === setup.seed && PZ.k === key) return PZ;
    var ck = cardKinds();
    PZ = {
      seed: setup.seed, k: key,
      lp: NL.letterPuzzle(setup.places[0].yomi, setup.seed),
      cp: NL.clockPuzzle(setup.places[1].yomi, setup.seed),
      sc: NL.safeCode(setup),
      // 暗号カード（その1＝場所1の読み・その2＝場所2の読み）。画像のカードは null
      c1: isGenCard(ck.p1) ? NL.cardPuzzle(ck.p1, setup.places[0].yomi, setup.seed, padWord()) : null,
      c2: isGenCard(ck.p2) ? NL.cardPuzzle(ck.p2, setup.places[1].yomi, setup.seed + 1, padWord()) : null,
      // 忍者やしき：3だんの関門（暗号その1が「ずらし文字」の物語だけ）・からくり箱・からくり錠
      ch: ck.p1 === 'shift' ? NL.chainPuzzle(setup.places[0].yomi, setup.seed, [setup.places[1].yomi]) : null,
      mg: NL.magicPuzzle(setup.seed),
      lk: NL.orderPuzzle(setup.seed),
      // ロボット研究所：3つの テスト（暗号その1が「かさねる シート」の物語だけ）・プログラムの 箱・オイルの タンク
      lab: ck.p1 === 'overlay' ? NL.labPuzzle(setup.places[0].yomi, setup.seed, [setup.places[1].yomi]) : null,
      rb: NL.robotPuzzle(setup.seed),
      jug: NL.jugPuzzle(setup.seed)
    };
    return PZ;
  }
  // ---------- 暗号の種類（準備画面で 暗号ごとに選ぶ） ----------
  // letter＝文字ひろい（その1の元の形）・clock＝時計（その2の元の形）・mirror/tanuki/gojuon/arrow＝自動の暗号カード・image＝自分の画像
  var PUZ_PLACE = { p1: 0, p2: 1 };
  function cardKinds(su) {
    su = su || setup;
    var c = (su && su.cards) || {};
    return { p1: (c.p1 && c.p1.kind) || 'letter', p2: (c.p2 && c.p2.kind) || 'clock' };
  }
  function padWord() { return (SC && SC.padWord) || ''; }
  function cardOpts() { return { theme: (SC && SC.cardTheme) || 'parchment', glyphs: NL.ALIEN_GLYPHS }; }
  function isGenCard(k) { return NL.CARD_KINDS.indexOf(k) >= 0; }
  function isCardKind(k) { return isGenCard(k) || k === 'image'; }
  var SHAPE_NAME = { star: 'ほし', circle: 'まる', triangle: 'さんかく', square: 'しかく', diamond: 'ひしがた', heart: 'ハート', moon: 'つき', drop: 'しずく', cross: 'じゅうじ', hexagon: 'ろっかく', clover: 'クローバー' };
  // カードのヒントの {shape} などに入れるもの
  function cardHintVars(cp) {
    if (!cp || !cp.ok) return {};
    if (cp.kind === 'tanuki') return { pname: cp.picName, ch: cp.ch, verb: cp.pic === 'kotori' ? 'とり' : 'ぬき' };
    if (cp.kind === 'gojuon') { var c = cp.codes[0]; return { shape: SHAPE_NAME[cp.shapes[c.col]], row: c.row + 1, k: c.kana }; }
    if (cp.kind === 'arrow') { var ks = Array.from(cp.answer); return { k1: ks[0], k2: ks[1] }; }
    if (cp.kind === 'alien') return { k: cp.codes[0].kana };
    if (cp.kind === 'anaume') return { r1: cp.rows[0].words.map(NL.anaumeBlank).join('・'), k: cp.rows[0].kana };
    if (cp.kind === 'wordsearch') return { cat: cp.cat, w1: cp.words[0], w2: cp.words[1], wn: cp.words.length };
    if (cp.kind === 'shiritori') return { s1: cp.chain[0].show, s2: cp.chain[1].show };
    if (cp.kind === 'sakanobori') { var aa = Array.from(cp.answer); return { g: aa[aa.length - 1], p: aa[aa.length - 2] }; }
    return {};
  }
  // カードの絵（暗号その1＝0・その2＝1）
  function cardHtml(i, opts) {
    var id = i ? 'p2' : 'p1', k = cardKinds()[id];
    if (k === 'image') return NazoCards.imageHtml(((setup.cards || {})[id] || {}).img);
    var cp = i ? puz().c2 : puz().c1;
    return cp && cp.ok ? NazoCards.svg(cp, i + 1, cardOpts()) : '';
  }
  function defaultDetail(name) { return NL.fill((SC && SC.detailDefault) || '{place}の まわりを、手で さわって さがしてみるのじゃ。シールや 紙が あるはずじゃ。', { place: name }); }
  function vars() {
    if (!setup) return { name: '' };
    var P = puz();
    var p1 = setup.places[0], p2 = setup.places[1];
    var v = {
      name: (state && state.name) || 'きみ',
      place1: p1.name, place2: p2.name,
      a1: P.lp.answer || NL.normKana(p1.yomi), a2: P.cp.answer || NL.normKana(p2.yomi),
      detail1: p1.detail || defaultDetail(p1.name), detail2: p2.detail || defaultDetail(p2.name),
      key: setup.keyNo, d1: P.sc.d1, d2: P.sc.d2, d34: P.sc.d34, code: P.sc.code
    };
    if (P.lp.ok) { v.w1 = P.lp.items[0].word; v.p1 = P.lp.items[0].pos; v.k1 = P.lp.items[0].kana; }
    if (P.cp.ok) { v.e1 = P.cp.seq[0].expr; v.hr1 = P.cp.seq[0].hour; v.ck1 = P.cp.seq[0].kana; }
    if (P.ch && P.ch.ok) {
      var c0 = P.ch.scrolls[P.ch.liar.real][0];
      v.bn = P.ch.n; v.real = NL.MESSENGERS[P.ch.liar.real].name; v.liarH = P.ch.liar.hint;
      v.sc1 = c0.k + (MARK_WORD[c0.m] || ''); v.sd1 = NL.kanaList(p1.yomi)[0];
    }
    if (P.mg.ok) { v.mg = P.mg.answer; v.mgH = P.mg.hint; }
    if (P.lk.ok) {
      P.lk.clues.forEach(function (c, i) { v['lk' + (i + 1)] = c.text; });
      v.lkAns = P.lk.answer.map(function (i) { return NL.LOCK_ITEMS[i].n + NL.LOCK_ITEMS[i].e; }).join(' → ');
      v.lkL = NL.LOCK_ITEMS[P.lk.answer[0]].n + NL.LOCK_ITEMS[P.lk.answer[0]].e;
    }
    if (P.lab && P.lab.ok) {
      var mt = P.lab.match;
      v.mN = P.lab.N; v.mh = P.lab.h; v.mShown = P.lab.mclock.shown;
      v.mFix = NL.eqText(mt.sol.eq); v.mEq = NL.eqText(mt); v.mFrom = matchFromText(mt);
    }
    if (P.rb.ok) { var rh = NL.robotHint(P.rb); v.rbA = P.rb.answer; v.rbH1 = rh.label; v.rbH2 = DIR_WORD[rh.dir]; }
    if (P.jug.ok) {
      v.jA = P.jug.a; v.jB = P.jug.b; v.jT = P.jug.t;
      v.jS3 = jugText(P.jug.sol.slice(0, 3));
      v.jSol = 'じゅんばんは「' + jugText(P.jug.sol) + '」。これで ちょうど ' + P.jug.t + 'Lに なるよ！';
    }
    return v;
  }
  var DIR_WORD = ['上', '右', '下', '左'];
  // うごかす ぼうが どこに あるか（ヒント2）
  function matchFromText(m) {
    var f = m.sol.from;
    if (f === 7) return '「' + (m.plus ? '＋' : '−') + '」の たての ぼう';
    return (f < 7 ? '左の 数「' + m.a + '」' : f < 15 ? 'まん中の 数「' + m.b + '」' : '＝の 右の 数「' + m.c + '」') + 'の ぼう';
  }
  function jugText(ops) {
    var J = puz().jug, A = J.a + 'L', B = J.b + 'L';
    var W = { fillA: A + 'を いっぱいに', fillB: B + 'を いっぱいに', emptyA: A + 'を からに', emptyB: B + 'を からに', AtoB: A + 'から ' + B + 'へ うつす', BtoA: B + 'から ' + A + 'へ うつす' };
    return ops.map(function (o) { return W[o]; }).join(' → ');
  }
  var MARK_WORD = { daku: '（゛つき）', han: '（゜つき）', small: '（小さい字）' };
  function T(s) { return NL.rubyHtml(NL.fill(s, vars())); }
  function Plain(s) { return NL.plainText(NL.fill(s, vars())); }
  function esc(s) { return NL.esc(s); }

  // ---------- 進み ----------
  // 暗号を「カード」にした事件では、その暗号と、カードを手わたす場面の文・証拠を入れかえる（stories/*.json の *_card）
  function flatten() {
    STEPS = [];
    var ck = setup ? cardKinds() : { p1: 'letter', p2: 'clock' };
    SC.chapters.forEach(function (ch) {
      ch.steps.forEach(function (st) { STEPS.push({ ch: ch, st: effStep(st, ck) }); });
    });
  }
  function effStep(st, ck) {
    var e = st;
    if (st.type === 'puzzle' && ck[st.id] && isCardKind(ck[st.id]) && SC.cards) {
      e = Object.assign({}, st);
      var kind = ck[st.id];
      e.gen = 'card'; e.card = st.id === 'p2' ? 1 : 0; e.kind = kind;
      e.question = SC.cards.question;
      var hs = (SC.cards.hints[kind] || SC.cards.hints.image).slice(0, 2);
      if (kind === 'image') {
        var cc = ((setup.cards || {})[st.id]) || {};
        if (cc.hint1) hs[0] = cc.hint1;
        if (cc.hint2) hs[1] = cc.hint2;
      } else {
        var cp = NL.cardPuzzle(kind, setup.places[PUZ_PLACE[st.id]].yomi, setup.seed + e.card, padWord());
        var hv = cardHintVars(cp);
        hs = hs.map(function (h) { return NL.fill(h, hv); });
      }
      e.hints = hs.concat([st.hints[st.hints.length - 1]]);
    } else if (st.cardFor && ck[st.cardFor] && isCardKind(ck[st.cardFor])) {
      e = Object.assign({}, st);
      ['lines', 'found', 'reward', 'clear'].forEach(function (f) { if (st[f + '_card']) e[f] = st[f + '_card']; });
    }
    return e;
  }
  function hasStep(type) { return STEPS.some(function (x) { return x.st.type === type; }); }
  function stepIndex(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].st.id === id) return i; return -1; }
  function cur() { if (!state) return null; var i = stepIndex(state.stepId); return i >= 0 ? STEPS[i] : null; }
  function sceneEntry(placeIdx) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].st.type === 'scene' && STEPS[i].st.place === placeIdx) return STEPS[i]; return null; }
  function newGame(name) {
    state = {
      seed: setup.seed, name: name, stepId: STEPS[0].st.id, cleared: {}, ev: [], evNew: [],
      hints: {}, titles: {}, wrong: 0, startedAt: Date.now(), finishedAt: 0, rev: 0
    };
    save();
  }
  // いまの 探偵の この事件を はじめから（記録を 消して 新しく はじめる）
  function restartCase() {
    if (!ME || !kase) return;
    state = null; lsDel(stateKey(kase.id)); audio(); newGame(ME.name);
    route = 'play'; V = {}; RV = null; render(); window.scrollTo(0, 0);
  }
  function give(ids) {
    var got = [];
    (ids || []).forEach(function (id) {
      if (state.ev.indexOf(id) < 0) { state.ev.push(id); state.evNew.push(id); got.push(id); }
    });
    return got;
  }
  function advance() {
    var i = stepIndex(state.stepId);
    var nx = STEPS[i + 1];
    state.cleared[state.stepId] = true;
    state.stepId = nx ? nx.st.id : 'done';
    V = {}; RV = null;
    save();
    render();
    window.scrollTo(0, 0);
  }

  // ---------- 音 ----------
  var AC = null;
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) { /* 次に押したとき */ } }
    return AC;
  }
  function tone(a, f, t0, dur, type, vol, f2) {
    var o = a.createOscillator(), g = a.createGain();
    var t = a.currentTime + t0;
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var SFX = {
    tick: function (a) { tone(a, 1800, 0, 0.02, 'square', 0.015); },
    key: function (a) { tone(a, 900, 0, 0.05, 'square', 0.03); },
    ping: function (a) { tone(a, 1320, 0, 0.35, 'sine', 0.05, 1200); },
    ok: function (a) { [660, 880, 1320].forEach(function (f, i) { tone(a, f, i * 0.09, 0.14, 'square', 0.05); }); },
    ng: function (a) { tone(a, 140, 0, 0.22, 'sawtooth', 0.07); tone(a, 110, 0.22, 0.3, 'sawtooth', 0.07); },
    get: function (a) { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(a, f, i * 0.08, 0.16, 'square', 0.05); }); },
    lock: function (a) { tone(a, 440, 0, 0.08, 'square', 0.05); tone(a, 880, 0.1, 0.12, 'square', 0.05); tone(a, 1760, 0.24, 0.25, 'sine', 0.06); },
    click: function (a) { tone(a, 2400, 0, 0.03, 'square', 0.03); tone(a, 600, 0.02, 0.04, 'triangle', 0.04); },
    unlock: function (a) { tone(a, 200, 0, 0.1, 'square', 0.08); tone(a, 150, 0.12, 0.12, 'square', 0.08); tone(a, 90, 0.3, 0.6, 'sawtooth', 0.05, 60); },
    win: function (a) {
      [523, 523, 523, 659, 784, 0, 659, 784, 1047].forEach(function (f, i) { if (f) tone(a, f, i * 0.13, 0.22, 'square', 0.06); });
      tone(a, 1047, 1.25, 0.9, 'triangle', 0.07);
    }
  };
  function sfx(name) { if (!pref.sound) return; var a = audio(); if (!a) return; try { SFX[name](a); } catch (e) { /* 音が出せなくても進める */ } }
  document.addEventListener('pointerdown', function () { audio(); }, { once: true });

  // ---------- 読み上げ ----------
  function jaVoice() {
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      return vs.filter(function (v) { return /^ja/i.test(v.lang); })[0] || null;
    } catch (e) { return null; }
  }
  function say(text, who) {
    if (!('speechSynthesis' in window)) { toast('この 端末は 読み上げが できません'); return; }
    try {
      window.speechSynthesis.cancel();
      var t = NL.speechText(NL.fill(text, vars()))
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/gu, '')
        .replace(/D-PHONE/g, 'ディーフォン').replace(/MISSION/g, 'ミッション');
      var u = new SpeechSynthesisUtterance(t);
      u.lang = 'ja-JP';
      var v = jaVoice(); if (v) u.voice = v;
      u.rate = 0.95;
      u.pitch = who === 'kaitou' ? 0.6 : who === 'hakase' ? 1.3 : who === 'pico' ? 1.7 : who === 'kuro' ? 1.2 : who === 'bolt' ? 1.5 : 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) { /* 読み上げは無くても遊べる */ }
  }
  function hush() { try { window.speechSynthesis.cancel(); } catch (e) { /* 無し */ } }

  // ---------- 小物 ----------
  function toast(msg, ms) {
    var d = document.createElement('div');
    d.className = 'toast'; d.innerHTML = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, ms || 2600);
  }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); timers = []; }
  function hhmm() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  var CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
  function baseUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  function tagUrl(i) { return baseUrl() + '?t=' + NL.encodeTag(i, NL.sceneCode(setup.seed, i)); }
  function hasNdef() { return 'NDEFReader' in window; }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  // ---------- 絵 ----------
  var AV = {
    sys: '<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="8" fill="none" stroke="#3ff0ff" stroke-width="2"/><circle cx="23" cy="23" r="15" fill="none" stroke="#3ff0ff" stroke-width="1.5" opacity=".6"/><path d="M23 23 L35 13" stroke="#48ff9b" stroke-width="2.5"/><circle cx="23" cy="23" r="3" fill="#3ff0ff"/></svg>',
    kaitou: '<svg viewBox="0 0 46 46"><rect x="13" y="6" width="20" height="13" rx="2" fill="#111"/><rect x="8" y="17" width="30" height="4" rx="2" fill="#111"/><rect x="13" y="15" width="20" height="3" fill="#b3122e"/><path d="M8 26 Q23 19 38 26 Q36 33 29 32 Q23 29 17 32 Q10 33 8 26Z" fill="#f4f4f4"/><ellipse cx="16.5" cy="27" rx="3" ry="1.8" fill="#ff3a5e"/><ellipse cx="29.5" cy="27" rx="3" ry="1.8" fill="#ff3a5e"/><path d="M17 37 Q23 41 29 37" stroke="#ddd" stroke-width="2" fill="none"/></svg>',
    hakase: '<svg viewBox="0 0 46 46"><circle cx="23" cy="25" r="12" fill="#f2c9a0"/><circle cx="11" cy="18" r="6" fill="#eee"/><circle cx="35" cy="18" r="6" fill="#eee"/><circle cx="16" cy="12" r="5" fill="#eee"/><circle cx="30" cy="12" r="5" fill="#eee"/><circle cx="17.5" cy="24" r="4" fill="#fff" stroke="#333" stroke-width="1.6"/><circle cx="28.5" cy="24" r="4" fill="#fff" stroke="#333" stroke-width="1.6"/><path d="M21.5 24 h3" stroke="#333" stroke-width="1.5"/><circle cx="17.5" cy="24" r="1.3" fill="#333"/><circle cx="28.5" cy="24" r="1.3" fill="#333"/><path d="M15 32 Q23 28 31 32 Q27 35 23 33 Q19 35 15 32Z" fill="#eee"/></svg>'
  };
  AV.pico = '<svg viewBox="0 0 46 46"><path d="M16 9 Q14 4 11 3" stroke="#7dffb0" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M30 9 Q32 4 35 3" stroke="#7dffb0" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<circle cx="11" cy="3.5" r="2.6" fill="#ffd36b"/><circle cx="35" cy="3.5" r="2.6" fill="#ffd36b"/><ellipse cx="23" cy="25" rx="16" ry="15" fill="#7dffb0"/><ellipse cx="23" cy="29" rx="10" ry="7" fill="#c9ffe0"/>' +
    '<ellipse cx="16.5" cy="22" rx="5" ry="6" fill="#fff"/><ellipse cx="29.5" cy="22" rx="5" ry="6" fill="#fff"/><circle cx="17.5" cy="23" r="3" fill="#1b1f4a"/><circle cx="28.5" cy="23" r="3" fill="#1b1f4a"/>' +
    '<circle cx="18.5" cy="21.5" r="1" fill="#fff"/><circle cx="29.5" cy="21.5" r="1" fill="#fff"/><path d="M19 31 Q23 34 27 31" stroke="#1b1f4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="12" cy="29" rx="2.6" ry="1.6" fill="#ff9ec4"/><ellipse cx="34" cy="29" rx="2.6" ry="1.6" fill="#ff9ec4"/></svg>';
  AV.kuro = '<svg viewBox="0 0 46 46"><path d="M9 20 L11 5 L20 14Z M37 20 L35 5 L26 14Z" fill="#23232e"/><path d="M12 15 L13 9 L17 13Z M34 15 L33 9 L29 13Z" fill="#ff9ec4"/>' +
    '<ellipse cx="23" cy="26" rx="15" ry="13.5" fill="#23232e"/><rect x="7.5" y="16" width="31" height="6" rx="2" fill="#d8323f"/><path d="M38 18 L45 14 M38 20 L44 23" stroke="#d8323f" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="23" cy="19" r="2.2" fill="#ffd36b"/><ellipse cx="17" cy="27" rx="4" ry="4.4" fill="#ffd36b"/><ellipse cx="29" cy="27" rx="4" ry="4.4" fill="#ffd36b"/>' +
    '<ellipse cx="17" cy="27" rx="1.3" ry="3.4" fill="#111"/><ellipse cx="29" cy="27" rx="1.3" ry="3.4" fill="#111"/><path d="M21.5 32 L24.5 32 L23 33.6Z" fill="#ff9ec4"/>' +
    '<path d="M19 35 Q23 37.5 27 35" stroke="#888" stroke-width="1.2" fill="none"/><path d="M5 30 L13 31 M5 34 L13 33 M41 30 L33 31 M41 34 L33 33" stroke="#999" stroke-width="1"/></svg>';
  AV.bolt = '<svg viewBox="0 0 46 46"><line x1="23" y1="9" x2="23" y2="3" stroke="#9fb6c8" stroke-width="2"/><circle cx="23" cy="3" r="2.8" fill="#ffd36b"/>' +
    '<rect x="8" y="9" width="30" height="26" rx="8" fill="#9fb6c8" stroke="#4a6274" stroke-width="1.5"/><rect x="12" y="13" width="22" height="13" rx="5" fill="#10202a"/>' +
    '<circle cx="18" cy="19.5" r="3.2" fill="#3ff0ff"/><circle cx="28" cy="19.5" r="3.2" fill="#3ff0ff"/><circle cx="19" cy="18.5" r="1" fill="#fff"/><circle cx="29" cy="18.5" r="1" fill="#fff"/>' +
    '<path d="M17 30 h12" stroke="#4a6274" stroke-width="2" stroke-linecap="round"/><path d="M20 30 v-1.6 M23 30 v-1.6 M26 30 v-1.6" stroke="#4a6274" stroke-width="1.2"/>' +
    '<circle cx="6" cy="22" r="3" fill="#ffd36b" stroke="#4a6274"/><circle cx="40" cy="22" r="3" fill="#ffd36b" stroke="#4a6274"/>' +
    '<rect x="14" y="36" width="18" height="8" rx="3" fill="#7d93a5"/><circle cx="23" cy="40" r="2" fill="#ff7ab8"/></svg>';
  var WHO = { sys: 'D-PHONE', kaitou: '[怪盗|かいとう]クロウ', hakase: 'ネジマキ[博士|はかせ]', pico: 'ピコ', kuro: '[忍者|にんじゃ]ねこ くろまる', bolt: 'ロボット ボルト' };

  function clockSvg(dial, w) {
    var s = '<svg class="art" viewBox="0 0 260 260" width="' + (w || 260) + '" height="' + (w || 260) + '">';
    s += '<defs><radialGradient id="cf" cx="50%" cy="45%"><stop offset="0" stop-color="#fbf4e2"/><stop offset="1" stop-color="#e2d3ae"/></radialGradient></defs>';
    s += '<circle cx="130" cy="130" r="124" fill="#2b2014"/><circle cx="130" cy="130" r="116" fill="url(#cf)" stroke="#8a6a3a" stroke-width="3"/>';
    for (var m = 0; m < 60; m++) {
      var a = m * 6 * Math.PI / 180, big = m % 5 === 0;
      var r1 = big ? 104 : 109, r2 = 113;
      s += '<line x1="' + (130 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (130 - r1 * Math.cos(a)).toFixed(1) + '" x2="' + (130 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (130 - r2 * Math.cos(a)).toFixed(1) + '" stroke="#5a4426" stroke-width="' + (big ? 3 : 1) + '"/>';
    }
    for (var h = 1; h <= 12; h++) {
      var b = h * 30 * Math.PI / 180;
      var x = 130 + 80 * Math.sin(b), y = 130 - 80 * Math.cos(b);
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 10).toFixed(1) + '" text-anchor="middle" font-size="29" font-weight="bold" fill="#2b1a08" font-family="Hiragino Maru Gothic ProN, Hiragino Sans, sans-serif">' + esc(dial[h - 1] || '') + '</text>';
    }
    // 向きが分かるように 12 だけ小さく書く
    s += '<text x="130" y="35" text-anchor="middle" font-size="10" fill="#8a6a3a" font-family="sans-serif">12</text>';
    s += '<line x1="130" y1="130" x2="98" y2="112" stroke="#2b1a08" stroke-width="6" stroke-linecap="round"/>';
    s += '<line x1="130" y1="130" x2="168" y2="72" stroke="#2b1a08" stroke-width="3.5" stroke-linecap="round"/>';
    s += '<circle cx="130" cy="130" r="7" fill="#8a1a1a"/></svg>';
    return s;
  }
  function paperHtml(w) {
    var P = puz();
    var items = P.cp.ok ? P.cp.seq : [];
    var h = '<div class="paper" style="width:' + (w || 280) + 'px"><div class="stain">K</div><h4>なぞの 紙</h4><div class="calc">';
    items.forEach(function (it, i) { h += '<span><b>' + CIRC.charAt(i) + '</b>' + esc(it.expr) + '</span>'; });
    h += '</div><div class="sign">―― ' + NL.rubyHtml((SC && SC.paperSign) || '[怪盗|かいとう]クロウ') + '</div></div>';
    return h;
  }
  function memoHtml(w) {
    return '<div class="paper memo" style="width:' + (w || 300) + 'px">' + SC.memo.map(function (l) { return '<div>' + T(l) + '</div>'; }).join('') + '</div>';
  }
  function keyHtml(w) {
    var k = esc(setup.keyNo);
    return '<div class="photo" style="width:' + (w || 260) + 'px"><svg class="art" viewBox="0 0 240 150" width="100%">' +
      '<defs><linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a6040"/><stop offset="1" stop-color="#3d2c18"/></linearGradient>' +
      '<linearGradient id="br" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c77a"/><stop offset="1" stop-color="#9c7a34"/></linearGradient></defs>' +
      '<rect width="240" height="150" fill="url(#sp)"/>' +
      '<circle cx="62" cy="75" r="40" fill="url(#br)" stroke="#5a4416" stroke-width="3"/><circle cx="62" cy="75" r="16" fill="#3d2c18"/>' +
      '<rect x="98" y="67" width="118" height="16" rx="4" fill="url(#br)" stroke="#5a4416" stroke-width="2"/>' +
      '<rect x="176" y="83" width="12" height="22" fill="url(#br)" stroke="#5a4416" stroke-width="2"/><rect x="198" y="83" width="12" height="16" fill="url(#br)" stroke="#5a4416" stroke-width="2"/>' +
      '<text x="62" y="58" text-anchor="middle" font-size="15" fill="#4a3410" font-family="serif" font-weight="bold">No.</text>' +
      '<text x="62" y="108" text-anchor="middle" font-size="22" fill="#4a3410" font-family="serif" font-weight="bold">' + k + '</text>' +
      '</svg><div class="cap">古い カギ</div></div>';
  }
  function letterHtml(w) {
    return '<svg class="art" viewBox="0 0 240 160" width="' + (w || 260) + '">' +
      '<rect x="4" y="4" width="232" height="152" rx="8" fill="#2a0710" stroke="#c9a23a" stroke-width="3"/>' +
      '<rect x="14" y="14" width="212" height="132" rx="4" fill="none" stroke="#c9a23a" stroke-width="1" stroke-dasharray="4 3"/>' +
      '<g transform="translate(120 62)"><path d="M-46 0 Q0 -20 46 0 Q42 18 24 16 Q0 8 -24 16 Q-42 18 -46 0Z" fill="#f4f4f4"/>' +
      '<ellipse cx="-20" cy="2" rx="8" ry="4.5" fill="#ff3a5e"/><ellipse cx="20" cy="2" rx="8" ry="4.5" fill="#ff3a5e"/></g>' +
      '<text x="120" y="118" text-anchor="middle" font-size="26" fill="#ffcf4a" font-family="DotGothic16, sans-serif">予 告 状</text>' +
      '<text x="120" y="140" text-anchor="middle" font-size="11" fill="#c9a23a" font-family="sans-serif">from KAITOU CROW</text></svg>';
  }
  function noteHtml(n, w) {
    var v = vars();
    var a = n === 1 ? v.a1 : v.a2;
    var fs = Math.min(30, Math.floor(((w || 240) - 40) / Math.max(1, Array.from(a).length) / 1.1)); // 長い答えでもはみ出さない
    return '<div class="paper" style="width:' + (w || 240) + 'px;transform:rotate(1deg)"><h4>暗号 その' + n + '</h4><div style="font-size:15px">答え</div><div style="font-size:' + fs + 'px;letter-spacing:.1em;text-align:center">' + esc(a) + '</div></div>';
  }
  function diamondHtml(w) {
    return '<svg class="art" viewBox="0 0 200 180" width="' + (w || 220) + '">' +
      '<defs><linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff6ff"/><stop offset=".5" stop-color="#2f8cff"/><stop offset="1" stop-color="#0b2a8a"/></linearGradient>' +
      '<radialGradient id="gl"><stop offset="0" stop-color="#7fe6ff" stop-opacity=".8"/><stop offset="1" stop-color="#7fe6ff" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="100" cy="90" r="88" fill="url(#gl)"/>' +
      '<polygon points="40,62 70,32 130,32 160,62 100,150" fill="url(#gm)" stroke="#e6fbff" stroke-width="2"/>' +
      '<polyline points="40,62 160,62" stroke="#e6fbff" stroke-width="1.5" fill="none"/>' +
      '<polyline points="70,32 85,62 100,32 115,62 130,32" stroke="#e6fbff" stroke-width="1.2" fill="none" opacity=".8"/>' +
      '<polyline points="85,62 100,150 115,62" stroke="#e6fbff" stroke-width="1.2" fill="none" opacity=".7"/>' +
      '<path d="M150 20 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" fill="#fff"/></svg>';
  }
  function art(type, w) {
    switch (type) {
      case 'letter': return letterHtml(w);
      case 'key': return keyHtml(w);
      case 'paper': return paperHtml(w);
      case 'clock': return clockSvg(puz().cp.dial || [], w);
      case 'memo': return memoHtml(w);
      case 'diamond': return diamondHtml(w);
      case 'pico': return '<div class="photo pico-photo" style="width:' + (w || 200) + 'px">' + AV.pico.replace('<svg ', '<svg style="width:100%;height:auto" ') + '<div class="cap">PICO from KIRARI</div></div>';
      case 'shard1': return shardSvg('#5ee7ff', '#2a6bff', w);
      case 'shard2': return shardSvg('#ff9ad5', '#d43c8f', w);
      case 'badge': return '<svg viewBox="0 0 120 120" style="width:' + (w || 160) + 'px;height:auto"><circle cx="60" cy="60" r="52" fill="#2a3fb8" stroke="#ffd36b" stroke-width="6"/>' +
        '<polygon points="60,22 70,48 98,48 75,64 84,92 60,75 36,92 45,64 22,48 50,48" fill="#ffd36b"/><circle cx="60" cy="58" r="9" fill="#7dffb0"/></svg>';
      case 'kuro': return '<div class="photo pico-photo kuro-photo" style="width:' + (w || 200) + 'px">' + AV.kuro.replace('<svg ', '<svg style="width:100%;height:auto" ') + '<div class="cap">NINJA CAT KUROMARU</div></div>';
      case 'gate1': return '<div class="paper" style="width:' + (w || 240) + 'px;transform:rotate(-1deg)"><h4>' + T('一の[関門|かんもん]の 答え') + '</h4><div style="font-size:26px;text-align:center">■ ＝ ● × ' + esc(vars().bn) + '</div></div>';
      case 'scrolls': return scrollsHtml(true);
      case 'maki1': case 'maki2': case 'maki3': return makiHtml(+type.slice(-1), w);
      case 'box': return boxSvg(w);
      case 'kbox': return kboxSvg(w);
      case 'menkyo': return menkyoSvg(w);
      case 'bolt': return '<div class="photo pico-photo bolt-photo" style="width:' + (w || 200) + 'px">' + AV.bolt.replace('<svg ', '<svg style="width:100%;height:auto" ') + '<div class="cap">ROBOT BOLT</div></div>';
      case 'eq': return '<div class="paper" style="width:' + (w || 240) + 'px;transform:rotate(-1deg)"><h4>' + T('テスト1の 答え') + '</h4><div style="font-size:28px;text-align:center;font-family:var(--dot)">' + esc(vars().mFix || '') + '</div></div>';
      case 'mclock': return '<div style="text-align:center">' + mirrorClockSvg(puz().lab && puz().lab.ok ? puz().lab.h : 3, w || 180) + '</div>';
      case 'sheets': return sheetsSvg(w);
      case 'mem1': return memSvg('#2a6bff', '1', w);
      case 'mem2': return memSvg('#d8323f', '2', w);
      case 'pbox': return pboxSvg(w);
      case 'tanks': return tanksSvg(w);
      case 'medal': return medalSvg(w);
      case 'card1': return '<div class="cardwrap">' + cardHtml(0) + '</div>';
      case 'card2': return '<div class="cardwrap">' + cardHtml(1) + '</div>';
      default: return '';
    }
  }
  function shardSvg(c1, c2, w) {
    var id = 'sh' + c1.slice(1);
    return '<svg viewBox="0 0 120 140" style="width:' + (w || 120) + 'px;height:auto"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient>' +
      '<filter id="' + id + 'g"><feGaussianBlur stdDeviation="5"/></filter></defs>' +
      '<polygon points="60,6 96,46 82,128 38,128 24,46" fill="' + c1 + '" opacity=".55" filter="url(#' + id + 'g)"/>' +
      '<polygon points="60,6 96,46 82,128 38,128 24,46" fill="url(#' + id + ')" stroke="#fff" stroke-width="2"/>' +
      '<path d="M60 6 L52 50 L38 128 M52 50 L96 46 M52 50 L82 128" stroke="#fff" stroke-width="1.5" fill="none" opacity=".7"/>' +
      '<path d="M18 22 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3z M102 96 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z" fill="#fff"/></svg>';
  }
  // ---------- 忍者やしきの 絵 ----------
  // 巻物の 切れはし（からくり錠の 文が 1つずつ 書いてある）
  function makiHtml(n, w) {
    var t = (vars()['lk' + n]) || '';
    return '<div class="maki" style="width:' + (w || 260) + 'px"><div class="mk-h">' + T('[巻物|まきもの]の 切れはし その' + n) + '</div><div class="mk-t">' + esc(t) + '</div></div>';
  }
  function boxSvg(w) {
    var g = '';
    for (var i = 0; i < 9; i++) g += '<rect x="' + (66 + (i % 3) * 30) + '" y="' + (28 + Math.floor(i / 3) * 16) + '" width="26" height="13" rx="2" fill="#f3e2b8" stroke="#6b4a22"/>';
    return '<svg viewBox="0 0 220 150" style="width:' + (w || 200) + 'px;height:auto"><rect x="20" y="58" width="180" height="80" rx="6" fill="#8a5a2b" stroke="#4a2e12" stroke-width="3"/>' +
      '<path d="M20 58 L40 20 L180 20 L200 58Z" fill="#a8703a" stroke="#4a2e12" stroke-width="3"/>' + g +
      '<rect x="98" y="88" width="24" height="22" rx="3" fill="#ffcf4a" stroke="#6b4a22" stroke-width="2"/><circle cx="110" cy="97" r="4" fill="#4a2e12"/><rect x="108.5" y="97" width="3" height="8" fill="#4a2e12"/></svg>';
  }
  function kboxSvg(w) {
    var it = NL.LOCK_ITEMS, b = '';
    it.forEach(function (x, i) { b += '<circle cx="' + (52 + i * 38) + '" cy="96" r="15" fill="#2a1a10" stroke="#ffcf4a" stroke-width="2"/><text x="' + (52 + i * 38) + '" y="103" text-anchor="middle" font-size="18">' + x.e + '</text>'; });
    return '<svg viewBox="0 0 220 150" style="width:' + (w || 200) + 'px;height:auto"><rect x="14" y="40" width="192" height="98" rx="10" fill="#1d1012" stroke="#b3122e" stroke-width="4"/>' +
      '<rect x="24" y="22" width="172" height="26" rx="8" fill="#2a1418" stroke="#b3122e" stroke-width="3"/><path d="M60 35 h100" stroke="#ffcf4a" stroke-width="2" stroke-dasharray="6 4"/>' + b +
      '<text x="110" y="70" text-anchor="middle" font-size="15" fill="#ffcf4a" font-family="DotGothic16, sans-serif">からくり じょう</text></svg>';
  }
  function menkyoSvg(w) {
    return '<svg viewBox="0 0 240 150" style="width:' + (w || 220) + 'px;height:auto"><rect x="30" y="30" width="180" height="90" fill="#f7ecd2" stroke="#8a6a3a" stroke-width="2"/>' +
      '<rect x="14" y="22" width="20" height="106" rx="8" fill="#b3122e"/><rect x="206" y="22" width="20" height="106" rx="8" fill="#b3122e"/>' +
      '<text x="120" y="64" text-anchor="middle" font-size="18" fill="#2b1a08" font-family="Zen Maru Gothic, sans-serif" font-weight="900">ひみつの まきもの</text>' +
      '<g transform="translate(120 92)"><path d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4Z" fill="#3a3a48"/><circle r="3" fill="#f7ecd2"/></g></svg>';
  }
  // 3まいの 巻物（ずらし文字）。show＝使いの 名前と いっしょに 出す
  function shiftCellHtml(c) {
    // ⚠ 「゛」「゜」の字は 小さく つぶれて 見えないので、線で 描く（cards.js の markBadge と同じ）
    var mk = c.m === 'daku' ? '<svg viewBox="0 0 20 20"><path d="M7 4 L10 11 M12 3 L15 10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>'
      : c.m === 'han' ? '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="5" fill="none" stroke="#fff" stroke-width="2.4"/></svg>' : '小';
    return '<span class="sk">' + esc(c.k) + (c.m ? '<i class="sm ' + c.m + '">' + mk + '</i>' : '') + '</span>';
  }
  function scrollsHtml() {
    var ch = puz().ch;
    if (!ch || !ch.ok) return '';
    return '<div class="scrolls">' + ch.scrolls.map(function (cells, i) {
      var m = NL.MESSENGERS[i];
      return '<div class="scroll"><div class="sw">' + m.icon + ' ' + esc(m.name) + 'の ' + T('[巻物|まきもの]') + '</div><div class="sb">' + cells.map(shiftCellHtml).join('') + '</div></div>';
    }).join('') + '</div>';
  }
  // ---------- ロボット研究所の 絵 ----------
  function mirrorClockSvg(h, w) {
    // ほんとうの 時計を 描いて、左右を はんたいに する（上の「12」も うらがえしに なる）
    var c = '<circle cx="120" cy="140" r="80" fill="#fff" stroke="#2b2116" stroke-width="5"/>';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, big = i % 3 === 0, r1 = big ? 62 : 68;
      c += '<line x1="' + (120 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (140 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (120 + Math.sin(a) * 76).toFixed(1) + '" y2="' + (140 - Math.cos(a) * 76).toFixed(1) + '" stroke="#2b2116" stroke-width="' + (big ? 5 : 3) + '" stroke-linecap="round"/>';
    }
    c += '<text x="120" y="96" text-anchor="middle" font-size="24" font-weight="900" fill="#2b2116" font-family="sans-serif">12</text>';
    var ha = h * Math.PI / 6;
    c += '<line x1="120" y1="140" x2="' + (120 + Math.sin(ha) * 42).toFixed(1) + '" y2="' + (140 - Math.cos(ha) * 42).toFixed(1) + '" stroke="#2b2116" stroke-width="9" stroke-linecap="round"/>' +
      '<line x1="120" y1="140" x2="120" y2="78" stroke="#2b2116" stroke-width="5" stroke-linecap="round"/><circle cx="120" cy="140" r="7" fill="#d8323f"/>';
    return '<svg viewBox="0 0 240 290" style="width:' + (w || 240) + 'px;max-width:100%;height:auto">' +
      '<ellipse cx="120" cy="140" rx="114" ry="134" fill="#8d6a24"/><ellipse cx="120" cy="140" rx="104" ry="124" fill="#cfe9ef"/>' +
      '<g transform="translate(240 0) scale(-1 1)">' + c + '</g>' +
      '<path d="M44 74 Q62 40 100 30" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" opacity=".75"/>' +
      '<path d="M40 100 Q42 92 48 86" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>' +
      '<rect x="96" y="268" width="48" height="18" rx="6" fill="#5a3d1b"/></svg>';
  }
  function sheetsSvg(w) {
    var s = '<svg viewBox="0 0 240 150" style="width:' + (w || 220) + 'px;height:auto">', r = NL.rng(7);
    for (var i = 0; i < 4; i++) {
      s += '<rect x="' + (14 + i * 10) + '" y="' + (40 + i * 8) + '" width="120" height="70" rx="6" fill="#fff" stroke="#555"/>';
      for (var k = 0; k < 30; k++) s += '<rect x="' + (20 + i * 10 + Math.floor(r() * 108)) + '" y="' + (46 + i * 8 + Math.floor(r() * 58)) + '" width="4" height="4" fill="#1b1f4a"/>';
    }
    for (var j = 0; j < 3; j++) s += '<rect x="' + (110 + j * 12) + '" y="' + (16 + j * 10) + '" width="110" height="66" rx="6" fill="rgba(120,200,255,.35)" stroke="#2a6bff"/>';
    return s + '</svg>';
  }
  function memSvg(color, no, w) {
    return '<svg viewBox="0 0 120 150" style="width:' + (w || 120) + 'px;height:auto"><path d="M20 10 H80 L104 34 V140 H20Z" fill="' + color + '" stroke="#10202a" stroke-width="4"/>' +
      '<rect x="32" y="22" width="8" height="22" fill="#ffd36b"/><rect x="46" y="22" width="8" height="22" fill="#ffd36b"/><rect x="60" y="22" width="8" height="22" fill="#ffd36b"/>' +
      '<rect x="30" y="64" width="64" height="56" rx="6" fill="#fff" opacity=".9"/><text x="62" y="102" text-anchor="middle" font-size="34" font-weight="900" fill="' + color + '" font-family="sans-serif">' + no + '</text></svg>';
  }
  function pboxSvg(w) {
    var s = '<svg viewBox="0 0 200 150" style="width:' + (w || 200) + 'px;height:auto"><path d="M20 50 L100 20 L180 50 L100 80Z" fill="#c9a23a" stroke="#6b4a22" stroke-width="3"/>' +
      '<path d="M20 50 V120 L100 145 V80Z" fill="#a4801f" stroke="#6b4a22" stroke-width="3"/><path d="M180 50 V120 L100 145 V80Z" fill="#8a6a1a" stroke="#6b4a22" stroke-width="3"/>';
    for (var i = 1; i < 5; i++) {
      s += '<line x1="' + (20 + i * 16) + '" y1="' + (50 - i * 6) + '" x2="' + (100 + i * 16) + '" y2="' + (80 - i * 6) + '" stroke="#6b4a22" stroke-width="1"/>' +
        '<line x1="' + (20 + i * 16) + '" y1="' + (50 + i * 6) + '" x2="' + (100 + i * 16) + '" y2="' + (20 + i * 6) + '" stroke="#6b4a22" stroke-width="1"/>';
    }
    return s + '</svg>';
  }
  function tankSvg(cap, amt, maxCap, hl) {
    var H = 30 + cap * 18, top = 20 + (maxCap - cap) * 18, lv = amt / cap;
    return '<svg viewBox="0 0 110 ' + (50 + maxCap * 18 + 20) + '" class="tank' + (hl ? ' hl' : '') + '">' +
      '<rect x="20" y="' + top + '" width="70" height="' + H + '" rx="10" fill="#0c1b2e" stroke="#9fb6c8" stroke-width="4"/>' +
      (amt ? '<rect x="24" y="' + (top + 4 + (H - 8) * (1 - lv)) + '" width="62" height="' + ((H - 8) * lv) + '" rx="6" fill="#ffb84a"/>' : '') +
      '<rect x="45" y="' + (top - 8) + '" width="20" height="10" rx="3" fill="#9fb6c8"/>' +
      '<text x="55" y="' + (top + H / 2 + 6) + '" text-anchor="middle" font-size="18" font-weight="900" fill="#fff" font-family="sans-serif" stroke="#10202a" stroke-width="3" paint-order="stroke">' + amt + 'L</text></svg>';
  }
  function tanksSvg(w) {
    var J = puz().jug;
    return '<div style="display:flex;gap:10px;justify-content:center;width:' + (w || 200) + 'px;margin:0 auto">' +
      '<div style="flex:1">' + tankSvg(J.a, 0, J.b) + '</div><div style="flex:1">' + tankSvg(J.b, 0, J.b) + '</div></div>';
  }
  function medalSvg(w) {
    var s = '<svg viewBox="0 0 160 180" style="width:' + (w || 160) + 'px;height:auto"><path d="M50 0 L80 60 L110 0Z" fill="#2a6bff"/><path d="M65 0 L80 30 L95 0Z" fill="#d8323f"/>' +
      '<circle cx="80" cy="110" r="58" fill="#ffd36b" stroke="#c9900a" stroke-width="6"/>';
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; s += '<rect x="74" y="72" width="12" height="16" fill="#c9900a" transform="rotate(' + (i * 45) + ' 80 110)"/>'; }
    return s + '<circle cx="80" cy="110" r="26" fill="#c9900a"/><circle cx="80" cy="110" r="12" fill="#ffd36b"/></svg>';
  }

  // ---------- テスト1：光の ぼうの 式 ----------
  function segLine(x, y, i) {
    return [[x + 8, y, x + 52, y], [x + 60, y + 8, x + 60, y + 52], [x + 60, y + 68, x + 60, y + 112], [x + 8, y + 120, x + 52, y + 120],
      [x, y + 68, x, y + 112], [x, y + 8, x, y + 52], [x + 8, y + 60, x + 52, y + 60]][i];
  }
  function msPos(k) {
    if (k < 7) return segLine(20, 15, k);
    if (k === 7) return [135, 53, 135, 97];
    if (k < 15) return segLine(190, 15, k - 8);
    return segLine(360, 15, k - 15);
  }
  function matchSvg(m, done) {
    var bits = done ? NL.eqBits(m.sol.eq.a, m.sol.eq.plus, m.sol.eq.b, m.sol.eq.c) : V.ms.bits;
    var lit = !done && (state.hints[cur().st.id] || 0) >= 3;
    var s = '<svg viewBox="0 0 440 150" class="msvg">';
    var bar = function (p, cls, k) {
      return '<g class="ms ' + cls + '"' + (k != null ? ' data-ms="' + k + '"' : '') + '><line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + p[2] + '" y2="' + p[3] + '" class="hit"/>' +
        '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + p[2] + '" y2="' + p[3] + '" class="bar"/></g>';
    };
    s += bar([113, 75, 157, 75], 'on fixed') + bar([283, 63, 327, 63], 'on fixed') + bar([283, 87, 327, 87], 'on fixed');
    for (var k = 0; k < 22; k++) {
      var cls = bits[k] ? 'on' : 'off';
      if (!done && V.ms.picked === k) cls += ' pick';
      if (lit && k === m.sol.from && bits[k]) cls += ' hint';
      if (lit && k === m.sol.to && !bits[k]) cls += ' hint';
      s += bar(msPos(k), cls, done ? null : k);
    }
    return '<div class="mscreen">' + s + '</svg></div>';
  }
  function msTap(k) {
    var ms = V.ms; if (!ms) return;
    var on = ms.bits[k];
    if (ms.picked == null) {
      if (!on) { toast(T('まず うごかす ぼうを おしてね')); return; }
      if (ms.moved && k !== ms.moved.to) { toast(T('うごかせるのは 1本だけ。「もとに もどす」を おしてね'), 2600); return; }
      ms.picked = k;
    } else if (k === ms.picked) {
      ms.picked = null;
    } else if (on) {
      if (ms.moved && k !== ms.moved.to) { toast(T('うごかせるのは 1本だけ。「もとに もどす」を おしてね'), 2600); return; }
      ms.picked = k;
    } else {
      var from = ms.picked;
      ms.bits[from] = false; ms.bits[k] = true;
      var orig = ms.moved ? ms.moved.from : from;
      ms.moved = k === orig ? null : { from: orig, to: k };
      ms.picked = null;
    }
    V.wrongMsg = '';
    sfx('key'); render();
  }

  // ---------- テスト3：かさねる シート ----------
  var OVW = 160, OVH = 80, OVC = 2, ovCache = {};
  function ovMask(word) {
    if (ovCache[word]) return ovCache[word];
    var ks = Array.from(word), half = Math.ceil(ks.length / 2);
    var lines = ks.length <= 5 ? [ks.join('')] : [ks.slice(0, half).join(''), ks.slice(half).join('')];
    var S = 4, c = document.createElement('canvas'); c.width = OVW * S; c.height = OVH * S;
    var g = c.getContext('2d'); g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
    var maxLen = Math.max.apply(null, lines.map(function (l) { return Array.from(l).length; }));
    var fs = Math.min(OVH * S * (lines.length === 1 ? 0.72 : 0.45), OVW * S / Math.max(3, maxLen) * 0.92);
    g.font = '900 ' + Math.round(fs) + "px 'Zen Maru Gothic','Hiragino Maru Gothic ProN','BIZ UDPGothic',sans-serif";
    g.strokeStyle = '#000'; g.lineWidth = fs * 0.05; g.lineJoin = 'round';
    lines.forEach(function (l, i) {
      var yy = lines.length === 1 ? OVH * S / 2 : OVH * S * (i ? 0.74 : 0.27);
      g.fillText(l, OVW * S / 2, yy); g.strokeText(l, OVW * S / 2, yy);
    });
    var d = g.getImageData(0, 0, c.width, c.height).data, m = [];
    for (var y = 0; y < OVH; y++) for (var x = 0; x < OVW; x++) {
      var cnt = 0;
      for (var yy = 0; yy < S; yy++) for (var xx = 0; xx < S; xx++) if (d[((y * S + yy) * c.width + x * S + xx) * 4 + 3] > 128) cnt++;
      m.push(cnt > S * S * 0.3 ? 1 : 0);
    }
    return (ovCache[word] = m);
  }
  function ovTopBits(t) {
    var r = NL.rng(((setup.seed >>> 0) ^ (t * 7919)) + 101), b = [];
    for (var i = 0; i < OVW * OVH; i++) b.push(r() < 0.5 ? 1 : 0);
    return b;
  }
  function ovBottomBits(lab, num) {
    var p = lab.panels.filter(function (x) { return x.num === num; })[0];
    var T = ovTopBits(p.top), M = ovMask(p.word);
    return T.map(function (v, i) { return M[i] ? 1 - v : v; });
  }
  function ovPaint() {
    var lab = puz().lab; if (!lab || !lab.ok) return;
    Array.prototype.forEach.call(document.querySelectorAll('canvas[data-ov]'), function (cv) {
      var top = cv.getAttribute('data-ov') === 't', key = cv.getAttribute(top ? 'data-t' : 'data-n');
      cv.width = OVW * OVC; cv.height = OVH * OVC;
      var g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      if (!top) { g.fillStyle = '#fffdf4'; g.fillRect(0, 0, cv.width, cv.height); }
      if (key === '') return;
      var bits = top ? ovTopBits(+key) : ovBottomBits(lab, +key);
      g.fillStyle = '#1b1f4a';
      for (var i = 0; i < bits.length; i++) if (bits[i]) g.fillRect((i % OVW) * OVC, Math.floor(i / OVW) * OVC, OVC, OVC);
    });
  }
  function overlayHtml(lab, done) {
    var t = done ? lab.h : V.ovT, p = done ? lab.N : V.ovP, on = done || V.ovOn;
    var h = '<div class="ov">';
    if (!done) {
      h += '<div class="ovpick"><b>' + T('すける シート') + '</b>' + lab.tops.map(function (x) { return '<button data-ovt="' + x + '"' + (t === x ? ' class="on"' : '') + '>🕒 ' + x + '時</button>'; }).join('') + '</div>' +
        '<div class="ovpick"><b>' + T('パネル') + '</b>' + lab.panels.map(function (x) { return '<button data-ovp="' + x.num + '"' + (p === x.num ? ' class="on"' : '') + '>No.' + x.num + '</button>'; }).join('') + '</div>';
    }
    h += '<div class="ovview' + (on ? ' on' : '') + '"><div class="ovslot"><canvas data-ov="b" data-n="' + (p != null ? p : '') + '"></canvas><i>' + (p != null ? 'パネル No.' + p : T('パネルを えらんでね')) + '</i></div>' +
      '<div class="ovslot top"><canvas data-ov="t" data-t="' + (t != null ? t : '') + '"></canvas><i>' + (t != null ? 'シート ' + t + '時' : T('シートを えらんでね')) + '</i></div></div>';
    if (!done) h += '<button class="btn" data-act="ov-go"' + (t == null || p == null ? ' disabled' : '') + '>' + (on ? '↕ ' + T('はなす') : '⬇ ' + T('かさねる')) + '</button>';
    return h + '</div>';
  }

  // ---------- プログラムの 箱 ----------
  var CMD_TXT = { F: '👣 1マス すすむ', R: '↻ 右を むく', L: '↺ 左を むく' };
  function robotHtml(rb, done) {
    var n = rb.n, cs = 60, W = n * cs + 8;
    var s = '<svg viewBox="0 0 ' + W + ' ' + W + '" class="rbgrid"><rect width="' + W + '" height="' + W + '" rx="10" fill="#6b4a22"/>';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var end = done && x === rb.end[0] && y === rb.end[1];
      s += '<rect x="' + (4 + x * cs + 2) + '" y="' + (4 + y * cs + 2) + '" width="' + (cs - 4) + '" height="' + (cs - 4) + '" rx="6" fill="' + (end ? '#ffcf4a' : '#f3e2b8') + '"/>' +
        '<text x="' + (4 + x * cs + 8) + '" y="' + (4 + y * cs + 21) + '" font-size="16" font-weight="900" fill="#8a1a1a" font-family="sans-serif">' + rb.labels[y * n + x] + '</text>';
    }
    var cx = 4 + rb.start[0] * cs + cs / 2 + 6, cy = 4 + rb.start[1] * cs + cs / 2 + 6;
    s += '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + rb.dir * 90 + ') scale(.78)"><polygon points="0,-24 9,-14 -9,-14" fill="#d8323f"/>' +
      '<rect x="-14" y="-14" width="28" height="24" rx="7" fill="#9fb6c8" stroke="#4a6274" stroke-width="2"/><circle cx="-6" cy="-6" r="3.4" fill="#3ff0ff"/><circle cx="6" cy="-6" r="3.4" fill="#3ff0ff"/></g></svg>';
    var item = function (c) { return '<li class="cmd">' + T(CMD_TXT[c]) + '</li>'; };
    var prog = '<ol class="rbprog">' + rb.prog.map(function (it) {
      return typeof it === 'string' ? item(it) : '<li class="rep"><div class="rh">🔁 ' + it.rep + T('かい くりかえす') + '</div><ol>' + it.body.map(item).join('') + '</ol></li>';
    }).join('') + '</ol>';
    return '<div class="rbwrap">' + s + '<div class="panel rbp"><b>' + T('プログラム') + '</b>' + prog + '<p class="small">' + T('赤い 三角の ほうが ボルトの 前だよ') + '</p></div></div>';
  }

  // ---------- さいご：オイルの タンク ----------
  function renderJugs(chHtml, st) {
    var J = puz().jug;
    if (!V.jug) { V.jug = [0, 0]; V.jugN = 0; }
    var h = '<div class="puzzle-head"><span class="tag">FINAL</span><h2 style="margin:0">' + T(st.title) + '</h2></div>' +
      '<p class="lead">' + T(st.question) + '</p><div class="jugs" id="jugs">';
    [0, 1].forEach(function (i) {
      var cap = i ? J.b : J.a;
      h += '<div class="jug"><div class="jcap">' + cap + 'L ' + T('タンク') + '</div>' + tankSvg(cap, V.jug[i], J.b, V.jug[i] === J.t) +
        '<button data-jug="fill' + i + '">⬆ ' + T('いっぱいに') + '</button><button data-jug="empty' + i + '">🗑 ' + T('からに') + '</button>' +
        '<button data-jug="pour' + i + '">' + (i ? '⬅' : '➡') + ' ' + T('となりへ うつす') + '</button></div>';
    });
    h += '</div><div class="jgoal">' + T('ほしい オイル') + '：<b>' + J.t + 'L</b>　' + T('うごかした 回数') + '：' + V.jugN + '</div>' +
      '<div class="padfn" style="grid-template-columns:1fr"><button data-act="jug-reset">↺ ' + T('さいしょから') + '</button></div>' +
      '<div class="wrong" id="wrong">' + (V.wrongMsg || '') + '</div>';
    $app.innerHTML = frame(chHtml, h);
  }
  function jugOp(code) {
    var J = puz().jug, st = cur().st;
    var op = { fill0: 'fillA', fill1: 'fillB', empty0: 'emptyA', empty1: 'emptyB', pour0: 'AtoB', pour1: 'BtoA' }[code];
    var nx = NL.jugStep(V.jug, op, J.a, J.b);
    if (nx[0] === V.jug[0] && nx[1] === V.jug[1]) { toast(T('それでは かわらないよ')); return; }
    V.jug = nx; V.jugN++; sfx('key');
    if (nx[0] === J.t || nx[1] === J.t) {
      state.cleared[st.id + ':ok'] = true; save();
      render();
      var el = document.getElementById('jugs'); if (el) el.classList.add('ok');
      sfx('unlock'); flash();
      later(function () { sfx('get'); }, 900);
      later(function () { V.jug = null; advance(); }, 2400);
      return;
    }
    render();
  }

  function evArt(id, w) {
    var e = SC.evidence[id];
    if (!e) return '';
    if (id === 'note1') return noteHtml(1, w);
    if (id === 'note2') return noteHtml(2, w);
    return art(e.art, w);
  }
  var EMBLEM = '<svg class="emblem" viewBox="0 0 120 120"><circle cx="52" cy="52" r="34" fill="rgba(63,240,255,.08)" stroke="#3ff0ff" stroke-width="5"/>' +
    '<circle cx="52" cy="52" r="26" fill="none" stroke="#3ff0ff" stroke-width="1" opacity=".5"/><rect x="76" y="78" width="14" height="38" rx="6" transform="rotate(-45 83 97)" fill="#3ff0ff"/>' +
    '<path d="M30 52 Q52 40 74 52 Q72 62 62 61 Q52 56 42 61 Q32 62 30 52Z" fill="#fff"/><ellipse cx="42" cy="53" rx="5" ry="3" fill="#ff3a5e"/><ellipse cx="62" cy="53" rx="5" ry="3" fill="#ff3a5e"/></svg>';

  // ---------- わく ----------
  function frame(chapterHtml, body, opts) {
    opts = opts || {};
    var newN = state ? state.evNew.length : 0;
    var h = '<div class="phone"><header class="bar"><span class="brand">D-PHONE</span>' +
      '<span class="sig">📡 <i></i><i></i><i></i><i></i></span><span class="tm" id="tm">' + hhmm() + '</span></header>';
    if (chapterHtml) h += '<div class="chap">' + chapterHtml + '</div>';
    h += '<main class="scr" id="scr">' + body + '</main>';
    if (!opts.noDock) {
      h += '<nav class="dock"><div class="in">' +
        '<button data-act="back"' + (canBack() ? '' : ' class="dim"') + '>◀<small>もどる</small></button>' +
        '<button data-act="inv">🎒<small>しょうこ</small>' + (newN ? '<span class="badge">' + newN + '</span>' : '') + '</button>' +
        '<button data-act="hint">💡<small>ヒント</small></button>' +
        '<button data-act="speak">🔊<small>よみあげ</small></button>' +
        '<button data-act="menu">⚙<small>メニュー</small></button></div></nav>';
    }
    return h + '</div>';
  }

  // ---------- 画面の振り分け ----------
  function render() {
    clearTimers();
    hush();
    try {
      if (route === 'parent') renderParent();
      else if (route === 'print') renderPrint();
      else if (route === 'tag') renderTag();
      else if (route === 'name') renderName();
      else if (route === 'pass') renderPass();
      else if (route === 'cert') renderCert();
      else if (route === 'play' && state) renderPlay();
      else { route = 'title'; renderTitle(); }
    } catch (e) {
      $app.innerHTML = frame('', '<h2>エラー</h2><p class="small">' + esc(e && e.message) + '</p><button class="btn" data-act="title">タイトルへ</button>', { noDock: true });
      if (window.console) console.error(e);
    }
    if (nfc && (route !== 'play' || !cur() || cur().st.id !== nfc.step)) stopNfc();
    every(function () { var t = document.getElementById('tm'); if (t) t.textContent = hhmm(); }, 20000);
  }

  // ---------- タイトル ----------
  // タイトル＝事件ファイル（事件の一覧）
  function R(s) { return NL.rubyHtml(s); }
  function chapterOf(c, st) {
    var sc = STORIES[c.story]; if (!sc || !st) return '';
    for (var i = 0; i < sc.chapters.length; i++) {
      for (var j = 0; j < sc.chapters[i].steps.length; j++) {
        if (sc.chapters[i].steps[j].id === st.stepId) return NL.plainText(sc.chapters[i].title).split('　')[0];
      }
    }
    return '';
  }
  function starsOf(st) {
    var n = 0; Object.keys((st && st.hints) || {}).forEach(function (k) { n += st.hints[k]; });
    return n <= 2 ? 3 : n <= 5 ? 2 : 1;
  }
  function renderTitle() {
    var h = '<div class="title-scr">' + EMBLEM +
      '<div class="logo-sub">TOP SECRET MISSION</div>' +
      '<div class="logo" style="font-size:30px">' + R('[探偵|たんてい]ケータイ') + '<br>D-PHONE</div>' +
      '<div class="syslog">' + ['&gt; D-PHONE SYSTEM BOOT ...', '&gt; RADAR ....... OK', '&gt; NFC SCANNER .. ' + (hasNdef() ? 'OK' : 'TAG-LINK'), '&gt; CASE FILE .... ' + CASES.length + ' 件'].map(function (l, i) {
        return '<div style="animation-delay:' + (0.3 + i * 0.35) + 's">' + l + '</div>';
      }).join('') + '</div>';
    if (!ME) { $app.innerHTML = frame('', h + loginHtml() + '<button class="foot-link" data-act="parent">おうちの方へ（準備・事件を作る）</button></div>', { noDock: true }); return; }
    h += '<div class="agentbar"><span class="av">' + ME.icon + '</span><span class="an">' + esc(ME.name) + ' ' + T('[探偵|たんてい]') + '</span>' +
      '<button class="btn sm ghost" data-act="logout">' + T('こうたい') + '</button></div>' +
      '<h2 style="text-align:left;margin-top:8px">📁 ' + R('[事件|じけん]ファイル') + '</h2>' +
      '<p class="small" style="text-align:left;margin:0 0 4px">' + R('ときたい [事件|じけん]を えらんでね') + '</p>';
    if (!CASES.length) h += '<div class="warn">' + R('まだ [事件|じけん]が ありません。おうちの人に 作ってもらおう。') + '</div>';
    CASES.forEach(function (c, i) {
      var sc = STORIES[c.story];
      if (!sc) return;
      var st = caseState(c);
      var done = st && st.stepId === 'done';
      var badge, btns = '';
      if (!c.setup.ready) {
        badge = '<span class="cs wait">' + R('じゅんび まち') + '</span>';
        btns = '<p class="small" style="margin:8px 0 0">' + R('おうちの人に じゅんびを してもらってね') + '</p>';
      } else if (done) {
        var k = starsOf(st);
        badge = '<span class="cs done">' + R('[解決|かいけつ]ずみ') + ' ' + new Array(k + 1).join('★') + '</span>';
        btns = '<div class="row"><button class="btn gold" data-act="case-cert" data-case="' + c.id + '">🏅 ' + R('[認定証|にんていしょう]') + '</button>' +
          '<button class="btn ghost" data-act="case-replay" data-case="' + c.id + '">もう一度</button></div>';
      } else if (st) {
        badge = '<span class="cs go">' + R('[捜査|そうさ]中') + '：' + esc(chapterOf(c, st) || 'プロローグ') + '</span>';
        btns = '<div class="row"><button class="btn" data-act="case-cont" data-case="' + c.id + '">▶ つづきから</button>' +
          '<button class="btn ghost" data-act="case-restart" data-case="' + c.id + '">↺ はじめから</button></div>';
      } else {
        badge = '<span class="cs new">NEW</span>';
        btns = '<button class="btn" data-act="case-start" data-case="' + c.id + '">▶ ' + R('この [事件|じけん]に いどむ！') + '</button>';
      }
      h += '<div class="casecard' + (done ? ' done' : '') + '"><div class="cno">CASE ' + ('0' + (i + 1)).slice(-2) + ' ' + badge + '</div>' +
        '<div class="ctt">' + R(sc.title) + '</div><div class="csub">' + esc(caseName(c)) + '</div>' +
        '<p class="cbl">' + R(sc.blurb || '') + '</p>' + levelHtml(sc) + btns + '</div>';
    });
    h += '<button class="foot-link" data-act="parent">おうちの方へ（準備・事件を作る）</button></div>';
    $app.innerHTML = frame('', h, { noDock: true });
  }

  // タイトルの「だれが あそぶ？」（ログインしていないとき）
  function loginHtml() {
    var h = '<h2 style="text-align:left;margin-top:8px">🪪 ' + T('だれが あそぶ？') + '</h2>';
    if (!AGENTS.length) h += '<p class="small" style="text-align:left">' + T('はじめての [探偵|たんてい]は「あたらしい [探偵|たんてい]」で 名前を とうろくしてね。') + '</p>';
    else h += '<p class="small" style="text-align:left;margin:0 0 6px">' + T('じぶんの 名前を おしてね') + '</p>';
    h += '<div class="agents">' + AGENTS.map(function (a) {
      return '<button class="agentcard" data-act="agent-pick" data-agent="' + a.id + '"><span class="av">' + a.icon + '</span><span class="an">' + esc(a.name) + '</span>' +
        (a.pass ? '<span class="lk">🔒</span>' : '') + '</button>';
    }).join('') + '<button class="agentcard add" data-act="agent-new"><span class="av">＋</span><span class="an">' + T('あたらしい [探偵|たんてい]') + '</span></button></div>';
    return h;
  }
  // あたらしい探偵：名前・アイコン・合言葉（つけなくてもよい）
  // むずかしさ・時間・特ちょう（事件ファイルで 先に 見られるように）
  function levelHtml(sc) {
    var lv = Math.max(1, Math.min(5, sc.level || 3));
    return '<div class="lv"><span>' + R('むずかしさ') + ' <b>' + new Array(lv + 1).join('★') + '<s>' + new Array(6 - lv).join('★') + '</s></b></span>' +
      '<span>⏱ ' + (sc.minutes || 30) + R('分ぐらい') + '</span>' + (sc.levelNote ? '<span class="ln">' + R(sc.levelNote) + '</span>' : '') + '</div>' +
      (sc.features && sc.features.length ? '<div class="feat">' + sc.features.map(function (f) { return '<span>' + R(f) + '</span>'; }).join('') + '</div>' : '');
  }
  function renderName() {
    V.icon = V.icon || AVATARS[AGENTS.length % AVATARS.length];
    V.pass = V.pass || [];
    var h = '<h2>' + T('[探偵|たんてい]の 名前を 入れてね') + '</h2>' +
      '<p class="lead">' + T('D-PHONE に 名前を とうろくするよ。[認定証|にんていしょう]にも のるよ。') + '</p>' +
      '<input class="inp" id="nm" maxlength="12" autocomplete="off" placeholder="なまえ" value="' + esc(V.name || '') + '">' +
      '<h3 class="lbl">' + T('アイコン') + '</h3><div class="avs">' + AVATARS.map(function (ic) {
        return '<button class="avbtn' + (ic === V.icon ? ' on' : '') + '" data-act="agent-icon" data-icon="' + ic + '">' + ic + '</button>';
      }).join('') + '</div>' +
      '<h3 class="lbl">' + T('合言葉（えを 3つ）') + '</h3>' +
      '<p class="small">' + T('ほかの 人に 名前を つかわれないように、すきな えを 3つ じゅんばんに おしてね。つけなくても いいよ。') + '</p>' +
      '<div id="passbox">' + passPadHtml(V.pass) + '</div>' +
      '<button class="btn" data-act="name-ok">とうろく</button>' +
      '<button class="btn ghost" data-act="title">もどる</button>';
    $app.innerHTML = frame('', h, { noDock: true });
  }
  // 合言葉の入力（3つのます＋9つの絵）
  function passPadHtml(arr) {
    var h = '<div class="slots">';
    for (var i = 0; i < 3; i++) h += '<div class="slot' + (i === arr.length ? ' cur' : '') + '">' + (arr[i] != null ? PASS_SYM[arr[i]] : '') + '</div>';
    h += '</div><div class="pp">' + PASS_SYM.map(function (e, i) { return '<button data-ps="' + i + '">' + e + '</button>'; }).join('') + '</div>' +
      '<div class="kb-fn" style="grid-template-columns:1fr 1fr"><button data-psf="bs">⌫</button><button data-psf="clr">けす</button></div>';
    return h;
  }
  function passKey(i, fn) {
    V.pass = V.pass || [];
    if (fn === 'bs') V.pass.pop();
    else if (fn === 'clr') V.pass = [];
    else if (V.pass.length < 3) V.pass.push(i);
    sfx('key');
    var box = document.getElementById('passbox'); if (box) box.innerHTML = passPadHtml(V.pass);
    if (route === 'pass' && V.pass.length === 3) later(checkPass, 200);
  }
  // 合言葉をつけた探偵のログイン
  function renderPass() {
    var a = agentById(V.agent);
    if (!a) { route = 'title'; renderTitle(); return; }
    V.pass = V.pass || [];
    var h = '<div style="text-align:center"><div style="font-size:64px">' + a.icon + '</div><h2>' + esc(a.name) + ' ' + T('[探偵|たんてい]') + '</h2>' +
      '<p class="lead">' + T('合言葉の えを 3つ、じゅんばんに おしてね') + '</p>' +
      '<div id="passbox">' + passPadHtml(V.pass) + '</div><div class="wrong" id="wrong"></div>' +
      '<button class="btn ghost" data-act="title">もどる</button>' +
      '<p class="small">' + T('わすれたら おうちの人に 言ってね（[準備|じゅんび]の 画面で 消せるよ）') + '</p></div>';
    $app.innerHTML = frame('', h, { noDock: true });
  }
  function checkPass() {
    var a = agentById(V.agent);
    if (!a) return;
    if (V.pass.join(',') === a.pass) { sfx('ok'); login(a); V = {}; route = 'title'; render(); window.scrollTo(0, 0); return; }
    sfx('ng'); V.pass = [];
    var box = document.getElementById('passbox'); if (box) { box.innerHTML = passPadHtml(V.pass); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
    var w = document.getElementById('wrong'); if (w) w.innerHTML = T('合言葉が ちがうみたい');
  }

  // ---------- 遊ぶ ----------
  function renderPlay() {
    if (state.stepId === 'done') { route = 'cert'; renderCert(); return; }
    var c = cur();
    if (!c) { state.stepId = STEPS[0].st.id; save(); c = cur(); }
    var chHtml = NL.rubyHtml(NL.fill(c.ch.title, vars()));
    // 章のとびら
    if (c.ch.id !== 'op' && !state.titles[c.ch.id]) {
      var parts = Plain(c.ch.title).split('　');
      var no = parts.length > 1 ? parts[0] : '';
      var rest = NL.fill(c.ch.title, vars()).replace(/^第\d章　/, '');
      $app.innerHTML = frame('', '<div class="titlecard" data-act="titlecard-ok"><div class="no">CHAPTER ' + esc(no.replace(/[^0-9]/g, '')) + '</div>' +
        '<div class="tt">' + esc(no) + '<br>' + NL.rubyHtml(rest) + '</div><div class="ln"></div>' +
        '<p class="next-hint" style="margin-top:40px">タップで すすむ ▶</p></div>', { noDock: true });
      sfx('lock');
      return;
    }
    var st = c.st;
    if (RV != null) { renderReview(); return; }
    if (V.dlg) { renderDialog(chHtml); return; }
    if (st.type === 'story') { startDialog(st.lines, function () { onRewards(give(st.reward)); advance(); }); renderDialog(chHtml); return; }
    if (st.type === 'ending') {
      startDialog(st.lines, function () { give(st.reward); state.finishedAt = state.finishedAt || Date.now(); state.stepId = 'done'; save(); showSolved(); });
      renderDialog(chHtml); return;
    }
    if (st.type === 'puzzle') {
      if (state.cleared[st.id + ':solved']) { startDialog(st.clear, advance); renderDialog(chHtml); return; }
      renderPuzzle(chHtml, st); return;
    }
    if (st.type === 'scene') {
      if (state.cleared[st.id + ':found']) { startDialog(st.found, advance); renderDialog(chHtml); return; }
      renderScene(chHtml, st); return;
    }
    if (st.type === 'safe') { if (state.cleared['safe:open']) { advance(); return; } renderSafe(chHtml, st); return; }
    if (st.type === 'pad') { if (state.cleared[st.id + ':ok']) { advance(); return; } renderPad(chHtml, st); return; }
    if (st.type === 'order') { if (state.cleared[st.id + ':ok']) { advance(); return; } renderOrder(chHtml, st); return; }
    if (st.type === 'jugs') { if (state.cleared[st.id + ':ok'] && !V.jug) { advance(); return; } renderJugs(chHtml, st); return; }
  }

  // ---------- もどる（すんだ ところを 見返す。進み具合は 変えない） ----------
  function curIndex() { return state ? stepIndex(state.stepId) : -1; }
  function canBack() { return !!(state && route === 'play' && (RV != null ? RV > 0 : curIndex() > 0)); }
  function goBack() {
    if (!canBack()) { toast(T('まだ もどれる ところが ないよ')); return; }
    closeLayer();
    RV = RV != null ? RV - 1 : curIndex() - 1;
    sfx('key'); render(); window.scrollTo(0, 0);
  }
  function msgsHtml(lines) {
    return '<div class="talk rv">' + (lines || []).map(function (l) {
      return '<div class="msg ' + l.who + ' old" style="animation:none"><div class="av">' + (AV[l.who] || '') + '</div><div class="bub"><div class="who">' + NL.rubyHtml(WHO[l.who] || '') + '</div>' +
        '<div class="tx">' + T(l.text) + '</div></div></div>';
    }).join('') + '</div>';
  }
  function evThumbs(ids) {
    ids = (ids || []).filter(function (id) { return SC.evidence[id]; });
    if (!ids.length) return '';
    return '<div class="cards rvcards">' + ids.map(function (id) {
      return '<div class="card" data-ev="' + id + '"><div class="th">' + evArt(id) + '</div><div class="nm">' + T(SC.evidence[id].name) + '</div></div>';
    }).join('') + '</div>';
  }
  // その step の 答え（ふりかえりで 見せる）
  function answerText(st) {
    if (st.type === 'puzzle') {
      var a = answerOf(st);
      if (st.input === 'choice') return NL.MESSENGERS[+a] ? NL.MESSENGERS[+a].icon + ' ' + NL.MESSENGERS[+a].name : a;
      if (st.input === 'match') return a;
      if (st.gen === 'mclock') return a + '時';
      return st.input === 'num' ? a : '「' + a + '」';
    }
    if (st.type === 'safe') return puz().sc.code;
    if (st.type === 'pad') return '「' + st.word + '」';
    if (st.type === 'order') return vars().lkAns;
    if (st.type === 'jugs') return jugText(puz().jug.sol);
    return '';
  }
  function renderReview() {
    var ci = curIndex();
    if (RV == null || RV < 0 || RV >= ci) { RV = null; render(); return; }
    var e = STEPS[RV], st = e.st;
    var h = '<div class="rvbar">📖 ' + T('ふりかえり') + '<span>' + (RV + 1) + ' / ' + ci + '</span></div>';
    if (st.type === 'story' || st.type === 'ending') {
      h += msgsHtml(st.lines) + evThumbs(st.reward);
    } else if (st.type === 'scene') {
      h += '<h2>' + T(st.title) + '</h2><p class="lead">' + T(st.lead) + '</p>' + msgsHtml(st.found) + evThumbs(st.reward);
    } else {
      h += '<div class="puzzle-head"><span class="tag">' + (st.type === 'puzzle' ? 'CODE' : 'FINAL') + '</span><h2 style="margin:0">' + T(st.title) + '</h2></div>' +
        '<p class="lead">' + T(st.question) + '</p>' + (st.type === 'puzzle' ? puzzleVisual(st, true) : '') +
        '<div class="rvans">✅ ' + T('答え') + '：<b>' + esc(answerText(st)) + '</b></div>' +
        (st.type === 'puzzle' ? msgsHtml(st.clear) + evThumbs(st.reward) : '');
    }
    h += '<div class="row rvnav">' + (RV > 0 ? '<button class="btn ghost" data-act="rv-prev">◀ まえ</button>' : '<span></span>') +
      (RV < ci - 1 ? '<button class="btn ghost" data-act="rv-next">つぎ ▶</button>' : '<span></span>') + '</div>' +
      '<button class="btn" data-act="rv-exit">▶ ' + T('いまの ところに もどる') + '</button>';
    $app.innerHTML = frame(NL.rubyHtml(NL.fill(e.ch.title, vars())), h);
    ovPaint();
  }
  function onRewards(ids) {
    (ids || []).forEach(function (id) {
      var e = SC.evidence[id]; if (e) toast('🎒 ' + NL.rubyHtml(NL.fill(e.name, vars())) + ' を 手に入れた！', 2400);
    });
  }

  // ---------- お話 ----------
  function startDialog(lines, done) { V.dlg = { lines: lines || [], i: 0, typed: false, done: done }; }
  function renderDialog(chHtml) {
    var d = V.dlg;
    if (!d.lines.length) { var f = d.done; V.dlg = null; f(); return; }
    var h = '<div class="talk-wrap" data-act="dlg-next"><div class="talk">';
    for (var i = 0; i <= d.i && i < d.lines.length; i++) {
      var l = d.lines[i];
      var isCur = i === d.i;
      h += '<div class="msg ' + l.who + (isCur ? (d.typed ? '' : ' typing') : ' old') + '"' + (isCur ? '' : ' style="animation:none"') + '>' +
        '<div class="av">' + (AV[l.who] || '') + '</div><div class="bub"><div class="who">' + NL.rubyHtml(WHO[l.who] || '') + '</div>' +
        '<div class="tx" ' + (isCur ? 'id="typing"' : '') + '>' + (isCur && !d.typed ? '' : T(l.text)) + '</div></div></div>';
    }
    h += '</div><p class="next-hint">' + (d.i + 1) + ' / ' + d.lines.length + '　タップで すすむ ▶</p></div>';
    $app.innerHTML = frame(chHtml, h);
    stickBottom();
    if (!d.typed) typeLine();
  }
  // いちばん新しい吹き出しが、下の固定ボタンに隠れないところまで画面を動かす。
  // ⚠ 文字が出るたびに吹き出しが伸びるので、打っているあいだも呼ぶ（呼ばないと前の吹き出しで止まって見える）
  function stickBottom() {
    var el = document.querySelector('.talk .msg:last-child');
    if (!el) return;
    var dock = document.querySelector('.dock');
    var hint = document.querySelector('.talk-wrap .next-hint');
    var limit = window.innerHeight - (dock ? dock.offsetHeight : 0) - (hint ? hint.offsetHeight + 12 : 40);
    var r = el.getBoundingClientRect();
    if (r.bottom > limit) window.scrollBy(0, Math.ceil(r.bottom - limit));
  }
  function typeLine() {
    var d = V.dlg, l = d.lines[d.i];
    var el = document.getElementById('typing');
    if (!el) return;
    var full = Plain(l.text), n = 0;
    el.classList.add('caret');
    if (pref.autoSpeak) say(l.text, l.who);
    var iv = every(function () {
      n += 1;
      el.textContent = full.slice(0, n);
      if (n % 3 === 0) { sfx('tick'); stickBottom(); }
      if (n >= full.length) { clearInterval(iv); finishLine(); }
    }, l.who === 'kaitou' ? 55 : 38);
  }
  function finishLine() {
    var d = V.dlg; if (!d) return;
    d.typed = true;
    var el = document.getElementById('typing');
    if (el) { el.classList.remove('caret'); el.innerHTML = T(d.lines[d.i].text); }
    var m = el && el.closest('.msg'); if (m) m.classList.remove('typing');
    stickBottom();
  }
  function dlgNext() {
    var d = V.dlg; if (!d) return;
    if (!d.typed) { clearTimers(); finishLine(); return; }
    d.i++; d.typed = false;
    if (d.i >= d.lines.length) { var f = d.done; V.dlg = null; hush(); f(); return; }
    render();
  }

  // ---------- 暗号 ----------
  function answerOf(st) {
    var P = puz();
    if (st.gen === 'letter') return P.lp.answer;
    if (st.gen === 'clock') return P.cp.answer;
    if (st.gen === 'card') return NL.normKana(setup.places[st.card].yomi);
    if (st.gen === 'shift') return NL.normKana(setup.places[0].yomi);
    if (st.gen === 'balance') return P.ch && P.ch.ok ? String(P.ch.n) : '';
    if (st.gen === 'liar') return P.ch && P.ch.ok ? String(P.ch.liar.real) : '';
    if (st.gen === 'magic') return P.mg.ok ? String(P.mg.answer) : '';
    if (st.gen === 'match') return P.lab && P.lab.ok ? NL.eqText(P.lab.match.sol.eq) : '';
    if (st.gen === 'mclock') return P.lab && P.lab.ok ? String(P.lab.h) : '';
    if (st.gen === 'overlay') return NL.normKana(setup.places[0].yomi);
    if (st.gen === 'robot') return P.rb.ok ? String(P.rb.answer) : '';
    return NL.normKana(st.answer || '');
  }
  function renderPuzzle(chHtml, st) {
    var ans = answerOf(st);
    if (!V.input) V.input = [];
    if (st.input === 'match' && !V.ms && puz().lab && puz().lab.ok) V.ms = { bits: puz().lab.match.bits.slice(), picked: null, moved: null };
    var h = '<div class="puzzle-head"><span class="tag">CODE</span><h2 style="margin:0">' + T(st.title) + '</h2></div>' +
      '<p class="lead">' + T(st.question) + '</p>' + puzzleVisual(st, false);
    if (st.input === 'choice') {
      h += '<div class="wrong" id="wrong">' + (V.wrongMsg || '') + '</div>';
    } else if (st.input === 'match') {
      h += '<div class="padfn" style="grid-template-columns:1fr"><button data-act="ms-reset">↺ ' + T('もとに もどす') + '</button></div><div class="wrong" id="wrong">' + (V.wrongMsg || '') + '</div>';
    } else {
      h += '<div class="slots" id="slots"></div><div class="wrong" id="wrong">' + (V.wrongMsg || '') + '</div>';
      h += st.input === 'num' ? numPad('pn') : kanaKeyboard();
    }
    h += '<button class="btn gold" data-act="answer">🔍 こたえる</button>';
    $app.innerHTML = frame(chHtml, h);
    if (st.input !== 'choice' && st.input !== 'match') paintSlots(ans.length);
    ovPaint();
    var tb = document.getElementById('tblbox');
    if (tb) tb.addEventListener('toggle', function () { V.tblOpen = tb.open; });
  }
  // 暗号の 絵・表（遊ぶ画面と ふりかえりで 同じものを 出す。done＝ふりかえり）
  function puzzleVisual(st, done) {
    var P = puz(), h = '';
    if (st.gen === 'letter' && P.lp.ok) {
      h += '<ol class="clues">' + P.lp.items.map(function (it, i) {
        return '<li><span class="n">' + CIRC.charAt(i) + '</span><span class="w">「' + esc(it.word) + '」</span><span class="p">' + it.pos + '文字目</span></li>';
      }).join('') + '</ol>';
    } else if (st.gen === 'card') {
      h += '<div class="cardwrap">' + cardHtml(st.card) + '</div>';
    } else if (st.gen === 'clock' && P.cp.ok) {
      h += '<div class="side-by-side two">' + paperHtml(260).replace('width:260px', 'width:100%') + '<div style="text-align:center">' + clockSvg(P.cp.dial, 250) + '</div></div>';
    } else if (st.gen === 'balance' && P.ch && P.ch.ok) {
      h += '<div class="scales">' + P.ch.balance.eqs.map(function (e, i) { return '<div class="scale"><b>' + CIRC.charAt(i) + '</b>' + scaleSvg(e) + '</div>'; }).join('') + '</div>' +
        '<div class="panel q-ask">■ ＝ ● × <b>？</b></div>';
    } else if (st.gen === 'liar' && P.ch && P.ch.ok) {
      var pick = done ? String(P.ch.liar.real) : (V.input || [])[0];
      h += '<div class="liars">' + P.ch.liar.says.map(function (x, i) {
        var m = NL.MESSENGERS[i];
        return '<button class="liar' + (pick === String(i) ? ' on' : '') + '"' + (done ? ' disabled' : ' data-choice="' + i + '"') + '><span class="li">' + m.icon + '</span><span class="ln">' + esc(m.name) + '</span>' +
          '<span class="ls">「' + T(x.text) + '」</span></button>';
      }).join('') + '</div>' + (done ? '' : '<p class="small" style="text-align:center">' + T('ほんものだと 思う 人を おして、「こたえる」') + '</p>');
    } else if (st.gen === 'shift' && P.ch && P.ch.ok) {
      h += scrollsHtml() + '<details class="panel"' + (V.tblOpen ? ' open' : '') + ' id="tblbox"><summary>📜 ' + T('あいうえお表（じゅんばん）を 見る') + '</summary>' + kanaOrderHtml() + '</details>';
    } else if (st.gen === 'magic' && P.mg.ok) {
      h += '<div class="magic">' + P.mg.square.map(function (v, i) {
        var show = P.mg.shown.indexOf(i) >= 0;
        return '<div class="' + (i === P.mg.star ? 'star' : show ? 'num' : 'blank') + '">' + (i === P.mg.star ? (done ? v : '★') : show ? v : '') + '</div>';
      }).join('') + '</div>';
    } else if (st.gen === 'match' && P.lab && P.lab.ok) {
      h += matchSvg(P.lab.match, done) + (done ? '' : '<p class="small" style="text-align:center">' + T('いまの 式') + '：<b>' + esc(eqNow()) + '</b></p>');
    } else if (st.gen === 'mclock' && P.lab && P.lab.ok) {
      h += '<div class="mirror-wrap">' + mirrorClockSvg(P.lab.h, 230) + '</div>';
    } else if (st.gen === 'overlay' && P.lab && P.lab.ok) {
      h += overlayHtml(P.lab, done);
    } else if (st.gen === 'robot' && P.rb.ok) {
      h += robotHtml(P.rb, done);
    } else if (st.body) {
      h += '<div class="panel">' + T(st.body) + '</div>';
    }
    return h;
  }
  // 天びん 1つ（左と 右が つりあっている）。皿は うでの 上に のせる形（つり糸が 絵に かぶらない）
  function scaleSvg(e) {
    function items(list, cx) {
      var o = '', n = list.length;
      list.forEach(function (k, i) {
        var row = Math.floor(i / 3), col = i % 3, inRow = Math.min(3, n - row * 3);
        var x = cx + (col - (inRow - 1) / 2) * 24, y = 70 - row * 23;
        if (k === 'c') o += '<circle cx="' + x + '" cy="' + y + '" r="10" fill="#ffcf4a" stroke="#8a6a1a" stroke-width="1.5"/>';
        else if (k === 't') o += '<polygon points="' + x + ',' + (y - 11) + ' ' + (x + 11) + ',' + (y + 9) + ' ' + (x - 11) + ',' + (y + 9) + '" fill="#3ff0ff" stroke="#167a86" stroke-width="1.5"/>';
        else o += '<rect x="' + (x - 10) + '" y="' + (y - 10) + '" width="20" height="20" fill="#ff7ab8" stroke="#8a2a5a" stroke-width="1.5"/>';
      });
      return o;
    }
    return '<svg viewBox="0 0 300 140" class="scl"><path d="M150 100 L128 136 L172 136Z" fill="#6b5a3a"/>' +
      '<rect x="30" y="96" width="240" height="7" rx="3" fill="#c9a23a"/><circle cx="150" cy="99" r="6" fill="#8a6a3a"/>' +
      '<rect x="72" y="84" width="6" height="14" fill="#c9a23a"/><rect x="222" y="84" width="6" height="14" fill="#c9a23a"/>' +
      '<path d="M36 80 Q75 92 114 80Z" fill="#c9a23a"/><path d="M186 80 Q225 92 264 80Z" fill="#c9a23a"/>' +
      items(e.L, 75) + items(e.R, 225) + '</svg>';
  }
  // あいうえお表を 1れつに（ずらすときに 数えやすい）。「ん」の つぎは「あ」に もどる
  function kanaOrderHtml() {
    var rows = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'やゆよ', 'らりるれろ', 'わをん'];
    return '<div class="korder">' + rows.map(function (r) { return '<span class="kg">' + Array.from(r).map(function (k) { return '<i>' + k + '</i>'; }).join('') + '</span>'; }).join('<b>▸</b>') +
      '<b>▸</b><span class="kg loop"><i>あ</i></span></div><p class="small">' + T('「ん」の つぎは、また「あ」に もどるよ。゛や ゜、小さい 字の しるしは、ずらしたあとも そのまま つける。') + '</p>';
  }
  function paintSlots(n) {
    var el = document.getElementById('slots'); if (!el) return;
    var inp = V.input || [];
    var len = Math.max(n, inp.length);
    var h = '';
    for (var i = 0; i < len; i++) h += '<div class="slot' + (i === inp.length ? ' cur' : '') + (i >= n ? ' extra' : '') + '">' + esc(inp[i] || '') + '</div>';
    el.innerHTML = h;
  }
  var KB_COLS = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ んー '];
  function kanaKeyboard() {
    var h = '<div class="kb">';
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 10; c++) {
        var k = KB_COLS[c].charAt(r);
        h += (k && k !== ' ') ? '<button data-k="' + k + '">' + k + '</button>' : '<button class="gap" tabindex="-1"></button>';
      }
    }
    h += '</div><div class="kb-fn"><button data-kf="daku">゛</button><button data-kf="han">゜</button><button data-kf="small">小</button><button data-kf="bs">⌫</button><button data-kf="clr">けす</button></div>';
    return h;
  }
  var DAKU = { 'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご', 'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ', 'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど', 'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ', 'う': 'ゔ' };
  var HAN = { 'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ' };
  var SMALLK = { 'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ', 'つ': 'っ', 'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ' };
  function inv(map) { var o = {}; Object.keys(map).forEach(function (k) { o[map[k]] = k; }); return o; }
  var UNDAKU = inv(DAKU), UNHAN = inv(HAN), UNSMALL = inv(SMALLK);
  function kanaKey(k, fn) {
    var st = cur().st, n = answerOf(st).length;
    V.input = V.input || [];
    if (k) { if (V.input.length < n + 2) V.input.push(k); sfx('key'); }
    else {
      var last = V.input[V.input.length - 1];
      if (fn === 'bs') V.input.pop();
      else if (fn === 'clr') V.input = [];
      else if (last) {
        // もう一度おすと元にもどる（か→が→か、は→ぱ→は、つ→っ→つ）
        var base = UNDAKU[last] || UNHAN[last] || UNSMALL[last] || last;
        var map = fn === 'daku' ? DAKU : fn === 'han' ? HAN : SMALLK;
        var nx = last === map[base] ? base : (map[base] || last);
        V.input[V.input.length - 1] = nx;
      }
      sfx('key');
    }
    V.wrongMsg = '';
    var w = document.getElementById('wrong'); if (w) w.textContent = '';
    paintSlots(n);
  }
  // いまの 式（光の ぼう）。数字に なっていない ところは ？
  function eqNow() {
    var b = V.ms ? V.ms.bits : [];
    var d = function (off) { var m = 0; for (var i = 0; i < 7; i++) if (b[off + i]) m |= 1 << i; var k = NL.SEG7.indexOf(m); return k < 0 ? '？' : String(k); };
    return d(0) + (b[7] ? '＋' : '−') + d(8) + '＝' + d(15);
  }
  function submitAnswer() {
    var st = cur().st;
    var ans = answerOf(st), good;
    if (st.input === 'match') {
      if (!V.ms || !V.ms.moved) { toast(T('ぼうを 1本 うごかしてね')); return; }
      var e = NL.readEq(V.ms.bits);
      good = !!(e && e.ok);
    } else {
      var got = (V.input || []).join('');
      if (!got) { toast(st.input === 'choice' ? 'だれか 1人を えらんでね' : st.input === 'num' ? '数を 入れてね' : '文字を 入れてね'); return; }
      good = st.input === 'num' || st.input === 'choice' ? got === ans : NL.sameAnswer(got, ans);
    }
    if (good) {
      sfx('ok');
      flash();
      state.cleared[st.id + ':solved'] = true;
      var g = give(st.reward);
      save();
      onRewards(g);
      V = {};
      startDialog(st.clear, advance);
      later(render, 350);
    } else {
      sfx('ng');
      state.wrong++; save();
      V.miss = (V.miss || 0) + 1;
      V.wrongMsg = V.miss >= 2 ? 'ちがうようだ……💡ヒントを 見てみよう' : 'ちがうようだ……もう一度 考えよう';
      var w = document.getElementById('wrong'); if (w) w.textContent = V.wrongMsg;
      var s = document.getElementById('slots') || document.querySelector('.liars') || document.querySelector('.mscreen');
      if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }
      if (navigator.vibrate) try { navigator.vibrate([80, 40, 80]); } catch (e) { /* 無し */ }
    }
  }
  function flash() { var f = document.createElement('div'); f.className = 'flash'; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 600); }

  // ---------- 現場（レーダー） ----------
  function renderScene(chHtml, st) {
    var m = setup.modes;
    var scanning = !!(nfc && nfc.step === st.id);
    var h = '<h2>' + T(st.title) + '</h2><p class="lead">' + T(st.lead) + '</p>' +
      '<div class="radar' + (scanning ? ' fast' : '') + '" id="radar"><div class="sweep"></div>' +
      '<div class="blip" style="left:68%;top:30%"></div><div class="blip" style="left:28%;top:64%;animation-delay:.8s"></div><div class="center"></div></div>' +
      '<div class="meter"><span>' + (scanning ? 'SCAN' : 'SIGNAL') + '</span><div class="bars" id="bars">' + new Array(11).join('<i></i>') + '</div></div>';
    if (V.codeMode) {
      h += '<div class="panel"><h3>' + T('[捜査|そうさ]コードを 入力') + '</h3><p class="small">' + T('[現場|げんば]で 見つけた 紙に 書いてある 4けたの 数を 入れてね。') + '</p>' +
        '<div class="slots" id="codeslots"></div><div class="wrong" id="wrong"></div>' + numPad() +
        '<button class="btn gold" data-act="code-ok">🔍 しらべる</button><button class="btn ghost" data-act="code-close">もどる</button></div>';
    } else {
      if (m.tag) {
        if (hasNdef()) {
          h += scanning
            ? '<div class="howto">📡 ' + T('スキャン中…… タグに スマホの うらがわを ピタッと くっつけてね！') + '</div><button class="btn ghost" data-act="nfc-stop">スキャンを やめる</button>'
            : '<button class="btn" data-act="nfc-start">📡 NFC スキャン かいし</button>';
        } else {
          h += '<div class="howto">📱 ' + T(isIOS()
            ? 'タグを 見つけたら、iPhone の 上のほう（カメラの あたり）を タグに くっつけてね。出てきた おしらせを おすと、[証拠|しょうこ]が 手に入るよ。'
            : 'タグを 見つけたら、スマホの うらがわを タグに くっつけてね。ひらいた ページで [証拠|しょうこ]が 手に入るよ。') + '</div>';
        }
      }
      if (m.code) h += '<button class="btn" data-act="code-open">🔢 ' + T('[捜査|そうさ]コードを 入れる') + '</button>';
      if (m.tap) h += '<button class="btn gold" data-act="tap-search">🔍 ' + T('[現場|げんば]を しらべる') + '</button>';
    }
    $app.innerHTML = frame(chHtml, h);
    if (V.codeMode) paintCode();
    // 電波の強さの演出（本当の距離は測れない。ゆらゆら動かすだけ）
    var lvl = 3;
    every(function () {
      var bars = document.getElementById('bars'); if (!bars) return;
      var sc = !!(nfc && nfc.step === st.id);
      lvl = sc ? 6 + Math.floor(Math.random() * 5) : Math.max(2, Math.min(6, lvl + (Math.random() < 0.5 ? -1 : 1)));
      Array.prototype.forEach.call(bars.children, function (b, i) { b.className = i < lvl ? (i >= 7 ? 'hot' : 'on') : ''; });
    }, 420);
    every(function () { if (!V.codeMode) sfx('ping'); }, (nfc && nfc.step === st.id) ? 900 : 2400);
  }
  // pre＝'n'（捜査コード）か 'pn'（暗号の 数）
  function numPad(pre) {
    pre = pre || 'n';
    return '<div class="np">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-' + pre + '="' + n + '">' + n + '</button>'; }).join('') +
      '<button class="fn" data-' + pre + 'f="clr">けす</button><button data-' + pre + '="0">0</button><button class="fn" data-' + pre + 'f="bs">⌫</button></div>';
  }
  function puzNumKey(n, fn) {
    var st = cur().st, len = answerOf(st).length;
    V.input = V.input || [];
    if (fn === 'bs') V.input.pop();
    else if (fn === 'clr') V.input = [];
    else if (V.input.length < len + 1) V.input.push(String(n));
    sfx('key');
    V.wrongMsg = ''; var w = document.getElementById('wrong'); if (w) w.textContent = '';
    paintSlots(len);
  }
  function pickChoice(i) {
    V.input = [String(i)]; V.wrongMsg = '';
    sfx('key');
    Array.prototype.forEach.call(document.querySelectorAll('.liar'), function (b) { b.classList.toggle('on', b.getAttribute('data-choice') === String(i)); });
    var w = document.getElementById('wrong'); if (w) w.textContent = '';
  }
  function paintCode() {
    var el = document.getElementById('codeslots'); if (!el) return;
    var c = V.code || '';
    var h = '';
    for (var i = 0; i < 4; i++) h += '<div class="slot' + (i === c.length ? ' cur' : '') + '">' + esc(c.charAt(i)) + '</div>';
    el.innerHTML = h;
  }
  function numKey(n, fn) {
    V.code = V.code || '';
    if (fn === 'bs') V.code = V.code.slice(0, -1);
    else if (fn === 'clr') V.code = '';
    else if (V.code.length < 4) V.code += n;
    sfx('key');
    var w = document.getElementById('wrong'); if (w) w.textContent = '';
    paintCode();
  }
  function submitCode() {
    var st = cur().st;
    if ((V.code || '').length < 4) { toast('4けた 入れてね'); return; }
    if (V.code === NL.sceneCode(setup.seed, st.place)) { foundScene(cur()); return; }
    sfx('ng');
    var w = document.getElementById('wrong'); if (w) w.textContent = 'コードが ちがうようだ……';
    var s = document.getElementById('codeslots'); if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }
  }
  function tapSearch() {
    var r = document.getElementById('radar');
    if (r) r.classList.add('fast');
    sfx('ping');
    later(function () { sfx('ping'); }, 500);
    later(function () { foundScene(cur()); }, 1300);
  }
  function foundScene(entry) {
    var st = entry.st;
    stopNfc();
    var r = document.getElementById('radar');
    if (r) { var l = document.createElement('div'); l.className = 'lock'; r.appendChild(l); }
    sfx('lock');
    state.cleared[st.id + ':found'] = true;
    var g = give(st.reward);
    save();
    later(function () {
      showGet(st.reward, function () { V = {}; startDialog(st.found, advance); render(); });
    }, 500);
    return g;
  }

  // ---------- NFC（Android の Chrome だけ） ----------
  function stopNfc() { if (nfc) { try { nfc.ac.abort(); } catch (e) { /* 無し */ } nfc = null; } }
  function startNfc() {
    var st = cur().st;
    if (!hasNdef()) return;
    stopNfc();
    var ac = new AbortController();
    var reader = new window.NDEFReader();
    reader.scan({ signal: ac.signal }).then(function () {
      nfc = { ac: ac, step: st.id };
      render();
    }).catch(function (e) {
      toast('NFC が つかえません：' + esc(e && e.message || e) + '<br>スマホの せっていで NFC を オンにしてね', 4500);
    });
    reader.onreading = function (ev) {
      var tok = tokenFromMessage(ev.message);
      if (!tok) { sfx('ng'); toast('この タグは [事件|じけん]の タグでは ないようだ'.replace(/\[([^|\]]+)\|([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>')); return; }
      onTag(tok, true);
    };
    reader.onreadingerror = function () { toast('うまく 読めなかった。もう一度 くっつけてね'); };
  }
  function tokenFromMessage(msg) {
    var recs = (msg && msg.records) || [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i], txt = '';
      try { txt = new TextDecoder(r.encoding || 'utf-8').decode(r.data); } catch (e) { txt = ''; }
      var m = txt.match(/[?&]t=(T[0-9A-Za-z]+)/) || txt.match(/^(T[0-9A-Za-z]+)$/);
      if (m) return m[1];
    }
    return null;
  }

  // ---------- タグから開いたとき ----------
  function judgeTag(tok) {
    var d = NL.decodeTag(tok);
    if (!d) return { kind: 'bad' };
    var out = { kind: '', idx: d.idx, code: d.code };
    if (!state) { out.kind = 'nogame'; return out; }
    if (d.code !== NL.sceneCode(setup.seed, d.idx)) { out.kind = 'othercase'; return out; }
    var e = sceneEntry(d.idx);
    if (!e) { out.kind = 'bad'; return out; }
    out.entry = e;
    if (state.cleared[e.st.id + ':found'] || stepIndex(state.stepId) > stepIndex(e.st.id) || state.stepId === 'done') { out.kind = 'already'; return out; }
    if (state.stepId === e.st.id) { out.kind = 'got'; return out; }
    out.kind = 'early'; return out;
  }
  function onTag(tok, inApp) {
    var j = judgeTag(tok);
    if (j.kind === 'got') {
      route = 'play';
      if (!inApp) { V = {}; render(); }
      later(function () { foundScene(j.entry); }, inApp ? 0 : 300);
      return;
    }
    if (inApp && (j.kind === 'early' || j.kind === 'already')) {
      sfx(j.kind === 'early' ? 'ng' : 'key');
      toast(j.kind === 'early' ? 'ここにも 何か ありそうだ……でも 今は まだ わからない。暗号を といてから もう一度！' : 'ここは もう しらべた [現場|げんば]だ'.replace(/\[([^|\]]+)\|([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>'), 3500);
      return;
    }
    tagView = j;
    route = 'tag';
    render();
  }
  function renderTag() {
    var j = tagView || { kind: 'bad' };
    var h = '<div style="text-align:center;padding-top:4vh">';
    if (j.kind === 'bad') {
      h += '<h2>' + T('？？？') + '</h2><p class="lead">' + T('この タグは 読めなかった。') + '</p>';
    } else if (j.kind === 'early') {
      h += '<h2>📡 ' + T('[反応|はんのう]あり') + '</h2><p class="lead">' + T('ここにも 何か ありそうだ……でも 今は まだ わからない。暗号を といてから、もう一度 かざそう！') + '</p>';
    } else if (j.kind === 'already') {
      h += '<h2>✅ ' + T('しらべずみ') + '</h2><p class="lead">' + T('ここは もう しらべた [現場|げんば]だ。') + '</p>';
    } else {
      sfx('get');
      h += '<div class="logo-sub">INCOMING SIGNAL</div><h2 style="margin-top:8px">📡 ' + T('暗号[通信|つうしん]を [受信|じゅしん]！') + '</h2>' +
        '<p class="lead">' + T('[現場|げんば]の [捜査|そうさ]コードは') + '</p>' +
        '<div style="font-family:var(--dot);font-size:58px;letter-spacing:.3em;color:var(--gold);text-shadow:0 0 16px rgba(255,207,74,.7)">' + esc(j.code) + '</div>' +
        '<p class="lead">' + T('いつもの D-PHONE の 画面で「[捜査|そうさ]コードを 入れる」を おして、この 数を 入れてね。') + '</p>';
      if (!ME) {
        h += '<p class="lead">' + T('（さきに じぶんの 名前で D-PHONE に 入ってね）') + '</p>';
      } else if (j.kind === 'othercase') {
        h += '<div class="warn">おうちの方へ：このタグは、この端末に入っている事件とは別の準備で作られています。準備画面の「ほかの端末へ準備を写す」で、遊ぶ端末の準備をそろえてください。</div>';
      } else if (isIOS()) {
        h += '<p class="small">おうちの方へ：iPhone でホーム画面のアイコンから遊んでいると、タグで開くページ（Safari）とは記録が別になるため、このコードが出ます。Safari のまま遊ぶと自動で進みます。</p>';
      }
    }
    h += '<button class="btn" data-act="tag-close">D-PHONE を ひらく</button></div>';
    $app.innerHTML = frame('', h, { noDock: true });
  }

  // ---------- 発射パネル（宇宙文字で ことばを 入れる） ----------
  // ボタンは9こ（ことばの字＋まぎらわしい字）。並びは seed で決まる（開きなおしても同じ）
  function padPlan(st) {
    var ks = NL.kanaList(st.word).map(NL.baseKana);
    var want = ks.map(NL.alienIndex);
    var r = NL.rng((setup.seed >>> 0) + 77);
    var others = NL.shuffle(NL.ALIEN_KANA.filter(function (k) { return ks.indexOf(k) < 0; }), r).slice(0, 9 - uniqList(want).length);
    var btns = NL.shuffle(uniqList(want).concat(others.map(NL.alienIndex)), r);
    // ほんやく表：通信その1が宇宙文字なら同じ表、ちがえば このパネル用に作る
    var c1 = puz().c1;
    var dec = c1 && c1.ok && c1.kind === 'alien' ? c1.decoder : NL.cardPuzzle('alien', st.word, (setup.seed >>> 0) + 9).decoder;
    return { want: want, btns: btns, dec: dec };
  }
  function uniqList(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
  function glyphOf(i, size, color) { return NazoCards.glyphSvg(NL.ALIEN_GLYPHS[i], size, color); }
  function renderPad(chHtml, st) {
    var pl = padPlan(st);
    V.seq = V.seq || [];
    var lit = (state.hints[st.id] || 0) >= 3;
    var h = '<div class="puzzle-head"><span class="tag">FINAL</span><h2 style="margin:0">' + T(st.title) + '</h2></div>' +
      '<p class="lead">' + T(st.question) + '</p>' +
      '<details class="panel"' + (V.decOpen ? ' open' : '') + ' id="decbox"><summary>📖 ' + T('キラリ星の ほんやく表を 見る') + '</summary><div class="decgrid">' +
      pl.dec.map(function (d) { return '<div>' + glyphOf(d.glyph, 34, '#2a3fb8') + '<b>＝' + esc(d.kana) + '</b></div>'; }).join('') + '</div></details>' +
      '<div class="pad" id="pad"><div class="lbl">LAUNCH CONSOLE</div><div class="padscr">';
    for (var i = 0; i < pl.want.length; i++) h += '<span class="ps' + (i === V.seq.length ? ' cur' : '') + '">' + (V.seq[i] != null ? glyphOf(V.seq[i], 40, '#7dffb0') : '') + '</span>';
    h += '</div><div class="padbtns">';
    pl.btns.forEach(function (g) {
      var order = lit ? pl.want.map(function (w, k) { return w === g ? k + 1 : 0; }).filter(Boolean) : [];
      h += '<button data-pad="' + g + '"' + (order.length ? ' class="lit"' : '') + '>' + glyphOf(g, 52, '#5ee7ff') + (order.length ? '<i>' + order.join('・') + '</i>' : '') + '</button>';
    });
    h += '</div><div class="padfn"><button data-act="pad-bs">⌫</button><button data-act="pad-clr">けす</button></div></div>' +
      '<button class="btn gold" data-act="pad-go">🚀 ' + T('[発射|はっしゃ]！') + '</button><div class="wrong" id="wrong">' + (V.wrongMsg || '') + '</div>';
    $app.innerHTML = frame(chHtml, h);
    var db = document.getElementById('decbox');
    if (db) db.addEventListener('toggle', function () { V.decOpen = db.open; });
  }
  function padKey(g) {
    var st = cur().st, pl = padPlan(st);
    V.seq = V.seq || [];
    if (V.seq.length < pl.want.length) V.seq.push(g);
    V.wrongMsg = '';
    sfx('key'); render();
  }
  function padGo() {
    var st = cur().st, pl = padPlan(st);
    if (!V.seq || V.seq.length < pl.want.length) { toast(T('ボタンを ' + pl.want.length + 'つ おしてね')); return; }
    if (V.seq.join(',') === pl.want.join(',')) {
      state.cleared[st.id + ':ok'] = true; save();
      V.seq = []; showLaunch(advance);
      return;
    }
    sfx('ng'); state.wrong++; save();
    V.miss = (V.miss || 0) + 1; V.seq = [];
    V.wrongMsg = V.miss >= 2 ? 'ERROR……💡ヒントを 見てみよう' : 'ERROR……ことばが ちがう！';
    render();
    var p = document.getElementById('pad'); if (p) { p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
  }
  // 発射の演出（3・2・1 → UFO が夜空へ）
  function showLaunch(done) {
    var stars = '';
    for (var i = 0; i < 60; i++) stars += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;top:' + (Math.random() * 100).toFixed(1) + '%;animation-delay:' + (Math.random() * 2).toFixed(2) + 's"></i>';
    $layer.innerHTML = '<div class="launch">' + stars + '<div class="cd" id="cd">3</div><div class="ufo" id="ufo">' + ufoSvg() + '</div><div class="t">' + T('[発射|はっしゃ] [成功|せいこう]！') + '</div></div>';
    var cd = document.getElementById('cd'), n = 3;
    sfx('click');
    var t = setInterval(function () {
      n--;
      if (n > 0) { cd.textContent = n; cd.style.animation = 'none'; void cd.offsetWidth; cd.style.animation = ''; sfx('click'); return; }
      clearInterval(t);
      cd.textContent = '';
      var l = document.querySelector('.launch'); if (l) l.classList.add('go');
      sfx('unlock');
      setTimeout(function () { sfx('get'); }, 900);
      setTimeout(function () { closeLayer(); done(); }, 3200);
    }, 900);
  }
  function ufoSvg() {
    return '<svg viewBox="0 0 200 150"><ellipse cx="100" cy="64" rx="40" ry="36" fill="#bff8ff" opacity=".9"/>' +
      '<g transform="translate(70 24) scale(1.3)">' + AV.pico.replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</g>' +
      '<ellipse cx="100" cy="92" rx="92" ry="26" fill="#8a93c8"/><ellipse cx="100" cy="86" rx="92" ry="20" fill="#c7cdf0"/>' +
      '<circle cx="40" cy="96" r="6" fill="#ffd36b"/><circle cx="70" cy="104" r="6" fill="#ff7ab8"/><circle cx="100" cy="107" r="6" fill="#7dffb0"/><circle cx="130" cy="104" r="6" fill="#5ee7ff"/><circle cx="160" cy="96" r="6" fill="#ffd36b"/>' +
      '<path d="M70 116 L60 146 M100 118 L100 150 M130 116 L140 146" stroke="#ffe08a" stroke-width="8" stroke-linecap="round" opacity=".7"/></svg>';
  }

  // ---------- からくり錠（4つの 絵を 左から ならべる） ----------
  function renderOrder(chHtml, st) {
    var lk = puz().lk, it = NL.LOCK_ITEMS;
    V.ord = V.ord || [];
    var lit = (state.hints[st.id] || 0) >= 3;
    var h = '<div class="puzzle-head"><span class="tag">FINAL</span><h2 style="margin:0">' + T(st.title) + '</h2></div>' +
      '<p class="lead">' + T(st.question) + '</p>' +
      '<details class="panel"' + (V.clOpen !== false ? ' open' : '') + ' id="clbox"><summary>📜 ' + T('[巻物|まきもの]の 切れはしを 見る') + '</summary><ol class="lkclues">' +
      lk.clues.map(function (c) { return '<li>' + esc(c.text) + '</li>'; }).join('') + '</ol></details>' +
      '<div class="lock" id="lock"><div class="lbl">KARAKURI LOCK</div><div class="lslots">';
    for (var i = 0; i < 4; i++) {
      var x = V.ord[i];
      h += '<span class="ls' + (i === V.ord.length ? ' cur' : '') + '"><small>' + T('左から') + ' ' + (i + 1) + '</small>' + (x != null ? '<b>' + it[x].e + '</b><em>' + esc(it[x].n) + '</em>' : '') + '</span>';
    }
    h += '</div><div class="lbtns">';
    it.forEach(function (x, k) {
      var used = V.ord.indexOf(k) >= 0, at = lit ? lk.answer.indexOf(k) + 1 : 0;
      h += '<button data-lk="' + k + '"' + (used ? ' disabled' : '') + (at ? ' class="lit"' : '') + '><b>' + x.e + '</b><em>' + esc(x.n) + '</em>' + (at ? '<i>' + at + '</i>' : '') + '</button>';
    });
    h += '</div><div class="padfn"><button data-act="lk-bs">⌫</button><button data-act="lk-clr">けす</button></div></div>' +
      '<button class="btn gold" data-act="lk-go">🔓 ' + T('からくりを とく') + '</button><div class="wrong" id="wrong">' + (V.wrongMsg || '') + '</div>';
    $app.innerHTML = frame(chHtml, h);
    var cb = document.getElementById('clbox');
    if (cb) cb.addEventListener('toggle', function () { V.clOpen = cb.open; });
  }
  function orderKey(k) {
    V.ord = V.ord || [];
    if (V.ord.length < 4 && V.ord.indexOf(k) < 0) V.ord.push(k);
    V.wrongMsg = ''; sfx('key'); render();
  }
  function orderGo() {
    var st = cur().st, lk = puz().lk;
    if (!V.ord || V.ord.length < 4) { toast(T('4つ ぜんぶ ならべてね')); return; }
    if (V.ord.join(',') === lk.answer.join(',')) {
      state.cleared[st.id + ':ok'] = true; save();
      var el = document.getElementById('lock'); if (el) el.classList.add('ok');
      sfx('unlock'); flash();
      later(function () { sfx('get'); }, 900);
      later(function () { V.ord = []; advance(); }, 2200);
      return;
    }
    sfx('ng'); state.wrong++; save();
    V.miss = (V.miss || 0) + 1; V.ord = [];
    V.wrongMsg = V.miss >= 2 ? 'カチッ……ひらかない。💡ヒントを 見てみよう' : 'カチッ……ひらかない。切れはしを 1まいずつ たしかめよう';
    render();
    var p = document.getElementById('lock'); if (p) { p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
  }

  // ---------- 金庫 ----------
  function renderSafe(chHtml, st) {
    if (!V.dial) V.dial = [0, 0, 0, 0];
    var h = '<div class="puzzle-head"><span class="tag">FINAL</span><h2 style="margin:0">' + T(st.title) + '</h2></div>' +
      '<p class="lead">' + T(st.question) + '</p>' +
      '<details class="panel"' + (V.memoOpen ? ' open' : '') + ' id="memobox"><summary>📜 ' + T('[怪盗|かいとう]の メモを 見る') + '</summary><div style="margin-top:10px">' + memoHtml(300).replace('width:300px', 'width:100%') + '</div></details>' +
      '<div class="safe" id="safe"><div class="leds"><i></i><i></i><i></i><i></i></div><div class="lbl">SECURITY LOCK</div><div class="dials">';
    for (var i = 0; i < 4; i++) {
      h += '<div class="dial"><button data-dial="' + i + '" data-d="1">▲</button><div class="win" id="dw' + i + '" data-dialwin="' + i + '">' + V.dial[i] + '</div><button data-dial="' + i + '" data-d="-1">▼</button></div>';
    }
    h += '</div><div class="door"></div><div class="gem">' + diamondHtml(170) + '</div></div>' +
      '<button class="btn gold" data-act="safe-open">🔓 ' + T('金庫を あける') + '</button><div class="wrong" id="wrong"></div>';
    $app.innerHTML = frame(chHtml, h);
    var mb = document.getElementById('memobox');
    if (mb) mb.addEventListener('toggle', function () { V.memoOpen = mb.open; });
    bindDialSwipe();
  }
  function turnDial(i, d) {
    V.dial[i] = (V.dial[i] + d + 10) % 10;
    var el = document.getElementById('dw' + i); if (el) el.textContent = V.dial[i];
    var s = document.getElementById('safe'); if (s) s.classList.remove('err');
    var w = document.getElementById('wrong'); if (w) w.textContent = '';
    sfx('click');
  }
  // ダイヤルの窓を上下になぞっても回る
  function bindDialSwipe() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-dialwin]'), function (el) {
      var y0 = null, i = +el.getAttribute('data-dialwin');
      el.addEventListener('pointerdown', function (e) { y0 = e.clientY; try { el.setPointerCapture(e.pointerId); } catch (x) { /* 無し */ } });
      el.addEventListener('pointermove', function (e) {
        if (y0 === null) return;
        var dy = e.clientY - y0;
        if (Math.abs(dy) > 22) { turnDial(i, dy < 0 ? 1 : -1); y0 = e.clientY; }
      });
      el.addEventListener('pointerup', function () { y0 = null; });
      el.addEventListener('pointercancel', function () { y0 = null; });
    });
  }
  function openSafe() {
    var got = V.dial.join('');
    var want = puz().sc.code;
    var s = document.getElementById('safe');
    if (got === want) {
      s.classList.add('ok');
      sfx('unlock');
      state.cleared['safe:open'] = true;
      save();
      later(function () { s.classList.add('open'); }, 500);
      later(function () { sfx('get'); }, 1600);
      later(function () { advance(); }, 3400);
    } else {
      sfx('ng');
      state.wrong++; save();
      V.miss = (V.miss || 0) + 1;
      s.classList.remove('err', 'shake'); void s.offsetWidth; s.classList.add('err', 'shake');
      var w = document.getElementById('wrong');
      if (w) w.textContent = V.miss >= 2 ? 'ERROR……💡ヒントを 見てみよう' : 'ERROR……番号が ちがう！';
    }
  }

  // ---------- 証拠ゲット・事件解決 ----------
  function showGet(ids, then) {
    sfx('get');
    flash();
    var h = '<div class="overlay" data-act="get-close"><div class="sheet get"><div class="big">' + T('[証拠|しょうこ]ゲット！') + '</div>' +
      '<div class="cards">' + (ids || []).map(function (id) {
        var e = SC.evidence[id];
        return '<div class="card"><div class="th">' + evArt(id) + '</div><div class="nm">' + T(e.name) + '</div></div>';
      }).join('') + '</div><button class="btn gold">OK ▶</button></div></div>';
    $layer.innerHTML = h;
    V.afterGet = then;
  }
  function showSolved() {
    sfx('win');
    var conf = '';
    var cols = ['#ffcf4a', '#3ff0ff', '#ff3a5e', '#48ff9b', '#ffffff'];
    for (var i = 0; i < 70; i++) {
      conf += '<i class="confetti" style="left:' + (Math.random() * 100).toFixed(1) + '%;background:' + cols[i % 5] +
        ';animation-duration:' + (2.5 + Math.random() * 2.5).toFixed(2) + 's;animation-delay:' + (Math.random() * 1.5).toFixed(2) + 's"></i>';
    }
    var sv = (SC && SC.solved) || { t1: 'CASE CLOSED', t2: ['[事件|じけん]', '[解決|かいけつ]!!'], t3: 'MISSION COMPLETE' };
    $layer.innerHTML = '<div class="solved"><div class="rays"></div>' + conf +
      '<div class="t1">' + esc(sv.t1) + '</div><div class="t2">' + sv.t2.map(function (x) { return NL.rubyHtml(x); }).join('<br>') + '</div>' +
      '<div class="t3">' + esc(sv.t3) + '</div>' +
      '<button class="btn gold" data-act="to-cert">🏅 ' + T('[認定証|にんていしょう]を うけとる') + '</button></div>';
  }
  function rankOf() {
    var n = 0; Object.keys(state.hints || {}).forEach(function (k) { n += state.hints[k]; });
    return { hints: n, stars: n <= 2 ? 3 : n <= 5 ? 2 : 1 };
  }
  function durText(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + '分';
    var h = Math.floor(m / 60);
    if (h < 48) return h + '時間' + (m % 60) + '分';
    return Math.floor(h / 24) + '日';
  }
  function renderCert() {
    if (!state || state.stepId !== 'done') { route = 'title'; renderTitle(); return; }
    var r = rankOf();
    var d = new Date(state.finishedAt || Date.now());
    var no = ('000000' + (setup.seed % 1000000)).slice(-6);
    var ce = (SC && SC.cert) || {
      title: '[探偵|たんてい][認定証|にんていしょう]', ranks: ['見習い[探偵|たんてい]', 'すごうで[探偵|たんてい]', '名[探偵|たんてい]'],
      body: 'あなたは [怪盗|かいとう]クロウの 暗号を すべて とき、ダイヤ『ブルームーン』を とりもどしました。よって ここに、りっぱな [探偵|たんてい]で ある ことを みとめます。',
      time: '[捜査|そうさ]時間', sign: 'D-PHONE 開発者　ネジマキ[博士|はかせ]', seal: 'D-PHONE'
    };
    var h = '<div class="cert' + (SC && SC.cardTheme === 'space' ? ' space' : '') + '"><div class="no">' + T('[認定|にんてい]番号') + ' No.' + no + '</div><div class="ttl">' + NL.rubyHtml(ce.title) + '</div>' +
      '<div class="nm">' + NL.rubyHtml(ce.ranks[r.stars - 1]) + '　' + esc(state.name) + '</div>' +
      '<div class="bd">' + T(ce.body) + '</div>' +
      '<div class="rank">' + new Array(r.stars + 1).join('★') + new Array(4 - r.stars).join('☆') + '</div>' +
      '<div class="st"><div>' + NL.rubyHtml(ce.time) + '<b>' + durText((state.finishedAt || Date.now()) - state.startedAt) + '</b></div>' +
      '<div>ヒント<b>' + r.hints + '回</b></div><div>ミス<b>' + (state.wrong || 0) + '回</b></div></div>' +
      '<div class="sign">' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日<br>' + NL.rubyHtml(ce.sign) + '</div>' +
      '<div class="seal">' + T('[認定|にんてい]') + '<br>' + NL.rubyHtml(ce.seal) + '</div></div>' +
      '<div class="noprint"><button class="btn gold" data-act="print-cert">🖨 ' + T('[印刷|いんさつ]・PDFに する') + '</button>' +
      '<button class="btn ghost" data-act="evlist">🎒 ' + T('あつめた [証拠|しょうこ]を 見る') + '</button>' +
      '<button class="btn ghost" data-act="title">📁 ' + R('[事件|じけん]ファイルへ もどる') + '</button></div>';
    $app.innerHTML = frame('', h, { noDock: true });
  }

  // ---------- しょうこ・ヒント・メニュー ----------
  function showInventory() {
    var ids = state ? state.ev : [];
    var newSet = state ? state.evNew.slice() : [];
    var h = '<div class="overlay" data-act="close-layer"><div class="sheet" data-stop="1"><button class="x" data-act="close-layer">とじる</button>' +
      '<h2>🎒 ' + T('[証拠|しょうこ]ファイル') + '</h2>';
    if (!ids.length) h += '<p class="empty">まだ 何も ない</p>';
    else h += '<div class="cards">' + ids.map(function (id) {
      var e = SC.evidence[id];
      return '<div class="card' + (newSet.indexOf(id) >= 0 ? ' new' : '') + '" data-ev="' + id + '"><div class="th">' + evArt(id) + '</div><div class="nm">' + T(e.name) + '</div></div>';
    }).join('') + '</div>';
    h += '</div></div>';
    $layer.innerHTML = h;
    if (state && state.evNew.length) { state.evNew = []; save(); var b = document.querySelector('.dock .badge'); if (b) b.remove(); }
  }
  function showEvidence(id) {
    var e = SC.evidence[id];
    var h = '<div class="overlay" data-act="close-layer"><div class="sheet" data-stop="1"><button class="x" data-act="inv">◀ もどる</button>' +
      '<h2>' + T(e.name) + '</h2><div style="display:flex;justify-content:center;margin:12px 0 16px">' + evArt(id, 300) + '</div>' +
      '<p class="lead">' + T(e.desc) + '</p><button class="btn ghost" data-say="' + id + '">🔊 よみあげ</button></div></div>';
    $layer.innerHTML = h;
  }
  function showHint() {
    var hw = (SC && SC.hintWho) || 'hakase', HL = (SC && SC.hintLines) || {};
    var c = state && route === 'play' ? cur() : null;
    var st = c && c.st;
    var h = '<div class="overlay" data-act="close-layer"><div class="sheet" data-stop="1"><button class="x" data-act="close-layer">とじる</button>' +
      '<div class="msg ' + hw + '" style="margin-bottom:6px"><div class="av">' + AV[hw] + '</div><div class="bub"><div class="who">' + NL.rubyHtml(WHO[hw]) + '</div>';
    if (!st || !st.hints || V.dlg || !state.titles[c.ch.id] && c.ch.id !== 'op') {
      h += T(HL.idle || 'いまは お話を よく 聞くのじゃ。') + '</div></div>';
    } else {
      var n = state.hints[st.id] || 0;
      h += T(n ? (HL.more || 'ヒントじゃ。よく 読むのじゃぞ。') : (HL.first || 'こまったかの？ ヒントを 1つずつ 出すぞい。')) + '</div></div>';
      for (var i = 0; i < n; i++) h += '<div class="hint-lv"><b>ヒント ' + (i + 1) + '</b>' + T(st.hints[i]) + '</div>';
      if (n < st.hints.length) h += '<button class="btn gold" data-act="hint-more">💡 ' + (n === st.hints.length - 1 ? 'さいごの ヒント（答え）を 見る' : 'ヒント ' + (n + 1) + ' を 見る') + '</button>';
      if (n) h += '<button class="btn ghost" data-act="hint-say">🔊 よみあげ</button>';
    }
    h += '</div></div>';
    $layer.innerHTML = h;
  }
  function moreHint() {
    var st = cur().st;
    state.hints[st.id] = Math.min(st.hints.length, (state.hints[st.id] || 0) + 1);
    save();
    sfx('key');
    // 発射パネルは ヒント3で ボタンが光る（うしろの画面を描き直す）
    if (st.type === 'pad' || st.type === 'order' || st.input === 'match') render();
    showHint();
  }
  function showMenu() {
    var h = '<div class="overlay" data-act="close-layer"><div class="sheet" data-stop="1"><button class="x" data-act="close-layer">とじる</button><h2>⚙ メニュー</h2>' +
      '<button class="btn" data-act="tog-sound">' + (pref.sound ? '🔊 こうかおん：オン' : '🔈 こうかおん：オフ') + '</button>' +
      '<button class="btn" data-act="tog-speak">' + (pref.autoSpeak ? '🗣 ' + T('お話を 自動で 読む：オン') : '🗣 ' + T('お話を 自動で 読む：オフ')) + '</button>' +
      (state && route === 'play' && state.stepId !== 'done' ? '<button class="btn ghost" data-act="restart-cur">↺ ' + T('はじめから やりなおす') + '</button>' : '') +
      '<button class="btn ghost" data-act="title">📁 ' + R('[事件|じけん]ファイルへ もどる') + '</button>' +
      '<button class="btn ghost" data-act="parent">おうちの方へ（準備）</button></div></div>';
    $layer.innerHTML = h;
  }
  function closeLayer() { $layer.innerHTML = ''; hush(); }
  function speakNow() {
    if (route !== 'play' || !state) return;
    if (V.dlg) { var l = V.dlg.lines[V.dlg.i]; if (l) say(l.text, l.who); return; }
    var st = cur().st;
    var parts = [st.title || '', st.question || st.lead || ''];
    if (st.type === 'puzzle' && st.gen === 'letter' && puz().lp.ok) {
      puz().lp.items.forEach(function (it, i) { parts.push((i + 1) + 'つめ、' + it.word + 'の、' + it.pos + '文字目。'); });
    }
    say(parts.join('。'), 'sys');
  }

  // ---------- おうちの方の画面 ----------
  function parentOk() { return !PIN || ssGet(K_PARENT) === '1'; }
  function renderParent() {
    if (!PIN) { renderPinSet(); return; }
    if (!parentOk()) {
      $app.innerHTML = frame('', '<div class="parent"><h2>おうちの方へ</h2><p>準備画面の合言葉（4けた）を入れてください。</p>' +
        '<input type="password" inputmode="numeric" maxlength="8" id="pin" class="inp" autocomplete="off">' +
        '<button class="btn" data-act="pin-in">ひらく</button><button class="btn ghost" data-act="title">もどる</button>' +
        '<p class="small">合言葉を忘れたときは、この端末の Safari / Chrome の「サイトのデータ」を消すと最初からになります。</p></div>', { noDock: true });
      return;
    }
    if (!kase) {
      $app.innerHTML = frame('', '<div class="parent"><h2>おうちの方へ（準備）</h2>' + caseFileHtml() + '<button class="btn" data-act="title">おわる（事件ファイルへ）</button></div>', { noDock: true });
      return;
    }
    if (!setup.cards) setup.cards = {};
    if (!V.draft) V.draft = JSON.parse(JSON.stringify(setup));
    var d = V.draft;
    var roles = SC.placeRoles || [];
    var h = '<div class="parent"><h2>おうちの方へ（準備）</h2>' + caseFileHtml();
    h += '<h2 style="margin-top:18px">CASE ' + ('0' + (CASES.indexOf(kase) + 1)).slice(-2) + '「' + esc(caseName(kase)) + '」の準備</h2>';
    h += '<div class="panel"><h3>遊び方の流れ</h3><ol>' +
      '<li>下で <b>隠し場所を2つ</b> 決めて「保存」。暗号は場所に合わせて自動で作り直されます。</li>' +
      '<li><b>NFCタグにURLを書き込み</b>、場所1・場所2に貼る（タグが無ければ印刷した紙だけでも遊べます）。</li>' +
      '<li>「印刷する紙」を印刷して、タグのそばに隠す（捜査コードと、謎の紙・怪盗のメモが載っています）。</li>' +
      '<li>子どもに端末を渡して「捜査かいし」。困ったら💡ヒント（3段階、3つ目は答え）。</li></ol></div>';

    h += '<div class="panel"><h3>① 事件の名前と隠し場所</h3>' +
      '<label>事件の名前（事件ファイルに出ます。空なら「' + esc(NL.plainText(SC.subtitle)) + '」）</label><input type="text" data-pf="title" data-i="0" value="' + esc(d.title || '') + '" placeholder="' + esc(NL.plainText(SC.subtitle)) + '">';
    [0, 1].forEach(function (i) {
      var p = d.places[i];
      h += '<h3 style="color:var(--cyan);margin-top:12px">場所' + (i + 1) + (roles[i] ? '（' + esc(roles[i]) + '）' : '') + '</h3>' +
        '<label>よくある場所から選ぶ</label><select data-pf="preset" data-i="' + i + '"><option value="">（自分で入れる）</option>' +
        PRESETS.map(function (q, k) { return '<option value="' + k + '"' + (q.name === p.name && q.yomi === p.yomi ? ' selected' : '') + '>' + esc(q.name) + '（' + esc(q.yomi) + '）</option>'; }).join('') + '</select>' +
        '<label>子どもに見せる名前（小3までの漢字か、ひらがなで。例：本だな）</label><input type="text" data-pf="name" data-i="' + i + '" value="' + esc(p.name) + '">' +
        '<label>読み（ひらがなだけ・2〜9文字。これが暗号の答えになります）</label><input type="text" data-pf="yomi" data-i="' + i + '" value="' + esc(p.yomi) + '">' +
        '<label>博士の3つ目のヒント（どこに貼ったか。ひらがなで。空なら「まわりを手でさわって…」）</label><textarea data-pf="detail" data-i="' + i + '" placeholder="例：上から 2だんめの、本の うしろを 見るのじゃ。">' + esc(p.detail || '') + '</textarea>';
    });
    if (hasStep('safe')) h += '<label>カギに刻む数（10〜49。金庫の番号の後ろ2けた＝この数の2倍）</label><div class="row"><input type="number" min="10" max="49" data-pf="keyNo" value="' + esc(d.keyNo) + '"><button class="btn sm" data-act="key-dice" style="flex:0 0 auto">🎲 てきとうに</button></div>';
    h += '</div>';

    h += cardPanelHtml(d);
    h += '<div class="panel"><h3>② 証拠の手に入れ方</h3>' +
      chk('tag', d.modes.tag, 'NFCタグをかざす', 'iPhone はかざすと通知が出て、押すとページが開きます。Android の Chrome は画面の「スキャン」でも読めます。') +
      chk('code', d.modes.code, '捜査コード（4けた）を入れる', '印刷した紙に載っている数を入れる方法。タグが読めない端末（iPad など）でも遊べます。') +
      chk('tap', d.modes.tap, '「現場をしらべる」ボタンで手に入れる', 'タグも紙も使わず画面だけで進める練習用。オンにすると探さなくても進めてしまいます。') + '</div>';

    h += '<div id="pcheck">' + checkHtml(d) + '</div>';
    h += '<button class="btn gold" data-act="setup-save" id="psave">💾 保存する</button>';

    h += '<div class="panel"><h3>③ タグに書き込むURL</h3>';
    [0, 1].forEach(function (i) {
      var u = tagUrl(i);
      h += '<p style="margin:10px 0 4px"><b>場所' + (i + 1) + '：' + esc(setup.places[i].name) + '</b>　捜査コード <b style="font-size:18px;color:var(--gold)">' + NL.sceneCode(setup.seed, i) + '</b></p>' +
        '<div class="mono">' + esc(u) + '</div><button class="btn sm" data-copy="' + esc(u) + '">コピー</button>' +
        (hasNdef() ? '<button class="btn sm" data-write="' + i + '">📝 このスマホでタグに書く</button>' : '');
    });
    if (/localhost|127\.0\.0\.1/.test(location.host)) h += '<div class="err">いま手元のサーバーで開いています。タグには公開のURL（https://konohaacademy.github.io/nazo/）で開いたときのURLを書いてください。</div>';
    h += '<details style="margin-top:10px"><summary>タグの買い方・書き込み方</summary><ul>' +
      '<li>買うもの：<b>NTAG213</b>（または NTAG215）のシール型NFCタグ。10枚で数百円ほど。</li>' +
      '<li>⚠ <b>冷蔵庫など金属の面にじかに貼ると読めません。</b>「金属対応（オンメタル）」のタグを選ぶか、厚紙を1枚はさんで貼ってください。</li>' +
      '<li>書き込み：スマホに無料アプリ「<b>NFC Tools</b>」を入れる →「書く」→「レコードを追加」→「URL / URI」→ 上のURLを貼る →「書く」→ タグにかざす。iPhone でも Android でもできます。</li>' +
      (hasNdef() ? '<li>この Android なら、上の「このスマホでタグに書く」でも書けます。</li>' : '') +
      '<li>iPhone は XS 以降なら、アプリを開かなくてもタグにかざすだけで通知が出ます。</li></ul></details>';
    h += '<details style="margin-top:6px"><summary>iPhone・iPad で遊ぶときの注意</summary><ul>' +
      '<li><b>Safari のまま遊ぶのがおすすめ</b>です。タグで開くページも Safari なので、記録がつながってそのまま進みます。</li>' +
      '<li>ホーム画面に追加したアイコンから遊ぶと、タグで開いたページには捜査コードが出ます（その数を入れれば進みます）。</li>' +
      '<li>LINE の中のブラウザで開くと記録が別になります。Safari で開いてください。</li>' +
      '<li>NFCが無い iPad は、捜査コードで遊べます。</li></ul></details></div>';

    h += '<div class="panel"><h3>④ 印刷する紙</h3><p class="small">場所ごとのカード（捜査コード・謎の紙・怪盗のメモ）と、最初に手わたす予告状。A4で3枚。</p>' +
      '<button class="btn" data-act="print">📄 印刷する紙を見る</button></div>';

    var v = vars();
    h += '<div class="panel"><h3>⑤ 答え（子どもに見せないで）</h3><table>' +
      '<tr><td>暗号その1</td><td>' + esc(v.a1) + '（' + esc(v.place1) + '・' + esc(KIND_INFO[cardKinds().p1][0]) + '）</td></tr>' +
      '<tr><td>暗号その2</td><td>' + esc(v.a2) + '（' + esc(v.place2) + '・' + esc(KIND_INFO[cardKinds().p2][0]) + '）</td></tr>' +
      (hasStep('safe') ? '<tr><td>金庫</td><td>' + esc(v.code) + '（' + v.d1 + '・' + v.d2 + '・' + v.key + '×2）</td></tr>' : '') +
      gateRowsHtml() +
      STEPS.filter(function (x) { return x.st.type === 'pad'; }).map(function (x) { return '<tr><td>' + esc(NL.plainText(x.st.title)) + '</td><td>宇宙文字で「' + esc(x.st.word) + '」（ヒント3でボタンが光ります）</td></tr>'; }).join('') +
      '</table></div>';

    var shareSu = JSON.parse(JSON.stringify(setup)), dropped = false;
    Object.keys(shareSu.cards || {}).forEach(function (k) { if (/^data:/.test(shareSu.cards[k].img || '')) { shareSu.cards[k].img = ''; dropped = true; } });
    var share = baseUrl() + '#setup=' + b64(JSON.stringify({ story: kase.story, setup: shareSu }));
    h += '<div class="panel"><h3>⑥ ほかの端末へ準備を写す</h3><p class="small">準備をしたのが子どもの端末でないときは、このURLを子どもの端末で開いてください（LINE で送るなら、受け取ったあと Safari / Chrome で開く）。</p>' +
      (dropped ? '<div class="warn">この端末の写真で作った暗号カードはURLに入りません。写した先の端末で、もう一度写真を選んでください（ドライブのリンクなら入ります）。</div>' : '') +
      '<div class="mono">' + esc(share) + '</div><button class="btn sm" data-copy="' + esc(share) + '">コピー</button></div>';

    h += '<div class="panel"><h3>⑦ 進み具合（探偵ごと）</h3>';
    var rows = caseStates(kase);
    if (rows.length) {
      h += '<table>' + rows.map(function (r) {
        var stt = !r.st ? '未着手' : r.st.stepId === 'done' ? '解決ずみ' : '捜査中：' + esc(chapterOf(kase, r.st) || 'プロローグ');
        return '<tr><td>' + agentLabel(r.agent) + (ME && r.agent.id === ME.id ? '<br><span class="small">ログイン中</span>' : '') + '</td><td>' + stt + '</td><td>' +
          (r.st ? '<button class="btn sm red" data-act="reset-agent" data-agent="' + r.agent.id + '">記録を消す</button>' : '') + '</td></tr>';
      }).join('') + '</table>';
    } else h += '<p class="small">まだ探偵が登録されていません（子どもがタイトルの「あたらしい探偵」で登録します）。</p>';
    if (state) {
      var c = cur();
      h += '<p style="margin-top:12px">ためし用（ログイン中の ' + agentLabel(ME) + ' の記録）　いま：' + (state.stepId === 'done' ? '事件解決ずみ' : esc(Plain(c ? c.ch.title : '')) + '（' + esc(state.stepId) + '）') + '</p>' +
        '<label>ここから遊ぶ（ためし用）</label><select id="jump">' + STEPS.map(function (s) {
          return '<option value="' + s.st.id + '"' + (s.st.id === state.stepId ? ' selected' : '') + '>' + esc(Plain(s.ch.title)) + ' / ' + esc(s.st.id) + '</option>';
        }).join('') + '</select><button class="btn sm" data-act="jump">ここへ移る</button>';
    }
    h += '<button class="btn red" data-act="reset">この事件の全員の記録を消す</button>' +
      '<button class="btn red" data-act="newcase">捜査コードを作り直す（タグの書き直し・紙の印刷し直しが必要）</button>' +
      '<button class="btn red" data-act="case-del">この事件を事件ファイルから消す</button></div>';

    h += agentsPanelHtml();
    h += '<div class="panel"><h3>⑨ 合言葉</h3><button class="btn sm" data-act="pin-change">準備画面の合言葉を変える</button></div>';
    h += '<button class="btn" data-act="title">おわる（事件ファイルへ）</button></div>';
    $app.innerHTML = frame('', h, { noDock: true });
  }
  // 暗号の種類（準備画面）：その1・その2 ごとに、元の暗号か 暗号カードか 自分の画像かを選ぶ
  var KIND_INFO = {
    letter: ['文字ひろい（画面）', '言葉の「何文字目」をひろって並べる。D-PHONE の画面に出ます。'],
    clock: ['時計の暗号', '計算の紙と、ひらがなの時計の文字ばん。'],
    shift: ['3つの関門（画面）', '天びん → ほんものの使い → ずらし文字 の3だん。この物語では変えられません。'],
    mirror: ['鏡文字カード', '★1 左右反対に書いた文字を読む。'],
    tanuki: ['たぬきカード', '★1 「た」（または「こ」）をぬいて読む。'],
    gojuon: ['あいうえお表カード', '★2 マークと数で、表から字をさがす。'],
    arrow: ['やじるし迷路カード', '★1 スタートから矢印のとおりに進んで読む。'],
    alien: ['宇宙文字カード', '★2 キラリ星の文字を、ほんやく表で読む。'],
    overlay: ['3つのテスト（画面）', '光のぼうの式 → かがみの時計 → かさねるシート の3だん。この物語では変えられません。'],
    anaume: ['あなうめカード', '★3 □に入る同じ字（3つのことばで1字）を見つけて、①から読む。'],
    wordsearch: ['かくれんぼ文字カード', '★3 表にかくれた動物・食べ物を消して、のこった字を読む。'],
    shiritori: ['しりとりカード', '★3 ばらばらのことばをしりとりで1本につなぎ、○の字を順に読む。'],
    sakanobori: ['さかのぼり迷路カード', '★4 スタートの書いていない矢印迷路。ゴールから逆にたどる。'],
    image: ['自分の画像', 'Googleドライブの画像か、この端末の写真。作ったカードを使えます。']
  };
  function kindOk(d, id, kind) {
    var y = d.places[PUZ_PLACE[id]].yomi;
    if (!NL.isHiraOnly(y || '')) return '';
    if (kind === 'letter') { var lp = NL.letterPuzzle(y, d.seed); return lp.ok ? '' : '「' + (lp.missing || []).join('・') + '」の言葉がない'; }
    if (kind === 'clock') return NL.clockPuzzle(y, d.seed).ok ? '' : '作れない';
    if (kind === 'shift') { var chp = NL.chainPuzzle(y, d.seed, [d.places[1].yomi]); return chp.ok ? '' : chp.reason; }
    if (kind === 'overlay') { var lbp = NL.labPuzzle(y, d.seed, [d.places[1].yomi]); return lbp.ok ? '' : lbp.reason; }
    if (kind === 'image') return '';
    var cp = NL.cardPuzzle(kind, y, (d.seed >>> 0) + PUZ_PLACE[id]);
    return cp.ok ? '' : cp.reason;
  }
  // 準備画面の 答え：画面だけで とく 暗号（3つの関門・からくり箱・からくり錠）
  function gateRowsHtml() {
    var P = puz(), h = '';
    STEPS.forEach(function (x) {
      var st = x.st, a = '';
      if (st.type === 'puzzle' && st.gen === 'balance' && P.ch && P.ch.ok) a = '■＝●×' + P.ch.n + '（三の関門で ' + P.ch.n + '字 もどす）';
      else if (st.type === 'puzzle' && st.gen === 'liar' && P.ch && P.ch.ok) a = NL.MESSENGERS[P.ch.liar.real].name + '（にせものの巻物は「' + P.ch.decoys.join('」「') + '」）';
      else if (st.type === 'puzzle' && st.gen === 'magic' && P.mg.ok) a = '★＝' + P.mg.answer;
      else if (st.type === 'order' && P.lk.ok) a = '左から ' + vars().lkAns;
      else if (st.type === 'puzzle' && st.gen === 'match' && P.lab && P.lab.ok) a = NL.eqText(P.lab.match) + ' → ' + NL.eqText(P.lab.match.sol.eq) + '（＝の右の ' + P.lab.N + ' がパネルの番号）';
      else if (st.type === 'puzzle' && st.gen === 'mclock' && P.lab && P.lab.ok) a = P.lab.h + '時（見たままだと ' + P.lab.mclock.shown + '時に見える）';
      else if (st.type === 'puzzle' && st.gen === 'overlay' && P.lab && P.lab.ok) a = P.lab.h + '時のシート＋No.' + P.lab.N + 'のパネル（にせもの：' + P.lab.panels.filter(function (x) { return !x.real; }).map(function (x) { return x.top + '時＋No.' + x.num + '＝' + x.word; }).join('・') + '）';
      else if (st.type === 'puzzle' && st.gen === 'robot' && P.rb.ok) a = String(P.rb.answer);
      else if (st.type === 'jugs' && P.jug.ok) a = jugText(P.jug.sol);
      if (a) h += '<tr><td>' + esc(NL.plainText(st.title)) + '</td><td>' + esc(a) + '</td></tr>';
    });
    return h;
  }
  function cardPanelHtml(d) {
    var ck = cardKinds(d);
    var h = '<div class="panel"><h3>🔐 暗号の種類</h3><p class="small">暗号の答えは、どれも次の隠し場所の読みになります。暗号カードは隠し場所に合わせて自動で作ります（印刷する紙にも載ります）。</p>';
    ['p1', 'p2'].forEach(function (id) {
      var i = PUZ_PLACE[id], pl = d.places[i];
      var kinds = (SC.slotKinds && SC.slotKinds[id]) || (id === 'p1' ? ['letter'] : ['clock']).concat(NL.CARD_KINDS, ['image']);
      h += '<h3 style="color:var(--cyan);margin-top:12px">暗号その' + (i + 1) + '（答え＝場所' + (i + 1) + '「' + esc(pl.name) + '」の読み「' + esc(NL.normKana(pl.yomi)) + '」）</h3><div class="cardpick">';
      kinds.forEach(function (k) {
        var why = kindOk(d, id, k), on = ck[id] === k;
        h += '<label class="' + (on ? 'on' : '') + (why && !on ? ' off' : '') + '"><input type="radio" name="ck-' + id + '" data-pf="ckind" data-c="' + id + '" value="' + k + '"' + (on ? ' checked' : '') + (why && !on ? ' disabled' : '') + '>' +
          '<span><b>' + esc(KIND_INFO[k][0]) + '</b><span class="small">' + esc(why ? '× ' + why : KIND_INFO[k][1]) + '</span></span></label>';
      });
      h += '</div>';
      var cc = (d.cards || {})[id] || {};
      if (ck[id] === 'image') {
        h += '<label>Googleドライブの共有リンク、または画像のURL</label><input type="text" data-pf="cimg" data-c="' + id + '" value="' + esc(/^data:/.test(cc.img || '') ? '' : (cc.img || '')) + '" placeholder="https://drive.google.com/file/d/…/view">' +
          '<p class="small">ドライブで画像を右クリック（スマホは「︙」）→「共有」→ 一般的なアクセスを「<b>リンクを知っている全員</b>」にして、「リンクをコピー」したものを貼ってください。答えが「' + esc(NL.normKana(pl.yomi)) + '」になるカードにしてください。</p>' +
          '<label>または、この端末の写真・画像を使う</label><input type="file" accept="image/*" data-pf="cfile" data-c="' + id + '">' +
          '<p class="small">写真はこの端末の中だけに入ります（「ほかの端末へ準備を写す」URLには入りません。ほかの端末でも使うならドライブで）。</p>' +
          '<label>博士のヒント1（空なら「カードを よーく 見るのじゃ」）</label><input type="text" data-pf="chint1" data-c="' + id + '" value="' + esc(cc.hint1 || '') + '">' +
          '<label>博士のヒント2（空なら「おうちの人に 聞いてみるのじゃ」）。ヒント3は答えです</label><input type="text" data-pf="chint2" data-c="' + id + '" value="' + esc(cc.hint2 || '') + '">';
        if (cc.img) h += '<div style="max-width:420px;margin:10px 0">' + NazoCards.imageHtml(cc.img) + '</div>';
      } else if (isGenCard(ck[id]) && !kindOk(d, id, ck[id])) {
        h += '<div style="max-width:420px;margin:8px 0">' + NazoCards.svg(NL.cardPuzzle(ck[id], pl.yomi, (d.seed >>> 0) + i, padWord()), i + 1, cardOpts()) + '</div>' +
          '<p class="small">' + (id === 'p1' ? '最初の暗号として D-PHONE の画面に出ます（印刷した紙を予告状といっしょに渡しても遊べます）。' :
            '場所1で手に入る証拠が「カギの写真と暗号カード」になります。印刷する紙の現場Aのカードにも載ります。') + '</p>';
      }
    });
    return h + '</div>';
  }
  // 写真を縮めて data URL にする（長い辺1600px・JPEG）。localStorage に入れるので大きくしない
  function shrinkImage(file, done) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        done(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { done(''); };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  // この端末の探偵（準備画面）：子どもの合言葉を忘れたとき消す・探偵ごと消す
  function agentsPanelHtml() {
    var h = '<div class="panel"><h3>⑧ この端末の探偵</h3><p class="small">同じ端末で遊ぶ子どもは、タイトルで自分の名前を押して入ります（絵の合言葉をつけた子は🔒）。記録は事件×探偵ごとに別々です。</p>';
    if (!AGENTS.length) return h + '<p class="small">まだいません。</p></div>';
    h += '<table>' + AGENTS.map(function (a) {
      var done = CASES.filter(function (c) { var st = lsGet(stateKey(c.id, a.id)); return st && st.seed === c.setup.seed && st.stepId === 'done'; }).length;
      return '<tr><td>' + agentLabel(a) + (a.pass ? ' 🔒' : '') + '<br><span class="small">解決 ' + done + ' 件</span></td><td>' +
        (a.pass ? '<button class="btn sm" data-act="agent-unpass" data-agent="' + a.id + '">合言葉を消す</button>' : '') +
        '<button class="btn sm red" data-act="agent-del" data-agent="' + a.id + '">消す</button></td></tr>';
    }).join('') + '</table></div>';
    return h;
  }
  // 事件ファイル（準備画面のいちばん上）：どの事件を準備するか選ぶ・新しく作る
  function caseFileHtml() {
    var h = '<div class="panel"><h3>📁 事件ファイル</h3><p class="small">事件ごとに、隠し場所・捜査コード・進み具合が別々に残ります。子どもはタイトルの一覧から選んで遊びます。</p><table>';
    CASES.forEach(function (c, i) {
      var sts = caseStates(c).filter(function (r) { return r.st; });
      var nDone = sts.filter(function (r) { return r.st.stepId === 'done'; }).length;
      var stat = !c.setup.ready ? '準備まだ' : !sts.length ? '未着手' : '解決 ' + nDone + '人・捜査中 ' + (sts.length - nDone) + '人';
      var on = kase && c.id === kase.id;
      h += '<tr' + (on ? ' style="background:rgba(63,240,255,.08)"' : '') + '><td>CASE ' + ('0' + (i + 1)).slice(-2) + '</td><td>' + esc(caseName(c)) +
        '<br><span class="small">' + esc(NL.plainText((STORIES[c.story] || {}).title || c.story)) + '・' + stat + '</span></td><td>' +
        (on ? '<span class="ok">準備中</span>' : '<button class="btn sm" data-act="pcase" data-case="' + c.id + '">準備する</button>') + '</td></tr>';
    });
    h += '</table><details style="margin-top:10px"><summary>＋ 新しい事件を作る</summary>' +
      '<label>物語</label><select id="nstory">' + REG.filter(function (r) { return STORIES[r.id]; }).map(function (r) {
        var lv = STORIES[r.id].level || 3;
        return '<option value="' + esc(r.id) + '">' + esc(NL.plainText(STORIES[r.id].title)) + '（' + esc(NL.plainText(STORIES[r.id].subtitle)) + '）むずかしさ' + new Array(lv + 1).join('★') + '・' + (STORIES[r.id].minutes || 30) + '分</option>';
      }).join('') + '</select>' +
      '<label>事件の名前（例：消えたダイヤ『ブルームーン』2）</label><input type="text" id="ntitle">' +
      '<p class="small">同じ物語でも、隠し場所と捜査コードが新しくなります（前の事件のタグや紙はそのまま前の事件のもの）。</p>' +
      '<button class="btn sm" data-act="case-new">作って準備する</button></details></div>';
    return h;
  }
  // 準備の点検と、できる暗号の下見（打ち終えるたびにここだけ書き換える）
  function checkHtml(d) {
    var errs = NL.checkSetup(d);
    var dirty = JSON.stringify(d) !== JSON.stringify(setup);
    var h = '';
    if (errs.length) h += '<div class="panel">' + errs.map(function (e) { return '<div class="err">⚠ ' + esc(e) + '</div>'; }).join('') + '</div>';
    else {
      var ck = cardKinds(d);
      var line = function (id) {
        var i = PUZ_PLACE[id], y = d.places[i].yomi, k = ck[id];
        if (k === 'letter') { var lp = NL.letterPuzzle(y, d.seed); return lp.items.map(function (it) { return '「' + esc(it.word) + '」の' + it.pos + '文字目'; }).join('、') + ' → <b>' + esc(lp.answer) + '</b>'; }
        if (k === 'clock') { var cp = NL.clockPuzzle(y, d.seed); return cp.seq.map(function (s) { return esc(s.expr) + '=' + s.hour + '時「' + esc(s.kana) + '」'; }).join('、') + ' → <b>' + esc(cp.answer) + '</b>'; }
        if (k === 'shift' || k === 'overlay') return esc(KIND_INFO[k][0]) + ' → <b>' + esc(NL.normKana(y)) + '</b>';
        if (k === 'image') return '自分の画像 → <b>' + esc(NL.normKana(y)) + '</b>（画像の答えがこれになっているか確かめてください）';
        var c = NL.cardPuzzle(k, y, (d.seed >>> 0) + i);
        return esc(KIND_INFO[k][0]) + (c.kind === 'tanuki' ? '（' + esc(c.text) + ' から「' + esc(c.ch) + '」をぬく）' : '') + ' → <b>' + esc(c.answer) + '</b>';
      };
      h += '<div class="panel"><h3>できる暗号（下見）</h3><p class="small">暗号その1：' + line('p1') + '</p>' +
        '<p class="small">暗号その2：' + line('p2') + '</p>' +
        (hasStep('safe') ? '<p class="small">金庫：' + esc(NL.safeCode(d).code) + '</p>' : '') + '</div>';
    }
    h += dirty ? '<p class="small" style="color:var(--gold)">まだ保存していません。保存するまで、下のURL・印刷・答えは前の準備のままです。</p>' : '<p class="ok">✓ 保存済み</p>';
    return h;
  }
  function paintCheck() {
    var el = document.getElementById('pcheck'); if (el && V.draft) el.innerHTML = checkHtml(V.draft);
  }
  function chk(k, on, label, note) {
    return '<label class="chk"><input type="checkbox" data-mode="' + k + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '<br><span class="small">' + esc(note) + '</span></span></label>';
  }
  function renderPinSet() {
    $app.innerHTML = frame('', '<div class="parent"><h2>おうちの方へ</h2><p>はじめに、準備画面の合言葉（数字4けた）を決めてください。子どもが答えを見ないようにするためのものです。</p>' +
      '<input type="password" inputmode="numeric" maxlength="8" id="pin" class="inp" autocomplete="off" placeholder="4けた">' +
      '<button class="btn" data-act="pin-set">決める</button><button class="btn ghost" data-act="title">もどる</button></div>', { noDock: true });
  }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function copy(text) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('コピーしました'); } catch (e) { toast('コピーできませんでした。長押しで選んでください'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('コピーしました'); }, fallback);
    else fallback();
  }
  function writeTag(i) {
    if (!hasNdef()) return;
    var u = tagUrl(i);
    toast('タグに スマホを くっつけてください…', 5000);
    new window.NDEFReader().write({ records: [{ recordType: 'url', data: u }] }).then(function () {
      sfx('ok'); toast('書き込みました：場所' + (i + 1));
    }).catch(function (e) { toast('書き込めませんでした：' + esc(e && e.message || e), 4000); });
  }

  // ---------- 印刷 ----------
  function renderPrint() {
    if (!parentOk() || !kase) { route = 'parent'; renderParent(); return; }
    var v = vars();
    var m = setup.modes;
    var h = '<div class="noprint"><button class="btn gold" data-act="do-print">🖨 印刷する</button><button class="btn ghost" data-act="parent">もどる</button>' +
      '<p class="small">紙は A4 で3〜4枚です。現場Aのカードを場所1、現場Bのカードを場所2 のタグのそばに隠し、予告状（と暗号カードその1）は最初に子どもへ手わたします。</p></div>';
    [0, 1].forEach(function (i) {
      h += '<div class="print-page"><div class="ts">TOP SECRET</div><div style="margin-top:8px;color:#555">' + esc(caseName(kase)) + '</div><div class="pl">' + T(((SC.print && SC.print.placeWord) || '[現場|げんば]') + (i ? 'B' : 'A') + '：') + esc(setup.places[i].name) + '</div>';
      if (m.code) h += '<div>' + T('[捜査|そうさ]コード') + '</div><div class="code">' + NL.sceneCode(setup.seed, i) + '</div>';
      if (i === 0 && isCardKind(cardKinds().p2)) h += '<div class="print-card">' + T((SC.print && SC.print.cardWord) || '[怪盗|かいとう]の 暗号カード') + cardHtml(1) + '</div>';
      else if (i === 1 && SC.print && SC.print.placeB) h += '<div style="text-align:center;margin:18px 0">' + art(SC.print.placeB, 200) + '</div>';
      else h += '<div style="max-width:420px">' + (i === 0 ? paperHtml(400) : memoHtml(420)) + '</div>';
      h += '<div class="parent-note">おうちの方へ：このカードを「' + esc(setup.places[i].name) + '」に隠し、そばにタグ（場所' + (i + 1) + 'のURL）を貼ってください。' +
        (m.code ? '捜査コードは D-PHONE の「捜査コードを入れる」で使います。' : '') + '</div></div>';
    });
    if (isCardKind(cardKinds().p1)) {
      h += '<div class="print-page"><div class="ts">CODE CARD</div><div style="margin-top:8px;color:#555">' + esc(caseName(kase)) + '</div><div class="print-card">' + cardHtml(0) + '</div>' +
        '<div class="parent-note">おうちの方へ：暗号その1のカードです。D-PHONE の画面にも出るので、印刷しなくても遊べます。予告状といっしょに手わたすと雰囲気が出ます。</div></div>';
    }
    var pr = SC.print || { ts: 'WARNING', art: 'letter', sign: '[怪盗|かいとう]クロウ',
      lines: ['名[探偵|たんてい]へ', 'ダイヤ『ブルームーン』は いただいた。', 'きみの 家の どこかに かくしてある。', '[探偵|たんてい]ケータイ「D-PHONE」を ひらき、わたしの 暗号を といてみたまえ。'] };
    h += '<div class="print-page" style="text-align:center"><div class="ts">' + esc(pr.ts) + '</div><div style="margin:18px auto;max-width:360px;display:flex;justify-content:center">' + (pr.art === 'letter' ? letterHtml(360) : art(pr.art, 240)) + '</div>' +
      '<div style="font-size:22px;line-height:2;text-align:left;max-width:520px;margin:0 auto">' +
      pr.lines.map(function (l) { return '<div>' + T(l) + '</div>'; }).join('') +
      '<div style="text-align:right">―― ' + T(pr.sign) + '</div></div><div class="parent-note" style="clear:both">D-PHONE：' + esc(baseUrl()) + '</div></div>';
    $app.innerHTML = frame('', h, { noDock: true });
    void v;
  }

  // ---------- 押したとき ----------
  $app.addEventListener('click', onClick);
  $layer.addEventListener('click', onClick);
  function onClick(e) {
    var t = e.target;
    var el;
    if ((el = t.closest('[data-k]'))) { kanaKey(el.getAttribute('data-k')); return; }
    if ((el = t.closest('[data-kf]'))) { kanaKey(null, el.getAttribute('data-kf')); return; }
    if ((el = t.closest('[data-pad]'))) { padKey(+el.getAttribute('data-pad')); return; }
    if ((el = t.closest('[data-ps]'))) { passKey(+el.getAttribute('data-ps')); return; }
    if ((el = t.closest('[data-psf]'))) { passKey(null, el.getAttribute('data-psf')); return; }
    if ((el = t.closest('[data-pn]'))) { puzNumKey(el.getAttribute('data-pn')); return; }
    if ((el = t.closest('[data-pnf]'))) { puzNumKey(null, el.getAttribute('data-pnf')); return; }
    if ((el = t.closest('[data-choice]'))) { pickChoice(+el.getAttribute('data-choice')); return; }
    if ((el = t.closest('[data-lk]'))) { orderKey(+el.getAttribute('data-lk')); return; }
    if ((el = t.closest('[data-ms]'))) { msTap(+el.getAttribute('data-ms')); return; }
    if ((el = t.closest('[data-ovt]'))) { V.ovT = +el.getAttribute('data-ovt'); V.ovOn = false; sfx('key'); render(); return; }
    if ((el = t.closest('[data-ovp]'))) { V.ovP = +el.getAttribute('data-ovp'); V.ovOn = false; sfx('key'); render(); return; }
    if ((el = t.closest('[data-jug]'))) { jugOp(el.getAttribute('data-jug')); return; }
    if ((el = t.closest('[data-n]'))) { numKey(el.getAttribute('data-n')); return; }
    if ((el = t.closest('[data-nf]'))) { numKey(null, el.getAttribute('data-nf')); return; }
    if ((el = t.closest('[data-dial]'))) { turnDial(+el.getAttribute('data-dial'), +el.getAttribute('data-d')); return; }
    if ((el = t.closest('[data-ev]'))) { showEvidence(el.getAttribute('data-ev')); return; }
    if ((el = t.closest('[data-say]'))) { var ev = SC.evidence[el.getAttribute('data-say')]; say(ev.name + '。' + ev.desc, 'sys'); return; }
    if ((el = t.closest('[data-copy]'))) { copy(el.getAttribute('data-copy')); return; }
    if ((el = t.closest('[data-write]'))) { writeTag(+el.getAttribute('data-write')); return; }
    el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    // 小窓の中を押しても閉じない（閉じるのは外側か「とじる」）
    if (act === 'close-layer' && t.closest('[data-stop]') && !t.closest('.x')) return;
    if (act === 'get-close' && !t.closest('.btn') && t.closest('.sheet')) return;
    act_(act, el);
  }
  function act_(act, el) {
    switch (act) {
      case 'title': closeLayer(); V = {}; RV = null; route = 'title'; if (location.hash) history.replaceState(null, '', location.pathname); render(); window.scrollTo(0, 0); break;
      case 'case-start':
        if (!ME) { route = 'title'; render(); return; }
        selectCase(el.getAttribute('data-case')); audio(); newGame(ME.name); route = 'play'; V = {}; render(); window.scrollTo(0, 0); break;
      case 'agent-pick': {
        var ag = agentById(el.getAttribute('data-agent'));
        if (!ag) return;
        if (ag.pass) { V = { agent: ag.id, pass: [] }; route = 'pass'; render(); window.scrollTo(0, 0); }
        else { sfx('ok'); login(ag); V = {}; route = 'title'; render(); window.scrollTo(0, 0); }
        break;
      }
      case 'agent-new': V = { name: '', pass: [] }; route = 'name'; render(); window.scrollTo(0, 0); break;
      case 'agent-icon': {
        V.name = (document.getElementById('nm') || {}).value || V.name;
        V.icon = el.getAttribute('data-icon');
        Array.prototype.forEach.call(document.querySelectorAll('.avbtn'), function (b) { b.classList.toggle('on', b === el); });
        sfx('key'); break;
      }
      case 'logout': login(null); V = {}; route = 'title'; render(); window.scrollTo(0, 0); break;
      case 'case-cont': audio(); selectCase(el.getAttribute('data-case')); route = 'play'; V = {}; RV = null; render(); window.scrollTo(0, 0); break;
      case 'case-restart':
        selectCase(el.getAttribute('data-case'));
        if (confirm('はじめから やりなおしますか？（いまの すすみぐあいは 消えます）')) { restartCase(); }
        break;
      case 'restart-cur':
        if (confirm('はじめから やりなおしますか？（いまの すすみぐあいは 消えます）')) { closeLayer(); restartCase(); }
        break;
      case 'back': goBack(); break;
      case 'rv-prev': goBack(); break;
      case 'rv-next': RV = Math.min(RV + 1, curIndex() - 1); sfx('key'); render(); window.scrollTo(0, 0); break;
      case 'rv-exit': RV = null; sfx('key'); render(); window.scrollTo(0, 0); break;
      case 'lk-go': orderGo(); break;
      case 'ms-reset': V.ms = null; V.wrongMsg = ''; sfx('key'); render(); break;
      case 'ov-go': {
        if (V.ovT == null || V.ovP == null) { toast(T('シートと パネルを 1まいずつ えらんでね')); return; }
        V.ovOn = !V.ovOn; sfx(V.ovOn ? 'lock' : 'key');
        var vw = document.querySelector('.ovview'), bt = el;
        if (vw) { vw.classList.toggle('on', V.ovOn); bt.innerHTML = V.ovOn ? '↕ ' + T('はなす') : '⬇ ' + T('かさねる'); }
        break;
      }
      case 'jug-reset': V.jug = [0, 0]; V.jugN = 0; sfx('key'); render(); break;
      case 'lk-bs': if (V.ord) V.ord.pop(); sfx('key'); render(); break;
      case 'lk-clr': V.ord = []; sfx('key'); render(); break;
      case 'case-cert': selectCase(el.getAttribute('data-case')); route = 'cert'; render(); window.scrollTo(0, 0); break;
      case 'case-replay':
        selectCase(el.getAttribute('data-case'));
        if (confirm('はじめから 遊びますか？（この 事件の にんていしょうは 消えます）')) restartCase();
        break;
      case 'name-ok': {
        var nm = (document.getElementById('nm').value || '').trim().slice(0, 12);
        if (!nm) { toast('名前を 入れてね'); return; }
        if (agentByName(nm)) { sfx('ng'); toast(NL.rubyHtml('その 名前の [探偵|たんてい]は もう いるよ。上の 一覧から えらんでね'), 3500); return; }
        if (V.pass && V.pass.length && V.pass.length < 3) { sfx('ng'); toast('合言葉の えは 3つ おしてね（つけないなら「けす」）', 3500); return; }
        sfx('ok'); login(addAgent(nm, V.icon, (V.pass || []).join(',')));
        V = {}; route = 'title'; render(); window.scrollTo(0, 0); break;
      }
      case 'titlecard-ok': state.titles[cur().ch.id] = true; save(); render(); break;
      case 'dlg-next': dlgNext(); break;
      case 'answer': submitAnswer(); break;
      case 'code-open': V.codeMode = true; V.code = ''; render(); break;
      case 'code-close': V.codeMode = false; render(); break;
      case 'code-ok': submitCode(); break;
      case 'tap-search': tapSearch(); break;
      case 'nfc-start': startNfc(); break;
      case 'nfc-stop': stopNfc(); render(); break;
      case 'safe-open': openSafe(); break;
      case 'pad-go': padGo(); break;
      case 'pad-bs': if (V.seq) V.seq.pop(); sfx('key'); render(); break;
      case 'pad-clr': V.seq = []; sfx('key'); render(); break;
      case 'get-close': { closeLayer(); var f = V.afterGet; V.afterGet = null; if (f) f(); break; }
      case 'to-cert': closeLayer(); route = 'cert'; render(); break;
      case 'print-cert': window.print(); break;
      case 'evlist': showInventory(); break;
      case 'inv': showInventory(); break;
      case 'hint': showHint(); break;
      case 'hint-more': moreHint(); break;
      case 'hint-say': { var st = cur().st; var n = state.hints[st.id] || 0; if (n) say(st.hints[n - 1], (SC && SC.hintWho) || 'hakase'); break; }
      case 'speak': speakNow(); break;
      case 'menu': showMenu(); break;
      case 'close-layer': closeLayer(); break;
      case 'tog-sound': pref.sound = !pref.sound; lsSet(K_PREF, pref); showMenu(); break;
      case 'tog-speak': pref.autoSpeak = !pref.autoSpeak; lsSet(K_PREF, pref); showMenu(); break;
      case 'parent': closeLayer(); route = 'parent'; V = {}; history.replaceState(null, '', '#parent'); render(); break;
      case 'tag-close': tagView = null; route = state && state.stepId !== 'done' ? 'play' : 'title'; V = {}; render(); break;
      case 'pin-set': {
        var p = (document.getElementById('pin').value || '').trim();
        if (!/^\d{4,8}$/.test(p)) { toast('数字4けたで 入れてください'); return; }
        PIN = p; lsSet(K_PIN, PIN); ssSet(K_PARENT, '1'); render(); break;
      }
      case 'pin-in': {
        var q = (document.getElementById('pin').value || '').trim();
        if (q === PIN) { ssSet(K_PARENT, '1'); render(); } else { sfx('ng'); toast('合言葉が ちがいます'); }
        break;
      }
      case 'pin-change': {
        var np = prompt('新しい合言葉（数字4〜8けた）');
        if (np && /^\d{4,8}$/.test(np)) { PIN = np; lsSet(K_PIN, PIN); toast('変えました'); }
        break;
      }
      case 'key-dice': V.draft.keyNo = 10 + Math.floor(Math.random() * 40); render(); break;
      case 'setup-save': {
        var errs = NL.checkSetup(V.draft);
        if (errs.length) { sfx('ng'); toast('直すところが あります（赤い字）'); paintCheck(); return; }
        var changed = JSON.stringify(V.draft.places) !== JSON.stringify(setup.places) || V.draft.keyNo !== setup.keyNo || JSON.stringify(cardKinds(V.draft)) !== JSON.stringify(cardKinds(setup));
        setup = JSON.parse(JSON.stringify(V.draft));
        setup.ready = true; V.draft.ready = true;
        saveSetup();
        toast('保存しました');
        if (changed && state && state.stepId !== STEPS[0].st.id) toast('遊んでいる途中で場所を変えました。話がつながらないときは「最初からやり直す」を押してください', 5000);
        render(); break;
      }
      case 'print': route = 'print'; history.replaceState(null, '', '#print'); render(); window.scrollTo(0, 0); break;
      case 'do-print': window.print(); break;
      case 'jump': {
        var id = document.getElementById('jump').value;
        var i = stepIndex(id);
        state.stepId = id; state.cleared = {}; state.ev = []; state.evNew = [];
        for (var k = 0; k < i; k++) {
          var s = STEPS[k].st;
          state.cleared[s.id] = true; state.titles[STEPS[k].ch.id] = true;
          (s.reward || []).forEach(function (r) { if (state.ev.indexOf(r) < 0) state.ev.push(r); });
        }
        save(); toast('移りました'); render(); break;
      }
      case 'reset':
        if (confirm('「' + caseName(kase) + '」の全員の記録を消して、最初からにしますか？')) { state = null; delCaseStates(kase.id); toast('消しました'); render(); }
        break;
      case 'reset-agent': {
        var ra = agentById(el.getAttribute('data-agent'));
        if (!ra || !confirm('「' + caseName(kase) + '」の ' + ra.name + ' の記録を消しますか？（認定証も消えます）')) return;
        lsDel(stateKey(kase.id, ra.id)); if (ME && ra.id === ME.id) state = null;
        toast('消しました'); render(); break;
      }
      case 'agent-unpass': {
        var ua = agentById(el.getAttribute('data-agent'));
        if (!ua || !confirm(ua.name + ' の合言葉を消しますか？（名前を押すだけで入れるようになります）')) return;
        ua.pass = ''; saveAgents(); toast('消しました'); render(); break;
      }
      case 'agent-del': {
        var da = agentById(el.getAttribute('data-agent'));
        if (!da || !confirm(da.name + ' を消しますか？ この探偵の記録と認定証は全部消えます。')) return;
        CASES.forEach(function (c) { lsDel(stateKey(c.id, da.id)); });
        AGENTS = AGENTS.filter(function (a) { return a.id !== da.id; }); saveAgents();
        if (ME && ME.id === da.id) login(null);
        toast('消しました'); render(); break;
      }
      case 'newcase':
        if (confirm('捜査コードを作り直しますか？ タグのURLが変わるので、タグを書き直して紙も印刷し直す必要があります。この事件の記録も消えます。')) {
          delCaseStates(kase.id); setup.seed = newSeed(); saveSetup(); V.draft = null; state = null; toast('作り直しました'); render();
        }
        break;
      case 'pcase': selectCase(el.getAttribute('data-case')); V = {}; render(); window.scrollTo(0, 0); break;
      case 'case-new': {
        var story = document.getElementById('nstory').value;
        if (!STORIES[story]) return;
        var su = defaultSetup(story);
        su.title = (document.getElementById('ntitle').value || '').trim();
        var nc = addCase(story, su);
        selectCase(nc.id); V = {}; toast('作りました。隠し場所を決めて「保存」してください', 3500); render(); window.scrollTo(0, 0); break;
      }
      case 'case-del': {
        if (!confirm('「' + caseName(kase) + '」を事件ファイルから消しますか？ 記録と認定証も消えます。この事件のタグは使えなくなります。')) return;
        var gone = kase.id;
        CASES = CASES.filter(function (c) { return c.id !== gone; });
        saveCases(); delCaseStates(gone);
        selectCase(CASES[0] && CASES[0].id); V = {}; toast('消しました'); render(); window.scrollTo(0, 0); break;
      }
      default: break;
    }
  }
  // 準備画面の入力（打ち終えたとき＝change で描き直す。打っている最中は描き直さない）
  // ⚠ 打っている欄は描き直さない。描き直すと、打ち終えてすぐ「保存」を押したときに、
  //   ボタンが作り直されて押したことが消える。書き換えるのは点検の欄（#pcheck）だけ。
  function onParentInput(e) {
    if (route !== 'parent' || !V.draft) return;
    var t = e.target;
    var f = t.getAttribute('data-pf'), i = +t.getAttribute('data-i');
    if (f === 'title') {
      V.draft.title = t.value.trim();
      paintCheck();
    } else if (f === 'name' || f === 'yomi' || f === 'detail') {
      V.draft.places[i][f] = f === 'yomi' ? NL.normKana(t.value) : t.value.trim();
      paintCheck();
    } else if (f === 'keyNo') {
      V.draft.keyNo = parseInt(t.value, 10) || 0;
      paintCheck();
    } else if (f === 'cimg' || f === 'chint1' || f === 'chint2') {
      var cid = t.getAttribute('data-c');
      V.draft.cards = V.draft.cards || {};
      V.draft.cards[cid] = V.draft.cards[cid] || { kind: 'image' };
      V.draft.cards[cid][f === 'cimg' ? 'img' : f.slice(1)] = t.value.trim();
      paintCheck();
    }
  }
  $app.addEventListener('input', onParentInput);
  $app.addEventListener('change', function (e) {
    if (route !== 'parent' || !V.draft) return;
    var t = e.target;
    var f = t.getAttribute('data-pf'), i = +t.getAttribute('data-i');
    if (f === 'ckind') {
      var cid = t.getAttribute('data-c');
      V.draft.cards = V.draft.cards || {};
      V.draft.cards[cid] = Object.assign({}, V.draft.cards[cid] || {}, { kind: t.value });
    } else if (f === 'cfile') {
      var fid = t.getAttribute('data-c'), file = t.files && t.files[0];
      if (!file) return;
      toast('写真を読みこんでいます…');
      shrinkImage(file, function (url) {
        if (!url) { toast('写真が読めませんでした'); return; }
        V.draft.cards = V.draft.cards || {};
        V.draft.cards[fid] = Object.assign({}, V.draft.cards[fid] || {}, { kind: 'image', img: url });
        var yy = window.scrollY; render(); window.scrollTo(0, yy);
      });
      return;
    } else if (f === 'cimg') {
      // 打ち終えたら下見を出す（描き直しは change のときだけ）
    } else if (f === 'preset') {
      if (t.value === '') return;
      var q = PRESETS[+t.value]; V.draft.places[i].name = q.name; V.draft.places[i].yomi = q.yomi;
    } else if (t.hasAttribute('data-mode')) {
      V.draft.modes[t.getAttribute('data-mode')] = t.checked;
      if (!V.draft.modes.tag && !V.draft.modes.code && !V.draft.modes.tap) { V.draft.modes.code = true; toast('どれか1つは オンにしてください'); }
      paintCheck();
      return;
    } else { onParentInput(e); return; }
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
  // 名前の欄で Enter
  $app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'nm') act_('name-ok');
    if (e.target.id === 'pin') act_(PIN ? 'pin-in' : 'pin-set');
  });

  // 別のページ（タグで開いた Safari のタブ）が進めたら、こちらも合わせる
  // 別のタブで探偵が入れかわっていたら、こちらも合わせてタイトルへ（ほかの子の記録で進めない）
  function syncMe() {
    AGENTS = lsGet(K_AGENTS) || AGENTS;
    var id = lsGet(K_ME), a = id ? agentById(id) : null;
    if ((a && a.id) === (ME && ME.id)) return false;
    ME = a; selectCase(kase && kase.id);
    if (route !== 'parent' && route !== 'print') { closeLayer(); V = {}; route = 'title'; render(); }
    return true;
  }
  window.addEventListener('storage', function (e) {
    if (e.key === K_ME || e.key === K_AGENTS) { syncMe(); return; }
    if (kase && ME && e.key === stateKey(kase.id) && reloadState() && route === 'play' && !$layer.innerHTML) { V = {}; render(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (syncMe()) return;
    if (reloadState() && route === 'play' && !$layer.innerHTML) { V = {}; render(); }
  });

  // ---------- はじめ ----------
  // v1（事件が1つだけの版）で準備した隠し場所・捜査コード・進み具合を、事件1「ブルームーン」としてそのまま写す。
  // ⚠ seed をそのまま使うので捜査コードもタグのURLも変わらない（書いたタグはそのまま使える）
  function migrateV1() {
    var v1 = lsGet(K_V1_SETUP);
    if (!v1 || !v1.places || !v1.seed) return false;
    if (v1.pin) { PIN = String(v1.pin); lsSet(K_PIN, PIN); }
    var su = JSON.parse(JSON.stringify(v1));
    delete su.pin;
    su.title = su.title || '';
    su.modes = su.modes || { tag: true, code: true, tap: false };
    var c = { id: 'c' + (Number(v1.seed) >>> 0).toString(36), story: 'bluemoon', setup: su, createdAt: Date.now() };
    CASES = [c];
    var st1 = lsGet(K_V1_STATE);
    if (st1 && st1.seed === v1.seed) { lsSet(legacyKey(c.id), st1); if (st1.name && !pref.lastName) { pref.lastName = st1.name; lsSet(K_PREF, pref); } }
    lsSet(K_CUR, c.id);
    saveCases();
    return true;
  }
  // 探偵を作る前の記録（事件ごとに1つ）を、記録に残っている名前の探偵へ写す。
  // ⚠ 前の置き場は消さない（もし何かあっても戻せるように）
  function migrateAgents() {
    AGENTS = [];
    var me = null;
    CASES.forEach(function (c) {
      var st = lsGet(legacyKey(c.id));
      if (!st || !st.name || st.seed !== c.setup.seed) return;
      var a = agentByName(st.name) || addAgent(st.name, '🕵️', '');
      if (!lsGet(stateKey(c.id, a.id))) lsSet(stateKey(c.id, a.id), st);
      if (!me || sameName(st.name, pref.lastName)) me = a;
    });
    saveAgents();
    if (me) lsSet(K_ME, me.id);
  }
  // タグの捜査コードから、どの事件のタグかを決める（いま選んでいる事件を先に見る）
  function caseForTag(tok) {
    var d = NL.decodeTag(tok);
    if (!d) return null;
    var order = CASES.slice();
    if (kase) order.sort(function (a, b) { return (a.id === kase.id ? 0 : 1) - (b.id === kase.id ? 0 : 1); });
    for (var i = 0; i < order.length; i++) if (NL.sceneCode(order[i].setup.seed, d.idx) === d.code) return order[i];
    return null;
  }
  function boot() {
    var p = lsGet(K_PREF); if (p) pref = Object.assign(pref, p);
    PIN = lsGet(K_PIN) || '';
    CASES = lsGet(K_CASES);
    if (!Array.isArray(CASES)) {
      CASES = [];
      if (!migrateV1()) addCase('bluemoon');
    }
    CASES = CASES.filter(function (c) { return c && c.setup && STORIES[c.story]; });
    // 新しく足された物語は、事件ファイルに「じゅんび まち」で1つ出す（親が消したら もう出さない）
    var seen = lsGet(K_SEEN);
    if (!Array.isArray(seen)) seen = CASES.map(function (c) { return c.story; });
    REG.forEach(function (r) {
      if (!STORIES[r.id] || seen.indexOf(r.id) >= 0) return;
      if (!CASES.some(function (c) { return c.story === r.id; })) addCase(r.id);
      seen.push(r.id);
    });
    lsSet(K_SEEN, seen);
    CASES.forEach(function (c) { c.setup.modes = c.setup.modes || { tag: true, code: true, tap: false }; });
    AGENTS = lsGet(K_AGENTS);
    if (!Array.isArray(AGENTS)) migrateAgents();
    ME = agentById(lsGet(K_ME));
    selectCase(lsGet(K_CUR));

    var url = new URL(location.href);
    var hash = location.hash || '';
    // 準備を写すURL（{story, setup}。v1 の形＝setup だけ も受ける）
    var m = hash.match(/#setup=([A-Za-z0-9_-]+)/);
    if (m) {
      try {
        var o = JSON.parse(unb64(m[1]));
        var story = o.story || 'bluemoon', su = o.setup || o;
        if (su && su.places && su.seed && STORIES[story]) {
          delete su.pin;
          var same = null;
          CASES.forEach(function (c) { if (c.setup.seed === su.seed) same = c; });
          var name = su.title || NL.plainText(STORIES[story].subtitle);
          if (same && JSON.stringify(same.setup) === JSON.stringify(su)) selectCase(same.id);
          else if (confirm('この端末の事件ファイルに「' + name + '」の準備（隠し場所・捜査コード）を' + (same ? '写して上書き' : '足') + 'しますか？')) {
            su.ready = true;
            if (same) { same.setup = su; saveCases(); selectCase(same.id); }
            else selectCase(addCase(story, su).id);
          }
        }
      } catch (e) { alert('準備のURLが読めませんでした'); }
      history.replaceState(null, '', location.pathname);
      hash = '';
    }
    var t = url.searchParams.get('t');
    if (t) {
      history.replaceState(null, '', location.pathname);
      var hit = caseForTag(t);
      if (hit) selectCase(hit.id);
      onTag(t, false);
      return;
    }
    if (hash === '#parent') route = 'parent';
    else if (hash === '#print') route = 'print';
    render();
  }

  // 物語の一覧（stories.json）→ それぞれの物語 → 準備画面の「よくある場所」
  fetch('stories.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (reg) {
    REG = reg;
    return Promise.all(reg.map(function (x) {
      return fetch(x.file, { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { STORIES[x.id] = j; });
    }).concat([
      fetch('presets.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { PRESETS = j; }).catch(function () { PRESETS = []; })
    ]));
  }).then(boot).catch(function (e) {
    $app.innerHTML = '<div class="boot">データが 読めませんでした。電波の よい ところで もう一度 ひらいてね。<br><small>' + esc(e && e.message) + '</small></div>';
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 無くても遊べる */ });
  }
})();
