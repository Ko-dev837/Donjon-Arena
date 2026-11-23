window.G = window.G || {};
/* =====================================================================
 * Donjon Arena 3D v5 « Ténèbres » — js/data/dungeons.js (agent 5) -> G.DUNGEONS, G.DungeonsMeta
 * Liste officielle : /home/claude/donjon3d/DUNGEON-IDS.md
 *
 * Chaque donjon est UNIQUE : architecture propre (theme = id G.GFX.registerTheme, js/gfx/dungeon-themes.js),
 * population exclusive, pièges et mécanismes propres, secrets, événements rares, récompenses et boss exclusifs.
 * Champs (contrat v3 §8 + v5) :
 *   {id,name,icon,desc,lore,ambiance,rank,type,theme,tint,element,
 *    ambience, music,                       // ids G.Audio (agent 9)
 *    monsters, elites, rares, secretCreature, minibosses (visibles, souvent []), hiddenMiniboss (salle secrète),
 *    boss, fallback:{monsters,elites,minibosses,boss,rares,secretCreature,hiddenMiniboss} (ids v2/v3 EXISTANTS),
 *    rooms:{min,max}, mechanics:[...], traps:[ids de pièges propres], secrets:{kinds:[...], hint, puzzle},
 *    events:[{id,name,icon,kind,desc}] (événements rares propres), horror:{level, statue},
 *    rewards:{gold:[a,b], xp, lootTier, guaranteed:[...], exclusive:[ids], secret:[ids], bossGear:[ids]}, secret?:{condition,hint}}
 * G.DungeonsMeta.resolve(tpl, hasMonster, hasBoss) remplace les ids inconnus par ceux de `fallback`.
 * ===================================================================== */
