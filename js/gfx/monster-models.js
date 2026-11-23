/* =====================================================================
 *  Donjon Arena 3D v3 — MODÈLES DE MONSTRES (rôle 9)
 *  G.GFX.registerModel('enemy', id, build(opts)) pour les nouvelles espèces.
 *  Style chibi toon : géométries partagées (cache), matériaux par instance (flash),
 *  contours via G.GFX.addOutline, regardent +Z, pieds en y=0.
 *  Animation : graphics.js n'anime que ses propres rigs → on chaîne G.GFX.animateCharacter :
 *  les modèles d'ici portent userData.mmAnim et sont animés par ce chaînon
 *  (marche, windup = bras levés / accroupi, attack = fente, mimique ouverte, orbites…).
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  if (typeof THREE === 'undefined' || !G.GFX || !G.GFX.registerModel) return;
  const T = THREE;
  const TAU = Math.PI * 2, PI = Math.PI;

  // ---------------- géométries partagées (unité = 1) ----------------
  const GEO = {};
  const MAKE = {
    sph: () => new T.SphereGeometry(0.5, 10, 8),
    lsph: () => new T.SphereGeometry(0.5, 7, 5),
    box: () => new T.BoxGeometry(1, 1, 1),
    cyl: () => new T.CylinderGeometry(0.5, 0.5, 1, 8),
    tcyl: () => new T.CylinderGeometry(0.3, 0.5, 1, 8),     // tronc (haut plus étroit)
    cone: () => new T.ConeGeometry(0.5, 1, 8),
    cone4: () => new T.ConeGeometry(0.5, 1, 4),
    tor: () => new T.TorusGeometry(0.5, 0.09, 6, 16),
    oct: () => new T.OctahedronGeometry(0.5, 0),
    ico: () => new T.IcosahedronGeometry(0.5, 0),
    tet: () => new T.TetrahedronGeometry(0.5, 0),
    hemi: () => new T.SphereGeometry(0.5, 10, 5, 0, TAU, 0, PI / 2),
    disc: () => new T.CircleGeometry(0.5, 14),
  };
  const geo = (k) => GEO[k] || (GEO[k] = (() => { const g = MAKE[k](); g.userData = g.userData || {}; g.userData.shared = true; return g; })());   // partagée : ne jamais disposer

  const _c1 = new T.Color(), _c2 = new T.Color();
  function mix(hex, tint, k) {
    if (tint == null) return hex;
    _c1.setHex(hex); _c2.setHex(tint);
    return _c1.lerp(_c2, k == null ? 0.55 : k).getHex();
  }

  // ---------------- constructeur de modèle ----------------
  function Build(opts) {
    this.root = new T.Group();
    this.mats = [];
    this.tint = opts && opts.tint != null && opts.tint !== false ? (typeof opts.tint === 'string' ? parseInt(opts.tint.replace('#', ''), 16) : opts.tint) : null;
    this.cache = {};
    this.parts = {};
  }
  Build.prototype.mat = function (hex, o) {
    o = o || {};
    const col = o.tn === false ? hex : mix(hex, this.tint, o.tk);
    const key = col + '|' + (o.glow ? 1 : 0) + '|' + (o.op || 1);
    if (this.cache[key]) return this.cache[key];
    const mo = {};
    if (o.glow) { mo.emissive = col; mo.emissiveIntensity = 0.95; } else { mo.emissive = 0x000000; mo.emissiveIntensity = 1; }
    if (o.op && o.op < 1) { mo.opacity = o.op; mo.transparent = true; mo.depthWrite = false; }
    const m = G.GFX.toon(col, mo);
    this.mats.push(m);
    return (this.cache[key] = m);
  };
  /** add(parent, geoKey, hex, [x,y,z], scale|[sx,sy,sz], [rx,ry,rz], opts{glow,op,tn,noOutline}) */
  Build.prototype.add = function (parent, g, hex, pos, scl, rot, o) {
    o = o || {};
    const m = new T.Mesh(geo(g), this.mat(hex, o));
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (typeof scl === 'number') m.scale.set(scl, scl, scl); else if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (o.glow || o.op || o.noOutline) m.userData.noOutline = true;
    parent.add(m);
    return m;
  };
  Build.prototype.piv = function (parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g;
  };
  Build.prototype.finish = function (o) {
    const root = this.root;
    try { G.GFX.addOutline(root, 0.03); } catch (e) { /* contours facultatifs */ }
    const ud = root.userData;
    ud.mats = this.mats; ud.height = o.height; ud.radius = o.radius;
    ud.parts = this.parts; ud.style = o.style || 'biped'; ud.mmAnim = anim;
    ud.walk = o.walk || 9; ud.phase = Math.random() * 6;
    const p = this.parts;
    ['armL', 'armR', 'legL', 'legR', 'head', 'body'].forEach((k) => { if (p[k]) ud[k] = p[k]; });
    if (o.float) ud.float = o.float;
    root.userData.open = 0;
    return root;
  };

  // ---------------- humanoïde générique ----------------
  function biped(b, o) {
    const h = o.h || 1, R = b.root, p = b.parts;
    const bw = o.bw || 1;
    p.legL = b.piv(R, 0.15 * h, 0.5 * h, 0); p.legR = b.piv(R, -0.15 * h, 0.5 * h, 0);
    [p.legL, p.legR].forEach((l) => {
      b.add(l, 'cyl', o.legC, [0, -0.25 * h, 0], [0.17 * h, 0.5 * h, 0.17 * h]);
      b.add(l, 'box', o.boot || o.legC, [0, -0.46 * h, 0.04 * h], [0.2 * h, 0.1 * h, 0.3 * h]);
    });
    p.body = b.piv(R, 0, 0.5 * h, 0);
    b.add(p.body, o.torsoGeo || 'cyl', o.cloth, [0, 0.27 * h, 0], [0.5 * h * bw, 0.5 * h, 0.36 * h * bw]);
    p.head = b.piv(p.body, 0, 0.58 * h, 0.02 * h);
    b.add(p.head, 'sph', o.skin, [0, 0.2 * h, 0], [0.62 * h, 0.56 * h, 0.58 * h]);
    const eyeC = o.eye != null ? o.eye : 0xffee55;
    [1, -1].forEach((s) => {
      b.add(p.head, 'lsph', 0xffffff, [s * 0.13 * h, 0.24 * h, 0.25 * h], [0.15 * h, 0.14 * h, 0.08 * h], null, { tn: false, noOutline: true });
      b.add(p.head, 'lsph', eyeC, [s * 0.13 * h, 0.24 * h, 0.29 * h], [0.08 * h, 0.09 * h, 0.05 * h], null, { glow: true, tn: false });
    });
    p.armL = b.piv(p.body, (0.3 * bw + 0.06) * h, 0.44 * h, 0); p.armR = b.piv(p.body, -(0.3 * bw + 0.06) * h, 0.44 * h, 0);
    [p.armL, p.armR].forEach((a) => {
      b.add(a, 'cyl', o.armC || o.skin, [0, -0.2 * h, 0], [0.13 * h, 0.4 * h, 0.13 * h]);
      b.add(a, 'sph', o.skin, [0, -0.42 * h, 0.02 * h], 0.16 * h);
    });
    return p;
  }

  // ---------------- quadrupède générique ----------------
  function quad(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 0.5 * s, 0);
    b.add(p.body, 'sph', o.fur, [0, 0.12 * s, 0], [0.5 * s, 0.46 * s, 0.95 * s]);
    p.head = b.piv(p.body, 0, 0.22 * s, 0.5 * s);
    b.add(p.head, 'sph', o.fur, [0, 0, 0.05 * s], [0.4 * s, 0.38 * s, 0.4 * s]);
    b.add(p.head, 'box', o.snout || o.fur, [0, -0.06 * s, 0.26 * s], [0.18 * s, 0.14 * s, 0.26 * s]);
    b.add(p.head, 'sph', 0x1a1418, [0, -0.0 * s, 0.4 * s], 0.07 * s, null, { tn: false });
    [1, -1].forEach((sd) => {
      b.add(p.head, 'cone', o.ear || o.fur, [sd * 0.13 * s, 0.22 * s, -0.02 * s], [0.12 * s, 0.24 * s, 0.1 * s]);
      b.add(p.head, 'lsph', o.eye || 0xffd23f, [sd * 0.1 * s, 0.06 * s, 0.2 * s], [0.08 * s, 0.06 * s, 0.05 * s], null, { glow: true, tn: false });
    });
    p.tail = b.piv(p.body, 0, 0.2 * s, -0.45 * s);
    b.add(p.tail, 'cone', o.fur, [0, 0.02 * s, -0.22 * s], [0.14 * s, 0.5 * s, 0.14 * s], [-1.9, 0, 0]);
    p.legs = [];
    [[1, 0.3], [-1, 0.3], [1, -0.3], [-1, -0.3]].forEach(([sd, z]) => {
      const l = b.piv(R, sd * 0.2 * s, 0.4 * s, z * s);
      b.add(l, 'cyl', o.leg || o.fur, [0, -0.2 * s, 0], [0.13 * s, 0.4 * s, 0.13 * s]);
      b.add(l, 'box', o.paw || o.leg || o.fur, [0, -0.38 * s, 0.03 * s], [0.15 * s, 0.07 * s, 0.2 * s]);
      p.legs.push(l);
    });
    p.legL = p.legs[0]; p.legR = p.legs[1];
    return p;
  }

  // ---------------- animation commune (chaînée sur G.GFX.animateCharacter) ----------------
  function animBase(g, time, st) {
    const ud = g.userData, p = ud.parts;
    if (!p) return;
    const mv0 = st.moving ? 1 : 0;
    ud._mv = ud._mv == null ? mv0 : ud._mv + (mv0 - ud._mv) * 0.2;
    const mv = ud._mv, w = Math.max(0, Math.min(1, st.windup || 0)), a = Math.max(0, Math.min(1, st.attack || 0));
    const t = (time || 0) + (ud.phase || 0), ph = t * (ud.walk || 9), sw = Math.sin(ph) * mv;
    const body = p.body;
    if (body && body.userData.by == null) body.userData.by = body.position.y;
    const by = body ? body.userData.by : 0;
    switch (ud.style) {
      case 'quad': {
        if (p.legs) p.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw) * 0.8; });
        if (body) { body.position.y = by + Math.abs(sw) * 0.06 - w * 0.12 * 1; body.rotation.x = -0.28 * w + 0.3 * a; body.scale.y = 1 - 0.08 * w; }
        if (p.head) p.head.rotation.x = -0.2 * w + Math.sin(t * 2) * 0.03;
        if (p.tail) p.tail.rotation.y = Math.sin(t * (3 + 4 * mv)) * 0.5;
        break;
      }
      case 'float': {
        const bob = Math.sin(t * 2.2) * 0.1;
        if (body) { body.position.y = by + bob; body.rotation.x = 0.35 * a - 0.15 * w; body.scale.setScalar(1 + 0.12 * w); }
        if (p.orbit) p.orbit.rotation.y = t * (1.4 + 3 * w);
        if (p.ring) p.ring.rotation.z = t * 1.2;
        if (p.core) p.core.scale.setScalar((p.core.userData.s0 || (p.core.userData.s0 = p.core.scale.x)) * (1 + 0.1 * Math.sin(t * (6 + 12 * w)) + 0.35 * w));
        if (p.armL) { p.armL.rotation.x = -2.3 * w + 0.25 * Math.sin(t * 2); p.armL.rotation.z = -0.3; }
        if (p.armR) { p.armR.rotation.x = -2.3 * w + a * 2.4 + 0.25 * Math.sin(t * 2 + 1); p.armR.rotation.z = 0.3; }
        if (p.tail) p.tail.rotation.y = Math.sin(t * 3) * 0.4;
        if (p.wingL) { const f = Math.sin(t * 9) * 0.5; p.wingL.rotation.z = f; p.wingR.rotation.z = -f; }
        break;
      }
      case 'blob': {
        const hop = ud.hop ? Math.abs(Math.sin(t * (4 + 5 * mv))) * 0.28 * (0.3 + mv) : 0;
        if (body) {
          body.position.y = by + hop;
          const sq = 1 + Math.sin(t * (3 + 6 * mv)) * 0.06 - 0.14 * w + 0.1 * a;
          body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        }
        if (p.legL) { p.legL.rotation.x = sw * 0.9; p.legR.rotation.x = -sw * 0.9; }
        if (p.core) p.core.scale.setScalar((p.core.userData.s0 || (p.core.userData.s0 = p.core.scale.x)) * (1 + 0.2 * Math.sin(t * (8 + 16 * w))));
        if (p.orbit) p.orbit.rotation.y = t * 2.5;
        break;
      }
      case 'worm': {
        const segs = p.segs || [];
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i], k = i + 1;
          s.position.x = (s.userData.x0 == null ? (s.userData.x0 = s.position.x) : s.userData.x0) + Math.sin(t * 3 + k * 0.9) * 0.1 * (0.5 + mv);
        }
        if (p.head) { p.head.rotation.x = -0.5 * w + 0.25 * a + Math.sin(t * 2.4) * 0.08; p.head.position.y = (p.head.userData.y0 == null ? (p.head.userData.y0 = p.head.position.y) : p.head.userData.y0) + w * 0.25; }
        if (body) body.scale.y = 1 + Math.sin(t * 3) * 0.03;
        break;
      }
      case 'mimic': {
        const op = ud.open || 0;
        if (p.lid) p.lid.rotation.x = -op * 1.15 - Math.sin(t * 8) * 0.05 * op - w * 0.5;
        if (p.legs) p.legs.forEach((l, i) => { l.scale.y = 0.05 + 0.95 * Math.min(1, op * 2); l.rotation.x = (i % 2 ? sw : -sw) * 0.7; });
        if (p.inner) { p.inner.scale.setScalar(Math.max(0.001, op)); }
        if (body) { body.position.y = by + (op > 0.3 ? 0.2 * op + Math.abs(sw) * 0.08 : 0); body.rotation.x = 0.2 * a; }
        break;
      }
      default: { // biped
        if (p.legL) { p.legL.rotation.x = sw * 0.75; p.legR.rotation.x = -sw * 0.75; }
        if (p.armL) p.armL.rotation.x = -sw * 0.6 - 2.5 * w;
        if (p.armR) p.armR.rotation.x = sw * 0.6 - 2.5 * w + a * 2.7;
        if (body) { body.position.y = by + Math.abs(sw) * 0.06; body.rotation.x = 0.28 * a - 0.18 * w; body.scale.y = 1 + Math.sin(t * 2) * 0.015; }
        if (p.head) p.head.rotation.x = -0.12 * a;
        if (p.tail) p.tail.rotation.y = Math.sin(t * 3) * 0.4;
        if (p.wingL) { const f = Math.sin(t * 12) * 0.5; p.wingL.rotation.z = f; p.wingR.rotation.z = -f; }
      }
    }
  }

  // ---------------- v5 : animation enrichie (chaînée sur l'animation de base) ----------------
  function anim(g, time, st) {
    const ud = g.userData, p = ud.parts;
    if (!p) return;
    st = st || {};
    const mv0 = st.moving ? 1 : 0;
    const w = Math.max(0, Math.min(1, st.windup || 0)), a = Math.max(0, Math.min(1, st.attack || 0));
    const t = (time || 0) + (ud.phase || 0);
    const sty = ud.style;
    const body = p.body;
    if (body && body.userData.by == null) body.userData.by = body.position.y;
    const by = body ? body.userData.by : 0;
    if (ud.awake != null && ud.awake < 0.99) {          // statue dormante : pose figée, tremblement à l'éveil
      if (p.armL) { p.armL.rotation.x = 0; p.armR.rotation.x = 0; }
      if (p.legL) { p.legL.rotation.x = 0; p.legR.rotation.x = 0; }
      if (p.head) p.head.rotation.x = 0.2 * (1 - ud.awake);
      if (p.head && p.head.children.length) { /* yeux qui s'allument via mats */ }
      return;
    }
    if (sty === 'crawl') {
      ud._mv = ud._mv == null ? mv0 : ud._mv + (mv0 - ud._mv) * 0.25;
      const mv = ud._mv, ph = t * (ud.walk || 14);
      if (p.legs) p.legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + i * 1.3) * 0.7 * mv + Math.sin(t * 3 + i) * 0.06; l.rotation.z = Math.cos(ph + i * 1.3) * 0.15 * mv; });
      if (body) { body.position.y = by + Math.abs(Math.sin(ph)) * 0.05 * mv - 0.12 * w; body.rotation.z = Math.sin(ph * 0.5) * 0.1 * mv; body.rotation.x = -0.35 * w + 0.45 * a; body.scale.y = 1 - 0.25 * w; }
      if (p.head) { p.head.rotation.x = -0.3 * w + Math.sin(t * 2.2) * 0.08; p.head.rotation.y = Math.sin(t * 1.3) * 0.25 * (1 - mv); }
      if (p.armL) { p.armL.rotation.x = -1.5 * w + 0.6 * a + Math.sin(ph) * 0.4 * mv; p.armR.rotation.x = -1.5 * w + 0.6 * a - Math.sin(ph) * 0.4 * mv; }
      if (p.wingL) { const f = Math.sin(t * 25) * 0.6; p.wingL.rotation.z = f; p.wingR.rotation.z = -f; }
    } else if (sty === 'weeping') {
      ud._mv = ud._mv == null ? mv0 : ud._mv + (mv0 - ud._mv) * 0.2;
      const mv = ud._mv, f = ud.frozen == null ? 1 : ud.frozen, ph = t * (ud.walk || 7), sw = Math.sin(ph) * mv;
      if (p.legL) { p.legL.rotation.x = sw * 0.5 * (1 - f); p.legR.rotation.x = -sw * 0.5 * (1 - f); }
      if (p.armL) {   // gelée : mains sur le visage ; libre : bras tendus, griffes en avant
        const cover = -2.55 * f, reach = (-1.25 - 1.3 * w + 0.6 * a + Math.sin(t * 9) * 0.08) * (1 - f);
        p.armL.rotation.x = cover + reach; p.armR.rotation.x = cover + reach;
        p.armL.rotation.z = -0.35 * f + 0.15 * (1 - f); p.armR.rotation.z = 0.35 * f - 0.15 * (1 - f);
      }
      if (p.head) { p.head.rotation.x = 0.45 * f - 0.1 * a; p.head.rotation.z = Math.sin(t * 17) * 0.05 * (1 - f); }
      if (body) { body.position.y = by + Math.abs(sw) * 0.03 * (1 - f); body.rotation.z = Math.sin(t * 22) * 0.05 * (1 - f) * (0.3 + mv); body.rotation.x = 0.3 * a - 0.18 * w; }
      if (p.wingL) { const o = (1 - f) * 0.5 + 0.1; p.wingL.rotation.z = 0.2 + Math.sin(t * 3) * 0.05 * (1 - f) + o * 0.3; p.wingR.rotation.z = -p.wingL.rotation.z; }
      if (p.tears) p.tears.forEach((s, i) => { const k = (t * 0.9 + i * 0.5) % 1; s.position.y = 0.15 - k * 0.3; s.scale.setScalar(0.5 + (1 - k) * 0.6); });
    } else if (sty === 'wall') {
      const op = ud.open || 0, rc = ud.reach || 0;
      if (p.reachArms) p.reachArms.forEach((arm, i) => { arm.scale.z = 0.02 + op * 0.35 + rc * 1.3 + w * 0.4; arm.scale.x = arm.scale.y = 0.3 + op * 0.7; arm.rotation.y = (i ? -1 : 1) * (0.25 - 0.2 * rc) + Math.sin(t * 2 + i) * 0.05 * op; arm.rotation.x = Math.sin(t * 1.5 + i) * 0.05; });
      if (p.head) { p.head.rotation.x = -0.1 * op * w; p.head.position.z = 0.08 + op * 0.12 + w * 0.1; p.head.scale.setScalar(1 + 0.05 * Math.sin(t * 2.2) * op); }
      if (body) { body.position.y = by + Math.sin(t * 1.4) * 0.02 * op; body.rotation.z = Math.sin(t * 20) * 0.03 * w; }
    } else {
      animBase(g, time, st);
      if (ud.frozen != null && ud.frozen > 0.02 && p.armL) {   // ex. mineur possédé : s'immobilise, bras devant le visage
        const f = ud.frozen;
        p.armL.rotation.x += (-2.2 - p.armL.rotation.x) * f; p.armR.rotation.x += (-2.2 - p.armR.rotation.x) * f;
        if (p.legL) { p.legL.rotation.x *= 1 - f; p.legR.rotation.x *= 1 - f; }
        if (p.head) p.head.rotation.x = 0.4 * f;
      }
      if (ud.limp && p.legR) { p.legR.rotation.x *= 0.4; if (body) body.rotation.z = Math.sin(t * (ud.walk || 9)) * 0.09; }
      if (ud.asleep) { if (p.head) p.head.rotation.x = 0.7; if (body) body.rotation.x = 0.25; }
    }
    // --- accessoires communs
    if (p.jaw && sty !== 'wall') p.jaw.rotation.x = 0.05 + w * 0.75 + a * 0.3 + Math.sin(t * 3) * 0.03;
    if (p.halo) p.halo.rotation.z = t * 1.5;
    if (p.cape) p.cape.rotation.x = 0.12 + Math.sin(t * 2.3) * 0.06 + 0.25 * (ud._mv || 0);
    if (p.tendrils) p.tendrils.forEach((s, i) => { s.rotation.x = PI * (s.userData.flip == null ? (s.userData.flip = Math.abs(s.rotation.x - PI) < 0.01 ? 1 : 0) : s.userData.flip) + Math.sin(t * 2 + i) * 0.25; s.rotation.z = Math.cos(t * 1.7 + i * 1.3) * 0.25; });
    if (p.strings) p.strings.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.6 + i) * 0.04; });
    if (p.drips) p.drips.forEach((s, i) => { const k = (t * 0.8 + i * 0.33) % 1; if (s.userData.y0 == null) s.userData.y0 = s.position.y; s.position.y = s.userData.y0 - k * 0.5; s.scale.setScalar(0.6 + (1 - k) * 0.6); });
    if (p.flame) p.flame.scale.set(1, 1 + Math.sin(t * 13) * 0.14 + Math.sin(t * 7.3) * 0.1, 1);
    if (p.ring && sty !== 'float') p.ring.rotation.z = t * 1.2;
    if (ud.animate) ud.animate(g, t, st);
  }

  // chaînon : si le groupe a mmAnim → notre animation ; sinon animateCharacter d'origine
  const prev = G.GFX.animateCharacter;
  G.GFX.animateCharacter = function (group, time, st) {
    if (group && group.userData && group.userData.mmAnim) {
      try { group.userData.mmAnim(group, +time || 0, st || {}); } catch (e) { if (!group.userData._err) { group.userData._err = 1; console.warn('[monster-models]', e); } }
      return;
    }
    return prev ? prev.apply(this, arguments) : undefined;
  };

  const REG = [];
  const reg = (id, fn) => REG.push(id) && G.GFX.registerModel('enemy', id, (opts) => fn(new Build(opts || {}), opts || {}));

  // =====================================================================
  //  MODÈLES
  // =====================================================================
  reg('goblin', (b) => {
    const p = biped(b, { h: 0.82, skin: 0x5fa8a0, cloth: 0x3b2f5c, legC: 0x2c2440, boot: 0x1b1428, eye: 0xff4a4a });
    [1, -1].forEach((s) => b.add(p.head, 'cone', 0x5fa8a0, [s * 0.34 * 0.82, 0.22 * 0.82, 0], [0.12, 0.34, 0.1], [0, 0, -s * 1.25]));
    b.add(p.head, 'cone', 0x4a8f88, [0, 0.19, 0.28], [0.1, 0.16, 0.1], [HP(), 0, 0]);
    b.add(p.body, 'oct', 0x6fe0ff, [0, 0.38, -0.2], [0.2, 0.46, 0.16], [0, 0, 0.3], { glow: true, tn: false });   // éclat de faille
    b.add(p.armR, 'box', 0xcfd6e6, [0, -0.38, 0.22], [0.05, 0.05, 0.4]);                                            // dague
    return b.finish({ height: 1.35, radius: 0.42, style: 'biped', walk: 11 });
  });
  const HP = () => Math.PI / 2;

  reg('goblinShaman', (b) => {
    const p = biped(b, { h: 0.85, skin: 0x7fb069, cloth: 0x7a3b9c, legC: 0x4a2565, boot: 0x2c1540, eye: 0xb6ff4a, torsoGeo: 'tcyl', bw: 1.2 });
    b.add(p.body, 'cone', 0x7a3b9c, [0, 0.0, 0], [0.62, 0.55, 0.5]);                       // robe
    [1, -1].forEach((s) => b.add(p.head, 'cone', 0x7fb069, [s * 0.3, 0.22, 0], [0.11, 0.32, 0.1], [0, 0, -s * 1.2]));
    for (let i = -1; i <= 1; i++) b.add(p.head, 'cone', [0xe53935, 0xffd23f, 0x4fc3f7][i + 1], [i * 0.1, 0.55, -0.05], [0.07, 0.3, 0.04], [0, 0, -i * 0.3], { tn: false });
    b.add(p.armR, 'cyl', 0x6b4226, [0, -0.35, 0.2], [0.05, 0.9, 0.05], [HP() * 0.4, 0, 0]);   // bâton
    p.orbit = b.piv(p.armR, 0, -0.62, 0.45);
    b.add(p.orbit, 'ico', 0x9dff4a, [0, 0, 0], 0.22, null, { glow: true });
    return b.finish({ height: 1.5, radius: 0.45, style: 'biped', walk: 8 });
  });

  reg('larva', (b) => {
    const R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 0.25, 0);
    const c = 0xe8d36a;
    [[0, 0, -0.32, 0.5], [0, 0.04, 0, 0.58], [0, 0.02, 0.3, 0.46]].forEach(([x, y, z, s], i) => {
      const m = b.add(p.body, 'sph', c, [x, y, z], [s, s * 0.85, s * 0.95]);
      b.add(p.body, 'tor', 0xb8a040, [x, y + s * 0.08, z], [s * 1.0, s * 1.0, s * 1.0], [HP(), 0, 0], { noOutline: true });
    });
    p.head = b.piv(p.body, 0, 0.05, 0.46);
    b.add(p.head, 'sph', 0x3a2a24, [0, 0, 0.04], 0.34);
    [1, -1].forEach((s) => {
      b.add(p.head, 'lsph', 0xff5a3a, [s * 0.1, 0.06, 0.18], 0.08, null, { glow: true, tn: false });
      b.add(p.head, 'cone4', 0xefe6cc, [s * 0.08, -0.1, 0.2], [0.07, 0.16, 0.07], [PI + 0.4 * s, 0, 0], { tn: false });
    });
    p.legL = b.piv(R, 0.2, 0.15, 0.1); p.legR = b.piv(R, -0.2, 0.15, 0.1);
    return b.finish({ height: 0.7, radius: 0.5, style: 'blob', walk: 14 });
  });

  reg('mimic', (b) => {
    const R = b.root, p = b.parts, wood = 0x8a5a2b, gold = 0xe0b040;
    p.body = b.piv(R, 0, 0.0, 0);
    b.add(p.body, 'box', wood, [0, 0.33, 0], [1.0, 0.56, 0.7]);
    b.add(p.body, 'box', gold, [0, 0.33, 0.351], [1.02, 0.1, 0.02], null, { tn: false });
    b.add(p.body, 'box', gold, [0.38, 0.33, 0.0], [0.1, 0.58, 0.72], null, { tn: false });
    b.add(p.body, 'box', gold, [-0.38, 0.33, 0.0], [0.1, 0.58, 0.72], null, { tn: false });
    b.add(p.body, 'box', 0x3a1a1a, [0, 0.6, 0], [0.86, 0.04, 0.56], null, { tn: false, noOutline: true });   // intérieur sombre
    p.inner = b.piv(p.body, 0, 0.62, 0);                       // dents + langue + yeux : visibles quand ouvert
    [-0.3, -0.1, 0.1, 0.3].forEach((x) => b.add(p.inner, 'cone4', 0xf4f0e0, [x, 0.05, 0.3], [0.1, 0.18, 0.1], null, { tn: false }));
    b.add(p.inner, 'sph', 0xe0607a, [0, -0.02, 0.05], [0.4, 0.06, 0.45], null, { tn: false });
    [1, -1].forEach((s) => b.add(p.inner, 'lsph', 0xffe14a, [s * 0.25, 0.12, -0.18], 0.14, null, { glow: true, tn: false }));
    p.lid = b.piv(p.body, 0, 0.62, -0.35);
    b.add(p.lid, 'hemi', wood, [0, 0, 0.35], [1.0, 0.7, 0.72], null);
    b.add(p.lid, 'box', gold, [0, 0.1, 0.7], [0.14, 0.14, 0.04], null, { tn: false });
    [-0.3, -0.1, 0.1, 0.3].forEach((x) => b.add(p.lid, 'cone4', 0xf4f0e0, [x, -0.02, 0.66], [0.1, 0.18, 0.1], [PI, 0, 0], { tn: false }));
    p.legs = [];
    [[0.38, 0.22], [-0.38, 0.22], [0.38, -0.22], [-0.38, -0.22]].forEach(([x, z]) => {
      const l = b.piv(R, x, 0.12, z);
      b.add(l, 'cyl', 0x5a3a1a, [0, -0.06, 0], [0.16, 0.24, 0.16]);
      p.legs.push(l);
    });
    p.legL = p.legs[0]; p.legR = p.legs[1];
    return b.finish({ height: 0.9, radius: 0.6, style: 'mimic', walk: 12 });
  });

  reg('goldCritter', (b) => {
    const R = b.root, p = b.parts, au = 0xffd23f;
    p.body = b.piv(R, 0, 0.45, 0);
    b.add(p.body, 'sph', au, [0, 0.1, 0], [0.72, 0.66, 0.72], null, { tn: false });
    b.add(p.body, 'sph', 0xfff0a0, [0, 0.02, 0.2], [0.4, 0.36, 0.3], null, { tn: false });
    b.add(p.body, 'sph', au, [0, 0.42, 0.2], [0.44, 0.4, 0.4], null, { tn: false });
    [1, -1].forEach((s) => {
      b.add(p.body, 'cone', au, [s * 0.14, 0.78, 0.12], [0.12, 0.44, 0.08], [-0.2, 0, -s * 0.2], { tn: false });
      b.add(p.body, 'lsph', 0x2a1a00, [s * 0.1, 0.46, 0.38], [0.07, 0.09, 0.05], null, { tn: false, noOutline: true });
    });
    b.add(p.body, 'sph', 0xfff0a0, [0, 0.12, -0.36], 0.2, null, { tn: false });
    p.orbit = b.piv(p.body, 0, 0.15, 0);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; b.add(p.orbit, 'tor', 0xfff6c0, [Math.cos(a) * 0.55, 0.1 * i, Math.sin(a) * 0.55], 0.16, [HP(), 0, a], { glow: true, tn: false }); }
    p.legL = b.piv(R, 0.16, 0.2, 0.05); p.legR = b.piv(R, -0.16, 0.2, 0.05);
    [p.legL, p.legR].forEach((l) => b.add(l, 'sph', au, [0, -0.08, 0.05], [0.18, 0.14, 0.26], null, { tn: false }));
    b.root.userData.hop = true;
    const r = b.finish({ height: 1.1, radius: 0.45, style: 'blob', walk: 14 });
    r.userData.hop = true;
    return r;
  });

  reg('mushroomBomb', (b) => {
    const p = biped(b, { h: 0.6, skin: 0xf2e4c4, cloth: 0xf2e4c4, legC: 0xe0cfa6, boot: 0xe0cfa6, eye: 0xff3a3a });
    b.add(p.head, 'hemi', 0xd8362f, [0, 0.28, 0], [1.1, 0.75, 1.1]);
    [[0.2, 0.52, 0.1], [-0.18, 0.5, 0.2], [0, 0.6, -0.15], [0.05, 0.46, 0.34]].forEach(([x, y, z]) => b.add(p.head, 'lsph', 0xffffff, [x, y, z], [0.14, 0.07, 0.14], null, { tn: false, noOutline: true }));
    b.add(p.head, 'cyl', 0x7a5a30, [0, 0.72, 0], [0.04, 0.2, 0.04], null, { tn: false });
    b.add(p.head, 'ico', 0xffa21a, [0, 0.86, 0], 0.12, null, { glow: true, tn: false });                // mèche
    return b.finish({ height: 1.2, radius: 0.42, style: 'biped', walk: 14 });
  });

  reg('wolf', (b) => {
    const p = quad(b, { s: 1, fur: 0x6b6b72, ear: 0x55555c, leg: 0x55555c, paw: 0x3a3a40, snout: 0x8a8a92, eye: 0xffa21a });
    for (let i = 0; i < 4; i++) b.add(p.body, 'lsph', 0xff6a2a, [(i % 2 ? 0.12 : -0.12), 0.34, 0.25 - i * 0.18], [0.12, 0.05, 0.14], null, { glow: true, tn: false });  // braises
    return b.finish({ height: 1.15, radius: 0.55, style: 'quad', walk: 12 });
  });

  reg('naga', (b) => {
    const R = b.root, p = b.parts, g = 0x3f8a5a, belly = 0xc8d06a;
    p.body = b.piv(R, 0, 0.1, 0);
    p.segs = [];
    for (let i = 0; i < 4; i++) { const s = 0.62 - i * 0.1; p.segs.push(b.add(p.body, 'sph', i % 2 ? 0x346f49 : g, [0, 0.2 * s + 0.08, -0.28 - i * 0.32], [s * 0.9, s * 0.8, s * 1.1])); }
    b.add(p.body, 'sph', g, [0, 0.35, 0.05], [0.78, 0.7, 0.8]);
    b.add(p.body, 'sph', belly, [0, 0.3, 0.3], [0.5, 0.55, 0.3], null, { tn: false });
    p.head = b.piv(p.body, 0, 0.95, 0.1);
    b.add(p.head, 'sph', g, [0, 0, 0.05], [0.5, 0.42, 0.52]);
    b.add(p.head, 'cone', 0x2e6e48, [0, 0.12, -0.2], [0.8, 0.5, 0.1], [-0.4, 0, 0]);                   // capuchon
    [1, -1].forEach((s) => {
      b.add(p.head, 'lsph', 0xffe14a, [s * 0.13, 0.05, 0.27], [0.1, 0.07, 0.05], null, { glow: true, tn: false });
      b.add(p.head, 'cone4', 0xffffff, [s * 0.07, -0.16, 0.26], [0.04, 0.12, 0.04], [PI, 0, 0], { tn: false });
    });
    p.armL = b.piv(p.body, 0.4, 0.75, 0.1); p.armR = b.piv(p.body, -0.4, 0.75, 0.1);
    [p.armL, p.armR].forEach((a) => b.add(a, 'cyl', g, [0, -0.2, 0], [0.12, 0.4, 0.12]));
    return b.finish({ height: 1.55, radius: 0.55, style: 'float', walk: 6, float: true });
  });

  reg('shieldBearer', (b) => {
    const p = biped(b, { h: 1.0, skin: 0x8a93a3, cloth: 0x6f7888, legC: 0x555d6b, boot: 0x3a404a, eye: 0x4fc3f7, bw: 1.25 });
    b.add(p.head, 'hemi', 0x9aa4b4, [0, 0.28, 0], [0.74, 0.5, 0.7]);
    b.add(p.head, 'box', 0xcc3a3a, [0, 0.5, -0.06], [0.06, 0.22, 0.34], null, { tn: false });          // cimier
    b.add(p.armL, 'box', 0x7c8696, [0.14, -0.3, 0.2], [0.1, 0.95, 0.7]);                              // bouclier tour
    b.add(p.armL, 'ico', 0x4fc3f7, [0.21, -0.3, 0.2], [0.14, 0.3, 0.3], null, { glow: true, tn: false });
    b.add(p.armR, 'box', 0x6b4226, [0, -0.4, 0.15], [0.07, 0.07, 0.5]);
    b.add(p.armR, 'box', 0xaaa79a, [0, -0.4, 0.5], [0.1, 0.04, 0.34]);
    return b.finish({ height: 1.65, radius: 0.55, style: 'biped', walk: 7 });
  });

  reg('runeSentinel', (b) => {
    const R = b.root, p = b.parts, st = 0x7d7a8a;
    p.body = b.piv(R, 0, 0.9, 0);
    b.add(p.body, 'oct', st, [0, 0, 0], [0.85, 1.5, 0.85]);
    b.add(p.body, 'box', 0x5a5766, [0, -0.88, 0], [0.5, 0.3, 0.5]);
    b.add(p.body, 'sph', 0x111118, [0, 0.12, 0.3], [0.34, 0.2, 0.2], null, { tn: false, noOutline: true });
    b.add(p.body, 'sph', 0xfff0a0, [0, 0.12, 0.38], [0.14, 0.14, 0.08], null, { glow: true, tn: false });  // œil
    p.ring = b.piv(p.body, 0, 0.05, 0);
    p.ring.rotation.x = HP();
    b.add(p.ring, 'tor', 0xb6a0ff, [0, 0, 0], 2.0, null, { glow: true, tn: false });
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; b.add(p.ring, 'box', 0xfff0a0, [Math.cos(a), Math.sin(a), 0], [0.14, 0.14, 0.08], [0, 0, a], { glow: true, tn: false }); }
    return b.finish({ height: 2.0, radius: 0.6, style: 'float', walk: 4, float: true });
  });

  reg('mantis', (b) => {
    const R = b.root, p = b.parts, c = 0x6fae5a, steel = 0xaab4c4;
    p.legL = b.piv(R, 0.12, 0.5, 0); p.legR = b.piv(R, -0.12, 0.5, 0);
    [p.legL, p.legR].forEach((l) => { b.add(l, 'cyl', c, [0, -0.25, 0], [0.08, 0.5, 0.08]); b.add(l, 'cone4', steel, [0, -0.5, 0.05], [0.12, 0.14, 0.12], [HP(), 0, 0]); });
    p.body = b.piv(R, 0, 0.5, 0);
    b.add(p.body, 'sph', c, [0, 0.25, -0.1], [0.34, 0.62, 0.34], [0.25, 0, 0]);
    b.add(p.body, 'sph', 0x4d8a3c, [0, 0.0, -0.32], [0.3, 0.3, 0.5]);
    p.head = b.piv(p.body, 0, 0.62, 0.05);
    b.add(p.head, 'cone4', c, [0, 0.05, 0.05], [0.5, 0.36, 0.38], [PI, PI / 4, 0]);
    [1, -1].forEach((s) => b.add(p.head, 'lsph', 0xff4aa0, [s * 0.15, 0.1, 0.12], [0.14, 0.18, 0.1], null, { glow: true, tn: false }));
    p.wingL = b.piv(p.body, 0.1, 0.45, -0.15); p.wingR = b.piv(p.body, -0.1, 0.45, -0.15);
    b.add(p.wingL, 'box', 0xd8f0ff, [0.2, 0.02, -0.1], [0.34, 0.02, 0.5], [0, 0.2, 0], { op: 0.6 });
    b.add(p.wingR, 'box', 0xd8f0ff, [-0.2, 0.02, -0.1], [0.34, 0.02, 0.5], [0, -0.2, 0], { op: 0.6 });
    p.armL = b.piv(p.body, 0.22, 0.5, 0.05); p.armR = b.piv(p.body, -0.22, 0.5, 0.05);
    [p.armL, p.armR].forEach((a) => {
      b.add(a, 'cyl', c, [0, -0.15, 0.05], [0.07, 0.34, 0.07]);
      b.add(a, 'box', steel, [0, -0.3, 0.3], [0.05, 0.14, 0.62], [0.2, 0, 0]);                          // faux
      b.add(a, 'cone4', steel, [0, -0.3, 0.66], [0.05, 0.14, 0.05], [HP(), 0, 0]);
    });
    return b.finish({ height: 1.55, radius: 0.45, style: 'biped', walk: 13 });
  });

  reg('spectralKnight', (b) => {
    const R = b.root, p = b.parts, c = 0x7fb0ff, o = 0.78;
    p.body = b.piv(R, 0, 0.7, 0);
    b.add(p.body, 'cone', c, [0, -0.2, 0], [0.9, 1.0, 0.7], null, { op: o, tn: true });             // jupe d'armure qui s'effile
    b.add(p.body, 'cyl', 0x9ec4ff, [0, 0.4, 0], [0.62, 0.55, 0.45], null, { op: o });
    [1, -1].forEach((s) => b.add(p.body, 'sph', 0x9ec4ff, [s * 0.38, 0.62, 0], [0.3, 0.26, 0.3], null, { op: o }));
    p.head = b.piv(p.body, 0, 0.88, 0.02);
    b.add(p.head, 'sph', 0x9ec4ff, [0, 0.12, 0], [0.5, 0.52, 0.5], null, { op: o });
    b.add(p.head, 'box', 0x0a1030, [0, 0.12, 0.2], [0.34, 0.08, 0.12], null, { tn: false, noOutline: true });
    b.add(p.head, 'box', 0xcfe4ff, [0, 0.12, 0.27], [0.28, 0.04, 0.03], null, { glow: true, tn: false });
    b.add(p.head, 'cone', 0xcfe4ff, [0, 0.5, -0.05], [0.08, 0.3, 0.08], [-0.3, 0, 0], { op: o });
    p.armL = b.piv(p.body, 0.5, 0.6, 0); p.armR = b.piv(p.body, -0.5, 0.6, 0);
    b.add(p.armL, 'cyl', 0x9ec4ff, [0, -0.2, 0], [0.14, 0.45, 0.14], null, { op: o });
    b.add(p.armL, 'hemi', 0xcfe4ff, [0.08, -0.3, 0.12], [0.55, 0.3, 0.55], [HP(), 0, HP()], { op: o });
    b.add(p.armR, 'cyl', 0x9ec4ff, [0, -0.2, 0], [0.14, 0.45, 0.14], null, { op: o });
    b.add(p.armR, 'box', 0xe8f2ff, [0, -0.4, 0.42], [0.06, 0.04, 0.8], null, { glow: true, tn: false });  // épée spectrale
    return b.finish({ height: 1.9, radius: 0.5, style: 'float', walk: 5, float: true });
  });

  reg('gravedigger', (b) => {
    const p = biped(b, { h: 1.0, skin: 0xb8b0a0, cloth: 0x3a3a4a, legC: 0x2a2a38, boot: 0x1a1a22, eye: 0x7dff6a, bw: 1.15 });
    b.add(p.head, 'hemi', 0x2c2c3a, [0, 0.22, -0.02], [0.82, 0.8, 0.8], [-0.3, 0, 0]);               // capuche
    b.add(p.head, 'cone', 0x2c2c3a, [0, 0.45, -0.28], [0.3, 0.4, 0.3], [-1.2, 0, 0]);
    b.add(p.body, 'cone', 0x2c2c3a, [0, 0.1, 0], [0.8, 0.7, 0.62]);
    b.add(p.armR, 'cyl', 0x6b4226, [0, -0.3, 0.25], [0.05, 1.0, 0.05], [HP() * 0.7, 0, 0]);          // pelle
    b.add(p.armR, 'box', 0x9a9aa8, [0, -0.35, 0.62], [0.3, 0.04, 0.34], [0.4, 0, 0]);
    b.add(p.armL, 'cyl', 0x555555, [0, -0.4, 0.1], [0.03, 0.2, 0.03]);
    b.add(p.armL, 'ico', 0x7dff6a, [0, -0.56, 0.1], 0.2, null, { glow: true, tn: false });          // lanterne
    return b.finish({ height: 1.7, radius: 0.5, style: 'biped', walk: 8 });
  });

  function worm(b, o) {
    const R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 0, 0);
    p.segs = [];
    for (let i = 0; i < 4; i++) {
      const s = o.s * (0.95 - i * 0.12);
      p.segs.push(b.add(p.body, 'sph', i % 2 ? o.c2 : o.c, [0, s * 0.45, -0.2 - i * 0.42 * o.s], [s, s * 0.9, s * 0.9]));
    }
    p.head = b.piv(p.body, 0, o.s * 0.55, 0.15 * o.s);
    b.add(p.head, 'sph', o.c, [0, 0, 0], [o.s * 1.1, o.s * 1.0, o.s * 1.1]);
    b.add(p.head, 'tor', 0x2a1a20, [0, -0.02, 0.5 * o.s], [o.s * 0.85, o.s * 0.85, o.s * 0.85], null, { tn: false, noOutline: true });
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; b.add(p.head, 'cone4', 0xf4f0e0, [Math.cos(a) * 0.2 * o.s, Math.sin(a) * 0.2 * o.s - 0.02, 0.5 * o.s], [0.07 * o.s, 0.22 * o.s, 0.07 * o.s], [HP(), 0, 0], { tn: false }); }
    [1, -1].forEach((s) => b.add(p.head, 'lsph', o.eye, [s * 0.3 * o.s, 0.28 * o.s, 0.35 * o.s], 0.1 * o.s, null, { glow: true, tn: false }));
    if (o.spikes) for (let i = 0; i < 4; i++) b.add(p.segs[i], 'cone', o.spikes, [0, 0.5 * o.s, 0], [0.12 * o.s, 0.34 * o.s, 0.12 * o.s], null, { glow: true, tn: false });
    return p;
  }
  reg('tombWorm', (b) => { worm(b, { s: 0.9, c: 0xb8a58a, c2: 0x9c8a70, eye: 0xff5a3a }); return b.finish({ height: 1.3, radius: 0.65, style: 'worm', walk: 6 }); });
  reg('ashWyrm', (b) => { worm(b, { s: 1.35, c: 0x4a4650, c2: 0x34303a, eye: 0xff7a2a, spikes: 0xff5a1f }); return b.finish({ height: 2.0, radius: 0.95, style: 'worm', walk: 6 }); });

  reg('ogre', (b) => {
    const p = biped(b, { h: 1.3, skin: 0x9a6b4a, cloth: 0x8a5a3a, legC: 0x7a5238, boot: 0x4a3020, eye: 0xff4a2a, bw: 1.45, armC: 0x9a6b4a });
    b.add(p.body, 'box', 0x5a3a28, [0, 0.0, 0], [0.9 * 1.3, 0.3, 0.62], null, { tn: false });         // pagne / ceinture
    b.add(p.head, 'cone', 0xefe6cc, [0.16 * 1.3, 0.0, 0.3], [0.08, 0.2, 0.08], [0.3, 0, 0], { tn: false });
    b.add(p.head, 'cone', 0xefe6cc, [-0.16 * 1.3, 0.0, 0.3], [0.08, 0.2, 0.08], [0.3, 0, 0], { tn: false });
    [1, -1].forEach((s) => b.add(p.head, 'cone', 0xe8dcc0, [s * 0.3, 0.5, 0], [0.1, 0.3, 0.1], [0, 0, -s * 0.5], { tn: false }));
    b.add(p.armR, 'cyl', 0x6b4226, [0, -0.5, 0.35], [0.14, 0.9, 0.14], [HP() * 0.6, 0, 0]);          // massue à pointes
    for (let i = 0; i < 4; i++) b.add(p.armR, 'cone4', 0xaaa79a, [(i % 2 ? 0.1 : -0.1), -0.3 - i * 0.14, 0.62 + i * 0.1], [0.08, 0.18, 0.08], [0, 0, (i % 2 ? -1 : 1) * 1.2]);
    return b.finish({ height: 2.2, radius: 0.7, style: 'biped', walk: 7 });
  });

  reg('crystalGolem', (b) => {
    const p = biped(b, { h: 1.2, skin: 0x7f93a8, cloth: 0x8aa0b6, legC: 0x6a7e92, boot: 0x55687a, eye: 0x63e6ff, bw: 1.35, armC: 0x7f93a8, torsoGeo: 'box' });
    [[0.25, 0.5, -0.2, 0.9], [-0.3, 0.45, -0.1, 0.7], [0.0, 0.6, -0.3, 1.1]].forEach(([x, y, z, s]) => b.add(p.body, 'cone4', 0x63e6ff, [x, y, z], [0.18 * s, 0.6 * s, 0.18 * s], [0.3, 0, x], { glow: true, tn: false }));
    [1, -1].forEach((s) => b.add(p.body, 'oct', 0x63e6ff, [s * 0.52, 0.55, 0], [0.34, 0.5, 0.34], [0, 0, s * 0.3], { glow: true, tn: false }));
    b.add(p.armL, 'box', 0x7f93a8, [0, -0.5, 0.05], [0.3, 0.3, 0.3]); b.add(p.armR, 'box', 0x7f93a8, [0, -0.5, 0.05], [0.3, 0.3, 0.3]);
    return b.finish({ height: 2.0, radius: 0.75, style: 'biped', walk: 6 });
  });

  reg('stormElemental', (b) => {
    const R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 1.0, 0);
    [[0, -0.35, 0, 0.9], [0.4, -0.3, 0.1, 0.6], [-0.4, -0.25, -0.1, 0.6], [0, -0.5, 0.25, 0.55]].forEach(([x, y, z, s]) => b.add(p.body, 'sph', 0x5a4a78, [x, y, z], [s, s * 0.7, s], null, { op: 0.9 }));
    p.core = b.add(p.body, 'ico', 0xffe14a, [0, 0.1, 0], 0.62, null, { glow: true, tn: false });
    [1, -1].forEach((s) => b.add(p.body, 'lsph', 0x1a1030, [s * 0.14, 0.14, 0.3], [0.1, 0.12, 0.08], null, { tn: false, noOutline: true }));
    p.orbit = b.piv(p.body, 0, 0.1, 0);
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4; b.add(p.orbit, 'cone4', 0xfff6a0, [Math.cos(a) * 0.8, 0.1 * (i % 2 ? 1 : -1), Math.sin(a) * 0.8], [0.14, 0.5, 0.1], [0, -a, 0.6 * (i % 2 ? 1 : -1)], { glow: true, tn: false }); }
    return b.finish({ height: 1.9, radius: 0.6, style: 'float', walk: 4, float: true });
  });

  reg('shadowCrawler', (b) => {
    const R = b.root, p = b.parts, c = 0x2a1540;
    p.body = b.piv(R, 0, 0.32, 0);
    b.add(p.body, 'sph', c, [0, 0, 0], [0.8, 0.4, 1.0]);
    b.add(p.body, 'sph', 0x3c2060, [0, 0.12, 0.38], [0.5, 0.34, 0.42]);
    [[0, 0.2, 0.55], [0.14, 0.14, 0.56], [-0.14, 0.14, 0.56]].forEach(([x, y, z]) => b.add(p.body, 'lsph', 0xffffff, [x, y, z], 0.09, null, { glow: true, tn: false }));
    p.legs = [];
    for (let i = 0; i < 4; i++) {
      const sd = i % 2 ? -1 : 1, z = 0.3 - Math.floor(i / 2) * 0.55;
      const l = b.piv(R, sd * 0.3, 0.32, z);
      b.add(l, 'cone4', c, [sd * 0.2, -0.05, 0], [0.09, 0.8, 0.09], [0, 0, sd * 1.1]);
      p.legs.push(l);
    }
    p.legL = p.legs[0]; p.legR = p.legs[1];
    p.tail = b.piv(p.body, 0, 0, -0.5);
    b.add(p.tail, 'cone', 0x3c2060, [0, 0, -0.25], [0.16, 0.6, 0.16], [-HP(), 0, 0]);
    return b.finish({ height: 0.8, radius: 0.55, style: 'quad', walk: 16 });
  });

  reg('wispBomb', (b) => {
    const R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 0.9, 0);
    b.add(p.body, 'sph', 0xb8a8ff, [0, 0, 0], [0.62, 0.7, 0.58], null, { op: 0.75 });
    b.add(p.body, 'cone', 0xb8a8ff, [0, -0.5, -0.05], [0.4, 0.6, 0.36], [PI, 0, 0], { op: 0.75 });
    p.core = b.add(p.body, 'ico', 0xff4a5a, [0, -0.02, 0.02], 0.34, null, { glow: true, tn: false });
    [1, -1].forEach((s) => b.add(p.body, 'lsph', 0xffffff, [s * 0.12, 0.12, 0.26], [0.1, 0.12, 0.06], null, { glow: true, tn: false }));
    p.orbit = b.piv(p.body, 0, 0, 0);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; b.add(p.orbit, 'tet', 0xff4a5a, [Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], 0.14, null, { glow: true, tn: false }); }
    return b.finish({ height: 1.5, radius: 0.5, style: 'float', walk: 5, float: true });
  });

  reg('salamander', (b) => {
    const p = quad(b, { s: 1.0, fur: 0xd9451f, ear: 0x8a2a10, leg: 0xb03a18, paw: 0x6a2410, snout: 0xe86a2a, eye: 0xffe14a });
    for (let i = 0; i < 5; i++) b.add(p.body, 'cone4', 0x3a1a10, [0, 0.38, 0.35 - i * 0.2], [0.1, 0.2, 0.1], null, { tn: false });
    for (let i = 0; i < 3; i++) b.add(p.body, 'lsph', 0xffb02a, [(i % 2 ? 0.2 : -0.2), 0.2, 0.3 - i * 0.28], [0.1, 0.14, 0.2], null, { glow: true, tn: false });
    b.add(p.head, 'lsph', 0xff7a1a, [0, -0.08, 0.4], 0.1, null, { glow: true, tn: false });
    return b.finish({ height: 1.0, radius: 0.65, style: 'quad', walk: 10 });
  });

  reg('obsidianColossus', (b) => {
    const p = biped(b, { h: 1.55, skin: 0x1f1c28, cloth: 0x26222f, legC: 0x1a1822, boot: 0x14121a, eye: 0xff5a1f, bw: 1.5, armC: 0x26222f, torsoGeo: 'box' });
    [[0.25, 0.3, 0.19], [-0.2, 0.4, 0.19], [0, 0.15, 0.19]].forEach(([x, y, z], i) => b.add(p.body, 'box', 0xff5a1f, [x, y, z * 1.55], [0.06, 0.3, 0.04], [0, 0, 0.5 * (i - 1)], { glow: true, tn: false }));
    [1, -1].forEach((s) => { b.add(p.body, 'cone4', 0x14121a, [s * 0.62 * 1.55 / 1.5 * 1.1, 0.78, 0], [0.22, 0.55, 0.22], [0, 0, -s * 0.5]); b.add(p.head, 'cone', 0x14121a, [s * 0.22, 0.5, 0], [0.1, 0.34, 0.1], [0, 0, -s * 0.3]); });
    b.add(p.armL, 'box', 0x14121a, [0, -0.78, 0.04], [0.42, 0.38, 0.42]); b.add(p.armR, 'box', 0x14121a, [0, -0.78, 0.04], [0.42, 0.38, 0.42]);
    return b.finish({ height: 2.6, radius: 0.9, style: 'biped', walk: 5 });
  });

  reg('veilArchon', (b) => {
    const R = b.root, p = b.parts, rb = 0x4b2a88, gold = 0xe5c15a;
    p.body = b.piv(R, 0, 0.95, 0);
    b.add(p.body, 'cone', rb, [0, -0.1, 0], [1.1, 1.8, 0.95], null, { op: 0.92 });
    b.add(p.body, 'tor', gold, [0, -0.85, 0], [1.1, 1.1, 1.1], [HP(), 0, 0], { tn: false, noOutline: true });
    b.add(p.body, 'cyl', gold, [0, 0.55, 0], [0.62, 0.1, 0.48], null, { tn: false });
    p.head = b.piv(p.body, 0, 0.95, 0.04);
    b.add(p.head, 'sph', 0xf4f0e8, [0, 0, 0.02], [0.46, 0.55, 0.3], null, { tn: false });                       // masque
    [1, -1].forEach((s) => b.add(p.head, 'lsph', 0xb44dff, [s * 0.1, 0.04, 0.16], [0.1, 0.05, 0.04], null, { glow: true, tn: false }));
    b.add(p.head, 'tor', gold, [0, 0.55, -0.05], [0.7, 0.7, 0.7], [HP() - 0.3, 0, 0], { glow: true, tn: false });  // halo
    p.armL = b.piv(p.body, 0.5, 0.5, 0.05); p.armR = b.piv(p.body, -0.5, 0.5, 0.05);
    [p.armL, p.armR].forEach((a) => { b.add(a, 'cyl', rb, [0, -0.2, 0], [0.16, 0.45, 0.16], null, { op: 0.92 }); b.add(a, 'cone4', 0xf4f0e8, [0, -0.5, 0.03], [0.12, 0.2, 0.12], [PI, 0, 0], { tn: false }); });
    p.orbit = b.piv(p.body, 0, 0.4, 0);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; b.add(p.orbit, 'ico', 0xb44dff, [Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95], 0.22, null, { glow: true, tn: false }); }
    return b.finish({ height: 2.5, radius: 0.7, style: 'float', walk: 4, float: true });
  });

  reg('livingTome', (b) => {
    const R = b.root, p = b.parts, cover = 0x7a2a3a;
    p.body = b.piv(R, 0, 1.0, 0);
    p.body.rotation.x = -0.2;
    b.add(p.body, 'box', cover, [0, 0, 0], [0.5, 0.64, 0.14]);
    b.add(p.body, 'box', 0xf2e6c4, [0.0, 0, 0.0], [0.44, 0.58, 0.18], null, { tn: false });
    b.add(p.body, 'box', cover, [0, 0, 0.0], [0.5, 0.64, 0.05]);
    b.add(p.body, 'box', 0xe0b040, [0, 0, 0.06], [0.14, 0.14, 0.04], null, { tn: false });
    [1, -1].forEach((s) => b.add(p.body, 'lsph', 0xb6a0ff, [s * 0.1, 0.12, 0.1], 0.09, null, { glow: true, tn: false }));
    p.wingL = b.piv(p.body, 0.27, 0.05, 0); p.wingR = b.piv(p.body, -0.27, 0.05, 0);
    b.add(p.wingL, 'box', 0xf2e6c4, [0.22, 0, 0], [0.42, 0.04, 0.5], null, { tn: false });
    b.add(p.wingR, 'box', 0xf2e6c4, [-0.22, 0, 0], [0.42, 0.04, 0.5], null, { tn: false });
    p.orbit = b.piv(p.body, 0, 0, 0);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; b.add(p.orbit, 'box', 0xf2e6c4, [Math.cos(a) * 0.55, 0.0, Math.sin(a) * 0.55], [0.16, 0.2, 0.02], [0, -a, 0], { tn: false }); }
    return b.finish({ height: 1.5, radius: 0.5, style: 'float', walk: 4, float: true });
  });

  // =====================================================================
  //  v5 « Ténèbres » — ARCHÉTYPES D'HORREUR (agent 7)
  //  Un modèle par monstre (id = id du monstre) : archétype + palette + accessoires (voir MODEL5 en bas).
  //  Archétypes : human cloak hound crawl wisp wing blob eye plant worm wall scream statue obj
  //  Animations : style (biped/float/quad/blob/worm/crawl/weeping/wall) + userData.animate(g,t,st) facultatif.
  // =====================================================================
  const H2 = PI / 2;
  const glowM = { glow: true, tn: false };
  const eyes2 = (b, par, y, z, dx, sz, col) => [1, -1].forEach((s) => b.add(par, 'lsph', col, [s * dx, y, z], sz, null, glowM));
  const clearHead = (p) => p.head.children.slice().forEach((c) => p.head.remove(c));

  function holdWeapon(b, arm, kind, h, c) {
    const wd = c || 0x8a8f9a, wood = 0x6b4226;
    switch (kind) {
      case 'sword': b.add(arm, 'box', wd, [0, -0.42 * h, 0.4 * h], [0.07 * h, 0.05 * h, 0.9 * h]); b.add(arm, 'box', 0x5a4a30, [0, -0.42 * h, 0.04 * h], [0.3 * h, 0.05 * h, 0.06 * h]); break;
      case 'axe': b.add(arm, 'cyl', wood, [0, -0.45 * h, 0.1 * h], [0.05 * h, 1.0 * h, 0.05 * h], [H2 * 0.3, 0, 0]); b.add(arm, 'box', wd, [0, -0.7 * h, 0.35 * h], [0.06 * h, 0.4 * h, 0.34 * h]); break;
      case 'pick': b.add(arm, 'cyl', wood, [0, -0.5 * h, 0.2 * h], [0.05 * h, 0.95 * h, 0.05 * h], [H2 * 0.5, 0, 0]); b.add(arm, 'cone4', wd, [0, -0.45 * h, 0.62 * h], [0.1 * h, 0.7 * h, 0.1 * h], [H2, 0, H2]); break;
      case 'spear': b.add(arm, 'cyl', wood, [0, -0.4 * h, 0.5 * h], [0.04 * h, 1.4 * h, 0.04 * h], [H2, 0, 0]); b.add(arm, 'cone4', wd, [0, -0.4 * h, 1.25 * h], [0.1 * h, 0.3 * h, 0.1 * h], [H2, 0, 0]); break;
      case 'mace': b.add(arm, 'cyl', wood, [0, -0.45 * h, 0.2 * h], [0.05 * h, 0.7 * h, 0.05 * h], [H2 * 0.4, 0, 0]); b.add(arm, 'ico', wd, [0, -0.55 * h, 0.5 * h], 0.32 * h); break;
      case 'saw': b.add(arm, 'box', wd, [0, -0.42 * h, 0.4 * h], [0.04 * h, 0.22 * h, 0.8 * h]); for (let i = 0; i < 5; i++) b.add(arm, 'cone4', wd, [0, -0.54 * h, (0.1 + i * 0.16) * h], [0.06 * h, 0.1 * h, 0.06 * h], [PI, 0, 0]); break;
      case 'needle': b.add(arm, 'cyl', 0xcfe8ff, [0, -0.46 * h, 0.3 * h], [0.08 * h, 0.35 * h, 0.08 * h], [H2, 0, 0], { op: 0.85 }); b.add(arm, 'cone4', wd, [0, -0.46 * h, 0.6 * h], [0.04 * h, 0.35 * h, 0.04 * h], [H2, 0, 0]); break;
      case 'shears': [1, -1].forEach((s) => b.add(arm, 'box', wd, [s * 0.05 * h, -0.45 * h, 0.5 * h], [0.04 * h, 0.04 * h, 0.9 * h], [0, s * 0.08, 0])); break;
      case 'cleaver': b.add(arm, 'cyl', wood, [0, -0.45 * h, 0.1 * h], [0.05 * h, 0.4 * h, 0.05 * h], [H2 * 0.3, 0, 0]); b.add(arm, 'box', wd, [0, -0.6 * h, 0.3 * h], [0.05 * h, 0.5 * h, 0.5 * h]); break;
      case 'knife': b.add(arm, 'box', wd, [0, -0.44 * h, 0.28 * h], [0.04 * h, 0.07 * h, 0.5 * h]); break;
      case 'book': b.add(arm, 'box', 0x7a2a3a, [0, -0.46 * h, 0.16 * h], [0.34 * h, 0.06 * h, 0.4 * h]); b.add(arm, 'box', 0xf2e6c4, [0, -0.43 * h, 0.16 * h], [0.3 * h, 0.04 * h, 0.36 * h], null, { tn: false }); break;
      case 'bell': b.add(arm, 'hemi', 0xd8b24a, [0, -0.5 * h, 0.1 * h], [0.4 * h, 0.5 * h, 0.4 * h], [PI, 0, 0], { tn: false }); break;
      case 'lantern': b.add(arm, 'cyl', 0x555555, [0, -0.5 * h, 0.1 * h], [0.03 * h, 0.2 * h, 0.03 * h]); b.add(arm, 'ico', c || 0xffd070, [0, -0.66 * h, 0.1 * h], 0.22 * h, null, glowM); break;
      case 'candle': b.add(arm, 'cyl', 0xf4e8c8, [0, -0.5 * h, 0.1 * h], [0.08 * h, 0.3 * h, 0.08 * h], null, { tn: false }); b.add(arm, 'cone', 0xffb040, [0, -0.7 * h, 0.1 * h], [0.1 * h, 0.2 * h, 0.1 * h], [PI, 0, 0], glowM); break;
      case 'dynamite': for (let i = 0; i < 3; i++) b.add(arm, 'cyl', 0xc03030, [(i - 1) * 0.09 * h, -0.5 * h, 0.12 * h], [0.08 * h, 0.4 * h, 0.08 * h]); b.add(arm, 'sph', 0xffb040, [0, -0.72 * h, 0.12 * h], 0.1 * h, null, glowM); break;
      case 'whip': b.add(arm, 'cyl', 0x2a1a14, [0, -0.5 * h, 0.4 * h], [0.03 * h, 1.0 * h, 0.03 * h], [H2 * 0.8, 0, 0.3]); break;
      case 'bow': b.add(arm, 'tor', wood, [0, -0.44 * h, 0.2 * h], [0.9 * h, 0.9 * h, 0.9 * h], [0, H2, 0]); break;
      case 'scythe': b.add(arm, 'cyl', wood, [0, -0.3 * h, 0.05 * h], [0.04 * h, 1.7 * h, 0.04 * h]); b.add(arm, 'box', wd, [0, 0.55 * h, 0.35 * h], [0.04 * h, 0.06 * h, 0.8 * h], [0.2, 0, 0]); break;
      case 'quill': b.add(arm, 'cone4', 0xf4f0e0, [0, -0.5 * h, 0.2 * h], [0.06 * h, 0.7 * h, 0.06 * h], [H2 * 0.8, 0, 0], { tn: false }); break;
      case 'chain': for (let i = 0; i < 5; i++) b.add(arm, 'tor', 0x6a6a72, [0, (-0.5 - i * 0.14) * h, 0.04 * h], [0.18 * h, 0.18 * h, 0.18 * h], [i % 2 ? H2 : 0, 0, 0]); break;
      case 'stick': b.add(arm, 'cyl', wood, [0, -0.45 * h, 0.1 * h], [0.06 * h, 1.2 * h, 0.06 * h]); break;
      case 'ball': b.add(arm, 'sph', c || 0x9be7ff, [0, -0.55 * h, 0.15 * h], 0.32 * h, null, { glow: true, tn: false, op: 0.9 }); break;
      case 'keys': for (let i = 0; i < 3; i++) b.add(arm, 'tor', 0xd8b24a, [(i - 1) * 0.1 * h, -0.5 * h, 0.05 * h], [0.2 * h, 0.2 * h, 0.2 * h], [0, H2 * i, 0], { tn: false }); break;
      default: break;
    }
  }

  // ---------------- humanoïde configurable ----------------
  function humanK(b, o) {
    const h = o.h || 1, R = b.root;
    const p = biped(b, { h, skin: o.skin || 0xb8b0a0, cloth: o.cloth || 0x3a3440, legC: o.legC || o.cloth || 0x2a2630, boot: o.boot || 0x1a1418,
      armC: o.armC != null ? o.armC : (o.sleeves ? (o.cloth || 0x3a3440) : (o.skin || 0xb8b0a0)), eye: o.eye != null ? o.eye : 0xffee55, bw: o.bw || 1, torsoGeo: o.torso || 'cyl' });
    const eyeC = o.eye != null ? o.eye : 0xffee55, skin = o.skin || 0xb8b0a0;
    // --- tête
    switch (o.head) {
      case 'skull': clearHead(p); b.add(p.head, 'sph', o.boneC || 0xe8e2d0, [0, 0.2 * h, 0], [0.6 * h, 0.54 * h, 0.56 * h]); b.add(p.head, 'box', o.boneC || 0xe8e2d0, [0, 0.02 * h, 0.14 * h], [0.34 * h, 0.14 * h, 0.2 * h]);
        eyes2(b, p.head, 0.24 * h, 0.24 * h, 0.12 * h, 0.1 * h, eyeC); for (let i = -1; i <= 1; i++) b.add(p.head, 'box', 0x2a2420, [i * 0.08 * h, 0.0, 0.25 * h], [0.04 * h, 0.1 * h, 0.03 * h], null, { tn: false }); break;
      case 'none': clearHead(p); b.add(p.head, 'cyl', skin, [0, 0.0, 0], [0.18 * h, 0.12 * h, 0.18 * h]); break;
      case 'blank': p.head.children.slice(1).forEach((c) => p.head.remove(c)); break;
      case 'helm': b.add(p.head, 'cyl', o.helmC || o.cloth, [0, 0.2 * h, 0], [0.7 * h, 0.66 * h, 0.66 * h]); b.add(p.head, 'box', 0x0b0b12, [0, 0.2 * h, 0.3 * h], [0.46 * h, 0.14 * h, 0.06 * h], null, { tn: false });
        eyes2(b, p.head, 0.2 * h, 0.33 * h, 0.1 * h, 0.06 * h, eyeC); break;
      case 'hood': clearHead(p); b.add(p.head, 'sph', 0x0d0a12, [0, 0.2 * h, 0.04 * h], [0.5 * h, 0.5 * h, 0.5 * h], null, { tn: false }); eyes2(b, p.head, 0.22 * h, 0.27 * h, 0.1 * h, 0.07 * h, eyeC);
        b.add(p.head, 'hemi', o.hoodC || o.cloth, [0, 0.2 * h, -0.02 * h], [0.78 * h, 0.8 * h, 0.78 * h], [-0.3, 0, 0]); b.add(p.head, 'cone', o.hoodC || o.cloth, [0, 0.46 * h, -0.28 * h], [0.3 * h, 0.42 * h, 0.3 * h], [-1.2, 0, 0]); break;
      case 'mask': b.add(p.head, 'box', o.maskC || 0xf4f0e8, [0, 0.2 * h, 0.27 * h], [0.5 * h, 0.5 * h, 0.06 * h], null, { tn: false }); eyes2(b, p.head, 0.26 * h, 0.31 * h, 0.12 * h, 0.06 * h, eyeC);
        b.add(p.head, 'box', 0x1a1418, [0, 0.08 * h, 0.31 * h], [0.2 * h, 0.04 * h, 0.03 * h], null, { tn: false }); break;
      case 'bag': clearHead(p); b.add(p.head, 'sph', 0xb89a6a, [0, 0.2 * h, 0], [0.66 * h, 0.66 * h, 0.62 * h]); b.add(p.head, 'cone', 0xb89a6a, [0, 0.52 * h, 0], [0.2 * h, 0.2 * h, 0.2 * h]);
        [1, -1].forEach((s) => { b.add(p.head, 'box', 0x1a1418, [s * 0.12 * h, 0.24 * h, 0.3 * h], [0.1 * h, 0.03 * h, 0.03 * h], [0, 0, 0.7], { tn: false }); b.add(p.head, 'box', 0x1a1418, [s * 0.12 * h, 0.24 * h, 0.3 * h], [0.1 * h, 0.03 * h, 0.03 * h], [0, 0, -0.7], { tn: false }); });
        b.add(p.head, 'box', 0x1a1418, [0, 0.06 * h, 0.3 * h], [0.26 * h, 0.03 * h, 0.03 * h], null, { tn: false }); break;
      case 'jester': for (let i = -1; i <= 1; i += 2) { b.add(p.head, 'cone', i > 0 ? 0xc03060 : 0x30a0c0, [i * 0.28 * h, 0.52 * h, 0], [0.22 * h, 0.5 * h, 0.22 * h], [0, 0, -i * 0.9], { tn: false }); b.add(p.head, 'sph', 0xffd23f, [i * 0.52 * h, 0.7 * h, 0], 0.1 * h, null, { tn: false }); } break;
      case 'top': b.add(p.head, 'cyl', 0x1a1418, [0, 0.62 * h, 0], [0.4 * h, 0.5 * h, 0.4 * h], null, { tn: false }); b.add(p.head, 'cyl', 0x1a1418, [0, 0.4 * h, 0], [0.8 * h, 0.06 * h, 0.8 * h], null, { tn: false }); b.add(p.head, 'cyl', 0xc03030, [0, 0.5 * h, 0], [0.42 * h, 0.08 * h, 0.42 * h], null, { tn: false }); break;
      case 'cap': b.add(p.head, 'box', 0xf4f0e8, [0, 0.52 * h, -0.02 * h], [0.5 * h, 0.2 * h, 0.4 * h], null, { tn: false }); b.add(p.head, 'box', 0xc03030, [0, 0.54 * h, 0.2 * h], [0.1 * h, 0.1 * h, 0.04 * h], null, { tn: false }); p.head.children.slice(1).forEach((c) => { if (o.faceless && c.geometry === geo('lsph')) p.head.remove(c); }); break;
      case 'diver': clearHead(p); b.add(p.head, 'sph', 0xb08a4a, [0, 0.2 * h, 0], [0.8 * h, 0.8 * h, 0.8 * h], null, { tn: false }); b.add(p.head, 'sph', 0x8fe0ff, [0, 0.22 * h, 0.28 * h], [0.46 * h, 0.4 * h, 0.2 * h], null, { glow: true, tn: false, op: 0.8 }); eyes2(b, p.head, 0.22 * h, 0.3 * h, 0.08 * h, 0.05 * h, eyeC); break;
      case 'clown': b.add(p.head, 'sph', 0xe83030, [0, 0.18 * h, 0.3 * h], 0.14 * h, null, { tn: false }); [1, -1].forEach((s) => b.add(p.head, 'cone', o.hairC || 0x30c0a0, [s * 0.32 * h, 0.3 * h, 0], [0.14 * h, 0.3 * h, 0.14 * h], [0, 0, -s * 1.0], { tn: false })); break;
      case 'ghost': clearHead(p); b.add(p.head, 'sph', o.skin, [0, 0.2 * h, 0], [0.6 * h, 0.6 * h, 0.55 * h], null, { op: 0.8 }); eyes2(b, p.head, 0.24 * h, 0.26 * h, 0.12 * h, 0.09 * h, eyeC); b.add(p.head, 'sph', 0x050308, [0, 0.06 * h, 0.27 * h], [0.18 * h, 0.22 * h, 0.1 * h], null, { tn: false }); break;
      default: break;
    }
    if (o.horns) [1, -1].forEach((s) => b.add(p.head, 'cone', o.hornC || 0x2a1a1a, [s * 0.24 * h, 0.5 * h, 0], [0.12 * h, 0.4 * h, 0.12 * h], [0, 0, -s * 0.5], { tn: false }));
    if (o.antlers) [1, -1].forEach((s) => { b.add(p.head, 'cyl', 0x6b5a44, [s * 0.2 * h, 0.62 * h, 0], [0.04 * h, 0.5 * h, 0.04 * h], [0, 0, -s * 0.4]); b.add(p.head, 'cone', 0x6b5a44, [s * 0.34 * h, 0.82 * h, 0], [0.04 * h, 0.3 * h, 0.04 * h], [0, 0, -s * 0.9]); });
    if (o.crown) b.add(p.head, 'tor', o.crown, [0, 0.52 * h, 0], [0.5 * h, 0.5 * h, 0.5 * h], [H2, 0, 0], { glow: true, tn: false });
    if (o.lamp) { b.add(p.head, 'cyl', 0xd8b24a, [0, 0.5 * h, 0.04 * h], [0.64 * h, 0.2 * h, 0.64 * h]); b.add(p.head, 'ico', 0xffe8a0, [0, 0.52 * h, 0.32 * h], 0.2 * h, null, glowM); }
    if (o.hardhat) { b.add(p.head, 'hemi', o.hardhat, [0, 0.4 * h, 0], [0.74 * h, 0.5 * h, 0.74 * h]); b.add(p.head, 'cyl', o.hardhat, [0, 0.42 * h, 0], [0.86 * h, 0.05 * h, 0.86 * h]); }
    if (o.hair) b.add(p.head, 'hemi', o.hair, [0, 0.3 * h, -0.04 * h], [0.66 * h, 0.5 * h, 0.64 * h], [-0.2, 0, 0], { tn: false });
    if (o.third) b.add(p.head, 'lsph', o.third, [0, 0.4 * h, 0.27 * h], 0.1 * h, null, glowM);
    // --- torse
    const bw = o.bw || 1;
    if (o.robe) b.add(p.body, 'cone', o.robe, [0, -0.05 * h, 0], [0.74 * h * bw, 1.0 * h, 0.62 * h * bw]);
    if (o.ribs) for (let i = 0; i < 3; i++) b.add(p.body, 'tor', o.boneC || 0xe8e2d0, [0, (0.14 + i * 0.12) * h, 0.04 * h], [0.5 * h, 0.4 * h, 0.5 * h], [H2, 0, 0], { tn: false });
    if (o.bandage) for (let i = 0; i < 4; i++) b.add(p.body, 'tor', o.bandage, [0, (0.08 + i * 0.12) * h, 0], [0.55 * h * bw, 0.55 * h * bw, 0.4 * h], [H2, 0.15 * (i % 2 ? 1 : -1), 0], { tn: false });
    if (o.apron) b.add(p.body, 'box', o.apron, [0, 0.08 * h, 0.2 * h * bw], [0.4 * h, 0.6 * h, 0.04 * h], null, { tn: false });
    if (o.core) b.add(p.body, 'oct', o.core, [0, 0.3 * h, 0.2 * h * bw], [0.22 * h, 0.3 * h, 0.14 * h], null, glowM);
    if (o.plate) { [1, -1].forEach((s) => b.add(p.body, 'sph', o.plate, [s * 0.34 * h * bw, 0.52 * h, 0], [0.3 * h, 0.22 * h, 0.3 * h])); b.add(p.body, 'box', o.plate, [0, 0.3 * h, 0.2 * h * bw], [0.42 * h * bw, 0.46 * h, 0.06 * h]); }
    if (o.belt) b.add(p.body, 'cyl', o.belt, [0, 0.05 * h, 0], [0.52 * h * bw, 0.07 * h, 0.38 * h * bw], null, { tn: false });
    if (o.cape) { p.cape = b.piv(p.body, 0, 0.5 * h, -0.2 * h); b.add(p.cape, 'box', o.cape, [0, -0.4 * h, -0.04 * h], [0.64 * h * bw, 0.9 * h, 0.04 * h]); }
    if (o.rags) for (let i = 0; i < 4; i++) b.add(p.body, 'cone4', o.rags, [(i - 1.5) * 0.14 * h, -0.05 * h, 0.16 * h], [0.12 * h, 0.4 * h, 0.04 * h], [PI, 0, 0.1 * (i - 1.5)], { tn: false });
    if (o.spikes) for (let i = 0; i < 4; i++) b.add(p.body, 'cone4', o.spikes, [(i % 2 ? 1 : -1) * 0.12 * h, (0.2 + i * 0.1) * h, -0.22 * h * bw], [0.08 * h, 0.3 * h, 0.08 * h], [-H2, 0, 0], { glow: !!o.spikeGlow, tn: false });
    if (o.crystals) for (let i = 0; i < 3; i++) b.add(p.body, 'oct', o.crystals, [(i - 1) * 0.22 * h, (0.5 + (i % 2) * 0.15) * h, -0.24 * h], [0.14 * h, 0.4 * h, 0.14 * h], [0.3, 0, (i - 1) * 0.3], glowM);
    if (o.pack) { b.add(p.body, 'box', o.pack, [0, 0.3 * h, -0.34 * h * bw], [0.5 * h, 0.8 * h, 0.22 * h]); }
    if (o.coffin) { b.add(p.body, 'box', 0x4a3220, [0, 0.4 * h, -0.34 * h], [0.62 * h, 1.2 * h, 0.2 * h], [0.15, 0, 0]); b.add(p.body, 'box', 0xd8b24a, [0, 0.4 * h, -0.45 * h], [0.5 * h, 0.06 * h, 0.04 * h], [0.15, 0, 0], { tn: false }); }
    if (o.shell) b.add(p.body, 'hemi', o.shell, [0, 0.3 * h, -0.3 * h], [0.9 * h, 0.8 * h, 0.8 * h], [-H2, 0, 0]);
    if (o.belly) b.add(p.body, 'sph', o.belly, [0, 0.12 * h, 0.12 * h], [0.62 * h, 0.55 * h, 0.55 * h]);
    if (o.algae) for (let i = 0; i < 5; i++) b.add(p.body, 'cone4', o.algae, [(i - 2) * 0.12 * h, 0.5 * h - i % 2 * 0.2 * h, 0.2 * h], [0.06 * h, 0.5 * h, 0.04 * h], [PI, 0, (i - 2) * 0.12], { tn: false });
    if (o.strings) { p.strings = []; [-1, -0.4, 0.4, 1].forEach((x) => { const s = b.add(p.body, 'cyl', 0xcfc8b0, [x * 0.2 * h, 1.5 * h, 0], [0.012 * h, 2.2 * h, 0.012 * h], null, { tn: false, noOutline: true }); p.strings.push(s); }); }
    if (o.chains) { for (let i = 0; i < 6; i++) b.add(p.body, 'tor', 0x6a6a72, [(i % 2 ? 0.12 : -0.12) * h, (0.35 - i * 0.07) * h, 0.2 * h], [0.14 * h, 0.14 * h, 0.14 * h], [i % 2 ? H2 : 0, 0, 0.5 * (i % 2 ? 1 : -1)]); p.tail = b.piv(p.body, 0, 0.0, -0.2 * h); for (let i = 0; i < 6; i++) b.add(p.tail, 'tor', 0x6a6a72, [0, -0.05 * h, -(0.1 + i * 0.14) * h], [0.16 * h, 0.16 * h, 0.16 * h], [0, i % 2 ? H2 : 0, 0]); }
    if (o.wings) { const wc = o.wings; p.wingL = b.piv(p.body, 0.2 * h, 0.5 * h, -0.2 * h); p.wingR = b.piv(p.body, -0.2 * h, 0.5 * h, -0.2 * h);
      b.add(p.wingL, 'box', wc, [0.5 * h, 0.2 * h, 0], [0.9 * h, 0.04 * h, 0.5 * h], [0, 0, 0.3], { tn: false }); b.add(p.wingR, 'box', wc, [-0.5 * h, 0.2 * h, 0], [0.9 * h, 0.04 * h, 0.5 * h], [0, 0, -0.3], { tn: false }); }
    if (o.tail) { p.tail = p.tail || b.piv(p.body, 0, 0.0, -0.2 * h); b.add(p.tail, 'cone', o.tail, [0, 0, -0.3 * h], [0.1 * h, 0.7 * h, 0.1 * h], [-H2 - 0.3, 0, 0]); }
    if (o.drip) { p.drips = []; for (let i = 0; i < 3; i++) p.drips.push(b.add(p.body, 'sph', o.drip, [(i - 1) * 0.2 * h, 0.3 * h, 0.2 * h], 0.05 * h, null, { glow: true, tn: false, op: 0.8 })); }
    if (o.halo) { p.halo = b.add(p.head, 'tor', o.halo, [0, 0.7 * h, 0], [0.5 * h, 0.5 * h, 0.5 * h], [H2, 0, 0], glowM); }
    if (o.longArms) { const k = o.longArms;[p.armL, p.armR].forEach((a) => { const c0 = a.children[0], c1 = a.children[1]; c0.scale.y *= k; c0.position.y *= k; c1.position.y *= k; }); }
    if (o.claws) [p.armL, p.armR].forEach((a) => { for (let i = -1; i <= 1; i++) b.add(a, 'cone4', o.claws, [i * 0.05 * h, -0.42 * (o.longArms || 1) * h - 0.1 * h, 0.04 * h], [0.04 * h, 0.2 * h, 0.04 * h], [PI, 0, i * 0.2], { tn: false }); });
    if (o.weapon) holdWeapon(b, p.armR, o.weapon, h, o.weaponC);
    if (o.offhand) holdWeapon(b, p.armL, o.offhand, h, o.offC);
    if (o.shield) { b.add(p.armL, 'cyl', o.shield, [0, -0.3 * h, 0.2 * h], [0.6 * h, 0.06 * h, 0.6 * h], [0, 0, H2]); }
    if (o.carryHead) { clearHead(p); p.head.add(new T.Group()); const hd = b.piv(p.armL, 0, -0.46 * h, 0.2 * h); b.add(hd, 'sph', skin, [0, 0, 0], 0.4 * h); eyes2(b, hd, 0.04 * h, 0.17 * h, 0.08 * h, 0.07 * h, eyeC); }
    if (o.limp) b.root.userData.limp = 1;
    return b.finish({ height: (o.height || 1.65 * h) + (o.extraH || 0), radius: o.radius || (0.42 * h * bw + 0.06), style: 'biped', walk: o.walk || 9 });
  }

  // ---------------- cape flottante (spectres, prêtres, marionnettistes…) ----------------
  function cloakK(b, o) {
    const h = o.h || 1, R = b.root, p = b.parts, cl = o.cloth || 0x2a2438;
    p.body = b.piv(R, 0, 0.95 * h, 0);
    b.add(p.body, 'cone', cl, [0, -0.15 * h, 0], [0.95 * h * (o.wide || 1), 1.6 * h, 0.85 * h * (o.wide || 1)], null, o.ghostly ? { op: 0.8 } : null);
    p.head = b.piv(p.body, 0, 0.78 * h, 0.04 * h);
    if (o.face === 'mask') { b.add(p.head, 'sph', cl, [0, 0.1 * h, 0], [0.55 * h, 0.55 * h, 0.5 * h]); b.add(p.head, 'box', o.maskC || 0xf4f0e8, [0, 0.1 * h, 0.22 * h], [0.34 * h, 0.4 * h, 0.05 * h], null, { tn: false }); eyes2(b, p.head, 0.14 * h, 0.26 * h, 0.08 * h, 0.05 * h, o.eye || 0xff5a5a); }
    else if (o.face === 'skull') { b.add(p.head, 'sph', o.boneC || 0xe8e2d0, [0, 0.1 * h, 0.04 * h], [0.46 * h, 0.46 * h, 0.44 * h]); eyes2(b, p.head, 0.14 * h, 0.2 * h, 0.09 * h, 0.08 * h, o.eye || 0x7affd8); }
    else if (o.face === 'veil') { b.add(p.head, 'sph', 0x0d0a12, [0, 0.1 * h, 0.02 * h], [0.5 * h, 0.5 * h, 0.46 * h], null, { tn: false }); b.add(p.head, 'box', o.veilC || 0xe8e8f0, [0, 0.06 * h, 0.24 * h], [0.42 * h, 0.56 * h, 0.03 * h], null, { op: 0.75, tn: false }); eyes2(b, p.head, 0.14 * h, 0.22 * h, 0.09 * h, 0.06 * h, o.eye || 0xaaddff); }
    else if (o.face === 'blank') { b.add(p.head, 'sph', o.skin || 0xe8e0d8, [0, 0.1 * h, 0.04 * h], [0.5 * h, 0.54 * h, 0.48 * h]); }
    else { b.add(p.head, 'sph', 0x050308, [0, 0.1 * h, 0.04 * h], [0.5 * h, 0.5 * h, 0.46 * h], null, { tn: false }); eyes2(b, p.head, 0.14 * h, 0.24 * h, 0.1 * h, 0.07 * h, o.eye || 0xff4a6a); }
    if (o.hood !== false) { b.add(p.head, 'hemi', o.hoodC || cl, [0, 0.12 * h, -0.02 * h], [0.72 * h, 0.7 * h, 0.7 * h], [-0.25, 0, 0]); b.add(p.head, 'cone', o.hoodC || cl, [0, 0.4 * h, -0.2 * h], [0.26 * h, 0.4 * h, 0.26 * h], [-1.1, 0, 0]); }
    if (o.antlers) [1, -1].forEach((s) => { b.add(p.head, 'cyl', 0x6b5a44, [s * 0.18 * h, 0.5 * h, 0], [0.04 * h, 0.5 * h, 0.04 * h], [0, 0, -s * 0.4]); b.add(p.head, 'cone', 0x6b5a44, [s * 0.32 * h, 0.7 * h, 0], [0.04 * h, 0.3 * h, 0.04 * h], [0, 0, -s * 0.9]); });
    if (o.crown) b.add(p.head, 'tor', o.crown, [0, 0.46 * h, 0], [0.5 * h, 0.5 * h, 0.5 * h], [H2, 0, 0], glowM);
    if (o.mitre) b.add(p.head, 'cone4', o.mitre, [0, 0.6 * h, 0], [0.4 * h, 0.5 * h, 0.2 * h], null, { tn: false });
    if (o.hat) b.add(p.head, 'cone', o.hat, [0, 0.6 * h, 0], [0.5 * h, 0.5 * h, 0.5 * h], null, { tn: false });
    p.armL = b.piv(p.body, 0.34 * h, 0.5 * h, 0.06 * h); p.armR = b.piv(p.body, -0.34 * h, 0.5 * h, 0.06 * h);
    [p.armL, p.armR].forEach((a) => { b.add(a, 'cyl', cl, [0, -0.25 * h, 0], [0.1 * h, 0.55 * h, 0.1 * h]); b.add(a, 'sph', o.hand || 0xcfc8d8, [0, -0.55 * h, 0.02 * h], 0.13 * h, null, { tn: false });
      if (o.claws) for (let i = -1; i <= 1; i++) b.add(a, 'cone4', o.claws, [i * 0.05 * h, -0.68 * h, 0.03 * h], [0.03 * h, 0.2 * h, 0.03 * h], [PI, 0, i * 0.2], { tn: false }); });
    if (o.weapon) holdWeapon(b, p.armR, o.weapon, h, o.weaponC);
    if (o.offhand) holdWeapon(b, p.armL, o.offhand, h, o.offC);
    if (o.tendrils) { p.tendrils = []; for (let i = 0; i < o.tendrils; i++) { const a = i * TAU / o.tendrils; const t = b.add(p.body, 'cone', o.tendrilC || cl, [Math.cos(a) * 0.4 * h, -0.95 * h, Math.sin(a) * 0.4 * h], [0.1 * h, 0.5 * h, 0.1 * h], [PI, 0, 0], { op: 0.8 }); p.tendrils.push(t); } }
    if (o.stars) { p.orbit = b.piv(p.body, 0, 0.1 * h, 0); for (let i = 0; i < o.stars; i++) { const a = i * TAU / o.stars; b.add(p.orbit, 'oct', o.starC || 0xffffff, [Math.cos(a) * 0.8 * h, (i % 3) * 0.2 * h - 0.1, Math.sin(a) * 0.8 * h], 0.1 * h, null, glowM); } }
    if (o.ring) { p.ring = b.add(p.body, 'tor', o.ring, [0, 0.35 * h, 0], [1.2 * h, 1.2 * h, 1.2 * h], [H2 * 0.7, 0, 0], glowM); }
    if (o.mist) for (let i = 0; i < 4; i++) b.add(p.body, 'sph', o.mistC || 0x8a8a9a, [Math.cos(i * 1.6) * 0.5 * h, -0.9 * h + (i % 2) * 0.15, Math.sin(i * 1.6) * 0.5 * h], [0.4 * h, 0.2 * h, 0.4 * h], null, { op: 0.35 });
    if (o.sash) b.add(p.body, 'box', o.sash, [0, 0.1 * h, 0.3 * h], [0.5 * h, 0.1 * h, 0.1 * h], [0, 0, 0.5], { tn: false });
    if (o.apron) b.add(p.body, 'box', o.apron, [0, -0.1 * h, 0.32 * h], [0.36 * h, 0.8 * h, 0.04 * h], null, { tn: false });
    if (o.strings) { p.strings = []; [-0.6, 0, 0.6].forEach((x) => p.strings.push(b.add(p.armL, 'cyl', 0xcfc8b0, [x * 0.2 * h, 1.2 * h, 0], [0.012 * h, 2.4 * h, 0.012 * h], null, { tn: false, noOutline: true }))); }
    return b.finish({ height: 1.9 * h + (o.extraH || 0), radius: 0.55 * h * (o.wide || 1), style: 'float', walk: 5, float: true });
  }

  // ---------------- quadrupède décharné ----------------
  function houndK(b, o) {
    const s = o.s || 1, p = quad(b, { s, fur: o.fur || 0x6a6a72, snout: o.snout, ear: o.ear, leg: o.leg, paw: o.paw, eye: o.eye || 0xff4a3a });
    if (o.ribs) for (let i = 0; i < 3; i++) b.add(p.body, 'tor', o.boneC || 0xe8e2d0, [0, 0.12 * s, (0.2 - i * 0.2) * s], [0.9 * s, 0.9 * s, 0.4 * s], [0, 0, 0], { tn: false });
    if (o.skullFace) { b.add(p.head, 'box', o.boneC || 0xe8e2d0, [0, 0.0, 0.2 * s], [0.34 * s, 0.34 * s, 0.38 * s], null, { tn: false }); eyes2(b, p.head, 0.06 * s, 0.4 * s, 0.1 * s, 0.07 * s, o.eye || 0xff4a3a); }
    if (o.antlers) [1, -1].forEach((sd) => { b.add(p.head, 'cyl', 0x6b5a44, [sd * 0.14 * s, 0.34 * s, 0], [0.04 * s, 0.5 * s, 0.04 * s], [0, 0, -sd * 0.4]); b.add(p.head, 'cone', 0x6b5a44, [sd * 0.26 * s, 0.56 * s, 0], [0.04 * s, 0.3 * s, 0.04 * s], [0, 0, -sd * 0.9]); });
    if (o.spikes) for (let i = 0; i < 4; i++) b.add(p.body, 'cone4', o.spikes, [0, 0.4 * s, (0.3 - i * 0.22) * s], [0.1 * s, 0.3 * s, 0.1 * s], null, { glow: !!o.spikeGlow, tn: false });
    if (o.flame) { p.flame = b.add(p.body, 'cone', o.flame, [0, 0.45 * s, -0.1 * s], [0.4 * s, 0.7 * s, 0.4 * s], null, { glow: true, tn: false, op: 0.85 }); }
    if (o.collar) b.add(p.head, 'tor', o.collar, [0, -0.1 * s, -0.12 * s], [0.5 * s, 0.5 * s, 0.5 * s], [H2, 0, 0], { tn: false });
    if (o.ghost) b.root.traverse((m) => { if (m.isMesh && m.material) { m.material.transparent = true; m.material.opacity = 0.72; m.material.depthWrite = false; } });
    if (o.rider) { const r = o.rider; p.rider = b.piv(p.body, 0, 0.35 * s, -0.1 * s); b.add(p.rider, 'cyl', r.cloth || 0x2a2630, [0, 0.35 * s, 0], [0.4 * s, 0.7 * s, 0.34 * s]); b.add(p.rider, 'sph', 0x050308, [0, 0.0, 0], 0.01); if (!r.headless) b.add(p.rider, 'sph', r.skin || 0xe8e2d0, [0, 0.85 * s, 0], 0.34 * s); b.add(p.rider, 'cyl', r.cloth || 0x2a2630, [0.3 * s, 0.4 * s, 0.15 * s], [0.12 * s, 0.6 * s, 0.12 * s], [-0.8, 0, 0]); b.add(p.rider, 'box', 0xcfd6e6, [0.3 * s, 0.5 * s, 0.7 * s], [0.06 * s, 0.05 * s, 0.9 * s]); if (r.headless) eyes2(b, p.rider, 0.7 * s, 0.2 * s, 0.1 * s, 0.07 * s, r.eye || 0x7affd8); }
    if (o.wood) b.add(p.body, 'cyl', 0xd8b24a, [0, 0.55 * s, 0], [0.04 * s, 0.7 * s, 0.04 * s], null, { tn: false });
    return b.finish({ height: 1.0 * s + (o.extraH || 0), radius: 0.5 * s + 0.1, style: 'quad', walk: 12 });
  }

  // ---------------- rampant (pattes multiples, au ras du sol ; ou long-membres) ----------------
  function crawlK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts, skin = o.skin || 0x9a9488, n = o.legs || 6;
    p.body = b.piv(R, 0, 0.32 * s * (o.tall || 1), 0);
    b.add(p.body, 'sph', skin, [0, 0.05 * s, -0.1 * s], [0.55 * s, 0.4 * s * (o.tall || 1), 0.95 * s]);
    if (o.shell) b.add(p.body, 'hemi', o.shell, [0, 0.12 * s, -0.12 * s], [0.7 * s, 0.6 * s, 1.0 * s]);
    if (o.segs) for (let i = 0; i < o.segs; i++) b.add(p.body, 'sph', i % 2 ? skin : (o.skin2 || skin), [0, 0.0, -(0.4 + i * 0.35) * s], [0.45 * s, 0.35 * s, 0.4 * s]);
    p.head = b.piv(p.body, 0, 0.12 * s, 0.45 * s);
    if (o.face === 'human') { b.add(p.head, 'sph', o.faceC || 0xe8e0d8, [0, 0.05 * s, 0.05 * s], [0.42 * s, 0.46 * s, 0.4 * s]); b.add(p.head, 'box', 0x1a1418, [0, -0.1 * s, 0.24 * s], [0.2 * s, 0.1 * s, 0.04 * s], null, { tn: false }); eyes2(b, p.head, 0.1 * s, 0.24 * s, 0.1 * s, 0.07 * s, o.eye || 0xff4a4a); }
    else if (o.face === 'hands') { b.add(p.head, 'sph', skin, [0, 0, 0], 0.3 * s); }
    else { b.add(p.head, 'sph', skin, [0, 0, 0.05 * s], [0.4 * s, 0.34 * s, 0.4 * s]); eyes2(b, p.head, 0.08 * s, 0.2 * s, 0.1 * s, 0.07 * s, o.eye || 0xff4a4a); [1, -1].forEach((sd) => b.add(p.head, 'cone4', 0xf4f0e0, [sd * 0.08 * s, -0.12 * s, 0.22 * s], [0.06 * s, 0.18 * s, 0.06 * s], [PI, 0, 0], { tn: false })); }
    p.legs = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? -1 : 1, row = Math.floor(i / 2), z = (0.3 - row * (0.9 / Math.max(1, n / 2 - 1 || 1))) * s;
      const l = b.piv(R, side * 0.25 * s, 0.3 * s * (o.tall || 1), z);
      b.add(l, 'cyl', o.legC || skin, [side * 0.18 * s, -0.08 * s, 0], [0.06 * s, 0.5 * s * (o.tall || 1), 0.06 * s], [0, 0, side * 1.1]);
      b.add(l, 'cone4', o.legC || skin, [side * 0.42 * s * (o.tall || 1), -0.3 * s * (o.tall || 1), 0], [0.05 * s, 0.22 * s, 0.05 * s], [PI, 0, 0]);
      p.legs.push(l);
    }
    p.legL = p.legs[0]; p.legR = p.legs[1];
    if (o.arms) { p.armL = b.piv(p.body, 0.3 * s, 0.1 * s, 0.35 * s); p.armR = b.piv(p.body, -0.3 * s, 0.1 * s, 0.35 * s); [p.armL, p.armR].forEach((a) => { b.add(a, 'cyl', skin, [0, -0.2 * s, 0.1 * s], [0.07 * s, 0.6 * s, 0.07 * s], [-0.8, 0, 0]); for (let i = -1; i <= 1; i++) b.add(a, 'cone4', 0xf4f0e0, [i * 0.04 * s, -0.5 * s, 0.4 * s], [0.03 * s, 0.2 * s, 0.03 * s], [H2, 0, 0], { tn: false }); }); }
    if (o.spikes) for (let i = 0; i < 3; i++) b.add(p.body, 'cone4', o.spikes, [0, 0.3 * s, -(0.1 + i * 0.3) * s], [0.1 * s, 0.3 * s, 0.1 * s], null, { glow: true, tn: false });
    if (o.antennae) [1, -1].forEach((sd) => b.add(p.head, 'cyl', 0x2a2420, [sd * 0.14 * s, 0.25 * s, 0.2 * s], [0.02 * s, 0.5 * s, 0.02 * s], [-0.6, 0, sd * 0.4]));
    if (o.wingsC) { p.wingL = b.piv(p.body, 0.15 * s, 0.25 * s, -0.1 * s); p.wingR = b.piv(p.body, -0.15 * s, 0.25 * s, -0.1 * s); b.add(p.wingL, 'box', o.wingsC, [0.3 * s, 0, -0.2 * s], [0.5 * s, 0.02 * s, 0.7 * s], null, { op: 0.6 }); b.add(p.wingR, 'box', o.wingsC, [-0.3 * s, 0, -0.2 * s], [0.5 * s, 0.02 * s, 0.7 * s], null, { op: 0.6 }); }
    if (o.hair) for (let i = 0; i < 6; i++) b.add(p.head, 'cone4', o.hair, [(i - 2.5) * 0.08 * s, 0.1 * s, -0.12 * s], [0.04 * s, 0.7 * s, 0.04 * s], [-1.3, 0, (i - 2.5) * 0.1], { tn: false });
    return b.finish({ height: 0.8 * s * (o.tall || 1), radius: 0.55 * s, style: 'crawl', walk: 14 });
  }

  // ---------------- feu follet / crâne flottant ----------------
  function wispK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 0.95 * s, 0);
    const c = o.core || 0x9fd8ff;
    if (o.skull) { b.add(p.body, 'sph', o.skull, [0, 0, 0], [0.5 * s, 0.5 * s, 0.48 * s], null, { tn: o.tintSkull === true }); b.add(p.body, 'box', o.skull, [0, -0.22 * s, 0.12 * s], [0.3 * s, 0.14 * s, 0.2 * s], null, { tn: false }); eyes2(b, p.body, 0.04 * s, 0.22 * s, 0.1 * s, 0.09 * s, c); p.jaw = b.piv(p.body, 0, -0.22 * s, 0.1 * s); b.add(p.jaw, 'box', o.skull, [0, -0.04 * s, 0.04 * s], [0.26 * s, 0.08 * s, 0.2 * s], null, { tn: false }); }
    else { p.core = b.add(p.body, 'ico', c, [0, 0, 0], 0.5 * s, null, { glow: true, tn: false, op: 0.9 }); eyes2(b, p.body, 0.06 * s, 0.22 * s, 0.1 * s, 0.07 * s, 0xffffff); }
    if (o.flame) { p.flame = b.add(p.body, 'cone', o.flame, [0, 0.5 * s, 0], [0.34 * s, 0.7 * s, 0.34 * s], null, { glow: true, tn: false, op: 0.85 }); }
    if (o.lantern) { b.add(p.body, 'cyl', 0x2a2a30, [0, 0.55 * s, 0], [0.04 * s, 0.4 * s, 0.04 * s]); b.add(p.body, 'tor', 0x2a2a30, [0, 0.78 * s, 0], [0.2 * s, 0.2 * s, 0.2 * s], [H2, 0, 0]); }
    if (o.wings) { p.wingL = b.piv(p.body, 0.2 * s, 0.1 * s, -0.1 * s); p.wingR = b.piv(p.body, -0.2 * s, 0.1 * s, -0.1 * s); b.add(p.wingL, 'box', o.wings, [0.28 * s, 0, 0], [0.5 * s, 0.02 * s, 0.4 * s], [0, 0, 0.3], { glow: true, tn: false, op: 0.7 }); b.add(p.wingR, 'box', o.wings, [-0.28 * s, 0, 0], [0.5 * s, 0.02 * s, 0.4 * s], [0, 0, -0.3], { glow: true, tn: false, op: 0.7 }); }
    if (o.crystal) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5; b.add(p.body, 'oct', o.crystal, [Math.cos(a) * 0.32 * s, Math.sin(a * 2) * 0.15 * s, Math.sin(a) * 0.32 * s], [0.14 * s, 0.4 * s, 0.14 * s], [0.3, a, 0.3], { glow: true, tn: false, op: 0.9 }); } }
    if (o.trail) { p.tail = b.piv(p.body, 0, -0.2 * s, -0.3 * s); for (let i = 0; i < 3; i++) b.add(p.tail, 'sph', o.trail, [0, -i * 0.18 * s, -i * 0.22 * s], (0.3 - i * 0.08) * s, null, { glow: true, tn: false, op: 0.6 }); }
    if (o.orbitC) { p.orbit = b.piv(p.body, 0, 0, 0); const g = o.orbitG || 'ico'; for (let i = 0; i < (o.orbitN || 3); i++) { const a = i * TAU / (o.orbitN || 3); b.add(p.orbit, g, o.orbitC, [Math.cos(a) * 0.7 * s, 0, Math.sin(a) * 0.7 * s], 0.14 * s, null, glowM); } }
    return b.finish({ height: 1.6 * s, radius: 0.5 * s, style: 'float', walk: 4, float: true });
  }

  // ---------------- volant ailé (corbeau, chauve-souris, mouche, papillon) ----------------
  function wingK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts, bc = o.body || 0x2a2630;
    p.body = b.piv(R, 0, 0.9 * s, 0);
    b.add(p.body, 'sph', bc, [0, 0, 0], [0.4 * s, 0.38 * s, 0.55 * s]);
    p.head = b.piv(p.body, 0, 0.1 * s, 0.28 * s);
    b.add(p.head, 'sph', o.head || bc, [0, 0, 0.02 * s], 0.3 * s);
    eyes2(b, p.head, 0.04 * s, 0.14 * s, 0.09 * s, 0.07 * s, o.eye || 0xff4a4a);
    if (o.beak) b.add(p.head, 'cone4', o.beak, [0, -0.04 * s, 0.22 * s], [0.1 * s, 0.26 * s, 0.1 * s], [H2, 0, 0], { tn: false });
    if (o.fangs) [1, -1].forEach((sd) => b.add(p.head, 'cone4', 0xf4f0e0, [sd * 0.06 * s, -0.14 * s, 0.14 * s], [0.04 * s, 0.14 * s, 0.04 * s], [PI, 0, 0], { tn: false }));
    if (o.ears) [1, -1].forEach((sd) => b.add(p.head, 'cone4', bc, [sd * 0.12 * s, 0.22 * s, -0.02 * s], [0.1 * s, 0.22 * s, 0.06 * s]));
    p.wingL = b.piv(p.body, 0.18 * s, 0.05 * s, 0); p.wingR = b.piv(p.body, -0.18 * s, 0.05 * s, 0);
    const wc = o.wing || bc, wl = (o.span || 1) * s;
    [[p.wingL, 1], [p.wingR, -1]].forEach(([w, sd]) => { b.add(w, 'box', wc, [sd * 0.4 * wl, 0, 0], [0.8 * wl, 0.03 * s, 0.5 * wl], [0, 0, sd * 0.1], o.wingOp ? { op: o.wingOp } : null); if (o.fingers) for (let i = 0; i < 3; i++) b.add(w, 'cyl', bc, [sd * (0.3 + i * 0.22) * wl, 0, 0], [0.03 * s, 0.03 * s, 0.5 * wl], [0, sd * (0.2 - i * 0.2), 0]); });
    if (o.tailC) { p.tail = b.piv(p.body, 0, 0, -0.3 * s); b.add(p.tail, 'cone4', o.tailC, [0, 0, -0.25 * s], [0.18 * s, 0.4 * s, 0.05 * s], [-H2, 0, 0]); }
    if (o.glowBody) b.add(p.body, 'sph', o.glowBody, [0, -0.05 * s, 0.1 * s], 0.22 * s, null, { glow: true, tn: false, op: 0.85 });
    if (o.legsN) for (let i = 0; i < o.legsN; i++) b.add(p.body, 'cyl', bc, [(i % 2 ? 1 : -1) * 0.14 * s, -0.28 * s, (0.15 - Math.floor(i / 2) * 0.15) * s], [0.025 * s, 0.3 * s, 0.025 * s], [0, 0, (i % 2 ? 1 : -1) * 0.3]);
    return b.finish({ height: 1.3 * s, radius: 0.45 * s, style: 'float', walk: 5, float: true });
  }

  // ---------------- masse / flaque / chair ----------------
  function blobK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts, c = o.c || 0x6a3a4a;
    p.body = b.piv(R, 0, 0.4 * s, 0);
    b.add(p.body, 'sph', c, [0, 0.1 * s, 0], [0.95 * s, 0.75 * s, 0.95 * s], null, o.op ? { op: o.op } : null);
    for (let i = 0; i < (o.bumps || 0); i++) { const a = i * 2.4; b.add(p.body, 'sph', o.c2 || c, [Math.cos(a) * 0.38 * s, 0.2 * s + (i % 3) * 0.1 * s, Math.sin(a) * 0.38 * s], (0.3 + (i % 2) * 0.1) * s); }
    const ne = o.eyesN || 2;
    for (let i = 0; i < ne; i++) { const a = -0.7 + i * (1.4 / Math.max(1, ne - 1 || 1)); b.add(p.body, 'sph', 0xf4f0e8, [Math.sin(a) * 0.4 * s, 0.25 * s + (i % 2) * 0.12 * s, 0.38 * s], 0.2 * s, null, { tn: false }); b.add(p.body, 'sph', o.eye || 0x2a1010, [Math.sin(a) * 0.4 * s, 0.25 * s + (i % 2) * 0.12 * s, 0.5 * s], 0.09 * s, null, { glow: !!o.eyeGlow, tn: false }); }
    if (o.mouth) { b.add(p.body, 'sph', 0x1a0610, [0, -0.02 * s, 0.4 * s], [0.5 * s, 0.22 * s, 0.2 * s], null, { tn: false }); for (let i = -2; i <= 2; i++) b.add(p.body, 'cone4', 0xf4f0e0, [i * 0.09 * s, 0.07 * s, 0.5 * s], [0.05 * s, 0.14 * s, 0.05 * s], [PI, 0, 0], { tn: false }); }
    if (o.tent) for (let i = 0; i < o.tent; i++) { const a = i * TAU / o.tent; b.add(p.body, 'cone', o.c2 || c, [Math.cos(a) * 0.55 * s, -0.1 * s, Math.sin(a) * 0.55 * s], [0.14 * s, 0.6 * s, 0.14 * s], [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8]); }
    if (o.core) p.core = b.add(p.body, 'ico', o.core, [0, 0.15 * s, 0], 0.4 * s, null, { glow: true, tn: false, op: 0.8 });
    if (o.spikes) for (let i = 0; i < 7; i++) { const a = i * 0.9; b.add(p.body, 'cone4', o.spikes, [Math.cos(a) * 0.4 * s, 0.35 * s + (i % 2) * 0.1 * s, Math.sin(a) * 0.4 * s - 0.1 * s], [0.1 * s, 0.35 * s, 0.1 * s], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], { glow: !!o.spikeGlow, tn: false }); }
    if (o.gears) { p.orbit = b.piv(p.body, 0, 0.2 * s, 0); for (let i = 0; i < o.gears; i++) { const a = i * TAU / o.gears; b.add(p.orbit, 'cyl', o.gearC || 0xb8a070, [Math.cos(a) * 0.7 * s, 0, Math.sin(a) * 0.7 * s], [0.4 * s, 0.1 * s, 0.4 * s], [H2, 0, a]); } }
    p.legL = b.piv(R, 0.2 * s, 0.1, 0); p.legR = b.piv(R, -0.2 * s, 0.1, 0);
    b.root.userData.hop = o.hop !== false;
    return b.finish({ height: 1.1 * s, radius: 0.6 * s, style: 'blob', walk: 10 });
  }

  // ---------------- œil / orbe observateur ----------------
  function eyeK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 1.0 * s, 0);
    b.add(p.body, 'sph', o.white || 0xf4f0e8, [0, 0, 0], 0.9 * s, null, { tn: false });
    p.core = b.add(p.body, 'sph', o.iris || 0x8a4fd0, [0, 0, 0.36 * s], 0.5 * s, null, { glow: true, tn: false });
    b.add(p.body, 'sph', 0x050308, [0, 0, 0.55 * s], 0.22 * s, null, { tn: false });
    if (o.veins) for (let i = 0; i < 5; i++) b.add(p.body, 'cyl', 0xc03040, [Math.cos(i * 1.3) * 0.2 * s, Math.sin(i * 1.3) * 0.3 * s, 0.38 * s], [0.015 * s, 0.4 * s, 0.015 * s], [0, 0, i * 1.3], { tn: false, noOutline: true });
    if (o.lid) b.add(p.body, 'hemi', o.lid, [0, 0.05 * s, 0], [0.98 * s, 0.7 * s, 0.98 * s], [0.4, 0, 0]);
    if (o.tent) { p.tendrils = []; for (let i = 0; i < o.tent; i++) { const a = i * TAU / o.tent; p.tendrils.push(b.add(p.body, 'cone', o.tentC || 0x4a2a5a, [Math.cos(a) * 0.35 * s, -0.55 * s, Math.sin(a) * 0.35 * s], [0.1 * s, 0.6 * s, 0.1 * s], [PI, 0, 0])); } }
    if (o.orbitN) { p.orbit = b.piv(p.body, 0, 0, 0); for (let i = 0; i < o.orbitN; i++) { const a = i * TAU / o.orbitN; b.add(p.orbit, 'sph', o.orbitC || 0xffffff, [Math.cos(a) * 0.9 * s, 0.1 * s, Math.sin(a) * 0.9 * s], 0.14 * s, null, glowM); } }
    if (o.ring) p.ring = b.add(p.body, 'tor', o.ring, [0, 0, 0], [1.7 * s, 1.7 * s, 1.7 * s], [H2 * 0.8, 0, 0], glowM);
    if (o.stone) { b.root.traverse((m) => { if (m.isMesh && m.material && m !== p.core) { m.material.color && m.material.color.setHex(o.stone); } }); }
    return b.finish({ height: 1.7 * s, radius: 0.6 * s, style: 'float', walk: 4, float: true });
  }

  // ---------------- plante carnivore / bulbe ----------------
  function plantK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts, st = o.stem || 0x4a7a3a;
    p.body = b.piv(R, 0, 0.0, 0);
    b.add(p.body, 'tcyl', st, [0, 0.45 * s, 0], [0.3 * s, 0.9 * s, 0.3 * s]);
    if (o.bulb) b.add(p.body, 'sph', o.bulb, [0, 0.12 * s, 0], [0.7 * s, 0.4 * s, 0.7 * s]);
    p.head = b.piv(p.body, 0, 0.95 * s, 0.05 * s);
    if (o.eyeBud) { b.add(p.head, 'sph', o.petal || 0xc03060, [0, 0.1 * s, 0], 0.7 * s); b.add(p.head, 'sph', 0xf4f0e8, [0, 0.1 * s, 0.26 * s], 0.42 * s, null, { tn: false }); p.core = b.add(p.head, 'sph', o.eye || 0xffd23f, [0, 0.1 * s, 0.44 * s], 0.22 * s, null, glowM); }
    else { for (let i = 0; i < 7; i++) { const a = i * TAU / 7; b.add(p.head, 'cone', o.petal || 0xc03060, [Math.cos(a) * 0.3 * s, 0.1 * s, Math.sin(a) * 0.3 * s + 0.05 * s], [0.22 * s, 0.6 * s, 0.1 * s], [Math.sin(a) * 0.9, -a, -Math.cos(a) * 0.9 + 0], null); }
      b.add(p.head, 'sph', 0x1a0610, [0, 0.12 * s, 0.1 * s], [0.5 * s, 0.4 * s, 0.4 * s], null, { tn: false }); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; b.add(p.head, 'cone4', 0xf4f0e0, [Math.cos(a) * 0.2 * s, 0.12 * s + Math.sin(a) * 0.15 * s, 0.1 * s + 0.2 * s], [0.05 * s, 0.16 * s, 0.05 * s], [H2, 0, 0], { tn: false }); }
      p.jaw = p.head; }
    for (let i = 0; i < (o.vines || 0); i++) { const a = i * TAU / o.vines; b.add(p.body, 'cone', st, [Math.cos(a) * 0.4 * s, 0.1 * s, Math.sin(a) * 0.4 * s], [0.08 * s, 0.7 * s, 0.08 * s], [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]); }
    if (o.flesh) b.add(p.body, 'sph', o.flesh, [0, 0.5 * s, 0.1 * s], [0.4 * s, 0.4 * s, 0.3 * s], null, { op: 0.9 });
    if (o.thorns) for (let i = 0; i < 6; i++) b.add(p.body, 'cone4', o.thorns, [Math.cos(i * 1.1) * 0.15 * s, (0.2 + i * 0.12) * s, Math.sin(i * 1.1) * 0.15 * s], [0.06 * s, 0.2 * s, 0.06 * s], [Math.sin(i * 1.1) * 1.2, 0, -Math.cos(i * 1.1) * 1.2], { tn: false });
    p.legL = b.piv(R, 0.2 * s, 0.1, 0); p.legR = b.piv(R, -0.2 * s, 0.1, 0);
    b.root.userData.hop = true;
    return b.finish({ height: 1.5 * s, radius: 0.55 * s, style: 'blob', walk: 8 });
  }

  // ---------------- grande tête hurlante ----------------
  function screamK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts, sk = o.skin || 0xe0d8d0;
    p.legL = b.piv(R, 0.14 * s, 0.4 * s, 0); p.legR = b.piv(R, -0.14 * s, 0.4 * s, 0);
    [p.legL, p.legR].forEach((l) => b.add(l, 'cyl', o.legC || sk, [0, -0.2 * s, 0], [0.12 * s, 0.4 * s, 0.12 * s]));
    p.body = b.piv(R, 0, 0.4 * s, 0);
    b.add(p.body, 'cyl', o.cloth || 0x4a4048, [0, 0.2 * s, 0], [0.36 * s, 0.45 * s, 0.28 * s]);
    p.head = b.piv(p.body, 0, 0.72 * s, 0.05 * s);
    b.add(p.head, 'sph', sk, [0, 0.2 * s, 0], [0.95 * s, 0.95 * s, 0.85 * s]);
    eyes2(b, p.head, 0.38 * s, 0.38 * s, 0.2 * s, 0.14 * s, o.eye || 0xffffff);
    p.jaw = b.piv(p.head, 0, 0.0, 0.3 * s);
    b.add(p.jaw, 'sph', 0x120408, [0, -0.1 * s, 0.1 * s], [0.5 * s, 0.5 * s, 0.3 * s], null, { tn: false });
    for (let i = -2; i <= 2; i++) b.add(p.jaw, 'cone4', 0xf4f0e0, [i * 0.1 * s, 0.1 * s, 0.2 * s], [0.06 * s, 0.16 * s, 0.06 * s], [PI, 0, 0], { tn: false });
    p.armL = b.piv(p.body, 0.24 * s, 0.4 * s, 0); p.armR = b.piv(p.body, -0.24 * s, 0.4 * s, 0);
    [p.armL, p.armR].forEach((a) => { b.add(a, 'cyl', sk, [0, -0.2 * s, 0], [0.09 * s, 0.5 * s, 0.09 * s]); for (let i = -1; i <= 1; i++) b.add(a, 'cone4', sk, [i * 0.04 * s, -0.5 * s, 0.02 * s], [0.03 * s, 0.2 * s, 0.03 * s], [PI, 0, 0]); });
    if (o.hair) for (let i = 0; i < 7; i++) b.add(p.head, 'cone4', o.hair, [(i - 3) * 0.14 * s, 0.1 * s, -0.36 * s], [0.04 * s, 0.9 * s, 0.04 * s], [-0.2, 0, (i - 3) * 0.06], { tn: false });
    if (o.rings) p.ring = b.add(p.head, 'tor', o.rings, [0, 0.2 * s, 0], [1.4 * s, 1.4 * s, 1.4 * s], [0, 0, 0], { glow: true, tn: false, op: 0.6 });
    return b.finish({ height: 1.7 * s, radius: 0.5 * s, style: 'biped', walk: 9 });
  }

  // ---------------- statue (pleureuse : se fige sous le regard) ----------------
  function statueK(b, o) {
    const h = o.h || 1.1, R = b.root, p = b.parts, st = o.stone || 0xb8bcc4, v = o.kind || 'angel';
    p.legL = b.piv(R, 0.14 * h, 0.45 * h, 0); p.legR = b.piv(R, -0.14 * h, 0.45 * h, 0);
    [p.legL, p.legR].forEach((l) => b.add(l, 'cyl', st, [0, -0.22 * h, 0], [0.18 * h, 0.45 * h, 0.18 * h]));
    p.body = b.piv(R, 0, 0.45 * h, 0);
    if (v === 'angel' || v === 'maiden') b.add(p.body, 'cone', st, [0, 0.0, 0], [0.7 * h, 1.0 * h, 0.6 * h]);
    b.add(p.body, v === 'scarecrow' ? 'cyl' : 'tcyl', o.cloth || st, [0, 0.3 * h, 0], [0.46 * h, 0.55 * h, 0.34 * h]);
    p.head = b.piv(p.body, 0, 0.6 * h, 0);
    if (v === 'scarecrow') { b.add(p.head, 'sph', 0xb89a6a, [0, 0.2 * h, 0], [0.6 * h, 0.6 * h, 0.55 * h]); b.add(p.head, 'cyl', 0x4a3a2a, [0, 0.52 * h, 0], [0.9 * h, 0.05 * h, 0.9 * h]); b.add(p.head, 'cyl', 0x4a3a2a, [0, 0.64 * h, 0], [0.5 * h, 0.25 * h, 0.5 * h]); eyes2(b, p.head, 0.24 * h, 0.28 * h, 0.12 * h, 0.07 * h, o.eye || 0xff7a2a); for (let i = 0; i < 6; i++) b.add(p.body, 'cone4', 0xd8c070, [(i - 2.5) * 0.12 * h, 0.0, 0.1 * h], [0.05 * h, 0.4 * h, 0.05 * h], [PI, 0, (i - 2.5) * 0.1], { tn: false }); b.add(p.body, 'cyl', 0x6b4226, [0, 0.6 * h, -0.1 * h], [0.05 * h, 1.8 * h, 0.05 * h], [0, 0, H2]); }
    else { b.add(p.head, 'sph', st, [0, 0.2 * h, 0], [0.55 * h, 0.58 * h, 0.52 * h]); if (v === 'gargoyle' || v === 'idol') { [1, -1].forEach((s) => b.add(p.head, 'cone', st, [s * 0.2 * h, 0.5 * h, 0], [0.1 * h, 0.3 * h, 0.1 * h], [0, 0, -s * 0.4])); eyes2(b, p.head, 0.26 * h, 0.24 * h, 0.1 * h, 0.07 * h, o.eye || 0xff4a2a); }
      if (v === 'angel') b.add(p.head, 'tor', 0xffe9a0, [0, 0.62 * h, 0], [0.5 * h, 0.5 * h, 0.5 * h], [H2, 0, 0], { glow: true, tn: false, op: 0.7 }); if (v === 'maiden') b.add(p.head, 'hemi', 0xe8e8f0, [0, 0.28 * h, -0.02 * h], [0.7 * h, 0.8 * h, 0.7 * h], [-0.2, 0, 0], { op: 0.8 }); if (v === 'knight') { b.add(p.head, 'cyl', st, [0, 0.2 * h, 0], [0.64 * h, 0.62 * h, 0.6 * h]); b.add(p.head, 'box', 0x0b0b12, [0, 0.2 * h, 0.3 * h], [0.4 * h, 0.1 * h, 0.04 * h], null, { tn: false }); } }
    if (o.tears) { p.tears = []; [1, -1].forEach((s) => p.tears.push(b.add(p.head, 'sph', 0x8fe0ff, [s * 0.1 * h, 0.15 * h, 0.27 * h], 0.05 * h, null, { glow: true, tn: false, op: 0.8 }))); }
    p.armL = b.piv(p.body, 0.3 * h, 0.5 * h, 0); p.armR = b.piv(p.body, -0.3 * h, 0.5 * h, 0);
    [p.armL, p.armR].forEach((a) => { b.add(a, 'cyl', st, [0, -0.22 * h, 0], [0.13 * h, 0.5 * h, 0.13 * h]); b.add(a, 'sph', st, [0, -0.48 * h, 0.02 * h], 0.17 * h); for (let i = -1; i <= 1; i++) b.add(a, 'cone4', st, [i * 0.05 * h, -0.62 * h, 0.04 * h], [0.04 * h, 0.2 * h, 0.04 * h], [PI, 0, i * 0.2]); });
    if (v === 'angel' || v === 'gargoyle') { p.wingL = b.piv(p.body, 0.15 * h, 0.55 * h, -0.2 * h); p.wingR = b.piv(p.body, -0.15 * h, 0.55 * h, -0.2 * h);
      for (let i = 0; i < 4; i++) { b.add(p.wingL, 'box', st, [(0.2 + i * 0.16) * h, (0.3 - i * 0.08) * h, 0], [0.5 * h, 0.04 * h, 0.2 * h], [0, 0, 0.5 - i * 0.12]); b.add(p.wingR, 'box', st, [-(0.2 + i * 0.16) * h, (0.3 - i * 0.08) * h, 0], [0.5 * h, 0.04 * h, 0.2 * h], [0, 0, -0.5 + i * 0.12]); } p.wingL.userData.still = 1; }
    if (o.cracks) for (let i = 0; i < 3; i++) b.add(p.body, 'box', o.cracks, [(i - 1) * 0.14 * h, (0.2 + i * 0.1) * h, 0.17 * h], [0.03 * h, 0.3 * h, 0.02 * h], [0, 0, 0.4 * (i - 1)], glowM);
    if (o.weapon) holdWeapon(b, p.armR, o.weapon, h, o.weaponC);
    return b.finish({ height: 1.9 * h, radius: 0.5 * h, style: 'weeping', walk: 7 });
  }

  // ---------------- décor-créature fixé au mur (portrait, vigne, visage de pierre) ----------------
  function wallK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts, c = o.c || 0x8a8a92;
    p.body = b.piv(R, 0, 1.2 * s, 0);
    if (o.frame) { b.add(p.body, 'box', o.frame, [0, 0, -0.05 * s], [1.5 * s, 2.0 * s, 0.16 * s]); b.add(p.body, 'box', c, [0, 0, 0.04 * s], [1.2 * s, 1.7 * s, 0.05 * s], null, { tn: false }); }
    else if (o.vine) { for (let i = 0; i < 6; i++) b.add(p.body, 'cone', o.vine, [(i - 2.5) * 0.18 * s, -0.4 * s, -0.05 * s], [0.14 * s, 1.4 * s, 0.14 * s], [0, 0, (i - 2.5) * 0.08]); b.add(p.body, 'sph', o.c || 0xc03060, [0, 0.3 * s, 0.1 * s], [0.8 * s, 0.8 * s, 0.5 * s]); }
    else b.add(p.body, 'box', c, [0, 0, -0.05 * s], [1.5 * s, 2.0 * s, 0.4 * s]);
    p.head = b.piv(p.body, 0, 0.25 * s, 0.08 * s);
    b.add(p.head, 'sph', o.face || 0xd8d0c0, [0, 0, 0.04 * s], [0.8 * s, 0.9 * s, 0.4 * s]);
    eyes2(b, p.head, 0.1 * s, 0.22 * s, 0.2 * s, 0.14 * s, o.eye || 0xffe14a);
    b.add(p.head, 'sph', 0x120408, [0, -0.25 * s, 0.2 * s], [0.3 * s, 0.2 * s, 0.1 * s], null, { tn: false });
    p.jaw = p.head;
    p.reachArms = [];
    [1, -1].forEach((sd) => { const a = b.piv(p.body, sd * 0.45 * s, -0.4 * s, 0.1 * s); b.add(a, 'box', o.arm || o.face || 0xd8d0c0, [0, 0, 0.5], [0.22 * s, 0.22 * s, 1.0]); b.add(a, 'sph', o.arm || o.face || 0xd8d0c0, [0, 0, 1.0], 0.34 * s); for (let i = -1; i <= 1; i++) b.add(a, 'cone4', o.arm || o.face || 0xd8d0c0, [i * 0.1 * s, 0, 1.2], [0.06 * s, 0.3 * s, 0.06 * s], [H2, 0, 0]); p.reachArms.push(a); if (sd > 0) p.armL = a; else p.armR = a; });
    return b.finish({ height: 2.2 * s, radius: 0.8 * s, style: 'wall', walk: 4 });
  }

  // ---------------- objet flottant animé (livres, ballons, tickets, lustre, étoile…) ----------------
  function objK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts;
    p.body = b.piv(R, 0, (o.y || 0.9) * s, 0);
    const c = o.c || 0xc0a060;
    switch (o.shape) {
      case 'book': b.add(p.body, 'box', o.c, [0, 0, 0], [0.5 * s, 0.64 * s, 0.14 * s]); b.add(p.body, 'box', 0xf2e6c4, [0, 0, 0.02 * s], [0.44 * s, 0.58 * s, 0.14 * s], null, { tn: false }); b.add(p.body, 'box', o.c, [0, 0, 0.0], [0.5 * s, 0.64 * s, 0.05 * s]); if (o.gold) b.add(p.body, 'box', 0xffd23f, [0, 0, 0.09 * s], [0.34 * s, 0.4 * s, 0.03 * s], null, glowM);
        p.wingL = b.piv(p.body, 0.27 * s, 0.05 * s, 0); p.wingR = b.piv(p.body, -0.27 * s, 0.05 * s, 0); b.add(p.wingL, 'box', 0xf2e6c4, [0.22 * s, 0, 0], [0.42 * s, 0.04 * s, 0.5 * s], null, { tn: false }); b.add(p.wingR, 'box', 0xf2e6c4, [-0.22 * s, 0, 0], [0.42 * s, 0.04 * s, 0.5 * s], null, { tn: false }); break;
      case 'page': b.add(p.body, 'box', 0xf4f0e0, [0, 0, 0], [0.5 * s, 0.7 * s, 0.02 * s], null, { tn: false }); for (let i = 0; i < 4; i++) b.add(p.body, 'box', 0x2a2a30, [0, (0.2 - i * 0.12) * s, 0.012 * s], [0.34 * s, 0.025 * s, 0.01 * s], null, { tn: false, noOutline: true }); b.add(p.body, 'cone4', 0xcfd6e6, [0, 0.42 * s, 0], [0.2 * s, 0.2 * s, 0.03 * s], null, { tn: false }); break;
      case 'balloon': b.add(p.body, 'sph', c, [0, 0.2 * s, 0], [0.7 * s, 0.85 * s, 0.7 * s], null, { tn: false }); b.add(p.body, 'cone4', c, [0, -0.28 * s, 0], [0.12 * s, 0.14 * s, 0.12 * s], [PI, 0, 0], { tn: false }); b.add(p.body, 'cyl', 0xcfc8b0, [0, -0.7 * s, 0], [0.01 * s, 0.9 * s, 0.01 * s], null, { tn: false, noOutline: true }); b.add(p.body, 'sph', 0x1a1418, [0, 0.15 * s, 0.34 * s], [0.4 * s, 0.14 * s, 0.1 * s], null, { tn: false }); eyes2(b, p.body, 0.35 * s, 0.32 * s, 0.14 * s, 0.1 * s, 0xffffff); break;
      case 'ticket': b.add(p.body, 'box', c, [0, 0, 0], [0.9 * s, 0.5 * s, 0.05 * s], null, { tn: false }); b.add(p.body, 'box', 0x8a5a10, [0, 0, 0.03 * s], [0.7 * s, 0.3 * s, 0.02 * s], null, { tn: false }); eyes2(b, p.body, 0.05 * s, 0.05 * s, 0.14 * s, 0.1 * s, 0x2a1a10); break;
      case 'folder': b.add(p.body, 'box', c, [0, 0, 0], [0.6 * s, 0.78 * s, 0.1 * s]); b.add(p.body, 'box', 0xf4f0e0, [0, 0.05 * s, 0.04 * s], [0.54 * s, 0.66 * s, 0.1 * s], null, { tn: false }); eyes2(b, p.body, 0.1 * s, 0.1 * s, 0.12 * s, 0.1 * s, 0xff4a4a); p.wingL = b.piv(p.body, 0.3 * s, 0, 0); p.wingR = b.piv(p.body, -0.3 * s, 0, 0); b.add(p.wingL, 'box', 0xf4f0e0, [0.2 * s, 0, 0], [0.4 * s, 0.03 * s, 0.4 * s], null, { tn: false }); b.add(p.wingR, 'box', 0xf4f0e0, [-0.2 * s, 0, 0], [0.4 * s, 0.03 * s, 0.4 * s], null, { tn: false }); break;
      case 'pearl': b.add(p.body, 'sph', c, [0, 0, 0], 0.7 * s, null, { glow: true, tn: false, op: 0.95 }); b.add(p.body, 'hemi', 0x3a3a4a, [0, 0.0, -0.1 * s], [0.9 * s, 0.6 * s, 0.9 * s], [PI, 0, 0], { tn: false, op: 0.9 }); b.add(p.body, 'hemi', 0x3a3a4a, [0, 0.0, -0.1 * s], [0.9 * s, 0.6 * s, 0.9 * s], null, { tn: false, op: 0.9 }); eyes2(b, p.body, 0.05 * s, 0.32 * s, 0.1 * s, 0.07 * s, 0x050308); break;
      case 'comet': p.core = b.add(p.body, 'ico', c, [0, 0, 0.1 * s], 0.6 * s, null, { glow: true, tn: false }); for (let i = 0; i < 4; i++) b.add(p.body, 'cone', c, [0, i * 0.05 * s, -(0.4 + i * 0.3) * s], [(0.5 - i * 0.1) * s, (0.7 + i * 0.1) * s, (0.5 - i * 0.1) * s], [-H2, 0, 0], { glow: true, tn: false, op: 0.55 }); eyes2(b, p.body, 0.08 * s, 0.32 * s, 0.1 * s, 0.07 * s, 0x050308); break;
      case 'star': p.core = b.add(p.body, 'oct', c, [0, 0, 0], [0.9 * s, 0.9 * s, 0.9 * s], null, { glow: true, tn: false }); b.add(p.body, 'oct', 0x1a0a2a, [0, 0, 0], [0.55 * s, 0.55 * s, 0.55 * s], [0.6, 0.6, 0], { tn: false }); for (let i = 0; i < 4; i++) b.add(p.body, 'cone4', c, [Math.cos(i * H2) * 0.6 * s, Math.sin(i * H2) * 0.6 * s, 0], [0.16 * s, 0.4 * s, 0.1 * s], [0, 0, i * H2 - H2], { glow: true, tn: false }); eyes2(b, p.body, 0.05 * s, 0.26 * s, 0.12 * s, 0.07 * s, 0xffffff); break;
      case 'chandelier': b.add(p.body, 'tor', 0xb8923a, [0, 0, 0], [1.0 * s, 1.0 * s, 1.0 * s], [H2, 0, 0], { tn: false }); b.add(p.body, 'cyl', 0xb8923a, [0, 0.4 * s, 0], [0.06 * s, 0.8 * s, 0.06 * s], null, { tn: false }); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; b.add(p.body, 'cyl', 0xf4e8c8, [Math.cos(a) * 0.5 * s, 0.14 * s, Math.sin(a) * 0.5 * s], [0.07 * s, 0.26 * s, 0.07 * s], null, { tn: false }); b.add(p.body, 'cone', 0xff9a30, [Math.cos(a) * 0.5 * s, 0.34 * s, Math.sin(a) * 0.5 * s], [0.1 * s, 0.22 * s, 0.1 * s], null, { glow: true, tn: false }); } b.add(p.body, 'sph', 0xff6a20, [0, -0.1 * s, 0], 0.3 * s, null, glowM); eyes2(b, p.body, -0.1 * s, 0.14 * s, 0.1 * s, 0.07 * s, 0xffffff); p.orbit = p.body; break;
      case 'gear': p.core = b.add(p.body, 'cyl', c, [0, 0, 0], [0.9 * s, 0.22 * s, 0.9 * s], [H2, 0, 0]); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; b.add(p.body, 'box', c, [Math.cos(a) * 0.5 * s, Math.sin(a) * 0.5 * s, 0], [0.16 * s, 0.2 * s, 0.22 * s], [0, 0, a]); } eyes2(b, p.body, 0.08 * s, 0.14 * s, 0.14 * s, 0.1 * s, 0xff9a30); break;
      case 'shard': for (let i = 0; i < 3; i++) b.add(p.body, 'oct', c, [(i - 1) * 0.2 * s, (i % 2) * 0.2 * s, 0], [0.2 * s, 0.7 * s, 0.2 * s], [0.4 * i, 0.3, 0.6 * i], { glow: true, tn: false, op: 0.9 }); eyes2(b, p.body, 0.05 * s, 0.1 * s, 0.1 * s, 0.07 * s, 0xffffff); break;
      case 'jelly': b.add(p.body, 'hemi', o.c, [0, 0.1 * s, 0], [0.8 * s, 0.7 * s, 0.8 * s], null, { op: 0.75 }); for (let i = 0; i < 5; i++) { const a = i * TAU / 5; b.add(p.body, 'cone', o.c, [Math.cos(a) * 0.25 * s, -0.35 * s, Math.sin(a) * 0.25 * s], [0.06 * s, 0.7 * s, 0.06 * s], [PI, 0, 0], { op: 0.7 }); } b.add(p.body, 'cyl', 0xf4e8c8, [0, 0.45 * s, 0], [0.08 * s, 0.3 * s, 0.08 * s], null, { tn: false }); b.add(p.body, 'cone', 0xffb040, [0, 0.68 * s, 0], [0.1 * s, 0.22 * s, 0.1 * s], null, glowM); eyes2(b, p.body, 0.12 * s, 0.34 * s, 0.1 * s, 0.07 * s, 0x2a4a8a); break;
      case 'pearlshell': break;
      default: b.add(p.body, 'sph', c, [0, 0, 0], 0.6 * s);
    }
    if (o.tail) { p.tail = b.piv(p.body, 0, 0, -0.2 * s); b.add(p.tail, 'cone4', o.tail, [0, 0, -0.3 * s], [0.12 * s, 0.5 * s, 0.05 * s], [-H2, 0, 0], { tn: false }); }
    return b.finish({ height: 1.5 * s, radius: 0.5 * s, style: 'float', walk: 5, float: true });
  }

  // ---------------- carapace / crabe / golem trapu ----------------
  function bulkK(b, o) {
    const s = o.s || 1;
    const p = biped(b, { h: 1.2 * s, skin: o.skin || 0x8a8a92, cloth: o.cloth || 0x6a6a72, legC: o.legC || 0x5a5a62, boot: 0x3a3a42, eye: o.eye || 0xff7a2a, bw: o.bw || 1.6, armC: o.armC || o.skin || 0x8a8a92, torsoGeo: 'box' });
    const h = 1.2 * s;
    if (o.rocks) [1, -1].forEach((sd) => b.add(p.body, 'ico', o.rocks, [sd * 0.5 * h, 0.55 * h, 0], 0.4 * h));
    if (o.lava) b.add(p.body, 'oct', o.lava, [0, 0.3 * h, 0.3 * h], [0.3 * h, 0.4 * h, 0.1 * h], null, glowM);
    if (o.horns) [1, -1].forEach((sd) => b.add(p.head, 'cone', 0x2a1a1a, [sd * 0.26 * h, 0.52 * h, 0], [0.14 * h, 0.5 * h, 0.14 * h], [0, 0, -sd * 0.5], { tn: false }));
    if (o.rings) { p.orbit = b.piv(p.body, 0, 0.35 * h, 0); for (let i = 0; i < 2; i++) b.add(p.orbit, 'tor', o.rings, [0, (i - 0.5) * 0.3 * h, 0], [1.6 * h, 1.6 * h, 1.6 * h], [H2 + i * 0.4, 0, i * 0.4], glowM); }
    if (o.bark) for (let i = 0; i < 6; i++) b.add(p.body, 'cone4', o.bark, [Math.cos(i * 1.1) * 0.4 * h, (0.3 + (i % 3) * 0.2) * h, Math.sin(i * 1.1) * 0.3 * h], [0.1 * h, 0.5 * h, 0.1 * h], [Math.sin(i * 1.1), 0, -Math.cos(i * 1.1)], { tn: false });
    if (o.leaves) for (let i = 0; i < 5; i++) b.add(p.head, 'sph', o.leaves, [(i - 2) * 0.16 * h, 0.5 * h + (i % 2) * 0.1 * h, 0], 0.18 * h, null, { tn: false });
    if (o.weapon) holdWeapon(b, p.armR, o.weapon, h, o.weaponC);
    if (o.shield) b.add(p.armL, 'cyl', o.shield, [0, -0.3 * h, 0.2 * h], [0.7 * h, 0.08 * h, 0.7 * h], [0, 0, H2]);
    if (o.drill) { b.add(p.armR, 'cone', 0xb0b0b8, [0, -0.7 * h, 0.1 * h], [0.34 * h, 0.8 * h, 0.34 * h], [PI, 0, 0]); for (let i = 0; i < 3; i++) b.add(p.armR, 'tor', 0x5a5a62, [0, (-0.5 - i * 0.14) * h, 0.1 * h], [0.34 * h, 0.34 * h, 0.34 * h], [H2, 0, 0], { tn: false }); }
    if (o.blind) { p.head.children.slice().forEach((c) => { if (c.geometry === geo('lsph')) p.head.remove(c); }); }
    return b.finish({ height: 2.1 * s, radius: 0.85 * s, style: 'biped', walk: 7 });
  }

  // ---------------- crabe ----------------
  function crabK(b, o) {
    const s = o.s || 1, R = b.root, p = b.parts;
    p.body = b.piv(R, 0, 0.4 * s, 0);
    b.add(p.body, 'sph', o.shell || 0xc0584a, [0, 0.1 * s, 0], [1.2 * s, 0.6 * s, 0.9 * s]);
    if (o.reliquary) { b.add(p.body, 'box', 0xd8b24a, [0, 0.55 * s, -0.05 * s], [0.5 * s, 0.4 * s, 0.4 * s], null, { tn: false }); b.add(p.body, 'cone4', 0xd8b24a, [0, 0.9 * s, -0.05 * s], [0.5 * s, 0.3 * s, 0.4 * s], [0, 0.78, 0], { tn: false }); b.add(p.body, 'box', 0x8fe0ff, [0, 0.55 * s, 0.16 * s], [0.2 * s, 0.24 * s, 0.03 * s], null, glowM); }
    p.head = b.piv(p.body, 0, 0.2 * s, 0.42 * s); eyes2(b, p.head, 0.12 * s, 0.1 * s, 0.2 * s, 0.1 * s, o.eye || 0xffe14a); [1, -1].forEach((sd) => b.add(p.head, 'cyl', o.shell || 0xc0584a, [sd * 0.2 * s, 0.05 * s, 0.05 * s], [0.04 * s, 0.2 * s, 0.04 * s]));
    p.armL = b.piv(p.body, 0.6 * s, 0.1 * s, 0.3 * s); p.armR = b.piv(p.body, -0.6 * s, 0.1 * s, 0.3 * s);
    [p.armL, p.armR].forEach((a) => { b.add(a, 'cyl', o.shell || 0xc0584a, [0, -0.1 * s, 0.1 * s], [0.12 * s, 0.4 * s, 0.12 * s], [-0.6, 0, 0]); b.add(a, 'sph', o.shell || 0xc0584a, [0, -0.2 * s, 0.35 * s], [0.4 * s, 0.3 * s, 0.4 * s]); b.add(a, 'cone4', 0xf4f0e0, [0, -0.2 * s, 0.6 * s], [0.14 * s, 0.3 * s, 0.1 * s], [H2, 0, 0], { tn: false }); });
    p.legs = [];[[1, 0.2], [-1, 0.2], [1, -0.1], [-1, -0.1], [1, -0.4], [-1, -0.4]].forEach(([sd, z]) => { const l = b.piv(R, sd * 0.4 * s, 0.35 * s, z * s); b.add(l, 'cyl', o.shell || 0xc0584a, [sd * 0.15 * s, -0.12 * s, 0], [0.05 * s, 0.4 * s, 0.05 * s], [0, 0, sd * 0.9]); p.legs.push(l); });
    p.legL = p.legs[0]; p.legR = p.legs[1];
    return b.finish({ height: 1.3 * s, radius: 0.8 * s, style: 'crawl', walk: 10 });
  }

  function wormK(b, o) { worm(b, o); return b.finish({ height: 1.3 * o.s, radius: 0.7 * o.s, style: 'worm', walk: 6 }); }
  const KIND = { human: humanK, cloak: cloakK, hound: houndK, crawl: crawlK, wisp: wispK, wing: wingK, blob: blobK, eye: eyeK, plant: plantK, scream: screamK, statue: statueK, wall: wallK, obj: objK, bulk: bulkK, crab: crabK, worm: wormK };
  const MODEL5 = {
    // ===== 1. MINE ABANDONNÉE
    mine_mineur_possede: ['human', { h: 1, skin: 0x9a9a88, cloth: 0x6a5a3a, legC: 0x4a4030, hardhat: 0x8a7a3a, lamp: 1, eye: 0xffd070, weapon: 'pick', claws: 0xb0a890, limp: 1, rags: 0x5a4a30 }],
    mine_rat_galerie: ['hound', { s: 0.55, fur: 0x4a3a30, eye: 0xff6a3a, snout: 0x6a4a40, ear: 0x6a4a40 }],
    mine_chauve_souris_suie: ['wing', { s: 0.8, body: 0x1a1618, wing: 0x2a2224, eye: 0xff8a3a, ears: 1, fangs: 1, fingers: 1 }],
    mine_rampant_puits: ['crawl', { s: 1.0, tall: 1.5, legs: 4, skin: 0xa8a090, legC: 0x8a8272, face: 'human', faceC: 0xd8d0c0, arms: 1, eye: 0x111111 }],
    mine_lanterne_errante: ['wisp', { s: 1, core: 0xffb040, flame: 0xff7a20, lantern: 1, trail: 0xff9a30, orbitC: 0xffd070, orbitN: 3 }],
    mine_creuseur_aveugle: ['bulk', { s: 0.95, skin: 0x8a7860, cloth: 0x5a4a3a, legC: 0x4a3a2a, eye: 0x000000, blind: 1, drill: 1, rocks: 0x6a6258 }],
    mine_dynamiteur: ['human', { h: 0.95, skin: 0xb89a80, cloth: 0xa06030, hardhat: 0xe0c040, eye: 0xff5a2a, weapon: 'dynamite', belt: 0x3a2a20, head: 'face', pack: 0xc03030 }],
    mine_contremaitre_maudit: ['human', { h: 1.2, bw: 1.2, skin: 0x8a8a78, cloth: 0x4a4a52, hardhat: 0xd8d0c0, eye: 0xff4a4a, weapon: 'mace', plate: 0x6a6a72, cape: 0x2a2630, chains: 1 }],
    mine_mineur_dore: ['human', { h: 0.9, skin: 0xffd23f, cloth: 0xe0b040, legC: 0xc89a30, hardhat: 0xffe27a, lamp: 1, eye: 0xffffff, weapon: 'pick', weaponC: 0xffd23f, crystals: 0xfff2a0 }],
    mine_enfant_des_puits: ['human', { h: 0.62, skin: 0xe8e8f0, cloth: 0xc8c8d8, head: 'ghost', eye: 0xaaddff, rags: 0xe0e0f0 }],
    mine_hurleur_des_puits: ['scream', { s: 1.0, skin: 0xb8b0a0, cloth: 0x4a4030, eye: 0xffffff, hair: 0x3a3028 }],
    // ===== 2. FORÊT INTERDITE
    foret_rodeur_brume: ['cloak', { h: 1.15, cloth: 0x4a5a58, face: 'skull', boneC: 0xd8e0d0, eye: 0x9affc0, antlers: 1, mist: 1, mistC: 0xaab8b0, tendrils: 5, tendrilC: 0x6a7a78, ghostly: 1, claws: 0xd8e0d0 }],
    foret_loup_creux: ['hound', { s: 1.0, fur: 0x4a4a42, eye: 0x9affc0, ribs: 1, spikes: 0x6a5a40 }],
    foret_araignee_sylve: ['crawl', { s: 1.0, legs: 8, skin: 0x5a4a30, legC: 0x3a2a1a, eye: 0xff4a3a, shell: 0x6a5a38, antennae: 1 }],
    foret_spore_pleureuse: ['plant', { s: 0.8, stem: 0xd8d0b8, petal: 0x9a6a9a, bulb: 0x7a5a7a, vines: 3, eyeBud: 1, eye: 0xb6ff4a }],
    foret_corbeau_charognard: ['wing', { s: 0.9, body: 0x18181e, wing: 0x22222a, eye: 0xff4a4a, beak: 0xc0a050, fingers: 1, tailC: 0x18181e }],
    foret_epouvantail: ['statue', { kind: 'scarecrow', h: 1.1, stone: 0xa08a5a, cloth: 0x6a5a3a, eye: 0xff7a2a, tears: 0 }],
    foret_chasseur_egare: ['human', { h: 1, skin: 0xb89a80, cloth: 0x4a5a3a, legC: 0x3a3a28, head: 'hood', hoodC: 0x3a4a2a, eye: 0xffdd77, weapon: 'bow', cape: 0x2a3a20, rags: 0x4a5a3a }],
    foret_ent_pourri: ['bulk', { s: 1.25, skin: 0x5a4a38, cloth: 0x4a3a2a, legC: 0x3a2a1a, eye: 0xb6ff4a, bark: 0x6a5a40, leaves: 0x5a7a3a, rocks: 0x6a8a4a }],
    foret_cerf_blanc: ['hound', { s: 1.3, fur: 0xf4f0e8, eye: 0xaaddff, antlers: 1, ear: 0xf4f0e8, snout: 0xe8e0d0, leg: 0xe8e0d0, paw: 0xd8d0c0, flame: 0xcfeaff }],
    foret_fee_noire: ['wisp', { s: 0.7, core: 0x6a2a9a, wings: 0xb44dff, trail: 0x6a2a9a, orbitC: 0xd8a0ff, orbitN: 4 }],
    foret_traqueur_cornu: ['hound', { s: 1.35, fur: 0x4a4038, eye: 0xff4a2a, skullFace: 1, antlers: 1, ribs: 1, boneC: 0xd8d0b8, leg: 0x3a3228 }],
    // ===== 3. CATACOMBES
    cata_squelette_niche: ['human', { h: 1, head: 'skull', skin: 0xe8e2d0, cloth: 0xd8d0b8, legC: 0xe0d8c0, armC: 0xe8e2d0, ribs: 1, eye: 0xff4a2a, weapon: 'sword', weaponC: 0x8a8070, rags: 0x6a5a40 }],
    cata_goule: ['crawl', { s: 1.1, tall: 1.2, legs: 4, skin: 0x8a9a7a, legC: 0x7a8a6a, face: 'human', faceC: 0xb8c0a8, arms: 1, eye: 0xffee55 }],
    cata_ossuaire_rampant: ['crawl', { s: 0.8, legs: 8, skin: 0xe0d8c0, legC: 0xe8e0c8, shell: 0xd0c8b0, eye: 0xff4a2a, spikes: 0xe8e0c8 }],
    cata_pleureuse: ['cloak', { h: 1, cloth: 0x4a4a68, face: 'veil', veilC: 0xe0e0f0, eye: 0xaaddff, ghostly: 1, mist: 1, mistC: 0x8a8ab0, claws: 0xe0e0f0 }],
    cata_rat_cadavre: ['hound', { s: 0.65, fur: 0xd0c0b0, eye: 0xff4a4a, snout: 0xe0b0a0, ear: 0xe0b0a0, leg: 0xc0a090, ribs: 1 }],
    cata_lanceur_os: ['human', { h: 1, head: 'skull', skin: 0xd8d0b8, cloth: 0x4a4038, legC: 0xd8d0b8, armC: 0xd8d0b8, eye: 0x7affd8, weapon: 'knife', weaponC: 0xe8e0c8, hood: 0, hoodC: 0x4a4038, rags: 0x4a4038 }],
    cata_porteur_cercueil: ['human', { h: 1.15, bw: 1.2, skin: 0xa8a090, cloth: 0x2a2630, legC: 0x2a2630, head: 'hood', hoodC: 0x2a2630, eye: 0xffaa55, coffin: 1, shield: 0x5a4a30 }],
    cata_gardien_ossuaire: ['human', { h: 1.4, bw: 1.3, head: 'skull', skin: 0xe8e2d0, cloth: 0x5a5048, legC: 0xd8d0b8, armC: 0xe8e2d0, ribs: 1, eye: 0xff2a2a, crown: 0xd8d0b8, weapon: 'mace', weaponC: 0xcfc8b0, plate: 0xd8d0b8, spikes: 0xe8e0c8 }],
    cata_crane_dore: ['wisp', { s: 0.8, skull: 0xffd23f, core: 0xfff2a0, orbitC: 0xffd23f, orbitN: 3, flame: 0xffe27a }],
    cata_moine_sans_visage: ['human', { h: 1.05, skin: 0xd8d0c0, cloth: 0x5a4a3a, robe: 0x5a4a3a, head: 'blank', eye: 0xffee55, weapon: 'candle', rags: 0x4a3a2a }],
    cata_ame_voleuse: ['wisp', { s: 0.8, core: 0x9fd8ff, flame: 0x6a9aff, trail: 0x6a9aff, orbitC: 0xd8f0ff, orbitN: 5, wings: 0x9fd8ff }],
    possede_cadavre: ['human', { h: 1.05, skin: 0x8a8a8a, cloth: 0x5a5058, legC: 0x4a4048, head: 'face', eye: 0x6ab0ff, longArms: 1.2, claws: 0xb0b0b0, rags: 0x4a4048, drip: 0x6ab0ff }],
    // ===== 4. CHÂTEAU
    chateau_armure_hantee: ['human', { h: 1.2, bw: 1.2, head: 'helm', cloth: 0x8892a4, skin: 0x8892a4, legC: 0x6a7284, boot: 0x4a5062, armC: 0x8892a4, torso: 'box', eye: 0x7affd8, plate: 0x9aa4b6, weapon: 'sword', weaponC: 0xb0b8c8, shield: 0x4a5062 }],
    chateau_servante_spectrale: ['cloak', { h: 1, cloth: 0x4a4a6a, face: 'blank', skin: 0xdad8e8, hood: false, ghostly: 1, apron: 0xe8e8f0, weapon: 'candle', hand: 0xdad8e8 }],
    chateau_page_sans_tete: ['human', { h: 0.9, head: 'none', skin: 0xc8b8a0, cloth: 0x8a2a3a, legC: 0x3a2a4a, carryHead: 1, eye: 0xffee55, belt: 0xd8b24a, rags: 0x8a2a3a }],
    chateau_portrait_vivant: ['wall', { s: 1, frame: 0xb8923a, c: 0x5a4a3a, face: 0xe0c8a0, arm: 0xc8a878, eye: 0xff4a4a }],
    chateau_chandelier_ardent: ['obj', { shape: 'chandelier', s: 1, y: 1.1 }],
    chateau_rat_cour: ['hound', { s: 0.6, fur: 0x6a5a58, eye: 0xffd23f, collar: 0xf4f0e8, snout: 0x8a7a78, ear: 0x8a7a78 }],
    chateau_dogue_maudit: ['hound', { s: 1.15, fur: 0x2a2428, eye: 0xff2a2a, collar: 0x8a2a3a, spikes: 0x8a8a92, snout: 0x3a3438, ear: 0x3a3438 }],
    chateau_chevalier_noir: ['human', { h: 1.4, bw: 1.3, head: 'helm', cloth: 0x1c1c24, skin: 0x1c1c24, legC: 0x15151c, boot: 0x0c0c12, armC: 0x1c1c24, torso: 'box', eye: 0xff2a3a, plate: 0x2a2a38, weapon: 'sword', weaponC: 0x5a5a70, cape: 0x6a1a2a, horns: 1, hornC: 0x1c1c24 }],
    chateau_bouffon_rieur: ['human', { h: 0.95, skin: 0xf0e8e0, cloth: 0xc03060, legC: 0x30a0c0, head: 'jester', eye: 0xffee55, weapon: 'stick', belt: 0xffd23f, rags: 0x30a0c0 }],
    chateau_enfant_au_miroir: ['human', { h: 0.62, skin: 0xd8e0f0, cloth: 0xa8b8d8, head: 'ghost', eye: 0xffffff, rags: 0xc8d8f0 }],
    chateau_cavalier_sans_tete: ['hound', { s: 1.5, fur: 0x2a2a32, eye: 0x7affd8, ribs: 1, skullFace: 1, boneC: 0xc8c8d0, flame: 0x7affd8, rider: { cloth: 0x2a2a38, headless: 1, eye: 0x7affd8 } }],
    // ===== 5. CATHÉDRALE NOYÉE
    cathe_choriste_noye: ['human', { h: 1.05, skin: 0x7a9a98, cloth: 0xc8c8d0, robe: 0xc8c8d0, head: 'face', eye: 0xd8f0ff, weapon: 'book', algae: 0x3a6a48, drip: 0x8fe0ff, belly: 0x8aaaa8 }],
    cathe_murene_nef: ['worm', { s: 1.0, c: 0x4a6a8a, c2: 0x3a5a7a, eye: 0xd8f0ff, spikes: 0x8fe0ff }],
    cathe_pretre_noye: ['cloak', { h: 1.1, cloth: 0x3a5a78, face: 'skull', boneC: 0xb8d0d0, eye: 0x8fe0ff, mitre: 0x6a8aa8, ghostly: 1, weapon: 'bell', hood: false, tendrils: 4, tendrilC: 0x4a7a6a }],
    cathe_crabe_reliquaire: ['crab', { s: 1.2, shell: 0x5a7a8a, reliquary: 1, eye: 0xd8f0ff }],
    cathe_meduse_cierge: ['obj', { shape: 'jelly', s: 0.9, c: 0xa8d8ee, y: 1.0 }],
    cathe_ange_pleureur: ['statue', { kind: 'angel', h: 1.25, stone: 0xb8c4cc, tears: 1, cracks: 0x8fe0ff }],
    cathe_eveque_abysses: ['cloak', { h: 1.4, wide: 1.2, cloth: 0x1a3a5a, face: 'skull', boneC: 0xd0e0e0, eye: 0x8fe0ff, mitre: 0x3a7a9a, crown: 0x8fe0ff, tendrils: 7, tendrilC: 0x3a7a8a, weapon: 'stick', ghostly: 1, hood: false }],
    cathe_perle_vivante: ['obj', { shape: 'pearl', s: 0.9, c: 0x1a1a2a, y: 0.7 }],
    cathe_sonneur_noye: ['human', { h: 1.0, skin: 0x7a9a98, cloth: 0x4a5a6a, robe: 0x4a5a6a, head: 'hood', hoodC: 0x3a4a5a, eye: 0xd8f0ff, weapon: 'bell', offhand: 'chain', algae: 0x3a6a48 }],
    cathe_etreinte_des_eaux: ['worm', { s: 1.3, c: 0x3a5a6a, c2: 0x2a4a5a, eye: 0xd8f0ff }],
    // ===== 6. TEMPLE SANGLANT
    temple_acolyte_saignant: ['human', { h: 1, skin: 0xc09080, cloth: 0x8a1a2a, robe: 0x8a1a2a, head: 'hood', hoodC: 0x6a1020, eye: 0xff3a3a, weapon: 'knife', weaponC: 0xcfd6e6, drip: 0xc01030 }],
    temple_flagellant: ['human', { h: 1.05, skin: 0xb07a68, cloth: 0x4a2a20, legC: 0x6a2a20, head: 'bag', eye: 0xff3a3a, weapon: 'whip', chains: 1, bandage: 0xc8b8a0 }],
    temple_pretresse_hemorragie: ['cloak', { h: 1.1, cloth: 0x8a1a2a, face: 'mask', maskC: 0xe8d8c0, eye: 0xff3a3a, ghostly: 0, weapon: 'ball', weaponC: 0xff2a3a, ring: 0xff3a3a, sash: 0xffd23f }],
    temple_chien_sacrificiel: ['hound', { s: 0.85, fur: 0xa03a3a, eye: 0xffd23f, ribs: 1, boneC: 0xe8c8b8, snout: 0xc05a50, collar: 0xffd23f }],
    temple_masque_d_or: ['human', { h: 1.3, bw: 1.2, skin: 0xd8b24a, cloth: 0xb8923a, legC: 0x9a7a2a, boot: 0x7a5a1a, armC: 0xd8b24a, head: 'mask', maskC: 0xffe27a, eye: 0xff3a3a, plate: 0xe0b040, torso: 'box', weapon: 'mace', weaponC: 0xd8b24a }],
    temple_sangsue_geante: ['worm', { s: 0.95, c: 0x6a1a2a, c2: 0x4a1020, eye: 0xffd23f, spikes: 0xff3a3a }],
    temple_porte_lame: ['human', { h: 1, skin: 0xb09080, cloth: 0x2a2024, legC: 0x3a2a2a, head: 'mask', maskC: 0x8a1a2a, eye: 0xffd23f, weapon: 'knife', offhand: 'knife', cape: 0x6a1020, belt: 0xcfd6e6 }],
    temple_bourreau: ['human', { h: 1.4, bw: 1.35, skin: 0xb07a68, cloth: 0x2a1a1a, legC: 0x1a1214, head: 'bag', eye: 0xff3a3a, weapon: 'axe', weaponC: 0xcfd6e6, belt: 0x6a4a30, drip: 0xc01030, spikes: 0x6a6a72 }],
    temple_idole_doree: ['statue', { kind: 'idol', h: 1.3, stone: 0xffd23f, eye: 0xff3a3a, cracks: 0xffffff }],
    temple_oracle_aveugle: ['cloak', { h: 1.05, cloth: 0xe8e0d0, face: 'blank', skin: 0xe8e0d0, hood: false, ghostly: 1, stars: 3, starC: 0xff7a7a, hand: 0xe8e0d0 }],
    temple_boucher_sacre: ['human', { h: 1.55, bw: 1.5, skin: 0xc09080, cloth: 0xc8c0b8, legC: 0x4a3a30, head: 'bag', eye: 0xff2a2a, weapon: 'cleaver', weaponC: 0xcfd6e6, apron: 0xa02020, drip: 0xc01030, belly: 0xc09080 }],
    // ===== 7. ASILE
    asile_patient_fracture: ['human', { h: 1, skin: 0xd8d0d8, cloth: 0xe8e8f0, legC: 0xe8e8f0, head: 'face', eye: 0xb44dff, longArms: 1.2, core: 0xb44dff, rags: 0xe8e8f0, drip: 0xb44dff }],
    asile_infirmiere_sans_visage: ['human', { h: 1.1, skin: 0xe8e0d8, cloth: 0xd8e8f0, robe: 0xd8e8f0, head: 'cap', faceless: 1, eye: 0x111111, weapon: 'needle', apron: 0xb8c8d8, drip: 0xc01030 }],
    asile_camisole: ['human', { h: 1.25, bw: 1.35, skin: 0xd8d0c8, cloth: 0xe8e0d0, legC: 0xd8d0c0, head: 'bag', eye: 0xff4a4a, belt: 0x6a6a72, chains: 1, rags: 0xe8e0d0 }],
    asile_echo_hurlant: ['scream', { s: 1.1, skin: 0xd0d8e8, cloth: 0xb0b8d0, eye: 0xb44dff, hair: 0x6a6a90, rings: 0xb44dff }],
    asile_ombre_sous_le_lit: ['crawl', { s: 1.0, tall: 1.3, legs: 4, skin: 0x1a1224, legC: 0x2a1a38, face: 'hands', eye: 0xb44dff, arms: 1, hair: 0x120a1c }],
    asile_docteur_aiguilles: ['human', { h: 1.1, skin: 0xe0d0c0, cloth: 0xe8f0f0, robe: 0xe8f0f0, head: 'mask', maskC: 0xd8e8e0, eye: 0xffee55, weapon: 'needle', offhand: 'needle', belt: 0x6a6a72, longArms: 1.15 }],
    asile_poupee_recousue: ['human', { h: 0.65, skin: 0xe8d8c8, cloth: 0xc8a8b8, legC: 0xb8a8c8, head: 'face', eye: 0x111111, rags: 0xe8d8c8, belly: 0xe8d8c8 }],
    asile_gardien_camisole: ['human', { h: 1.5, bw: 1.5, skin: 0xd8d0c8, cloth: 0x4a4a58, legC: 0x3a3a48, head: 'helm', helmC: 0x5a5a68, eye: 0xb44dff, weapon: 'mace', weaponC: 0xb44dff, plate: 0x6a6a78, belt: 0xd8b24a, chains: 1 }],
    asile_dossier_vivant: ['obj', { shape: 'folder', s: 1, c: 0xc8a868, y: 1.0 }],
    asile_patient_zero: ['human', { h: 1.0, skin: 0xe8e0e8, cloth: 0xe0e0f0, head: 'face', eye: 0xb44dff, core: 0xb44dff, crystals: 0xb44dff, rags: 0xe0e0f0, halo: 0xb44dff }],
    asile_marcheur_du_couloir: ['human', { h: 1.5, skin: 0xe0d8d0, cloth: 0x2a2a32, legC: 0x1a1a22, head: 'blank', eye: 0xffffff, longArms: 1.5, claws: 0xe0d8d0, extraH: 0.4 }],
    // ===== 8. BIBLIOTHÈQUE
    biblio_grimoire_mordeur: ['obj', { shape: 'book', s: 1, c: 0x6a2a4a, y: 0.9 }],
    biblio_lecteur_noye: ['human', { h: 1.05, skin: 0x7a8a98, cloth: 0x5a4a6a, legC: 0x3a3a4a, head: 'face', eye: 0xb6a0ff, weapon: 'book', algae: 0x3a6a58, drip: 0x6a8aff, hair: 0x3a3a48, belly: 0x7a8a98 }],
    biblio_encre_vivante: ['blob', { s: 1.0, c: 0x120a2a, c2: 0x2a1a4a, eyesN: 3, eye: 0xb6a0ff, eyeGlow: 1, tent: 5, op: 0.95 }],
    biblio_page_tranchante: ['obj', { shape: 'page', s: 1, y: 0.9 }],
    biblio_gardien_silence: ['cloak', { h: 1.4, cloth: 0x3a3a48, face: 'blank', skin: 0xe0e0e8, hood: false, ghostly: 1, claws: 0xe0e0e8, mist: 1, mistC: 0x6a6a80, extraH: 0.3 }],
    biblio_scribe_spectral: ['cloak', { h: 1, cloth: 0x5a4a78, face: 'skull', boneC: 0xd8d0e8, eye: 0xb6a0ff, ghostly: 1, weapon: 'quill', stars: 3, starC: 0xf4f0e0 }],
    biblio_conservateur: ['cloak', { h: 1.4, wide: 1.2, cloth: 0x4a2a4a, face: 'mask', maskC: 0xd8c8a0, eye: 0xb6a0ff, hat: 0x2a1a3a, weapon: 'book', stars: 5, starC: 0xf2e6c4, ring: 0xb6a0ff }],
    biblio_livre_dore: ['obj', { shape: 'book', s: 1.1, c: 0xd8b24a, gold: 1, y: 0.95 }],
    biblio_lectrice_eternelle: ['cloak', { h: 1.05, cloth: 0x8a7a98, face: 'veil', veilC: 0xe8e0f0, eye: 0xffd23f, ghostly: 1, weapon: 'book', hood: false }],
    biblio_ombre_du_rayonnage: ['cloak', { h: 1.2, cloth: 0x0c0a14, face: 'none', eye: 0xb6a0ff, ghostly: 1, tendrils: 6, tendrilC: 0x14101e, mist: 1, mistC: 0x1a1428, claws: 0x2a2038 }],
    // ===== 9. NÉCROPOLE
    necropole_momie_givre: ['human', { h: 1.1, skin: 0xcfe0ea, cloth: 0xb8c8d4, legC: 0xb8c8d4, armC: 0xb8c8d4, bandage: 0xe0eaf0, head: 'blank', eye: 0x8fe0ff, rags: 0xe0eaf0, claws: 0xcfe0ea }],
    necropole_veilleur_gele: ['human', { h: 1.3, bw: 1.2, head: 'helm', cloth: 0x9fd8ee, skin: 0x9fd8ee, legC: 0x8ac8e0, boot: 0x7ab8d0, armC: 0x9fd8ee, torso: 'box', eye: 0xffffff, plate: 0xb8e8f8, weapon: 'spear', weaponC: 0xcfeaff, crystals: 0xcfeaff }],
    necropole_loup_spectral: ['hound', { s: 1.1, fur: 0xb8d8ee, eye: 0xffffff, ghost: 1, ribs: 1, boneC: 0xe8f4ff, spikes: 0x8fe0ff, spikeGlow: 1 }],
    necropole_pleureuse_givre: ['cloak', { h: 1.1, cloth: 0x7ab0d0, face: 'veil', veilC: 0xe8f4ff, eye: 0x8fe0ff, ghostly: 1, mist: 1, mistC: 0xcfeaff, claws: 0xe8f4ff, ring: 0x8fe0ff }],
    necropole_corbeau_givre: ['wing', { s: 0.95, body: 0x6a8aa8, wing: 0x8ab0c8, eye: 0xffffff, beak: 0xcfeaff, fingers: 1, glowBody: 0x8fe0ff }],
    necropole_chevalier_fige: ['human', { h: 1.35, bw: 1.35, head: 'helm', cloth: 0x6a8aa0, skin: 0x6a8aa0, legC: 0x5a7a90, boot: 0x4a6a80, armC: 0x6a8aa0, torso: 'box', eye: 0x8fe0ff, plate: 0x8ab0c8, shield: 0x9fd8ee, weapon: 'sword', weaponC: 0xcfeaff, cape: 0xb8d8ee }],
    necropole_larve_glace: ['crawl', { s: 0.7, legs: 2, segs: 2, skin: 0xcfeaff, skin2: 0x9fd8ee, legC: 0x9fd8ee, eye: 0x1a3a5a, spikes: 0x8fe0ff }],
    necropole_gardien_tombe: ['human', { h: 1.55, bw: 1.5, head: 'helm', cloth: 0x5a7a90, skin: 0x5a7a90, legC: 0x4a6a80, boot: 0x3a5a70, armC: 0x5a7a90, torso: 'box', eye: 0xffffff, plate: 0x7aa0b8, shield: 0xcfd8e0, weapon: 'mace', weaponC: 0xcfeaff, crystals: 0xcfeaff, crown: 0x8fe0ff }],
    necropole_ame_cristal: ['wisp', { s: 0.9, core: 0x8fe0ff, crystal: 0xcfeaff, trail: 0x8fe0ff, orbitC: 0xffffff, orbitN: 4, orbitG: 'oct' }],
    necropole_reine_endormie: ['cloak', { h: 1.2, wide: 1.2, cloth: 0xcfeaff, face: 'blank', skin: 0xe8f4ff, hood: false, crown: 0xcfeaff, ghostly: 1, ring: 0x8fe0ff, mist: 1, mistC: 0xe8f4ff }],
    necropole_dame_blanche: ['cloak', { h: 1.3, cloth: 0xf0f4ff, face: 'veil', veilC: 0xffffff, eye: 0x8fe0ff, ghostly: 1, tendrils: 6, tendrilC: 0xe8f4ff, mist: 1, mistC: 0xffffff, claws: 0xffffff }],
    // ===== 10. JARDIN DE CHAIR
    jardin_fleur_dents: ['plant', { s: 1.1, stem: 0x8a3a4a, petal: 0xd04060, bulb: 0xa03a4a, vines: 4, thorns: 0x3a1a20 }],
    jardin_jardinier: ['human', { h: 1.15, skin: 0xb88a78, cloth: 0x5a6a3a, legC: 0x4a3a28, head: 'face', eye: 0xb6ff4a, hair: 0x4a5a2a, weapon: 'shears', weaponC: 0xcfd6e6, apron: 0x7a5a3a, algae: 0x4a7a3a, bandage: 0xc8a090 }],
    jardin_vigne_veine: ['wall', { s: 1, vine: 0x6a2a3a, c: 0xc03060, face: 0xe08aa0, arm: 0x8a2a4a, eye: 0xffd23f }],
    jardin_bourgeon_oeil: ['plant', { s: 0.9, stem: 0x8a3a5a, bulb: 0xc03060, eyeBud: 1, petal: 0xd04a70, eye: 0xb6ff4a, vines: 3, flesh: 0xe08aa0 }],
    jardin_essaim_mouches: ['wing', { s: 0.55, body: 0x2a3a1a, wing: 0xc8e0a0, wingOp: 0.55, eye: 0xff4a4a, legsN: 4, glowBody: 0x7cc82a }],
    jardin_epouvantail_chair: ['statue', { kind: 'scarecrow', h: 1.2, stone: 0xc08a8a, cloth: 0xa04a5a, eye: 0xb6ff4a }],
    jardin_racine_mere: ['crawl', { s: 0.8, legs: 6, skin: 0x7a3a2a, legC: 0x5a2a1a, shell: 0x6a4a2a, eye: 0xb6ff4a, spikes: 0xc03060 }],
    jardin_greffe: ['bulk', { s: 1.3, skin: 0xc08a8a, cloth: 0x8a4a5a, legC: 0x6a3a3a, eye: 0xb6ff4a, bark: 0x6a4a2a, lava: 0xc03060, leaves: 0x7cc82a, rocks: 0x9a4a5a }],
    jardin_rose_noire: ['plant', { s: 1.0, stem: 0x1a2a1a, petal: 0x2a1a30, bulb: 0x120a1a, vines: 3, thorns: 0xffd23f }],
    jardin_dryade_ecorchee: ['cloak', { h: 1.15, cloth: 0x8a3a4a, face: 'blank', skin: 0xe08aa0, hood: false, ghostly: 0, tendrils: 5, tendrilC: 0x5a7a3a, hand: 0xe08aa0, claws: 0x5a7a3a, crown: 0x7cc82a }],
    jardin_gueule_souterraine: ['worm', { s: 1.6, c: 0x8a3a4a, c2: 0x6a2a3a, eye: 0xb6ff4a, spikes: 0x7cc82a }],
    // ===== 11. ABÎME
    abime_damne_enchaine: ['human', { h: 1.15, skin: 0x5a3a3a, cloth: 0x2a1a1a, legC: 0x3a2020, head: 'face', eye: 0xff7a2a, chains: 1, longArms: 1.2, claws: 0x3a2020, core: 0xff5a1a, bandage: 0x2a1a1a }],
    abime_diablotin_braise: ['human', { h: 0.8, skin: 0xc03a2a, cloth: 0x8a2a1a, legC: 0x7a2418, head: 'face', eye: 0xffd23f, horns: 1, wings: 0x8a1a10, tail: 0xc03a2a, weapon: 'ball', weaponC: 0xff7a2a }],
    abime_chien_enfers: ['hound', { s: 1.2, fur: 0x2a1a18, eye: 0xff7a2a, flame: 0xff5a1a, spikes: 0xff7a2a, spikeGlow: 1, snout: 0x3a2420, ear: 0x3a2420 }],
    abime_chainier: ['human', { h: 1.2, bw: 1.2, skin: 0x7a2a2a, cloth: 0x2a1a1a, legC: 0x2a1a1a, head: 'helm', helmC: 0x3a2a2a, eye: 0xff7a2a, chains: 1, weapon: 'chain', offhand: 'chain', plate: 0x4a3a3a }],
    abime_ame_brulante: ['wisp', { s: 0.7, core: 0xff7a2a, flame: 0xffd23f, trail: 0xff5a1a, skull: 0x3a2a2a }],
    abime_veuve_cendre: ['cloak', { h: 1.2, cloth: 0x4a4a4a, face: 'skull', boneC: 0xc8c0b8, eye: 0xff7a2a, hood: false, ghostly: 1, tendrils: 6, tendrilC: 0x6a5a5a, mist: 1, mistC: 0x6a6a6a, claws: 0x8a8a8a }],
    abime_colosse_lave: ['bulk', { s: 1.4, skin: 0x2a2020, cloth: 0x3a2a2a, legC: 0x2a1a1a, eye: 0xffd23f, lava: 0xff7a2a, rocks: 0x4a3a3a, horns: 1 }],
    abime_geolier: ['human', { h: 1.55, bw: 1.4, skin: 0x7a2a2a, cloth: 0x1a1214, legC: 0x2a1a1a, head: 'helm', helmC: 0x2a1a1a, eye: 0xff7a2a, horns: 1, weapon: 'keys', offhand: 'chain', plate: 0x3a2a2a, cape: 0x6a1a10 }],
    abime_salamandre_or: ['hound', { s: 0.9, fur: 0xffd23f, eye: 0xff2a2a, leg: 0xe0b040, paw: 0xc89a30, snout: 0xffe27a, ear: 0xffe27a, flame: 0xffe27a }],
    abime_ange_dechu: ['human', { h: 1.2, skin: 0xe0d8e0, cloth: 0x1a1a24, legC: 0x15151c, head: 'face', eye: 0xffffff, wings: 0x15151c, chains: 1, halo: 0x8a8a98, hair: 0x2a2a38 }],
    abime_traqueur_braise: ['hound', { s: 1.6, fur: 0x1a1214, eye: 0xff5a1a, flame: 0xff5a1a, skullFace: 1, boneC: 0x4a3a3a, spikes: 0xff7a2a, spikeGlow: 1, ribs: 1 }],
    // ===== 12. OBSERVATOIRE
    obs_astronome_vide: ['cloak', { h: 1.25, cloth: 0x14102a, face: 'none', eye: 0xb6a0ff, stars: 6, starC: 0xffffff, ring: 0xb6a0ff, hand: 0x2a2048, weapon: 'ball', weaponC: 0xb6a0ff, hood: true }],
    obs_etoile_morte: ['obj', { shape: 'star', s: 1.0, c: 0x6a3a9a, y: 0.9 }],
    obs_oeil_neant: ['eye', { s: 1.0, iris: 0xb44dff, veins: 1, tent: 5, tentC: 0x2a1a4a, orbitN: 3, orbitC: 0xb6a0ff }],
    obs_engrenage_vivant: ['obj', { shape: 'gear', s: 1.2, c: 0xb8a070, y: 0.9 }],
    obs_marcheur_entre_mondes: ['human', { h: 1.25, skin: 0x2a2048, cloth: 0x14102a, legC: 0x0c0a1e, head: 'hood', hoodC: 0x14102a, eye: 0xb6a0ff, weapon: 'sword', weaponC: 0xb6a0ff, cape: 0x2a1a4a, core: 0xb44dff, halo: 0xb6a0ff }],
    obs_ombre_constellation: ['cloak', { h: 1.35, cloth: 0x0a0818, face: 'none', eye: 0xffffff, ghostly: 1, stars: 8, starC: 0xffffff, tendrils: 5, tendrilC: 0x14102a, claws: 0x2a2048, mist: 1, mistC: 0x14102a }],
    obs_fragment_neant: ['obj', { shape: 'shard', s: 0.9, c: 0x8a4fd0, y: 0.9 }],
    obs_gardien_orbite: ['bulk', { s: 1.45, skin: 0x2a2048, cloth: 0x3a2a68, legC: 0x1a1438, eye: 0xb6a0ff, rings: 0xb6a0ff, horns: 0, shield: 0x4a3a88 }],
    obs_comete_errante: ['obj', { shape: 'comet', s: 0.9, c: 0x9fd8ff, y: 0.7 }],
    obs_premier_eveille: ['human', { h: 1.15, skin: 0xc8c0d0, cloth: 0x3a3a58, legC: 0x2a2a48, head: 'hood', hoodC: 0x3a3a58, eye: 0xffffff, weapon: 'bow', cape: 0x2a2a48, halo: 0xb6a0ff, belt: 0xd8b24a }],
    obs_regard_fixe: ['eye', { s: 1.2, iris: 0xff4a6a, veins: 1, stone: 0x6a6a78, ring: 0x6a6a78 }],
    // ===== 13. FOIRE
    foire_pantin_ficelle: ['human', { h: 0.95, skin: 0xd8b888, cloth: 0xc03060, legC: 0x30a0c0, head: 'clown', eye: 0x111111, strings: 1, longArms: 1.25, belt: 0xffd23f, hairC: 0xffd23f }],
    foire_clown_triste: ['human', { h: 1.1, bw: 1.15, skin: 0xf0e8e0, cloth: 0x4a60c0, legC: 0xc03060, head: 'clown', eye: 0x2a4a8a, drip: 0x8fe0ff, belt: 0xffd23f, belly: 0x4a60c0, hairC: 0x4a60c0 }],
    foire_lanceur_couteaux: ['human', { h: 1.05, skin: 0xe0c8a8, cloth: 0xc03030, legC: 0x2a2a38, head: 'mask', maskC: 0xf4f0e8, eye: 0xffd23f, weapon: 'knife', offhand: 'knife', belt: 0xcfd6e6, cape: 0x2a2a38 }],
    foire_ballon_rieur: ['obj', { shape: 'balloon', s: 1.0, c: 0xe83a4a, y: 1.2 }],
    foire_cheval_de_bois: ['hound', { s: 1.4, fur: 0xf4e8c8, eye: 0xc03030, wood: 1, snout: 0xe8d8b0, ear: 0xe8d8b0, leg: 0xe8d8b0, collar: 0xd8b24a, spikes: 0xc03060 }],
    foire_marionnettiste_ombre: ['cloak', { h: 1.35, cloth: 0x1a1428, face: 'none', eye: 0xffd23f, strings: 1, claws: 0x3a2a48, hat: 0x1a1428, tendrils: 4, tendrilC: 0x2a1a38 }],
    foire_monsieur_loyal: ['human', { h: 1.45, bw: 1.25, skin: 0xe0c8a8, cloth: 0xc02030, legC: 0x1a1418, head: 'top', eye: 0xffd23f, weapon: 'whip', cape: 0x1a1418, belt: 0xffd23f, plate: 0xffd23f }],
    foire_ticket_dore: ['obj', { shape: 'ticket', s: 1.0, c: 0xffd23f, y: 0.9 }],
    foire_diseuse_aventure: ['cloak', { h: 1.05, cloth: 0x6a2a8a, face: 'veil', veilC: 0xffd23f, eye: 0xffd23f, hood: true, weapon: 'ball', weaponC: 0xb6a0ff, stars: 4, starC: 0xffd23f }],
    foire_ombre_du_chapiteau: ['crawl', { s: 1.2, tall: 1.6, legs: 4, skin: 0x2a1a2a, legC: 0xc03060, face: 'human', faceC: 0xf0e8e0, arms: 1, eye: 0xffd23f, hair: 0xc03060 }],
  };
  Object.keys(MODEL5).forEach((id) => { const [k, o] = MODEL5[id]; reg(id, (b) => KIND[k](b, Object.assign({}, o))); });

  G.MonsterModels = { ids: REG, anim, model5: MODEL5, archetypes: KIND };
})();
