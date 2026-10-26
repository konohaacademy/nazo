// 怪盗からの挑戦状 — 暗号カードの絵（SVG）。中身（どの字をどこに置くか）は logic.js の cardPuzzle が決める。
//
// ⚠ カードの字は子どもが読むので、漢字は小3まで（ルビは SVG に入れられない）。tests/logic.js が CARD_TEXT を見る。
// ⚠ 印刷しても同じ絵になるよう、絵文字は使わず、形はぜんぶ SVG で描く（端末ごとに絵文字の絵がちがうため）。
(function (root) {
  'use strict';
  var FONT = "'Zen Maru Gothic','Hiragino Maru Gothic ProN','BIZ UDPGothic','Meiryo',sans-serif";
  var INK = '#2b2116', GOLD = '#c9a24a', TEAL = '#17383a';
  // カードの見た目（物語ごと）。parchment＝羊皮紙（ブルームーン）・space＝宇宙（ピコ）
  var THEMES = {
    parchment: { ink: INK, sign: 'かいとう クロウ', mark: 'mask' },
    space: { ink: '#e9f6ff', sign: 'キラリ星の ピコ', mark: 'star' }
  };
  var TH = THEMES.parchment;

  // カードの見出し（子ども向け。漢字は小3まで）
  var CARD_TEXT = {
    mirror: 'かがみの むこうの 文字を 読め',
    tanuki: '絵の どうぶつが ヒントだ',
    gojuon: 'あいうえお表で 読みとけ',
    arrow: 'スタートから やじるしの とおりに 進め',
    alien: 'キラリ星の 文字を ほんやく せよ',
    image: 'かいとうの 暗号カード'
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var uid = 0;

  // ---------- わく（羊皮紙・金のふち・見出しの帯・Q番号） ----------
  function frame(no, title, body, id) {
    if (TH === THEMES.space) return frameSpace(no, title, body, id);
    var g = 'cg' + id;
    return '<svg class="ncard" viewBox="0 0 1200 840" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(title) + '">' +
      '<defs>' +
      '<radialGradient id="' + g + 'p" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#fbf4e2"/><stop offset=".65" stop-color="#efe1bf"/><stop offset="1" stop-color="#cfb486"/></radialGradient>' +
      '<linearGradient id="' + g + 'h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b5856"/><stop offset="1" stop-color="' + TEAL + '"/></linearGradient>' +
      '<linearGradient id="' + g + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d98a"/><stop offset=".5" stop-color="' + GOLD + '"/><stop offset="1" stop-color="#8d6a24"/></linearGradient>' +
      '<filter id="' + g + 'n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="3"/>' +
      '<feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .12  0 0 0 .09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>' +
      '<filter id="' + g + 's"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".35"/></filter>' +
      '</defs>' +
      // 紙
      '<rect x="0" y="0" width="1200" height="840" rx="18" fill="url(#' + g + 'p)"/>' +
      '<rect x="0" y="0" width="1200" height="840" rx="18" fill="#000" filter="url(#' + g + 'n)"/>' +
      // ふち（こげ茶の太いわく＋金の細い線2本）
      '<rect x="16" y="16" width="1168" height="808" rx="12" fill="none" stroke="#5a3d1b" stroke-width="14"/>' +
      '<rect x="31" y="31" width="1138" height="778" rx="8" fill="none" stroke="url(#' + g + 'g)" stroke-width="4"/>' +
      '<rect x="41" y="41" width="1118" height="758" rx="6" fill="none" stroke="url(#' + g + 'g)" stroke-width="1.5" opacity=".8"/>' +
      corners(g) +
      // 見出しの帯
      '<rect x="150" y="62" width="990" height="76" fill="url(#' + g + 'h)" filter="url(#' + g + 's)"/>' +
      '<line x1="150" y1="66" x2="1140" y2="66" stroke="url(#' + g + 'g)" stroke-width="2"/><line x1="150" y1="134" x2="1140" y2="134" stroke="url(#' + g + 'g)" stroke-width="2"/>' +
      '<text x="660" y="114" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="' + (title.length > 15 ? 36 : 42) + '" fill="#f6e7b8" letter-spacing="2">' + esc(title) + '</text>' +
      // Q番号の丸
      '<g filter="url(#' + g + 's)"><circle cx="128" cy="100" r="66" fill="' + TEAL + '"/><circle cx="128" cy="100" r="66" fill="none" stroke="url(#' + g + 'g)" stroke-width="6"/>' +
      '<circle cx="128" cy="100" r="55" fill="none" stroke="#f3d98a" stroke-width="1.5" opacity=".7"/></g>' +
      '<text x="128" y="124" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-style="italic" font-weight="700" font-size="66" fill="#f6e7b8">Q' + no + '</text>' +
      body +
      // 怪盗のしるし（右下）
      '<g transform="translate(1070 760)" opacity=".75"><path d="M-46 0 Q-23 -16 0 -6 Q23 -16 46 0 Q40 12 24 11 Q12 4 0 9 Q-12 4 -24 11 Q-40 12 -46 0Z" fill="' + INK + '"/>' +
      '<ellipse cx="-20" cy="1" rx="7" ry="4" fill="#c8283c"/><ellipse cx="20" cy="1" rx="7" ry="4" fill="#c8283c"/></g>' +
      '<text x="1005" y="768" text-anchor="end" font-family="' + FONT + '" font-weight="700" font-size="24" fill="' + INK + '" opacity=".7">' + esc(TH.sign) + '</text>' +
      '</svg>';
  }
  // 宇宙のカード（こい紺に星・ネオンの ふち・むらさきの帯・わく星の Q番号）
  function frameSpace(no, title, body, id) {
    var g = 'cs' + id, stars = '';
    var r = 12345 + id * 7;
    function rnd() { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; }
    for (var i = 0; i < 90; i++) {
      var x = 40 + rnd() * 1120, y = 40 + rnd() * 760, rr = rnd() < 0.85 ? 1 + rnd() * 1.6 : 2.6 + rnd() * 1.4;
      stars += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + rr.toFixed(1) + '" fill="#fff" opacity="' + (0.35 + rnd() * 0.6).toFixed(2) + '"/>';
    }
    return '<svg class="ncard" viewBox="0 0 1200 840" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(title) + '">' +
      '<defs><radialGradient id="' + g + 'b" cx="70%" cy="30%" r="90%"><stop offset="0" stop-color="#27306b"/><stop offset=".55" stop-color="#121640"/><stop offset="1" stop-color="#070a1f"/></radialGradient>' +
      '<radialGradient id="' + g + 'n" cx="20%" cy="80%" r="45%"><stop offset="0" stop-color="#b43cff" stop-opacity=".35"/><stop offset="1" stop-color="#b43cff" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + g + 'h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b2aa8"/><stop offset="1" stop-color="#2a3fb8"/></linearGradient>' +
      '<radialGradient id="' + g + 'p" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#ffd36b"/><stop offset="1" stop-color="#e0662a"/></radialGradient>' +
      '<filter id="' + g + 'gl"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<rect width="1200" height="840" rx="18" fill="url(#' + g + 'b)"/><rect width="1200" height="840" rx="18" fill="url(#' + g + 'n)"/>' + stars +
      '<rect x="18" y="18" width="1164" height="804" rx="14" fill="none" stroke="#5ee7ff" stroke-width="5" filter="url(#' + g + 'gl)"/>' +
      '<rect x="34" y="34" width="1132" height="772" rx="10" fill="none" stroke="#5ee7ff" stroke-width="1.5" opacity=".5" stroke-dasharray="14 10"/>' +
      '<rect x="150" y="62" width="990" height="76" rx="38" fill="url(#' + g + 'h)"/>' +
      '<text x="660" y="114" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="' + (title.length > 15 ? 36 : 42) + '" fill="#fff" letter-spacing="2">' + esc(title) + '</text>' +
      // わく星の Q番号
      '<ellipse cx="128" cy="100" rx="96" ry="22" fill="none" stroke="#ffd36b" stroke-width="5" transform="rotate(-16 128 100)" opacity=".9"/>' +
      '<circle cx="128" cy="100" r="58" fill="url(#' + g + 'p)"/>' +
      '<path d="M50 112 Q128 140 206 88" fill="none" stroke="#ffd36b" stroke-width="5" transform="rotate(-2 128 100)"/>' +
      '<text x="128" y="122" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-style="italic" font-weight="700" font-size="60" fill="#3a1606">Q' + no + '</text>' +
      body +
      '<g transform="translate(1078 762)"><polygon points="0,-20 6,-6 21,-6 9,3 13,18 0,9 -13,18 -9,3 -21,-6 -6,-6" fill="#ffd36b"/></g>' +
      '<text x="1048" y="770" text-anchor="end" font-family="' + FONT + '" font-weight="700" font-size="24" fill="#bfe9ff">' + esc(TH.sign) + '</text>' +
      '</svg>';
  }
  // ---------- 宇宙文字 ----------
  // g＝logic.js の ALIEN_GLYPHS の1つ。cx,cy＝まんなか、s＝点と点の あいだ
  function glyph(g, cx, cy, s, color, w) {
    var h = '<g stroke="' + color + '" stroke-width="' + (w || s * 0.22) + '" stroke-linecap="round" stroke-linejoin="round" fill="none">';
    g.segs.forEach(function (sg) {
      h += '<line x1="' + (cx + (sg[0][0] - 1) * s) + '" y1="' + (cy + (sg[0][1] - 1) * s) + '" x2="' + (cx + (sg[1][0] - 1) * s) + '" y2="' + (cy + (sg[1][1] - 1) * s) + '"/>';
    });
    h += '</g>';
    if (g.dot) h += '<circle cx="' + (cx + (g.dot[0] - 1) * s) + '" cy="' + (cy + (g.dot[1] - 1) * s) + '" r="' + s * 0.2 + '" fill="' + color + '"/>';
    return h;
  }
  function glyphSvg(g, size, color) {
    return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' + glyph(g, 50, 50, 30, color || '#5ee7ff', 8) + '</svg>';
  }
  function alien(cp, GL) {
    var n = cp.codes.length, tile = Math.min(112, Math.floor(960 / n)), gap = Math.min(14, tile * 0.12), w = n * tile + (n - 1) * gap;
    var x0 = 600 - w / 2, y0 = 168;
    // 通信（上）
    var h = '<text x="600" y="' + (y0 + 8) + '" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="24" fill="#bfe9ff">▼ ピコの レーダーからの 通信</text>';
    cp.codes.forEach(function (c, i) {
      var x = x0 + i * (tile + gap), y = y0 + 28;
      h += '<rect x="' + x + '" y="' + y + '" width="' + tile + '" height="' + tile + '" rx="16" fill="#0b1438" stroke="#5ee7ff" stroke-width="3"/>' +
        glyph(GL[c.glyph], x + tile / 2, y + tile / 2, tile * 0.28, '#5ee7ff');
      if (c.mark) h += markBadge(c.mark, x + tile - 6, y + 6, tile * 0.22);
    });
    // ほんやく表（下）
    var cols = 5, cw = 190, ch = 112, tx = 600 - (cols * cw) / 2, ty = 380;
    h += '<rect x="' + (tx - 16) + '" y="' + (ty - 46) + '" width="' + (cols * cw + 32) + '" height="' + (Math.ceil(cp.decoder.length / cols) * ch + 60) + '" rx="18" fill="#f4f8ff" opacity=".96"/>' +
      '<text x="600" y="' + (ty - 14) + '" text-anchor="middle" font-family="' + FONT + '" font-weight="900" font-size="26" fill="#2a3fb8">キラリ星の ほんやく表</text>';
    cp.decoder.forEach(function (d, i) {
      var cx = tx + (i % cols) * cw, cy = ty + Math.floor(i / cols) * ch;
      h += '<rect x="' + (cx + 8) + '" y="' + (cy + 6) + '" width="' + (cw - 16) + '" height="' + (ch - 14) + '" rx="12" fill="#fff" stroke="#9db4ff" stroke-width="2"/>' +
        glyph(GL[d.glyph], cx + 54, cy + ch / 2 - 2, 21, '#2a3fb8') +
        '<text x="' + (cx + 94) + '" y="' + (cy + ch / 2 + 2) + '" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="38" fill="' + INK + '">＝' + esc(d.kana) + '</text>';
    });
    return h;
  }
  function corners(g) {
    var h = '';
    [[56, 56, 1, 1], [1144, 56, -1, 1], [56, 784, 1, -1], [1144, 784, -1, -1]].forEach(function (c) {
      h += '<g transform="translate(' + c[0] + ' ' + c[1] + ') scale(' + c[2] + ' ' + c[3] + ')" fill="none" stroke="url(#' + g + 'g)" stroke-width="3">' +
        '<path d="M0 46 Q0 0 46 0"/><path d="M10 40 Q12 12 40 10"/><circle cx="14" cy="14" r="5" fill="url(#' + g + 'g)" stroke="none"/></g>';
    });
    return h;
  }
  function bigText(text, cx, cy, size, extra, color) {
    return '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="' + size + '" fill="' + (color || TH.ink) + '"' + (extra || '') + '>' + esc(text) + '</text>';
  }

  // ---------- 鏡文字 ----------
  function mirror(cp) {
    var n = Array.from(cp.text).length;
    var size = Math.min(210, Math.floor(900 / n));
    var body = '<g transform="translate(600 0) scale(-1 1) translate(-600 0)">' + bigText(cp.text, 600, 430, size, ' letter-spacing="' + Math.round(size * 0.08) + '"') + '</g>' +
      // 手かがみ（左下）
      '<g transform="translate(150 650) rotate(-28)"><rect x="-11" y="40" width="22" height="92" rx="10" fill="#8d6a24"/>' +
      '<ellipse cx="0" cy="0" rx="58" ry="70" fill="#8d6a24"/><ellipse cx="0" cy="0" rx="47" ry="58" fill="#d9eef2"/>' +
      '<path d="M-28 -30 Q-10 -48 14 -44" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" opacity=".9"/>' +
      '<path d="M-30 -10 Q-26 -20 -18 -24" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/></g>';
    return body;
  }

  // ---------- たぬき（「た」ぬき）・ことり（「こ」とり） ----------
  function tanukiArt() {
    return '<g>' +
      // しっぽ（しま）
      '<g transform="translate(92 70) rotate(-35)"><ellipse cx="0" cy="0" rx="34" ry="78" fill="#8a5a2b"/>' +
      '<path d="M-30 -30 Q0 -40 30 -30 L32 -14 Q0 -24 -32 -14Z" fill="#4a2f17"/><path d="M-33 10 Q0 0 33 10 L32 26 Q0 16 -32 26Z" fill="#4a2f17"/>' +
      '<path d="M-24 52 Q0 44 24 52 Q14 76 0 78 Q-14 76 -24 52Z" fill="#4a2f17"/></g>' +
      // からだ
      '<ellipse cx="0" cy="88" rx="96" ry="104" fill="#9a6633"/><ellipse cx="0" cy="104" rx="62" ry="74" fill="#f0d9ad"/>' +
      '<ellipse cx="-62" cy="176" rx="34" ry="20" fill="#4a2f17"/><ellipse cx="62" cy="176" rx="34" ry="20" fill="#4a2f17"/>' +
      '<ellipse cx="-80" cy="92" rx="22" ry="40" fill="#4a2f17" transform="rotate(20 -80 92)"/><ellipse cx="80" cy="92" rx="22" ry="40" fill="#4a2f17" transform="rotate(-20 80 92)"/>' +
      // 頭
      '<circle cx="-62" cy="-112" r="26" fill="#4a2f17"/><circle cx="62" cy="-112" r="26" fill="#4a2f17"/>' +
      '<circle cx="-62" cy="-110" r="13" fill="#c99a63"/><circle cx="62" cy="-110" r="13" fill="#c99a63"/>' +
      '<ellipse cx="0" cy="-62" rx="96" ry="80" fill="#9a6633"/>' +
      '<path d="M-92 -58 Q-60 -96 -18 -66 Q-10 -40 -40 -30 Q-80 -26 -92 -58Z" fill="#3a2412"/>' +
      '<path d="M92 -58 Q60 -96 18 -66 Q10 -40 40 -30 Q80 -26 92 -58Z" fill="#3a2412"/>' +
      '<ellipse cx="0" cy="-30" rx="44" ry="34" fill="#f0d9ad"/>' +
      '<circle cx="-44" cy="-56" r="11" fill="#fff"/><circle cx="44" cy="-56" r="11" fill="#fff"/><circle cx="-42" cy="-55" r="6" fill="#111"/><circle cx="42" cy="-55" r="6" fill="#111"/>' +
      '<ellipse cx="0" cy="-40" rx="13" ry="9" fill="#1c1209"/><path d="M-12 -18 Q0 -8 12 -18" stroke="#1c1209" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      // 頭のはっぱ
      '<g transform="translate(0 -150) rotate(-18)"><path d="M0 -44 Q34 -20 0 40 Q-34 -20 0 -44Z" fill="#4f9a3a" stroke="#2f6b22" stroke-width="3"/>' +
      '<path d="M0 -36 L0 48" stroke="#2f6b22" stroke-width="3"/><path d="M0 -10 L14 -22 M0 8 L16 -4 M0 -10 L-14 -22 M0 8 L-16 -4" stroke="#2f6b22" stroke-width="2"/></g>' +
      '</g>';
  }
  function kotoriArt() {
    return '<g>' +
      '<path d="M-150 150 Q0 120 150 160" stroke="#6b4a1f" stroke-width="16" fill="none" stroke-linecap="round"/>' +
      '<path d="M90 146 Q110 120 130 128 Q118 146 96 150Z" fill="#5a9a3a"/>' +
      '<path d="M70 30 Q150 40 170 80 Q120 80 70 70Z" fill="#3c6f9e"/>' +
      '<ellipse cx="0" cy="30" rx="104" ry="96" fill="#5aa0d8"/><ellipse cx="-14" cy="56" rx="64" ry="60" fill="#fbf3dd"/>' +
      '<path d="M10 0 Q80 10 96 70 Q50 80 14 50Z" fill="#3c7fb8"/>' +
      '<circle cx="-40" cy="-6" r="13" fill="#111"/><circle cx="-44" cy="-10" r="4" fill="#fff"/>' +
      '<path d="M-96 6 L-140 20 L-96 32Z" fill="#f0a020"/>' +
      '<ellipse cx="-70" cy="30" rx="14" ry="9" fill="#f4a3a3" opacity=".7"/>' +
      '<path d="M-20 122 L-26 146 M-4 124 L0 148" stroke="#e08a20" stroke-width="6" stroke-linecap="round"/>' +
      '</g>';
  }
  function tanuki(cp) {
    var n = Array.from(cp.text).length;
    var size = Math.min(128, Math.floor(560 / n));
    return '<circle cx="270" cy="450" r="200" fill="#fff8e8" stroke="' + GOLD + '" stroke-width="5"/>' +
      '<circle cx="270" cy="450" r="186" fill="none" stroke="#5a3d1b" stroke-width="1.5" stroke-dasharray="6 8"/>' +
      '<g transform="translate(270 440) scale(' + (cp.pic === 'kotori' ? 1.05 : 0.95) + ')">' + (cp.pic === 'kotori' ? kotoriArt() : tanukiArt()) + '</g>' +
      // 吹き出しの紙に 字
      '<rect x="500" y="320" width="640" height="250" rx="26" fill="#fffdf4" stroke="#5a3d1b" stroke-width="4"/>' +
      '<path d="M500 420 L462 450 L500 470Z" fill="#fffdf4" stroke="#5a3d1b" stroke-width="4" stroke-linejoin="round"/><rect x="496" y="418" width="10" height="56" fill="#fffdf4"/>' +
      bigText(cp.text, 820, 445, size, ' letter-spacing="' + Math.round(size * 0.04) + '"', INK);
  }

  // ---------- あいうえお表 ----------
  var SHAPE_COLOR = { star: '#d4a017', circle: '#d23c3c', triangle: '#2f8f4e', square: '#2f6fb8', diamond: '#8e44ad', heart: '#e0507a', moon: '#c9900a', drop: '#1e9bc4', cross: '#5a3d1b', hexagon: '#e07020', clover: '#3a9a3a' };
  function shape(name, cx, cy, r) {
    var c = SHAPE_COLOR[name] || INK, h = '';
    var t = 'translate(' + cx + ' ' + cy + ')';
    switch (name) {
      case 'star': {
        var pts = [];
        for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push((Math.cos(a) * rr).toFixed(1) + ',' + (Math.sin(a) * rr).toFixed(1)); }
        h = '<polygon points="' + pts.join(' ') + '"/>'; break;
      }
      case 'circle': h = '<circle r="' + r * 0.85 + '"/>'; break;
      case 'triangle': h = '<polygon points="0,' + (-r) + ' ' + (r * 0.95) + ',' + (r * 0.72) + ' ' + (-r * 0.95) + ',' + (r * 0.72) + '"/>'; break;
      case 'square': h = '<rect x="' + (-r * 0.78) + '" y="' + (-r * 0.78) + '" width="' + r * 1.56 + '" height="' + r * 1.56 + '" rx="' + r * 0.12 + '"/>'; break;
      case 'diamond': h = '<polygon points="0,' + (-r) + ' ' + (r * 0.75) + ',0 0,' + r + ' ' + (-r * 0.75) + ',0"/>'; break;
      case 'heart': h = '<path d="M0 ' + r * 0.9 + ' C' + (-r * 1.3) + ' ' + (-r * 0.1) + ' ' + (-r * 0.6) + ' ' + (-r * 1.05) + ' 0 ' + (-r * 0.35) + ' C' + r * 0.6 + ' ' + (-r * 1.05) + ' ' + r * 1.3 + ' ' + (-r * 0.1) + ' 0 ' + r * 0.9 + 'Z"/>'; break;
      case 'moon': h = '<path d="M' + r * 0.3 + ' ' + (-r * 0.95) + ' A' + r + ' ' + r + ' 0 1 0 ' + r * 0.3 + ' ' + r * 0.95 + ' A' + r * 0.75 + ' ' + r * 0.75 + ' 0 1 1 ' + r * 0.3 + ' ' + (-r * 0.95) + 'Z"/>'; break;
      case 'drop': h = '<path d="M0 ' + (-r) + ' C' + r * 0.4 + ' ' + (-r * 0.4) + ' ' + r * 0.85 + ' ' + r * 0.05 + ' ' + r * 0.85 + ' ' + r * 0.35 + ' A' + r * 0.85 + ' ' + r * 0.85 + ' 0 0 1 ' + (-r * 0.85) + ' ' + r * 0.35 + ' C' + (-r * 0.85) + ' ' + r * 0.05 + ' ' + (-r * 0.4) + ' ' + (-r * 0.4) + ' 0 ' + (-r) + 'Z"/>'; break;
      case 'cross': h = '<path d="M' + (-r * 0.3) + ' ' + (-r) + 'h' + r * 0.6 + 'v' + r * 0.7 + 'h' + r * 0.7 + 'v' + r * 0.6 + 'h' + (-r * 0.7) + 'v' + r * 0.7 + 'h' + (-r * 0.6) + 'v' + (-r * 0.7) + 'h' + (-r * 0.7) + 'v' + (-r * 0.6) + 'h' + r * 0.7 + 'Z"/>'; break;
      case 'hexagon': {
        var p6 = [];
        for (var k = 0; k < 6; k++) { var b = Math.PI / 6 + k * Math.PI / 3; p6.push((Math.cos(b) * r).toFixed(1) + ',' + (Math.sin(b) * r).toFixed(1)); }
        h = '<polygon points="' + p6.join(' ') + '"/>'; break;
      }
      case 'clover': h = '<circle cx="0" cy="' + (-r * 0.45) + '" r="' + r * 0.42 + '"/><circle cx="' + (-r * 0.45) + '" cy="' + r * 0.1 + '" r="' + r * 0.42 + '"/><circle cx="' + r * 0.45 + '" cy="' + r * 0.1 + '" r="' + r * 0.42 + '"/><rect x="' + (-r * 0.1) + '" y="' + r * 0.2 + '" width="' + r * 0.2 + '" height="' + r * 0.8 + '"/>'; break;
    }
    return '<g transform="' + t + '" fill="' + c + '" stroke="#fff" stroke-width="' + Math.max(1.5, r * 0.08) + '" stroke-linejoin="round">' + h + '</g>';
  }
  // ゛゜小 のしるし（字の ゛ は小さくて見えないので、線と丸で描く）
  function markBadge(mark, cx, cy, r) {
    var h = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#8d2a1f" stroke="#fffdf4" stroke-width="3"/>';
    if (mark === 'daku') {
      h += '<path d="M' + (cx - r * 0.38) + ' ' + (cy - r * 0.5) + ' l' + r * 0.2 + ' ' + r * 0.6 + ' M' + (cx + r * 0.12) + ' ' + (cy - r * 0.55) + ' l' + r * 0.2 + ' ' + r * 0.6 + '" stroke="#fff" stroke-width="' + r * 0.22 + '" stroke-linecap="round"/>';
    } else if (mark === 'han') {
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r * 0.42 + '" fill="none" stroke="#fff" stroke-width="' + r * 0.2 + '"/>';
    } else {
      h += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="' + Math.round(r * 1.15) + '" fill="#fff">小</text>';
    }
    return h;
  }
  function gojuon(cp) {
    var cols = cp.table.length, cw = 72, ch = 54, nw = 46;
    var tw = cols * cw + nw, x0 = 600 - tw / 2, y0 = 168;
    var h = '<rect x="' + (x0 - 6) + '" y="' + (y0 - 6) + '" width="' + (tw + 12) + '" height="' + (ch * 6 + 12) + '" rx="12" fill="#fffdf4" stroke="#5a3d1b" stroke-width="3"/>';
    // 列：右から あ・か・さ…（たて書きの表と同じ）。いちばん右は 行の番号
    for (var c = 0; c < cols; c++) {
      var x = x0 + (cols - 1 - c) * cw;
      h += '<rect x="' + x + '" y="' + y0 + '" width="' + cw + '" height="' + ch + '" fill="#f3e6c4"/>' + shape(cp.shapes[c], x + cw / 2, y0 + ch / 2, 19);
      for (var r = 0; r < 5; r++) {
        var k = cp.table[c].charAt(r);
        var yy = y0 + ch * (r + 1);
        h += '<rect x="' + x + '" y="' + yy + '" width="' + cw + '" height="' + ch + '" fill="none" stroke="#d6c39a" stroke-width="1"/>';
        if (k && k !== ' ') h += '<text x="' + (x + cw / 2) + '" y="' + (yy + ch / 2) + '" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="700" font-size="34" fill="' + INK + '">' + esc(k) + '</text>';
      }
    }
    var xn = x0 + cols * cw;
    h += '<rect x="' + xn + '" y="' + y0 + '" width="' + nw + '" height="' + ch + '" fill="#f3e6c4"/>';
    for (var rr = 0; rr < 5; rr++) {
      h += '<text x="' + (xn + nw / 2) + '" y="' + (y0 + ch * (rr + 1) + ch / 2) + '" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="30" fill="#8d2a1f">' + (rr + 1) + '</text>';
    }
    h += '<line x1="' + xn + '" y1="' + y0 + '" x2="' + xn + '" y2="' + (y0 + ch * 6) + '" stroke="#5a3d1b" stroke-width="2"/>' +
      '<line x1="' + x0 + '" y1="' + (y0 + ch) + '" x2="' + (x0 + tw) + '" y2="' + (y0 + ch) + '" stroke="#5a3d1b" stroke-width="2"/>';
    // 暗号（しるし＋数）
    var n = cp.codes.length, tile = Math.min(104, Math.floor(980 / n)), gap = Math.min(14, tile * 0.12), w = n * tile + (n - 1) * gap;
    var tx = 600 - w / 2, ty = 548;
    cp.codes.forEach(function (cd, i) {
      var x = tx + i * (tile + gap);
      h += '<rect x="' + x + '" y="' + ty + '" width="' + tile + '" height="' + (tile * 1.5) + '" rx="12" fill="#fffdf4" stroke="#5a3d1b" stroke-width="3"/>' +
        shape(cp.shapes[cd.col], x + tile / 2, ty + tile * 0.48, tile * 0.3) +
        '<text x="' + (x + tile / 2) + '" y="' + (ty + tile * 1.15) + '" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="' + Math.round(tile * 0.42) + '" fill="#8d2a1f">' + (cd.row + 1) + '</text>';
      if (cd.mark) h += markBadge(cd.mark, x + tile - 4, ty + 4, tile * 0.23);
    });
    return h;
  }

  // ---------- やじるし迷路 ----------
  function arrow(cp) {
    var n = cp.size, cell = n === 4 ? 118 : 98, gap = n === 4 ? 10 : 8, w = n * cell + (n - 1) * gap;
    var x0 = 600 - w / 2, y0 = 462 - w / 2;
    var h = '<rect x="' + (x0 - 18) + '" y="' + (y0 - 18) + '" width="' + (w + 36) + '" height="' + (w + 36) + '" rx="18" fill="#5a3d1b" opacity=".12"/>';
    var ROT = { r: 0, d: 90, l: 180, u: 270 };
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var c = cp.grid[y][x], px = x0 + x * (cell + gap), py = y0 + y * (cell + gap), cx = px + cell / 2, cy = py + cell / 2;
        h += '<rect x="' + px + '" y="' + py + '" width="' + cell + '" height="' + cell + '" rx="14" fill="' + (c.start ? '#ffe9a8' : '#fffdf4') + '" stroke="' + (c.start ? '#c8283c' : '#5a3d1b') + '" stroke-width="' + (c.start ? 6 : 3) + '"/>';
        // 字は上、矢印は下（となりのマスの矢印と 向かい合って見えないように、マスの まんなかに置く）
        var ky = py + cell * 0.42, ay = py + cell * 0.8;
        h += '<text x="' + cx + '" y="' + ky + '" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="' + Math.round(cell * 0.42) + '" fill="' + INK + '">' + esc(c.kana) + '</text>';
        if (c.dir === 'goal') {
          h += '<g transform="translate(' + cx + ' ' + ay + ')"><rect x="-34" y="-13" width="68" height="26" rx="13" fill="#2f8f4e"/>' +
            '<text x="0" y="1" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="17" fill="#fff">ゴール</text></g>';
        } else {
          var L = c.dir === 'u' || c.dir === 'd' ? 12 : 20;
          h += '<g transform="translate(' + cx + ' ' + ay + ') rotate(' + ROT[c.dir] + ')"><line x1="' + (-L) + '" y1="0" x2="' + (L - 6) + '" y2="0" stroke="#8d2a1f" stroke-width="6" stroke-linecap="round"/>' +
            '<polygon points="' + (L + 6) + ',0 ' + (L - 9) + ',-10 ' + (L - 9) + ',10" fill="#8d2a1f"/></g>';
        }
        if (c.start) {
          h += '<g transform="translate(' + cx + ' ' + (py + 1) + ')"><rect x="-50" y="-15" width="100" height="30" rx="15" fill="#c8283c"/>' +
            '<text x="0" y="1" text-anchor="middle" dominant-baseline="central" font-family="' + FONT + '" font-weight="900" font-size="18" fill="#fff">スタート</text></g>';
        }
      }
    }
    return h;
  }

  // ---------- 外から入れた画像（Googleドライブ・写真） ----------
  // ドライブの共有リンクは、そのままでは画像として出せない。ファイルIDを取り出して縮小画像のURLにする
  function driveId(u) {
    var m = String(u || '').match(/\/file\/d\/([\w-]{20,})/) || String(u || '').match(/[?&]id=([\w-]{20,})/) || String(u || '').match(/\/d\/([\w-]{20,})/);
    return m ? m[1] : '';
  }
  function imageSrc(u) {
    u = String(u || '').trim();
    if (/^data:image\//.test(u)) return u;
    var id = /drive\.google\.com|docs\.google\.com|googleusercontent\.com/.test(u) ? driveId(u) : '';
    if (id) return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w2000';
    return /^https:\/\//.test(u) ? u : '';
  }
  function imageAlt(u) { var id = driveId(u); return id ? 'https://lh3.googleusercontent.com/d/' + id + '=w2000' : ''; }
  function imageHtml(u) {
    var src = imageSrc(u);
    if (!src) return '<div class="ncard-img err">画像が読めません</div>';
    var alt = imageAlt(u);
    return '<div class="ncard-img"><img src="' + esc(src) + '" alt="暗号カード" referrerpolicy="no-referrer"' +
      (alt ? ' onerror="if(!this.dataset.alt){this.dataset.alt=1;this.src=\'' + esc(alt) + '\'}else{this.parentNode.classList.add(\'err\');this.replaceWith(document.createTextNode(\'画像が読めません（共有の設定を「リンクを知っている全員」に）\'))}"' : '') + '></div>';
  }

  // ---------- 入口 ----------
  // cp＝cardPuzzle の結果。no＝カードの番号（1・2）
  // opts.theme＝'parchment'|'space'、opts.glyphs＝logic.js の ALIEN_GLYPHS（宇宙文字のカードで使う）
  function svg(cp, no, opts) {
    if (!cp || !cp.ok) return '';
    opts = opts || {};
    TH = THEMES[opts.theme] || THEMES.parchment;
    var id = ++uid;
    var body = cp.kind === 'mirror' ? mirror(cp) : cp.kind === 'tanuki' ? tanuki(cp) : cp.kind === 'gojuon' ? gojuon(cp) : cp.kind === 'arrow' ? arrow(cp) :
      cp.kind === 'alien' ? alien(cp, opts.glyphs || (root.NazoLogic && root.NazoLogic.ALIEN_GLYPHS) || []) : '';
    var out = frame(no || 1, CARD_TEXT[cp.kind] || '', body, id);
    TH = THEMES.parchment;
    return out;
  }

  var api = { svg: svg, glyphSvg: glyphSvg, THEMES: THEMES, CARD_TEXT: CARD_TEXT, imageSrc: imageSrc, imageHtml: imageHtml, driveId: driveId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NazoCards = api;
})(this);
