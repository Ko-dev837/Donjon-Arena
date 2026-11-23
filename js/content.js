window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v2 — js/content.js → G.DATA
   Données pures + petites fonctions pures (aucune dépendance : ni THREE, ni DOM).

   Héritage des exercices Python :
     - création de perso : nom, classe (Guerrier / Mage / Voleur), niveau 1, PV, force (→ bonus de classe)
     - sorts : Coup d'épée random.randint(10,14), Lancer de dague random.randint(2,22),
               Boule de feu random.choice([0,20])
     - le Golem « vous frappe de 7 dégâts » (BOSSES.golem.dmg = 7, au contact)
     - inventaire : Potion de soin, Potion de mana, Pièce d'or
     - coffre piégé : code 1..20, 3 essais (CHEST)
     - calcul_degats → XP.dmgMult(niveau) × bonus de classe × stats de l'arme

   Unités : angles en RADIANS (arc = angle total du cône), distances en mètres
   du monde (salle de -14 à +14), vitesses en u/s, temps en secondes.

   ---------------------------------------------------------------------
   TABLEAU D'ÉQUILIBRAGE (généré par un script de simulation, voir valeurs ci-dessous)
   DPS théorique = somme des 3 sorts lancés dès qu'ils sont prêts, mono-cible,
   bonus de classe = 1 (Guerrier/Voleur/Mage ont +30..60 % sur leur arme fétiche).
   DPS réaliste ≈ 45 % du théorique (esquives, placement, l'épée exige le contact).
   Les perks (perce, éventail, flaque) ne sont PAS comptés : ils servent surtout
   contre les vagues, c'est la marge du joueur.

   Coût affiché = or pour passer au niveau suivant (feu : ×1,1). dmgMult : +5 %/niv (×2,45 au niv 30).
   PV max : +10 % des PV de base/niv (Guerrier 125 → 488, Mage 85 → 332, Voleur 95 → 371 au niv 30).

   Simulation : le joueur refait chaque donjon jusqu'au niveau requis du suivant,
   dépense tout son or à la Forge (arme la plus basse d'abord), coffre gagné 35 % du temps.

   Donjon       | entrée (niv héros / armes é-d-f) | DPS théo | DPS réal | Boss         | PV boss | ~durée boss | XP/run | Or/run | runs avant suivant
   crypte       | niv 1 / 1/1/1                    | 48       | 22       | golem        | 700     | 32 s        | 288    | 203    | 2 → niv 3 armes 2/2/2
   foret        | niv 3 / 2/2/2                    | 66       | 30       | spiderQueen  | 1250    | 42 s        | 765    | 453    | 3 → niv 6 armes 4/3/3
   catacombes   | niv 6 / 4/3/3                    | 105      | 47       | skeletonKing | 2200    | 47 s        | 2323   | 1159   | 4 → niv 10 armes 5/5/5
   glace        | niv 10 / 5/5/5                   | 157      | 71       | frostGiant   | 4000    | 56 s        | 4634   | 2129   | 5 → niv 15 armes 7/7/7
   abysse       | niv 15 / 7/7/7                   | 242      | 109      | lich         | 6200    | 57 s        | 9178   | 3974   | 4 → niv 20 armes 9/9/9
   volcan       | niv 20 / 9/9/9                   | 363      | 163      | demon        | 11500   | 70 s        | 15098  | 6757   | 9 → niv 30 armes 10/10/10
   
   Niv arme | Épée (min-max / cd)  | Dague (min-max / cd) | Feu (values / cd)        | DPS théo (×dmgMult 1)
   1        | 10-14 / 0.55         | 2-22 / 0.6           | [0,20] / 1.5             | 48  (coût → 60)
   2        | 12-17 / 0.54         | 2-27 / 0.58          | [0,24] / 1.46            | 60  (coût → 210)
   3        | 14-20 / 0.52         | 3-32 / 0.57          | [0,29,29] / 1.41         | 77  (coût → 460)
   4        | 17-23 / 0.51         | 3-37 / 0.55          | [0,33,33] / 1.37         | 92  (coût → 810)
   5        | 19-26 / 0.49         | 4-42 / 0.53          | [0,38,38] / 1.32         | 109  (coût → 1260)
   6        | 21-30 / 0.48         | 4-46 / 0.52          | [0,42,42] / 1.28         | 123  (coût → 1810)
   7        | 23-33 / 0.46         | 5-51 / 0.5           | [0,47,47] / 1.23         | 142  (coût → 2460)
   8        | 26-36 / 0.45         | 5-56 / 0.48          | [0,51,51,51] / 1.19      | 165  (coût → 3210)
   9        | 28-39 / 0.43         | 6-61 / 0.47          | [0,56,56,56] / 1.14      | 186  (coût → 4060)
   10       | 30-42 / 0.42         | 6-66 / 0.45          | [0,60,60,60] / 1.1       | 207  (MAX : cost = Infinity)
   
   XP.forLevel(1..29) : 120 280 500 780 1090 1450 1840 2270 2730 3220 3750 4300 4890 5500 6130 6800 7480 8200 8930 9690 10480 11290 12110 12960 13840 14730 15650 16580 17540
   ===================================================================== */
(() => {
  'use strict';

  const r2 = (x) => Math.round(x * 100) / 100;
  const clampL = (L, max) => Math.max(1, Math.min(max, Math.floor(Number(L) || 1)));
  // interpolation linéaire niveau 1 → niveau max
  const lin = (a, b, L, max) => a + (b - a) * (L - 1) / (max - 1);
  // multiplicateur de dégâts d'arme : x1 au niv 1 → x3 au niv 10
  const wMult = (L) => 1 + (L - 1) * 2 / 9;
  // coût Forge commun (or pour passer de L à L+1)
  const forgeCost = (L, factor) => Math.round((50 * L * L + 10) * factor / 5) * 5;

  // =================================================================
  // CLASSES
  // =================================================================
  // v5 : plus de bonus d'arme par classe (l'ancien kit v2 épée/dague/feu n'est plus équipé). Les 3 « armes » de la Forge deviennent
  // l'Arme de classe (attaque de base), le Focalisateur (actives) et la Relique (ultime) — voir CLASS-DESIGN.md §2 et G.CLASSES[c].forge.
  const NEUTRAL = { epee: 1, dague: 1, feu: 1 };
  const CLASSES = {
    Guerrier: { id: 'Guerrier', icon: '🛡️', pv: 125, speed: 5.2, color: 0x3a86ff, desc: "Solide comme un mur de crypte : tient la ligne, étourdit, grossit avec les coups reçus.", bonus: NEUTRAL },
    Mage: { id: 'Mage', icon: '🔮', pv: 85, speed: 5.5, color: 0x9d4edd, desc: "Canon de verre arcanique : sorts à incantation, Écho entre les sorts.", bonus: NEUTRAL },
    Voleur: { id: 'Voleur', icon: '🗡️', pv: 95, speed: 6.2, color: 0x2a9d8f, desc: "Larron des toits : lames plantées, Rappel, harcèlement mobile.", bonus: NEUTRAL },
  };

  // =================================================================
  // FORGE v5 (niveau 1 → 10) : Arme de classe (epee → attaque de base), Focalisateur (dague → actives), Relique (feu → ultime)
  // stats(L) = multiplicateurs affichés par la Forge (dmg en %, recharge en %, mana en %) ; les perks N5/N10 sont décrits par classe
  // dans G.CLASSES[c].forge[clé].perks (G.DATA.forgeInfo) et appliqués par js/sys/skills.js (ctx.perk(5|10)).
  // =================================================================
  const MAXW = 10;
  const FORGE_F = { epee: { dmg: 0.07, cd: 0.022, mana: 0 }, dague: { dmg: 0.05, cd: 0.015, mana: 0.01 }, feu: { dmg: 0.06, cd: 0.02, mana: 0 } };
  const forgeStats = (key, level) => {
    const L = clampL(level, MAXW), f = FORGE_F[key];
    const o = { dmg: Math.round(100 * (1 + f.dmg * (L - 1))), 'Recharge (%)': Math.round(100 * (1 - f.cd * (L - 1)) * 10) / 10 };
    if (f.mana) o['Coût en mana (%)'] = Math.round(100 * (1 - f.mana * (L - 1)));
    return o;
  };
  const forgeMult = (key, level) => { const L = clampL(level, MAXW), f = FORGE_F[key]; return { dmg: 1 + f.dmg * (L - 1), cd: 1 - f.cd * (L - 1), mana: 1 - f.mana * (L - 1) }; };
  const FORGE_PERKS = {
    epee: { 5: "Maîtrise : premier effet propre à ta classe sur l'attaque de base (voir la fiche de classe).", 10: "Maîtrise ultime : second effet propre à ta classe sur l'attaque de base." },
    dague: { 5: 'Maîtrise : premier effet propre à ta classe sur tes compétences actives.', 10: 'Maîtrise ultime : second effet propre à ta classe sur tes compétences actives.' },
    feu: { 5: "Maîtrise : premier effet propre à ta classe sur ton ultime.", 10: "Maîtrise ultime : second effet propre à ta classe sur ton ultime." },
  };
  const epee = {
    id: 'epee', slot: 1, name: 'Arme de classe', icon: '⚔️', kind: 'melee', maxLevel: MAXW,
    stats(level) { return forgeStats('epee', level); },
    cost(level) { const L = Math.floor(Number(level) || 1); return L >= MAXW ? Infinity : forgeCost(Math.max(1, L), 1); },
    perks: FORGE_PERKS.epee,
  };
  const dague = {
    id: 'dague', slot: 2, name: 'Focalisateur', icon: '🗡️', kind: 'projectile', maxLevel: MAXW,
    stats(level) { return forgeStats('dague', level); },
    cost(level) { const L = Math.floor(Number(level) || 1); return L >= MAXW ? Infinity : forgeCost(Math.max(1, L), 1); },
    perks: FORGE_PERKS.dague,
  };
  const feu = {
    id: 'feu', slot: 3, name: 'Relique', icon: '🔥', kind: 'fireball', maxLevel: MAXW,
    stats(level) { return forgeStats('feu', level); },
    cost(level) { const L = Math.floor(Number(level) || 1); return L >= MAXW ? Infinity : forgeCost(Math.max(1, L), 1.1); },
    perks: FORGE_PERKS.feu,
  };
  const forgeInfo = (classe, key) => { try { const c = G.CLASSES && G.CLASSES[classe]; return (c && c.forge && c.forge[key]) || null; } catch (e) { return null; } };

  const WEAPONS = { epee, dague, feu };

  // =================================================================
  // SUPER & ROULADE
  // =================================================================
  const SUPER = {
    name: 'Tornade Ultime', icon: '🌪️',
    // dégâts de zone de la tornade selon le niveau du héros (dmgMult déjà inclus)
    dmg(level) { const L = clampL(level, 30); return Math.round(60 * (1 + 0.15 * (L - 1))); },
    radius: 4.5,
    chargePerDamage: 0.8,
  };

  const DASH = { cd: 1.4, duration: 0.18, speedMult: 3.2, invuln: 0.3 };

  // =================================================================
  // XP / NIVEAUX
  // =================================================================
  const XP = {
    maxLevel: 30,
    // XP nécessaire pour passer du niveau n au niveau n+1
    forLevel(n) { const L = clampL(n, 30); return Math.round((80 * Math.pow(L, 1.6) + 40) / 10) * 10; },
    // PV max : +10 % des PV de base de la classe par niveau
    pvMax(classId, n) {
      const C = CLASSES[classId] || CLASSES.Guerrier;
      const L = clampL(n, 30);
      return Math.round(C.pv * (1 + 0.1 * (L - 1)));
    },
    // multiplicateur de dégâts global (calcul_degats) : +5 % par niveau
    dmgMult(n) { const L = clampL(n, 30); return r2(1 + 0.05 * (L - 1)); },
  };

  // =================================================================
  // OBJETS (boutique du hub)
  // =================================================================
  const ITEMS = {
    'Potion de soin': { icon: '❤️', heal: 40, price: 25, desc: 'Rend 40 PV. Raccourci : R.' },
    'Potion de mana': { icon: '💧', price: 40, desc: 'recharge les sorts' },
  };

  // =================================================================
  // ENNEMIS
  //   Archétypes de base (palier 0 = Crypte) puis variantes par palier de donjon.
  //   range = distance à laquelle l'ennemi déclenche son attaque
  //   (mêlée : allonge ; ranged/caster : distance de tir ; charger : début de charge).
  // =================================================================
  const ARCH = {
    skeleton: { model: 'skeleton', ai: 'melee',   pv: 30, speed: 2.8, dmg: 6, xp: 6, gold: [2, 5], attackCd: 1.2, range: 1.4 },
    archer:   { model: 'archer',   ai: 'ranged',  pv: 22, speed: 2.4, dmg: 5, xp: 7, gold: [2, 6], attackCd: 2.0, range: 9, projectile: 'arrow', projSpeed: 11 },
    slime:    { model: 'slime',    ai: 'swarm',   pv: 18, speed: 2.2, dmg: 4, xp: 3, gold: [1, 3], attackCd: 1.0, range: 1.1, scale: 0.9 },
    bat:      { model: 'bat',      ai: 'swarm',   pv: 12, speed: 4.6, dmg: 3, xp: 3, gold: [1, 2], attackCd: 0.9, range: 1.0 },
    knight:   { model: 'knight',   ai: 'charger', pv: 70, speed: 2.2, dmg: 10, xp: 14, gold: [5, 10], attackCd: 2.8, range: 6 },
    spider:   { model: 'spider',   ai: 'swarm',   pv: 16, speed: 4.0, dmg: 4, xp: 4, gold: [1, 3], attackCd: 0.9, range: 1.1, scale: 0.85 },
    imp:      { model: 'imp',      ai: 'caster',  pv: 28, speed: 3.0, dmg: 8, xp: 9, gold: [3, 7], attackCd: 2.4, range: 8, projectile: 'fireball', projSpeed: 9 },
    wraith:   { model: 'wraith',   ai: 'caster',  pv: 40, speed: 2.6, dmg: 9, xp: 11, gold: [4, 8], attackCd: 2.6, range: 8.5, projectile: 'orb', projSpeed: 8 },
  };

  // Paliers (index de donjon 0..5) : multiplicateurs appliqués aux archétypes
  const TIER = {
    pv:    [1, 1.5, 2.2, 3.4, 5.0, 7.5],
    dmg:   [1, 1.35, 1.8, 2.4, 3.1, 3.9],
    xp:    [1, 2.3, 4.6, 8.5, 13, 19],
    gold:  [1, 1.9, 3.3, 5.5, 8.5, 13],
    speed: [1, 1.04, 1.08, 1.12, 1.16, 1.2],
  };
  const ELITE = { pv: 2.6, dmg: 1.35, xp: 4, gold: 4, scale: 1.3, speed: 0.95 };

  const ENEMIES = {};
  function enemy(id, name, arch, tier, extra) {
    const A = ARCH[arch];
    const x = extra || {};
    const el = !!x.elite;
    const k = (key) => TIER[key][tier] * (el ? ELITE[key] : 1) * (x[key + 'Mult'] || 1);
    const e = {
      id, name, model: A.model, ai: x.ai || A.ai,
      pv: Math.round(A.pv * k('pv')),
      speed: r2(A.speed * k('speed')),
      dmg: Math.round(A.dmg * k('dmg')),
      xp: Math.round(A.xp * k('xp')),
      gold: A.gold.map((g) => Math.max(1, Math.round(g * k('gold')))),
      attackCd: r2((x.attackCd || A.attackCd)),
      range: x.range || A.range,
      scale: r2((x.scale || A.scale || 1) * (el ? ELITE.scale : 1)),
      tint: x.tint === undefined ? null : x.tint,
      elite: el,
    };
    const proj = x.projectile || A.projectile;
    if (proj) { e.projectile = proj; e.projSpeed = x.projSpeed || A.projSpeed || 9; }
    ENEMIES[id] = e;
    return e;
  }

  // --- Palier 0 : Crypte oubliée
  enemy('squelette', 'Squelette', 'skeleton', 0);
  enemy('squelette_archer', 'Squelette archer', 'archer', 0);
  enemy('chauve_souris', 'Chauve-souris', 'bat', 0);
  enemy('slime', 'Slime de crypte', 'slime', 0);
  enemy('squelette_elite', 'Gardien squelette', 'skeleton', 0, { elite: true, tint: 0xffd166 });

  // --- Palier 1 : Forêt des Murmures
  enemy('araignee', 'Araignée sylvestre', 'spider', 1);
  enemy('araignee_tisseuse', 'Tisseuse', 'spider', 1, { ai: 'ranged', projectile: 'web', projSpeed: 9, range: 8, attackCd: 2.2, pvMult: 1.4, scale: 1 });
  enemy('slime_moussu', 'Slime moussu', 'slime', 1, { tint: 0x6ab04c });
  enemy('archer_sylvestre', 'Archer des ronces', 'archer', 1, { tint: 0x7cb342 });
  enemy('chauve_souris_foret', 'Chauve-souris des bois', 'bat', 1, { tint: 0x8d6e63 });
  enemy('araignee_elite', 'Veuve écarlate', 'spider', 1, { elite: true, tint: 0xd62828, scale: 1.1 });

  // --- Palier 2 : Catacombes du Roi
  enemy('squelette_guerrier', 'Squelette guerrier', 'skeleton', 2, { tint: 0xd9c8a0 });
  enemy('squelette_lanceur', "Lanceur d'os", 'skeleton', 2, { ai: 'ranged', projectile: 'bone', projSpeed: 10, range: 8.5, attackCd: 2.1 });
  enemy('chevalier_maudit', 'Chevalier maudit', 'knight', 2);
  enemy('spectre', 'Spectre errant', 'wraith', 2);
  enemy('chauve_souris_os', 'Chauve-souris des ossuaires', 'bat', 2, { tint: 0xbdb2a0 });
  enemy('chevalier_elite', 'Champion déchu', 'knight', 2, { elite: true, tint: 0x9b5de5 });

  // --- Palier 3 : Pics Gelés
  enemy('slime_givre', 'Slime de givre', 'slime', 3, { tint: 0x9be7ff });
  enemy('chauve_souris_givre', 'Chauve-souris de givre', 'bat', 3, { tint: 0x90e0ef });
  enemy('archer_givre', 'Archer du blizzard', 'archer', 3, { projectile: 'ice', projSpeed: 12, tint: 0xcaf0f8 });
  enemy('spectre_givre', 'Âme gelée', 'wraith', 3, { projectile: 'ice', tint: 0x48cae4 });
  enemy('chevalier_givre', 'Chevalier de glace', 'knight', 3, { tint: 0x5fa8d3 });
  enemy('chevalier_givre_elite', 'Sentinelle du Blizzard', 'knight', 3, { elite: true, tint: 0xe0fbfc });

  // --- Palier 4 : Abysse sans fond
  enemy('spectre_abyssal', 'Spectre abyssal', 'wraith', 4, { tint: 0x7b2cbf });
  enemy('araignee_abyssale', "Rampeuse de l'abîme", 'spider', 4, { tint: 0x3c096c });
  enemy('tisseuse_abyssale', 'Tisseuse du Vide', 'spider', 4, { ai: 'ranged', projectile: 'web', projSpeed: 10, range: 8.5, attackCd: 2.0, pvMult: 1.4, scale: 1, tint: 0x5a189a });
  enemy('chevalier_abyssal', 'Chevalier sans visage', 'knight', 4, { tint: 0x240046 });
  enemy('squelette_abyssal', 'Damné', 'skeleton', 4, { tint: 0x9d4edd });
  enemy('spectre_elite', 'Héraut de la Liche', 'wraith', 4, { elite: true, tint: 0xc77dff });

  // --- Palier 5 : Cœur du Volcan
  enemy('diablotin', 'Diablotin', 'imp', 5);
  enemy('diablotin_cracheur', 'Cracheur de flammes', 'imp', 5, { projectile: 'flame', projSpeed: 11, range: 6.5, attackCd: 1.8, tint: 0xff9f1c });
  enemy('slime_magma', 'Slime de magma', 'slime', 5, { tint: 0xff5400 });
  enemy('chauve_souris_feu', 'Chauve-souris de braise', 'bat', 5, { tint: 0xe85d04 });
  enemy('chevalier_infernal', 'Chevalier infernal', 'knight', 5, { tint: 0x9d0208 });
  enemy('diablotin_elite', 'Seigneur diablotin', 'imp', 5, { elite: true, tint: 0xffba08 });

  // =================================================================
  // BOSS
  //   dmg = dégâts au contact (référence pour le game : les attaques spéciales
  //   peuvent en être des multiples). summon = ennemi invoqué par 'summon'
  //   (et en phase 2). phase2At = fraction de PV déclenchant la phase 2.
  // =================================================================
  const BOSSES = {
    golem: {
      id: 'golem', name: 'Golem', title: 'Le Gardien de Pierre',
      model: 'golem', pv: 700, speed: 1.6, dmg: 7, xp: 80, gold: 60,
      attacks: ['slam', 'rock'], attackCd: 3.2, summon: 'squelette', phase2At: 0.5, scale: 1, music: 'boss1',
    },
    spiderQueen: {
      id: 'spiderQueen', name: 'Arachnée', title: 'Reine des Toiles',
      model: 'spiderQueen', pv: 1250, speed: 2.6, dmg: 10, xp: 220, gold: 140,
      attacks: ['spread', 'summon', 'charge'], attackCd: 2.9, summon: 'araignee', phase2At: 0.5, scale: 1, music: 'boss2',
    },
    skeletonKing: {
      id: 'skeletonKing', name: 'Ossian', title: 'Le Roi Squelette',
      model: 'skeletonKing', pv: 2200, speed: 2.4, dmg: 13, xp: 520, gold: 300,
      attacks: ['charge', 'wave', 'summon'], attackCd: 2.7, summon: 'squelette_guerrier', phase2At: 0.5, scale: 1, music: 'boss3',
    },
    frostGiant: {
      id: 'frostGiant', name: 'Hrimgar', title: 'Le Géant du Givre',
      model: 'frostGiant', pv: 4000, speed: 1.9, dmg: 18, xp: 1050, gold: 560,
      attacks: ['slam', 'rock', 'nova'], attackCd: 2.6, summon: 'slime_givre', phase2At: 0.5, scale: 1, music: 'boss4',
    },
    lich: {
      id: 'lich', name: 'Morvaine', title: 'La Liche Éternelle',
      model: 'lich', pv: 6200, speed: 2.2, dmg: 22, xp: 1900, gold: 950,
      attacks: ['nova', 'rain', 'summon', 'spread'], attackCd: 2.4, summon: 'spectre_abyssal', phase2At: 0.5, scale: 1, music: 'boss5',
    },
    demon: {
      id: 'demon', name: 'Azgaroth', title: 'Le Démon du Volcan',
      model: 'demon', pv: 11500, speed: 2.5, dmg: 28, xp: 3200, gold: 1600,
      attacks: ['charge', 'rain', 'spread', 'slam', 'nova', 'summon'], attackCd: 2.2, summon: 'diablotin', phase2At: 0.5, scale: 1, music: 'boss6',
    },
  };

  // =================================================================
  // DONJONS
  // =================================================================
  const w = (type, count) => ({ type, count });

  const DUNGEONS = [
    {
      id: 'crypte', name: 'La Crypte Oubliée', icon: '💀', theme: 'crypte', levelRequired: 1,
      desc: "Sous le vieux cimetière, des os s'agitent dans le noir. Tout au fond, un Golem de pierre garde l'entrée des profondeurs.",
      rooms: [
        { layout: 'arena', waves: [
          [w('squelette', 3)],
          [w('squelette', 2), w('chauve_souris', 3)],
        ] },
        { layout: 'pillars', chest: true, waves: [
          [w('slime', 4), w('chauve_souris', 2)],
          [w('squelette', 3), w('squelette_archer', 1)],
        ] },
        { layout: 'cross', waves: [
          [w('squelette', 3), w('squelette_archer', 2)],
          [w('squelette_elite', 1), w('slime', 3)],
        ] },
        { layout: 'boss', boss: 'golem' },
      ],
      reward: { gold: 40, xp: 50 },
    },
    {
      id: 'foret', name: 'La Forêt des Murmures', icon: '🌲', theme: 'foret', levelRequired: 3,
      desc: "Les arbres chuchotent ton nom et les toiles pendent comme des rideaux. La Reine des Toiles attend sa proie.",
      rooms: [
        { layout: 'arena', waves: [
          [w('araignee', 5)],
          [w('slime_moussu', 3), w('archer_sylvestre', 2)],
        ] },
        { layout: 'cross', waves: [
          [w('araignee_tisseuse', 2), w('araignee', 4)],
          [w('chauve_souris_foret', 5), w('archer_sylvestre', 2)],
        ] },
        { layout: 'pillars', chest: true, waves: [
          [w('slime_moussu', 4), w('araignee_tisseuse', 2)],
          [w('araignee', 4), w('archer_sylvestre', 2)],
          [w('araignee_elite', 1), w('araignee', 3)],
        ] },
        { layout: 'boss', boss: 'spiderQueen' },
      ],
      reward: { gold: 90, xp: 120 },
    },
    {
      id: 'catacombes', name: 'Les Catacombes du Roi', icon: '⚰️', theme: 'catacombes', levelRequired: 6,
      desc: "Des galeries d'ossements à perte de vue. Ici dort Ossian, le Roi Squelette, et son armée ne dort jamais.",
      rooms: [
        { layout: 'pillars', waves: [
          [w('squelette_guerrier', 4), w('chauve_souris_os', 3)],
          [w('squelette_lanceur', 3), w('squelette_guerrier', 2)],
        ] },
        { layout: 'arena', waves: [
          [w('chevalier_maudit', 2), w('squelette_guerrier', 2)],
          [w('spectre', 2), w('chauve_souris_os', 4)],
          [w('squelette_lanceur', 2), w('chevalier_maudit', 1), w('squelette_guerrier', 3)],
        ] },
        { layout: 'cross', chest: true, waves: [
          [w('spectre', 3), w('squelette_guerrier', 3)],
          [w('chevalier_elite', 1), w('squelette_lanceur', 2), w('chauve_souris_os', 3)],
        ] },
        { layout: 'boss', boss: 'skeletonKing' },
      ],
      reward: { gold: 200, xp: 300 },
    },
    {
      id: 'glace', name: 'Les Pics Gelés', icon: '❄️', theme: 'glace', levelRequired: 10,
      desc: "Un blizzard éternel souffle sur les sommets. Chaque pas craque, chaque souffle gèle. Hrimgar le Géant fait trembler la montagne.",
      rooms: [
        { layout: 'arena', waves: [
          [w('slime_givre', 4), w('chauve_souris_givre', 4)],
          [w('archer_givre', 3), w('chevalier_givre', 1)],
        ] },
        { layout: 'pillars', chest: true, waves: [
          [w('spectre_givre', 2), w('slime_givre', 4)],
          [w('chevalier_givre', 2), w('archer_givre', 2)],
          [w('chauve_souris_givre', 6), w('spectre_givre', 1)],
        ] },
        { layout: 'cross', waves: [
          [w('archer_givre', 3), w('slime_givre', 3), w('chevalier_givre', 1)],
          [w('spectre_givre', 3), w('chauve_souris_givre', 4)],
        ] },
        { layout: 'arena', waves: [
          [w('chevalier_givre_elite', 1), w('archer_givre', 2), w('slime_givre', 3)],
        ] },
        { layout: 'boss', boss: 'frostGiant' },
      ],
      reward: { gold: 380, xp: 600 },
    },
    {
      id: 'abysse', name: "L'Abysse sans Fond", icon: '🌀', theme: 'abysse', levelRequired: 15,
      desc: "Là où la lumière n'ose plus descendre, des âmes violettes dérivent. Morvaine la Liche tisse des sorts depuis mille ans.",
      rooms: [
        { layout: 'cross', waves: [
          [w('araignee_abyssale', 6), w('squelette_abyssal', 2)],
          [w('spectre_abyssal', 3), w('tisseuse_abyssale', 2)],
        ] },
        { layout: 'pillars', waves: [
          [w('chevalier_abyssal', 2), w('squelette_abyssal', 3)],
          [w('tisseuse_abyssale', 2), w('araignee_abyssale', 5)],
          [w('spectre_abyssal', 3), w('chevalier_abyssal', 1)],
        ] },
        { layout: 'arena', chest: true, waves: [
          [w('squelette_abyssal', 4), w('spectre_abyssal', 2), w('araignee_abyssale', 3)],
          [w('spectre_elite', 1), w('tisseuse_abyssale', 2), w('squelette_abyssal', 2)],
        ] },
        { layout: 'cross', waves: [
          [w('chevalier_abyssal', 3), w('araignee_abyssale', 4)],
          [w('spectre_elite', 1), w('spectre_abyssal', 3)],
        ] },
        { layout: 'boss', boss: 'lich' },
      ],
      reward: { gold: 650, xp: 1100 },
    },
    {
      id: 'volcan', name: 'Le Cœur du Volcan', icon: '🌋', theme: 'volcan', levelRequired: 20,
      desc: "La roche fond, l'air brûle, les diablotins ricanent. Au centre du brasier, Azgaroth le Démon t'attend pour l'ultime combat.",
      rooms: [
        { layout: 'arena', waves: [
          [w('diablotin', 3), w('chauve_souris_feu', 5)],
          [w('slime_magma', 5), w('diablotin_cracheur', 2)],
        ] },
        { layout: 'cross', waves: [
          [w('chevalier_infernal', 2), w('diablotin', 3)],
          [w('diablotin_cracheur', 3), w('slime_magma', 4)],
          [w('chauve_souris_feu', 6), w('chevalier_infernal', 1), w('diablotin', 2)],
        ] },
        { layout: 'pillars', chest: true, waves: [
          [w('diablotin', 4), w('diablotin_cracheur', 2), w('slime_magma', 3)],
          [w('diablotin_elite', 1), w('chevalier_infernal', 2)],
        ] },
        { layout: 'arena', waves: [
          [w('chevalier_infernal', 2), w('diablotin_cracheur', 3), w('chauve_souris_feu', 4)],
          [w('diablotin_elite', 2), w('slime_magma', 4)],
        ] },
        { layout: 'boss', boss: 'demon' },
      ],
      reward: { gold: 1100, xp: 2000 },
    },
  ];

  // =================================================================
  // COFFRE PIÉGÉ (exercice 5) & ÉTOILES
  // =================================================================
  const di = (i) => Math.max(0, Math.min(DUNGEONS.length - 1, Math.floor(Number(i) || 0)));
  const CHEST = {
    min: 1, max: 20, tries: 3,
    // gain si le code est trouvé (« l'Arme Ultime » = gros sac d'or + XP)
    goldWin(i) { const d = di(i); return [60, 140, 300, 560, 950, 1600][d]; },
    xpWin(i) { const d = di(i); return [30, 80, 200, 400, 750, 1300][d]; },
    // (optionnel) or perdu si le coffre « mange votre Or » : 10 % du gain potentiel
    goldLoss(i) { return Math.round(CHEST.goldWin(i) * 0.1); },
  };

  const STARS = {
    // temps limite pour l'étoile chrono : ~18 s par vague + 6 s par salle + 50 s de boss,
    // arrondi aux 10 s supérieures
    timeLimit(i) {
      const D = DUNGEONS[di(i)];
      let waves = 0;
      D.rooms.forEach((r) => { waves += (r.waves ? r.waves.length : 0); });
      const t = waves * 18 + D.rooms.length * 6 + 50;
      return Math.ceil(t / 10) * 10;
    },
  };

  G.DATA = {
    CLASSES, WEAPONS, forgeInfo, forgeMult, SUPER, DASH, XP, ITEMS, ENEMIES, BOSSES, DUNGEONS, CHEST, STARS,
  };
})();
