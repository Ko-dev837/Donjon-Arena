/* =====================================================================
   js/data/items.js — RÔLE 5 : objets, raretés, affixes, ensembles, matériaux, recettes
   Données pures (aucune dépendance au chargement). Exposé : G.ITEMS.
   L'implémentation (génération, équipement, effets uniques, panneau) est dans js/sys/inventory.js.

   ---------------------------------------------------------------------
   ÉQUILIBRAGE — « budget de puissance » (documentation)
   ---------------------------------------------------------------------
   Chaque objet reçoit un budget exprimé en % de PUISSANCE du héros (à niveau 30, +0) :
        budget = RARITY.budget × SLOT.weight × levelFactor(niveau)
   levelFactor = 0,25 + 0,75 × min(niveau,30)/30.   Chaque stat convertit son % de budget en valeur
   naturelle via STATS[stat].w (puissance % par 1 % de la stat de référence STATS[stat].ref).
   55 % du budget va aux stats de base (parts `baseStats`), 45 % aux affixes (1 à 5 selon la rareté).
   Amélioration +1..+10 : chaque palier ajoute +3 % aux stats (×1,30 à +10).

   Apport d'un équipement COMPLET (6 pièces, niveau 30), en % de puissance :
        rareté       budget(6 pièces)   à +10 (×1,3)   + bonus d'ensemble       total approx.
        commun             11 %            14 %             —                      ~ +14 %
        rare               20 %            26 %             —                      ~ +26 %
        épique             30 %            39 %           +6 % (set 3 pièces)      ~ +45-50 %
        légendaire         40 %            52 %          +11 % (set 4 pièces)      ~ +63 %   <- « set légendaire complet ≈ +60 % »
        mythique           52 %            68 %          (pas de set)  + effet unique ~ +68 %
   Les effets uniques sont volontairement « gratuits » en budget : ils sont situationnels (≈ +5-10 %
   de dégâts moyens). Plafonds anti-abus sur le total de l'équipement : crit 60 %, critDmg +150 %,
   cdr 40 %, vol de vie 25 %, esquive 30 %, vitesse +2,5, serviteurs +4.
   Les valeurs `ref` (stats de référence à niveau 30) sont ajustables : G.ITEMS.balance.refs.
   ===================================================================== */
