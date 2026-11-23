window.G = window.G || {};
/* =====================================================================
 *  Donjon Arena 3D v3 « Éveil » — js/game.js  (moteur de jeu / combat)
 *  ---------------------------------------------------------------
 *  Pivot d'intégration : profil v3, stats (G.Stats), pipeline de dégâts unique,
 *  statuts, G.SkillAPI / G.Combat, ennemis & boss v3 (G.MONSTERS, G.BOSSES,
 *  G.AI, G.BossAttacks), donjons / portails / salles (G.Portals, G.Procgen,
 *  G.RoomTypes), butin, serviteurs, esquive parfaite, charge, combos.
 *  Tout système externe est appelé de façon défensive (il peut manquer).
 * ===================================================================== */
(() => {
  'use strict';

  // ===================================================================
  // 1. OUTILS GÉNÉRAUX
  // ===================================================================
  const HALF = 14;                 // demi-taille d'une salle (contrat)
  const TAU = Math.PI * 2;

  const randint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const choice = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : def);
  function angleNorm(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  const lerpAngle = (a, b, t) => a + angleNorm(b - a) * t;
  const toRad = v => (Math.abs(v) > TAU + 0.01 ? (v * Math.PI) / 180 : v);
  function norm2(x, z) { const l = Math.hypot(x, z); return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: -1 }; }
  function rot2(d, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: d.x * c + d.z * s, z: -d.x * s + d.z * c };
  }
  const easeOutBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rngF = () => (G.rng && G.rng.float ? G.rng.float() : Math.random());
  const rngChance = p => rngF() < p;
  const rngInt = (a, b) => a + Math.floor(rngF() * (b - a + 1));
  const deepClone = o => { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; } };

  const warned = {};
  function safe(obj, fn, args) {
    if (!obj || typeof obj[fn] !== 'function') return undefined;
    try { return obj[fn].apply(obj, args || []); }
    catch (err) { if (!warned[fn]) { warned[fn] = 1; console.warn('[game] erreur dans ' + fn, err); } return undefined; }
  }
  const sfx = n => safe(G.sfx, 'play', [n]);
  const UI = (fn, ...a) => safe(G.UI, fn, a);
  const HUD = (fn, ...a) => safe(G.UI && G.UI.hud, fn, a);

  // --- bus & hooks (comptage des événements pour debug.listEvents) -----
  const evCount = {};
  function emit(name, payload) {
    evCount[name] = (evCount[name] || 0) + 1;
    if (G.bus && G.bus.emit) { try { G.bus.emit(name, payload); } catch (e) { console.error('[game] bus ' + name, e); } }
    return payload;
  }
  function hook(name, value, ctx) {
    if (!G.hooks || !G.hooks.run) return value;
    try { const r = G.hooks.run(name, value, ctx); return r === undefined ? value : r; } catch (e) { return value; }
  }

  // Effets (core.js) : tailles en unités « monde » converties ici
  const textBudget = { n: 40, t: 0 };
  const FX = (fn, ...a) => {
    if (fn === 'text') {
      if (textBudget.n <= 0) return undefined;
      textBudget.n--;
      const p = a[0];
      if (p) a[0] = V3(p.x, (p.y || 0) - 1.5, p.z);
      a[3] = Math.round(22 * num(a[3], 1));
    } else if (fn === 'burst' && a[3] && a[3].size !== undefined) {
      a[3] = Object.assign({}, a[3], { size: a[3].size / 0.16 });
    } else if (fn === 'trail' && a[2] !== undefined) {
      a[2] = a[2] / 0.16;
    }
    return safe(G.fx, fn, a);
  };
  const shake = a => safe(G.core, 'shake', [a]);
  const hitStop = s => safe(G.core, 'hitStop', [s]);
  const toast = t => UI('toast', t);
  const banner = (h, d) => UI('banner', h, d);
  const getScene = () => (G.core && G.core.scene) || null;
  const DATA = () => G.DATA || {};

  function sceneAdd(o) { const s = getScene(); if (s && o) s.add(o); }
  function sceneRemove(o) { if (o && o.parent) o.parent.remove(o); }

  function attachLabel(obj, y, kind) {
    const l = safe(G.labels, 'attach', [obj, y, kind]);
    return {
      set: f => { if (l && typeof l.set === 'function') try { l.set(f); } catch (e) { /* rien */ } },
      setText: t => { if (l && typeof l.setText === 'function') try { l.setText(t); } catch (e) { /* rien */ } },
      remove: () => { if (l && typeof l.remove === 'function') try { l.remove(); } catch (e) { /* rien */ } },
    };
  }

  // ===================================================================
  // 2. ÉLÉMENTS, RANGS, ACCÈS AUX DONNÉES (avec valeurs de secours)
  // ===================================================================
  const ELEMENTS = ['physique', 'feu', 'glace', 'foudre', 'ombre', 'sacre', 'poison'];
  const EL_CSS = { physique: '#ffffff', feu: '#ff9a3c', glace: '#8fe3ff', foudre: '#ffe45c', ombre: '#c08bff', sacre: '#fff3a0', poison: '#8cf06a' };
  const EL_HEX = { physique: 0xeef4ff, feu: 0xff8a2a, glace: 0x9fe6ff, foudre: 0xffe45c, ombre: 0x9a5cff, sacre: 0xfff0a0, poison: 0x7bd14a };
  const EL_NAME = { physique: 'Physique', feu: 'Feu', glace: 'Glace', foudre: 'Foudre', ombre: 'Ombre', sacre: 'Sacré', poison: 'Poison' };
  const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
  const rankIdx = r => Math.max(0, RANK_ORDER.indexOf(r));
  const V2_RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
  const RARITY_HEX = { commun: 0xb8c0cc, rare: 0x3fa9ff, epique: 0xb44dff, legendaire: 0xffb020, mythique: 0xff3d6e, secret: 0x00ffd0 };
  const RARITY_CSS = { commun: '#b8c0cc', rare: '#3fa9ff', epique: '#b44dff', legendaire: '#ffb020', mythique: '#ff3d6e', secret: '#00ffd0' };

  const WEAPON_IDS = ['epee', 'dague', 'feu'];
  const DEFAULT_STATS = {
    epee: { min: 10, max: 14, cd: 0.45, range: 2.2, arc: 120 },
    dague: { min: 2, max: 22, cd: 0.6, speed: 16, pierce: 0 },
    feu: { values: [0, 20], cd: 1.4, radius: 2.2, speed: 11 },
  };
  const DEFAULT_DASH = { cd: 1.4, duration: 0.18, speedMult: 3.2, invuln: 0.3 };

  function parseColor(c, def) {
    if (typeof c === 'number') return c;
    if (typeof c === 'string') { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); if (m) return parseInt(m[1], 16); }
    return def;
  }
  function classIds() {
    const out = [];
    Object.keys(G.CLASSES || {}).forEach(k => out.push(k));
    Object.keys(DATA().CLASSES || {}).forEach(k => { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  function classDef(id) {
    const v3 = G.CLASSES && G.CLASSES[id], v2 = DATA().CLASSES && DATA().CLASSES[id];
    if (!v3 && !v2) { const f = classIds()[0]; if (f && f !== id) return classDef(f); return { id: 'Guerrier', pv: 100, speed: 6, color: 0x3a86ff, bonus: {} }; }
    const d = Object.assign({}, v2 || {}, v3 || {});
    d.id = id; d.color = parseColor(d.color, 0x3a86ff);
    return d;
  }
  function weaponDef(id) { return (DATA().WEAPONS || {})[id] || null; }
  function weaponStats(id, lvl) {
    const w = weaponDef(id);
    let s = null;
    if (w && typeof w.stats === 'function') { try { s = w.stats(lvl); } catch (e) { s = null; } }
    return Object.assign({}, DEFAULT_STATS[id], s || {});
  }
  function weaponMax(id) { const w = weaponDef(id); return num(w && w.maxLevel, 10); }
  function xpFor(n) {
    const X = DATA().XP;
    if (X && typeof X.forLevel === 'function') { try { return Math.max(1, num(X.forLevel(n), 50 + 25 * n)); } catch (e) { /* secours */ } }
    return 50 + 25 * n;
  }
  function maxLevel() { return num((G.Progress && G.Progress.maxLevel) || (DATA().XP && DATA().XP.maxLevel), 30); }
  function pvMaxFor(classId, n) {
    const X = DATA().XP;
    if (X && typeof X.pvMax === 'function' && DATA().CLASSES && DATA().CLASSES[classId]) { try { const v = X.pvMax(classId, n); if (v > 0) return Math.round(v); } catch (e) { /* secours */ } }
    const c = classDef(classId);
    if (c.base && c.base.pv) return Math.round(c.base.pv + num(c.perLevel && c.perLevel.pv, 10) * (n - 1));
    return Math.round(num(c.pv, 100) + 10 * (n - 1));
  }
  function dmgMultFor(n) {
    const X = DATA().XP;
    if (X && typeof X.dmgMult === 'function') { try { const v = X.dmgMult(n); if (v > 0) return v; } catch (e) { /* secours */ } }
    return 1 + 0.05 * (n - 1);
  }
  function bonusMult(v) {
    if (typeof v !== 'number' || !(v > 0)) return 1;
    if (v < 0.5) return 1 + v;
    if (v > 3) return 1 + v / 100;
    return v;
  }
  function dashCfg() { return Object.assign({}, DEFAULT_DASH, DATA().DASH || {}); }
  function superCfg() {
    const S = DATA().SUPER || {};
    return {
      name: S.name || 'Tornade Ultime',
      radius: num(S.radius, 4.5),
      chargePerDamage: num(S.chargePerDamage, 0.8),
      dmg: n => { if (typeof S.dmg === 'function') { try { return num(S.dmg(n), 30 + 5 * n); } catch (e) { /* secours */ } } return 30 + 5 * n; },
    };
  }
  function itemDef(id) { return (DATA().ITEMS || {})[id] || null; }

  const AI_DEFAULTS = {
    melee: { range: 1.2, attackCd: 1.3, speed: 3.2 },
    ranged: { range: 9, attackCd: 2.0, speed: 2.8 },
    charger: { range: 10, attackCd: 2.6, speed: 3.0 },
    swarm: { range: 0.8, attackCd: 0.8, speed: 5.0 },
    caster: { range: 8, attackCd: 2.4, speed: 2.4 },
  };
  function enemyDef(id) {
    const raw = (G.MONSTERS && G.MONSTERS[id]) || (DATA().ENEMIES || {})[id] ||
      { id, name: 'Monstre', model: 'skeleton', ai: 'melee', pv: 30, speed: 3, dmg: 6, xp: 5, gold: [1, 3] };
    let ai = raw.ai, ext = false;
    if (!AI_DEFAULTS[ai]) { if (ai && G.AI && G.AI.has && G.AI.has(ai)) ext = true; else ai = 'melee'; }
    const d = Object.assign({ pv: 30, dmg: 6, xp: 5, gold: [1, 3] }, AI_DEFAULTS[ext ? 'melee' : ai], raw, { ai });
    d.extAI = ext;
    return d;
  }
  function bossDef(id) {
    const raw = (G.BOSSES && G.BOSSES[id]) || (DATA().BOSSES || {})[id] ||
      { id, name: 'Golem', title: 'Gardien du donjon', model: 'golem', pv: 400, speed: 2.4, dmg: 14, xp: 120, gold: 60, attacks: ['rock', 'slam', 'wave'], attackCd: 2.2, phase2At: 0.5 };
    return Object.assign({ pv: 400, speed: 2.4, dmg: 14, xp: 100, gold: 50, attackCd: 2.2, phase2At: 0.5, attacks: ['rock', 'slam'] }, raw);
  }
  const hasMonster = id => !!((G.MONSTERS && G.MONSTERS[id]) || (DATA().ENEMIES || {})[id]);
  const hasBoss = id => !!((G.BOSSES && G.BOSSES[id]) || (DATA().BOSSES || {})[id]);

  const BURST_COLORS = {
    skeleton: 0xf1ece0, archer: 0xf1ece0, slime: 0x6fe36f, bat: 0x8a5cc2, knight: 0xd0d6e0,
    spider: 0x7bd14a, imp: 0xff7a2a, wraith: 0x8fe8ff,
    golem: 0xa08a70, spiderQueen: 0x7bd14a, skeletonKing: 0xf1ece0, frostGiant: 0xbfe8ff, lich: 0xb18cff, demon: 0xff5a2a,
  };
  const BONY = { skeleton: 1, archer: 1, skeletonKing: 1, knight: 1, golem: 1, frostGiant: 1 };
  const BOSS_PROJ = { golem: 'rock', spiderQueen: 'web', skeletonKing: 'bone', frostGiant: 'ice', lich: 'orb', demon: 'flame' };
  const TRAIL_COLORS = {
    dagger: 0xdfe7ef, fireball: 0xff8a2a, fizzle: 0x8a8a8a, arrow: 0xd9c9a8, rock: 0x9b8a74,
    orb: 0xc58cff, ice: 0xaee9ff, web: 0xeeeeee, flame: 0xff6a1a, bone: 0xf1ece0,
  };
  const NATIVE_BOSS_ATK = { rock: 1, slam: 1, wave: 1, summon: 1, charge: 1, spread: 1, nova: 1, rain: 1 };
  // ===================================================================
  // 3. LA FORMULE DE DÉGÂTS — clin d'œil à l'exercice 6
  // ===================================================================
  /**
   * def calcul_degats(force, arme):
   *     degats = random.randint(arme.min, arme.max)   # ou random.choice(arme.values)
   *     return degats * force
   * Ici « force » = multiplicateur du héros (niveau × bonus de classe × Arme Ultime)
   * et « arme » = stats de l'arme. 10 % de chance de coup critique (x1.5).
   * Renvoie { dmg, crit, base }.
   */
  function calcul_degats(force, arme) {
    let base;
    if (arme && Array.isArray(arme.values) && arme.values.length) base = choice(arme.values);   // random.choice([0, 20])
    else {
      const mn = Math.round(num(arme && arme.min, 1)), mx = Math.round(num(arme && arme.max, mn));
      base = randint(Math.min(mn, mx), Math.max(mn, mx));                                       // random.randint(10, 14)
    }
    const critChance = 0.10 + num(arme && arme.crit, 0);
    const crit = base > 0 && Math.random() < critChance;
    let dmg = base * num(force, 1);
    if (crit) dmg *= 1.5;
    return { dmg: base > 0 ? Math.max(1, Math.round(dmg)) : 0, crit, base };
  }

  // ===================================================================
  // 4. ÉTAT GLOBAL + PROFIL v3 / SAUVEGARDE
  // ===================================================================
  let profile = null;
  let run = null;
  let screen = 'title';
  let godMode = false;
  let lastEntry = null;      // {portal} | {v2Index}
  let runCounter = 0;
  let initialized = false;
  let fadeEl = null;
  let clockTime = 0;
  let tmpColor = null, tmpVec = null;
  let slowmo = 0;            // temps réel restant de ralenti (esquive parfaite)
  let savingNow = false;
  // --- Pont réseau (mode en ligne / coop, voir js/net/online.js) ----------------------------------
  // role : null (solo, comportement historique inchangé) | 'host' (simule les ennemis) | 'guest' (ennemis = marionnettes)
  // cb   : rappels fournis par G.Online : hurtRemote(proxy, dmg, o), guestDamage(e, dealt, el, crit), door(), down()
  // remotes() : mandataires des autres joueurs { remote:true, uid, pos:{x,z}, r, dead, face, dir } (lus par l'IA de l'hôte)
  const net = { role: null, cb: {}, seq: 0, aggro: null, remotes: () => [], objs: {}, opened: {}, rec: null };
  // rec : pendant un sort du joueur local en coop, liste des effets visuels (api.vfx) et projectiles créés → rejoués chez les alliés (visuel seul)
  // Objets de salle partagés (coffres, reliquaire, passage secret…) : l'hôte seul les ouvre ; l'état « ouvert »
  // part dans l'instantané (op) et chaque client applique l'ouverture pour lui (butin propre à chaque joueur).
  //   objs[clé]   = { hostUse() (hôte : ouverture demandée par un invité), apply(info) (invité : l'hôte a ouvert) }
  //   opened[clé] = info (1, 'm' pour une mimique…)
  function netResetObjs() { net.objs = {}; net.opened = {}; }
  /** Graine déterministe pour la mise en place d'une salle (hôte et invités tirent les mêmes valeurs) */
  function withSeed(seed, fn) {
    if (!net.role || !G.rng) return fn();
    const orig = G.rng.float, rnd = lcg((Math.floor(num(seed, 1)) >>> 0) ^ 0x5bd1e995);
    G.rng.float = rnd;
    try { return fn(); } finally { G.rng.float = orig; }
  }
  const netCall = (k, ...a) => { const f = net.cb && net.cb[k]; if (typeof f === 'function') { try { return f(...a); } catch (e) { console.warn('[game] net ' + k, e); } } return undefined; };
  /** Cible de l'IA de l'hôte : joueur vivant le plus proche (local ou distant) */
  function netPickAggro(e) {
    const p = run.player;
    let best = p && !p.dead ? p : null, bd = best ? Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) : 1e9;
    const list = net.remotes() || [];
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (!q || q.dead || !q.pos) continue;
      const d = Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best && best !== p ? best : null;
  }
  const tgtP = () => net.aggro || run.player;
  /** Invité : coffre de salle tel que placé par l'hôte (visuel + ouverture demandée à l'hôte) */
  function netGuestChest(x, z) {
    const r = run;
    const c = safe(G.GFX, 'makeChest') || fallbackObj(0xc8902a, 0.5);
    c.position.set(x, 0, z); c.rotation.y = 0;
    r.root.add(c);
    r.chest = c; r.chestState = 'waiting'; r.netChestReq = null;
    FX('ring', V3(x, 0.05, z), 0xffd23f, 2.2, 0.8);
    sfx('spawn');
    net.objs.chest = { apply() { if (run === r && r.chest && r.chestState !== 'done') { r.chestState = 'opening'; resolveChest(true); } } };
  }
  /** Invité : l'hôte a ouvert un objet → on applique l'ouverture chez soi (une seule fois) */
  function netApplyOpen(key, info) {
    if (key in net.opened) return;
    net.opened[key] = info === undefined || info === null ? 1 : info;
    const d = net.objs[key];
    if (d && typeof d.apply === 'function' && !d._applied) { d._applied = true; try { d.apply(net.opened[key]); } catch (e) { console.warn('[game] net obj ' + key, e); } }
  }

  const SYSTEMS = ['Progress', 'Skills', 'Talents', 'Inventory', 'Necro', 'Portals', 'Cosmetics'];
  function ensureAll(p) { SYSTEMS.forEach(s => safe(G[s], 'ensureProfile', [p])); return p; }
  /** Le kit de départ de la classe est utilisable d'emblée (niveau 1 sans dépenser de point) */
  function grantKit(p) {
    const eq = safe(G.Skills, 'equipped', [p]);
    if (!eq || !p.skills || !p.skills.levels) return;
    Object.keys(eq).forEach(sl => {
      const id = eq[sl];
      if (id && (safe(G.Skills, 'levelOf', [p, id]) || 0) < 1) p.skills.levels[id] = 1;
    });
  }

  function defaultProfile(nom, classe) {
    return {
      version: 3,
      nom: nom || 'Héros',
      classe: classe || classIds()[0] || 'Guerrier',
      niveau: 1, xp: 0, gold: 0,
      weapons: { epee: 1, dague: 1, feu: 1 },
      potions: { 'Potion de soin': 2, 'Potion de mana': 1 },
      cleared: {},
      stats: { kills: 0, deaths: 0, bosses: 0, dungeons: 0, secrets: 0, playTime: 0, goldenKills: 0 },
      rank: 'E', rankHistory: [{ rank: 'E', at: Date.now(), how: 'creation' }], trials: {},
      attributes: { force: 0, vitesse: 0, defense: 0, vitalite: 0, intelligence: 0 }, attrPoints: 0,
      titles: [], activeTitle: null, achievements: {},
      awakening: {}, settings: {},
    };
  }
  const V2_CLEARED_MAP = {
    crypte: 'crypte_oubliee', foret: 'foret_murmures', catacombes: 'catacombes_roi',
    glace: 'pics_geles', pics: 'pics_geles', abysse: 'abysse_sans_fond', volcan: 'coeur_volcan',
  };
  const OBJ_FIELDS = ['trials', 'attributes', 'achievements', 'awakening', 'settings'];
  const SYS_FIELDS = ['skills', 'talents', 'inventory', 'army', 'portals'];   // laissés absents : ensureProfile() du système les crée « neufs »
  /** Complète / répare / migre un profil chargé. NE SUPPRIME AUCUN champ inconnu. */
  function normalizeProfile(o) {
    if (!o || typeof o !== 'object' || !o.nom) return null;
    const p = defaultProfile(String(o.nom), o.classe);
    const wasV2 = !(num(o.version, 2) >= 3);
    const handled = { version: 1, nom: 1, classe: 1, niveau: 1, xp: 1, gold: 1, weapons: 1, potions: 1, cleared: 1, stats: 1 };
    Object.keys(o).forEach(k => { if (!handled[k]) p[k] = o[k]; });
    if (!classDefExists(p.classe) && classIds().length) p.classe = classIds()[0];
    p.niveau = clamp(Math.floor(num(o.niveau, 1)), 1, maxLevel());
    p.xp = Math.max(0, num(o.xp, 0));
    p.gold = Math.max(0, Math.floor(num(o.gold, 0)));
    if (o.weapons) WEAPON_IDS.forEach(w => { p.weapons[w] = clamp(Math.floor(num(o.weapons[w], 1)), 1, weaponMax(w)); });
    if (o.potions && typeof o.potions === 'object') {
      p.potions = {};
      Object.keys(Object.assign({ 'Potion de soin': 0, 'Potion de mana': 0 }, o.potions)).forEach(k => {
        p.potions[k] = Math.max(0, Math.floor(num(o.potions[k], 0)));
      });
    }
    p.cleared = (o.cleared && typeof o.cleared === 'object') ? o.cleared : {};
    p.stats = Object.assign({ kills: 0, deaths: 0, bosses: 0, dungeons: 0, secrets: 0, playTime: 0, goldenKills: 0 }, o.stats || {});
    OBJ_FIELDS.forEach(k => { if (!p[k] || typeof p[k] !== 'object' || Array.isArray(p[k])) p[k] = {}; });
    SYS_FIELDS.forEach(k => { if (p[k] !== undefined && (!p[k] || typeof p[k] !== 'object' || Array.isArray(p[k]))) delete p[k]; });
    if (!Array.isArray(p.titles)) p.titles = [];
    if (!Array.isArray(p.rankHistory)) p.rankHistory = [];
    if (typeof p.rank !== 'string' || RANK_ORDER.indexOf(p.rank) < 0) {
      // migration : rang = rang du plus haut donjon v2 terminé
      let best = 'E';
      (DATA().DUNGEONS || []).forEach((d, i) => { if (p.cleared[d.id] && rankIdx(V2_RANKS[i] || 'E') > rankIdx(best)) best = V2_RANKS[i]; });
      p.rank = best;
      p.rankHistory.push({ rank: best, at: Date.now(), how: wasV2 ? 'migration' : 'creation' });
    }
    // migration des ids de donjons v2 -> templates v3 (on garde aussi l'ancienne clé)
    Object.keys(p.cleared).forEach(k => {
      const nk = V2_CLEARED_MAP[k];
      if (nk && G.DUNGEONS && G.DUNGEONS[nk] && !p.cleared[nk]) p.cleared[nk] = p.cleared[k];
    });
    p.version = 3;
    return p;
  }
  function classDefExists(id) { return !!((G.CLASSES && G.CLASSES[id]) || (DATA().CLASSES && DATA().CLASSES[id])); }

  function loadProfile() {
    const p = normalizeProfile(safe(G.save, 'load', []));
    if (p) ensureAll(p);
    return p;
  }
  /** Sauve + notifie (profileChanged). Réentrance protégée. */
  function saveProfile() {
    if (!profile) return;
    safe(G.save, 'save', [profile]);
    if (savingNow) return;
    savingNow = true;
    try { emit('profileChanged', { profile }); } finally { savingNow = false; }
  }
  function saveQuiet() { if (profile) safe(G.save, 'save', [profile]); }
  function necroAllowed(p) {
    const a = (p && p.awakening) || {};
    if (a.won === true || a.necroUnlocked === true) return true;
    return Array.isArray(a.history) && a.history.some(h => h && (h.result === 'won' || h.result === true || h.won === true));
  }

  // ===================================================================
  // 5. ACCÈS AUX DONJONS : VÉRIFICATION DE RANG (aucun contournement)
  // ===================================================================
  function rankMsg(req, cur) { return 'ACCÈS REFUSÉ : RANG ' + req + ' REQUIS. VOTRE RANG ACTUEL EST ' + cur + '.'; }
  function checkRank(p, rank) {
    if (!rank) return { ok: true, reason: '' };
    const cur = (G.Ranks && G.Ranks.current && safe(G.Ranks, 'current', [p])) || p.rank || 'E';
    if (G.Ranks && typeof G.Ranks.canEnter === 'function') {
      const r = safe(G.Ranks, 'canEnter', [p, rank]);
      if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || rankMsg(rank, cur) };
      if (typeof r === 'boolean') return { ok: r, reason: rankMsg(rank, cur) };
    }
    const ok = rankIdx(cur) >= rankIdx(rank);
    return { ok, reason: ok ? '' : rankMsg(rank, cur) };
  }
  /** Vérification complète d'un portail : le rang exigé vient du TEMPLATE (jamais des champs du portail seuls) */
  function checkEntry(portal) {
    if (!portal || typeof portal !== 'object') return { ok: false, reason: 'Portail invalide.' };
    const tpl = portal.templateId && G.DUNGEONS ? G.DUNGEONS[portal.templateId] : null;
    const v2 = !tpl && (DATA().DUNGEONS || []).some(d => d && (d.id === portal.templateId || d.id === portal.id));
    if (!tpl && !v2) return { ok: false, reason: 'Portail invalide : donjon introuvable.' };
    const portalsOk = G.Portals && typeof G.Portals.canEnter === 'function';
    // une épreuve n'est valable que si elle figure réellement dans la liste de portails du profil
    let isTrial = false;
    if (portal.type === 'epreuve' && G.Portals && typeof G.Portals.list === 'function') {
      const lst = safe(G.Portals, 'list', [profile]) || [];
      isTrial = lst.some(x => x && x.id === portal.id && x.type === 'epreuve' && x.templateId === portal.templateId);
    }
    const checked = portal.type === 'epreuve' && !isTrial ? Object.assign({}, portal, { type: 'normal' }) : portal;
    if (portalsOk) {
      const res = safe(G.Portals, 'canEnter', [profile, checked]);
      if (res && res.ok === false) return { ok: false, reason: res.reason || 'Portail inaccessible.' };
      // G.Portals gère l'exception « épreuve » (rang visé = rang suivant) : on ne re-vérifie pas le rang brut
      if (isTrial) return { ok: !!(res && res.ok), reason: (res && res.reason) || 'Épreuve non débloquée.' };
    }
    // rang exigé = le plus élevé entre le template et le portail
    const order = (G.Ranks && G.Ranks.order) || RANK_ORDER;
    let req = (tpl && tpl.rank) || portal.rank || 'E';
    if (portal.rank && order.indexOf(portal.rank) > order.indexOf(req)) req = portal.rank;
    const rk = checkRank(profile, req);
    if (!rk.ok) return rk;
    return { ok: true, reason: '' };
  }
  function denyEntry(reason) {
    sfx('error');
    toast(reason);
    banner('<b>' + reason + '</b>', 3);
  }

  // ===================================================================
  // 6. ÉCRANS / NAVIGATION (callbacks G.UI.on)
  // ===================================================================
  function showScreen(id) { screen = id; UI('showScreen', id); }
  function goHub() {
    if (!profile) { UI('renderTitle', false); showScreen('title'); return; }
    UI('renderHub', profile);
    showScreen('hub');
    UI('refreshCamp');
  }
  function findDungeonIndex(id) {
    const list = DATA().DUNGEONS || [];
    let i = list.findIndex(d => d && d.id === id);
    if (i < 0 && typeof id === 'string' && /^\d+$/.test(id)) i = list.findIndex(d => d && String(d.id) === id);
    if (i < 0 && typeof id === 'number' && list[id]) i = id;
    if (i < 0 && typeof id === 'string' && /^\d+$/.test(id) && list[+id]) i = +id;
    return i;
  }

  const callbacks = {
    newGame(nom, classId, extra) {
      safe(G.sfx, 'unlock');
      const ids = classIds();
      const cls = ids.includes(classId) ? classId : ids[0];
      const aw = extra && extra.awakening;
      const won = !!(aw && aw.won);
      if (cls === 'Necromancien' && !won) { sfx('error'); toast('Classe secrète : non obtenue.'); return; }
      const n = String(nom || '').trim().slice(0, 16) || 'Héros';
      profile = defaultProfile(n, cls);
      if (aw) {
        profile.awakening = {
          rolls: aw.rolled ? 1 : 0, crystals: 0,
          history: aw.rolled ? [{ at: Date.now(), result: won ? 'won' : 'lost' }] : [],
        };
        if (won) { profile.awakening.won = true; profile.awakening.necroUnlocked = true; }
      }
      ensureAll(profile);
      grantKit(profile);
      saveProfile();
      sfx('click');
      goHub();
    },
    continueGame() {
      safe(G.sfx, 'unlock');
      if (!profile) profile = loadProfile();
      sfx('click');
      goHub();
    },
    /** Mode v2 « liste de 6 donjons » */
    enterDungeon(id) {
      safe(G.sfx, 'unlock');
      if (!profile) return;
      const idx = findDungeonIndex(id);
      const d = (DATA().DUNGEONS || [])[idx];
      if (!d) { sfx('error'); toast('Donjon introuvable'); return; }
      const req = num(d.levelRequired, 1);
      if (profile.niveau < req) { sfx('error'); toast('Niveau ' + req + ' requis !'); return; }
      if (G.Ranks) {
        const rk = checkRank(profile, V2_RANKS[idx] || 'E');
        if (!rk.ok) { denyEntry(rk.reason); return; }
      }
      sfx('click');
      startRun(convertV2(d, idx), null, { v2Index: idx });
    },
    enterPortal(portal) { return enterPortal(portal); },
    upgrade(weaponId) {
      if (!profile) return;
      const w = weaponDef(weaponId);
      if (!w) { sfx('error'); return; }
      const lvl = profile.weapons[weaponId] || 1;
      if (lvl >= weaponMax(weaponId)) { sfx('error'); toast(w.name + ' est déjà au niveau maximum'); return; }
      let cost = 0;
      try { cost = Number(w.cost(lvl)); } catch (e) { cost = 100 * lvl; }
      if (!isFinite(cost)) { sfx('error'); toast(w.name + ' est déjà au niveau maximum'); return; }
      cost = Math.max(0, Math.floor(cost));
      if (profile.gold < cost) { sfx('error'); toast("Pas assez d'or (" + cost + ' requis)'); return; }
      profile.gold -= cost;
      profile.weapons[weaponId] = lvl + 1;
      const perk = w.perks && w.perks[lvl + 1];
      sfx('upgrade');
      toast(w.name + ' niveau ' + (lvl + 1) + ' !' + (perk ? ' ' + perk : ''));
      saveProfile();
      UI('renderForge', profile);
    },
    buy(itemId) {
      if (!profile) return;
      const it = itemDef(itemId);
      if (!it) { sfx('error'); return; }
      const price = Math.max(0, Math.floor(num(it.price, 20)));
      if (profile.gold < price) { sfx('error'); toast("Pas assez d'or"); return; }
      profile.gold -= price;
      profile.potions[itemId] = (profile.potions[itemId] || 0) + 1;
      sfx('gold');
      toast((it.icon || '') + ' ' + itemId + ' achetée !');
      saveProfile();
      UI('renderHub', profile);
    },
    backToHub() {
      if (run && !run.finished && !canLeaveRun()) return;
      if (run) abandonRun();
      setPaused(false);
      sfx('click');
      goHub();
    },
    restartDungeon() {
      if (run && !run.finished && !canLeaveRun()) return;
      const entry = lastEntry;
      if (run) abandonRun();
      setPaused(false);
      if (!profile || !entry) { goHub(); return; }
      if (entry.portal) enterPortal(entry.portal);
      else if (entry.v2Index >= 0) callbacks.enterDungeon(entry.v2Index);
      else goHub();
    },
    quitDungeon() {
      if (run && !run.finished && !canLeaveRun()) return;
      if (run) abandonRun();
      setPaused(false);
      goHub();
    },
    resetSave() {
      if (run) cleanupRun();
      safe(G.save, 'clear');
      profile = null;
      UI('renderTitle', false);
      showScreen('title');
    },
    resume() { setPaused(false); },
  };
  /** Portail « rouge » : sortie verrouillée tant que le boss n'est pas vaincu */
  function canLeaveRun() {
    const r = run;
    if (!r || !r.dungeon.exitLocked || r.player.dead || r.ended) return true;
    sfx('error'); toast('Sortie verrouillée : vaincs le boss pour quitter !');
    return false;
  }

  function registerCallbacks() {
    if (!G.UI) G.UI = {};
    G.UI.on = G.UI.on || {};
    Object.assign(G.UI.on, callbacks);
  }
  // --- Pause --------------------------------------------------------
  function setPaused(b) {
    const v = !!b && !!run && screen === 'game';
    if (G.core) G.core.paused = v && !net.role;       // coop : le menu s'affiche mais le monde partagé continue
    UI('setPaused', v);
  }
  function togglePause() {
    if (screen !== 'game' || !run || run.modal || run.finished) return;
    sfx('click');
    setPaused(!(G.core && G.core.paused));
  }

  // --- Fondu au noir (élément DOM piloté par la boucle, pas de setTimeout) ---
  function ensureFadeEl() {
    if (fadeEl || typeof document === 'undefined' || !document.body) return fadeEl;
    fadeEl = document.createElement('div');
    fadeEl.id = 'game-fade';
    const st = fadeEl.style;
    st.position = 'fixed'; st.left = '0'; st.top = '0'; st.right = '0'; st.bottom = '0';
    st.background = '#05030c'; st.opacity = '0'; st.pointerEvents = 'none'; st.zIndex = '40';
    document.body.appendChild(fadeEl);
    return fadeEl;
  }
  let lastFade = -1;
  function setFadeOpacity(a) {
    const el = ensureFadeEl();
    if (!el) return;
    const v = Math.round(a * 100) / 100;
    if (v !== lastFade) { lastFade = v; el.style.opacity = String(v); }
  }

  // ===================================================================
  // 7. TIMERS DE PARTIE (remplacent setTimeout, meurent avec le run)
  // ===================================================================
  /** roomScoped = supprimé au changement de salle. every>0 = répétitif (times fois, ou sans fin si times absent) */
  function addTimer(sec, fn, roomScoped, every, times) {
    if (!run) return null;
    const t = { t: sec, fn, room: !!roomScoped, every: every || 0, left: times > 0 ? times : (every ? Infinity : 1), cancelled: false, cancel() { t.cancelled = true; } };
    run.timers.push(t);
    return t;
  }
  function updateTimers(dt) {
    const r = run;
    if (!r.timers.length) return;
    let due = null;
    for (let i = 0; i < r.timers.length; i++) {
      const t = r.timers[i];
      if (t.cancelled) continue;
      t.t -= dt;
      if (t.t <= 0) (due || (due = [])).push(t);
    }
    if (!due) { if (r.timers.some(t => t.cancelled)) r.timers = r.timers.filter(t => !t.cancelled); return; }
    for (const t of due) {
      if (run !== r) return;
      if (t.every) { t.left--; if (t.left > 0) t.t += t.every; else t.cancelled = true; }
      else t.cancelled = true;
      try { t.fn(); } catch (e) { console.warn('[game] timer', e); }
    }
    if (run === r) r.timers = r.timers.filter(t => !t.cancelled);
  }
  // ===================================================================
  // 7. COLLISIONS (cercle contre boîtes, ligne de visée)
  // ===================================================================
  function collideCircle(p, r, obs) {
    let hit = false;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (!o) continue;
      const cx = clamp(p.x, o.x - o.hw, o.x + o.hw), cz = clamp(p.z, o.z - o.hd, o.z + o.hd);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d);
      } else {
        // centre à l'intérieur : on sort par le côté le plus proche
        const px = o.hw - Math.abs(p.x - o.x), pz = o.hd - Math.abs(p.z - o.z);
        if (px < pz) p.x = o.x + (p.x >= o.x ? 1 : -1) * (o.hw + r);
        else p.z = o.z + (p.z >= o.z ? 1 : -1) * (o.hd + r);
      }
    }
    return hit;
  }
  function pointBlocked(x, z, m) {
    const obs = run ? run.obstacles : [];
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o && Math.abs(x - o.x) < o.hw + m && Math.abs(z - o.z) < o.hd + m) return true;
    }
    return false;
  }
  function segmentBlocked(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (pointBlocked(ax + (bx - ax) * t, az + (bz - az) * t, 0.05)) return true;
    }
    return false;
  }
  /** Garde une entité dans la salle ; le joueur peut passer la porte si elle est ouverte */
  function clampRoom(pos, r, isPlayer) {
    const lim = HALF - r;
    pos.x = clamp(pos.x, -lim, lim);
    if (pos.z > lim) pos.z = lim;
    let minZ = -lim;
    if (isPlayer && run && run.doorOpen) {
      const dob = run.room && run.room.door && run.room.door.obstacle;
      const gap = Math.max(0.6, (dob ? dob.hw : 1.6) - r * 0.6);
      if (Math.abs(pos.x - (dob ? dob.x : 0)) < gap) minZ = -HALF - 3;
    }
    if (pos.z < minZ) pos.z = minZ;
  }

  // ===================================================================
  // 8. MATÉRIAUX (flash blanc quand touché)
  // ===================================================================
  const seenMats = new WeakSet();
  /** Prépare le flash d'un modèle ; clone les matériaux s'ils sont partagés entre instances */
  function prepareFlash(group) {
    const ud = group.userData || (group.userData = {});
    let mats = Array.isArray(ud.mats) ? ud.mats.filter(m => m && m.emissive) : [];
    if (!mats.length) {
      group.traverse(o => {
        if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.emissive && o.material.side !== THREE.BackSide && !mats.includes(o.material)) mats.push(o.material);
      });
    }
    let clones = null;
    if (mats.some(m => seenMats.has(m))) {
      const map = new Map();
      mats = mats.map(m => { const c = m.clone(); if (c.userData) { delete c.userData.shared; } map.set(m, c); return c; });
      clones = mats.slice();
      group.traverse(o => {
        if (!o.material) return;
        if (Array.isArray(o.material)) o.material = o.material.map(m => map.get(m) || m);
        else if (map.has(o.material)) o.material = map.get(o.material);
      });
      if (Array.isArray(ud.mats)) ud.mats = ud.mats.map(m => map.get(m) || m);
      if (Array.isArray(ud.eyes)) ud.eyes = ud.eyes.map(m => map.get(m) || m);
    }
    mats.forEach(m => seenMats.add(m));
    return { mats, base: mats.map(m => m.emissive.clone()), active: false, clones };
  }
  /** Libère les matériaux clonés par prepareFlash (instances retirées de la scène) */
  function disposeFlash(fl) {
    if (!fl || !fl.clones) return;
    fl.clones.forEach(m => { try { m.dispose(); } catch (e) { /* rien */ } });
    fl.clones = null;
  }
  function applyFlash(fl, color, k) {
    if (!fl || !fl.mats.length) return;
    if (k <= 0.001) {
      if (fl.active) { fl.mats.forEach((m, i) => m.emissive.copy(fl.base[i])); fl.active = false; }
      return;
    }
    if (!tmpColor) tmpColor = new THREE.Color();
    tmpColor.setHex(color);
    fl.mats.forEach((m, i) => m.emissive.copy(fl.base[i]).lerp(tmpColor, clamp(k, 0, 1)));
    fl.active = true;
  }
  /** Change la couleur « au repos » d'un matériau qui peut flasher (lueur d'arme, yeux…) */
  function setBaseEmissive(fl, mat, hex) {
    if (!mat || !mat.emissive) return;
    mat.emissive.setHex(hex);
    if (fl) { const i = fl.mats.indexOf(mat); if (i >= 0) fl.base[i].setHex(hex); }
  }

  // ===================================================================
  // 9. FABRIQUES D'OBJETS 3D (avec secours si G.GFX manque une fonction)
  // ===================================================================
  function fallbackObj(color, r) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(r || 0.3, 8, 6), new THREE.MeshLambertMaterial({ color: color || 0xffffff }));
    m.position.y = r || 0.3;
    g.add(m);
    g.userData = { mats: [m.material], height: 1.6, radius: 0.5 };
    return g;
  }
  function makeProjectileMesh(type) {
    return safe(G.GFX, 'makeProjectile', [type]) || fallbackObj(TRAIL_COLORS[type] || 0xffffff, 0.25);
  }
  function makePickupMesh(type) {
    return safe(G.GFX, 'makePickup', [type]) || fallbackObj(type === 'gold' ? 0xffd23f : type === 'heart' ? 0xff4060 : 0x6fe3ff, 0.22);
  }
  /** Télégraphe enveloppé dans un Group (échelle / rotation indépendantes de l'orientation interne du mesh) */
  function makeTele(kind, size) {
    const g = new THREE.Group();
    let m = safe(G.GFX, 'makeTelegraph', [kind, size]);
    if (!m) {
      const geo = kind === 'line' ? new THREE.PlaneGeometry(0.8, size) : kind === 'ring' ? new THREE.RingGeometry(size * 0.85, size, 32) : new THREE.CircleGeometry(size, 32);
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05;
    }
    g.add(m);
    g.userData.mesh = m;
    g.userData.setProgress = k => {
      if (m.userData && typeof m.userData.setProgress === 'function') { try { m.userData.setProgress(clamp(k, 0, 1)); } catch (e) { /* rien */ } }
    };
    if (run && run.root) run.root.add(g);
    return g;
  }
  /**
   * Place un télégraphe « ligne » de (x,z) vers dir sur len.
   * Le contrat ne dit pas si la ligne est centrée ou part de l'origine : on mesure
   * son étendue locale une fois (Box3) pour la caler correctement.
   */
  function placeLine(tele, x, z, dir, len) {
    const ud = tele.userData;
    if (ud.axis === undefined) {
      ud.axis = 'z'; ud.min = -len / 2;
      try {
        tele.position.set(0, 0, 0); tele.rotation.set(0, 0, 0); tele.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(ud.mesh);
        const ex = box.max.x - box.min.x, ez = box.max.z - box.min.z;
        if (isFinite(ex) && isFinite(ez)) {
          if (ex > ez * 2) { ud.axis = 'x'; ud.min = box.min.x; } else { ud.axis = 'z'; ud.min = box.min.z; }
        }
      } catch (e) { /* valeurs par défaut */ }
    }
    const off = -ud.min;
    tele.position.set(x + dir.x * off, 0, z + dir.z * off);
    tele.rotation.y = ud.axis === 'x' ? Math.atan2(-dir.z, dir.x) : Math.atan2(dir.x, dir.z);
  }
  function removeTele(t) { if (t) sceneRemove(t); }

  function fallbackRoom() {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ color: 0x4d5c7a }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);
    const door = { x: 0, z: -HALF - 0.5, hw: 1.6, hd: 0.5 };
    const obstacles = [
      { x: -8.3, z: -HALF - 0.5, hw: 6.7, hd: 0.5 }, { x: 8.3, z: -HALF - 0.5, hw: 6.7, hd: 0.5 }, door,
      { x: 0, z: HALF + 0.5, hw: HALF + 1, hd: 0.5 }, { x: -HALF - 0.5, z: 0, hw: 0.5, hd: HALF + 1 }, { x: HALF + 0.5, z: 0, hw: 0.5, hd: HALF + 1 },
    ];
    const spawnPoints = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; spawnPoints.push([Math.sin(a) * 9, Math.cos(a) * 9 - 2]); }
    return { group: g, obstacles, door: { obstacle: door }, setDoorOpen() {}, hazards: [], spawnPoints, playerStart: [0, HALF - 3], chestPos: [0, -4], update() {} };
  }
  function normalizeRoom(room) {
    if (!room || !room.group) room = fallbackRoom();
    if (!Array.isArray(room.obstacles)) room.obstacles = [];
    if (!Array.isArray(room.hazards)) room.hazards = [];
    if (!Array.isArray(room.spawnPoints) || !room.spawnPoints.length) room.spawnPoints = fallbackRoom().spawnPoints;
    if (!Array.isArray(room.playerStart)) room.playerStart = [0, HALF - 3];
    if (!Array.isArray(room.chestPos)) room.chestPos = [0, -3];
    if (!room.door) room.door = { obstacle: null };
    if (typeof room.setDoorOpen !== 'function') room.setDoorOpen = () => {};
    return room;
  }

  // ===================================================================
  // 9. DONJONS : construction (portail / Procgen / v2), lancement, fin
  // ===================================================================
  function convertV2(d, idx) {
    return {
      id: d.id, templateId: d.id, name: d.name, icon: d.icon, desc: d.desc, rank: V2_RANKS[idx] || 'E', theme: d.theme,
      modifiers: [], mechanics: [], rooms: d.rooms || [], reward: d.reward || {}, v2: true,
    };
  }
  function lcg(seed) { let s = (Math.floor(num(seed, 1)) >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  /** Secours si G.Procgen est absent : donjon simple à partir d'un modèle G.DUNGEONS */
  function fallbackDungeon(tpl, portal) {
    const rnd = lcg(portal && portal.seed);
    const t = (G.DungeonsMeta && G.DungeonsMeta.resolve && safe(G.DungeonsMeta, 'resolve', [tpl, hasMonster, hasBoss])) || tpl;
    const mons = (t.monsters || []).filter(hasMonster);
    const elites = (t.elites || []).filter(hasMonster);
    const minis = (t.minibosses || []).filter(hasBoss);
    if (!mons.length) mons.push('skeleton');
    const rg = t.rooms || { min: 4, max: 5 };
    const n = clamp(rg.min + Math.floor(rnd() * (rg.max - rg.min + 1)), 3, 9);
    const ri = rankIdx(t.rank);
    const layouts = ['arena', 'pillars', 'cross'];
    const mkWaves = (k, elite) => {
      const w = [];
      for (let i = 0; i < k; i++) {
        const g = [{ type: mons[Math.floor(rnd() * mons.length)], count: 2 + Math.floor(rnd() * 2) + Math.min(3, ri) }];
        if (elite && i === k - 1 && elites.length) g.push({ type: elites[Math.floor(rnd() * elites.length)], count: 1, elite: true });
        w.push(g);
      }
      return w;
    };
    const rooms = [];
    for (let i = 0; i < n - 1; i++) {
      const type = (i === n - 2 && n >= 5 && minis.length) ? 'miniboss' : (i > 0 && i % 3 === 0) ? 'elite' : 'combat';
      const rd = { type, layout: layouts[Math.floor(rnd() * 3)], seed: Math.floor(rnd() * 1e6), waves: type === 'miniboss' ? [] : mkWaves(2 + (rnd() < 0.5 ? 1 : 0), type === 'elite'), data: {} };
      if (type === 'miniboss') rd.boss = minis[Math.floor(rnd() * minis.length)];
      if (i === 1) rd.chest = true;
      rooms.push(rd);
    }
    rooms.push({ type: 'boss', layout: 'boss', boss: t.boss, waves: [], data: {} });
    const rw = t.rewards || {};
    return {
      id: t.id, templateId: t.id, name: t.name, icon: t.icon, desc: t.desc, rank: t.rank, theme: t.theme, tint: t.tint, element: t.element,
      modifiers: (portal && portal.modifiers) || [], mechanics: t.mechanics || [], rooms,
      reward: { gold: Array.isArray(rw.gold) ? randint(rw.gold[0], rw.gold[1]) : num(rw.gold, 100), xp: num(rw.xp, 100) },
    };
  }
  function buildDungeonFor(portal) {
    let d = null;
    if (G.Portals && typeof G.Portals.buildDungeon === 'function') d = safe(G.Portals, 'buildDungeon', [portal]);
    const tid = portal.templateId;
    let tpl = tid && G.DUNGEONS && G.DUNGEONS[tid];
    if ((!d || !d.rooms || !d.rooms.length) && tpl) {
      const rt = (G.DungeonsMeta && safe(G.DungeonsMeta, 'resolve', [tpl, hasMonster, hasBoss])) || tpl;
      d = null;
      if (G.Procgen && typeof G.Procgen.generate === 'function') d = safe(G.Procgen, 'generate', [rt, { rank: portal.rank, seed: portal.seed, modifiers: portal.modifiers }]);
      if (!d || !d.rooms || !d.rooms.length) d = fallbackDungeon(tpl, portal);
    }
    if (!d || !d.rooms || !d.rooms.length) {
      const list = DATA().DUNGEONS || [];
      const idx = list.findIndex(x => x && (x.id === tid || x.id === portal.id));
      if (idx >= 0) d = convertV2(list[idx], idx);
    }
    if (!d || !d.rooms || !d.rooms.length) return null;
    if (!d.rank) d.rank = portal.rank;
    return d;
  }
  function enterPortalInternal(portal, force) {
    if (!profile || !portal) return false;
    safe(G.sfx, 'unlock');
    if (!force) { const chk = checkEntry(portal); if (!chk.ok) { denyEntry(chk.reason); return false; } }
    const dungeon = buildDungeonFor(portal);
    if (!dungeon) { sfx('error'); toast('Donjon introuvable'); return false; }
    sfx('click');
    return startRun(dungeon, portal, {});
  }
  function enterPortal(portal) { return enterPortalInternal(portal, false); }

  // --- contraintes & mécaniques ----------------------------------------
  function gatherMechanics(dungeon) {
    const set = {};
    const add = x => { const id = x && typeof x === 'object' ? x.id : x; if (typeof id === 'string') set[id] = true; };
    (dungeon.mechanics || []).forEach(add);
    (dungeon.modifiers || []).forEach(add);
    const tpl = dungeon.templateId && G.DUNGEONS && G.DUNGEONS[dungeon.templateId];
    if (tpl) (tpl.mechanics || []).forEach(add);
    return set;
  }
  function gatherConstraints(dungeon, portal, mech) {
    const c = Object.assign({}, dungeon.constraints || {}, (portal && portal.constraints) || {});
    if (portal && portal.flags) {
      if (portal.flags.noPotions) c.noPotions = true;
      if (portal.flags.noDash) c.noDash = true;
      if (portal.flags.timeLimit && !c.timeLimit) c.timeLimit = portal.flags.timeLimit;
      if (portal.flags.maxHits && c.maxHits == null) c.maxHits = portal.flags.maxHits;
    }
    if (mech.pas_de_potions) c.noPotions = true;
    if (mech.pas_de_roulade) c.noDash = true;
    if (mech.chrono && !c.timeLimit) c.timeLimit = 300;
    if (mech.une_vie) { c.noHealDrops = true; c.oneLife = true; }
    return c;
  }

  function startRun(dungeon, portal, meta) {
    if (!dungeon || !profile) return false;
    if (run) cleanupRun();
    if (typeof THREE === 'undefined') { console.error('[game] THREE absent'); return false; }
    if (!tmpVec) tmpVec = new THREE.Vector3();
    meta = meta || {};
    if (portal) lastEntry = { portal }; else lastEntry = { v2Index: meta.v2Index != null ? meta.v2Index : -1 };
    runCounter++;
    const mech = gatherMechanics(dungeon);
    const rank = dungeon.rank || (portal && portal.rank) || 'E';
    run = {
      id: runCounter, dungeon, dungeonIndex: meta.v2Index != null ? meta.v2Index : -1, dungeonId: dungeon.id !== undefined ? dungeon.id : dungeon.templateId,
      portal: portal || null, rank, modifiers: (dungeon.modifiers || []).slice(), mech, constraints: gatherConstraints(dungeon, portal, mech),
      rooms: (dungeon.rooms || []).slice(), nextBranch: null,
      roomIndex: -1, roomData: null, roomKind: 'combat', roomTime: 0, room: null, root: null, obstacles: [], rt: null, rtCtx: null,
      persist: new THREE.Group(), runMark: idMark(), minionGrave: [],
      time: 0, kills: 0, xpGained: 0, goldGained: 0, levelBefore: profile.niveau, loot: [], materials: {},
      player: null, enemies: [], projectiles: [], pickups: [], strikes: [], shocks: [], corpses: [], puddles: [], gas: [], aoes: [], timers: [], minions: [], buffs: {},
      waveIndex: -1, waveDelay: 0, pendingSpawns: 0, roomState: 'fight', isBoss: false, bossRoom: false,
      chest: null, chestState: null, doorOpen: false, survive: null, surviveDone: false, mechT: {},
      boss: null, bossIntro: null, ultimate: false,
      modal: false, transition: false, finished: false, ended: null, endReason: null,
      fade: { a: 1, target: 0, cb: null },
      hudCache: {}, trailT: 0, frame: 0, targets: [], tdirty: true, hookOff: [],
      stats: { time: 0, kills: 0, damageDealt: 0, damageTaken: 0, bossKilled: 0, secretsFound: 0, deaths: 0, potionsUsed: 0, hitsTaken: 0, dashesUsed: 0 },
    };
    run.scaleKey = rankIdx(rank);
    sceneAdd(run.persist);
    createPlayer();
    setPaused(false);
    showScreen('game');
    HUD('setDungeonName', (dungeon.icon ? dungeon.icon + ' ' : '') + (dungeon.name || 'Donjon'));
    emit('runStart', { run, dungeon, portal: portal || null });
    if (G.UI && G.UI.hud && typeof G.UI.hud.setResource === 'function' && G.Skills && typeof G.Skills.resource === 'function') HUD('setResource', safe(G.Skills, 'resource'));   // HUD ressource secondaire (agent 4 : se met à jour seul sur 'resourceChanged')
    startRoom(0);
    banner('<b>' + (dungeon.icon || '') + ' ' + (dungeon.name || 'Donjon') + '</b>' + (dungeon.desc ? '<br><small>' + dungeon.desc + '</small>' : ''), 2.2);
    return true;
  }

  function abandonRun() {
    const r = run;
    if (!r) return;
    if (!r.finished) {
      collectAllPickups();
      applyLossPenalty(r);
      r.endReason = 'abandon';
      r.stats.time = Math.round(r.time * 10) / 10; r.stats.kills = r.kills;
      profile.stats.playTime = (profile.stats.playTime || 0) + r.time;
      emit('runEnd', { run: r, victory: false, stats: r.stats, portal: r.portal, dungeon: r.dungeon, reason: 'abandon' });
      saveProfile();
    }
    cleanupRun();
  }
  function applyLossPenalty(r) {
    const goldLost = Math.min(profile.gold, Math.floor(r.goldGained * 0.5));
    profile.gold -= goldLost; r.goldGained -= goldLost;
    const xpLost = Math.floor(r.xpGained * 0.5);
    profile.xp = Math.max(0, profile.xp - xpLost);
    r.xpGained -= xpLost;
  }
  function constraintsViolated(r) {
    const c = r.constraints || {}, s = r.stats;
    return (c.noPotions && s.potionsUsed > 0) || (c.noDash && s.dashesUsed > 0) || (c.maxHits != null && s.hitsTaken > c.maxHits) || (c.timeLimit && r.time > c.timeLimit);
  }
  function rewardNum(v, def) { return Array.isArray(v) ? randint(num(v[0], 0), num(v[1], num(v[0], 0))) : Math.round(num(v, def)); }

  function failRun(reason, msg) {
    const r = run;
    if (!r || r.ended || r.finished) return;
    if (net.role === 'guest' && reason !== 'net') return;      // coop : seul l'hôte décide d'une défaite commune
    r.ended = 'defeat'; r.endReason = reason;
    if (r.player) { r.player.invuln = 99; if (r.player.aim) r.player.aim.visible = false; }
    banner('<b>' + msg + '</b>', 2);
    sfx('defeat');
    addTimer(1.6, () => finishRun(false, reason));
  }

  function finishRun(victory, reason) {
    const r = run;
    if (!r || r.finished) return;
    collectAllPickups();
    const d = r.dungeon, p = r.player;
    const idx = r.dungeonIndex;
    const pvFrac = p ? p.pv / p.pvMax : 0;
    let stars = [false, false, false], firstClear = false, newBest = false;
    r.stats.time = Math.round(r.time * 10) / 10; r.stats.kills = r.kills;
    r.stats.deaths = p && p.dead ? 1 : 0;
    r.finished = true;
    r.endReason = reason || (victory ? 'victoire' : 'defaite');
    if (victory) {
      const rw = d.reward || d.rewards || {};
      const g = hook('goldGain', Math.round(rewardNum(rw.gold, 0) * (r.stats0 || 1)), { run: r, source: 'reward' });
      const x = hook('xpGain', rewardNum(rw.xp, 0), { run: r, source: 'reward' });
      if (g > 0) addGold(Math.round(g), true);
      if (x > 0) gainXP(Math.round(x));
      if (d.trialRewards && !constraintsViolated(r)) {
        if (d.trialRewards.gold) addGold(Math.round(d.trialRewards.gold), true);
        if (d.trialRewards.xp) gainXP(Math.round(d.trialRewards.xp));
      }
      const gu = rw.guaranteed || [];
      if (gu.length) dropEntries(gu.map(e => (typeof e === 'string' ? { id: e, kind: 'auto' } : e)), p ? p.pos.x : 0, p ? p.pos.z : 0, { source: 'reward' });
      collectAllPickups();
      let limit = d.parTime || (idx >= 0 ? 180 + 60 * idx : 60 + 90 * r.rooms.length);
      const S = DATA().STARS;
      if (idx >= 0 && S && typeof S.timeLimit === 'function') { try { limit = num(S.timeLimit(idx), limit); } catch (e) { /* secours */ } }
      stars = [true, pvFrac > 0.5, r.time < limit];
      const key = d.templateId !== undefined ? d.templateId : (d.id !== undefined ? d.id : idx);
      const prev = profile.cleared[key];
      firstClear = !prev;
      newBest = !prev || !(prev.best > 0) || r.time < prev.best;
      const oldStars = (prev && Array.isArray(prev.stars)) ? prev.stars : [false, false, false];
      profile.cleared[key] = { stars: stars.map((s, i) => !!(s || oldStars[i])), best: newBest ? Math.round(r.time * 10) / 10 : prev.best };
      if (d.v2 && d.id !== key) profile.cleared[d.id] = profile.cleared[key];
      profile.stats.dungeons = (profile.stats.dungeons || 0) + 1;
    } else if (!r.netNoPenalty) {      // coop : pas de pénalité si l'hôte a disparu
      applyLossPenalty(r);
    }
    profile.stats.playTime = (profile.stats.playTime || 0) + r.time;
    profile.stats.secrets = (profile.stats.secrets || 0) + (r.stats.secretsFound || 0);
    const data = {
      victory: !!victory, dungeonName: d.name || 'Donjon', time: Math.round(r.time), kills: r.kills,
      xpGained: Math.max(0, Math.round(r.xpGained)), goldGained: Math.max(0, Math.round(r.goldGained)),
      levelBefore: r.levelBefore, levelAfter: profile.niveau, stars, firstClear, newBest,
      reason: r.endReason, rank: r.rank, loot: r.loot.slice(), materials: Object.assign({}, r.materials), stats: Object.assign({}, r.stats),
    };
    if (G.core) G.core.paused = false;
    UI('setPaused', false);
    setFadeOpacity(0);
    HUD('setBoss', null, 0);
    if (p && p.aim) p.aim.visible = false;
    safe(G.VFX, 'clear');
    // runEnd AVANT la sauvegarde : G.Progress / G.Portals mettent à jour le profil (promotion d'épreuve, portails…)
    emit('runEnd', { run: r, victory: !!victory, stats: r.stats, portal: r.portal, dungeon: d, reason: r.endReason });
    saveProfile();
    screen = 'results';
    UI('results', data);
    // donjon caché (portail « double ») proposé après le boss
    if (victory && d.hidden && d.hidden.rooms && d.hidden.rooms.length && G.UI && typeof G.UI.choice === 'function') {
      const rid = r.id, portal = r.portal;
      const pr = safe(G.UI, 'choice', [{ title: 'Une seconde faille s\'ouvre…', options: [{ label: 'Entrer', desc: d.hidden.name || 'Donjon caché', value: 'go', icon: '🌀' }, { label: 'Ignorer', desc: 'Retourner au camp', value: 'no', icon: '🏕️' }] }]);
      if (pr && pr.then) pr.then(v => { if (v === 'go' && run && run.id === rid && screen === 'results') { cleanupRun(); startRun(d.hidden, portal, {}); } }, () => {});
    }
  }

  /** Retire tout ce qui appartient au run (meshes, labels, timers, hooks) */
  function cleanupRun() {
    const r = run;
    if (!r) return;
    cleanupRoom();
    r.minions.forEach(m => removeMinion(m, true));
    r.minions = [];
    if (r.player) { r.player.label.remove(); }
    sceneRemove(r.persist);
    // libère le héros, les serviteurs et tout ce qui a été créé pour ce run (hors ressources partagées / encore dans la scène)
    try {
      const geos = new Set(), mats = new Set();
      [r.persist].concat(r.minionGrave || []).forEach(t => collectTree(t, r.runMark, geos, mats));
      const sc = G.core && G.core.scene;
      if (sc) usedIn(sc, geos, mats, x => { geos.delete(x); mats.delete(x); });
      geos.forEach(g => { try { g.dispose(); } catch (e) { /* rien */ } });
      mats.forEach(m => { try { m.dispose(); } catch (e) { /* rien */ } });
    } catch (e) { /* rien */ }
    r.timers = [];
    (r.hookOff || []).forEach(f => { if (typeof f === 'function') try { f(); } catch (e) { /* rien */ } });
    r.hookOff = [];
    r.buffs = {};
    run = null;
    cineKill();
    slowmo = 0;
    safe(G.fx, 'clear');
    safe(G.labels, 'clear');
    safe(G.VFX, 'clear');
    if (G.core) { G.core.paused = false; G.core.camZoom = 1; G.core.timeScale = 1; }
    UI('setPaused', false);
    HUD('setBoss', null, 0);
    setFadeOpacity(0);
  }

  // ===================================================================
  // 10. SALLES
  // ===================================================================
  function rtCtx(r) { return { run: r, room: r.roomData, api: G.SkillAPI, ui: G.UI, game: G.game, data: (r.roomData && r.roomData.data) || {} }; }
  // Libère la mémoire GPU d'une salle quittée : uniquement les géométries/matériaux CRÉÉS pendant
  // cette salle (id > repère pris au début de la salle), non partagés et plus utilisés par la scène.
  function idMark() {
    let g = 0, m = 0;
    try { const pg = new THREE.BufferGeometry(); g = pg.id; pg.dispose(); } catch (e) { /* rien */ }
    try { const pm = new THREE.MeshBasicMaterial(); m = pm.id; pm.dispose(); } catch (e) { /* rien */ }
    return { g, m };
  }
  // Libération différée d'une salle : les ressources créées pendant la salle N sont candidates ;
  // si la salle N+1 les réutilise (caches partagés de graphics.js…), elles sont marquées partagées
  // et conservées ; sinon elles sont libérées au nettoyage de la salle N+1.
  const pendingDispose = { geos: new Set(), mats: new Set() };
  function collectTree(obj, mark, geos, mats) {
    if (!obj || !obj.traverse || !mark) return;
    obj.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (g && g.id > mark.g && !(g.userData && g.userData.shared)) geos.add(g);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (m && m.id > mark.m && !(m.userData && m.userData.shared)) mats.add(m);
      });
    });
  }
  function usedIn(obj, geos, mats, cb) {
    if (!obj || !obj.traverse) return;
    obj.traverse(o => {
      if (!o.isMesh) return;
      if (geos.has(o.geometry)) cb(o.geometry, 'g');
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (mats.has(m)) cb(m, 'm'); });
    });
  }
  function disposeRoomResources(trees, mark, final) {
    const curG = new Set(), curM = new Set();
    trees.forEach(t => collectTree(t, mark, curG, curM));
    const P = pendingDispose;
    // ce qui, de la salle précédente, est réutilisé maintenant → partagé
    trees.forEach(t => usedIn(t, P.geos, P.mats, (x) => { x.userData = x.userData || {}; x.userData.shared = true; P.geos.delete(x); P.mats.delete(x); }));
    // ce qui est encore dans la scène (héros, serviteurs, pools d'effets) n'est jamais libéré
    const sc = G.core && G.core.scene;
    const inScene = (set) => { if (sc) usedIn(sc, set, set, x => set.delete(x)); };
    inScene(P.geos); inScene(P.mats);
    P.geos.forEach(g => { try { g.dispose(); } catch (e) { /* rien */ } });
    P.mats.forEach(m => { try { m.dispose(); } catch (e) { /* rien */ } });
    P.geos = curG; P.mats = curM;
    if (final) { inScene(P.geos); inScene(P.mats); P.geos.clear(); P.mats.clear(); }
  }
  function cleanupRoom() {
    const r = run;
    if (!r) return;
    if (r.rt && typeof r.rt.end === 'function') { try { r.rt.end(rtCtx(r)); } catch (e) { console.warn('[game] RoomType.end', e); } }
    r.rt = null;
    r.enemies.forEach(e => { e.label.remove(); disposeFlash(e.flash); });
    r.corpses.forEach(c => { disposeFlash(c.flash); sceneRemove(c.mesh); (r.graveyard = r.graveyard || []).push(c.mesh); });
    r.enemies = []; r.projectiles = []; r.pickups = []; r.strikes = []; r.shocks = []; r.corpses = []; r.puddles = []; r.aoes = []; r.targets = []; r.tdirty = true;
    r.gas.forEach(g => { if (g.mesh) sceneRemove(g.mesh); }); r.gas = [];
    r.timers = r.timers.filter(t => !t.room);
    r.pendingSpawns = 0;
    r.boss = null; r.bossIntro = null; cineKill(); r.chest = null; r.chestState = null; r.doorOpen = false; r.survive = null;
    if (r.room) sceneRemove(r.room.group);
    if (r.root) sceneRemove(r.root);
    if (r.room && typeof r.room.dispose === 'function') { try { r.room.dispose(); } catch (e) { console.warn('[game] room.dispose', e); } }
    // après le retrait de la scène : libérer ce qui a été créé pour cette salle (le reste de la scène est préservé)
    // inclut les ennemis morts retirés de la scène pendant la salle (sinon leurs matériaux/géométries fuient)
    const grave = r.graveyard || []; r.graveyard = [];
    disposeRoomResources([r.room && r.room.group, r.root].concat(grave).filter(Boolean), r.idMark, false);
    r.room = null; r.root = null; r.obstacles = [];
    r.minions.forEach(m => { removeMinion(m, true); });
    r.minions = [];
    safe(G.VFX, 'clear');
    HUD('setBoss', null, 0);
    r.hudCache.boss = undefined;
  }

  const ROOM_LABEL = { combat: 'Salle', elite: "Salle d'élite", miniboss: 'Mini-boss', boss: 'Salle du boss', chest: 'Salle au trésor', treasure: 'Trésor', trap: 'Salle piégée', event: 'Événement', secret: 'Salle secrète', shrine: 'Sanctuaire', choice: 'Carrefour' };
  function roomKindOf(rd) {
    const t = rd.type || (rd.boss || rd.layout === 'boss' ? 'boss' : (rd.chest && !(rd.waves && rd.waves.length) ? 'chest' : 'combat'));
    rd.type = t;
    return t;
  }

  function startRoom(index) {
    const r = run;
    cleanupRoom();
    const rooms = r.rooms;
    while (rooms[index] && rooms[index].hidden && !rooms[index]._revealed) index++;
    if (index >= rooms.length) { finishRun(true); return; }
    const rd = rooms[index] || { layout: 'arena', waves: [] };
    const type = roomKindOf(rd);
    r.roomIndex = index; r.roomData = rd; r.roomTime = 0;
    netResetObjs(); r.netChestReq = null;
    const isFinalBoss = type === 'boss';
    r.isBoss = isFinalBoss;
    r.bossRoom = isFinalBoss || type === 'miniboss';
    let themeId = rd.theme || r.dungeon.theme || (r.dungeon.templateId && G.DUNGEONS && G.DUNGEONS[r.dungeon.templateId] && G.DUNGEONS[r.dungeon.templateId].theme) || 'crypte';
    r.idMark = idMark();
    const bopts = { half: HALF, layout: rd.layout || (isFinalBoss ? 'boss' : 'arena'), seed: num(rd.seed, (r.dungeonIndex + 1) * 101 + index * 17 + 3), roomType: rd.type, variant: rd.variant };
    let built = safe(G.GFX, 'buildRoom', [themeId, bopts]);
    if (!(built && built.group) && themeId !== 'crypte') {      // secours v2 : thème v5 absent ou en erreur
      themeId = 'crypte';
      built = safe(G.GFX, 'buildRoom', [themeId, Object.assign({}, bopts, { variant: undefined })]);
    }
    const room = normalizeRoom(built);      // lights / flicker / anchors / dispose (v5) restent sur l'objet : lus par G.Horror
    r.room = room;
    r.obstacles = room.obstacles;
    sceneAdd(room.group);
    r.root = new THREE.Group();
    sceneAdd(r.root);
    const th = G.GFX && G.GFX.THEMES && (G.GFX.THEMES[themeId] || G.GFX.THEMES.crypte);
    if (th) {
      safe(G.core, 'setTheme', [th]);      // gère aussi hemiIntensity / sunIntensity (thèmes sombres)
    }
    r.themeId = themeId;
    const p = r.player;
    p.pos.set(room.playerStart[0], 0, room.playerStart[1]);
    p.face = { x: 0, z: -1 }; p.dashT = 0; p.hero.rotation.y = Math.PI;
    if (G.core && G.core.camFocus) G.core.camFocus.set(p.pos.x, 0, p.pos.z);

    r.waveIndex = -1; r.waveDelay = 0.9; r.pendingSpawns = 0;
    r.roomState = 'fight';
    if (type === 'chest') rd.chest = true;
    r.chestState = rd.chest ? 'none' : null;
    r.transition = false;
    r.hudCache.objective = undefined;
    r.survive = null;
    const sv = r.constraints.survive;
    if (sv && !r.surviveDone && (type === 'combat' || type === 'elite') && !isFinalBoss) r.survive = { t: 0, need: num(sv.seconds, 60), endless: sv.endless !== false };
    const rn = rd.name || (ROOM_LABEL[type] || 'Salle');
    HUD('setRoom', isFinalBoss ? 'Salle du boss' : (type === 'combat' ? 'Salle ' + (index + 1) + ' / ' + rooms.length : rn + ' ' + (index + 1) + '/' + rooms.length));
    if (G.core) G.core.camZoom = isFinalBoss ? 1.25 : 1;
    r.roomKind = type;

    if (isFinalBoss) startBossIntro(rd.boss, false);
    else if (type === 'miniboss') startBossIntro(rd.boss, true);
    else if (type === 'combat' || type === 'elite' || type === 'chest') {
      if (!(rd.waves && rd.waves.length) && !rd.chest) roomCleared(true);
    } else {
      const rt = G.RoomTypes && G.RoomTypes.get && G.RoomTypes.get(type);
      if (rt) {
        r.roomKind = 'ext'; r.rt = rt;
        // coop : la salle est mise en place chez TOUS les joueurs avec la même graine (mêmes autels, coffres, pièges)
        try { if (typeof rt.start === 'function') withSeed(num(rd.seed, index + 1), () => rt.start(rtCtx(r))); } catch (e) { console.warn('[game] RoomType.start ' + type, e); }
      } else if (rd.waves && rd.waves.length) r.roomKind = 'combat';
      else { r.roomKind = 'combat'; roomCleared(true); }
    }
    emit('roomStart', { run: r, room: rd, index, built: r.room });
  }

  /** Un ennemi bloque la fin de salle sauf s'il est mort, ou si c'est une créature secrète encore pacifique */
  function blocksClear(e) {
    if (!e || e.dead) return false;
    if (e.def && e.def.category === 'secret' && !(e._a && e._a.hostile)) return false;
    return true;
  }
  function roomCleared(silent) {
    const r = run;
    if (r.roomState === 'cleared') return;
    r.roomState = 'cleared';
    r.doorOpen = true;
    const dob = r.room.door && r.room.door.obstacle;
    if (dob) { const i = r.obstacles.indexOf(dob); if (i >= 0) r.obstacles.splice(i, 1); }
    safe(r.room, 'setDoorOpen', [true]);
    sfx('door');
    if (r.survive) r.surviveDone = true;
    if (!silent) banner('Salle nettoyée !<br><small>La porte du nord est ouverte</small>', 1.6);
    emit('roomCleared', { run: r, room: r.roomData, index: r.roomIndex });
  }

  function nextRoomIndex(r) {
    let next = r.roomIndex + 1;
    const nb = r.nextBranch;
    if (nb) {
      r.nextBranch = null;
      let list = null, replace = false;
      if (Array.isArray(nb)) list = nb;
      else if (nb.rooms && Array.isArray(nb.rooms)) { list = nb.rooms; replace = !!nb.replace; }
      else if (typeof nb === 'object') list = [nb];
      if (list && list.length) { if (replace) r.rooms.length = next; r.rooms.splice(next, 0, ...list); }
    }
    return next;
  }

  /** Déroulement d'une salle : vagues → coffre → porte → salle suivante */
  function updateRoomFlow(dt) {
    const r = run, p = r.player, rd = r.roomData || {};
    if (r.ended) return;
    r.roomTime += dt;
    if (net.role === 'guest') {      // invité : vagues, coffres et fin de salle décidés par l'hôte ; la porte demande le changement
      // salles spéciales : animations, pièges et objets utilisables tournent aussi chez l'invité (fin de salle = hôte)
      if (r.roomKind === 'ext' && r.rt && typeof r.rt.update === 'function' && r.roomState !== 'cleared') { try { r.rt.update(dt, rtCtx(r)); } catch (e) { console.warn('[game] RoomType (invité)', e); } if (run !== r) return; }
      // coffre de salle créé par l'instantané de l'hôte : l'invité demande l'ouverture en s'approchant
      if (r.chest && r.chestState === 'waiting' && !p.dead && r.roomTime - (r.netChestReq || -9) > 1.5 && Math.hypot(p.pos.x - r.chest.position.x, p.pos.z - r.chest.position.z) < 2.0) { r.netChestReq = r.roomTime; netCall('objUse', 'chest'); }     // renvoyée toutes les 1,5 s tant que l'hôte n'a pas ouvert
      if (r.roomState === 'cleared' && !r.transition && p.pos.z < -HALF && !p.dead) { r.transition = true; r.netDoorT = 0; sfx('door'); netCall('door'); }
      else if (r.transition && r.netDoorT != null && (r.netDoorT += dt) > 4) { r.transition = false; r.netDoorT = null; }     // pas de réponse : on peut réessayer
      return;
    }
    if (r.roomState === 'fight') {
      if (r.roomKind === 'ext') {
        const rt = r.rt;
        try {
          if (rt && typeof rt.update === 'function') rt.update(dt, rtCtx(r));
          if (run !== r) return;
          const done = rt && typeof rt.isCleared === 'function' ? rt.isCleared(rtCtx(r)) : !r.enemies.some(blocksClear);
          if (done && r.roomState === 'fight') roomCleared();
        } catch (e) { console.warn('[game] RoomType', e); roomCleared(true); }
      } else if (r.roomKind === 'boss' || r.roomKind === 'miniboss') {
        /* géré par bossDefeated */
      } else {
        const waves = rd.waves || [];
        const alive = r.pendingSpawns > 0 || r.enemies.some(e => e.fromWave && blocksClear(e));
        if (r.survive) {
          r.survive.t += dt;
          if (r.survive.t >= r.survive.need) {
            r.enemies.forEach(e => { if (!e.dead && e.fromWave) dealDamage(e, e.pv + 1, { source: 'system', canCrit: false, noCharge: true }); });
            r.timers = r.timers.filter(t => !t.room); r.pendingSpawns = 0;
            roomCleared();
            return;
          }
        }
        if (alive) return;
        if (r.waveIndex + 1 < waves.length) {
          r.waveDelay -= dt;
          if (r.waveDelay <= 0) { spawnWave(r.waveIndex + 1); r.waveDelay = 1.3; }
        } else if (r.survive && waves.length) {
          r.waveDelay -= dt;
          if (r.waveDelay <= 0) { spawnWave(waves.length - 1 - (r.waveIndex % 2 ? 1 : 0)); r.waveDelay = 1.0; }
        } else if (rd.chest && r.chestState === 'none') {
          spawnChest();
        } else if (r.chestState !== 'waiting' && r.chestState !== 'opening') {
          roomCleared();
        }
      }
    } else if (r.roomState === 'chest') {
      if (r.chestState === 'waiting' && r.chest && !p.dead) {
        const d = Math.hypot(p.pos.x - r.chest.position.x, p.pos.z - r.chest.position.z);
        if (d < 2.0) openChestGame();
      } else if (r.chestState === 'done') {
        roomCleared();
      }
    } else if (r.roomState === 'cleared') {
      if (!r.transition && p.pos.z < -HALF && !p.dead) {
        r.transition = true;
        sfx('door');
        fadeTo(() => {
          collectAllPickups();
          const next = nextRoomIndex(r);
          if (next < r.rooms.length) startRoom(next);
          else finishRun(true);
        });
      }
    }
  }
  function fadeTo(cb) { run.fade.target = 1; run.fade.cb = cb; }
  function updateFade(dt) {
    const f = run.fade;
    const sp = dt / 0.35;
    if (f.a < f.target) f.a = Math.min(f.target, f.a + sp);
    else if (f.a > f.target) f.a = Math.max(f.target, f.a - sp);
    setFadeOpacity(f.a);
    if (f.target === 1 && f.a >= 1) {
      const cb = f.cb; f.cb = null; f.target = 0;
      const r = run;
      if (cb) cb();
      if (run === r) setFadeOpacity(r.fade.a);
    }
  }
  function pickSpawnPoints(n) {
    const r = run, p = r.player;
    let pts = r.room.spawnPoints.filter(s => Math.hypot(s[0] - p.pos.x, s[1] - p.pos.z) > 7);
    if (pts.length < Math.min(3, r.room.spawnPoints.length)) {
      pts = r.room.spawnPoints.slice().sort((a, b) => Math.hypot(b[0] - p.pos.x, b[1] - p.pos.z) - Math.hypot(a[0] - p.pos.x, a[1] - p.pos.z)).slice(0, Math.max(3, Math.ceil(r.room.spawnPoints.length / 2)));
    }
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pts[i]; pts[i] = pts[j]; pts[j] = t; }
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = pts[i % pts.length];
      let x = s[0], z = s[1];
      if (i >= pts.length) {        // plusieurs monstres au même point : petit décalage
        const jx = x + (Math.random() - 0.5) * 1.6, jz = z + (Math.random() - 0.5) * 1.6;
        if (!pointBlocked(jx, jz, 0.5) && Math.abs(jx) < HALF - 1 && Math.abs(jz) < HALF - 1) { x = jx; z = jz; }
      }
      out.push([x, z]);
    }
    return out;
  }

  // ===================================================================
  // 12. JOUEUR : création, stats, dégâts reçus
  // ===================================================================
  function createPlayer() {
    const r = run;
    const cls = profile.classe;
    // Personnalisation (skins) : les systèmes cosmétiques peuvent fournir {color, hair, skin, ...} via le hook 'heroOptions'
    const heroOpts = (G.hooks && G.hooks.run('heroOptions', {}, { profile, classe: cls })) || {};
    const hero = safe(G.GFX, 'makeHero', [cls, heroOpts]) || safe(G.GFX, 'makeHero', ['Guerrier', heroOpts]) || fallbackObj(classDef(cls).color || 0x3a86ff, 0.5);
    if (G.bus) G.bus.emit('heroCreated', { hero, profile, classe: cls });
    r.persist.add(hero);
    const flash = prepareFlash(hero);
    WEAPON_IDS.forEach(w => safe(G.GFX, 'setHeroWeaponLevel', [hero, w, profile.weapons[w] || 1]));
    const ud = hero.userData || {};
    const p = {
      hero, pos: hero.position, r: num(ud.radius, 0.5), height: num(ud.height, 1.8), flash,
      pv: 1, pvMax: 1, mana: 0, manaMax: 0, speed: 6, dmgMult: 1, wmult: {}, w: {}, stats: {},
      cds: { 1: 0, 2: 0, 3: 0, dash: 0 }, cdMax: { 1: 1, 2: 1, 3: 1, dash: 1 },
      face: { x: 0, z: -1 }, holdFaceT: 0, moving: false,
      dashT: 0, dashDir: { x: 0, z: -1 }, dashSpeed: 0, dashPhase: false, dashOnPass: null, dashHit: null, dashInvuln: 0, sinceDash: 99,
      invuln: 0, blinkT: 0, slowT: 0, stunned: 0, perfectCd: 0, dodgeCd: 0, counter: 0,
      superCharge: 0, spinT: 0, attackT: 0, flashK: 0, flashColor: 0xff3030,
      hazardAcc: 0, dead: false, deadT: 0, label: null, aim: null, aimMode: null,
      buffer: null, charging: null, manaAcc: 0, lastCastT: -9, comboStep: -1,
    };
    r.player = p;
    computeStats(p);
    p.pv = p.pvMax; p.mana = p.manaMax;
    p.label = attachLabel(hero, p.height + 0.5, 'player');
    p.label.setText(profile.nom);
    p.label.set(1);
    const aim = safe(G.GFX, 'makeAimIndicator');
    if (aim) { aim.visible = false; r.persist.add(aim); p.aim = aim; }
  }

  function fallbackStats() {
    const cls = classDef(profile.classe), b = cls.base, pl = cls.perLevel || {}, L = profile.niveau;
    const lv = (L - 1);
    let sp = b ? num(b.vitesse, 6) : num(cls.speed, 6);
    if (sp < 3) sp *= 6;
    const dmg = {};
    ELEMENTS.forEach(e => { dmg[e] = 1; });
    return {
      level: L, rank: profile.rank,
      pvMax: pvMaxFor(profile.classe, L),
      manaMax: b ? Math.round(num(b.mana, 100) + num(pl.mana, 0) * lv) : 100,
      manaRegen: 5,
      force: b ? num(b.force, 10) + num(pl.force, 0) * lv : 10,
      intelligence: b ? num(b.intelligence, 10) + num(pl.intelligence, 0) * lv : 10,
      defense: b ? num(b.defense, 0) + num(pl.defense, 0) * lv : 0,
      vitesse: sp, crit: b ? num(b.crit, 0.05) : 0.05, critDmg: b ? num(b.critDmg, 1.5) : 1.5,
      cdr: 0, lifesteal: 0, dodge: 0, dmg, minionDmg: 1, minionPv: 1, minionCap: 0, xpMult: 1, goldMult: 1, lootLuck: 0, pickupRadius: 0,
    };
  }
  function applyRunBuffs(st, r) {
    if (!r) return st;
    for (const id in r.buffs) {
      const b = r.buffs[id], bs = b.stats;
      if (!bs) continue;
      for (const k in bs) {
        const v = bs[k];
        if (k === 'dmg' && v && typeof v === 'object') { st.dmg = st.dmg || {}; for (const el in v) st.dmg[el] = (st.dmg[el] == null ? 1 : st.dmg[el]) + v[el]; }
        else if (typeof v === 'number') {
          if (/Mult$/.test(k)) st[k] = (st[k] == null ? 1 : st[k]) * v;
          else st[k] = (num(st[k], 0)) + v;
        }
      }
    }
    return st;
  }
  /** Stats du héros : G.Stats.compute (déjà passé par le hook 'stats') sinon calcul de secours */
  function computeStats(p) {
    let st = null;
    if (G.Stats && typeof G.Stats.compute === 'function') st = safe(G.Stats, 'compute', [profile, run]);
    if (!st || typeof st !== 'object') st = hook('stats', fallbackStats(), { profile, run });
    st = applyRunBuffs(st, run);
    p.stats = st;
    const ratio = p.pvMax > 0 && p.pv > 0 ? p.pv / p.pvMax : 1;
    const oldMax = p.pvMax;
    p.pvMax = Math.max(1, Math.round(num(st.pvMax, pvMaxFor(profile.classe, profile.niveau))));
    if (oldMax > 1 && p.pvMax !== oldMax && !p.dead) p.pv = clamp(p.pv * (p.pvMax / oldMax), 1, p.pvMax);
    else p.pv = Math.min(p.pv, p.pvMax);
    void ratio;
    const mm = p.manaMax > 0 && p.manaMax !== num(st.manaMax, 0) ? p.mana / p.manaMax : null;
    p.manaMax = Math.max(0, Math.round(num(st.manaMax, 0)));
    if (mm !== null) p.mana = clamp(mm * p.manaMax, 0, p.manaMax); else p.mana = Math.min(p.mana, p.manaMax);
    p.dmgMult = dmgMultFor(profile.niveau);       // kit v2 uniquement
    let sp = num(st.vitesse, 6);
    if (sp < 3) sp *= 6;
    p.speed = sp * Math.max(0, num(st.speedMult, 1));
    const cls = classDef(profile.classe), b = cls.bonus || {};
    WEAPON_IDS.forEach(w => {
      p.wmult[w] = bonusMult(b[w]);
      p.w[w] = weaponStats(w, profile.weapons[w] || 1);
    });
    if (p.label && p.label.set) p.label.set(p.pv / p.pvMax);
  }
  function recomputeStats() { if (run && run.player) computeStats(run.player); }
  function playerForce(wid) {
    const p = run.player;
    return p.dmgMult * (wid ? p.wmult[wid] || 1 : 1) * (run.ultimate ? 1.5 : 1);
  }
  const defenseReduction = st => {
    if (typeof st.damageReduction === 'number') return clamp(st.damageReduction, 0, 0.85);
    const d = Math.max(0, num(st.defense, 0));
    return clamp(d / (d + 100), 0, 0.85);
  };

  function onDodged(opts) {
    const p = run.player;
    if (p.perfectCd <= 0 && p.sinceDash <= 0.2 && p.dashInvuln > 0) {
      p.perfectCd = 1.0; p.counter = 3.5; p.dodgeCd = 0.4;
      slowmo = 0.4;
      if (G.core) G.core.timeScale = 0.35;
      FX('text', V3(p.pos.x, p.height + 0.6, p.pos.z), 'PARFAIT !', '#7ff3ff', 1.5);
      FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0x7ff3ff, 3.2, 0.5);
      FX('burst', V3(p.pos.x, 1, p.pos.z), 0x7ff3ff, 20, { speed: 5, up: 3, life: 0.5, size: 0.15 });
      sfx('upgrade');
      emit('playerParry', { source: opts && opts.source });
      emit('playerDodge', {});
    } else if (p.dodgeCd <= 0) {
      p.dodgeCd = 0.35;
      emit('playerDodge', {});
    }
  }

  function hurtPlayer(dmg, opts) {
    const r = run;
    opts = opts || {};
    if (!r || !r.player) return false;
    if (net.aggro && net.aggro.remote) {      // hôte : l'attaque visait un allié distant → dégâts envoyés à son client
      if (net.aggro.dead || r.finished || r.ended === 'victory' || (r.bossIntro && r.bossIntro.cine)) return false;
      return netCall('hurtRemote', net.aggro, Math.max(0, num(dmg, 1)), opts) !== false;
    }
    const p = r.player;
    if (p.dead || r.finished || r.ended === 'victory') return false;
    if (r.bossIntro && r.bossIntro.cine) return false;      // intouchable pendant l'intro cinématique
    if (!opts.hazard && p.invuln > 0) { if (p.dashInvuln > 0) onDodged(opts); return false; }
    if (godMode) { if (!opts.hazard) { p.invuln = 0.3; FX('text', V3(p.pos.x, p.height + 0.3, p.pos.z), 'Dieu !', '#9ff3ff', 0.8); } return false; }
    const st = p.stats || {};
    if (!opts.hazard && num(st.dodge, 0) > 0 && rngChance(clamp(st.dodge, 0, 0.6))) {
      FX('text', V3(p.pos.x, p.height + 0.4, p.pos.z), 'ESQUIVE', '#9ff3ff', 0.9);
      emit('playerDodge', {});
      return false;
    }
    const element = opts.element || 'physique';
    let d = { amount: Math.max(0, dmg), element, kind: opts.hazard ? 'hazard' : 'hit' };
    d = hook('incomingDamage', d, { target: 'player', source: opts.source, run: r });
    let amount = num(d && d.amount, dmg);
    amount *= 1 - defenseReduction(st);
    amount = Math.max(1, Math.round(amount));
    p.pv -= amount;
    r.stats.damageTaken += amount;
    FX('text', V3(p.pos.x, p.height + 0.2, p.pos.z), '-' + amount, '#ff4d4d', opts.hazard ? 0.8 : 1.1);
    if (!opts.hazard) {
      r.stats.hitsTaken++;
      p.invuln = 0.55; p.blinkT = 0.55; p.flashK = 1; p.flashColor = 0xff2020;
      sfx('hurt'); shake(0.25);
      FX('burst', V3(p.pos.x, 1, p.pos.z), 0xff3040, 8, { speed: 3, up: 2, life: 0.4, size: 0.12 });
    }
    if (opts.slow) p.slowT = Math.max(p.slowT, opts.slow);
    p.label.set(Math.max(0, p.pv) / p.pvMax);
    emit('playerHit', { amount, source: opts.source, element });
    const mh = r.constraints.maxHits;
    if (mh != null && r.stats.hitsTaken > mh && !r.ended) failRun('maxHits', 'Trop de coups encaissés !');
    if (p.pv <= 0) playerDie();
    return true;
  }
  function healPlayer(n, color) {
    const p = run.player;
    const before = p.pv;
    p.pv = Math.min(p.pvMax, p.pv + n);
    const got = Math.round(p.pv - before);
    if (got > 0) FX('text', V3(p.pos.x, p.height + 0.3, p.pos.z), '+' + got, color || '#5dff8a', 1);
    p.label.set(p.pv / p.pvMax);
    return got;
  }
  function playerDie() {
    const r = run, p = r.player;
    if (p.dead) return;
    p.dead = true; p.pv = 0; p.deadT = 0;
    profile.stats.deaths = (profile.stats.deaths || 0) + 1;
    sfx('defeat'); shake(0.7); hitStop(0.15);
    FX('burst', V3(p.pos.x, 1, p.pos.z), 0xff3040, 30, { speed: 5, up: 4, life: 0.9, size: 0.18, gravity: 10 });
    if (p.aim) p.aim.visible = false;
    if (net.role) {       // coop : à terre, un allié peut réanimer ; l'hôte termine si tout le groupe est tombé
      banner('À terre !<br><small>Un allié peut te réanimer</small>', 2);
      netCall('down');
      return;
    }
    banner('Vous êtes tombé…', 1.6);
    r.ended = 'defeat';
    addTimer(1.9, () => finishRun(false, 'mort'));
  }

  // --- Visée -------------------------------------------------------------
  /** Cibles possibles : liste mise en cache par frame (pas d'allocation par appel) */
  function targetables() {
    const r = run;
    if (r.tdirty || r.tframe !== r.frame) {
      r.targets.length = 0;
      if (!r.alive) r.alive = [];
      r.alive.length = 0;
      for (let i = 0; i < r.enemies.length; i++) {
        const e = r.enemies[i];
        if (e.dead) continue;
        r.alive.push(e);
        if (e.spawnT <= 0 && !(e.boss && r.bossIntro) && !e.untargetable) r.targets.push(e);
      }
      r.tdirty = false; r.tframe = r.frame;
    }
    return r.targets;
  }
  function nearestEnemy(x, z, maxD) {
    let best = null, bd = maxD, bestHidden = null, bdh = maxD;
    const list = targetables();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.hidden || e.untargetable) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d > maxD) continue;
      if (!segmentBlocked(x, z, e.pos.x, e.pos.z)) { if (d < bd) { bd = d; best = e; } }
      else if (d < bdh) { bdh = d; bestHidden = e; }
    }
    return best || bestHidden;
  }
  /** Priorité : direction du geste → souris → ennemi le plus proche → regard */
  function aimDirection(data, autoRange) {
    const p = run.player;
    const d = data && data.dir;
    if (d && (Math.abs(d.x) + Math.abs(d.z) > 1e-4)) return norm2(d.x, d.z);
    const inp = G.input;
    if (inp && inp.mouseActive && inp.mouseWorld) {
      const dx = inp.mouseWorld.x - p.pos.x, dz = inp.mouseWorld.z - p.pos.z;
      if (dx * dx + dz * dz > 0.04) return norm2(dx, dz);
    }
    const e = nearestEnemy(p.pos.x, p.pos.z, autoRange || 16);
    if (e) return norm2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    return { x: p.face.x, z: p.face.z };
  }
  function lookAt(dir, hold) {
    const p = run.player;
    p.face = { x: dir.x, z: dir.z };
    p.holdFaceT = hold || 0.3;
    p.hero.rotation.y = Math.atan2(dir.x, dir.z);
  }

  // ===================================================================
  // 13. ACTIONS (input) : G.Skills si présent, sinon kit v2 ; maintien = charge
  // ===================================================================
  const useSkills = () => !!(G.Skills && typeof G.Skills.cast === 'function');
  const CAST_SLOTS = { cast1: 1, cast2: 1, cast3: 1, super: 1 };
  // touches personnalisables : G.Keys (core.js) ; seules les actions de sort se chargent en maintenant la touche
  const SLOT_ACTS = { cast1: 1, cast2: 1, cast3: 1, super: 1 };
  const KEY2SLOT = new Proxy({}, { get: (_, k) => { const a = G.Keys && G.Keys.actionOf ? G.Keys.actionOf(k) : null; return a && SLOT_ACTS[a] ? a : undefined; } });
  const BTN2SLOT = { 'btn-cast1': 'cast1', 'btn-cast2': 'cast2', 'btn-cast3': 'cast3', 'btn-super': 'super' };
  const hold = { cast1: {}, cast2: {}, cast3: {}, super: {} };   // {kdown, ptT0}
  const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  function chargeInfo(slot) { return useSkills() && G.Skills.chargeInfo ? safe(G.Skills, 'chargeInfo', [slot]) : null; }

  function installHoldListeners() {
    if (typeof document === 'undefined') return;
    window.addEventListener('keydown', e => {
      if (e.repeat || !run || screen !== 'game') return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const slot = KEY2SLOT[(e.key || '').toLowerCase()];
      if (slot) { hold[slot].kdown = true; hold[slot].t0 = nowS(); }
    }, true);
    window.addEventListener('keyup', e => {
      const slot = KEY2SLOT[(e.key || '').toLowerCase()];
      if (!slot || !run || !run.player) return;
      const p = run.player;
      if (p.charging && p.charging.slot === slot) releaseCharge();
      hold[slot].kdown = false;
    }, true);
    window.addEventListener('blur', () => { if (run && run.player) run.player.charging = null; });
    document.addEventListener('pointerdown', e => {
      const t = e.target && e.target.closest ? e.target.closest('[id^="btn-"]') : null;
      const slot = t && BTN2SLOT[t.id];
      if (slot) hold[slot].ptT0 = nowS();
    }, true);
  }
  function releaseCharge() {
    const r = run; if (!r || !r.player) return;
    const p = r.player, c = p.charging;
    if (!c) return;
    p.charging = null;
    const charge = clamp((nowS() - c.t0) / Math.max(0.1, c.maxTime), 0, 1);
    if (screen !== 'game' || r.modal || r.ended || p.dead || p.stunned > 0 || (G.core && G.core.paused)) return;
    attemptCast(c.slot, { dir: null, charge });
  }

  function onAction(name, data) {
    if (name === 'pause') { togglePause(); return; }
    const r = run;
    if (screen !== 'game' || !r || r.modal || r.finished || r.ended || r.bossIntro || r.transition) return;
    if (G.core && G.core.paused) return;
    const p = r.player;
    if (p.dead || p.stunned > 0) return;
    data = data || { dir: null };
    if (CAST_SLOTS[name]) {
      const ci = chargeInfo(name);
      const h = hold[name];
      if (ci) {
        if (h.kdown) { h.kdown = false; p.charging = { slot: name, t0: h.t0 || nowS(), maxTime: num(ci.maxTime, 1), full: false }; return; }
        const t0 = h.ptT0 && nowS() - h.ptT0 < 15 ? h.ptT0 : null;
        h.ptT0 = 0;
        const charge = t0 ? clamp((nowS() - t0) / Math.max(0.1, num(ci.maxTime, 1)), 0, 1) : 0;
        data = Object.assign({}, data, { charge });
      } else { h.kdown = false; h.ptT0 = 0; }
      attemptCast(name, data);
      return;
    }
    switch (name) {
      case 'dash': if (castDash(data) === false) p.buffer = { name: 'dash', data, t: 0.15, next: 0 }; break;
      case 'potion1': usePotion('Potion de soin'); break;
      case 'potion2': usePotion('Potion de mana'); break;
      default: break;
    }
  }
  function attemptCast(slot, data) {
    const p = run.player;
    if (tryCast(slot, data) === false) p.buffer = { name: slot, data, t: 0.15, next: 0.05 };
    else p.buffer = null;
  }
  function tryCast(slot, data) {
    const r = run, p = r.player;
    const counter = p.counter > 0;
    r.castCounter = counter;
    let ok;
    if (net.role) net.rec = [];
    try {
      if (useSkills()) ok = G.Skills.cast(slot, data);
      else ok = v2Cast(slot, data);
    } catch (e) { if (!warned.cast) { warned.cast = 1; console.warn('[game] cast', e); } ok = undefined; }
    const rec = net.rec; net.rec = null;
    if (net.role) net.recLate = clockTime + 0.6;      // projectiles lancés après une incantation : encore capturés 0,6 s
    r.castCounter = false;
    if (ok === false) return false;
    if (net.role && run === r) netCall('cast', slot, rec || [], { x: r2(p.face.x), z: r2(p.face.z) });
    p.attackT = 0.25;
    if (counter) {
      p.counter = 0;
      FX('text', V3(p.pos.x, p.height + 0.9, p.pos.z), 'CONTRE x2 !', '#ffd23f', 1.3);
      FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0xffd23f, 2.5, 0.4);
    }
    return true;
  }
  function v2Cast(slot, data) {
    switch (slot) {
      case 'cast1': return castSword(data);
      case 'cast2': return castDagger(data);
      case 'cast3': return castFire(data);
      case 'super': return castSuper(data);
      default: return false;
    }
  }
  /** Recharge du kit v2 (hook skillCooldown + réduction de recharge) */
  function v2Cd(base, skillId, slot) {
    let cd = hook('skillCooldown', base, { skillId, slot });
    cd *= 1 - clamp(num(run.player.stats && run.player.stats.cdr, 0), 0, 0.6);
    return Math.max(0.1, cd);
  }
  function v2Mana(skillId) {
    const c = hook('skillManaCost', 0, { skillId });
    if (c > 0) { const p = run.player; if (p.mana < c) return false; p.mana -= c; }
    return true;
  }

  /** Sort 1 : Coup d'épée */
  function castSword(data) {
    const p = run.player, s = p.w.epee;
    if (p.cds[1] > 0) return false;
    if (!v2Mana('epee')) return false;
    p.cds[1] = p.cdMax[1] = v2Cd(num(s.cd, 0.45), 'epee', 'cast1');
    const range = num(s.range, 2.2), arc = toRad(num(s.arc, 120));
    const dir = aimDirection(data, range + 4);
    lookAt(dir, 0.3);
    p.attackT = 0.25;
    sfx('swing');
    const force = playerForce('epee');
    let hits = 0;
    const list = targetables().slice();
    for (const e of list) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist - e.r > range) continue;
      const ang = Math.atan2(dir.x * dz - dir.z * dx, dir.x * dx + dir.z * dz);
      if (Math.abs(ang) > arc / 2 && dist > e.r + 0.7) continue;
      const res = calcul_degats(force, s);
      damageEnemy(e, res.dmg, { crit: res.crit, kx: dx / (dist || 1), kz: dz / (dist || 1), kb: num(s.knockback, 1.2) * 5, weapon: s, kind: 'melee' });
      hits++;
    }
    const col = run.ultimate ? 0xffd23f : 0xeef4ff;
    for (let i = 0; i <= 8; i++) {
      const d = rot2(dir, -arc / 2 + (arc * i) / 8);
      FX('trail', V3(p.pos.x + d.x * range * 0.85, 1.0, p.pos.z + d.z * range * 0.85), col, 0.35);
    }
    if (hits) { sfx('hit'); hitStop(0.035); shake(0.12); }
    if (s.shockwave) {
      const wr = num(s.waveRange, 7), wk = num(s.waveDmg, 0.6);
      const ox = p.pos.x, oz = p.pos.z;
      for (const e of targetables().slice()) {
        const dx = e.pos.x - ox, dz = e.pos.z - oz;
        const along = dx * dir.x + dz * dir.z;
        const side = Math.abs(dx * dir.z - dz * dir.x);
        if (along < 0 || along > wr + e.r || side > 0.9 + e.r) continue;
        if (segmentBlocked(ox, oz, e.pos.x, e.pos.z)) continue;
        const res = calcul_degats(force * wk, s);
        damageEnemy(e, res.dmg, { crit: res.crit, kx: dir.x, kz: dir.z, kb: 6, kind: 'melee' });
      }
      for (let i = 1; i <= 7; i++) {
        const dd = (wr * i) / 7;
        addTimer(i * 0.035, () => {
          FX('burst', V3(ox + dir.x * dd, 0.1, oz + dir.z * dd), col, 3, { speed: 1.5, up: 3, life: 0.35, size: 0.16 });
          FX('trail', V3(ox + dir.x * dd, 0.2, oz + dir.z * dd), col, 0.4);
        }, true);
      }
      FX('ring', V3(ox + dir.x * 1.2, 0.05, oz + dir.z * 1.2), col, 1.4, 0.3);
    }
    emit('skillCast', { skillId: 'epee', slot: 'cast1' });
    return true;
  }

  /** Sort 2 : Lancer de dague */
  function castDagger(data) {
    const p = run.player, s = p.w.dague;
    if (p.cds[2] > 0) return false;
    if (!v2Mana('dague')) return false;
    p.cds[2] = p.cdMax[2] = v2Cd(num(s.cd, 0.6), 'dague', 'cast2');
    const dir = aimDirection(data, 16);
    lookAt(dir, 0.3);
    p.attackT = 0.2;
    sfx('throw');
    const count = Math.max(1, Math.floor(num(s.count, 1)));
    const spread = count > 1 ? toRad(num(s.spread, 0.26) || 0.26) * (count - 1) : 0;
    const pierce = s.pierce === true ? 99 : Math.max(0, Math.floor(num(s.pierce, 0)));
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
      const d = rot2(dir, a);
      spawnProjectile({
        type: 'dagger', owner: 'player', x: p.pos.x + d.x * 0.6, z: p.pos.z + d.z * 0.6, dir: d,
        speed: num(s.speed, 16), range: num(s.range, 15), weapon: 'dague', stats: s, pierce, radius: 0.32,
      });
    }
    emit('skillCast', { skillId: 'dague', slot: 'cast2' });
    return true;
  }

  /** Sort 3 : Boule de feu */
  function castFire(data) {
    const p = run.player, s = p.w.feu;
    if (p.cds[3] > 0) return false;
    if (!v2Mana('feu')) return false;
    p.cds[3] = p.cdMax[3] = v2Cd(num(s.cd, 1.4), 'feu', 'cast3');
    const dir = aimDirection(data, 15);
    lookAt(dir, 0.35);
    p.attackT = 0.25;
    const count = Math.max(1, Math.floor(num(s.count, 1)));
    const spread = count > 1 ? toRad(num(s.spread, 0.25 * (count - 1))) : 0;
    let anyFire = false;
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
      const d = rot2(dir, a);
      const res = calcul_degats(playerForce('feu'), s);
      if (res.base <= 0) {
        spawnProjectile({ type: 'fizzle', owner: 'player', x: p.pos.x + d.x * 0.6, z: p.pos.z + d.z * 0.6, dir: d, speed: num(s.speed, 11) * 0.6, range: 5, fizzle: true, radius: 0.3 });
      } else {
        anyFire = true;
        spawnProjectile({
          type: 'fireball', owner: 'player', x: p.pos.x + d.x * 0.6, z: p.pos.z + d.z * 0.6, dir: d,
          speed: num(s.speed, 11), range: num(s.range, 14), dmg: res.dmg, crit: res.crit, radius: 0.4, element: 'feu',
          explode: { radius: num(s.radius, 2.2), burn: s.burn, stats: s },
        });
      }
    }
    if (anyFire) sfx('fire');
    else { sfx('fizzle'); FX('text', V3(p.pos.x, p.height + 0.4, p.pos.z), 'Pschitt… 0 !', '#b0b0b0', 0.9); }
    emit('skillCast', { skillId: 'feu', slot: 'cast3' });
    return true;
  }

  /** Super v2 : Tornade Ultime (chargée par les dégâts infligés) */
  function castSuper() {
    const r = run, p = r.player;
    if (p.superCharge < 100) { sfx('error'); toast('Super pas encore chargé'); return true; }
    const S = superCfg();
    p.superCharge = 0;
    p.spinT = 0.7;
    p.invuln = Math.max(p.invuln, 0.7);
    sfx('super'); shake(0.6); hitStop(0.08);
    const dmgBase = Math.round(S.dmg(profile.niveau));
    const force = r.ultimate ? 1.5 : 1;
    for (const e of targetables().slice()) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, dist = Math.hypot(dx, dz);
      if (dist - e.r > S.radius) continue;
      const res = calcul_degats(force, { min: dmgBase, max: dmgBase });
      damageEnemy(e, res.dmg, { crit: res.crit, kx: dx / (dist || 1), kz: dz / (dist || 1), kb: 16, noCharge: true, kind: 'aoe' });
    }
    for (const pr of r.projectiles) {
      if (pr.owner !== 'player' && !pr.dead && Math.hypot(pr.mesh.position.x - p.pos.x, pr.mesh.position.z - p.pos.z) < S.radius) endProjectile(pr, false);
    }
    FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0x9ff3ff, S.radius, 0.6);
    FX('ring', V3(p.pos.x, 0.08, p.pos.z), 0xffffff, S.radius * 0.6, 0.45);
    FX('burst', V3(p.pos.x, 1, p.pos.z), 0x9ff3ff, 40, { speed: 9, up: 4, life: 0.7, size: 0.2 });
    emit('skillCast', { skillId: 'tornade', slot: 'super' });
    return true;
  }

  function dashBlocked() {
    const rules = G.Procgen && G.Procgen.rules ? safe(G.Procgen, 'rules') : null;
    return !!(run.constraints.noDash || (rules && rules.noDash));
  }
  function potionsBlocked() {
    const rules = G.Procgen && G.Procgen.rules ? safe(G.Procgen, 'rules') : null;
    return !!(run.constraints.noPotions || (rules && rules.noPotions));
  }
  /** Démarre un déplacement rapide (roulade ou dash de compétence) */
  function startDash(o) {
    const p = run.player;
    p.dashDir = o.dir; p.dashT = o.duration; p.dashSpeed = o.speed; p.dashPhase = !!o.phase;
    p.dashOnPass = o.onPass || null; p.dashHit = o.onPass ? new Set() : null;
    const inv = num(o.invuln, 0);
    if (inv > 0) { p.invuln = Math.max(p.invuln, inv); p.dashInvuln = inv; }
    p.sinceDash = 0;
    p.face = { x: o.dir.x, z: o.dir.z };
    if (net.role) netCall('act', 'dash', { x: r2(o.dir.x), z: r2(o.dir.z), d: r2(num(o.duration, 0.18)) });
  }
  /** Roulade : rapide, invulnérable ; ≤ 0,2 s avant un coup = esquive parfaite */
  function castDash(data) {
    const p = run.player, D = dashCfg();
    if (dashBlocked()) { sfx('error'); toast('Roulade interdite !'); return true; }
    if (p.cds.dash > 0 || p.dashT > 0) return false;
    let dir = null;
    const d = data && data.dir;
    if (d && (Math.abs(d.x) + Math.abs(d.z) > 1e-4)) dir = norm2(d.x, d.z);
    else if (G.input && G.input.move && Math.hypot(G.input.move.x || 0, G.input.move.z || 0) > 0.2) dir = norm2(G.input.move.x, G.input.move.z);
    else dir = { x: p.face.x, z: p.face.z };
    startDash({ dir, duration: D.duration, speed: p.speed * D.speedMult, invuln: D.invuln });
    p.cds.dash = p.cdMax.dash = v2Cd(D.cd, 'dash', 'dash');
    run.stats.dashesUsed++;
    sfx('dash');
    FX('burst', V3(p.pos.x, 0.2, p.pos.z), 0xd8d0c0, 10, { speed: 3, up: 1.5, life: 0.4, size: 0.18 });
    return true;
  }

  function usePotion(name) {
    const r = run, p = r.player;
    if (potionsBlocked()) { sfx('error'); toast('Potions interdites dans ce donjon !'); return; }
    const count = profile.potions[name] || 0;
    if (count <= 0) { sfx('error'); toast('Plus de ' + name.toLowerCase() + ' !'); return; }
    const it = itemDef(name) || {};
    const v3 = !!G.Stats;
    if (name === 'Potion de soin') {
      if (p.pv >= p.pvMax) { sfx('error'); toast('PV déjà au maximum'); return; }
      healPlayer(Math.max(num(it.heal, 40), v3 ? Math.round(p.pvMax * 0.3) : 0));
      sfx('heal');
      FX('burst', V3(p.pos.x, 1, p.pos.z), 0x5dff8a, 18, { speed: 2, up: 4, life: 0.8, size: 0.16 });
    } else if (useSkills() || v3) {
      if (p.mana >= p.manaMax) { sfx('error'); toast('Mana déjà au maximum'); return; }
      p.mana = Math.min(p.manaMax, p.mana + Math.max(30, p.manaMax * 0.5));
      sfx('heal');
      FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0x4da6ff, 2.5, 0.6);
      FX('burst', V3(p.pos.x, 1, p.pos.z), 0x4da6ff, 18, { speed: 2, up: 4, life: 0.8, size: 0.16 });
      FX('text', V3(p.pos.x, p.height + 0.4, p.pos.z), 'Mana restauré !', '#7fc4ff', 0.9);
    } else {
      p.cds[1] = p.cds[2] = p.cds[3] = 0; p.cds.dash = 0;
      sfx('heal');
      FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0x4da6ff, 2.5, 0.6);
      FX('burst', V3(p.pos.x, 1, p.pos.z), 0x4da6ff, 18, { speed: 2, up: 4, life: 0.8, size: 0.16 });
      FX('text', V3(p.pos.x, p.height + 0.4, p.pos.z), 'Sorts rechargés !', '#7fc4ff', 0.9);
    }
    profile.potions[name] = count - 1;
    r.stats.potionsUsed++;
  }

  function updatePlayer(dt, time) {
    const r = run, p = r.player, hero = p.hero;
    if (p.dead) {
      p.deadT += dt;
      hero.rotation.x = lerp(hero.rotation.x, -Math.PI / 2, 1 - Math.exp(-dt * 8));
      hero.position.y = Math.max(-0.2, hero.position.y - dt * 0.2);
      return;
    }
    ['1', '2', '3', 'dash'].forEach(k => { if (p.cds[k] > 0) p.cds[k] = Math.max(0, p.cds[k] - dt); });
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashInvuln = Math.max(0, p.dashInvuln - dt);
    p.sinceDash += dt;
    p.perfectCd = Math.max(0, p.perfectCd - dt);
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.counter = Math.max(0, p.counter - dt);
    p.blinkT = Math.max(0, p.blinkT - dt);
    p.slowT = Math.max(0, p.slowT - dt);
    p.stunned = Math.max(0, p.stunned - dt);
    p.attackT = Math.max(0, p.attackT - dt);
    p.holdFaceT = Math.max(0, p.holdFaceT - dt);
    p.flashK = Math.max(0, p.flashK - dt * 5);
    // mana
    if (p.manaMax > 0 && p.mana < p.manaMax) p.mana = Math.min(p.manaMax, p.mana + num(p.stats.manaRegen, 3) * dt);
    // tampon d'entrée (0,15 s)
    if (p.buffer) {
      const b = p.buffer;
      b.t -= dt; b.next -= dt;
      if (b.t <= 0) p.buffer = null;
      else if (b.next <= 0 && !p.stunned) {
        b.next = 0.05;
        const ok = b.name === 'dash' ? castDash(b.data) : tryCast(b.name, b.data);
        if (ok !== false) p.buffer = null;
      }
    }
    // charge (maintien)
    if (p.charging) {
      const c = p.charging, k = clamp((nowS() - c.t0) / Math.max(0.1, c.maxTime), 0, 1);
      c.fxT = (c.fxT || 0) - dt;
      if (c.fxT <= 0) {
        c.fxT = 0.08;
        const a = Math.random() * TAU, rad = 1.6 * (1 - k) + 0.4;
        FX('trail', V3(p.pos.x + Math.sin(a) * rad, 0.6 + Math.random(), p.pos.z + Math.cos(a) * rad), k >= 1 ? 0xffd23f : 0x9ff3ff, 0.3);
      }
      if (k >= 1 && !c.full) { c.full = true; FX('text', V3(p.pos.x, p.height + 0.7, p.pos.z), 'MAX !', '#ffd23f', 1.1); FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0xffd23f, 2, 0.4); sfx('pickup'); }
    }
    // déplacement
    const locked = !!(r.bossIntro || r.ended || p.stunned > 0);
    let mx = 0, mz = 0;
    if (!locked && G.input && G.input.move) {
      mx = num(G.input.move.x, 0); mz = num(G.input.move.z, 0);
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
    }
    if (r.transition) { mx = 0; mz = -1; }
    let vx, vz;
    if (p.dashT > 0) {
      p.dashT -= dt;
      vx = p.dashDir.x * p.dashSpeed; vz = p.dashDir.z * p.dashSpeed;
      FX('trail', V3(p.pos.x, 0.6, p.pos.z), 0xcfd8ff, 0.35);
      if (p.dashOnPass) {
        for (const e of targetables()) {
          if (p.dashHit.has(e)) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.r + p.r + 0.3) { p.dashHit.add(e); try { p.dashOnPass(e); } catch (er) { console.warn('[game] onPass', er); } }
        }
      }
      if (p.dashT <= 0) { p.dashOnPass = null; p.dashPhase = false; }
    } else {
      const s = p.speed * (p.slowT > 0 ? 0.6 : 1);
      vx = mx * s; vz = mz * s;
    }
    p.pos.x += vx * dt; p.pos.z += vz * dt;
    collideCircle(p.pos, p.r, r.obstacles);
    clampRoom(p.pos, p.r, true);
    p.pos.y = 0;
    p.moving = Math.hypot(vx, vz) > 0.3;

    const aiming = G.input && G.input.aiming;
    let targetYaw = null;
    if (aiming && aiming.dir && (Math.abs(aiming.dir.x) + Math.abs(aiming.dir.z) > 1e-4)) {
      const d = norm2(aiming.dir.x, aiming.dir.z); targetYaw = Math.atan2(d.x, d.z);
    } else if (p.holdFaceT > 0) {
      targetYaw = Math.atan2(p.face.x, p.face.z);
    } else if (p.moving && p.dashT <= 0) {
      const d = norm2(vx, vz); p.face = d; targetYaw = Math.atan2(d.x, d.z);
    }
    if (p.spinT > 0) {
      p.spinT -= dt;
      hero.rotation.y += dt * 28;
      const a = time * 18;
      for (let i = 0; i < 3; i++) {
        const ang = a + (i * TAU) / 3, rad = superCfg().radius * (0.4 + 0.6 * ((p.spinT * 3) % 1));
        FX('trail', V3(p.pos.x + Math.sin(ang) * rad, 0.5 + i * 0.5, p.pos.z + Math.cos(ang) * rad), 0x9ff3ff, 0.4);
      }
    } else if (targetYaw !== null) {
      hero.rotation.y = lerpAngle(hero.rotation.y, targetYaw, 1 - Math.exp(-dt * 16));
    }

    let inHazard = false;
    for (const h of r.room.hazards) {
      if (h && Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < num(h.r, 1) + p.r * 0.3) { p.hazardAcc += num(h.dps, 5) * dt; inHazard = true; }
    }
    if (!inHazard) p.hazardAcc = Math.min(p.hazardAcc, 0.99);
    if (p.hazardAcc >= 3) { const n = Math.floor(p.hazardAcc); p.hazardAcc -= n; hurtPlayer(n, { hazard: true, source: 'hazard' }); }

    hero.visible = !(p.blinkT > 0 && p.dashT <= 0 && Math.floor(time * 20) % 2 === 0);
    applyFlash(p.flash, p.counter > 0 ? 0xffd23f : p.flashColor, p.counter > 0 ? Math.max(p.flashK, 0.25) : p.flashK);

    if (r.ultimate && hero.userData && hero.userData.blade) {
      r.trailT -= dt;
      if (r.trailT <= 0) {
        r.trailT = 0.06;
        try { hero.userData.blade.getWorldPosition(tmpVec); FX('trail', tmpVec.clone(), 0xffd23f, 0.25); } catch (e) { /* rien */ }
      }
    }
    const ud = hero.userData || {};
    if (typeof ud.animate === 'function') { try { ud.animate(time, { moving: p.moving, windup: 0, attack: p.attackT > 0 ? p.attackT / 0.25 : 0 }); } catch (e) { /* rien */ } }
    else safe(G.GFX, 'animateCharacter', [hero, time, { moving: p.moving, windup: 0, attack: p.attackT > 0 ? p.attackT / 0.25 : 0 }]);
    updateAimIndicator();
  }
  /** Indicateur de visée sous le joueur pendant un glisser depuis un bouton */
  function updateAimIndicator() {
    const p = run.player, aim = p.aim;
    if (!aim) return;
    const a = G.input && G.input.aiming;
    if (!a || !a.dir || p.dead) { aim.visible = false; return; }
    const d = norm2(a.dir.x, a.dir.z);
    let mode = 'line', len = 12;
    if (a.action === 'cast1') { mode = 'cone'; len = num(p.w.epee.range, 2.2); }
    else if (a.action === 'cast2') { mode = 'line'; len = num(p.w.dague.range, 15) * 0.8; }
    else if (a.action === 'cast3') { mode = 'line'; len = 10; }
    else if (a.action === 'super') { mode = 'circle'; len = superCfg().radius; }
    else if (a.action === 'dash') { const D = dashCfg(); mode = 'line'; len = p.speed * D.speedMult * D.duration; }
    const key = mode + len;
    if (p.aimMode !== key) { p.aimMode = key; if (aim.userData && typeof aim.userData.set === 'function') { try { aim.userData.set(mode, len); } catch (e) { /* rien */ } } }
    aim.visible = true;
    aim.position.set(p.pos.x, 0.06, p.pos.z);
    aim.rotation.y = Math.atan2(d.x, d.z);
  }

  // ===================================================================
  // 14. XP / OR / NIVEAUX
  // ===================================================================
  function addGold(n, silent) {
    if (!profile || !(n > 0)) return;
    n = Math.round(n);
    profile.gold += n;
    if (run) run.goldGained += n;
    if (!silent) sfx('gold');
    emit('loot', { gold: n });
  }
  function gainXP(n) {
    if (!profile || !(n > 0)) return;
    profile.xp += n;
    if (run) run.xpGained += n;
    checkLevelUp();
  }
  function checkLevelUp() {
    const oldLevel = profile.niveau;
    while (profile.niveau < maxLevel() && profile.xp >= xpFor(profile.niveau)) {
      profile.xp -= xpFor(profile.niveau);
      profile.niveau++;
    }
    if (profile.niveau >= maxLevel()) profile.xp = Math.min(profile.xp, xpFor(profile.niveau));
    if (profile.niveau > oldLevel) onLevelUp(oldLevel);
  }
  function onLevelUp(oldLevel) {
    const lines = [];
    const n = profile.niveau;
    const oldPv = pvMaxFor(profile.classe, oldLevel), newPv = pvMaxFor(profile.classe, n);
    lines.push('PV max : ' + oldPv + ' → ' + newPv);
    if (!G.Stats) lines.push('Puissance : x' + dmgMultFor(oldLevel).toFixed(2) + ' → x' + dmgMultFor(n).toFixed(2));
    (DATA().DUNGEONS || []).forEach(d => {
      const req = num(d.levelRequired, 1);
      if (!G.Ranks && req > oldLevel && req <= n) lines.push('Nouveau donjon : ' + (d.icon || '') + ' ' + d.name);
    });
    if (run && run.player && !run.player.dead) {
      const p = run.player;
      const before = p.pvMax;
      computeStats(p);
      p.pv = Math.min(p.pvMax, p.pv + (p.pvMax - before) + p.pvMax * 0.35);
      p.label.set(p.pv / p.pvMax);
      FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0xffd23f, 3, 0.8);
      FX('burst', V3(p.pos.x, 1, p.pos.z), 0xffd23f, 30, { speed: 4, up: 6, life: 1, size: 0.18 });
      lines.push('PV restaurés en partie');
    }
    sfx('levelup');
    UI('levelUp', n, lines);
    emit('levelUp', { niveau: n });
  }
  /** Composition d'une vague : ids fournis par procgen en priorité ; id inconnu → G.Monsters.roll(thème) ; + tirage de rare à chaque vague */
  function composeWave(wave) {
    const r = run, list = [];
    const theme = (r.dungeon && r.dungeon.theme) || r.themeId || null;
    const M = G.Monsters;
    wave.forEach(g => {
      if (!g) return;
      let type = g.type;
      if (!hasMonster(type)) {
        let alt = null;
        if (M && typeof M.roll === 'function' && theme) alt = safe(M, 'roll', [theme, { rank: r.rank, kind: g.elite ? 'elite' : 'classique' }]);
        type = alt && hasMonster(alt) ? alt : (hasMonster(type) ? type : 'skeleton');
      }
      for (let i = 0; i < Math.max(0, num(g.count, 1)); i++) list.push({ type, elite: !!g.elite });
    });
    const k = r.roomKind;
    if (list.length && (k === 'combat' || k === 'elite') && !r.survive && M && typeof M.rareRoll === 'function') {
      const rare = safe(M, 'rareRoll', [undefined, theme]);
      if (rare && hasMonster(rare)) list.push({ type: rare, elite: false, rare: true });
    }
    return list;
  }
  function spawnWave(wi) {
    const r = run, waves = (r.roomData && r.roomData.waves) || [];
    const wave = waves[wi] || [];
    r.waveIndex = wi;
    const list = composeWave(wave);
    if (waves.length > 1) banner('Vague ' + (wi + 1) + ' / ' + waves.length, 1.2);
    const pts = pickSpawnPoints(list.length);
    list.forEach((spec, i) => {
      r.pendingSpawns++;
      const pt = pts[i];
      // annonce au sol, puis apparition du monstre
      addTimer(i * 0.16, () => {
        FX('ring', V3(pt[0], 0.05, pt[1]), 0xb46bff, 1.2, 0.6);
        FX('burst', V3(pt[0], 0.3, pt[1]), 0xb46bff, 8, { speed: 2, up: 3, life: 0.5, size: 0.15 });
      }, true);
      addTimer(i * 0.16 + 0.45, () => {
        r.pendingSpawns = Math.max(0, r.pendingSpawns - 1);
        createEnemy(spec.type, pt[0], pt[1], { fromWave: true, elite: spec.elite });
        if (i % 3 === 0) sfx('spawn');
      }, true);
    });
  }

  // --- Coffre piégé (exercice 5) ---------------------------------------
  function spawnChest() {
    const r = run;
    const c = safe(G.GFX, 'makeChest') || fallbackObj(0xc8902a, 0.5);
    c.position.set(r.room.chestPos[0], 0, r.room.chestPos[1]);
    c.rotation.y = 0;
    r.root.add(c);
    r.chest = c; r.chestState = 'waiting'; r.roomState = 'chest';
    if (net.role === 'host') net.objs.chest = { hostUse() { if (run === r && r.chestState === 'waiting') openChestGame(); } };
    FX('burst', V3(c.position.x, 0.6, c.position.z), 0xffd23f, 22, { speed: 4, up: 5, life: 0.8, size: 0.18, gravity: 8 });
    FX('ring', V3(c.position.x, 0.05, c.position.z), 0xffd23f, 2.2, 0.8);
    sfx('spawn');
    banner('Un coffre apparaît…<br><small>Approche-toi pour tenter le code !</small>', 1.8);
  }
  function openChestGame() {
    const r = run;
    if (net.role) { r.chestState = 'opening'; sfx('click'); resolveChest(true); return; }     // coop : pas de mini-jeu bloquant
    r.chestState = 'opening';
    r.modal = true;                // le jeu est figé pendant le mini-jeu
    sfx('click');
    const cfg = (DATA().CHEST) || {};
    const id = r.id;
    const done = res => {
      if (!run || run.id !== id) return;   // le run a changé entre-temps
      run.modal = false;
      resolveChest(!!(res && res.won));
    };
    const pr = safe(G.UI, 'chestGame', [{ min: num(cfg.min, 1), max: num(cfg.max, 20), tries: num(cfg.tries, 3) }]);
    if (pr && typeof pr.then === 'function') pr.then(done, () => done({ won: false }));
    else done({ won: Math.random() < 0.5 });     // UI absente : tirage au sort
  }
  function resolveChest(won) {
    const r = run, cfg = (DATA().CHEST) || {}, idx = r.dungeonIndex;
    safe(G.GFX, 'openChest', [r.chest]);
    const cx = r.chest ? r.chest.position.x : 0, cz = r.chest ? r.chest.position.z : 0;
    if (won) {
      let gold = 40 + 20 * idx, xp = 30 + 15 * idx;
      if (typeof cfg.goldWin === 'function') { try { gold = Math.round(num(cfg.goldWin(idx), gold)); } catch (e) { /* secours */ } }
      if (typeof cfg.xpWin === 'function') { try { xp = Math.round(num(cfg.xpWin(idx), xp)); } catch (e) { /* secours */ } }
      dropLoot(cx, cz, xp, gold, 0, 8);
      activateUltimate();
      sfx('chestOk');
      shake(0.3);
      FX('burst', V3(cx, 1, cz), 0xffd23f, 40, { speed: 6, up: 7, life: 1, size: 0.2, gravity: 10 });
      banner("Bravo ! Vous avez trouvé l'Arme Ultime !<br><small>+50 % de dégâts jusqu'à la fin du donjon</small>", 2.6);
    } else {
      let loss = Math.ceil(r.goldGained * 0.5);
      if (typeof cfg.goldLoss === 'function') { try { loss = Math.round(num(cfg.goldLoss(idx), loss)); } catch (e) { /* secours */ } }
      const lost = Math.max(0, Math.min(profile.gold, loss));
      profile.gold -= lost; r.goldGained -= lost;
      sfx('chestBad');
      shake(0.55);
      FX('burst', V3(cx, 1, cz), 0x5a2a7a, 34, { speed: 5, up: 4, life: 0.9, size: 0.22 });
      if (r.chest) r.chest.userData.chomp = 0.6;
      banner('Le coffre a mangé votre Or !' + (lost > 0 ? '<br><small>-' + lost + ' or</small>' : ''), 2.4);
    }
    r.chestState = 'done';
    if (net.role === 'host') net.opened.chest = 1;
  }
  function activateUltimate() {
    const r = run, p = r.player;
    r.ultimate = true;
    const blade = p.hero.userData && p.hero.userData.blade;
    if (blade && blade.isMesh && blade.material && blade.material.emissive) {
      setBaseEmissive(p.flash, blade.material, 0xffb820);
      if ('emissiveIntensity' in blade.material) blade.material.emissiveIntensity = 1.6;
    }
    FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0xffd23f, 3, 0.8);
  }

  // ===================================================================
  // 15. ENNEMIS : création, pipeline de dégâts, statuts, mort, butin
  // ===================================================================
  function aiDefOf(def) { return def.extAI && G.AI && G.AI.get ? G.AI.get(def.ai) : null; }

  function createEnemy(id, x, z, opts) {
    const r = run;
    opts = opts || {};
    let def = enemyDef(id);
    const rank = opts.rank || r.rank;
    let affixes = opts.affixes || null;
    if (opts.elite && !def.elite && !affixes && G.Monsters && G.Monsters.rollAffixes) {
      const n = safe(G.Monsters, 'affixCountForRank', [rank]);
      affixes = safe(G.Monsters, 'rollAffixes', [rank, n > 0 ? n : 1]) || null;
    }
    def = hook('enemyStats', Object.assign({}, def), { rank, affixes, modifiers: r.modifiers, run: r }) || def;
    if (opts.elite && !def.elite && !(G.Monsters && G.Monsters.makeElite)) {
      def = Object.assign({}, def, { pv: def.pv * 2.4, dmg: def.dmg * 1.3, xp: def.xp * 2.5, gold: Array.isArray(def.gold) ? def.gold.map(v => v * 2) : def.gold * 2, elite: true });
    }
    if (typeof def.ai !== 'string') def.ai = 'melee';
    const elite = !!(def.elite || opts.elite);
    const scale = num(def.scale, elite ? 1.35 : 1);
    let mesh = safe(G.GFX, 'makeEnemy', [def.model, { tint: def.tint === undefined ? null : def.tint, scale }]);
    if (!mesh) mesh = fallbackObj(0xd04040, 0.5);
    let selfScaled = false;
    if (Math.abs(mesh.scale.x - 1) < 1e-3 && Math.abs(scale - 1) > 1e-3) { mesh.scale.setScalar(scale); selfScaled = true; }
    mesh.position.set(x, 0, z);
    r.root.add(mesh);
    const ud = mesh.userData || {};
    const rad = (ud.radius ? ud.radius : 0.5 * (selfScaled ? 1 : scale)) * (selfScaled ? scale : 1);
    const height = num(ud.height, 1.6) * (selfScaled ? scale : 1);
    const ext = !!def.extAI;
    const e = {
      id, def, ai: def.ai, extAI: ext, mesh, pos: mesh.position, r: rad, height, elite, boss: false, rank,
      pv: num(def.pv, 30), pvMax: num(def.pv, 30), speed: num(def.speed, 3), dmg: num(def.dmg, 6),
      attackCd: num(def.attackCd, 1.3), cd: 0.6 + Math.random() * 0.8, contactCd: 0,
      state: def.ai === 'ranged' || def.ai === 'caster' ? 'move' : 'chase', t: 0, tMax: 1,
      fx: 0, fz: 1, kbx: 0, kbz: 0, flashK: 0, flashColor: 0xffffff,
      statuses: {}, speedMult: 1, resist: Object.assign({}, def.resist), weak: Object.assign({}, def.weak), tags: def.tags ? def.tags.slice() : [],
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1 + Math.random() * 2, lastHurt: -99, mcd: 0,
      animOff: Math.random() * 10, spawnT: 0.55, spawnDur: 0.55, baseScale: mesh.scale.x, attack: 0,
      fromWave: !!opts.fromWave, tele: null, castN: 0, wallHit: false, dead: false,
      flash: prepareFlash(mesh),
    };
    if (net.role) {
      e.netId = opts.netId || ('e' + (++net.seq));
      if (net.role === 'guest') { e.puppet = true; if (!opts.netId) e.netOrphan = true; }     // ennemi né localement chez l'invité : retiré au prochain instantané
    }
    e.label = attachLabel(mesh, height + 0.35, elite ? 'elite' : 'enemy');
    e.label.set(1);
    if (def.name && (elite || affixes)) e.label.setText(def.name);
    mesh.scale.setScalar(0.01);
    mesh.rotation.y = Math.atan2(r.player.pos.x - x, r.player.pos.z - z);
    FX('burst', V3(x, 0.4, z), BURST_COLORS[def.model] || 0xb46bff, 10, { speed: 3, up: 4, life: 0.5, size: 0.15 });
    r.enemies.push(e);
    r.tdirty = true;
    if (ext) {
      const a = aiDefOf(def);
      try { if (a && typeof a.init === 'function') a.init(e, G.SkillAPI); }
      catch (err) { console.warn('[game] AI.init ' + def.ai, err); e.extAI = false; e.ai = 'melee'; e.state = 'chase'; }
      e.selfMoving = !!(def.selfMoving || (a && a.selfMoving !== false));
    }
    if (def.rare || def.category === 'rare') { FX('text', V3(x, height + 1.2, z), 'RARE !', '#ffd23f', 1.3); FX('ring', V3(x, 0.05, z), 0xffd23f, 2.2, 0.7); }
    emit('enemySpawn', { enemy: e });
    return e;
  }

  // --- critique ------------------------------------------------------------
  const critChance = v => { v = num(v, 0.05); return clamp(v > 1 ? v / 100 : v, 0, 1); };
  const critMult = v => { v = num(v, 1.5); return v >= 10 ? v / 100 : v >= 1 ? v : v > 0 ? 1 + v : 1.5; };
  const STATUS_COLOR = { burn: 0xff7a2a, poison: 0x7bd14a, slow: 0x8fb4ff, stun: 0xffe45c, freeze: 0x9fe6ff, shock: 0xffe45c, curse: 0xa05cff, mark: 0xff5c8a, fear: 0xc9a0ff };
  const STATUS_NAME = { burn: 'Brûlure', poison: 'Poison', slow: 'Ralenti', stun: 'Étourdi', freeze: 'Gelé', shock: 'Choc', curse: 'Maudit', mark: 'Marqué', fear: 'Terrifié' };

  function statusT(s) { return s ? (typeof s === 'object' ? num(s.t, 1) : (s === true ? 1 : num(s, 0))) : 0; }
  function hasStatus(e, id) { return !!(e && e.statuses && e.statuses[id] && statusT(e.statuses[id]) > 0); }

  /**
   * PIPELINE DE DÉGÂTS UNIQUE.
   * o : {element, kind:'melee'|'projectile'|'aoe'|'skill'|'minion'|'dot', source:'player'|'minion'|..., canCrit, crit (forcé),
   *      knockback (distance), kb (impulsion v2), kx,kz, from (Vector3), tags, weapon, noCharge}
   * Ordre : outgoingDamage → critique → statuts (marque/choc…) → résistances (G.Monsters.absorb) → incomingDamage → application.
   * N'applique PAS stats.dmg[element] (déjà inclus par les compétences).
   */
  function dealDamage(e, amount, o) {
    o = o || {};
    const r = run;
    if (!r || !e || e.dead || e.spawnT > 0 || (e.boss && r.bossIntro) || e.untargetable) return 0;
    if (!(amount > 0)) return 0;
    const p = r.player;
    const source = o.source || 'player';
    const el = o.element || 'physique';
    const kind = o.kind || (o.burn ? 'dot' : 'skill');
    const isDot = kind === 'dot' || o.burn;
    const st = (p && p.stats) || {};
    let d = { amount, element: el, kind, crit: false, tags: o.tags ? o.tags.slice() : [] };
    if (r.castCounter && source === 'player' && !isDot) { d.amount *= 2; d.tags.push('counter'); }
    d = hook('outgoingDamage', d, { source, target: e, run: r }) || d;
    let amt = num(d.amount, amount);
    let crit = false;
    if (o.crit !== undefined) crit = !!o.crit;
    else if (o.canCrit !== false && !isDot && source !== 'system') {
      crit = rngChance(critChance(st.crit));
      if (crit) amt *= critMult(st.critDmg);
    }
    if (d.crit && !crit) { crit = true; amt *= critMult(st.critDmg); }
    // statuts qui augmentent les dégâts subis
    const S = e.statuses;
    let bonus = 0;
    if (S.mark || S.curse) bonus = Math.max(S.mark ? num(S.mark.power, 0.2) : 0, S.curse ? num(S.curse.power, 0.2) : 0);
    if (S.shock && !isDot) bonus += num(S.shock.power, 0.25);
    if (S.freeze) bonus += 0.15;
    if (bonus > 0) amt *= 1 + bonus;
    // résistances / faiblesses / bouclier
    const before = amt;
    if (G.Monsters && typeof G.Monsters.absorb === 'function') {
      const a = safe(G.Monsters, 'absorb', [e, amt, el]);
      if (typeof a === 'number') amt = a;
    } else {
      if (e.resist[el] != null) amt *= e.resist[el];
      if (e.weak[el] != null) amt *= e.weak[el];
    }
    let inc = { amount: amt, element: el, kind };
    inc = hook('incomingDamage', inc, { target: e, source, run: r }) || inc;
    amt = Math.max(0, num(inc.amount, amt));
    const dealt = amt > 0 ? Math.max(1, Math.round(amt)) : 0;
    if (dealt <= 0) {
      if (before > 0 && !isDot) FX('text', V3(e.pos.x, e.height + 0.2, e.pos.z), 'ABSORBÉ', '#9aa3ad', 0.8);
      return 0;
    }
    const hpBefore = e.pv;
    if (e.puppet) {       // invité : l'hôte applique les dégâts (prédiction locale sans mise à mort)
      netCall('guestDamage', e, dealt, el, crit, kind);
      e.pv = Math.max(1, e.pv - dealt);
    } else e.pv -= dealt;
    e.lastHurt = clockTime;
    e.flashK = 1; e.flashColor = 0xffffff;
    r.stats.damageDealt += dealt;
    // nombre flottant coloré par élément
    const tp = V3(e.pos.x, e.height + 0.2, e.pos.z);
    if (isDot) FX('text', tp, String(dealt), EL_CSS[el] || '#ff9a3c', 0.7);
    else FX('text', tp, crit ? dealt + ' !' : String(dealt), crit ? '#ffd23f' : (EL_CSS[el] || '#ffffff'), crit ? 1.6 : 1);
    if (!isDot) FX('burst', V3(e.pos.x, e.height * 0.55, e.pos.z), crit ? 0xffd23f : (el !== 'physique' ? EL_HEX[el] : (BURST_COLORS[e.def.model] || 0xffffff)), crit ? 10 : 5, { speed: 3, up: 2.5, life: 0.4, size: 0.12, gravity: BONY[e.def.model] ? 12 : 4 });
    // recul
    let kb = num(o.kb, 0) + num(o.knockback, 0) * 4;
    if (kb > 0 && !isDot) {
      let kx = o.kx, kz = o.kz;
      if (kx === undefined) {
        const f = o.from || (o.dir ? null : p.pos);
        if (o.dir) { kx = o.dir.x; kz = o.dir.z; }
        else { const n = norm2(e.pos.x - f.x, e.pos.z - f.z); kx = n.x; kz = n.z; }
      }
      const k = kb * (e.boss ? 0.1 : e.elite ? 0.55 : 1) * (r.mech && r.mech.gravite_faible ? 2 : 1);
      e.kbx += kx * k; e.kbz += kz * k;
    }
    // charge de l'ultime (v2 : par dégâts ; v3 : fraction des PV du héros)
    if (!o.noCharge && !isDot && source === 'player' && p) {
      const gain = useSkills() ? (dealt / Math.max(1, p.pvMax * 2)) * 100 : dealt * superCfg().chargePerDamage;
      p.superCharge = Math.min(100, p.superCharge + gain);
    }
    // vol de vie (stats + perk d'arme v2)
    if (source === 'player' && !isDot && p && !p.dead) {
      const ls = num(st.lifesteal, 0) + (o.weapon ? num(o.weapon.lifesteal, 0) : 0);
      if (ls > 0) healPlayer(Math.max(1, Math.round(dealt * ls)));
    }
    if (crit) hitStop(0.03);
    e.label.set(Math.max(0, e.pv) / e.pvMax);
    if (e.boss) { HUD('setBoss', e.def.name, Math.max(0, e.pv) / e.pvMax); if (!e.puppet) checkPhase(e); }
    emit('damageDealt', { target: e, amount: dealt, crit, element: el, kind, source });
    if (e.pv <= 0) killEnemy(e, source, Math.max(0, dealt - Math.max(0, hpBefore)), el);
    return dealt;
  }
  /** Compatibilité kit v2 / ancien code : damageEnemy(e, dmg, {crit, kx, kz, kb, weapon, burn, noCharge}) */
  function damageEnemy(e, dmg, o) {
    o = o || {};
    const oo = Object.assign({ canCrit: false, source: o.burn ? 'player' : (o.source || 'player') }, o);
    if (o.crit === undefined) oo.crit = false;
    if (o.burn) { oo.kind = 'dot'; oo.element = o.element || 'feu'; }
    else if (!oo.kind) oo.kind = 'skill';
    return dealDamage(e, dmg, oo);
  }

  // --- statuts --------------------------------------------------------------
  function applyStatus(e, o) {
    if (!e || e.dead || !o || !STATUS_COLOR[o.id]) return false;
    let id = o.id, dur = num(o.duration, 3), power = o.power;
    const st = run.player.stats || {};
    if (e.boss && (id === 'stun' || id === 'freeze' || id === 'fear')) { id = 'slow'; dur *= 0.5; power = 0.5; }
    if (e.immune && e.immune[id]) return false;
    if (id === 'burn' || id === 'poison') { if (!(power > 1.5)) power = Math.max(3, num(st.force, 10) * 0.4); }
    else if (id === 'slow') { power = power > 0 && power < 0.95 ? power : 0.5; }
    else if (id === 'shock' || id === 'curse' || id === 'mark') { power = power > 0 && power < 0.95 ? power : 0.25; }
    else power = num(power, 1);
    const cur = e.statuses[id];
    if (cur && typeof cur === 'object') { cur.t = Math.max(cur.t, dur); cur.dur = Math.max(cur.dur || 0, dur); cur.power = Math.max(num(cur.power, 0), power); }
    else {
      e.statuses[id] = { t: dur, dur, power, tick: 0.5 };
      FX('text', V3(e.pos.x, e.height + 0.6, e.pos.z), STATUS_NAME[id], '#' + STATUS_COLOR[id].toString(16).padStart(6, '0'), 0.7);
    }
    if (id === 'stun' || id === 'freeze') { e.state = e.state === 'aim' || e.state === 'windup' ? 'chase' : e.state; removeTele(e.tele); e.tele = null; }
    return true;
  }
  /** Met à jour les statuts d'un ennemi ; renvoie false si l'ennemi est mort pendant le tick */
  function tickStatuses(e, dt) {
    const S = e.statuses;
    let slow = 0, tint = 0, any = false;
    for (const id in S) {
      const s = S[id];
      if (!s) { delete S[id]; continue; }
      if (typeof s !== 'object') continue;
      any = true;
      s.t -= dt;
      if (s.t <= 0) { delete S[id]; continue; }
      if (id === 'burn' || id === 'poison') {
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick = 0.5;
          FX('trail', V3(e.pos.x, e.height * 0.6, e.pos.z), STATUS_COLOR[id], 0.3);
          dealDamage(e, Math.max(1, s.power * 0.5), { kind: 'dot', element: id === 'burn' ? 'feu' : 'poison', source: 'player', canCrit: false, noCharge: true });
          if (e.dead) return false;
        }
      } else if (id === 'slow') slow = Math.max(slow, s.power);
      if (STATUS_COLOR[id]) tint = STATUS_COLOR[id];
    }
    e.speedMult = 1 - clamp(slow, 0, 0.9);
    e.statusTint = any ? tint : 0;
    return true;
  }
  const isStunned = e => hasStatus(e, 'stun') || hasStatus(e, 'freeze');
  function applyBurn(e, burn, hitDmg) {
    if (!burn || e.dead) return;
    let dps = 4, dur = 3;
    if (typeof burn === 'number') dps = burn >= 1 ? burn : Math.max(1, hitDmg * burn);
    else if (typeof burn === 'object') { dps = num(burn.dps, num(burn.dmg, 4)); dur = num(burn.duration, num(burn.dur, 3)); }
    applyStatus(e, { id: 'burn', duration: dur, power: Math.max(1.6, dps) });
  }

  function killEnemy(e, killer, overkill, element) {
    const r = run;
    if (e.dead) return;
    e.dead = true; e.pv = 0;
    r.tdirty = true;
    e.label.remove();
    removeTele(e.tele); e.tele = null;
    r.kills++;
    profile.stats.kills = (profile.stats.kills || 0) + 1;
    if (e.def.tags && e.def.tags.indexOf('golden') >= 0 || e.tags.indexOf('golden') >= 0) profile.stats.goldenKills = (profile.stats.goldenKills || 0) + 1;
    const col = BURST_COLORS[e.def.model] || 0xffffff;
    FX('burst', V3(e.pos.x, e.height * 0.5, e.pos.z), col, e.boss ? 60 : e.elite ? 26 : 14, { speed: e.boss ? 8 : 5, up: 5, life: 0.8, size: e.boss ? 0.3 : 0.18, gravity: BONY[e.def.model] ? 14 : 6 });
    sfx('hit');
    hitStop(e.boss ? 0.25 : e.elite ? 0.1 : 0.05);
    shake(e.boss ? 1 : e.elite ? 0.35 : 0.15);
    r.corpses.push({ mesh: e.mesh, t: 0.3, s: e.mesh.scale.x, flash: e.flash });
    emit('enemyKilled', { enemy: e, killer: killer || 'player', overkill: overkill || 0, element: element || 'physique', rank: e.rank || r.rank });
    if (e.boss) { bossDefeated(e); return; }
    giveKillLoot(e, e.elite ? 0.3 : 0.08, 6);
  }
  /** Retire un ennemi sans butin (fuite…) : compte comme éliminé pour la salle */
  function despawnEnemy(e, o) {
    if (!e || e.dead) return;
    e.dead = true; e.escaped = true;
    run.tdirty = true;
    e.label.remove(); removeTele(e.tele); e.tele = null;
    run.corpses.push({ mesh: e.mesh, t: 0.3, s: e.mesh.scale.x, flash: e.flash });
    emit('enemyEscaped', { enemy: e, escaped: !!(o && o.escaped) });
  }

  /** Orbes d'XP, pièces et cœurs (hooks xpGain / goldGain). Les objets et matériaux sont gérés par G.Inventory (enemyKilled). */
  function giveKillLoot(e, heartChance, maxPieces) {
    const r = run, p = r.player, st = p.stats || {};
    const def = e.def;
    const g = def.gold;
    let gold = Array.isArray(g) ? randint(num(g[0], 0), num(g[1], num(g[0], 0))) : Math.round(num(g, 0));
    let xp = Math.round(num(def.xp, 5) * num(st.xpMult, 1));
    gold = Math.round(gold * num(st.goldMult, 1));
    xp = Math.round(hook('xpGain', xp, { enemy: e, run: r, source: 'kill' }));
    gold = Math.round(hook('goldGain', gold, { enemy: e, run: r, source: 'kill' }));
    const noHeal = r.constraints.noHealDrops || r.constraints.oneLife;
    dropLoot(e.pos.x, e.pos.z, xp, gold, noHeal || p.pv >= p.pvMax ? 0 : heartChance, maxPieces);
  }
  function dropLoot(x, z, xp, gold, heartChance, maxPieces) {
    const mp = maxPieces || 6;
    if (xp > 0) {
      const n = clamp(Math.ceil(xp / 6), 1, mp);
      for (let i = 0; i < n; i++) spawnPickup('xp', x, z, Math.floor(xp / n) + (i < xp % n ? 1 : 0));
    }
    if (gold > 0) {
      const n = clamp(Math.ceil(gold / 5), 1, mp);
      for (let i = 0; i < n; i++) spawnPickup('gold', x, z, Math.floor(gold / n) + (i < gold % n ? 1 : 0));
    }
    if (heartChance > 0 && Math.random() < heartChance) spawnPickup('heart', x, z, 0);
  }

  // --- objets au sol -----------------------------------------------------
  let itemGeo = null, beamGeo = null;
  function makeItemMesh(rarity) {
    const col = RARITY_HEX[rarity] || 0xb8c0cc;
    const g = new THREE.Group();
    if (!itemGeo) { itemGeo = new THREE.OctahedronGeometry(0.32, 0); beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 3, 6, 1, true); itemGeo.userData.shared = beamGeo.userData.shared = true; }   // cache partagé : jamais libéré au nettoyage de salle
    const gem = new THREE.Mesh(itemGeo, new THREE.MeshBasicMaterial({ color: col }));
    gem.position.y = 0.15; g.add(gem);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.5; g.add(beam);
    g.userData.own = true;
    return g;
  }
  function spawnPickup(type, x, z, value, extra) {
    const r = run;
    if (!r || !r.root) return null;
    let mesh;
    if (type === 'item') mesh = makeItemMesh((extra && extra.rarity) || 'commun');
    else mesh = makePickupMesh(type);
    mesh.position.set(x, 0.6, z);
    r.root.add(mesh);
    const a = Math.random() * TAU, sp = 2 + Math.random() * 3;
    const pk = { type, value, mesh, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: 4 + Math.random() * 3, t: 0, pull: 0, dead: false, item: extra && extra.item, onPickup: extra && extra.onPickup, rarity: extra && extra.rarity };
    r.pickups.push(pk);
    return pk;
  }
  function buryPickup(pk) { sceneRemove(pk.mesh); if (run && pk.mesh) (run.graveyard = run.graveyard || []).push(pk.mesh); }
  function collectPickup(pk) {
    const r = run, p = r.player;
    pk.dead = true;
    buryPickup(pk);
    if (pk.type === 'gold') { addGold(pk.value, true); sfx('gold'); }
    else if (pk.type === 'xp') { sfx('pickup'); gainXP(pk.value); }
    else if (pk.type === 'heart') {
      if (p && !p.dead) { healPlayer(Math.max(10, Math.round(p.pvMax * 0.15))); sfx('heal'); }
    } else if (pk.type === 'item') {
      sfx('pickup');
      if (typeof pk.onPickup === 'function') { try { pk.onPickup(pk.item); } catch (e) { console.warn('[game] onPickup', e); } }
      if (typeof pk.onPickup !== 'function') emit('loot', { item: pk.item });
    }
  }
  function collectAllPickups() {
    const r = run;
    if (!r) return;
    r.pickups.forEach(pk => {
      if (pk.dead) return;
      if (pk.type === 'gold') { pk.dead = true; buryPickup(pk); addGold(pk.value, true); }
      else if (pk.type === 'xp') { pk.dead = true; buryPickup(pk); gainXP(pk.value); }
      else if (pk.type === 'item') collectPickup(pk);
      else { pk.dead = true; buryPickup(pk); }
    });
    if (run) run.pickups = [];
  }
  function updatePickups(dt, time) {
    const r = run, p = r.player;
    const magnetAll = r.roomState !== 'fight' || r.ended === 'victory';
    const rad = 3.5 + Math.max(0, num(p.stats && p.stats.pickupRadius, 0));
    for (const pk of r.pickups) {
      if (pk.dead) continue;
      pk.t += dt;
      const m = pk.mesh.position;
      const dx = p.pos.x - m.x, dz = p.pos.z - m.z, d = Math.hypot(dx, dz);
      if (pk.t > 0.4 && !p.dead && (d < rad || magnetAll || pk.pull > 0) && !(pk.type === 'item' && d >= rad && !magnetAll && pk.pull <= 0)) {
        pk.pull = Math.min(24, pk.pull + dt * 40);
        m.x += (dx / (d || 1)) * pk.pull * dt; m.z += (dz / (d || 1)) * pk.pull * dt;
        m.y = lerp(m.y, 0.9, 1 - Math.exp(-dt * 10));
        if (d < 0.8) { collectPickup(pk); continue; }
      } else {
        pk.vy -= 18 * dt;
        m.x += pk.vx * dt; m.z += pk.vz * dt; m.y += pk.vy * dt;
        pk.vx *= Math.exp(-dt * 3); pk.vz *= Math.exp(-dt * 3);
        if (m.y < 0.35) { m.y = 0.35; pk.vy = Math.abs(pk.vy) * 0.35; }
        if (pointBlocked(m.x, m.z, 0.2)) { m.x -= pk.vx * dt; m.z -= pk.vz * dt; pk.vx = -pk.vx; pk.vz = -pk.vz; }
        m.x = clamp(m.x, -HALF + 0.6, HALF - 0.6); m.z = clamp(m.z, -HALF + 0.6, HALF - 0.6);
        if (pk.t > 0.8) m.y = 0.35 + Math.sin(time * 4 + pk.t) * 0.08;
      }
      pk.mesh.rotation.y += dt * 3;
    }
    r.pickups = r.pickups.filter(pk => !pk.dead);
  }

  /** Récompenses garanties (donjon, coffre…) : confiées à G.Inventory.grantReward ; le butin apparaît au sol sinon dans le sac */
  function dropEntries(entries, x, z, o) {
    if (!profile || !entries || !entries.length) return;
    const res = safe(G.Inventory, 'grantReward', [profile, entries, { rank: run ? run.rank : undefined, source: o && o.source }]);
    if (res && res.items && run) res.items.forEach(it => { run.loot.push({ name: it.name || 'Objet', rarity: it.rarity || 'commun', icon: it.icon || '' }); });
    if (res && res.materials && run) for (const k in res.materials) run.materials[k] = (run.materials[k] || 0) + res.materials[k];
  }
  /** Objet au sol (appelé par G.Inventory) : {pos, item, rarity, onPickup} */
  function dropItemPickup(o) {
    if (!run || !run.root || !o) return null;
    const q = toXZ(o.pos || run.player.pos);
    return spawnPickup('item', q.x, q.z, 0, { item: o.item, rarity: o.rarity || (o.item && o.item.rarity), onPickup: o.onPickup });
  }
  function onLootEvent(ev) {
    const r = run;
    if (!r || !ev) return;
    if (ev.item) r.loot.push({ name: ev.item.name || 'Objet', rarity: ev.item.rarity || 'commun', icon: ev.item.icon || '' });
    if (ev.material && ev.material.id) r.materials[ev.material.id] = (r.materials[ev.material.id] || 0) + (ev.material.n || 1);
  }
  function setState(e, s, t) { e.state = s; e.t = t || 0; e.tMax = t || 1; }
  function moveEntity(e, vx, vz, dt) {
    e.pos.x += (vx + e.kbx) * dt; e.pos.z += (vz + e.kbz) * dt;
    const dec = Math.exp(-8 * dt);
    e.kbx *= dec; e.kbz *= dec;
    const hit = collideCircle(e.pos, e.r, run.obstacles);
    const bx = e.pos.x, bz = e.pos.z;
    clampRoom(e.pos, e.r, false);
    return hit || bx !== e.pos.x || bz !== e.pos.z;
  }
  function enemyProjType(e) {
    if (e.def.projectile) return e.def.projectile;
    if (e.boss) return BOSS_PROJ[e.def.model] || 'orb';
    if (e.ai === 'caster') return 'orb';
    return 'arrow';
  }
  function enemyShoot(e, dir, type, speed, dmg, extra) {
    const o = Object.assign({
      type, owner: 'enemy', x: e.pos.x + dir.x * (e.r + 0.3), z: e.pos.z + dir.z * (e.r + 0.3), dir,
      speed, range: 22, dmg, radius: type === 'rock' ? 0.5 : 0.3, y: e.boss ? 1.4 : 1.0,
      slow: type === 'web' ? 1.4 : type === 'ice' ? 1.0 : 0,
    }, extra || {});
    return spawnProjectile(o);
  }
  function fan(e, base, n, spreadRad, type, speed, dmg) {
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? 0 : -spreadRad / 2 + (spreadRad * i) / (n - 1);
      enemyShoot(e, rot2(base, a), type, speed, dmg);
    }
  }

  function updateEnemy(e, dt, time) {
    if (!net.role) { updateEnemyInner(e, dt, time); return; }
    if (e.puppet) { updatePuppet(e, dt, time); return; }
    net.aggro = netPickAggro(e);
    try { updateEnemyInner(e, dt, time); } finally { net.aggro = null; }
  }
  /** Invité : l'ennemi est piloté par les instantanés de l'hôte (position interpolée, PV, état). Aucune IA locale. */
  function updatePuppet(e, dt, time) {
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      const k = clamp(1 - e.spawnT / e.spawnDur, 0, 1);
      e.mesh.scale.setScalar(Math.max(0.01, e.baseScale * easeOutBack(k)));
      if (!e.boss) e.pos.y = (1 - k) * -0.5;
      if (e.spawnT <= 0) { e.mesh.scale.setScalar(e.baseScale); if (!e.boss) e.pos.y = 0; }
    }
    e.flashK = Math.max(0, e.flashK - dt * 6);
    if (!tickStatuses(e, dt)) return;      // brûlures posées par l'invité : les dégâts partent vers l'hôte
    const t = e.netT;
    let moving = false;
    if (t && !(e.boss && run.bossIntro)) {
      const k = 1 - Math.exp(-dt * 14);
      const ox = e.pos.x, oz = e.pos.z;
      const ahead = clamp(clockTime - num(t.t, clockTime), 0, 0.15) + 0.06;      // extrapolation courte (latence de l'instantané)
      e.pos.x += (t.x + num(t.vx, 0) * ahead - e.pos.x) * k; e.pos.z += (t.z + num(t.vz, 0) * ahead - e.pos.z) * k;
      moving = Math.hypot(e.pos.x - ox, e.pos.z - oz) / Math.max(dt, 1e-3) > 0.3;
      if (t.ry != null) e.mesh.rotation.y = lerpAngle(e.mesh.rotation.y, t.ry, k);
    }
    const w = e.netW || 0, a = e.netA || 0;
    if (w > 0 && e.flashK < 0.5 * w) { e.flashK = 0.5 * w; e.flashColor = 0xff3030; }
    applyFlash(e.flash, e.flashColor, e.flashK);
    if (!e.extAI || e.boss) safe(G.GFX, 'animateCharacter', [e.mesh, time + e.animOff, { moving, windup: w, attack: a }]);
    else { const ud = e.mesh.userData || {}; if (typeof ud.animate === 'function') { try { ud.animate(time + e.animOff, { moving, windup: w, attack: a }); } catch (_) { /* rien */ } } else safe(G.GFX, 'animateCharacter', [e.mesh, time + e.animOff, { moving, windup: w, attack: a }]); }
  }
  function updateEnemyInner(e, dt, time) {
    const r = run, p = net.aggro || r.player;
    // apparition (sort du sol)
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      const k = clamp(1 - e.spawnT / e.spawnDur, 0, 1);
      e.mesh.scale.setScalar(Math.max(0.01, e.baseScale * easeOutBack(k)));
      e.pos.y = (1 - k) * -0.5;
      if (e.spawnT <= 0) { e.mesh.scale.setScalar(e.baseScale); e.pos.y = e.boss ? e.pos.y : 0; }
      return;
    }
    e.cd -= dt; e.contactCd -= dt; e.mcd -= dt;
    e.flashK = Math.max(0, e.flashK - dt * 6);
    if (!tickStatuses(e, dt)) return;
    const stunned = isStunned(e);
    if (!stunned) e.t -= dt;
    if (e.statusTint && e.flashK < 0.3) { e.flashK = 0.3; e.flashColor = e.statusTint; }
    // IA externe (G.AI) : l'IA déplace / oriente / anime elle-même
    if (e.extAI && !e.boss) {
      const a = aiDefOf(e.def);
      if (a && typeof a.update === 'function') {
        if (stunned) { applyFlash(e.flash, e.flashColor, e.flashK); return; }
        const sm = e.speedMult;
        try { a.update(e, dt * sm, G.SkillAPI); }
        catch (err) { if (!warned['ai' + e.ai]) { warned['ai' + e.ai] = 1; console.warn('[game] AI ' + e.ai, err); } e.extAI = false; e.ai = 'melee'; e.state = 'chase'; }
        if (e.dead) return;
        applyFlash(e.flash, e.flashColor, e.flashK);
        return;
      }
      e.extAI = false; e.ai = 'melee'; e.state = 'chase';
    }
    const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const u = { x: dx / d, z: dz / d };
    const out = { vx: 0, vz: 0, windup: 0, attack: 0, face: null };
    const spd = e.speed * e.speedMult;

    if (stunned) { out.face = u; }
    else if (e.boss) updateBoss(e, dt, u, d, out);
    else if (p.dead) { out.face = u; }
    else {
      switch (e.ai) {
        case 'ranged': aiRanged(e, dt, u, d, spd, out); break;
        case 'charger': aiCharger(e, dt, u, d, spd, out); break;
        case 'swarm': aiSwarm(e, dt, u, d, spd, out, time); break;
        case 'caster': aiCaster(e, dt, u, d, spd, out); break;
        default: aiMelee(e, dt, u, d, spd, out); break;
      }
    }
    if (e.dead) return;
    e.wallHit = moveEntity(e, out.vx, out.vz, dt);
    // orientation
    const f = out.face || (Math.hypot(out.vx, out.vz) > 0.2 ? norm2(out.vx, out.vz) : null);
    if (f) e.mesh.rotation.y = lerpAngle(e.mesh.rotation.y, Math.atan2(f.x, f.z), 1 - Math.exp(-dt * 10));
    // dégâts de contact (essaims, boss, chargeurs lancés)
    const cdmg = e.boss ? e.dmg * (e.state === 'attack' && e.atk && e.atk.name === 'charge' && e.atk.stage === 1 ? 2 : 1)
      : e.ai === 'swarm' ? e.dmg : (e.ai === 'charger' && e.state === 'charge') ? e.dmg * 1.4 : 0;
    if (cdmg > 0 && e.contactCd <= 0 && Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < e.r + p.r + 0.1) {
      if (hurtPlayer(cdmg)) {
        e.contactCd = e.ai === 'swarm' ? Math.max(0.5, e.attackCd) : 0.9;
        const k = norm2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        p.pos.x += k.x * 0.4; p.pos.z += k.z * 0.4;
        if (e.ai === 'swarm') { e.kbx -= k.x * 5; e.kbz -= k.z * 5; }
      }
    }
    // flash (blanc si touché, rouge pendant un windup)
    applyFlash(e.flash, e.flashColor, e.flashK);
    safe(G.GFX, 'animateCharacter', [e.mesh, time + e.animOff, { moving: Math.hypot(out.vx, out.vz) > 0.3, windup: clamp(out.windup, 0, 1), attack: clamp(out.attack, 0, 1) }]);
    if (net.role) { e.netW = clamp(out.windup, 0, 1); e.netA = clamp(out.attack, 0, 1); }
  }
  /** Lueur d'avertissement pendant la préparation d'une attaque */
  function warnFlash(e, k, color) { if (e.flashK < k) { e.flashK = k; e.flashColor = color || 0xff3030; } }

  // Mêlée : poursuite + coup annoncé (~0.35 s) esquivable
  function aiMelee(e, dt, u, d, spd, out) {
    const p = tgtP();
    const reach = num(e.def.range, 1.2) + p.r + e.r * 0.6;
    if (e.state === 'chase') {
      if (d > reach * 0.8) { out.vx = u.x * spd; out.vz = u.z * spd; }
      out.face = u;
      if (d <= reach && e.cd <= 0) { setState(e, 'windup', e.elite ? 0.45 : 0.35); e.lock = { x: u.x, z: u.z }; }
    } else if (e.state === 'windup') {
      out.face = e.lock;
      out.windup = 1 - e.t / e.tMax;
      warnFlash(e, 0.5 * out.windup, 0xff3030);
      if (e.t <= 0) {
        sfx('swing');
        e.kbx += e.lock.x * 3; e.kbz += e.lock.z * 3;     // petite fente en avant
        const pd = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        const dot = ((p.pos.x - e.pos.x) * e.lock.x + (p.pos.z - e.pos.z) * e.lock.z) / (pd || 1);
        if (pd <= reach + 0.4 && dot > 0.35) hurtPlayer(e.dmg);
        for (let i = -2; i <= 2; i++) {
          const dd = rot2(e.lock, i * 0.35);
          FX('trail', V3(e.pos.x + dd.x * reach * 0.8, 1, e.pos.z + dd.z * reach * 0.8), 0xffb0b0, 0.3);
        }
        setState(e, 'recover', 0.35);
        e.cd = e.attackCd;
      }
    } else {
      out.attack = e.t / 0.35;
      out.face = u;
      if (e.t <= 0) setState(e, 'chase', 0);
    }
  }

  // Distance : garde ses distances (5-9), ligne de visée annoncée puis tir
  function aiRanged(e, dt, u, d, spd, out) {
    const p = tgtP();
    if (e.state === 'move') {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = 1.5 + Math.random() * 1.5; }
      const los = !segmentBlocked(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      let mx = 0, mz = 0;
      const far = num(e.def.range, 9), near = Math.max(2.5, far * 0.6);   // garde ses distances (≈5-9)
      if (d < near) { mx = -u.x; mz = -u.z; } else if (d > far || !los) { mx = u.x; mz = u.z; }
      mx += -u.z * e.strafe * 0.7; mz += u.x * e.strafe * 0.7;
      const n = norm2(mx, mz);
      out.vx = n.x * spd; out.vz = n.z * spd;
      out.face = u;
      if (e.wallHit) e.strafe *= -1;
      if (e.cd <= 0 && los && d <= far + 1.5) {
        setState(e, 'aim', e.elite ? 0.5 : 0.65);
        e.lock = { x: u.x, z: u.z };
        e.tele = makeTele('line', 13);
        placeLine(e.tele, e.pos.x, e.pos.z, e.lock, 13);
      }
    } else if (e.state === 'aim') {
      out.face = e.lock;
      out.windup = 1 - e.t / e.tMax;
      if (e.tele) { e.tele.userData.setProgress(out.windup); placeLine(e.tele, e.pos.x, e.pos.z, e.lock, 13); }
      if (e.t <= 0) {
        removeTele(e.tele); e.tele = null;
        const type = enemyProjType(e);
        if (e.elite) fan(e, e.lock, 3, 0.35, type, num(e.def.projSpeed, 13), e.dmg);
        else enemyShoot(e, e.lock, type, num(e.def.projSpeed, 13), e.dmg);
        sfx('arrow');
        setState(e, 'move', 0);
        e.cd = e.attackCd;
        out.attack = 1;
      }
    }
  }

  // Chargeur : s'arrête, ligne annoncée, fonce en ligne droite
  function aiCharger(e, dt, u, d, spd, out) {
    const p = tgtP();
    const LEN = Math.max(8, num(e.def.range, 6) * 1.8);   // range = distance de déclenchement de la charge
    if (e.state === 'chase') {
      out.vx = u.x * spd; out.vz = u.z * spd; out.face = u;
      if (e.cd <= 0 && d <= num(e.def.range, 6) && !segmentBlocked(e.pos.x, e.pos.z, p.pos.x, p.pos.z)) {
        setState(e, 'aim', 0.7);
        e.lock = { x: u.x, z: u.z };
        e.tele = makeTele('line', LEN);
        placeLine(e.tele, e.pos.x, e.pos.z, e.lock, LEN);
      }
    } else if (e.state === 'aim') {
      out.face = e.lock;
      out.windup = 1 - e.t / e.tMax;
      warnFlash(e, 0.4 * out.windup, 0xff6020);
      if (e.tele) e.tele.userData.setProgress(out.windup);
      if (e.t <= 0) {
        removeTele(e.tele); e.tele = null;
        setState(e, 'charge', LEN / (spd * 3.5 + 0.01));
        e.contactCd = 0;
        e.wallHit = false;
      }
    } else if (e.state === 'charge') {
      out.vx = e.lock.x * spd * 3.5; out.vz = e.lock.z * spd * 3.5; out.face = e.lock;
      out.attack = 1;
      FX('trail', V3(e.pos.x, 0.3, e.pos.z), 0xd8d0c0, 0.3);
      if (e.wallHit && e.t < e.tMax - 0.05) { shake(0.2); FX('burst', V3(e.pos.x, 0.6, e.pos.z), 0xd8d0c0, 10, { speed: 3, up: 2, life: 0.4 }); setState(e, 'stun', 0.9); e.cd = e.attackCd; }
      else if (e.t <= 0) { setState(e, 'stun', 0.5); e.cd = e.attackCd; }
    } else {
      // étourdi : vulnérable
      out.face = u;
      if (e.t <= 0) setState(e, 'chase', 0);
    }
  }

  // Essaim : rapide, faible, zigzag
  function aiSwarm(e, dt, u, d, spd, out, time) {
    const zig = Math.sin(time * 7 + e.animOff) * 0.9;
    const dir = rot2(u, d > 1.5 ? zig : 0);
    out.vx = dir.x * spd; out.vz = dir.z * spd;
    out.face = dir;
  }

  // Lanceur de sorts : se téléporte / tire des orbes en éventail
  function aiCaster(e, dt, u, d, spd, out) {
    const r = run, p = tgtP();
    if (e.state === 'move') {
      let mx = 0, mz = 0;
      const far = num(e.def.range, 8), near = Math.max(2.5, far * 0.7);
      if (d < near) { mx = -u.x; mz = -u.z; } else if (d > far) { mx = u.x; mz = u.z; }
      mx += -u.z * e.strafe * 0.4; mz += u.x * e.strafe * 0.4;
      const n = norm2(mx, mz);
      out.vx = n.x * spd * 0.8; out.vz = n.z * spd * 0.8;
      out.face = u;
      if (e.wallHit) e.strafe *= -1;
      if (e.cd <= 0) {
        e.castN++;
        if (e.castN % 3 === 0 || d < 3) { setState(e, 'vanish', 0.3); sfx('spawn'); }
        else setState(e, 'cast', e.elite ? 0.45 : 0.6);
      }
    } else if (e.state === 'cast') {
      out.face = u;
      out.windup = 1 - e.t / e.tMax;
      warnFlash(e, 0.6 * out.windup, 0xb46bff);
      if (e.t <= 0) {
        fan(e, u, e.elite ? 5 : 3, e.elite ? 0.9 : 0.55, enemyProjType(e), num(e.def.projSpeed, 9), e.dmg);
        sfx('fire');
        setState(e, 'move', 0);
        e.cd = e.attackCd;
        out.attack = 1;
      }
    } else if (e.state === 'vanish') {
      e.mesh.scale.setScalar(Math.max(0.01, e.baseScale * (e.t / 0.3)));
      if (e.t <= 0) {
        FX('burst', V3(e.pos.x, 1, e.pos.z), 0xb46bff, 14, { speed: 3, up: 3, life: 0.5 });
        const pts = r.room.spawnPoints.filter(s => { const dd = Math.hypot(s[0] - p.pos.x, s[1] - p.pos.z); return dd > 5 && dd < 10; });
        const s = pts.length ? choice(pts) : choice(r.room.spawnPoints);
        e.pos.x = s[0]; e.pos.z = s[1];
        e.kbx = e.kbz = 0;
        setState(e, 'appear', 0.3);
      }
    } else if (e.state === 'appear') {
      e.mesh.scale.setScalar(Math.max(0.01, e.baseScale * (1 - e.t / 0.3)));
      if (e.t <= 0) { e.mesh.scale.setScalar(e.baseScale); FX('ring', V3(e.pos.x, 0.05, e.pos.z), 0xb46bff, 1.2, 0.4); setState(e, 'move', 0); e.cd = 0.5; }
    }
  }

  /** Séparation entre ennemis (ils ne se chevauchent pas) + pas dans le joueur */
  function separateEnemies() {
    const list = run.enemies, p = run.player;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.r + b.r;
        if (d >= min || d < 1e-5) continue;
        const push = (min - d), nx = dx / d, nz = dz / d;
        const wa = a.boss ? 0 : b.boss ? 1 : 0.5, wb = 1 - wa;
        a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
      }
      if (!a.boss && !p.dead) {
        const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z, d = Math.hypot(dx, dz), min = a.r + p.r * 0.9;
        if (d < min && d > 1e-5) { a.pos.x += (dx / d) * (min - d); a.pos.z += (dz / d) * (min - d); }
      }
    }
  }

  function updateEnemies(dt, time) {
    const r = run;
    for (let i = 0; i < r.enemies.length; i++) {
      const e = r.enemies[i];
      if (!e.dead) updateEnemy(e, dt, time);
      if (run !== r) return;
    }
    if (net.role !== 'guest') separateEnemies();
    r.enemies = r.enemies.filter(e => !e.dead);
    // petite animation de mort (rétrécit et s'enfonce)
    for (const c of r.corpses) {
      c.t -= dt;
      const k = Math.max(0, c.t / 0.3);
      c.mesh.scale.setScalar(Math.max(0.01, c.s * (0.3 + 0.7 * k)));
      c.mesh.position.y -= dt * 1.5;
      if (c.t <= 0) { sceneRemove(c.mesh); disposeFlash(c.flash); (r.graveyard = r.graveyard || []).push(c.mesh); }
    }
    r.corpses = r.corpses.filter(c => c.t > 0);
    // coffre qui « mange » quand on perd
    if (r.chest && r.chest.userData && r.chest.userData.chomp > 0) {
      r.chest.userData.chomp -= dt;
      const k = Math.max(0, r.chest.userData.chomp);
      r.chest.scale.set(1 + Math.sin(k * 30) * 0.12, 1 - Math.sin(k * 30) * 0.1, 1 + Math.sin(k * 30) * 0.12);
      if (k <= 0) r.chest.scale.set(1, 1, 1);
    }
  }

  // ===================================================================
  // 17. BOSS (G.BOSSES + G.BossAttacks)
  // ===================================================================
  function createBoss(def, x, z, mini) {
    const r = run;
    let mesh = safe(G.GFX, 'makeBoss', [def.model, { scale: num(def.scale, 1) }]) || fallbackObj(0x8d7b68, 1.4);
    const sc = num(def.scale, 1);
    let ownScaled = false;
    if (sc !== 1 && Math.abs(mesh.scale.x - 1) < 1e-3) { mesh.scale.multiplyScalar(sc); ownScaled = true; }
    mesh.position.set(x, 0, z);
    r.root.add(mesh);
    const ud = mesh.userData || {};
    const k = ownScaled ? sc : 1;
    let bdef = Object.assign({}, def);
    bdef = hook('enemyStats', bdef, { rank: bdef.rank || r.rank, boss: true, modifiers: r.modifiers, run: r }) || bdef;
    const e = {
      id: def.id, def: bdef, ai: 'boss', mesh, pos: mesh.position, r: num(ud.radius, 1.4) * k, height: num(ud.height, 3.5) * k,
      elite: false, boss: true, mini: !!mini, rank: def.rank || r.rank,
      pv: num(bdef.pv, 400), pvMax: num(bdef.pv, 400), speed: num(bdef.speed, 2.4), baseSpeed: num(bdef.speed, 2.4),
      dmg: num(bdef.dmg, 14), baseDmg: num(bdef.dmg, 14), attackCd: num(bdef.attackCd, 2.2), baseCd: num(bdef.attackCd, 2.2), cd: 1.2, contactCd: 0,
      state: 'idle', t: 0, tMax: 1, kbx: 0, kbz: 0, flashK: 0, flashColor: 0xffffff,
      statuses: {}, speedMult: 1, resist: Object.assign({}, bdef.resist), weak: Object.assign({}, bdef.weak), tags: bdef.tags ? bdef.tags.slice() : [],
      animOff: 0, spawnT: 0, spawnDur: 0, baseScale: mesh.scale.x, mcd: 0, lastHurt: -99,
      fromWave: false, tele: null, atk: null, lastAtk: null, phase: 1, phase2: false, wallHit: false, dead: false,
      __attack: null, extHandle: null, extT: 0, flash: null,
    };
    e.flash = prepareFlash(mesh);
    e.label = { set() {}, setText() {}, remove() {} };     // barre de boss dans le HUD
    if (net.role) { e.netId = 'b' + r.roomIndex + (mini ? 'm' : ''); if (net.role === 'guest') e.puppet = true; }
    r.enemies.push(e);
    r.tdirty = true;
    r.boss = e;
    return e;
  }

  // --- Cinématique d'intro (v5) : letterbox DOM, caméra (orbit | dolly | drop), titre, réplique ---------------------
  const CINE = { root: null, top: null, bot: null, title: null, name: null, sub: null, txt: null, line: null, skip: null, style: null,
    k: 0, kTarget: 0, pos: null, look: null, on: false, patched: false, keyFn: null };
  const CINE_CSS = '.ds-cine{position:fixed;inset:0;z-index:41;pointer-events:none;overflow:hidden}' +
    '.ds-cine-bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .7s cubic-bezier(.2,.7,.2,1)}' +
    '.ds-cine-top{top:0}.ds-cine-bottom{bottom:0}.ds-cine.on .ds-cine-bar{height:12vh}' +
    '.ds-cine-title{position:absolute;left:0;right:0;top:20%;text-align:center;padding:0 5vw;opacity:0;transform:translateY(10px);transition:opacity .8s ease,transform .8s ease}' +
    '.ds-cine-title.show{opacity:1;transform:none}' +
    '.ds-cine-name{font:700 clamp(26px,7.5vw,56px)/1.05 var(--ds-font-display,serif);letter-spacing:.16em;text-transform:uppercase;color:#fff;text-shadow:0 0 18px rgba(255,60,60,.65),0 2px 0 #000}' +
    '.ds-cine-sub{margin-top:8px;font:600 clamp(13px,3.6vw,22px)/1.2 var(--ds-font-display,serif);letter-spacing:.32em;text-transform:uppercase;color:#ffb3b3}' +
    '.ds-cine-text{margin-top:10px;font:italic 600 clamp(12px,3.2vw,18px)/1.3 var(--ds-font-body,serif);color:#d8d0e0;opacity:.85}' +
    '.ds-cine-line{position:absolute;left:0;right:0;bottom:calc(12vh + 52px);text-align:center;padding:0 7vw;font:italic 700 clamp(15px,4.2vw,26px)/1.3 var(--ds-font-body,serif);color:#fff;text-shadow:0 2px 6px #000,0 0 14px rgba(255,80,80,.5);opacity:0;transition:opacity .6s ease}' +
    '.ds-cine-line.show{opacity:1}' +
    '.ds-cine-skip{position:absolute;left:14px;bottom:calc(12vh + 8px);pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.45);color:#fff;border-radius:999px;padding:5px 14px;font:700 12px var(--ds-font-display,sans-serif);letter-spacing:.12em;text-transform:uppercase;opacity:0;transition:opacity .5s ease}' +
    '.ds-cine.on .ds-cine-skip{opacity:.8}';
  function cineEnsureDom() {
    if (typeof document === 'undefined') return false;
    if (CINE.root && CINE.root.parentNode) return true;
    try {
      if (!CINE.style || !CINE.style.parentNode) {
        const st = document.createElement('style'); st.id = 'ds-cine-style'; st.textContent = CINE_CSS;
        (document.head || document.documentElement).appendChild(st); CINE.style = st;
      }
      const el = document.createElement('div'); el.className = 'ds-cine'; el.id = 'ds-cine';
      el.innerHTML = '<div class="ds-cine-bar ds-cine-top"></div><div class="ds-cine-bar ds-cine-bottom"></div>' +
        '<div class="ds-cine-title"><div class="ds-cine-name"></div><div class="ds-cine-sub"></div><div class="ds-cine-text"></div></div>' +
        '<div class="ds-cine-line"></div><button class="ds-cine-skip" type="button">Passer ▸</button>';
      document.body.appendChild(el);
      CINE.root = el; CINE.top = el.children[0]; CINE.bot = el.children[1]; CINE.title = el.children[2];
      CINE.name = el.querySelector('.ds-cine-name'); CINE.sub = el.querySelector('.ds-cine-sub'); CINE.txt = el.querySelector('.ds-cine-text');
      CINE.line = el.querySelector('.ds-cine-line'); CINE.skip = el.querySelector('.ds-cine-skip');
      const doSkip = () => cineSkip();
      CINE.skip.addEventListener('click', doSkip);
      CINE.skip.addEventListener('touchend', ev => { ev.preventDefault(); doSkip(); }, { passive: false });
      return true;
    } catch (e) { CINE.root = null; return false; }
  }
  function cineSkip() { const r = run; if (r && r.bossIntro && r.bossIntro.cine && r.bossIntro.t > 0.8) r.bossIntro.skip = true; }
  function cineKeyHandler(ev) { if (ev && (ev.key === 'Enter')) cineSkip(); }
  /** Retire immédiatement tout le DOM / l'état de la cinématique (fin de run, de salle, mort du boss pendant l'intro…) */
  function cineKill() {
    if (CINE.keyFn && typeof document !== 'undefined') { document.removeEventListener('keydown', CINE.keyFn); CINE.keyFn = null; }
    if (CINE.root && CINE.root.parentNode) CINE.root.parentNode.removeChild(CINE.root);
    CINE.root = CINE.top = CINE.bot = CINE.title = CINE.name = CINE.sub = CINE.txt = CINE.line = CINE.skip = null;
    CINE.on = false; CINE.k = 0; CINE.kTarget = 0; CINE.pos = null; CINE.look = null;
  }
  /** La caméra de cinématique passe APRÈS la caméra du core : on enveloppe renderer.render une seule fois */
  function cinePatchRenderer() {
    if (CINE.patched) return;
    const rd = G.core && G.core.renderer;
    if (!rd || typeof rd.render !== 'function') return;
    CINE.patched = true;
    const orig = rd.render;
    rd.render = function () {
      if (CINE.k > 0.001 && CINE.pos && CINE.look) {
        try {
          const cam = G.core.camera, f = G.core.camFocus;
          if (cam && cam.position && cam.lookAt) {
            const k = CINE.k;
            cam.position.set(lerp(cam.position.x, CINE.pos.x, k), lerp(cam.position.y, CINE.pos.y, k), lerp(cam.position.z, CINE.pos.z, k));
            cam.lookAt(lerp(f.x * 0.9, CINE.look.x, k), lerp(0, CINE.look.y, k), lerp(f.z - 1.2, CINE.look.z, k));
          }
        } catch (e) { /* rien */ }
      }
      return orig.apply(this, arguments);
    };
  }
  function cineStart(b, def, mini, cam, dur) {
    const r = run, intro = def.intro || {};
    CINE.outT = 0;
    const ok = cineEnsureDom();
    cinePatchRenderer();
    CINE.on = true; CINE.pos = V3(0, 14, 14); CINE.look = V3(b.pos.x, 1, b.pos.z); CINE.k = 0; CINE.kTarget = 1;
    const ttl = String(intro.title || ((def.name || '') + (def.title ? ' — ' + def.title : '')));
    const parts = ttl.split(/\s+[—–-]\s+/);
    const nm = parts[0] || def.name || 'Boss';
    const sb = parts.length > 1 ? parts.slice(1).join(' — ') : (def.title && ttl.indexOf(def.title) < 0 ? def.title : '');
    r.bossIntro.cine = { cam, dur, ok, name: nm, sub: sb, text: intro.text || '', line: (def.lines && def.lines.intro) || '', titleOn: false, lineOn: false, titleOff: false };
    if (ok) {
      CINE.name.textContent = nm; CINE.sub.textContent = sb; CINE.txt.textContent = intro.text || '';
      CINE.line.textContent = r.bossIntro.cine.line ? '« ' + r.bossIntro.cine.line + ' »' : '';
      void CINE.root.offsetWidth;
      CINE.root.classList.add('on');
      if (!CINE.keyFn) { CINE.keyFn = cineKeyHandler; document.addEventListener('keydown', CINE.keyFn); }
    }
  }
  function cineCamera(b, it, dt) {
    const c = it.cine;
    if (!c || !CINE.pos) return;
    const u = clamp(it.t / c.dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    const sc = clamp(b.r / 1.4, 0.85, 2.3), bh = Math.max(1.5, b.height);
    let px, py, pz;
    const lx = b.pos.x, lz = b.pos.z;
    let ly = bh * 0.5;
    if (c.cam === 'orbit') {
      const ang = -0.5 + e * 2.3, rad = lerp(17, 10.5, e) * sc;
      px = lx + Math.sin(ang) * rad; pz = lz + Math.cos(ang) * rad; py = lerp(11, 5.5, e) * sc * 0.8 + bh * 0.3;
    } else if (c.cam === 'dolly') {
      px = lx + lerp(-3.5, 1.5, e) * sc; pz = lz + lerp(27, 11, e) * sc; py = lerp(13, 4.2, e) * sc * 0.8 + bh * 0.25; ly = bh * lerp(0.45, 0.7, e);
    } else {   // drop : plongée depuis le ciel qui suit la chute
      px = lx; pz = lz + lerp(15, 11.5, e) * sc; py = lerp(24, 8, e) * sc * 0.85 + bh * 0.2;
      ly = Math.max(bh * 0.5, b.pos.y * 0.6);
    }
    CINE.pos.set(px, py, pz); CINE.look.set(lx, ly, lz);
    // fondu d'entrée / de sortie du plan de caméra
    const tIn = Math.min(1, it.t / 0.45), tOut = c.dur - it.t < 0.55 ? Math.max(0, (c.dur - it.t) / 0.55) : 1;
    CINE.k = tIn * tOut;
  }
  /** Textes (titre, réplique) et barres selon l'avancement */
  function cineOverlay(it) {
    const c = it.cine;
    if (!c || !c.ok || !CINE.root) return;
    if (!c.titleOn && it.landed && it.t >= it.landT + 0.15) { c.titleOn = true; CINE.title.classList.add('show'); }
    if (c.titleOn && !c.titleOff && it.t >= c.dur - 0.9) { c.titleOff = true; CINE.title.classList.remove('show'); }
    if (!c.lineOn && c.line && it.t >= Math.max(it.landT + 1.1, c.dur * 0.5)) { c.lineOn = true; CINE.line.classList.add('show'); }
    if (c.lineOn && !c.lineOff && it.t >= c.dur - 0.45) { c.lineOff = true; CINE.line.classList.remove('show'); }
  }
  function cineEnd() {
    // les barres se rétractent (transition CSS) puis le DOM est retiré par cineTick ; la caméra se fond dans celle du core
    CINE.kTarget = 0;
    if (CINE.root) { CINE.root.classList.remove('on'); if (CINE.title) CINE.title.classList.remove('show'); if (CINE.line) CINE.line.classList.remove('show'); }
    CINE.outT = 0.8;
    if (CINE.keyFn && typeof document !== 'undefined') { document.removeEventListener('keydown', CINE.keyFn); CINE.keyFn = null; }
  }
  /** Appelé chaque image : décompte de la sortie (retrait du DOM) et filet de sécurité (intro annulée de l'extérieur) */
  function cineTick(dt) {
    const r = run;
    const active = !!(r && r.bossIntro && r.bossIntro.cine);
    if (!active && CINE.on && !CINE.outT) cineEnd();
    if (CINE.outT > 0) {
      CINE.outT -= dt; CINE.k = Math.max(0, CINE.k - dt / 0.45);
      if (CINE.outT <= 0) { CINE.outT = 0; cineKill(); }
    }
  }

  /** Intro cinématique v5 : def.intro {duration, camera:'orbit'|'dolly'|'drop', text, title, music, fx} */
  function startBossIntro(bossId, mini) {
    const r = run;
    const def = bossDef(bossId || (r.dungeon && r.dungeon.boss) || 'golem');
    const b = createBoss(def, 0, -5, mini);
    const intro = def.intro || {};
    const cam = (intro.camera === 'orbit' || intro.camera === 'dolly' || intro.camera === 'drop') ? intro.camera : 'drop';
    const dur = clamp(num(intro.duration, mini ? 3.2 : 4.5), 2.2, 9);
    if (cam === 'drop') b.pos.y = 18; else { b.pos.y = -3; b.mesh.scale.setScalar(0.01); }
    r.bossIntro = { t: 0, landed: false, landT: cam === 'drop' ? 0.9 : 1.0, dur, cam, skip: false };
    if (G.BossAttacks && G.BossAttacks.config) G.BossAttacks.config.noLines = true;
    if (r.player) r.player.invuln = Math.max(r.player.invuln || 0, 0.2);
    HUD('setBoss', null, 0);
    r.hudCache.boss = undefined;
    cineStart(b, def, mini, cam, dur);
    emit('enemySpawn', { enemy: b });
    // musique de boss (l'audio démarre déjà boss_<id> sur enemySpawn ; ici : musique propre à l'intro si elle diffère)
    if (!mini && G.Audio && typeof G.Audio.music === 'function') safe(G.Audio, 'music', [intro.music || ('boss_' + def.id), { fade: 0.8 }]);
  }
  function bossLanded(b, it, silent) {
    const r = run;
    it.landed = true;
    b.pos.y = 0;
    b.mesh.scale.setScalar(b.baseScale);
    const intro = b.def.intro || {};
    if (silent) return;
    sfx('bossRoar'); sfx('slam');
    shake(1.0);
    FX('ring', V3(b.pos.x, 0.05, b.pos.z), 0xffffff, 6, 0.8);
    FX('burst', V3(b.pos.x, 0.5, b.pos.z), BURST_COLORS[b.def.model] || 0xd8d0c0, 40, { speed: 8, up: 4, life: 0.9, size: 0.3, gravity: 10 });
    const fxn = intro.fx;
    if (typeof fxn === 'string' && fxn && fxn !== 'shake') {
      if (fxn === 'flash') safe(G.VFX, 'screenFlash', [intro.color || 0xffffff, 0.4]);
      else safe(G.VFX, 'play', [fxn, V3(b.pos.x, 0, b.pos.z), { color: intro.color }]);
    }
    if (!(it.cine && it.cine.ok)) {
      banner('<b>' + (b.def.name || 'Boss') + '</b>' + (b.def.title ? '<br><small>' + b.def.title + '</small>' : ''), 2.2);
    }
    const p = r.player, dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d < b.r + 2) { p.pos.x += (dx / (d || 1)) * (b.r + 2 - d); p.pos.z += (dz / (d || 1)) * (b.r + 2 - d); }
  }
  function updateBossIntro(dt, time) {
    const r = run, it = r.bossIntro, b = r.boss;
    if (!it || !b) { r.bossIntro = null; return; }
    it.t += dt;
    // le joueur est intouchable pendant l'intro
    if (r.player && !r.player.dead) r.player.invuln = Math.max(r.player.invuln || 0, 0.15);
    const lt = it.landT;
    if (it.skip && !it.landed) bossLanded(b, it, true);
    if (!it.landed) {
      if (it.t < lt) {
        const k = it.t / lt;
        if (it.cam === 'drop') {
          b.pos.y = 18 * (1 - k * k);
          FX('trail', V3(b.pos.x, b.pos.y + 1, b.pos.z), 0xffffff, 0.4);
        } else {       // le boss prend forme : monte du sol en grandissant
          const g = easeOutBack(clamp(k, 0, 1));
          b.pos.y = -3 * (1 - clamp(k, 0, 1)); b.mesh.scale.setScalar(Math.max(0.01, b.baseScale * g));
          if (r.frame % 4 === 0) FX('burst', V3(b.pos.x, 0.3, b.pos.z), 0x8a6cff, 4, { speed: 3, up: 2, life: 0.5, size: 0.2 });
        }
      } else bossLanded(b, it, false);
    } else {
      safe(G.GFX, 'animateCharacter', [b.mesh, time, { moving: false, windup: clamp((it.t - lt) * 2, 0, 1), attack: 0 }]);
    }
    if (it.cine) { cineCamera(b, it, dt); cineOverlay(it); }
    const total = it.cine ? it.dur : 2.6;
    if (it.t >= total || (it.skip && it.landed)) {
      r.bossIntro = null;
      cineEnd();
      b.state = 'idle'; b.cd = 1.0;
      if (r.player) r.player.invuln = Math.max(r.player.invuln || 0, 0.6);
      HUD('setBoss', b.def.name, 1);
      r.hudCache.boss = b.def.name;
      safe(G.BossAttacks, 'attach', [b]);
      applyBossPhase(b, phaseIndexOf(b), true);
    }
  }

  // --- phases ------------------------------------------------------------
  function phaseIndexOf(b) {
    const ph = b.def.phases;
    if (ph && ph.length) {
      const f = b.pvMax > 0 ? b.pv / b.pvMax : 1;
      let idx = 0;
      for (let i = 0; i < ph.length; i++) if (f <= num(ph[i].at, 1) + 1e-9) idx = i;
      return idx + 1;
    }
    return b.pv / b.pvMax <= num(b.def.phase2At, 0.5) ? 2 : 1;
  }
  function currentPhase(b) {
    const ph = b.def.phases;
    return ph && ph[b.phase - 1] ? ph[b.phase - 1] : { n: b.phase, attacks: b.def.attacks, speedMult: b.phase > 1 ? 1.3 : 1, dmgMult: 1, cdMult: b.phase > 1 ? 0.65 : 1 };
  }
  const bossLineHtml = (b, line) => '<b>' + (b.def.name || 'Boss') + '</b><br><i>« ' + line + ' »</i>';
  function applyBossPhase(b, n, silent) {
    b.phase = n;
    b.phase2 = n >= 2;
    const ph = currentPhase(b);
    b.speed = b.baseSpeed * num(ph.speedMult, 1);
    b.dmg = b.baseDmg * num(ph.dmgMult, 1);
    b.attackCd = b.baseCd * num(ph.cdMult, 1);
    if (silent) return;
    const pl = b.def.lines && b.def.lines['phase' + n];
    banner(ph.banner || (pl ? bossLineHtml(b, pl) : ((b.def.name || 'Le boss') + " s'énerve !")), 2.0);
    sfx('bossRoar'); shake(0.7);
    FX('ring', V3(b.pos.x, 0.05, b.pos.z), 0xff2020, 5, 0.7);
    FX('burst', V3(b.pos.x, b.height * 0.7, b.pos.z), 0xff2020, 30, { speed: 6, up: 5, life: 0.8, size: 0.25 });
    const eyes = (b.mesh.userData && b.mesh.userData.eyes) || [];
    eyes.forEach(m => {
      if (!m) return;
      if (m.color) m.color.setHex(0xff1010);
      if (m.emissive) setBaseEmissive(b.flash, m, 0xff0000);
      if ('emissiveIntensity' in m) m.emissiveIntensity = 2.5;
    });
    emit('bossPhase', { boss: b, phase: n });
  }
  function checkPhase(b) {
    if (b.dead || b.pv <= 0 || run.bossIntro) return;
    const n = phaseIndexOf(b);
    if (n > b.phase) applyBossPhase(b, n, false);
  }

  /** Équipement de boss (def.gear = source de vérité, dungeon.reward.bossGear ignoré) + def.rewards [{id,chance,qty}] */
  function grantBossRewards(b) {
    const def = b.def || {};
    safe(G.BossInfo, 'registerItems');
    const list = [];
    const bases = G.ITEMS && G.ITEMS.bases;
    if (def.gear && def.gear.id && bases && bases[def.gear.id] && rngChance(num(def.gearChance, b.mini ? 0.18 : 0.45))) list.push({ id: def.gear.id, count: 1 });
    (Array.isArray(def.rewards) ? def.rewards : []).forEach(rw => {
      if (!rw || !rw.id || !rngChance(num(rw.chance, 1))) return;
      const q = rw.qty;
      list.push({ id: rw.id, count: Array.isArray(q) ? rngInt(num(q[0], 1), num(q[1], num(q[0], 1))) : Math.max(1, num(q, 1)) });
    });
    if (list.length) dropEntries(list, b.pos.x, b.pos.z, { source: 'boss' });
  }
  function bossDefeated(b) {
    const r = run;
    const mini = !!b.mini;
    profile.stats.bosses = (profile.stats.bosses || 0) + (mini ? 0 : 1);
    if (mini) profile.stats.miniBosses = (profile.stats.miniBosses || 0) + 1;
    HUD('setBoss', null, 0);
    r.hudCache.boss = null;
    if (r.boss === b) r.boss = null;
    if (b.extHandle) { b.extHandle.done = true; b.extHandle = null; }
    // les sbires disparaissent
    r.enemies.forEach(e => { if (!e.dead && !e.boss) { e.dead = true; e.label.remove(); removeTele(e.tele); r.corpses.push({ mesh: e.mesh, t: 0.3, s: e.mesh.scale.x, flash: e.flash }); } });
    r.tdirty = true;
    r.strikes.forEach(s => removeTele(s.tele)); r.strikes = [];
    r.shocks.forEach(s => removeTele(s.tele)); r.shocks = [];
    r.projectiles.forEach(pr => { if (pr.owner === 'enemy') { pr.dead = true; sceneRemove(pr.mesh); } });
    const g = b.def.gold;
    let gold = Array.isArray(g) ? randint(num(g[0], 0), num(g[1], num(g[0], 0))) : Math.round(num(g, 0));
    const st = r.player.stats || {};
    let xp = Math.round(num(b.def.xp, 100) * num(st.xpMult, 1));
    gold = Math.round(gold * num(st.goldMult, 1));
    xp = Math.round(hook('xpGain', xp, { enemy: b, run: r, source: 'boss' }));
    gold = Math.round(hook('goldGain', gold, { enemy: b, run: r, source: 'boss' }));
    dropLoot(b.pos.x, b.pos.z, xp, gold, 0, mini ? 8 : 12);
    grantBossRewards(b);
    emit('bossKilled', { boss: b, run: r, pos: b.pos, mini, rank: b.rank });
    const dl = b.def.lines && b.def.lines.death;
    const dlay = dl ? 1.7 : 0;
    if (dl) banner(bossLineHtml(b, dl), 1.9);
    if (mini) {
      roomCleared(true);
      const mk = () => { if (run === r && !r.finished) { sfx('victory'); banner('Mini-boss vaincu !<br><small>' + (b.def.name || '') + '</small>', 1.8); } };
      if (dlay) addTimer(dlay, mk, true); else mk();
      return;
    }
    r.ended = 'victory';
    const vk = () => { if (run === r && !r.finished) { sfx('victory'); banner('VICTOIRE !<br><small>' + (b.def.name || 'Le boss') + ' est vaincu</small>', 2.4); } };
    if (dlay) addTimer(dlay, vk); else vk();
    addTimer(2.8 + dlay, () => finishRun(true));
  }

  // --- IA du boss ---------------------------------------------------------
  function updateBoss(b, dt, u, d, out) {
    const r = run, p = tgtP();
    if (r.bossIntro) return;
    checkPhase(b);     // PV modifiés hors dégâts (QA, mécaniques) : la phase suit quand même
    if (b.staggered && b.state === 'idle') { out.face = u; return; }
    if (b.state === 'idle') {
      if (!p.dead && d > b.r + p.r + 1.8) { out.vx = u.x * b.speed * b.speedMult; out.vz = u.z * b.speed * b.speedMult; }
      out.face = u;
      if (b.cd <= 0 && !p.dead) startBossAttack(b);
    } else if (b.state === 'attack' && b.atk) {
      updateBossAttack(b, dt, u, d, out);
    } else if (b.state === 'ext') {
      // attaque externe G.BossAttacks : elle déplace / anime le boss elle-même
      b.extT += dt;
      const h = b.extHandle;
      if (!h || h.done || b.extT > 20) { b.extHandle = null; b.__attack = null; b.state = 'idle'; b.cd = b.attackCd; }
      else out.face = u;
    } else {
      b.state = 'idle';
    }
  }
  function startBossAttack(b) {
    const ph = currentPhase(b);
    const list = Array.isArray(ph.attacks) && ph.attacks.length ? ph.attacks : (Array.isArray(b.def.attacks) && b.def.attacks.length ? b.def.attacks : ['rock', 'slam']);
    let name = choice(list);
    if (list.length > 1 && name === b.lastAtk) name = choice(list);
    b.lastAtk = name;
    if (!NATIVE_BOSS_ATK[name] && G.BossAttacks && G.BossAttacks.has && G.BossAttacks.has(name)) {
      let h = null;
      try { h = G.BossAttacks.start(name, b, { n: b.phase, speedMult: num(currentPhase(b).speedMult, 1), dmgMult: num(currentPhase(b).dmgMult, 1), cdMult: num(currentPhase(b).cdMult, 1), count: (b.def.phases || []).length }); }
      catch (err) { console.warn('[game] BossAttacks ' + name, err); }
      if (h && typeof h === 'object') { b.state = 'ext'; b.extHandle = h; b.__attack = h; b.extT = 0; return; }
      name = 'slam';
    }
    b.state = 'attack';
    b.atk = { name, t: 0, stage: 0, n: 0 };
  }
  function endBossAttack(b) {
    removeTele(b.tele); b.tele = null;
    b.state = 'idle';
    b.atk = null;
    b.cd = b.attackCd;
  }
  /** Chaque attaque a un windup lisible (lueur + animation + télégraphe au sol) */
  function updateBossAttack(b, dt, u, d, out) {
    const r = run, p = r.player, a = b.atk, p2 = b.phase2;
    a.t += dt;
    const proj = enemyProjType(b);
    switch (a.name) {
      case 'slam': {
        // cercle sur la position du joueur qui se remplit puis frappe
        if (a.stage === 0) {
          const rad = p2 ? 4 : 3.2, dur = p2 ? 0.8 : 1.1;
          addStrike(p.pos.x, p.pos.z, rad, dur, b.dmg * 2, 0, 'slam', b);
          a.dur = dur; a.stage = 1;
          if (p2) addStrike(p.pos.x + (Math.random() - 0.5) * 6, p.pos.z + (Math.random() - 0.5) * 6, rad * 0.8, dur + 0.3, b.dmg * 1.6, 0, 'slam');
        }
        out.face = u;
        out.windup = clamp(a.t / a.dur, 0, 1);
        warnFlash(b, 0.4 * out.windup, 0xff8030);
        if (a.t > a.dur) out.attack = clamp(1 - (a.t - a.dur) / 0.4, 0, 1);
        if (a.t >= a.dur + 0.5) endBossAttack(b);
        break;
      }
      case 'wave': {
        // anneau qui s'étend depuis le boss : à esquiver en roulade
        const wu = p2 ? 0.6 : 0.8;
        out.face = u;
        if (a.stage === 0) {
          out.windup = a.t / wu; warnFlash(b, 0.5 * out.windup, 0xff8030);
          if (!a.tele) { a.tele = makeTele('circle', 2.2); a.tele.position.set(b.pos.x, 0, b.pos.z); b.tele = a.tele; }
          a.tele.userData.setProgress(out.windup);
          if (a.t >= wu) { removeTele(a.tele); a.tele = null; b.tele = null; addShock(b.pos.x, b.pos.z, p2 ? 10 : 8, 20, b.dmg * 1.5); a.stage = 1; out.attack = 1; }
        } else if (a.stage === 1) {
          out.attack = 0.6;
          if (p2 && a.t >= wu + 0.55) { addShock(b.pos.x, b.pos.z, 10, 20, b.dmg * 1.5); a.stage = 2; }
          else if (!p2 && a.t >= wu + 0.6) endBossAttack(b);
        } else if (a.t >= wu + 1.0) endBossAttack(b);
        break;
      }
      case 'summon': {
        const wu = 0.9;
        out.windup = Math.min(1, a.t / wu);
        warnFlash(b, 0.6 * out.windup, 0xb46bff);
        if (a.stage === 0 && a.t >= wu) {
          a.stage = 1; out.attack = 1;
          bossSummon(b, p2 ? 4 : 2);
        }
        if (a.t >= wu + 0.5) endBossAttack(b);
        break;
      }
      case 'charge': {
        const LEN = 20;
        if (a.stage === 0) {
          if (!a.lock) {
            a.lock = { x: u.x, z: u.z };
            b.tele = makeTele('line', LEN);
          }
          out.face = a.lock;
          const wu = p2 ? 0.65 : 0.9;
          out.windup = a.t / wu;
          warnFlash(b, 0.5 * out.windup, 0xff4020);
          placeLine(b.tele, b.pos.x, b.pos.z, a.lock, LEN);
          b.tele.userData.setProgress(out.windup);
          if (a.t >= wu) { removeTele(b.tele); b.tele = null; a.stage = 1; a.dist = 0; b.contactCd = 0; b.wallHit = false; a.t2 = 0; sfx('dash'); }
        } else if (a.stage === 1) {
          const sp = p2 ? 20 : 16;
          a.t2 += dt;
          out.vx = a.lock.x * sp; out.vz = a.lock.z * sp; out.face = a.lock; out.attack = 1;
          a.dist += sp * dt;
          FX('trail', V3(b.pos.x, 0.4, b.pos.z), 0xd8d0c0, 0.5);
          if ((b.wallHit && a.t2 > 0.08) || a.dist > LEN) {
            a.stage = 2; a.t = 0;
            if (b.wallHit) { shake(0.5); sfx('slam'); FX('burst', V3(b.pos.x, 1, b.pos.z), 0xd8d0c0, 24, { speed: 5, up: 4, life: 0.6, size: 0.25, gravity: 10 }); }
          }
        } else {
          // sonné : fenêtre pour frapper
          out.face = a.lock;
          if (a.t >= (p2 ? 0.7 : 1.0)) endBossAttack(b);
        }
        break;
      }
      case 'spread': {
        const wu = p2 ? 0.5 : 0.65;
        out.face = u;
        if (a.stage === 0) {
          out.windup = a.t / wu; warnFlash(b, 0.5 * out.windup, 0xff8030);
          if (a.t >= wu) { fan(b, u, p2 ? 7 : 5, 1.2, proj, 12, b.dmg); sfx('throw'); a.stage = 1; out.attack = 1; }
        } else if (a.stage === 1) {
          out.attack = 0.5;
          if (p2 && a.t >= wu + 0.35) { fan(b, rot2(u, 0.1), 6, 1.2, proj, 13, b.dmg); sfx('throw'); a.stage = 2; }
          else if (!p2 && a.t >= wu + 0.5) endBossAttack(b);
        } else if (a.t >= wu + 0.8) endBossAttack(b);
        break;
      }
      case 'nova': {
        const wu = p2 ? 0.7 : 0.9;
        out.face = u;
        if (a.stage === 0) {
          out.windup = a.t / wu; warnFlash(b, 0.6 * out.windup, 0xb46bff);
          if (a.t >= wu) { novaRing(b, p2 ? 16 : 12, 0, proj); a.stage = 1; out.attack = 1; }
        } else if (a.stage === 1) {
          out.attack = 0.5;
          if (p2 && a.t >= wu + 0.45) { novaRing(b, 16, Math.PI / 16, proj); a.stage = 2; }
          else if (!p2 && a.t >= wu + 0.6) endBossAttack(b);
        } else if (a.t >= wu + 0.9) endBossAttack(b);
        break;
      }
      case 'rain': {
        // plusieurs cercles annoncés autour du joueur
        if (a.stage === 0) {
          const n = p2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const ox = i === 0 ? 0 : (Math.random() - 0.5) * 8, oz = i === 0 ? 0 : (Math.random() - 0.5) * 8;
            const x = clamp(p.pos.x + ox, -HALF + 1.5, HALF - 1.5), z = clamp(p.pos.z + oz, -HALF + 1.5, HALF - 1.5);
            addStrike(x, z, 1.8, 1.2, b.dmg * 1.5, i * 0.15, 'boom');
          }
          a.end = 1.2 + n * 0.15 + 0.3;
          a.stage = 1;
        }
        out.windup = clamp(a.t / 0.6, 0, 1);
        warnFlash(b, 0.4, 0xff8030);
        if (a.t >= a.end) endBossAttack(b);
        break;
      }
      case 'rock':
      default: {
        // projectile (rocher)
        const wu = p2 ? 0.5 : 0.75;
        if (a.stage === 0) {
          out.face = u;
          out.windup = a.t / wu; warnFlash(b, 0.45 * out.windup, 0xff8030);
          if (a.t >= wu) {
            const type = a.name === 'rock' ? 'rock' : proj;
            fan(b, u, p2 ? 3 : 1, 0.4, type, 13, b.dmg * 1.6);
            sfx('throw');
            a.stage = 1; out.attack = 1;
          }
        } else {
          out.attack = clamp(1 - (a.t - wu) / 0.4, 0, 1);
          if (a.t >= wu + 0.45) endBossAttack(b);
        }
        break;
      }
    }
  }
  function novaRing(b, n, off, type) {
    for (let i = 0; i < n; i++) {
      const ang = off + (i / n) * TAU;
      enemyShoot(b, { x: Math.sin(ang), z: Math.cos(ang) }, type, 9, b.dmg * 0.9);
    }
    sfx('fire');
    FX('ring', V3(b.pos.x, 0.05, b.pos.z), 0xb46bff, 3, 0.4);
  }
  function bossSummon(b, n) {
    const r = run;
    const id = b.def.summon;
    if (!id) return;
    const minions = r.enemies.filter(e => !e.dead && !e.boss).length;
    const count = Math.max(0, Math.min(n, 8 - minions));
    sfx('spawn');
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * TAU;
      let x = clamp(b.pos.x + Math.sin(ang) * (b.r + 2), -HALF + 1, HALF - 1);
      let z = clamp(b.pos.z + Math.cos(ang) * (b.r + 2), -HALF + 1, HALF - 1);
      if (pointBlocked(x, z, 0.6)) { const s = choice(r.room.spawnPoints); x = s[0]; z = s[1]; }
      FX('ring', V3(x, 0.05, z), 0xb46bff, 1.2, 0.5);
      createEnemy(id, x, z, { fromWave: false });
    }
  }

  // --- Frappes au sol (slam, pluie) et ondes (wave) ---------------------
  function addStrike(x, z, radius, dur, dmg, delay, sound) {
    const tele = makeTele('circle', radius);
    tele.position.set(x, 0, z);
    tele.visible = !(delay > 0);
    run.strikes.push({ x, z, r: radius, dur, t: -(delay || 0), dmg, tele, sound: sound || 'slam', done: false });
  }
  function updateStrikes(dt) {
    const r = run, p = r.player;
    for (const s of r.strikes) {
      s.t += dt;
      if (s.t < 0) continue;
      s.tele.visible = true;
      s.tele.userData.setProgress(s.t / s.dur);
      if (s.t >= s.dur) {
        s.done = true;
        removeTele(s.tele);
        if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r + p.r * 0.5) hurtPlayer(s.dmg);
        sfx(s.sound); shake(0.3);
        FX('ring', V3(s.x, 0.05, s.z), 0xffb070, s.r, 0.4);
        FX('burst', V3(s.x, 0.3, s.z), 0xd8d0c0, 16, { speed: 5, up: 5, life: 0.6, size: 0.22, gravity: 12 });
      }
    }
    r.strikes = r.strikes.filter(s => !s.done);
    for (const w of r.shocks) {
      w.rad += w.speed * dt;
      w.tele.scale.set(w.rad, 1, w.rad);
      w.tele.userData.setProgress(1);
      if (!w.hitDone && !p.dead) {
        const d = Math.hypot(p.pos.x - w.x, p.pos.z - w.z);
        if (Math.abs(d - w.rad) < 0.65 && hurtPlayer(w.dmg)) w.hitDone = true;
      }
      w.ftT -= dt;
      if (w.ftT <= 0) {
        w.ftT = 0.05;
        const ang = Math.random() * TAU;
        FX('trail', V3(w.x + Math.sin(ang) * w.rad, 0.3, w.z + Math.cos(ang) * w.rad), 0xffb070, 0.4);
      }
      if (w.rad >= w.maxR) { w.done = true; removeTele(w.tele); }
    }
    r.shocks = r.shocks.filter(w => !w.done);
  }
  function addShock(x, z, speed, maxR, dmg) {
    const tele = makeTele('ring', 1);
    tele.position.set(x, 0, z);
    tele.scale.set(0.6, 1, 0.6);
    run.shocks.push({ x, z, rad: 0.6, speed, maxR, dmg, tele, hitDone: false, done: false, ftT: 0 });
    sfx('slam'); shake(0.4);
  }

  // ===================================================================
  // 18. PROJECTILES
  // ===================================================================
  /**
   * o : {type|model, owner:'player'|'minion'|'enemy', x,z | pos, y, dir, speed, range | life(s), dmg | damage, element,
   *      pierce, radius, homing, onHit(enemy), onEnd(pos), explode, fizzle, slow, weapon/stats (kit v2), crit, source}
   */
  function spawnProjectile(o) {
    const r = run;
    const type = o.type || o.model || 'orb';
    const pos = o.pos;
    const x = pos ? pos.x : o.x, z = pos ? pos.z : o.z;
    const y = pos && pos.y > 0 ? pos.y : (o.y !== undefined ? o.y : 1.0);
    const dir = norm2(o.dir ? o.dir.x : 0, o.dir ? o.dir.z : 1);
    const mesh = makeProjectileMesh(type);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    r.root.add(mesh);
    const speed = Math.max(1, o.speed || 10);
    const life = o.life !== undefined ? o.life : (o.range || 14) / speed;
    const owner = o.owner || 'player';
    const pr = {
      mesh, type, owner, vx: dir.x * speed, vz: dir.z * speed, speed,
      life, dmg: num(o.dmg !== undefined ? o.dmg : o.damage, 0), crit: !!o.crit, radius: o.radius || 0.3,
      pierce: o.pierce === true ? 99 : (o.pierce || 0), hits: [], weapon: o.weapon || null, stats: o.stats || null,
      explode: o.explode || null, fizzle: !!o.fizzle, slow: o.slow || 0, trailT: 0, dead: false, element: o.element || 'physique',
      color: TRAIL_COLORS[type] || (o.element && EL_HEX[o.element]) || 0xffffff,
      homing: num(o.homing, 0), onHit: o.onHit || null, onEnd: o.onEnd || null, counter: !!r.castCounter,
      source: o.source || (owner === 'minion' ? 'minion' : 'player'), knockback: num(o.knockback, 0), tags: o.tags || null,
      dodgeChecked: false, ownerRef: o.ownerRef || null, netLocal: !!o.netLocal, visual: !!o.visual,
    };
    if (net.role && owner === 'player' && pr.source === 'player' && !o.visual && (net.rec || clockTime < num(net.recLate, -1))) {
      const ent = ['p', String(type).slice(0, 16), r2(x), r2(y), r2(z), r2(dir.x), r2(dir.z), r2(speed), r2(life), String(pr.element).slice(0, 12), r2(pr.radius)];
      if (net.rec) { if (net.rec.length < 6) net.rec.push(ent); } else netCall('fx', [ent]);      // projectile différé : envoyé seul (visuel)
    }
    r.projectiles.push(pr);
    return pr;
  }
  function endProjectile(pr) {
    if (pr.dead) return;
    pr.dead = true;
    const m = pr.mesh.position;
    if (pr.onEnd) { try { pr.onEnd({ x: m.x, y: m.y, z: m.z }); } catch (e) { console.warn('[game] onEnd', e); } }
    if (pr.explode) explode(m.x, m.z, pr.explode.radius, pr.dmg, pr.crit, pr.explode);
    else if (pr.fizzle) FX('burst', V3(m.x, m.y, m.z), 0x8a8a8a, 10, { speed: 1.5, up: 2, life: 0.6, size: 0.2 });
    else FX('burst', V3(m.x, m.y, m.z), pr.color, 5, { speed: 2.5, up: 1.5, life: 0.3, size: 0.1 });
    sceneRemove(pr.mesh);
  }
  /** Explosion de la boule de feu v2 (zone + brûlure éventuelle) */
  function explode(x, z, radius, dmg, crit, ex) {
    sfx('boom'); shake(0.3); hitStop(0.04);
    FX('burst', V3(x, 0.8, z), 0xff8a2a, 26, { speed: 6, up: 4, life: 0.6, size: 0.25 });
    FX('burst', V3(x, 0.8, z), 0xffe070, 10, { speed: 3, up: 3, life: 0.4, size: 0.2 });
    FX('ring', V3(x, 0.05, z), 0xff8a2a, radius, 0.45);
    const list = targetables().slice();
    for (const e of list) {
      const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz);
      if (d - e.r > radius) continue;
      damageEnemy(e, dmg, { crit, kx: dx / (d || 1), kz: dz / (d || 1), kb: 7, weapon: ex.stats, element: 'feu', kind: 'aoe' });
      if (ex.burn && typeof ex.burn !== 'object') applyBurn(e, ex.burn, dmg);
    }
    if (ex.burn && typeof ex.burn === 'object') addPuddle(x, z, ex.burn);
  }
  /** Flaque de feu : dps fixe (PAS multiplié par dmgMult, cf. content.js) */
  function addPuddle(x, z, burn) {
    const r = run;
    const rad = num(burn.radius, 2.4);
    let mesh = null;
    try {
      mesh = new THREE.Mesh(new THREE.CircleGeometry(rad, 28), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.45, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.04, z);
      r.root.add(mesh);
    } catch (e) { mesh = null; }
    r.puddles.push({ x, z, r: rad, dps: num(burn.dps, 20), t: num(burn.duration, 3), dur: num(burn.duration, 3), tick: 0.25, fxT: 0, mesh });
  }
  function updatePuddles(dt) {
    const r = run;
    for (const pd of r.puddles) {
      pd.t -= dt; pd.tick -= dt; pd.fxT -= dt;
      if (pd.mesh) pd.mesh.material.opacity = 0.45 * clamp(pd.t / 0.6, 0, 1);
      if (pd.fxT <= 0) {
        pd.fxT = 0.08;
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * pd.r;
        FX('trail', V3(pd.x + Math.sin(a) * d, 0.15, pd.z + Math.cos(a) * d), Math.random() < 0.5 ? 0xff8a2a : 0xffd23f, 0.3);
      }
      if (pd.tick <= 0) {
        pd.tick = 0.5;
        const dmg = Math.max(1, Math.round(pd.dps * 0.5));
        for (const e of targetables()) {
          if (Math.hypot(e.pos.x - pd.x, e.pos.z - pd.z) < pd.r + e.r * 0.5) damageEnemy(e, dmg, { burn: true });
        }
      }
      if (pd.t <= 0 && pd.mesh) { sceneRemove(pd.mesh); pd.mesh.geometry.dispose(); pd.mesh.material.dispose(); pd.mesh = null; }
    }
    r.puddles = r.puddles.filter(pd => pd.t > 0);
  }

  function updateProjectiles(dt) {
    const r = run, p = r.player;
    const list = r.projectiles;
    for (let i = 0; i < list.length; i++) {
      const pr = list[i];
      if (pr.dead) continue;
      const m = pr.mesh.position;
      // guidage
      if (pr.homing > 0 && pr.owner !== 'enemy' && !pr.visual) {
        let best = null, bd = 1e9;
        const tg = targetables();
        for (let k = 0; k < tg.length; k++) {
          const e = tg[k];
          if (pr.hits.indexOf(e) >= 0) continue;
          const d = Math.hypot(e.pos.x - m.x, e.pos.z - m.z);
          if (d < bd && d < 12) { bd = d; best = e; }
        }
        if (best) {
          const cur = Math.atan2(pr.vx, pr.vz), want = Math.atan2(best.pos.x - m.x, best.pos.z - m.z);
          const na = cur + clamp(angleNorm(want - cur), -pr.homing * dt * 3, pr.homing * dt * 3);
          pr.vx = Math.sin(na) * pr.speed; pr.vz = Math.cos(na) * pr.speed;
          pr.mesh.rotation.y = na;
        }
      }
      m.x += pr.vx * dt; m.z += pr.vz * dt;
      pr.life -= dt;
      pr.trailT -= dt;
      if (pr.trailT <= 0) { pr.trailT = 0.03; FX('trail', V3(m.x, m.y, m.z), pr.color, pr.type === 'fireball' ? 0.4 : 0.22); }
      if (pointBlocked(m.x, m.z, pr.radius * 0.4) || Math.abs(m.x) > HALF + 1 || Math.abs(m.z) > HALF + 1) { endProjectile(pr); continue; }
      if (pr.visual) {
        /* projectile rejoué d'un allié : visuel seulement, aucune collision ni dégât */
      } else if (pr.owner !== 'enemy') {
        const tg = targetables();
        for (let k = 0; k < tg.length; k++) {
          const e = tg[k];
          if (pr.hits.indexOf(e) >= 0) continue;
          if (Math.hypot(e.pos.x - m.x, e.pos.z - m.z) > e.r + pr.radius) continue;
          if (pr.fizzle) { FX('text', V3(e.pos.x, e.height + 0.2, e.pos.z), '0', '#b0b0b0', 0.8); endProjectile(pr); break; }
          if (pr.explode) { endProjectile(pr); break; }
          const n = norm2(pr.vx, pr.vz);
          if (pr.stats) {       // kit v2 : dégâts calculés à l'impact
            const res = calcul_degats(playerForce(pr.weapon), pr.stats || { min: pr.dmg, max: pr.dmg });
            damageEnemy(e, res.dmg, { crit: res.crit, kx: n.x, kz: n.z, kb: num(pr.stats && pr.stats.knockback, 3), weapon: pr.stats, kind: 'projectile' });
            if (pr.stats.burn) applyBurn(e, pr.stats.burn, res.dmg);
          } else {
            const prev = r.castCounter; r.castCounter = pr.counter;
            dealDamage(e, pr.dmg, { element: pr.element, kind: 'projectile', source: pr.source, kx: n.x, kz: n.z, kb: pr.knockback * 4, tags: pr.tags, crit: pr.crit ? true : undefined, noCharge: pr.source !== 'player' });
            r.castCounter = prev;
          }
          if (pr.onHit) { try { pr.onHit(e); } catch (err) { console.warn('[game] onHit', err); } }
          sfx('hit');
          pr.hits.push(e);
          if (pr.hits.length > pr.pierce) { endProjectile(pr); break; }
        }
      } else {
        if (!p.dead && Math.hypot(p.pos.x - m.x, p.pos.z - m.z) < p.r + pr.radius) {
          if (p.invuln > 0) {
            if (!pr.dodgeChecked) { pr.dodgeChecked = true; hurtPlayer(pr.dmg, { slow: pr.slow, element: pr.element, source: 'projectile' }); }
          } else {
            const kb = pr.stats; void kb;
            hurtPlayer(pr.dmg, { slow: pr.slow, element: pr.element, source: 'projectile' }); endProjectile(pr); continue;
          }
        }
        if (net.role === 'host' && !pr.dead && !pr.netLocal) {     // projectiles ennemis contre les alliés distants (pas les pièges : locaux à chaque joueur)
          const rl = net.remotes() || [];
          let hitR = null;
          for (let k = 0; k < rl.length; k++) { const q = rl[k]; if (q && !q.dead && q.pos && Math.hypot(q.pos.x - m.x, q.pos.z - m.z) < num(q.r, 0.5) + pr.radius) { hitR = q; break; } }
          if (hitR) { netCall('hurtRemote', hitR, pr.dmg, { slow: pr.slow, element: pr.element, source: 'projectile' }); endProjectile(pr); continue; }
        }
      }
      if (!pr.dead && pr.life <= 0) endProjectile(pr);
    }
    r.projectiles = list.filter(pr => !pr.dead);
  }

  // ===================================================================
  // 19. BUFFS, FRAPPES RETARDÉES (aoe), SERVITEURS
  // ===================================================================
  function addBuff(o) {
    const r = run;
    if (!r || !o) return null;
    const id = o.id || ('buff' + Math.random().toString(36).slice(2, 6));
    const dur = num(o.duration, 5);
    const cur = r.buffs[id];
    if (cur) { cur.t = dur; cur.dur = dur; cur.stats = o.stats || cur.stats; }
    else r.buffs[id] = { id, t: dur, dur, stats: o.stats || {}, name: o.name || null, icon: o.icon || null, vfx: o.vfx || null, fxT: 0 };
    recomputeStats();
    if (o.vfx && G.VFX && G.VFX.play) safe(G.VFX, 'play', [o.vfx, r.player.pos, { color: o.color, duration: dur }]);
    return r.buffs[id];
  }
  function removeBuff(id) {
    const r = run;
    if (!r || !r.buffs[id]) return;
    delete r.buffs[id];
    recomputeStats();
  }
  /** Fait vieillir les buffs ; renvoie vrai si la liste a changé (stats à recalculer) */
  function updateBuffs(dt) {
    const r = run, p = r.player;
    let changed = false;
    for (const id in r.buffs) {
      const b = r.buffs[id];
      b.t -= dt;
      if (b.t <= 0) { delete r.buffs[id]; changed = true; }
    }
    if (changed) recomputeStats();
    const st = p.stats || {};
    p.stunned = num(st.stun, 0) > 0 ? 0.2 : Math.max(0, p.stunned - dt);
    return changed;
  }
  function buffsForHud() {
    const r = run, out = [];
    const sk = useSkills() && G.Skills.buffsForHud ? safe(G.Skills, 'buffsForHud') : null;
    if (sk && sk.length) for (let i = 0; i < sk.length; i++) out.push(sk[i]);
    if (r) {
      for (const id in r.buffs) {
        const b = r.buffs[id];
        if (b.name) out.push({ icon: b.icon || '✨', timeFrac: clamp(b.t / b.dur, 0, 1), name: b.name });
      }
      if (r.ultimate) out.push({ icon: '⚔️', timeFrac: 1, name: 'Arme ultime' });
    }
    return out;
  }

  // --- zones d'effet (immédiates ou retardées + télégraphe) ------------------
  function aoe(o) {
    const r = run;
    if (!r || !o) return null;
    const pos = o.pos || r.player.pos;
    const rad = num(o.radius, 2);
    const delay = num(o.delay, 0);
    if (delay > 0) {
      const a = { x: pos.x, z: pos.z, rad, t: 0, dur: delay, o, tele: null, done: false };
      if (o.telegraph !== false) {
        a.tele = makeTele('circle', rad);
        a.tele.position.set(a.x, 0, a.z);
      }
      r.aoes.push(a);
      return a;
    }
    resolveAoe(o, pos.x, pos.z, rad);
    return null;
  }
  function aoeVfx(o, x, z, rad) {
    const el = o.element || 'physique';
    const pos = V3(x, 0.1, z);
    if (o.vfx === null) return;
    if (o.vfx === 'explosion' || o.vfx === undefined || typeof o.vfx === 'string') {
      const name = typeof o.vfx === 'string' ? o.vfx : null;
      if (name && G.VFX && G.VFX.play) { safe(G.VFX, 'play', [name, pos, { element: el, radius: rad, color: EL_HEX[el] }]); return; }
      if (name) FX('burst', V3(x, 0.8, z), EL_HEX[el] || 0xffffff, 16, { speed: 4, up: 3, life: 0.5, size: 0.2 });
    }
    FX('ring', V3(x, 0.05, z), EL_HEX[el] || 0xffffff, rad, 0.35);
  }
  function resolveAoe(o, x, z, rad) {
    const r = run, p = r.player;
    const owner = o.owner || 'player';
    const dmg = num(o.damage, 0);
    const el = o.element || 'physique';
    aoeVfx(o, x, z, rad);
    if (owner === 'enemy') {
      if (!p.dead && Math.hypot(p.pos.x - x, p.pos.z - z) < rad + p.r * 0.5) {
        const ok = hurtPlayer(dmg, { element: el, source: o.source || 'aoe' });
        if (ok && typeof o.onHit === 'function') { try { o.onHit(p); } catch (e) { /* ignore */ } }
      }
      return;
    }
    const list = targetables().slice();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz);
      if (d - e.r > rad) continue;
      if (dmg > 0) dealDamage(e, dmg, { element: el, kind: 'aoe', source: owner === 'minion' ? 'minion' : (o.source || 'player'), kx: dx / (d || 1), kz: dz / (d || 1), kb: num(o.knockback, 0) * 4, tags: o.tags, noCharge: owner === 'minion' });
      if (typeof o.onHit === 'function' && !e.dead) { try { o.onHit(e); } catch (err) { console.warn('[game] aoe.onHit', err); } }
    }
  }
  function updateAoes(dt) {
    const r = run;
    if (!r.aoes.length) return;
    for (let i = 0; i < r.aoes.length; i++) {
      const a = r.aoes[i];
      a.t += dt;
      if (a.tele) a.tele.userData.setProgress(a.t / a.dur);
      if (a.t >= a.dur) {
        a.done = true;
        if (a.tele) removeTele(a.tele);
        resolveAoe(a.o, a.x, a.z, a.rad);
        if (run !== r) return;
      }
    }
    r.aoes = r.aoes.filter(a => !a.done);
  }

  // --- serviteurs ---------------------------------------------------------
  let minionUid = 0;
  function summonMinion(defId, o) {
    const r = run;
    o = o || {};
    if (!r || !r.root) return null;
    const p = r.player, pos = o.pos || p.pos;
    const necro = !!(o.necro || o.ai === 'necro');
    let mesh = safe(G.GFX, 'makeMinion', [defId, { rank: o.rank, rarity: o.rarity }]) || fallbackObj(0x7a3cff, 0.4);
    mesh.position.set(pos.x + (necro ? 0 : (Math.random() - 0.5)), 0, pos.z + (necro ? 0 : (Math.random() - 0.5)));
    r.root.add(mesh);
    const ps = p.stats || {};
    const base = Object.assign({ dmg: 10, speed: 4.6, range: 1.7, atkCd: 1.1, pv: 60 }, o.stats || {});
    if (!necro) { base.dmg *= num(ps.minionDmg, 1); base.pv *= num(ps.minionPv, 1); }
    const m = {
      uid: ++minionUid, defId, mesh, pos: mesh.position, pv: base.pv, pvMax: base.pv, stats: base,
      level: num(o.level, 1), rank: o.rank || 'E', dead: false, necro, ai: necro ? 'necro' : (o.ai || 'follow'),
      expire: num(o.duration, 99999) < 9e4 ? r.time + num(o.duration, 10) : Infinity, atkT: 0.5, spawnT: necro ? 0 : 0.5,
      owner: 'player', r: 0.5, animOff: Math.random() * 10, attack: 0,
    };
    m.stats = hook('minionStats', m.stats, { minion: m, profile }) || m.stats;
    if (m.stats.pv && m.stats.pv !== m.pvMax) { m.pvMax = m.stats.pv; m.pv = m.stats.pv; }
    if (!necro) mesh.scale.setScalar(0.01);
    r.minions.push(m);
    emit('minionSummoned', { minion: m });
    return m;
  }
  function removeMinion(m, silent) {
    if (!m) return;
    if (!silent && !m.dead) m.dead = true;
    if (silent) m.dead = true;
    if (m.mesh && m.mesh.parent) m.mesh.parent.remove(m.mesh);
    const r = run;
    if (r && m.mesh) r.minionGrave.push(m.mesh);
    if (r) { const i = r.minions.indexOf(m); if (i >= 0) r.minions.splice(i, 1); }
  }
  function damageMinion(m, amount) {
    if (!m || m.dead) return false;
    m.pv -= amount;
    FX('text', V3(m.pos.x, 1.6, m.pos.z), '-' + Math.round(amount), '#ff9a9a', 0.8);
    if (m.pv <= 0) { m.pv = 0; m.dead = true; }
    return true;
  }
  /** IA alliée native (serviteurs non-Necro) : suit le héros, attaque l'ennemi le plus proche */
  function updateMinions(dt, time) {
    const r = run, p = r.player;
    const list = r.minions;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.dead || (m.necro && m.pv <= 0 && m.dead)) {
        if (!m.necro) { removeMinion(m, true); }
        continue;
      }
      if (m.necro) {            // G.Necro déplace / anime / retire ses serviteurs
        if (!m.mesh || !m.mesh.parent) { /* retiré par Necro */ }
        continue;
      }
      if (time > m.expire || m.pv <= 0) { FX('burst', V3(m.pos.x, 0.8, m.pos.z), 0x9a5cff, 10, { speed: 3, up: 3, life: 0.5, size: 0.15 }); removeMinion(m, true); continue; }
      if (m.spawnT > 0) { m.spawnT -= dt; m.mesh.scale.setScalar(Math.max(0.01, easeOutBack(clamp(1 - m.spawnT / 0.5, 0, 1)))); continue; }
      m.atkT -= dt;
      const tgt = nearestEnemy(m.pos.x, m.pos.z, 11);
      let vx = 0, vz = 0, face = null;
      const sp = num(m.stats.speed, 4.6);
      if (tgt) {
        const dx = tgt.pos.x - m.pos.x, dz = tgt.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
        face = { x: dx / d, z: dz / d };
        const reach = num(m.stats.range, 1.7) + tgt.r;
        if (d > reach * 0.9) { vx = face.x * sp; vz = face.z * sp; }
        else if (m.atkT <= 0) {
          m.atkT = num(m.stats.atkCd, 1.1);
          m.attack = 1;
          dealDamage(tgt, num(m.stats.dmg, 10), { element: 'ombre', kind: 'minion', source: 'minion', kx: face.x, kz: face.z, kb: 2, noCharge: true });
          FX('burst', V3(tgt.pos.x, 1, tgt.pos.z), 0x9a5cff, 5, { speed: 3, up: 2, life: 0.3, size: 0.12 });
        }
      } else {
        const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > 3) { vx = (dx / d) * sp; vz = (dz / d) * sp; face = { x: dx / d, z: dz / d }; }
        if (d > 22) { m.pos.x = p.pos.x; m.pos.z = p.pos.z; }
      }
      m.pos.x += vx * dt; m.pos.z += vz * dt;
      collideCircle(m.pos, m.r, r.obstacles);
      clampRoom(m.pos, m.r, false);
      if (face) m.mesh.rotation.y = lerpAngle(m.mesh.rotation.y, Math.atan2(face.x, face.z), 1 - Math.exp(-dt * 10));
      m.attack = Math.max(0, m.attack - dt * 3);
      safe(G.GFX, 'animateCharacter', [m.mesh, time + m.animOff, { moving: Math.hypot(vx, vz) > 0.3, windup: 0, attack: m.attack }]);
    }
  }

  // ===================================================================
  // 20. G.SkillAPI + G.Combat (contrat §6)
  // ===================================================================
  const toXZ = p => (p && typeof p.x === 'number' ? p : (p && p.pos) || (p && p.mesh && p.mesh.position) || { x: 0, z: 0 });
  const VFX_ALIAS = { summonCircle: 'summon', shadowRise: 'shadow_rise', levelUpBurst: 'levelup', hitSpark: 'hit', lightning: 'bolt', aura: 'buff', rankUp: 'rankup', beam: 'beam', slash: 'slash' };
  const SkillAPI = {
    inRun: () => !!run && !run.finished,
    run: () => run,
    player() {
      if (net.aggro && net.aggro.remote) return net.aggro;      // IA externe de l'hôte : cible = allié distant le plus proche
      const p = run && run.player;
      if (!p) return null;
      if (!p.dir) p.dir = V3(0, 0, -1);
      p.dir.set(p.face.x, 0, p.face.z);
      p.level = profile.niveau; p.classe = profile.classe;
      return p;
    },
    enemies: () => { if (!run) return []; targetables(); return run.alive; },
    nearestEnemy(pos, maxDist) { const q = toXZ(pos); return run ? nearestEnemy(q.x, q.z, num(maxDist, 99)) : null; },
    enemiesInRadius(pos, rad) {
      const q = toXZ(pos), out = [];
      if (!run) return out;
      const list = targetables();
      for (let i = 0; i < list.length; i++) { const e = list[i]; if (Math.hypot(e.pos.x - q.x, e.pos.z - q.z) - e.r <= rad) out.push(e); }
      return out;
    },
    enemiesInCone(pos, dir, range, angle) {
      const q = toXZ(pos), out = [];
      if (!run) return out;
      const dn = norm2(dir.x, dir.z), half = clamp(num(angle, 1.2), 0.05, TAU) / 2;
      const list = targetables();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        const dx = e.pos.x - q.x, dz = e.pos.z - q.z, d = Math.hypot(dx, dz);
        if (d - e.r > range) continue;
        if (d < e.r + 0.4) { out.push(e); continue; }
        const dot = (dx * dn.x + dz * dn.z) / d;
        const ang = Math.acos(clamp(dot, -1, 1));
        const slack = Math.asin(clamp(e.r / d, 0, 1));
        if (ang - slack <= half) out.push(e);
      }
      return out;
    },
    aim(data) { const d = aimDirection(data, 16); return V3(d.x, 0, d.z); },
    damage(e, amount, o) {
      o = o || {};
      return dealDamage(e, amount, {
        element: o.element, kind: o.kind || 'skill', knockback: o.knockback, tags: o.tags, canCrit: o.canCrit !== false,
        source: o.source || 'player', crit: o.crit, from: run ? run.player.pos : null, kb: o.kb, noCharge: !!o.noCharge,
      });
    },
    damagePlayer(amount, o) { o = o || {}; return run ? hurtPlayer(num(amount, 1), { element: o.element, source: o.source, slow: o.slow, hazard: !!o.hazard }) : false; },
    projectile(o) { return run && run.root ? spawnProjectile(o || {}) : null; },
    aoe,
    dash(o) {
      if (!run) return false;
      o = o || {};
      const p = run.player;
      let d = o.dir && (Math.abs(o.dir.x) + Math.abs(o.dir.z) > 1e-4) ? norm2(o.dir.x, o.dir.z) : { x: p.face.x, z: p.face.z };
      const dur = Math.max(0.05, num(o.duration, 0.2)), dist = num(o.distance, 5);
      startDash({ dir: d, duration: dur, speed: dist / dur, invuln: num(o.invuln, 0), onPass: o.onPass, phase: !!o.phase });
      return true;
    },
    buff: addBuff, removeBuff,
    status(e, o) { return applyStatus(e, o); },
    heal(n) { return run ? healPlayer(Math.round(num(n, 0)), '#5dff8a') : 0; },
    restoreMana(n) { if (!run) return; const p = run.player; p.mana = clamp(p.mana + num(n, 0), 0, p.manaMax); },
    spendMana(n) { if (!run) return false; const p = run.player; n = num(n, 0); if (p.mana < n) return false; p.mana -= n; return true; },
    summon: summonMinion,
    minions: () => (run ? run.minions : []),
    damageMinion,
    spawnEnemy(id, pos, o) {
      if (!run || !run.root) return null;
      o = o || {};
      const q = toXZ(pos || run.player.pos);
      return createEnemy(id, clamp(q.x, -HALF + 1, HALF - 1), clamp(q.z, -HALF + 1, HALF - 1), { elite: !!o.elite, fromWave: !!o.fromWave, rank: o.rank });
    },
    after(sec, fn) { return addTimer(num(sec, 0.1), fn, false); },
    every(sec, fn, times) { return addTimer(num(sec, 1), fn, false, num(sec, 1), times); },
    shake: a => shake(a), hitStop: s => hitStop(s), sfx: n => sfx(n),
    vfx(name, pos, opts) {
      if (net.rec && net.rec.length < 6 && typeof name === 'string') {
        const q = toXZ(pos), o = opts || {};
        net.rec.push(['v', name.slice(0, 24), r2(q.x), r2(num(q.y, 0)), r2(q.z), typeof o.element === 'string' ? o.element.slice(0, 12) : 0, r2(num(o.radius, 0)), typeof o.color === 'number' ? o.color : 0]);
      }
      if (G.VFX && typeof G.VFX.play === 'function') {
        const al = VFX_ALIAS[name];
        const o = Object.assign({}, opts || {});
        if (name === 'summonCircle') o.rise = false;
        if (name === 'lightning' && !o.element) o.element = 'foudre';
        safe(G.VFX, 'play', [al || name, pos, o]);
        return;
      }
      const q = toXZ(pos);
      FX('burst', V3(q.x, 0.6, q.z), (opts && opts.color) || 0xffffff, 12, { speed: 3, up: 3, life: 0.5, size: 0.15 });
    },
    text(pos, txt, color, size) { const q = toXZ(pos); FX('text', V3(q.x, (pos && pos.y > 0.5 ? pos.y : 1.6) + 0.4, q.z), String(txt), color || '#ffffff', num(size, 1)); },
    // --- extensions utilisées par G.AI / G.BossAttacks / G.Skills / G.Necro
    moveEnemy(e, vx, vz, dt) { return moveEntity(e, vx, vz, dt); },
    segmentBlocked(ax, az, bx, bz) { return segmentBlocked(ax, az, bx, bz); },
    despawnEnemy: despawnEnemy,
    clearEnemyProjectiles() { if (!run) return; run.projectiles.forEach(pr => { if (pr.owner === 'enemy' && !pr.dead) { pr.dead = true; sceneRemove(pr.mesh); } }); },
    superCharge() { return run ? clamp(run.player.superCharge / 100, 0, 1) : 0; },
    consumeSuper() { if (!run) return false; const p = run.player; if (p.superCharge < 100) return false; p.superCharge = 0; return true; },
    giveXP(n) { if (run) gainXP(Math.round(num(n, 0))); },
    giveGold(n) { if (run) addGold(Math.round(num(n, 0)), false); },
    dropItem: dropItemPickup,
    healHooked: false,
    time: () => (run ? run.time : 0),
  };
  const Combat = {
    ELEMENTS: ELEMENTS.slice(),
    colors: Object.assign({}, EL_HEX), css: Object.assign({}, EL_CSS), names: Object.assign({}, EL_NAME),
    STATUSES: Object.keys(STATUS_COLOR), statusColors: Object.assign({}, STATUS_COLOR), statusNames: Object.assign({}, STATUS_NAME),
    color: el => EL_HEX[el] || 0xffffff,
    name: el => EL_NAME[el] || el,
  };

  // ===================================================================
  // 21. CAMÉRA + HUD
  // ===================================================================
  function updateCamera(dt) {
    const r = run, cf = G.core && G.core.camFocus;
    if (!cf) return;
    let tx = r.player.pos.x, tz = r.player.pos.z, k = 8;
    if (r.bossIntro && r.boss && r.bossIntro.t < (r.bossIntro.dur || 2.2)) { tx = r.boss.pos.x; tz = r.boss.pos.z; k = 3.5; }
    const a = 1 - Math.exp(-dt * k);
    cf.x = lerp(cf.x, tx, a); cf.z = lerp(cf.z, tz, a); cf.y = 0;
    const zt = r.bossRoom ? 1.25 : 1;
    G.core.camZoom = lerp(num(G.core.camZoom, 1), zt, 1 - Math.exp(-dt * 2));
  }
  function objectiveText() {
    const r = run, rd = r.roomData || {};
    if (r.ended === 'victory') return 'Victoire !';
    if (r.ended === 'defeat') return 'Défaite…';
    if (r.bossRoom && r.boss && !r.boss.dead) return 'Terrasse ' + (r.boss.def.name || 'le boss') + ' !';
    if (r.roomKind === 'ext') {
      const t = r.rt && typeof r.rt.objective === 'function' ? safe(r.rt, 'objective', [rtCtx(r)]) : null;
      if (r.roomState === 'cleared') return 'La porte est ouverte : avance vers le nord ⬆';
      return t || rd.name || 'Explore la salle';
    }
    if (r.roomState === 'chest') return r.chestState === 'waiting' ? 'Ouvre le coffre piégé !' : 'Trouve le code du coffre…';
    if (r.roomState === 'cleared') return 'La porte est ouverte : avance vers le nord ⬆';
    if (r.survive) return 'Survis ' + Math.max(0, Math.ceil(r.survive.need - r.survive.t)) + ' s';
    const waves = rd.waves || [];
    const left = r.enemies.filter(e => e.fromWave && blocksClear(e)).length + r.pendingSpawns;
    if (r.waveIndex < 0) return 'Prépare-toi…';
    let t = 'Vague ' + (r.waveIndex + 1) + '/' + waves.length + ' — monstres restants : ' + left;
    const tl = r.constraints.timeLimit;
    if (tl) t += ' — ⏱ ' + Math.max(0, Math.ceil(tl - r.time)) + ' s';
    return t;
  }
  function hudRank() { return profile && profile.rank ? profile.rank : null; }
  function updateHUD() {
    const r = run, p = r.player, c = r.hudCache;
    HUD('setPlayer', { nom: profile.nom, classe: profile.classe, niveau: profile.niveau, pv: Math.max(0, Math.ceil(p.pv)), pvMax: p.pvMax, xp: Math.floor(profile.xp), xpNext: xpFor(profile.niveau), gold: profile.gold, mana: Math.floor(p.mana), manaMax: p.manaMax, rank: hudRank() });
    HUD('setMana', Math.floor(p.mana), p.manaMax);
    const sk = useSkills();
    const cds = sk ? safe(G.Skills, 'cooldowns') : null;
    if (cds) HUD('setCooldowns', { 1: num(cds.cast1, 0), 2: num(cds.cast2, 0), 3: num(cds.cast3, 0), dash: p.cds.dash / (p.cdMax.dash || 1) });
    else HUD('setCooldowns', { 1: p.cds[1] / (p.cdMax[1] || 1), 2: p.cds[2] / (p.cdMax[2] || 1), 3: p.cds[3] / (p.cdMax[3] || 1), dash: p.cds.dash / (p.cdMax.dash || 1) });
    HUD('setSuper', clamp(p.superCharge / 100, 0, 1));
    HUD('setTimer', r.time);
    const obj = objectiveText();
    if (c.objective !== obj) { c.objective = obj; HUD('setObjective', obj); }
    const inv = JSON.stringify(profile.potions);
    if (c.inv !== inv) { c.inv = inv; HUD('setInventory', Object.assign({}, profile.potions)); }
    if (r.boss && !r.boss.dead && !r.bossIntro) HUD('setBoss', r.boss.def.name, Math.max(0, r.boss.pv) / r.boss.pvMax);
    else if (c.boss !== null) { c.boss = null; HUD('setBoss', null, 0); }
    // éléments plus rares (toutes les 6 images)
    if (r.frame % 6 === 0) {
      if (sk && G.Skills.hudInfo) {
        const info = safe(G.Skills, 'hudInfo');
        if (info) { if (info.super) info.super.charge = clamp(p.superCharge / 100, 0, 1); HUD('setSkills', info); }
      }
      HUD('setRank', hudRank());
      HUD('setBuffs', buffsForHud());
      const nm = r.minions.length;
      if (c.minions !== nm) { c.minions = nm; HUD('setMinions', nm, num(p.stats && p.stats.minionCap, 0)); }
    }
  }

  // ===================================================================
  // 22. BOUCLE PRINCIPALE
  // ===================================================================
  function update(dt, time) {
    if (screen !== 'game' || !run) return;
    dt = Math.min(Math.max(num(dt, 0.016), 0), 0.05);
    clockTime = num(time, clockTime + dt);
    const r = run;
    r.frame++;
    // ralenti d'esquive parfaite : décompté en temps réel
    if (slowmo > 0) {
      const ts = G.core ? Math.max(0.05, num(G.core.timeScale, 1)) : 1;
      slowmo -= dt / ts;
      if (slowmo <= 0) { slowmo = 0; if (G.core) G.core.timeScale = 1; }
    }
    updateTimers(dt);
    if (run !== r) return;
    updateFade(dt);
    if (run !== r) return;
    if (r.modal && !net.role) { updateHUD(); return; }      // mini-jeu / dialogue : le monde est figé (en coop, le monde partagé continue)
    if (!r.ended) r.time += dt;
    safe(r.room, 'update', [dt, clockTime]);
    updateBuffs(dt);
    updatePlayer(dt, clockTime);
    updateBossIntro(dt, clockTime);
    cineTick(dt);
    updateEnemies(dt, clockTime);
    if (run !== r) return;
    updateMinions(dt, clockTime);
    updateProjectiles(dt);
    updateStrikes(dt);
    updateAoes(dt);
    updatePuddles(dt);
    updatePickups(dt, clockTime);
    updateRoomFlow(dt);
    if (run !== r) return;
    const tl = r.constraints.timeLimit;
    if (tl && !r.ended && !r.finished && r.time > tl && !r.constraints.timeSoft) failRun('timeLimit', 'Temps écoulé !');
    if (run !== r) return;
    emit('tick', { dt, time: clockTime, run: r });
    if (run !== r) return;
    updateCamera(dt);
    updateHUD();
  }

  // ===================================================================
  // 23. INITIALISATION
  // ===================================================================
  /** Chaque changement d'écran G.UI.showScreen → bus 'screen' {id} (musique menu / camp de G.Audio) */
  function wrapShowScreen() {
    if (!G.UI || typeof G.UI.showScreen !== 'function' || G.UI.showScreen.__v5) return;
    const orig = G.UI.showScreen;
    const w = function (id) {
      const res = orig.apply(this, arguments);
      emit('screen', { id });
      return res;
    };
    w.__v5 = true;
    G.UI.showScreen = w;
  }
  /** Les navigateurs exigent un geste pour démarrer l'audio : débloque G.Audio (et G.sfx) au premier contact */
  function installAudioUnlock() {
    if (typeof document === 'undefined') return;
    const evs = ['pointerdown', 'touchstart', 'keydown', 'mousedown'];
    const h = () => {
      safe(G.Audio, 'unlock');
      safe(G.sfx, 'unlock');
      const d = G.Audio && typeof G.Audio.debug === 'function' ? safe(G.Audio, 'debug') : null;
      if (!G.Audio || (d && d.ready && d.state === 'running')) evs.forEach(ev => document.removeEventListener(ev, h, true));
    };
    evs.forEach(ev => document.addEventListener(ev, h, true));
  }
  function init() {
    if (initialized) return;
    initialized = true;
    if (typeof THREE !== 'undefined') { tmpColor = new THREE.Color(); tmpVec = new THREE.Vector3(); }
    // API de combat publique (avant tout système v3)
    G.SkillAPI = Object.assign(G.SkillAPI || {}, SkillAPI);
    G.Combat = Object.assign(G.Combat || {}, Combat);
    wrapShowScreen();
    installAudioUnlock();
    safe(G.BossInfo, 'registerItems');
    if (G.BossAttacks && G.BossAttacks.config) G.BossAttacks.config.noLines = true;    // les répliques de boss sont gérées ici (intro cinématique, phases, mort)
    registerCallbacks();
    if (G.bus && G.bus.on) G.bus.on('loot', onLootEvent);
    if (G.input && typeof G.input.onAction === 'function') G.input.onAction(onAction);
    installHoldListeners();
    if (G.core && typeof G.core.onUpdate === 'function') G.core.onUpdate(update);
    else if (typeof requestAnimationFrame === 'function') {
      let last = performance.now();
      const loop = now => { const dt = (now - last) / 1000; last = now; update(dt, now / 1000); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    ensureFadeEl();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && run && !run.modal && !run.finished && screen === 'game' && !net.role) setPaused(true);
      });
    }
    profile = loadProfile();
    UI('renderTitle', !!profile);
    showScreen('title');
  }

  // ===================================================================
  // 24. DEBUG (QA automatique)
  // ===================================================================
  function portalForTemplate(id) {
    const tpl = G.DUNGEONS && G.DUNGEONS[id];
    if (!tpl) return null;
    const rank = tpl.rank || 'E';
    const order = (G.Ranks && G.Ranks.order) || RANK_ORDER;
    return {
      id: 'dbg_' + id + '_' + Date.now().toString(36), templateId: id, templateName: tpl.name, name: tpl.name, rank,
      minRank: order[Math.max(0, order.indexOf(rank) - 1)] || rank, type: tpl.type === 'epreuve' ? 'epreuve' : 'normal',
      theme: tpl.theme || 'crypte', icon: tpl.icon || '', modifiers: [], flags: {}, seed: Date.now() % 1000003, danger: 1, rewardMult: 1, goldMult: 1,
    };
  }
  function resolvePortalArg(id) {
    if (id && typeof id === 'object') return id;
    if (G.Portals && typeof G.Portals.list === 'function' && profile) {
      const l = safe(G.Portals, 'list', [profile]) || [];
      const f = l.find(x => x && (x.id === id || x.templateId === id));
      if (f) return f;
    }
    return portalForTemplate(id);
  }
  const debug = {
    god(b) { godMode = b === undefined ? true : !!b; return godMode; },
    giveXP(n) {
      if (!profile) return;
      n = Math.max(0, Math.round(num(n, 0)));
      if (run) gainXP(n); else { profile.xp += n; checkLevelUp(); }
      saveProfile();
    },
    giveGold(n) {
      if (!profile) return;
      n = Math.max(0, Math.round(num(n, 0)));
      if (run) addGold(n); else profile.gold += n;
      saveProfile();
      if (!run && screen === 'hub') UI('renderHub', profile);
    },
    killAll() {
      const r = run;
      if (!r) return 0;
      if (r.bossIntro && r.boss) { r.bossIntro = null; r.boss.pos.y = 0; r.boss.state = 'idle'; safe(G.BossAttacks, 'attach', [r.boss]); }
      r.timers = r.timers.filter(t => !t.room);   // annule les apparitions en attente
      r.pendingSpawns = 0;
      let n = 0;
      r.enemies.slice().forEach(e => {
        if (e.dead) return;
        if (e.spawnT > 0) { e.spawnT = 0; e.mesh.scale.setScalar(e.baseScale); e.pos.y = 0; }
        e.untargetable = false;
        e.statuses = {};
        dealDamage(e, e.pv + 1e6, { source: 'system', canCrit: false, noCharge: true, kind: 'dot', crit: false });
        if (!e.dead) { e.pv = 0; killEnemy(e, 'system', 0, 'physique'); }
        n++;
      });
      return n;
    },
    skipRoom() {
      const r = run;
      if (!r) return false;
      if (r.bossRoom && r.boss) { debug.killAll(); return true; }
      r.enemies.forEach(e => { e.dead = true; e.label.remove(); });
      r.enemies = []; r.tdirty = true;
      r.pendingSpawns = 0;
      collectAllPickups();
      const next = nextRoomIndex(r);
      if (next < r.rooms.length) startRoom(next); else finishRun(true);
      return true;
    },
    /** force=true : saute les vérifications de rang / niveau / épreuve */
    startDungeon(id, force) {
      if (!profile) { profile = defaultProfile('Testeur', classIds()[0]); ensureAll(profile); saveProfile(); }
      const idx = findDungeonIndex(id === undefined ? 0 : id);
      const portal = (typeof id === 'string' || (id && typeof id === 'object')) ? resolvePortalArg(id) : null;
      if (portal) return enterPortalInternal(portal, !!force);
      if (idx < 0) return false;
      const d = (DATA().DUNGEONS || [])[idx];
      if (!d) return false;
      if (!force) {
        if (profile.niveau < num(d.levelRequired, 1)) { denyEntry('Niveau ' + d.levelRequired + ' requis !'); return false; }
        if (G.Ranks) { const rk = checkRank(profile, V2_RANKS[idx] || 'E'); if (!rk.ok) { denyEntry(rk.reason); return false; } }
      }
      return startRun(convertV2(d, idx), null, { v2Index: idx });
    },
    enterPortal(portal, force) {
      const p = resolvePortalArg(portal);
      return p ? enterPortalInternal(p, !!force) : false;
    },
    setRank(rank) {
      if (!profile) return false;
      const order = (G.Ranks && G.Ranks.order) || RANK_ORDER;
      if (order.indexOf(rank) < 0) return false;
      profile.rank = rank;
      profile.rankHistory = profile.rankHistory || [];
      profile.rankHistory.push({ rank, at: Date.now(), how: 'debug' });
      saveProfile();
      recomputeStats();
      return true;
    },
    forceClass(id) {
      if (!profile || classIds().indexOf(id) < 0) return false;
      profile.classe = id;
      if (profile.skills) profile.skills.equipped = {};      // kit par défaut de la nouvelle classe
      ensureAll(profile);
      grantKit(profile);
      const sst = G.Skills && G.Skills._state;       // debug seulement : repart sans recharges héritées de l'ancienne classe
      if (sst && sst.cd) { sst.cd = {}; sst.combo = {}; }
      saveProfile();
      recomputeStats();
      return true;
    },
    fillSuper() { if (!run) return false; run.player.superCharge = 100; return true; },
    listEvents() {
      const known = ['tick', 'runStart', 'runEnd', 'roomStart', 'roomCleared', 'enemySpawn', 'enemyKilled', 'bossPhase', 'bossKilled', 'playerHit', 'playerDodge', 'playerParry', 'damageDealt', 'skillCast', 'levelUp', 'loot', 'profileChanged'];
      const o = {};
      known.forEach(k => { o[k] = evCount[k] || 0; });
      Object.keys(evCount).forEach(k => { if (!(k in o)) o[k] = evCount[k]; });
      return o;
    },
    /** Avance la simulation sans rendu (n pas de dt secondes) */
    step(dt, n) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 60, clockTime + (dt || 1 / 60)); },
    state() {
      const r = run;
      return {
        screen,
        dungeonId: r ? r.dungeonId : null,
        rank: r ? r.rank : null,
        roomIndex: r ? r.roomIndex : -1,
        roomKind: r ? r.roomKind : null,
        enemies: r ? r.enemies.filter(e => !e.dead).length : 0,
        minions: r ? r.minions.length : 0,
        playerPv: r && r.player ? Math.max(0, Math.round(r.player.pv)) : null,
        mana: r && r.player ? Math.round(r.player.mana) : null,
        roomState: r ? r.roomState : null,
        boss: r && r.boss ? { name: r.boss.def.name, pv: Math.max(0, Math.round(r.boss.pv)), phase: r.boss.phase, phase2: r.boss.phase2 } : null,
        niveau: profile ? profile.niveau : null,
        classe: profile ? profile.classe : null,
        profileRank: profile ? profile.rank : null,
        gold: profile ? profile.gold : null,
        paused: !!(G.core && G.core.paused),
      };
    },
  };

  // ===================================================================
  // 24 bis. PONT RÉSEAU (coop) — utilisé uniquement par js/net/online.js
  // ===================================================================
  const r2 = v => Math.round(num(v, 0) * 100) / 100;
  const netApi = {
    get role() { return net.role; },
    /** role 'host' | 'guest' ; cb = rappels ; remotes() = mandataires des alliés */
    setRole(role, cb, remotes) {
      net.role = role === 'host' || role === 'guest' ? role : null;
      net.cb = cb || {};
      net.remotes = typeof remotes === 'function' ? remotes : () => [];
      net.aggro = null;
    },
    clear() { net.role = null; net.cb = {}; net.remotes = () => []; net.aggro = null; },
    checkEntry(portal) { return profile ? checkEntry(portal) : { ok: false, reason: 'Aucun héros.' }; },
    buildDungeon(portal) { const d = buildDungeonFor(portal); return d ? deepClone(d) : null; },
    /** Lance le donjon partagé (même objet donjon chez tous les joueurs) */
    startCoop(dungeon, portal) {
      if (!profile || !dungeon) return false;
      net.seq = 0;
      return startRun(deepClone(dungeon), portal ? deepClone(portal) : null, {});
    },
    player() { return run ? run.player : null; },
    inRun() { return !!run && !run.finished; },
    localState() {
      const p = run && run.player;
      if (!p) return null;
      return { x: r2(p.pos.x), z: r2(p.pos.z), ry: r2(p.hero.rotation.y), mv: p.moving ? 1 : 0, at: p.attackT > 0 ? 1 : 0, pv: Math.round(p.pv), pvMax: Math.round(p.pvMax), dead: p.dead ? 1 : 0, ri: run.roomIndex };
    },
    /** Hôte : instantané compact des ennemis */
    snapshot() {
      const r = run;
      if (!r) return null;
      const en = [];
      for (let i = 0; i < r.enemies.length; i++) {
        const e = r.enemies[i];
        if (e.dead || !e.netId) continue;
        en.push([e.netId, e.boss ? '' : e.id, r2(e.pos.x), r2(e.pos.z), r2(e.mesh.rotation.y), Math.max(0, Math.ceil(e.pv)), Math.round(e.pvMax), (e.elite ? 1 : 0) | (e.boss ? 2 : 0), r2(e.netW), r2(e.netA)]);
      }
      const out = { ri: r.roomIndex, rs: r.roomState, en };
      if (r.chest) out.ch = [r2(r.chest.position.x), r2(r.chest.position.z), r.chestState === 'waiting' ? 0 : 1];
      const op = Object.keys(net.opened);
      if (op.length) out.op = op.map(k => [k, net.opened[k]]);
      return out;
    },
    /** Invité : applique un instantané (création / mise à jour / mort des marionnettes) */
    applySnapshot(s) {
      const r = run;
      if (!r || r.finished || !s || s.ri !== r.roomIndex || r.transition) return;
      // Firebase enregistre un tableau vide comme « absent », et peut renvoyer un objet {0:…,1:…}
      const en = Array.isArray(s.en) ? s.en : (s.en && typeof s.en === 'object' ? Object.keys(s.en).map(k => s.en[k]) : []);
      const seen = new Set();
      for (let i = 0; i < en.length; i++) {
        const a = en[i];
        if (!Array.isArray(a) || a.length < 8) continue;
        const id = String(a[0]), type = a[1], fl = num(a[7], 0);
        seen.add(id);
        let e = null;
        for (let k = 0; k < r.enemies.length; k++) { const q = r.enemies[k]; if (q.netId === id && !q.dead) { e = q; break; } }
        if (!e) {
          if (fl & 2) continue;      // boss : créé par la salle locale (même identifiant)
          if (typeof type !== 'string' || !hasMonster(type)) continue;
          e = createEnemy(type, num(a[2], 0), num(a[3], 0), { netId: id, elite: !!(fl & 1), fromWave: true });
          if (!e) continue;
        }
        e.netSeen = true;
        const nx = num(a[2], e.pos.x), nz = num(a[3], e.pos.z), tn = clockTime;
        const pv0 = e.netP;
        let vx = 0, vz = 0;
        if (pv0 && tn - pv0.t > 0.02 && tn - pv0.t < 0.5) { vx = (nx - pv0.x) / (tn - pv0.t); vz = (nz - pv0.z) / (tn - pv0.t); }
        e.netP = { x: nx, z: nz, t: tn };
        e.netT = { x: nx, z: nz, ry: num(a[4], 0), vx: clamp(vx, -12, 12), vz: clamp(vz, -12, 12), t: tn };
        e.pvMax = Math.max(1, num(a[6], e.pvMax));
        e.pv = Math.max(1, num(a[5], e.pv));
        e.netW = num(a[8], 0); e.netA = num(a[9], 0);
        e.label.set(e.pv / e.pvMax);
        if (e.boss && !r.bossIntro) HUD('setBoss', e.def.name, e.pv / e.pvMax);
      }
      // objets de salle : coffre de l'hôte, puis ouvertures (idempotent : un message manqué se rattrape au suivant)
      if (Array.isArray(s.ch) && !r.chest && run === r) netGuestChest(num(s.ch[0], 0), num(s.ch[1], 0));
      const ops = Array.isArray(s.op) ? s.op : [];
      for (let i = 0; i < ops.length; i++) netApplyOpen(String(ops[i] && ops[i][0]), ops[i] && ops[i][1]);
      const list = r.enemies.slice();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || !e.puppet) continue;
        if (e.netOrphan) { despawnEnemy(e); continue; }
        if (e.netSeen && !seen.has(e.netId)) { e.pv = 0; e.untargetable = false; e.spawnT = 0; killEnemy(e, 'ally', 0, 'physique'); }
        if (run !== r) return;
      }
    },
    /** Hôte : dégâts calculés par un invité (déjà réduits par ses stats / résistances) */
    applyRemoteDamage(id, dealt, el, crit) {
      const r = run;
      if (!r || r.finished) return 0;
      const e = r.enemies.find(q => q.netId === id && !q.dead);
      if (!e || e.spawnT > 0 || (e.boss && r.bossIntro) || e.untargetable) return 0;
      dealt = Math.round(clamp(num(dealt, 0), 0, 1e7));
      if (!dealt) return 0;
      const hpBefore = e.pv;
      e.pv -= dealt; e.lastHurt = clockTime; e.flashK = 1; e.flashColor = 0xffffff;
      FX('text', V3(e.pos.x, e.height + 0.2, e.pos.z), crit ? dealt + ' !' : String(dealt), '#9ff3ff', crit ? 1.3 : 0.9);
      e.label.set(Math.max(0, e.pv) / e.pvMax);
      if (e.boss) { HUD('setBoss', e.def.name, Math.max(0, e.pv) / e.pvMax); checkPhase(e); }
      if (e.pv <= 0) killEnemy(e, 'ally', Math.max(0, dealt - Math.max(0, hpBefore)), ELEMENTS.indexOf(el) >= 0 ? el : 'physique');
      return dealt;
    },
    /** Hôte : un allié a franchi la porte → salle suivante pour tout le groupe */
    door() {
      const r = run;
      if (!r || r.ended || r.finished || r.roomState !== 'cleared' || r.transition) return false;
      r.transition = true;
      sfx('door');
      fadeTo(() => {
        collectAllPickups();
        const next = nextRoomIndex(r);
        if (next < r.rooms.length) startRoom(next); else finishRun(true);
      });
      return true;
    },
    /** Hôte : données de la salle courante (l'invité les reçoit : les embranchements peuvent allonger la liste) */
    roomData() { const r = run; return r && r.roomData ? deepClone(r.roomData) : null; },
    /** Invité : l'hôte a changé de salle (rd = données de la salle envoyées par l'hôte) */
    gotoRoom(i, rd) {
      const r = run;
      i = Math.floor(num(i, -1));
      if (rd && typeof rd === 'object' && i >= 0 && i < 64) { rd._revealed = true; r && (r.rooms[i] = rd); }
      if (!r || r.finished || i < 0 || i === r.roomIndex || i >= r.rooms.length) return false;
      r.transition = true; r.netDoorT = null;
      fadeTo(() => { if (run !== r) return; collectAllPickups(); startRoom(i); });
      return true;
    },
    clearRoom() { const r = run; if (r && !r.finished && r.roomState !== 'cleared') roomCleared(); },
    // --- objets de salle partagés (utilisés par sys/events.js) ---
    /** Déclare un objet partagé de la salle courante. def = { hostUse(), apply(info) } */
    objRegister(key, def) {
      key = String(key); net.objs[key] = def || {};
      if (net.role === 'guest' && key in net.opened && def && typeof def.apply === 'function' && !def._applied) { def._applied = true; try { def.apply(net.opened[key]); } catch (e) { console.warn('[game] net obj ' + key, e); } }
    },
    /** Avant d'ouvrir : true = ouvrir localement (solo / hôte) ; false = invité (demande envoyée à l'hôte) */
    objUse(key) { if (net.role !== 'guest') return true; netCall('objUse', String(key)); return false; },
    /** Hôte : l'objet vient d'être ouvert (info facultative, ex. 'm' = mimique) */
    objDone(key, info) { if (net.role === 'host') net.opened[String(key)] = info === undefined ? 1 : info; },
    /** Hôte : un invité demande l'ouverture */
    objRequest(key) { const d = net.objs[String(key)]; if (net.role === 'host' && d && typeof d.hostUse === 'function' && !(String(key) in net.opened)) { try { d.hostUse(); } catch (e) { console.warn('[game] net obj ' + key, e); } } },
    isOpened(key) { return String(key) in net.opened; },
    /** Rejoue chez soi, en VISUEL SEUL, les effets d'un sort d'allié (liste enregistrée par tryCast chez lui) */
    fxReplay(list) {
      const r = run;
      if (!r || !r.root || !Array.isArray(list)) return 0;
      let n = 0;
      for (let i = 0; i < Math.min(6, list.length); i++) {
        const a = list[i];
        if (!Array.isArray(a)) continue;
        try {
          if (a[0] === 'v' && typeof a[1] === 'string') {
            const o = {}; if (a[5]) o.element = String(a[5]); if (num(a[6], 0) > 0) o.radius = clamp(num(a[6], 0), 0, 20); if (num(a[7], 0)) o.color = num(a[7], 0);
            SkillAPI.vfx(a[1], V3(num(a[2], 0), num(a[3], 0), num(a[4], 0)), o); n++;
          } else if (a[0] === 'p') {
            spawnProjectile({ type: String(a[1] || 'orb'), pos: V3(num(a[2], 0), Math.max(0.2, num(a[3], 1)), num(a[4], 0)), dir: V3(num(a[5], 0), 0, num(a[6], 1)),
              speed: clamp(num(a[7], 14), 1, 60), life: clamp(num(a[8], 1), 0.05, 4), element: ELEMENTS.indexOf(a[9]) >= 0 ? a[9] : 'physique', radius: clamp(num(a[10], 0.3), 0.05, 3),
              owner: 'player', source: 'ally', visual: true, damage: 0 });
            n++;
          }
        } catch (e) { if (!warned.fxr) { warned.fxr = 1; console.warn('[game] fxReplay', e); } }
      }
      return n;
    },
    finish(victory) { const r = run; if (!r || r.finished) return; if (G.core) G.core.paused = false; finishRun(!!victory, victory ? 'victoire' : 'groupe'); },
    wipe() { failRun('net', 'Le groupe est anéanti…'); },
    hurtLocal(dmg, o) { const prev = net.aggro; net.aggro = null; try { return hurtPlayer(num(dmg, 0), o || {}); } finally { net.aggro = prev; } },
    revive(frac) {
      const r = run, p = r && r.player;
      if (!p || !p.dead || r.finished || r.ended) return false;
      p.dead = false; p.deadT = 0;
      p.pv = Math.max(1, Math.round(p.pvMax * clamp(num(frac, 0.35), 0.05, 1)));
      p.invuln = 1.5; p.blinkT = 1.5;
      p.hero.rotation.x = 0; p.pos.y = 0;
      p.label.set(p.pv / p.pvMax);
      FX('ring', V3(p.pos.x, 0.05, p.pos.z), 0x5dff8a, 2.2, 0.7);
      banner('Réanimé !', 1.2);
      netCall('act', 'revive', null);
      return true;
    },
  };

  // ===================================================================
  // 25. EXPORT + DÉMARRAGE
  // ===================================================================
  G.SkillAPI = Object.assign(G.SkillAPI || {}, SkillAPI);
  G.Combat = Object.assign(G.Combat || {}, Combat);
  G.game = {
    init,
    get profile() { return profile; },
    get run() { return run; },
    getProfile() { return profile; },
    saveProfile,
    recomputeStats,
    addGold(n) { if (run) addGold(n, false); else if (profile) { profile.gold += Math.round(num(n, 0)); saveProfile(); } },
    failRun,
    enterPortal,
    update,
    calcul_degats,
    debug,
    net: netApi,
  };

  function boot() {
    try { if (G.UI && typeof G.UI.init === 'function') G.UI.init(); } catch (e) { console.error('[game] G.UI.init', e); }
    G.game.init();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
