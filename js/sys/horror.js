window.G = window.G || {};
/* =====================================================================
 *  Donjon Arena 3D — v5 « Ténèbres » — G.Horror (agent 6, Horror Designer)
 *  Horreur PSYCHOLOGIQUE et progressive : lanterne, obscurité pilotée par le thème, brouillard
 *  qui respire, nappes de brume, vignette, tension 0..1 (bus 'tension'), directeur d'événements
 *  (bus 'horrorEvent'), nettoyage complet entre salles / runs.
 *  Réglage : G.settings.horror = 'normal' | 'reduit' | 'off'  (G.Horror.setLevel(v) le persiste).
 *  Aucun setTimeout : tout est piloté par le bus 'tick' (le jeu en pause = l'horreur en pause).
 * ===================================================================== */
(() => {
  'use strict';
  if (G.Horror && G.Horror.__v5) return;

  const HALF = 14;
  const RANK_IDX = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6, SSS: 6 };
  const LS_KEY = 'donjon-arena-horror';
  const SOUND_FALLBACK = { porte: 'door', chute: 'slam' };   // G.sfx si G.Audio est absent

  // ------------------------------------------------------------------ utilitaires
  const R = () => (G.rng && G.rng.float ? G.rng.float() : Math.random());
  const rr = (a, b) => a + R() * (b - a);
  const chance = p => R() < p;
  const pick = a => a[Math.floor(R() * a.length) % a.length];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const warn = (...a) => { try { console.warn('[horror]', ...a); } catch (_) { /* rien */ } };

  // ------------------------------------------------------------------ réglage utilisateur
  G.settings = G.settings || {};
  if (G.settings.horror === undefined) {
    let v = 'normal';
    try { const s = localStorage.getItem(LS_KEY); if (s === 'normal' || s === 'reduit' || s === 'off') v = s; } catch (_) { /* rien */ }
    G.settings.horror = v;
  }
  const level = () => { const s = G.settings && G.settings.horror; return s === 'off' || s === 'reduit' ? s : 'normal'; };
  const mult = () => { const l = level(); return l === 'off' ? 0 : l === 'reduit' ? 0.5 : 1; };
  let mq = null;
  const reduced = () => {
    try { if (G.settings && G.settings.reduceMotion) return true; } catch (_) { /* rien */ }
    try { if (mq === null) mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : false; return !!(mq && mq.matches); } catch (_) { return false; }
  };
  const flashOk = () => !reduced() && !(G.settings && G.settings.screenFlash === false);

  // ------------------------------------------------------------------ état
  const S = {
    active: false, enabled: false, time: 0, rankN: 0, rank: 'E', dungeon: null, override: null, only: null, never: null,
    darkTheme: 0.4, darkEff: 0.4, I: 0.5,
    tension: 0, tTarget: 0, bump: 0, evalT: 0, emitT: 0, lastActivity: 0, lastHit: -99, roomT: 0,
    dim: 1, dimTarget: 1, kick: 0, gate: 0.5, restored: false, lanternK: 1, fogK: 1, shift: 0, shiftTarget: 0, hold: 0,
    flkLevel: 0, flkSent: -1, flkT: 0, dipT: 0, vigT: 0, redShown: 0,
    lanternR: 12,
  };
  // base du thème courant (relevée sur scene/hemi/sun APRÈS G.core.setTheme) + dernières valeurs écrites par nous
  const B = { ok: false, near: 38, far: 75, hemi: 0.85, sun: 0.9, explicit: false, bg: [0.1, 0.07, 0.2], hemiC: [0.9, 0.9, 1], sunC: [1, 1, 1], theme: null };
  const L = { near: -1, far: -1, hemi: -1, sun: -1, bgS: -1 };

  let lantern = null;            // {light, halo, haloMat}
  let mist = null;               // {items:[{m,mat,vx,vz,ph,size,a}]}
  let vigEl = null, redEl = null, styleEl = null;
  const A = { tex: [], geo: {}, ready: false };       // ressources partagées (libérées à la fin du run)
  const fx = [];                                       // effets / événements en cours
  let rl = [];                                         // lumières de salle surveillées [{l, base, last, touched}]
  const D = { nextAt: 0, budget: 0, used: {}, lastId: null, lastAt: {}, perRoom: {}, count: 0, history: [], suddenCount: 0 };

  const getRun = () => (G.game && G.game.run) || null;
  const P = () => { try { return G.SkillAPI && G.SkillAPI.inRun && G.SkillAPI.inRun() ? G.SkillAPI.player() : null; } catch (_) { return null; } };
  const scene = () => G.core && G.core.scene;

  // ------------------------------------------------------------------ son (G.Audio avec repli G.sfx)
  function snd(name, x, z, opts) {
    try {
      const Au = G.Audio;
      if (Au) {
        if (x != null && typeof Au.at === 'function') { Au.at(name, x, z, opts); return; }
        if (typeof Au.play === 'function') { Au.play(name, opts); return; }
      }
      if (G.sfx && SOUND_FALLBACK[name]) G.sfx.play(SOUND_FALLBACK[name]);
    } catch (e) { warn('son', name, e); }
  }
  function audioSilence(sec) {
    try {
      const Au = G.Audio; if (!Au) return;
      if (typeof Au.silence === 'function') Au.silence(sec);
      else if (typeof Au.duck === 'function') Au.duck(0.03, sec);
    } catch (e) { warn('silence', e); }
  }
  function audioDuck(level2, sec) { try { if (G.Audio && typeof G.Audio.duck === 'function') G.Audio.duck(level2, sec); } catch (_) { /* rien */ } }

  // ------------------------------------------------------------------ ressources partagées
  function radialTex(size, stops, blobs) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const draw = (cx, cy, r, a) => {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      stops.forEach(s => gr.addColorStop(s[0], 'rgba(' + s[1] + ',' + (s[2] * a).toFixed(3) + ')'));
      g.fillStyle = gr; g.fillRect(0, 0, size, size);
    };
    if (!blobs) draw(size / 2, size / 2, size / 2, 1);
    else for (let i = 0; i < blobs; i++) draw(size * rr(0.25, 0.75), size * rr(0.25, 0.75), size * rr(0.22, 0.42), 0.8);
    const t = new THREE.CanvasTexture(c);
    return t;
  }
  function ensureAssets() {
    if (A.ready || typeof THREE === 'undefined') return;
    A.tex.push(radialTex(64, [[0, '255,255,255', 1], [0.35, '255,255,255', 0.5], [1, '255,255,255', 0]]));       // 0 halo
    A.tex.push(radialTex(64, [[0, '255,255,255', 0.55], [0.6, '255,255,255', 0.18], [1, '255,255,255', 0]], 5));  // 1 brume a
    A.tex.push(radialTex(64, [[0, '255,255,255', 0.55], [0.6, '255,255,255', 0.18], [1, '255,255,255', 0]], 4));  // 2 brume b
    A.geo.plane = new THREE.PlaneGeometry(1, 1);
    A.geo.body = new THREE.CylinderGeometry(0.13, 0.3, 1.7, 8);
    A.geo.head = new THREE.SphereGeometry(0.2, 8, 6);
    A.geo.arm = new THREE.BoxGeometry(0.07, 1.15, 0.07);
    A.geo.eye = new THREE.SphereGeometry(0.055, 6, 4);
    A.geo.pot = new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8);
    A.geo.bone = new THREE.BoxGeometry(0.1, 0.8, 0.1);
    A.geo.skull = new THREE.SphereGeometry(0.22, 8, 6);
    A.geo.idol = new THREE.BoxGeometry(0.7, 2.1, 0.5);
    A.ready = true;
  }
  function disposeAssets() {
    A.tex.forEach(t => { try { t.dispose(); } catch (_) { /* rien */ } });
    Object.keys(A.geo).forEach(k => { try { A.geo[k].dispose(); } catch (_) { /* rien */ } });
    A.tex.length = 0; A.geo = {}; A.ready = false;
  }

  // ------------------------------------------------------------------ DOM : vignette + voile rouge
  function ensureDom() {
    if (vigEl || typeof document === 'undefined' || !document.body) return;
    styleEl = document.createElement('style'); styleEl.id = 'hz-style';
    styleEl.textContent =
      '#hz-vig,#hz-red{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0}' +
      '#hz-vig{transition:opacity .35s linear;background:radial-gradient(ellipse at 50% 48%,rgba(0,0,0,0) 48%,rgba(0,0,0,.35) 76%,rgba(0,0,4,.8) 100%)}' +
      '#hz-red{transition:opacity 1.1s ease-in-out;background:radial-gradient(ellipse at 50% 50%,rgba(90,0,8,.08) 25%,rgba(110,0,12,.5) 100%)}';
    document.head.appendChild(styleEl);
    vigEl = document.createElement('div'); vigEl.id = 'hz-vig'; vigEl.setAttribute('aria-hidden', 'true');
    redEl = document.createElement('div'); redEl.id = 'hz-red'; redEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(vigEl); document.body.appendChild(redEl);
  }
  function removeDom() {
    [vigEl, redEl, styleEl].forEach(e => { try { if (e && e.parentNode) e.parentNode.removeChild(e); } catch (_) { /* rien */ } });
    vigEl = redEl = styleEl = null;
  }

  // ------------------------------------------------------------------ lanterne, halo, brume
  function buildLantern() {
    if (lantern || !scene() || typeof THREE === 'undefined') return;
    ensureAssets();
    const light = new THREE.PointLight(0xffa860, 1.2, 16, 1.6);
    light.castShadow = false;
    const haloMat = new THREE.MeshBasicMaterial({ map: A.tex[0], color: 0xffb070, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const halo = new THREE.Mesh(A.geo.plane, haloMat);
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.07; halo.renderOrder = 1; halo.frustumCulled = false;
    scene().add(light); scene().add(halo);
    lantern = { light, halo, haloMat };
  }
  function buildMist() {
    if (mist || !scene() || typeof THREE === 'undefined') return;
    ensureAssets();
    const items = [];
    const p = P();
    const cx = p ? p.pos.x : 0, cz = p ? p.pos.z : 0;
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: A.tex[1 + (i & 1)], color: 0x9aa4b8, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const m = new THREE.Mesh(A.geo.plane, mat);
      const size = rr(7, 11);
      m.rotation.x = -Math.PI / 2; m.rotation.z = rr(0, 6.28);
      const a = rr(0, 6.28), d = rr(2, 13);
      m.position.set(cx + Math.cos(a) * d, 0.32 + i * 0.025, cz + Math.sin(a) * d);
      m.scale.set(size, size, 1); m.renderOrder = 2; m.frustumCulled = false;
      scene().add(m);
      items.push({ m, mat, vx: rr(-0.35, 0.35), vz: rr(-0.25, 0.25), ph: rr(0, 6.28), size, a: rr(0.5, 1) });
    }
    mist = { items };
  }
  function disposeLanternMist() {
    const sc = scene();
    if (lantern) {
      try { if (sc) { sc.remove(lantern.light); sc.remove(lantern.halo); } lantern.haloMat.dispose(); if (lantern.light.dispose) lantern.light.dispose(); } catch (_) { /* rien */ }
      lantern = null;
    }
    if (mist) {
      mist.items.forEach(it => { try { if (sc) sc.remove(it.m); it.mat.dispose(); } catch (_) { /* rien */ } });
      mist = null;
    }
  }
  function mistColor() {
    // brume = couleur de fond éclaircie
    const k = 0.5, c = 0.38;
    return [clamp(B.bg[0] * k + c, 0, 1), clamp(B.bg[1] * k + c, 0, 1), clamp(B.bg[2] * k + c + 0.04, 0, 1)];
  }

  // ------------------------------------------------------------------ profil / thème
  const rankN = r => clamp((RANK_IDX[String(r || 'E').toUpperCase()] || 0) / 6, 0, 1);
  function setProfile(dungeon) {
    S.dungeon = dungeon || null;
    S.override = null; S.only = null; S.never = null;
    const h = dungeon && dungeon.horror;
    if (typeof h === 'number') S.override = clamp(h, 0, 1);
    else if (h && typeof h === 'object') {
      // data/dungeons.js publie horror:{level, statue} (DUNGEON-IDS) : « level » est accepté comme alias d'« intensity »
      const lvl = typeof h.intensity === 'number' ? h.intensity : h.level;
      if (typeof lvl === 'number' && isFinite(lvl)) S.override = clamp(lvl, 0, 1);
      if (Array.isArray(h.only)) S.only = h.only.slice();
      if (Array.isArray(h.disable)) S.never = h.disable.slice();
    }
    const rk = (dungeon && dungeon.rank) || (getRun() && getRun().rank) || 'E';
    S.rank = rk; S.rankN = rankN(rk);
    recomputeProfile();
  }
  function recomputeProfile() {
    const g = S.override != null ? S.override : S.rankN;
    S.gate = g;
    S.I = 0.25 + 0.75 * g;
    const th = B.theme;
    let d = th && typeof th.darkness === 'number' ? clamp(th.darkness, 0, 1) : 0.15 + 0.75 * S.rankN;
    if (S.override != null && !(th && typeof th.darkness === 'number')) d = 0.15 + 0.75 * S.override;
    S.darkTheme = d;
    S.darkEff = d * mult();
    S.enabled = mult() > 0;
  }
  function readBaseFromScene(theme) {
    const sc = scene(), core = G.core;
    if (!sc || !core) return;
    B.theme = theme || core.theme || B.theme;
    const t = B.theme || {};
    if (sc.fog) { B.near = sc.fog.near; B.far = sc.fog.far; }
    B.hemi = core.hemi.intensity; B.sun = core.sun.intensity;
    B.explicit = t.hemiIntensity != null;
    try {
      if (t.bg != null) { const c = new THREE.Color(t.bg); B.bg = [c.r, c.g, c.b]; }
      else if (!B.ok && sc.background && sc.background.r != null) B.bg = [sc.background.r, sc.background.g, sc.background.b];
      if (t.hemiSky != null) { const c = new THREE.Color(t.hemiSky); B.hemiC = [c.r, c.g, c.b]; } else if (!B.ok) B.hemiC = [core.hemi.color.r, core.hemi.color.g, core.hemi.color.b];
      if (t.sun != null) { const c = new THREE.Color(t.sun); B.sunC = [c.r, c.g, c.b]; } else if (!B.ok) B.sunC = [core.sun.color.r, core.sun.color.g, core.sun.color.b];
    } catch (_) { /* rien */ }
    B.ok = true;
    L.near = B.near; L.far = B.far; L.hemi = B.hemi; L.sun = B.sun; L.bgS = -1;
    S.shift = 0; S.shiftTarget = 0;
    recomputeProfile();
  }
  function restoreAtmos() {
    const sc = scene(), core = G.core;
    if (!sc || !core || !B.ok) return;
    try {
      if (sc.fog) { sc.fog.near = B.near; sc.fog.far = B.far; }
      core.hemi.intensity = B.hemi; core.sun.intensity = B.sun;
      core.hemi.color.setRGB(B.hemiC[0], B.hemiC[1], B.hemiC[2]); core.sun.color.setRGB(B.sunC[0], B.sunC[1], B.sunC[2]);
      if (sc.background && sc.background.setRGB) sc.background.setRGB(B.bg[0], B.bg[1], B.bg[2]);
      if (sc.fog) sc.fog.color.setRGB(B.bg[0], B.bg[1], B.bg[2]);
    } catch (_) { /* rien */ }
    L.near = B.near; L.far = B.far; L.hemi = B.hemi; L.sun = B.sun; L.bgS = -1;
  }

  // ------------------------------------------------------------------ atmosphère par frame (sans allocation)
  function updateAtmos(dt) {
    const sc = scene(), core = G.core;
    if (!sc || !core || !B.ok) return;
    const fog = sc.fog, hemi = core.hemi, sun = core.sun;
    // une écriture extérieure (procgen « ténèbres », thème…) devient la nouvelle base
    if (fog && L.near >= 0 && (fog.near !== L.near || fog.far !== L.far)) { B.near = fog.near; B.far = fog.far; }
    if (L.hemi >= 0 && hemi.intensity !== L.hemi) B.hemi = hemi.intensity;
    if (L.sun >= 0 && sun.intensity !== L.sun) B.sun = sun.intensity;
    if (!S.enabled) {
      if (!S.restored) { restoreAtmos(); S.restored = true; }
      return;
    }
    S.restored = false;
    const t = core.time || S.time, tn = S.tension, d = S.darkEff;
    const rate = reduced() ? 2.5 : 9;
    S.dim += (S.dimTarget - S.dim) * (1 - Math.exp(-dt * rate));
    S.shift += (S.shiftTarget - S.shift) * (1 - Math.exp(-dt * 3));
    S.fogK += ((S.hold > 0 ? 0.8 : 1) - S.fogK) * (1 - Math.exp(-dt * 1.5));
    const breathe = 1 + (0.07 * Math.sin(t * 0.31) + 0.04 * Math.sin(t * 0.83 + 1.7)) * (0.4 + tn);
    const kH = 1 - (B.explicit ? 0.15 : 0.45) * d, kS = 1 - (B.explicit ? 0.22 : 0.5) * d;
    const dimE = S.dim * (1 - S.kick);
    const hv = B.hemi * kH * (0.6 + 0.4 * dimE) * (1 - 0.08 * tn);
    const sv = B.sun * kS * (0.5 + 0.5 * dimE);
    hemi.intensity = hv; sun.intensity = sv; L.hemi = hv; L.sun = sv;
    if (fog) {
      let near = B.near * (1 - 0.55 * d) * (1 - 0.12 * tn) * breathe * S.fogK;
      let far = B.far * (1 - 0.4 * d) * (1 - 0.15 * tn) * breathe * S.fogK;
      // la caméra est à ≈ 24 u du joueur : le brouillard ne doit jamais avaler l'aire de jeu
      near = Math.max(near, Math.min(25, B.near * 0.9)); if (far < near + 24) far = Math.max(near + 24, Math.min(B.far, near + 24));
      fog.near = near; fog.far = far; L.near = near; L.far = far;
    }
    // fond / brouillard assombris + teinte rouge de « la salle change »
    const bgS = 1 - 0.3 * d - (1 - S.dim) * 0.2;
    const sh = S.shift;
    if (Math.abs(bgS - L.bgS) > 0.002 || sh > 0.001 || L.shiftOn) {
      const rc = 0.16, gc = 0.0, bc = 0.02;
      const r = lerp(B.bg[0] * bgS, rc, sh * 0.8), g = lerp(B.bg[1] * bgS, gc, sh * 0.8), b = lerp(B.bg[2] * bgS, bc, sh * 0.8);
      if (sc.background && sc.background.setRGB) sc.background.setRGB(r, g, b);
      if (fog) fog.color.setRGB(r, g, b);
      hemi.color.setRGB(lerp(B.hemiC[0], 1, sh * 0.5), lerp(B.hemiC[1], 0.12, sh * 0.7), lerp(B.hemiC[2], 0.1, sh * 0.7));
      sun.color.setRGB(lerp(B.sunC[0], 1, sh * 0.5), lerp(B.sunC[1], 0.15, sh * 0.7), lerp(B.sunC[2], 0.1, sh * 0.7));
      L.bgS = bgS; L.shiftOn = sh > 0.001;
    }
  }

  // ------------------------------------------------------------------ lumières de salle (dim + scintillement)
  function collectRoomLights() {
    rl = [];
    const run = getRun();
    const room = run && run.room;
    const list = room && Array.isArray(room.lights) ? room.lights : [];
    for (let i = 0; i < list.length && i < 6; i++) { const l = list[i]; if (l && typeof l.intensity === 'number') rl.push({ l, base: l.intensity, last: l.intensity, touched: false }); }
  }
  function restoreRoomLights() { rl.forEach(e => { if (e.touched) { try { e.l.intensity = e.base; } catch (_) { /* rien */ } e.touched = false; } }); }
  function updateRoomLights(dt) {
    const run = getRun(), room = run && run.room;
    // niveau de scintillement ambiant
    const lvl = S.enabled ? clamp((S.tension - 0.35) * 1.3, 0, 0.7) * mult() * (reduced() ? 0.3 : 1) : 0;
    S.flkT -= dt;
    if (room && typeof room.flicker === 'function' && S.flkT <= 0 && Math.abs(lvl - S.flkSent) > 0.04) {
      S.flkT = 0.12; S.flkSent = lvl;
      try { room.flicker(lvl); } catch (e) { warn('room.flicker', e); }
    }
    const own = !(room && typeof room.flicker === 'function');
    const t = S.time;
    let noise = 1;
    if (own && lvl > 0.02) noise = 1 - lvl * (0.35 + 0.35 * Math.sin(t * 23.1) * Math.sin(t * 7.7 + 1.3));
    const k = S.enabled ? S.dim * (1 - S.kick) * noise : 1;
    for (let i = 0; i < rl.length; i++) {
      const e = rl[i], l = e.l;
      if (l.intensity !== e.last) e.base = l.intensity;       // la salle (room.update) a réécrit : nouvelle base
      if (k > 0.995 && !e.touched) { e.last = l.intensity; continue; }
      const v = k > 0.995 ? e.base : e.base * k;
      l.intensity = v; e.last = v; e.touched = k <= 0.995;
    }
  }
  function lightsNear(x, z, r) {
    for (let i = 0; i < rl.length; i++) {
      const e = rl[i]; if (e.base < 0.15 || S.dim < 0.5) continue;
      const lp = e.l.position; if (Math.hypot(lp.x - x, lp.z - z) < r) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ lanterne par frame
  function updateLantern(dt, p) {
    if (!lantern) return;
    const on = S.enabled && p && !p.dead;
    lantern.light.visible = true;
    if (!on) { lantern.light.intensity = 0; lantern.halo.visible = false; return; }
    const t = S.time, d = S.darkEff, tn = S.tension, red = reduced() ? 0.3 : 1;
    S.lanternK += ((S.dim < 0.6 ? 0.55 : 1) - S.lanternK) * (1 - Math.exp(-dt * 4));
    S.dipT -= dt;
    if (S.dipT <= 0 && red === 1 && chance(dt * (0.04 + 0.35 * Math.max(0, tn - 0.5)))) S.dipT = 0.14;
    const flick = 1 + red * (0.035 * Math.sin(t * 11.3) + 0.02 * Math.sin(t * 27.1 + 1.3) + (0.02 + 0.03 * tn) * Math.sin(t * 5.1)) - (S.dipT > 0 ? 0.4 : 0);
    const dk = S.darkTheme * mult();
    const R0 = lerp(19, 14, dk) * (1 - 0.08 * tn) * (0.75 + 0.25 * S.lanternK);
    S.lanternR = R0;
    const I0 = lerp(1.1, 1.9, dk) * S.lanternK * flick;
    lantern.light.intensity = I0;
    lantern.light.distance = R0 * 1.35;
    lantern.light.position.set(p.pos.x, 3.4, p.pos.z);
    lantern.halo.visible = true;
    lantern.halo.position.x = p.pos.x; lantern.halo.position.z = p.pos.z;
    const hs = R0 * 1.5;
    lantern.halo.scale.set(hs, hs, 1);
    lantern.haloMat.opacity = clamp(0.14 + 0.32 * dk, 0.1, 0.5) * S.lanternK * (0.9 + 0.1 * flick);
  }

  // ------------------------------------------------------------------ brume par frame
  function updateMist(dt, p) {
    if (!mist) return;
    const on = S.enabled && p;
    const amt = on ? (0.3 + 0.7 * S.darkEff) * (0.65 + 0.35 * S.tension) * (mult() < 1 ? 0.7 : 1) : 0;
    const col = mistColor();
    const t = S.time, wa = 0.4 * Math.sin(t * 0.05), wx = Math.cos(wa), wz = Math.sin(wa);
    const px = p ? p.pos.x : 0, pz = p ? p.pos.z : 0;
    const sp = reduced() ? 0.4 : 1;
    for (let i = 0; i < mist.items.length; i++) {
      const it = mist.items[i], m = it.m;
      m.position.x += (it.vx * 0.6 + wx * 0.3) * dt * sp; m.position.z += (it.vz * 0.6 + wz * 0.2) * dt * sp;
      m.rotation.z += 0.01 * dt * sp;
      const dx = m.position.x - px, dz = m.position.z - pz, dist = Math.hypot(dx, dz);
      if (dist > 16) { const a = rr(0, 6.28), dd = rr(8, 13); m.position.x = px + Math.cos(a) * dd; m.position.z = pz + Math.sin(a) * dd; }
      const edge = clamp((15 - dist) / 4, 0, 1);
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.4 + it.ph);
      it.mat.opacity = on ? 0.2 * amt * it.a * edge * pulse : 0;
      it.mat.color.setRGB(col[0], col[1], col[2]);
      m.visible = it.mat.opacity > 0.003;
    }
  }

  // ------------------------------------------------------------------ vignette DOM (≈ 8 Hz)
  function updateVignette(dt) {
    S.vigT -= dt; if (S.vigT > 0) return; S.vigT = 0.12;
    if (!vigEl) return;
    const on = S.enabled && getRun() && !getRun().finished;
    let a = on ? clamp(0.12 + 0.45 * S.tension + 0.12 * S.darkEff, 0, 1) * (mult() < 1 ? 0.7 : 1) : 0;
    if (on && S.tension > 0.6 && !reduced()) a = clamp(a + 0.07 * Math.sin(S.time * 8.2), 0, 1);   // battement discret
    vigEl.style.opacity = a.toFixed(3);
    const rs = on && flashOk() ? clamp(S.shift, 0, 1) : (on && S.shift > 0.05 ? 0.25 : 0);
    const rv = rs.toFixed(2);
    if (redEl && String(S.redShown) !== rv) { redEl.style.opacity = rv; S.redShown = rv; }
  }

  // ------------------------------------------------------------------ tension
  function evalTension(p) {
    const run = getRun();
    if (!p || p.dead || !run || !S.enabled) { S.tTarget = 0; return; }
    let nVis = 0, nHid = 0, close = 0;
    let list = [];
    try { list = G.SkillAPI.enemies() || []; } catch (_) { list = []; }
    const W = typeof innerWidth === 'number' ? innerWidth : 800, H = typeof innerHeight === 'number' ? innerHeight : 600;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (!e || e.dead || !e.pos) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < 8) close++;
      if (d > 26) continue;
      let vis = true;
      try { const sc = G.core.toScreen(e.pos, 1); vis = sc.visible && sc.x >= 0 && sc.x <= W && sc.y >= 0 && sc.y <= H; } catch (_) { vis = true; }
      if (vis) nVis++; else if (d < 18) nHid++;
    }
    const hp = p.pvMax > 0 ? p.pv / p.pvMax : 1;
    let t = 0.08 + 0.38 * S.darkEff;
    if (hp < 0.6) t += (0.6 - hp) / 0.6 * 0.3;
    t += Math.min(0.3, nHid * 0.12);
    if (nVis === 0) t += clamp((S.time - S.lastActivity - 8) / 40, 0, 1) * 0.22;
    if (run.bossRoom) t += 0.1;
    t += S.bump;
    if (close > 0) t -= 0.12 + Math.min(0.15, close * 0.04);
    if (lightsNear(p.pos.x, p.pos.z, 5)) t -= 0.15;
    t *= 0.6 + 0.4 * S.rankN;
    if (level() === 'reduit') t *= 0.6;
    S.tTarget = clamp(t, 0, 1);
  }

  // ------------------------------------------------------------------ outils de placement
  function freeSpot(x, z, m) {
    const run = getRun();
    if (Math.abs(x) > HALF - 1.8 || Math.abs(z) > HALF - 1.8) return false;
    const ob = run && run.obstacles || [];
    for (let i = 0; i < ob.length; i++) { const o = ob[i]; if (Math.abs(x - o.x) < o.hw + m && Math.abs(z - o.z) < o.hd + m) return false; }
    return true;
  }
  const inFront = (p, x, z, cone) => {
    const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    return (p.dir.x * dx + p.dir.z * dz) / d > cone;
  };
  function anchorsOf(kind) {
    const run = getRun(), a = run && run.room && run.room.anchors;
    const l = a && a[kind];
    return Array.isArray(l) ? l : [];
  }
  /** opts: min, max, away (pas dans le champ de visée), behind (dans le dos), margin, anchors ('shadows'|'sounds') */
  function pickSpot(p, o) {
    const min = o.min, max = o.max, m = o.margin == null ? 0.9 : o.margin;
    if (o.anchors && chance(0.65)) {
      const cand = anchorsOf(o.anchors).filter(a => {
        const d = Math.hypot(a[0] - p.pos.x, a[1] - p.pos.z);
        return d >= min * 0.8 && d <= max * 1.25 && (!o.away || !inFront(p, a[0], a[1], 0.5));
      });
      if (cand.length) { const a = pick(cand); return { x: a[0], z: a[1] }; }
    }
    const back = Math.atan2(-p.dir.z, -p.dir.x);
    for (let i = 0; i < 20; i++) {
      const ang = o.behind ? back + rr(-0.9, 0.9) : rr(0, 6.283);
      const d = rr(min, max);
      const x = p.pos.x + Math.cos(ang) * d, z = p.pos.z + Math.sin(ang) * d;
      if (!freeSpot(x, z, m)) continue;
      if (o.away && inFront(p, x, z, 0.5)) continue;
      return { x, z };
    }
    // repli : n'importe où libre
    for (let i = 0; i < 20; i++) { const x = rr(-HALF + 2, HALF - 2), z = rr(-HALF + 2, HALF - 2); if (freeSpot(x, z, m) && Math.hypot(x - p.pos.x, z - p.pos.z) >= min * 0.7) return { x, z }; }
    return null;
  }

  // ------------------------------------------------------------------ silhouettes (mesh noir mince, yeux luisants)
  function makeShade(scale, eyeColor, bodyless) {
    ensureAssets();
    const g = new THREE.Group();
    const bm = new THREE.MeshBasicMaterial({ color: 0x030305, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const em = new THREE.MeshBasicMaterial({ color: eyeColor, transparent: true, opacity: 0, fog: false });
    let ey = 1.5;
    if (!bodyless) {
      const body = new THREE.Mesh(A.geo.body, bm); body.position.y = 0.85;
      const head = new THREE.Mesh(A.geo.head, bm); head.position.y = 1.95;
      const aL = new THREE.Mesh(A.geo.arm, bm); aL.position.set(-0.32, 1.1, 0); aL.rotation.z = 0.1;
      const aR = new THREE.Mesh(A.geo.arm, bm); aR.position.set(0.32, 1.1, 0); aR.rotation.z = -0.1;
      g.add(body, head, aL, aR); ey = 1.98;
    }
    const e1 = new THREE.Mesh(A.geo.eye, em), e2 = new THREE.Mesh(A.geo.eye, em);
    e1.position.set(-0.085, ey, 0.17); e2.position.set(0.085, ey, 0.17);
    g.add(e1, e2);
    g.scale.setScalar(scale);
    scene().add(g);
    const s = {
      g, bm, em, a: 0,
      setA(v, eyes) { this.a = v; bm.opacity = v * 0.96; em.opacity = clamp(eyes == null ? v : eyes, 0, 1); g.visible = v > 0.01; },
      faceTo(x, z) { g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z); },
      dispose() { try { if (g.parent) g.parent.remove(g); bm.dispose(); em.dispose(); } catch (_) { /* rien */ } },
    };
    s.setA(0);
    return s;
  }
  function puff(x, y, z, n) { try { if (G.fx && G.fx.burst && !reduced()) G.fx.burst({ x, y, z }, 0x1a1a26, n || 6, { speed: 1.2, up: 0.8, life: 0.7, size: 0.9, gravity: -0.5 }); } catch (_) { /* rien */ } }

  // ------------------------------------------------------------------ événements
  // Chaque événement : run(ctx) -> bool (démarré ?). Les effets vivants sont des objets {t, major, update(dt)->bool, end()} dans fx[].
  function addFx(o) { o.t = 0; fx.push(o); return o; }
  const emitEvent = id => { try { G.bus && G.bus.emit('horrorEvent', { id }); } catch (_) { /* rien */ } };
  const countEnemies = () => { try { return (G.SkillAPI.enemies() || []).filter(e => e && !e.dead).length; } catch (_) { return 0; } };

  const EV = {};

  EV.door_slam = (p) => {
    const sp = pickSpot(p, { min: 8, max: 15, away: true });
    const x = sp ? sp.x : 0, z = sp ? sp.z : -HALF;
    snd('porte', x, z);
    try { if (G.core && G.core.shake) G.core.shake(0.2); } catch (_) { /* rien */ }
    S.bump += 0.15;
    S.kick = reduced() ? 0.15 : 0.5;
    addFx({ major: false, update() { return this.t < 0.8; } });
    return true;
  };

  EV.footsteps = (p) => {
    const dir = { x: p.dir.x, z: p.dir.z };
    const start = pickSpot(p, { min: 8, max: 10, behind: true, margin: 0.4 });
    const sx = start ? start.x : p.pos.x - dir.x * 9, sz = start ? start.z : p.pos.z - dir.z * 9;
    const n = 5 + Math.floor(R() * 3);
    let k = 0;
    addFx({ major: true, next: 0.4, update(dt) {
      if (this.t >= this.next) {
        const f = k / n, x = lerp(sx, p.pos.x, f * 0.55), z = lerp(sz, p.pos.z, f * 0.55);
        snd('pas', x, z); k++; this.next += lerp(0.62, 0.5, f) + rr(-0.06, 0.06);
        if (k >= n) { S.bump += 0.2; return false; }
      }
      return true;
    } });
    return true;
  };

  EV.whispers = (p) => {
    const n = 2 + Math.floor(R() * 2);
    let k = 0;
    const sp = pickSpot(p, { min: 4.5, max: 8, margin: 0.3 }) || { x: p.pos.x + 5, z: p.pos.z };
    audioDuck(0.55, 4);
    addFx({ major: true, next: 0.3, update(dt) {
      if (this.t >= this.next) {
        snd(k % 2 ? 'murmure' : 'chuchotement', sp.x + rr(-1.5, 1.5), sp.z + rr(-1.5, 1.5));
        k++; this.next += rr(1.1, 2);
        if (k >= n) { S.bump += 0.18; return false; }
      }
      return true;
    } });
    return true;
  };

  EV.far_noise = (p) => {
    const n = 1 + Math.floor(R() * 3);
    let k = 0;
    const names = ['craquement', 'chaines', 'cri_lointain', 'grondement'];
    addFx({ major: true, next: 0.2, update(dt) {
      if (this.t >= this.next) {
        snd(pick(names), rr(-9, 9), -HALF - rr(4, 8));
        k++; this.next += rr(1.5, 3);
        if (k >= n) { S.bump += 0.12; return false; }
      }
      return true;
    } });
    return true;
  };

  function watchedBy(p, x, z, d) { return d < 19 && inFront(p, x, z, 0.82); }

  EV.eyes = (p) => {
    const sp = pickSpot(p, { min: 9, max: 13.5, away: false, anchors: 'shadows', margin: 0.6 });
    if (!sp) return false;
    const sh = makeShade(1, 0xffe9a8, true);
    sh.g.position.set(sp.x, 0.0, sp.z); sh.faceTo(p.pos.x, p.pos.z);
    const life = rr(4, 7); let gaze = 0, blink = rr(1, 2.5), blinkT = 0;
    addFx({ major: false, update(dt) {
      const d = Math.hypot(sp.x - p.pos.x, sp.z - p.pos.z);
      sh.faceTo(p.pos.x, p.pos.z);
      blink -= dt; if (blink <= 0) { blinkT = 0.18; blink = rr(1.5, 3.5); }
      blinkT -= dt;
      const fadeIn = clamp(this.t / 1.6, 0, 1);
      if (watchedBy(p, sp.x, sp.z, d)) gaze += dt; else gaze = Math.max(0, gaze - dt);
      if (d < 6.5 || gaze > 0.5 || this.t > life) this.out = (this.out || 0) + dt / 0.6;
      const a = fadeIn * (1 - clamp(this.out || 0, 0, 1));
      sh.setA(a, blinkT > 0 ? 0 : a * 0.9);
      if (this.out >= 1) { puff(sp.x, 1.5, sp.z, 3); return false; }
      return true;
    }, end() { sh.dispose(); } });
    S.bump += 0.12;
    return true;
  };

  EV.silhouette = (p) => {
    const sp = pickSpot(p, { min: 11, max: 16, anchors: 'shadows', margin: 0.8 });
    if (!sp) return false;
    const sh = makeShade(1.05, 0xff3a2a, false);
    sh.g.position.set(sp.x, 0, sp.z); sh.faceTo(p.pos.x, p.pos.z);
    snd('murmure', sp.x, sp.z);
    const life = rr(6, 9); let gaze = 0, soundDone = false;
    addFx({ major: true, update(dt) {
      const d = Math.hypot(sp.x - p.pos.x, sp.z - p.pos.z);
      sh.faceTo(p.pos.x, p.pos.z);
      const fadeIn = clamp(this.t / 1.5, 0, 1);
      if (watchedBy(p, sp.x, sp.z, d)) gaze += dt; else gaze = Math.max(0, gaze - dt * 0.5);
      if (d < 7.5 || gaze > 0.4 || this.t > life) { if (!this.out) { this.out = 0.0001; if (!soundDone) { soundDone = true; snd('chuchotement', sp.x, sp.z); } } }
      if (this.out) this.out += dt / 0.7;
      const a = fadeIn * (1 - clamp(this.out || 0, 0, 1));
      sh.setA(a, a * (0.8 + 0.2 * Math.sin(this.t * 3)));
      if (this.out >= 1) { puff(sp.x, 1, sp.z, 6); S.bump += 0.1; return false; }
      return true;
    }, end() { sh.dispose(); } });
    S.bump += 0.2;
    return true;
  };

  function statueObj(s) { return s && (s.position ? s : s.mesh && s.mesh.position ? s.mesh : s.group && s.group.position ? s.group : null); }
  const movedStatues = new Map();
  EV.statue = (p) => {
    const cand = anchorsOf('statues').map(statueObj).filter(o => {
      if (!o || (movedStatues.get(o) || 0) >= 2) return false;
      const d = Math.hypot(o.position.x - p.pos.x, o.position.z - p.pos.z);
      return d > 6 && (!inFront(p, o.position.x, o.position.z, 0.35) || d > 14);
    });
    if (cand.length) {
      const o = pick(cand);
      const dx = p.pos.x - o.position.x, dz = p.pos.z - o.position.z, d = Math.hypot(dx, dz) || 1;
      o.rotation.y = Math.atan2(dx, dz);
      const nx = o.position.x + dx / d * 0.7, nz = o.position.z + dz / d * 0.7;
      if (freeSpot(nx, nz, 0.6)) { o.position.x = nx; o.position.z = nz; }
      movedStatues.set(o, (movedStatues.get(o) || 0) + 1);
      snd('craquement', o.position.x, o.position.z);
      S.bump += 0.2;
      return true;
    }
    // repli : une idole d'ombre qui se rapproche à chaque fois qu'on ne la regarde pas
    const sp = pickSpot(p, { min: 12, max: 15, away: true, margin: 1 });
    if (!sp) return false;
    ensureAssets();
    const m = new THREE.MeshBasicMaterial({ color: 0x0b0a10, transparent: true, opacity: 0, fog: false });
    const mesh = new THREE.Mesh(A.geo.idol, m); mesh.position.set(sp.x, 1.05, sp.z);
    scene().add(mesh);
    let nextMove = 5, moves = 0, gaze = 0;
    addFx({ major: false, update(dt) {
      const d = Math.hypot(mesh.position.x - p.pos.x, mesh.position.z - p.pos.z);
      m.opacity = Math.min(m.opacity + dt * 0.8, 0.95) * (this.out ? clamp(1 - (this.out += dt / 0.8), 0, 1) : 1) || 0;
      mesh.rotation.y = Math.atan2(p.pos.x - mesh.position.x, p.pos.z - mesh.position.z);
      const seen = d < 20 && inFront(p, mesh.position.x, mesh.position.z, 0.55);
      if (seen) gaze += dt; else gaze = Math.max(0, gaze - dt);
      if (!seen && this.t >= nextMove && moves < 3 && d > 8.5) {
        const k = 3.2 / d, nx = mesh.position.x + (p.pos.x - mesh.position.x) * k, nz = mesh.position.z + (p.pos.z - mesh.position.z) * k;
        if (freeSpot(nx, nz, 0.7)) { mesh.position.x = nx; mesh.position.z = nz; snd('craquement', nx, nz); moves++; S.bump += 0.12; }
        nextMove = this.t + rr(5, 8);
      }
      if (!this.out && (this.t > 26 || d < 6.5 || gaze > 3)) this.out = 0.0001;
      return !(this.out >= 1);
    }, end() { try { scene().remove(mesh); m.dispose(); } catch (_) { /* rien */ } } });
    return true;
  };

  EV.object_fall = (p) => {
    const sp = pickSpot(p, { min: 5, max: 9, away: true, margin: 0.5 });
    if (!sp) return false;
    ensureAssets();
    const kind = pick(['pot', 'bone', 'skull']);
    const mat = new THREE.MeshBasicMaterial({ color: kind === 'pot' ? 0x6b4a3a : 0x9a9484, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(A.geo[kind], mat);
    mesh.position.set(sp.x, 7, sp.z); scene().add(mesh);
    let vy = 0, landed = false, bounced = false, rot = rr(-4, 4);
    addFx({ major: false, update(dt) {
      if (!landed) {
        vy -= 22 * dt; mesh.position.y += vy * dt; mesh.rotation.x += rot * dt; mesh.rotation.z += rot * 0.6 * dt;
        const floor = kind === 'bone' ? 0.1 : 0.25;
        if (mesh.position.y <= floor) {
          mesh.position.y = floor;
          snd('chute', sp.x, sp.z);
          if (!bounced) { bounced = true; vy = 2.6; puff(sp.x, 0.2, sp.z, 7); } else { landed = true; this.rest = this.t; }
        }
      } else {
        const k = (this.t - this.rest - 6) / 1.2;
        if (k > 0) mat.opacity = clamp(1 - k, 0, 1);
        if (k >= 1) return false;
      }
      return true;
    }, end() { try { scene().remove(mesh); mat.dispose(); } catch (_) { /* rien */ } } });
    S.bump += 0.15;
    return true;
  };

  EV.lights_out = (p) => {
    const dur = rr(2, 4) * (0.8 + 0.2 * S.I);
    snd('craquement', p.pos.x + rr(-4, 4), p.pos.z + rr(-4, 4));
    const soft = reduced();
    const room = getRun() && getRun().room;
    let whisp = false;
    addFx({ major: true, update(dt) {
      const t = this.t;
      if (soft) S.dimTarget = t < 0.8 ? 1 - 0.95 * (t / 0.8) : (t < dur ? 0.05 : 1);
      else if (t < 0.35) S.dimTarget = 0.4;
      else if (t < 0.7) S.dimTarget = 1;
      else if (t < dur) S.dimTarget = 0.04;
      else S.dimTarget = 1;
      if (room && typeof room.flicker === 'function') { try { room.flicker(t < dur ? 0.9 : 0); } catch (_) { /* rien */ } S.flkSent = -1; }
      if (!whisp && t > 1.3 && chance(0.02 + 0.5 * dt)) { whisp = true; const a = rr(0, 6.28); snd('chuchotement', p.pos.x + Math.cos(a) * 6, p.pos.z + Math.sin(a) * 6); }
      if (t >= dur + (soft ? 0.8 : 0.3)) { S.dimTarget = 1; S.bump += 0.25; return false; }
      return true;
    }, end() { S.dimTarget = 1; try { if (room && room.flicker) room.flicker(0); } catch (_) { /* rien */ } } });
    return true;
  };

  EV.room_shift = (p) => {
    const soft = reduced() || !flashOk();
    const peak = soft ? 0.45 : 1;
    snd('grondement', p.pos.x, p.pos.z + 8);
    audioDuck(0.5, 3);
    const up = soft ? 1.4 : 0.7, hold = soft ? 1.6 : 1.1, down = soft ? 1.6 : 0.9;
    addFx({ major: true, update(dt) {
      const t = this.t;
      if (t < up) { S.shiftTarget = peak; S.dimTarget = Math.min(S.dimTarget, 0.6); }
      else if (t < up + hold) { S.shiftTarget = peak; S.dimTarget = 0.6; }
      else { S.shiftTarget = 0; S.dimTarget = 1; }
      if (t >= up + hold + down) return false;
      return true;
    }, end() { S.shiftTarget = 0; S.dimTarget = 1; S.bump += 0.2; } });
    return true;
  };

  EV.false_silence = (p) => {
    audioSilence(5);
    S.hold = 5;
    addFx({ major: true, update(dt) {
      S.hold = Math.max(0, 5 - this.t);
      if (this.t >= 5) { if (chance(0.4)) snd('pas', p.pos.x - p.dir.x * 5, p.pos.z - p.dir.z * 5); S.bump += 0.2; return false; }
      return true;
    }, end() { S.hold = 0; } });
    return true;
  };

  EV.sudden = (p) => {
    // RARE : une silhouette surgit au bord de la lumière, sans aucun dégât
    let x = 0, z = 0, found = false;
    const base = Math.atan2(p.dir.z, p.dir.x);
    for (const dd of [6.5, 5.5, 4.5, 7.5]) {
      for (const da of [0, 0.5, -0.5, 1.0, -1.0]) {
        x = p.pos.x + Math.cos(base + da) * dd; z = p.pos.z + Math.sin(base + da) * dd;
        if (freeSpot(x, z, 0.5)) { found = true; break; }
      }
      if (found) break;
    }
    if (!found) return false;
    const sh = makeShade(1.15, 0xff2a18, false);
    sh.g.position.set(x, 0, z); sh.faceTo(p.pos.x, p.pos.z);
    snd('cri_lointain', x, z); audioDuck(0.4, 2.5);
    try { if (G.core && G.core.shake && !reduced()) G.core.shake(0.1); } catch (_) { /* rien */ }
    addFx({ major: true, update(dt) {
      const t = this.t, a = t < 0.3 ? t / 0.3 : (t < 1.4 ? 1 : clamp(1 - (t - 1.4) / 0.9, 0, 1));
      sh.setA(a, a); sh.faceTo(p.pos.x, p.pos.z);
      return t < 2.3;
    }, end() { sh.dispose(); S.bump += 0.3; } });
    D.suddenCount++;
    return true;
  };

  EV.hunter = (p) => {
    const sp = pickSpot(p, { min: 13, max: 17, away: true, margin: 0.5 });
    if (!sp) return false;
    const sh = makeShade(1.3, 0xff2020, false);
    const pos = sh.g.position; pos.set(sp.x, 0, sp.z);
    snd('cri_lointain', sp.x, sp.z);
    const life = rr(8, 12) * 1.0;
    let stepT = 0, trailT = 0, hurtDone = false, cycle = 0;
    addFx({ major: true, update(dt) {
      const t = this.t, d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      sh.faceTo(p.pos.x, p.pos.z);
      // fin : temps écoulé, joueur affaibli ou combat engagé, ou lumière (torche de salle)
      if (!this.out) {
        const hp = p.pvMax > 0 ? p.pv / p.pvMax : 1;
        const run = getRun();
        const busy = run && (run.modal || run.transition || run.bossRoom || run.roomState === 'cleared');
        if (t > life + 1.2 || hp < 0.25 || p.dead || busy || (t > 1.5 && countEnemies() > 0 && nearEnemy(p, 6)) || (t > 1.5 && lightsNear(pos.x, pos.z, 3.2))) this.out = 0.0001;
      }
      let move = !this.out && t > 1.2;
      cycle += dt;                                   // 2,2 s de poursuite / 0,7 s d'hésitation
      const phase = cycle % 2.9, hes = phase > 2.2;
      if (this.out) this.out += dt / 0.9;
      const a = clamp(t / 1.2, 0, 1) * (this.out ? clamp(1 - this.out, 0, 1) : 1);
      sh.setA(a, hes ? a * 0.35 : a);
      if (move && !hes && d > 0.3) {
        const sp2 = Math.max(3, num(p.speed, 5)) * 1.12;
        pos.x += (p.pos.x - pos.x) / d * sp2 * dt; pos.z += (p.pos.z - pos.z) / d * sp2 * dt;
        pos.y = 0.12 * Math.sin(t * 9);
        stepT -= dt; if (stepT <= 0) { stepT = 0.55; snd('pas', pos.x, pos.z); }
        trailT -= dt; if (trailT <= 0) { trailT = 0.14; try { if (G.fx && G.fx.trail && !reduced()) G.fx.trail({ x: pos.x, y: 0.9, z: pos.z }, 0x14101c, 0.5); } catch (_) { /* rien */ } }
      }
      // contact : un seul coup, faible ; la roulade (invulnérabilité) l'esquive et le dissipe
      if (move && !hes && !hurtDone && d < 1.0) {
        if (p.dashInvuln > 0) { hurtDone = true; this.out = Math.max(this.out || 0, 0.0001); S.bump = Math.max(0, S.bump - 0.25); snd('murmure', pos.x, pos.z); }
        else if (p.invuln > 0) { /* grâce après un coup : il traverse */ }
        else {
          hurtDone = true;
          const dmg = Math.max(2, Math.round(num(p.pvMax, 100) * 0.05));
          try { G.SkillAPI.damagePlayer(dmg, { element: 'ombre', source: 'horror' }); } catch (_) { /* rien */ }
          this.out = Math.max(this.out || 0, 0.0001);
        }
      }
      if (this.out >= 1) { puff(pos.x, 1, pos.z, 8); S.bump += 0.1; return false; }
      return true;
    }, end() { sh.dispose(); } });
    S.bump += 0.25;
    return true;
  };
  function nearEnemy(p, r) {
    try { const l = G.SkillAPI.enemies() || []; for (let i = 0; i < l.length; i++) { const e = l[i]; if (e && !e.dead && e.pos && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < r) return true; } } catch (_) { /* rien */ }
    return false;
  }

  // table de pilotage : w = poids, rank = rang minimal (0..1), cd = recharge (s de jeu), max = par salle
  const META = {
    door_slam: { w: 3, rank: 0, cd: 45, max: 2 },
    footsteps: { w: 3, rank: 0, cd: 40, max: 2 },
    far_noise: { w: 2.5, rank: 0, cd: 40, max: 2 },
    whispers: { w: 2.5, rank: 0.05, cd: 50, max: 2 },
    eyes: { w: 2, rank: 0.15, cd: 35, max: 2 },
    object_fall: { w: 2, rank: 0.1, cd: 50, max: 1 },
    lights_out: { w: 2, rank: 0.2, cd: 70, max: 1, scary: true },
    silhouette: { w: 2.2, rank: 0.3, cd: 60, max: 1, scary: true },
    statue: { w: 1.6, rank: 0.3, cd: 80, max: 1, scary: true },
    false_silence: { w: 1.4, rank: 0.3, cd: 90, max: 1, scary: true },
    room_shift: { w: 1.2, rank: 0.45, cd: 120, max: 1, scary: true },
    hunter: { w: 1.2, rank: 0.5, cd: 150, max: 1, scary: true, needCalm: true },
    sudden: { w: 0.7, rank: 0.4, cd: 300, max: 1, scary: true, rare: true, needCalm: true },
  };
  const IDS = Object.keys(META);

  // ------------------------------------------------------------------ directeur
  function roomBudget() {
    const run = getRun();
    if (!S.enabled || !run || run.bossRoom) return 0;
    let b = 1.2 + 3.8 * S.I;
    if (level() === 'reduit') b *= 0.5;
    return Math.max(1, Math.round(b));
  }
  function interval() {
    let v = rr(15, 30) / (0.55 + 0.7 * S.I);
    if (level() === 'reduit') v *= 1.6;
    return v;
  }
  function canFire(p, force) {
    const run = getRun();
    if (!run || run.finished || !p || p.dead) return false;
    if (force) return true;
    if (run.modal || run.transition || run.bossRoom || run.bossIntro) return false;
    if (S.roomT < 6 || S.time - S.lastHit < 3) return false;
    return true;
  }
  function eligible(id, p, force) {
    const m = META[id]; if (!m) return false;
    if (force) return true;
    if (S.never && S.never.indexOf(id) >= 0) return false;
    if (S.only && S.only.indexOf(id) < 0) return false;
    if (m.rank > S.gate + 1e-6) return false;
    if (level() === 'reduit' && (m.scary || m.rare)) return false;
    if ((D.perRoom[id] || 0) >= m.max) return false;
    if (S.time - (D.lastAt[id] || -1e9) < m.cd) return false;
    if (id === D.lastId) return false;
    if (m.rare && (D.suddenCount >= 1 || S.tension < 0.45 || !chance(0.5))) return false;
    if (m.needCalm) {
      const hp = p.pvMax > 0 ? p.pv / p.pvMax : 1;
      if (hp < 0.4 || countEnemies() > 3) return false;
    }
    if (m.scary && fx.some(f => f.major)) return false;
    return true;
  }
  function startEvent(id, force) {
    const p = P(); if (!p || !EV[id]) return false;
    if (!force && !eligible(id, p, false)) return false;
    if (!canFire(p, true)) return false;
    ensureAssets();
    let ok = false;
    try { ok = !!EV[id](p); } catch (e) { warn('événement ' + id, e); ok = false; }
    if (!ok) return false;
    D.lastId = id; D.lastAt[id] = S.time; D.perRoom[id] = (D.perRoom[id] || 0) + 1; D.count++;
    D.history.push(id); if (D.history.length > 40) D.history.shift();
    emitEvent(id);
    return true;
  }
  function directorTick(p) {
    if (!S.enabled) return;
    if (S.time < D.nextAt) return;
    if (!canFire(p, false)) { D.nextAt = S.time + 2; return; }
    if (D.budget <= 0) { D.nextAt = S.time + 10; return; }
    if (fx.some(f => f.major)) { D.nextAt = S.time + 2; return; }
    if (S.tension > 0.85 && chance(0.5)) { D.nextAt = S.time + 4; return; }        // laisse respirer
    const pool = [];
    let tot = 0;
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i]; if (!eligible(id, p, false)) continue;
      const m = META[id];
      let w = m.w * (m.scary ? 0.5 + S.tension : 1.2 - 0.4 * S.tension);
      if (m.rare) w *= 0.5;
      pool.push([id, w]); tot += w;
    }
    if (!pool.length) { D.nextAt = S.time + 6; return; }
    for (let tries = 0; tries < 3 && pool.length; tries++) {
      let r = R() * tot, idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r < 0) { idx = i; break; } }
      const id = pool[idx][0];
      if (startEvent(id, false)) { D.budget--; D.nextAt = S.time + interval(); return; }
      tot -= pool[idx][1]; pool.splice(idx, 1);
    }
    D.nextAt = S.time + 5;
  }

  // ------------------------------------------------------------------ nettoyage
  function clearFx() {
    for (let i = fx.length - 1; i >= 0; i--) { try { if (fx[i].end) fx[i].end(); } catch (_) { /* rien */ } }
    fx.length = 0;
    S.dimTarget = 1; S.shiftTarget = 0; S.hold = 0;
  }
  function resetRoom() {
    restoreRoomLights();
    try { const room = getRun() && getRun().room; if (room && typeof room.flicker === 'function' && S.flkSent > 0) room.flicker(0); } catch (_) { /* rien */ }
    clearFx();
    movedStatues.clear();
    rl = []; S.flkSent = -1; S.dim = 1; S.shift = 0; S.roomT = 0;
    D.perRoom = {}; D.lastId = D.lastId; D.budget = roomBudget(); D.nextAt = S.time + rr(8, 15);
  }
  function fullCleanup() {
    clearFx();
    restoreRoomLights(); rl = [];
    restoreAtmos();
    disposeLanternMist();
    removeDom();
    disposeAssets();
    movedStatues.clear();
    S.active = false; S.tension = 0; S.tTarget = 0; S.bump = 0; S.dim = 1; S.kick = 0; S.shift = 0; S.hold = 0; S.fogK = 1;
    S.flkSent = -1; B.ok = false; B.theme = null;
    D.budget = 0; D.lastId = null; D.lastAt = {}; D.perRoom = {}; D.suddenCount = 0;
    L.near = L.far = L.hemi = L.sun = -1; L.bgS = -1; L.shiftOn = false;
  }

  // ------------------------------------------------------------------ boucle
  function onTick(e) {
    const run = getRun();
    if (!S.active) return;
    if (!run || run.finished) { if (!run) fullCleanup(); return; }
    const dt = clamp(num(e && e.dt, 1 / 60), 0, 0.1);
    S.time += dt; S.roomT += dt;
    const p = P();
    if (!lantern && S.enabled) buildLantern();
    if (!mist && S.enabled) buildMist();
    if (!vigEl) ensureDom();
    S.bump = Math.max(0, S.bump - dt * 0.06); S.kick = Math.max(0, S.kick - dt * 2.2);
    // tension
    S.evalT -= dt;
    if (S.evalT <= 0) { S.evalT = 0.25; evalTension(p); }
    S.tension += (S.tTarget - S.tension) * (1 - Math.exp(-dt * (S.tTarget > S.tension ? 0.6 : 1.2)));
    S.emitT -= dt;
    if (S.emitT <= 0) { S.emitT = 0.25; try { G.bus.emit('tension', { value: S.enabled ? S.tension : 0 }); } catch (_) { /* rien */ } }
    // effets / événements
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt;
      let alive = true;
      try { alive = f.update(dt) !== false; } catch (err) { warn('fx', err); alive = false; }
      if (!alive) { try { if (f.end) f.end(); } catch (_) { /* rien */ } fx.splice(i, 1); }
    }
    if (S.dimTarget !== 1 && !fx.length) S.dimTarget = 1;     // garde-fou
    if (p) directorTick(p);
    updateRoomLights(dt);
    updateAtmos(dt);
    updateLantern(dt, p);
    updateMist(dt, p);
    updateVignette(dt);
  }

  // ------------------------------------------------------------------ bus
  function bind() {
    const bus = G.bus; if (!bus || !bus.on) return false;
    bus.on('runStart', e => {
      fullCleanup();
      S.active = true; S.time = 0; S.lastActivity = 0; S.lastHit = -99;
      ensureAssets();
      setProfile((e && e.dungeon) || null);
      if (e && e.run && e.run.rank) { S.rank = e.run.rank; S.rankN = rankN(e.run.rank); recomputeProfile(); }
      if (S.enabled) { ensureDom(); buildLantern(); buildMist(); }
      if (G.core && G.core.theme) readBaseFromScene(G.core.theme);
    });
    bus.on('themeChanged', e => { if (S.active) { readBaseFromScene(e && e.theme); restoreAtmos(); } });
    bus.on('roomStart', () => {
      if (!S.active) return;
      if (!B.ok) readBaseFromScene(G.core && G.core.theme);
      resetRoom(); collectRoomLights();
      if (S.enabled) { ensureDom(); buildLantern(); buildMist(); }
    });
    bus.on('runEnd', () => { if (S.active) fullCleanup(); });
    bus.on('tick', onTick);
    bus.on('playerHit', () => { S.lastHit = S.time; S.lastActivity = S.time; });
    bus.on('enemyKilled', () => { S.lastActivity = S.time; });
    bus.on('enemySpawn', () => { S.lastActivity = Math.max(S.lastActivity, S.time - 4); });
    bus.on('roomCleared', () => { S.bump = Math.max(0, S.bump - 0.1); });
    bus.on('settingsChanged', e => {
      if (!e || e.key === 'horror' || e.key === '*') {
        recomputeProfile();
        if (!S.enabled && S.active) { clearFx(); restoreRoomLights(); restoreAtmos(); disposeLanternMist(); S.tension = 0; S.tTarget = 0; if (vigEl) vigEl.style.opacity = 0; if (redEl) redEl.style.opacity = 0; }
        else if (S.enabled && S.active) { ensureDom(); buildLantern(); buildMist(); if (B.ok) { L.bgS = -1; } D.budget = Math.max(D.budget, roomBudget()); }
      }
    });
    return true;
  }

  // ------------------------------------------------------------------ API publique
  G.Horror = {
    __v5: true,
    setProfile,
    tension: () => (S.enabled ? S.tension : 0),
    level,
    intensity: () => S.I,
    isActive: () => S.active && S.enabled,
    setLevel(v) {
      if (v !== 'normal' && v !== 'reduit' && v !== 'off') return false;
      G.settings.horror = v;
      try { localStorage.setItem(LS_KEY, v); } catch (_) { /* rien */ }
      try { G.bus.emit('settingsChanged', { key: 'horror', value: v, settings: G.settings }); } catch (_) { /* rien */ }
      return true;
    },
    events: IDS.slice(),
    debug: {
      trigger(id, force) { return startEvent(id, force !== false); },
      state() {
        const sc = scene();
        return {
          active: S.active, enabled: S.enabled, level: level(), tension: +S.tension.toFixed(3), darkEff: +S.darkEff.toFixed(3), darkTheme: +S.darkTheme.toFixed(3), I: S.I, rank: S.rank,
          fx: fx.length, roomLights: rl.length, budget: D.budget, count: D.count, last: D.lastId, history: D.history.slice(), lanternR: +S.lanternR.toFixed(2),
          dim: +S.dim.toFixed(2), shift: +S.shift.toFixed(2),
          sceneChildren: sc ? sc.children.length : 0,
          dom: ['hz-vig', 'hz-red', 'hz-style'].filter(i => document.getElementById(i)).length,
          lantern: !!lantern, mist: mist ? mist.items.length : 0,
          base: { near: B.near, far: B.far, hemi: B.hemi, sun: B.sun }, fog: sc && sc.fog ? [sc.fog.near, sc.fog.far] : null,
          hemi: G.core ? G.core.hemi.intensity : null, sun: G.core ? G.core.sun.intensity : null,
        };
      },
      setTension(v) { S.tTarget = S.tension = clamp(v, 0, 1); S.evalT = 1e9; },
      clear: clearFx,
      budget(n) { D.budget = n; D.nextAt = 0; },
      fire() { D.nextAt = 0; },
    },
  };

  if (!bind()) {
    // le bus n'est pas encore là (ne devrait pas arriver) : réessaie au chargement
    if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', bind);
  }
})();
