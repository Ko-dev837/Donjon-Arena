/* =====================================================================
 *  Donjon Arena 3D v3 — Rôle 10 : G.BOSSES (30 boss : 6 v2 enrichis + 24 nouveaux)
 *  Format §9 + extensions :
 *    phases:[{n, at, attacks:[ids G.BossAttacks|natifs], speedMult, dmgMult?, cdMult?, banner?}]
 *    mechanic:'mech_<id>' (G.BossAttacks), mechanicName, mechanicDesc, strategy,
 *    rank, miniboss, secret, legendary, trial, loot:[{id,kind,chance,qty,rarity?}], intro:{...}
 *  Attaques natives v2 : rock slam wave summon charge spread nova rain.
 *  Attaques G.BossAttacks : beam_sweep laser_spin meteor_rain clones crystal_shield dark_zone leap_chain
 *    blade_grid tornado fire_wall chain_pull zigzag_rush pillar_summon inverse_wave stun_roar ally_mark
 *    poison_pools web_trap spike_line ring_gap
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  // (v3 équilibrage) pv/dmg calés sur le DPS du joueur par rang (boss ≈ 40-60 s au niveau attendu), xp/or sur l'économie par run.
  // Le boss n'est PLUS re-mis à l'échelle par G.Monsters.scale (voir _rank dans def()) : ces valeurs sont les valeurs finales.
  const RK = {
    //   pv      dmg  speed  xp     gold          cristal d'éveil
    E:  { pv: 950,    dmg: 7,   sp: 2.0, xp: 60,   gold: [20, 30],    cr: 0.010 },
    D:  { pv: 3400,  dmg: 18,  sp: 2.3, xp: 126,  gold: [48, 72],    cr: 0.015 },
    C:  { pv: 8000,  dmg: 32,  sp: 2.4, xp: 195,  gold: [96, 144],   cr: 0.020 },
    B:  { pv: 14500,  dmg: 50,  sp: 2.2, xp: 270,  gold: [170, 250],  cr: 0.030 },
    A:  { pv: 23000, dmg: 75,  sp: 2.3, xp: 360,  gold: [265, 395],  cr: 0.040 },
    S:  { pv: 42000, dmg: 105, sp: 2.5, xp: 450,  gold: [410, 610],  cr: 0.060 },
    Z: { pv: 66000, dmg: 140, sp: 2.6, xp: 600,  gold: [600, 900],  cr: 0.100 },
  };
  const PH = (...rows) => rows.map((r, i) => ({ n: i + 1, at: r[0], attacks: r[1], speedMult: r[2], dmgMult: r[3] || 1, cdMult: r[4] || 1, banner: r[5] || null }));
  const rng3 = (a, b, c) => [a, b, c];
  const BOSSES = {};
  const MON = {};

  /** crée un boss (rank → valeurs par défaut) */
  function def(id, o) {
    const r = RK[o.rank] || RK.E;
    const mini = !!o.miniboss;
    const pvMul = o.pvMul != null ? o.pvMul : (mini ? 0.45 : 1);
    const b = {
      id, name: o.name, title: o.title || '', model: o.model || id, rank: o.rank, _rank: o.rank,
      pv: Math.round(r.pv * pvMul), speed: o.speed || r.sp, dmg: Math.round(r.dmg * (o.dmgMul || 1) * (mini ? 0.85 : 1)),
      xp: Math.round(r.xp * (mini ? 0.4 : 1)), gold: mini ? [Math.round(r.gold[0] * 0.4), Math.round(r.gold[1] * 0.4)] : r.gold.slice(),
      element: o.element || 'physique', resist: o.resist || {}, weak: o.weak || {},
      attackCd: o.attackCd || (2.9 - ['E', 'D', 'C', 'B', 'A', 'S', 'Z'].indexOf(o.rank) * 0.1),
      summon: o.summon || 'squelette', phase2At: 0.5, scale: o.scale || 1, music: o.music || 'boss' + Math.min(6, 1 + ['E', 'D', 'C', 'B', 'A', 'S', 'Z'].indexOf(o.rank)),
      mechanic: 'mech_' + id, mechanicName: o.mech[0], mechanicDesc: o.mech[1], strategy: o.strategy,
      phases: o.phases, miniboss: mini, secret: !!o.secret, legendary: !!o.legendary, trial: !!o.trial,
      intro: o.intro || { zoom: mini ? 1.15 : 1.3, color: 0xff4040, duration: mini ? 2.0 : 2.8, roar: true },
      icon: o.icon || '👹', color: o.color || 0xff4040,
    };
    // compat v2 : liste d'attaques à plat
    const flat = []; b.phases.forEach(p => p.attacks.forEach(a => { if (flat.indexOf(a) < 0) flat.push(a); }));
    b.attacks = flat;
    // butin : coeur + cristal d'éveil (rare) + essence + équipement
    const cr = r.cr * (mini ? 0.35 : 1);
    b.loot = [
      { id: 'coeur_boss', kind: 'material', chance: mini ? 0.5 : 1, qty: mini ? [1, 1] : [1, 2] },
      { id: 'essence_' + (b.element === 'physique' ? 'brute' : b.element), kind: 'material', chance: 0.6, qty: [1, 3] },
      { id: 'cristal_eveil', kind: 'material', chance: cr, qty: [1, 1], rare: true },
      { kind: 'item', rarity: o.rank === 'Z' ? 'mythique' : (['S', 'A'].indexOf(o.rank) >= 0 ? 'legendaire' : (['B', 'C'].indexOf(o.rank) >= 0 ? 'epique' : 'rare')), chance: mini ? 0.35 : 0.8 },
    ].concat(o.loot || []);
    BOSSES[id] = b;
    return b;
  }

  // ===================================================================
  //  BOSS v2 (mêmes ids / modèles) — enrichis en 3 phases
  // ===================================================================
  def('golem', { name: 'Golem', title: 'Le Gardien de Pierre', rank: 'E', model: 'golem', icon: '🗿', color: 0x63e6ff, element: 'physique',
    resist: { physique: 0.85 }, weak: { foudre: 1.3 }, summon: 'squelette', speed: 1.6,
    mech: ['Armure de cristaux', "Des cristaux de mousse orbitent autour du Golem et le rendent presque invulnérable. Brisez-les tous pour l'étourdir."],
    strategy: "Frappez les cristaux en orbite (peu de PV) pendant qu'il frappe lentement ; une fois l'armure brisée, il est étourdi 6 s : tout sur lui !",
    phases: PH([1, ['slam', 'rock'], 1], [0.6, ['slam', 'rock', 'wave', 'spike_line'], 1.15], [0.3, ['slam', 'wave', 'leap_chain', 'stun_roar'], 1.3, 1.1, 0.9, 'Le Golem se fissure !']),
    loot: [{ id: 'coeur_pierre', kind: 'material', chance: 0.5, qty: [1, 2] }] });
  def('spiderQueen', { name: 'Arachnée', title: 'Reine des Toiles', rank: 'D', model: 'spiderQueen', icon: '🕷️', color: 0xff4fa8, element: 'poison',
    resist: { poison: 0.3 }, weak: { feu: 1.5 }, summon: 'araignee', speed: 2.6,
    mech: ['Toiles collantes', "Des toiles ralentissent le chasseur et font attaquer Arachnée bien plus vite quand il s'y trouve."],
    strategy: 'Ne restez jamais dans une toile ; le feu est son point faible. Roulez hors des toiles avant ses sauts.',
    phases: PH([1, ['spread', 'summon', 'charge'], 1], [0.6, ['web_trap', 'spread', 'leap_chain', 'summon'], 1.15], [0.3, ['web_trap', 'zigzag_rush', 'rain', 'leap_chain', 'summon'], 1.3, 1.1, 0.85, "Arachnée s'enrage !"]),
    loot: [{ id: 'soie_arachnee', kind: 'material', chance: 0.7, qty: [1, 3] }] });
  def('skeletonKing', { name: 'Ossian', title: 'Le Roi Squelette', rank: 'C', model: 'skeletonKing', icon: '👑', color: 0xd8d0c0, element: 'ombre',
    resist: { ombre: 0.5, poison: 0.2 }, weak: { sacre: 1.6, feu: 1.2 }, summon: 'squelette_guerrier', speed: 2.4,
    mech: ['Ossuaires numérotés', "Trois ossuaires numérotés protègent le roi : il est presque invulnérable tant qu'ils tiennent."],
    strategy: "Détruisez les ossuaires dans l'ordre 1, 2, 3 (couleurs rouge, or, bleu). Une erreur les relève et soigne le roi.",
    phases: PH([1, ['charge', 'wave', 'summon'], 1], [0.6, ['wave', 'blade_grid', 'summon', 'charge'], 1.15], [0.3, ['blade_grid', 'ring_gap', 'summon', 'laser_spin'], 1.3, 1.1, 0.85, 'Les os se redressent !']) });
  def('frostGiant', { name: 'Hrimgar', title: 'Le Géant du Givre', rank: 'B', model: 'frostGiant', icon: '🧊', color: 0x7fd8ff, element: 'glace',
    resist: { glace: 0.2 }, weak: { feu: 1.6 }, summon: 'slime_givre', speed: 1.9,
    mech: ['Tempête de neige', "Des colonnes de glace surgissent. Hrimgar déclenche des blizzards et un souffle glacé balayant l'arène."],
    strategy: "Placez-vous DERRIÈRE une colonne (entre elle et le géant) pour bloquer le souffle et le blizzard. Les colonnes se brisent après 3 impacts.",
    phases: PH([1, ['slam', 'rock', 'nova', 'pillar_summon'], 1], [0.6, ['beam_sweep', 'slam', 'nova', 'pillar_summon', 'ring_gap'], 1.15], [0.3, ['beam_sweep', 'laser_spin', 'slam', 'tornado', 'pillar_summon'], 1.3, 1.1, 0.85, 'Le blizzard se lève !']) });
  def('lich', { name: 'Morvaine', title: 'La Liche Éternelle', rank: 'A', model: 'lich', icon: '☠️', color: 0xb46bff, element: 'ombre',
    resist: { ombre: 0.3, poison: 0.2 }, weak: { sacre: 1.7, feu: 1.2 }, summon: 'spectre_abyssal', speed: 2.2,
    mech: ['Phylactère errant', "L'âme de la liche est enfermée dans un phylactère qui se téléporte. Tant qu'il existe, Morvaine est quasi invulnérable et se régénère."],
    strategy: 'Traquez et détruisez le phylactère (il saute toutes les 6 s) ; la liche est alors étourdie 6 s. Il se reforme après un moment.',
    phases: PH([1, ['nova', 'rain', 'summon', 'spread'], 1], [0.6, ['meteor_rain', 'dark_zone', 'summon', 'inverse_wave', 'nova'], 1.15], [0.3, ['meteor_rain', 'dark_zone', 'beam_sweep', 'clones', 'ally_mark', 'nova'], 1.3, 1.1, 0.8, 'Morvaine libère sa magie noire !']) });
  def('demon', { name: 'Azgaroth', title: 'Le Démon du Volcan', rank: 'S', model: 'demon', icon: '😈', color: 0xff6a1a, element: 'feu',
    resist: { feu: 0.1 }, weak: { glace: 1.6 }, summon: 'diablotin', speed: 2.5,
    mech: ['Furie chronométrée', "En dernière phase, un compte à rebours de furie démarre : à zéro, Azgaroth anéantit l'arène. Des fissures de lave se multiplient."],
    strategy: "Évitez les fissures de lave. Quand la furie atteint 0, mettez-vous à couvert derrière un pilier (qui bloque la ligne de vue) ou finissez-le avant.",
    phases: PH([1, ['charge', 'rain', 'spread', 'slam', 'nova', 'summon'], 1], [0.6, ['fire_wall', 'meteor_rain', 'zigzag_rush', 'slam', 'nova', 'summon'], 1.15], [0.3, ['fire_wall', 'meteor_rain', 'leap_chain', 'pillar_summon', 'beam_sweep', 'stun_roar'], 1.35, 1.15, 0.75, 'FURIE ! Azgaroth libère sa colère !']) });

  // ===================================================================
  //  BOSS FINAUX (nouveaux)
  // ===================================================================
  def('gobelin_roi', { name: 'Grakk', title: 'Le Roi des Gobelins', rank: 'E', icon: '👺', color: 0xffd23a, element: 'physique', summon: 'gobelin', weak: { feu: 1.2 },
    mech: ['Étendard de guerre', "Un étendard rend Grakk bien plus rapide et dangereux tant qu'il tient debout."],
    strategy: "Détruisez l'étendard en premier (il se relève à chaque phase) pour retirer l'enrage, puis concentrez-vous sur le roi.",
    phases: PH([1, ['charge', 'summon', 'spread'], 1], [0.6, ['zigzag_rush', 'summon', 'rock', 'stun_roar'], 1.15], [0.3, ['zigzag_rush', 'stun_roar', 'summon', 'meteor_rain'], 1.3, 1.1, 0.85, 'Grakk hurle : « À MOI, LA HORDE ! »']) });
  def('reine_des_vases', { name: 'Glauqua', title: 'La Reine des Vases', rank: 'D', icon: '🟢', color: 0xc8ff4a, element: 'poison', resist: { poison: 0.1 }, weak: { feu: 1.4, glace: 1.3 }, summon: 'slime_moussu',
    mech: ['Marécage vivant', "Elle crache des mares toxiques et se régénère en s'y baignant."],
    strategy: "Attirez la reine HORS des mares : elle se soigne dedans. Roulez dans les trous des anneaux de vase.",
    phases: PH([1, ['poison_pools', 'slam', 'spread'], 1], [0.6, ['poison_pools', 'ring_gap', 'summon', 'rain'], 1.15], [0.3, ['poison_pools', 'inverse_wave', 'ring_gap', 'leap_chain'], 1.3, 1.1, 0.85, 'La vase déborde !']) });
  def('grand_loup', { name: 'Fenrag', title: 'Le Grand Loup de la Chasse', rank: 'D', icon: '🐺', color: 0x88ffcc, element: 'physique', speed: 3.0, weak: { sacre: 1.3, feu: 1.2 }, summon: 'araignee',
    mech: ['Chasse nocturne', "Fenrag disparaît dans l'ombre et frappe en embuscade ; révélé, il est vulnérable."],
    strategy: "Quand il se camoufle (presque intangible), attendez son embuscade et esquivez en roulade ; feu, foudre et lumière le dévoilent.",
    phases: PH([1, ['zigzag_rush', 'charge', 'spread'], 1], [0.6, ['zigzag_rush', 'stun_roar', 'leap_chain'], 1.2], [0.3, ['zigzag_rush', 'ally_mark', 'leap_chain', 'stun_roar'], 1.4, 1.1, 0.8, 'Le loup hurle à la lune !']) });
  def('maitre_arene', { name: 'Maximus Rex', title: "Le Maître de l'Arène", rank: 'C', icon: '🏟️', color: 0xd8b24a, element: 'physique', resist: { physique: 0.8 }, weak: { foudre: 1.3 }, summon: 'squelette_guerrier',
    mech: ['Contre-attaque du gladiateur', "Le Maître adopte une posture de riposte lumineuse : toute attaque renvoie des dégâts."],
    strategy: "Cessez de frapper quand ses yeux et son armure rougeoient (posture de riposte) ; esquivez puis frappez entre deux postures.",
    phases: PH([1, ['charge', 'spread', 'slam'], 1], [0.6, ['blade_grid', 'zigzag_rush', 'slam'], 1.15], [0.3, ['blade_grid', 'leap_chain', 'stun_roar', 'zigzag_rush'], 1.3, 1.1, 0.85, 'La foule rugit !']) });
  def('roi_dore', { name: 'Aurevor', title: "Le Roi des Os Dorés", rank: 'C', icon: '🏵️', color: 0xffd23a, element: 'sacre', secret: true, resist: { sacre: 0.4 }, weak: { ombre: 1.5 }, summon: 'squelette_dore',
    mech: ['Armure aurique', "Des orbes d'or tournent autour d'Aurevor et l'immunisent ; seul l'orbe éclairé peut être brisé."],
    strategy: "Brisez uniquement l'orbe qui brille (l'ordre change toutes les 4 s) ; frapper un orbe éteint vous renvoie les dégâts.",
    phases: PH([1, ['slam', 'nova', 'spread'], 1], [0.6, ['meteor_rain', 'nova', 'ring_gap', 'summon'], 1.15], [0.3, ['meteor_rain', 'beam_sweep', 'leap_chain', 'nova', 'summon'], 1.3, 1.1, 0.8, "L'or fond et ruisselle !"]),
    loot: [{ id: 'or_pur', kind: 'material', chance: 0.9, qty: [2, 5] }] });
  def('archiviste', { name: "L'Archiviste", title: 'Gardien de la Bibliothèque Interdite', rank: 'B', icon: '📚', color: 0x9ab0ff, element: 'ombre', resist: { ombre: 0.4 }, weak: { feu: 1.6 }, summon: 'spectre',
    mech: ['Verdict des sceaux', "Régulièrement, des sceaux runiques apparaissent : quiconque se tient hors d'un sceau est frappé par le Verdict."],
    strategy: "Courez vite dans un sceau vert avant la fin du compte à rebours. Tout le reste de l'arène est mortel.",
    phases: PH([1, ['nova', 'spread', 'summon', 'poison_pools'], 1], [0.6, ['blade_grid', 'dark_zone', 'ring_gap', 'summon'], 1.15], [0.3, ['blade_grid', 'laser_spin', 'dark_zone', 'inverse_wave', 'summon'], 1.3, 1.1, 0.85, 'Les grimoires se déchaînent !']) });
  def('gardien_des_ombres', { name: 'Noctyr', title: 'Le Gardien des Ombres', rank: 'B', icon: '🌑', color: 0x8a3cff, element: 'ombre', secret: true, resist: { ombre: 0.1 }, weak: { sacre: 1.8 }, summon: 'spectre_abyssal',
    mech: ["Lumière et ténèbres", "Des îlots de lumière dérivent dans l'arène : hors de la lumière vos coups sont affaiblis et les ténèbres vous rongent."],
    strategy: 'Combattez en restant dans les cercles de lumière ; la lumière se rétrécit à chaque phase.',
    phases: PH([1, ['dark_zone', 'nova', 'spread'], 1], [0.6, ['dark_zone', 'clones', 'beam_sweep', 'summon'], 1.15], [0.3, ['dark_zone', 'clones', 'laser_spin', 'inverse_wave', 'summon'], 1.3, 1.1, 0.8, "L'ombre engloutit la salle !"]) });
  def('seigneur_du_ciel', { name: 'Zéphyron', title: 'Le Seigneur du Ciel', rank: 'A', icon: '⚡', color: 0xffe84a, element: 'foudre', resist: { foudre: 0.1 }, weak: { glace: 1.5 }, summon: 'chauve_souris', speed: 2.6,
    mech: ['Prisme de tempête', "Zéphyron change de faiblesse élémentaire toutes les 12 s ; l'élément indiqué fait deux fois plus de dégâts, les autres presque rien."],
    strategy: "Lisez la couleur de son aura (feu orange, glace bleue, ombre violette, sacré blanc) et utilisez l'élément correspondant.",
    phases: PH([1, ['spread', 'nova', 'charge', 'rain'], 1], [0.6, ['beam_sweep', 'meteor_rain', 'tornado', 'ring_gap'], 1.15], [0.3, ['laser_spin', 'meteor_rain', 'tornado', 'zigzag_rush', 'stun_roar'], 1.3, 1.1, 0.8, 'Les cieux se déchirent !']) });
  def('leviathan', { name: 'Thalassor', title: 'Le Léviathan de la Cathédrale', rank: 'A', icon: '🐙', color: 0x6ad0ff, element: 'glace', resist: { glace: 0.2 }, weak: { foudre: 1.6 }, summon: 'spectre_abyssal', scale: 1.0,
    mech: ['Marée montante', "La cathédrale s'inonde : le bord de l'arène se noie et la zone sûre rétrécit à chaque phase."],
    strategy: "Restez au centre ; ne vous laissez pas coincer au bord noyé. Les tentacules frappent là où vous êtes.",
    phases: PH([1, ['slam', 'ring_gap', 'rain', 'poison_pools'], 1], [0.6, ['chain_pull', 'ring_gap', 'tornado', 'slam'], 1.15], [0.3, ['chain_pull', 'inverse_wave', 'tornado', 'ring_gap', 'meteor_rain'], 1.3, 1.1, 0.8, 'Les eaux montent !']) });
  def('cristal_vivant', { name: 'Prismara', title: 'Le Cristal Vivant', rank: 'S', icon: '💠', color: 0xff4de1, element: 'foudre', secret: true, resist: { foudre: 0.3 }, weak: { physique: 1.2 }, summon: 'spectre_abyssal',
    mech: ['Résonance cristalline', "Des cristaux pulsent en séquence : seul le cristal allumé peut être brisé, et il renvoie un éclat aux imprudents."],
    strategy: "Observez le cristal allumé et détruisez-le avant qu'il s'éteigne ; ne touchez pas aux autres. Chaque phase en ajoute.",
    phases: PH([1, ['spread', 'nova', 'beam_sweep'], 1], [0.6, ['laser_spin', 'ring_gap', 'meteor_rain', 'crystal_shield'], 1.15], [0.3, ['laser_spin', 'beam_sweep', 'meteor_rain', 'blade_grid', 'crystal_shield'], 1.3, 1.1, 0.8, 'Le cristal chante !']),
    loot: [{ id: 'cle_faille', kind: 'material', chance: 0.12, qty: [1, 1], rare: true }, { id: 'eclat_prisme', kind: 'material', chance: 0.8, qty: [2, 4] }] });
  def('souverain_neant', { name: "L'Architecte du Néant", title: 'Souverain du Trône Vide', rank: 'Z', icon: '🕳️', color: 0x9a5cff, element: 'ombre', legendary: true, resist: { ombre: 0.1 }, weak: { sacre: 1.4 }, summon: 'spectre_neant', speed: 2.6, scale: 1.0, attackCd: 2.2,
    mech: ["Architecture du Néant", "4 phases : (1) piliers de couverture contre ses rayons ; (2) l'arène s'effondre dans le Néant ; (3) il se dédouble et ses reflets frappent ; (4) trois Clés runiques à détruire dans l'ordre avant son Effacement."],
    strategy: "P1 : jouez les piliers. P2 : restez dans la zone sûre qui rétrécit. P3 : repérez le vrai (le reflet meurt en 1 coup). P4 : détruisez les clés 1-2-3 avant la fin du compte à rebours, sinon réfugiez-vous dans les sceaux sûrs.",
    phases: PH([1, ['beam_sweep', 'pillar_summon', 'nova', 'rain'], 1], [0.72, ['laser_spin', 'inverse_wave', 'ring_gap', 'meteor_rain', 'chain_pull'], 1.15, 1.05, 0.9, "L'arène s'effondre !"],
      [0.42, ['clones', 'blade_grid', 'zigzag_rush', 'dark_zone', 'beam_sweep'], 1.3, 1.1, 0.8, "L'Architecte se dédouble !"], [0.18, ['laser_spin', 'meteor_rain', 'stun_roar', 'ally_mark', 'blade_grid', 'inverse_wave'], 1.45, 1.2, 0.7, 'EFFACEMENT IMMINENT !']),
    intro: { zoom: 1.45, color: 0x9a5cff, duration: 3.6, roar: true, text: 'Le Néant prend forme…' },
    loot: [{ id: 'fragment_neant', kind: 'material', chance: 1, qty: [2, 4] }, { kind: 'item', rarity: 'mythique', chance: 0.25 }] });
  def('juge_souverain', { name: 'Le Juge Souverain', title: "Épreuve du Souverain", rank: 'Z', icon: '⚖️', color: 0xffd700, element: 'sacre', trial: true, resist: { sacre: 0.2 }, weak: { ombre: 1.3 }, summon: 'chevalier_neant', speed: 2.7, dmgMul: 0.9,
    mech: ['Sentence', "Le Juge adopte une posture de riposte et déclenche une Furie chronométrée : verdict à zéro, couvrez-vous."],
    strategy: "Ne frappez pas pendant la posture dorée. À la fin du compte à rebours, cachez-vous derrière un pilier.",
    phases: PH([1, ['slam', 'blade_grid', 'spread', 'ring_gap'], 1], [0.6, ['beam_sweep', 'pillar_summon', 'zigzag_rush', 'leap_chain'], 1.2], [0.3, ['laser_spin', 'meteor_rain', 'stun_roar', 'pillar_summon', 'inverse_wave'], 1.4, 1.15, 0.75, 'La sentence est prononcée !']),
    loot: [{ id: 'sceau_souverain', kind: 'material', chance: 1, qty: [1, 1] }] });
  def('chronophage', { name: 'Chronophage', title: 'Le Dévoreur de Temps', rank: 'Z', icon: '⏳', color: 0xffb020, element: 'physique', speed: 2.8, resist: {}, weak: { foudre: 1.3, ombre: 1.3 }, summon: 'spectre_neant', dmgMul: 0.9,
    mech: ['Reflets temporels', "Il projette des reflets de lui-même qui frappent en même temps, et sa Furie est chronométrée."],
    strategy: "Éliminez les reflets d'un seul coup ; le vrai Chronophage résiste. Ne le laissez pas atteindre la fin de son sablier.",
    phases: PH([1, ['zigzag_rush', 'clones', 'ring_gap', 'spread'], 1], [0.6, ['clones', 'blade_grid', 'chain_pull', 'zigzag_rush', 'meteor_rain'], 1.2], [0.3, ['clones', 'laser_spin', 'inverse_wave', 'stun_roar', 'meteor_rain'], 1.4, 1.1, 0.75, 'Le sablier se brise !']) });

  // ===================================================================
  //  MINI-BOSS
  // ===================================================================
  def('hydre_des_marais', { name: 'Hydrane', title: 'Hydre des Marais', rank: 'D', miniboss: true, icon: '🐍', color: 0xb8ff4a, element: 'poison', resist: { poison: 0.2 }, weak: { feu: 1.5 }, summon: 'araignee', pvMul: 0.5,
    mech: ['Têtes numérotées', "Trois têtes protègent le corps ; abattez-les dans l'ordre."],
    strategy: 'Têtes dans l\'ordre 1-2-3, sinon elles repoussent.',
    phases: PH([1, ['poison_pools', 'spread', 'slam'], 1], [0.5, ['poison_pools', 'ring_gap', 'leap_chain'], 1.2]) });
  def('gardien_sceau', { name: 'Gardien du Sceau', title: 'Sentinelle de Pierre', rank: 'D', miniboss: true, icon: '🔏', color: 0x8a6bff, element: 'ombre', resist: { physique: 0.8 }, weak: { sacre: 1.4 }, summon: 'squelette',
    mech: ['Sceaux protecteurs', 'Des cristaux scellés entourent le gardien.'], strategy: 'Brisez les sceaux flottants pour le rendre vulnérable.',
    phases: PH([1, ['slam', 'rock', 'wave'], 1], [0.5, ['slam', 'leap_chain', 'stun_roar'], 1.2]) });
  def('champion_arene', { name: "Champion de l'Arène", title: 'Gladiateur Spectral', rank: 'C', miniboss: true, icon: '🪓', color: 0xe0c060, element: 'physique', summon: 'squelette_guerrier',
    mech: ['Garde frontale', "Sa garde bloque presque tout de face."], strategy: 'Frappez-le dans le dos ; sa garde tombe après une charge ratée.',
    phases: PH([1, ['charge', 'slam', 'spread'], 1], [0.5, ['zigzag_rush', 'blade_grid', 'slam'], 1.2]) });
  def('colosse_dore', { name: 'Colosse Doré', title: "Gardien de l'Or", rank: 'C', miniboss: true, secret: true, icon: '🏆', color: 0xffd23a, element: 'sacre', summon: 'squelette_dore',
    mech: ['Cuirasse dorée', "Sa garde frontale est quasi imprenable."], strategy: "Contournez-le : le dos est vulnérable, surtout après ses sauts.",
    phases: PH([1, ['slam', 'nova', 'leap_chain'], 1], [0.5, ['slam', 'leap_chain', 'stun_roar', 'meteor_rain'], 1.2]) });
  def('bibliothecaire_fou', { name: 'Bibliothécaire Fou', title: 'Gardien des Rayons', rank: 'B', miniboss: true, icon: '📖', color: 0xe0c060, element: 'ombre', summon: 'spectre',
    mech: ['Sceaux de lecture', 'Des sceaux sûrs apparaissent avant chaque verdict.'], strategy: "Courez dans un sceau avant la fin du décompte.",
    phases: PH([1, ['nova', 'spread', 'blade_grid'], 1], [0.5, ['blade_grid', 'dark_zone', 'ring_gap'], 1.2]) });
  def('general_oublie', { name: 'Général Oublié', title: "L'Ombre sans Nom", rank: 'B', miniboss: true, secret: true, icon: '🪦', color: 0x9a6aff, element: 'ombre', summon: 'spectre_abyssal',
    mech: ['Reflets du général', "Des reflets fantomatiques l'imitent."], strategy: "Tuez les reflets d'un coup, concentrez-vous sur le général.",
    phases: PH([1, ['charge', 'clones', 'spread'], 1], [0.5, ['clones', 'zigzag_rush', 'dark_zone'], 1.2]) });
  def('kraken_mineur', { name: 'Kraken Mineur', title: 'Tentacule des Profondeurs', rank: 'A', miniboss: true, icon: '🦑', color: 0x6ad0ff, element: 'glace', weak: { foudre: 1.5 }, summon: 'spectre_abyssal',
    mech: ['Filets visqueux', "Des toiles d'algues ralentissent."], strategy: 'Évitez les algues collantes et les anneaux.',
    phases: PH([1, ['slam', 'ring_gap', 'rain'], 1], [0.5, ['chain_pull', 'tornado', 'ring_gap'], 1.2]) });
  def('seigneur_eclipse', { name: "Seigneur de l'Éclipse", title: 'Maître des Lumières Mortes', rank: 'A', miniboss: true, icon: '🌘', color: 0xffd27a, element: 'ombre', summon: 'spectre',
    mech: ['Îlots de lumière', 'Hors de la lumière, vos coups sont faibles.'], strategy: 'Restez dans la lumière.',
    phases: PH([1, ['dark_zone', 'nova', 'spread'], 1], [0.5, ['dark_zone', 'beam_sweep', 'inverse_wave'], 1.2]) });
  def('gardien_faille', { name: 'Gardien de la Faille', title: 'Éclat Conscient', rank: 'S', miniboss: true, icon: '💎', color: 0x4affd8, element: 'foudre', summon: 'spectre_abyssal',
    mech: ['Résonance mineure', 'Seul le cristal allumé est vulnérable.'], strategy: "Brisez le cristal qui brille.",
    phases: PH([1, ['spread', 'nova', 'beam_sweep'], 1], [0.5, ['laser_spin', 'ring_gap', 'crystal_shield'], 1.2]),
    loot: [{ id: 'cle_faille', kind: 'material', chance: 0.06, qty: [1, 1], rare: true }] });
  def('maitre_forgeron', { name: 'Maître Forgeron', title: 'Marteau de la Forge Infernale', rank: 'S', miniboss: true, icon: '🔨', color: 0xff8a1a, element: 'feu', resist: { feu: 0.1 }, weak: { glace: 1.5 }, summon: 'diablotin',
    mech: ['Fournaise réactive', "Sa posture incandescente renvoie les coups."], strategy: "N'attaquez pas quand il rougeoie.",
    phases: PH([1, ['slam', 'rain', 'fire_wall'], 1], [0.5, ['fire_wall', 'leap_chain', 'meteor_rain'], 1.2]) });
  def('general_neant', { name: 'Général du Néant', title: 'Lame du Souverain', rank: 'Z', miniboss: true, icon: '⚫', color: 0x9a5cff, element: 'ombre', resist: { ombre: 0.2 }, weak: { sacre: 1.4 }, summon: 'spectre_neant',
    mech: ['Prisme du Néant', 'Faiblesse élémentaire changeante.'], strategy: "Suivez la couleur de son aura pour choisir l'élément.",
    phases: PH([1, ['zigzag_rush', 'nova', 'blade_grid'], 1], [0.5, ['laser_spin', 'clones', 'inverse_wave'], 1.2]) });

  // ===================================================================
  //  Options de mécanique par boss (lues par G.BossAttacks : modules composables)
  //    shield{n,hp,orbit,stagger} order{n} roam banner front hidden riposte prism light pools webs
  //    cover seq echoes collapse sigils rage
  // ===================================================================
  const MECH = {
    golem: { shield: { n: [2, 3, 4], hp: 0.04, orbit: 1.2, stagger: 6, regrow: 14 } },
    gobelin_roi: { banner: {} },
    spiderQueen: { webs: {} },
    reine_des_vases: { pools: { heal: 0.012 } },
    grand_loup: { hidden: { every: 12, dur: 5 } },
    skeletonKing: { order: { n: [3, 3, 4], hp: 0.035 } },
    maitre_arene: { riposte: { every: 9, dur: 3.5 } },
    roi_dore: { seq: { n: [3, 4, 5], hp: 0.04, every: 4, color: 0xffd23a } },
    frostGiant: { cover: { blizzard: 24, pillars: 3 } },
    archiviste: { sigils: { every: 14, n: 3 } },
    gardien_des_ombres: { light: { n: 3, r: [5.5, 4.5, 3.5] } },
    lich: { roam: { hp: 0.06, every: 6, respawn: 22 } },
    seigneur_du_ciel: { prism: { every: 12, els: ['feu', 'glace', 'ombre', 'sacre'] } },
    leviathan: { collapse: { from: 14, to: [14, 11, 8.5], dps: 0.12 } },
    demon: { rage: { time: 30, phase: 3 }, lava: {} },
    cristal_vivant: { seq: { n: [4, 5, 6], hp: 0.035, every: 4, color: 0xff4de1 } },
    souverain_neant: { architect: {} },
    juge_souverain: { riposte: { every: 11, dur: 3.5 }, rage: { time: 35, phase: 3 }, cover: { blizzard: 0, pillars: 4 } },
    chronophage: { echoes: { n: [2, 2, 3], every: 22 }, rage: { time: 40, phase: 3 }, cover: { blizzard: 0, pillars: 0 } },
    hydre_des_marais: { order: { n: [3, 3], hp: 0.05, kind: 'boss_totem' } },
    gardien_sceau: { shield: { n: [2, 3], hp: 0.05, orbit: 1.0, stagger: 5, regrow: 16 } },
    champion_arene: { front: { half: 1.3 } },
    colosse_dore: { front: { half: 1.5 } },
    bibliothecaire_fou: { sigils: { every: 15, n: 2 } },
    general_oublie: { echoes: { n: [2, 3], every: 18 } },
    kraken_mineur: { webs: { color: 0x2a8a6a } },
    seigneur_eclipse: { light: { n: 2, r: [5, 4] } },
    gardien_faille: { seq: { n: [3, 4], hp: 0.05, every: 4, color: 0x4affd8 } },
    maitre_forgeron: { riposte: { every: 10, dur: 3 } },
    general_neant: { prism: { every: 12, els: ['feu', 'glace', 'foudre', 'sacre'] } },
  };
  Object.keys(MECH).forEach(id => { if (BOSSES[id]) BOSSES[id].mechOpts = MECH[id]; });

  // ===================================================================
  //  Adds de mécaniques : définitions G.MONSTERS (si le rôle 9 ne les a pas déjà)
  // ===================================================================
  const addDef = (id, name, model, extra) => Object.assign({ id, name, model, ai: 'boss_static', pv: 40, speed: 0, dmg: 0, xp: 0, gold: [0, 0], attackCd: 99, range: 0, element: 'physique', scale: 1, tint: null, rankMin: 'E', packTag: 'boss_add', rare: false, elite: false, isBossAdd: true }, extra || {});
  MON.boss_cristal = addDef('boss_cristal', 'Cristal', 'boss_cristal');
  MON.boss_totem = addDef('boss_totem', 'Ossuaire', 'boss_totem');
  MON.boss_etendard = addDef('boss_etendard', 'Étendard', 'boss_etendard');
  MON.boss_phylactere = addDef('boss_phylactere', 'Phylactère', 'boss_phylactere');
  MON.boss_echo = addDef('boss_echo', 'Reflet', 'boss_echo', { pv: 1 });
  // ===================================================================
  //  v5 « Ténèbres » — BOSS EXCLUSIFS (un par donjon) + MINI-BOSS CACHÉS
  //   champs en plus : lore, lines{intro,phase2,phase3,death}, intro{duration,camera,text,title,music,fx}, music,
  //   rewards[{id,chance,qty}], gear{...}, cristal, mechOpts (modules G.BossAttacks), mechId
  // ===================================================================
  const bn = (name, line) => '<b>' + name + '</b><br><i>« ' + line + ' »</i>';
  const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'Z'];
  const MATS = {
    charbon_maudit: ['Charbon maudit', '⚫', 'rare', 'Charbon qui brûle sans chaleur. Arraché au Golem de Grisou.'],
    lanterne_du_mineur: ['Lanterne du mineur', '🏮', 'rare', 'Une lanterne qui éclaire ce qu\'on préférerait ne pas voir.'],
    seve_noire: ['Sève noire', '🖤', 'rare', 'Sève épaisse du Roi-Sylve.'],
    bois_de_cerf_blanc: ['Bois de cerf blanc', '🦌', 'epique', 'Un andouiller de racine vivante.'],
    os_ancien: ['Os ancien', '🦴', 'rare', 'Os qui se souvient de son squelette.'],
    poussiere_funeraire: ['Poussière funéraire', '⚱️', 'rare', 'Cendres des catacombes.'],
    velours_maudit: ['Velours maudit', '🟥', 'rare', 'Tissu de la robe de la Comtesse.'],
    argenterie_hantee: ['Argenterie hantée', '🍴', 'rare', 'Elle tinte quand personne ne mange.'],
    perle_noire: ['Perle noire', '⚫', 'epique', 'Perle des profondeurs de la nef noyée.'],
    eau_benite_corrompue: ['Eau bénite corrompue', '💧', 'rare', 'Bénie, puis noyée.'],
    rubis_de_sang: ['Rubis de sang', '🔴', 'epique', 'Cristallisé dans les canaux du temple.'],
    glyphe_brise: ['Glyphe brisé', '🔣', 'rare', 'Un éclat de glyphe encore tiède.'],
    fragment_de_faille: ['Fragment de faille', '🟣', 'epique', 'Un morceau de réalité fêlée.'],
    dossier_scelle: ['Dossier scellé', '📁', 'rare', 'Il ne faut pas l\'ouvrir.'],
    encre_abyssale: ['Encre abyssale', '🖋️', 'epique', 'Encre qui écrit seule.'],
    page_arrachee: ['Page arrachée', '📄', 'rare', 'Un chapitre dont vous êtes le héros.'],
    givre_eternel: ['Givre éternel', '❄️', 'epique', 'Glace qui ne fond jamais.'],
    linceul_gele: ['Linceul gelé', '🧣', 'rare', 'Bandelette de momie du Roi-Hiver.'],
    graine_de_chair: ['Graine de chair', '🌱', 'rare', 'Elle bat faiblement.'],
    nectar_rouge: ['Nectar rouge', '🍷', 'epique', 'Doux. Trop doux.'],
    cendre_infernale: ['Cendre infernale', '🌋', 'epique', 'Cendre encore rougeoyante.'],
    maillon_brise: ['Maillon brisé', '⛓️', 'rare', 'Maillon des chaînes du Prince.'],
    poussiere_d_etoile_morte: ['Poussière d\'étoile morte', '✨', 'epique', 'Ce qu\'il reste d\'un soleil.'],
    eclat_du_neant: ['Éclat du néant', '🕳️', 'legendaire', 'Un éclat de regard.'],
    ticket_de_foire: ['Ticket de foire', '🎟️', 'rare', 'Valable pour un tour. Un seul.'],
    ficelle_maudite: ['Ficelle maudite', '🧵', 'rare', 'Elle bouge toute seule.'],
  };
  const ITEMFX = {};
  /** équipement exclusif : tout est enregistré NON énumérable (ne pollue pas les tirages aléatoires) */
  function registerItems() {
    try {
      if (!G.ITEMS) return false;
      const bases = G.ITEMS.bases, fx = G.ITEMS.effects, mats = G.ITEMS.materials;
      Object.keys(MATS).forEach(id => { if (mats && !mats[id]) { const m = MATS[id]; mats[id] = { id, name: m[0], icon: m[1], kind: 'craft', rarity: m[2], sell: m[2] === 'legendaire' ? 400 : m[2] === 'epique' ? 120 : 40, desc: m[3] }; } });
      Object.keys(BOSSES).forEach(id => {
        const g = BOSSES[id].gear; if (!g) return;
        if (bases && !bases[g.id]) Object.defineProperty(bases, g.id, { value: { id: g.id, slot: g.slot, tier: 2, name: g.name, icon: g.icon, classes: g.classes || null, baseStats: g.shares, rankReq: g.rankReq, unique: true, rarity: g.rarity, effect: g.effect.id, bossId: id }, enumerable: false, configurable: true, writable: true });
        if (fx && !fx[g.effect.id]) Object.defineProperty(fx, g.effect.id, { value: { name: g.effect.name, desc: g.effect.desc, p: {} }, enumerable: false, configurable: true, writable: true });
      });
      return true;
    } catch (e) { console.warn('[BossInfo.registerItems]', e); return false; }
  }

  /** crée un boss exclusif v5 */
  function fin(id, o) {
    const b = def(id, o);
    b.lore = o.lore; b.lines = o.lines; delete b.music; b.mechOpts = o.mechOpts || {}; b.exclusive = true;
    b.intro = Object.assign({ duration: o.miniboss ? 3.2 : 5.0, camera: 'orbit', music: 'boss_' + id, fx: 'shake' }, o.intro || {}, { title: o.intro && o.intro.title || (o.name + ' — ' + o.title) });
    b.rewards = (o.rewards || []).map(r => ({ id: r[0], chance: r[1], qty: r[2] || [1, 1] }));
    b.cristal = o.cristal != null ? o.cristal : Math.min(0.2, (RK[o.rank] ? RK[o.rank].cr : 0.01) * (o.miniboss ? 0.5 : 3));
    if (o.gear) { b.gear = o.gear; b.gearChance = o.gearChance || (o.miniboss ? 0.18 : 0.45); }
    if (o.model) b.model = o.model; else b.model = id;
    return b;
  }
  const ph3 = (rows, ln, nm) => PH(...rows.map((r, i) => i === 0 ? [r[0], r[1], r[2]] : [r[0], r[1], r[2], r[3], r[4], bn(nm, i === 1 ? ln.phase2 : i === 2 ? ln.phase3 : (ln.phase4 || ln.phase3))]));

  // 1 ---------------------------------------------------------------
  fin('mine_golem_grisou', { name: 'Grisou', title: 'Le Golem de Grisou', rank: 'E', icon: '🪨', color: 0x7bd648, element: 'physique', speed: 1.7, scale: 1.0, resist: { physique: 0.8 }, weak: { feu: 1.0 }, summon: 'mine_mineur_possede',
    lore: 'Le grisou a fini par tout fondre : la roche, les rails et les mineurs restés au fond. Ce qui se lève aujourd\'hui avance au rythme des étais qui craquent. Allumez une mèche près de lui et la mine se souviendra de tout.',
    lines: { intro: 'Le gaz… respire…', phase2: 'Les étais ! Tenez bon, les gars !', phase3: 'TOUT… VA… SAUTER.', death: 'Enfin… le silence.' },
    mech: ['Éboulements et grisou', 'Le plafond s\'effondre par à-coups (étais = abris) et des poches de grisou se forment : un tir de feu les fait exploser sur le Golem.'],
    strategy: 'Collez-vous à un étai quand le plafond craque (l\'effondrement écrase le reste de la salle, et peut enterrer le Golem). Attirez-le dans une poche de gaz puis enflammez-la.',
    phases: ph3([[1, ['gg_rail_cart', 'gg_spark', 'slam'], 1], [0.66, ['gg_rail_cart', 'gg_spark', 'gg_ore_burst', 'rock'], 1.12], [0.33, ['gg_rail_cart', 'gg_ore_burst', 'gg_quake', 'gg_spark', 'stun_roar'], 1.3, 1.1, 0.85]], { phase2: 'Les étais ! Tenez bon, les gars !', phase3: 'TOUT… VA… SAUTER.' }, 'Le Golem de Grisou'),
    mechOpts: { cavein: { every: [16, 13, 10], etais: 3, safeR: 2.6, hp: 3, buryChip: 0.06 }, gas: { n: [1, 2, 3], r: 3.2 } },
    rewards: [['charbon_maudit', 0.8, [1, 3]], ['lanterne_du_mineur', 0.35, [1, 1]], ['coeur_pierre', 0.5, [1, 2]]],
    gear: { id: 'pioche_de_grisou', slot: 'arme', name: 'Pioche de Grisou', icon: '⛏️', classes: ['Guerrier', 'Paladin', 'Assassin'], rankReq: 'E', rarity: 'epique', shares: { force: 0.55, crit: 0.2, pvMax: 0.25 }, effect: { id: 'grisou_pic', name: 'Coup de grisou', desc: 'Chaque 5e coup fait exploser le grisou : onde physique de zone (4× vos dégâts).' } } });
  // 2 ---------------------------------------------------------------
  fin('foret_roi_sylve', { name: 'Sylvaran', title: 'Le Roi-Sylve', rank: 'E', icon: '🦌', color: 0x88ffcc, element: 'poison', speed: 2.4, resist: { poison: 0.5 }, weak: { feu: 1.5 }, summon: 'foret_loup_creux',
    lore: 'Le Roi-Sylve était le gardien d\'un bois sacré avant que la forêt n\'apprenne à avoir faim. Ses bois sont devenus racines, ses corbeaux ses yeux. Il ne chasse pas : il attend que la forêt vous attrape.',
    lines: { intro: 'Chaque arbre… est mon œil.', phase2: 'La forêt pousse. Courez.', phase3: 'Les racines me nourrissent !', phase4: 'BRÛLEZ-MOI ET JE REPOUSSERAI.', death: 'Je… redeviens… graine.' },
    mech: ['Racines et brume', 'Des racines vivantes l\'enracinent et le soignent ; il se fond dans la brume et ne devient visible que lorsqu\'il charge.'],
    strategy: 'Brûlez les racines (feu = ×3) ou ramassez une braise-torche pour les consumer ; coupez-les avant de frapper le Roi. Sous la brume, attendez sa charge et esquivez.',
    phases: PH([1, ['rs_antler_charge', 'rs_root_burst', 'rs_crows'], 1], [0.7, ['rs_antler_charge', 'rs_root_burst', 'rs_crows', 'rs_entangle'], 1.1, 1, 1, bn('Le Roi-Sylve', 'La forêt pousse. Courez.')], [0.4, ['rs_antler_charge', 'rs_entangle', 'rs_grow_trees', 'rs_crows', 'rs_spores'], 1.22, 1.08, 0.9, bn('Le Roi-Sylve', 'Les racines me nourrissent !')], [0.18, ['rs_antler_charge', 'rs_grow_trees', 'rs_spores', 'rs_root_burst', 'rs_crows', 'rs_entangle'], 1.38, 1.15, 0.75, bn('Le Roi-Sylve', 'BRÛLEZ-MOI ET JE REPOUSSERAI.')]),
    mechOpts: { links: { kind: 'add', model: 'boss_racine', n: [2, 3, 3, 4], R: 8.5, hp: 0.04, fire: true, armorPer: 0.2, healPer: 0.005, regrow: [20, 16, 13, 11], beam: 0x7bd648, color: 0x7bd648, onAll: { stagger: 6, chip: 0.04, text: 'RACINES COUPÉES' } }, torches: { n: 2, every: 14, dur: 14 }, hidden: { every: 14, dur: 4 } },
    rewards: [['seve_noire', 0.8, [1, 3]], ['bois_de_cerf_blanc', 0.3, [1, 1]], ['soie_arachnee', 0.4, [1, 2]]],
    gear: { id: 'couronne_de_ronces', slot: 'casque', name: 'Couronne de Ronces', icon: '👑', classes: null, rankReq: 'E', rarity: 'epique', shares: { pvMax: 0.4, defense: 0.3, dmg_poison: 0.3 }, effect: { id: 'ronces', name: 'Ronces vivantes', desc: 'Quand vous êtes touché, des ronces frappent l\'ennemi le plus proche (poison, 1,2 s de délai).' } } });
  // 3 ---------------------------------------------------------------
  fin('cata_roi_ossements', { name: 'Ossuaire-Roi', title: 'Le Roi des Ossements', rank: 'D', icon: '💀', color: 0x6aff6a, element: 'ombre', speed: 1.9, resist: { ombre: 0.5, poison: 0.3 }, weak: { sacre: 1.6, feu: 1.2 }, summon: 'cata_squelette_niche',
    lore: 'Chaque siècle, les catacombes ajoutent un crâne à son trône. Quand le dernier a été posé, le trône s\'est levé et s\'est fait des jambes avec tout ce que la mort avait laissé. Il n\'a jamais été vaincu : il se rassemble.',
    lines: { intro: 'Un crâne de plus… pour le trône.', phase2: 'Mes sujets, levez-vous !', phase3: 'Os contre os !', phase4: 'JE NE ME BRISE PAS. JE ME REFAIS.', death: 'Enfin… un sujet de moins.' },
    mech: ['Niches et réassemblage', 'Des niches à ossements l\'alimentent et crachent des squelettes ; tant qu\'une niche tient, il se reconstruit à 0 PV.'],
    strategy: 'Brisez TOUTES les niches (elles protègent et réassemblent) avant de finir le roi. Chaque niche brisée le déstabilise ; brisez-les toutes pour l\'étourdir.',
    phases: PH([1, ['os_bone_spears', 'os_skull_volley', 'os_coffin_lines'], 1], [0.7, ['os_bone_spears', 'os_graspers', 'os_coffin_lines', 'os_throne_charge'], 1.1, 1, 1, bn('Le Roi des Ossements', 'Mes sujets, levez-vous !')], [0.4, ['os_skull_volley', 'os_graspers', 'os_throne_charge', 'os_marrow_nova', 'os_coffin_lines'], 1.22, 1.08, 0.9, bn('Le Roi des Ossements', 'Os contre os !')], [0.18, ['os_throne_charge', 'os_marrow_nova', 'os_bone_spears', 'os_skull_volley', 'os_graspers'], 1.38, 1.15, 0.75, bn('Le Roi des Ossements', 'JE NE ME BRISE PAS. JE ME REFAIS.')]),
    mechOpts: { links: { kind: 'add', model: 'boss_niche', key: 'niche', n: [3, 4, 5, 5], R: 9, hp: 0.05, armorPer: 0.15, regrow: [24, 20, 16, 14], spawn: { every: 7, max: 5 }, color: 0xd8d0c0, onAll: { stagger: 6, chip: 0.05, text: 'NICHES BRISÉES' } }, reassemble: {} },
    rewards: [['os_ancien', 0.85, [1, 3]], ['poussiere_funeraire', 0.5, [1, 2]], ['coeur_boss', 0.4, [1, 1]]],
    gear: { id: 'couronne_d_ossements', slot: 'casque', name: 'Couronne d\'Ossements', icon: '💀', classes: null, rankReq: 'D', rarity: 'epique', shares: { pvMax: 0.35, defense: 0.25, minionDmg: 0.2, intelligence: 0.2 }, effect: { id: 'os_eternels', name: 'Os éternels', desc: 'Un coup mortel vous laisse à 1 PV et vous soigne de 30 % (une fois par expédition).' } } });
  // 4 ---------------------------------------------------------------
  fin('chateau_comtesse_ecarlate', { name: 'Ysolde', title: 'La Comtesse Écarlate', rank: 'D', icon: '🩸', color: 0xc01830, element: 'ombre', speed: 2.5, resist: { ombre: 0.3 }, weak: { sacre: 1.5, feu: 1.3 }, summon: 'chateau_servante_spectrale',
    lore: 'La Comtesse Ysolde ne sort jamais de son bal. Elle y invite les vivants, danse avec les morts et éteint les chandeliers pour mieux choisir sa prochaine valse. On raconte qu\'elle ne vieillit que lorsque la lumière revient.',
    lines: { intro: 'Quelle belle soirée… pour mourir.', phase2: 'Éteignez tout. Que la danse commence.', phase3: 'Vous dansez si mal… encore !', death: 'La valse… s\'achève.' },
    mech: ['Chandeliers éteints', 'Elle éteint les braseros un à un : plus il y en a d\'éteints, plus elle est invulnérable et vous rongent les ténèbres ; elle vole la vie de ceux qu\'elle touche.'],
    strategy: 'Rallumez les braseros (maintenez l\'interaction) : à 3 braseros allumés ou plus elle est vulnérable. Restez dans la lumière, esquivez la valse (cercles) et ne vous laissez pas toucher par le baiser.',
    phases: ph3([[1, ['ce_veil', 'ce_waltz', 'ce_snuff', 'ce_blood_ball'], 1], [0.66, ['ce_waltz', 'ce_mirror_step', 'ce_snuff', 'ce_blood_ball', 'ce_chandelier'], 1.12], [0.33, ['ce_waltz', 'ce_mirror_step', 'ce_kiss', 'ce_chandelier', 'ce_snuff', 'ce_blood_ball'], 1.3, 1.1, 0.8]], { phase2: 'Éteignez tout. Que la danse commence.', phase3: 'Vous dansez si mal… encore !' }, 'La Comtesse Écarlate'),
    mechOpts: { braziers: { n: 4, R: 9.6, lightR: 4.6, snuff: [13, 9, 7], relight: 1.5 }, vamp: { frac: 0.02 } },
    rewards: [['velours_maudit', 0.8, [1, 3]], ['argenterie_hantee', 0.5, [1, 2]], ['coeur_boss', 0.4, [1, 1]]],
    gear: { id: 'bague_de_la_comtesse', slot: 'anneau', name: 'Bague de la Comtesse', icon: '💍', classes: null, rankReq: 'D', rarity: 'epique', shares: { crit: 0.3, critDmg: 0.3, dmg_ombre: 0.2, vitesse: 0.2 }, effect: { id: 'baiser_ecarlate', name: 'Baiser écarlate', desc: 'Vous vous soignez de 4 % des dégâts infligés.' } } });
  // 5 ---------------------------------------------------------------
  fin('cathe_mere_des_marees', { name: 'Thalasse', title: 'La Mère des Marées', rank: 'C', icon: '🌊', color: 0x6affd8, element: 'glace', speed: 2.1, resist: { glace: 0.4 }, weak: { foudre: 1.5 }, summon: 'cathe_choriste_noye', scale: 1.0,
    lore: 'Sainte avant de se noyer avec toute sa paroisse, Thalasse chante depuis sous l\'eau. Chaque note fait monter la marée. Les noyés se lèvent à sa voix ; ceux qui l\'écoutent trop longtemps les rejoignent.',
    lines: { intro: 'Écoutez… la mer chante.', phase2: 'Montez, eaux. Montez.', phase3: 'Venez à moi, mes noyés.', phase4: 'LE DÉLUGE… EST MON CANTIQUE.', death: 'La marée… se retire.' },
    mech: ['Chant hypnotique et marée', 'Son chant vous attire vers elle (englouti = étourdi) ; à chaque phase l\'eau monte et réduit la zone sûre.'],
    strategy: 'Pendant le chant, courez vers une cloche (rayon de la nef) et sonnez-la pour briser le chant (et la sonner étourdit Thalasse). Restez au centre : le bord est noyé.',
    phases: PH([1, ['cm_tentacle_slam', 'cm_tide_wave', 'cm_bubbles'], 1], [0.7, ['cm_tentacle_slam', 'cm_tide_wave', 'cm_drown_hand', 'cm_bubbles'], 1.1, 1, 1, bn('La Mère des Marées', 'Montez, eaux. Montez.')], [0.4, ['cm_tide_wave', 'cm_drown_hand', 'cm_bubbles', 'cm_tentacle_slam', 'cm_maelstrom'], 1.2, 1.08, 0.9, bn('La Mère des Marées', 'Venez à moi, mes noyés.')], [0.18, ['cm_maelstrom', 'cm_drown_hand', 'cm_tide_wave', 'cm_tentacle_slam', 'cm_bubbles'], 1.35, 1.15, 0.75, bn('La Mère des Marées', 'LE DÉLUGE… EST MON CANTIQUE.')]),
    mechOpts: { chant: { bells: 3, every: [18, 15, 12, 10], dur: [8, 8, 7, 7], water: { from: 14, to: [14, 12, 10.5, 9] } } },
    rewards: [['perle_noire', 0.7, [1, 2]], ['eau_benite_corrompue', 0.6, [1, 3]], ['coeur_boss', 0.5, [1, 1]]],
    gear: { id: 'diademe_des_marees', slot: 'casque', name: 'Diadème des Marées', icon: '👑', classes: null, rankReq: 'C', rarity: 'legendaire', shares: { pvMax: 0.3, intelligence: 0.3, manaMax: 0.2, cdr: 0.2 }, effect: { id: 'maree_montante', name: 'Marée montante', desc: 'Chaque esquive réussie restaure 12 points de mana.' } } });
  // 6 ---------------------------------------------------------------
  fin('temple_dieu_ecorche', { name: 'Hémoth', title: 'Le Dieu Écorché', rank: 'C', icon: '🩸', color: 0xff3030, element: 'feu', speed: 2.0, resist: { feu: 0.5 }, weak: { glace: 1.4 }, summon: 'temple_acolyte_saignant',
    lore: 'Les offrandes ont fini par réveiller ce que le temple adorait : une idole de chair vive, sans peau, qui boit le sang des canaux pour se refaire. Elle n\'a pas de dieu à prier. Elle est le dieu.',
    lines: { intro: 'Du sang. Encore du sang.', phase2: 'Mes canaux… sont pleins.', phase3: 'Quatre bras pour mieux vous prendre !', death: 'Écorché… une dernière fois.' },
    mech: ['Canaux de sang', 'Des canaux de sang le nourrissent et le protègent ; il se soigne à chaque instant tant qu\'ils sont pleins.'],
    strategy: 'Videz les canaux en les bloquant (maintenez l\'interaction) : chaque canal tari réduit son armure et sa régénération ; tous vidés, il est étourdi. Ils se remplissent de nouveau après un temps.',
    phases: ph3([[1, ['de_blood_rain', 'de_flay_chains', 'de_idol_slam'], 1], [0.66, ['de_blood_rain', 'de_flay_chains', 'de_four_arms', 'de_idol_slam'], 1.12], [0.33, ['de_four_arms', 'de_blood_rain', 'de_flay_chains', 'de_idol_slam', 'stun_roar'], 1.3, 1.1, 0.8]], { phase2: 'Mes canaux… sont pleins.', phase3: 'Quatre bras pour mieux vous prendre !' }, 'Le Dieu Écorché'),
    mechOpts: { links: { kind: 'interact', prop: 'canal', n: [3, 4, 5], R: 8.5, time: 2, armorPer: 0.15, healPer: 0.006, refill: 25, color: 0xc01818, onOne: { chip: 0.02, text: 'CANAL TARI' }, onAll: { stagger: 7, chip: 0.04, text: 'SAIGNÉ À BLANC' } } },
    rewards: [['rubis_de_sang', 0.7, [1, 2]], ['glyphe_brise', 0.6, [1, 3]], ['coeur_boss', 0.5, [1, 1]]],
    gear: { id: 'masque_ecorche', slot: 'casque', name: 'Masque Écorché', icon: '🎭', classes: null, rankReq: 'C', rarity: 'legendaire', shares: { force: 0.3, critDmg: 0.3, pvMax: 0.2, dmg_feu: 0.2 }, effect: { id: 'sang_ecorche', name: 'Soif écorchée', desc: 'Sous 50 % de PV, vos dégâts sont augmentés de 25 %.' } } });
  // 7 ---------------------------------------------------------------
  fin('asile_directeur_faille', { name: 'Dr Vael', title: 'Le Directeur de la Faille', rank: 'B', icon: '🩺', color: 0x9a6aff, element: 'foudre', speed: 2.3, resist: { foudre: 0.5 }, weak: { ombre: 1.2 }, summon: 'asile_patient_fracture',
    lore: 'Le docteur Vael a ouvert la première faille pour « guérir » ses pensionnaires. Elle les a plutôt guéris de l\'existence. Il tient toujours ses consultations ; il vous trouve très intéressant.',
    lines: { intro: 'Installez-vous. Je vais vous ausculter.', phase2: 'Ah, un cas résistant. Passons à l\'étape suivante.', phase3: 'Les lumières, s\'il vous plaît.', death: 'Fin de… la consultation.' },
    mech: ['Pylônes et black-out', 'Des pylônes de faille attirent ses arcs ; il éteint les lumières et se dédouble dans les failles.'],
    strategy: 'Placez-vous pour que ses arcs frappent un pylône (il surcharge et s\'étourdit). Pendant le black-out, courez au disjoncteur et rallumez. Son armure de blouse tombe quand les pylônes encaissent.',
    phases: ph3([[1, ['ad_arc', 'ad_shock', 'ad_syringes'], 1], [0.66, ['ad_arc', 'ad_shock', 'ad_rift_step', 'ad_syringes'], 1.12], [0.33, ['ad_arc', 'ad_rift_step', 'ad_blackout', 'ad_syringes', 'ad_shock'], 1.3, 1.1, 0.8]], { phase2: 'Ah, un cas résistant. Passons à l\'étape suivante.', phase3: 'Les lumières, s\'il vous plaît.' }, 'Le Directeur de la Faille'),
    mechOpts: { pylons: { n: 3, armor: 0.5 } },
    rewards: [['fragment_de_faille', 0.7, [1, 2]], ['dossier_scelle', 0.6, [1, 2]], ['coeur_boss', 0.6, [1, 2]]],
    gear: { id: 'blouse_du_directeur', slot: 'armure', name: 'Blouse du Directeur', icon: '🥼', classes: null, rankReq: 'B', rarity: 'legendaire', shares: { pvMax: 0.4, defense: 0.3, intelligence: 0.15, dmg_foudre: 0.15 }, effect: { id: 'isolation', name: 'Isolation', desc: 'Dégâts subis −8 % ; −50 % contre la foudre.' } } });
  // 8 ---------------------------------------------------------------
  fin('biblio_auteur_sans_nom', { name: 'L\'Auteur', title: 'L\'Auteur sans Nom', rank: 'B', icon: '🖋️', color: 0x2a4aa8, element: 'ombre', speed: 2.3, resist: { ombre: 0.4 }, weak: { feu: 1.6 }, summon: 'biblio_scribe_spectral',
    lore: 'Noyé dans son propre encre, l\'Auteur écrit. Il écrit ce qui va se passer, et ce qu\'il écrit arrive. Il écrit maintenant votre mort, phrase après phrase, et vous pouvez le lire.',
    lines: { intro: 'Chapitre premier : vous entrez.', phase2: 'Chapitre deux : vous hésitez.', phase3: 'Chapitre final : vous tombez.', death: 'Je n\'ai… pas fini ma phrase.' },
    mech: ['La phrase écrite', 'Il écrit une phrase dans les airs ; si vous la lisez, chaque mot devient une attaque à l\'endroit annoncé. Des mots vivants vous traquent.'],
    strategy: 'Lisez la phrase (mots, ordre, positions) et placez-vous AVANT qu\'elle s\'achève ; détruisez les mots ratures pour l\'interrompre. Les flaques d\'encre ralentissent.',
    phases: ph3([[1, ['ba_write', 'ba_ink_blots'], 1], [0.66, ['ba_write', 'ba_ink_blots', 'ba_underline', 'ba_page_storm'], 1.12], [0.33, ['ba_write', 'ba_page_storm', 'ba_underline', 'ba_ink_blots', 'beam_sweep'], 1.3, 1.1, 0.8]], { phase2: 'Chapitre deux : vous hésitez.', phase3: 'Chapitre final : vous tombez.' }, 'L\'Auteur sans Nom'),
    mechOpts: { sigils: { every: 18, n: 2 } },
    rewards: [['encre_abyssale', 0.7, [1, 2]], ['page_arrachee', 0.7, [1, 3]], ['coeur_boss', 0.6, [1, 2]]],
    gear: { id: 'plume_sans_nom', slot: 'arme', name: 'Plume sans Nom', icon: '🪶', classes: ['Mage', 'Elementaliste', 'Necromancien'], rankReq: 'B', rarity: 'legendaire', shares: { intelligence: 0.5, dmg_ombre: 0.25, cdr: 0.25 }, effect: { id: 'rature', name: 'Rature', desc: '15 % de chance de maudire l\'ennemi touché (4 s) : il subit plus de dégâts.' } } });
  // 9 ---------------------------------------------------------------
  fin('necropole_roi_hiver', { name: 'Hrimvar', title: 'Le Roi-Hiver', rank: 'A', icon: '🥶', color: 0x4ac8ff, element: 'glace', speed: 2.0, resist: { glace: 0.6 }, weak: { feu: 1.6 }, summon: 'necropole_chevalier_fige',
    lore: 'Hrimvar règne depuis si longtemps que son trône l\'a gelé. Il figea sa cour, sa cité, puis le temps lui-même. Seul le feu lui rappelle qu\'il a déjà eu chaud.',
    lines: { intro: 'Tout meurt… figé.', phase2: 'Debout, mes chevaliers.', phase3: 'Le temps… s\'arrête.', death: 'Je… dégèle.' },
    mech: ['Froid et dégel', 'Le froid vous gagne hors des braseros ; sa carapace de glace fond quand elle est exposée à la chaleur — c\'est là qu\'il est vulnérable.'],
    strategy: 'Restez près d\'un brasero pour ne pas geler ; il en éteint un de temps en temps (rallumez-le). Le feu fait fondre sa carapace : alors tapez fort.',
    phases: ph3([[1, ['rh_frost_lance', 'rh_ice_comb', 'rh_gust'], 1], [0.66, ['rh_frost_lance', 'rh_ice_comb', 'rh_knights', 'rh_gust'], 1.12], [0.33, ['rh_stasis', 'rh_blizzard_ring', 'rh_knights', 'rh_ice_comb', 'rh_frost_lance'], 1.3, 1.1, 0.8]], { phase2: 'Debout, mes chevaliers.', phase3: 'Le temps… s\'arrête.' }, 'Le Roi-Hiver'),
    mechOpts: { cold: { warmR: 4.4 } },
    rewards: [['givre_eternel', 0.7, [1, 2]], ['linceul_gele', 0.6, [1, 3]], ['coeur_boss', 0.7, [1, 2]]],
    gear: { id: 'couronne_de_l_hiver', slot: 'casque', name: 'Couronne de l\'Hiver', icon: '👑', classes: null, rankReq: 'A', rarity: 'legendaire', shares: { pvMax: 0.3, defense: 0.2, dmg_glace: 0.3, intelligence: 0.2 }, effect: { id: 'givre_roi', name: 'Règne du givre', desc: '12 % de chance de ralentir l\'ennemi touché.' } } });
  // 10 --------------------------------------------------------------
  fin('jardin_matrice', { name: 'La Matrice', title: 'Le Cœur du Jardin', rank: 'A', icon: '🫀', color: 0xff4a8a, element: 'poison', speed: 0.3, scale: 1.0, resist: { poison: 0.6 }, weak: { feu: 1.4 }, summon: 'jardin_fleur_dents',
    lore: 'Au centre du jardin bat un cœur de la taille d\'une maison. Il envoie ses veines dans tout le domaine et bourgeonne des choses qui ont presque l\'air vivantes. Elle ne bouge pas : tout le jardin se déplace pour elle.',
    lines: { intro: 'Bats… bats… bats…', phase2: 'Fleurissez, mes enfants.', phase3: 'Plus vite. PLUS VITE.', death: 'Le dernier… battement.' },
    mech: ['Bourgeons et pulsations', 'Elle bourgeonne : les bourgeons la protègent et éclosent en la soignant et en lâchant des monstres ; chaque pulsation envoie une onde.'],
    strategy: 'Détruisez les bourgeons avant leur éclosion (la barre de leur vie est basse) ; sautez l\'onde par esquive à chaque pulsation. Tous les bourgeons détruits : cœur à nu, étourdie 6 s.',
    phases: ph3([[1, ['jm_veins', 'jm_acid_rain', 'jm_tendrils'], 1], [0.66, ['jm_veins', 'jm_acid_rain', 'jm_tendrils', 'jm_bloom'], 1.1], [0.33, ['jm_veins', 'jm_tendrils', 'jm_bloom', 'jm_acid_rain', 'summon'], 1.25, 1.1, 0.8]], { phase2: 'Fleurissez, mes enfants.', phase3: 'Plus vite. PLUS VITE.' }, 'La Matrice'),
    mechOpts: { links: { kind: 'add', model: 'boss_bourgeon', n: [3, 4, 5], R: 8.5, hp: 0.05, armorPer: 0.15, regrow: [22, 18, 14], color: 0xff7ac8, bloom: { time: 14, heal: 0.04, spawn: 2 }, onAll: { stagger: 6, chip: 0.05, text: 'CŒUR À NU' } }, pulse: { every: [3.4, 2.8, 2.2] } },
    rewards: [['graine_de_chair', 0.7, [1, 3]], ['nectar_rouge', 0.5, [1, 2]], ['coeur_boss', 0.8, [1, 2]]],
    gear: { id: 'coeur_de_la_matrice', slot: 'amulette', name: 'Cœur de la Matrice', icon: '🫀', classes: null, rankReq: 'A', rarity: 'legendaire', shares: { pvMax: 0.45, pvMaxPct: 0.15, defense: 0.2, intelligence: 0.2 }, effect: { id: 'pulsation', name: 'Pulsation', desc: 'Toutes les 4 s, un battement vous soigne de 1,5 % de vos PV max.' } } });
  // 11 --------------------------------------------------------------
  fin('abime_prince_cendres', { name: 'Malzahar-Cendre', title: 'Le Prince des Cendres', rank: 'S', icon: '⛓️', color: 0xff5a1a, element: 'feu', speed: 2.4, resist: { feu: 0.8 }, weak: { glace: 1.4 }, summon: 'abime_diablotin_braise',
    lore: 'On l\'a enchaîné au fond de l\'abîme à l\'aube du premier feu. Chaque chaîne qu\'il brise libère un peu de sa colère — et un peu plus de lave. Il ne cherche pas à sortir : il cherche à vous rendre le fond.',
    lines: { intro: 'Les chaînes… tiennent. Pour l\'instant.', phase2: 'Une chaîne de moins. Sentez-vous la chaleur ?', phase3: 'La lave monte avec ma colère !', phase4: 'LIBRE ! PLUS PERSONNE POUR ME RETENIR !', death: 'Enchaîné… de nouveau… et pour toujours.' },
    mech: ['Chaînes et lave montante', 'Il brise une chaîne par phase (sa portée s\'allonge) ; la lave monte par à-coups : seuls les îlots sont sûrs. Retenu par ses chaînes, il est vulnérable ; en pleine lave, presque invincible.'],
    strategy: 'Quand la lave monte (avertissement), rejoignez un îlot. Frappez-le quand il est retenu par ses chaînes ; esquivez le fouet et les fissures. Phase finale : plus de chaînes, courez d\'îlot en îlot.',
    phases: PH([1, ['pc_lava_bomb', 'pc_chain_whip', 'pc_fissure'], 1], [0.72, ['pc_lava_bomb', 'pc_chain_whip', 'pc_magma_wave', 'pc_fissure'], 1.1, 1, 1, bn('Le Prince des Cendres', 'Une chaîne de moins. Sentez-vous la chaleur ?')], [0.45, ['pc_magma_wave', 'pc_chain_whip', 'pc_fissure', 'pc_eruption', 'pc_lava_bomb'], 1.2, 1.08, 0.9, bn('Le Prince des Cendres', 'La lave monte avec ma colère !')], [0.2, ['pc_eruption', 'pc_infernal_nova', 'pc_magma_wave', 'pc_chain_whip', 'pc_fissure', 'pc_lava_bomb'], 1.38, 1.15, 0.75, bn('Le Prince des Cendres', 'LIBRE ! PLUS PERSONNE POUR ME RETENIR !')]),
    mechOpts: { lavarise: { islands: 3, isl: 3.2, cycle: [16, 13, 10, 8], leash: [4.5, 7.5, 10.5, 99], first: 12 } },
    rewards: [['cendre_infernale', 0.7, [1, 3]], ['maillon_brise', 0.7, [1, 3]], ['coeur_boss', 0.9, [1, 2]]],
    gear: { id: 'chaine_du_prince', slot: 'amulette', name: 'Chaîne du Prince', icon: '⛓️', classes: null, rankReq: 'S', rarity: 'mythique', shares: { force: 0.3, intelligence: 0.3, dmg_feu: 0.25, pvMax: 0.15 }, effect: { id: 'chaine_ardente', name: 'Chaîne ardente', desc: 'Toutes les 4 s, vos coups déclenchent une explosion de feu autour de vous (4× vos dégâts).' } } });
  // 12 --------------------------------------------------------------
  fin('obs_oeil_qui_regarde', { name: 'L\'Œil', title: 'L\'Œil qui Regarde', rank: 'Z', icon: '👁️', color: 0xb48cff, element: 'ombre', speed: 0.3, scale: 1.0, legendary: true, resist: { ombre: 0.4 }, weak: { sacre: 1.4 }, summon: 'obs_fragment_neant', attackCd: 2.3,
    lore: 'Ce qui regarde depuis l\'autre côté de tous les portails n\'a ni nom ni visage, seulement une attention. Chaque fois qu\'il cligne, une étoile s\'éteint. Tant qu\'il vous regarde, vous existez à peu près.',
    lines: { intro: 'Je vous regarde.', phase2: 'Une étoile de moins.', phase3: 'Votre ciel s\'éteint.', phase4: 'CLIGNEZ… ET VOUS N\'ÉTIEZ PAS.', death: 'Je… cesse… de regarder.' },
    mech: ['Constellation et oubli', 'Ses paupières le protègent ; il dessine une constellation dans le ciel (un puzzle d\'étoiles à activer dans l\'ordre) et chaque phase éteint un secteur de la salle : l\'oubli y efface.'],
    strategy: 'Reproduisez la constellation en touchant les étoiles dans l\'ordre ; réussir ouvre sa paupière (vulnérable, étourdi). Évitez les secteurs éteints et les piliers de couverture contre ses regards.',
    phases: PH([1, ['oq_gaze', 'oq_comet', 'oq_star_burst'], 1], [0.72, ['oq_gaze', 'oq_comet', 'oq_star_burst', 'oq_iris_nova'], 1.1, 1, 1, bn('L\'Œil qui Regarde', 'Une étoile de moins.')], [0.45, ['oq_gaze', 'oq_comet', 'oq_iris_nova', 'oq_star_burst'], 1.22, 1.08, 0.9, bn('L\'Œil qui Regarde', 'Votre ciel s\'éteint.')], [0.2, ['oq_iris_nova', 'oq_gaze', 'oq_star_burst', 'oq_comet', 'beam_sweep'], 1.4, 1.15, 0.72, bn('L\'Œil qui Regarde', 'CLIGNEZ… ET VOUS N\'ÉTIEZ PAS.')]),
    mechOpts: { constellation: { n: [4, 5, 6, 6], every: 22, armor: 0.4 }, cover: { pillars: 3 } },
    rewards: [['poussiere_d_etoile_morte', 0.8, [1, 3]], ['eclat_du_neant', 0.4, [1, 2]], ['coeur_boss', 1, [1, 3]]],
    gear: { id: 'lentille_de_l_oeil', slot: 'amulette', name: 'Lentille de l\'Œil', icon: '👁️', classes: null, rankReq: 'Z', rarity: 'mythique', shares: { intelligence: 0.3, critDmg: 0.3, crit: 0.2, cdr: 0.2 }, effect: { id: 'regard_neant', name: 'Regard du néant', desc: 'Toutes les 10 s, votre prochain coup inflige le double de dégâts.' } } });
  // 13 --------------------------------------------------------------
  fin('foire_grand_marionnettiste', { name: 'Maître Fil', title: 'Le Grand Marionnettiste', rank: 'C', icon: '🎪', color: 0xffd23a, element: 'physique', speed: 2.3, weak: { feu: 1.3, foudre: 1.2 }, summon: 'foire_pantin_ficelle',
    lore: 'Il tire les ficelles de toute la foire : les clowns, les chevaux de bois, les rires. Il en cherchait une dernière, la vôtre. Coupez ses fils et il tombera comme les autres : en s\'excusant.',
    lines: { intro: 'Mesdames, messieurs… le spectacle commence.', phase2: 'Un bis ? Mais certainement !', phase3: 'Le rideau ne tombe jamais.', death: 'Les fils… sont coupés.' },
    mech: ['Ficelles', 'Des fils le relient à des poteaux : tant qu\'ils sont tendus, il est protégé ; il invoque pantins, couteaux et projecteurs.'],
    strategy: 'Coupez ses fils en vous tenant à chaque poteau (maintenez l\'interaction) : chaque fil coupé le fragilise ; tous coupés, il tombe, étourdi 8 s. Évitez les projecteurs et le manège.',
    phases: ph3([[1, ['fm_knives', 'fm_balloons', 'fm_spotlights'], 1], [0.66, ['fm_knives', 'fm_carousel', 'fm_puppet', 'fm_spotlights'], 1.12], [0.33, ['fm_carousel', 'fm_puppet', 'fm_curtain', 'fm_knives', 'fm_balloons'], 1.3, 1.1, 0.8]], { phase2: 'Un bis ? Mais certainement !', phase3: 'Le rideau ne tombe jamais.' }, 'Le Grand Marionnettiste'),
    mechOpts: { links: { kind: 'interact', prop: 'pole', n: [3, 4, 5], R: 8.5, time: 1.6, armor: 0.35, refill: 30, color: 0xffd23a, onOne: { chip: 0.02, text: 'FIL COUPÉ' }, onAll: { stagger: 8, chip: 0.06, text: 'FILS COUPÉS !' } } },
    rewards: [['ticket_de_foire', 0.9, [1, 3]], ['ficelle_maudite', 0.6, [1, 2]], ['coeur_boss', 0.5, [1, 1]]],
    gear: { id: 'gant_du_marionnettiste', slot: 'anneau', name: 'Gant du Marionnettiste', icon: '🧤', classes: null, rankReq: 'C', rarity: 'legendaire', shares: { crit: 0.3, vitesse: 0.2, cdr: 0.3, force: 0.2 }, effect: { id: 'ficelles', name: 'Ficelles', desc: '20 % de chance de restaurer 12 mana à chaque sort lancé.' } } });

  // ---------- mini-boss cachés ----------
  const miniLines = (nm, i, d) => ({ intro: i, phase2: d, phase3: d, death: d });
  const mini = (id, o) => fin(id, Object.assign({ miniboss: true }, o, { phases: PH([1, o.atk[0], 1], [0.5, o.atk[1], 1.2, 1.1, 0.9, bn(o.name, o.lines.phase2)]) }));
  mini('mine_foreuse_vivante', { name: 'Foreuse', title: 'La Foreuse Vivante', rank: 'E', icon: '⚙️', color: 0xcfd6e2, element: 'physique', summon: 'mine_rat_galerie', lore: 'Une machine de forage soudée à des cadavres. Elle creuse parce qu\'elle ne sait plus faire autre chose.', lines: { intro: 'GRRRRZZZ.', phase2: 'ZZZ… PLUS PROFOND.', death: 'Clang.' }, mech: ['Foret frontal', 'Son foret protège sa face : frappez ses flancs.'], strategy: 'Contournez-la : de face, ses dégâts sont réduits.', atk: [['mn_drill', 'slam'], ['mn_drill', 'mn_burrow', 'rock']], mechOpts: { front: { half: 1.3 } }, rewards: [['charbon_maudit', 0.5, [1, 2]]] });
  mini('foret_sorciere_ronces', { name: 'Ronce', title: 'La Sorcière des Ronces', rank: 'E', icon: '🧙', color: 0x9aff66, element: 'poison', summon: 'foret_spore_pleureuse', lore: 'Elle parle aux épines. Les épines lui répondent.', lines: { intro: 'Tu piétines mon jardin.', phase2: 'Épines, à moi.', death: 'Je fane…' }, mech: ['Toiles d\'épines', 'Des ronces ralentissent.'], strategy: 'Évitez les ronces.', atk: [['mn_thorns', 'poison_pools'], ['mn_thorns', 'poison_pools', 'spread']], mechOpts: { webs: { color: 0x3a6a2a } }, rewards: [['seve_noire', 0.5, [1, 2]]] });
  mini('cata_fossoyeur_eternel', { name: 'Fossoyeur', title: 'Le Fossoyeur Éternel', rank: 'D', icon: '⚰️', color: 0x9aff9a, element: 'ombre', summon: 'cata_squelette_niche', lore: 'Il creuse la tombe de ceux qui entrent. Il la creuse toujours trop grande.', lines: { intro: 'Vous êtes en retard.', phase2: 'Plus profond.', death: 'Reposez… en paix.' }, mech: ['Pierres tombales', 'Des stèles le protègent.'], strategy: 'Brisez les stèles.', atk: [['mn_shovel', 'slam'], ['mn_shovel', 'slam', 'charge']], mechOpts: { shield: { n: [2, 3], hp: 0.05, orbit: 1.0, stagger: 5, regrow: 16 } }, rewards: [['os_ancien', 0.5, [1, 2]]] });
  mini('chateau_majordome', { name: 'Majordome', title: 'Le Majordome', rank: 'D', icon: '🎩', color: 0xcfd6e2, element: 'ombre', summon: 'chateau_servante_spectrale', lore: 'Il sert encore. Il sert toujours. Il vous servira, sur un plateau.', lines: { intro: 'Madame vous attend.', phase2: 'Le service est terminé.', death: 'Madame… sera déçue.' }, mech: ['Service parfait', 'Il riposte sur un geste mal placé.'], strategy: 'Attendez que son plateau retombe.', atk: [['mn_cutlery', 'charge'], ['mn_cutlery', 'zigzag_rush', 'spread']], mechOpts: { riposte: { every: 9, dur: 3 } }, rewards: [['argenterie_hantee', 0.5, [1, 2]]] });
  mini('cathe_kraken_orgue', { name: 'Orgue-Kraken', title: 'Le Kraken de l\'Orgue', rank: 'C', icon: '🎹', color: 0x6affd8, element: 'glace', summon: 'cathe_meduse_cierge', lore: 'Un kraken s\'est niché dans les tuyaux de l\'orgue. Il joue ce qu\'il peut.', lines: { intro: 'Do… ré… mort.', phase2: 'Fortissimo.', death: 'Dernière note.' }, mech: ['Marée de la nef', 'L\'eau gagne le bord.'], strategy: 'Restez au centre.', atk: [['mn_notes', 'slam'], ['mn_notes', 'ring_gap', 'slam']], mechOpts: { collapse: { from: 14, to: [14, 11], dps: 0.1 } }, rewards: [['perle_noire', 0.4, [1, 1]]] });
  mini('temple_grand_pretre', { name: 'Grand Prêtre', title: 'Le Grand Prêtre', rank: 'C', icon: '🗡️', color: 0xff3030, element: 'feu', summon: 'temple_acolyte_saignant', lore: 'Il officiait avant le dieu. Il officie encore.', lines: { intro: 'Offrez-vous.', phase2: 'Le couteau est prêt.', death: 'Mon dieu… m\'abandonne.' }, mech: ['Ossuaires numérotés', 'Autels à détruire dans l\'ordre.'], strategy: 'Autels dans l\'ordre.', atk: [['mn_dagger', 'summon'], ['mn_dagger', 'summon', 'spread']], mechOpts: { order: { n: [3, 3], hp: 0.05, kind: 'boss_totem' } }, rewards: [['rubis_de_sang', 0.4, [1, 1]]] });
  mini('asile_chirurgien', { name: 'Chirurgien', title: 'Le Chirurgien', rank: 'B', icon: '🔪', color: 0x9a6aff, element: 'foudre', summon: 'asile_docteur_aiguilles', lore: 'Il opère. Il n\'a jamais fini une opération.', lines: { intro: 'Ne bougez pas.', phase2: 'Anesthésie… superflue.', death: 'Suture… ratée.' }, mech: ['Disparition', 'Il disparaît et opère par surprise.'], strategy: 'Révélez-le avec un sort de zone.', atk: [['mn_scalpels', 'zigzag_rush'], ['mn_scalpels', 'blade_grid', 'zigzag_rush']], mechOpts: { hidden: { every: 12, dur: 4 } }, rewards: [['fragment_de_faille', 0.4, [1, 1]]] });
  mini('biblio_index_vivant', { name: 'Index', title: 'L\'Index Vivant', rank: 'B', icon: '🗄️', color: 0xe0c060, element: 'ombre', summon: 'biblio_page_tranchante', lore: 'Il connaît tous les livres. Il vous connaît déjà.', lines: { intro: 'Classé : danger.', phase2: 'Tiroir ouvert.', death: 'Rangé.' }, mech: ['Sceaux d\'archive', 'Des sceaux apparaissent.'], strategy: 'Courez dans le sceau.', atk: [['mn_index', 'nova'], ['mn_index', 'nova', 'blade_grid']], mechOpts: { sigils: { every: 15, n: 2 } }, rewards: [['page_arrachee', 0.5, [1, 2]]] });
  mini('necropole_bourreau_givre', { name: 'Bourreau', title: 'Le Bourreau de Givre', rank: 'A', icon: '🪓', color: 0x4ac8ff, element: 'glace', summon: 'necropole_chevalier_fige', lore: 'Il exécute depuis l\'hiver. Il n\'a jamais raté un coup.', lines: { intro: 'À genoux.', phase2: 'Tête haute, alors.', death: 'Hache… émoussée.' }, mech: ['Garde frontale', 'Frappez-le de dos.'], strategy: 'Contournez.', atk: [['mn_axe', 'slam'], ['mn_axe', 'slam', 'nova']], mechOpts: { front: { half: 1.4 } }, rewards: [['givre_eternel', 0.4, [1, 1]]] });
  mini('jardin_jardinier_chef', { name: 'Jardinier-Chef', title: 'Le Jardinier-Chef', rank: 'A', icon: '✂️', color: 0x9aff66, element: 'poison', summon: 'jardin_jardinier', lore: 'Il taille. Il taille tout.', lines: { intro: 'Je dois… tailler.', phase2: 'Trop de branches.', death: 'Plus rien… à tailler.' }, mech: ['Mares de sève', 'Il se soigne dans la sève.'], strategy: 'Éloignez-le des mares.', atk: [['mn_shears', 'poison_pools'], ['mn_shears', 'poison_pools', 'spread']], mechOpts: { pools: { heal: 0.01 } }, rewards: [['graine_de_chair', 0.5, [1, 2]]] });
  mini('abime_bourreau_chaines', { name: 'Chaînier', title: 'Le Bourreau des Chaînes', rank: 'S', icon: '⛓️', color: 0xff5a1a, element: 'feu', summon: 'abime_diablotin_braise', lore: 'Il enchaîne. Il ne sait plus comment défaire.', lines: { intro: 'Les chaînes vous attendent.', phase2: 'Plus serré.', death: 'Chaîne… rompue.' }, mech: ['Riposte de fer', 'Il riposte parfois.'], strategy: 'Frappez entre les postures.', atk: [['pc_chain_whip', 'slam'], ['pc_chain_whip', 'slam', 'pc_fissure']], mechOpts: { riposte: { every: 10, dur: 3 } }, rewards: [['maillon_brise', 0.5, [1, 2]]] });
  mini('obs_horloger_cosmique', { name: 'Horloger', title: 'L\'Horloger Cosmique', rank: 'Z', icon: '🕰️', color: 0xffd23a, element: 'ombre', summon: 'obs_fragment_neant', lore: 'Il remonte les étoiles. Elles sont en retard.', lines: { intro: 'Vous êtes en retard.', phase2: 'Trop tard, maintenant.', death: 'Le temps… s\'arrête.' }, mech: ['Reflets du temps', 'Des échos temporels le rejoignent.'], strategy: 'Frappez l\'original.', atk: [['mn_clock', 'nova'], ['mn_clock', 'ring_gap', 'nova']], mechOpts: { echoes: { n: [2, 3], every: 18 } }, rewards: [['poussiere_d_etoile_morte', 0.5, [1, 2]]] });
  mini('foire_homme_canon', { name: 'Homme-Canon', title: 'L\'Homme-Canon', rank: 'C', icon: '💥', color: 0xffd23a, element: 'physique', summon: 'foire_clown_triste', lore: 'Il a été tiré trop de fois. Il tire à son tour.', lines: { intro: 'Pas de filet ?!', phase2: 'Feu à volonté !', death: 'Boum…' }, mech: ['Bouclier de canon', 'Garde frontale.'], strategy: 'Contournez le canon.', atk: [['mn_cannon', 'charge'], ['mn_cannon', 'charge', 'spread']], mechOpts: { front: { half: 1.3 } }, rewards: [['ticket_de_foire', 0.5, [1, 2]]] });

  // ---------- adds de mécaniques v5 ----------
  MON.boss_racine = addDef('boss_racine', 'Racine', 'boss_racine', { pv: 40 });
  MON.boss_niche = addDef('boss_niche', 'Niche d\'ossements', 'boss_niche', { pv: 40 });
  MON.boss_bourgeon = addDef('boss_bourgeon', 'Bourgeon', 'boss_bourgeon', { pv: 40 });
  MON.boss_mot = addDef('boss_mot', 'Mot vivant', 'boss_mot', { pv: 30, ai: 'boss_static' });

  G.MONSTERS = G.MONSTERS || {};
  Object.keys(MON).forEach(k => { if (!G.MONSTERS[k]) G.MONSTERS[k] = MON[k]; });

  G.BOSSES = Object.assign(G.BOSSES || {}, BOSSES);
  G.BossInfo = { rankTable: RK, addDefs: MON, registerItems, materials: MATS, fin, mini, PH, ph3, bn,
    define(kind, id, o) { const b = kind === 'mini' ? mini(id, o) : fin(id, o); G.BOSSES[id] = BOSSES[id]; if (kind !== 'mini') G.BossInfo.finals.push(id); else G.BossInfo.minis.push(id); return b; },
    addMaterial(id, m) { MATS[id] = m; }, finals: Object.keys(BOSSES).filter(k => BOSSES[k].exclusive && !BOSSES[k].miniboss), minis: Object.keys(BOSSES).filter(k => BOSSES[k].exclusive && BOSSES[k].miniboss) };
  registerItems();
})();
