window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v6 « Incarnation » — js/gfx/heroes/heroes.js  (A2, 3D Modeler)
   Enregistre les 8 héros v6 : G.GFX.registerModel('hero', classId, build).
   Pipeline (CONTRACT-V6 §1) :
     spec = G.HeroDefs.resolve(id, opts)   (sinon spec par défaut lisible ci-dessous)
     R = G.HeroKit.rig → body / head / hands
     G.HeroOutfits.build(R, spec)          (sinon tenue de base minimale)
     G.HeroWeapons.build(R, spec)          (sinon arme de base par type)
     root = R.finish(...) → G.HeroVFX.attach → G.HeroRender.prepare → G.HeroAnim.init
   Toute étape absente est sautée ; une exception dans une étape optionnelle est journalisée
   et l'étape ignorée ; une exception dans le cœur (kit) → repli sur l'ancien modèle
   (builder de class-models si exposé, sinon makeHero de graphics.js).
   Désactivation : window.G_HERO6_OFF = true (ou ?hero6=0 dans l'URL) → anciens modèles.
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const T = window.THREE;
  if (!T || !G.GFX || typeof G.GFX.registerModel !== 'function') return;

  const CLASSES = ['Guerrier', 'Mage', 'Voleur', 'Assassin', 'Archer', 'Paladin', 'Elementaliste', 'Necromancien'];
  const PI = Math.PI, HPI = PI / 2, TAU = PI * 2;
  const warned = {};
  const warn = (k, e) => { if (warned[k]) return; warned[k] = 1; try { console.warn('[heroes v6] ' + k, e); } catch (_) { /* rien */ } };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const off = () => {
    if (window.G_HERO6_OFF) return true;
    try { return /[?&]hero6=0\b/.test(String(window.location && window.location.search)); } catch (e) { return false; }
  };

  // ------------------------------------------------------------------
  // Specs par défaut (si G.HeroDefs absent) — lisibles par classe
  // ------------------------------------------------------------------
  const DEFAULTS = {
    Guerrier: { pal: { skin: 0xe2b08a, hair: 0x6a4424, eyes: 0x3d6fa8, primary: 0x2f5fa8, secondary: 0xd8dde6, leather: 0x6b4423, metal: 0xaab4c0, gold: 0xc9a23a }, body: { sex: 'm', build: 'sturdy', muscle: 0.8, height: 2.28 }, head: { hair: { style: 'short' }, beard: { style: 'stubble' }, jaw: 0.8 }, weapon: { kind: 'sword', hand: 'R' }, anim: 'heavy' },
    Mage: { pal: { skin: 0xf0c9a8, hair: 0xd8d0c0, eyes: 0x8a5ad8, primary: 0x5b2a9a, secondary: 0x2a1748, leather: 0x4a2c1c, metal: 0x9aa0b4, gold: 0xd9b24a }, body: { sex: 'm', build: 'slender', muscle: 0.3, height: 2.2 }, head: { hair: { style: 'long' }, beard: { style: 'short' } }, weapon: { kind: 'staff', hand: 'R' }, anim: 'caster' },
    Voleur: { pal: { skin: 0xd9a47e, hair: 0x2a1c14, eyes: 0x4a8a5a, primary: 0x2f6b4a, secondary: 0x2a3a2f, leather: 0x5a3a22, metal: 0x9aa3ad, gold: 0x2fd4c0 }, body: { sex: 'm', build: 'lean', muscle: 0.55, height: 2.16 }, head: { hair: { style: 'swept' } }, weapon: { kind: 'daggers', hand: 'both' }, anim: 'agile' },
    Assassin: { pal: { skin: 0xe6c0a0, hair: 0x14121a, eyes: 0xc83a40, primary: 0x1c1a22, secondary: 0x8a1424, leather: 0x2a2228, metal: 0x7a808c, gold: 0xd7343f }, body: { sex: 'f', build: 'lean', muscle: 0.5, height: 2.14 }, head: { hair: { style: 'ponytail' } }, weapon: { kind: 'daggers', hand: 'both' }, anim: 'agile' },
    Archer: { pal: { skin: 0xf0c8a0, hair: 0xb8743a, eyes: 0x4a9a5a, primary: 0x2f6e3a, secondary: 0x6b8a3a, leather: 0x7a5230, metal: 0x9aa3ad, gold: 0xc9a86a }, body: { sex: 'f', build: 'athletic', muscle: 0.45, height: 2.18 }, head: { hair: { style: 'braid' }, ears: 'pointed' }, weapon: { kind: 'longbow', hand: 'L' }, anim: 'ranger' },
    Paladin: { pal: { skin: 0xe8b890, hair: 0xe8c86a, eyes: 0x3a7ad8, primary: 0xf0ead8, secondary: 0x2f6fd1, leather: 0x6b4423, metal: 0xd8dde6, gold: 0xe0b53a }, body: { sex: 'm', build: 'massive', muscle: 0.85, height: 2.32 }, head: { hair: { style: 'short' }, beard: { style: 'full' } }, weapon: { kind: 'mace', hand: 'R' }, anim: 'noble' },
    Elementaliste: { pal: { skin: 0xd8a888, hair: 0xcfe9ff, eyes: 0x7ad8ff, primary: 0x2a5aa8, secondary: 0xdff3ff, leather: 0x3a3048, metal: 0xb8c8dc, gold: 0x9fe8ff }, body: { sex: 'f', build: 'slender', muscle: 0.35, height: 2.18 }, head: { hair: { style: 'wild' } }, weapon: { kind: 'scepter', hand: 'R' }, anim: 'caster' },
    Necromancien: { pal: { skin: 0xc8bcc8, hair: 0x1a1420, eyes: 0x3dffb0, primary: 0x2a1838, secondary: 0x12101a, leather: 0x2a2028, metal: 0x6a6478, gold: 0x8b6bff }, body: { sex: 'm', build: 'gaunt', muscle: 0.3, height: 2.24 }, head: { hair: { style: 'long' } }, weapon: { kind: 'scythe', hand: 'R' }, anim: 'dread' },
  };
  function defaultSpec(id, opts) {
    const D = DEFAULTS[id] || DEFAULTS.Guerrier;
    const pal = Object.assign({}, D.pal);
    if (opts && opts.color != null) pal.primary = opts.color;
    if (opts && opts.hair != null) pal.hair = opts.hair;
    if (opts && opts.skin != null) pal.skin = opts.skin;
    return {
      v: 6, classId: id, skinId: (opts && opts.skinId) || null, rarity: (opts && opts.rarity) || 'commun',
      height: D.body.height + 0.04, palette: pal,
      body: Object.assign({}, D.body), head: JSON.parse(JSON.stringify(D.head)),
      hands: { pose: 'grip', gloves: 'leather' }, outfit: { id: id, pieces: {} }, weapon: Object.assign({}, D.weapon),
      fx: { tier: 0 }, anim: { style: D.anim },
    };
  }

  // ------------------------------------------------------------------
  // Traduction spec A1 → paramètres du kit
  // ------------------------------------------------------------------
  function mapHair(style, covers) {
    const s = String(style || 'short').toLowerCase();
    let out;
    if (/hidden|none/.test(s)) out = 'shaved';
    else if (/bald|chauve/.test(s)) out = 'bald';
    else if (/ponytail|queue/.test(s)) out = 'ponytail';
    else if (/braid|tresse/.test(s)) out = 'braid';
    else if (/bun|chignon/.test(s)) out = 'bun';
    else if (/catogan|tied/.test(s)) out = 'tied';
    else if (/mohawk|crest|crête/.test(s)) out = 'crest';
    else if (/spike|electric|flame|shaggy|messy|wild/.test(s)) out = 'wild';
    else if (/slick|undercut|swept|mid/.test(s)) out = 'swept';
    else if (/bob|long|float|flow|straight/.test(s)) out = 'long';
    else if (/shave|rasé/.test(s)) out = 'shaved';
    else if (/crop|buzz/.test(s)) out = 'crop';
    else if (/hood|capuche/.test(s)) out = 'hood';
    else out = 'short';
    // coiffe qui couvre la tête : on réduit la chevelure (pas de mèches qui traversent le casque)
    const c = covers && covers.head;
    if (c === 'full') out = out === 'long' || out === 'braid' || out === 'ponytail' || out === 'tied' ? 'tied' : 'shaved';
    else if (c === 'top') out = out === 'wild' || out === 'crest' || out === 'bun' || out === 'swept' ? 'short' : out;
    else if (c === 'hood') out = out === 'long' || out === 'braid' || out === 'tied' || out === 'ponytail' ? 'tied' : out === 'wild' || out === 'crest' || out === 'bun' ? 'short' : out;
    return out;
  }
  function mapBeard(b) {
    if (!b) return null;
    const s = String((typeof b === 'string' ? b : b.style) || '').toLowerCase();
    if (!s || s === 'none') return null;
    if (/braided-goatee|goatee|bouc/.test(s)) return 'goatee';
    if (/braid/.test(s)) return 'braided';
    if (/mous|mustache/.test(s)) return 'mustache';
    if (/stubble|naissante/.test(s)) return 'stubble';
    if (/short|courte/.test(s)) return 'short';
    return 'full';
  }
  function bodySpecOf(spec) {
    const b = spec.body || {}, p = spec.palette || {};
    return { sex: b.sex || 'm', build: b.build || 'athletic', muscle: b.muscle, skin: p.skin, headScale: b.headSize ? Math.max(0.85, Math.min(1.15, b.headSize / 0.39)) : 1 };
  }
  function headSpecOf(spec, covers) {
    const h = spec.head || {}, p = spec.palette || {};
    const eyes = h.eyes || {}, brows = h.brows || {}, lips = h.lips || {};
    const hair = h.hair || {};
    const face = h.face || '';
    const jaw = typeof h.jaw === 'number' ? (h.jaw >= 0.66 ? 'square' : h.jaw >= 0.45 ? 'soft' : 'narrow') : (/square/.test(face) ? 'square' : /gaunt|triangle|angular/.test(face) ? 'narrow' : null);
    const nose = String(h.nose || 'straight');
    const beard = mapBeard(h.beard);
    return {
      skin: p.skin,
      hair: mapHair(hair.style || (typeof h.hair === 'string' ? h.hair : null), covers),
      hairColor: hair.color != null ? hair.color : p.hair,
      hoodColor: p.primaryDark != null ? p.primaryDark : p.primary,
      beard: beard ? { style: beard, color: (h.beard && h.beard.color) != null ? h.beard.color : (p.hairShade != null ? p.hairShade : p.hair) } : null,
      eyes: eyes.color != null ? eyes.color : (p.eyes != null ? p.eyes : p.eyesL),
      brow: brows.color != null ? brows.color : p.brows,
      browThick: brows.thick != null ? 0.0045 + 0.006 * brows.thick : null,
      lips: lips.color != null ? lips.color : p.lip,
      jaw,
      nose: /hook|aquil/.test(nose) ? 'aquiline' : /fine|small/.test(nose) ? 'small' : /broad|broken/.test(nose) ? 'broad' : 'straight',
      ears: h.ears || 'human',
      age: h.age,
      scar: h.scar, marks: h.marks, beardTex: h.beard || null, makeup: h.makeup,
      faceSpec: { seed: (spec.classId || '') + ':' + (spec.skinId || 'base'), shape: typeof h.face === 'string' ? h.face : undefined },
    };
  }
  function handsSpecOf(spec) {
    const hd = spec.hands || {}, p = spec.palette || {}, w = spec.weapon || {};
    const gl = String(hd.gloves || 'none');
    const glove = gl === 'none' || gl === 'fingerless' ? null : (gl === 'gauntlet' || gl === 'claw') ? (p.metal != null ? p.metal : 0xaab4c0) : (p.leatherDark != null ? p.leatherDark : p.leather != null ? p.leather : 0x4a3020);
    const pose = hd.pose || 'grip';
    const kind = w.kind || '';
    let poseR = pose, poseL = pose === 'cast' ? 'cast' : 'relaxed';
    if (w.hand === 'both' || w.offhand || kind === 'daggers') poseL = 'grip';
    if (kind === 'longbow' || kind === 'bow' || w.hand === 'L') { poseL = 'grip'; poseR = pose === 'grip' ? 'relaxed' : pose; }
    if (kind === 'none' || kind === 'ring') { poseR = pose === 'grip' ? 'cast' : pose; poseL = poseR; }
    // une main qui tient une arme est TOUJOURS refermée sur le manche (sinon : main ouverte à côté de l'arme)
    if (kind && kind !== 'none' && kind !== 'ring' && kind !== 'longbow' && kind !== 'bow' && w.hand !== 'L') poseR = 'grip';
    if (kind === 'longbow' || kind === 'bow') poseR = 'fist';
    return { skin: p.skin, glove, gloveLayer: gl === 'gauntlet' || gl === 'claw' ? 'metal' : 'leather', poseR, poseL };
  }

  // ------------------------------------------------------------------
  // Tenue de base minimale (si G.HeroOutfits absent ou en erreur)
  // ------------------------------------------------------------------
  function basicOutfit(R, spec) {
    const K = G.HeroKit, g = K.geo, P = R.P, p = spec.palette || {};
    const main = K.hexOf(p.primary, 0x445577), dark = K.shade(main, -0.35), lea = K.hexOf(p.leather, 0x5a3a22);
    const o = { uv: 1 };
    R.add('chest', 'cloth', g.chest, main, [0, 0.27, -0.005], [P.chestW * 1.07, 0.38, P.chestD * 1.1], null, o);
    R.add('spine', 'cloth', g.abdomen, main, [0, 0.25, 0], [P.waistW * 1.08, 0.31, P.waistD * 1.1], null, { blend: { to: 'chest', at: 0.2, range: 0.08, max: 0.6 } });
    R.add('hips', 'leather', g.cyl, lea, [0, 0.03, 0], [P.hipW * 1.02, 0.06, 0.13]);
    R.add('hips', 'cloth2', g.sph, dark, [0, -0.03, 0], [P.hipW * 1.06, 0.13, 0.13]);
    for (const [s] of [['L'], ['R']]) {
      R.limb('leg' + s, 'cloth2', g.thigh, dark, [0, 0.02, 0], [0, -P.thigh, 0.005], P.thighR * 1.08, P.thighR * 1.1, { blend: [{ to: 'hips', at: -0.01, range: 0.06, max: 0.55 }, { to: 'shin' + s, at: -P.thigh, range: -0.05, max: 0.55 }] });
      R.limb('shin' + s, 'leather', g.shin, lea, [0, 0.0, 0], [0, -P.shin + 0.02, 0], P.shinR * 1.3, P.shinR * 1.35, { blend: { to: 'leg' + s, at: 0, range: 0.04, max: 0.5 } });
      R.add('foot' + s, 'leather', g.foot, K.shade(lea, -0.2), [0, -0.022, 0.055], [0.06, 0.058, 0.13]);
      R.limb('arm' + s, 'cloth', g.upperArm, main, [0, -0.0, 0], [0, -P.upper * 0.6, 0], P.armR * 1.25, P.armR * 1.25);
    }
    R.removeTag('foot');
  }

  // ------------------------------------------------------------------
  // Arme de base (si G.HeroWeapons absent) : axe +Z de weaponR/weaponL
  // ------------------------------------------------------------------
  const WRIST_REST = { sword: -0.5, mace: -0.5, daggers: -0.25, staff: -1.45, scythe: -1.45, scepter: -1.2, longbow: 0, bow: 0, none: 0, ring: 0 };
  function basicWeapon(R, spec) {
    const K = G.HeroKit, g = K.geo, p = spec.palette || {}, w = spec.weapon || {};
    const kind = w.kind || 'sword';
    const steel = K.hexOf(p.blade, 0xdfe6ef), gold = K.hexOf(p.gold, 0xc9a23a), lea = K.hexOf(p.leatherDark != null ? p.leatherDark : p.leather, 0x4a2c18);
    const glowC = K.hexOf(p.glow != null ? p.glow : p.gem, 0x7fe3ff);
    const res = { weapon: { bone: 'weaponR', layer: 'blade' }, glowWeapons: { epee: [], dague: [], feu: [] } };
    const A = (b, L, geo, c, pos, s, r, o) => R.add(b, L, geo, c, pos, s, r, o);
    if (kind === 'sword') {
      A('weaponR', 'leather', g.cyl8, lea, [0, 0, -0.03], [0.022, 0.2, 0.022], [HPI, 0, 0]);
      A('weaponR', 'gold', g.sphLo, gold, [0, 0, -0.14], 0.035);
      A('weaponR', 'gold', g.box, gold, [0, 0, 0.08], [0.26, 0.04, 0.05]);
      A('weaponR', 'blade', g.box, steel, [0, 0, 0.52], [0.075, 0.022, 0.84]);
      A('weaponR', 'blade', g.cone4, steel, [0, 0, 0.99], [0.038, 0.12, 0.011], [HPI, 0, 0]);
      res.glowWeapons.epee.push(['weaponR', 'blade']);
    } else if (kind === 'mace') {
      A('weaponR', 'leather', g.cyl8, lea, [0, 0, 0.12], [0.022, 0.55, 0.022], [HPI, 0, 0]);
      A('weaponR', 'gold', g.sphLo, gold, [0, 0, -0.17], 0.032);
      A('weaponR', 'blade', g.sphMid, steel, [0, 0, 0.45], [0.09, 0.09, 0.11]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; A('weaponR', 'blade', g.box, steel, [Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.45], [0.03, 0.03, 0.16], [0, 0, a]); }
      res.glowWeapons.epee.push(['weaponR', 'blade']);
    } else if (kind === 'daggers') {
      for (const b of ['weaponR', 'weaponL']) {
        A(b, 'leather', g.cyl8, lea, [0, 0, -0.02], [0.018, 0.13, 0.018], [HPI, 0, 0]);
        A(b, 'metal', g.box, K.hexOf(p.metal, 0x9aa3ad), [0, 0, 0.055], [0.12, 0.025, 0.035]);
        A(b, 'blade', g.box, steel, [0, 0, 0.22], [0.045, 0.016, 0.3]);
        A(b, 'blade', g.cone4, steel, [0, 0, 0.4], [0.023, 0.08, 0.008], [HPI, 0, 0]);
        res.glowWeapons.dague.push([b, 'blade']);
      }
    } else if (kind === 'longbow' || kind === 'bow') {
      res.weapon = { bone: 'weaponL', layer: 'blade' };
      A('weaponL', 'blade', g.torus(0.035, 2.3, 18), K.hexOf(p.leather, 0x7a5230), [0, 0, -0.42], [0.72, 0.72, 0.72], [0, -HPI, -1.15]);
      A('weaponL', 'leather', g.cyl8, lea, [0, 0, 0], [0.026, 0.14, 0.026]);
      A('weaponL', 'glow', g.box, 0xf0f0e0, [0, 0, -0.12], [0.005, 1.28, 0.005], null, { outline: false });
      A('weaponR', 'leather', g.cyl8, 0x6b4226, [0, 0, 0.2], [0.009, 0.5, 0.009], [HPI, 0, 0]);
      A('weaponR', 'gem', g.octa, glowC, [0, 0, 0.46], [0.018, 0.018, 0.04]);
      res.glowWeapons.feu.push(['weaponR', 'gem']);
    } else if (kind === 'staff' || kind === 'scepter' || kind === 'scythe') {
      const len = kind === 'scepter' ? 0.75 : 1.5, z0 = kind === 'scepter' ? 0.2 : 0.25;
      A('weaponR', 'leather', g.cyl8, kind === 'scythe' ? 0x2a2038 : 0x6a4424, [0, 0, z0], [0.022, len, 0.022], [HPI, 0, 0]);
      A('weaponR', 'gold', g.torus(0.25, TAU, 10), gold, [0, 0, z0 + len / 2 - 0.04], 0.035);
      if (kind === 'scythe') {
        const tip = z0 + len / 2;
        const pts = [[0, 0.02, tip], [0, -0.12, tip + 0.1], [0, -0.3, tip + 0.13], [0, -0.48, tip + 0.06], [0, -0.6, tip - 0.08]];
        for (let i = 0; i < pts.length - 1; i++) R.seg('weaponR', 'blade', g.box, 0xd8ccff, pts[i], pts[i + 1], 0.018, 0.12 - i * 0.018);
        res.glowWeapons.feu.push(['weaponR', 'blade']);
      } else {
        A('weaponR', 'blade', g.ico, glowC, [0, 0, z0 + len / 2 + 0.08], [0.08, 0.08, 0.1]);
        res.glowWeapons.feu.push(['weaponR', 'blade', K.shade(glowC, -0.4), 0.55]);
      }
    } else {
      // pas d'arme (anneaux / mains nues) : petite gemme focalisatrice dans la main
      A('weaponR', 'blade', g.octa, glowC, [0, -0.02, 0.06], [0.03, 0.04, 0.03]);
      res.glowWeapons.feu.push(['weaponR', 'blade', K.shade(glowC, -0.4), 0.55]);
    }
    return res;
  }

  // forme « Souverain des Ombres » du Nécromancien (os rigide masquable)
  function sovereign(R, spec) {
    const K = G.HeroKit, g = K.geo, p = spec.palette || {};
    const vi = K.hexOf(p.glow != null ? p.glow : p.accent, 0xb56bff), dark = 0x1b1030;
    R.bone('sov', 'chest', 0, 0, 0, { rigid: true });
    const top = R.P.neckY + R.P.headY + 0.42 * R.P.headS;
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; R.add('sov', 'glow', g.cone, 0xd9b8ff, [Math.cos(a) * 0.15, top + (k % 2) * 0.05, Math.sin(a) * 0.15], [0.03, 0.15 + (k % 2) * 0.06, 0.03], null, { outline: false }); }
    R.add('sov', 'glow', g.torus(0.06), vi, [0, top - 0.06, 0], [0.16, 0.16, 0.16], [HPI, 0, 0], { outline: false });
    for (const sx of [1, -1]) for (let k = 0; k < 3; k++) R.add('sov', 'cloth2', g.cone, dark, [sx * (0.35 + k * 0.22), 0.15 + k * 0.08, -0.3], [0.06, 0.6 - k * 0.1, 0.04], [0.5, 0, -sx * (1.15 + k * 0.2)]);
  }

  // ------------------------------------------------------------------
  // Peau sous les vêtements : d'après les pièces de tenue réellement posées sur chaque os
  // ------------------------------------------------------------------
  const BARE = { skin: 1, hair: 1, eye: 1, eyeWhite: 1, lip: 1, face: 1, glow: 1, trans: 1 };
  function coverSkin(R, from) {
    const has = {};
    for (let i = from; i < R.pieces.length; i++) { const p = R.pieces[i]; if (!BARE[p.layer]) has[p.bone] = (has[p.bone] || 0) + 1; }
    // torse / bassin / cuisses : vêtements fermés → peau retirée ; bras / tibias : brassards et bottes partiels → peau rentrée
    if ((has.chest || 0) + (has.spine || 0) >= 2) R.cover('torso', 0); else if (has.chest || has.spine) R.cover('torso', 0.9);
    if ((has.hips || 0) >= 2) R.cover('pelvis', 0); else if (has.hips) R.cover('pelvis', 0.92);
    if ((has.legL || 0) >= 2 && (has.legR || 0) >= 2) R.cover('thigh', 0); else if (has.legL || has.legR) R.cover('thigh', 0.92);
    if (has.armL || has.armR) R.cover('upperArm', 0.9);
    if (has.forearmL || has.forearmR) R.cover('forearm', 0.92);
    if (has.shinL || has.shinR) R.cover('shin', 0.9);
    if ((has.footL || 0) + (has.footR || 0) >= 2) R.hide('foot');
    return has;
  }

  // ------------------------------------------------------------------
  // Construction
  // ------------------------------------------------------------------
  function step(name, fn) { try { return fn(); } catch (e) { warn(name, e); return undefined; } }

  function buildV6(id, opts) {
    const K = G.HeroKit;
    let spec = null;
    if (G.HeroDefs && typeof G.HeroDefs.resolve === 'function') spec = step('HeroDefs.resolve', () => G.HeroDefs.resolve(id, opts));
    if (!spec || typeof spec !== 'object') spec = defaultSpec(id, opts);
    spec.classId = id;
    if (!spec.palette) spec.palette = defaultSpec(id, opts).palette;
    const bodySpec = bodySpecOf(spec);
    const R = K.rig({ classId: id, body: bodySpec, spec });
    R.spec = spec;
    K.body(R, bodySpec);
    const covers = (G.HeroOutfits && typeof G.HeroOutfits.covers === 'function') ? step('HeroOutfits.covers', () => G.HeroOutfits.covers(spec)) : null;
    K.head(R, headSpecOf(spec, covers));
    K.hands(R, handsSpecOf(spec));
    // tenue
    const nBody = R.pieces.length;
    let outfitOk = false;
    if (G.HeroOutfits && typeof G.HeroOutfits.build === 'function') outfitOk = step('HeroOutfits.build', () => G.HeroOutfits.build(R, spec)) != null;
    if (!outfitOk) step('basicOutfit', () => basicOutfit(R, spec));
    step('coverSkin', () => coverSkin(R, nBody));
    // arme
    let wres = null;
    if (G.HeroWeapons && typeof G.HeroWeapons.build === 'function') wres = step('HeroWeapons.build', () => G.HeroWeapons.build(R, spec));
    if (!wres || !wres.weapon) {
      const hadW = R.pieces.some(p => p.bone === 'weaponR' || p.bone === 'weaponL');
      wres = hadW ? Object.assign({ weapon: { bone: 'weaponR', layer: 'blade' }, glowWeapons: { epee: [], dague: [], feu: [] } }, wres || {}) : step('basicWeapon', () => basicWeapon(R, spec));
    }
    const kind = (spec.weapon && spec.weapon.kind) || 'sword';
    if (WRIST_REST[kind] != null && !(wres && wres.wristRest != null)) R.bones.wristR.rotation.x = WRIST_REST[kind];
    else if (wres && wres.wristRest != null) R.bones.wristR.rotation.x = wres.wristRest;
    if (kind === 'longbow' || kind === 'bow') R.bones.wristL.rotation.x = -0.45;
    else if (kind === 'daggers') R.bones.wristL.rotation.x = -0.25;
    if (wres && wres.wristRestL != null) R.bones.wristL.rotation.x = wres.wristRestL;
    if (id === 'Necromancien') step('sovereign', () => sovereign(R, spec));
    // échelle : hauteur du crâne demandée par la spec
    const target = num(spec.body && spec.body.height, 0) || (num(spec.height, 0) ? spec.height - 0.04 : 0);
    const scale = target > 1.5 && target < 3 ? target / R.P.H : 1;
    const root = R.finish({
      height: num(spec.height, R.P.H * scale + 0.04) / scale, radius: 0.5, scale, spec,
      weapon: wres.weapon, glowWeapons: wres.glowWeapons || {},
      bladeEmissive: wres.bladeEmissive,
    });
    const ud = root.userData;
    ud.heroId = id;
    if (R.bones.sov) { R.bones.sov.visible = false; ud.sovereign = R.bones.sov; ud.auraColor = 0x7a35e0; }
    if (G.HeroVFX && typeof G.HeroVFX.attach === 'function') step('HeroVFX.attach', () => G.HeroVFX.attach(root, spec));
    if (G.HeroRender && typeof G.HeroRender.prepare === 'function') step('HeroRender.prepare', () => G.HeroRender.prepare(root, spec));
    if (G.HeroAnim && typeof G.HeroAnim.init === 'function') step('HeroAnim.init', () => G.HeroAnim.init(root, spec));
    // maillages déformés (skinning) : leur sphère englobante reste celle de la pose de liaison ;
    // sans ça, three.js peut les « couper » (disparition partielle du corps) quand le héros bouge ou s'anime
    root.traverse(o => { if (o.isSkinnedMesh || o.isMesh) o.frustumCulled = false; });
    return root;
  }

  // ------------------------------------------------------------------
  // Repli sur l'ancien modèle
  // ------------------------------------------------------------------
  function legacy(id, opts) {
    // 1) builder exposé par class-models.js (si le coordinateur l'expose : G.ClassModels.builders[id])
    const CM = G.ClassModels;
    const b = CM && (CM.builders || CM.build);
    if (b && typeof b[id] === 'function') {
      const root = b[id](opts || {});
      if (root && root.userData) root.userData.heroId = id;
      return root;
    }
    // 2) makeHero de graphics.js : on retire temporairement l'enregistrement v6
    const mine = REG[id];
    try {
      G.GFX.registerModel('hero', id, undefined);
      return G.GFX.makeHero(id, opts);
    } finally {
      G.GFX.registerModel('hero', id, mine);
    }
  }

  const REG = {};
  for (const id of CLASSES) {
    REG[id] = function (opts) {
      opts = opts || {};
      if (!off() && G.HeroKit) {
        try { return buildV6(id, opts); } catch (e) { warn('build ' + id + ' → ancien modèle', e); }
      }
      return legacy(id, opts);
    };
    G.GFX.registerModel('hero', id, REG[id]);
  }
  G.Heroes6 = { classes: CLASSES.slice(), build: buildV6, legacy, defaultSpec, mapHair, mapBeard, headSpecOf, bodySpecOf, handsSpecOf };
})();