(() => {
  const D = {};
  const add = (o) => { D[o.id] = o; };

  /* ======================= RANG E ======================= */
  add({ id:'mine_abandonnee', name:'La Mine Abandonnée', icon:'⛏️', rank:'E', type:'classique', theme:'mine_abandonnee', tint:null, element:'physique',
    ambience:'amb_mine', music:'mus_mine',
    desc:'Des galeries étayées où les mineurs ont percé une faille. On entend encore les pioches… mais plus personne ne remonte.',
    lore:'Le filon de Haute-Suie promettait la fortune. Le jour où la foreuse a touché la faille, les lanternes se sont éteintes d\'un coup, et les mineurs ont continué à creuser — sans respirer.',
    ambiance:'Poutres qui craquent, rails rouillés, wagonnets immobiles, lanternes qui vacillent, gouttes dans le noir.',
    monsters:['mine_mineur_possede','mine_rat_galerie','mine_chauve_souris_suie','mine_rampant_puits','mine_lanterne_errante','mine_creuseur_aveugle','mine_dynamiteur'],
    elites:['mine_contremaitre_maudit'], rares:['mine_mineur_dore'], secretCreature:'mine_enfant_des_puits',
    minibosses:[], hiddenMiniboss:'mine_foreuse_vivante', boss:'mine_golem_grisou',
    fallback:{ monsters:['squelette','chauve_souris','slime','squelette_archer'], elites:['squelette_elite'], minibosses:[], boss:'golem', rares:['specimen_dore'], secretCreature:'mimique', hiddenMiniboss:'golem' },
    rooms:{min:4,max:5}, mechanics:[],
    traps:['eboulement','wagonnet_fou','poche_grisou','lanternes_soufflees'],
    secrets:{ kinds:['mur','levier'], hint:'Un étai a été scié… le mur derrière sonne creux.', puzzle:null },
    events:[ { id:'chant_des_puits', name:'Le chant des puits', icon:'🎶', kind:'apparition', desc:'Une voix d\'enfant chante au fond d\'un puits.' },
             { id:'filon_dore', name:'Filon doré', icon:'🪙', kind:'tresor', desc:'Une veine d\'or affleure entre deux étais.' } ],
    horror:{ level:0.35, statue:'mineur' },
    rewards:{ gold:[21,48], xp:48, lootTier:1, guaranteed:['materiau_commun'], exclusive:['charbon_maudit','lanterne_du_mineur'], secret:['lanterne_du_mineur'], bossGear:['pioche_de_grisou'] } });

  add({ id:'foret_interdite', name:'La Forêt Interdite', icon:'🌲', rank:'E', type:'classique', theme:'foret_interdite', tint:null, element:'poison',
    ambience:'amb_foret', music:'mus_foret',
    desc:'Une forêt de troncs géants où la brume rampe au sol. Les sentiers changent de place quand on ne les regarde pas.',
    lore:'Les bûcherons y avaient planté des épouvantails pour éloigner les corbeaux. Aujourd\'hui, ce sont les corbeaux qui gardent les épouvantails.',
    ambiance:'Brume au ras du sol, champignons qui luisent, feux follets, craquements derrière vous.',
    monsters:['foret_rodeur_brume','foret_loup_creux','foret_araignee_sylve','foret_spore_pleureuse','foret_corbeau_charognard','foret_epouvantail','foret_chasseur_egare'],
    elites:['foret_ent_pourri'], rares:['foret_cerf_blanc'], secretCreature:'foret_fee_noire',
    minibosses:[], hiddenMiniboss:'foret_sorciere_ronces', boss:'foret_roi_sylve',
    fallback:{ monsters:['araignee','slime_moussu','archer_sylvestre','chauve_souris_foret'], elites:['araignee_elite'], minibosses:[], boss:'spiderQueen', rares:['specimen_dore'], secretCreature:'chauve_souris_foret', hiddenMiniboss:'spiderQueen' },
    rooms:{min:4,max:5}, mechanics:['brouillard'],
    traps:['racines_saisissantes','brume_rampante','champignons_spores','piege_a_loup'],
    secrets:{ kinds:['symbole','mur'], hint:'Un cercle de champignons ne luit qu\'à moitié…', puzzle:'cercle' },
    events:[ { id:'lumiere_fee', name:'La lumière qui guide', icon:'✨', kind:'apparition', desc:'Une petite lumière noire vous fait signe de la suivre.' },
             { id:'chasse_nocturne', name:'Chasse nocturne', icon:'🐺', kind:'embuscade', desc:'Des hurlements se rapprochent de tous les côtés.' } ],
    horror:{ level:0.4, statue:'epouvantail' },
    rewards:{ gold:[24,52], xp:52, lootTier:1, guaranteed:['materiau_poison'], exclusive:['seve_noire','bois_de_cerf_blanc'], secret:['bois_de_cerf_blanc'], bossGear:['couronne_de_ronces'] } });

  /* ======================= RANG D ======================= */
  add({ id:'catacombes_oubliees', name:'Les Catacombes Oubliées', icon:'💀', rank:'D', type:'horde', theme:'catacombes_oubliees', tint:null, element:'ombre',
    ambience:'amb_catacombes', music:'mus_catacombes',
    desc:'Des couloirs étroits bordés de niches remplies d\'os. Chaque crâne vous suit des orbites — et certains sortent de leur niche.',
    lore:'Personne ne se souvient de qui a creusé ces galeries. Les morts, eux, se souviennent de tout, et ils ne supportent plus le silence.',
    ambiance:'Voûtes basses, bougies de suif, os qui roulent tout seuls, pleurs lointains.',
    monsters:['cata_squelette_niche','cata_goule','cata_ossuaire_rampant','cata_pleureuse','cata_rat_cadavre','cata_lanceur_os','cata_porteur_cercueil'],
    elites:['cata_gardien_ossuaire'], rares:['cata_crane_dore'], secretCreature:'cata_moine_sans_visage',
    minibosses:[], hiddenMiniboss:'cata_fossoyeur_eternel', boss:'cata_roi_ossements',
    fallback:{ monsters:['squelette_guerrier','squelette_lanceur','spectre','chauve_souris_os'], elites:['chevalier_elite'], minibosses:[], boss:'skeletonKing', rares:['squelette_dore'], secretCreature:'fossoyeur', hiddenMiniboss:'gardien_sceau' },
    rooms:{min:4,max:6}, mechanics:['horde'],
    traps:['niches_ossements','dalles_effondrees','souffle_fosse','sarcophage_eveille'],
    secrets:{ kinds:['symbole','mur','levier'], hint:'Un crâne est tourné vers le mur, contrairement aux autres.', puzzle:'ordre' },
    events:[ { id:'procession', name:'La procession', icon:'🕯️', kind:'apparition', desc:'Une file de moines sans visage traverse la salle sans vous voir.' },
             { id:'ossuaire_dore', name:'Ossuaire doré', icon:'🪙', kind:'tresor', desc:'Des crânes dorés brillent dans une niche.' } ],
    horror:{ level:0.5, statue:'moine' },
    rewards:{ gold:[64,128], xp:126, lootTier:2, guaranteed:['materiau_commun'], exclusive:['os_ancien','poussiere_funeraire'], secret:['poussiere_funeraire'], bossGear:['couronne_d_ossements'] } });

  add({ id:'chateau_maudit', name:'Le Château Maudit', icon:'🏰', rank:'D', type:'classique', theme:'chateau_maudit', tint:null, element:'ombre',
    ambience:'amb_chateau', music:'mus_chateau',
    desc:'Un château figé au soir d\'un bal. Les armures montent la garde, les lustres se balancent, et les portraits vous regardent passer.',
    lore:'La Comtesse donnait un bal tous les cent ans. Ses invités ne sont jamais repartis : ils dansent encore, quelque part entre les miroirs.',
    ambiance:'Damier de marbre, tapis rouge déchiré, horloge qui sonne treize coups, valse au loin.',
    monsters:['chateau_armure_hantee','chateau_servante_spectrale','chateau_page_sans_tete','chateau_portrait_vivant','chateau_chandelier_ardent','chateau_rat_cour','chateau_dogue_maudit'],
    elites:['chateau_chevalier_noir'], rares:['chateau_bouffon_rieur'], secretCreature:'chateau_enfant_au_miroir',
    minibosses:[], hiddenMiniboss:'chateau_majordome', boss:'chateau_comtesse_ecarlate',
    fallback:{ monsters:['chevalier_spectral','spectre','squelette_guerrier','chauve_souris_os'], elites:['chevalier_elite'], minibosses:[], boss:'lich', rares:['specimen_dore'], secretCreature:'spectre', hiddenMiniboss:'skeletonKing' },
    rooms:{min:5,max:6}, mechanics:[],
    traps:['armures_animees','lustre_qui_tombe','portes_qui_claquent','trappe_oubliettes'],
    secrets:{ kinds:['levier','mur'], hint:'Un chandelier mural est tordu vers le bas…', puzzle:null },
    events:[ { id:'bal_des_morts', name:'Le bal des morts', icon:'💃', kind:'apparition', desc:'Des silhouettes dansent une valse silencieuse… et vous invitent.' },
             { id:'argenterie', name:'L\'argenterie de la Comtesse', icon:'🍷', kind:'tresor', desc:'Une table encore dressée, couverts d\'argent compris.' } ],
    horror:{ level:0.5, statue:'armure' },
    rewards:{ gold:[71,135], xp:136, lootTier:2, guaranteed:['materiau_rare'], exclusive:['velours_maudit','argenterie_hantee'], secret:['argenterie_hantee'], bossGear:['bague_de_la_comtesse'] } });

  /* ======================= RANG C ======================= */
  add({ id:'cathedrale_noyee', name:'La Cathédrale Noyée', icon:'⛪', rank:'C', type:'elementaire', theme:'cathedrale_noyee', tint:null, element:'glace',
    ambience:'amb_cathedrale', music:'mus_cathedrale',
    desc:'Une nef engloutie où l\'eau monte et descend comme une respiration. Les anges de pierre ne restent jamais tout à fait à leur place.',
    lore:'La mer a pris la cathédrale un matin de messe. Le chœur n\'a jamais cessé de chanter ; il chante seulement plus bas, sous l\'eau.',
    ambiance:'Vitraux bleus, bancs renversés, ombres de poissons sous l\'eau, cloche qui sonne seule.',
    monsters:['cathe_choriste_noye','cathe_murene_nef','cathe_pretre_noye','cathe_crabe_reliquaire','cathe_meduse_cierge','cathe_ange_pleureur'],
    elites:['cathe_eveque_abysses'], rares:['cathe_perle_vivante'], secretCreature:'cathe_sonneur_noye',
    minibosses:[], hiddenMiniboss:'cathe_kraken_orgue', boss:'cathe_mere_des_marees',
    fallback:{ monsters:['murene_spectrale','spectre_abyssal','chevalier_abyssal','naga_marais'], elites:['spectre_elite'], minibosses:[], boss:'leviathan', rares:['specimen_dore'], secretCreature:'spectre_abyssal', hiddenMiniboss:'kraken_mineur' },
    rooms:{min:5,max:6}, mechanics:['maree'],
    traps:['montee_des_eaux','courant_nef','cloche_assourdissante','vitrail_brise'],
    secrets:{ kinds:['symbole','levier'], hint:'L\'orgue noyé ne joue que trois notes. Laquelle manque ?', puzzle:'ordre' },
    events:[ { id:'messe_engloutie', name:'La messe engloutie', icon:'🔔', kind:'apparition', desc:'La cloche sonne trois fois. Le chœur noyé se tourne vers vous.' },
             { id:'reliquaire', name:'Le reliquaire flottant', icon:'💎', kind:'tresor', desc:'Un coffret doré dérive sur l\'eau noire.' } ],
    horror:{ level:0.6, statue:'ange' },
    rewards:{ gold:[115,218], xp:201, lootTier:3, guaranteed:['perle_abyssale'], exclusive:['perle_noire','eau_benite_corrompue'], secret:['eau_benite_corrompue'], bossGear:['diademe_des_marees'] } });

  add({ id:'temple_sanglant', name:'Le Temple Sanglant', icon:'🩸', rank:'C', type:'classique', theme:'temple_sanglant', tint:null, element:'feu',
    ambience:'amb_temple', music:'mus_temple',
    desc:'Un temple où le sang coule dans des canaux lumineux. Les dalles gravées n\'attendent qu\'un pas de trop.',
    lore:'Les prêtres nourrissaient un dieu qui n\'existait pas. À force d\'offrandes, il a fini par exister.',
    ambiance:'Tambours lents, glyphes rouges qui pulsent, braseros, gouttes épaisses.',
    monsters:['temple_acolyte_saignant','temple_flagellant','temple_pretresse_hemorragie','temple_chien_sacrificiel','temple_masque_d_or','temple_sangsue_geante','temple_porte_lame'],
    elites:['temple_bourreau'], rares:['temple_idole_doree'], secretCreature:'temple_oracle_aveugle',
    minibosses:[], hiddenMiniboss:'temple_grand_pretre', boss:'temple_dieu_ecorche',
    fallback:{ monsters:['diablotin','diablotin_cracheur','squelette_guerrier','mante_acier'], elites:['diablotin_elite'], minibosses:[], boss:'demon', rares:['specimen_dore'], secretCreature:'archonte_voile', hiddenMiniboss:'maitre_forgeron' },
    rooms:{min:5,max:6}, mechanics:['sanctuaires'],
    traps:['dalles_sacrificielles','lames_pendulaires','canaux_de_sang','glyphes_brulants'],
    secrets:{ kinds:['symbole','levier'], hint:'Les glyphes s\'allument dans un ordre précis… regardez bien.', puzzle:'ordre' },
    events:[ { id:'offrande', name:'L\'autel affamé', icon:'🩸', kind:'pacte', desc:'L\'autel réclame du sang. Il paie toujours ses dettes.' },
             { id:'idole', name:'L\'idole d\'or', icon:'🗿', kind:'tresor', desc:'Une idole dorée trône sur un socle… piégé ?' } ],
    horror:{ level:0.55, statue:'masque' },
    rewards:{ gold:[126,241], xp:213, lootTier:3, guaranteed:['materiau_rare'], exclusive:['rubis_de_sang','glyphe_brise'], secret:['glyphe_brise'], bossGear:['masque_ecorche'] } });

  /* ======================= RANG B ======================= */
  add({ id:'asile_failles', name:'L\'Asile des Failles', icon:'🏥', rank:'B', type:'classique', theme:'asile_failles', tint:null, element:'foudre',
    ambience:'amb_asile', music:'mus_asile',
    desc:'Un établissement où l\'on a ouvert la première faille « pour soigner ». Les néons grésillent, les cellules ne sont plus fermées.',
    lore:'Le Directeur pensait que la faille guérirait les esprits. Elle les a seulement emmenés ailleurs, et a laissé les corps derrière.',
    ambiance:'Carrelage taché, lits renversés, néons qui clignotent, failles violettes qui respirent dans les murs.',
    monsters:['asile_patient_fracture','asile_infirmiere_sans_visage','asile_camisole','asile_echo_hurlant','asile_ombre_sous_le_lit','asile_docteur_aiguilles','asile_poupee_recousue'],
    elites:['asile_gardien_camisole'], rares:['asile_dossier_vivant'], secretCreature:'asile_patient_zero',
    minibosses:[], hiddenMiniboss:'asile_chirurgien', boss:'asile_directeur_faille',
    fallback:{ monsters:['ame_instable','ombre_rampante','elementaire_foudre','spectre'], elites:['spectre_elite'], minibosses:[], boss:'lich', rares:['specimen_dore'], secretCreature:'ame_instable', hiddenMiniboss:'gardien_faille' },
    rooms:{min:5,max:6}, mechanics:['tenebres','foudre_statique'],
    traps:['neons_grilles','portes_cellules','faille_instable','sol_electrifie'],
    secrets:{ kinds:['levier','mur','symbole'], hint:'Un disjoncteur pend dans un coin, à moitié arraché.', puzzle:null },
    events:[ { id:'visite_medicale', name:'La visite', icon:'📋', kind:'apparition', desc:'Un dossier à votre nom attend sur un lit. Il est déjà rempli.' },
             { id:'pharmacie', name:'La pharmacie', icon:'💊', kind:'tresor', desc:'Une armoire à pharmacie, encore pleine.' } ],
    horror:{ level:0.75, statue:'patient' },
    rewards:{ gold:[171,314], xp:291, lootTier:4, guaranteed:['eclat_faille'], exclusive:['fragment_de_faille','dossier_scelle'], secret:['dossier_scelle'], bossGear:['blouse_du_directeur'] } });

  add({ id:'bibliotheque_engloutie', name:'La Bibliothèque Engloutie', icon:'📚', rank:'B', type:'contrainte', theme:'bibliotheque_engloutie', tint:null, element:'ombre',
    ambience:'amb_bibliotheque', music:'mus_bibliotheque',
    desc:'Des rayonnages sans fin noyés d\'encre. Ici, le silence est la règle : chaque sort bruyant attire le Gardien du Silence.',
    lore:'L\'Auteur sans Nom a voulu écrire tout ce qui existe. Quand il a manqué de papier, il a commencé à écrire sur les lecteurs.',
    ambiance:'Livres qui flottent, pages qui tournent seules, encre qui monte, « chut » murmuré derrière vous.',
    monsters:['biblio_grimoire_mordeur','biblio_lecteur_noye','biblio_encre_vivante','biblio_page_tranchante','biblio_gardien_silence','biblio_scribe_spectral'],
    elites:['biblio_conservateur'], rares:['biblio_livre_dore'], secretCreature:'biblio_lectrice_eternelle',
    minibosses:[], hiddenMiniboss:'biblio_index_vivant', boss:'biblio_auteur_sans_nom',
    fallback:{ monsters:['grimoire_vivant','mage_spectral','spectre','squelette_lanceur'], elites:['archiviste_elite'], minibosses:[], boss:'archiviste', rares:['specimen_dore'], secretCreature:'mage_spectral', hiddenMiniboss:'bibliothecaire_fou' },
    rooms:{min:5,max:6}, mechanics:['silence_arcane'],
    traps:['rayonnages_mouvants','encre_montante','silence_absolu','tourbillon_pages'],
    secrets:{ kinds:['levier','symbole','mur'], hint:'Un livre dépasse de l\'étagère, plus usé que les autres.', puzzle:'ordre' },
    events:[ { id:'lecture', name:'La lecture à voix haute', icon:'📖', kind:'apparition', desc:'Une lectrice lit votre histoire… jusqu\'à une page que vous n\'avez pas encore vécue.' },
             { id:'livre_dore', name:'Le livre doré', icon:'📕', kind:'tresor', desc:'Un livre doré flotte, ses pages couvertes de pièces.' } ],
    horror:{ level:0.65, statue:'lecteur' },
    rewards:{ gold:[188,341], xp:322, lootTier:4, guaranteed:['grimoire_fragment'], exclusive:['encre_abyssale','page_arrachee'], secret:['page_arrachee'], bossGear:['plume_sans_nom'] } });

  /* ======================= RANG A ======================= */
  add({ id:'necropole_glace', name:'La Nécropole de Givre', icon:'❄️', rank:'A', type:'classique', theme:'necropole_glace', tint:null, element:'glace',
    ambience:'amb_necropole', music:'mus_necropole',
    desc:'Une cité funéraire figée sous la glace. Le sol glisse, les stalactites tombent, et les chevaliers gelés n\'attendent qu\'un dégel.',
    lore:'Le Roi-Hiver a demandé à mourir avec toute sa cour pour ne jamais vieillir. Le froid a exaucé le vœu à moitié.',
    ambiance:'Blizzard, aurore pâle, glace qui craque, cloche funèbre, souffle visible.',
    monsters:['necropole_momie_givre','necropole_veilleur_gele','necropole_loup_spectral','necropole_pleureuse_givre','necropole_corbeau_givre','necropole_chevalier_fige','necropole_larve_glace'],
    elites:['necropole_gardien_tombe'], rares:['necropole_ame_cristal'], secretCreature:'necropole_reine_endormie',
    minibosses:[], hiddenMiniboss:'necropole_bourreau_givre', boss:'necropole_roi_hiver',
    fallback:{ monsters:['spectre_givre','archer_givre','lynx_givre','chevalier_givre'], elites:['chevalier_givre_elite'], minibosses:[], boss:'frostGiant', rares:['specimen_dore'], secretCreature:'chamane_givre', hiddenMiniboss:'frostGiant' },
    rooms:{min:5,max:7}, mechanics:['sol_gele'],
    traps:['stalactites','tombeaux_geles','blizzard','glace_fragile'],
    secrets:{ kinds:['symbole','mur','levier'], hint:'Une stèle porte des runes encore tièdes.', puzzle:'cercle' },
    events:[ { id:'reine_endormie', name:'La reine endormie', icon:'👑', kind:'apparition', desc:'Dans un cercueil de glace, une reine dort. Ses lèvres bougent.' },
             { id:'tresor_gele', name:'Trésor pris dans la glace', icon:'🧊', kind:'tresor', desc:'Des pièces d\'or prises dans un bloc de glace.' } ],
    horror:{ level:0.7, statue:'chevalier_fige' },
    rewards:{ gold:[218,402], xp:354, lootTier:5, guaranteed:['materiau_rare'], exclusive:['givre_eternel','linceul_gele'], secret:['linceul_gele'], bossGear:['couronne_de_l_hiver'] } });

  add({ id:'jardin_chair', name:'Le Jardin de Chair', icon:'🌺', rank:'A', type:'elementaire', theme:'jardin_chair', tint:null, element:'poison',
    ambience:'amb_jardin', music:'mus_jardin',
    desc:'Un jardin vivant : le sol respire, les haies ont des veines, les fleurs ont des dents. Au centre, quelque chose bat.',
    lore:'Un jardinier a voulu faire pousser une fleur qui ne mourrait jamais. Il a utilisé le seul engrais qui ne s\'épuise pas.',
    ambiance:'Battements sourds, bourdonnements, pollen jaune, sol mou et tiède.',
    monsters:['jardin_fleur_dents','jardin_jardinier','jardin_vigne_veine','jardin_bourgeon_oeil','jardin_essaim_mouches','jardin_epouvantail_chair','jardin_racine_mere'],
    elites:['jardin_greffe'], rares:['jardin_rose_noire'], secretCreature:'jardin_dryade_ecorchee',
    minibosses:[], hiddenMiniboss:'jardin_jardinier_chef', boss:'jardin_matrice',
    fallback:{ monsters:['champignon_bombe','larve_essaim','naga_marais','crapaud_toxique'], elites:['crapaud_ancien'], minibosses:[], boss:'reine_des_vases', rares:['specimen_dore'], secretCreature:'larve_mere', hiddenMiniboss:'hydre_des_marais' },
    rooms:{min:5,max:7}, mechanics:['poison_ambiant','regeneration_ennemie'],
    traps:['veines_pulsantes','pollen_toxique','bulbes_explosifs','sol_respirant'],
    secrets:{ kinds:['symbole','mur','levier'], hint:'Une fleur se referme dès qu\'on la regarde.', puzzle:'cercle' },
    events:[ { id:'greffe', name:'La greffe', icon:'🌱', kind:'pacte', desc:'Une vigne propose de se greffer à votre bras. Elle promet de la force.' },
             { id:'nectar', name:'Le nectar rouge', icon:'🍯', kind:'tresor', desc:'Une fleur géante déborde d\'un nectar précieux.' } ],
    horror:{ level:0.75, statue:'oeil' },
    rewards:{ gold:[268,469], xp:400, lootTier:5, guaranteed:['materiau_poison'], exclusive:['graine_de_chair','nectar_rouge'], secret:['nectar_rouge'], bossGear:['coeur_de_la_matrice'] } });

  /* ======================= RANG S ======================= */
  add({ id:'abime_infernal', name:'L\'Abîme Infernal', icon:'🌋', rank:'S', type:'classique', theme:'abime_infernal', tint:null, element:'feu',
    ambience:'amb_abime', music:'mus_abime',
    desc:'Des ponts de pierre au-dessus de rivières de lave, des cages qui se balancent et des chaînes qui tirent les vivants vers le bas.',
    lore:'Le Prince des Cendres a été enchaîné au fond de l\'abîme par sept chaînes. Il en reste quatre.',
    ambiance:'Grondements, braises qui montent, chaînes qui grincent, hurlements qui remontent du fond.',
    monsters:['abime_damne_enchaine','abime_diablotin_braise','abime_chien_enfers','abime_chainier','abime_ame_brulante','abime_veuve_cendre','abime_colosse_lave'],
    elites:['abime_geolier'], rares:['abime_salamandre_or'], secretCreature:'abime_ange_dechu',
    minibosses:[], hiddenMiniboss:'abime_bourreau_chaines', boss:'abime_prince_cendres',
    fallback:{ monsters:['diablotin','diablotin_cracheur','salamandre_magma','colosse_obsidienne','ver_cendres'], elites:['diablotin_elite'], minibosses:[], boss:'demon', rares:['specimen_dore'], secretCreature:'archonte_voile', hiddenMiniboss:'maitre_forgeron' },
    rooms:{min:5,max:7}, mechanics:['lave_montante','pluie_de_meteores'],
    traps:['geysers_lave','chaines_balancees','pont_effondre','pluie_braises'],
    secrets:{ kinds:['levier','symbole','mur'], hint:'Une cage pend plus bas que les autres. Quelque chose y respire.', puzzle:null },
    events:[ { id:'ange_enchaine', name:'L\'ange enchaîné', icon:'⛓️', kind:'apparition', desc:'Un ange aux ailes brûlées vous supplie de briser sa chaîne.' },
             { id:'forge_damnee', name:'La forge des damnés', icon:'⚒️', kind:'tresor', desc:'Une enclume chauffée à blanc, et des lingots oubliés.' } ],
    horror:{ level:0.8, statue:null },
    rewards:{ gold:[301,569], xp:462, lootTier:5, guaranteed:['materiau_forge_rare'], exclusive:['cendre_infernale','maillon_brise'], secret:['maillon_brise'], bossGear:['chaine_du_prince'] } });

  /* ======================= RANG SS ======================= */
  add({ id:'observatoire_neant', name:'L\'Observatoire du Néant', icon:'🔭', rank:'SS', type:'legendaire', theme:'observatoire_neant', tint:null, element:'ombre',
    ambience:'amb_observatoire', music:'mus_observatoire',
    desc:'Des plates-formes suspendues au-dessus du vide, sous des étoiles qui meurent. Quelque chose regarde par l\'autre bout du télescope.',
    lore:'Le premier Éveillé a construit cet observatoire pour comprendre d\'où venaient les portails. Il a compris. Il n\'est jamais redescendu.',
    ambiance:'Silence spatial, rouages cosmiques, étoiles qui s\'éteignent une à une, battement immense.',
    monsters:['obs_astronome_vide','obs_etoile_morte','obs_oeil_neant','obs_engrenage_vivant','obs_marcheur_entre_mondes','obs_ombre_constellation','obs_fragment_neant'],
    elites:['obs_gardien_orbite'], rares:['obs_comete_errante'], secretCreature:'obs_premier_eveille',
    minibosses:[], hiddenMiniboss:'obs_horloger_cosmique', boss:'obs_oeil_qui_regarde',
    fallback:{ monsters:['spectre_neant','chevalier_neant','horreur_cristalline','sentinelle_faille'], elites:['chevalier_neant'], minibosses:[], boss:'souverain_neant', rares:['specimen_dore'], secretCreature:'archonte_voile', hiddenMiniboss:'general_neant' },
    rooms:{min:6,max:8}, mechanics:['tenebres','gravite_faible','une_vie'],
    traps:['gravite_neant','etoiles_filantes','zone_oubli','anneaux_tournants'],
    secrets:{ kinds:['symbole','levier','mur'], hint:'Trois étoiles du sol ne brillent pas comme les autres.', puzzle:'ordre' },
    events:[ { id:'premier_eveille', name:'Le premier Éveillé', icon:'🧙', kind:'apparition', desc:'Un vieil homme figé devant le télescope murmure : « Ne regardez pas dedans. »' },
             { id:'pluie_etoiles', name:'Pluie d\'étoiles', icon:'🌠', kind:'tresor', desc:'Des éclats d\'étoile tombent en pluie douce.' } ],
    horror:{ level:0.9, statue:'astronome' },
    rewards:{ gold:[509,891], xp:699, lootTier:6, guaranteed:['eclat_neant','objet_mythique'], exclusive:['poussiere_d_etoile_morte','eclat_du_neant'], secret:['poussiere_d_etoile_morte'], bossGear:['lentille_de_l_oeil'] } });

  /* ======================= SPÉCIAUX ======================= */
  add({ id:'foire_pantins', name:'La Foire aux Pantins', icon:'🎪', rank:'C', type:'evenement', theme:'foire_pantins', tint:null, element:'physique',
    ambience:'amb_foire', music:'mus_foire',
    desc:'Une fête foraine qui n\'apparaît que les nuits sans lune. Le manège tourne seul, et les pantins ont toujours faim de spectateurs.',
    lore:'Le Grand Marionnettiste ne voulait pas que la fête s\'arrête. Il a cousu des fils aux visiteurs pour qu\'ils restent.',
    ambiance:'Orgue de barbarie désaccordé, ampoules qui clignotent, rires d\'enfants qui s\'arrêtent net.',
    monsters:['foire_pantin_ficelle','foire_clown_triste','foire_lanceur_couteaux','foire_ballon_rieur','foire_cheval_de_bois','foire_marionnettiste_ombre'],
    elites:['foire_monsieur_loyal'], rares:['foire_ticket_dore'], secretCreature:'foire_diseuse_aventure',
    minibosses:[], hiddenMiniboss:'foire_homme_canon', boss:'foire_grand_marionnettiste',
    fallback:{ monsters:['gladiateur_spectral','squelette_guerrier','gobelin_failles','chaman_gobelin'], elites:['chevalier_elite'], minibosses:[], boss:'maitre_arene', rares:['specimen_dore'], secretCreature:'mimique', hiddenMiniboss:'champion_arene' },
    rooms:{min:4,max:6}, mechanics:['mimiques','ennemis_dores'],
    traps:['manege_fou','boite_a_musique','ampoules_qui_eclatent','couteaux_lances'],
    secrets:{ kinds:['symbole','levier'], hint:'Au stand de tir, trois cibles ne bougent pas.', puzzle:'ordre' },
    events:[ { id:'diseuse', name:'La diseuse de bonne aventure', icon:'🔮', kind:'pacte', desc:'Elle lit votre avenir, contre un peu d\'or… ou de sang.' },
             { id:'gros_lot', name:'Le gros lot', icon:'🎟️', kind:'tresor', desc:'La roue de la fortune tourne encore.' } ],
    horror:{ level:0.6, statue:'pantin' },
    rewards:{ gold:[150,280], xp:230, lootTier:3, guaranteed:['jeton_arene'], exclusive:['ticket_de_foire','ficelle_maudite'], secret:['ficelle_maudite'], bossGear:['gant_du_marionnettiste'] } });

  add({ id:'sanctuaire_ombres', name:'Le Sanctuaire des Ombres', icon:'🌑', rank:'B', type:'secret', theme:'catacombes_oubliees', tint:0x3a1a6b, element:'ombre',
    ambience:'amb_sanctuaire', music:'mus_sanctuaire',
    desc:'Un temple où les morts se souviennent de leur maître. Seul un Nécromancien peut en franchir le seuil.',
    lore:'Avant l\'éveil des premiers invocateurs, ce temple servait de cimetière à leurs serviteurs.',
    ambiance:'Obélisques, soldats d\'ombre agenouillés, murmures de soldats.',
    monsters:['soldat_ombre_errant','spectre_abyssal','squelette_abyssal'], elites:['spectre_elite'], rares:[], secretCreature:null,
    minibosses:['general_oublie'], hiddenMiniboss:null, boss:'gardien_des_ombres',
    fallback:{ monsters:['spectre_abyssal','squelette_abyssal','araignee_abyssale'], elites:['spectre_elite'], minibosses:['gardien_faille'], boss:'lich' },
    rooms:{min:5,max:5}, mechanics:['tenebres','miroir_ombre'], traps:['niches_ossements','souffle_fosse'],
    secrets:{ kinds:['symbole'], hint:'Les ombres ne répondent qu\'à ceux qui commandent les morts.', puzzle:null }, events:[],
    secret:{ condition:{kind:'class', value:'Necromancien'}, hint:'Les ombres ne répondent qu\'à ceux qui commandent les morts.' },
    horror:{ level:0.6, statue:'moine' },
    rewards:{ gold:[314,538], xp:403, lootTier:5, guaranteed:['essence_ombre'], exclusive:[], secret:[], bossGear:[] } });

  /* ======================= ÉPREUVES (G.RANKS_TRIALS) ======================= */
  const TRIALS = [
    ['epreuve_d', 'D', 'golem', 'L\'Arène de l\'Éveillé', ['mine_mineur_possede','foret_loup_creux','mine_rampant_puits'], ['squelette','chauve_souris','slime'], { min:3, max:4 }, 2],
    ['epreuve_c', 'C', 'spiderQueen', 'L\'Arène de l\'Aguerri', ['cata_goule','chateau_page_sans_tete','foret_araignee_sylve'], ['araignee','squelette_guerrier','spectre'], { min:4, max:5 }, 3],
    ['epreuve_b', 'B', 'skeletonKing', 'L\'Arène du Vétéran', ['cathe_choriste_noye','temple_flagellant','cata_porteur_cercueil'], ['squelette_guerrier','squelette_lanceur','chevalier_maudit'], { min:4, max:6 }, 3],
    ['epreuve_a', 'A', 'frostGiant', 'L\'Arène de l\'Élite', ['asile_camisole','biblio_lecteur_noye','temple_bourreau'], ['chevalier_givre','spectre_givre','archer_givre'], { min:5, max:6 }, 4],
    ['epreuve_s', 'S', 'lich', 'L\'Arène de la Légende', ['necropole_chevalier_fige','jardin_jardinier','asile_infirmiere_sans_visage'], ['spectre_abyssal','chevalier_abyssal','squelette_abyssal'], { min:5, max:7 }, 5],
    ['epreuve_ss', 'SS', 'demon', 'L\'Arène du Souverain', ['abime_colosse_lave','abime_chainier','obs_marcheur_entre_mondes'], ['chevalier_infernal','diablotin_cracheur','chevalier_neant'], { min:6, max:8 }, 5],
  ];
  TRIALS.forEach(([id, rank, boss, name, mons, fb, rooms, lt]) => add({ id, name, icon:'⚖️', rank, type:'epreuve', theme:'arene_epreuves', tint:0xffd700, element:'sacre',
    ambience:'amb_epreuve', music:'mus_epreuve',
    desc:'Une épreuve de promotion sous le regard des Juges encapuchonnés. Pas de secret, pas de détour : seulement la valeur.',
    lore:'Les Juges n\'ont jamais parlé. On dit qu\'ils furent les premiers chasseurs à échouer.',
    ambiance:'Arène de pierre noire, braseros, runes dorées, silence des juges.',
    monsters:mons, elites:[mons[2]], rares:[], secretCreature:null, minibosses:[], hiddenMiniboss:null, boss,
    fallback:{ monsters:fb, elites:[fb[0]], minibosses:[], boss },
    rooms, mechanics:[], traps:['glyphes_brulants'], secrets:{ kinds:[], hint:'', puzzle:null }, events:[], noSecret:true,
    horror:{ level:0.2, statue:'juge' },
    rewards:{ gold:[0,0], xp:0, lootTier:lt, guaranteed:[], exclusive:[], secret:[], bossGear:[] } }));

  /* ---------- Normalisation ---------- */
  Object.keys(D).forEach((k) => {
    const d = D[k];
    ['mechanics', 'minibosses', 'elites', 'rares', 'traps', 'events'].forEach((f) => { d[f] = d[f] || []; });
    d.secrets = d.secrets || { kinds: ['mur'], hint: '', puzzle: null };
    d.rewards = d.rewards || {}; d.rewards.guaranteed = d.rewards.guaranteed || [];
    d.fallback = Object.assign({ monsters: ['squelette'], elites: [], minibosses: [], boss: 'golem', rares: [], secretCreature: null, hiddenMiniboss: null }, d.fallback || {});
  });

  // remplace intégralement la liste v3 (donjons recolorés) : les anciens ids restent connus via DungeonsMeta.legacy
  G.DUNGEONS = D;

  /* ---------- Matériaux exclusifs (ajoutés à G.ITEMS.materials s'ils n'y sont pas) ---------- */
  const M = (id, name, icon, rarity, sell, desc) => ({ id, name, icon, kind: 'special', rarity, sell, desc, dungeon: true });
  const MATS = [
    M('charbon_maudit', 'Charbon maudit', '⚫', 'rare', 40, 'Il brûle froid. Ramassé dans la Mine Abandonnée.'),
    M('lanterne_du_mineur', 'Lanterne du mineur', '🏮', 'epique', 180, 'Elle s\'allume seule quand quelqu\'un approche dans le noir.'),
    M('seve_noire', 'Sève noire', '🫗', 'rare', 45, 'Sève de la Forêt Interdite, tiède comme du sang.'),
    M('bois_de_cerf_blanc', 'Bois de cerf blanc', '🦌', 'epique', 200, 'Trophée du cerf qu\'on ne doit pas chasser.'),
    M('os_ancien', 'Os ancien', '🦴', 'rare', 60, 'Un os des Catacombes Oubliées, gravé de noms.'),
    M('poussiere_funeraire', 'Poussière funéraire', '⚱️', 'epique', 220, 'Ce qui reste des premiers morts.'),
    M('velours_maudit', 'Velours maudit', '🟥', 'rare', 70, 'Arraché au tapis rouge du Château Maudit.'),
    M('argenterie_hantee', 'Argenterie hantée', '🍴', 'epique', 260, 'Les couverts de la Comtesse. Ils tintent la nuit.'),
    M('perle_noire', 'Perle noire', '⚫', 'rare', 110, 'Perle de la Cathédrale Noyée.'),
    M('eau_benite_corrompue', 'Eau bénite corrompue', '🫙', 'epique', 300, 'Elle bénit encore, mais pas qui on croit.'),
    M('rubis_de_sang', 'Rubis de sang', '🔴', 'rare', 120, 'Sang du Temple, figé en pierre.'),
    M('glyphe_brise', 'Glyphe brisé', '🔺', 'epique', 320, 'Fragment d\'un glyphe sacrificiel, encore brûlant.'),
    M('fragment_de_faille', 'Fragment de faille', '🟣', 'rare', 160, 'Un éclat violet qui bourdonne.'),
    M('dossier_scelle', 'Dossier scellé', '📁', 'epique', 380, 'Le dossier du patient zéro. Ne l\'ouvrez pas.'),
    M('encre_abyssale', 'Encre abyssale', '🖋️', 'rare', 170, 'Encre de la Bibliothèque Engloutie : elle écrit seule.'),
    M('page_arrachee', 'Page arrachée', '📄', 'epique', 400, 'Une page de l\'Auteur sans Nom. Votre nom y est écrit.'),
    M('givre_eternel', 'Givre éternel', '❄️', 'epique', 260, 'Il ne fond jamais, même au cœur du feu.'),
    M('linceul_gele', 'Linceul gelé', '🧣', 'legendaire', 600, 'Le linceul de la reine endormie.'),
    M('graine_de_chair', 'Graine de chair', '🌰', 'epique', 280, 'Elle bat comme un cœur.'),
    M('nectar_rouge', 'Nectar rouge', '🍯', 'legendaire', 650, 'Une goutte guérit. Deux gouttes changent.'),
    M('cendre_infernale', 'Cendre infernale', '🌫️', 'epique', 330, 'Cendre du Prince, encore rouge.'),
    M('maillon_brise', 'Maillon brisé', '⛓️', 'legendaire', 750, 'Un maillon des sept chaînes. Il en reste quatre.'),
    M('poussiere_d_etoile_morte', 'Poussière d\'étoile morte', '✨', 'legendaire', 900, 'Ce qui reste d\'une étoile éteinte par l\'Œil.'),
    M('eclat_du_neant', 'Éclat du Néant pur', '🕳️', 'mythique', 2800, 'Le Néant, solide. Il absorbe la lumière.'),
    M('ticket_de_foire', 'Ticket de foire', '🎟️', 'rare', 90, 'Admit one. Pour toujours.'),
    M('ficelle_maudite', 'Ficelle maudite', '🧵', 'epique', 280, 'Un fil du Grand Marionnettiste. Il tire tout seul.'),
  ];
  try {
    if (G.ITEMS && G.ITEMS.materials) MATS.forEach((m) => { if (!G.ITEMS.materials[m.id]) G.ITEMS.materials[m.id] = m; });
  } catch (e) { /* items absent */ }

  /* ---------- Anciens donjons v3 (saves) : rang conservé pour les compteurs de rang ---------- */
  const LEGACY = {
    crypte_oubliee: { rank:'E', to:'mine_abandonnee' }, terrier_gobelins: { rank:'E', to:'mine_abandonnee' }, veillee_lanternes: { rank:'E', to:'foret_interdite' },
    foret_murmures: { rank:'D', to:'foret_interdite' }, marais_toxique: { rank:'D', to:'jardin_chair' }, chasse_sauvage: { rank:'D', to:'foret_interdite' }, salle_trois_sceaux: { rank:'D', to:'catacombes_oubliees' },
    catacombes_roi: { rank:'C', to:'catacombes_oubliees' }, arene_vagues: { rank:'C', to:'foire_pantins' }, jardin_os_dores: { rank:'C', to:'catacombes_oubliees' },
    pics_geles: { rank:'B', to:'necropole_glace' }, bibliotheque_interdite: { rank:'B', to:'bibliotheque_engloutie' },
    abysse_sans_fond: { rank:'A', to:'abime_infernal' }, forteresse_celeste: { rank:'A', to:'observatoire_neant' }, necropole_eclipsee: { rank:'A', to:'necropole_glace' },
    coeur_volcan: { rank:'S', to:'abime_infernal' }, coeur_faille: { rank:'S', to:'asile_failles' }, forge_infernale: { rank:'S', to:'abime_infernal' }, chambre_cristal_eteint: { rank:'S', to:'observatoire_neant' },
    trone_neant: { rank:'SS', to:'observatoire_neant' }, epreuve_souverain: { rank:'SS', to:'epreuve_ss' }, sablier_brise: { rank:'SS', to:'observatoire_neant' },
  };
  try { if (G.RANKS_LEGACY_DUNGEONS) Object.keys(LEGACY).forEach((k) => { if (!G.RANKS_LEGACY_DUNGEONS[k]) G.RANKS_LEGACY_DUNGEONS[k] = LEGACY[k].rank; }); } catch (e) { /* rien */ }

  /* ---------- Meta ---------- */
  const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
  const TYPES = {
    classique: 'Donjon standard : salles variées, un boss final.',
    elementaire: 'Dominé par un élément ; dangers environnementaux et ennemis assortis.',
    horde: 'Des nuées d\'ennemis faibles ; massacrez ou soyez submergé.',
    boss: 'Peu de salles, des adversaires redoutables ; duels et boss rush.',
    secret: 'Accès caché : une condition précise doit être remplie. Butin supérieur.',
    legendaire: 'Donjon unique et exceptionnel : récompenses garanties de très haute qualité.',
    vagues: 'Vagues successives ; on tient ou on tombe.',
    contrainte: 'Règles spéciales (temps, interdictions) qui changent la façon de jouer.',
    evenement: 'Portail temporaire aux conditions inhabituelles et au butin amélioré.',
    epreuve: 'Épreuve chronométrée de promotion ou de maîtrise.',
  };
  const MECH = {
    tenebres: ['Ténèbres', 'Vision réduite autour du héros.'],
    sol_gele: ['Sol gelé', 'Le sol glisse : inertie accrue.'],
    pieges_pics: ['Pièges à pics', 'Des pics sortent du sol par intermittence.'],
    lave_montante: ['Lave montante', 'La lave gagne du terrain avec le temps.'],
    chrono: ['Contre-la-montre', 'Temps limité pour réussir.'],
    pas_de_potions: ['Sans potions', 'Les potions sont interdites.'],
    pas_de_roulade: ['Sans roulade', 'La roulade est désactivée.'],
    vagues_infinies: ['Vagues infinies', 'Les vagues s\'enchaînent sans fin, de plus en plus fortes.'],
    eclipse: ['Éclipse', 'Nuit permanente : ennemis plus forts, butin amélioré.'],
    brouillard: ['Brouillard', 'Portée de vue courte.'],
    pluie_de_meteores: ['Pluie de météores', 'Impacts télégraphiés tombant au hasard.'],
    sanctuaires: ['Sanctuaires', 'Bénédictions contre un prix à payer.'],
    mimiques: ['Mimiques', 'Certains coffres mordent.'],
    poison_ambiant: ['Gaz toxique', 'Nuages de poison au sol.'],
    foudre_statique: ['Foudre statique', 'Éclairs télégraphiés près du joueur.'],
    maree: ['Marée', 'Inondations périodiques qui ralentissent et repoussent.'],
    silence_arcane: ['Silence arcanique', 'Les sorts coûtent +50 % de mana.'],
    boss_rush: ['Boss rush', 'Enchaînement de combats de boss sans salles intermédiaires.'],
    horde: ['Horde', 'Effectifs doublés, ennemis plus fragiles.'],
    gravite_faible: ['Gravité faible', 'Projections amplifiées.'],
    miroir_ombre: ['Ombre miroir', 'Une ombre copie vos attaques avec un délai.'],
    une_vie: ['Une seule vie', 'Aucune résurrection, pas de soin de salle.'],
    ennemis_dores: ['Spécimens dorés', 'Chance accrue de monstres dorés (butin riche).'],
    regeneration_ennemie: ['Régénération ennemie', 'Les ennemis se soignent hors combat.'],
    gardien_sceaux: ['Gardiens des sceaux', 'Détruire les sceaux pour ouvrir la salle du boss.'],
  };
  const mechanics = {};
  Object.keys(MECH).forEach((k) => { mechanics[k] = { name: MECH[k][0], desc: MECH[k][1] }; });

  // Pièges propres (noms et descriptions pour l'UI ; implémentation : js/sys/events.js)
  const TRAPS = {
    eboulement: ['Éboulements', 'Des rochers tombent du plafond (ombres au sol).'],
    wagonnet_fou: ['Wagonnet fou', 'Un wagonnet dévale les rails sans prévenir.'],
    poche_grisou: ['Poches de grisou', 'Le gaz s\'enflamme par endroits.'],
    lanternes_soufflees: ['Lanternes soufflées', 'Un courant d\'air éteint les lanternes.'],
    racines_saisissantes: ['Racines saisissantes', 'Des racines jaillissent et immobilisent.'],
    brume_rampante: ['Brume rampante', 'La brume avale la lumière.'],
    champignons_spores: ['Champignons à spores', 'Nuages de spores toxiques.'],
    piege_a_loup: ['Pièges à loup', 'Des mâchoires d\'acier cachées dans l\'herbe.'],
    niches_ossements: ['Niches à ossements', 'Les squelettes sortent des murs.'],
    dalles_effondrees: ['Dalles effondrées', 'Le sol s\'ouvre sur le vide.'],
    souffle_fosse: ['Souffle de la fosse', 'Un souffle glacé éteint les bougies.'],
    sarcophage_eveille: ['Sarcophages éveillés', 'Les couvercles glissent…'],
    armures_animees: ['Armures animées', 'Les armures quittent leur socle.'],
    lustre_qui_tombe: ['Lustres', 'Les lustres se décrochent.'],
    portes_qui_claquent: ['Portes qui claquent', 'Le château respire.'],
    trappe_oubliettes: ['Oubliettes', 'Des trappes s\'ouvrent sous vos pieds.'],
    montee_des_eaux: ['Montée des eaux', 'L\'eau monte et ralentit.'],
    courant_nef: ['Courant', 'Un courant vous pousse.'],
    cloche_assourdissante: ['Cloche', 'La cloche frappe une onde de choc.'],
    vitrail_brise: ['Vitraux brisés', 'Des éclats de verre tombent.'],
    dalles_sacrificielles: ['Dalles sacrificielles', 'Les glyphes s\'embrasent sous vos pas.'],
    lames_pendulaires: ['Lames pendulaires', 'D\'immenses lames balaient la salle.'],
    canaux_de_sang: ['Canaux de sang', 'Le sang soigne les fidèles.'],
    glyphes_brulants: ['Glyphes brûlants', 'Des cercles de feu s\'allument au sol.'],
    neons_grilles: ['Néons grillés', 'Black-out total, quelques secondes.'],
    portes_cellules: ['Portes de cellules', 'Les cellules s\'ouvrent.'],
    faille_instable: ['Faille instable', 'La faille vous happe ailleurs dans la salle.'],
    sol_electrifie: ['Sol électrifié', 'Des dalles crépitent.'],
    rayonnages_mouvants: ['Rayonnages', 'Des livres tombent des étagères.'],
    encre_montante: ['Encre montante', 'L\'encre colle aux pieds.'],
    silence_absolu: ['Silence absolu', 'Le bruit attire le gardien.'],
    tourbillon_pages: ['Tourbillon de pages', 'Des pages tranchantes tourbillonnent.'],
    stalactites: ['Stalactites', 'La glace se détache du plafond.'],
    tombeaux_geles: ['Tombeaux gelés', 'Les morts brisent la glace.'],
    blizzard: ['Blizzard', 'Le vent vous repousse et aveugle.'],
    glace_fragile: ['Glace fragile', 'La glace craque et cède.'],
    veines_pulsantes: ['Veines pulsantes', 'Les veines du sol éclatent.'],
    pollen_toxique: ['Pollen toxique', 'Nuages de pollen.'],
    bulbes_explosifs: ['Bulbes explosifs', 'Les bulbes éclatent quand on s\'approche.'],
    sol_respirant: ['Sol respirant', 'Le sol se soulève et vous aspire.'],
    geysers_lave: ['Geysers de lave', 'La lave jaillit du sol.'],
    chaines_balancees: ['Chaînes balancées', 'De lourdes chaînes balaient la salle.'],
    pont_effondre: ['Ponts qui cèdent', 'La pierre se fissure sous vos pas.'],
    pluie_braises: ['Pluie de braises', 'Des braises tombent du ciel noir.'],
    gravite_neant: ['Gravité du Néant', 'Le vide vous attire.'],
    etoiles_filantes: ['Étoiles filantes', 'Des étoiles mortes s\'écrasent.'],
    zone_oubli: ['Zones d\'oubli', 'L\'obscurité totale engloutit la salle.'],
    anneaux_tournants: ['Anneaux tournants', 'Des anneaux d\'énergie balaient le sol.'],
    manege_fou: ['Manège fou', 'Le manège s\'emballe.'],
    boite_a_musique: ['Boîte à musique', 'Tous s\'arrêtent… puis repartent plus vite.'],
    ampoules_qui_eclatent: ['Ampoules', 'Les ampoules éclatent en gerbes.'],
    couteaux_lances: ['Lanceurs de couteaux', 'Des couteaux filent d\'un bout à l\'autre.'],
  };
  const traps = {};
  Object.keys(TRAPS).forEach((k) => { traps[k] = { id: k, name: TRAPS[k][0], desc: TRAPS[k][1] }; });

  const R = (r) => RANKS.indexOf(r);
  function checkCondition(c, profile, ctx) {
    profile = profile || {};
    const st = profile.stats || {};
    switch (c && c.kind) {
      case 'goldenKills': return (st.goldenKills || 0) >= c.n;
      case 'secretsFound': return (st.secrets || 0) >= c.n;
      case 'class': return profile.classe === c.value;
      case 'rankMin': return R(profile.rank || 'E') >= R(c.rank);
      case 'item': {
        if (ctx && ctx.hasItem) return !!ctx.hasItem(c.id);
        const inv = profile.inventory || {};
        return !!((inv.items || []).some((i) => i.baseId === c.id || i.id === c.id) || (inv.materials && inv.materials[c.id] > 0));
      }
      case 'all': return (c.of || []).every((x) => checkCondition(x, profile, ctx));
      default: return false;
    }
  }
  function isUnlocked(tpl, profile, ctx) {
    if (typeof tpl === 'string') tpl = G.DUNGEONS[tpl];
    if (!tpl) return false;
    if (!tpl.secret) return true;
    return checkCondition(tpl.secret.condition, profile, ctx);
  }
  // Remplace les ids inconnus par le fallback. hasMonster(id)/hasBoss(id) -> bool.
  // minibosses : une liste VIDE reste vide (pas de mini-boss visible) ; seule une liste dont tous les ids manquent bascule sur le fallback.
  function resolve(tpl, hasMonster, hasBoss) {
    if (typeof tpl === 'string') tpl = G.DUNGEONS[tpl];
    if (!tpl) return tpl;
    hasMonster = hasMonster || (() => true); hasBoss = hasBoss || (() => true);
    const f = tpl.fallback || {};
    const keep = (list, fb, has) => { const ok = (list || []).filter(has); return ok.length ? ok : (fb || []).filter(has).length ? (fb || []).filter(has) : (fb || []).slice(); };
    const one = (id, fb, has) => (id && has(id) ? id : (fb && has(fb) ? fb : null));
    const minis = tpl.minibosses || [];
    return Object.assign({}, tpl, {
      monsters: keep(tpl.monsters, f.monsters, hasMonster),
      elites: keep(tpl.elites, f.elites, hasMonster),
      rares: (tpl.rares || []).filter(hasMonster).length ? tpl.rares.filter(hasMonster) : (f.rares || []).filter(hasMonster),
      secretCreature: one(tpl.secretCreature, f.secretCreature, hasMonster),
      minibosses: !minis.length ? [] : (minis.filter(hasBoss).length ? minis.filter(hasBoss) : (f.minibosses || []).filter(hasBoss)),
      hiddenMiniboss: one(tpl.hiddenMiniboss, f.hiddenMiniboss, hasBoss),
      boss: hasBoss(tpl.boss) ? tpl.boss : (f.boss || tpl.boss),
      __resolved: true,
    });
  }
  // ids attendus (pour la QA et les agents 7/8)
  function expectedIds() {
    const out = { monsters: [], bosses: [] };
    Object.keys(D).forEach((k) => {
      const d = D[k];
      out.monsters.push(...d.monsters, ...d.elites, ...(d.rares || []));
      if (d.secretCreature) out.monsters.push(d.secretCreature);
      out.bosses.push(d.boss, ...(d.minibosses || []));
      if (d.hiddenMiniboss) out.bosses.push(d.hiddenMiniboss);
    });
    out.monsters = Array.from(new Set(out.monsters)); out.bosses = Array.from(new Set(out.bosses));
    return out;
  }

  G.DungeonsMeta = { ranks: RANKS, types: TYPES, mechanics, traps, checkCondition, isUnlocked, resolve, expectedIds,
    legacy: LEGACY, materials: MATS,
    conditionKinds: ['goldenKills', 'secretsFound', 'class', 'rankMin', 'item', 'all'] };
})();
