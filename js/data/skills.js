window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v5 « Ténèbres » — js/data/skills.js  → G.SKILLS (+ G.SKILL_TREES, G.SKILL_SPECS, G.CLASS_PASSIVES)
   Agent 2 « Combat Designer ». Spécification : /home/claude/donjon3d/CLASS-DESIGN.md (kits, ressources, synergies).
   Le moteur (cooldowns, charges, mana, ressources secondaires, passifs, forge, migration) est dans js/sys/skills.js ;
   ce fichier contient les compétences des 7 classes de départ (le Nécromancien est dans js/sys/necro.js).

   KIT DE CHAQUE CLASSE (8 classes ≈ 11 compétences) : attaque de base, 2 actives de départ, ultime (niveau 5), 3 actives + 2 passifs débloqués
   aux niveaux 5/10/15/20/25, 2 compétences exclusives de spécialisation (niveau 15). Le kit partagé v2 (épée/dague/feu/tornade) n'est plus
   équipé par personne ; ses entrées restent dans G.SKILLS (v2_*) UNIQUEMENT pour la compatibilité des anciennes sauvegardes.

   CONVENTIONS
   - cast(api, level, ctx) : api = G.SkillAPI ; ctx = { dir, charge(0..1), cm (mult. de charge), comboStep, level, max, v (variante 'A'|'B'|null),
       skill, slot, K (API moteur : ressources, marques, minuteries…), forge:{key,L,dmg,cd,mana}, perk(n) (forge ≥ n), flag(n) (spécialisation),
       dmgMult (spé × forge × classe × Écho/Rage…), buff(id,opts), refundCd(frac), res(id)/gain(id,n)/spend(id,n) }
     cast peut renvoyer false (annulé : mana + recharge remboursés) ou { cdMult, cdAdd, cd, noCd }.
   - Unités : « % P » = % de la puissance de base ; 100 % P = 1 hit de base (valeur 10 dans dmg()).
     dmg() = (pct/10) × niveau de comp. (+22 %/niv) × ctx.dmgMult × charge × niveau du héros × stats.dmg[élément] (Force / Intelligence incluses).
   - Tous les dégâts du joueur utilisent source 'player' (charge de l'ultime + vol de vie) ; l'id de la compétence est dans les tags ('sk:<id>').
   - Étourdissement / gel / peur : sur les boss, K.status() convertit en ralentissement 50 % (règle boss).
   - Éléments : physique feu glace foudre ombre sacre poison. Tags : 'melee','projectile','aoe','dash','trap','heal','shield','dot','summon','mark',
       'buff','ultimate','combo','channel','arcane','dist' (bonus de distance de l'Archer) … (utilisés par dons/équipements via skillCast).
   - desc(level) : texte clair avec chiffres ; les paliers N3/N5 (upgrades) sont ajoutés automatiquement quand ils sont atteints.
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  G.SKILLS = G.SKILLS || {};
  G.SKILL_TREES = G.SKILL_TREES || {};
  G.SKILL_SPECS = G.SKILL_SPECS || {};
  G.CLASS_PASSIVES = G.CLASS_PASSIVES || {};

  // ---------------------------------------------------------------- utilitaires
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const R = Math.round;
  const DATA = () => G.DATA || {};
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const V = (x, y, z) => (typeof THREE !== 'undefined' ? new THREE.Vector3(x, y || 0, z) : { x, y: y || 0, z });
  const nd = (d) => { const x = (d && d.x) || 0, z = (d && d.z) || 0, l = Math.hypot(x, z); return l < 1e-6 ? { x: 0, z: 1 } : { x: x / l, z: z / l }; };
  const rot = (d, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: d.x * c - d.z * s, z: d.x * s + d.z * c }; };
  const lvlM = (L, k) => 1 + (k == null ? 0.22 : k) * ((L || 1) - 1);
  const f1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  const alive = (e) => e && !e.dead && (e.pv == null || e.pv > 0);
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const KK = () => (G.Skills && G.Skills.K) || null;

  function pl(api) { return (api && api.player && api.player()) || { pos: V(0, 0, 0), stats: {}, level: 1, pv: 100, pvMax: 100, mana: 100, manaMax: 100 }; }
  function dirOf(api, ctx) {
    let d = ctx && ctx.dir;
    if (!d || (Math.abs(d.x || 0) + Math.abs(d.z || 0)) < 1e-4) d = api.aim ? api.aim(ctx) : null;
    if (!d || (Math.abs(d.x || 0) + Math.abs(d.z || 0)) < 1e-4) d = pl(api).dir;
    return nd(d);
  }
  // ÉQUILIBRAGE v5 (agent 3) — coefficients de dégâts par classe et par type de compétence, aux niveaux [1, 10, 20, 30] du héros
  // (basic = attaque de base, active = actives/pièges/alliés, ultimate = ultime). Interpolation linéaire entre les paliers.
  // 1 = valeur brute de CLASS-DESIGN.md. Seul endroit à modifier pour rééquilibrer le DPS d'une classe (voir qa/BALANCE-V5.md).
  const BAL = {
    Guerrier: { basic: [0.7926, 0.688, 0.6553, 0.5302], active: [0.7926, 0.688, 0.6553, 0.5302], ultimate: [0.7926, 0.688, 0.6553, 0.5302] },
    Mage: { basic: [0.621216, 0.437568, 0.456384, 0.441312], active: [0.621216, 0.437568, 0.456384, 0.441312], ultimate: [1.16478, 0.82044, 0.85572, 0.82746] },
    Voleur: { basic: [0.916, 0.7707, 0.6619, 0.6143], active: [0.916, 0.7707, 0.6619, 0.6143], ultimate: [0.916, 0.7707, 0.6619, 0.6143] },
    Assassin: { basic: [1.0313, 1.0078, 1.0491, 1.1725], active: [1.0313, 1.0078, 1.0491, 1.1725], ultimate: [1.23756, 1.20936, 1.25892, 1.407] },
    Archer: { basic: [0.8202, 0.5853, 0.3739, 0.3744], active: [0.8202, 0.5853, 0.3739, 0.3744], ultimate: [0.8202, 0.5853, 0.3739, 0.3744] },
    Paladin: { basic: [0.9138, 0.8993, 1.1878, 1.3441], active: [0.9138, 0.8993, 1.1878, 1.3441], ultimate: [0.9138, 0.8993, 1.1878, 1.3441] },
    Elementaliste: { basic: [1.0655, 0.8829, 0.936, 0.8544], active: [1.0655, 0.8829, 0.936, 0.8544], ultimate: [1.0655, 0.8829, 0.936, 0.8544] },
  };
  G.SKILL_BAL = BAL;
  const BAL_L = [1, 10, 20, 30];
  const balK = (sk, L) => {
    const c = BAL[sk.classe]; const r = c && c[sk.kind === 'basic' ? 'basic' : sk.kind === 'ultimate' ? 'ultimate' : 'active'];
    if (!r) return 1;
    L = clamp(L || 1, 1, 30);
    for (let i = 1; i < BAL_L.length; i++) if (L <= BAL_L[i]) return r[i - 1] + (r[i] - r[i - 1]) * (L - BAL_L[i - 1]) / (BAL_L[i] - BAL_L[i - 1]);
    return r[r.length - 1];
  };
  /** dégâts finaux pour `pct` % de puissance */
  function dmg(api, ctx, pct, element, mult) {
    const sk = (ctx && ctx.skill) || {};
    const p = pl(api), st = p.stats || {};
    const e = element || sk.element || 'physique';
    let m = lvlM(ctx.level, sk.lvlK) * (ctx.dmgMult || 1) * (ctx.cm || 1) * (mult || 1) * balK(sk, p.level);
    const xp = DATA().XP;
    m *= xp && xp.dmgMult ? xp.dmgMult(p.level || 1) : 1;
    m *= (st.dmg && Number(st.dmg[e])) || 1;
    return Math.max(1, R((pct / 10) * m));
  }
  const tagsOf = (ctx, extra) => ['sk:' + ctx.skill.id].concat(ctx.skill.tags || [], extra || []);
  function hit(api, ctx, e, pct, o) {
    o = o || {};
    const element = o.element || (ctx.skill && ctx.skill.element) || 'physique';
    return api.damage(e, dmg(api, ctx, pct, element, o.mult), {
      element, kind: o.kind || 'skill', knockback: o.kb || 0, tags: tagsOf(ctx, o.tags), canCrit: o.canCrit !== false, crit: o.crit,
      source: 'player', noCharge: !!o.noCharge,
    }) || 0;
  }
  function proj(api, ctx, o) {
    const p = pl(api), d = o.dir, speed = o.speed || 16;
    return api.projectile({
      pos: o.pos || V(p.pos.x + d.x * 0.7, 1, p.pos.z + d.z * 0.7), dir: V(d.x, 0, d.z), speed, model: o.model || 'orb',
      damage: o.pct ? dmg(api, ctx, o.pct, o.element, o.mult) : 0, element: o.element || ctx.skill.element, pierce: o.pierce || 0, radius: o.radius || 0.35,
      life: o.life || (o.range || 14) / speed, owner: 'player', source: 'player', tags: tagsOf(ctx, o.tags), knockback: o.kb || 0, crit: o.crit, homing: o.homing || 0,
      onHit: o.onHit, onEnd: o.onEnd,
    });
  }
  function fx(api, name, pos, opts) {
    try { if (api.vfx && name) api.vfx(name, pos, opts || {}); } catch (_) { /* visuel facultatif */ }
  }
  function text(api, pos, t, color, size) { try { api.text && api.text(pos, t, color || '#ffffff', size || 1); } catch (_) {} }
  function sfx(api, n) { try { api.sfx && api.sfx(n); } catch (_) {} }
  const P3 = (x, z, y) => V(x, y || 0, z);
  function inRadius(api, pos, r) { return ((api.enemiesInRadius && api.enemiesInRadius(pos, r)) || []).filter(alive); }
  function cone(api, p, d, range, arc) { return ((api.enemiesInCone && api.enemiesInCone(p.pos, V(d.x, 0, d.z), range, arc)) || []).filter(alive); }
  function nearest(api, pos, r) { return api.nearestEnemy ? api.nearestEnemy(pos, r) : null; }
  /** cible : ennemi le plus proche dans un cône (sinon le plus proche tout court) */
  function frontTarget(api, p, d, range, arc) {
    let best = null, bd = 1e9;
    for (const e of cone(api, p, d, range, arc || 1.2)) { const dd = dist2(e.pos, p.pos); if (dd < bd) { bd = dd; best = e; } }
    return best || (alive(nearest(api, p.pos, range)) ? nearest(api, p.pos, range) : null);
  }
  /** point visé : cible proche de la visée, sinon un point à `dflt` m */
  function aimPoint(api, p, d, range, dflt) {
    const t = frontTarget(api, p, d, range, 1.0);
    if (t) return { x: t.pos.x, z: t.pos.z, target: t };
    return { x: p.pos.x + d.x * dflt, z: p.pos.z + d.z * dflt };
  }
  /** ennemis le long d'une ligne (rayon, flèche perforante) */
  function lineEnemies(api, from, dir, range, width) {
    const out = [];
    for (const e of (api.enemies ? api.enemies() : [])) {
      if (!alive(e) || e.untargetable) continue;
      const dx = e.pos.x - from.x, dz = e.pos.z - from.z, along = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
      if (along < -0.3 || along > range + (e.r || 0.5) || side > width + (e.r || 0.5)) continue;
      out.push({ e, along });
    }
    out.sort((a, b) => a.along - b.along);
    return out.map((o) => o.e);
  }
  function dashTo(api, d, distance, duration, invuln, extra) {
    if (api.dash) api.dash(Object.assign({ dir: V(d.x, 0, d.z), distance, duration, invuln }, extra || {}));
  }
  function incant(ctx, frac, dur) { if (dur > 0) ctx.buff('incant_' + ctx.skill.id, { duration: dur, mul: { vitesse: 1 - frac } }); }
  function selfSlow(ctx, mult, dur, id) { ctx.buff(id || 'slow_' + ctx.skill.id, { duration: dur, mul: { vitesse: mult } }); }
  function st(ctx, api, e, id, dur, power) { return ctx.K.status(api, e, id, dur, power); }
  // brûlure / poison : power = dégâts par seconde
  function burn(api, ctx, e, pctPerSec, dur) { if (alive(e)) api.status(e, { id: 'burn', duration: dur, power: Math.max(2, dmg(api, ctx, pctPerSec, 'feu')) }); }
  function poison(api, ctx, e, pctPerSec, dur, mult) { if (alive(e)) api.status(e, { id: 'poison', duration: dur, power: Math.max(2, dmg(api, ctx, pctPerSec, 'poison', mult)) }); }
  const titanOn = (k) => { const t = k.v().titan; return t && t.until > k.time() ? t : null; };
  // stats : aides pour les passifs
  const sd = (s) => (s.dmg = s.dmg || {});
  const mulD = (s, e, m) => { const d = sd(s); d[e] = (d[e] == null ? 1 : d[e]) * m; };
  const mulAll = (s, m) => ['physique', 'feu', 'glace', 'foudre', 'ombre', 'sacre', 'poison'].forEach((e) => mulD(s, e, m));
  const add = (s, k, v) => { s[k] = (Number(s[k]) || 0) + v; };
  const mul = (s, k, m) => { if (s[k] != null) s[k] = Number(s[k]) * m; };

  // ---------------------------------------------------------------- enregistrement
  /**
   * S({id, classe, name, icon, vfx, sfx, element, kind, manaCost, cd, range, radius, unlockLevel, maxLevel, desc(L)|string, upgrades:[{level,text}],
   *    variants:{A:{name,text},B:{name,text}}, tags, branch, tier, spec, charges, charge, combo, passive(stats,L), cast})
   */
  function S(o) {
    const d = Object.assign({
      classe: '*', element: 'physique', kind: 'active', manaCost: 0, cd: 1, maxLevel: 5, unlockLevel: 1, rankReq: 'E', range: 0, radius: 0,
      tags: [], scale: 'force', lvlK: 0.22, icon: 'sparkles', vfx: null, sfx: null, upgrades: [], v5: true,
    }, o);
    d.tags = Array.from(new Set((d.tags || []).concat([d.element, d.kind])));
    d.tree = { branch: d.branch || 'A', tier: d.tier || 1, requires: [] };
    if (d.kind === 'ultimate') d.cd = d.cd || 50;
    const base = typeof d.desc === 'function' ? d.desc : (() => String(d.desc || ''));
    const ups = d.upgrades;
    d.baseDesc = base;
    d.desc = (L) => {
      L = L || 1;
      let t = base(L);
      const got = ups.filter((u) => L >= u.level);
      if (got.length) t += ' ' + got.map((u) => '[Niv ' + u.level + '] ' + u.text).join(' ');
      return t;
    };
    d.descNext = (L) => { const nx = ups.find((u) => u.level === L + 1); return nx ? 'Niveau ' + nx.level + ' : ' + nx.text : null; };
    G.SKILLS[d.id] = d;
    return d;
  }
  const UP = (level, text) => ({ level, text });
  const VAR = (a, b) => ({ A: { name: a[0], text: a[1] }, B: { name: b[0], text: b[1] } });
  const pc = (x) => R(x * 100);

  // =====================================================================
  // LEGACY v2 — conservé uniquement pour lire d'anciennes sauvegardes (jamais équipé, jamais appris)
  // =====================================================================
  [['v2_epee', "Coup d'épée", 'basic', 'epee', 'sword'], ['v2_dague', 'Lancer de dague', 'active', 'dague', 'dagger'], ['v2_feu', 'Boule de feu', 'active', 'feu', 'fire'], ['v2_tornade', 'Tornade Ultime', 'ultimate', null, 'tornado']]
    .forEach((a) => S({ id: a[0], classe: '*', name: a[1], icon: a[4], kind: a[2], v2: a[3] || undefined, legacy: true, maxLevel: a[3] ? 10 : 1, cd: 1, tags: ['legacy'], desc: 'Ancien kit v2 (obsolète).', cast() { return false; } }));

  // =====================================================================
  // GUERRIER — « Rempart d'acier » (Rage ; Brèche : un ennemi étourdi/ralenti subit +50 % de Fracas)
  // =====================================================================
  const rageGain = (ctx, n) => { if (n > 0) ctx.gain('rage', n * (titanOn(ctx.K) ? 2 : 1)); };
  const GU = 'Guerrier';
  S({
    id: 'guerrier_frappe', classe: GU, name: 'Taillade', icon: 'sword', vfx: 'slash_physique', sfx: 'swing', element: 'physique', kind: 'basic', manaCost: 0, cd: 0.55, range: 2.6, radius: 0,
    combo: { steps: 3, window: 0.8 }, tags: ['melee', 'combo'], branch: 'A', tier: 1,
    desc: (L) => 'Combo de 3 coups d\'arc (110°, 2,6 m) : 100 % / 100 % / 170 % de dégâts. Le 3e coup repousse et ralentit de 30 % pendant 1 s (Brèche). +4 Rage par ennemi touché (3 max).',
    upgrades: [UP(3, 'Fenêtre de combo 1,1 s.'), UP(5, 'Le 3e coup libère une onde courte (80 %, 3 m).')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), step = ctx.comboStep, ti = titanOn(k);
      const pct = [100, 100, 170][step] * (ti ? 1.2 : 1);
      const arc = ti ? TAU : (step === 2 && ctx.perk(5) ? 150 * DEG : 110 * DEG);
      let n = 0;
      for (const e of cone(api, p, d, 2.6, arc)) {
        hit(api, ctx, e, pct, { kind: 'melee', kb: step === 2 ? 2 : 0.6 });
        if (step === 2) st(ctx, api, e, 'slow', 1, 0.3);
        n++;
      }
      if (n) rageGain(ctx, Math.min(3, n) * (4 + (ctx.flag('berserk') ? 6 : 0) + (ctx.perk(10) ? 1 : 0)));
      if (step === 2 && (L >= 5 || ctx.perk(10))) {
        for (const e of inRadius(api, p.pos, 3)) if (!cone(api, p, d, 2.6, arc).includes(e)) hit(api, ctx, e, 80, { kind: 'aoe', kb: 1 });
        if (ctx.perk(10)) for (const e of lineEnemies(api, p.pos, d, 6, 0.9)) hit(api, ctx, e, 60, { kind: 'aoe', kb: 1 });
        fx(api, 'shockwave', p.pos, { radius: 3 });
      }
      fx(api, 'slash_physique', p.pos, { dir: d, radius: 2.6, arc });
      sfx(api, 'swing'); if (n) { api.hitStop && api.hitStop(step === 2 ? 0.06 : 0.03); api.shake && api.shake(step === 2 ? 0.25 : 0.1); }
      return step === 2 ? { cdMult: 1.3 } : undefined;
    },
  });
  G.SKILLS.guerrier_frappe.combo.window = 0.8;
  G.SKILLS.guerrier_frappe.comboWindowAt = (L) => (L >= 3 ? 1.1 : 0.8);

  S({
    id: 'guerrier_charge', classe: GU, name: 'Charge du bélier', icon: 'dash', vfx: 'dash', sfx: 'dash', element: 'physique', kind: 'active', manaCost: 12, cd: 8, range: 7, radius: 1.2,
    tags: ['melee', 'dash', 'cc'], branch: 'A', tier: 2,
    desc: (L) => 'Fonce de ' + (L >= 5 ? 10 : 7) + ' m en 0,3 s, invulnérable 0,3 s : 140 % de dégâts à chaque ennemi traversé et étourdit ' + (L >= 3 ? '2 cibles' : 'le premier touché') + ' (' + (L >= 5 ? '1,2' : '0,8') + ' s ; boss : ralentis). +10 Rage.',
    upgrades: [UP(3, 'Étourdit 2 cibles.'), UP(5, '+3 m, étourdissement 1,2 s et laisse une onde de choc (80 %, rayon 2).')],
    variants: VAR(['Bélier', 'Dégâts +50 %, étourdit 1,5 s la cible.'], ['Enjambée', 'Recharge −30 %, pas d\'étourdissement mais ralentit 40 % tous les touchés.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), dist = L >= 5 ? 10 : 7;
      const maxStun = (L >= 3 ? 2 : 1) + (ctx.perk(10) ? 1 : 0), dur = ctx.v === 'A' ? 1.5 : L >= 5 ? 1.2 : 0.8;
      let stunned = 0;
      dashTo(api, d, dist, 0.3, 0.3, {
        onPass: (e) => {
          if (!alive(e)) return;
          hit(api, ctx, e, 140 * (ctx.v === 'A' ? 1.5 : 1), { kind: 'melee', kb: 3 });
          if (ctx.v === 'B') st(ctx, api, e, 'slow', 2, 0.4);
          else if (stunned < maxStun) { stunned++; st(ctx, api, e, 'stun', dur, 1); }
        },
      });
      rageGain(ctx, 10);
      k.after(0.34, () => {
        const q = pl(api);
        if (L >= 5) { for (const e of inRadius(api, q.pos, 2)) hit(api, ctx, e, 80, { kind: 'aoe', kb: 2 }); fx(api, 'shockwave', q.pos, { radius: 2 }); }
        fx(api, 'ground_slam', q.pos, { radius: 1.8 }); api.shake && api.shake(0.3);
      });
      fx(api, 'dash', p.pos, {}); sfx(api, 'dash');
      return { cdMult: (ctx.v === 'B' ? 0.7 : 1) * 1, cdAdd: ctx.perk(5) ? -1 : 0 };
    },
  });

  S({
    id: 'guerrier_fracas', classe: GU, name: 'Fracas', icon: 'hammer', vfx: 'ground_slam', sfx: 'slam', element: 'physique', kind: 'active', manaCost: 16, cd: 6, range: 3.2, radius: 3.2,
    tags: ['melee', 'aoe', 'cc'], branch: 'A', tier: 3,
    desc: (L) => 'Frappe au sol (cône 160°, 3,2 m) : 260 % de dégâts, ralentit 30 % 2 s ; +50 % sur les ennemis étourdis ou ralentis (Brèche). +6 Rage par cible (18 max).',
    upgrades: [UP(3, '−1 s de recharge si au moins 2 cibles étaient étourdies ou ralenties.'), UP(5, 'Une fissure avance de 6 m (110 %).')],
    variants: VAR(['Séisme', 'Cône 360°, rayon 3,6 m.'], ['Brise-os', 'Brèche +100 % au lieu de +50 %, ralentissement 50 %.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), ti = titanOn(k);
      const arc = ctx.v === 'A' ? TAU : 160 * DEG, rng = ctx.v === 'A' ? 3.6 : 3.2;
      const bonus = ctx.v === 'B' ? 2 : 1.5, slow = ctx.v === 'B' ? 0.5 : 0.3;
      let n = 0, imp = 0;
      for (const e of cone(api, p, d, rng, arc)) {
        const b = k.impaired(e); if (b) imp++;
        hit(api, ctx, e, 260, { kind: 'melee', kb: 2.5, mult: b ? bonus : 1 });
        st(ctx, api, e, 'slow', 2, slow); n++;
      }
      rageGain(ctx, Math.min(18, 6 * n));
      if (L >= 5 || ctx.perk(10)) {
        const len = ctx.perk(10) ? 9 : 6, seen = new Set();
        fx(api, 'ground_slam', P3(p.pos.x + d.x * 2, p.pos.z + d.z * 2), { radius: 1.5 });
        for (let i = 1; i <= len; i++) k.after(0.07 * i, () => {
          const c = P3(p.pos.x + d.x * (2.5 + i), p.pos.z + d.z * (2.5 + i));
          for (const e of inRadius(api, c, 1.1)) if (!seen.has(e)) { seen.add(e); hit(api, ctx, e, 110, { kind: 'aoe', kb: 1 }); }
          if (i % 2 === 0) fx(api, 'ground_slam', c, { radius: 1.2 });
        });
      }
      fx(api, 'ground_slam', p.pos, { radius: rng }); api.shake && api.shake(0.5); api.hitStop && n && api.hitStop(0.06);
      return { cdMult: ti ? 0 : 1, cdAdd: (ctx.perk(5) ? -1 : 0) + (L >= 3 && imp >= 2 ? -1 : 0), noCd: !!ti };
    },
  });

  S({
    id: 'guerrier_colere_titan', classe: GU, name: 'Colère du Titan', icon: 'crown', vfx: 'levelup', sfx: 'super', element: 'physique', kind: 'ultimate', manaCost: 0, cd: 50, range: 5, radius: 5,
    unlockLevel: 5, tags: ['melee', 'aoe', 'buff', 'ultimate'], branch: 'A', tier: 4,
    desc: (L) => 'Consomme TOUTE la Rage R (intensité s = 0,5 + R/200). Onde initiale 350 % × s (rayon 5, étourdit 1,5 s) puis ' + (7 + (L >= 5 ? 2 : 0)) + ' s de forme Titan : +30 % × s dégâts, −35 % × s dégâts subis, Taillade 360° (120 %), Fracas sans recharge, Rage ×2.',
    upgrades: [UP(3, 'Onde initiale +20 %.'), UP(5, '+2 s de forme Titan et soigne 10 % des PV max.')],
    variants: VAR(['Séisme titanesque', 'Onde initiale +40 %, rayon 6.'], ['Colosse', 'Dégâts subis −10 % de plus et +3 s de durée.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), R0 = k.res.get('rage'), s = 0.5 + R0 / 200;
      k.res.set('rage', ctx.perk(10) ? R0 * 0.25 : 0);
      const dur = 7 + (L >= 5 ? 2 : 0) + (ctx.perk(5) ? 1 : 0) + (ctx.v === 'B' ? 3 : 0), rad = ctx.v === 'A' ? 6 : 5;
      let n = 0;
      for (const e of inRadius(api, p.pos, rad)) { hit(api, ctx, e, 350 * s * (L >= 3 ? 1.2 : 1) * (ctx.v === 'A' ? 1.4 : 1), { kind: 'aoe', kb: 4 }); st(ctx, api, e, 'stun', 1.5, 1); n++; }
      k.v().titan = { until: k.time() + dur, s };
      ctx.buff('titan', { duration: dur, mulD: { physique: 1 + 0.3 * s }, incoming: 1 - 0.35 * s - (ctx.v === 'B' ? 0.1 : 0), name: 'Forme Titan', icon: 'crown', vfx: 'buff', color: 0xff4d4d,
        onEnd: () => { k.v().titan = null; } });
      if (L >= 5 && api.heal) api.heal(p.pvMax * 0.1);
      fx(api, 'levelup', p.pos, { color: 0xff4d4d }); fx(api, 'shockwave', p.pos, { radius: rad, color: 0xff4d4d }); fx(api, 'ground_slam', p.pos, { radius: rad });
      api.clearEnemyProjectiles && api.clearEnemyProjectiles(p.pos, rad);
      api.shake && api.shake(0.8); api.hitStop && api.hitStop(0.1); sfx(api, 'super');
      text(api, p.pos, 'TITAN ×' + f1(s), '#ff6a4d', 1.4);
    },
  });

  S({
    id: 'guerrier_cri', classe: GU, name: 'Cri de ralliement', icon: 'sparkles', vfx: 'buff', sfx: 'bossRoar', element: 'physique', kind: 'active', manaCost: 12, cd: 14, range: 6, radius: 6,
    unlockLevel: 5, tags: ['buff', 'cc', 'aoe'], branch: 'B', tier: 1,
    desc: (L) => 'Rugissement (rayon 6 m) : ennemis ralentis de 35 % pendant 4 s ; vous subissez −15 % de dégâts pendant 5 s et gagnez +20 Rage.',
    upgrades: [UP(5, 'Fait fuir 1,5 s (peur) les ennemis ordinaires.')],
    cast(api, L, ctx) {
      const p = pl(api), r = 6 * (ctx.flag('guardian') ? 1.4 : 1);
      for (const e of inRadius(api, p.pos, r)) { st(ctx, api, e, 'slow', 4, 0.35); if (L >= 5 && !e.boss && !e.elite) st(ctx, api, e, 'fear', 1.5, 1); }
      ctx.buff('cri', { duration: 5, incoming: 0.85, name: 'Cri de ralliement', icon: 'sparkles' });
      rageGain(ctx, 20);
      fx(api, 'shockwave', p.pos, { radius: r, color: 0x3a86ff }); fx(api, 'buff', p.pos, { color: 0x3a86ff }); api.shake && api.shake(0.3); sfx(api, 'bossRoar');
    },
  });
  S({
    id: 'guerrier_cuirasse', classe: GU, name: 'Cuirasse du bastion', icon: 'shield', kind: 'passive', unlockLevel: 10, tags: ['defense'], branch: 'B', tier: 2,
    desc: (L) => 'Passif : +15 % de défense ; chaque tranche de 20 Rage au-delà de 50 réduit encore de 3 % les dégâts subis (2 paliers).',
    upgrades: [UP(5, 'Les coups reçus renvoient 10 % de dégâts en physique à l\'attaquant proche.')],
    passive(s) { mul(s, 'defense', 1.15); return s; },
  });
  S({
    id: 'guerrier_hache', classe: GU, name: 'Hache-boomerang', icon: 'bolt', vfx: 'trail', sfx: 'throw', element: 'physique', kind: 'active', manaCost: 14, cd: 7, range: 14, radius: 0.8,
    unlockLevel: 15, tags: ['projectile', 'cc'], branch: 'B', tier: 3,
    desc: (L) => 'Lance une hache (14 m) : 150 % à l\'aller, 100 % au retour, ralentit de 20 %. +6 Rage par touche. C\'est votre seule attaque à distance.',
    upgrades: [UP(5, 'Traverse tous les ennemis ; le retour étourdit 0,5 s.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), pierce = L >= 5 ? 99 : 1;
      const mk = (from, dir, pct, back) => proj(api, ctx, { pos: from, dir, speed: 17, range: 14, pct, pierce, radius: 0.7, model: 'dagger', kb: 1,
        onHit: (e) => { st(ctx, api, e, 'slow', 2, 0.2); rageGain(ctx, 6); if (back && L >= 5) st(ctx, api, e, 'stun', 0.5, 1); } });
      mk(V(p.pos.x + d.x * 0.7, 1, p.pos.z + d.z * 0.7), d, 150, false);
      k.after(14 / 17 + 0.05, () => {
        const q = pl(api), sx = p.pos.x + d.x * 14, sz = p.pos.z + d.z * 14;
        const bd = nd({ x: q.pos.x - sx, z: q.pos.z - sz });
        mk(V(sx, 1, sz), bd, 100, true);
      });
      sfx(api, 'throw');
    },
  });
  S({
    id: 'guerrier_tourbillon', classe: GU, name: 'Danse des lames', icon: 'tornado', vfx: 'slash_physique', sfx: 'swing', element: 'physique', kind: 'active', manaCost: 20, cd: 10, range: 3, radius: 3,
    unlockLevel: 20, tags: ['melee', 'aoe'], branch: 'B', tier: 4,
    desc: (L) => 'Tournoie 2,5 s (rayon 3 m) : 40 % de dégâts toutes les 0,25 s, vous gardez 60 % de votre vitesse. +3 Rage par touche.',
    upgrades: [UP(5, 'Le dernier tour inflige 200 %.')],
    cast(api, L, ctx) {
      const k = ctx.K;
      selfSlow(ctx, 0.6, 2.5, 'danse');
      ctx.buff('danse_lames', { duration: 2.5, name: 'Danse des lames', icon: 'tornado' });
      k.loop(2.5, 0.25, (i) => {
        const q = pl(api), last = i >= 10;
        let n = 0;
        for (const e of inRadius(api, q.pos, 3)) { hit(api, ctx, e, last && L >= 5 ? 200 : 40, { kind: 'melee', kb: last ? 3 : 0.8 }); n++; }
        if (n) rageGain(ctx, Math.min(9, 3 * n));
        fx(api, 'slash_physique', q.pos, { radius: 3, arc: TAU, dir: { x: Math.cos(i), z: Math.sin(i) } });
        if (i % 2 === 0) { sfx(api, 'swing'); api.shake && api.shake(0.1); }
      });
    },
  });
  S({
    id: 'guerrier_indomptable', classe: GU, name: 'Indomptable', icon: 'heart', kind: 'passive', unlockLevel: 25, tags: ['defense'], branch: 'B', tier: 5,
    desc: (L) => 'Passif : un coup mortel vous laisse 1 PV, remplit la Rage à 100 et vous rend invulnérable 2 s. Recharge ' + (L >= 5 ? 60 : 90) + ' s.',
    upgrades: [UP(5, 'Recharge 60 s et soigne 25 % des PV max.')],
    passive(s) { return s; },
  });
  S({
    id: 'guerrier_bastion', classe: GU, name: 'Bastion', icon: 'shield', vfx: 'buff', sfx: 'upgrade', element: 'physique', kind: 'active', manaCost: 20, cd: 18, range: 6, radius: 6,
    unlockLevel: 15, spec: 'gardien', tags: ['buff', 'defense', 'cc'], branch: 'C', tier: 1,
    desc: (L) => 'Spécialisation Rempart. Plante l\'étendard 5 s : dégâts subis −40 %, renvoie 30 % en physique, ralentit de 30 % les ennemis à 6 m (ils s\'acharnent sur vous). Gagner de la Rage à chaque coup encaissé.',
    upgrades: [UP(3, 'Durée +1 s.'), UP(5, 'Renvoi 45 %.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = 5 + (L >= 3 ? 1 : 0), refl = L >= 5 ? 45 : 30;
      ctx.buff('bastion', { duration: dur, incoming: 0.6, name: 'Bastion', icon: 'shield', repeat: true, onHit: (dm) => { const e = nearest(api, pl(api).pos, 3.5); if (e) hit(api, ctx, e, refl * 0.5, { kind: 'melee', canCrit: false, noCharge: true }); rageGain(ctx, 4); } });
      k.loop(dur, 1, () => { const q = pl(api); for (const e of inRadius(api, q.pos, 6)) st(ctx, api, e, 'slow', 1.2, 0.3); fx(api, 'aoe_physique', q.pos, { radius: 6 }); });
      fx(api, 'buff', p.pos, { color: 0x3a86ff }); fx(api, 'shockwave', p.pos, { radius: 4, color: 0x3a86ff }); api.shake && api.shake(0.3);
    },
  });
  S({
    id: 'guerrier_frenesie', classe: GU, name: 'Frénésie sanglante', icon: 'heartbeat', vfx: 'buff', sfx: 'bossRoar', element: 'physique', kind: 'active', manaCost: 0, cd: 20, range: 0, radius: 0,
    unlockLevel: 15, spec: 'berserker', tags: ['buff', 'dash'], branch: 'C', tier: 2,
    desc: (L) => 'Spécialisation Berserker. Sacrifie 10 % de vos PV actuels : 6 s de frénésie — +35 % dégâts, vitesse d\'attaque +30 %, vol de vie 25 %, +10 Rage par seconde.',
    upgrades: [UP(3, 'Durée 7 s.'), UP(5, 'Vol de vie 35 %.')],
    cast(api, L, ctx) {
      const p = pl(api), cost = Math.min(p.pv * 0.1, p.pv - 2);
      if (cost > 0 && api.damagePlayer) api.damagePlayer(cost, { source: 'frenesie', hazard: true });
      const dur = 6 + (L >= 3 ? 1 : 0);
      ctx.buff('frenesie', { duration: dur, mulD: { physique: 1.35 }, add: { lifesteal: L >= 5 ? 0.35 : 0.25 }, atkSpeed: 1.3, tick: 1, onTick: () => rageGain(ctx, 10), name: 'Frénésie', icon: 'heartbeat', vfx: 'buff', color: 0xff3030 });
      fx(api, 'buff', p.pos, { color: 0xff3030 }); api.shake && api.shake(0.3); sfx(api, 'bossRoar');
    },
  });
  G.SKILL_TREES.Guerrier = { branches: { A: { name: 'Kit de départ', icon: '⚔️', desc: 'Taillade, Charge, Fracas et l\'ultime Colère du Titan.' }, B: { name: 'Déblocages', icon: '🛡️', desc: 'Cris, hache, danse des lames et passifs (niveaux 5 à 25).' }, C: { name: 'Spécialisation', icon: '🔥', desc: 'Rempart (Bastion) ou Berserker (Frénésie), au niveau 15.' } }, core: { basic: 'guerrier_frappe', cast2: 'guerrier_charge', cast3: 'guerrier_fracas', super: 'guerrier_colere_titan' } };

  // =====================================================================
  // MAGE — « Canon de verre arcanique » (incantations ; Écho arcanique : chaque sort différent enchaîné +10 % au suivant ; ≥ 80 % de mana +10 %)
  // =====================================================================
  const MG = 'Mage';
  S({
    id: 'mage_trait_arcanique', classe: MG, name: 'Trait arcanique', icon: 'staff', vfx: 'bolt_ombre', sfx: 'throw', element: 'ombre', scale: 'int', kind: 'basic', manaCost: 0, cd: 0.6, range: 14, radius: 0.4,
    tags: ['projectile', 'arcane'], branch: 'A', tier: 1,
    desc: (L) => 'Incantation 0,15 s puis projectile d\'arcane (14 m) : 90 % de dégâts. Chaque touche rend 2 mana (le passif Flux arcanique). Ne casse jamais l\'Écho.',
    upgrades: [UP(3, 'Perce 1 ennemi.'), UP(5, 'Lance 2 traits si vous avez au moins 2 Échos.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx);
      incant(ctx, 0.4, 0.15);
      const gain = 2 + (ctx.perk(5) ? 1 : 0);
      const pierce = ctx.perk(10) ? 2 : (L >= 3 ? 1 : 0);
      const shots = L >= 5 && k.echo() >= 2 ? 2 : 1;
      for (let i = 0; i < shots; i++) {
        const dd = shots === 1 ? d : rot(d, (i === 0 ? -1 : 1) * 0.1);
        k.after(0.15 + i * 0.06, () => { const q = pl(api); proj(api, ctx, { dir: dd, pos: V(q.pos.x + dd.x * 0.7, 1, q.pos.z + dd.z * 0.7), speed: 16, range: 14, pct: 90, pierce, radius: 0.4, model: 'orb', onHit: () => { api.restoreMana && api.restoreMana(gain); } }); });
      }
      fx(api, 'cast_ombre', p.pos, {}); sfx(api, 'throw');
    },
  });
  S({
    id: 'mage_orbe_braise', classe: MG, name: 'Orbe de braise', icon: 'fire', vfx: 'explosion_feu', sfx: 'fire', element: 'feu', scale: 'int', kind: 'active', manaCost: 14, cd: 3, range: 14, radius: 2.6,
    tags: ['projectile', 'aoe', 'dot'], branch: 'A', tier: 2,
    desc: (L) => 'Incantation 0,35 s : orbe de feu lente qui explose (rayon ' + (L >= 3 ? 3.2 : 2.6) + ' m) : 380 % de dégâts et brûlure 3 s (40 %/s). Légèrement guidée. Les brûlés subiront +30 % du Rayon d\'arcane.',
    upgrades: [UP(3, 'Rayon d\'explosion 3,2 m.'), UP(5, 'Laisse une flaque de flammes 3 s.')],
    variants: VAR(['Supernova', 'Rayon +50 %, dégâts −15 %.'], ['Braise vive', 'Brûlure 6 s et +50 % de dégâts de brûlure.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), r = (L >= 3 ? 3.2 : 2.6) * (ctx.v === 'A' ? 1.5 : 1);
      incant(ctx, 0.6, 0.35);
      k.after(0.35, () => {
        // visée au LÂCHER (après l'incantation) depuis la position actuelle : sinon l'orbe part dans une direction périmée
        const q = pl(api);
        let d = dirOf(api, ctx);
        const tg = frontTarget(api, q, d, 14, 1.2);                    // légère aide à la visée : l'orbe part vers la cible la plus proche de la visée
        if (tg) d = nd({ x: tg.pos.x - q.pos.x, z: tg.pos.z - q.pos.z });
        proj(api, ctx, { dir: d, pos: V(q.pos.x + d.x * 0.8, 1, q.pos.z + d.z * 0.8), speed: 11, range: 14, pct: 0, radius: 0.5, model: 'fireball', homing: 0.5,
          onEnd: (pos) => {
            if (!pos) return;
            for (const e of inRadius(api, pos, r)) {
              hit(api, ctx, e, 380 * (ctx.v === 'A' ? 0.85 : 1), { kind: 'aoe', kb: 1.5 });
              burn(api, ctx, e, 40 * (ctx.v === 'B' ? 1.5 : 1), ctx.v === 'B' ? 6 : 3);
            }
            fx(api, 'explosion_feu', pos, { radius: r }); api.shake && api.shake(0.35); sfx(api, 'boom');
            if (L >= 5) k.loop(3, 0.5, () => { for (const e of inRadius(api, pos, r * 0.8)) { hit(api, ctx, e, 30, { kind: 'dot', canCrit: false, noCharge: true }); burn(api, ctx, e, 30, 2); } fx(api, 'aoe_feu', pos, { radius: r * 0.8, dur: 0.6 }); });
          } });
      });
      fx(api, 'cast_feu', p.pos, {}); sfx(api, 'fire');
    },
  });
  S({
    id: 'mage_rayon', classe: MG, name: 'Rayon d\'arcane', icon: 'lightning', vfx: 'beam_ombre', sfx: 'throw', element: 'ombre', scale: 'int', kind: 'active', manaCost: 20, cd: 6, range: 12, radius: 0.9,
    manaAt: (L) => (L >= 3 ? 16 : 20), tags: ['channel', 'arcane', 'aoe'], branch: 'A', tier: 3,
    desc: (L) => 'Canalisation ' + (L >= 5 ? '1,8' : '1,4') + ' s (vitesse −80 %) : rayon de 12 m, ' + (L >= 5 ? 8 : 6) + ' impacts de 65 %. +30 % sur les ennemis brûlés (synergie Orbe).',
    upgrades: [UP(3, 'Coût en mana −20 %.'), UP(5, 'Dure 1,8 s et traverse les obstacles.')],
    variants: VAR(['Faisceau large', 'Largeur ×2, dégâts −20 %.'], ['Rayon focalisé', 'Dégâts +40 %, canalisation 0,3 s plus courte.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), dur = (L >= 5 ? 1.8 : 1.4) - (ctx.v === 'B' ? 0.3 : 0), n = L >= 5 ? 8 : 6;
      const w = ctx.v === 'A' ? 1.8 : 0.9;
      selfSlow(ctx, 0.2, dur, 'canal_rayon');
      k.v().channel = k.time() + dur;
      let tick = 0;
      k.loop(dur, dur / n, () => {
        tick++;
        const q = pl(api);
        let dd = d; const t = nearest(api, q.pos, 12);
        if (t) { const nd2 = nd({ x: t.pos.x - q.pos.x, z: t.pos.z - q.pos.z }); if (nd2.x * d.x + nd2.z * d.z > 0.85) dd = nd2; }
        for (const e of lineEnemies(api, q.pos, dd, 12, w)) {
          const burning = k.hasStatus(e, 'burn');
          hit(api, ctx, e, 65 * (burning ? 1.3 : 1) * (ctx.v === 'A' ? 0.8 : ctx.v === 'B' ? 1.4 : 1), { kind: 'skill' });
          if (ctx.flag('inferno')) burn(api, ctx, e, 25, 2);
        }
        fx(api, 'beam_ombre', V(q.pos.x, 1, q.pos.z), { to: V(q.pos.x + dd.x * 12, 1, q.pos.z + dd.z * 12), dur: 0.3 });
        if (tick % 2 === 0) { api.shake && api.shake(0.12); sfx(api, 'throw'); }
      });
      fx(api, 'cast_ombre', p.pos, {});
    },
  });
  S({
    id: 'mage_cataclysme', classe: MG, name: 'Cataclysme', icon: 'fire', vfx: 'nova_ombre', sfx: 'super', element: 'feu', scale: 'int', kind: 'ultimate', manaCost: 0, cd: 55, range: 14, radius: 6,
    unlockLevel: 5, tags: ['aoe', 'channel', 'ultimate', 'arcane'], branch: 'A', tier: 4,
    desc: (L) => 'Incantation 1,5 s (immobile) puis vortex de feu et d\'arcane (rayon 6 m, 4 s) qui attire les ennemis : 130 % toutes les 0,5 s, impact final 900 %. Chaque Écho +10 %, ennemis brûlés +30 %.',
    upgrades: [UP(3, 'Impact final +20 %.'), UP(5, 'Le vortex suit lentement le mage.')],
    variants: VAR(['Trou noir', 'Attire fortement, rayon 7 m, dégâts de tick −20 %.'], ['Pluie de météores', 'Impact final +50 %, 4 s de brûlure.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), tgt = aimPoint(api, p, d, 14, 7);
      const inc = 1.5 - (ctx.perk(10) ? 0.5 : 0), rad = 6 + (ctx.perk(5) ? 1 : 0) + (ctx.v === 'A' ? 1 : 0);
      selfSlow(ctx, 0.02, inc, 'incant_cata');
      ctx.buff('incant_cata_n', { duration: inc, name: 'Incantation', icon: 'fire' });
      fx(api, 'cast_feu', p.pos, {}); fx(api, 'summon', P3(tgt.x, tgt.z), { color: 0xff6a1a, rise: false });
      k.after(inc, () => {
        const c = { x: tgt.x, z: tgt.z };
        fx(api, 'nova_ombre', P3(c.x, c.z), { radius: rad }); fx(api, 'aoe_feu', P3(c.x, c.z), { radius: rad, dur: 4 }); sfx(api, 'boom');
        k.loop(4, 0.5, (i) => {
          const q = pl(api);
          if (L >= 5) { const dx = q.pos.x - c.x, dz = q.pos.z - c.z, dd = Math.hypot(dx, dz) || 1; c.x += dx / dd * 0.5; c.z += dz / dd * 0.5; }
          for (const e of inRadius(api, P3(c.x, c.z), rad)) {
            hit(api, ctx, e, 130 * (k.hasStatus(e, 'burn') ? 1.3 : 1) * (ctx.v === 'A' ? 0.8 : 1), { kind: 'aoe' });
            if (!e.boss) { const n = nd({ x: c.x - e.pos.x, z: c.z - e.pos.z }); const f = (ctx.v === 'A' ? 5 : 3) * (Math.min(1, Math.hypot(c.x - e.pos.x, c.z - e.pos.z) / rad) + 0.3); e.kbx = (e.kbx || 0) + n.x * f; e.kbz = (e.kbz || 0) + n.z * f; }
          }
          fx(api, 'explosion_feu', P3(c.x, c.z), { radius: rad * 0.5 }); api.shake && api.shake(0.2);
        }, () => {
          for (const e of inRadius(api, P3(c.x, c.z), rad)) { hit(api, ctx, e, 900 * (L >= 3 ? 1.2 : 1) * (ctx.v === 'B' ? 1.5 : 1) * (k.hasStatus(e, 'burn') ? 1.3 : 1), { kind: 'aoe', kb: 4 }); if (ctx.v === 'B') burn(api, ctx, e, 60, 4); }
          fx(api, 'explosion_feu', P3(c.x, c.z), { radius: rad }); fx(api, 'nova_ombre', P3(c.x, c.z), { radius: rad }); api.shake && api.shake(0.9); api.hitStop && api.hitStop(0.1); sfx(api, 'boom');
        });
      });
    },
  });
  S({
    id: 'mage_pas_arcanique', classe: MG, name: 'Pas arcanique', icon: 'dash', vfx: 'teleport', sfx: 'dash', element: 'ombre', scale: 'int', kind: 'active', manaCost: 10, cd: 8, range: 7, radius: 2.5,
    unlockLevel: 5, tags: ['dash', 'aoe', 'arcane'], branch: 'B', tier: 1,
    desc: (L) => 'Téléportation de 7 m (invulnérable 0,2 s) ; une rune reste sur place et explose 0,6 s plus tard : 150 % de dégâts (rayon 2,5). Compte pour l\'Écho. Votre seule mobilité.',
    upgrades: [UP(5, 'Chaque ennemi touché par la rune réduit la recharge de 2 s (max 6 s).')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), ox = p.pos.x, oz = p.pos.z;
      fx(api, 'teleport', p.pos, { color: 0x9d4edd });
      dashTo(api, d, 7, 0.08, 0.3, { phase: true });
      k.after(0.6, () => {
        let n = 0;
        for (const e of inRadius(api, P3(ox, oz), 2.5)) { hit(api, ctx, e, 150, { kind: 'aoe', kb: 2 }); n++; }
        fx(api, 'explosion_ombre', P3(ox, oz), { radius: 2.5 }); fx(api, 'nova_ombre', P3(ox, oz), { radius: 2.5 }); sfx(api, 'boom');
        if (L >= 5 && n) k.cdCut('mage_pas_arcanique', Math.min(6, 2 * n));
      });
      fx(api, 'aoe_ombre', P3(ox, oz), { radius: 2.5, dur: 0.6 });
      fx(api, 'teleport', P3(p.pos.x + d.x * 7, p.pos.z + d.z * 7), { color: 0x9d4edd }); sfx(api, 'dash');
    },
  });
  S({
    id: 'mage_meteore', classe: MG, name: 'Chute de météore', icon: 'fire', vfx: 'explosion_feu', sfx: 'boom', element: 'feu', scale: 'int', kind: 'active', manaCost: 30, cd: 14, range: 14, radius: 3.5,
    unlockLevel: 10, tags: ['aoe', 'dot'], branch: 'B', tier: 2,
    desc: (L) => 'Marque la zone 1 s puis un météore s\'écrase (rayon 3,5) : 800 % de dégâts et brûlure 4 s. Avec 3 Échos, jusqu\'à 1 040 %.',
    upgrades: [UP(5, 'Un second météore s\'abat 0,8 s plus tard.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), tgt = aimPoint(api, p, d, 14, 8);
      const drop = (x, z, delay) => api.aoe({ pos: P3(x, z), radius: 3.5, damage: dmg(api, ctx, 800, 'feu'), element: 'feu', delay, telegraph: true, vfx: 'explosion_feu', source: 'player', tags: tagsOf(ctx, ['aoe']), knockback: 1,
        onHit: (e) => { burn(api, ctx, e, 40, 4); } });
      drop(tgt.x, tgt.z, 1.0);
      fx(api, 'cast_feu', p.pos, {});
      if (L >= 5) {
        const o = inRadius(api, P3(tgt.x, tgt.z), 6).filter((e) => !tgt.target || e !== tgt.target)[0];
        k.after(0.8, () => { if (o && alive(o)) drop(o.pos.x, o.pos.z, 1.0); else drop(tgt.x + 2, tgt.z + 1.5, 1.0); });
      }
      k.after(1.0, () => { api.shake && api.shake(0.7); api.hitStop && api.hitStop(0.06); });
    },
  });
  S({
    id: 'mage_maitrise_flux', classe: MG, name: 'Maître du flux', icon: 'sparkles', kind: 'passive', unlockLevel: 15, tags: ['arcane'], branch: 'B', tier: 3, element: 'ombre',
    desc: () => 'Passif : l\'Écho monte à 5 Échos (au lieu de 3) ; chaque Écho réduit de 1 % la recharge de vos sorts.',
    upgrades: [UP(5, 'L\'Écho dure 5 s au lieu de 4.')],
    passive(s) { return s; },
  });
  S({
    id: 'mage_egide', classe: MG, name: 'Égide de mana', icon: 'shield', vfx: 'buff', sfx: 'upgrade', element: 'ombre', scale: 'int', kind: 'active', manaCost: 10, cd: 12, range: 0, radius: 4,
    unlockLevel: 20, tags: ['shield', 'buff'], branch: 'B', tier: 4,
    desc: (L) => 'Pendant 5 s, 70 % des dégâts subis sont payés avec votre mana (jusqu\'à épuisement) ; chaque coup absorbé rend 1 % de mana. Sauvetage du canon de verre.',
    upgrades: [UP(5, 'À la fin, une explosion inflige 200 % autour de vous.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api);
      k.v().egide = { until: k.time() + 5, absorbed: 0 };
      ctx.buff('egide', { duration: 5, name: 'Égide de mana', icon: 'shield', vfx: 'buff', color: 0x6fa8ff, onEnd: () => {
        k.v().egide = null;
        if (L >= 5) { const q = pl(api); for (const e of inRadius(api, q.pos, 4)) hit(api, ctx, e, 200, { kind: 'aoe', kb: 3 }); fx(api, 'nova_ombre', q.pos, { radius: 4 }); api.shake && api.shake(0.4); }
      } });
      fx(api, 'buff', p.pos, { color: 0x6fa8ff }); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'mage_surcharge', classe: MG, name: 'Surcharge', icon: 'mana', kind: 'passive', unlockLevel: 25, tags: ['arcane'], branch: 'B', tier: 5, element: 'ombre',
    desc: (L) => 'Passif : à 80 % de mana ou plus, +15 % de dégâts (au lieu de 10 %). Une fois par ' + (L >= 5 ? 15 : 25) + ' s, un sort qui manque de mana est lancé quand même (mana à 0).',
    upgrades: [UP(5, 'Recharge de la Surcharge 15 s.')],
    passive(s) { return s; },
  });
  S({
    id: 'mage_brasier', classe: MG, name: 'Brasier', icon: 'fire', vfx: 'aoe_feu', sfx: 'fire', element: 'feu', scale: 'int', kind: 'active', manaCost: 24, cd: 11, range: 12, radius: 4,
    unlockLevel: 15, spec: 'pyromancien', tags: ['aoe', 'dot'], branch: 'C', tier: 1,
    desc: (L) => 'Spécialisation Pyromancien. Jardin de flammes (rayon 4 m, 6 s) : 70 % toutes les 0,5 s ; tout ennemi touché brûle 3 s, y compris en sortant du jardin.',
    upgrades: [UP(3, 'Durée 7 s.'), UP(5, 'Rayon 5 m.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), tgt = aimPoint(api, p, d, 12, 6), rad = L >= 5 ? 5 : 4, dur = L >= 3 ? 7 : 6;
      incant(ctx, 0.5, 0.25);
      fx(api, 'aoe_feu', P3(tgt.x, tgt.z), { radius: rad, dur }); fx(api, 'cast_feu', p.pos, {});
      k.loop(dur, 0.5, (i) => { for (const e of inRadius(api, P3(tgt.x, tgt.z), rad)) { hit(api, ctx, e, 70, { kind: 'aoe' }); burn(api, ctx, e, 40, 3); } if (i % 2 === 0) fx(api, 'fire_nova', P3(tgt.x, tgt.z), { radius: rad * 0.7 }); });
    },
  });
  S({
    id: 'mage_doublon', classe: MG, name: 'Doublon d\'incantation', icon: 'sparkles', vfx: 'buff', sfx: 'upgrade', element: 'ombre', scale: 'int', kind: 'active', manaCost: 20, cd: 16, range: 0, radius: 0,
    unlockLevel: 15, spec: 'archimage', tags: ['buff', 'arcane'], branch: 'C', tier: 2, echo: false,
    desc: (L) => 'Spécialisation Archimage. Pendant 6 s, chaque sort coûte 30 % de mana en moins et est relancé une seconde fois à 50 % de puissance.',
    upgrades: [UP(3, 'Durée 7 s.'), UP(5, 'Le sort relancé fait 65 % de puissance.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = L >= 3 ? 7 : 6;
      k.v().doublon = k.time() + dur;
      ctx.buff('doublon', { duration: dur, name: 'Doublon d\'incantation', icon: 'sparkles', vfx: 'buff', color: 0x9d4edd, onEnd: () => { k.v().doublon = 0; } });
      if (L >= 5) k.v().doublonPower = 0.65; else k.v().doublonPower = 0.5;
      fx(api, 'buff', p.pos, { color: 0x9d4edd }); sfx(api, 'upgrade');
    },
  });
  G.SKILL_TREES.Mage = { branches: { A: { name: 'Kit de départ', icon: '🔮', desc: 'Trait, Orbe, Rayon et l\'ultime Cataclysme.' }, B: { name: 'Déblocages', icon: '✨', desc: 'Pas arcanique, Météore, Égide et passifs (niveaux 5 à 25).' }, C: { name: 'Spécialisation', icon: '🔥', desc: 'Pyromancien (Brasier) ou Archimage (Doublon), au niveau 15.' } }, core: { basic: 'mage_trait_arcanique', cast2: 'mage_orbe_braise', cast3: 'mage_rayon', super: 'mage_cataclysme' } };

  // =====================================================================
  // VOLEUR — « Larron des toits » (Lames : stock 0-6 ; lames plantées → Rappel ; marques de lames +4 %/stack)
  // =====================================================================
  const VO = 'Voleur';
  const plant = (ctx, e, n) => { if (alive(e)) ctx.K.addBlades(e, n || 1, 5, 6); };
  const bonusThrow = (ctx) => { const v = ctx.K.v(); if (v.nextThrow && v.nextThrow > ctx.K.time()) { v.nextThrow = 0; return 1.5; } return 1; };
  /** Rappel : toutes les lames plantées reviennent. mult = % P par stack. renvoie le nombre de stacks rendus */
  function recall(api, ctx, L, pctPerStack, o) {
    o = o || {};
    const k = ctx.K, p = pl(api); let total = 0;
    const list = (api.enemies ? api.enemies() : []).filter((e) => alive(e) && k.blades(e) > 0 && dist2(e.pos, p.pos) <= 12);
    for (const e of list) {
      const n = k.blades(e); total += n;
      let pct = pctPerStack * n * (L >= 3 && n > 3 ? 1 + 0.3 * (n - 3) / n : 1);
      hit(api, ctx, e, pct, { kind: 'skill', kb: 0.5, mult: o.mult });
      if (o.slow && !e.dead) st(ctx, api, e, 'slow', 1.5, 0.3);
      if (ctx.perk(10) && o.chain !== false) for (const o2 of inRadius(api, e.pos, 2.5)) if (o2 !== e && !list.includes(o2)) hit(api, ctx, o2, pctPerStack * n * 0.5, { kind: 'aoe', canCrit: false });
      k.clearBlades(e);
      fx(api, 'hit_physique', e.pos, {}); fx(api, 'beam_physique', V(e.pos.x, 1, e.pos.z), { to: V(p.pos.x, 1, p.pos.z), dur: 0.25 });
    }
    if (total && o.refund !== false) ctx.gain('lames', total);
    return total;
  }
  S({
    id: 'voleur_lancer', classe: VO, name: 'Couteau de lancer', icon: 'dagger', vfx: 'hit_physique', sfx: 'throw', element: 'physique', scale: 'force', kind: 'basic', manaCost: 0, cd: 0.35, range: 10, radius: 0.3,
    tags: ['projectile', 'dist'], branch: 'A', tier: 1,
    desc: (L) => 'Lance un couteau (10 m, 80 % de dégâts) pour 1 Lame ; sans Lame, un couteau de fortune à 60 %. Chaque touche plante un stack de lame (+4 % de dégâts subis, 6 s) que le Rappel fera détoner.',
    upgrades: [UP(3, 'Le couteau perce 1 ennemi.'), UP(5, '15 % de chance de lancer un 2e couteau.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx);
      const has = ctx.spend('lames', 1);
      const ghost = ctx.flag('ghost'), n = (ghost ? 2 : 1) + (ctx.perk(5) && Math.random() < 0.2 ? 1 : 0) + (L >= 5 && Math.random() < 0.15 ? 1 : 0);
      const base = (has ? 80 : 60) * (ghost ? 0.8 : 1) * bonusThrow(ctx), pierce = ctx.perk(10) ? 2 : (L >= 3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const dd = n === 1 ? d : rot(d, (i - (n - 1) / 2) * 0.12);
        proj(api, ctx, { dir: dd, pos: V(p.pos.x + dd.x * 0.6, 1, p.pos.z + dd.z * 0.6), speed: 20, range: 10, pct: base, pierce, radius: 0.35, model: 'dagger',
          onHit: (e) => {
            plant(ctx, e, 1);
            if (ctx.flag('venom')) poison(api, ctx, e, 25, 3);
            if (Math.random() < 0.1 && api.giveGold) api.giveGold(rnd(2, 6));
          } });
      }
      const v = k.v(); v.throws = (v.throws || 0) + 1;
      if (L >= 5 && k.lv('voleur_doigts_agiles') >= 5 && v.throws % 8 === 0) ctx.gain('lames', 1);
      sfx(api, 'throw');
    },
  });
  S({
    id: 'voleur_eventail', classe: VO, name: 'Éventail de lames', icon: 'daggers', vfx: 'slash', sfx: 'throw', element: 'physique', kind: 'active', manaCost: 10, cd: 5, range: 9, radius: 0.3,
    tags: ['projectile', 'aoe', 'dist'], branch: 'A', tier: 2,
    desc: (L) => 'Coûte 3 Lames. Projette ' + (L >= 3 ? 7 : 5) + ' lames en cône de 45° (9 m), 70 % de dégâts chacune ; chaque lame plante un stack. Charge le Rappel.',
    upgrades: [UP(3, '7 lames au lieu de 5.'), UP(5, 'Les lames traversent les ennemis.')],
    variants: VAR(['Rafale', 'Cône 70°, +2 lames, dégâts −10 %.'], ['Sniper', 'Cône étroit, +35 % de dégâts, portée 12 m.']),
    cast(api, L, ctx) {
      const p = pl(api), d = dirOf(api, ctx);
      if (!ctx.spend('lames', 3)) { text(api, p.pos, 'Il faut 3 Lames', '#9ad', 0.9); sfx(api, 'error'); return false; }
      const n = (L >= 3 ? 7 : 5) + (ctx.perk(5) ? 2 : 0) + (ctx.v === 'A' ? 2 : 0), arc = (ctx.v === 'A' ? 70 : ctx.v === 'B' ? 15 : 45) * DEG;
      const mult = bonusThrow(ctx) * (ctx.v === 'A' ? 0.9 : ctx.v === 'B' ? 1.35 : 1), range = ctx.v === 'B' ? 12 : 9;
      for (let i = 0; i < n; i++) {
        const dd = rot(d, n === 1 ? 0 : (i / (n - 1) - 0.5) * arc);
        proj(api, ctx, { dir: dd, pos: V(p.pos.x + dd.x * 0.6, 1, p.pos.z + dd.z * 0.6), speed: 19, range, pct: 70 * mult, pierce: L >= 5 ? 9 : 0, radius: 0.35, model: 'dagger', onHit: (e) => plant(ctx, e, 1) });
      }
      fx(api, 'slash', p.pos, { dir: d, arc, radius: 3 }); sfx(api, 'throw'); api.shake && api.shake(0.12);
    },
  });
  S({
    id: 'voleur_rappel', classe: VO, name: 'Rappel des lames', icon: 'dash', vfx: 'trail', sfx: 'swing', element: 'physique', kind: 'active', manaCost: 10, cd: 6, range: 12, radius: 12,
    tags: ['aoe', 'mark'], branch: 'A', tier: 3,
    desc: (L) => 'Toutes les lames plantées à 12 m reviennent : 90 % de dégâts par stack sur chaque cible, +1 Lame rendue par stack ; les stacks sont consommés. Détonateur du kit.',
    upgrades: [UP(3, '+30 % par stack au-delà de 3.'), UP(5, 'Ralentit 30 % pendant 1,5 s.')],
    variants: VAR(['Rappel en tempête', 'Dégâts +25 %, mais ne rend que la moitié des Lames.'], ['Rappel économe', 'Rend 2 Lames par stack, dégâts −15 %.']),
    cast(api, L, ctx) {
      const p = pl(api);
      const n = recall(api, ctx, L, 90, { slow: L >= 5, mult: ctx.v === 'A' ? 1.25 : ctx.v === 'B' ? 0.85 : 1, refund: false });
      if (!n) { text(api, p.pos, 'Aucune lame plantée', '#9ad', 0.9); return false; }
      ctx.gain('lames', n * (ctx.v === 'A' ? 0.5 : ctx.v === 'B' ? 2 : 1));
      fx(api, 'shockwave', p.pos, { radius: 3, color: 0x2a9d8f }); api.shake && api.shake(0.2); sfx(api, 'swing');
      text(api, p.pos, n + ' stack' + (n > 1 ? 's' : ''), '#5fe0d0', 1);
    },
  });
  S({
    id: 'voleur_mille_couteaux', classe: VO, name: 'Ballet des mille couteaux', icon: 'swords', vfx: 'slash', sfx: 'super', element: 'physique', kind: 'ultimate', manaCost: 0, cd: 50, range: 10, radius: 10,
    unlockLevel: 5, tags: ['projectile', 'aoe', 'ultimate', 'mark'], branch: 'A', tier: 4,
    desc: (L) => 'Pendant ' + (5 + (L >= 5 ? 2 : 0)) + ' s vous bougez librement et gardez des Lames illimitées : 3 couteaux toutes les 0,2 s en spirale à 360° (60 %, ils plantent). À la fin, un Rappel automatique ×2 (180 % par stack).',
    upgrades: [UP(3, 'Couteaux +20 %.'), UP(5, '+2 s de durée.')],
    variants: VAR(['Ouragan', '5 couteaux par volée, dégâts −15 %.'], ['Guillotine', 'Rappel final +50 %, pas de couteaux supplémentaires.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = 5 + (L >= 5 ? 2 : 0) + (ctx.perk(5) ? 1 : 0), n = ctx.v === 'A' ? 5 : 3;
      k.v().unlimited = k.time() + dur;
      ctx.buff('ballet', { duration: dur, name: 'Ballet des mille couteaux', icon: 'swords', vfx: 'buff', color: 0x2a9d8f });
      let ang = 0;
      k.loop(dur, 0.2, () => {
        const q = pl(api);
        for (let i = 0; i < n; i++) {
          const a = ang + i * TAU / n, dd = { x: Math.cos(a), z: Math.sin(a) };
          proj(api, ctx, { dir: dd, pos: V(q.pos.x + dd.x * 0.6, 1, q.pos.z + dd.z * 0.6), speed: 17, range: 9, pct: 60 * (L >= 3 ? 1.2 : 1) * (ctx.v === 'A' ? 0.85 : 1), radius: 0.4, model: 'dagger', onHit: (e) => plant(ctx, e, 1) });
        }
        ang += 0.55; fx(api, 'slash', q.pos, { radius: 2.5, arc: TAU, dir: { x: Math.cos(ang), z: Math.sin(ang) } });
      }, () => {
        const q = pl(api);
        recall(api, ctx, L, 180, { mult: (ctx.perk(10) ? 1.4 : 1) * (ctx.v === 'B' ? 1.5 : 1), chain: true });
        fx(api, 'shockwave', q.pos, { radius: 10, color: 0x2a9d8f }); api.shake && api.shake(0.7); api.hitStop && api.hitStop(0.08); sfx(api, 'super');
      });
      fx(api, 'levelup', p.pos, { color: 0x2a9d8f }); sfx(api, 'super'); text(api, p.pos, 'BALLET !', '#5fe0d0', 1.3);
    },
  });
  S({
    id: 'voleur_glissade', classe: VO, name: 'Glissade', icon: 'dash', vfx: 'dash', sfx: 'dash', element: 'physique', kind: 'active', manaCost: 8, cd: 5, range: 5, radius: 1.5,
    unlockLevel: 5, tags: ['dash', 'trap'], branch: 'B', tier: 1,
    desc: (L) => 'Roulade de 5 m (invulnérable 0,3 s) : rend 1 Lame et votre prochain lancer (4 s) inflige +50 %. Votre seule mobilité de départ.',
    upgrades: [UP(5, 'Laisse derrière vous un piège (150 %, 8 s) qui détone au contact.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), ox = p.pos.x, oz = p.pos.z;
      dashTo(api, d, 5, 0.22, 0.3);
      ctx.gain('lames', 1); k.v().nextThrow = k.time() + 4;
      if (L >= 5) k.loop(8, 0.2, () => {
        const c = P3(ox, oz), es = inRadius(api, c, 1.6);
        if (!es.length) return;
        for (const e of inRadius(api, c, 2)) { hit(api, ctx, e, 150, { kind: 'aoe', kb: 2 }); plant(ctx, e, 1); }
        fx(api, 'explosion_physique', c, { radius: 2 }); sfx(api, 'boom'); return false;
      });
      fx(api, 'dash', p.pos, {}); sfx(api, 'dash');
      return { cdMult: 0.8 };
    },
  });
  S({
    id: 'voleur_fumigene', classe: VO, name: 'Bombe fumigène', icon: 'wind', vfx: 'poison_cloud', sfx: 'upgrade', element: 'physique', kind: 'active', manaCost: 14, cd: 11, range: 8, radius: 3.5,
    unlockLevel: 10, tags: ['aoe', 'cc', 'buff'], branch: 'B', tier: 2,
    desc: (L) => 'Nuage de 3,5 m pendant 4 s : ennemis ralentis de 25 %. Vous y êtes furtif (dégâts subis −50 %) et votre prochain lancer inflige +50 %.',
    upgrades: [UP(5, 'Les ennemis dans le nuage sont aveuglés 1 s (peur).')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), c = { x: p.pos.x, z: p.pos.z };
      fx(api, 'poison_cloud', P3(c.x, c.z), { radius: 3.5, dur: 4, color: 0x9aa4ad });
      k.v().nextThrow = k.time() + 6;
      ctx.buff('furtif', { duration: 4, incoming: 0.5, name: 'Furtif', icon: 'wind', vfx: 'buff', color: 0x9aa4ad });
      k.loop(4, 0.5, (i) => { for (const e of inRadius(api, P3(c.x, c.z), 3.5)) { st(ctx, api, e, 'slow', 1, 0.25); if (L >= 5 && i === 1 && !e.elite) st(ctx, api, e, 'fear', 1, 1); } });
      sfx(api, 'upgrade');
    },
  });
  S({
    id: 'voleur_doigts_agiles', classe: VO, name: 'Doigts agiles', icon: 'gold', kind: 'passive', unlockLevel: 15, tags: ['loot'], branch: 'B', tier: 3, element: 'physique',
    desc: () => 'Passif : +20 % de régénération de Lames, +25 % d\'or, +5 % de chance de butin.',
    upgrades: [UP(5, 'Une Lame gratuite tous les 8 lancers.')],
    passive(s) { add(s, 'goldMult', 0.25); add(s, 'lootLuck', 0.05); return s; },
  });
  S({
    id: 'voleur_grappin', classe: VO, name: 'Grappin', icon: 'hook', vfx: 'dash', sfx: 'dash', element: 'physique', kind: 'active', manaCost: 12, cd: 9, range: 9, radius: 1.2,
    unlockLevel: 20, tags: ['dash', 'cc', 'projectile'], branch: 'B', tier: 4,
    charges: (L) => (L >= 5 ? 2 : 1),
    desc: (L) => 'Lance un crochet à 9 m : vous tire vers l\'ennemi, l\'étourdit 0,5 s (120 %) et plante 1 stack. Un petit ennemi est ramené à vous. ' + (L >= 5 ? '2 charges.' : ''),
    upgrades: [UP(5, '2 charges.')],
    cast(api, L, ctx) {
      const p = pl(api), d = dirOf(api, ctx), t = frontTarget(api, p, d, 9, 0.9);
      if (!t) { sfx(api, 'error'); return false; }
      const small = !t.boss && !t.elite && (t.r || 0.5) < 1;
      hit(api, ctx, t, 120, { kind: 'skill', kb: 0 }); st(ctx, api, t, 'stun', 0.5, 1); plant(ctx, t, 1);
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, dd = Math.hypot(dx, dz) || 1, nn = { x: dx / dd, z: dz / dd };
      fx(api, 'beam_physique', V(p.pos.x, 1, p.pos.z), { to: V(t.pos.x, 1, t.pos.z), dur: 0.25 });
      if (small) { t.pos.x = p.pos.x + nn.x * 1.6; t.pos.z = p.pos.z + nn.z * 1.6; if (t.mesh) t.mesh.position.set(t.pos.x, t.mesh.position.y, t.pos.z); }
      else dashTo(api, nn, Math.max(0, dd - 1.5), 0.2, 0.2);
      api.shake && api.shake(0.2); sfx(api, 'dash');
    },
  });
  S({
    id: 'voleur_maitre_voleur', classe: VO, name: 'Maître voleur', icon: 'crown', kind: 'passive', unlockLevel: 25, tags: ['mark'], branch: 'B', tier: 5, element: 'physique',
    desc: () => 'Passif : chaque stack de lame fait subir +6 % de dégâts (au lieu de 4 %, max +30 %). Un ennemi qui meurt avec 5 stacks explose (200 %, rayon 2,5).',
    upgrades: [UP(5, '+1 Lame maximum.')],
    passive(s) { return s; },
  });
  S({
    id: 'voleur_valse', classe: VO, name: 'Valse spectrale', icon: 'swords', vfx: 'trail', sfx: 'swing', element: 'ombre', kind: 'active', manaCost: 16, cd: 14, range: 3, radius: 2.4,
    unlockLevel: 15, spec: 'lame_fantome', tags: ['aoe', 'mark'], branch: 'C', tier: 1,
    desc: (L) => 'Spécialisation Virtuose. 4 s : 3 lames fantômes orbitent autour de vous (60 % toutes les 0,4 s) et plantent des stacks.',
    upgrades: [UP(3, 'Durée 5 s.'), UP(5, '4 lames fantômes.')],
    cast(api, L, ctx) {
      const k = ctx.K, dur = L >= 3 ? 5 : 4, n = L >= 5 ? 4 : 3;
      ctx.buff('valse', { duration: dur, name: 'Valse spectrale', icon: 'swords', vfx: 'buff', color: 0x9d4edd });
      k.loop(dur, 0.4, (i) => {
        const q = pl(api);
        for (let j = 0; j < n; j++) {
          const a = i * 0.9 + j * TAU / n, c = P3(q.pos.x + Math.cos(a) * 2.2, q.pos.z + Math.sin(a) * 2.2);
          for (const e of inRadius(api, c, 1.3)) { hit(api, ctx, e, 60, { kind: 'skill', element: 'ombre' }); plant(ctx, e, 1); }
          fx(api, 'hit_ombre', c, {});
        }
      });
      sfx(api, 'swing');
    },
  });
  S({
    id: 'voleur_pillage', classe: VO, name: 'Pillage', icon: 'gold', vfx: 'aura', sfx: 'upgrade', element: 'physique', kind: 'active', manaCost: 10, cd: 12, range: 12, radius: 2.5,
    unlockLevel: 15, spec: 'larron', tags: ['mark', 'loot'], branch: 'C', tier: 2,
    desc: (L) => 'Spécialisation Larron. Marque une cible 8 s (+20 % de dégâts subis) ; si elle meurt marquée, elle lâche le double d\'or et explose en pièces (150 %).',
    upgrades: [UP(3, 'Marque 10 s.'), UP(5, 'Marque aussi une 2e cible proche.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), t = frontTarget(api, p, d, 12, 1.0);
      if (!t) { sfx(api, 'error'); return false; }
      const mk = (e) => { k.tag(e, 'pillage', L >= 3 ? 10 : 8); fx(api, 'aura', e.pos, { color: 0xffd23a }); };
      mk(t);
      if (L >= 5) { const o = inRadius(api, t.pos, 6).find((e) => e !== t); if (o) mk(o); }
      sfx(api, 'upgrade');
    },
  });
  G.SKILL_TREES.Voleur = { branches: { A: { name: 'Kit de départ', icon: '🗡️', desc: 'Couteau, Éventail, Rappel et l\'ultime Ballet.' }, B: { name: 'Déblocages', icon: '🧤', desc: 'Glissade, fumigène, grappin et passifs.' }, C: { name: 'Spécialisation', icon: '👻', desc: 'Virtuose (Valse) ou Larron (Pillage), au niveau 15.' } }, core: { basic: 'voleur_lancer', cast2: 'voleur_eventail', cast3: 'voleur_rappel', super: 'voleur_mille_couteaux' } };

  // =====================================================================
  // ASSASSIN — « Faucheur de l'ombre » (Combo 0-5 ; dos / marque +50 % ; exécution sous 20 % PV)
  // =====================================================================
  const AS = 'Assassin';
  const venomOn = (ctx) => ctx.flag('venom') || (ctx.K.v().venin || 0) > ctx.K.time();
  const stackVenom = (api, ctx, e, n) => {
    if (!alive(e)) return;
    const k = ctx.K, cur = k.tagged(e, 'pstack') || 0, mul = (k.v().venin || 0) > k.time() ? 2 : 1;
    k.tag(e, 'pstack', 8, Math.min(5, cur + n));
    poison(api, ctx, e, 20 * mul, 4, 1);
  };
  const comboGain = (ctx, e, n) => ctx.gain('combo', n * (e && ctx.K.tagged(e, 'sentence') ? 2 : 1));
  /** place le joueur dans le dos de l'ennemi e (dash fantôme) */
  function blink(api, e, behindDist) {
    const p = pl(api), f = KK() ? KK().facing(e) : { x: 0, z: 1 };
    const tx = e.pos.x - f.x * (behindDist || 1.4), tz = e.pos.z - f.z * (behindDist || 1.4);
    const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.2) dashTo(api, { x: dx / d, z: dz / d }, d, 0.1, 0.4, { phase: true });
    return { x: tx, z: tz };
  }
  S({
    id: 'assassin_entaille', classe: AS, name: 'Entaille', icon: 'dagger', vfx: 'slash_ombre', sfx: 'swing', element: 'ombre', kind: 'basic', manaCost: 0, cd: 0.3, range: 2.2, radius: 0,
    combo: { steps: 3, window: 0.8 }, tags: ['melee', 'combo'], branch: 'A', tier: 1,
    desc: (L) => 'Combo de 3 coups (2,2 m, arc 100°) : 60 % / 60 % / 110 % de dégâts. +1 Combo par coup porté dans le dos et +1 au 3e coup ; chaque point de Combo donne +6 % de dégâts de base.',
    upgrades: [UP(3, 'Le 3e coup saigne (15 %/s, 3 s).'), UP(5, 'Recharge 0,25 s.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), step = ctx.comboStep, last = step === (ctx.perk(10) ? 3 : 2) || step === 2;
      const pct = [60, 60, 110, 110][step] || 60;
      let n = 0, back = false;
      for (const e of cone(api, p, d, 2.2, 100 * DEG)) {
        hit(api, ctx, e, pct, { kind: 'melee', kb: last ? 1.5 : 0.3, tags: ['basic'] });
        if (!back && k.behind(e, p.pos)) { back = true; comboGain(ctx, e, 1); }
        if (last && L >= 3) k.loop(3, 1, () => { if (alive(e)) hit(api, ctx, e, 15, { kind: 'dot', canCrit: false, noCharge: true }); });
        if (venomOn(ctx)) stackVenom(api, ctx, e, 1);
        n++;
      }
      if (n && last) ctx.gain('combo', 1);
      fx(api, 'slash_ombre', p.pos, { dir: d, radius: 2.2, arc: 100 * DEG }); sfx(api, 'swing');
      if (n) { api.hitStop && api.hitStop(last ? 0.05 : 0.025); api.shake && api.shake(last ? 0.2 : 0.08); }
      return L >= 5 ? { cdMult: 0.83 } : undefined;
    },
  });
  G.SKILLS.assassin_entaille.comboSteps = (L, fg) => (fg && fg.L >= 10 ? 4 : 3);
  S({
    id: 'assassin_pas_ombre', classe: AS, name: 'Pas de l\'ombre', icon: 'shadow', vfx: 'teleport', sfx: 'dash', element: 'ombre', kind: 'active', manaCost: 14, cd: 6, range: 9, radius: 1.5,
    tags: ['dash', 'melee'], branch: 'A', tier: 2,
    desc: (L) => 'Disparaît et réapparaît dans le dos de l\'ennemi le plus proche (9 m) : 150 % de dégâts, invulnérable 0,4 s, +1 Combo. Chaque kill réduit sa recharge de 1 s.',
    upgrades: [UP(3, 'Chaque kill : −1 s de recharge.'), UP(5, 'Un 2e saut gratuit dans les 3 s.')],
    variants: VAR(['Pas fantôme', 'Dégâts +40 % et +1 Combo en plus.'], ['Pas fugace', 'Recharge −25 %, invulnérable 0,7 s.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx);
      let t = frontTarget(api, p, d, 9, 2.2) || nearest(api, p.pos, 9);
      if (!alive(t)) { sfx(api, 'error'); return false; }
      fx(api, 'teleport', p.pos, { color: 0xe63946 });
      const spot = blink(api, t, 1.4);
      k.after(0.12, () => {
        if (alive(t)) { hit(api, ctx, t, 150 * (ctx.v === 'A' ? 1.4 : 1), { kind: 'melee', kb: 1 }); comboGain(ctx, t, 1 + (ctx.v === 'A' ? 1 : 0)); }
        fx(api, 'slash_ombre', spot, { radius: 2 }); fx(api, 'teleport', spot, { color: 0xe63946 }); api.shake && api.shake(0.18);
      });
      sfx(api, 'dash');
      const v = k.v();
      if (L >= 5 && !(v.pasFree && v.pasFree > k.time())) { v.pasFree = k.time() + 3; return { noCd: true }; }
      v.pasFree = 0;
      return { cdMult: ctx.v === 'B' ? 0.75 : 1, cdAdd: ctx.perk(5) ? -1 : 0 };
    },
  });
  S({
    id: 'assassin_execution', classe: AS, name: 'Exécution', icon: 'skull', vfx: 'crit_ombre', sfx: 'hit', element: 'ombre', kind: 'active', manaCost: 10, cd: 5, range: 2.4, radius: 0,
    tags: ['melee', 'execute'], branch: 'A', tier: 3,
    desc: (L) => 'Frappe fatale (2,4 m) : 120 % + 90 % par point de Combo (consomme tout) ; dégâts ×2 si la cible est sous 25 % de PV.',
    upgrades: [UP(3, 'Un kill rend 4 mana.'), UP(5, 'Avec 4 Combo ou plus, 50 % de la recharge est remboursée.')],
    variants: VAR(['Coup du bourreau', 'Dégâts de Combo +30 %, recharge +2 s.'], ['Coup rapide', 'Ne consomme que la moitié du Combo, dégâts −15 %.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), t = frontTarget(api, p, d, 2.4, 1.2);
      if (!alive(t) || dist2(t.pos, p.pos) > 3.2) { sfx(api, 'error'); return false; }
      const c = Math.floor(ctx.res('combo') + 1e-6), keep = ctx.perk(10) ? 1 : 0;
      let pct = 120 + 90 * c * (ctx.v === 'A' ? 1.3 : 1);
      const low = t.pvMax > 0 ? t.pv / t.pvMax : 1;
      if (low < 0.25) pct *= 2; else if (L >= 5 && k.lv('assassin_faucheur') >= 5 && low < 0.3) pct *= 1.5;
      if ((k.tagged(t, 'pstack') || 0) > 0 && ((k.v().venin || 0) > k.time() || ctx.flag('venom'))) { pct *= 1 + 0.4 * k.tagged(t, 'pstack'); k.untag(t, 'pstack'); }
      hit(api, ctx, t, pct * (ctx.v === 'B' ? 0.85 : 1), { kind: 'melee', kb: 3, crit: low < 0.25 });
      ctx.spend('combo', ctx.v === 'B' ? Math.ceil(c / 2) : Math.max(0, c - keep));
      if (t.dead && L >= 3 && api.restoreMana) api.restoreMana(4);
      fx(api, 'crit_ombre', t.pos, {}); fx(api, 'slash_ombre', t.pos, { radius: 2.4 }); api.shake && api.shake(0.45); api.hitStop && api.hitStop(0.08); sfx(api, 'hit');
      return { cdMult: L >= 5 && c >= 4 ? 0.5 : 1, cdAdd: ctx.v === 'A' ? 2 : 0 };
    },
  });
  S({
    id: 'assassin_danse_ombres', classe: AS, name: 'Danse des ombres', icon: 'ghost', vfx: 'teleport', sfx: 'super', element: 'ombre', kind: 'ultimate', manaCost: 0, cd: 50, range: 14, radius: 14,
    unlockLevel: 5, tags: ['dash', 'melee', 'ultimate', 'execute'], branch: 'A', tier: 4,
    desc: (L) => 'Invulnérable 3 s : bondit dans le dos de ' + (L >= 5 ? 7 : 5) + ' cibles (220 % chacune, +10 % par point de Combo) et termine par une Exécution gratuite sur la dernière.',
    upgrades: [UP(3, 'Dégâts de saut +20 %.'), UP(5, '7 cibles.')],
    variants: VAR(['Danse macabre', 'Invulnérable 4 s, +2 cibles, dégâts −10 %.'], ['Danse sanglante', 'Dégâts de saut +30 %, l\'exécution finale ×1,5.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), c = Math.floor(ctx.res('combo') + 1e-6);
      const nmax = (L >= 5 ? 7 : 5) + (ctx.perk(5) ? 1 : 0) + (ctx.v === 'A' ? 2 : 0);
      const list = (api.enemies ? api.enemies() : []).filter((e) => alive(e) && !e.untargetable && dist2(e.pos, p.pos) <= 14).sort((a, b) => dist2(a.pos, p.pos) - dist2(b.pos, p.pos));
      if (!list.length) { sfx(api, 'error'); return false; }
      const targets = list.slice(0, nmax), dur = 3 + (ctx.perk(10) ? 1 : 0) + (ctx.v === 'A' ? 1 : 0);
      ctx.buff('danse_ombres', { duration: dur, invuln: true, name: 'Danse des ombres', icon: 'ghost', vfx: 'buff', color: 0xe63946 });
      const gap = Math.min(0.5, (dur - 0.6) / targets.length);
      targets.forEach((t, i) => k.after(0.1 + i * gap, () => {
        if (!alive(t)) return;
        const spot = blink(api, t, 1.2);
        k.after(0.1, () => {
          if (!alive(t)) return;
          hit(api, ctx, t, 220 * (1 + 0.1 * c) * (L >= 3 ? 1.2 : 1) * (ctx.v === 'A' ? 0.9 : ctx.v === 'B' ? 1.3 : 1), { kind: 'melee', kb: 1.5 });
          fx(api, 'slash_ombre', spot, { radius: 2.2 }); fx(api, 'teleport', spot, { color: 0xe63946 }); api.shake && api.shake(0.25); sfx(api, 'hit');
        });
      }));
      const last = targets[targets.length - 1];
      k.after(0.1 + targets.length * gap + 0.25, () => {
        const tt = alive(last) ? last : nearest(api, pl(api).pos, 4);
        if (tt) { hit(api, ctx, tt, (120 + 90 * c) * (tt.pvMax && tt.pv / tt.pvMax < 0.25 ? 2 : 1) * (ctx.v === 'B' ? 1.5 : 1), { kind: 'melee', kb: 4, crit: true }); fx(api, 'crit_ombre', tt.pos, {}); }
        api.shake && api.shake(0.9); api.hitStop && api.hitStop(0.12); sfx(api, 'super');
      });
      fx(api, 'teleport', p.pos, { color: 0xe63946 }); text(api, p.pos, 'DANSE DES OMBRES', '#ff5a6a', 1.3);
    },
  });
  S({
    id: 'assassin_sentence', classe: AS, name: 'Sentence', icon: 'target', vfx: 'aura', sfx: 'upgrade', element: 'ombre', kind: 'active', manaCost: 12, cd: 10, range: 12, radius: 0,
    unlockLevel: 5, tags: ['mark'], branch: 'B', tier: 1,
    desc: (L) => 'Condamne une cible 8 s : +12 % de vos dégâts et +50 % de dégâts « marque » (comme dans le dos) ; vos gains de Combo contre elle sont doublés. Sa mort rend 50 % de la recharge du Pas.',
    upgrades: [UP(5, 'Marque aussi la cible la plus proche de la première.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), t = frontTarget(api, p, d, 12, 1.0);
      if (!alive(t)) { sfx(api, 'error'); return false; }
      const mk = (e) => { ctx.mark(e, 1.12, 8); k.tag(e, 'sentence', 8, 1); api.status(e, { id: 'mark', duration: 8, power: 0.1 }); fx(api, 'aura', e.pos, { color: 0xe63946 }); };
      mk(t);
      if (L >= 5) { const o = inRadius(api, t.pos, 7).find((e) => e !== t); if (o) mk(o); }
      comboGain(ctx, t, 0); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'assassin_voile', classe: AS, name: 'Voile de nuit', icon: 'eye', vfx: 'aura', sfx: 'upgrade', element: 'ombre', kind: 'active', manaCost: 14, cd: 14, range: 0, radius: 0,
    unlockLevel: 10, tags: ['buff'], branch: 'B', tier: 2,
    desc: (L) => 'Furtivité ' + (L >= 5 ? 4 : 3) + ' s : dégâts subis −70 %, vitesse +20 %. Votre première attaque sortie du Voile inflige +100 % et donne +2 Combo.',
    upgrades: [UP(5, 'Dure 4 s.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = L >= 5 ? 4 : 3;
      k.v().voile = k.time() + dur;
      ctx.buff('voile', { duration: dur, incoming: 0.3, mul: { vitesse: 1.2 }, name: 'Voile de nuit', icon: 'eye', vfx: 'buff', color: 0x333344, onEnd: () => { k.v().voile = 0; } });
      fx(api, 'aura', p.pos, { color: 0x222233 }); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'assassin_instinct', classe: AS, name: 'Instinct du tueur', icon: 'target2', kind: 'passive', unlockLevel: 15, tags: ['crit'], branch: 'B', tier: 3, element: 'ombre',
    desc: () => 'Passif : +8 % de critique, +20 % de dégâts critiques ; le Combo décroît 2× plus lentement (12 s sans toucher).',
    upgrades: [UP(5, 'Un critique dans le dos rend 1 Combo.')],
    passive(s) { add(s, 'crit', 0.08); add(s, 'critDmg', 0.2); return s; },
  });
  S({
    id: 'assassin_leurre', classe: AS, name: 'Leurre d\'ombre', icon: 'ghost', vfx: 'shadow_flames', sfx: 'upgrade', element: 'ombre', kind: 'active', manaCost: 12, cd: 12, range: 0, radius: 3,
    unlockLevel: 20, tags: ['aoe', 'cc', 'buff'], branch: 'B', tier: 4,
    desc: (L) => 'Un clone d\'ombre reste 4 s et attire les ennemis (rayon 4 m, ralentis 30 %) puis explose : 250 % (rayon 3, ralentit). Vous êtes furtif 1,5 s.',
    upgrades: [UP(5, 'Le clone attaque (60 %/s).')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), c = { x: p.pos.x, z: p.pos.z };
      ctx.buff('furtif_leurre', { duration: 1.5, incoming: 0.4, name: 'Furtif', icon: 'ghost', vfx: 'buff', color: 0x333344 });
      fx(api, 'shadow_flames', P3(c.x, c.z), { radius: 1.2, dur: 4 });
      k.loop(4, 0.5, () => {
        for (const e of inRadius(api, P3(c.x, c.z), 4)) st(ctx, api, e, 'slow', 1, 0.3);
        if (L >= 5) { const e = nearest(api, P3(c.x, c.z), 2.6); if (e) hit(api, ctx, e, 30, { kind: 'melee', canCrit: false }); }
      }, () => {
        for (const e of inRadius(api, P3(c.x, c.z), 3)) { hit(api, ctx, e, 250, { kind: 'aoe', kb: 3 }); st(ctx, api, e, 'slow', 2, 0.4); }
        fx(api, 'explosion_ombre', P3(c.x, c.z), { radius: 3 }); api.shake && api.shake(0.4); sfx(api, 'boom');
      });
      sfx(api, 'upgrade');
    },
  });
  S({
    id: 'assassin_faucheur', classe: AS, name: 'Faucheur', icon: 'skull', kind: 'passive', unlockLevel: 25, tags: ['execute'], branch: 'B', tier: 5, element: 'ombre',
    desc: () => 'Passif : le seuil d\'exécution passe de 20 % à 30 % ; tuer rend 8 % de mana et réduit le Pas de l\'ombre de 1 s.',
    upgrades: [UP(5, 'L\'Exécution inflige +50 % sous 30 % de PV.')],
    passive(s) { return s; },
  });
  S({
    id: 'assassin_double', classe: AS, name: 'Double d\'ombre', icon: 'users', vfx: 'summon', sfx: 'upgrade', element: 'ombre', kind: 'active', manaCost: 16, cd: 16, range: 0, radius: 6,
    unlockLevel: 15, spec: 'ombre', tags: ['summon', 'mark'], branch: 'C', tier: 1,
    desc: (L) => 'Spécialisation Ombre. Un double combat 6 s à vos côtés : il copie votre attaque de base à 60 % (rayon 2,6 m) et profite de vos marques.',
    upgrades: [UP(3, 'Dure 8 s.'), UP(5, 'Frappe aussi l\'ennemi le plus éloigné marqué.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = L >= 3 ? 8 : 6;
      fx(api, 'summon', p.pos, { color: 0x222233 }); ctx.buff('double', { duration: dur, name: 'Double d\'ombre', icon: 'users', vfx: 'buff', color: 0x222233 });
      k.loop(dur, 0.5, () => {
        const q = pl(api);
        const e = nearest(api, q.pos, 5);
        if (e) { hit(api, ctx, e, 36, { kind: 'melee', kb: 0.3 }); fx(api, 'slash_ombre', e.pos, { radius: 1.6 }); }
        if (L >= 5) { const m = (api.enemies ? api.enemies() : []).find((x) => alive(x) && k.tagged(x, 'sentence')); if (m) hit(api, ctx, m, 30, { kind: 'melee', canCrit: false }); }
      });
      sfx(api, 'upgrade');
    },
  });
  S({
    id: 'assassin_lames_venin', classe: AS, name: 'Lames de venin', icon: 'poison', vfx: 'poison_cloud', sfx: 'upgrade', element: 'poison', kind: 'active', manaCost: 12, cd: 14, range: 0, radius: 0,
    unlockLevel: 15, spec: 'venimeux', tags: ['buff', 'dot'], branch: 'C', tier: 2,
    desc: (L) => 'Spécialisation Venimeux. 8 s : vos coups appliquent un poison ×2 (jusqu\'à 5 stacks) et l\'Exécution fait exploser les stacks (+40 % par stack).',
    upgrades: [UP(3, 'Dure 10 s.'), UP(5, 'Les ennemis empoisonnés sont ralentis de 15 %.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = L >= 3 ? 10 : 8;
      k.v().venin = k.time() + dur;
      ctx.buff('venin', { duration: dur, name: 'Lames de venin', icon: 'poison', vfx: 'buff', color: 0x55cc44, onEnd: () => { k.v().venin = 0; } });
      if (L >= 5) k.loop(dur, 1, () => { for (const e of (api.enemies ? api.enemies() : [])) if (alive(e) && k.tagged(e, 'pstack') && dist2(e.pos, pl(api).pos) < 14) st(ctx, api, e, 'slow', 1.2, 0.15); });
      fx(api, 'poison_cloud', p.pos, { radius: 2, color: 0x55cc44 }); sfx(api, 'upgrade');
    },
  });
  G.SKILL_TREES.Assassin = { branches: { A: { name: 'Kit de départ', icon: '🗡️', desc: 'Entaille, Pas de l\'ombre, Exécution et l\'ultime Danse des ombres.' }, B: { name: 'Déblocages', icon: '🌑', desc: 'Sentence, Voile, Leurre et passifs.' }, C: { name: 'Spécialisation', icon: '☠️', desc: 'Ombre (Double) ou Venimeux (Lames de venin), au niveau 15.' } }, core: { basic: 'assassin_entaille', cast2: 'assassin_pas_ombre', cast3: 'assassin_execution', super: 'assassin_danse_ombres' } };

  // =====================================================================
  // ARCHER — « Garde-forêt » (Concentration 0-100 ; Distance +25 % ; pièges → Pluie +30 % sur ralentis)
  // =====================================================================
  const AR = 'Archer';
  const aigle = (k) => k.lv('archer_oeil_aigle') >= 1;
  const markHunt = (ctx, e, dur, m) => { if (alive(e)) { ctx.mark(e, m, dur); } };
  S({
    id: 'archer_tir', classe: AR, name: 'Tir tendu', icon: 'bow', vfx: 'hit_physique', sfx: 'throw', element: 'physique', kind: 'basic', manaCost: 0, cd: 0.45, range: 18, radius: 0.3,
    charge: { maxTime: 0.9, minMult: 1.1, maxMult: 2.4 }, tags: ['projectile', 'dist', 'charge'], branch: 'A', tier: 1,
    desc: (L) => 'Maintenir pour bander l\'arc (0,9 s) : 110 % → 240 % de dégâts, portée 18 m. Relâché tôt : 110 %. +8 Concentration par touche. À 100 de Concentration (Visée parfaite) le tir est un critique garanti à +50 %.',
    upgrades: [UP(3, 'La charge pleine perce 1 ennemi.'), UP(5, '+1 flèche à 100 de Concentration.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), full = ctx.charge >= 0.98;
      const conc0 = k.res.get('conc'), perfect = conc0 >= 99.5;
      if (perfect) { k.res.set('conc', 0); k.v().perfect = false; }
      const pierce = ctx.flag('sniper') && full ? 9 : full && ctx.perk(10) ? 2 : ((full && L >= 3) || (conc0 >= 50 && k.lv('archer_maitre_chasseur') >= 1)) ? 1 : 0;
      const n = perfect && L >= 5 ? 2 : 1, rng = 18 + (aigle(k) ? 4 : 0);
      for (let i = 0; i < n; i++) {
        const dd = n === 1 ? d : rot(d, (i ? 1 : -1) * 0.07);
        proj(api, ctx, { dir: dd, pos: V(p.pos.x + dd.x * 0.7, 1, p.pos.z + dd.z * 0.7), speed: 26, range: rng, pct: 100 * (perfect ? 1.5 : 1), pierce, radius: 0.35, model: 'arrow', crit: perfect || (full && Math.random() < 0.15) || undefined,
          onHit: (e) => { ctx.gain('conc', 8); if (full && k.lv('archer_oeil_aigle') >= 5) markHunt(ctx, e, 3, 1.1); } });
      }
      k.v().lastShot = k.time();
      fx(api, 'hit_physique', V(p.pos.x + d.x, 1, p.pos.z + d.z), { dir: d }); sfx(api, 'throw');
      if (perfect) { text(api, p.pos, 'VISÉE PARFAITE', '#9bf08a', 1.1); api.shake && api.shake(0.2); }
    },
  });
  S({
    id: 'archer_piege', classe: AR, name: 'Piège à pointes', icon: 'target', vfx: 'ice_spikes', sfx: 'upgrade', element: 'physique', kind: 'active', manaCost: 10, cd: 6, range: 8, radius: 1.8,
    charges: (L, K) => 2 + (K && K.forgeLv('dague') >= 5 ? 1 : 0) + (K && K.lv('archer_maitre_chasseur') >= 5 ? 1 : 0),
    tags: ['trap', 'aoe', 'cc'], branch: 'A', tier: 2,
    desc: (L) => 'Pose un piège (armé en 0,5 s, 20 s, rayon ' + (L >= 3 ? 2.4 : 1.8) + ' m) : 130 % de dégâts et ralentit 70 % pendant 3 s. 2 charges. Les ralentis subissent +30 % de la Pluie de flèches.',
    upgrades: [UP(3, 'Rayon 2,4 m.'), UP(5, 'Pose 3 pièges en triangle.')],
    variants: VAR(['Piège à ours', 'Étourdit 1 s au lieu de ralentir, dégâts +20 %.'], ['Piège incendiaire', 'Brûle 4 s (40 %/s), rayon +0,4 m.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), base = { x: p.pos.x + d.x * 2.5, z: p.pos.z + d.z * 2.5 };
      const r = (L >= 3 ? 2.4 : 1.8) + (ctx.v === 'B' ? 0.4 : 0), mk = k.lv('archer_maitre_chasseur') >= 1 ? 1.25 : 1;
      const spots = L >= 5 ? [0, 1, 2].map((i) => { const a = i * TAU / 3 + Math.atan2(d.z, d.x); return { x: base.x + Math.cos(a) * 1.6, z: base.z + Math.sin(a) * 1.6 }; }) : [base];
      for (const s of spots) {
        const c = P3(s.x, s.z), t0 = k.time();
        fx(api, 'ice_spikes', c, { radius: r * 0.6, color: 0x8a5a2b, dur: 0.5 });
        k.loop(20, 0.2, () => {
          if (k.time() - t0 < 0.5) return;
          const es = inRadius(api, c, r);
          if (!es.length) return;
          for (const e of es) {
            hit(api, ctx, e, 130 * mk * (ctx.v === 'A' ? 1.2 : 1), { kind: 'aoe', kb: 1.5 });
            if (ctx.v === 'A') st(ctx, api, e, 'stun', 1, 1); else st(ctx, api, e, 'slow', 3, 0.7);
            if (ctx.v === 'B') burn(api, ctx, e, 40, 4);
          }
          fx(api, 'explosion_physique', c, { radius: r }); fx(api, 'ice_spikes', c, { radius: r, color: 0x8a5a2b }); api.shake && api.shake(0.2); sfx(api, 'boom');
          if (k.lv('archer_maitre_chasseur') >= 1) k.cdCut('archer_pluie', 1.5);
          return false;
        });
      }
      k.v().lastShot = k.time(); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'archer_pluie', classe: AR, name: 'Pluie de flèches', icon: 'bow', vfx: 'aoe_physique', sfx: 'throw', element: 'physique', kind: 'active', manaCost: 18, cd: 8, range: 12, radius: 3.5,
    tags: ['aoe', 'dist'], branch: 'A', tier: 3,
    desc: (L) => 'Zone de 3,5 m à 12 m : ' + (L >= 3 ? 8 : 6) + ' salves de 55 % en 2 s ; +30 % de dégâts sur les ennemis ralentis (Piège puis Pluie).',
    upgrades: [UP(3, '8 salves.'), UP(5, 'Le sol reste détrempé : ralentit 30 % pendant 3 s.')],
    variants: VAR(['Déluge', 'Rayon 4,5 m, dégâts −15 %.'], ['Averse précise', 'Dégâts +30 %, rayon 2,8 m.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), tgt = aimPoint(api, p, d, 12, 10);
      const r = (3.5 + (ctx.perk(10) ? 0.8 : 0)) * (ctx.v === 'A' ? 1.3 : ctx.v === 'B' ? 0.8 : 1), n = (L >= 3 ? 8 : 6) + (ctx.perk(10) ? 2 : 0), c = P3(tgt.x, tgt.z);
      const m = ctx.v === 'A' ? 0.85 : ctx.v === 'B' ? 1.3 : 1;
      fx(api, 'aoe_physique', c, { radius: r, dur: 2 });
      k.loop(2, 2 / n, () => {
        for (const e of inRadius(api, c, r)) hit(api, ctx, e, 55 * m * (k.hasStatus(e, 'slow') ? 1.3 : 1), { kind: 'aoe', canCrit: true });
        fx(api, 'hit_physique', P3(c.x + (Math.random() - 0.5) * r, c.z + (Math.random() - 0.5) * r), {}); sfx(api, 'throw');
      }, () => { if (L >= 5) k.loop(3, 0.5, () => { for (const e of inRadius(api, c, r)) st(ctx, api, e, 'slow', 0.8, 0.3); }); });
      k.v().lastShot = k.time();
    },
  });
  S({
    id: 'archer_etoile_filante', classe: AR, name: 'Étoile filante', icon: 'target2', vfx: 'beam_physique', sfx: 'super', element: 'physique', kind: 'ultimate', manaCost: 0, cd: 55, range: 26, radius: 1,
    unlockLevel: 5, tags: ['projectile', 'dist', 'ultimate', 'mark'], branch: 'A', tier: 4,
    desc: (L) => 'Visée 1 s (immobile) puis tir perforant de 26 m : 600 % à tous les ennemis alignés et marque (+25 % de dégâts 6 s). La Concentration au lancement ajoute +1 % par point.' + (L >= 5 ? ' Deux tirs.' : ''),
    upgrades: [UP(3, 'Dégâts +20 %.'), UP(5, 'Deux tirs successifs.')],
    variants: VAR(['Comète', 'Largeur ×2, dégâts −20 %.'], ['Aiguille', 'Dégâts +40 %, visée 0,3 s plus longue.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), conc = k.res.get('conc'), aim = 1 - (ctx.perk(5) ? 0.3 : 0) + (ctx.v === 'B' ? 0.3 : 0), n = L >= 5 ? 2 : 1;
      selfSlow(ctx, 0.0, aim, 'visee_etoile'); k.v().channel = k.time() + aim;
      ctx.buff('visee', { duration: aim, name: 'Visée', icon: 'target2', vfx: 'buff', color: 0x9bf08a });
      fx(api, 'summon', p.pos, { color: 0x9bf08a, rise: false });
      for (let i = 0; i < n; i++) k.after(aim + i * 0.3, () => {
        const q = pl(api), t = frontTarget(api, q, d, 26, 0.4);
        let dd = d; if (t) { const a = nd({ x: t.pos.x - q.pos.x, z: t.pos.z - q.pos.z }); if (a.x * d.x + a.z * d.z > 0.9) dd = a; }
        const w = ctx.v === 'A' ? 2 : 1;
        for (const e of lineEnemies(api, q.pos, dd, 26, w)) {
          hit(api, ctx, e, 600 * (1 + conc / 100) * (L >= 3 ? 1.2 : 1) * (ctx.v === 'A' ? 0.8 : ctx.v === 'B' ? 1.4 : 1), { kind: 'skill', kb: 4, tags: ['dist'] });
          markHunt(ctx, e, 6, 1.25 + (ctx.perk(10) ? 0.1 : 0));
        }
        fx(api, 'beam_physique', V(q.pos.x, 1, q.pos.z), { to: V(q.pos.x + dd.x * 26, 1, q.pos.z + dd.z * 26), dur: 0.5 }); api.shake && api.shake(0.7); api.hitStop && api.hitStop(0.08); sfx(api, 'super');
        if (i === n - 1) k.res.set('conc', 0);
      });
      k.v().lastShot = k.time(); text(api, p.pos, 'ÉTOILE FILANTE', '#9bf08a', 1.3);
    },
  });
  S({
    id: 'archer_saut_arriere', classe: AR, name: 'Saut arrière', icon: 'dash', vfx: 'dash', sfx: 'dash', element: 'physique', kind: 'active', manaCost: 8, cd: 5, range: 6, radius: 2,
    unlockLevel: 5, tags: ['dash', 'projectile', 'dist'], branch: 'B', tier: 1,
    desc: (L) => 'Saute de 6 m à l\'opposé de votre visée (invulnérable 0,2 s) et décoche un tir de 100 % ; +8 Concentration si touché.',
    upgrades: [UP(5, 'Ralentit de 40 % les ennemis à moins de 2 m avant le saut.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx);
      if (L >= 5) for (const e of inRadius(api, p.pos, 2)) st(ctx, api, e, 'slow', 2, 0.4);
      dashTo(api, { x: -d.x, z: -d.z }, 6, 0.2, 0.2);
      k.after(0.15, () => { const q = pl(api); proj(api, ctx, { dir: d, pos: V(q.pos.x + d.x * 0.7, 1, q.pos.z + d.z * 0.7), speed: 26, range: 16, pct: 100, radius: 0.4, model: 'arrow', onHit: () => ctx.gain('conc', 8) }); });
      k.v().lastShot = k.time(); fx(api, 'dash', p.pos, {}); sfx(api, 'dash');
    },
  });
  S({
    id: 'archer_tir_choc', classe: AR, name: 'Flèche de choc', icon: 'bolt', vfx: 'shockwave', sfx: 'slam', element: 'physique', kind: 'active', manaCost: 12, cd: 8, range: 5.5, radius: 5.5,
    unlockLevel: 10, tags: ['aoe', 'cc'], branch: 'B', tier: 2,
    desc: (L) => 'Décharge à bout portant (cône 90°, 5,5 m) : ' + (L >= 5 ? 200 : 140) + ' % de dégâts, recul violent, étourdit 0,4 s (boss : ralentis). Pour se dégager, puis la Pluie.',
    upgrades: [UP(5, '200 % de dégâts.')],
    cast(api, L, ctx) {
      const p = pl(api), d = dirOf(api, ctx);
      for (const e of cone(api, p, d, 5.5, 90 * DEG)) { hit(api, ctx, e, L >= 5 ? 200 : 140, { kind: 'aoe', kb: 8 }); st(ctx, api, e, 'stun', 0.4, 1); }
      fx(api, 'shockwave', p.pos, { radius: 4 }); api.shake && api.shake(0.4); api.hitStop && api.hitStop(0.05); sfx(api, 'slam');
      ctx.K.v().lastShot = ctx.K.time();
    },
  });
  S({
    id: 'archer_oeil_aigle', classe: AR, name: 'Œil de l\'aigle', icon: 'eye', kind: 'passive', unlockLevel: 15, tags: ['crit'], branch: 'B', tier: 3, element: 'physique',
    desc: () => 'Passif : +4 m de portée du Tir tendu, +8 % de critique, la Concentration monte 30 % plus vite.',
    upgrades: [UP(5, 'Un tir pleinement chargé marque la cible 3 s (+10 %).')],
    passive(s) { add(s, 'crit', 0.08); return s; },
  });
  S({
    id: 'archer_carreau', classe: AR, name: 'Carreau explosif', icon: 'fire', vfx: 'explosion_feu', sfx: 'fire', element: 'feu', kind: 'active', manaCost: 16, cd: 8, range: 16, radius: 3,
    unlockLevel: 20, tags: ['projectile', 'aoe', 'dist', 'dot'], branch: 'B', tier: 4,
    desc: (L) => 'Flèche explosive (16 m) : 300 % de dégâts en rayon 3 m et brûlure 3 s. ' + (L >= 5 ? 'Se fragmente en 3 mini-explosions (60 %).' : ''),
    upgrades: [UP(5, 'Se fragmente en 3 mini-explosions.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx);
      proj(api, ctx, { dir: d, pos: V(p.pos.x + d.x * 0.7, 1, p.pos.z + d.z * 0.7), speed: 20, range: 16, pct: 0, radius: 0.4, model: 'arrow', element: 'feu', tags: ['dist'],
        onEnd: (pos) => {
          if (!pos) return;
          for (const e of inRadius(api, pos, 3)) { hit(api, ctx, e, 300, { kind: 'aoe', kb: 2, tags: ['dist'] }); burn(api, ctx, e, 40, 3); }
          fx(api, 'explosion_feu', pos, { radius: 3 }); api.shake && api.shake(0.4); sfx(api, 'boom');
          if (L >= 5) for (let i = 0; i < 3; i++) k.after(0.25 * (i + 1), () => {
            const a = Math.random() * TAU, c = P3(pos.x + Math.cos(a) * 2, pos.z + Math.sin(a) * 2);
            for (const e of inRadius(api, c, 1.5)) hit(api, ctx, e, 60, { kind: 'aoe', canCrit: false });
            fx(api, 'explosion_feu', c, { radius: 1.5 });
          });
        } });
      k.v().lastShot = k.time(); sfx(api, 'fire');
    },
  });
  S({
    id: 'archer_maitre_chasseur', classe: AR, name: 'Maître chasseur', icon: 'compass', kind: 'passive', unlockLevel: 25, tags: ['trap'], branch: 'B', tier: 5, element: 'physique',
    desc: () => 'Passif : pièges +25 % de dégâts ; chaque piège déclenché réduit la recharge de la Pluie de 1,5 s ; à 50 de Concentration ou plus, le Tir tendu perce 1 ennemi.',
    upgrades: [UP(5, '+1 charge de piège.')],
    passive(s) { return s; },
  });
  S({
    id: 'archer_tir_precis', classe: AR, name: 'Tir de précision', icon: 'target', vfx: 'beam_physique', sfx: 'super', element: 'physique', kind: 'active', manaCost: 16, cd: 9, range: 30, radius: 0.4,
    unlockLevel: 15, spec: 'tireur_elite', tags: ['projectile', 'dist'], branch: 'C', tier: 1,
    desc: (L) => 'Spécialisation Tireur d\'élite. Visée 1 s puis tir de 30 m : 500 % de dégâts, critique garanti, +30 % si la Concentration est d\'au moins 50.',
    upgrades: [UP(3, 'Visée 0,7 s.'), UP(5, 'Perce 2 ennemis.')],
    cast(api, L, ctx) {
      const k = ctx.K, d = dirOf(api, ctx), aim = L >= 3 ? 0.7 : 1, conc = k.res.get('conc');
      selfSlow(ctx, 0.0, aim, 'visee_precis'); k.v().channel = k.time() + aim;
      k.after(aim, () => { const q = pl(api); proj(api, ctx, { dir: d, pos: V(q.pos.x + d.x * 0.7, 1, q.pos.z + d.z * 0.7), speed: 40, range: 30, pct: 500 * (conc >= 50 ? 1.3 : 1), pierce: L >= 5 ? 2 : 0, radius: 0.4, model: 'arrow', crit: true, kb: 3, tags: ['dist'] }); fx(api, 'beam_physique', V(q.pos.x, 1, q.pos.z), { to: V(q.pos.x + d.x * 30, 1, q.pos.z + d.z * 30), dur: 0.3 }); api.shake && api.shake(0.5); sfx(api, 'super'); });
      k.v().lastShot = k.time();
    },
  });
  S({
    id: 'archer_faucon', classe: AR, name: 'Faucon de chasse', icon: 'wind', vfx: 'summon', sfx: 'upgrade', element: 'physique', kind: 'active', manaCost: 14, cd: 16, range: 16, radius: 1.5,
    unlockLevel: 15, spec: 'traqueur', tags: ['summon', 'mark'], branch: 'C', tier: 2,
    desc: (L) => 'Spécialisation Traqueur. Un faucon vole 8 s : 40 % de dégâts toutes les 0,6 s sur l\'ennemi le plus proche de lui, et marque (+15 %) l\'ennemi le plus lointain.',
    upgrades: [UP(3, 'Dure 10 s.'), UP(5, 'Le faucon étourdit 0,3 s à chaque 5e coup.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = L >= 3 ? 10 : 8;
      ctx.buff('faucon', { duration: dur, name: 'Faucon de chasse', icon: 'wind', vfx: 'buff', color: 0x5ca03a });
      fx(api, 'summon', p.pos, { color: 0x5ca03a });
      k.loop(dur, 0.6, (i) => {
        const q = pl(api), es = (api.enemies ? api.enemies() : []).filter((e) => alive(e) && dist2(e.pos, q.pos) < 16);
        if (!es.length) return;
        es.sort((a, b) => dist2(a.pos, q.pos) - dist2(b.pos, q.pos));
        const near = es[0], far = es[es.length - 1];
        hit(api, ctx, near, 40, { kind: 'skill', tags: ['dist'] }); if (L >= 5 && i % 5 === 0) st(ctx, api, near, 'stun', 0.3, 1);
        if (i % 4 === 1) markHunt(ctx, far, 3, 1.15);
        fx(api, 'hit_physique', near.pos, {});
      });
      sfx(api, 'upgrade');
    },
  });
  G.SKILL_TREES.Archer = { branches: { A: { name: 'Kit de départ', icon: '🏹', desc: 'Tir tendu, Piège, Pluie et l\'ultime Étoile filante.' }, B: { name: 'Déblocages', icon: '🌲', desc: 'Saut, flèche de choc, carreau et passifs.' }, C: { name: 'Spécialisation', icon: '🦅', desc: 'Tireur d\'élite ou Traqueur, au niveau 15.' } }, core: { basic: 'archer_tir', cast2: 'archer_piege', cast3: 'archer_pluie', super: 'archer_etoile_filante' } };

  // =====================================================================
  // PALADIN — « Rempart de l'Aube » (Foi 0-100 ; Jugé : frapper un Jugé soigne ; ★ = consomme 30 Foi pour +50 %)
  // =====================================================================
  const PA = 'Paladin';
  const star = (ctx) => (ctx.spend('foi', 30) ? 1.5 : 1);
  S({
    id: 'paladin_masse', classe: PA, name: 'Coup de masse bénie', icon: 'hammer', vfx: 'slash_sacre', sfx: 'swing', element: 'sacre', kind: 'basic', manaCost: 0, cd: 0.6, range: 2.5, radius: 0,
    combo: { steps: 3, window: 0.9 }, tags: ['melee', 'combo'], branch: 'A', tier: 1,
    desc: (L) => 'Combo de 3 coups sacrés (arc 120°, 2,5 m) : 100 % / 100 % / 150 % de dégâts, le 3e repousse. +4 Foi par coup. À 50 Foi, vos dégâts sacrés augmentent de 15 %.',
    upgrades: [UP(3, 'Le 3e coup étourdit 0,3 s.'), UP(5, 'Le 3e coup soigne 2 % des PV max.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), step = ctx.comboStep, pct = [100, 100, 150][step];
      let n = 0;
      for (const e of cone(api, p, d, 2.5, 120 * DEG)) {
        hit(api, ctx, e, pct, { kind: 'melee', kb: step === 2 ? 3 : 0.5, tags: ['basic'] });
        if (step === 2 && L >= 3) st(ctx, api, e, 'stun', 0.3, 1);
        if (ctx.flag('crusader') && k.tagged(e, 'juge')) burn(api, ctx, e, 20, 3);
        n++;
      }
      if (n) ctx.gain('foi', 4 + (ctx.perk(5) ? 2 : 0));
      if (step === 2 && n && L >= 5 && api.heal) api.heal(pl(api).pvMax * 0.02);
      if (step === 2 && ctx.perk(10)) { for (const e of lineEnemies(api, p.pos, d, 6, 0.9)) hit(api, ctx, e, 80, { kind: 'aoe', kb: 1 }); fx(api, 'holy_cross', V(p.pos.x + d.x * 3, 0, p.pos.z + d.z * 3), { radius: 1.5 }); }
      fx(api, 'slash_sacre', p.pos, { dir: d, radius: 2.5, arc: 120 * DEG }); sfx(api, 'swing');
      if (n) { api.hitStop && api.hitStop(step === 2 ? 0.06 : 0.03); api.shake && api.shake(step === 2 ? 0.2 : 0.08); }
      return step === 2 ? { cdMult: 1.2 } : undefined;
    },
  });
  S({
    id: 'paladin_bouclier', classe: PA, name: 'Bouclier sacré', icon: 'shield', vfx: 'buff', sfx: 'upgrade', element: 'sacre', kind: 'active', manaCost: 14, cd: 10, range: 3, radius: 3,
    tags: ['shield', 'buff', 'aoe'], branch: 'A', tier: 2,
    desc: (L) => '5 s de bouclier : absorbe jusqu\'à ' + (L >= 3 ? 35 : 25) + ' % de vos PV max ; +1 Foi par 1 % absorbé. À la fin ou à la rupture il explose (rayon 3, 150 %). Les ennemis Jugés qui vous frappent subissent 40 % de dégâts.',
    upgrades: [UP(3, 'Absorbe 35 % des PV max.'), UP(5, 'Renvoie 25 % des dégâts absorbés.')],
    variants: VAR(['Bastion de lumière', 'Absorbe +30 %, explosion −30 %.'], ['Égide explosive', 'Explosion +60 %, rayon 4 m, absorbe −20 %.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api);
      const abs = (L >= 3 ? 0.35 : 0.25) * (1 + (ctx.perk(5) ? 0.1 : 0) + (k.lv('paladin_egide') >= 1 ? 0.2 : 0) + (ctx.flag('guardian') ? 0.5 : 0)) * (ctx.v === 'A' ? 1.3 : ctx.v === 'B' ? 0.8 : 1);
      const shield = p.pvMax * abs;
      ctx.buff('bouclier', { duration: 5, shield, name: 'Bouclier sacré', icon: 'shield', vfx: 'buff', color: 0xffd966,
        onAbsorb: (n) => {
          const q = pl(api);
          ctx.gain('foi', Math.min(20, n / q.pvMax * 100) + (k.lv('paladin_egide') >= 1 ? 3 : 0));
          const e = nearest(api, q.pos, 3.5);
          if (e && L >= 5) api.damage(e, Math.max(1, Math.round(n * 0.25)), { element: 'sacre', kind: 'melee', source: 'player', canCrit: false, tags: ['sk:paladin_bouclier', 'reflect'] });
          if (e && k.tagged(e, 'juge')) hit(api, ctx, e, 40, { kind: 'melee', canCrit: false });
        },
        onEnd: () => {
          const q = pl(api), r = ctx.v === 'B' ? 4 : 3;
          for (const e of inRadius(api, q.pos, r)) hit(api, ctx, e, 150 * (ctx.v === 'A' ? 0.7 : ctx.v === 'B' ? 1.6 : 1), { kind: 'aoe', kb: 3 });
          fx(api, 'holy_cross', q.pos, { radius: r }); fx(api, 'shockwave', q.pos, { radius: r, color: 0xffd966 }); api.shake && api.shake(0.3); sfx(api, 'boom');
        } });
      fx(api, 'buff', p.pos, { color: 0xffd966 }); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'paladin_marteau', classe: PA, name: 'Marteau du jugement', icon: 'holy', vfx: 'holy_cross', sfx: 'throw', element: 'sacre', kind: 'active', manaCost: 14, cd: 5, range: 12, radius: 2.5,
    tags: ['projectile', 'aoe', 'mark'], branch: 'A', tier: 3,
    desc: (L) => 'Lance ' + (L >= 3 ? 2 : 1) + ' marteau' + (L >= 3 ? 'x' : '') + ' (12 m) : impact en rayon 2,5, 240 % de dégâts sacrés, ennemis touchés Jugés 6 s (frapper un Jugé vous soigne de 2 % des PV max, 1 fois/s).',
    upgrades: [UP(3, '2 marteaux.'), UP(5, 'Jugé : +20 % de dégâts subis.')],
    variants: VAR(['Marteau lourd', 'Un seul marteau, 380 %, rayon 3,2.'], ['Pluie de marteaux', '3 marteaux, dégâts −25 % chacun.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx);
      const n = ctx.v === 'A' ? 1 : ctx.v === 'B' ? 3 : (L >= 3 ? 2 : 1) + (ctx.perk(10) ? 1 : 0), pct = ctx.v === 'A' ? 380 : 240 * (ctx.v === 'B' ? 0.75 : 1), r = ctx.v === 'A' ? 3.2 : 2.5;
      for (let i = 0; i < n; i++) {
        const dd = n === 1 ? d : rot(d, (i - (n - 1) / 2) * 0.18);
        k.after(i * 0.12, () => { const q = pl(api); proj(api, ctx, { dir: dd, pos: V(q.pos.x + dd.x * 0.8, 1, q.pos.z + dd.z * 0.8), speed: 15, range: 12, pct: 0, radius: 0.5, model: 'hammer', element: 'sacre',
          onEnd: (pos) => {
            if (!pos) return;
            for (const e of inRadius(api, pos, r)) {
              hit(api, ctx, e, pct, { kind: 'aoe', kb: 1.5 });
              k.tag(e, 'juge', 6, 1); if (L >= 5 || ctx.perk(10)) ctx.mark(e, 1.2 + (ctx.perk(10) ? 0.1 : 0), 6);
              if (ctx.flag('crusader')) burn(api, ctx, e, 20, 4);
            }
            fx(api, 'holy_cross', pos, { radius: r }); fx(api, 'explosion_sacre', pos, { radius: r }); api.shake && api.shake(0.3); sfx(api, 'boom');
          } }); });
      }
      sfx(api, 'throw');
    },
  });
  S({
    id: 'paladin_verdict', classe: PA, name: 'Verdict de l\'Aube', icon: 'holy', vfx: 'holy_pillar', sfx: 'super', element: 'sacre', kind: 'ultimate', manaCost: 0, cd: 55, range: 6, radius: 6,
    unlockLevel: 5, tags: ['aoe', 'heal', 'ultimate'], branch: 'A', tier: 4,
    desc: (L) => 'Colonne de lumière (rayon 6 m) : 450 % de dégâts, étourdit 1 s et vous soigne de 35 % des PV max. Un sol sacré reste 6 s (soin 3 %/s, ennemis −20 % de vitesse). À 50 Foi ou plus : +30 %.',
    upgrades: [UP(3, 'Dégâts +20 %.'), UP(5, 'Purifie vos altérations.')],
    variants: VAR(['Jugement dernier', 'Dégâts +40 %, sol 4 s.'], ['Sanctuaire', 'Soin +15 %, sol 9 s, dégâts −20 %.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), c = { x: p.pos.x, z: p.pos.z }, hf = k.res.get('foi') >= 50 ? 1.3 : 1, r = 6;
      for (const e of inRadius(api, p.pos, r)) { hit(api, ctx, e, 450 * hf * (L >= 3 ? 1.2 : 1) * (ctx.v === 'A' ? 1.4 : ctx.v === 'B' ? 0.8 : 1), { kind: 'aoe', kb: 3 }); st(ctx, api, e, 'stun', 1, 1); k.tag(e, 'juge', 6, 1); }
      if (api.heal) api.heal(p.pvMax * (0.35 + (ctx.flag('guardian') ? 0.15 : 0) + (ctx.v === 'B' ? 0.15 : 0)));
      if (L >= 5) { try { const q = api.player(); if (q && q.statuses) for (const s in q.statuses) delete q.statuses[s]; } catch (_) {} }
      const dur = (ctx.v === 'A' ? 4 : ctx.v === 'B' ? 9 : 6) + (ctx.perk(5) ? 2 : 0);
      fx(api, 'holy_pillar', p.pos, { height: 9 }); fx(api, 'nova_sacre', p.pos, { radius: r }); fx(api, 'aoe_sacre', P3(c.x, c.z), { radius: r, dur }); api.shake && api.shake(0.9); api.hitStop && api.hitStop(0.1); sfx(api, 'super');
      k.loop(dur, 1, () => {
        const q = pl(api);
        if (dist2(q.pos, c) <= r && api.heal) api.heal(q.pvMax * 0.03);
        for (const e of inRadius(api, P3(c.x, c.z), r)) st(ctx, api, e, 'slow', 1.2, 0.2);
      });
      text(api, p.pos, 'VERDICT DE L\'AUBE', '#ffe9a0', 1.3);
    },
  });
  S({
    id: 'paladin_terre_sacree', classe: PA, name: 'Terre consacrée', icon: 'sparkles', vfx: 'aoe_sacre', sfx: 'upgrade', element: 'sacre', kind: 'active', manaCost: 16, cd: 12, range: 0, radius: 3.5,
    unlockLevel: 5, tags: ['aoe', 'heal', 'dot'], branch: 'B', tier: 1,
    desc: (L) => '★ Zone consacrée (rayon 3,5 m, 8 s) : 60 % de dégâts par seconde, vous y regagnez 1,5 % de PV par seconde. Dépense 30 Foi pour +50 % d\'effet.' + (L >= 5 ? ' Suit le paladin.' : ''),
    upgrades: [UP(5, 'La zone suit le paladin.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), c = { x: p.pos.x, z: p.pos.z }, s = star(ctx);
      fx(api, 'aoe_sacre', P3(c.x, c.z), { radius: 3.5, dur: 8 }); sfx(api, 'upgrade');
      if (s > 1) text(api, p.pos, '★ Foi dépensée', '#ffe9a0', 0.9);
      k.loop(8, 1, () => {
        const q = pl(api);
        if (L >= 5) { c.x = q.pos.x; c.z = q.pos.z; }
        for (const e of inRadius(api, P3(c.x, c.z), 3.5)) hit(api, ctx, e, 60 * s, { kind: 'dot', canCrit: false });
        if (dist2(q.pos, c) <= 3.6 && api.heal) api.heal(q.pvMax * 0.015 * s);
      });
    },
  });
  S({
    id: 'paladin_charge_radieuse', classe: PA, name: 'Charge radieuse', icon: 'dash', vfx: 'dash', sfx: 'dash', element: 'sacre', kind: 'active', manaCost: 12, cd: 8, range: 6, radius: 1.3,
    unlockLevel: 10, tags: ['melee', 'dash', 'cc'], branch: 'B', tier: 2,
    desc: (L) => 'Charge de 6 m : 150 % de dégâts sacrés, repousse de 7' + (L >= 5 ? ', étourdit 1 s' : '') + '. +15 Foi. Votre engagement vers les cibles.',
    upgrades: [UP(5, 'Étourdit 1 s (boss : ralentis).')],
    cast(api, L, ctx) {
      const p = pl(api), d = dirOf(api, ctx);
      dashTo(api, d, 6, 0.25, 0.25, { onPass: (e) => { if (!alive(e)) return; hit(api, ctx, e, 150, { kind: 'melee', kb: 7 }); if (L >= 5) st(ctx, api, e, 'stun', 1, 1); } });
      ctx.gain('foi', 15); fx(api, 'dash', p.pos, {}); sfx(api, 'dash');
      ctx.K.after(0.27, () => { fx(api, 'shockwave', pl(api).pos, { radius: 2, color: 0xffd966 }); api.shake && api.shake(0.3); });
    },
  });
  S({
    id: 'paladin_egide', classe: PA, name: 'Égide de l\'Aube', icon: 'shield', kind: 'passive', unlockLevel: 15, tags: ['defense', 'shield'], branch: 'B', tier: 3, element: 'sacre',
    desc: () => 'Passif : +20 % de défense ; le Bouclier sacré absorbe 25 % de plus et chaque coup bloqué donne +3 Foi.',
    upgrades: [UP(5, 'Au-dessus de 50 Foi, −10 % de dégâts subis.')],
    passive(s) { mul(s, 'defense', 1.2); return s; },
  });
  S({
    id: 'paladin_imposition', classe: PA, name: 'Imposition des mains', icon: 'heart', vfx: 'heal', sfx: 'upgrade', element: 'sacre', kind: 'active', manaCost: 20, cd: 16, range: 0, radius: 0,
    unlockLevel: 20, tags: ['heal', 'buff'], branch: 'B', tier: 4,
    desc: (L) => '★ Soigne 25 % des PV max (37 % avec 30 Foi dépensés), purge vos altérations et vous rend invulnérable 1 s. +5 Foi.' + (L >= 5 ? ' Rend 20 mana.' : ''),
    upgrades: [UP(5, 'Rend 20 mana.')],
    cast(api, L, ctx) {
      const p = pl(api), s = star(ctx);
      if (api.heal) api.heal(p.pvMax * 0.25 * s);
      try { const q = api.player(); if (q && q.statuses) for (const x in q.statuses) delete q.statuses[x]; } catch (_) {}
      ctx.buff('imposition', { duration: 1, invuln: true, name: 'Imposition des mains', icon: 'heart', vfx: 'buff', color: 0xffe9a0 });
      ctx.gain('foi', 5); if (L >= 5 && api.restoreMana) api.restoreMana(20);
      fx(api, 'heal', p.pos, {}); fx(api, 'holy_pillar', p.pos, { height: 4 }); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'paladin_sursaut', classe: PA, name: 'Sursaut de l\'Aube', icon: 'holy', kind: 'passive', unlockLevel: 25, tags: ['defense', 'shield'], branch: 'B', tier: 5, element: 'sacre',
    desc: (L) => 'Passif : sous 25 % de PV, bouclier de 40 % des PV max et soin de 15 % ; recharge ' + (L >= 5 ? 40 : 60) + ' s.',
    upgrades: [UP(5, 'Recharge 40 s.')],
    passive(s) { return s; },
  });
  S({
    id: 'paladin_phalange', classe: PA, name: 'Phalange sacrée', icon: 'shield', vfx: 'aura', sfx: 'upgrade', element: 'sacre', kind: 'active', manaCost: 18, cd: 18, range: 4, radius: 4,
    unlockLevel: 15, spec: 'protecteur', tags: ['shield', 'buff', 'defense'], branch: 'C', tier: 1,
    desc: (L) => 'Spécialisation Protecteur. 6 s : un mur de lumière devant vous bloque les projectiles ennemis, dégâts subis −30 %, 30 % renvoyés en sacré.',
    upgrades: [UP(3, 'Durée 8 s.'), UP(5, 'Renvoi 45 %.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), dur = L >= 3 ? 8 : 6, refl = L >= 5 ? 45 : 30;
      ctx.buff('phalange', { duration: dur, incoming: 0.7, name: 'Phalange sacrée', icon: 'shield', vfx: 'buff', color: 0xffe9a0, repeat: true,
        onHit: () => { const e = nearest(api, pl(api).pos, 3.5); if (e) hit(api, ctx, e, refl * 0.5, { kind: 'melee', canCrit: false, noCharge: true }); } });
      k.loop(dur, 0.15, () => { const q = pl(api), d = q.dir || { x: 0, z: 1 }; k.blockShots(P3(q.pos.x + d.x * 1.5, q.pos.z + d.z * 1.5), 3); });
      fx(api, 'aura', p.pos, { color: 0xffe9a0 }); fx(api, 'shockwave', p.pos, { radius: 3, color: 0xffe9a0 }); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'paladin_chatiment_divin', classe: PA, name: 'Châtiment divin', icon: 'bolt', vfx: 'lightning_strike', sfx: 'boom', element: 'sacre', kind: 'active', manaCost: 20, cd: 9, range: 10, radius: 1.8,
    unlockLevel: 15, spec: 'croise', tags: ['aoe', 'cc'], branch: 'C', tier: 2,
    desc: (L) => 'Spécialisation Croisé. ★ ' + (L >= 5 ? 4 : 3) + ' éclairs sacrés s\'abattent sur les ennemis proches (10 m) : 350 % chacun, étourdit 0,8 s. 30 Foi dépensés : +50 %.',
    upgrades: [UP(3, 'Éclairs +20 %.'), UP(5, 'Un 4e éclair.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api);
      const es = (api.enemies ? api.enemies() : []).filter((e) => alive(e) && dist2(e.pos, p.pos) <= 10).sort((a, b) => dist2(a.pos, p.pos) - dist2(b.pos, p.pos));
      if (!es.length) { sfx(api, 'error'); return false; }
      const s = star(ctx), n = L >= 5 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const t = es[i % es.length];
        k.after(0.2 + i * 0.2, () => {
          const c = alive(t) ? t.pos : p.pos;
          api.aoe({ pos: P3(c.x, c.z), radius: 1.8, damage: dmg(api, ctx, 350 * s * (L >= 3 ? 1.2 : 1), 'sacre'), element: 'sacre', delay: 0.3, telegraph: true, vfx: 'lightning_strike', source: 'player', tags: tagsOf(ctx, ['aoe']), knockback: 1,
            onHit: (e) => { st(ctx, api, e, 'stun', 0.8, 1); k.tag(e, 'juge', 6, 1); } });
        });
      }
      sfx(api, 'boom');
    },
  });
  G.SKILL_TREES.Paladin = { branches: { A: { name: 'Kit de départ', icon: '⚜️', desc: 'Masse, Bouclier, Marteau et l\'ultime Verdict.' }, B: { name: 'Déblocages', icon: '🛡️', desc: 'Terre consacrée, charge, imposition et passifs.' }, C: { name: 'Spécialisation', icon: '☀️', desc: 'Protecteur (Phalange) ou Croisé (Châtiment), au niveau 15.' } }, core: { basic: 'paladin_masse', cast2: 'paladin_bouclier', cast3: 'paladin_marteau', super: 'paladin_verdict' } };

  // =====================================================================
  // ÉLÉMENTALISTE — « Danseur de la tempête gelée » (Givre 0-3 / Orage 0-3 ; Dualité +25 % ; Éclatement des gelés)
  // =====================================================================
  const EL = 'Elementaliste';
  const charge = (ctx, id, n) => { const v = ctx.K.v(); v.chargeT = v.chargeT || {}; v.chargeT[id] = ctx.K.time(); ctx.gain(id, n == null ? 1 : n); };
  const chainBonus = (ctx) => Math.floor(ctx.res('orage') / 2) + (ctx.flag('storm') ? 2 : 0);
  const extraFreeze = (api) => Number((pl(api).stats || {}).freezeDur) || 0;
  /** éclair qui rebondit : renvoie la liste des touchés */
  function bolt(api, ctx, first, pct, bounces, o) {
    o = o || {};
    const hitList = [first]; let cur = first, m = 1;
    hit(api, ctx, first, pct, { element: 'foudre', kind: 'skill' });
    if (!o.noShock) st(ctx, api, first, 'shock', 1.5, 1);
    for (let i = 0; i < bounces; i++) {
      m *= o.decay || 0.75;
      const nx = inRadius(api, cur.pos, 6).filter((e) => !hitList.includes(e)).sort((a, b) => dist2(a.pos, cur.pos) - dist2(b.pos, cur.pos))[0];
      if (!nx) break;
      fx(api, 'bolt_foudre', V(cur.pos.x, 1, cur.pos.z), { to: V(nx.pos.x, 1, nx.pos.z), dur: 0.2 });
      hit(api, ctx, nx, pct * m, { element: 'foudre', kind: 'skill', canCrit: true });
      if (!o.noShock) st(ctx, api, nx, 'shock', 1.5, 1);
      hitList.push(nx); cur = nx;
    }
    return hitList;
  }
  /** Mur de glace frappé par la foudre : explose */
  function zapWall(api, k) {
    const w = k.v().wall; if (!w || w.until <= k.time()) return;
    k.v().wall = null;
    for (const e of inRadius(api, P3(w.x, w.z), 3)) api.damage(e, k.calc(api, 200 * w.mult, 'glace'), { element: 'glace', kind: 'aoe', source: 'player', tags: ['sk:elementaliste_mur_glace', 'aoe'], canCrit: false });
    fx(api, 'nova_glace', P3(w.x, w.z), { radius: 3 }); fx(api, 'ice_spikes', P3(w.x, w.z), { radius: 3 }); api.shake && api.shake(0.3);
  }
  S({
    id: 'elementaliste_arc', classe: EL, name: 'Arc élémentaire', icon: 'lightning', vfx: 'bolt_foudre', sfx: 'throw', element: 'foudre', kind: 'basic', manaCost: 0, cd: 0.5, range: 13, radius: 0.35,
    tags: ['projectile', 'chain'], branch: 'A', tier: 1,
    desc: (L) => 'Alterne à chaque tir : foudre (90 %, rebondit ' + (L >= 3 ? 2 : 1) + ' fois à 50 %) puis glace (90 %, ralentit 25 % pendant 2 s). Un tir sur deux de chaque élément donne 1 charge ; prépare l\'élément opposé (Dualité).',
    upgrades: [UP(3, '+1 rebond de foudre.'), UP(5, 'Le tir de glace perce 1 ennemi.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), v = k.v();
      const isFoudre = (v.arcN = (v.arcN || 0) + 1) % 2 === 1, el = isFoudre ? 'foudre' : 'glace', id = isFoudre ? 'orage' : 'givre';
      if (ctx.perk(10) || (isFoudre ? v.arcN % 4 === 1 : v.arcN % 4 === 2)) charge(ctx, id, 1);
      if (isFoudre) zapWall(api, k);
      const pierce = !isFoudre && (L >= 5 || ctx.perk(5)) ? 1 : 0, bounces = (L >= 3 ? 2 : 1) + (ctx.perk(5) ? 0 : 0) + chainBonus(ctx);
      proj(api, ctx, { dir: d, pos: V(p.pos.x + d.x * 0.7, 1, p.pos.z + d.z * 0.7), speed: 20, range: 13, pct: 0, element: el, pierce, radius: 0.4, model: isFoudre ? 'bolt' : 'orb',
        onHit: (e) => {
          if (isFoudre) { const lst = [e]; hit(api, ctx, e, 90, { element: 'foudre', tags: ['basic'] }); let cur = e, m = 1;
            for (let i = 0; i < bounces; i++) { m *= 0.5; const nx = inRadius(api, cur.pos, 5).filter((x) => !lst.includes(x))[0]; if (!nx) break; fx(api, 'bolt_foudre', V(cur.pos.x, 1, cur.pos.z), { to: V(nx.pos.x, 1, nx.pos.z), dur: 0.15 }); hit(api, ctx, nx, 90 * m, { element: 'foudre', tags: ['basic'] }); lst.push(nx); cur = nx; } }
          else { hit(api, ctx, e, 90, { element: 'glace', tags: ['basic'] }); st(ctx, api, e, 'slow', 2, Math.min(0.7, 0.25 + 0.08 * Math.floor(ctx.res('givre')))); }
        } });
      fx(api, isFoudre ? 'bolt_foudre' : 'hit_glace', V(p.pos.x + d.x, 1, p.pos.z + d.z), {}); sfx(api, 'throw');
    },
  });
  S({
    id: 'elementaliste_chaine', classe: EL, name: 'Chaîne de foudre', icon: 'bolt', vfx: 'bolt_foudre', sfx: 'throw', element: 'foudre', kind: 'active', manaCost: 14, cd: 4.5, range: 13, radius: 6,
    tags: ['chain', 'cc'], branch: 'A', tier: 2,
    desc: (L) => 'Éclair instantané (13 m) : 220 % de dégâts, ' + (L >= 3 ? 5 : 4) + ' rebonds (×0,75 chacun), choc 1,5 s ; +1 Orage (chaque 2 Orage : +1 rebond). Sur un ennemi gelé : Éclatement (+40 %).',
    upgrades: [UP(3, '5 rebonds.'), UP(5, 'Étourdit la première cible 0,3 s.')],
    variants: VAR(['Foudre étendue', '+3 rebonds, dégâts −15 %.'], ['Foudre concentrée', '+40 % de dégâts, 2 rebonds de moins.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), t = frontTarget(api, p, d, 13, 0.9);
      if (!alive(t)) { sfx(api, 'error'); return false; }
      const b = (L >= 3 ? 5 : 4) + (ctx.perk(5) ? 1 : 0) + chainBonus(ctx) + (ctx.v === 'A' ? 3 : ctx.v === 'B' ? -2 : 0);
      zapWall(api, k);
      fx(api, 'bolt_foudre', V(p.pos.x, 1, p.pos.z), { to: V(t.pos.x, 1, t.pos.z), dur: 0.25 });
      bolt(api, ctx, t, 220 * (ctx.v === 'A' ? 0.85 : ctx.v === 'B' ? 1.4 : 1), Math.max(0, b));
      if (L >= 5 || ctx.flag('storm')) st(ctx, api, t, 'stun', ctx.flag('storm') ? 0.4 : 0.3, 1);
      charge(ctx, 'orage', 1); api.shake && api.shake(0.2); sfx(api, 'throw');
    },
  });
  S({
    id: 'elementaliste_nova', classe: EL, name: 'Nova de givre', icon: 'ice', vfx: 'frost_nova', sfx: 'upgrade', element: 'glace', kind: 'active', manaCost: 16, cd: 8, range: 4, radius: 4,
    tags: ['aoe', 'cc'], branch: 'A', tier: 3,
    desc: (L) => 'Onde de givre (rayon ' + (L >= 3 ? 5 : 4) + ' m) autour de vous : 200 % de dégâts, fige 1,4 s (+0,25 s par Givre, boss : ralentis) ; +1 Givre. Un gelé frappé par la foudre éclate. ' + (L >= 5 ? 'Seconde onde à 0,8 s.' : ''),
    upgrades: [UP(3, 'Rayon 5 m.'), UP(5, 'Seconde onde à 0,8 s.')],
    variants: VAR(['Blizzard', 'Rayon 6,5 m, gel −0,4 s.'], ['Gel profond', 'Gel +0,8 s, dégâts +25 %, rayon 3,5 m.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), r = (L >= 3 ? 5 : 4) + (ctx.perk(5) ? 0.5 : 0) + (ctx.v === 'A' ? 1.5 : ctx.v === 'B' ? -0.5 : 0);
      const dur = 1.4 + 0.25 * Math.floor(ctx.res('givre') + 1e-6) + extraFreeze(api) + (ctx.flag('cryo') ? 0.5 : 0) + (ctx.v === 'A' ? -0.4 : ctx.v === 'B' ? 0.8 : 0);
      const wave = (m) => { const q = pl(api); for (const e of inRadius(api, q.pos, r)) { hit(api, ctx, e, 200 * m * (ctx.v === 'B' ? 1.25 : 1), { kind: 'aoe', kb: 2 }); st(ctx, api, e, 'freeze', dur, 1); } fx(api, 'frost_nova', q.pos, { radius: r }); api.shake && api.shake(0.35); sfx(api, 'upgrade'); };
      wave(1); charge(ctx, 'givre', 1);
      if (L >= 5) k.after(0.8, () => wave(0.6));
    },
  });
  S({
    id: 'elementaliste_tempete', classe: EL, name: 'Tempête du zénith', icon: 'tornado', vfx: 'lightning_strike', sfx: 'super', element: 'foudre', kind: 'ultimate', manaCost: 0, cd: 55, range: 12, radius: 7,
    unlockLevel: 5, tags: ['aoe', 'chain', 'ultimate', 'cc'], branch: 'A', tier: 4,
    desc: (L) => 'Tempête de 8 s (rayon 7 m) sur la cible : foudre 150 % toutes les 0,4 s sur un ennemi, blizzard 80 % et gel 0,8 s à tous toutes les 1,5 s. +10 % de dégâts par charge détenue au lancement (Éclatements en continu).',
    upgrades: [UP(3, 'Dégâts +20 %.'), UP(5, 'La zone suit l\'ennemi le plus proche.')],
    variants: VAR(['Œil du cyclone', 'Rayon 9 m, foudre −20 %.'], ['Foudre pure', 'Foudre +40 %, blizzard −30 %.']),
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), tgt = aimPoint(api, p, d, 12, 8);
      const ch = Math.floor(ctx.res('givre') + 1e-6) + Math.floor(ctx.res('orage') + 1e-6), cm = 1 + 0.1 * ch * (L >= 3 ? 1 : 1);
      const dur = 8 + (ctx.perk(5) ? 1 : 0), r = 7 + (ctx.perk(10) ? 1.5 : 0) + (ctx.v === 'A' ? 2 : 0), c = { x: tgt.x, z: tgt.z };
      fx(api, 'aoe_foudre', P3(c.x, c.z), { radius: r, dur }); fx(api, 'aoe_glace', P3(c.x, c.z), { radius: r, dur }); sfx(api, 'super'); text(api, p.pos, 'TEMPÊTE DU ZÉNITH', '#9fe6ff', 1.3);
      const m = (L >= 3 ? 1.2 : 1);
      k.loop(dur, 0.4, (i) => {
        if (L >= 5) { const n = nearest(api, P3(c.x, c.z), 12); if (n) { const dx = n.pos.x - c.x, dz = n.pos.z - c.z, dd = Math.hypot(dx, dz) || 1; c.x += dx / dd * 0.6; c.z += dz / dd * 0.6; } }
        const es = inRadius(api, P3(c.x, c.z), r);
        if (es.length) {
          const e = es[Math.floor(Math.random() * es.length)];
          hit(api, ctx, e, 150 * cm * m * (ctx.v === 'A' ? 0.8 : ctx.v === 'B' ? 1.4 : 1) * (ctx.perk(10) && k.hasStatus(e, 'freeze') ? 1.2 : 1), { element: 'foudre', kind: 'skill' });
          fx(api, 'lightning_strike', e.pos, {}); if (i % 3 === 0) api.shake && api.shake(0.2);
        }
        if (i % 4 === 1) { for (const e of es) { hit(api, ctx, e, 80 * cm * m * (ctx.v === 'B' ? 0.7 : 1), { element: 'glace', kind: 'aoe' }); st(ctx, api, e, 'freeze', 0.8, 1); } fx(api, 'ice_spikes', P3(c.x, c.z), { radius: r * 0.6 }); }
      }, () => { fx(api, 'nova_glace', P3(c.x, c.z), { radius: r }); api.shake && api.shake(0.5); });
    },
  });
  S({
    id: 'elementaliste_fusion', classe: EL, name: 'Fusion élémentaire', icon: 'sparkles', vfx: 'explosion_foudre', sfx: 'boom', element: 'glace', kind: 'active', manaCost: 18, cd: 7, range: 4, radius: 4,
    unlockLevel: 5, tags: ['aoe', 'chain'], branch: 'B', tier: 1,
    desc: (L) => 'Consomme 1 Givre et 1 Orage : explosion de glace et de foudre (rayon 4 m), 450 % de dégâts. Sans les deux charges : 60 % seulement.' + (L >= 5 ? ' Rend 1 charge.' : ''),
    upgrades: [UP(5, 'Rend 1 charge au hasard.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), tgt = aimPoint(api, p, d, 8, 4), c = P3(tgt.x, tgt.z);
      const both = ctx.res('givre') >= 1 && ctx.res('orage') >= 1;
      if (both) { ctx.spend('givre', 1); ctx.spend('orage', 1); }
      const pct = both ? 450 * (ctx.perk(10) ? 1.2 : 1) : 60;
      for (const e of inRadius(api, c, 4)) { hit(api, ctx, e, pct / 2, { element: 'glace', kind: 'aoe', kb: 2 }); hit(api, ctx, e, pct / 2, { element: 'foudre', kind: 'aoe' }); }
      fx(api, 'explosion_foudre', c, { radius: 4 }); fx(api, 'nova_glace', c, { radius: 4 }); api.shake && api.shake(both ? 0.6 : 0.2); sfx(api, 'boom');
      if (both && L >= 5) charge(ctx, Math.random() < 0.5 ? 'givre' : 'orage', 1);
    },
  });
  S({
    id: 'elementaliste_lance', classe: EL, name: 'Lance de glace', icon: 'ice', vfx: 'beam_glace', sfx: 'upgrade', element: 'glace', kind: 'active', manaCost: 14, cd: 5, range: 15, radius: 0.8,
    charge: { maxTime: 0.8, minMult: 0.6, maxMult: 1 }, unlockLevel: 10, tags: ['projectile', 'cc'], branch: 'B', tier: 2,
    desc: (L) => 'Maintenir 0,8 s : lance de glace de 180 % à 300 % de dégâts, perce tous les ennemis, ralentit de 60 % ; chargée à fond, elle fige 1 s. +1 Givre.',
    upgrades: [UP(5, 'Ralentissement 80 % et +1 Givre si chargée à fond.')],
    cast(api, L, ctx) {
      const p = pl(api), d = dirOf(api, ctx), full = ctx.charge >= 0.98;
      proj(api, ctx, { dir: d, pos: V(p.pos.x + d.x * 0.8, 1, p.pos.z + d.z * 0.8), speed: 24, range: 15, pct: 300, pierce: 99, radius: 0.7, model: 'bolt', kb: 1,
        onHit: (e) => { st(ctx, api, e, 'slow', 2.5, L >= 5 ? 0.8 : 0.6); if (full) st(ctx, api, e, 'freeze', 1 + extraFreeze(api), 1); } });
      charge(ctx, 'givre', 1 + (full && L >= 5 ? 1 : 0)); fx(api, 'beam_glace', V(p.pos.x, 1, p.pos.z), { to: V(p.pos.x + d.x * 15, 1, p.pos.z + d.z * 15), dur: 0.3 }); sfx(api, 'upgrade');
    },
  });
  S({
    id: 'elementaliste_resonance', classe: EL, name: 'Résonance', icon: 'bolt', kind: 'passive', unlockLevel: 15, tags: ['chain'], branch: 'B', tier: 3, element: 'foudre',
    desc: () => 'Passif : jusqu\'à 4 charges par élément (au lieu de 3), qui durent 14 s ; l\'Éclatement a +15 % de zone.',
    upgrades: [UP(5, 'Un Éclatement rend 1 charge.')],
    passive(s) { return s; },
  });
  S({
    id: 'elementaliste_orage', classe: EL, name: 'Appel de l\'orage', icon: 'lightning', vfx: 'lightning_strike', sfx: 'boom', element: 'foudre', kind: 'active', manaCost: 20, cd: 12, range: 12, radius: 6,
    unlockLevel: 20, tags: ['aoe', 'chain'], branch: 'B', tier: 4,
    desc: (L) => (L >= 5 ? 7 : 5) + ' éclairs retardés (0,5 s, tracés au sol) frappent la zone de 6 m : 220 % chacun, choc ; ils visent les gelés en priorité (Éclatements en masse). +1 Orage.',
    upgrades: [UP(5, '7 éclairs.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), tgt = aimPoint(api, p, d, 12, 8), n = L >= 5 ? 7 : 5;
      zapWall(api, k);
      const es = inRadius(api, P3(tgt.x, tgt.z), 6).sort((a, b) => (k.hasStatus(b, 'freeze') ? 1 : 0) - (k.hasStatus(a, 'freeze') ? 1 : 0));
      for (let i = 0; i < n; i++) k.after(i * 0.15, () => {
        const e = es[i % Math.max(1, es.length)];
        const a = Math.random() * TAU, rr = Math.random() * 5;
        const c = e && alive(e) ? e.pos : P3(tgt.x + Math.cos(a) * rr, tgt.z + Math.sin(a) * rr);
        api.aoe({ pos: P3(c.x, c.z), radius: 1.5, damage: dmg(api, ctx, 220, 'foudre'), element: 'foudre', delay: 0.5, telegraph: true, vfx: 'lightning_strike', source: 'player', tags: tagsOf(ctx, ['aoe']), knockback: 0.5, onHit: (x) => st(ctx, api, x, 'shock', 1.5, 1) });
      });
      charge(ctx, 'orage', 1); fx(api, 'cast_foudre', p.pos, {}); sfx(api, 'throw');
    },
  });
  S({
    id: 'elementaliste_zenith', classe: EL, name: 'Zénith', icon: 'crown', kind: 'passive', unlockLevel: 25, tags: ['buff'], branch: 'B', tier: 5, element: 'foudre',
    desc: (L) => 'Passif : à 3 Givre et 3 Orage, l\'état Zénith dure ' + (L >= 5 ? 8 : 6) + ' s (sorts gratuits, +30 % de dégâts). Recharge 20 s. Récompense l\'alternance.',
    upgrades: [UP(5, 'Zénith 8 s.')],
    passive(s) { return s; },
  });
  S({
    id: 'elementaliste_sphere', classe: EL, name: 'Sphère d\'orage', icon: 'bolt', vfx: 'bolt_foudre', sfx: 'throw', element: 'foudre', kind: 'active', manaCost: 16, cd: 14, range: 7, radius: 7,
    unlockLevel: 15, spec: 'tempete', tags: ['summon', 'chain'], branch: 'C', tier: 1,
    desc: (L) => 'Spécialisation Tempête. Une sphère vous suit 6 s et foudroie l\'ennemi le plus proche (7 m) : 80 % toutes les 0,5 s, avec rebond.',
    upgrades: [UP(3, 'Dure 8 s.'), UP(5, 'Les éclairs rebondissent 2 fois.')],
    cast(api, L, ctx) {
      const k = ctx.K, dur = L >= 3 ? 8 : 6, p = pl(api);
      ctx.buff('sphere', { duration: dur, name: 'Sphère d\'orage', icon: 'bolt', vfx: 'buff', color: 0xfff04a });
      fx(api, 'summon', p.pos, { color: 0xfff04a });
      k.loop(dur, 0.5, () => {
        const q = pl(api), e = nearest(api, q.pos, 7); if (!e) return;
        fx(api, 'bolt_foudre', V(q.pos.x, 2, q.pos.z), { to: V(e.pos.x, 1, e.pos.z), dur: 0.2 });
        bolt(api, ctx, e, 80, L >= 5 ? 2 : 1, { noShock: false });
      });
      charge(ctx, 'orage', 1); sfx(api, 'throw');
    },
  });
  S({
    id: 'elementaliste_mur_glace', classe: EL, name: 'Mur de glace', icon: 'ice', vfx: 'ice_spikes', sfx: 'upgrade', element: 'glace', kind: 'active', manaCost: 16, cd: 14, range: 5, radius: 3,
    unlockLevel: 15, spec: 'cryomancien', tags: ['aoe', 'cc', 'shield'], branch: 'C', tier: 2,
    desc: (L) => 'Spécialisation Cryomancien. Dresse une barrière de glace 6 s : bloque les projectiles, ralentit de 40 % les ennemis proches. Un sort de foudre lancé pendant ce temps la fait exploser (200 %). +1 Givre.',
    upgrades: [UP(3, 'Dure 8 s.'), UP(5, 'Explosion 300 %.')],
    cast(api, L, ctx) {
      const k = ctx.K, p = pl(api), d = dirOf(api, ctx), dur = L >= 3 ? 8 : 6, c = { x: p.pos.x + d.x * 4, z: p.pos.z + d.z * 4 };
      k.v().wall = { x: c.x, z: c.z, until: k.time() + dur, mult: L >= 5 ? 1.5 : 1 };
      fx(api, 'ice_spikes', P3(c.x, c.z), { radius: 3 }); fx(api, 'frost_nova', P3(c.x, c.z), { radius: 2 }); sfx(api, 'upgrade');
      k.loop(dur, 0.2, () => {
        const w = k.v().wall; if (!w) return false;
        k.blockShots(P3(w.x, w.z), 3);
        for (const e of inRadius(api, P3(w.x, w.z), 3.2)) st(ctx, api, e, 'slow', 0.6, 0.4);
      }, () => { const w = k.v().wall; if (w && w.until <= k.time() + 0.3) { k.v().wall = null; fx(api, 'ice_spikes', P3(c.x, c.z), { radius: 3 }); } });
      charge(ctx, 'givre', 1);
    },
  });
  G.SKILL_TREES.Elementaliste = { branches: { A: { name: 'Kit de départ', icon: '⚡', desc: 'Arc, Chaîne, Nova et l\'ultime Tempête.' }, B: { name: 'Déblocages', icon: '❄️', desc: 'Fusion, Lance, Orage et passifs.' }, C: { name: 'Spécialisation', icon: '🌩️', desc: 'Tempête (Sphère) ou Cryomancien (Mur), au niveau 15.' } }, core: { basic: 'elementaliste_arc', cast2: 'elementaliste_chaine', cast3: 'elementaliste_nova', super: 'elementaliste_tempete' } };

  // =====================================================================
  // PASSIFS DE CLASSE (stats) — les effets de combat (Peau de fer, Coup fatal, Dualité…) sont dans js/sys/skills.js (moteur)
  // =====================================================================
  const CP = G.CLASS_PASSIVES;
  CP.Guerrier = { name: 'Peau de fer', desc: 'Réduit de 8 % les dégâts subis ; la Rage décroît 50 % moins vite sous 50 % de PV.', apply(s) { return s; } };
  CP.Mage = { name: 'Flux arcanique', desc: '+25 % de régénération de mana ; le Trait arcanique rend 2 mana par touche.', apply(s) { mul(s, 'manaRegen', 1.25); return s; } };
  CP.Voleur = { name: 'Pas de velours', desc: '+8 % d\'esquive ; la glissade a 20 % de recharge en moins ; 10 % de chance de lâcher de l\'or quand un couteau touche.', apply(s) { add(s, 'dodge', 0.08); return s; } };
  CP.Assassin = { name: 'Coup fatal', desc: '+50 % de dégâts dans le dos ou sur un ennemi marqué ; +100 % sous 20 % de PV ; +6 % de critique dans le dos.', apply(s) { return s; } };
  CP.Archer = { name: 'Œil de lynx', desc: 'Jusqu\'à +25 % de dégâts selon l\'éloignement de la cible (plein à 15 m) ; +15 % de critique sur tir pleinement chargé.', apply(s) { return s; } };
  CP.Paladin = { name: 'Lumière gardienne', desc: 'Régénère 1 % des PV max par seconde hors combat ; les dégâts sacrés soignent 4 % des PV max une fois par seconde.', apply(s) { return s; } };
  CP.Elementaliste = { name: 'Dualité', desc: 'Un sort de glace renforce de 25 % le prochain sort de foudre pendant 5 s (et inversement) ; les ennemis gelés subissent +40 % de foudre et le gel se brise en éclats.', apply(s) { return s; } };

  // =====================================================================
  // SPÉCIALISATIONS (niveau 15) — flags lus par les compétences via ctx.flag(), stats, mods par compétence {dmg, cd, mana}
  // =====================================================================
  const SP = G.SKILL_SPECS;
  SP.Guerrier = [
    { id: 'berserker', name: 'Berserker', desc: '+20 % de dégâts, +8 % de vol de vie, −15 % de défense, +6 Rage par coup. Débloque Frénésie sanglante.', unlockLevel: 15, flags: ['berserk'], skillId: 'guerrier_frenesie', stats(s) { mulAll(s, 1.2); add(s, 'lifesteal', 0.08); mul(s, 'defense', 0.85); return s; }, mods: {} },
    { id: 'gardien', name: 'Rempart', desc: '+20 % de défense, −10 % de dégâts subis, Cri +40 % de portée. Débloque Bastion.', unlockLevel: 15, flags: ['guardian'], skillId: 'guerrier_bastion', stats(s) { mul(s, 'defense', 1.2); return s; }, mods: {} },
  ];
  SP.Mage = [
    { id: 'pyromancien', name: 'Pyromancien', desc: '+25 % de dégâts de feu, brûlures contagieuses (une brûlure qui tue se propage). Débloque Brasier.', unlockLevel: 15, flags: ['inferno'], skillId: 'mage_brasier', stats(s) { mulD(s, 'feu', 1.25); return s; }, mods: {} },
    { id: 'archimage', name: 'Archimage', desc: '−20 % de recharge, +30 % de mana max. Débloque Doublon d\'incantation.', unlockLevel: 15, flags: ['arcane'], skillId: 'mage_doublon', stats(s) { add(s, 'cdr', 0.2); mul(s, 'manaMax', 1.3); return s; }, mods: {} },
  ];
  SP.Voleur = [
    { id: 'lame_fantome', name: 'Virtuose', desc: '8 Lames max, +30 % de régénération, le couteau en lance 2 (−20 % chacun). Débloque Valse spectrale.', unlockLevel: 15, flags: ['ghost'], skillId: 'voleur_valse', stats(s) { return s; }, mods: {} },
    { id: 'larron', name: 'Larron', desc: '+30 % d\'or et de butin, poison sur les couteaux, −10 % de dégâts directs. Débloque Pillage.', unlockLevel: 15, flags: ['venom'], skillId: 'voleur_pillage', stats(s) { add(s, 'goldMult', 0.3); add(s, 'lootLuck', 0.1); mulD(s, 'physique', 0.9); return s; }, mods: {} },
  ];
  SP.Assassin = [
    { id: 'ombre', name: 'Ombre', desc: '+12 % dégâts d\'ombre, +5 % d\'esquive, Pas de l\'ombre −30 % de recharge (rembourse la moitié sur kill). Débloque Double d\'ombre.', unlockLevel: 15, flags: ['umbra'], skillId: 'assassin_double', stats(s) { mulD(s, 'ombre', 1.12); add(s, 'dodge', 0.05); return s; }, mods: { assassin_pas_ombre: { cd: 0.7 } } },
    { id: 'venimeux', name: 'Venimeux', desc: '+25 % de dégâts de poison, les Entailles empoisonnent (5 charges). Débloque Lames de venin.', unlockLevel: 15, flags: ['venom'], skillId: 'assassin_lames_venin', stats(s) { mulD(s, 'poison', 1.25); return s; }, mods: {} },
  ];
  SP.Archer = [
    { id: 'tireur_elite', name: 'Tireur d\'élite', desc: 'Crit +6 %, dégâts critiques +25 %, le tir chargé perce tout. Débloque Tir de précision.', unlockLevel: 15, flags: ['sniper'], skillId: 'archer_tir_precis', stats(s) { add(s, 'crit', 0.06); add(s, 'critDmg', 0.25); return s; }, mods: {} },
    { id: 'traqueur', name: 'Traqueur', desc: '+15 % de vitesse, un piège gratuit toutes les 10 s, pièges −25 % de recharge. Débloque Faucon de chasse.', unlockLevel: 15, flags: ['trapper'], skillId: 'archer_faucon', stats(s) { mul(s, 'vitesse', 1.15); return s; }, mods: { archer_piege: { cd: 0.75 } } },
  ];
  SP.Paladin = [
    { id: 'protecteur', name: 'Protecteur', desc: '+30 % de défense, boucliers +50 %, Verdict +15 % de soin. Débloque Phalange sacrée.', unlockLevel: 15, flags: ['guardian'], skillId: 'paladin_phalange', stats(s) { mul(s, 'defense', 1.3); return s; }, mods: {} },
    { id: 'croise', name: 'Croisé', desc: '+25 % de dégâts sacrés, jugements brûlants, Coup de masse +20 %. Débloque Châtiment divin.', unlockLevel: 15, flags: ['crusader'], skillId: 'paladin_chatiment_divin', stats(s) { mulD(s, 'sacre', 1.25); return s; }, mods: { paladin_masse: { dmg: 1.2 } } },
  ];
  SP.Elementaliste = [
    { id: 'tempete', name: 'Tempête', desc: 'Foudre +15 %, +2 rebonds partout, la Chaîne étourdit 0,4 s. Débloque Sphère d\'orage.', unlockLevel: 15, flags: ['storm'], skillId: 'elementaliste_sphere', stats(s) { mulD(s, 'foudre', 1.15); return s; }, mods: {} },
    { id: 'cryomancien', name: 'Cryomancien', desc: 'Glace +15 %, gel +0,5 s, éclats +20 % en zone. Débloque Mur de glace.', unlockLevel: 15, flags: ['cryo'], skillId: 'elementaliste_mur_glace', stats(s) { mulD(s, 'glace', 1.15); add(s, 'freezeDur', 0.5); return s; }, mods: {} },
  ];
})();
