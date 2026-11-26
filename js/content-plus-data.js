window.G = window.G || {};
/* =====================================================================
   js/content-plus-data.js — 7 donjons supplémentaires (un par rang : E, D, C, B, A, S, Z)
   Chaque donjon est unique : architecture (js/content-plus-gfx.js), population, élite, rare,
   créature secrète, mini-boss caché, boss et mécanique, pièges, événements, matériaux.
   Utilise les points d'extension : G.Monsters.define, G.BossInfo.define, G.Events.trapDefs, G.DungeonsMeta.traps.
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  if (!G.Monsters || !G.Monsters.define || !G.BossInfo || !G.BossInfo.define || !G.DUNGEONS) { console.warn('[content-plus] modules de base absents'); return; }
  const M = G.Monsters.define, BI = G.BossInfo, ph3 = BI.ph3;
  const TD = (G.Events && G.Events.trapDefs) || {}, TN = (G.DungeonsMeta && G.DungeonsMeta.traps) || {};
  const trap = (id, name, desc, def) => { TN[id] = { id, name, desc }; TD[id] = def; };
  const mat = (id, name, icon, rar, desc) => BI.addMaterial(id, [name, icon, rar, desc]);
  const boss = (id, o) => BI.define('fin', id, o);
  const mini = (id, o) => BI.define('mini', id, o);
  const D = (o) => { G.DUNGEONS[o.id] = o; };

  /* =================================================================
     RANG E — LES ÉGOUTS DE ROUILLEMONT (poison)
     ================================================================= */
  const E = 'egouts_rouillemont';
  M('egout_egoutier_noye', 'Égoutier noyé', 'E', E, 'flanker', 'melee', { fam: 'goule', icon: '🧟', el: 'poison', weak: { feu: 1.3 }, x: { lunge: { len: 3, windup: 0.5 } }, desc: 'Il nettoyait les égouts. Il y est resté.' });
  M('egout_rat_creve', 'Rat crevé', 'E', E, 'swarm', 'fodder', { fam: 'bete', icon: '🐀', el: 'poison', weak: { feu: 1.3 }, group: [4, 7], desc: 'Gonflé, pelé, toujours affamé.' });
  M('egout_limace_boue', 'Limace de boue', 'E', E, 'crawler', 'melee', { fam: 'liquide', icon: '🐌', el: 'poison', res: { physique: 0.8 }, weak: { feu: 1.5 }, ab: ['poison_trail'], desc: 'Laisse une traînée de boue toxique derrière elle.' });
  M('egout_crapaud_gonfle', 'Crapaud gonflé', 'E', E, 'kiter', 'ranged', { fam: 'bete', icon: '🐸', el: 'poison', stat: { projectile: 'spit', projSpeed: 10 }, weak: { feu: 1.3 }, desc: 'Crache des glaires acides depuis les canalisations.' });
  M('egout_cafard_geant', 'Cafard géant', 'E', E, 'pack', 'fast', { fam: 'insecte', icon: '🪳', el: 'physique', group: [2, 4], desc: 'Rapide, increvable, toujours en groupe.' });
  M('egout_guetteur_tuyaux', 'Guetteur des tuyaux', 'E', E, 'ambusher', 'amb', { fam: 'goule', icon: '🕳️', weak: { feu: 1.3 }, danger: true, x: { hang: 'floor', revealRadius: 3.8, blastRadius: 2.0 }, desc: 'Jaillit d\'une bouche d\'égout quand on passe dessus.' });
  M('egout_gros_egoutier', 'Gros Égoutier', 'E', E, 'brute', 'brute', { cat: 'elite', fam: 'armure', icon: '🪠', aff: ['armored'], el: 'poison', weak: { feu: 1.3 }, x: { slamRadius: 2.0, windup: 0.95 }, desc: 'Ventouse géante, bottes de plomb, très mauvais caractère.' });
  M('egout_rat_dore', 'Rat d\'or', 'E', E, 'fleeing', 'loot', { cat: 'rare', fam: 'bete', icon: '🌟', x: { escapeTime: 13 }, desc: 'Il a avalé les pièces tombées dans les grilles. Attrapez-le !' });
  M('egout_vieille_aux_chats', 'La Vieille aux chats', 'E', E, 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🐈‍⬛', el: 'ombre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Mes chats ont faim… pas de moi.', 'La grille rouillée cache un passage.', 'La Reine ne dort jamais. Ses nids, si.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Elle vit dans les égouts avec cent chats. Elle sait des choses.' });
  M('egout_eboueur_fou', 'Éboueur fou', 'E', E, 'brute', 'brute', { cat: 'dangereux', fam: 'armure', icon: '🗑️', stat: { pv: 60, dmg: 8 }, x: { slamRadius: 2.3, windup: 1.0, recover: 1.1 }, desc: 'Une benne à ordures soudée sur le dos. Il écrase tout.' });
  mini('egout_crocodile_blanc', { name: 'Albâtre', title: 'Le Crocodile Blanc', rank: 'E', icon: '🐊', color: 0xe8f0e0, element: 'poison', summon: 'egout_rat_creve', lore: 'Jeté dans les égouts quand il était petit. Il a beaucoup grandi.', lines: { intro: '…', phase2: 'CLAC.', death: '…' }, mech: ['Cuirasse', 'Son dos est blindé : frappez-le de face quand il ouvre la gueule.'], strategy: 'De dos, ses écailles bloquent.', atk: [['charge', 'slam'], ['charge', 'slam', 'poison_pools']], mechOpts: { front: { half: 1.2 } }, rewards: [['boue_toxique', 0.5, [1, 2]]] });
  mat('boue_toxique', 'Boue toxique', '🟢', 'rare', 'Une boue verte qui ronge le métal. Prise aux Égouts de Rouillemont.');
  mat('couronne_de_rongeur', 'Couronne de rongeur', '👑', 'epique', 'Couronne de ferraille portée par la Reine des Rats.');
  boss('egout_reine_des_rats', { name: 'Mère-Ronge', title: 'La Reine des Rats', rank: 'E', icon: '🐀', color: 0x9adf6a, element: 'poison', speed: 2.5, resist: { poison: 0.5 }, weak: { feu: 1.5 }, summon: 'egout_rat_creve',
    lore: 'Une rate devenue énorme à force de dévorer les déchets de la ville. Elle porte une couronne de ferraille et chaque rat des égouts lui obéit.',
    lines: { intro: 'Mes enfants… à table.', phase2: 'Plus de nids ! Plus de petits !', phase3: 'JE SUIS LA VILLE D\'EN DESSOUS !', death: 'Mes… petits…' },
    mech: ['Nids grouillants', 'Des nids de détritus la protègent, la soignent et crachent des rats. Détruisez-les pour l\'étourdir.'],
    strategy: 'Détruisez les nids (le feu est efficace), puis frappez-la pendant qu\'elle est étourdie. Esquivez ses ruées en zigzag.',
    phases: ph3([[1, ['zigzag_rush', 'slam', 'summon'], 1], [0.66, ['zigzag_rush', 'poison_pools', 'slam', 'summon'], 1.12], [0.33, ['zigzag_rush', 'poison_pools', 'spread', 'slam', 'stun_roar'], 1.28, 1.1, 0.85]], { phase2: 'Plus de nids ! Plus de petits !', phase3: 'JE SUIS LA VILLE D\'EN DESSOUS !' }, 'La Reine des Rats'),
    mechOpts: { links: { kind: 'add', model: 'boss_bourgeon', n: [2, 3, 3], R: 8.5, hp: 0.05, armorPer: 0.2, healPer: 0.003, regrow: [20, 17, 14], beam: 0x9adf6a, color: 0x9adf6a, spawn: { every: 9, max: 4 }, onAll: { stagger: 6, chip: 0.04, text: 'NIDS DÉTRUITS' } } },
    rewards: [['boue_toxique', 0.8, [1, 3]], ['couronne_de_rongeur', 0.3, [1, 1]], ['coeur_pierre', 0.4, [1, 2]]],
    gear: { id: 'couronne_ferraille', slot: 'casque', name: 'Couronne de Ferraille', icon: '👑', classes: null, rankReq: 'E', rarity: 'epique', shares: { pvMax: 0.4, defense: 0.3, force: 0.3 }, effect: { id: 'pulsation', name: 'Pulsation', desc: 'Toutes les 4 s, un battement vous soigne de 1,5 % de vos PV max.' } } });
  trap('vannes_ouvertes', 'Vannes ouvertes', 'Une vague d\'eau sale vous pousse.', { eng: 'push', every: [11, 15], dur: 3, force: 2.2, sound: 'eau_monte' });
  trap('gaz_egout', 'Gaz d\'égout', 'Des nuages verts s\'échappent des grilles.', { eng: 'cloud', every: [8, 11], r: 2.2, pct: 0.04, life: 7, color: 0x9adf6a, element: 'poison', sound: 'grisou' });
  trap('grilles_piegees', 'Grilles piégées', 'Certaines grilles cèdent sous vos pieds.', { eng: 'hidden', count: 5, r: 0.8, root: 1.4, pct: 0.08, color: 0x6a6a60, sound: 'racines' });
  trap('canalisations_percees', 'Canalisations percées', 'Des jets de boue brûlante jaillissent des tuyaux.', { eng: 'pulse', spots: 'near', every: [4, 6], r: 1.4, pct: 0.09, element: 'poison', color: 0x7acf4a, sound: 'geyser_lave', n: 2 });
  D({ id: E, name: 'Les Égouts de Rouillemont', icon: '🐀', rank: 'E', type: 'classique', theme: E, tint: null, element: 'poison', ambience: 'amb_mine', music: 'mus_mine',
    desc: 'Des tunnels de brique sous la ville, un canal de boue verte, des tuyaux qui gargouillent… et des milliers d\'yeux rouges dans le noir.',
    lore: 'Rouillemont jette tout dans ses égouts depuis trois siècles. Un jour, les égoutiers ont cessé de remonter. Les rats, eux, sont devenus plus gros.',
    ambiance: 'Gouttes, canal de boue luisante, grilles rouillées, tuyaux qui crachent de la vapeur, couinements.',
    monsters: ['egout_egoutier_noye', 'egout_rat_creve', 'egout_limace_boue', 'egout_crapaud_gonfle', 'egout_cafard_geant', 'egout_guetteur_tuyaux'],
    elites: ['egout_gros_egoutier'], rares: ['egout_rat_dore'], secretCreature: 'egout_vieille_aux_chats', minibosses: [], hiddenMiniboss: 'egout_crocodile_blanc', boss: 'egout_reine_des_rats',
    fallback: { monsters: ['slime', 'chauve_souris', 'squelette'], elites: ['squelette_elite'], minibosses: [], boss: 'golem', rares: ['specimen_dore'], secretCreature: 'mimique', hiddenMiniboss: 'golem' },
    rooms: { min: 4, max: 5 }, mechanics: [], traps: ['vannes_ouvertes', 'gaz_egout', 'grilles_piegees', 'canalisations_percees'],
    secrets: { kinds: ['mur', 'levier'], hint: 'Une grille rouillée grince quand on la frappe…', puzzle: null },
    events: [{ id: 'chats_de_la_vieille', name: 'Les chats de la vieille', icon: '🐈‍⬛', kind: 'apparition', desc: 'Une procession de chats noirs vous dépasse sans un bruit.' }, { id: 'tresor_des_grilles', name: 'Trésor des grilles', icon: '🪙', kind: 'tresor', desc: 'Des pièces tombées de la ville brillent au fond du canal.' }],
    horror: { level: 0.35, statue: 'mineur' },
    rewards: { gold: [22, 50], xp: 50, lootTier: 1, guaranteed: ['materiau_poison'], exclusive: ['boue_toxique', 'couronne_de_rongeur'], secret: ['couronne_de_rongeur'], bossGear: ['couronne_ferraille'] } });

  /* =================================================================
     RANG D — LE MARAIS DES PENDUS (ombre)
     ================================================================= */
  const DM = 'marais_pendus';
  M('marais_pendu', 'Pendu', 'D', DM, 'teleporter', 'melee', { fam: 'spectre', icon: '🪢', el: 'ombre', res: { ombre: 0.6 }, weak: { sacre: 1.5 }, desc: 'Il se balance encore… puis apparaît derrière vous.' });
  M('marais_noye', 'Noyé du marais', 'D', DM, 'brute', 'melee', { fam: 'goule', icon: '🧟', el: 'glace', res: { glace: 0.5 }, weak: { feu: 1.4 }, desc: 'Lent, gorgé d\'eau, il agrippe et ne lâche plus.' });
  M('marais_sangsue', 'Sangsue des tourbières', 'D', DM, 'crawler', 'melee', { fam: 'liquide', icon: '🪱', el: 'poison', ab: ['lifesteal'], weak: { feu: 1.4 }, x: { lunge: { len: 3, windup: 0.5 } }, desc: 'Se soigne en buvant votre sang.' });
  M('marais_feu_follet', 'Feu follet', 'D', DM, 'kiter', 'caster', { fam: 'spectre', icon: '🔵', el: 'ombre', stat: { projectile: 'orb', projSpeed: 11 }, weak: { sacre: 1.4 }, desc: 'Une petite flamme bleue qui vous attire vers l\'eau profonde.' });
  M('marais_corbeau_gibet', 'Corbeau du gibet', 'D', DM, 'swarm', 'fodder', { fam: 'bete', icon: '🐦‍⬛', el: 'ombre', group: [3, 5], desc: 'Ils picorent les pendus. Et ceux qui passent.' });
  M('marais_crapaud_buffle', 'Crapaud-buffle', 'D', DM, 'charger', 'fast', { fam: 'bete', icon: '🐸', el: 'poison', stat: { range: 9, attackCd: 2.8 }, weak: { feu: 1.3 }, desc: 'Énorme, il charge en bondissant.' });
  M('marais_juge_pendu', 'Juge pendu', 'D', DM, 'summoner', 'tank', { cat: 'elite', fam: 'spectre', icon: '⚖️', aff: ['shielded', 'summoner'], el: 'ombre', weak: { sacre: 1.4 }, x: { summon: 'marais_corbeau_gibet', summonCount: 2, summonMax: 4 }, desc: 'Il a condamné tout le village. Le village l\'a pendu en retour.' });
  M('marais_grenouille_or', 'Grenouille d\'or', 'D', DM, 'fleeing', 'loot', { cat: 'rare', fam: 'bete', icon: '🌟', x: { escapeTime: 13 }, desc: 'Une grenouille en or massif qui saute de nénuphar en nénuphar.' });
  M('marais_passeuse', 'La Passeuse', 'D', DM, 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🛶', el: 'ombre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Une pièce pour la traversée…', 'Le troisième gibet n\'a pas de corde. Regarde dessous.', 'Le bourreau a peur de l\'eau claire.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Elle fait traverser le marais aux âmes perdues.' });
  M('marais_chose_tourbe', 'Chose de la tourbe', 'D', DM, 'stalker', 'stalk', { cat: 'dangereux', fam: 'goule', icon: '🌿', el: 'poison', stat: { pv: 65, dmg: 9 }, weak: { feu: 1.5 }, desc: 'Un amas de racines et de boue qui vous suit sans bruit.' });
  mini('marais_sorciere_tourbe', { name: 'Morgause', title: 'La Sorcière de la Tourbe', rank: 'D', icon: '🧙‍♀️', color: 0x6aa080, element: 'poison', summon: 'marais_sangsue', lore: 'Elle vend des remèdes aux pendus. Ils ne se plaignent jamais.', lines: { intro: 'Un remède, mon petit ?', phase2: 'Bois, bois donc !', death: 'Ma… potion…' }, mech: ['Chaudron', 'Elle se soigne dans ses flaques.'], strategy: 'Éloignez-la de ses flaques.', atk: [['poison_pools', 'spread'], ['poison_pools', 'spread', 'summon']], mechOpts: { pools: { heal: 0.008 } }, rewards: [['tourbe_maudite', 0.5, [1, 2]]] });
  mat('tourbe_maudite', 'Tourbe maudite', '🟫', 'rare', 'Une motte de tourbe qui murmure. Prise au Marais des Pendus.');
  mat('corde_de_gibet', 'Corde de gibet', '🪢', 'epique', 'Une corde qui ne s\'est jamais rompue.');
  boss('marais_bourreau_noye', { name: 'Gorvald', title: 'Le Bourreau Noyé', rank: 'D', icon: '🪓', color: 0x5a8a9a, element: 'ombre', speed: 2.3, resist: { ombre: 0.5, glace: 0.3 }, weak: { sacre: 1.4, feu: 1.2 }, summon: 'marais_pendu',
    lore: 'Le bourreau du village a été noyé dans le marais par ceux qu\'il devait pendre. Il sort encore de l\'eau pour finir son travail.',
    lines: { intro: 'Le jugement… a été rendu.', phase2: 'La brume est ma cagoule.', phase3: 'TOUS AU GIBET !', death: 'Enfin… libéré.' },
    mech: ['Brume du marais', 'Il disparaît dans la brume et ne réapparaît que pour frapper. Le feu, la foudre et le sacré le révèlent.'],
    strategy: 'Quand il disparaît, lancez un sort de feu, de foudre ou de sacré pour le révéler. Restez loin de ses chaînes.',
    phases: ph3([[1, ['chain_pull', 'mn_axe', 'slam'], 1], [0.66, ['chain_pull', 'mn_axe', 'dark_zone', 'slam'], 1.1], [0.33, ['chain_pull', 'mn_axe', 'dark_zone', 'summon', 'stun_roar'], 1.25, 1.1, 0.85]], { phase2: 'La brume est ma cagoule.', phase3: 'TOUS AU GIBET !' }, 'Le Bourreau Noyé'),
    mechOpts: { hidden: { every: 13, dur: 4 }, front: { half: 1.1 } },
    rewards: [['tourbe_maudite', 0.8, [1, 3]], ['corde_de_gibet', 0.3, [1, 1]], ['os_ancien', 0.4, [1, 2]]],
    gear: { id: 'hache_du_noye', slot: 'arme', name: 'Hache du Noyé', icon: '🪓', classes: ['Guerrier', 'Paladin', 'Assassin', 'Necromancien'], rankReq: 'D', rarity: 'epique', shares: { force: 0.5, crit: 0.25, pvMax: 0.25 }, effect: { id: 'sang_ecorche', name: 'Soif écorchée', desc: 'Sous 50 % de PV, vos dégâts sont augmentés de 25 %.' } } });
  trap('eau_profonde', 'Eau profonde', 'Le marais monte et vous ralentit.', { eng: 'flood', every: [13, 18], dur: 6, slow: 0.65, sound: 'eau_monte' });
  trap('brume_des_pendus', 'Brume des pendus', 'Une brume épaisse cache tout.', { eng: 'dark', every: [12, 17], dur: [3, 4], soft: 0.35, sound: 'murmure' });
  trap('sables_mouvants', 'Sables mouvants', 'Le sol se dérobe sous vos pieds.', { eng: 'pit', every: [7, 10], r: 1.4, pct: 0.09, life: 7, dps: 11, sound: 'eboulement' });
  trap('lianes_noyees', 'Lianes noyées', 'Des lianes jaillissent de l\'eau et vous retiennent.', { eng: 'root', every: [6, 9], r: 1.5, root: 1.3, pct: 0.06, color: 0x3a5a3a, sound: 'racines' });
  D({ id: DM, name: 'Le Marais des Pendus', icon: '🪢', rank: 'D', type: 'classique', theme: DM, tint: null, element: 'ombre', ambience: 'amb_foret', music: 'mus_foret',
    desc: 'Une tourbière noyée de brume, des arbres morts tordus et des gibets à perte de vue. Les cordes se balancent sans vent.',
    lore: 'Le village de Morte-Eau pendait ses condamnés au-dessus du marais. Un hiver, il a pendu tout le monde. Puis le marais a tout englouti.',
    ambiance: 'Eau noire, nénuphars, gibets grinçants, lanternes bleues, corbeaux, brume au ras de l\'eau.',
    monsters: ['marais_pendu', 'marais_noye', 'marais_sangsue', 'marais_feu_follet', 'marais_corbeau_gibet', 'marais_crapaud_buffle'],
    elites: ['marais_juge_pendu'], rares: ['marais_grenouille_or'], secretCreature: 'marais_passeuse', minibosses: [], hiddenMiniboss: 'marais_sorciere_tourbe', boss: 'marais_bourreau_noye',
    fallback: { monsters: ['squelette', 'chauve_souris', 'slime_moussu'], elites: ['squelette_elite'], minibosses: [], boss: 'skeletonKing', rares: ['specimen_dore'], secretCreature: 'mimique', hiddenMiniboss: 'golem' },
    rooms: { min: 4, max: 6 }, mechanics: ['brouillard'], traps: ['eau_profonde', 'brume_des_pendus', 'sables_mouvants', 'lianes_noyees'],
    secrets: { kinds: ['symbole', 'mur'], hint: 'Un gibet n\'a pas de corde…', puzzle: null },
    events: [{ id: 'procession_noyes', name: 'Procession des noyés', icon: '🕯️', kind: 'apparition', desc: 'Des silhouettes portant des cierges traversent l\'eau sans s\'y enfoncer.' }, { id: 'barque_echouee', name: 'Barque échouée', icon: '🛶', kind: 'tresor', desc: 'Une barque pleine de vieilles offrandes.' }],
    horror: { level: 0.55, statue: 'epouvantail' },
    rewards: { gold: [66, 130], xp: 130, lootTier: 2, guaranteed: ['materiau_commun'], exclusive: ['tourbe_maudite', 'corde_de_gibet'], secret: ['corde_de_gibet'], bossGear: ['hache_du_noye'] } });

  /* =================================================================
     RANG C — LA FORGE ENGLOUTIE (feu)
     ================================================================= */
  const FC = 'forge_engloutie';
  M('forge_forgeron_calcine', 'Forgeron calciné', 'C', FC, 'brute', 'melee', { fam: 'armure', icon: '🔨', el: 'feu', res: { feu: 0.6 }, weak: { glace: 1.4 }, x: { slamRadius: 1.8, windup: 0.8 }, desc: 'Il frappe encore l\'enclume… et tout ce qui bouge.' });
  M('forge_automate_bronze', 'Automate de bronze', 'C', FC, 'guardian', 'tank', { fam: 'pierre', icon: '🤖', el: 'physique', res: { physique: 0.6, feu: 0.6 }, weak: { foudre: 1.5, glace: 1.2 }, desc: 'Une machine de guerre à vapeur, lente mais increvable.' });
  M('forge_salamandre', 'Salamandre de forge', 'C', FC, 'flanker', 'fast', { fam: 'bete', icon: '🦎', el: 'feu', res: { feu: 0.7 }, weak: { glace: 1.4 }, x: { lunge: { len: 3.6, windup: 0.4 } }, desc: 'Elle nage dans la lave et en sort pour mordre.' });
  M('forge_escarbille', 'Escarbille', 'C', FC, 'swarm', 'fodder', { fam: 'spectre', icon: '🔥', el: 'feu', group: [3, 6], weak: { glace: 1.5 }, desc: 'Une étincelle vivante qui explose au contact.' });
  M('forge_chien_fonte', 'Chien de fonte', 'C', FC, 'pack', 'fast', { fam: 'bete', icon: '🐕', el: 'feu', res: { physique: 0.8 }, weak: { glace: 1.3 }, group: [2, 3], desc: 'Coulé dans le métal en fusion, il chasse en meute.' });
  M('forge_souffleur', 'Souffleur de verre', 'C', FC, 'kiter', 'ranged', { fam: 'goule', icon: '🫧', el: 'feu', stat: { projectile: 'orb', projSpeed: 12 }, x: { burst: 3 }, weak: { glace: 1.3 }, desc: 'Il souffle des bulles de verre en fusion.' });
  M('forge_contremaitre_fer', 'Contremaître de fer', 'C', FC, 'brute', 'brute', { cat: 'elite', fam: 'armure', icon: '⚙️', aff: ['enrage', 'armored'], el: 'feu', res: { feu: 0.6 }, weak: { glace: 1.3 }, x: { slamRadius: 2.3, windup: 1.0 }, desc: 'Il fouette les ouvriers avec une chaîne chauffée à blanc.' });
  M('forge_lingot_vivant', 'Lingot vivant', 'C', FC, 'fleeing', 'loot', { cat: 'rare', fam: 'pierre', icon: '🌟', res: { physique: 0.8 }, x: { escapeTime: 14 }, desc: 'Un lingot d\'or qui a appris à courir.' });
  M('forge_apprenti', 'L\'Apprenti', 'C', FC, 'secret', 'passive', { cat: 'secret', fam: 'goule', icon: '🧒', el: 'feu', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Le maître ne doit pas savoir que je suis là.', 'La grande roue dentée cache une porte.', 'Son marteau perd sa force quand l\'eau froide le touche.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Le seul ouvrier qui a gardé un visage.' });
  M('forge_coulee_vivante', 'Coulée vivante', 'C', FC, 'stalker', 'stalk', { cat: 'dangereux', fam: 'liquide', icon: '🌋', el: 'feu', stat: { pv: 70, dmg: 11 }, res: { feu: 0.9 }, weak: { glace: 1.6 }, desc: 'Du métal en fusion qui rampe vers vous.' });
  mini('forge_marteau_pilon', { name: 'Marteau-Pilon', title: 'Le Marteau-Pilon', rank: 'C', icon: '🔩', color: 0xff8a3a, element: 'feu', summon: 'forge_escarbille', lore: 'Une presse géante qui a décidé de presser autre chose que du métal.', lines: { intro: 'BOUM. BOUM.', phase2: 'PRESSION MAXIMALE.', death: 'Pschhh…' }, mech: ['Plaque frontale', 'De face, sa plaque bloque vos coups.'], strategy: 'Frappez ses flancs et son dos.', atk: [['slam', 'mn_cannon'], ['slam', 'mn_cannon', 'fire_wall']], mechOpts: { front: { half: 1.3 } }, rewards: [['scorie_ardente', 0.5, [1, 2]]] });
  mat('scorie_ardente', 'Scorie ardente', '🟠', 'rare', 'Un résidu de forge toujours brûlant. Pris à la Forge Engloutie.');
  mat('marteau_sans_visage', 'Éclat du Marteau', '🔨', 'epique', 'Un éclat du marteau du Forgeron Sans Visage.');
  boss('forge_forgeron_sans_visage', { name: 'Brann', title: 'Le Forgeron Sans Visage', rank: 'C', icon: '⚒️', color: 0xff7a2a, element: 'feu', speed: 2.1, resist: { feu: 0.6 }, weak: { glace: 1.5 }, summon: 'forge_escarbille',
    lore: 'Il a voulu forger l\'arme parfaite et a donné son visage au métal pour l\'obtenir. Depuis, il forge des enclumes vivantes qui le protègent.',
    lines: { intro: 'Tu seras mon prochain chef-d\'œuvre.', phase2: 'Le métal chante !', phase3: 'TREMPE-TOI DANS LA LAVE !', death: 'Mon… visage…' },
    mech: ['Enclumes ardentes', 'Trois enclumes tournent autour de lui et absorbent vos coups. Brisez-les pour l\'étourdir.'],
    strategy: 'Cassez les enclumes qui tournent autour de lui (la glace est très efficace), puis frappez-le. Ne restez pas dans les fissures de lave.',
    phases: ph3([[1, ['slam', 'pc_fissure', 'gg_spark'], 1], [0.66, ['slam', 'pc_fissure', 'pc_lava_bomb', 'gg_spark'], 1.12], [0.33, ['pc_fissure', 'pc_lava_bomb', 'fire_wall', 'slam', 'stun_roar'], 1.3, 1.12, 0.8]], { phase2: 'Le métal chante !', phase3: 'TREMPE-TOI DANS LA LAVE !' }, 'Le Forgeron Sans Visage'),
    mechOpts: { shield: { n: [3, 3, 4], hp: 0.05, orbit: 1.0, stagger: 6, regrow: 18 } },
    rewards: [['scorie_ardente', 0.8, [1, 3]], ['marteau_sans_visage', 0.3, [1, 1]], ['coeur_pierre', 0.5, [1, 2]]],
    gear: { id: 'marteau_du_forgeron', slot: 'arme', name: 'Marteau du Forgeron', icon: '🔨', classes: ['Guerrier', 'Paladin'], rankReq: 'C', rarity: 'legendaire', shares: { force: 0.45, defense: 0.25, pvMax: 0.3 }, effect: { id: 'chaine_ardente', name: 'Chaîne ardente', desc: 'Toutes les 4 s, vos coups déclenchent une explosion de feu autour de vous (4× vos dégâts).' } } });
  trap('jets_de_vapeur', 'Jets de vapeur', 'Des tuyaux crachent de la vapeur brûlante.', { eng: 'pulse', spots: 'near', every: [3.5, 5], r: 1.5, pct: 0.1, element: 'feu', color: 0xffd0a0, sound: 'geyser_lave', n: 2 });
  trap('pluie_de_scories', 'Pluie de scories', 'Des scories tombent des cheminées.', { eng: 'fall', fall: 'braise', every: [3, 4.5], r: 1.3, pct: 0.08, near: 4, sound: 'geyser_lave', color: 0xff8a2a, n: 3 });
  trap('chaines_de_levage', 'Chaînes de levage', 'De lourdes chaînes balaient la salle.', { eng: 'blades', count: 2, sound: 'chaine' });
  trap('soufflets', 'Soufflets géants', 'Un souffle brûlant vous repousse.', { eng: 'push', every: [11, 15], dur: 3, force: 2.3, sound: 'murmure' });
  D({ id: FC, name: 'La Forge Engloutie', icon: '⚒️', rank: 'C', type: 'classique', theme: FC, tint: null, element: 'feu', ambience: 'amb_abime', music: 'mus_abime',
    desc: 'Une forge naine engloutie sous la montagne : canaux de lave, enclumes géantes, roues dentées et cheminées qui crachent des étincelles.',
    lore: 'Les forgerons de Brann-Dur ont creusé trop profond pour trouver le métal parfait. Ils l\'ont trouvé. Il les a fondus avec lui.',
    ambiance: 'Lave qui coule, coups de marteau lointains, vapeur, roues qui grincent, étincelles.',
    monsters: ['forge_forgeron_calcine', 'forge_automate_bronze', 'forge_salamandre', 'forge_escarbille', 'forge_chien_fonte', 'forge_souffleur'],
    elites: ['forge_contremaitre_fer'], rares: ['forge_lingot_vivant'], secretCreature: 'forge_apprenti', minibosses: [], hiddenMiniboss: 'forge_marteau_pilon', boss: 'forge_forgeron_sans_visage',
    fallback: { monsters: ['squelette', 'chauve_souris', 'slime'], elites: ['squelette_elite'], minibosses: [], boss: 'golem', rares: ['specimen_dore'], secretCreature: 'mimique', hiddenMiniboss: 'golem' },
    rooms: { min: 5, max: 6 }, mechanics: [], traps: ['jets_de_vapeur', 'pluie_de_scories', 'chaines_de_levage', 'soufflets'],
    secrets: { kinds: ['mur', 'levier'], hint: 'Une roue dentée tourne à l\'envers…', puzzle: null },
    events: [{ id: 'coulee_d_or', name: 'Coulée d\'or', icon: '🪙', kind: 'tresor', desc: 'Un creuset renversé laisse couler de l\'or encore tiède.' }, { id: 'marteaux_fantomes', name: 'Marteaux fantômes', icon: '🔨', kind: 'apparition', desc: 'Des marteaux frappent seuls sur les enclumes, en rythme.' }],
    horror: { level: 0.45, statue: 'armure' },
    rewards: { gold: [118, 222], xp: 205, lootTier: 3, guaranteed: ['materiau_forge_rare'], exclusive: ['scorie_ardente', 'marteau_sans_visage'], secret: ['marteau_sans_visage'], bossGear: ['marteau_du_forgeron'] } });

  /* =================================================================
     RANG B — LE DÉSERT DE VERRE (foudre / sacré)
     ================================================================= */
  const DV = 'desert_verre';
  M('desert_momie_sable', 'Momie des sables', 'B', DV, 'brute', 'melee', { fam: 'goule', icon: '🧟', el: 'physique', res: { poison: 0.5 }, weak: { feu: 1.5 }, desc: 'Ses bandelettes cachent du verre à la place des os.' });
  M('desert_scorpion_verre', 'Scorpion de verre', 'B', DV, 'flanker', 'fast', { fam: 'insecte', icon: '🦂', el: 'foudre', res: { physique: 0.7 }, weak: { glace: 1.3 }, x: { lunge: { len: 3.8, windup: 0.4 } }, desc: 'Transparent comme un vitrail, sa queue est chargée d\'éclairs.' });
  M('desert_vautour_solaire', 'Vautour solaire', 'B', DV, 'swarm', 'fodder', { fam: 'bete', icon: '🦅', el: 'feu', group: [3, 5], desc: 'Il plonge depuis le soleil aveuglant.' });
  M('desert_djinn_mirage', 'Djinn du mirage', 'B', DV, 'teleporter', 'caster', { fam: 'spectre', icon: '🧞', el: 'foudre', stat: { projectile: 'orb', projSpeed: 13 }, weak: { glace: 1.3 }, desc: 'Il apparaît et disparaît comme un mirage.' });
  M('desert_ver_sables', 'Ver des sables', 'B', DV, 'ambusher', 'amb', { fam: 'bete', icon: '🪱', el: 'physique', danger: true, x: { hang: 'floor', revealRadius: 4.0, blastRadius: 2.4 }, desc: 'Il jaillit du sable sous vos pieds.' });
  M('desert_pretre_solaire', 'Prêtre solaire', 'B', DV, 'support', 'caster', { fam: 'spectre', icon: '☀️', el: 'sacre', x: { healPct: 0.25 }, weak: { ombre: 1.4 }, desc: 'Il prie le soleil de verre et soigne les morts.' });
  M('desert_gardien_obelisque', 'Gardien d\'obélisque', 'B', DV, 'statue', 'tank', { cat: 'elite', fam: 'pierre', icon: '🗿', aff: ['armored', 'shielded'], el: 'sacre', res: { physique: 0.6 }, weak: { foudre: 1.3 }, x: { revealRadius: 3.4, slamRadius: 2.2 }, desc: 'Un colosse à tête de chacal qui garde les obélisques.' });
  M('desert_scarabee_or', 'Scarabée d\'or', 'B', DV, 'fleeing', 'loot', { cat: 'rare', fam: 'insecte', icon: '🌟', x: { escapeTime: 13 }, desc: 'Un scarabée sacré tout en or. Il fuit vers le soleil.' });
  M('desert_marchand_mirage', 'Le Marchand du mirage', 'B', DV, 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🐪', el: 'sacre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Je vends de l\'eau. Elle n\'existe pas.', 'L\'obélisque brisé montre le chemin.', 'Le Pharaon craint les obélisques éteints.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Est-il vraiment là ?' });
  M('desert_tempete_vivante', 'Tempête vivante', 'B', DV, 'hunter', 'hunt', { cat: 'dangereux', fam: 'spectre', icon: '🌪️', el: 'foudre', stat: { pv: 75, dmg: 11 }, weak: { glace: 1.4 }, desc: 'Un tourbillon de sable et de verre qui vous traque.' });
  mini('desert_sphinx_brise', { name: 'Sphinx', title: 'Le Sphinx Brisé', rank: 'B', icon: '🦁', color: 0xe8c878, element: 'sacre', summon: 'desert_vautour_solaire', lore: 'Il posait des énigmes. Plus personne ne répond.', lines: { intro: 'Qui marche sur quatre pattes…', phase2: 'Mauvaise réponse.', death: 'La réponse… était…' }, mech: ['Sceaux d\'énigme', 'Des sceaux apparaissent au sol.'], strategy: 'Entrez dans les sceaux à temps.', atk: [['beam_sweep', 'slam'], ['beam_sweep', 'slam', 'spike_line']], mechOpts: { sigils: { every: 15, n: 2 } }, rewards: [['sable_de_verre', 0.5, [1, 2]]] });
  mat('sable_de_verre', 'Sable de verre', '🔶', 'rare', 'Du sable fondu en verre par la foudre. Pris au Désert de Verre.');
  mat('oeil_du_pharaon', 'Œil du Pharaon', '👁️', 'epique', 'Un œil de verre qui regarde toujours le soleil.');
  boss('desert_pharaon_verre', { name: 'Ankh-Iris', title: 'Le Pharaon de Verre', rank: 'B', icon: '☀️', color: 0xffd86a, element: 'foudre', speed: 2.2, resist: { foudre: 0.5, sacre: 0.4 }, weak: { glace: 1.4, ombre: 1.2 }, summon: 'desert_momie_sable',
    lore: 'Un roi qui voulait vivre aussi longtemps que le soleil. Ses prêtres l\'ont changé en verre pour qu\'il dure. La foudre du désert le traverse depuis mille ans.',
    lines: { intro: 'Agenouille-toi devant le soleil.', phase2: 'Mes obélisques brûlent pour moi !', phase3: 'JE SUIS LE MIDI ÉTERNEL !', death: 'Le soleil… se couche…' },
    mech: ['Obélisques solaires', 'Trois obélisques le protègent. Éteignez-les en restant à côté d\'eux, puis frappez.'],
    strategy: 'Approchez-vous des obélisques pour les éteindre (sa protection baisse à chaque obélisque éteint). Fuyez ses rayons qui tournent.',
    phases: ph3([[1, ['beam_sweep', 'spike_line', 'summon'], 1], [0.66, ['beam_sweep', 'laser_spin', 'spike_line', 'tornado'], 1.12], [0.33, ['laser_spin', 'beam_sweep', 'meteor_rain', 'tornado', 'stun_roar'], 1.28, 1.12, 0.8]], { phase2: 'Mes obélisques brûlent pour moi !', phase3: 'JE SUIS LE MIDI ÉTERNEL !' }, 'Le Pharaon de Verre'),
    mechOpts: { pylons: { n: 3, armor: 0.5 } },
    rewards: [['sable_de_verre', 0.8, [1, 3]], ['oeil_du_pharaon', 0.3, [1, 1]], ['fragment_de_faille', 0.3, [1, 1]]],
    gear: { id: 'sceptre_solaire', slot: 'arme', name: 'Sceptre Solaire', icon: '🔆', classes: ['Mage', 'Elementaliste', 'Paladin', 'Necromancien'], rankReq: 'B', rarity: 'legendaire', shares: { intelligence: 0.45, manaMax: 0.2, cdr: 0.15, crit: 0.2 }, effect: { id: 'regard_neant', name: 'Regard du néant', desc: 'Toutes les 10 s, votre prochain coup inflige le double de dégâts.' } } });
  trap('tempete_de_sable', 'Tempête de sable', 'Le vent vous pousse et cache la vue.', { eng: 'push', every: [11, 15], dur: 4, force: 2.2, dark: true, sound: 'murmure' });
  trap('eclairs_secs', 'Éclairs secs', 'La foudre frappe le verre au sol.', { eng: 'fall', fall: 'etoile', every: [3, 4.5], r: 1.8, pct: 0.11, near: 3.5, sound: 'etoile_filante', color: 0xfff0a0, n: 2 });
  trap('sable_ardent', 'Sable ardent', 'Le sable brûle par endroits.', { eng: 'pulse', spots: 'near', every: [3.5, 5], r: 1.5, pct: 0.1, element: 'feu', color: 0xffa040, sound: 'glyphe', n: 2 });
  trap('fosses_de_sable', 'Fosses de sable', 'Des trous s\'ouvrent dans les dunes.', { eng: 'pit', every: [7, 10], r: 1.5, pct: 0.1, life: 6, dps: 14, sound: 'eboulement' });
  D({ id: DV, name: 'Le Désert de Verre', icon: '☀️', rank: 'B', type: 'classique', theme: DV, tint: null, element: 'foudre', ambience: 'amb_observatoire', music: 'mus_temple',
    desc: 'Des dunes de sable doré parsemées d\'éclats de verre, des obélisques brisés et des statues à demi enterrées sous un soleil blanc.',
    lore: 'La foudre tombe sans arrêt sur le désert d\'Ishar et fond le sable en verre. Au centre, un pharaon de verre attend que le soleil s\'arrête.',
    ambiance: 'Sable qui crisse, verre qui scintille, chaleur tremblante, éclairs secs au loin.',
    monsters: ['desert_momie_sable', 'desert_scorpion_verre', 'desert_vautour_solaire', 'desert_djinn_mirage', 'desert_ver_sables', 'desert_pretre_solaire'],
    elites: ['desert_gardien_obelisque'], rares: ['desert_scarabee_or'], secretCreature: 'desert_marchand_mirage', minibosses: [], hiddenMiniboss: 'desert_sphinx_brise', boss: 'desert_pharaon_verre',
    fallback: { monsters: ['squelette', 'squelette_archer', 'chauve_souris'], elites: ['squelette_elite'], minibosses: [], boss: 'skeletonKing', rares: ['specimen_dore'], secretCreature: 'mimique', hiddenMiniboss: 'golem' },
    rooms: { min: 5, max: 6 }, mechanics: [], traps: ['tempete_de_sable', 'eclairs_secs', 'sable_ardent', 'fosses_de_sable'],
    secrets: { kinds: ['symbole', 'levier'], hint: 'Un obélisque brisé montre une direction…', puzzle: null },
    events: [{ id: 'oasis_mirage', name: 'L\'oasis', icon: '🌴', kind: 'apparition', desc: 'Une oasis apparaît à l\'horizon… puis disparaît.' }, { id: 'tombe_ouverte', name: 'Tombe ouverte', icon: '⚱️', kind: 'tresor', desc: 'Le vent a dégagé une petite tombe pleine d\'offrandes.' }],
    horror: { level: 0.45, statue: 'masque' },
    rewards: { gold: [176, 320], xp: 300, lootTier: 4, guaranteed: ['materiau_rare'], exclusive: ['sable_de_verre', 'oeil_du_pharaon'], secret: ['oeil_du_pharaon'], bossGear: ['sceptre_solaire'] } });

  /* =================================================================
     RANG A — LA RUCHE ABYSSALE (poison)
     ================================================================= */
  const RA = 'ruche_abyssale';
  M('ruche_ouvriere', 'Ouvrière abyssale', 'A', RA, 'swarm', 'fodder', { fam: 'insecte', icon: '🐝', el: 'poison', group: [4, 6], weak: { feu: 1.4 }, desc: 'Elles volent en nuage et piquent toutes ensemble.' });
  M('ruche_soldat_chitine', 'Soldat chitineux', 'A', RA, 'brute', 'melee', { fam: 'insecte', icon: '🪲', el: 'physique', res: { physique: 0.7 }, weak: { feu: 1.3 }, x: { slamRadius: 1.9, windup: 0.8 }, desc: 'Une carapace épaisse et des mandibules comme des cisailles.' });
  M('ruche_larve', 'Larve', 'A', RA, 'crawler', 'melee', { fam: 'liquide', icon: '🐛', el: 'poison', ab: ['poison_trail'], weak: { feu: 1.5 }, desc: 'Molle et collante, elle laisse un sillage de miel acide.' });
  M('ruche_cracheuse', 'Cracheuse d\'acide', 'A', RA, 'kiter', 'ranged', { fam: 'insecte', icon: '🦗', el: 'poison', stat: { projectile: 'spit', projSpeed: 12 }, x: { burst: 2 }, weak: { feu: 1.3 }, desc: 'Elle crache de l\'acide depuis les alvéoles.' });
  M('ruche_nourrice', 'Nourrice', 'A', RA, 'support', 'caster', { fam: 'insecte', icon: '🍯', el: 'poison', x: { healPct: 0.3 }, weak: { feu: 1.4 }, desc: 'Elle nourrit les soldats de gelée royale et les soigne.' });
  M('ruche_bourdon_blinde', 'Bourdon blindé', 'A', RA, 'charger', 'tank', { fam: 'insecte', icon: '🐞', el: 'physique', res: { physique: 0.6 }, stat: { range: 10, attackCd: 2.6 }, weak: { foudre: 1.3 }, desc: 'Lourd comme un rocher, il fonce droit devant lui.' });
  M('ruche_garde_royale', 'Garde royale', 'A', RA, 'guardian', 'tank', { cat: 'elite', fam: 'insecte', icon: '🛡️', aff: ['armored', 'enrage'], el: 'poison', res: { physique: 0.6 }, weak: { feu: 1.3 }, desc: 'Elle ne quitte jamais l\'entrée de la chambre royale.' });
  M('ruche_abeille_ambre', 'Abeille d\'ambre', 'A', RA, 'fleeing', 'loot', { cat: 'rare', fam: 'insecte', icon: '🌟', x: { escapeTime: 12 }, desc: 'Une abeille figée dans l\'ambre… qui s\'est réveillée.' });
  M('ruche_reine_dechue', 'La Reine déchue', 'A', RA, 'secret', 'passive', { cat: 'secret', fam: 'insecte', icon: '🦋', el: 'poison', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['C\'était ma ruche, avant elle.', 'Les œufs éclosent si on les laisse.', 'Brûle les cocons, et l\'Essaim faiblira.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'L\'ancienne reine, chassée par l\'Essaim.' });
  M('ruche_essaim_vivant', 'Essaim vivant', 'A', RA, 'hunter', 'hunt', { cat: 'dangereux', fam: 'insecte', icon: '🌫️', el: 'poison', stat: { pv: 80, dmg: 12 }, weak: { feu: 1.6 }, desc: 'Un nuage d\'insectes qui a pris la forme d\'un homme.' });
  mini('ruche_matriarche_larves', { name: 'Matriarche', title: 'La Matriarche des Larves', rank: 'A', icon: '🐛', color: 0xe8d040, element: 'poison', summon: 'ruche_larve', lore: 'Elle pond. Elle ne fait que pondre.', lines: { intro: 'Mes petites… mangez.', phase2: 'Encore des œufs !', death: 'Mes… œufs…' }, mech: ['Toile de miel', 'Du miel collant ralentit.'], strategy: 'Évitez les flaques de miel.', atk: [['web_trap', 'summon'], ['web_trap', 'summon', 'poison_pools']], mechOpts: { webs: { color: 0xe8b030 } }, rewards: [['gelee_royale', 0.5, [1, 2]]] });
  mat('gelee_royale', 'Gelée royale noire', '🍯', 'rare', 'Une gelée sombre et sucrée. Prise à la Ruche Abyssale.');
  mat('dard_de_reine', 'Dard de reine', '🗡️', 'epique', 'Le dard de la Reine-Essaim, encore chargé de venin.');
  boss('ruche_reine_essaim', { name: 'Vespera', title: 'La Reine-Essaim', rank: 'A', icon: '🐝', color: 0xe8d040, element: 'poison', speed: 2.4, resist: { poison: 0.6 }, weak: { feu: 1.5 }, summon: 'ruche_ouvriere',
    lore: 'Une reine venue des profondeurs a pris la ruche. Elle pond sans arrêt des cocons d\'où sortent des soldats, et chaque cocon la nourrit.',
    lines: { intro: 'Tu entres dans mon nid. Tu deviens nourriture.', phase2: 'Éclosez, mes enfants !', phase3: 'L\'ESSAIM NE MEURT JAMAIS !', death: 'L\'essaim… se disperse…' },
    mech: ['Cocons', 'Des cocons la protègent et la soignent. S\'ils éclosent, ils libèrent des soldats et la soignent : détruisez-les avant !'],
    strategy: 'Détruisez les cocons avant qu\'ils éclosent (le feu est très efficace). Esquivez la pluie d\'acide et ne restez pas dans les flaques.',
    phases: ph3([[1, ['zigzag_rush', 'jm_acid_rain', 'summon'], 1], [0.66, ['zigzag_rush', 'jm_acid_rain', 'web_trap', 'poison_pools'], 1.12], [0.33, ['zigzag_rush', 'jm_acid_rain', 'web_trap', 'poison_pools', 'stun_roar'], 1.3, 1.12, 0.8]], { phase2: 'Éclosez, mes enfants !', phase3: 'L\'ESSAIM NE MEURT JAMAIS !' }, 'La Reine-Essaim'),
    mechOpts: { links: { kind: 'add', model: 'boss_bourgeon', n: [3, 3, 4], R: 8.5, hp: 0.035, armorPer: 0.18, healPer: 0.002, regrow: [18, 15, 12], beam: 0xe8d040, color: 0xe8b030, bloom: { time: 16, heal: 0.03, spawn: 2 }, onAll: { stagger: 6, chip: 0.04, text: 'COCONS DÉTRUITS' } } },
    rewards: [['gelee_royale', 0.8, [1, 3]], ['dard_de_reine', 0.3, [1, 1]], ['graine_de_chair', 0.3, [1, 2]]],
    gear: { id: 'dard_essaim', slot: 'arme', name: 'Dard de l\'Essaim', icon: '🗡️', classes: ['Voleur', 'Assassin', 'Archer'], rankReq: 'A', rarity: 'legendaire', shares: { agilite: 0.45, crit: 0.3, critDmg: 0.25 }, effect: { id: 'baiser_ecarlate', name: 'Baiser écarlate', desc: 'Vous vous soignez de 4 % des dégâts infligés.' } } });
  trap('miel_collant', 'Miel collant', 'Du miel coule des alvéoles et vous englue.', { eng: 'flood', every: [13, 18], dur: 6, slow: 0.6, sound: 'eau_monte' });
  trap('nuee', 'Nuée', 'Un nuage d\'insectes traverse la salle.', { eng: 'cloud', every: [8, 11], r: 2.4, pct: 0.045, life: 7, color: 0xe8d040, element: 'poison', sound: 'grisou' });
  trap('alveoles_piegees', 'Alvéoles piégées', 'Des alvéoles crachent de l\'acide.', { eng: 'pulse', spots: 'near', every: [3.5, 5], r: 1.4, pct: 0.11, element: 'poison', color: 0xc8e040, sound: 'veine_pulse', n: 3 });
  trap('cocons_eclos', 'Cocons qui éclosent', 'Des cocons s\'ouvrent et libèrent des larves.', { eng: 'spawn', spots: 'near', every: [10, 14], n: [1, 2], max: 3, sound: 'veine_pulse', pick: 'ruche_larve' });
  D({ id: RA, name: 'La Ruche Abyssale', icon: '🐝', rank: 'A', type: 'horde', theme: RA, tint: null, element: 'poison', ambience: 'amb_jardin', music: 'mus_jardin',
    desc: 'Une ruche géante creusée dans la roche : murs d\'alvéoles hexagonales, rivières de miel noir, cocons suspendus et bourdonnement permanent.',
    lore: 'Les apiculteurs de Melisse récoltaient le miel le plus pur du royaume. Puis la ruche a creusé vers le bas, et quelque chose est remonté.',
    ambiance: 'Bourdonnement, miel qui goutte, alvéoles luisantes, cocons qui bougent, chaleur moite.',
    monsters: ['ruche_ouvriere', 'ruche_soldat_chitine', 'ruche_larve', 'ruche_cracheuse', 'ruche_nourrice', 'ruche_bourdon_blinde'],
    elites: ['ruche_garde_royale'], rares: ['ruche_abeille_ambre'], secretCreature: 'ruche_reine_dechue', minibosses: [], hiddenMiniboss: 'ruche_matriarche_larves', boss: 'ruche_reine_essaim',
    fallback: { monsters: ['araignee', 'slime_moussu', 'chauve_souris_foret'], elites: ['araignee_elite'], minibosses: [], boss: 'spiderQueen', rares: ['specimen_dore'], secretCreature: 'mimique', hiddenMiniboss: 'spiderQueen' },
    rooms: { min: 5, max: 7 }, mechanics: [], traps: ['miel_collant', 'nuee', 'alveoles_piegees', 'cocons_eclos'],
    secrets: { kinds: ['mur', 'symbole'], hint: 'Une alvéole ne contient pas de miel…', puzzle: null },
    events: [{ id: 'danse_des_abeilles', name: 'La danse', icon: '🐝', kind: 'apparition', desc: 'Des abeilles dessinent une flèche dans l\'air.' }, { id: 'rayon_dore', name: 'Rayon doré', icon: '🍯', kind: 'tresor', desc: 'Un rayon de miel doré, intact, plein de trésors pris au piège.' }],
    horror: { level: 0.6, statue: 'oeil' },
    rewards: { gold: [230, 420], xp: 370, lootTier: 5, guaranteed: ['materiau_poison'], exclusive: ['gelee_royale', 'dard_de_reine'], secret: ['dard_de_reine'], bossGear: ['dard_essaim'] } });

  /* =================================================================
     RANG S — LE CIMETIÈRE DES NAVIRES (glace / ombre)
     ================================================================= */
  const NS = 'cimetiere_navires';
  M('navire_matelot_noye', 'Matelot noyé', 'S', NS, 'flanker', 'melee', { fam: 'goule', icon: '🧟', el: 'glace', res: { glace: 0.6 }, weak: { foudre: 1.4 }, x: { lunge: { len: 3.4, windup: 0.45 } }, desc: 'Il a coulé avec son navire. Il cherche un nouvel équipage.' });
  M('navire_pirate_spectral', 'Pirate spectral', 'S', NS, 'teleporter', 'melee', { fam: 'spectre', icon: '🏴‍☠️', el: 'ombre', res: { physique: 0.7 }, weak: { sacre: 1.5 }, desc: 'Sabre au clair, il traverse les coques.' });
  M('navire_crabe_abysses', 'Crabe des abysses', 'S', NS, 'guardian', 'tank', { fam: 'bete', icon: '🦀', el: 'glace', res: { physique: 0.6 }, weak: { foudre: 1.4 }, desc: 'Une carapace couverte de bernacles et de pinces énormes.' });
  M('navire_mouette_squelette', 'Mouette-squelette', 'S', NS, 'swarm', 'fodder', { fam: 'os', icon: '🐦', el: 'ombre', group: [3, 5], weak: { sacre: 1.3 }, desc: 'Des os, des plumes trempées et un cri strident.' });
  M('navire_artilleur', 'Artilleur fantôme', 'S', NS, 'turret', 'caster', { fam: 'spectre', icon: '💣', el: 'feu', stat: { projectile: 'orb', projSpeed: 12, range: 13, attackCd: 3 }, weak: { glace: 1.3 }, desc: 'Il tire encore au canon sur les navires qui passent.' });
  M('navire_sirene', 'Sirène', 'S', NS, 'kiter', 'caster', { fam: 'spectre', icon: '🧜‍♀️', el: 'glace', stat: { projectile: 'orb', projSpeed: 12 }, x: { burst: 3 }, weak: { foudre: 1.4 }, desc: 'Son chant glace le sang.' });
  M('navire_second_capitaine', 'Le Second', 'S', NS, 'brute', 'brute', { cat: 'elite', fam: 'armure', icon: '⚓', aff: ['enrage', 'armored'], el: 'glace', weak: { foudre: 1.3 }, x: { slamRadius: 2.4, windup: 1.0 }, desc: 'Il frappe avec une ancre comme avec un fléau.' });
  M('navire_coffre_vivant', 'Coffre vivant', 'S', NS, 'fleeing', 'loot', { cat: 'rare', fam: 'pierre', icon: '🌟', x: { escapeTime: 12 }, desc: 'Un coffre au trésor qui court sur des pattes de crabe.' });
  M('navire_mousse', 'Le Mousse', 'S', NS, 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '🧒', el: 'glace', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Le capitaine ne sait pas qu\'il est mort.', 'La cale du troisième navire n\'est pas inondée.', 'Il perd ses forces quand la mer se retire.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Le plus jeune de l\'équipage. Il a peur.' });
  M('navire_noyeur', 'Le Noyeur', 'S', NS, 'stalker', 'stalk', { cat: 'dangereux', fam: 'spectre', icon: '🌊', el: 'glace', stat: { pv: 85, dmg: 13 }, weak: { foudre: 1.5 }, desc: 'Une silhouette d\'eau qui vous entraîne au fond.' });
  mini('navire_figure_de_proue', { name: 'Figure de proue', title: 'La Figure de Proue', rank: 'S', icon: '🧜', color: 0x6ac8e8, element: 'glace', summon: 'navire_mouette_squelette', lore: 'Sculptée pour guider le navire. Elle guide maintenant les noyés.', lines: { intro: 'Cap… sur les rochers.', phase2: 'Coulez avec moi !', death: 'Bois… pourri…' }, mech: ['Riposte', 'Elle riposte quand elle brille.'], strategy: 'Ne la frappez pas quand elle brille.', atk: [['cm_tide_wave', 'slam'], ['cm_tide_wave', 'slam', 'ring_gap']], mechOpts: { riposte: { every: 10, dur: 3 } }, rewards: [['sel_noir', 0.5, [1, 2]]] });
  mat('sel_noir', 'Sel noir', '🧂', 'rare', 'Du sel de mer noir comme l\'encre. Pris au Cimetière des Navires.');
  mat('boussole_maudite', 'Boussole maudite', '🧭', 'legendaire', 'Une boussole qui indique toujours le naufrage le plus proche.');
  boss('navire_capitaine_sans_repos', { name: 'Morvan', title: 'Le Capitaine Sans-Repos', rank: 'S', icon: '🏴‍☠️', color: 0x4ac8e8, element: 'glace', speed: 2.4, resist: { glace: 0.6, ombre: 0.4 }, weak: { foudre: 1.4, sacre: 1.2 }, summon: 'navire_matelot_noye',
    lore: 'Il a fait couler cent navires pour un trésor qui n\'existait pas. La mer l\'a gardé, avec tous ses équipages, sur ce cimetière de coques.',
    lines: { intro: 'Bienvenue à bord, moussaillon.', phase2: 'Tout l\'équipage sur le pont !', phase3: 'QUE LA MER VOUS AVALE !', death: 'Enfin… le port…' },
    mech: ['Marée et équipage', 'La mer monte et réduit le pont. Des reflets de son équipage apparaissent : détruisez-les.'],
    strategy: 'Restez au centre quand la mer monte. Détruisez vite ses reflets. Esquivez les boulets de canon.',
    phases: ph3([[1, ['mn_cannon', 'chain_pull', 'slam'], 1], [0.66, ['mn_cannon', 'cm_tide_wave', 'chain_pull', 'blade_grid'], 1.12], [0.33, ['mn_cannon', 'cm_tide_wave', 'tornado', 'blade_grid', 'stun_roar'], 1.3, 1.12, 0.8]], { phase2: 'Tout l\'équipage sur le pont !', phase3: 'QUE LA MER VOUS AVALE !' }, 'Le Capitaine Sans-Repos'),
    mechOpts: { collapse: { from: 14, to: [14, 12, 10.5], dps: 0.08 }, echoes: { n: [0, 2, 2], every: 22 } },
    rewards: [['sel_noir', 0.8, [1, 3]], ['boussole_maudite', 0.25, [1, 1]], ['cendre_infernale', 0.3, [1, 1]]],
    gear: { id: 'tricorne_du_capitaine', slot: 'casque', name: 'Tricorne du Capitaine', icon: '🎩', classes: null, rankReq: 'S', rarity: 'legendaire', shares: { pvMax: 0.3, crit: 0.25, force: 0.2, agilite: 0.25 }, effect: { id: 'maree_montante', name: 'Marée montante', desc: 'Chaque esquive réussie restaure 12 points de mana.' } } });
  trap('houle', 'Houle', 'Le pont tangue et vous fait glisser.', { eng: 'push', every: [10, 14], dur: 3.5, force: 2.4, sound: 'eau_monte' });
  trap('boulets_perdus', 'Boulets perdus', 'Des boulets de canon tombent du ciel.', { eng: 'fall', fall: 'rocher', every: [3, 4.5], r: 1.6, pct: 0.12, near: 3.5, sound: 'eboulement', color: 0x2a2a30, n: 2 });
  trap('planches_pourries', 'Planches pourries', 'Le pont cède par endroits.', { eng: 'pit', every: [7, 10], r: 1.3, pct: 0.11, life: 6, dps: 16, sound: 'eboulement', square: true });
  trap('brouillard_marin', 'Brouillard marin', 'Un brouillard glacé avale la lumière.', { eng: 'dark', every: [12, 16], dur: [3, 4], sound: 'murmure' });
  D({ id: NS, name: 'Le Cimetière des Navires', icon: '⚓', rank: 'S', type: 'classique', theme: NS, tint: null, element: 'glace', ambience: 'amb_cathedrale', music: 'mus_cathedrale',
    desc: 'Des épaves échouées les unes sur les autres au milieu d\'une mer noire, reliées par des ponts de cordes, sous un brouillard glacé.',
    lore: 'Tous les navires qui cherchaient le trésor du Capitaine Morvan ont fini ici. Leurs équipages n\'ont jamais quitté le bord.',
    ambiance: 'Bois qui craque, vagues contre les coques, voiles déchirées, lanternes bleues, cloche de bateau au loin.',
    monsters: ['navire_matelot_noye', 'navire_pirate_spectral', 'navire_crabe_abysses', 'navire_mouette_squelette', 'navire_artilleur', 'navire_sirene'],
    elites: ['navire_second_capitaine'], rares: ['navire_coffre_vivant'], secretCreature: 'navire_mousse', minibosses: [], hiddenMiniboss: 'navire_figure_de_proue', boss: 'navire_capitaine_sans_repos',
    fallback: { monsters: ['squelette', 'squelette_archer', 'chauve_souris'], elites: ['squelette_elite'], minibosses: [], boss: 'lich', rares: ['specimen_dore'], secretCreature: 'mimique', hiddenMiniboss: 'golem' },
    rooms: { min: 6, max: 7 }, mechanics: [], traps: ['houle', 'boulets_perdus', 'planches_pourries', 'brouillard_marin'],
    secrets: { kinds: ['mur', 'levier'], hint: 'Une cale sonne creux…', puzzle: null },
    events: [{ id: 'navire_fantome_passe', name: 'Le navire fantôme', icon: '⛵', kind: 'apparition', desc: 'Un navire tout illuminé passe en silence dans le brouillard.' }, { id: 'tresor_englouti', name: 'Trésor englouti', icon: '💰', kind: 'tresor', desc: 'Un coffre remonte à la surface, porté par des mains blanches.' }],
    horror: { level: 0.75, statue: 'ange' },
    rewards: { gold: [320, 590], xp: 480, lootTier: 5, guaranteed: ['materiau_rare'], exclusive: ['sel_noir', 'boussole_maudite'], secret: ['boussole_maudite'], bossGear: ['tricorne_du_capitaine'] } });

  /* =================================================================
     RANG Z — LE PALAIS DES MIROIRS (sacré / ombre)
     ================================================================= */
  const PZ = 'palais_miroirs';
  M('miroir_reflet', 'Reflet', 'Z', PZ, 'flanker', 'melee', { fam: 'spectre', icon: '🪞', el: 'sacre', res: { sacre: 0.6 }, weak: { ombre: 1.4 }, x: { lunge: { len: 3.6, windup: 0.4 } }, desc: 'Il a votre visage. Il a vos gestes. En plus rapide.' });
  M('miroir_eclat', 'Éclat de miroir', 'Z', PZ, 'swarm', 'fodder', { fam: 'pierre', icon: '🔷', el: 'physique', group: [4, 6], weak: { foudre: 1.3 }, desc: 'Des morceaux de verre qui volent en essaim.' });
  M('miroir_ange_verre', 'Ange de verre', 'Z', PZ, 'kiter', 'caster', { fam: 'spectre', icon: '👼', el: 'sacre', stat: { projectile: 'orb', projSpeed: 14 }, x: { burst: 3 }, weak: { ombre: 1.4 }, desc: 'Ses ailes de verre renvoient la lumière en rayons.' });
  M('miroir_spectre_prisme', 'Spectre prismatique', 'Z', PZ, 'teleporter', 'caster', { fam: 'spectre', icon: '🌈', el: 'foudre', stat: { projectile: 'orb', projSpeed: 13 }, weak: { ombre: 1.3 }, desc: 'Il se décompose en lumière et réapparaît ailleurs.' });
  M('miroir_chevalier_argent', 'Chevalier d\'argent', 'Z', PZ, 'guardian', 'tank', { fam: 'armure', icon: '🛡️', el: 'sacre', res: { physique: 0.6, sacre: 0.6 }, weak: { ombre: 1.4 }, desc: 'Son armure est un miroir : vos sorts s\'y reflètent.' });
  M('miroir_voyeur', 'Voyeur', 'Z', PZ, 'weeping', 'melee', { fam: 'spectre', icon: '👁️', el: 'ombre', weak: { sacre: 1.4 }, desc: 'Il ne bouge que quand vous ne le regardez pas.' });
  M('miroir_le_double', 'Le Double', 'Z', PZ, 'brute', 'brute', { cat: 'elite', fam: 'spectre', icon: '👥', aff: ['enrage', 'shielded'], el: 'ombre', weak: { sacre: 1.3 }, x: { slamRadius: 2.4, windup: 0.9 }, desc: 'Votre reflet le plus sombre, sorti du miroir.' });
  M('miroir_miroir_or', 'Miroir d\'or', 'Z', PZ, 'fleeing', 'loot', { cat: 'rare', fam: 'pierre', icon: '🌟', x: { escapeTime: 12 }, desc: 'Un miroir au cadre d\'or qui s\'enfuit à petits pas.' });
  M('miroir_princesse', 'La Princesse du miroir', 'Z', PZ, 'secret', 'passive', { cat: 'secret', fam: 'spectre', icon: '👸', el: 'sacre', x: { secretMode: 'talk', fightAi: 'kiter', lines: ['Je suis prisonnière de ce côté.', 'Le seul miroir sans reflet est une porte.', 'Le Roi ne supporte pas de voir son vrai visage.'] }, stat: { projectile: 'orb', range: 9 }, desc: 'Elle frappe doucement de l\'autre côté du verre.' });
  M('miroir_devoreur_reflets', 'Dévoreur de reflets', 'Z', PZ, 'hunter', 'hunt', { cat: 'dangereux', fam: 'spectre', icon: '🕳️', el: 'ombre', stat: { pv: 90, dmg: 14 }, weak: { sacre: 1.5 }, desc: 'Une forme sans reflet qui mange les images.' });
  mini('miroir_narcisse', { name: 'Narcisse', title: 'Narcisse', rank: 'Z', icon: '🌼', color: 0xf0e8ff, element: 'sacre', summon: 'miroir_eclat', lore: 'Il s\'est tant admiré qu\'il est entré dans le miroir.', lines: { intro: 'Regarde comme je suis beau.', phase2: 'Ne me cache pas !', death: 'Mon… reflet…' }, mech: ['Reflets', 'Il crée des copies de lui.'], strategy: 'Frappez le vrai (il ne brille pas).', atk: [['clones', 'beam_sweep'], ['clones', 'beam_sweep', 'laser_spin']], mechOpts: { echoes: { n: [2, 3], every: 18 } }, rewards: [['verre_prismatique', 0.5, [1, 2]]] });
  mat('verre_prismatique', 'Verre prismatique', '💠', 'epique', 'Un verre qui décompose la lumière en sept couleurs. Pris au Palais des Miroirs.');
  mat('couronne_reflet', 'Couronne du Reflet', '👑', 'legendaire', 'La couronne du Roi Reflet. Elle n\'a pas de reflet.');
  boss('miroir_roi_reflet', { name: 'Speculum', title: 'Le Roi Reflet', rank: 'Z', icon: '🪞', color: 0xf0e8ff, element: 'sacre', speed: 2.6, resist: { sacre: 0.5, ombre: 0.3 }, weak: { ombre: 1.2 }, summon: 'miroir_reflet',
    lore: 'Le roi a enfermé son vrai visage dans un miroir pour rester beau à jamais. Il règne désormais sur un palais de reflets, et son vrai visage le cherche.',
    lines: { intro: 'Mire-toi en moi… et disparais.', phase2: 'Mille rois, et un seul toi.', phase3: 'BRISE-TOI CONTRE MA LUMIÈRE !', death: 'Mon vrai… visage…' },
    mech: ['Prisme et reflets', 'Il change de couleur : seul l\'élément de sa couleur le blesse vraiment. Il crée aussi des reflets de lui-même.'],
    strategy: 'Regardez sa couleur et utilisez l\'élément qui correspond. Détruisez ses reflets. Fuyez les rayons qui tournent.',
    phases: ph3([[1, ['laser_spin', 'beam_sweep', 'ce_mirror_step'], 1], [0.66, ['laser_spin', 'beam_sweep', 'clones', 'oq_star_burst'], 1.12], [0.33, ['laser_spin', 'beam_sweep', 'oq_star_burst', 'clones', 'stun_roar'], 1.3, 1.12, 0.8]], { phase2: 'Mille rois, et un seul toi.', phase3: 'BRISE-TOI CONTRE MA LUMIÈRE !' }, 'Le Roi Reflet'),
    mechOpts: { prism: { every: 12, els: ['feu', 'glace', 'foudre', 'sacre'] }, echoes: { n: [2, 2, 3], every: 22 } },
    rewards: [['verre_prismatique', 0.8, [1, 3]], ['couronne_reflet', 0.2, [1, 1]], ['eclat_neant', 0.4, [1, 2]]],
    gear: { id: 'miroir_du_roi', slot: 'amulette', name: 'Miroir du Roi', icon: '🪞', classes: null, rankReq: 'Z', rarity: 'mythique', shares: { intelligence: 0.25, force: 0.25, crit: 0.25, pvMax: 0.25 }, effect: { id: 'regard_neant', name: 'Regard du néant', desc: 'Toutes les 10 s, votre prochain coup inflige le double de dégâts.' } } });
  trap('rayons_reflechis', 'Rayons réfléchis', 'Des rayons de lumière rebondissent entre les miroirs.', { eng: 'arrows', count: 3, sound: 'etoile_filante' });
  trap('miroirs_qui_tombent', 'Miroirs qui tombent', 'Des miroirs se détachent et éclatent au sol.', { eng: 'fall', fall: 'eclat', every: [3.5, 5], r: 1.5, pct: 0.11, near: 3.5, sound: 'glace_craque', color: 0xe8f0ff, n: 3 });
  trap('reflet_trompeur', 'Reflet trompeur', 'Le palais vous téléporte vers un autre miroir.', { eng: 'teleport', every: [8, 12], r: 1.8, sound: 'faille' });
  trap('eclat_aveuglant', 'Éclat aveuglant', 'Une lumière blanche vous aveugle.', { eng: 'dark', every: [12, 16], dur: [2, 3], sound: 'murmure' });
  D({ id: PZ, name: 'Le Palais des Miroirs', icon: '🪞', rank: 'Z', type: 'classique', theme: PZ, tint: null, element: 'sacre', ambience: 'amb_observatoire', music: 'mus_observatoire',
    desc: 'Un palais de marbre blanc où chaque mur est un miroir. Le sol de cristal renvoie mille reflets… et certains ne vous suivent pas.',
    lore: 'Le roi Speculum a fait recouvrir son palais de miroirs pour ne jamais perdre de vue sa beauté. Un jour, son reflet a refusé de bouger.',
    ambiance: 'Marbre blanc, miroirs à l\'infini, lustres de cristal, lumière arc-en-ciel, verre qui tinte.',
    monsters: ['miroir_reflet', 'miroir_eclat', 'miroir_ange_verre', 'miroir_spectre_prisme', 'miroir_chevalier_argent', 'miroir_voyeur'],
    elites: ['miroir_le_double'], rares: ['miroir_miroir_or'], secretCreature: 'miroir_princesse', minibosses: [], hiddenMiniboss: 'miroir_narcisse', boss: 'miroir_roi_reflet',
    fallback: { monsters: ['squelette', 'squelette_archer', 'chauve_souris'], elites: ['squelette_elite'], minibosses: [], boss: 'demon', rares: ['specimen_dore'], secretCreature: 'mimique', hiddenMiniboss: 'golem' },
    rooms: { min: 6, max: 8 }, mechanics: [], traps: ['rayons_reflechis', 'miroirs_qui_tombent', 'reflet_trompeur', 'eclat_aveuglant'],
    secrets: { kinds: ['symbole', 'mur'], hint: 'Un miroir ne vous renvoie pas votre reflet…', puzzle: null },
    events: [{ id: 'bal_des_reflets', name: 'Le bal des reflets', icon: '💃', kind: 'apparition', desc: 'Dans les miroirs, des couples dansent une valse silencieuse.' }, { id: 'coffre_de_cristal', name: 'Coffre de cristal', icon: '💎', kind: 'tresor', desc: 'Un coffre transparent rempli de bijoux.' }],
    horror: { level: 0.8, statue: 'ange' },
    rewards: { gold: [520, 910], xp: 720, lootTier: 6, guaranteed: ['eclat_neant', 'objet_mythique'], exclusive: ['verre_prismatique', 'couronne_reflet'], secret: ['couronne_reflet'], bossGear: ['miroir_du_roi'] } });

  // enregistrement final : matériaux + équipements de boss, mécaniques 'mech_<id>'
  try { BI.registerItems(); } catch (e) { console.warn('[content-plus] objets', e); }
  try { if (G.BossAttacks && G.BossAttacks.ensureMechs) G.BossAttacks.ensureMechs(); } catch (e) { console.warn('[content-plus] mécaniques', e); }
  G.ContentPlus = { dungeons: [E, DM, FC, DV, RA, NS, PZ] };
})();
