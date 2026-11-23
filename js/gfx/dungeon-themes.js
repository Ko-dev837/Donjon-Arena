window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v5 « Ténèbres » — js/gfx/dungeon-themes.js (agent 5, Dungeon Designer)
   Architectures de donjon UNIQUES enregistrées via G.GFX.registerTheme(id, {theme, build(opts)}).
   Chaque architecture a sa propre géométrie, ses matériaux, son éclairage (très faible, coloré, vacillant),
   ses accessoires, ses pièges animés et ses layouts (couloirs, salles en L, ponts, fosses, alcôves...).

   build({half:14, layout, seed, roomType, variant}) -> room v2 (CONTRACT.md) +
     lights:[THREE.PointLight] (≤4)       flicker(level 0..1)        blackout(seconds)      setLightLevel(k)
     anchors:{shadows:[[x,z]], sounds:[[x,z]], statues:[Group]}   (statue.userData = {x,z,obstacle,kind})
     mech:{...} poignées pour js/sys/events.js (lustres, rails, niches, eau, canaux, évents, ...)
     secretSpots:{wall:[{x,z,side}], lever:[[x,z]], symbol:[[x,z]]}   archi, layout, layouts, dispose()
   G.DungeonThemes = { ids(), layouts(id), describe(id), has(id), build(id, opts) }
   Layouts : chaque architecture a ses propres noms ; 'boss' et 'secret' existent partout ;
   les anciens noms v2 'arena' / 'pillars' / 'cross' sont convertis vers les layouts de l'architecture.
   ===================================================================== */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T) { console.error('[dungeon-themes] THREE introuvable'); return; }
  const PI = Math.PI, TAU = PI * 2, HPI = PI / 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hasDoc = typeof document !== 'undefined' && !!document.createElement;

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    s = String(s); let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const _ca = new T.Color(), _cb = new T.Color();
  function shade(hex, f) { _ca.setHex(hex); if (f >= 0) _ca.lerp(_cb.setHex(0xffffff), f); else _ca.multiplyScalar(1 + f); return _ca.getHex(); }
  function mix(a, b, t) { return _ca.setHex(a).lerp(_cb.setHex(b), t).getHex(); }
  const jit = (hex, rnd, amt) => shade(hex, (rnd() - 0.5) * 2 * amt);
  // éclaircit les palettes très sombres (teinte conservée) : sans ça le shading toon les écrase au noir
  const LIFT = {};
  function lift(hex) {
    if (typeof hex !== 'number') return hex;
    const k = LIFT[hex]; if (k !== undefined) return k;
    _ca.setHex(hex);
    const l = Math.max(_ca.r, _ca.g, _ca.b);
    const f = l < 0.5 ? 1 + 0.55 * (1 - l / 0.5) + 0.2 : 1.12;
    _ca.r = Math.min(1, _ca.r * f + 0.025); _ca.g = Math.min(1, _ca.g * f + 0.025); _ca.b = Math.min(1, _ca.b * f + 0.03);
    return (LIFT[hex] = _ca.getHex());
  }
  function css(hex, a) { _ca.setHex(hex); return 'rgba(' + Math.round(_ca.r * 255) + ',' + Math.round(_ca.g * 255) + ',' + Math.round(_ca.b * 255) + ',' + (a == null ? 1 : a) + ')'; }

  // ------------------------------------------------------------------ matériaux partagés
  const SH = (m) => { if (m) { m.userData = m.userData || {}; m.userData.shared = true; } return m; };
  function toon(c, o) {
    if (G.GFX && G.GFX.toon) return G.GFX.toon(c, o);
    const p = { color: c }; if (o && o.vertexColors) p.vertexColors = true;
    return new T.MeshLambertMaterial(p);
  }
  const MAT = {};
  const envMat = () => MAT.env || (MAT.env = SH(toon(0xffffff, { vertexColors: true })));
  const outMat = () => MAT.out || (MAT.out = SH(new T.MeshBasicMaterial({ color: 0x000000, side: T.BackSide })));
  const BASIC = {};
  function basic(color, op, add, side) {
    const k = color + '|' + op + '|' + (add ? 1 : 0) + '|' + (side || 0);
    if (BASIC[k]) return BASIC[k];
    const p = { color };
    if (op != null && op < 1) { p.transparent = true; p.opacity = op; p.depthWrite = false; }
    if (add) { p.blending = T.AdditiveBlending; p.transparent = true; p.depthWrite = false; }
    if (side) p.side = side;
    return (BASIC[k] = SH(new T.MeshBasicMaterial(p)));
  }

  // ------------------------------------------------------------------ géométries partagées (unitaires)
  const GEO = {};
  const gk = (k, f) => GEO[k] || (GEO[k] = SH(f()));
  const G_BOX = gk('box', () => new T.BoxGeometry(1, 1, 1));
  const G_CYL = gk('cyl', () => new T.CylinderGeometry(1, 1, 1, 10));
  const G_CYL6 = gk('cyl6', () => new T.CylinderGeometry(1, 1, 1, 6));
  const G_CYL4 = gk('cyl4', () => new T.CylinderGeometry(1, 1, 1, 4));
  const G_CONE = gk('cone', () => new T.ConeGeometry(1, 1, 8));
  const G_CONE4 = gk('cone4', () => new T.ConeGeometry(1, 1, 4));
  const G_SPH = gk('sph', () => new T.SphereGeometry(1, 10, 7));
  const G_SPH_LO = gk('sphlo', () => new T.SphereGeometry(1, 6, 4));
  const G_HEMI = gk('hemi', () => new T.SphereGeometry(1, 10, 5, 0, TAU, 0, HPI));
  const G_DODE = gk('dode', () => new T.DodecahedronGeometry(1, 0));
  const G_ICO = gk('ico', () => new T.IcosahedronGeometry(1, 0));
  const G_OCTA = gk('octa', () => new T.OctahedronGeometry(1, 0));
  const G_TETRA = gk('tetra', () => new T.TetrahedronGeometry(1, 0));
  const G_PLANE = gk('plane', () => new T.PlaneGeometry(1, 1));
  const G_FLAT = gk('flat', () => { const g = new T.PlaneGeometry(1, 1); g.rotateX(-HPI); return g; });
  const G_DISC = gk('disc', () => { const g = new T.CircleGeometry(1, 20); g.rotateX(-HPI); return g; });
  const torus = (tube, arc, seg) => gk('tor' + tube + '|' + (arc || TAU) + '|' + (seg || 14), () => new T.TorusGeometry(1, tube, 5, seg || 14, arc || TAU));
  const cylT = (top, seg) => gk('cylT' + top + '|' + (seg || 8), () => new T.CylinderGeometry(top, 1, 1, seg || 8));
  const ringG = (inner, seg) => gk('ring' + inner + '|' + (seg || 32), () => { const g = new T.RingGeometry(inner, 1, seg || 32); g.rotateX(-HPI); return g; });

  // ------------------------------------------------------------------ fusion de pièces (copie de graphics.js)
  const _m4 = new T.Matrix4(), _m4b = new T.Matrix4(), _m3 = new T.Matrix3();
  const _q = new T.Quaternion(), _eu = new T.Euler(), _va = new T.Vector3(), _vb = new T.Vector3(), _col = new T.Color();
  const NI = new WeakMap();
  const FLIP = [0, 2, 1];
  function nonIdx(g) {
    let n = NI.get(g);
    if (!n) { n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); NI.set(g, n); }
    return n;
  }
  function bbox(g) { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox; }
  function inflateF(size, s, t) { const S = size * Math.abs(s || 1); return S > 1e-4 ? Math.min(1 + 2 * t / S, 1.7) : 1; }
  function mergePieces(list, mode, t) {
    const outline = mode === 'outline';
    let n = 0;
    for (const p of list) { if (outline && !p.ol) continue; n += nonIdx(p.g).attributes.position.count; }
    if (!n) return null;
    const pos = new Float32Array(n * 3);
    const nor = outline ? null : new Float32Array(n * 3);
    const col = outline ? null : new Float32Array(n * 3);
    let o = 0;
    for (const p of list) {
      if (outline && !p.ol) continue;
      const g = nonIdx(p.g);
      const pa = g.attributes.position.array, na = g.attributes.normal ? g.attributes.normal.array : null;
      const cnt = g.attributes.position.count;
      _eu.set(p.r[0], p.r[1], p.r[2], 'XYZ'); _q.setFromEuler(_eu);
      _m4.compose(_va.set(p.p[0], p.p[1], p.p[2]), _q, _vb.set(p.s[0], p.s[1], p.s[2]));
      if (outline) {
        const bb = bbox(p.g), tt = p.ot != null ? p.ot : t;
        const fx = inflateF(bb.max.x - bb.min.x, p.s[0], tt), fy = inflateF(bb.max.y - bb.min.y, p.s[1], tt), fz = inflateF(bb.max.z - bb.min.z, p.s[2], tt);
        _m4b.makeScale(fx, fy, fz);
        _m4b.setPosition((bb.max.x + bb.min.x) * 0.5 * (1 - fx), (bb.max.y + bb.min.y) * 0.5 * (1 - fy), (bb.max.z + bb.min.z) * 0.5 * (1 - fz));
        _m4.multiply(_m4b);
      } else { _m3.getNormalMatrix(_m4); _col.setHex(p.c); }
      const e = _m4.elements, m = _m3.elements;
      const flip = p.s[0] * p.s[1] * p.s[2] < 0;
      for (let i = 0; i < cnt; i++) {
        const k = flip ? (i - (i % 3)) + FLIP[i % 3] : i;
        const x = pa[k * 3], y = pa[k * 3 + 1], z = pa[k * 3 + 2], j = o * 3;
        pos[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (!outline) {
          const nx = na ? na[k * 3] : 0, ny = na ? na[k * 3 + 1] : 1, nz = na ? na[k * 3 + 2] : 0;
          const X = m[0] * nx + m[3] * ny + m[6] * nz, Y = m[1] * nx + m[4] * ny + m[7] * nz, Z = m[2] * nx + m[5] * ny + m[8] * nz;
          const L = Math.sqrt(X * X + Y * Y + Z * Z) || 1;
          nor[j] = X / L; nor[j + 1] = Y / L; nor[j + 2] = Z / L;
          col[j] = _col.r; col[j + 1] = _col.g; col[j + 2] = _col.b;
        }
        o++;
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    if (nor) { geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3)); }
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
  class Batch {
    constructor() { this.list = []; }
    add(g, c, p, s, r, ol, ot) { this.list.push({ g, c: lift(c), p, s: typeof s === 'number' ? [s, s, s] : s, r: r || [0, 0, 0], ol: ol !== false, ot }); }
    build(mat, olT) {
      if (!this.list.length) return null;
      const g = mergePieces(this.list, 'solid');
      const mesh = new T.Mesh(g, mat);
      const og = mergePieces(this.list, 'outline', olT != null ? olT : 0.045);
      const out = og ? new T.Mesh(og, outMat()) : null;
      if (out) out.userData.isOutline = true;
      return { mesh, out };
    }
  }

  // ------------------------------------------------------------------ textures (canvas, mises en cache)
  const TEX = {};
  function canvasTex(key, w, h, paint) {
    if (TEX[key] !== undefined) return TEX[key];
    if (!hasDoc) return (TEX[key] = null);
    try {
      const c = document.createElement('canvas'); c.width = w; c.height = h || w;
      const g = c.getContext('2d');
      if (!g) return (TEX[key] = null);
      paint(g, c.width, c.height);
      const t = new T.CanvasTexture(c);
      t.userData = t.userData || {}; t.userData.shared = true;
      return (TEX[key] = t);
    } catch (e) { return (TEX[key] = null); }
  }
  const puffTex = () => canvasTex('puff', 64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const fadeTex = () => canvasTex('fade', 8, 64, (g) => {
    const gr = g.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 8, 64);
  });
  // utilitaires de peinture
  const P2 = {
    noise(g, w, h, rnd, n, cols, smin, smax, alpha) {
      for (let i = 0; i < n; i++) {
        g.fillStyle = css(cols[Math.floor(rnd() * cols.length)], alpha == null ? 0.35 : alpha);
        const s = smin + rnd() * (smax - smin);
        g.fillRect(rnd() * w, rnd() * h, s, s);
      }
    },
    blobs(g, w, h, rnd, n, col, rmin, rmax, alpha) {
      for (let i = 0; i < n; i++) {
        g.fillStyle = css(col, alpha == null ? 0.25 : alpha);
        g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rmin + rnd() * (rmax - rmin), (rmin + rnd() * (rmax - rmin)) * (0.5 + rnd() * 0.5), rnd() * PI, 0, TAU); g.fill();
      }
    },
    cracks(g, w, h, rnd, n, col, width, alpha) {
      g.strokeStyle = css(col, alpha == null ? 0.6 : alpha); g.lineWidth = width || 1.5;
      for (let i = 0; i < n; i++) {
        let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y);
        const k = 3 + Math.floor(rnd() * 5);
        for (let j = 0; j < k; j++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
        g.stroke();
      }
    },
    tiles(g, w, h, n, colA, colB, grout, rnd, jitAmt) {
      const s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const base = (i + j) % 2 ? colA : colB;
        g.fillStyle = css(rnd ? jit(base, rnd, jitAmt || 0.06) : base, 1);
        g.fillRect(i * s, j * s, s, s);
      }
      if (grout != null) { g.strokeStyle = css(grout, 0.8); g.lineWidth = 2; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); } }
    },
    flags(g, w, h, rnd, rows, col, grout, jitAmt) {
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rnd() * 40;
        while (x < w) {
          const len = 30 + rnd() * 50;
          g.fillStyle = css(jit(col, rnd, jitAmt || 0.08), 1); g.fillRect(x, r * rh, len, rh);
          g.strokeStyle = css(grout, 0.9); g.lineWidth = 2; g.strokeRect(x, r * rh, len, rh);
          x += len;
        }
      }
    },
    planks(g, w, h, rnd, n, col, gap) {
      const s = w / n;
      for (let i = 0; i < n; i++) {
        let y = -rnd() * 80;
        while (y < h) { const L = 60 + rnd() * 120; g.fillStyle = css(jit(col, rnd, 0.09), 1); g.fillRect(i * s, y, s - 2, L - 2); g.fillStyle = css(gap, 0.9); g.fillRect(i * s, y + L - 2, s, 2); y += L; }
        g.fillStyle = css(gap, 0.9); g.fillRect(i * s + s - 2, 0, 2, h);
      }
    },
    vignette(g, w, h, alpha) {
      const gr = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.72);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + (alpha == null ? 0.55 : alpha) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    },
  };

  // ------------------------------------------------------------------ contexte de construction
  const LEGACY_LAYOUT = { arena: 0, pillars: 1, cross: 2 };
  function pickLayout(def, layout, seed) {
    const L = def.layouts;
    if (layout === 'boss' || layout === 'secret') return layout;
    if (L.indexOf(layout) >= 0) return layout;
    if (LEGACY_LAYOUT[layout] != null) return L[LEGACY_LAYOUT[layout] % L.length];
    return L[seed % L.length];
  }
  function makeCtx(id, def, opts) {
    opts = opts || {};
    const half = opts.half || 14;
    const seed = (typeof opts.seed === 'number' && isFinite(opts.seed) ? Math.floor(Math.abs(opts.seed)) : hashStr(opts.seed == null ? id : opts.seed)) >>> 0;
    const layout = pickLayout(def, opts.layout, seed);
    const rnd = mulberry32(seed ^ hashStr(id + '|' + layout));
    const group = new T.Group(); group.name = 'room_' + id;
    const ctx = {
      id, def, P: def.palette || {}, half, layout, seed, rnd, group, variant: opts.variant || null, roomType: opts.roomType || null,
      B: new Batch(), GB: new Batch(), obstacles: [], hazards: [], anims: [], owned: [], reserved: [], lights: [],
      anchors: { shadows: [], sounds: [], statues: [] }, mech: {}, secretSpots: { wall: [], lever: [], symbol: [] },
      playerStart: [0, half - 3], H: def.wallH || 2.4, glowMat: null, lightLevel: 1, horror: 0, blackoutT: 0,
    };
    ctx.glowMat = new T.MeshBasicMaterial({ vertexColors: true }); ctx.owned.push(ctx.glowMat);
    ctx.r = (a, b) => a + rnd() * (b - a);
    ctx.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    ctx.obs = (x, z, hw, hd) => { const o = { x, z, hw, hd }; ctx.obstacles.push(o); return o; };
    ctx.reserve = (x, z, r) => ctx.reserved.push([x, z, r]);
    ctx.free = (x, z, r, o) => isFree(ctx, x, z, r, o);
    ctx.add = (g, c, p, s, r, ol, ot) => {
      // mur sud (côté caméra) : écrasé pour ne jamais masquer le héros
      if (ctx.southCap && p && p[2] > ctx.half - 2.2) {
        const sy = typeof s === 'number' ? s : (s ? s[1] : 1), cap = ctx.southCap;
        const top = p[1] + sy * 0.5;
        if (top > cap) { const k = cap / Math.max(top, 1e-3); s = typeof s === 'number' ? [s, s * k, s] : [s[0], s[1] * k, s[2]]; p = [p[0], p[1] * k, p[2]]; }
      }
      return ctx.B.add(g, c, p, s, r, ol, ot);
    };
    ctx.glow = (g, c, p, s, r, ol) => ctx.GB.add(g, c, p, s, r, ol === true);
    ctx.box = (c, x, y, z, sx, sy, sz, ry, ol) => ctx.B.add(G_BOX, c, [x, y, z], [sx, sy, sz], [0, ry || 0, 0], ol);
    ctx.gbox = (c, x, y, z, sx, sy, sz, ry) => ctx.GB.add(G_BOX, c, [x, y, z], [sx, sy, sz], [0, ry || 0, 0], false);
    ctx.cyl = (c, x, y, z, r, h, g, ol) => ctx.B.add(g || G_CYL, c, [x, y, z], [r, h, r], [0, rnd() * PI, 0], ol);
    ctx.anim = (fn) => ctx.anims.push(fn);
    ctx.own = (...xs) => { xs.forEach((x) => { if (x) ctx.owned.push(x); }); };
    ctx.wpos = (side, u, n) => wpos(ctx, side, u, n);
    return ctx;
  }
  function isFree(ctx, x, z, r, o) {
    o = o || {};
    const h = ctx.half;
    if (Math.abs(x) > h - 0.6 - r || Math.abs(z) > h - 0.6 - r) return false;
    for (const ob of ctx.obstacles) if (Math.abs(x - ob.x) < ob.hw + r && Math.abs(z - ob.z) < ob.hd + r) return false;
    if (!o.allowHazard) for (const hz of ctx.hazards) if (Math.hypot(x - hz.x, z - hz.z) < hz.r + r) return false;
    if (!o.allowStart && Math.hypot(x - ctx.playerStart[0], z - ctx.playerStart[1]) < 2.8 + r) return false;
    if (!o.allowCenter && Math.hypot(x, z) < 3.6 + r) return false;
    if (!o.allowDoor && Math.abs(x) < 3 + r && z < -h + 5 + r) return false;
    if (!o.allowReserved) for (const rs of ctx.reserved) if (Math.hypot(x - rs[0], z - rs[1]) < rs[2] + r) return false;
    return true;
  }
  // position le long d'un mur (u = abscisse le long du mur, n = distance vers l'intérieur)
  function wpos(ctx, side, u, n) {
    const h = ctx.half;
    switch (side) {
      case 'N': return [u, -h + n];
      case 'S': return [u, h - n];
      case 'W': return [-h + n, u];
      default: return [h - n, u];
    }
  }
  const sideRy = (side) => (side === 'N' ? 0 : side === 'S' ? PI : side === 'W' ? HPI : -HPI); // regarde vers l'intérieur (+Z local)
  // pièce de mur alignée (su = le long, sn = épaisseur)
  function wallBox(ctx, side, u, n, y, su, sy, sn, c, ol, B) {
    const p = wpos(ctx, side, u, n), along = side === 'N' || side === 'S';
    (B || ctx.B).add(G_BOX, c, [p[0], y, p[1]], along ? [su, sy, sn] : [sn, sy, su], [0, 0, 0], ol);
  }
  // segments de mur : sud bas, nord coupé par la porte (|x| < 2.9)
  function perimeter(ctx, segFn) {
    const h = ctx.half;
    const sides = { N: [[-h - 1, -2.9], [2.9, h + 1]], W: [[-h - 1, h + 1]], E: [[-h - 1, h + 1]], S: [[-h - 1, h + 1]] };
    for (const side in sides) for (const [u0, u1] of sides[side]) { ctx.southCap = side === 'S' ? 0.7 : 0; segFn(ctx, side, u0, u1, side === 'S' ? Math.min(0.65, (ctx.def.southH || 1.0) * 0.6) : ctx.H); }
    ctx.southCap = 0;
    ctx.obs(-(h + 0.5), 0, 0.5, h + 1); ctx.obs(h + 0.5, 0, 0.5, h + 1); ctx.obs(0, h + 0.5, h + 1, 0.5);
    const nw = (h - 1) / 2;
    ctx.obs(-(h + 3) / 2, -(h + 0.5), nw, 0.5); ctx.obs((h + 3) / 2, -(h + 0.5), nw, 0.5);
  }
  // découpe un segment [u0,u1] en blocs irréguliers
  function runBlocks(ctx, u0, u1, lmin, lmax, fn) {
    let u = u0;
    while (u < u1 - 0.05) {
      let len = lmin + ctx.rnd() * (lmax - lmin);
      if (u + len > u1 - lmin * 0.4) len = u1 - u;
      fn(u + len / 2, len);
      u += len;
    }
  }

  // ------------------------------------------------------------------ sol + extérieur
  function buildFloor(ctx) {
    const def = ctx.def, h = ctx.half;
    const v = ctx.seed % 2;
    const map = def.floor ? canvasTex('floor_' + ctx.id + '_' + v, 512, 512, (g, w, hh) => def.floor(g, w, hh, mulberry32(hashStr(ctx.id) + v * 97), v)) : null;
    const emis = def.floorGlow ? canvasTex('floorE_' + ctx.id + '_' + v, 256, 256, (g, w, hh) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, hh); def.floorGlow(g, w, hh, mulberry32(hashStr(ctx.id) + v * 97 + 1), v); }) : null;
    const o = { map: map || null };
    if (emis) { o.emissiveMap = emis; o.emissive = 0xffffff; o.emissiveIntensity = 1; }
    const fm = toon(map ? 0xffffff : (ctx.P.floor || 0x333333), o);
    if (emis) { fm.emissive.setHex(0xffffff); fm.emissiveIntensity = 1; }
    if (map && fm.color) fm.color.setScalar(1.45);
    const fg = new T.PlaneGeometry(h * 2, h * 2); fg.rotateX(-HPI);
    const floor = new T.Mesh(fg, fm); floor.receiveShadow = true; floor.name = 'floor';
    ctx.group.add(floor); ctx.own(fg, fm);
    ctx.floorMat = fm;
    const og = new T.PlaneGeometry(h * 2 + 80, h * 2 + 80); og.rotateX(-HPI);
    const om = def.outerGlow ? new T.MeshBasicMaterial({ color: ctx.P.outer || 0x000000 }) : toon(ctx.P.outer || 0x050505);
    const outer = new T.Mesh(og, om); outer.position.y = -0.06; ctx.group.add(outer); ctx.own(og, om);
    ctx.outerMat = om;
  }

  // ------------------------------------------------------------------ porte nord (styles : bois, grille, dalle, membrane, voile)
  function buildDoor(ctx, style) {
    const P = ctx.P, h = ctx.half, z = -(h + 0.5), top = Math.max(ctx.H, 2.3) + 0.5;
    const frame = P.doorFrame || 0x3a3a44, B = ctx.B;
    style = style || P.doorStyle || 'bois';
    for (const sx of [1, -1]) {
      B.add(G_BOX, frame, [sx * 2.45, top / 2, z], [0.9, top, 1.4]);
      B.add(G_BOX, shade(frame, 0.12), [sx * 2.45, top + 0.08, z], [1.1, 0.16, 1.55]);
    }
    B.add(G_BOX, frame, [0, top + 0.35, z], [5.8, 0.7, 1.4]);
    if (P.doorKey != null) ctx.glow(G_OCTA, P.doorKey, [0, top + 0.35, z + 0.72], [0.3, 0.3, 0.08]);
    // couloir sombre
    const cz = -(h + 4);
    for (const sx of [1, -1]) B.add(G_BOX, shade(P.wall || 0x333333, -0.45), [sx * 2.7, (ctx.H + 0.4) / 2, cz], [0.7, ctx.H + 0.4, 6]);
    const dm = new T.MeshBasicMaterial({ map: fadeTex() || null, color: 0x000000, transparent: true, depthWrite: false, opacity: fadeTex() ? 1 : 0.85 });
    const dark = new T.Mesh(G_FLAT, dm); dark.scale.set(4.8, 1, 7.2); dark.position.set(0, 0.03, cz + 0.3); dark.renderOrder = 1; ctx.group.add(dark); ctx.own(dm);
    // battant
    const doorG = new T.Group(); doorG.position.set(0, 0, -(h + 0.35));
    const DB = new Batch(), wood = P.doorWood || 0x4a2e1a, band = P.doorBand || 0x2a2a30;
    if (style === 'grille') {
      for (let i = 0; i < 9; i++) DB.add(G_CYL6, band, [-1.85 + i * 0.46, top / 2, 0], [0.06, top - 0.1, 0.06]);
      for (const y of [0.4, top / 2, top - 0.4]) DB.add(G_BOX, band, [0, y, 0], [4.0, 0.14, 0.14]);
      for (let i = 0; i < 9; i++) DB.add(G_CONE, band, [-1.85 + i * 0.46, 0.05, 0], [0.09, 0.3, 0.09], [PI, 0, 0]);
    } else if (style === 'dalle') {
      DB.add(G_BOX, wood, [0, top / 2, 0], [4.0, top - 0.04, 0.5]);
      DB.add(G_BOX, shade(wood, -0.2), [0, top / 2, 0.27], [3.2, top - 0.6, 0.05], null, false);
    } else if (style === 'membrane') {
      DB.add(G_SPH, wood, [0, top / 2, 0], [2.1, top / 2, 0.35]);
      for (let i = 0; i < 6; i++) DB.add(G_CYL6, band, [-1.5 + i * 0.6, top / 2, 0.28], [0.05, top * 0.8, 0.05], [0, 0, (i - 2.5) * 0.12], false);
    } else if (style === 'voile') {
      DB.add(G_BOX, band, [0, 0.12, 0], [4.0, 0.24, 0.4]);
      DB.add(G_BOX, band, [0, top - 0.1, 0], [4.0, 0.2, 0.4]);
    } else {
      const pw = 4.0 / 5;
      for (let i = 0; i < 5; i++) DB.add(G_BOX, i % 2 ? wood : shade(wood, -0.12), [-2 + pw * (i + 0.5), top / 2 - 0.02, 0], [pw - 0.03, top - 0.04, 0.28]);
      for (const y of [0.45, top / 2, top - 0.45]) DB.add(G_BOX, band, [0, y, 0.02], [4.02, 0.2, 0.34]);
    }
    const db = DB.build(envMat(), 0.04);
    if (db) { doorG.add(db.mesh); if (db.out) doorG.add(db.out); ctx.own(db.mesh.geometry, db.out && db.out.geometry); }
    let veil = null;
    if (style === 'voile') {
      const vm = new T.MeshBasicMaterial({ color: P.doorKey || 0x9a6bff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      veil = new T.Mesh(G_PLANE, vm); veil.scale.set(3.9, top - 0.3, 1); veil.position.y = top / 2; doorG.add(veil); ctx.own(vm);
    }
    ctx.group.add(doorG);
    // lueur d'ouverture + flèches
    const gm = new T.MeshBasicMaterial({ color: P.doorOpen || 0x5dff7a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const portal = new T.Mesh(G_PLANE, gm); portal.scale.set(3.9, top, 1); portal.position.set(0, top / 2, z - 0.1);
    const am = new T.MeshBasicMaterial({ color: P.doorOpen || 0x6dff8a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    const arrowG = gk('arrowG', () => { const s = new T.Shape(); s.moveTo(0, 1); s.lineTo(0.75, 0.15); s.lineTo(0.3, 0.15); s.lineTo(0.3, -0.85); s.lineTo(-0.3, -0.85); s.lineTo(-0.3, 0.15); s.lineTo(-0.75, 0.15); s.lineTo(0, 1); const g = new T.ShapeGeometry(s); g.rotateX(-HPI); return g; });
    const arrows = [0, 1].map((i) => { const m = new T.Mesh(arrowG, am); m.position.set(0, 0.05, -h + 2.6 + i * 1.9); m.scale.setScalar(i ? 0.75 : 1.05); m.renderOrder = 2; return m; });
    const fx = new T.Group(); fx.add(portal, arrows[0], arrows[1]); fx.visible = false; ctx.group.add(fx);
    ctx.own(gm, am);
    const obstacle = ctx.obs(0, -(h + 0.5), 2.0, 0.5);
    const st = { target: 0, p: 0 };
    ctx.anim((dt, t) => {
      if (st.p < st.target) st.p = Math.min(st.target, st.p + dt * 1.05); else if (st.p > st.target) st.p = Math.max(st.target, st.p - dt * 1.05);
      const e = st.p * st.p * (3 - 2 * st.p);
      doorG.position.y = -(top + 0.1) * e; doorG.visible = st.p < 0.999;
      if (veil) veil.material.opacity = 0.4 + 0.2 * Math.sin(t * 3);
      fx.visible = st.p > 0.01;
      if (fx.visible) {
        gm.opacity = e * (0.45 + 0.15 * Math.sin(t * 3));
        am.opacity = st.p > 0.5 ? (st.p - 0.5) * 2 * (0.55 + 0.4 * Math.sin(t * 5)) : 0;
        arrows[0].position.z = -h + 2.6 - (Math.sin(t * 3) * 0.5 + 0.5) * 0.45;
        arrows[1].position.z = -h + 4.5 - (Math.sin(t * 3 - 1) * 0.5 + 0.5) * 0.45;
      }
    });
    return { obstacle, setOpen: (open) => { st.target = open ? 1 : 0; } };
  }

  // ------------------------------------------------------------------ lumières vacillantes (≤ 4)
  function addLight(ctx, x, y, z, color, intensity, dist, o) {
    if (ctx.lights.length >= 4) return null;
    o = o || {};
    // v5.1 : lumières plus larges et plus fortes, + flaque de lumière au sol (lisibilité vue de dessus)
    intensity *= 1.4; dist = (dist || 9) * 1.45;
    const L = new T.PointLight(color, intensity, dist, o.decay != null ? Math.min(o.decay, 1.6) : 1.6);
    L.position.set(x, y, z); L.castShadow = false;
    ctx.group.add(L);
    let pool = null;
    const pt = puffTex();
    if (pt && y < 8) {
      const pm = new T.MeshBasicMaterial({ map: pt, color, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false });
      pool = new T.Mesh(G_FLAT, pm); pool.position.set(x, 0.045, z); pool.scale.set(dist * 0.95, 1, dist * 0.95); pool.renderOrder = 1;
      ctx.group.add(pool); ctx.own(pm);
    }
    const rec = { L, base: intensity, amp: o.flicker != null ? o.flicker : 0.25, speed: o.speed || 9, ph: ctx.rnd() * 100, drift: o.drift || null, x, y, z, cut: 0, flame: o.flame || null, pool };
    ctx.lights.push(rec);
    return rec;
  }
  function updateLights(ctx, dt, t) {
    const H = ctx.horror;
    if (ctx.blackoutT > 0) ctx.blackoutT -= dt;
    for (const r of ctx.lights) {
      let k = 1 - r.amp * (0.5 + 0.5 * Math.sin(t * r.speed + r.ph) * Math.sin(t * r.speed * 0.37 + r.ph * 2));
      if (r.cut > 0) { r.cut -= dt; k *= 0.05; }
      else if (H > 0 && ctx.rnd() < H * dt * 2.2) r.cut = 0.04 + ctx.rnd() * (0.12 + H * 0.5);
      if (ctx.blackoutT > 0) k *= 0.03;
      r.L.intensity = Math.max(0, r.base * k * ctx.lightLevel * (1 - H * 0.35));
      if (r.pool) { r.pool.material.opacity = clamp(0.16 * k * ctx.lightLevel, 0, 0.3); r.pool.position.x = r.L.position.x; r.pool.position.z = r.L.position.z; }
      if (r.drift) {
        const d = r.drift;
        r.L.position.x = r.x + Math.sin(t * d.s + r.ph) * d.a;
        r.L.position.z = r.z + Math.cos(t * d.s * 0.8 + r.ph) * d.a;
        if (r.flame) { r.flame.position.x = r.L.position.x; r.flame.position.z = r.L.position.z; r.flame.position.y = r.y + Math.sin(t * 2 + r.ph) * 0.2; }
      }
      if (r.flame && r.flame.material) r.flame.material.opacity = clamp(0.25 + 0.7 * k * ctx.lightLevel, 0, 1);
    }
  }
  // flamme visible (sprite additif) attachée à une lumière
  function flame(ctx, x, y, z, color, s) {
    const m = new T.Mesh(G_SPH_LO, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); m.scale.setScalar(s || 0.16); ctx.group.add(m); ctx.own(m.material);
    return m;
  }

  // ------------------------------------------------------------------ brume au sol, particules
  function groundFog(ctx, n, color, op, opts) {
    const tex = puffTex(); if (!tex) return;
    opts = opts || {};
    const mat = new T.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: op, depthWrite: false });
    ctx.own(mat);
    const list = [];
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(G_FLAT, mat);
      const s = ctx.r(opts.smin || 5, opts.smax || 9);
      m.scale.set(s, 1, s * ctx.r(0.6, 1));
      m.position.set(ctx.r(-ctx.half, ctx.half), (opts.y || 0.25) + i * 0.012, ctx.r(-ctx.half, ctx.half));
      m.renderOrder = 3; m.userData = { x0: m.position.x, z0: m.position.z, ph: ctx.rnd() * TAU, sp: ctx.r(0.05, 0.15) };
      ctx.group.add(m); list.push(m);
    }
    ctx.anim((dt, t) => { for (const m of list) { const u = m.userData; m.position.x = u.x0 + Math.sin(t * u.sp + u.ph) * 2.5; m.position.z = u.z0 + Math.cos(t * u.sp * 0.7 + u.ph) * 1.5; } });
    ctx.fogMat = mat;
  }
  // mode : dust (flotte), embers (monte), snow (tombe), spores (dérive), stars (scintille), drip (gouttes)
  function particles(ctx, n, color, size, mode, opts) {
    opts = opts || {};
    const h = ctx.half, pos = new Float32Array(n * 3), vel = [];
    const y0 = opts.y0 || 0.2, y1 = opts.y1 || 4;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = ctx.r(-h, h); pos[i * 3 + 1] = ctx.r(y0, y1); pos[i * 3 + 2] = ctx.r(-h, h);
      vel.push([ctx.r(-0.2, 0.2), mode === 'embers' ? ctx.r(0.6, 1.6) : mode === 'snow' ? -ctx.r(0.4, 1) : mode === 'drip' ? -ctx.r(5, 8) : ctx.r(-0.08, 0.08), ctx.r(-0.2, 0.2), ctx.rnd() * TAU]);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.PointsMaterial({ color, size: size || 0.12, transparent: true, opacity: opts.op || 0.8, depthWrite: false, blending: opts.additive === false ? T.NormalBlending : T.AdditiveBlending });
    const pts = new T.Points(g, m); ctx.group.add(pts); ctx.own(g, m);
    ctx.anim((dt, t) => {
      const a = g.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const v = vel[i], j = i * 3;
        a[j] += (v[0] + (mode === 'spores' ? Math.sin(t + v[3]) * 0.2 : 0)) * dt;
        a[j + 1] += v[1] * dt;
        a[j + 2] += v[2] * dt;
        if (a[j + 1] > y1 || a[j + 1] < y0 - 0.05) { a[j + 1] = mode === 'embers' ? y0 : y1; a[j] = ctx.r(-h, h); a[j + 2] = ctx.r(-h, h); }
        if (Math.abs(a[j]) > h + 1) a[j] = -Math.sign(a[j]) * h;
        if (Math.abs(a[j + 2]) > h + 1) a[j + 2] = -Math.sign(a[j + 2]) * h;
      }
      g.attributes.position.needsUpdate = true;
      if (mode === 'stars') m.opacity = (opts.op || 0.8) * (0.6 + 0.4 * Math.sin(t * 3));
    });
    return pts;
  }

  // ------------------------------------------------------------------ objets dynamiques (groupe animable) et statues
  function dynGroup(ctx, buildFn, x, y, z, ry) {
    const DB = new Batch(), GB2 = new Batch();
    buildFn(DB, GB2);
    const g = new T.Group(); g.position.set(x, y || 0, z); g.rotation.y = ry || 0;
    const b = DB.build(envMat(), 0.035);
    if (b) { b.mesh.castShadow = true; g.add(b.mesh); if (b.out) g.add(b.out); ctx.own(b.mesh.geometry, b.out && b.out.geometry); }
    const gb = GB2.build(ctx.glowMat, 0.03);
    if (gb) { g.add(gb.mesh); ctx.own(gb.mesh.geometry, gb.out && gb.out.geometry); }
    ctx.group.add(g);
    return g;
  }
  // même modèle répété (géométrie partagée)
  function dynMany(ctx, buildFn, list) {
    const DB = new Batch(), GB2 = new Batch();
    buildFn(DB, GB2);
    const b = DB.build(envMat(), 0.035), gb = GB2.build(ctx.glowMat, 0.03);
    if (b) ctx.own(b.mesh.geometry, b.out && b.out.geometry);
    if (gb) ctx.own(gb.mesh.geometry);
    return list.map((p) => {
      const g = new T.Group(); g.position.set(p[0], p[1] || 0, p[2]); g.rotation.y = p[3] || 0;
      if (b) { const m = new T.Mesh(b.mesh.geometry, envMat()); m.castShadow = true; g.add(m); if (b.out) { const o = new T.Mesh(b.out.geometry, outMat()); o.userData.isOutline = true; g.add(o); } }
      if (gb) g.add(new T.Mesh(gb.mesh.geometry, ctx.glowMat));
      ctx.group.add(g);
      return g;
    });
  }
  // statue : déplaçable par l'horreur (userData.obstacle mis à jour par moveStatue)
  function statue(ctx, buildFn, x, z, ry, kind, hw) {
    const g = dynGroup(ctx, buildFn, x, 0, z, ry);
    const ob = hw ? ctx.obs(x, z, hw, hw) : null;
    g.userData = Object.assign(g.userData || {}, { x, z, home: [x, z], obstacle: ob, kind: kind || 'statue', statue: true });
    ctx.anchors.statues.push(g);
    return g;
  }
  function moveStatue(room, g, x, z, ry) {
    if (!g) return;
    g.position.x = x; g.position.z = z; if (ry != null) g.rotation.y = ry;
    g.userData.x = x; g.userData.z = z;
    const ob = g.userData.obstacle; if (ob) { ob.x = x; ob.z = z; }
  }

  // ------------------------------------------------------------------ points d'apparition, coffre, ancres, secrets
  function computeSpawns(ctx) {
    const out = [], ps = ctx.playerStart;
    for (const r of [9.5, 7, 11.2, 5.4, 4]) for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU, x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (Math.hypot(x - ps[0], z - ps[1]) < 7) continue;
      if (!ctx.free(x, z, 0.9, { allowCenter: true, allowReserved: true })) continue;
      if (out.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.2)) continue;
      out.push([+x.toFixed(2), +z.toFixed(2)]);
    }
    if (out.length < 8) {
      for (let gz = -ctx.half + 2; gz <= ctx.half - 2 && out.length < 12; gz += 1.5) for (let gx = -ctx.half + 2; gx <= ctx.half - 2 && out.length < 12; gx += 1.5) {
        if (Math.hypot(gx - ps[0], gz - ps[1]) < 5) continue;
        if (!ctx.free(gx, gz, 0.6, { allowCenter: true, allowDoor: true, allowReserved: true })) continue;
        if (out.some((p) => Math.hypot(p[0] - gx, p[1] - gz) < 1.5)) continue;
        out.push([gx, gz]);
      }
    }
    while (out.length < 8) out.push([(out.length % 2 ? 1 : -1) * 2, -2 - (out.length % 4)]);
    return out;
  }
  function computeChest(ctx) {
    for (const c of [[0, -2.5], [0, -4], [2.5, -2.5], [-2.5, -2.5], [0, 2], [3, 0], [-3, 0], [0, 0]]) if (ctx.free(c[0], c[1], 0.9, { allowCenter: true, allowReserved: true })) return c;
    return [0, 0];
  }
  function computeSecretSpots(ctx) {
    const S = ctx.secretSpots, h = ctx.half;
    // pans de mur latéraux libres (mur fissuré)
    for (const side of ['W', 'E']) for (const u of [-6, -3, 0, 3, -8, 5]) {
      const p = wpos(ctx, side, u, 1.1);
      if (S.wall.filter((w) => w.side === side).length >= 2) break;
      if (ctx.free(p[0], p[1], 0.7, { allowCenter: true, allowReserved: true })) S.wall.push({ x: p[0], z: p[1], side, wx: side === 'W' ? -h : h });
    }
    const cand = [[-9, -9], [9, -9], [-10, 2], [10, 2], [-6, -11], [6, -11], [-11, -4], [11, -4], [-8, 6], [8, 6]];
    for (const c of cand) { if (ctx.free(c[0], c[1], 0.8, { allowCenter: true, allowReserved: true })) { if (S.lever.length < 3) S.lever.push(c); } }
    for (const c of [[-6, -6], [6, -6], [0, 5], [-7, 3], [7, 3], [-4, -9], [4, -9], [0, -7]]) { if (ctx.free(c[0], c[1], 0.9, { allowCenter: true, allowReserved: true })) { if (S.symbol.length < 4) S.symbol.push(c); } }
    if (!S.wall.length) S.wall.push({ x: -h + 1.1, z: 0, side: 'W', wx: -h });
    while (S.lever.length < 1) S.lever.push([-9, -9]);
    while (S.symbol.length < 3) S.symbol.push([[-5, -5], [5, -5], [0, 4]][S.symbol.length]);
  }
  function defaultAnchors(ctx) {
    const A = ctx.anchors, h = ctx.half;
    if (!A.shadows.length) A.shadows.push([-h + 1.5, -h + 1.5], [h - 1.5, -h + 1.5], [-h + 1.5, 2], [h - 1.5, 2], [-5, -h + 1.2], [5, -h + 1.2]);
    if (!A.sounds.length) A.sounds.push([0, -h - 3], [-h - 2, -4], [h + 2, -4], [-h - 2, 6], [h + 2, 6]);
  }

  // ------------------------------------------------------------------ assemblage final
  function finalize(ctx, door) {
    const sb = ctx.B.build(envMat(), 0.045);
    if (sb) { sb.mesh.castShadow = true; sb.mesh.receiveShadow = true; sb.mesh.name = 'decor'; ctx.group.add(sb.mesh); if (sb.out) ctx.group.add(sb.out); ctx.own(sb.mesh.geometry, sb.out && sb.out.geometry); }
    const gb = ctx.GB.build(ctx.glowMat, 0.03);
    if (gb) { gb.mesh.name = 'glow'; ctx.group.add(gb.mesh); ctx.own(gb.mesh.geometry, gb.out && gb.out.geometry); }
    const pulse = ctx.def.pulse;
    if (pulse) ctx.anim((dt, t) => { const k = 1 - pulse.amp + pulse.amp * (0.5 + 0.5 * Math.sin(t * pulse.speed)); ctx.glowMat.color.setScalar(k * (ctx.blackoutT > 0 ? 0.35 : 1)); });
    const spawnPoints = computeSpawns(ctx);
    const chestPos = computeChest(ctx);
    computeSecretSpots(ctx);
    defaultAnchors(ctx);
    let tAcc = 0, disposed = false;
    const room = {
      group: ctx.group, obstacles: ctx.obstacles, door: { obstacle: door.obstacle },
      setDoorOpen: (open) => door.setOpen(!!open),
      hazards: ctx.hazards, spawnPoints, playerStart: ctx.playerStart.slice(), chestPos,
      theme: ctx.id, archi: ctx.id, layout: ctx.layout, layouts: ctx.def.layouts.slice(), half: ctx.half, seed: ctx.seed,
      lights: ctx.lights.map((r) => r.L), anchors: ctx.anchors, mech: ctx.mech, secretSpots: ctx.secretSpots,
      horror: { statues: ctx.anchors.statues },
      flicker(level) { ctx.horror = clamp(+level || 0, 0, 1); },
      blackout(sec) { ctx.blackoutT = Math.max(ctx.blackoutT, +sec || 1); },
      setLightLevel(k) { ctx.lightLevel = clamp(+k || 0, 0, 2); },
      moveStatue(g, x, z, ry) { moveStatue(room, g, x, z, ry); },
      update(dt, time) {
        room._used = true;
        dt = Math.min(Math.max(+dt || 0, 0), 0.1);
        tAcc += dt;
        const t = (time != null && isFinite(time)) ? +time : tAcc;
        updateLights(ctx, dt, t);
        for (let i = 0; i < ctx.anims.length; i++) ctx.anims[i](dt, t, room);
      },
      dispose() {
        if (disposed) return; disposed = true;
        if (ctx.group.parent) ctx.group.parent.remove(ctx.group);
        for (const o of ctx.owned) if (o && o.dispose && !(o.userData && o.userData.shared)) { try { o.dispose(); } catch (e) { /* rien */ } }
        ctx.owned.length = 0;
      },
    };
    return room;
  }

  // ------------------------------------------------------------------ squelette commun d'une architecture
  // def = { theme, palette, layouts:[...], wallH, southH, floor(g,w,h,rnd,v), floorGlow?, walls(ctx,side,u0,u1,H),
  //         lights(ctx), layout:{name:fn(ctx)}, boss(ctx), secret(ctx), decor(ctx), doorStyle, pulse }
  function buildArchi(id, def, opts) {
    const ctx = makeCtx(id, def, opts);
    buildFloor(ctx);
    perimeter(ctx, def.walls);
    const door = buildDoor(ctx, def.doorStyle);
    if (ctx.layout === 'secret') buildSecretVault(ctx); else {
      const fn = ctx.layout === 'boss' ? (def.boss || def.layout[def.layouts[0]]) : def.layout[ctx.layout];
      if (fn) fn(ctx);
    }
    if (def.decor) def.decor(ctx);
    try { dress(ctx); } catch (e) { console.warn('[dungeon-themes] habillage', e); }
    if (def.lights) def.lights(ctx);
    return finalize(ctx, door);
  }
  // salle secrète : alcôve resserrée (murs intérieurs), trésor, lumière unique
  function buildSecretVault(ctx) {
    const P = ctx.P, c = P.wall || 0x444444;
    for (const sx of [-1, 1]) {
      ctx.box(shade(c, -0.15), sx * 11, ctx.H / 2, -2, 5.5, ctx.H, 22);
      ctx.obs(sx * 11, -2, 2.75, 11);
    }
    ctx.box(shade(c, -0.25), -5.5, ctx.H / 2, -12, 3, ctx.H, 3); ctx.obs(-5.5, -12, 1.5, 1.5);
    ctx.box(shade(c, -0.25), 5.5, ctx.H / 2, -12, 3, ctx.H, 3); ctx.obs(5.5, -12, 1.5, 1.5);
    // piédestal + reliques
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.glow(G_OCTA, P.secret || 0x66ddff, [Math.cos(a) * 3.2, 0.15, -3 + Math.sin(a) * 3.2], [0.18, 0.1, 0.18]); }
    ctx.glow(ringG(0.88, 40), P.secret || 0x66ddff, [0, 0.03, -3], [3.6, 1, 3.6]);
    if (ctx.def.secretDecor) ctx.def.secretDecor(ctx);
  }

  // ------------------------------------------------------------------ accessoires génériques
  const PROP = {
    crate(ctx, x, z, s, ry, wood, solid) {
      const w = wood || 0x6a4a2a, d = shade(w, -0.35);
      ctx.add(G_BOX, w, [x, s, z], [2 * s, 2 * s, 2 * s], [0, ry || 0, 0]);
      ctx.add(G_BOX, d, [x, 2 * s - 0.08, z], [2 * s + 0.06, 0.14, 2 * s + 0.06], [0, ry || 0, 0]);
      ctx.add(G_BOX, d, [x, 0.08, z], [2 * s + 0.06, 0.14, 2 * s + 0.06], [0, ry || 0, 0]);
      if (solid !== false) ctx.obs(x, z, s + 0.05, s + 0.05);
    },
    barrel(ctx, x, z, s, c, solid) {
      c = c || 0x5a3a20;
      ctx.add(G_CYL, c, [x, 0.55 * s, z], [0.42 * s, 1.1 * s, 0.42 * s]);
      ctx.add(G_CYL, 0x2a2a2a, [x, 0.25 * s, z], [0.44 * s, 0.07, 0.44 * s], null, false);
      ctx.add(G_CYL, 0x2a2a2a, [x, 0.85 * s, z], [0.44 * s, 0.07, 0.44 * s], null, false);
      if (solid !== false) ctx.obs(x, z, 0.42 * s, 0.42 * s);
    },
    rock(ctx, x, z, s, c, solid) {
      ctx.add(G_DODE, jit(c, ctx.rnd, 0.1), [x, s * 0.55, z], [s, s * ctx.r(0.6, 1), s * ctx.r(0.8, 1.1)], [ctx.rnd(), ctx.rnd() * PI, ctx.rnd()]);
      if (solid) ctx.obs(x, z, s * 0.8, s * 0.8);
    },
    rubble(ctx, x, z, s, c, n) {
      for (let i = 0; i < (n || 5); i++) ctx.add(G_DODE, jit(c, ctx.rnd, 0.12), [x + ctx.r(-s, s), ctx.r(0.05, 0.2), z + ctx.r(-s, s)], ctx.r(0.12, 0.3) * s, [ctx.rnd(), ctx.rnd(), ctx.rnd()], false);
    },
    skull(B, x, y, z, s, c, ry) {
      const c0 = Math.cos(ry || 0), s0 = Math.sin(ry || 0);
      B.add(G_SPH_LO, c, [x, y + s, z], [s, s * 0.95, s * 1.05], [0, ry || 0, 0], false);
      B.add(G_BOX, c, [x + s0 * s * 0.35, y + s * 0.3, z + c0 * s * 0.35], [s * 1.1, s * 0.5, s * 0.6], [0, ry || 0, 0], false);
      B.add(G_BOX, 0x0a0a0a, [x + s0 * s * 0.85 + c0 * s * 0.38, y + s * 1.05, z + c0 * s * 0.85 - s0 * s * 0.38], s * 0.3, [0, ry || 0, 0], false);
      B.add(G_BOX, 0x0a0a0a, [x + s0 * s * 0.85 - c0 * s * 0.38, y + s * 1.05, z + c0 * s * 0.85 + s0 * s * 0.38], s * 0.3, [0, ry || 0, 0], false);
    },
    bones(ctx, x, z, c) {
      for (let i = 0; i < 3; i++) ctx.add(G_CYL6, c || 0xd8ceb0, [x + ctx.r(-0.5, 0.5), 0.06, z + ctx.r(-0.5, 0.5)], [0.05, ctx.r(0.4, 0.8), 0.05], [HPI, ctx.rnd() * PI, 0], false);
      if (ctx.rnd() < 0.5) PROP.skull(ctx.B, x, 0, z, 0.16, c || 0xd8ceb0, ctx.rnd() * TAU);
    },
    candles(ctx, x, z, n, glowC, waxC) {
      for (let i = 0; i < (n || 3); i++) {
        const dx = ctx.r(-0.35, 0.35), dz = ctx.r(-0.35, 0.35), h = ctx.r(0.2, 0.6);
        ctx.add(G_CYL, waxC || 0xe8dcc0, [x + dx, h / 2, z + dz], [0.07, h, 0.07], null, false);
        ctx.glow(G_CONE, glowC || 0xffb860, [x + dx, h + 0.1, z + dz], [0.05, 0.16, 0.05]);
      }
    },
    chain(B, x, y0, y1, z, c, s) {
      s = s || 1; let k = 0;
      for (let y = y0; y > y1; y -= 0.28 * s) { B.add(torus(0.25), c, [x, y, z], [0.12 * s, 0.16 * s, 0.12 * s], [0, (k++ % 2) * HPI, 0], false); }
    },
    pillar(ctx, x, z, r, h, c, cap, seg) {
      ctx.add(seg || G_CYL, c, [x, h / 2, z], [r, h, r]);
      if (cap != null) { ctx.add(G_BOX, cap, [x, h + 0.1, z], [r * 2.4, 0.2, r * 2.4]); ctx.add(G_BOX, cap, [x, 0.12, z], [r * 2.4, 0.24, r * 2.4]); }
      ctx.obs(x, z, r * 1.05, r * 1.05);
    },
  };

  // ------------------------------------------------------------------ v5.1 : habillage commun (détails + lisibilité)
  const webTex = () => canvasTex('web', 128, 128, (g, w) => {
    g.strokeStyle = 'rgba(235,235,235,0.75)'; g.lineWidth = 1.2;
    const cx = 0, cy = 0, n = 7;
    for (let i = 0; i <= n; i++) { const a = (i / n) * HPI; g.beginPath(); g.moveTo(cx, cy); g.lineTo(Math.cos(a) * w * 1.1, Math.sin(a) * w * 1.1); g.stroke(); }
    for (let r = 14; r < w * 1.05; r += 13 + r * 0.12) {
      g.beginPath();
      for (let i = 0; i <= n; i++) { const a = (i / n) * HPI, rr = r * (0.92 + 0.08 * Math.sin(i * 2.1 + r)); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
  });
  const flameColor = (P) => P.candle || P.ember || P.rune || P.bulb || P.glyph || P.aurora || P.mush || P.void || P.rift || P.glass || P.ore || 0xffa850;
  function dress(ctx) {
    if (ctx.layout === 'secret') return;
    const P = ctx.P, h = ctx.half, rnd = ctx.rnd;
    const stone = P.stone || P.rock || P.wall || 0x4a4440;
    const floorC = P.floor || 0x2a2622;
    const fc = flameColor(P);
    const metal = P.iron || P.metal || P.chain || P.rail || 0x2c2a2e;
    const opt = { allowCenter: true, allowReserved: false };
    // 1) occlusion douce au pied des murs (donne du relief au sol vu de dessus)
    const ft = fadeTex();
    if (ft) {
      const am = SH(MAT.ao || (MAT.ao = new T.MeshBasicMaterial({ map: ft, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false })));
      const W = 2.4;
      [['N', 0, -h + W / 2], ['S', PI, h - W / 2], ['W', HPI, -h + W / 2], ['E', -HPI, h - W / 2]].forEach(([side, ry, c]) => {
        const m = new T.Mesh(G_FLAT, am);
        if (side === 'N' || side === 'S') m.position.set(0, 0.025, c); else m.position.set(c, 0.025, 0);
        m.rotation.y = ry; m.scale.set(h * 2, 1, W); m.renderOrder = 1;
        ctx.group.add(m);
      });
    }
    // 2) appliques murales : support + flamme lumineuse (sans PointLight supplémentaire)
    const haloM = basic(fc, 0.3, true);
    const sconces = [];
    for (const side of ['W', 'E', 'N']) {
      for (let u = -h + 3.2; u < h - 2.5; u += 6.2 + rnd() * 1.4) {
        if (side === 'N' && Math.abs(u) < 4.5) continue;
        const p = wpos(ctx, side, u, 0.32);
        const q = wpos(ctx, side, u, 1.15);
        if (!isFree(ctx, q[0], q[1], 0.3, { allowCenter: true, allowReserved: true, allowStart: true, allowHazard: true })) continue;
        if (ctx.obstacles.some((ob) => ob.hw < 3 && ob.hd < 3 && Math.abs(p[0] - ob.x) < ob.hw + 0.3 && Math.abs(p[1] - ob.z) < ob.hd + 0.3)) continue;
        const along = side === 'N';
        const ix = side === 'W' ? 1 : side === 'E' ? -1 : 0, iz = side === 'N' ? 1 : 0;
        const y = Math.min(ctx.H - 0.5, 1.75);
        ctx.add(G_BOX, metal, [p[0], y - 0.25, p[1]], along ? [0.12, 0.5, 0.12] : [0.12, 0.5, 0.12]);
        ctx.add(G_BOX, metal, [p[0] + ix * 0.18, y - 0.05, p[1] + iz * 0.18], [0.1 + Math.abs(ix) * 0.3, 0.08, 0.1 + iz * 0.3], null, false);
        ctx.add(cylT(1.4, 8), metal, [p[0] + ix * 0.32, y + 0.05, p[1] + iz * 0.32], [0.12, 0.16, 0.12], null, false);
        ctx.glow(G_CONE, fc, [p[0] + ix * 0.32, y + 0.3, p[1] + iz * 0.32], [0.09, 0.3, 0.09]);
        ctx.glow(G_CONE, shade(fc, 0.5), [p[0] + ix * 0.32, y + 0.24, p[1] + iz * 0.32], [0.05, 0.18, 0.05]);
        const hm = new T.Mesh(G_SPH_LO, haloM); hm.position.set(p[0] + ix * 0.32, y + 0.3, p[1] + iz * 0.32); hm.scale.setScalar(0.42);
        ctx.group.add(hm); sconces.push({ m: hm, ph: rnd() * TAU });
        // halo au sol sous l'applique
        const pt = puffTex();
        if (pt) { const gm = new T.Mesh(G_FLAT, basicMap(pt, fc, 0.12)); gm.position.set(p[0] + ix * 1.1, 0.04, p[1] + iz * 1.1); gm.scale.set(3.6, 1, 3.6); gm.renderOrder = 1; ctx.group.add(gm); }
      }
    }
    if (sconces.length) ctx.anim((dt, t) => { const k = ctx.blackoutT > 0 ? 0.1 : 1; for (const sc of sconces) { const f = 0.85 + 0.15 * Math.sin(t * 9 + sc.ph) * Math.sin(t * 3.7 + sc.ph); sc.m.scale.setScalar(0.42 * f * k + 0.01); } });
    // 3) gravats et pierres au pied des murs
    for (let i = 0; i < 9; i++) {
      const side = ctx.pick(['W', 'E', 'N', 'S']);
      const p = wpos(ctx, side, ctx.r(-h + 2, h - 2), ctx.r(0.9, 1.7));
      if (!isFree(ctx, p[0], p[1], 0.5, opt)) continue;
      PROP.rubble(ctx, p[0], p[1], ctx.r(0.6, 1.1), stone, 4 + Math.floor(rnd() * 4));
      if (rnd() < 0.45) PROP.rock(ctx, p[0] + ctx.r(-0.4, 0.4), p[1] + ctx.r(-0.4, 0.4), ctx.r(0.22, 0.38), stone, false);
    }
    // 4) détails au sol : dalles soulevées, ossements, bougies, taches
    const slab = shade(floorC, 0.22);
    let candles = 0;
    for (let i = 0; i < 16; i++) {
      const x = ctx.r(-h + 2, h - 2), z = ctx.r(-h + 2, h - 2);
      if (!isFree(ctx, x, z, 0.6, opt)) continue;
      const k = rnd();
      if (k < 0.35) {
        const ry = ctx.r(-0.3, 0.3);
        for (let j = 0; j < 1 + Math.floor(rnd() * 3); j++) ctx.add(G_BOX, jit(slab, rnd, 0.1), [x + ctx.r(-0.5, 0.5), 0.03, z + ctx.r(-0.5, 0.5)], [ctx.r(0.6, 1.0), 0.06, ctx.r(0.5, 0.9)], [ctx.r(-0.06, 0.06), ry, ctx.r(-0.06, 0.06)], false);
      } else if (k < 0.6) {
        PROP.bones(ctx, x, z, P.bone || 0xcfc4a6);
      } else if (k < 0.75 && candles < 3) {
        PROP.candles(ctx, x, z, 3 + Math.floor(rnd() * 3), fc, P.bone || 0xe0d4b8); candles++;
        const pt = puffTex();
        if (pt) { const gm = new T.Mesh(G_FLAT, basicMap(pt, fc, 0.18)); gm.position.set(x, 0.045, z); gm.scale.set(2.6, 1, 2.6); gm.renderOrder = 1; ctx.group.add(gm); }
      } else {
        const pt = puffTex();
        if (pt) { const sm = new T.Mesh(G_FLAT, darkMap(pt)); sm.position.set(x, 0.035, z); const sc = ctx.r(1.4, 3.2); sm.scale.set(sc, 1, sc * ctx.r(0.5, 1)); sm.rotation.y = rnd() * PI; sm.renderOrder = 1; ctx.group.add(sm); }
      }
    }
    // 5) toiles d'araignée dans les coins nord
    const wt = webTex();
    if (wt && ctx.H > 1.6) {
      const wm = SH(MAT.web || (MAT.web = new T.MeshBasicMaterial({ map: wt, color: 0xd8d8d8, transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide })));
      for (const sx of [-1, 1]) {
        if (rnd() < 0.2) continue;
        const m = new T.Mesh(G_PLANE, wm);
        m.position.set(sx * (h - 0.75), ctx.H * 0.62, -h + 0.75);
        m.rotation.y = sx < 0 ? -PI / 4 : PI / 4; m.scale.set(sx < 0 ? -2.2 : 2.2, ctx.H * 0.75, 1);
        ctx.group.add(m);
      }
    }
    // 6) poussière en suspension, éclairée par les flammes
    particles(ctx, 46, shade(fc, 0.55), 0.06, 'dust', { op: 0.32, y0: 0.3, y1: 3.4 });
  }
  const BMAP = {};
  function basicMap(tex, color, op) {
    const k = color + '|' + op;
    return BMAP[k] || (BMAP[k] = SH(new T.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false })));
  }
  function darkMap(tex) { return MAT.stain || (MAT.stain = SH(new T.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }))); }

  // ==================================================================
  //  AIDES DE THÈMES
  // ==================================================================
  function TH(name, bg, fog, sky, ground, sun, hemiI, sunI, dark, amb, mus, pal) {
    // v5.1 lisibilité : la caméra est à ≈ 24 u du joueur. Brouillard repoussé au-delà de l'aire de jeu,
    // éclairage d'ambiance relevé (l'ambiance reste sombre et colorée, mais on voit le sol, les murs et les ennemis).
    const fogN = Math.max(fog[0] + 14, 27), fogF = Math.max(fog[1] + 20, fogN + 28);
    const hemi = clamp(0.48 + hemiI * 1.3, 0.5, 0.82), sunK = clamp(0.42 + sunI * 1.6, 0.45, 0.78);
    return { name, bg, fog: [fogN, fogF], hemiSky: sky, hemiGround: shade(ground, 0.18), sun, hemiIntensity: hemi, sunIntensity: sunK, darkness: +(dark * 0.5).toFixed(2), ambience: amb, music: mus, palette: pal };
  }
  // silhouette humanoïde (statues, armures, épouvantails, anges...) — regarde +Z
  function humanoid(B, c, o) {
    o = o || {};
    const s = o.s || 1, y0 = o.y || 0, dark = shade(c, -0.25);
    B.add(G_CYL, dark, [-0.18 * s, y0 + 0.45 * s, 0], [0.13 * s, 0.9 * s, 0.13 * s]);
    B.add(G_CYL, dark, [0.18 * s, y0 + 0.45 * s, 0], [0.13 * s, 0.9 * s, 0.13 * s]);
    B.add(o.robe ? G_CONE : G_BOX, c, [0, y0 + (o.robe ? 0.85 : 1.2) * s, 0], o.robe ? [0.55 * s, 1.7 * s, 0.55 * s] : [0.62 * s, 0.75 * s, 0.38 * s]);
    B.add(G_SPH, o.headC != null ? o.headC : c, [0, y0 + 1.8 * s, 0], [0.24 * s, 0.27 * s, 0.24 * s]);
    if (o.helm) { B.add(G_CYL, c, [0, y0 + 1.85 * s, 0], [0.27 * s, 0.32 * s, 0.27 * s]); B.add(G_BOX, 0x050505, [0, y0 + 1.86 * s, 0.25 * s], [0.3 * s, 0.05 * s, 0.05 * s], null, false); }
    if (o.hood) B.add(G_CONE, c, [0, y0 + 1.95 * s, -0.04 * s], [0.34 * s, 0.6 * s, 0.34 * s]);
    const ax = o.armsUp ? -0.9 : 0.12;
    B.add(G_CYL, c, [-0.42 * s, y0 + 1.15 * s, 0], [0.1 * s, 0.7 * s, 0.1 * s], [ax, 0, 0.18]);
    B.add(G_CYL, c, [0.42 * s, y0 + 1.15 * s, 0], [0.1 * s, 0.7 * s, 0.1 * s], [ax, 0, -0.18]);
    if (o.wings) for (const sx of [-1, 1]) B.add(G_BOX, c, [sx * 0.55 * s, y0 + 1.5 * s, -0.25 * s], [0.08 * s, 1.1 * s, 0.6 * s], [0.3, sx * 0.5, sx * 0.35]);
    if (o.pedestal) { B.add(G_BOX, o.pedestal, [0, 0.2, 0], [1.1 * s, 0.4, 1.1 * s]); }
  }
  const eyes = (GB, c, y, z, s) => { GB.add(G_SPH_LO, c, [-0.08 * (s || 1), y, z], 0.04 * (s || 1)); GB.add(G_SPH_LO, c, [0.08 * (s || 1), y, z], 0.04 * (s || 1)); };

  const DEFS = {};

  // ==================================================================
  //  1. MINE ABANDONNÉE — galeries étayées, rails, wagonnets, lanternes, éboulis
  // ==================================================================
  DEFS.mine_abandonnee = (() => {
    const P = { wall: 0x3a3029, rock: 0x4a3e34, wood: 0x5a3a20, woodD: 0x3a2614, rail: 0x7a7a80, floor: 0x2a221c, outer: 0x080604, ore: 0xffb040,
      doorFrame: 0x5a3a20, doorWood: 0x3a2614, doorBand: 0x55555c, doorKey: 0xffa040, doorOpen: 0xffc060, secret: 0xffc060 };
    function rail(ctx, x0, z0, x1, z1) {
      const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      for (const s of [-0.55, 0.55]) ctx.add(G_BOX, P.rail, [cx + ux * s, 0.09, cz + uz * s], [0.1, 0.1, L], [0, ry, 0], false);
      for (let d = -L / 2 + 0.4; d < L / 2; d += 0.9) ctx.add(G_BOX, jit(P.woodD, ctx.rnd, 0.1), [cx + Math.sin(ry) * d, 0.035, cz + Math.cos(ry) * d], [1.6, 0.07, 0.28], [0, ry, 0], false);
      (ctx.mech.rails = ctx.mech.rails || []).push({ x0, z0, x1, z1 });
    }
    function cartBuild(B, GB, full) {
      B.add(G_BOX, 0x4a4448, [0, 0.62, 0], [1.1, 0.7, 1.6]);
      B.add(G_BOX, 0x2a2628, [0, 0.98, 0], [1.2, 0.08, 1.7], null, false);
      for (const sx of [-0.55, 0.55]) for (const sz of [-0.5, 0.5]) B.add(G_CYL, 0x222222, [sx, 0.22, sz], [0.2, 0.08, 0.2], [0, 0, HPI]);
      if (full) for (let i = 0; i < 5; i++) B.add(G_DODE, 0x1e1a18, [(i % 3 - 1) * 0.3, 1.05, (i - 2) * 0.25], 0.22, null, false);
      if (full) GB.add(G_OCTA, P.ore, [0.2, 1.15, 0.1], 0.1);
    }
    function frame(ctx, x, z, ry, w) { // étai : 2 poteaux + poutre
      w = w || 2.6;
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      for (const s of [-1, 1]) { ctx.add(G_BOX, P.wood, [x + ux * s * w / 2, 1.4, z + uz * s * w / 2], [0.3, 2.8, 0.3], [0, ry, 0]); ctx.obs(x + ux * s * w / 2, z + uz * s * w / 2, 0.2, 0.2); }
      ctx.add(G_BOX, P.woodD, [x, 2.85, z], [w + 0.6, 0.3, 0.34], [0, ry, 0]);
    }
    function lantern(ctx, x, z, y) {
      ctx.add(G_BOX, 0x222222, [x, (y || 2.4) + 0.2, z], [0.3, 0.05, 0.3], null, false);
      ctx.glow(G_BOX, 0xffb050, [x, (y || 2.4), z], [0.2, 0.3, 0.2]);
      return addLight(ctx, x, (y || 2.4), z, 0xff9a3a, 1.7, 9, { flicker: 0.4, speed: 11 });
    }
    function heap(ctx, x, z, rx, rz, n) { for (let i = 0; i < n; i++) { const a = ctx.rnd() * TAU, d = Math.sqrt(ctx.rnd()); PROP.rock(ctx, x + Math.cos(a) * rx * d, z + Math.sin(a) * rz * d, ctx.r(0.5, 1.3) * (1.2 - d * 0.6), P.rock); } }
    function props(ctx) {
      const spots = [[-11, -11], [11, -11], [-11, 3], [11, 3], [-11, 9], [11, 9], [-8, -11], [8, -11]];
      for (const s of spots) {
        if (!ctx.free(s[0], s[1], 1, { allowCenter: true })) continue;
        const k = ctx.rnd();
        if (k < 0.35) PROP.crate(ctx, s[0], s[1], 0.5, ctx.rnd(), P.wood);
        else if (k < 0.65) PROP.barrel(ctx, s[0], s[1], 1, 0x4a3018);
        else { PROP.rubble(ctx, s[0], s[1], 1.2, P.rock, 6); ctx.add(G_CYL, P.wood, [s[0], 0.08, s[1] + 0.5], [0.04, 1.1, 0.04], [HPI, 0.6, 0], false); ctx.add(G_BOX, 0x777780, [s[0] + 0.4, 0.08, s[1] + 0.1], [0.5, 0.06, 0.12], [0, 0.6, 0], false); }
      }
      for (let i = 0; i < 7; i++) { const x = ctx.r(-12, 12), z = ctx.r(-12, 10); ctx.glow(G_OCTA, P.ore, [x, 0.12, z], [0.1, 0.16, 0.1]); }
      // mineur figé (statue)
      const sp = [[-10.5, -6], [10.5, -6], [-10.5, 6]].find((p) => ctx.free(p[0], p[1], 0.7, { allowCenter: true }));
      if (sp) statue(ctx, (B, GB) => { humanoid(B, 0x3a342c, { helm: true, s: 0.95 }); GB.add(G_SPH_LO, 0xffd080, [0, 1.95, 0.26], 0.06); }, sp[0], sp[1], sp[0] < 0 ? HPI : -HPI, 'mineur', 0.45);
    }
    return {
      theme: TH('Mine abandonnée', 0x0a0806, [14, 44], 0x8a7058, 0x1a120a, 0xffc890, 0.16, 0.12, 0.75, 'amb_mine', 'mus_mine', P),
      palette: P, layouts: ['galerie', 'carrefour', 'puits', 'eboulis'], wallH: 2.6, southH: 1.0, doorStyle: 'bois', pulse: { amp: 0.25, speed: 1.3 },
      floor(g, w, h, rnd) {
        g.fillStyle = css(P.floor); g.fillRect(0, 0, w, h);
        P2.blobs(g, w, h, rnd, 40, 0x1a140f, 20, 70, 0.4);
        P2.noise(g, w, h, rnd, 2600, [0x4a3e34, 0x14100c, 0x5a4a3a, 0x0a0806], 1, 4, 0.5);
        P2.cracks(g, w, h, rnd, 10, 0x0a0806, 2, 0.6);
        P2.blobs(g, w, h, rnd, 8, 0x000000, 30, 60, 0.25);
        P2.vignette(g, w, h, 0.6);
      },
      walls(ctx, side, u0, u1, H) {
        runBlocks(ctx, u0, u1, 0.9, 1.6, (u, len) => {
          const p = wpos(ctx, side, u, ctx.r(-0.2, 0.4)), hh = side === 'S' ? ctx.r(0.6, 1.1) : ctx.r(H * 0.7, H * 1.25);
          ctx.add(G_DODE, jit(P.wall, ctx.rnd, 0.12), [p[0], hh * 0.45, p[1]], [len * 0.75, hh * 0.6, 1.0], [ctx.rnd() * 0.4, ctx.rnd() * PI, ctx.rnd() * 0.3]);
        });
        if (side !== 'S') for (let u = u0 + 2; u < u1 - 1; u += 4.2) {
          const p = wpos(ctx, side, u, 0.55), along = side === 'N';
          ctx.add(G_BOX, P.wood, [p[0], H * 0.55, p[1]], [0.32, H * 1.1, 0.32]);
          const q = wpos(ctx, side, u, 0.2); ctx.add(G_BOX, P.woodD, [q[0], H * 1.05, q[1]], along ? [1.4, 0.26, 0.9] : [0.9, 0.26, 1.4]);
        }
      },
      layout: {
        galerie(ctx) {
          for (const sx of [-1, 1]) {
            for (const [z0, z1] of [[-10, -3.2], [0.8, 6]]) {
              const zc = (z0 + z1) / 2, L = z1 - z0;
              for (let z = z0; z < z1; z += 1.1) PROP.rock(ctx, sx * ctx.r(7.2, 7.8), z, ctx.r(0.9, 1.3), P.rock);
              ctx.obs(sx * 7.5, zc, 0.9, L / 2);
            }
            frame(ctx, sx * 7.5, -1.2, HPI, 3.6);
          }
          rail(ctx, 4.2, -13.4, 4.2, 13.2);
          for (const z of [-8, -2, 4]) frame(ctx, 4.2, z, 0, 2.8);
          ctx.mech.cart = dynGroup(ctx, (B, GB) => cartBuild(B, GB, true), 4.2, 0, 9.5, 0);
          ctx.obs(4.2, 9.5, 0.6, 0.85);
          ctx.anchors.shadows.push([-10.5, -9], [10.5, -9], [-10.5, 8], [10.5, 8]);
          ctx.mech.lanternSpots = [[4.2, -8], [4.2, 4], [-7.5, -1.2]];
        },
        carrefour(ctx) {
          rail(ctx, -1.2, -9, -1.2, 13.2); rail(ctx, -13.4, -1, 13.4, -1);
          for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 5.5], [6.5, 5.5]]) { frame(ctx, x, z, x * z > 0 ? 0.785 : -0.785, 2.2); heap(ctx, x + Math.sign(x) * 2.5, z + Math.sign(z) * 2, 1.5, 1.2, 4); ctx.obs(x + Math.sign(x) * 2.5, z + Math.sign(z) * 2, 1.4, 1.1); }
          ctx.mech.cart = dynGroup(ctx, (B, GB) => cartBuild(B, GB, false), -11, 0, -1, HPI);
          ctx.obs(-11, -1, 0.85, 0.6);
          ctx.mech.lanternSpots = [[-6.5, -6.5], [6.5, -6.5], [0, 5.5]];
        },
        puits(ctx) {
          const px = -7, pz = -5, R = 2.4;
          ctx.add(G_CYL, 0x020202, [px, 0.02, pz], [R, 0.04, R], null, false);
          ctx.glow(ringG(0.8, 24), 0x2a1a0a, [px, 0.05, pz], [R, 1, R]);
          for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ctx.add(G_BOX, P.wood, [px + Math.cos(a) * (R + 0.2), 0.5, pz + Math.sin(a) * (R + 0.2)], [0.18, 1.0, 0.18]); }
          ctx.add(torus(0.06, TAU, 20), P.woodD, [px, 0.85, pz], [R + 0.2, R + 0.2, 0.8], [HPI, 0, 0], false);
          for (const s of [-1, 1]) ctx.add(G_BOX, P.wood, [px + s * 1.6, 2.2, pz], [0.3, 4.4, 0.3], [0, 0, -s * 0.25]);
          ctx.add(G_CYL, P.woodD, [px, 4.1, pz], [0.22, 2.4, 0.22], [0, 0, HPI]);
          PROP.chain(ctx.B, px, 4.0, 0.6, pz, 0x666666, 0.8);
          ctx.obs(px, pz, R + 0.4, R + 0.4);
          rail(ctx, -4, 3.5, 13.4, 3.5);
          ctx.mech.cart = dynGroup(ctx, (B, GB) => cartBuild(B, GB, true), 10.5, 0, 3.5, HPI);
          ctx.obs(10.5, 3.5, 0.85, 0.6);
          heap(ctx, 8, -8, 2.5, 2, 9); ctx.obs(8.5, -8.5, 2.2, 1.8);
          ctx.anchors.sounds.push([px, pz]); ctx.anchors.shadows.push([px + 2.8, pz + 2.5]);
          ctx.mech.shaft = { x: px, z: pz, r: R };
          ctx.mech.lanternSpots = [[px + 1.6, pz + 1.2], [8, -5.5], [4, 3.5]];
        },
        eboulis(ctx) {
          heap(ctx, 8.5, -9, 4.2, 3.6, 18); ctx.obs(8.5, -9, 4.3, 3.6);
          heap(ctx, -10, 7, 2.6, 2.2, 8); ctx.obs(-10.2, 7, 2.6, 2.0);
          for (const [x, z, ry] of [[3.5, -4, 0.7], [-5, 4, -0.3]]) ctx.add(G_BOX, P.wood, [x, 0.2, z], [0.3, 0.3, 3.2], [0.1, ry, 0.15]);
          frame(ctx, -6, -6, 0.3, 2.8); frame(ctx, -3, -9.5, 0, 2.6);
          rail(ctx, -13.4, -1.5, 2.5, -1.5);
          ctx.mech.cart = dynGroup(ctx, (B, GB) => cartBuild(B, GB, false), -10.5, 0, -1.5, HPI);
          ctx.obs(-10.5, -1.5, 0.85, 0.6);
          ctx.anchors.shadows.push([3.5, -11], [-12, 3]);
          ctx.mech.lanternSpots = [[-6, -6], [2, -9.5], [6, 3]];
        },
      },
      boss(ctx) {
        for (const [x, z] of [[-9, -7], [9, -7], [-10, 4], [10, 4]]) { PROP.rock(ctx, x, z, 1.6, P.rock); PROP.rock(ctx, x + 0.6, z + 0.4, 1.2, P.rock); ctx.obs(x + 0.3, z + 0.2, 1.5, 1.4); }
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; ctx.glow(G_CYL, 0x7aff5a, [Math.cos(a) * 6.5, 0.04, Math.sin(a) * 6.5 - 1], [0.6, 0.03, 0.6]); }
        (ctx.mech.vents = []).push(...[0, 1, 2, 3, 4].map((i) => [Math.cos(i / 5 * TAU) * 6.5, Math.sin(i / 5 * TAU) * 6.5 - 1]));
        rail(ctx, -13.4, 9, 13.4, 9);
        ctx.mech.lanternSpots = [[-9, -7], [9, -7], [0, 7]];
      },
      decor(ctx) {
        if (ctx.layout !== 'secret') props(ctx);
        particles(ctx, 50, 0xb09070, 0.08, 'dust', { op: 0.5, additive: false });
        particles(ctx, 10, 0x6a8aa0, 0.06, 'drip', { y0: 0.05, y1: 3, op: 0.7 });
        ctx.mech.vents = ctx.mech.vents || [[-9, 0], [9, -3], [-4, -9], [6, 7]].filter((p) => ctx.free(p[0], p[1], 0.8, { allowCenter: true }));
      },
      lights(ctx) {
        const L = ctx.mech.lanternSpots || [[-7, -8], [7, -8], [0, 6]];
        L.slice(0, 3).forEach((p) => lantern(ctx, p[0], p[1] + 0.3, 2.35));
      },
      secretDecor(ctx) { PROP.crate(ctx, -6, -8, 0.5, 0.3, P.wood); PROP.barrel(ctx, 6, -8, 1); ctx.mech.lanternSpots = [[0, -3]]; },
    };
  })();

  // ==================================================================
  //  2. FORÊT INTERDITE — troncs géants, racines, brume au sol, champignons
  // ==================================================================
  DEFS.foret_interdite = (() => {
    const P = { wall: 0x2a2018, trunk: 0x2c2219, bark: 0x1a140f, moss: 0x24341c, leaf: 0x142218, floor: 0x141c12, outer: 0x040604, mush: 0x5affc8, mush2: 0xb06aff,
      doorFrame: 0x2a2018, doorWood: 0x2a2018, doorBand: 0x3a2a1c, doorKey: 0x5affc8, doorOpen: 0x7affc0, secret: 0x9affd0 };
    function trunk(ctx, x, z, r, h, solid) {
      ctx.add(G_CYL, jit(P.trunk, ctx.rnd, 0.1), [x, h / 2, z], [r, h, r]);
      for (let i = 0; i < 4; i++) { const a = ctx.rnd() * TAU; ctx.add(G_CONE, P.bark, [x + Math.cos(a) * r * 0.9, 0.35, z + Math.sin(a) * r * 0.9], [r * 0.45, 1.2, r * 0.45], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], false); }
      ctx.add(G_CYL, P.moss, [x, 0.6, z], [r * 1.04, 0.5, r * 1.04], null, false);
      if (solid !== false) ctx.obs(x, z, r * 0.95, r * 0.95);
    }
    function mushroom(ctx, x, z, s, c) {
      ctx.add(G_CYL, 0xc8c0a8, [x, 0.25 * s, z], [0.08 * s, 0.5 * s, 0.08 * s], null, false);
      ctx.glow(G_HEMI, c || P.mush, [x, 0.48 * s, z], [0.3 * s, 0.22 * s, 0.3 * s]);
    }
    function mushRing(ctx, x, z, R, n, c) { for (let i = 0; i < n; i++) { const a = i / n * TAU + ctx.r(-0.1, 0.1); mushroom(ctx, x + Math.cos(a) * R, z + Math.sin(a) * R, ctx.r(0.6, 1.1), c); } (ctx.mech.spores = ctx.mech.spores || []).push([x, z]); }
    function rootWall(ctx, x, z0, z1) {
      for (let z = z0; z < z1; z += 1.6) ctx.add(torus(0.22, PI, 10), jit(P.trunk, ctx.rnd, 0.1), [x + ctx.r(-0.3, 0.3), 0, z], [1.1, ctx.r(0.9, 1.5), 1], [0, HPI + ctx.r(-0.3, 0.3), 0]);
      ctx.add(G_CYL, P.bark, [x, 0.35, (z0 + z1) / 2], [0.35, z1 - z0, 0.35], [HPI, 0, 0]);
      ctx.obs(x, (z0 + z1) / 2, 0.6, (z1 - z0) / 2);
    }
    return {
      theme: TH('Forêt interdite', 0x050806, [12, 40], 0x6a8a7a, 0x0a120a, 0x9ab0ff, 0.14, 0.1, 0.8, 'amb_foret', 'mus_foret', P),
      palette: P, layouts: ['clairiere', 'sentier', 'racines', 'marecage'], wallH: 7, southH: 1.4, doorStyle: 'grille', pulse: { amp: 0.4, speed: 0.9 },
      floor(g, w, h, rnd) {
        g.fillStyle = css(P.floor); g.fillRect(0, 0, w, h);
        P2.blobs(g, w, h, rnd, 60, 0x1e2a16, 10, 40, 0.5);
        P2.noise(g, w, h, rnd, 1800, [0x2a2a14, 0x3a2a14, 0x0a100a, 0x24341c], 2, 6, 0.5);
        g.strokeStyle = css(0x2a2418, 0.55); g.lineWidth = 34; g.beginPath(); g.moveTo(w / 2, h); g.bezierCurveTo(w * 0.2, h * 0.7, w * 0.8, h * 0.35, w / 2, 0); g.stroke();
        P2.vignette(g, w, h, 0.65);
      },
      walls(ctx, side, u0, u1, H) {
        runBlocks(ctx, u0, u1, 1.6, 2.6, (u, len) => {
          const p = wpos(ctx, side, u, ctx.r(-0.3, 0.6));
          if (side === 'S') { ctx.add(G_SPH, jit(P.leaf, ctx.rnd, 0.15), [p[0], 0.5, p[1]], [len * 0.6, ctx.r(0.6, 1.1), 0.9]); return; }
          const south = (side === 'W' || side === 'E') && u > 5;
          const r = ctx.r(0.6, Math.min(1.3, len * 0.5)), hh = south ? ctx.r(1.2, 2) : ctx.r(H * 0.8, H * 1.2);
          trunk(ctx, p[0], p[1], r, hh, false);
          if (!south && ctx.rnd() < 0.6) ctx.add(G_SPH, jit(P.leaf, ctx.rnd, 0.2), [p[0], hh, p[1]], [ctx.r(1.8, 3), ctx.r(1, 1.6), ctx.r(1.8, 3)], null, false);
        });
      },
      layout: {
        clairiere(ctx) {
          for (let i = 0; i < 14; i++) {
            const a = i / 14 * TAU, x = Math.sin(a) * 10.5, z = -Math.cos(a) * 10.5;
            if (Math.abs(x) < 3.5 && z < 0) continue;      // passage nord
            if (Math.abs(x) < 3.5 && z > 0) continue;      // passage sud
            trunk(ctx, x, z, ctx.r(0.8, 1.2), ctx.r(5, 8));
          }
          mushRing(ctx, 0, -1, 3.2, 12, P.mush);
          for (const [x, z] of [[-12, -12], [12, -12], [-12, 11], [12, 11]]) { ctx.hazards.push({ x, z, r: 1.4, dps: 4, kind: 'ronces' }); for (let k = 0; k < 6; k++) ctx.add(G_CONE, 0x2a1a10, [x + ctx.r(-1, 1), 0.4, z + ctx.r(-1, 1)], [0.08, 0.8, 0.08], [ctx.r(-0.6, 0.6), 0, ctx.r(-0.6, 0.6)], false); }
          ctx.anchors.shadows.push([0, -12.5], [-11.5, 0], [11.5, 0]);
        },
        sentier(ctx) {
          for (const [cx, cz] of [[-8, -7], [7.5, -2], [-7, 6]]) for (let k = 0; k < 3; k++) trunk(ctx, cx + ctx.r(-1.6, 1.6), cz + ctx.r(-1.6, 1.6), ctx.r(0.9, 1.4), ctx.r(5, 8));
          ctx.add(G_CYL, P.trunk, [6, 0.55, 8], [0.55, 6.5, 0.55], [0, 0, HPI + 0.15]); ctx.obs(6, 8, 3.2, 0.55);
          mushRing(ctx, -9, -1, 1.2, 6, P.mush2); mushRing(ctx, 9, 5, 1.0, 5, P.mush);
          ctx.anchors.shadows.push([-11, -11], [11, -9], [-11.5, 10]);
        },
        racines(ctx) {
          for (const sx of [-1, 1]) { rootWall(ctx, sx * 5.2, -10, -1.8); rootWall(ctx, sx * 5.2, 2.2, 8); trunk(ctx, sx * 9.5, -9, 1.5, 9); trunk(ctx, sx * 9.8, 6, 1.1, 6); }
          mushRing(ctx, -9.5, -2, 1.2, 6, P.mush); mushRing(ctx, 9.5, 0, 1.2, 6, P.mush2);
          ctx.mech.roots = [[-5.2, -6], [5.2, -6], [-5.2, 5], [5.2, 5]];
          ctx.anchors.shadows.push([-9, 0], [9, 0]);
        },
        marecage(ctx) {
          const pools = [[-7.5, -6, 2.6], [7, -3, 2.2], [-6, 6, 2.0], [8, 7, 1.6]];
          for (const [x, z, r] of pools) {
            ctx.glow(G_DISC, 0x0e2a1e, [x, 0.03, z], [r, 1, r * 0.8]);
            ctx.hazards.push({ x, z, r: r * 0.8, dps: 3, kind: 'eau_noire' });
            ctx.add(G_CYL, 0x1a1410, [x + r * 0.6, 1.6, z - r * 0.3], [0.25, 3.2, 0.25], [0.1, 0, 0.2]);
            for (let k = 0; k < 4; k++) ctx.add(G_CONE, 0x2a3a1a, [x + ctx.r(-r, r), 0.35, z + ctx.r(-r, r) * 0.8], [0.05, 0.7, 0.05], null, false);
          }
          trunk(ctx, -11, -11, 1.3, 7); trunk(ctx, 11, -10, 1.0, 6);
          ctx.mech.pools = pools.map((p) => [p[0], p[1]]);
        },
      },
      boss(ctx) {
        trunk(ctx, -8, -9, 2.4, 10);
        for (let i = 0; i < 8; i++) ctx.add(G_CYL, P.trunk, [-8 + Math.cos(i) * 3.5, 8, -9 + Math.sin(i) * 2.5], [0.25, 6, 0.25], [Math.cos(i) * 0.9, 0, Math.sin(i) * 0.9], false);
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * TAU + 0.4, x = Math.sin(a) * 10, z = -Math.cos(a) * 10 + 0.5;
          if (Math.abs(x) < 3 || (x < -4 && z < -6)) continue;
          ctx.add(G_BOX, 0x3a3c3a, [x, 1.1, z], [0.9, 2.2, 0.6], [0, -a, ctx.r(-0.1, 0.1)]); ctx.obs(x, z, 0.5, 0.5);
          ctx.glow(G_BOX, P.mush, [x, 1.4, z], [0.92, 0.12, 0.62], [0, -a, 0]);
        }
        mushRing(ctx, 0, 0, 5.5, 20, P.mush);
      },
      decor(ctx) {
        groundFog(ctx, ctx.layout === 'boss' ? 10 : 14, 0x8ab0a0, 0.16, { smin: 6, smax: 11, y: 0.3 });
        particles(ctx, 40, 0x9affc0, 0.1, 'spores', { op: 0.6, y1: 3 });
        if (ctx.layout !== 'secret') {
          const sp = [[-11, 3], [11, 3], [-3.5, -10.5], [11, -6]].find((p) => ctx.free(p[0], p[1], 0.7, { allowCenter: true }));
          if (sp) statue(ctx, (B, GB) => { B.add(G_CYL, 0x3a2a18, [0, 1.1, 0], [0.08, 2.2, 0.08]); B.add(G_BOX, 0x3a2a18, [0, 1.6, 0], [1.6, 0.1, 0.1]); B.add(G_BOX, 0x4a3a28, [0, 1.3, 0], [0.6, 0.8, 0.35]); B.add(G_SPH, 0x6a5a3a, [0, 2.05, 0], 0.28); B.add(G_CONE, 0x2a1a10, [0, 2.4, 0], [0.4, 0.4, 0.4]); eyes(GB, 0xff6a2a, 2.08, 0.25); }, sp[0], sp[1], 0, 'epouvantail', 0.4);
          for (let i = 0; i < 10; i++) { const x = ctx.r(-12, 12), z = ctx.r(-12, 11); if (ctx.free(x, z, 0.4, { allowCenter: false })) mushroom(ctx, x, z, ctx.r(0.4, 0.8), ctx.rnd() < 0.7 ? P.mush : P.mush2); }
          for (let i = 0; i < 4; i++) { const x = ctx.r(-11, 11), z = ctx.r(-11, 8); if (ctx.free(x, z, 0.8, { allowCenter: true })) ctx.add(G_CYL, P.trunk, [x, 0.25, z], [0.25, ctx.r(1.5, 3), 0.25], [HPI, ctx.rnd() * PI, 0]); }
        }
      },
      lights(ctx) {
        const m1 = flame(ctx, -6, 1.6, -5, 0x7affc0, 0.14), m2 = flame(ctx, 6, 1.6, 2, 0x7affc0, 0.14);
        addLight(ctx, -6, 1.6, -5, 0x5affb0, 1.5, 8, { flicker: 0.2, speed: 3, drift: { a: 2.5, s: 0.35 }, flame: m1 });
        addLight(ctx, 6, 1.6, 2, 0x5affb0, 1.3, 8, { flicker: 0.2, speed: 3.5, drift: { a: 2.5, s: 0.3 }, flame: m2 });
        addLight(ctx, 0, 9, -2, 0x7a8aff, 0.8, 24, { flicker: 0.05, speed: 1, decay: 1 });
      },
      secretDecor(ctx) { mushRing(ctx, 0, -3, 4.2, 16, P.mush2); },
    };
  })();

  // ==================================================================
  //  3. CATACOMBES OUBLIÉES — couloirs étroits, niches à ossements, sarcophages
  // ==================================================================
  DEFS.catacombes_oubliees = (() => {
    const P = { wall: 0x4a453e, stone: 0x5a544a, dark: 0x1e1b18, bone: 0xd6ccae, floor: 0x2c2925, outer: 0x040303, candle: 0xffa850,
      doorFrame: 0x3a3630, doorWood: 0x2a2a2e, doorBand: 0x3a3a40, doorKey: 0x9fb4ff, doorOpen: 0x9fb4ff, secret: 0x9fb4ff };
    function nicheWall(ctx, side, u0, u1, H, n0) {
      runBlocks(ctx, u0, u1, 1.0, 1.6, (u, len) => { wallBox(ctx, side, u, n0 + ctx.r(-0.05, 0.05), H / 2, len - 0.04, H, 1.0, jit(P.wall, ctx.rnd, 0.07)); });
      for (let u = u0 + 1.2; u < u1 - 1; u += 2.2) for (const y of [0.75, 1.65]) {
        const p = wpos(ctx, side, u, n0 + 0.42), along = side === 'N' || side === 'S';
        ctx.add(G_BOX, P.dark, [p[0], y, p[1]], along ? [1.4, 0.6, 0.25] : [0.25, 0.6, 1.4], null, false);
        for (const d of [-0.35, 0.05, 0.4]) { const q = wpos(ctx, side, u + d, n0 + 0.5); if (ctx.rnd() < 0.8) PROP.skull(ctx.B, q[0], y - 0.3, q[1], 0.14, jit(P.bone, ctx.rnd, 0.08), sideRy(side)); }
        if (side !== 'S' && y < 1) { const q = wpos(ctx, side, u, n0 + 1.3); (ctx.mech.niches = ctx.mech.niches || []).push([q[0], q[1]]); }
      }
    }
    function innerWall(ctx, x, z, hw, hd) {
      ctx.box(jit(P.wall, ctx.rnd, 0.05), x, ctx.H / 2, z, hw * 2, ctx.H, hd * 2);
      ctx.box(shade(P.wall, 0.1), x, ctx.H + 0.06, z, hw * 2 + 0.1, 0.12, hd * 2 + 0.1);
      ctx.obs(x, z, hw, hd);
      const n = Math.floor(Math.max(hw, hd) * 2 / 2.2);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const px = hw > hd ? x + t * hw * 2 : x, pz = hw > hd ? z : z + t * hd * 2;
        for (const s of [-1, 1]) {
          const qx = hw > hd ? px : px + s * (hw + 0.02), qz = hw > hd ? pz + s * (hd + 0.02) : pz;
          ctx.add(G_BOX, P.dark, [qx, 0.8, qz], hw > hd ? [1.2, 0.55, 0.12] : [0.12, 0.55, 1.2], null, false);
          PROP.skull(ctx.B, qx, 0.55, qz, 0.13, P.bone, hw > hd ? (s > 0 ? 0 : PI) : (s > 0 ? HPI : -HPI));
        }
      }
    }
    function sarcophagus(ctx, x, z, ry) {
      ctx.add(G_BOX, 0x4a463e, [x, 0.45, z], [1.1, 0.9, 2.3], [0, ry, 0]);
      ctx.add(G_BOX, 0x5e5850, [x, 0.98, z], [1.2, 0.16, 2.4], [0, ry, 0]);
      ctx.add(G_BOX, 0x6a6458, [x, 1.12, z], [0.6, 0.12, 1.6], [0, ry, 0], false);
      const hw = Math.abs(Math.cos(ry)) * 0.6 + Math.abs(Math.sin(ry)) * 1.2, hd = Math.abs(Math.sin(ry)) * 0.6 + Math.abs(Math.cos(ry)) * 1.2;
      ctx.obs(x, z, hw, hd);
      (ctx.mech.sarcophagi = ctx.mech.sarcophagi || []).push([x, z]);
    }
    function bonePillar(ctx, x, z) {
      ctx.add(G_CYL, P.stone, [x, 1.3, z], [0.7, 2.6, 0.7]);
      for (let y = 0.3; y < 2.5; y += 0.5) for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + y; PROP.skull(ctx.B, x + Math.cos(a) * 0.72, y - 0.15, z + Math.sin(a) * 0.72, 0.12, jit(P.bone, ctx.rnd, 0.1), -a + HPI); }
      ctx.obs(x, z, 0.85, 0.85);
    }
    return {
      theme: TH('Catacombes oubliées', 0x050404, [13, 40], 0x8a8070, 0x14100c, 0xc8c0ff, 0.13, 0.08, 0.85, 'amb_catacombes', 'mus_catacombes', P),
      palette: P, layouts: ['couloirs', 'ossuaire', 'sarcophages', 'fosse'], wallH: 2.6, southH: 1.0, doorStyle: 'grille', pulse: { amp: 0.3, speed: 2.2 },
      floor(g, w, h, rnd) {
        P2.flags(g, w, h, rnd, 9, P.floor, 0x141210, 0.12);
        P2.blobs(g, w, h, rnd, 30, 0x0a0908, 15, 45, 0.35);
        P2.noise(g, w, h, rnd, 300, [0xd6ccae, 0xb0a890], 1, 3, 0.35);
        P2.vignette(g, w, h, 0.7);
      },
      walls(ctx, side, u0, u1, H) { if (side === 'S') runBlocks(ctx, u0, u1, 1.0, 1.6, (u, len) => wallBox(ctx, side, u, 0, H / 2, len - 0.04, H, 1.0, jit(P.wall, ctx.rnd, 0.07))); else nicheWall(ctx, side, u0, u1, H, 0); },
      layout: {
        couloirs(ctx) {
          for (const sx of [-1, 1]) { innerWall(ctx, sx * 4.6, -7.8, 0.5, 3.4); innerWall(ctx, sx * 4.6, 6.2, 0.5, 2.0); innerWall(ctx, sx * 9.4, -5.3, 0.5, 3.6); innerWall(ctx, sx * 9.4, 5.3, 0.5, 2.6); }
          ctx.anchors.shadows.push([-7, -11], [7, -11], [-11.8, 0], [11.8, 0], [-7, 9], [7, 9]);
          ctx.mech.candleSpots = [[-7, -4], [7, -4], [0, 4]];
        },
        ossuaire(ctx) {
          for (const [x, z] of [[-5.5, -6], [5.5, -6], [-5.5, 5], [5.5, 5], [-10.5, -1], [10.5, -1], [-10, -10], [10, -10]]) bonePillar(ctx, x, z);
          for (let i = 0; i < 12; i++) PROP.bones(ctx, ctx.r(-11, 11), ctx.r(-11, 10));
          ctx.mech.candleSpots = [[-5.5, -4.5], [5.5, -4.5], [0, 6]];
        },
        sarcophages(ctx) {
          for (const z of [-8, -2.5, 3]) for (const sx of [-1, 1]) for (const x of [5.5, 9.5]) sarcophagus(ctx, sx * x, z, 0);
          ctx.mech.candleSpots = [[-7.5, -5.2], [7.5, -5.2], [0, 6]];
          ctx.anchors.shadows.push([-11.5, -11], [11.5, -11]);
        },
        fosse(ctx) {
          const fx = -6.5, fz = -5.5;
          ctx.add(G_BOX, 0x010101, [fx, 0.01, fz], [6, 0.02, 5], null, false);
          for (let i = 0; i < 20; i++) { const t = i / 20; const per = t < 0.5 ? [fx - 3 + t * 12, fz - 2.6 + (t > 0.25 ? 5.2 : 0)] : [fx - 3 + (t > 0.75 ? 6 : 0), fz - 2.5 + (t - 0.5) * 20]; PROP.skull(ctx.B, per[0], 0, per[1], 0.14, P.bone, ctx.rnd() * TAU); }
          ctx.add(G_BOX, P.stone, [fx, 0.2, fz - 2.7], [6.2, 0.4, 0.3]); ctx.add(G_BOX, P.stone, [fx, 0.2, fz + 2.7], [6.2, 0.4, 0.3]);
          ctx.obs(fx, fz, 3.1, 2.6);
          ctx.mech.pit = { x: fx, z: fz, hw: 3, hd: 2.5 };
          sarcophagus(ctx, 7, -8, HPI); sarcophagus(ctx, 8.5, 4, 0.3);
          innerWall(ctx, 6, -2, 2.4, 0.5);
          ctx.anchors.sounds.push([fx, fz]);
          ctx.mech.candleSpots = [[-3, -1.8], [6, -3.5], [-7, 5]];
        },
      },
      boss(ctx) {
        // trône de crânes (nord-ouest) et quatre colonnes d'os
        ctx.add(G_BOX, P.stone, [-7, 0.4, -10], [5, 0.8, 3.6]); ctx.obs(-7, -10, 2.5, 1.8);
        for (let i = 0; i < 40; i++) PROP.skull(ctx.B, -7 + ctx.r(-2, 2), 0.8 + ctx.r(0, 1.8), -11 + ctx.r(-0.4, 0.4), 0.16, jit(P.bone, ctx.rnd, 0.1), ctx.r(-0.4, 0.4));
        ctx.glow(G_SPH_LO, 0x9fb4ff, [-7.4, 2.4, -10.4], 0.08); ctx.glow(G_SPH_LO, 0x9fb4ff, [-6.6, 2.4, -10.4], 0.08);
        for (const [x, z] of [[-9, 0], [9, 0], [8, -8], [-9, 7]]) bonePillar(ctx, x, z);
        ctx.mech.candleSpots = [[-7, -8], [7, -5], [0, 6]];
      },
      decor(ctx) {
        particles(ctx, 45, 0xc8c0a8, 0.07, 'dust', { op: 0.45, additive: false });
        if (ctx.layout !== 'secret') {
          for (let i = 0; i < 8; i++) PROP.bones(ctx, ctx.r(-12, 12), ctx.r(-12, 10));
          const sp = [[-11.5, -7], [11.5, -7], [-11.5, 8], [11.5, 8]].filter((p) => ctx.free(p[0], p[1], 0.6, { allowCenter: true }));
          sp.slice(0, 2).forEach((p) => statue(ctx, (B, GB) => { humanoid(B, 0x5a5650, { robe: true, hood: true, s: 1.05 }); GB.add(G_SPH_LO, 0x9fb4ff, [0, 1.8, 0.22], 0.035); }, p[0], p[1], p[0] < 0 ? HPI : -HPI, 'moine', 0.45));
        }
      },
      lights(ctx) {
        (ctx.mech.candleSpots || [[-6, -6], [6, -6], [0, 6]]).slice(0, 3).forEach((p) => { PROP.candles(ctx, p[0], p[1], 5, 0xffb060); addLight(ctx, p[0], 1.1, p[1], 0xff9a50, 1.3, 7, { flicker: 0.45, speed: 13 }); });
      },
      secretDecor(ctx) { for (let i = 0; i < 30; i++) PROP.skull(ctx.B, ctx.r(-7, 7), 0, ctx.r(-12, -7), 0.15, P.bone, ctx.rnd() * TAU); ctx.mech.candleSpots = [[0, -5]]; },
    };
  })();

  // ==================================================================
  //  4. CHÂTEAU MAUDIT — damier, tapis déchiré, armures, lustres, vitraux, portraits
  // ==================================================================
  DEFS.chateau_maudit = (() => {
    const P = { wall: 0x2a2630, stone: 0x342f38, wain: 0x3a1c12, carpet: 0x5a0a10, gold: 0xa8843a, armor: 0x767c86, floor: 0x1a1418, outer: 0x030203,
      doorFrame: 0x2a2028, doorWood: 0x2a140c, doorBand: 0xa8843a, doorKey: 0xff3040, doorOpen: 0xff6a6a, secret: 0xffd080 };
    function chandelierBuild(B, GB) {
      B.add(torus(0.08, TAU, 18), P.gold, [0, 0, 0], [1.2, 1.2, 1.2], [HPI, 0, 0]);
      B.add(torus(0.06, TAU, 14), P.gold, [0, 0.35, 0], [0.6, 0.6, 0.6], [HPI, 0, 0]);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; B.add(G_CYL, 0xe8dcc0, [Math.cos(a) * 1.2, 0.18, Math.sin(a) * 1.2], [0.06, 0.32, 0.06], null, false); GB.add(G_CONE, 0xffc070, [Math.cos(a) * 1.2, 0.42, Math.sin(a) * 1.2], [0.06, 0.18, 0.06]); }
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; B.add(G_CYL, P.gold, [Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6], [0.03, 1.2, 0.03], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], false); }
      B.add(G_CYL, 0x222222, [0, 2.6, 0], [0.03, 4, 0.03], null, false);
    }
    function chandeliers(ctx, list) {
      const gs = dynMany(ctx, chandelierBuild, list.map((p) => [p[0], 4.3, p[1], ctx.rnd()]));
      ctx.mech.chandeliers = gs.map((g, i) => ({ x: list[i][0], z: list[i][1], obj: g, fallen: false, y0: 4.3 }));
      ctx.anim((dt, t) => { for (const c of ctx.mech.chandeliers) if (!c.fallen && c.obj) c.obj.rotation.z = Math.sin(t * 0.7 + c.x) * 0.03; });
    }
    function armor(ctx, x, z, ry) {
      return statue(ctx, (B, GB) => { humanoid(B, P.armor, { helm: true, pedestal: 0x2a2630, y: 0.4 }); B.add(G_BOX, 0x9aa0aa, [0.5, 1.4, 0.15], [0.06, 1.8, 0.12], [0.15, 0, 0]); GB.add(G_BOX, 0xff3040, [0, 2.26, 0.27], [0.24, 0.03, 0.02]); }, x, z, ry, 'armure', 0.55);
    }
    function portrait(ctx, side, u) {
      const p = wpos(ctx, side, u, 0.06), along = side === 'N';
      ctx.add(G_BOX, P.gold, [p[0], 2.1, p[1]], along ? [1.5, 1.9, 0.12] : [0.12, 1.9, 1.5]);
      const q = wpos(ctx, side, u, 0.12);
      ctx.add(G_BOX, 0x120a0c, [q[0], 2.1, q[1]], along ? [1.2, 1.6, 0.06] : [0.06, 1.6, 1.2], null, false);
      const e = wpos(ctx, side, u, 0.16);
      for (const d of [-0.12, 0.12]) { const ex = along ? e[0] + d : e[0], ez = along ? e[1] : e[1] + d; ctx.glow(G_SPH_LO, 0x8a1020, [ex, 2.35, ez], 0.035); }
      (ctx.mech.portraits = ctx.mech.portraits || []).push([e[0], e[1], side]);
    }
    function carpet(ctx, z0, z1) {
      for (let z = z0; z < z1; z += 1.0) {
        const torn = ctx.rnd() < 0.18;
        ctx.add(G_BOX, jit(P.carpet, ctx.rnd, 0.1), [ctx.r(-0.1, 0.1), 0.02, z + 0.5], [torn ? ctx.r(1.6, 2.6) : 3.0, 0.03, 1.0], [0, ctx.r(-0.04, 0.04), 0], false);
      }
      for (const s of [-1, 1]) ctx.add(G_BOX, P.gold, [s * 1.55, 0.035, (z0 + z1) / 2], [0.1, 0.03, z1 - z0 - 1], null, false);
    }
    return {
      theme: TH('Château maudit', 0x050306, [15, 46], 0x7a6a9a, 0x140810, 0x8090ff, 0.15, 0.1, 0.8, 'amb_chateau', 'mus_chateau', P),
      palette: P, layouts: ['grand_hall', 'salle_bal', 'galerie', 'banquet'], wallH: 3.2, southH: 1.1, doorStyle: 'bois', pulse: { amp: 0.15, speed: 1.6 },
      floor(g, w, h, rnd) {
        P2.tiles(g, w, h, 8, 0x1a1418, 0x3a2a2e, 0x0a0608, rnd, 0.05);
        P2.cracks(g, w, h, rnd, 14, 0x6a5a60, 1, 0.35);
        P2.blobs(g, w, h, rnd, 10, 0x2a0006, 20, 50, 0.25);
        P2.vignette(g, w, h, 0.65);
      },
      walls(ctx, side, u0, u1, H) {
        runBlocks(ctx, u0, u1, 1.4, 2.0, (u, len) => wallBox(ctx, side, u, 0, H / 2, len - 0.04, H, 1.0, jit(P.wall, ctx.rnd, 0.05)));
        if (side === 'S') return;
        wallBox(ctx, side, (u0 + u1) / 2, 0.45, 0.6, u1 - u0, 1.2, 0.18, P.wain);
        wallBox(ctx, side, (u0 + u1) / 2, 0.5, 1.22, u1 - u0, 0.08, 0.24, P.gold, false);
        for (let u = u0 + 2; u < u1 - 1; u += 4) { wallBox(ctx, side, u, 0.3, H / 2 + 0.2, 0.6, H + 0.4, 0.6, P.stone); }
        if (side === 'N') for (const u of [-10.5, -6.5, 6.5, 10.5]) {
          if (u < u0 || u > u1) continue;
          const p = wpos(ctx, side, u, 0.42);
          ctx.add(G_BOX, 0x111111, [p[0], 2.0, p[1]], [1.3, 2.4, 0.08], null, false);
          const cols = [0x2a3aff, 0xa01a3a, 0x2a8a5a, 0xd0a030];
          for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) ctx.glow(G_BOX, cols[(i + j + Math.round(u)) % 4], [p[0] - 0.4 + i * 0.4, 1.1 + j * 0.55, p[1] + 0.05], [0.34, 0.48, 0.02]);
          ctx.add(G_CONE4, 0x111111, [p[0], 3.35, p[1]], [0.75, 0.6, 0.08], [0, PI / 4, 0], false);
        } else for (let u = u0 + 4; u < u1 - 2; u += 6) if (u < 6) portrait(ctx, side, u);
      },
      layout: {
        grand_hall(ctx) {
          carpet(ctx, -13, 12);
          for (const sx of [-1, 1]) {
            for (const z of [-8.5, -3, 2.5]) PROP.pillar(ctx, sx * 5.5, z, 0.55, 3.6, P.stone, P.gold);
            for (const z of [-5.8, -0.3]) armor(ctx, sx * 9.5, z, sx > 0 ? -HPI : HPI);
          }
          chandeliers(ctx, [[0, -6], [0, 2]]);
          ctx.anchors.shadows.push([-8, -11], [8, -11], [-11.5, 5], [11.5, 5]);
        },
        salle_bal(ctx) {
          carpet(ctx, 5, 12);
          chandeliers(ctx, [[-6, -5], [6, -5], [0, 3]]);
          for (let i = 0; i < 6; i++) { const x = -12 + i * 1.2; ctx.add(G_BOX, P.wain, [x, 0.45, -12.5], [0.6, 0.9, 0.6]); ctx.add(G_BOX, P.wain, [-x, 0.45, -12.5], [0.6, 0.9, 0.6]); }
          // horloge (pendule animé)
          ctx.add(G_BOX, 0x2a140c, [11.8, 1.6, -11.8], [1.0, 3.2, 0.8]); ctx.obs(11.8, -11.8, 0.6, 0.5);
          ctx.glow(G_CYL, 0xe8dcc0, [11.8, 2.7, -11.38], [0.32, 0.02, 0.32], [HPI, 0, 0]);
          const pend = dynGroup(ctx, (B) => { B.add(G_CYL, P.gold, [0, -0.5, 0], [0.02, 1.0, 0.02]); B.add(G_CYL, P.gold, [0, -1.05, 0], [0.16, 0.05, 0.16], [HPI, 0, 0]); }, 11.8, 2.2, -11.35, 0);
          ctx.anim((dt, t) => { pend.rotation.z = Math.sin(t * 2.4) * 0.35; });
          ctx.anchors.sounds.push([11.8, -11.8]);
          // miroirs ouest
          for (const z of [-6, 0]) { const p = wpos(ctx, 'W', z, 0.1); ctx.add(G_BOX, P.gold, [p[0], 1.8, p[1]], [0.1, 2.4, 1.4]); ctx.glow(G_BOX, 0x1a2a3a, [p[0] + 0.07, 1.8, p[1]], [0.02, 2.1, 1.15]); }
          ctx.mech.mirrors = [[-13.5, -6], [-13.5, 0]];
        },
        galerie(ctx) {
          carpet(ctx, -13, 2);
          ctx.box(P.wall, 8.5, ctx.H / 2, -8.2, 9, ctx.H, 9.6); ctx.obs(8.5, -8.2, 4.5, 4.8);
          ctx.box(P.wain, 8.5, 0.6, -3.35, 9, 1.2, 0.1, 0, false);
          ctx.box(P.wall, -10, ctx.H / 2, 8.5, 6, ctx.H, 4); ctx.obs(-10, 8.5, 3, 2);
          for (const x of [5.5, 9, 12.4]) { ctx.add(G_BOX, P.gold, [x, 2.0, -3.3], [1.4, 1.8, 0.1]); ctx.add(G_BOX, 0x120a0c, [x, 2.0, -3.24], [1.1, 1.5, 0.05], null, false); ctx.glow(G_SPH_LO, 0x8a1020, [x - 0.12, 2.3, -3.2], 0.035); ctx.glow(G_SPH_LO, 0x8a1020, [x + 0.12, 2.3, -3.2], 0.035); }
          ctx.mech.portraits = (ctx.mech.portraits || []).concat([[5.5, -3.2, 'S'], [9, -3.2, 'S'], [12.4, -3.2, 'S']]);
          for (const [x, z] of [[-5, -9], [-5, -3], [5, 2], [10, 2]]) armor(ctx, x, z, x < 0 ? HPI : PI);
          chandeliers(ctx, [[-4, -6], [5, 6]]);
          ctx.anchors.shadows.push([3.5, -12], [-12, 4]);
        },
        banquet(ctx) {
          carpet(ctx, 4, 12);
          for (const sx of [-1, 1]) {
            const x = sx * 7.6;
            ctx.box(P.wain, x, 0.8, -5, 7, 0.16, 2.0); ctx.obs(x, -5, 3.5, 1.0);
            for (const dx of [-3, 3]) ctx.add(G_BOX, shade(P.wain, -0.3), [x + dx, 0.4, -5], [0.2, 0.8, 1.6], null, false);
            ctx.add(G_BOX, 0xe8dcc0, [x, 0.9, -5], [6.6, 0.03, 1.7], null, false);
            for (let i = 0; i < 5; i++) { const cx = x - 2.8 + i * 1.4; ctx.add(G_BOX, P.wain, [cx, 0.5, -6.6 + (i % 2 ? 0 : 3.2)], [0.5, 1.0, 0.5], [ctx.r(-0.2, 0.2), 0, i === 2 ? HPI * 0.9 : 0]); ctx.add(G_CYL, 0xc0c0c8, [cx, 0.95, -5.2], [0.18, 0.04, 0.18], null, false); }
            ctx.add(G_CYL, P.gold, [x, 1.25, -5], [0.06, 0.7, 0.06]); PROP.candles(ctx, x, -5, 0, 0xffc070); ctx.glow(G_CONE, 0xffc070, [x, 1.75, -5], [0.06, 0.2, 0.06]);
          }
          chandeliers(ctx, [[0, -5], [0, 4]]);
          armor(ctx, -11.5, -10, HPI); armor(ctx, 11.5, -10, -HPI);
        },
      },
      boss(ctx) {
        carpet(ctx, -13, 12);
        for (const u of [-8, 8]) { const p = wpos(ctx, 'N', u, 0.3); ctx.add(G_BOX, P.gold, [p[0], 2.1, p[1]], [2.2, 3.4, 0.2]); ctx.glow(G_BOX, 0x30405a, [p[0], 2.1, p[1] + 0.12], [1.8, 3.0, 0.02]); }
        ctx.mech.mirrors = [[-8, -13.4], [8, -13.4]];
        ctx.add(G_CYL, 0x2a1a20, [0, 0.07, -1], [7.5, 0.14, 7.5], null, false);
        ctx.glow(ringG(0.96, 48), 0x6a0a14, [0, 0.16, -1], [7.5, 1, 7.5]);
        chandeliers(ctx, [[-6, -3], [6, -3], [0, 5]]);
        for (const [x, z] of [[-11, -6], [11, -6], [-11, 4], [11, 4]]) armor(ctx, x, z, x < 0 ? HPI : -HPI);
      },
      decor(ctx) {
        particles(ctx, 40, 0xd0c0d8, 0.07, 'dust', { op: 0.35, additive: false });
        if (ctx.layout !== 'secret') for (const [x, z] of [[-12, 11], [12, 11]]) if (ctx.free(x, z, 0.5, { allowCenter: true })) { ctx.add(G_CYL, P.gold, [x, 0.8, z], [0.05, 1.6, 0.05]); ctx.glow(G_CONE, 0xffc070, [x, 1.75, z], [0.07, 0.22, 0.07]); }
      },
      lights(ctx) {
        const C = ctx.mech.chandeliers || [];
        C.slice(0, 2).forEach((c) => addLight(ctx, c.x, 3.6, c.z, 0xffb060, 1.6, 11, { flicker: 0.3, speed: 8 }));
        addLight(ctx, -6.5, 3, -12.3, 0x5a6aff, 1.2, 12, { flicker: 0.08, speed: 1.5 });
        if (!C.length) addLight(ctx, 0, 3, -3, 0xffb060, 1.4, 10, { flicker: 0.3 });
        if (C[2]) addLight(ctx, C[2].x, 3.6, C[2].z, 0xffb060, 1.2, 10, { flicker: 0.3, speed: 7 });
      },
      secretDecor(ctx) { chandeliers(ctx, [[0, -4]]); ctx.add(G_BOX, P.gold, [0, 0.3, -9.5], [3, 0.6, 1.5]); },
    };
  })();

  // ==================================================================
  //  5. CATHÉDRALE NOYÉE — nef inondée, colonnes gothiques, vitraux bleus, eau qui monte
  // ==================================================================
  DEFS.cathedrale_noyee = (() => {
    const P = { wall: 0x2a3640, stone: 0x34424c, pew: 0x2a1c14, water: 0x1a5a7a, glass: 0x3ab0ff, floor: 0x1e2a30, outer: 0x02060a,
      doorFrame: 0x2a3640, doorWood: 0x1a2a34, doorBand: 0x4a6a7a, doorKey: 0x6ad8ff, doorOpen: 0x6ad8ff, secret: 0x6ad8ff };
    function column(ctx, x, z, h) {
      h = h || 4.2;
      ctx.add(G_CYL, jit(P.stone, ctx.rnd, 0.06), [x, h / 2, z], [0.55, h, 0.55]);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; ctx.add(G_CYL6, shade(P.stone, -0.1), [x + Math.cos(a) * 0.5, h / 2, z + Math.sin(a) * 0.5], [0.13, h, 0.13], null, false); }
      ctx.add(G_BOX, shade(P.stone, 0.1), [x, 0.15, z], [1.4, 0.3, 1.4]);
      ctx.add(G_BOX, shade(P.stone, 0.1), [x, h, z], [1.3, 0.25, 1.3]);
      ctx.add(G_CYL, 0x1a4a2a, [x, 0.45, z], [0.6, 0.35, 0.6], null, false);
      ctx.obs(x, z, 0.7, 0.7);
    }
    function pew(ctx, x, z, ry, tilt) {
      ctx.add(G_BOX, P.pew, [x, 0.45, z], [3.0, 0.12, 0.7], [tilt || 0, ry || 0, 0]);
      ctx.add(G_BOX, P.pew, [x, 0.75, z - 0.32], [3.0, 0.7, 0.1], [tilt || 0, ry || 0, 0]);
      for (const d of [-1.3, 1.3]) ctx.add(G_BOX, shade(P.pew, -0.2), [x + d * Math.cos(ry || 0), 0.22, z - d * Math.sin(ry || 0)], [0.12, 0.45, 0.6], [0, ry || 0, 0], false);
      const c = Math.abs(Math.cos(ry || 0)), s = Math.abs(Math.sin(ry || 0));
      ctx.obs(x, z, 1.5 * c + 0.4 * s, 1.5 * s + 0.4 * c);
    }
    function angel(ctx, x, z, ry) { return statue(ctx, (B, GB) => { humanoid(B, 0x6a7a80, { robe: true, wings: true, pedestal: 0x3a4a52, y: 0.4, armsUp: true }); GB.add(G_BOX, 0x9adfff, [0, 2.2, 0.24], [0.2, 0.03, 0.02]); }, x, z, ry, 'ange', 0.55); }
    function water(ctx) {
      const m = new T.MeshBasicMaterial({ color: P.water, transparent: true, opacity: 0.32, depthWrite: false });
      const w = new T.Mesh(G_FLAT, m); w.scale.set(ctx.half * 2, 1, ctx.half * 2); w.position.y = 0.12; w.renderOrder = 2; ctx.group.add(w); ctx.own(m);
      const st = { level: 0.12, target: 0.12 };
      ctx.mech.water = { obj: w, base: 0.12, set(l) { st.target = clamp(l, 0.05, 1.4); }, get level() { return st.level; } };
      ctx.anim((dt, t) => { st.level += (st.target - st.level) * Math.min(1, dt * 0.8); w.position.y = st.level + Math.sin(t * 0.8) * 0.02; m.opacity = 0.28 + 0.06 * Math.sin(t * 1.3) + st.level * 0.15; });
      // ombres de poissons
      const fish = dynMany(ctx, (B) => { B.add(G_SPH, 0x020608, [0, 0, 0], [0.5, 0.02, 1.6], null, false); }, [[0, 0.06, 0], [0, 0.06, 0]]);
      ctx.anim((dt, t) => fish.forEach((f, i) => { const a = t * (0.15 + i * 0.07) + i * 3; f.position.x = Math.cos(a) * (8 - i * 2); f.position.z = Math.sin(a) * (7 - i) - 1; f.rotation.y = -a; }));
    }
    function weed(ctx, x, z) { const g = dynGroup(ctx, (B) => { for (let i = 0; i < 3; i++) B.add(G_CONE, 0x1a4a2a, [i * 0.15 - 0.15, 0.6, 0], [0.06, 1.2 + i * 0.3, 0.06], null, false); }, x, 0, z, 0); ctx.anim((dt, t) => { g.rotation.z = Math.sin(t * 1.2 + x) * 0.18; }); }
    return {
      theme: TH('Cathédrale noyée', 0x02060a, [14, 44], 0x4a8aaa, 0x081420, 0x6ad8ff, 0.16, 0.12, 0.75, 'amb_cathedrale', 'mus_cathedrale', P),
      palette: P, layouts: ['nef', 'transept', 'abside', 'crypte_inondee'], wallH: 3.6, southH: 1.0, doorStyle: 'grille', pulse: { amp: 0.3, speed: 0.8 },
      floor(g, w, h, rnd) {
        P2.tiles(g, w, h, 10, 0x1e2a30, 0x24323a, 0x0e161a, rnd, 0.08);
        P2.blobs(g, w, h, rnd, 50, 0x1a3a2a, 10, 40, 0.35);
        P2.cracks(g, w, h, rnd, 10, 0x0a1014, 2, 0.5);
        P2.vignette(g, w, h, 0.6);
      },
      walls(ctx, side, u0, u1, H) {
        runBlocks(ctx, u0, u1, 1.2, 2, (u, len) => wallBox(ctx, side, u, 0, H / 2, len - 0.04, H, 1.0, jit(P.wall, ctx.rnd, 0.06)));
        if (side === 'S') return;
        for (let u = u0 + 1.5; u < u1 - 0.5; u += 3) {
          const p = wpos(ctx, side, u, 0.45); ctx.add(G_CYL, P.stone, [p[0], H / 2, p[1]], [0.32, H, 0.32]);
          const q = wpos(ctx, side, u + 1.5, 0.48);
          if (u + 1.5 < u1 - 1) { const along = side === 'N'; ctx.glow(G_BOX, P.glass, [q[0], 1.9, q[1]], along ? [0.8, 2.2, 0.03] : [0.03, 2.2, 0.8]); ctx.add(G_BOX, 0x0a1218, [q[0], 1.9, q[1]], along ? [0.06, 2.3, 0.05] : [0.05, 2.3, 0.06], null, false); }
        }
        if (side === 'N') {
          for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const x = s * (3.4 + i * 0.42), hh = 2.2 + Math.sin(i * 1.3) * 0.8 + (5 - i) * 0.25; ctx.add(G_CYL, 0x5a6a70, [x, hh / 2, -13.2], [0.18, hh, 0.18]); ctx.add(G_CYL, 0x0a0a0a, [x, hh * 0.25, -13.03], [0.06, 0.12, 0.06], [HPI, 0, 0], false); }
          ctx.glow(ringG(0.75, 24), P.glass, [0, 4.0, -13.6], [1.4, 1, 1.4], [HPI, 0, 0]);
        }
      },
      layout: {
        nef(ctx) {
          for (const sx of [-1, 1]) { for (const z of [-9, -4, 1, 6]) column(ctx, sx * 5.2, z); for (const z of [-7, -3, 1.5]) pew(ctx, sx * 9.6, z, 0, ctx.rnd() < 0.3 ? 0.5 : 0); }
          angel(ctx, -11.5, -11, HPI * 0.5);
        },
        transept(ctx) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const cx = sx * 9, cz = sz * 7 - 1.5; column(ctx, cx - sx * 2.6, cz - sz * 2.2); pew(ctx, cx, cz, 0, 0); pew(ctx, cx, cz + sz * 1.8, 0, sz > 0 ? 0.4 : 0); }
          const bell = dynGroup(ctx, (B) => { B.add(G_CONE, 0x7a6a3a, [0, 0, 0], [1.0, 1.4, 1.0]); B.add(G_SPH, 0x5a4a2a, [0, -0.7, 0], 0.18); B.add(G_CYL, 0x222222, [0, 2, 0], [0.04, 2.6, 0.04], null, false); }, 0, 4.4, -2, 0);
          ctx.mech.bell = { x: 0, z: -2, obj: bell };
          ctx.anim((dt, t) => { bell.rotation.x = Math.sin(t * 0.6) * 0.06; });
        },
        abside(ctx) {
          for (let i = 0; i < 7; i++) { const a = PI + 0.35 + i / 6 * (PI - 0.7); const x = Math.cos(a) * 9.5, z = Math.sin(a) * 7 - 4; if (Math.abs(x) < 3) continue; column(ctx, x, z); }
          ctx.box(0x4a5a62, -7, 0.55, 5.5, 3, 1.1, 1.4); ctx.obs(-7, 5.5, 1.5, 0.7); ctx.box(0xd8d0c0, -7, 1.12, 5.5, 3.1, 0.04, 1.5, 0, false);
          PROP.candles(ctx, -7, 5.5, 0, 0xffc080);
          for (const z of [3, 7]) pew(ctx, 8, z, 0, 0);
          angel(ctx, 11, -1, -HPI);
          ctx.anchors.shadows.push([-10, -10], [10, -10]);
        },
        crypte_inondee(ctx) {
          const pools = [[-8, -7, 2.4], [7.5, -6, 2.0], [-7, 6, 1.8], [8, 5, 2.2]];
          for (const [x, z, r] of pools) { ctx.glow(G_DISC, 0x041420, [x, 0.04, z], [r, 1, r]); PROP.rubble(ctx, x + r, z, 1, P.stone, 4); }
          ctx.mech.pools = pools.map((p) => [p[0], p[1]]);
          for (let i = 0; i < 4; i++) ctx.add(G_CYL, P.stone, [3 + i * 1.6, 0.5, -10 + i * 0.6], [0.55, 1.6, 0.55], [HPI, 0.35, 0]);
          ctx.obs(5.4, -9.1, 3.2, 0.7);
          column(ctx, -11, -1); column(ctx, 11, 0.5);
        },
      },
      boss(ctx) {
        for (const sx of [-1, 1]) for (const z of [-9, -2, 5]) column(ctx, sx * 10, z);
        const st = statue(ctx, (B, GB) => { humanoid(B, 0x5a6a70, { robe: true, s: 2.2, armsUp: true, wings: true }); GB.add(G_BOX, 0x6ad8ff, [0, 4.0, 0.5], [0.5, 0.06, 0.04]); }, 8, -10, -0.5, 'sainte', 1.2);
        st.rotation.z = 0.12;
        for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; PROP.candles(ctx, Math.cos(a) * 7, Math.sin(a) * 6 - 1, 1, 0xffc080); }
      },
      decor(ctx) {
        water(ctx);
        groundFog(ctx, 8, 0x6aa8c0, 0.1, { smin: 6, smax: 10, y: 0.4 });
        particles(ctx, 30, 0x9adfff, 0.07, 'embers', { y1: 3.5, op: 0.4 });
        if (ctx.layout !== 'secret') for (let i = 0; i < 5; i++) { const x = ctx.r(-12, 12), z = ctx.r(-11, 10); if (ctx.free(x, z, 0.4)) weed(ctx, x, z); }
      },
      lights(ctx) {
        addLight(ctx, 0, 3.4, -11.5, 0x40c0ff, 1.5, 13, { flicker: 0.1, speed: 1.2 });
        addLight(ctx, -8, 1.4, 2, 0xffc080, 1.0, 7, { flicker: 0.4, speed: 10 });
        addLight(ctx, 8, 1.4, -4, 0xffc080, 1.0, 7, { flicker: 0.4, speed: 9 });
      },
      secretDecor(ctx) { angel(ctx, -5, -10, 0.4); angel(ctx, 5, -10, -0.4); },
    };
  })();

  // ==================================================================
  //  6. TEMPLE SANGLANT — autels, canaux de sang, glyphes lumineux, colonnes massives
  // ==================================================================
  DEFS.temple_sanglant = (() => {
    const P = { wall: 0x3a2420, stone: 0x4a2e26, dark: 0x1e100c, blood: 0x8a0a10, glyph: 0xff2a3a, gold: 0x9a7a3a, floor: 0x2a1814, outer: 0x060202,
      doorFrame: 0x3a2420, doorWood: 0x4a2e26, doorBand: 0x9a7a3a, doorKey: 0xff2a3a, doorOpen: 0xff5a5a, secret: 0xff6a4a };
    function bigColumn(ctx, x, z) {
      ctx.add(G_BOX, jit(P.stone, ctx.rnd, 0.06), [x, 2.1, z], [1.4, 4.2, 1.4]);
      ctx.add(G_BOX, shade(P.stone, 0.12), [x, 4.3, z], [1.8, 0.4, 1.8]); ctx.add(G_BOX, shade(P.stone, -0.1), [x, 0.2, z], [1.8, 0.4, 1.8]);
      for (const [dx, dz] of [[0, 0.71], [0, -0.71], [0.71, 0], [-0.71, 0]]) ctx.glow(G_BOX, P.glyph, [x + dx, 2.2, z + dz], [dx ? 0.02 : 0.5, 0.5, dz ? 0.02 : 0.5]);
      ctx.obs(x, z, 0.9, 0.9);
    }
    function altar(ctx, x, z, big) {
      const s = big ? 1.5 : 1;
      ctx.add(G_BOX, P.dark, [x, 0.25 * s, z], [3.2 * s, 0.5 * s, 2.2 * s]); ctx.add(G_BOX, P.stone, [x, 0.75 * s, z], [2.4 * s, 0.5 * s, 1.4 * s]);
      ctx.glow(G_BOX, P.blood, [x, 1.01 * s, z], [2.0 * s, 0.02, 1.0 * s]);
      for (const sx of [-1, 1]) { ctx.add(G_CYL, P.gold, [x + sx * 1.3 * s, 1.1 * s, z], [0.25, 0.2, 0.25]); ctx.glow(G_CONE, 0xff4020, [x + sx * 1.3 * s, 1.45 * s, z], [0.16, 0.45, 0.16]); }
      ctx.obs(x, z, 1.6 * s, 1.1 * s);
      (ctx.mech.altars = ctx.mech.altars || []).push([x, z]);
    }
    function channel(ctx, x, z, hw, hd) {
      ctx.add(G_BOX, P.dark, [x, 0.01, z], [hw * 2 + 0.3, 0.02, hd * 2 + 0.3], null, false);
      ctx.glow(G_BOX, P.blood, [x, 0.03, z], [hw * 2, 0.02, hd * 2]);
      (ctx.mech.channels = ctx.mech.channels || []).push({ x, z, hw, hd });
    }
    function slab(ctx, x, z) { ctx.add(G_BOX, 0x5a3a30, [x, 0.03, z], [2, 0.05, 2], null, false); ctx.glow(ringG(0.85, 24), P.glyph, [x, 0.06, z], [0.9, 1, 0.9]); (ctx.mech.slabs = ctx.mech.slabs || []).push([x, z]); }
    return {
      theme: TH('Temple sanglant', 0x060202, [14, 44], 0x9a5a50, 0x1a0606, 0xff8a6a, 0.14, 0.1, 0.8, 'amb_temple', 'mus_temple', P),
      palette: P, layouts: ['autel', 'canaux', 'colonnade', 'escaliers'], wallH: 3.0, southH: 1.0, doorStyle: 'dalle', pulse: { amp: 0.45, speed: 1.1 },
      floor(g, w, h, rnd) {
        P2.flags(g, w, h, rnd, 7, P.floor, 0x100806, 0.1);
        P2.blobs(g, w, h, rnd, 25, 0x4a0608, 8, 30, 0.35);
        g.strokeStyle = css(0x5a1a14, 0.5); g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w / 2, h / 2, 60 + i * 40, 0, TAU); g.stroke(); }
        P2.vignette(g, w, h, 0.65);
      },
      floorGlow(g, w, h) { g.strokeStyle = 'rgba(120,0,10,0.9)'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30); g.lineTo(w / 2 + Math.cos(a) * 110, h / 2 + Math.sin(a) * 110); g.stroke(); } },
      walls(ctx, side, u0, u1, H) {
        runBlocks(ctx, u0, u1, 1.6, 2.6, (u, len) => wallBox(ctx, side, u, ctx.r(-0.05, 0.05), H / 2, len - 0.06, H, 1.1, jit(P.wall, ctx.rnd, 0.07)));
        if (side === 'S') return;
        for (let u = u0 + 2.5; u < u1 - 1; u += 5) {
          const p = wpos(ctx, side, u, 0.6), along = side === 'N';
          ctx.add(G_BOX, P.stone, [p[0], 1.6, p[1]], along ? [1.2, 1.4, 0.3] : [0.3, 1.4, 1.2]);
          const q = wpos(ctx, side, u, 0.78);
          ctx.glow(G_SPH_LO, P.glyph, [along ? q[0] - 0.25 : q[0], 1.8, along ? q[1] : q[1] - 0.25], 0.07); ctx.glow(G_SPH_LO, P.glyph, [along ? q[0] + 0.25 : q[0], 1.8, along ? q[1] : q[1] + 0.25], 0.07);
        }
        if (side === 'N') for (const s of [-1, 1]) for (let k = 0; k < 4; k++) ctx.box(shade(P.stone, -k * 0.05), s * (5.5 + k * 0.9), 0.5 + k * 0.9, -13.4 + k * 0.1, 4 - k * 0.6, 1, 1.2 - k * 0.15);
      },
      layout: {
        autel(ctx) { altar(ctx, -7.5, -6.5, false); altar(ctx, 7.5, -6.5, false); channel(ctx, -7.5, -1, 0.3, 4); channel(ctx, 7.5, -1, 0.3, 4); channel(ctx, 0, 3, 7.8, 0.3); for (const [x, z] of [[-4, 7], [4, 7], [0, -6]]) slab(ctx, x, z); bigColumn(ctx, -11, 5); bigColumn(ctx, 11, 5); },
        canaux(ctx) {
          for (const z of [-5, 4]) { channel(ctx, -8.5, z, 4.5, 0.6); channel(ctx, 8.5, z, 4.5, 0.6); }
          channel(ctx, 0, -0.5, 0.6, 3.6);
          for (const [x, z] of [[-11, -9], [11, -9], [-11, 9], [11, 9]]) bigColumn(ctx, x, z);
          for (const [x, z] of [[-5, 0], [5, 0]]) slab(ctx, x, z);
        },
        colonnade(ctx) { for (const sx of [-1, 1]) for (const z of [-8, -2.5, 3]) bigColumn(ctx, sx * 6, z); for (const z of [-5, 0.5]) { slab(ctx, -9.5, z); slab(ctx, 9.5, z); } channel(ctx, 0, 7.5, 3, 0.3); },
        escaliers(ctx) {
          for (const [x, z, sx, sz] of [[-9.5, -9.5, 1, 1], [9.5, -9.5, -1, 1], [-9.5, 7.5, 1, -1], [9.5, 7.5, -1, -1]]) {
            for (let k = 0; k < 3; k++) ctx.box(shade(P.stone, k * 0.05), x - sx * k * 0.6, 0.35 + k * 0.7, z - sz * k * 0.6, 4 - k * 1.2, 0.7 + k * 0.7, 4 - k * 1.2);
            ctx.obs(x, z, 2, 2); ctx.glow(G_CONE, 0xff4020, [x - sx * 1.2, 2.6, z - sz * 1.2], [0.2, 0.6, 0.2]);
          }
          altar(ctx, 0, -6.8, false); slab(ctx, -5, 2); slab(ctx, 5, 2);
        },
      },
      boss(ctx) { altar(ctx, 0, -6.2, true); for (const sx of [-1, 1]) { bigColumn(ctx, sx * 9, -7); bigColumn(ctx, sx * 9, 3); channel(ctx, sx * 5.5, 0, 0.35, 7); } channel(ctx, 0, 7.6, 5.5, 0.35); },
      decor(ctx) {
        particles(ctx, 30, 0xff5030, 0.08, 'embers', { y1: 3, op: 0.5 });
        if (ctx.layout !== 'secret') {
          const sp = [[-11.5, -2], [11.5, -2], [-11.5, -11], [11.5, -11]].filter((p) => ctx.free(p[0], p[1], 0.6, { allowCenter: true }));
          sp.slice(0, 2).forEach((p) => statue(ctx, (B, GB) => { humanoid(B, 0x4a3a20, { robe: true, s: 1.1 }); B.add(G_BOX, P.gold, [0, 2.0, 0.22], [0.5, 0.6, 0.08]); GB.add(G_SPH_LO, 0xff2a3a, [-0.12, 2.05, 0.27], 0.04); GB.add(G_SPH_LO, 0xff2a3a, [0.12, 2.05, 0.27], 0.04); }, p[0], p[1], p[0] < 0 ? HPI : -HPI, 'masque', 0.45));
          ctx.mech.blades = [[-6, -2], [6, -2], [0, 6]].filter((p) => ctx.free(p[0], p[1], 0.6, { allowCenter: true }));
        }
      },
      lights(ctx) {
        addLight(ctx, -7.5, 1.6, -6.5, 0xff3020, 1.6, 9, { flicker: 0.4, speed: 10 });
        addLight(ctx, 7.5, 1.6, -6.5, 0xff3020, 1.6, 9, { flicker: 0.4, speed: 11 });
        addLight(ctx, 0, 2.5, 5, 0xff2a5a, 0.9, 10, { flicker: 0.15, speed: 2 });
      },
      secretDecor(ctx) { altar(ctx, -5, -8, false); },
    };
  })();

  // ==================================================================
  //  7. ABÎME INFERNAL — rivières de lave, roches noires, ponts, chaînes, braises
  // ==================================================================
  DEFS.abime_infernal = (() => {
    const P = { wall: 0x1a1414, rock: 0x241c1c, lava: 0xff5a10, ember: 0xff8a2a, chain: 0x4a4040, floor: 0x161010, outer: 0xff4a10,
      doorFrame: 0x241c1c, doorWood: 0x2a2020, doorBand: 0x6a3a20, doorKey: 0xff8a2a, doorOpen: 0xffa04a, secret: 0xffa04a };
    function lavaStrip(ctx, x0, z0, x1, z1, w, gaps) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 1.6);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if ((gaps || []).some((g) => Math.hypot(g[0] - x, g[1] - z) < g[2])) continue;
        ctx.glow(G_DISC, jit(P.lava, ctx.rnd, 0.1), [x, 0.03, z], [w * 0.62, 1, w * 0.62]);
        ctx.hazards.push({ x, z, r: w * 0.5, dps: 14, kind: 'lave' });
      }
      (ctx.mech.lava = ctx.mech.lava || []).push({ x0, z0, x1, z1, w });
    }
    function bridge(ctx, x, z, ry, L) {
      ctx.add(G_BOX, 0x3a3030, [x, 0.12, z], [2.6, 0.24, L], [0, ry, 0]);
      for (const s of [-1, 1]) { const dx = Math.cos(ry) * s * 1.35, dz = -Math.sin(ry) * s * 1.35; ctx.add(G_BOX, 0x2a2222, [x + dx, 0.4, z + dz], [0.2, 0.5, L], [0, ry, 0], false); }
    }
    function spire(ctx, x, z, s) { ctx.add(G_CONE, jit(P.rock, ctx.rnd, 0.15), [x, s * 1.3, z], [s * 0.7, s * 2.6, s * 0.7], [ctx.r(-0.15, 0.15), ctx.rnd(), ctx.r(-0.15, 0.15)]); ctx.obs(x, z, s * 0.5, s * 0.5); }
    function cage(ctx, x, z) {
      const g = dynGroup(ctx, (B, GB) => { for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; B.add(G_CYL6, P.chain, [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], [0.04, 1.6, 0.04], null, false); } B.add(G_CYL, P.chain, [0, 0.8, 0], [0.7, 0.08, 0.7]); B.add(G_CYL, P.chain, [0, -0.8, 0], [0.7, 0.08, 0.7]); PROP.skull(B, 0, -0.75, 0, 0.16, 0xc8b8a0, 0); PROP.chain(B, 0, 4.5, 0.85, 0, P.chain, 1); GB.add(G_SPH_LO, P.ember, [0, -0.5, 0], 0.05); }, x, 3.2, z, 0);
      (ctx.mech.cages = ctx.mech.cages || []).push({ x, z, obj: g });
      ctx.anim((dt, t) => { g.rotation.z = Math.sin(t * 0.9 + x) * 0.08; g.rotation.x = Math.cos(t * 0.7 + z) * 0.06; });
    }
    function hangChain(ctx, x, z) { PROP.chain(ctx.B, x, 6, 1.2, z, P.chain, 1.6); ctx.add(G_TETRA, 0x5a4a40, [x, 1.0, z], 0.35, [PI, 0, 0], false); (ctx.mech.chains = ctx.mech.chains || []).push([x, z]); }
    return {
      theme: TH('Abîme infernal', 0x0a0303, [16, 48], 0xff7a4a, 0x2a0604, 0xff9a5a, 0.18, 0.12, 0.65, 'amb_abime', 'mus_abime', P),
      palette: P, layouts: ['ponts', 'ile', 'faille', 'chaines'], wallH: 3.0, southH: 1.0, doorStyle: 'grille', outerGlow: true, pulse: { amp: 0.35, speed: 1.4 },
      floor(g, w, h, rnd) {
        g.fillStyle = css(P.floor); g.fillRect(0, 0, w, h);
        P2.blobs(g, w, h, rnd, 50, 0x24181a, 15, 50, 0.6);
        P2.noise(g, w, h, rnd, 1200, [0x2a2020, 0x0a0606], 2, 5, 0.6);
        P2.cracks(g, w, h, rnd, 18, 0x4a1206, 3, 0.8);
        P2.vignette(g, w, h, 0.4);
      },
      floorGlow(g, w, h, rnd) { P2.cracks(g, w, h, rnd, 14, 0xff4a00, 2, 0.9); },
      walls(ctx, side, u0, u1, H) {
        runBlocks(ctx, u0, u1, 0.8, 1.4, (u, len) => {
          const p = wpos(ctx, side, u, ctx.r(-0.2, 0.3)), hh = side === 'S' ? ctx.r(0.7, 1.2) : ctx.r(H * 0.6, H * 1.6);
          ctx.add(G_CONE, jit(P.wall, ctx.rnd, 0.15), [p[0], hh / 2, p[1]], [len * 0.6, hh, len * 0.6], [ctx.r(-0.1, 0.1), ctx.rnd(), ctx.r(-0.1, 0.1)]);
        });
      },
      layout: {
        ponts(ctx) {
          for (const z of [-5, 4.5]) { lavaStrip(ctx, -13.5, z, 13.5, z, 2.0, [[-6, z, 1.8], [6, z, 1.8]]); bridge(ctx, -6, z, 0, 3.2); bridge(ctx, 6, z, 0, 3.2); }
          spire(ctx, -10.5, -9.5, 1.3); spire(ctx, 10.5, -10, 1.1); spire(ctx, 0, 9.5, 0.8);
          cage(ctx, -9, 0); cage(ctx, 9, -0.5);
          ctx.mech.vents = [[-3, -9], [3, -9], [-10, 0], [10, 0], [0, 0]];
        },
        ile(ctx) {
          const R = 8.3;
          for (let i = 0; i < 26; i++) {
            const a = i / 26 * TAU, x = Math.sin(a) * R, z = -Math.cos(a) * R;
            if ([0, PI / 2, PI, PI * 1.5].some((b) => Math.abs(((a - b + PI * 3) % TAU) - PI) < 0.32)) continue;
            ctx.glow(G_DISC, jit(P.lava, ctx.rnd, 0.1), [x, 0.03, z], [1.2, 1, 1.2]); ctx.hazards.push({ x, z, r: 0.95, dps: 14, kind: 'lave' });
          }
          ctx.mech.lava = [{ ring: R }];
          for (const a of [0, HPI, PI, PI * 1.5]) bridge(ctx, Math.sin(a) * R, -Math.cos(a) * R, a, 3);
          for (const [x, z] of [[-11, -11], [11, -11], [-11, 10], [11, 10]]) spire(ctx, x, z, 1.2);
          hangChain(ctx, 0, -1);
          ctx.mech.vents = [[-11, 0], [11, 0], [0, -11.5], [-4, -4], [4, 4]];
        },
        faille(ctx) {
          lavaStrip(ctx, -13, -12, 13, 9, 2.2, [[-4.7, -4.5, 2], [4.4, 2.8, 2]]);
          bridge(ctx, -4.7, -4.5, -0.9, 3.4); bridge(ctx, 4.4, 2.8, -0.9, 3.4);
          spire(ctx, -10, 6, 1.4); spire(ctx, 9, -9, 1.3);
          cage(ctx, -8, 2); hangChain(ctx, 7, -3);
          ctx.mech.vents = [[-9, -2], [8, 6], [0, -10], [-2, 8]];
        },
        chaines(ctx) {
          for (const [x, z] of [[-7, -6], [7, -6], [-7, 5], [7, 5], [0, -10]]) hangChain(ctx, x, z);
          for (const [x, z] of [[-10.5, 0], [10.5, 0]]) cage(ctx, x, z);
          lavaStrip(ctx, -13.5, 9.5, -6, 9.5, 1.6); lavaStrip(ctx, 6, 9.5, 13.5, 9.5, 1.6);
          spire(ctx, -11, -11, 1.3); spire(ctx, 11, -11, 1.3);
          ctx.mech.vents = [[-4, 0], [4, 0], [0, 5], [0, -5], [-9, -9], [9, -9]];
        },
      },
      boss(ctx) {
        for (const [x, z] of [[-9.5, -9], [9.5, -9], [-9.5, 6], [9.5, 6]]) { hangChain(ctx, x, z); ctx.add(G_CYL, 0x3a3030, [x, 0.4, z], [0.8, 0.8, 0.8]); ctx.obs(x, z, 0.8, 0.8); }
        lavaStrip(ctx, -13.5, -12.5, -4, -12.5, 1.6); lavaStrip(ctx, 4, -12.5, 13.5, -12.5, 1.6);
        ctx.mech.vents = [[-5, -3], [5, -3], [0, 3], [-7, 2], [7, 2], [0, -7]];
      },
      decor(ctx) {
        particles(ctx, 70, P.ember, 0.11, 'embers', { y1: 5, op: 0.85 });
        ctx.anim((dt, t) => { if (ctx.outerMat && ctx.outerMat.color) ctx.outerMat.color.setHex(mix(0x6a1a04, 0xc84a10, 0.5 + 0.5 * Math.sin(t * 0.7))); });
        if (ctx.layout !== 'secret') for (let i = 0; i < 6; i++) { const x = ctx.r(-12, 12), z = ctx.r(-12, 10); if (ctx.free(x, z, 0.5)) PROP.bones(ctx, x, z, 0x9a8a78); }
      },
      lights(ctx) {
        addLight(ctx, -6, 0.8, -5, 0xff4a10, 1.8, 11, { flicker: 0.25, speed: 4 });
        addLight(ctx, 6, 0.8, 4, 0xff4a10, 1.8, 11, { flicker: 0.25, speed: 4.5 });
        addLight(ctx, 0, 4, -10, 0xff2a10, 0.9, 12, { flicker: 0.3, speed: 6 });
      },
      secretDecor(ctx) { cage(ctx, 0, -4); },
    };
  })();

  // ==================================================================
  //  8. ASILE DES FAILLES — carrelage, cellules, lits, néons, failles violettes
  // ==================================================================
  DEFS.asile_failles = (() => {
    const P = { wall: 0x8a9488, tile: 0x6a8a7a, plaster: 0x5a5a50, metal: 0x5a6068, rift: 0xb04aff, neon: 0xd8fff0, floor: 0x3a403a, outer: 0x020203,
      doorFrame: 0x4a5048, doorWood: 0x5a6068, doorBand: 0x3a3e44, doorKey: 0xb04aff, doorOpen: 0xc08aff, secret: 0xc08aff };
    function partition(ctx, x, z, hw, hd, c) { ctx.box(c || P.plaster, x, 1.2, z, hw * 2, 2.4, hd * 2); ctx.box(P.tile, x, 0.5, z, hw * 2 + 0.04, 1.0, hd * 2 + 0.04, 0, false); ctx.obs(x, z, hw, hd); }
    function bed(ctx, x, z, ry, flip) {
      const B = ctx.B, r = [flip ? 0.9 : 0, ry, flip ? 0.3 : 0];
      B.add(G_BOX, 0xd0d4c8, [x, flip ? 0.5 : 0.55, z], [1.0, 0.25, 2.0], r);
      B.add(G_BOX, P.metal, [x, flip ? 0.35 : 0.3, z], [1.05, 0.08, 2.05], r);
      for (const sz of [-0.95, 0.95]) B.add(G_BOX, P.metal, [x + Math.sin(ry) * sz, 0.5, z + Math.cos(ry) * sz], [1.05, 1.0, 0.06], [0, ry, 0], false);
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); ctx.obs(x, z, 0.55 * c + 1.0 * s, 1.0 * c + 0.55 * s);
    }
    function rift(ctx, x, y, z, s, ry) {
      for (let i = 0; i < 4; i++) ctx.glow(G_BOX, i % 2 ? P.rift : 0xe8c0ff, [x + Math.sin(ry || 0) * (i - 1.5) * 0.15 * s, y + (i - 1.5) * 0.35 * s, z + Math.cos(ry || 0) * (i - 1.5) * 0.15 * s], [0.06 * s, 0.5 * s, 0.06 * s], [0, ry || 0, (i % 2 ? 0.5 : -0.5)]);
      (ctx.mech.rifts = ctx.mech.rifts || []).push([x, z]);
    }
    function neon(ctx, x, z, ry) { ctx.add(G_BOX, 0x2a2a2a, [x, 3.0, z], [0.3, 0.06, 1.8], [0, ry || 0, 0], false); ctx.glow(G_BOX, P.neon, [x, 2.94, z], [0.14, 0.06, 1.6], [0, ry || 0, 0]); }
    function wheelchair(ctx, x, z, ry) { ctx.add(torus(0.12, TAU, 14), 0x2a2a2a, [x + 0.35, 0.45, z], [0.45, 0.45, 0.45], [0, ry + HPI, 0], false); ctx.add(torus(0.12, TAU, 14), 0x2a2a2a, [x - 0.35, 0.45, z], [0.45, 0.45, 0.45], [0, ry + HPI, 0], false); ctx.add(G_BOX, 0x3a3a40, [x, 0.6, z], [0.6, 0.1, 0.6], [0, ry, 0]); ctx.add(G_BOX, 0x3a3a40, [x, 1.0, z - 0.3], [0.6, 0.7, 0.08], [0, ry, 0]); ctx.obs(x, z, 0.4, 0.4); }
    return {
      theme: TH('Asile des failles', 0x030304, [13, 42], 0x9ab0a8, 0x101418, 0xc0d8ff, 0.12, 0.06, 0.85, 'amb_asile', 'mus_asile', P),
      palette: P, layouts: ['couloir', 'dortoir', 'bloc_operatoire', 'cellules'], wallH: 3.0, southH: 1.0, doorStyle: 'dalle', pulse: { amp: 0.5, speed: 2.6 },
      floor(g, w, h, rnd) {
        P2.tiles(g, w, h, 16, 0x4a524a, 0x5a6458, 0x2a302a, rnd, 0.06);
        P2.blobs(g, w, h, rnd, 30, 0x2a2618, 10, 45, 0.35);
        P2.cracks(g, w, h, rnd, 16, 0x1a1a14, 1.5, 0.6);
        P2.noise(g, w, h, rnd, 120, [0xf0f0e0], 2, 6, 0.35);
        P2.vignette(g, w, h, 0.7);
      },
      walls(ctx, side, u0, u1, H) {
        wallBox(ctx, side, (u0 + u1) / 2, 0, H / 2, u1 - u0, H, 1.0, P.plaster);
        wallBox(ctx, side, (u0 + u1) / 2, 0.52, 0.65, u1 - u0, 1.3, 0.06, P.tile, false);
        if (side === 'S') return;
        for (let u = u0 + 2.5; u < u1 - 1.5; u += 5) {
          const p = wpos(ctx, side, u, 0.52), along = side === 'N';
          ctx.add(G_BOX, P.metal, [p[0], 1.2, p[1]], along ? [1.2, 2.4, 0.08] : [0.08, 2.4, 1.2]);
          const q = wpos(ctx, side, u, 0.57); ctx.glow(G_BOX, 0x2a3a30, [q[0], 1.85, q[1]], along ? [0.4, 0.3, 0.02] : [0.02, 0.3, 0.4]);
        }
        if (side !== 'N' && ctx.rnd() < 0.8) { const u = ctx.r(u0 + 2, u1 - 2), p = wpos(ctx, side, u, 0.55); rift(ctx, p[0], 1.4, p[1], 1.2, side === 'N' ? 0 : HPI); }
      },
      layout: {
        couloir(ctx) {
          for (const sx of [-1, 1]) {
            for (const [z0, z1] of [[-12.5, -8.5], [-5.5, -1.5], [1.5, 5.5]]) partition(ctx, sx * 4.5, (z0 + z1) / 2, 0.15, (z1 - z0) / 2);
            for (const z of [-10.5, -3.5, 3.5]) { partition(ctx, sx * 9, z - 1.6, 4.4, 0.15); bed(ctx, sx * 9.5, z + 0.2, HPI, ctx.rnd() < 0.3); }
          }
          for (const z of [-9, -2, 5]) neon(ctx, 0, z, 0);
          ctx.anchors.shadows.push([-11, -9], [11, -9], [-11, -2], [11, 5]);
          ctx.mech.cells = [[-9.5, -10], [9.5, -10], [-9.5, -3], [9.5, -3], [-9.5, 4], [9.5, 4]];
        },
        dortoir(ctx) {
          for (const sx of [-1, 1]) for (const z of [-9, -5, -1, 3]) bed(ctx, sx * (z === -1 ? 6.5 : 8.5), z, HPI, ctx.rnd() < 0.25);
          wheelchair(ctx, 3, 6, 0.7); for (const z of [-8, -1, 6]) neon(ctx, 0, z, 0);
        },
        bloc_operatoire(ctx) {
          ctx.box(P.metal, -6, 0.9, -5, 1.2, 0.12, 2.4); ctx.box(0x2a2a2a, -6, 0.45, -5, 0.3, 0.9, 0.3); ctx.obs(-6, -5, 0.7, 1.2);
          ctx.glow(G_CYL, 0xf0fff0, [-6, 3.0, -5], [0.9, 0.1, 0.9]);
          for (const [x, z] of [[-8, -3], [6, -7], [7, 3]]) { ctx.box(P.metal, x, 0.8, z, 1.2, 0.08, 0.7); ctx.box(P.metal, x, 0.3, z, 1.2, 0.08, 0.7); ctx.obs(x, z, 0.6, 0.35); }
          for (const [x, z] of [[-4.5, -6.5], [8, -5]]) { ctx.add(G_CYL, P.metal, [x, 1, z], [0.04, 2, 0.04], null, false); ctx.glow(G_BOX, 0x8a2a3a, [x + 0.2, 1.8, z], [0.15, 0.3, 0.06]); }
          partition(ctx, 8, -11, 5, 0.15); partition(ctx, -9.5, 7, 3.5, 0.15);
          rift(ctx, 2, 0.06, -9, 2, 0);
          neon(ctx, 6, 0, HPI); ctx.mech.table = [-6, -5];
        },
        cellules(ctx) {
          for (const [x, z] of [[-9, -9], [9, -9], [-9, 6], [9, 6]]) {
            partition(ctx, x, z - 2.4, 2.6, 0.15); partition(ctx, x - Math.sign(x) * 2.6, z - 0.4, 0.15, 2.0);
            ctx.add(G_BOX, 0xd8d8c8, [x + Math.sign(x) * 0.6, 0.4, z], [1.4, 0.8, 1.4]);
            (ctx.mech.cells = ctx.mech.cells || []).push([x, z]);
          }
          wheelchair(ctx, -3.5, 7, 2.4); neon(ctx, 0, -4, HPI); neon(ctx, 0, 4, HPI);
        },
      },
      boss(ctx) { for (const [x, z] of [[-9, -9], [9, -9], [-9, 5], [9, 5]]) { partition(ctx, x, z, 0.8, 0.8, P.metal); rift(ctx, x, 1.2, z + 0.9, 1.5, 0); } rift(ctx, 0, 0.05, -2, 3, HPI); for (const z of [-6, 3]) neon(ctx, 0, z, HPI); },
      decor(ctx) {
        particles(ctx, 25, 0xc08aff, 0.08, 'spores', { op: 0.5, y1: 3 });
        if (ctx.layout !== 'secret') {
          for (let i = 0; i < 12; i++) ctx.add(G_BOX, 0xe8e8d8, [ctx.r(-12, 12), 0.02, ctx.r(-12, 10)], [0.4, 0.01, 0.55], [0, ctx.rnd() * PI, 0], false);
          const sp = [[-11.8, 9], [11.8, 9], [-2.8, -11]].filter((p) => ctx.free(p[0], p[1], 0.5, { allowCenter: true }));
          if (sp[0]) statue(ctx, (B, GB) => { humanoid(B, 0xd8d8cc, { s: 0.95 }); B.add(G_SPH, 0xe8e8e0, [0, 1.72, 0.05], [0.25, 0.28, 0.25]); GB.add(G_SPH_LO, 0x0a0a0a, [0, 1.75, 0.27], 0.01); }, sp[0][0], sp[0][1], 0, 'patient', 0.4);
        }
      },
      lights(ctx) {
        addLight(ctx, 0, 2.8, -5, 0xd8fff0, 1.5, 11, { flicker: 0.65, speed: 17 });
        addLight(ctx, 0, 2.8, 4, 0xd8fff0, 1.1, 10, { flicker: 0.8, speed: 23 });
        const r = (ctx.mech.rifts || [])[0] || [-10, 0];
        addLight(ctx, r[0] * 0.9, 1.4, r[1], 0xa04aff, 1.4, 8, { flicker: 0.3, speed: 4 });
      },
      secretDecor(ctx) { bed(ctx, -5.5, -8, HPI, false); rift(ctx, 0, 1.6, -12.9, 2, 0); },
    };
  })();

  // ==================================================================
  //  9. BIBLIOTHÈQUE ENGLOUTIE — rayonnages, allées en L, livres flottants, encre, rotonde
  // ==================================================================
  DEFS.bibliotheque_engloutie = (() => {
    const P = { wall: 0x2a1c14, wood: 0x3a2618, woodL: 0x5a3a24, ink: 0x0a0a1a, floor: 0x241810, outer: 0x020202, book: [0x6a1a1a, 0x1a3a5a, 0x2a4a2a, 0x5a4a1a, 0x3a1a4a, 0x5a2a1a],
      doorFrame: 0x3a2618, doorWood: 0x2a1c14, doorBand: 0x8a6a3a, doorKey: 0x7affc0, doorOpen: 0x7affc0, secret: 0x7affc0 };
    function shelf(ctx, x, z, len, alongX, h) {
      h = h || 2.8;
      const sx = alongX ? len : 0.8, sz = alongX ? 0.8 : len;
      ctx.add(G_BOX, P.wood, [x, h / 2, z], [sx, h, sz]);
      for (let r = 0; r < 4; r++) {
        const y = 0.35 + r * (h - 0.4) / 4;
        let u = -len / 2 + 0.15;
        while (u < len / 2 - 0.2) {
          const bw = ctx.r(0.22, 0.42), bh = ctx.r(0.35, 0.55);
          for (const s of [-1, 1]) {
            const bx = alongX ? x + u + bw / 2 : x + s * 0.42, bz = alongX ? z + s * 0.42 : z + u + bw / 2;
            if (ctx.rnd() < 0.85) ctx.add(G_BOX, ctx.pick(P.book), [bx, y + bh / 2, bz], alongX ? [bw * 0.9, bh, 0.06] : [0.06, bh, bw * 0.9], null, false);
          }
          u += bw;
        }
      }
      ctx.obs(x, z, sx / 2, sz / 2);
    }
    function desk(ctx, x, z) { ctx.add(G_BOX, P.woodL, [x, 0.75, z], [1.6, 0.1, 0.9]); for (const [dx, dz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) ctx.add(G_BOX, P.wood, [x + dx, 0.37, z + dz], [0.08, 0.74, 0.08], null, false); ctx.add(G_BOX, 0xe8dcc0, [x - 0.2, 0.82, z], [0.6, 0.04, 0.45], [0, 0.2, 0], false); PROP.candles(ctx, x + 0.55, z - 0.2, 1, 0xffc070); ctx.obs(x, z, 0.8, 0.45); }
    function inkPool(ctx, x, z, r) { ctx.add(G_DISC, P.ink, [x, 0.025, z], [r, 1, r * 0.7], null, false); (ctx.mech.ink = ctx.mech.ink || []).push([x, z, r]); }
    function floatingBooks(ctx, n) {
      const pts = []; for (let i = 0; i < n; i++) { const x = ctx.r(-11, 11), z = ctx.r(-11, 9); pts.push([x, ctx.r(1.6, 3), z, ctx.rnd() * TAU]); }
      const gs = dynMany(ctx, (B, GB) => { B.add(G_BOX, 0x3a1a4a, [-0.2, 0, 0], [0.4, 0.04, 0.55], [0, 0, 0.35]); B.add(G_BOX, 0x3a1a4a, [0.2, 0, 0], [0.4, 0.04, 0.55], [0, 0, -0.35]); GB.add(G_BOX, 0x9affd0, [0, 0.04, 0], [0.7, 0.01, 0.48]); }, pts);
      ctx.anim((dt, t) => gs.forEach((g, i) => { g.position.y = pts[i][1] + Math.sin(t * 1.1 + i) * 0.25; g.rotation.y = pts[i][3] + t * 0.2; }));
      ctx.mech.books = gs;
    }
    return {
      theme: TH('Bibliothèque engloutie', 0x030302, [13, 42], 0x8a8a6a, 0x0c0a06, 0x9affd0, 0.14, 0.08, 0.8, 'amb_bibliotheque', 'mus_bibliotheque', P),
      palette: P, layouts: ['rayonnages', 'allees_l', 'rotonde', 'mezzanine'], wallH: 3.2, southH: 1.0, doorStyle: 'bois', pulse: { amp: 0.35, speed: 0.9 },
      floor(g, w, h, rnd) { P2.planks(g, w, h, rnd, 12, P.floor, 0x0e0806); P2.blobs(g, w, h, rnd, 14, 0x05050e, 15, 50, 0.55); P2.noise(g, w, h, rnd, 160, [0xe8dcc0], 4, 9, 0.3); P2.vignette(g, w, h, 0.65); },
      walls(ctx, side, u0, u1, H) {
        wallBox(ctx, side, (u0 + u1) / 2, -0.1, H / 2, u1 - u0, H, 0.8, P.wall);
        if (side === 'S') return;
        runBlocks(ctx, u0 + 0.3, u1 - 0.3, 2.2, 3.4, (u, len) => {
          for (let r = 0; r < 5; r++) { const y = 0.4 + r * 0.55; let v = u - len / 2 + 0.1; while (v < u + len / 2 - 0.2) { const bw = ctx.r(0.24, 0.44); const p = wpos(ctx, side, v + bw / 2, 0.38); const along = side === 'N'; if (ctx.rnd() < 0.85) ctx.add(G_BOX, ctx.pick(P.book), [p[0], y + 0.22, p[1]], along ? [bw * 0.9, ctx.r(0.32, 0.46), 0.25] : [0.25, ctx.r(0.32, 0.46), bw * 0.9], null, false); v += bw; } wallBox(ctx, side, u, 0.4, y - 0.03, len, 0.06, 0.4, P.woodL, false); }
          wallBox(ctx, side, u - len / 2, 0.4, H / 2, 0.12, H, 0.45, P.wood);
        });
      },
      layout: {
        rayonnages(ctx) { for (const [z, x0] of [[-9, -1], [-4.5, 1], [4.5, -1]]) { shelf(ctx, x0 < 0 ? -7.5 : -9.2, z, x0 < 0 ? 7 : 3.6, true); shelf(ctx, x0 < 0 ? 9.2 : 7.5, z, x0 < 0 ? 3.6 : 7, true); } desk(ctx, -8, 0); desk(ctx, 8, 1); inkPool(ctx, 3, -7, 1.6); ctx.anchors.shadows.push([-12, -7], [12, -7], [-12, 7], [12, 7]); },
        allees_l(ctx) { for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { shelf(ctx, sx * 8.5, sz * 5.5 - 1, 5, true); shelf(ctx, sx * 5.8, sz * 8.2 - 1, 4.6, false); } desk(ctx, -10.5, -1); inkPool(ctx, 7, -1, 1.4); inkPool(ctx, -3, 8, 1.2); },
        rotonde(ctx) {
          for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, x = Math.sin(a) * 9.5, z = -Math.cos(a) * 9.5 - 0.5; if (i % 3 === 0) continue; shelf(ctx, x, z, 2.6, Math.abs(z) > Math.abs(x), 2.6); }
          desk(ctx, -4.5, -4); desk(ctx, 4.5, -4); inkPool(ctx, 0, 6, 1.5);
          ctx.add(G_SPH, 0x3a4a5a, [0, 1.2, -6], 0.6); ctx.add(G_CYL, P.wood, [0, 0.4, -6], [0.12, 0.8, 0.12]); ctx.obs(0, -6, 0.5, 0.5);
        },
        mezzanine(ctx) {
          for (const sx of [-1, 1]) { ctx.box(P.woodL, sx * 10.5, 2.2, -2, 5, 0.25, 20); ctx.obs(sx * 10.5, -2, 2.5, 10); for (const z of [-11, -6, -1, 4]) ctx.add(G_BOX, P.wood, [sx * 8.1, 1.1, z], [0.25, 2.2, 0.25]); for (let z = -11.5; z < 7.5; z += 0.6) ctx.add(G_BOX, P.wood, [sx * 8.1, 2.7, z], [0.06, 0.8, 0.06], null, false); ctx.add(G_BOX, P.wood, [sx * 8.1, 3.1, -2], [0.12, 0.08, 19], null, false); }
          for (let k = 0; k < 6; k++) ctx.add(G_BOX, P.woodL, [-7.3 + 0, 0.18 + k * 0.36, 7.5 - k * 0.6], [1.4, 0.12, 0.5], null, false);
          shelf(ctx, 0, -8.5, 6, true, 2.6); desk(ctx, -4, 3); desk(ctx, 4, 3); inkPool(ctx, 0, -3, 1.3);
        },
      },
      boss(ctx) { for (const sx of [-1, 1]) { shelf(ctx, sx * 10.5, -6, 5, false); shelf(ctx, sx * 10.5, 4, 4, false); } ctx.add(G_BOX, P.woodL, [0, 1.0, -6.5], [3, 0.12, 1.4]); ctx.add(G_BOX, P.wood, [0, 0.5, -6.5], [2.6, 1.0, 1.0]); ctx.obs(0, -6.5, 1.5, 0.7); for (const [x, z] of [[-5, 2], [5, -3], [0, 6], [-6, -6]]) inkPool(ctx, x, z, 1.4); },
      decor(ctx) {
        floatingBooks(ctx, ctx.layout === 'secret' ? 4 : 7);
        particles(ctx, 40, 0xe8dcc0, 0.06, 'dust', { op: 0.4, additive: false });
        if (ctx.layout !== 'secret') { for (let i = 0; i < 6; i++) { const x = ctx.r(-11, 11), z = ctx.r(-11, 10); if (ctx.free(x, z, 0.5)) ctx.add(G_BOX, ctx.pick(P.book), [x, 0.05, z], [0.4, 0.1, 0.55], [0, ctx.rnd() * PI, 0.1], false); } const sp = [[-11.5, 9], [11.5, 9]].find((p) => ctx.free(p[0], p[1], 0.5, { allowCenter: true })); if (sp) statue(ctx, (B, GB) => { humanoid(B, 0x3a4a4a, { robe: true, hood: true }); B.add(G_BOX, 0x6a1a1a, [0, 1.25, 0.35], [0.4, 0.5, 0.08], [-0.4, 0, 0]); GB.add(G_SPH_LO, 0x7affc0, [0, 1.8, 0.22], 0.03); }, sp[0], sp[1], 0, 'lecteur', 0.4); }
      },
      lights(ctx) { addLight(ctx, -8, 1.3, 0, 0xffb060, 1.2, 8, { flicker: 0.4, speed: 9 }); addLight(ctx, 6, 2.6, -5, 0x7affc0, 1.2, 10, { flicker: 0.15, speed: 2, drift: { a: 3, s: 0.2 } }); addLight(ctx, 0, 2, 6, 0xffb060, 0.9, 8, { flicker: 0.45, speed: 12 }); },
      secretDecor(ctx) { desk(ctx, -5.5, -8); },
    };
  })();

  // ==================================================================
  //  10. NÉCROPOLE DE GIVRE — mausolées de glace, stèles, crevasses, stalactites, aurore
  // ==================================================================
  DEFS.necropole_glace = (() => {
    const P = { wall: 0x8ab0c8, ice: 0xa8d8f0, iceD: 0x4a7a9a, stone: 0x6a7a88, snow: 0xe8f4ff, floor: 0x6a8aa0, outer: 0x0a1420, aurora: 0x7affd0,
      doorFrame: 0x6a7a88, doorWood: 0x8ab0c8, doorBand: 0x4a6a8a, doorKey: 0x7affd0, doorOpen: 0x9affe0, secret: 0x9affe0 };
    function mausoleum(ctx, x, z, s) {
      s = s || 1;
      ctx.add(G_BOX, P.stone, [x, 1.0 * s, z], [2.8 * s, 2.0 * s, 2.4 * s]);
      ctx.add(G_CONE4, P.iceD, [x, 2.5 * s, z], [2.2 * s, 1.1 * s, 2.0 * s], [0, PI / 4, 0]);
      ctx.add(G_BOX, 0x0a1a2a, [x, 0.8 * s, z + 1.21 * s], [1.0 * s, 1.5 * s, 0.04], null, false);
      ctx.glow(G_BOX, P.aurora, [x, 1.7 * s, z + 1.23 * s], [0.3 * s, 0.04, 0.02]);
      ctx.add(G_BOX, P.snow, [x, 2.02 * s, z], [2.9 * s, 0.08, 2.5 * s], null, false);
      ctx.obs(x, z, 1.4 * s, 1.2 * s);
      (ctx.mech.tombs = ctx.mech.tombs || []).push([x, z + 1.9 * s]);
    }
    function stele(ctx, x, z) { ctx.add(G_BOX, jit(P.stone, ctx.rnd, 0.1), [x, 0.6, z], [0.8, 1.2, 0.25], [ctx.r(-0.1, 0.1), ctx.r(-0.2, 0.2), ctx.r(-0.12, 0.12)]); ctx.add(G_BOX, P.snow, [x, 1.22, z], [0.82, 0.06, 0.27], null, false); ctx.obs(x, z, 0.45, 0.2); }
    function crystal(ctx, x, z, s) { ctx.add(G_OCTA, jit(P.ice, ctx.rnd, 0.1), [x, s, z], [s * 0.45, s * 1.4, s * 0.45], [ctx.r(-0.3, 0.3), ctx.rnd(), ctx.r(-0.3, 0.3)]); }
    function crevasse(ctx, x0, z0, x1, z1, gaps) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 1.4);
      for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if ((gaps || []).some((g) => Math.hypot(g[0] - x, g[1] - z) < 1.9)) { ctx.add(G_BOX, P.ice, [x, 0.1, z], [2.4, 0.2, 2.4], [0, Math.atan2(x1 - x0, z1 - z0), 0], false); continue; } ctx.add(G_DISC, 0x02060c, [x, 0.02, z], [1.15, 1, 1.15], null, false); ctx.obs(x, z, 0.75, 0.75); }
    }
    function stalactites(ctx, list) { const gs = dynMany(ctx, (B) => { B.add(G_CONE, P.ice, [0, 0, 0], [0.35, 1.4, 0.35], [PI, 0, 0]); B.add(G_CONE, P.ice, [0.3, 0.2, 0.1], [0.2, 0.9, 0.2], [PI, 0, 0]); }, list.map((p) => [p[0], 4.2, p[1]])); ctx.mech.stalactites = gs.map((g, i) => ({ x: list[i][0], z: list[i][1], obj: g, fallen: false, y0: 4.2 })); }
    function frozenKnight(ctx, x, z, ry) { return statue(ctx, (B, GB) => { humanoid(B, 0x6a8aa8, { helm: true }); B.add(G_BOX, P.ice, [0, 1.1, 0], [1.1, 2.4, 0.9], null, false); GB.add(G_BOX, 0x9adfff, [0, 1.86, 0.27], [0.24, 0.03, 0.02]); }, x, z, ry, 'chevalier_fige', 0.55); }
    return {
      theme: TH('Nécropole de givre', 0x081018, [16, 50], 0x9ad0ff, 0x1a2a3a, 0xcfe8ff, 0.24, 0.18, 0.6, 'amb_necropole', 'mus_necropole', P),
      palette: P, layouts: ['mausolees', 'crevasses', 'steles', 'cloitre'], wallH: 2.8, southH: 1.0, doorStyle: 'grille', pulse: { amp: 0.3, speed: 0.6 },
      floor(g, w, h, rnd) { g.fillStyle = css(P.floor); g.fillRect(0, 0, w, h); P2.blobs(g, w, h, rnd, 40, 0xe8f4ff, 15, 60, 0.35); P2.cracks(g, w, h, rnd, 20, 0x2a4a6a, 1.5, 0.6); P2.blobs(g, w, h, rnd, 15, 0x9ad0ff, 20, 40, 0.2); P2.vignette(g, w, h, 0.55); },
      walls(ctx, side, u0, u1, H) {
        runBlocks(ctx, u0, u1, 1.0, 2.0, (u, len) => { const p = wpos(ctx, side, u, ctx.r(-0.1, 0.2)), hh = side === 'S' ? ctx.r(0.7, 1.1) : ctx.r(H * 0.8, H * 1.3); ctx.add(G_BOX, jit(P.wall, ctx.rnd, 0.1), [p[0], hh / 2, p[1]], side === 'N' || side === 'S' ? [len, hh, 1] : [1, hh, len], [0, ctx.r(-0.05, 0.05), 0]); if (side !== 'S' && ctx.rnd() < 0.5) { const q = wpos(ctx, side, u, 0.7); crystal(ctx, q[0], q[1], ctx.r(0.5, 1.1)); } });
      },
      layout: {
        mausolees(ctx) { for (const [x, z] of [[-8, -8], [8, -8], [-8.5, 3.5], [8.5, 3.5]]) mausoleum(ctx, x, z, 1); stalactites(ctx, [[-3, -6], [3, -6], [0, 3], [-5, 0], [5, 0]]); frozenKnight(ctx, -11.5, -2, HPI); frozenKnight(ctx, 11.5, -2, -HPI); },
        crevasses(ctx) { crevasse(ctx, -13.5, -4, 13.5, -4, [[-5, -4], [6, -4]]); crevasse(ctx, -13.5, 5.5, -3, 5.5, [[-8, 5.5]]); crevasse(ctx, 4, 5.5, 13.5, 5.5, [[9, 5.5]]); stalactites(ctx, [[-5, -4], [6, -4], [0, -9], [0, 1]]); frozenKnight(ctx, -10, -9, 0.5); mausoleum(ctx, 9.5, -9.5, 0.8); ctx.mech.crevasses = [[0, -4], [-8, 5.5], [9, 5.5]]; },
        steles(ctx) { for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) { const x = -10.5 + c * 3, z = -10 + r * 4; if (Math.abs(x) < 4.5 && z < 2 && z > -6) continue; if (Math.abs(x) < 3 && z < -8) continue; stele(ctx, x + ctx.r(-0.4, 0.4), z + ctx.r(-0.4, 0.4)); } stalactites(ctx, [[-4, -3], [4, -3], [0, 4]]); frozenKnight(ctx, -7, -11.5, 0.3); ctx.anchors.shadows.push([-11, 7], [11, 7]); },
        cloitre(ctx) { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, x = Math.sin(a) * 9, z = -Math.cos(a) * 8 - 0.5; if (Math.abs(x) < 3) continue; PROP.pillar(ctx, x, z, 0.45, 3.0, P.stone, P.snow); } mausoleum(ctx, 0, -5.2, 0.7); ctx.obstacles.pop(); ctx.obs(0, -5.2, 1.0, 0.85); stalactites(ctx, [[-5, -5], [5, -5], [-5, 4], [5, 4]]); },
      },
      boss(ctx) { const tx = -7.5; ctx.add(G_BOX, P.iceD, [tx, 0.5, -10.5], [5, 1, 2.5]); ctx.add(G_BOX, P.ice, [tx, 2.2, -11.3], [3.4, 3.4, 0.8]); ctx.add(G_OCTA, P.ice, [tx - 1.8, 3.6, -11.2], [0.6, 1.8, 0.6]); ctx.add(G_OCTA, P.ice, [tx + 1.8, 3.6, -11.2], [0.6, 1.8, 0.6]); ctx.obs(tx, -10.7, 2.5, 1.3); for (const [x, z] of [[-9, -6], [9, -6], [-9, 4], [9, 4]]) frozenKnight(ctx, x, z, x < 0 ? HPI : -HPI); stalactites(ctx, [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 0]]); },
      decor(ctx) {
        particles(ctx, 80, 0xffffff, 0.09, 'snow', { y1: 6, op: 0.75, additive: false });
        groundFog(ctx, 8, 0xd8f0ff, 0.12, { smin: 6, smax: 10, y: 0.3 });
        // aurore (rubans verts au nord)
        const am = new T.MeshBasicMaterial({ color: P.aurora, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }); ctx.own(am);
        const ribs = [0, 1, 2].map((i) => { const m = new T.Mesh(G_PLANE, am); m.scale.set(16, 2.5, 1); m.position.set(-6 + i * 6, 6 + i * 0.6, -16 - i); ctx.group.add(m); return m; });
        ctx.anim((dt, t) => { am.opacity = 0.12 + 0.08 * Math.sin(t * 0.5); ribs.forEach((m, i) => { m.rotation.z = Math.sin(t * 0.3 + i) * 0.15; }); });
        if (ctx.layout !== 'secret') for (let i = 0; i < 6; i++) { const x = ctx.r(-12, 12), z = ctx.r(-12, 9); if (ctx.free(x, z, 0.6)) crystal(ctx, x, z, ctx.r(0.3, 0.7)); }
      },
      lights(ctx) { addLight(ctx, -6, 2.5, -6, 0x9fd8ff, 1.3, 12, { flicker: 0.1, speed: 1.5 }); addLight(ctx, 6, 2.5, 2, 0x7affd0, 1.1, 11, { flicker: 0.15, speed: 2 }); },
      secretDecor(ctx) { ctx.add(G_BOX, P.ice, [-5.5, 0.6, -8], [1.4, 1.2, 2.6]); ctx.glow(G_BOX, P.aurora, [-5.5, 1.25, -8], [1.0, 0.02, 2.2]); ctx.obs(-5.5, -8, 0.7, 1.3); },
    };
  })();

  // ==================================================================
  //  11. JARDIN DE CHAIR — haies organiques, veines pulsantes, fleurs à dents, bulbes, serre
  // ==================================================================
  DEFS.jardin_chair = (() => {
    const P = { wall: 0x5a1a2a, flesh: 0x8a3a44, fleshD: 0x4a1420, vein: 0xff3a5a, bile: 0xc8ff40, petal: 0xa02a4a, iron: 0x2a2a2e, floor: 0x3a1a1e, outer: 0x060203,
      doorFrame: 0x4a1420, doorWood: 0x8a3a44, doorBand: 0x4a1420, doorKey: 0xc8ff40, doorOpen: 0xd8ff7a, secret: 0xd8ff7a };
    function hedge(ctx, x, z, hw, hd) {
      const n = Math.max(2, Math.round(Math.max(hw, hd) * 2 / 0.9));
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5; const px = hw > hd ? x + t * hw * 2 : x, pz = hw > hd ? z : z + t * hd * 2; ctx.add(G_SPH, jit(P.wall, ctx.rnd, 0.12), [px, ctx.r(0.7, 1.1), pz], [ctx.r(0.6, 0.85), ctx.r(0.9, 1.4), ctx.r(0.6, 0.85)]); if (ctx.rnd() < 0.4) ctx.add(G_CONE, 0x2a0a10, [px, ctx.r(1.3, 2), pz], [0.06, 0.5, 0.06], [ctx.r(-0.8, 0.8), 0, ctx.r(-0.8, 0.8)], false); }
      ctx.obs(x, z, Math.max(hw, 0.7), Math.max(hd, 0.7));
    }
    function veinLine(ctx, x0, z0, x1, z1) { const L = Math.hypot(x1 - x0, z1 - z0); ctx.glow(G_CYL6, P.vein, [(x0 + x1) / 2, 0.06, (z0 + z1) / 2], [0.09, L, 0.09], [HPI, Math.atan2(x1 - x0, z1 - z0), 0]); (ctx.mech.veins = ctx.mech.veins || []).push([x0, z0, x1, z1]); }
    function toothFlower(ctx, x, z) { ctx.add(G_CYL, 0x4a2a1a, [x, 0.5, z], [0.08, 1.0, 0.08], null, false); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.add(G_CONE, P.petal, [x + Math.cos(a) * 0.3, 1.05, z + Math.sin(a) * 0.3], [0.18, 0.5, 0.08], [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0]); ctx.add(G_CONE, 0xf0e8d0, [x + Math.cos(a) * 0.15, 1.1, z + Math.sin(a) * 0.15], [0.04, 0.16, 0.04], null, false); } ctx.glow(G_SPH_LO, P.bile, [x, 1.0, z], 0.12); }
    function bulbs(ctx, list) { const gs = dynMany(ctx, (B, GB) => { B.add(G_SPH, P.flesh, [0, 0.5, 0], [0.6, 0.55, 0.6]); GB.add(G_SPH_LO, P.bile, [0, 0.95, 0], 0.15); for (let i = 0; i < 3; i++) B.add(G_CYL6, P.fleshD, [Math.cos(i * 2) * 0.5, 0.15, Math.sin(i * 2) * 0.5], [0.06, 0.4, 0.06], [0.8, i * 2, 0], false); }, list.map((p) => [p[0], 0, p[1]])); ctx.mech.bulbs = gs.map((g, i) => ({ x: list[i][0], z: list[i][1], obj: g, popped: false })); ctx.anim((dt, t) => gs.forEach((g, i) => { if (!ctx.mech.bulbs[i].popped) g.scale.setScalar(1 + Math.sin(t * 2.2 + i) * 0.07); })); }
    function eyeStalk(ctx, x, z) { const g = statue(ctx, (B, GB) => { B.add(G_CYL, P.fleshD, [0, 0.9, 0], [0.12, 1.8, 0.12]); B.add(G_SPH, 0xf0e8d8, [0, 1.95, 0], 0.32); GB.add(G_SPH_LO, 0xc8ff40, [0, 1.98, 0.26], 0.13); B.add(G_SPH_LO, 0x0a0a0a, [0, 1.98, 0.33], 0.07, null, false); }, x, z, 0, 'oeil', 0.3); return g; }
    return {
      theme: TH('Jardin de chair', 0x060203, [14, 44], 0xc87a7a, 0x2a0a10, 0xffb0a0, 0.15, 0.1, 0.75, 'amb_jardin', 'mus_jardin', P),
      palette: P, layouts: ['labyrinthe', 'serre', 'croix', 'bassin'], wallH: 2.4, southH: 1.0, doorStyle: 'membrane', pulse: { amp: 0.5, speed: 2.4 },
      floor(g, w, h, rnd) { g.fillStyle = css(P.floor); g.fillRect(0, 0, w, h); P2.blobs(g, w, h, rnd, 60, 0x5a2a2e, 10, 40, 0.45); P2.cracks(g, w, h, rnd, 30, 0x8a1a2a, 2, 0.55); P2.blobs(g, w, h, rnd, 12, 0x2a3a10, 15, 30, 0.3); P2.vignette(g, w, h, 0.6); },
      floorGlow(g, w, h, rnd) { P2.cracks(g, w, h, rnd, 10, 0x6a0018, 1.5, 0.8); },
      walls(ctx, side, u0, u1, H) { runBlocks(ctx, u0, u1, 0.8, 1.3, (u, len) => { const p = wpos(ctx, side, u, ctx.r(-0.2, 0.3)), hh = side === 'S' ? ctx.r(0.6, 1) : ctx.r(H * 0.7, H * 1.2); ctx.add(G_SPH, jit(P.wall, ctx.rnd, 0.15), [p[0], hh * 0.5, p[1]], [len * 0.65, hh * 0.65, 0.9]); }); },
      layout: {
        labyrinthe(ctx) { for (const [x, z, hw, hd] of [[-6, -8, 3, 0.6], [6.5, -8, 2.5, 0.6], [-9.5, -3, 0.6, 2.6], [9.5, -1, 0.6, 3.5], [-6, 4.5, 2.6, 0.6], [6, 6, 3, 0.6], [-10.5, 8, 2, 0.6]]) hedge(ctx, x, z, hw, hd); veinLine(ctx, -3, -5, 3, 5); veinLine(ctx, -8, 1, -3, 0); bulbs(ctx, [[-4, -10.5], [11.5, -10], [-11.5, 3]]); toothFlower(ctx, 3.5, -10.5); toothFlower(ctx, -2, 7.5); },
        serre(ctx) {
          for (const z of [-10, -5, 0, 5]) { ctx.add(torus(0.08, PI, 16), P.iron, [0, 0, z], [12.5, 5, 1], [0, 0, 0], false); }
          for (const z of [-10, -5, 0, 5]) for (const sx of [-1, 1]) ctx.glow(G_BOX, 0x2a3a3a, [sx * 6.5, 4.3, z + 2.5], [5, 0.02, 4.2]);
          for (const [x, z] of [[-8, -7.5], [8, -7.5], [-8, 2.5], [8, 2.5]]) { ctx.box(0x4a2a1a, x, 0.35, z, 4.5, 0.7, 2.2); ctx.obs(x, z, 2.25, 1.1); for (let i = 0; i < 3; i++) toothFlower(ctx, x - 1.4 + i * 1.4, z); }
          bulbs(ctx, [[0, -11], [-11.5, -2], [11.5, -2]]); veinLine(ctx, -11, 9, 11, 9);
        },
        croix(ctx) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) { hedge(ctx, sx * 8.5, sz * 6.5 - 1.5, 3.5, 0.7); hedge(ctx, sx * 5.6, sz * 8.8 - 1.5, 0.7, 1.6); } veinLine(ctx, -12, -1.5, 12, -1.5); veinLine(ctx, 0, -12, 0, 10); bulbs(ctx, [[-10.5, -1.5], [10.5, -1.5], [0, -11.5]]); },
        bassin(ctx) { const R = 3.4, cx = 6.5, cz = -6; ctx.glow(G_DISC, 0x6a8a10, [cx, 0.03, cz], [R, 1, R * 0.8]); ctx.hazards.push({ x: cx, z: cz, r: R * 0.8, dps: 6, kind: 'bile' }); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.add(G_SPH, P.flesh, [cx + Math.cos(a) * R, 0.2, cz + Math.sin(a) * R * 0.8], [0.6, 0.3, 0.6], null, false); } ctx.mech.pools = [[cx, cz]]; hedge(ctx, -8.5, -7, 3, 0.7); hedge(ctx, -9, 6, 0.7, 2.5); bulbs(ctx, [[-4, 8], [10, 6], [-11, -11]]); toothFlower(ctx, 2, 7); veinLine(ctx, cx, cz, 0, 0); },
      },
      boss(ctx) { ctx.add(G_SPH, P.flesh, [0, 0.3, -1], [5.5, 0.4, 5]); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; veinLine(ctx, Math.cos(a) * 2, Math.sin(a) * 2 - 1, Math.cos(a) * 12, Math.sin(a) * 11 - 1); } bulbs(ctx, [[-10, -9], [10, -9], [-10, 6], [10, 6]]); },
      decor(ctx) {
        particles(ctx, 35, 0xd8ff7a, 0.09, 'spores', { op: 0.55, y1: 2.5 });
        groundFog(ctx, 6, 0xc8ff80, 0.08, { smin: 5, smax: 8 });
        if (ctx.layout !== 'secret') { const sp = [[-11.5, -7], [11.5, 9], [-3.5, -11.5]].filter((p) => ctx.free(p[0], p[1], 0.5, { allowCenter: true })); sp.slice(0, 2).forEach((p) => eyeStalk(ctx, p[0], p[1])); }
      },
      lights(ctx) { addLight(ctx, -5, 1.5, -4, 0xc8ff50, 1.3, 9, { flicker: 0.2, speed: 3 }); addLight(ctx, 6, 1.5, 3, 0xff4070, 1.3, 9, { flicker: 0.25, speed: 2.4 }); },
      secretDecor(ctx) { bulbs(ctx, [[-3, -9], [3, -9]]); },
    };
  })();

  // ==================================================================
  //  12. OBSERVATOIRE DU NÉANT — plates-formes au-dessus du vide, anneaux, télescope, étoiles mortes
  // ==================================================================
  DEFS.observatoire_neant = (() => {
    const P = { wall: 0x2a2440, stone: 0x3a3450, metal: 0x6a6a8a, brass: 0x9a8a5a, star: 0xe0e8ff, void: 0x8a5aff, floor: 0x1a1628, outer: 0x000000,
      doorFrame: 0x3a3450, doorWood: 0x2a2440, doorBand: 0x9a8a5a, doorKey: 0x8a5aff, doorOpen: 0xb08aff, secret: 0xb08aff };
    function voidCorner(ctx, x, z, hw, hd) { ctx.add(G_BOX, 0x000000, [x, 0.01, z], [hw * 2, 0.03, hd * 2], null, false); ctx.obs(x, z, hw, hd); for (let i = 0; i < 4; i++) ctx.glow(G_SPH_LO, P.star, [x + ctx.r(-hw, hw), 0.05, z + ctx.r(-hd, hd)], 0.05); }
    function rail(ctx, x, z, len, alongX) { for (let i = 0; i <= Math.round(len / 1.2); i++) { const t = -len / 2 + i * 1.2; ctx.add(G_CYL6, P.brass, [alongX ? x + t : x, 0.45, alongX ? z : z + t], [0.05, 0.9, 0.05], null, false); } ctx.add(G_BOX, P.brass, [x, 0.9, z], alongX ? [len, 0.06, 0.08] : [0.08, 0.06, len], null, false); }
    function armillary(ctx, x, y, z, s) { const g = dynGroup(ctx, (B, GB) => { B.add(torus(0.03, TAU, 24), P.brass, [0, 0, 0], [s, s, s], [HPI, 0, 0], false); B.add(torus(0.03, TAU, 24), P.brass, [0, 0, 0], [s * 0.85, s * 0.85, s * 0.85], [0, 0, 0.4], false); B.add(torus(0.03, TAU, 24), P.brass, [0, 0, 0], [s * 0.7, s * 0.7, s * 0.7], [0.9, 0.3, 0], false); GB.add(G_SPH, P.void, [0, 0, 0], s * 0.18); }, x, y, z, 0); ctx.anim((dt, t) => { g.rotation.y = t * 0.15; g.rotation.x = Math.sin(t * 0.1) * 0.3; }); return g; }
    function deadStar(ctx, x, y, z) { const m = new T.MeshBasicMaterial({ color: 0xffe0c0, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }); const s = new T.Mesh(G_SPH, m); s.position.set(x, y, z); ctx.group.add(s); ctx.own(m); ctx.anim((dt, t) => { const k = 0.5 + 0.5 * Math.sin(t * 0.6 + x); s.scale.setScalar(0.4 + k * 0.25); m.opacity = 0.35 + 0.5 * k; }); (ctx.mech.stars = ctx.mech.stars || []).push({ x, z, obj: s }); }
    function ringPath(ctx, R, gaps) { for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; if ((gaps || []).some((g) => Math.abs(((a - g + PI * 3) % TAU) - PI) < 0.3)) continue; const x = Math.sin(a) * R, z = -Math.cos(a) * R - 0.5; ctx.add(G_BOX, P.stone, [x, 0.25, z], [1.8, 0.5, 0.4], [0, -a, 0]); ctx.glow(G_BOX, P.void, [x, 0.52, z], [1.6, 0.02, 0.1], [0, -a, 0]); ctx.obs(x, z, 0.55, 0.55); } }
    return {
      theme: TH('Observatoire du Néant', 0x000002, [15, 46], 0x8a7aff, 0x08041a, 0xd0c8ff, 0.12, 0.08, 0.85, 'amb_observatoire', 'mus_observatoire', P),
      palette: P, layouts: ['anneaux', 'astrolabe', 'plateformes', 'telescope'], wallH: 2.0, southH: 0.9, doorStyle: 'voile', pulse: { amp: 0.4, speed: 0.7 },
      floor(g, w, h, rnd) { g.fillStyle = css(P.floor); g.fillRect(0, 0, w, h); g.strokeStyle = css(0x4a3a7a, 0.6); g.lineWidth = 2; for (let i = 1; i < 7; i++) { g.beginPath(); g.arc(w / 2, h / 2, i * 38, 0, TAU); g.stroke(); } for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * 260, h / 2 + Math.sin(a) * 260); g.stroke(); } P2.noise(g, w, h, rnd, 200, [0xe0e8ff], 1, 2, 0.5); P2.vignette(g, w, h, 0.6); },
      floorGlow(g, w, h) { g.strokeStyle = 'rgba(110,70,255,0.8)'; g.lineWidth = 1.5; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(w / 2, h / 2, i * 38, 0, TAU); g.stroke(); } },
      walls(ctx, side, u0, u1, H) {
        wallBox(ctx, side, (u0 + u1) / 2, 0, 0.3, u1 - u0, 0.6, 1.0, P.stone);
        for (let u = u0 + 0.6; u < u1; u += 1.2) { const p = wpos(ctx, side, u, 0.2); ctx.add(G_CYL6, P.brass, [p[0], 0.9, p[1]], [0.05, 0.8, 0.05], null, false); }
        wallBox(ctx, side, (u0 + u1) / 2, 0.2, 1.3, u1 - u0, 0.06, 0.1, P.brass, false);
        if (side === 'N') for (const s of [-1, 1]) { ctx.add(G_BOX, P.metal, [s * 5, 2.5, -14], [1.2, 5, 1.2]); ctx.add(G_CONE, P.metal, [s * 5, 5.4, -14], [0.9, 1, 0.9]); }
      },
      layout: {
        anneaux(ctx) { ringPath(ctx, 8.5, [0, PI, HPI, PI * 1.5]); for (const [x, z] of [[-11.5, -11.5], [11.5, -11.5], [-11.5, 10.5], [11.5, 10.5]]) voidCorner(ctx, x, z, 1.8, 1.8); armillary(ctx, 0, 4.5, -1, 2.2); deadStar(ctx, -9, 3.5, -10); },
        astrolabe(ctx) { for (const [x, z] of [[-10, -9], [10, -9], [-10, 7], [10, 7]]) { ctx.add(G_CYL, P.stone, [x, 0.4, z], [1.6, 0.8, 1.6]); armillary(ctx, x, 2.2, z, 1.3); ctx.obs(x, z, 1.5, 1.5); } armillary(ctx, 0, 5, -1, 3.2); deadStar(ctx, 8, 3, -3); deadStar(ctx, -8, 3, 2); },
        plateformes(ctx) {
          voidCorner(ctx, -9, -1, 4.5, 2.2); voidCorner(ctx, 9.5, -6.5, 4, 2); voidCorner(ctx, 8.5, 6.5, 5, 1.6);
          rail(ctx, -9, -3.3, 9, true); rail(ctx, -9, 1.3, 9, true); rail(ctx, 9.5, -8.6, 8, true);
          for (const x of [-8, -10.5]) { ctx.add(G_BOX, P.void, [x, 0.02, -1], [1.8, 0.02, 4.4], null, false); }
          ctx.mech.gaps = [[-9, -1], [9.5, -6.5], [8.5, 6.5]]; deadStar(ctx, -10, 2.5, -10);
        },
        telescope(ctx) { ctx.add(G_CYL, P.metal, [-7, 1.2, -7], [1.6, 2.4, 1.6]); ctx.add(G_CYL, P.brass, [-5.5, 3.6, -8.5], [0.7, 6, 0.7], [0.9, 0.785, 0]); ctx.add(G_CYL, P.metal, [-3.6, 5.3, -10.4], [0.9, 0.4, 0.9], [0.9, 0.785, 0]); ctx.glow(G_CYL, P.void, [-3.5, 5.4, -10.5], [0.75, 0.05, 0.75], [0.9, 0.785, 0]); ctx.obs(-7, -7, 1.7, 1.7); ringPath(ctx, 10.5, [0, PI, PI * 0.5, PI * 1.5, PI * 0.25, PI * 1.25]); ctx.mech.telescope = [-7, -7]; deadStar(ctx, 7, 4, -9); },
      },
      boss(ctx) { for (const [x, z] of [[-11.5, -11.5], [11.5, -11.5], [-11.5, 10.5], [11.5, 10.5]]) voidCorner(ctx, x, z, 1.8, 1.8); armillary(ctx, 0, 6, -2, 4); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; deadStar(ctx, Math.cos(a) * 9, 3.5, Math.sin(a) * 8 - 1); } },
      decor(ctx) {
        particles(ctx, 90, P.star, 0.08, 'stars', { y0: -2, y1: 7, op: 0.9 });
        if (ctx.layout !== 'secret') { const sp = [[-11.5, 0], [11.5, 0], [-6, -11.5]].find((p) => ctx.free(p[0], p[1], 0.5, { allowCenter: true })); if (sp) statue(ctx, (B, GB) => { humanoid(B, 0x1a1428, { robe: true, hood: true, s: 1.1 }); GB.add(G_SPH_LO, P.star, [-0.08, 1.98, 0.25], 0.03); GB.add(G_SPH_LO, P.star, [0.08, 1.98, 0.25], 0.03); }, sp[0], sp[1], sp[0] < 0 ? HPI : sp[0] > 0 ? -HPI : 0, 'astronome', 0.4); }
      },
      lights(ctx) { addLight(ctx, 0, 4, -2, 0x8050ff, 1.5, 14, { flicker: 0.2, speed: 1.2 }); addLight(ctx, -7, 2.5, 5, 0xe0e8ff, 1.0, 10, { flicker: 0.12, speed: 2 }); addLight(ctx, 8, 2.5, -7, 0xb08aff, 0.9, 10, { flicker: 0.2, speed: 1.6 }); },
      secretDecor(ctx) { armillary(ctx, 0, 2.2, -4, 1.5); },
    };
  })();

  // ==================================================================
  //  13. FOIRE AUX PANTINS — chapiteau rayé, manège, stands, guirlandes d'ampoules
  // ==================================================================
  DEFS.foire_pantins = (() => {
    const P = { wall: 0x6a1a1e, stripeA: 0x7a1a1e, stripeB: 0xb8a890, wood: 0x5a3a20, gold: 0xb89a4a, bulb: 0xffd080, floor: 0x3a2a1a, outer: 0x050302,
      doorFrame: 0x5a3a20, doorWood: 0x7a1a1e, doorBand: 0xb89a4a, doorKey: 0xffd080, doorOpen: 0xffe0a0, secret: 0xffe0a0 };
    function garland(ctx, x0, z0, x1, z1, y) { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.1); for (let i = 0; i <= n; i++) { const t = i / n, sag = Math.sin(t * PI) * 0.6; ctx.glow(G_SPH_LO, i % 3 === 0 ? 0xff5050 : i % 3 === 1 ? P.bulb : 0x60c0ff, [x0 + (x1 - x0) * t, y - sag, z0 + (z1 - z0) * t], 0.09); } (ctx.mech.bulbs = ctx.mech.bulbs || []).push([x0, z0, x1, z1]); }
    function booth(ctx, x, z, ry) {
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      ctx.add(G_BOX, P.wood, [x, 0.55, z], [2.8, 1.1, 1.2], [0, ry, 0]);
      for (const s of [-1, 1]) ctx.add(G_BOX, P.wood, [x + ux * s * 1.35, 1.4, z + uz * s * 1.35], [0.12, 2.8, 0.12], [0, ry, 0]);
      for (let i = 0; i < 5; i++) ctx.add(G_BOX, i % 2 ? P.stripeA : P.stripeB, [x + ux * (i - 2) * 0.58, 2.85, z + uz * (i - 2) * 0.58], [0.58, 0.2, 1.4], [0.25, ry, 0]);
      ctx.add(G_SPH, 0xf0e8d8, [x + ux * 0.6, 1.3, z + uz * 0.6], 0.16); ctx.add(G_SPH, 0xf0e8d8, [x - ux * 0.5, 1.3, z - uz * 0.5], 0.16);
      const c = Math.abs(ux), s = Math.abs(uz); ctx.obs(x, z, 1.45 * c + 0.65 * s, 1.45 * s + 0.65 * c);
    }
    function carousel(ctx, x, z) {
      ctx.add(G_CYL, P.wood, [x, 0.2, z], [3.2, 0.4, 3.2]); ctx.add(G_CYL, P.gold, [x, 1.8, z], [0.25, 3.6, 0.25]);
      ctx.add(G_CONE, P.stripeA, [x, 4.2, z], [3.6, 1.4, 3.6]); ctx.obs(x, z, 3.0, 3.0);
      const horses = dynGroup(ctx, (B) => { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, hx = Math.cos(a) * 2.4, hz = Math.sin(a) * 2.4; B.add(G_CYL6, P.gold, [hx, 1.6, hz], [0.04, 3.0, 0.04], null, false); B.add(G_BOX, 0xe8dcc8, [hx, 1.2, hz], [0.3, 0.45, 0.9], [0, -a, 0]); B.add(G_BOX, 0xe8dcc8, [hx + Math.cos(a + HPI) * 0.45, 1.55, hz + Math.sin(a + HPI) * 0.45], [0.2, 0.5, 0.3], [0, -a, 0.3]); } }, x, 0.2, z, 0);
      ctx.mech.carousel = { x, z, obj: horses, speed: 0.2 };
      ctx.anim((dt) => { horses.rotation.y += dt * ctx.mech.carousel.speed; });
      garland(ctx, x - 3.6, z, x + 3.6, z, 3.4);
    }
    function puppet(ctx, x, z) { const g = statue(ctx, (B, GB) => { humanoid(B, 0xc8b8a0, { s: 0.9, y: 0.25 }); B.add(G_CONE, 0x7a1a1e, [0, 2.1, 0], [0.22, 0.4, 0.22]); for (const dx of [-0.4, 0, 0.4]) B.add(G_CYL6, 0xd8d8d8, [dx, 3.5, 0], [0.01, 2.6, 0.01], null, false); GB.add(G_SPH_LO, 0x0a0a0a, [-0.07, 1.68, 0.21], 0.025); GB.add(G_SPH_LO, 0x0a0a0a, [0.07, 1.68, 0.21], 0.025); }, x, z, 0, 'pantin', 0.35); ctx.anim((dt, t) => { if (g.userData.x === x) g.rotation.z = Math.sin(t * 0.8 + x) * 0.06; }); return g; }
    return {
      theme: TH('Foire aux pantins', 0x050302, [14, 44], 0xb08a6a, 0x1a0e08, 0xffd8a0, 0.16, 0.1, 0.7, 'amb_foire', 'mus_foire', P),
      palette: P, layouts: ['chapiteau', 'manege', 'stands', 'allee'], wallH: 3.4, southH: 1.2, doorStyle: 'bois', pulse: { amp: 0.4, speed: 3.2 },
      floor(g, w, h, rnd) { g.fillStyle = css(P.floor); g.fillRect(0, 0, w, h); P2.blobs(g, w, h, rnd, 40, 0x5a4a2a, 15, 50, 0.4); P2.noise(g, w, h, rnd, 700, [0xc8a860, 0x8a6a3a], 1, 3, 0.5); P2.noise(g, w, h, rnd, 150, [0xff5050, 0x60c0ff, 0xffd080, 0x80ff80], 2, 4, 0.5); P2.vignette(g, w, h, 0.65); },
      walls(ctx, side, u0, u1, H) {
        let i = 0;
        runBlocks(ctx, u0, u1, 1.0, 1.0, (u, len) => { wallBox(ctx, side, u, 0, H / 2, len, H, 0.4, (i++ % 2) ? P.stripeA : P.stripeB); });
        if (side === 'S') return;
        for (let u = u0 + 3; u < u1; u += 6) { const p = wpos(ctx, side, u, 0.4); ctx.add(G_CYL, P.wood, [p[0], H / 2 + 0.6, p[1]], [0.14, H + 1.2, 0.14]); ctx.add(G_SPH, P.gold, [p[0], H + 1.3, p[1]], 0.2); }
      },
      layout: {
        chapiteau(ctx) { ctx.add(G_CYL, P.stripeA, [0, 0.15, -1], [6.5, 0.3, 6.5], null, false); ctx.add(G_CYL, P.floor, [0, 0.16, -1], [6.1, 0.3, 6.1], null, false); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { ctx.box(shade(P.wood, k * 0.08), sx * (10 + k * 1.1), 0.35 + k * 0.6, -2, 1.1, 0.7 + k * 1.2, 12); } ctx.obs(-11.1, -2, 1.7, 6); ctx.obs(11.1, -2, 1.7, 6); for (const [x, z] of [[-6, -11], [6, -11]]) PROP.pillar(ctx, x, z, 0.3, 5, P.gold, null); garland(ctx, -6, -11, 6, -11, 4.5); garland(ctx, -6, -11, 0, 8, 4.5); garland(ctx, 6, -11, 0, 8, 4.5); },
        manege(ctx) { carousel(ctx, -7, -6.5); booth(ctx, 8, -9, 0); booth(ctx, 10.5, 2, -HPI); garland(ctx, -12, 7, 12, 7, 3.6); },
        stands(ctx) { for (const [x, z, ry] of [[-9, -9, 0], [-3.5, -10.5, 0], [8, -9, 0], [-11.5, -2, HPI], [11.5, -2, -HPI], [-11.5, 5, HPI], [11.5, 5, -HPI]]) booth(ctx, x, z, ry); garland(ctx, -11, -6, 11, -6, 3.8); garland(ctx, -11, 2, 11, 2, 3.8); },
        allee(ctx) { for (const sx of [-1, 1]) for (const z of [-9, -3.5, 2]) booth(ctx, sx * 7.5, z, sx < 0 ? HPI : -HPI); for (const z of [-9, -3.5, 2]) garland(ctx, -7.5, z, 7.5, z, 3.8); ctx.anchors.shadows.push([-11.5, -11], [11.5, -11], [-11.5, 8], [11.5, 8]); },
      },
      boss(ctx) { ctx.add(G_CYL, P.stripeA, [0, 0.15, -1], [7.5, 0.3, 7.5], null, false); ctx.add(G_CYL, P.floor, [0, 0.16, -1], [7.1, 0.3, 7.1], null, false); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; garland(ctx, 0, -1, Math.cos(a) * 12, Math.sin(a) * 11 - 1, 5); } for (const [x, z] of [[-10, -9], [10, -9], [-11, 5], [11, 5]]) puppet(ctx, x, z); },
      decor(ctx) {
        const balloons = []; for (let i = 0; i < 5; i++) balloons.push([ctx.r(-11, 11), ctx.r(2.8, 4.5), ctx.r(-11, 8)]);
        const gs = dynMany(ctx, (B, GB) => { B.add(G_SPH, 0xc8302a, [0, 0, 0], [0.4, 0.5, 0.4]); B.add(G_CYL6, 0xd8d8d8, [0, -1, 0], [0.01, 1.6, 0.01], null, false); }, balloons);
        ctx.anim((dt, t) => gs.forEach((g, i) => { g.position.y = balloons[i][1] + Math.sin(t * 0.9 + i) * 0.3; g.position.x = balloons[i][0] + Math.sin(t * 0.3 + i * 2) * 0.5; }));
        particles(ctx, 30, 0xffe0a0, 0.06, 'dust', { op: 0.5, additive: false });
        if (ctx.layout !== 'secret' && ctx.layout !== 'boss') { const sp = [[-11.5, 10], [11.5, 10], [-4.5, -11.5], [4.5, -11.5]].filter((p) => ctx.free(p[0], p[1], 0.5, { allowCenter: true })); sp.slice(0, 2).forEach((p) => puppet(ctx, p[0], p[1])); }
      },
      lights(ctx) { addLight(ctx, -5, 3, -5, 0xffd080, 1.3, 11, { flicker: 0.5, speed: 14 }); addLight(ctx, 5, 3, 2, 0xff5050, 1.1, 10, { flicker: 0.3, speed: 6 }); },
      secretDecor(ctx) { booth(ctx, -5, -8, HPI); },
    };
  })();

  // ==================================================================
  //  14. ARÈNE DES ÉPREUVES — cercle de pierre noire, juges encapuchonnés, braseros
  // ==================================================================
  DEFS.arene_epreuves = (() => {
    const P = { wall: 0x1e1c22, stone: 0x2a2830, sand: 0x4a3e2e, gold: 0xc8a050, rune: 0xffc860, floor: 0x3a3226, outer: 0x030303,
      doorFrame: 0x2a2830, doorWood: 0x1e1c22, doorBand: 0xc8a050, doorKey: 0xffc860, doorOpen: 0xffd890, secret: 0xffd890 };
    function judge(ctx, x, z) { const ry = Math.atan2(-x, -z); return statue(ctx, (B, GB) => { B.add(G_BOX, P.stone, [0, 0.6, 0], [1.4, 1.2, 1.4]); humanoid(B, 0x14121a, { robe: true, hood: true, s: 1.3, y: 1.2 }); GB.add(G_SPH_LO, P.rune, [-0.1, 3.55, 0.3], 0.04); GB.add(G_SPH_LO, P.rune, [0.1, 3.55, 0.3], 0.04); }, x, z, ry, 'juge', 0.75); }
    function brazier(ctx, x, z) { ctx.add(G_CYL, 0x2a2a2a, [x, 0.6, z], [0.12, 1.2, 0.12]); ctx.add(cylT(1.4, 8), 0x3a3a3a, [x, 1.3, z], [0.45, 0.3, 0.45]); ctx.glow(G_CONE, 0xffa040, [x, 1.75, z], [0.35, 0.7, 0.35]); ctx.obs(x, z, 0.45, 0.45); }
    function arenaRing(ctx) {
      for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, x = Math.sin(a) * 13.2, z = -Math.cos(a) * 13.2; if (Math.abs(x) < 3 && z < 0) continue; if (Math.abs(x) > 13.5 || Math.abs(z) > 13.5) continue; ctx.add(G_BOX, jit(P.wall, ctx.rnd, 0.06), [x, 1.0, z], [2.2, 2.0, 0.8], [0, -a, 0]); }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.box(P.wall, sx * 12.4, 1.0, sz * 12.4, 3.2, 2.0, 3.2); ctx.obs(sx * 12.4, sz * 12.4, 1.6, 1.6); }
    }
    return {
      theme: TH('Arène des épreuves', 0x040303, [16, 48], 0xd0b080, 0x1a1208, 0xffd8a0, 0.2, 0.16, 0.6, 'amb_epreuve', 'mus_epreuve', P),
      palette: P, layouts: ['cercle', 'piliers', 'juges'], wallH: 2.2, southH: 1.0, doorStyle: 'grille', pulse: { amp: 0.3, speed: 1.5 },
      floor(g, w, h, rnd) { g.fillStyle = css(P.sand); g.fillRect(0, 0, w, h); P2.noise(g, w, h, rnd, 2000, [0x5a4a36, 0x2a2218], 1, 3, 0.5); g.strokeStyle = css(0x2a2016, 0.7); g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h / 2, 200, 0, TAU); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 120, 0, TAU); g.stroke(); P2.vignette(g, w, h, 0.6); },
      floorGlow(g, w, h) { g.strokeStyle = 'rgba(255,190,80,0.7)'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 75, h / 2 + Math.sin(a) * 75, 8, 0, TAU); g.stroke(); } },
      walls(ctx, side, u0, u1, H) { runBlocks(ctx, u0, u1, 1.5, 2.2, (u, len) => wallBox(ctx, side, u, 0, H / 2, len - 0.04, H, 1.0, jit(P.wall, ctx.rnd, 0.05))); },
      layout: {
        cercle(ctx) { arenaRing(ctx); for (const [x, z] of [[-9, -9], [9, -9], [-10, 6], [10, 6]]) judge(ctx, x, z); },
        piliers(ctx) { arenaRing(ctx); for (const [x, z] of [[-6, -6], [6, -6], [-6, 4.5], [6, 4.5]]) PROP.pillar(ctx, x, z, 0.7, 3.5, P.stone, P.gold); for (const [x, z] of [[-10, -1], [10, -1]]) judge(ctx, x, z); },
        juges(ctx) { arenaRing(ctx); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + PI / 8, x = Math.sin(a) * 9.5, z = -Math.cos(a) * 9.5; if (Math.abs(x) < 3 && z < 0) continue; judge(ctx, x, z); } },
      },
      boss(ctx) { arenaRing(ctx); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + PI / 6, x = Math.sin(a) * 10, z = -Math.cos(a) * 10; if (Math.abs(x) < 3 && z < 0) continue; judge(ctx, x, z); } },
      decor(ctx) { for (const [x, z] of [[-4.5, -11], [4.5, -11]]) if (ctx.free(x, z, 0.5, { allowCenter: true, allowDoor: true })) brazier(ctx, x, z); particles(ctx, 30, 0xffa040, 0.08, 'embers', { y1: 3, op: 0.6 }); },
      lights(ctx) { addLight(ctx, -4.5, 2, -11, 0xffa040, 1.5, 12, { flicker: 0.35, speed: 9 }); addLight(ctx, 4.5, 2, -11, 0xffa040, 1.5, 12, { flicker: 0.35, speed: 10 }); addLight(ctx, 0, 3, 6, 0xffc860, 0.8, 12, { flicker: 0.2, speed: 4 }); },
      secretDecor(ctx) { judge(ctx, -5.5, -8); },
    };
  })();

  // ==================================================================
  //  ENREGISTREMENT
  // ==================================================================
  const DESCR = {
    mine_abandonnee: 'Galeries étayées, rails et wagonnets, poutres, lanternes à huile, éboulis et puits.',
    foret_interdite: 'Troncs géants, racines arc-boutées, brume rampante, champignons luminescents, feux follets.',
    catacombes_oubliees: 'Couloirs étroits, niches remplies de crânes, sarcophages, colonnes d\'ossements, fosse.',
    chateau_maudit: 'Damier de marbre, tapis rouge déchiré, armures, lustres, vitraux, portraits aux yeux rouges.',
    cathedrale_noyee: 'Nef inondée (eau qui monte), colonnes gothiques, vitraux bleus, orgue, anges, bancs renversés.',
    temple_sanglant: 'Autels, canaux de sang lumineux, glyphes rouges, colonnes massives, gradins, dalles sacrificielles.',
    abime_infernal: 'Rivières de lave et ponts, île cerclée de lave, aiguilles noires, chaînes et cages suspendues, braises.',
    asile_failles: 'Carrelage sale, cellules, lits renversés, néons qui grésillent, bloc opératoire, failles violettes.',
    bibliotheque_engloutie: 'Rayonnages en allées et en L, rotonde, mezzanines, livres flottants, flaques d\'encre.',
    necropole_glace: 'Mausolées de glace, stèles, crevasses et ponts de glace, stalactites, chevaliers figés, aurore.',
    jardin_chair: 'Haies organiques, veines pulsantes, fleurs à dents, bulbes, serre de fer, bassin de bile, yeux sur tiges.',
    observatoire_neant: 'Plates-formes au-dessus du vide, anneaux d\'astrolabe, télescope géant, étoiles mourantes.',
    foire_pantins: 'Fête foraine morte : chapiteau, manège qui tourne, stands, guirlandes d\'ampoules, pantins suspendus.',
    arene_epreuves: 'Arène circulaire de pierre noire, juges encapuchonnés, braseros, runes dorées au sol.',
  };
  function safeBuild(id, opts) {
    const def = DEFS[id];
    try {
      const room = buildArchi(id, def, opts || {});
      // les statues déplacées par l'horreur gardent leur collision synchronisée
      const st = room.anchors.statues;
      const upd = room.update;
      room.update = function (dt, time) {
        upd.call(room, dt, time);
        for (let i = 0; i < st.length; i++) { const g = st[i], ob = g && g.userData && g.userData.obstacle; if (ob) { ob.x = g.position.x; ob.z = g.position.z; } }
      };
      return room;
    } catch (e) {
      console.error('[dungeon-themes] construction ' + id + ' échouée', e);
      return null;
    }
  }
  const IDS = Object.keys(DEFS);
  IDS.forEach((id) => {
    const def = DEFS[id];
    def.theme.layouts = def.layouts.slice();
    def.theme.archi = id;
    def.theme.desc = DESCR[id] || '';
    if (G.GFX && G.GFX.registerTheme) G.GFX.registerTheme(id, { theme: def.theme, layouts: def.layouts.slice(), build: (opts) => safeBuild(id, opts) });
  });
  if (!(G.GFX && G.GFX.registerTheme)) console.warn('[dungeon-themes] G.GFX.registerTheme absent : architectures non enregistrées');

  G.DungeonThemes = {
    ids: () => IDS.slice(),
    has: (id) => !!DEFS[id],
    layouts: (id) => (DEFS[id] ? DEFS[id].layouts.slice() : []),
    theme: (id) => (DEFS[id] ? DEFS[id].theme : null),
    describe: (id) => (DEFS[id] ? { id, name: DEFS[id].theme.name, desc: DESCR[id] || '', layouts: DEFS[id].layouts.slice(), ambience: DEFS[id].theme.ambience, music: DEFS[id].theme.music, darkness: DEFS[id].theme.darkness } : null),
    build: (id, opts) => (DEFS[id] ? safeBuild(id, opts) : null),
    moveStatue,
  };
})();
