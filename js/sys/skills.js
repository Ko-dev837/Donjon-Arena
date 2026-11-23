window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v5 « Ténèbres » — js/sys/skills.js → G.Skills   (Agent 2 « Combat Designer »)
   Moteur des compétences : profil, points, apprentissage, déblocages par niveau, emplacements, cast (recharge, charges, mana,
   charge maintenue, combos), RESSOURCES SECONDAIRES (Rage, Lames, Combo, Concentration, Foi, Givre/Orage, Âmes, Écho),
   passifs (hook 'stats'), buffs / boucliers / marques, spécialisations, forge (Arme de classe / Focalisateur / Relique),
   migration douce des profils v2→v5, panneau « Compétences » (rendu : agent 4).
   Données : js/data/skills.js (G.SKILLS, G.SKILL_TREES, G.SKILL_SPECS, G.CLASS_PASSIVES) ; spécification : CLASS-DESIGN.md.
   Points : +1 par niveau (événement 'levelUp'). Les points de rang sont versés par progression.js
   (p.skills.points ou p.pendingGrants.skillPoints, transféré ici sans jamais écraser l'existant).

   API pour les compétences (data/skills.js) : G.Skills.K  (temps, ressources, marques/piles d'ennemis, zones, minuteries, statuts boss-safe…)
   API pour l'UI : G.Skills.resource() -> {id, name, value, max, color, parts?} ; hudInfo(p).res ; bus 'resourceChanged' {id, value, max}.
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const SLOTS = ['cast1', 'cast2', 'cast3', 'super'];
  const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
  const V2_KIT = { basic: 'v2_epee', cast2: 'v2_dague', cast3: 'v2_feu', super: 'v2_tornade' };   // legacy (sauvegardes) — plus un kit
  const SKILL_VERSION = 5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const SK = () => G.SKILLS || {};
  const def = (id) => SK()[id] || null;
  const TAU = Math.PI * 2;

  // état du run (réinitialisé à runStart / runEnd)
  const S = {
    time: 0, cd: {}, chg: {}, combo: {}, buffs: [], healAcc: 0, chargeStart: {},
    res: {}, v: {}, zones: [], timers: [], echo: { n: 0, last: null, t: -99 }, dirty: {}, lastEmit: {},
  };
  const resetRun = () => {
    S.cd = {}; S.chg = {}; S.combo = {}; S.buffs = []; S.healAcc = 0; S.zones = []; S.timers = [];
    S.res = {}; S.v = { lastAct: -99, lastHit: -99, lastShot: -99, lastHurt: -99, regenAcc: 0, trapAcc: 0, chargeT: {} }; S.echo = { n: 0, last: null, t: -99 };
    S.dirty = {}; S.lastEmit = {};
    initResources();
  };

  function prof() { return (G.game && G.game.profile) || null; }
  function api() { return G.SkillAPI || null; }
  function rankIdx(r) { try { if (G.Ranks && G.Ranks.index) return Math.max(0, G.Ranks.index(r)); } catch (_) {} return Math.max(0, RANK_ORDER.indexOf(r || 'E')); }
  function toast(t) { try { G.UI && G.UI.toast && G.UI.toast(t); } catch (_) {} }
  function saveProfile() { try { G.game && G.game.saveProfile && G.game.saveProfile(); } catch (_) {} }
  const cls = () => { const p = prof(); return p ? p.classe : null; };
  function stats() { const a = api(); try { return (a && a.player && a.player() && a.player().stats) || {}; } catch (_) { return {}; } }
  function inRun() { const a = api(); try { return !!(a && a.inRun && a.inRun()); } catch (_) { return false; } }
  function player() { const a = api(); try { return a && a.player ? a.player() : null; } catch (_) { return null; } }
  function dirty() { try { G.bus && G.bus.emit('statsDirty', {}); } catch (_) {} }

  // ------------------------------------------------------------------ données de classe
  function treeOf(classe) { return (G.SKILL_TREES && G.SKILL_TREES[classe]) || null; }
  function kitOf(classe) {
    const t = treeOf(classe), core = t && t.core ? t.core : V2_KIT;
    const k = { cast1: core.basic, cast2: core.cast2, cast3: core.cast3, super: core.super };
    const C = G.CLASSES && G.CLASSES[classe];
    if (C) {
      const b = C.basic && C.basic.skillId, d = C.defaultSkills || {};
      if (b && def(b)) k.cast1 = b;
      ['cast2', 'cast3', 'super'].forEach((s) => { if (d[s] && def(d[s])) k[s] = d[s]; });
    }
    return k;
  }
  function kitIds(classe) { const k = kitOf(classe); return [k.cast1, k.cast2, k.cast3, k.super]; }
  function specList(classe) {
    const mine = (G.SKILL_SPECS && G.SKILL_SPECS[classe]) || [];
    const C = G.CLASSES && G.CLASSES[classe];
    const theirs = (C && Array.isArray(C.specs)) ? C.specs : [];
    const n = Math.max(mine.length, theirs.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const m = mine.find((x) => theirs[i] && x.id === theirs[i].id) || mine[i] || {};
      const t = theirs[i] || {};
      out.push({ id: t.id || m.id, name: t.name || m.name, desc: t.desc || m.desc, unlockLevel: num(t.unlockLevel, num(m.unlockLevel, 15)), skillId: t.skillId || m.skillId || null, flags: m.flags || [], stats: m.stats, mods: m.mods || {} });
    }
    return out;
  }
  function specOf(p) {
    if (!p || !p.skills || !p.skills.spec) return null;
    return specList(p.classe).find((s) => s.id === p.skills.spec) || null;
  }
  const specId = () => { const p = prof(); return p && p.skills ? p.skills.spec : null; };
  const isCore = (d) => !!(d && d.v2);
  // ultime : verrouillé jusqu'à son niveau de déblocage (niveau du HÉROS, 5 pour toutes les classes)
  const heroLevel = (p) => Math.floor(num(p && p.niveau, 1));

  // ------------------------------------------------------------------ profil, migration
  const LEGACY_FREE = ['assassin_basic', 'assassin_s1', 'assassin_s2', 'assassin_ult', 'archer_basic', 'archer_s1', 'archer_s2', 'archer_ult',
    'paladin_basic', 'paladin_s1', 'paladin_s2', 'paladin_ult', 'elementaliste_basic', 'elementaliste_s1', 'elementaliste_s2', 'elementaliste_ult'];
  /** Migration douce v2/v3/v4 → v5 : l'ancien kit (v2_*, anciens arbres) est remplacé par le kit de la classe ; tous les points dépensés sont rendus. */
  function migrate(p) {
    const s = p.skills;
    if (s.v >= SKILL_VERSION) return false;
    let refund = 0;
    const lv = s.levels || {};
    for (const id in lv) {
      const l = Math.max(0, Math.floor(num(lv[id], 0)));
      if (!l) continue;
      const d = def(id);
      // un id absent du catalogue v5 ou dont le sens a changé (tout id antérieur à v5) : points rendus
      const free = LEGACY_FREE.indexOf(id) >= 0 ? 1 : 0;
      if (id.indexOf('v2_') === 0) continue;
      if (d && d.v5 !== false && s.v === SKILL_VERSION - 1) continue;
      refund += Math.max(0, l - free);
    }
    s.levels = {};
    s.equipped = {};
    s.points = Math.max(0, Math.floor(num(s.points, 0))) + refund;
    if (s.spec && !specList(p.classe).some((x) => x.id === s.spec)) s.spec = null;
    s.variants = {};
    s.v = SKILL_VERSION;
    if (refund > 0 || p.__skillMigrationNote == null) p.__skillMigrationNote = refund > 0 ? ('Compétences refondues : ' + refund + ' point(s) rendu(s).') : undefined;
    if (p.__skillMigrationNote === undefined) delete p.__skillMigrationNote;
    return true;
  }
  function ensureProfile(p) {
    if (!p) return p;
    const first = !p.skills;
    const s = p.skills = p.skills || {};
    s.levels = s.levels || {};
    s.equipped = s.equipped || {};
    s.variants = s.variants || {};
    if (s.spec === undefined) s.spec = null;
    if (typeof s.points !== 'number' || !isFinite(s.points)) s.points = first ? Math.max(0, Math.floor(num(p.niveau, 1))) : 0;
    if (typeof s.granted !== 'number') s.granted = Math.floor(num(p.niveau, 1));
    if (first) s.v = SKILL_VERSION;
    // points versés par progression.js avant que ce système existe
    if (p.pendingGrants && num(p.pendingGrants.skillPoints, 0) > 0) { s.points += Math.floor(p.pendingGrants.skillPoints); p.pendingGrants.skillPoints = 0; }
    if (p.classe && G.SKILLS && Object.keys(G.SKILLS).length) {
      // v2 : un héros dont la classe n'a pas encore de catalogue (Nécromancien en cours de conversion) n'est pas migré
      if (p.classe && kitOf(p.classe).cast1 && def(kitOf(p.classe).cast1)) migrate(p);
      fixEquipped(p);
    }
    return p;
  }
  function fixEquipped(p) {
    const s = p.skills, kit = kitOf(p.classe);
    s.equipped.cast1 = kit.cast1;
    ['cast2', 'cast3', 'super'].forEach((sl) => {
      const id = s.equipped[sl], d = id && def(id);
      if (!d || !classOk(p, d) || !slotOk(sl, d) || (sl !== 'super' && !known(p, id))) s.equipped[sl] = kit[sl];
    });
    if (s.equipped.cast2 === s.equipped.cast3) s.equipped.cast3 = kit.cast3 === s.equipped.cast2 ? kit.cast2 : kit.cast3;
  }
  function classOk(p, d) { return !!d && !d.legacy && (d.classe === '*' || d.classe === p.classe); }
  function slotOk(slot, d) { return slot === 'super' ? d.kind === 'ultimate' : (slot === 'cast2' || slot === 'cast3') ? d.kind === 'active' : slot === 'cast1' ? d.kind === 'basic' : false; }
  const specOk = (p, d) => !d.spec || (p.skills && p.skills.spec === d.spec);

  function levelOf(p, id) {
    const d = def(id); if (!d || !p) return 0;
    if (d.v2) { const w = p.weapons && p.weapons[d.v2]; return clamp(Math.floor(num(w, 1)), 1, d.maxLevel); }
    if (id === 'v2_tornade') return 1;
    const l = p.skills && p.skills.levels ? Math.floor(num(p.skills.levels[id], 0)) : 0;
    if (!classOk(p, d)) return 0;
    // niveau du héros requis (ultime : niveau 5 ; déblocages 5/10/15/20/25 ; spécialisations 15)
    if (heroLevel(p) < num(d.unlockLevel, 1)) return 0;
    if (d.spec && !specOk(p, d)) return 0;
    // Le kit de départ (attaque de base + 2 actives de départ) et l'ultime sont connus d'office au niveau 1.
    if (kitIds(p.classe).indexOf(id) >= 0) return clamp(Math.max(1, l), 1, d.maxLevel);
    return clamp(l, 0, d.maxLevel);
  }
  function known(p, id) { return levelOf(p, id) > 0; }
  function freeLevel(p, d) { return p && d && kitIds(p.classe).indexOf(d.id) >= 0 ? 1 : 0; }
  function equipped(p) { p = p || prof(); if (!p) return {}; ensureProfile(p); return Object.assign({}, p.skills.equipped); }
  function pointCost(d) { return num(d.pointCost, 1); }
  // niveau du héros requis pour atteindre le niveau n d'une compétence
  function reqLevel(d, n) { return num(d.unlockLevel, 1) + 2 * Math.max(0, n - 1); }

  function whyNot(p, id) {
    ensureProfile(p);
    const d = def(id);
    if (!d) return 'Compétence inconnue.';
    if (!classOk(p, d)) return 'Réservée à une autre classe.';
    if (d.v2) return 'Ancien kit : se règle à la Forge.';
    if (d.spec && p.skills.spec !== d.spec) { const sp = specList(p.classe).find((x) => x.id === d.spec); return 'Spécialisation requise : ' + ((sp && sp.name) || d.spec) + '.'; }
    if (heroLevel(p) < num(d.unlockLevel, 1)) return 'Se débloque au niveau ' + d.unlockLevel + '.';
    const L = levelOf(p, id);
    if (L >= d.maxLevel) return 'Niveau maximum atteint.';
    const n = L + 1;
    if (num(p.niveau, 1) < reqLevel(d, n)) return 'Niveau ' + reqLevel(d, n) + ' requis.';
    if (rankIdx(p.rank) < RANK_ORDER.indexOf(d.rankReq || 'E')) return 'Rang ' + d.rankReq + ' requis.';
    const req = (d.tree && d.tree.requires) || [];
    for (const r of req) if (!known(p, r)) return 'Nécessite : ' + ((def(r) && def(r).name) || r) + '.';
    if (p.skills.points < pointCost(d)) return 'Point de compétence manquant.';
    return null;
  }
  function canLearn(p, id) { return whyNot(p, id) === null; }
  function learn(p, id) {
    p = p || prof(); if (!p || !canLearn(p, id)) return false;
    const d = def(id), s = p.skills;
    s.points -= pointCost(d);
    s.levels[id] = levelOf(p, id) + 1;
    try { G.bus && G.bus.emit('skillLearned', { skillId: id, level: s.levels[id] }); } catch (_) {}
    dirty();
    saveProfile();
    return true;
  }
  function equip(p, slot, id) {
    p = p || prof(); if (!p) return false; ensureProfile(p);
    const d = def(id);
    if (slot === 'cast1' || !d || !slotOk(slot, d) || !classOk(p, d) || !known(p, id)) return false;
    const s = p.skills.equipped, other = slot === 'cast2' ? 'cast3' : slot === 'cast3' ? 'cast2' : null;
    if (other && s[other] === id) s[other] = s[slot];
    s[slot] = id;
    saveProfile();
    return true;
  }
  function spentPoints(p) {
    let t = 0; const lv = (p.skills && p.skills.levels) || {};
    for (const id in lv) { const d = def(id); if (!d || d.v2 || !classOk(p, d)) continue; t += Math.max(0, Math.floor(num(lv[id], 0)) - freeLevel(p, d)) * pointCost(d); }
    return t;
  }
  function respecCost(p) { return 50 * Math.max(1, Math.floor(num(p.niveau, 1))); }
  function respec(p, free) {
    p = p || prof(); if (!p) return false; ensureProfile(p);
    const cost = free ? 0 : respecCost(p);
    if (num(p.gold, 0) < cost) return false;
    p.gold = num(p.gold, 0) - cost;
    p.skills.points += spentPoints(p);
    p.skills.levels = {}; p.skills.equipped = {}; p.skills.variants = {};
    fixEquipped(p);
    dirty();
    saveProfile();
    return true;
  }
  function chooseSpec(p, id) {
    p = p || prof(); if (!p) return false; ensureProfile(p);
    const sp = specList(p.classe).find((x) => x.id === id);
    if (!sp || num(p.niveau, 1) < sp.unlockLevel) return false;
    if (p.skills.spec) return false;           // choix définitif (réinitialisable via resetSpec)
    p.skills.spec = id;
    dirty();
    saveProfile();
    return true;
  }
  function resetSpec(p) {
    p = p || prof(); if (!p) return false; ensureProfile(p);
    const cost = respecCost(p);
    if (!p.skills.spec || num(p.gold, 0) < cost) return false;
    // les points investis dans la compétence exclusive sont rendus, elle est déséquipée
    const sp = specOf(p), sid = sp && sp.skillId;
    if (sid && p.skills.levels[sid]) { p.skills.points += Math.max(0, p.skills.levels[sid]) * pointCost(def(sid) || {}); delete p.skills.levels[sid]; }
    p.gold -= cost; p.skills.spec = null; fixEquipped(p); saveProfile(); return true;
  }
  /** Variante exclusive d'une compétence au niveau maximum : 'A' | 'B' | null */
  function setVariant(p, id, v) {
    p = p || prof(); if (!p) return false; ensureProfile(p);
    const d = def(id);
    if (!d || !d.variants || (v && !d.variants[v]) || levelOf(p, id) < d.maxLevel) return false;
    p.skills.variants = p.skills.variants || {};
    if (v) p.skills.variants[id] = v; else delete p.skills.variants[id];
    saveProfile();
    return true;
  }
  const variantOf = (p, id) => { const d = def(id); const v = p && p.skills && p.skills.variants && p.skills.variants[id]; return d && d.variants && v && d.variants[v] && levelOf(p, id) >= d.maxLevel ? v : null; };
  function onLevelUp(p, niveau) {
    p = p || prof(); if (!p) return;
    ensureProfile(p);
    const n = Math.floor(num(niveau, p.niveau));
    if (n > p.skills.granted) { p.skills.points += n - p.skills.granted; p.skills.granted = n; saveProfile(); toast('+1 point de compétence'); }
    // nouvelles compétences disponibles
    try {
      const fresh = Object.keys(SK()).map(def).filter((d) => d && classOk(p, d) && d.unlockLevel === n && d.unlockLevel > 1 && !(d.spec && p.skills.spec !== d.spec));
      if (fresh.length) toast('Nouvelle compétence disponible : ' + fresh.map((d) => d.name).join(', '));
    } catch (_) {}
  }

  // ------------------------------------------------------------------ forge : Arme de classe (epee) / Focalisateur (dague) / Relique (feu)
  const forgeLv = (p, k) => clamp(Math.floor(num(p && p.weapons && p.weapons[k], 1)), 1, 10);
  function forgeOf(p, d) {
    const k = d.kind === 'basic' ? 'epee' : d.kind === 'ultimate' ? 'feu' : 'dague';
    const L = forgeLv(p, k);
    const F = k === 'epee' ? { dmg: 0.07, cd: 0.022, mana: 0 } : k === 'dague' ? { dmg: 0.05, cd: 0.015, mana: 0.01 } : { dmg: 0.06, cd: 0.02, mana: 0 };
    return { key: k, L, dmg: 1 + F.dmg * (L - 1), cd: 1 - F.cd * (L - 1), mana: 1 - F.mana * (L - 1) };
  }

  // ------------------------------------------------------------------ ressources secondaires
  const RESDEF = {
    rage:  { name: 'Rage', color: '#e0402c', classe: 'Guerrier' },
    lames: { name: 'Lames', color: '#2a9d8f', classe: 'Voleur' },
    combo: { name: 'Combo', color: '#e63946', classe: 'Assassin' },
    conc:  { name: 'Concentration', color: '#3f9a50', classe: 'Archer' },
    foi:   { name: 'Foi', color: '#ffc933', classe: 'Paladin' },
    givre: { name: 'Givre', color: '#8fdcff', classe: 'Elementaliste' },
    orage: { name: 'Orage', color: '#fff04a', classe: 'Elementaliste' },
    ames:  { name: 'Âmes', color: '#7a35e0', classe: 'Necromancien' },
  };
  const lv = (id) => { const p = prof(); return p ? levelOf(p, id) : 0; };
  function resMax(id) {
    switch (id) {
      case 'rage': case 'conc': case 'foi': return 100;
      case 'lames': return 6 + (specId() === 'lame_fantome' ? 2 : 0) + (lv('voleur_maitre_voleur') >= 5 ? 1 : 0);
      case 'combo': return 5;
      case 'givre': case 'orage': return lv('elementaliste_resonance') >= 1 ? 4 : 3;
      case 'ames': return 10;
      default: return 0;
    }
  }
  function mainRes(classe) { return { Guerrier: 'rage', Voleur: 'lames', Assassin: 'combo', Archer: 'conc', Paladin: 'foi', Necromancien: 'ames' }[classe] || null; }
  function initResources() {
    S.res = { rage: 0, lames: resMax('lames'), combo: 0, conc: 0, foi: 0, givre: 0, orage: 0, ames: 0 };
    if (cls() === 'Voleur') S.res.lames = resMax('lames');
  }
  function resGet(id) { return num(S.res[id], 0); }
  function resSet(id, v) {
    const max = resMax(id), nv = clamp(num(v, 0), 0, max || 0);
    if (nv === S.res[id]) return nv;
    S.res[id] = nv;
    S.dirty[id] = true;
    return nv;
  }
  function resAdd(id, n) { return resSet(id, resGet(id) + num(n, 0)); }
  function resSpend(id, n) { n = num(n, 0); if (resGet(id) + 1e-6 < n) return false; resSet(id, resGet(id) - n); return true; }
  function flushRes() {
    for (const id in S.dirty) {
      delete S.dirty[id];
      const v = Math.floor(resGet(id) + 1e-6);
      const key = id; if (S.lastEmit[key] === v) continue; S.lastEmit[key] = v;
      try { G.bus && G.bus.emit('resourceChanged', { id, value: resGet(id), max: resMax(id), resource: resource() }); } catch (_) {}
    }
  }
  /** Ressource de la classe pour le HUD : {id, name, value, max, color, parts?} */
  function resource(classe) {
    classe = classe || cls();
    if (classe === 'Elementaliste') {
      const parts = ['givre', 'orage'].map((i) => ({ id: i, name: RESDEF[i].name, value: Math.floor(resGet(i) + 1e-6), max: resMax(i), color: RESDEF[i].color }));
      return { id: 'charges', name: 'Charges élémentaires', value: parts[0].value + parts[1].value, max: parts[0].max + parts[1].max, color: '#5ad1ff', parts };
    }
    if (classe === 'Mage') { const n = echoCount(); return { id: 'echo', name: 'Écho arcanique', value: n, max: echoMax(), color: '#9d4edd' }; }
    const id = mainRes(classe); if (!id) return null;
    const v = resGet(id);
    return { id, name: RESDEF[id].name, value: id === 'conc' || id === 'rage' || id === 'foi' ? Math.round(v) : Math.floor(v + 1e-6), max: resMax(id), color: RESDEF[id].color };
  }

  // ------------------------------------------------------------------ Écho arcanique (Mage)
  const echoMax = () => (lv('mage_maitrise_flux') >= 1 ? 5 : 3);
  const echoWindow = () => (lv('mage_maitrise_flux') >= 5 ? 5 : 4);
  function echoCount() { return S.time - S.echo.t <= echoWindow() ? S.echo.n : 0; }
  /** appelé à chaque sort (non basic) du Mage : renvoie les Échos AVANT le lancer, puis empile */
  function echoCast(id) {
    const before = echoCount();
    if (S.time - S.echo.t <= echoWindow()) { if (S.echo.last !== id) S.echo.n = Math.min(echoMax(), S.echo.n + 1); }
    else S.echo.n = 1;
    S.echo.last = id; S.echo.t = S.time;
    return before;
  }

  // ------------------------------------------------------------------ marques / piles sur les ennemis
  function sk(e) { if (!e) return {}; return e.__sk || (e.__sk = { tags: {}, blades: 0, bladesT: 0 }); }
  function tag(e, name, dur, val) { if (!e) return; sk(e).tags[name] = { t: S.time + num(dur, 5), v: val == null ? 1 : val }; }
  function tagged(e, name) { const t = e && e.__sk && e.__sk.tags[name]; return t && t.t > S.time ? t.v : 0; }
  function untag(e, name) { if (e && e.__sk) delete e.__sk.tags[name]; }
  function blades(e) { return e && e.__sk && e.__sk.bladesT > S.time ? e.__sk.blades : 0; }
  function addBlades(e, n, max, dur) { const o = sk(e); const cur = blades(e); o.blades = Math.min(max || 5, cur + n); o.bladesT = S.time + (dur || 6); return o.blades; }
  function clearBlades(e) { if (e && e.__sk) { e.__sk.blades = 0; e.__sk.bladesT = 0; } }
  const hasSt = (e, id) => !!(e && e.statuses && e.statuses[id] && (typeof e.statuses[id] !== 'object' || e.statuses[id].t > 0));
  const alive = (e) => e && !e.dead && (e.pv == null || e.pv > 0);
  /** l'ennemi est « bréché » : étourdi, gelé, ralenti */
  const impaired = (e) => hasSt(e, 'stun') || hasSt(e, 'freeze') || hasSt(e, 'slow');
  function facing(e) {
    if (e && isFinite(e.fx) && isFinite(e.fz) && (e.fx || e.fz)) return { x: e.fx, z: e.fz };
    const ry = e && e.mesh && e.mesh.rotation ? e.mesh.rotation.y : 0;
    return { x: Math.sin(ry), z: Math.cos(ry) };
  }
  /** le joueur (pos) est-il dans le dos de l'ennemi ? */
  function behind(e, pos) {
    if (!e || !pos) return false;
    const f = facing(e), dx = pos.x - e.pos.x, dz = pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
    return (f.x * dx + f.z * dz) / d < -0.25;
  }
  /** statut sans danger pour les boss : étourdissement / gel / peur -> ralentissement de 50 % (durée /2) */
  function status(a, e, id, dur, power) {
    if (!a || !a.status || !e || e.dead) return false;
    if (e.boss && (id === 'stun' || id === 'freeze' || id === 'fear')) return a.status(e, { id: 'slow', duration: Math.max(0.3, dur * 0.5), power: 0.5 });
    return a.status(e, { id, duration: dur, power: power == null ? 1 : power });
  }

  // ------------------------------------------------------------------ minuteries / zones propres au moteur (liées au run)
  function after(sec, fn) { S.timers.push({ t: S.time + Math.max(0, sec), fn }); }
  /** boucle : appelle fn(k, dt) toutes les `every` s pendant `dur` s ; onEnd à la fin. renvoie l'objet (z.dead = true pour l'arrêter) */
  function loop(dur, every, fn, onEnd) {
    const z = { t0: S.time, end: S.time + dur, every: Math.max(0.05, every), next: S.time + every, k: 0, fn, onEnd, dead: false };
    S.zones.push(z); return z;
  }
  function runLoops(dt) {
    if (S.timers.length) {
      const due = S.timers.filter((x) => x.t <= S.time);
      if (due.length) { S.timers = S.timers.filter((x) => x.t > S.time); due.forEach((x) => { try { x.fn(); } catch (e) { console.error('[Skills.after]', e); } }); }
    }
    if (!S.zones.length) return;
    for (const z of S.zones.slice()) {
      if (z.dead) continue;
      let guard = 0;
      while (!z.dead && S.time >= z.next && guard++ < 4) {
        z.next += z.every; z.k++;
        try { if (z.fn(z.k, z.every) === false) z.dead = true; } catch (e) { console.error('[Skills.loop]', e); z.dead = true; }
        if (z.next > z.end + 1e-6) break;
      }
      if (!z.dead && S.time >= z.end) { z.dead = true; }
      if (z.dead && !z.ended) { z.ended = true; if (z.onEnd) { try { z.onEnd(); } catch (e) { console.error('[Skills.loop.end]', e); } } }
    }
    S.zones = S.zones.filter((z) => !z.dead);
  }
  /** retire les projectiles ennemis dans un disque (murs, barrières, phalange) ; renvoie le nombre arrêté */
  function blockShots(pos, r) {
    const a = api(); let n = 0;
    try {
      const run = a && a.run && a.run(); if (!run || !run.projectiles) return 0;
      for (const pr of run.projectiles) {
        if (pr.dead || pr.owner !== 'enemy' || !pr.mesh) continue;
        const m = pr.mesh.position;
        if (Math.hypot(m.x - pos.x, m.z - pos.z) <= r) { pr.dead = true; if (pr.mesh.parent) pr.mesh.parent.remove(pr.mesh); n++; }
      }
    } catch (_) {}
    return n;
  }
  function cdCut(id, secs) {
    const p = prof(); if (!p) return;
    for (const slot of SLOTS) if (p.skills.equipped[slot] === id) {
      const c = S.chg[id];
      if (c) { if (c.n < c.max) { c.rt -= secs; if (c.rt <= 0) { c.n = Math.min(c.max, c.n + 1); c.rt = c.n < c.max ? c.cd : 0; } } }
      else if (S.cd[slot] && S.cd[slot].t > 0) S.cd[slot].t = Math.max(0, S.cd[slot].t - secs);
    }
  }
  function cdFrac(id, f) {   // rend une fraction de la recharge restante
    const p = prof(); if (!p) return;
    for (const slot of SLOTS) if (p.skills.equipped[slot] === id && S.cd[slot]) S.cd[slot].t *= (1 - clamp(f, 0, 1));
  }
  function cdReset(id) {
    const p = prof(); if (!p) return;
    for (const slot of SLOTS) if (p.skills.equipped[slot] === id) { if (S.cd[slot]) S.cd[slot].t = 0; const c = S.chg[id]; if (c) { c.n = c.max; c.rt = 0; } }
  }
  /** dégâts « bruts » pour les effets passifs (explosions à la mort, riposte…) : pct en % de puissance */
  function calc(a, pct, element, mult) {
    const p = player() || { stats: {}, level: 1 }, st = p.stats || {};
    const xp = G.DATA && G.DATA.XP;
    const m = (xp && xp.dmgMult ? xp.dmgMult(p.level || 1) : 1) * ((st.dmg && Number(st.dmg[element || 'physique'])) || 1) * (mult || 1);
    return Math.max(1, Math.round((pct / 10) * m));
  }
  function playerPos() { const p = player(); return p ? p.pos : { x: 0, z: 0 }; }
  function skillLv(id) { return lv(id); }

  const K = {
    time: () => S.time, state: S, lv: skillLv, has: (id) => lv(id) > 0, spec: specId, classe: cls,
    res: { get: resGet, set: resSet, add: resAdd, spend: resSpend, max: resMax },
    sk, tag, tagged, untag, blades, addBlades, clearBlades, impaired, hasStatus: hasSt, behind, facing, status, alive,
    after, loop, blockShots, cdCut, cdFrac, cdReset, calc, playerPos, forgeLv: (k) => forgeLv(prof(), k),
    echo: echoCount, echoMax, variant: (id) => variantOf(prof(), id),
    v: () => S.v,
  };

  // ------------------------------------------------------------------ buffs / boucliers / marques
  function addBuff(id, o) {
    o = o || {};
    S.buffs = S.buffs.filter((b) => b.id !== id);
    const b = Object.assign({ id, t: o.duration || 1, dur: o.duration || 1 }, o);
    S.buffs.push(b);
    try { const a = api(); if (a && a.buff) a.buff({ id, duration: b.dur, stats: {}, vfx: o.vfx, name: o.name, icon: o.icon, color: o.color }); } catch (_) {}
    dirty();
    return b;
  }
  function removeBuff(id) {
    const b = S.buffs.find((x) => x.id === id); if (!b) return;
    S.buffs = S.buffs.filter((x) => x !== b);
    try { const a = api(); a && a.removeBuff && a.removeBuff(id); } catch (_) {}
    if (b.onEnd) { try { b.onEnd(); } catch (e) { console.error(e); } }
    dirty();
  }
  const hasBuff = (id) => S.buffs.some((b) => b.id === id && b.t > 0);
  function buffsForHud() { return S.buffs.filter((b) => b.name).map((b) => ({ icon: b.icon || 'sparkles', timeFrac: clamp(b.t / b.dur, 0, 1), name: b.name })); }
  function isPlayerTarget(c) {
    const t = c && c.target;
    if (!t || t === 'player' || t.isPlayer) return true;
    return !(t.def || t.ai || t.statuses);
  }
  function mark(e, mult, dur, skillId) {
    if (!e) return;
    e.__skMark = { until: S.time + (dur || 5), mult: mult || 1.2, mana: 0, by: skillId };
  }

  // ------------------------------------------------------------------ cast
  function mods(p, id) { const sp = specOf(p); return (sp && sp.mods && sp.mods[id]) || {}; }
  function slotName(s) { return s === 1 || s === '1' ? 'cast1' : s === 2 || s === '2' ? 'cast2' : s === 3 || s === '3' ? 'cast3' : s; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function maxCharges(d, level) {
    if (typeof d.charges === 'function') { try { return Math.max(1, Math.floor(d.charges(level, K))); } catch (_) { return 1; } }
    return Math.max(1, Math.floor(num(d.charges, 1)));
  }
  function chargeInfo(slot) {
    const p = prof(); if (!p) return null;
    const d = def(equipped(p)[slotName(slot)]);
    if (!d || !d.charge) return null;
    let mt = d.charge.maxTime;
    if (cls() === 'Archer') { mt = mt / (1 + 0.004 * resGet('conc')); if (forgeLv(p, 'epee') >= 5) mt *= 0.85; }
    return { skillId: d.id, maxTime: Math.max(0.15, mt), minMult: d.charge.minMult, maxMult: d.charge.maxMult };
  }

  // multiplicateur de dégâts propre à la classe, évalué au lancer
  function classMult(d, ctx, pl) {
    const c = cls(); let m = 1;
    const st = (pl && pl.stats) || {};
    if (c === 'Guerrier') {
      m *= 1 + 0.0025 * resGet('rage');
    } else if (c === 'Mage') {
      const pc = pl && pl.manaMax > 0 ? pl.mana / pl.manaMax : 0;
      if (pc >= 0.8) m *= 1 + (lv('mage_surcharge') >= 1 ? 0.15 : 0.10);
      if (d.kind !== 'basic' && d.echo !== false) m *= 1 + (0.10 + (forgeLv(prof(), 'dague') >= 10 ? 0.05 : 0)) * ctx.echo;
    } else if (c === 'Paladin') {
      if (resGet('foi') >= 50 && d.element === 'sacre') m *= 1.15;
    } else if (c === 'Assassin') {
      if (d.kind === 'basic') m *= 1 + 0.06 * resGet('combo');
      if (S.v.voile && S.v.voile > S.time && d.id !== 'assassin_voile' && !ctx.echoCast) { m *= 2; S.v.voile = 0; resAdd('combo', 2); removeBuff('voile'); }
    } else if (c === 'Elementaliste') {
      if (d.kind !== 'basic' && (d.element === 'glace' || d.element === 'foudre')) {
        const du = S.v.dual;
        if (du && du.until > S.time && du.el !== d.element) { m *= 1.25; ctx.dual = true; }
        S.v.dual = { el: d.element, until: S.time + 5 };
      }
      if (S.v.zenith && S.v.zenith > S.time) m *= 1.3;
    }
    void st;
    return m;
  }

  function cast(slotIn, data) {
    const slot = slotName(slotIn), a = api(), p = prof();
    if (!a || !p || !SLOTS.includes(slot)) return false;
    if (!inRun()) return false;
    ensureProfile(p);
    const id = p.skills.equipped[slot], d = def(id);
    if (!d || typeof d.cast !== 'function') return false;
    const free = !!(data && data.free), echo = !!(data && data.echo);
    const level = levelOf(p, id);
    if (level < 1) { if (slot === 'super') { toast('Ultime verrouillé jusqu\'au niveau ' + num(d.unlockLevel, 5)); a.sfx && a.sfx('error'); } return false; }
    const chMax = maxCharges(d, level);
    let chg = null;
    if (chMax > 1) {
      chg = S.chg[id] || (S.chg[id] = { n: chMax, max: chMax, rt: 0, cd: 1 });
      if (chg.max !== chMax) { chg.n += chMax - chg.max; chg.max = chMax; }
      if (!free && chg.n < 1) return false;
    } else {
      const cdS = S.cd[slot];
      if (!free && cdS && cdS.t > 0) return false;
    }
    const md = mods(p, id), fg = forgeOf(p, d), pl = player() || { stats: {} };
    // ultime : barre de charge gérée par game.js (api.superCharge()->0..1 / api.consumeSuper()->bool)
    if (!free && slot === 'super' && a.superCharge && num(a.superCharge(), 1) < 1) { toast('Ultime pas encore chargé'); a.sfx && a.sfx('error'); return false; }
    // mana
    let cost = (typeof d.manaAt === 'function' ? num(d.manaAt(level), 0) : num(d.manaCost, 0)) * num(md.mana, 1) * fg.mana;
    if (cls() === 'Mage' && d.kind === 'active' && forgeLv(p, 'dague') >= 5) cost *= 0.9;
    if (S.v.doublon && S.v.doublon > S.time) cost *= 0.7;
    if (S.v.zenith && S.v.zenith > S.time) cost = 0;
    if (S.v.freeMana && S.v.freeMana > S.time) cost = 0;
    try { cost = G.hooks ? G.hooks.run('skillManaCost', cost, { skillId: id }) : cost; } catch (_) {}
    cost = free ? 0 : Math.max(0, Math.round(cost));
    let surcharged = false;
    if (cost > 0 && a.spendMana && !a.spendMana(cost)) {
      // Surcharge (Mage, niveau 25) : un sort sans mana suffisant est lancé quand même, une fois par 25 s (15 s au niveau 5)
      const sl = lv('mage_surcharge');
      if (cls() === 'Mage' && sl >= 1 && (S.v.surchargeCd || 0) <= S.time && d.kind !== 'basic') {
        S.v.surchargeCd = S.time + (sl >= 5 ? 15 : 25); surcharged = true;
        try { const q = a.player(); if (q) a.spendMana(q.mana); } catch (_) {}
        a.text && a.text(pl.pos, 'SURCHARGE !', '#c77dff', 1.2);
      } else { toast('Pas assez de mana'); a.sfx && a.sfx('error'); return false; }
    }
    // combo
    let step = 0;
    if (d.combo) {
      const c = S.combo[slot];
      const steps = typeof d.comboSteps === 'function' ? d.comboSteps(level, fg) : d.combo.steps;
      const win = typeof d.comboWindowAt === 'function' ? d.comboWindowAt(level) : num(d.combo.window, 0.8);
      step = c && S.time - c.last <= win ? (c.step + 1) % steps : 0;
    }
    // charge
    let charge = 0, cm = 1;
    if (d.charge) {
      charge = data && typeof data.charge === 'number' ? clamp(data.charge, 0, 1) : 1;
      cm = lerp(d.charge.minMult, d.charge.maxMult, charge);
    }
    const sp = specOf(p), flags = {};
    ((sp && sp.flags) || []).forEach((f) => { flags[f] = true; });
    const ctx = {
      dir: data && data.dir || null, charge, cm, comboStep: step, level, max: level >= d.maxLevel, skill: d, slot, time: S.time,
      spec: sp ? sp.id : null, v: variantOf(p, id), free, echoCast: echo, K,
      forge: fg, perk: (n) => fg.L >= n,
      flag: (n) => !!flags[n],
      buff: (bid, o) => addBuff(bid, o || {}),
      mark: (e, m, dur) => mark(e, m, dur, id),
      refundCd: (f) => { if (chg) { chg.rt *= (1 - clamp(f, 0, 1)); } else { const c = S.cd[slot]; if (c) c.t *= (1 - clamp(f, 0, 1)); } },
      res: resGet, gain: resAdd, spend: resSpend, resMax,
      echo: 0, power: num(data && data.power, 1),
    };
    if (cls() === 'Mage' && d.kind !== 'basic' && d.echo !== false && !echo) ctx.echo = echoCast(id);
    ctx.dmgMult = num(md.dmg, 1) * fg.dmg * classMult(d, ctx, pl) * ctx.power;
    let ret;
    try { ret = d.cast(a, level, ctx); } catch (err) { console.error('[Skills.cast ' + id + ']', err); ret = false; }
    if (ret === false) {
      if (cost > 0 && a.restoreMana && !surcharged) a.restoreMana(cost);
      if (cls() === 'Mage' && ctx.echo != null && d.kind !== 'basic') { /* l'écho empilé reste : lancer annulé = sans effet notable */ }
      return false;
    }
    if (free) return true;
    S.v.lastAct = S.time;
    if (cls() === 'Archer') S.v.lastShot = S.time;
    if (d.kind !== 'basic') S.v.lastSpell = S.time;
    if (slot === 'super' && a.consumeSuper) a.consumeSuper();
    // Doublon d'incantation (Archimage) : le sort est relancé à 50 %
    if (cls() === 'Mage' && S.v.doublon && S.v.doublon > S.time && d.kind !== 'basic' && !echo && d.id !== 'mage_doublon') {
      K.after(0.45, () => { try { cast(slot, { free: true, echo: true, power: S.v.doublonPower || 0.5, dir: data && data.dir }); } catch (_) {} });
    }
    // recharge
    let base = typeof d.cdAt === 'function' ? d.cdAt(level) : num(d.cd, 1);
    if (ret && typeof ret.cd === 'number') base = ret.cd;
    let cd = base * num(md.cd, 1) * fg.cd * num(ret && ret.cdMult, 1) + num(ret && ret.cdAdd, 0);
    try { cd = G.hooks ? G.hooks.run('skillCooldown', cd, { skillId: id }) : cd; } catch (_) {}
    cd *= 1 - clamp(num(stats().cdr, 0), 0, 0.6);
    if (cls() === 'Mage' && d.kind === 'active') cd *= 1 - 0.01 * echoCount() * (lv('mage_maitrise_flux') >= 1 ? 1 : 0);
    if (d.kind === 'basic') cd /= S.buffs.reduce((m, b) => m * (b.atkSpeed || 1), 1);
    cd = Math.max(0.1, cd);
    if (ret && ret.noCd) cd = 0.1;
    if (chg) { chg.n = Math.max(0, chg.n - 1); chg.cd = cd; if (chg.rt <= 0) chg.rt = cd; S.cd[slot] = { t: 0, max: cd }; }
    else S.cd[slot] = { t: cd, max: cd };
    if (d.combo) S.combo[slot] = { step, last: S.time };
    if (!echo) try { G.bus && G.bus.emit('skillCast', { skillId: id, slot, element: d.element, tags: d.tags, kind: d.kind, level }); } catch (_) {}
    return true;
  }
  function cooldowns() {
    const o = {}, p = prof();
    SLOTS.forEach((s) => {
      const c = S.cd[s]; let f = c && c.t > 0 ? clamp(c.t / c.max, 0, 1) : 0;
      const id = p && p.skills && p.skills.equipped[s], ch = id && S.chg[id];
      if (ch && ch.max > 1) f = ch.n >= 1 ? 0 : clamp(ch.rt / Math.max(0.1, ch.cd), 0, 1);
      o[s] = f;
    });
    o[1] = o.cast1; o[2] = o.cast2; o[3] = o.cast3;
    return o;
  }
  function hudInfo(p) {
    p = p || prof(); const o = {}; if (!p) return o;
    const eq = equipped(p), cds = cooldowns();
    SLOTS.forEach((s) => {
      const d = def(eq[s]);
      if (!d) { o[s] = { icon: '', name: '', cdFrac: 0, mana: 0, locked: true }; return; }
      const L = levelOf(p, d.id);
      const ch = S.chg[d.id];
      o[s] = { icon: d.icon, name: d.name, cdFrac: cds[s], mana: num(d.manaCost, 0), locked: L < 1, color: d.color, level: L };
      if (ch && ch.max > 1) { o[s].charges = ch.n; o[s].maxCharges = ch.max; }
    });
    o.res = resource(p.classe);
    return o;
  }

  // ------------------------------------------------------------------ hooks & événements
  function applyStats(st, p) {
    if (!st || !p || !p.classe) return st;
    ensureProfile(p);
    const cp = G.CLASS_PASSIVES && G.CLASS_PASSIVES[p.classe];
    if (cp && cp.apply) st = cp.apply(st) || st;
    const sp = specOf(p);
    if (sp && sp.stats) st = sp.stats(st) || st;
    for (const id in SK()) {
      const d = def(id);
      if (d && d.kind === 'passive' && typeof d.passive === 'function' && classOk(p, d)) { const L = levelOf(p, id); if (L > 0) st = d.passive(st, L) || st; }
    }
    for (const b of S.buffs) {
      if (b.add) for (const k in b.add) st[k] = (Number(st[k]) || 0) + b.add[k];
      if (b.mul) for (const k in b.mul) if (st[k] != null) st[k] = Number(st[k]) * b.mul[k];
      if (b.mulD) { st.dmg = st.dmg || {}; for (const k in b.mulD) st.dmg[k] = (st.dmg[k] == null ? 1 : st.dmg[k]) * b.mulD[k]; }
    }
    return st;
  }

  // dégâts reçus par le joueur : classes puis buffs
  function reflectNear(a, pct, range) {
    try { const pp = playerPos(); const e = a.nearestEnemy(pp, range || 3.5); if (e) a.damage(e, calc(a, pct, 'physique'), { element: 'physique', kind: 'melee', canCrit: false, noCharge: true, source: 'player', tags: ['reflect'] }); } catch (_) {}
  }
  function classIncoming(dmg, a) {
    const c = cls(); const pl = player(); if (!pl) return;
    if (c === 'Guerrier') {
      let m = 0.92;                                   // Peau de fer
      if (resGet('rage') >= 50) m *= 0.9;
      if (lv('guerrier_cuirasse') >= 1) { const r = resGet('rage'); if (r >= 70) m *= 0.97; if (r >= 90) m *= 0.97; }
      if (specId() === 'gardien') m *= 0.9;
      dmg.amount *= m;
      if (lv('guerrier_cuirasse') >= 5 && dmg.kind !== 'hazard') reflectNear(a, 10);
      // Indomptable : un coup mortel laisse 1 PV
      const il = lv('guerrier_indomptable');
      if (il >= 1 && (S.v.indCd || 0) <= S.time && dmg.kind !== 'hazard') {
        const dr = clamp(num(pl.stats && pl.stats.damageReduction, 0), 0, 0.85);
        if (dmg.amount * (1 - dr) >= pl.pv) {
          S.v.indCd = S.time + (il >= 5 ? 60 : 90);
          dmg.amount = Math.max(0, (pl.pv - 1) / (1 - dr));
          resSet('rage', 100);
          addBuff('indomptable', { duration: 2, invuln: true, name: 'Indomptable', icon: 'heart' });
          if (il >= 5 && a.heal) a.heal(pl.pvMax * 0.25);
          a.text && a.text(pl.pos, 'INDOMPTABLE !', '#ff6a4d', 1.4);
        }
      }
    } else if (c === 'Paladin') {
      if (lv('paladin_egide') >= 5 && resGet('foi') > 50) dmg.amount *= 0.9;
    } else if (c === 'Mage') {
      const eg = S.v.egide;
      if (eg && eg.until > S.time && pl.mana > 0 && dmg.amount > 0) {
        const part = dmg.amount * 0.7, paid = Math.min(part, pl.mana);
        if (a.spendMana) a.spendMana(paid);
        dmg.amount -= paid; eg.absorbed = (eg.absorbed || 0) + paid;
        if (a.restoreMana) a.restoreMana(pl.manaMax * 0.01);
      }
    }
  }
  function incoming(dmg, c) {
    if (!dmg || !isPlayerTarget(c)) return dmg;
    const a = api();
    for (const b of S.buffs) { if (b.invuln && b.t > 0) { dmg.amount = 0; return dmg; } }
    try { if (a) classIncoming(dmg, a); } catch (e) { console.error('[Skills.incoming]', e); }
    for (const b of S.buffs) if (b.incoming != null) dmg.amount *= b.incoming;
    for (const b of S.buffs.slice()) {
      if (b.onHit && dmg.amount > 0 && !b.hitDone) { b.hitDone = !b.repeat; try { b.onHit(dmg); } catch (e) { console.error(e); } }
      if (b.shield > 0 && dmg.amount > 0) {
        const ab = Math.min(b.shield, dmg.amount); b.shield -= ab; dmg.amount -= ab;
        if (b.onAbsorb) { try { b.onAbsorb(ab); } catch (e) { console.error(e); } }
        if (b.shield <= 0) { b.t = 0; if (b.onBreak) { try { b.onBreak(); } catch (e) { console.error(e); } } }
      }
    }
    return dmg;
  }
  const BACKSTAB_ALL = true;
  function outgoing(dmg, c) {
    if (!dmg || typeof dmg.amount !== 'number') return dmg;
    const t = c && c.target, src = c && c.source;
    const m = t && t.__skMark;
    if (m && m.until > S.time) dmg.amount *= m.mult;
    if (!t || t === 'player' || !t.pos || src === 'enemy') return dmg;
    const k = cls(); const tags = dmg.tags || [];
    const isDot = dmg.kind === 'dot';
    try {
      if (src === 'minion') {
        if (k === 'Necromancien') { const sov = G.Necro && G.Necro.sovereignActive && G.Necro.sovereignActive(); dmg.amount *= 1 + (0.02 + (sov ? 0.04 + (forgeLv(prof(), 'feu') >= 10 ? 0.04 : 0) : 0)) * resGet('ames'); }
        return dmg;
      }
      if (k === 'Voleur') {
        const n = blades(t);
        if (n > 0 && !isDot) dmg.amount *= 1 + n * (lv('voleur_maitre_voleur') >= 1 ? 0.06 : 0.04);
        if (tagged(t, 'pillage') && !isDot) dmg.amount *= 1.2;
      } else if (k === 'Assassin' && !isDot) {
        const pp = playerPos();
        const back = behind(t, pp), mk = hasSt(t, 'mark') || tagged(t, 'sentence');
        let add = (back || mk) ? 0.5 : 0;
        const thr = lv('assassin_faucheur') >= 1 ? 0.30 : 0.20;
        if (t.pvMax > 0 && t.pv / t.pvMax < thr && tags.indexOf('sk:assassin_execution') < 0) add += 1.0;
        if (add > 0) dmg.amount *= 1 + add;
        if (back && dmg.crit && lv('assassin_instinct') >= 5 && (S.v.instCd || 0) <= S.time) { S.v.instCd = S.time + 0.5; resAdd('combo', 1); }
        if (back && !dmg.crit && Math.random() < 0.06 + (forgeLv(prof(), 'epee') >= 5 && tags.indexOf('basic') >= 0 ? 0.10 : 0)) dmg.crit = true;
        if (tagged(t, 'venin_expl')) { /* géré par la compétence */ }
      } else if (k === 'Paladin') {
        if (tagged(t, 'juge') && (S.v.jugeHeal || 0) <= S.time && src === 'player') { S.v.jugeHeal = S.time + 1; const a = api(), pl = player(); if (a && a.heal && pl && pl.pv < pl.pvMax) a.heal(pl.pvMax * 0.02); }
      } else if (k === 'Archer' && tags.indexOf('dist') >= 0) {
        const pp = playerPos(), d = Math.hypot(t.pos.x - pp.x, t.pos.z - pp.z);
        dmg.amount *= 1 + 0.25 * clamp((d - 5) / 10, 0, 1);
      } else if (k === 'Elementaliste' && dmg.element === 'foudre' && !isDot && hasSt(t, 'freeze') && !S.v.noShatter) {
        dmg.amount *= 1.4;
        shatter(t);
      }
    } catch (e) { console.error('[Skills.outgoing]', e); }
    return dmg;
  }
  function shatter(t) {
    const a = api(); if (!a) return;
    try { if (t.statuses) delete t.statuses.freeze; } catch (_) {}
    const x = t.pos.x, z = t.pos.z, sp = specId();
    const rad = 2.5 * (1 + (lv('elementaliste_resonance') >= 1 ? 0.15 : 0) + (sp === 'cryomancien' ? 0.2 : 0));
    const pct = 25 * (1 + num(stats().shatter, 0)) * (forgeLv(prof(), 'dague') >= 10 ? 1.2 : 1) * (sp === 'cryomancien' ? 1.2 : 1);
    after(0.02, () => {
      try {
        S.v.noShatter = true;
        a.aoe({ pos: { x, y: 0, z }, radius: rad, damage: calc(a, pct, 'glace'), element: 'glace', vfx: 'nova_glace', source: 'player', tags: ['sk:elementaliste_eclatement', 'aoe'] });
        a.vfx && a.vfx('ice_spikes', { x, y: 0, z }, { radius: rad });
        if (lv('elementaliste_resonance') >= 5) resAdd(Math.random() < 0.5 ? 'givre' : 'orage', 1);
      } finally { S.v.noShatter = false; }
    });
  }

  function onKill(ev) {
    const e = ev && ev.enemy, a = api(); if (!e || !a || e.ally) return;
    const k = cls(), killer = ev.killer || 'player';
    const mine = killer === 'player' || killer === 'minion';
    try {
      if (k === 'Necromancien' && mine) resAdd('ames', e.boss ? 5 : e.elite ? 3 : 1);
      if (k === 'Assassin' && killer === 'player') {
        if (lv('assassin_faucheur') >= 1) { if (a.restoreMana) { const q = a.player(); q && a.restoreMana(q.manaMax * 0.08); } cdCut('assassin_pas_ombre', 1); }
        else if (lv('assassin_pas_ombre') >= 3) cdCut('assassin_pas_ombre', 1);
        if (specId() === 'ombre') cdFrac('assassin_pas_ombre', 0.5);
        if (tagged(e, 'sentence')) cdFrac('assassin_pas_ombre', 0.5);
      }
      if (k === 'Voleur' && killer === 'player') {
        if (lv('voleur_maitre_voleur') >= 1 && blades(e) >= 5) {
          a.aoe({ pos: { x: e.pos.x, y: 0, z: e.pos.z }, radius: 2.5, damage: calc(a, 200, 'physique'), element: 'physique', vfx: 'explosion_physique', source: 'player', tags: ['sk:voleur_maitre_voleur', 'aoe'] });
        }
        if (tagged(e, 'pillage')) {
          a.aoe({ pos: { x: e.pos.x, y: 0, z: e.pos.z }, radius: 2.5, damage: calc(a, 150, 'physique'), element: 'physique', vfx: 'explosion_physique', source: 'player', tags: ['sk:voleur_pillage', 'aoe'] });
          const g = Math.max(10, Math.round((e.def && e.def.gold ? (Array.isArray(e.def.gold) ? (e.def.gold[0] + e.def.gold[1]) / 2 : e.def.gold) : 10)));
          try { if (a.giveGold) a.giveGold(g * 2); } catch (_) {}
        }
      }
      if (k === 'Mage' && specId() === 'pyromancien' && hasSt(e, 'burn')) {
        const pw = e.statuses.burn && e.statuses.burn.power || 4;
        for (const o of a.enemiesInRadius(e.pos, 3)) if (o !== e && !o.dead) a.status(o, { id: 'burn', duration: 3, power: Math.max(2, pw) });
      }
    } catch (err) { console.error('[Skills.onKill]', err); }
  }

  function onPlayerHit(ev) {
    const k = cls(), pl = player(); if (!pl) return;
    const amt = num(ev && ev.amount, 0), pct = pl.pvMax > 0 ? amt / pl.pvMax * 100 : 0;
    S.v.lastHurt = S.time; S.v.lastAct = Math.max(S.v.lastAct, S.time);
    try {
      if (k === 'Guerrier') { const g = Math.min(25, Math.round(pct)); if (g > 0) resAdd('rage', g * (S.v.titan && S.v.titan.until > S.time ? 2 : 1)); }
      else if (k === 'Paladin') { const g = Math.min(20, Math.round(pct)); if (g > 0) resAdd('foi', g); paladinSursaut(pl); }
      else if (k === 'Archer') resAdd('conc', -25);
      else if (k === 'Assassin') resAdd('combo', -1);
    } catch (e) { console.error('[Skills.playerHit]', e); }
  }
  function paladinSursaut(pl) {
    const L = lv('paladin_sursaut'), a = api(); if (L < 1 || !a) return;
    if (pl.pvMax > 0 && pl.pv / pl.pvMax < 0.25 && (S.v.sursautCd || 0) <= S.time) {
      S.v.sursautCd = S.time + (L >= 5 ? 40 : 60);
      addBuff('sursaut', { duration: 5, shield: pl.pvMax * 0.4, name: 'Sursaut de l\'Aube', icon: 'holy', onAbsorb: (n) => resAdd('foi', Math.min(20, n / pl.pvMax * 100)) });
      if (a.heal) a.heal(pl.pvMax * 0.15);
      a.vfx && a.vfx('holy_pillar', pl.pos, { height: 6 });
      a.text && a.text(pl.pos, 'SURSAUT DE L\'AUBE', '#ffe9a0', 1.3);
    }
  }
  function onDamageDealt(ev) {
    if (!ev || ev.source === 'enemy') return;
    if (ev.source === 'player' || ev.source == null) { S.v.lastHit = S.time; S.v.lastAct = Math.max(S.v.lastAct, S.time); }
    if (cls() !== 'Paladin' || ev.element !== 'sacre' || ev.source === 'minion') return;
    if ((S.v.sacreHeal || 0) > S.time) return;
    S.v.sacreHeal = S.time + 1;
    const a = api(), pl = player(); if (a && a.heal && pl && pl.pv < pl.pvMax) a.heal(pl.pvMax * 0.04);
  }

  // ------------------------------------------------------------------ boucle (ressources, minuteries)
  function classTick(dt, a, pl) {
    const k = cls(), t = S.time;
    if (k === 'Guerrier') {
      if (t - Math.max(S.v.lastAct, S.v.lastHit, S.v.lastHurt) > 5 && !(S.v.titan && S.v.titan.until > t)) {
        let dec = 4; if (pl.pvMax > 0 && pl.pv / pl.pvMax < 0.5) dec *= 0.5;
        if (specId() === 'berserker') dec *= 1.5;
        resAdd('rage', -dec * dt);
      }
    } else if (k === 'Voleur') {
      let reg = 1.2 * (1 + (lv('voleur_doigts_agiles') >= 1 ? 0.2 : 0) + (specId() === 'lame_fantome' ? 0.3 : 0));
      if (S.v.unlimited && S.v.unlimited > t) { resSet('lames', resMax('lames')); }
      else resAdd('lames', reg * dt);
    } else if (k === 'Assassin') {
      const lim = lv('assassin_instinct') >= 1 ? 12 : 6;
      if (resGet('combo') > 0 && t - S.v.lastHit > lim) resSet('combo', 0);
    } else if (k === 'Archer') {
      const px = pl.pos.x, pz = pl.pos.z;
      const sp = S.v.px != null ? Math.hypot(px - S.v.px, pz - S.v.pz) / Math.max(dt, 1e-3) : 0;
      S.v.px = px; S.v.pz = pz;
      const boost = 1 + (lv('archer_oeil_aigle') >= 1 ? 0.3 : 0);
      if (!(S.v.channel && S.v.channel > t)) resAdd('conc', (sp < 0.5 ? 18 : 3) * boost * dt);
      if (t - S.v.lastShot > 8) resAdd('conc', -10 * dt);
      if (resGet('conc') >= 99.99) { if (!S.v.perfect) { S.v.perfect = true; a.text && a.text(pl.pos, 'VISÉE PARFAITE', '#9bf08a', 1.1); } }
      else if (S.v.perfect && resGet('conc') < 90) S.v.perfect = false;
      // Traqueur : un piège gratuit toutes les 10 s
      if (specId() === 'traqueur') { S.v.trapAcc += dt; if (S.v.trapAcc >= 10) { S.v.trapAcc = 0; const c = S.chg.archer_piege; if (c && c.n < c.max) c.n++; } }
    } else if (k === 'Paladin') {
      const calm = t - Math.max(S.v.lastHurt, S.v.lastHit) > 4;
      if (calm) { resAdd('foi', -3 * dt); if (pl.pv < pl.pvMax && a.heal) { S.v.regenAcc += pl.pvMax * 0.01 * dt; if (S.v.regenAcc >= 1) { a.heal(Math.floor(S.v.regenAcc)); S.v.regenAcc -= Math.floor(S.v.regenAcc); } } }
    } else if (k === 'Elementaliste') {
      const life = lv('elementaliste_resonance') >= 1 ? 14 : 10;
      ['givre', 'orage'].forEach((i) => { if (resGet(i) > 0 && t - (S.v.chargeT[i] || 0) > life) resSet(i, 0); });
      const zl = lv('elementaliste_zenith');
      if (zl >= 1 && resGet('givre') >= resMax('givre') && resGet('orage') >= resMax('orage') && (S.v.zenithCd || 0) <= t && !(S.v.zenith > t)) {
        S.v.zenith = t + (zl >= 5 ? 8 : 6); S.v.zenithCd = S.v.zenith + 20;
        addBuff('zenith', { duration: zl >= 5 ? 8 : 6, name: 'Zénith', icon: 'crown', vfx: 'buff', color: 0x9fe6ff });
        resSet('givre', 0); resSet('orage', 0);
        a.text && a.text(pl.pos, 'ZÉNITH !', '#9fe6ff', 1.4);
      }
    }
  }
  const lastSpellFlag = 0; void lastSpellFlag;
  function onTick(e) {
    const dt = clamp(num(e && e.dt, 0), 0, 0.25);
    S.time += dt;
    for (const k in S.cd) if (S.cd[k].t > 0) S.cd[k].t = Math.max(0, S.cd[k].t - dt);
    for (const id in S.chg) {
      const c = S.chg[id];
      if (c.n < c.max) { c.rt -= dt; if (c.rt <= 0) { c.n++; c.rt = c.n < c.max ? c.cd : 0; } }
    }
    if (S.buffs.length) {
      let changed = false;
      const keep = [];
      for (const b of S.buffs) {
        b.t -= dt;
        if (b.tick && b.t > 0) { b.tickAcc = (b.tickAcc || 0) + dt; if (b.tickAcc >= b.tick) { b.tickAcc -= b.tick; try { b.onTick(); } catch (er) { console.error(er); } } }
        if (b.t > 0) keep.push(b); else { changed = true; if (b.onEnd) { try { b.onEnd(); } catch (er) { console.error(er); } } }
      }
      S.buffs = keep;
      if (changed) dirty();
    }
    const a = api(), pl = player();
    if (a && pl) { try { classTick(dt, a, pl); } catch (er) { console.error('[Skills.classTick]', er); } }
    runLoops(dt);
    flushRes();
  }
  function onRunStart() { resetRun(); }
  function onRoomStart() { S.zones = []; S.timers = []; }
  if (G.hooks) {
    G.hooks.add('stats', (st, c) => applyStats(st, (c && c.profile) || prof()), 10);
    G.hooks.add('incomingDamage', (dmg, c) => incoming(dmg, c), 20);
    G.hooks.add('outgoingDamage', (dmg, c) => outgoing(dmg, c), 5);
  }
  if (G.bus) {
    G.bus.on('tick', onTick);
    G.bus.on('runStart', onRunStart);
    G.bus.on('runEnd', resetRun);
    G.bus.on('roomStart', onRoomStart);
    G.bus.on('levelUp', (e) => onLevelUp(prof(), e && e.niveau));
    G.bus.on('enemyKilled', onKill);
    G.bus.on('playerHit', onPlayerHit);
    G.bus.on('damageDealt', onDamageDealt);
  }
  resetRun();

  G.Skills = {
    SLOTS, ensureProfile, equipped, levelOf, known, canLearn, whyNot, learn, equip, respec, respecCost, chooseSpec, resetSpec, specList, specOf,
    cast, cooldowns, chargeInfo, hudInfo, onLevelUp, kitOf, spentPoints, buffsForHud, addBuff, removeBuff, hasBuff, mark, applyStats,
    classPassive: (c) => (G.CLASS_PASSIVES && G.CLASS_PASSIVES[c]) || null,
    reqLevel, setVariant, variantOf, forgeOf, forgeLevel: forgeLv, resource, K, migrate,
    resGet, resSet, resAdd, resMax, kitIds, SKILL_VERSION,
    _state: S,
  };
  // =====================================================================
  // PANNEAU « Compétences » — v5 (agent 4 UI/UX) : en-tête de classe, kit actuel, groupes Départ / Niveaux / Spécialisation / Passifs, fiche détaillée
  // =====================================================================
  const CSS = `
.sk-wrap{--k-bg0:var(--ds-bg-0,#060912);--k-bg1:var(--ds-bg-1,#0b1122);--k-bg2:var(--ds-bg-2,#111a33);--k-bg3:var(--ds-bg-3,#18233f);
--k-line:var(--ds-line,rgba(130,180,255,.16));--k-line2:var(--ds-line-strong,rgba(130,200,255,.36));--k-tx:var(--ds-text,#e8f0ff);--k-tx2:var(--ds-text-2,#a9b8d6);--k-tx3:var(--ds-text-3,#6f7fa3);
--k-acc:var(--ds-accent,#46d4ff);--k-vio:var(--ds-accent-2,#8b6bff);--k-gold:var(--ds-gold,#ffc94a);--k-ok:var(--ds-success,#39e08c);--k-bad:var(--ds-danger,#ff4d6a);--k-mp:var(--ds-mp,#46b6ff);
--k-fd:var(--ds-font-display,'Chakra Petch',system-ui,sans-serif);--k-fb:var(--ds-font-body,'Nunito',system-ui,sans-serif);
font-family:var(--k-fb);color:var(--k-tx);max-width:1180px;margin:0 auto;padding:2px 0 24px;position:relative}
.sk-wrap *{box-sizing:border-box}.sk-wrap svg{display:block}.sk-wrap button{font-family:inherit}
/* ---------- bannière de niveau ---------- */
.sk-lvlup{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;padding:10px 12px;margin:0 0 10px;border-radius:var(--ds-r-md,10px);background:linear-gradient(100deg,rgba(255,201,74,.28),rgba(139,107,255,.2) 60%,rgba(70,212,255,.08));border:1px solid var(--k-gold);box-shadow:0 0 22px rgba(255,201,74,.25);animation:skIn .5s var(--ds-ease-out-back,cubic-bezier(.34,1.56,.64,1)) both}
.sk-lvlup::after{content:'';position:absolute;top:0;bottom:0;width:40%;left:-50%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);animation:skShine 1.8s .3s ease-out 2}
.sk-lvlup-ic{flex:none;width:40px;height:40px;display:grid;place-items:center;color:#241a00;background:var(--k-gold);border-radius:50%;box-shadow:0 0 16px rgba(255,201,74,.8)}
.sk-lvlup b{display:block;font:700 15px/1.15 var(--k-fd);letter-spacing:.06em;text-transform:uppercase;color:#fff}
.sk-lvlup span.t{display:block;font-size:12.5px;line-height:1.35;color:var(--k-tx2);margin-top:2px}
.sk-lvlup-new{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
@keyframes skIn{from{opacity:0;transform:translateY(-10px) scale(.96)}to{opacity:1;transform:none}}
@keyframes skShine{to{left:120%}}
/* ---------- en-tête de classe ---------- */
.sk-class{--cc:var(--k-acc);position:relative;padding:12px;margin:0 0 12px;border-radius:var(--ds-r-lg,16px);background:linear-gradient(135deg,color-mix(in srgb,var(--cc) 15%,var(--k-bg2)),var(--k-bg1) 70%);border:1px solid color-mix(in srgb,var(--cc) 45%,transparent);overflow:hidden}
.sk-class::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.018) 3px 4px);pointer-events:none}
.sk-ctop{position:relative;display:flex;align-items:center;gap:12px}
.sk-cico{flex:none;width:54px;height:58px;position:relative;display:grid;place-items:center;font-size:26px}
.sk-cico::before{content:'';position:absolute;inset:0;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(160deg,color-mix(in srgb,var(--cc) 70%,#fff),var(--cc) 50%,color-mix(in srgb,var(--cc) 45%,#000))}
.sk-cico::after{content:'';position:absolute;inset:2.5px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--cc) 40%,#0b1122),#060a16 80%)}
.sk-cico>span{position:relative;z-index:1}
.sk-cname{font:700 20px/1.1 var(--k-fd);letter-spacing:.06em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sk-crole{margin-top:4px;font:600 12.5px/1.3 var(--k-fd);color:color-mix(in srgb,var(--cc) 60%,#fff);letter-spacing:.02em}
.sk-ct{flex:1;min-width:0}
.sk-points{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:64px;padding:6px 10px;border-radius:var(--ds-r-md,10px);background:rgba(4,8,20,.6);border:1px solid var(--k-line2)}
.sk-points b{font:700 26px/1 var(--k-fd);color:var(--k-tx)}.sk-points small{margin-top:3px;font:700 9.5px/1.1 var(--k-fd);letter-spacing:.09em;text-transform:uppercase;color:var(--k-tx2);text-align:center}
.sk-points.has{border-color:var(--k-vio);background:linear-gradient(160deg,rgba(139,107,255,.35),rgba(4,8,20,.6));box-shadow:0 0 0 1px rgba(139,107,255,.4),0 0 20px rgba(139,107,255,.4)}
.sk-points.has b{color:#fff;text-shadow:0 0 12px var(--k-vio);animation:skBreath 1.8s ease-in-out infinite}
@keyframes skBreath{50%{transform:scale(1.1)}}
.sk-cdesc{position:relative;margin:10px 0 0;font-size:13px;line-height:1.45;color:var(--k-tx2)}
.sk-cgrid{position:relative;display:grid;gap:8px;margin-top:10px}
.sk-cbox{padding:9px 10px;border-radius:var(--ds-r-md,10px);background:rgba(4,8,20,.55);border:1px solid var(--k-line)}
.sk-cbt{display:flex;align-items:center;gap:6px;margin-bottom:7px;font:700 10.5px/1 var(--k-fd);letter-spacing:.12em;text-transform:uppercase;color:var(--k-tx3)}
.sk-cbt b{color:var(--k-tx);letter-spacing:.06em;font-size:12px}
.sk-cres .rg-row{min-height:16px;gap:8px}.sk-cres .rg-name{min-width:54px;font-size:10px}.sk-cres .rg-val{font-size:12px;min-width:20px}
.sk-cres .rg-bar{height:11px;border-radius:3px}.sk-cres .rg-pips i{height:11px}.sk-cres .rg-lames i,.sk-cres .rg-combo i{width:12px;height:12px}.sk-cres .rg-echo i,.sk-cres .rg-givre i,.sk-cres .rg-orage i{width:16px;height:12px}
.sk-cres .rg-bar{max-width:260px}.sk-cres .rg-pips{flex:0 0 auto}.sk-cres .rg-wrap{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
.sk-ctxt{font-size:12.5px;line-height:1.45;color:var(--k-tx2)}.sk-ctxt b{color:var(--k-tx)}
.sk-cpas-n{font:700 13.5px/1.2 var(--k-fd);color:var(--k-tx);margin-bottom:3px;display:flex;align-items:center;gap:6px}
.sk-cpas-n .sk-tag{margin-left:auto}
/* ---------- sections ---------- */
.sk-sect{display:flex;align-items:center;gap:8px;margin:16px 2px 8px;font:700 12px/1.1 var(--k-fd);letter-spacing:.13em;text-transform:uppercase;color:var(--k-tx2)}
.sk-sect::after{content:'';flex:1;height:1px;background:var(--k-line)}
.sk-sect small{font:600 11px var(--k-fb);letter-spacing:0;text-transform:none;color:var(--k-tx3)}
.sk-sect .sk-sn{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--k-bg3);border:1px solid var(--k-line2);font:700 11px var(--k-fd);color:var(--k-tx)}
.sk-sect .ds-btn{margin-left:auto;order:3}.sk-sect .ds-btn+::after{display:none}
.sk-sect.first{margin-top:4px}
/* ---------- kit actuel ---------- */
.sk-kit{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.sk-ks{position:relative;display:flex;align-items:center;gap:9px;padding:9px 8px;min-width:0;text-align:left;color:inherit;cursor:pointer;border-radius:var(--ds-r-md,10px);background:linear-gradient(160deg,var(--k-bg3),var(--k-bg1));border:1px solid var(--k-line2);-webkit-tap-highlight-color:transparent;transition:border-color var(--ds-fast,120ms),box-shadow var(--ds-med,220ms)}
.sk-ks:hover{border-color:var(--k-acc)}
.sk-ks.is-sel{border-color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.5),0 0 16px color-mix(in srgb,var(--e) 55%,transparent)}
.sk-ks.is-pick{border-color:var(--k-vio);box-shadow:0 0 0 1px var(--k-vio)}
.sk-ks.is-drop{animation:skDrop 1s ease-in-out infinite;border-color:var(--k-acc)}.sk-ks.is-over{transform:scale(1.04);border-color:#fff}
@keyframes skDrop{50%{box-shadow:0 0 14px var(--k-acc)}}
.sk-ks.is-ult{background:linear-gradient(160deg,rgba(255,201,74,.16),var(--k-bg1));border-color:rgba(255,201,74,.5)}
.sk-ks.is-locked{opacity:.6}
.sk-kh{display:flex;flex:none}
.sk-ksl{display:block;font:700 9.5px/1 var(--k-fd);letter-spacing:.14em;text-transform:uppercase;color:var(--k-tx3);margin-bottom:3px}
.sk-ksl kbd{margin-left:4px;padding:1px 4px;border-radius:3px;font:700 9px var(--k-fd);background:rgba(130,180,255,.12);color:var(--k-tx2)}
.sk-ksn{display:block;font:700 13px/1.15 var(--k-fd);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sk-kst{flex:1;min-width:0}
.sk-chips{display:flex;flex-wrap:wrap;gap:3px 7px;margin-top:4px;font:600 10.5px/1.2 var(--k-fb);color:var(--k-tx2)}
.sk-chips span{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}.sk-chips svg{width:11px;height:11px;opacity:.85}
.sk-chips .mp{color:var(--k-mp)}.sk-chips .cd{color:var(--k-tx2)}
.sk-tray{margin:8px 0 0;padding:10px;border:1px dashed var(--k-vio);border-radius:var(--ds-r-md,10px);background:rgba(139,107,255,.07)}
.sk-tray-t{font:700 11px var(--k-fd);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;color:var(--k-tx2)}
.sk-tray-row{display:flex;flex-wrap:wrap;gap:8px}
.sk-tray-i{display:flex;flex-direction:column;align-items:center;gap:3px;width:78px;background:none;border:0;color:var(--k-tx);cursor:pointer;font:600 11px/1.15 var(--k-fd);text-align:center;padding:2px}
.sk-tray-i.is-on .sk-hex{--hc:var(--k-gold)}
/* ---------- hexagone-icône ---------- */
.sk-hexw{width:var(--hs,56px);height:var(--hs,56px);position:relative;flex:none;transition:transform var(--ds-fast,120ms),filter var(--ds-med,220ms)}
.sk-hex{position:absolute;inset:0;background:var(--hc,var(--k-line2));clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)}
.sk-hex.is-round{clip-path:circle(50%)}
.sk-hex::before{content:'';position:absolute;inset:2px;background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--e,var(--k-acc)) 22%,var(--k-bg3)),var(--k-bg1) 80%);clip-path:inherit}
.sk-hex-i{position:absolute;inset:0;display:grid;place-items:center;color:var(--e,var(--k-acc));z-index:1}
.sk-hex-i svg{filter:drop-shadow(0 0 4px var(--e,var(--k-acc)))}
.sk-emo{font-size:calc(var(--hs,56px)*.42)}
.sk-lvb{position:absolute;right:-3px;bottom:-1px;min-width:20px;height:17px;padding:0 4px;border-radius:9px;background:var(--k-bg0);border:1px solid var(--hc,var(--k-line2));font:700 10px/15px var(--k-fd);text-align:center;color:var(--k-tx);z-index:2}
.sk-hlock{position:absolute;right:-3px;bottom:-2px;z-index:2;width:19px;height:19px;display:grid;place-items:center;border-radius:50%;background:var(--k-bg0);border:1px solid var(--k-line2);color:var(--k-gold)}
/* ---------- lignes de compétence ---------- */
.sk-list{display:flex;flex-direction:column;gap:6px}
.sk-row{--e:var(--k-acc);position:relative;display:flex;align-items:center;gap:10px;padding:8px 10px 8px 8px;min-width:0;cursor:pointer;border-radius:var(--ds-r-md,10px);background:linear-gradient(100deg,color-mix(in srgb,var(--e) 8%,var(--k-bg2)),var(--k-bg1));border:1px solid var(--k-line);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;transition:border-color var(--ds-fast,120ms),background var(--ds-fast,120ms)}
.sk-row:hover{border-color:var(--k-line2)}
.sk-row:focus-visible,.sk-ks:focus-visible{outline:2px solid var(--k-acc);outline-offset:2px}
.sk-row.is-sel{border-color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.4),0 0 16px color-mix(in srgb,var(--e) 40%,transparent)}
.sk-rt{flex:1;min-width:0}
.sk-rn{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:700 14px/1.15 var(--k-fd);letter-spacing:.02em}
.sk-tag{display:inline-block;padding:1px 6px;border-radius:8px;border:1px solid var(--k-line2);font:700 9.5px/1.4 var(--k-fd);letter-spacing:.07em;text-transform:uppercase;color:var(--k-tx2)}
.sk-tag.e{color:var(--e);border-color:color-mix(in srgb,var(--e) 55%,transparent)}.sk-tag.g{color:var(--k-gold);border-color:rgba(255,201,74,.55)}.sk-tag.v{color:#d9c8ff;border-color:var(--k-vio)}.sk-tag.ok{color:var(--k-ok);border-color:rgba(57,224,140,.5)}
.sk-rd{margin-top:3px;font-size:12px;line-height:1.35;color:var(--k-tx2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sk-rs{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px;min-width:54px;text-align:right}
.sk-pips{display:flex;gap:2px}.sk-pip{width:8px;height:4px;border-radius:2px;background:var(--k-bg3);border:1px solid var(--k-line)}.sk-pip.on{background:var(--e);border-color:var(--e);box-shadow:0 0 5px var(--e)}
.sk-lvt{font:700 10.5px/1 var(--k-fd);letter-spacing:.05em;color:var(--k-tx2)}
.sk-lk{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:9px;background:rgba(255,201,74,.1);border:1px solid rgba(255,201,74,.45);font:700 11px/1 var(--k-fd);color:var(--k-gold);white-space:nowrap}
.sk-av{display:inline-block;padding:3px 7px;border-radius:9px;background:rgba(70,212,255,.14);border:1px solid var(--k-acc);font:700 10.5px/1 var(--k-fd);letter-spacing:.04em;color:var(--k-acc);white-space:nowrap}
.sk-row.st-lock{background:linear-gradient(100deg,rgba(20,28,50,.7),var(--k-bg1))}
.sk-row.st-lock .sk-hex{--hc:rgba(130,160,210,.22)}.sk-row.st-lock .sk-hex-i{color:var(--k-tx3);opacity:.6}.sk-row.st-lock .sk-hex-i svg{filter:none}
.sk-row.st-lock .sk-rn{color:var(--k-tx2)}.sk-row.st-lock .sk-rd{color:var(--k-tx3)}
.sk-row.st-avail .sk-hex{--hc:var(--k-acc)}.sk-row.st-avail{border-color:rgba(70,212,255,.45)}.sk-row.st-avail .sk-hexw{animation:skPulse 1.8s ease-in-out infinite}
@keyframes skPulse{50%{filter:drop-shadow(0 0 9px var(--k-acc))}}
.sk-row.st-learned .sk-hex{--hc:var(--e)}.sk-row.st-learned .sk-hexw{filter:drop-shadow(0 0 4px color-mix(in srgb,var(--e) 70%,transparent))}
.sk-row.st-max .sk-hex{--hc:var(--k-gold)}.sk-row.st-max .sk-hexw{filter:drop-shadow(0 0 6px rgba(255,201,74,.6))}
.sk-row.st-max .sk-lvb,.sk-ks .st-max .sk-lvb{background:var(--k-gold);color:#241a00;border-color:var(--k-gold)}
.sk-ks .st-learned .sk-hex{--hc:var(--e)}.sk-ks .st-max .sk-hex{--hc:var(--k-gold)}.sk-ks .st-lock .sk-hex,.sk-ks.is-locked .sk-hex{--hc:rgba(130,160,210,.22)}.sk-ks .st-max .sk-lvb{background:var(--k-gold);color:#241a00;border-color:var(--k-gold)}
.sk-row.is-ult .sk-hex{background:linear-gradient(135deg,var(--k-gold),var(--k-vio))}
.sk-row.is-new::before{content:'NOUVEAU';position:absolute;top:-7px;left:12px;padding:2px 7px;border-radius:7px;background:var(--k-gold);color:#241a00;font:700 9px/1.2 var(--k-fd);letter-spacing:.1em;animation:skBreath 1.4s ease-in-out infinite}
.sk-row.is-pop .sk-hexw,.sk-ks.is-pop .sk-hexw{animation:skPop .8s var(--ds-ease-out-back,cubic-bezier(.34,1.56,.64,1)) both;animation-delay:var(--el,0s)}
.sk-row.is-pop::after{content:'';position:absolute;left:8px;top:50%;width:48px;height:48px;margin-top:-24px;border-radius:50%;border:2px solid var(--k-gold);animation:skRing .9s ease-out both;animation-delay:var(--el,0s);pointer-events:none}
@keyframes skPop{0%{transform:scale(.6)}55%{transform:scale(1.3);filter:drop-shadow(0 0 16px var(--k-gold))}100%{transform:scale(1)}}
@keyframes skRing{from{transform:scale(.8);opacity:1}to{transform:scale(2.6);opacity:0}}
/* ---------- chronologie des niveaux ---------- */
.sk-tl{display:flex;flex-direction:column}
.sk-tli{display:flex;gap:10px;position:relative;padding-bottom:8px}
.sk-tli:last-child{padding-bottom:0}
.sk-tlr{flex:none;width:36px;display:flex;flex-direction:column;align-items:center}
.sk-tlb{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--k-bg2);border:2px solid var(--k-line2);font:700 13px/1 var(--k-fd);color:var(--k-tx2);position:relative;z-index:1}
.sk-tlb small{display:block;font-size:8px;letter-spacing:.06em;color:var(--k-tx3);margin-top:1px}
.sk-tlb.ok{border-color:var(--k-ok);color:#fff;background:rgba(57,224,140,.16)}
.sk-tlb.lock{border-color:rgba(255,201,74,.5);color:var(--k-gold)}
.sk-tll{flex:1;width:2px;margin-top:3px;background:var(--k-line2);border-radius:1px}.sk-tli:last-child .sk-tll{display:none}
.sk-tli.ok .sk-tll{background:var(--k-ok);opacity:.55}
.sk-tlc{flex:1;min-width:0}
/* ---------- spécialisations ---------- */
.sk-specs{display:grid;gap:8px}
.sk-sc{--c:var(--k-vio);display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:var(--ds-r-lg,16px);background:linear-gradient(160deg,var(--k-bg3),var(--k-bg1));border:1px solid var(--k-line2)}
.sk-sc.is-active{border-color:var(--k-gold);box-shadow:0 0 18px rgba(255,201,74,.2)}
.sk-sc.is-off{opacity:.55}
.sk-sch{display:flex;align-items:center;gap:8px}.sk-sch svg{color:var(--k-vio)}.sk-sc.is-active .sk-sch svg{color:var(--k-gold)}
.sk-scn{font:700 15px/1.1 var(--k-fd);letter-spacing:.05em;text-transform:uppercase;flex:1}
.sk-scd{font-size:12.5px;line-height:1.45;color:var(--k-tx2)}
.sk-sca{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sk-note{font-size:11.5px;color:var(--k-tx3);margin:6px 2px 0}
.sk-sc .sk-row{background:rgba(4,8,20,.4)}
/* ---------- passifs ---------- */
.sk-pas{display:grid;gap:6px}
.sk-pchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
/* ---------- fiche ---------- */
.sk-fiche{--e:var(--k-acc);position:relative;overflow:hidden;border-radius:var(--ds-r-lg,16px);background:linear-gradient(180deg,#0d1530,#080d1d);border:1px solid var(--k-line2);box-shadow:0 12px 28px rgba(0,0,0,.5)}
.sk-fiche--inline{margin:6px 0 4px;animation:skIn .28s var(--ds-ease,ease) both}
.sk-fiche--side{display:none;flex-direction:column;max-height:calc(100vh - 120px);min-height:320px}
.sk-fiche--side .sk-fb{overflow:auto;min-height:0;flex:1}
.sk-fh{display:flex;gap:12px;align-items:center;padding:12px;border-bottom:1px solid var(--k-line);background:linear-gradient(90deg,color-mix(in srgb,var(--e) 20%,transparent),transparent)}
.sk-fn{font:700 17px/1.1 var(--k-fd);letter-spacing:.04em}
.sk-fbd{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.sk-fx{margin-left:auto;align-self:flex-start;flex:none;width:36px;height:36px;display:grid;place-items:center;background:rgba(255,255,255,.04);border:1px solid var(--k-line);border-radius:50%;color:var(--k-tx2);cursor:pointer}
.sk-fb{padding:12px;display:flex;flex-direction:column;gap:12px}
.sk-ftiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:6px}
.sk-tile{padding:6px 8px;border:1px solid var(--k-line);border-radius:var(--ds-r-sm,6px);background:rgba(130,200,255,.04)}
.sk-tile small{display:flex;align-items:center;gap:4px;font:600 9.5px var(--k-fd);letter-spacing:.09em;text-transform:uppercase;color:var(--k-tx3)}.sk-tile small svg{width:11px;height:11px}
.sk-tile b{display:block;margin-top:2px;font:700 15px/1.1 var(--k-fd)}.sk-tile.mp b{color:var(--k-mp)}
.sk-fs{display:flex;flex-direction:column;gap:6px}
.sk-ft{display:flex;align-items:center;gap:7px;font:700 10.5px/1 var(--k-fd);letter-spacing:.13em;text-transform:uppercase;color:var(--k-tx3)}.sk-ft::after{content:'';flex:1;height:1px;background:var(--k-line)}
.sk-txt{font-size:13.5px;line-height:1.55;color:var(--k-tx)}
.sk-lv{font-size:13px;line-height:1.5;color:var(--k-tx);padding:8px 10px;border-radius:var(--ds-r-sm,6px);background:rgba(130,200,255,.05);border-left:3px solid var(--e)}
.sk-lv small{display:flex;align-items:center;gap:5px;font:700 10px var(--k-fd);letter-spacing:.1em;text-transform:uppercase;color:var(--k-tx3);margin-bottom:3px}
.sk-lv.nx{border-left-color:var(--k-ok);background:rgba(57,224,140,.07)}.sk-lv.nx small{color:var(--k-ok)}
.sk-pw{display:flex;align-items:center;gap:6px;margin-top:5px;font:600 12px var(--k-fb);color:var(--k-tx2)}.sk-pw b{font-family:var(--k-fd);color:var(--k-tx)}.sk-pw .up{color:var(--k-ok)}
.sk-num{font-weight:800;color:#fff;white-space:nowrap}.sk-num.sk-up{color:var(--k-ok);text-shadow:0 0 8px rgba(57,224,140,.5)}
.sk-kw{font-weight:800;color:var(--k);white-space:nowrap}
.sk-syn{display:inline;padding:0 3px;margin:0 -1px;border:0;border-bottom:1px dashed var(--k);border-radius:3px;background:color-mix(in srgb,var(--k) 12%,transparent);color:var(--k);font:inherit;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent}
.sk-syn:hover{background:color-mix(in srgb,var(--k) 28%,transparent)}
.sk-ups{display:flex;flex-direction:column;gap:5px}
.sk-up-i{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.4;color:var(--k-tx3)}
.sk-up-i .pl{flex:none;min-width:44px;text-align:center;padding:2px 4px;border-radius:5px;font:700 10px/1.4 var(--k-fd);letter-spacing:.04em;background:rgba(130,180,255,.1);color:var(--k-tx3)}
.sk-up-i.done{color:var(--k-tx)}.sk-up-i.done .pl{background:rgba(57,224,140,.15);color:var(--k-ok)}
.sk-up-i.next{color:var(--k-tx2)}.sk-up-i.next .pl{background:var(--k-gold);color:#241a00}
.sk-vars{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sk-var{display:flex;flex-direction:column;gap:3px;padding:8px;text-align:left;border-radius:var(--ds-r-sm,6px);border:1px solid var(--k-line2);background:rgba(130,200,255,.04);color:var(--k-tx);font:inherit;cursor:pointer}
.sk-var b{font:700 12.5px/1.2 var(--k-fd);display:flex;align-items:center;gap:5px}.sk-var span{font-size:12px;line-height:1.4;color:var(--k-tx2)}
.sk-var.on{border-color:var(--k-gold);background:rgba(255,201,74,.09)}.sk-var.on b{color:var(--k-gold)}
.sk-var[disabled]{cursor:default;opacity:.65}
.sk-vnote{font-size:11.5px;color:var(--k-tx3)}
.sk-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px 4px 6px;border-radius:14px;border:1px solid color-mix(in srgb,var(--e) 55%,transparent);background:color-mix(in srgb,var(--e) 10%,transparent);color:var(--k-tx);font:700 11.5px/1 var(--k-fd);cursor:pointer;-webkit-tap-highlight-color:transparent}
.sk-chip svg{color:var(--e);width:14px;height:14px}.sk-chip small{font:600 10px var(--k-fb);color:var(--k-tx3)}
.sk-kwc{display:inline-flex;align-items:center;padding:3px 8px;border-radius:10px;border:1px solid color-mix(in srgb,var(--k) 55%,transparent);color:var(--k);background:color-mix(in srgb,var(--k) 10%,transparent);font:700 11px/1 var(--k-fd)}
.sk-wrapc{display:flex;flex-wrap:wrap;gap:6px}
.sk-req{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--k-tx2)}
.sk-req div{display:flex;align-items:center;gap:7px}.sk-req .ok{color:var(--k-ok)}.sk-req .ko{color:var(--k-bad)}.sk-req .ko span{color:var(--k-tx)}
.sk-lockban{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--ds-r-md,10px);background:rgba(255,201,74,.09);border:1px solid rgba(255,201,74,.45);color:var(--k-tx);font-size:13px;line-height:1.4}
.sk-lockban svg{color:var(--k-gold);flex:none}.sk-lockban b{color:var(--k-gold);font-family:var(--k-fd)}
.sk-ff{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-bottom:1px solid var(--k-line);background:rgba(4,8,20,.35)}
.sk-ffr{display:flex;flex-wrap:wrap;gap:8px}.sk-ffr .ds-btn{flex:1 1 130px}
.sk-why{font-size:12px;color:var(--k-tx3);text-align:center}
.sk-burst{position:absolute;inset:0;z-index:5;pointer-events:none;display:grid;place-items:center;overflow:hidden}
.sk-b-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,rgba(255,236,170,.85),rgba(255,201,74,.25) 40%,transparent 70%);opacity:0;animation:skFlash .9s ease-out both;animation-delay:var(--el,0s)}
.sk-b-ring{position:absolute;left:50%;top:44px;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:3px solid var(--k-gold);opacity:0;animation:skBurstRing 1s ease-out both;animation-delay:var(--el,0s)}.sk-b-ring.r2{border-color:var(--e);animation-delay:calc(var(--el,0s) + .15s)}
.sk-b-sp{position:absolute;left:50%;top:44px;width:6px;height:6px;margin:-3px;border-radius:50%;background:#ffe9a0;box-shadow:0 0 8px #ffc94a;opacity:0;transform:rotate(var(--a)) translateX(0);animation:skSpark .9s ease-out both;animation-delay:var(--el,0s)}
.sk-b-txt{position:absolute;left:0;right:0;top:92px;text-align:center;font:700 13px/1 var(--k-fd);letter-spacing:.2em;color:#fff4c4;text-shadow:0 0 12px var(--k-gold),0 2px 4px #000;opacity:0;animation:skTxt 1.5s ease-out both;animation-delay:var(--el,0s)}
@keyframes skFlash{0%{opacity:0}18%{opacity:1}100%{opacity:0}}
@keyframes skBurstRing{from{transform:scale(.5);opacity:1}to{transform:scale(4.5);opacity:0}}
@keyframes skSpark{0%{opacity:1;transform:rotate(var(--a)) translateX(10px)}100%{opacity:0;transform:rotate(var(--a)) translateX(90px) scale(.3)}}
@keyframes skTxt{0%{opacity:0;transform:translateY(8px) scale(.8)}20%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}
.sk-confirm{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;margin:0 0 10px;border:1px solid var(--k-bad);border-radius:var(--ds-r-md,10px);background:rgba(255,77,106,.08);font-size:13px}
.sk-confirm span{flex:1 1 180px}.sk-confirm b{color:var(--k-gold)}
.sk-drag{position:fixed;z-index:99999;pointer-events:none;transform:translate(-50%,-50%) scale(1.15);filter:drop-shadow(0 6px 14px rgba(0,0,0,.6))}
.sk-layout{display:block}.sk-side{display:none}
.sk-wrap .ds-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;font-size:12.5px;letter-spacing:.04em;padding-left:10px;padding-right:10px}
.sk-fiche--side .sk-ffr .ds-btn{flex-basis:100%}
.sk-wrap .ds-btn--sm{min-height:36px}
.sk-btn-i{display:inline-flex}
.sk-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:30px 12px;color:var(--k-tx3);text-align:center}
@media(min-width:560px){.sk-cgrid{grid-template-columns:1fr 1fr}.sk-kit{grid-template-columns:repeat(4,1fr)}.sk-specs{grid-template-columns:1fr 1fr}}
@media(min-width:900px){
 .sk-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
 .sk-side{display:block;position:sticky;top:8px}
 .sk-fiche--inline{display:none}.sk-fiche--side{display:flex}
 .sk-kit{grid-template-columns:1fr 1fr}
 .sk-side .sk-empty{border:1px dashed var(--k-line2);border-radius:var(--ds-r-lg,16px);padding:40px 16px}
}
@media(min-width:1180px){.sk-kit{grid-template-columns:repeat(4,1fr)}.sk-ks{flex-direction:column;align-items:flex-start}}
@media(max-width:420px){.sk-cname{font-size:17px}.sk-ks{padding:8px 7px;gap:7px}.sk-ksn{font-size:12.5px}.sk-rn{font-size:13.5px}}
@media(prefers-reduced-motion:reduce){.sk-wrap *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition:none!important}}`;

  const SKUI = { sel: null, src: 'list', pick: null, confirm: null, flash: null, lv: null, seen: null, newIds: new Set() };
  function descOf(d, L) { try { return d.desc(L); } catch (_) { return ''; } }
  function costLine(d, L) {
    const o = {};
    o.mana = num(d.manaCost, 0);
    o.cd = d.kind === 'passive' ? null : (d.combo ? null : (typeof d.cdAt === 'function' ? d.cdAt(Math.max(1, L)) : d.cd));
    return o;
  }

  function injectCss() {
    if (typeof document === 'undefined') return;
    let st = document.getElementById('sk-style');
    if (!st) { st = document.createElement('style'); st.id = 'sk-style'; (document.head || document.documentElement).appendChild(st); }
    if (st.textContent !== CSS) st.textContent = CSS;
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rxEsc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const fmt2 = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  const SLOT_LABEL = { cast1: 'Attaque', cast2: 'Sort 2', cast3: 'Sort 3', super: 'Ultime' };
  const SLOT_KEY = { cast1: '1', cast2: '2', cast3: '3', super: 'X' };
  const KIND_LABEL = { basic: 'Attaque de base', active: 'Active', ultimate: 'Ultime', passive: 'Passif' };
  const ELEM_NAME = { physique: 'Physique', feu: 'Feu', glace: 'Glace', foudre: 'Foudre', ombre: 'Ombre', sacre: 'Sacré', poison: 'Poison' };
  const ELEM_ICON = { physique: 'sword', feu: 'fire', glace: 'ice', foudre: 'lightning', ombre: 'shadow', sacre: 'holy', poison: 'poison' };
  const ELEM_COL = { physique: '#cfd8ea', feu: '#ff7a3d', glace: '#6fdcff', foudre: '#ffe45c', ombre: '#a67bff', sacre: '#ffe9a0', poison: '#7cdc5a' };
  const EMOJI_ICON = { '👻': 'ghost', '🌑': 'shadow', '🕯️': 'flame', '☠️': 'skull', '💥': 'sparkles', '🪦': 'army', '🔗': 'chain', '👑': 'crown', '💀': 'skull' };
  const hasIcon = (n) => { try { return !!(G.Icons && G.Icons.has && G.Icons.has(n) && G.Icons.svg); } catch (_) { return false; } };
  const ic = (n, s, fb) => { if (hasIcon(n)) { try { return G.Icons.svg(n, { size: s }) || ''; } catch (_) {} } return fb ? '<span class="sk-emo">' + esc(fb) + '</span>' : ''; };
  const eCol = (d) => ELEM_COL[d && d.element] || ELEM_COL.physique;
  const snd = (n) => { try { G.sfx && G.sfx.play && G.sfx.play(n); } catch (_) {} };
  function skIcon(d, s) {
    if (!d) return '';
    if (d.icon && hasIcon(d.icon)) return ic(d.icon, s);
    if (d.icon && EMOJI_ICON[d.icon] && hasIcon(EMOJI_ICON[d.icon])) return ic(EMOJI_ICON[d.icon], s);
    const e = d.element, tg = d.tags || [], has = (t) => tg.indexOf(t) >= 0;
    let list;
    if (d.kind === 'passive') list = ['shield', 'heart', 'star-fill'];
    else if (e && e !== 'physique') list = [ELEM_ICON[e], 'rune'];
    else if (d.kind === 'ultimate') list = ['crown', 'tornado'];
    else if (has('dash')) list = ['dash'];
    else if (has('projectile')) list = ['bow', 'target'];
    else list = ['sword'];
    for (const n of list.concat(['rune'])) if (hasIcon(n)) return ic(n, s);
    return '<span class="sk-emo">' + esc(d.icon || '✨') + '</span>';
  }
  function hexIcon(d, size, o) {
    o = o || {};
    const round = d && d.kind === 'passive';
    return '<span class="sk-hexw" style="--hs:' + size + 'px;--e:' + eCol(d) + '"><span class="sk-hex' + (round ? ' is-round' : '') + '"></span><span class="sk-hex-i">' + (d ? skIcon(d, Math.round(size * .46)) : ic('plus', Math.round(size * .4), '+')) + '</span>' +
      (o.lock ? '<span class="sk-hlock">' + ic('lock', 11) + '</span>' : o.badge ? '<span class="sk-lvb">' + o.badge + '</span>' : '') + '</span>';
  }
  const btn = (cls, label, attrs, icon) => '<button type="button" class="ds-btn ' + cls + '" ' + (attrs || '') + '>' + (icon ? '<span class="ds-btn__icon sk-btn-i">' + icon + '</span>' : '') + label + '</button>';

  // ---------- mots-clés colorés (effets, ressources) et liens de synergie ----------
  const STATUS_KW = [
    ['(?:étourdi\\p{L}*|étourdissement\\p{L}*)', '#ffd23f'], ['(?:ralenti\\p{L}*|ralentit|ralentissement\\p{L}*)', '#5ac8ff'],
    ['(?:brûl\\p{L}+|brûlure\\p{L}*)', '#ff8a3d'], ['(?:gel|gelés?|gelée?s?|geler|gèle|gèlent)', '#8fdcff'], ['marqu\\p{L}*', '#c77dff'],
    ['(?:empoisonn\\p{L}+|poison\\p{L}*)', '#7cdc5a'], ['saign\\p{L}+', '#ff5a6e'], ['(?:peur|fuir|fuite)', '#d9a3ff'],
    ['(?:bouclier\\p{L}*|invulnérab\\p{L}+|insensible)', '#6fb6ff'], ['(?:soigne\\p{L}*|soin\\p{L}*|vol de vie)', '#5fe39a'],
    ['(?:Brèche|Fusion|Éclatement|Sursaut|Écho)', '#ffb347'],
  ];
  const STATUS_NAMES = ['Étourdissement', 'Ralentissement', 'Brûlure', 'Gel', 'Marque', 'Poison', 'Saignement', 'Peur', 'Bouclier', 'Soin'];
  const RES_KW = '(?:Rage|Lames?|Combo|Concentration|Foi|Givre|Orage|Âmes?|Écho)';
  const RES_COL = { rage: '#e0402c', lame: '#2a9d8f', lames: '#2a9d8f', combo: '#e63946', concentration: '#5fc46f', foi: '#ffc933', givre: '#8fdcff', orage: '#fff04a', âme: '#a874ff', âmes: '#a874ff', écho: '#c77dff' };
  const NUM_RX = '\\d+(?:[.,]\\d+)?(?:\\s?(?:%|s|m|mana|PV|x|fois))?(?![\\p{L}\\d])';
  const LB = '(?<![\\p{L}\\d])';

  function render(container, profile) {
    injectCss();
    const p = profile || prof();
    if (!container) return;
    if (!p || !p.classe) { container.innerHTML = '<div class="sk-wrap"><div class="sk-empty">' + ic('book', 32) + '<p>Crée un héros pour débloquer ses compétences.</p></div></div>'; return; }
    ensureProfile(p);
    const ui = SKUI; container.__sk = ui;
    const C = (G.CLASSES && G.CLASSES[p.classe]) || {};
    const ccol = C.colorCss || '#46d4ff';
    const heroLv = () => heroLevel(p);
    const commit = () => { saveProfile(); try { G.bus && G.bus.emit('profileChanged', { profile: p }); } catch (_) {} draw(); };

    // ----- niveau du héros : détection d'une montée de niveau (animation + « NOUVEAU ») -----
    const seenKey = (p.nom || '') + '|' + p.classe;
    if (!ui.seen || ui.seen.key !== seenKey) { ui.seen = { key: seenKey, level: heroLv() }; ui.lv = null; ui.newIds = new Set(); ui.sel = null; ui.pick = null; }
    else if (heroLv() > ui.seen.level) {
      const from = ui.seen.level, to = heroLv();
      const ids = Object.keys(SK()).map(def).filter((d) => d && classOk(p, d) && !d.v2 && !d.spec && d.unlockLevel > from && d.unlockLevel <= to).map((d) => d.id);
      ids.forEach((id) => ui.newIds.add(id));
      ui.lv = { from, to, ids, t: Date.now(), snd: false };
      ui.seen.level = to;
    }

    // ----- données de classe -----
    const kit = kitOf(p.classe);
    const kitSet = new Set(kitIds(p.classe));
    const allDefs = Object.keys(SK()).map(def).filter((d) => d && classOk(p, d) && !d.v2);
    const byId = {}; allDefs.forEach((d) => { byId[d.id] = d; });
    let unlocks = (C.unlocks || []).map((u) => ({ level: u.level, d: byId[u.skillId] })).filter((u) => u.d);
    if (!unlocks.length) unlocks = allDefs.filter((d) => !kitSet.has(d.id) && !d.spec && d.unlockLevel > 1).sort((a, b) => a.unlockLevel - b.unlockLevel).map((d) => ({ level: d.unlockLevel, d }));
    const unlockSet = new Set(unlocks.map((u) => u.d.id));
    const specs = specList(p.classe);
    const specSkills = {}; allDefs.filter((d) => d.spec).forEach((d) => { specSkills[d.spec] = d; });
    const classPassive = (G.CLASS_PASSIVES && G.CLASS_PASSIVES[p.classe]) || C.passive || null;

    // ----- outils de texte enrichi -----
    const others = allDefs.filter((d) => !kitSet.has(d.id) || true);
    const nameCount = {};
    others.forEach((d) => { const w = String(d.name).split(/[\s'’-]+/)[0]; nameCount[w] = (nameCount[w] || 0) + 1; });
    const aliasOf = {};
    others.forEach((d) => { const w = String(d.name).split(/[\s'’-]+/)[0]; if (w.length >= 5 && nameCount[w] === 1 && w !== d.name) aliasOf[w] = d; });
    const nameMap = {}; others.forEach((d) => { nameMap[d.name] = d; }); Object.keys(aliasOf).forEach((w) => { if (!nameMap[w]) nameMap[w] = aliasOf[w]; });
    const nameKeys = Object.keys(nameMap).sort((a, b) => b.length - a.length);
    const statusAlt = STATUS_KW.map((s) => s[0]).join('|');
    const RX = new RegExp((nameKeys.length ? '(' + LB + '(?:' + nameKeys.map(rxEsc).join('|') + ')(?![\\p{L}\\d]))' : '(?!x)x') + '|(' + LB + '(?:' + statusAlt + ')(?![\\p{L}]))|(' + LB + RES_KW + '(?![\\p{L}]))|(' + LB + 'mana(?![\\p{L}]))|(' + NUM_RX + ')', 'gu');
    const STATUS_RX = STATUS_KW.map((s) => [new RegExp(LB + s[0] + '(?![\\p{L}])', 'iu'), s[1]]);
    function numsOf(t) { const m = String(t).match(new RegExp(NUM_RX, 'gu')); return m || []; }
    /** texte → HTML : nombres en gras, effets/ressources colorés, compétences de la classe cliquables ; cmp = nombres du niveau précédent (les valeurs qui changent passent au vert) */
    function rich(text, self, cmp) {
      const src = String(text == null ? '' : text); let out = '', last = 0, m, ni = 0;
      RX.lastIndex = 0;
      while ((m = RX.exec(src))) {
        out += esc(src.slice(last, m.index)); last = m.index + m[0].length;
        const w = m[0];
        if (m[1]) { const t = nameMap[w]; out += t && (!self || t.id !== self.id) ? '<button type="button" class="sk-syn" data-goto="' + t.id + '" style="--k:' + eCol(t) + '">' + esc(w) + '</button>' : esc(w); }
        else if (m[2]) { const s = STATUS_RX.find((x) => x[0].test(w)); out += '<span class="sk-kw" style="--k:' + (s ? s[1] : '#ffb347') + '">' + esc(w) + '</span>'; }
        else if (m[3]) { out += '<span class="sk-kw" style="--k:' + (RES_COL[w.toLowerCase()] || '#c77dff') + '">' + esc(w) + '</span>'; }
        else if (m[4]) out += '<span class="sk-kw" style="--k:var(--k-mp)">' + esc(w) + '</span>';
        else { const up = !!cmp && cmp.indexOf(w) < 0; out += '<span class="sk-num' + (up ? ' sk-up' : '') + '">' + esc(w) + '</span>'; ni++; }
      }
      return out + esc(src.slice(last));
    }
    const baseOf = (d, L) => { try { return d.baseDesc ? d.baseDesc(L) : d.desc(L); } catch (_) { return ''; } };
    const fullText = (d) => { let t = baseOf(d, 1) + ' ' + baseOf(d, 5); (d.upgrades || []).forEach((u) => { t += ' ' + u.text; }); if (d.variants) ['A', 'B'].forEach((v) => { if (d.variants[v]) t += ' ' + d.variants[v].name + ' ' + d.variants[v].text; }); return t; };
    const mentionRx = (d) => { const ks = [d.name]; const w = String(d.name).split(/[\s'’-]+/)[0]; if (aliasOf[w] === d) ks.push(w); return new RegExp(LB + '(?:' + ks.map(rxEsc).join('|') + ')(?![\\p{L}\\d])', 'u'); };
    const texts = {}; allDefs.forEach((d) => { texts[d.id] = fullText(d); });
    const mrx = {}; allDefs.forEach((d) => { mrx[d.id] = mentionRx(d); });
    function synergies(d) {
      const uses = [], usedBy = [];
      allDefs.forEach((s) => {
        if (s.id === d.id || (s.spec && !specOk(p, s) && !(d.spec === s.spec))) return;
        if (mrx[s.id].test(texts[d.id])) uses.push(s); else if (mrx[d.id].test(texts[s.id])) usedBy.push(s);
      });
      return { uses, usedBy };
    }
    function keywordsOf(d) {
      const t = texts[d.id], out = [];
      [['Étourdissement', '#ffd23f', /étourdi|étourdissement/i], ['Ralentissement', '#5ac8ff', /ralenti|ralentit|ralentissement/i], ['Brûlure', '#ff8a3d', /brûl/i], ['Gel', '#8fdcff', /(?<![\p{L}])gel|gelé|gèle/iu], ['Marque', '#c77dff', /marqu/i],
        ['Poison', '#7cdc5a', /poison/i], ['Saignement', '#ff5a6e', /saign/i], ['Peur', '#d9a3ff', /(?<![\p{L}])peur|fuir/iu], ['Bouclier', '#6fb6ff', /bouclier|invulnérab/i], ['Soin', '#5fe39a', /soigne|soin|vol de vie/i], ['Brèche', '#ffb347', /Brèche/]].forEach((k) => { if (k[2].test(t)) out.push(k); });
      const res = (G.Skills && G.Skills.resource && G.Skills.resource(p.classe)) || null;
      const rn = res && res.parts ? res.parts.map((x) => x.name) : res ? [res.name] : [];
      rn.forEach((n) => { const rx = new RegExp(LB + rxEsc(String(n).split(' ')[0].replace(/s$/, '')) + '(?![\\p{L}])', 'u'); if (rx.test(t)) out.unshift([n, (res.parts && res.parts.find((x) => x.name === n) || res).color, null]); });
      return out;
    }

    // ----- état d'une compétence -----
    function stateOf(d) {
      const L = levelOf(p, d.id), why = whyNot(p, d.id);
      const heroLock = heroLv() < num(d.unlockLevel, 1), specLock = !!(d.spec && p.skills.spec !== d.spec);
      const st = L >= d.maxLevel ? 'max' : L > 0 ? 'learned' : (heroLock || specLock) ? 'lock' : 'avail';
      return { L, why, heroLock, specLock, st };
    }
    const powerOf = (d, L) => 1 + num(d.lvlK, 0.22) * (Math.max(1, L) - 1);
    function chipsOf(d, L) {
      const c = costLine(d, Math.max(1, L)), o = [];
      if (d.kind === 'passive') return '';
      o.push(d.manaCost ? '<span class="mp">' + ic('mana', 11) + d.manaCost + ' mana</span>' : '<span class="mp">' + ic('mana', 11) + '0</span>');
      if (c.cd != null && c.cd > 0) o.push('<span class="cd">' + ic('timer', 11) + fmt(c.cd) + ' s</span>');
      else if (d.combo) o.push('<span class="cd">' + ic('swords', 11) + d.combo.steps + ' coups</span>');
      if (d.range > 0) o.push('<span>' + ic('target', 11) + fmt(d.range) + ' m</span>');
      else if (d.radius > 0) o.push('<span>' + ic('target', 11) + 'r ' + fmt(d.radius) + ' m</span>');
      return '<div class="sk-chips">' + o.join('') + '</div>';
    }
    const eqSlotOf = (id) => SLOTS.find((s) => p.skills.equipped[s] === id) || null;
    const flashOf = (id) => (ui.flash && ui.flash.id === id && Date.now() - ui.flash.t < 1400) ? ui.flash : null;

    // ----- ligne de compétence -----
    function rowHtml(d, o) {
      o = o || {};
      const s = stateOf(d), fl = flashOf(d.id), eq = eqSlotOf(d.id);
      const pips = Array.from({ length: d.maxLevel }, (_, i) => '<span class="sk-pip' + (i < s.L ? ' on' : '') + '"></span>').join('');
      let status;
      if (s.st === 'lock') status = '<span class="sk-lk">' + ic('lock', 12) + (s.heroLock ? 'Niv. ' + d.unlockLevel : 'Spécialisation') + '</span>';
      else if (s.st === 'avail') status = '<span class="sk-av">À apprendre</span>';
      else status = '<span class="sk-pips">' + pips + '</span><span class="sk-lvt">Niv. ' + s.L + '/' + d.maxLevel + '</span>';
      if (eq && eq !== 'cast1') status += '<span class="sk-tag ok">' + SLOT_LABEL[eq] + '</span>';
      const desc = baseOf(d, Math.max(1, s.L));
      return '<div class="sk-row st-' + s.st + (d.kind === 'ultimate' ? ' is-ult' : '') + (ui.sel === d.id ? ' is-sel' : '') + (ui.newIds.has(d.id) ? ' is-new' : '') + (fl ? ' is-pop' : '') + '" data-id="' + d.id + '" style="--e:' + eCol(d) + (fl ? ';--el:-' + ((Date.now() - fl.t) / 1000).toFixed(2) + 's' : '') + '" role="button" tabindex="0" aria-label="' + esc(d.name) + '">' +
        hexIcon(d, 48, s.st === 'lock' ? { lock: true } : { badge: s.L || '' }) +
        '<div class="sk-rt"><div class="sk-rn">' + esc(d.name) + '<span class="sk-tag">' + KIND_LABEL[d.kind] + '</span></div>' + (d.kind !== 'passive' && s.st !== 'lock' ? chipsOf(d, s.L) : '') +
        '<div class="sk-rd">' + esc(desc) + '</div></div><div class="sk-rs">' + status + '</div></div>' +
        (o.noFiche ? '' : ui.sel === d.id && ui.src === 'list' ? ficheHtml(d, 'inline') : '');
    }

    // ----- fiche détaillée -----
    function ficheHtml(d, mode) {
      const s = stateOf(d), L = s.L, shown = Math.max(1, L), c = costLine(d, shown), max = L >= d.maxLevel, fl = flashOf(d.id), eq = eqSlotOf(d.id);
      const e = eCol(d);
      let h = '<aside class="sk-fiche sk-fiche--' + mode + '" style="--e:' + e + '">';
      if (fl) {
        h += '<div class="sk-burst" style="--el:-' + ((Date.now() - fl.t) / 1000).toFixed(2) + 's"><span class="sk-b-flash"></span><i class="sk-b-ring"></i><i class="sk-b-ring r2"></i>' +
          [0, 45, 90, 135, 180, 225, 270, 315].map((a) => '<i class="sk-b-sp" style="--a:' + a + 'deg"></i>').join('') +
          '<b class="sk-b-txt">' + (fl.first ? 'COMPÉTENCE DÉBLOQUÉE' : fl.max ? 'NIVEAU MAX !' : 'NIVEAU ' + fl.lv) + '</b></div>';
      }
      h += '<div class="sk-fh">' + hexIcon(d, 60, s.st === 'lock' ? { lock: true } : { badge: L ? L + '/' + d.maxLevel : '' }) +
        '<div style="min-width:0"><div class="sk-fn">' + esc(d.name) + '</div><div class="sk-fbd"><span class="sk-tag' + (d.kind === 'ultimate' ? ' g' : '') + '">' + KIND_LABEL[d.kind] + '</span>' +
        (d.element ? '<span class="sk-tag e">' + esc(ELEM_NAME[d.element] || d.element) + '</span>' : '') + (d.spec ? '<span class="sk-tag v">Spécialisation</span>' : '') + (max ? '<span class="sk-tag g">Max</span>' : '') + (eq && eq !== 'cast1' ? '<span class="sk-tag ok">' + SLOT_LABEL[eq] + '</span>' : '') + '</div></div>' +
        '<button type="button" class="sk-fx" data-act="close" aria-label="Fermer">' + ic('close', 16, '×') + '</button></div>@@ACT@@<div class="sk-fb">';
      // condition de déblocage lisible
      if (s.st === 'lock') {
        h += '<div class="sk-lockban">' + ic('lock', 22) + '<div>' + (s.specLock && !s.heroLock ? 'Réservée à la spécialisation <b>' + esc(((specList(p.classe).find((x) => x.id === d.spec)) || {}).name || d.spec) + '</b>.' : 'Se débloque au <b>niveau ' + d.unlockLevel + '</b>' + (heroLv() < d.unlockLevel ? ' — il te manque <b>' + (d.unlockLevel - heroLv()) + ' niveau' + (d.unlockLevel - heroLv() > 1 ? 'x' : '') + '</b>.' : '.') + (s.specLock ? ' Spécialisation requise.' : '')) + '</div></div>';
      }
      // chiffres clés
      if (d.kind !== 'passive') {
        const tiles = [];
        tiles.push('<div class="sk-tile mp"><small>' + ic('mana', 11) + 'Coût</small><b>' + (d.manaCost ? d.manaCost + ' mana' : 'Gratuit') + '</b></div>');
        if (c.cd != null && c.cd > 0) tiles.push('<div class="sk-tile"><small>' + ic('timer', 11) + (d.kind === 'basic' ? 'Cadence' : 'Recharge') + '</small><b>' + fmt(c.cd) + ' s</b></div>');
        else if (d.combo) tiles.push('<div class="sk-tile"><small>' + ic('swords', 11) + 'Combo</small><b>' + d.combo.steps + ' coups</b></div>');
        if (d.range > 0) tiles.push('<div class="sk-tile"><small>' + ic('target', 11) + 'Portée</small><b>' + fmt(d.range) + ' m</b></div>');
        if (d.radius > 0) tiles.push('<div class="sk-tile"><small>' + ic('target2', 11) + 'Zone</small><b>r ' + fmt(d.radius) + ' m</b></div>');
        if (d.charge) tiles.push('<div class="sk-tile"><small>' + ic('hand', 11) + 'Charge</small><b>Maintenir</b></div>');
        h += '<div class="sk-ftiles">' + tiles.join('') + '</div>';
      } else h += '<div class="sk-ftiles"><div class="sk-tile"><small>' + ic('shield', 11) + 'Type</small><b>Toujours actif</b></div></div>';
      // effet : niveau actuel → suivant
      const cur = baseOf(d, shown), curNums = numsOf(cur);
      if (!max && L > 0) {
        const nx = baseOf(d, L + 1), up = (d.upgrades || []).find((u) => u.level === L + 1);
        h += '<div class="sk-fs"><div class="sk-ft">Niveau actuel → suivant</div><div class="sk-lv"><small>Niveau ' + L + '</small>' + rich(cur, d) + '</div>' +
          '<div class="sk-lv nx"><small>' + ic('arrow-up', 11) + 'Niveau ' + (L + 1) + '</small>' + (nx === cur ? 'Mêmes effets, ' + (d.kind === 'passive' ? 'valeurs inchangées.' : 'dégâts et soins <span class="sk-num sk-up">+' + Math.round(num(d.lvlK, 0.22) * 100) + ' %</span>.') : rich(nx, d, curNums)) + (up ? '<div style="margin-top:4px;color:var(--k-gold)">' + ic('star-fill', 11) + ' Palier : ' + rich(up.text, d) + '</div>' : '') + '</div>' +
          (d.kind !== 'passive' ? '<div class="sk-pw">Puissance <b>×' + fmt2(powerOf(d, L)) + '</b> ' + ic('arrow-right', 12) + ' <b class="up">×' + fmt2(powerOf(d, L + 1)) + '</b> <span>(dégâts +' + Math.round(num(d.lvlK, 0.22) * 100) + ' % par niveau)</span></div>' : '') + '</div>';
      } else {
        h += '<div class="sk-fs"><div class="sk-ft">' + (L ? 'Effet · niveau ' + L : 'Effet · niveau 1') + '</div><div class="sk-txt">' + rich(cur, d) + '</div>' +
          (d.kind !== 'passive' ? '<div class="sk-pw">Puissance <b>×' + fmt2(powerOf(d, shown)) + '</b> <span>' + (max ? '(maximum)' : '(dégâts +' + Math.round(num(d.lvlK, 0.22) * 100) + ' % par niveau)') + '</span></div>' : '') + '</div>';
      }
      // améliorations (niveaux 3 et 5)
      if ((d.upgrades || []).length) {
        const nextUp = d.upgrades.find((u) => u.level > L);
        h += '<div class="sk-fs"><div class="sk-ft">Améliorations</div><div class="sk-ups">' + d.upgrades.map((u) => '<div class="sk-up-i ' + (L >= u.level ? 'done' : nextUp === u ? 'next' : '') + '"><span class="pl">' + (L >= u.level ? ic('check', 12) : 'Niv. ' + u.level) + '</span><span>' + rich(u.text, d) + '</span></div>').join('') + '</div></div>';
      }
      // variantes (choix exclusif au niveau max)
      if (d.variants && (d.variants.A || d.variants.B)) {
        const cv = variantOf(p, d.id), can = L >= d.maxLevel;
        h += '<div class="sk-fs"><div class="sk-ft">Variante · niveau ' + d.maxLevel + '</div><div class="sk-vars">' + ['A', 'B'].filter((v) => d.variants[v]).map((v) => '<button type="button" class="sk-var' + (cv === v ? ' on' : '') + '" data-var="' + v + '"' + (can ? '' : ' disabled') + '><b>' + (cv === v ? ic('check', 13) : '') + esc(d.variants[v].name) + '</b><span>' + rich(d.variants[v].text, d) + '</span></button>').join('') + '</div>' +
          '<div class="sk-vnote">' + (can ? (cv ? 'Touche la variante choisie pour la retirer.' : 'Choisis une variante : le choix est libre et modifiable.') : 'Se choisit une fois la compétence au niveau ' + d.maxLevel + '.') + '</div></div>';
      }
      // synergies
      const sy = synergies(d), kws = keywordsOf(d);
      if (sy.uses.length || sy.usedBy.length || kws.length) {
        const chip = (t, rel) => '<button type="button" class="sk-chip" data-goto="' + t.id + '" style="--e:' + eCol(t) + '">' + skIcon(t, 14) + esc(t.name) + (rel ? '<small>' + rel + '</small>' : '') + '</button>';
        h += '<div class="sk-fs"><div class="sk-ft">Synergies</div>' +
          (sy.uses.length ? '<div class="sk-wrapc">' + sy.uses.slice(0, 6).map((t) => chip(t, 'combine')).join('') + '</div>' : '') +
          (sy.usedBy.length ? '<div class="sk-wrapc">' + sy.usedBy.slice(0, 6).map((t) => chip(t, 'renforcée par')).join('') + '</div>' : '') +
          (kws.length ? '<div class="sk-wrapc">' + kws.slice(0, 8).map((k) => '<span class="sk-kwc" style="--k:' + k[1] + '">' + esc(k[0]) + '</span>').join('') + '</div>' : '') + '</div>';
      }
      // conditions
      if (!max) {
        const n = L + 1, rows = [], req = (d.tree && d.tree.requires) || [];
        rows.push([heroLv() >= num(d.unlockLevel, 1), 'Débloquée au niveau ' + num(d.unlockLevel, 1)]);
        if (n > 1) rows.push([num(p.niveau, 1) >= reqLevel(d, n), 'Niveau ' + n + ' de la compétence : héros niveau ' + reqLevel(d, n)]);
        if (d.spec) rows.push([!s.specLock, 'Spécialisation ' + (((specList(p.classe).find((x) => x.id === d.spec)) || {}).name || d.spec)]);
        if (d.rankReq && d.rankReq !== 'E') rows.push([rankIdx(p.rank) >= RANK_ORDER.indexOf(d.rankReq), 'Rang ' + d.rankReq]);
        req.forEach((r) => rows.push([known(p, r), 'Nécessite ' + ((def(r) && def(r).name) || r)]));
        rows.push([p.skills.points >= pointCost(d), pointCost(d) + ' point de compétence']);
        h += '<div class="sk-fs"><div class="sk-ft">Conditions</div><div class="sk-req">' + rows.map((r) => '<div class="' + (r[0] ? 'ok' : 'ko') + '">' + ic(r[0] ? 'check' : 'lock', 14, r[0] ? '✓' : '✕') + '<span>' + esc(r[1]) + '</span></div>').join('') + '</div></div>';
      }
      h += '</div>';
      let ff = '';
      const ro = [];
      if (!max) ro.push(s.heroLock && !L ? btn('ds-btn--secondary', 'Niveau ' + d.unlockLevel + ' requis', 'disabled', ic('lock', 16)) : btn('ds-btn--primary', (L ? 'Améliorer' : 'Apprendre') + ' · ' + pointCost(d) + ' pt', 'data-act="learn"' + (s.why ? ' disabled' : ''), ic('arrow-up', 16)));
      if (L > 0 && (d.kind === 'active' || d.kind === 'ultimate')) {
        (d.kind === 'ultimate' ? ['super'] : ['cast2', 'cast3']).forEach((sl) => {
          const on = p.skills.equipped[sl] === d.id;
          ro.push(btn('ds-btn--secondary', (on ? 'Équipée · ' : 'Équiper · ') + SLOT_LABEL[sl], 'data-act="equip" data-slot="' + sl + '"' + (on ? ' disabled' : ''), ic(on ? 'check' : 'plus', 16)));
        });
      }
      if (ro.length) ff += '<div class="sk-ffr">' + ro.join('') + '</div>';
      if (s.why && !max && s.st !== 'lock') ff += '<div class="sk-why">' + esc(s.why) + '</div>';
      if (d.kind === 'passive' && L > 0) ff += '<div class="sk-why">Passif : actif en permanence, aucun emplacement à équiper.</div>';
      return h.replace('@@ACT@@', ff ? '<div class="sk-ff">' + ff + '</div>' : '') + '</aside>';
    }

    // ----- blocs -----
    function sampleRes() {
      const r = G.Skills && G.Skills.resource ? G.Skills.resource(p.classe) : null;
      if (!r || !(r.max > 0)) return null;
      const o = Object.assign({}, r);
      if (r.parts) o.parts = r.parts.map((x) => Object.assign({}, x, { value: Math.ceil(x.max * 0.67) }));
      else o.value = r.id === 'rage' || r.id === 'conc' || r.id === 'foi' ? Math.round(r.max * 0.6) : Math.ceil(r.max * 0.6);
      return o;
    }
    function classHead() {
      const pts = p.skills.points, res = sampleRes(), rc = C.resource || {};
      const role = String(C.role || '').split(/\s[—–-]\s/);
      let h = '<section class="sk-class" style="--cc:' + ccol + '"><div class="sk-ctop"><span class="sk-cico"><span>' + esc(C.icon || '✨') + '</span></span><div class="sk-ct"><div class="sk-cname">' + esc(C.name || p.classe) + '</div><div class="sk-crole">' + esc(C.role || '') + '</div></div>' +
        '<div class="sk-points' + (pts > 0 ? ' has' : '') + '"><b>' + pts + '</b><small>point' + (pts > 1 ? 's' : '') + '<br>de compétence</small></div></div>';
      if (C.desc) h += '<p class="sk-cdesc">' + esc(C.desc) + '</p>';
      h += '<div class="sk-cgrid"><div class="sk-cbox sk-cres"><div class="sk-cbt">Ressource <b>' + esc((res && res.name) || (rc.name || 'Mana').replace(/\s*\(.*\)/, '')) + '</b></div>';
      if (res && G.UI && G.UI.resGauge) h += '<div class="rg-wrap">' + G.UI.resGauge(res) + '</div>';
      h += '<div class="sk-ctxt">' + (rc.gain ? esc(rc.gain) : 'Aucune ressource secondaire : le mana suffit.') + '</div></div>';
      if (classPassive) h += '<div class="sk-cbox"><div class="sk-cbt">Passif de classe <span class="sk-tag ok" style="margin-left:auto">Toujours actif</span></div><div class="sk-cpas-n">' + ic('star-fill', 14) + esc(classPassive.name) + '</div><div class="sk-ctxt">' + rich(classPassive.desc, null) + '</div></div>';
      return h + '</div></section>';
    }
    function lvlBanner() {
      const lv = ui.lv; if (!lv || Date.now() - lv.t > 9000) return '';
      if (!lv.snd) { lv.snd = true; snd('levelup'); }
      const news = lv.ids.map((id) => byId[id]).filter(Boolean);
      return '<div class="sk-lvlup"><span class="sk-lvlup-ic">' + ic('level-up', 24) + '</span><div><b>Niveau ' + lv.to + ' atteint !</b><span class="t">' + (news.length ? 'Nouveau pouvoir débloqué :' : '+1 point de compétence à dépenser.') + '</span>' +
        (news.length ? '<div class="sk-lvlup-new">' + news.map((d) => '<button type="button" class="sk-chip" data-goto="' + d.id + '" style="--e:' + eCol(d) + '">' + skIcon(d, 14) + esc(d.name) + '</button>').join('') + '</div>' : '') + '</div></div>';
    }
    function slotHtml(sl) {
      const id = p.skills.equipped[sl], d = def(id), s = d ? stateOf(d) : null, fl = d ? flashOf(d.id) : null;
      const sel = ui.sel && def(ui.sel), drop = !!(sel && sl !== 'cast1' && classOk(p, sel) && slotOk(sl, sel) && known(p, sel.id) && p.skills.equipped[sl] !== sel.id);
      const locked = sl === 'super' && heroLv() < num(d && d.unlockLevel, 5);
      return '<button type="button" class="sk-ks' + (sl === 'super' ? ' is-ult' : '') + (ui.sel === id && ui.src === 'kit' ? ' is-sel' : '') + (ui.pick === sl ? ' is-pick' : '') + (drop ? ' is-drop' : '') + (locked ? ' is-locked' : '') + (fl ? ' is-pop' : '') + '" data-slot="' + sl + '" style="--e:' + eCol(d) + '">' +
        '<span class="sk-kh ' + (s ? 'st-' + s.st : '') + '">' + hexIcon(d, 46, locked ? { lock: true } : { badge: d ? Math.max(1, s.L) : '' }) + '</span><span class="sk-kst"><span class="sk-ksl">' + SLOT_LABEL[sl] + '<kbd>' + SLOT_KEY[sl] + '</kbd></span><span class="sk-ksn">' + esc(d ? d.name : 'Vide') + '</span>' +
        (locked ? '<span class="sk-chips"><span style="color:var(--k-gold)">' + ic('lock', 11) + 'Niveau ' + d.unlockLevel + '</span></span>' : d ? chipsOf(d, s.L) : '') + '</span></button>';
    }
    function kitBlock() {
      let h = '<div class="sk-sect first">Kit actuel<small>touche un emplacement</small>' + btn('ds-btn--ghost ds-btn--sm', 'Réinitialiser', 'data-act="respec"' + (spentPoints(p) === 0 ? ' disabled' : ''), ic('refresh', 15)) + '</div>';
      if (ui.confirm === 'respec') h += '<div class="sk-confirm"><span>Rendre <b>' + spentPoints(p) + ' point(s)</b> pour <b>' + respecCost(p) + ' or</b> ? Tes sorts équipés reviennent au kit de départ.</span>' + btn('ds-btn--danger ds-btn--sm', 'Confirmer', 'data-act="respec-ok"' + (num(p.gold, 0) < respecCost(p) ? ' disabled' : '')) + btn('ds-btn--ghost ds-btn--sm', 'Annuler', 'data-act="cancel"') + '</div>';
      h += '<div class="sk-kit">' + SLOTS.map(slotHtml).join('') + '</div>';
      if (ui.pick) {
        const sl = ui.pick, opts = allDefs.filter((d) => slotOk(sl, d) && known(p, d.id));
        if (opts.length > 1) h += '<div class="sk-tray"><div class="sk-tray-t">Remplacer · ' + SLOT_LABEL[sl] + '</div><div class="sk-tray-row">' + opts.map((d) => '<button type="button" class="sk-tray-i' + (p.skills.equipped[sl] === d.id ? ' is-on' : '') + '" data-pickid="' + d.id + '">' + hexIcon(d, 48) + '<span>' + esc(d.name) + '</span></button>').join('') + '</div></div>';
      }
      if (ui.sel && ui.src === 'kit' && byId[ui.sel]) h += ficheHtml(byId[ui.sel], 'inline');
      return h;
    }
    function startBlock() {
      const ids = [kit.cast1, kit.cast2, kit.cast3, kit.super].filter((x) => byId[x]);
      return '<div class="sk-sect">Départ<small>le kit de base de ta classe</small></div><div class="sk-list">' + ids.map((id) => rowHtml(byId[id])).join('') + '</div>';
    }
    function levelBlock() {
      if (!unlocks.length) return '';
      return '<div class="sk-sect">Débloquées par niveau<small>niveaux 5, 10, 15, 20, 25</small></div><div class="sk-tl">' + unlocks.map((u) => {
        const ok = heroLv() >= u.level;
        return '<div class="sk-tli' + (ok ? ' ok' : '') + '"><div class="sk-tlr"><span class="sk-tlb ' + (ok ? 'ok' : 'lock') + '">' + (ok ? ic('check', 16) : u.level) + (ok ? '' : '') + '</span><span class="sk-tll"></span></div><div class="sk-tlc">' + rowHtml(u.d) + '</div></div>';
      }).join('') + '</div>';
    }
    function specBlock() {
      if (!specs.length) return '';
      const sp = specOf(p), lvl = num(p.niveau, 1), rc = respecCost(p);
      let h = '<div class="sk-sect">Spécialisation<small>niveau 15 · un choix entre deux voies</small></div>';
      if (ui.confirm === 'resetspec') h += '<div class="sk-confirm"><span>Abandonner <b>' + esc(sp && sp.name) + '</b> pour <b>' + rc + ' or</b> ?</span>' + btn('ds-btn--danger ds-btn--sm', 'Confirmer', 'data-act="resetspec-ok"' + (num(p.gold, 0) < rc ? ' disabled' : '')) + btn('ds-btn--ghost ds-btn--sm', 'Annuler', 'data-act="cancel"') + '</div>';
      h += '<div class="sk-specs">';
      specs.forEach((s) => {
        const act = sp && sp.id === s.id, locked = lvl < s.unlockLevel, off = sp && !act, d = specSkills[s.id] || (s.skillId && byId[s.skillId]);
        h += '<div class="sk-sc' + (act ? ' is-active' : '') + (off ? ' is-off' : '') + '"><div class="sk-sch">' + ic(act ? 'crown' : 'star', 20) + '<div class="sk-scn">' + esc(s.name) + '</div>' + (act ? '<span class="sk-tag g">Choisie</span>' : '') + '</div><div class="sk-scd">' + rich(s.desc, null) + '</div>';
        if (d) h += rowHtml(d);
        h += '<div class="sk-sca">';
        if (act) h += btn('ds-btn--secondary ds-btn--sm', 'Changer · ' + rc + ' or', 'data-act="resetspec"' + (num(p.gold, 0) < rc ? ' disabled' : ''));
        else if (sp) h += '<span class="sk-lk" style="border-color:var(--k-line2);color:var(--k-tx3)">' + ic('lock', 12) + 'Non choisie</span>';
        else if (locked) h += '<span class="sk-lk">' + ic('lock', 12) + 'Niveau ' + s.unlockLevel + ' requis</span>';
        else h += btn('ds-btn--violet', 'Choisir cette voie', 'data-spec="' + s.id + '"', ic('check', 16));
        h += '</div></div>';
      });
      return h + '</div>' + (!sp ? '<div class="sk-note">Choix définitif, modifiable plus tard contre de l\'or.</div>' : '');
    }
    function passiveBlock() {
      const pas = unlocks.map((u) => u.d).filter((d) => d.kind === 'passive');
      if (!classPassive && !pas.length) return '';
      let h = '<div class="sk-sect">Passifs<small>toujours actifs, sans emplacement</small></div><div class="sk-pas">';
      if (classPassive) h += '<div class="sk-cbox"><div class="sk-cpas-n">' + ic('star-fill', 14) + esc(classPassive.name) + '<span class="sk-tag ok">Classe</span></div><div class="sk-ctxt">' + rich(classPassive.desc, null) + '</div></div>';
      if (pas.length) h += '<div class="sk-pchips">' + pas.map((d) => { const s = stateOf(d); return '<button type="button" class="sk-chip" data-goto="' + d.id + '" style="--e:' + eCol(d) + (s.st === 'lock' ? ';opacity:.7' : '') + '">' + (s.st === 'lock' ? ic('lock', 14) : skIcon(d, 14)) + esc(d.name) + '<small>' + (s.st === 'lock' ? 'niv. ' + d.unlockLevel : 'niv. ' + s.L + '/' + d.maxLevel) + '</small></button>'; }).join('') + '</div>';
      return h + '</div>';
    }
    function sideFiche() {
      const d = ui.sel && byId[ui.sel];
      if (!d) return '<div class="sk-empty">' + ic('info', 28) + '<p>Sélectionne une compétence pour voir sa fiche détaillée : chiffres, améliorations, variantes et synergies.</p></div>';
      return ficheHtml(d, 'side');
    }

    function draw() {
      const scroller = container.closest ? (container.closest('#hub-content') || container.parentNode) : container.parentNode;
      const sy = scroller ? scroller.scrollTop : 0;
      let h = '<div class="sk-wrap">' + lvlBanner() + classHead();
      h += '<div class="sk-layout"><div class="sk-main">' + kitBlock() + startBlock() + levelBlock() + specBlock() + passiveBlock() + '</div><div class="sk-side">' + sideFiche() + '</div></div></div>';
      container.innerHTML = h;
      if (scroller) scroller.scrollTop = sy;
      if (ui.flash && Date.now() - ui.flash.t >= 1400) ui.flash = null;
    }
    function scrollToSel() {
      try { const el = container.querySelector('.sk-fiche--inline'); if (el && el.getBoundingClientRect().width > 0) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }
    function select(id, src) { ui.sel = id; ui.src = src || ui.src || 'list'; ui.newIds.delete(id); draw(); scrollToSel(); }
    function bind() {
      container.addEventListener('click', (ev) => {
        const t = ev.target; if (!t || !t.closest) return;
        const goto = t.closest('[data-goto]'); if (goto) { ev.preventDefault(); const id = goto.getAttribute('data-goto'); if (byId[id]) { snd('click'); select(id, 'list'); if (window.matchMedia && !matchMedia('(min-width:900px)').matches) { const row = container.querySelector('.sk-row[data-id="' + id + '"]'); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } } return; }
        const act = t.closest('[data-act]');
        if (act) {
          const a = act.getAttribute('data-act');
          if (act.disabled) return;
          if (a === 'learn' && ui.sel) {
            const d = def(ui.sel), before = levelOf(p, ui.sel);
            if (learn(p, ui.sel)) { const after = levelOf(p, ui.sel); ui.flash = { id: ui.sel, t: Date.now(), first: before === 0, max: after >= d.maxLevel, lv: after }; ui.newIds.delete(ui.sel); snd(before === 0 || after >= d.maxLevel ? 'levelup' : 'upgrade'); commit(); }
          } else if (a === 'equip') { if (equip(p, act.getAttribute('data-slot'), ui.sel)) { snd('upgrade'); ui.flash = { id: ui.sel, t: Date.now() - 500, first: false, max: false, lv: levelOf(p, ui.sel) }; commit(); } }
          else if (a === 'close') { ui.sel = null; snd('click'); draw(); }
          else if (a === 'cancel') { ui.confirm = null; draw(); }
          else if (a === 'respec') { ui.confirm = 'respec'; draw(); }
          else if (a === 'respec-ok') { ui.confirm = null; if (respec(p)) { ui.pick = null; commit(); } else { toast('Pas assez d\'or'); draw(); } }
          else if (a === 'resetspec') { ui.confirm = 'resetspec'; draw(); }
          else if (a === 'resetspec-ok') { ui.confirm = null; if (resetSpec(p)) commit(); else { toast('Pas assez d\'or'); draw(); } }
          return;
        }
        const vr = t.closest('[data-var]'); if (vr && ui.sel) { if (vr.disabled) return; const v = vr.getAttribute('data-var'); setVariant(p, ui.sel, variantOf(p, ui.sel) === v ? null : v); snd('upgrade'); commit(); return; }
        const sp = t.closest('[data-spec]'); if (sp) { if (chooseSpec(p, sp.getAttribute('data-spec'))) { snd('levelup'); toast('Spécialisation choisie'); commit(); } return; }
        const pk = t.closest('[data-pickid]'); if (pk) { if (equip(p, ui.pick, pk.getAttribute('data-pickid'))) { snd('upgrade'); ui.pick = null; commit(); } return; }
        const slot = t.closest('.sk-ks');
        if (slot) { const sl = slot.getAttribute('data-slot'); const id = p.skills.equipped[sl]; snd('click'); ui.pick = sl === 'cast1' ? null : (ui.pick === sl && ui.sel === id ? null : sl); if (id) { ui.sel = id; ui.src = 'kit'; ui.newIds.delete(id); } draw(); scrollToSel(); return; }
        const row = t.closest('.sk-row');
        if (row) { if (container.__skDragged) { container.__skDragged = false; return; } snd('click'); const id = row.getAttribute('data-id'); if (ui.sel === id && ui.src === 'list') { ui.sel = null; draw(); } else { select(id, 'list'); } }
      });
      container.addEventListener('keydown', (ev) => {
        const row = ev.target && ev.target.closest && ev.target.closest('.sk-row');
        if (row && (ev.key === 'Enter' || ev.key === ' ') && ev.target === row) { ev.preventDefault(); select(row.getAttribute('data-id'), 'list'); }
      });
      // glisser-déposer (souris / stylet) d'une compétence vers la barre ; au tactile : toucher l'emplacement puis choisir
      container.addEventListener('pointerdown', (e) => {
        const el = e.target && e.target.closest && e.target.closest('.sk-row'); if (!el) return;
        const id = el.getAttribute('data-id'), d = def(id);
        if (e.pointerType === 'touch' || e.button !== 0 || !d || !known(p, id) || !(d.kind === 'active' || d.kind === 'ultimate')) return;
        const sx = e.clientX, sy = e.clientY; let ghost = null, over = null;
        const q = (s) => Array.prototype.slice.call(container.querySelectorAll(s));
        const move = (ev) => {
          if (!ghost) {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
            ghost = document.createElement('div'); ghost.className = 'sk-drag sk-wrap'; ghost.innerHTML = hexIcon(d, 56);
            document.body.appendChild(ghost);
            q('.sk-ks').forEach((s) => { const sl = s.getAttribute('data-slot'); if (sl !== 'cast1' && slotOk(sl, d)) s.classList.add('is-drop'); });
          }
          ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
          const t = document.elementFromPoint(ev.clientX, ev.clientY), s = t && t.closest && t.closest('.sk-ks');
          if (over && over !== s) over.classList.remove('is-over');
          over = s && s.classList.contains('is-drop') ? s : null; if (over) over.classList.add('is-over');
        };
        const up = () => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          if (!ghost) return;
          ghost.remove(); container.__skDragged = true; setTimeout(() => { container.__skDragged = false; }, 60);
          if (over && equip(p, over.getAttribute('data-slot'), id)) { ui.sel = id; ui.pick = null; snd('upgrade'); commit(); } else draw();
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      });
    }
    bind();
    draw();
  }

  const PANEL = { id: 'competences', title: 'Compétences', icon: '✨', order: 3, visible: (p) => !!(p && p.classe), badge: (p) => (p && p.skills && p.skills.points > 0 ? p.skills.points : ''), render };
  G.Skills.panel = PANEL;
  function registerPanel() {
    try {
      if (G.UI && G.UI.registerPanel) G.UI.registerPanel(PANEL);
      else if (G.Panels && G.Panels.register) { if (!G.Panels.has || !G.Panels.has(PANEL.id)) G.Panels.register(PANEL.id, PANEL); }
    } catch (e) { console.error('[Skills panel]', e); }
  }
  registerPanel();
})();
