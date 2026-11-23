/* =====================================================================
   js/sys/progression.js — RÔLE 2 : stats, rangs E→SS, progression, succès, animation de promotion
   Expose : G.Stats, G.Ranks, G.Progress (+ panneaux 'heros' et 'succes').
   Dépendances à l'EXÉCUTION seulement (défensif) : G.CLASSES, G.DATA, G.hooks, G.bus, G.game, G.UI, G.sfx, G.VFX, G.Portals.
   ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';

  // ------------------------------------------------------------------ utilitaires
  const num = (v, d) => { v = Number(v); return isFinite(v) ? v : d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
  const ATTRS = ['force', 'vitesse', 'defense', 'vitalite', 'intelligence'];
  const ELEMENTS = ['physique', 'feu', 'glace', 'foudre', 'ombre', 'sacre', 'poison'];
  const curProfile = () => (G.game && G.game.profile) || null;
  const maxLevel = () => num(G.DATA && G.DATA.XP && G.DATA.XP.maxLevel, 30);
  const hudRank = (id) => { try { G.UI && G.UI.hud && G.UI.hud.setRank && G.UI.hud.setRank(id); } catch (e) { /* ignore */ } };
  function persist(p) {
    try {
      if (G.game && G.game.saveProfile) G.game.saveProfile();
      else if (G.save && G.save.save) G.save.save(p);
    } catch (e) { /* ignore */ }
  }
  function notify(text, rarity, icon) {
    try {
      if (G.UI && G.UI.notify) G.UI.notify({ text, rarity: rarity || 'rare', icon: icon || '' });
      else if (G.UI && G.UI.toast) G.UI.toast((icon ? icon + ' ' : '') + text);
    } catch (e) { /* ignore */ }
  }

  // Effet de CHAQUE point d'attribut (affiché dans le panneau, utilisé par Stats.compute)
  const ATTR_EFFECTS = {
    force:        { label: 'Force',        icon: '💪', text: '+1 Force (+1 % dégâts physiques), +2 % dégâts critiques' },
    vitesse:      { label: 'Vitesse',      icon: '💨', text: '+0,05 vitesse, +0,3 % esquive, +0,4 % récupération, +0,3 % critique' },
    defense:      { label: 'Défense',      icon: '🛡️', text: '+1 Défense (réduction de dégâts), +4 PV' },
    vitalite:     { label: 'Vitalité',     icon: '❤️', text: '+8 PV max, +0,4 mana/s, +2 % PV des serviteurs' },
    intelligence: { label: 'Intelligence', icon: '🔮', text: '+1 Intelligence (+1 % dégâts élémentaires), +8 mana max, +1,2 % dégâts des serviteurs' },
  };
  const DMG_PER_POINT = 0.010;   // multiplicateur de dégâts par point de Force / Intelligence au-dessus de 10
  const STAT_REF = 10;

  // ------------------------------------------------------------------ accès données
  const RANKS = () => G.RANKS || [];
  const rankDef = (id) => RANKS().find((r) => r.id === id) || RANKS()[0] || { id: 'E', name: 'Rang E', color: '#9aa3ad', icon: '◆', bonus: {}, aura: {}, rewards: {}, requirements: {} };
  const rankIndex = (id) => { const i = ORDER.indexOf(id); return i < 0 ? 0 : i; };
  const trialById = (id) => (G.RANKS_TRIALS || []).find((t) => t.id === id) || null;
  const trialForRank = (rid) => (G.RANKS_TRIALS || []).find((t) => t.rank === rid) || null;
  const titleDef = (id) => (G.TITLES || []).find((t) => t.id === id) || null;
  const achDef = (id) => (G.ACHIEVEMENTS || []).find((a) => a.id === id) || null;

  // ====================================================================
  // 1. STATS
  // ====================================================================
  function classBase(p) {
    const cls = (G.CLASSES && G.CLASSES[p.classe]) || null;
    const L = clamp(Math.floor(num(p.niveau, 1)), 1, maxLevel());
    if (cls && cls.base) {
      const b = cls.base, pl = cls.perLevel || {};
      let sp = num(b.vitesse, 5.5); if (sp < 3) sp *= 6;
      return {
        pv: num(b.pv, 100) + num(pl.pv, 10) * (L - 1),
        mana: num(b.mana, 100) + num(pl.mana, 4) * (L - 1),
        force: num(b.force, 12) + num(pl.force, 2) * (L - 1),
        intelligence: num(b.intelligence, 10) + num(pl.intelligence, 1.2) * (L - 1),
        defense: num(b.defense, 5) + num(pl.defense, 0.8) * (L - 1),
        vitesse: sp,
        crit: normCrit(b.crit, 0.05), critDmg: normCritDmg(b.critDmg, 1.5),
        minionCap: num(b.minionCap, p.classe === 'Necromancien' ? 3 : 0),
      };
    }
    // repli : classes v2 (G.DATA.CLASSES + G.DATA.XP)
    const D = G.DATA || {};
    const c2 = (D.CLASSES && D.CLASSES[p.classe]) || {};
    let pv;
    try { pv = D.XP && D.XP.pvMax ? D.XP.pvMax(p.classe, L) : num(c2.pv, 100) * (1 + 0.1 * (L - 1)); } catch (e) { pv = num(c2.pv, 100) * (1 + 0.1 * (L - 1)); }
    const caster = p.classe === 'Mage';
    let sp = num(c2.speed, 5.5); if (sp < 3) sp *= 6;
    return {
      pv, mana: 100 + 4 * (L - 1),
      force: (caster ? 8 : 12) + (caster ? 0.8 : 2) * (L - 1),
      intelligence: (caster ? 14 : 8) + (caster ? 2 : 0.8) * (L - 1),
      defense: 5 + 0.8 * (L - 1), vitesse: sp, crit: 0.05, critDmg: 1.5,
      minionCap: p.classe === 'Necromancien' ? 3 : 0,
    };
  }
  function normCrit(v, d) { v = num(v, d); return v > 1 ? v / 100 : v; }
  function normCritDmg(v, d) { v = num(v, d); return v < 1 ? 1 + v : v; }

  function activeTitleBonus(p) {
    const t = p.activeTitle && Array.isArray(p.titles) && p.titles.indexOf(p.activeTitle) >= 0 ? titleDef(p.activeTitle) : null;
    return (t && t.bonus) || {};
  }

  function compute(profile, run) {
    const p = profile || {};
    const L = clamp(Math.floor(num(p.niveau, 1)), 1, maxLevel());
    const att = {}; ATTRS.forEach((k) => { att[k] = Math.max(0, Math.floor(num(p.attributes && p.attributes[k], 0))); });
    const B = classBase(p);
    const rk = rankDef(p.rank || 'E'), rb = rk.bonus || {}, tb = activeTitleBonus(p), ri = rankIndex(rk.id);

    const s = {};
    s.level = L; s.rank = rk.id;
    s.pvMax = Math.round((B.pv + 8 * att.vitalite + 4 * att.defense) * (1 + num(rb.pvMult, 0) + num(tb.pvMult, 0)));
    s.manaMax = Math.round(B.mana + 8 * att.intelligence);
    s.force = r2(B.force + att.force);
    s.intelligence = r2(B.intelligence + att.intelligence);
    s.manaRegen = r2(3 + 0.4 * att.vitalite + 0.03 * s.intelligence);
    s.defense = r2(B.defense + 1 * att.defense + num(rb.defense, 0) + num(tb.defense, 0));
    s.vitesse = r2(Math.min(9, B.vitesse + 0.05 * att.vitesse + num(tb.vitesse, 0)));
    s.crit = Math.round(Math.min(0.8, B.crit + 0.003 * att.vitesse + num(rb.crit, 0) + num(tb.crit, 0)) * 1000) / 1000;
    s.critDmg = r2(B.critDmg + 0.02 * att.force + num(tb.critDmg, 0));
    s.cdr = Math.round(Math.min(0.4, 0.004 * att.vitesse + num(rb.cdr, 0) + num(tb.cdr, 0)) * 1000) / 1000;
    s.lifesteal = num(tb.lifesteal, 0);
    s.dodge = Math.round(Math.min(0.3, 0.003 * att.vitesse + num(tb.dodge, 0)) * 1000) / 1000;
    const allDmg = 1 + num(rb.dmg, 0) + num(tb.dmg, 0);
    const phys = Math.max(0.5, 1 + DMG_PER_POINT * (s.force - STAT_REF));
    const elem = Math.max(0.5, 1 + DMG_PER_POINT * (s.intelligence - STAT_REF));
    s.dmg = {};
    ELEMENTS.forEach((e) => { s.dmg[e] = r2((e === 'physique' ? phys : elem) * allDmg); });
    s.minionDmg = r2(1 + 0.012 * att.intelligence + num(tb.minionDmg, 0));
    s.minionPv = r2(1 + 0.02 * att.vitalite);
    s.minionCap = B.minionCap > 0 ? B.minionCap + num(rb.minionCap, 0) : 0;
    s.xpMult = r2(1 + num(rb.xpMult, 0) + num(tb.xpMult, 0));
    s.goldMult = r2(1 + num(rb.goldMult, 0) + num(tb.goldMult, 0));
    s.lootLuck = r2(num(rb.lootLuck, 0) + num(tb.lootLuck, 0));
    s.damageReduction = Math.round(s.defense / (s.defense + 100) * 1000) / 1000;
    let lm = 1 + 0.05 * (L - 1);
    try { if (G.DATA && G.DATA.XP && G.DATA.XP.dmgMult) lm = G.DATA.XP.dmgMult(L); } catch (e) { /* ignore */ }
    s.levelMult = lm;   // info seulement (déjà reflété par Force/Intelligence)
    s.rankIndex = ri;

    let out = s;
    try { out = (G.hooks && G.hooks.run('stats', s, { profile: p, run: run || null })) || s; } catch (e) { out = s; }
    out.power = power(out, p);
    return out;
  }

  /** Puissance globale (lisible) = offense + survie + utilité
   *   offense  = 250 × meilleur multiplicateur de dégâts × (1 + crit × (critDmg − 1))
   *   survie   = PV max × 0,4 × (1 + Défense/100)
   *   utilité  = mana×0,1 + vitesse×10 + (récup+esquive+vol de vie)×300 + serviteurs×20 + niveaux d'armes forgés×12 */
  function power(st, p) {
    const dm = st.dmg || {};
    let top = 1; ELEMENTS.forEach((e) => { if (num(dm[e], 0) > top) top = dm[e]; });
    const critF = 1 + clamp(num(st.crit, 0), 0, 1) * (Math.max(1, num(st.critDmg, 1.5)) - 1);
    const offense = 250 * top * critF;
    const survie = num(st.pvMax, 0) * 0.4 * (1 + Math.max(0, num(st.defense, 0)) / 100);
    let forge = 0;
    if (p && p.weapons) Object.keys(p.weapons).forEach((w) => { forge += Math.max(0, num(p.weapons[w], 1) - 1); });
    const util = num(st.manaMax, 0) * 0.1 + num(st.vitesse, 0) * 10 + (num(st.cdr, 0) + num(st.dodge, 0) + num(st.lifesteal, 0)) * 300 + num(st.minionCap, 0) * 20 + forge * 12;
    return Math.round(offense + survie + util);
  }

  G.Stats = { compute, power, ATTRS, ATTR_EFFECTS, ELEMENTS, DMG_PER_POINT };

  // ====================================================================
  // 2. RANGS
  // ====================================================================
  function dungeonRankOf(key) {
    const d = G.DUNGEONS && G.DUNGEONS[key];
    if (d && d.rank) return d.rank;
    if (G.RANKS_LEGACY_DUNGEONS && G.RANKS_LEGACY_DUNGEONS[key]) return G.RANKS_LEGACY_DUNGEONS[key];
    return 'E';
  }
  function countCleared(p, minRank) {
    const mi = rankIndex(minRank); let n = 0;
    Object.keys(p.cleared || {}).forEach((k) => {
      if (!p.cleared[k]) return;
      const d = G.DUNGEONS && G.DUNGEONS[k];
      if (d && d.type === 'epreuve') return;
      if (rankIndex(dungeonRankOf(k)) >= mi) n++;
    });
    return n;
  }
  function achCount(p) { return Object.keys(p.achievements || {}).filter((k) => p.achievements[k]).length; }
  function bossesOf(p) { return Math.max(num(p.stats && p.stats.bosses, 0), num(p.counters && p.counters.bossKills, 0)); }

  const Ranks = {
    order: ORDER,
    index: rankIndex,
    def: rankDef,
    current(p) { return (p && ORDER.indexOf(p.rank) >= 0) ? p.rank : 'E'; },
    next(id) { const i = rankIndex(id); return i + 1 < ORDER.length ? ORDER[i + 1] : null; },
    trial: trialById,
    trialForRank,

    /** Vérifie l'accès : « ACCÈS REFUSÉ : RANG B REQUIS. VOTRE RANG ACTUEL EST C. » */
    canEnter(p, requiredRank) {
      const cur = Ranks.current(p);
      if (!requiredRank) return { ok: true, reason: '' };
      const req = ORDER.indexOf(requiredRank) >= 0 ? requiredRank : 'E';
      if (rankIndex(cur) >= rankIndex(req)) return { ok: true, reason: '' };
      return { ok: false, reason: 'ACCÈS REFUSÉ : RANG ' + req + ' REQUIS. VOTRE RANG ACTUEL EST ' + cur + '.' };
    },

    /** Conditions pour atteindre le rang suivant : [{key,label,done,cur,need}] (épreuve incluse en dernier) */
    nextRequirements(p) {
      const nx = Ranks.next(Ranks.current(p));
      if (!nx) return [];
      const R = rankDef(nx).requirements || {};
      const out = [];
      const lvl = num(p.niveau, 1);
      out.push({ key: 'level', label: 'Niveau ' + R.level, done: lvl >= R.level, cur: lvl, need: R.level });
      let pw = 0; try { pw = compute(p).power; } catch (e) { pw = 0; }
      if (R.power) out.push({ key: 'power', label: 'Puissance ' + R.power, done: pw >= R.power, cur: pw, need: R.power });
      if (R.bossesKilled) { const b = bossesOf(p); out.push({ key: 'bosses', label: R.bossesKilled + ' boss vaincus', done: b >= R.bossesKilled, cur: b, need: R.bossesKilled }); }
      if (R.dungeonsCleared) { const c = countCleared(p, R.dungeonsCleared.rank); out.push({ key: 'dungeons', label: R.dungeonsCleared.count + ' donjons de rang ' + R.dungeonsCleared.rank + ' ou plus terminés', done: c >= R.dungeonsCleared.count, cur: c, need: R.dungeonsCleared.count }); }
      if (R.achievements && R.achievements.count) { const a = achCount(p); out.push({ key: 'ach', label: R.achievements.count + ' accomplissements', done: a >= R.achievements.count, cur: a, need: R.achievements.count }); }
      (R.mustHave || []).forEach((id) => { const d = achDef(id); out.push({ key: 'must:' + id, label: 'Succès : ' + (d ? d.name : id), done: !!(p.achievements && p.achievements[id]), cur: (p.achievements && p.achievements[id]) ? 1 : 0, need: 1 }); });
      if (R.trialId) { const t = trialById(R.trialId); out.push({ key: 'trial', label: 'Épreuve : ' + (t ? t.name : R.trialId), done: !!(p.trials && p.trials[R.trialId]), cur: (p.trials && p.trials[R.trialId]) ? 1 : 0, need: 1, trial: true }); }
      return out;
    },

    /** Épreuve du rang visé si toutes les conditions HORS épreuve sont remplies et qu'elle n'est pas déjà réussie */
    eligibleForTrial(p) {
      const nx = Ranks.next(Ranks.current(p));
      if (!nx) return null;
      const t = trialForRank(nx);
      if (!t || (p.trials && p.trials[t.id])) return null;
      const reqs = Ranks.nextRequirements(p).filter((r) => !r.trial);
      return reqs.every((r) => r.done) ? t : null;
    },

    /** Épreuve réussie mais promotion pas encore appliquée ? */
    pendingPromotion(p) {
      const nx = Ranks.next(Ranks.current(p));
      if (!nx) return false;
      const t = trialForRank(nx);
      return !!(t && p.trials && p.trials[t.id] && Ranks.nextRequirements(p).every((r) => r.done));
    },

    /** Promotion : UNIQUEMENT le rang suivant, UNIQUEMENT si l'épreuve du rang visé est réussie (p.trials) */
    promote(p, how) {
      if (!p) return { ok: false, reason: 'Pas de profil.' };
      Progress.ensureProfile(p);
      const from = Ranks.current(p), to = Ranks.next(from);
      if (!to) return { ok: false, reason: 'Rang maximal déjà atteint.' };
      const t = trialForRank(to);
      if (!t || !p.trials[t.id]) return { ok: false, reason: 'ÉPREUVE DE PROMOTION NON RÉUSSIE : ' + (t ? t.name : 'RANG ' + to) + '.' };
      const bad = Ranks.nextRequirements(p).filter((r) => !r.done);
      if (bad.length) return { ok: false, reason: 'CONDITIONS NON REMPLIES : ' + bad.map((r) => r.label).join(', ') + '.' };
      const def = rankDef(to), rw = def.rewards || {};
      p.rank = to;
      p.rankHistory.push({ rank: to, at: Date.now(), how: how || 'trial' });
      p.attrBonus = num(p.attrBonus, 0) + num(rw.attrPoints, 0);
      reconcileAttr(p);
      if (rw.skillPoints) grantSkillPoints(p, rw.skillPoints);
      if (rw.gold) p.gold = num(p.gold, 0) + rw.gold;
      if (rw.talentSlots) p.rankTalentSlots = num(p.rankTalentSlots, 0) + rw.talentSlots;
      if (rw.title && p.titles.indexOf(rw.title) < 0) p.titles.push(rw.title);
      if (rw.title) p.activeTitle = rw.title;
      hudRank(to);
      G.bus && G.bus.emit('rankUp', { from, to, profile: p, rewards: rw, how: how || 'trial' });
      Progress.checkAchievements(p);
      persist(p);
      return { ok: true, from, to, rewards: rw };
    },

    /** Emplacements de dons accordés par les rangs (à ajouter par G.Talents au nombre de base) */
    talentSlotsBonus(p) {
      let n = 0;
      for (let i = 1; i <= rankIndex(Ranks.current(p)); i++) n += num(rankDef(ORDER[i]).rewards && rankDef(ORDER[i]).rewards.talentSlots, 0);
      return n;
    },
  };
  G.Ranks = Ranks;

  // ====================================================================
  // 3. PROGRESSION : profil, attributs, XP, succès, titres
  // ====================================================================
  function reconcileAttr(p) {
    const spent = ATTRS.reduce((s, k) => s + Math.max(0, Math.floor(num(p.attributes[k], 0))), 0);
    const earned = 3 * Math.max(0, Math.floor(num(p.niveau, 1)) - 1) + Math.max(0, Math.floor(num(p.attrBonus, 0)));
    p.attrPoints = Math.max(0, earned - spent);
    return p.attrPoints;
  }
  function grantSkillPoints(p, n) {
    if (!(n > 0)) return;
    if (p.skills && typeof p.skills === 'object') p.skills.points = num(p.skills.points, 0) + n;
    else { p.pendingGrants = p.pendingGrants || {}; p.pendingGrants.skillPoints = num(p.pendingGrants.skillPoints, 0) + n; }
  }
  function flushPending(p) {
    const g = p.pendingGrants;
    if (g && g.skillPoints > 0 && p.skills && typeof p.skills === 'object') { p.skills.points = num(p.skills.points, 0) + g.skillPoints; g.skillPoints = 0; }
  }
  function counters(p) { return (p.counters = p.counters && typeof p.counters === 'object' ? p.counters : {}); }
  function bump(c, k, n) { c[k] = num(c[k], 0) + (n == null ? 1 : n); }

  function statValue(p, key) {
    const c = counters(p);
    switch (key) {
      case 'level': return num(p.niveau, 1);
      case 'rankIndex': return rankIndex(Ranks.current(p));
      case 'attrSpent': return ATTRS.reduce((s, k) => s + num(p.attributes[k], 0), 0);
      case 'clearedCount': return countCleared(p, 'E');
      case 'bossKills': return bossesOf(p);
      case 'kills': return Math.max(num(c.kills, 0), num(p.stats && p.stats.kills, 0));
      case 'runsWon': return Math.max(num(c.runsWon, 0), num(p.stats && p.stats.dungeons, 0));
      case 'losses': return Math.max(num(c.losses, 0), num(p.stats && p.stats.deaths, 0));
      case 'secrets': return Math.max(num(c.secrets, 0), num(p.stats && p.stats.secrets, 0));
      default: return num(c[key], 0);
    }
  }

  function applyReward(p, rw) {
    if (!rw) return;
    if (rw.gold) p.gold = num(p.gold, 0) + rw.gold;
    if (rw.attrPoints) { p.attrBonus = num(p.attrBonus, 0) + rw.attrPoints; reconcileAttr(p); }
    if (rw.skillPoints) grantSkillPoints(p, rw.skillPoints);
    if (rw.title) unlockTitle(p, rw.title, true);
  }
  function unlockTitle(p, id, silent) {
    if (!titleDef(id) || p.titles.indexOf(id) >= 0) return false;
    p.titles.push(id);
    if (!silent) { const t = titleDef(id); notify('Titre obtenu : ' + t.name, 'epique', '🎖️'); }
    return true;
  }

  /** Débloque les succès atteints. silent = pas de notification. Retourne la liste des ids débloqués. */
  function checkAchievements(p, silent) {
    p = p || curProfile(); if (!p) return [];
    if (!p.achievements) p.achievements = {};
    const got = [];
    (G.ACHIEVEMENTS || []).forEach((a) => {
      if (p.achievements[a.id]) return;
      if (statValue(p, a.stat) >= a.n) {
        p.achievements[a.id] = true; got.push(a.id);
        applyReward(p, a.reward);
        if (!silent) {
          const rt = []; const r = a.reward || {};
          if (r.gold) rt.push('+' + r.gold + ' or'); if (r.attrPoints) rt.push('+' + r.attrPoints + ' pt attribut'); if (r.skillPoints) rt.push('+' + r.skillPoints + ' pt compétence');
          notify('Succès : ' + a.name + (rt.length ? ' (' + rt.join(', ') + ')' : ''), 'legendaire', a.icon || '🏆');
        }
      }
    });
    // les succès peuvent en débloquer d'autres (ex. nombre de titres) : un second passage suffit
    if (got.length) { const more = checkAchievements(p, silent); got.push(...more); try { G.sfx && !silent && G.sfx.play('upgrade'); } catch (e) { /* ignore */ } }
    return got;
  }

  const Progress = {
    ensureProfile(p) {
      if (!p || typeof p !== 'object') return p;
      if (ORDER.indexOf(p.rank) < 0) p.rank = 'E';                      // migration v2 → rang E
      if (!Array.isArray(p.rankHistory)) p.rankHistory = [];
      if (!p.rankHistory.length) p.rankHistory.push({ rank: p.rank, at: Date.now(), how: 'depart' });
      if (!p.trials || typeof p.trials !== 'object') p.trials = {};
      if (!p.attributes || typeof p.attributes !== 'object') p.attributes = {};
      ATTRS.forEach((k) => { p.attributes[k] = Math.max(0, Math.floor(num(p.attributes[k], 0))); });
      p.attrBonus = Math.max(0, Math.floor(num(p.attrBonus, 0)));
      p.niveau = Math.max(1, Math.floor(num(p.niveau, 1)));
      reconcileAttr(p);                                                  // points rétroactifs : 3 / niveau
      if (!Array.isArray(p.titles)) p.titles = [];
      if (p.titles.indexOf('novice') < 0) p.titles.unshift('novice');
      for (let i = 1; i <= rankIndex(p.rank); i++) { const t = rankDef(ORDER[i]).rewards && rankDef(ORDER[i]).rewards.title; if (t && p.titles.indexOf(t) < 0) p.titles.push(t); }
      if (p.activeTitle === undefined || (p.activeTitle === null && !p.titleChosen) || (p.activeTitle && p.titles.indexOf(p.activeTitle) < 0)) p.activeTitle = 'novice';
      if (!p.achievements || typeof p.achievements !== 'object') p.achievements = {};
      counters(p);
      if (!p.pendingGrants || typeof p.pendingGrants !== 'object') p.pendingGrants = {};
      p.rankTalentSlots = num(p.rankTalentSlots, 0);
      flushPending(p);
      checkAchievements(p, true);
      return p;
    },

    /** Aide : XP avec multiplicateur de stats + hook 'xpGain', montée de niveau. N'émet PAS 'levelUp' (game.js le fait)
     *  sauf si ctx.emit === true. Retourne {gained, levelBefore, levelAfter}. */
    gainXP(p, n, ctx) {
      ctx = ctx || {};
      const levelBefore = p.niveau;
      let g = num(n, 0);
      if (!(g > 0)) return { gained: 0, levelBefore, levelAfter: p.niveau };
      if (ctx.noMult !== true) { try { g *= compute(p).xpMult; } catch (e) { /* ignore */ } }
      try { g = num(G.hooks && G.hooks.run('xpGain', g, ctx), g); } catch (e) { /* ignore */ }
      g = Math.max(0, Math.round(g));
      p.xp = num(p.xp, 0) + g;
      const XP = G.DATA && G.DATA.XP;
      while (XP && p.niveau < maxLevel() && p.xp >= XP.forLevel(p.niveau)) { p.xp -= XP.forLevel(p.niveau); p.niveau++; }
      if (p.niveau > levelBefore) {
        reconcileAttr(p);
        if (ctx.emit === true) G.bus && G.bus.emit('levelUp', { niveau: p.niveau });
      }
      return { gained: g, levelBefore, levelAfter: p.niveau };
    },

    /** Répartit n points (défaut 1) dans un attribut. Retourne {ok, reason?} */
    allocate(p, attr, n) {
      n = Math.max(1, Math.floor(num(n, 1)));
      if (ATTRS.indexOf(attr) < 0) return { ok: false, reason: 'Attribut inconnu.' };
      Progress.ensureProfile(p);
      if (p.attrPoints < n) return { ok: false, reason: 'Pas assez de points.' };
      p.attributes[attr] += n;
      reconcileAttr(p);
      checkAchievements(p);
      persist(p);
      return { ok: true };
    },

    respecCost(p) { return 50 * Math.max(1, num(p.niveau, 1)); },
    /** Réinitialise les attributs contre de l'or */
    respec(p) {
      Progress.ensureProfile(p);
      const cost = Progress.respecCost(p);
      if (num(p.gold, 0) < cost) return { ok: false, reason: 'Il faut ' + cost + ' or.' };
      p.gold -= cost; ATTRS.forEach((k) => { p.attributes[k] = 0; });
      reconcileAttr(p); persist(p);
      return { ok: true, cost };
    },

    equipTitle(p, id) {
      if (id !== null && p.titles.indexOf(id) < 0) return false;
      p.activeTitle = id; p.titleChosen = true; persist(p); return true;
    },
    titles(p) { return (G.TITLES || []).map((t) => Object.assign({ owned: p.titles.indexOf(t.id) >= 0, active: p.activeTitle === t.id }, t)); },
    achievements(p) { return (G.ACHIEVEMENTS || []).map((a) => Object.assign({ done: !!p.achievements[a.id], cur: Math.min(a.n, statValue(p, a.stat)) }, a)); },
    checkAchievements,
    statValue,
    playPromotion: (from, to) => playPromotion(from, to),
    onEvent(ev, payload) { return handle(ev, payload); },
  };
  G.Progress = Progress;

  // ------------------------------------------------------------------ suivi via le bus
  const ELEM_KILL = { feu: 'kills_feu', glace: 'kills_glace', foudre: 'kills_foudre', ombre: 'kills_ombre' };
  const RARITY_RANK = { epique: 1, legendaire: 2, mythique: 3 };
  function handle(ev, d) {
    const p = curProfile(); if (!p) return;
    if (!p.achievements) Progress.ensureProfile(p);
    const c = counters(p);
    d = d || {};
    switch (ev) {
      case 'enemyKilled': {
        bump(c, 'kills');
        const e = d.enemy || {};
        if (e.elite && !e.boss) bump(c, 'eliteKills');
        if (d.killer === 'minion') bump(c, 'minionKills');
        if (d.element && ELEM_KILL[d.element]) bump(c, ELEM_KILL[d.element]);
        break;
      }
      case 'bossKilled': bump(c, 'bossKills'); break;
      case 'damageDealt': if (d.crit) bump(c, 'crits'); if (num(d.amount, 0) > num(c.maxHit, 0) && d.source !== 'minion') c.maxHit = Math.round(d.amount); break;
      case 'playerDodge': bump(c, 'dodges'); break;
      case 'playerParry': bump(c, 'parries'); break;
      case 'skillCast': bump(c, 'skillCasts'); break;
      case 'roomCleared': bump(c, 'roomsCleared'); break;
      case 'necroAwakened': c.necroAwakened = 1; break;
      case 'loot': {
        if (d.gold) bump(c, 'goldLoot', num(d.gold.amount, num(d.gold, 0)));
        const it = d.item;
        if (it && RARITY_RANK[it.rarity]) {
          const r = RARITY_RANK[it.rarity];
          if (r >= 1) bump(c, 'epicLoot'); if (r >= 2) bump(c, 'legendLoot'); if (r >= 3) bump(c, 'mythicLoot');
        }
        break;
      }
      case 'runEnd': onRunEnd(p, d); break;
      case 'rankUp': break;
      default: break;
    }
    const got = checkAchievements(p);
    if (got.length) persist(p);
  }
  ['enemyKilled', 'bossKilled', 'damageDealt', 'playerDodge', 'playerParry', 'skillCast', 'roomCleared', 'necroAwakened', 'loot', 'rankUp'].forEach((ev) => {
    G.bus && G.bus.on(ev, (d) => handle(ev, d));
  });

  function onRunEnd(p, d) {
    const run = d.run || {}, st = d.stats || {};
    const c = counters(p);
    if (d.victory) {
      bump(c, 'runsWon');
      if (num(st.damageTaken, 1) === 0) bump(c, 'flawless');
      if (num(st.time, 9999) < 150) bump(c, 'fastWins');
      const portal = run.portal || null;
      if (portal && portal.type === 'rouge') bump(c, 'redWins');
    } else bump(c, 'losses');
    if (st.secretsFound) bump(c, 'secrets', st.secretsFound);
    // --- épreuve de promotion réussie ?
    const portal = run.portal || null;
    if (portal && portal.type === 'epreuve' && d.victory) {
      const dun = run.dungeon || {};
      let trial = trialById(portal.trialId) || trialById(portal.templateId) || trialById(dun.trialId) || trialById(dun.templateId)
        || (G.RANKS_TRIALS || []).find((t) => t.rank === portal.rank) || null;
      if (trial) {
        const why = violatedConstraint(trial, run, st);
        if (why) { notify('Épreuve échouée : ' + why, 'mythique', '⚠️'); }
        else if (!p.trials[trial.id]) {
          p.trials[trial.id] = true; bump(c, 'trials');
          notify('Épreuve réussie : ' + trial.name, 'legendaire', '📜');
          if (Ranks.next(Ranks.current(p)) === trial.rank) Ranks.promote(p, 'trial');
          else if (rankIndex(trial.rank) > rankIndex(Ranks.current(p))) notify('Il faut d’abord obtenir les rangs précédents.', 'rare', 'ℹ️');
        }
      }
    }
    flushPending(p);
    persist(p);
  }
  function violatedConstraint(trial, run, st) {
    const k = trial.constraints || {};
    if (k.timeLimit && num(st.time, 0) > k.timeLimit) return 'temps limite dépassé';
    const pots = firstNum(run.potionsUsed, st.potionsUsed);
    if (k.noPotions && pots > 0) return 'potion utilisée';
    const hits = firstNum(run.hitsTaken, st.hitsTaken);
    if (k.maxHits != null && hits > k.maxHits) return 'trop de coups subis';
    const dashes = firstNum(run.dashesUsed, st.dashesUsed);
    if (k.noDash && dashes > 0) return 'roulade utilisée';
    return null;
  }
  function firstNum() { for (let i = 0; i < arguments.length; i++) if (arguments[i] != null && isFinite(Number(arguments[i]))) return Number(arguments[i]); return 0; }

  // niveau gagné : points d'attributs rétroactifs + rappel d'épreuve
  G.bus && G.bus.on('levelUp', () => {
    const p = curProfile(); if (!p) return;
    Progress.ensureProfile(p);
    const t = Ranks.eligibleForTrial(p);
    if (t && p.trialNotified !== t.id) { p.trialNotified = t.id; notify('Épreuve de promotion disponible : ' + t.name, 'legendaire', '📜'); }
    if (p.attrPoints > 0) notify(p.attrPoints + ' point(s) d’attribut à répartir (Héros & Rang)', 'rare', '💠');
    persist(p);
  });
  G.bus && G.bus.on('profileChanged', (d) => {
    const p = (d && d.profile) || curProfile(); if (p && p.attributes) { reconcileAttr(p); flushPending(p); }
  });

  // ====================================================================
  // 4. STYLE (.rk-) — mise en page propre ; l'apparence vient de css/ds.css
  // ====================================================================
  let styled = false;
  function injectStyle() {
    if (styled || typeof document === 'undefined') return;
    if (document.getElementById('rk-style')) { styled = true; return; }
    styled = true;
    const st = document.createElement('style'); st.id = 'rk-style';
    st.textContent = `
.rk-wrap{--rkc:var(--rk-E,#9aa3ad);display:flex;flex-direction:column;gap:14px;color:var(--ds-text,#e8f0ff);font-family:var(--ds-font-body,'Nunito',sans-serif);font-weight:600;padding-bottom:24px}
.rk-wrap svg,.rk-promo svg{display:block;flex:none}
.rk-ic{display:inline-flex;align-items:center;justify-content:center;flex:none}
.rk-panel{position:relative;padding:14px;border-radius:var(--ds-r-lg,16px);border:1px solid var(--ds-line,rgba(130,180,255,.16));background:linear-gradient(170deg,var(--ds-bg-2,#111a33),var(--ds-bg-1,#0b1122));box-shadow:var(--ds-shadow-1,0 4px 14px rgba(0,0,0,.35))}
.rk-panel>.ds-section-title:first-child{margin-top:0}
.rk-sub{font-size:12.5px;color:var(--ds-text-2,#a9b8d6);line-height:1.45}
.rk-muted{color:var(--ds-text-3,#6f7fa3)}
.rk-disp{font-family:var(--ds-font-display,'Chakra Petch',sans-serif);font-weight:700;letter-spacing:.04em}
/* ---- carte héros ---- */
.rk-hero{display:flex;gap:16px;align-items:center;overflow:hidden;border-color:color-mix(in srgb,var(--rkc) 45%,transparent);background:radial-gradient(110% 120% at 0% 0%,color-mix(in srgb,var(--rkc) 20%,transparent),transparent 62%),linear-gradient(170deg,var(--ds-bg-2,#111a33),var(--ds-bg-1,#0b1122))}
.rk-aura{position:relative;flex:none;display:grid;place-items:center;padding:12px}
.rk-aura::before{content:"";position:absolute;inset:-18px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--rkc) 42%,transparent),transparent 66%);animation:rkBreath 3s ease-in-out infinite;opacity:calc(.35 + var(--ri,0)*.1)}
.rk-aura .rk-ring{position:absolute;inset:-6px;border-radius:50%;border:1px solid color-mix(in srgb,var(--rkc) 60%,transparent);animation:rkRing 3.2s ease-out infinite}
.rk-aura .rk-ring.b{animation-delay:1.6s}
.rk-aura .rk-orbit{position:absolute;inset:-12px;border-radius:50%;background:conic-gradient(from 0deg,transparent 0,var(--rkc) 10%,transparent 22%,transparent 50%,var(--rkc) 60%,transparent 72%);-webkit-mask:radial-gradient(circle,transparent 66%,#000 68%,#000 71%,transparent 73%);mask:radial-gradient(circle,transparent 66%,#000 68%,#000 71%,transparent 73%);animation:rkSpin 6s linear infinite;opacity:.8}
.rk-aura .ds-rank{position:relative;z-index:1;filter:drop-shadow(0 0 14px color-mix(in srgb,var(--rkc) 70%,transparent))}
.rk-aura.rk-r0 .rk-ring,.rk-aura.rk-r0 .rk-orbit{display:none}
.rk-aura.rk-r6::before{background:radial-gradient(circle,rgba(255,215,0,.5),rgba(255,138,26,.18) 55%,transparent 70%)}
.rk-aura i{position:absolute;left:50%;bottom:10px;width:3px;height:3px;border-radius:50%;background:var(--rkc);box-shadow:0 0 6px var(--rkc);opacity:0;animation:rkMote 3s ease-in infinite}
.rk-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.rk-name{font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:20px;line-height:1.1;letter-spacing:.03em;overflow-wrap:anywhere}
.rk-rankline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--ds-text-2,#a9b8d6)}
.rk-rankline b{font-family:var(--ds-font-display,sans-serif);letter-spacing:.06em;text-transform:uppercase;color:var(--rkc)}
.rk-lvl{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--ds-font-display,sans-serif);font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ds-text-2,#a9b8d6)}
.rk-lvl b{font-size:18px;color:var(--ds-text,#e8f0ff)}
.rk-lvl small{font-size:11px;letter-spacing:.04em;color:var(--ds-text-3,#6f7fa3)}
.rk-pow{display:flex;align-items:center;gap:8px;font-family:var(--ds-font-display,sans-serif);font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ds-text-2,#a9b8d6)}
.rk-pow b{font-size:24px;letter-spacing:.02em;color:var(--ds-gold,#ffc94a);font-variant-numeric:tabular-nums;text-shadow:0 0 14px rgba(255,201,74,.35)}
.rk-pow em{font-style:normal;font-size:13px;color:var(--ds-success,#39e08c);font-variant-numeric:tabular-nums}
@media(max-width:420px){.rk-hero{gap:10px;padding:12px}.rk-aura{padding:8px}}
/* ---- attributs ---- */
.rk-pts{display:inline-flex;align-items:center;gap:6px;font-family:var(--ds-font-display,sans-serif);font-size:12px;letter-spacing:.06em;color:var(--ds-gold,#ffc94a)}
.rk-attr{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--ds-line,rgba(130,180,255,.16))}
.rk-attr:last-of-type{border-bottom:0}
.rk-attr .rk-ai{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none;color:var(--ds-accent,#46d4ff);background:rgba(70,212,255,.1);border:1px solid rgba(70,212,255,.28)}
.rk-attr .rk-an{flex:1;min-width:0}
.rk-attr .rk-an b{display:block;font-family:var(--ds-font-display,sans-serif);font-size:14px;letter-spacing:.04em}
.rk-attr .rk-an small{display:block;font-size:11.5px;line-height:1.3;color:var(--ds-text-3,#6f7fa3)}
.rk-attr .rk-av{min-width:46px;text-align:center;font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:18px;font-variant-numeric:tabular-nums}
.rk-attr .rk-av em{display:block;font-style:normal;font-size:11px;color:var(--ds-success,#39e08c);line-height:1}
.rk-attr .ds-icon-btn{min-width:40px;min-height:40px}
.rk-attr .ds-icon-btn[disabled]{opacity:.3}
.rk-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.rk-acts .ds-btn{flex:1 1 auto}
.rk-msg{font-size:12px;color:var(--ds-danger,#ff4d6a);min-height:0}
.rk-msg:empty{display:none}
/* ---- statistiques ---- */
.rk-sg{display:flex;flex-direction:column;gap:12px}
.rk-sg h5{display:flex;align-items:center;gap:8px;margin:0 0 4px;font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ds-accent,#46d4ff)}
.rk-sg h5.d{color:var(--ds-success,#39e08c)}.rk-sg h5.u{color:var(--ds-accent-2,#8b6bff)}
.rk-wrap .ds-stat__value small{font-family:var(--ds-font-display,sans-serif);font-size:11px;margin-left:5px;color:var(--ds-success,#39e08c)}
@media(min-width:900px){.rk-sg{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.rk-heros{display:grid;grid-template-columns:1fr 1fr;align-items:start}.rk-heros>.rk-hero,.rk-heros>.rk-stats{grid-column:1/-1}.rk-hero{padding-left:24px}}
/* ---- progression de rang ---- */
.rk-next{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.rk-next .rk-nt{flex:1;min-width:0}
.rk-next .rk-nt b{display:block;font-family:var(--ds-font-display,sans-serif);font-size:15px;letter-spacing:.05em;text-transform:uppercase}
.rk-next .rk-nt span{font-size:12px;color:var(--ds-text-2,#a9b8d6)}
.rk-reqs{display:flex;flex-direction:column;gap:6px;margin:12px 0}
.rk-req{display:grid;grid-template-columns:26px 1fr auto;gap:2px 10px;align-items:center;padding:8px 10px;border-radius:var(--ds-r-md,10px);border:1px solid var(--ds-line,rgba(130,180,255,.16));background:rgba(130,180,255,.04)}
.rk-req .rk-ck{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:var(--ds-text-3,#6f7fa3);border:1px solid var(--ds-line-strong,rgba(130,200,255,.36))}
.rk-req .rk-rl{font-size:13px;font-weight:700}
.rk-req .rk-rc{font-family:var(--ds-font-display,sans-serif);font-size:12px;color:var(--ds-text-2,#a9b8d6);font-variant-numeric:tabular-nums}
.rk-req .ds-bar{grid-column:2/4;height:5px}
.rk-req.ok{border-color:rgba(57,224,140,.4);background:rgba(57,224,140,.07)}
.rk-req.ok .rk-ck{color:#04170d;background:var(--ds-success,#39e08c);border-color:transparent}
.rk-req.ok .rk-rc{color:var(--ds-success,#39e08c)}
.rk-trial{display:flex;gap:10px;padding:10px 12px;border-radius:var(--ds-r-md,10px);border:1px solid rgba(255,201,74,.45);background:rgba(255,201,74,.08);margin-bottom:12px}
.rk-trial b{display:block;font-family:var(--ds-font-display,sans-serif);letter-spacing:.04em;color:var(--ds-gold,#ffc94a)}
.rk-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.rk-go.ds-btn--gold{animation:rkGo 1.6s ease-in-out infinite}
/* ---- titres ---- */
.rk-titles{display:flex;flex-wrap:wrap;gap:8px}
.rk-tt{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:99px;border:1px solid var(--ds-line-strong,rgba(130,200,255,.36));background:rgba(130,180,255,.07);color:var(--ds-text,#e8f0ff);font:700 12.5px var(--ds-font-body,sans-serif);transition:all var(--ds-fast,120ms)}
.rk-tt:active{transform:scale(.96)}
.rk-tt.is-on{border-color:var(--ds-gold,#ffc94a);color:var(--ds-gold,#ffc94a);background:rgba(255,201,74,.12);box-shadow:0 0 14px rgba(255,201,74,.2)}
/* ---- timeline ---- */
.rk-tl{position:relative;display:flex;flex-direction:column;gap:14px;padding-left:26px}
.rk-tl::before{content:"";position:absolute;left:8px;top:6px;bottom:6px;width:2px;background:linear-gradient(var(--ds-line-strong,rgba(130,200,255,.36)),rgba(130,200,255,.06))}
.rk-tl>div{position:relative}
.rk-tl>div::before{content:"";position:absolute;left:-23px;top:3px;width:14px;height:14px;border-radius:50%;background:var(--ds-bg-1,#0b1122);border:2px solid var(--c);box-shadow:0 0 10px color-mix(in srgb,var(--c) 60%,transparent)}
.rk-tl b{font-family:var(--ds-font-display,sans-serif);letter-spacing:.05em;text-transform:uppercase;color:var(--c)}
.rk-tl small{display:block;font-size:12px;color:var(--ds-text-3,#6f7fa3)}
/* ---- succès ---- */
.rk-top{display:flex;align-items:center;gap:14px}
.rk-top .rk-big{font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:34px;line-height:1;letter-spacing:.02em}
.rk-top .rk-big small{font-size:16px;color:var(--ds-text-3,#6f7fa3)}
.rk-top .rk-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.rk-top .rk-tx .rk-sub b{color:var(--ds-gold,#ffc94a)}
.rk-wrap .ds-tabs{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.rk-wrap .ds-tabs::-webkit-scrollbar{display:none}
.rk-wrap .ds-tabs .ds-tab{white-space:nowrap;flex:none}
.rk-wrap .ds-tab i{font-style:normal;font-size:11px;margin-left:5px;opacity:.65}
.rk-alist{display:flex;flex-direction:column;gap:8px}
@media(min-width:900px){.rk-alist{display:grid;grid-template-columns:1fr 1fr}}
.rk-ach{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:var(--ds-r-md,10px);border:1px solid var(--ds-line,rgba(130,180,255,.16));background:linear-gradient(170deg,var(--ds-bg-2,#111a33),var(--ds-bg-1,#0b1122));animation:rkIn .35s var(--ds-ease,ease) both}
.rk-ach .rk-ai{flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:22px;background:rgba(130,180,255,.08);border:1px solid var(--ds-line-strong,rgba(130,200,255,.36))}
.rk-ach .rk-at{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.rk-ach .rk-an2{font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:14px;letter-spacing:.03em}
.rk-ach .rk-ad{font-size:12px;color:var(--ds-text-2,#a9b8d6);line-height:1.35}
.rk-ach .rk-pr{display:flex;align-items:center;gap:8px}
.rk-ach .rk-pr .ds-bar{flex:1;height:6px}
.rk-ach .rk-pr span{font-family:var(--ds-font-display,sans-serif);font-size:11px;color:var(--ds-text-2,#a9b8d6);font-variant-numeric:tabular-nums}
.rk-rw{display:flex;flex-wrap:wrap;gap:5px;margin-top:2px}
.rk-rw .ds-chip{font-size:11px;padding:1px 8px;gap:4px}
.rk-rw .rk-g{color:var(--ds-gold,#ffc94a);border-color:rgba(255,201,74,.4)}
.rk-rw .rk-v{color:var(--ds-accent-2,#b48bff);border-color:rgba(139,107,255,.45)}
.rk-rw .rk-c{color:var(--ds-accent,#46d4ff);border-color:rgba(70,212,255,.4)}
.rk-ach.rk-done{border-color:rgba(255,201,74,.4);background:linear-gradient(170deg,rgba(255,201,74,.08),var(--ds-bg-1,#0b1122))}
.rk-ach.rk-done .rk-ai{border-color:rgba(255,201,74,.55);box-shadow:0 0 14px rgba(255,201,74,.2)}
.rk-ach.rk-done .rk-rw .ds-chip{opacity:.6}
.rk-ach .rk-st{flex:none;align-self:flex-start}
.rk-ach.rk-secret .rk-ai{color:var(--ds-text-3,#6f7fa3)}
.rk-tcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.rk-tc{appearance:none;text-align:left;cursor:pointer;position:relative;display:flex;flex-direction:column;gap:4px;padding:11px 12px;border-radius:var(--ds-r-md,10px);border:1px solid var(--ds-line,rgba(130,180,255,.16));background:linear-gradient(170deg,var(--ds-bg-2,#111a33),var(--ds-bg-1,#0b1122));color:var(--ds-text,#e8f0ff);font-family:inherit;transition:transform var(--ds-fast,120ms),border-color var(--ds-fast,120ms)}
.rk-tc:active{transform:scale(.98)}
.rk-tc b{display:flex;align-items:center;gap:6px;font-family:var(--ds-font-display,sans-serif);font-size:14px;letter-spacing:.04em}
.rk-tc span{font-size:12px;color:var(--ds-text-2,#a9b8d6);line-height:1.35}
.rk-tc.is-on{border-color:var(--ds-gold,#ffc94a);background:linear-gradient(170deg,rgba(255,201,74,.14),var(--ds-bg-1,#0b1122));box-shadow:0 0 18px rgba(255,201,74,.2)}
.rk-tc.is-on b{color:var(--ds-gold,#ffc94a)}
.rk-tc.rk-lock{cursor:default;opacity:.5}
.rk-tc .rk-tag{position:absolute;right:10px;top:10px}
/* ---- promotion ---- */
.rk-promo{--rkc:#9aa3ad;position:fixed;inset:0;z-index:99999;pointer-events:none;background:rgba(0,0,0,0);transition:background .6s,opacity .9s;overflow:hidden}
.rk-promo.rk-in{background:radial-gradient(ellipse at 50% 38%,color-mix(in srgb,var(--rkc) 16%,rgba(3,6,14,.9)),rgba(3,6,14,.94) 70%)}
.rk-promo.rk-out{opacity:0}
.rk-promo-cv{position:absolute;inset:0;width:100%;height:100%}
.rk-promo-txt{position:absolute;left:0;right:0;top:57%;text-align:center;color:#fff;opacity:0;animation:rk-txt .8s ease-out 2.4s forwards;padding:0 14px}
.rk-promo-t2{font-family:var(--ds-font-display,'Chakra Petch',sans-serif);font-weight:600;font-size:clamp(11px,2.6vw,14px);letter-spacing:.34em;text-transform:uppercase;color:var(--ds-text-2,#a9b8d6)}
.rk-promo-t1{margin-top:6px;font-family:var(--ds-font-display,'Chakra Petch',sans-serif);font-weight:700;font-size:clamp(24px,6.5vw,46px);line-height:1.05;letter-spacing:.14em;text-transform:uppercase;color:var(--rkc);text-shadow:0 0 18px var(--rkc),0 0 44px color-mix(in srgb,var(--rkc) 60%,transparent)}
.rk-promo-t3{margin-top:8px;font-family:var(--ds-font-display,'Chakra Petch',sans-serif);font-size:clamp(11px,2.6vw,14px);letter-spacing:.24em;text-transform:uppercase;color:var(--ds-text-2,#a9b8d6)}
.rk-recapw{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:0 0 max(18px,env(safe-area-inset-bottom,0px));pointer-events:none}
.rk-recap{position:relative;width:min(92vw,380px);pointer-events:auto;opacity:0;animation:rk-recap .5s var(--ds-ease-out-back,cubic-bezier(.34,1.56,.64,1)) forwards;
 background:var(--ds-glass-strong,rgba(9,14,30,.94));border:1px solid color-mix(in srgb,var(--rkc) 60%,transparent);border-radius:var(--ds-r-lg,16px);color:var(--ds-text,#e8f0ff);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 34px color-mix(in srgb,var(--rkc) 30%,transparent),var(--ds-shadow-2,0 12px 40px rgba(0,0,0,.55))}
@media(max-height:560px) and (orientation:landscape){.rk-recapw{top:0;left:auto;width:46%;align-items:center;padding:0 14px}}
.rk-recap .rk-rh{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--ds-line,rgba(130,180,255,.16));font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--rkc)}
.rk-recap .rk-rb{padding:6px 14px 4px}
.rk-recap .ds-stat__label{display:inline-flex;align-items:center;gap:8px}
.rk-recap .ds-stat:last-child{border-bottom:0}
.rk-recap .ds-stat{animation:rkIn .35s var(--ds-ease,ease) both;animation-delay:calc(var(--i,0)*90ms + .35s)}
.rk-recap .rk-rf{padding:8px 14px 14px}
@keyframes rk-txt{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
@keyframes rk-recap{from{opacity:0;transform:translateY(24px) scale(.94)}to{opacity:1;transform:none}}
@keyframes rkIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes rkSpin{to{transform:rotate(360deg)}}
@keyframes rkBreath{50%{transform:scale(1.12);opacity:.9}}
@keyframes rkRing{0%{transform:scale(.92);opacity:.7}100%{transform:scale(1.28);opacity:0}}
@keyframes rkMote{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(var(--dx,0),-110px);opacity:0}}
@keyframes rkGo{0%,100%{filter:brightness(1);box-shadow:0 0 0 rgba(255,201,74,0)}50%{filter:brightness(1.18);box-shadow:0 0 26px rgba(255,201,74,.55)}}
@media(prefers-reduced-motion:reduce){.rk-aura::before,.rk-aura .rk-ring,.rk-aura .rk-orbit,.rk-aura i,.rk-go.ds-btn--gold,.rk-ach,.rk-recap .ds-stat{animation:none!important}.rk-aura i{display:none}.rk-recap{animation:none;opacity:1}}
`;
    document.head.appendChild(st);
  }
  // ====================================================================
  // 5. ANIMATION DE PROMOTION (overlay DOM + canvas 2D)
  // ====================================================================
  const FONT_STACK = "'Chakra Petch','Arial Black',Impact,sans-serif";
  const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const ICO_FB = { gold: '🪙', sparkles: '✨', star: '★', crown: '👑', user: '👤', rune: '✦', check: '✔', lock: '🔒', sword: '⚔', shield: '🛡', lightning: '⚡', heart: '❤', mana: '🔮', trophy: '🏆', medal: '🏅', chart: '📈', portal: '🌀', skull: '💀', gift: '🎁', xp: '✨', arrow_up: '▲', plus: '+', minus: '−', refresh: '↻', scroll: '📜', timer: '⏱', target: '◎' };
  function ico(name, size) {
    size = size || 16;
    try {
      if (G.Icons && typeof G.Icons.svg === 'function' && (!G.Icons.has || G.Icons.has(name))) {
        const s = G.Icons.svg(name, { size });
        if (s) return '<span class="rk-ic">' + s + '</span>';
      }
    } catch (e) { /* repli emoji */ }
    return '<span class="rk-ic" style="font-size:' + Math.round(size * 0.85) + 'px;line-height:1">' + (ICO_FB[name] || '•') + '</span>';
  }
  // couleur de rang : variable CSS du système de design, sinon donnée du jeu
  function rkColor(id) {
    let v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue('--rk-' + id).trim(); } catch (e) { /* ignore */ }
    return v || rankDef(id).color || '#9aa3ad';
  }
  const rankBadge = (id, size) => '<span class="ds-rank ds-rank--' + (size || 'md') + '" data-rank="' + esc(id) + '">' + esc(id) + '</span>';
  function rewardRows(rw, title) {
    const L = [];
    if (rw.gold) L.push(['gold', 'Or', '+' + String(rw.gold).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')]);
    if (rw.skillPoints) L.push(['sparkles', 'Points de compétence', '+' + rw.skillPoints]);
    if (rw.attrPoints) L.push(['user', 'Points d’attribut', '+' + rw.attrPoints]);
    if (rw.talentSlots) L.push(['rune', 'Emplacement de don', '+' + rw.talentSlots]);
    if (title) L.push(['crown', 'Titre', '« ' + title.name + ' »']);
    return L;
  }

  let promo = null;
  function closePromotion(immediate) {
    if (!promo) return;
    const pr = promo; promo = null;
    pr.dead = true; if (pr.raf) cancelAnimationFrame(pr.raf); clearTimeout(pr.timer);
    if (immediate) { pr.root.remove(); return; }
    pr.root.classList.add('rk-out');
    setTimeout(() => pr.root.remove(), 950);
  }

  function makeFrags(txt, fs) {
    const cv = document.createElement('canvas'), x = cv.getContext('2d');
    const font = '700 ' + fs + 'px ' + FONT_STACK;
    x.font = font;
    const w = Math.ceil(x.measureText(txt).width + 24), h = Math.ceil(fs * 1.25);
    cv.width = w; cv.height = h;
    x.font = font; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.fillStyle = '#fff'; x.fillText(txt, w / 2, h / 2 + fs * 0.04);
    const cell = Math.max(4, Math.round(fs / 24)), data = x.getImageData(0, 0, w, h).data, fr = [];
    for (let y = 0; y < h; y += cell) for (let xx = 0; xx < w; xx += cell) {
      const px = Math.min(w - 1, xx + (cell >> 1)), py = Math.min(h - 1, y + (cell >> 1));
      if (data[(py * w + px) * 4 + 3] > 110) fr.push({ hx: xx + cell / 2 - w / 2, hy: y + cell / 2 - h / 2 });
    }
    return { frags: fr, cell, w, h };
  }

  function playPromotion(fromId, toId) {
    if (typeof document === 'undefined' || !document.body) return;
    injectStyle(); closePromotion(true);
    // la police des lettres doit être prête avant de découper les fragments (sinon repli après 500 ms)
    let started = false;
    const go = () => { if (started) return; started = true; try { runPromotion(fromId, toId); } catch (e) { console.error('[progression] promotion', e); } };
    try {
      if (document.fonts && document.fonts.load) {
        Promise.race([document.fonts.load('700 100px "Chakra Petch"'), new Promise((r) => setTimeout(r, 500))]).then(go, go);
        setTimeout(go, 650);
      } else go();
    } catch (e) { go(); }
  }

  function runPromotion(fromId, toId) {
    closePromotion(true);
    const to = rankDef(toId), from = rankDef(fromId);
    const toCol = rkColor(to.id), fromCol = rkColor(from.id);
    try { G.sfx && G.sfx.play('levelup'); } catch (e) { /* ignore */ }
    try { const pl = G.SkillAPI && G.SkillAPI.inRun && G.SkillAPI.inRun() && G.SkillAPI.player(); if (pl && pl.hero && G.VFX && G.VFX.rankUp) G.VFX.rankUp(pl.hero, toId); } catch (e) { /* ignore */ }

    const rw = to.rewards || {}, tt = rw.title && titleDef(rw.title);
    const rows = rewardRows(rw, tt);
    const root = document.createElement('div');
    root.className = 'rk-promo'; root.style.setProperty('--rkc', toCol);
    root.innerHTML = '<canvas class="rk-promo-cv"></canvas>'
      + '<div class="rk-promo-txt"><div class="rk-promo-t2">Promotion de rang</div><div class="rk-promo-t1">' + esc(to.name) + '</div><div class="rk-promo-t3">' + esc(to.short || '') + '</div></div>';
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('rk-in'));
    const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    const land = H < 560 && W > H;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const cx = land ? W * 0.3 : W / 2, cy = land ? H * 0.42 : H * 0.34;
    if (land) { const t = root.querySelector('.rk-promo-txt'); t.style.right = 'auto'; t.style.width = '60%'; t.style.top = '62%'; }
    const fs = Math.min(land ? H * 0.5 : H * 0.34, ((land ? W * 0.5 : W) * 0.8) / Math.max(1, to.id.length * 0.75));
    const A = makeFrags(from.id, fs), Bf = makeFrags(to.id, fs);
    const diag = Math.hypot(W, H), rm = reducedMotion();
    A.frags.forEach((f) => { const a = Math.atan2(f.hy, f.hx) + (Math.random() - 0.5) * 1.2, v = diag * (0.25 + Math.random() * 0.45); f.vx = Math.cos(a) * v; f.vy = Math.sin(a) * v; f.rot = (Math.random() - 0.5) * 14; });
    Bf.frags.forEach((f) => { const a = Math.random() * 6.283, d = diag * (0.35 + Math.random() * 0.4); f.sx = Math.cos(a) * d; f.sy = Math.sin(a) * d; f.rot = (Math.random() - 0.5) * 16; f.dl = Math.random() * 0.35; });
    const parts2 = []; let burst = false, sfx2 = false, recap = false;
    const t0 = performance.now();
    const pr = { root, raf: 0, dead: false, timer: 0 }; promo = pr;
    const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    let last = t0, rayA = 0;

    function showRecap() {
      recap = true;
      const w = document.createElement('div'); w.className = 'rk-recapw';
      w.innerHTML = '<div class="ds-window rk-recap"><div class="rk-rh">' + ico('trophy', 16) + 'Récompenses de rang</div><div class="rk-rb">'
        + (rows.length ? rows.map((r, i) => '<div class="ds-stat" style="--i:' + i + '"><span class="ds-stat__label">' + ico(r[0], 16) + esc(r[1]) + '</span><b class="ds-stat__value">' + esc(r[2]) + '</b></div>').join('') : '<div class="ds-stat"><span class="ds-stat__label">Aucune récompense supplémentaire</span></div>')
        + '</div><div class="rk-rf"><button type="button" class="ds-btn ds-btn--primary ds-btn--block">Continuer</button></div></div>';
      root.appendChild(w);
      w.querySelector('button').addEventListener('click', () => closePromotion());
      pr.timer = setTimeout(() => closePromotion(), 12000);
      try { G.sfx && G.sfx.play('gold'); } catch (e) { /* ignore */ }
    }

    function frame(now) {
      if (pr.dead) return;
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      // rayons
      if (t > 1.3) {
        const k = clamp((t - 1.3) / 1.2, 0, 1) * (t > 4.6 ? clamp(1 - (t - 4.6) / 1.8, 0, 1) : 1);
        rayA += dt * 0.35; ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
        const n = 16, len = diag * 0.75;
        for (let i = 0; i < n; i++) {
          ctx.save(); ctx.rotate(rayA + (i / n) * 6.283);
          const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, toCol); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.16 * k * (0.6 + 0.4 * Math.sin(t * 3 + i)); ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, -len * 0.035); ctx.lineTo(len, len * 0.035); ctx.fill(); ctx.restore();
        }
        ctx.restore();
      }
      ctx.save(); ctx.translate(cx, cy);
      const cs = A.cell;
      if (t < 1.0) {                                // ancienne lettre qui tremble et se fissure
        const sh = t > 0.5 ? (t - 0.5) * 14 : 0, a = clamp(t / 0.4, 0, 1);
        ctx.globalAlpha = a; ctx.fillStyle = fromCol;
        ctx.save(); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        A.frags.forEach((f) => ctx.fillRect(f.hx - cs / 2, f.hy - cs / 2, cs, cs));
        if (t > 0.6) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = clamp((t - 0.6) / 0.3, 0, 1); ctx.beginPath(); ctx.moveTo(-A.w * 0.1, -A.h * 0.4); ctx.lineTo(A.w * 0.04, -A.h * 0.05); ctx.lineTo(-A.w * 0.06, A.h * 0.1); ctx.lineTo(A.w * 0.12, A.h * 0.4); ctx.stroke(); }
        ctx.restore();
      } else if (t < 2.0) {                         // éclatement
        const k = t - 1.0, a = clamp(1 - k / 0.9, 0, 1);
        if (a > 0) {
          ctx.fillStyle = fromCol; ctx.globalAlpha = a;
          A.frags.forEach((f) => { const e = ease(k / 0.9); ctx.save(); ctx.translate(f.hx + f.vx * e, f.hy + f.vy * e + 180 * k * k); ctx.rotate(f.rot * e); ctx.fillRect(-cs / 2, -cs / 2, cs, cs); ctx.restore(); });
        }
      }
      if (t > 1.3 && t < 3.0) {                     // reformation (puis remplacée par la lettre pleine)
        const bc = Bf.cell; ctx.fillStyle = toCol; ctx.shadowColor = toCol; ctx.shadowBlur = t > 2.6 ? 22 : 0;
        Bf.frags.forEach((f) => {
          const e = ease((t - 1.3 - f.dl) / 1.1), inv = 1 - e;
          ctx.globalAlpha = clamp(e * 1.4, 0, 1);
          ctx.save(); ctx.translate(f.hx + f.sx * inv, f.hy + f.sy * inv); ctx.rotate(f.rot * inv); ctx.fillRect(-bc / 2, -bc / 2, bc + 0.5, bc + 0.5); ctx.restore();
        });
        ctx.shadowBlur = 0;
      }
      if (t > 2.6) {                                // lettre pleine + halo
        const k = clamp((t - 2.6) / 0.4, 0, 1);
        ctx.globalAlpha = k; ctx.fillStyle = toCol; ctx.shadowColor = toCol; ctx.shadowBlur = 30 + 14 * Math.sin(t * 4);
        ctx.font = '700 ' + fs + 'px ' + FONT_STACK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(to.id, 0, fs * 0.04); ctx.shadowBlur = 0;
      }
      ctx.restore();
      // onde de choc + flash + particules à l'impact
      if (t >= 2.5 && !burst) {
        burst = true;
        const n = (rm ? 20 : 70) + Math.round(num(to.aura && to.aura.particles, 0));
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 120 + Math.random() * 380; parts2.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.8 + Math.random() * 1.2, age: 0, s: 1.5 + Math.random() * 3 }); }
      }
      if (t >= 2.5 && !sfx2) { sfx2 = true; try { G.sfx && G.sfx.play('super'); } catch (e) { /* ignore */ } }
      if (t > 2.5) {
        const k = t - 2.5; ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = toCol; ctx.lineWidth = 6 * (1 - clamp(k / 1.1, 0, 1)) + 0.5; ctx.globalAlpha = clamp(1 - k / 1.1, 0, 1);
        ctx.beginPath(); ctx.arc(cx, cy, k * diag * 0.55, 0, 6.283); ctx.stroke();
        if (k < 0.35 && !rm) { ctx.globalAlpha = (1 - k / 0.35) * 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
      }
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = toCol;
      for (let i = parts2.length - 1; i >= 0; i--) {
        const q = parts2[i]; q.age += dt; if (q.age > q.life) { parts2.splice(i, 1); continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 140 * dt; q.vx *= 0.99;
        ctx.globalAlpha = clamp(1 - q.age / q.life, 0, 1); ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (t > 3.3 && !recap) showRecap();
      if (t < 6.5) pr.raf = requestAnimationFrame(frame);   // ensuite : dernière image figée (lettre pleine)
    }
    pr.raf = requestAnimationFrame(frame);
  }
  G.bus && G.bus.on('rankUp', (d) => { if (d && d.to) playPromotion(d.from || 'E', d.to); });
  // ====================================================================
  // 6. AURA DU HÉROS EN DONJON
  // ====================================================================
  let aura = null;
  function removeAura() {
    if (!aura) return;
    try { aura.group.parent && aura.group.parent.remove(aura.group); aura.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } catch (e) { /* ignore */ }
    aura = null;
  }
  function buildAura(hero, rid) {
    if (typeof THREE === 'undefined' || !hero) return;
    const rk = rankDef(rid), a = rk.aura || {}, ri = rankIndex(rid);
    if (!ri || !(a.intensity > 0)) return;
    const col = new THREE.Color(rk.color), group = new THREE.Group();
    group.name = 'rk-aura';
    const rings = [];
    for (let i = 0; i < Math.max(1, a.rings || 1); i++) {
      const r0 = a.radius * (0.8 + i * 0.22);
      const m = new THREE.Mesh(new THREE.RingGeometry(r0 - 0.05, r0, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 * a.intensity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.06 + i * 0.01; group.add(m); rings.push(m);
    }
    let pts = null, n = Math.min(48, a.particles || 0);
    if (n > 0) {
      const pos = new Float32Array(n * 3);
      pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: col, size: 0.14, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pts.frustumCulled = false; group.add(pts);
    }
    let col2 = null;
    if (ri >= 4) {   // A+ : colonne d'énergie translucide
      col2 = new THREE.Mesh(new THREE.CylinderGeometry(a.radius * 0.7, a.radius * 0.95, 2.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1 + 0.05 * (ri - 4), side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      col2.position.y = 1.1; group.add(col2);
    }
    hero.add(group);
    aura = { group, rings, pts, n, a, col2, t: 0 };
  }
  function updateAura(dt) {
    if (!aura) return;
    const A = aura; A.t += dt;
    A.rings.forEach((m, i) => { m.rotation.z += dt * (0.8 + i * 0.5) * (i % 2 ? -1 : 1); const s = 1 + 0.06 * Math.sin(A.t * 3 + i); m.scale.set(s, s, 1); });
    if (A.pts) {
      const p = A.pts.geometry.attributes.position.array;
      for (let i = 0; i < A.n; i++) {
        const ang = A.t * (0.9 + (i % 5) * 0.12) + i * 2.399, rad = A.a.radius * (0.7 + 0.35 * ((i * 7) % 5) / 5), y = ((A.t * 0.55 + i / A.n) % 1) * 2.0;
        p[i * 3] = Math.cos(ang) * rad; p[i * 3 + 1] = y; p[i * 3 + 2] = Math.sin(ang) * rad;
      }
      A.pts.geometry.attributes.position.needsUpdate = true;
    }
    if (A.col2) A.col2.material.opacity = (0.1 + 0.05 * Math.sin(A.t * 2.5)) * 1.3;
  }
  G.bus && G.bus.on('runStart', (d) => {
    removeAura();
    const p = curProfile(); if (!p) return;
    Progress.ensureProfile(p); hudRank(p.rank);
    let hero = null;
    try { hero = (d && d.run && d.run.player && d.run.player.hero) || (G.SkillAPI && G.SkillAPI.player && G.SkillAPI.player().hero); } catch (e) { /* ignore */ }
    if (!hero) return;
    const rk = rankDef(p.rank);
    try { if (G.VFX && G.VFX.aura && rankIndex(p.rank) > 0) G.VFX.aura(hero, rk.color, 2); } catch (e) { /* ignore */ }
    buildAura(hero, p.rank);
  });
  G.bus && G.bus.on('tick', (d) => updateAura(num(d && d.dt, 0.016)));
  G.bus && G.bus.on('runEnd', (d) => { removeAura(); handle('runEnd', d); });

  // ====================================================================
  // 7. PANNEAUX
  // ====================================================================
  const fmtPct = (v) => (Math.round(v * 1000) / 10).toString().replace('.', ',') + ' %';
  const fmt = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const mult = (v) => '×' + (Math.round(v * 100) / 100).toString().replace('.', ',');
  const fmtInt = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  function startTrial(p, trial) {
    let portal = null;
    try {
      if (G.Portals && G.Portals.makeTrialPortal) portal = G.Portals.makeTrialPortal(p, trial);
      else if (G.Portals && G.Portals.list) portal = (G.Portals.list(p) || []).find((x) => x.type === 'epreuve' && (x.trialId === trial.id || x.rank === trial.rank)) || null;
    } catch (e) { portal = null; }
    G.bus && G.bus.emit('trialRequested', { trial, profile: p });
    if (portal && G.game && G.game.enterPortal) { G.game.enterPortal(portal); return true; }
    notify('Le portail d’épreuve n’est pas encore disponible. Cherchez-le dans l’onglet Portails.', 'rare', '📜');
    return false;
  }

  function constraintsText(k) {
    const o = [];
    if (k.timeLimit) o.push('⏱ ' + Math.floor(k.timeLimit / 60) + ' min ' + (k.timeLimit % 60 ? (k.timeLimit % 60) + ' s' : ''));
    if (k.survive) o.push('🌊 tenir ' + k.survive.seconds + ' s de vagues sans fin');
    if (k.noPotions) o.push('🚫 aucune potion');
    if (k.noDash) o.push('🚫 aucune roulade');
    if (k.maxHits != null) o.push('💔 ' + k.maxHits + ' coups max');
    if (k.noHealDrops) o.push('🚫 pas de soin au sol');
    if (k.oneLife) o.push('☠ une seule vie');
    if (k.bossBuff) o.push('👹 boss renforcé (PV ×' + k.bossBuff.hp + ', dégâts ×' + k.bossBuff.dmg + ')');
    return o;
  }

  // ---------------- Héros & Rang ----------------
  const ATTR_ICON = { force: 'sword', vitesse: 'lightning', defense: 'shield', vitalite: 'heart', intelligence: 'mana' };
  const sgn = (v, s) => (v < 0 ? '−' : '+') + s;
  const dMult = (v) => sgn(v, (Math.round(Math.abs(v) * 100) / 100).toString().replace('.', ','));
  const dNum = (v) => sgn(v, fmt(Math.abs(v)));
  const dPct = (v) => sgn(v, fmtPct(Math.abs(v)));
  // groupes de statistiques : [libellé, lecture, format, format du gain]
  const STAT_GROUPS = [
    { t: 'Attaque', c: '', icon: 'sword', rows: [
      ['Force', (s) => s.force, fmt, dNum], ['Intelligence', (s) => s.intelligence, fmt, dNum], ['Critique', (s) => s.crit, fmtPct, dPct], ['Dégâts crit.', (s) => s.critDmg, mult, dMult],
      ['Dég. physiques', (s) => s.dmg.physique, mult, dMult], ['Dég. élémentaires', (s) => Math.max(s.dmg.feu, s.dmg.glace, s.dmg.foudre), mult, dMult], ['Dég. serviteurs', (s) => s.minionDmg, mult, dMult, (s) => s.minionCap > 0]] },
    { t: 'Défense', c: 'd', icon: 'shield', rows: [
      ['PV max', (s) => s.pvMax, fmtInt, dNum], ['Défense', (s) => s.defense, fmt, dNum, null, (s) => ' (−' + fmtPct(s.damageReduction) + ')'], ['Esquive', (s) => s.dodge, fmtPct, dPct], ['Vol de vie', (s) => s.lifesteal, fmtPct, dPct]] },
    { t: 'Utilité', c: 'u', icon: 'sparkles', rows: [
      ['Mana', (s) => s.manaMax, fmtInt, dNum], ['Régén. mana', (s) => s.manaRegen, (v) => fmt(v) + '/s', dNum], ['Vitesse', (s) => s.vitesse, fmt, dNum], ['Récup. sorts', (s) => s.cdr, fmtPct, dPct],
      ['Serviteurs', (s) => s.minionCap, fmtInt, dNum, (s) => s.minionCap > 0], ['Bonus d’XP', (s) => s.xpMult, mult, dMult], ['Bonus d’or', (s) => s.goldMult, mult, dMult], ['Chance de butin', (s) => s.lootLuck, (v) => '+' + fmtPct(v), dPct]] },
  ];
  const pendMap = new WeakMap();
  let lastPower = null;
  function countUp(el, to, from, ms) {
    if (!el) return;
    if (reducedMotion() || from == null || from === to) { el.textContent = fmtInt(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtInt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderHeros(container, p) {
    injectStyle();
    Progress.ensureProfile(p);
    const pend = pendMap.get(p) || {}; pendMap.set(p, pend);
    let spent = 0; ATTRS.forEach((k) => { pend[k] = Math.max(0, pend[k] || 0); spent += pend[k]; });
    if (spent > p.attrPoints) { ATTRS.forEach((k) => { pend[k] = 0; }); spent = 0; }
    const free = p.attrPoints - spent;
    const st = compute(p), rk = rankDef(p.rank), ri = rankIndex(p.rank), nx = Ranks.next(p.rank);
    let pv = st;
    if (spent > 0) { const att = Object.assign({}, p.attributes); ATTRS.forEach((k) => { att[k] = (att[k] || 0) + pend[k]; }); pv = compute(Object.assign({}, p, { attributes: att, attrPoints: free })); }
    const XP = G.DATA && G.DATA.XP, need = XP && p.niveau < maxLevel() ? XP.forLevel(p.niveau) : 0;
    const xpPct = need ? clamp(num(p.xp, 0) / need * 100, 0, 100) : 100;
    const cls = (G.CLASSES && G.CLASSES[p.classe]) || (G.DATA && G.DATA.CLASSES && G.DATA.CLASSES[p.classe]) || {};
    let evo = ''; try { (cls.evolutions || []).forEach((e) => { if (rankIndex(e.rank) <= ri) evo = e.name; }); } catch (e) { /* ignore */ }
    const title = p.activeTitle && titleDef(p.activeTitle);
    const reqs = Ranks.nextRequirements(p), done = reqs.filter((r) => r.done).length;
    const trial = Ranks.eligibleForTrial(p), pending = Ranks.pendingPromotion(p);
    const nd = nx ? rankDef(nx) : null;
    const col = rkColor(rk.id);
    let h = '<div class="rk-wrap rk-heros" style="--rkc:' + col + '">';

    // --- carte héros
    h += '<div class="rk-panel rk-hero"><div class="rk-aura rk-r' + ri + '" style="--ri:' + ri + '"><span class="rk-orbit"></span><span class="rk-ring"></span><span class="rk-ring b"></span>';
    if (ri >= 3) for (let i = 0; i < 6; i++) h += '<i style="margin-left:' + (-34 + i * 14) + 'px;--dx:' + ((i % 2 ? 1 : -1) * (6 + i * 3)) + 'px;animation-delay:' + (i * 0.5) + 's"></i>';
    h += rankBadge(rk.id, 'xl') + '</div>';
    h += '<div class="rk-info"><div class="rk-name">' + esc(p.nom) + '</div>';
    h += '<div class="rk-rankline"><b>' + esc(rk.name) + '</b><span>' + esc(evo || p.classe) + '</span>' + (title ? '<span class="ds-badge ds-badge--gold">' + esc(title.name) + '</span>' : '') + '</div>';
    h += '<div class="rk-lvl"><span>Niveau <b>' + p.niveau + '</b></span><small>' + (need ? Math.round(p.xp) + ' / ' + need + ' XP' : 'Niveau max') + '</small></div>';
    h += '<div class="ds-bar ds-bar--xp"><div class="ds-bar__fill" style="width:' + xpPct + '%"></div></div>';
    h += '<div class="rk-pow">' + ico('lightning', 16) + 'Puissance <b data-rk-pow>' + fmtInt(lastPower == null ? 0 : lastPower) + '</b>' + (spent > 0 && pv.power !== st.power ? '<em>' + sgn(pv.power - st.power, fmtInt(Math.abs(pv.power - st.power))) + '</em>' : '') + '</div>';
    h += '<div class="rk-sub">' + esc(rk.desc || '') + '</div></div></div>';

    // --- progression vers le rang suivant
    h += '<div class="rk-panel" style="--rkc:' + (nd ? rkColor(nd.id) : col) + '"><div class="ds-section-title">' + (nd ? 'Prochain rang' : 'Rang maximal') + '</div>';
    if (nd) {
      h += '<div class="rk-next">' + rankBadge(nd.id, 'lg') + '<div class="rk-nt"><b style="color:' + rkColor(nd.id) + '">' + esc(nd.name) + '</b><span>' + done + ' / ' + reqs.length + ' conditions remplies</span><div class="ds-bar" style="margin-top:7px"><div class="ds-bar__fill" style="width:' + Math.round(done / reqs.length * 100) + '%;background:' + rkColor(nd.id) + '"></div></div></div></div>';
      h += '<div class="rk-reqs">';
      reqs.forEach((r) => {
        const cnt = r.need > 1 && r.key !== 'trial';
        const pct = r.done ? 100 : clamp(r.cur / Math.max(1, r.need) * 100, 0, 100);
        h += '<div class="rk-req ' + (r.done ? 'ok' : 'ko') + '"><span class="rk-ck">' + ico(r.done ? 'check' : 'lock', 14) + '</span><span class="rk-rl">' + esc(r.label) + '</span><span class="rk-rc">' + (cnt ? Math.min(Math.round(r.cur), r.need) + ' / ' + r.need : (r.done ? 'OK' : '')) + '</span>'
          + (cnt && !r.done ? '<div class="ds-bar"><div class="ds-bar__fill" style="width:' + pct + '%"></div></div>' : '') + '</div>';
      });
      h += '</div>';
      const t = Ranks.trialForRank(nx);
      if (t) {
        const cc = constraintsText(t.constraints || {});
        h += '<div class="rk-trial">' + ico('scroll', 20) + '<div><b>' + esc(t.name) + '</b><span class="rk-sub">' + esc(t.desc) + '</span>' + (cc.length ? '<div class="rk-chips">' + cc.map((x) => '<span class="ds-chip">' + esc(x) + '</span>').join('') + '</div>' : '') + '</div></div>';
      }
      if (pending) h += '<button type="button" class="ds-btn ds-btn--gold ds-btn--lg ds-btn--block rk-go" data-rk="promote"><span class="ds-btn__icon">' + ico('star', 18) + '</span>Valider la promotion</button>';
      else if (trial) h += '<button type="button" class="ds-btn ds-btn--gold ds-btn--lg ds-btn--block rk-go" data-rk="trial"><span class="ds-btn__icon">' + ico('sword', 18) + '</span>Lancer l’épreuve de promotion</button>';
      else h += '<div class="rk-sub" style="text-align:center">Remplissez toutes les conditions pour débloquer l’épreuve.</div>';
    } else h += '<div class="rk-sub">Vous avez atteint le sommet : le Rang Souverain.</div>';
    h += '<div class="rk-msg" data-rk-msg></div></div>';

    // --- attributs
    h += '<div class="rk-panel"><div class="ds-section-title">Attributs<span class="ds-section-title__aside rk-pts">' + ico('plus', 13) + free + ' point' + (free > 1 ? 's' : '') + ' à répartir</span></div>';
    ATTRS.forEach((k) => {
      const e = ATTR_EFFECTS[k], pn = pend[k] || 0;
      h += '<div class="rk-attr"><span class="rk-ai">' + ico(ATTR_ICON[k] || 'star', 18) + '</span><div class="rk-an"><b>' + e.label + '</b><small>' + esc(e.text) + '</small></div>'
        + '<button type="button" class="ds-icon-btn ds-icon-btn--round" data-rk="sub" data-a="' + k + '" aria-label="Retirer un point de ' + e.label + '"' + (pn > 0 ? '' : ' disabled') + '>' + ico('minus', 18) + '</button>'
        + '<span class="rk-av">' + (p.attributes[k] + pn) + (pn > 0 ? '<em>+' + pn + '</em>' : '') + '</span>'
        + '<button type="button" class="ds-icon-btn ds-icon-btn--round" data-rk="add" data-a="' + k + '" aria-label="Ajouter un point à ' + e.label + '"' + (free > 0 ? '' : ' disabled') + '>' + ico('plus', 18) + '</button></div>';
    });
    h += '<div class="rk-acts">';
    if (spent > 0) h += '<button type="button" class="ds-btn ds-btn--primary" data-rk="apply"><span class="ds-btn__icon">' + ico('check', 16) + '</span>Valider (' + spent + ')</button><button type="button" class="ds-btn ds-btn--secondary" data-rk="cancel">Annuler</button>';
    h += '<button type="button" class="ds-btn ds-btn--ghost" data-rk="respec">' + ico('refresh', 15) + '&nbsp;Réinitialiser · ' + Progress.respecCost(p) + ' ' + ico('gold', 14) + '</button></div></div>';

    // --- statistiques détaillées
    h += '<div class="rk-panel rk-stats"><div class="ds-section-title">Statistiques' + (spent > 0 ? '<span class="ds-section-title__aside rk-pts" style="color:var(--ds-success,#39e08c)">aperçu</span>' : '') + '</div><div class="rk-sg">';
    STAT_GROUPS.forEach((g) => {
      h += '<div><h5 class="' + g.c + '">' + ico(g.icon, 14) + g.t + '</h5><div class="ds-stat-grid" style="grid-template-columns:1fr">';
      g.rows.forEach((r) => {
        if (r[4] && !r[4](st)) return;
        const a = num(r[1](st), 0), b = num(r[1](pv), 0), d = b - a, up = Math.abs(d) > 1e-6;
        h += '<div class="ds-stat' + (up ? ' is-up' : '') + '"><span class="ds-stat__label">' + r[0] + '</span><b class="ds-stat__value">' + r[2](b) + (r[5] ? r[5](pv) : '') + (up ? '<small>' + r[3](d) + '</small>' : '') + '</b></div>';
      });
      h += '</div></div>';
    });
    h += '</div></div>';

    // --- titre actif
    h += '<div class="rk-panel"><div class="ds-section-title">Titre actif</div><div class="rk-titles">';
    h += '<button type="button" class="rk-tt' + (p.activeTitle === null ? ' is-on' : '') + '" data-rk="title" data-t="">Aucun</button>';
    p.titles.forEach((id) => { const t = titleDef(id); if (t) h += '<button type="button" class="rk-tt' + (p.activeTitle === id ? ' is-on' : '') + '" data-rk="title" data-t="' + esc(id) + '" title="' + esc(t.desc) + '">' + (p.activeTitle === id ? ico('check', 13) : '') + esc(t.name) + '</button>'; });
    h += '</div>' + (title ? '<div class="rk-sub" style="margin-top:10px">' + esc(title.desc || '') + '</div>' : '') + '</div>';

    // --- historique (timeline)
    h += '<div class="rk-panel"><div class="ds-section-title">Historique des promotions</div><div class="rk-tl">';
    p.rankHistory.slice().reverse().forEach((e) => {
      h += '<div style="--c:' + rkColor(e.rank) + '"><b>' + esc(rankDef(e.rank).name) + '</b><small>' + new Date(e.at).toLocaleDateString('fr-FR') + ' · ' + esc(e.how === 'depart' ? 'départ' : e.how === 'trial' ? 'épreuve réussie' : e.how) + '</small></div>';
    });
    h += '</div></div></div>';
    container.innerHTML = h;
    countUp(container.querySelector('[data-rk-pow]'), pv.power, lastPower, 900);
    lastPower = pv.power;
    container.onclick = (ev) => {
      const b = ev.target.closest && ev.target.closest('[data-rk]'); if (!b || b.disabled) return;
      const act = b.getAttribute('data-rk'), msg = container.querySelector('[data-rk-msg]'), a = b.getAttribute('data-a');
      if (act === 'add') { if (p.attrPoints - ATTRS.reduce((s, k) => s + (pend[k] || 0), 0) > 0) { pend[a] = (pend[a] || 0) + 1; lastPower = st.power; renderHeros(container, p); } }
      else if (act === 'sub') { if (pend[a] > 0) { pend[a]--; lastPower = st.power; renderHeros(container, p); } }
      else if (act === 'cancel') { ATTRS.forEach((k) => { pend[k] = 0; }); lastPower = st.power; renderHeros(container, p); }
      else if (act === 'apply') {
        let bad = null; ATTRS.forEach((k) => { if (pend[k] > 0 && !bad) { const r = Progress.allocate(p, k, pend[k]); if (!r.ok) bad = r; } pend[k] = 0; });
        try { G.sfx && G.sfx.play('upgrade'); } catch (e) { /* ignore */ }
        lastPower = st.power;
        if (bad && msg) msg.textContent = bad.reason; else renderHeros(container, p);
      }
      else if (act === 'respec') { const r = Progress.respec(p); if (!r.ok && msg) msg.textContent = r.reason; else { ATTRS.forEach((k) => { pend[k] = 0; }); lastPower = st.power; renderHeros(container, p); } }
      else if (act === 'title') { Progress.equipTitle(p, b.getAttribute('data-t') || null); renderHeros(container, p); }
      else if (act === 'promote') { const r = Ranks.promote(p, 'trial'); if (!r.ok && msg) msg.textContent = r.reason; else renderHeros(container, p); }
      else if (act === 'trial') { const t = Ranks.eligibleForTrial(p); if (t) startTrial(p, t); }
    };
  }

  // ---------------- Succès ----------------
  const ACH_CATS = [
    { id: 'all', label: 'Tous' },
    { id: 'combat', label: 'Combat', stats: ['kills', 'eliteKills', 'bossKills', 'crits', 'maxHit', 'parries', 'dodges', 'skillCasts', 'minionKills', 'losses'] },
    { id: 'portails', label: 'Portails', stats: ['runsWon', 'clearedCount', 'redWins', 'roomsCleared', 'fastWins', 'flawless', 'secrets'] },
    { id: 'butin', label: 'Butin', stats: ['epicLoot', 'legendLoot', 'mythicLoot', 'goldLoot'] },
    { id: 'progres', label: 'Progression', stats: null },
    { id: 'titres', label: 'Titres' },
  ];
  const achCat = (a) => { for (const c of ACH_CATS) if (c.stats && c.stats.indexOf(a.stat) >= 0) return c.id; return 'progres'; };
  let achTab = 'all';

  function renderSucces(container, p) {
    injectStyle();
    Progress.ensureProfile(p); checkAchievements(p, true);
    const list = Progress.achievements(p), nDone = list.filter((a) => a.done).length;
    const titles = Progress.titles(p), nTitles = titles.filter((t) => t.owned).length;
    const countOf = (id) => id === 'all' ? list.length : id === 'titres' ? titles.length : list.filter((a) => achCat(a) === id).length;
    let h = '<div class="rk-wrap">';
    h += '<div class="rk-panel rk-top"><div class="rk-big">' + nDone + '<small> / ' + list.length + '</small></div><div class="rk-tx"><div class="rk-lvl"><span>Succès obtenus</span><small>' + Math.round(nDone / Math.max(1, list.length) * 100) + ' %</small></div>'
      + '<div class="ds-bar ds-bar--gold"><div class="ds-bar__fill" style="width:' + Math.round(nDone / Math.max(1, list.length) * 100) + '%"></div></div>'
      + '<div class="rk-sub">' + ico('crown', 13) + ' <b>' + nTitles + '</b> / ' + titles.length + ' titres débloqués</div></div></div>';
    h += '<div class="ds-tabs" role="tablist">' + ACH_CATS.map((c) => '<button type="button" role="tab" class="ds-tab' + (achTab === c.id ? ' is-active' : '') + '" data-rk="tab" data-t="' + c.id + '" aria-selected="' + (achTab === c.id) + '">' + c.label + '<i>' + countOf(c.id) + '</i></button>').join('') + '</div>';
    if (achTab === 'titres') {
      h += '<div class="rk-tcards">';
      titles.forEach((t) => {
        h += '<button type="button" class="rk-tc' + (t.active ? ' is-on' : '') + (t.owned ? '' : ' rk-lock') + '" data-rk="title" data-t="' + esc(t.id) + '"><b>' + (t.owned ? ico('crown', 14) : ico('lock', 14)) + esc(t.name) + '</b><span>' + esc(t.desc || '') + '</span>'
          + (t.active ? '<span class="ds-badge ds-badge--gold rk-tag">Actif</span>' : '') + '</button>';
      });
      h += '</div><div class="rk-sub">Un titre actif donne un petit bonus. Touchez un titre débloqué pour l’équiper.</div>';
    } else {
      const rows = list.filter((a) => achTab === 'all' || achCat(a) === achTab);
      rows.sort((a, b) => (a.done - b.done) || ((b.done ? 0 : b.cur / b.n) - (a.done ? 0 : a.cur / a.n)));
      h += '<div class="rk-alist">';
      rows.forEach((a, i) => {
        const hide = a.secret && !a.done, r = a.reward || {}, rt = [];
        if (r.gold) rt.push('<span class="ds-chip rk-g">' + ico('gold', 12) + fmtInt(r.gold) + '</span>');
        if (r.attrPoints) rt.push('<span class="ds-chip rk-c">' + ico('user', 12) + '+' + r.attrPoints + ' attribut</span>');
        if (r.skillPoints) rt.push('<span class="ds-chip rk-c">' + ico('sparkles', 12) + '+' + r.skillPoints + ' compétence</span>');
        if (r.title && titleDef(r.title)) rt.push('<span class="ds-chip rk-v">' + ico('crown', 12) + esc(titleDef(r.title).name) + '</span>');
        h += '<div class="rk-ach' + (a.done ? ' rk-done' : '') + (hide ? ' rk-secret' : '') + '" style="animation-delay:' + Math.min(i, 10) * 25 + 'ms"><div class="rk-ai">' + (hide ? ico('lock', 20) : esc(a.icon)) + '</div><div class="rk-at"><div class="rk-an2">' + (hide ? '???' : esc(a.name)) + '</div><div class="rk-ad">' + (hide ? 'Succès secret.' : esc(a.desc)) + '</div>';
        if (!a.done && !hide) h += '<div class="rk-pr"><div class="ds-bar"><div class="ds-bar__fill" style="width:' + Math.round(a.cur / a.n * 100) + '%"></div></div><span>' + fmtInt(a.cur) + ' / ' + fmtInt(a.n) + '</span></div>';
        if (!hide) h += '<div class="rk-rw">' + rt.join('') + '</div>';
        h += '</div>' + (a.done ? '<span class="ds-badge ds-badge--gold rk-st">' + ico('check', 12) + 'Réclamé</span>' : '') + '</div>';
      });
      if (!rows.length) h += '<div class="ds-empty">Aucun succès dans cette catégorie.</div>';
      h += '</div>';
    }
    h += '</div>';
    container.innerHTML = h;
    container.onclick = (ev) => {
      const b = ev.target.closest && ev.target.closest('[data-rk]'); if (!b) return;
      const act = b.getAttribute('data-rk');
      if (act === 'tab') { achTab = b.getAttribute('data-t'); renderSucces(container, p); }
      else if (act === 'title') { const id = b.getAttribute('data-t'); if (Progress.equipTitle(p, id || null)) renderSucces(container, p); }
    };
  }

  function registerPanels() {
    const reg = (def) => { try { if (G.UI && G.UI.registerPanel) G.UI.registerPanel(def); else if (G.Panels) G.Panels.register(def.id, def); } catch (e) { console.error('[progression] panneau', e); } };
    reg({
      id: 'heros', title: 'Héros & Rang', icon: '🛡️', order: 2,
      visible: () => true,
      badge: (p) => { try { if (!p) return ''; Progress.ensureProfile(p); return p.attrPoints > 0 ? String(p.attrPoints) : (Ranks.eligibleForTrial(p) || Ranks.pendingPromotion(p) ? '!' : ''); } catch (e) { return ''; } },
      render: (container, profile) => renderHeros(container, profile || curProfile() || {}),
    });
    reg({
      id: 'succes', title: 'Succès', icon: '🏆', order: 8,
      visible: () => true,
      render: (container, profile) => renderSucces(container, profile || curProfile() || {}),
    });
  }
  registerPanels();
})();
