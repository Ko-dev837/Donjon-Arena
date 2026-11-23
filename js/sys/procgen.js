window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v3 — js/sys/procgen.js (rôle 15) → G.Procgen, G.ProcgenMeta
   1. Génération procédurale DÉTERMINISTE d'un donjon (mulberry32 local) :
        G.Procgen.generate(template, {rank, seed, modifiers, constraints, portal}) -> dungeon
   2. Cycle de vie d'un run (bus runStart / runEnd) : modificateurs, mécaniques de donjon,
      contraintes d'épreuve (chrono, sans potions, sans roulade...), bonus temporaires (RunBuffs).
   3. Utilitaires partagés avec events.js : G.Procgen.util (or / XP / objets, champs de rendu, zones de danger).
   v5 (agent 5) : layouts PROPRES à chaque architecture (rd.layout = rd.variant), pièges propres au donjon
      (rd.data.traps / salle 'trap' : data.kind = id de piège du donjon), secrets (data.secret.data.reveal :
      mur / levier / symbole, mini-boss caché, créature secrète, récompenses exclusives), événements rares
      propres (event kind 'donjon'), caches (data.cache), spécimens rares dans les vagues.
   Tout est défensif : les systèmes absents sont ignorés.
   ===================================================================== */
(() => {
  'use strict';

  const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
  const ri = (r) => Math.max(0, RANKS.indexOf(r));
  const LAYOUTS = ['arena', 'pillars', 'cross'];
  // layouts par architecture (copie de js/gfx/dungeon-themes.js pour rester déterministe sans rendu)
  const THEME_LAYOUTS = {
    mine_abandonnee: ['galerie', 'carrefour', 'puits', 'eboulis'],
    foret_interdite: ['clairiere', 'sentier', 'racines', 'marecage'],
    catacombes_oubliees: ['couloirs', 'ossuaire', 'sarcophages', 'fosse'],
    chateau_maudit: ['grand_hall', 'salle_bal', 'galerie', 'banquet'],
    cathedrale_noyee: ['nef', 'transept', 'abside', 'crypte_inondee'],
    temple_sanglant: ['autel', 'canaux', 'colonnade', 'escaliers'],
    abime_infernal: ['ponts', 'ile', 'faille', 'chaines'],
    asile_failles: ['couloir', 'dortoir', 'bloc_operatoire', 'cellules'],
    bibliotheque_engloutie: ['rayonnages', 'allees_l', 'rotonde', 'mezzanine'],
    necropole_glace: ['mausolees', 'crevasses', 'steles', 'cloitre'],
    jardin_chair: ['labyrinthe', 'serre', 'croix', 'bassin'],
    observatoire_neant: ['anneaux', 'astrolabe', 'plateformes', 'telescope'],
    foire_pantins: ['chapiteau', 'manege', 'stands', 'allee'],
    arene_epreuves: ['cercle', 'piliers', 'juges'],
  };
  function themeLayouts(theme) {
    if (THEME_LAYOUTS[theme]) return THEME_LAYOUTS[theme];
    try { if (G.DungeonThemes && G.DungeonThemes.has(theme)) { const l = G.DungeonThemes.layouts(theme); if (l && l.length) return l; } } catch (e) { /* rien */ }
    return LAYOUTS;
  }
  const HALF = 14;

  // ------------------------------------------------------------------
  //  PRNG déterministe
  // ------------------------------------------------------------------
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function makeRng(seed) {
    const f = mulberry32(seed);
    const R = {
      float: f,
      int: (a, b) => a + Math.floor(f() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(f() * arr.length)],
      chance: (p) => f() < p,
      weighted(list, key = 'w') {
        let tot = 0; for (const x of list) tot += Math.max(0, x[key] || 0);
        if (tot <= 0) return list[0];
        let r = f() * tot;
        for (const x of list) { r -= Math.max(0, x[key] || 0); if (r < 0) return x; }
        return list[list.length - 1];
      },
      shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    };
    return R;
  }

  // ------------------------------------------------------------------
  //  MÉTA (descriptions FR pour l'UI des portails)
  // ------------------------------------------------------------------
  // fx : agrégé dans `agg` pendant le run (voir recompute()).
  const MODIFIERS = {
    enrage:       { id: 'enrage', name: 'Enragé', icon: '😡', positive: false, minRank: 'D', weight: 10, excl: ['horde_mod'], desc: 'Les ennemis infligent +30 % de dégâts.', fx: { enemyDmg: 1.3 }, reward: 1.1 },
    fortifie:     { id: 'fortifie', name: 'Fortifié', icon: '🛡️', positive: false, minRank: 'C', weight: 9, excl: ['horde_mod'], desc: 'Les ennemis ont +40 % de PV.', fx: { enemyPv: 1.4 }, reward: 1.1 },
    vif:          { id: 'vif', name: 'Vif', icon: '💨', positive: false, minRank: 'C', weight: 7, excl: [], desc: 'Les ennemis se déplacent 20 % plus vite.', fx: { enemySpeed: 1.2 }, reward: 1.08 },
    chasse_tresor:{ id: 'chasse_tresor', name: 'Chasse au trésor', icon: '💰', positive: true, minRank: 'E', weight: 9, excl: [], desc: 'Plus de coffres et de salles au trésor.', fx: { lootDup: 0.15 }, gen: { extraTreasure: 1, extraChest: 1 } },
    crepuscule:   { id: 'crepuscule', name: 'Crépuscule', icon: '🌆', positive: false, minRank: 'E', weight: 8, excl: [], desc: 'La vision est réduite.', fx: { vision: 0.65 }, reward: 1.08 },
    horde_mod:    { id: 'horde_mod', name: 'Horde', icon: '👥', positive: false, minRank: 'D', weight: 8, excl: ['enrage', 'fortifie', 'elites_masse'], desc: 'Beaucoup plus d\'ennemis, mais plus fragiles (-30 % PV, -20 % dégâts).', fx: { enemyPv: 0.7, enemyDmg: 0.8 }, gen: { countMult: 1.7 }, reward: 1.1 },
    elites_masse: { id: 'elites_masse', name: 'Élites en masse', icon: '👑', positive: false, minRank: 'C', weight: 7, excl: ['horde_mod'], desc: 'Beaucoup plus d\'élites, butin amélioré.', fx: { lootDup: 0.2 }, gen: { eliteMult: 2.5 }, reward: 1.15 },
    malediction:  { id: 'malediction', name: 'Malédiction de sang', icon: '🩸', positive: false, minRank: 'B', weight: 6, excl: ['benediction'], desc: 'Aucune régénération ni vol de vie ; les soins sont réduits de moitié.', fx: { noRegen: true, healMult: 0.5 }, reward: 1.15 },
    benediction:  { id: 'benediction', name: 'Bénédiction', icon: '✨', positive: true, minRank: 'E', weight: 9, excl: ['malediction'], desc: '+25 % d\'XP et +15 % d\'or.', fx: { xp: 1.25, gold: 1.15 } },
    pillage:      { id: 'pillage', name: 'Pillage', icon: '🪙', positive: true, minRank: 'E', weight: 6, excl: [], desc: 'Les ennemis lâchent plus de butin.', fx: { lootDup: 0.25 } },
    fragile:      { id: 'fragile', name: 'Fragile', icon: '💔', positive: false, minRank: 'D', weight: 6, excl: [], desc: 'Vous subissez +20 % de dégâts.', fx: { dmgTaken: 1.2 }, reward: 1.1 },
    affute:       { id: 'affute', name: 'Armes affûtées', icon: '🗡️', positive: true, minRank: 'E', weight: 6, excl: [], desc: 'Vous infligez +12 % de dégâts.', fx: { dmgDealt: 1.12 } },
    mana_vive:    { id: 'mana_vive', name: 'Mana vive', icon: '💧', positive: true, minRank: 'D', weight: 5, excl: ['silence'], desc: 'Régénération de mana +40 %.', fx: { manaRegen: 1.4 } },
  };
  const MECHANICS = {
    tenebres: { name: 'Ténèbres', icon: '🌑', desc: 'Vision très réduite autour du héros.' },
    sol_gele: { name: 'Sol gelé', icon: '🧊', desc: 'Le sol glisse : vous continuez à glisser quand vous lâchez le joystick.' },
    pieges_pics: { name: 'Pièges à pics', icon: '🔻', desc: 'Des dalles à pics sortent du sol (elles clignotent avant de frapper).' },
    lave_montante: { name: 'Lave montante', icon: '🌋', desc: 'La lave gagne du terrain depuis les bords de la salle.' },
    chrono: { name: 'Contre-la-montre', icon: '⏱️', desc: 'Temps limité pour terminer le donjon.' },
    pas_de_potions: { name: 'Sans potions', icon: '🚫', desc: 'Les potions sont interdites.' },
    pas_de_roulade: { name: 'Sans roulade', icon: '⛔', desc: 'La roulade est désactivée.' },
    vagues_infinies: { name: 'Vagues infinies', icon: '♾️', desc: 'Les vagues s\'enchaînent, de plus en plus nombreuses.' },
    eclipse: { name: 'Éclipse', icon: '🌘', desc: 'Nuit permanente : ennemis +25 % PV/dégâts, butin amélioré.' },
    brouillard: { name: 'Brouillard', icon: '🌫️', desc: 'Brouillard épais, portée de vue courte.' },
    pluie_de_meteores: { name: 'Pluie de météores', icon: '☄️', desc: 'Des météores s\'abattent, annoncés par un cercle rouge.' },
    sanctuaires: { name: 'Sanctuaires', icon: '⛩️', desc: 'Davantage de sanctuaires de bénédiction.' },
    mimiques: { name: 'Mimiques', icon: '📦', desc: 'Certains coffres sont des mimiques.' },
    poison_ambiant: { name: 'Gaz toxique', icon: '☣️', desc: 'Nuages de poison persistants au sol.' },
    foudre_statique: { name: 'Foudre statique', icon: '⚡', desc: 'Des éclairs frappent près de vous après un avertissement.' },
    maree: { name: 'Marée', icon: '🌊', desc: 'Inondations périodiques : ralentissement et poussée.' },
    silence_arcane: { name: 'Silence arcanique', icon: '🔇', desc: 'Les sorts coûtent +50 % de mana.' },
    boss_rush: { name: 'Boss rush', icon: '💀', desc: 'Que des combats de boss et de mini-boss.' },
    horde: { name: 'Horde', icon: '👥', desc: 'Effectifs doublés, ennemis plus fragiles (-30 % PV).' },
    gravite_faible: { name: 'Gravité faible', icon: '🪶', desc: 'Les projections sont amplifiées.' },
    miroir_ombre: { name: 'Ombre miroir', icon: '👤', desc: 'Une ombre répète vos coups avec un délai.' },
    une_vie: { name: 'Une seule vie', icon: '❤️‍🔥', desc: 'Aucune résurrection, soins de salle désactivés.' },
    ennemis_dores: { name: 'Spécimens dorés', icon: '🌟', desc: 'Des monstres dorés apparaissent (butin riche).' },
    regeneration_ennemie: { name: 'Régénération ennemie', icon: '♻️', desc: 'Les ennemis se soignent s\'ils ne sont pas touchés.' },
    gardien_sceaux: { name: 'Gardiens des sceaux', icon: '🔮', desc: 'Purifier des sceaux pour ouvrir la salle du boss.' },
  };
  const AFFIXES = {
    rapide: { name: 'Rapide', icon: '💨', desc: '+35 % vitesse' },
    blinde: { name: 'Blindé', icon: '🛡️', desc: '+50 % PV' },
    regenerant: { name: 'Régénérant', icon: '♻️', desc: 'Se soigne lentement' },
    explosif: { name: 'Explosif', icon: '💥', desc: 'Explose à sa mort' },
    enrage: { name: 'Enragé', icon: '😡', desc: '+30 % dégâts' },
    vampirique: { name: 'Vampirique', icon: '🧛', desc: 'Se soigne en frappant' },
  };
  const BLESSINGS = {
    vigueur: { id: 'vigueur', name: 'Sanctuaire de Vigueur', icon: '💚', desc: (m) => '+' + Math.round((m - 1) * 100) + ' % PV max et soin de 30 %', fx: (k) => ({ pvMax: 1 + 0.15 * k }), heal: 0.3 },
    lame: { id: 'lame', name: 'Sanctuaire de la Lame', icon: '⚔️', desc: (m) => '+' + Math.round((m - 1) * 100) + ' % de dégâts', fx: (k) => ({ dmgDealt: 1 + 0.15 * k }) },
    celerite: { id: 'celerite', name: 'Sanctuaire de Célérité', icon: '💨', desc: () => '+12 % vitesse, -10 % recharges', fx: (k) => ({ speed: 1 + 0.1 * k, cdr: 0.1 * k }) },
    savoir: { id: 'savoir', name: 'Sanctuaire du Savoir', icon: '📘', desc: (m) => '+' + Math.round((m - 1) * 100) + ' % XP', fx: (k) => ({ xp: 1 + 0.25 * k }) },
    egide: { id: 'egide', name: 'Sanctuaire de l\'Égide', icon: '🛡️', desc: () => '-18 % de dégâts subis', fx: (k) => ({ dmgTaken: 1 - 0.15 * k }) },
    fortune: { id: 'fortune', name: 'Sanctuaire de Fortune', icon: '🍀', desc: () => 'Butin et or accrus', fx: (k) => ({ gold: 1 + 0.25 * k, lootDup: 0.1 * k }) },
  };
  // Événements : w = poids ; rare = 1-3 % ; minRank
  const EVENT_KINDS = {
    merchant: { w: 20, name: 'Marchand errant', icon: '🧙', minRank: 'E' },
    pact: { w: 14, name: 'Autel du pacte', icon: '🩸', minRank: 'D' },
    fountain: { w: 16, name: 'Fontaine', icon: '⛲', minRank: 'E' },
    timed: { w: 14, name: 'Défi chronométré', icon: '⏳', minRank: 'E' },
    ambush: { w: 14, name: 'Embuscade', icon: '🗡️', minRank: 'E' },
    riddle: { w: 10, name: 'Statue énigmatique', icon: '🗿', minRank: 'E' },
    ghost: { w: 10, name: 'Fantôme à protéger', icon: '👻', minRank: 'D' },
    donjon: { w: 0, name: 'Événement du donjon', icon: '❗', minRank: 'E' },
    goldrain: { w: 1.5, name: 'Pluie d\'or', icon: '🌧️', minRank: 'E', rare: true },
    spring: { w: 1.0, name: 'Source primordiale', icon: '🌟', minRank: 'E', rare: true },
  };
  const ROOM_TYPES = {
    combat: { name: 'Combat', icon: '⚔️' }, elite: { name: 'Élite', icon: '👑' }, miniboss: { name: 'Mini-boss', icon: '💀' },
    boss: { name: 'Boss', icon: '☠️' }, chest: { name: 'Coffre piégé', icon: '📦' }, treasure: { name: 'Trésor', icon: '💰' },
    trap: { name: 'Salle piégée', icon: '🔻' }, event: { name: 'Événement', icon: '❓' }, shrine: { name: 'Sanctuaire', icon: '⛩️' },
    choice: { name: 'Bifurcation', icon: '🔀' }, secret: { name: 'Salle secrète', icon: '🗝️' },
  };
  const SECRET_HINTS = [
    'Un courant d\'air froid filtre d\'un pan de mur…',
    'Une dalle sonne creux près du mur nord…',
    'Un symbole presque effacé luit faiblement…',
    'Vous entendez un grondement sourd derrière la pierre…',
  ];

  const Meta = {
    ranks: RANKS, modifiersById: MODIFIERS,
    modifiers: Object.keys(MODIFIERS).map((k) => { const m = MODIFIERS[k]; return { id: m.id, name: m.name, icon: m.icon, desc: m.desc, positive: !!m.positive, weight: m.weight, rankMin: m.minRank }; }), mechanics: MECHANICS, affixes: AFFIXES, blessings: BLESSINGS,
    eventKinds: EVENT_KINDS, roomTypes: ROOM_TYPES, layouts: LAYOUTS, themeLayouts: THEME_LAYOUTS,
    modifierList() { return Object.keys(MODIFIERS).map((k) => MODIFIERS[k]); },
    describeModifier(id) { const m = MODIFIERS[id]; return m ? { id: m.id, name: m.name, icon: m.icon, desc: m.desc, positive: m.positive } : null; },
    describeMechanic(id) {
      const m = MECHANICS[id]; if (m) return { id, name: m.name, icon: m.icon, desc: m.desc };
      const d = G.DungeonsMeta && G.DungeonsMeta.mechanics && G.DungeonsMeta.mechanics[id];
      return d ? { id, name: d.name, icon: '❔', desc: d.desc } : null;
    },
  };
  G.ProcgenMeta = Meta;

  // ------------------------------------------------------------------
  //  GÉNÉRATION
  // ------------------------------------------------------------------
  function resolveModifier(m) {
    const id = typeof m === 'string' ? m : (m && m.id);
    const d = MODIFIERS[id];
    return d || null;
  }
  function publicModifier(d) { return { id: d.id, name: d.name, icon: d.icon, desc: d.desc, positive: !!d.positive }; }

  function rollModifiers(rng, r, template) {
    if (template.type === 'epreuve') return [];
    const tbl = [[0.65, 0.35, 0, 0], [0.5, 0.45, 0.05, 0], [0.35, 0.5, 0.15, 0], [0.25, 0.5, 0.25, 0], [0.15, 0.45, 0.35, 0.05], [0.1, 0.4, 0.4, 0.1], [0.05, 0.35, 0.45, 0.15]][Math.min(6, r)];
    let x = rng.float(), n = 0;
    for (let i = 0; i < tbl.length; i++) { x -= tbl[i]; if (x < 0) { n = i; break; } n = i; }
    const out = [];
    const taken = {};
    for (let k = 0; k < n; k++) {
      const pool = Object.keys(MODIFIERS).map((i) => MODIFIERS[i]).filter((m) => ri(m.minRank) <= r && !taken[m.id] && !out.some((o) => (o.excl || []).includes(m.id) || (m.excl || []).includes(o.id)));
      if (!pool.length) break;
      const pick = rng.weighted(pool, 'weight');
      out.push(pick); taken[pick.id] = true;
    }
    return out;
  }

  function pickAffixes(rng, r) {
    const n = r >= 6 ? 3 : r >= 4 ? 2 : r >= 2 ? 1 : 0;
    return rng.shuffle(Object.keys(AFFIXES)).slice(0, n);
  }

  function monsterPools(T) {
    let monsters = (T.monsters || []).slice();
    let elites = (T.elites || []).slice();
    if (!monsters.length && G.DATA && G.DATA.ENEMIES) monsters = Object.keys(G.DATA.ENEMIES).filter((k) => !G.DATA.ENEMIES[k].elite).slice(0, 4);
    if (!monsters.length) monsters = ['squelette', 'slime'];
    let rares = (T.rares || []).slice(), danger = [];
    // v5 : population exclusive du donjon (agent 7, G.Monsters.population) — ordre déterministe
    try {
      if (G.Monsters && G.Monsters.population && T.type !== 'epreuve') {
        const pop = G.Monsters.population(T.id) || {};
        const has = (id) => !!(G.MONSTERS && G.MONSTERS[id]);
        const uni = (a, b) => { const o = a.slice(); (b || []).forEach((x) => { if (has(x) && o.indexOf(x) < 0) o.push(x); }); return o; };
        if ((pop.classique || []).length) monsters = uni(monsters.filter(has).length ? monsters.filter(has) : [], pop.classique);
        if ((pop.elite || []).length) elites = uni(elites.filter(has), pop.elite);
        if ((pop.rare || []).length) rares = uni(rares.filter(has), pop.rare);
        danger = (pop.dangereux || []).filter(has);
      }
    } catch (e) { /* population indisponible */ }
    return { monsters, elites, rares, danger };
  }

  /** Vagues : [[{type,count,elite?,affixes?}]] */
  function genWaves(rng, T, pools, o) {
    const r = o.r, g = o.gen, prog = o.progress;
    let nWaves = o.kind === 'entry' ? 1 : 1 + (prog > 0.35 ? 1 : 0) + (r >= 3 && rng.chance(0.5) ? 1 : 0);
    if (o.kind === 'elite') nWaves = Math.max(2, nWaves);
    nWaves = Math.min(3, nWaves);
    if (g.infinite) nWaves = Math.min(9, nWaves * 3 + r);
    const kindsN = Math.min(pools.monsters.length, rng.int(2, 3));
    const pack = rng.shuffle(pools.monsters).slice(0, Math.max(1, kindsN));
    const waves = [];
    for (let w = 0; w < nWaves; w++) {
      let units = 3 + Math.round(prog * 3) + r * 0.8 + w * 0.8 + (g.infinite ? w * 0.9 : 0);
      if (o.kind === 'entry') units = Math.max(2, units - 2);
      units = Math.max(2, Math.round(units * (g.countMult || 1) * (1 + 0.1 * r * 0)));
      const entries = [];
      let left = units;
      pack.forEach((t, i) => {
        const c = i === pack.length - 1 ? left : Math.max(1, Math.round(left * (0.4 + rng.float() * 0.3)));
        if (c > 0) entries.push({ type: t, count: Math.min(c, left) });
        left -= Math.min(c, left);
      });
      if (left > 0 && entries.length) entries[0].count += left;
      waves.push(entries);
    }
    // élites
    let eliteN = 0;
    if (o.kind === 'elite') eliteN = 1 + Math.floor(r / 3);
    else if (o.kind === 'combat' && prog > 0.4 && rng.chance(Math.min(0.9, 0.1 + 0.06 * r))) eliteN = 1;
    if (o.kind === 'elite+') eliteN = 2 + Math.floor(r / 3);
    eliteN = Math.round(eliteN * (g.eliteMult || 1));
    if (g.eliteMult > 1 && o.kind === 'combat' && eliteN === 0 && rng.chance(0.5)) eliteN = 1;
    if (eliteN > 0) {
      const last = waves[waves.length - 1];
      const ids = pools.elites.length ? pools.elites : [rng.pick(pools.monsters)];
      const hasElPool = pools.elites.length > 0;
      for (let k = 0; k < Math.min(eliteN, 6); k++) {
        const t = ids[k % ids.length];
        const ex = last.find((e) => e.elite && e.type === t);
        if (ex) ex.count++; else last.push({ type: t, count: 1, elite: true, affixes: pickAffixes(rng, r), fromPool: hasElPool });
      }
      last.forEach((e) => { delete e.fromPool; });
    }
    // spécimen rare propre au donjon (≈ 4 % par salle de combat)
    if (pools.rares && pools.rares.length && o.kind !== 'entry' && rng.chance(0.02 + 0.005 * r)) waves[waves.length - 1].push({ type: rng.pick(pools.rares), count: 1, rare: true });
    // créature « dangereuse » du donjon (traqueur, statue, embuscade...) : jamais en salle d'entrée, rare au début
    if (pools.danger && pools.danger.length && o.kind !== 'entry' && prog > 0.25 && rng.chance(Math.min(0.45, 0.1 + 0.035 * r + 0.15 * prog))) waves[waves.length - 1].push({ type: rng.pick(pools.danger), count: 1, danger: true });
    return waves;
  }

  function dungeonTimeLimit(rooms, r) { return Math.round(60 + rooms * 55 - r * 4); }

  function generate(template, opts) {
    template = template || {};
    opts = opts || {};
    // ids inconnus -> fallback (G.DungeonsMeta.resolve)
    try {
      if (template.fallback && G.DungeonsMeta && G.DungeonsMeta.resolve && !template.__resolved) {
        const hasM = (id) => !!((G.MONSTERS && G.MONSTERS[id]) || (G.DATA && G.DATA.ENEMIES && G.DATA.ENEMIES[id]));
        const hasB = (id) => !!((G.BOSSES && G.BOSSES[id]) || (G.DATA && G.DATA.BOSSES && G.DATA.BOSSES[id]));
        template = G.DungeonsMeta.resolve(template, hasM, hasB);
      }
    } catch (e) { /* template brut */ }

    let seed = opts.seed;
    if (seed == null) seed = Math.floor((G.rng && G.rng.float ? G.rng.float() : Math.random()) * 2147483646) + 1;
    if (typeof seed === 'string') seed = hashStr(seed);
    seed = seed >>> 0;
    const rng = makeRng(seed ^ hashStr(template.id || 'x'));

    let rank = opts.rank || template.rank || 'E';
    if (RANKS.indexOf(rank) < 0) rank = 'E';
    const r = ri(rank);
    const tRank = ri(template.rank || rank);

    // --- modificateurs ---
    let modDefs;
    if (Array.isArray(opts.modifiers)) modDefs = opts.modifiers.map(resolveModifier).filter(Boolean);
    else modDefs = rollModifiers(rng, r, template);
    const gen = { countMult: 1, eliteMult: 1, extraTreasure: 0, extraChest: 0, infinite: false };
    let rewardMult = 1;
    modDefs.forEach((m) => {
      if (m.gen) {
        if (m.gen.countMult) gen.countMult *= m.gen.countMult;
        if (m.gen.eliteMult) gen.eliteMult *= m.gen.eliteMult;
        if (m.gen.extraTreasure) gen.extraTreasure += m.gen.extraTreasure;
        if (m.gen.extraChest) gen.extraChest += m.gen.extraChest;
      }
      if (m.reward) rewardMult *= m.reward;
    });
    const mech = (template.mechanics || []).slice();
    const has = (id) => mech.indexOf(id) >= 0;
    if (has('horde')) gen.countMult *= 2;
    if (has('vagues_infinies')) gen.infinite = true;
    if (has('eclipse')) rewardMult *= 1.15;

    const pools = monsterPools(template);
    const minis = (template.minibosses || []).slice();
    const bossRush = has('boss_rush');

    // --- longueur ---
    const rm = opts.rooms || template.rooms || { min: 4, max: 6 };
    const rmin = Math.max(3, rm.min || 4), rmax = Math.max(rmin, rm.max || rmin);
    let N = rng.int(rmin, rmax);
    N += Math.max(-1, Math.min(2, r - tRank));
    if (gen.extraTreasure) N += 1;
    N = Math.max(3, Math.min(rmax + 2, N));
    if (bossRush) N = Math.max(3, Math.min(N, minis.length ? 5 : 3));

    // --- salles principales ---
    const slots = new Array(N).fill(null);
    slots[0] = { type: 'combat', entry: true };
    slots[N - 1] = { type: 'boss' };

    if (bossRush) {
      for (let i = 1; i < N - 1; i++) slots[i] = { type: 'miniboss' };
      if (!minis.length) for (let i = 1; i < N - 1; i++) slots[i] = { type: 'elite' };
    } else {
      // mini-boss au milieu des longs donjons
      const mid = Math.floor((N - 1) / 2);
      if (N >= 6 || (N === 5 && r >= 3 && rng.chance(0.5))) slots[mid] = { type: minis.length ? 'miniboss' : 'elite' };
      // sceaux avant le boss
      if (has('gardien_sceaux') && N >= 4 && !slots[N - 2]) slots[N - 2] = { type: 'event', kind: 'seals' };
      // bifurcation
      let choiceIdx = -1;
      if (N >= 5 && rng.chance(template.type === 'evenement' ? 0.85 : 0.55)) {
        const cand = [];
        for (let i = 2; i <= N - 3; i++) if (!slots[i]) cand.push(i);
        const filtered = cand.filter((i) => !(slots[i - 1] && slots[i - 1].type === 'miniboss') && !(slots[i + 1] && slots[i + 1].type === 'miniboss'));
        const use = filtered.length ? filtered : cand;
        if (use.length) { choiceIdx = rng.pick(use); slots[choiceIdx] = { type: 'choice' }; }
      }
      // remplissage
      const caps = {
        treasure: 1 + gen.extraTreasure, chest: 1 + gen.extraChest, trap: 2, event: template.type === 'evenement' ? 3 : 2,
        shrine: has('sanctuaires') ? 3 : 1, elite: 2 + Math.floor(r / 2),
      };
      const cnt = {};
      slots.forEach((s) => { if (s) cnt[s.type] = (cnt[s.type] || 0) + 1; });
      for (let i = 1; i < N - 1; i++) {
        if (slots[i]) continue;
        const prev = slots[i - 1] ? slots[i - 1].type : null;
        const cands = [
          { t: 'combat', w: 40 * (template.type === 'horde' ? 1.5 : 1) },
          { t: 'elite', w: (10 + 2 * r) * (template.type === 'boss' ? 1.5 : 1) },
          { t: 'chest', w: 9 }, { t: 'treasure', w: 8 }, { t: 'trap', w: 9 },
          { t: 'event', w: 12 * (template.type === 'evenement' ? 2 : 1) },
          { t: 'shrine', w: 6 + (has('sanctuaires') ? 10 : 0) + (template.type === 'evenement' ? 4 : 0) },
        ].filter((c) => {
          if (caps[c.t] != null && (cnt[c.t] || 0) >= caps[c.t]) return false;
          if (c.t !== 'combat' && prev === c.t) return false;
          if (i === 1 && (c.t === 'treasure' || c.t === 'shrine')) return false;
          if (c.t === 'trap' && prev === 'event') return false;
          return true;
        });
        const pick = cands.length ? rng.weighted(cands, 'w').t : 'combat';
        slots[i] = { type: pick };
        cnt[pick] = (cnt[pick] || 0) + 1;
      }
      // sanctuaire avant le boss
      if (N >= 5 && slots[N - 2].type === 'combat' && (cnt.shrine || 0) < caps.shrine && rng.chance(has('sanctuaires') ? 0.7 : 0.4)) { slots[N - 2] = { type: 'shrine' }; }
      // proportion minimale de combats
      const fighting = () => slots.filter((s) => ['combat', 'elite', 'miniboss', 'chest'].indexOf(s.type) >= 0).length;
      const need = Math.max(2, Math.ceil(N * 0.45));
      for (let i = 1; i < N - 1 && fighting() < need; i++) {
        if (['event', 'trap', 'treasure', 'shrine'].indexOf(slots[i].type) >= 0 && slots[i].kind !== 'seals') slots[i] = { type: 'combat' };
      }
    }

    // --- secret : hôte ---
    let secretHost = -1;
    const pSecret = template.noSecret || template.type === 'epreuve' ? 0 : template.secret ? 1 : (0.35 + 0.2 * r / 6);
    if (!bossRush && rng.chance(pSecret)) {
      const cand = [];
      for (let i = 1; i < N - 1; i++) if (['combat', 'elite', 'event', 'trap', 'treasure', 'chest'].indexOf(slots[i].type) >= 0) cand.push(i);
      if (cand.length) secretHost = rng.pick(cand);
    }

    // --- construction des salles ---
    const bossId = opts.boss || template.boss;
    const rooms = [];
    const LAY = themeLayouts(template.theme || 'crypte');
    const DTRAPS = (template.traps || []).slice();
    const DEVENTS = (template.events || []).slice();
    const isTrial = template.type === 'epreuve';
    // pièges ambiants propres au donjon, caches secrètes, ancres de mise en scène
    const decorateRoom = (room, s, prog) => {
      room.data = room.data || {};
      if (isTrial) return;
      if ((s.type === 'combat' || s.type === 'elite' || s.type === 'chest') && !s.entry && DTRAPS.length && rng.chance(Math.min(0.75, 0.3 + 0.05 * r + 0.25 * prog))) {
        room.data.traps = [rng.pick(DTRAPS)];
        if (r >= 4 && rng.chance(0.35)) { const t2 = rng.pick(DTRAPS); if (room.data.traps.indexOf(t2) < 0) room.data.traps.push(t2); }
        room.data.trapIntensity = 0.7 + 0.12 * r + 0.3 * prog;
      }
      if ((s.type === 'combat' || s.type === 'elite') && rng.chance(0.14 + 0.02 * r)) room.data.cache = { seed: rng.int(1, 1e9), rich: rng.chance(0.25) };
    };
    const mkRoom = (s, idx, total) => {
      const prog = total > 1 ? idx / (total - 1) : 0;
      const room = { type: s.type, layout: 'arena', seed: rng.int(1, 1073741823), waves: [], data: {}, name: ROOM_TYPES[s.type] ? ROOM_TYPES[s.type].name : s.type, icon: ROOM_TYPES[s.type] ? ROOM_TYPES[s.type].icon : '' };
      const wopt = { r, gen, progress: prog, kind: 'combat' };
      switch (s.type) {
        case 'combat':
          wopt.kind = s.entry ? 'entry' : 'combat';
          room.waves = genWaves(rng, template, pools, wopt);
          if (s.entry) room.data.entry = true;
          break;
        case 'elite':
          wopt.kind = 'elite'; room.waves = genWaves(rng, template, pools, wopt); break;
        case 'chest':
          room.waves = genWaves(rng, template, pools, wopt); room.chest = true; break;
        case 'miniboss':
          room.boss = minis.length ? rng.pick(minis) : bossId; room.miniboss = true;
          room.data.guards = r >= 2 ? rng.int(1, 2 + Math.floor(r / 2)) : 0; break;
        case 'boss':
          room.layout = 'boss'; room.boss = bossId; break;
        case 'treasure':
          room.data = { chests: rng.int(2, 3), mimicChance: 0.08 + (has('mimiques') ? 0.25 : 0), rich: !!s.rich, seed: rng.int(1, 1e9) }; break;
        case 'trap': {
          const kinds = ['spikes', 'blades', 'arrows', 'mixed'];
          const own = DTRAPS.length ? rng.shuffle(DTRAPS).slice(0, Math.min(DTRAPS.length, r >= 3 ? 3 : 2)) : [];
          room.data = { kind: s.kind || (own.length ? own[0] : rng.pick(kinds)), traps: own, intensity: 1 + r * 0.25 + prog * 0.5, seed: rng.int(1, 1e9), reward: s.rich ? 'rich' : 'normal' };
          if (own.length && !s.kind) { room.name = 'Salle piégée'; room.data.dungeonTrap = true; }
          break;
        }
        case 'event': {
          let kind = s.kind;
          let dev = null;
          if (!kind && DEVENTS.length && rng.chance(0.4)) { kind = 'donjon'; dev = rng.pick(DEVENTS); }
          if (!kind) {
            const pool = Object.keys(EVENT_KINDS).filter((k) => ri(EVENT_KINDS[k].minRank) <= r && EVENT_KINDS[k].w > 0).map((k) => ({ k, w: EVENT_KINDS[k].w }));
            kind = rng.weighted(pool, 'w').k;
          }
          room.data = { kind, seed: rng.int(1, 1e9), rare: !!(EVENT_KINDS[kind] && EVENT_KINDS[kind].rare) };
          if (dev) { room.data.devent = Object.assign({}, dev); room.data.rare = true; room.name = dev.name; room.icon = dev.icon || '❗'; }
          if (!dev) { room.name = (EVENT_KINDS[kind] && EVENT_KINDS[kind].name) || room.name; room.icon = (EVENT_KINDS[kind] && EVENT_KINDS[kind].icon) || room.icon; }
          if (kind === 'seals') { room.name = 'Sceaux gardiens'; room.icon = '🔮'; room.data.count = 2 + (r >= 3 ? 1 : 0); }
          break;
        }
        case 'shrine': {
          const ids = rng.shuffle(Object.keys(BLESSINGS)).slice(0, 2);
          room.data = { blessings: ids, level: 1 + (r >= 4 ? 1 : 0), seed: rng.int(1, 1e9) }; break;
        }
        default: break;
      }
      if (s.type === 'combat' || s.type === 'elite' || s.type === 'chest') room.layout = 'arena';
      decorateRoom(room, s, prog);
      return room;
    };

    // salles hors branche
    const mainTotal = N;
    for (let i = 0; i < N; i++) rooms.push(mkRoom(slots[i], i, mainTotal));

    // secret
    if (secretHost >= 0) {
      const sec = { type: 'secret', layout: 'arena', seed: rng.int(1, 1073741823), waves: [], name: ROOM_TYPES.secret.name, icon: ROOM_TYPES.secret.icon, hidden: true,
        data: { seed: rng.int(1, 1e9), tier: r >= 3 ? 'epique' : 'rare', hint: (template.secrets && template.secrets.hint) || (template.secret && template.secret.hint) || rng.pick(SECRET_HINTS), guardian: r >= 2 && rng.chance(0.5) } };
      const SK = (template.secrets && template.secrets.kinds && template.secrets.kinds.length) ? template.secrets.kinds : ['mur', 'levier', 'symbole'];
      sec.data.reveal = { kind: rng.pick(SK), puzzle: (template.secrets && template.secrets.puzzle) || null, seed: rng.int(1, 1e9) };
      sec.data.creature = template.secretCreature || null;
      sec.data.exclusive = ((template.rewards && template.rewards.secret) || []).slice();
      sec.data.archi = template.theme || null;
      // mini-boss caché : une salle de mini-boss précède le reliquaire
      if (template.hiddenMiniboss && rng.chance(0.3 + 0.05 * r)) {
        sec.data.hiddenBoss = template.hiddenMiniboss;
        sec.data.guardian = false;
        sec.data.bossRoom = { type: 'miniboss', layout: 'boss', variant: 'boss', seed: rng.int(1, 1073741823), waves: [], boss: template.hiddenMiniboss, miniboss: true, hidden: true,
          name: 'Gardien caché', icon: '💀', data: { hiddenBoss: true, guards: 0 } };
      }
      rooms[secretHost].data.secret = sec;
      rooms[secretHost].data.secretHint = sec.data.hint;
    }

    // bifurcation
    for (let i = 0; i < N; i++) {
      if (rooms[i].type !== 'choice') continue;
      const mk = (type, extra) => mkRoom(Object.assign({ type }, extra || {}), Math.min(N - 2, i + 1), mainTotal);
      const variants = [
        { a: ['Chemin du trésor', 'Plus dangereux : une salle d\'élites, puis un trésor bien garni.', '💰', [mk('elite'), mk('treasure', { rich: true })]],
          b: ['Chemin sûr', 'Un combat ordinaire, puis un sanctuaire pour souffler.', '🛡️', [mk('combat'), mk('shrine')]] },
        { a: ['Couloir piégé', 'Pièges mortels, mais une récompense généreuse au bout.', '🔻', [mk('trap', { rich: true, kind: 'mixed' }), mk('treasure', { rich: true })]],
          b: ['Salle des murmures', 'Une rencontre étrange, puis un combat.', '🕯️', [mk('event'), mk('combat')]] },
        { a: ['Antre de la bête', 'Une bête féroce garde un coffre piégé.', '🐺', [mk('elite'), mk('chest')]],
          b: ['Passage tranquille', 'Un sanctuaire, puis un combat.', '🌿', [mk('shrine'), mk('combat')]] },
      ];
      const v = rng.pick(variants);
      let opt = [
        { id: 'danger', label: v.a[0], desc: v.a[1], icon: v.a[2], danger: 2, rooms: v.a[3] },
        { id: 'safe', label: v.b[0], desc: v.b[1], icon: v.b[2], danger: 1, rooms: v.b[3] },
      ];
      if (rng.chance(0.5)) opt = [opt[1], opt[0]];
      rooms[i].data = { prompt: 'Deux passages s\'ouvrent devant vous…', options: opt, seed: rng.int(1, 1e9) };
    }

    // --- layouts : jamais deux fois le même d'affilée ---
    let last = null;
    const pickLayout = (avoid) => {
      const c = LAY.filter((l) => !avoid.has(l));
      return (c.length ? rng.pick(c) : rng.pick(LAY));
    };
    const chain = (list, lastL, extra) => {
      let l = lastL;
      list.forEach((rm2) => {
        if (rm2.type === 'boss') { rm2.layout = 'boss'; return; }
        const avoid = new Set(l ? [l] : []);
        rm2.layout = pickLayout(avoid);
        l = rm2.layout;
      });
      return l;
    };
    for (let i = 0; i < N; i++) {
      const rm2 = rooms[i];
      const nextIsAfterChoice = i > 0 && rooms[i - 1].type === 'choice';
      if (rm2.type === 'boss') { rm2.layout = 'boss'; last = null; continue; }
      const avoid = new Set(last && !nextIsAfterChoice ? [last] : []);
      if (nextIsAfterChoice) (rooms[i - 1].data.options || []).forEach((o) => { const lr = o.rooms[o.rooms.length - 1]; if (lr) avoid.add(lr.layout); });
      rm2.layout = pickLayout(avoid);
      last = rm2.layout;
      if (rm2.type === 'choice') {
        const ends = [];
        rm2.data.options.forEach((o) => { ends.push(chain(o.rooms, last)); });
        // `last` reste celui du choix ; la salle suivante évite les fins de branche (cf. ci-dessus)
      }
      if (rm2.data && rm2.data.secret) rm2.data.secret.layout = 'secret';
    }
    // salle après un choix : évite aussi la salle de choix (déjà via last)

    // --- récompenses ---
    const rw = template.rewards || {};
    const rnd = (v, d) => Array.isArray(v) ? rng.int(v[0], v[1]) : (v == null ? d : v);
    const reward = {
      gold: Math.round(rnd(rw.gold, 40 + 20 * r) * rewardMult),
      xp: Math.round(rnd(rw.xp, 50 + 30 * r) * rewardMult),
      lootTier: rw.lootTier || (1 + Math.floor(r / 2)),
      guaranteed: (rw.guaranteed || []).slice(),
      bonusMult: Math.round(rewardMult * 100) / 100,
      exclusive: [], bossGear: (rw.bossGear || []).slice(),
    };
    const known = (id) => !!(G.ITEMS && ((G.ITEMS.materials && G.ITEMS.materials[id]) || (G.ITEMS.bases && G.ITEMS.bases[id])));
    reward.guaranteed = reward.guaranteed.filter((id) => typeof id !== 'string' || known(id) || id === 'objet_legendaire' || id === 'objet_mythique' || !G.ITEMS);
    const excl = (rw.exclusive || []).filter((id) => known(id) || !G.ITEMS);
    if (excl.length && !isTrial) { const pick = rng.pick(excl); reward.exclusive.push(pick); if (rng.chance(0.5 + 0.05 * r)) reward.guaranteed.push(pick); }
    // variante d'architecture = layout (lu par dungeon-themes.js via opts.layout / opts.variant)
    allRooms({ rooms }).forEach((x) => { x.variant = x.layout; if (x.data && x.data.secret && x.data.secret.data && x.data.secret.data.bossRoom) x.data.secret.data.bossRoom.variant = 'boss'; });

    // --- contraintes (épreuves) ---
    let constraints = null;
    const srcC = opts.constraints || (opts.portal && opts.portal.constraints) || template.constraints;
    if (srcC) constraints = Object.assign({}, srcC);
    if (opts.trial && opts.trial.constraints) constraints = Object.assign({}, opts.trial.constraints, constraints || {});
    if (has('chrono') && !constraints) constraints = {};
    if (constraints && has('chrono') && constraints.timeLimit == null) constraints.timeLimit = dungeonTimeLimit(N, r);
    if (has('pas_de_potions')) { constraints = constraints || {}; constraints.noPotions = true; }
    if (has('pas_de_roulade')) { constraints = constraints || {}; constraints.noDash = true; }
    if (has('une_vie')) { constraints = constraints || {}; constraints.oneLife = true; }

    return {
      id: (template.id || 'donjon') + '-' + seed.toString(36),
      templateId: template.id,
      name: template.name, desc: template.desc, lore: template.lore, icon: template.icon,
      rank, theme: template.theme || 'crypte', tint: template.tint == null ? null : template.tint, element: template.element,
      type: template.type, seed, portalType: opts.portalType || null, trial: opts.trial ? (opts.trial.id || true) : null,
      modifiers: modDefs.map(publicModifier),
      modifierIds: modDefs.map((m) => m.id),
      mechanics: mech,
      constraints,
      monsters: pools.monsters, elites: pools.elites, boss: bossId,
      rares: pools.rares, secretCreature: template.secretCreature || null, hiddenMiniboss: template.hiddenMiniboss || null,
      ambience: template.ambience || null, music: template.music || null, archi: template.theme || 'crypte',
      traps: DTRAPS, secrets: template.secrets || null, events: DEVENTS, horror: template.horror || null,
      rooms, reward,
      levelRequired: template.levelRequired,
      roomsCount: N,
    };
  }

  /** Toutes les salles, y compris branches et secrets (tests / aperçus) */
  function allRooms(d) {
    const out = [];
    (d.rooms || []).forEach((rm) => {
      out.push(rm);
      if (rm.data && rm.data.secret) out.push(rm.data.secret);
      if (rm.data && rm.data.options) rm.data.options.forEach((o) => (o.rooms || []).forEach((x) => { out.push(x); if (x.data && x.data.secret) out.push(x.data.secret); }));
    });
    return out;
  }

  // ------------------------------------------------------------------
  //  UTILITAIRES (partagés avec events.js)
  // ------------------------------------------------------------------
  const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
  const U = {
    api() { return G.SkillAPI; },
    run() { return safe(() => (G.SkillAPI && G.SkillAPI.run && G.SkillAPI.run()) || (G.game && G.game.run) || null, null); },
    profile() { return safe(() => (G.game && G.game.profile) || null, null); },
    player() {
      return safe(() => {
        const a = G.SkillAPI;
        if (a && a.player && (!a.inRun || a.inRun())) { const p = a.player(); if (p) return p; }
        const r = G.game && G.game.run; return r && r.player ? r.player : null;
      }, null);
    },
    roomRef() { const r = U.run(); if (!r) return null; return r.roomData || (r.dungeon && r.dungeon.rooms && r.dungeon.rooms[r.roomIndex]) || null; },
    pvMax() { const p = U.player(); return p ? (p.pvMax || p.pvMax === 0 ? p.pvMax : (p.stats && p.stats.pvMax) || 100) : 100; },
    rankIndex() { const r = U.run(); return r && r.dungeon ? ri(r.dungeon.rank) : 0; },
    banner(html, d) { if (G.UI && G.UI.banner) G.UI.banner(html, d || 2); },
    toast(t) { if (G.UI && G.UI.toast) G.UI.toast(t); },
    notify(text, rarity, icon) {
      if (G.UI && G.UI.notify) G.UI.notify({ text, rarity: rarity || 'commun', icon: icon || '' });
      else U.toast((icon ? icon + ' ' : '') + text);
    },
    sfx(n) { if (G.sfx && G.sfx.play) { try { G.sfx.play(n); } catch (e) { /* */ } } },
    damagePlayer(amount, o) {
      const a = G.SkillAPI;
      if (a && a.damagePlayer) a.damagePlayer(amount, o || {});
    },
    heal(n) { const a = G.SkillAPI; if (a && a.heal) a.heal(n); },
    giveGold(n, pos) {
      n = Math.max(0, Math.round(n));
      if (!n) return 0;
      n = Math.round(G.hooks.run('goldGain', n, { source: 'event', run: U.run() }));
      const a = G.SkillAPI;
      if (a && a.giveGold) a.giveGold(n); else {
        const p = U.profile(), r = U.run();
        if (p) p.gold = (p.gold || 0) + n;
        if (r && typeof r.goldGained === 'number') r.goldGained += n;
      }
      G.bus.emit('loot', { gold: n });
      U.sfx('gold');
      if (pos && G.fx && G.fx.text) G.fx.text(pos, '+' + n + ' or', '#ffd23f', 1);
      return n;
    },
    giveXP(n) {
      n = Math.max(0, Math.round(n));
      if (!n) return 0;
      n = Math.round(G.hooks.run('xpGain', n, { source: 'event', run: U.run() }));
      const a = G.SkillAPI, p = U.profile();
      if (a && a.giveXP) a.giveXP(n);
      else if (G.Progress && G.Progress.gainXP && p) G.Progress.gainXP(p, n);
      else if (G.game && G.game.debug && G.game.debug.giveXP) G.game.debug.giveXP(n);
      const r = U.run(); if (r && typeof r.xpGained === 'number' && !(a && a.giveXP)) r.xpGained += n;
      return n;
    },
    /** objet d'inventaire (rareté indicative) */
    giveItem(rarity) {
      const p = U.profile(), r = U.run();
      if (!(G.Inventory && G.Inventory.generate && p)) return null;
      const it = safe(() => G.Inventory.generate(p.niveau || 1, (r && r.dungeon && r.dungeon.rank) || 'E', rarity || 'rare'), null);
      if (!it) return null;
      if (G.Inventory.add) safe(() => G.Inventory.add(p, it));
      G.bus.emit('loot', { item: it });
      U.notify(it.name || 'Objet', it.rarity || rarity, it.icon);
      return it;
    },
    addPotion(name, n) {
      const p = U.profile(); if (!p) return;
      p.potions = p.potions || {}; p.potions[name] = (p.potions[name] || 0) + (n || 1);
    },
    save() { if (G.game && G.game.saveProfile) safe(() => G.game.saveProfile()); },
    freeSpot(built, x, z, rad) {
      const obs = (built && built.obstacles) || [];
      const bad = (px, pz) => Math.abs(px) > HALF - 1.5 || Math.abs(pz) > HALF - 1.5 || obs.some((o) => Math.abs(px - o.x) < o.hw + rad && Math.abs(pz - o.z) < o.hd + rad);
      if (!bad(x, z)) return [x, z];
      for (let k = 1; k < 40; k++) {
        const a = k * 2.4, d = 0.6 * k;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (!bad(px, pz)) return [px, pz];
      }
      return [x, z];
    },
  };

  // --- champs de rendu liés à une salle (nettoyés quand la salle change) ---
  const fields = [];
  function newField(ownerRoom) {
    if (typeof THREE === 'undefined') return { group: null, add() {}, clear() {} };
    const group = new THREE.Group();
    const f = { group, owner: ownerRoom || U.roomRef(), dead: false,
      add(o) { group.add(o); return o; },
      clear() {
        if (f.dead) return; f.dead = true;
        if (group.parent) group.parent.remove(group);
        group.traverse((m) => { if (m.geometry && m.userData && m.userData.own) m.geometry.dispose(); });
      } };
    if (G.core && G.core.scene) G.core.scene.add(group);
    fields.push(f);
    return f;
  }
  function sweepFields(force) {
    const cur = U.roomRef();
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      if (f.dead || force || (f.owner && f.owner !== cur)) { f.clear(); fields.splice(i, 1); }
    }
  }

  // --- zones de danger (cercles télégraphiés / nuages persistants) ---
  const hazards = [];
  /** {x,z,r,delay,dmg,element,color,cloud:{life,every}} */
  function hazardCircle(o) {
    const f = newField();
    let tele = null;
    if (G.GFX && G.GFX.makeTelegraph && f.group) {
      tele = G.GFX.makeTelegraph('circle', o.r);
      tele.position.set(o.x, 0.05, o.z);
      f.add(tele);
    }
    const h = { o, t: 0, f, tele, state: 'warn', tick: 0, owner: U.roomRef() };
    hazards.push(h);
    return h;
  }
  function updateHazards(dt) {
    const cur = U.roomRef();
    const p = U.player();
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i], o = h.o;
      if (h.owner && h.owner !== cur) { h.f.clear(); hazards.splice(i, 1); continue; }
      h.t += dt;
      const near = p && Math.hypot(p.pos.x - o.x, p.pos.z - o.z) < o.r + 0.3;
      if (o.cloud) {
        if (h.tele && h.tele.userData.setProgress) h.tele.userData.setProgress(1);
        h.tick -= dt;
        if (near && h.tick <= 0) { h.tick = o.cloud.every || 0.5; U.damagePlayer(o.dmg, { element: o.element || 'poison', source: 'hazard' }); }
        if (h.t > (o.cloud.life || 12)) { h.f.clear(); hazards.splice(i, 1); }
        continue;
      }
      if (h.state === 'warn') {
        if (h.tele && h.tele.userData.setProgress) h.tele.userData.setProgress(h.t / o.delay);
        if (h.t >= o.delay) {
          h.state = 'boom'; h.t = 0;
          if (near) U.damagePlayer(o.dmg, { element: o.element || 'feu', source: 'hazard' });
          const pos = new THREE.Vector3(o.x, 0.2, o.z);
          if (G.VFX && G.VFX.explosion) safe(() => G.VFX.explosion(pos, o.r, o.element || 'feu'));
          else if (G.fx) { safe(() => G.fx.ring(pos, o.color || 0xff6a2a, o.r, 0.4)); safe(() => G.fx.burst(pos, o.color || 0xff6a2a, 16, { speed: 5, up: 4, life: 0.5, size: 0.2 })); }
          if (G.core && G.core.shake) G.core.shake(0.18);
          if (o.onStrike) safe(() => o.onStrike(near));
          if (h.tele) h.tele.visible = false;
        }
      } else if (h.t > 0.3) { h.f.clear(); hazards.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------
  //  AGRÉGAT D'EFFETS (modificateurs + bonus temporaires) → hooks uniques
  // ------------------------------------------------------------------
  let active = null;   // {run, dungeon, ...}
  const buffs = [];    // {id,name,icon,until(null=run),fx}
  const agg = {};
  function resetAgg() {
    Object.assign(agg, { dmgDealt: 1, dmgTaken: 1, enemyDmg: 1, enemyPv: 1, enemySpeed: 1, xp: 1, gold: 1, speed: 1, pvMax: 1, cdr: 0, crit: 0, lootDup: 0, manaRegen: 1, manaCost: 1, noRegen: false, healMult: 1, vision: 1, tmpSpeed: 1 });
  }
  resetAgg();
  function recompute() {
    resetAgg();
    const add = (fx) => {
      if (!fx) return;
      for (const k in fx) {
        const v = fx[k];
        if (k === 'noRegen') { if (v) agg.noRegen = true; }
        else if (k === 'cdr' || k === 'crit' || k === 'lootDup') agg[k] += v;
        else if (k === 'vision') agg.vision = Math.min(agg.vision, v);
        else if (typeof v === 'number') agg[k] = (agg[k] == null ? 1 : agg[k]) * v;
      }
    };
    if (active) active.modDefs.forEach((m) => add(m.fx));
    buffs.forEach((b) => add(b.fx));
    active && active.mechFx.forEach((fx) => add(fx));
  }
  const isEnemyTarget = (t) => !!(t && (t.def || t.ai));
  function installHooks() {
    const rm = [];
    const H = (n, fn, p) => rm.push(G.hooks.add(n, fn, p == null ? 5 : p));
    H('enemyStats', (def) => {
      if (!def || typeof def !== 'object') return;
      if (agg.enemyDmg === 1 && agg.enemyPv === 1 && agg.enemySpeed === 1) return;
      const boss = !!(def.phases || def.title);
      const c = Object.assign({}, def);
      let pvM = agg.enemyPv; if (boss && pvM < 1) pvM = 1;
      if (typeof c.pv === 'number') c.pv = Math.round(c.pv * pvM);
      if (typeof c.dmg === 'number') c.dmg = Math.round(c.dmg * agg.enemyDmg * 100) / 100;
      if (typeof c.speed === 'number') c.speed = c.speed * agg.enemySpeed;
      return c;
    });
    H('incomingDamage', (d, ctx) => {
      if (!d || isEnemyTarget(ctx && ctx.target)) return;
      if (agg.dmgTaken !== 1 && typeof d.amount === 'number') d.amount *= agg.dmgTaken;
      return d;
    });
    H('outgoingDamage', (d, ctx) => {
      if (!d || (ctx && ctx.source && ctx.source.def)) return;
      if (agg.dmgDealt !== 1 && typeof d.amount === 'number') d.amount *= agg.dmgDealt;
      if (active && active.lowGrav) d.knockbackMult = (d.knockbackMult || 1) * 1.6;
      return d;
    });
    H('xpGain', (n) => (typeof n === 'number' ? n * agg.xp : undefined));
    H('goldGain', (n) => (typeof n === 'number' ? n * agg.gold : undefined));
    H('lootTable', (drops) => {
      if (!Array.isArray(drops) || !drops.length || !(agg.lootDup > 0)) return;
      const out = drops.slice();
      if (G.rng.chance(Math.min(0.9, agg.lootDup))) { const d = G.rng.pick(drops); out.push(typeof d === 'object' && d ? Object.assign({}, d) : d); }
      return out;
    });
    H('stats', (s) => {
      if (!s || typeof s !== 'object') return;
      if (agg.speed !== 1 && typeof s.vitesse === 'number') s.vitesse *= agg.speed * agg.tmpSpeed;
      else if (agg.tmpSpeed !== 1 && typeof s.vitesse === 'number') s.vitesse *= agg.tmpSpeed;
      if (agg.pvMax !== 1 && typeof s.pvMax === 'number') s.pvMax = Math.round(s.pvMax * agg.pvMax);
      if (agg.cdr) s.cdr = (s.cdr || 0) + agg.cdr;
      if (agg.crit) s.crit = (s.crit || 0) + agg.crit;
      if (agg.manaRegen !== 1 && typeof s.manaRegen === 'number') s.manaRegen *= agg.manaRegen;
      if (agg.lootDup) s.lootLuck = (s.lootLuck || 0) + agg.lootDup;
      if (agg.noRegen) { s.lifesteal = 0; s.regen = 0; s.pvRegen = 0; }
      if (active && active.rules.noDash) s.noDash = true;
      return s;
    });
    H('skillManaCost', (c) => (typeof c === 'number' && agg.manaCost !== 1 ? c * agg.manaCost : undefined));
    return rm;
  }

  /** Bonus temporaire (sanctuaires, pactes, marchand…) : {id,name,icon,duration(s)|null,fx} */
  function addBuff(def) {
    const i = buffs.findIndex((b) => b.id === def.id);
    const b = { id: def.id, name: def.name, icon: def.icon, fx: def.fx || {}, left: def.duration == null ? null : def.duration, total: def.duration };
    if (i >= 0) buffs[i] = b; else buffs.push(b);
    recompute();
    G.bus.emit('profileChanged', {});
    pushBuffsHud();
    return b;
  }
  function removeBuff(id) { const i = buffs.findIndex((b) => b.id === id); if (i >= 0) { buffs.splice(i, 1); recompute(); pushBuffsHud(); } }
  function pushBuffsHud() {
    // Info seulement : le HUD des buffs appartient à game.js/ui.js. On expose G.Procgen.buffs().
    if (G.UI && G.UI.hud && G.UI.hud.setBuffs && active) {
      /* game.js agrège via G.Procgen.buffs() s'il le souhaite */
    }
  }

  // ------------------------------------------------------------------
  //  ATMOSPHÈRE (vision)
  // ------------------------------------------------------------------
  const atmos = { base: null, pending: true, visionBy: {} };
  function visionFactor() { let f = 1; for (const k in atmos.visionBy) f = Math.min(f, atmos.visionBy[k]); return f; }
  function applyAtmos() {
    const sc = G.core && G.core.scene;
    if (!sc || !sc.fog) return;
    const f = visionFactor();
    if (!atmos.base) atmos.base = { near: sc.fog.near, far: sc.fog.far, hemi: G.core.hemi ? G.core.hemi.intensity : null };
    const b = atmos.base;
    sc.fog.near = b.near * f;
    sc.fog.far = b.far * (f + (1 - f) * 0.35);
    if (G.core.hemi && b.hemi != null) G.core.hemi.intensity = b.hemi * (0.55 + 0.45 * f);
    atmos.pending = false;
  }
  function restoreAtmos() {
    const sc = G.core && G.core.scene;
    if (sc && sc.fog && atmos.base) {
      sc.fog.near = atmos.base.near; sc.fog.far = atmos.base.far;
      if (G.core.hemi && atmos.base.hemi != null) G.core.hemi.intensity = atmos.base.hemi;
    }
    atmos.base = null; atmos.pending = true; atmos.visionBy = {};
  }

  // ------------------------------------------------------------------
  //  MÉCANIQUES DE DONJON (id → start(env) → stop)
  //  env = {run, dungeon, rules, tick(fn(dt)), on(ev,fn), fx(obj), vision(f), api}
  // ------------------------------------------------------------------
  const inCombatRoom = () => { const rm = U.roomRef(); return !!rm && ['combat', 'elite', 'miniboss', 'boss', 'chest'].indexOf(rm.type || (rm.boss ? 'boss' : 'combat')) >= 0; };
  const rr = (a, b) => a + G.rng.float() * (b - a);
  const half = () => HALF;
  const randSpotNear = (p, spread) => {
    const x = Math.max(-HALF + 2, Math.min(HALF - 2, (p ? p.pos.x : 0) + rr(-spread, spread)));
    const z = Math.max(-HALF + 2, Math.min(HALF - 2, (p ? p.pos.z : 0) + rr(-spread, spread)));
    return [x, z];
  };
  const everyTimer = (env, minS, maxS, fn, cond) => {
    let t = rr(minS, maxS);
    env.tick((dt) => { if (cond && !cond()) return; t -= dt; if (t <= 0) { t = rr(minS, maxS); fn(); } });
  };
  const dmgPct = (pct) => Math.max(4, Math.round(U.pvMax() * pct));

  const MECH_IMPL = {
    tenebres: (env) => { env.vision(0.4); },
    brouillard: (env) => { env.vision(0.55); },
    eclipse: (env) => { env.vision(0.65); env.fx({ enemyDmg: 1.25, enemyPv: 1.25, lootDup: 0.15 }); },
    horde: (env) => { env.fx({ enemyPv: 0.7 }); },
    silence_arcane: (env) => { env.fx({ manaCost: 1.5 }); },
    gravite_faible: (env) => { env.state.lowGrav = true; },
    une_vie: (env) => { env.rules.oneLife = true; env.rules.noRoomHeal = true; env.fx({ healMult: 0.6 }); },
    pas_de_roulade: (env) => { env.rules.noDash = true; },
    pas_de_potions: (env) => { env.rules.noPotions = true; },
    sol_gele: (env) => {
      let prev = null, vx = 0, vz = 0;
      env.tick((dt) => {
        const p = U.player(); if (!p || dt <= 0) return;
        const inp = G.input && G.input.move ? Math.hypot(G.input.move.x, G.input.move.z) : 0;
        if (prev) {
          const mx = (p.pos.x - prev.x) / dt, mz = (p.pos.z - prev.z) / dt;
          if (inp > 0.15) { vx = vx * 0.5 + mx * 0.5; vz = vz * 0.5 + mz * 0.5; }
          else if (Math.hypot(vx, vz) > 0.4) {
            const k = Math.exp(-1.8 * dt); vx *= k; vz *= k;
            const nx = Math.max(-HALF + 1, Math.min(HALF - 1, p.pos.x + vx * dt)), nz = Math.max(-HALF + 1, Math.min(HALF - 1, p.pos.z + vz * dt));
            const run = U.run(); const obs = (run && run.obstacles) || [];
            const blocked = obs.some((o) => Math.abs(nx - o.x) < o.hw + 0.4 && Math.abs(nz - o.z) < o.hd + 0.4);
            if (!blocked) { p.pos.x = nx; p.pos.z = nz; } else { vx = 0; vz = 0; }
          } else { vx = 0; vz = 0; }
        }
        prev = { x: p.pos.x, z: p.pos.z };
      });
    },
    pieges_pics: (env) => {
      env.on('roomStart', () => {});
      const done = new WeakSet();
      env.tick(() => {
        const rm = U.roomRef();
        if (!rm || done.has(rm) || !inCombatRoom() || rm.boss) return;
        done.add(rm);
        if (G.Events && G.Events.spikeField) G.Events.spikeField({ count: 3 + Math.floor(U.rankIndex() / 2), intensity: 0.7 });
      });
    },
    pluie_de_meteores: (env) => {
      everyTimer(env, 3.2 - U.rankIndex() * 0.1, 5.2 - U.rankIndex() * 0.15, () => {
        const p = U.player(); if (!p) return;
        const [x, z] = G.rng.chance(0.55) ? randSpotNear(p, 3.5) : randSpotNear(null, HALF - 2);
        hazardCircle({ x, z, r: 2.3, delay: 1.35, dmg: dmgPct(0.1 + 0.01 * U.rankIndex()), element: 'feu' });
      }, () => inCombatRoom() && !(U.run() || {}).modal);
    },
    foudre_statique: (env) => {
      everyTimer(env, 3.5, 5.5, () => {
        const p = U.player(); if (!p) return;
        const [x, z] = randSpotNear(p, 3.2);
        hazardCircle({ x, z, r: 1.6, delay: 1.0, dmg: dmgPct(0.09 + 0.01 * U.rankIndex()), element: 'foudre', color: 0x9ad0ff });
      }, () => inCombatRoom() && !(U.run() || {}).modal);
    },
    poison_ambiant: (env) => {
      const done = new WeakSet();
      env.tick(() => {
        const rm = U.roomRef();
        if (!rm || done.has(rm) || !inCombatRoom()) return;
        done.add(rm);
        const n = 2 + Math.floor(U.rankIndex() / 3);
        for (let i = 0; i < n; i++) {
          const [x, z] = randSpotNear(null, HALF - 3);
          hazardCircle({ x, z, r: 2.6 + G.rng.float(), delay: 1, dmg: dmgPct(0.025), element: 'poison', cloud: { life: 9999, every: 0.6 } });
        }
      });
    },
    lave_montante: (env) => {
      let f = null, t = 0, owner = null, bars = [], dmgT = 0;
      const MAXIN = 4.5;
      env.tick((dt) => {
        const rm = U.roomRef();
        if (rm !== owner) {
          if (f) f.clear(); f = null; bars = []; owner = rm; t = 0;
          if (!inCombatRoom() || (rm && rm.boss && rm.layout === 'boss' && !rm.miniboss)) return;
          f = newField(rm);
          if (typeof THREE !== 'undefined' && f.group) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.75 });
            for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), mat); m.position.y = 0.06; m.visible = false; f.add(m); bars.push(m); }
          }
        }
        if (!f) return;
        t += dt;
        const inset = Math.min(MAXIN, Math.max(0, (t - 14) / 7));
        if (inset <= 0) return;
        const L = HALF * 2 + 2;
        const set = (m, x, z, w, d) => { m.visible = true; m.position.x = x; m.position.z = z; m.scale.set(w, 1, d); };
        if (bars.length) {
          set(bars[0], 0, -HALF + inset / 2, L, inset); set(bars[1], 0, HALF - inset / 2, L, inset);
          set(bars[2], -HALF + inset / 2, 0, inset, L); set(bars[3], HALF - inset / 2, 0, inset, L);
        }
        const p = U.player(); if (!p) return;
        dmgT -= dt;
        const lim = HALF - inset;
        if (dmgT <= 0 && (Math.abs(p.pos.x) > lim || Math.abs(p.pos.z) > lim)) { dmgT = 0.5; U.damagePlayer(dmgPct(0.03), { element: 'feu', source: 'lave' }); }
      });
      env.cleanup(() => { if (f) f.clear(); });
    },
    maree: (env) => {
      let t = rr(14, 20), flood = 0, dir = 1;
      env.tick((dt) => {
        if (!inCombatRoom()) { env.state.tide = false; return; }
        if (flood > 0) {
          flood -= dt;
          const p = U.player();
          if (p) { p.pos.x = Math.max(-HALF + 1, Math.min(HALF - 1, p.pos.x + dir * 1.8 * dt)); }
          if (flood <= 0) { env.state.tide = false; agg.tmpSpeed = 1; }
        } else {
          t -= dt;
          if (t <= 0) { t = rr(16, 24); flood = 6; dir = G.rng.chance(0.5) ? 1 : -1; env.state.tide = true; agg.tmpSpeed = 0.7; U.banner('🌊 La marée monte !<br><small>Elle vous pousse et vous ralentit</small>', 1.4); }
        }
      });
      env.cleanup(() => { agg.tmpSpeed = 1; });
    },
    regeneration_ennemie: (env) => {
      env.on('damageDealt', (d) => { if (d && d.target) d.target._hitAt = (U.run() || {}).time || 0; });
      env.tick((dt) => {
        const a = G.SkillAPI; if (!a || !a.enemies) return;
        const now = (U.run() || {}).time || 0;
        a.enemies().forEach((e) => {
          if (e.dead || e.boss || e.pv >= e.pvMax) return;
          if (now - (e._hitAt || 0) > 4) e.pv = Math.min(e.pvMax, e.pv + e.pvMax * 0.03 * dt);
        });
      });
    },
    ennemis_dores: (env) => {
      env.on('enemySpawn', (p) => {
        const e = p && p.enemy; if (!e || e.boss || e.golden) return;
        if (!G.rng.chance(0.07)) return;
        e.golden = true; e.pv *= 1.5; e.pvMax *= 1.5;
        if (e.mesh && e.mesh.traverse) e.mesh.traverse((m) => { if (m.material && m.material.color && m.isMesh && !m.userData.outline) { try { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(0xffd23f), 0.7); if (m.material.emissive) m.material.emissive.setHex(0x5a4000); } catch (er) { /* */ } } });
      });
      env.on('enemyKilled', (p) => {
        const e = p && p.enemy; if (!e || !e.golden) return;
        const pos = e.pos ? e.pos.clone() : null;
        U.giveGold(20 + U.rankIndex() * 25, pos);
        const pr = U.profile(); if (pr) { pr.stats = pr.stats || {}; pr.stats.goldenKills = (pr.stats.goldenKills || 0) + 1; }
        if (G.rng.chance(0.25)) U.giveItem('rare');
      });
    },
    miroir_ombre: (env) => {
      let f = null, mesh = null; const hist = []; let t = 0;
      env.tick((dt) => {
        const p = U.player(); if (!p) return;
        t += dt; hist.push({ t, x: p.pos.x, z: p.pos.z }); while (hist.length && hist[0].t < t - 0.9) hist.shift();
        if (!mesh && typeof THREE !== 'undefined' && G.core && G.core.scene) {
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
          mesh.position.y = 0.8; G.core.scene.add(mesh);
        }
        if (mesh && hist.length) { mesh.position.x = hist[0].x; mesh.position.z = hist[0].z; }
      });
      env.on('damageDealt', (d) => {
        if (!d || !d.target || d._echo || d.kind === 'dot' || d.source === 'echo') return;
        const a = G.SkillAPI; if (!a || !a.after || !a.damage) return;
        const tgt = d.target, amt = d.amount * 0.3;
        a.after(0.8, () => { if (tgt && !tgt.dead) a.damage(tgt, amt, { element: d.element, kind: 'dot', canCrit: false, source: 'echo' }); });
      });
      env.cleanup(() => { if (mesh && mesh.parent) mesh.parent.remove(mesh); mesh = null; });
    },
    chrono: () => { /* géré par les contraintes (timeLimit) */ },
    sanctuaires: () => { /* génération */ },
    mimiques: () => { /* génération */ },
    vagues_infinies: () => { /* génération */ },
    boss_rush: () => { /* génération */ },
    gardien_sceaux: () => { /* génération : salle d'événement 'seals' avant le boss */ },
  };
  Meta.implementedMechanics = Object.keys(MECH_IMPL);

  // ------------------------------------------------------------------
  //  CYCLE DE VIE DU RUN
  // ------------------------------------------------------------------
  let hookRemovers = [], busRemovers = [], tickers = [], cleanups = [], potionStash = null, healWrapped = null;

  function restorePotions() {
    const p = U.profile();
    if (potionStash && p) {
      const cur = p.potions || {};
      const res = {};
      Object.keys(potionStash).forEach((k) => { res[k] = potionStash[k] + (cur[k] || 0); });
      Object.keys(cur).forEach((k) => { if (res[k] == null) res[k] = cur[k]; });
      p.potions = res; U.save();
    }
    potionStash = null;
  }

  function failRun(reason) {
    const g = G.game;
    if (!active || active.failed) return;
    active.failed = true;
    U.banner('<b>ÉPREUVE ÉCHOUÉE</b><br><small>' + (reason || '') + '</small>', 2.5);
    if (g && typeof g.failRun === 'function') { safe(() => g.failRun(reason)); return; }
    if (g && typeof g.endRun === 'function') { safe(() => g.endRun(false)); return; }
    U.damagePlayer(1e9, { source: 'epreuve' });   // dernier recours
  }

  function onRunStart(p) {
    if (active) onRunEnd({});
    const run = p && p.run, dungeon = (p && p.dungeon) || (run && run.dungeon) || {};
    if (dungeon._inserted) {
      dungeon._inserted.forEach((x) => x.list.forEach((rm) => { const i = dungeon.rooms.indexOf(rm); if (i >= 0) dungeon.rooms.splice(i, 1); if (rm._revealed) { rm._revealed = false; rm.hidden = true; } }));
      dungeon._inserted = [];
    }
    const modDefs = (dungeon.modifiers || []).map(resolveModifier).filter(Boolean);
    const portal = (p && p.portal) || null;
    const constraints = Object.assign({}, dungeon.constraints || {}, (portal && portal.constraints) || {});
    const mechIds = (dungeon.mechanics || []).filter((m) => typeof m === 'string');
    active = { run, dungeon, modDefs, mechFx: [], rules: {}, constraints, state: {}, time: 0, failed: false, hits: 0, warned: {}, lowGrav: false };
    buffs.length = 0;
    resetAgg();
    hookRemovers = installHooks();
    // contraintes -> règles
    ['noPotions', 'noDash', 'oneLife', 'noHeal', 'noHealDrops'].forEach((k) => { if (constraints[k]) active.rules[k] = true; });
    if (constraints.timeLimit) { active.rules.timeLimit = constraints.timeLimit; if (run) { run.timeLimit = constraints.timeLimit; } }
    if (constraints.survive) active.rules.survive = constraints.survive;
    if (constraints.bossBuff) active.rules.bossBuff = constraints.bossBuff;
    if (constraints.maxHits != null) active.rules.maxHits = constraints.maxHits;
    // modificateurs : vision
    modDefs.forEach((m) => { if (m.fx && m.fx.vision) atmos.visionBy['mod_' + m.id] = m.fx.vision; });
    // mécaniques
    const env = {
      run, dungeon, rules: active.rules, state: active.state,
      tick: (fn) => tickers.push(fn),
      on: (ev, fn) => busRemovers.push(G.bus.on(ev, fn)),
      fx: (fx) => active.mechFx.push(fx),
      vision: (f) => { atmos.visionBy['mech'] = Math.min(atmos.visionBy['mech'] || 1, f); },
      cleanup: (fn) => cleanups.push(fn),
      api: G.SkillAPI,
    };
    mechIds.forEach((id) => { const impl = MECH_IMPL[id]; if (impl) { try { impl(env); } catch (e) { console.error('[procgen mech ' + id + ']', e); } } });
    if (active.state.lowGrav) active.lowGrav = true;
    atmos.pending = true;
    // sans potions : stocke et vide (au cas où game.js ne bloque pas lui-même)
    if (active.rules.noPotions) {
      restorePotions();
      const pr = U.profile();
      if (pr && pr.potions) { potionStash = Object.assign({}, pr.potions); Object.keys(pr.potions).forEach((k) => { pr.potions[k] = 0; }); }
    }
    // soins : réduits (malédiction / une vie) ou bloqués (noHeal)
    const api = G.SkillAPI;
    if (api && api.heal && !api.healHooked && !healWrapped) {
      const orig = api.heal;
      api.heal = function (n, o) {
        let m = agg.healMult;
        if (active && active.rules.noHeal) m = 0;
        return orig.call(api, typeof n === 'number' ? n * m : n, o);
      };
      healWrapped = { api, orig };
    }
    recompute();
    G.bus.emit('procgenRunStart', { dungeon, rules: active.rules });
    // annonce
    const names = modDefs.map((m) => m.icon + ' ' + m.name);
    if (names.length) U.banner('<b>Modificateurs</b><br><small>' + names.join(' · ') + '</small>', 3);
    if (active.rules.timeLimit) U.toast('⏱️ Temps limite : ' + fmtTime(active.rules.timeLimit));
  }

  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function onRunEnd() {
    if (!active && !potionStash && !healWrapped) return;
    hookRemovers.forEach((f) => { try { f(); } catch (e) { /* */ } }); hookRemovers = [];
    busRemovers.forEach((f) => { try { f(); } catch (e) { /* */ } }); busRemovers = [];
    cleanups.forEach((f) => { try { f(); } catch (e) { /* */ } }); cleanups = [];
    tickers = [];
    restorePotions();
    if (healWrapped) { healWrapped.api.heal = healWrapped.orig; healWrapped = null; }
    restoreAtmos();
    sweepFields(true);
    hazards.length = 0;
    buffs.length = 0;
    active = null;
    resetAgg();
    G.bus.emit('procgenRunEnd', {});
  }

  function onTick(p) {
    if (!active) return;
    const dt = (p && p.dt) || 0;
    active.time += dt;
    if (atmos.pending) {
      // nouvelle salle : le thème vient d'être appliqué -> on relit les valeurs d'origine
      atmos.base = null;
      atmos.visionBy.base = atmos.visionBy.base || 1;
      if (Object.keys(atmos.visionBy).some((k) => atmos.visionBy[k] < 1)) applyAtmos(); else atmos.pending = false;
    }
    sweepFields(false);
    updateHazards(dt);
    for (const fn of tickers) { try { fn(dt); } catch (e) { console.error('[procgen tick]', e); } }
    // bonus temporaires
    let ch = false;
    for (let i = buffs.length - 1; i >= 0; i--) {
      const b = buffs[i];
      if (b.left != null) { b.left -= dt; if (b.left <= 0) { buffs.splice(i, 1); ch = true; U.toast(b.icon + ' ' + b.name + ' : terminé'); } }
    }
    if (ch) recompute();
    // chrono d'épreuve
    const rl = active.rules.timeLimit;
    if (rl) {
      const left = rl - active.time;
      active.run && (active.run.timeLeft = left);
      [60, 30, 10].forEach((w) => { if (left <= w && !active.warned[w]) { active.warned[w] = true; U.toast('⏱️ ' + w + ' secondes restantes !'); } });
      if (left <= 0) failRun('Le temps est écoulé.');
    }
    // sol : sans potions (vide aussi les potions gagnées pendant le run : elles sont rendues à la fin)
    if (active.rules.noPotions && potionStash) {
      const pr = U.profile();
      if (pr && pr.potions) Object.keys(pr.potions).forEach((k) => { if (pr.potions[k] > 0) { potionStash[k] = (potionStash[k] || 0) + pr.potions[k]; pr.potions[k] = 0; } });
    }
  }

  function onRoomStart() {
    if (!active) return;
    atmos.pending = true;
    sweepFields(false);
  }
  function onPlayerHit() {
    if (!active || active.rules.maxHits == null) return;
    active.hits++;
    if (active.hits > active.rules.maxHits) failRun('Trop de coups encaissés.');
  }

  G.bus.on('runStart', onRunStart);
  G.bus.on('runEnd', onRunEnd);
  G.bus.on('tick', onTick);
  G.bus.on('roomStart', onRoomStart);
  G.bus.on('playerHit', onPlayerHit);

  // ------------------------------------------------------------------
  //  Interface publique
  // ------------------------------------------------------------------
  G.Procgen = {
    generate, allRooms, mulberry32, makeRng, hashStr,
    util: U, newField, hazardCircle, sweepFields,
    addBuff, removeBuff,
    buffs() { return buffs.map((b) => ({ id: b.id, name: b.name, icon: b.icon, timeFrac: b.total ? Math.max(0, (b.left || 0) / b.total) : 1 })); },
    /** règles actives pour game.js : {noPotions, noDash, oneLife, noHeal, timeLimit, maxHits} */
    rules() { return active ? Object.assign({}, active.rules, { timeLeft: active.rules.timeLimit ? active.rules.timeLimit - active.time : undefined }) : {}; },
    rule(k) { return !!(active && active.rules[k]); },
    agg() { return agg; },
    fail: failRun,
    isActive() { return !!active; },
    /** insère des salles juste après `host` (bifurcation, secret) ; annulé au prochain runStart du même donjon */
    insertAfter(run, host, list) {
      run = run || U.run(); if (!run || !run.dungeon || !list || !list.length) return false;
      const idx = run.dungeon.rooms.indexOf(host);
      // v5 : game.js joue run.rooms (copie de dungeon.rooms) → on insère aussi dans la liste jouée
      const live = Array.isArray(run.rooms) && run.rooms !== run.dungeon.rooms ? run.rooms : null;
      const li = live ? live.indexOf(host) : -1;
      if (idx < 0 && li < 0) return false;
      if (idx >= 0) run.dungeon.rooms.splice.apply(run.dungeon.rooms, [idx + 1, 0].concat(list));
      if (li >= 0) live.splice.apply(live, [li + 1, 0].concat(list));
      (run.dungeon._inserted = run.dungeon._inserted || []).push({ host, list: list.slice() });
      return true;
    },
    /** insère la salle secrète de l'hôte juste après lui dans run.dungeon.rooms */
    revealSecret(run, hostRoom) {
      run = run || U.run(); if (!run || !run.dungeon) return false;
      const host = hostRoom || U.roomRef();
      const sec = host && host.data && host.data.secret;
      if (!sec || sec._revealed) return false;
      sec._revealed = true; sec.hidden = false;
      const br = sec.data && sec.data.bossRoom;
      const list = br ? [Object.assign({}, br, { hidden: false, _revealed: true }), sec] : [sec];
      if (!G.Procgen.insertAfter(run, host, list)) { sec._revealed = false; return false; }
      G.bus.emit('secretRevealed', { run, room: sec });
      return true;
    },
    __test: { MECH_IMPL },
  };
})();
