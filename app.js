// 怪盗からの挑戦状 — 探偵ケータイ D-PHONE の画面（暗号の中身は logic.js、お話は stories/*.json）
//
// 事件ファイル：1つの事件＝物語（story）＋その家の準備（setup：隠し場所・seed・カギの数）＋進み具合（state）。
// 同じ物語でも準備が違えば別の事件（捜査コードもちがう）。タイトル画面で事件をえらんで遊ぶ。
//
// ⚠ 記録はこの端末の localStorage だけ（名前もここにしか残らない）。
// ⚠ iPhone はタグをかざすと Safari が別のページとして開く。Safari で遊んでいれば記録は同じなのでそのまま進む。
//   ホーム画面のアイコンから遊んでいると記録が別なので、開いたページに捜査コードを出して手で入れてもらう。
// ⚠ 隠し場所の準備（setup）も端末ごと。親が別の端末で準備したら「この準備を写すURL」で子どもの端末へ写す。
(function () {
  'use strict';
  var NL = window.NazoLogic;
  var $app = document.getElementById('app');
  var $layer = document.getElementById('layer');
  var K_CASES = 'nazo.v2.cases', K_CUR = 'nazo.v2.cur', K_PIN = 'nazo.v2.pin', K_PREF = 'nazo.v1.pref', K_PARENT = 'nazo.v1.parent';
  // ⚠ v1（事件が1つだけだった版）の置き場。最初に開いたとき事件1へ写す（消さない）
  var K_V1_SETUP = 'nazo.v1.setup', K_V1_STATE = 'nazo.v1.state';
  function stateKey(id) { return 'nazo.v2.state.' + id; }

  var SC = null, PRESETS = [], STEPS = [], STORIES = {}, REG = [], CASES = [], kase = null, PIN = '';
  var setup = null, state = null, pref = { sound: true, autoSpeak: false, lastName: '' };
  var route = 'title';
  var V = {};            // いまの画面だけの一時的なもの
  var tagView = null;    // タグから開いたときに出すもの
  var timers = [];
  var nfc = null;        // { ac: AbortController, step: stepId }

  // ---------- しまう ----------
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* 使えない環境 */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 使えない環境 */ } }

  function newSeed() { return (Math.floor(Math.random() * 0x7ffffffe) + 1) >>> 0; }
  function defaultSetup(story) {
    var s = newSeed();
    var df = (STORIES[story] && STORIES[story].defaults) || {};
    return {
      v: 1, seed: s, ready: false, title: '', keyNo: 10 + (s % 40),
      modes: { tag: true, code: true, tap: false },
      places: JSON.parse(JSON.stringify(df.places || []))
    };
  }
  function newCaseId() { return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function addCase(story, setupObj) {
    var c = { id: newCaseId(), story: story, setup: setupObj || defaultSetup(story), createdAt: Date.now() };
    CASES.push(c); saveCases();
    return c;
  }
  function saveCases() { lsSet(K_CASES, CASES); }
  function saveSetup() { if (kase) kase.setup = setup; saveCases(); PZ = null; }
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
    if (PZ && PZ.seed === setup.seed && PZ.k === JSON.stringify(setup.places) + setup.keyNo) return PZ;
    PZ = {
      seed: setup.seed, k: JSON.stringify(setup.places) + setup.keyNo,
      lp: NL.letterPuzzle(setup.places[0].yomi, setup.seed),
      cp: NL.clockPuzzle(setup.places[1].yomi, setup.seed),
      sc: NL.safeCode(setup)
    };
    return PZ;
  }
  function defaultDetail(name) { return name + 'の まわりを、手で さわって さがしてみるのじゃ。シールや 紙が あるはずじゃ。'; }
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
    return v;
  }
  function T(s) { return NL.rubyHtml(NL.fill(s, vars())); }
  function Plain(s) { return NL.plainText(NL.fill(s, vars())); }
  function esc(s) { return NL.esc(s); }

  // ---------- 進み ----------
  function flatten() {
    STEPS = [];
    SC.chapters.forEach(function (ch) { ch.steps.forEach(function (st) { STEPS.push({ ch: ch, st: st }); }); });
  }
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
    V = {};
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
      u.pitch = who === 'kaitou' ? 0.6 : who === 'hakase' ? 1.3 : 1.05;
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
  var WHO = { sys: 'D-PHONE', kaitou: '[怪盗|かいとう]クロウ', hakase: 'ネジマキ[博士|はかせ]' };

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
    h += '</div><div class="sign">―― ' + T('[怪盗|かいとう]') + 'クロウ</div></div>';
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
      default: return '';
    }
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
      }).join('') + '</div>' +
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
        btns = '<button class="btn" data-act="case-cont" data-case="' + c.id + '">▶ つづきから</button>';
      } else {
        badge = '<span class="cs new">NEW</span>';
        btns = '<button class="btn" data-act="case-start" data-case="' + c.id + '">▶ ' + R('この [事件|じけん]に いどむ！') + '</button>';
      }
      h += '<div class="casecard' + (done ? ' done' : '') + '"><div class="cno">CASE ' + ('0' + (i + 1)).slice(-2) + ' ' + badge + '</div>' +
        '<div class="ctt">' + R(sc.title) + '</div><div class="csub">' + esc(caseName(c)) + '</div>' +
        '<p class="cbl">' + R(sc.blurb || '') + '</p><p class="small" style="margin:0">⏱ ' + (sc.minutes || 30) + R('分ぐらい') + '</p>' + btns + '</div>';
    });
    h += '<button class="foot-link" data-act="parent">おうちの方へ（準備・事件を作る）</button></div>';
    $app.innerHTML = frame('', h, { noDock: true });
  }

  function renderName() {
    var h = '<h2>' + T('[探偵|たんてい]の 名前を 入れてね') + '</h2>' +
      '<p class="lead">' + T('D-PHONE に 名前を とうろくするよ。[認定証|にんていしょう]にも のるよ。') + '</p>' +
      '<input class="inp" id="nm" maxlength="12" autocomplete="off" placeholder="なまえ" value="' + esc(V.name || '') + '">' +
      '<button class="btn" data-act="name-ok">とうろく</button>' +
      '<button class="btn ghost" data-act="title">もどる</button>';
    $app.innerHTML = frame('', h, { noDock: true });
    var inp = document.getElementById('nm');
    setTimeout(function () { try { inp.focus(); } catch (e) { /* 無し */ } }, 50);
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
    return NL.normKana(st.answer || '');
  }
  function renderPuzzle(chHtml, st) {
    var P = puz();
    var ans = answerOf(st);
    if (!V.input) V.input = [];
    var h = '<div class="puzzle-head"><span class="tag">CODE</span><h2 style="margin:0">' + T(st.title) + '</h2></div>' +
      '<p class="lead">' + T(st.question) + '</p>';
    if (st.gen === 'letter' && P.lp.ok) {
      h += '<ol class="clues">' + P.lp.items.map(function (it, i) {
        return '<li><span class="n">' + CIRC.charAt(i) + '</span><span class="w">「' + esc(it.word) + '」</span><span class="p">' + it.pos + '文字目</span></li>';
      }).join('') + '</ol>';
    } else if (st.gen === 'clock' && P.cp.ok) {
      h += '<div class="side-by-side two">' + paperHtml(260).replace('width:260px', 'width:100%') + '<div style="text-align:center">' + clockSvg(P.cp.dial, 250) + '</div></div>';
    } else if (st.body) {
      h += '<div class="panel">' + T(st.body) + '</div>';
    }
    h += '<div class="slots" id="slots"></div><div class="wrong" id="wrong">' + (V.wrongMsg || '') + '</div>';
    h += kanaKeyboard();
    h += '<button class="btn gold" data-act="answer">🔍 こたえる</button>';
    $app.innerHTML = frame(chHtml, h);
    paintSlots(ans.length);
  }
  function paintSlots(n) {
    var el = document.getElementById('slots'); if (!el) return;
    var inp = V.input || [];
    var len = Math.max(n, inp.length);
    var h = '';
    for (var i = 0; i < len; i++) h += '<div class="slot' + (i === inp.length ? ' cur' : '') + (i >= n ? ' extra' : '') + '">' + esc(inp[i] || '') + '</div>';
    el.innerHTML = h;
  }
  var KB_COLS = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ ん  '];
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
  function submitAnswer() {
    var st = cur().st;
    var ans = answerOf(st);
    var got = (V.input || []).join('');
    if (!got) { toast('文字を 入れてね'); return; }
    if (NL.sameAnswer(got, ans)) {
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
      var s = document.getElementById('slots');
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
  function numPad() {
    return '<div class="np">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-n="' + n + '">' + n + '</button>'; }).join('') +
      '<button class="fn" data-nf="clr">けす</button><button data-n="0">0</button><button class="fn" data-nf="bs">⌫</button></div>';
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
      if (j.kind === 'othercase') {
        h += '<div class="warn">おうちの方へ：このタグは、この端末に入っている事件とは別の準備で作られています。準備画面の「ほかの端末へ準備を写す」で、遊ぶ端末の準備をそろえてください。</div>';
      } else if (isIOS()) {
        h += '<p class="small">おうちの方へ：iPhone でホーム画面のアイコンから遊んでいると、タグで開くページ（Safari）とは記録が別になるため、このコードが出ます。Safari のまま遊ぶと自動で進みます。</p>';
      }
    }
    h += '<button class="btn" data-act="tag-close">D-PHONE を ひらく</button></div>';
    $app.innerHTML = frame('', h, { noDock: true });
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
    $layer.innerHTML = '<div class="solved"><div class="rays"></div>' + conf +
      '<div class="t1">CASE CLOSED</div><div class="t2">' + T('[事件|じけん]') + '<br>' + T('[解決|かいけつ]!!') + '</div>' +
      '<div class="t3">MISSION COMPLETE</div>' +
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
    var titleName = ['見習い', 'すご腕', '名'][r.stars - 1];
    var h = '<div class="cert"><div class="no">' + T('[認定|にんてい]番号') + ' No.' + no + '</div><div class="ttl">' + T('[探偵|たんてい][認定証|にんていしょう]') + '</div>' +
      '<div class="nm">' + T(titleName + '[探偵|たんてい]') + '　' + esc(state.name) + '</div>' +
      '<div class="bd">' + T('あなたは [怪盗|かいとう]クロウの 暗号を すべて とき、ダイヤ『ブルームーン』を とりもどしました。よって ここに、りっぱな [探偵|たんてい]で ある ことを みとめます。') + '</div>' +
      '<div class="rank">' + new Array(r.stars + 1).join('★') + new Array(4 - r.stars).join('☆') + '</div>' +
      '<div class="st"><div>' + T('[捜査|そうさ]時間') + '<b>' + durText((state.finishedAt || Date.now()) - state.startedAt) + '</b></div>' +
      '<div>ヒント<b>' + r.hints + '回</b></div><div>ミス<b>' + (state.wrong || 0) + '回</b></div></div>' +
      '<div class="sign">' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日<br>' + T('D-PHONE 開発者　ネジマキ[博士|はかせ]') + '</div>' +
      '<div class="seal">' + T('[認定|にんてい]') + '<br>D-PHONE</div></div>' +
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
    var c = state && route === 'play' ? cur() : null;
    var st = c && c.st;
    var h = '<div class="overlay" data-act="close-layer"><div class="sheet" data-stop="1"><button class="x" data-act="close-layer">とじる</button>' +
      '<div class="msg hakase" style="margin-bottom:6px"><div class="av">' + AV.hakase + '</div><div class="bub"><div class="who">' + NL.rubyHtml(WHO.hakase) + '</div>';
    if (!st || !st.hints || V.dlg || !state.titles[c.ch.id] && c.ch.id !== 'op') {
      h += T('いまは お話を よく 聞くのじゃ。') + '</div></div>';
    } else {
      var n = state.hints[st.id] || 0;
      h += T(n ? 'ヒントじゃ。よく 読むのじゃぞ。' : 'こまったかの？ ヒントを 1つずつ 出すぞい。') + '</div></div>';
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
    showHint();
  }
  function showMenu() {
    var h = '<div class="overlay" data-act="close-layer"><div class="sheet" data-stop="1"><button class="x" data-act="close-layer">とじる</button><h2>⚙ メニュー</h2>' +
      '<button class="btn" data-act="tog-sound">' + (pref.sound ? '🔊 こうかおん：オン' : '🔈 こうかおん：オフ') + '</button>' +
      '<button class="btn" data-act="tog-speak">' + (pref.autoSpeak ? '🗣 ' + T('お話を 自動で 読む：オン') : '🗣 ' + T('お話を 自動で 読む：オフ')) + '</button>' +
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
    h += '<label>カギに刻む数（10〜49。金庫の番号の後ろ2けた＝この数の2倍）</label><div class="row"><input type="number" min="10" max="49" data-pf="keyNo" value="' + esc(d.keyNo) + '"><button class="btn sm" data-act="key-dice" style="flex:0 0 auto">🎲 てきとうに</button></div>';
    h += '</div>';

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
      '<tr><td>暗号その1</td><td>' + esc(v.a1) + '（' + esc(v.place1) + '）</td></tr>' +
      '<tr><td>暗号その2</td><td>' + esc(v.a2) + '（' + esc(v.place2) + '）</td></tr>' +
      '<tr><td>金庫</td><td>' + esc(v.code) + '（' + v.d1 + '・' + v.d2 + '・' + v.key + '×2）</td></tr></table></div>';

    var share = baseUrl() + '#setup=' + b64(JSON.stringify({ story: kase.story, setup: setup }));
    h += '<div class="panel"><h3>⑥ ほかの端末へ準備を写す</h3><p class="small">準備をしたのが子どもの端末でないときは、このURLを子どもの端末で開いてください（LINE で送るなら、受け取ったあと Safari / Chrome で開く）。</p>' +
      '<div class="mono">' + esc(share) + '</div><button class="btn sm" data-copy="' + esc(share) + '">コピー</button></div>';

    h += '<div class="panel"><h3>⑦ 進み具合</h3>';
    if (state) {
      var c = cur();
      h += '<p>名前：' + esc(state.name) + '　いま：' + (state.stepId === 'done' ? '事件解決ずみ' : esc(Plain(c ? c.ch.title : '')) + '（' + esc(state.stepId) + '）') + '</p>' +
        '<label>ここから遊ぶ（ためし用）</label><select id="jump">' + STEPS.map(function (s) {
          return '<option value="' + s.st.id + '"' + (s.st.id === state.stepId ? ' selected' : '') + '>' + esc(Plain(s.ch.title)) + ' / ' + esc(s.st.id) + '</option>';
        }).join('') + '</select><button class="btn sm" data-act="jump">ここへ移る</button>';
    } else h += '<p class="small">まだ遊んでいません。</p>';
    h += '<button class="btn red" data-act="reset">この事件を最初からやり直す（記録を消す）</button>' +
      '<button class="btn red" data-act="newcase">捜査コードを作り直す（タグの書き直し・紙の印刷し直しが必要）</button>' +
      '<button class="btn red" data-act="case-del">この事件を事件ファイルから消す</button></div>';

    h += '<div class="panel"><h3>⑧ 合言葉</h3><button class="btn sm" data-act="pin-change">準備画面の合言葉を変える</button></div>';
    h += '<button class="btn" data-act="title">おわる（事件ファイルへ）</button></div>';
    $app.innerHTML = frame('', h, { noDock: true });
  }
  // 事件ファイル（準備画面のいちばん上）：どの事件を準備するか選ぶ・新しく作る
  function caseFileHtml() {
    var h = '<div class="panel"><h3>📁 事件ファイル</h3><p class="small">事件ごとに、隠し場所・捜査コード・進み具合が別々に残ります。子どもはタイトルの一覧から選んで遊びます。</p><table>';
    CASES.forEach(function (c, i) {
      var st = caseState(c);
      var stat = !c.setup.ready ? '準備まだ' : !st ? '未着手' : st.stepId === 'done' ? '解決ずみ' : '捜査中';
      var on = kase && c.id === kase.id;
      h += '<tr' + (on ? ' style="background:rgba(63,240,255,.08)"' : '') + '><td>CASE ' + ('0' + (i + 1)).slice(-2) + '</td><td>' + esc(caseName(c)) +
        '<br><span class="small">' + esc(NL.plainText((STORIES[c.story] || {}).title || c.story)) + '・' + stat + '</span></td><td>' +
        (on ? '<span class="ok">準備中</span>' : '<button class="btn sm" data-act="pcase" data-case="' + c.id + '">準備する</button>') + '</td></tr>';
    });
    h += '</table><details style="margin-top:10px"><summary>＋ 新しい事件を作る</summary>' +
      '<label>物語</label><select id="nstory">' + REG.filter(function (r) { return STORIES[r.id]; }).map(function (r) {
        return '<option value="' + esc(r.id) + '">' + esc(NL.plainText(STORIES[r.id].title)) + '（' + esc(NL.plainText(STORIES[r.id].subtitle)) + '）</option>';
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
      var lp = NL.letterPuzzle(d.places[0].yomi, d.seed), cp = NL.clockPuzzle(d.places[1].yomi, d.seed);
      h += '<div class="panel"><h3>できる暗号（下見）</h3><p class="small">暗号その1：' + lp.items.map(function (it) { return '「' + esc(it.word) + '」の' + it.pos + '文字目'; }).join('、') + ' → <b>' + esc(lp.answer) + '</b></p>' +
        '<p class="small">暗号その2：' + cp.seq.map(function (s) { return esc(s.expr) + '=' + s.hour + '時「' + esc(s.kana) + '」'; }).join('、') + ' → <b>' + esc(cp.answer) + '</b></p>' +
        '<p class="small">金庫：' + esc(NL.safeCode(d).code) + '</p></div>';
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
      '<p class="small">紙は A4 で3枚です。1枚目を場所1、2枚目を場所2 のタグのそばに隠し、3枚目の予告状は最初に子どもへ手わたします。</p></div>';
    [0, 1].forEach(function (i) {
      h += '<div class="print-page"><div class="ts">TOP SECRET</div><div style="margin-top:8px;color:#555">' + esc(caseName(kase)) + '</div><div class="pl">' + T('[現場|げんば]' + (i ? 'B' : 'A') + '：') + esc(setup.places[i].name) + '</div>';
      if (m.code) h += '<div>' + T('[捜査|そうさ]コード') + '</div><div class="code">' + NL.sceneCode(setup.seed, i) + '</div>';
      h += '<div style="max-width:420px">' + (i === 0 ? paperHtml(400) : memoHtml(420)) + '</div>';
      h += '<div class="parent-note">おうちの方へ：このカードを「' + esc(setup.places[i].name) + '」に隠し、そばにタグ（場所' + (i + 1) + 'のURL）を貼ってください。' +
        (m.code ? '捜査コードは D-PHONE の「捜査コードを入れる」で使います。' : '') + '</div></div>';
    });
    h += '<div class="print-page" style="text-align:center"><div class="ts">WARNING</div><div style="margin:18px auto;max-width:360px">' + letterHtml(360) + '</div>' +
      '<div style="font-size:22px;line-height:2;text-align:left;max-width:520px;margin:0 auto">' +
      ['名[探偵|たんてい]へ', 'ダイヤ『ブルームーン』は いただいた。', 'きみの 家の どこかに かくしてある。',
        '[探偵|たんてい]ケータイ「D-PHONE」を ひらき、わたしの 暗号を といてみたまえ。'].map(function (l) { return '<div>' + T(l) + '</div>'; }).join('') +
      '<div style="text-align:right">―― ' + T('[怪盗|かいとう]クロウ') + '</div></div><div class="parent-note" style="clear:both">D-PHONE：' + esc(baseUrl()) + '</div></div>';
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
      case 'title': closeLayer(); V = {}; route = 'title'; if (location.hash) history.replaceState(null, '', location.pathname); render(); window.scrollTo(0, 0); break;
      case 'case-start': selectCase(el.getAttribute('data-case')); V = { name: pref.lastName || '' }; route = 'name'; render(); break;
      case 'case-cont': audio(); selectCase(el.getAttribute('data-case')); route = 'play'; V = {}; render(); window.scrollTo(0, 0); break;
      case 'case-cert': selectCase(el.getAttribute('data-case')); route = 'cert'; render(); window.scrollTo(0, 0); break;
      case 'case-replay':
        selectCase(el.getAttribute('data-case'));
        if (confirm('はじめから 遊びますか？（この 事件の にんていしょうは 消えます）')) {
          V = { name: (state && state.name) || pref.lastName || '' }; route = 'name'; state = null; lsDel(stateKey(kase.id)); render();
        }
        break;
      case 'name-ok': {
        var nm = (document.getElementById('nm').value || '').trim();
        if (!nm) { toast('名前を 入れてね'); return; }
        pref.lastName = nm.slice(0, 12); lsSet(K_PREF, pref);
        audio(); newGame(nm.slice(0, 12)); route = 'play'; V = {}; render(); window.scrollTo(0, 0); break;
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
      case 'get-close': { closeLayer(); var f = V.afterGet; V.afterGet = null; if (f) f(); break; }
      case 'to-cert': closeLayer(); route = 'cert'; render(); break;
      case 'print-cert': window.print(); break;
      case 'evlist': showInventory(); break;
      case 'inv': showInventory(); break;
      case 'hint': showHint(); break;
      case 'hint-more': moreHint(); break;
      case 'hint-say': { var st = cur().st; var n = state.hints[st.id] || 0; if (n) say(st.hints[n - 1], 'hakase'); break; }
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
        var changed = JSON.stringify(V.draft.places) !== JSON.stringify(setup.places) || V.draft.keyNo !== setup.keyNo;
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
        if (confirm('「' + caseName(kase) + '」の記録を消して、最初からにしますか？')) { state = null; lsDel(stateKey(kase.id)); toast('消しました'); render(); }
        break;
      case 'newcase':
        if (confirm('捜査コードを作り直しますか？ タグのURLが変わるので、タグを書き直して紙も印刷し直す必要があります。この事件の記録も消えます。')) {
          setup.seed = newSeed(); saveSetup(); V.draft = null; state = null; lsDel(stateKey(kase.id)); toast('作り直しました'); render();
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
        saveCases(); lsDel(stateKey(gone));
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
    }
  }
  $app.addEventListener('input', onParentInput);
  $app.addEventListener('change', function (e) {
    if (route !== 'parent' || !V.draft) return;
    var t = e.target;
    var f = t.getAttribute('data-pf'), i = +t.getAttribute('data-i');
    if (f === 'preset') {
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
  window.addEventListener('storage', function (e) {
    if (kase && e.key === stateKey(kase.id) && reloadState() && route === 'play' && !$layer.innerHTML) { V = {}; render(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && reloadState() && route === 'play' && !$layer.innerHTML) { V = {}; render(); }
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
    if (st1 && st1.seed === v1.seed) { lsSet(stateKey(c.id), st1); if (st1.name && !pref.lastName) { pref.lastName = st1.name; lsSet(K_PREF, pref); } }
    lsSet(K_CUR, c.id);
    saveCases();
    return true;
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
    CASES.forEach(function (c) { c.setup.modes = c.setup.modes || { tag: true, code: true, tap: false }; });
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
