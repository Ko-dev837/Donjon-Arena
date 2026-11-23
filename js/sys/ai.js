/* =====================================================================
 *  Donjon Arena 3D v3 — IA DES MONSTRES + CAPACITÉS (rôle 9)
 *
 *  1) G.AI.register(id, {init(e, api), update(e, dt, api), selfMoving:true})
 *     Nouveaux comportements : flanker support guardian burrower kiter bomber mimic
 *     fleeing pack summoner teleporter turret.
 *     v5 horreur : ambusher weeping stalker mimic_wall screamer crawler hunter possessor brute statue secret.
 *     (melee ranged charger swarm caster restent natifs à game.js.)
 *     → update() DÉPLACE, ORIENTE et ANIME l'ennemi lui-même (selfMoving) ;
 *       game.js n'a qu'à l'appeler à la place de son switch (voir « Demandes aux autres »).
 *     Tout passe par G.SkillAPI (api) ; si une fonction facultative manque
 *     (moveEnemy, segmentBlocked, despawnEnemy), un repli local est utilisé.
 *
 *  2) Capacités (def.abilities + affixes d'élites) pilotées par le bus : tick, enemyKilled,
 *     playerHit, runStart/roomStart/runEnd.  Aucune action requise de game.js.
 *     enrage regen lifesteal deathExplosion blink summon poisonTouch splitOnDeath barrier
 *
 *  Toutes les attaques sont télégraphiées (G.GFX.makeTelegraph) et esquivables.
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const SKA = () => G.SkillAPI;
  let UID = 0;

  const ELEMENT_COLOR = { feu: 0xff7a2a, glace: 0x9be7ff, foudre: 0xffe14a, ombre: 0x8a4fd0, sacre: 0xfff2a8, poison: 0x7cc82a, physique: 0xd8d0c0 };
  const elColor = (e) => ELEMENT_COLOR[(e.def && e.def.element) || 'physique'] || 0xd8d0c0;

  // ------------------------------------------------------------------
  //  Utilitaires
  // ------------------------------------------------------------------
  function norm2(x, z) { const d = Math.hypot(x, z) || 1; return { x: x / d, z: z / d }; }
  function rot2(v, a) { const c = Math.cos(a), s = Math.sin(a); return { x: v.x * c - v.z * s, z: v.x * s + v.z * c }; }
  function lerpAngle(a, b, k) { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * k; }

  function statusOn(e, id) {
    const s = e.statuses && e.statuses[id];
    if (!s) return false;
    if (typeof s === 'object') { const t = s.t != null ? s.t : s.time != null ? s.time : s.remaining != null ? s.remaining : s.duration; return t == null ? true : t > 0; }
    return s > 0 || s === true;
  }
  function ensure(e) {
    if (!e._a) e._a = { uid: ++UID, st: 'move', t: 0, cd: rnd(0.4, 1.1), teles: [], lg: null, side: Math.random() < 0.5 ? -1 : 1 };
    return e._a;
  }
  const wnd = (e, base) => Math.max(0.35, base * (1 - 0.15 * num(e.def && e.def.aggro, 0)));
  const sceneRoot = (api) => { const r = api && api.run && api.run(); return (r && r.root) || (G.core && G.core.scene) || null; };
  const playerRadius = (P) => num(P && (P.r || P.radius), 0.45);

  // --- télégraphes
  function mkTele(api, kind, size) {
    if (!G.GFX || !G.GFX.makeTelegraph) return null;
    const g = G.GFX.makeTelegraph(kind, size);
    const root = sceneRoot(api);
    if (g && root) root.add(g);
    return g;
  }
  function teleCircle(a, api, x, z, r) { const g = mkTele(api, 'circle', r); if (g) { g.position.set(x, 0.05, z); a && a.teles.push(g); } return g; }
  function teleRing(a, api, x, z, r) { const g = mkTele(api, 'ring', r); if (g) { g.position.set(x, 0.05, z); a && a.teles.push(g); } return g; }
  function teleLine(a, api, x, z, dir, len, w) {
    const g = mkTele(api, 'line', { length: len, width: w || 1 });
    if (g) { g.position.set(x, 0.05, z); g.rotation.y = Math.atan2(dir.x, dir.z); a && a.teles.push(g); }
    return g;
  }
  const teleSet = (g, k) => { if (g && g.userData && g.userData.setProgress) g.userData.setProgress(clamp(k, 0, 1)); };
  function teleDel(g) { if (g && g.parent) g.parent.remove(g); }
  function clearTeles(a) { if (!a) return; a.teles.forEach(teleDel); a.teles.length = 0; }

  // --- effets
  const fx = {
    ring(x, z, color, r, life) { if (G.fx && G.fx.ring) G.fx.ring(V3(x, 0.05, z), color, r, life || 0.5); },
    burst(x, y, z, color, n, o) { if (G.fx && G.fx.burst) G.fx.burst(V3(x, y, z), color, n || 10, o || { speed: 4, up: 3, life: 0.5, size: 0.15 }); },
    text(x, y, z, t, color, size) { if (G.fx && G.fx.text) G.fx.text(V3(x, y, z), t, color || '#ffffff', size || 1); },
  };
  const sfx = (api, n) => { try { api.sfx && api.sfx(n); } catch (_) { /* rien */ } };
  function flash(e, k, color) { if ((e.flashK || 0) < k) { e.flashK = k; e.flashColor = color || 0xff3030; } }

  function setLabel(e) { if (e.label && e.label.set) e.label.set(Math.max(0, e.pv) / (e.pvMax || 1)); }
  function healEnemy(t, n) {
    const before = t.pv;
    t.pv = Math.min(t.pvMax, t.pv + n);
    setLabel(t);
    const got = Math.round(t.pv - before);
    if (got > 0) fx.text(t.pos.x, (t.height || 1.5) + 0.3, t.pos.z, '+' + got, '#5dff8a', 0.9);
    return got;
  }
  function hurt(e, c, amount, element) {
    const api = c.api;
    amount = Math.max(1, Math.round(amount));
    if (api.damagePlayer) api.damagePlayer(amount, { element: element || (e.def && e.def.element) || 'physique', source: e });
  }

  // --- position libre / LOS
  function obstacles(api) { const r = api.run && api.run(); return (r && r.obstacles) || []; }
  function freeSpot(api, x, z, rad) {
    const obs = obstacles(api);
    for (let i = 0; i < 10; i++) {
      const px = clamp(x, -12, 12), pz = clamp(z, -12, 12);
      if (!obs.some((o) => Math.abs(px - o.x) < o.hw + rad && Math.abs(pz - o.z) < o.hd + rad)) return { x: px, z: pz };
      const a = Math.random() * TAU; x += Math.cos(a) * 1.5; z += Math.sin(a) * 1.5;
    }
    return { x: clamp(x, -12, 12), z: clamp(z, -12, 12) };
  }
  function blocked(api, x0, z0, x1, z1) { return api.segmentBlocked ? !!api.segmentBlocked(x0, z0, x1, z1) : false; }

  // --- déplacement (repli local si api.moveEnemy est absent)
  function stepLocal(e, vx, vz, dt, api, noClip) {
    e.pos.x += (vx + (e.kbx || 0)) * dt; e.pos.z += (vz + (e.kbz || 0)) * dt;
    const dec = Math.exp(-8 * dt); e.kbx = (e.kbx || 0) * dec; e.kbz = (e.kbz || 0) * dec;
    let hit = false;
    const r = e.r || 0.5;
    if (!noClip) {
      for (const o of obstacles(api)) {
        const cx = clamp(e.pos.x, o.x - o.hw, o.x + o.hw), cz = clamp(e.pos.z, o.z - o.hd, o.z + o.hd);
        const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 1e-6) { const d = Math.sqrt(d2); e.pos.x = cx + dx / d * r; e.pos.z = cz + dz / d * r; }
          else e.pos.x = o.x + (e.pos.x >= o.x ? 1 : -1) * (o.hw + r);
        }
      }
    }
    const lim = 14 - r;
    const bx = e.pos.x, bz = e.pos.z;
    e.pos.x = clamp(e.pos.x, -lim, lim); e.pos.z = clamp(e.pos.z, -lim, lim);
    return hit || bx !== e.pos.x || bz !== e.pos.z;
  }

  /** begin : préambule commun. Renvoie le contexte c, ou null si l'ennemi ne doit pas agir cette frame. */
  function begin(e, dt, api) {
    const a = ensure(e);
    if (e.dead || !api || !api.player) return null;
    if (e.spawnT > 0) return null;
    const P = api.player();
    if (!P || !P.pos) return null;
    const c = { a, P, pp: P.pos, dt, api, now: now() };
    c.dx = P.pos.x - e.pos.x; c.dz = P.pos.z - e.pos.z;
    c.d = Math.hypot(c.dx, c.dz) || 0.001;
    c.u = { x: c.dx / c.d, z: c.dz / c.d };
    c.pr = playerRadius(P);
    const slow = statusOn(e, 'slow') || e.slowT > 0;
    c.spd = num(e.speed, 3) * (slow ? 0.55 : 1);
    a.cd -= dt; a.t -= dt;
    if (a.jinkCd != null) a.jinkCd -= dt;
    c.dead = P.pv != null && P.pv <= 0;
    const stunned = statusOn(e, 'stun') || statusOn(e, 'freeze');
    if (stunned && !a.noStun) {
      if (a.st !== 'move' && a.st !== 'idle') { clearTeles(a); a.lg = null; a.st = a.home || 'move'; a.cd = Math.max(a.cd, 0.8); }
      go(e, c, 0, 0, {});
      return null;
    }
    if (c.dead) { go(e, c, 0, 0, { face: c.u }); return null; }
    if (statusOn(e, 'fear') && !a.noStun && num(e.speed, 1) > 0) {
      clearTeles(a); a.lg = null;
      go(e, c, -c.u.x * c.spd * 1.1, -c.u.z * c.spd * 1.1, { face: { x: -c.u.x, z: -c.u.z } });
      return null;
    }
    return c;
  }

  /** go : applique le déplacement, l'orientation et l'animation. o:{face, windup, attack, noClip} */
  function go(e, c, vx, vz, o) {
    o = o || {};
    const api = c.api, a = c.a;
    let hit;
    if (!o.noClip && api.moveEnemy) hit = !!api.moveEnemy(e, vx, vz, c.dt);
    else hit = stepLocal(e, vx, vz, c.dt, api, o.noClip);
    a.wallHit = hit;
    let f = o.face;
    if (!f && Math.hypot(vx, vz) > 0.2) f = norm2(vx, vz);
    if (f && e.mesh) e.mesh.rotation.y = lerpAngle(e.mesh.rotation.y, Math.atan2(f.x, f.z), 1 - Math.exp(-c.dt * 10));
    if (G.GFX && G.GFX.animateCharacter && e.mesh) {
      G.GFX.animateCharacter(e.mesh, c.now + (e.animOff || 0), { moving: Math.hypot(vx, vz) > 0.3, windup: clamp(o.windup || 0, 0, 1), attack: clamp(o.attack || 0, 0, 1) });
    }
  }
  const toward = (e, tx, tz, spd) => { const n = norm2(tx - e.pos.x, tz - e.pos.z); return { vx: n.x * spd, vz: n.z * spd }; };

  function shoot(e, c, dir, o) {
    const api = c.api, d = e.def;
    o = o || {};
    const sp = o.speed || num(d.projSpeed, 11);
    if (!api.projectile) return;
    api.projectile({
      pos: V3(e.pos.x + dir.x * (e.r + 0.3), 1.0, e.pos.z + dir.z * (e.r + 0.3)), dir: V3(dir.x, 0, dir.z), speed: sp,
      model: o.model || d.projectile || 'orb', damage: o.damage != null ? o.damage : e.dmg, element: o.element || d.element || 'physique',
      radius: o.radius || 0.3, life: o.life || 22 / sp, pierce: !!o.pierce, owner: 'enemy', source: e,
    });
  }
  function fireFan(e, c, base, n, spread, o) {
    for (let i = 0; i < n; i++) {
      const ang = n === 1 ? 0 : -spread / 2 + spread * i / (n - 1);
      shoot(e, c, rot2(base, ang), o);
    }
  }
  const burstCount = (e) => { const b = num(e.def.burst, 1); return b >= 2 && num(e.def.aggro, 0) >= 0.6 ? b + 1 : b; };

  // ------------------------------------------------------------------
  //  Fente (flanker / pack / mimique) : windup télégraphé → dash → récupération
  // ------------------------------------------------------------------
  const DASH = 12;
  function lungeBegin(e, c, len, wind, left) {
    const a = c.a;
    a.lg = { ph: 'wind', t: wnd(e, wind), tot: wnd(e, wind), dir: { x: c.u.x, z: c.u.z }, len, hit: false, left: left || 1, wind, tele: teleLine(a, c.api, e.pos.x, e.pos.z, c.u, len, 1.1) };
    sfx(c.api, 'spawn');
  }
  function lungeStep(e, c) {
    const a = c.a, L = a.lg;
    if (!L) return false;
    if (L.ph === 'wind') {
      L.t -= c.dt;
      const k = 1 - L.t / L.tot;
      teleSet(L.tele, k);
      if (L.tele) { L.tele.position.set(e.pos.x, 0.05, e.pos.z); }
      flash(e, 0.5 * k, 0xff3030);
      go(e, c, 0, 0, { face: L.dir, windup: k });
      if (L.t <= 0) { teleDel(L.tele); L.ph = 'dash'; L.t = L.len / DASH; L.hit = false; }
      return true;
    }
    if (L.ph === 'dash') {
      L.t -= c.dt;
      go(e, c, L.dir.x * DASH, L.dir.z * DASH, { face: L.dir, attack: 1 });
      fx.burst(e.pos.x, 0.4, e.pos.z, 0xd8d0c0, 1, { speed: 1, up: 1, life: 0.25, size: 0.12 });
      if (!L.hit && Math.hypot(c.pp.x - e.pos.x, c.pp.z - e.pos.z) < e.r + c.pr + 0.3) { L.hit = true; hurt(e, c, e.dmg); }
      if (L.t <= 0 || a.wallHit) { L.ph = 'rec'; L.t = 0.5; }
      return true;
    }
    L.t -= c.dt;
    go(e, c, 0, 0, { face: c.u, attack: Math.max(0, L.t / 0.5) });
    if (L.t <= 0) {
      if (L.left > 1) { const left = L.left - 1, len = L.len, w = L.wind; a.lg = null; lungeBegin(e, c, len, w * 0.7, left); }
      else { a.lg = null; a.cd = e.attackCd; }
    }
    return true;
  }

  // ------------------------------------------------------------------
  //  Noyau « à distance » (kiter, base des lanceurs) : garde ses distances, vise, tire, recule
  // ------------------------------------------------------------------
  function kiterCore(e, c, o) {
    const a = c.a, d = e.def;
    o = o || {};
    const far = o.far || num(d.range, 9), near = o.near || Math.max(2.5, far * 0.55);
    if (a.st === 'aim') {
      const k = 1 - a.t / a.tot;
      go(e, c, 0, 0, { face: a.lock, windup: k });
      flash(e, 0.45 * k, 0xff6030);
      if (a.tele) { teleSet(a.tele, k); a.tele.position.set(e.pos.x, 0.05, e.pos.z); }
      if (a.t <= 0) {
        clearTeles(a); a.tele = null;
        fireFan(e, c, a.lock, o.burst || burstCount(e), 0.3 * ((o.burst || burstCount(e)) - 1));
        sfx(c.api, 'arrow');
        a.cd = e.attackCd; a.st = o.retreat === false ? 'move' : 'recoil'; a.t = 0.55;
      }
      return;
    }
    if (a.st === 'recoil') {
      go(e, c, -c.u.x * c.spd * 1.3, -c.u.z * c.spd * 1.3, { face: c.u, attack: Math.max(0, a.t / 0.55) });
      if (a.t <= 0 || a.wallHit) a.st = 'move';
      return;
    }
    if (a.st === 'sidestep') {
      go(e, c, a.sd.x * c.spd * 2.6, a.sd.z * c.spd * 2.6, { face: c.u });
      if (a.t <= 0) a.st = 'move';
      return;
    }
    // 'move'
    a.strafeT = (a.strafeT == null ? rnd(1, 2.5) : a.strafeT) - c.dt;
    if (a.strafeT <= 0) { a.side *= -1; a.strafeT = rnd(1.5, 3); }
    const los = !blocked(c.api, e.pos.x, e.pos.z, c.pp.x, c.pp.z);
    let mx = 0, mz = 0;
    if (c.d < near) { mx = -c.u.x; mz = -c.u.z; } else if (c.d > far || !los) { mx = c.u.x; mz = c.u.z; }
    mx += -c.u.z * a.side * 0.7; mz += c.u.x * a.side * 0.7;
    const n = norm2(mx, mz), sm = o.speedMul || 1;
    go(e, c, n.x * c.spd * sm, n.z * c.spd * sm, { face: c.u });
    if (a.wallHit) {
      if (c.d < near && a.cd < 1) { a.st = 'sidestep'; a.t = 0.3; a.sd = { x: -c.u.z * a.side, z: c.u.x * a.side }; }
      else a.side *= -1;
    }
    if (a.cd <= 0 && los && c.d <= far + 1.5 && num(d.dmg, 0) > 0 && d.projectile) {
      a.st = 'aim'; a.tot = a.t = wnd(e, 0.65); a.lock = { x: c.u.x, z: c.u.z };
      a.tele = teleLine(a, c.api, e.pos.x, e.pos.z, a.lock, 13, 0.7);
    }
  }

  // ------------------------------------------------------------------
  //  Alliés / buffs / boucliers (partagés IA + capacités)
  // ------------------------------------------------------------------
  function alliesOf(e, api, r) {
    return api.enemies().filter((x) => x !== e && !x.dead && !(x.spawnT > 0) && !x.boss && Math.hypot(x.pos.x - e.pos.x, x.pos.z - e.pos.z) <= r);
  }
  function buff(e, id, dur, o) {
    o = o || {};
    const m = e._mb || (e._mb = {});
    if (m[id]) { m[id].t = Math.max(m[id].t, dur); return; }
    const b = { t: dur, sp: o.speed || 1, cd: o.attackCd || 1 };
    if (b.sp !== 1) e.speed *= b.sp;
    if (b.cd !== 1) e.attackCd *= b.cd;
    m[id] = b;
    fx.ring(e.pos.x, e.pos.z, 0xffe14a, 1.2, 0.4);
  }
  function tickBuffs(e, dt) {
    const m = e._mb; if (!m) return;
    for (const id of Object.keys(m)) {
      const b = m[id]; b.t -= dt;
      if (b.t <= 0) { if (b.sp !== 1) e.speed /= b.sp; if (b.cd !== 1) e.attackCd /= b.cd; delete m[id]; }
    }
  }
  let BUB_GEO = null, BUB_MAT = null;
  function setShield(e, amount, dur) {
    e.shield = Math.max(e.shield || 0, amount); e.shieldT = Math.max(e.shieldT || 0, dur);
    if (!e._bub && e.mesh) {
      BUB_GEO = BUB_GEO || new THREE.SphereGeometry(1, 12, 8);
      BUB_MAT = BUB_MAT || new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.28, depthWrite: false });
      BUB_GEO.userData.shared = BUB_MAT.userData.shared = true;   // partagés : jamais libérés au nettoyage de salle
      const b = new THREE.Mesh(BUB_GEO, BUB_MAT);
      b.userData.noOutline = true;
      const s = e.mesh.scale.x || 1;
      b.scale.setScalar(Math.max(e.r, 0.5) * 1.35 / s);
      b.position.y = (e.height || 1.5) * 0.5 / s;
      e.mesh.add(b); e._bub = b;
    }
    fx.ring(e.pos.x, e.pos.z, 0x6fd0ff, 1.4, 0.4);
  }
  function dropShield(e) { e.shield = 0; e.shieldT = 0; if (e._bub) { if (e._bub.parent) e._bub.parent.remove(e._bub); e._bub = null; } }

  // ------------------------------------------------------------------
  //  Temporisateurs globaux (liés au run) + zones télégraphiées
  // ------------------------------------------------------------------
  let CLOCK = 0;   // horloge de jeu (somme des dt du bus tick) : ne dépend pas de l'horloge murale
  let LATER = [];
  const POI = { t: 0, tick: 0, dmg: 0 };
  function later(delay, fn, tele) { LATER.push({ t: delay, tot: delay, fn, tele }); }
  function clearLater() { LATER.forEach((l) => teleDel(l.tele)); LATER = []; POI.t = 0; }
  /** Zone explosive télégraphiée : dégâts au joueur s'il est dedans à l'impact. */
  function zone(api, x, z, r, delay, dmg, element, src, color) {
    const tele = teleCircle(null, api, x, z, r);
    later(delay, () => {
      teleDel(tele);
      const P = api.player && api.player();
      fx.burst(x, 0.8, z, color || 0xff8a2a, 24, { speed: 6, up: 4, life: 0.6, size: 0.22 });
      fx.ring(x, z, color || 0xff8a2a, r, 0.5);
      sfx(api, 'boom'); api.shake && api.shake(0.3);
      if (P && P.pos && Math.hypot(P.pos.x - x, P.pos.z - z) <= r + playerRadius(P) && api.damagePlayer) api.damagePlayer(Math.max(1, Math.round(dmg)), { element, source: src });
    }, tele);
    const L = LATER[LATER.length - 1];
    L.prog = (k) => teleSet(tele, k);
  }
  function spawnMinions(e, api, id, n, max) {
    const m = e._m || (e._m = { ab: [], s: {} });
    m.minions = (m.minions || []).filter((x) => x && !x.dead);
    if (!m.minionsTracked) m.minionsTracked = true;
    let alive = m.minions.length;
    for (let i = 0; i < n && alive < max; i++) {
      const ang = Math.random() * TAU, rr = rnd(1.8, 2.8);
      const p = freeSpot(api, e.pos.x + Math.cos(ang) * rr, e.pos.z + Math.sin(ang) * rr, 0.6);
      const tele = teleCircle(null, api, p.x, p.z, 0.9);
      alive++;
      later(0.9, () => {
        teleDel(tele);
        if (e.dead || !api.spawnEnemy) return;
        const mn = api.spawnEnemy(id, V3(p.x, 0, p.z), {});
        if (mn && typeof mn === 'object') m.minions.push(mn);
        fx.burst(p.x, 0.5, p.z, 0x8a4fd0, 12, { speed: 3, up: 3, life: 0.5, size: 0.15 });
      }, tele);
      LATER[LATER.length - 1].prog = (k) => teleSet(tele, k);
    }
  }
  function despawn(e, api) {
    if (e.dead) return;
    fx.burst(e.pos.x, 1, e.pos.z, 0xffd23f, 20, { speed: 5, up: 4, life: 0.7, size: 0.2 });
    fx.text(e.pos.x, 2, e.pos.z, "Il s'est échappé !", '#ffd23f', 1.2);
    if (api.despawnEnemy) api.despawnEnemy(e, { escaped: true });
    else {
      e.dead = true;
      clearTeles(e._a);
      if (e.label && e.label.remove) e.label.remove();
      if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
    }
    if (G.bus) G.bus.emit('enemyEscaped', { enemy: e });
  }
  function selfDestruct(e, api) {
    e._a.exploded = true;
    if (api.damage) api.damage(e, e.pvMax * 100 + 999, { kind: 'dot', canCrit: false, source: 'selfdestruct' });
    if (!e.dead) { e.pv = 0; }
  }

  // ------------------------------------------------------------------
  //  COMPORTEMENTS
  // ------------------------------------------------------------------
  const AIS = {};

  // --- flanker : contourne et frappe dans le dos
  AIS.flanker = {
    update(e, c) {
      const a = c.a;
      if (lungeStep(e, c)) return;
      const L = e.def.lunge || { len: 3.2, windup: 0.45 };
      const pd = c.P.dir && Math.hypot(c.P.dir.x, c.P.dir.z) > 0.1 ? norm2(c.P.dir.x, c.P.dir.z) : { x: c.u.x, z: c.u.z };
      let tx, tz;
      if (c.d > 8) { tx = c.pp.x - c.u.z * a.side * 3; tz = c.pp.z + c.u.x * a.side * 3; }
      else { const r = rot2({ x: -pd.x, z: -pd.z }, a.side * 0.6); tx = c.pp.x + r.x * 2.8; tz = c.pp.z + r.z * 2.8; }
      const v = toward(e, tx, tz, c.spd);
      if (Math.hypot(tx - e.pos.x, tz - e.pos.z) < 0.8) { v.vx *= 0.2; v.vz *= 0.2; }
      go(e, c, v.vx, v.vz, { face: c.d < 7 ? c.u : null });
      if (a.wallHit && Math.random() < 0.05) a.side *= -1;
      if (a.cd <= 0 && c.d <= L.len + 1 && c.d >= 1.1) lungeBegin(e, c, L.len, L.windup, L.combo || 1);
    },
  };

  // --- pack : encerclement + attaque à tour de rôle
  const PACKS = {};
  function packOf(e, c) {
    const tag = e.def.packTag || e.id;
    const t = CLOCK;
    let pk = PACKS[tag];
    if (!pk || t - pk.stamp > 0.04) {
      const old = pk;
      const m = c.api.enemies().filter((x) => !x.dead && x.def && x.ai === e.ai && (x.def.packTag || x.id) === tag && !(x.spawnT > 0));
      m.forEach(ensure);
      m.sort((p, q) => p._a.uid - q._a.uid);
      const dt = old ? Math.min(0.1, t - old.stamp) : 0;
      pk = { stamp: t, members: m, phase: old ? old.phase + dt * 0.45 : 0, next: old ? old.next - dt : 1.2, count: old ? old.count : 0, go: old ? old.go : {}, howled: old ? old.howled : false };
      if (m.length >= 3 && !pk.howled) {
        pk.howled = true;
        m.forEach((x) => buff(x, 'haste', 4, { speed: 1.15 }));
        fx.text(m[0].pos.x, 2.2, m[0].pos.z, 'Hurlement !', '#ffb04a', 1.1);
      }
      if (m.length && pk.next <= 0) {
        const cand = m.filter((x) => x._a.cd <= 0 && !x._a.lg && Math.hypot(x.pos.x - c.pp.x, x.pos.z - c.pp.z) <= 11)
          .sort((p, q) => Math.hypot(p.pos.x - c.pp.x, p.pos.z - c.pp.z) - Math.hypot(q.pos.x - c.pp.x, q.pos.z - c.pp.z));
        const k = m.length >= 4 && pk.count % 3 === 2 ? 2 : 1;
        for (let i = 0; i < Math.min(k, cand.length); i++) pk.go[cand[i]._a.uid] = true;
        if (cand.length) pk.count++;
        const ag = num(e.def.aggro, 0);
        pk.next = cand.length ? clamp(2.5 - 0.6 * ag - 0.12 * m.length, 1.2, 3) : 0.5;
      }
      PACKS[tag] = pk;
    }
    return pk;
  }
  AIS.pack = {
    update(e, c) {
      const a = c.a;
      if (lungeStep(e, c)) return;
      const pk = packOf(e, c);
      if (pk.go[a.uid] && a.cd <= 0 && c.d <= 11 && c.d >= 1.5) {
        delete pk.go[a.uid];
        lungeBegin(e, c, Math.min(6, c.d + 1.5), 0.55, 1);
        return;
      }
      const n = pk.members.length, idx = Math.max(0, pk.members.indexOf(e));
      if (n <= 1) {   // loup solitaire : plus direct
        const v = toward(e, c.pp.x, c.pp.z, c.spd);
        go(e, c, c.d > 3.5 ? v.vx : 0, c.d > 3.5 ? v.vz : 0, { face: c.u });
        if (a.cd <= 0 && c.d <= 6 && c.d >= 1.5) lungeBegin(e, c, c.d + 1.2, 0.55, 1);
        return;
      }
      const th = pk.phase + idx * TAU / n, R = 4.6;
      const tx = c.pp.x + Math.cos(th) * R, tz = c.pp.z + Math.sin(th) * R;
      let v = toward(e, tx, tz, c.spd * 1.1);
      const dd = Math.hypot(tx - e.pos.x, tz - e.pos.z);
      if (dd < 0.6) { v = { vx: 0, vz: 0 }; }
      else if (dd < 2) { v.vx *= dd / 2; v.vz *= dd / 2; }
      go(e, c, v.vx, v.vz, { face: c.u });
    },
  };

  // --- support : soigne et hâte ses alliés, garde ses distances
  AIS.support = {
    update(e, c) {
      const a = c.a, api = c.api, d = e.def;
      if (a.st === 'cast') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: c.u, windup: k });
        flash(e, 0.4 * k, 0x5dff8a);
        if (a.tele) teleSet(a.tele, k);
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          if (a.kind === 'heal' && a.target && !a.target.dead) {
            healEnemy(a.target, a.target.pvMax * num(d.healPct, 0.25));
            fx.ring(a.target.pos.x, a.target.pos.z, 0x5dff8a, 1.6, 0.5);
            fx.burst(a.target.pos.x, 1, a.target.pos.z, 0x5dff8a, 12, { speed: 3, up: 4, life: 0.6, size: 0.14 });
          } else if (a.kind === 'haste') {
            alliesOf(e, api, 6).forEach((x) => buff(x, 'haste', 5, { speed: 1.3, attackCd: 0.8 }));
            fx.text(e.pos.x, 2.2, e.pos.z, 'Hâte !', '#ffe14a', 1);
          }
          a.st = 'move'; a.cd = e.attackCd * 2.2;
        }
        return;
      }
      const allies = alliesOf(e, api, 12);
      const wounded = allies.filter((x) => x.pv / x.pvMax < 0.8).sort((p, q) => p.pv / p.pvMax - q.pv / q.pvMax)[0];
      if (a.cd <= 0 && allies.length && c.d > 3.5) {
        const ready = allies.filter((x) => !(x._mb && x._mb.haste));
        if (wounded) { a.st = 'cast'; a.kind = 'heal'; a.target = wounded; a.tot = a.t = wnd(e, 0.9); a.tele = teleRing(a, api, wounded.pos.x, wounded.pos.z, 1.2); return; }
        if (ready.length >= 2) { a.st = 'cast'; a.kind = 'haste'; a.tot = a.t = wnd(e, 0.8); a.tele = teleRing(a, api, e.pos.x, e.pos.z, 2.2); return; }
      }
      if (!allies.length || a.st !== 'move') { kiterCore(e, c, { burst: 1 }); return; }
      // reste près du groupe, loin du joueur
      let mx = 0, mz = 0;
      if (c.d < 5.5) { mx -= c.u.x * 1.2; mz -= c.u.z * 1.2; }
      let cx = 0, cz = 0; allies.forEach((x) => { cx += x.pos.x; cz += x.pos.z; }); cx /= allies.length; cz /= allies.length;
      if (Math.hypot(cx - e.pos.x, cz - e.pos.z) > 3.5) { const n = norm2(cx - e.pos.x, cz - e.pos.z); mx += n.x; mz += n.z; }
      mx += -c.u.z * a.side * 0.2; mz += c.u.x * a.side * 0.2;
      const n = norm2(mx, mz), mag = Math.hypot(mx, mz) < 0.3 ? 0 : 1;
      go(e, c, n.x * c.spd * mag, n.z * c.spd * mag, { face: c.u });
      if (a.wallHit) a.side *= -1;
      // tir de harcèlement léger si personne à soigner
      if (a.cd <= 0 && d.projectile && c.d < 10 && !wounded) { a.st = 'aim'; a.tot = a.t = wnd(e, 0.7); a.lock = { x: c.u.x, z: c.u.z }; a.tele = teleLine(a, api, e.pos.x, e.pos.z, a.lock, 12, 0.7); }
    },
  };

  // --- guardian : barrière sur les alliés + coup de bouclier
  AIS.guardian = {
    update(e, c) {
      const a = c.a, api = c.api;
      a.shieldCd = (a.shieldCd == null ? rnd(1, 3) : a.shieldCd) - c.dt;
      a.bashCd = (a.bashCd == null ? 1 : a.bashCd) - c.dt;
      if (a.st === 'shield') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: c.u, windup: k });
        flash(e, 0.35 * k, 0x6fd0ff);
        if (a.tele) { teleSet(a.tele, k); a.tele.position.set(e.pos.x, 0.05, e.pos.z); }
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          const pct = num(e.def.shieldPct, 0.3);
          alliesOf(e, api, 5).concat([e]).forEach((x) => setShield(x, Math.max(6, x.pvMax * pct), 6));
          sfx(api, 'upgrade');
          a.st = 'move'; a.shieldCd = 7;
        }
        return;
      }
      if (a.st === 'bash') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: a.lock, windup: k });
        flash(e, 0.5 * k, 0xff3030);
        if (a.tele) teleSet(a.tele, k);
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          const bx = e.pos.x + a.lock.x * 1.3, bz = e.pos.z + a.lock.z * 1.3;
          fx.ring(bx, bz, 0xcfd6e6, 1.7, 0.3); sfx(api, 'slam'); api.shake && api.shake(0.2);
          if (Math.hypot(c.pp.x - bx, c.pp.z - bz) <= 1.7 + c.pr) hurt(e, c, e.dmg * 1.1);
          a.st = 'recover'; a.t = 0.5; a.bashCd = e.attackCd;
        }
        return;
      }
      if (a.st === 'recover') { go(e, c, 0, 0, { face: c.u, attack: Math.max(0, a.t / 0.5) }); if (a.t <= 0) a.st = 'move'; return; }
      const allies = alliesOf(e, api, 12);
      const unshielded = allies.filter((x) => !(x.shield > 0));
      if (a.shieldCd <= 0 && (unshielded.length || !(e.shield > 0)) && c.d > 2.5) {
        a.st = 'shield'; a.tot = a.t = wnd(e, 0.9); a.tele = teleRing(a, api, e.pos.x, e.pos.z, 5); return;
      }
      if (c.d <= num(e.def.range, 1.8) + 0.9 && a.bashCd <= 0) {
        a.st = 'bash'; a.tot = a.t = wnd(e, 0.55); a.lock = { x: c.u.x, z: c.u.z };
        a.tele = teleCircle(a, api, e.pos.x + c.u.x * 1.3, e.pos.z + c.u.z * 1.3, 1.7); return;
      }
      // se place devant ses alliés (entre eux et le joueur) ou charge s'il est seul
      let tx = c.pp.x, tz = c.pp.z;
      if (allies.length) {
        let cx = 0, cz = 0; allies.forEach((x) => { cx += x.pos.x; cz += x.pos.z; }); cx /= allies.length; cz /= allies.length;
        const n = norm2(c.pp.x - cx, c.pp.z - cz);
        tx = cx + n.x * 2.4; tz = cz + n.z * 2.4;
        if (Math.hypot(tx - e.pos.x, tz - e.pos.z) < 0.8) { tx = c.pp.x; tz = c.pp.z; }
      }
      const v = toward(e, tx, tz, c.spd);
      go(e, c, c.d > 1.6 ? v.vx : 0, c.d > 1.6 ? v.vz : 0, { face: c.u });
    },
  };

  // --- burrower : s'enfouit, avance sous terre, surgit sous un cercle annoncé
  AIS.burrower = {
    init(e) { ensure(e).noStun = false; },
    update(e, c) {
      const a = c.a, api = c.api, R = num(e.def.blastRadius, 2.0);
      const under = a.st === 'dive' || a.st === 'under' || a.st === 'warn';
      a.noStun = a.st === 'under' || a.st === 'warn';
      e.untargetable = under; e.hidden = a.st === 'under' || a.st === 'warn';
      if (a.st === 'move') {
        const v = toward(e, c.pp.x, c.pp.z, c.spd);
        go(e, c, c.d > 2 ? v.vx : 0, c.d > 2 ? v.vz : 0, { face: c.u });
        if (a.cd <= 0 && c.d <= 9) { a.st = 'dive'; a.t = a.tot = 0.5; fx.burst(e.pos.x, 0.3, e.pos.z, 0x8a6a40, 14, { speed: 3, up: 3, life: 0.5, size: 0.2 }); }
        return;
      }
      if (a.st === 'dive') {
        const k = 1 - a.t / a.tot;
        e.pos.y = -1.5 * k;
        go(e, c, 0, 0, { face: c.u, windup: k, noClip: true });
        if (a.t <= 0) { a.st = 'under'; a.t = rnd(1.2, 1.6); a.dirt = 0; if (e.mesh) e.mesh.visible = false; }
        return;
      }
      if (a.st === 'under') {
        e.pos.y = -1.5;
        const v = toward(e, c.pp.x, c.pp.z, c.spd * 1.8);
        go(e, c, v.vx, v.vz, { noClip: true });
        a.dirt -= c.dt;
        if (a.dirt <= 0) { a.dirt = 0.1; fx.burst(e.pos.x, 0.2, e.pos.z, 0x8a6a40, 3, { speed: 2, up: 2, life: 0.4, size: 0.18 }); }
        if (a.t <= 0 || c.d < 2.2) {
          a.st = 'warn'; a.tot = a.t = wnd(e, 0.9) + 0.1;
          a.sx = c.pp.x; a.sz = c.pp.z;                       // point d'éruption verrouillé
          a.tele = teleCircle(a, api, a.sx, a.sz, R);
          sfx(api, 'slam');
        }
        return;
      }
      if (a.st === 'warn') {
        const k = 1 - a.t / a.tot;
        teleSet(a.tele, k);
        const v = toward(e, a.sx, a.sz, Math.max(0, Math.hypot(a.sx - e.pos.x, a.sz - e.pos.z)) / Math.max(0.1, a.t));
        go(e, c, v.vx, v.vz, { noClip: true });
        a.dirt -= c.dt;
        if (a.dirt <= 0) { a.dirt = 0.07; fx.burst(a.sx + rnd(-R, R) * 0.6, 0.2, a.sz + rnd(-R, R) * 0.6, 0x8a6a40, 2, { speed: 2, up: 3, life: 0.4, size: 0.2 }); }
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          e.pos.x = a.sx; e.pos.z = a.sz; e.pos.y = 0;
          if (e.mesh) e.mesh.visible = true;
          fx.burst(a.sx, 0.6, a.sz, 0x8a6a40, 26, { speed: 6, up: 5, life: 0.7, size: 0.25 });
          fx.ring(a.sx, a.sz, 0xd8c8a0, R, 0.5); api.shake && api.shake(0.35); sfx(api, 'slam');
          if (Math.hypot(c.pp.x - a.sx, c.pp.z - a.sz) <= R + c.pr) hurt(e, c, e.dmg);
          a.st = 'exposed'; a.t = 1.4; e.untargetable = false; e.hidden = false;
        }
        return;
      }
      if (a.st === 'exposed') {      // vulnérable
        e.pos.y = 0;
        go(e, c, 0, 0, { face: c.u, attack: Math.max(0, a.t / 1.4) });
        if (a.t <= 0) { a.st = 'move'; a.cd = e.attackCd; }
        return;
      }
      a.st = 'move';
    },
  };

  // --- kiter : recule en tirant
  AIS.kiter = { update(e, c) { kiterCore(e, c, {}); } };

  // --- bomber : fonce, mèche télégraphiée, explose
  AIS.bomber = {
    update(e, c) {
      const a = c.a, api = c.api, R = num(e.def.blastRadius, 2.6);
      if (a.st === 'prime') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: c.u, windup: k });
        flash(e, 0.3 + 0.5 * Math.abs(Math.sin(k * 18)), 0xff3030);
        if (a.tele) { teleSet(a.tele, k); a.tele.position.set(e.pos.x, 0.05, e.pos.z); }
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          const x = e.pos.x, z = e.pos.z;
          fx.burst(x, 0.8, z, elColor(e), 30, { speed: 7, up: 5, life: 0.7, size: 0.25 });
          fx.ring(x, z, elColor(e), R, 0.5); sfx(api, 'boom'); api.shake && api.shake(0.5);
          if (Math.hypot(c.pp.x - x, c.pp.z - z) <= R + c.pr) hurt(e, c, e.dmg);
          selfDestruct(e, api);
        }
        return;
      }
      const zig = Math.sin(c.now * 6 + (e.animOff || 0)) * 0.5;
      const dir = rot2(c.u, c.d > 3 ? zig : 0);
      go(e, c, dir.x * c.spd * 1.5, dir.z * c.spd * 1.5, { face: dir });
      if (c.d <= num(e.def.range, 2.8)) {
        a.st = 'prime'; a.tot = a.t = wnd(e, 0.9);
        a.tele = teleCircle(a, api, e.pos.x, e.pos.z, R); sfx(api, 'spawn');
      }
    },
  };

  // --- mimic : faux coffre immobile, jaillit à l'approche
  AIS.mimic = {
    init(e) {
      const a = ensure(e); a.st = 'dormant'; a.pv0 = e.pv; a.noStun = true; e.hidden = true; a.aloneT = 0;
      if (e.mesh) e.mesh.userData.open = 0;
    },
    update(e, c) {
      const a = c.a, api = c.api, ud = e.mesh && e.mesh.userData;
      if (a.st === 'move') { a.st = 'dormant'; a.pv0 = e.pv; e.hidden = true; a.aloneT = 0; a.noStun = true; }
      if (a.st === 'dormant') {
        go(e, c, 0, 0, {});
        const others = api.enemies().filter((x) => x !== e && !x.dead && !(x._a && x._a.st === 'dormant' && x.ai === 'mimic'));
        a.aloneT = others.length ? 0 : a.aloneT + c.dt;
        if (c.d <= num(e.def.revealRadius, 3.2) || e.pv < a.pv0 - 0.5 || a.aloneT > 2.5) {
          a.st = 'reveal'; a.tot = a.t = 0.7; e.hidden = false; a.noStun = false;
          sfx(api, 'chestBad'); fx.text(e.pos.x, 1.6, e.pos.z, '!', '#ff4d4d', 1.6);
          fx.burst(e.pos.x, 0.6, e.pos.z, 0xe0b040, 14, { speed: 4, up: 4, life: 0.5, size: 0.15 });
        }
        return;
      }
      if (a.st === 'reveal') {
        const k = 1 - a.t / a.tot;
        if (ud) ud.open = k;
        e.pos.y = Math.sin(k * Math.PI) * 0.5;
        go(e, c, 0, 0, { face: c.u, windup: k });
        if (a.t <= 0) { e.pos.y = 0; a.st = 'chase'; a.cd = 0.5; a.leapCd = 2; }
        return;
      }
      if (ud) ud.open = 1;
      a.leapCd = (a.leapCd == null ? 2 : a.leapCd) - c.dt;
      if (lungeStep(e, c)) return;
      if (a.st === 'bite') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: a.lock, windup: k });
        flash(e, 0.5 * k, 0xff3030);
        if (a.tele) teleSet(a.tele, k);
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          const bx = e.pos.x + a.lock.x * 1.2, bz = e.pos.z + a.lock.z * 1.2;
          fx.ring(bx, bz, 0xffffff, 1.5, 0.3); sfx(api, 'slam');
          if (Math.hypot(c.pp.x - bx, c.pp.z - bz) <= 1.5 + c.pr) hurt(e, c, e.dmg * 1.2);
          a.st = 'chase'; a.cd = e.attackCd;
        }
        return;
      }
      const v = toward(e, c.pp.x, c.pp.z, c.spd);
      go(e, c, c.d > 1.6 ? v.vx : 0, c.d > 1.6 ? v.vz : 0, { face: c.u });
      if (a.cd <= 0 && c.d <= num(e.def.range, 1.7) + 0.8) {
        a.st = 'bite'; a.tot = a.t = wnd(e, 0.5); a.lock = { x: c.u.x, z: c.u.z };
        a.tele = teleCircle(a, api, e.pos.x + c.u.x * 1.2, e.pos.z + c.u.z * 1.2, 1.5);
      } else if (a.leapCd <= 0 && c.d >= 3.5 && c.d <= 7) { lungeBegin(e, c, Math.min(6, c.d + 1), 0.5, 1); a.leapCd = 5; }
    },
  };

  // --- fleeing : spécimen doré (fuit, esquive, s'échappe au bout de quelques secondes)
  AIS.fleeing = {
    init(e) { const a = ensure(e); a.life = num(e.def.escapeTime, 13); a.lastPv = e.pv; a.panic = 0; a.fxT = 0; a.noStun = false; },
    update(e, c) {
      const a = c.a, api = c.api;
      if (a.life == null) AIS.fleeing.init(e);
      a.life -= c.dt; a.panic -= c.dt; a.fxT -= c.dt;
      if (e.pv < a.lastPv) a.panic = 1.6;
      a.lastPv = e.pv;
      if (a.life <= 0) { despawn(e, api); return; }
      if (a.fxT <= 0) { a.fxT = 0.35; fx.burst(e.pos.x, 0.8, e.pos.z, 0xffd23f, 3, { speed: 1.5, up: 2, life: 0.5, size: 0.12 }); }
      if (a.st === 'jink') {
        go(e, c, a.sd.x * c.spd * 2.6, a.sd.z * c.spd * 2.6, {});
        if (a.t <= 0) a.st = 'move';
        return;
      }
      let fxv = -c.u.x, fzv = -c.u.z;
      const wall = 10.5;
      if (Math.abs(e.pos.x) > wall) fxv -= Math.sign(e.pos.x) * 1.4;
      if (Math.abs(e.pos.z) > wall) fzv -= Math.sign(e.pos.z) * 1.4;
      if (a.wallHit || (Math.abs(e.pos.x) > wall && Math.abs(e.pos.z) > wall)) { fxv += -c.u.z * a.side * 1.5; fzv += c.u.x * a.side * 1.5; }
      const n = norm2(fxv, fzv);
      const sp = c.spd * (c.d < 9 ? 1.15 : 0.5) * (a.panic > 0 ? 1.4 : 1);
      go(e, c, n.x * sp, n.z * sp, { face: n });
      if (a.wallHit && Math.random() < 0.1) a.side *= -1;
      if (c.d < 2.6 && (a.jinkCd == null || a.jinkCd <= 0)) { a.st = 'jink'; a.t = 0.3; a.jinkCd = 1.5; a.sd = { x: -c.u.z * a.side, z: c.u.x * a.side }; }
    },
  };

  // --- summoner : garde ses distances, invoque des renforts (cercles annoncés)
  AIS.summoner = {
    update(e, c) {
      const a = c.a, api = c.api, d = e.def;
      a.sumCd = (a.sumCd == null ? rnd(1.5, 3) : a.sumCd) - c.dt;
      if (a.st === 'cast') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: c.u, windup: k });
        flash(e, 0.4 * k, 0xb44dff);
        if (a.t <= 0) {
          a.st = 'move'; a.sumCd = 7.5;
          spawnMinions(e, api, d.summon || 'squelette', num(d.summonCount, 2), num(d.summonMax, 4));
          fx.ring(e.pos.x, e.pos.z, 0xb44dff, 2.5, 0.6);
        }
        return;
      }
      const m = e._m && e._m.minions;
      const alive = m ? m.filter((x) => x && !x.dead).length : 0;
      if (a.sumCd <= 0 && a.st === 'move' && alive < num(d.summonMax, 4) && c.d > 4) { a.st = 'cast'; a.tot = a.t = wnd(e, 1.0); return; }
      kiterCore(e, c, { burst: 1, near: 6, far: Math.max(8, num(d.range, 9)) });
    },
  };

  // --- teleporter : disparaît, point d'arrivée annoncé, surgit avec une zone ; tire entre-temps
  AIS.teleporter = {
    update(e, c) {
      const a = c.a, api = c.api, R = num(e.def.arriveRadius, 2.2);
      a.tpCd = (a.tpCd == null ? rnd(2, 4) : a.tpCd) - c.dt;
      a.noStun = a.st === 'vanish' || a.st === 'gone';
      if (a.st === 'vanish') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: c.u, windup: k });
        flash(e, 0.6 * k, 0x9ec4ff);
        if (a.t <= 0) {
          fx.burst(e.pos.x, 1, e.pos.z, elColor(e), 18, { speed: 4, up: 3, life: 0.5, size: 0.18 });
          if (e.mesh) e.mesh.visible = false;
          e.untargetable = true; e.hidden = true;
          const ang = Math.random() * TAU, rr = rnd(1.2, 2.0);   // arrive SUR le joueur : il doit quitter le cercle annoncé
          const p = freeSpot(api, c.pp.x + Math.cos(ang) * rr, c.pp.z + Math.sin(ang) * rr, 0.8);
          a.dx = p.x; a.dz = p.z;
          a.tele = teleCircle(a, api, a.dx, a.dz, R);
          a.st = 'gone'; a.tot = a.t = 0.9;
        }
        return;
      }
      if (a.st === 'gone') {
        teleSet(a.tele, 1 - a.t / a.tot);
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          e.pos.x = a.dx; e.pos.z = a.dz;
          if (e.mesh) e.mesh.visible = true;
          e.untargetable = false; e.hidden = false;
          fx.burst(a.dx, 0.8, a.dz, elColor(e), 24, { speed: 6, up: 4, life: 0.6, size: 0.22 });
          fx.ring(a.dx, a.dz, elColor(e), R, 0.5); sfx(api, 'slam'); api.shake && api.shake(0.25);
          if (Math.hypot(c.pp.x - a.dx, c.pp.z - a.dz) <= R + c.pr) hurt(e, c, e.dmg * 1.1);
          a.st = 'slash'; a.t = 0.7;
        }
        return;
      }
      if (a.st === 'slash') { go(e, c, 0, 0, { face: c.u, attack: Math.max(0, a.t / 0.7) }); if (a.t <= 0) { a.st = 'move'; a.tpCd = rnd(4.5, 6.5); a.cd = Math.max(a.cd, 0.6); } return; }
      if (a.st === 'move' && a.tpCd <= 0 && c.d < 14) { a.st = 'vanish'; a.tot = a.t = 0.4; return; }
      if (e.def.projectile) kiterCore(e, c, { burst: burstCount(e), near: 4, far: num(e.def.range, 8) });
      else {   // mêlée : s'approche entre deux téléportations
        const v = toward(e, c.pp.x, c.pp.z, c.spd);
        go(e, c, c.d > 2.5 ? v.vx : 0, c.d > 2.5 ? v.vz : 0, { face: c.u });
      }
    },
  };

  // --- turret : immobile, rayon annoncé puis nova de runes
  AIS.turret = {
    update(e, c) {
      const a = c.a, api = c.api, d = e.def;
      a.n = a.n || 0;
      if (a.st === 'aim') {
        const k = 1 - a.t / a.tot;
        if (a.t > a.tot * 0.4) a.lock = { x: c.u.x, z: c.u.z };       // suit le joueur, puis se verrouille
        go(e, c, 0, 0, { face: a.lock, windup: k });
        flash(e, 0.5 * k, 0xb6a0ff);
        if (a.tele) { teleSet(a.tele, k); a.tele.rotation.y = Math.atan2(a.lock.x, a.lock.z); a.tele.position.set(e.pos.x, 0.05, e.pos.z); }
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          shoot(e, c, a.lock, { speed: num(d.projSpeed, 15), pierce: true, radius: 0.4, life: 1.4 });
          sfx(api, 'arrow'); a.st = 'move'; a.cd = e.attackCd;
        }
        return;
      }
      if (a.st === 'nova') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: c.u, windup: k });
        flash(e, 0.5 * k, 0xfff0a0);
        if (a.tele) teleSet(a.tele, k);
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          const off = a.n * 0.4;
          for (let i = 0; i < 8; i++) shoot(e, c, rot2({ x: 0, z: 1 }, off + i * TAU / 8), { speed: 7, damage: e.dmg * 0.8, life: 2.8, radius: 0.35 });
          fx.ring(e.pos.x, e.pos.z, 0xb6a0ff, 3, 0.5); sfx(api, 'boom');
          a.st = 'move'; a.cd = e.attackCd * 1.2;
        }
        return;
      }
      go(e, c, 0, 0, { face: c.u });
      if (a.cd <= 0 && c.d <= num(d.range, 12) && !blocked(api, e.pos.x, e.pos.z, c.pp.x, c.pp.z)) {
        a.n++;
        if (a.n % 3 === 0) { a.st = 'nova'; a.tot = a.t = wnd(e, 1.0); a.tele = teleRing(a, api, e.pos.x, e.pos.z, 3); }
        else { a.st = 'aim'; a.tot = a.t = wnd(e, 1.1); a.lock = { x: c.u.x, z: c.u.z }; a.tele = teleLine(a, api, e.pos.x, e.pos.z, a.lock, 16, 0.9); }
      }
    },
  };

  // ==================================================================
  //  v5 « Ténèbres » — IA D'HORREUR (agent 7)
  //  ambusher weeping stalker mimic_wall screamer crawler hunter possessor brute
  //  Toutes les attaques sont télégraphiées ; aucune ne frappe sans fenêtre d'esquive.
  // ==================================================================
  const SOUNDS = {};
  /** Voix du monstre : G.Audio.at('monstre_<id>_<evt>', x, z) (évts : cri attaque mort pas murmure indice souffle). */
  function snd(e, name, minGap) {
    const a = e._a || (e._a = { uid: ++UID, st: 'move', t: 0, cd: 1, teles: [], lg: null, side: 1 });
    const id = (e.def && (e.def.sndId || e.id)) || 'x';
    const n = 'monstre_' + id + '_' + name;
    SOUNDS[n] = 1;
    const T = (a.snd || (a.snd = {}));
    if (T[name] != null && CLOCK - T[name] < (minGap || 0.25)) return;
    T[name] = CLOCK;
    try { if (G.Audio && G.Audio.at) G.Audio.at(n, e.pos.x, e.pos.z); } catch (_) { /* audio facultatif */ }
  }
  const lightR = () => {
    try { if (G.Horror && typeof G.Horror.lightRadius === 'function') { const r = G.Horror.lightRadius(); if (r > 0) return r; } } catch (_) { /* horreur absente */ }
    return 6.5;
  };
  /** cos entre la visée du joueur et la direction joueur→monstre (1 = en face). */
  function viewDot(e, c) {
    const pd = c.P.dir;
    const l = pd ? Math.hypot(pd.x, pd.z) : 0;
    if (!(l > 0.01)) return 1;
    return (pd.x * -c.u.x + pd.z * -c.u.z) / l;
  }
  /** Le joueur « regarde » le monstre : dans le cône de visée (~±72°), à portée, sans mur entre eux. */
  function isWatched(e, c, range) {
    if (c.d > (range || 18)) return false;
    if (viewDot(e, c) < 0.3) return false;
    return !blocked(c.api, c.pp.x, c.pp.z, e.pos.x, e.pos.z);
  }
  const setVis = (e, v) => { if (e.mesh && e.mesh.visible !== v) e.mesh.visible = v; };
  function wakeAround(e, api, r, hasteBuff) {
    alliesOf(e, api, r).forEach((x) => {
      ensure(x).alert = true;
      if (hasteBuff) buff(x, 'haste', 4, { speed: 1.2 });
    });
  }
  /** Poursuite avec contournement simple des obstacles. */
  function chaseStep(e, c, spd, stopAt) {
    const a = c.a;
    let vx = c.u.x, vz = c.u.z;
    if (a.wallHit) { a.side = a.side || 1; vx += -c.u.z * a.side * 1.1; vz += c.u.x * a.side * 1.1; if (Math.random() < 0.04) a.side *= -1; }
    const n = norm2(vx, vz);
    const go0 = c.d > (stopAt || 1.5);
    go(e, c, go0 ? n.x * spd : 0, go0 ? n.z * spd : 0, { face: c.u });
  }
  /** Noyau de corps-à-corps télégraphié (cercle devant le monstre). o:{reach, rad, windup, recover, dmg, speed} */
  function meleeCore(e, c, o) {
    const a = c.a, api = c.api;
    o = o || {};
    if (a.st === 'mwind') {
      const k = 1 - a.t / a.tot;
      go(e, c, 0, 0, { face: a.lock, windup: k });
      flash(e, 0.5 * k, 0xff3030);
      if (a.tele) teleSet(a.tele, k);
      if (a.t <= 0) {
        clearTeles(a); a.tele = null;
        const R = o.rad || 1.5, rc = o.reach || 1.2;
        const bx = e.pos.x + a.lock.x * rc, bz = e.pos.z + a.lock.z * rc;
        fx.ring(bx, bz, 0xffffff, R, 0.3); sfx(api, 'slam'); if (o.shake) api.shake && api.shake(o.shake);
        if (Math.hypot(c.pp.x - bx, c.pp.z - bz) <= R + c.pr) hurt(e, c, e.dmg * (o.dmg || 1.1));
        a.st = 'mrec'; a.t = a.tot = o.recover || 0.5;
      }
      return true;
    }
    if (a.st === 'mrec') {
      go(e, c, 0, 0, { face: c.u, attack: Math.max(0, a.t / a.tot) });
      if (a.t <= 0) { a.st = 'move'; a.cd = e.attackCd; }
      return true;
    }
    return false;
  }
  function meleeStart(e, c, o) {
    const a = c.a;
    o = o || {};
    a.st = 'mwind'; a.tot = a.t = wnd(e, o.windup || 0.55); a.lock = { x: c.u.x, z: c.u.z };
    const rc = o.reach || 1.2;
    a.tele = teleCircle(a, c.api, e.pos.x + c.u.x * rc, e.pos.z + c.u.z * rc, o.rad || 1.5);
    snd(e, 'attaque', 0.6);
  }
  /** Premier regard : cri de repérage une seule fois. */
  function firstAggro(e, c) { if (!c.a.aggro && c.d < 13) { c.a.aggro = true; snd(e, 'cri', 1); } }

  // --- brute : lent, gros coup annoncé (zone large), longue récupération
  AIS.brute = {
    update(e, c) {
      const a = c.a, d = e.def;
      firstAggro(e, c);
      const o = { reach: num(d.reach, 1.6), rad: num(d.slamRadius, 2.0), windup: num(d.windup, 0.85), recover: num(d.recover, 0.9), dmg: 1.2, shake: 0.25 };
      if (meleeCore(e, c, o)) return;
      chaseStep(e, c, c.spd, 1.6);
      if (a.cd <= 0 && c.d <= o.reach + o.rad * 0.7 + 0.6) meleeStart(e, c, o);
    },
  };

  // --- ambusher : caché au plafond / sous le sol ; tombe (ou jaillit) sur un cercle annoncé quand le joueur passe
  AIS.ambusher = {
    init(e) {
      const a = ensure(e);
      a.st = 'hidden'; a.noStun = true; a.aloneT = 0; a.drip = rnd(1.5, 3.5); a.hang = e.def.hang || 'ceiling';
      e.hidden = true; e.untargetable = true; setVis(e, false);
    },
    update(e, c) {
      const a = c.a, api = c.api, R = num(e.def.blastRadius, 2.3), d = e.def;
      if (a.st === 'move') { a.st = 'chase'; }
      if (a.st === 'hidden') {
        e.hidden = true; e.untargetable = true; setVis(e, false);
        go(e, c, 0, 0, { noClip: true });
        const others = api.enemies().filter((x) => x !== e && !x.dead && !(x._a && x._a.st === 'hidden'));
        a.aloneT = others.length ? 0 : a.aloneT + c.dt;
        a.drip -= c.dt;
        if (a.drip <= 0) {   // indice : poussière / gouttes qui tombent (esquivable avec un peu d'attention)
          a.drip = rnd(2.2, 4.5);
          fx.burst(e.pos.x, a.hang === 'floor' ? 0.1 : 3.2, e.pos.z, a.hang === 'floor' ? 0x6b5a44 : 0x9a9a9a, a.hang === 'floor' ? 3 : 4, { speed: 0.6, up: a.hang === 'floor' ? 1.5 : -1, life: 0.9, size: 0.1 });
          snd(e, 'indice', 1.5);
        }
        if (c.d <= num(d.revealRadius, 4.6) || a.alert || a.aloneT > 2.5) {
          a.st = 'warn'; a.tot = a.t = wnd(e, 1.0); a.alert = false;
          a.sx = c.pp.x; a.sz = c.pp.z;
          a.tele = teleCircle(a, api, a.sx, a.sz, R);
          snd(e, 'cri', 0.5);
        }
        return;
      }
      if (a.st === 'warn') {
        const k = 1 - a.t / a.tot;
        teleSet(a.tele, k);
        if (k < 0.45) {     // suit le joueur, puis se verrouille : il faut bouger au bon moment
          a.sx += (c.pp.x - a.sx) * Math.min(1, c.dt * 4); a.sz += (c.pp.z - a.sz) * Math.min(1, c.dt * 4);
          if (a.tele) a.tele.position.set(a.sx, 0.05, a.sz);
        }
        e.pos.x = a.sx; e.pos.z = a.sz;
        e.pos.y = a.hang === 'floor' ? -1.6 : 5;
        go(e, c, 0, 0, { noClip: true });
        a.dirt = (a.dirt || 0) - c.dt;
        if (a.dirt <= 0) { a.dirt = 0.12; fx.burst(a.sx + rnd(-R, R) * 0.6, a.hang === 'floor' ? 0.2 : 3, a.sz + rnd(-R, R) * 0.6, 0x7a7a7a, 2, { speed: 1, up: a.hang === 'floor' ? 2 : -2, life: 0.5, size: 0.12 }); }
        if (a.t <= 0) { a.st = 'fall'; a.t = a.tot = 0.2; setVis(e, true); e.hidden = false; }
        return;
      }
      if (a.st === 'fall') {
        const k = 1 - a.t / a.tot;
        e.pos.y = (a.hang === 'floor' ? -1.6 : 5) * (1 - k);
        go(e, c, 0, 0, { face: c.u, windup: 1 - k, noClip: true });
        if (a.t <= 0) {
          clearTeles(a); a.tele = null; e.pos.y = 0;
          fx.burst(e.pos.x, 0.5, e.pos.z, 0x8a7a64, 26, { speed: 6, up: 5, life: 0.7, size: 0.24 });
          fx.ring(e.pos.x, e.pos.z, 0xd8c8a0, R, 0.5); api.shake && api.shake(0.4); sfx(api, 'slam');
          if (Math.hypot(c.pp.x - e.pos.x, c.pp.z - e.pos.z) <= R + c.pr) hurt(e, c, e.dmg * 1.1);
          a.st = 'exposed'; a.t = 1.3; e.untargetable = false; a.noStun = false;
        }
        return;
      }
      if (a.st === 'exposed') {
        e.pos.y = 0;
        go(e, c, 0, 0, { face: c.u, attack: Math.max(0, a.t / 1.3) });
        if (a.t <= 0) { a.st = 'chase'; a.cd = 0.6; }
        return;
      }
      e.hidden = false; e.untargetable = false;
      if (meleeCore(e, c, { reach: 1.2, rad: 1.5, windup: 0.5, recover: 0.5 })) return;
      chaseStep(e, c, c.spd, 1.5);
      if (a.cd <= 0 && c.d <= num(d.range, 1.7) + 0.8) meleeStart(e, c, { reach: 1.2, rad: 1.5, windup: 0.5 });
    },
  };

  // --- weeping : n'avance que lorsqu'on ne le regarde pas ; figé en pierre (dégâts réduits) sous le regard
  AIS.weeping = {
    init(e) { const a = ensure(e); a.noStun = true; a.frz = 0; },
    update(e, c) {
      const a = c.a, d = e.def;
      firstAggro(e, c);
      const watched = isWatched(e, c, 20);
      a.frz += ((watched ? 1 : 0) - a.frz) * Math.min(1, c.dt * 12);
      if (e.mesh) e.mesh.userData.frozen = a.frz;
      e.dmgTakenMult = watched ? num(d.stoneMult, 0.4) : 1.25;
      const reach = num(d.range, 1.8);
      if (a.st === 'mwind') {
        if (watched) {   // le regard l'interrompt : l'attaque avorte
          clearTeles(a); a.tele = null; a.st = 'move'; a.cd = 1.2;
          go(e, c, 0, 0, { face: c.u });
          return;
        }
        meleeCore(e, c, { reach: 1.1, rad: 1.7, windup: 0.7, recover: 0.7, dmg: 1.2 });
        return;
      }
      if (a.st === 'mrec') { meleeCore(e, c, { recover: 0.7 }); return; }
      if (watched) {
        if (G.fx && Math.random() < c.dt * 0.6) fx.burst(e.pos.x, 1.2, e.pos.z, 0xbfc6d0, 2, { speed: 0.5, up: -1, life: 0.8, size: 0.08 });   // larmes de pierre
        go(e, c, 0, 0, { face: c.u });
        return;
      }
      snd(e, 'pas', 0.7);
      chaseStep(e, c, c.spd * num(d.creepMul, 1.6), 1.3);
      if (a.cd <= 0 && c.d <= reach + 0.6) { meleeStart(e, c, { reach: 1.1, rad: 1.7, windup: 0.7 }); }
    },
  };

  // --- stalker : suit à distance dans l'ombre (invisible hors de la lumière), frappe dans le dos, fuit la lumière
  AIS.stalker = {
    init(e) { const a = ensure(e); a.st = 'shadow'; a.cd = rnd(3, 6); a.noStun = false; a.mist = 0; },
    update(e, c) {
      const a = c.a, api = c.api, d = e.def, L = lightR();
      if (lungeStep(e, c)) { a.fled = true; return; }
      if (a.fled) { a.fled = false; a.st = 'flee'; a.t = 2.6; a.cd = num(e.attackCd, 3) * 1.8; }
      const vd = viewDot(e, c);
      const lit = c.d <= L + 1;
      setVis(e, lit || a.st === 'close' || a.st === 'flee');
      e.hidden = !(lit || a.st === 'close');
      a.mist -= c.dt;
      if (a.mist <= 0 && !lit) { a.mist = 0.9; fx.burst(e.pos.x, 0.3, e.pos.z, 0x2a1a3a, 3, { speed: 0.6, up: 0.8, life: 1.0, size: 0.28 }); }
      if (a.st === 'flee') {
        go(e, c, -c.u.x * c.spd * 1.7, -c.u.z * c.spd * 1.7, { face: { x: -c.u.x, z: -c.u.z } });
        if (a.t <= 0) a.st = 'shadow';
        return;
      }
      if (a.st === 'close') {   // approche de dos, sans bruit ; se replie si le joueur se retourne
        if (vd > 0.45 && c.d < L + 2) { a.st = 'flee'; a.t = 2.2; a.cd = 2.5; snd(e, 'murmure', 1); return; }
        const sp = c.spd * 2.1;
        chaseStep(e, c, sp, 0.1);
        if (c.d <= 4.6) { lungeBegin(e, c, c.d + 1.4, 0.55, 1); a.st = 'shadow'; snd(e, 'attaque', 0.6); }
        return;
      }
      // 'shadow' : orbite derrière le joueur, juste hors de la lumière
      if (vd > 0.5 && c.d < L + 1.5) { a.st = 'flee'; a.t = 1.8; return; }
      const pd = c.P.dir && Math.hypot(c.P.dir.x, c.P.dir.z) > 0.1 ? norm2(c.P.dir.x, c.P.dir.z) : { x: c.u.x, z: c.u.z };
      const D = clamp(L + 2.4, 7, 11);
      const bk = rot2({ x: -pd.x, z: -pd.z }, a.side * 0.55);
      const v = toward(e, c.pp.x + bk.x * D, c.pp.z + bk.z * D, c.spd * 1.3);
      const dd = Math.hypot(c.pp.x + bk.x * D - e.pos.x, c.pp.z + bk.z * D - e.pos.z);
      if (dd < 1) { v.vx = 0; v.vz = 0; }
      go(e, c, v.vx, v.vz, { face: c.u });
      if (a.wallHit && Math.random() < 0.05) a.side *= -1;
      if (Math.random() < c.dt * 0.35) snd(e, 'murmure', 3);
      if (a.cd <= 0 && vd < 0.1 && c.d < D + 4 && !blocked(api, e.pos.x, e.pos.z, c.pp.x, c.pp.z)) { a.st = 'close'; snd(e, 'murmure', 0.5); }
    },
  };

  // --- mimic_wall : fait partie du décor (relief du mur), les bras jaillissent à l'approche ; ancré au mur
  AIS.mimic_wall = {
    init(e) {
      const a = ensure(e); a.st = 'dormant'; a.noStun = true; a.pv0 = e.pv; a.aloneT = 0; e.hidden = true;
      const H = 13.0;
      let wx = e.pos.x, wz = e.pos.z;
      const ax = Math.abs(wx), az = Math.abs(wz);
      if (az >= ax && !(wz < 0 && ax < 3.5)) { wz = Math.sign(wz || 1) * H; a.wall = { nx: 0, nz: -Math.sign(wz), tx: 1, tz: 0 }; }
      else { wx = Math.sign(wx || 1) * H; a.wall = { nx: -Math.sign(wx), nz: 0, tx: 0, tz: 1 }; }
      if (wz < -10 && Math.abs(wx) < 3.5) { wx = wx < 0 ? -4 : 4; }
      e.pos.x = wx; e.pos.z = wz; a.fx = a.wall.nx; a.fz = a.wall.nz;
      if (e.mesh) { e.mesh.rotation.y = Math.atan2(a.fx, a.fz); e.mesh.userData.open = 0; e.mesh.userData.reach = 0; }
    },
    update(e, c) {
      const a = c.a, api = c.api, ud = e.mesh && e.mesh.userData, W = a.wall || { nx: 0, nz: 1, tx: 1, tz: 0 };
      if (a.st === 'dormant') {
        e.hidden = true;
        if (e.mesh) e.mesh.rotation.y = Math.atan2(W.nx, W.nz);
        go(e, c, 0, 0, { noClip: true, face: { x: W.nx, z: W.nz } });
        const others = api.enemies().filter((x) => x !== e && !x.dead && !(x._a && x._a.st === 'dormant'));
        a.aloneT = others.length ? 0 : a.aloneT + c.dt;
        if (c.d <= num(e.def.revealRadius, 3.6) || e.pv < a.pv0 - 0.5 || a.aloneT > 3 || a.alert) {
          a.st = 'reveal'; a.tot = a.t = 0.8; e.hidden = false; a.noStun = false;
          snd(e, 'cri', 0.5); fx.text(e.pos.x, 2.0, e.pos.z, '!', '#ff4d4d', 1.5);
          fx.burst(e.pos.x, 1.2, e.pos.z, 0x8a8a92, 18, { speed: 3, up: 3, life: 0.6, size: 0.18 });
        }
        return;
      }
      if (a.st === 'reveal') {
        const k = 1 - a.t / a.tot;
        if (ud) ud.open = k;
        go(e, c, 0, 0, { face: c.u, windup: k, noClip: true });
        if (a.t <= 0) { a.st = 'chase'; a.cd = 0.8; }
        return;
      }
      if (ud) ud.open = 1;
      const R = num(e.def.reachLen, 5.5);
      if (a.st === 'grab') {   // bras tendu : ligne annoncée, puis claque
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: a.lock, windup: k, noClip: true });
        flash(e, 0.5 * k, 0xff3030);
        if (a.tele) { teleSet(a.tele, k); a.tele.position.set(e.pos.x, 0.05, e.pos.z); }
        if (ud) ud.reach = k * 0.4;
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          fx.ring(e.pos.x + a.lock.x * R * 0.6, e.pos.z + a.lock.z * R * 0.6, 0xcfd6e6, 1.4, 0.3); sfx(api, 'slam'); api.shake && api.shake(0.25);
          const rx = c.pp.x - e.pos.x, rz = c.pp.z - e.pos.z, al = rx * a.lock.x + rz * a.lock.z, pe = Math.abs(-rx * a.lock.z + rz * a.lock.x);
          if (al > 0 && al < R + c.pr && pe < 0.65 + c.pr) hurt(e, c, e.dmg * 1.2);
          a.st = 'retract'; a.t = a.tot = 0.9; if (ud) ud.reach = 1;
        }
        return;
      }
      if (a.st === 'retract') {   // bras sorti : fenêtre de contre-attaque
        const k = Math.max(0, a.t / a.tot);
        if (ud) ud.reach = k;
        go(e, c, 0, 0, { face: c.u, attack: k, noClip: true });
        if (a.t <= 0) { a.st = 'chase'; a.cd = e.attackCd; if (ud) ud.reach = 0; }
        return;
      }
      // chase : glisse le long du mur, jamais hors de celui-ci
      const dd = (c.pp.x - e.pos.x) * W.tx + (c.pp.z - e.pos.z) * W.tz;
      const sl = Math.abs(dd) > 1 ? Math.sign(dd) * c.spd * 0.9 : 0;
      go(e, c, W.tx * sl, W.tz * sl, { face: c.u });
      if (a.cd <= 0 && c.d <= R + 0.5) {
        a.st = 'grab'; a.tot = a.t = wnd(e, 0.95); a.lock = { x: c.u.x, z: c.u.z };
        a.tele = teleLine(a, api, e.pos.x, e.pos.z, a.lock, R, 1.3);
        snd(e, 'attaque', 0.6);
      }
    },
  };

  // --- screamer : garde ses distances, hurle (onde annoncée) : ralentit le joueur, réveille et hâte les autres monstres
  AIS.screamer = {
    update(e, c) {
      const a = c.a, api = c.api, d = e.def, R = num(d.screamRadius, 8);
      firstAggro(e, c);
      a.scCd = (a.scCd == null ? rnd(2, 4) : a.scCd) - c.dt;
      if (a.st === 'scream') {
        const k = 1 - a.t / a.tot;
        go(e, c, 0, 0, { face: c.u, windup: k });
        flash(e, 0.55 * k, 0xffd0a0);
        if (a.tele) { teleSet(a.tele, k); a.tele.position.set(e.pos.x, 0.05, e.pos.z); }
        if (Math.random() < c.dt * 20) fx.ring(e.pos.x, e.pos.z, 0xe8d8ff, 0.5 + k * 1.5, 0.25);
        if (a.t <= 0) {
          clearTeles(a); a.tele = null;
          fx.ring(e.pos.x, e.pos.z, 0xe8d8ff, R, 0.7); api.shake && api.shake(0.5); sfx(api, 'bossRoar'); snd(e, 'cri', 0.4);
          if (c.d <= R + c.pr && api.damagePlayer) api.damagePlayer(Math.max(1, Math.round(e.dmg * 0.6)), { element: 'ombre', source: e, slow: 2.6 });
          wakeAround(e, api, 24, true);
          fx.text(e.pos.x, 2.4, e.pos.z, 'AAAAH !', '#ffd0a0', 1.3);
          a.st = 'move'; a.scCd = num(d.screamCd, 8.5);
        }
        return;
      }
      if (a.scCd <= 0 && c.d <= R + 3 && a.st === 'move') {
        a.st = 'scream'; a.tot = a.t = wnd(e, 1.25);
        a.tele = teleRing(a, api, e.pos.x, e.pos.z, R); snd(e, 'murmure', 0.5);
        return;
      }
      kiterCore(e, c, { burst: 1, near: 6.5, far: 11 });
    },
  };

  // --- crawler : rampe vite au ras du sol en zigzag, bond court télégraphié, puis détale
  AIS.crawler = {
    update(e, c) {
      const a = c.a, d = e.def;
      firstAggro(e, c);
      const was = !!a.lg;
      if (lungeStep(e, c)) { a.wasLg = true; return; }
      if (a.wasLg) { a.wasLg = false; a.st = 'skitter'; a.t = 0.8; a.sd = rot2(c.u, a.side * 1.9); }
      if (a.st === 'skitter') {
        go(e, c, -a.sd.x * c.spd * 1.4, -a.sd.z * c.spd * 1.4, { face: c.u });
        if (a.t <= 0) a.st = 'move';
        return;
      }
      const zig = Math.sin(c.now * 7 + (e.animOff || 0)) * (c.d > 3.5 ? 0.95 : 0.4);
      const dir = rot2(c.u, zig);
      go(e, c, dir.x * c.spd * 1.5, dir.z * c.spd * 1.5, { face: dir });
      if (a.cd <= 0 && c.d <= 5 && c.d >= 1.2) { lungeBegin(e, c, Math.min(5.5, c.d + 1.1), num(d.lunge && d.lunge.windup, 0.38), 1); snd(e, 'attaque', 0.6); }
    },
  };

  // --- hunter : traque sans relâche sur toute la salle, pas audibles ; s'épuise (vulnérable) puis repart
  AIS.hunter = {
    init(e) { const a = ensure(e); a.hunt = 0; a.stepT = 0.4; a.noStun = false; },
    update(e, c) {
      const a = c.a, d = e.def;
      firstAggro(e, c);
      if (lungeStep(e, c)) { a.wasLg = true; return; }
      if (a.wasLg) { a.wasLg = false; a.hunt = 0; a.st = 'move'; a.cd = e.attackCd; }
      if (a.st === 'winded') {
        e.dmgTakenMult = 1.35;
        go(e, c, 0, 0, { face: c.u, windup: 0 });
        if (Math.random() < c.dt * 3) fx.burst(e.pos.x, 1.1, e.pos.z, 0xcfd6e6, 1, { speed: 0.6, up: 1.2, life: 0.6, size: 0.1 });
        snd(e, 'souffle', 1.1);
        if (a.t <= 0) { a.st = 'move'; e.dmgTakenMult = 1; a.hunt = 0; }
        return;
      }
      a.hunt += c.dt;
      a.heard = Math.max(0, (a.heard || 0) - c.dt);
      let ramp = 1 + Math.min(0.5, a.hunt * 0.035);
      if (d.noiseHunter) ramp = a.heard > 0 ? 1.6 : 0.5;   // gardien du silence : n'accélère qu'au bruit (compétences lancées)
      a.stepT -= c.dt * ramp;
      if (a.stepT <= 0) { a.stepT = 0.5; snd(e, 'pas', 0.3); }
      chaseStep(e, c, c.spd * ramp, 2.0);
      if (a.cd <= 0 && c.d <= 9 && c.d >= 2 && !blocked(c.api, e.pos.x, e.pos.z, c.pp.x, c.pp.z)) { lungeBegin(e, c, Math.min(8, c.d + 1.6), num(d.lunge && d.lunge.windup, 0.6), 1); snd(e, 'attaque', 0.6); }
      if (a.hunt > num(d.stamina, 16)) { a.st = 'winded'; a.t = 2.3; fx.text(e.pos.x, (e.height || 1.6) + 0.4, e.pos.z, '...', '#cfd6e6', 1); }
    },
  };

  // --- possessor : esprit qui saute de cadavre en cadavre ; chaque hôte est un monstre à abattre
  const CORPSES = [];
  AIS.possessor = {
    init(e) { const a = ensure(e); a.st = 'wisp'; a.poss = 0; a.noStun = false; a.host = null; },
    update(e, c) {
      const a = c.a, api = c.api, d = e.def;
      firstAggro(e, c);
      for (let i = CORPSES.length - 1; i >= 0; i--) if (CLOCK - CORPSES[i].t > 30) CORPSES.splice(i, 1);
      if (a.st === 'hosting') {
        e.untargetable = true; e.hidden = true; setVis(e, false);
        const h = a.host;
        go(e, c, 0, 0, { noClip: true });
        if (h && !h.dead) { e.pos.x = h.pos.x; e.pos.z = h.pos.z; return; }
        // l'hôte est tombé : l'esprit s'échappe du corps
        a.st = 'wisp'; a.cd = 1.2; a.host = null; e.untargetable = false; e.hidden = false; setVis(e, true);
        e.pos.y = 0; a.noStun = false;
        fx.burst(e.pos.x, 1, e.pos.z, 0x9fd8ff, 18, { speed: 4, up: 4, life: 0.7, size: 0.2 }); snd(e, 'cri', 0.5);
        if (a.poss >= num(d.possessMax, 3)) { fx.text(e.pos.x, 1.8, e.pos.z, 'Épuisé', '#9fd8ff', 1); a.exhausted = true; }
        return;
      }
      if (a.st === 'jump') {   // glisse jusqu'au cadavre ciblé (cercle annoncé)
        const k = 1 - a.t / a.tot;
        if (a.tele) teleSet(a.tele, k);
        const v = toward(e, a.tx, a.tz, c.spd * 3);
        go(e, c, v.vx, v.vz, { noClip: true, windup: k });
        e.pos.y = 0.8 + Math.sin(k * Math.PI) * 0.8;
        if (a.t <= 0 || Math.hypot(a.tx - e.pos.x, a.tz - e.pos.z) < 0.5) {
          clearTeles(a); a.tele = null; e.pos.y = 0;
          a.poss++;
          fx.burst(a.tx, 0.8, a.tz, 0x9fd8ff, 24, { speed: 5, up: 4, life: 0.6, size: 0.22 }); fx.ring(a.tx, a.tz, 0x9fd8ff, 1.8, 0.5);
          const host = api.spawnEnemy ? api.spawnEnemy(d.host || 'possede_cadavre', V3(a.tx, 0, a.tz), {}) : null;
          if (host && typeof host === 'object') { a.host = host; a.st = 'hosting'; host.possessedBy = e; }
          else { a.st = 'wisp'; a.cd = 2; }
        }
        return;
      }
      // wisp : flotte, garde ses distances, tire peu ; cherche un cadavre à habiter
      const can = !a.exhausted && a.poss < num(d.possessMax, 3) && a.cd <= 0;
      if (can) {
        let best = null, bd = 1e9;
        CORPSES.forEach((k) => { const dd = Math.hypot(k.x - e.pos.x, k.z - e.pos.z); if (dd < bd && dd < 22 && (!a.last || Math.hypot(k.x - a.last.x, k.z - a.last.z) > 1.5)) { bd = dd; best = k; } });
        if (best) {
          CORPSES.splice(CORPSES.indexOf(best), 1);
          a.last = { x: best.x, z: best.z };
          a.tx = best.x; a.tz = best.z; a.st = 'jump'; a.tot = a.t = Math.max(0.9, bd / (c.spd * 3)) + 0.4;
          a.tele = teleRing(a, api, a.tx, a.tz, 1.6); snd(e, 'murmure', 0.5);
          return;
        }
      }
      e.pos.y = 0.5 + Math.sin(c.now * 2.4) * 0.15;
      kiterCore(e, c, { burst: 1, near: 5, far: num(d.range, 8) });
    },
  };

  // --- statue : décor immobile (armure, ange, idole...) qui s'éveille quand on s'approche, qu'on lui tourne le dos ou qu'un cri le réveille
  AIS.statue = {
    init(e) { const a = ensure(e); a.st = 'dormant'; a.noStun = true; a.pv0 = e.pv; a.aloneT = 0; e.hidden = true; if (e.mesh) e.mesh.userData.awake = 0; },
    update(e, c) {
      const a = c.a, api = c.api, d = e.def, ud = e.mesh && e.mesh.userData;
      if (a.st === 'dormant') {
        e.hidden = true;
        go(e, c, 0, 0, {});
        const others = api.enemies().filter((x) => x !== e && !x.dead && !(x._a && x._a.st === 'dormant'));
        a.aloneT = others.length ? 0 : a.aloneT + c.dt;
        const back = viewDot(e, c) < -0.2 && c.d < num(d.revealRadius, 3.4) + 2;   // on lui tourne le dos
        if (c.d <= num(d.revealRadius, 3.4) || back || e.pv < a.pv0 - 0.5 || a.aloneT > 3 || a.alert) {
          a.st = 'awaken'; a.tot = a.t = 0.9; e.hidden = false; a.noStun = false;
          snd(e, 'cri', 0.5);
          a.tele = teleRing(a, api, e.pos.x, e.pos.z, 1.8);
          fx.burst(e.pos.x, 1, e.pos.z, 0xb0b0b8, 20, { speed: 3, up: 3, life: 0.6, size: 0.18 });
        }
        return;
      }
      if (a.st === 'awaken') {   // craquements, fenêtre de fuite/attaque (la statue est vulnérable)
        const k = 1 - a.t / a.tot;
        if (ud) ud.awake = k;
        if (a.tele) teleSet(a.tele, k);
        e.mesh.rotation.z = Math.sin(c.now * 40) * 0.04 * (1 - k);
        go(e, c, 0, 0, { face: c.u, windup: k });
        if (a.t <= 0) { clearTeles(a); a.tele = null; e.mesh.rotation.z = 0; a.st = 'move'; a.cd = 0.5; if (ud) ud.awake = 1; }
        return;
      }
      if (ud) ud.awake = 1;
      const o = { reach: num(d.reach, 1.4), rad: num(d.slamRadius, 1.7), windup: num(d.windup, 0.7), recover: num(d.recover, 0.7), dmg: 1.15, shake: 0.2 };
      if (meleeCore(e, c, o)) return;
      chaseStep(e, c, c.spd, 1.5);
      if (a.cd <= 0 && c.d <= o.reach + o.rad * 0.6 + 0.8) meleeStart(e, c, o);
    },
  };

  // --- secret : créature des salles secrètes. Inoffensive tant qu'on ne l'attaque pas ; comportements :
  //     vanish (disparaît si on la regarde trop longtemps → récompense), shy (s'éloigne quand on approche), talk (parle, chante),
  //     sleep (dort ; se réveille si on reste près ou qu'on l'attaque). Attaquée : devient hostile (def.fightAi).
  AIS.secret = {
    init(e) { const a = ensure(e); a.st = 'calm'; a.noStun = true; a.pv0 = e.pv; a.lineI = 0; a.lineT = rnd(2, 4); a.watch = 0; a.near = 0; a.hostile = false; },
    update(e, c) {
      const a = c.a, api = c.api, d = e.def, mode = d.secretMode || 'talk';
      if (!a.hostile && e.pv < a.pv0 - 0.5) {
        a.hostile = true; a.noStun = false; a.st = 'move'; e.hidden = false; setVis(e, true);
        fx.text(e.pos.x, (e.height || 1.6) + 0.6, e.pos.z, '!', '#ff4d4d', 1.5); snd(e, 'cri', 0.5);
        const f = AIS[d.fightAi || 'brute'];
        if (f && f.init) f.init(e, api);
        a.st = 'move';
      }
      if (a.hostile) { const f = AIS[d.fightAi || 'brute']; if (f) f.update(e, c); return; }
      e.hidden = true;
      go(e, c, 0, 0, { face: mode === 'sleep' ? null : c.u });
      if (e.mesh) e.mesh.userData.asleep = mode === 'sleep' && a.st === 'calm' ? 1 : 0;
      const lines = d.lines || [];
      a.lineT -= c.dt;
      if (mode !== 'sleep' && c.d < 9 && a.lineT <= 0 && lines.length) {
        a.lineT = rnd(4.5, 7); fx.text(e.pos.x, (e.height || 1.6) + 0.5, e.pos.z, lines[a.lineI++ % lines.length], '#d8c8ff', 0.95); snd(e, 'chant', 2);
      }
      if (mode === 'vanish') {
        a.watch = isWatched(e, c, 12) ? a.watch + c.dt : Math.max(0, a.watch - c.dt * 0.5);
        if (e.mesh) setVis(e, Math.sin(c.now * 11) > -0.35 || a.watch < 1.5);   // elle vacille puis s'efface
        if (a.watch > num(d.vanishAfter, 4)) {
          fx.burst(e.pos.x, 1, e.pos.z, 0xd8c8ff, 30, { speed: 4, up: 4, life: 0.8, size: 0.2 });
          fx.text(e.pos.x, 2.2, e.pos.z, '...', '#d8c8ff', 1.3);
          if (api.heal) api.heal(Math.round(((c.P && c.P.pvMax) || 100) * 0.25));
          if (G.bus) G.bus.emit('secretCreature', { id: e.id, outcome: 'vanish', x: e.pos.x, z: e.pos.z, enemy: e });
          snd(e, 'mort', 0.1);
          despawn(e, api);
        }
      } else if (mode === 'shy') {
        if (c.d < 4.5) { const v = { x: -c.u.x, z: -c.u.z }; go(e, c, v.x * c.spd * 1.8, v.z * c.spd * 1.8, { face: v }); if (a.wallHit) a.side *= -1; }
      } else if (mode === 'sleep') {
        a.near = c.d < 3 ? a.near + c.dt : Math.max(0, a.near - c.dt);
        if (a.near > 5) { a.hostile = true; a.noStun = false; e.hidden = false; if (e.mesh) e.mesh.userData.asleep = 0; fx.text(e.pos.x, (e.height || 1.6) + 0.6, e.pos.z, 'Elle s\'éveille...', '#bfe6ff', 1.1); snd(e, 'cri', 0.5); const f = AIS[d.fightAi || 'brute']; if (f && f.init) f.init(e, api); a.st = 'move'; }
      } else if (mode === 'talk') {
        a.near = c.d < 3 ? a.near + c.dt : 0;
        if (a.near > 7 && !a.gift) {   // reste près d'elle : un présent
          a.gift = true; if (api.heal) api.heal(Math.round(((c.P && c.P.pvMax) || 100) * 0.3)); if (api.restoreMana) api.restoreMana(40);
          fx.text(e.pos.x, 2.2, e.pos.z, 'Un présent...', '#ffd23f', 1.1);
          if (G.bus) G.bus.emit('secretCreature', { id: e.id, outcome: 'gift', x: e.pos.x, z: e.pos.z, enemy: e });
        }
      }
    },
  };

  // enregistrement
  const REG = G.AI || (G.AI = (G.makeRegistry ? G.makeRegistry('AI') : { _i: {}, register(i, d) { this._i[i] = d; return d; }, get(i) { return this._i[i]; }, has(i) { return !!this._i[i]; }, ids() { return Object.keys(this._i); }, all() { return Object.values(this._i); } }));
  Object.keys(AIS).forEach((id) => {
    const def = AIS[id];
    REG.register(id, {
      selfMoving: true,
      init(e, api) { ensure(e); if (def.init) def.init(e, api); },
      update(e, dt, api) {
        if (!e._a) { ensure(e); if (def.init) def.init(e, api); }
        const c = begin(e, dt, api);
        if (!c) return;
        def.update(e, c);
      },
    });
  });

  // ------------------------------------------------------------------
  //  CAPACITÉS (def.abilities + affixes) — gérées par le bus
  // ------------------------------------------------------------------
  const busyNow = (e) => {
    const a = e._a;
    if (a && (a.lg || (a.st && a.st !== 'move' && a.st !== 'idle' && a.st !== 'chase'))) return true;
    return !a && ['windup', 'aim', 'charge', 'stun', 'attack'].includes(e.state);
  };
  const ABIL = {
    enrage: {
      onTick(e, dt, api, m) {
        if (m.s.enraged || e.pv / e.pvMax >= 0.4) return;
        m.s.enraged = true;
        e.dmg = Math.round(e.dmg * 1.35); e.speed *= 1.25; e.attackCd *= 0.8;
        fx.text(e.pos.x, (e.height || 1.5) + 0.6, e.pos.z, 'ENRAGÉ !', '#ff3b2f', 1.3);
        fx.burst(e.pos.x, 1, e.pos.z, 0xff3b2f, 20, { speed: 5, up: 4, life: 0.6, size: 0.2 });
        flash(e, 1, 0xff3b2f); sfx(api, 'bossRoar');
      },
    },
    regen: {
      onTick(e, dt, api, m) {
        const s = m.s;
        if (s.lastPv == null) s.lastPv = e.pv;
        if (e.pv < s.lastPv - 0.01) s.hurtT = 0; else s.hurtT = (s.hurtT || 0) + dt;
        if (s.hurtT > 2.5 && e.pv < e.pvMax) { e.pv = Math.min(e.pvMax, e.pv + e.pvMax * 0.025 * dt); setLabel(e); }
        s.lastPv = e.pv;
      },
    },
    lifesteal: { onHit(e, amount) { if (!e.dead) healEnemy(e, Math.max(1, amount * 0.4)); } },
    poisonTouch: {
      onHit(e) { POI.t = 3; POI.dmg = Math.max(1, Math.round(e.dmg * 0.22)); if (POI.tick <= 0) POI.tick = 1; },
    },
    deathExplosion: {
      onDeath(e, api) {
        if (e._a && e._a.exploded) return;
        zone(api, e.pos.x, e.pos.z, num(e.def.deathRadius, 2.4), 0.9, e.dmg * 1.2, (e.def && e.def.element) || 'feu', e, 0xff8a1a);
      },
    },
    splitOnDeath: {
      onDeath(e, api) {
        const id = e.def.splitInto || 'larve_essaim', n = num(e.def.splitCount, 3);
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * TAU + Math.random(), p = freeSpot(api, e.pos.x + Math.cos(ang) * 1.2, e.pos.z + Math.sin(ang) * 1.2, 0.5);
          if (api.spawnEnemy) api.spawnEnemy(id, V3(p.x, 0, p.z), {});
        }
      },
    },
    barrier: {
      onTick(e, dt, api, m) {
        const s = m.s;
        s.cd = (s.cd == null ? rnd(1, 4) : s.cd) - dt;
        if (s.cd <= 0 && !(e.shield > 0)) { setShield(e, e.pvMax * 0.3, 6); s.cd = 9; }
      },
    },
    summon: {
      onTick(e, dt, api, m) {
        const s = m.s;
        s.sm = (s.sm == null ? rnd(3, 6) : s.sm) - dt;
        if (s.sm <= 0 && !busyNow(e)) { s.sm = 9; spawnMinions(e, api, e.def.summon || 'larve_essaim', 2, 4); }
      },
    },
    blink: {
      onTick(e, dt, api, m) {
        const s = m.s;
        s.bk = (s.bk == null ? rnd(4, 7) : s.bk) - dt;
        if (s.bk > 0 || s.pend || busyNow(e)) return;
        const P = api.player && api.player();
        if (!P || !P.pos || Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) > 16) return;
        const ang = Math.random() * TAU, rr = rnd(3.5, 4.5);
        const p = freeSpot(api, P.pos.x + Math.cos(ang) * rr, P.pos.z + Math.sin(ang) * rr, 0.8);
        s.pend = true;
        const tele = teleCircle(null, api, p.x, p.z, 1.2);
        later(0.7, () => {
          teleDel(tele); s.pend = false; s.bk = rnd(6, 9);
          if (e.dead) return;
          fx.burst(e.pos.x, 1, e.pos.z, 0x6a8cff, 14, { speed: 4, up: 3, life: 0.5, size: 0.16 });
          e.pos.x = p.x; e.pos.z = p.z;
          fx.burst(p.x, 1, p.z, 0x6a8cff, 18, { speed: 4, up: 3, life: 0.5, size: 0.16 });
        }, tele);
        LATER[LATER.length - 1].prog = (k) => teleSet(tele, k);
      },
    },
  };

  function mstate(e) {
    if (e._m && e._m.ab) return e._m;
    const ab = [];
    ((e.def && e.def.abilities) || []).concat(e.abilities || []).forEach((id) => { if (ABIL[id] && !ab.includes(id)) ab.push(id); });
    const m = e._m || (e._m = { s: {} });
    m.ab = ab;
    ab.forEach((id) => { if (ABIL[id].onSpawn) ABIL[id].onSpawn(e, SKA(), m); });
    return m;
  }
  const runAb = (e, fn, a1, a2) => { const m = mstate(e); m.ab.forEach((id) => { const f = ABIL[id][fn]; if (f) { try { f(e, a1, a2, m); } catch (err) { console.error('[ai ability ' + id + ']', err); } } }); };

  function tickAll(dt) {
    const api = SKA();
    if (!api || !api.inRun || !api.inRun()) return;
    dt = Math.min(dt, 0.1);
    CLOCK += dt;
    const list = api.enemies ? api.enemies() : [];
    for (const e of list) {
      if (e.dead || e.spawnT > 0) continue;
      tickBuffs(e, dt);
      if (e.shieldT > 0) { e.shieldT -= dt; if (e.shieldT <= 0 || !(e.shield > 0)) dropShield(e); } else if (e._bub && !(e.shield > 0)) dropShield(e);
      if (e._bub) e._bub.material.opacity = 0.28;
      const m = mstate(e);
      if (m.ab.length) runAb(e, 'onTick', dt, api);
    }
    // temporisateurs globaux
    for (let i = LATER.length - 1; i >= 0; i--) {
      const l = LATER[i];
      l.t -= dt;
      if (l.prog) l.prog(1 - l.t / l.tot);
      if (l.t <= 0) { LATER.splice(i, 1); try { l.fn(); } catch (err) { console.error('[ai later]', err); } }
    }
    if (POI.t > 0) {
      POI.t -= dt; POI.tick -= dt;
      if (POI.tick <= 0) { POI.tick = 1; if (api.damagePlayer) api.damagePlayer(POI.dmg, { element: 'poison', source: 'poison' }); }
    }
  }

  if (G.bus) {
    G.bus.on('tick', (p) => tickAll(num(p && p.dt, 0.016)));
    G.bus.on('enemyKilled', (p) => {
      const e = p && p.enemy; if (!e) return;
      clearTeles(e._a);
      e.untargetable = false;
      if (!e.boss && !e.escaped && e.pos) CORPSES.push({ x: e.pos.x, z: e.pos.z, t: CLOCK });
      if (CORPSES.length > 10) CORPSES.shift();
      if (e.def && e.def.sfxFam) snd(e, 'mort', 0.1);
      if (e.possessedBy && e.possessedBy._a) e.possessedBy._a.host = null;
      const api = SKA();
      if (api) runAb(e, 'onDeath', api);
      dropShield(e);
    });
    G.bus.on('skillCast', () => {
      const api = SKA();
      if (!api || !api.inRun || !api.inRun()) return;
      api.enemies().forEach((x) => { if (x._a && x.def && x.def.noiseHunter) x._a.heard = 3.5; });
    });
    G.bus.on('playerHit', (p) => {
      const s = p && p.source;
      if (s && typeof s === 'object' && s.def && !s.dead) runAb(s, 'onHit', num(p.amount, 1), SKA());
    });
    G.bus.on('enemySpawn', (p) => {
      const e = p && p.enemy; if (!e) return;
      mstate(e);
      if (e.label && e.label.setText && e.def && e.def.name) e.label.setText(e.def.name);
    });
    ['runStart', 'runEnd', 'roomStart'].forEach((ev) => G.bus.on(ev, () => { clearLater(); CORPSES.length = 0; Object.keys(PACKS).forEach((k) => delete PACKS[k]); }));
  }

  G.Monsters = G.Monsters || {};
  G.Monsters.abilities = ABIL;
  G.Monsters.sounds = () => Object.keys(SOUNDS);
  G.Monsters.runtime = { buff, setShield, dropShield, healEnemy, despawn, zone, later, tickAll, freeSpot, ids: Object.keys(AIS) };
})();
