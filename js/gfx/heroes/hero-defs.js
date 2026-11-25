window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v6 « Incarnation » — js/gfx/heroes/hero-defs.js   (A1 Character Artist)
   G.HeroDefs : spécifications visuelles complètes des 8 héros et de leurs 7 skins.
   Intention artistique : CHAR-DESIGN.md (ce fichier fait foi pour les valeurs chiffrées).
   Module autonome : aucune dépendance, ne lève jamais d'exception.

   API
     G.HeroDefs.resolve(classId, opts) -> spec        (nouvel objet à chaque appel, modifiable)
        opts = { skinId?, rarity?, color?, hair?, skin?, accent? }
        - skinId : id court ('carmin') ou complet ('Guerrier:carmin') ; inconnu -> skin de base
        - sans skinId : compat v5 -> base de classe + color (primary), hair, skin, accent appliqués
     G.HeroDefs.classes() -> ['Guerrier', ...]
     G.HeroDefs.skins(classId) -> [{ id, rarity, name, desc }]
     G.HeroDefs.info(classId) -> { classId, hero, title, signature, anim }
     G.HeroDefs.rarityFx(rarity) -> fx par défaut d'une rareté
     G.HeroDefs.normClass(x) -> id de classe exact ou null
     G.HeroDefs.SLOTS, G.HeroDefs.LAYERS, G.HeroDefs.PALETTE_KEYS

   SCHÉMA DE LA SPEC (unités : 1 u ; pieds y = 0 ; regard +Z ; gauche du perso = +X ; couleurs = entiers hex)
   spec = {
     v: 6, classId, skinId, rarity, skinName, skinDesc, hero (nom du personnage), title,
     height,                      // point le plus haut visible (coiffe comprise) : 2,1 à 2,4
     palette: { skin, skinShade, hair, hairShade, eyes, eyesL, eyesR, brows, lip, primary, primaryDark, secondary,
                cloth2, leather, leatherDark, metal, metalDark, gold, accent, accent2, gem, glow, cape, capeLining,
                blade, bladeEdge, bone, fur, trans, fx, fx2 },
     body: { sex:'m'|'f', build:'massive'|'sturdy'|'athletic'|'lean'|'slender'|'gaunt',
             height (sommet du crâne), headSize (menton->crâne), shoulders (deltoïde à deltoïde, sans armure),
             chest (profondeur), waist, hips (largeurs), neck (rayon), muscle 0..1, legRatio (y des hanches / height),
             armLen (×, 1 = standard), handSize (×), posture:{ hunch (rad, buste vers l'avant), stance (écart des pieds u), chin (rad, + = relevé) },
             hover (u, lévitation visuelle ; 0 en général) },
     head: { face:'square'|'oval'|'triangle'|'angular'|'gaunt'|'oval-long'|'oval-square', age, jaw 0..1, cheek 0..1,
             nose:'broken'|'straight'|'fine'|'aquiline'|'small'|'hooked', lips:{ color, full 0..1 },
             eyes:{ shape:'deep'|'almond'|'narrow'|'round'|'hooded', color, colorL?, colorR?, size 0.8..1.2, glow 0..1, pupil:true|false },
             brows:{ shape:'straight'|'arched'|'sharp'|'thin'|'heavy', thick 0..1, color },
             hair:{ style, color, color2?, length 0..1, physics:'none'|'braid'|'ponytail'|'loose'|'float', bones:['hairA','hairB'] },
             beard: null | { style:'stubble'|'short'|'goatee'|'braided-goatee'|'full'|'moustache', color },
             scar: [{ type:'line'|'nick'|'slit'|'lightning', where:'brow-cheekL'|'earR'|'browR'|'chin'|'lipU'|'neck-cheekR'|... , color }],
             ears:'human'|'pointed', earrings:[{side, kind}], marks:[{ type:'paint'|'tattoo'|'freckles'|'mole'|'veins'|'runes'|'sigil', where, color, glow? }],
             expression:'determined'|'focused-smirk'|'smirk'|'cold'|'vigilant'|'serene'|'amused'|'sneer',
             headgear: null | { id, mat, color, ...params },  mask: null | { id, mat, color, covers:'lower'|'full'|'eyes' } },
     hands: { pose:'grip'|'open'|'fist'|'cast', grip:'normal'|'reverse'|'staff'|'bow', fingerLen (×), gloves:'none'|'fingerless'|'leather'|'gauntlet'|'claw', nails? },
     outfit: { id, variant, armorWeight:'light'|'medium'|'heavy',
               pieces: { [slot]: { id (forme pour A4), mat (couche), color (hex), colorKey, trim?, trimMat?, ...paramètres } } },
               // slots : voir SLOTS ; une pièce absente = rien à construire ; params libres documentés dans CHAR-DESIGN.md
     weapon: { id, variant, kind, hand:'R'|'L'|'both', length, parts:{ ... }, offhand: null | { id, ... },
               glowMap:{ epee, dague, feu } (quelle partie s'illumine pour chaque niveau de forge) },
     extras: [ { id, bone, mat, color, count?, orbit?: { radius, speed, y } } ],   // éléments flottants / orbitaux / accessoires libres
     fx: { tier 0..4, rim, rimColor, rimParts[], pattern:null|{ type, color, speed, parts[] }, particles:null|{ type, color, count, rate },
           trail:null|{ color, width }, pulse:null|{ color, speed, parts[] }, floating:[ids d'extras], halo:null|{ type, color },
           energyCape:null|{ color, color2 }, light:null|{ color, intensity, distance }, color, color2 },
     anim: { style:'heavy'|'agile'|'caster'|'ranger'|'noble'|'dread', variant?, weight 0..1, idle:[noms], bounce 0..1 },
     signature: texte (lecture du dessus)
   }
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;

  // ------------------------------------------------------------------
  // Outils (purs, sans exception)
  // ------------------------------------------------------------------
  const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (isObj(v)) { const o = {}; for (const k in v) o[k] = clone(v[k]); return o; }
    return v;
  }
  /** fusion profonde : b écrase a ; tableaux remplacés ; null efface la clé */
  function merge(a, b) {
    if (!isObj(b)) return clone(b === undefined ? a : b);
    const o = isObj(a) ? clone(a) : {};
    for (const k in b) {
      const v = b[k];
      if (v === null) { o[k] = null; continue; }
      if (v === undefined) continue;
      o[k] = isObj(v) && isObj(o[k]) ? merge(o[k], v) : clone(v);
    }
    return o;
  }
  function shade(hex, f) {
    hex = (hex >>> 0) & 0xffffff;
    let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }
  const isHex = (v) => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 0xffffff;
  const strip = (s) => String(s == null ? '' : s).normalize ? String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() : String(s).toLowerCase().trim();

  const CLASSES = ['Guerrier', 'Mage', 'Voleur', 'Assassin', 'Archer', 'Paladin', 'Elementaliste', 'Necromancien'];
  const LAYERS = ['skin', 'cloth', 'cloth2', 'leather', 'metal', 'gold', 'hair', 'eye', 'eyeWhite', 'lip', 'gem', 'glow', 'trans', 'cape', 'fur', 'bone', 'blade'];
  const SLOTS = ['headgear', 'mask', 'collar', 'torsoUnder', 'mail', 'torso', 'overgarment', 'emblem', 'pauldronL', 'pauldronR', 'cape', 'scarf',
    'sleeves', 'bracerL', 'bracerR', 'gloves', 'belt', 'beltItems', 'bandolier', 'skirt', 'legs', 'knees', 'greaves', 'boots', 'back', 'hipL', 'hipR', 'jewelry'];
  const PALETTE_KEYS = ['skin', 'skinShade', 'hair', 'hairShade', 'eyes', 'eyesL', 'eyesR', 'brows', 'lip', 'primary', 'primaryDark', 'secondary', 'cloth2',
    'leather', 'leatherDark', 'metal', 'metalDark', 'gold', 'accent', 'accent2', 'gem', 'glow', 'cape', 'capeLining', 'blade', 'bladeEdge', 'bone', 'fur', 'trans', 'fx', 'fx2'];
  const RARITIES = ['commun', 'rare', 'epique', 'legendaire', 'mythique'];

  // Effets par rareté (contrat §6) — A6 lit spec.fx
  const RARITY_FX = {
    commun: { tier: 0, rim: false, pattern: null, particles: null, trail: null, pulse: null, floating: [], halo: null, energyCape: null, light: null },
    rare: { tier: 1, rim: true, pattern: null, particles: null, trail: null, pulse: null, floating: [], halo: null, energyCape: null, light: null },
    epique: { tier: 2, rim: true, pattern: { type: 'runes', speed: 0.6, parts: ['weapon', 'torso'] }, particles: null, trail: null, pulse: null, floating: [], halo: null, energyCape: null, light: null },
    legendaire: { tier: 3, rim: true, pattern: { type: 'runes', speed: 0.6, parts: ['weapon', 'torso'] }, particles: { type: 'sparks', count: 60, rate: 14 }, trail: { width: 0.18 }, pulse: { speed: 1.4, parts: ['weapon', 'emblem'] }, floating: [], halo: null, energyCape: null, light: null },
    mythique: { tier: 4, rim: true, pattern: { type: 'runes', speed: 0.8, parts: ['weapon', 'torso'] }, particles: { type: 'motes', count: 120, rate: 26 }, trail: { width: 0.24 }, pulse: { speed: 1.2, parts: ['weapon', 'emblem'] }, floating: [], halo: { type: 'crown' }, energyCape: {}, light: { intensity: 1.1, distance: 5 } },
  };

  // Raccourci de pièce : P('plate-cuirass', 'metal', 'metal', { ... })
  const P = (id, mat, color, extra) => Object.assign({ id, mat, color }, extra || {});

  // ==================================================================
  //  DÉFINITIONS PAR CLASSE
  // ==================================================================
  const DEFS = {};

  // ------------------------------------------------------------------ GUERRIER
  DEFS.Guerrier = {
    hero: 'Garran Holt', title: 'Rempart de garnison',
    signature: "énorme épaulière gauche + écu bleu à tour blanche ; épaules les plus larges ; longue lame claire ; cape bleu sombre",
    height: 2.34,
    palette: { skin: 0xe8b892, hair: 0x3b2a1e, eyes: 0x6f8fb0, brows: 0x4a3424, lip: 0xb07060, primary: 0x2f5d9e, primaryDark: 0x1f3d6e, secondary: 0xe9edf3,
      cloth2: 0x2b3550, leather: 0x5a3a22, leatherDark: 0x3a2414, metal: 0xb9c3d3, metalDark: 0x6f7a8c, gold: 0xd9a93a, accent: 0xe9edf3, gem: 0xc8283c,
      glow: 0xff5a4a, cape: 0x1f3d6e, capeLining: 0x2b3550, blade: 0xdfe7f2, bladeEdge: 0xeef3fa, bone: 0xe6dcc4, fur: 0x6b5a48, trans: 0xbfe6ff, fx: 0x7fb0ff, fx2: 0xffffff },
    body: { sex: 'm', build: 'massive', height: 2.30, headSize: 0.39, shoulders: 0.96, chest: 0.40, waist: 0.48, hips: 0.52, neck: 0.11, muscle: 0.85, legRatio: 0.48, armLen: 1.0, handSize: 1.12, posture: { hunch: 0.04, stance: 0.38, chin: 0.0 }, hover: 0 },
    head: { face: 'square', age: 34, jaw: 0.9, cheek: 0.7, nose: 'broken', lips: { color: 'lip', full: 0.35 },
      eyes: { shape: 'deep', color: 'eyes', size: 0.95, glow: 0, pupil: true }, brows: { shape: 'heavy', thick: 0.85, color: 'brows' },
      hair: { style: 'undercut-swept-warbraid', color: 'hair', length: 0.3, physics: 'braid', bones: ['hairA', 'hairB'], braid: { side: 'L', ring: 'metal' } },
      beard: { style: 'short', color: 'brows' },
      scar: [{ type: 'line', where: 'brow-cheekL', color: 0xd99a8a }, { type: 'nick', where: 'earR', color: 0xd99a8a }],
      ears: 'human', earrings: [], marks: [], expression: 'determined', headgear: null, mask: null },
    hands: { pose: 'grip', grip: 'normal', fingerLen: 1.0, gloves: 'gauntlet' },
    outfit: { id: 'guerrier_rempart', variant: 'base', armorWeight: 'heavy', pieces: {
      torsoUnder: P('gambeson', 'cloth2', 'cloth2', { visible: ['collar', 'elbows', 'hem'] }),
      mail: P('hauberk', 'metal', 'metalDark', { length: 'mid-thigh', texture: 'mail' }),
      torso: P('plate-cuirass', 'metal', 'metal', { ridge: true, rivets: true, trim: 'gold', trimMat: 'gold', thickness: 0.05 }),
      overgarment: P('tabard', 'cloth', 'primary', { length: 0.55, split: 'front', trim: 'gold', trimMat: 'gold' }),
      emblem: P('tower', 'cloth2', 'accent', { on: 'chest', size: 0.16 }),
      collar: P('gorget', 'metal', 'metal'),
      pauldronL: P('pauldron-lames', 'metal', 'metal', { lames: 3, scale: 1.3, raised: 0.2, trim: 'gold', trimMat: 'gold' }),
      pauldronR: P('pauldron-lames', 'metal', 'metal', { lames: 3, scale: 1.0, trim: 'gold', trimMat: 'gold' }),
      bracerL: P('vambrace', 'metal', 'metal'), bracerR: P('vambrace', 'metal', 'metal'),
      gloves: P('gauntlet-articulated', 'metal', 'metalDark'),
      belt: P('wide-belt', 'leather', 'leather', { buckle: 'square', buckleMat: 'gold' }),
      skirt: P('tassets', 'metal', 'metal', { plates: 2 }),
      legs: P('braies', 'cloth2', 'cloth2'),
      knees: P('poleyn-winged', 'metal', 'metal'),
      greaves: P('greaves', 'metal', 'metal'),
      boots: P('boots-sabaton', 'leather', 'leatherDark', { toe: 'metal' }),
      cape: P('cape-short', 'cape', 'cape', { length: 1.05, lining: 'capeLining', edge: 'worn', pin: 'under-pauldrons' }),
      hipR: P('belt-dagger', 'metal', 'metal'),
      hipL: P('war-horn', 'bone', 'bone', { strap: 'leather' }),
      beltItems: P('pouch', 'leather', 'leather', { count: 1 }),
    } },
    weapon: { id: 'epee_lige', variant: 'base', kind: 'sword', hand: 'R', length: 1.34,
      parts: { blade: { len: 1.0, width: 0.085, fuller: 0.66, tip: 'ogive', color: 'blade', edge: 'bladeEdge' },
        guard: { len: 0.32, style: 'straight-upturned', mat: 'gold', color: 'gold', gem: 'gem' },
        grip: { len: 0.24, mat: 'leather', color: 'primary', wrap: 'braided' }, pommel: { style: 'disc', mat: 'gold', color: 'gold' },
        ribbon: { color: 'primary', on: 'pommel' } },
      offhand: { id: 'heater-shield', hand: 'L', bone: 'forearmL', w: 0.6, h: 0.78, face: 'primary', rim: 'metal', boss: 'gold', emblem: 'tower', emblemColor: 'accent', wear: 0.5 },
      glowMap: { epee: 'blade', dague: 'guard-gem', feu: 'shield-emblem' } },
    extras: [],
    fx: { color: 0x7fb0ff, color2: 0xffffff },
    anim: { style: 'heavy', weight: 1.0, bounce: 0.15, idle: ['shield-guard', 'shoulder-roll', 'look-around'] },
    skins: {
      acier: { name: "Acier d'origine", desc: 'Plates d’acier bleui, tabard à la tour blanche et écu de garnison.' },
      foret: { name: 'Garde sylvestre', desc: 'Brigandine de cuir vert, bouclier rond en chêne et garde en racine.',
        palette: { primary: 0x2fa05a, primaryDark: 0x1f6b3c, hair: 0x6b4423, brows: 0x5a3a22, skin: 0xe8b48a, cape: 0x2f6b3c, capeLining: 0x4a3a22, accent: 0xd9c08a, gem: 0x6fd86f, fx: 0x7dffb0 },
        head: { hair: { style: 'long-catogan', length: 0.6, physics: 'ponytail' }, beard: { style: 'full' } },
        outfit: { armorWeight: 'medium', pieces: {
          torso: P('brigandine', 'leather', 'primary', { rivets: true, rivetMat: 'gold' }), overgarment: null, emblem: P('oak-leaf', 'gold', 'gold', { on: 'chest', size: 0.12 }),
          pauldronL: P('pauldron-boiled-leather', 'leather', 'leather', { scale: 1.2, wood: true }), pauldronR: P('pauldron-boiled-leather', 'leather', 'leather', { scale: 1.0, wood: true }),
          cape: P('cape-hooded', 'cape', 'cape', { length: 1.1, hood: 'down' }), belt: P('ivy-belt', 'leather', 'leather', { ivy: 0x3f8a3a }),
          greaves: P('greaves-leather', 'leather', 'leather'), gloves: P('gloves-leather', 'leather', 'leatherDark') } },
        weapon: { variant: 'racine', parts: { guard: { style: 'root', mat: 'leather', color: 0x5a3a22 } },
          offhand: { id: 'round-shield-wood', face: 0x7a5232, rim: 'metal', emblem: 'oak-leaf', emblemColor: 'gold' } },
        fx: { rimParts: ['shield-rim', 'blade-edge'] } },
      carmin: { name: 'Lame carmin', desc: 'Mercenaire en brigandine carmin, une seule épaulière et une flamberge.',
        palette: { primary: 0xd7343f, primaryDark: 0x8a1c26, hair: 0xa8442a, brows: 0x7a2e1e, skin: 0xf2c29b, gold: 0xc9a050, cape: 0x8a1c26, accent: 0xd7343f, bladeEdge: 0xffb0a0, fx: 0xff5060 },
        head: { hair: { style: 'high-ponytail', length: 0.55, physics: 'ponytail' }, scar: [{ type: 'line', where: 'brow-cheekL', color: 0xd99a8a }, { type: 'line', where: 'lipU', color: 0xd99a8a }] },
        outfit: { armorWeight: 'medium', pieces: {
          torso: P('brigandine', 'leather', 'primary', { rivets: true, rivetMat: 'gold' }), overgarment: null, emblem: null,
          pauldronL: null, pauldronR: P('pauldron-lames', 'metal', 'metal', { lames: 4, scale: 1.25 }), sleeves: P('mail-sleeve', 'metal', 'metalDark', { side: 'L' }),
          scarf: P('scarf-knotted', 'cape', 'primary', { tails: 2 }), cape: null } },
        weapon: { variant: 'flamberge', parts: { blade: { style: 'flamberge', waves: 5, len: 1.08 } }, offhand: { id: 'rondache-spike', w: 0.46, h: 0.46, face: 'primaryDark', emblem: null } },
        fx: { rimParts: ['blade-edge'] } },
      ebene: { name: "Chevalier d'ébène", desc: 'Plates noires laquées, heaume à visière en T et panache blanc.',
        palette: { primary: 0x3a3f52, primaryDark: 0x1c1f2a, metal: 0x2a2e3a, metalDark: 0x15171f, gold: 0xc9d1dd, hair: 0xe9eef7, skin: 0x8d5a3c, cape: 0x15171f, capeLining: 0x3a3f52, accent: 0xc9d1dd, gem: 0xc9d1dd, blade: 0x2a2e3a, bladeEdge: 0xe9eef7, fx: 0xdfe8ff },
        head: { headgear: P('great-helm-t', 'metal', 'metal', { visor: 'T', plume: { color: 'hair', length: 0.7 } }), hair: { style: 'hidden' }, beard: null },
        outfit: { pieces: { overgarment: null, emblem: P('crescent', 'gold', 'gold', { on: 'chest', size: 0.14 }), torso: P('plate-cuirass', 'metal', 'metal', { ridge: true, trim: 'gold', trimMat: 'metal', lacquer: true }),
          cape: P('cape-long-torn', 'cape', 'cape', { length: 1.3, edge: 'torn' }) } },
        weapon: { variant: 'ebene', offhand: { face: 'primaryDark', emblem: 'crescent', emblemColor: 'gold' } },
        fx: { pattern: { type: 'runes-edge', color: 0xdfe8ff, speed: 0.5, parts: ['plate-edges', 'blade'] } } },
      aurore: { name: 'Aurore de givre', desc: 'Guerrier du nord : fourrure blanche, plaques givrées et lame de glace.',
        palette: { primary: 0x66d9ff, primaryDark: 0x2a8ab0, metal: 0xcfe6f2, hair: 0xf2f6fa, brows: 0xe0e8f0, skin: 0xffe0c8, cape: 0x2a6a8a, fur: 0xf4f6f8, accent: 0xffffff, blade: 0xbff0ff, bladeEdge: 0xffffff, trans: 0xbff0ff, gem: 0x8fe8ff, fx: 0x8fe8ff },
        head: { hair: { style: 'long-braids', length: 0.75, physics: 'braid' }, beard: { style: 'braided-full' } },
        outfit: { pieces: { collar: P('fur-collar', 'fur', 'fur', { volume: 1.3 }), overgarment: P('tabard', 'cloth', 'primaryDark', { length: 0.5 }), emblem: P('snowflake', 'cloth2', 'accent', { on: 'chest' }),
          cape: P('cape-fur', 'fur', 'fur', { length: 1.0 }) } },
        weapon: { variant: 'glace', parts: { blade: { mat: 'trans', frost: true } }, offhand: { id: 'round-shield-ice', w: 0.62, h: 0.62, face: 'primaryDark', rim: 'trans', emblem: 'snowflake' } },
        fx: { pattern: { type: 'frost-creep', color: 0x8fe8ff, speed: 0.35, parts: ['armor', 'blade'] }, particles: { type: 'breath', count: 12, rate: 3 } } },
      dore: { name: 'Champion doré', desc: 'Armure de tournoi ciselée d’or, couronne de laurier et cape blanche.',
        palette: { primary: 0xe0a526, primaryDark: 0xa8741a, metal: 0xf2d27a, metalDark: 0xb8902a, gold: 0xffe08a, hair: 0xfff1c2, brows: 0xd9b860, skin: 0xffd2a8, cape: 0xfaf6ea, capeLining: 0xe0a526, accent: 0xffffff, gem: 0xffd24a, blade: 0xfff1c2, bladeEdge: 0xffffff, fx: 0xffd24a, fx2: 0xfff6d0 },
        head: { hair: { style: 'slicked-back', length: 0.35 }, headgear: P('laurel-crown', 'gold', 'gold'), beard: { style: 'stubble' } },
        outfit: { pieces: { torso: P('plate-cuirass', 'gold', 'metal', { ridge: true, engraved: 'sunrise', trim: 'gold', trimMat: 'gold' }), overgarment: null, emblem: P('sunrise', 'gold', 'gold', { on: 'chest', size: 0.2 }),
          cape: P('cape-long', 'cape', 'cape', { length: 1.4, lining: 'capeLining' }) } },
        weapon: { variant: 'soleil', parts: { blade: { width: 0.11, engraved: true } }, offhand: { face: 0xfaf6ea, rim: 'gold', emblem: 'sunrise', emblemColor: 'gold' } },
        fx: { particles: { type: 'gold-sparks', color: 0xffd24a, count: 70, rate: 16 }, trail: { color: 0xffd24a }, pulse: { color: 0xffe08a, parts: ['engravings', 'blade'] } } },
      souverain: { name: 'Armure souveraine', desc: 'Nacre et carmin, heaume-couronne et trois fragments de bouclier en orbite.',
        palette: { primary: 0xf4f1ff, primaryDark: 0xc8c0e0, metal: 0xf4f1ff, metalDark: 0xb8b0d0, gold: 0xff3d6e, hair: 0xffd9c2, skin: 0xffd9c2, cape: 0xff3d6e, capeLining: 0xffffff, accent: 0xff3d6e, gem: 0xff3d6e, glow: 0xff7aa0, blade: 0xffb0c8, bladeEdge: 0xffffff, fx: 0xff3d6e, fx2: 0xffffff },
        head: { headgear: P('crown-helm-blades', 'metal', 'metal', { blades: 7, bladeMat: 'gold', open: true }), hair: { style: 'hidden' } },
        outfit: { pieces: { torso: P('plate-cuirass', 'metal', 'metal', { ridge: true, nacre: true, trim: 'gold', trimMat: 'gold' }), overgarment: null, emblem: P('crown', 'glow', 'glow', { on: 'chest' }),
          cape: P('cape-energy', 'cape', 'cape', { length: 1.4 }) } },
        weapon: { variant: 'souveraine', parts: { blade: { len: 1.25, width: 0.13, energy: true, mat: 'glow' } }, offhand: { id: 'shield-fragments', floating: true } },
        extras: [{ id: 'shield-fragment', bone: 'chest', mat: 'metal', color: 'metal', count: 3, orbit: { radius: 0.95, speed: 0.9, y: 1.3 }, trim: 'gold' }],
        fx: { floating: ['shield-fragment'], halo: { type: 'crown-light', color: 0xff3d6e }, energyCape: { color: 0xff3d6e, color2: 0xffffff }, light: { color: 0xff7aa0 }, particles: { type: 'petals-light', color: 0xff3d6e } } },
    },
  };

  // ------------------------------------------------------------------ MAGE
  DEFS.Mage = {
    hero: 'Ysolde Varn', title: 'de la Tour Pourpre',
    signature: 'grand disque violet du chapeau + orbe violet à cœur de braise + étole or',
    height: 2.40,
    palette: { skin: 0xf2d2b6, hair: 0x8a3b2a, eyes: 0x9b6bff, brows: 0x7a3424, lip: 0xb0566a, primary: 0x4b2380, primaryDark: 0x2e1a4a, secondary: 0x7a4ab8,
      cloth2: 0xe8dcc6, leather: 0x2e1838, leatherDark: 0x2a1a14, metal: 0xc8c0d8, metalDark: 0x7a7090, gold: 0xe0b040, accent: 0xff7a3d, gem: 0xb44dff,
      glow: 0xc78bff, cape: 0x4b2380, capeLining: 0x7a4ab8, blade: 0xb44dff, bladeEdge: 0xff7a3d, bone: 0xe6dcc4, fur: 0x6b5a48, trans: 0xd8b8ff, fx: 0xb44dff, fx2: 0xff7a3d },
    body: { sex: 'f', build: 'slender', height: 2.12, headSize: 0.37, shoulders: 0.60, chest: 0.30, waist: 0.36, hips: 0.48, neck: 0.075, muscle: 0.2, legRatio: 0.5, armLen: 1.0, handSize: 0.95, posture: { hunch: 0, stance: 0.24, chin: 0.06 }, hover: 0 },
    head: { face: 'oval', age: 27, jaw: 0.35, cheek: 0.75, nose: 'straight', lips: { color: 'lip', full: 0.7 },
      eyes: { shape: 'almond', color: 'eyes', size: 1.05, glow: 0.25, pupil: true }, brows: { shape: 'arched', thick: 0.35, color: 'brows' },
      hair: { style: 'long-side-braid', color: 'hair', length: 0.85, physics: 'braid', bones: ['hairA', 'hairB'], braid: { side: 'R', over: 'shoulder' } },
      beard: null, scar: [], ears: 'human', earrings: [{ side: 'R', kind: 'ear-cuff', mat: 'gold' }],
      marks: [{ type: 'mole', where: 'under-eyeL', color: 0x5a3a2a }, { type: 'tattoo', where: 'eye-cheek-lines', color: 'gold', glow: 0.2 }],
      expression: 'focused-smirk',
      headgear: P('wizard-hat', 'cloth', 'primary', { brim: 0.95, cone: 0.62, bend: 'back', droop: 0.15, band: 'gold', bandMat: 'gold', gem: 'gem' }), mask: null },
    hands: { pose: 'cast', grip: 'staff', fingerLen: 1.05, gloves: 'none', rings: true },
    outfit: { id: 'mage_tour_pourpre', variant: 'base', armorWeight: 'light', pieces: {
      torsoUnder: P('linen-shirt', 'cloth2', 'cloth2', { cuffs: 'puffed' }),
      overgarment: P('long-robe-split', 'cloth', 'primary', { length: 1.0, split: 'front', hem: 0.9, under: P('skirt', 'cloth2', 'primaryDark') }),
      torso: P('corset-laced', 'leather', 'leather', { laces: 'gold' }),
      sleeves: P('flared-sleeves', 'cloth', 'primary', { lining: 'secondary', trim: 'gold', runes: true }),
      collar: P('high-collar', 'cloth', 'primaryDark', { trim: 'gold', embroidered: true }),
      belt: P('double-belt', 'leather', 'leather', { buckleMat: 'gold' }),
      hipL: P('grimoire-chained', 'leather', 'secondary', { corners: 'gold', clasp: 'eye', chain: 'gold' }),
      hipR: P('vials', 'trans', 'accent', { count: 3, colors: ['accent', 'gem', 'secondary'] }),
      scarf: P('stole', 'cape', 'primaryDark', { front: true, length: 0.95, runes: 'gold' }),
      boots: P('pointed-boots', 'leather', 'leather'),
      jewelry: P('rings-bracelet', 'gold', 'gold', { rune: true }),
    } },
    weapon: { id: 'baton_arcanique', variant: 'base', kind: 'staff', hand: 'R', length: 1.75,
      parts: { shaft: { len: 1.75, mat: 'leather', color: 'leatherDark', twist: true, bands: 'gold' },
        head: { style: 'three-claws', mat: 'gold', color: 'gold' }, orb: { r: 0.11, mat: 'glow', color: 'gem', core: 'accent', floating: true },
        rings: { count: 2, mat: 'gold', color: 'gold', spin: 1.2 }, foot: { mat: 'metal', color: 'metal' } },
      offhand: null, glowMap: { epee: 'rings', dague: 'hat-gem', feu: 'orb' } },
    extras: [],
    fx: { color: 0xb44dff, color2: 0xff7a3d },
    anim: { style: 'caster', weight: 0.35, bounce: 0.05, idle: ['read-grimoire', 'orb-float', 'glyph-trace'] },
    skins: {
      violet: { name: 'Violet originel', desc: 'Robe pourpre, chapeau à large bord et bâton à orbe de braise.' },
      azur: { name: "Érudite d'azur", desc: 'Capuche blanche, lunettes cerclées d’or et orbe bleu ciel.',
        palette: { primary: 0x2f8cff, primaryDark: 0x1f5ab0, secondary: 0xdff3ff, hair: 0xdff3ff, brows: 0xc8d8e8, skin: 0xffe0c8, gem: 0x6fc8ff, glow: 0x9fd8ff, accent: 0xdff3ff, leather: 0x1f3a6a, fx: 0x6fc8ff, fx2: 0xffffff },
        head: { headgear: P('hood-scholar', 'cloth', 'secondary', { trim: 'primary' }), hair: { style: 'bun', length: 0.4, physics: 'none' }, earrings: [], extra: P('round-glasses', 'gold', 'gold') },
        weapon: { variant: 'azur', parts: { orb: { color: 'gem', core: 0xffffff } } }, fx: { rimParts: ['orb', 'hood-trim'] } },
      rubis: { name: 'Rubis', desc: 'Robe rubis et noire, carré noir, tiare de rubis et orbe écarlate.',
        palette: { primary: 0xd6336c, primaryDark: 0x2a0f1e, secondary: 0x8a1c3c, hair: 0x2a0f1e, brows: 0x1a0a10, skin: 0xf2c29b, gem: 0xff2a4a, glow: 0xff6a7a, accent: 0xff2a4a, fx: 0xff2a4a, fx2: 0xffb0a0 },
        head: { hair: { style: 'bob', length: 0.35, physics: 'none' }, headgear: P('wizard-hat', 'cloth', 'primaryDark', { brim: 0.7, brimUp: true, cone: 0.55, band: 'gold', gem: 'gem' }), extra: P('tiara-ruby', 'gold', 'gold', { gem: 'gem' }) },
        weapon: { variant: 'rubis' }, fx: { rimParts: ['tiara', 'orb'] } },
      sylve: { name: 'Druidesse sylvestre', desc: 'Couronne de bois de cerf, robe de feuillage et bâton-branche vivant.',
        palette: { primary: 0x1faa7a, primaryDark: 0x0f5a40, secondary: 0x8ad8a0, hair: 0x6b3a1e, brows: 0x4a2a14, skin: 0xdfa982, gem: 0xb8ffd9, glow: 0x7dffb0, accent: 0xb8ffd9, leather: 0x4a3a22, leatherDark: 0x5a3a22, fx: 0x7dffb0, fx2: 0xfff2a0 },
        head: { headgear: P('antler-leaf-crown', 'bone', 0xe6d8b8, { leaves: 0x3fbf6a }), hair: { style: 'ivy-braids', length: 0.8, physics: 'braid' } },
        outfit: { pieces: { overgarment: P('long-robe-split', 'cloth', 'primary', { length: 1.0, leafHem: true }), collar: P('leaf-collar', 'cloth', 'primaryDark') } },
        weapon: { variant: 'branche', parts: { shaft: { style: 'living-branch', color: 0x5a3a22, leaves: 0x3fbf6a }, head: { style: 'roots', mat: 'leather', color: 0x5a3a22 }, orb: { color: 'glow', core: 0xfff2a0 } } },
        fx: { pattern: { type: 'veins', color: 0x7dffb0, speed: 0.5, parts: ['robe', 'staff'] }, particles: { type: 'fireflies', color: 0xfff2a0, count: 14, rate: 2 } } },
      cendres: { name: 'Mage des cendres', desc: 'Robe charbon à l’ourlet incandescent, chapeau brûlé, orbe de magma.',
        palette: { primary: 0x3b2a4a, primaryDark: 0x1e1622, secondary: 0x5a4a5a, hair: 0x8a8a8a, brows: 0x6a6a6a, skin: 0xffd9bd, gem: 0xff7a3d, glow: 0xff9a4a, accent: 0xff7a3d, leatherDark: 0x1a1210, fx: 0xff7a3d, fx2: 0xffcf40 },
        head: { headgear: P('wizard-hat', 'cloth', 'primaryDark', { brim: 0.9, cone: 0.6, bend: 'back', burnt: true, frayed: true }), marks: [{ type: 'tattoo', where: 'arms-embers', color: 'accent', glow: 0.6 }] },
        outfit: { pieces: { overgarment: P('long-robe-split', 'cloth', 'primary', { length: 1.0, torn: true, hemGlow: 'accent' }) } },
        weapon: { variant: 'calcine', parts: { shaft: { color: 0x1a1210, charred: true }, orb: { color: 'accent', core: 0xffcf40, magma: true } } },
        fx: { pattern: { type: 'embers-wave', color: 0xff7a3d, speed: 0.8, parts: ['hem', 'tattoos'] } } },
      astral: { name: 'Oracle astral', desc: 'Robe constellée, diadème lunaire et sphère armillaire tournante.',
        palette: { primary: 0x23244f, primaryDark: 0x12132e, secondary: 0x3a3c7a, hair: 0xe8dcff, brows: 0xd0c4f0, skin: 0xd9c2ff, gold: 0xfff2a8, gem: 0xfff2a8, glow: 0xfff2a8, accent: 0xfff2a8, cape: 0x12132e, capeLining: 0x3a3c7a, fx: 0xfff2a8, fx2: 0x9fb4ff },
        head: { headgear: P('crescent-diadem', 'gold', 'gold'), hair: { style: 'long-floating', length: 1.0, physics: 'float' } },
        outfit: { pieces: { overgarment: P('long-robe-split', 'cloth', 'primary', { length: 1.0, stars: true }), cape: P('cape-starry', 'cape', 'cape', { length: 1.35, stars: true }) } },
        weapon: { variant: 'armillaire', parts: { head: { style: 'armillary', mat: 'gold' }, orb: { color: 'glow', core: 0xffffff }, rings: { count: 3 } } },
        fx: { particles: { type: 'stardust', color: 0xfff2a8, count: 70 }, trail: { color: 0xdfe4ff }, pulse: { color: 0xfff2a8, parts: ['constellations', 'orb'] } } },
      archimage: { name: 'Archimage', desc: 'Robes blanches, couronne d’anneaux runiques et quatre grimoires en orbite.',
        palette: { primary: 0xffffff, primaryDark: 0xd8d0f0, secondary: 0xb44dff, hair: 0xf4ecff, brows: 0xe0d0ff, skin: 0xffe9d6, gold: 0xe8d0ff, gem: 0xb44dff, glow: 0xd08bff, accent: 0xb44dff, eyes: 0xd08bff, cape: 0xb44dff, capeLining: 0xffffff, fx: 0xb44dff, fx2: 0xffffff },
        body: { hover: 0.08 },
        head: { headgear: P('rune-ring-crown', 'glow', 'glow', { rings: 3, floating: true }), hair: { style: 'long-floating', length: 0.9, physics: 'float' }, eyes: { glow: 0.9 } },
        outfit: { pieces: { overgarment: P('long-robe-split', 'cloth', 'primary', { length: 1.05, trim: 'secondary' }), cape: P('cape-energy', 'cape', 'cape', { length: 1.3 }) } },
        weapon: { variant: 'archimage', parts: { orb: { color: 'glow', core: 0xffffff, r: 0.14 }, shards: { count: 5, mat: 'trans', orbit: 0.22 } } },
        extras: [{ id: 'grimoire-orbit', bone: 'chest', mat: 'leather', color: 'secondary', count: 4, orbit: { radius: 0.85, speed: 0.7, y: 1.35 }, trim: 'gold' }],
        fx: { floating: ['grimoire-orbit'], halo: { type: 'rune-rings', color: 0xb44dff }, energyCape: { color: 0xb44dff, color2: 0xffffff }, light: { color: 0xc78bff } } },
    },
  };

  // ------------------------------------------------------------------ VOLEUR
  DEFS.Voleur = {
    hero: 'Fennick Dace', title: 'Larron des toits',
    signature: 'pointe de capuche verte + X argenté des bandoulières + pans d’écharpe rouge',
    height: 2.18,
    palette: { skin: 0xf0c8a0, hair: 0x7a4a2a, eyes: 0x8a6a3a, brows: 0x5a3a20, lip: 0xb07060, primary: 0x1f7a5e, primaryDark: 0x13503d, secondary: 0x4f5a4a,
      cloth2: 0x2e3236, leather: 0x6b4423, leatherDark: 0x3a2414, metal: 0xc9d1d8, metalDark: 0x7a828a, gold: 0xd9a93a, accent: 0xb8322a, gem: 0xffb03a,
      glow: 0x3fe0b0, cape: 0x1f7a5e, capeLining: 0x13503d, blade: 0xe6edf5, bladeEdge: 0xffffff, bone: 0xe6dcc4, fur: 0x6b5a48, trans: 0xbfe6d8, fx: 0x3fe0b0, fx2: 0xffd24a },
    body: { sex: 'm', build: 'lean', height: 2.14, headSize: 0.37, shoulders: 0.72, chest: 0.30, waist: 0.40, hips: 0.44, neck: 0.08, muscle: 0.55, legRatio: 0.5, armLen: 1.02, handSize: 1.0, posture: { hunch: 0.08, stance: 0.30, chin: 0.02 }, hover: 0 },
    head: { face: 'triangle', age: 22, jaw: 0.3, cheek: 0.5, nose: 'fine', lips: { color: 'lip', full: 0.4 },
      eyes: { shape: 'almond', color: 'eyes', size: 1.0, glow: 0, pupil: true }, brows: { shape: 'thin', thick: 0.4, color: 'brows' },
      hair: { style: 'messy-under-hood', color: 'hair', length: 0.35, physics: 'loose', bones: ['hairA'] },
      beard: null, scar: [{ type: 'slit', where: 'browR', color: 0xd9a08a }], ears: 'human', earrings: [{ side: 'L', kind: 'ring', mat: 'gold' }],
      marks: [{ type: 'freckles', where: 'nose', color: 0xb07a50 }], expression: 'smirk',
      headgear: P('hood-soft', 'cloth', 'primary', { tip: 'back-drop', depth: 0.6 }), mask: P('cloth-mask-down', 'cloth', 'cloth2', { covers: 'none', worn: 'neck' }) },
    hands: { pose: 'grip', grip: 'normal', fingerLen: 1.05, gloves: 'fingerless' },
    outfit: { id: 'voleur_toits', variant: 'base', armorWeight: 'light', pieces: {
      torsoUnder: P('shirt-rolled', 'cloth2', 'secondary', { sleeves: 'rolled' }),
      torso: P('studded-jerkin', 'leather', 'leather', { collar: true, studs: 'metal' }),
      cape: P('capelet-hooded', 'cape', 'cape', { length: 0.55, edge: 'pointed' }),
      bandolier: P('crossed-bandoliers', 'leather', 'leatherDark', { knives: 8, knifeMat: 'metal', cross: 'X' }),
      belt: P('low-belt', 'leather', 'leatherDark'),
      beltItems: P('pouches', 'leather', 'leather', { count: 3, coin: 'gold' }),
      hipR: P('grapple-hook', 'metal', 'metal', { rope: 0xb89a6a }),
      bracerL: P('laced-bracer', 'leather', 'leather'), bracerR: P('laced-bracer', 'leather', 'leather'),
      gloves: P('mitts-fingerless', 'leather', 'leatherDark'),
      legs: P('fitted-pants', 'cloth2', 'cloth2', { shinWraps: 'secondary' }),
      boots: P('soft-boots-cuffed', 'leather', 'leather'),
      scarf: P('scarf-knotted', 'cape', 'accent', { tails: 2, length: 0.55 }),
    } },
    weapon: { id: 'lames_de_lancer', variant: 'base', kind: 'daggers', hand: 'both', length: 0.58,
      parts: { blade: { len: 0.42, width: 0.05, curve: 0.15, color: 'blade', edge: 'bladeEdge' }, guard: { style: 'S', mat: 'metal', color: 'metal' },
        grip: { len: 0.12, mat: 'leather', color: 'leatherDark' }, pommel: { style: 'ring', mat: 'metal', color: 'metal' },
        throwing: { style: 'flat-ring', mat: 'metal', color: 'metal', count: 8 } },
      offhand: { id: 'parrying-dagger', hand: 'L', mirror: true }, glowMap: { epee: 'bandolier-knives', dague: 'daggers', feu: 'pouch-buckle' } },
    extras: [],
    fx: { color: 0x3fe0b0, color2: 0xffd24a },
    anim: { style: 'agile', variant: 'trickster', weight: 0.4, bounce: 0.3, idle: ['dagger-spin', 'look-around', 'coin-flip'] },
    skins: {
      vert: { name: 'Vert des bois', desc: 'Capuche verte, bandoulières de couteaux et écharpe rouge.' },
      nuit: { name: 'Nuit sans lune', desc: 'Tout de bleu nuit, masque remonté et couteaux bleuis.',
        palette: { primary: 0x2a2a46, primaryDark: 0x16162a, secondary: 0x3a3a5a, cloth2: 0x1a1a2a, leather: 0x2a2436, leatherDark: 0x16121e, hair: 0x14141e, brows: 0x14141e, skin: 0xf2c9a4, accent: 0xaab4ff, metal: 0x8a9ac8, blade: 0xb8c4ff, fx: 0xaab4ff },
        head: { mask: P('cloth-mask', 'cloth', 'primaryDark', { covers: 'lower' }) }, fx: { rimParts: ['daggers'] } },
      rouille: { name: 'Pirate de rouille', desc: 'Bandana rouille, gilet long, bottes hautes et sabre d’abordage.',
        palette: { primary: 0xc0662a, primaryDark: 0x7a3a14, secondary: 0xd8c8a8, leather: 0x5a3418, hair: 0x3a2412, brows: 0x3a2412, skin: 0xe0a97c, accent: 0xc0662a, fx: 0xffa050 },
        head: { headgear: P('bandana', 'cloth', 'primary', { tails: 2 }), hair: { style: 'shaggy', length: 0.45 }, beard: { style: 'stubble', color: 'hair' }, earrings: [{ side: 'L', kind: 'ring', mat: 'gold' }, { side: 'L', kind: 'ring', mat: 'gold' }, { side: 'R', kind: 'ring', mat: 'gold' }] },
        outfit: { pieces: { torso: P('long-vest', 'leather', 'leather', { length: 0.7 }), cape: null, boots: P('tall-boots-cuffed', 'leather', 'leatherDark'), hipL: P('cutlass-sheathed', 'metal', 'metal', { guard: 'gold' }) } },
        fx: { rimParts: ['daggers'] } },
      poison: { name: 'Venin', desc: 'Capuche violette, masque à filtres et lames qui suintent le venin.',
        palette: { primary: 0x8e44ad, primaryDark: 0x5a2a70, secondary: 0x3a2a4a, leather: 0x3a2a3a, hair: 0x39e08c, brows: 0x2a2a2a, skin: 0xd9e8c0, accent: 0x39e08c, gem: 0x39e08c, glow: 0x39e08c, bladeEdge: 0x39e08c, fx: 0x39e08c },
        head: { mask: P('filter-mask', 'leather', 'leatherDark', { covers: 'lower', filters: 2, filterMat: 'metal' }) },
        outfit: { pieces: { beltItems: P('vials', 'trans', 'glow', { count: 4, glow: true }), scarf: P('scarf-knotted', 'cape', 'primaryDark', { tails: 2 }) } },
        fx: { pattern: { type: 'drips', color: 0x39e08c, speed: 0.7, parts: ['daggers', 'vials'] } } },
      ombre: { name: 'Ombre pâle', desc: 'Tenue noire intégrale et masque de porcelaine blanc.',
        palette: { primary: 0x15151f, primaryDark: 0x0a0a10, secondary: 0x1e1e2a, cloth2: 0x101018, leather: 0x1a1a24, leatherDark: 0x0e0e14, hair: 0xffffff, brows: 0xe0e0e8, skin: 0xcfd6e6, accent: 0xffffff, metal: 0xe8ecf4, fx: 0xffffff },
        head: { headgear: P('hood-tight', 'cloth', 'primary'), mask: P('porcelain-mask', 'bone', 0xf6f6fa, { covers: 'full', slit: true }), hair: { style: 'short-white' } },
        outfit: { pieces: { torso: P('bodysuit', 'cloth', 'primary'), bandolier: P('crossed-bandoliers', 'leather', 'leatherDark', { knives: 8, knifeMat: 'metal' }), scarf: P('scarf-knotted', 'cape', 'accent', { tails: 2 }) } },
        fx: { pattern: { type: 'cracks', color: 0xffffff, speed: 0.4, parts: ['mask', 'daggers'] } } },
      jade: { name: 'Roi des voleurs', desc: 'Manteau de velours jade brodé d’or, chapeau à plume et couteaux d’or.',
        palette: { primary: 0x1c6a5a, primaryDark: 0x0f3a30, secondary: 0xf2e6c8, hair: 0x2a1a10, brows: 0x2a1a10, skin: 0xe8b48a, gold: 0xffd24a, accent: 0xffd24a, metal: 0xffd24a, blade: 0xffe08a, gem: 0x39e0b0, cape: 0x1c6a5a, fx: 0xffd24a, fx2: 0x39e0b0 },
        head: { headgear: P('wide-hat-plume', 'cloth', 'primaryDark', { plume: 0xfff1c2, band: 'gold' }), hair: { style: 'tied-mid', length: 0.5, physics: 'ponytail' }, beard: { style: 'moustache', color: 'hair' } },
        outfit: { pieces: { overgarment: P('long-coat', 'cloth', 'primary', { length: 0.95, embroidery: 'gold', velvet: true }), cape: null, jewelry: P('rings-medallion', 'gold', 'gold', { gem: 'gem' }) } },
        weapon: { variant: 'or', parts: { blade: { color: 'blade' }, guard: { mat: 'gold' } } },
        fx: { particles: { type: 'coins', color: 0xffd24a, count: 40 }, trail: { color: 0xffd24a }, pulse: { color: 0xffd24a, parts: ['embroidery'] } } },
      spectre: { name: 'Spectre', desc: 'Corps de brume translucide, chaînes brisées et six lames spectrales.',
        palette: { primary: 0xe6f0ff, primaryDark: 0x9ab0d0, secondary: 0xc8d8f0, cloth2: 0x8aa0c0, leather: 0x8aa0c0, hair: 0xe6f0ff, skin: 0xb8c0cc, accent: 0x00ffd0, eyes: 0x00ffd0, glow: 0x00ffd0, blade: 0xa0fff0, metal: 0xd0f0ff, trans: 0xc8f0ff, cape: 0x00ffd0, fx: 0x00ffd0, fx2: 0xffffff },
        body: { spectral: true },
        head: { headgear: P('hood-mist', 'trans', 'primary'), eyes: { glow: 1, pupil: false }, mask: null },
        outfit: { pieces: { torso: P('studded-jerkin', 'trans', 'primary'), cape: P('cape-energy', 'cape', 'cape', { length: 1.0 }), beltItems: P('broken-chains', 'metal', 'metal', { floating: true }) } },
        weapon: { variant: 'spectre', parts: { blade: { mat: 'trans', color: 'blade' } } },
        extras: [{ id: 'spectral-blade', bone: 'chest', mat: 'glow', color: 'glow', count: 6, orbit: { radius: 0.75, speed: 1.6, y: 1.15 } }],
        fx: { floating: ['spectral-blade'], halo: { type: 'mist', color: 0x00ffd0 }, energyCape: { color: 0x00ffd0, color2: 0xffffff }, light: { color: 0x00ffd0 } } },
    },
  };

  // ------------------------------------------------------------------ ASSASSIN
  DEFS.Assassin = {
    hero: 'Nyrah', title: 'Lame du Voile',
    signature: 'queue de cheval noire qui fouette + deux pans écarlates qui traînent + lames rouges le long des avant-bras ; aucune capuche',
    height: 2.16,
    palette: { skin: 0xe9c3a0, hair: 0x14151f, eyes: 0xc9ced8, brows: 0x14151f, lip: 0x6a3a40, primary: 0x1d1f30, primaryDark: 0x121320, secondary: 0x2a2d45,
      cloth2: 0x2a2d45, leather: 0x121320, leatherDark: 0x0a0a12, metal: 0x2a2c3a, metalDark: 0x16171f, gold: 0x8a8f9c, accent: 0xc3182f, gem: 0xff4d6d,
      glow: 0xff3a52, cape: 0xc3182f, capeLining: 0x7a0e1e, blade: 0x2a2c36, bladeEdge: 0xff3a52, bone: 0xe6dcc4, fur: 0x2a2a2a, trans: 0x1a1a22, fx: 0xff3a52, fx2: 0xffffff },
    body: { sex: 'f', build: 'athletic', height: 2.12, headSize: 0.36, shoulders: 0.62, chest: 0.28, waist: 0.34, hips: 0.44, neck: 0.07, muscle: 0.5, legRatio: 0.52, armLen: 1.02, handSize: 0.95, posture: { hunch: 0.12, stance: 0.34, chin: -0.04 }, hover: 0 },
    head: { face: 'angular', age: 25, jaw: 0.45, cheek: 0.85, nose: 'fine', lips: { color: 'lip', full: 0.45 },
      eyes: { shape: 'narrow', color: 'eyes', size: 0.95, glow: 0, pupil: true }, brows: { shape: 'sharp', thick: 0.4, color: 'brows' },
      hair: { style: 'shaved-side-high-ponytail', color: 'hair', length: 0.9, physics: 'ponytail', bones: ['hairA', 'hairB'], tie: 'accent', fringe: 'R' },
      beard: null, scar: [{ type: 'line', where: 'chin', color: 0xd99a8a }], ears: 'human', earrings: [{ side: 'L', kind: 'ring', mat: 'metal', count: 3 }],
      marks: [{ type: 'paint', where: 'eye-band', color: 'accent' }], expression: 'cold',
      headgear: null, mask: P('cloth-mask', 'cloth', 'primaryDark', { covers: 'lower', high: true }) },
    hands: { pose: 'grip', grip: 'reverse', fingerLen: 1.0, gloves: 'claw' },
    outfit: { id: 'assassin_voile', variant: 'base', armorWeight: 'light', pieces: {
      torsoUnder: P('bodysuit', 'cloth', 'primary'),
      torso: P('lamellar-lacquer', 'leather', 'leather', { lames: 6, lacquer: true }),
      belt: P('sash-long', 'cape', 'accent', { knot: 'L', tails: 2, tailLen: 0.75, bones: ['beltL', 'beltR'] }),
      pauldronL: P('pauldron-lacquer', 'metal', 'metal', { plates: 3, trim: 'accent' }), pauldronR: null,
      sleeves: P('arm-wraps', 'cloth', 'secondary'),
      gloves: P('gauntlet-claw', 'leather', 'leather', { tips: 'metal' }),
      legs: P('fitted-pants', 'cloth', 'primary', { wraps: 'secondary' }),
      greaves: P('shin-guards', 'leather', 'leather'),
      boots: P('soft-boots-thin', 'leather', 'leatherDark'),
      hipR: P('needle-holster', 'leather', 'leatherDark', { needles: 5, needleMat: 'metal', on: 'thighR' }),
      hipL: P('veil-vial', 'trans', 'trans', { glow: 'gem' }),
    } },
    weapon: { id: 'lames_jumelles', variant: 'base', kind: 'twin-blades', hand: 'both', length: 0.66,
      parts: { blade: { len: 0.5, width: 0.055, curve: 0.25, reverse: true, color: 'blade', edge: 'bladeEdge', edgeGlow: true },
        guard: { style: 'crescent', mat: 'metal', color: 'metal' }, grip: { len: 0.12, mat: 'leather', color: 'leatherDark' },
        pommel: { style: 'ring-tassel', mat: 'metal', color: 'metal', tassel: 'accent' } },
      offhand: { id: 'twin-blade', hand: 'L', mirror: true }, glowMap: { epee: 'blades', dague: 'blade-edges', feu: 'veil-vial' } },
    extras: [],
    fx: { color: 0xff3a52, color2: 0xffffff },
    anim: { style: 'agile', variant: 'stalker', weight: 0.35, bounce: 0.2, idle: ['crouch-scan', 'blade-flip', 'ponytail-toss'] },
    skins: {
      nuit: { name: 'Nuit rouge', desc: 'Noir laqué, ceinture écarlate à longs pans et lames au fil rouge.' },
      cendre: { name: 'Cendre', desc: 'Gris cendre, cheveux argent et fil gris-bleu.',
        palette: { primary: 0x4a4f63, primaryDark: 0x2e3140, secondary: 0x5a6070, cloth2: 0x3a3e4e, leather: 0x2e3140, hair: 0xb8c0cc, brows: 0x8a92a0, skin: 0xf2c9a4, accent: 0xaab4c8, capeLining: 0x6a7488, bladeEdge: 0xaab4c8, gem: 0xaab4c8, glow: 0xaab4c8, fx: 0xaab4c8 },
        head: { marks: [{ type: 'paint', where: 'eye-band', color: 0x6a7080 }] }, fx: { rimParts: ['blade-edges'] } },
      sang: { name: 'Sang séché', desc: 'Bordeaux, bandages tachés et cicatrice à la joue.',
        palette: { primary: 0x4a1420, primaryDark: 0x2a0a12, secondary: 0x6a2a30, leather: 0x2a0a12, skin: 0xe8b48a, accent: 0xff4d6a, capeLining: 0x8a1a2a, bladeEdge: 0xff4d6a, fx: 0xff4d6a },
        head: { scar: [{ type: 'line', where: 'chin', color: 0xd99a8a }, { type: 'line', where: 'cheekL', color: 0xc07070 }] },
        outfit: { pieces: { sleeves: P('bandages-stained', 'cloth', 0xd8c8b0, { stains: 0x7a1a20 }) } }, fx: { rimParts: ['blade-edges'] } },
      jade: { name: 'Lame de jade', desc: 'Vert sombre, demi-masque de jade à crocs, lames de jade translucide.',
        palette: { primary: 0x1f4d3d, primaryDark: 0x0f2a20, secondary: 0x2a5a48, leather: 0x0f2a20, skin: 0xd9b48f, accent: 0x39e08c, capeLining: 0x1f8a5a, gem: 0x39e08c, glow: 0x39e08c, blade: 0x2fae78, bladeEdge: 0x8affc8, trans: 0x39e08c, fx: 0x39e08c },
        head: { mask: P('jade-fang-mask', 'trans', 'trans', { covers: 'lower', fangs: true }) },
        weapon: { variant: 'jade', parts: { blade: { mat: 'trans', color: 'blade' } } },
        fx: { pattern: { type: 'veins', color: 0x39e08c, speed: 0.6, parts: ['mask', 'blades'] } } },
      foudre: { name: 'Éclair noir', desc: 'Indigo, cheveux électrisés et lames dentelées en zigzag.',
        palette: { primary: 0x2b2f6b, primaryDark: 0x16183a, secondary: 0x3a3f80, leather: 0x16183a, skin: 0xf2c9a4, accent: 0xffe14d, capeLining: 0xc0a020, bladeEdge: 0xffe14d, gem: 0xffe14d, glow: 0xffe14d, fx: 0xffe14d },
        head: { hair: { style: 'spiked-ponytail', physics: 'ponytail' } },
        weapon: { variant: 'zigzag', parts: { blade: { style: 'serrated-zigzag' } } },
        fx: { pattern: { type: 'arcs', color: 0xffe14d, speed: 1.6, parts: ['arms', 'blades'] } } },
      neige: { name: 'Fantôme des neiges', desc: 'Blanc et fourrure, masque de givre, lames de glace cyan.',
        palette: { primary: 0xe6ecf7, primaryDark: 0xb8c4d8, secondary: 0xd0d8e8, cloth2: 0xc8d0e0, leather: 0xb8c4d8, leatherDark: 0x8a96aa, hair: 0xf4f8ff, brows: 0xd0d8e8, skin: 0xffe3cf, accent: 0x46d4ff, capeLining: 0xffffff, fur: 0xffffff, gem: 0x46d4ff, glow: 0x46d4ff, blade: 0xbff0ff, bladeEdge: 0x46d4ff, trans: 0xbff0ff, fx: 0x46d4ff, fx2: 0xffffff },
        head: { hair: { style: 'long-ponytail-white', length: 1.0 }, mask: P('frost-mask', 'trans', 'trans', { covers: 'lower' }) },
        outfit: { pieces: { collar: P('fur-collar', 'fur', 'fur', { volume: 1.0 }) } },
        weapon: { variant: 'glace', parts: { blade: { mat: 'trans', color: 'blade' } } },
        fx: { particles: { type: 'snow', color: 0xffffff, count: 60 }, trail: { color: 0x46d4ff }, pulse: { color: 0x46d4ff, parts: ['blades', 'mask'] } } },
      neant: { name: 'Néant', desc: 'Silhouette d’encre, masque sans traits et trois éclats de néant.',
        palette: { primary: 0x0b0b12, primaryDark: 0x050508, secondary: 0x14141e, cloth2: 0x0b0b12, leather: 0x08080e, hair: 0x2a1a40, skin: 0xcdbfd9, accent: 0xb44dff, eyes: 0xb44dff, capeLining: 0x5a1a8a, gem: 0xb44dff, glow: 0xb44dff, blade: 0x050508, bladeEdge: 0xb44dff, fx: 0xb44dff, fx2: 0x000000 },
        body: { inkOutline: 0xb44dff },
        head: { hair: { style: 'smoke-ponytail', physics: 'float' }, mask: P('void-mask', 'cloth', 'primary', { covers: 'full', slits: 'glow' }), marks: [] },
        weapon: { variant: 'vide', parts: { blade: { core: 'blade', edge: 'bladeEdge', void: true } } },
        extras: [{ id: 'void-shard', bone: 'chest', mat: 'glow', color: 'glow', count: 3, orbit: { radius: 0.7, speed: 1.1, y: 1.2 } }],
        fx: { floating: ['void-shard'], halo: { type: 'void-ring', color: 0xb44dff }, energyCape: { color: 0x5a1a8a, color2: 0xb44dff, smoke: true }, light: { color: 0xb44dff } } },
    },
  };

  // ------------------------------------------------------------------ ARCHER
  DEFS.Archer = {
    hero: 'Liesse Ambrefeuille', title: 'Garde-forêt de Sylvanie',
    signature: 'arc long (ligne claire de 1,7 u), carquois en diagonale à flèches blanches, mantelet vert en écailles de feuilles',
    height: 2.20,
    palette: { skin: 0xf0c8a0, hair: 0x8a5a2e, eyes: 0x4f8a3a, brows: 0x6a4424, lip: 0xb06a60, primary: 0x2f7a45, primaryDark: 0x1f5230, secondary: 0x5e7a3a,
      cloth2: 0x5e7a3a, leather: 0x7a4a2a, leatherDark: 0x4a2c18, metal: 0xc9d1d8, metalDark: 0x7a828a, gold: 0xe6c35c, accent: 0xe6c35c, gem: 0x9affc0,
      glow: 0x9affc0, cape: 0x2f7a45, capeLining: 0x1f5230, blade: 0xc08a4a, bladeEdge: 0xf4f4f0, bone: 0xf0ead8, fur: 0x8a6a48, trans: 0xd8f0e0, fx: 0x9affc0, fx2: 0xfff2a0 },
    body: { sex: 'f', build: 'athletic', height: 2.18, headSize: 0.37, shoulders: 0.66, chest: 0.29, waist: 0.37, hips: 0.46, neck: 0.072, muscle: 0.45, legRatio: 0.51, armLen: 1.06, handSize: 0.98, posture: { hunch: 0.0, stance: 0.30, chin: 0.05 }, hover: 0 },
    head: { face: 'oval-long', age: 24, jaw: 0.4, cheek: 0.6, nose: 'straight', lips: { color: 'lip', full: 0.5 },
      eyes: { shape: 'almond', color: 'eyes', size: 1.0, glow: 0, pupil: true }, brows: { shape: 'straight', thick: 0.45, color: 'brows' },
      hair: { style: 'long-loose-braid-feathers', color: 'hair', length: 0.9, physics: 'braid', bones: ['hairA', 'hairB'], feathers: [0xf4f4f0, 0x2f7a45] },
      beard: null, scar: [], ears: 'pointed', earrings: [],
      marks: [{ type: 'freckles', where: 'cheeks', color: 0xc08a60 }, { type: 'paint', where: 'cheekL-3-strokes', color: 'primary' }], expression: 'vigilant',
      headgear: null, mask: null },
    hands: { pose: 'grip', grip: 'bow', fingerLen: 1.05, gloves: 'leather' },
    outfit: { id: 'archer_sylvanie', variant: 'base', armorWeight: 'medium', pieces: {
      torsoUnder: P('linen-tunic', 'cloth2', 'cloth2'),
      torso: P('boiled-leather-cuirass', 'leather', 'leather', { molded: true }),
      cape: P('leaf-mantle-hooded', 'cape', 'cape', { length: 0.6, leaves: 3, hood: 'down', scales: true }),
      back: P('quiver-back', 'leather', 'leather', { diagonal: 'R-shoulder-to-L-hip', arrows: 12, fletch: [0xf4f4f0, 0xc8322a], tooled: true, trim: 'gold' }),
      bracerL: P('archer-bracer', 'leather', 'leatherDark', { thick: true }),
      gloves: P('shooting-glove-3', 'leather', 'leatherDark', { side: 'R' }),
      belt: P('belt', 'leather', 'leatherDark', { buckleMat: 'gold' }),
      skirt: P('leather-tassets-split', 'leather', 'leather'),
      legs: P('chausses', 'cloth2', 'primaryDark'),
      knees: P('knee-leather', 'leather', 'leather'),
      boots: P('tall-laced-boots', 'leather', 'leatherDark'),
      hipL: P('hunting-horn', 'bone', 'bone', { band: 'gold' }),
      hipR: P('hunting-knife', 'metal', 'metal', { grip: 'leather' }),
      beltItems: P('satchel', 'leather', 'leather'),
      jewelry: P('antler-talisman', 'bone', 'bone', { on: 'neck' }),
    } },
    weapon: { id: 'arc_long', variant: 'base', kind: 'longbow', hand: 'L', length: 1.7,
      parts: { limbs: { len: 1.7, mat: 'leather', color: 'blade', belly: 0x8a5a2e, recurve: 0.2, carvings: 'gold' },
        tips: { mat: 'bone', color: 'bone' }, grip: { mat: 'leather', color: 'primary' }, string: { color: 0xf4f4f0 },
        arrow: { shaft: 0xd8c098, head: 'leaf', headMat: 'metal', fletch: [0xf4f4f0, 0xc8322a] } },
      offhand: null, glowMap: { epee: 'bow', dague: 'quiver-heads', feu: 'talisman' } },
    extras: [],
    fx: { color: 0x9affc0, color2: 0xfff2a0 },
    anim: { style: 'ranger', weight: 0.45, bounce: 0.12, idle: ['check-string', 'nock-arrow', 'scan-horizon'] },
    skins: {
      sylve: { name: 'Vert sylvestre', desc: 'Mantelet de feuilles, carquois gravé et arc long d’if.' },
      automne: { name: 'Automne', desc: 'Feuilles rouille et or, cheveux roux et empennage jaune.',
        palette: { primary: 0xc46a2b, primaryDark: 0x8a4218, secondary: 0x9a6a2a, cloth2: 0x8a6a3a, leather: 0x8a5a2a, hair: 0x5a3418, brows: 0x4a2a14, skin: 0xe8b48a, accent: 0xffd24a, cape: 0xc46a2b, gem: 0xffd24a, fx: 0xffd24a },
        head: { hair: { color: 0xb8502a } }, outfit: { pieces: { cape: P('leaf-mantle-hooded', 'cape', 'cape', { length: 0.6, leaves: 3, autumn: [0xc46a2b, 0xe0a030, 0x8a2a1a] }) } },
        weapon: { parts: { arrow: { fletch: [0xffd24a, 0xc46a2b] } } }, fx: { rimParts: ['bow'] } },
      pervenche: { name: 'Pervenche', desc: 'Capuche bleue relevée, tenue pervenche et arc blanc.',
        palette: { primary: 0x3f6fd1, primaryDark: 0x2a4a90, secondary: 0x8aa8e8, cloth2: 0xd8d0b0, leather: 0xd9b36a, leatherDark: 0x8a6a3a, hair: 0xd9b36a, brows: 0xa8843a, skin: 0xffd2a8, accent: 0xe6f0ff, blade: 0xf4f4f0, cape: 0x3f6fd1, gem: 0xe6f0ff, fx: 0xe6f0ff },
        head: { headgear: P('hood-up', 'cloth', 'primary') }, weapon: { variant: 'blanc', parts: { limbs: { color: 0xf4f4f0, belly: 0xd8d0c0 } } }, fx: { rimParts: ['string'] } },
      nuit: { name: 'Œil de nuit', desc: 'Gris-bleu de nuit, monocle de visée et arc réflexe noir.',
        palette: { primary: 0x2c2f4a, primaryDark: 0x16182a, secondary: 0x3a3e5a, cloth2: 0x22243a, leather: 0x2a2c40, leatherDark: 0x16182a, hair: 0xe6ecf7, brows: 0xc8d0e0, skin: 0xcfa88a, accent: 0x8fb4ff, blade: 0x1a1a24, gem: 0x8fb4ff, glow: 0x8fb4ff, cape: 0x2c2f4a, fx: 0x8fb4ff },
        head: { headgear: P('hood-up', 'cloth', 'primary'), hair: { style: 'short-silver', length: 0.25, physics: 'none' }, extra: P('scope-monocle', 'metal', 'metal', { lens: 'glow', side: 'R' }) },
        weapon: { variant: 'reflexe', parts: { limbs: { color: 0x1a1a24, belly: 0x2a2a34, recurve: 0.5 } } },
        fx: { pattern: { type: 'lines', color: 0x8fb4ff, speed: 0.8, parts: ['bow', 'monocle'] } } },
      braise: { name: 'Braise', desc: 'Rouge sombre, flèches enflammées et arc calciné à veines orange.',
        palette: { primary: 0x8a2a1f, primaryDark: 0x4a1410, secondary: 0x6a2a1a, cloth2: 0x4a2a1a, leather: 0x5a2a18, hair: 0xd84a1a, brows: 0x8a2a10, skin: 0xe0a97c, accent: 0xffcf40, blade: 0x2a1a14, gem: 0xff9a3d, glow: 0xff9a3d, cape: 0x8a2a1f, fx: 0xff9a3d, fx2: 0xffcf40 },
        weapon: { variant: 'calcine', parts: { limbs: { color: 0x2a1a14, veins: 0xff9a3d }, arrow: { head: 'ember', headMat: 'glow' } } },
        fx: { pattern: { type: 'veins', color: 0xff9a3d, speed: 0.9, parts: ['bow', 'quiver-heads'] } } },
      emeraude: { name: 'Souveraine des bois', desc: 'Diadème de bois de cerf, cape de feuilles vivantes et arc de bois blanc.',
        palette: { primary: 0x1f7a52, primaryDark: 0x0f4a30, secondary: 0x3fa070, cloth2: 0xe8f0d8, leather: 0xc8b890, hair: 0xfff3b0, brows: 0xd8c880, skin: 0xf2cfa8, gold: 0xffe08a, accent: 0xffffff, blade: 0xf4f0e0, gem: 0xfff3b0, glow: 0xb8ffd0, cape: 0x1f7a52, capeLining: 0xffe08a, fx: 0xb8ffd0, fx2: 0xffe08a },
        head: { headgear: P('antler-diadem', 'bone', 0xf8f4e8, { flowers: [0xffffff, 0xffd0e0] }), hair: { style: 'long-flowing-flowers', length: 1.0, physics: 'loose' } },
        outfit: { pieces: { cape: P('cape-living-leaves', 'cape', 'cape', { length: 1.35, trim: 'gold', leaves: true }) } },
        weapon: { variant: 'bois-vivant', parts: { limbs: { color: 0xf4f0e0, leaves: 0x3fa070, carvings: 'gold' } } },
        fx: { particles: { type: 'gold-leaves', color: 0xffe08a, count: 50 }, trail: { color: 0xb8ffd0 }, pulse: { color: 0xb8ffd0, parts: ['bow', 'diadem'] } } },
      argent: { name: "Rôdeuse d'argent", desc: 'Argent ciselé, ailes d’énergie cyan et arc de lumière.',
        palette: { primary: 0xdfe6f2, primaryDark: 0xa8b4c8, secondary: 0xc8d4e8, cloth2: 0x8a96aa, leather: 0xb8c4d8, metal: 0xe8eef8, gold: 0x00ffd0, hair: 0x00ffd0, brows: 0x80c8d0, skin: 0xffe0c8, accent: 0xff3d6e, blade: 0x00ffd0, gem: 0x00ffd0, glow: 0x00ffd0, cape: 0x00ffd0, fx: 0x00ffd0, fx2: 0xff3d6e },
        head: { headgear: P('crown-mask-silver', 'metal', 'metal', { covers: 'eyes-top' }), hair: { style: 'long-floating', physics: 'float' } },
        outfit: { armorWeight: 'medium', pieces: { torso: P('chased-silver-cuirass', 'metal', 'metal', { engraved: true }), pauldronL: P('pauldron-feather', 'metal', 'metal'), pauldronR: P('pauldron-feather', 'metal', 'metal'),
          cape: P('wings-energy', 'cape', 'cape', { span: 1.6 }) } },
        weapon: { variant: 'lumiere', parts: { limbs: { mat: 'glow', color: 'glow', light: true }, arrow: { shaft: 0xff3d6e, headMat: 'glow' } } },
        extras: [{ id: 'light-feather', bone: 'chest', mat: 'glow', color: 'glow', count: 5, orbit: { radius: 0.8, speed: 0.6, y: 1.5 } }],
        fx: { floating: ['light-feather'], halo: { type: 'crown-light', color: 0x00ffd0 }, energyCape: { color: 0x00ffd0, color2: 0xff3d6e, wings: true }, light: { color: 0x00ffd0 } } },
    },
  };

  // ------------------------------------------------------------------ PALADIN
  DEFS.Paladin = {
    hero: 'Dame Ilvane', title: "de l'Aube",
    signature: 'longue cape azur, épaulières rondes blanches, écu blanc au soleil d’or, masse à ailettes',
    height: 2.34,
    palette: { skin: 0xf5d6bc, hair: 0xe6c46a, eyes: 0x7fb2e6, brows: 0xb8943a, lip: 0xc07a70, primary: 0x2d5fd1, primaryDark: 0x1f3d8a, secondary: 0xf2efe6,
      cloth2: 0xf2efe6, leather: 0xe8e2d2, leatherDark: 0x8a7a5a, metal: 0xdfe6f2, metalDark: 0x9aa6bd, gold: 0xffc933, accent: 0xffc933, gem: 0xffd76a,
      glow: 0xfff2b0, cape: 0x1f3d8a, capeLining: 0xf2efe6, blade: 0xdfe6f2, bladeEdge: 0xfff6d6, bone: 0xf0ead8, fur: 0xe8e2d2, trans: 0xfff6d6, fx: 0xffe58a, fx2: 0xffffff },
    body: { sex: 'f', build: 'sturdy', height: 2.26, headSize: 0.38, shoulders: 0.84, chest: 0.36, waist: 0.44, hips: 0.50, neck: 0.09, muscle: 0.7, legRatio: 0.49, armLen: 1.0, handSize: 1.05, posture: { hunch: -0.02, stance: 0.32, chin: 0.08 }, hover: 0 },
    head: { face: 'oval-square', age: 31, jaw: 0.65, cheek: 0.6, nose: 'straight', lips: { color: 'lip', full: 0.55 },
      eyes: { shape: 'round', color: 'eyes', size: 1.0, glow: 0, pupil: true }, brows: { shape: 'arched', thick: 0.5, color: 'brows' },
      hair: { style: 'crown-braid-low-braid', color: 'hair', length: 0.7, physics: 'braid', bones: ['hairA', 'hairB'] },
      beard: null, scar: [{ type: 'nick', where: 'lipU', color: 0xd99a8a }], ears: 'human', earrings: [],
      marks: [{ type: 'sigil', where: 'forehead', color: 'gold', shape: 'sun', glow: 0.3 }], expression: 'serene',
      headgear: P('bascinet-open', 'metal', 'metal', { band: 'gold', bandMat: 'gold', sun: true, winglets: { mat: 'gold', size: 0.12 }, aventail: true }), mask: null },
    hands: { pose: 'grip', grip: 'normal', fingerLen: 1.0, gloves: 'gauntlet' },
    outfit: { id: 'paladin_aube', variant: 'base', armorWeight: 'heavy', pieces: {
      torsoUnder: P('gambeson', 'cloth2', 'cloth2'),
      mail: P('hauberk', 'metal', 'metalDark', { length: 'hip', texture: 'mail' }),
      torso: P('plate-cuirass', 'metal', 'metal', { ridge: false, rounded: true, trim: 'gold', trimMat: 'gold', thickness: 0.05 }),
      emblem: P('sunrise-repousse', 'gold', 'gold', { on: 'chest', size: 0.2 }),
      pauldronL: P('pauldron-disc', 'metal', 'metal', { rays: true, trim: 'gold', trimMat: 'gold', scale: 1.0 }),
      pauldronR: P('pauldron-disc', 'metal', 'metal', { rays: true, trim: 'gold', trimMat: 'gold', scale: 1.0 }),
      overgarment: P('tabard-long', 'cloth', 'primary', { length: 0.95, front: true, back: true, trim: 'gold', trimMat: 'gold' }),
      cape: P('cape-long', 'cape', 'cape', { length: 1.45, lining: 'capeLining', clasps: 'sun-medallions' }),
      belt: P('belt-white', 'leather', 'leather', { buckleMat: 'gold' }),
      hipL: P('oath-book-chained', 'leather', 'leather', { corners: 'gold', chain: 'gold' }),
      bracerL: P('vambrace', 'metal', 'metal'), bracerR: P('vambrace', 'metal', 'metal'),
      gloves: P('gauntlet-articulated', 'metal', 'metal'),
      greaves: P('greaves', 'metal', 'metal'), knees: P('poleyn', 'metal', 'metal'),
      boots: P('sabatons', 'metal', 'metal'),
      jewelry: P('prayer-beads', 'gold', 'gold', { on: 'wristR' }),
    } },
    weapon: { id: 'masse_benie', variant: 'base', kind: 'mace', hand: 'R', length: 0.85,
      parts: { head: { style: 'flanged', flanges: 6, mat: 'metal', color: 'metal', trim: 'gold' }, gem: { mat: 'glow', color: 'glow', on: 'top' },
        shaft: { len: 0.62, mat: 'leather', color: 'secondary', wrap: 'primary' }, pommel: { mat: 'gold', color: 'gold' } },
      offhand: { id: 'kite-shield', hand: 'L', bone: 'forearmL', w: 0.55, h: 0.85, face: 'secondary', rim: 'gold', emblem: 'sun', emblemColor: 'gold', gem: 'gem' },
      glowMap: { epee: 'mace-head', dague: 'oath-book', feu: 'shield-sun' } },
    extras: [],
    fx: { color: 0xffe58a, color2: 0xffffff },
    anim: { style: 'noble', weight: 0.85, bounce: 0.08, idle: ['mace-shoulder', 'brief-prayer', 'cape-settle'] },
    skins: {
      azur: { name: "Azur d'origine", desc: 'Plates blanches au soleil d’or, tabard et longue cape azur.' },
      pourpre: { name: 'Pourpre', desc: 'Tabard et cape pourpres, soleil d’argent.',
        palette: { primary: 0x8a2bd1, primaryDark: 0x5a1a8a, cape: 0x5a1a8a, hair: 0x2b1a12, brows: 0x2b1a12, skin: 0xffd2a8, gold: 0xd8dce8, accent: 0xc8a0ff, gem: 0xd8b0ff, glow: 0xe0c8ff, fx: 0xc8a0ff },
        fx: { rimParts: ['mace-gem', 'shield-sun'] } },
      emeraude: { name: 'Émeraude', desc: 'Émeraude et or pâle, couronne de feuilles d’or.',
        palette: { primary: 0x1f9a6a, primaryDark: 0x0f5a3a, cape: 0x0f5a3a, hair: 0xe8d8a0, brows: 0xb8a870, skin: 0xe8b48a, gold: 0xe8d8a0, accent: 0x7dffb0, gem: 0x7dffb0, glow: 0xc8ffd8, fx: 0x7dffb0 },
        head: { headgear: P('leaf-crown-gold', 'gold', 'gold') }, fx: { rimParts: ['shield-sun'] } },
      ecarlate: { name: 'Croisé écarlate', desc: 'Heaume fermé à cimier rouge, tabard à croix-soleil et masse à pointes.',
        palette: { primary: 0xc0392b, primaryDark: 0x7a1a14, cape: 0x8a1a14, capeLining: 0xfff1c2, hair: 0xc0392b, skin: 0xf2c29b, gold: 0xfff1c2, accent: 0xff4a3a, gem: 0xff4a3a, glow: 0xff8a6a, fx: 0xff4a3a },
        head: { headgear: P('great-helm-crest', 'metal', 'metal', { crest: { color: 'primary', length: 0.6 } }), hair: { style: 'hidden' } },
        outfit: { pieces: { emblem: P('sun-cross', 'cloth2', 'gold', { on: 'tabard' }) } },
        weapon: { variant: 'pointes', parts: { head: { style: 'spiked', spikes: 8 } } },
        fx: { pattern: { type: 'runes', color: 0xff4a3a, speed: 0.6, parts: ['shield', 'mace'] } } },
      aube: { name: 'Aube', desc: 'Armure d’or clair, plumes blanches et fine auréole.',
        palette: { primary: 0xffe8a0, primaryDark: 0xd8b860, metal: 0xfff4d8, metalDark: 0xd8c898, cape: 0xffffff, capeLining: 0xffe8a0, hair: 0xfffaf0, brows: 0xe0d8c0, skin: 0xffe0c8, gold: 0xfff7d6, accent: 0xfff7d6, gem: 0xfff7d6, glow: 0xffffff, fx: 0xfff7d6 },
        outfit: { pieces: { pauldronL: P('pauldron-disc', 'metal', 'metal', { feathers: 0xffffff, trim: 'gold' }), pauldronR: P('pauldron-disc', 'metal', 'metal', { feathers: 0xffffff, trim: 'gold' }) } },
        extras: [{ id: 'thin-halo', bone: 'head', mat: 'glow', color: 'glow', count: 1 }],
        fx: { pattern: { type: 'soft-light', color: 0xfff7d6, speed: 0.4, parts: ['engravings', 'halo'] } } },
      obsidienne: { name: 'Obsidienne', desc: 'Armure volcanique fissurée de magma, cape de cendre, masse à cœur de lave.',
        palette: { primary: 0x23232f, primaryDark: 0x121218, metal: 0x2a2a34, metalDark: 0x15151c, cape: 0x2a2224, capeLining: 0x5a2a1a, hair: 0xff7a3d, brows: 0xa84a1a, skin: 0xc68642, gold: 0xff7a3d, accent: 0xff3d6e, gem: 0xff7a3d, glow: 0xff9a4a, fx: 0xff7a3d, fx2: 0xff3d6e },
        head: { hair: { style: 'short-flame', length: 0.25, physics: 'none' } },
        outfit: { pieces: { torso: P('plate-cuirass', 'metal', 'metal', { cracks: 'glow', rounded: true }), cape: P('cape-ash', 'cape', 'cape', { length: 1.4, edge: 'burnt' }) } },
        weapon: { variant: 'obsidienne', parts: { head: { style: 'flanged-obsidian', core: 'glow' } } },
        fx: { particles: { type: 'embers', color: 0xff7a3d, count: 60 }, trail: { color: 0xff7a3d }, pulse: { color: 0xff7a3d, parts: ['cracks', 'mace'] } } },
      seraphin: { name: 'Séraphin', desc: 'Blanc et or radieux, quatre ailes de lumière et halo-couronne.',
        palette: { primary: 0xffffff, primaryDark: 0xf0e0b0, metal: 0xffffff, metalDark: 0xe8dcc0, cape: 0xffd700, capeLining: 0xffffff, hair: 0xfff6e0, brows: 0xf0e0b0, skin: 0xffe9d6, gold: 0xffd700, accent: 0xffffff, gem: 0xffd700, glow: 0xfff6c0, fx: 0xffd700, fx2: 0xffffff },
        head: { hair: { style: 'long-floating', length: 1.0, physics: 'float' }, headgear: null },
        outfit: { pieces: { cape: P('wings-light-4', 'cape', 'glow', { wings: 4, span: 1.8 }) } },
        weapon: { variant: 'soleil', offhand: { id: 'shield-light', mat: 'glow', face: 'glow' } },
        extras: [{ id: 'light-feather', bone: 'chest', mat: 'glow', color: 'glow', count: 6, orbit: { radius: 0.9, speed: 0.5, y: 1.6 } }],
        fx: { floating: ['light-feather'], halo: { type: 'halo-crown', color: 0xffd700 }, energyCape: { color: 0xffd700, color2: 0xffffff, wings: 4 }, light: { color: 0xfff2b0 } } },
    },
  };

  // ------------------------------------------------------------------ ÉLÉMENTALISTE
  DEFS.Elementaliste = {
    hero: 'Tavin Orvale', title: 'Danseur de la tempête gelée',
    signature: 'deux orbes en orbite (bleu à gauche, jaune à droite), manteau indigo à quatre pans, cheveux blancs flottants',
    height: 2.26,
    palette: { skin: 0xf2d8c4, hair: 0xdfefff, eyes: 0x8fe8ff, eyesL: 0x8fe8ff, eyesR: 0xffe14d, brows: 0xe8f0ff, lip: 0xb07a7a, primary: 0x2c3c86, primaryDark: 0x1b2558, secondary: 0xdff3ff,
      cloth2: 0x1b2558, leather: 0x1a2040, leatherDark: 0x10142a, metal: 0xb8c8e0, metalDark: 0x6a7a9a, gold: 0xc07a3a, accent: 0x8fe8ff, accent2: 0xffe14d, gem: 0x8fe8ff,
      glow: 0xbff4ff, cape: 0x2c3c86, capeLining: 0x1b2558, blade: 0x8fe8ff, bladeEdge: 0xffffff, bone: 0xe6dcc4, fur: 0xf4f8ff, trans: 0xbff0ff, fx: 0x8fe8ff, fx2: 0xffe14d },
    body: { sex: 'm', build: 'lean', height: 2.16, headSize: 0.37, shoulders: 0.68, chest: 0.29, waist: 0.38, hips: 0.44, neck: 0.075, muscle: 0.4, legRatio: 0.5, armLen: 1.02, handSize: 1.0, posture: { hunch: 0, stance: 0.28, chin: 0.03 }, hover: 0 },
    head: { face: 'angular', age: 23, jaw: 0.4, cheek: 0.7, nose: 'fine', lips: { color: 'lip', full: 0.4 },
      eyes: { shape: 'almond', color: 'eyes', colorL: 'eyesL', colorR: 'eyesR', size: 1.05, glow: 0.4, pupil: true }, brows: { shape: 'thin', thick: 0.3, color: 'brows' },
      hair: { style: 'mid-floating-streak', color: 'hair', color2: 'accent2', length: 0.55, physics: 'float', bones: ['hairA', 'hairB'], streak: 'R' },
      beard: null, scar: [{ type: 'lightning', where: 'neck-cheekR', color: 0xe0b0a0 }], ears: 'human', earrings: [],
      marks: [{ type: 'veins', where: 'cheekL', color: 'accent', glow: 0.3 }], expression: 'amused',
      headgear: null, mask: null },
    hands: { pose: 'cast', grip: 'staff', fingerLen: 1.05, gloves: 'none' },
    outfit: { id: 'elementaliste_dualite', variant: 'base', armorWeight: 'medium', asymmetric: true, pieces: {
      torsoUnder: P('sleeveless-tunic', 'cloth2', 'cloth2'),
      overgarment: P('long-coat-open-4tails', 'cloth', 'primary', { length: 1.0, tails: 4, highCollar: true, bones: ['capeA', 'capeB', 'capeC', 'beltL', 'beltR'] }),
      pauldronL: P('ice-crystal-pauldron', 'trans', 'trans', { crystals: 5 }),
      sleeves: P('frost-sleeve', 'cloth', 'secondary', { side: 'L', frost: true }),
      pauldronR: P('copper-coil-pauldron', 'gold', 'gold', { coils: 3 }),
      bracerR: P('copper-bracelets', 'gold', 'gold', { count: 3, bareArm: true, tattoo: 'lightning' }),
      belt: P('wide-belt-twin-crystals', 'leather', 'leather', { mounts: 'gold', crystals: ['accent', 'accent2'] }),
      legs: P('wide-pants-gathered', 'cloth2', 'cloth2'),
      boots: P('soft-boots', 'leather', 'leatherDark'),
    } },
    weapon: { id: 'sceptre_tempete', variant: 'base', kind: 'scepter', hand: 'R', length: 1.2,
      parts: { shaft: { len: 1.2, mat: 'metal', color: 'metal' }, grip: { mat: 'leather', color: 0xf0f4fa },
        head: { style: 'asym-fork', left: { mat: 'trans', color: 'accent' }, right: { mat: 'gold', color: 'gold' } },
        arc: { mat: 'glow', color: 'accent2', between: 'fork' } },
      offhand: null, glowMap: { epee: 'ice-branch', dague: 'orbit-crystals', feu: 'fork-arc' } },
    extras: [{ id: 'twin-crystal-ice', bone: 'chest', mat: 'trans', color: 'accent', count: 1, orbit: { radius: 0.7, speed: 1.6, y: 1.25, phase: 0 } },
      { id: 'twin-crystal-storm', bone: 'chest', mat: 'glow', color: 'accent2', count: 1, orbit: { radius: 0.7, speed: 1.6, y: 1.25, phase: Math.PI } }],
    fx: { color: 0x8fe8ff, color2: 0xffe14d },
    anim: { style: 'caster', variant: 'dancer', weight: 0.3, bounce: 0.15, idle: ['crystal-juggle', 'spin-step', 'hair-float'] },
    skins: {
      marine: { name: 'Bleu originel', desc: 'Givre à gauche, orage à droite : manteau indigo et sceptre fourchu.' },
      braise: { name: 'Braise', desc: 'Feu et cendre : manteau braise, cheveux orange et cristal de braise.',
        palette: { primary: 0x8a2a1f, primaryDark: 0x4a1410, secondary: 0xffd8b0, cloth2: 0x3a1a14, hair: 0xffb347, brows: 0xd88a30, skin: 0xffd9bd, accent: 0xff9a3d, accent2: 0xffe14d, eyesL: 0xff9a3d, gold: 0x5a4a4a, gem: 0xff9a3d, glow: 0xffc080, trans: 0xffb070, fx: 0xff9a3d, fx2: 0xffe14d },
        fx: { rimParts: ['fork'] } },
      sylve: { name: 'Sylve', desc: 'Feuilles givrées à gauche, bois et cuivre vert-de-gris à droite.',
        palette: { primary: 0x1f6b4a, primaryDark: 0x0f3a28, secondary: 0xd9ffd9, cloth2: 0x143a28, hair: 0xd9ffd9, brows: 0xa8d8b0, skin: 0xffd9bd, accent: 0x7dffb0, accent2: 0xd8ff7a, eyesL: 0x7dffb0, eyesR: 0xd8ff7a, gold: 0x4a9a7a, gem: 0x7dffb0, glow: 0xc8ffe0, trans: 0xb8ffd8, fx: 0x7dffb0, fx2: 0xd8ff7a },
        outfit: { pieces: { pauldronL: P('frost-leaf-pauldron', 'trans', 'trans'), pauldronR: P('wood-copper-pauldron', 'leather', 0x5a3a22, { verdigris: 0x4a9a7a }) } },
        fx: { rimParts: ['orbit-crystals'] } },
      tempete: { name: 'Tempête', desc: 'Violet profond, cheveux dorés électrisés et deux épaulières de cuivre.',
        palette: { primary: 0x3a2a7a, primaryDark: 0x1e1440, secondary: 0x6a5ab0, cloth2: 0x1e1440, hair: 0xffe14d, brows: 0xd8b830, skin: 0xffd9bd, accent: 0xffe14d, accent2: 0xffe14d, eyesL: 0xffe14d, gem: 0xffe14d, glow: 0xfff0a0, fx: 0xffe14d, fx2: 0xb08aff },
        head: { hair: { style: 'electric-spikes', physics: 'float' } },
        outfit: { pieces: { pauldronL: P('copper-coil-pauldron', 'gold', 'gold', { coils: 3 }), sleeves: null } },
        fx: { pattern: { type: 'arcs', color: 0xffe14d, speed: 1.8, parts: ['coat', 'arms'] } } },
      glacier: { name: 'Glacier', desc: 'Couronne de glace, manteau de fourrure blanche, cristaux énormes.',
        palette: { primary: 0x7ac8ff, primaryDark: 0x3a7ab0, secondary: 0xffffff, cloth2: 0xd8ecff, hair: 0xffffff, brows: 0xffffff, skin: 0xffe9d6, accent: 0xffffff, accent2: 0x8fe8ff, eyesR: 0x8fe8ff, gold: 0xb8d8f0, gem: 0xffffff, glow: 0xe8faff, fur: 0xffffff, fx: 0xbff4ff, fx2: 0xffffff },
        head: { headgear: P('ice-crown', 'trans', 'trans', { spikes: 7 }) },
        outfit: { pieces: { overgarment: P('fur-coat-4tails', 'fur', 'fur', { length: 1.0, tails: 4 }), pauldronR: P('ice-crystal-pauldron', 'trans', 'trans', { crystals: 5 }) } },
        extras: [{ id: 'twin-crystal-ice', scale: 2.0 }, { id: 'twin-crystal-storm', scale: 2.0, mat: 'trans', color: 'accent2' }],
        fx: { pattern: { type: 'frost-creep', color: 0xbff4ff, speed: 0.35, parts: ['coat', 'scepter'] } } },
      prisme: { name: 'Prisme', desc: 'Manteau irisé, cristaux prismatiques et cheveux roses.',
        palette: { primary: 0x6a2cc0, primaryDark: 0x3a1470, secondary: 0xffb8e8, cloth2: 0x2a1450, hair: 0xff7ad9, brows: 0xe060b0, skin: 0xffd9bd, accent: 0x00ffd0, accent2: 0xff7ad9, eyesL: 0x00ffd0, eyesR: 0xff7ad9, gold: 0xe8d0ff, gem: 0x00ffd0, glow: 0xffffff, trans: 0xe8d8ff, fx: 0x00ffd0, fx2: 0xff7ad9 },
        outfit: { pieces: { overgarment: P('long-coat-open-4tails', 'cloth', 'primary', { length: 1.0, tails: 4, iridescent: true }) } },
        weapon: { variant: 'prisme', parts: { head: { style: 'crystal-fork', left: { mat: 'trans', color: 'accent' }, right: { mat: 'trans', color: 'accent2' } } } },
        fx: { particles: { type: 'prism', color: 0xffffff, count: 60 }, trail: { color: 0xff7ad9, rainbow: true }, pulse: { color: 0x00ffd0, parts: ['crystals'] } } },
      cataclysme: { name: 'Cataclysme', desc: 'Peau fissurée de lumière rouge, couronne de roches flottantes.',
        palette: { primary: 0x14142a, primaryDark: 0x0a0a14, secondary: 0x3a1a2a, cloth2: 0x0a0a14, hair: 0x2a1a1a, brows: 0x2a1a1a, skin: 0xffd9bd, accent: 0xff3d6e, accent2: 0xff7a3d, eyesL: 0xff3d6e, eyesR: 0xff7a3d, gold: 0x3a2a2a, gem: 0xff3d6e, glow: 0xff5a5a, trans: 0xff6a6a, fx: 0xff3d6e, fx2: 0xff7a3d },
        head: { marks: [{ type: 'cracks', where: 'face-arms', color: 'accent', glow: 0.8 }], eyes: { glow: 1 } },
        extras: [{ id: 'rock-crown', bone: 'head', mat: 'leather', color: 0x2a2020, count: 6, orbit: { radius: 0.32, speed: 0.6, y: 0.42 }, crackGlow: 'accent' },
          { id: 'twin-crystal-ice', mat: 'glow', color: 'accent' }, { id: 'twin-crystal-storm', mat: 'glow', color: 'accent2' }],
        fx: { floating: ['rock-crown', 'twin-crystal-ice', 'twin-crystal-storm'], halo: { type: 'rock-crown', color: 0xff3d6e }, energyCape: { color: 0xff3d6e, color2: 0x14142a }, light: { color: 0xff3d6e } } },
    },
  };

  // ------------------------------------------------------------------ NÉCROMANCIEN
  DEFS.Necromancien = {
    hero: 'Vedric Morneval', title: 'Seigneur des Limbes',
    signature: 'grand croissant de la faux, couronne d’os blanche sur la capuche, longue traîne en lambeaux, lueur violette',
    height: 2.32,
    palette: { skin: 0xb9b0c4, hair: 0xece8f4, eyes: 0xb56bff, brows: 0xe0dce8, lip: 0x4a3a50, primary: 0x3a1f5c, primaryDark: 0x1e1030, secondary: 0x5a3a7a,
      cloth2: 0x14111c, leather: 0x2a1f30, leatherDark: 0x150f1a, metal: 0x3a3646, metalDark: 0x1e1c26, gold: 0x8a7a5a, accent: 0xb56bff, gem: 0xb56bff,
      glow: 0xc58bff, cape: 0x1e1030, capeLining: 0x3a1f5c, blade: 0x2a2632, bladeEdge: 0xb56bff, bone: 0xd8d0bc, fur: 0x2a2030, trans: 0xc8a0ff, fx: 0x8b4dff, fx2: 0xd8b0ff },
    body: { sex: 'm', build: 'gaunt', height: 2.24, headSize: 0.37, shoulders: 0.70, chest: 0.27, waist: 0.34, hips: 0.40, neck: 0.065, muscle: 0.15, legRatio: 0.5, armLen: 1.08, handSize: 1.1, posture: { hunch: 0.18, stance: 0.26, chin: -0.06 }, hover: 0 },
    head: { face: 'gaunt', age: 60, jaw: 0.5, cheek: 0.95, nose: 'hooked', lips: { color: 'lip', full: 0.2 },
      eyes: { shape: 'hooded', color: 'eyes', size: 0.95, glow: 0.9, pupil: false }, brows: { shape: 'thin', thick: 0.3, color: 'brows' },
      hair: { style: 'long-straight-under-hood', color: 'hair', length: 0.8, physics: 'loose', bones: ['hairA', 'hairB'] },
      beard: { style: 'braided-goatee', color: 'hair', rings: 'bone' }, scar: [], ears: 'human', earrings: [],
      marks: [{ type: 'runes', where: 'forehead-chin', color: 0x14111c }, { type: 'veins', where: 'temples', color: 0x4a3a5a }, { type: 'paint', where: 'eye-shadows', color: 0x14111c }],
      expression: 'sneer',
      headgear: P('deep-hood-bone-crown', 'cloth', 'primaryDark', { depth: 0.8, crown: { mat: 'bone', color: 'bone', style: 'phalanges', points: 7 } }), mask: null },
    hands: { pose: 'open', grip: 'staff', fingerLen: 1.25, gloves: 'none', rings: 'bone' },
    outfit: { id: 'necro_limbes', variant: 'base', armorWeight: 'light', pieces: {
      torsoUnder: P('robe-floor-tattered', 'cloth2', 'cloth2', { length: 1.0, hem: 'tatters' }),
      overgarment: P('surplice-long-tails', 'cloth', 'primary', { length: 0.85, front: true }),
      pauldronL: P('bone-pauldron', 'bone', 'bone', { style: 'ribs-vertebrae', spikes: 3 }),
      pauldronR: P('bone-pauldron', 'bone', 'bone', { style: 'ribs-vertebrae', spikes: 3 }),
      belt: P('rope-belt', 'leather', 'leather'),
      hipL: P('phylactery', 'trans', 'trans', { glow: 'glow' }),
      beltItems: P('mini-skulls', 'bone', 'bone', { count: 2 }),
      hipR: P('skull-relic', 'bone', 'bone', { eyes: 'glow', chain: 'metal' }),
      cape: P('cape-tattered-trailing', 'cape', 'cape', { length: 1.6, lining: 'capeLining', edge: 'tatters', trail: true }),
      sleeves: P('wide-tattered-sleeves', 'cloth2', 'cloth2', { bandages: 0x8a8070 }),
      jewelry: P('bone-rings', 'bone', 'bone'),
      back: P('grimoire-floating', 'leather', 'leatherDark', { eye: 'glow', at: 'behind-R-shoulder', floating: true }),
    } },
    weapon: { id: 'faux_ame', variant: 'base', kind: 'scythe', hand: 'R', length: 2.0,
      parts: { shaft: { len: 2.0, mat: 'leather', color: 0x1a141e, gnarled: true, chain: 'metal' },
        blade: { len: 0.9, width: 0.16, curve: 0.8, mat: 'blade', color: 'blade', edge: 'bladeEdge', edgeGlow: true },
        skull: { mat: 'bone', color: 'bone', eyes: 'glow', at: 'joint' } },
      offhand: null, glowMap: { epee: 'skull-eyes', dague: 'phylactery', feu: 'blade-edge' } },
    extras: [],
    fx: { color: 0x8b4dff, color2: 0xd8b0ff, shadowFlames: true },
    anim: { style: 'dread', weight: 0.5, bounce: 0.0, idle: ['scythe-sway', 'head-tilt', 'claw-flex'] },
    sovereign: { keep: true, note: "conserver userData.sovereign (couronne, ailes d'ombre, grande aura) masqué par défaut, affiché pendant l'ultime" },
    skins: {
      violet: { name: 'Violet funèbre', desc: 'Capuche à couronne d’os, cape en lambeaux et faux d’âme au fil violet.' },
      vert: { name: 'Flamme verte', desc: 'Flammes, yeux et fil de faux vert spectral.',
        palette: { cape: 0x0f241c, primary: 0x1f4a3a, primaryDark: 0x0f241c, secondary: 0x2a6a4a, cloth2: 0x0e1612, eyes: 0x2fd48a, accent: 0x2fd48a, gem: 0x2fd48a, glow: 0x7affc0, capeLining: 0x1f4a3a, bladeEdge: 0x2fd48a, trans: 0x7affc0, fx: 0x2fd48a, fx2: 0xb0ffd8 },
        fx: { rimParts: ['blade-edge', 'phylactery'] } },
      sang: { name: 'Rite de sang', desc: 'Robe bordeaux, runes de sang sur la peau, faux à lame rouge.',
        palette: { cape: 0x2a0812, primary: 0x5a0f22, primaryDark: 0x2a0812, secondary: 0x7a1a30, cloth2: 0x1a0a0e, eyes: 0xff3a5a, accent: 0xd6336c, gem: 0xd6336c, glow: 0xff6a8a, capeLining: 0x5a0f22, blade: 0x3a0a14, bladeEdge: 0xff3a5a, trans: 0xff6a8a, fx: 0xd6336c, fx2: 0xff9ab0 },
        head: { marks: [{ type: 'runes', where: 'forehead-chin', color: 0xa0142a }, { type: 'runes', where: 'hands', color: 0xa0142a }] },
        fx: { rimParts: ['blade-edge'] } },
      glace: { name: 'Glace funèbre', desc: 'Robe givrée, couronne de glace et faux de glace.',
        palette: { cape: 0x0e1628, primary: 0x1a2a4a, primaryDark: 0x0e1628, secondary: 0x3a5a8a, cloth2: 0x0a1020, eyes: 0x46d4ff, accent: 0x46d4ff, gem: 0x46d4ff, glow: 0xbff0ff, capeLining: 0x3a5a8a, blade: 0xbff0ff, bladeEdge: 0xffffff, trans: 0xbff0ff, fx: 0x46d4ff, fx2: 0xffffff },
        head: { headgear: P('deep-hood-ice-crown', 'cloth', 'primaryDark', { depth: 0.8, crown: { mat: 'trans', color: 'trans', style: 'ice-spikes', points: 7 } }) },
        weapon: { variant: 'glace', parts: { blade: { mat: 'trans', color: 'blade' } } },
        fx: { pattern: { type: 'frost-creep', color: 0x46d4ff, speed: 0.35, parts: ['robe', 'scythe'] } } },
      corbeau: { name: 'Corbeau de peste', desc: 'Masque à bec d’os, col de plumes noires et encensoir fumant.',
        palette: { cape: 0x0e140c, primary: 0x1f2a1a, primaryDark: 0x0e140c, secondary: 0x3a4a2a, cloth2: 0x0c0e0a, eyes: 0x9aff4a, accent: 0x9aff4a, gem: 0x9aff4a, glow: 0xc8ff8a, capeLining: 0x1f2a1a, bladeEdge: 0x9aff4a, fur: 0x14141a, trans: 0xc8ff8a, fx: 0x7ad84a, fx2: 0x2a3a1a },
        head: { mask: P('beak-mask-bone', 'bone', 'bone', { covers: 'full', lenses: 'glow' }) },
        outfit: { pieces: { collar: P('feather-collar', 'fur', 'fur', { volume: 1.2 }), hipR: P('censer-smoking', 'metal', 'metal', { chain: 'metal', smoke: 'glow' }) } },
        weapon: { variant: 'dentelee', parts: { blade: { style: 'serrated' } } },
        fx: { pattern: { type: 'smoke', color: 0x7ad84a, speed: 0.5, parts: ['censer', 'eyes'] } } },
      or: { name: 'Or noir', desc: 'Robe noire brodée d’or, masque mortuaire doré et faux dorée.',
        palette: { cape: 0x0a0810, primary: 0x14111c, primaryDark: 0x0a0810, secondary: 0x2a2014, cloth2: 0x0a0810, gold: 0xffc94a, eyes: 0xffc94a, accent: 0xffc94a, gem: 0xffc94a, glow: 0xffe08a, capeLining: 0x5a4210, bone: 0xffc94a, blade: 0x3a2a10, bladeEdge: 0xffd24a, fx: 0xffc94a, fx2: 0xfff2c0 },
        head: { mask: P('death-mask-gold', 'gold', 'gold', { covers: 'full' }), headgear: P('deep-hood-bone-crown', 'cloth', 'primaryDark', { depth: 0.8, crown: { mat: 'gold', color: 'gold', style: 'black-gold', points: 7 } }) },
        outfit: { pieces: { overgarment: P('surplice-long-tails', 'cloth', 'primary', { length: 0.85, embroidery: 'gold' }) } },
        weapon: { variant: 'or', parts: { shaft: { color: 0x1a1408, chain: 'gold' }, skull: { mat: 'gold', color: 'gold' } } },
        fx: { particles: { type: 'gold-dust', color: 0xffc94a, count: 60 }, trail: { color: 0xffc94a }, pulse: { color: 0xffe08a, parts: ['embroidery', 'scythe'] } } },
      roi: { name: 'Roi blanc', desc: 'Robe blanche royale, immense couronne d’os et trois crânes en orbite.',
        palette: { primary: 0xf2f0ff, primaryDark: 0xc8c4d8, secondary: 0xffffff, cloth2: 0xe0dcec, leather: 0xc8c4d8, eyes: 0xffffff, accent: 0xffffff, gem: 0xf2f0ff, glow: 0xffffff, cape: 0xf2f0ff, capeLining: 0xb8b0d8, bone: 0xfaf8f0, blade: 0xfaf8f0, bladeEdge: 0xffffff, fx: 0xf2f0ff, fx2: 0xb8a0ff },
        head: { headgear: P('deep-hood-bone-crown', 'cloth', 'primary', { depth: 0.7, crown: { mat: 'bone', color: 'bone', style: 'royal-tall', points: 9, height: 0.32 } }) },
        outfit: { pieces: { cape: P('cape-energy', 'cape', 'cape', { length: 1.6, spectral: true }) } },
        weapon: { variant: 'os-blanc', parts: { shaft: { mat: 'bone', color: 'bone' }, blade: { mat: 'bone', color: 'bone', edgeGlow: true } } },
        extras: [{ id: 'floating-skull', bone: 'chest', mat: 'bone', color: 'bone', count: 3, orbit: { radius: 0.85, speed: 0.7, y: 1.5 }, eyes: 'glow' }],
        fx: { floating: ['floating-skull'], halo: { type: 'bone-crown-light', color: 0xffffff }, energyCape: { color: 0xf2f0ff, color2: 0xb8a0ff }, light: { color: 0xf2f0ff } } },
    },
  };

  // Ordre et raretés (identiques à js/sys/cosmetics.js SKIN_TABLE ; Nécromancien : + 'corbeau')
  const SKIN_ORDER = {
    Guerrier: [['acier', 'commun'], ['foret', 'rare'], ['carmin', 'rare'], ['ebene', 'epique'], ['aurore', 'epique'], ['dore', 'legendaire'], ['souverain', 'mythique']],
    Mage: [['violet', 'commun'], ['azur', 'rare'], ['rubis', 'rare'], ['sylve', 'epique'], ['cendres', 'epique'], ['astral', 'legendaire'], ['archimage', 'mythique']],
    Voleur: [['vert', 'commun'], ['nuit', 'rare'], ['rouille', 'rare'], ['poison', 'epique'], ['ombre', 'epique'], ['jade', 'legendaire'], ['spectre', 'mythique']],
    Assassin: [['nuit', 'commun'], ['cendre', 'rare'], ['sang', 'rare'], ['jade', 'epique'], ['foudre', 'epique'], ['neige', 'legendaire'], ['neant', 'mythique']],
    Archer: [['sylve', 'commun'], ['automne', 'rare'], ['pervenche', 'rare'], ['nuit', 'epique'], ['braise', 'epique'], ['emeraude', 'legendaire'], ['argent', 'mythique']],
    Paladin: [['azur', 'commun'], ['pourpre', 'rare'], ['emeraude', 'rare'], ['ecarlate', 'epique'], ['aube', 'epique'], ['obsidienne', 'legendaire'], ['seraphin', 'mythique']],
    Elementaliste: [['marine', 'commun'], ['braise', 'rare'], ['sylve', 'rare'], ['tempete', 'epique'], ['glacier', 'epique'], ['prisme', 'legendaire'], ['cataclysme', 'mythique']],
    Necromancien: [['violet', 'commun'], ['vert', 'rare'], ['sang', 'rare'], ['glace', 'epique'], ['corbeau', 'epique'], ['or', 'legendaire'], ['roi', 'mythique']],
  };

  // ==================================================================
  //  RÉSOLUTION
  // ==================================================================
  const CLASS_ALIAS = {};
  CLASSES.forEach((c) => { CLASS_ALIAS[strip(c)] = c; });
  function normClass(x) {
    try { if (x && DEFS[x]) return x; const k = strip(x); return CLASS_ALIAS[k] || null; } catch (e) { return null; }
  }
  function normSkin(classId, id) {
    if (id == null || id === '') return null;
    let s = String(id);
    const i = s.lastIndexOf(':'); if (i >= 0) s = s.slice(i + 1);
    s = strip(s);
    const list = SKIN_ORDER[classId] || [];
    for (let k = 0; k < list.length; k++) if (list[k][0] === s) return s;
    return null;
  }
  function rarityOf(classId, skinId) {
    const list = SKIN_ORDER[classId] || [];
    for (let k = 0; k < list.length; k++) if (list[k][0] === skinId) return list[k][1];
    return 'commun';
  }

  /** remplace les clés de palette (chaînes) par leur valeur hex, partout dans l'objet ; garde la clé dans colorKey */
  const COLOR_FIELDS = { color: 1, color2: 1, trim: 1, face: 1, rim: 1, boss: 1, emblemColor: 1, gem: 1, edge: 1, core: 1, lining: 1, belly: 1, wrap: 1, eyes: 1, lens: 1, tassel: 1, tie: 1, leaves: 1, stains: 1, plume: 1, rope: 1, veins: 1, verdigris: 1, smoke: 1, slits: 1, lenses: 1, glow: 1, crackGlow: 1, shaft: 0, studs: 1, rivetMat: 0 };
  function resolveColors(o, pal, depth) {
    if (depth > 8 || o == null) return o;
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { const v = o[i]; if (typeof v === 'string' && isHex(pal[v])) o[i] = pal[v]; else if (typeof v === 'object') resolveColors(v, pal, depth + 1); } return o; }
    if (!isObj(o)) return o;
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'string' && COLOR_FIELDS[k] === 1 && isHex(pal[v])) { if (k === 'color') o.colorKey = v; o[k] = pal[v]; }
      else if (isObj(v) || Array.isArray(v)) resolveColors(v, pal, depth + 1);
    }
    return o;
  }

  function completePalette(p) {
    const d = (k, v) => { if (!isHex(p[k])) p[k] = v; };
    d('skin', 0xe8c0a0); d('hair', 0x4a3424); d('eyes', 0x6a5a4a); d('primary', 0x5a6a8a);
    d('skinShade', shade(p.skin, -0.18)); d('hairShade', shade(p.hair, -0.25)); d('brows', shade(p.hair, -0.15)); d('lip', shade(p.skin, -0.28));
    d('eyesL', p.eyes); d('eyesR', p.eyes); d('primaryDark', shade(p.primary, -0.35)); d('secondary', shade(p.primary, 0.3));
    d('cloth2', shade(p.primary, -0.5)); d('leather', 0x5a3a22); d('leatherDark', shade(p.leather, -0.35)); d('metal', 0xb9c3d3); d('metalDark', shade(p.metal, -0.4));
    d('gold', 0xd9a93a); d('accent', p.gold); d('accent2', p.accent); d('gem', p.accent); d('glow', shade(p.gem, 0.35)); d('cape', p.primaryDark); d('capeLining', p.cloth2);
    d('blade', p.metal); d('bladeEdge', shade(p.blade, 0.4)); d('bone', 0xe6dcc4); d('fur', 0x8a7a68); d('trans', 0xd0e8ff); d('fx', p.accent); d('fx2', 0xffffff);
    return p;
  }

  /** extras d'un skin : même id que la base = fusion ; nouvel id = ajout */
  function mergeExtras(base, over) {
    const out = clone(base || []);
    (over || []).forEach((e) => {
      if (!e || !e.id) return;
      const i = out.findIndex((x) => x.id === e.id);
      if (i >= 0) out[i] = merge(out[i], e); else out.push(clone(e));
    });
    return out;
  }
  /** pièces : même id = fusion des paramètres ; id différent = remplacement ; null = retrait */
  function mergePieces(base, over) {
    const out = clone(base || {});
    if (!isObj(over)) return out;
    for (const slot in over) {
      const v = over[slot];
      if (v === null) { delete out[slot]; continue; }
      if (!isObj(v)) continue;
      out[slot] = out[slot] && (!v.id || v.id === out[slot].id) ? merge(out[slot], v) : clone(v);
    }
    return out;
  }

  const CACHE = {};
  function build(classId, skinId, legacy, rarityHint) {
    const D = DEFS[classId];
    const sk = (skinId && D.skins[skinId]) || {};
    const firstSkin = SKIN_ORDER[classId][0][0];
    const sid = skinId || firstSkin;
    const rarity = skinId ? rarityOf(classId, sid) : (RARITIES.indexOf(rarityHint) >= 0 ? rarityHint : 'commun');

    // palette
    const pal = merge(D.palette, sk.palette || {});
    if (!skinId && legacy) {
      if (isHex(legacy.color)) { pal.primary = legacy.color; pal.primaryDark = shade(legacy.color, -0.35); pal.cape = shade(legacy.color, -0.35); pal.fx = shade(legacy.color, 0.25); }
      if (isHex(legacy.hair)) { pal.hair = legacy.hair; pal.brows = shade(legacy.hair, -0.15); delete pal.hairShade; }
      if (isHex(legacy.skin)) { pal.skin = legacy.skin; delete pal.skinShade; delete pal.lip; }
      if (isHex(legacy.accent)) { pal.accent = legacy.accent; pal.bladeEdge = classId === 'Assassin' ? legacy.accent : pal.bladeEdge; pal.gem = legacy.accent; delete pal.glow; }
    }
    completePalette(pal);

    const head = merge(D.head, sk.head || {});
    // headgear/mask : remplacement complet quand l'id change
    if (sk.head && isObj(sk.head.headgear) && D.head.headgear && sk.head.headgear.id && sk.head.headgear.id !== D.head.headgear.id) head.headgear = clone(sk.head.headgear);
    if (sk.head && isObj(sk.head.mask) && D.head.mask && sk.head.mask.id && sk.head.mask.id !== D.head.mask.id) head.mask = clone(sk.head.mask);

    const outfitBase = D.outfit;
    const outfitOver = sk.outfit || {};
    const outfit = {
      id: outfitBase.id + (sid !== firstSkin ? '_' + sid : ''),
      variant: sid,
      armorWeight: outfitOver.armorWeight || outfitBase.armorWeight,
      asymmetric: !!outfitBase.asymmetric,
      pieces: mergePieces(outfitBase.pieces, outfitOver.pieces),
    };

    const wOver = sk.weapon || {};
    const weapon = merge(D.weapon, { variant: wOver.variant || (sid === firstSkin ? 'base' : sid), parts: wOver.parts || {} });
    if (wOver.offhand !== undefined) {
      weapon.offhand = wOver.offhand === null ? null : (D.weapon.offhand && (!wOver.offhand.id || wOver.offhand.id === D.weapon.offhand.id) ? merge(D.weapon.offhand, wOver.offhand) : merge(D.weapon.offhand ? { hand: D.weapon.offhand.hand, bone: D.weapon.offhand.bone } : {}, wOver.offhand));
    }

    const extras = mergeExtras(D.extras, sk.extras);

    // fx : rareté + classe + skin
    const fx = merge(merge(RARITY_FX[rarity] || RARITY_FX.commun, D.fx || {}), sk.fx || {});
    fx.rarity = rarity;
    if (!isHex(fx.color)) fx.color = pal.fx;
    if (!isHex(fx.color2)) fx.color2 = pal.fx2;
    if (sk.palette && isHex(sk.palette.fx)) fx.color = sk.palette.fx;
    if (sk.palette && isHex(sk.palette.fx2)) fx.color2 = sk.palette.fx2;
    if (!skinId && legacy && isHex(legacy.color)) fx.color = pal.fx;
    fx.rimColor = isHex(fx.rimColor) ? fx.rimColor : fx.color;
    ['pattern', 'particles', 'trail', 'pulse', 'halo', 'energyCape', 'light'].forEach((k) => {
      if (isObj(fx[k])) { if (!isHex(fx[k].color)) fx[k].color = fx.color; if (k === 'energyCape' && !isHex(fx[k].color2)) fx[k].color2 = fx.color2; }
    });
    if (fx.rim && !Array.isArray(fx.rimParts)) fx.rimParts = ['weapon'];
    if (!Array.isArray(fx.floating)) fx.floating = [];

    const body = merge(D.body, sk.body || {});
    const spec = {
      v: 6, classId, skinId: sid, rarity,
      skinName: sk.name || D.skins[firstSkin].name, skinDesc: sk.desc || D.skins[firstSkin].desc || '',
      hero: D.hero, title: D.title,
      height: Math.max(2.1, Math.min(2.4, D.height + (body.hover || 0))),
      palette: pal, body, head,
      hands: merge(D.hands, sk.hands || {}),
      outfit, weapon, extras, fx,
      anim: merge(D.anim, sk.anim || {}),
      signature: D.signature,
      legacy: !skinId && legacy ? { color: legacy.color, hair: legacy.hair, skin: legacy.skin, accent: legacy.accent } : null,
    };
    if (D.sovereign) spec.sovereign = clone(D.sovereign);
    // résolution des clés de palette dans les pièces/arme/tête/extras
    resolveColors(spec.head, pal, 0);
    resolveColors(spec.outfit.pieces, pal, 0);
    resolveColors(spec.weapon, pal, 0);
    resolveColors(spec.extras, pal, 0);
    spec.body.skinTone = pal.skin;
    return spec;
  }

  function fallbackSpec(classId) {
    return { v: 6, classId: classId || 'Guerrier', skinId: null, rarity: 'commun', skinName: '', skinDesc: '', hero: '', title: '', height: 2.2,
      palette: completePalette({}), body: { sex: 'm', build: 'athletic', height: 2.16, headSize: 0.37, shoulders: 0.72, chest: 0.3, waist: 0.4, hips: 0.46, neck: 0.08, muscle: 0.5, legRatio: 0.5, armLen: 1, handSize: 1, posture: { hunch: 0, stance: 0.3, chin: 0 }, hover: 0 },
      head: { face: 'oval', age: 25, eyes: { shape: 'almond', color: 0x6a5a4a, size: 1, glow: 0, pupil: true }, brows: { shape: 'straight', thick: 0.5, color: 0x3a2a1a }, hair: { style: 'short', color: 0x4a3424, length: 0.3, physics: 'none' }, beard: null, scar: [], ears: 'human', earrings: [], marks: [], expression: 'determined', headgear: null, mask: null },
      hands: { pose: 'grip', grip: 'normal', fingerLen: 1, gloves: 'none' }, outfit: { id: 'fallback', variant: 'base', armorWeight: 'light', pieces: {} },
      weapon: { id: 'none', variant: 'base', kind: 'none', hand: 'R', length: 0, parts: {}, offhand: null, glowMap: {} }, extras: [],
      fx: clone(RARITY_FX.commun), anim: { style: 'agile', weight: 0.5, bounce: 0.1, idle: [] }, signature: '', legacy: null };
  }

  function resolve(classId, opts) {
    try {
      const o = isObj(opts) ? opts : {};
      const cls = normClass(classId) || normClass(o.classId) || 'Guerrier';
      const sid = normSkin(cls, o.skinId != null ? o.skinId : o.skin && typeof o.skin === 'string' ? o.skin : null);
      const legacy = sid ? null : { color: o.color, hair: o.hair, skin: o.skin, accent: o.accent };
      const hasLegacy = !!legacy && (isHex(legacy.color) || isHex(legacy.hair) || isHex(legacy.skin) || isHex(legacy.accent));
      const key = cls + '|' + (sid || '') + '|' + (hasLegacy ? [legacy.color, legacy.hair, legacy.skin, legacy.accent].join(',') : '') + '|' + (sid ? '' : (o.rarity || ''));
      if (!CACHE[key]) CACHE[key] = build(cls, sid, hasLegacy ? legacy : null, o.rarity);
      return clone(CACHE[key]);
    } catch (e) {
      try { if (typeof console !== 'undefined') console.warn('[HeroDefs] resolve', e); } catch (e2) { /* ignore */ }
      return fallbackSpec(normClass(classId));
    }
  }

  function skins(classId) {
    try {
      const cls = normClass(classId); if (!cls) return [];
      return SKIN_ORDER[cls].map((r) => { const s = DEFS[cls].skins[r[0]] || {}; return { id: r[0], rarity: r[1], name: s.name || r[0], desc: s.desc || '' }; });
    } catch (e) { return []; }
  }
  function info(classId) {
    try { const cls = normClass(classId); if (!cls) return null; const D = DEFS[cls]; return { classId: cls, hero: D.hero, title: D.title, signature: D.signature, anim: clone(D.anim), height: D.height }; } catch (e) { return null; }
  }

  G.HeroDefs = {
    version: 6,
    resolve,
    classes: () => CLASSES.slice(),
    skins,
    info,
    rarityFx: (r) => clone(RARITY_FX[r] || RARITY_FX.commun),
    normClass,
    shade,
    SLOTS: SLOTS.slice(), LAYERS: LAYERS.slice(), PALETTE_KEYS: PALETTE_KEYS.slice(), RARITIES: RARITIES.slice(),
  };
})();
