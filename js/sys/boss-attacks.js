/* =====================================================================
 *  Donjon Arena 3D v3 — Rôle 10 : attaques et mécaniques de boss (G.BossAttacks)
 *  - 20 attaques G.BossAttacks.register(id, {windup, execute(boss, api, phase), update?(boss, dt, api)})
 *      execute() démarre l'attaque et renvoie un « handle » {done:boolean, duration, id} : game.js attend h.done.
 *  - mécaniques uniques : register('mech_<id>', ...) ; modules composables (bouclier de cristaux, ordre, errant,
 *    étendard, garde frontale, camouflage, riposte, prisme, lumière, mares, toiles, couverture, sceaux,
 *    séquence, reflets, effondrement, furie, lave) pilotés par boss.def.mechOpts.
 *  - AUTONOME : tout est piloté par le bus 'tick' (G.bus) ; execute()/update() de game.js sont optionnels.
 *    Les mécaniques démarrent seules dès qu'un ennemi {boss:true} existe dans G.SkillAPI.enemies().
 *  Utilise UNIQUEMENT G.SkillAPI (§6) + boss {pos, mesh, pv, pvMax, def, phase}.
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  const TAU = Math.PI * 2, PI = Math.PI;
  const HALF = 14;
  const EL = { feu: 0xff7a2a, glace: 0x7fd8ff, foudre: 0xffe84a, ombre: 0x8a3cff, sacre: 0xfff2a0, poison: 0x7bd648, physique: 0xffffff };
  const S = {
    time: 0, dt: 0.016, frame: 0, fx: [], runners: [], pillars: [], zones: [], meshes: new Set(),
    lastRoll: -9, boss: null, inited: false, txtAt: {}, hooked: false, lastHit: -9, torchUntil: 0, pylons: [],
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => (G.rng && G.rng.float ? G.rng.float() : Math.random()) * ((b == null ? 1 : b) - (a == null ? 0 : a)) + (a == null ? 0 : a);
  const pick = (arr) => arr[Math.floor(rnd(0, arr.length)) % arr.length];
  const API = () => G.SkillAPI;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const ang = (f, t) => Math.atan2(t.x - f.x, t.z - f.z);
  const dirv = (a) => ({ x: Math.sin(a), z: Math.cos(a) });
  const angDiff = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
  function P() { const a = API(); return a && a.player ? a.player() : null; }
  function ppos() { const p = P(); return p && p.pos ? p.pos : { x: 0, y: 0, z: 0 }; }
  const hd = (x, z, x2, z2) => Math.hypot(x - x2, z - z2);
  function distSeg(px, pz, ox, oz, ex, ez) {
    const dx = ex - ox, dz = ez - oz, l2 = dx * dx + dz * dz || 1e-6;
    const t = clamp(((px - ox) * dx + (pz - oz) * dz) / l2, 0, 1);
    return hd(px, pz, ox + dx * t, oz + dz * t);
  }

  // ------------------------------------------------------------------ phases / dégâts
  function phaseOf(boss) {
    const ph = boss && boss.def && boss.def.phases;
    if (!ph || !ph.length) return { n: 1, speedMult: 1, dmgMult: 1, cdMult: 1, attacks: [] };
    const f = boss.pvMax > 0 ? boss.pv / boss.pvMax : 1;
    let idx = 0;
    for (let i = 0; i < ph.length; i++) if (f <= ph[i].at + 1e-9) idx = i;
    return Object.assign({}, ph[idx], { n: idx + 1, count: ph.length });
  }
  function resolvePhase(boss, phase) {
    if (phase && typeof phase === 'object' && phase.n) return phase;
    const cur = phaseOf(boss);
    if (typeof phase === 'number') { const ph = boss.def && boss.def.phases && boss.def.phases[Math.max(0, phase - (phase >= 1 ? 1 : 0))]; if (ph) return Object.assign({}, ph, { n: ph.n || phase }); }
    return cur;
  }
  const spd = (ph) => clamp((ph && ph.speedMult) || 1, 0.6, 2);
  function D(boss, k, ph) { return Math.max(1, Math.round((boss.dmg || 10) * (k == null ? 1 : k) * (boss.dmgMult || 1) * ((ph && ph.dmgMult) || 1))); }
  function hurt(boss, amount, element, ph) {
    const a = API(); if (!a || !a.damagePlayer) return;
    const ok = a.damagePlayer(amount, { element: element || (boss.def && boss.def.element) || 'physique', source: boss });
    const st = boss.__ba; if (st && st.vamp && ok !== false) heal(boss, st.vamp);
  }
  const elCol = (boss) => EL[(boss.def && boss.def.element) || 'physique'] || 0xff5030;

  // ------------------------------------------------------------------ état par boss
  function state(boss) {
    if (!boss.__ba) boss.__ba = { boss, mods: [], shield: null, shieldOn: false, staggerUntil: 0, frontal: 0, hidden: false, riposte: false, weakEl: null, lightFn: null, adds: [], phase: 1, started: false, baseSpeed: boss.speed, anim: { windup: 0, attack: 0 }, aura: null, lastPos: null, extraDmg: 1 };
    return boss.__ba;
  }

  // ------------------------------------------------------------------ utilitaires visuels
  let SH = null;
  function shared() {
    if (SH) return SH;
    SH = { disc: new THREE.CircleGeometry(1, 36), rim: new THREE.RingGeometry(0.9, 1, 40), box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 10, 8), cone: new THREE.ConeGeometry(1, 1, 8, 1, true) };
    return SH;
  }
  function addMesh(m) { const sc = G.core && G.core.scene; if (sc) sc.add(m); S.meshes.add(m); return m; }
  function disposeObj(o) {
    if (!o) return;
    if (o.parent) o.parent.remove(o);
    S.meshes.delete(o);
    o.traverse && o.traverse(c => { if (c.material && !c.userData.shared) { (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m && m.dispose && !(m.userData && m.userData.shared) && m.dispose()); } if (c.geometry && c.userData.ownGeo) c.geometry.dispose(); });
  }
  function basicMat(color, op, add) {
    const p = { color, transparent: true, opacity: op == null ? 1 : op, depthWrite: false, side: THREE.DoubleSide };
    if (add) p.blending = THREE.AdditiveBlending;
    return new THREE.MeshBasicMaterial(p);
  }
  function tele(kind, size, x, z, rotY) {
    if (!G.GFX || !G.GFX.makeTelegraph) return null;
    const m = G.GFX.makeTelegraph(kind, size);
    m.position.set(x, 0.05, z); m.rotation.y = rotY || 0;
    return addMesh(m);
  }
  const untele = disposeObj;
  const setProg = (m, p) => { if (m && m.userData && m.userData.setProgress) m.userData.setProgress(clamp(p, 0, 1)); };
  /** disque coloré au sol (zones persistantes) */
  function disc(color, op, r, x, z, ring) {
    const g = new THREE.Group(), sh = shared();
    const d = new THREE.Mesh(sh.disc, basicMat(color, op)); d.rotation.x = -PI / 2; d.userData.shared = false;
    const rm = new THREE.Mesh(sh.rim, basicMat(color, Math.min(1, op * 2.2), true)); rm.rotation.x = -PI / 2; rm.position.y = 0.01;
    d.geometry = sh.disc; rm.geometry = sh.rim;
    g.add(d); if (ring !== false) g.add(rm);
    g.scale.setScalar(r); g.position.set(x, 0.045, z); g.renderOrder = 1;
    g.userData.disc = d; g.userData.rim = rm; g.userData.setR = (rr) => g.scale.setScalar(rr);
    return addMesh(g);
  }
  function beamMesh(color) {
    const g = new THREE.Group(), sh = shared();
    const glow = new THREE.Mesh(sh.box, basicMat(color, 0.45, true)), core = new THREE.Mesh(sh.box, basicMat(0xffffff, 0.95, true));
    g.add(glow, core); addMesh(g);
    return {
      g, set(ox, oz, a, len, w, y) {
        g.position.set(ox + Math.sin(a) * len / 2, y == null ? 1.1 : y, oz + Math.cos(a) * len / 2); g.rotation.y = a;
        glow.scale.set(w * 1.9, w * 1.9, Math.max(0.01, len)); core.scale.set(w * 0.55, w * 0.55, Math.max(0.01, len));
      },
      dispose() { disposeObj(g); },
    };
  }
  // effets sonores / particules avec repli
  function sfx(n) { const a = API(); if (a && a.sfx) a.sfx(n); else if (G.sfx && G.sfx.play) G.sfx.play(n); }
  function shake(v) { const a = API(); if (a && a.shake) a.shake(v); }
  function vfx(name, x, z, color, r) {
    const a = API(), pos = V3(x, 0.1, z);
    try {
      if (G.VFX && G.VFX[name]) { if (name === 'explosion') G.VFX.explosion(pos, r || 3, 'feu'); else if (name === 'summonCircle' || name === 'shadowRise') G.VFX[name](pos, color); else if (G.VFX.play) G.VFX.play(name, pos, { color, radius: r }); return; }
    } catch (e) { /* repli */ }
    if (G.fx) { if (G.fx.ring) G.fx.ring(pos, color || 0xffffff, r || 3, 0.5); if (G.fx.burst && name !== 'ring') G.fx.burst(V3(x, 0.6, z), color || 0xffffff, 14, { speed: 5, up: 4, life: 0.6, size: 0.2 }); }
  }
  function say(pos, txt, color, key, gap) {
    const k = key || txt;
    if (S.time - (S.txtAt[k] || -9) < (gap || 1.2)) return;
    S.txtAt[k] = S.time;
    const a = API(), p = V3(pos.x, (pos.y || 0) + 3.6, pos.z);
    if (a && a.text) a.text(p, txt, '#' + (color != null ? color : 0xffffff).toString(16).padStart(6, '0'), 1.1);
    else if (G.fx && G.fx.text) G.fx.text(p, txt, color || 0xffffff, 1.1);
  }
  function banner(txt) { if (G.UI && G.UI.toast) G.UI.toast(txt); }

  // ------------------------------------------------------------------ joueur : déplacement, étourdissement, esquive
  function shove(dx, dz) { const p = P(); if (!p || !p.pos) return; p.pos.x = clamp(p.pos.x + dx, -HALF + 0.6, HALF - 0.6); p.pos.z = clamp(p.pos.z + dz, -HALF + 0.6, HALF - 0.6); }
  function stunPlayer(sec) {
    const a = API(); if (!a) return;
    if (a.stunPlayer) { a.stunPlayer(sec); return; }
    if (a.buff) a.buff({ id: 'boss_stun', duration: sec, stats: { speedMult: 0, stun: 1 }, vfx: 'stun' });
    const p = P(); if (p) p.stunned = Math.max(p.stunned || 0, sec);
  }
  function slowPlayer(f, sec) { const a = API(); if (a && a.buff) a.buff({ id: 'boss_slow', duration: sec, stats: { speedMult: f }, vfx: null }); }
  function isRolling() { const p = P(); return !!(p && (p.invuln > 0 || p.dashing || p.rolling)) || (S.time - S.lastRoll < 0.22); }

  // ------------------------------------------------------------------ pilotes : runners (générateurs), fx, zones
  function addFx(o) { S.fx.push(o); return o; }
  function launch(id, boss, api, phase, gen) {
    const ph = resolvePhase(boss, phase);
    const h = { id, done: false, duration: 0, boss, windup: 0 };
    const st = state(boss); reveal(boss);
    S.runners.push({ it: gen(boss, api || API(), ph, h), wait: 0, h, boss });
    boss.__attack = h; st.anim.windup = 0;
    return h;
  }
  function setAnim(boss, w, a) { const st = state(boss); st.anim.windup = w; st.anim.attack = a; }
  function face(boss, a) { if (boss.mesh) boss.mesh.rotation.y = a; }
  function clampBoss(boss) { const r = boss.r || 1.5; boss.pos.x = clamp(boss.pos.x, -HALF + r * 0.5, HALF - r * 0.5); boss.pos.z = clamp(boss.pos.z, -HALF + r * 0.5, HALF - r * 0.5); }

  /** frappe au sol télégraphiée */
  function strikeCircle(boss, x, z, r, delay, dmg, el, o) {
    o = o || {};
    const m = tele('circle', r, x, z);
    let t = -(o.delay || 0), meteor = null;
    if (o.fall) { meteor = new THREE.Mesh(shared().sph, basicMat(EL[el] || 0xff7a2a, 0.95, true)); meteor.scale.setScalar(Math.max(0.5, r * 0.35)); addMesh(meteor); meteor.position.set(x, 16, z); }
    if (m) m.visible = !(o.delay > 0);
    return addFx({
      boss, update(dt) {
        t += dt; if (t < 0) return false;
        if (m) { m.visible = true; setProg(m, t / delay); }
        if (meteor) { const k = clamp(t / delay, 0, 1); meteor.position.y = lerp(16, 0.5, k * k); meteor.scale.setScalar(Math.max(0.5, r * 0.35) * (0.8 + 0.4 * k)); }
        if (t >= delay) {
          const pp = ppos();
          if (hd(pp.x, pp.z, x, z) <= r + 0.35) hurt(boss, dmg, el);
          if (o.onHit) o.onHit(x, z);
          vfx(o.vfx || 'explosion', x, z, EL[el] || 0xff7a2a, r); sfx(o.sound || 'slam'); shake(o.shake == null ? 0.25 : o.shake);
          return true;
        }
        return false;
      }, dispose() { untele(m); disposeObj(meteor); },
    });
  }
  /** frappe en ligne (bande) */
  function strikeLine(boss, x, z, a, len, w, delay, dmg, el, o) {
    o = o || {};
    const m = tele('line', { length: len, width: w }, x, z, a);
    let t = -(o.delay || 0);
    if (m) m.visible = !(o.delay > 0);
    const ex = x + Math.sin(a) * len, ez = z + Math.cos(a) * len;
    return addFx({
      boss, update(dt) {
        t += dt; if (t < 0) return false;
        if (m) { m.visible = true; setProg(m, t / delay); }
        if (t >= delay) {
          const pp = ppos();
          if (distSeg(pp.x, pp.z, x, z, ex, ez) <= w / 2 + 0.35) hurt(boss, dmg, el);
          const n = Math.max(1, Math.floor(len / 5));
          for (let i = 0; i <= n; i++) vfx('ring', x + (ex - x) * i / n, z + (ez - z) * i / n, EL[el] || 0xff5030, 1.5);
          sfx(o.sound || 'slam'); shake(0.15);
          return true;
        }
        return false;
      }, dispose() { untele(m); },
    });
  }
  /** zone persistante : kind 'dark'|'poison'|'web'|'lava'  */
  function zone(boss, x, z, r, dur, o) {
    const col = o.color != null ? o.color : 0x7a2cff;
    const mesh = disc(col, o.op || 0.35, r, x, z);
    const zn = { boss, x, z, r, until: S.time + dur, dps: o.dps || 0, slow: o.slow || 0, el: o.el || 'ombre', kind: o.kind || 'dark', tick: 0, mesh, vx: o.vx || 0, vz: o.vz || 0, ph: o.ph };
    S.zones.push(zn);
    return zn;
  }
  function inZone(zn) { const pp = ppos(); return hd(pp.x, pp.z, zn.x, zn.z) <= zn.r; }
  function updateZones(dt) {
    for (let i = S.zones.length - 1; i >= 0; i--) {
      const z = S.zones[i];
      if (S.time >= z.until || (z.boss && z.boss.dead)) { disposeObj(z.mesh); S.zones.splice(i, 1); continue; }
      if (z.vx || z.vz) { z.x = clamp(z.x + z.vx * dt, -HALF + 1, HALF - 1); z.z = clamp(z.z + z.vz * dt, -HALF + 1, HALF - 1); z.mesh.position.x = z.x; z.mesh.position.z = z.z; }
      const left = z.until - S.time; z.mesh.userData.disc.material.opacity = Math.min(0.4, 0.15 + left * 0.1) * (z.kind === 'web' ? 1.3 : 1);
      z.tick -= dt;
      if (inZone(z)) {
        if (z.slow) { slowPlayer(1 - z.slow, 0.4); }
        if (z.dps && z.tick <= 0) { z.tick = 0.5; hurt(z.boss, Math.max(1, Math.round(D(z.boss, z.dps) * 0.5)), z.el); }
      }
      if (z.tick <= 0) z.tick = 0.5;
    }
  }

  // ------------------------------------------------------------------ piliers (couverture) et lignes de vue
  const PILLAR_R = 1.0;
  function makePillarMesh(color) {
    const g = new THREE.Group(), T = THREE;
    const mk = (geo, c, x, y, z, sx, sy, sz, glow) => { const m = new T.Mesh(geo, G.GFX && G.GFX.toon ? G.GFX.toon(c, glow ? { emissive: c, emissiveIntensity: 1.2 } : undefined) : new T.MeshLambertMaterial({ color: c })); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
    mk(new T.CylinderGeometry(1, 1.15, 1, 10), 0x6a707c, 0, 1.8, 0, 0.95, 3.6, 0.95).userData.ownGeo = true;
    mk(new T.CylinderGeometry(1.2, 1.2, 1, 10), 0x4a4f5a, 0, 0.2, 0, 1, 0.4, 1).userData.ownGeo = true;
    mk(new T.CylinderGeometry(1.2, 1.2, 1, 10), 0x4a4f5a, 0, 3.7, 0, 1, 0.3, 1).userData.ownGeo = true;
    mk(new T.OctahedronGeometry(1), color, 0, 4.4, 0, 0.4, 0.6, 0.4, true).userData.ownGeo = true;
    if (G.GFX && G.GFX.addOutline) G.GFX.addOutline(g, 0.04);
    return g;
  }
  function addPillar(boss, x, z, life) {
    const mesh = addMesh(makePillarMesh(elCol(boss)));
    mesh.position.set(x, 0, z); mesh.scale.y = 0.05;
    const pl = { x, z, r: PILLAR_R, mesh, born: S.time, until: S.time + (life || 22), integrity: 1, boss };
    S.pillars.push(pl);
    vfx('explosion', x, z, 0xcfd6e2, 2);
    return pl;
  }
  function removePillar(pl, quiet) {
    const i = S.pillars.indexOf(pl); if (i < 0) return;
    S.pillars.splice(i, 1); disposeObj(pl.mesh);
    if (!quiet) { vfx('explosion', pl.x, pl.z, 0xcfd6e2, 2.5); sfx('boom'); }
  }
  function updatePillars(dt) {
    const p = P();
    for (let i = S.pillars.length - 1; i >= 0; i--) {
      const pl = S.pillars[i];
      pl.mesh.scale.y = Math.min(1, pl.mesh.scale.y + dt * 3);
      if (S.time >= pl.until || pl.integrity <= 0 || (pl.boss && pl.boss.dead)) { removePillar(pl); continue; }
      if (p && p.pos && !p.dead) { // collision joueur
        const dx = p.pos.x - pl.x, dz = p.pos.z - pl.z, d = Math.hypot(dx, dz), min = pl.r + 0.55;
        if (d < min && pl.mesh.scale.y > 0.5) { const k = (min - d) / (d || 1); p.pos.x += dx * k; p.pos.z += dz * k; }
      }
    }
  }
  /** longueur de rayon tronquée par le premier pilier (et marque le pilier touché) */
  function rayCut(ox, oz, a, len, dt) {
    const dx = Math.sin(a), dz = Math.cos(a); let best = len, hit = null;
    for (const pl of S.pillars) {
      if (pl.mesh.scale.y < 0.5) continue;
      const fx = ox - pl.x, fz = oz - pl.z, b = fx * dx + fz * dz, c = fx * fx + fz * fz - pl.r * pl.r, disc2 = b * b - c;
      if (disc2 < 0) continue;
      const t = -b - Math.sqrt(disc2);
      if (t > 0 && t < best) { best = t; hit = pl; }
    }
    if (hit && dt) hit.integrity -= dt * 0.4;
    return best;
  }
  /** vrai si un pilier se trouve entre (ax,az) et (bx,bz) */
  function losBlocked(ax, az, bx, bz) {
    for (const pl of S.pillars) { if (pl.mesh.scale.y < 0.5) continue; if (distSeg(pl.x, pl.z, ax, az, bx, bz) < pl.r + 0.25) { const t = hd(ax, az, pl.x, pl.z); if (t < hd(ax, az, bx, bz)) return pl; } }
    return null;
  }

  // ------------------------------------------------------------------ adds (cristaux, ossuaires…)
  function spawnAdd(boss, kind, x, z, o) {
    const a = API(); if (!a || !a.spawnEnemy) return null;
    const before = new Set(a.enemies ? a.enemies() : []);
    let e = null;
    try { e = a.spawnEnemy(kind, V3(x, 0, z), {}); } catch (err) { e = null; }
    if ((!e || !e.pos) && a.enemies) e = a.enemies().find(q => !before.has(q)) || null;
    if (!e || !e.pos) return null;
    e.pos.x = x; e.pos.z = z;
    e.__add = Object.assign({ kind, boss, born: S.time, seen: false }, o || {});
    e.fromBoss = true;
    if (o && o.hp) { e.pv = o.hp; e.pvMax = o.hp; }
    if (o && o.color != null && e.mesh && e.mesh.userData && e.mesh.userData.runeMats) e.mesh.userData.runeMats.forEach(m => { m.color.setHex(o.color); if (m.emissive) m.emissive.setHex(o.color); });
    S.fx.push({ boss, add: e, update() { return !!e.dead || !!(boss && boss.dead); }, dispose() { if (boss && boss.dead && !e.dead) killAdd(e); } });
    vfx('summonCircle', x, z, o && o.color != null ? o.color : 0x9a6aff, 1.6);
    return e;
  }
  function killAdd(e) {
    if (!e || e.dead) return;
    const a = API();
    if (a && a.damage) { try { a.damage(e, (e.pvMax || 1) * 50 + 999, { canCrit: false, source: 'boss', tags: ['boss_add_cleanup'] }); } catch (er) { /* ignore */ } }
    if (!e.dead) { e.pv = 0; }
  }
  // soins des boss PLAFONNÉS : jamais plus de 0,25 % de PV max par seconde (0,1 % s'il vient d'être touché),
  // sinon certains boss (canaux, racines, chandeliers…) se soignaient plus vite que les dégâts des joueurs → invincibles
  function heal(boss, frac) {
    if (!(frac > 0) || !boss || boss.dead) return;
    const st = state(boss), now = S.time;
    if (!st.healWin || now - st.healWin.t0 >= 1) st.healWin = { t0: now, used: 0 };
    const cap = (now - (st.lastHit || -99) < 2.5 ? 0.001 : 0.0025) - st.healWin.used;
    const f = Math.min(frac, Math.max(0, cap)); if (f <= 0) return;
    st.healWin.used += f;
    boss.pv = Math.min(boss.pvMax, boss.pv + boss.pvMax * f);
  }
  function stagger(boss, sec, quiet) {
    const st = state(boss);
    st.staggerUntil = S.time + sec;
    boss.staggered = true; boss.cd = Math.max(boss.cd || 0, sec);
    if (!quiet) { say(boss.pos, 'ÉTOURDI !', 0xffe04a, 'stag', 1); vfx('ring', boss.pos.x, boss.pos.z, 0xffe04a, 4); sfx('slam'); shake(0.4); }
  }
  function reveal(boss) { const st = boss.__ba; if (st && st.hidden) setHidden(boss, false); }
  function setHidden(boss, on) {
    const st = state(boss); if (st.hidden === on) return; st.hidden = on;
    if (!boss.mesh) return;
    boss.mesh.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.isOutline) { o.visible = !on; return; }
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m) return; if (m.__op == null) m.__op = m.opacity; m.transparent = on || m.__op < 1; m.opacity = on ? 0.1 : m.__op; });
    });
    if (!on) say(boss.pos, 'Dévoilé !', 0xffffff, 'rev');
  }
  function setAura(boss, color, r) {
    const st = state(boss);
    if (!color) { if (st.aura) { disposeObj(st.aura); st.aura = null; } return; }
    if (!st.aura) st.aura = disc(color, 0.35, (boss.r || 1.5) + 1, boss.pos.x, boss.pos.z);
    st.aura.userData.disc.material.color.setHex(color); st.aura.userData.rim.material.color.setHex(color);
    st.aura.userData.setR(r || (boss.r || 1.5) + 1);
  }
  function setEyes(boss, color, k) {
    const eyes = boss.mesh && boss.mesh.userData && boss.mesh.userData.eyes;
    (eyes || []).forEach(m => { if (!m) return; if (m.color) m.color.setHex(color); if (m.emissive) m.emissive.setHex(color); m.emissiveIntensity = k || 2.4; });
  }

  // =====================================================================
  //  ATTAQUES
  // =====================================================================
  const REG = () => (G.BossAttacks = G.BossAttacks || (G.makeRegistry ? G.makeRegistry('BossAttacks') : { _m: {}, register(i, d) { this._m[i] = d; }, get(i) { return this._m[i]; }, has(i) { return !!this._m[i]; }, ids() { return Object.keys(this._m); } }));
  function attack(id, windup, gen, desc) {
    REG().register(id, {
      id, windup, desc: desc || '',
      execute(boss, api, phase) { return launch(id, boss, api, phase, gen); },
      update() { /* piloté par le bus 'tick' (autonome) */ },
    });
  }

  // 1. Rayon balayant — bloqué par les piliers
  attack('beam_sweep', 1.2, function* (b, api, ph, h) {
    const sp = spd(ph), p0 = ppos(), base = ang(b.pos, p0), sgn = rnd() < 0.5 ? -1 : 1, a0 = base - sgn * 1.05, a1 = base + sgn * 1.05;
    const col = elCol(b), W = 1.3 / sp;
    const tl = tele('line', { length: 22, width: 1.4 }, b.pos.x, b.pos.z, a0), beam = beamMesh(col);
    try {
      let t = 0; face(b, a0);
      while (t < W) { t += S.dt; setAnim(b, t / W, 0); if (tl) { tl.position.set(b.pos.x, 0.05, b.pos.z); setProg(tl, t / W); } yield 0; }
      untele(tl); sfx('fire');
      const dur = 2.1 / sp; let el = 0, hit = 0;
      while (el < dur) {
        el += S.dt; const a = lerp(a0, a1, el / dur); face(b, a); setAnim(b, 0, 1);
        const len = rayCut(b.pos.x, b.pos.z, a, 22, S.dt); beam.set(b.pos.x, b.pos.z, a, len, 1.2);
        hit -= S.dt; const pp = ppos();
        if (hit <= 0 && distSeg(pp.x, pp.z, b.pos.x, b.pos.z, b.pos.x + Math.sin(a) * len, b.pos.z + Math.cos(a) * len) < 1.0) { hurt(b, D(b, 0.75, ph)); hit = 0.4; }
        yield 0;
      }
    } finally { untele(tl); beam.dispose(); setAnim(b, 0, 0); }
    yield 0.5 / sp;
  }, 'Rayon balayant (se mettre à couvert derrière un pilier)');

  // 2. Laser tournant
  attack('laser_spin', 1.1, function* (b, api, ph, h) {
    const sp = spd(ph), n = ph.n >= 3 ? 3 : 2, col = elCol(b), W = 1.1 / sp;
    const tls = [], beams = [];
    for (let i = 0; i < n; i++) { tls.push(tele('line', { length: 20, width: 0.8 }, b.pos.x, b.pos.z, i / n * TAU)); beams.push(beamMesh(col)); }
    const spin = (rnd() < 0.5 ? -1 : 1) * 0.85 * sp;
    try {
      let t = 0, a0 = rnd(0, TAU);
      while (t < W) { t += S.dt; setAnim(b, t / W, 0); tls.forEach((m, i) => { if (m) { m.position.set(b.pos.x, 0.05, b.pos.z); m.rotation.y = a0 + i / n * TAU; setProg(m, t / W); } }); yield 0; }
      tls.forEach(untele); sfx('fire');
      const dur = 3.4 / sp; let el = 0, hit = 0;
      while (el < dur) {
        el += S.dt; hit -= S.dt;
        const pp = ppos();
        for (let i = 0; i < n; i++) {
          const a = a0 + el * spin + i / n * TAU, len = rayCut(b.pos.x, b.pos.z, a, 20, S.dt);
          beams[i].set(b.pos.x, b.pos.z, a, len, 0.9);
          if (hit <= 0 && distSeg(pp.x, pp.z, b.pos.x, b.pos.z, b.pos.x + Math.sin(a) * len, b.pos.z + Math.cos(a) * len) < 0.8) { hurt(b, D(b, 0.7, ph)); hit = 0.4; }
        }
        setAnim(b, 0, 1); b.mesh.rotation.y += S.dt * 2; yield 0;
      }
    } finally { tls.forEach(untele); beams.forEach(x => x.dispose()); setAnim(b, 0, 0); }
    yield 0.6 / sp;
  }, 'Laser tournant (passer dans les intervalles ou rouler)');

  // 3. Pluie de météores
  attack('meteor_rain', 0.8, function* (b, api, ph, h) {
    const sp = spd(ph), n = 6 + ph.n * 2;
    const el = (b.def && b.def.element) || 'feu';
    for (let t = 0; t < 0.8 / sp;) { t += S.dt; setAnim(b, t, 0); yield 0; }
    for (let i = 0; i < n; i++) {
      const pp = ppos(), ox = i % 3 === 0 ? 0 : rnd(-5, 5), oz = i % 3 === 0 ? 0 : rnd(-5, 5);
      strikeCircle(b, clamp(pp.x + ox, -HALF + 1.5, HALF - 1.5), clamp(pp.z + oz, -HALF + 1.5, HALF - 1.5), 2.1, 1.25 / Math.sqrt(sp), D(b, 1.1, ph), el, { fall: true, sound: 'boom' });
      yield 0.38 / sp;
    }
    setAnim(b, 0, 1); yield 1.5;
  }, 'Pluie de météores');

  // 4. Reflets (dédoublement)
  function echoAgent(boss, e, x, z, ph, life) {
    S.runners.push({ boss, h: { done: false }, wait: 0, it: (function* () {
      try {
        for (let i = 0; i < 2; i++) {
          yield 1.2 + rnd(0, 0.8);
          if (e && e.dead) return; if (boss.dead) return;
          const cx = e && e.pos ? e.pos.x : x, cz = e && e.pos ? e.pos.z : z, pp = ppos();
          strikeLine(boss, cx, cz, ang({ x: cx, z: cz }, pp), 20, 2.0, 1.0, D(boss, 0.9, ph), (boss.def && boss.def.element) || 'ombre');
          yield 1.2;
        }
        yield 1.0;
      } finally { if (e) killAdd(e); }
    })() });
  }
  function spawnEchoes(boss, n, ph) {
    const pp = ppos(), a0 = rnd(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU, x = clamp(pp.x + Math.sin(a) * 8, -HALF + 2, HALF - 2), z = clamp(pp.z + Math.cos(a) * 8, -HALF + 2, HALF - 2);
      const e = spawnAdd(boss, 'boss_echo', x, z, { hp: 1, echo: true });
      if (e && e.mesh) e.mesh.rotation.y = ang({ x, z }, pp);
      echoAgent(boss, e, x, z, ph);
    }
  }
  attack('clones', 1.0, function* (b, api, ph, h) {
    const n = ph.n >= 3 ? 3 : 2;
    for (let t = 0; t < 1.0 / spd(ph);) { t += S.dt; setAnim(b, t, 0); yield 0; }
    spawnEchoes(b, n, ph); sfx('spawn'); vfx('shadowRise', b.pos.x, b.pos.z, 0x8a6aff, 3); setAnim(b, 0, 1);
    say(b.pos, 'Reflets !', 0xb48cff, 'clones');
    yield 1.4;
  }, 'Dédoublement : reflets qui frappent en ligne');

  // 5. Bouclier de cristaux (réutilise le module de bouclier)
  attack('crystal_shield', 1.0, function* (b, api, ph, h) {
    for (let t = 0; t < 1.0 / spd(ph);) { t += S.dt; setAnim(b, t, 0); yield 0; }
    const st = state(b);
    if (!st.shield || !st.shieldOn) shieldStart(b, ph.n >= 3 ? 4 : 3, { hp: 0.03, orbit: 1.4, stagger: 5 });
    setAnim(b, 0, 1); yield 0.8;
  }, 'Bouclier de cristaux à briser');

  // 6. Zones de ténèbres
  attack('dark_zone', 0.9, function* (b, api, ph, h) {
    const n = 2 + ph.n, pp = ppos();
    for (let t = 0; t < 0.9 / spd(ph);) { t += S.dt; setAnim(b, t, 0); yield 0; }
    for (let i = 0; i < n; i++) {
      const x = clamp(i === 0 ? pp.x : rnd(-HALF + 3, HALF - 3), -HALF + 2, HALF - 2), z = clamp(i === 0 ? pp.z : rnd(-HALF + 3, HALF - 3), -HALF + 2, HALF - 2);
      strikeCircle(b, x, z, 3.2, 1.1, D(b, 0.8, ph), 'ombre', { onHit: (xx, zz) => zone(b, xx, zz, 3.2, 9, { kind: 'dark', dps: 0.45, el: 'ombre', color: 0x5a1aa8, vx: ph.n >= 2 ? rnd(-0.6, 0.6) : 0, vz: ph.n >= 2 ? rnd(-0.6, 0.6) : 0 }) });
    }
    setAnim(b, 0, 1); yield 1.8;
  }, 'Zones de ténèbres persistantes');

  // 7. Sauts écrasants en chaîne
  attack('leap_chain', 0.7, function* (b, api, ph, h) {
    const sp = spd(ph), n = ph.n >= 3 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const pp = ppos(), tx = clamp(pp.x, -HALF + 2, HALF - 2), tz = clamp(pp.z, -HALF + 2, HALF - 2);
      const crouch = (i === 0 ? 0.7 : 0.45) / sp, air = 0.6 / sp;
      strikeCircle(b, tx, tz, 3.2, crouch + air, D(b, 1.4, ph), (b.def && b.def.element) || 'physique', { sound: 'slam', shake: 0.4 });
      face(b, ang(b.pos, { x: tx, z: tz }));
      for (let t = 0; t < crouch;) { t += S.dt; setAnim(b, t / crouch, 0); yield 0; }
      const sx = b.pos.x, sz = b.pos.z; let t2 = 0;
      while (t2 < air) { t2 += S.dt; const k = clamp(t2 / air, 0, 1); b.pos.x = lerp(sx, tx, k); b.pos.z = lerp(sz, tz, k); b.pos.y = Math.sin(k * PI) * 4.5; setAnim(b, 0, 1); yield 0; }
      b.pos.y = 0; clampBoss(b); yield 0.25 / sp;
    }
    stagger(b, 1.2, true); yield 1.2;
  }, 'Sauts écrasants en chaîne (fenêtre de contre-attaque à la fin)');

  // 8. Grille de lames
  attack('blade_grid', 1.0, function* (b, api, ph, h) {
    const sp = spd(ph), el = (b.def && b.def.element) || 'physique';
    for (let t = 0; t < 0.9 / sp;) { t += S.dt; setAnim(b, t, 0); yield 0; }
    const off = rnd(-1.5, 1.5);
    for (const z of [-9, -3, 3, 9]) strikeLine(b, -15, z + off, PI / 2, 30, 1.7, 1.3 / sp, D(b, 1.0, ph), el, { sound: 'hit' });
    setAnim(b, 0, 1); yield 1.7 / sp;
    for (const x of [-9, -3, 3, 9]) strikeLine(b, x - off, -15, 0, 30, 1.7, 1.2 / sp, D(b, 1.0, ph), el, { sound: 'hit' });
    yield 1.8 / sp;
    if (ph.n >= 3) { strikeLine(b, -15, -6 - off, PI / 2, 30, 1.7, 1.0, D(b, 1.0, ph), el); strikeLine(b, -15, 6 + off, PI / 2, 30, 1.7, 1.0, D(b, 1.0, ph), el); yield 1.4; }
    yield 0.4;
  }, 'Grille de lames : se placer entre les bandes');

  // 9. Tornade
  attack('tornado', 0.8, function* (b, api, ph, h) {
    const sp = spd(ph), n = ph.n >= 3 ? 2 : 1, col = EL[(b.def && b.def.element)] || 0xcfe8ff;
    for (let t = 0; t < 0.8 / sp;) { t += S.dt; setAnim(b, t, 0); yield 0; }
    const tors = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rnd(0, 1), x = clamp(b.pos.x + Math.sin(a) * 4, -HALF + 2, HALF - 2), z = clamp(b.pos.z + Math.cos(a) * 4, -HALF + 2, HALF - 2);
      const g = new THREE.Group(); const sh = shared();
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(sh.cone, basicMat(col, 0.35, true)); c.scale.set(0.7 + k * 0.5, 1.2, 0.7 + k * 0.5); c.position.y = 0.6 + k * 1.1; c.rotation.x = PI; g.add(c); }
      g.position.set(x, 0, z); addMesh(g); tors.push({ g, x, z, hit: 0 });
    }
    sfx('fire'); setAnim(b, 0, 1);
    try {
      const dur = 6.5 / Math.sqrt(sp); let el = 0;
      while (el < dur) {
        el += S.dt; const pp = ppos();
        for (const t of tors) {
          const dx = pp.x - t.x, dz = pp.z - t.z, d = Math.hypot(dx, dz) || 1, v = 3.0 * sp;
          t.x = clamp(t.x + dx / d * v * S.dt, -HALF + 1, HALF - 1); t.z = clamp(t.z + dz / d * v * S.dt, -HALF + 1, HALF - 1);
          t.g.position.set(t.x, 0, t.z); t.g.rotation.y += S.dt * 9; t.hit -= S.dt;
          if (d < 2.0) { shove(-dx / d * -1.2 * S.dt, -dz / d * -1.2 * S.dt); if (t.hit <= 0) { hurt(b, D(b, 0.6, ph), (b.def && b.def.element) || 'physique'); t.hit = 0.5; } }
        }
        yield 0;
      }
    } finally { tors.forEach(t => disposeObj(t.g)); }
    yield 0.5;
  }, 'Tornade chasseuse (la distancer ou rouler à travers)');

  // 10. Mur de feu qui avance avec un trou
  attack('fire_wall', 1.0, function* (b, api, ph, h) {
    const sp = spd(ph), el = (b.def && b.def.element) === 'glace' ? 'glace' : 'feu', col = EL[el];
    const walls = ph.n >= 3 ? 2 : 1;
    for (let w = 0; w < walls; w++) {
      const axisZ = w === 0 ? rnd() < 0.5 : !(h.axis); h.axis = axisZ;
      const fwd = rnd() < 0.5 ? 1 : -1, gap = rnd(-7, 7), gw = 5.2;
      const start = -fwd * (HALF - 0.5);
      // télégraphe : deux segments
      const segs = [[-HALF, gap - gw / 2], [gap + gw / 2, HALF]];
      const tls = segs.map(([a, c]) => axisZ ? tele('line', { length: c - a, width: 1.4 }, a, start, PI / 2) : tele('line', { length: c - a, width: 1.4 }, start, a, 0));
      const meshes = segs.map(() => { const m = new THREE.Mesh(shared().box, basicMat(col, 0.75, true)); addMesh(m); m.visible = false; return m; });
      try {
        for (let t = 0; t < 1.2 / sp;) { t += S.dt; setAnim(b, t, 0); tls.forEach(m => setProg(m, t / (1.2 / sp))); yield 0; }
        tls.forEach(untele); setAnim(b, 0, 1); sfx('fire');
        let pos = start, hit = 0; const v = 3.8 * sp;
        while ((fwd > 0 && pos < HALF) || (fwd < 0 && pos > -HALF)) {
          pos += fwd * v * S.dt; hit -= S.dt; const pp = ppos();
          segs.forEach(([a, c], i) => {
            const m = meshes[i]; m.visible = true; const len = c - a;
            if (axisZ) { m.position.set((a + c) / 2, 0.9, pos); m.scale.set(len, 1.8, 1.0); } else { m.position.set(pos, 0.9, (a + c) / 2); m.scale.set(1.0, 1.8, len); }
            const px = axisZ ? pp.x : pp.z, pq = axisZ ? pp.z : pp.x;
            if (hit <= 0 && px >= a - 0.2 && px <= c + 0.2 && Math.abs(pq - pos) < 0.9) { hurt(b, D(b, 1.3, ph), el); hit = 0.6; }
          });
          yield 0;
        }
      } finally { tls.forEach(untele); meshes.forEach(disposeObj); }
      yield 0.5;
    }
    setAnim(b, 0, 0); yield 0.4;
  }, 'Mur de feu avec un trou');

  // 11. Chaînes qui attirent
  attack('chain_pull', 0.9, function* (b, api, ph, h) {
    const sp = spd(ph), pp = ppos(), a = ang(b.pos, pp), len = hd(pp.x, pp.z, b.pos.x, b.pos.z) + 3;
    const tl = tele('line', { length: Math.min(24, len), width: 1.2 }, b.pos.x, b.pos.z, a), chain = beamMesh(0x9aa0b0);
    let caught = false;
    try {
      face(b, a); let t = 0; const W = 0.95 / sp;
      while (t < W) { t += S.dt; setAnim(b, t / W, 0); setProg(tl, t / W); yield 0; }
      untele(tl);
      const q = ppos(), segLen = Math.min(24, len);
      chain.set(b.pos.x, b.pos.z, a, segLen, 0.18, 1.3); sfx('dash');
      if (distSeg(q.x, q.z, b.pos.x, b.pos.z, b.pos.x + Math.sin(a) * segLen, b.pos.z + Math.cos(a) * segLen) < 1.1) caught = true;
      setAnim(b, 0, 1);
      if (caught) {
        say(q, 'ENCHAÎNÉ !', 0xcfd6e2, 'chain');
        strikeCircle(b, b.pos.x, b.pos.z, 3.8, 1.0, D(b, 1.8, ph), (b.def && b.def.element) || 'physique', { sound: 'slam', shake: 0.45 });
        let el = 0;
        while (el < 0.6) { el += S.dt; const p2 = ppos(), d = hd(p2.x, p2.z, b.pos.x, b.pos.z); if (d > (b.r || 1.5) + 1.2) { const k = Math.min(d - (b.r || 1.5) - 1.2, 14 * S.dt) / d; shove((b.pos.x - p2.x) * k, (b.pos.z - p2.z) * k); } const a2 = ang(b.pos, p2); chain.set(b.pos.x, b.pos.z, a2, hd(p2.x, p2.z, b.pos.x, b.pos.z), 0.18, 1.3); yield 0; }
        yield 0.5;
      } else yield 0.5;
    } finally { untele(tl); chain.dispose(); }
    yield 0.7;
  }, "Chaînes : esquiver latéralement, sinon attiré puis écrasé");

  // 12. Ruée en zigzag
  attack('zigzag_rush', 0.9, function* (b, api, ph, h) {
    const sp = spd(ph), segs = ph.n >= 3 ? 5 : 4;
    for (let i = 0; i < segs; i++) {
      const pp = ppos(), a = ang(b.pos, pp) + (i % 2 ? 1 : -1) * 0.55, len = 9;
      const tl = tele('line', { length: len, width: 2.2 }, b.pos.x, b.pos.z, a);
      try {
        face(b, a); const W = (i === 0 ? 0.85 : 0.5) / sp; let t = 0;
        while (t < W) { t += S.dt; setAnim(b, t / W, 0); tl.position.set(b.pos.x, 0.05, b.pos.z); setProg(tl, t / W); yield 0; }
      } finally { untele(tl); }
      let d = 0, hitDone = false; const v = 20 * sp; sfx('dash');
      while (d < len) {
        const step = v * S.dt; d += step; b.pos.x += Math.sin(a) * step; b.pos.z += Math.cos(a) * step; clampBoss(b);
        const pp2 = ppos();
        if (!hitDone && hd(pp2.x, pp2.z, b.pos.x, b.pos.z) < (b.r || 1.5) + 0.7) { hitDone = true; hurt(b, D(b, 1.3, ph)); shove(Math.sin(a + PI / 2) * 1.2, Math.cos(a + PI / 2) * 1.2); shake(0.3); }
        vfx('ring', b.pos.x, b.pos.z, 0xd8d0c0, 0.8); setAnim(b, 0, 1); yield 0;
      }
    }
    stagger(b, 1.1, true); yield 1.1;
  }, 'Ruée en zigzag (rouler perpendiculairement)');

  // 13. Invocation de piliers
  attack('pillar_summon', 1.0, function* (b, api, ph, h) {
    const sp = spd(ph), n = 4, pp = ppos();
    for (let t = 0; t < 1.0 / sp;) { t += S.dt; setAnim(b, t, 0); yield 0; }
    const placed = [];
    for (let i = 0; i < n * 4 && placed.length < n; i++) {
      const x = rnd(-9, 9), z = rnd(-9, 9);
      if (hd(x, z, pp.x, pp.z) < 3 || hd(x, z, b.pos.x, b.pos.z) < 4 || placed.some(q => hd(q[0], q[1], x, z) < 5)) continue;
      placed.push([x, z]);
      strikeCircle(b, x, z, 1.6, 1.0, D(b, 0.8, ph), (b.def && b.def.element) || 'physique', { onHit: (xx, zz) => addPillar(b, xx, zz, 24), vfx: 'ring' });
    }
    S.pillars.filter(p => p.boss === b).sort((p, q) => p.born - q.born).slice(0, Math.max(0, S.pillars.filter(p => p.boss === b).length + placed.length - 6)).forEach(p => removePillar(p, true));
    setAnim(b, 0, 1); yield 1.6;
  }, 'Piliers de couverture (bloquent rayons et blizzard)');

  // 14. Onde inversée (aspire puis explose)
  attack('inverse_wave', 1.0, function* (b, api, ph, h) {
    const sp = spd(ph), R = 6.0, pull = 2.0 / Math.sqrt(sp);
    const vort = disc(0x9a5cff, 0.25, R, b.pos.x, b.pos.z), tl = tele('circle', R, b.pos.x, b.pos.z);
    try {
      for (let t = 0; t < 0.9 / sp;) { t += S.dt; setAnim(b, t, 0); vort.position.set(b.pos.x, 0.045, b.pos.z); yield 0; }
      sfx('spawn'); let el = 0;
      while (el < pull) {
        el += S.dt; const pp = ppos(), d = hd(pp.x, pp.z, b.pos.x, b.pos.z);
        setProg(tl, el / pull); tl.position.set(b.pos.x, 0.05, b.pos.z); vort.position.set(b.pos.x, 0.045, b.pos.z); vort.rotation.y += S.dt * 5; vort.userData.setR(R * (1.15 - 0.3 * el / pull));
        if (d < 16 && d > (b.r || 1.5)) { const k = Math.min(d - (b.r || 1.5), (3.8 + 3.2 * el / pull) * sp * S.dt) / d; shove((b.pos.x - pp.x) * k, (b.pos.z - pp.z) * k); }
        setAnim(b, 0, 1); yield 0;
      }
      const pp = ppos();
      if (hd(pp.x, pp.z, b.pos.x, b.pos.z) <= R + 0.35) hurt(b, D(b, 2.0, ph));
      vfx('explosion', b.pos.x, b.pos.z, 0x9a5cff, R); sfx('boom'); shake(0.6);
    } finally { untele(tl); disposeObj(vort); }
    stagger(b, 1.0, true); yield 1.0;
  }, "Onde inversée : s'éloigner du boss avant l'explosion");

  // 15. Cri qui étourdit (parade par roulade)
  attack('stun_roar', 1.4, function* (b, api, ph, h) {
    const sp = spd(ph), R = 9, W = 1.5 / sp, tl = tele('ring', R, b.pos.x, b.pos.z);
    let t = 0;
    try {
      while (t < W) { t += S.dt; setAnim(b, t / W, 0); setProg(tl, t / W); tl.position.set(b.pos.x, 0.05, b.pos.z); yield 0; }
    } finally { untele(tl); }
    // fenêtre de parade : roulade juste avant/pendant l'impact
    const pp = ppos(), inR = hd(pp.x, pp.z, b.pos.x, b.pos.z) <= R + 0.3;
    vfx('explosion', b.pos.x, b.pos.z, 0xffe04a, R); sfx('bossRoar'); shake(0.7); setAnim(b, 0, 1);
    yield 0.12;
    const rolled = S.time - S.lastRoll < 0.45 || isRolling();
    if (inR) {
      if (rolled) { say(ppos(), 'PARADE !', 0x7affd8, 'parry', 0.5); if (API() && API().hitStop) API().hitStop(0.12); stagger(b, 1.6); }
      else { hurt(b, D(b, 0.6, ph)); stunPlayer(1.3); say(ppos(), 'ÉTOURDI', 0xffe04a, 'stun', 0.5); }
    }
    yield 0.9;
  }, 'Cri : rouler au moment du cri (parade) ou se tenir hors de portée');

  // 16. Marque à fuir des alliés
  attack('ally_mark', 0.8, function* (b, api, ph, h) {
    const sp = spd(ph), dur = 3.6 / Math.sqrt(sp), col = 0xff2a6a;
    const mk = disc(col, 0.3, 4.5, ppos().x, ppos().z);
    let el = 0;
    try {
      for (let t = 0; t < 0.6 / sp;) { t += S.dt; setAnim(b, t, 0); yield 0; }
      setAnim(b, 0, 1); say(ppos(), 'MARQUÉ !', col, 'mark', 0.5);
      while (el < dur) { el += S.dt; const pp = ppos(); mk.position.set(pp.x, 0.05, pp.z); mk.rotation.y += S.dt * 3; mk.userData.disc.material.opacity = 0.2 + 0.25 * Math.abs(Math.sin(el * (4 + el * 3))); yield 0; }
      const pp = ppos(), a = API(); let near = 0;
      (a && a.minions ? a.minions() : []).forEach(m => { if (m && !m.dead && m.pos && hd(m.pos.x, m.pos.z, pp.x, pp.z) < 4.8) { near++; if (a.damage) { /* les serviteurs subissent aussi (via enemy.damage si dispo) */ } } });
      hurt(b, D(b, 1.2 + 0.7 * near, ph), 'ombre');
      vfx('explosion', pp.x, pp.z, col, 4.8); sfx('boom'); shake(0.4);
      if (near) say(pp, 'ALLIÉS TOUCHÉS ×' + near, col, 'markx');
    } finally { disposeObj(mk); }
    yield 0.8;
  }, 'Marque : plus il y a d\'alliés près de vous, plus l\'explosion est forte');

  // 17. Mares toxiques
  attack('poison_pools', 0.8, function* (b, api, ph, h) {
    const n = 3 + ph.n, pp = ppos();
    for (let t = 0; t < 0.8 / spd(ph);) { t += S.dt; setAnim(b, t, 0); yield 0; }
    for (let i = 0; i < n; i++) {
      const x = clamp(i === 0 ? pp.x : rnd(-HALF + 3, HALF - 3), -HALF + 2, HALF - 2), z = clamp(i === 0 ? pp.z : rnd(-HALF + 3, HALF - 3), -HALF + 2, HALF - 2);
      strikeCircle(b, x, z, 2.6, 1.0, D(b, 0.6, ph), 'poison', { onHit: (xx, zz) => { zone(b, xx, zz, 2.6, 12, { kind: 'poison', dps: 0.35, el: 'poison', color: 0x7bd648, op: 0.4 }); limitZones(b, 'poison', 7); }, vfx: 'ring' });
      yield 0.15;
    }
    setAnim(b, 0, 1); yield 1.5;
  }, 'Mares toxiques persistantes');
  function limitZones(b, kind, max) { const l = S.zones.filter(z => z.boss === b && z.kind === kind); while (l.length > max) { const z = l.shift(); z.until = 0; } }

  // 18. Toiles collantes
  attack('web_trap', 0.8, function* (b, api, ph, h) {
    const n = 2 + ph.n, pp = ppos();
    for (let t = 0; t < 0.8 / spd(ph);) { t += S.dt; setAnim(b, t, 0); yield 0; }
    for (let i = 0; i < n; i++) {
      const x = clamp(i === 0 ? pp.x : rnd(-HALF + 3, HALF - 3), -HALF + 2, HALF - 2), z = clamp(i === 0 ? pp.z : rnd(-HALF + 3, HALF - 3), -HALF + 2, HALF - 2);
      strikeCircle(b, x, z, 3.2, 0.9, D(b, 0.5, ph), 'physique', { onHit: (xx, zz) => { zone(b, xx, zz, 3.2, 14, { kind: 'web', slow: 0.55, color: 0xe8e8f0, op: 0.3 }); limitZones(b, 'web', 5); }, vfx: 'ring' });
      yield 0.12;
    }
    setAnim(b, 0, 1); yield 1.2;
  }, 'Toiles collantes qui ralentissent');

  // 19. Rangée de pics
  attack('spike_line', 0.8, function* (b, api, ph, h) {
    const sp = spd(ph), pp = ppos(), a = ang(b.pos, pp), el = (b.def && b.def.element) || 'physique';
    face(b, a);
    for (let t = 0; t < 0.8 / sp;) { t += S.dt; setAnim(b, t, 0); yield 0; }
    const n = ph.n >= 3 ? 9 : 7;
    for (let i = 1; i <= n; i++) { const d = i * 2.3; strikeCircle(b, clamp(b.pos.x + Math.sin(a) * d, -HALF + 1, HALF - 1), clamp(b.pos.z + Math.cos(a) * d, -HALF + 1, HALF - 1), 1.4, 0.8, D(b, 1.0, ph), el, { delay: i * 0.13 / sp, vfx: 'ring' }); }
    setAnim(b, 0, 1); yield 2.2 / sp;
  }, 'Pics en ligne : sortir de la ligne');

  // 20. Anneaux avec brèche
  attack('ring_gap', 1.0, function* (b, api, ph, h) {
    const sp = spd(ph), n = ph.n >= 3 ? 4 : 3, col = elCol(b), el = (b.def && b.def.element) || 'physique';
    const tl = tele('line', { length: 10, width: 1.5 }, b.pos.x, b.pos.z, ang(b.pos, ppos()));
    try { for (let t = 0; t < 1.0 / sp;) { t += S.dt; setAnim(b, t, 0); const a = ang(b.pos, ppos()); tl.position.set(b.pos.x, 0.05, b.pos.z); tl.rotation.y = a; setProg(tl, t * sp); yield 0; } } finally { untele(tl); }
    for (let i = 0; i < n; i++) {
      const g = ang(b.pos, ppos()), half = 0.5;
      const geo = new THREE.RingGeometry(0.86, 1, 56, 1, g - PI / 2 + half, TAU - 2 * half);
      const mesh = new THREE.Mesh(geo, basicMat(col, 0.7, true)); mesh.rotation.x = -PI / 2; mesh.position.set(b.pos.x, 0.5, b.pos.z); mesh.userData.ownGeo = true; addMesh(mesh);
      const ox = b.pos.x, oz = b.pos.z; let r = 1.5, hitDone = false;
      addFx({ boss: b, update(dt) {
        r += 6.5 * sp * dt; mesh.scale.set(r, r, 1);
        const pp = ppos(), d = hd(pp.x, pp.z, ox, oz);
        if (!hitDone && Math.abs(d - r * 0.93) < 0.14 * r + 0.5 && Math.abs(angDiff(ang({ x: ox, z: oz }, pp), g)) > half + 0.04) { hitDone = true; hurt(b, D(b, 1.0, ph), el); }
        return r > 17;
      }, dispose() { disposeObj(mesh); geo.dispose(); } });
      sfx('fire'); setAnim(b, 0, 1);
      yield 0.85 / sp;
    }
    yield 1.4;
  }, 'Anneaux avec brèche : passer par la brèche (ou rouler à travers)');

  // =====================================================================
  //  MODULES de mécaniques
  // =====================================================================
  const MODS = {};
  const nByPhase = (arr, ph) => Array.isArray(arr) ? arr[Math.min(arr.length, ph) - 1] : (arr || 3);

  // ---------- bouclier de cristaux ----------
  function shieldStart(boss, n, cfg) {
    const st = state(boss); cfg = cfg || {};
    const list = [], R = (boss.r || 1.5) + 2.6;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, e = spawnAdd(boss, cfg.kind || 'boss_cristal', boss.pos.x + Math.sin(a0) * R, boss.pos.z + Math.cos(a0) * R, { hp: Math.max(8, boss.pvMax * (cfg.hp || 0.04)), a0, idx: i, order: cfg.order ? i + 1 : 0, color: cfg.order ? [0xff4a4a, 0xffd23a, 0x4aa8ff, 0xb48cff][i % 4] : cfg.color, seq: !!cfg.seq, lit: cfg.seq ? i === 0 : true });
      if (e) list.push(e);
    }
    if (!list.length) { st.shield = null; st.shieldOn = false; return; }
    st.shield = { list, R, ang: 0, cfg, nextOrder: 1, litIdx: 0, litAt: S.time + (cfg.every || 4), cache: n };
    st.shieldOn = true;
    say(boss.pos, cfg.order ? 'DÉTRUISEZ DANS L\'ORDRE !' : (cfg.seq ? 'BRISEZ LE CRISTAL LUMINEUX' : 'BOUCLIER !'), 0x6ae6ff, 'shield', 2);
    sfx('spawn');
  }
  function setGlow(e, on) { const ms = e && e.mesh && e.mesh.userData && e.mesh.userData.glowMats; (ms || []).forEach(m => { m.emissiveIntensity = on ? 2.4 : 0.15; }); }
  function tickShield(boss, dt, st) {
    const sh = st.shield; if (!sh) return;
    const cfg = sh.cfg;
    // révéler les morts
    for (let i = 0; i < sh.list.length; i++) {
      const e = sh.list[i];
      if (e.dead && !e.__add.seen) {
        e.__add.seen = true;
        if (cfg.order) {
          if (e.__add.order === sh.nextOrder) { sh.nextOrder++; say(e.pos, '✔ ' + e.__add.order, 0x7affd8, 'ok' + i, 0.3); }
          else { // mauvais ordre : tout se relève
            say(boss.pos, 'MAUVAIS ORDRE !', 0xff4a4a, 'wrong', 1); sh.nextOrder = 1; heal(boss, 0.015); sfx('error');
            for (let j = 0; j < sh.list.length; j++) { const o = sh.list[j]; if (o.dead) { const a0 = o.__add.a0, ne = spawnAdd(boss, cfg.kind || 'boss_cristal', boss.pos.x + Math.sin(a0) * sh.R, boss.pos.z + Math.cos(a0) * sh.R, Object.assign({}, o.__add, { seen: false, hp: Math.max(8, boss.pvMax * (cfg.hp || 0.04)) })); if (ne) { ne.__add.seen = false; sh.list[j] = ne; } } }
            return;
          }
        } else if (cfg.seq) { vfx('explosion', e.pos.x, e.pos.z, cfg.color || 0x6ae6ff, 2.5); }
      }
    }
    const alive = sh.list.filter(e => !e.dead);
    sh.ang += dt * (cfg.orbit != null ? cfg.orbit : 1.2);
    const n = sh.list.length;
    sh.list.forEach((e, i) => { if (e.dead || !e.pos) return; const a = sh.ang + (e.__add.a0 || 0); e.pos.x = clamp(boss.pos.x + Math.sin(a) * sh.R, -HALF + 1, HALF - 1); e.pos.z = clamp(boss.pos.z + Math.cos(a) * sh.R, -HALF + 1, HALF - 1); });
    if (cfg.seq && alive.length) {
      if (S.time >= sh.litAt || !alive.some(e => e.__add.lit)) { sh.litIdx = (sh.litIdx + 1) % alive.length; sh.litAt = S.time + (cfg.every || 4); alive.forEach((e, i) => { e.__add.lit = i === sh.litIdx; setGlow(e, e.__add.lit); }); }
    }
    if (alive.length === 0) {
      st.shieldOn = false; st.shield = null; sh.list.length = 0;
      if (cfg.onBreak) cfg.onBreak(boss); else { stagger(boss, cfg.stagger || 6); say(boss.pos, 'BOUCLIER BRISÉ !', 0x6ae6ff, 'brk', 1); }
      if (cfg.onDone) cfg.onDone(boss);
    }
  }

  MODS.shield = {
    init(b, st, m) { m.next = 0; m.lastPhase = 0; },
    update(b, dt, st, m, ph) {
      if (!st.shield && !st.shieldOn) {
        if (m.lastPhase !== ph.n) { m.lastPhase = ph.n; if (m.next === 0 || m.opts.regrowOnPhase !== false) m.next = S.time + (m.lastPhase === 1 ? 0.6 : 1.5); }
        if (m.next && S.time >= m.next && b.def.phases) { m.next = 0; shieldStart(b, nByPhase(m.opts.n, ph.n), { hp: m.opts.hp, orbit: m.opts.orbit, stagger: m.opts.stagger, onDone: () => { m.next = S.time + (m.opts.regrow || 14); } }); }
        else if (!m.next && m.opts.regrow && S.time > (st.staggerUntil || 0) + m.opts.regrow) { m.next = S.time + 0.1; }
      }
    },
  };
  MODS.order = {
    init(b, st, m) { m.lastPhase = 0; m.next = S.time + 0.8; m.done = false; },
    update(b, dt, st, m, ph) {
      if (!st.shield) {
        if (m.lastPhase !== ph.n) { m.lastPhase = ph.n; m.next = S.time + (ph.n === 1 ? 0.6 : 1.8); m.pending = true; }
        if (m.pending && S.time >= m.next) { m.pending = false; shieldStart(b, nByPhase(m.opts.n, ph.n), { order: true, kind: m.opts.kind || 'boss_totem', hp: m.opts.hp || 0.035, orbit: 0.0, stagger: 7, onDone: m.opts.onDone && (() => m.opts.onDone(b)) }); }
      }
    },
    stop(b, st) { if (st.shield) { st.shield.list.forEach(killAdd); st.shield = null; st.shieldOn = false; } },
  };
  MODS.seq = {
    init(b, st, m) { m.lastPhase = 0; m.next = S.time + 0.8; },
    update(b, dt, st, m, ph) {
      if (!st.shield) {
        if (m.lastPhase !== ph.n) { m.lastPhase = ph.n; m.next = S.time + (ph.n === 1 ? 0.6 : 1.8); m.pending = true; }
        if (m.pending && S.time >= m.next) { m.pending = false; shieldStart(b, nByPhase(m.opts.n, ph.n), { seq: true, hp: m.opts.hp, orbit: 0.9, every: m.opts.every, color: m.opts.color, stagger: 8 }); }
      }
    },
  };
  // ---------- phylactère errant ----------
  MODS.roam = {
    init(b, st, m) { m.e = null; m.next = S.time + 0.8; m.tp = 0; },
    update(b, dt, st, m, ph) {
      if (m.e && m.e.dead) {
        m.e = null; st.shieldOn = false; stagger(b, 6); say(b.pos, 'PHYLACTÈRE BRISÉ !', 0xdfffd0, 'phy', 1);
        m.next = S.time + (m.opts.respawn || 22);
      }
      if (!m.e && S.time >= m.next && !(S.time < st.staggerUntil)) {
        const x = rnd(-9, 9), z = rnd(-9, 9);
        m.e = spawnAdd(b, 'boss_phylactere', x, z, { hp: Math.max(10, b.pvMax * (m.opts.hp || 0.06)) });
        if (m.e) { st.shieldOn = true; m.tp = S.time + (m.opts.every || 6); say(b.pos, 'LE PHYLACTÈRE SE MANIFESTE', 0xdfffd0, 'phy2', 2); }
      }
      if (m.e && !m.e.dead) {
        st.shieldOn = true; heal(b, 0.008 * dt * (1 + ph.n * 0.3));
        if (S.time >= m.tp) { m.tp = S.time + (m.opts.every || 6) / (1 + 0.2 * (ph.n - 1)); const nx = rnd(-10, 10), nz = rnd(-10, 10); vfx('shadowRise', m.e.pos.x, m.e.pos.z, 0xdfffd0, 1.5); m.e.pos.x = nx; m.e.pos.z = nz; vfx('summonCircle', nx, nz, 0xdfffd0, 1.5); }
      }
    },
    stop(b, st, m) { if (m.e) killAdd(m.e); },
  };
  // ---------- étendard ----------
  MODS.banner = {
    init(b, st, m) { m.e = null; m.lastPhase = 0; m.base = b.speed; m.buffed = false; },
    update(b, dt, st, m, ph) {
      if (m.lastPhase !== ph.n && (!m.e || m.e.dead)) { m.lastPhase = ph.n; const a = rnd(0, TAU); m.e = spawnAdd(b, 'boss_etendard', clamp(b.pos.x + Math.sin(a) * 6, -11, 11), clamp(b.pos.z + Math.cos(a) * 6, -11, 11), { hp: Math.max(10, b.pvMax * 0.05) }); if (m.e) say(b.pos, "L'ÉTENDARD GALVANISE LE ROI !", 0xffd23a, 'bn', 2); }
      const up = !!(m.e && !m.e.dead);
      if (up && !m.buffed) { m.buffed = true; b.dmgMult = 1.35; b.speed = b.baseSpeed ? b.baseSpeed * 1.3 : b.speed * 1.3; setAura(b, 0xff4a2a); }
      if (!up && m.buffed) { m.buffed = false; b.dmgMult = 1; b.speed = b.baseSpeed || b.speed / 1.3; setAura(b, null); stagger(b, 3); say(b.pos, 'ENRAGE RETIRÉE', 0xffffff, 'bn2'); }
    },
    stop(b, st, m) { if (m.e) killAdd(m.e); setAura(b, null); },
  };
  // ---------- garde frontale ----------
  MODS.front = { init(b, st, m) { st.frontal = m.opts.half || 1.3; }, update() { }, stop(b, st) { st.frontal = 0; } };
  // ---------- camouflage ----------
  MODS.hidden = {
    init(b, st, m) { m.next = S.time + 6; m.until = 0; },
    update(b, dt, st, m) {
      if (!st.hidden && S.time >= m.next) { setHidden(b, true); m.until = S.time + (m.opts.dur || 5); say(b.pos, 'Il disparaît…', 0x88ffcc, 'hid'); b.cd = Math.min(b.cd || 0, 0.6); }
      if (st.hidden && S.time >= m.until) { setHidden(b, false); m.next = S.time + (m.opts.every || 12); }
      if (!st.hidden && m.next < S.time) m.next = S.time + (m.opts.every || 12);
    },
    stop(b) { setHidden(b, false); },
  };
  // ---------- riposte ----------
  MODS.riposte = {
    init(b, st, m) { m.next = S.time + 6; m.until = 0; },
    update(b, dt, st, m) {
      if (!st.riposte && S.time >= m.next && S.time >= st.staggerUntil) { st.riposte = true; m.until = S.time + (m.opts.dur || 3.5); say(b.pos, 'POSTURE DE RIPOSTE — NE FRAPPEZ PAS !', 0xff4a4a, 'rip', 1); setAura(b, 0xff3030); setEyes(b, 0xff2020, 3); sfx('bossRoar'); }
      if (st.riposte && S.time >= m.until) { st.riposte = false; m.next = S.time + (m.opts.every || 10); setAura(b, null); setEyes(b, 0xffd23a, 2.2); }
      if (st.riposte && S.time < m.until) setAura(b, 0xff3030, (b.r || 1.5) + 1 + 0.3 * Math.sin(S.time * 14));
    },
    stop(b, st) { st.riposte = false; setAura(b, null); },
  };
  // ---------- prisme élémentaire ----------
  MODS.prism = {
    init(b, st, m) { m.i = -1; m.next = 0; },
    update(b, dt, st, m, ph) {
      if (S.time >= m.next) {
        const els = m.opts.els; m.i = (m.i + 1) % els.length; st.weakEl = els[m.i]; m.next = S.time + (m.opts.every || 12) / (1 + 0.15 * (ph.n - 1));
        setAura(b, EL[st.weakEl], (b.r || 1.5) + 1.2); setEyes(b, EL[st.weakEl], 3);
        say(b.pos, 'FAIBLESSE : ' + st.weakEl.toUpperCase(), EL[st.weakEl], 'prism', 1); sfx('spawn');
      }
      if (st.aura) st.aura.userData.disc.material.opacity = 0.25 + 0.1 * Math.sin(S.time * 4);
    },
    stop(b, st) { st.weakEl = null; setAura(b, null); },
  };
  // ---------- lumière / ténèbres ----------
  MODS.light = {
    init(b, st, m) {
      m.zs = []; const n = m.opts.n || 3;
      for (let i = 0; i < n; i++) { const a = i / n * TAU; m.zs.push({ x: Math.sin(a) * 6, z: Math.cos(a) * 6, a, mesh: disc(0xfff2a0, 0.22, 5, 0, 0) }); }
      st.lightFn = () => { const pp = ppos(); return m.zs.some(z => hd(pp.x, pp.z, z.x, z.z) <= m.r); };
      m.r = 5.5; m.dot = 0;
    },
    update(b, dt, st, m, ph) {
      m.r = nByPhase(m.opts.r, ph.n) || 5; const w = 0.35 + ph.n * 0.1;
      m.zs.forEach((z, i) => { z.a += dt * w * (i % 2 ? 1 : -1); const R = 6 + 2.5 * Math.sin(S.time * 0.4 + i); z.x = Math.sin(z.a) * R; z.z = Math.cos(z.a) * R; z.mesh.position.set(z.x, 0.045, z.z); z.mesh.userData.setR(m.r); });
      m.dot -= dt;
      if (!st.lightFn()) { if (m.dot <= 0) { m.dot = 1.0; hurt(b, Math.max(1, Math.round(D(b, 0.22))), 'ombre'); say(ppos(), 'TÉNÈBRES !', 0x8a3cff, 'dk', 1.5); } }
    },
    stop(b, st, m) { m.zs.forEach(z => disposeObj(z.mesh)); st.lightFn = null; },
  };
  // ---------- mares + régénération ----------
  MODS.pools = {
    init(b, st, m) { m.next = S.time + 5; },
    update(b, dt, st, m, ph) {
      if (S.time >= m.next) { m.next = S.time + 7 / (1 + 0.2 * (ph.n - 1)); const zn = zone(b, b.pos.x, b.pos.z, 2.4, 14, { kind: 'poison', dps: 0.3, el: 'poison', color: 0x7bd648, op: 0.4 }); limitZones(b, 'poison', 7); }
      if (m.opts.heal) { const inP = S.zones.some(z => z.boss === b && z.kind === 'poison' && hd(b.pos.x, b.pos.z, z.x, z.z) < z.r); if (inP) { heal(b, m.opts.heal * dt); if (S.time - (S.txtAt.heal || -9) > 2) say(b.pos, '+ RÉGÉNÉRATION', 0x7bd648, 'heal', 2); } }
    },
  };
  // ---------- toiles permanentes ----------
  MODS.webs = {
    init(b, st, m) { m.next = S.time + 4; },
    update(b, dt, st, m, ph) {
      if (S.time >= m.next) { m.next = S.time + 8 / (1 + 0.2 * (ph.n - 1)); const pp = ppos(); const x = clamp(pp.x + rnd(-4, 4), -HALF + 2, HALF - 2), z = clamp(pp.z + rnd(-4, 4), -HALF + 2, HALF - 2); strikeCircle(b, x, z, 3.4, 1.2, D(b, 0.3), 'physique', { onHit: (xx, zz) => { zone(b, xx, zz, 3.4, 16, { kind: 'web', slow: 0.55, color: m.opts.color || 0xe8e8f0, op: 0.3 }); limitZones(b, 'web', 5); }, vfx: 'ring', shake: 0.05 }); }
      const trapped = S.zones.some(z => z.boss === b && z.kind === 'web' && inZone(z));
      if (trapped && !m.fast) { m.fast = true; b.speed = (b.baseSpeed || b.speed) * 1.35; } else if (!trapped && m.fast) { m.fast = false; b.speed = b.baseSpeed || b.speed; }
    },
    stop(b) { if (b.baseSpeed) b.speed = b.baseSpeed; },
  };
  // ---------- couverture : piliers + blizzard ----------
  MODS.cover = {
    init(b, st, m) { m.next = S.time + 1.5; m.bl = m.opts.blizzard ? S.time + m.opts.blizzard * 0.6 : 0; },
    update(b, dt, st, m, ph) {
      const mine = S.pillars.filter(p => p.boss === b).length, want = m.opts.pillars || 0;
      if (want && mine < want && S.time >= m.next) {
        m.next = S.time + 4;
        for (let k = 0; k < 8; k++) { const x = rnd(-9, 9), z = rnd(-9, 9), pp = ppos(); if (hd(x, z, pp.x, pp.z) < 3 || hd(x, z, b.pos.x, b.pos.z) < 4 || S.pillars.some(q => hd(q.x, q.z, x, z) < 5)) continue; strikeCircle(b, x, z, 1.6, 1.0, D(b, 0.7), (b.def && b.def.element) || 'physique', { onHit: (xx, zz) => addPillar(b, xx, zz, 60), vfx: 'ring' }); break; }
      }
      if (m.opts.blizzard && S.time >= m.bl && !m.run) { m.run = true; m.bl = 0; blizzard(b, ph, () => { m.run = false; m.bl = S.time + m.opts.blizzard / (1 + 0.15 * (ph.n - 1)); }); }
    },
  };
  function blizzard(b, ph, done) {
    S.runners.push({ boss: b, h: { done: false }, wait: 0, it: (function* () {
      const tl = tele('circle', 22, 0, 0);
      try {
        say(b.pos, 'BLIZZARD ! MISEZ-VOUS À COUVERT', 0x9ae0ff, 'bliz', 1); sfx('bossRoar');
        for (let t = 0; t < 3.2;) { t += S.dt; setProg(tl, t / 3.2); yield 0; }
      } finally { untele(tl); }
      const pp = ppos(), pl = losBlocked(b.pos.x, b.pos.z, pp.x, pp.z);
      vfx('explosion', 0, 0, 0x9ae0ff, 14); shake(0.5); sfx('boom');
      if (pl) { pl.integrity -= 0.34; say(pp, 'À COUVERT', 0x7affd8, 'cov', 0.5); } else if (!isRolling()) { hurt(b, D(b, 1.8, ph), 'glace'); slowPlayer(0.6, 2); }
      S.pillars.forEach(p => { if (p.boss === b && losBlocked(b.pos.x, b.pos.z, p.x, p.z) === null) p.integrity -= 0.0; });
      done();
    })() });
  }
  // ---------- sceaux (verdict) ----------
  function safeZoneBlast(b, nSafe, delay, dmgK, ph, opts) {
    opts = opts || {};
    S.runners.push({ boss: b, h: { done: false }, wait: 0, it: (function* () {
      const safes = [];
      for (let i = 0; i < nSafe; i++) { let x = rnd(-9, 9), z = rnd(-9, 9); for (let k = 0; k < 10 && safes.some(s => hd(s.x, s.z, x, z) < 6); k++) { x = rnd(-9, 9); z = rnd(-9, 9); } safes.push({ x, z, mesh: disc(0x7affd8, 0.4, 2.4, x, z) }); }
      const danger = tele('circle', 24, 0, 0);
      say(b.pos, opts.label || 'VERDICT ! ENTREZ DANS UN SCEAU', 0x7affd8, 'sig', 1); sfx('bossRoar');
      try { for (let t = 0; t < delay;) { t += S.dt; setProg(danger, t / delay); safes.forEach(s => { s.mesh.userData.disc.material.opacity = 0.3 + 0.15 * Math.sin(S.time * 8); }); yield 0; }
        const pp = ppos(); const ok = safes.some(s => hd(pp.x, pp.z, s.x, s.z) <= 2.4) || (opts.cover && losBlocked(b.pos.x, b.pos.z, pp.x, pp.z));
        vfx('explosion', 0, 0, 0xffffff, 14); shake(0.7); sfx('boom');
        if (!ok) hurt(b, D(b, dmgK, ph), (b.def && b.def.element) || 'ombre'); else say(pp, 'ÉPARGNÉ', 0x7affd8, 'saved', 0.5);
      } finally { untele(danger); safes.forEach(s => disposeObj(s.mesh)); if (opts.done) opts.done(); }
    })() });
  }
  MODS.sigils = {
    init(b, st, m) { m.next = S.time + 8; m.run = false; },
    update(b, dt, st, m, ph) {
      if (!m.run && S.time >= m.next) { m.run = true; safeZoneBlast(b, nByPhase([m.opts.n || 3, (m.opts.n || 3) - (m.opts.n > 2 ? 1 : 0), Math.max(1, (m.opts.n || 3) - 1)], ph.n), 4.5 / (1 + 0.1 * ph.n), 2.2, ph, { done: () => { m.run = false; m.next = S.time + (m.opts.every || 14); } }); }
    },
  };
  // ---------- reflets périodiques ----------
  MODS.echoes = {
    init(b, st, m) { m.next = S.time + 8; },
    update(b, dt, st, m, ph) { if (S.time >= m.next) { m.next = S.time + (m.opts.every || 20); spawnEchoes(b, nByPhase(m.opts.n, ph.n), ph); say(b.pos, 'REFLETS !', 0xb48cff, 'ech'); } },
  };
  // ---------- effondrement (zone sûre qui rétrécit) ----------
  MODS.collapse = {
    init(b, st, m) { m.R = m.opts.from || 14; m.dot = 0; m.mesh = null; },
    update(b, dt, st, m, ph) {
      const target = nByPhase(m.opts.to, ph.n) || 14; m.R += clamp(target - m.R, -1.2 * dt, 1.2 * dt);
      if (m.R < 13.5) {
        if (!m.mesh) { const g = new THREE.RingGeometry(1, 4, 64); const me = new THREE.Mesh(g, basicMat(0x050212, 0.75)); me.rotation.x = -PI / 2; me.userData.ownGeo = true; addMesh(me); m.mesh = me; }
        m.mesh.scale.set(m.R, m.R, 1); m.mesh.position.y = 0.3;
      }
      const pp = ppos(); m.dot -= dt;
      if (Math.hypot(pp.x, pp.z) > m.R && m.dot <= 0) { m.dot = 0.6; hurt(b, Math.max(1, Math.round(D(b, m.opts.dps || 0.12))), 'ombre'); say(pp, 'LE NÉANT VOUS RONGE', 0x8a3cff, 'nea', 1.5); }
    },
    stop(b, st, m) { if (m.mesh) disposeObj(m.mesh); },
  };
  // ---------- furie chronométrée ----------
  MODS.rage = {
    init(b, st, m) { m.t = 0; m.active = false; m.last = 99; m.run = false; m.cd = 0; },
    update(b, dt, st, m, ph) {
      if (m.opts.cancelled) return;
      if (!m.active && ph.n >= (m.opts.phase || 3)) { m.active = true; m.t = m.opts.time || 30; say(b.pos, 'FURIE ! ' + Math.ceil(m.t) + ' s', 0xff3030, 'rg0', 1); }
      if (!m.active || m.run) return;
      m.t -= dt; b.dmgMult = 1.15;
      const c = Math.ceil(m.t);
      if (c !== m.last && (c % 10 === 0 || c <= 5) && c > 0) { m.last = c; say(b.pos, 'FURIE : ' + c, 0xff3030, 'rg' + c, 0.8); }
      if (m.t <= 0) {
        m.run = true;
        const hasP = S.pillars.some(p => p.boss === b);
        safeZoneBlast(b, hasP ? 0 : 3, 3.0, m.opts.dmgK || 2.4, ph, { label: hasP ? 'ANÉANTISSEMENT ! COUVREZ-VOUS' : 'ANÉANTISSEMENT ! ENTREZ DANS UN SCEAU', cover: hasP, done: () => { m.run = false; m.t = (m.opts.time || 30) * 0.8; m.last = 99; } });
      }
    },
    stop(b) { b.dmgMult = 1; },
  };
  // ---------- fissures de lave ----------
  MODS.lava = {
    init(b, st, m) { m.next = S.time + 6; },
    update(b, dt, st, m, ph) {
      if (S.time >= m.next) { m.next = S.time + 8 / (1 + 0.25 * (ph.n - 1)); const pp = ppos(); const x = clamp(pp.x + rnd(-5, 5), -HALF + 2, HALF - 2), z = clamp(pp.z + rnd(-5, 5), -HALF + 2, HALF - 2); strikeCircle(b, x, z, 2.2, 1.1, D(b, 0.7), 'feu', { onHit: (xx, zz) => { zone(b, xx, zz, 2.2, 12, { kind: 'lava', dps: 0.3, el: 'feu', color: 0xff5a1a, op: 0.45 }); limitZones(b, 'lava', 8); }, vfx: 'ring' }); }
    },
  };
  // ---------- ARCHITECTE DU NÉANT (composition par phase) ----------
  MODS.architect = {
    init(b, st, m) { m.cur = 0; m.sub = []; },
    update(b, dt, st, m, ph) {
      if (m.cur !== ph.n) {
        m.cur = ph.n; m.sub.forEach(s => stopMod(b, st, s)); m.sub = [];
        const add = (name, opts) => m.sub.push(addMod(b, st, name, opts, true));
        if (ph.n === 1) add('cover', { pillars: 4, blizzard: 0 });
        else if (ph.n === 2) { add('collapse', { from: 14, to: [14, 10.5, 9, 8], dps: 0.15 }); add('cover', { pillars: 2, blizzard: 0 }); }
        else if (ph.n === 3) { add('collapse', { from: 10, to: [14, 10.5, 9.5, 9], dps: 0.15 }); add('echoes', { n: [2, 2, 3, 3], every: 20 }); add('sigils', { n: 3, every: 16 }); }
        else {
          const rage = addMod(b, st, 'rage', { time: 42, phase: 1, dmgK: 2.7 }, true);
          m.sub.push(rage);
          add('collapse', { from: 9, to: [14, 10.5, 9.5, 9], dps: 0.18 });
          add('order', { n: [3, 3, 3, 3], hp: 0.02, kind: 'boss_totem', onDone: () => { rage.opts.cancelled = true; rage.t = 1e9; heal(b, 0); banner('Clés détruites : Effacement annulé !'); } });
        }
        say(b.pos, 'PHASE ' + ph.n + ' / ' + (ph.count || 4), 0xb48cff, 'ph', 0.5);
      }
    },
    stop(b, st, m) { m.sub.forEach(s => stopMod(b, st, s)); },
  };

  // =====================================================================
  //  v5 « Ténèbres » — INFRASTRUCTURE : armures, accessoires, interactions, projectiles
  // =====================================================================
  const SHX = {};
  function gx(k) {
    if (!SHX.cyl) { SHX.cyl = new THREE.CylinderGeometry(1, 1, 1, 10); SHX.cone2 = new THREE.ConeGeometry(1, 1, 8); SHX.octa = new THREE.OctahedronGeometry(1); SHX.tor = new THREE.TorusGeometry(1, 0.12, 6, 18); }
    return SHX[k] || shared()[k];
  }
  function toonMat(color, glow) { return G.GFX && G.GFX.toon ? G.GFX.toon(color, glow ? { emissive: color, emissiveIntensity: glow } : undefined) : new THREE.MeshLambertMaterial({ color }); }
  /** ajoute une pièce à un groupe ; glow === -1 : additif sans éclairage */
  function part(g, geo, color, x, y, z, sx, sy, sz, glow, rot) {
    const m = new THREE.Mesh(gx(geo), glow === -1 ? basicMat(color, 0.9, true) : toonMat(color, glow));
    m.position.set(x, y, z); m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (!glow) m.castShadow = true; else m.userData.noOutline = true;
    g.add(m); return m;
  }
  const PROPS = {
    brazier(lit) {
      const g = new THREE.Group();
      part(g, 'cyl', 0x3a3a46, 0, 0.5, 0, 0.18, 1.0, 0.18); part(g, 'cyl', 0x2a2a34, 0, 1.05, 0, 0.75, 0.22, 0.75); part(g, 'cyl', 0x4a4a58, 0, 0.1, 0, 0.6, 0.2, 0.6);
      const f = part(g, 'cone2', 0xff8a2a, 0, 1.6, 0, 0.5, 1.1, 0.5, -1), f2 = part(g, 'cone2', 0xffe08a, 0, 1.45, 0, 0.26, 0.7, 0.26, -1);
      g.userData.flames = [f, f2]; g.userData.setLit = (on) => { f.visible = f2.visible = on; };
      g.userData.setLit(lit !== false); return g;
    },
    etai() {
      const g = new THREE.Group();
      part(g, 'box', 0x6b4a2a, -1.2, 1.6, 0, 0.35, 3.2, 0.35); part(g, 'box', 0x6b4a2a, 1.2, 1.6, 0, 0.35, 3.2, 0.35);
      part(g, 'box', 0x7a5632, 0, 3.2, 0, 3.0, 0.4, 0.45); part(g, 'box', 0x5a3b22, 0, 2.4, 0, 0.2, 1.8, 0.2, 0, [0, 0, 0.9]);
      return g;
    },
    cloche() {
      const g = new THREE.Group();
      part(g, 'box', 0x3a4a5a, -0.9, 1.6, 0, 0.22, 3.2, 0.22); part(g, 'box', 0x3a4a5a, 0.9, 1.6, 0, 0.22, 3.2, 0.22); part(g, 'box', 0x3a4a5a, 0, 3.2, 0, 2.0, 0.22, 0.3);
      const b = new THREE.Group(); b.position.set(0, 3.0, 0); g.add(b);
      part(b, 'cone2', 0xc8a24a, 0, -0.9, 0, 0.8, 1.2, 0.8); part(b, 'sph', 0x6ad0ff, 0, -1.55, 0, 0.18, 0.18, 0.18, 1.2);
      g.userData.bell = b; return g;
    },
    canal(color) {
      const g = new THREE.Group();
      part(g, 'cyl', 0x2a0a0a, 0, 0.05, 0, 1.3, 0.1, 1.3); part(g, 'cyl', color || 0xc01818, 0, 0.12, 0, 1.15, 0.05, 1.15, 0.8);
      part(g, 'cyl', 0x3a2a2a, 0, 0.8, 0, 0.12, 1.6, 0.12); part(g, 'tor', 0xc8a24a, 0, 1.6, 0, 0.6, 0.6, 0.6, 0.3, [Math.PI / 2, 0, 0]);
      return g;
    },
    pylone() {
      const g = new THREE.Group();
      part(g, 'cyl', 0x5a5f6c, 0, 1.2, 0, 0.35, 2.4, 0.35); part(g, 'cyl', 0x3a3f4a, 0, 0.15, 0, 0.8, 0.3, 0.8);
      part(g, 'tor', 0x9a6aff, 0, 2.0, 0, 0.7, 0.7, 0.7, 0.9, [Math.PI / 2, 0, 0]);
      const s = part(g, 'sph', 0xb48cff, 0, 2.7, 0, 0.35, 0.35, 0.35, 1.5); g.userData.core = s; return g;
    },
    disjoncteur() {
      const g = new THREE.Group();
      part(g, 'box', 0x4a4f5a, 0, 1.0, 0, 1.2, 2.0, 0.5); part(g, 'box', 0x1a1a22, 0, 1.2, 0.27, 0.9, 0.9, 0.05); part(g, 'box', 0xff4a4a, 0.2, 1.2, 0.35, 0.1, 0.5, 0.1, 1.2);
      return g;
    },
    pole(color) {
      const g = new THREE.Group();
      part(g, 'cyl', 0x6b4a2a, 0, 1.9, 0, 0.12, 3.8, 0.12); part(g, 'sph', color || 0xffd23a, 0, 3.9, 0, 0.28, 0.28, 0.28, 1.4);
      part(g, 'cyl', 0xb02a2a, 0, 0.9, 0, 0.16, 0.4, 0.16); part(g, 'cyl', 0xf0e8d8, 0, 1.4, 0, 0.16, 0.4, 0.16);
      return g;
    },
    etoile(color) { const g = new THREE.Group(); const s = part(g, 'octa', color || 0xfff2a0, 0, 0.9, 0, 0.5, 0.8, 0.5, 1.6); g.userData.star = s; return g; },
    braise() { const g = PROPS.brazier(true); g.scale.setScalar(0.7); return g; },
    tome(color) {
      const g = new THREE.Group();
      part(g, 'cyl', 0x4a4a58, 0, 0.5, 0, 0.5, 1.0, 0.5); part(g, 'box', color || 0x8a2a2a, 0, 1.15, 0, 1.2, 0.2, 0.9, 0, [-0.3, 0, 0]); part(g, 'box', 0xf0e8d0, 0, 1.28, 0, 1.0, 0.08, 0.75, 0.3, [-0.3, 0, 0]);
      return g;
    },
  };
  /** armures cumulables : st.armors[clé] = multiplicateur (null = retire) */
  function setArmor(b, key, val) { const st = state(b); st.armors = st.armors || {}; if (val == null) delete st.armors[key]; else st.armors[key] = val; }
  function armorOf(st) { let m = 1; const a = st.armors; if (a) for (const k in a) m *= a[k]; return m; }
  function dmgPct(b, frac) { b.pv = Math.max(1, b.pv - b.pvMax * frac); }
  function summonId(b) { const id = b.def && b.def.summon; return id && G.MONSTERS && G.MONSTERS[id] ? id : (G.MONSTERS && G.MONSTERS.squelette ? 'squelette' : id); }
  function spawnMinions(b, n, x, z) {
    const a = API(), out = []; if (!a || !a.spawnEnemy) return out;
    for (let i = 0; i < n; i++) { const an = rnd(0, TAU), r = rnd(0, 1.5); try { const e = a.spawnEnemy(summonId(b), V3(clamp((x == null ? b.pos.x : x) + Math.sin(an) * r, -12, 12), 0, clamp((z == null ? b.pos.z : z) + Math.cos(an) * r, -12, 12)), {}); if (e) { e.fromBoss = true; out.push(e); } } catch (er) { /* ignore */ } }
    return out;
  }
  function* waitS(t) { yield t; }
  function* windup(b, ph, sec) { const W = sec / spd(ph); for (let t = 0; t < W;) { t += S.dt; setAnim(b, t / W, 0); yield 0; } }
  function arenaRand(m) { m = m == null ? 9 : m; return [rnd(-m, m), rnd(-m, m)]; }
  const cl = (v, m) => clamp(v, -HALF + (m == null ? 1.5 : m), HALF - (m == null ? 1.5 : m));

  // ---------- zones d'interaction (le joueur reste dans le cercle : jauge) ----------
  function addInteract(boss, o) {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z); addMesh(g);
    if (o.prop) g.add(o.prop);
    const col = o.color != null ? o.color : 0xffffff;
    const ring = disc(col, 0.12, o.r, o.x, o.z), fill = disc(col, 0.4, 0.05, o.x, o.z, false);
    const it = {
      boss, x: o.x, z: o.z, r: o.r, p: 0, g, ring, fill, o, dead: false, on: true,
      update(dt) {
        if (it.dead || (boss && boss.dead)) return true;
        const en = it.on && (!o.enabled || o.enabled(it));
        ring.visible = fill.visible = en;
        const pl = P(), pp = ppos();
        const near = en && pl && !pl.dead && !(pl.stunned > 0) && hd(pp.x, pp.z, it.x, it.z) <= it.r;
        if (near) { it.p += dt / o.time; if (o.fragile && S.time - S.lastHit < 0.12) it.p = 0; } else it.p = Math.max(0, it.p - dt * 1.2 / o.time);
        fill.userData.setR(Math.max(0.05, it.r * it.p));
        ring.userData.disc.material.opacity = en ? 0.1 + 0.08 * Math.sin(S.time * 4) + (near ? 0.1 : 0) : 0;
        if (o.tick) o.tick(it, dt, en);
        if (it.p >= 1) { it.p = 0; if (o.onDone) o.onDone(it); if (o.once) { it.dead = true; return true; } }
        return false;
      },
      dispose() { disposeObj(g); disposeObj(ring); disposeObj(fill); },
    };
    S.fx.push(it); return it;
  }
  function killInteract(it) { if (it) it.dead = true; }

  // ---------- projectiles / mobiles hostiles ----------
  /** o:{x,z,vx,vz,r,life,dmgK,el,color,size,homing,y,mesh,ph,snuff(x,z),onEnd(x,z),once} */
  function orb(b, o) {
    const ph = o.ph || phaseOf(b);
    const m = o.mesh || new THREE.Mesh(shared().sph, basicMat(o.color != null ? o.color : EL[o.el] || 0xff6a3a, 0.9, true));
    if (!o.mesh) m.scale.setScalar(o.size || 0.55); addMesh(m);
    let x = o.x, z = o.z, vx = o.vx || 0, vz = o.vz || 0, t = 0, hit = false;
    return addFx({
      boss: b, update(dt) {
        t += dt;
        if (o.homing) { const pp = ppos(), sp = Math.hypot(vx, vz) || 1, a = Math.atan2(pp.x - x, pp.z - z), ca = Math.atan2(vx, vz), da = angDiff(a, ca), na = ca + clamp(da, -o.homing * dt, o.homing * dt); vx = Math.sin(na) * sp; vz = Math.cos(na) * sp; }
        x += vx * dt; z += vz * dt; m.position.set(x, (o.y == null ? 1.0 : o.y) + Math.sin(t * 6) * 0.1, z);
        if (o.spin) m.rotation.y += dt * 5;
        const pp = ppos(), pl = P();
        if (!hit && pl && !pl.dead && hd(pp.x, pp.z, x, z) < (o.r || 0.8) + 0.4 && !isRolling()) { hit = true; hurt(b, D(b, o.dmgK == null ? 0.7 : o.dmgK, ph), o.el || (b.def && b.def.element)); vfx('ring', x, z, o.color || EL[o.el] || 0xff6a3a, 1.2); if (o.onHit) o.onHit(x, z); if (o.once !== false) return true; }
        if (o.snuff && o.snuff(x, z)) { vfx('ring', x, z, 0xffffff, 1); return true; }
        if (t >= (o.life || 4) || Math.abs(x) > HALF + 2 || Math.abs(z) > HALF + 2) { if (o.onEnd) o.onEnd(x, z); return true; }
        return false;
      }, dispose() { disposeObj(m); },
    });
  }
  /** anneau qui s'étend depuis (x,z), brèche optionnelle (gap = angle central, half = demi-largeur) */
  function ringWave(b, x, z, o) {
    o = o || {}; const ph = o.ph || phaseOf(b), col = o.color != null ? o.color : elCol(b), el = o.el || (b.def && b.def.element) || 'physique';
    const g = o.gap == null ? null : o.gap, half = o.half || 0.5;
    const geo = g == null ? new THREE.RingGeometry(0.88, 1, 56) : new THREE.RingGeometry(0.86, 1, 56, 1, g - PI / 2 + half, TAU - 2 * half);
    const mesh = new THREE.Mesh(geo, basicMat(col, 0.7, true)); mesh.rotation.x = -PI / 2; mesh.position.set(x, 0.5, z); mesh.userData.ownGeo = true; addMesh(mesh);
    let r = o.r0 || 1.5, done = false;
    return addFx({ boss: b, update(dt) {
      r += (o.speed || 6.5) * dt; mesh.scale.set(r, r, 1);
      const pp = ppos(), d = hd(pp.x, pp.z, x, z);
      if (!done && Math.abs(d - r * 0.94) < 0.14 * r + 0.5 && (g == null || Math.abs(angDiff(ang({ x, z }, pp), g)) > half + 0.04)) {
        done = true;
        if (o.onTouch && o.onTouch(pp)) { /* géré */ } else if (!isRolling()) hurt(b, D(b, o.dmgK == null ? 1.0 : o.dmgK, ph), el);
      }
      return r > (o.max || 17);
    }, dispose() { disposeObj(mesh); geo.dispose(); } });
  }
  /** voile sombre (obscurité) sur l'arène */
  function darkness(b, op, dur, color) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), basicMat(color || 0x02010a, 0, false)); m.rotation.x = -PI / 2; m.position.y = 3.2; m.renderOrder = 5; m.userData.ownGeo = true; addMesh(m);
    let t = 0;
    return addFx({ boss: b, update(dt) { t += dt; const k = Math.min(1, t / 0.8, Math.max(0, (dur - t) / 0.8)); m.material.opacity = op * k; return t >= dur; }, dispose() { disposeObj(m); } });
  }
  function glowBoss(b, color, k) { setEyes(b, color, k || 3); }

  // =====================================================================
  //  v5 — MODULES de mécaniques exclusives
  // =====================================================================
  const ringPos = (n, R, off) => { const a = []; for (let i = 0; i < n; i++) { const t = (off || 0) + i / n * TAU; a.push([Math.sin(t) * R, Math.cos(t) * R]); } return a; };

  // ---------- LINKS : objets reliés au boss (racines, niches, bourgeons, canaux, fils) ----------
  // opts:{kind:'add'|'interact', model, n:[..], R, hp, armorPer, armorMin, armor, healPer, beam, regrow:[..], time, label,
  //       onOne:{stagger,chip,text}, onAll:{stagger,chip,text}, spawn:{every,max}, bloom:{time,heal,spawn}, refill:s, prop:'canal'|..., color}
  MODS.links = {
    init(b, st, m) { m.list = []; m.lastPhase = 0; m.fill = false; m.nextFill = 0; m.nextRegrow = 0; m.allDone = false; m.spawnT = S.time + 8; m.key = 'links' + (m.opts.key || ''); },
    update(b, dt, st, m, ph) {
      const o = m.opts, n = nByPhase(o.n, ph.n);
      if (m.lastPhase !== ph.n) { m.lastPhase = ph.n; m.fill = true; m.nextFill = S.time + (ph.n === 1 ? 0.8 : 1.8); }
      if (m.fill && S.time >= m.nextFill) {
        m.fill = false; m.allDone = false;
        m.list.forEach(l => linkKill(l)); m.list = [];
        const off = rnd(0, TAU), pos = ringPos(n, o.R || 8.5, off);
        pos.forEach((p, i) => m.list.push(linkMake(b, m, p[0], p[1], i)));
        if (o.label) say(b.pos, o.label, o.color || 0xffffff, 'lk' + m.key, 2);
        sfx('spawn');
      }
      let alive = 0;
      m.list.forEach(l => {
        if (l.alive) {
          if (l.kind === 'add' && l.e && l.e.dead) { l.alive = false; linkOne(b, st, m, l); }
          else if (l.kind === 'add' && l.e && o.bloom && S.time >= l.bloomAt) { bloomLink(b, m, l); }
        } else if (o.refill && l.refillAt && S.time >= l.refillAt) { linkRevive(b, m, l); }
        if (l.alive) alive++;
        if (l.beam) { if (l.alive) { const dx = b.pos.x - l.x, dz = b.pos.z - l.z; l.beam.set(l.x, l.z, Math.atan2(dx, dz), Math.hypot(dx, dz), 0.14, 1.6); l.beam.g.visible = true; } else l.beam.g.visible = false; }
        if (l.alive && l.e && l.e.pos && o.stick) { /* immobile */ }
      });
      m.alive = alive; st.links = st.links || {}; st.links[m.key] = alive;
      if (n > 0 && alive > 0) { setArmor(b, m.key, o.armor != null ? o.armor : Math.max(o.armorMin || 0.3, 1 - (o.armorPer || 0.2) * alive)); if (o.healPer) heal(b, o.healPer * alive * dt); } else setArmor(b, m.key, null);
      if (alive === 0 && n > 0 && !m.allDone && !m.fill && m.list.length) {
        m.allDone = true; const a = o.onAll || {};
        if (a.stagger) stagger(b, a.stagger); if (a.chip) dmgPct(b, a.chip); if (a.text) say(b.pos, a.text, o.color || 0xffffff, 'lka', 1);
        if (o.onAllFn) o.onAllFn(b, st, m);
        m.nextRegrow = S.time + nByPhase(o.regrow, ph.n) * 0.6;
      }
      if (o.regrow && !m.fill && alive < n && S.time >= m.nextRegrow && S.time >= st.staggerUntil && o.kind === 'add') {
        const dead = m.list.filter(l => !l.alive); if (dead.length) { m.nextRegrow = S.time + nByPhase(o.regrow, ph.n); const l = dead[0]; linkRespawn(b, m, l); }
      }
      if (o.spawn && alive > 0 && S.time >= m.spawnT) { m.spawnT = S.time + o.spawn.every; const cnt = S.fx.filter(f => f.add && f.add.__add && f.add.__add.minion && !f.add.dead).length; if (cnt < (o.spawn.max || 5)) { const l = m.list.filter(q => q.alive)[Math.floor(rnd(0, alive)) % alive]; if (l) { spawnMinions(b, 1, l.x, l.z).forEach(e => { e.__add = e.__add || {}; e.__add.minion = true; S.fx.push({ boss: b, add: e, update() { return !!e.dead; } }); }); vfx('summonCircle', l.x, l.z, o.color || 0xffffff, 1.5); } } }
    },
    stop(b, st, m) { m.list.forEach(l => linkKill(l)); m.list = []; setArmor(b, m.key, null); },
  };
  function linkMake(b, m, x, z, i) {
    const o = m.opts, l = { kind: o.kind || 'add', x, z, alive: true, i, bloomAt: S.time + (o.bloom ? o.bloom.time + i * 1.5 : 1e9) };
    if (o.beam != null) l.beam = beamMesh(o.beam);
    if (l.kind === 'add') { l.e = spawnAdd(b, o.model || 'boss_cristal', x, z, { hp: Math.max(8, b.pvMax * (o.hp || 0.04)), fire: !!o.fire, link: true, tint: o.color }); if (!l.e) l.alive = false; }
    else {
      const prop = PROPS[o.prop || 'canal'](o.color);
      l.it = addInteract(b, { x, z, r: o.ir || 1.9, time: o.time || 2, color: o.color, prop, fragile: !!o.fragile, onDone: () => { if (!l.alive) return; l.alive = false; l.refillAt = o.refill ? S.time + o.refill : 0; linkOne(b, state(b), m, l); } , enabled: () => l.alive });
      l.prop = prop;
    }
    return l;
  }
  function linkRespawn(b, m, l) { const o = m.opts; l.e = spawnAdd(b, o.model || 'boss_cristal', l.x, l.z, { hp: Math.max(8, b.pvMax * (o.hp || 0.04)), fire: !!o.fire, link: true }); l.alive = !!l.e; l.bloomAt = S.time + (o.bloom ? o.bloom.time : 1e9); }
  function linkRevive(b, m, l) { l.alive = true; l.refillAt = 0; if (l.prop && l.prop.visible === false) l.prop.visible = true; say({ x: l.x, z: l.z, y: 0 }, '↻', m.opts.color || 0xffffff, 'rf' + l.i, 1); }
  function linkKill(l) { if (l.beam) l.beam.dispose(); if (l.it) killInteract(l.it); if (l.e && !l.e.dead) killAdd(l.e); l.alive = false; }
  function linkOne(b, st, m, l) {
    const o = m.opts, a = o.onOne || {};
    vfx('explosion', l.x, l.z, o.color || 0xffffff, 2.2); sfx('boom');
    if (a.stagger) stagger(b, a.stagger, true); if (a.chip) dmgPct(b, a.chip);
    if (a.text) say({ x: l.x, z: l.z, y: 0 }, a.text, o.color || 0xffffff, 'lko' + l.i, 0.6);
    if (o.onOneFn) o.onOneFn(b, st, m, l);
  }
  function bloomLink(b, m, l) {
    const bl = m.opts.bloom; l.alive = false; if (l.e && !l.e.dead) killAdd(l.e);
    heal(b, bl.heal || 0.03); say({ x: l.x, z: l.z, y: 0 }, 'ÉCLOSION !', 0xff7ac8, 'bl' + l.i, 0.5); vfx('explosion', l.x, l.z, 0xff7ac8, 2.5);
    if (bl.spawn) spawnMinions(b, bl.spawn, l.x, l.z);
  }

  // ---------- TORCHES (forêt) : braises à ramasser ; le feu tue les racines ----------
  MODS.torches = {
    init(b, st, m) { m.next = S.time + 3; m.its = []; },
    update(b, dt, st, m, ph) {
      m.its = m.its.filter(i => !i.dead);
      if (m.its.length < (m.opts.n || 2) && S.time >= m.next) {
        m.next = S.time + (m.opts.every || 14);
        for (let k = 0; k < 8; k++) { const x = rnd(-9, 9), z = rnd(-9, 9); if (hd(x, z, b.pos.x, b.pos.z) < 5) continue; m.its.push(addInteract(b, { x, z, r: 1.7, time: 0.8, color: 0xff8a2a, prop: PROPS.braise(), once: true, onDone: (it) => { S.torchUntil = S.time + (m.opts.dur || 14); say(ppos(), 'TORCHE ! LE FEU CONSUME LES RACINES', 0xff8a2a, 'torch', 1); vfx('ring', it.x, it.z, 0xff8a2a, 3); disposeObj(it.g); } })); break; }
      }
      if (S.time < S.torchUntil && !m.glow) { m.glow = disc(0xff8a2a, 0.2, 1.6, 0, 0); }
      if (m.glow) { const pp = ppos(); m.glow.position.set(pp.x, 0.05, pp.z); m.glow.visible = S.time < S.torchUntil; }
    },
    stop(b, st, m) { if (m.glow) disposeObj(m.glow); S.torchUntil = 0; },
  };

  // ---------- ÉBOULEMENTS + ÉTAIS (mine) ----------
  MODS.cavein = {
    init(b, st, m) { m.etais = []; m.next = S.time + (nByPhase(m.opts.every, 1)) * 0.8; m.run = false; m.respawn = 0; for (let i = 0; i < (m.opts.etais || 3); i++) caveEtai(b, m); },
    update(b, dt, st, m, ph) {
      m.etais = m.etais.filter(e => !e.gone);
      if (m.etais.length < (m.opts.etais || 3) && S.time >= m.respawn && !m.run) { if (!m.respawn) m.respawn = S.time + 4; else { m.respawn = 0; caveEtai(b, m, true); } }
      if (!m.run && S.time >= m.next) { m.run = true; caveCollapse(b, m, ph, () => { m.run = false; m.next = S.time + nByPhase(m.opts.every, ph.n); }); }
    },
    stop(b, st, m) { m.etais.forEach(e => { e.gone = true; disposeObj(e.mesh); disposeObj(e.ring); }); m.etais = []; },
  };
  function caveEtai(b, m, announce) {
    let x = 0, z = 0;
    for (let k = 0; k < 12; k++) { x = rnd(-8.5, 8.5); z = rnd(-7, 7); if (hd(x, z, b.pos.x, b.pos.z) > 4 && m.etais.every(e => hd(e.x, e.z, x, z) > 6)) break; }
    const mesh = PROPS.etai(); mesh.position.set(x, 0, z); addMesh(mesh); const ring = disc(0xc8a24a, 0.13, m.opts.safeR || 2.6, x, z);
    const e = { x, z, hp: m.opts.hp || 3, mesh, ring, gone: false };
    m.etais.push(e); vfx('summonCircle', x, z, 0xc8a24a, 1.8); if (announce) say({ x, z, y: 0 }, 'ÉTAI DRESSÉ', 0xc8a24a, 'etai', 1);
    return e;
  }
  function caveCollapse(b, m, ph, done) {
    S.runners.push({ boss: b, h: { done: false }, wait: 0, it: (function* () {
      const R = m.opts.rockR || 3.0, step = 5.4, spots = [], discs = [];
      for (let gx = -11; gx <= 11; gx += step) for (let gz = -11; gz <= 11; gz += step) { const x = gx + rnd(-0.6, 0.6), z = gz + rnd(-0.6, 0.6); spots.push([x, z]); discs.push(disc(0xff5a3a, 0.14, R, x, z)); }
      say(b.pos, 'LE PLAFOND CRAQUE ! SOUS UN ÉTAI !', 0xc8a24a, 'cav', 1); sfx('bossRoar'); shake(0.4);
      try {
        const W = 2.3; for (let t = 0; t < W;) { t += S.dt; discs.forEach((d, i) => { d.userData.disc.material.opacity = 0.1 + 0.3 * (t / W); d.userData.setR(R * (0.6 + 0.4 * t / W)); }); if (((t * 10) | 0) % 5 === 0) shake(0.05); yield 0; }
        const pp = ppos(); let protectedP = false;
        m.etais.forEach(e => { if (hd(pp.x, pp.z, e.x, e.z) <= (m.opts.safeR || 2.6)) protectedP = true; });
        let hitP = false, bossHit = false;
        spots.forEach(([x, z]) => { if (hd(pp.x, pp.z, x, z) <= R + 0.3) hitP = true; if (hd(b.pos.x, b.pos.z, x, z) <= R + (b.r || 1.5) * 0.4) bossHit = true; });
        vfx('explosion', 0, 0, 0x8a6a4a, 14); sfx('boom'); shake(0.8);
        if (hitP) { if (protectedP) say(pp, 'ÉTAI ! ÉPARGNÉ', 0x7affd8, 'etp', 0.5); else if (!isRolling()) hurt(b, D(b, 1.6, ph), 'physique'); }
        const bpp = { x: b.pos.x, z: b.pos.z };
        const inSafe = m.etais.some(e => hd(bpp.x, bpp.z, e.x, e.z) <= (m.opts.safeR || 2.6));
        if (bossHit && !inSafe) { stagger(b, m.opts.buryT || 5, true); dmgPct(b, m.opts.buryChip || 0.06); say(b.pos, 'ENSEVELI !', 0xffe04a, 'bury', 1); vfx('explosion', b.pos.x, b.pos.z, 0xc8a24a, 4); }
        m.etais.forEach(e => { e.hp--; if (e.hp <= 0) { e.gone = true; vfx('explosion', e.x, e.z, 0x6b4a2a, 2.5); say({ x: e.x, z: e.z, y: 0 }, "L'ÉTAI CÈDE", 0xc8a24a, 'ec' + e.x, 0.5); disposeObj(e.mesh); disposeObj(e.ring); } });
        yield 0.5;
      } finally { discs.forEach(disposeObj); done(); }
    })() });
  }

  // ---------- POCHES DE GRISOU (mine) : gaz qui explose quand il est enflammé ----------
  MODS.gas = {
    init(b, st, m) { m.zs = []; m.next = S.time + 6; st.gas = m; },
    update(b, dt, st, m, ph) {
      m.zs = m.zs.filter(z => !z.gone);
      const want = nByPhase(m.opts.n, ph.n);
      if (m.zs.length < want && S.time >= m.next) { m.next = S.time + 7; const x = rnd(-9, 9), z = rnd(-9, 9); const mesh = disc(0x7bd648, 0.22, m.opts.r || 3.2, x, z); m.zs.push({ x, z, mesh, gone: false, born: S.time }); say({ x, z, y: 0 }, 'GRISOU', 0x7bd648, 'gas', 2); }
      m.zs.forEach(z => { z.mesh.userData.disc.material.opacity = 0.16 + 0.08 * Math.sin(S.time * 2 + z.x); });
      // feu sur le boss dans le gaz
      if (st.fireHit && S.time - st.fireHit < 0.2) { const z = m.zs.find(q => hd(b.pos.x, b.pos.z, q.x, q.z) <= (m.opts.r || 3.2) + 0.5); if (z) gasBoom(b, m, z, ph); st.fireHit = 0; }
    },
    stop(b, st, m) { m.zs.forEach(z => disposeObj(z.mesh)); m.zs = []; st.gas = null; },
  };
  function gasBoom(b, m, z, ph) {
    z.gone = true; disposeObj(z.mesh); const R = (m.opts.r || 3.2) + 1.2;
    vfx('explosion', z.x, z.z, 0xff8a2a, R); sfx('boom'); shake(0.6); say({ x: z.x, z: z.z, y: 0 }, 'GRISOU ENFLAMMÉ !', 0xff8a2a, 'gb', 0.5);
    const pp = ppos(); if (hd(pp.x, pp.z, z.x, z.z) <= R && !isRolling()) hurt(b, D(b, 1.5, ph), 'feu');
    if (hd(b.pos.x, b.pos.z, z.x, z.z) <= R + (b.r || 1.5)) { dmgPct(b, m.opts.chip || 0.08); stagger(b, 3.5); }
  }

  // ---------- BRASEROS (château) : lumière = vulnérabilité ----------
  MODS.braziers = {
    init(b, st, m) {
      const n = m.opts.n || 4; m.bs = ringPos(n, m.opts.R || 9.6, PI / n).map((p, i) => {
        const prop = PROPS.brazier(true); const br = { x: p[0], z: p[1], lit: true, prop, i };
        br.it = addInteract(b, { x: p[0], z: p[1], r: 2.0, time: m.opts.relight || 1.5, color: 0xffb04a, prop, enabled: () => !br.lit, onDone: () => { br.lit = true; prop.userData.setLit(true); say({ x: br.x, z: br.z, y: 0 }, 'RALLUMÉ', 0xffb04a, 'rl' + i, 0.4); vfx('ring', br.x, br.z, 0xffb04a, 4); sfx('spawn'); } });
        br.halo = disc(0xffb04a, 0.1, m.opts.lightR || 4.6, p[0], p[1]);
        return br;
      });
      m.next = S.time + 9; m.dot = 0; st.bra = m;
      m.snuff = (k) => { const lit = m.bs.filter(x => x.lit); for (let i = 0; i < k && lit.length; i++) { const br = lit.splice(Math.floor(rnd(0, lit.length)) % lit.length, 1)[0]; snuffBr(b, m, br); } };
      m.litCount = () => m.bs.filter(x => x.lit).length;
      m.inLight = () => { const pp = ppos(); return m.bs.some(x => x.lit && hd(pp.x, pp.z, x.x, x.z) <= (m.opts.lightR || 4.6)); };
    },
    update(b, dt, st, m, ph) {
      const n = m.bs.length, lit = m.litCount();
      m.bs.forEach(br => { br.halo.visible = br.lit; br.halo.userData.disc.material.opacity = 0.08 + 0.04 * Math.sin(S.time * 3 + br.i); });
      const f = lit / n; setArmor(b, 'braz', f >= 0.75 ? 1 : f >= 0.5 ? 0.45 : f > 0.2 ? 0.14 : 0.06);
      if (b.mesh && b.mesh.userData) b.mesh.userData.litLevel = f;
      if (lit <= 1) heal(b, 0.004 * dt);
      if (S.time >= m.next) { m.next = S.time + nByPhase(m.opts.snuff, ph.n); if (!m.pendingSnuff) m.snuff(ph.n >= 3 ? 2 : 1); }
      m.dot -= dt;
      if (lit <= 1 && !m.inLight() && m.dot <= 0) { m.dot = 1.2; hurt(b, Math.max(1, Math.round(D(b, 0.2))), 'ombre'); say(ppos(), 'TÉNÈBRES…', 0x8a3cff, 'dk2', 2); }
    },
    stop(b, st, m) { m.bs.forEach(br => { killInteract(br.it); disposeObj(br.halo); }); setArmor(b, 'braz', null); st.bra = null; },
  };
  function snuffBr(b, m, br) {
    br.lit = false; const prop = br.prop;
    vfx('shadowRise', br.x, br.z, 0x8a3cff, 2); sfx('error'); say({ x: br.x, z: br.z, y: 0 }, 'ÉTEINT', 0x8a3cff, 'sn' + br.i, 0.4);
    prop.userData.setLit(false);
  }

  // ---------- CHANT + MARÉE (cathédrale) ----------
  MODS.chant = {
    init(b, st, m) {
      m.bells = ringPos(m.opts.bells || 3, 8.8, rnd(0, TAU)).map((p, i) => { const br = { x: p[0], z: p[1], ready: true, i }; br.prop = PROPS.cloche(); br.it = addInteract(b, { x: p[0], z: p[1], r: 2.0, time: 0.9, color: 0x6ad0ff, prop: br.prop, enabled: () => br.ready && m.singing, onDone: () => bellRing(b, m, br) }); return br; });
      m.next = S.time + 12; m.singing = false; m.R = m.opts.water.from; m.mesh = null; m.dot = 0; st.chant = m;
    },
    update(b, dt, st, m, ph) {
      if (!m.singing && S.time >= m.next) chantStart(b, m, ph);
      const target = nByPhase(m.opts.water.to, ph.n); m.R += clamp(target - m.R, -0.8 * dt, 0.8 * dt);
      if (m.R < 13.6) { if (!m.mesh) { const g = new THREE.RingGeometry(1, 4, 64); const me = new THREE.Mesh(g, basicMat(0x1a5a8a, 0.55)); me.rotation.x = -PI / 2; me.userData.ownGeo = true; addMesh(me); m.mesh = me; } m.mesh.scale.set(m.R, m.R, 1); m.mesh.position.y = 0.3; m.mesh.material.opacity = 0.5 + 0.1 * Math.sin(S.time * 2); }
      const pp = ppos(); m.dot -= dt;
      if (Math.hypot(pp.x, pp.z) > m.R && m.dot <= 0) { m.dot = 0.6; hurt(b, Math.max(1, Math.round(D(b, 0.13))), 'glace'); say(pp, 'NOYADE', 0x6ad0ff, 'drown', 1.5); slowPlayer(0.7, 0.8); }
    },
    stop(b, st, m) { m.bells.forEach(x => killInteract(x.it)); if (m.mesh) disposeObj(m.mesh); st.chant = null; },
  };
  function chantStart(b, m, ph) {
    m.singing = true; m.bells.forEach(x => { x.ready = true; });
    S.runners.push({ boss: b, h: { done: false }, wait: 0, it: (function* () {
      say(b.pos, 'ELLE CHANTE… SONNEZ UNE CLOCHE !', 0x6ad0ff, 'sing', 1); sfx('bossRoar');
      const tl = tele('circle', 16, b.pos.x, b.pos.z), ring = disc(0x6ad0ff, 0.12, 14, b.pos.x, b.pos.z);
      try {
        for (let t = 0; t < 1.4;) { t += S.dt; setProg(tl, t / 1.4); setAnim(b, t / 1.4, 0); yield 0; }
        const dur = nByPhase(m.opts.dur, ph.n); let el = 0, caught = false; m.broken = false;
        while (el < dur && m.singing && !b.dead) {
          el += S.dt; setAnim(b, 0.6, 0); const pp = ppos(), d = hd(pp.x, pp.z, b.pos.x, b.pos.z);
          ring.position.set(b.pos.x, 0.05, b.pos.z); ring.userData.setR(14 - 2 * (el % 1));
          if (d > (b.r || 2) + 1.5 && !isRolling()) { const k = Math.min(3.4 * S.dt, d - (b.r || 2) - 1) / d; shove((b.pos.x - pp.x) * k, (b.pos.z - pp.z) * k); }
          else if (d <= (b.r || 2) + 1.7 && !caught && !isRolling()) { caught = true; hurt(b, D(b, 2.0, ph), 'glace'); stunPlayer(1.2); say(pp, 'ENGLOUTI !', 0x6ad0ff, 'eng', 0.5); break; }
          yield 0;
        }
      } finally { untele(tl); disposeObj(ring); m.singing = false; m.next = S.time + nByPhase(m.opts.every, ph.n); }
    })() });
  }
  function bellRing(b, m, br) {
    br.ready = false; sfx('bossRoar'); vfx('ring', br.x, br.z, 0x6ad0ff, 8); say({ x: br.x, z: br.z, y: 0 }, 'DONG !', 0xc8a24a, 'dong', 0.4);
    if (m.singing) { m.singing = false; stagger(b, 5); say(b.pos, 'LE CHANT SE BRISE !', 0x7affd8, 'cb', 1); }
  }

  // ---------- PYLÔNES (asile) : détourner les arcs vers les pylônes ----------
  MODS.pylons = {
    init(b, st, m) { m.ps = []; for (let i = 0; i < (m.opts.n || 3); i++) pylonMake(b, m, i); st.pyl = m; m.breaker = null; setArmor(b, 'blouse', m.opts.armor || 0.5);
      m.breaker = addInteract(b, { x: 0, z: 10.5, r: 1.8, time: 1.2, color: 0xff4a4a, prop: PROPS.disjoncteur(), enabled: () => !!m.dark, onDone: () => { m.dark = false; say(ppos(), 'LUMIÈRE !', 0xfff2a0, 'lum', 1); } }); m.dark = false; },
    update(b, dt, st, m) {
      m.ps.forEach(p => { if (p.core) { p.core.material.emissiveIntensity = 0.6 + 1.6 * p.charge; p.core.scale.setScalar(0.35 + 0.25 * p.charge); } p.charge = Math.max(0, p.charge - dt * 0.03); });
      m.ps.filter(p => p.gone && S.time >= p.back).forEach(p => { p.gone = false; p.mesh.visible = true; p.charge = 0; const a = arenaRand(8); p.x = a[0]; p.z = a[1]; p.mesh.position.set(p.x, 0, p.z); vfx('summonCircle', p.x, p.z, 0xb48cff, 1.6); });
      S.pylons = m.ps.filter(p => !p.gone);
    },
    stop(b, st, m) { m.ps.forEach(p => disposeObj(p.mesh)); S.pylons = []; setArmor(b, 'blouse', null); if (m.breaker) killInteract(m.breaker); },
  };
  function pylonMake(b, m, i) { const a = ringPos(m.opts.n || 3, 7, rnd(0, TAU))[i]; const mesh = PROPS.pylone(); mesh.position.set(a[0], 0, a[1]); addMesh(mesh); m.ps.push({ x: a[0], z: a[1], mesh, core: mesh.userData.core, charge: 0, gone: false, back: 0 }); }
  /** arc de foudre : renvoie la longueur utile (coupée par un pylône) */
  function arcCut(b, m, ox, oz, a, len, dt) {
    const dx = Math.sin(a), dz = Math.cos(a); let best = len, hit = null;
    (S.pylons || []).forEach(p => { const t = (p.x - ox) * dx + (p.z - oz) * dz; if (t > 0 && t < best && Math.abs((p.x - ox) * dz - (p.z - oz) * dx) < 1.1) { best = t; hit = p; } });
    if (hit && dt) { hit.charge += dt * 0.45; if (hit.charge >= 1) pylonOverload(b, m, hit); }
    return best;
  }
  function pylonOverload(b, m, p) {
    p.gone = true; p.back = S.time + 12; p.mesh.visible = false; vfx('explosion', p.x, p.z, 0xb48cff, 5); sfx('boom'); shake(0.6);
    stagger(b, m.opts.stagger || 7); dmgPct(b, m.opts.chip || 0.04); say(b.pos, 'COURT-CIRCUIT !', 0xb48cff, 'cc', 1);
  }

  // ---------- FROID + CHALEUR (nécropole) ----------
  MODS.cold = {
    init(b, st, m) {
      m.bs = ringPos(3, 8.5, rnd(0, TAU)).map((p, i) => { const prop = PROPS.brazier(true); const br = { x: p[0], z: p[1], lit: true, until: 0, prop }; br.it = addInteract(b, { x: p[0], z: p[1], r: 1.8, time: 1.2, color: 0x9ae0ff, prop, enabled: () => !br.lit, onDone: () => { br.lit = true; prop.userData.setLit(true); } }); br.halo = disc(0xffb04a, 0.1, m.opts.warmR || 4.4, p[0], p[1]); return br; });
      m.cold = 0; m.melt = 0; m.tint = disc(0x9ae0ff, 0, 1.4, 0, 0); st.cold = m;
      m.snuffOne = () => { const l = m.bs.filter(x => x.lit); if (l.length) { const br = l[Math.floor(rnd(0, l.length)) % l.length]; br.lit = false; br.until = S.time + 9; br.prop.userData.setLit(false); say({ x: br.x, z: br.z, y: 0 }, 'BRASERO ÉTEINT', 0x9ae0ff, 'bs', 0.5); } };
    },
    update(b, dt, st, m, ph) {
      m.bs.forEach(br => { br.halo.visible = br.lit; if (!br.lit && br.until && S.time >= br.until) { br.lit = true; br.prop.userData.setLit(true); br.until = 0; } });
      const pp = ppos(), pl = P(), warm = m.bs.some(x => x.lit && hd(pp.x, pp.z, x.x, x.z) <= (m.opts.warmR || 4.4));
      m.cold = clamp(m.cold + (warm ? -14 : (m.opts.rate || 3.4) + ph.n * 0.8) * dt, 0, 100);
      if (m.cold >= 100) { m.cold = 60; hurt(b, D(b, 1.4, ph), 'glace'); stunPlayer(1.4); say(pp, 'GELÉ !', 0x9ae0ff, 'frz', 0.5); }
      else if (m.cold >= 85) slowPlayer(0.5, 0.4); else if (m.cold >= 60) slowPlayer(0.75, 0.4);
      m.tint.position.set(pp.x, 0.06, pp.z); m.tint.userData.disc.material.opacity = 0.35 * m.cold / 100; m.tint.userData.setR(1.0 + 0.6 * m.cold / 100);
      if (((m.cold / 25) | 0) !== m.lastQ) { m.lastQ = (m.cold / 25) | 0; if (m.lastQ >= 2) say(pp, 'FROID ' + Math.round(m.cold) + '%', 0x9ae0ff, 'cold', 1); }
      // coque de glace : fond si le boss se tient au chaud
      const bw = m.bs.some(x => x.lit && hd(b.pos.x, b.pos.z, x.x, x.z) <= (m.opts.warmR || 4.4) + 0.6);
      m.melt = clamp(m.melt + (bw ? 26 : -8) * dt, 0, 100);
      if (m.melt >= 100) { m.melt = 0; stagger(b, 6); say(b.pos, 'LA GLACE FOND !', 0xffb04a, 'melt', 1); }
      setArmor(b, 'shell', 0.42); if (b.mesh && b.mesh.userData) b.mesh.userData.melt = m.melt / 100;
    },
    stop(b, st, m) { m.bs.forEach(br => { killInteract(br.it); disposeObj(br.halo); }); disposeObj(m.tint); setArmor(b, 'shell', null); st.cold = null; },
  };

  // ---------- LAVE QUI MONTE + CHAÎNES (abîme) ----------
  MODS.lavarise = {
    init(b, st, m) { m.state = 'calm'; m.t = S.time + (m.opts.first || 12); m.isl = []; m.mesh = null; m.dot = 0; st.lava = m; m.leash = m.opts.leash || [99]; m.lastPhase = 1; },
    update(b, dt, st, m, ph) {
      if (m.lastPhase !== ph.n) { m.lastPhase = ph.n; if (m.state === 'calm') m.t = Math.min(m.t, S.time + 2.5); sfx('bossRoar'); shake(0.9); vfx('explosion', b.pos.x, b.pos.z, 0xff5a1a, 9); }
      const L = nByPhase(m.leash, ph.n); if (L < 90) { const dx = b.pos.x, dz = b.pos.z + 3, d = Math.hypot(dx, dz); if (d > L) { b.pos.x = dx / d * L; b.pos.z = dz / d * L - 3; } }
      setArmor(b, 'chaine', L < 90 ? 0.5 : null);
      if (m.state === 'calm' && S.time >= m.t) { m.state = 'warn'; m.t = S.time + (m.opts.warn || 3); lavaIslands(b, m, ph); say(b.pos, 'LA LAVE MONTE ! REJOIGNEZ UN ÎLOT !', 0xff5a1a, 'lv', 1); sfx('bossRoar'); }
      else if (m.state === 'warn') { m.isl.forEach(i => { i.ring.userData.disc.material.opacity = 0.25 + 0.2 * Math.sin(S.time * 10); }); if (S.time >= m.t) { m.state = 'high'; m.t = S.time + (m.opts.up || 7); lavaFloor(m, true); shake(0.5); } }
      else if (m.state === 'high') { setArmor(b, 'lava', 0.1); const pp = ppos(); m.dot -= dt; if (!m.isl.some(i => hd(pp.x, pp.z, i.x, i.z) <= i.r) && m.dot <= 0 && !isRolling()) { m.dot = 0.5; hurt(b, Math.max(1, Math.round(D(b, 0.55, ph))), 'feu'); say(pp, 'LAVE !', 0xff5a1a, 'lav', 1); } if (S.time >= m.t) { m.state = 'ebb'; m.t = S.time + (m.opts.ebb || 8); lavaFloor(m, false); m.isl.forEach(i => disposeObj(i.ring)); m.isl = []; setArmor(b, 'lava', null); stagger(b, m.opts.ebb || 8, true); say(b.pos, 'CROÛTE FISSURÉE ! FRAPPEZ !', 0xffe04a, 'ebb', 1); } }
      else if (m.state === 'ebb' && S.time >= m.t) { m.state = 'calm'; m.t = S.time + nByPhase(m.opts.cycle, ph.n); }
      if (m.mesh && m.mesh.visible) m.mesh.material.opacity = 0.42 + 0.08 * Math.sin(S.time * 3);
    },
    stop(b, st, m) { m.isl.forEach(i => disposeObj(i.ring)); if (m.mesh) disposeObj(m.mesh); setArmor(b, 'lava', null); setArmor(b, 'chaine', null); st.lava = null; },
  };
  function lavaIslands(b, m, ph) {
    m.isl.forEach(i => disposeObj(i.ring)); m.isl = [];
    const n = nByPhase(m.opts.islands, ph.n), r = nByPhase(m.opts.isl, ph.n);
    for (let k = 0; k < 40 && m.isl.length < n; k++) { const x = rnd(-9, 9), z = rnd(-9, 9); if (m.isl.every(i => hd(i.x, i.z, x, z) > r * 2 + 1.5)) m.isl.push({ x, z, r, ring: disc(0xffe04a, 0.3, r, x, z) }); }
  }
  function lavaFloor(m, on) {
    if (on && !m.mesh) { const me = new THREE.Mesh(new THREE.PlaneGeometry(29, 29), basicMat(0xff3a0a, 0.45, true)); me.rotation.x = -PI / 2; me.position.y = 0.04; me.userData.ownGeo = true; addMesh(me); m.mesh = me; }
    if (m.mesh) m.mesh.visible = on;
    if (on) m.isl.forEach(i => { i.ring.userData.disc.material.opacity = 0.9; i.ring.position.y = 0.08; i.ring.userData.disc.material.color.setHex(0x4a3a30); i.ring.userData.rim.material.color.setHex(0xffe04a); });
  }

  // ---------- CONSTELLATION + OUBLI (observatoire) ----------
  MODS.constellation = {
    init(b, st, m) { m.next = S.time + 14; m.run = false; m.wedges = []; m.lastPhase = 1; st.cons = m; setArmor(b, 'paupiere', m.opts.armor || 0.4); m.dot = 0; },
    update(b, dt, st, m, ph) {
      if (!m.run && S.time >= m.next) { m.run = true; starPuzzle(b, m, ph); }
      if (m.lastPhase !== ph.n) { m.lastPhase = ph.n; if (ph.n >= 2) addWedge(b, m, ph.n); }
      m.dot -= dt; const pp = ppos(), a = Math.atan2(pp.x, pp.z);
      if (m.wedges.some(w => Math.abs(angDiff(a, w.a)) < w.half) && Math.hypot(pp.x, pp.z) > 2.5 && m.dot <= 0) { m.dot = 0.5; hurt(b, Math.max(1, Math.round(D(b, 0.5, ph))), 'ombre'); say(pp, "L'OUBLI VOUS EFFACE", 0x8a3cff, 'oub', 1.5); }
    },
    stop(b, st, m) { m.wedges.forEach(w => disposeObj(w.mesh)); setArmor(b, 'paupiere', null); st.cons = null; },
  };
  function addWedge(b, m, n) {
    const half = 0.5, a = rnd(0, TAU), g = new THREE.CircleGeometry(15, 24, a - PI / 2 - half, half * 2);
    const mesh = new THREE.Mesh(g, basicMat(0x08020f, 0.7)); mesh.rotation.x = -PI / 2; mesh.position.y = 0.2; mesh.userData.ownGeo = true; addMesh(mesh);
    m.wedges.push({ a, half, mesh });
    say(b.pos, "UNE ÉTOILE S'ÉTEINT. LA SALLE S'EFFACE.", 0x8a3cff, 'wedge', 1);
  }
  function starPuzzle(b, m, ph) {
    S.runners.push({ boss: b, h: { done: false }, wait: 0, it: (function* () {
      const N = nByPhase(m.opts.n, ph.n), pts = [], its = []; let cur = 0, ok = false;
      const base = rnd(0, TAU);
      for (let i = 0; i < N; i++) { const a = base + i / N * TAU + rnd(-0.2, 0.2), r = rnd(5, 10.5); pts.push([Math.sin(a) * r, Math.cos(a) * r]); }
      const line = [];
      pts.forEach((p, i) => { const prop = PROPS.etoile(i === 0 ? 0xffd23a : 0x6a7aa8); its.push(addInteract(b, { x: p[0], z: p[1], r: 1.6, time: 0.25, color: 0xffd23a, prop, enabled: () => i === cur, onDone: () => { if (i === cur) { cur++; vfx('ring', p[0], p[1], 0xffd23a, 3); sfx('upgrade'); if (pts[cur]) its[cur].g.children[0] && its[cur].g.children[0].children[0] && its[cur].g.children[0].children[0].material.color.setHex(0xffd23a); } } })); });
      say(b.pos, 'ALIGNEMENT ! TOUCHEZ LES ÉTOILES DANS L\'ORDRE (DORÉE D\'ABORD)', 0xffd23a, 'cons', 1); sfx('bossRoar');
      try {
        const T = 5 + N * 2.6; for (let t = 0; t < T && cur < N && !b.dead;) { t += S.dt; if (its[cur]) { its[cur].g.rotation.y += S.dt * 3; } yield 0; }
        ok = cur >= N;
        if (ok) { stagger(b, 8); say(b.pos, 'ÉCLIPSE ! L\'ŒIL SE FERME', 0xffd23a, 'ecl', 1); }
        else { say(b.pos, 'TROP TARD… COMÈTES !', 0xff4a4a, 'comet', 1); for (let i = 0; i < 7; i++) { const pp = ppos(); strikeCircle(b, cl(pp.x + rnd(-4, 4)), cl(pp.z + rnd(-4, 4)), 2.2, 1.2, D(b, 1.1, ph), 'ombre', { fall: true, sound: 'boom' }); yield 0.3; } }
      } finally { its.forEach(killInteract); m.run = false; m.next = S.time + nByPhase(m.opts.every, ph.n); }
    })() });
  }

  // ---------- RÉASSEMBLAGE (catacombes) ----------
  MODS.reassemble = {
    init(b, st, m) { m.used = 0; m.until = 0; },
    update(b, dt, st, m, ph) {
      const links = st.links && (st.links.linksniche || 0);
      if (S.time < m.until) { b.pv = Math.min(b.pvMax * 0.3, b.pv + b.pvMax * 0.05 * dt); setArmor(b, 'pile', 0.03); return; } else setArmor(b, 'pile', null);
      if (links > 0 && m.used < 2 && b.pv <= b.pvMax * 0.06 && !b.dead) { m.used++; m.until = S.time + 3.5; say(b.pos, 'LES OS SE RÉASSEMBLENT !', 0xd8d0c0, 'reas', 1); vfx('shadowRise', b.pos.x, b.pos.z, 0xd8d0c0, 4); sfx('bossRoar'); stagger(b, 0.1, true); }
    },
  };

  // ---------- PULSATIONS (jardin) ----------
  MODS.pulse = {
    init(b, st, m) { m.next = S.time + 4; },
    update(b, dt, st, m, ph) { if (S.time >= m.next) { m.next = S.time + nByPhase(m.opts.every, ph.n); ringWave(b, b.pos.x, b.pos.z, { color: 0xff4a8a, el: 'poison', speed: 7, dmgK: 0.7, ph }); sfx('hit'); if (b.mesh && b.mesh.userData) b.mesh.userData.beat = S.time; } },
  };
  // ---------- VAMPIRISME (comtesse) ----------
  MODS.vamp = { init(b, st, m) { st.vamp = m.opts.frac || 0.02; }, update() { }, stop(b, st) { st.vamp = 0; } };

  // =====================================================================
  //  v5 — FABRIQUES D'ATTAQUES (paramétrées) + ATTAQUES EXCLUSIVES
  // =====================================================================
  const elOf = (b, o) => (o && o.el) || (b.def && b.def.element) || 'physique';
  const colOf = (b, o) => (o && o.color != null ? o.color : elCol(b));
  /** éventail de lignes */
  function fanLines(id, o) {
    attack(id, o.w || 1.0, function* (b, api, ph) {
      const sp = spd(ph); yield* windup(b, ph, o.w || 1.0);
      const pp = ppos(), base = ang(b.pos, pp), n = typeof o.n === 'function' ? o.n(ph) : o.n, el = elOf(b, o); face(b, base);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * (o.spread || 0.35) + (o.jit ? rnd(-o.jit, o.jit) : 0);
        strikeLine(b, b.pos.x, b.pos.z, a, o.len || 22, o.width || 1.6, (o.delay || 1.0) / sp, D(b, o.dmg || 1.0, ph), el, { sound: o.sound || 'hit', delay: i * (o.seq || 0.12) });
      }
      setAnim(b, 0, 1); yield (o.rest || 1.6) + n * (o.seq || 0.12);
    }, o.desc);
  }
  /** barrage de cercles : where = 'player'|'random'|'ring'|'trail' */
  function barrage(id, o) {
    attack(id, o.w || 0.9, function* (b, api, ph) {
      const sp = spd(ph); yield* windup(b, ph, o.w || 0.9);
      const n = typeof o.n === 'function' ? o.n(ph) : o.n, el = elOf(b, o), pp = ppos(), a0 = ang(b.pos, pp);
      for (let i = 0; i < n; i++) {
        let x, z;
        if (o.where === 'random') { x = rnd(-11, 11); z = rnd(-11, 11); if (i === 0) { x = pp.x; z = pp.z; } }
        else if (o.where === 'ring') { const a = i / n * TAU + rnd(0, 0.4), r = o.ring || 6; x = b.pos.x + Math.sin(a) * r; z = b.pos.z + Math.cos(a) * r; }
        else if (o.where === 'trail') { const d = (i + 1) * (o.step || 2.6); x = b.pos.x + Math.sin(a0) * d; z = b.pos.z + Math.cos(a0) * d; }
        else if (o.where === 'around') { const a = i / n * TAU, r = o.ring || 4.5, q = ppos(); x = q.x + Math.sin(a) * r; z = q.z + Math.cos(a) * r; }
        else { const q = ppos(); x = q.x + (i ? rnd(-3.5, 3.5) : 0); z = q.z + (i ? rnd(-3.5, 3.5) : 0); }
        const zo = o.zone;
        strikeCircle(b, cl(x), cl(z), o.r || 2.2, (o.delay || 1.1) / Math.sqrt(sp), D(b, o.dmg || 1.0, ph), el, { fall: !!o.fall, sound: o.sound || 'boom', vfx: o.vfx, onHit: zo ? ((xx, zz) => { zone(b, xx, zz, zo.r || (o.r || 2.2), zo.dur || 8, { kind: zo.kind || 'dark', dps: zo.dps || 0.3, el: zo.el || el, color: zo.color != null ? zo.color : EL[el], slow: zo.slow || 0, op: 0.35 }); limitZones(b, zo.kind || 'dark', zo.max || 8); }) : null });
        yield (o.gap || 0.2) / sp;
      }
      setAnim(b, 0, 1); yield o.rest || 1.5;
    }, o.desc);
  }
  /** volée d'orbes (radiale ou éventail) */
  function volley(id, o) {
    attack(id, o.w || 0.9, function* (b, api, ph) {
      yield* windup(b, ph, o.w || 0.9);
      const n = typeof o.n === 'function' ? o.n(ph) : o.n, pp = ppos(), base = ang(b.pos, pp), el = elOf(b, o);
      const snuff = o.snuffByLight ? ((x, z) => { const bm = b.__ba && b.__ba.bra; return !!(bm && bm.bs.some(q => q.lit && hd(x, z, q.x, q.z) < (bm.opts.lightR || 4.6) * 0.6)); }) : null;
      for (let i = 0; i < n; i++) {
        const a = o.radial ? i / n * TAU + rnd(0, 0.3) : base + (i - (n - 1) / 2) * (o.spread || 0.3), v = (o.speed || 5) * (1 + 0.1 * (ph.n - 1));
        orb(b, { x: b.pos.x + Math.sin(a) * 1.5, z: b.pos.z + Math.cos(a) * 1.5, vx: Math.sin(a) * v, vz: Math.cos(a) * v, r: o.r || 0.7, life: o.life || 4.5, dmgK: o.dmg || 0.7, el, color: o.color, size: o.size || 0.55, homing: o.homing || 0, y: o.y, spin: true, snuff, ph });
        if (o.seq) yield o.seq;
      }
      setAnim(b, 0, 1); yield o.rest || 1.5;
    }, o.desc);
  }
  /** anneaux avec brèche (ou sans) */
  function rings(id, o) {
    attack(id, o.w || 1.0, function* (b, api, ph) {
      yield* windup(b, ph, o.w || 1.0);
      const n = typeof o.n === 'function' ? o.n(ph) : o.n, sp = spd(ph);
      for (let i = 0; i < n; i++) { const g = o.gap === false ? null : ang(b.pos, ppos()); ringWave(b, b.pos.x, b.pos.z, { gap: g, half: o.half || 0.5, color: o.color != null ? o.color : elCol(b), el: elOf(b, o), speed: (o.speed || 6.5) * sp, dmgK: o.dmg || 1.0, ph }); sfx('fire'); setAnim(b, 0, 1); yield (o.every || 0.9) / sp; }
      yield o.rest || 1.3;
    }, o.desc);
  }
  /** mur qui balaie l'arène avec un trou */
  function wallAttack(id, o) {
    attack(id, 1.0, function* (b, api, ph, h) {
      const sp = spd(ph), el = elOf(b, o), col = colOf(b, o), walls = typeof o.walls === 'function' ? o.walls(ph) : (o.walls || 1);
      for (let w = 0; w < walls; w++) {
        const axisZ = w === 0 ? rnd() < 0.5 : !h.axis; h.axis = axisZ;
        const fwd = rnd() < 0.5 ? 1 : -1, gap = rnd(-7, 7), gw = o.gap || 5.4, start = -fwd * (HALF - 0.5);
        const segs = [[-HALF, gap - gw / 2], [gap + gw / 2, HALF]];
        const tls = segs.map(([a, c]) => axisZ ? tele('line', { length: c - a, width: 1.4 }, a, start, PI / 2) : tele('line', { length: c - a, width: 1.4 }, start, a, 0));
        const meshes = segs.map(() => { const m = new THREE.Mesh(shared().box, basicMat(col, 0.75, true)); addMesh(m); m.visible = false; return m; });
        try {
          for (let t = 0; t < 1.2 / sp;) { t += S.dt; setAnim(b, t, 0); tls.forEach(m => setProg(m, t / (1.2 / sp))); yield 0; }
          tls.forEach(untele); setAnim(b, 0, 1); sfx(o.sound || 'fire');
          let pos = start, hit = 0; const v = (o.speed || 3.8) * sp;
          while ((fwd > 0 && pos < HALF) || (fwd < 0 && pos > -HALF)) {
            pos += fwd * v * S.dt; hit -= S.dt; const pp = ppos();
            segs.forEach(([a, c], i) => {
              const m = meshes[i]; m.visible = true; const len = c - a;
              if (axisZ) { m.position.set((a + c) / 2, 0.9, pos); m.scale.set(len, o.h || 1.8, 1.0); } else { m.position.set(pos, 0.9, (a + c) / 2); m.scale.set(1.0, o.h || 1.8, len); }
              const px = axisZ ? pp.x : pp.z, pq = axisZ ? pp.z : pp.x;
              if (hit <= 0 && px >= a - 0.2 && px <= c + 0.2 && Math.abs(pq - pos) < 0.9) { hurt(b, D(b, o.dmg || 1.3, ph), el); if (o.push) shove(axisZ ? 0 : fwd * o.push, axisZ ? fwd * o.push : 0); hit = 0.6; }
            });
            yield 0;
          }
        } finally { tls.forEach(untele); meshes.forEach(disposeObj); }
        yield 0.5;
      }
      setAnim(b, 0, 0); yield 0.4;
    }, o.desc);
  }
  /** faisceaux rotatifs (carrousel, moulin) */
  function spokes(id, o) {
    attack(id, 1.1, function* (b, api, ph) {
      const sp = spd(ph), n = typeof o.n === 'function' ? o.n(ph) : o.n, col = colOf(b, o), W = 1.1 / sp, tls = [], beams = [];
      for (let i = 0; i < n; i++) { tls.push(tele('line', { length: 20, width: 0.8 }, b.pos.x, b.pos.z, i / n * TAU)); beams.push(beamMesh(col)); }
      const spin = (rnd() < 0.5 ? -1 : 1) * (o.spin || 0.7) * sp; let a0 = rnd(0, TAU);
      try {
        let t = 0; while (t < W) { t += S.dt; setAnim(b, t / W, 0); tls.forEach((m, i) => { if (m) { m.position.set(b.pos.x, 0.05, b.pos.z); m.rotation.y = a0 + i / n * TAU; setProg(m, t / W); } }); yield 0; }
        tls.forEach(untele); sfx('fire');
        const dur = (o.dur || 3.6) / sp; let el = 0, hit = 0;
        while (el < dur) { el += S.dt; hit -= S.dt; const pp = ppos(); for (let i = 0; i < n; i++) { const a = a0 + el * spin + i / n * TAU, len = rayCut(b.pos.x, b.pos.z, a, 20, S.dt); beams[i].set(b.pos.x, b.pos.z, a, len, 0.9); if (hit <= 0 && distSeg(pp.x, pp.z, b.pos.x, b.pos.z, b.pos.x + Math.sin(a) * len, b.pos.z + Math.cos(a) * len) < 0.8 && !isRolling()) { hurt(b, D(b, o.dmg || 0.7, ph), elOf(b, o)); hit = 0.4; } } setAnim(b, 0, 1); yield 0; }
      } finally { tls.forEach(untele); beams.forEach(x => x.dispose()); setAnim(b, 0, 0); }
      yield 0.6;
    }, o.desc);
  }
  /** charge en ligne droite avec fenêtre d'étourdissement */
  function dashAttack(id, o) {
    attack(id, 0.9, function* (b, api, ph) {
      const sp = spd(ph), pp = ppos(), a = ang(b.pos, pp), len = o.len || 14, tl = tele('line', { length: len, width: o.width || 2.4 }, b.pos.x, b.pos.z, a);
      try { face(b, a); const W = (o.w || 0.9) / sp; for (let t = 0; t < W;) { t += S.dt; setAnim(b, t / W, 0); tl.position.set(b.pos.x, 0.05, b.pos.z); setProg(tl, t / W); yield 0; } } finally { untele(tl); }
      let d = 0, hitDone = false; const v = (o.speed || 19) * sp; sfx('dash');
      while (d < len) { const step = v * S.dt; d += step; b.pos.x += Math.sin(a) * step; b.pos.z += Math.cos(a) * step; clampBoss(b); const p2 = ppos(); if (!hitDone && hd(p2.x, p2.z, b.pos.x, b.pos.z) < (b.r || 1.5) + 0.7 && !isRolling()) { hitDone = true; hurt(b, D(b, o.dmg || 1.3, ph), elOf(b, o)); shove(Math.sin(a + PI / 2) * 1.4, Math.cos(a + PI / 2) * 1.4); shake(0.3); } vfx('ring', b.pos.x, b.pos.z, colOf(b, o), 0.8); setAnim(b, 0, 1); yield 0; }
      if (o.crash) { shake(0.5); sfx('slam'); }
      stagger(b, o.stag || 1.2, true); yield o.stag || 1.2;
    }, o.desc);
  }
  /** pousse le joueur (vent, courant, ficelles) pendant dur secondes */
  function pushAttack(id, o) {
    attack(id, 1.0, function* (b, api, ph) {
      yield* windup(b, ph, 1.0); const dur = o.dur || 2.0, tl = tele('ring', 10, b.pos.x, b.pos.z);
      sfx('bossRoar');
      try { for (let t = 0; t < dur;) { t += S.dt; tl.position.set(b.pos.x, 0.05, b.pos.z); setProg(tl, 1); const pp = ppos(), d = hd(pp.x, pp.z, b.pos.x, b.pos.z) || 1; let dx, dz; if (o.mode === 'random') { o.dx = o.dx == null ? rnd(-1, 1) : o.dx; o.dz = o.dz == null ? rnd(-1, 1) : o.dz; dx = o.dx; dz = o.dz; } else { dx = (pp.x - b.pos.x) / d * (o.mode === 'pull' ? -1 : 1); dz = (pp.z - b.pos.z) / d * (o.mode === 'pull' ? -1 : 1); } if (!isRolling()) shove(dx * (o.speed || 4) * S.dt, dz * (o.speed || 4) * S.dt); setAnim(b, 0.7, 0); yield 0; } } finally { untele(tl); o.dx = null; o.dz = null; }
      if (o.after) o.after(b, ph);
      yield 0.8;
    }, o.desc);
  }
  const phN = (...a) => (ph) => a[Math.min(a.length, ph.n) - 1];

  // ---------------- MINE : Golem de Grisou ----------------
  attack('gg_rail_cart', 0.9, function* (b, api, ph) {
    const sp = spd(ph), n = ph.n + 1; yield* windup(b, ph, 0.9);
    for (let i = 0; i < n; i++) {
      const vert = rnd() < 0.5, c = i === 0 ? (vert ? ppos().x : ppos().z) : rnd(-9, 9), dir = rnd() < 0.5 ? 1 : -1, W = 1.4 / sp;
      const tl = tele('line', { length: 30, width: 2.0 }, vert ? c : -15, vert ? -15 : c, vert ? 0 : PI / 2);
      for (let t = 0; t < W;) { t += S.dt; setProg(tl, t / W); yield 0; } untele(tl);
      const mesh = new THREE.Group(); part(mesh, 'box', 0x5a5f6c, 0, 0.7, 0, 1.6, 0.9, 2.0); part(mesh, 'box', 0x3a2a1a, 0, 1.25, 0, 1.3, 0.3, 1.7); part(mesh, 'cyl', 0x2a2a30, -0.9, 0.3, 0.7, 0.3, 0.2, 0.3, 0, [0, 0, PI / 2]); addMesh(mesh);
      orb(b, { mesh, x: vert ? c : -14 * dir, z: vert ? -14 * dir : c, vx: vert ? 0 : 15 * dir, vz: vert ? 15 * dir : 0, r: 1.4, life: 3, dmgK: 1.0, el: 'physique', y: 0, once: false });
      sfx('dash'); yield 0.5;
    }
    yield 1.5;
  }, 'Wagonnets sur rails : quitter la ligne');
  attack('gg_spark', 0.9, function* (b, api, ph) {
    yield* windup(b, ph, 0.9); const pp = ppos(), a = ang(b.pos, pp), len = 24; face(b, a);
    strikeLine(b, b.pos.x, b.pos.z, a, len, 1.1, 1.0, D(b, 0.9, ph), 'feu', { sound: 'fire' });
    yield 1.05;
    const gs = b.__ba && b.__ba.gas; if (gs) gs.zs.slice().forEach(z => { if (!z.gone && distSeg(z.x, z.z, b.pos.x, b.pos.z, b.pos.x + Math.sin(a) * len, b.pos.z + Math.cos(a) * len) < (gs.opts.r || 3.2)) gasBoom(b, gs, z, ph); });
    setAnim(b, 0, 1); yield 1.2;
  }, 'Étincelle : elle enflamme le grisou sur son passage');
  barrage('gg_ore_burst', { w: 0.8, n: phN(4, 5, 6), where: 'player', r: 2.0, delay: 1.2, fall: true, dmg: 0.9, desc: 'Éclats de minerai' });
  attack('gg_quake', 0.9, function* (b, api, ph) {
    yield* windup(b, ph, 0.9);
    for (let k = 1; k <= 3; k++) { const n = 5 + k * 2; for (let i = 0; i < n; i++) { const a = i / n * TAU + k; strikeCircle(b, cl(b.pos.x + Math.sin(a) * k * 3.3), cl(b.pos.z + Math.cos(a) * k * 3.3), 1.6, 0.9, D(b, 0.9, ph), 'physique', { delay: k * 0.45, vfx: 'ring' }); } }
    setAnim(b, 0, 1); yield 2.6;
  }, 'Séisme en anneaux concentriques');

  // ---------------- FORÊT : Roi-Sylve ----------------
  dashAttack('rs_antler_charge', { len: 15, width: 2.8, dmg: 1.2, speed: 21, stag: 1.3, crash: true, color: 0x88ffcc, desc: 'Charge des bois' });
  attack('rs_root_burst', 0.9, function* (b, api, ph) {
    yield* windup(b, ph, 0.9); const base = ang(b.pos, ppos()), n = ph.n >= 2 ? 3 : 2;
    for (let k = 0; k < n; k++) { const a = base + (k - (n - 1) / 2) * 0.5; for (let i = 1; i <= 7; i++) { const d = i * 2.3; strikeCircle(b, cl(b.pos.x + Math.sin(a) * d), cl(b.pos.z + Math.cos(a) * d), 1.3, 0.8, D(b, 0.9, ph), 'poison', { delay: i * 0.12, vfx: 'ring' }); } }
    setAnim(b, 0, 1); yield 2.4;
  }, 'Racines qui jaillissent en éventail');
  volley('rs_crows', { n: phN(5, 6, 8), radial: false, spread: 0.45, speed: 6, homing: 1.2, color: 0x2a2a3a, size: 0.5, life: 4, dmg: 0.6, y: 2.2, desc: 'Corbeaux de la couronne' });
  attack('rs_entangle', 0.8, function* (b, api, ph) {
    yield* windup(b, ph, 0.8); const n = ph.n >= 3 ? 3 : 1;
    for (let i = 0; i < n; i++) { const q = ppos(); strikeCircle(b, q.x + (i ? rnd(-4, 4) : 0), q.z + (i ? rnd(-4, 4) : 0), 1.8, 0.95, D(b, 0.6, ph), 'poison', { sound: 'hit', onHit: (x, z) => { const pp = ppos(); if (hd(pp.x, pp.z, x, z) <= 2.1 && !isRolling()) { stunPlayer(1.5); say(pp, 'ENRACINÉ !', 0x88ff66, 'rt', 0.5); } } }); yield 0.3; }
    yield 1.6;
  }, 'Racines saisissantes : roulez hors du cercle');
  attack('rs_grow_trees', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); const pp = ppos(); let placed = 0;
    for (let k = 0; k < 14 && placed < 3; k++) { const x = rnd(-9, 9), z = rnd(-9, 9); if (hd(x, z, pp.x, pp.z) < 3.5) continue; placed++; strikeCircle(b, x, z, 1.6, 1.0, D(b, 0.7, ph), 'poison', { onHit: (xx, zz) => addPillar(b, xx, zz, 18), vfx: 'ring' }); }
    yield 1.6;
  }, 'La forêt pousse : troncs de couverture');
  barrage('rs_spores', { n: 3, where: 'random', r: 3, delay: 1.0, dmg: 0.5, zone: { kind: 'poison', dps: 0.3, dur: 10, color: 0x9aff66 }, desc: 'Nuages de spores' });

  // ---------------- CATACOMBES : Roi des Ossements ----------------
  barrage('os_bone_spears', { w: 0.9, n: phN(8, 10, 12), where: 'around', ring: 4.2, r: 1.4, delay: 1.0, gap: 0.12, dmg: 0.9, color: 0xd8d0c0, vfx: 'ring', desc: 'Lances d\'os en couronne' });
  volley('os_skull_volley', { n: phN(4, 5, 7), spread: 0.5, speed: 5.5, homing: 1.4, color: 0xe8e0d0, size: 0.6, life: 5, dmg: 0.8, y: 1.2, seq: 0.15, desc: 'Crânes hurlants' });
  attack('os_coffin_lines', 0.9, function* (b, api, ph) {
    yield* windup(b, ph, 0.9); const q = ppos(), vert = rnd() < 0.5;
    for (const o of [-4.5, 0, 4.5]) { if (vert) strikeLine(b, q.x + o, -15, 0, 30, 2.4, 1.3, D(b, 1.1, ph), 'ombre', { sound: 'slam' }); else strikeLine(b, -15, q.z + o, PI / 2, 30, 2.4, 1.3, D(b, 1.1, ph), 'ombre', { sound: 'slam' }); yield 0.35; }
    yield 1.8;
  }, 'Cercueils qui s\'abattent en lignes');
  barrage('os_graspers', { n: phN(3, 4, 5), where: 'player', r: 2.2, delay: 1.0, dmg: 0.5, zone: { kind: 'web', slow: 0.6, dps: 0, dur: 9, color: 0xd8d0c0 }, desc: 'Mains squelettiques qui retiennent' });
  dashAttack('os_throne_charge', { len: 16, width: 3.0, dmg: 1.3, speed: 18, stag: 1.4, crash: true, color: 0xd8d0c0, desc: 'Le trône charge sur ses pattes d\'os' });
  rings('os_marrow_nova', { n: phN(1, 2, 3), color: 0xd8d0c0, el: 'ombre', speed: 6, dmg: 1.2, half: 0.55, desc: 'Onde de moelle avec brèche' });

  // ---------------- CHÂTEAU : Comtesse Écarlate ----------------
  fanLines('ce_veil', { n: phN(3, 4, 5), spread: 0.4, len: 20, width: 1.4, delay: 1.0, seq: 0.14, el: 'ombre', color: 0xc01830, desc: 'Voile écarlate : lames de tissu' });
  volley('ce_waltz', { n: phN(6, 8, 10), radial: true, speed: 4.2, homing: 0.9, color: 0xff3a5a, size: 0.55, life: 5, dmg: 0.7, y: 1.3, snuffByLight: true, desc: 'Valse des invités morts (leurs flammes s\'éteignent dans la lumière)' });
  attack('ce_snuff', 1.2, function* (b, api, ph) {
    yield* windup(b, ph, 1.2); say(b.pos, 'SOUFFLEZ LES BOUGIES…', 0xc01830, 'snf', 1); sfx('bossRoar');
    ringWave(b, b.pos.x, b.pos.z, { color: 0x8a3cff, speed: 9, dmgK: 0.5, el: 'ombre', ph }); setAnim(b, 0, 1);
    const br = b.__ba && b.__ba.bra; if (br) br.snuff(ph.n >= 3 ? 2 : 1);
    yield 1.6;
  }, 'Hurlement : éteint des braseros');
  attack('ce_mirror_step', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); spawnEchoes(b, 2, ph); vfx('shadowRise', b.pos.x, b.pos.z, 0xc01830, 3);
    const pp = ppos(), a = rnd(0, TAU), tx = cl(pp.x + Math.sin(a) * 6), tz = cl(pp.z + Math.cos(a) * 6);
    const tl = tele('circle', 4, tx, tz); for (let t = 0; t < 1.0;) { t += S.dt; setProg(tl, t); yield 0; } untele(tl);
    b.pos.x = tx; b.pos.z = tz; vfx('ring', tx, tz, 0xc01830, 5); ringWave(b, tx, tz, { color: 0xc01830, speed: 8, dmgK: 0.9, ph, max: 8 }); setAnim(b, 0, 1); yield 1.4;
  }, 'Pas de miroir : reflets + apparition dans votre dos');
  barrage('ce_chandelier', { w: 1.0, n: 1, where: 'player', r: 4.0, delay: 1.9, fall: true, dmg: 1.5, zone: { kind: 'lava', dps: 0.35, dur: 7, color: 0xff8a2a, el: 'feu' }, rest: 1.6, desc: 'Lustre qui tombe' });
  attack('ce_kiss', 0.8, function* (b, api, ph) {
    yield* windup(b, ph, 0.8); const q = ppos();
    strikeCircle(b, q.x, q.z, 3.0, 1.0, D(b, 1.3, ph), 'ombre', { onHit: (x, z) => { const pp = ppos(); if (hd(pp.x, pp.z, x, z) <= 3.3) { heal(b, 0.04); say(b.pos, 'SA VIE EST À MOI', 0xc01830, 'kis', 1); } } });
    const sx = b.pos.x, sz = b.pos.z; for (let t = 0; t < 1.0;) { t += S.dt; const k = t; b.pos.x = lerp(sx, q.x, k); b.pos.z = lerp(sz, q.z, k); b.pos.y = Math.sin(k * PI) * 2.5; yield 0; } b.pos.y = 0; clampBoss(b); yield 1.2;
  }, 'Baiser : saut qui draine la vie');
  attack('ce_blood_ball', 1.2, function* (b, api, ph) {
    yield* windup(b, ph, 1.2); say(b.pos, 'LE BAL COMMENCE !', 0xc01830, 'bal', 1);
    for (let i = 0; i < 4; i++) { ringWave(b, b.pos.x, b.pos.z, { gap: ang(b.pos, ppos()) + i * 0.9, half: 0.55, color: 0xc01830, el: 'ombre', speed: 6, dmgK: 1.0, ph }); if (i % 2) strikeCircle(b, ...Object.values({ x: cl(ppos().x), z: cl(ppos().z) }), 3.0, 1.0, D(b, 1.0, ph), 'ombre', { fall: true }); sfx('fire'); setAnim(b, 0, 1); yield 0.9; }
    yield 1.4;
  }, 'Bal écarlate : anneaux et lustres');

  // ---------------- CATHÉDRALE : Mère des Marées ----------------
  barrage('cm_tentacle_slam', { w: 0.9, n: phN(5, 7, 9), where: 'trail', step: 2.4, r: 1.8, delay: 1.0, gap: 0.14, dmg: 1.0, color: 0x6ad0ff, desc: 'Tentacules qui frappent en ligne' });
  wallAttack('cm_tide_wave', { el: 'glace', color: 0x3a9ad8, speed: 4.2, walls: phN(1, 1, 2), gap: 5.6, dmg: 1.2, push: 1.4, h: 1.2, desc: 'Vague de marée avec une brèche' });
  volley('cm_bubbles', { n: phN(6, 8, 10), radial: true, speed: 2.6, homing: 0.5, color: 0xaee8ff, size: 0.7, life: 6, dmg: 0.6, y: 1.0, desc: 'Bulles qui éclatent' });
  attack('cm_drown_hand', 0.8, function* (b, api, ph) {
    yield* windup(b, ph, 0.8); const q = ppos();
    strikeCircle(b, q.x, q.z, 2.4, 1.0, D(b, 1.0, ph), 'glace', { onHit: (x, z) => { const pp = ppos(); if (hd(pp.x, pp.z, x, z) <= 2.7 && !isRolling()) { say(pp, 'ENTRAÎNÉ !', 0x6ad0ff, 'dh', 0.5); S.runners.push({ boss: b, h: { done: false }, wait: 0, it: (function* () { for (let t = 0; t < 0.7;) { t += S.dt; const p2 = ppos(), d = hd(p2.x, p2.z, b.pos.x, b.pos.z) || 1; if (d > (b.r || 2) + 1.5) shove((b.pos.x - p2.x) / d * 9 * S.dt, (b.pos.z - p2.z) / d * 9 * S.dt); yield 0; } })() }); } } });
    yield 1.8;
  }, 'Main des noyés : entraîne vers la Mère');
  spokes('cm_maelstrom', { n: phN(2, 2, 3), spin: 0.9, dur: 3.6, color: 0x6ad0ff, el: 'glace', desc: 'Maelström : bras de courant' });

  // ---------------- TEMPLE : Dieu Écorché ----------------
  barrage('de_blood_rain', { w: 0.9, n: phN(7, 9, 11), where: 'random', r: 2.1, delay: 1.2, gap: 0.16, dmg: 1.0, color: 0xc01818, zone: { kind: 'poison', dps: 0.22, dur: 5, color: 0xc01818, el: 'feu', max: 6 }, desc: 'Pluie de sang' });
  fanLines('de_flay_chains', { n: 3, spread: 0.45, len: 22, width: 1.4, delay: 1.1, seq: 0.2, el: 'physique', color: 0xc8a24a, desc: 'Chaînes d\'écorchement' });
  attack('de_four_arms', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); let base = rnd(0, PI / 2); const waves = ph.n >= 3 ? 4 : 3;
    for (let w = 0; w < waves; w++) { for (let k = 0; k < 4; k++) strikeLine(b, b.pos.x, b.pos.z, base + k * PI / 2, 18, 1.8, 0.95, D(b, 1.0, ph), 'feu', { sound: 'slam' }); base += PI / 4 + 0.1; setAnim(b, 0, 1); yield 1.0; }
    yield 1.0;
  }, 'Quatre bras : croix tournante');
  attack('de_idol_slam', 1.2, function* (b, api, ph) {
    yield* windup(b, ph, 1.2); strikeCircle(b, b.pos.x, b.pos.z, 5.5, 1.1, D(b, 1.6, ph), 'feu', { shake: 0.6 }); yield 1.15;
    ringWave(b, b.pos.x, b.pos.z, { color: 0xc01818, el: 'feu', speed: 8, dmgK: 1.0, ph }); setAnim(b, 0, 1); yield 1.8;
  }, 'Écrasement de l\'idole + onde');

  // ---------------- ASILE : Directeur ----------------
  attack('ad_arc', 1.0, function* (b, api, ph) {
    const sp = spd(ph), m = b.__ba && b.__ba.pyl; const W = 1.4 / sp, tl = tele('line', { length: 22, width: 1.3 }, b.pos.x, b.pos.z, 0), beam = beamMesh(0xb48cff);
    let a = ang(b.pos, ppos());
    try {
      for (let t = 0; t < W;) { t += S.dt; if (t < W * 0.7) a = ang(b.pos, ppos()); tl.position.set(b.pos.x, 0.05, b.pos.z); tl.rotation.y = a; setProg(tl, t / W); setAnim(b, t / W, 0); face(b, a); yield 0; }
      untele(tl); sfx('fire'); let el = 0, hit = 0; const dur = 1.7 / sp;
      while (el < dur) {
        el += S.dt; setAnim(b, 0, 1); const len = m ? arcCut(b, m, b.pos.x, b.pos.z, a, 22, S.dt) : 22; beam.set(b.pos.x, b.pos.z, a, len, 1.0);
        hit -= S.dt; const pp = ppos(); if (hit <= 0 && distSeg(pp.x, pp.z, b.pos.x, b.pos.z, b.pos.x + Math.sin(a) * len, b.pos.z + Math.cos(a) * len) < 1.0 && !isRolling()) { hurt(b, D(b, 1.0, ph), 'foudre'); hit = 0.4; }
        yield 0;
      }
    } finally { untele(tl); beam.dispose(); setAnim(b, 0, 0); }
    yield 0.7;
  }, 'Arc voltaïque : placez un pylône entre vous et le Directeur');
  attack('ad_shock', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); const vert = rnd() < 0.5, sgn = rnd() < 0.5 ? 1 : -1, W = 1.5 / spd(ph);
    const zap = (x, z, a, len, w) => strikeLine(b, x, z, a, len, w, W, D(b, 1.2, ph), 'foudre', { sound: 'boom' });
    if (ph.n < 3) { if (vert) zap(sgn < 0 ? -14 : 0, -14, 0, 28, 14); else zap(-14, sgn < 0 ? -14 : 0, PI / 2, 28, 14); }
    else { zap(-14, -14, PI / 2, 14, 14); zap(0, 0, PI / 2, 14, 14); }
    say(b.pos, 'SOL ÉLECTRIFIÉ !', 0xb48cff, 'ele', 1); setAnim(b, 0, 1); yield W + 1.2;
  }, 'Sol électrifié : changer de moitié');
  attack('ad_rift_step', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); spawnEchoes(b, 2, ph); vfx('shadowRise', b.pos.x, b.pos.z, 0xb48cff, 3);
    const pp = ppos(), a = rnd(0, TAU), tx = cl(pp.x + Math.sin(a) * 7), tz = cl(pp.z + Math.cos(a) * 7);
    const tl = tele('circle', 3.5, tx, tz); for (let t = 0; t < 0.9;) { t += S.dt; setProg(tl, t / 0.9); yield 0; } untele(tl);
    b.pos.x = tx; b.pos.z = tz; vfx('explosion', tx, tz, 0xb48cff, 3.5); strikeCircle(b, tx, tz, 3.5, 0.5, D(b, 1.0, ph), 'foudre'); setAnim(b, 0, 1); yield 1.4;
  }, 'Pas dans la faille : doubles + apparition');
  volley('ad_syringes', { n: phN(5, 7, 9), spread: 0.22, speed: 8, homing: 0.5, color: 0x9aff66, size: 0.35, life: 3.5, dmg: 0.6, y: 1.2, seq: 0.1, desc: 'Seringues' });
  attack('ad_blackout', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); const m = b.__ba && b.__ba.pyl; say(b.pos, 'EXTINCTION DES LUMIÈRES ! RÉTABLISSEZ LE DISJONCTEUR (SUD)', 0xb48cff, 'blk', 1);
    darkness(b, 0.6, 7.5); if (m) m.dark = true; setArmor(b, 'noir', 0.2); spawnEchoes(b, 2, ph);
    for (let t = 0; t < 7.5 && m && m.dark;) { t += S.dt; yield 0; }
    if (m) m.dark = false; setArmor(b, 'noir', null); yield 0.6;
  }, 'Black-out : le Directeur se fond dans le noir');

  // ---------------- BIBLIOTHÈQUE : Auteur sans Nom ----------------
  const SENT = {
    feu: ['« Le sol s\'embrase. »', 0xff6a2a], lames: ['« Des lames tombent du ciel. »', 0xcfd6e2], eau: ['« L\'encre monte. »', 0x2a4aa8],
    issue: ['« Il n\'y a plus d\'issue. »', 0xb48cff], foudre: ['« La foudre le trouve. »', 0xffe84a],
  };
  function sentenceEffect(b, kind, x, z, ph) {
    if (kind === 'feu') { strikeCircle(b, x, z, 3.6, 0.9, D(b, 1.2, ph), 'feu', { onHit: (xx, zz) => zone(b, xx, zz, 3.6, 8, { kind: 'lava', dps: 0.35, el: 'feu', color: 0xff6a2a }) }); }
    else if (kind === 'lames') { for (let i = 0; i < 5; i++) strikeLine(b, x - 10 + i * 0.01, z + (i - 2) * 3.2, PI / 2, 20, 1.5, 0.9, D(b, 1.0, ph), 'physique', { delay: i * 0.12 }); }
    else if (kind === 'eau') { strikeCircle(b, x, z, 4.2, 0.8, D(b, 0.8, ph), 'glace', { onHit: (xx, zz) => zone(b, xx, zz, 4.2, 12, { kind: 'web', slow: 0.6, dps: 0.2, el: 'ombre', color: 0x1a2a8a }) }); }
    else if (kind === 'issue') { ringWave(b, x, z, { gap: ang({ x, z }, ppos()), half: 0.55, color: 0xb48cff, el: 'ombre', speed: 6, dmgK: 1.1, ph }); }
    else { for (let i = 0; i < 3; i++) { const q = ppos(); strikeCircle(b, q.x, q.z, 1.9, 0.9, D(b, 1.1, ph), 'foudre', { delay: i * 0.55, fall: true }); } }
  }
  attack('ba_write', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); const n = Math.min(4, 1 + ph.n), kinds = Object.keys(SENT), words = [];
    for (let i = 0; i < n; i++) {
      const k = kinds[Math.floor(rnd(0, kinds.length)) % kinds.length], a = i / n * TAU + rnd(0, 1), x = cl(b.pos.x + Math.sin(a) * 6.5, 2), z = cl(b.pos.z + Math.cos(a) * 6.5, 2);
      const e = spawnAdd(b, 'boss_mot', x, z, { hp: Math.max(6, b.pvMax * 0.018), word: k, color: SENT[k][1] });
      words.push({ k, x, z, e }); say({ x, z, y: 0.5 }, SENT[k][0], SENT[k][1], 'w' + i, 0.1);
    }
    setAnim(b, 0, 1); sfx('spawn');
    say(b.pos, 'RATUREZ LES MOTS (FRAPPEZ-LES) AVANT QU\'ILS S\'ÉCRIVENT !', 0xf0e8d0, 'wr', 1);
    let crossed = 0, T = 5.2 / Math.sqrt(spd(ph));
    for (let t = 0; t < T;) { t += S.dt; words.forEach((w, i) => { if (w.e && !w.e.dead && ((t * 3) | 0) !== w.lt) { w.lt = (t * 3) | 0; if (w.lt % 3 === 0) say({ x: w.x, z: w.z, y: 0.5 }, SENT[w.k][0], SENT[w.k][1], 'w' + i, 0.1); } }); if (words.every(w => !w.e || w.e.dead)) break; yield 0; }
    words.forEach(w => { if (w.e && !w.e.dead) { killAdd(w.e); sentenceEffect(b, w.k, w.x, w.z, ph); } else { crossed++; dmgPct(b, 0.012); say({ x: w.x, z: w.z, y: 0.5 }, 'RATURÉ', 0x7affd8, 'cr', 0.2); } });
    const st = state(b); st.crossed = (st.crossed || 0) + crossed; if (st.crossed >= 5) { st.crossed = 0; stagger(b, 5); say(b.pos, 'PLUME BRISÉE !', 0x7affd8, 'pb', 1); }
    yield 1.8;
  }, 'Il écrit : raturez les mots avant qu\'ils prennent forme');
  barrage('ba_ink_blots', { n: 4, where: 'random', r: 2.6, delay: 1.0, dmg: 0.6, zone: { kind: 'dark', dps: 0.3, dur: 10, color: 0x14185a, el: 'ombre' }, desc: 'Taches d\'encre' });
  volley('ba_page_storm', { n: phN(6, 8, 10), radial: true, speed: 5.5, homing: 1.1, color: 0xf0e8d0, size: 0.45, life: 4.5, dmg: 0.6, y: 1.5, desc: 'Tempête de pages' });
  attack('ba_underline', 0.8, function* (b, api, ph) {
    yield* windup(b, ph, 0.8); const q = ppos();
    for (let i = 0; i < 3; i++) { strikeLine(b, -15, cl(q.z + (i - 1) * 3.4 + rnd(-1, 1)), PI / 2, 30, 1.4, 1.0, D(b, 1.0, ph), 'ombre', { sound: 'hit' }); yield 0.45; }
    yield 1.4;
  }, 'Soulignement : lignes à esquiver');

  // ---------------- NÉCROPOLE : Roi-Hiver ----------------
  fanLines('rh_frost_lance', { n: 3, spread: 0.3, len: 24, width: 1.3, delay: 1.1, seq: 0.25, el: 'glace', color: 0x9ae0ff, desc: 'Lances de givre' });
  attack('rh_ice_comb', 0.9, function* (b, api, ph) {
    yield* windup(b, ph, 0.9); const q = ppos(), vert = rnd() < 0.5, n = 9;
    for (let i = 0; i < n; i++) { const c = -12 + i * 3; strikeCircle(b, vert ? c : cl(q.x), vert ? cl(q.z) : c, 1.5, 0.9, D(b, 0.9, ph), 'glace', { delay: i * 0.11, vfx: 'ring' }); }
    yield 2.2;
  }, 'Peigne de glace');
  pushAttack('rh_gust', { dur: 1.8, speed: 7, mode: 'away', after: (b) => { const c = b.__ba && b.__ba.cold; if (c) c.snuffOne(); }, desc: 'Rafale : repousse et éteint un brasero' });
  attack('rh_knights', 1.1, function* (b, api, ph) { yield* windup(b, ph, 1.1); spawnMinions(b, ph.n >= 3 ? 3 : 2); sfx('spawn'); say(b.pos, 'LES CHEVALIERS SE RELÈVENT', 0x9ae0ff, 'kn', 1); setAnim(b, 0, 1); yield 1.6; }, 'Chevaliers gelés');
  attack('rh_stasis', 1.2, function* (b, api, ph) {
    yield* windup(b, ph, 1.2); const n = ph.n >= 3 ? 2 : 1; say(b.pos, 'LE TEMPS S\'ARRÊTE ! ROULEZ !', 0x9ae0ff, 'stas', 1);
    for (let i = 0; i < n; i++) { ringWave(b, b.pos.x, b.pos.z, { color: 0xcfe8ff, speed: 7.5, el: 'glace', ph, onTouch: (pp) => { if (isRolling()) { say(pp, 'PARADE !', 0x7affd8, 'par', 0.5); return true; } hurt(b, D(b, 0.9, ph), 'glace'); stunPlayer(1.5); say(pp, 'FIGÉ !', 0x9ae0ff, 'fig', 0.5); return true; } }); sfx('bossRoar'); setAnim(b, 0, 1); yield 1.2; }
    yield 1.0;
  }, 'Stase : roulez au contact de l\'onde pour parer');
  rings('rh_blizzard_ring', { n: 3, color: 0xcfe8ff, el: 'glace', speed: 6.5, dmg: 1.0, half: 0.5, desc: 'Anneaux de blizzard' });

  // ---------------- JARDIN : Matrice ----------------
  attack('jm_veins', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); const n = ph.n >= 2 ? 2 : 1;
    for (let k = 0; k < n; k++) { const a = ang(b.pos, ppos()) + (k ? 0.7 : 0); for (let i = 1; i <= 8; i++) { const d = i * 2.0, x = cl(b.pos.x + Math.sin(a) * d), z = cl(b.pos.z + Math.cos(a) * d); strikeCircle(b, x, z, 1.5, 0.7, D(b, 0.7, ph), 'poison', { delay: i * 0.1, vfx: 'ring', onHit: (xx, zz) => { zone(b, xx, zz, 1.5, 9, { kind: 'web', slow: 0.5, dps: 0.18, el: 'poison', color: 0xff4a8a }); limitZones(b, 'web', 14); } }); } }
    yield 2.4;
  }, 'Veines qui rampent vers vous');
  barrage('jm_acid_rain', { n: phN(6, 8, 10), where: 'random', r: 2.3, delay: 1.1, gap: 0.18, dmg: 0.9, zone: { kind: 'poison', dps: 0.25, dur: 7, color: 0xb8ff4a, el: 'poison', max: 8 }, desc: 'Pluie acide' });
  attack('jm_tendrils', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); let base = rnd(0, TAU);
    for (let w = 0; w < 2; w++) { for (let k = 0; k < 6; k++) strikeLine(b, b.pos.x, b.pos.z, base + k * PI / 3, 18, 1.5, 1.0, D(b, 1.0, ph), 'poison', { sound: 'hit' }); base += PI / 6; setAnim(b, 0, 1); yield 1.1; }
    yield 1.0;
  }, 'Tentacules en étoile');
  attack('jm_bloom', 1.0, function* (b, api, ph) { yield* windup(b, ph, 1.0); spawnMinions(b, 2, b.pos.x + rnd(-4, 4), b.pos.z + rnd(2, 5)); say(b.pos, 'LA MATRICE BOURGEONNE', 0xff7ac8, 'bm', 1); sfx('spawn'); setAnim(b, 0, 1); yield 1.5; }, 'Bourgeonnement de monstres');

  // ---------------- ABÎME : Prince des Cendres ----------------
  barrage('pc_lava_bomb', { w: 0.9, n: phN(3, 4, 5, 6), where: 'player', r: 2.6, delay: 1.3, fall: true, dmg: 1.2, zone: { kind: 'lava', dps: 0.35, dur: 7, color: 0xff5a1a, el: 'feu', max: 8 }, desc: 'Bombes de lave' });
  attack('pc_chain_whip', 1.1, function* (b, api, ph) {
    yield* windup(b, ph, 1.1); const base = ang(b.pos, ppos()), n = 7;
    for (let i = 0; i < n; i++) strikeLine(b, b.pos.x, b.pos.z, base - 0.9 + i * 0.3, 16, 1.5, 0.7, D(b, 1.1, ph), 'feu', { delay: i * 0.13, sound: 'slam' });
    setAnim(b, 0, 1); yield 2.2;
  }, 'Fouet de chaîne : balayage');
  wallAttack('pc_magma_wave', { el: 'feu', color: 0xff4a1a, speed: 4.4, walls: phN(1, 1, 2, 2), gap: 5.0, dmg: 1.3, desc: 'Mur de magma' });
  attack('pc_fissure', 0.9, function* (b, api, ph) {
    yield* windup(b, ph, 0.9); const q = ppos(), a = ang(b.pos, q), d = hd(b.pos.x, b.pos.z, q.x, q.z), n = Math.max(4, Math.ceil(d / 2.2));
    for (let i = 1; i <= n + 2; i++) { const dd = i * 2.2; strikeCircle(b, cl(b.pos.x + Math.sin(a) * dd), cl(b.pos.z + Math.cos(a) * dd), 1.5, 0.6, D(b, 0.9, ph), 'feu', { delay: i * 0.08, vfx: 'ring', onHit: (x, z) => { zone(b, x, z, 1.5, 6, { kind: 'lava', dps: 0.3, el: 'feu', color: 0xff5a1a }); limitZones(b, 'lava', 12); } }); }
    yield 2.0;
  }, 'Fissure : traînée de lave jusqu\'à vous');
  barrage('pc_eruption', { w: 1.0, n: phN(8, 10, 12, 14), where: 'around', ring: 5, r: 1.8, delay: 1.0, gap: 0.12, dmg: 1.0, fall: true, desc: 'Éruptions en couronne' });
  rings('pc_infernal_nova', { n: phN(2, 3, 3, 4), color: 0xff4a1a, el: 'feu', speed: 7, dmg: 1.2, half: 0.5, desc: 'Nova infernale' });

  // ---------------- OBSERVATOIRE : Œil qui Regarde ----------------
  attack('oq_gaze', 1.0, function* (b, api, ph) {
    const sp = spd(ph), W = 2.0 / sp, tl = tele('line', { length: 24, width: 1.5 }, b.pos.x, b.pos.z, 0), beam = beamMesh(0xffffff);
    let a = ang(b.pos, ppos());
    try {
      for (let t = 0; t < W;) { t += S.dt; if (t < W * 0.78) a = ang(b.pos, ppos()); tl.position.set(b.pos.x, 0.05, b.pos.z); tl.rotation.y = a; setProg(tl, t / W); setAnim(b, t / W, 0); face(b, a); yield 0; }
      untele(tl); sfx('boom'); shake(0.4); let el = 0, hit = 0; while (el < 0.7) { el += S.dt; const len = rayCut(b.pos.x, b.pos.z, a, 24, S.dt); beam.set(b.pos.x, b.pos.z, a, len, 1.3); hit -= S.dt; const pp = ppos(); if (hit <= 0 && distSeg(pp.x, pp.z, b.pos.x, b.pos.z, b.pos.x + Math.sin(a) * len, b.pos.z + Math.cos(a) * len) < 1.1 && !isRolling()) { hurt(b, D(b, 1.7, ph), 'ombre'); hit = 1; } setAnim(b, 0, 1); yield 0; }
    } finally { untele(tl); beam.dispose(); setAnim(b, 0, 0); }
    yield 0.8;
  }, 'Regard : cassez la ligne de vue derrière un obélisque');
  attack('oq_comet', 0.9, function* (b, api, ph) {
    yield* windup(b, ph, 0.9); const n = ph.n + 2;
    for (let k = 0; k < n; k++) { const q = ppos(), a = rnd(0, TAU); for (let i = 0; i < 4; i++) strikeCircle(b, cl(q.x + Math.sin(a) * i * 2.2), cl(q.z + Math.cos(a) * i * 2.2), 1.7, 1.0, D(b, 0.9, ph), 'ombre', { delay: i * 0.12, fall: true, sound: 'boom' }); yield 0.7; }
    yield 1.4;
  }, 'Traînées de comètes');
  volley('oq_star_burst', { n: phN(10, 12, 14, 16), radial: true, speed: 3.6, homing: 0, color: 0xfff2a0, size: 0.5, life: 6, dmg: 0.7, y: 1.2, desc: 'Étoiles mourantes' });
  rings('oq_iris_nova', { n: 4, color: 0xffffff, el: 'ombre', speed: 6.5, dmg: 1.2, half: 0.45, every: 0.8, desc: 'Nova de l\'iris' });

  // ---------------- FOIRE : Grand Marionnettiste ----------------
  fanLines('fm_knives', { n: phN(5, 7, 9), spread: 0.3, jit: 0.1, len: 22, width: 0.9, delay: 0.9, seq: 0.09, el: 'physique', color: 0xcfd6e2, desc: 'Lanceur de couteaux' });
  volley('fm_balloons', { n: phN(5, 6, 8), radial: true, speed: 2.8, homing: 0.8, color: 0xff4a6a, size: 0.8, life: 6, dmg: 0.7, y: 1.6, desc: 'Ballons rieurs' });
  spokes('fm_carousel', { n: phN(3, 4, 4), spin: 0.55, dur: 4.2, color: 0xffd23a, el: 'physique', desc: 'Manège : rayons tournants' });
  barrage('fm_spotlights', { n: phN(5, 7, 9), where: 'player', r: 1.9, delay: 0.9, gap: 0.55, dmg: 0.9, color: 0xfff2a0, desc: 'Projecteurs de la piste' });
  pushAttack('fm_puppet', { dur: 2.2, speed: 3.8, mode: 'random', desc: 'Marionnette : le joueur est tiré par des fils (roulade = parade)' });
  attack('fm_curtain', 1.0, function* (b, api, ph) {
    yield* windup(b, ph, 1.0); say(b.pos, 'LE RIDEAU SE REFERME !', 0xb02a2a, 'cur', 1);
    for (let k = 0; k < 3; k++) { const x = 12 - k * 4; strikeLine(b, -x - 1, -15, 0, 30, 2.2, 1.2, D(b, 1.0, ph), 'physique', { sound: 'slam' }); strikeLine(b, x - 1, -15, 0, 30, 2.2, 1.2, D(b, 1.0, ph), 'physique', { sound: 'slam' }); yield 0.9; }
    yield 1.4;
  }, 'Rideau : colonnes qui se referment vers le centre');

  // ---------------- MINI-BOSS (attaques simples) ----------------
  dashAttack('mn_drill', { len: 13, width: 2.2, dmg: 1.1, speed: 18, stag: 1.5, crash: true, color: 0xcfd6e2, desc: 'Forage en ligne' });
  barrage('mn_burrow', { n: 3, where: 'player', r: 2.0, delay: 1.1, dmg: 1.0, desc: 'Surgit sous vos pieds' });
  barrage('mn_thorns', { n: 5, where: 'random', r: 2.2, delay: 1.0, dmg: 0.8, zone: { kind: 'poison', dps: 0.25, dur: 8, color: 0x7bd648, el: 'poison' }, desc: 'Ronces' });
  barrage('mn_shovel', { n: 3, where: 'trail', step: 2.8, r: 2.0, delay: 1.0, dmg: 1.0, desc: 'Coups de pelle' });
  fanLines('mn_cutlery', { n: 5, spread: 0.28, len: 18, width: 1.0, delay: 0.9, seq: 0.1, el: 'physique', color: 0xe8e8f0, desc: 'Couverts d\'argent' });
  volley('mn_notes', { n: 6, radial: true, speed: 3.5, homing: 0.7, color: 0x6ad0ff, size: 0.5, life: 5, dmg: 0.6, desc: 'Notes d\'orgue' });
  fanLines('mn_dagger', { n: 3, spread: 0.4, len: 18, width: 1.2, delay: 1.0, seq: 0.18, el: 'feu', color: 0xc01818, desc: 'Dague sacrificielle' });
  fanLines('mn_scalpels', { n: 7, spread: 0.2, jit: 0.08, len: 18, width: 0.8, delay: 0.8, seq: 0.07, el: 'foudre', color: 0xcfd6e2, desc: 'Rafale de scalpels' });
  barrage('mn_index', { n: 8, where: 'ring', ring: 5, r: 1.8, delay: 1.0, gap: 0.1, dmg: 0.9, desc: 'Tiroirs qui claquent' });
  attack('mn_axe', 0.9, function* (b, api, ph) { yield* windup(b, ph, 0.9); const a = ang(b.pos, ppos()); face(b, a); strikeLine(b, b.pos.x, b.pos.z, a - 0.35, 8, 3.2, 0.8, D(b, 1.3, ph), 'glace'); strikeLine(b, b.pos.x, b.pos.z, a + 0.35, 8, 3.2, 0.8, D(b, 1.3, ph), 'glace', { delay: 0.35 }); setAnim(b, 0, 1); yield 1.8; }, 'Hache du bourreau');
  attack('mn_shears', 0.9, function* (b, api, ph) { yield* windup(b, ph, 0.9); const q = ppos(); strikeLine(b, q.x - 8, q.z - 8, PI / 4, 24, 1.6, 1.0, D(b, 1.0, ph), 'poison'); strikeLine(b, q.x + 8, q.z - 8, -PI / 4, 24, 1.6, 1.0, D(b, 1.0, ph), 'poison'); yield 1.9; }, 'Sécateur : ciseaux croisés');
  rings('mn_clock', { n: 2, color: 0xffd23a, el: 'ombre', speed: 6, dmg: 1.0, half: 0.5, desc: 'Tic-tac' });
  attack('mn_cannon', 0.9, function* (b, api, ph) { yield* windup(b, ph, 0.9); const a = ang(b.pos, ppos()); orb(b, { x: b.pos.x, z: b.pos.z, vx: Math.sin(a) * 11, vz: Math.cos(a) * 11, r: 1.2, size: 1.0, life: 2.5, dmgK: 1.2, el: 'physique', color: 0x2a2a30, y: 1.3, onEnd: (x, z) => strikeCircle(b, x, z, 2.6, 0.5, D(b, 1.0, ph), 'feu') }); sfx('boom'); setAnim(b, 0, 1); yield 1.8; }, 'Boulet de canon');

  // =====================================================================
  //  v5 — BUTIN EXCLUSIF : effets d'équipement de boss + table de butin
  // =====================================================================
  const GFX = { eq: {}, hits: 0, next: {}, used: false, busy: false, t: 0 };
  function refreshEquipped() {
    try {
      const p = G.game && G.game.profile; GFX.eq = {};
      if (p && G.Inventory && G.Inventory.statsFromGear) (G.Inventory.statsFromGear(p).effects || []).forEach(i => { GFX.eq[i] = 1; });
    } catch (e) { /* ignore */ }
  }
  const ready = (k, cd) => { if (GFX.t >= (GFX.next[k] || 0)) { GFX.next[k] = GFX.t + cd; return true; } return false; };
  const bdmg = (a) => { try { const s = a.player().stats || {}; return Math.max(10, s.force || 0, s.intelligence || 0); } catch (e) { return 10; } };
  function aoeItem(a, pos, r, amount, el) {
    GFX.busy = true;
    try { a.enemiesInRadius(pos, r).forEach(e => { if (!e.dead) a.damage(e, amount, { element: el, kind: 'aoe', source: 'item', canCrit: false }); }); } finally { GFX.busy = false; }
    try { a.vfx && a.vfx('explosion', pos, { radius: r, element: el }); } catch (e) { /* ignore */ }
  }
  function registerGearFx() {
    try { if (G.BossInfo && G.BossInfo.registerItems) G.BossInfo.registerItems(); } catch (e) { console.warn('[BossGear]', e); }
    const noop = () => { };
    try { Object.keys(G.BOSSES || {}).forEach(id => { const g = G.BOSSES[id].gear; if (g && g.effect && G.Inventory && G.Inventory.EFFECTS && !G.Inventory.EFFECTS[g.effect.id]) G.Inventory.EFFECTS[g.effect.id] = noop; }); } catch (e) { /* ignore */ }
  }
  function initGear() {
    if (!G.bus || !G.hooks) return;
    const A = () => { const a = API(); try { return a && a.inRun && a.inRun() ? a : null; } catch (e) { return null; } };
    G.bus.on('tick', (p) => { GFX.t = (p && p.time) || GFX.t + ((p && p.dt) || 0.016); const a = A(); if (!a) return;
      if (GFX.eq.pulsation && ready('pulsation', 4)) { try { a.heal(a.player().pvMax * 0.015); } catch (e) { /* ignore */ } } });
    ['runStart', 'profileChanged'].forEach(ev => G.bus.on(ev, () => { registerGearFx(); refreshEquipped(); GFX.used = false; GFX.hits = 0; }));
    G.bus.on('damageDealt', (e) => {
      const a = A(); if (!a || !e || GFX.busy || e.source === 'item' || e.source === 'minion' || e.kind === 'dot') return;
      if (e.target && e.target.boss && e.element === 'feu') { const st = e.target.__ba; if (st) st.fireHit = S.time; }
      if (GFX.eq.grisou_pic && ++GFX.hits % 5 === 0 && e.target && e.target.pos) aoeItem(a, e.target.pos, 3.2, bdmg(a) * 4, 'physique');
      if (GFX.eq.baiser_ecarlate && e.amount > 0) { try { a.heal(Math.max(1, e.amount * 0.04)); } catch (er) { /* ignore */ } }
      if (GFX.eq.rature && e.target && !e.target.dead && G.rng.chance(0.15)) { try { a.status(e.target, { id: 'curse', duration: 4, power: 0.2 }); } catch (er) { /* ignore */ } }
      if (GFX.eq.givre_roi && e.target && !e.target.dead && G.rng.chance(0.12)) { try { a.status(e.target, { id: 'slow', duration: 2, power: 0.5 }); } catch (er) { /* ignore */ } }
    });
    G.bus.on('playerHit', (e) => {
      S.lastHit = S.time; const a = A(); if (!a) return;
      if (GFX.eq.ronces && e && ready('ronces', 1.2)) { const pl = a.player(), t = a.nearestEnemy(pl.pos, 4); if (t) { GFX.busy = true; try { a.damage(t, Math.max(5, (e.amount || 10) * 0.8 + bdmg(a)), { element: 'poison', kind: 'skill', source: 'item', canCrit: false }); } finally { GFX.busy = false; } } }
      if (GFX.eq.chaine_ardente && ready('chaine', 4)) { const pl = a.player(); aoeItem(a, pl.pos, 3.8, bdmg(a) * 4, 'feu'); }
    });
    G.bus.on('playerDodge', () => { const a = A(); if (a && GFX.eq.maree_montante) { try { a.restoreMana(12); } catch (e) { /* ignore */ } } });
    G.bus.on('skillCast', () => { const a = A(); if (a && GFX.eq.ficelles && G.rng.chance(0.2)) { try { a.restoreMana(12); } catch (e) { /* ignore */ } } });
    G.hooks.add('outgoingDamage', (d) => {
      if (!d || GFX.busy) return d; const a = A(); if (!a) return d;
      if (GFX.eq.sang_ecorche) { try { const pl = a.player(); if (pl.pv < pl.pvMax * 0.5) d.amount *= 1.25; } catch (e) { /* ignore */ } }
      if (GFX.eq.regard_neant && ready('regard', 10)) d.amount *= 2;
      return d;
    }, 15);
    G.hooks.add('incomingDamage', (d, ctx) => {
      if (!d || !ctx || ctx.target !== 'player') return d; const a = A(); if (!a) return d;
      if (GFX.eq.isolation) d.amount *= d.element === 'foudre' ? 0.5 : 0.92;
      if (GFX.eq.os_eternels && !GFX.used) { try { const pl = a.player(); if (d.amount >= pl.pv && pl.pv > 1) { GFX.used = true; d.amount = Math.max(0, pl.pv - 1); a.after(0.05, () => a.heal(pl.pvMax * 0.3)); a.text && a.text(pl.pos, 'OS ÉTERNELS', '#d8d0c0', 1.2); } } catch (e) { /* ignore */ } }
      return d;
    }, 60);
    // table de butin exclusive
    G.hooks.add('lootTable', (drops, ctx) => {
      const en = ctx && ctx.enemy; if (!en || !en.boss || !en.def || !Array.isArray(drops)) return drops;
      const def = en.def, out = drops.slice(), p = G.game && G.game.profile;
      try {
        (def.rewards || []).forEach(r => { if (G.rng.chance(r.chance == null ? 1 : r.chance)) out.push({ type: 'material', id: r.id, n: r.qty ? G.rng.int(r.qty[0], r.qty[1]) : 1 }); });
        if (def.cristal && G.rng.chance(def.cristal)) out.push({ type: 'material', id: 'cristal_eveil', n: 1 });
        if (def.gear && G.Inventory && G.Inventory._build && G.ITEMS && G.ITEMS.bases[def.gear.id] && !(p && p.classe && Array.isArray(G.ITEMS.bases[def.gear.id].classes) && G.ITEMS.bases[def.gear.id].classes.indexOf(p.classe) < 0) && G.rng.chance(def.gearChance || 0.4)) {
          const ri = Math.max(0, G.ITEMS.rarities.findIndex(r => r.id === def.gear.rarity));
          out.push({ type: 'item', item: G.Inventory._build(def.gear.id, ri, (p && p.niveau) || 1, def.rank || 'E') });
        }
      } catch (e) { console.warn('[BossLoot]', e); }
      return out;
    }, 5);
  }

  function addMod(boss, st, name, opts, late) {
    const def = MODS[name]; if (!def) return null;
    const m = { name, opts: opts || {}, def };
    st.mods.push(m); if (def.init) def.init(boss, st, m);
    return m;
  }
  function stopMod(boss, st, m) { if (!m) return; const i = st.mods.indexOf(m); if (i >= 0) st.mods.splice(i, 1); if (m.def.stop) m.def.stop(boss, st, m); }

  // =====================================================================
  //  Mécaniques enregistrées : 'mech_<id>'
  // =====================================================================
  function startMech(boss) {
    const st = state(boss);
    if (st.started) return st; st.started = true; st.baseSpeed = boss.speed;
    const opts = (boss.def && boss.def.mechOpts) || {};
    Object.keys(opts).forEach(k => addMod(boss, st, k, opts[k]));
    return st;
  }
  function registerMech(id) {
    const rid = 'mech_' + id;
    if (REG().has && REG().has(rid)) return;
    REG().register(rid, {
      id: rid, windup: 0, passive: true,
      execute(boss, api, phase) { startMech(boss); return { id: rid, done: false, duration: Infinity, passive: true, boss }; },
      update(boss, dt, api) { tickMech(boss, dt); },
    });
  }
  function tickMech(boss, dt) {
    const st = state(boss);
    if (st.frame === S.frame) return; st.frame = S.frame;
    if (!st.started) startMech(boss);
    const ph = phaseOf(boss);
    if (ph.n !== st.phase) {
      const prev = st.phase; st.phase = ph.n;
      if (ph.n > prev && prev > 0 && st.started) {
        if (ph.banner) say(boss.pos, ph.banner, 0xff4040, 'phb' + ph.n, 0.5);
        vfx('ring', boss.pos.x, boss.pos.z, 0xff2020, 6);
        if (G.bus && G.bus.emit && !boss.phase) G.bus.emit('bossPhase', { boss, phase: ph.n });
      }
    }
    const mods = st.mods.slice();
    for (const m of mods) if (m.def.update) m.def.update(boss, dt, st, m, ph);
    tickShield(boss, dt, st);
    if (S.time > st.staggerUntil && boss.staggered) boss.staggered = false;
    if (st.aura) st.aura.position.set(boss.pos.x, 0.05, boss.pos.z);
    // anim modèle personnalisé
    const ud = boss.mesh && boss.mesh.userData;
    if (ud && ud.animate) {
      const lp = st.lastPos, moving = lp ? Math.hypot(boss.pos.x - lp.x, boss.pos.z - lp.z) > 0.01 : false;
      st.lastPos = { x: boss.pos.x, z: boss.pos.z };
      const busy = boss.__attack && !boss.__attack.done;
      try { ud.animate(S.time, { moving, windup: busy ? st.anim.windup : 0, attack: busy ? st.anim.attack : 0 }); } catch (e) { ud.animate = null; }
      if (st.anim.attack > 0) st.anim.attack = Math.max(0, st.anim.attack - dt * 2.5);
    }
  }
  function ensureMechs() { const B = G.BOSSES || {}; Object.keys(B).forEach(registerMech); }

  // =====================================================================
  //  Hook de dégâts entrants (boss + adds)
  // =====================================================================
  function incoming(d, ctx) {
    const t = ctx && ctx.target; if (!t || !d) return d;
    if (t.__add) {
      const ad = t.__add;
      if (ad.fire) { if (d.element === 'feu' || S.time < S.torchUntil) { d.amount *= 3; say(t.pos, 'BRÛLE !', 0xff8a2a, 'brn', 1); } else d.amount *= 0.6; }
      if (ad.seq && !ad.lit) { d.amount = 0; if (S.time - (ad.refl || -9) > 1.2) { ad.refl = S.time; hurt(ad.boss || { def: {}, dmg: 10 }, Math.max(1, Math.round(((ad.boss && ad.boss.dmg) || 10) * 0.5)), 'foudre'); say(t.pos, 'ÉTEINT — ÉCLAT RENVOYÉ', 0xff4a4a, 'unlit', 1); } }
      return d;
    }
    const st = t.__ba; if (!st || !t.boss) return d;
    let m = 1; const now = S.time; st.lastHit = now;
    if (st.shieldOn) { m *= 0.04; say(t.pos, 'BOUCLIER', 0x6ae6ff, 'shld', 1.5); }
    if (now < st.staggerUntil) m *= 1.5;
    if (st.frontal && now >= st.staggerUntil) {
      const pp = ppos(), toP = Math.atan2(pp.x - t.pos.x, pp.z - t.pos.z), fa = t.mesh ? t.mesh.rotation.y : toP, diff = Math.abs(angDiff(toP, fa));
      if (diff < st.frontal) { m *= 0.2; say(t.pos, 'GARDE !', 0xcfd6e2, 'grd', 1); } else { m *= 1.6; say(t.pos, 'DOS ×1.6', 0xffd23a, 'bak', 1.5); }
    }
    if (st.armors && now >= st.staggerUntil) { const ar = armorOf(st); if (ar !== 1) { m *= ar; if (ar < 0.6) say(t.pos, 'PROTÉGÉ', 0xcfd6e2, 'arm', 2.5); } }
    if (st.weakEl) { m *= d.element === st.weakEl ? 2.2 : 0.45; }
    if (st.lightFn && !st.lightFn()) m *= 0.3;
    if (st.hidden) { if (d.element === 'feu' || d.element === 'foudre' || d.element === 'sacre') setHidden(t, false); else m *= 0.15; }
    if (st.riposte) { m *= 0.1; if (now - (st.ripAt || -9) > 0.6) { st.ripAt = now; hurt(t, D(t, 0.7), (t.def && t.def.element) || 'physique'); say(ppos(), 'RIPOSTE !', 0xff4a4a, 'rip2', 0.5); } }
    // plancher : quelles que soient les protections cumulées, au moins 30 % des dégâts passent (jamais de boss invincible)
    if (m < 0.3) m = 0.3;
    if (m !== 1) d.amount *= m;
    return d;
  }

  // =====================================================================
  //  Moteur : bus 'tick'
  // =====================================================================
  function findBoss(api) {
    const run = api.run && api.run();
    if (run && run.bossIntro) return null;
    const list = api.enemies ? api.enemies() : [];
    for (let i = 0; i < list.length; i++) if (list[i].boss && !list[i].dead) return list[i];
    return null;
  }
  function clearAll(killAdds) {
    S.runners.forEach(r => { try { r.it.return && r.it.return(); } catch (e) { /* ignore */ } if (r.h) r.h.done = true; });
    S.runners.length = 0;
    S.fx.forEach(f => { try { f.dispose && f.dispose(); } catch (e) { /* ignore */ } }); S.fx.length = 0;
    S.zones.forEach(z => disposeObj(z.mesh)); S.zones.length = 0;
    S.pillars.forEach(p => disposeObj(p.mesh)); S.pillars.length = 0;
    S.meshes.forEach(m => disposeObj(m)); S.meshes.clear();
    S.boss = null;
  }
  function purgeBoss(boss) {
    const st = boss.__ba;
    if (st) { st.mods.slice().forEach(m => stopMod(boss, st, m)); if (st.shield) { st.shield.list.forEach(killAdd); st.shield = null; } setAura(boss, null); st.shieldOn = false; }
    for (let i = S.runners.length - 1; i >= 0; i--) if (S.runners[i].boss === boss) { try { S.runners[i].it.return(); } catch (e) { /* ignore */ } if (S.runners[i].h) S.runners[i].h.done = true; S.runners.splice(i, 1); }
    for (let i = S.fx.length - 1; i >= 0; i--) if (S.fx[i].boss === boss) { try { S.fx[i].dispose && S.fx[i].dispose(); } catch (e) { /* ignore */ } S.fx.splice(i, 1); }
    S.zones = S.zones.filter(z => { if (z.boss === boss) { disposeObj(z.mesh); return false; } return true; });
    S.pillars = S.pillars.filter(p => { if (p.boss === boss) { disposeObj(p.mesh); return false; } return true; });
  }
  function tick(dt) {
    const api = API();
    if (!api || !api.inRun || !api.inRun()) return;
    dt = clamp(dt || 0.016, 0, 0.05);
    S.dt = dt; S.time += dt; S.frame++;
    // runners
    for (let i = S.runners.length - 1; i >= 0; i--) {
      const r = S.runners[i];
      if (r.boss && r.boss.dead) { try { r.it.return(); } catch (e) { /* ignore */ } if (r.h) r.h.done = true; S.runners.splice(i, 1); continue; }
      r.wait -= dt; if (r.wait > 0) continue;
      let x; try { x = r.it.next(); } catch (e) { console.warn('[BossAttacks]', e); x = { done: true }; }
      if (x.done) { if (r.h) r.h.done = true; if (r.boss && r.boss.__attack === r.h) { r.boss.__attack = null; setAnim(r.boss, 0, 0); } S.runners.splice(i, 1); } else r.wait = typeof x.value === 'number' ? x.value : 0;
    }
    for (let i = S.fx.length - 1; i >= 0; i--) { const f = S.fx[i]; let end = false; try { end = f.update(dt); } catch (e) { console.warn('[BossAttacks]', e); end = true; } if (end) { try { f.dispose && f.dispose(); } catch (e) { /* ignore */ } S.fx.splice(i, 1); } }
    updateZones(dt); updatePillars(dt);
    // mécaniques du boss courant
    const boss = findBoss(api);
    if (boss) { S.boss = boss; tickMech(boss, dt); }
    else if (S.boss && S.boss.dead) { purgeBoss(S.boss); S.boss = null; }
  }
  function init() {
    if (S.hooked) return; S.hooked = true;
    if (G.bus && G.bus.on) {
      G.bus.on('tick', (p) => tick(p && p.dt));
      ['runStart', 'runEnd', 'roomStart'].forEach(ev => G.bus.on(ev, () => clearAll()));
      G.bus.on('bossKilled', (p) => { if (p && p.boss) { const ln = p.boss.def && p.boss.def.lines; if (ln && ln.death && !G.BossAttacks.config.noLines) { const a = API(), nm = p.boss.def.name || ''; if (a && a.after) a.after(1.2, () => { if (G.UI && G.UI.toast) G.UI.toast('« ' + ln.death + ' » — ' + nm); }); } purgeBoss(p.boss); S.boss = null; } });
      G.bus.on('playerDodge', () => { S.lastRoll = S.time; });
    }
    if (G.hooks && G.hooks.add) G.hooks.add('incomingDamage', incoming, 5);
    initGear();
    if (G.input && G.input.onAction) G.input.onAction((name) => { if (name === 'dash') S.lastRoll = S.time; });
    // IA des adds de mécaniques (immobiles)
    if (G.AI && G.AI.register && !(G.AI.has && G.AI.has('boss_static'))) G.AI.register('boss_static', { init() { }, update(e, dt, api) { e.vx = 0; e.vz = 0; } });
  }

  // ------------------------------------------------------------------ API publique
  ensureMechs();
  init();
  registerGearFx();
  Object.assign(G.BossAttacks, {
    state: S, phaseOf, tick, clear: clearAll, ensureMechs, registerMech, startMech, tickMech, incoming,
    helpers: { strikeCircle, strikeLine, zone, addPillar, spawnAdd, stagger, shieldStart, safeZoneBlast, spawnEchoes, stunPlayer, losBlocked },
    /** résumé : ids d'attaques non natives (pour game.js / QA) */
    attackIds() { return G.BossAttacks.ids().filter(i => i.indexOf('mech_') !== 0); },
    mechIds() { return G.BossAttacks.ids().filter(i => i.indexOf('mech_') === 0); },
    NATIVE: ['rock', 'slam', 'wave', 'summon', 'charge', 'spread', 'nova', 'rain'],
    /** appelé par game.js quand une salle de boss démarre (facultatif : sinon auto) */
    config: { noLines: false },
    attach(boss) { state(boss); registerMech(boss.id); startMech(boss); const ln = boss.def && boss.def.lines; if (ln && ln.intro && !G.BossAttacks.config.noLines && G.UI && G.UI.toast) G.UI.toast('« ' + ln.intro + ' »'); },
    registerGear: registerGearFx, props: PROPS, setArmor,
    /** lance une attaque par id ; renvoie le handle ou null si native/inconnue */
    start(id, boss, phase) { const d = G.BossAttacks.get(id); if (!d || !d.execute) return null; return d.execute(boss, API(), phase); },
  });
})();
