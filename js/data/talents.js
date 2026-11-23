/* =====================================================================
 *  Donjon Arena 3D v3 — DONS (talents passifs)      js/data/talents.js
 *  Expose : G.TALENTS {id:def}, G.TALENT_META, G.TALENT_SYNERGIES, G.TalentKit
 *
 *  ÉQUILIBRAGE — puissance attendue par rareté (à niveau max, 1 don équipé) :
 *   commun     ≈ +15-30 % sur UNE stat ou un petit effet déclenché (poids 54,8)
 *   rare       ≈ un effet de gameplay net, ~ +10-20 % de puissance globale (28)
 *   épique     ≈ mécanique qui change la façon de jouer, ~ +20-35 % (11)
 *   légendaire ≈ pilier de build, ~ +35-50 %, souvent 1 fois par salle/run (5)
 *   mythique   ≈ évolution UNIQUE (don max + don précis), ~ +60 %, jamais tiré
 *                en butin (poids 0 hors évolution) (1 — réservé aux évolutions)
 *   secret     ≈ extrêmement rare (0,1 % par proposition), effets uniques
 *  Anti-combos infinis : TOUS les dégâts « de don » passent par K.dmg()
 *  (source 'talent:<id>', jamais critiques, budget de 60 coups/frame,
 *  profondeur de récursion ≤ 3) ; chaque effet déclenché a un recharge interne.
 *  Les dons ne se re-déclenchent jamais sur leurs propres dégâts (K.isTal).
 *
 *  Conventions de stats supposées (G.Stats) : fractions (crit 0.05 = 5 %,
 *  cdr 0.1 = -10 % recharge, lifesteal 0.05), critDmg multiplicateur additif,
 *  stats.dmg[element] = multiplicateur (1 = neutre).
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  const TALENTS = G.TALENTS = G.TALENTS || {};

  // ------------------------------------------------------------------ META
  const META = G.TALENT_META = {
    order: ['commun', 'rare', 'epique', 'legendaire', 'mythique', 'secret'],
    names: { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire', mythique: 'Mythique', secret: 'Secret' },
    colors: { commun: '#b8c0cc', rare: '#3fa9ff', epique: '#b44dff', legendaire: '#ffb020', mythique: '#ff3d6e', secret: '#00ffd0' },
    // Poids de tirage (offerChoice). Le mythique n'est PAS tirable (évolution uniquement).
    weights: { commun: 54.8, rare: 28, epique: 11, legendaire: 5, mythique: 0, secret: 0.1 },
    // Éclats gagnés si doublon
    dupShards: { commun: 5, rare: 12, epique: 25, legendaire: 50, mythique: 100, secret: 150 },
    // Coût (éclats) pour passer du niveau L à L+1 : costs[rarity][L-1]
    costs: {
      commun: [10, 20, 35, 55], rare: [20, 40, 70, 110], epique: [40, 80, 140], legendaire: [80, 160],
      mythique: [150, 300], secret: [200, 400],
    },
    maxLevels: { commun: 5, rare: 4, epique: 4, legendaire: 3, mythique: 3, secret: 3 },
    upgradeCost(rarity, level) { const a = this.costs[rarity] || []; return a[level - 1] == null ? Infinity : a[level - 1]; },
    tagNames: {
      foudre: 'Foudre', feu: 'Feu', glace: 'Glace', ombre: 'Ombre', sacre: 'Sacré', poison: 'Poison', physique: 'Physique',
      critique: 'Critique', invocation: 'Invocation', defense: 'Défense', mobilite: 'Mobilité', butin: 'Butin', sort: 'Sorts',
    },
    tagIcons: {
      foudre: '⚡', feu: '🔥', glace: '❄️', ombre: '🌑', sacre: '✨', poison: '☠️', physique: '⚔️',
      critique: '🎯', invocation: '👥', defense: '🛡️', mobilite: '💨', butin: '💰', sort: '🔮',
    },
  };

  // ------------------------------------------------------------------ KIT (outils partagés)
  const K = G.TalentKit = {
    time: 0, budget: 60, depth: 0,
    api() { const a = G.SkillAPI; return a && a.inRun && a.inRun() ? a : null; },
    flags() { return (G.Talents && G.Talents.flags) || {}; },
    v3(x, y, z) { return typeof THREE !== 'undefined' ? new THREE.Vector3(x, y, z) : { x, y, z }; },
    isTal(src) { return typeof src === 'string' && src.indexOf('talent') === 0; },
    isPlayer(t) { return !t || t === 'player' || t.isPlayer === true || (!t.def && !t.defId); },
    recompute() { try { G.game && G.game.recomputeStats && G.game.recomputeStats(); } catch (_) {} },
    // dégâts de référence pour les effets « sans coup déclencheur »
    base() {
      const a = K.api(); if (!a) return 10;
      const p = a.player() || {}, s = p.stats || {};
      return 8 + (p.level || 1) * 2.5 + Math.max(s.force || 0, s.intelligence || 0) * 0.6;
    },
    pl() { const a = K.api(); return a ? a.player() : null; },
    dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; },
    nearest(pos, r, excl) {
      const a = K.api(); if (!a) return null; let best = null, bd = r * r;
      for (const e of a.enemiesInRadius(pos, r) || []) {
        if (e.dead || (excl && excl.has(e))) continue;
        const d = K.dist2(e.pos, pos); if (d <= bd) { bd = d; best = e; }
      }
      return best;
    },
    // dégâts de don : taggés, non critiques, bornés
    dmg(id, e, amt, o) {
      const a = K.api(); if (!a || !e || e.dead || K.budget <= 0 || K.depth > 3) return 0;
      K.budget--; K.depth++;
      try { return a.damage(e, Math.max(1, Math.round(amt)), Object.assign({ source: 'talent:' + id, canCrit: false, kind: 'aoe' }, o || {})); }
      finally { K.depth--; }
    },
    boom(id, pos, r, amt, el, o) {
      const a = K.api(); if (!a) return 0; let n = 0;
      try { G.VFX && G.VFX.explosion && G.VFX.explosion(pos, r, el || 'physique'); } catch (_) {}
      for (const e of (a.enemiesInRadius(pos, r) || []).slice(0, 14)) { K.dmg(id, e, amt, Object.assign({ element: el || 'physique' }, o || {})); n++; }
      return n;
    },
    status(e, id, dur, power) { const a = K.api(); if (a && e && !e.dead) { try { a.status(e, { id, duration: dur, power: power || 1 }); } catch (_) {} } },
    has(e, st) { return !!(e && e.statuses && e.statuses[st]); },
    text(pos, txt, color, size) { const a = K.api(); if (a && a.text) a.text(pos, txt, color || '#fff', size); },
    heal(n) { const a = K.api(); if (a && n > 0) a.heal(Math.round(n)); },
    zap(a, b) { try { G.VFX && G.VFX.lightning && G.VFX.lightning(a.pos || a, b.pos || b); } catch (_) {} },
    gold(n) {
      n = Math.round(n); if (n <= 0) return;
      try {
        if (G.game && G.game.addGold) G.game.addGold(n);
        else if (G.game && G.game.profile) G.game.profile.gold = (G.game.profile.gold || 0) + n;
      } catch (_) {}
    },
    elite(e) { return !!(e && (e.elite || e.boss || (e.def && (e.def.elite || e.def.miniboss)))); },
    // stats
    mul(s, k, f) {
      if (k.indexOf('dmg.') === 0) { s.dmg = s.dmg || {}; const e = k.slice(4); s.dmg[e] = (s.dmg[e] == null ? 1 : s.dmg[e]) * f; }
      else s[k] = (s[k] || 0) * f;
    },
    add(s, k, v) {
      if (k.indexOf('dmg.') === 0) { s.dmg = s.dmg || {}; const e = k.slice(4); s.dmg[e] = (s.dmg[e] == null ? 1 : s.dmg[e]) + v; }
      else s[k] = (s[k] || 0) + v;
    },
    critAdd(s, f) { s.crit = (s.crit || 0) + (s.crit > 1.5 ? f * 100 : f); },
  };
  // un seul tick permanent (n'est PAS lié à un don) : temps de jeu + budget anti-boucle
  G.bus.on('tick', p => { K.time += (p && p.dt) || 0; K.budget = 60; K.depth = 0; });

  // petite fabrique de scope : tout ce qui est enregistré est retiré par dispose()
  function scope(id, level) {
    const sc = { id, level, alive: true, st: {}, offs: [], timers: [], cds: {}, tk: false, cleanups: [] };
    sc.on = (ev, fn) => { sc.offs.push(G.bus.on(ev, p => { if (sc.alive) fn(p || {}); })); };
    sc.hook = (n, fn, pr) => { sc.offs.push(G.hooks.add(n, (v, c) => (sc.alive ? fn(v, c || {}) : undefined), pr || 0)); };
    sc._tick = () => {
      if (sc.tk) return; sc.tk = true;
      sc.on('tick', ({ dt }) => {
        for (const t of sc.timers.slice()) {
          t.t -= dt || 0;
          if (t.t <= 0) {
            if (t.every) { t.t += t.every; t.fn(); }
            else { const i = sc.timers.indexOf(t); if (i >= 0) sc.timers.splice(i, 1); t.fn(); }
          }
        }
      });
    };
    sc.later = (s, fn) => { sc._tick(); sc.timers.push({ t: s, fn }); };
    sc.every = (s, fn, first) => { sc._tick(); sc.timers.push({ t: first == null ? s : first, fn, every: s }); };
    sc.cd = (n, s) => { if ((sc.cds[n] || -1e9) > K.time) return false; sc.cds[n] = K.time + s; return true; };
    sc.dispose = () => {
      sc.alive = false;
      for (const f of sc.offs) { try { f(); } catch (_) {} }
      sc.offs = []; sc.timers = [];
      for (const f of sc.cleanups) { try { f(); } catch (_) {} }
      sc.cleanups = [];
    };
    return sc;
  }
  K.scope = scope;

  const pc = x => Math.round(x * 100) + '%';
  const at = (arr, l) => arr[Math.max(0, Math.min(arr.length - 1, l - 1))];

  // ------------------------------------------------------------------ BIBLIOTHÈQUE D'EFFETS RÉUTILISÉS (dons + évolutions)
  const LIB = {
    // Coups critiques → éclair qui rebondit
    chain(sc, o) {
      sc.on('damageDealt', d => {
        if (!d.crit || K.isTal(d.source) || !d.target || !sc.cd('chain', o.cd || 0.2)) return;
        const a = K.api(); if (!a) return;
        const n = o.bounces + (K.flags().chainBonus || 0);
        let cur = d.target; const hit = new Set([cur]);
        let amt = Math.min(d.amount * o.pct, K.base() * 12);
        for (let i = 0; i < n; i++) {
          const nx = K.nearest(cur.pos, 7.5, hit); if (!nx) break;
          K.zap(cur, nx); K.dmg(sc.id, nx, amt, { element: 'foudre', kind: 'skill' });
          if (o.shock && G.rng.chance(o.shock)) K.status(nx, 'shock', 2, 1);
          hit.add(nx); cur = nx; amt *= 0.9;
        }
      });
    },
    // Foudre du ciel périodique (+ à chaque lancer de compétence)
    bolts(sc, o) {
      const strike = (count) => {
        const a = K.api(); if (!a) return;
        const list = (a.enemies() || []).filter(e => !e.dead);
        for (let i = 0; i < count && list.length; i++) {
          const e = list.splice(Math.floor(G.rng.float() * list.length), 1)[0];
          try { G.VFX && G.VFX.lightning && G.VFX.lightning(K.v3(e.pos.x, e.pos.y + 9, e.pos.z), e.pos); } catch (_) {}
          K.dmg(sc.id, e, K.base() * o.mult, { element: 'foudre', kind: 'skill' });
          if (o.shock) K.status(e, 'shock', 2, 1);
          const nx = K.nearest(e.pos, 5, new Set([e]));
          if (nx && o.arc) { K.zap(e, nx); K.dmg(sc.id, nx, K.base() * o.mult * 0.5, { element: 'foudre' }); }
        }
      };
      sc.every(o.every, () => strike(o.count), o.every * 0.6);
      if (o.onCast) sc.on('skillCast', () => { if (sc.cd('castbolt', o.onCast)) strike(1); });
    },
    // Les ennemis gelés explosent à leur mort
    shatter(sc, o) {
      sc.on('enemyKilled', ({ enemy }) => {
        if (!enemy || !K.has(enemy, 'freeze') || !sc.cd('shatter', 0.05)) return;
        const amt = Math.min(enemy.pvMax * o.mult, K.base() * 8);
        K.boom(sc.id, enemy.pos, o.radius, amt, 'glace');
        if (o.refreeze) for (const e of K.api().enemiesInRadius(enemy.pos, o.radius) || []) if (e !== enemy) K.status(e, 'freeze', o.refreeze, 1);
      });
    },
    // Chance de geler sur coup de glace
    freezer(sc, chance, dur) {
      sc.on('damageDealt', d => {
        if (K.isTal(d.source) || !d.target || (d.element !== 'glace' && !d.__any)) return;
        if (G.rng.chance(chance)) K.status(d.target, 'freeze', dur, 1);
      });
    },
    // Nova de givre périodique
    nova(sc, o) {
      sc.every(o.every, () => {
        const a = K.api(); if (!a) return; const p = a.player(); if (!p) return;
        const targets = a.enemiesInRadius(p.pos, o.radius) || [];
        if (!targets.length) return;
        try { G.VFX && G.VFX.explosion && G.VFX.explosion(p.pos, o.radius, 'glace'); } catch (_) {}
        for (const e of targets.slice(0, 14)) { K.dmg(sc.id, e, K.base() * o.mult, { element: 'glace' }); K.status(e, 'freeze', o.freeze, 1); }
      }, o.every * 0.5);
    },
    // Roulade → copies d'ombre qui explosent
    clones(sc, o) {
      sc.on('playerDodge', () => {
        const a = K.api(); if (!a || !sc.cd('clone', 0.6)) return; const p = a.player(); if (!p) return;
        for (let i = 0; i < o.count; i++) {
          const ang = (i / o.count) * Math.PI * 2 + 0.7;
          const pos = K.v3(p.pos.x + (o.count > 1 ? Math.cos(ang) * 1.4 : 0), p.pos.y, p.pos.z + (o.count > 1 ? Math.sin(ang) * 1.4 : 0));
          try { G.VFX && G.VFX.shadowRise && G.VFX.shadowRise(pos); } catch (_) {}
          sc.later(o.delay, () => {
            K.boom(sc.id, pos, o.radius, K.base() * o.mult, 'ombre');
            if (o.fear) for (const e of K.api() ? K.api().enemiesInRadius(pos, o.radius) : []) K.status(e, 'fear', o.fear, 1);
          });
        }
      });
    },
    // Ombres récoltées sur mort (serviteurs temporaires, max N)
    harvest(sc, o) {
      sc.st.mins = [];
      sc.on('enemyKilled', ({ enemy }) => {
        const a = K.api(); if (!a || !enemy || !sc.cd('harvest', 0.4) || !G.rng.chance(o.chance)) return;
        sc.st.mins = sc.st.mins.filter(m => m && !m.dead);
        if (sc.st.mins.length >= o.cap) { K.heal(K.pl().pvMax * 0.01); return; }
        const id = (G.Necro && G.Necro.TEMP_MINION) || 'soldat_ombre';
        let m = null; try { m = a.summon(id, { pos: enemy.pos.clone ? enemy.pos.clone() : enemy.pos, duration: o.life, level: Math.max(1, sc.level) }); } catch (_) {}
        if (m) { sc.st.mins.push(m); try { G.VFX && G.VFX.shadowRise && G.VFX.shadowRise(enemy.pos); } catch (_) {} }
        else a.restoreMana && a.restoreMana(4);
      });
    },
    // Survie : une mort évitée (x uses par run)
    revive(sc, o) {
      sc.st.uses = o.uses; sc.st.inv = 0;
      sc.hook('incomingDamage', (dmg, ctx) => {
        if (!K.isPlayer(ctx.target)) return;
        const a = K.api(); if (!a) return; const p = a.player(); if (!p) return;
        if (sc.st.inv > K.time) { dmg.amount = 0; return dmg; }
        if (sc.st.uses > 0 && dmg.amount >= p.pv) {
          sc.st.uses--; sc.st.inv = K.time + o.invuln; dmg.amount = 0;
          a.heal(Math.max(1, p.pvMax * o.heal - p.pv));
          K.text(p.pos, o.label || 'SECOND SOUFFLE', '#ffd27a', 26);
          K.boom(sc.id, p.pos, 7, K.base() * o.mult, o.element || 'sacre', { knockback: 8 });
          if (o.burn) for (const e of a.enemiesInRadius(p.pos, 9) || []) K.status(e, 'burn', 4, Math.round(K.base() * 0.25));
          return dmg;
        }
      }, 100);
    },
    // Écho : chaque N-ième compétence est relancée gratuitement
    echo(sc, o) {
      sc.st.n = 0;
      sc.on('skillCast', e => {
        if (sc.st.echoing || !e.slot || e.slot === 'cast1' || e.slot === 'super') return;
        sc.st.n++;
        if (sc.st.n < o.n || !sc.cd('echo', 0.8)) return;
        sc.st.n = 0;
        sc.later(0.3, () => {
          const a = K.api(); if (!a || !G.Skills || !G.Skills.cast) return;
          sc.st.echoing = true;
          try {
            G.Skills.cast(e.slot, { dir: a.player().dir, echo: true, free: true });
            const sk = G.SKILLS && G.SKILLS[e.skillId];
            if (sk && sk.manaCost) a.restoreMana(sk.manaCost);
            K.text(a.player().pos, 'ÉCHO', '#9fe0ff', 20);
          } finally { sc.st.echoing = false; }
        });
      });
    },
    // Statuts → bonus de dégâts sur cible (burn, shock, freeze, poison…)
    amp(sc, status, f) {
      sc.hook('outgoingDamage', (d, c) => {
        if (K.isTal(c.source) || !c.target || !K.has(c.target, status)) return;
        d.amount *= f; return d;
      });
    },
    // % de chance d'infliger un statut sur coup
    onHit(sc, chance, status, dur, element, pw) {
      sc.on('damageDealt', d => {
        if (K.isTal(d.source) || !d.target || (element && d.element !== element)) return;
        if (G.rng.chance(chance)) K.status(d.target, status, dur, typeof pw === 'function' ? pw() : (pw || 1));
      });
    },
    statMods(sc, fn) { sc.hook('stats', s => { fn(s); return s; }); },
  };
  K.LIB = LIB;

  // ------------------------------------------------------------------ DÉFINITION
  function T(def) {
    def.maxLevel = def.maxLevel || META.maxLevels[def.rarity];
    def.classes = def.classes || null;
    const fx = def.fx; delete def.fx;
    def.apply = function (level) {
      const sc = scope(def.id, level || 1);
      try { fx(sc, level || 1, K); } catch (e) { console.error('[talent ' + def.id + ']', e); }
      return () => sc.dispose();
    };
    def.synergy = { withTags: def.tags.slice(), bonus: 'Compte pour les synergies ' + def.tags.map(t => META.tagNames[t] || t).join(' / ') };
    if (def.evolution) def.evolution.level = def.maxLevel;
    TALENTS[def.id] = def;
    return def;
  }

  // ==================================================================
  //  COMMUNS  (+15-30 % sur une stat + petit effet)
  // ==================================================================
  T({ id: 'peau_epaisse', name: 'Peau épaisse', icon: '🪨', rarity: 'commun', tags: ['defense'],
    desc: l => `Défense +${pc(0.06 * l)}. Le premier coup subi dans chaque salle est réduit de moitié.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'defense', 1 + 0.06 * l));
      sc.st.used = false; sc.on('roomStart', () => { sc.st.used = false; });
      sc.hook('incomingDamage', (d, c) => { if (!K.isPlayer(c.target) || sc.st.used || d.amount <= 0) return; sc.st.used = true; d.amount *= 0.5; return d; });
    } });

  T({ id: 'aimant_tresors', name: 'Aimant à trésors', icon: '🧲', rarity: 'commun', tags: ['butin'],
    desc: l => `Or +${pc(0.06 * l)}, rayon de ramassage +${(2 + 1.5 * l).toFixed(1)} m, ${pc(0.03 * l)} de chances de doubler le butin d'un ennemi.`,
    fx(sc, l) {
      LIB.statMods(sc, s => { K.add(s, 'pickupRadius', 2 + 1.5 * l); });
      sc.hook('goldGain', n => n * (1 + 0.06 * l));
      sc.hook('lootTable', (drops, c) => { if (Array.isArray(drops) && drops.length && G.rng.chance(0.03 * l)) return drops.concat(drops.map(x => (x && typeof x === 'object' ? Object.assign({}, x) : x))); });
    } });

  T({ id: 'reflexes_vifs', name: 'Réflexes vifs', icon: '👟', rarity: 'commun', tags: ['mobilite'],
    desc: l => `Vitesse +${pc(0.03 * l)}. Après une roulade : vitesse +15 % pendant 2 s.`,
    fx(sc, l) {
      sc.st.on = false;
      LIB.statMods(sc, s => { K.mul(s, 'vitesse', (1 + 0.03 * l) * (sc.st.on ? 1.15 : 1)); });
      sc.on('playerDodge', () => { sc.st.on = true; K.recompute(); sc.later(2, () => { sc.st.on = false; K.recompute(); }); });
      sc.cleanups.push(() => { if (sc.st.on) { sc.st.on = false; K.recompute(); } });
    } });

  T({ id: 'source_vive', name: 'Source vive', icon: '💧', rarity: 'commun', tags: ['sort'],
    desc: l => `Régénération de mana +${pc(0.12 * l)}. Chaque kill rend ${1 + l} mana.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'manaRegen', 1 + 0.12 * l));
      sc.on('enemyKilled', () => { const a = K.api(); if (a) a.restoreMana(1 + l); });
    } });

  T({ id: 'oeil_chasseur', name: 'Œil du chasseur', icon: '👁️', rarity: 'commun', tags: ['critique'],
    desc: l => `Critique +${pc(0.025 * l)}, dégâts critiques +${pc(0.08 * l)}. Premier coup sur un ennemi intact : +${pc(0.06 * l)} dégâts.`,
    fx(sc, l) {
      LIB.statMods(sc, s => { K.critAdd(s, 0.025 * l); K.add(s, 'critDmg', 0.08 * l); });
      sc.hook('outgoingDamage', (d, c) => { if (K.isTal(c.source) || !c.target || c.target.pv < c.target.pvMax) return; d.amount *= 1 + 0.06 * l; return d; });
    } });

  T({ id: 'vigueur', name: 'Vigueur', icon: '❤️', rarity: 'commun', tags: ['defense'],
    desc: l => `PV max +${pc(0.05 * l)}. Salle terminée : soigne ${pc(0.02 + 0.01 * l)} des PV max.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'pvMax', 1 + 0.05 * l));
      sc.on('roomCleared', () => { const p = K.pl(); if (p) K.heal(p.pvMax * (0.02 + 0.01 * l)); });
    } });

  T({ id: 'braises_tenaces', name: 'Braises tenaces', icon: '🔥', rarity: 'commun', tags: ['feu'],
    desc: l => `Dégâts de feu +${pc(0.06 * l)}. ${pc(0.08 + 0.03 * l)} de chances d'enflammer l'ennemi touché.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.feu', 1 + 0.06 * l));
      LIB.onHit(sc, 0.08 + 0.03 * l, 'burn', 3, null, () => Math.round(K.base() * 0.2));
    } });

  T({ id: 'lame_affutee', name: 'Lame affûtée', icon: '🗡️', rarity: 'commun', tags: ['physique'],
    desc: l => `Dégâts physiques +${pc(0.04 * l)}. Un coup de mêlée sur 5 inflige +${pc(0.4 + 0.1 * l)}.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.physique', 1 + 0.04 * l));
      sc.st.n = 0;
      sc.hook('outgoingDamage', (d, c) => { if (K.isTal(c.source) || d.kind !== 'melee') return; if (++sc.st.n % 5 === 0) { d.amount *= 1.4 + 0.1 * l; } return d; });
    } });

  T({ id: 'venin_lent', name: 'Venin lent', icon: '🧪', rarity: 'commun', tags: ['poison'],
    desc: l => `Dégâts de poison +${pc(0.07 * l)}. ${pc(0.1 + 0.04 * l)} de chances d'empoisonner (3 s).`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.poison', 1 + 0.07 * l));
      LIB.onHit(sc, 0.1 + 0.04 * l, 'poison', 3, null, () => Math.round(K.base() * 0.15));
    } });

  T({ id: 'givre_leger', name: 'Souffle givré', icon: '🧊', rarity: 'commun', tags: ['glace'],
    desc: l => `Dégâts de glace +${pc(0.06 * l)}. ${pc(0.12 + 0.04 * l)} de chances de ralentir l'ennemi touché.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.glace', 1 + 0.06 * l));
      LIB.onHit(sc, 0.12 + 0.04 * l, 'slow', 2.5, null, 0.4);
    } });

  T({ id: 'etincelle_statique', name: 'Étincelle statique', icon: '⚡', rarity: 'commun', tags: ['foudre'],
    desc: l => `Dégâts de foudre +${pc(0.06 * l)}. ${pc(0.08 + 0.03 * l)} de chances d'électriser l'ennemi touché.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.foudre', 1 + 0.06 * l));
      LIB.onHit(sc, 0.08 + 0.03 * l, 'shock', 2, null, 1);
    } });

  // ==================================================================
  //  RARES  (effet de gameplay net)
  // ==================================================================
  T({ id: 'bouclier_lumiere', name: 'Bouclier de lumière', icon: '🛡️', rarity: 'rare', tags: ['sacre', 'defense'],
    desc: l => `Toutes les ${16 - 2 * l} s, un bouclier absorbe ${pc(0.1 + 0.04 * l)} des PV max de dégâts.`,
    fx(sc, l) {
      sc.st.b = 0;
      sc.every(16 - 2 * l, () => { const p = K.pl(); if (!p) return; sc.st.b = p.pvMax * (0.1 + 0.04 * l); K.text(p.pos, '🛡️', '#fff3b0', 22); }, 3);
      sc.on('roomStart', () => { const p = K.pl(); if (p) sc.st.b = Math.max(sc.st.b, p.pvMax * (0.1 + 0.04 * l) * 0.5); });
      sc.hook('incomingDamage', (d, c) => {
        if (!K.isPlayer(c.target) || sc.st.b <= 0 || d.amount <= 0) return;
        const ab = Math.min(sc.st.b, d.amount); sc.st.b -= ab; d.amount -= ab; return d;
      }, 10);
    } });

  T({ id: 'frappe_vampirique', name: 'Frappe vampirique', icon: '🩸', rarity: 'rare', tags: ['physique', 'critique'],
    desc: l => `Vol de vie +${pc(0.03 * l)}. Un coup critique soigne ${pc(0.01 * l)} des PV max en plus.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.add(s, 'lifesteal', 0.03 * l));
      sc.on('damageDealt', d => { if (!d.crit || K.isTal(d.source) || !sc.cd('vamp', 0.3)) return; const p = K.pl(); if (p) K.heal(p.pvMax * 0.01 * l); });
    } });

  T({ id: 'maitre_flammes', name: 'Maître des flammes', icon: '🌋', rarity: 'rare', tags: ['feu'],
    desc: l => `Les ennemis en feu subissent +${pc(0.12 + 0.05 * l)}. Un ennemi en feu qui meurt propage l'incendie (rayon ${3 + l} m).`,
    fx(sc, l) {
      LIB.amp(sc, 'burn', 1.12 + 0.05 * l);
      sc.on('enemyKilled', ({ enemy }) => {
        const a = K.api(); if (!a || !enemy || !K.has(enemy, 'burn') || !sc.cd('spread', 0.05)) return;
        for (const e of (a.enemiesInRadius(enemy.pos, 3 + l) || []).slice(0, 8)) if (e !== enemy) K.status(e, 'burn', 4, Math.round(K.base() * 0.25));
        try { G.VFX && G.VFX.explosion && G.VFX.explosion(enemy.pos, 2 + l * 0.5, 'feu'); } catch (_) {}
      });
    } });

  T({ id: 'coeur_givre', name: 'Cœur de givre', icon: '💠', rarity: 'rare', tags: ['glace'],
    evolution: { requires: 'nova_givre', into: 'zero_absolu' },
    desc: l => `10 % de gel sur les coups de glace. Les ennemis gelés explosent à leur mort (rayon ${(3.5 + 0.5 * l).toFixed(1)} m, ${pc(0.25 + 0.05 * l)} de leurs PV).`,
    fx(sc, l) { LIB.freezer(sc, 0.1, 1.5); LIB.shatter(sc, { radius: 3.5 + 0.5 * l, mult: 0.25 + 0.05 * l }); } });

  T({ id: 'conducteur', name: 'Conducteur', icon: '🔌', rarity: 'rare', tags: ['foudre'],
    desc: l => `Les ennemis électrisés subissent +${pc(0.15 + 0.05 * l)}. Les coups de foudre ont 20 % de chances d'arquer vers un autre ennemi.`,
    fx(sc, l) {
      LIB.amp(sc, 'shock', 1.15 + 0.05 * l);
      sc.on('damageDealt', d => {
        if (K.isTal(d.source) || d.element !== 'foudre' || !d.target || !G.rng.chance(0.2) || !sc.cd('arc', 0.25)) return;
        const nx = K.nearest(d.target.pos, 6, new Set([d.target])); if (!nx) return;
        K.zap(d.target, nx); K.dmg(sc.id, nx, Math.min(d.amount * 0.35, K.base() * 6), { element: 'foudre' }); K.status(nx, 'shock', 2, 1);
      });
    } });

  T({ id: 'chasseur_primes', name: 'Chasseur de primes', icon: '💀', rarity: 'rare', tags: ['butin'],
    desc: l => `Élites et boss : or et XP +${pc(0.12 * l)}, ${pc(0.1 * l)} de chances de doubler leur butin.`,
    fx(sc, l) {
      sc.hook('goldGain', (n, c) => (K.elite(c.enemy) ? n * (1 + 0.12 * l) : undefined));
      sc.hook('xpGain', (n, c) => (K.elite(c.enemy) ? n * (1 + 0.12 * l) : undefined));
      sc.hook('lootTable', (drops, c) => { if (Array.isArray(drops) && drops.length && K.elite(c.enemy) && G.rng.chance(0.1 * l)) return drops.concat(drops.map(x => (x && typeof x === 'object' ? Object.assign({}, x) : x))); });
    } });

  T({ id: 'pas_leger', name: 'Pas léger', icon: '🍃', rarity: 'rare', tags: ['mobilite'],
    desc: l => `Après une roulade, vos attaques infligent +${pc(0.2 + 0.06 * l)} pendant 3 s.`,
    fx(sc, l) {
      sc.st.until = 0;
      sc.on('playerDodge', () => { sc.st.until = K.time + 3; });
      sc.hook('outgoingDamage', (d, c) => { if (K.isTal(c.source) || sc.st.until < K.time) return; d.amount *= 1.2 + 0.06 * l; return d; });
    } });

  T({ id: 'seuil_survie', name: 'Seuil de survie', icon: '⛓️', rarity: 'rare', tags: ['defense'],
    desc: l => `Aucun coup ne peut retirer plus de ${pc(0.44 - 0.04 * l)} de vos PV max (recharge ${13 - l} s).`,
    fx(sc, l) {
      sc.hook('incomingDamage', (d, c) => {
        if (!K.isPlayer(c.target)) return; const p = K.pl(); if (!p) return;
        const cap = p.pvMax * (0.44 - 0.04 * l);
        if (d.amount > cap && sc.cd('cap', 13 - l)) { d.amount = cap; K.text(p.pos, 'RÉSISTE', '#cfd8e8', 18); return d; }
      }, 20);
    } });

  T({ id: 'ecorche', name: 'Écorché', icon: '☣️', rarity: 'rare', tags: ['poison'],
    desc: l => `Un ennemi empoisonné qui meurt libère un nuage : poison sur les ennemis à ${3 + l} m.`,
    fx(sc, l) {
      sc.on('enemyKilled', ({ enemy }) => {
        const a = K.api(); if (!a || !enemy || !K.has(enemy, 'poison') || !sc.cd('cloud', 0.1)) return;
        for (const e of (a.enemiesInRadius(enemy.pos, 3 + l) || []).slice(0, 10)) if (e !== enemy) K.status(e, 'poison', 4, Math.round(K.base() * (0.15 + 0.05 * l)));
        try { G.VFX && G.VFX.explosion && G.VFX.explosion(enemy.pos, 2.5 + l * 0.5, 'poison'); } catch (_) {}
      });
    } });

  T({ id: 'rage_du_guerrier', name: 'Rage du guerrier', icon: '😤', rarity: 'rare', tags: ['physique'], classes: ['Guerrier'],
    desc: l => `Chaque kill : +1 charge de rage (max ${6 + l}), +${pc(0.008 + 0.004 * l)} dégâts par charge. Retombe après 6 s sans kill.`,
    fx(sc, l) {
      sc.st.n = 0; sc.st.last = 0;
      sc.on('enemyKilled', () => { sc.st.n = Math.min(6 + l, sc.st.n + 1); sc.st.last = K.time; });
      sc.on('tick', () => { if (sc.st.n && K.time - sc.st.last > 6) sc.st.n = 0; });
      sc.hook('outgoingDamage', (d, c) => { if (K.isTal(c.source) || !sc.st.n || d.kind === 'minion') return; d.amount *= 1 + sc.st.n * (0.008 + 0.004 * l); return d; });
    } });

  T({ id: 'focalisation_arcanique', name: 'Focalisation arcanique', icon: '🔷', rarity: 'rare', tags: ['sort'], classes: ['Mage'],
    desc: l => `Coût en mana des compétences -${pc(0.15 + 0.05 * l)}. Dégâts de compétences +${pc(0.06 * l)}.`,
    fx(sc, l) {
      sc.hook('skillManaCost', c => c * (1 - 0.15 - 0.05 * l));
      sc.hook('outgoingDamage', (d, c) => { if (K.isTal(c.source) || (d.kind !== 'skill' && d.kind !== 'projectile' && d.kind !== 'aoe')) return; d.amount *= 1 + 0.06 * l; return d; });
    } });

  T({ id: 'main_leste', name: 'Mains lestes', icon: '🤏', rarity: 'rare', tags: ['butin', 'critique'], classes: ['Voleur'],
    desc: l => `Critique +${pc(0.03 * l)}. Un coup critique a 35 % de chances de dérober ${5 * l} à ${10 * l} or.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.critAdd(s, 0.03 * l));
      sc.on('damageDealt', d => {
        if (!d.crit || K.isTal(d.source) || !sc.cd('steal', 0.15) || !G.rng.chance(0.35)) return;
        const n = G.rng.int(5 * l, 10 * l); K.gold(n); if (d.target) K.text(d.target.pos, '+' + n + ' 💰', '#ffd34d', 16);
      });
    } });

  // ==================================================================
  //  ÉPIQUES  (changent la façon de jouer)
  // ==================================================================
  T({ id: 'chaine_orage', name: "Chaîne d'orage", icon: '🌩️', rarity: 'epique', tags: ['foudre', 'critique'],
    evolution: { requires: 'colere_celeste', into: 'tempete_souveraine' },
    desc: l => `Les coups critiques déclenchent un éclair qui rebondit sur ${2 + l} ennemis (${pc(0.4 + 0.05 * l)} des dégâts, 25 % d'électrisation).`,
    fx(sc, l) { LIB.chain(sc, { bounces: 2 + l, pct: 0.4 + 0.05 * l, shock: 0.25 }); } });

  T({ id: 'sang_bouillant', name: 'Sang bouillant', icon: '🌡️', rarity: 'epique', tags: ['physique', 'defense'],
    desc: l => `Sous 30 % de PV : vitesse +${pc(0.15 + 0.05 * l)}, vol de vie +${pc(0.06 + 0.02 * l)}, dégâts +${pc(0.1 * l)}.`,
    fx(sc, l) {
      sc.st.on = false;
      LIB.statMods(sc, s => { if (sc.st.on) { K.mul(s, 'vitesse', 1.15 + 0.05 * l); K.add(s, 'lifesteal', 0.06 + 0.02 * l); } });
      sc.hook('outgoingDamage', (d, c) => { if (!sc.st.on || K.isTal(c.source)) return; d.amount *= 1 + 0.1 * l; return d; });
      sc.every(0.25, () => {
        const p = K.pl(); if (!p) return; const low = p.pv > 0 && p.pv / p.pvMax < 0.3;
        if (low !== sc.st.on) { sc.st.on = low; K.recompute(); if (low) K.text(p.pos, '🩸', '#ff5555', 22); }
      });
      sc.cleanups.push(() => { if (sc.st.on) { sc.st.on = false; K.recompute(); } });
    } });

  T({ id: 'echo', name: 'Écho', icon: '🔁', rarity: 'epique', tags: ['sort'],
    evolution: { requires: 'horloge_brisee', into: 'echo_du_temps' },
    desc: l => `Chaque ${l >= 3 ? 3 : 4}e compétence (hors attaque de base et ultime) est relancée gratuitement.`,
    fx(sc, l) { LIB.echo(sc, { n: l >= 3 ? 3 : 4 }); } });

  T({ id: 'pas_ombre', name: "Pas de l'ombre", icon: '👤', rarity: 'epique', tags: ['ombre', 'mobilite'],
    evolution: { requires: 'moisson_ames', into: 'ombre_eternelle' },
    desc: l => `La roulade laisse une copie d'ombre qui explose après 0,9 s (rayon ${(3 + 0.4 * l).toFixed(1)} m, ${pc(1.2 + 0.4 * l)} de dégâts de base${l >= 3 ? ', terrifie' : ''}).`,
    fx(sc, l) { LIB.clones(sc, { count: 1, radius: 3 + 0.4 * l, mult: 1.2 + 0.4 * l, delay: 0.9, fear: l >= 3 ? 1.5 : 0 }); } });

  T({ id: 'contre_charge', name: 'Contre chargée', icon: '⚔️', rarity: 'epique', tags: ['defense', 'physique'],
    desc: l => `Esquive parfaite : onde de choc (étourdit 1,2 s) et votre prochaine attaque (4 s) inflige x${(1.6 + 0.3 * l).toFixed(1)}.`,
    fx(sc, l) {
      sc.st.until = 0;
      sc.on('playerParry', () => {
        const p = K.pl(); if (!p || !sc.cd('counter', 0.5)) return;
        sc.st.until = K.time + 4; K.text(p.pos, 'CONTRE !', '#ffd27a', 24);
        K.boom(sc.id, p.pos, 4, K.base() * (2 + 0.5 * l), 'physique', { knockback: 6 });
        for (const e of K.api().enemiesInRadius(p.pos, 4) || []) K.status(e, 'stun', 1.2, 1);
        const a = K.api(); a.restoreMana && a.restoreMana(5 * l);
      });
      sc.hook('outgoingDamage', (d, c) => { if (K.isTal(c.source) || sc.st.until < K.time) return; sc.st.until = 0; d.amount *= 1.6 + 0.3 * l; return d; });
    } });

  T({ id: 'danse_lames', name: 'Danse des lames', icon: '🌀', rarity: 'epique', tags: ['physique'],
    desc: l => `Des lames tournent autour de vous : toutes les 0,6 s, ${pc(0.35 + 0.1 * l)} de dégâts de base à ${(2.6 + 0.2 * l).toFixed(1)} m (6 cibles max).`,
    fx(sc, l) {
      sc.every(0.6, () => {
        const a = K.api(); if (!a) return; const p = a.player(); if (!p) return;
        const es = (a.enemiesInRadius(p.pos, 2.6 + 0.2 * l) || []).slice(0, 6); if (!es.length) return;
        try { G.VFX && G.VFX.slash && G.VFX.slash(p.pos, p.dir, '#cfe8ff', 2.6 + 0.2 * l, Math.PI * 2); } catch (_) {}
        for (const e of es) K.dmg(sc.id, e, K.base() * (0.35 + 0.1 * l), { element: 'physique', knockback: 1 });
      });
    } });

  T({ id: 'nova_givre', name: 'Nova de givre', icon: '❄️', rarity: 'epique', tags: ['glace', 'defense'],
    evolution: { requires: 'coeur_givre', into: 'zero_absolu' },
    desc: l => `Toutes les ${12 - l} s, une nova de givre (${(5 + 0.5 * l).toFixed(1)} m) inflige ${pc(0.8 + 0.2 * l)} de dégâts de base et gèle ${(1.5 + 0.3 * l).toFixed(1)} s.`,
    fx(sc, l) { LIB.nova(sc, { every: 12 - l, radius: 5 + 0.5 * l, mult: 0.8 + 0.2 * l, freeze: 1.5 + 0.3 * l }); } });

  T({ id: 'pacte_ombres', name: 'Pacte des ombres', icon: '🕯️', rarity: 'epique', tags: ['invocation', 'ombre'], classes: ['Necromancien'],
    desc: l => `+${l >= 4 ? 2 : 1} serviteur max, serviteurs : dégâts +${pc(0.15 * l)}, PV +${pc(0.1 * l)}. Leurs kills vous soignent de 1 %.`,
    fx(sc, l) {
      LIB.statMods(sc, s => { K.add(s, 'minionCap', l >= 4 ? 2 : 1); K.mul(s, 'minionDmg', 1 + 0.15 * l); K.mul(s, 'minionPv', 1 + 0.1 * l); });
      sc.hook('minionStats', m => { if (!m) return; if (m.dmg != null) m.dmg *= 1 + 0.15 * l; if (m.pv != null) m.pv *= 1 + 0.1 * l; if (m.pvMax != null) m.pvMax *= 1 + 0.1 * l; return m; });
      sc.on('enemyKilled', e => { if (e.killer === 'minion' && sc.cd('pheal', 0.3)) { const p = K.pl(); if (p) K.heal(p.pvMax * 0.01); } });
    } });

  T({ id: 'fleche_fantome', name: 'Flèches fantômes', icon: '👻', rarity: 'epique', tags: ['physique', 'critique'], classes: ['Archer'],
    desc: l => `${pc(0.2 + 0.05 * l)} de chances qu'un tir touche aussi 2 autres ennemis proches (${pc(0.45)} des dégâts, jamais en chaîne).`,
    fx(sc, l) {
      sc.on('damageDealt', d => {
        if (K.isTal(d.source) || d.kind !== 'projectile' || !d.target || !sc.cd('ghost', 0.15) || !G.rng.chance(0.2 + 0.05 * l)) return;
        const hit = new Set([d.target]);
        for (let i = 0; i < 2; i++) {
          const nx = K.nearest(d.target.pos, 10, hit); if (!nx) break; hit.add(nx);
          try { G.VFX && G.VFX.beam && G.VFX.beam(d.target.pos, nx.pos, 'ombre', 0.15); } catch (_) {}
          K.dmg(sc.id, nx, Math.min(d.amount * 0.45, K.base() * 6), { element: d.element || 'physique', kind: 'projectile' });
        }
      });
    } });

  T({ id: 'aura_sainte', name: 'Aura de sainteté', icon: '😇', rarity: 'epique', tags: ['sacre', 'defense'], classes: ['Paladin'],
    desc: l => `Défense +${pc(0.05 * l)}. Soigne ${pc(0.004 + 0.002 * l)} des PV max par seconde ; toutes les 6 s une pulsation sacrée blesse et repousse les ennemis proches.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'defense', 1 + 0.05 * l));
      sc.every(1, () => { const p = K.pl(); if (p && p.pv < p.pvMax) K.heal(p.pvMax * (0.004 + 0.002 * l)); });
      sc.every(6, () => { const p = K.pl(); if (p) K.boom(sc.id, p.pos, 4.5, K.base() * (0.6 + 0.2 * l), 'sacre', { knockback: 4 }); }, 3);
    } });

  T({ id: 'resonance_elementaire', name: 'Résonance élémentaire', icon: '🌈', rarity: 'epique', tags: ['foudre', 'glace'], classes: ['Elementaliste'],
    desc: l => `Lancer une compétence d'un élément différent de la précédente donne +${pc(0.2 + 0.05 * l)} de dégâts pendant 5 s.`,
    fx(sc, l) {
      sc.st.last = null; sc.st.until = 0;
      sc.on('skillCast', e => {
        const sk = G.SKILLS && G.SKILLS[e.skillId]; const el = sk && sk.element; if (!el || !e.slot || e.slot === 'cast1') return;
        if (sc.st.last && sc.st.last !== el) { sc.st.until = K.time + 5; const p = K.pl(); if (p) K.text(p.pos, 'RÉSONANCE', '#9fe0ff', 18); }
        sc.st.last = el;
      });
      sc.hook('outgoingDamage', (d, c) => { if (K.isTal(c.source) || sc.st.until < K.time) return; d.amount *= 1.2 + 0.05 * l; return d; });
    } });

  // ==================================================================
  //  LÉGENDAIRES  (piliers de build)
  // ==================================================================
  T({ id: 'second_souffle', name: 'Second souffle', icon: '🕊️', rarity: 'legendaire', tags: ['defense', 'sacre'],
    evolution: { requires: 'maitre_flammes', into: 'phenix' },
    desc: l => `Une fois par donjon, un coup mortel vous laisse à ${pc(0.3 + 0.15 * l)} de PV, invulnérable 2,5 s, avec une explosion sacrée.`,
    fx(sc, l) { LIB.revive(sc, { uses: 1, heal: 0.3 + 0.15 * l, invuln: 2.5, mult: 3 + l, element: 'sacre' }); } });

  T({ id: 'moisson_ames', name: "Moisson d'âmes", icon: '🌫️', rarity: 'legendaire', tags: ['ombre', 'invocation'],
    evolution: { requires: 'pas_ombre', into: 'ombre_eternelle' },
    desc: l => `Les kills ont ${pc(Math.min(0.3, 0.12 + 0.06 * l))} de chances d'invoquer un soldat d'ombre (12 s, max ${2 + l} en même temps).`,
    fx(sc, l) { LIB.harvest(sc, { chance: Math.min(0.3, 0.12 + 0.06 * l), cap: 2 + l, life: 12 }); } });

  T({ id: 'colere_celeste', name: 'Colère céleste', icon: '⛈️', rarity: 'legendaire', tags: ['foudre', 'sort'],
    evolution: { requires: 'chaine_orage', into: 'tempete_souveraine' },
    desc: l => `Toutes les ${(3.8 - 0.6 * l).toFixed(1)} s la foudre frappe un ennemi au hasard (${pc(1.5 + 0.5 * l)} dégâts de base, arc secondaire). Chaque compétence en appelle une de plus (1 s de recharge).`,
    fx(sc, l) { LIB.bolts(sc, { every: 3.8 - 0.6 * l, count: 1, mult: 1.5 + 0.5 * l, arc: true, onCast: 1 }); } });

  T({ id: 'horloge_brisee', name: 'Horloge brisée', icon: '⏳', rarity: 'legendaire', tags: ['sort', 'mobilite'],
    desc: l => `Recharge -${pc(0.1 * l)}. Tuer un élite ou un boss restaure tout le mana.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.add(s, 'cdr', 0.1 * l));
      sc.on('enemyKilled', ({ enemy }) => { if (K.elite(enemy)) { const p = K.pl(), a = K.api(); if (a && p) a.restoreMana(p.manaMax); } });
    } });

  T({ id: 'avidite_dragon', name: 'Avidité du dragon', icon: '🐉', rarity: 'legendaire', tags: ['butin'],
    desc: l => `Or +${pc(0.12 * l)}, XP +${pc(0.06 * l)}, chance de butin +${pc(0.1 * l)} ; ${pc(0.12 + 0.08 * l)} de chances de doubler un butin (non cumulable).`,
    fx(sc, l) {
      LIB.statMods(sc, s => { K.add(s, 'lootLuck', 0.1 * l); });
      sc.hook('goldGain', n => n * (1 + 0.12 * l));
      sc.hook('xpGain', n => n * (1 + 0.06 * l));
      sc.hook('lootTable', drops => { if (Array.isArray(drops) && drops.length && G.rng.chance(0.12 + 0.08 * l)) return drops.concat(drops.map(x => (x && typeof x === 'object' ? Object.assign({}, x) : x))); });
    } });

  T({ id: 'legion_eternelle', name: 'Légion éternelle', icon: '🏴', rarity: 'legendaire', tags: ['invocation', 'ombre'], classes: ['Necromancien'],
    desc: l => `+${l >= 3 ? 2 : 1} serviteur max, serviteurs : dégâts +${pc(0.2 + 0.15 * l)}. Chaque kill de serviteur les soigne de 12 %.`,
    fx(sc, l) {
      LIB.statMods(sc, s => { K.add(s, 'minionCap', l >= 3 ? 2 : 1); K.mul(s, 'minionDmg', 1.2 + 0.15 * l); });
      sc.hook('minionStats', m => { if (m && m.dmg != null) m.dmg *= 1.2 + 0.15 * l; return m; });
      sc.on('enemyKilled', e => {
        if (e.killer !== 'minion' || !sc.cd('legheal', 0.3)) return; const a = K.api(); if (!a) return;
        for (const m of a.minions() || []) if (!m.dead) m.pv = Math.min(m.pvMax, m.pv + m.pvMax * 0.12);
      });
    } });

  T({ id: 'execution_silencieuse', name: 'Exécution silencieuse', icon: '🪦', rarity: 'legendaire', tags: ['ombre', 'critique'], classes: ['Assassin'],
    desc: l => `Un coup qui laisse un ennemi sous ${pc(0.12 + 0.04 * l)} de PV le tue net (élites : moitié du seuil). Boss : +25 % sous 20 %.`,
    fx(sc, l) {
      sc.hook('outgoingDamage', (d, c) => {
        const t = c.target; if (!t || K.isTal(c.source) || !t.pvMax) return;
        const thr = (0.12 + 0.04 * l) * (t.elite ? 0.5 : 1);
        if (t.boss || (t.def && t.def.miniboss)) { if (t.pv / t.pvMax < 0.2) d.amount *= 1.25; return d; }
        if ((t.pv - d.amount) / t.pvMax <= thr) { d.amount = Math.max(d.amount, t.pv); K.text(t.pos, '✖', '#c58bff', 22); return d; }
      }, 50);
    } });

  // ==================================================================
  //  MYTHIQUES  (uniquement par ÉVOLUTION : don de base niveau max + don précis)
  // ==================================================================
  T({ id: 'tempete_souveraine', name: 'Tempête souveraine', icon: '🌪️', rarity: 'mythique', tags: ['foudre', 'critique', 'sort'], evolved: true,
    desc: l => `Évolution de Chaîne d'orage + Colère céleste. Critiques : éclairs sur ${6 + l} ennemis ; la foudre frappe ${1 + l} cibles toutes les ${(2.6 - 0.2 * l).toFixed(1)} s ; foudre +${pc(0.25)}.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.foudre', 1.25));
      LIB.chain(sc, { bounces: 6 + l, pct: 0.6, shock: 0.5, cd: 0.15 });
      LIB.bolts(sc, { every: 2.6 - 0.2 * l, count: 1 + l, mult: 2.2 + 0.4 * l, arc: true, shock: true, onCast: 0.7 });
    } });

  T({ id: 'zero_absolu', name: 'Zéro absolu', icon: '🥶', rarity: 'mythique', tags: ['glace', 'defense'], evolved: true,
    desc: l => `Évolution de Cœur de givre + Nova de givre. Glace +${pc(0.2)}, 20 % de gel ; les ennemis gelés subissent +30 % et explosent en chaîne ; nova toutes les ${9 - l} s.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.glace', 1.2));
      LIB.freezer(sc, 0.2, 2);
      LIB.amp(sc, 'freeze', 1.3);
      LIB.shatter(sc, { radius: 5 + 0.5 * l, mult: 0.45, refreeze: 1.2 });
      LIB.nova(sc, { every: 9 - l, radius: 7, mult: 1.6 + 0.3 * l, freeze: 2.5 });
    } });

  T({ id: 'ombre_eternelle', name: 'Ombre éternelle', icon: '🌒', rarity: 'mythique', tags: ['ombre', 'mobilite', 'invocation'], evolved: true,
    desc: l => `Évolution de Pas de l'ombre + Moisson d'âmes. La roulade laisse ${l >= 3 ? 3 : 2} copies terrifiantes ; les kills invoquent des soldats d'ombre (25 %, max ${3 + l}) ; ombre +20 %.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.ombre', 1.2));
      LIB.clones(sc, { count: l >= 3 ? 3 : 2, radius: 4, mult: 2, delay: 0.8, fear: 2 });
      LIB.harvest(sc, { chance: 0.25, cap: 3 + l, life: 14 });
    } });

  T({ id: 'phenix', name: 'Renaissance du phénix', icon: '🔥', rarity: 'mythique', tags: ['feu', 'defense', 'sacre'], evolved: true,
    desc: l => `Évolution de Second souffle + Maître des flammes. Revenez ${l >= 3 ? 'deux fois' : 'une fois'} d'entre les morts (${pc(0.5 + 0.1 * l)} PV), en embrasant tous les ennemis ; feu +20 % ; ennemis en feu +25 %.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.mul(s, 'dmg.feu', 1.2));
      LIB.amp(sc, 'burn', 1.25);
      LIB.revive(sc, { uses: l >= 3 ? 2 : 1, heal: 0.5 + 0.1 * l, invuln: 3, mult: 6 + l, element: 'feu', burn: true, label: 'RENAISSANCE' });
    } });

  T({ id: 'echo_du_temps', name: 'Écho du temps', icon: '♾️', rarity: 'mythique', tags: ['sort', 'mobilite'], evolved: true,
    desc: l => `Évolution d'Écho + Horloge brisée. Chaque ${l >= 3 ? 2 : 3}e compétence est relancée gratuitement ; recharge -${pc(0.15 + 0.05 * l)}.`,
    fx(sc, l) {
      LIB.statMods(sc, s => K.add(s, 'cdr', 0.15 + 0.05 * l));
      LIB.echo(sc, { n: l >= 3 ? 2 : 3 });
    } });

  // ==================================================================
  //  SECRETS  (0,1 % par proposition)
  // ==================================================================
  T({ id: 'regard_du_vide', name: 'Regard du Vide', icon: '🕳️', rarity: 'secret', tags: ['ombre'],
    desc: l => `Toutes les ${14 - 2 * l} s, l'ennemi le plus proche est effacé (élites : -40 % PV ; boss : -3 % PV) et vous soigne de ${pc(0.03 + 0.01 * l)}.`,
    fx(sc, l) {
      sc.every(14 - 2 * l, () => {
        const a = K.api(); if (!a) return; const p = a.player(); if (!p) return;
        const e = K.nearest(p.pos, 16); if (!e) return;
        try { G.VFX && G.VFX.shadowRise && G.VFX.shadowRise(e.pos); } catch (_) {}
        const boss = e.boss || (e.def && e.def.miniboss);
        K.dmg(sc.id, e, boss ? e.pvMax * 0.03 : (e.elite ? e.pvMax * 0.4 : e.pv + 1), { element: 'ombre' });
        K.heal(p.pvMax * (0.03 + 0.01 * l));
      }, 5);
    } });

  T({ id: 'couronne_cendres', name: 'Couronne de cendres', icon: '👑', rarity: 'secret', tags: ['feu', 'ombre'],
    desc: l => `Chaque ennemi tué explose en cendres : ${pc(0.3 + 0.05 * l)} de ses PV max (plafonné) aux ennemis à ${3 + l} m, et les enflamme.`,
    fx(sc, l) {
      sc.on('enemyKilled', ({ enemy }) => {
        if (!enemy || K.depth > 1) return;
        const amt = Math.min(enemy.pvMax * (0.3 + 0.05 * l), K.base() * 10);
        K.boom(sc.id, enemy.pos, 3 + l, amt, 'feu');
        const a = K.api(); if (a) for (const e of (a.enemiesInRadius(enemy.pos, 3 + l) || []).slice(0, 8)) K.status(e, 'burn', 3, Math.round(K.base() * 0.2));
      });
    } });

  T({ id: 'ame_miroir', name: 'Âme-miroir', icon: '🪞', rarity: 'secret', tags: ['defense', 'ombre'],
    desc: l => `Dégâts subis -${pc(0.1 * l)}. ${pc(0.3 + 0.1 * l)} des dégâts subis sont renvoyés à l'attaquant en ombre.`,
    fx(sc, l) {
      sc.hook('incomingDamage', (d, c) => {
        if (!K.isPlayer(c.target) || d.amount <= 0) return;
        d.amount *= 1 - 0.1 * l;
        const s = c.source; if (s && typeof s === 'object' && s.pv != null && !s.dead && sc.cd('mirror', 0.2)) K.dmg(sc.id, s, d.amount * (0.3 + 0.1 * l) / Math.max(0.1, 1 - 0.1 * l), { element: 'ombre', kind: 'skill' });
        return d;
      }, 30);
    } });

  // ------------------------------------------------------------------ SYNERGIES (2 / 3 / 4 dons d'un même tag, cumulatif)
  // tier : {desc, stats(s), flags:{...}, fx(sc) (optionnel : logique à l'exécution)}
  const el = (e, f) => s => K.mul(s, 'dmg.' + e, f);
  G.TALENT_SYNERGIES = {
    foudre: { tiers: {
      2: { desc: 'Dégâts de foudre +10 %', stats: el('foudre', 1.10) },
      3: { desc: 'Recharge -5 %', stats: s => K.add(s, 'cdr', 0.05) },
      4: { desc: 'Éclairs critiques : +2 rebonds ; foudre +15 %', stats: el('foudre', 1.15), flags: { chainBonus: 2 } } } },
    feu: { tiers: {
      2: { desc: 'Dégâts de feu +10 %', stats: el('feu', 1.10) },
      3: { desc: 'Force +6 %', stats: s => K.mul(s, 'force', 1.06) },
      4: { desc: 'Feu +15 % ; les kills enflammés rendent 2 mana', stats: el('feu', 1.15),
        fx(sc) { sc.on('enemyKilled', ({ enemy }) => { if (K.has(enemy, 'burn')) { const a = K.api(); if (a) a.restoreMana(2); } }); } } } },
    glace: { tiers: {
      2: { desc: 'Dégâts de glace +10 %', stats: el('glace', 1.10) },
      3: { desc: 'Défense +8 %', stats: s => K.mul(s, 'defense', 1.08) },
      4: { desc: 'Tous vos coups ont 6 % de chances de geler', fx(sc) { LIB.onHit(sc, 0.06, 'freeze', 1.2); } } } },
    ombre: { tiers: {
      2: { desc: 'Dégâts d\'ombre +10 %', stats: el('ombre', 1.10) },
      3: { desc: 'Vol de vie +3 %', stats: s => K.add(s, 'lifesteal', 0.03) },
      4: { desc: 'Serviteurs +20 % dégâts ; ombre +10 %', stats: s => { K.mul(s, 'minionDmg', 1.2); K.mul(s, 'dmg.ombre', 1.1); } } } },
    sacre: { tiers: {
      2: { desc: 'Dégâts sacrés +10 %', stats: el('sacre', 1.10) },
      3: { desc: 'PV max +8 %', stats: s => K.mul(s, 'pvMax', 1.08) },
      4: { desc: 'Régénère 0,6 % PV/s', fx(sc) { sc.every(1, () => { const p = K.pl(); if (p && p.pv < p.pvMax) K.heal(p.pvMax * 0.006); }); } } } },
    poison: { tiers: {
      2: { desc: 'Dégâts de poison +10 %', stats: el('poison', 1.10) },
      3: { desc: 'Vol de vie +2 %', stats: s => K.add(s, 'lifesteal', 0.02) },
      4: { desc: 'Poison +25 % ; les ennemis empoisonnés subissent +8 %', stats: el('poison', 1.25), fx(sc) { LIB.amp(sc, 'poison', 1.08); } } } },
    physique: { tiers: {
      2: { desc: 'Dégâts physiques +10 %', stats: el('physique', 1.10) },
      3: { desc: 'Force +6 %', stats: s => K.mul(s, 'force', 1.06) },
      4: { desc: 'Dégâts critiques +25 %', stats: s => K.add(s, 'critDmg', 0.25) } } },
    critique: { tiers: {
      2: { desc: 'Critique +5 %', stats: s => K.critAdd(s, 0.05) },
      3: { desc: 'Critique +5 %', stats: s => K.critAdd(s, 0.05) },
      4: { desc: 'Dégâts critiques +40 %', stats: s => K.add(s, 'critDmg', 0.4) } } },
    invocation: { tiers: {
      2: { desc: 'Serviteurs : dégâts +15 %', stats: s => K.mul(s, 'minionDmg', 1.15) },
      3: { desc: 'Serviteurs : PV +15 %', stats: s => K.mul(s, 'minionPv', 1.15) },
      4: { desc: '+1 serviteur maximum', stats: s => K.add(s, 'minionCap', 1) } } },
    defense: { tiers: {
      2: { desc: 'Défense +8 %', stats: s => K.mul(s, 'defense', 1.08) },
      3: { desc: 'PV max +6 %', stats: s => K.mul(s, 'pvMax', 1.06) },
      4: { desc: 'Esquive +6 % ; dégâts subis -6 %', stats: s => K.add(s, 'dodge', 0.06),
        fx(sc) { sc.hook('incomingDamage', (d, c) => { if (K.isPlayer(c.target)) { d.amount *= 0.94; return d; } }, 40); } } } },
    mobilite: { tiers: {
      2: { desc: 'Vitesse +5 %', stats: s => K.mul(s, 'vitesse', 1.05) },
      3: { desc: 'Esquive +3 %', stats: s => K.add(s, 'dodge', 0.03) },
      4: { desc: 'Vitesse +5 % ; recharge -5 %', stats: s => { K.mul(s, 'vitesse', 1.05); K.add(s, 'cdr', 0.05); } } } },
    butin: { tiers: {
      2: { desc: 'Or +10 %', fx(sc) { sc.hook('goldGain', n => n * 1.10); } },
      3: { desc: 'Chance de butin +10 %', stats: s => K.add(s, 'lootLuck', 0.1) },
      4: { desc: 'XP +10 % ; ramassage +3 m', stats: s => { K.add(s, 'pickupRadius', 3); }, fx(sc) { sc.hook('xpGain', n => n * 1.10); } } } },
    sort: { tiers: {
      2: { desc: 'Recharge -4 %', stats: s => K.add(s, 'cdr', 0.04) },
      3: { desc: 'Régénération de mana +15 %', stats: s => K.mul(s, 'manaRegen', 1.15) },
      4: { desc: 'Recharge -6 % ; mana max +10 %', stats: s => { K.add(s, 'cdr', 0.06); K.mul(s, 'manaMax', 1.1); } } } },
  };
})();
