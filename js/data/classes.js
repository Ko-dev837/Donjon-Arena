window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v5 « Ténèbres » — js/data/classes.js   (Agent 1 Game Designer) → G.CLASSES
   Spécification complète : /home/claude/donjon3d/CLASS-DESIGN.md (kits, synergies, ressources).
   8 classes : Guerrier, Mage, Voleur, Assassin, Archer, Paladin, Elementaliste, Necromancien (SECRÈTE, 0,01 %).

   Champs v5 :
     resource  {id, name, max, regen, gain, color, desc, parts?}  ressource secondaire (id 'mana' = aucune)
     basic     {skillId}                         attaque de base (cast1)
     defaultSkills {cast2, cast3, super}         kit de départ (l'ultime se débloque à ultimate.unlockLevel)
     unlocks   [{level, skillId}]                déblocages par niveau (5/10/15/20/25)
     ultimate  {skillId, unlockLevel}
     specs     [{id, name, desc, unlockLevel, skillId}]  skillId = compétence exclusive de la spé
     forge     {epee, dague, feu} = Arme de classe / Focalisateur / Relique : {name, desc, perks:{5,10}}
   Budget d'équilibrage : stats de base ± 10 % de « puissance × survie » ; seule la répartition change (voir CLASS-DESIGN §1).
   ===================================================================== */
(() => {
  'use strict';
  const F = (name, desc, p5, p10) => ({ name, desc, perks: { 5: p5, 10: p10 } });

  const CLASSES = {
    Guerrier: {
      id: 'Guerrier', name: 'Guerrier', icon: '🛡️', color: 0x3a86ff, colorCss: '#3a86ff', secret: false,
      rarityText: 'Classe de départ — courante',
      desc: "Rempart d'acier : enchaîne les Taillades, charge pour étourdir, brise les étourdis d'un Fracas. Plus il encaisse, plus sa Rage monte.",
      lore: "Forgés dans les arènes des garnisons, les guerriers tiennent la ligne là où les autres reculent.",
      role: 'Mêlée — tank offensif, contrôle de proximité',
      base: { pv: 120, mana: 50, force: 14, vitesse: 5.0, defense: 9, intelligence: 4, crit: 0.05, critDmg: 1.5 },
      perLevel: { pv: 11, mana: 2.5, force: 1.6, defense: 0.7, intelligence: 0.3 },
      resource: { id: 'rage', name: 'Rage', max: 100, regen: -4, color: '#e0402c',
        gain: '+4 par Taillade, +6 par compétence qui touche, +1 par 1 % de PV perdus ; −4/s après 5 s de calme. +0,25 % dégâts/point ; ≥ 50 : −10 % dégâts subis. L\'ultime consomme tout.' },
      basic: { skillId: 'guerrier_frappe' },
      defaultSkills: { cast2: 'guerrier_charge', cast3: 'guerrier_fracas', super: 'guerrier_colere_titan' },
      ultimate: { skillId: 'guerrier_colere_titan', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'guerrier_cri' }, { level: 10, skillId: 'guerrier_cuirasse' }, { level: 15, skillId: 'guerrier_hache' },
        { level: 20, skillId: 'guerrier_tourbillon' }, { level: 25, skillId: 'guerrier_indomptable' },
      ],
      passive: { id: 'guerrier_peau_de_fer', name: 'Peau de fer', desc: 'Réduit de 8 % les dégâts subis ; la Rage décroît 50 % moins vite sous 50 % de PV.' },
      specs: [
        { id: 'gardien', name: 'Rempart', desc: '+20 % de défense, −10 % de dégâts subis, Cri +40 % de portée. Débloque Bastion (provocation, renvoi de dégâts).', unlockLevel: 15, skillId: 'guerrier_bastion' },
        { id: 'berserker', name: 'Berserker', desc: '+20 % de dégâts, +8 % de vol de vie, −15 % de défense, +6 Rage par coup. Débloque Frénésie sanglante.', unlockLevel: 15, skillId: 'guerrier_frenesie' },
      ],
      forge: {
        epee: F("Épée-lige", "Votre arme de classe : améliore la Taillade (dégâts, vitesse).", 'Taillade : le 3e coup balaie 150°.', 'Taillade : +1 Rage par coup et onde de choc au 3e coup.'),
        dague: F("Étendard de guerre", "Votre focalisateur : améliore Charge, Fracas et vos compétences.", 'Charge et Fracas : −1 s de recharge.', 'Fracas : fissure plus longue et Charge étourdit une cible de plus.'),
        feu: F("Cœur de Titan", "Votre relique : améliore Colère du Titan.", 'Colère du Titan : +1 s de durée.', 'Colère du Titan : garde 25 % de la Rage consommée.'),
      },
      evolutions: [
        { rank: 'C', name: 'Champion', desc: 'Un guerrier reconnu par les arènes.' },
        { rank: 'A', name: 'Seigneur de guerre', desc: 'Sa seule présence galvanise les rangs.' },
        { rank: 'S', name: 'Titan d\'acier', desc: 'Légende vivante du champ de bataille.' },
      ],
      selectAnim: 'guerrier', sfx: { select: 'slam' }, aura: 0x3a86ff,
    },
    Mage: {
      id: 'Mage', name: 'Mage', icon: '🔮', color: 0x9d4edd, colorCss: '#9d4edd', secret: false,
      rarityText: 'Classe de départ — courante',
      desc: "Canon de verre arcanique : incantations puissantes, brûlures et rayons. Chaque sort différent enchaîné empile un Écho. Fragile et lent en lançant.",
      lore: 'Les mages de la Tour Pourpre paient leur puissance en fragilité : un seul coup bien placé les arrête.',
      role: 'Distance — dégâts de zone, canon de verre',
      base: { pv: 78, mana: 110, force: 4, vitesse: 5.2, defense: 2, intelligence: 15, crit: 0.06, critDmg: 1.5 },
      perLevel: { pv: 7.5, mana: 5.5, force: 0.4, defense: 0.3, intelligence: 1.9 },
      resource: { id: 'mana', name: 'Mana (Écho arcanique)', max: 0, regen: 0, color: '#9d4edd',
        gain: 'Pas de ressource secondaire. Écho arcanique : chaque sort différent lancé dans les 4 s donne +10 % au sort suivant (max 3). ≥ 80 % de mana : +10 % de dégâts.' },
      basic: { skillId: 'mage_trait_arcanique' },
      defaultSkills: { cast2: 'mage_orbe_braise', cast3: 'mage_rayon', super: 'mage_cataclysme' },
      ultimate: { skillId: 'mage_cataclysme', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'mage_pas_arcanique' }, { level: 10, skillId: 'mage_meteore' }, { level: 15, skillId: 'mage_maitrise_flux' },
        { level: 20, skillId: 'mage_egide' }, { level: 25, skillId: 'mage_surcharge' },
      ],
      passive: { id: 'mage_flux_arcanique', name: 'Flux arcanique', desc: '+25 % de régénération de mana ; le Trait arcanique rend 2 mana par touche.' },
      specs: [
        { id: 'pyromancien', name: 'Pyromancien', desc: '+25 % de dégâts de feu, brûlures contagieuses. Débloque Brasier (jardin de flammes).', unlockLevel: 15, skillId: 'mage_brasier' },
        { id: 'archimage', name: 'Archimage', desc: '−20 % de recharge, +30 % de mana max. Débloque Doublon d\'incantation (sorts lancés deux fois).', unlockLevel: 15, skillId: 'mage_doublon' },
      ],
      forge: {
        epee: F('Bâton arcanique', 'Votre arme de classe : améliore le Trait arcanique.', 'Trait arcanique : +1 mana par touche.', 'Trait arcanique : perce 2 ennemis.'),
        dague: F("Grimoire d'écho", 'Votre focalisateur : améliore vos sorts actifs.', 'Les sorts coûtent −10 % de mana.', 'Écho : +5 % supplémentaires par stack.'),
        feu: F('Orbe pourpre', 'Votre relique : améliore Cataclysme.', 'Cataclysme : rayon +1 m.', 'Cataclysme : incantation 0,5 s plus courte.'),
      },
      evolutions: [
        { rank: 'C', name: 'Magicien d\'élite', desc: 'Maîtrise les flux arcaniques.' },
        { rank: 'A', name: 'Archimage', desc: 'Ses sorts plient la salle à sa volonté.' },
        { rank: 'S', name: 'Sage des cendres', desc: 'Le feu lui obéit comme un animal fidèle.' },
      ],
      selectAnim: 'mage', sfx: { select: 'fire' }, aura: 0x9d4edd,
    },
    Voleur: {
      id: 'Voleur', name: 'Voleur', icon: '🗡️', color: 0x2a9d8f, colorCss: '#2a9d8f', secret: false,
      rarityText: 'Classe de départ — courante',
      desc: 'Larron des toits : lance des couteaux qui se plantent, puis les rappelle d\'un geste. Rapide, insaisissable, bon butin ; dégâts modestes.',
      lore: 'Dans les ruelles du port, on dit que le Voleur est déjà parti quand on sent la lame.',
      role: 'Distance courte — harcèlement mobile et butin',
      base: { pv: 95, mana: 60, force: 10, vitesse: 6.2, defense: 4, intelligence: 5, crit: 0.12, critDmg: 1.6 },
      perLevel: { pv: 9.5, mana: 3, force: 1.2, defense: 0.5, intelligence: 0.5 },
      resource: { id: 'lames', name: 'Lames', max: 6, regen: 1.2, color: '#2a9d8f',
        gain: 'Regen 1,2/s. Couteau de lancer −1, Éventail −3 ; Rappel rend 1 Lame par stack. Les lames touchées se plantent (stack, max 5/ennemi, +4 % dégâts subis chacun).' },
      basic: { skillId: 'voleur_lancer' },
      defaultSkills: { cast2: 'voleur_eventail', cast3: 'voleur_rappel', super: 'voleur_mille_couteaux' },
      ultimate: { skillId: 'voleur_mille_couteaux', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'voleur_glissade' }, { level: 10, skillId: 'voleur_fumigene' }, { level: 15, skillId: 'voleur_doigts_agiles' },
        { level: 20, skillId: 'voleur_grappin' }, { level: 25, skillId: 'voleur_maitre_voleur' },
      ],
      passive: { id: 'voleur_pas_de_velours', name: 'Pas de velours', desc: '+8 % d\'esquive ; la glissade a 20 % de recharge en moins ; 10 % de chance de lâcher de l\'or quand un couteau touche.' },
      specs: [
        { id: 'lame_fantome', name: 'Virtuose', desc: '8 Lames max, +30 % de régénération, le couteau en lance 2. Débloque Valse spectrale.', unlockLevel: 15, skillId: 'voleur_valse' },
        { id: 'larron', name: 'Larron', desc: '+30 % d\'or et de butin, poison sur les couteaux, −10 % de dégâts directs. Débloque Pillage.', unlockLevel: 15, skillId: 'voleur_pillage' },
      ],
      forge: {
        epee: F('Lames de lancer', 'Votre arme de classe : améliore le Couteau de lancer.', 'Couteau : 20 % de chance de lancer 2 couteaux.', 'Couteau : perce 2 ennemis.'),
        dague: F('Trousse du larron', 'Votre focalisateur : améliore Éventail, Rappel et vos ruses.', 'Éventail : +2 lames.', 'Rappel : détone aussi les stacks en chaîne (50 %).'),
        feu: F('Butin maudit', 'Votre relique : améliore Ballet des mille couteaux.', 'Ballet : +1 s de durée.', 'Ballet : Rappel final +40 %.'),
      },
      evolutions: [
        { rank: 'C', name: 'Fine lame', desc: 'Chaque lame trouve son but.' },
        { rank: 'A', name: 'Maître des ombres vives', desc: 'Insaisissable, même à découvert.' },
        { rank: 'S', name: 'Spectre des toits', desc: 'On ne l\'a jamais vu ; on a seulement vu ses cibles tomber.' },
      ],
      selectAnim: 'voleur', sfx: { select: 'dash' }, aura: 0x2a9d8f,
    },
    Assassin: {
      id: 'Assassin', name: 'Assassin', icon: '🥷', color: 0xe63946, colorCss: '#e63946', secret: false,
      rarityText: 'Classe — peu courante',
      desc: "Faucheur de l'ombre : saute dans le dos, enchaîne les Entailles, accumule du Combo et exécute. Très fort et très fragile : tout est question de placement.",
      lore: 'Formés par la Confrérie du Voile, ils ne combattent jamais deux fois le même ennemi.',
      role: 'Mêlée — burst, dos et marque, exécutions',
      base: { pv: 88, mana: 70, force: 12, vitesse: 6.6, defense: 3, intelligence: 5, crit: 0.18, critDmg: 1.9 },
      perLevel: { pv: 8.8, mana: 3.5, force: 1.5, defense: 0.4, intelligence: 0.5 },
      resource: { id: 'combo', name: 'Combo', max: 5, regen: 0, color: '#e63946',
        gain: '+1 par coup dans le dos, +1 au 3e coup du combo, +1 par active qui touche. Perdu après 6 s sans toucher (−1 si touché). +6 % dégâts de base par point. L\'Exécution consomme tout.' },
      basic: { skillId: 'assassin_entaille' },
      defaultSkills: { cast2: 'assassin_pas_ombre', cast3: 'assassin_execution', super: 'assassin_danse_ombres' },
      ultimate: { skillId: 'assassin_danse_ombres', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'assassin_sentence' }, { level: 10, skillId: 'assassin_voile' }, { level: 15, skillId: 'assassin_instinct' },
        { level: 20, skillId: 'assassin_leurre' }, { level: 25, skillId: 'assassin_faucheur' },
      ],
      passive: { id: 'assassin_coup_fatal', name: 'Coup fatal', desc: '+50 % de dégâts dans le dos ou sur un ennemi marqué ; +100 % sous 20 % de PV ; +6 % de critique dans le dos.' },
      specs: [
        { id: 'ombre', name: 'Ombre', desc: '+12 % dégâts d\'ombre, +5 % esquive, Pas de l\'ombre −30 % de recharge. Débloque Double d\'ombre.', unlockLevel: 15, skillId: 'assassin_double' },
        { id: 'venimeux', name: 'Venimeux', desc: '+25 % dégâts de poison, les Entailles empoisonnent (5 charges). Débloque Lames de venin.', unlockLevel: 15, skillId: 'assassin_lames_venin' },
      ],
      forge: {
        epee: F('Lames jumelles', 'Votre arme de classe : améliore l\'Entaille.', 'Entaille : +10 % de critique dans le dos.', 'Entaille : 4 coups, le 3e et le 4e donnent du Combo.'),
        dague: F('Fiole du Voile', 'Votre focalisateur : améliore Pas de l\'ombre, Exécution et vos ruses.', 'Pas de l\'ombre : −1 s de recharge.', 'Exécution : conserve 1 point de Combo.'),
        feu: F('Masque sans visage', 'Votre relique : améliore Danse des ombres.', 'Danse : +1 cible.', 'Danse : invulnérable 1 s de plus.'),
      },
      evolutions: [
        { rank: 'C', name: 'Lame silencieuse', desc: 'Ses pas ne font plus aucun bruit.' },
        { rank: 'A', name: 'Faucheur de nuit', desc: 'La nuit lui appartient.' },
        { rank: 'S', name: 'Ombre sans visage', desc: 'Nul ne se souvient de l\'avoir vu.' },
      ],
      selectAnim: 'assassin', sfx: { select: 'dash' }, aura: 0xe63946,
    },
    Archer: {
      id: 'Archer', name: 'Archer', icon: '🏹', color: 0x3f9a50, colorCss: '#3f9a50', secret: false,
      rarityText: 'Classe — peu courante',
      desc: 'Garde-forêt : tirs chargés, pièges puis pluie de flèches. Plus la cible est loin et plus il est concentré, plus la flèche mord.',
      lore: 'Les Gardes-forêt de Sylvanie tirent avant que le monstre ne sache qu\'il est chassé.',
      role: 'Distance — dégâts soutenus, contrôle par pièges',
      base: { pv: 95, mana: 70, force: 10, vitesse: 5.9, defense: 4, intelligence: 6, crit: 0.14, critDmg: 1.6 },
      perLevel: { pv: 9.5, mana: 3.5, force: 1.2, defense: 0.5, intelligence: 0.7 },
      resource: { id: 'concentration', name: 'Concentration', max: 100, regen: 18, color: '#3f9a50',
        gain: '+18/s immobile, +3/s en marchant, +8 par flèche qui touche ; −25 si touché ; −10/s après 8 s sans tirer. À 100 : Visée parfaite (prochain tir critique garanti +50 %, consomme tout).' },
      basic: { skillId: 'archer_tir' },
      defaultSkills: { cast2: 'archer_piege', cast3: 'archer_pluie', super: 'archer_etoile_filante' },
      ultimate: { skillId: 'archer_etoile_filante', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'archer_saut_arriere' }, { level: 10, skillId: 'archer_tir_choc' }, { level: 15, skillId: 'archer_oeil_aigle' },
        { level: 20, skillId: 'archer_carreau' }, { level: 25, skillId: 'archer_maitre_chasseur' },
      ],
      passive: { id: 'archer_oeil_de_lynx', name: 'Œil de lynx', desc: 'Jusqu\'à +25 % de dégâts selon l\'éloignement de la cible (plein à 15 m) ; +15 % de critique sur tir pleinement chargé.' },
      specs: [
        { id: 'tireur_elite', name: 'Tireur d\'élite', desc: 'Crit +6 %, dégâts critiques +25 %, le tir chargé perce tout. Débloque Tir de précision.', unlockLevel: 15, skillId: 'archer_tir_precis' },
        { id: 'traqueur', name: 'Traqueur', desc: '+15 % de vitesse, un piège gratuit toutes les 10 s, pièges −25 % de recharge. Débloque Faucon de chasse.', unlockLevel: 15, skillId: 'archer_faucon' },
      ],
      forge: {
        epee: F('Arc long', 'Votre arme de classe : améliore le Tir tendu.', 'Tir tendu : charge 15 % plus rapide.', 'Tir tendu : la flèche pleinement chargée perce 2 ennemis.'),
        dague: F('Carquois ouvragé', 'Votre focalisateur : améliore Pièges, Pluie et vos compétences.', 'Pièges : une charge de plus.', 'Pluie : zone +0,8 m et dégâts en 2 salves de plus.'),
        feu: F('Talisman de Sylvanie', 'Votre relique : améliore Étoile filante.', 'Étoile filante : visée 0,3 s plus courte.', 'Étoile filante : marque +10 % de dégâts.'),
      },
      evolutions: [
        { rank: 'C', name: 'Tireur émérite', desc: 'Chaque flèche touche où il regarde.' },
        { rank: 'A', name: 'Faucon des cimes', desc: 'Voit tout, atteint tout.' },
        { rank: 'S', name: 'Arc des constellations', desc: 'Ses flèches tracent des étoiles.' },
      ],
      selectAnim: 'archer', sfx: { select: 'arrow' }, aura: 0x3f9a50,
    },
    Paladin: {
      id: 'Paladin', name: 'Paladin', icon: '⚜️', color: 0xffc933, colorCss: '#ffc933', secret: false,
      rarityText: 'Classe — peu courante',
      desc: "Rempart de l'Aube : bouclier, marteau du jugement, soins. Encaisse, accumule de la Foi et la transforme en lumière. Peu de dégâts, presque indestructible.",
      lore: 'L\'Ordre de l\'Aube prête serment : la lumière ne recule jamais.',
      role: 'Mêlée — tank et soutien sacré',
      base: { pv: 130, mana: 70, force: 11, vitesse: 4.9, defense: 11, intelligence: 8, crit: 0.05, critDmg: 1.5 },
      perLevel: { pv: 11, mana: 3.5, force: 1.1, defense: 0.65, intelligence: 0.9 },
      resource: { id: 'foi', name: 'Foi', max: 100, regen: -3, color: '#ffc933',
        gain: '+4 par coup de masse, +1 par 1 % de PV absorbé/perdu, +5 par soin ; −3/s hors combat. Les compétences ★ consomment 30 Foi pour +50 % d\'effet ; ≥ 50 : dégâts sacrés +15 %.' },
      basic: { skillId: 'paladin_masse' },
      defaultSkills: { cast2: 'paladin_bouclier', cast3: 'paladin_marteau', super: 'paladin_verdict' },
      ultimate: { skillId: 'paladin_verdict', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'paladin_terre_sacree' }, { level: 10, skillId: 'paladin_charge_radieuse' }, { level: 15, skillId: 'paladin_egide' },
        { level: 20, skillId: 'paladin_imposition' }, { level: 25, skillId: 'paladin_sursaut' },
      ],
      passive: { id: 'paladin_lumiere_gardienne', name: 'Lumière gardienne', desc: 'Régénère 1 % des PV max par seconde hors combat ; les dégâts sacrés soignent 4 % des PV max une fois par seconde.' },
      specs: [
        { id: 'protecteur', name: 'Protecteur', desc: '+30 % de défense, boucliers +50 %. Débloque Phalange sacrée.', unlockLevel: 15, skillId: 'paladin_phalange' },
        { id: 'croise', name: 'Croisé', desc: '+25 % de dégâts sacrés, jugements brûlants. Débloque Châtiment divin.', unlockLevel: 15, skillId: 'paladin_chatiment_divin' },
      ],
      forge: {
        epee: F('Masse bénie', 'Votre arme de classe : améliore le Coup de masse bénie.', 'Masse : +2 Foi par coup.', 'Masse : le 3e coup lance une onde sacrée.'),
        dague: F('Livre des serments', 'Votre focalisateur : améliore Bouclier, Marteau et soins.', 'Bouclier : +10 % d\'absorption.', 'Marteau : 3e marteau et Jugé +10 %.'),
        feu: F("Relique de l'Aube", 'Votre relique : améliore Verdict de l\'Aube.', 'Verdict : sol sacré +2 s.', 'Verdict : soigne aussi 15 % PV max aux alliés.'),
      },
      evolutions: [
        { rank: 'C', name: 'Chevalier de l\'Aube', desc: 'Premier de l\'Ordre à franchir la porte.' },
        { rank: 'A', name: 'Templier radieux', desc: 'Son bouclier est un soleil.' },
        { rank: 'S', name: 'Archange-lige', desc: 'Même la mort hésite à le toucher.' },
      ],
      selectAnim: 'paladin', sfx: { select: 'upgrade' }, aura: 0xffc933,
    },
    Elementaliste: {
      id: 'Elementaliste', name: 'Élémentaliste', icon: '⚡', color: 0x5ad1ff, colorCss: '#5ad1ff', secret: false,
      rarityText: 'Classe — rare',
      desc: 'Danseur de la tempête gelée : alterne glace et foudre, accumule des charges, fait éclater les gelés et fusionne les éléments. Le meilleur contrôle, mais il faut jouer juste.',
      lore: 'Nés d\'une tempête gelée, les élémentalistes dansent entre deux forces opposées.',
      role: 'Distance — contrôle et combos élémentaires',
      base: { pv: 88, mana: 115, force: 4, vitesse: 5.4, defense: 3, intelligence: 14, crit: 0.08, critDmg: 1.5 },
      perLevel: { pv: 8.8, mana: 5.5, force: 0.4, defense: 0.4, intelligence: 1.8 },
      resource: { id: 'charges', name: 'Charges élémentaires', max: 3, regen: 0, color: '#5ad1ff',
        parts: [{ id: 'givre', name: 'Givre', max: 3, color: '#8fdcff' }, { id: 'orage', name: 'Orage', max: 3, color: '#fff04a' }],
        gain: '+1 Givre par sort de glace, +1 Orage par sort de foudre (basic : 1 tous les 2 tirs) ; durée 10 s. Givre : gel +0,25 s et ralentissement +8 %/charge ; 2 Orage : +1 rebond. Fusion consomme 1 Givre + 1 Orage.' },
      basic: { skillId: 'elementaliste_arc' },
      defaultSkills: { cast2: 'elementaliste_chaine', cast3: 'elementaliste_nova', super: 'elementaliste_tempete' },
      ultimate: { skillId: 'elementaliste_tempete', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'elementaliste_fusion' }, { level: 10, skillId: 'elementaliste_lance' }, { level: 15, skillId: 'elementaliste_resonance' },
        { level: 20, skillId: 'elementaliste_orage' }, { level: 25, skillId: 'elementaliste_zenith' },
      ],
      passive: { id: 'elementaliste_dualite', name: 'Dualité', desc: 'Un sort de glace renforce de 25 % le prochain sort de foudre pendant 5 s (et inversement) ; les ennemis gelés subissent +40 % de foudre et le gel se brise en éclats.' },
      specs: [
        { id: 'tempete', name: 'Tempête', desc: 'Foudre +15 %, +2 rebonds, la Chaîne étourdit. Débloque Sphère d\'orage.', unlockLevel: 15, skillId: 'elementaliste_sphere' },
        { id: 'cryomancien', name: 'Cryomancien', desc: 'Glace +15 %, gel plus long, éclats +20 %. Débloque Mur de glace.', unlockLevel: 15, skillId: 'elementaliste_mur_glace' },
      ],
      forge: {
        epee: F('Sceptre de tempête', 'Votre arme de classe : améliore l\'Arc élémentaire.', 'Arc : le tir de glace perce 1 ennemi.', 'Arc : chaque tir donne 1 charge.'),
        dague: F('Cristal jumeau', 'Votre focalisateur : améliore vos sorts actifs.', 'Chaîne : +1 rebond, Nova : +0,5 m.', 'Fusion et Éclatement +20 %.'),
        feu: F('Cœur du zénith', 'Votre relique : améliore Tempête du zénith.', 'Tempête : +1 s.', 'Tempête : rayon +1,5 m, les gelés prennent +20 %.'),
      },
      evolutions: [
        { rank: 'C', name: 'Invocateur de tempêtes', desc: 'Le ciel répond à ses mains.' },
        { rank: 'A', name: 'Maître des éléments', desc: 'Glace et foudre ne font qu\'un.' },
        { rank: 'S', name: 'Avatar du zénith', desc: 'Il est l\'hiver et l\'éclair.' },
      ],
      selectAnim: 'elementaliste', sfx: { select: 'boom' }, aura: 0x5ad1ff,
    },
    Necromancien: {
      id: 'Necromancien', name: 'Nécromancien', icon: '💀', color: 0x7a35e0, colorCss: '#7a35e0', secret: true,
      rarityText: '1 chance sur 10 000 (0,01 %)',
      desc: 'Classe secrète. Il ne combat pas seul : il lève une armée d\'ombres, arrache les âmes des vaincus, les dépense pour des explosions et des pactes. Fragile, mais jamais seul.',
      lore: 'Une seule âme sur dix mille entend l\'appel des morts. Ceux qui répondent ne reviennent jamais seuls.',
      role: 'Invocateur — armée de serviteurs et âmes',
      base: { pv: 80, mana: 120, force: 4, vitesse: 5.3, defense: 3, intelligence: 18, crit: 0.05, critDmg: 1.5, minionCap: 3 },
      perLevel: { pv: 8, mana: 6, force: 0.4, defense: 0.4, intelligence: 1.0 },
      resource: { id: 'ames', name: 'Âmes', max: 10, regen: 0, color: '#7a35e0',
        gain: '+1 par ennemi tué par vous ou un serviteur (+3 élite, +5 boss) ; 30 % perdues à votre mort. +2 % dégâts/PV des serviteurs par Âme. Dépensées par Explosion d\'ombre (≤5), Armée des morts (≤4) et Pacte d\'âmes (≤5).' },
      basic: { skillId: 'necro_basic' },
      defaultSkills: { cast2: 'necro_invoke', cast3: 'necro_extract', super: 'necro_sovereign' },
      ultimate: { skillId: 'necro_sovereign', unlockLevel: 5 },
      unlocks: [
        { level: 5, skillId: 'necro_mark' }, { level: 10, skillId: 'necro_blast' }, { level: 15, skillId: 'necro_souls' },
        { level: 20, skillId: 'necro_army' }, { level: 25, skillId: 'necro_command' },
      ],
      passive: { id: 'necro_seigneur_des_morts', name: 'Seigneur des morts', desc: 'Les serviteurs gagnent +15 % de dégâts et de PV ; une mise à mort par vous ou un serviteur rend 2 % du mana.' },
      specs: [
        { id: 'necro_legion', name: 'Maître de légion', desc: '+1 serviteur actif, −15 % de dégâts et PV chacun. Débloque Charnier.', unlockLevel: 15, skillId: 'necro_charnier' },
        { id: 'necro_elite', name: 'Seigneur d\'élite', desc: '−1 serviteur actif, +50 % de dégâts et PV chacun, +25 % d\'extraction. Débloque Pacte d\'âmes.', unlockLevel: 15, skillId: 'necro_pacte' },
      ],
      forge: {
        epee: F("Faux d'âme", 'Votre arme de classe : améliore le Projectile d\'âme.', 'Projectile : +1 mana par touche.', 'Projectile : 15 % de chance de donner 1 Âme.'),
        dague: F('Phylactère', 'Votre focalisateur : améliore Invocation, Extraction et vos compétences.', 'Extraction : +5 % de chance.', 'Invocation : serviteurs arrivent avec +20 % de bouclier.'),
        feu: F('Crâne-relique', 'Votre relique : améliore Souverain des Ombres.', 'Souverain : +2 s.', 'Souverain : +1 garde d\'ombre et +4 %/Âme supplémentaire.'),
      },
      evolutions: [
        { rank: 'C', name: 'Appeleur d\'âmes', desc: 'Les morts répondent à son murmure.' },
        { rank: 'A', name: 'Seigneur des limbes', desc: 'Son armée n\'a jamais d\'ombre : elle en est une.' },
        { rank: 'S', name: 'Souverain des tombes', desc: 'Les royaumes des morts lui doivent allégeance.' },
      ],
      selectAnim: 'necromancien', sfx: { select: 'bossRoar' }, aura: 0x7a35e0,
    },
  };

  G.CLASSES = Object.assign(G.CLASSES || {}, CLASSES);
  // ordre d'affichage (la classe secrète en dernier)
  G.CLASS_ORDER = ['Guerrier', 'Mage', 'Voleur', 'Assassin', 'Archer', 'Paladin', 'Elementaliste', 'Necromancien'];
  // aides : classes visibles à la création
  G.CLASS_LIST = (includeSecret) => G.CLASS_ORDER.map(id => G.CLASSES[id]).filter(c => c && (includeSecret || !c.secret));
})();
