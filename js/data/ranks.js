/* =====================================================================
   js/data/ranks.js — RÔLE 2 : rangs E→SS, épreuves de promotion, titres, accomplissements
   Données pures (aucune dépendance au chargement). Exposé : G.RANKS, G.RANKS_TRIALS,
   G.TITLES, G.ACHIEVEMENTS, G.RANKS_LEGACY_DUNGEONS.
   ===================================================================== */
window.G = window.G || {};
(() => {
  // ------------------------------------------------------------------
  // RANGS
  //  requirements (pour ATTEINDRE ce rang) :
  //    level, power (G.Stats power), bossesKilled (profile.stats.bosses),
  //    dungeonsCleared:{rank, count} -> donjons distincts terminés dont le rang >= rank,
  //    achievements:{count}, mustHave:[ids d'accomplissements], trialId (épreuve OBLIGATOIRE)
  //  bonus (permanent, appliqué par G.Stats.compute) : pvMult, dmg, crit, defense, xpMult, goldMult, lootLuck, minionCap, cdr
  //  rewards (une fois, à la promotion) : skillPoints, attrPoints, talentSlots, gold, title, aura
  //  aura : {color, intensity 0..1, particles, radius, rings}
  // ------------------------------------------------------------------
  const RANKS = [
    {
      id: 'E', name: 'Rang E', short: 'Novice', color: '#9aa3ad', icon: '◆',
      desc: "Rang d'entrée. Tout chasseur éveillé commence ici : les portails les plus faibles, les plus sûrs.",
      aura: { color: '#9aa3ad', intensity: 0, particles: 0, radius: 0.9, rings: 0 },
      requirements: { level: 1, power: 0, bossesKilled: 0, dungeonsCleared: null, achievements: { count: 0 }, mustHave: [], trialId: null },
      bonus: { pvMult: 0, dmg: 0, crit: 0, defense: 0, xpMult: 0, goldMult: 0, lootLuck: 0, minionCap: 0, cdr: 0 },
      rewards: { skillPoints: 0, attrPoints: 0, talentSlots: 0, gold: 0, title: 'novice', aura: 'none' },
    },
    {
      id: 'D', name: 'Rang D', short: 'Éveillé', color: '#4fd17a', icon: '❖',
      desc: "Votre énergie s'est stabilisée. Les portails de rang D s'ouvrent à vous ; une lueur verte vous suit.",
      aura: { color: '#4fd17a', intensity: 0.25, particles: 4, radius: 1.0, rings: 1 },
      requirements: { level: 4, power: 480, bossesKilled: 8, dungeonsCleared: { rank: 'E', count: 2 }, achievements: { count: 2 }, mustHave: [], trialId: 'trial_D' },
      bonus: { pvMult: 0.04, dmg: 0.03, crit: 0.005, defense: 2, xpMult: 0.02, goldMult: 0.03, lootLuck: 0.02, minionCap: 1, cdr: 0.01 },
      rewards: { skillPoints: 2, attrPoints: 3, talentSlots: 0, gold: 250, title: 'eveille', aura: 'faible' },
    },
    {
      id: 'C', name: 'Rang C', short: 'Aguerri', color: '#3fa9ff', icon: '✦',
      desc: "Un chasseur reconnu. Votre souffle de combat dessine un halo bleu ; un nouvel emplacement de don s'éveille.",
      aura: { color: '#3fa9ff', intensity: 0.4, particles: 8, radius: 1.1, rings: 1 },
      requirements: { level: 9, power: 600, bossesKilled: 24, dungeonsCleared: { rank: 'D', count: 2 }, achievements: { count: 5 }, mustHave: [], trialId: 'trial_C' },
      bonus: { pvMult: 0.08, dmg: 0.06, crit: 0.01, defense: 4, xpMult: 0.04, goldMult: 0.06, lootLuck: 0.04, minionCap: 1, cdr: 0.02 },
      rewards: { skillPoints: 3, attrPoints: 5, talentSlots: 0, gold: 700, title: 'champion', aura: 'bleue' },
    },
    {
      id: 'B', name: 'Rang B', short: 'Vétéran', color: '#b44dff', icon: '✹',
      desc: "Les guildes se disputent votre nom. L'aura violette qui vous entoure fait reculer les monstres ordinaires.",
      aura: { color: '#b44dff', intensity: 0.55, particles: 14, radius: 1.25, rings: 2 },
      requirements: { level: 14, power: 820, bossesKilled: 55, dungeonsCleared: { rank: 'C', count: 3 }, achievements: { count: 9 }, mustHave: [], trialId: 'trial_B' },
      bonus: { pvMult: 0.12, dmg: 0.09, crit: 0.015, defense: 7, xpMult: 0.06, goldMult: 0.09, lootLuck: 0.06, minionCap: 1, cdr: 0.03 },
      rewards: { skillPoints: 4, attrPoints: 6, talentSlots: 0, gold: 1800, title: 'veteran', aura: 'violette' },
    },
    {
      id: 'A', name: 'Rang A', short: 'Élite', color: '#ff8a1a', icon: '☀',
      desc: "L'élite. Des flammes d'énergie ambrée s'élèvent de vos épaules ; peu de portails vous résistent.",
      aura: { color: '#ff8a1a', intensity: 0.7, particles: 22, radius: 1.4, rings: 2 },
      requirements: { level: 20, power: 1100, bossesKilled: 110, dungeonsCleared: { rank: 'B', count: 2 }, achievements: { count: 14 }, mustHave: ['boss_20'], trialId: 'trial_A' },
      bonus: { pvMult: 0.17, dmg: 0.13, crit: 0.02, defense: 11, xpMult: 0.08, goldMult: 0.12, lootLuck: 0.09, minionCap: 2, cdr: 0.04 },
      rewards: { skillPoints: 5, attrPoints: 8, talentSlots: 0, gold: 4500, title: 'heros', aura: 'ambre' },
    },
    {
      id: 'S', name: 'Rang S', short: 'Légende', color: '#ff3d3d', icon: '♛',
      desc: "Une légende vivante. Une aura écarlate pulse autour de vous ; l'air vibre à chacun de vos pas.",
      aura: { color: '#ff3d3d', intensity: 0.85, particles: 32, radius: 1.6, rings: 3 },
      requirements: { level: 27, power: 1650, bossesKilled: 200, dungeonsCleared: { rank: 'A', count: 2 }, achievements: { count: 20 }, mustHave: ['boss_40', 'flawless_3'], trialId: 'trial_S' },
      bonus: { pvMult: 0.23, dmg: 0.18, crit: 0.03, defense: 16, xpMult: 0.1, goldMult: 0.15, lootLuck: 0.12, minionCap: 2, cdr: 0.06 },
      rewards: { skillPoints: 6, attrPoints: 10, talentSlots: 0, gold: 10000, title: 'legende', aura: 'ecarlate' },
    },
    {
      id: 'SS', name: 'Rang Souverain', short: 'Souverain', color: '#ffd700', icon: '♚',
      desc: "Le rang des rangs. Moins d'un chasseur sur dix mille l'atteint. Une aura dorée vivante, des couronnes de lumière : le monde plie devant vous.",
      aura: { color: '#ffd700', intensity: 1, particles: 48, radius: 1.9, rings: 4 },
      requirements: { level: 30, power: 2150, bossesKilled: 400, dungeonsCleared: { rank: 'S', count: 1 }, achievements: { count: 30 }, mustHave: ['boss_80', 'flawless_10', 'trials_5'], trialId: 'trial_SS' },
      bonus: { pvMult: 0.32, dmg: 0.25, crit: 0.045, defense: 24, xpMult: 0.15, goldMult: 0.2, lootLuck: 0.18, minionCap: 3, cdr: 0.08 },
      rewards: { skillPoints: 10, attrPoints: 15, talentSlots: 0, gold: 25000, title: 'souverain', aura: 'doree' },
    },
  ];

  // ------------------------------------------------------------------
  // ÉPREUVES DE PROMOTION (une par rang visé ; rôle 7/15 en font des portails type 'epreuve')
  //  {id, rank (VISÉ), name, desc, templateHint:{theme, boss, rooms:{min,max}}, constraints, rewards}
  //  constraints : timeLimit (s), noPotions, noDash, maxHits (coups subis max), survive:{seconds, endless}
  //                (vagues sans fin à tenir avant le boss), bossBuff:{hp, dmg, speed} (multiplicateurs),
  //                noHealDrops, oneLife (pas de seconde chance)
  // ------------------------------------------------------------------
  const RANKS_TRIALS = [
    {
      id: 'trial_D', rank: 'D', name: "Épreuve de l'Éveillé",
      desc: "Terrassez un gardien renforcé avant que le sablier ne se vide.",
      templateHint: { theme: 'crypte', boss: 'golem', rooms: { min: 3, max: 4 }, danger: 2 },
      constraints: { timeLimit: 480, bossBuff: { hp: 1.3, dmg: 1.15, speed: 1.0 } },
      rewards: { xp: 300, gold: 250 },
    },
    {
      id: 'trial_C', rank: 'C', name: "Épreuve de l'Aguerri",
      desc: "Aucune potion. Une reine des toiles furieuse vous attend au bout des ronces.",
      templateHint: { theme: 'foret', boss: 'spiderQueen', rooms: { min: 4, max: 5 }, danger: 3 },
      constraints: { timeLimit: 420, noPotions: true, bossBuff: { hp: 1.5, dmg: 1.2, speed: 1.05 } },
      rewards: { xp: 600, gold: 500 },
    },
    {
      id: 'trial_B', rank: 'B', name: 'Épreuve du Vétéran',
      desc: "Tenez 75 secondes face à des vagues sans fin, sans potion ni roulade de secours... puis affrontez le roi.",
      templateHint: { theme: 'catacombes', boss: 'skeletonKing', rooms: { min: 4, max: 6 }, danger: 3 },
      constraints: { timeLimit: 600, noPotions: true, survive: { seconds: 75, endless: true }, bossBuff: { hp: 1.6, dmg: 1.25, speed: 1.1 } },
      rewards: { xp: 1100, gold: 1000 },
    },
    {
      id: 'trial_A', rank: 'A', name: "Épreuve de l'Élite",
      desc: "Pas de potion, seulement 12 coups encaissables. Le géant du givre ne pardonne rien.",
      templateHint: { theme: 'glace', boss: 'frostGiant', rooms: { min: 5, max: 6 }, danger: 4 },
      constraints: { timeLimit: 540, noPotions: true, maxHits: 12, noHealDrops: true, bossBuff: { hp: 1.8, dmg: 1.3, speed: 1.1 } },
      rewards: { xp: 2000, gold: 2400 },
    },
    {
      id: 'trial_S', rank: 'S', name: 'Épreuve de la Légende',
      desc: "120 secondes de vagues sans fin, 6 coups maximum, aucune potion. La liche éternelle clôt l'épreuve.",
      templateHint: { theme: 'abysse', boss: 'lich', rooms: { min: 5, max: 7 }, danger: 5 },
      constraints: { timeLimit: 660, noPotions: true, maxHits: 6, noHealDrops: true, survive: { seconds: 120, endless: true }, bossBuff: { hp: 2.0, dmg: 1.4, speed: 1.15 } },
      rewards: { xp: 3500, gold: 5000 },
    },
    {
      id: 'trial_SS', rank: 'SS', name: "Épreuve du Souverain",
      desc: "L'ultime. Trois coups, aucune potion, aucune roulade, aucune seconde chance. Le démon du volcan, au sommet de sa puissance.",
      templateHint: { theme: 'volcan', boss: 'demon', rooms: { min: 6, max: 8 }, danger: 5 },
      constraints: { timeLimit: 720, noPotions: true, noDash: true, maxHits: 3, noHealDrops: true, oneLife: true, survive: { seconds: 150, endless: true }, bossBuff: { hp: 2.5, dmg: 1.6, speed: 1.2 } },
      rewards: { xp: 6000, gold: 12000 },
    },
  ];

  // Rang des donjons v2 (si G.DUNGEONS[id].rank est absent)
  const RANKS_LEGACY_DUNGEONS = { crypte: 'E', foret: 'E', catacombes: 'D', glace: 'C', abysse: 'B', volcan: 'B' };

  // ------------------------------------------------------------------
  // TITRES — bonus mineurs (appliqués si le titre est actif)
  //  bonus : pvMult, dmg, crit, critDmg, defense, vitesse, cdr, dodge, lifesteal, xpMult, goldMult, lootLuck, minionDmg
  // ------------------------------------------------------------------
  const TITLES = [
    { id: 'novice', name: 'Chasseur novice', desc: 'Tout le monde commence quelque part.', bonus: {} },
    { id: 'eveille', name: 'Éveillé', desc: 'Promu au rang D.', bonus: { pvMult: 0.01 } },
    { id: 'champion', name: 'Champion', desc: 'Promu au rang C.', bonus: { dmg: 0.01 } },
    { id: 'veteran', name: 'Vétéran des brèches', desc: 'Promu au rang B.', bonus: { defense: 2 } },
    { id: 'heros', name: 'Héros éclatant', desc: 'Promu au rang A.', bonus: { dmg: 0.02 } },
    { id: 'legende', name: 'Légende vivante', desc: 'Promu au rang S.', bonus: { pvMult: 0.02, dmg: 0.02 } },
    { id: 'souverain', name: 'Souverain', desc: 'Promu au rang SS.', bonus: { dmg: 0.03, pvMult: 0.03, xpMult: 0.05 } },
    { id: 'briseur_portails', name: 'Briseur de portails', desc: 'Terminer 25 portails.', bonus: { xpMult: 0.02 } },
    { id: 'fleau_boss', name: 'Fléau des boss', desc: 'Vaincre 25 boss.', bonus: { dmg: 0.02 } },
    { id: 'lame_vive', name: 'Lame vive', desc: 'Réussir 30 parades parfaites.', bonus: { crit: 0.01 } },
    { id: 'ombre_insaisissable', name: 'Ombre insaisissable', desc: 'Esquiver 200 coups.', bonus: { dodge: 0.01 } },
    { id: 'intouchable', name: 'Intouchable', desc: 'Terminer 3 donjons sans subir un seul coup.', bonus: { dodge: 0.01, defense: 1 } },
    { id: 'massacreur', name: 'Massacreur', desc: 'Éliminer 1 000 monstres.', bonus: { dmg: 0.015 } },
    { id: 'eclair', name: 'Éclair', desc: 'Terminer 5 donjons en moins de 2 min 30.', bonus: { vitesse: 0.1 } },
    { id: 'collectionneur', name: 'Collectionneur', desc: 'Obtenir 5 objets légendaires.', bonus: { lootLuck: 0.02 } },
    { id: 'survivant', name: 'Survivant', desc: 'Relever 10 défaites sans abandonner.', bonus: { pvMult: 0.015 } },
    { id: 'frappe_roc', name: 'Frappe-roc', desc: 'Infliger un coup de 500 dégâts ou plus.', bonus: { critDmg: 0.05 } },
    { id: 'pyromane', name: 'Pyromane', desc: 'Réduire 150 monstres en cendres.', bonus: { cdr: 0.01 } },
    { id: 'coeur_givre', name: 'Cœur de givre', desc: 'Geler 150 monstres à mort.', bonus: { defense: 2 } },
    { id: 'voix_tonnerre', name: 'Voix du tonnerre', desc: 'Foudroyer 150 monstres.', bonus: { vitesse: 0.1 } },
    { id: 'chef_meute', name: 'Chef de meute', desc: 'Faire éliminer 200 monstres par vos serviteurs.', bonus: { minionDmg: 0.05 } },
    { id: 'invocateur', name: 'Invocateur du crépuscule', desc: 'Avoir déclenché le Rituel d’éveil secret.', bonus: { minionDmg: 0.1, pvMult: 0.02 } },
    { id: 'fortune', name: 'Fortuné', desc: 'Amasser 50 000 pièces d’or.', bonus: { goldMult: 0.05 } },
    { id: 'denicheur', name: 'Dénicheur de secrets', desc: 'Découvrir 10 salles secrètes.', bonus: { lootLuck: 0.03 } },
    { id: 'eprouve', name: "L'Éprouvé", desc: 'Réussir 3 épreuves de promotion.', bonus: { pvMult: 0.02, dmg: 0.01 } },
    { id: 'maitre_attributs', name: "Maître de l'équilibre", desc: 'Répartir 60 points d’attributs.', bonus: { defense: 2, dmg: 0.01 } },
  ];

  // ------------------------------------------------------------------
  // ACCOMPLISSEMENTS : {id, name, desc, icon, stat, n, reward:{gold, attrPoints, skillPoints, title}, secret?}
  //  stat : compteur de profile.counters ou stat dérivée (level, rankIndex, attrSpent, clearedCount,
  //         bossesTotal (profile.stats.bosses), killsTotal, achCount)
  // ------------------------------------------------------------------
  const A = (id, name, desc, icon, stat, n, reward, secret) => ({ id, name, desc, icon, stat, n, reward: reward || {}, secret: !!secret });
  const ACHIEVEMENTS = [
    // -- combat de masse
    A('kills_50', 'Premiers pas', 'Éliminer 50 monstres.', '⚔️', 'kills', 50, { gold: 50 }),
    A('kills_250', 'Nettoyeur', 'Éliminer 250 monstres.', '🗡️', 'kills', 250, { gold: 150 }),
    A('kills_1000', 'Massacreur', 'Éliminer 1 000 monstres.', '💀', 'kills', 1000, { gold: 500, attrPoints: 2, title: 'massacreur' }),
    A('kills_5000', 'Fléau des brèches', 'Éliminer 5 000 monstres.', '☠️', 'kills', 5000, { gold: 3000, attrPoints: 3, skillPoints: 1 }),
    A('elite_25', 'Chasseur d’élites', 'Vaincre 25 élites.', '👹', 'eliteKills', 25, { gold: 200, attrPoints: 1 }),
    A('elite_150', 'Briseur d’élites', 'Vaincre 150 élites.', '👺', 'eliteKills', 150, { gold: 1000, attrPoints: 2 }),
    // -- boss
    A('boss_1', 'Premier sang', 'Vaincre un boss.', '🏆', 'bossKills', 1, { gold: 80 }),
    A('boss_5', 'Chasseur de boss', 'Vaincre 5 boss.', '🏅', 'bossKills', 5, { gold: 250 }),
    A('boss_10', 'Tueur de géants', 'Vaincre 10 boss.', '🏅', 'bossKills', 10, { gold: 500, skillPoints: 1 }),
    A('boss_20', 'Fléau des titans', 'Vaincre 20 boss.', '🥇', 'bossKills', 20, { gold: 1000, attrPoints: 2 }),
    A('boss_25', 'Fléau des boss', 'Vaincre 25 boss.', '🥇', 'bossKills', 25, { gold: 1250, title: 'fleau_boss' }),
    A('boss_40', 'Exécuteur', 'Vaincre 40 boss.', '👑', 'bossKills', 40, { gold: 3000, attrPoints: 3, skillPoints: 1 }),
    A('boss_80', 'Fin de règne', 'Vaincre 80 boss.', '👑', 'bossKills', 80, { gold: 9000, attrPoints: 5, skillPoints: 2 }),
    // -- donjons / portails
    A('win_1', 'Brèche refermée', 'Terminer un portail.', '🌀', 'runsWon', 1, { gold: 50 }),
    A('win_10', 'Habitué des portails', 'Terminer 10 portails.', '🌀', 'runsWon', 10, { gold: 300 }),
    A('win_25', 'Briseur de portails', 'Terminer 25 portails.', '🌌', 'runsWon', 25, { gold: 750, attrPoints: 2, title: 'briseur_portails' }),
    A('win_100', 'Maître des portails', 'Terminer 100 portails.', '🌌', 'runsWon', 100, { gold: 4800, attrPoints: 4, skillPoints: 2 }),
    A('cleared_3', 'Explorateur', 'Terminer 3 donjons différents.', '🗺️', 'clearedCount', 3, { gold: 150 }),
    A('cleared_6', 'Cartographe', 'Terminer 6 donjons différents.', '🧭', 'clearedCount', 6, { gold: 600, attrPoints: 2 }),
    A('red_1', 'Portail rouge', 'Terminer un portail rouge.', '🔴', 'redWins', 1, { gold: 400, attrPoints: 1 }),
    A('rooms_100', 'Sans relâche', 'Nettoyer 100 salles.', '🚪', 'roomsCleared', 100, { gold: 250 }),
    A('fast_5', 'Éclair', 'Terminer 5 donjons en moins de 2 min 30.', '⚡', 'fastWins', 5, { gold: 750, title: 'eclair' }),
    // -- maîtrise
    A('flawless_1', 'Sans une égratignure', 'Terminer un donjon sans subir de coup.', '🛡️', 'flawless', 1, { gold: 250 }),
    A('flawless_3', 'Intouchable', 'Terminer 3 donjons sans subir de coup.', '🛡️', 'flawless', 3, { gold: 750, attrPoints: 2, title: 'intouchable' }),
    A('flawless_10', 'Fantôme', 'Terminer 10 donjons sans subir de coup.', '👻', 'flawless', 10, { gold: 3600, attrPoints: 4, skillPoints: 2 }),
    A('parry_30', 'Lame vive', 'Réussir 30 parades parfaites.', '🤺', 'parries', 30, { gold: 300, title: 'lame_vive' }),
    A('dodge_200', 'Ombre insaisissable', 'Esquiver 200 coups.', '💨', 'dodges', 200, { gold: 400, title: 'ombre_insaisissable' }),
    A('crit_300', 'Œil de lynx', 'Infliger 300 coups critiques.', '🎯', 'crits', 300, { gold: 350 }),
    A('hit_500', 'Frappe-roc', 'Infliger un coup de 500 dégâts.', '💥', 'maxHit', 500, { gold: 500, title: 'frappe_roc' }),
    A('hit_2000', 'Coup du destin', 'Infliger un coup de 2 000 dégâts.', '☄️', 'maxHit', 2000, { gold: 2000, attrPoints: 2 }),
    A('cast_500', 'Magicien du dimanche', 'Lancer 500 compétences.', '✨', 'skillCasts', 500, { gold: 300, skillPoints: 1 }),
    A('survivor_10', 'Survivant', 'Subir 10 défaites sans abandonner.', '🩹', 'losses', 10, { gold: 150, title: 'survivant' }),
    // -- éléments
    A('fire_150', 'Pyromane', 'Tuer 150 monstres par le feu.', '🔥', 'kills_feu', 150, { gold: 400, title: 'pyromane' }),
    A('ice_150', 'Cœur de givre', 'Tuer 150 monstres par la glace.', '❄️', 'kills_glace', 150, { gold: 400, title: 'coeur_givre' }),
    A('thunder_150', 'Voix du tonnerre', 'Tuer 150 monstres par la foudre.', '⚡', 'kills_foudre', 150, { gold: 400, title: 'voix_tonnerre' }),
    // -- butin
    A('loot_epic', 'Éclat violet', 'Obtenir un objet épique.', '💜', 'epicLoot', 1, { gold: 150 }),
    A('loot_leg_5', 'Collectionneur', 'Obtenir 5 objets légendaires.', '🧡', 'legendLoot', 5, { gold: 1000, attrPoints: 2, title: 'collectionneur' }),
    A('loot_myth', 'Lueur écarlate', 'Obtenir un objet mythique.', '❤️', 'mythicLoot', 1, { gold: 3000, skillPoints: 1 }),
    A('gold_50k', 'Fortuné', 'Amasser 50 000 pièces d’or.', '💰', 'goldLoot', 50000, { gold: 3000, title: 'fortune' }),
    // -- secrets, épreuves, progression
    A('secret_10', 'Dénicheur de secrets', 'Découvrir 10 salles secrètes.', '🔍', 'secrets', 10, { gold: 750, attrPoints: 2, title: 'denicheur' }),
    A('minions_200', 'Chef de meute', 'Faire éliminer 200 monstres par vos serviteurs.', '🐺', 'minionKills', 200, { gold: 500, title: 'chef_meute' }),
    A('necro', '???', 'Avoir déclenché le Rituel d’éveil secret (0,01 %).', '🌑', 'necroAwakened', 1, { gold: 6000, attrPoints: 5, skillPoints: 2, title: 'invocateur' }, true),
    A('trials_1', 'Première épreuve', 'Réussir une épreuve de promotion.', '📜', 'trials', 1, { gold: 250 }),
    A('trials_3', "L'Éprouvé", 'Réussir 3 épreuves de promotion.', '📜', 'trials', 3, { gold: 1500, attrPoints: 2, title: 'eprouve' }),
    A('trials_5', 'Gravir les échelons', 'Réussir 5 épreuves de promotion.', '🏛️', 'trials', 5, { gold: 6000, attrPoints: 4, skillPoints: 2 }),
    A('attr_60', "Maître de l'équilibre", 'Répartir 60 points d’attributs.', '⚖️', 'attrSpent', 60, { gold: 1000, title: 'maitre_attributs' }),
    A('level_10', 'Chasseur confirmé', 'Atteindre le niveau 10.', '📈', 'level', 10, { gold: 250 }),
    A('level_20', 'Chasseur chevronné', 'Atteindre le niveau 20.', '📈', 'level', 20, { gold: 1000, attrPoints: 1 }),
    A('level_30', 'Sommet', 'Atteindre le niveau 30.', '🏔️', 'level', 30, { gold: 4800, attrPoints: 3, skillPoints: 2 }),
    A('rank_c', 'Aguerri', 'Atteindre le rang C.', '🔷', 'rankIndex', 2, { gold: 500 }),
    A('rank_a', 'Élite', 'Atteindre le rang A.', '🔶', 'rankIndex', 4, { gold: 3000, attrPoints: 2 }),
    A('rank_ss', '??? — Souverain', 'Atteindre le rang Souverain.', '♚', 'rankIndex', 6, { gold: 30000, attrPoints: 5, skillPoints: 3 }, true),
  ];

  G.RANKS = RANKS;
  G.RANKS_TRIALS = RANKS_TRIALS;
  G.RANKS_LEGACY_DUNGEONS = RANKS_LEGACY_DUNGEONS;
  G.TITLES = TITLES;
  G.ACHIEVEMENTS = ACHIEVEMENTS;
})();
