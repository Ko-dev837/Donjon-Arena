/* =====================================================================
 *  Donjon Arena 3D v3 — BESTIAIRE (rôle 9)
 *  G.MONSTERS      : définitions (v2 reprises + ~26 nouvelles espèces)
 *  G.MONSTER_AFFIXES : modificateurs d'élites (applicables à n'importe quel monstre)
 *  G.Monsters      : get / list / scale / makeElite / rollAffixes / damageMult / absorb …
 *  Les comportements (G.AI.*) et capacités (abilities) sont dans js/sys/ai.js,
 *  les modèles 3D dans js/gfx/monster-models.js.
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'Z'];
  const rIdx = (r) => { const i = RANKS.indexOf(r); return i < 0 ? 0 : i; };

  // Facteurs par rang (alignés sur les paliers v2 de content.js : TIER pv/dmg/xp/gold/speed)
  // (v3 équilibrage) Les facteurs suivent la puissance réelle du joueur par rang (voir qa/BALANCE.md) :
  //   pv  : TTK d'un monstre normal ≈ constant (~1-2 s) quand le joueur est au niveau attendu du rang
  //   dmg : un coup normal ≈ 4-7 % des PV effectifs d'un joueur du rang
  //   xp / gold : récompense par run calibrée sur la courbe de niveaux (content.js) et l'économie (forge, améliorations)
  const RANK_MULT = {
    pv:    [2, 5.5, 13.2, 25, 43, 72, 105],
    dmg:   [1, 1.7, 2.9, 4.4, 6.5, 9, 12],
    speed: [1, 1.04, 1.08, 1.12, 1.16, 1.2, 1.25],
    xp:    [0.8, 1.85, 1.5, 1.34, 1.23, 0.85, 0.55],
    gold:  [0.54, 1.13, 1.49, 1.97, 2.18, 1.94, 1.78],
    attackCd: [1, 0.97, 0.94, 0.9, 0.86, 0.82, 0.78],   // < 1 = attaque plus souvent
    aggro: [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1],            // 0..1 : IA plus agressive (salves, fenêtres d'attaque plus courtes)
  };
  // Facteurs « cuits » dans les monstres v2 de content.js (TIER) : on les retire puis on applique RANK_MULT
  const V2_BAKED = {
    pv:   [1, 1.5, 2.2, 3.4, 5.0, 7.5],
    dmg:  [1, 1.35, 1.8, 2.4, 3.1, 3.9],
    xp:   [1, 2.3, 4.6, 8.5, 13, 19],
    gold: [1, 1.9, 3.3, 5.5, 8.5, 13],
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  const MONSTERS = {};

  // ------------------------------------------------------------------
  //  1. Ennemis v2 (mêmes ids que G.DATA.ENEMIES) + méta v3
  // ------------------------------------------------------------------
  const TIER_OF = {};
  [
    ['squelette squelette_archer chauve_souris slime squelette_elite', 0, 'crypte'],
    ['araignee araignee_tisseuse slime_moussu archer_sylvestre chauve_souris_foret araignee_elite', 1, 'foret'],
    ['squelette_guerrier squelette_lanceur chevalier_maudit spectre chauve_souris_os chevalier_elite', 2, 'catacombes'],
    ['slime_givre chauve_souris_givre archer_givre spectre_givre chevalier_givre chevalier_givre_elite', 3, 'glace'],
    ['spectre_abyssal araignee_abyssale tisseuse_abyssale chevalier_abyssal squelette_abyssal spectre_elite', 4, 'abysse'],
    ['diablotin diablotin_cracheur slime_magma chauve_souris_feu chevalier_infernal diablotin_elite', 5, 'volcan'],
  ].forEach(([ids, tier, theme]) => ids.split(' ').forEach((id) => { TIER_OF[id] = { tier, theme }; }));

  const V2_ELEMENT = {   // par modèle : [élément, resist, weak]
    skeleton: ['physique', { poison: 0.5, ombre: 0.7 }, { sacre: 1.5 }],
    archer: ['physique', { poison: 0.5, ombre: 0.7 }, { sacre: 1.5 }],
    slime: ['poison', { physique: 0.8, poison: 0.4 }, { feu: 1.4 }],
    bat: ['ombre', { ombre: 0.6 }, { foudre: 1.3 }],
    knight: ['physique', { physique: 0.8 }, { foudre: 1.3 }],
    spider: ['poison', { poison: 0.3 }, { feu: 1.5 }],
    imp: ['feu', { feu: 0.2 }, { glace: 1.5 }],
    wraith: ['ombre', { physique: 0.5, ombre: 0.3 }, { sacre: 1.6 }],
  };
  const V2_PACK = { skeleton: 'squelettes', archer: 'squelettes', slime: 'slimes', bat: 'nuee', knight: 'chevaliers', spider: 'arachnides', imp: 'diablotins', wraith: 'spectres' };
  const V2_ABIL = { squelette_elite: ['enrage'], araignee_elite: ['poisonTouch'], chevalier_elite: ['lifesteal'], spectre_elite: ['blink'], slime_magma: ['splitOnDeath'], chevalier_infernal: ['enrage'] };

  function elementOverride(id, base) {
    if (/givre|glace/.test(id)) return ['glace', { glace: 0.2 }, { feu: 1.6, physique: 1 }];
    if (/magma|braise|feu|infernal|diablotin|cracheur/.test(id)) return ['feu', { feu: 0.2 }, { glace: 1.5 }];
    if (/abyssal|abysse|damne/.test(id) || id === 'spectre_elite') return ['ombre', { ombre: 0.3 }, { sacre: 1.5 }];
    if (id === 'slime_moussu') return ['poison', { poison: 0.4 }, { feu: 1.5 }];
    return base;
  }

  function importV2() {
    const src = (G.DATA && G.DATA.ENEMIES) || {};
    Object.keys(src).forEach((id) => {
      const v = src[id];
      const t = TIER_OF[id] || { tier: 0, theme: 'crypte' };
      const el = elementOverride(id, V2_ELEMENT[v.model] || ['physique', {}, {}]);
      const rb = (k) => RANK_MULT[k][t.tier] / V2_BAKED[k][t.tier];   // re-base v2 -> barème v3
      const d = Object.assign({}, v, {
        id,
        pv: Math.max(1, Math.round(v.pv * rb('pv'))), dmg: Math.max(1, Math.round(v.dmg * rb('dmg'))), xp: Math.max(1, Math.round(v.xp * rb('xp'))),
        gold: Array.isArray(v.gold) ? v.gold.map((g) => Math.max(1, Math.round(g * rb('gold')))) : Math.round(v.gold * rb('gold')),
        element: el[0], resist: Object.assign({}, el[1]), weak: Object.assign({}, el[2]),
        abilities: (V2_ABIL[id] || []).slice(),
        rankMin: RANKS[t.tier], themes: [t.theme], packTag: V2_PACK[v.model] || null,
        rare: false, elite: !!v.elite, v2: true, _rank: RANKS[t.tier],
        desc: v.elite ? 'Version renforcée d\'un monstre commun.' : '',
      });
      d.aggro = RANK_MULT.aggro[t.tier];
      MONSTERS[id] = d;
    });
  }
  importV2();

  // ------------------------------------------------------------------
  //  2. Nouvelles espèces (stats de base niveau « E » × facteur du rang d'apparition)
  // ------------------------------------------------------------------
  function mk(id, name, rankMin, themes, model, ai, base, x) {
    x = x || {};
    const i = rIdx(rankMin);
    const d = {
      id, name, model, ai, icon: x.icon || '👾',
      pv: Math.round(base.pv * RANK_MULT.pv[i]),
      speed: r2(base.speed * RANK_MULT.speed[i]),
      dmg: Math.max(0, Math.round(base.dmg * RANK_MULT.dmg[i])),
      xp: Math.round(base.xp * RANK_MULT.xp[i]),
      gold: base.gold.map((g) => Math.max(1, Math.round(g * RANK_MULT.gold[i]))),
      attackCd: r2(base.attackCd * RANK_MULT.attackCd[i]),
      range: base.range,
      element: x.element || 'physique', resist: x.resist || {}, weak: x.weak || {},
      abilities: x.abilities || [],
      scale: x.scale || 1, tint: x.tint === undefined ? null : x.tint,
      rankMin, themes, packTag: x.packTag || null, rare: !!x.rare, elite: false,
      aggro: RANK_MULT.aggro[i], _rank: rankMin, desc: x.desc || '',
    };
    if (base.projectile) { d.projectile = base.projectile; d.projSpeed = base.projSpeed || 10; }
    ['group', 'burst', 'blastRadius', 'summon', 'summonCount', 'summonMax', 'splitInto', 'splitCount', 'rareChance', 'escapeTime',
      'spawnChance', 'lunge', 'healPct', 'shieldPct', 'disguise', 'deathRadius', 'revealRadius'].forEach((k) => { if (x[k] !== undefined) d[k] = x[k]; });
    MONSTERS[id] = d;
    return d;
  }

  // --- Rang E : Crypte oubliée
  mk('gobelin_failles', 'Gobelin des failles', 'E', ['crypte', 'foret'], 'goblin', 'flanker',
    { pv: 20, speed: 4.0, dmg: 5, xp: 5, gold: [2, 5], attackCd: 1.8, range: 1.3 },
    { icon: '👺', resist: { ombre: 0.7 }, weak: { foudre: 1.3 }, packTag: 'gobelins', group: [2, 4], lunge: { len: 3.2, windup: 0.45 },
      desc: 'Contourne le héros et plonge dans son dos.' });
  mk('chaman_gobelin', 'Chamane gobelin', 'E', ['crypte', 'foret'], 'goblinShaman', 'support',
    { pv: 18, speed: 2.6, dmg: 4, xp: 7, gold: [3, 6], attackCd: 2.4, range: 8, projectile: 'orb', projSpeed: 9 },
    { icon: '🧙', element: 'poison', resist: { poison: 0.5 }, weak: { feu: 1.3 }, packTag: 'gobelins', healPct: 0.25,
      desc: 'Soigne et accélère ses alliés. À éliminer en priorité.' });
  mk('larve_essaim', 'Larve de crypte', 'E', ['crypte', 'catacombes'], 'larva', 'swarm',
    { pv: 8, speed: 4.4, dmg: 2, xp: 2, gold: [1, 1], attackCd: 0.8, range: 0.9 },
    { icon: '🐛', element: 'poison', weak: { feu: 1.5 }, scale: 0.85, packTag: 'larves', group: [5, 8],
      desc: 'Arrive par dizaines. Faible seule, dangereuse en nuée.' });
  mk('larve_mere', 'Mère des larves', 'E', ['crypte', 'catacombes'], 'larva', 'melee',
    { pv: 40, speed: 2.2, dmg: 5, xp: 8, gold: [3, 6], attackCd: 1.6, range: 1.6 },
    { icon: '🪱', element: 'poison', weak: { feu: 1.4 }, scale: 1.7, tint: 0xd6b25a, packTag: 'larves',
      abilities: ['splitOnDeath'], splitInto: 'larve_essaim', splitCount: 4, desc: 'Éclate en larves à sa mort.' });
  mk('mimique', 'Mimique', 'E', ['crypte', 'foret', 'catacombes', 'glace', 'abysse', 'volcan'], 'mimic', 'mimic',
    { pv: 60, speed: 3.4, dmg: 11, xp: 16, gold: [20, 40], attackCd: 2.0, range: 1.7 },
    { icon: '📦', resist: { physique: 0.85 }, weak: { feu: 1.4 }, disguise: 'chest', spawnChance: 0.08, revealRadius: 3.2,
      desc: 'Un coffre qui mord ! Hésitez avant d\'ouvrir.' });
  mk('specimen_dore', 'Spécimen doré', 'E', ['crypte', 'foret', 'catacombes', 'glace', 'abysse', 'volcan'], 'goldCritter', 'fleeing',
    { pv: 50, speed: 5.4, dmg: 0, xp: 30, gold: [60, 120], attackCd: 1, range: 0 },
    { icon: '✨', rare: true, rareChance: 0.01, escapeTime: 13, resist: { physique: 0.9 },
      desc: 'Ultra rare (1 %). Il fuit : frappez vite pour une pluie d\'or !' });

  // --- Rang D : Forêt des Murmures
  mk('champignon_bombe', 'Champignon bombe', 'D', ['foret', 'crypte'], 'mushroomBomb', 'bomber',
    { pv: 14, speed: 3.2, dmg: 12, xp: 6, gold: [1, 4], attackCd: 1, range: 2.8 },
    { icon: '🍄', element: 'poison', weak: { feu: 1.5 }, packTag: 'fongus', group: [2, 4], blastRadius: 2.4,
      desc: 'Fonce et explose après une courte mèche. Reculez !' });
  mk('loup_cendre', 'Loup de cendre', 'D', ['foret', 'volcan'], 'wolf', 'pack',
    { pv: 28, speed: 4.2, dmg: 6, xp: 8, gold: [2, 6], attackCd: 2.4, range: 5 },
    { icon: '🐺', element: 'feu', resist: { feu: 0.5 }, weak: { glace: 1.4 }, packTag: 'loups', group: [3, 5],
      desc: 'Chasse en meute : encercle puis bondit à tour de rôle.' });
  mk('naga_marais', 'Naga des marais', 'D', ['foret', 'abysse'], 'naga', 'kiter',
    { pv: 34, speed: 2.8, dmg: 6, xp: 10, gold: [3, 7], attackCd: 2.2, range: 8.5, projectile: 'orb', projSpeed: 9.5 },
    { icon: '🐍', element: 'poison', resist: { poison: 0.2 }, weak: { foudre: 1.4 }, burst: 2, abilities: ['poisonTouch'],
      desc: 'Crache des globes de venin en reculant.' });
  mk('porte_bouclier', 'Porte-bouclier', 'D', ['catacombes', 'crypte', 'glace'], 'shieldBearer', 'guardian',
    { pv: 55, speed: 2.4, dmg: 7, xp: 11, gold: [4, 8], attackCd: 2.2, range: 1.8 },
    { icon: '🛡️', resist: { physique: 0.6 }, weak: { foudre: 1.4 }, packTag: 'garde', shieldPct: 0.3,
      desc: 'Pose une barrière sur ses alliés proches. Frappez-le en dernier... ou en premier.' });

  // --- Rang C : Catacombes du Roi
  mk('sentinelle_runique', 'Sentinelle runique', 'C', ['catacombes', 'crypte', 'abysse'], 'runeSentinel', 'turret',
    { pv: 32, speed: 0, dmg: 8, xp: 14, gold: [5, 10], attackCd: 3.0, range: 12, projectile: 'orb', projSpeed: 15 },
    { icon: '🗿', element: 'sacre', resist: { physique: 0.5, sacre: 0.2 }, weak: { ombre: 1.4, foudre: 1.3 },
      desc: 'Immobile. Tire des rayons annoncés, puis une nova de runes.' });
  mk('mante_acier', "Mante d'acier", 'C', ['foret', 'catacombes', 'volcan'], 'mantis', 'flanker',
    { pv: 15, speed: 4.8, dmg: 4, xp: 10, gold: [3, 7], attackCd: 1.6, range: 1.4 },
    { icon: '🦗', resist: { physique: 0.6 }, weak: { foudre: 1.5, feu: 1.2 }, lunge: { len: 4.2, windup: 0.4, combo: 2 },
      desc: 'Double fente rapide dans le dos. Blindée contre le physique.' });
  mk('chevalier_spectral', 'Chevalier spectral', 'C', ['catacombes', 'abysse', 'crypte'], 'spectralKnight', 'teleporter',
    { pv: 27, speed: 3.0, dmg: 5, xp: 15, gold: [5, 10], attackCd: 2.6, range: 2.2 },
    { icon: '👻', element: 'ombre', resist: { physique: 0.4, ombre: 0.3 }, weak: { sacre: 1.6, feu: 1.2 }, deathRadius: 2.2,
      desc: 'Disparaît puis surgit à côté de vous : fuyez le cercle annoncé.' });
  mk('fossoyeur', 'Fossoyeur', 'C', ['catacombes', 'crypte'], 'gravedigger', 'summoner',
    { pv: 23, speed: 2.4, dmg: 3, xp: 14, gold: [5, 10], attackCd: 2.4, range: 9, projectile: 'bone', projSpeed: 10 },
    { icon: '⚰️', element: 'ombre', resist: { ombre: 0.5, poison: 0.5 }, weak: { sacre: 1.5 }, summon: 'squelette', summonCount: 2, summonMax: 4,
      desc: 'Relève des squelettes depuis le sol. Garde ses distances.' });
  mk('ver_tombes', 'Ver des tombes', 'C', ['catacombes', 'crypte'], 'tombWorm', 'burrower',
    { pv: 27, speed: 3.0, dmg: 5, xp: 14, gold: [5, 10], attackCd: 3.2, range: 1.8 },
    { icon: '🪱', resist: { physique: 0.8 }, weak: { feu: 1.3, foudre: 1.3 }, blastRadius: 2.0,
      desc: "S'enfouit, avance sous terre puis surgit sous vos pieds (cercle annoncé)." });
  mk('ogre_berserker', 'Ogre berserker', 'C', ['foret', 'volcan', 'catacombes'], 'ogre', 'charger',
    { pv: 55, speed: 2.6, dmg: 7, xp: 24, gold: [10, 18], attackCd: 2.6, range: 6 },
    { icon: '👹', weak: { glace: 1.3 }, abilities: ['enrage'], desc: 'Charge en ligne droite. Entre en rage sous 40 % de PV.' });

  // --- Rang B : Pics Gelés
  mk('golem_cristal', 'Golem de cristal mineur', 'B', ['glace', 'abysse'], 'crystalGolem', 'melee',
    { pv: 44, speed: 1.9, dmg: 6, xp: 28, gold: [12, 22], attackCd: 2.2, range: 1.9 },
    { icon: '💎', element: 'glace', resist: { glace: 0.2, physique: 0.7 }, weak: { foudre: 1.5, feu: 1.3 }, scale: 1.1,
      desc: 'Lent et résistant. La foudre fait voler ses cristaux en éclats.' });
  mk('lynx_givre', 'Lynx du givre', 'B', ['glace'], 'wolf', 'pack',
    { pv: 9, speed: 4.6, dmg: 3, xp: 12, gold: [4, 9], attackCd: 2.2, range: 5 },
    { icon: '🐆', element: 'glace', resist: { glace: 0.2 }, weak: { feu: 1.5 }, tint: 0xcdeeff, scale: 0.92, packTag: 'lynx', group: [3, 4],
      desc: 'Meute de félins des neiges. Même tactique que les loups.' });
  mk('chamane_givre', 'Chamane des glaces', 'B', ['glace'], 'goblinShaman', 'support',
    { pv: 7, speed: 2.6, dmg: 3, xp: 12, gold: [5, 10], attackCd: 2.4, range: 8, projectile: 'ice', projSpeed: 11 },
    { icon: '❄️', element: 'glace', resist: { glace: 0.2 }, weak: { feu: 1.5 }, tint: 0x9be7ff, packTag: 'lynx', healPct: 0.3,
      desc: 'Soigne et hâte la meute. Tire des éclats de glace.' });

  // --- Rang A : Abysse sans fond
  mk('elementaire_foudre', 'Élémentaire de foudre', 'A', ['abysse', 'glace', 'volcan'], 'stormElemental', 'teleporter',
    { pv: 14, speed: 3.4, dmg: 3.6, xp: 22, gold: [8, 15], attackCd: 2.4, range: 8, projectile: 'orb', projSpeed: 15 },
    { icon: '⚡', element: 'foudre', resist: { foudre: 0.1, physique: 0.7 }, weak: { glace: 1.4 }, deathRadius: 2.2,
      desc: 'Se téléporte d\'éclair en éclair et tire des orbes rapides.' });
  mk('ombre_rampante', 'Ombre rampante', 'A', ['abysse', 'catacombes'], 'shadowCrawler', 'flanker',
    { pv: 11, speed: 5.0, dmg: 3.9, xp: 20, gold: [8, 14], attackCd: 1.6, range: 1.4 },
    { icon: '🕷️', element: 'ombre', resist: { ombre: 0.2, physique: 0.7 }, weak: { sacre: 1.6 }, lunge: { len: 4.6, windup: 0.42 },
      desc: 'Rapide et basse. Frappe dans le dos, fuit la lumière.' });
  mk('ame_instable', 'Âme instable', 'A', ['abysse', 'catacombes'], 'wispBomb', 'bomber',
    { pv: 6, speed: 3.6, dmg: 6.5, xp: 16, gold: [5, 12], attackCd: 1, range: 3 },
    { icon: '💥', element: 'ombre', resist: { ombre: 0.3 }, weak: { sacre: 1.5 }, blastRadius: 3.2, group: [2, 3],
      desc: 'Explosion large après une mèche. Tuez-la à distance !' });

  // --- Rang S : Cœur du Volcan
  mk('salamandre_magma', 'Salamandre de magma', 'S', ['volcan'], 'salamander', 'kiter',
    { pv: 14, speed: 3.2, dmg: 4, xp: 36, gold: [14, 26], attackCd: 2.0, range: 9, projectile: 'flame', projSpeed: 12 },
    { icon: '🦎', element: 'feu', resist: { feu: 0, physique: 0.9 }, weak: { glace: 1.6 }, burst: 3, abilities: ['regen'],
      desc: 'Salves de flammes en éventail, recule quand on approche.' });
  mk('colosse_obsidienne', "Colosse d'obsidienne", 'S', ['volcan', 'abysse'], 'obsidianColossus', 'melee',
    { pv: 34, speed: 2.0, dmg: 6.7, xp: 55, gold: [25, 45], attackCd: 2.6, range: 2.2 },
    { icon: '🌋', element: 'feu', resist: { physique: 0.6, feu: 0.3 }, weak: { glace: 1.6, foudre: 1.2 }, abilities: ['enrage'],
      desc: 'Coups lents mais dévastateurs. Très résistant.' });

  // --- Rang Z : Souverain
  mk('ver_cendres', 'Ver de cendres', 'Z', ['volcan', 'abysse'], 'ashWyrm', 'burrower',
    { pv: 30, speed: 3.2, dmg: 4.8, xp: 60, gold: [30, 50], attackCd: 3.0, range: 2.2 },
    { icon: '🐉', element: 'feu', resist: { feu: 0.2 }, weak: { glace: 1.5 }, blastRadius: 3.0, scale: 1.15,
      desc: 'Un ver colossal. Cercle d\'éruption énorme.' });
  mk('archonte_voile', 'Archonte du Voile', 'Z', ['abysse'], 'veilArchon', 'summoner',
    { pv: 30, speed: 3.0, dmg: 5, xp: 70, gold: [35, 60], attackCd: 2.2, range: 9, projectile: 'orb', projSpeed: 12 },
    { icon: '🎭', element: 'ombre', resist: { ombre: 0.1, physique: 0.7 }, weak: { sacre: 1.7 }, summon: 'ombre_rampante', summonCount: 2, summonMax: 4,
      abilities: ['blink', 'barrier'], desc: 'Invoque des ombres, se téléporte et se protège.' });

  // ------------------------------------------------------------------
  //  3. Affixes d'élites
  //  mods : multiplicateurs ; abilities : ids de capacités (ai.js) ; resist/weak : multipliés ;
  //  summon : id invoqué par l'affixe « summoner ».
  // ------------------------------------------------------------------
  const AFFIXES = {
    enrage:      { id: 'enrage', name: 'Enragé', icon: '😡', color: 0xff3b2f, minRank: 'E', mods: { dmg: 1.2, pv: 1.2 }, abilities: ['enrage'], desc: 'Entre en rage sous 40 % de PV (+35 % dégâts, +25 % vitesse).' },
    armored:     { id: 'armored', name: 'Blindé', icon: '🛡️', color: 0x9aa5b5, minRank: 'E', mods: { pv: 1.35, speed: 0.9 }, resist: { physique: 0.55 }, abilities: [], desc: 'Résiste fortement aux coups physiques, plus lent.' },
    vampiric:    { id: 'vampiric', name: 'Vampirique', icon: '🧛', color: 0xb0123a, minRank: 'D', mods: { dmg: 1.1 }, abilities: ['lifesteal'], desc: 'Se soigne en vous touchant.' },
    explosive:   { id: 'explosive', name: 'Explosif', icon: '💣', color: 0xff8a1a, minRank: 'E', mods: { pv: 0.9 }, abilities: ['deathExplosion'], desc: 'Explose à sa mort (zone annoncée 0,9 s).' },
    teleporter:  { id: 'teleporter', name: 'Téléporteur', icon: '🌀', color: 0x6a8cff, minRank: 'D', mods: {}, abilities: ['blink'], desc: 'Se téléporte près de vous (point d\'arrivée annoncé).' },
    summoner:    { id: 'summoner', name: 'Invocateur', icon: '🔮', color: 0xb44dff, minRank: 'C', mods: { pv: 1.1 }, abilities: ['summon'], summon: 'larve_essaim', desc: 'Invoque des renforts toutes les 9 s.' },
    regenerating:{ id: 'regenerating', name: 'Régénérant', icon: '💚', color: 0x3fd07a, minRank: 'E', mods: { pv: 1.2 }, abilities: ['regen'], desc: 'Récupère des PV hors combat.' },
    swift:       { id: 'swift', name: 'Véloce', icon: '💨', color: 0xffe14a, minRank: 'E', mods: { speed: 1.3, attackCd: 0.8 }, abilities: [], desc: 'Plus rapide, attaque plus souvent.' },
    venomous:    { id: 'venomous', name: 'Venimeux', icon: '☠️', color: 0x7cc82a, minRank: 'D', mods: {}, abilities: ['poisonTouch'], desc: 'Ses coups empoisonnent (poison léger sur 3 s).' },
    colossal:    { id: 'colossal', name: 'Colossal', icon: '🗻', color: null, minRank: 'C', mods: { scale: 1.35, pv: 1.5, dmg: 1.3, speed: 0.85 }, abilities: [], desc: 'Énorme, résistant, lent.' },
    warded:      { id: 'warded', name: 'Protégé', icon: '🔰', color: 0x6fd0ff, minRank: 'B', mods: {}, abilities: ['barrier'], desc: 'Génère une barrière absorbante toutes les 9 s.' },
  };
  const AFFIX_EXCLUSIVE = [['armored', 'colossal'], ['swift', 'colossal'], ['enrage', 'swift']];

  const ELITE_BASE = { pv: 1.4, dmg: 1.25, xp: 3, gold: 3, scale: 1.2 };

  function cloneDef(d) {
    const c = Object.assign({}, d);
    if (Array.isArray(d.gold)) c.gold = d.gold.slice();
    c.resist = Object.assign({}, d.resist || {});
    c.weak = Object.assign({}, d.weak || {});
    c.abilities = (d.abilities || []).slice();
    if (d.affixes) c.affixes = d.affixes.slice();
    if (d.group) c.group = d.group.slice();
    return c;
  }

  /** Élite : applique ids d'affixes (+ bonus d'élite de base si pas déjà élite). Idempotent par affixe. */
  function makeElite(def, affixIds) {
    const d = cloneDef(def);
    const ids = (affixIds || []).filter((id) => AFFIXES[id] && !(d.affixes || []).includes(id));
    if (!d.elite) {
      d.elite = true;
      d.pv = Math.round(d.pv * ELITE_BASE.pv); d.dmg = Math.round(d.dmg * ELITE_BASE.dmg);
      d.xp = Math.round(d.xp * ELITE_BASE.xp);
      d.gold = Array.isArray(d.gold) ? d.gold.map((g) => Math.round(g * ELITE_BASE.gold)) : d.gold;
      d.scale = r2(num(d.scale, 1) * ELITE_BASE.scale);
    }
    d.affixes = d.affixes || [];
    ids.forEach((id) => {
      const a = AFFIXES[id];
      const m = a.mods || {};
      if (m.pv) d.pv = Math.round(d.pv * m.pv);
      if (m.dmg) d.dmg = Math.round(d.dmg * m.dmg);
      if (m.speed) d.speed = r2(d.speed * m.speed);
      if (m.attackCd) d.attackCd = r2(d.attackCd * m.attackCd);
      if (m.scale) d.scale = r2(Math.min(1.8, num(d.scale, 1) * m.scale));
      Object.keys(a.resist || {}).forEach((k) => { d.resist[k] = r2((d.resist[k] != null ? d.resist[k] : 1) * a.resist[k]); });
      Object.keys(a.weak || {}).forEach((k) => { d.weak[k] = r2((d.weak[k] != null ? d.weak[k] : 1) * a.weak[k]); });
      (a.abilities || []).forEach((ab) => { if (!d.abilities.includes(ab)) d.abilities.push(ab); });
      if (a.summon && !d.summon) d.summon = a.summon;
      if (a.color != null && ids[0] === id) d.tint = a.color;
      d.affixes.push(id);
    });
    if (ids.length) {
      d.baseName = d.baseName || def.name;
      d.name = d.baseName + ' · ' + d.affixes.map((i) => AFFIXES[i].name).join(' · ');
      d.eliteTint = d.tint;
    }
    return d;
  }

  /** Tire n affixes compatibles disponibles au rang donné (G.rng). */
  function rollAffixes(rank, n, exclude) {
    const ri = rIdx(rank);
    const rng = G.rng || { pick: (a) => a[Math.floor(Math.random() * a.length)] };
    const pool = Object.keys(AFFIXES).filter((id) => rIdx(AFFIXES[id].minRank) <= ri && !(exclude || []).includes(id));
    const out = [];
    let guard = 20;
    while (out.length < n && pool.length && guard-- > 0) {
      const id = rng.pick(pool);
      if (out.includes(id)) continue;
      if (AFFIX_EXCLUSIVE.some(([a, b]) => (a === id && out.includes(b)) || (b === id && out.includes(a)))) continue;
      out.push(id);
    }
    return out;
  }
  const affixCountForRank = (rank) => (rIdx(rank) >= 5 ? 3 : rIdx(rank) >= 3 ? 2 : 1);

  /** Mise à l'échelle par rang (relative à def._rank / rankMin). Idempotente : scale(scale(d,'B'),'B') === même stats. */
  function scale(def, rank) {
    if (!def || !RANKS.includes(rank)) return def;
    const from = RANKS.includes(def._rank) ? def._rank : (RANKS.includes(def.rankMin) ? def.rankMin : 'E');
    if (from === rank) return def;
    const a = rIdx(from), b = rIdx(rank);
    const f = (k) => RANK_MULT[k][b] / RANK_MULT[k][a];
    const d = cloneDef(def);
    d.pv = Math.max(1, Math.round(def.pv * f('pv')));
    d.dmg = Math.round(def.dmg * f('dmg'));
    d.speed = r2(def.speed * f('speed'));
    d.xp = Math.round(def.xp * f('xp'));
    if (Array.isArray(def.gold)) d.gold = def.gold.map((g) => Math.max(1, Math.round(g * f('gold'))));
    d.attackCd = r2(def.attackCd * f('attackCd'));
    d.aggro = RANK_MULT.aggro[b];
    d._rank = rank;
    return d;
  }

  // ------------------------------------------------------------------
  //  3b. Ids demandés par js/data/dungeons.js (dérivés d'espèces existantes : même modèle/IA, autre nom/teinte/stats)
  //  derive(id, name, srcId, rank, overrides, affixes?) : copie de srcId remise à l'échelle au rang donné.
  // ------------------------------------------------------------------
  function derive(id, name, srcId, rank, over, affixes) {
    let d = scale(cloneDef(MONSTERS[srcId]), rank);
    d = cloneDef(d);
    over = over || {};
    const sm = over.statMult || {};
    delete over.statMult;
    Object.assign(d, over);
    if (sm.pv) d.pv = Math.round(d.pv * sm.pv);
    if (sm.dmg) d.dmg = Math.round(d.dmg * sm.dmg);
    d.id = id; d.name = name; d.rankMin = rank; d._rank = rank; d.v2 = false;
    delete d.baseName; delete d.affixes;
    d.elite = !!over.elite;
    if (affixes && affixes.length) { d.elite = false; d = makeElite(d, affixes); d.id = id; d.name = name; d.baseName = name; }
    MONSTERS[id] = d;
    return d;
  }
  const ALL = ['crypte', 'foret', 'catacombes', 'glace', 'abysse', 'volcan'];
  // Rang E / D
  derive('gobelin', 'Gobelin', 'gobelin_failles', 'E', { ai: 'melee', range: 1.4, packTag: 'gobelins', desc: 'Petit pillard hargneux.' });
  derive('gobelin_archer', 'Gobelin archer', 'squelette_archer', 'E', { model: 'goblin', element: 'physique', resist: {}, weak: { foudre: 1.3 }, packTag: 'gobelins', desc: 'Tire à l\'arc depuis l\'arrière.' });
  derive('gobelin_rageur', 'Gobelin rageur', 'gobelin_failles', 'E', { ai: 'swarm', tint: 0xd94a3a, speed: 5.0, dmg: 3, abilities: ['enrage'], packTag: 'gobelins', desc: 'Fonce en rage. Fragile.' });
  derive('gobelin_chef', 'Chef gobelin', 'gobelin', 'E', { packTag: 'gobelins', tint: 0xffc15a }, ['enrage', 'regenerating']);
  derive('spectre_lanterne', 'Spectre à lanterne', 'spectre', 'E', { tint: 0xffe08a, themes: ['crypte', 'catacombes'], desc: 'Une lueur trompeuse qui lance des orbes.' });
  derive('veilleur_lanterne', 'Veilleur de la lanterne', 'spectre_lanterne', 'E', { tint: 0xffd23f }, ['warded', 'summoner']);
  derive('crapaud_toxique', 'Crapaud toxique', 'slime_moussu', 'D', { tint: 0x7fa030, ai: 'melee', range: 1.5, abilities: ['poisonTouch'], themes: ['foret'], packTag: 'marais', desc: 'Ses morsures empoisonnent.' });
  derive('crapaud_ancien', 'Crapaud ancien', 'crapaud_toxique', 'D', { packTag: 'marais' }, ['colossal', 'venomous']);
  derive('moustique_geant', 'Moustique géant', 'chauve_souris_foret', 'D', { tint: 0x6b5b3a, themes: ['foret'], packTag: 'marais', element: 'poison', desc: 'Nuée rapide et agaçante.' });
  derive('loup_gris', 'Loup gris', 'loup_cendre', 'D', { tint: 0x9aa0a8, element: 'physique', resist: {}, weak: { foudre: 1.2 }, themes: ['foret'], desc: 'Meute de forêt.' });
  derive('loup_alpha', 'Loup alpha', 'loup_gris', 'D', {}, ['enrage', 'swift']);
  // Rang C / B
  derive('gladiateur_spectral', 'Gladiateur spectral', 'chevalier_maudit', 'C', { tint: 0x8fb8ff, element: 'ombre', resist: { physique: 0.6, ombre: 0.4 }, weak: { sacre: 1.5 }, themes: ['catacombes', 'abysse'] });
  derive('squelette_dore', 'Squelette doré', 'specimen_dore', 'D', { model: 'skeleton', tint: 0xffd23f, tags: ['golden'], escapeTime: 14, themes: ALL, desc: 'Un squelette en or massif : il fuit, vite !' });
  derive('grimoire_vivant', 'Grimoire vivant', 'fossoyeur', 'C', { model: 'livingTome', ai: 'kiter', element: 'ombre', projectile: 'orb', projSpeed: 11, burst: 3, summon: undefined, themes: ['catacombes', 'crypte'], desc: 'Un livre volant qui lance des salves de pages-lames.' });
  derive('mage_spectral', 'Mage spectral', 'spectre', 'C', { tint: 0x9fd0ff, abilities: ['blink'], themes: ['catacombes', 'abysse'] });
  derive('archiviste_elite', 'Archiviste spectral', 'mage_spectral', 'C', {}, ['warded', 'teleporter']);
  derive('soldat_ombre_errant', "Soldat d'ombre errant", 'squelette_abyssal', 'B', { tint: 0x241338, element: 'ombre', resist: { ombre: 0.3, physique: 0.8 }, weak: { sacre: 1.6 }, themes: ['abysse'] });
  derive('murene_spectrale', 'Murène spectrale', 'ver_tombes', 'B', { tint: 0x7fd8ff, element: 'ombre', themes: ['abysse'], desc: 'Nage sous la surface puis surgit.' });
  // Rang A / S / Z
  derive('sentinelle_celeste', 'Sentinelle céleste', 'sentinelle_runique', 'A', { tint: 0xfff2a8, themes: ['glace', 'abysse'], desc: 'Gardienne des cieux : rayons et nova sacrée.' });
  derive('sentinelle_faille', 'Sentinelle de la faille', 'sentinelle_runique', 'S', { tint: 0xb44dff, element: 'ombre', resist: { ombre: 0.2, physique: 0.5 }, weak: { sacre: 1.4 }, themes: ['abysse', 'volcan'] });
  derive('horreur_cristalline', 'Horreur cristalline', 'golem_cristal', 'S', { tint: 0xd68cff, element: 'ombre', abilities: ['barrier'], themes: ['abysse', 'volcan'] });
  derive('golem_forge', 'Golem de forge', 'colosse_obsidienne', 'S', { model: 'obsidianColossus', tint: 0xd35a1f, scale: 0.95, themes: ['volcan'] });
  derive('spectre_neant', 'Spectre du Néant', 'spectre_abyssal', 'Z', { tint: 0x3a0066, abilities: ['blink'], themes: ['abysse'] });
  derive('chevalier_neant', 'Chevalier du Néant', 'chevalier_spectral', 'Z', { tint: 0x2b0050, themes: ['abysse'] });
  MONSTERS.specimen_dore.tags = ['golden'];
  MONSTERS.specimen_dore.tint = null;

  // ------------------------------------------------------------------
  //  3c. v5 « Ténèbres » — populations EXCLUSIVES par donjon (agent 7)
  //  Catégories (def.category) : classique | rare | elite | dangereux | secret
  //  Chaque monstre a son modèle 3D (model === id, voir gfx/monster-models.js), sa famille sonore (def.sfxFam)
  //  et joue G.Audio.at('monstre_<id>_<cri|attaque|mort|pas|murmure|indice|souffle|chant>', x, z) via js/sys/ai.js.
  // ------------------------------------------------------------------
  const ROLES = {
    fodder: { pv: 8, speed: 4.4, dmg: 2.5, xp: 2, gold: [1, 2], attackCd: 0.9, range: 0.9 },
    fast: { pv: 14, speed: 4.2, dmg: 4.2, xp: 7, gold: [2, 5], attackCd: 1.7, range: 1.3 },
    melee: { pv: 22, speed: 3.0, dmg: 5, xp: 7, gold: [2, 5], attackCd: 1.8, range: 1.4 },
    tank: { pv: 42, speed: 2.2, dmg: 6, xp: 12, gold: [4, 9], attackCd: 2.2, range: 1.8 },
    brute: { pv: 52, speed: 2.0, dmg: 8, xp: 16, gold: [6, 12], attackCd: 2.6, range: 1.8 },
    ranged: { pv: 14, speed: 2.8, dmg: 4, xp: 8, gold: [3, 6], attackCd: 2.3, range: 9, projectile: 'arrow', projSpeed: 11 },
    caster: { pv: 12, speed: 2.6, dmg: 4.5, xp: 9, gold: [3, 7], attackCd: 2.4, range: 9, projectile: 'orb', projSpeed: 9.5 },
    amb: { pv: 24, speed: 3.2, dmg: 7, xp: 12, gold: [3, 7], attackCd: 2.0, range: 1.6 },
    stalk: { pv: 26, speed: 3.4, dmg: 7, xp: 14, gold: [4, 8], attackCd: 3.2, range: 1.4 },
    hunt: { pv: 34, speed: 3.6, dmg: 7, xp: 16, gold: [5, 10], attackCd: 3.0, range: 1.5 },
    scream: { pv: 18, speed: 2.8, dmg: 4, xp: 12, gold: [4, 8], attackCd: 2.0, range: 11 },
    passive: { pv: 30, speed: 2.2, dmg: 4, xp: 20, gold: [10, 20], attackCd: 2.4, range: 1.6 },
    loot: { pv: 50, speed: 5.4, dmg: 0, xp: 30, gold: [60, 120], attackCd: 1, range: 0 },
  };
  const CATEGORY_WEIGHT = { classique: 1, dangereux: 0.12, elite: 0.1, rare: 0.025, secret: 0 };

  /** M(id, name, rank, theme, ai, role, o) — o : {cat, fam, el, res, weak, ab, desc, stat:{pv,speed,dmg…}, x:{champs def}, group, tint, scale, danger} */
  function M(id, name, rank, theme, ai, role, o) {
    o = o || {};
    const base = Object.assign({}, ROLES[role] || ROLES.melee, o.stat || {});
    const x = { icon: o.icon || '👾', element: o.el || 'physique', resist: o.res || {}, weak: o.weak || {}, abilities: o.ab || [], desc: o.desc || '',
      scale: o.scale, tint: o.tint, rare: o.cat === 'rare', packTag: o.pack || null, group: o.group };
    if (o.x) ['burst', 'blastRadius', 'summon', 'summonCount', 'summonMax', 'splitInto', 'splitCount', 'rareChance', 'escapeTime', 'lunge', 'healPct', 'shieldPct', 'deathRadius', 'revealRadius'].forEach((k) => { if (o.x[k] !== undefined) x[k] = o.x[k]; });
    const d = mk(id, name, rank, [theme], id, ai, base, x);
    d.category = o.cat || 'classique';
    d.sfxFam = o.fam || 'ombre';
    d.dungeon = theme;
    d.horror = !!o.danger || ['ambusher', 'weeping', 'stalker', 'hunter', 'screamer', 'mimic_wall', 'possessor', 'statue'].includes(ai);
    if (d.category === 'rare') { d.rareChance = 0.02; d.rare = true; }
    if (d.category === 'dangereux') d.danger = true;
    if (o.x) Object.keys(o.x).forEach((k) => { if (d[k] === undefined) d[k] = o.x[k]; });
    if (o.aff) { // élite : affixes
      const el = makeElite(d, o.aff);
      el.id = id; el.name = name; el.baseName = name; el.tint = o.tint === undefined ? null : o.tint; el.eliteTint = el.tint;
      el.category = 'elite'; MONSTERS[id] = el;
      return el;
    }
    return d;
  }
  const A_ = (l) => l; // lisibilité

  // ===== 1. LA MINE ABANDONNÉE (rang E · physique) =====
  M('mine_mineur_possede', 'Mineur possédé', 'E', 'mine_abandonnee', 'weeping', 'melee', { fam: 'goule', icon: '⛏️', res: { ombre: 0.8 }, weak: { feu: 1.3, sacre: 1.3 }, x: { creepMul: 1.25, stoneMult: 0.6 }, desc: 'Marche en boitant, la lampe éteinte. Il s\'immobilise quand on l\'éclaire de face.' });
  M('mine_rat_galerie', 'Rat de galerie', 'E', 'mine_abandonnee', 'swarm', 'fodder', { fam: 'bete', icon: '🐀', weak: { feu: 1.3 }, group: [4, 7], pack: 'rats_mine', desc: 'Pullule dans les galeries. Mordant en nuée.' });
  M('mine_chauve_souris_suie', 'Chauve-souris de suie', 'E', 'mine_abandonnee', 'swarm', 'fodder', { fam: 'nuee', icon: '🦇', el: 'ombre', res: { feu: 0.6 }, weak: { foudre: 1.3 }, stat: { speed: 4.8 }, group: [3, 5], desc: 'Sort des puits en nuage noir de suie.' });
  M('mine_rampant_puits', 'Rampant du puits', 'E', 'mine_abandonnee', 'ambusher', 'amb', { fam: 'goule', icon: '🕷️', weak: { feu: 1.3 }, danger: true, x: { hang: 'ceiling', revealRadius: 4.4, blastRadius: 2.2 }, desc: 'Accroché au plafond des galeries : tombe sur celui qui passe dessous (cercle annoncé).' });
  M('mine_lanterne_errante', 'Lanterne errante', 'E', 'mine_abandonnee', 'kiter', 'caster', { fam: 'spectre', icon: '🏮', el: 'feu', res: { feu: 0.3 }, weak: { glace: 1.4 }, x: { burst: 1 }, desc: 'Feu follet dans une lanterne : attire, puis crache des braises.' });
  M('mine_creuseur_aveugle', 'Creuseur aveugle', 'E', 'mine_abandonnee', 'burrower', 'tank', { fam: 'pierre', icon: '🪨', res: { physique: 0.85 }, weak: { foudre: 1.3 }, x: { blastRadius: 2.2 }, stat: { pv: 36 }, desc: 'Creuse sous terre et ressort sous vos pieds (cercle annoncé).' });
  M('mine_dynamiteur', 'Dynamiteur', 'E', 'mine_abandonnee', 'kiter', 'ranged', { fam: 'mineur', icon: '🧨', el: 'feu', res: { feu: 0.5 }, weak: { glace: 1.2 }, x: { burst: 1 }, stat: { projectile: 'fireball', projSpeed: 8.5, dmg: 5 }, desc: 'Lance des bâtons de grisou en reculant.' });
  M('mine_contremaitre_maudit', 'Contremaître maudit', 'E', 'mine_abandonnee', 'summoner', 'tank', { cat: 'elite', fam: 'mineur', icon: '📯', aff: ['armored', 'regenerating'], res: { ombre: 0.8 }, x: { summon: 'mine_mineur_possede', summonCount: 2, summonMax: 4 }, stat: { projectile: 'bone', projSpeed: 9, range: 9 }, desc: 'Son sifflet appelle les mineurs possédés.' });
  M('mine_mineur_dore', 'Mineur doré', 'E', 'mine_abandonnee', 'fleeing', 'loot', { cat: 'rare', fam: 'mineur', icon: '🌟', res: { physique: 0.9 }, x: { escapeTime: 14 }, desc: 'Couvert de pépites d\'or. Il détale : frappez vite !' });
  M('mine_enfant_des_puits', 'Enfant des puits', 'E', 'mine_abandonnee', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🎶', el: 'ombre', x: { secretMode: 'vanish', vanishAfter: 4, fightAi: 'weeping', lines: ['♪ ... dans le noir ... ♪', '♪ ... ne me regarde pas ... ♪', '♪ ... tout au fond ... ♪'] }, desc: 'Chante dans le noir. Disparaît si on le regarde trop longtemps, en laissant un présent.' });
  M('mine_hurleur_des_puits', 'Hurleur des puits', 'E', 'mine_abandonnee', 'screamer', 'scream', { cat: 'dangereux', fam: 'cri', icon: '😱', el: 'ombre', weak: { foudre: 1.3 }, x: { screamRadius: 8, screamCd: 9 }, desc: 'Son hurlement ralentit le héros et rameute les mineurs.' });

  // ===== 2. LA FORÊT INTERDITE (rang E · poison) =====
  M('foret_rodeur_brume', 'Rôdeur de brume', 'E', 'foret_interdite', 'stalker', 'stalk', { fam: 'brume', icon: '🌫️', el: 'ombre', res: { ombre: 0.5, physique: 0.8 }, weak: { feu: 1.4, sacre: 1.3 }, danger: true, desc: 'Invisible dans la brume : suit hors de la lumière, frappe dans le dos, fuit votre lanterne.' });
  M('foret_loup_creux', 'Loup creux', 'E', 'foret_interdite', 'pack', 'fast', { fam: 'bete', icon: '🐺', weak: { feu: 1.3 }, group: [3, 4], pack: 'loups_creux', desc: 'Loup décharné aux côtes à nu. Chasse en meute.' });
  M('foret_araignee_sylve', 'Araignée sylvestre', 'E', 'foret_interdite', 'kiter', 'ranged', { fam: 'insecte', icon: '🕸️', el: 'poison', res: { poison: 0.4 }, weak: { feu: 1.5 }, stat: { projectile: 'web', projSpeed: 9 }, x: { burst: 1 }, desc: 'Crache des toiles depuis les branches.' });
  M('foret_spore_pleureuse', 'Spore pleureuse', 'E', 'foret_interdite', 'kiter', 'caster', { fam: 'vegetal', icon: '🍄', el: 'poison', res: { poison: 0.3 }, weak: { feu: 1.5 }, x: { burst: 2 }, desc: 'Champignon qui pleure des nuages de spores.' });
  M('foret_corbeau_charognard', 'Corbeau charognard', 'E', 'foret_interdite', 'swarm', 'fodder', { fam: 'nuee', icon: '🐦‍⬛', el: 'ombre', weak: { foudre: 1.3 }, stat: { speed: 4.8 }, group: [3, 5], desc: 'Tournoie au-dessus des blessés.' });
  M('foret_epouvantail', 'Épouvantail', 'E', 'foret_interdite', 'weeping', 'melee', { fam: 'pierre', icon: '🎃', res: { physique: 0.8 }, weak: { feu: 1.6 }, danger: true, x: { creepMul: 1.5, stoneMult: 0.5 }, desc: 'N\'avance que lorsqu\'on ne le regarde pas.' });
  M('foret_chasseur_egare', 'Chasseur égaré', 'E', 'foret_interdite', 'kiter', 'ranged', { fam: 'goule', icon: '🏹', weak: { sacre: 1.2 }, x: { burst: 1 }, desc: 'Un chasseur qui ne sait plus ce qu\'il traque.' });
  M('foret_ent_pourri', 'Ent pourri', 'E', 'foret_interdite', 'brute', 'brute', { cat: 'elite', fam: 'vegetal', icon: '🌳', el: 'poison', aff: ['colossal', 'venomous'], res: { poison: 0.3 }, weak: { feu: 1.6 }, x: { slamRadius: 2.4, windup: 1.0 }, desc: 'Un arbre mort qui marche. Ses racines frappent le sol.' });
  M('foret_cerf_blanc', 'Cerf blanc', 'E', 'foret_interdite', 'fleeing', 'loot', { cat: 'rare', fam: 'bete', icon: '🦌', el: 'sacre', stat: { speed: 5.8 }, x: { escapeTime: 15 }, desc: 'Apparition rarissime. Ses bois sont précieux.' });
  M('foret_fee_noire', 'Fée noire', 'E', 'foret_interdite', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🧚', el: 'ombre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Suis ma lumière...', 'Par ici...', 'N\'aie pas peur...'], projectile: 'orb' }, stat: { projectile: 'orb', projSpeed: 10, range: 9 }, desc: 'Une lumière qui guide vers un coffre... ou vers un piège.' });
  M('foret_traqueur_cornu', 'Traqueur cornu', 'E', 'foret_interdite', 'hunter', 'hunt', { cat: 'dangereux', fam: 'bete', icon: '🦴', res: { poison: 0.6 }, weak: { feu: 1.3 }, desc: 'Crâne de cerf sur un corps de loup. Traque sans relâche, pas lourds audibles.' });

  // ===== 3. LES CATACOMBES OUBLIÉES (rang D · ombre) =====
  M('cata_squelette_niche', 'Squelette des niches', 'D', 'catacombes_oubliees', 'ambusher', 'amb', { fam: 'os', icon: '💀', el: 'physique', res: { poison: 0.5, ombre: 0.7 }, weak: { sacre: 1.5 }, x: { hang: 'floor', revealRadius: 3.6, blastRadius: 2.0 }, desc: 'Jaillit des niches murales quand on passe.' });
  M('cata_goule', 'Goule', 'D', 'catacombes_oubliees', 'crawler', 'fast', { fam: 'goule', icon: '🧟', el: 'poison', res: { poison: 0.5 }, weak: { sacre: 1.4, feu: 1.2 }, x: { lunge: { len: 4.0, windup: 0.4 } }, desc: 'Rapide, courbée, en zigzag. Bondit puis détale.' });
  M('cata_ossuaire_rampant', 'Ossuaire rampant', 'D', 'catacombes_oubliees', 'swarm', 'fodder', { fam: 'os', icon: '🦴', weak: { sacre: 1.4 }, group: [4, 6], desc: 'Un tas d\'os qui rampe par dizaines.' });
  M('cata_pleureuse', 'Pleureuse', 'D', 'catacombes_oubliees', 'kiter', 'caster', { fam: 'spectre', icon: '😢', el: 'ombre', res: { ombre: 0.3, physique: 0.6 }, weak: { sacre: 1.6 }, desc: 'On l\'entend pleurer longtemps avant de la voir.' });
  M('cata_rat_cadavre', 'Rat de cadavre', 'D', 'catacombes_oubliees', 'swarm', 'fodder', { fam: 'bete', icon: '🐀', el: 'poison', weak: { feu: 1.3 }, group: [5, 8], desc: 'Gras, pâle, nourri de défunts.' });
  M('cata_lanceur_os', 'Lanceur d\'os', 'D', 'catacombes_oubliees', 'kiter', 'ranged', { fam: 'os', icon: '🦴', res: { poison: 0.5 }, weak: { sacre: 1.5 }, stat: { projectile: 'bone' }, x: { burst: 1 }, desc: 'Arrache ses propres côtes pour les lancer.' });
  M('cata_porteur_cercueil', 'Porteur de cercueil', 'D', 'catacombes_oubliees', 'guardian', 'tank', { fam: 'armure', icon: '⚰️', res: { physique: 0.6 }, weak: { foudre: 1.3 }, x: { shieldPct: 0.3 }, desc: 'Un cercueil sur le dos pour bouclier : protège ses alliés.' });
  M('cata_gardien_ossuaire', 'Gardien de l\'ossuaire', 'D', 'catacombes_oubliees', 'summoner', 'tank', { cat: 'elite', fam: 'os', icon: '☠️', aff: ['armored', 'summoner'], res: { poison: 0.5 }, weak: { sacre: 1.5 }, x: { summon: 'cata_ossuaire_rampant', summonCount: 3, summonMax: 6 }, stat: { projectile: 'bone', range: 9 }, desc: 'Assemble des squelettes avec les os du mur.' });
  M('cata_crane_dore', 'Crâne doré', 'D', 'catacombes_oubliees', 'fleeing', 'loot', { cat: 'rare', fam: 'os', icon: '💰', x: { escapeTime: 13 }, desc: 'Un crâne en or qui flotte et fuit en riant.' });
  M('cata_moine_sans_visage', 'Moine sans visage', 'D', 'catacombes_oubliees', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🙏', el: 'ombre', x: { secretMode: 'talk', fightAi: 'weeping', creepMul: 1.8, lines: ['... requiem aeternam ...', '... ne te retourne pas ...'] }, desc: 'Prie dans l\'ossuaire secret et ne se retourne jamais. Mieux vaut le laisser prier.' });
  M('cata_ame_voleuse', 'Âme voleuse', 'D', 'catacombes_oubliees', 'possessor', 'caster', { cat: 'dangereux', fam: 'spectre', icon: '👁️', el: 'ombre', res: { ombre: 0.3, physique: 0.6 }, weak: { sacre: 1.7 }, x: { possessMax: 3, host: 'possede_cadavre' }, desc: 'Saute de cadavre en cadavre : chaque corps qu\'elle habite se relève.' });
  // hôte générique des possesseurs (cadavre qui se relève)
  M('possede_cadavre', 'Cadavre possédé', 'D', 'catacombes_oubliees', 'brute', 'melee', { fam: 'goule', icon: '🧟', el: 'ombre', res: { ombre: 0.5 }, weak: { sacre: 1.4, feu: 1.2 }, stat: { pv: 30 }, x: { slamRadius: 1.7, windup: 0.7 }, desc: 'Un corps animé par une âme voleuse. Tuez-le pour la déloger.' });
  MONSTERS.possede_cadavre.themes = ['catacombes_oubliees', 'chateau_maudit', 'temple_sanglant', 'necropole_glace', 'asile_failles', 'abime_infernal'];

  // ===== 4. LE CHÂTEAU MAUDIT (rang D · ombre) =====
  M('chateau_armure_hantee', 'Armure hantée', 'D', 'chateau_maudit', 'statue', 'tank', { fam: 'armure', icon: '🛡️', res: { physique: 0.6, ombre: 0.5 }, weak: { foudre: 1.4, sacre: 1.3 }, x: { revealRadius: 3.2, slamRadius: 1.9 }, desc: 'Une armure sur son socle... qui s\'anime quand on passe devant.' });
  M('chateau_servante_spectrale', 'Servante spectrale', 'D', 'chateau_maudit', 'kiter', 'caster', { fam: 'spectre', icon: '🕯️', el: 'ombre', res: { ombre: 0.4, physique: 0.5 }, weak: { sacre: 1.5 }, desc: 'Sert un thé empoisonné d\'orbes d\'ombre.' });
  M('chateau_page_sans_tete', 'Page sans tête', 'D', 'chateau_maudit', 'flanker', 'fast', { fam: 'goule', icon: '🎭', el: 'ombre', weak: { sacre: 1.3 }, x: { lunge: { len: 3.6, windup: 0.45 } }, desc: 'Porte sa tête sous le bras ; contourne et frappe dans le dos.' });
  M('chateau_portrait_vivant', 'Portrait vivant', 'D', 'chateau_maudit', 'mimic_wall', 'tank', { fam: 'pierre', icon: '🖼️', el: 'ombre', res: { physique: 0.7 }, weak: { feu: 1.5 }, x: { reachLen: 6.5, revealRadius: 3.8 }, desc: 'Un tableau accroché au mur dont les mains peintes jaillissent à l\'approche.' });
  M('chateau_chandelier_ardent', 'Chandelier ardent', 'D', 'chateau_maudit', 'kiter', 'caster', { fam: 'meca', icon: '🕯️', el: 'feu', res: { feu: 0.2 }, weak: { glace: 1.5 }, stat: { projectile: 'flame', projSpeed: 11 }, x: { burst: 3 }, desc: 'Un lustre ambulant qui crache des flammes en éventail.' });
  M('chateau_rat_cour', 'Rat de cour', 'D', 'chateau_maudit', 'swarm', 'fodder', { fam: 'bete', icon: '🐀', group: [4, 6], weak: { feu: 1.3 }, desc: 'Rat à collerette, affamé des cuisines.' });
  M('chateau_dogue_maudit', 'Dogue maudit', 'D', 'chateau_maudit', 'charger', 'fast', { fam: 'bete', icon: '🐕', el: 'ombre', res: { ombre: 0.6 }, weak: { sacre: 1.3 }, stat: { range: 10, attackCd: 2.6 }, desc: 'Chien de garde aux yeux rouges. Charge en ligne droite.' });
  M('chateau_chevalier_noir', 'Chevalier noir', 'D', 'chateau_maudit', 'brute', 'brute', { cat: 'elite', fam: 'armure', icon: '♞', aff: ['enrage', 'armored'], el: 'ombre', res: { physique: 0.6 }, weak: { sacre: 1.3, foudre: 1.3 }, x: { slamRadius: 2.2, windup: 0.9 }, desc: 'Garde personnelle de la Comtesse.' });
  M('chateau_bouffon_rieur', 'Bouffon rieur', 'D', 'chateau_maudit', 'teleporter', 'melee', { cat: 'rare', fam: 'cri', icon: '🃏', el: 'ombre', stat: { pv: 60, xp: 30, gold: [50, 100] }, x: { arriveRadius: 2.0 }, desc: 'Rit sans cesse, disparaît et réapparaît. Butin généreux.' });
  M('chateau_enfant_au_miroir', 'Enfant du miroir', 'D', 'chateau_maudit', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🪞', el: 'ombre', x: { secretMode: 'shy', fightAi: 'kiter', lines: ['Tu me vois ?', 'Brise le miroir...', 'Je suis derrière...'] }, stat: { projectile: 'orb', projSpeed: 9, range: 8 }, desc: 'N\'apparaît que dans le reflet. S\'enfuit si l\'on approche.' });
  M('chateau_cavalier_sans_tete', 'Cavalier sans tête', 'D', 'chateau_maudit', 'hunter', 'hunt', { cat: 'dangereux', fam: 'armure', icon: '🐎', el: 'ombre', res: { physique: 0.6, ombre: 0.5 }, weak: { sacre: 1.4 }, stat: { speed: 4.0 }, x: { stamina: 14, lunge: { len: 8, windup: 0.7 } }, desc: 'Galop lointain, puis charge. Il s\'épuise s\'il ne vous rattrape pas.' });

  // ===== 5. LA CATHÉDRALE NOYÉE (rang C · glace) =====
  M('cathe_choriste_noye', 'Choriste noyé', 'C', 'cathedrale_noyee', 'brute', 'melee', { fam: 'noye', icon: '🎼', el: 'glace', res: { glace: 0.4 }, weak: { foudre: 1.3 }, stat: { speed: 2.2 }, x: { slamRadius: 1.7, windup: 0.8 }, desc: 'Chante sous l\'eau. Lent, mais son chant rameute.' });
  M('cathe_murene_nef', 'Murène de la nef', 'C', 'cathedrale_noyee', 'burrower', 'fast', { fam: 'liquide', icon: '🐍', el: 'glace', res: { glace: 0.3 }, weak: { foudre: 1.4 }, x: { blastRadius: 2.1 }, desc: 'Nage sous la surface puis jaillit de l\'eau.' });
  M('cathe_pretre_noye', 'Prêtre noyé', 'C', 'cathedrale_noyee', 'kiter', 'caster', { fam: 'noye', icon: '⛪', el: 'glace', res: { glace: 0.3 }, weak: { foudre: 1.3 }, stat: { projectile: 'ice', projSpeed: 10 }, x: { burst: 2 }, desc: 'Bénit à coups d\'eau glacée.' });
  M('cathe_crabe_reliquaire', 'Crabe-reliquaire', 'C', 'cathedrale_noyee', 'guardian', 'tank', { fam: 'pierre', icon: '🦀', res: { physique: 0.55 }, weak: { foudre: 1.4 }, x: { shieldPct: 0.3 }, desc: 'Une carapace ornée d\'une châsse sacrée. Très résistant.' });
  M('cathe_meduse_cierge', 'Méduse-cierge', 'C', 'cathedrale_noyee', 'swarm', 'fodder', { fam: 'liquide', icon: '🪼', el: 'glace', res: { glace: 0.3 }, weak: { feu: 1.2, foudre: 1.4 }, group: [3, 5], desc: 'Flotte comme une flamme de cierge ; brûle au contact.' });
  M('cathe_ange_pleureur', 'Ange pleureur', 'C', 'cathedrale_noyee', 'weeping', 'brute', { fam: 'pierre', icon: '👼', res: { physique: 0.6 }, weak: { foudre: 1.3 }, danger: true, x: { creepMul: 1.7, stoneMult: 0.35 }, desc: 'Statue qui avance quand on ne la regarde pas. Ne détournez pas les yeux.' });
  M('cathe_eveque_abysses', 'Évêque des abysses', 'C', 'cathedrale_noyee', 'summoner', 'tank', { cat: 'elite', fam: 'noye', icon: '🔱', el: 'glace', aff: ['warded', 'summoner'], res: { glace: 0.3 }, weak: { foudre: 1.3 }, x: { summon: 'cathe_choriste_noye', summonCount: 2, summonMax: 4 }, stat: { projectile: 'ice', range: 9 }, desc: 'Couronné de tentacules, il rappelle les noyés.' });
  M('cathe_perle_vivante', 'Perle vivante', 'C', 'cathedrale_noyee', 'fleeing', 'loot', { cat: 'rare', fam: 'liquide', icon: '🦪', el: 'glace', x: { escapeTime: 14 }, desc: 'Une perle noire qui roule hors de portée.' });
  M('cathe_sonneur_noye', 'Sonneur noyé', 'C', 'cathedrale_noyee', 'secret', 'passive', { cat: 'secret', fam: 'noye', icon: '🔔', el: 'glace', x: { secretMode: 'talk', fightAi: 'brute', lines: ['*dong*', '*dong*... *dong*...', 'La cloche n\'a plus de battant.'] }, desc: 'Sonne une cloche sans battant. Mieux vaut l\'écouter.' });
  M('cathe_etreinte_des_eaux', 'Étreinte des eaux', 'C', 'cathedrale_noyee', 'ambusher', 'amb', { cat: 'dangereux', fam: 'liquide', icon: '🐙', el: 'glace', res: { glace: 0.4 }, weak: { foudre: 1.4 }, x: { hang: 'floor', revealRadius: 3.8, blastRadius: 2.6 }, desc: 'Des tentacules jaillissent de l\'eau sous vos pieds (cercle annoncé).' });

  // ===== 6. LE TEMPLE SANGLANT (rang C · feu) =====
  M('temple_acolyte_saignant', 'Acolyte saignant', 'C', 'temple_sanglant', 'flanker', 'melee', { fam: 'goule', icon: '🩸', el: 'feu', res: { feu: 0.5 }, weak: { glace: 1.3 }, x: { lunge: { len: 3.4, windup: 0.45 } }, desc: 'Se saigne en priant ; frappe dans le dos.' });
  M('temple_flagellant', 'Flagellant', 'C', 'temple_sanglant', 'charger', 'fast', { fam: 'goule', icon: '⛓️', el: 'feu', weak: { glace: 1.3 }, stat: { range: 10, attackCd: 2.6 }, desc: 'Charge en se fouettant, fou de douleur.' });
  M('temple_pretresse_hemorragie', 'Prêtresse de l\'hémorragie', 'C', 'temple_sanglant', 'support', 'caster', { fam: 'spectre', icon: '🔴', el: 'feu', res: { feu: 0.4 }, weak: { glace: 1.4 }, x: { healPct: 0.25 }, desc: 'Soigne ses fidèles avec le sang des canaux.' });
  M('temple_chien_sacrificiel', 'Chien sacrificiel', 'C', 'temple_sanglant', 'swarm', 'fodder', { fam: 'bete', icon: '🐕', el: 'feu', weak: { glace: 1.3 }, group: [3, 5], desc: 'Écorché vif, il court quand même.' });
  M('temple_masque_d_or', 'Masque d\'or', 'C', 'temple_sanglant', 'statue', 'tank', { fam: 'pierre', icon: '🎭', el: 'feu', res: { physique: 0.6, feu: 0.4 }, weak: { glace: 1.4, foudre: 1.2 }, x: { revealRadius: 3.2, slamRadius: 2.0 }, desc: 'Statue gardienne au masque d\'or. S\'éveille si l\'on profane l\'autel.' });
  M('temple_sangsue_geante', 'Sangsue géante', 'C', 'temple_sanglant', 'crawler', 'melee', { fam: 'liquide', icon: '🪱', el: 'poison', ab: ['lifesteal'], weak: { feu: 1.4 }, x: { lunge: { len: 3.2, windup: 0.5 } }, desc: 'Se gorge du sang de ses victimes : se soigne en frappant.' });
  M('temple_porte_lame', 'Porte-lame', 'C', 'temple_sanglant', 'kiter', 'ranged', { fam: 'goule', icon: '🗡️', stat: { projectile: 'dagger', projSpeed: 13 }, x: { burst: 2 }, desc: 'Lance des couteaux rituels en éventail.' });
  M('temple_bourreau', 'Bourreau', 'C', 'temple_sanglant', 'brute', 'brute', { cat: 'elite', fam: 'armure', icon: '🪓', aff: ['enrage', 'armored'], el: 'feu', res: { feu: 0.5 }, weak: { glace: 1.3 }, x: { slamRadius: 2.2, windup: 0.95 }, desc: 'Cagoulé, hache à deux mains.' });
  M('temple_idole_doree', 'Idole dorée', 'C', 'temple_sanglant', 'turret', 'loot', { cat: 'rare', fam: 'pierre', icon: '🗿', el: 'sacre', stat: { pv: 80, speed: 0, dmg: 6, attackCd: 3, range: 12, projectile: 'orb', projSpeed: 14 }, res: { physique: 0.7 }, desc: 'Idole d\'or massif. Immobile ; brisez-la pour une pluie d\'or.' });
  M('temple_oracle_aveugle', 'Oracle aveugle', 'C', 'temple_sanglant', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '👁️', el: 'sacre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Je vois ce que tu ne vois pas.', 'Trois glyphes. Dans l\'ordre.', 'Le sang est la clé.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Aveugle, elle voit l\'avenir. Un présent à qui l\'écoute.' });
  M('temple_boucher_sacre', 'Boucher sacré', 'C', 'temple_sanglant', 'brute', 'brute', { cat: 'dangereux', fam: 'armure', icon: '🔪', el: 'feu', stat: { pv: 70, dmg: 10 }, res: { feu: 0.5 }, weak: { glace: 1.3 }, x: { slamRadius: 2.6, windup: 1.1, recover: 1.2 }, desc: 'Un hachoir géant : coups lents, énormes, très punissables.' });

  // ===== 7. L'ASILE DES FAILLES (rang B · foudre) =====
  M('asile_patient_fracture', 'Patient fracturé', 'B', 'asile_failles', 'teleporter', 'melee', { fam: 'cri', icon: '🤕', el: 'foudre', res: { foudre: 0.4 }, weak: { sacre: 1.2 }, x: { arriveRadius: 2.0 }, desc: 'Son corps se fracture entre deux lieux : téléportation erratique.' });
  M('asile_infirmiere_sans_visage', 'Infirmière sans visage', 'B', 'asile_failles', 'stalker', 'stalk', { fam: 'brume', icon: '💉', el: 'foudre', res: { physique: 0.8 }, weak: { sacre: 1.3, feu: 1.2 }, danger: true, desc: 'Traque dans les couloirs sombres. Immobile quand elle est éclairée.' });
  M('asile_camisole', 'Camisole', 'B', 'asile_failles', 'charger', 'tank', { fam: 'goule', icon: '🤐', el: 'foudre', res: { physique: 0.7 }, weak: { foudre: 1.0, feu: 1.3 }, stat: { range: 10, attackCd: 2.8 }, desc: 'Bras attachés, il charge tête baissée.' });
  M('asile_echo_hurlant', 'Écho hurlant', 'B', 'asile_failles', 'screamer', 'scream', { fam: 'cri', icon: '📢', el: 'foudre', res: { foudre: 0.4 }, weak: { sacre: 1.3 }, x: { screamRadius: 8.5, screamCd: 9 }, desc: 'Son cri étourdit le héros et rameute les patients.' });
  M('asile_ombre_sous_le_lit', 'Ombre sous le lit', 'B', 'asile_failles', 'ambusher', 'amb', { fam: 'goule', icon: '🛏️', el: 'ombre', res: { ombre: 0.4 }, weak: { sacre: 1.4 }, x: { hang: 'floor', revealRadius: 3.8, blastRadius: 2.2 }, desc: 'Des mains qui jaillissent de sous les lits.' });
  M('asile_docteur_aiguilles', 'Docteur aux aiguilles', 'B', 'asile_failles', 'kiter', 'ranged', { fam: 'goule', icon: '🩺', el: 'poison', ab: ['poisonTouch'], stat: { projectile: 'dagger', projSpeed: 14 }, x: { burst: 3 }, desc: 'Lance des seringues en éventail.' });
  M('asile_poupee_recousue', 'Poupée recousue', 'B', 'asile_failles', 'swarm', 'fodder', { fam: 'nuee', icon: '🧸', weak: { feu: 1.5 }, group: [3, 5], desc: 'Rapiécée de morceaux de patients.' });
  M('asile_gardien_camisole', 'Gardien de la camisole', 'B', 'asile_failles', 'brute', 'brute', { cat: 'elite', fam: 'armure', icon: '🔒', aff: ['armored', 'enrage'], el: 'foudre', res: { foudre: 0.5 }, x: { slamRadius: 2.2, windup: 0.9 }, desc: 'Le plus costaud du personnel. Matraque électrique.' });
  M('asile_dossier_vivant', 'Dossier vivant', 'B', 'asile_failles', 'fleeing', 'loot', { cat: 'rare', fam: 'nuee', icon: '📁', x: { escapeTime: 13 }, desc: 'Un dossier qui s\'échappe en volant. Contient des secrets.' });
  M('asile_patient_zero', 'Patient zéro', 'B', 'asile_failles', 'secret', 'passive', { cat: 'secret', fam: 'cri', icon: '0️⃣', el: 'foudre', x: { secretMode: 'talk', fightAi: 'teleporter', lines: ['Il m\'a ouvert...', 'La faille a une voix.', 'Éteignez les néons.'] }, desc: 'Le premier exposé à la faille. Il parle, à qui veut bien écouter.' });
  M('asile_marcheur_du_couloir', 'Marcheur du couloir', 'B', 'asile_failles', 'hunter', 'hunt', { cat: 'dangereux', fam: 'armure', icon: '🚶', el: 'foudre', weak: { sacre: 1.3 }, x: { stamina: 15 }, desc: 'Grande silhouette sous les néons. Ses pas résonnent longtemps avant lui.' });

  // ===== 8. LA BIBLIOTHÈQUE ENGLOUTIE (rang B · ombre) =====
  M('biblio_grimoire_mordeur', 'Grimoire mordeur', 'B', 'bibliotheque_engloutie', 'swarm', 'fodder', { fam: 'nuee', icon: '📕', el: 'ombre', weak: { feu: 1.5 }, group: [3, 5], desc: 'Un livre qui mord avec ses couvertures.' });
  M('biblio_lecteur_noye', 'Lecteur noyé', 'B', 'bibliotheque_engloutie', 'brute', 'melee', { fam: 'noye', icon: '👓', el: 'ombre', res: { ombre: 0.5 }, x: { slamRadius: 1.6, windup: 0.7 }, desc: 'Lit encore, les poumons pleins d\'eau.' });
  M('biblio_encre_vivante', 'Encre vivante', 'B', 'bibliotheque_engloutie', 'burrower', 'melee', { fam: 'liquide', icon: '🖋️', el: 'ombre', res: { ombre: 0.2, physique: 0.8 }, weak: { feu: 1.3, sacre: 1.3 }, x: { blastRadius: 2.2 }, desc: 'Une flaque d\'encre qui glisse puis se dresse.' });
  M('biblio_page_tranchante', 'Page tranchante', 'B', 'bibliotheque_engloutie', 'swarm', 'fodder', { fam: 'nuee', icon: '📄', weak: { feu: 1.6 }, stat: { speed: 5.0 }, group: [4, 6], desc: 'Feuille tranchante comme un rasoir.' });
  M('biblio_gardien_silence', 'Gardien du silence', 'B', 'bibliotheque_engloutie', 'hunter', 'hunt', { fam: 'brume', icon: '🤫', el: 'ombre', res: { ombre: 0.4 }, weak: { sacre: 1.4 }, danger: true, x: { noiseHunter: true, stamina: 30 }, desc: 'Doigt sur les lèvres. Attiré par le bruit : vos compétences l\'excitent. Immobile dans le silence.' });
  M('biblio_scribe_spectral', 'Scribe spectral', 'B', 'bibliotheque_engloutie', 'kiter', 'caster', { fam: 'spectre', icon: '🪶', el: 'ombre', res: { ombre: 0.3 }, weak: { sacre: 1.5 }, x: { burst: 2 }, desc: 'Écrit votre nom dans l\'air.' });
  M('biblio_conservateur', 'Conservateur', 'B', 'bibliotheque_engloutie', 'summoner', 'tank', { cat: 'elite', fam: 'spectre', icon: '📚', aff: ['warded', 'summoner'], el: 'ombre', x: { summon: 'biblio_grimoire_mordeur', summonCount: 3, summonMax: 6 }, stat: { projectile: 'orb', range: 9 }, desc: 'Protège les livres... en les lâchant sur vous.' });
  M('biblio_livre_dore', 'Livre doré', 'B', 'bibliotheque_engloutie', 'fleeing', 'loot', { cat: 'rare', fam: 'nuee', icon: '📙', x: { escapeTime: 13 }, desc: 'Un livre enluminé qui s\'envole.' });
  M('biblio_lectrice_eternelle', 'Lectrice éternelle', 'B', 'bibliotheque_engloutie', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '📖', el: 'ombre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['"... et le héros entra dans la salle..."', '"... il ne ressortit jamais."', 'Chut.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Lit votre histoire à voix haute.' });
  M('biblio_ombre_du_rayonnage', 'Ombre du rayonnage', 'B', 'bibliotheque_engloutie', 'stalker', 'stalk', { cat: 'dangereux', fam: 'brume', icon: '🌑', el: 'ombre', res: { ombre: 0.3, physique: 0.7 }, weak: { sacre: 1.5 }, desc: 'Glisse entre les rayons derrière vous. Fuit la lanterne.' });

  // ===== 9. LA NÉCROPOLE DE GIVRE (rang A · glace) =====
  M('necropole_momie_givre', 'Momie de givre', 'A', 'necropole_glace', 'brute', 'melee', { fam: 'os', icon: '🧊', el: 'glace', res: { glace: 0.2 }, weak: { feu: 1.6 }, x: { slamRadius: 1.8, windup: 0.75 }, desc: 'Bandelettes gelées, gestes lents.' });
  M('necropole_veilleur_gele', 'Veilleur gelé', 'A', 'necropole_glace', 'statue', 'tank', { fam: 'pierre', icon: '🗿', el: 'glace', res: { glace: 0.2, physique: 0.6 }, weak: { feu: 1.6, foudre: 1.2 }, x: { revealRadius: 3.4, slamRadius: 2.0 }, desc: 'Statue de glace sur sa stèle : elle se brise et attaque.' });
  M('necropole_loup_spectral', 'Loup spectral', 'A', 'necropole_glace', 'pack', 'fast', { fam: 'bete', icon: '🐺', el: 'glace', res: { glace: 0.2 }, weak: { feu: 1.5 }, group: [3, 4], pack: 'loups_spectraux', desc: 'Meute translucide dans le blizzard.' });
  M('necropole_pleureuse_givre', 'Pleureuse de givre', 'A', 'necropole_glace', 'kiter', 'caster', { fam: 'spectre', icon: '❄️', el: 'glace', res: { glace: 0.2 }, weak: { feu: 1.5 }, stat: { projectile: 'ice', projSpeed: 11 }, x: { burst: 3 }, desc: 'Ses larmes gèlent en éclats.' });
  M('necropole_corbeau_givre', 'Corbeau de givre', 'A', 'necropole_glace', 'swarm', 'fodder', { fam: 'nuee', icon: '🐦‍⬛', el: 'glace', weak: { feu: 1.4 }, stat: { speed: 5.0 }, group: [3, 5], desc: 'Cristaux de glace dans les plumes.' });
  M('necropole_chevalier_fige', 'Chevalier figé', 'A', 'necropole_glace', 'guardian', 'tank', { fam: 'armure', icon: '🛡️', el: 'glace', res: { glace: 0.2, physique: 0.6 }, weak: { feu: 1.5, foudre: 1.3 }, x: { shieldPct: 0.35 }, desc: 'Un soldat pris dans la glace depuis mille ans.' });
  M('necropole_larve_glace', 'Larve de glace', 'A', 'necropole_glace', 'swarm', 'fodder', { fam: 'bete', icon: '🐛', el: 'glace', weak: { feu: 1.6 }, group: [5, 7], desc: 'Perce la glace en grouillant.' });
  M('necropole_gardien_tombe', 'Gardien de tombe', 'A', 'necropole_glace', 'brute', 'brute', { cat: 'elite', fam: 'armure', icon: '⚰️', aff: ['warded', 'armored'], el: 'glace', res: { glace: 0.2 }, weak: { feu: 1.5 }, x: { slamRadius: 2.4, windup: 1.0 }, desc: 'Pierre tombale en guise de bouclier.' });
  M('necropole_ame_cristal', 'Âme de cristal', 'A', 'necropole_glace', 'teleporter', 'caster', { cat: 'rare', fam: 'spectre', icon: '💎', el: 'glace', stat: { pv: 60, xp: 30, gold: [50, 100] }, x: { arriveRadius: 2.0 }, res: { glace: 0.1 }, desc: 'Une âme prisonnière d\'un cristal : se téléporte de stèle en stèle.' });
  M('necropole_reine_endormie', 'Reine endormie', 'A', 'necropole_glace', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '👑', el: 'glace', stat: { pv: 90 }, x: { secretMode: 'sleep', fightAi: 'brute', slamRadius: 2.4, windup: 1.0 }, desc: 'Dort dans son cercueil de glace. Ne la réveillez pas... ou préparez-vous.' });
  M('necropole_dame_blanche', 'Dame blanche', 'A', 'necropole_glace', 'stalker', 'stalk', { cat: 'dangereux', fam: 'brume', icon: '🤍', el: 'glace', res: { glace: 0.1, physique: 0.7 }, weak: { feu: 1.5, sacre: 1.3 }, desc: 'Se fond dans la tempête, frappe dans le dos, fuit la lumière.' });

  // ===== 10. LE JARDIN DE CHAIR (rang A · poison) =====
  M('jardin_fleur_dents', 'Fleur à dents', 'A', 'jardin_chair', 'ambusher', 'amb', { fam: 'vegetal', icon: '🌺', el: 'poison', res: { poison: 0.3 }, weak: { feu: 1.5 }, x: { hang: 'floor', revealRadius: 3.2, blastRadius: 2.2 }, stat: { speed: 1.2 }, desc: 'Immobile jusqu\'à ce qu\'on approche, puis jaillit du sol.' });
  M('jardin_jardinier', 'Jardinier', 'A', 'jardin_chair', 'brute', 'melee', { fam: 'goule', icon: '✂️', el: 'poison', ab: ['poisonTouch'], weak: { feu: 1.3 }, x: { slamRadius: 2.2, windup: 0.6 }, desc: 'Élague tout ce qui bouge avec son sécateur géant.' });
  M('jardin_vigne_veine', 'Vigne-veine', 'A', 'jardin_chair', 'mimic_wall', 'tank', { fam: 'chair', icon: '🌿', el: 'poison', res: { poison: 0.3 }, weak: { feu: 1.6 }, x: { reachLen: 6.0, revealRadius: 3.4 }, desc: 'Une vigne sortant des murs ; attire et étreint.' });
  M('jardin_bourgeon_oeil', 'Bourgeon-œil', 'A', 'jardin_chair', 'turret', 'caster', { fam: 'chair', icon: '👁️', el: 'poison', res: { poison: 0.4 }, weak: { feu: 1.4 }, stat: { speed: 0, range: 12, attackCd: 3, projectile: 'orb', projSpeed: 14 }, desc: 'Un bulbe oculaire fixé au sol : rayons annoncés, nova de spores.' });
  M('jardin_essaim_mouches', 'Essaim de mouches', 'A', 'jardin_chair', 'swarm', 'fodder', { fam: 'nuee', icon: '🪰', el: 'poison', weak: { feu: 1.4 }, stat: { speed: 5.0 }, group: [5, 8], desc: 'Bourdonnement continu, piqûres empoisonnées.' });
  M('jardin_epouvantail_chair', 'Épouvantail de chair', 'A', 'jardin_chair', 'statue', 'tank', { fam: 'chair', icon: '🎃', el: 'poison', res: { poison: 0.3 }, weak: { feu: 1.5 }, x: { revealRadius: 3.2, slamRadius: 1.9 }, desc: 'Planté dans les allées. S\'éveille quand on passe.' });
  M('jardin_racine_mere', 'Racine-mère', 'A', 'jardin_chair', 'swarm', 'fodder', { fam: 'vegetal', icon: '🌱', el: 'poison', weak: { feu: 1.5 }, group: [4, 6], desc: 'Tentacules de racines qui rampent vers vous.' });
  M('jardin_greffe', 'Greffe', 'A', 'jardin_chair', 'brute', 'brute', { cat: 'elite', fam: 'chair', icon: '🧬', aff: ['venomous', 'regenerating'], el: 'poison', res: { poison: 0.3 }, weak: { feu: 1.5 }, x: { slamRadius: 2.4, windup: 0.9 }, desc: 'Chimère de chair et de bois.' });
  M('jardin_rose_noire', 'Rose noire', 'A', 'jardin_chair', 'turret', 'loot', { cat: 'rare', fam: 'vegetal', icon: '🌹', el: 'poison', stat: { pv: 80, speed: 0, dmg: 6, attackCd: 3, range: 12, projectile: 'orb', projSpeed: 14 }, desc: 'Une rose noire, immobile, aux pétales d\'or sombre. Précieuse.' });
  M('jardin_dryade_ecorchee', 'Dryade écorchée', 'A', 'jardin_chair', 'secret', 'passive', { cat: 'secret', fam: 'chair', icon: '🌳', el: 'poison', x: { secretMode: 'talk', fightAi: 'brute', lines: ['Elle me l\'a pris...', 'Mes feuilles... ma peau...', 'Coupe la veine.'] }, desc: 'Une dryade écorchée vive par la Matrice. Elle supplie.' });
  M('jardin_gueule_souterraine', 'Gueule souterraine', 'A', 'jardin_chair', 'burrower', 'tank', { cat: 'dangereux', fam: 'chair', icon: '🕳️', el: 'poison', res: { poison: 0.3, physique: 0.8 }, weak: { feu: 1.4 }, scale: 1.2, x: { blastRadius: 3.2 }, desc: 'Une bouche sous le sol : énorme cercle d\'éruption.' });

  // ===== 11. L'ABÎME INFERNAL (rang S · feu) =====
  M('abime_damne_enchaine', 'Damné enchaîné', 'S', 'abime_infernal', 'brute', 'melee', { fam: 'goule', icon: '⛓️', el: 'feu', res: { feu: 0.4 }, weak: { glace: 1.4 }, x: { slamRadius: 2.0, windup: 0.75 }, desc: 'Traîne sa chaîne ; elle claque avant chaque coup.' });
  M('abime_diablotin_braise', 'Diablotin de braise', 'S', 'abime_infernal', 'kiter', 'ranged', { fam: 'demon', icon: '😈', el: 'feu', res: { feu: 0.1 }, weak: { glace: 1.5 }, stat: { projectile: 'fireball', projSpeed: 11 }, x: { burst: 2 }, desc: 'Crache des boules de feu.' });
  M('abime_chien_enfers', 'Chien des enfers', 'S', 'abime_infernal', 'pack', 'fast', { fam: 'bete', icon: '🐕‍🦺', el: 'feu', res: { feu: 0.1 }, weak: { glace: 1.5 }, group: [3, 4], pack: 'chiens_enfers', desc: 'Meute de chiens enflammés.' });
  M('abime_chainier', 'Chaînier', 'S', 'abime_infernal', 'kiter', 'caster', { fam: 'demon', icon: '🪝', el: 'feu', weak: { glace: 1.4 }, stat: { projectile: 'bone', projSpeed: 14 }, x: { burst: 2 }, desc: 'Lance des chaînes enflammées.' });
  M('abime_ame_brulante', 'Âme brûlante', 'S', 'abime_infernal', 'swarm', 'fodder', { fam: 'spectre', icon: '🔥', el: 'feu', res: { feu: 0.1 }, weak: { glace: 1.5 }, group: [4, 6], desc: 'Âmes damnées en flammes.' });
  M('abime_veuve_cendre', 'Veuve de cendre', 'S', 'abime_infernal', 'teleporter', 'caster', { fam: 'spectre', icon: '🖤', el: 'feu', res: { feu: 0.2 }, weak: { glace: 1.4 }, x: { arriveRadius: 2.2, burst: 2 }, desc: 'Se dissout en cendres et resurgit à côté de vous.' });
  M('abime_colosse_lave', 'Colosse de lave', 'S', 'abime_infernal', 'brute', 'brute', { fam: 'pierre', icon: '🌋', el: 'feu', res: { feu: 0.1, physique: 0.7 }, weak: { glace: 1.6 }, scale: 1.2, x: { slamRadius: 2.6, windup: 1.0 }, desc: 'Un géant de roche en fusion.' });
  M('abime_geolier', 'Geôlier', 'S', 'abime_infernal', 'brute', 'brute', { cat: 'elite', fam: 'demon', icon: '🗝️', aff: ['enrage', 'vampiric'], el: 'feu', res: { feu: 0.3 }, weak: { glace: 1.3 }, x: { slamRadius: 2.4, windup: 0.9 }, desc: 'Les clés des cages pendent à sa ceinture.' });
  M('abime_salamandre_or', 'Salamandre d\'or', 'S', 'abime_infernal', 'fleeing', 'loot', { cat: 'rare', fam: 'bete', icon: '🦎', el: 'feu', stat: { speed: 6.0 }, x: { escapeTime: 14 }, desc: 'Une salamandre d\'or pur. Elle file dans la lave.' });
  M('abime_ange_dechu', 'Ange déchu', 'S', 'abime_infernal', 'secret', 'passive', { cat: 'secret', fam: 'demon', icon: '🪽', el: 'sacre', stat: { pv: 90 }, x: { secretMode: 'talk', fightAi: 'teleporter', lines: ['Libère-moi...', 'Ou achève-moi.', 'Ils m\'ont arraché le ciel.'] }, desc: 'Enchaîné au fond de l\'abîme. Libérez-le ou achevez-le.' });
  M('abime_traqueur_braise', 'Traqueur de braise', 'S', 'abime_infernal', 'hunter', 'hunt', { cat: 'dangereux', fam: 'bete', icon: '🐺', el: 'feu', res: { feu: 0.1 }, weak: { glace: 1.5 }, scale: 1.2, x: { stamina: 15 }, desc: 'Un molosse géant qui traque l\'odeur de la peur. Sa respiration le trahit.' });

  // ===== 12. L'OBSERVATOIRE DU NÉANT (rang Z · ombre) =====
  M('obs_astronome_vide', 'Astronome du vide', 'Z', 'observatoire_neant', 'kiter', 'caster', { fam: 'spectre', icon: '🔭', el: 'ombre', res: { ombre: 0.1 }, weak: { sacre: 1.6 }, x: { burst: 3 }, desc: 'Lit votre mort dans les étoiles.' });
  M('obs_etoile_morte', 'Étoile morte', 'Z', 'observatoire_neant', 'bomber', 'melee', { fam: 'meca', icon: '⭐', el: 'ombre', res: { ombre: 0.2 }, weak: { sacre: 1.5 }, x: { blastRadius: 3.4 }, stat: { range: 3 }, desc: 'Une étoile qui s\'effondre : explose après une mèche.' });
  M('obs_oeil_neant', 'Œil du Néant', 'Z', 'observatoire_neant', 'turret', 'caster', { fam: 'meca', icon: '👁️', el: 'ombre', res: { ombre: 0.1 }, weak: { sacre: 1.6 }, stat: { speed: 0, range: 13, attackCd: 3, projectile: 'orb', projSpeed: 15 }, desc: 'Fixe le héros : rayon annoncé, puis nova.' });
  M('obs_engrenage_vivant', 'Engrenage vivant', 'Z', 'observatoire_neant', 'charger', 'tank', { fam: 'meca', icon: '⚙️', el: 'physique', res: { physique: 0.6 }, weak: { foudre: 1.4 }, stat: { range: 10, attackCd: 2.8 }, desc: 'Un amas de rouages qui roule en ligne droite.' });
  M('obs_marcheur_entre_mondes', 'Marcheur entre les mondes', 'Z', 'observatoire_neant', 'teleporter', 'melee', { fam: 'armure', icon: '🌀', el: 'ombre', res: { ombre: 0.2 }, weak: { sacre: 1.5 }, x: { arriveRadius: 2.4 }, desc: 'Entre deux portails ; surgit à vos côtés.' });
  M('obs_ombre_constellation', 'Ombre de constellation', 'Z', 'observatoire_neant', 'stalker', 'stalk', { fam: 'brume', icon: '✨', el: 'ombre', res: { ombre: 0.1, physique: 0.6 }, weak: { sacre: 1.6 }, danger: true, desc: 'Silhouette piquetée d\'étoiles : traque hors de la lumière.' });
  M('obs_fragment_neant', 'Fragment du Néant', 'Z', 'observatoire_neant', 'swarm', 'fodder', { fam: 'nuee', icon: '◆', el: 'ombre', res: { ombre: 0.2 }, weak: { sacre: 1.5 }, group: [4, 6], desc: 'Éclats de vide qui tourbillonnent.' });
  M('obs_gardien_orbite', 'Gardien de l\'orbite', 'Z', 'observatoire_neant', 'guardian', 'brute', { cat: 'elite', fam: 'meca', icon: '🪐', aff: ['warded', 'armored'], el: 'ombre', res: { ombre: 0.2 }, weak: { sacre: 1.4 }, x: { shieldPct: 0.35 }, desc: 'Des anneaux d\'astrolabe en orbite autour de lui.' });
  M('obs_comete_errante', 'Comète errante', 'Z', 'observatoire_neant', 'fleeing', 'loot', { cat: 'rare', fam: 'nuee', icon: '☄️', stat: { speed: 6.4 }, x: { escapeTime: 12 }, desc: 'Une comète qui rase le sol. Fugitive.' });
  M('obs_premier_eveille', 'Premier éveillé', 'Z', 'observatoire_neant', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🧍', el: 'ombre', stat: { pv: 100 }, x: { secretMode: 'talk', fightAi: 'teleporter', lines: ['Je regarde depuis le début.', 'Il nous regarde aussi.', 'Ne lève pas les yeux.'] }, desc: 'Le premier chasseur, figé face au télescope. Il parle sans bouger.' });
  M('obs_regard_fixe', 'Regard fixe', 'Z', 'observatoire_neant', 'weeping', 'brute', { cat: 'dangereux', fam: 'pierre', icon: '👁️‍🗨️', el: 'ombre', res: { ombre: 0.2, physique: 0.5 }, weak: { sacre: 1.5 }, x: { creepMul: 1.8, stoneMult: 0.3 }, desc: 'Un œil de pierre qui ne bouge que si vous cessez de le regarder.' });

  // ===== 13. LA FOIRE AUX PANTINS (rang C · physique) =====
  M('foire_pantin_ficelle', 'Pantin à ficelles', 'C', 'foire_pantins', 'ambusher', 'amb', { fam: 'meca', icon: '🪆', weak: { feu: 1.5 }, x: { hang: 'ceiling', revealRadius: 4.2, blastRadius: 2.2 }, desc: 'Suspendu au chapiteau par ses fils : se laisse tomber.' });
  M('foire_clown_triste', 'Clown triste', 'C', 'foire_pantins', 'brute', 'melee', { fam: 'cri', icon: '🤡', el: 'ombre', weak: { sacre: 1.2 }, x: { slamRadius: 1.8, windup: 0.7 }, desc: 'Pleure en frappant.' });
  M('foire_lanceur_couteaux', 'Lanceur de couteaux', 'C', 'foire_pantins', 'kiter', 'ranged', { fam: 'goule', icon: '🔪', stat: { projectile: 'dagger', projSpeed: 14 }, x: { burst: 3 }, desc: 'Numéro de cirque : couteaux en éventail.' });
  M('foire_ballon_rieur', 'Ballon rieur', 'C', 'foire_pantins', 'bomber', 'fodder', { fam: 'cri', icon: '🎈', el: 'feu', weak: { feu: 1.4 }, x: { blastRadius: 2.6 }, stat: { speed: 3.6, dmg: 5, range: 2.8, pv: 6 }, group: [2, 4], desc: 'Rit aux éclats, puis éclate.' });
  M('foire_cheval_de_bois', 'Cheval de bois', 'C', 'foire_pantins', 'charger', 'tank', { fam: 'meca', icon: '🎠', res: { physique: 0.7 }, weak: { feu: 1.5 }, stat: { range: 10, attackCd: 2.6 }, desc: 'Un cheval de manège qui galope hors de sa barre.' });
  M('foire_marionnettiste_ombre', 'Marionnettiste d\'ombre', 'C', 'foire_pantins', 'summoner', 'caster', { fam: 'spectre', icon: '🎭', el: 'ombre', res: { ombre: 0.3 }, weak: { sacre: 1.4 }, x: { summon: 'foire_ballon_rieur', summonCount: 2, summonMax: 4 }, desc: 'Fait danser des ballons explosifs au bout de ses fils.' });
  M('foire_monsieur_loyal', 'Monsieur Loyal', 'C', 'foire_pantins', 'summoner', 'tank', { cat: 'elite', fam: 'cri', icon: '🎩', aff: ['enrage', 'summoner'], stat: { projectile: 'dagger', range: 9 }, x: { summon: 'foire_pantin_ficelle', summonCount: 2, summonMax: 4 }, desc: 'Présente le spectacle... dont vous êtes le numéro.' });
  M('foire_ticket_dore', 'Ticket doré', 'C', 'foire_pantins', 'fleeing', 'loot', { cat: 'rare', fam: 'nuee', icon: '🎫', x: { escapeTime: 13 }, desc: 'Un ticket d\'or qui s\'envole.' });
  M('foire_diseuse_aventure', 'Diseuse d\'aventure', 'C', 'foire_pantins', 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🔮', el: 'ombre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Je vois un coffre...', 'Une ficelle coupée...', 'Le grand final approche.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Voit votre avenir dans une boule de cristal.' });
  M('foire_ombre_du_chapiteau', 'Ombre du chapiteau', 'C', 'foire_pantins', 'ambusher', 'amb', { cat: 'dangereux', fam: 'goule', icon: '🎪', el: 'ombre', res: { ombre: 0.4 }, weak: { sacre: 1.3 }, x: { hang: 'ceiling', revealRadius: 5.0, blastRadius: 2.8 }, desc: 'Au sommet du chapiteau : tombe en cercle large sur le spectateur.' });

  // Ids de repli v3 : quelques anciens ids de donjon pointent encore vers des monstres v2/v3 (inchangés).

  /** Noms de sons attendus par l'agent 9 : monstre_<id>_<evt> (evt : cri attaque mort + pas/souffle (hunter, weeping) + murmure (stalker/screamer/possessor) + indice (ambusher) + chant (secret)). */
  const V5_EVENTS = {
    default: ['cri', 'attaque', 'mort'], hunter: ['pas', 'souffle'], weeping: ['pas'], stalker: ['murmure'], screamer: ['murmure'],
    possessor: ['murmure'], ambusher: ['indice'], secret: ['chant'],
  };
  function soundNames() {
    const out = [];
    Object.keys(MONSTERS).forEach((id) => {
      const d = MONSTERS[id];
      if (!d.sfxFam) return;
      (V5_EVENTS.default.concat(V5_EVENTS[d.ai] || [])).forEach((ev) => out.push('monstre_' + id + '_' + ev));
    });
    return out;
  }
  /** Familles sonores {famille: [ids]} pour synthétiser une voix par famille. */
  function soundFamilies() {
    const out = {};
    Object.keys(MONSTERS).forEach((id) => { const d = MONSTERS[id]; if (d.sfxFam) (out[d.sfxFam] = out[d.sfxFam] || []).push(id); });
    return out;
  }
  /** Population d'un donjon (id de thème) : {classique:[ids], elite:[], rare:[], dangereux:[], secret:[]} */
  function population(theme) {
    const out = { classique: [], elite: [], rare: [], dangereux: [], secret: [] };
    Object.keys(MONSTERS).forEach((id) => {
      const d = MONSTERS[id];
      if (d.dungeon !== theme && !(d.themes || []).includes(theme)) return;
      if (d.category && out[d.category] && d.dungeon === theme) out[d.category].push(id);
    });
    return out;
  }
  /** Tire un monstre du donjon : roll(theme, {rank, kind:'classique'|'elite'|'rare'|'dangereux', rng}) ; kind absent → pondéré (rare ≤ 2,5 %). */
  function roll(theme, o) {
    o = o || {};
    const pop = population(theme);
    const rng = o.rng || G.rng || { pick: (a) => a[Math.floor(Math.random() * a.length)], chance: (p) => Math.random() < p, float: () => Math.random() };
    let kind = o.kind;
    if (!kind) {
      const cats = ['classique', 'dangereux', 'elite', 'rare'].filter((k) => pop[k].length);
      const tot = cats.reduce((s, k) => s + CATEGORY_WEIGHT[k], 0);
      let r = (rng.float ? rng.float() : Math.random()) * tot;
      kind = cats[0];
      for (const k of cats) { r -= CATEGORY_WEIGHT[k]; if (r <= 0) { kind = k; break; } }
    }
    const list = pop[kind] && pop[kind].length ? pop[kind] : pop.classique;
    return list.length ? rng.pick(list) : null;
  }

  // ------------------------------------------------------------------
  //  4. Dégâts reçus : résistances / faiblesses / bouclier
  // ------------------------------------------------------------------
  /** Multiplicateur élémentaire (resist<1, weak>1) pour un ennemi (objet runtime) ou une définition. */
  function damageMult(e, element) {
    if (!element) return 1;
    const def = (e && e.def) || e || {};
    let m = 1;
    const res = Object.assign({}, def.resist || {}, e && e.resist || {});
    const wk = Object.assign({}, def.weak || {}, e && e.weak || {});
    if (res[element] != null) m *= res[element];
    if (wk[element] != null) m *= wk[element];
    return m;
  }
  /** À appeler par damageEnemy : renvoie les dégâts restants après résistance, faiblesse, e.dmgTakenMult et bouclier (e.shield). */
  function absorb(e, amount, element) {
    if (!e || !(amount > 0)) return 0;
    let dmg = amount * damageMult(e, element) * (e.dmgTakenMult || 1);
    if (e.shield > 0) {
      const s = Math.min(e.shield, dmg);
      e.shield -= s; dmg -= s;
      if (e.shield <= 0.01) e.shield = 0;
    }
    return Math.max(0, dmg);
  }

  // ------------------------------------------------------------------
  //  5. Requêtes pour Procgen / Donjons
  // ------------------------------------------------------------------
  function get(id, rank, affixIds) {
    let d = MONSTERS[id];
    if (!d) return null;
    if (rank) d = scale(d, rank);
    if (affixIds && affixIds.length) d = makeElite(d, affixIds);
    return d;
  }
  /** list({theme, rank, maxRank, rare, elite, ai, packTag}) -> [def] (rankMin <= rank) */
  function list(f) {
    f = f || {};
    return Object.keys(MONSTERS).map((k) => MONSTERS[k]).filter((d) => {
      if (f.theme && !(d.themes || []).includes(f.theme)) return false;
      if (f.rank && rIdx(d.rankMin) > rIdx(f.rank)) return false;
      if (f.minRank && rIdx(d.rankMin) < rIdx(f.minRank)) return false;
      if (f.rare !== undefined && !!d.rare !== !!f.rare) return false;
      if (f.elite !== undefined && !!d.elite !== !!f.elite) return false;
      if (f.ai && d.ai !== f.ai) return false;
      if (f.packTag && d.packTag !== f.packTag) return false;
      return true;
    });
  }
  /** Tire 1 % (par défaut) de rencontrer le Spécimen doré : renvoie 'specimen_dore' ou null. À appeler à chaque apparition de vague/salle. */
  function rareRoll(p, theme) {
    if (theme) { const pop = population(theme); if (pop.rare.length && G.rng && G.rng.chance(p != null ? p : 0.02)) return G.rng.pick(pop.rare); if (pop.rare.length) return null; }
    const d = MONSTERS.specimen_dore;
    const proba = p != null ? p : (d && d.rareChance) || 0.01;
    return G.rng && G.rng.chance(proba) ? 'specimen_dore' : null;
  }
  /** Taille de groupe conseillée [min,max] (packs / essaims). */
  function groupSize(id) { const d = MONSTERS[id]; return (d && d.group) ? d.group.slice() : [1, 1]; }

  G.MONSTERS = Object.assign(G.MONSTERS || {}, MONSTERS);
  G.MONSTER_AFFIXES = AFFIXES;
  G.Monsters = Object.assign(G.Monsters || {}, {
    RANKS, RANK_MULT, ELITE_BASE, AFFIX_EXCLUSIVE,
    get, list, scale, makeElite, rollAffixes, affixCountForRank, damageMult, absorb, rareRoll, groupSize,
    population, roll, soundNames, soundFamilies, CATEGORY_WEIGHT,
    rankIndex: rIdx,
  });

  // Hook de mise à l'échelle (CONTRAT §2 : enemyStats(def, {rank, modifiers, run}))
  //   ctx.rank : rang du portail ; ctx.affixes (ou ctx.modifiers.affixes) : ids d'affixes d'élite à appliquer.
  if (G.hooks && G.hooks.add) {
    G.hooks.add('enemyStats', (def, ctx) => {
      if (!def || !ctx) return undefined;
      let d = def;
      if (ctx.rank) d = scale(d, ctx.rank);
      const aff = ctx.affixes || (ctx.modifiers && ctx.modifiers.affixes);
      if (Array.isArray(aff) && aff.length) d = makeElite(d, aff);
      return d === def ? undefined : d;
    }, 0);
  }
})();
