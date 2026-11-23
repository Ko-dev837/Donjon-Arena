window.G = window.G || {};
/* =====================================================================
   js/net/qr.js — petit générateur de QR code (sans dépendance)
   G.QR.matrix(texte) → tableau 2D de booléens (true = module noir)
   G.QR.svg(texte, { size, dark, light, margin }) → chaîne SVG
   Mode octet (UTF-8), correction d'erreur niveau M, versions 1 à 10,
   choix automatique du meilleur des 8 masques (algorithme standard ISO 18004).
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;

  // --- Reed-Solomon sur GF(256), polynôme 0x11D ---
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsDivisor(deg) {
    let r = [1];
    for (let i = 0; i < deg; i++) {
      const n = new Array(r.length + 1).fill(0);
      for (let j = 0; j < r.length; j++) { n[j] ^= r[j]; n[j + 1] ^= mul(r[j], EXP[i]); }
      r = n;
    }
    return r.slice(1);
  }
  function rsRemainder(data, div) {
    const res = new Array(div.length).fill(0);
    for (const b of data) {
      const f = b ^ res.shift(); res.push(0);
      for (let i = 0; i < div.length; i++) res[i] ^= mul(div[i], f);
    }
    return res;
  }

  // --- tables niveau M, versions 1..10 : [codewords d'ECC par bloc, nb blocs] ---
  const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  function rawModules(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_M[v] * BLOCKS_M[v];

  function utf8(s) { return Array.from(unescape(encodeURIComponent(String(s)))).map(c => c.charCodeAt(0)); }

  function encode(text) {
    const bytes = utf8(text);
    let v = 1;
    for (; v <= 10; v++) { const cap = dataCodewords(v) * 8; if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) break; }
    if (v > 10) throw new Error('texte trop long pour le QR code');
    // flux de bits
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(v) * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    // blocs + ECC, entrelacement
    const nb = BLOCKS_M[v], ecl = ECC_M[v], raw = Math.floor(rawModules(v) / 8);
    const shortN = nb - (raw % nb), shortLen = Math.floor(raw / nb);
    const div = rsDivisor(ecl), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const len = shortLen - ecl + (i < shortN ? 0 : 1);
      const d = data.slice(k, k + len); k += len;
      const e = rsRemainder(d, div);
      if (i < shortN) d.push(0);
      blocks.push(d.concat(e));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= shortN) out.push(b[i]); });
    return { v, codewords: out };
  }

  function build(v, codewords, mask) {
    const n = v * 4 + 17;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const fn = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= n || y >= n) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    const al = ALIGN[v];
    for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // zones de format (réservées) + module sombre
    const fmt = (bitsVal) => {
      for (let i = 0; i <= 5; i++) set(8, i, ((bitsVal >>> i) & 1) === 1);
      set(8, 7, ((bitsVal >>> 6) & 1) === 1); set(8, 8, ((bitsVal >>> 7) & 1) === 1); set(7, 8, ((bitsVal >>> 8) & 1) === 1);
      for (let i = 9; i < 15; i++) set(14 - i, 8, ((bitsVal >>> i) & 1) === 1);
      for (let i = 0; i < 8; i++) set(n - 1 - i, 8, ((bitsVal >>> i) & 1) === 1);
      for (let i = 8; i < 15; i++) set(8, n - 15 + i, ((bitsVal >>> i) & 1) === 1);
      set(8, n - 8, true);
    };
    const fmtBits = (() => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); return ((d << 10) | r) ^ 0x5412; })(); // M = 00
    fmt(fmtBits);
    if (v >= 7) {
      let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const vb = (v << 12) | r;
      for (let i = 0; i < 18; i++) { const b = ((vb >>> i) & 1) === 1, a = n - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
    }
    // données en zigzag
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) { m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    // masque
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    return m;
  }

  function penalty(m) {
    const n = m.length; let p = 0;
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const c = pass ? m[b][a] : m[a][b], pv = pass ? m[b - 1][a] : m[a][b - 1];
        if (c === pv) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    let dark = 0; m.forEach(r => r.forEach(c => { if (c) dark++; }));
    p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  }

  function matrix(text) {
    const { v, codewords } = encode(text);
    let best = null, bestP = Infinity;
    for (let mask = 0; mask < 8; mask++) { const mm = build(v, codewords, mask), pp = penalty(mm); if (pp < bestP) { bestP = pp; best = mm; } }
    return best;
  }

  function svg(text, o) {
    o = o || {};
    const m = matrix(text), n = m.length, q = o.margin != null ? o.margin : 4, s = n + q * 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    const size = o.size || 180;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR code">'
      + '<rect width="' + s + '" height="' + s + '" fill="' + (o.light || '#ffffff') + '"/><path d="' + d + '" fill="' + (o.dark || '#000000') + '"/></svg>';
  }

  G.QR = { matrix, svg };
})();