window.G = window.G || {};
(() => {
  const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'Z'];

  // ------------------------------------------------------------------
  // RARETÉS (couleurs : CONTRACT-V3 §10)
  //   affixes = nombre d'affixes tirés ; budget = % de puissance pour 6 pièces niveau 30 (+0)
  //   salvage = fragments rendus (× facteur niveau) ; upCost = multiplicateur du coût d'amélioration
  // ------------------------------------------------------------------
  const RARITIES = [
    { id: 'commun',     name: 'Commun',     color: '#b8c0cc', affixes: 1, budget: 11, salvage: 2,  upCost: 0.7, sell: 8 },
    { id: 'rare',       name: 'Rare',       color: '#3fa9ff', affixes: 2, budget: 20, salvage: 5,  upCost: 1.0, sell: 30 },
    { id: 'epique',     name: 'Épique',     color: '#b44dff', affixes: 3, budget: 30, salvage: 11, upCost: 1.5, sell: 110 },
    { id: 'legendaire', name: 'Légendaire', color: '#ffb020', affixes: 4, budget: 40, salvage: 24, upCost: 2.4, sell: 450 },
    { id: 'mythique',   name: 'Mythique',   color: '#ff3d6e', affixes: 5, budget: 52, salvage: 48, upCost: 3.6, sell: 1800 },
  ];

  // Poids de tirage (en %) par rang du donjon : [commun, rare, épique, légendaire, mythique]
  // (le lootLuck multiplie le poids de la rareté i par (1+luck)^i, puis renormalisation)
  const RARITY_WEIGHTS = {
    E:  [80, 18, 2, 0, 0],
    D:  [68, 26, 5.5, 0.5, 0],
    C:  [55, 32, 11, 2, 0],
    B:  [42, 36, 17, 4.5, 0.5],
    A:  [30, 36, 24, 8.5, 1.5],
    S:  [20, 33, 30, 14, 3],
    Z: [12, 28, 34, 20, 6],
  };

  // ------------------------------------------------------------------
  // EMPLACEMENTS (weight = part du budget de l'objet)
  // ------------------------------------------------------------------
  const SLOTS = [
    { id: 'arme',     name: 'Arme',     icon: '⚔️', weight: 0.24 },
    { id: 'armure',   name: 'Armure',   icon: '🛡️', weight: 0.22 },
    { id: 'casque',   name: 'Casque',   icon: '⛑️', weight: 0.14 },
    { id: 'bottes',   name: 'Bottes',   icon: '🥾', weight: 0.12 },
    { id: 'anneau',   name: 'Anneau',   icon: '💍', weight: 0.14 },
    { id: 'amulette', name: 'Amulette', icon: '📿', weight: 0.14 },
  ];

  // ------------------------------------------------------------------
  // STATS : kind 'flat' (valeur brute) | 'frac' (fraction : 0.05 = 5 %) | 'pct' (multiplicateur %, fraction)
  //   ref : stat de référence (flat) à niveau 30 ; w : % de puissance par 1 % de la référence (ou par 1 % pour frac/pct)
  //   cap : plafond sur le TOTAL de l'équipement (0 = aucun)
  // Les stats `dmg_<élément>` sont des fractions additionnées au multiplicateur stats.dmg[élément].
  // ------------------------------------------------------------------
  const STATS = {
    pvMax:        { label: 'PV max',              kind: 'flat', ref: 400, w: 0.35 },
    manaMax:      { label: 'Mana max',            kind: 'flat', ref: 150, w: 0.15 },
    manaRegen:    { label: 'Régén. de mana /s',   kind: 'flat', ref: 5,   w: 0.12, dec: 1 },
    force:        { label: 'Force',               kind: 'flat', ref: 30,  w: 0.9 },
    intelligence: { label: 'Intelligence',        kind: 'flat', ref: 30,  w: 0.8 },
    defense:      { label: 'Défense',             kind: 'flat', ref: 20,  w: 0.45 },
    vitesse:      { label: 'Vitesse',             kind: 'flat', ref: 6,   w: 0.5, dec: 2, cap: 2.5 },
    pvMaxPct:     { label: 'PV max',              kind: 'pct',  w: 0.45 },
    forcePct:     { label: 'Force',               kind: 'pct',  w: 0.95 },
    intelligencePct: { label: 'Intelligence',     kind: 'pct',  w: 0.85 },
    defensePct:   { label: 'Défense',             kind: 'pct',  w: 0.5 },
    manaMaxPct:   { label: 'Mana max',            kind: 'pct',  w: 0.2 },
    crit:         { label: 'Chance de critique',  kind: 'frac', w: 0.5,  cap: 0.6 },
    critDmg:      { label: 'Dégâts critiques',    kind: 'frac', w: 0.22, cap: 1.5 },
    cdr:          { label: 'Récupération',        kind: 'frac', w: 0.7,  cap: 0.4 },
    lifesteal:    { label: 'Vol de vie',          kind: 'frac', w: 1.0,  cap: 0.25 },
    dodge:        { label: 'Esquive',             kind: 'frac', w: 0.6,  cap: 0.3 },
    xpMult:       { label: 'XP gagnée',           kind: 'frac', w: 0.3 },
    goldMult:     { label: 'Or gagné',            kind: 'frac', w: 0.2 },
    lootLuck:     { label: 'Chance de butin',     kind: 'frac', w: 0.3 },
    dmg_physique: { label: 'Dégâts physiques',    kind: 'frac', w: 0.8 },
    dmg_feu:      { label: 'Dégâts de feu',       kind: 'frac', w: 0.8 },
    dmg_glace:    { label: 'Dégâts de glace',     kind: 'frac', w: 0.8 },
    dmg_foudre:   { label: 'Dégâts de foudre',    kind: 'frac', w: 0.8 },
    dmg_ombre:    { label: "Dégâts d'ombre",      kind: 'frac', w: 0.8 },
    dmg_sacre:    { label: 'Dégâts sacrés',       kind: 'frac', w: 0.8 },
    dmg_poison:   { label: 'Dégâts de poison',    kind: 'frac', w: 0.8 },
    minionDmg:    { label: 'Dégâts des serviteurs', kind: 'frac', w: 0.7 },
    minionPv:     { label: 'PV des serviteurs',   kind: 'frac', w: 0.35 },
    minionCap:    { label: 'Serviteurs max',      kind: 'flat', ref: 100 / 7, w: 1, int: true, cap: 4 },
  };

  // ------------------------------------------------------------------
  // AFFIXES (29) : weight = fréquence ; slots = emplacements autorisés ; minRarity = index de rareté minimum ;
  //   max = plafond de la valeur naturelle d'un seul affixe (anti-valeurs absurdes sur les utilitaires)
  // ------------------------------------------------------------------
  const ALL = null;
  const AFFIX_LIST = [
    ['force',        'du Titan',        10, ALL],
    ['intelligence', 'du Sage',         10, ALL],
    ['defense',      'du Rempart',      10, ['armure', 'casque', 'bottes', 'amulette']],
    ['pvMax',        'de Vitalité',     10, ALL],
    ['manaMax',      'de Sérénité',     7,  ALL],
    ['manaRegen',    'de la Source',    6,  ['casque', 'anneau', 'amulette', 'armure']],
    ['vitesse',      'du Vent',         7,  ['bottes', 'anneau', 'amulette']],
    ['pvMaxPct',     'du Colosse',      5,  ['armure', 'casque', 'amulette']],
    ['forcePct',     'du Berserker',    5,  ['arme', 'anneau', 'amulette']],
    ['intelligencePct', 'de l\'Archimage', 5, ['arme', 'anneau', 'amulette']],
    ['defensePct',   'de la Forteresse', 5, ['armure', 'casque', 'bottes']],
    ['crit',         'du Prisme',       8,  ['arme', 'casque', 'anneau', 'amulette', 'bottes']],
    ['critDmg',      'du Bourreau',     7,  ['arme', 'casque', 'anneau', 'amulette']],
    ['cdr',          'de l\'Instant',   7,  ['arme', 'casque', 'anneau', 'amulette']],
    ['lifesteal',    'du Vampire',      4,  ['arme', 'anneau', 'amulette']],
    ['dodge',        'du Spectre',      5,  ['bottes', 'armure', 'amulette']],
    ['xpMult',       'du Sage-Errant',  4,  ['anneau', 'amulette', 'casque', 'bottes']],
    ['goldMult',     'du Marchand',     4,  ['anneau', 'amulette', 'casque', 'bottes']],
    ['lootLuck',     'du Chanceux',     3,  ['anneau', 'amulette', 'casque', 'bottes']],
    ['dmg_physique', 'de l\'Acier',     6,  ALL],
    ['dmg_feu',      'du Brasier',      6,  ALL],
    ['dmg_glace',    'du Givre',        6,  ALL],
    ['dmg_foudre',   'de l\'Orage',     6,  ALL],
    ['dmg_ombre',    'des Ténèbres',    6,  ALL],
    ['dmg_sacre',    'de l\'Aube',      6,  ALL],
    ['dmg_poison',   'du Venin',        6,  ALL],
    ['minionDmg',    'du Fossoyeur',    5,  ['arme', 'anneau', 'amulette', 'casque']],
    ['minionPv',     'de l\'Ossuaire',  5,  ['armure', 'casque', 'amulette', 'bottes']],
    ['minionCap',    'de la Horde',     2,  ['anneau', 'amulette', 'casque']],
  ];
  const MAXV = { xpMult: 0.15, goldMult: 0.2, lootLuck: 0.12, lifesteal: 0.06, dodge: 0.08, minionCap: 1, vitesse: 0.8, cdr: 0.1, crit: 0.12 };
  const AFFIXES = {};
  AFFIX_LIST.forEach(([stat, suffix, weight, slots]) => {
    AFFIXES[stat] = { id: stat, stat, suffix, weight, slots, minRarity: stat === 'minionCap' ? 2 : 0, max: MAXV[stat] || 0 };
  });

  // ------------------------------------------------------------------
  // BASES D'OBJETS (génériques) — parts du budget de base (somme = 1)
  //   tier 0 : rangs E-D | tier 1 : rangs C-B | tier 2 : rangs A-S-Z
  // ------------------------------------------------------------------
  const bases = {};
  function B(id, slot, tier, name, icon, shares, classes) {
    bases[id] = { id, slot, tier, name, icon, classes: classes || null, baseStats: shares, rankReq: ['E', 'C', 'A'][tier] };
  }
  // --- armes spécifiques aux 8 classes (3 paliers ; Nécromancien : faux ET grimoires) ---
  B('epee_fer',       'arme', 0, 'Épée de fer',           '⚔️', { force: 0.75, crit: 0.25 }, ['Guerrier']);
  B('lame_acier',     'arme', 1, 'Lame d\'acier trempé',  '⚔️', { force: 0.7, critDmg: 0.3 }, ['Guerrier']);
  B('espadon_runique','arme', 2, 'Espadon runique',       '🗡️', { force: 0.65, crit: 0.15, critDmg: 0.2 }, ['Guerrier']);
  B('baton_chene',    'arme', 0, 'Bâton de chêne',        '🪄', { intelligence: 0.7, manaMax: 0.3 }, ['Mage']);
  B('baton_amethyste','arme', 1, 'Bâton d\'améthyste',    '🪄', { intelligence: 0.65, cdr: 0.35 }, ['Mage']);
  B('sceptre_astral', 'arme', 2, 'Sceptre astral',        '🔮', { intelligence: 0.6, dmg_feu: 0.2, cdr: 0.2 }, ['Mage']);
  B('dague_poche',    'arme', 0, 'Dague de poche',        '🗡️', { force: 0.6, crit: 0.4 }, ['Voleur']);
  B('stylet_ebene',   'arme', 1, 'Stylet d\'ébène',       '🗡️', { force: 0.55, crit: 0.25, vitesse: 0.2 }, ['Voleur']);
  B('lames_jumelles', 'arme', 2, 'Lames jumelles',        '🗡️', { force: 0.5, crit: 0.25, critDmg: 0.25 }, ['Voleur']);
  B('poignard_silence','arme', 0, 'Poignard-silence',     '🔪', { force: 0.5, critDmg: 0.3, crit: 0.2 }, ['Assassin']);
  B('griffes_obsidienne','arme', 1, 'Griffes d\'obsidienne', '🔪', { force: 0.45, critDmg: 0.35, dmg_ombre: 0.2 }, ['Assassin']);
  B('lames_ombre_vive','arme', 2, 'Lames de l\'Ombre-vive', '🔪', { force: 0.4, critDmg: 0.3, crit: 0.15, dmg_ombre: 0.15 }, ['Assassin']);
  B('arc_court',      'arme', 0, 'Arc court',             '🏹', { force: 0.7, crit: 0.3 }, ['Archer']);
  B('arc_composite',  'arme', 1, 'Arc composite',         '🏹', { force: 0.6, crit: 0.2, vitesse: 0.2 }, ['Archer']);
  B('arc_long_cimes', 'arme', 2, 'Arc long des cimes',    '🏹', { force: 0.55, crit: 0.2, critDmg: 0.25 }, ['Archer']);
  B('masse_benie',    'arme', 0, 'Masse bénie',           '🔨', { force: 0.55, defense: 0.25, dmg_sacre: 0.2 }, ['Paladin']);
  B('marteau_argent', 'arme', 1, 'Marteau d\'argent',     '🔨', { force: 0.5, defense: 0.2, dmg_sacre: 0.3 }, ['Paladin']);
  B('maillet_lumiere','arme', 2, 'Maillet de lumière',    '🔨', { force: 0.45, pvMax: 0.2, dmg_sacre: 0.35 }, ['Paladin']);
  B('baguette_frene', 'arme', 0, 'Baguette de frêne',     '🪄', { intelligence: 0.6, dmg_foudre: 0.2, dmg_glace: 0.2 }, ['Elementaliste']);
  B('baton_deux_tempetes','arme', 1, 'Bâton des deux tempêtes', '🪄', { intelligence: 0.55, dmg_foudre: 0.25, dmg_glace: 0.2 }, ['Elementaliste']);
  B('sceptre_elements','arme', 2, 'Sceptre des éléments', '🔮', { intelligence: 0.5, cdr: 0.2, dmg_foudre: 0.15, dmg_glace: 0.15 }, ['Elementaliste']);
  B('faux_os',        'arme', 0, 'Faux d\'os',            '🪓', { minionDmg: 0.6, intelligence: 0.4 }, ['Necromancien']);
  B('grimoire_use',   'arme', 0, 'Grimoire usé',          '📕', { minionPv: 0.4, minionDmg: 0.3, manaMax: 0.3 }, ['Necromancien']);
  B('faux_fossoyeur', 'arme', 1, 'Faux du Fossoyeur',     '🪓', { minionDmg: 0.55, intelligence: 0.25, dmg_ombre: 0.2 }, ['Necromancien']);
  B('grimoire_tombes','arme', 1, 'Grimoire des Tombes',   '📕', { minionPv: 0.35, minionDmg: 0.35, cdr: 0.3 }, ['Necromancien']);
  B('faux_nuit',      'arme', 2, 'Faux de la Nuit sans fin', '🪓', { minionDmg: 0.5, dmg_ombre: 0.25, intelligence: 0.25 }, ['Necromancien']);
  B('grimoire_os_maudit','arme', 2, 'Grimoire d\'os maudit', '📕', { minionPv: 0.35, minionDmg: 0.35, manaRegen: 0.15, cdr: 0.15 }, ['Necromancien']);
  // --- armures ---
  B('gilet_cuir',     'armure', 0, 'Gilet de cuir',        '🥋', { pvMax: 0.6, defense: 0.4 });
  B('robe_lin',       'armure', 0, 'Robe de lin brodée',   '👘', { pvMax: 0.4, manaMax: 0.3, intelligence: 0.3 });
  B('cotte_mailles',  'armure', 1, 'Cotte de mailles',     '🛡️', { pvMax: 0.5, defense: 0.5 });
  B('manteau_tisse_lune','armure', 1, 'Manteau tisse-lune','🧥', { pvMax: 0.35, intelligence: 0.35, cdr: 0.3 });
  B('plastron_dracomaille','armure', 2, 'Plastron de dracomaille', '🛡️', { pvMax: 0.45, defense: 0.55 });
  B('robe_astrale',   'armure', 2, 'Robe astrale',         '👘', { pvMax: 0.3, intelligence: 0.4, manaRegen: 0.3 });
  // --- casques ---
  B('capuche_voyage', 'casque', 0, 'Capuche de voyage',    '🧢', { pvMax: 0.5, crit: 0.5 });
  B('bandeau_fer',    'casque', 0, 'Bandeau de fer',       '⛑️', { defense: 0.6, pvMax: 0.4 });
  B('heaume_cimier',  'casque', 1, 'Heaume à cimier',      '🪖', { defense: 0.5, pvMax: 0.3, force: 0.2 });
  B('cagoule_ombre',  'casque', 1, 'Cagoule d\'ombre',     '🥷', { crit: 0.5, dodge: 0.3, critDmg: 0.2 });
  B('heaume_cerbere', 'casque', 2, 'Heaume du Cerbère',    '🪖', { defense: 0.45, pvMax: 0.35, forcePct: 0.2 });
  B('diademe_argent', 'casque', 2, 'Diadème d\'argent',    '👑', { intelligence: 0.5, manaMax: 0.3, cdr: 0.2 });
  // --- bottes ---
  B('sandales_cuir',  'bottes', 0, 'Sandales de cuir',     '🥾', { vitesse: 0.6, pvMax: 0.4 });
  B('bottes_cloutees','bottes', 0, 'Bottes cloutées',      '🥾', { defense: 0.5, pvMax: 0.5 });
  B('bottes_chasseur','bottes', 1, 'Bottes de chasseur',   '🥾', { vitesse: 0.5, dodge: 0.5 });
  B('jambieres_acier','bottes', 1, 'Jambières d\'acier',   '🥾', { defense: 0.6, pvMax: 0.4 });
  B('bottes_vent',    'bottes', 2, 'Bottes du vent',       '🥾', { vitesse: 0.6, dodge: 0.4 });
  B('solerets_runiques','bottes', 2, 'Solerets runiques',  '🥾', { defense: 0.5, pvMax: 0.3, cdr: 0.2 });
  // --- anneaux ---
  B('anneau_cuivre',  'anneau', 0, 'Anneau de cuivre',     '💍', { force: 0.6, crit: 0.4 });
  B('anneau_jade',    'anneau', 0, 'Anneau de jade',       '💍', { intelligence: 0.6, manaMax: 0.4 });
  B('anneau_argent',  'anneau', 1, 'Anneau d\'argent',     '💍', { force: 0.5, critDmg: 0.5 });
  B('sceau_opale',    'anneau', 1, 'Sceau d\'opale',       '💍', { intelligence: 0.5, cdr: 0.5 });
  B('anneau_obsidienne','anneau', 2, 'Anneau d\'obsidienne','💍', { crit: 0.5, critDmg: 0.5 });
  B('anneau_saphir',  'anneau', 2, 'Anneau de saphir stellaire', '💍', { force: 0.4, intelligence: 0.4, cdr: 0.2 });
  // --- amulettes ---
  B('pendentif_bois', 'amulette', 0, 'Pendentif de bois',  '📿', { pvMax: 0.6, defense: 0.4 });
  B('talisman_os',    'amulette', 0, 'Talisman d\'os',     '📿', { pvMax: 0.5, lifesteal: 0.5 });
  B('reliquaire_os',  'amulette', 0, 'Reliquaire d\'os',   '⚱️', { minionDmg: 0.5, minionPv: 0.5 });
  B('pendentif_argent','amulette', 1, 'Pendentif d\'argent','📿', { pvMax: 0.5, cdr: 0.5 });
  B('talisman_sang',  'amulette', 1, 'Talisman de sang',   '📿', { lifesteal: 0.5, critDmg: 0.5 });
  B('reliquaire_cendres','amulette', 1, 'Reliquaire de cendres', '⚱️', { minionDmg: 0.5, minionPv: 0.5 });
  B('collier_astral', 'amulette', 2, 'Collier astral',     '📿', { pvMax: 0.35, intelligence: 0.35, cdr: 0.3 });
  B('talisman_dragon','amulette', 2, 'Talisman du dragon', '📿', { force: 0.4, critDmg: 0.3, lifesteal: 0.3 });
  B('reliquaire_neant','amulette', 2, 'Reliquaire du néant', '⚱️', { minionDmg: 0.45, minionPv: 0.35, minionCap: 0.2 });

  // ------------------------------------------------------------------
  // EFFETS UNIQUES (données ; l'implémentation est dans inventory.js, G.Inventory.EFFECTS)
  //   p = paramètres d'équilibrage ; desc = texte affiché
  // ------------------------------------------------------------------
  const EFFECTS = {
    ombre_10:     { name: 'Vague du Crépuscule', desc: 'Chaque 10e coup libère une vague d\'ombre autour de vous (dégâts d\'ombre de zone).', p: { every: 10, element: 'ombre', radius: 5, mult: 2.2, heal: 0 } },
    aube_6:       { name: 'Rayon de l\'Aube',    desc: 'Chaque 6e coup déclenche une onde sacrée qui blesse les ennemis proches et vous soigne de 3 % de vos PV max.', p: { every: 6, element: 'sacre', radius: 6, mult: 2.0, heal: 0.03 } },
    eclipse:      { name: 'Éclipse',             desc: 'Chaque 7e coup provoque une éclipse : déflagration d\'ombre massive autour de vous.', p: { every: 7, element: 'ombre', radius: 8, mult: 3.4, heal: 0 } },
    poison_nuit:  { name: 'Venin de nuit',       desc: '20 % de chance d\'empoisonner l\'ennemi touché pendant 4 s.', p: { chance: 0.2, duration: 4, mult: 0.35 } },
    foudre_crit:  { name: 'Orage sans fin',      desc: 'Les coups critiques ont 30 % de chance de se propager en éclairs sur 2 ennemis proches (60 % des dégâts).', p: { chance: 0.3, targets: 2, range: 8, mult: 0.6 } },
    givre_nova:   { name: 'Nova de givre',       desc: 'Un ennemi vaincu a 25 % de chance d\'exploser en nova de glace qui ralentit les ennemis proches.', p: { chance: 0.25, radius: 3.5, mult: 1.3, slow: 2.5 } },
    moisson_ames: { name: 'Moisson d\'âmes',     desc: 'Tous les 5 ennemis vaincus, vos serviteurs récupèrent 25 % de leurs PV et gagnent +25 % de dégâts pendant 6 s.', p: { every: 5, heal: 0.25, dmg: 0.25, duration: 6 } },
    eclat_necro:  { name: 'Éclat des abîmes',    desc: 'Chaque ennemi vaincu par un serviteur vous rend 6 mana ; les ennemis vaincus par vous soignent vos serviteurs de 4 %.', p: { mana: 6, heal: 0.04 } },
    bastion:      { name: 'Bastion',             desc: 'Le premier coup reçu toutes les 10 s est réduit de 60 %.', p: { cd: 10, reduce: 0.6 } },
    bastion_fort: { name: 'Colosse éternel',     desc: 'Le premier coup reçu toutes les 6 s est réduit de 75 %.', p: { cd: 6, reduce: 0.75 } },
    phenix:       { name: 'Renaissance',         desc: 'Une fois par donjon, un coup mortel vous laisse à 1 PV et vous soigne de 40 %.', p: { heal: 0.4 } },
    vent_fantome: { name: 'Vent fantôme',        desc: 'Une esquive réussie vous donne +35 % de vitesse pendant 3 s.', p: { duration: 3, speedMult: 0.35 } },
    echo_mana:    { name: 'Écho arcanique',      desc: 'Lancer un sort a 20 % de chance de restituer 8 mana.', p: { chance: 0.2, mana: 8 } },
    vampire:      { name: 'Soif de sang',        desc: 'Les coups critiques vous soignent de 2,5 % de vos PV max.', p: { heal: 0.025 } },
    chasseur_elite: { name: 'Chasseur de seigneurs', desc: 'Vaincre un élite ou un boss vous soigne de 8 % de vos PV max et rend 10 mana.', p: { heal: 0.08, mana: 10 } },
    surcharge:    { name: 'Surcharge souveraine', desc: 'Après avoir vaincu un élite ou un boss : +25 % de dégâts pendant 8 s.', p: { dmg: 0.25, duration: 8 } },
    tempete:      { name: 'Cœur de tempête',     desc: 'Chaque 4e sort lancé déchaîne la foudre sur l\'ennemi le plus proche (et 2 voisins).', p: { every: 4, mult: 2.0, targets: 3, range: 9 } },
    // effets des bonus d'ensemble
    brasier:      { name: 'Brasier',             desc: 'Les dégâts de feu ont 20 % de chance de brûler la cible.', p: { chance: 0.2, duration: 4, mult: 0.3 } },
    lune_ombre:   { name: 'Danse lunaire',       desc: 'Après une esquive : +35 % de dégâts pendant 3 s.', p: { dmg: 0.35, duration: 3 } },
    aube_set:     { name: 'Bénédiction',         desc: 'Chaque ennemi vaincu vous soigne de 2 % de vos PV max.', p: { heal: 0.02 } },
    sentinelle:   { name: 'Œil de la sentinelle', desc: 'Les projectiles infligent +12 % de dégâts.', p: { dmg: 0.12 } },
  };

  // ------------------------------------------------------------------
  // OBJETS LÉGENDAIRES / MYTHIQUES NOMMÉS (effet unique)
  //   rankReq fixe ; classes null = toutes
  // ------------------------------------------------------------------
  const UNIQUES = [
    ['lame_crepuscule',   'arme',     'legendaire', 'Lame du Crépuscule',      '🗡️', ['Guerrier', 'Paladin'],           'C', { force: 0.7, dmg_ombre: 0.3 },            'ombre_10'],
    ['dague_venin_nuit',  'arme',     'legendaire', 'Dague Venin-de-Nuit',     '🗡️', ['Voleur', 'Assassin'],            'C', { force: 0.55, crit: 0.25, dmg_poison: 0.2 }, 'poison_nuit'],
    ['arc_orage',         'arme',     'legendaire', 'Arc de l\'Orage sans fin','🏹', ['Archer'],                        'B', { force: 0.6, crit: 0.2, dmg_foudre: 0.2 }, 'foudre_crit'],
    ['sceptre_givre',     'arme',     'legendaire', 'Sceptre du Givre éternel','🔮', ['Mage', 'Elementaliste'],         'B', { intelligence: 0.6, dmg_glace: 0.4 },       'givre_nova'],
    ['faux_dernier_souffle','arme',   'legendaire', 'Faux du Dernier Souffle', '🪓', ['Necromancien'],                  'C', { minionDmg: 0.6, minionPv: 0.2, intelligence: 0.2 }, 'moisson_ames'],
    ['marteau_aube',      'arme',     'legendaire', 'Marteau de l\'Aube',      '🔨', ['Paladin'],                       'B', { force: 0.5, dmg_sacre: 0.3, defense: 0.2 }, 'aube_6'],
    ['rempart_aube',      'armure',   'legendaire', 'Rempart de l\'Aube',      '🛡️', null,                              'C', { pvMax: 0.5, defense: 0.5 },               'bastion'],
    ['amulette_phenix',   'amulette', 'legendaire', 'Amulette du Phénix',      '🔥', null,                              'B', { pvMax: 0.5, dmg_feu: 0.3, lifesteal: 0.2 }, 'phenix'],
    ['bottes_vent_fantome','bottes',  'legendaire', 'Bottes du Vent fantôme',  '🥾', null,                              'C', { vitesse: 0.5, dodge: 0.5 },               'vent_fantome'],
    ['anneau_echos',      'anneau',   'legendaire', 'Anneau des Échos',        '💍', null,                              'C', { intelligence: 0.4, cdr: 0.4, manaRegen: 0.2 }, 'echo_mana'],
    ['anneau_croc_sang',  'anneau',   'legendaire', 'Anneau Croc-de-Sang',     '💍', null,                              'C', { force: 0.4, critDmg: 0.3, lifesteal: 0.3 }, 'vampire'],
    ['couronne_chasseur', 'casque',   'legendaire', 'Couronne du Chasseur',    '👑', null,                              'C', { pvMax: 0.4, crit: 0.3, force: 0.3 },       'chasseur_elite'],
    // mythiques
    ['coeur_tempete',     'amulette', 'mythique',   'Cœur-de-Tempête',         '💠', ['Mage', 'Elementaliste'],         'B', { intelligence: 0.4, dmg_foudre: 0.3, cdr: 0.3 }, 'tempete'],
    ['plastron_colosse',  'armure',   'mythique',   'Plastron du Colosse éternel', '🛡️', null,                          'B', { pvMax: 0.45, defense: 0.4, pvMaxPct: 0.15 }, 'bastion_fort'],
    ['grimoire_abimes',   'arme',     'mythique',   'Grimoire des Abîmes',     '📕', ['Necromancien'],                  'A', { minionDmg: 0.4, minionPv: 0.3, minionCap: 0.1, intelligence: 0.2 }, 'eclat_necro'],
    ['tranche_eclipse',   'arme',     'mythique',   'Tranche-Éclipse',         '⚔️', ['Guerrier', 'Paladin', 'Assassin'], 'A', { force: 0.55, critDmg: 0.25, dmg_ombre: 0.2 }, 'eclipse'],
    ['diademe_souverain', 'casque',   'mythique',   'Diadème du Souverain',    '👑', null,                              'S', { pvMax: 0.3, force: 0.25, intelligence: 0.25, crit: 0.2 }, 'surcharge'],
  ];
  UNIQUES.forEach(([id, slot, rarity, name, icon, classes, rankReq, shares, effect]) => {
    bases[id] = { id, slot, tier: 2, name, icon, classes, baseStats: shares, rankReq, unique: true, rarity, effect };
  });

  // ------------------------------------------------------------------
  // ENSEMBLES (7) : bonus 2 / 3 / 4 pièces
  //   bonus = { pct, mix:{stat:part} } (valeur calculée depuis un budget de puissance en %) ou { stats:{...} } (valeurs explicites)
  //   + effect (id d'EFFECTS) optionnel. Les bonus sont CUMULATIFS (3 pièces = bonus 2 + bonus 3).
  //   Total des bonus à 4 pièces ≈ 11 % de puissance (3 + 3 + 5), 3 pièces ≈ 6 %.
  // ------------------------------------------------------------------
  const SETS = {
    veilleur_acier: {
      name: 'Veilleur d\'Acier', rarity: 'legendaire', minRank: 'C', color: '#9bb4d6', classes: ['Guerrier', 'Paladin'],
      pieces: [
        { id: 'veilleur_lame',   slot: 'arme',   name: 'Lame du Veilleur',    icon: '⚔️', classes: ['Guerrier', 'Paladin'], shares: { force: 0.7, defense: 0.15, pvMax: 0.15 } },
        { id: 'veilleur_heaume', slot: 'casque', name: 'Heaume du Veilleur',  icon: '🪖', shares: { defense: 0.5, pvMax: 0.5 } },
        { id: 'veilleur_plastron', slot: 'armure', name: 'Plastron du Veilleur', icon: '🛡️', shares: { pvMax: 0.5, defense: 0.5 } },
        { id: 'veilleur_bottes', slot: 'bottes', name: 'Grèves du Veilleur',  icon: '🥾', shares: { defense: 0.5, pvMax: 0.3, vitesse: 0.2 } },
      ],
      bonuses: {
        2: { pct: 3, mix: { pvMax: 0.6, defense: 0.4 } },
        3: { pct: 3, mix: { forcePct: 1 } },
        4: { pct: 5, mix: { defensePct: 0.5, pvMaxPct: 0.5 }, effect: 'bastion' },
      },
    },
    tisse_flammes: {
      name: 'Tisse-Flammes', rarity: 'legendaire', minRank: 'C', color: '#ff7a2e', classes: ['Mage', 'Elementaliste'],
      pieces: [
        { id: 'flammes_baton',  slot: 'arme',   name: 'Bâton Tisse-Flammes', icon: '🔥', classes: ['Mage', 'Elementaliste'], shares: { intelligence: 0.6, dmg_feu: 0.4 } },
        { id: 'flammes_chapeau', slot: 'casque', name: 'Chapeau Tisse-Flammes', icon: '🎩', shares: { intelligence: 0.5, manaMax: 0.5 } },
        { id: 'flammes_robe',   slot: 'armure', name: 'Robe Tisse-Flammes',  icon: '👘', shares: { pvMax: 0.4, intelligence: 0.3, dmg_feu: 0.3 } },
        { id: 'flammes_sandales', slot: 'bottes', name: 'Sandales Tisse-Flammes', icon: '🥾', shares: { vitesse: 0.4, intelligence: 0.3, cdr: 0.3 } },
      ],
      bonuses: {
        2: { pct: 3, mix: { intelligence: 0.5, dmg_feu: 0.5 } },
        3: { pct: 3, mix: { cdr: 1 } },
        4: { pct: 5, mix: { dmg_feu: 0.6, intelligencePct: 0.4 }, effect: 'brasier' },
      },
    },
    ombre_lune: {
      name: 'Ombre-Lune', rarity: 'legendaire', minRank: 'B', color: '#8d7bff', classes: ['Voleur', 'Assassin'],
      pieces: [
        { id: 'lune_lame',    slot: 'arme',   name: 'Croc d\'Ombre-Lune',  icon: '🔪', classes: ['Voleur', 'Assassin'], shares: { force: 0.5, crit: 0.25, critDmg: 0.25 } },
        { id: 'lune_capuche', slot: 'casque', name: 'Capuche d\'Ombre-Lune', icon: '🥷', shares: { crit: 0.5, dodge: 0.5 } },
        { id: 'lune_cape',    slot: 'armure', name: 'Cape d\'Ombre-Lune',  icon: '🧥', shares: { pvMax: 0.4, dodge: 0.3, critDmg: 0.3 } },
        { id: 'lune_bottes',  slot: 'bottes', name: 'Pas d\'Ombre-Lune',   icon: '🥾', shares: { vitesse: 0.6, dodge: 0.4 } },
      ],
      bonuses: {
        2: { pct: 3, mix: { crit: 1 } },
        3: { pct: 3, mix: { critDmg: 0.6, vitesse: 0.4 } },
        4: { pct: 5, mix: { dmg_ombre: 0.5, forcePct: 0.5 }, effect: 'lune_ombre' },
      },
    },
    orage_givre: {
      name: 'Orage-Givre', rarity: 'legendaire', minRank: 'B', color: '#58d4ff', classes: ['Elementaliste', 'Mage'],
      pieces: [
        { id: 'orage_sceptre', slot: 'arme',   name: 'Sceptre Orage-Givre', icon: '🔮', classes: ['Elementaliste', 'Mage'], shares: { intelligence: 0.5, dmg_foudre: 0.25, dmg_glace: 0.25 } },
        { id: 'orage_couronne', slot: 'casque', name: 'Couronne Orage-Givre', icon: '👑', shares: { intelligence: 0.4, cdr: 0.3, manaMax: 0.3 } },
        { id: 'orage_manteau', slot: 'armure', name: 'Manteau Orage-Givre', icon: '🧥', shares: { pvMax: 0.4, intelligence: 0.3, dmg_glace: 0.3 } },
        { id: 'orage_bottes',  slot: 'bottes', name: 'Bottes Orage-Givre',  icon: '🥾', shares: { vitesse: 0.4, dmg_foudre: 0.3, cdr: 0.3 } },
      ],
      bonuses: {
        2: { pct: 3, mix: { dmg_foudre: 0.5, dmg_glace: 0.5 } },
        3: { pct: 3, mix: { cdr: 0.6, manaRegen: 0.4 } },
        4: { pct: 5, mix: { intelligencePct: 1 }, effect: 'tempete' },
      },
    },
    cortege_funebre: {
      name: 'Cortège Funèbre', rarity: 'legendaire', minRank: 'B', color: '#7a5cff', classes: ['Necromancien'],
      pieces: [
        { id: 'cortege_faux',   slot: 'arme',   name: 'Faux du Cortège',      icon: '🪓', classes: ['Necromancien'], shares: { minionDmg: 0.6, intelligence: 0.2, minionPv: 0.2 } },
        { id: 'cortege_capuchon', slot: 'casque', name: 'Capuchon du Cortège', icon: '🥷', shares: { minionPv: 0.4, intelligence: 0.3, manaMax: 0.3 } },
        { id: 'cortege_linceul', slot: 'armure', name: 'Linceul du Cortège',   icon: '👘', shares: { pvMax: 0.4, minionPv: 0.3, minionDmg: 0.3 } },
        { id: 'cortege_sandales', slot: 'bottes', name: 'Sandales du Cortège', icon: '🥾', shares: { vitesse: 0.3, minionPv: 0.4, pvMax: 0.3 } },
      ],
      bonuses: {
        2: { pct: 3, mix: { minionDmg: 1 } },
        3: { pct: 3, mix: { minionPv: 1 } },
        4: { stats: { minionCap: 1, minionDmg: 0.04, minionPv: 0.04 } },
      },
    },
    gardien_aube: {
      name: 'Gardien d\'Aube', rarity: 'epique', minRank: 'D', color: '#ffe27a', classes: ['Paladin', 'Guerrier'],
      pieces: [
        { id: 'gardien_casque', slot: 'casque', name: 'Casque du Gardien d\'Aube', icon: '⛑️', shares: { defense: 0.5, pvMax: 0.5 } },
        { id: 'gardien_armure', slot: 'armure', name: 'Armure du Gardien d\'Aube', icon: '🛡️', shares: { pvMax: 0.5, defense: 0.3, dmg_sacre: 0.2 } },
        { id: 'gardien_anneau', slot: 'anneau', name: 'Sceau du Gardien d\'Aube',  icon: '💍', shares: { force: 0.4, lifesteal: 0.3, dmg_sacre: 0.3 } },
      ],
      bonuses: {
        2: { pct: 3, mix: { defense: 0.5, dmg_sacre: 0.5 } },
        3: { pct: 3, mix: { lifesteal: 0.5, pvMaxPct: 0.5 }, effect: 'aube_set' },
      },
    },
    sentinelle_cimes: {
      name: 'Sentinelle des Cimes', rarity: 'epique', minRank: 'D', color: '#7ee08a', classes: ['Archer'],
      pieces: [
        { id: 'sentinelle_arc',   slot: 'arme',   name: 'Arc de la Sentinelle',   icon: '🏹', classes: ['Archer'], shares: { force: 0.6, crit: 0.25, vitesse: 0.15 } },
        { id: 'sentinelle_capuche', slot: 'casque', name: 'Capuche de la Sentinelle', icon: '🧢', shares: { crit: 0.5, pvMax: 0.5 } },
        { id: 'sentinelle_bottes', slot: 'bottes', name: 'Bottes de la Sentinelle', icon: '🥾', shares: { vitesse: 0.5, dodge: 0.3, pvMax: 0.2 } },
      ],
      bonuses: {
        2: { pct: 3, mix: { crit: 1 } },
        3: { pct: 3, mix: { critDmg: 0.5, forcePct: 0.5 }, effect: 'sentinelle' },
      },
    },
  };
  Object.keys(SETS).forEach((sid) => {
    SETS[sid].id = sid;
    SETS[sid].pieces.forEach((p) => {
      bases[p.id] = { id: p.id, slot: p.slot, tier: 2, name: p.name, icon: p.icon, classes: p.classes || null, baseStats: p.shares,
        rankReq: SETS[sid].minRank, set: sid, rarity: SETS[sid].rarity };
    });
  });

  // ------------------------------------------------------------------
  // MATÉRIAUX
  //   kind : 'craft' (fabrication/amélioration) | 'essence' | 'special' (ressources de donjon, vendables) | 'rare'
  // ------------------------------------------------------------------
  const MATERIALS = {
    fragment:       { id: 'fragment',       name: 'Fragment d\'équipement', icon: '🔩', kind: 'craft', rarity: 'commun', desc: 'Éclats de métal et de cuir. Servent à améliorer et fabriquer.' },
    poussiere_rune: { id: 'poussiere_rune', name: 'Poussière runique',      icon: '✨', kind: 'craft', rarity: 'rare',   desc: 'Reste de magie des objets rares. Améliorations +4 et plus.' },
    coeur_boss:     { id: 'coeur_boss',     name: 'Cœur de boss',           icon: '🫀', kind: 'craft', rarity: 'epique', desc: 'Cœur encore tiède d\'un seigneur de donjon. Améliorations +8 et plus.' },
    essence_feu:    { id: 'essence_feu',    name: 'Essence de feu',         icon: '🔥', kind: 'essence', element: 'feu',    rarity: 'rare', desc: 'Essence élémentaire de feu.' },
    essence_glace:  { id: 'essence_glace',  name: 'Essence de glace',       icon: '❄️', kind: 'essence', element: 'glace',  rarity: 'rare', desc: 'Essence élémentaire de glace.' },
    essence_foudre: { id: 'essence_foudre', name: 'Essence de foudre',      icon: '⚡', kind: 'essence', element: 'foudre', rarity: 'rare', desc: 'Essence élémentaire de foudre.' },
    essence_ombre:  { id: 'essence_ombre',  name: 'Essence d\'ombre',       icon: '🌑', kind: 'essence', element: 'ombre',  rarity: 'rare', desc: 'Essence élémentaire d\'ombre.' },
    essence_sacre:  { id: 'essence_sacre',  name: 'Essence sacrée',         icon: '☀️', kind: 'essence', element: 'sacre',  rarity: 'rare', desc: 'Essence élémentaire sacrée.' },
    essence_poison: { id: 'essence_poison', name: 'Essence de poison',      icon: '☠️', kind: 'essence', element: 'poison', rarity: 'rare', desc: 'Essence élémentaire de poison.' },
    cristal_eveil:  { id: 'cristal_eveil',  name: 'Cristal d\'éveil',       icon: '🔮', kind: 'rare', rarity: 'secret', desc: 'Extrêmement rare (0,5 % sur les boss de rang B et plus). Offre une tentative supplémentaire au Rituel d\'éveil.' },
    // ressources de récompense de donjon (G.DUNGEONS rewards.guaranteed) — vendables
    materiau_commun:    { id: 'materiau_commun',    name: 'Matériau commun',        icon: '🪨', kind: 'special', rarity: 'commun', sell: 15, convert: { fragment: 3 }, desc: 'Se convertit en fragments.' },
    materiau_rare:      { id: 'materiau_rare',      name: 'Matériau rare',          icon: '💎', kind: 'special', rarity: 'rare', sell: 60, convert: { fragment: 6, poussiere_rune: 1 }, desc: 'Se convertit en fragments et poussière.' },
    materiau_forge_rare:{ id: 'materiau_forge_rare',name: 'Métal de forge rare',    icon: '⚙️', kind: 'special', rarity: 'rare', sell: 90, convert: { fragment: 8, poussiere_rune: 2 }, desc: 'Se convertit en fragments et poussière.' },
    materiau_poison:    { id: 'materiau_poison',    name: 'Glande venimeuse',       icon: '🧪', kind: 'special', rarity: 'rare', sell: 50, convert: { essence_poison: 1 }, desc: 'Se convertit en essence de poison.' },
    materiau_dore:      { id: 'materiau_dore',      name: 'Pépite dorée',           icon: '🥇', kind: 'special', rarity: 'epique', sell: 400, desc: 'Vaut une petite fortune.' },
    lanterne_eteinte:   { id: 'lanterne_eteinte',   name: 'Lanterne éteinte',       icon: '🏮', kind: 'special', rarity: 'rare', sell: 80, desc: 'Une relique curieuse.' },
    sceau_arcanique:    { id: 'sceau_arcanique',    name: 'Sceau arcanique',        icon: '🔯', kind: 'special', rarity: 'epique', sell: 220, convert: { poussiere_rune: 4 }, desc: 'Se convertit en poussière runique.' },
    jeton_arene:        { id: 'jeton_arene',        name: 'Jeton d\'arène',         icon: '🪙', kind: 'special', rarity: 'rare', sell: 120, desc: 'Preuve de victoire en arène.' },
    grimoire_fragment:  { id: 'grimoire_fragment',  name: 'Fragment de grimoire',   icon: '📜', kind: 'special', rarity: 'epique', sell: 260, desc: 'Page arrachée à un grimoire interdit.' },
    fragment_eclipse:   { id: 'fragment_eclipse',   name: 'Fragment d\'éclipse',    icon: '🌘', kind: 'special', rarity: 'legendaire', sell: 700, convert: { coeur_boss: 1, poussiere_rune: 4 }, desc: 'Se convertit en cœur de boss et poussière.' },
    cristal_eteint:     { id: 'cristal_eteint',     name: 'Cristal éteint',         icon: '🔹', kind: 'special', rarity: 'legendaire', sell: 900, desc: 'Cristal vidé de sa lumière.' },
    eclat_celeste:      { id: 'eclat_celeste',      name: 'Éclat céleste',          icon: '🌟', kind: 'special', rarity: 'epique', sell: 300, desc: 'Éclat tombé du ciel.' },
    eclat_faille:       { id: 'eclat_faille',       name: 'Éclat de la Faille',     icon: '🔸', kind: 'special', rarity: 'legendaire', sell: 800, desc: 'Éclat arraché à la Faille.' },
    eclat_neant:        { id: 'eclat_neant',        name: 'Éclat du Néant',         icon: '🕳️', kind: 'special', rarity: 'mythique', sell: 2500, desc: 'Un fragment de vide pur.' },
    perle_abyssale:     { id: 'perle_abyssale',     name: 'Perle abyssale',         icon: '🫧', kind: 'special', rarity: 'epique', sell: 320, desc: 'Perle des profondeurs.' },
    sable_temporel:     { id: 'sable_temporel',     name: 'Sable temporel',         icon: '⏳', kind: 'special', rarity: 'epique', sell: 350, desc: 'Le temps s\'y écoule autrement.' },
    sceau_souverain:    { id: 'sceau_souverain',    name: 'Sceau souverain',        icon: '👑', kind: 'special', rarity: 'mythique', sell: 3000, desc: 'Un sceau de pouvoir absolu.' },
    cle_faille:         { id: 'cle_faille',         name: 'Clé de la Faille',       icon: '🗝️', kind: 'special', rarity: 'legendaire', sell: 0, noSell: true, desc: 'Ouvre une chambre secrète réservée aux chasseurs de rang S.' },
  };

  // ------------------------------------------------------------------
  // RECETTES — kind : 'item' (fabrique un objet de rareté fixée, emplacement au choix) | 'potion' | 'reforge'
  //   mats : matériaux ; anyEssence : nombre d'essences (n'importe quel élément) ; rankMin : rang minimal
  // ------------------------------------------------------------------
  const RECIPES = {
    craft_rare:       { id: 'craft_rare',       name: 'Forger un objet rare',       icon: '🔨', kind: 'item', rarity: 'rare',       gold: 150,  mats: { fragment: 12 }, rankMin: 'E', desc: 'Un objet rare de l\'emplacement choisi (affixes aléatoires).' },
    craft_epique:     { id: 'craft_epique',     name: 'Forger un objet épique',     icon: '⚒️', kind: 'item', rarity: 'epique',     gold: 700,  mats: { fragment: 30, poussiere_rune: 5 }, rankMin: 'D', desc: 'Un objet épique de l\'emplacement choisi.' },
    craft_legendaire: { id: 'craft_legendaire', name: 'Forger un objet légendaire', icon: '🌟', kind: 'item', rarity: 'legendaire', gold: 4500, mats: { fragment: 60, poussiere_rune: 12, coeur_boss: 3 }, anyEssence: 3, rankMin: 'B', desc: 'Un objet légendaire de l\'emplacement choisi (peut être un objet nommé).' },
    brew_soin:        { id: 'brew_soin',        name: 'Distiller 3 potions de soin', icon: '❤️', kind: 'potion', potion: 'Potion de soin', count: 3, gold: 30, mats: { fragment: 2, essence_sacre: 1 }, desc: 'Trois potions de soin.' },
    brew_mana:        { id: 'brew_mana',        name: 'Distiller 3 potions de mana', icon: '💧', kind: 'potion', potion: 'Potion de mana', count: 3, gold: 40, mats: { fragment: 2, essence_glace: 1 }, desc: 'Trois potions de mana.' },
    reforge:          { id: 'reforge',          name: 'Reforger un objet',          icon: '🔁', kind: 'reforge', gold: 0, mats: {}, desc: 'Retire les affixes d\'un objet et en tire de nouveaux (même rareté). Coût selon la rareté.' },
  };

  // ------------------------------------------------------------------
  // AMÉLIORATION +1..+10 (aucun risque d'échec) ; formules utilisées par G.Inventory
  //   or(next, item)  : or pour passer à +next
  //   mats(next, item): matériaux
  // ------------------------------------------------------------------
  const UPGRADE = {
    max: 10,
    statPerLevel: 0.03, // +3 % de stats par palier
    gold(next, level, rarityIdx) {
      const rc = RARITIES[rarityIdx] ? RARITIES[rarityIdx].upCost : 1;
      const lv = 0.6 + 0.8 * Math.min(30, Math.max(1, level)) / 30;
      return Math.round(60 * Math.pow(next, 1.8) * rc * lv / 10) * 10;
    },
    mats(next, rarityIdx) {
      const m = { fragment: Math.ceil((3 + 2 * next) * (0.6 + 0.2 * rarityIdx)) };
      if (next >= 4) m.poussiere_rune = next - 3;      // +4 → 1 … +10 → 7
      if (next >= 8) m.coeur_boss = next - 7;          // +8 → 1 … +10 → 3
      return m;
    },
  };

  G.ITEMS = {
    rankOrder: RANK_ORDER,
    slots: SLOTS,
    rarities: RARITIES,
    rarityWeights: RARITY_WEIGHTS,
    stats: STATS,
    affixes: AFFIXES,
    bases,
    uniques: UNIQUES.map((u) => u[0]),
    effects: EFFECTS,
    sets: SETS,
    materials: MATERIALS,
    recipes: RECIPES,
    upgrade: UPGRADE,
    classes: ['Guerrier', 'Mage', 'Voleur', 'Assassin', 'Archer', 'Paladin', 'Elementaliste', 'Necromancien'],
    balance: {
      refs: Object.keys(STATS).reduce((o, k) => { if (STATS[k].ref) o[k] = STATS[k].ref; return o; }, {}),
      baseShare: 0.55,          // part du budget pour les stats de base ; le reste = affixes
      levelFloor: 0.25,         // facteur de niveau à niveau 1
      levelCap: 30,
      jitter: [0.8, 1.2],       // variation aléatoire des valeurs d'affixes
      percentUnits: false,      // true si G.Stats exprime crit/critDmg/cdr/... en pourcents entiers (5 = 5 %)
      drops: {                  // probabilités de butin (par ennemi vaincu)
        normal: { item: 0.035, fragment: 0.14, essence: 0.015 },
        elite:  { item: 0.22,  fragment: 0.8,  essence: 0.25 },
        miniboss: { items: 1, extraChance: 0.25, essence: 0.6 },
        boss:   { items: 1, extraChance: 0.5, legendBoost: 2.0, mythBoost: 2.0, essence: 1.0, cristal: 0.005, cristalMinRank: 'B' },
        setChance: 0.18,        // chance qu'un objet épique/légendaire soit une pièce d'ensemble
        uniqueChance: 0.55,     // chance qu'un légendaire soit un objet nommé (si le pool le permet)
      },
    },
  };
})();
