window.G = window.G || {};
// =====================================================================
//  vfx.js — Rôle 6 : bibliothèque d'effets visuels 3D (G.VFX).
//  Pooling total (particules + meshes), géométries/matériaux partagés,
//  MeshBasicMaterial additifs, <= 300 particules, aucune lumière dynamique
//  sauf UN flash ponctuel réutilisé (PointLight unique, désactivable).
//  Boucle propre via G.core.onRender. Défensif : sans THREE/G.core -> no-op.
//
//  NOMS POUR G.VFX.play(name, pos, opts)   (pos = Vector3 | Object3D | {x,y,z} | {pos} | {mesh})
//   Par élément (<base>_<element>, element = physique|feu|glace|foudre|ombre|sacre|poison) :
//     hit_<el>        petite gerbe d'impact          opts:{crit, power}
//     crit_<el>       gros impact critique (étoile)  opts:{power}
//     explosion_<el>  explosion complète             opts:{radius}
//     slash_<el>      arc de lame                    opts:{dir, radius, arc}
//     cast_<el>       charge de sort (particules aspirées vers pos)
//     nova_<el>       onde circulaire + débris       opts:{radius}
//     aoe_<el>        zone au sol (décal + ondes)    opts:{radius, dur}
//     pillar_<el>     colonne d'énergie              opts:{height, dur}
//     beam_<el>       rayon                          opts:{to:pos2, dur}
//     bolt_<el>       éclair coloré                  opts:{to:pos2, dur}
//   Alias sans élément : hit, crit, explosion, slash, cast, nova, aoe, pillar (opts.element, défaut physique)
//   Spéciaux : levelup | rankup (opts.rank) | summon | shadow_rise | necro_awaken | boss_phase
//     heal | mana | buff (opts.color) | soul | death | dash | teleport | shockwave | ground_slam
//     lightning_strike | poison_cloud | holy_cross | holy_pillar | ice_spikes | shadow_flames
//     legendary | loot_beam (opts.color) | portal_open | pickup | rank_aura (target, opts.rank)
//     frost_nova | fire_nova | stun | decal (opts.element, radius, dur)
// =====================================================================
(() => {
  const G = window.G;
  const API = ['play', 'slash', 'explosion', 'beam', 'lightning', 'aura', 'rankAura', 'portal', 'summonCircle', 'shadowRise',
    'levelUpBurst', 'rankUp', 'hitSpark', 'trailOn', 'groundDecal', 'screenFlash', 'flashLight', 'emit', 'clear', 'stats', 'later'];
  if (typeof THREE === 'undefined') {
    const noopH = () => ({ remove() {} });
    G.VFX = { colors: {}, settings: {}, disabled: true };
    API.forEach(n => { G.VFX[n] = n === 'portal' ? () => null : (n === 'aura' || n === 'trailOn' || n === 'rankAura' ? noopH : () => {}); });
    return;
  }
  const T = THREE;

  // ------------------------------------------------------------------
  //  PALETTES
  // ------------------------------------------------------------------
  const PAL = {
    physique: { main: 0xffe9a8, hi: 0xffffff, lo: 0xffb92e, dark: 0x6a5a3a, cols: [0xffffff, 0xfff2a0, 0xffd54a] },
    feu:      { main: 0xff7a1a, hi: 0xffe08a, lo: 0xd62800, dark: 0x2a1410, cols: [0xff4a0a, 0xff7a1a, 0xffb02e, 0xffe08a] },
    glace:    { main: 0x8fdcff, hi: 0xffffff, lo: 0x3a8dff, dark: 0x1d3a66, cols: [0xffffff, 0xc8f2ff, 0x8fdcff, 0x5ab4ff] },
    foudre:   { main: 0xfff04a, hi: 0xffffff, lo: 0x9b7bff, dark: 0x2a2060, cols: [0xffffff, 0xfff04a, 0xbfe6ff] },
    ombre:    { main: 0x8a35e0, hi: 0xd9a6ff, lo: 0x2a0d4a, dark: 0x0c0418, cols: [0x1a0830, 0x4a1a8a, 0x8a35e0, 0xc07bff] },
    sacre:    { main: 0xffd95a, hi: 0xffffff, lo: 0xffa820, dark: 0x7a5a10, cols: [0xffffff, 0xfff0a0, 0xffd95a, 0xffb020] },
    poison:   { main: 0x5ee03a, hi: 0xc8ff7a, lo: 0x1f7a1e, dark: 0x143a12, cols: [0x2a9a1e, 0x5ee03a, 0xa6ff5a] },
  };
  const RC = { E: 0x9aa3ad, D: 0x4fd17a, C: 0x3fa9ff, B: 0xb44dff, A: 0xff8a1a, S: 0xff3d3d, SS: 0xffd700 };
  const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
  const colors = {};
  for (const k in PAL) colors[k] = PAL[k].main;

  const S = { quality: 1, maxParticles: 300, flashLight: true, autoEvents: true, screenFlash: true, adaptive: true };
  const rr = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const TAU = Math.PI * 2;
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const N = n => (n <= 2 ? n : Math.max(1, Math.round(n * S.quality)));

  function colorOf(c, d) {
    if (typeof c === 'number') return c;
    if (typeof c === 'string') {
      if (PAL[c]) return PAL[c].main;
      if (RC[c]) return RC[c];
      const m = /^#?([0-9a-f]{6})$/i.exec(c); if (m) return parseInt(m[1], 16);
    }
    return d == null ? 0xffffff : d;
  }
  const palOf = el => PAL[el] || PAL.physique;

  // ------------------------------------------------------------------
  //  GÉOMÉTRIES PARTAGÉES
  // ------------------------------------------------------------------
  const GEO = {};
  function buildGeo() {
    if (GEO.box) return;
    GEO.box = new T.BoxGeometry(1, 1, 1);
    GEO.sph = new T.SphereGeometry(0.5, 10, 8);
    GEO.sphLo = new T.SphereGeometry(0.5, 6, 5);
    GEO.ring = new T.RingGeometry(0.86, 1, 40);
    GEO.ringThin = new T.RingGeometry(0.94, 1, 48);
    GEO.disc = new T.CircleGeometry(1, 32);
    GEO.cone = new T.ConeGeometry(0.5, 1, 8); GEO.cone.translate(0, 0.5, 0);
    GEO.cyl = new T.CylinderGeometry(0.5, 0.5, 1, 16, 1, true); GEO.cyl.translate(0, 0.5, 0);
    GEO.cylTaper = new T.CylinderGeometry(0.3, 0.5, 1, 16, 1, true); GEO.cylTaper.translate(0, 0.5, 0);
    GEO.octa = new T.OctahedronGeometry(0.5);
    GEO.tetra = new T.TetrahedronGeometry(0.5);
    GEO.plane = new T.PlaneGeometry(1, 1);
    GEO.torus = new T.TorusGeometry(1, 0.04, 6, 40);
    GEO.arcs = {};
  }
  // arc de lame centré vers +Z (une fois posé à plat via rotation.x = -PI/2, order YXZ)
  function arcGeo(arc, inner) {
    const key = Math.round(arc * 8) + '|' + Math.round(inner * 20);
    return GEO.arcs[key] || (GEO.arcs[key] = new T.RingGeometry(inner, 1, Math.max(6, Math.round(arc * 8)), 1, -Math.PI / 2 - arc / 2, arc));
  }

  // ------------------------------------------------------------------
  //  TEXTURES CANVAS (facultatives : si canvas absent -> repli en géométries)
  // ------------------------------------------------------------------
  const TEX = {};
  let texBuilt = false;
  function canvasTex(size, draw) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); if (!g) return null;
      draw(g, size);
      return new T.CanvasTexture(c);
    } catch (_) { return null; }
  }
  function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function buildTex() {
    if (texBuilt) return; texBuilt = true;
    TEX.spiral = canvasTex(256, (g, s) => {
      g.translate(s / 2, s / 2); g.lineCap = 'round';
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, s / 2, 0, TAU); g.fill();
      for (let arm = 0; arm < 4; arm++) {
        let px = 0, py = 0;
        for (let i = 1; i <= 90; i++) {
          const a = arm * Math.PI / 2 + i * 0.085, r = (i / 90) * s * 0.47;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          g.strokeStyle = 'rgba(255,255,255,' + (0.15 + 0.85 * i / 90) + ')'; g.lineWidth = 2 + 9 * i / 90;
          g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); px = x; py = y;
        }
      }
    });
    TEX.rune = canvasTex(256, (g, s) => {
      const r = lcg(7); g.translate(s / 2, s / 2); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
      const circ = (rad, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, rad * s, 0, TAU); g.stroke(); };
      circ(0.47, 5); circ(0.43, 2); circ(0.30, 3); circ(0.16, 2);
      for (let i = 0; i < 28; i++) {
        g.save(); g.rotate(i / 28 * TAU); g.lineWidth = 3; g.beginPath();
        let x = 0.345 * s, y = 0; g.moveTo(x, y);
        for (let k = 0; k < 3; k++) { x = (0.335 + r() * 0.08) * s; y = (r() - 0.5) * 0.05 * s; g.lineTo(x, y); }
        g.stroke(); g.restore();
      }
      g.lineWidth = 3;
      for (let t = 0; t < 2; t++) {
        g.beginPath();
        for (let i = 0; i < 3; i++) { const a = t * Math.PI / 3 + i * TAU / 3 - Math.PI / 2; const x = Math.cos(a) * 0.3 * s, y = Math.sin(a) * 0.3 * s; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.closePath(); g.stroke();
      }
      g.beginPath(); g.arc(0, 0, 0.035 * s, 0, TAU); g.fill();
    });
    TEX.splat = canvasTex(128, (g, s) => {
      const r = lcg(31); g.translate(s / 2, s / 2);
      for (let i = 0; i < 16; i++) {
        const a = r() * TAU, d = r() * 0.22 * s, rad = (0.14 + r() * 0.2) * s;
        const gr = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, rad);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, rad, 0, TAU); g.fill();
      }
    });
    const branches = (seed, n, w) => (g, s) => {
      const r = lcg(seed); g.translate(s / 2, s / 2); g.strokeStyle = '#fff'; g.lineCap = 'round';
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.3); rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, s * 0.3, 0, TAU); g.fill();
      for (let i = 0; i < n; i++) {
        let a = i / n * TAU + r() * 0.2, x = 0, y = 0; g.lineWidth = w;
        for (let k = 0; k < 6; k++) {
          const len = (0.07 + r() * 0.05) * s; const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
          g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
          if (k > 0 && k < 5) { const b = a + (r() < 0.5 ? 1 : -1) * 0.7; g.lineWidth = w * 0.6; g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + Math.cos(b) * len * 0.8, ny + Math.sin(b) * len * 0.8); g.stroke(); g.lineWidth = w; }
          x = nx; y = ny; a += (r() - 0.5) * 0.5;
        }
      }
    };
    TEX.frost = canvasTex(256, branches(5, 8, 4));
    TEX.crack = canvasTex(256, branches(11, 7, 3));
  }

  // ------------------------------------------------------------------
  //  RACINE, MATÉRIAUX, POOLS
  // ------------------------------------------------------------------
  let root = null, inited = false, light = null;
  const NULLMAT = new T.MeshBasicMaterial({ color: 0 });
  let DUMMY = null;
  const MAXM = 190;          // meshes "génériques" (anneaux, barres, blobs, décals)
  const pools = { plain: [], map: [] };
  let madeM = 0, usedM = 0;
  const pmats = {};
  function pmat(color, mode) {   // mode: 'a' additif, 'n' normal translucide, 'f' plume double-face additive
    const k = color + mode;
    if (pmats[k]) return pmats[k];
    const o = { color, transparent: true, depthWrite: false };
    if (mode === 'a' || mode === 'f') o.blending = T.AdditiveBlending;
    if (mode === 'n') o.opacity = 0.62;
    if (mode === 'f') o.side = T.DoubleSide;
    return (pmats[k] = new T.MeshBasicMaterial(o));
  }
  function ensure() {
    if (inited) return !!root;
    const core = G.core;
    if (!core || !core.scene || !core.onRender) return false;
    inited = true;
    buildGeo();
    root = new T.Group(); root.name = 'vfx-root';
    core.scene.add(root);
    DUMMY = new T.Mesh(GEO.box, new T.MeshBasicMaterial({ color: 0 })); DUMMY.rotation.order = 'YXZ';
    try {
      light = new T.PointLight(0xffffff, 0, 16, 2); light.name = 'vfx-flash'; root.add(light);
    } catch (_) { light = null; }
    core.onRender(frame);
    bindBus();
    return true;
  }
  function acq(kind, geo, color, op, add) {
    let m = pools[kind].pop();
    if (!m) {
      if (madeM >= MAXM) return DUMMY;
      if (kind === 'map') buildTex();
      const mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      if (kind === 'map') mat.map = TEX.splat || TEX.rune || TEX.spiral || null;
      m = new T.Mesh(GEO.box, mat); m.rotation.order = 'YXZ'; m.frustumCulled = false; m.userData.vk = kind;
      root.add(m); madeM++;
    }
    m.geometry = geo; m.visible = true; usedM++;
    m.material.color.setHex(color); m.material.opacity = op == null ? 1 : op;
    m.material.blending = add === false ? T.NormalBlending : T.AdditiveBlending;
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.userData.sk = 1; m.renderOrder = 0;
    return m;
  }
  function acqTex(name, fallbackGeo, color, op, add) {
    buildTex();
    if (TEX[name]) {
      const m = acq('map', GEO.plane, color, op, add);
      if (m !== DUMMY) m.material.map = TEX[name];
      m.userData.sk = 1; return m;
    }
    const m = acq('plain', fallbackGeo, color, op, add); m.userData.sk = 0.5; return m;
  }
  function rel(m) {
    if (!m || m === DUMMY) return;
    m.visible = false; usedM--;
    pools[m.userData.vk].push(m);
  }
  const setFlat = (m, size) => { const s = size * (m.userData.sk || 1); m.scale.set(s, s, 1); };
  const flat = m => { m.rotation.set(-Math.PI / 2, m.rotation.y, 0); return m; };

  // ------------------------------------------------------------------
  //  PARTICULES
  // ------------------------------------------------------------------
  const pFree = [], pAct = [];
  let madeP = 0;
  const SHAPES = () => ({ box: GEO.box, sph: GEO.sphLo, octa: GEO.octa, tetra: GEO.tetra, plane: GEO.plane });
  let shapeMap = null;
  // shape, color, add(true|false|'f'), position, vitesse, vie, taille, options
  function P(shape, color, add, x, y, z, vx, vy, vz, life, size, o) {
    if (!root) return false;
    o = o || {};
    if (pAct.length >= Math.min(S.maxParticles, 300)) return false;
    let p = pFree.pop();
    if (!p) {
      const m = new T.Mesh(GEO.box, NULLMAT); m.frustumCulled = false; m.visible = false; root.add(m);
      p = { m, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }; madeP++;
    }
    if (!shapeMap) shapeMap = SHAPES();
    const m = p.m;
    m.geometry = shapeMap[shape] || GEO.box;
    m.material = pmat(color, add === 'f' ? 'f' : (add === false ? 'n' : 'a'));
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.t = 0; p.life = Math.max(0.05, life); p.size = size; p.end = o.end == null ? 0.2 : o.end;
    p.grav = o.grav || 0; p.drag = o.drag || 0; p.spin = o.spin || 0; p.sy = o.sy || 1; p.floor = o.floor;
    p.fade = o.fade == null ? 0.5 : o.fade;
    p.pull = o.pull || 0; p.swirl = o.swirl || 0; p.cx = o.cx || 0; p.cz = o.cz || 0;
    m.position.set(x, y, z); m.scale.set(size, size * p.sy, size);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.visible = true; pAct.push(p);
    return true;
  }
  function updateParticles(dt) {
    for (let i = pAct.length - 1; i >= 0; i--) {
      const p = pAct[i]; p.t += dt;
      const k = p.t / p.life;
      let dead = k >= 1;
      if (!dead) {
        if (p.pull) {
          const dx = p.cx - p.x, dz = p.cz - p.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001;
          const nx = dx / d, nz = dz / d;
          p.vx += (nx * p.pull - nz * p.swirl) * dt; p.vz += (nz * p.pull + nx * p.swirl) * dt;
          if (d < 0.3) dead = true;
        }
        p.vy -= p.grav * dt;
        if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        const fo = p.fade > 0 && k > 1 - p.fade ? (1 - k) / p.fade : 1;
        const s = Math.max(0.001, p.size * (1 + (p.end - 1) * k) * fo);
        const m = p.m;
        m.position.set(p.x, p.y, p.z); m.scale.set(s, s * p.sy, s);
        if (p.spin) { m.rotation.x += p.spin * dt; m.rotation.y += p.spin * 0.7 * dt; }
      }
      if (dead) { p.m.visible = false; pAct.splice(i, 1); pFree.push(p); }
    }
  }

  // ------------------------------------------------------------------
  //  ENTITÉS (effets animés) + TIMERS
  // ------------------------------------------------------------------
  const ents = [], timers = [];
  const MAXE = 90;
  function ent(life, upd, o) {
    if (!root) return null;
    if (ents.length >= MAXE) endEnt(ents[0], 0);
    const e = { t: 0, life, upd, ms: [], dead: false, removing: false, fade: 1 };
    if (o) Object.assign(e, o);
    ents.push(e); return e;
  }
  function endEnt(e, idx) {
    if (e.onEnd) { try { e.onEnd(e); } catch (_) {} }
    for (const m of e.ms) rel(m);
    e.ms.length = 0; e.dead = true;
    if (idx == null) idx = ents.indexOf(e);
    if (idx >= 0) ents.splice(idx, 1);
  }
  const em = (e, m) => { e.ms.push(m); return m; };
  function updateEnts(dt) {
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i]; if (e.dead) { ents.splice(i, 1); continue; }
      e.t += dt;
      const k = e.life === Infinity ? 0 : e.t / e.life;
      let r;
      try { r = e.upd(e, dt, k); } catch (err) { r = false; if (!S._warned) { S._warned = 1; console.error('[VFX]', err); } }
      if (r === false || k >= 1 || (e.removing && e.fade <= 0)) endEnt(e, i);
    }
  }
  function later(delay, fn) { if (!root && !ensure()) return; timers.push({ t: delay, fn }); }
  function updateTimers(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i]; t.t -= dt;
      if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (_) {} }
    }
  }

  // ------------------------------------------------------------------
  //  UTILITAIRES POSITION
  // ------------------------------------------------------------------
  const _v = new T.Vector3(), _q = new T.Quaternion(), _Z = new T.Vector3(0, 0, 1);
  function toVec(o, out) {
    out = out || new T.Vector3();
    if (!o) return null;
    try {
      if (o.isObject3D) { o.getWorldPosition(out); return out; }
      if (o.pos && o.pos.x != null) return out.set(o.pos.x, o.pos.y || 0, o.pos.z);
      if (o.mesh && o.mesh.isObject3D) { o.mesh.getWorldPosition(out); return out; }
      if (o.position && o.position.x != null) return out.set(o.position.x, o.position.y || 0, o.position.z);
      if (o.x != null) return out.set(o.x, o.y || 0, o.z || 0);
    } catch (_) {}
    return null;
  }
  function playerPos() {
    try { const p = G.SkillAPI && G.SkillAPI.inRun && G.SkillAPI.inRun() && G.SkillAPI.player(); if (p && p.pos) return p.pos.clone(); } catch (_) {}
    return new T.Vector3();
  }
  const V = o => toVec(o, new T.Vector3()) || playerPos();
  function targetObj(t) {      // renvoie un Object3D suivable ou null
    if (!t) return null;
    if (t.isObject3D) return t;
    if (t.mesh && t.mesh.isObject3D) return t.mesh;
    if (t.hero && t.hero.isObject3D) return t.hero;
    return null;
  }
  function bar(m, a, b, w) {   // place une barre (box unité) de a à b, section w
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    _v.set(dx / L, dy / L, dz / L);
    m.quaternion.setFromUnitVectors(_Z, _v);
    m.scale.set(w, w, L);
  }

  // ------------------------------------------------------------------
  //  FLASH LUMINEUX (1 PointLight réutilisé) + FLASH D'ÉCRAN (DOM)
  // ------------------------------------------------------------------
  const lt = { t: 0, life: 0.01, i: 0 };
  function flashLight(color, intensity, dur, pos) {
    if (!light || !S.flashLight) return;
    if (intensity < lt.i * (1 - lt.t / lt.life)) return;
    light.color.setHex(colorOf(color, 0xffffff));
    if (pos) light.position.set(pos.x, (pos.y || 0) + 1.6, pos.z);
    lt.t = 0; lt.life = Math.max(0.05, dur || 0.3); lt.i = intensity;
  }
  let sfEl = null; const sf = { t: 0, life: 0.01, a: 0, on: false };
  function screenFlash(color, alpha, dur) {
    if (!S.screenFlash || typeof document === 'undefined' || !document.body) return;
    try {
      if (!sfEl) {
        sfEl = document.createElement('div'); sfEl.id = 'vfx-flash';
        sfEl.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:3;opacity:0;';
        document.body.appendChild(sfEl);
      }
      const c = colorOf(color, 0xffffff);
      sfEl.style.background = '#' + ('000000' + c.toString(16)).slice(-6);
      sf.a = alpha == null ? 0.3 : alpha; sf.t = 0; sf.life = Math.max(0.05, dur || 0.35); sf.on = true;
    } catch (_) {}
  }

  // ------------------------------------------------------------------
  //  BRIQUES D'ÉLÉMENT
  // ------------------------------------------------------------------
  // gerbe stylée selon l'élément. n = nombre, pw = puissance (1 = normal)
  function elemBurst(el, x, y, z, n, pw) {
    const pl = palOf(el), cols = pl.cols; pw = pw || 1;
    let i, a, s;
    switch (el) {
      case 'feu':
        for (i = 0; i < n; i++) { a = rr(0, TAU); s = rr(0.5, 2.6) * pw; P('sph', pick(cols), true, x, y, z, Math.cos(a) * s, rr(1.5, 3.8) * pw, Math.sin(a) * s, rr(0.35, 0.65), rr(0.28, 0.5) * pw, { end: 0.15, grav: -2, drag: 1.2 }); }
        for (i = 0; i < n / 2; i++) { a = rr(0, TAU); s = rr(2, 5) * pw; P('box', 0xffd24a, true, x, y, z, Math.cos(a) * s, rr(2, 6) * pw, Math.sin(a) * s, rr(0.5, 0.9), 0.1, { grav: 9, floor: 0.05, end: 0.3, spin: 8 }); }
        if (pw > 1.2) for (i = 0; i < n / 3; i++) P('sph', 0x2b2622, false, x + rr(-0.4, 0.4), y, z + rr(-0.4, 0.4), rr(-0.6, 0.6), rr(0.8, 1.8), rr(-0.6, 0.6), rr(0.7, 1.1), rr(0.4, 0.7), { end: 2.6, grav: -1.2, fade: 0.6 });
        break;
      case 'glace':
        for (i = 0; i < n; i++) { a = rr(0, TAU); s = rr(2, 6) * pw; P('octa', pick(cols), true, x, y, z, Math.cos(a) * s, rr(1.5, 5) * pw, Math.sin(a) * s, rr(0.45, 0.8), rr(0.14, 0.3) * pw, { end: 0.3, grav: 11, sy: 1.8, spin: 9, floor: 0.05, drag: 0.8 }); }
        for (i = 0; i < n / 2; i++) P('box', 0xffffff, true, x + rr(-0.5, 0.5), y + rr(0, 0.6), z + rr(-0.5, 0.5), rr(-0.4, 0.4), rr(0.3, 1), rr(-0.4, 0.4), rr(0.5, 0.9), 0.08, { end: 0.4, grav: 0.5 });
        break;
      case 'foudre':
        for (i = 0; i < n; i++) { a = rr(0, TAU); s = rr(5, 12) * pw; P('box', pick(cols), true, x, y, z, Math.cos(a) * s, rr(-1, 4), Math.sin(a) * s, rr(0.12, 0.25), rr(0.08, 0.16) * pw, { end: 0.2, drag: 5, sy: 2.4 }); }
        break;
      case 'ombre':
        for (i = 0; i < n; i++) { a = rr(0, TAU); s = rr(0.4, 2.2) * pw; P('sph', pick([0x1a0830, 0x2a0d4a, 0x4a1a8a]), false, x, y, z, Math.cos(a) * s, rr(0.8, 2.4) * pw, Math.sin(a) * s, rr(0.6, 1.0), rr(0.3, 0.55) * pw, { end: 2.2, grav: -1.3, fade: 0.6, drag: 0.8 }); }
        for (i = 0; i < n / 2; i++) { a = rr(0, TAU); s = rr(1, 3) * pw; P('box', pick([0xc07bff, 0x8a35e0]), true, x, y, z, Math.cos(a) * s, rr(1, 4), Math.sin(a) * s, rr(0.5, 0.9), 0.1, { end: 0.2, grav: -1, drag: 1 }); }
        break;
      case 'sacre':
        for (i = 0; i < n; i++) { a = rr(0, TAU); s = rr(0.5, 3) * pw; P('sph', pick(cols), true, x, y, z, Math.cos(a) * s, rr(1.5, 4.5) * pw, Math.sin(a) * s, rr(0.6, 1.1), rr(0.1, 0.22) * pw, { end: 0.1, grav: -1.5, drag: 1 }); }
        if (pw > 1) for (i = 0; i < n / 4 + 1; i++) P('plane', 0xfff4c0, 'f', x, y, z, rr(-1.2, 1.2), rr(1.5, 3), rr(-1.2, 1.2), rr(1, 1.5), 0.22, { end: 0.7, grav: 1.5, drag: 1.2, spin: 6, sy: 1.8, fade: 0.4 });
        break;
      case 'poison':
        for (i = 0; i < n; i++) { a = rr(0, TAU); s = rr(0.5, 2.2) * pw; P('sph', pick(cols), i % 2 ? true : false, x, y, z, Math.cos(a) * s, rr(1, 3) * pw, Math.sin(a) * s, rr(0.5, 0.9), rr(0.16, 0.34) * pw, { end: i % 2 ? 1.5 : 1.8, grav: -2.2, drag: 1, fade: 0.25 }); }
        break;
      default:   // physique
        for (i = 0; i < n; i++) { a = rr(0, TAU); s = rr(3, 9) * pw; P('box', pick(cols), true, x, y, z, Math.cos(a) * s, rr(1, 5), Math.sin(a) * s, rr(0.25, 0.5), rr(0.1, 0.2) * pw, { end: 0.2, grav: 14, drag: 1.5, floor: 0.05, sy: 1.6, spin: 5 });  }
    }
  }
  // éclat bref (grossit puis s'éteint)
  function glint(x, y, z, color, size, life) { P('sph', color, true, x, y, z, 0, 0, 0, life || 0.14, size, { end: 1.8, fade: 1 }); }
  // anneau plat au sol qui s'étend
  function ringWave(x, z, color, radius, life, op, y, r0) {
    const e = ent(life, (e, dt, k) => {
      const kk = 1 - Math.pow(1 - k, 3); setFlat(e.m, 2 * (e.r0 + (radius - e.r0) * kk)); e.m.material.opacity = (op == null ? 0.8 : op) * (1 - k);
    });
    if (!e) return null;
    e.r0 = r0 == null ? radius * 0.1 : r0;
    e.m = em(e, flat(acq('plain', GEO.ring, color, op == null ? 0.8 : op, true)));
    e.m.position.set(x, y == null ? 0.07 : y, z); setFlat(e.m, 2 * e.r0);
    return e;
  }
  // étoile de rayons (critique)
  function starBurst(x, y, z, color, size, n) {
    const e = ent(0.2, (e, dt, k) => {
      for (let i = 0; i < e.ms.length; i++) {
        const d = e.dirs[i], L = size * (0.4 + 0.9 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2)) * d.l;
        e.a.set(x + d.x * L * 0.25, y + d.y * L * 0.25, z + d.z * L * 0.25); e.b.set(x + d.x * L, y + d.y * L, z + d.z * L);
        bar(e.ms[i], e.a, e.b, 0.09 * (1 - k)); e.ms[i].material.opacity = 1 - k;
      }
    });
    if (!e) return;
    e.a = new T.Vector3(); e.b = new T.Vector3(); e.dirs = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rr(-0.2, 0.2), u = rr(-0.4, 0.6);
      const c = Math.sqrt(1 - u * u);
      e.dirs.push({ x: Math.cos(a) * c, y: Math.abs(u) + 0.1, z: Math.sin(a) * c, l: rr(0.7, 1.2) });
      em(e, acq('plain', GEO.box, color, 1, true));
    }
  }

  // ------------------------------------------------------------------
  //  HIT SPARK
  // ------------------------------------------------------------------
  function hitSpark(pos, element, crit, power) {
    if (!ensure()) return;
    const p = V(pos); if (pos && p.y < 0.3) p.y += 0.9;
    const el = PAL[element] ? element : 'physique', pl = PAL[el];
    const pw = (power || 1) * (crit ? 1.5 : 1);
    elemBurst(el, p.x, p.y, p.z, N(crit ? 14 : 7), pw);
    glint(p.x, p.y, p.z, pl.hi, crit ? 1.6 : 0.9, crit ? 0.2 : 0.12);
    if (crit) {
      starBurst(p.x, p.y, p.z, pl.hi, 2.4, 6);
      ringWave(p.x, p.z, pl.main, 1.6, 0.25, 0.7, p.y - 0.4 > 0 ? 0.07 : 0.07);
      if (el === 'foudre') bolt(p, null, el, 0.14, { len: 2.2 });
    } else if (el === 'foudre' && Math.random() < 0.4) bolt(p, null, el, 0.1, { len: 1.4 });
  }

  // ------------------------------------------------------------------
  //  ÉCLAIRS
  // ------------------------------------------------------------------
  // lightning(a, b, opts) ; a/b = positions (ou objets suivis). opts:{dur,width,color,branches,jag,glow,len(si b null)}
  function lightning(a, b, opts) {
    if (!ensure()) return;
    opts = opts || {};
    const A = V(a); let B = toVec(b, new T.Vector3());
    if (!B) { const ang = rr(0, TAU), L = opts.len || 3; B = new T.Vector3(A.x + Math.cos(ang) * L, A.y + rr(-0.3, 0.8), A.z + Math.sin(ang) * L); }
    const color = colorOf(opts.color, 0xfff04a);
    const NS = Math.max(4, Math.min(10, Math.round(A.distanceTo(B) / 1.1) + 4));
    const nb = Math.min(opts.branches == null ? 2 : opts.branches, 3);
    const total = NS * 2 + nb * 3;
    const ao = targetObj(a) || (a && a.isObject3D ? a : null), bo = targetObj(b);
    const e = ent(opts.dur || 0.28, (e, dt, k) => {
      if (ao) toVec(ao, e.A); if (bo) toVec(bo, e.B);
      e.acc += dt;
      if (e.acc >= 0.035 || e.first) { e.acc = 0; e.first = false; regen(e); }
      const f = (1 - k * k) * (0.65 + Math.random() * 0.35);
      for (let i = 0; i < e.ms.length; i++) e.ms[i].material.opacity = f * (e.ms[i].userData.glow ? 0.35 : 1);
    });
    if (!e) return;
    e.A = A; e.B = B; e.acc = 0; e.first = true; e.NS = NS; e.nb = nb; e.pts = []; e.opts = opts; e.col = color;
        for (let i = 0; i < total; i++) {
      const isGlow = i < NS;
      const m = em(e, acq('plain', GEO.box, isGlow ? color : 0xffffff, 1, true)); m.userData.glow = isGlow;
    }
    for (let i = 0; i <= NS; i++) e.pts.push(new T.Vector3());
    P('sph', 0xffffff, true, A.x, A.y, A.z, 0, 0, 0, 0.12, 0.7, { end: 1.8, fade: 1 });
    glint(B.x, B.y, B.z, 0xffffff, 1.0, 0.14);
    flashLight(color, 2.2, 0.18, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 });
  }
  const _bp0 = new T.Vector3(), _bp1 = new T.Vector3(), _dir = new T.Vector3(), _s1 = new T.Vector3(), _s2 = new T.Vector3();
  function regen(e) {
    const A = e.A, B = e.B, NS = e.NS, pts = e.pts, w = e.opts.width || 0.1;
    _dir.subVectors(B, A); const L = _dir.length() || 0.001; _dir.multiplyScalar(1 / L);
    _s1.set(-_dir.z, 0, _dir.x); if (_s1.lengthSq() < 0.01) _s1.set(1, 0, 0); _s1.normalize();
    _s2.crossVectors(_dir, _s1).normalize();
    const amp = Math.min(0.9, Math.max(0.15, L * 0.09)) * (e.opts.jag || 1);
    for (let i = 0; i <= NS; i++) {
      const f = i / NS, env = Math.sin(Math.PI * f), o = rr(-1, 1) * amp * env, o2 = rr(-1, 1) * amp * env * 0.6;
      pts[i].set(A.x + _dir.x * L * f + _s1.x * o + _s2.x * o2, A.y + _dir.y * L * f + _s1.y * o + _s2.y * o2, A.z + _dir.z * L * f + _s1.z * o + _s2.z * o2);
    }
    for (let i = 0; i < NS; i++) {
      bar(e.ms[i], pts[i], pts[i + 1], w * 3.2);          // halo
      bar(e.ms[NS + i], pts[i], pts[i + 1], w);            // coeur
    }
    for (let j = 0; j < e.nb; j++) {
      let prev = _bp0.copy(pts[1 + ((Math.random() * Math.max(1, NS - 2)) | 0)]), ang = rr(0, TAU);
      for (let s = 0; s < 3; s++) {
        const ml = e.ms[NS * 2 + j * 3 + s]; if (!ml) break;
        const sl = L * 0.07 * (1 - s * 0.25), ca = Math.cos(ang), sa = Math.sin(ang);
        _bp1.set(prev.x + (_s1.x * ca + _s2.x * sa) * sl + _dir.x * sl * 0.6, prev.y + (_s1.y * ca + _s2.y * sa) * sl, prev.z + (_s1.z * ca + _s2.z * sa) * sl + _dir.z * sl * 0.6);
        bar(ml, prev, _bp1, w * 0.7 * (1 - s * 0.2)); prev.copy(_bp1); ang += rr(-0.7, 0.7);
      }
    }
  }
  function bolt(a, b, el, dur, o) { lightning(a, b, Object.assign({ color: palOf(el).main, dur: dur || 0.2 }, o || {})); }

  // ------------------------------------------------------------------
  //  SLASH (arc de lame qui se dessine)
  // ------------------------------------------------------------------
  function slash(pos, dir, color, radius, arc) {
    if (!ensure()) return;
    const p = V(pos); radius = radius || 2.5; arc = Math.min(TAU - 0.2, Math.max(0.6, arc || Math.PI * 0.9));
    let yaw = 0; if (dir && (dir.x || dir.z)) yaw = Math.atan2(dir.x, dir.z);
    const c = colorOf(color, 0xffffff), hi = 0xffffff;
    const e = ent(0.3, (e, dt, k) => {
      const kk = 1 - Math.pow(1 - clamp01(k * 1.25), 2);
      const half = (e.arc - 0.9) / 2, sweep = half < 0 ? 0 : half;
      e.head.rotation.y = e.yaw + (-sweep + 2 * sweep * kk);
      e.head.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
      e.ghost.material.opacity = 0.55 * (1 - k) * Math.min(1, k * 6);
      const gs = e.radius * (0.9 + 0.12 * kk); e.ghost.scale.set(gs, gs, 1); e.head.scale.set(gs * 1.04, gs * 1.04, 1);
      if (e.spk < 3 && k > 0.15 * (e.spk + 1)) {
        e.spk++; const ang = e.yaw + (-sweep + 2 * sweep * kk);
        P('box', c, true, e.x + Math.sin(ang) * e.radius, e.y, e.z + Math.cos(ang) * e.radius, Math.sin(ang) * 2, 1, Math.cos(ang) * 2, 0.25, 0.14, { end: 0.1, grav: 4 });
      }
    });
    if (!e) return;
    e.x = p.x; e.y = p.y < 0.2 ? p.y + 0.9 : p.y; e.z = p.z; e.yaw = yaw; e.arc = arc; e.radius = radius; e.spk = 0;
    e.ghost = em(e, acq('plain', arcGeo(arc, 0.82), c, 0.5, true));
    e.head = em(e, acq('plain', arcGeo(Math.min(arc, 0.9), 0.55), hi, 1, true));
    for (const m of [e.ghost, e.head]) { m.rotation.set(-Math.PI / 2, yaw, 0); m.position.set(e.x, e.y, e.z); m.renderOrder = 3; }
    e.head.material.color.setHex(hi); e.ghost.material.color.setHex(c);
  }

  // ------------------------------------------------------------------
  //  DÉCALS AU SOL
  // ------------------------------------------------------------------
  const decals = [];
  const DECAL = {
    feu:      { tex: 'splat', col: 0x1a0e08, add: false, op: 0.6, glow: 0xff6a10 },
    glace:    { tex: 'frost', col: 0xb8ecff, add: true, op: 0.75 },
    foudre:   { tex: 'crack', col: 0xc9e6ff, add: true, op: 0.55 },
    ombre:    { tex: 'splat', col: 0x1c0836, add: false, op: 0.7, glow: 0x7a2fd6 },
    sacre:    { tex: 'rune', col: 0xffd95a, add: true, op: 0.7 },
    poison:   { tex: 'splat', col: 0x2f9a22, add: false, op: 0.62, glow: 0x7aff3a },
    physique: { tex: 'crack', col: 0xffe9a8, add: true, op: 0.45 },
  };
  let decalY = 0.03;
  function groundDecal(pos, element, radius, dur) {
    if (!ensure()) return;
    const p = V(pos), el = DECAL[element] ? element : 'physique', d = DECAL[el];
    radius = radius || 2; dur = dur == null ? 4 : dur;
    if (decals.length >= 18) { const o = decals.shift(); if (o && !o.dead) o.t = Math.max(o.t, o.life * 0.7); }
    decalY = decalY > 0.06 ? 0.03 : decalY + 0.002;
    const e = ent(dur, (e, dt, k) => {
      const fi = Math.min(1, e.t / 0.12), fo = k > 0.65 ? (1 - k) / 0.35 : 1, f = fi * fo;
      e.m.material.opacity = d.op * f;
      if (e.g) { e.g.material.opacity = 0.7 * f * Math.max(0, 1 - e.t / Math.min(2, e.life)) ; }
      if (k >= 1) { const i = decals.indexOf(e); if (i >= 0) decals.splice(i, 1); }
    });
    if (!e) return;
    e.m = em(e, flat(acqTex(d.tex, GEO.disc, d.col, d.op, d.add)));
    e.m.rotation.set(-Math.PI / 2, rr(0, TAU), 0); e.m.position.set(p.x, decalY, p.z); setFlat(e.m, radius * 2.1); e.m.material.opacity = 0;
    if (d.glow) {
      e.g = em(e, flat(acqTex('splat', GEO.disc, d.glow, 0.7, true)));
      e.g.rotation.set(-Math.PI / 2, rr(0, TAU), 0); e.g.position.set(p.x, decalY + 0.004, p.z); setFlat(e.g, radius * 1.4);
    }
    decals.push(e);
  }

  // ------------------------------------------------------------------
  //  EXPLOSION
  // ------------------------------------------------------------------
  function explosion(pos, radius, element, opts) {
    if (!ensure()) return;
    opts = opts || {};
    const p = V(pos), el = PAL[element] ? element : 'feu', pl = PAL[el];
    radius = radius || 3;
    const y = p.y < 0.2 ? 0.6 : p.y;
    // sphère
    const sp = ent(0.38, (e, dt, k) => {
      const kk = 1 - Math.pow(1 - k, 3), s = radius * (0.3 + 1.15 * kk) * 2;
      e.m.scale.set(s, s, s); e.m.material.opacity = 0.8 * (1 - k);
      if (e.c) { const s2 = s * 0.6 * (1 - k * 0.5); e.c.scale.set(s2, s2, s2); e.c.material.opacity = 0.9 * (1 - k * k); }
    });
    if (sp) {
      sp.m = em(sp, acq('plain', GEO.sph, el === 'ombre' ? pl.lo : pl.main, 0.8, el !== 'ombre'));
      sp.c = em(sp, acq('plain', GEO.sph, pl.hi, 0.9, true));
      sp.m.position.set(p.x, y, p.z); sp.c.position.set(p.x, y, p.z);
      if (el === 'poison' || el === 'ombre') sp.m.material.blending = T.NormalBlending;
    }
    ringWave(p.x, p.z, pl.main, radius * 1.1, 0.5, 0.85);
    ringWave(p.x, p.z, pl.hi, radius * 0.75, 0.32, 0.9, 0.09);
    elemBurst(el, p.x, y, p.z, N(Math.min(26, 10 + radius * 3)), 1 + radius * 0.18);
    groundDecal(p, el, radius * 0.85, 4.5);
    flashLight(pl.main, 3.2, 0.3, p);
    // signature de l'élément
    if (el === 'glace') iceSpikes(p, radius * 0.8, Math.min(8, 4 + (radius | 0)));
    else if (el === 'foudre') for (let i = 0; i < 4; i++) { const a = rr(0, TAU); lightning({ x: p.x, y: y, z: p.z }, { x: p.x + Math.cos(a) * radius, y: 0.3, z: p.z + Math.sin(a) * radius }, { dur: 0.22, color: pl.main, branches: 1 }); }
    else if (el === 'feu') emitterAt(p, radius * 0.6, 0.9, 'smoke', 22);
    else if (el === 'ombre') shadowFlames(p, radius * 0.7, 1.0);
    else if (el === 'sacre') pillar(p, 'sacre', 5, 0.7);
    else if (el === 'poison') poisonCloud(p, radius * 0.9, 1.6);
    if (opts.flash || radius >= 5) screenFlash(pl.main, 0.18, 0.25);
  }

  // colonne d'énergie
  function pillar(pos, element, height, dur, color) {
    if (!ensure()) return;
    const p = V(pos), pl = palOf(element), c = color != null ? colorOf(color) : pl.main;
    height = height || 6; dur = dur || 0.8;
    const e = ent(dur, (e, dt, k) => {
      const rise = Math.min(1, e.t / 0.12), w = (1 - k) * (0.85 + 0.15 * Math.sin(e.t * 30));
      e.m.scale.set(e.w * w * 1.6 + 0.1, height * rise, e.w * w * 1.6 + 0.1); e.m.material.opacity = 0.5 * (1 - k * k);
      e.c.scale.set(e.w * w * 0.7 + 0.05, height * rise, e.w * w * 0.7 + 0.05); e.c.material.opacity = 0.85 * (1 - k);
      if (Math.random() < 0.5) P('sph', pl.hi, true, e.x + rr(-0.6, 0.6), rr(0, 1.5), e.z + rr(-0.6, 0.6), 0, rr(3, 6), 0, 0.5, 0.14, { end: 0.1 });
    });
    if (!e) return;
    e.x = p.x; e.z = p.z; e.w = 1.2;
    e.m = em(e, acq('plain', GEO.cyl, c, 0.5, true)); e.c = em(e, acq('plain', GEO.cyl, 0xffffff, 0.85, true));
    e.m.position.set(p.x, 0, p.z); e.c.position.set(p.x, 0, p.z);
    ringWave(p.x, p.z, c, 2.2, 0.45, 0.8);
    flashLight(c, 2.4, 0.4, p);
  }

  // cristaux de glace qui jaillissent
  function iceSpikes(pos, radius, count) {
    if (!ensure()) return;
    const p = V(pos); count = N(count || 6); radius = radius || 2.5;
    const e = ent(1.5, (e, dt, k) => {
      for (let i = 0; i < e.ms.length; i++) {
        const c = e.cr[i]; const tt = e.t - c.d;
        const m = e.ms[i];
        if (tt < 0) { m.visible = false; continue; }
        if (tt < 0.14) { m.visible = true; const h = c.h * (1 - Math.pow(1 - tt / 0.14, 3)); m.scale.set(c.w, h, c.w); }
        else if (!c.broke && e.t > 1.0 + c.d * 0.3) { c.broke = true; m.visible = false; elemBurst('glace', m.position.x, 0.5, m.position.z, 4, 0.7); }
      }
    });
    if (!e) return;
    e.cr = [];
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + rr(-0.3, 0.3), d = radius * rr(0.3, 1);
      const m = em(e, acq('plain', GEO.cone, pick([0xb8ecff, 0x8fdcff, 0xdff8ff]), 0.88, false));
      m.position.set(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d); m.rotation.set(rr(-0.25, 0.25), 0, rr(-0.25, 0.25)); m.scale.set(0.01, 0.01, 0.01); m.visible = false;
      e.cr.push({ d: i * 0.025, h: rr(1.2, 2.4), w: rr(0.35, 0.6), broke: false });
    }
    ringWave(p.x, p.z, 0xc8f2ff, radius * 1.1, 0.4, 0.7);
  }

  // émetteurs temporaires
  function emitterAt(pos, radius, dur, kind, rate) {
    if (!ensure()) return;
    const p = V(pos);
    ent(dur, (e, dt, k) => {
      e.acc += dt * rate * S.quality; while (e.acc >= 1) {
        e.acc -= 1; const a = rr(0, TAU), d = Math.sqrt(Math.random()) * radius;
        const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        if (kind === 'smoke') P('sph', 0x2b2622, false, x, 0.4, z, rr(-0.3, 0.3), rr(1, 2), rr(-0.3, 0.3), rr(0.8, 1.2), rr(0.4, 0.8), { end: 2.4, grav: -0.8, fade: 0.6 });
        else if (kind === 'fire') P('sph', pick(PAL.feu.cols), true, x, 0.2, z, 0, rr(1.5, 3.5), 0, rr(0.4, 0.7), rr(0.3, 0.55), { end: 0.1, grav: -1 });
        else if (kind === 'shadow') P('sph', pick([0xc07bff, 0x8a35e0, 0x4a1a8a]), true, x, 0.1, z, rr(-0.2, 0.2), rr(1.8, 3.8), rr(-0.2, 0.2), rr(0.5, 0.9), rr(0.28, 0.5), { end: 0.1, grav: -1.2 });
        else if (kind === 'poison') P('sph', pick(PAL.poison.cols), false, x, 0.3, z, rr(-0.2, 0.2), rr(0.3, 1), rr(-0.2, 0.2), rr(1, 1.6), rr(0.6, 1.1), { end: 1.8, grav: -0.1, fade: 0.5 });
        else if (kind === 'bubble') P('sph', pick(PAL.poison.cols), true, x, 0.1, z, 0, rr(1, 2.2), 0, rr(0.6, 1.1), rr(0.12, 0.26), { end: 1.3, fade: 0.2 });
      }
    }, { acc: 0 });
  }
  function shadowFlames(pos, radius, dur) { emitterAt(pos, radius, dur || 1.4, 'shadow', 38); }
  function poisonCloud(pos, radius, dur) {
    emitterAt(pos, radius, dur || 3, 'poison', 14); emitterAt(pos, radius, dur || 3, 'bubble', 16);
    const p = V(pos); groundDecal(p, 'poison', radius, (dur || 3) + 1.5);
  }

  // ------------------------------------------------------------------
  //  RAYON
  // ------------------------------------------------------------------
  function beam(a, b, element, dur) {
    if (!ensure()) return;
    const el = PAL[element] ? element : 'physique', pl = PAL[el];
    if (el === 'foudre') { lightning(a, b, { dur: dur || 0.4, color: pl.main, branches: 3, width: 0.12 }); return; }
    const ao = targetObj(a), bo = targetObj(b);
    const A = V(a), B = V(b);
    const e = ent(dur || 0.5, (e, dt, k) => {
      if (ao) toVec(ao, e.A); if (bo) toVec(bo, e.B);
      const f = k < 0.12 ? k / 0.12 : k > 0.75 ? (1 - k) / 0.25 : 1, pu = 1 + 0.18 * Math.sin(e.t * 38);
      bar(e.g, e.A, e.B, 0.55 * f * pu); bar(e.c, e.A, e.B, 0.16 * f * pu);
      e.g.material.opacity = 0.45 * f; e.c.material.opacity = 0.95 * f;
      const s1 = 0.9 * f * pu; e.f1.scale.set(s1, s1, s1); e.f2.scale.set(s1 * 1.2, s1 * 1.2, s1 * 1.2);
      e.f1.position.copy(e.A); e.f2.position.copy(e.B);
      const t = Math.random(); const x = e.A.x + (e.B.x - e.A.x) * t, y = e.A.y + (e.B.y - e.A.y) * t, z = e.A.z + (e.B.z - e.A.z) * t;
      const sx = rr(-1, 1), sz = rr(-1, 1);
      if (el === 'glace') P('octa', pl.hi, true, x, y, z, sx, rr(0, 1.5), sz, 0.4, 0.14, { sy: 1.6, spin: 8, grav: 3 });
      else if (el === 'feu') P('sph', pick(pl.cols), true, x, y, z, sx, rr(1, 2.5), sz, 0.4, 0.28, { end: 0.1, grav: -2 });
      else if (el === 'ombre') P('sph', pick(pl.cols), false, x, y, z, sx * 0.5, rr(0.5, 1.5), sz * 0.5, 0.7, 0.35, { end: 2, grav: -1 });
      else if (el === 'poison') P('sph', pl.hi, true, x, y, z, sx * 0.5, rr(0.5, 1.5), sz * 0.5, 0.6, 0.2, { end: 1.4 });
      else P('sph', pick(pl.cols), true, x, y, z, sx, rr(0.5, 2), sz, 0.5, 0.12, { end: 0.1, grav: -1 });
    });
    if (!e) return;
    e.A = A; e.B = B;
    e.g = em(e, acq('plain', GEO.box, pl.main, 0.45, true)); e.c = em(e, acq('plain', GEO.box, pl.hi, 0.95, true));
    e.f1 = em(e, acq('plain', GEO.sph, pl.hi, 0.9, true)); e.f2 = em(e, acq('plain', GEO.sph, pl.main, 0.8, true));
    flashLight(pl.main, 1.6, Math.min(0.5, dur || 0.5), A);
  }

  // ------------------------------------------------------------------
  //  AURA (suit la cible) + AURA DE RANG
  // ------------------------------------------------------------------
  const auras = [];
  function aura(target, color, dur, o) {
    const handle = { remove() {} };
    if (!ensure()) return handle;
    o = o || {};
    const lvl = o.level == null ? 1 : o.level, c = colorOf(color, 0xb44dff), obj = targetObj(target), start = toVec(target, new T.Vector3());
    if (!start) return handle;
    if (auras.length >= 14) { const old = auras.shift(); if (old) old.removing = true; }
    const R = o.radius || 1.1, h = o.height || 2.2;
    const e = ent(dur == null ? Infinity : dur, (e, dt, k) => {
      if (obj) { if (!obj.parent && obj !== G.core.scene) { e.removing = true; } else toVec(obj, e.pos); }
      if (e.removing) e.fade = Math.max(0, e.fade - dt / 0.35); else e.fade = Math.min(1, e.fade + dt / 0.3);
      if (e.life !== Infinity && e.t > e.life - 0.35) e.fade = Math.min(e.fade, Math.max(0, (e.life - e.t) / 0.35));
      const f = e.fade, pu = 1 + 0.08 * Math.sin(e.t * 5), p = e.pos;
      e.r1.position.set(p.x, 0.07, p.z); setFlat(e.r1, 2 * R * pu); e.r1.material.opacity = 0.6 * f; e.r1.rotation.y = e.t * 0.8;
      if (e.r2) { e.r2.position.set(p.x, 0.075, p.z); setFlat(e.r2, 2 * R * 1.45 * (2 - pu)); e.r2.material.opacity = 0.35 * f; }
      if (e.col) { e.col.position.set(p.x, 0, p.z); e.col.scale.set(R * 1.6, h * (0.9 + 0.1 * Math.sin(e.t * 3)), R * 1.6); e.col.material.opacity = (0.1 + 0.04 * lvl) * f; }
      if (e.disc) { e.disc.position.set(p.x, 0.06, p.z); setFlat(e.disc, 2 * R * 0.95); e.disc.material.opacity = 0.18 * f; }
      e.acc += dt * (5 + lvl * 4.5) * S.quality;
      while (e.acc >= 1) {
        e.acc -= 1; const a = rr(0, TAU), d = R * rr(0.4, 1.1);
        const rise = rr(1.2, 2.4) + lvl * 0.25;
        if (lvl >= 6 && Math.random() < 0.3) P('plane', 0xfff4c0, 'f', p.x + Math.cos(a) * d, 0.2, p.z + Math.sin(a) * d, 0, rise * 0.6, 0, 1.6, 0.2, { sy: 1.8, spin: 5, end: 0.8, fade: 0.4 });
        else P(lvl >= 4 && Math.random() < 0.4 ? 'octa' : 'sph', Math.random() < 0.25 ? 0xffffff : c, true, p.x + Math.cos(a) * d, 0.1, p.z + Math.sin(a) * d, 0, rise, 0, rr(0.7, 1.2), rr(0.1, 0.2) + lvl * 0.012, { end: 0.1, drag: 0.2 });
      }
      if (lvl >= 5) {   // double spirale
        const aa = e.t * 4.5;
        for (let s = 0; s < 2; s++) {
          const a2 = aa + s * Math.PI, yy = (e.t * 1.8 + s * 1.1) % h;
          P('sph', lvl >= 6 ? 0xfff0a0 : 0xffffff, true, p.x + Math.cos(a2) * R * 0.85, yy, p.z + Math.sin(a2) * R * 0.85, 0, 0.3, 0, 0.35, 0.13, { end: 0.1 });
        }
      }
    }, { pos: start, acc: 0, fade: 0 });
    if (!e) return handle;
    e.r1 = em(e, flat(acq('plain', GEO.ring, c, 0.6, true)));
    if (lvl >= 3) e.r2 = em(e, flat(acq('plain', GEO.ringThin, c, 0.35, true)));
    if (lvl >= 1) e.disc = em(e, flat(acq('plain', GEO.disc, c, 0.18, true)));
    if (lvl >= 2) e.col = em(e, acq('plain', GEO.cylTaper, c, 0.12, true));
    auras.push(e);
    e.onEnd = () => { const i = auras.indexOf(e); if (i >= 0) auras.splice(i, 1); };
    handle.remove = () => { e.removing = true; };
    return handle;
  }
  function rankAura(target, rank, dur) {
    const idx = Math.max(0, RANK_ORDER.indexOf(String(rank)));
    let col = RC[rank] != null ? RC[rank] : RC.E;
    try { const r = G.RANKS && G.RANKS.find && G.RANKS.find(x => x.id === rank); if (r && r.color) col = colorOf(r.color, col); } catch (_) {}
    return aura(target, col, dur == null ? Infinity : dur, { level: idx, radius: 1 + idx * 0.08, height: 2 + idx * 0.25 });
  }

  // ------------------------------------------------------------------
  //  PORTAIL (Object3D animé, suit sa propre mise à jour)
  // ------------------------------------------------------------------
  const portals = [];
  function portal(pos, color, scale) {
    if (!ensure()) return null;
    buildTex();
    const c = colorOf(color, 0x9b6bff); scale = scale || 1;
    const g = new T.Group(); g.name = 'vfx-portal';
    const p = toVec(pos, new T.Vector3()); if (p) g.position.copy(p);
    g.scale.setScalar(scale);
    const own = [];   // matériaux propres (dispose)
    const mk = (geo, col, op, add) => {
      const mat = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: T.DoubleSide, blending: add === false ? T.NormalBlending : T.AdditiveBlending });
      own.push(mat); const m = new T.Mesh(geo, mat); m.frustumCulled = false; g.add(m); return m;
    };
    const dark = (Math.floor(((c >> 16) & 255) * 0.12) << 16) | (Math.floor(((c >> 8) & 255) * 0.12) << 8) | Math.floor((c & 255) * 0.12);
    const core = mk(GEO.disc, dark, 0.9, false); core.rotation.x = -Math.PI / 2; core.position.y = 0.04; core.scale.set(1.5, 1.5, 1);
    const spirals = [];
    for (let i = 0; i < 2; i++) {
      let m;
      if (TEX.spiral) { m = mk(GEO.plane, i ? 0xffffff : c, i ? 0.55 : 0.9); m.material.map = TEX.spiral; const s = i ? 3.0 : 4.2; m.scale.set(s, s, 1); }
      else { m = mk(GEO.ring, c, 0.7); m.scale.set(i ? 1.4 : 2, i ? 1.4 : 2, 1); }
      m.rotation.x = -Math.PI / 2; m.position.y = 0.06 + i * 0.01; spirals.push(m);
    }
    const t1 = mk(GEO.torus, c, 0.95), t2 = mk(GEO.torus, 0xffffff, 0.7);
    t1.rotation.x = t2.rotation.x = Math.PI / 2; t1.position.y = 0.1; t2.position.y = 0.12; t1.scale.set(2.1, 2.1, 2.1); t2.scale.set(1.55, 1.55, 1.55);
    const beamM = mk(GEO.cylTaper, c, 0.14); beamM.scale.set(3.2, 3.6, 3.2);
    const shards = [];
    for (let i = 0; i < 6; i++) { const m = mk(GEO.octa, i % 2 ? 0xffffff : c, 0.85); m.scale.set(0.22, 0.5, 0.22); shards.push(m); }
    const ud = g.userData; ud.vfxPortal = true; ud.life = 0; ud.baseColor = c; ud.open = 0; ud.boost = 0; ud.idle = 0; ud.seen = false;
    const tmp = new T.Vector3();
    const rec = {
      g, disposed: false,
      update(dt) {
        ud.life += dt; const t = ud.life;
        ud.open = Math.min(1, ud.open + dt * 2.2); const o = 1 - Math.pow(1 - ud.open, 3);
        ud.boost = Math.max(0, ud.boost - dt * 1.5);
        const sc = (0.15 + 0.85 * o) * (1 + ud.boost * 0.25);
        core.scale.set(1.5 * sc, 1.5 * sc, 1);
        spirals[0].rotation.y = -t * 1.1; spirals[1].rotation.y = t * 1.9;
        spirals[0].scale.setScalar((TEX.spiral ? 4.2 : 2) * sc); spirals[1].scale.setScalar((TEX.spiral ? 3.0 : 1.4) * sc);
        t1.scale.setScalar(2.1 * sc * (1 + 0.03 * Math.sin(t * 4))); t2.scale.setScalar(1.55 * sc * (1 + 0.04 * Math.sin(t * 6 + 1)));
        beamM.scale.set(3.2 * sc, 3.6 * o * (0.9 + 0.1 * Math.sin(t * 3)), 3.2 * sc); beamM.material.opacity = 0.14 + 0.08 * ud.boost + 0.03 * Math.sin(t * 5);
        for (let i = 0; i < shards.length; i++) {
          const a = t * 0.9 + i / shards.length * TAU, r = 2.45 * sc;
          shards[i].position.set(Math.cos(a) * r, 0.9 + 0.35 * Math.sin(t * 2 + i * 1.7), Math.sin(a) * r); shards[i].rotation.y = t * 2 + i; shards[i].rotation.x = t * 1.3;
        }
        if (g.parent && S.quality > 0.3) {   // particules aspirées
          g.getWorldPosition(tmp); ud.acc = (ud.acc || 0) + dt * 16 * S.quality * scale;
          while (ud.acc >= 1) {
            ud.acc -= 1; const a = rr(0, TAU), R = rr(2.2, 3.2) * scale;
            P('sph', Math.random() < 0.3 ? 0xffffff : c, true, tmp.x + Math.cos(a) * R, rr(0.1, 1.6) * scale, tmp.z + Math.sin(a) * R, 0, rr(-0.2, 0.6), 0, 1.4, 0.15, { end: 0.3, pull: 5 * scale, swirl: 5 * scale, cx: tmp.x, cz: tmp.z, drag: 0.4 });
          }
        }
      },
    };
    ud.setColor = nc => { const cc = colorOf(nc, c); own.forEach((m, i) => { if (m.color) m.color.setHex(i === 0 ? dark : cc); }); };
    ud.burst = () => { ud.boost = 1; if (g.parent) { g.getWorldPosition(tmp); ringWave(tmp.x, tmp.z, c, 4 * scale, 0.6, 0.8); flashLight(c, 2.2, 0.4, tmp); } };
    ud.dispose = () => { rec.disposed = true; own.forEach(m => m.dispose && m.dispose()); };
    portals.push(rec);
    return g;
  }
  function updatePortals(dt) {
    for (let i = portals.length - 1; i >= 0; i--) {
      const r = portals[i];
      if (r.disposed) { portals.splice(i, 1); continue; }
      if (r.g.parent) { r.g.userData.seen = true; r.g.userData.idle = 0; r.update(dt); }
      else { r.g.userData.idle += dt; if (r.g.userData.idle > (r.g.userData.seen ? 4 : 20)) { r.g.userData.dispose(); portals.splice(i, 1); } }
    }
  }

  // ------------------------------------------------------------------
  //  CERCLE RUNIQUE D'INVOCATION
  // ------------------------------------------------------------------
  function summonCircle(pos, color, o) {
    if (!ensure()) return;
    o = o || {};
    const p = V(pos), c = colorOf(color, 0x8a35e0), size = (o.size || 4.2), dur = o.dur || 2.4;
    const e = ent(dur, (e, dt, k) => {
      const fi = Math.min(1, e.t / 0.35), fo = k > 0.7 ? (1 - k) / 0.3 : 1, f = fi * fo, sc = 0.4 + 0.6 * (1 - Math.pow(1 - fi, 3));
      setFlat(e.a, size * sc); setFlat(e.b, size * 0.62 * sc); e.a.rotation.y = e.t * 0.9; e.b.rotation.y = -e.t * 1.6;
      e.a.material.opacity = 0.9 * f; e.b.material.opacity = 0.75 * f;
      e.r.material.opacity = 0.7 * f; setFlat(e.r, size * sc * 0.98);
      if (e.bm) { for (let i = 0; i < e.bm.length; i++) { const a = e.t * 1.2 + i * TAU / e.bm.length, rd = size * 0.36 * sc; e.bm[i].position.set(p.x + Math.cos(a) * rd, 0, p.z + Math.sin(a) * rd); e.bm[i].scale.set(0.14, (1.8 + Math.sin(e.t * 4 + i) * 0.5) * f * Math.min(1, e.t / 0.7), 0.14); e.bm[i].material.opacity = 0.5 * f; } }
      if (Math.random() < 0.6 * S.quality) { const a = rr(0, TAU), d = rr(0.2, 0.5) * size; P('sph', pick([c, 0xffffff]), true, p.x + Math.cos(a) * d, 0.05, p.z + Math.sin(a) * d, 0, rr(1.5, 3.2), 0, 1, 0.14, { end: 0.1, drag: 0.3 }); }
    });
    if (!e) return;
    e.a = em(e, flat(acqTex('rune', GEO.ring, c, 0.9, true))); e.b = em(e, flat(acqTex('rune', GEO.ringThin, 0xffffff, 0.75, true)));
    e.r = em(e, flat(acq('plain', GEO.ring, c, 0.7, true)));
    e.a.position.set(p.x, 0.05, p.z); e.b.position.set(p.x, 0.055, p.z); e.r.position.set(p.x, 0.06, p.z);
    e.bm = []; for (let i = 0; i < 6; i++) e.bm.push(em(e, acq('plain', GEO.box, c, 0.5, true)));
    for (const m of e.bm) m.geometry = GEO.cone;
    ringWave(p.x, p.z, c, size * 0.65, 0.5, 0.6);
    flashLight(c, 1.8, 0.5, p);
  }

  // ------------------------------------------------------------------
  //  SILHOUETTES D'OMBRE
  // ------------------------------------------------------------------
  function shadowRise(pos, o) {
    if (!ensure()) return;
    o = o || {};
    const p = V(pos), dur = o.dur || 2.4, sc = o.scale || 1;
    const hand = 5;
    const e = ent(dur, (e, dt, k) => {
      const t = e.t, up = clamp01(t / 0.9), upE = 1 - Math.pow(1 - up, 3);
      const out = k > 0.72 ? clamp01((k - 0.72) / 0.28) : 0, f = 1 - out;
      const H = 1.7 * sc;
      // corps
      e.body.position.set(p.x, -H * (1 - upE) * 0.9, p.z); e.body.scale.set(0.95 * sc * (1 - out * 0.4), H * (1 + out * 0.5), 0.95 * sc * (1 - out * 0.4)); e.body.material.opacity = 0.88 * f;
      e.head.position.set(p.x, (H * 0.98) - H * (1 - upE) * 0.9 + out * 0.6, p.z); e.head.scale.setScalar(0.46 * sc * (1 - out * 0.5)); e.head.material.opacity = 0.92 * f;
      const ey = (H * 1.0) - H * (1 - upE) * 0.9 + out * 0.6;
      e.e1.position.set(p.x - 0.1 * sc, ey, p.z + 0.17 * sc); e.e2.position.set(p.x + 0.1 * sc, ey, p.z + 0.17 * sc);
      const es = (0.1 * sc) * (t > 0.7 ? 1 : 0) * f; e.e1.scale.setScalar(es); e.e2.scale.setScalar(es);
      // mains/griffes
      for (let i = 0; i < hand; i++) {
        const h = e.h[i], hu = clamp01((t - h.d) / 0.45), hh = (1 - Math.pow(1 - hu, 2)) * h.h * (1 - clamp01((k - 0.55) / 0.3));
        h.m.position.set(h.x, 0, h.z); h.m.scale.set(0.2 * sc, Math.max(0.001, hh), 0.2 * sc);
      }
      e.dec.material.opacity = 0.6 * Math.min(1, t / 0.3) * f;
      if (Math.random() < 0.7 * S.quality) { const a = rr(0, TAU), d = rr(0.2, 1.1) * sc; P('sph', pick(PAL.ombre.cols), true, p.x + Math.cos(a) * d, rr(0, 0.5), p.z + Math.sin(a) * d, 0, rr(1.5, 3.5), 0, rr(0.5, 0.9), rr(0.25, 0.42), { end: 0.1, grav: -1 }); }
      if (out > 0 && Math.random() < 0.9) P('sph', 0xc07bff, true, p.x + rr(-0.4, 0.4), rr(0.2, 2.2), p.z + rr(-0.4, 0.4), 0, rr(2, 4), 0, 0.7, 0.18, { end: 0.1 });
    });
    if (!e) return;
    e.dec = em(e, flat(acqTex('splat', GEO.disc, 0x12041f, 0.6, false))); e.dec.position.set(p.x, 0.04, p.z); setFlat(e.dec, 3.2 * sc);
    e.body = em(e, acq('plain', GEO.cone, 0x0a0414, 0.88, false)); e.head = em(e, acq('plain', GEO.sph, 0x0a0414, 0.92, false));
    e.e1 = em(e, acq('plain', GEO.sph, 0xd9a6ff, 1, true)); e.e2 = em(e, acq('plain', GEO.sph, 0xd9a6ff, 1, true));
    e.h = [];
    for (let i = 0; i < hand; i++) {
      const a = i / hand * TAU + rr(-0.3, 0.3), d = rr(0.9, 1.5) * sc;
      const m = em(e, acq('plain', GEO.cone, 0x1a0a30, 0.9, false)); m.rotation.set(rr(-0.3, 0.3), 0, rr(-0.3, 0.3));
      e.h.push({ m, x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, d: i * 0.07, h: rr(0.9, 1.5) * sc });
    }
    ringWave(p.x, p.z, 0x8a35e0, 2.4 * sc, 0.5, 0.7);
    flashLight(0x8a35e0, 1.8, 0.5, p);
  }

  // ------------------------------------------------------------------
  //  NIVEAU / RANG
  // ------------------------------------------------------------------
  function levelUpBurst(target, color) {
    if (!ensure()) return;
    const c = colorOf(color, 0xffd95a), obj = targetObj(target), p = V(target);
    const e = ent(1.3, (e, dt, k) => {
      if (obj && obj.parent) toVec(obj, e.pos);
      const q = e.pos, pk = 1 - k;
      e.col.position.set(q.x, 0, q.z); e.col.scale.set(1.5 * (1 - k * 0.5), 3.4 * Math.min(1, e.t / 0.15), 1.5 * (1 - k * 0.5)); e.col.material.opacity = 0.5 * pk * pk;
      for (let i = 0; i < 3; i++) {
        const kk = clamp01(k * 1.3 - i * 0.14); const m = e.rg[i];
        m.position.set(q.x, 0.1 + kk * 2.6, q.z); setFlat(m, 2 * (1.5 - kk * 0.3)); m.material.opacity = kk > 0 && kk < 1 ? 0.85 * (1 - kk) : 0;
      }
      if (e.t < 0.7 && Math.random() < 0.9) { const a = rr(0, TAU), d = rr(0.3, 1.2); P('sph', pick([c, 0xffffff]), true, q.x + Math.cos(a) * d, rr(0, 0.4), q.z + Math.sin(a) * d, 0, rr(3, 6), 0, 0.9, 0.16, { end: 0.1, drag: 0.5 }); }
    }, { pos: p });
    if (!e) return;
    e.col = em(e, acq('plain', GEO.cyl, c, 0.5, true));
    e.rg = []; for (let i = 0; i < 3; i++) e.rg.push(em(e, flat(acq('plain', GEO.ring, i === 1 ? 0xffffff : c, 0, true))));
    ringWave(p.x, p.z, c, 3.4, 0.6, 0.9);
    elemBurst('sacre', p.x, p.y + 0.9, p.z, N(10), 1.3);
    screenFlash(c, 0.2, 0.4); flashLight(c, 2.6, 0.5, p);
  }
  function rankUp(target, rank) {
    if (!ensure()) return;
    rank = String(rank || 'E'); const idx = Math.max(0, RANK_ORDER.indexOf(rank));
    let c = RC[rank] != null ? RC[rank] : 0xffffff;
    try { const r = G.RANKS && G.RANKS.find && G.RANKS.find(x => x.id === rank); if (r && r.color) c = colorOf(r.color, c); } catch (_) {}
    const obj = targetObj(target), p = V(target), H = 14 + idx;
    const e = ent(2.4, (e, dt, k) => {
      if (obj && obj.parent) toVec(obj, e.pos);
      const q = e.pos, grow = Math.min(1, e.t / 0.25), fo = k > 0.6 ? (1 - k) / 0.4 : 1, w = (1.2 + 0.6 * Math.sin(e.t * 7)) * 0.3;
      e.col.position.set(q.x, 0, q.z); e.col.scale.set((2.0 - k * 0.8) * (1 + w * 0.2), H * grow, (2.0 - k * 0.8) * (1 + w * 0.2)); e.col.material.opacity = 0.55 * fo;
      e.core.position.set(q.x, 0, q.z); e.core.scale.set(0.8 * fo + 0.05, H * grow, 0.8 * fo + 0.05); e.core.material.opacity = 0.9 * fo;
      for (let i = 0; i < e.rays.length; i++) {
        const a = e.t * 0.6 + i / e.rays.length * TAU, L = (3 + idx * 0.6) * (1 - Math.pow(1 - clamp01(e.t / 0.6), 3));
        e.a.set(q.x + Math.cos(a) * 0.8, 0.08, q.z + Math.sin(a) * 0.8); e.b.set(q.x + Math.cos(a) * L, 0.08, q.z + Math.sin(a) * L);
        bar(e.rays[i], e.a, e.b, 0.22 * fo); e.rays[i].material.opacity = 0.8 * fo;
      }
      const sp = 3 + idx * 1.5;
      for (let s = 0; s < 2 && Math.random() < 0.9 * S.quality; s++) {
        const a = e.t * 5 + s * Math.PI, yy = (e.t * 4 + s) % H;
        P('sph', s ? 0xffffff : c, true, q.x + Math.cos(a) * 1.1, yy, q.z + Math.sin(a) * 1.1, 0, 2, 0, 0.6, 0.18, { end: 0.1 });
      }
      if (e.t < 1.2 && Math.random() < sp / 10) P(idx >= 5 ? 'octa' : 'sph', pick([c, 0xffffff]), true, q.x + rr(-1, 1), rr(0, 1), q.z + rr(-1, 1), rr(-1, 1), rr(4, 8), rr(-1, 1), 1.0, rr(0.14, 0.26), { end: 0.1, drag: 0.5, spin: 4 });
    }, { pos: p });
    if (!e) return;
    e.a = new T.Vector3(); e.b = new T.Vector3();
    e.col = em(e, acq('plain', GEO.cyl, c, 0.55, true)); e.core = em(e, acq('plain', GEO.cyl, 0xffffff, 0.9, true));
    e.rays = []; const nr = 6 + Math.min(6, idx * 1);
    for (let i = 0; i < nr; i++) e.rays.push(em(e, acq('plain', GEO.box, c, 0.8, true)));
    ringWave(p.x, p.z, c, 4.5 + idx * 0.4, 0.8, 0.9); ringWave(p.x, p.z, 0xffffff, 3, 0.55, 0.8, 0.09);
    if (idx >= 5) later(0.25, () => { ringWave(p.x, p.z, c, 7, 0.9, 0.7); });
    if (idx >= 6) { for (let i = 0; i < 8; i++) later(i * 0.1, () => P('plane', 0xfff4c0, 'f', p.x + rr(-1.5, 1.5), 0.5, p.z + rr(-1.5, 1.5), rr(-0.5, 0.5), rr(2, 4), rr(-0.5, 0.5), 2, 0.28, { sy: 1.8, spin: 5, end: 0.8, fade: 0.4 })); }
    screenFlash(c, 0.35 + idx * 0.03, 0.9); flashLight(c, 3.5, 0.8, p);
    if (idx >= 3) legendary(p, c, 0.6);
  }

  // effet légendaire : spirale dorée + éclats
  function legendary(pos, color, scale) {
    if (!ensure()) return;
    const p = V(pos), c = colorOf(color, 0xffd700); scale = scale || 1;
    const e = ent(1.8, (e, dt, k) => {
      for (let s = 0; s < 2; s++) {
        const a = e.t * 7 + s * Math.PI, yy = Math.min(5, e.t * 4.5) * scale, r = (1.3 - Math.min(1, e.t / 1.5) * 0.6) * scale;
        P('sph', s ? 0xffffff : c, true, p.x + Math.cos(a) * r, yy, p.z + Math.sin(a) * r, 0, 0.5, 0, 0.7, 0.2 * scale, { end: 0.1 });
      }
      for (let i = 0; i < 8; i++) {
        const m = e.rays[i], a = e.t * 0.5 + i / 8 * TAU, L = (1 + 3.6 * (1 - Math.pow(1 - clamp01(e.t / 0.5), 3))) * scale;
        e.a.set(p.x + Math.cos(a) * 0.5, 0.09, p.z + Math.sin(a) * 0.5); e.b.set(p.x + Math.cos(a) * L, 0.09, p.z + Math.sin(a) * L);
        bar(m, e.a, e.b, 0.16 * (1 - k)); m.material.opacity = 0.8 * (1 - k);
      }
    });
    if (!e) return;
    e.a = new T.Vector3(); e.b = new T.Vector3(); e.rays = [];
    for (let i = 0; i < 8; i++) e.rays.push(em(e, acq('plain', GEO.box, c, 0.8, true)));
    for (let i = 0; i < N(14); i++) { const a = rr(0, TAU), s = rr(3, 7) * scale; P('octa', pick([c, 0xffffff, 0xfff0a0]), true, p.x, p.y + 0.8, p.z, Math.cos(a) * s, rr(2, 6), Math.sin(a) * s, 1.0, rr(0.16, 0.3) * scale, { grav: 8, spin: 8, sy: 1.6, end: 0.2, drag: 0.6, floor: 0.05 }); }
    ringWave(p.x, p.z, c, 3.5 * scale, 0.7, 0.8);
  }

  // ------------------------------------------------------------------
  //  TRAÎNÉE
  // ------------------------------------------------------------------
  function trailOn(obj, color, o) {
    const handle = { remove() {} };
    if (!ensure()) return handle;
    o = o || {}; const ob = targetObj(obj); if (!ob) return handle;
    const c = colorOf(color, 0xffffff), el = PAL[color] ? color : null;
    const e = ent(o.dur == null ? Infinity : o.dur, (e, dt) => {
      if (!ob.parent) { e.miss += dt; if (e.seen || e.miss > 0.6) return false; return; }
      e.seen = true; toVec(ob, e.p);
      e.acc += dt;
      const step = 0.022 / S.quality;
      while (e.acc >= step) {
        e.acc -= step;
        const x = e.p.x + rr(-0.12, 0.12), y = e.p.y + rr(-0.1, 0.1), z = e.p.z + rr(-0.12, 0.12);
        if (el === 'ombre') P('sph', pick(PAL.ombre.cols), false, x, y, z, rr(-0.3, 0.3), rr(0.3, 0.9), rr(-0.3, 0.3), 0.5, 0.3, { end: 1.6, fade: 0.6 });
        else if (el === 'glace') P('octa', pick(PAL.glace.cols), true, x, y, z, rr(-0.5, 0.5), rr(0, 0.5), rr(-0.5, 0.5), 0.4, 0.12, { sy: 1.6, spin: 6, end: 0.2 });
        else P('sph', Math.random() < 0.3 ? 0xffffff : c, true, x, y, z, rr(-0.3, 0.3), rr(0.2, 0.8), rr(-0.3, 0.3), 0.32, o.size || 0.26, { end: 0.1 });
      }
    }, { acc: 0, p: new T.Vector3(), miss: 0, seen: false });
    if (!e) return handle;
    handle.remove = () => { e.dead = true; };
    return handle;
  }

  // ------------------------------------------------------------------
  //  ÉFFETS SPÉCIAUX DIVERS
  // ------------------------------------------------------------------
  function castCharge(el, pos) {
    const p = V(pos), pl = palOf(el), y = p.y < 0.2 ? 1 : p.y;
    for (let i = 0; i < N(10); i++) { const a = rr(0, TAU), R = rr(1.2, 1.8); P('sph', pick(pl.cols), true, p.x + Math.cos(a) * R, y + rr(-0.5, 0.5), p.z + Math.sin(a) * R, 0, 0, 0, 0.4, 0.16, { end: 0.3, pull: 22, swirl: 6, cx: p.x, cz: p.z, drag: 1 }); }
    const e = ent(0.3, (e, dt, k) => { setFlat(e.m, 2 * (1.6 * (1 - k) + 0.3)); e.m.material.opacity = 0.7 * k; });
    if (e) { e.m = em(e, flat(acq('plain', GEO.ring, pl.main, 0.5, true))); e.m.position.set(p.x, 0.08, p.z); }
  }
  function ground(el, pos, o) {   // zone au sol
    const p = V(pos), pl = palOf(el), r = (o && o.radius) || 3;
    groundDecal(p, el, r, (o && o.dur) || 3.5); ringWave(p.x, p.z, pl.main, r, 0.55, 0.8);
    elemBurst(el, p.x, 0.3, p.z, N(10), 1);
  }
  function soul(pos, color) {
    const p = V(pos), c = colorOf(color, 0x9fe8ff);
    const e = ent(0.9, (e, dt, k) => {
      const y = e.y0 + k * 2.6 + Math.sin(e.t * 9) * 0.05, s = 0.38 * (1 - k * k) * (1 + 0.15 * Math.sin(e.t * 20));
      e.m.position.set(p.x + Math.sin(e.t * 6) * 0.2, y, p.z); e.m.scale.set(s, s * 1.4, s); e.m.material.opacity = 0.9 * (1 - k * k);
      if (Math.random() < 0.7) P('sph', c, true, e.m.position.x, y - 0.2, p.z, rr(-0.2, 0.2), -0.5, rr(-0.2, 0.2), 0.4, 0.14, { end: 0.1 });
    }, { y0: (p.y < 0.2 ? 0.9 : p.y) });
    if (!e) return;
    e.m = em(e, acq('plain', GEO.sph, 0xffffff, 0.9, true));
    glint(p.x, e.y0, p.z, c, 1.1, 0.18);
    elemBurst('physique', p.x, e.y0, p.z, N(4), 0.6);
  }
  function deathPoof(pos, color) {
    const p = V(pos), y = p.y < 0.2 ? 0.7 : p.y, c = colorOf(color, 0x3a3340);
    for (let i = 0; i < N(7); i++) { const a = rr(0, TAU), s = rr(0.5, 2); P('sph', c, false, p.x, y, p.z, Math.cos(a) * s, rr(0.5, 1.8), Math.sin(a) * s, rr(0.5, 0.9), rr(0.4, 0.7), { end: 2.2, grav: -0.5, drag: 1.2, fade: 0.6 }); }
    ringWave(p.x, p.z, 0xffffff, 1.6, 0.3, 0.4);
  }
  function shockwave(pos, radius, color, dust) {
    const p = V(pos), c = colorOf(color, 0xffe9a8); radius = radius || 5;
    ringWave(p.x, p.z, c, radius, 0.55, 0.85); ringWave(p.x, p.z, 0xffffff, radius * 0.65, 0.4, 0.8, 0.09);
    if (dust !== false) for (let i = 0; i < N(18); i++) { const a = i / 18 * TAU + rr(-0.2, 0.2), s = radius * rr(1.2, 1.8); P('sph', 0x6a5f58, false, p.x, 0.3, p.z, Math.cos(a) * s, rr(0.4, 1.2), Math.sin(a) * s, rr(0.5, 0.8), rr(0.4, 0.7), { end: 2, drag: 3, fade: 0.6 }); }
  }
  function slam(pos, radius) {
    const p = V(pos); radius = radius || 4;
    shockwave(p, radius, 0xffe9a8, true); groundDecal(p, 'physique', radius * 0.8, 4);
    for (let i = 0; i < N(12); i++) { const a = rr(0, TAU), s = rr(2, 6); P('box', pick([0x7a6e66, 0x5a5048, 0x9a8e86]), false, p.x, 0.2, p.z, Math.cos(a) * s, rr(4, 9), Math.sin(a) * s, rr(0.6, 1), rr(0.15, 0.32), { grav: 20, floor: 0.1, spin: 7, end: 0.5, fade: 0.3 }); }
    flashLight(0xffe9a8, 2, 0.25, p);
  }
  function bossPhaseFx(pos, color) {
    const p = V(pos), c = colorOf(color, 0xff4a3a);
    shockwave(p, 11, c, true); ringWave(p.x, p.z, c, 6, 0.8, 0.8);
    pillar(p, 'physique', 8, 1.0, c);
    screenFlash(c, 0.32, 0.5); flashLight(c, 4, 0.6, p);
  }
  function lightningStrike(pos) {
    const p = V(pos);
    lightning({ x: p.x + rr(-1, 1), y: 14, z: p.z + rr(-1, 1) }, { x: p.x, y: 0.1, z: p.z }, { dur: 0.35, color: 0xfff04a, branches: 3, width: 0.16, jag: 1.4 });
    ringWave(p.x, p.z, 0xfff04a, 3, 0.4, 0.9); groundDecal(p, 'foudre', 1.8, 3);
    elemBurst('foudre', p.x, 0.5, p.z, N(14), 1.3); screenFlash(0xffffff, 0.22, 0.2); flashLight(0xfff8c0, 4, 0.3, p);
  }
  function holyCross(pos) {
    const p = V(pos);
    const e = ent(1.2, (e, dt, k) => {
      const f = k < 0.15 ? k / 0.15 : (1 - k) / 0.85, s = 1 + 0.05 * Math.sin(e.t * 12);
      e.v.position.set(p.x, 1.6 + k * 0.4, p.z); e.v.scale.set(0.22 * s, 2.6 * f, 0.22); e.v.material.opacity = 0.95 * f;
      e.h.position.set(p.x, 2.1 + k * 0.4, p.z); e.h.scale.set(1.5 * f * s, 0.22, 0.22); e.h.material.opacity = 0.95 * f;
      e.g.position.set(p.x, 1.8 + k * 0.4, p.z); e.g.scale.setScalar(3.2 * f); e.g.material.opacity = 0.3 * f;
      if (Math.random() < 0.6) P('sph', 0xfff0a0, true, p.x + rr(-1, 1), 1 + rr(0, 2), p.z + rr(-0.5, 0.5), 0, rr(0.5, 1.5), 0, 0.6, 0.12, { end: 0.1 });
    });
    if (!e) return;
    e.v = em(e, acq('plain', GEO.box, 0xfff4c0, 0.95, true)); e.h = em(e, acq('plain', GEO.box, 0xfff4c0, 0.95, true)); e.g = em(e, acq('plain', GEO.sph, 0xffd95a, 0.3, true));
    ringWave(p.x, p.z, 0xffd95a, 2.4, 0.6, 0.7); flashLight(0xffd95a, 2.2, 0.5, p);
  }
  function healFx(pos) {
    const p = V(pos);
    for (let i = 0; i < N(10); i++) { const a = rr(0, TAU), d = rr(0.2, 0.9); P('plane', i % 2 ? 0xb8ff9a : 0xfff0a0, 'f', p.x + Math.cos(a) * d, rr(0.1, 0.8), p.z + Math.sin(a) * d, 0, rr(1.5, 2.8), 0, rr(0.8, 1.2), 0.2, { sy: 1, spin: 3, end: 0.4, grav: -0.5, fade: 0.4 }); }
    elemBurst('sacre', p.x, 0.9, p.z, N(6), 0.6); ringWave(p.x, p.z, 0x8aff7a, 1.8, 0.5, 0.6);
  }
  function manaFx(pos) {
    const p = V(pos);
    for (let i = 0; i < N(9); i++) { const a = rr(0, TAU), d = rr(0.2, 0.9); P('sph', pick([0x4aa8ff, 0x9fd8ff, 0xffffff]), true, p.x + Math.cos(a) * d, rr(0.1, 0.8), p.z + Math.sin(a) * d, 0, rr(1.5, 3.2), 0, rr(0.7, 1.1), 0.14, { end: 0.1 }); }
    ringWave(p.x, p.z, 0x4aa8ff, 1.6, 0.45, 0.6);
  }
  function buffFx(pos, color) {
    const p = V(pos), c = colorOf(color, 0xffd95a);
    ringWave(p.x, p.z, c, 2, 0.5, 0.8);
    for (let i = 0; i < N(10); i++) { const a = i / 10 * TAU; P('sph', c, true, p.x + Math.cos(a) * 1.2, 0.1, p.z + Math.sin(a) * 1.2, 0, rr(2.5, 4.5), 0, 0.8, 0.16, { end: 0.1 }); }
  }
  function dashFx(pos, color) {
    const p = V(pos), c = colorOf(color, 0xc8d4ff);
    for (let i = 0; i < N(6); i++) P('sph', 0x8a8490, false, p.x + rr(-0.3, 0.3), 0.2, p.z + rr(-0.3, 0.3), rr(-0.5, 0.5), rr(0.2, 0.8), rr(-0.5, 0.5), 0.5, 0.4, { end: 2, fade: 0.6 });
    ringWave(p.x, p.z, c, 1.4, 0.3, 0.5);
  }
  function teleportFx(pos, color) {
    const p = V(pos), c = colorOf(color, 0x8a35e0);
    pillar(p, 'ombre', 3.2, 0.5, c); elemBurst('ombre', p.x, 1, p.z, N(8), 1);
  }
  function lootBeam(pos, color) {
    const p = V(pos), c = colorOf(color, 0xffb020);
    pillar(p, 'sacre', 7, 1.4, c);
  }
  function stunFx(pos) {
    const p = V(pos), y = p.y < 0.2 ? 2 : p.y;
    const e = ent(1.0, (e, dt, k) => {
      for (let i = 0; i < 3; i++) { const a = e.t * 6 + i * TAU / 3; e.ms[i].position.set(p.x + Math.cos(a) * 0.5, y, p.z + Math.sin(a) * 0.5); e.ms[i].rotation.y = e.t * 5; e.ms[i].scale.setScalar(0.22 * (1 - k * 0.5)); }
    });
    if (!e) return;
    for (let i = 0; i < 3; i++) em(e, acq('plain', GEO.octa, 0xfff04a, 0.95, true));
  }
  function necroAwaken(pos) {
    const p = V(pos);
    summonCircle(p, 0x8a35e0, { size: 8.5, dur: 3.4 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; later(0.3 + i * 0.22, () => shadowRise({ x: p.x + Math.cos(a) * 3, y: 0, z: p.z + Math.sin(a) * 3 }, { dur: 2.2 })); }
    pillar(p, 'ombre', 16, 2.2, 0x6a1fc0);
    later(0.4, () => shockwave(p, 12, 0x8a35e0, false));
    shadowFlames(p, 3, 2.4);
    screenFlash(0x3a0a6a, 0.55, 1.6); flashLight(0x8a35e0, 4, 1.2, p);
  }
  function portalOpen(pos, color) {
    const p = V(pos), c = colorOf(color, 0x9b6bff);
    pillar(p, 'physique', 9, 0.9, c); ringWave(p.x, p.z, c, 6, 0.8, 0.8); elemBurst('foudre', p.x, 1, p.z, N(10), 1);
  }

  // ------------------------------------------------------------------
  //  DISPATCH play(name, pos, opts)
  // ------------------------------------------------------------------
  const ELEMFX = {
    hit: (p, el, o) => hitSpark(p, el, !!o.crit, o.power),
    crit: (p, el, o) => hitSpark(p, el, true, o.power),
    explosion: (p, el, o) => explosion(p, o.radius || 3, el, o),
    slash: (p, el, o) => slash(p, o.dir, palOf(el).main, o.radius, o.arc),
    cast: (p, el) => castCharge(el, p),
    nova: (p, el, o) => { const v = V(p), r = o.radius || 4; ringWave(v.x, v.z, palOf(el).main, r, 0.55, 0.85); ringWave(v.x, v.z, palOf(el).hi, r * 0.6, 0.4, 0.8, 0.09); elemBurst(el, v.x, 0.6, v.z, N(16), 1.4); flashLight(palOf(el).main, 2, 0.25, v); },
    aoe: (p, el, o) => ground(el, p, o),
    pillar: (p, el, o) => pillar(p, el, o.height || 6, o.dur || 0.8, o.color),
    beam: (p, el, o) => beam(p, o.to || playerPos(), el, o.dur),
    bolt: (p, el, o) => lightning(p, o.to, { color: palOf(el).main, dur: o.dur || 0.25 }),
    trail: (p, el) => trailOn(p, el),
  };
  const REG = {
    levelup: (p, o) => levelUpBurst(p, o.color),
    rankup: (p, o) => rankUp(p, o.rank),
    summon: (p, o) => { summonCircle(p, o.color || 0x8a35e0, o); if (o.rise !== false) later(0.5, () => shadowRise(p, o)); },
    shadow_rise: (p, o) => shadowRise(p, o),
    necro_awaken: p => necroAwaken(p),
    boss_phase: (p, o) => bossPhaseFx(p, o.color),
    heal: p => healFx(p), mana: p => manaFx(p), buff: (p, o) => buffFx(p, o.color),
    soul: (p, o) => soul(p, o.color), death: (p, o) => deathPoof(p, o.color),
    dash: (p, o) => dashFx(p, o.color), teleport: (p, o) => teleportFx(p, o.color),
    shockwave: (p, o) => shockwave(p, o.radius, o.color), ground_slam: (p, o) => slam(p, o.radius),
    lightning_strike: p => lightningStrike(p), poison_cloud: (p, o) => poisonCloud(p, o.radius || 2.5, o.dur || 3),
    holy_cross: p => holyCross(p), holy_pillar: (p, o) => pillar(p, 'sacre', o.height || 8, o.dur || 1.2),
    ice_spikes: (p, o) => iceSpikes(p, o.radius || 2.5, o.count || 7), shadow_flames: (p, o) => shadowFlames(p, o.radius || 1.6, o.dur || 1.5),
    legendary: (p, o) => legendary(p, o.color, o.scale), loot_beam: (p, o) => lootBeam(p, o.color),
    portal_open: (p, o) => portalOpen(p, o.color), pickup: (p, o) => { const v = V(p); elemBurst('sacre', v.x, 0.6, v.z, N(5), 0.5); ringWave(v.x, v.z, colorOf(o.color, 0xffd95a), 1.2, 0.3, 0.6); },
    rank_aura: (p, o) => rankAura(p, o.rank, o.dur),
    aura: (p, o) => { const t = (p && p.isObject3D) ? p : null; if (t) return aura(t, o.color, o.dur || 3); const v = V(p); ringWave(v.x, v.z, colorOf(o.color, 0xb44dff), 1.6, 0.4, 0.8); return true; },
    frost_nova: (p, o) => { ELEMFX.nova(p, 'glace', o); iceSpikes(p, (o.radius || 4) * 0.7, 8); },
    fire_nova: (p, o) => ELEMFX.nova(p, 'feu', o), stun: p => stunFx(p),
    decal: (p, o) => groundDecal(p, o.element, o.radius, o.dur),
  };
  const warned = {};
  function play(name, pos, opts) {
    if (!ensure() || !name) return false;
    opts = opts || {}; name = String(name);
    try {
      if (REG[name]) { REG[name](pos, opts); return true; }
      if (ELEMFX[name]) { ELEMFX[name](pos, PAL[opts.element] ? opts.element : 'physique', opts); return true; }
      const i = name.indexOf('_');
      if (i > 0) {
        const base = name.slice(0, i), el = name.slice(i + 1);
        if (ELEMFX[base] && PAL[el]) { ELEMFX[base](pos, el, opts); return true; }
      }
    } catch (err) { if (!warned.err) { warned.err = 1; console.error('[VFX.play]', name, err); } return false; }
    if (!warned[name]) { warned[name] = 1; console.warn('[VFX] effet inconnu : ' + name); }
    return false;
  }

  // émission brute de particules pour les autres rôles : emit({shape,color,add,pos,vel,life,size,...})
  function emit(s) {
    if (!ensure() || !s) return;
    const p = V(s.pos), v = s.vel || {};
    const n = N(s.count || 1);
    for (let i = 0; i < n; i++) {
      const sp = s.spread || 0;
      P(s.shape || 'sph', colorOf(s.color, 0xffffff), s.add === false ? false : true, p.x + rr(-sp, sp), p.y + rr(-sp, sp), p.z + rr(-sp, sp),
        (v.x || 0) + rr(-1, 1) * (s.jitter || 0), (v.y || 0) + rr(-1, 1) * (s.jitter || 0), (v.z || 0) + rr(-1, 1) * (s.jitter || 0), s.life || 0.6, s.size || 0.2, s);
    }
  }

  // ------------------------------------------------------------------
  //  BOUCLE
  // ------------------------------------------------------------------
  let emaDt = 1 / 60, perFrameHits = 0;
  function frame(dt0) {
    if (!root) return;
    const core = G.core;
    if (root.parent !== core.scene) core.scene.add(root);
    const dt = (core.paused ? 0 : Math.min(dt0 || 0, 0.05));
    perFrameHits = 0;
    if (dt > 0) {
      if (S.adaptive && dt0 > 0) {
        emaDt += (dt0 - emaDt) * 0.05;
        if (emaDt > 0.032) S.quality = Math.max(0.4, S.quality - dt * 0.15); else if (emaDt < 0.021) S.quality = Math.min(1, S.quality + dt * 0.08);
      }
      updateTimers(dt); updateEnts(dt); updateParticles(dt); updatePortals(dt);
    } else updatePortals(0);
    if (light) {
      if (lt.i > 0 && dt > 0) { lt.t += dt; const k = lt.t / lt.life; light.intensity = k >= 1 ? 0 : lt.i * (1 - k) * (1 - k); if (k >= 1) lt.i = 0; }
      else if (lt.i <= 0 && light.intensity !== 0) light.intensity = 0;
    }
    if (sf.on && sfEl) {
      sf.t += dt0 > 0 ? dt0 : 0; const k = sf.t / sf.life;
      if (k >= 1) { sf.on = false; sfEl.style.opacity = '0'; } else sfEl.style.opacity = String(sf.a * (1 - k) * (1 - k));
    }
  }

  // ------------------------------------------------------------------
  //  BUS (effets automatiques non intrusifs)
  // ------------------------------------------------------------------
  let bound = false;
  const hero = () => { try { const p = G.SkillAPI && G.SkillAPI.inRun && G.SkillAPI.inRun() && G.SkillAPI.player(); return p && (p.hero || p.pos) || null; } catch (_) { return null; } };
  const entPos = t => (t && (t.pos || (t.mesh && t.mesh.position) || t.position)) || null;
  function bindBus() {
    if (bound || !G.bus || !G.bus.on) return;
    bound = true;
    const ok = () => S.autoEvents && root;
    G.bus.on('damageDealt', d => {
      if (!ok() || !d || !(d.amount > 0)) return;
      if (d.kind === 'dot' && Math.random() > 0.12) return;
      if (perFrameHits >= 4 || pAct.length > S.maxParticles * 0.8) return;
      const p = entPos(d.target); if (!p) return;
      perFrameHits++; hitSpark(p, d.element, !!d.crit);
    });
    G.bus.on('enemyKilled', d => {
      if (!ok() || !d || !d.enemy || pAct.length > S.maxParticles * 0.85) return;
      const p = entPos(d.enemy); if (!p) return;
      if (d.enemy.boss) { explosion(p, 4, d.element || 'physique'); return; }
      soul(p, d.element ? palOf(d.element).hi : undefined);
    });
    G.bus.on('levelUp', () => { if (!ok()) return; const h = hero(); if (h) levelUpBurst(h, 0xffd95a); });
    G.bus.on('rankUp', d => { if (!ok()) return; const h = hero(); const r = typeof d === 'string' ? d : d && (d.rank || d.to || d.id || d.newRank); if (h) rankUp(h, r); });
    G.bus.on('necroAwakened', () => { if (!ok()) return; const h = hero(); necroAwaken(h || playerPos()); });
    G.bus.on('bossPhase', d => {
      if (!ok()) return; const b = d && d.boss, p = entPos(b) || playerPos();
      let c; try { const el = b && b.def && b.def.element; c = el ? palOf(el).main : undefined; } catch (_) {}
      bossPhaseFx(p, c);
    });
  }

  function clear() {
    for (let i = ents.length - 1; i >= 0; i--) endEnt(ents[i], i);
    ents.length = 0; timers.length = 0; decals.length = 0; auras.length = 0;
    while (pAct.length) { const p = pAct.pop(); p.m.visible = false; pFree.push(p); }
    if (light) light.intensity = 0; lt.i = 0;
    if (sfEl) sfEl.style.opacity = '0'; sf.on = false;
  }
  function stats() {
    return { particles: pAct.length, ents: ents.length, meshesInUse: usedM, meshesMade: madeM, particleMeshes: madeP, quality: S.quality, portals: portals.length,
      sceneObjects: root ? (() => { let n = 0; root.traverse(() => n++); return n; })() : 0 };
  }

  G.VFX = {
    colors, palette: PAL, rankColors: RC, settings: S,
    play, slash, explosion, beam, lightning, aura, rankAura, portal, summonCircle, shadowRise,
    levelUpBurst, rankUp, hitSpark, trailOn, groundDecal, screenFlash, flashLight, emit, clear, stats, later,
    pillar, legendary, iceSpikes, poisonCloud, shockwave,
    // ELEMENTS: alias contractuel
    ELEMENTS: Object.keys(PAL),
  };
  // initialisation (G.core est chargé avant ; sinon retente au chargement du DOM)
  if (!ensure()) { try { addEventListener('DOMContentLoaded', () => ensure()); } catch (_) {} }
})();
