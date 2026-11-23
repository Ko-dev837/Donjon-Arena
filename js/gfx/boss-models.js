/* =====================================================================
 *  Donjon Arena 3D v3 — Rôle 10 : modèles de boss (style toon de graphics.js)
 *  G.GFX.registerModel('boss', id, build) pour chaque nouveau boss + 'enemy' pour les adds de mécaniques.
 *  Chaque modèle : Group regardant +Z, pieds en y=0, userData:
 *    { mats, eyes:[mats émissifs], parts:{...}, height, radius, isBoss, animate(time,{moving,windup,attack}), runeMats? }
 *  animateCharacter() ne gère pas ces modèles : G.BossAttacks appelle userData.animate lui-même
 *  (game.js peut aussi l'appeler : voir « Demandes aux autres »).
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  const T = THREE;
  const PI = Math.PI, TAU = PI * 2;
  const lerp = (a, b, k) => a + (b - a) * k;
  let GE = null;
  function geos() {
    if (GE) return GE;
    GE = {
      box: new T.BoxGeometry(1, 1, 1), sph: new T.SphereGeometry(1, 14, 10), cyl: new T.CylinderGeometry(1, 1, 1, 12),
      cone: new T.ConeGeometry(1, 1, 10), octa: new T.OctahedronGeometry(1), dode: new T.DodecahedronGeometry(1),
      ico: new T.IcosahedronGeometry(1), tor: new T.TorusGeometry(1, 0.12, 6, 20), tet: new T.TetrahedronGeometry(1),
    };
    Object.keys(GE).forEach((k) => { GE[k].userData.shared = true; });   // cache partagé entre boss/runs : game.js ne doit jamais le libérer
    return GE;
  }
  function toon(c, o) { return G.GFX && G.GFX.toon ? G.GFX.toon(c, o) : new T.MeshLambertMaterial(Object.assign({ color: c }, o && o.emissive != null ? { emissive: o.emissive } : {})); }

  /** contexte de construction */
  function ctx() {
    const root = new T.Group();
    const c = {
      root, mats: [], eyes: [], parts: {}, runeMats: [],
      add(parent, g, color, pos, scale, o) {
        o = o || {};
        const mat = toon(color, o.glow ? { emissive: color, emissiveIntensity: o.glow === true ? 1.4 : o.glow } : (o.opacity ? { opacity: o.opacity } : undefined));
        const m = new T.Mesh(geos()[g], mat);
        if (pos) m.position.set(pos[0], pos[1], pos[2]);
        if (typeof scale === 'number') m.scale.setScalar(scale); else if (scale) m.scale.set(scale[0], scale[1], scale[2]);
        if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
        if (o.glow || o.noOutline) m.userData.noOutline = true;
        m.castShadow = !o.glow;
        parent.add(m);
        c.mats.push(mat);
        if (o.eye) c.eyes.push(mat);
        if (o.rune) c.runeMats.push(mat);
        return m;
      },
      joint(parent, name, pos) { const j = new T.Group(); if (pos) j.position.set(pos[0], pos[1], pos[2]); parent.add(j); if (name) c.parts[name] = j; return j; },
    };
    return augment(c);
  }
  function finish(c, height, radius, animate, outline) {
    if (G.GFX && G.GFX.addOutline) G.GFX.addOutline(c.root, outline || 0.05);
    const ud = c.root.userData;
    ud.mats = c.mats; ud.eyes = c.eyes; ud.parts = c.parts; ud.height = height; ud.radius = radius;
    ud.isBoss = true; ud.runeMats = c.runeMats; ud.baseY = 0;
    ud.anim = c.anim; ud.flames = c.flames && c.flames.length ? c.flames : null; ud.shell = c.shell && c.shell.length ? c.shell : null; ud.lid = c.lid || null;
    const hasX = c.anim && (c.anim.sway.length || c.anim.spin.length || c.anim.pulse.length || c.anim.legs.length || ud.flames || ud.shell || ud.lid);
    ud.animate = (animate || hasX) ? (t, st) => { if (animate) animate(ud, t, st); if (hasX) animExtras(ud, t, st); } : null;
    return c.root;
  }

  // ------------------------------------------------------------------
  // ANIMATIONS génériques
  // ------------------------------------------------------------------
  function animHuman(ud, t, st) {
    const P = ud.parts; st = st || {};
    const w = Math.min(1, Math.max(0, st.windup || 0)), a = Math.min(1, Math.max(0, st.attack || 0));
    ud._m = (ud._m || 0) + ((st.moving ? 1 : 0) - (ud._m || 0)) * 0.15;
    const m = ud._m, ph = t * 6;
    if (P.legL) P.legL.rotation.x = Math.sin(ph) * 0.6 * m;
    if (P.legR) P.legR.rotation.x = -Math.sin(ph) * 0.6 * m;
    if (P.body) {
      P.body.position.y = (P.body.userData.y0 || 0) + Math.sin(t * 2) * 0.04 + Math.abs(Math.sin(ph)) * 0.08 * m - 0.25 * w;
      P.body.rotation.x = 0.08 * m + 0.35 * a - 0.18 * w;
      P.body.rotation.y = Math.sin(ph) * 0.08 * m - 0.3 * w + 0.4 * a;
    }
    if (P.armR) P.armR.rotation.x = lerp(lerp(-Math.sin(ph) * 0.5 * m, -2.7, w), -0.7, a);
    if (P.armL) P.armL.rotation.x = lerp(lerp(Math.sin(ph) * 0.5 * m, -1.3, w), 0.3, a);
    if (P.armR) P.armR.rotation.z = lerp(-0.12, -0.4, w);
    if (P.armL) P.armL.rotation.z = lerp(0.12, 0.4, w);
    if (P.head) P.head.rotation.x = -0.15 * w + 0.15 * a + Math.sin(t * 1.7) * 0.03;
    if (P.fx) P.fx.rotation.y = t * 0.8;
    if (P.wings) { const f = Math.sin(t * 3) * 0.12 + w * 0.5; if (P.wings.children[0]) P.wings.children[0].rotation.z = 0.3 + f; if (P.wings.children[1]) P.wings.children[1].rotation.z = -0.3 - f; }
    if (P.cape) P.cape.rotation.x = 0.1 + 0.25 * m + Math.sin(t * 2.4) * 0.05;
  }
  function animFloat(ud, t, st) {
    const P = ud.parts; st = st || {};
    const w = Math.min(1, st.windup || 0), a = Math.min(1, st.attack || 0);
    ud._m = (ud._m || 0) + ((st.moving ? 1 : 0) - (ud._m || 0)) * 0.12;
    if (P.body) { P.body.position.y = (P.body.userData.y0 || 0) + Math.sin(t * 1.6) * 0.18 + 0.25 * w; P.body.rotation.x = 0.15 * ud._m + 0.3 * a; P.body.rotation.z = Math.sin(t * 1.1) * 0.05; }
    if (P.armL) { P.armL.rotation.x = lerp(-0.3 + Math.sin(t * 2) * 0.1, -2.2, w); P.armL.rotation.z = lerp(0.3, 0.7, w); }
    if (P.armR) { P.armR.rotation.x = lerp(lerp(-0.3 + Math.sin(t * 2 + 1) * 0.1, -2.4, w), -0.6, a); P.armR.rotation.z = lerp(-0.3, -0.7, w); }
    if (P.head) P.head.rotation.y = Math.sin(t * 0.8) * 0.25;
    if (P.orbit) { P.orbit.rotation.y = t * (0.8 + w * 3); P.orbit.position.y = (P.orbit.userData.y0 || 0) + Math.sin(t * 1.3) * 0.1; }
    if (P.ring2) P.ring2.rotation.z = -t * 0.9;
  }
  function animBeast(ud, t, st) {
    const P = ud.parts; st = st || {};
    const w = Math.min(1, st.windup || 0), a = Math.min(1, st.attack || 0);
    ud._m = (ud._m || 0) + ((st.moving ? 1 : 0) - (ud._m || 0)) * 0.2;
    const ph = t * 10, m = ud._m;
    ['legFL', 'legBR'].forEach(n => { if (P[n]) P[n].rotation.x = Math.sin(ph) * 0.8 * m; });
    ['legFR', 'legBL'].forEach(n => { if (P[n]) P[n].rotation.x = -Math.sin(ph) * 0.8 * m; });
    if (P.body) { P.body.position.y = (P.body.userData.y0 || 0) + Math.abs(Math.sin(ph)) * 0.1 * m - 0.2 * w; P.body.rotation.x = -0.25 * w + 0.2 * a; }
    if (P.head) { P.head.rotation.x = 0.1 * Math.sin(t * 2) - 0.4 * w + 0.4 * a; }
    if (P.tail) P.tail.rotation.y = Math.sin(t * 4) * 0.4;
  }
  function animTentacle(ud, t, st) {
    const P = ud.parts; st = st || {};
    const w = Math.min(1, st.windup || 0), a = Math.min(1, st.attack || 0);
    (ud.tents || []).forEach((tn, i) => {
      tn.segs.forEach((s, j) => { s.rotation.z = Math.sin(t * 1.8 + i * 1.3 + j * 0.7) * (0.28 + 0.3 * w) + (tn.side * 0.12); s.rotation.x = Math.cos(t * 1.4 + i + j * 0.5) * 0.2 - 0.5 * a * (j === 0 ? 1 : 0.3); });
    });
    (ud.heads || []).forEach((h, i) => { h.rotation.x = Math.sin(t * 2 + i) * 0.15 - 0.3 * w + 0.5 * a; h.rotation.y = Math.sin(t * 1.2 + i * 2) * 0.3; });
    if (P.body) { P.body.position.y = (P.body.userData.y0 || 0) + Math.sin(t * 1.5) * 0.08 - 0.15 * w; P.body.scale.y = 1 + 0.06 * Math.sin(t * 3) + 0.1 * a; }
  }

  // ------------------------------------------------------------------
  // HUMANOÏDE paramétrable
  // ------------------------------------------------------------------
  function humanoid(o) {
    const c = ctx(), s = o.scale || 1;
    const p = Object.assign({ skin: 0x8a8f9c, dark: 0x4a4f5a, trim: 0xcaa84a, cloth: 0x7a2a2a, glow: 0xff5a3a, eye: 0xff3a2a }, o.pal || {});
    const body = c.joint(c.root, 'body', [0, 1.55 * s, 0]); body.userData.y0 = 1.55 * s;
    const heavy = o.heavy || 1;
    for (const [n, x] of [['legL', 0.42], ['legR', -0.42]]) {
      const l = c.joint(c.root, n, [x * s * heavy, 1.5 * s, 0]);
      c.add(l, 'box', p.dark, [0, -0.7 * s, 0], [0.5 * s * heavy, 1.4 * s, 0.55 * s * heavy]);
      c.add(l, 'box', p.skin, [0, -1.38 * s, 0.12 * s], [0.62 * s * heavy, 0.28 * s, 0.85 * s * heavy]);
    }
    c.add(body, 'box', p.skin, [0, 0.45 * s, 0], [1.5 * s * heavy, 1.4 * s, 0.95 * s * heavy]);
    c.add(body, 'box', p.dark, [0, -0.35 * s, 0], [1.1 * s * heavy, 0.4 * s, 0.8 * s * heavy]);
    c.add(body, 'box', p.trim, [0, 0.05 * s, 0.5 * s * heavy], [0.4 * s, 0.9 * s, 0.1 * s], { glow: o.chestGlow ? 1.1 : 0 });
    if (o.chestGlow) c.add(body, 'octa', p.glow, [0, 0.55 * s, 0.55 * s * heavy], 0.22 * s, { glow: 1.8 });
    for (const [x] of [[1], [-1]]) c.add(body, 'sph', p.dark, [x * 0.95 * s * heavy, 1.05 * s, 0], [0.5 * s * heavy, 0.38 * s, 0.5 * s * heavy]);
    for (const [n, x] of [['armL', 1], ['armR', -1]]) {
      const a = c.joint(body, n, [x * 1.0 * s * heavy, 0.95 * s, 0]);
      c.add(a, 'box', p.skin, [0, -0.6 * s, 0], [0.4 * s * heavy, 1.2 * s, 0.4 * s * heavy]);
      c.add(a, 'box', p.dark, [0, -1.3 * s, 0.05 * s], [0.52 * s * heavy, 0.5 * s, 0.52 * s * heavy]);
    }
    const head = c.joint(body, 'head', [0, 1.55 * s, 0.05 * s]);
    c.add(head, 'box', p.skin, [0, 0, 0], [0.72 * s, 0.7 * s, 0.7 * s]);
    for (const x of [-1, 1]) c.add(head, 'box', p.eye, [x * 0.18 * s, 0.05 * s, 0.36 * s], [0.16 * s, 0.08 * s, 0.05 * s], { glow: 2.2, eye: true });
    const hd = o.head || 'helm';
    if (hd === 'horns') for (const x of [-1, 1]) c.add(head, 'cone', p.trim, [x * 0.36 * s, 0.45 * s, 0], [0.12 * s, 0.7 * s, 0.12 * s], { rot: [0, 0, -x * 0.5] });
    if (hd === 'crown') { c.add(head, 'cyl', p.trim, [0, 0.42 * s, 0], [0.42 * s, 0.2 * s, 0.42 * s]); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.add(head, 'cone', p.trim, [Math.sin(a) * 0.4 * s, 0.68 * s, Math.cos(a) * 0.4 * s], [0.07 * s, 0.3 * s, 0.07 * s]); } }
    if (hd === 'helm') { c.add(head, 'box', p.dark, [0, 0.3 * s, 0], [0.8 * s, 0.3 * s, 0.78 * s]); c.add(head, 'box', p.trim, [0, 0.55 * s, -0.05 * s], [0.12 * s, 0.35 * s, 0.6 * s]); }
    if (hd === 'hood') { c.add(head, 'cone', p.cloth, [0, 0.3 * s, -0.1 * s], [0.6 * s, 0.9 * s, 0.6 * s]); }
    if (hd === 'halo') c.add(head, 'tor', p.trim, [0, 0.9 * s, 0], [0.7 * s, 0.7 * s, 0.7 * s], { rot: [PI / 2, 0, 0], glow: 1.5 });
    if (o.cape) { const cp = c.joint(body, 'cape', [0, 1.0 * s, -0.5 * s * heavy]); c.add(cp, 'box', p.cloth, [0, -0.9 * s, -0.1 * s], [1.5 * s, 2.0 * s, 0.1 * s]); }
    if (o.wings) {
      const w = c.joint(body, 'wings', [0, 0.9 * s, -0.5 * s]);
      for (const x of [1, -1]) { const wl = c.joint(w, null, [x * 0.3 * s, 0, 0]); c.add(wl, 'cone', p.glow, [x * 1.2 * s, 0.6 * s, 0], [0.35 * s, 2.4 * s, 0.08 * s], { rot: [0, 0, -x * 1.2], glow: 0.9 }); c.add(wl, 'cone', p.trim, [x * 1.5 * s, 0.1 * s, 0], [0.25 * s, 1.8 * s, 0.06 * s], { rot: [0, 0, -x * 1.5], glow: 0.7 }); }
    }
    const wp = o.weapon;
    if (wp) {
      const hand = c.parts.armR;
      if (wp === 'sword') { c.add(hand, 'box', p.trim, [0, -1.5 * s, 0.1 * s], [0.14 * s, 0.14 * s, 0.5 * s]); c.add(hand, 'box', 0xdfe6f0, [0, -1.5 * s, 1.1 * s], [0.14 * s, 0.34 * s, 1.9 * s], { glow: 0.4 }); }
      if (wp === 'hammer') { c.add(hand, 'cyl', 0x5a3b22, [0, -1.5 * s, 0.9 * s], [0.1 * s, 1.0 * s, 0.1 * s], { rot: [PI / 2, 0, 0] }); c.add(hand, 'box', p.dark, [0, -1.5 * s, 1.9 * s], [0.9 * s, 0.9 * s, 1.1 * s]); c.add(hand, 'box', p.glow, [0, -1.5 * s, 1.9 * s], [0.95 * s, 0.25 * s, 1.15 * s], { glow: 1.2 }); }
      if (wp === 'axe') { c.add(hand, 'cyl', 0x5a3b22, [0, -1.5 * s, 0.8 * s], [0.08 * s, 1.1 * s, 0.08 * s], { rot: [PI / 2, 0, 0] }); c.add(hand, 'box', 0xcfd6e2, [0, -1.5 * s, 1.5 * s], [0.12 * s, 1.0 * s, 0.7 * s]); }
      if (wp === 'staff') { c.add(hand, 'cyl', 0x4a3a2a, [0, -1.4 * s, 0.4 * s], [0.07 * s, 1.8 * s, 0.07 * s], { rot: [0.2, 0, 0] }); c.add(hand, 'ico', p.glow, [0, -0.4 * s, 0.7 * s], 0.32 * s, { glow: 1.8 }); }
      if (wp === 'banner') { c.add(hand, 'cyl', 0x5a3b22, [0, -1.0 * s, 0.1 * s], [0.07 * s, 2.4 * s, 0.07 * s]); c.add(hand, 'box', p.cloth, [0.4 * s, 0.6 * s, 0.1 * s], [0.8 * s, 0.9 * s, 0.06 * s]); }
    }
    if (o.shield) { const a = c.parts.armL; c.add(a, 'cyl', p.dark, [0.25 * s, -1.0 * s, 0.4 * s], [0.9 * s, 0.1 * s, 0.9 * s], { rot: [0, 0, PI / 2] }); c.add(a, 'cyl', p.trim, [0.32 * s, -1.0 * s, 0.4 * s], [0.4 * s, 0.1 * s, 0.4 * s], { rot: [0, 0, PI / 2], glow: 0.5 }); }
    if (o.spikes) for (let i = 0; i < 6; i++) { const a = (i / 6) * PI + PI * 0.0; c.add(body, 'cone', p.trim, [Math.cos(a) * 0.5 * s * heavy * 1.3 - 0.6 * s * heavy, 1.3 * s, -0.5 * s * heavy], [0.1 * s, 0.5 * s, 0.1 * s], { rot: [-0.7, 0, 0] }); }
    if (o.orbit) { const f = c.joint(c.root, 'fx', [0, (o.orbitY || 2.4) * s, 0]); for (let i = 0; i < o.orbit; i++) { const a = i / o.orbit * TAU; c.add(f, o.orbitGeo || 'octa', p.glow, [Math.sin(a) * 1.8 * s, 0, Math.cos(a) * 1.8 * s], 0.26 * s, { glow: 1.6 }); } }
    if (o.extra) o.extra(c, p, s);
    const h = (o.h || 3.6) * (o.hMul || 1);
    return finish(c, h, (o.r || 1.4), animHuman, 0.06);
  }

  // ------------------------------------------------------------------
  // ROBÉ flottant (archiviste, ombres, éclipse, souverain, chronophage, juge…)
  // ------------------------------------------------------------------
  function robed(o) {
    const c = ctx(), s = o.scale || 1;
    const p = Object.assign({ robe: 0x3a2a6a, dark: 0x1a1030, trim: 0xb48cff, glow: 0xb48cff, eye: 0xff4ae0, skin: 0xd8d0e8 }, o.pal || {});
    const body = c.joint(c.root, 'body', [0, 1.7 * s, 0]); body.userData.y0 = 1.7 * s;
    c.add(body, 'cone', p.robe, [0, -0.4 * s, 0], [1.2 * s, 2.6 * s, 1.2 * s], { rot: [PI, 0, 0] });
    c.add(body, 'cyl', p.dark, [0, -1.6 * s, 0], [1.25 * s, 0.14 * s, 1.25 * s]);
    c.add(body, 'sph', p.robe, [0, 0.9 * s, 0], [0.85 * s, 0.7 * s, 0.7 * s]);
    c.add(body, 'box', p.trim, [0, 0.2 * s, 0.6 * s], [0.25 * s, 1.5 * s, 0.06 * s], { glow: 0.9 });
    const head = c.joint(body, 'head', [0, 1.7 * s, 0]);
    if (o.face === 'skull') { c.add(head, 'sph', 0xeee6d2, [0, 0, 0], [0.45 * s, 0.5 * s, 0.45 * s]); }
    else c.add(head, 'sph', p.dark, [0, 0, 0.02 * s], [0.46 * s, 0.5 * s, 0.44 * s]);
    for (const x of [-1, 1]) c.add(head, 'box', p.eye, [x * 0.17 * s, 0.04 * s, 0.38 * s], [0.15 * s, 0.07 * s, 0.05 * s], { glow: 2.4, eye: true });
    c.add(head, 'cone', p.robe, [0, 0.35 * s, -0.12 * s], [0.62 * s, 0.95 * s, 0.62 * s]);
    if (o.crown) for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; c.add(head, 'cone', p.glow, [Math.sin(a) * 0.5 * s, 1.0 * s, Math.cos(a) * 0.5 * s - 0.1 * s], [0.06 * s, 0.4 * s, 0.06 * s], { glow: 1.3 }); }
    for (const [n, x] of [['armL', 1], ['armR', -1]]) {
      const a = c.joint(body, n, [x * 0.85 * s, 0.7 * s, 0.1 * s]);
      c.add(a, 'box', p.robe, [x * 0.1 * s, -0.5 * s, 0.1 * s], [0.34 * s, 1.1 * s, 0.34 * s]);
      c.add(a, 'sph', p.skin, [x * 0.1 * s, -1.15 * s, 0.2 * s], 0.22 * s);
    }
    if (o.staff) { const a = c.parts.armR; c.add(a, 'cyl', 0x2a2030, [0, -1.0 * s, 0.5 * s], [0.07 * s, 2.6 * s, 0.07 * s]); c.add(a, 'ico', p.glow, [0, 0.4 * s, 0.5 * s], 0.38 * s, { glow: 1.8 }); }
    // objets en orbite
    const orb = c.joint(c.root, 'orbit', [0, 2.3 * s, 0]); orb.userData.y0 = 2.3 * s;
    const n = o.orbitN || 5, og = o.orbitGeo || 'octa';
    for (let i = 0; i < n; i++) { const a = i / n * TAU; const sh = og === 'book' ? c.add(orb, 'box', i % 2 ? 0x8a2a2a : 0x2a4a8a, [Math.sin(a) * 2.0 * s, Math.sin(i * 2) * 0.4 * s, Math.cos(a) * 2.0 * s], [0.5 * s, 0.12 * s, 0.38 * s], { rot: [0.3, a, 0.2] }) : c.add(orb, og, p.glow, [Math.sin(a) * 2.0 * s, Math.sin(i * 2) * 0.4 * s, Math.cos(a) * 2.0 * s], 0.3 * s, { glow: 1.6 }); }
    if (o.ring) { const r = c.joint(c.root, 'ring2', [0, 2.0 * s, -0.9 * s]); c.add(r, 'tor', p.trim, [0, 0, 0], [1.8 * s, 1.8 * s, 1.8 * s], { glow: 1.1 }); if (o.ring === 'clock') { c.add(r, 'box', p.trim, [0, 0.55 * s, 0.02], [0.08 * s, 1.1 * s, 0.05 * s], { glow: 1.3 }); c.add(r, 'box', p.trim, [0.35 * s, 0, 0.02], [0.7 * s, 0.08 * s, 0.05 * s], { glow: 1.3 }); } }
    if (o.disc) c.add(c.joint(c.root, 'disc', [0, 3.4 * s, -0.7 * s]), 'sph', o.disc, [0, 0, 0], [1.0 * s, 1.0 * s, 0.2 * s], { glow: 0.1 });
    if (o.extra) o.extra(c, p, s);
    return finish(c, (o.h || 3.8) * 1, o.r || 1.3, animFloat, 0.05);
  }

  // ------------------------------------------------------------------
  // BÊTE à quatre pattes (grand loup)
  // ------------------------------------------------------------------
  function beast(o) {
    const c = ctx(), s = o.scale || 1;
    const p = Object.assign({ fur: 0x4a5560, dark: 0x2a323a, belly: 0xb8c0c8, eye: 0xffd23a, glow: 0x88ffcc }, o.pal || {});
    const body = c.joint(c.root, 'body', [0, 1.5 * s, 0]); body.userData.y0 = 1.5 * s;
    c.add(body, 'sph', p.fur, [0, 0, 0], [0.95 * s, 0.85 * s, 1.7 * s]);
    c.add(body, 'sph', p.belly, [0, -0.4 * s, 0.1 * s], [0.7 * s, 0.4 * s, 1.3 * s]);
    c.add(body, 'sph', p.dark, [0, 0.65 * s, 0.9 * s], [0.85 * s, 0.6 * s, 0.9 * s]);
    for (let i = 0; i < 7; i++) c.add(body, 'cone', p.dark, [0, 0.8 * s, (0.9 - i * 0.3) * s], [0.18 * s, 0.55 * s, 0.18 * s], { rot: [-0.3, 0, 0] });
    const head = c.joint(body, 'head', [0, 0.4 * s, 1.7 * s]);
    c.add(head, 'sph', p.fur, [0, 0, 0], [0.6 * s, 0.55 * s, 0.7 * s]);
    c.add(head, 'cone', p.fur, [0, -0.1 * s, 0.9 * s], [0.3 * s, 0.9 * s, 0.3 * s], { rot: [PI / 2, 0, 0] });
    c.add(head, 'sph', 0x111111, [0, 0.05 * s, 1.35 * s], 0.13 * s);
    for (const x of [-1, 1]) { c.add(head, 'cone', p.dark, [x * 0.35 * s, 0.6 * s, -0.1 * s], [0.2 * s, 0.6 * s, 0.15 * s]); c.add(head, 'box', p.eye, [x * 0.28 * s, 0.14 * s, 0.5 * s], [0.18 * s, 0.1 * s, 0.06 * s], { glow: 2.2, eye: true }); }
    for (const x of [-1, 1]) c.add(head, 'cone', 0xffffff, [x * 0.12 * s, -0.3 * s, 0.75 * s], [0.06 * s, 0.22 * s, 0.06 * s], { rot: [PI, 0, 0] });
    const tail = c.joint(body, 'tail', [0, 0.2 * s, -1.6 * s]);
    c.add(tail, 'cone', p.fur, [0, 0, -0.6 * s], [0.3 * s, 1.4 * s, 0.3 * s], { rot: [-PI / 2 - 0.5, 0, 0] });
    const legs = [['legFL', 0.6, 1.0], ['legFR', -0.6, 1.0], ['legBL', 0.6, -1.0], ['legBR', -0.6, -1.0]];
    for (const [n, x, z] of legs) { const l = c.joint(c.root, n, [x * s, 1.2 * s, z * s]); c.add(l, 'box', p.fur, [0, -0.55 * s, 0], [0.38 * s, 1.1 * s, 0.4 * s]); c.add(l, 'box', p.dark, [0, -1.1 * s, 0.1 * s], [0.42 * s, 0.2 * s, 0.6 * s]); }
    if (o.aura) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.add(body, 'tet', p.glow, [Math.sin(a) * 1.3 * s, 0.9 * s, Math.cos(a) * 1.5 * s], 0.2 * s, { glow: 1.5 }); }
    return finish(c, (o.h || 2.8), o.r || 1.6, animBeast, 0.05);
  }

  // ------------------------------------------------------------------
  // TENTACULES / hydre / kraken / reine des vases
  // ------------------------------------------------------------------
  function tentacled(o) {
    const c = ctx(), s = o.scale || 1;
    const p = Object.assign({ skin: 0x3a8a5a, dark: 0x1f5a3a, belly: 0xb8e06a, eye: 0xffe04a, glow: 0x9aff4a }, o.pal || {});
    const body = c.joint(c.root, 'body', [0, 1.0 * s, 0]); body.userData.y0 = 1.0 * s;
    c.add(body, 'sph', p.skin, [0, 0.6 * s, 0], [1.7 * s, 1.3 * s, 1.7 * s]);
    c.add(body, 'sph', p.dark, [0, 0.0 * s, 0], [2.0 * s, 0.55 * s, 2.0 * s]);
    const ud = { tents: [], heads: [] };
    const nt = o.tentacles || 6;
    for (let i = 0; i < nt; i++) {
      const a = i / nt * TAU, side = i % 2 ? 1 : -1;
      let par = c.joint(body, null, [Math.sin(a) * 1.5 * s, 0.1 * s, Math.cos(a) * 1.5 * s]); par.rotation.y = a;
      const segs = [];
      for (let j = 0; j < 4; j++) {
        const jt = c.joint(par, null, [0, 0, j === 0 ? 0 : 0.0]); jt.position.z = j === 0 ? 0 : 0.7 * s; jt.rotation.x = -0.15;
        c.add(jt, 'sph', j % 2 ? p.dark : p.skin, [0, 0, 0.35 * s], [(0.46 - j * 0.07) * s, (0.4 - j * 0.06) * s, 0.45 * s]);
        segs.push(jt); par = jt;
      }
      ud.tents.push({ segs, side });
    }
    const nh = o.heads || 0;
    for (let i = 0; i < nh; i++) {
      const x = (i - (nh - 1) / 2) * 1.5 * s;
      const neck = c.joint(body, null, [x, 1.2 * s, 0.3 * s]);
      c.add(neck, 'cyl', p.skin, [0, 0.9 * s, 0], [0.34 * s, 1.8 * s, 0.34 * s]);
      const h = c.joint(neck, null, [0, 1.9 * s, 0.1 * s]);
      c.add(h, 'sph', p.skin, [0, 0, 0.1 * s], [0.5 * s, 0.4 * s, 0.7 * s]);
      for (const sx of [-1, 1]) c.add(h, 'box', p.eye, [sx * 0.2 * s, 0.12 * s, 0.5 * s], [0.14 * s, 0.08 * s, 0.05 * s], { glow: 2.2, eye: true });
      for (const sx of [-1, 1]) c.add(h, 'cone', 0xffffff, [sx * 0.15 * s, -0.25 * s, 0.6 * s], [0.05 * s, 0.2 * s, 0.05 * s], { rot: [PI, 0, 0] });
      ud.heads.push(h);
    }
    if (!nh) {
      const h = c.joint(body, 'head', [0, 1.1 * s, 1.0 * s]);
      for (const sx of [-1, 1]) c.add(h, 'sph', p.eye, [sx * 0.55 * s, 0.4 * s, 0.4 * s], 0.28 * s, { glow: 2, eye: true });
      c.add(h, 'sph', 0x101010, [0, -0.1 * s, 0.6 * s], [0.9 * s, 0.35 * s, 0.35 * s]);
      ud.heads.push(h);
    }
    if (o.crown) c.add(body, 'cone', 0xffd23a, [0, 1.65 * s, 0], [0.7 * s, 0.7 * s, 0.7 * s], { glow: 0.5 });
    if (o.bubbles) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.add(body, 'sph', p.glow, [Math.sin(a) * 1.5 * s, 0.9 * s + (i % 3) * 0.2, Math.cos(a) * 1.5 * s], 0.22 * s, { glow: 0.9, opacity: 0.8 }); }
    if (o.extra) o.extra(c, p, s);
    const root = finish(c, o.h || 3.4, o.r || 2.0, animTentacle, 0.05);
    root.userData.tents = ud.tents; root.userData.heads = ud.heads;
    return root;
  }

  // ------------------------------------------------------------------
  // CRISTAL vivant
  // ------------------------------------------------------------------
  function crystalBoss(o) {
    const c = ctx(), s = o.scale || 1;
    const p = Object.assign({ cry: 0xff4de1, core: 0xffffff, dark: 0x3a1a6b, eye: 0xffffff }, o.pal || {});
    const body = c.joint(c.root, 'body', [0, 2.0 * s, 0]); body.userData.y0 = 2.0 * s;
    c.add(body, 'octa', p.cry, [0, 0, 0], [1.2 * s, 1.9 * s, 1.2 * s], { glow: 0.55 });
    c.add(body, 'octa', p.core, [0, 0, 0], [0.55 * s, 0.9 * s, 0.55 * s], { glow: 2 });
    c.add(body, 'sph', p.eye, [0, 0.1 * s, 0.7 * s], [0.25 * s, 0.34 * s, 0.14 * s], { glow: 2.5, eye: true });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = 1.0 * s; c.add(body, 'cone', p.cry, [Math.sin(a) * r, (i % 2 ? 0.5 : -0.5) * s, Math.cos(a) * r], [0.22 * s, (0.9 + (i % 3) * 0.3) * s, 0.22 * s], { rot: [Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0], glow: 0.5 }); }
    const orb = c.joint(c.root, 'orbit', [0, 2.0 * s, 0]); orb.userData.y0 = 2.0 * s;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.add(orb, 'octa', p.cry, [Math.sin(a) * 2.3 * s, Math.sin(i * 1.7) * 0.7 * s, Math.cos(a) * 2.3 * s], [0.28 * s, 0.6 * s, 0.28 * s], { glow: 0.9 }); }
    const ring = c.joint(c.root, 'ring2', [0, 2.0 * s, 0]); c.add(ring, 'tor', p.core, [0, 0, 0], [2.8 * s, 2.8 * s, 2.8 * s], { rot: [PI / 2, 0, 0], glow: 0.8 });
    return finish(c, o.h || 4.0, o.r || 1.8, animFloat, 0.04);
  }

  // ------------------------------------------------------------------
  // Variantes
  // ------------------------------------------------------------------
  const MODELS = {
    // ---- boss ----
    gobelin_roi: () => humanoid({ scale: 1.15, heavy: 1.25, head: 'crown', weapon: 'banner', cape: true, h: 3.4, r: 1.4, pal: { skin: 0x6b9a3a, dark: 0x3d5a22, trim: 0xffd23a, cloth: 0xa02a2a, eye: 0xffe04a } }),
    reine_des_vases: () => tentacled({ scale: 1.15, tentacles: 7, bubbles: true, crown: true, h: 3.6, r: 2.2, pal: { skin: 0x6bc04a, dark: 0x3a7a2a, glow: 0xc8ff4a, eye: 0xff4ad0 } }),
    grand_loup: () => beast({ scale: 1.5, aura: true, h: 3.4, r: 2.0, pal: { fur: 0x3a4a5a, dark: 0x1a222c, eye: 0xff4a4a, glow: 0x88ffcc } }),
    maitre_arene: () => humanoid({ scale: 1.1, heavy: 1.2, head: 'helm', weapon: 'sword', shield: true, cape: true, h: 3.6, r: 1.5, pal: { skin: 0xb08a5a, dark: 0x5a3b22, trim: 0xd8b24a, cloth: 0xa02a2a, eye: 0xffa030 } }),
    roi_dore: () => humanoid({ scale: 1.25, heavy: 1.3, head: 'crown', weapon: 'sword', cape: true, spikes: true, orbit: 6, orbitGeo: 'octa', h: 4.2, r: 1.8, pal: { skin: 0xe0c04a, dark: 0x8a6a1a, trim: 0xfff2a0, cloth: 0x7a1a2a, glow: 0xffd23a, eye: 0xfff2a0 } }),
    archiviste: () => robed({ scale: 1.15, orbitN: 6, orbitGeo: 'book', staff: true, face: 'skull', h: 4.0, pal: { robe: 0x2a3a7a, dark: 0x101830, trim: 0xffd23a, glow: 0x9ab0ff, eye: 0x7affd8 } }),
    gardien_des_ombres: () => robed({ scale: 1.3, orbitN: 7, orbitGeo: 'tet', crown: true, h: 4.4, r: 1.6, pal: { robe: 0x16102a, dark: 0x080612, trim: 0x6a3cff, glow: 0x8a3cff, eye: 0xc84aff } }),
    seigneur_du_ciel: () => humanoid({ scale: 1.2, heavy: 1.1, head: 'halo', weapon: 'sword', wings: true, orbit: 5, orbitGeo: 'tet', chestGlow: true, h: 4.2, r: 1.7, pal: { skin: 0xdde8f5, dark: 0x7a8ab0, trim: 0xffe84a, glow: 0xfff06a, eye: 0xffe84a, cloth: 0x2a4a8a } }),
    leviathan: () => tentacled({ scale: 1.6, tentacles: 8, h: 5.0, r: 3.0, pal: { skin: 0x2a6aa8, dark: 0x123a60, belly: 0x9ad8ff, glow: 0x6ad0ff, eye: 0xfff06a } }),
    cristal_vivant: () => crystalBoss({ scale: 1.25, h: 4.8, r: 2.0, pal: { cry: 0xff4de1, core: 0xffffff, eye: 0xffffff } }),
    souverain_neant: () => robed({ scale: 1.7, orbitN: 8, orbitGeo: 'octa', crown: true, ring: true, staff: true, disc: 0x000000, h: 5.6, r: 2.2, pal: { robe: 0x0a0612, dark: 0x000000, trim: 0xb48cff, glow: 0x9a5cff, eye: 0xffffff, skin: 0x2a1a3a } }),
    juge_souverain: () => humanoid({ scale: 1.35, heavy: 1.3, head: 'halo', weapon: 'hammer', cape: true, wings: true, chestGlow: true, orbit: 4, orbitGeo: 'octa', h: 5.0, r: 2.0, pal: { skin: 0xf0e0a8, dark: 0xa88a2a, trim: 0xffd700, glow: 0xffd700, eye: 0xffffff, cloth: 0xffffff } }),
    chronophage: () => robed({ scale: 1.5, ring: 'clock', orbitN: 6, orbitGeo: 'tor', crown: true, h: 5.0, r: 2.0, pal: { robe: 0x5a3a0a, dark: 0x2a1a05, trim: 0xffb020, glow: 0xffb020, eye: 0xfff2c0, skin: 0xd8c08a } }),
    // ---- mini-boss ----
    hydre_des_marais: () => tentacled({ scale: 1.0, tentacles: 4, heads: 3, h: 4.2, r: 1.9, pal: { skin: 0x4a8a3a, dark: 0x2a5a22, glow: 0xb8ff4a, eye: 0xffe04a } }),
    gardien_sceau: () => humanoid({ scale: 1.2, heavy: 1.35, head: 'helm', shield: true, weapon: 'hammer', orbit: 3, orbitGeo: 'tor', h: 3.8, r: 1.6, pal: { skin: 0x8a8f9c, dark: 0x4a4f5a, trim: 0x8a6bff, glow: 0x8a6bff, eye: 0x8a6bff } }),
    champion_arene: () => humanoid({ scale: 1.0, heavy: 1.1, head: 'helm', weapon: 'axe', shield: true, h: 3.2, r: 1.3, pal: { skin: 0xc09060, dark: 0x6a4a2a, trim: 0xe0c060, eye: 0xffa030 } }),
    colosse_dore: () => humanoid({ scale: 1.3, heavy: 1.45, head: 'horns', weapon: 'hammer', spikes: true, h: 4.2, r: 2.0, pal: { skin: 0xd8b838, dark: 0x8a6a1a, trim: 0xfff2a0, glow: 0xffd23a, eye: 0xfff2a0 } }),
    bibliothecaire_fou: () => robed({ scale: 0.9, orbitN: 5, orbitGeo: 'book', h: 3.2, r: 1.1, pal: { robe: 0x6a3a2a, dark: 0x2a1a10, trim: 0xe0c060, glow: 0xffe0a0, eye: 0xff4a4a } }),
    general_oublie: () => humanoid({ scale: 1.15, heavy: 1.15, head: 'helm', weapon: 'sword', cape: true, h: 3.6, r: 1.5, pal: { skin: 0x3a3a56, dark: 0x1a1a2a, trim: 0x8a8ac0, cloth: 0x2a1a4a, eye: 0x9a6aff, glow: 0x9a6aff } }),
    kraken_mineur: () => tentacled({ scale: 1.0, tentacles: 6, h: 3.2, r: 2.0, pal: { skin: 0x3a6ac0, dark: 0x1a3a7a, glow: 0x6ad0ff, eye: 0xfff06a } }),
    seigneur_eclipse: () => robed({ scale: 1.1, orbitN: 4, orbitGeo: 'sph', disc: 0x000000, crown: true, staff: true, h: 3.8, r: 1.3, pal: { robe: 0x1a1a3a, dark: 0x080818, trim: 0xffd27a, glow: 0xffd27a, eye: 0xffe0a0 } }),
    gardien_faille: () => crystalBoss({ scale: 0.85, h: 3.4, r: 1.5, pal: { cry: 0x4affd8, core: 0xffffff } }),
    maitre_forgeron: () => humanoid({ scale: 1.2, heavy: 1.4, head: 'horns', weapon: 'hammer', spikes: true, chestGlow: true, h: 3.8, r: 1.7, pal: { skin: 0x6a2a1a, dark: 0x2a1008, trim: 0xff8a1a, glow: 0xff6a1a, eye: 0xffd24a } }),
    general_neant: () => humanoid({ scale: 1.2, heavy: 1.2, head: 'helm', weapon: 'sword', cape: true, orbit: 3, orbitGeo: 'octa', h: 3.8, r: 1.5, pal: { skin: 0x16102a, dark: 0x050308, trim: 0x8a3cff, cloth: 0x0a0612, glow: 0x9a5cff, eye: 0xffffff } }),
  };

  // ------------------------------------------------------------------
  // ADDS de mécanique (ennemis « objets »)
  // ------------------------------------------------------------------
  function addCristal(o) {
    const c = ctx(); const cc = (o && o.color) || 0x6ae6ff;
    const b = c.joint(c.root, 'body', [0, 1.1, 0]);
    c.add(b, 'octa', cc, [0, 0, 0], [0.55, 0.95, 0.55], { glow: 1.0 });
    c.add(b, 'octa', 0xffffff, [0, 0, 0], [0.22, 0.4, 0.22], { glow: 2 });
    c.add(b, 'octa', cc, [0.5, -0.3, 0], [0.2, 0.4, 0.2], { glow: 0.7 });
    c.add(c.root, 'cyl', 0x4a5060, [0, 0.12, 0], [0.5, 0.12, 0.5]);
    const r = finish(c, 2.0, 0.7, (ud, t) => { b.rotation.y = t * 1.5; b.position.y = 1.1 + Math.sin(t * 2) * 0.12; }, 0.04);
    r.userData.animate = null; r.userData.glowMats = c.mats.slice(0, 3);
    return r;
  }
  function addTotem(o) {
    const c = ctx();
    c.add(c.root, 'cyl', 0x6a6f7a, [0, 0.2, 0], [0.7, 0.2, 0.7]);
    c.add(c.root, 'box', 0x8a8f9c, [0, 1.3, 0], [0.8, 2.2, 0.8]);
    c.add(c.root, 'box', 0xffffff, [0, 1.6, 0.42], [0.45, 0.45, 0.06], { glow: 1.6, rune: true });
    c.add(c.root, 'box', 0xffffff, [0, 0.9, 0.42], [0.2, 0.6, 0.06], { glow: 1.6, rune: true });
    c.add(c.root, 'octa', 0xffffff, [0, 2.7, 0], [0.3, 0.4, 0.3], { glow: 1.8, rune: true });
    return finish(c, 3.0, 0.8, null, 0.04);
  }
  function addEtendard() {
    const c = ctx();
    c.add(c.root, 'cyl', 0x5a3b22, [0, 1.6, 0], [0.08, 1.6, 0.08]);
    c.add(c.root, 'box', 0xb02a2a, [0.5, 2.6, 0], [1.0, 0.8, 0.05]);
    c.add(c.root, 'sph', 0xffd23a, [0, 3.25, 0], 0.15, { glow: 1.2 });
    c.add(c.root, 'cyl', 0x5a3b22, [0, 0.1, 0], [0.5, 0.1, 0.5]);
    return finish(c, 3.3, 0.6, null, 0.04);
  }
  function addPhylactere() {
    const c = ctx();
    const b = c.joint(c.root, 'body', [0, 1.2, 0]);
    c.add(b, 'sph', 0x7a3cff, [0, 0, 0], [0.5, 0.6, 0.5], { glow: 0.6, opacity: 0.85 });
    c.add(b, 'sph', 0xdfffd0, [0, 0, 0], 0.25, { glow: 2 });
    c.add(b, 'cyl', 0x3a3a4a, [0, 0.7, 0], [0.18, 0.2, 0.18]);
    c.add(b, 'cone', 0x3a3a4a, [0, -0.7, 0], [0.3, 0.3, 0.3], { rot: [PI, 0, 0] });
    const r = finish(c, 2.2, 0.7, (ud, t) => { b.position.y = 1.2 + Math.sin(t * 2.4) * 0.18; b.rotation.y = t; }, 0.04);
    r.userData.glowMats = c.mats.slice(0, 2);
    return r;
  }
  function addEcho(o) {
    const c = ctx(), col = (o && o.color) || 0x8a6aff;
    const b = c.joint(c.root, 'body', [0, 1.3, 0]);
    c.add(b, 'cone', col, [0, -0.2, 0], [0.7, 2.0, 0.7], { rot: [PI, 0, 0], opacity: 0.7 });
    c.add(b, 'sph', col, [0, 1.0, 0], [0.4, 0.45, 0.4], { opacity: 0.8 });
    for (const x of [-1, 1]) c.add(b, 'box', 0xffffff, [x * 0.15, 1.05, 0.33], [0.13, 0.07, 0.05], { glow: 2.4, eye: true });
    const r = finish(c, 2.6, 0.8, (ud, t) => { b.position.y = 1.3 + Math.sin(t * 2) * 0.15; }, 0.03);
    return r;
  }

  // =====================================================================
  //  v5 « Ténèbres » — MODÈLES EXCLUSIFS (un par boss / mini-boss)
  // =====================================================================
  function augment(c) {
    c.anim = { sway: [], spin: [], pulse: [], legs: [] }; c.flames = []; c.shell = [];
    c.limb = (parent, a, b, th, color, o) => {
      o = o || {}; const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.max(0.01, Math.hypot(dx, dy, dz));
      const mm = c.add(parent, o.geo || 'cyl', color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [th, len, o.th2 != null ? o.th2 : th], o);
      mm.rotation.order = 'YXZ'; mm.rotation.y = Math.atan2(dx, dz); mm.rotation.x = Math.acos(Math.max(-1, Math.min(1, dy / len))); return mm;
    };
    c.sway = (p, ax, amp, sp, ph) => { c.anim.sway.push({ p, ax, amp, sp, ph: ph || 0, base: p.rotation[ax] }); return p; };
    c.spin = (p, sp, ax) => { c.anim.spin.push({ p, sp, ax: ax || 'y' }); return p; };
    c.pulse = (p, amp, sp) => { c.anim.pulse.push({ p, amp, sp, b: [p.scale.x, p.scale.y, p.scale.z] }); return p; };
    return c;
  }
  const ctx2 = ctx;
  function animExtras(ud, t, st) {
    const A = ud.anim; if (!A) return; const w = (st && st.windup) || 0, mv = ud._m || 0;
    A.sway.forEach(s => { s.p.rotation[s.ax] = s.base + Math.sin(t * s.sp + s.ph) * s.amp * (1 + w * 0.8); });
    A.spin.forEach(s => { s.p.rotation[s.ax] = t * s.sp * (1 + w * 2); });
    A.pulse.forEach(s => { const k = 1 + s.amp * Math.sin(t * s.sp) + (ud.beat && t - ud.beat < 0.3 ? 0.12 * (1 - (t - ud.beat) / 0.3) : 0); s.p.scale.set(s.b[0] * k, s.b[1] * k, s.b[2] * k); });
    A.legs.forEach(l => { l.p.rotation.x = l.base + Math.sin(t * 8 + l.ph) * 0.5 * mv; });
    if (ud.flames) ud.flames.forEach(f => { const L = ud.litLevel == null ? 1 : ud.litLevel; f.scale.setScalar(Math.max(0.02, 0.4 + 0.6 * L) * (1 + 0.1 * Math.sin(t * 12 + f.position.x * 5))); f.visible = L > 0.05; });
    if (ud.shell) ud.shell.forEach(m => { if (m.emissive) { m.emissive.setHex(ud.melt > 0.45 ? 0xff7a2a : 0x7fd8ff); m.emissiveIntensity = 0.3 + 1.2 * (ud.melt || 0); } });
    if (ud.lid) { const k = ud.stag ? 1 : 0; ud._lk = (ud._lk || 0) + (k - (ud._lk || 0)) * 0.08; ud.lid[0].position.y = 1.4 - 1.3 * ud._lk; ud.lid[1].position.y = -1.4 + 1.3 * ud._lk; }
  }
  const defaultBob = (ud, t, st) => { st = st || {}; ud._m = (ud._m || 0) + ((st.moving ? 1 : 0) - (ud._m || 0)) * 0.15; const P = ud.parts; if (P.body) P.body.position.y = (P.body.userData.y0 || 0) + Math.sin(t * 1.7) * 0.12 - 0.2 * (st.windup || 0); };
  const done = (c, h, r, base, outline) => finish(c, h, r, base || defaultBob, outline || 0.05);
  const rockCol = 0x6a5a4a, bone = 0xd8d0c0;
  const humanBase = (c, o) => { // squelette humanoïde commun : body, legs, arms, head
    const body = c.joint(c.root, 'body', [0, o.by, 0]); body.userData.y0 = o.by;
    for (const [n, x] of [['legL', o.lx], ['legR', -o.lx]]) { const l = c.joint(c.root, n, [x, o.by - 0.3, 0]); c.add(l, 'box', o.legCol, [0, -(o.by - 0.3) / 2, 0], [o.lw, o.by - 0.3, o.lw]); c.add(l, 'box', o.footCol || o.legCol, [0, -(o.by - 0.3) + 0.15, 0.2], [o.lw * 1.2, 0.3, o.lw * 1.6]); }
    const head = c.joint(body, 'head', [0, o.hy, 0.05]);
    for (const [n, x] of [['armL', 1], ['armR', -1]]) { const a = c.joint(body, n, [x * o.ax, o.ay, 0]); c.add(a, 'box', o.armCol, [0, -o.al / 2, 0], [o.aw, o.al, o.aw]); c.add(a, o.fist || 'box', o.fistCol || o.armCol, [0, -o.al - 0.1, 0.05], o.fs || [o.aw * 1.3, o.aw * 1.3, o.aw * 1.3]); }
    return { body, head };
  };

  // ---------- 1. Golem de Grisou ----------
  function mGolemGrisou() {
    const c = ctx2(), { body, head } = humanBase(c, { by: 2.3, lx: 0.9, lw: 1.1, legCol: 0x5a4a3a, hy: 2.1, ax: 1.9, ay: 1.0, al: 2.2, aw: 0.9, armCol: rockCol, fist: 'dode', fistCol: 0x7a6a5a, fs: [1.0, 1.0, 1.0] });
    c.add(body, 'dode', rockCol, [0, 0.3, 0], [1.9, 1.6, 1.4]); c.add(body, 'dode', 0x5a4a3a, [-1.0, 1.0, -0.2], [0.9, 0.8, 0.8]); c.add(body, 'dode', 0x7a6a5a, [1.1, 0.9, 0.1], [0.8, 0.9, 0.8]);
    for (let i = 0; i < 5; i++) c.add(body, 'box', 0x7bd648, [-1.3 + i * 0.65, 0.3 + (i % 2) * 0.5, 1.25], [0.12, 1.0, 0.1], { glow: 1.4, rot: [0, 0, 0.5 - i * 0.25] });
    c.limb(body, [-1.6, -0.6, 1.0], [1.7, 1.4, 1.0], 0.22, 0x3a3a42); c.limb(body, [-1.6, 1.4, 1.0], [1.7, -0.6, 1.0], 0.22, 0x3a3a42);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; c.add(body, 'sph', bone, [Math.sin(a) * 1.6, -0.3 + (i % 3) * 0.55, Math.cos(a) * 1.1 + 0.2], [0.28, 0.32, 0.28]); c.add(body, 'sph', 0x111111, [Math.sin(a) * 1.6 + 0.07, -0.25 + (i % 3) * 0.55, Math.cos(a) * 1.1 + 0.42], 0.07); }
    c.add(body, 'cyl', 0x4a3a2a, [2.1, 1.7, -0.1], [0.55, 0.9, 0.55]); c.add(body, 'cyl', 0x7bd648, [2.1, 2.2, -0.1], [0.4, 0.06, 0.4], { glow: 1.5 });
    c.add(head, 'dode', rockCol, [0, 0, 0], [0.8, 0.7, 0.7]); c.add(head, 'cyl', 0xd8a02a, [0, 0.55, 0], [0.82, 0.28, 0.82]); c.add(head, 'sph', 0xd8a02a, [0, 0.7, 0], [0.7, 0.4, 0.7]);
    c.add(head, 'sph', 0xfff2a0, [0, 0.72, 0.62], 0.2, { glow: 2 }); c.add(head, 'box', 0x9aff4a, [0, 0.0, 0.62], [0.4, 0.14, 0.08], { glow: 2.4, eye: true });
    const hand = c.parts.armR; c.limb(hand, [0, -2.2, 0.2], [0, -2.2, 2.6], 0.12, 0x5a3b22); c.add(hand, 'cone', 0xcfd6e2, [0, -2.2, 2.7], [0.2, 1.4, 0.35], { rot: [PI / 2, 0, 0] });
    c.add(body, 'sph', 0xfff2a0, [0, 1.6, 0.9], 0.26, { glow: 1.6 });
    return done(c, 4.8, 2.3, animHuman);
  }
  // ---------- 2. Roi-Sylve ----------
  function mRoiSylve() {
    const c = ctx2(), s = 1.4, body = c.joint(c.root, 'body', [0, 1.9 * s, 0]); body.userData.y0 = 1.9 * s;
    c.add(body, 'sph', 0x3a3326, [0, 0, 0], [1.0 * s, 0.95 * s, 1.8 * s]); c.add(body, 'sph', 0x4a6a3a, [0.3 * s, 0.7 * s, -0.4 * s], [0.5 * s, 0.25 * s, 0.7 * s]);
    for (let i = 0; i < 5; i++) c.add(body, 'tor', 0xd8d0c0, [0, 0.1 * s, (0.6 - i * 0.32) * s], [0.95 * s, 0.9 * s, 0.5 * s], { rot: [0, PI / 2, 0] });
    const neck = c.joint(body, 'neck', [0, 0.5 * s, 1.5 * s]); c.limb(neck, [0, 0, 0], [0, 0.7 * s, 0.9 * s], 0.42 * s, 0x3a3326);
    const head = c.joint(body, 'head', [0, 1.3 * s, 2.4 * s]);
    c.add(head, 'sph', 0x3a3326, [0, 0, 0], [0.5 * s, 0.5 * s, 0.75 * s]); c.add(head, 'cone', 0x3a3326, [0, -0.15 * s, 0.9 * s], [0.3 * s, 0.9 * s, 0.3 * s], { rot: [PI / 2, 0, 0] });
    for (const x of [-1, 1]) { c.add(head, 'box', 0xffb02a, [x * 0.3 * s, 0.15 * s, 0.45 * s], [0.18 * s, 0.1 * s, 0.06], { glow: 2.4, eye: true });
      const ant = c.joint(head, null, [x * 0.3 * s, 0.4 * s, -0.2 * s]);
      c.limb(ant, [0, 0, 0], [x * 0.9 * s, 1.5 * s, -0.2 * s], 0.13 * s, 0x2a1e12); c.limb(ant, [x * 0.9 * s, 1.5 * s, -0.2 * s], [x * 1.9 * s, 2.5 * s, 0], 0.1 * s, 0x2a1e12);
      for (let k = 0; k < 4; k++) c.limb(ant, [x * (0.4 + k * 0.4) * s, (0.6 + k * 0.6) * s, -0.2 * s], [x * (1.0 + k * 0.5) * s, (1.4 + k * 0.7) * s, (0.5 - k * 0.4) * s], 0.07 * s, 0x2a1e12, { geo: 'cone' });
      c.add(ant, 'octa', 0x88ffcc, [x * 1.9 * s, 2.5 * s, 0], 0.12 * s, { glow: 1.6 }); }
    const crows = c.joint(c.root, 'fx', [0, 5.2 * s * 0.62, 0]); c.spin(crows, 0.5);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const cr = c.joint(crows, null, [Math.sin(a) * 2.6, Math.sin(i) * 0.4, Math.cos(a) * 2.6]); c.add(cr, 'sph', 0x15151f, [0, 0, 0], [0.22, 0.18, 0.3]); c.add(cr, 'cone', 0xc8a24a, [0, 0, 0.32], [0.05, 0.2, 0.05], { rot: [PI / 2, 0, 0] }); c.add(cr, 'box', 0xff4a4a, [0.07, 0.05, 0.2], [0.04, 0.04, 0.04], { glow: 2 }); }
    for (const [n, x, z] of [['legFL', 0.7, 1.1], ['legFR', -0.7, 1.1], ['legBL', 0.7, -1.1], ['legBR', -0.7, -1.1]]) { const l = c.joint(c.root, n, [x * s, 1.5 * s, z * s]); c.add(l, 'box', 0x3a3326, [0, -0.7 * s, 0], [0.34 * s, 1.4 * s, 0.34 * s]); c.add(l, 'cone', 0x2a1e12, [0, -1.45 * s, 0.1], [0.25 * s, 0.35 * s, 0.4 * s], { rot: [PI, 0, 0] }); }
    const tail = c.joint(body, 'tail', [0, 0.1, -1.7 * s]); c.add(tail, 'cone', 0x4a6a3a, [0, 0, -0.5], [0.3, 1.1, 0.3], { rot: [-PI / 2 - 0.4, 0, 0] });
    for (let i = 0; i < 4; i++) { const r = c.joint(c.root, null, [Math.sin(i * 1.7) * 2.2, 0.2, Math.cos(i * 1.7) * 2.4 - 0.4]); c.limb(r, [0, 0, 0], [Math.sin(i) * 0.8, 0.7, 0.6], 0.14, 0x2a1e12, { geo: 'cone' }); }
    return done(c, 5.4, 2.4, animBeast);
  }
  // ---------- 3. Roi des Ossements ----------
  function mRoiOssements() {
    const c = ctx2(), body = c.joint(c.root, 'body', [0, 3.0, 0]); body.userData.y0 = 3.0;
    c.add(body, 'box', 0x4a463c, [0, -0.5, 0], [3.0, 0.8, 2.4]);
    for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 0.8 + (i % 4) * 0.35; c.add(body, 'sph', bone, [Math.sin(a) * r * 1.1, -0.9 + (i % 3) * 0.3, Math.cos(a) * r * 0.9 + 0.2], [0.34, 0.38, 0.34]); c.add(body, 'sph', 0x101010, [Math.sin(a) * r * 1.1 + 0.09, -0.85 + (i % 3) * 0.3, Math.cos(a) * r * 0.9 + 0.5], 0.08); }
    for (const x of [-1.2, 1.2]) c.limb(body, [x, -0.2, -0.9], [x * 0.9, 3.6, -1.0], 0.2, bone), c.add(body, 'sph', bone, [x * 0.9, 3.8, -1.0], [0.35, 0.4, 0.35]);
    for (let i = 0; i < 7; i++) c.limb(body, [-1.2 + i * 0.4, 0.2, -0.9], [-1.0 + i * 0.35, 3.3, -1.0], 0.1, bone, { geo: 'cone' });
    c.limb(body, [0, 0.0, 0.0], [0, 1.6, -0.1], 0.2, bone);
    for (let i = 0; i < 4; i++) c.add(body, 'tor', bone, [0, 0.55 + i * 0.28, -0.1], [0.75 - i * 0.07, 0.75 - i * 0.07, 0.6], { rot: [PI / 2, 0, 0] });
    const head = c.joint(body, 'head', [0, 2.35, 0.05]);
    c.add(head, 'sph', bone, [0, 0, 0], [0.55, 0.6, 0.55]); c.add(head, 'box', bone, [0, -0.4, 0.2], [0.4, 0.18, 0.35]);
    for (const x of [-1, 1]) c.add(head, 'box', 0x6aff6a, [x * 0.2, 0.05, 0.5], [0.16, 0.1, 0.06], { glow: 2.4, eye: true });
    c.add(head, 'cyl', 0xc8a24a, [0, 0.62, 0], [0.5, 0.22, 0.5], { glow: 0.4 }); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.add(head, 'cone', 0xc8a24a, [Math.sin(a) * 0.46, 0.95, Math.cos(a) * 0.46], [0.09, 0.4, 0.09], { glow: 0.5 }); }
    for (const [n, x] of [['armL', 1], ['armR', -1]]) { const a = c.joint(body, n, [x * 1.1, 1.7, 0.1]); c.limb(a, [0, 0, 0], [x * 0.2, -1.2, 0.5], 0.17, bone); c.limb(a, [x * 0.2, -1.2, 0.5], [x * 0.1, -2.2, 1.0], 0.14, bone); c.add(a, 'sph', bone, [x * 0.1, -2.3, 1.05], 0.28); }
    c.add(c.parts.armR, 'cyl', 0x2a2a2a, [0, -2.3, 1.2], [0.07, 2.2, 0.07], { rot: [0.5, 0, 0] }); c.add(c.parts.armR, 'sph', 0x6aff6a, [0, -1.45, 2.1], 0.3, { glow: 1.4 });
    [[1.3, 0.9], [-1.3, 0.9], [1.5, -0.1], [-1.5, -0.1], [1.2, -1.0], [-1.2, -1.0]].forEach(([x, z], i) => { const l = c.joint(c.root, null, [x, 2.5, z]); const knee = [x * 1.5, 1.6, z * 1.2]; c.limb(l, [0, 0, 0], [knee[0] - x, knee[1] - 2.5, knee[2] - z], 0.17, bone); c.limb(l, [knee[0] - x, knee[1] - 2.5, knee[2] - z], [x * 1.9 - x, -2.5, z * 1.5 - z], 0.13, bone, { geo: 'cone' }); c.anim.legs.push({ p: l, ph: i * 1.1, base: 0 }); });
    return done(c, 6.0, 2.6, animHuman);
  }
  // ---------- 4. Comtesse Écarlate ----------
  function mComtesse() {
    const c = ctx2(), body = c.joint(c.root, 'body', [0, 2.2, 0]); body.userData.y0 = 2.2;
    c.add(body, 'cone', 0x8a0f24, [0, -0.6, 0], [2.4, 3.6, 2.4]); c.add(body, 'cyl', 0x5a0a18, [0, -2.3, 0], [2.5, 0.22, 2.5]);
    for (let i = 0; i < 3; i++) c.add(body, 'cyl', 0xb01830, [0, -1.7 + i * 0.7, 0], [1.9 - i * 0.35, 0.1, 1.9 - i * 0.35]);
    const train = c.joint(body, 'cape', [0, -1.0, -1.0]); c.add(train, 'box', 0x6a0a1a, [0, -0.8, -1.2], [1.4, 0.1, 3.0], { rot: [0.2, 0, 0] });
    c.add(body, 'cone', 0x1a0a14, [0, 1.3, 0], [0.8, 1.4, 0.7]); c.add(body, 'box', 0xffd23a, [0, 0.9, 0.42], [0.1, 1.0, 0.04], { glow: 0.8 });
    const head = c.joint(body, 'head', [0, 2.35, 0]);
    c.add(head, 'sph', 0xefe6ee, [0, 0, 0], [0.4, 0.46, 0.4]); c.add(head, 'sph', 0x6a0a1a, [0, 0.12, -0.12], [0.45, 0.5, 0.45]);
    for (const x of [-1, 1]) c.add(head, 'box', 0xff2a3a, [x * 0.15, 0.04, 0.34], [0.12, 0.06, 0.04], { glow: 2.6, eye: true });
    c.add(head, 'box', 0xc01830, [0, -0.18, 0.37], [0.14, 0.04, 0.03], { glow: 0.6 });
    const crown = c.joint(head, null, [0, 0.55, 0]); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.add(crown, 'cyl', 0xefe6ee, [Math.sin(a) * 0.45, 0.1, Math.cos(a) * 0.45], [0.05, 0.4, 0.05]); const f = c.add(crown, 'cone', 0xffa040, [Math.sin(a) * 0.45, 0.42, Math.cos(a) * 0.45], [0.09, 0.26, 0.09], { glow: -1 }); c.flames.push(f); }
    for (let i = 0; i < 6; i++) { const h = c.joint(head, null, [Math.sin(i * 1.1) * 0.3, 0, -0.25]); c.limb(h, [0, 0.2, 0], [Math.sin(i * 1.1) * 0.5, -1.8 - (i % 3) * 0.3, -0.5], 0.07, 0x8a0f24, { geo: 'cone' }); c.sway(h, 'x', 0.15, 1.5, i); }
    for (const [n, x] of [['armL', 1], ['armR', -1]]) { const a = c.joint(body, n, [x * 0.7, 1.6, 0.1]); c.limb(a, [0, 0, 0], [x * 0.2, -1.1, 0.5], 0.13, 0xefe6ee); c.limb(a, [x * 0.2, -1.1, 0.5], [x * 0.1, -2.0, 1.0], 0.11, 0xefe6ee); for (let k = 0; k < 4; k++) c.limb(a, [x * 0.1, -2.0, 1.0], [x * (0.1 + (k - 1.5) * 0.08), -2.6, 1.5], 0.04, 0xefe6ee, { geo: 'cone' }); }
    c.add(c.parts.armR, 'sph', 0xb01830, [0.1, -2.1, 1.1], 0.2, { glow: 0.8 });
    const orb = c.joint(c.root, 'orbit', [0, 3.6, 0]); orb.userData.y0 = 3.6; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.add(orb, 'cyl', 0xefe6ee, [Math.sin(a) * 2.2, Math.sin(i) * 0.4, Math.cos(a) * 2.2], [0.06, 0.4, 0.06]); const f = c.add(orb, 'cone', 0xffa040, [Math.sin(a) * 2.2, Math.sin(i) * 0.4 + 0.3, Math.cos(a) * 2.2], [0.08, 0.22, 0.08], { glow: -1 }); c.flames.push(f); }
    return done(c, 5.4, 1.9, animFloat);
  }
  // ---------- 5. Mère des Marées ----------
  function mMereMarees() {
    const c = ctx2(), body = c.joint(c.root, 'body', [0, 2.6, 0]); body.userData.y0 = 2.6;
    c.add(body, 'cone', 0x2a6a7a, [0, -0.6, 0], [3.0, 4.6, 3.0]); c.add(body, 'cone', 0x1a4a5a, [0, -1.6, 0], [3.4, 2.6, 3.4]);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.limb(body, [Math.sin(a) * 2.9, -2.3, Math.cos(a) * 2.9], [Math.sin(a) * 3.3, -1.0 + (i % 3) * 0.5, Math.cos(a) * 3.3], 0.18, 0x2a7a3a, { geo: 'cone' }); }
    c.add(body, 'cone', 0xcfe8ee, [0, 1.6, 0], [0.9, 1.5, 0.8]); c.add(body, 'box', 0xc8a24a, [0, 1.4, 0.5], [0.2, 1.2, 0.06], { glow: 0.5 });
    const head = c.joint(body, 'head', [0, 3.0, 0]); c.add(head, 'sph', 0xaee0e8, [0, 0, 0], [0.55, 0.6, 0.5]); c.add(head, 'sph', 0xe8f4f4, [0, 0.1, 0.05], [0.62, 0.7, 0.55], { opacity: 0.8 });
    for (const x of [-1, 1]) c.add(head, 'box', 0x6affd8, [x * 0.2, 0.05, 0.5], [0.15, 0.08, 0.05], { glow: 2.6, eye: true });
    c.add(head, 'sph', 0x041a22, [0, -0.25, 0.46], [0.2, 0.26, 0.1], { glow: 0.6 });
    c.add(head, 'tor', 0xc8a24a, [0, 1.0, 0], [0.9, 0.9, 0.9], { rot: [PI / 2, 0, 0], glow: 1.1 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, t0 = [Math.sin(a) * 0.5, 0.5, Math.cos(a) * 0.5]; const tn = c.joint(head, null, t0); c.limb(tn, [0, 0, 0], [Math.sin(a) * 0.9, 1.2, Math.cos(a) * 0.9], 0.15, 0x3a9a8a, { geo: 'cone' }); c.add(tn, 'sph', 0x6affd8, [Math.sin(a) * 0.9, 1.3, Math.cos(a) * 0.9], 0.1, { glow: 1.5 }); c.sway(tn, 'z', 0.25, 1.3, i); c.sway(tn, 'x', 0.2, 1.1, i * 0.7); }
    for (const [n, x] of [['armL', 1], ['armR', -1]]) { const a = c.joint(body, n, [x * 0.9, 1.8, 0.1]); c.limb(a, [0, 0, 0], [x * 0.8, -1.0, 0.5], 0.16, 0xcfe8ee); c.limb(a, [x * 0.8, -1.0, 0.5], [x * 0.6, -1.7, 1.2], 0.13, 0xcfe8ee); c.add(a, 'sph', 0xaee0e8, [x * 0.6, -1.8, 1.3], 0.24); }
    for (let i = 0; i < 3; i++) { const bl = c.joint(body, null, [(i - 1) * 1.3, 0.2, 1.4]); c.add(bl, 'cone', 0xc8a24a, [0, -0.25, 0], [0.34, 0.5, 0.34], { rot: [PI, 0, 0] }); c.sway(bl, 'z', 0.2, 1.6, i); }
    const orb = c.joint(c.root, 'orbit', [0, 3.2, 0]); orb.userData.y0 = 3.2; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; c.add(orb, 'sph', 0xaee8ff, [Math.sin(a) * 2.8, Math.sin(i * 2) * 0.8, Math.cos(a) * 2.8], 0.22, { glow: 0.8, opacity: 0.7 }); }
    return done(c, 6.4, 2.8, animFloat);
  }
  // ---------- 6. Dieu Écorché ----------
  function mDieuEcorche() {
    const c = ctx2(), { body, head } = humanBase(c, { by: 2.5, lx: 0.8, lw: 0.95, legCol: 0xa82424, footCol: 0x4a0a0a, hy: 2.3, ax: 1.5, ay: 1.3, al: 2.0, aw: 0.7, armCol: 0xb02828, fist: 'sph', fistCol: 0xc8a24a, fs: [0.5, 0.5, 0.5] });
    c.add(body, 'box', 0xb02828, [0, 0.5, 0], [2.2, 2.2, 1.2]); for (let i = 0; i < 5; i++) c.add(body, 'box', 0xd04848, [-0.8 + i * 0.4, 0.6, 0.62], [0.1, 1.8, 0.06]);
    for (let i = 0; i < 4; i++) c.add(body, 'tor', 0xefe6d8, [0, 0.9 - i * 0.35, 0.3], [0.6, 0.55, 0.4], { rot: [PI / 2, 0, 0] });
    const heart = c.add(body, 'sph', 0xff2a2a, [0, 0.55, 0.45], [0.38, 0.45, 0.35], { glow: 1.8 }); c.pulse(heart, 0.18, 4.5);
    for (const x of [-1, 1]) { const ex = c.joint(body, null, [x * 1.35, 0.8, -0.1]); c.limb(ex, [0, 0, 0], [x * 1.3, -0.8, 0.7], 0.3, 0xb02828); c.limb(ex, [x * 1.3, -0.8, 0.7], [x * 1.5, -1.8, 1.5], 0.26, 0xa82424); c.add(ex, 'sph', 0xc8a24a, [x * 1.5, -1.9, 1.55], 0.32); c.sway(ex, 'x', 0.25, 1.4, x); }
    c.add(head, 'box', 0xc8a24a, [0, 0, 0.05], [0.9, 1.0, 0.7]); c.add(head, 'box', 0x1a0505, [0, -0.25, 0.42], [0.4, 0.4, 0.06]);
    for (const x of [-1, 1]) c.add(head, 'box', 0xff3030, [x * 0.24, 0.12, 0.42], [0.18, 0.1, 0.05], { glow: 2.6, eye: true });
    c.add(head, 'box', 0x1a0505, [0.05, 0.0, 0.42], [0.04, 0.9, 0.05]); for (let i = 0; i < 4; i++) c.add(head, 'cone', 0xc8a24a, [(i - 1.5) * 0.28, 0.75, 0], [0.1, 0.5, 0.1]);
    for (let i = 0; i < 6; i++) { const ch = c.joint(body, null, [-1.0 + i * 0.4, -0.5, 0.65]); c.limb(ch, [0, 0, 0], [0, -1.2, 0.2], 0.06, 0xc8a24a); c.sway(ch, 'z', 0.2, 2, i); }
    for (let i = 0; i < 3; i++) c.add(c.root, 'sph', 0xc01818, [(i - 1) * 0.9, 0.07, 1.3 + i * 0.1], [0.5, 0.07, 0.5], { glow: 0.5 });
    return done(c, 6.0, 2.4, animHuman);
  }
  // ---------- 7. Directeur de l'asile ----------
  function mDirecteur() {
    const c = ctx2(), { body, head } = humanBase(c, { by: 2.9, lx: 0.3, lw: 0.34, legCol: 0x3a3f50, footCol: 0x1a1a22, hy: 2.1, ax: 0.7, ay: 1.5, al: 2.4, aw: 0.22, armCol: 0xf0f0f4, fist: 'sph', fistCol: 0xefe6ee, fs: [0.22, 0.22, 0.22] });
    c.add(body, 'cone', 0xf0f0f4, [0, -0.2, 0], [1.5, 3.6, 1.0]); c.add(body, 'box', 0xf0f0f4, [0, 1.3, 0], [1.2, 1.5, 0.7]); c.add(body, 'box', 0x9a6aff, [0, 0.5, 0.52], [0.1, 2.4, 0.03], { glow: 0.9 });
    for (let i = 0; i < 4; i++) c.add(body, 'box', 0x3a3f50, [0, 1.6 - i * 0.4, 0.52], [0.12, 0.1, 0.04]);
    for (let i = 0; i < 5; i++) c.add(body, 'box', 0xcfd6e2, [-0.5 + i * 0.25, -0.2, 0.55], [0.05, 0.3, 0.02]);
    c.add(head, 'sph', 0xe8e0e8, [0, 0, 0], [0.42, 0.52, 0.4]); for (const x of [-1, 1]) { c.add(head, 'tor', 0xcfd6e2, [x * 0.17, 0.08, 0.36], [0.16, 0.16, 0.16], { glow: 0.3 }); c.add(head, 'sph', 0x9a6aff, [x * 0.17, 0.08, 0.36], 0.06, { glow: 2.6, eye: true }); }
    c.add(head, 'box', 0x1a1a22, [0, -0.2, 0.36], [0.2, 0.03, 0.03]); const mir = c.add(head, 'cyl', 0xefe6ee, [0, 0.42, 0.28], [0.34, 0.03, 0.34], { glow: 0.8, rot: [1.2, 0, 0] });
    for (let i = 0; i < 7; i++) c.add(head, 'cone', 0x2a2a30, [(i - 3) * 0.12, 0.55, -0.1], [0.05, 0.3, 0.05], { rot: [-0.3, 0, (i - 3) * 0.2] });
    for (const x of [-1, 1]) { const ex = c.joint(body, null, [x * 0.9, 1.3, 0.1]); c.limb(ex, [0, 0, 0], [x * 0.7, -0.5, 0.9], 0.1, 0xf0f0f4); c.add(ex, 'cyl', 0x9a6aff, [x * 0.7, -0.5, 1.0], [0.1, 0.5, 0.1], { glow: 1.4, rot: [PI / 2, 0, 0] }); c.sway(ex, 'x', 0.2, 2.2, x); }
    c.add(body, 'box', 0x6b4a2a, [0.85, 0.2, 0.55], [0.6, 0.8, 0.05], { rot: [0, 0, -0.2] });
    const rift = c.joint(c.root, 'fx', [0, 3.2, -1.3]); c.add(rift, 'tor', 0x9a6aff, [0, 0, 0], [2.6, 3.2, 1], { glow: 1.4 }); c.add(rift, 'tor', 0xefe6ff, [0, 0, 0], [1.9, 2.5, 1], { glow: 0.7 });
    for (let i = 0; i < 5; i++) c.limb(rift, [0, 0, 0], [Math.sin(i * 1.3) * 2.4, Math.cos(i * 1.7) * 2.4, 0], 0.05, 0xb48cff, { glow: 1.6 });
    return done(c, 5.6, 1.6, animHuman);
  }
  // ---------- 8. Auteur sans Nom ----------
  function mAuteur() {
    const c = ctx2(), body = c.joint(c.root, 'body', [0, 2.3, 0]); body.userData.y0 = 2.3;
    c.add(body, 'cone', 0x0c1030, [0, -0.5, 0], [2.0, 3.6, 1.8]); c.add(c.root, 'cyl', 0x050818, [0, 0.04, 0], [2.6, 0.06, 2.6]);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.limb(body, [Math.sin(a) * 1.8, -2.1, Math.cos(a) * 1.6], [Math.sin(a) * 2.0, -2.9, Math.cos(a) * 1.8], 0.12, 0x14185a, { geo: 'cone' }); }
    c.add(body, 'box', 0xf0e8d0, [0, 0.6, 0.95], [1.3, 1.0, 0.1], { glow: 0.4 }); c.add(body, 'box', 0x14185a, [0, 0.6, 0.97], [0.04, 1.0, 0.04]); for (let i = 0; i < 5; i++) c.add(body, 'box', 0x2a4aa8, [-0.45, 0.95 - i * 0.2, 1.0], [0.4, 0.04, 0.02], { glow: 1.0 }), c.add(body, 'box', 0x2a4aa8, [0.45, 0.95 - i * 0.2, 1.0], [0.4, 0.04, 0.02], { glow: 1.0 });
    const head = c.joint(body, 'head', [0, 2.1, 0]); c.add(head, 'sph', 0x0c1030, [0, 0, 0], [0.55, 0.6, 0.5]); for (const x of [-1, 1]) c.add(head, 'sph', 0xffffff, [x * 0.2, 0.08, 0.42], [0.1, 0.14, 0.05], { glow: 2.4, eye: true });
    for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.4; c.limb(head, [Math.sin(a) * 0.3, 0.5, 0], [Math.sin(a) * 0.9, 1.5, -0.2], 0.05, 0xf0e8d0, { geo: 'cone' }); c.add(head, 'box', 0xf0e8d0, [Math.sin(a) * 0.9, 1.5, -0.2], [0.18, 0.5, 0.02], { rot: [0, 0, -a] }); }
    const aL = c.joint(body, 'armL', [1.1, 1.5, 0.1]); c.limb(aL, [0, 0, 0], [0.5, -1.2, 0.6], 0.2, 0x0c1030); c.add(aL, 'sph', 0x14185a, [0.5, -1.3, 0.7], 0.3);
    const aR = c.joint(body, 'armR', [-1.1, 1.5, 0.1]); c.limb(aR, [0, 0, 0], [-0.4, -1.3, 0.7], 0.22, 0x0c1030); c.limb(aR, [-0.4, -1.3, 0.7], [-0.2, -0.5, 3.2], 0.09, 0xf0e8d0); c.add(aR, 'cone', 0x2a4aa8, [-0.15, -0.35, 3.5], [0.14, 0.9, 0.14], { rot: [PI / 2 + 0.2, 0, 0], glow: 1.3 });
    const pages = c.joint(c.root, 'orbit', [0, 3.2, 0]); pages.userData.y0 = 3.2; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.add(pages, 'box', 0xf0e8d0, [Math.sin(a) * 2.7, Math.sin(i * 1.7) * 0.7, Math.cos(a) * 2.7], [0.5, 0.65, 0.02], { rot: [0.3, a, 0.2], glow: 0.3 }); }
    return done(c, 5.6, 1.9, animFloat);
  }
  // ---------- 9. Roi-Hiver ----------
  function mRoiHiver() {
    const c = ctx2(), { body, head } = humanBase(c, { by: 2.7, lx: 0.65, lw: 0.8, legCol: 0x7fb8d8, footCol: 0x4a7a9a, hy: 2.25, ax: 1.4, ay: 1.4, al: 2.2, aw: 0.7, armCol: 0x8fc8e8, fist: 'dode', fistCol: 0xcfe8ff, fs: [0.5, 0.5, 0.5] });
    const sh = [c.add(body, 'box', 0x9ad8f0, [0, 0.6, 0], [2.0, 2.2, 1.2], { glow: 0.2 })]; sh.forEach(m => c.shell.push(m.material));
    for (let i = 0; i < 6; i++) c.add(body, 'box', 0xd8d0b0, [0, 1.4 - i * 0.38, 0.0], [2.1, 0.12, 1.3], { rot: [0, 0, (i % 2 ? 1 : -1) * 0.25] });
    for (const x of [-1, 1]) for (let k = 0; k < 3; k++) c.add(body, 'cone', 0xcfe8ff, [x * 1.35, 1.7 + k * 0.1, -0.2 + k * 0.3], [0.18, 0.9 + k * 0.4, 0.18], { glow: 0.5, rot: [0, 0, -x * (0.3 + k * 0.3)] });
    c.add(head, 'box', 0xcfc8b0, [0, 0, 0.02], [0.8, 0.9, 0.75]); for (const x of [-1, 1]) c.add(head, 'box', 0x4ac8ff, [x * 0.2, 0.08, 0.4], [0.16, 0.1, 0.05], { glow: 2.8, eye: true });
    for (let i = 0; i < 7; i++) { const a = (i - 3) / 3 * 1.2; c.add(head, 'cone', 0xcfe8ff, [Math.sin(a) * 0.55, 0.7, 0], [0.1, 0.8 + (3 - Math.abs(i - 3)) * 0.2, 0.1], { glow: 0.6 }); }
    const cape = c.joint(body, 'cape', [0, 1.5, -0.7]); c.add(cape, 'box', 0x4a7a9a, [0, -1.6, -0.1], [2.2, 3.0, 0.08], { opacity: 0.85 });
    const hand = c.parts.armR; c.add(hand, 'box', 0x4a7a9a, [0, -2.4, 0.5], [0.16, 0.16, 0.8]); c.add(hand, 'box', 0xcfe8ff, [0, -2.4, 2.4], [0.18, 0.5, 3.2], { glow: 0.8 }); c.add(hand, 'cone', 0xcfe8ff, [0, -2.4, 4.3], [0.25, 0.7, 0.25], { rot: [PI / 2, 0, 0], glow: 0.8 });
    const th = c.joint(c.root, 'fx', [0, 3.2, -2.0]); c.spin(th, 0.3); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.add(th, 'box', 0x9ad8f0, [Math.sin(a) * 2.6, Math.sin(i * 2) * 0.8, Math.cos(a) * 0.9], [0.3, 1.8, 0.2], { rot: [0, a, 0.1], glow: 0.7 }); }
    return done(c, 6.0, 2.2, animHuman);
  }
  // ---------- 10. Matrice ----------
  function mMatrice() {
    const c = ctx2(), body = c.joint(c.root, 'body', [0, 2.5, 0]); body.userData.y0 = 2.5;
    const h1 = c.add(body, 'sph', 0xc04070, [0.7, 0.3, 0], [1.4, 1.7, 1.3]), h2 = c.add(body, 'sph', 0xa03060, [-0.8, 0.0, 0.1], [1.3, 1.5, 1.2]); c.add(body, 'cone', 0x8a2050, [0, -1.6, 0], [1.9, 2.2, 1.6], { rot: [PI, 0, 0] });
    c.pulse(h1, 0.05, 2.6); c.pulse(h2, 0.06, 2.6);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.limb(body, [Math.sin(a) * 0.9, 0.9, Math.cos(a) * 0.7], [Math.sin(a) * 1.6, 2.6, Math.cos(a) * 1.2], 0.22, 0xe05a8a); c.add(body, 'sph', 0xe05a8a, [Math.sin(a) * 1.6, 2.7, Math.cos(a) * 1.2], 0.22); }
    const eye = c.add(body, 'sph', 0xfff2d0, [0, 0.2, 1.1], [0.55, 0.45, 0.2]); c.add(body, 'box', 0x200010, [0, 0.2, 1.28], [0.1, 0.5, 0.05]); c.add(body, 'sph', 0xff3a8a, [0, 0.2, 1.22], [0.16, 0.2, 0.05], { glow: 2.4, eye: true });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3, r = 1.8; const fl = c.joint(body, null, [Math.sin(a) * r, -1.5, Math.cos(a) * r]); c.add(fl, 'sph', 0xff7ac8, [0, 0.3, 0], [0.45, 0.4, 0.45]); for (let k = 0; k < 6; k++) { const b = k / 6 * TAU; c.add(fl, 'cone', 0xf0e8d8, [Math.sin(b) * 0.3, 0.55, Math.cos(b) * 0.3], [0.05, 0.22, 0.05], { rot: [PI, 0, 0] }); } c.sway(fl, 'z', 0.2, 1.7, i); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; const v = c.joint(c.root, null, [Math.sin(a) * 1.5, 0.3, Math.cos(a) * 1.5]); c.limb(v, [0, 0, 0], [Math.sin(a) * 3.0, 0.2, Math.cos(a) * 3.0], 0.28, 0xb03a6a); c.add(v, 'cone', 0xe05a8a, [Math.sin(a) * 3.1, 0.5, Math.cos(a) * 3.1], [0.2, 0.7, 0.2]); c.sway(v, 'y', 0.12, 1.2, i); }
    for (let i = 0; i < 4; i++) c.add(body, 'sph', 0xffc0d8, [Math.sin(i * 1.9) * 1.7, -0.6 + (i % 2), Math.cos(i * 1.9) * 1.4], [0.32, 0.4, 0.32], { glow: 0.6 });
    return done(c, 5.6, 2.8, null);
  }
  // ---------- 11. Prince des Cendres ----------
  function mPrinceCendres() {
    const c = ctx2(), { body, head } = humanBase(c, { by: 3.0, lx: 0.95, lw: 1.2, legCol: 0x2a1a18, footCol: 0x1a0a08, hy: 2.7, ax: 1.9, ay: 1.8, al: 2.6, aw: 0.95, armCol: 0x3a2420, fist: 'dode', fistCol: 0x4a2a22, fs: [0.9, 0.9, 0.9] });
    c.add(body, 'dode', 0x3a2420, [0, 0.6, 0], [2.0, 2.0, 1.4]); for (let i = 0; i < 7; i++) c.add(body, 'box', 0xff5a1a, [-1.2 + i * 0.4, 0.7 + (i % 2) * 0.5, 1.3], [0.08, 1.2, 0.05], { glow: 1.8, rot: [0, 0, 0.3 - i * 0.1] });
    c.add(body, 'sph', 0xffb02a, [0, 0.7, 1.15], 0.32, { glow: 2.2 });
    c.add(head, 'dode', 0x3a2420, [0, 0, 0], [0.85, 0.9, 0.8]); for (const x of [-1, 1]) { c.add(head, 'box', 0xffe04a, [x * 0.28, 0.1, 0.75], [0.22, 0.1, 0.05], { glow: 3, eye: true }); c.limb(head, [x * 0.5, 0.6, 0], [x * 1.4, 1.8, -0.3], 0.2, 0x1a0a08, { geo: 'cone' }); }
    c.add(head, 'box', 0xff5a1a, [0, -0.35, 0.7], [0.5, 0.1, 0.05], { glow: 1.6 });
    for (let i = 0; i < 5; i++) { const a = (i - 2) / 2 * 0.9; const f = c.add(head, 'cone', 0xff7a2a, [Math.sin(a) * 0.7, 1.0, -0.1], [0.14, 0.7, 0.14], { glow: -1 }); c.flames.push(f); }
    const wings = c.joint(body, 'wings', [0, 1.4, -0.9]); for (const x of [1, -1]) { const wl = c.joint(wings, null, [x * 0.4, 0, 0]); c.add(wl, 'cone', 0x2a1a18, [x * 1.7, 0.9, 0], [0.5, 3.4, 0.1], { rot: [0, 0, -x * 1.2] }); c.add(wl, 'cone', 0xff5a1a, [x * 2.3, 0.3, 0], [0.3, 2.4, 0.06], { rot: [0, 0, -x * 1.5], glow: 0.9 }); }
    const anchors = [[3.5, -1.5], [-3.5, -1.5], [3.0, 1.8], [-3.0, 1.8]]; const wrists = [[c.parts.armL, 1], [c.parts.armR, -1]];
    anchors.slice(0, 2).forEach(([x, z], i) => { const w = wrists[i][0]; c.limb(w, [0, -2.7, 0.1], [(x - (i ? -1.9 : 1.9)) * 0.9, -2.7 - 2.6, z * 0.6], 0.09, 0x9aa0b0); });
    anchors.forEach(([x, z]) => { c.add(c.root, 'box', 0x1a1a22, [x, 0.3, z], [0.9, 0.6, 0.9]); c.limb(c.root, [x, 0.6, z], [x * 0.3, 2.0, z * 0.3], 0.14, 0x9aa0b0); });
    return done(c, 6.6, 2.6, animHuman);
  }
  // ---------- 12. Œil qui Regarde ----------
  function mOeil() {
    const c = ctx2(), body = c.joint(c.root, 'body', [0, 3.2, 0]); body.userData.y0 = 3.2;
    c.add(body, 'sph', 0xe8e2d4, [0, 0, 0], [2.3, 2.3, 2.3]);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.limb(body, [Math.sin(a) * 0.8, Math.cos(a) * 0.8, 2.1], [Math.sin(a) * 1.8, Math.cos(a) * 1.8, 1.2], 0.04, 0xa02030, { glow: 0.3 }); }
    c.add(body, 'cyl', 0x6a3cff, [0, 0, 2.15], [1.1, 0.12, 1.1], { glow: 1.0, rot: [PI / 2, 0, 0] }); c.add(body, 'cyl', 0xb48cff, [0, 0, 2.22], [0.8, 0.1, 0.8], { glow: 1.4, rot: [PI / 2, 0, 0] });
    const pup = c.add(body, 'sph', 0x000000, [0, 0, 2.3], [0.22, 0.65, 0.12]); c.add(body, 'sph', 0xffffff, [0, 0, 2.33], [0.05, 0.62, 0.04], { glow: 2.6, eye: true }); c.pulse(pup, 0.08, 1.7);
    const ir = c.joint(body, 'ring2', [0, 0, 2.0]); c.add(ir, 'tor', 0xffffff, [0, 0, 0], [1.5, 1.5, 1.5], { glow: 1.0 }); c.add(ir, 'tor', 0x9a5cff, [0, 0, 0], [1.9, 1.9, 1.9], { glow: 0.7 });
    const lt = c.add(body, 'box', 0x0a0614, [0, 1.4, 1.2], [3.2, 1.2, 1.6]), lb = c.add(body, 'box', 0x0a0614, [0, -1.4, 1.2], [3.2, 1.2, 1.6]); c.lid = [lt, lb]; lt.userData.noOutline = lb.userData.noOutline = true;
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, tn = c.joint(body, null, [Math.sin(a) * 1.0, -1.8, Math.cos(a) * 1.0]); c.limb(tn, [0, 0, 0], [Math.sin(a) * 1.4, -2.6, Math.cos(a) * 1.4], 0.22, 0x7a2a3a, { geo: 'cone' }); c.add(tn, 'sph', 0xff4a6a, [Math.sin(a) * 1.4, -2.7, Math.cos(a) * 1.4], 0.16, { glow: 1.0 }); c.sway(tn, 'z', 0.3, 1.1, i); c.sway(tn, 'x', 0.25, 0.9, i * 0.6); }
    const stars = c.joint(c.root, 'fx', [0, 3.2, 0]); c.spin(stars, 0.35); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; c.add(stars, 'octa', i % 3 ? 0x6a5a8a : 0xfff2a0, [Math.sin(a) * 3.8, Math.sin(i * 1.7) * 1.0, Math.cos(a) * 3.8], 0.22 + (i % 3) * 0.06, { glow: i % 3 ? 0.4 : 1.6 }); }
    return done(c, 6.4, 2.8, animFloat);
  }
  // ---------- 13. Grand Marionnettiste ----------
  function mMarionnettiste() {
    const c = ctx2(), { body, head } = humanBase(c, { by: 3.0, lx: 0.3, lw: 0.3, legCol: 0x2a2a30, footCol: 0xb02a2a, hy: 2.3, ax: 0.8, ay: 1.5, al: 2.6, aw: 0.22, armCol: 0xb02a2a, fist: 'sph', fistCol: 0xf0e8d8, fs: [0.3, 0.3, 0.3] });
    for (const x of [-1, 1]) for (let k = 0; k < 2; k++) c.add(c.parts[x < 0 ? 'legR' : 'legL'], 'sph', 0x6b4a2a, [0, -0.9 - k * 1.0, 0], 0.22);
    c.add(body, 'box', 0xb02a2a, [0, 0.8, 0], [1.4, 2.2, 0.8]); c.add(body, 'cone', 0xb02a2a, [0, -0.8, -0.1], [1.4, 1.6, 0.9], { rot: [PI, 0, 0] }); for (let i = 0; i < 5; i++) c.add(body, 'sph', 0xffd23a, [0, 1.6 - i * 0.4, 0.43], 0.09, { glow: 0.9 });
    c.add(head, 'sph', 0xf8f0e0, [0, 0, 0], [0.5, 0.58, 0.45]); for (const x of [-1, 1]) c.add(head, 'box', 0xff4a4a, [x * 0.18, 0.1, 0.4], [0.14, 0.12, 0.05], { glow: 2.4, eye: true }); c.add(head, 'box', 0xc01818, [0, -0.2, 0.43], [0.5, 0.1, 0.03]);
    for (let i = 0; i < 6; i++) c.add(head, 'box', 0xf8f0e0, [-0.2 + i * 0.08, -0.2, 0.45], [0.03, 0.12, 0.02]);
    c.add(head, 'cyl', 0x15151f, [0, 0.62, 0], [0.62, 0.05, 0.62]); c.add(head, 'cyl', 0x15151f, [0, 1.0, 0], [0.42, 0.75, 0.42]); c.add(head, 'cyl', 0xc01818, [0, 0.72, 0], [0.43, 0.12, 0.43]);
    for (const [n, x] of [['armL', 1], ['armR', -1]]) { const a = c.parts[n]; for (let k = 0; k < 5; k++) c.limb(a, [x * 0.0, -2.85, 0.05], [(k - 2) * 0.16, -3.6, 0.25], 0.05, 0xf8f0e0, { geo: 'cone' }); }
    const bar = c.joint(c.root, 'fx', [0, 8.2, 0]); c.add(bar, 'box', 0x6b4a2a, [0, 0, 0], [3.2, 0.16, 0.16]); c.sway(bar, 'z', 0.12, 1.2, 0); c.sway(bar, 'x', 0.08, 0.8, 1);
    for (const [x, y, z] of [[-1.4, 0, 0], [1.4, 0, 0], [0, 0, 0.4], [0, 0, -0.4]]) c.limb(c.root, [x, 8.2, z], [x * 0.5, 6.0, 0], 0.025, 0xf0e8d8);
    return done(c, 5.8, 1.7, animHuman);
  }
  // ---------- adds de mécanique ----------
  function addRacine() { const c = ctx2(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.limb(c.root, [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], [Math.sin(a) * 0.9, 1.5 + (i % 2) * 0.5, Math.cos(a) * 0.9], 0.2, 0x3a2a1a, { geo: 'cone' }); c.add(c.root, 'octa', 0x9aff66, [Math.sin(a) * 0.9, 1.6 + (i % 2) * 0.5, Math.cos(a) * 0.9], 0.1, { glow: 1.4 }); } c.add(c.root, 'sph', 0x2a1e12, [0, 0.4, 0], [0.7, 0.55, 0.7]); return finish(c, 2.2, 0.8, null, 0.04); }
  function addNiche() { const c = ctx2(); c.add(c.root, 'box', 0x4a463c, [0, 1.2, 0], [1.6, 2.4, 0.8]); c.add(c.root, 'box', 0x0a0a0a, [0, 1.2, 0.2], [1.1, 1.9, 0.5]); for (let i = 0; i < 5; i++) { c.add(c.root, 'sph', bone, [(i - 2) * 0.24, 0.5 + (i % 2) * 0.25, 0.45], [0.2, 0.22, 0.2]); } c.add(c.root, 'sph', 0x6aff6a, [0, 1.7, 0.4], 0.14, { glow: 2 }); return finish(c, 2.6, 0.9, null, 0.04); }
  function addBourgeon() { const c = ctx2(), b = c.joint(c.root, 'body', [0, 1.0, 0]); c.add(b, 'sph', 0xff7ac8, [0, 0, 0], [0.7, 0.9, 0.7], { glow: 0.6 }); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.add(b, 'cone', 0xe05a8a, [Math.sin(a) * 0.4, 0.7, Math.cos(a) * 0.4], [0.2, 0.8, 0.2], { rot: [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4] }); } c.add(b, 'sph', 0xfff2d0, [0, 0.1, 0.55], 0.14, { glow: 2, eye: true }); c.add(c.root, 'cyl', 0x3a2a1a, [0, 0.15, 0], [0.5, 0.15, 0.5]); const r = finish(c, 2.2, 0.8, (ud, t) => { b.scale.setScalar(1 + 0.08 * Math.sin(t * 4)); }, 0.04); r.userData.glowMats = c.mats.slice(0, 2); return r; }
  function addMot() { const c = ctx2(), b = c.joint(c.root, 'body', [0, 1.5, 0]); c.add(b, 'tor', 0xffffff, [0, 0, 0], [0.6, 0.6, 0.6], { glow: 1.4, rune: true }); c.add(b, 'octa', 0xffffff, [0, 0, 0], [0.25, 0.4, 0.25], { glow: 2.2, rune: true }); c.add(b, 'box', 0xffffff, [0, 0, 0], [0.7, 0.06, 0.06], { glow: 1.6, rune: true }); return finish(c, 2.4, 0.8, (ud, t) => { b.rotation.y = t * 2; b.position.y = 1.5 + Math.sin(t * 3) * 0.15; }, 0.03); }

  // ---------- MINI-BOSS (silhouettes propres) ----------
  const MINI = {
    mine_foreuse_vivante() { const c = ctx2(), b = c.joint(c.root, 'body', [0, 1.4, 0]); b.userData.y0 = 1.4; c.add(b, 'cyl', 0x6a5a4a, [0, 0, 0], [1.2, 1.5, 1.2], { rot: [PI / 2, 0, 0] }); const dr = c.joint(b, null, [0, 0, 1.9]); c.add(dr, 'cone', 0xcfd6e2, [0, 0, 0.8], [0.95, 2.0, 0.95], { rot: [PI / 2, 0, 0] }); for (let i = 0; i < 3; i++) c.add(dr, 'tor', 0x8a8f9c, [0, 0, 0.3 + i * 0.5], [0.8 - i * 0.2, 0.8 - i * 0.2, 1], {}); c.spin(dr, 6, 'z'); for (let i = 0; i < 4; i++) c.add(b, 'sph', bone, [(i - 1.5) * 0.6, 0.9, -0.3 + (i % 2) * 0.6], [0.26, 0.3, 0.26]); c.add(b, 'sph', 0xfff2a0, [0, 0.4, 1.2], 0.25, { glow: 2, eye: true }); for (const x of [-1, 1]) c.add(c.root, 'box', 0x3a3a42, [x * 1.2, 0.4, 0], [0.5, 0.8, 2.6]); return done(c, 3.0, 1.8, null); },
    foret_sorciere_ronces() { return robed({ scale: 1.0, orbitN: 5, orbitGeo: 'tet', staff: true, h: 3.6, r: 1.2, pal: { robe: 0x2a4a2a, dark: 0x0f1f0f, trim: 0x9aff66, glow: 0x9aff66, eye: 0xff4ae0, skin: 0xb8c8a0 }, extra: (c, p, s) => { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.add(c.parts.body, 'cone', 0x3a2a1a, [Math.sin(a) * 1.1 * s, -1.2 * s + (i % 3) * 0.5, Math.cos(a) * 1.1 * s], [0.08 * s, 0.7 * s, 0.08 * s], { rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9] }); } } }); },
    cata_fossoyeur_eternel() { return humanoid({ scale: 1.15, heavy: 1.2, head: 'hood', weapon: 'axe', h: 3.8, r: 1.5, pal: { skin: 0x5a5a4a, dark: 0x2a2a22, trim: 0x8a8a6a, cloth: 0x2a2a30, eye: 0x9aff9a }, extra: (c, p, s) => { c.add(c.parts.body, 'box', 0x4a3a2a, [-1.0 * s, 0.2, -0.7 * s], [0.8 * s, 1.0 * s, 0.6 * s]); c.add(c.parts.armL, 'cyl', 0x2a2a22, [0, -1.8 * s, 0.1], [0.05, 0.5 * s, 0.05]); c.add(c.parts.armL, 'sph', 0xffb04a, [0, -2.4 * s, 0.1], 0.25 * s, { glow: 1.6 }); } }); },
    chateau_majordome() { return humanoid({ scale: 1.0, heavy: 0.85, head: 'none', h: 4.0, r: 1.1, pal: { skin: 0xf0f0f4, dark: 0x15151f, trim: 0xcfd6e2, cloth: 0x15151f, eye: 0xff4a4a }, extra: (c, p, s) => { const h = c.parts.head; c.add(h, 'sph', 0xcfd6e2, [0, 0.2, 0], [0.6 * s, 0.55 * s, 0.6 * s]); c.add(h, 'sph', 0xcfd6e2, [0, 0.8 * s, 0], 0.14 * s); c.add(c.parts.armL, 'cyl', 0xcfd6e2, [0, -1.5 * s, 0.7 * s], [0.9 * s, 0.05, 0.9 * s]); c.add(c.parts.body, 'cone', 0x15151f, [0, -0.9 * s, -0.4 * s], [0.5 * s, 2.0 * s, 0.4 * s], { rot: [PI, 0, 0] }); } }); },
    cathe_kraken_orgue() { return tentacled({ scale: 1.0, tentacles: 7, h: 4.4, r: 2.2, pal: { skin: 0x2a5a7a, dark: 0x123a50, glow: 0x6affd8, eye: 0xfff06a }, extra: (c, p, s) => { for (let i = 0; i < 9; i++) c.add(c.parts.body, 'cyl', 0xc8a24a, [(i - 4) * 0.4 * s, (1.8 + Math.sin(i * 0.7) * 0.8) * s, -0.9 * s], [0.14 * s, (1.4 + Math.sin(i * 0.7)) * s, 0.14 * s], { glow: 0.3 }); } }); },
    temple_grand_pretre() { return robed({ scale: 1.2, orbitN: 4, orbitGeo: 'sph', staff: true, crown: true, h: 4.2, r: 1.5, pal: { robe: 0x8a1010, dark: 0x2a0505, trim: 0xffd23a, glow: 0xff3030, eye: 0xffd23a, skin: 0xc8a24a } }); },
    asile_chirurgien() { return humanoid({ scale: 1.15, heavy: 0.9, head: 'none', h: 4.2, r: 1.3, pal: { skin: 0xe8e8f0, dark: 0x3a3f50, trim: 0xcfd6e2, cloth: 0x9a6aff, eye: 0x9a6aff }, extra: (c, p, s) => { const b = c.parts.body, h = c.parts.head; c.add(h, 'sph', 0xefe6ee, [0, 0, 0.02], [0.45 * s, 0.5 * s, 0.42 * s]); c.add(h, 'cone', 0xcfd6e2, [0, -0.1, 0.5 * s], [0.14 * s, 0.7 * s, 0.14 * s], { rot: [PI / 2, 0, 0] }); for (const x of [-1, 1]) for (let k = 0; k < 2; k++) { const ex = c.joint(b, null, [x * 0.9 * s, (0.6 - k * 0.5) * s, -0.1]); c.limb(ex, [0, 0, 0], [x * 1.4 * s, -0.4 * s, 0.9 * s], 0.09 * s, 0xe8e8f0); c.add(ex, 'cone', 0xcfd6e2, [x * 1.5 * s, -0.4 * s, 1.4 * s], [0.06 * s, 0.9 * s, 0.03 * s], { rot: [PI / 2, 0, 0], glow: 0.5 }); c.sway(ex, 'x', 0.3, 2 + k, x); } } }); },
    biblio_index_vivant() { const c = ctx2(), b = c.joint(c.root, 'body', [0, 1.9, 0]); b.userData.y0 = 1.9; c.add(b, 'box', 0x5a3b22, [0, 0.4, 0], [2.0, 2.6, 1.2]); for (let i = 0; i < 12; i++) { const x = (i % 3 - 1) * 0.62, y = 1.35 - Math.floor(i / 3) * 0.62; c.add(b, 'box', 0x7a5632, [x, y, 0.62], [0.55, 0.5, 0.06]); c.add(b, 'box', 0xe0c060, [x, y + 0.1, 0.67], [0.2, 0.06, 0.03], { glow: 0.5 }); } const dr = c.joint(b, null, [0.62, 0.7, 0.62]); c.add(dr, 'box', 0x7a5632, [0, 0, 0.6], [0.55, 0.5, 1.2]); c.add(dr, 'box', 0xf0e8d0, [0, 0.3, 0.6], [0.4, 0.04, 0.9], { glow: 0.6 }); c.sway(dr, 'x', 0.15, 2, 0); for (const x of [-1, 1]) { c.add(b, 'box', 0xff4a4a, [x * 0.4, 1.5, 0.64], [0.2, 0.1, 0.05], { glow: 2.4, eye: true }); c.add(c.root, 'box', 0x3a2a1a, [x * 0.7, 0.3, 0], [0.4, 0.6, 0.5]); } return done(c, 3.8, 1.5, null); },
    necropole_bourreau_givre() { return humanoid({ scale: 1.3, heavy: 1.35, head: 'hood', weapon: 'axe', h: 4.6, r: 1.8, pal: { skin: 0x7fb8d8, dark: 0x2a4a6a, trim: 0xcfe8ff, cloth: 0x1a2a3a, eye: 0x4ac8ff }, extra: (c, p, s) => { for (let i = 0; i < 5; i++) c.add(c.parts.body, 'cone', 0xcfe8ff, [(i - 2) * 0.35 * s, 1.6 * s, -0.5 * s], [0.1 * s, 0.7 * s, 0.1 * s], { glow: 0.5 }); c.add(c.parts.armR, 'box', 0xcfe8ff, [0, -1.5 * s, 1.5 * s], [0.14 * s, 1.1 * s, 0.9 * s], { glow: 0.7 }); } }); },
    jardin_jardinier_chef() { return humanoid({ scale: 1.2, heavy: 1.2, head: 'none', h: 4.2, r: 1.6, pal: { skin: 0xd88a9a, dark: 0x6a2a3a, trim: 0x9aff66, cloth: 0x3a6a2a, eye: 0xffe04a }, extra: (c, p, s) => { const h = c.parts.head; c.add(h, 'sph', 0xd88a9a, [0, 0, 0], [0.45 * s, 0.5 * s, 0.45 * s]); c.add(h, 'cyl', 0xc8a24a, [0, 0.45 * s, 0], [0.9 * s, 0.06, 0.9 * s]); c.add(h, 'cyl', 0xc8a24a, [0, 0.65 * s, 0], [0.45 * s, 0.4 * s, 0.45 * s]); const a = c.parts.armR; c.add(a, 'box', 0xcfd6e2, [-0.2, -1.6 * s, 1.5 * s], [0.06, 0.3 * s, 2.0 * s], { rot: [0, 0.2, 0] }); c.add(a, 'box', 0xcfd6e2, [0.2, -1.6 * s, 1.5 * s], [0.06, 0.3 * s, 2.0 * s], { rot: [0, -0.2, 0] }); for (let i = 0; i < 4; i++) c.add(c.parts.body, 'sph', 0xff7ac8, [(i - 1.5) * 0.5 * s, 0.9 * s, 0.62 * s], 0.18 * s, { glow: 0.6 }); } }); },
    abime_bourreau_chaines() { return humanoid({ scale: 1.35, heavy: 1.35, head: 'none', weapon: 'hammer', spikes: true, h: 4.8, r: 1.8, pal: { skin: 0x3a2420, dark: 0x1a0a08, trim: 0xff5a1a, glow: 0xff5a1a, eye: 0xffe04a }, extra: (c, p, s) => { const h = c.parts.head; c.add(h, 'box', 0x1a1a22, [0, 0, 0.05], [0.85 * s, 0.9 * s, 0.8 * s]); c.add(h, 'box', 0xffe04a, [0, 0.05, 0.45 * s], [0.5 * s, 0.07, 0.04], { glow: 2.5, eye: true }); const b = c.parts.body; for (let i = 0; i < 3; i++) c.add(b, 'tor', 0x9aa0b0, [0, 0.8 * s - i * 0.45 * s, 0], [1.1 * s, 0.7 * s, 0.9 * s], { rot: [PI / 2, 0, 0] }); } }); },
    obs_horloger_cosmique() { return robed({ scale: 1.25, ring: 'clock', orbitN: 6, orbitGeo: 'tor', h: 4.6, r: 1.6, pal: { robe: 0x2a1a4a, dark: 0x0a0618, trim: 0xffd23a, glow: 0xb48cff, eye: 0xffffff, skin: 0x3a2a5a }, extra: (c, p, s) => { const t = c.joint(c.parts.body, null, [0, 0.5 * s, 0.7 * s]); c.add(t, 'cyl', 0xffd23a, [0, 0, 0], [0.6 * s, 0.05, 0.6 * s], { rot: [PI / 2, 0, 0], glow: 0.9 }); c.add(t, 'box', 0xffffff, [0, 0.2 * s, 0.06], [0.05, 0.4 * s, 0.03], { glow: 1.6 }); c.spin(t, 1.2, 'z'); } }); },
    foire_homme_canon() { return humanoid({ scale: 1.1, heavy: 1.25, head: 'helm', h: 3.6, r: 1.4, pal: { skin: 0xd8b08a, dark: 0xb02a2a, trim: 0xffd23a, cloth: 0xb02a2a, eye: 0xffd23a }, extra: (c, p, s) => { const b = c.parts.body; c.add(b, 'cyl', 0x3a3a42, [0.6 * s, 1.5 * s, -0.2 * s], [0.5 * s, 1.6 * s, 0.5 * s], { rot: [1.0, 0, 0] }); c.add(b, 'cyl', 0x15151f, [0.6 * s, 2.2 * s, 0.6 * s], [0.38 * s, 0.1, 0.38 * s], { rot: [1.0, 0, 0] }); for (let i = 0; i < 4; i++) c.add(c.parts.legL, 'box', i % 2 ? 0xffffff : 0xb02a2a, [0, -0.3 - i * 0.28, 0], [0.56 * s, 0.14, 0.58 * s]); } }); },
  };

  const V5 = {
    mine_golem_grisou: mGolemGrisou, foret_roi_sylve: mRoiSylve, cata_roi_ossements: mRoiOssements, chateau_comtesse_ecarlate: mComtesse,
    cathe_mere_des_marees: mMereMarees, temple_dieu_ecorche: mDieuEcorche, asile_directeur_faille: mDirecteur, biblio_auteur_sans_nom: mAuteur,
    necropole_roi_hiver: mRoiHiver, jardin_matrice: mMatrice, abime_prince_cendres: mPrinceCendres, obs_oeil_qui_regarde: mOeil, foire_grand_marionnettiste: mMarionnettiste,
  };
  Object.keys(V5).forEach(id => { MODELS[id] = V5[id]; });
  Object.keys(MINI).forEach(id => { MODELS[id] = MINI[id]; });

  function registerAll() {
    if (!G.GFX || !G.GFX.registerModel) return false;
    Object.keys(MODELS).forEach(id => G.GFX.registerModel('boss', id, MODELS[id]));
    // mêmes modèles disponibles comme « ennemis » (mini-boss lancés via spawnEnemy, reflets…)
    const adds = { boss_cristal: addCristal, boss_totem: addTotem, boss_etendard: addEtendard, boss_phylactere: addPhylactere, boss_echo: addEcho, boss_racine: addRacine, boss_niche: addNiche, boss_bourgeon: addBourgeon, boss_mot: addMot };
    Object.keys(adds).forEach(id => G.GFX.registerModel('enemy', id, adds[id]));
    return true;
  }
  registerAll();
  G.BossModels = { ids: Object.keys(MODELS), humanoid, robed, beast, tentacled, crystalBoss, register: registerAll };
})();
