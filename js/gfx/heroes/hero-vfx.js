window.G = window.G || {};
/* =====================================================================
 *  hero-vfx.js — v6 « Incarnation » — A6 VFX Artist : G.HeroVFX
 *
 *  G.HeroVFX.attach(root, spec)  -> état (aussi dans root.userData.vfx6) ; effets permanents
 *     selon la rareté du skin (spec.rarity) + thème de classe/skin (spec.fx, CLASS_FX, SKIN_FX).
 *       commun     : rien de visible (traînée d'arme seulement si palier d'arme >= 4)
 *       rare       : liseré lumineux discret (coquilles « fresnel » sur torse / bassin / tête)
 *       épique     : + motifs émissifs animés (runes ou veines, ondes qui montent)
 *       légendaire : + aura de particules (monde), émissif pulsé, traînée d'arme
 *       mythique   : + éléments en orbite, halo/couronne, cape d'énergie, lumière propre, particules
 *  G.HeroVFX.update(root, time?, camera?)  facultatif (tests / raster / aperçu sans rendu WebGL).
 *  G.HeroVFX.trail(root, on, dur)          déclenche la traînée (A5 peut l'appeler sur 'attack').
 *  G.HeroVFX.info(root)                    { drawCalls, maxDrawCalls, particles, parts:[...] }
 *  G.HeroVFX.settings                      { enabled, quality (0..1), light }
 *
 *  ANIMATION (choix documenté) : tout est animé dans onBeforeRender de MES meshes (fonction
 *  partagée ON_BR, garde « une fois par image » par héros). Rien à appeler par HeroAnim ; marche aussi
 *  dans l'aperçu cosmétique (qui ne fait que tourner le héros). Les meshes « monde » (particules,
 *  traînée) remettent leur matrixWorld à l'identité dans onBeforeRender (avant le calcul de
 *  modelViewMatrix par le renderer r128) et ont frustumCulled = false.
 *  TRAÎNÉE : activée par G.bus 'skillCast' (héros joueur = G.game.run.player.hero), par
 *  ud.animState/ud.anim6 .attack > 0.05 si HeroAnim le publie, ou par G.HeroVFX.trail().
 *
 *  BUDGET : <= 6 draw calls (compte vérifié à l'attache), <= 200 particules (120 max), 0 allocation
 *  par image (tampons Float32Array pré-alloués, temporaires de module).
 *  LIBÉRATION : matériaux, textures et géométries de halo mis en cache => userData.shared = true.
 *  Géométries par instance (coquilles, particules, orbite, cape, traînée) NON partagées => libérées
 *  par game.js avec le héros. Aucun matériau n'a d'emissive => game.prepareFlash les ignore.
 *  Compatibilité setHeroWeaponLevel : on ne touche ni ud.glow ni ses auras ; la traînée prend la
 *  couleur du palier (4 bleu, 7 violet, 10 or) et s'active même en skin commun dès le palier 4.
 * ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const settings = { enabled: true, quality: 1, light: true, clock: null };
  const NOOP = { attach() { return null; }, update() {}, trail() {}, info() { return null; }, settings };
  if (typeof THREE === 'undefined') { G.HeroVFX = NOOP; return; }
  const T = THREE;
  const TAU = Math.PI * 2;
  const MAX_DC = 6, MAX_PART = 200;

  // ------------------------------------------------------------------
  //  Raretés & couleurs
  // ------------------------------------------------------------------
  function rarityRank(r) {
    if (typeof r === 'number') return Math.max(0, Math.min(4, r | 0));
    const s = String(r || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (s.indexOf('myth') === 0 || s === 'secret') return 4;
    if (s.indexOf('legend') === 0) return 3;
    if (s.indexOf('epi') === 0) return 2;
    if (s === 'rare') return 1;
    return 0;
  }
  function hexOf(v, d) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') { const m = /^#?([0-9a-f]{6})$/i.exec(v.trim()); if (m) return parseInt(m[1], 16); }
    if (v && v.isColor) return v.getHex();
    return d;
  }
  const rgb = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  // éclaircit une couleur sombre pour qu'elle reste lisible en additif
  function vivid(h) {
    const c = rgb(h), m = Math.max(c[0], c[1], c[2]);
    if (m < 0.001) return 0x9a7bff;
    const k = m < 0.75 ? 0.75 / m : 1;
    return (Math.min(255, Math.round(c[0] * k * 255)) << 16) | (Math.min(255, Math.round(c[1] * k * 255)) << 8) | Math.min(255, Math.round(c[2] * k * 255));
  }
  const GLOW_TIERS = [0, 0x3fa9ff, 0xb44dff, 0xffc633];   // identiques à graphics.js setHeroWeaponLevel

  // ------------------------------------------------------------------
  //  Thèmes : par classe, puis par skin (ids de cosmetics.js), puis spec.fx (A1) qui prime
  //  part : type de particules ; orbit : éléments en orbite ; halo : halo/couronne ; pat : motif de coquille
  // ------------------------------------------------------------------
  const CLASS_FX = {
    Guerrier:      { c1: 0xffa040, c2: 0xffe0a0, part: 'embers', orbit: 'blades',   halo: 'crown',    pat: 'runes' },
    Mage:          { c1: 0x9a6bff, c2: 0x5ad8ff, part: 'arcane', orbit: 'runes',    halo: 'glyph',    pat: 'runes' },
    Voleur:        { c1: 0x3fe0b0, c2: 0xffd24a, part: 'glint',  orbit: 'daggers',  halo: 'circlet',  pat: 'veins' },
    Assassin:      { c1: 0xa04bff, c2: 0xff3d6e, part: 'smoke',  orbit: 'shards',   halo: 'crescent', pat: 'veins' },
    Archer:        { c1: 0x7dffb0, c2: 0xfff3b0, part: 'leaves', orbit: 'feathers', halo: 'laurel',   pat: 'veins' },
    Paladin:       { c1: 0xffd95a, c2: 0xffffff, part: 'holy',   orbit: 'feathers', halo: 'halo',     pat: 'runes' },
    Elementaliste: { c1: 0x8fdcff, c2: 0xfff04a, part: 'frost',  orbit: 'crystals', halo: 'circlet',  pat: 'runes' },
    Necromancien:  { c1: 0x7dff9a, c2: 0xb44dff, part: 'souls',  orbit: 'souls',    halo: 'thorns',   pat: 'veins' },
  };
  // skins épiques / légendaires / mythiques (ids courts de SKIN_TABLE). Les rares prennent la couleur du skin.
  const SKIN_FX = {
    Guerrier: { ebene: { c1: 0x9fb4ff, c2: 0xe9eef7 }, aurore: { c1: 0x66d9ff, c2: 0xffffff, part: 'frost' },
      dore: { c1: 0xffc94a, c2: 0xfff1c2, part: 'embers', halo: 'crown', legHalo: true },
      souverain: { c1: 0xff3d6e, c2: 0xfff4ff, part: 'holy', orbit: 'blades', halo: 'crown' } },
    Mage: { sylve: { c1: 0x39e08c, c2: 0xb8ffd9, pat: 'veins' }, cendres: { c1: 0xff7a3d, c2: 0xffd08a, part: 'embers' },
      astral: { c1: 0xfff2a8, c2: 0x8fa8ff, part: 'stars' },
      archimage: { c1: 0xb44dff, c2: 0xffffff, part: 'arcane', orbit: 'runes', halo: 'glyph' } },
    Voleur: { poison: { c1: 0x39e08c, c2: 0xc77dff }, ombre: { c1: 0xdfe6ff, c2: 0x8fa8ff, part: 'smoke' },
      jade: { c1: 0xffd24a, c2: 0x3fe0b0, part: 'glint', halo: 'crown', legHalo: true },
      spectre: { c1: 0x00ffd0, c2: 0xe6f0ff, part: 'souls', orbit: 'daggers', halo: 'circlet' } },
    Assassin: { jade: { c1: 0x39e08c, c2: 0xb8ffd9 }, foudre: { c1: 0xffe14d, c2: 0x9b7bff, part: 'storm' },
      neige: { c1: 0x46d4ff, c2: 0xffffff, part: 'frost' },
      neant: { c1: 0xb44dff, c2: 0xff3dff, part: 'smoke', orbit: 'shards', halo: 'crescent' } },
    Archer: { nuit: { c1: 0x8fb4ff, c2: 0xe6ecf7 }, braise: { c1: 0xffcf40, c2: 0xff7a1a, part: 'embers' },
      emeraude: { c1: 0x7dffb0, c2: 0xfff3b0, part: 'leaves', halo: 'laurel', legHalo: true },
      argent: { c1: 0x00ffd0, c2: 0xff3d6e, part: 'glint', orbit: 'feathers', halo: 'laurel' } },
    Paladin: { ecarlate: { c1: 0xff5a4a, c2: 0xfff1c2 }, aube: { c1: 0xfff7d6, c2: 0xffd95a },
      obsidienne: { c1: 0xff7a3d, c2: 0xff3d6e, part: 'embers', pat: 'veins' },
      seraphin: { c1: 0xffd700, c2: 0xffffff, part: 'holy', orbit: 'feathers', halo: 'halo' } },
    Elementaliste: { tempete: { c1: 0xffe14d, c2: 0x9b7bff, part: 'storm' }, glacier: { c1: 0xbfefff, c2: 0xffffff, part: 'frost' },
      prisme: { c1: 0xff7ad9, c2: 0x00ffd0, part: 'prism' },
      cataclysme: { c1: 0xff3d6e, c2: 0xffb02e, part: 'embers', orbit: 'crystals', halo: 'thorns', pat: 'veins' } },
    Necromancien: { glace: { c1: 0x46d4ff, c2: 0xd9f6ff }, or: { c1: 0xffc94a, c2: 0x7dff9a, part: 'souls' },
      roi: { c1: 0xf2f0ff, c2: 0x9fd8ff, part: 'souls', orbit: 'souls', halo: 'thorns' } },
  };
  // élément (spec.fx.element) -> particules / couleurs par défaut
  const ELEMENT_FX = {
    feu: { part: 'embers', c1: 0xff7a1a, c2: 0xffe08a }, glace: { part: 'frost', c1: 0x8fdcff, c2: 0xffffff },
    foudre: { part: 'storm', c1: 0xfff04a, c2: 0x9b7bff }, ombre: { part: 'smoke', c1: 0x8a35e0, c2: 0xc07bff },
    sacre: { part: 'holy', c1: 0xffd95a, c2: 0xffffff }, poison: { part: 'souls', c1: 0x5ee03a, c2: 0xc8ff7a },
    arcane: { part: 'arcane', c1: 0x9a6bff, c2: 0x5ad8ff }, nature: { part: 'leaves', c1: 0x7dffb0, c2: 0xfff3b0 },
  };
  const ORBITS = ['runes', 'crystals', 'souls', 'feathers', 'shards', 'blades', 'daggers'];
  const HALOS = ['halo', 'crown', 'glyph', 'circlet', 'crescent', 'laurel', 'thorns', 'none'];
  // correspondances des types d'A1 (hero-defs.js) vers mes effets
  const GENERIC = { sparks: 1, motes: 1, crown: 1 };
  const MAP_PART = { 'gold-sparks': 'embers', 'embers-wave': 'embers', 'soft-light': 'holy', 'gold-dust': 'holy', fireflies: 'glint', stardust: 'stars',
    coins: 'glint', mist: 'smoke', snow: 'frost', breath: 'frost', lightning: 'storm', arcs: 'storm', 'petals-light': 'leaves', 'gold-leaves': 'leaves', drips: 'souls', motes: 'holy', sparks: 'embers' };
  const MAP_HALO = { 'crown-light': 'crown', 'halo-crown': 'halo', 'rock-crown': 'thorns', 'bone-crown-light': 'thorns', 'void-ring': 'crescent', 'rune-rings': 'glyph', mist: 'circlet', sigil: 'glyph' };
  const CROWNISH = { crown: 1, thorns: 1, laurel: 1, circlet: 1 };
  const MAP_ORBIT = { 'shield-fragment': 'blades', 'spectral-blade': 'blades', 'void-shard': 'shards', 'light-feather': 'feathers', 'floating-skull': 'souls',
    'grimoire-orbit': 'runes', 'rock-crown': 'crystals', 'twin-crystal-ice': 'crystals', 'twin-crystal-storm': 'crystals' };
  const MAP_PAT = { runes: 'runes', 'runes-edge': 'runes', 'rune-rings': 'runes', sigil: 'runes', veins: 'veins', cracks: 'veins', 'frost-creep': 'veins', lines: 'veins', line: 'veins', arcs: 'veins', lightning: 'veins' };

  function shortSkin(id) { if (id == null) return ''; const s = String(id); const i = s.lastIndexOf(':'); return i >= 0 ? s.slice(i + 1) : s; }
  function catalogSkin(classId, sid) {
    try {
      const list = G.Cosmetics && G.Cosmetics.CATALOG && G.Cosmetics.CATALOG.skins && G.Cosmetics.CATALOG.skins[classId];
      if (list) for (const s of list) if (shortSkin(s.id) === sid) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function pickStr(v, list) { return typeof v === 'string' && list.indexOf(v) >= 0 ? v : null; }

  function themeFor(classId, spec, rank) {
    const t = Object.assign({}, CLASS_FX[classId] || CLASS_FX.Guerrier);
    const sid = shortSkin(spec.skinId || (spec.skin && spec.skin.id));
    const sk = (SKIN_FX[classId] || {})[sid];
    if (sk) Object.assign(t, sk);
    else if (rank >= 1) {           // skin sans entrée dédiée : couleur d'accent du skin (cosmetics) ou palette
      const cs = catalogSkin(classId, sid), pal = spec.palette || {};
      const a = hexOf(pal.glow, null) ?? hexOf(pal.accent, null) ?? (cs && (cs.accent != null ? cs.accent : cs.color));
      if (a != null) t.c1 = vivid(a);
      const b = hexOf(pal.trim, null) ?? (cs && cs.hair);
      if (b != null) t.c2 = vivid(b);
    }
    const fx = spec.fx || {};
    const el = ELEMENT_FX[fx.element];
    if (el) Object.assign(t, el);
    const c1 = hexOf(fx.color, null) ?? hexOf(fx.c1, null) ?? hexOf(fx.primary, null);
    const c2 = hexOf(fx.color2, null) ?? hexOf(fx.c2, null) ?? hexOf(fx.secondary, null);
    if (c1 != null) t.c1 = vivid(c1);
    if (c2 != null) t.c2 = vivid(c2);
    // schéma A1 (hero-defs.js) : les valeurs génériques de RARITY_FX (sparks / motes / crown) = « pas de préférence »
    const pt = fx.particles && typeof fx.particles === 'object' ? fx.particles.type : fx.particles;
    if (typeof pt === 'string' && !GENERIC[pt]) { const k = PK[pt] ? pt : MAP_PART[pt]; if (k) t.part = k; }
    if (fx.particles && typeof fx.particles === 'object') {
      if (hexOf(fx.particles.color, null) != null) t.pc = vivid(hexOf(fx.particles.color));
      if (fx.particles.count > 0) t.pcount = Math.min(120, fx.particles.count | 0);
    }
    const ht = fx.halo && typeof fx.halo === 'object' ? fx.halo.type : fx.halo;
    if (typeof ht === 'string' && !GENERIC[ht]) { const k = HALOS.indexOf(ht) >= 0 ? ht : MAP_HALO[ht]; if (k) t.halo = k; }
    if (fx.halo && typeof fx.halo === 'object' && hexOf(fx.halo.color, null) != null) t.hc = vivid(hexOf(fx.halo.color));
    if (Array.isArray(fx.floating)) for (const f of fx.floating) { if (MAP_ORBIT[f]) { t.orbit = MAP_ORBIT[f]; break; } }
    else if (typeof fx.orbit === 'string' && ORBITS.indexOf(fx.orbit) >= 0) t.orbit = fx.orbit;
    const pat = fx.pattern && typeof fx.pattern === 'object' ? fx.pattern.type : fx.pattern;
    if (typeof pat === 'string' && MAP_PAT[pat]) t.pat = MAP_PAT[pat];
    if (fx.pattern && typeof fx.pattern === 'object' && hexOf(fx.pattern.color, null) != null) t.patc = vivid(hexOf(fx.pattern.color));
    if (hexOf(fx.rimColor, null) != null) t.rimc = vivid(hexOf(fx.rimColor));
    if (fx.rim === false) t.noRim = true;
    if (fx.energyCape === false || fx.cape === false) t.noCape = true;
    if (fx.energyCape && typeof fx.energyCape === 'object') { t.cc1 = hexOf(fx.energyCape.color, null); t.cc2 = hexOf(fx.energyCape.color2, null); }
    if (fx.light === false) t.noLight = true;
    const L = fx.light && typeof fx.light === 'object' ? fx.light : null;
    t.light = vivid(hexOf(L ? L.color : fx.light, null) ?? t.c1);
    t.lightI = L && L.intensity > 0 ? Math.min(1.4, L.intensity) : 0.9;
    t.lightD = L && L.distance > 0 ? Math.min(6, L.distance) : 4.2;
    if (fx.trail && typeof fx.trail === 'object' && hexOf(fx.trail.color, null) != null) t.tc = vivid(hexOf(fx.trail.color));
    return t;
  }

  // ------------------------------------------------------------------
  //  Textures procédurales (DataTexture, aucune dépendance canvas), partagées
  // ------------------------------------------------------------------
  const TEX = {};
  function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function mkTex(w, h, fn, repeat) {
    const d = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(1, fn(x, y)));
      const i = (y * w + x) * 4, b = Math.round(v * 255);
      d[i] = d[i + 1] = d[i + 2] = b; d[i + 3] = b;
    }
    const t = new T.DataTexture(d, w, h, T.RGBAFormat);
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearFilter; t.generateMipmaps = false;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.needsUpdate = true;
    t.userData = t.userData || {}; t.userData.shared = true;
    return t;
  }
  const segD = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6;
    let k = ((px - ax) * dx + (py - ay) * dy) / l2; k = k < 0 ? 0 : k > 1 ? 1 : k;
    const ex = px - ax - k * dx, ey = py - ay - k * dy; return Math.sqrt(ex * ex + ey * ey);
  };
  // glyphes (segments dans [-1,1]) : runes originales, géométriques
  const GLYPHS = [
    [[0, -0.8, 0, 0.8], [0, 0.8, 0.5, 0.35], [0, 0.1, -0.5, -0.3]],
    [[-0.5, -0.8, -0.5, 0.8], [0.5, -0.8, 0.5, 0.8], [-0.5, 0.2, 0.5, -0.2]],
    [[0, -0.8, 0, 0.8], [-0.55, 0.45, 0.55, 0.45], [-0.4, -0.5, 0.4, -0.1]],
    [[-0.5, 0.8, 0.5, 0], [0.5, 0, -0.5, -0.8], [-0.5, 0.8, -0.5, -0.8]],
    [[0, 0.8, 0.6, 0], [0.6, 0, 0, -0.8], [0, -0.8, -0.6, 0], [-0.6, 0, 0, 0.8]],
    [[-0.6, -0.8, 0, 0.8], [0, 0.8, 0.6, -0.8], [-0.3, 0, 0.3, 0]],
    [[0, -0.8, 0, 0.8], [-0.5, 0.8, 0.5, 0.8], [-0.5, -0.8, 0.5, -0.8], [0, 0, 0.5, 0.4]],
    [[-0.6, 0.6, 0.6, -0.6], [-0.6, -0.6, 0.6, 0.6], [0, 0.85, 0, -0.85]],
  ];
  function glyphV(g, x, y, w) {
    let d = 9; for (const s of GLYPHS[g]) d = Math.min(d, segD(x, y, s[0], s[1], s[2], s[3]));
    return Math.exp(-(d * d) / (w * w));
  }
  // Atlas 256x128 (8 cases de 64) : 0 point doux, 1 étincelle, 2 fumée, 3 rune, 4 plume, 5 flamme, 6 feuille, 7 plein
  const CELL = { dot: 0, star: 1, smoke: 2, rune: 3, feather: 4, flame: 5, leaf: 6, solid: 7 };
  function atlas() {
    if (TEX.atlas) return TEX.atlas;
    const rnd = lcg(7), nz = new Float32Array(16 * 16); for (let i = 0; i < nz.length; i++) nz[i] = rnd();
    const noise = (x, y) => { // bruit de valeur 16x16 bouclé
      const fx = (x * 4 + 8) % 16, fy = (y * 4 + 8) % 16, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const a = nz[iy * 16 + ix], b = nz[iy * 16 + (ix + 1) % 16], c = nz[((iy + 1) % 16) * 16 + ix], d = nz[((iy + 1) % 16) * 16 + (ix + 1) % 16];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
    const F = [
      (x, y) => Math.exp(-(x * x + y * y) * 4.2),
      (x, y) => Math.min(1, Math.max(Math.exp(-Math.abs(x) * 14) * Math.exp(-y * y * 2.5), Math.exp(-Math.abs(y) * 14) * Math.exp(-x * x * 2.5)) + Math.exp(-(x * x + y * y) * 16)),
      (x, y) => { const r = Math.sqrt(x * x + y * y); return Math.max(0, 1 - r) ** 1.6 * (0.45 + 0.55 * noise(x * 1.3, y * 1.3)) * 1.25; },
      (x, y) => { const r = Math.sqrt(x * x + y * y); return Math.max(glyphV(6, x * 1.6, y * 1.6, 0.13), Math.exp(-((r - 0.86) ** 2) / 0.004) * 0.9) * (r < 0.98 ? 1 : 0); },
      (x, y) => { const ax = Math.abs(x), ty = (y + 1) / 2, wv = 0.42 * Math.sin(Math.PI * Math.min(1, ty * 1.05)); const vane = ax < wv ? (0.55 + 0.45 * Math.abs(Math.sin(y * 18 + ax * 6))) * (1 - ax / (wv + 1e-3)) ** 0.4 : 0; return Math.max(vane * 0.8, Math.exp(-x * x * 900) * (ty > 0.02 ? 1 : 0)); },
      (x, y) => { const yy = (y + 0.35) * 0.9, w = 0.55 * Math.max(0, 1 - Math.abs(yy)) * (yy < 0 ? Math.sqrt(1 + yy) : 1 - yy * 0.6); return Math.max(0, 1 - Math.abs(x) / (w + 1e-3)) ** 1.2 * (y < 0.9 ? 1 : 0) * Math.exp(-(y + 0.3) * (y + 0.3) * 0.8); },
      (x, y) => { const w = 0.48 * Math.max(0, 1 - y * y); const ax = Math.abs(x); return ax < w ? (0.75 + 0.25 * (1 - Math.exp(-ax * ax * 300))) * Math.min(1, (w - ax) * 12) : 0; },
      () => 1,
    ];
    TEX.atlas = mkTex(256, 128, (px, py) => {
      const c = (px >> 6) + 4 * (py >> 6); const lx = (px & 63) + 0.5, ly = (py & 63) + 0.5;
      const x = lx / 32 - 1, y = ly / 32 - 1;
      const edge = Math.min(lx, 64 - lx, ly, 64 - ly) < 1.5 ? 0 : 1;   // pas de fuite entre cases
      return F[c](x, y) * edge;
    });
    return TEX.atlas;
  }
  function cellUV(c) { return [(c & 3) / 4, (c >> 2) / 2]; }   // coin bas-gauche, taille 1/4 x 1/2
  // motif de coquille (128², bouclé) : fond 0.3 (= « remplissage » pulsé) + traits 1.0
  function patTex(kind) {
    if (TEX[kind]) return TEX[kind];
    const W = 128;
    if (kind === 'runes') {
      const rnd = lcg(31), pick = []; for (let i = 0; i < 16; i++) pick.push((rnd() * GLYPHS.length) | 0);
      TEX.runes = mkTex(W, W, (px, py) => {
        const cx = px >> 5, cy = py >> 5, x = ((px & 31) + 0.5) / 16 - 1, y = ((py & 31) + 0.5) / 16 - 1;
        const g = pick[cy * 4 + cx];
        const lit = (cx + cy) & 1 ? 1 : 0.55;                 // alternance pour éviter la grille trop régulière
        return 0.3 + 0.7 * lit * glyphV(g, x * 1.25, y * 1.25, 0.12);
      }, true);
    } else if (kind === 'veins') {
      const rnd = lcg(53), P = []; for (let i = 0; i < 14; i++) P.push([rnd() * W, rnd() * W]);
      TEX.veins = mkTex(W, W, (px, py) => {
        let d1 = 1e9, d2 = 1e9;
        for (const p of P) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const dx = px - p[0] - ox * W, dy = py - p[1] - oy * W, d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        const e = d2 - d1;
        return 0.3 + 0.7 * Math.exp(-e * e / 5);
      }, true);
    } else { // flow : stries verticales pour la cape d'énergie
      TEX.flow = mkTex(64, 64, (px, py) => {
        const u = px / 64 * TAU, v = py / 64 * TAU;
        const s = 0.5 + 0.25 * Math.sin(u * 3 + Math.sin(v) * 1.5) + 0.25 * Math.sin(u * 7 - v * 2 + 1.3);
        return 0.35 + 0.65 * s * s;
      }, true);
    }
    return TEX[kind];
  }

  // ------------------------------------------------------------------
  //  Matériaux partagés (MeshBasicMaterial additifs, sans emissive)
  // ------------------------------------------------------------------
  const MATS = {};
  function mat(key, o) {
    if (MATS[key]) return MATS[key];
    const m = new T.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: o.opacity != null ? o.opacity : 1,
      blending: T.AdditiveBlending, depthWrite: false, side: o.side != null ? o.side : T.FrontSide,
      map: o.map || null, fog: false, toneMapped: false,
    });
    m.userData.shared = true; m.userData.vfx = true;
    return (MATS[key] = m);
  }

  // ------------------------------------------------------------------
  //  Temporaires de module (aucune allocation par image)
  // ------------------------------------------------------------------
  const _m4 = new T.Matrix4(), _v = new T.Vector3(), _v2 = new T.Vector3();
  // settings.clock (facultatif) : horloge de test (raster/banc) pour des rendus déterministes
  const nowSec = () => settings.clock ? +settings.clock() : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
  const rr = (a, b) => a + Math.random() * (b - a);

  function bufGeo(nv, ni, withUV) {
    const g = new T.BufferGeometry();
    const pos = new T.BufferAttribute(new Float32Array(nv * 3), 3), col = new T.BufferAttribute(new Float32Array(nv * 3), 3);
    if (pos.setUsage && T.DynamicDrawUsage) { pos.setUsage(T.DynamicDrawUsage); col.setUsage(T.DynamicDrawUsage); }
    g.setAttribute('position', pos); g.setAttribute('color', col);
    if (withUV) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(nv * 2), 2));
    if (ni) g.setIndex(new T.BufferAttribute(nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), 1));
    return g;
  }
  function vfxMesh(geo, material, st, world) {
    const m = new T.Mesh(geo, material);
    m.castShadow = false; m.receiveShadow = false;
    m.userData.vfx = true; m.userData.vfxState = st; m.userData.noFlash = true; m.userData.lod = 'keep';
    if (world) { m.userData.world = true; m.frustumCulled = false; m.matrixAutoUpdate = false; }
    m.renderOrder = 4;
    m.onBeforeRender = ON_BR;
    return m;
  }
  // onBeforeRender partagé (pas de fermeture par mesh)
  function ON_BR(renderer, scene, camera) {
    const st = this.userData.vfxState;
    if (this.userData.world) this.matrixWorld.identity();
    if (st && !st.dead) { try { tick(st, nowSec(), camera); } catch (e) { st.dead = true; if (typeof console !== 'undefined') console.warn('[HeroVFX]', e); } }
  }

  // ------------------------------------------------------------------
  //  Sélection des os / meshes du héros (rig v6 ou ancien)
  // ------------------------------------------------------------------
  function bone(ud, root, names) {
    const P = ud.parts || {};
    for (const n of names) { if (P[n]) return P[n]; const o = root.getObjectByName && root.getObjectByName(n); if (o) return o; }
    return null;
  }
  const SKIP_LAYER = /^(eye|eyeWhite|eyes|glow|aura|trans|blade|g_|lip|gem)/;
  const BONE_PRI = { chest: 3, body: 3, spine: 2.4, hips: 2, head: 1.5 };
  // héros v6 (hero-kit) : une SkinnedMesh par couche pour tout le corps -> on prend les plus grosses couches
  const SKIN_PREF = { cloth: 1.3, metal: 1.3, leather: 1.15, cloth2: 1.1, gold: 1, cape: 0.9, fur: 0.9, hair: 0.85, bone: 0.8, skin: 0.45 };
  const MAX_SHELL_VERTS = 16000;
  function pickShellMeshes(root, k) {
    if (k <= 0) return [];
    const sk = [];
    root.traverse(o => {
      if (!o.isSkinnedMesh || o.userData.isOutline || o.userData.vfx || !o.skeleton) return;
      const L = o.userData.layer || '';
      if (SKIP_LAYER.test(L) || L === 'face') return;
      const a = o.geometry && o.geometry.attributes;
      if (!a || !a.position || !a.normal || !a.skinIndex || !a.skinWeight || a.position.count < 8) return;
      sk.push({ o, s: a.position.count * (SKIN_PREF[L] || 0.7), n: a.position.count });
    });
    if (sk.length) {
      sk.sort((a, b) => b.s - a.s);
      const out = []; let tot = 0;
      for (const c of sk) { if (out.length >= k) break; if (tot + c.n > MAX_SHELL_VERTS) continue; out.push(c.o); tot += c.n; }
      return out;
    }
    const cand = [];
    root.traverse(o => {
      if (!o.isMesh || o.userData.isOutline || o.userData.vfx) return;
      if (SKIP_LAYER.test(o.userData.layer || '')) return;
      const g = o.geometry, a = g && g.attributes;
      if (!a || !a.position || !a.normal || a.position.count > 9000 || a.position.count < 8) return;
      const pr = BONE_PRI[(o.parent && o.parent.name) || ''];
      if (!pr) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      cand.push({ o, s: pr * (g.boundingSphere ? g.boundingSphere.radius : 0.3), b: o.parent.name });
    });
    cand.sort((a, b) => b.s - a.s);
    const out = [], used = {};
    for (const c of cand) { if (out.length >= k) break; if (used[c.b]) continue; used[c.b] = 1; out.push(c.o); }
    for (const c of cand) { if (out.length >= k) break; if (out.indexOf(c.o) < 0) out.push(c.o); }
    return out;
  }

  // ------------------------------------------------------------------
  //  1) Coquilles « fresnel » : liseré (rare) + motifs animés (épique+) + émissif pulsé (légendaire+)
  //     Copie gonflée de la géométrie (par instance), couleurs de sommet recalculées sur CPU
  //     (fresnel vue/normale + onde qui monte), texture de motif partagée.
  // ------------------------------------------------------------------
  function makeShell(st, src, patKind) {
    const sg = src.geometry, P = sg.attributes.position, N = sg.attributes.normal, n = P.count;
    const ws = src.getWorldScale ? src.getWorldScale(new T.Vector3()) : { x: 1, y: 1, z: 1 };
    const inflate = 0.011 / Math.max(0.2, (ws.x + ws.y + ws.z) / 3);
    const g = bufGeo(n, 0, !!patKind);
    const pos = g.attributes.position.array, nor = new Float32Array(n * 3);
    let ymin = 1e9, ymax = -1e9;
    for (let i = 0; i < n; i++) {
      let nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i); const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l; ny /= l; nz /= l;
      nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz;
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      pos[i * 3] = x + nx * inflate; pos[i * 3 + 1] = y + ny * inflate; pos[i * 3 + 2] = z + nz * inflate;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    if (patKind) { // UV cylindriques (motif homogène quel que soit le modèle)
      const uv = g.attributes.uv.array;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        uv[i * 2] = (Math.atan2(x, z) / TAU + 0.5) * 3; uv[i * 2 + 1] = y * 2.2;
      }
    }
    if (sg.index) {
      const ia = sg.index.array; g.setIndex(new T.BufferAttribute(ia.slice ? ia.slice() : Array.from(ia), 1));
    }
    g.computeBoundingSphere();
    const mkey = patKind ? 'shell|' + patKind : 'shell';
    const sh = { mesh: null, nor, n, ymin, ymax: Math.max(ymax, ymin + 1e-3), skin: false };
    if (src.isSkinnedMesh && src.skeleton && T.SkinnedMesh) {
      // coquille skinnée sur le même squelette (suit les déformations) ; fresnel exact par os dominant
      const SI = sg.attributes.skinIndex, SW = sg.attributes.skinWeight;
      g.setAttribute('skinIndex', new T.BufferAttribute(SI.array.slice(), SI.itemSize));
      g.setAttribute('skinWeight', new T.BufferAttribute(SW.array.slice(), SW.itemSize));
      const dom = new Uint16Array(n), used = [], seen = {};
      for (let i = 0; i < n; i++) {
        let b = 0, w = -1;
        for (let q = 0; q < SI.itemSize; q++) { const wq = SW.array[i * SW.itemSize + q]; if (wq > w) { w = wq; b = SI.array[i * SI.itemSize + q]; } }
        dom[i] = b; if (!seen[b]) { seen[b] = 1; used.push(b); }
      }
      const skel = src.skeleton, bindW = [];
      for (let b = 0; b < skel.bones.length; b++) bindW.push(seen[b] && skel.boneInverses[b] ? new T.Matrix4().copy(skel.boneInverses[b]).invert() : null);
      const base = mat(mkey, patKind ? { map: patTex(patKind) } : {});
      const skey = mkey + '|skin';
      let smat = MATS[skey];
      if (!smat) { smat = MATS[skey] = base.clone(); smat.skinning = true; smat.userData.shared = true; smat.userData.vfx = true; }
      const m = new T.SkinnedMesh(g, smat);
      m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
      m.userData.vfx = true; m.userData.vfxState = st; m.userData.noFlash = true; m.userData.lod = 'keep'; m.onBeforeRender = ON_BR; m.renderOrder = 3;
      src.add(m);
      m.bind(skel, src.bindMatrix);
      Object.assign(sh, { mesh: m, skin: true, dom, used, skel, bindW, cam: new Float32Array(skel.bones.length * 3) });
      return sh;
    }
    const m = vfxMesh(g, mat(mkey, patKind ? { map: patTex(patKind) } : {}), st, false);
    m.renderOrder = 3;
    src.add(m);   // enfant direct : suit l'os, la visibilité et le LOD du mesh source
    sh.mesh = m;
    return sh;
  }
  function updateShell(st, sh, cam, t) {
    const m = sh.mesh;
    if (!cam || !m.parent || !m.parent.visible) return;
    let cx = 0, cy = 0, cz = 0;
    const SK = sh.skin, CB = sh.cam, dom = sh.dom;
    if (SK) {   // caméra ramenée dans l'espace de liaison de chaque os utilisé
      _v2.setFromMatrixPosition(cam.matrixWorld);
      const wx = _v2.x, wy = _v2.y, wz = _v2.z, bones = sh.skel.bones;
      for (let q = 0; q < sh.used.length; q++) {
        const b = sh.used[q], bw = sh.bindW[b];
        if (!bw || !bones[b]) continue;
        _m4.copy(bones[b].matrixWorld).invert();
        _v.set(wx, wy, wz).applyMatrix4(_m4).applyMatrix4(bw);
        CB[b * 3] = _v.x; CB[b * 3 + 1] = _v.y; CB[b * 3 + 2] = _v.z;
      }
    } else {
      _m4.copy(m.matrixWorld).invert();
      _v.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_m4);
      cx = _v.x; cy = _v.y; cz = _v.z;
    }
    const pos = m.geometry.attributes.position.array, col = m.geometry.attributes.color.array, nor = sh.nor;
    const r = st.rank, A = st.rimC, B = st.c2, Pc = st.patC;
    const rimK = r === 1 ? 1.15 : 1.25, patK = r >= 2 ? 0.75 : 0;
    const pulse = r >= 3 ? 0.72 + 0.28 * Math.sin(t * 2.4) : 1;
    const inv = 1 / (sh.ymax - sh.ymin);
    for (let i = 0, j = 0; i < sh.n; i++, j += 3) {
      if (SK) { const b = dom[i] * 3; cx = CB[b]; cy = CB[b + 1]; cz = CB[b + 2]; }
      let dx = cx - pos[j], dy = cy - pos[j + 1], dz = cz - pos[j + 2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const d = (nor[j] * dx + nor[j + 1] * dy + nor[j + 2] * dz) / l;
      let rim = 1 - (d < 0 ? -d : d); rim = rim * rim * rim * rimK;
      let wv = 0;
      if (patK) {   // ondes qui montent le long du corps (veines / runes qui pulsent)
        const h = (pos[j + 1] - sh.ymin) * inv;
        const s = Math.sin(h * 7.5 - t * 3.1 + st.seed);
        wv = (0.22 + 0.78 * (s > 0 ? s * s : 0)) * patK * pulse;
      }
      const rk = rim * (r >= 3 ? 0.8 + 0.2 * pulse : 1);
      col[j] = A[0] * rk + B[0] * wv * 0.35 + Pc[0] * wv * 0.65;
      col[j + 1] = A[1] * rk + B[1] * wv * 0.35 + Pc[1] * wv * 0.65;
      col[j + 2] = A[2] * rk + B[2] * wv * 0.35 + Pc[2] * wv * 0.65;
    }
    m.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  //  2) Particules (espace monde, billboards CPU, 1 draw call)
  // ------------------------------------------------------------------
  // y0 : fraction de la hauteur ; r : rayon d'émission (x échelle) ; vy : vitesse verticale (u/s, x échelle)
  const PK = {
    embers: { cells: [5, 0], life: [0.9, 1.7], size: [0.05, 0.1], grow: -0.5, y0: [0.02, 0.5], r: [0.25, 0.55], vy: [0.7, 1.4], out: 0.15, swirl: 0.5, wob: 0.6, bright: 1.0 },
    arcane: { cells: [1, 0], life: [1.2, 2.2], size: [0.07, 0.13], grow: 0, y0: [0.05, 0.85], r: [0.45, 0.72], vy: [0.2, 0.55], out: 0, swirl: 1.5, wob: 0.2, bright: 0.85, twinkle: 1 },
    stars:  { cells: [1, 1, 0], life: [1.4, 2.6], size: [0.06, 0.14], grow: 0, y0: [0.1, 1.05], r: [0.35, 0.8], vy: [-0.05, 0.15], out: 0.05, swirl: 0.4, wob: 0.1, bright: 0.95, twinkle: 1 },
    glint:  { cells: [1, 0], life: [0.6, 1.2], size: [0.05, 0.1], grow: 0, y0: [0.15, 0.95], r: [0.3, 0.6], vy: [0.0, 0.3], out: 0.1, swirl: 0.3, wob: 0.1, bright: 1.0, twinkle: 1, n: 0.6 },
    smoke:  { cells: [2], life: [1.3, 2.3], size: [0.18, 0.3], grow: 1.3, y0: [0.0, 0.18], r: [0.15, 0.42], vy: [0.12, 0.38], out: 0.35, swirl: 0.6, wob: 0.3, bright: 0.32, n: 0.55 },
    leaves: { cells: [6, 6, 0], life: [1.6, 2.6], size: [0.06, 0.1], grow: 0, y0: [0.85, 1.1], r: [0.3, 0.7], vy: [-0.4, -0.15], out: 0.1, swirl: 1.1, wob: 1.0, bright: 0.7, spin: 3, n: 0.5 },
    holy:   { cells: [0, 1], life: [1.5, 2.5], size: [0.05, 0.1], grow: 0, y0: [0.0, 0.45], r: [0.3, 0.62], vy: [0.35, 0.7], out: 0, swirl: 0.35, wob: 0.3, bright: 0.9, twinkle: 1 },
    frost:  { cells: [1, 0], life: [1.4, 2.4], size: [0.05, 0.1], grow: 0, y0: [0.6, 1.1], r: [0.25, 0.7], vy: [-0.35, -0.1], out: 0.05, swirl: 1.0, wob: 0.5, bright: 0.9, spin: 1.5 },
    storm:  { cells: [0, 1], life: [0.12, 0.35], size: [0.04, 0.08], grow: -0.3, y0: [0.1, 1.0], r: [0.3, 0.6], vy: [-0.3, 0.3], out: 0.3, swirl: 0.2, wob: 0, bright: 1.25, jitter: 3.5, n: 0.7 },
    souls:  { cells: [2, 0], life: [1.8, 3.0], size: [0.12, 0.2], grow: 0.3, y0: [0.0, 0.3], r: [0.2, 0.5], vy: [0.35, 0.6], out: 0.05, swirl: 0.5, wob: 1.4, bright: 0.55, n: 0.7 },
    prism:  { cells: [1, 0], life: [1.2, 2.2], size: [0.06, 0.12], grow: 0, y0: [0.05, 0.9], r: [0.4, 0.7], vy: [0.2, 0.5], out: 0, swirl: 1.3, wob: 0.2, bright: 0.95, twinkle: 1, rainbow: 1 },
  };
  function makeParticles(st, kind, count) {
    const K = PK[kind] || PK.holy;
    const n = Math.max(4, Math.min(MAX_PART, Math.round(count * (K.n || 1))));
    const idx = new Array(n * 6);
    for (let i = 0; i < n; i++) { const a = i * 4, b = i * 6; idx[b] = a; idx[b + 1] = a + 1; idx[b + 2] = a + 2; idx[b + 3] = a; idx[b + 4] = a + 2; idx[b + 5] = a + 3; }
    const g = bufGeo(n * 4, idx, true);
    const uv = g.attributes.uv.array;
    const p = {
      K, n, geo: g, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
      age: new Float32Array(n), life: new Float32Array(n), size: new Float32Array(n), rot: new Float32Array(n),
      cr: new Float32Array(n), cg: new Float32Array(n), cb: new Float32Array(n), ph: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      const c = K.cells[i % K.cells.length], o = cellUV(c), e = 0.004;
      const u0 = o[0] + e, v0 = o[1] + e, u1 = o[0] + 0.25 - e, v1 = o[1] + 0.5 - e;
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      p.life[i] = rr(K.life[0], K.life[1]);
      p.age[i] = -Math.random() * p.life[i];   // naissances étalées (pas de bouffée au départ)
    }
    const m = vfxMesh(g, mat('part', { map: atlas(), side: T.DoubleSide }), st, true);
    p.mesh = m;
    return p;
  }
  function spawn(st, p, i) {
    const K = p.K, k = st.k, e = st.root.matrixWorld.elements;
    const a = Math.random() * TAU, r = rr(K.r[0], K.r[1]) * k, y = rr(K.y0[0], K.y0[1]) * st.H;
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    p.x[i] = e[0] * lx + e[4] * y + e[8] * lz + e[12];
    p.y[i] = e[1] * lx + e[5] * y + e[9] * lz + e[13];
    p.z[i] = e[2] * lx + e[6] * y + e[10] * lz + e[14];
    p.vx[i] = Math.cos(a) * K.out * k; p.vz[i] = Math.sin(a) * K.out * k; p.vy[i] = rr(K.vy[0], K.vy[1]) * k;
    p.life[i] = rr(K.life[0], K.life[1]); p.size[i] = rr(K.size[0], K.size[1]) * k;
    p.rot[i] = Math.random() * TAU; p.ph[i] = Math.random() * TAU;
    let c;
    if (K.rainbow) { const h = Math.random(); _col.setHSL(h, 0.9, 0.65); c = [_col.r, _col.g, _col.b]; }
    else { const q = Math.random(); c = q < 0.6 ? st.pc1 : q < 0.9 ? st.c2 : WHITE; }
    p.cr[i] = c[0]; p.cg[i] = c[1]; p.cb[i] = c[2];
  }
  const _col = new T.Color(), WHITE = [1, 1, 1];
  // pré-chauffage (1re image) : l'aura est déjà « installée », pas de bouffée ni de vide au départ
  function prewarm(st, p, t) {
    for (let s = 0; s < 36; s++) updateParticles(st, p, 0.05, t - (36 - s) * 0.05, null);
  }
  function updateParticles(st, p, dt, t, cam) {
    const K = p.K, n = p.n, e = st.root.matrixWorld.elements;
    const hx = e[12], hz = e[14];
    // axes caméra (billboards) ; sans caméra : plan XY monde
    let rx = 1, ry = 0, rz = 0, ux = 0, uy = 1, uz = 0;
    if (cam) { const c = cam.matrixWorld.elements; rx = c[0]; ry = c[1]; rz = c[2]; ux = c[4]; uy = c[5]; uz = c[6]; }
    const pos = p.geo.attributes.position.array, col = p.geo.attributes.color.array;
    const drag = Math.exp(-0.9 * dt);
    for (let i = 0; i < n; i++) {
      let a = p.age[i] + dt;
      if (a >= p.life[i]) { spawn(st, p, i); a = 0; }
      else if (p.age[i] < 0 && a >= 0) spawn(st, p, i);       // naissance
      p.age[i] = a;
      const j = i * 12;
      if (a < 0) { for (let q = 0; q < 12; q++) pos[j + q] = 0; col.fill(0, j, j + 12); continue; }
      // tourbillon autour de l'axe du héros + oscillation + agitation (orage)
      const dx = p.x[i] - hx, dz = p.z[i] - hz;
      const sw = K.swirl * dt, wob = K.wob ? Math.sin(t * 3 + p.ph[i]) * K.wob * 0.4 * dt * st.k : 0;
      p.x[i] += -dz * sw + p.vx[i] * dt + wob;
      p.z[i] += dx * sw + p.vz[i] * dt + (K.wob ? Math.cos(t * 2.6 + p.ph[i]) * K.wob * 0.4 * dt * st.k : 0);
      p.y[i] += p.vy[i] * dt;
      if (K.jitter) { p.x[i] += (Math.random() - 0.5) * K.jitter * dt; p.y[i] += (Math.random() - 0.5) * K.jitter * dt; p.z[i] += (Math.random() - 0.5) * K.jitter * dt; }
      p.vx[i] *= drag; p.vz[i] *= drag;
      p.rot[i] += (K.spin || 0) * dt;
      const u = a / p.life[i];
      const fade = Math.min(1, u * 5) * (1 - u) * (1 - u) * 1.6;
      let s = p.size[i] * (1 + K.grow * u);
      let br = K.bright * fade * st.vis;
      if (K.twinkle) { const tw = 0.55 + 0.45 * Math.sin(t * 9 + p.ph[i] * 3); br *= tw; s *= 0.8 + 0.3 * tw; }
      const cs = Math.cos(p.rot[i]) * s, sn = Math.sin(p.rot[i]) * s;
      // r' = r*cos + u*sin ; u' = u*cos - r*sin
      const ax = rx * cs + ux * sn, ay = ry * cs + uy * sn, az = rz * cs + uz * sn;
      const bx = ux * cs - rx * sn, by = uy * cs - ry * sn, bz = uz * cs - rz * sn;
      const x = p.x[i], y = p.y[i], z = p.z[i];
      pos[j] = x - ax - bx; pos[j + 1] = y - ay - by; pos[j + 2] = z - az - bz;
      pos[j + 3] = x + ax - bx; pos[j + 4] = y + ay - by; pos[j + 5] = z + az - bz;
      pos[j + 6] = x + ax + bx; pos[j + 7] = y + ay + by; pos[j + 8] = z + az + bz;
      pos[j + 9] = x - ax + bx; pos[j + 10] = y - ay + by; pos[j + 11] = z - az + bz;
      const r = p.cr[i] * br, g = p.cg[i] * br, b = p.cb[i] * br;
      for (let q = 0; q < 12; q += 3) { col[j + q] = r; col[j + q + 1] = g; col[j + q + 2] = b; }
    }
    p.geo.attributes.position.needsUpdate = true; p.geo.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  //  3) Éléments en orbite (mythique) : pièces fusionnées, sommets recalculés (espace local du héros)
  // ------------------------------------------------------------------
  // gabarits : liste de triangles [x,y,z]*3, + uv par sommet ; dimension ~1 (mise à l'échelle par count)
  function quadT(w, h, cell) {
    const o = cellUV(cell), e = 0.004, u0 = o[0] + e, v0 = o[1] + e, u1 = o[0] + 0.25 - e, v1 = o[1] + 0.5 - e;
    return { p: [-w, -h, 0, w, -h, 0, w, h, 0, -w, -h, 0, w, h, 0, -w, h, 0], uv: [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], shade: [1, 1, 1, 1, 1, 1] };
  }
  function bipyr(rx, h0, h1, sides, rz) {  // cristal / lame / éclat : bipyramide
    const p = [], uv = [], shade = [], o = cellUV(CELL.solid), cu = o[0] + 0.12, cv = o[1] + 0.25;
    for (let s = 0; s < sides; s++) {
      const a0 = s / sides * TAU, a1 = (s + 1) / sides * TAU;
      const x0 = Math.cos(a0) * rx, z0 = Math.sin(a0) * (rz || rx), x1 = Math.cos(a1) * rx, z1 = Math.sin(a1) * (rz || rx);
      const lt = 0.55 + 0.45 * Math.abs(Math.cos((a0 + a1) / 2 - 0.6));
      p.push(x0, 0, z0, x1, 0, z1, 0, h1, 0); p.push(x1, 0, z1, x0, 0, z0, 0, -h0, 0);
      for (let q = 0; q < 6; q++) { uv.push(cu, cv); }
      shade.push(lt, lt, 1.25, lt * 0.8, lt * 0.8, 0.5);
    }
    return { p, uv, shade };
  }
  function orbitTemplate(kind) {
    switch (kind) {
      case 'runes': return { tpl: quadT(0.13, 0.13, CELL.rune), n: 6, face: 1, R: 0.78, y: 0.55, bob: 0.06, spd: 0.7, spin: 0, tilt: 0.1, bright: 1.1 };
      case 'crystals': return { tpl: bipyr(0.06, 0.1, 0.2, 4), n: 6, face: 0, R: 0.72, y: 0.6, bob: 0.08, spd: 0.55, spin: 1.6, tilt: 0.18, bright: 0.9 };
      case 'shards': return { tpl: bipyr(0.035, 0.06, 0.22, 3), n: 7, face: 0, R: 0.66, y: 0.5, bob: 0.07, spd: -0.9, spin: 2.4, tilt: 0.25, bright: 0.85 };
      case 'blades': return { tpl: bipyr(0.05, 0.08, 0.34, 4, 0.012), n: 5, face: 2, R: 0.8, y: 0.55, bob: 0.05, spd: 0.5, spin: 0, tilt: 0.08, bright: 0.85 };
      case 'daggers': return { tpl: bipyr(0.035, 0.05, 0.22, 4, 0.01), n: 6, face: 3, R: 0.62, y: 0.5, bob: 0.05, spd: 1.2, spin: 0, tilt: 0.3, bright: 0.85 };
      case 'feathers': return { tpl: quadT(0.1, 0.21, CELL.feather), n: 8, face: 1, R: 0.74, y: 0.62, bob: 0.1, spd: 0.4, spin: 0, tilt: 0.12, bright: 1.25, sway: 1 };
      default: return { tpl: quadT(0.12, 0.12, CELL.smoke), n: 6, face: 1, R: 0.7, y: 0.5, bob: 0.16, spd: 0.6, spin: 0, tilt: 0.3, bright: 0.75, sway: 1 }; // souls
    }
  }
  function makeOrbit(st, kind) {
    const O = orbitTemplate(kind), nv = O.tpl.p.length / 3, n = O.n;
    const g = bufGeo(nv * n, 0, true);
    const uv = g.attributes.uv.array;
    for (let i = 0; i < n; i++) uv.set(O.tpl.uv, i * nv * 2);
    const m = vfxMesh(g, mat('orbit', { map: atlas(), side: T.DoubleSide }), st, false);
    m.frustumCulled = false;
    st.root.add(m);
    return { O, nv, n, mesh: m, geo: g };
  }
  function updateOrbit(st, ob, t) {
    const O = ob.O, tp = O.tpl.p, sh = O.tpl.shade, nv = ob.nv, k = st.k * 1.0;
    const pos = ob.geo.attributes.position.array, col = ob.geo.attributes.color.array;
    for (let i = 0; i < ob.n; i++) {
      const a = (i / ob.n) * TAU + t * O.spd;
      const R = O.R * k * (1 + 0.06 * Math.sin(t * 1.3 + i));
      const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
      const cy = O.y * st.H + Math.sin(t * 1.7 + i * 1.9) * O.bob * st.H + Math.sin(a) * O.tilt * R;
      // orientation : face 1 = tourné vers l'extérieur ; 2 = pointe en haut, tranchant tangent ; 3 = pointe tangente ; 0 = auto-rotation
      let yaw = O.face === 0 ? t * O.spin + i : -a + Math.PI / 2, roll = 0;
      if (O.face === 3) roll = Math.PI / 2 * (O.spd > 0 ? -1 : 1);
      if (O.sway) roll = Math.sin(t * 2.1 + i) * 0.35;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
      const fl = (0.75 + 0.25 * Math.sin(t * 3.3 + i * 2.3)) * O.bright * st.vis;
      const A = (i & 1) ? st.c2 : st.c1;
      for (let v = 0; v < nv; v++) {
        let x = tp[v * 3] * k, y = tp[v * 3 + 1] * k, z = tp[v * 3 + 2] * k;
        const x1 = x * cr - y * sr, y1 = x * sr + y * cr; x = x1; y = y1;          // roulis (autour de Z)
        const x2 = x * cyw + z * syw, z2 = -x * syw + z * cyw;                      // lacet (autour de Y)
        const o = (i * nv + v) * 3;
        pos[o] = cx + x2; pos[o + 1] = cy + y; pos[o + 2] = cz + z2;
        const s = sh[v] * fl;
        col[o] = A[0] * s; col[o + 1] = A[1] * s; col[o + 2] = A[2] * s;
      }
    }
    ob.geo.attributes.position.needsUpdate = true; ob.geo.attributes.color.needsUpdate = true;
    ob.geo.boundingSphere = null;
  }

  // ------------------------------------------------------------------
  //  4) Halo / couronne (géométrie partagée par type, attachée à l'os de la tête)
  // ------------------------------------------------------------------
  const HALO_GEO = {};
  function haloGeo(kind) {
    if (HALO_GEO[kind]) return HALO_GEO[kind];
    const p = [], c = [], uv = [];
    const o = cellUV(CELL.solid), su = o[0] + 0.12, sv = o[1] + 0.25;
    const tri = (a, b, d, ca, cb, cd, uva, uvb, uvd) => { p.push(...a, ...b, ...d); c.push(ca, ca, ca, cb, cb, cb, cd, cd, cd); uv.push(...(uva || [su, sv]), ...(uvb || [su, sv]), ...(uvd || [su, sv])); };
    const band = (r0, r1, y0, y1, seg, k0, k1) => {   // anneau/bande (r0->r1, y0->y1)
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * TAU, a1 = (s + 1) / seg * TAU;
        const A0 = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0], A1 = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0];
        const B0 = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1], B1 = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1];
        tri(A0, A1, B1, k0, k0, k1); tri(A0, B1, B0, k0, k1, k1);
      }
    };
    const spikes = (n, r, y, h, w, jit, k) => {
      const rnd = lcg(n * 13 + 5);
      for (let s = 0; s < n; s++) {
        const a = s / n * TAU, hh = h * (1 + (rnd() - 0.5) * jit) * (s % 2 ? 0.7 : 1);
        const ca = Math.cos(a), sa = Math.sin(a), tx = -sa * w, tz = ca * w;
        const L = [ca * r - tx, y, sa * r - tz], R = [ca * r + tx, y, sa * r + tz], Tp = [ca * r * 1.06, y + hh, sa * r * 1.06];
        tri(L, R, Tp, k * 0.7, k * 0.7, k * 1.3);
      }
    };
    if (kind === 'halo') { band(0.26, 0.31, 0, 0, 40, 0.5, 1.2); band(0.31, 0.36, 0, 0, 40, 1.2, 0.25); }
    else if (kind === 'crown') { band(0.27, 0.27, 0, 0.07, 28, 0.9, 1.1); spikes(8, 0.27, 0.07, 0.16, 0.05, 0.2, 1); }
    else if (kind === 'thorns') { band(0.26, 0.28, 0, 0.04, 28, 0.6, 0.9); spikes(13, 0.27, 0.03, 0.2, 0.025, 0.8, 1); }
    else if (kind === 'circlet') {
      band(0.27, 0.29, 0, 0, 36, 0.5, 1.1);
      for (let s = 0; s < 4; s++) { const a = s / 4 * TAU + 0.4, x = Math.cos(a) * 0.36, z = Math.sin(a) * 0.36; tri([x - 0.03, 0.06, z], [x + 0.03, 0.06, z], [x, 0.16, z], 0.8, 0.8, 1.3); tri([x + 0.03, 0.06, z], [x - 0.03, 0.06, z], [x, -0.03, z], 0.8, 0.8, 0.5); }
    } else if (kind === 'laurel') {
      for (let s = 0; s < 14; s++) {
        if (s === 0 || s === 13) continue;    // ouverture devant
        const a = s / 14 * TAU + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), r = 0.28;
        const P0 = [ca * r, 0, sa * r], Tq = [-sa * 0.08, 0.06, ca * 0.08];
        tri(P0, [P0[0] + Tq[0] + ca * 0.05, P0[1] + Tq[1], P0[2] + Tq[2] + sa * 0.05], [P0[0] + Tq[0] - ca * 0.03, P0[1] + Tq[1] + 0.03, P0[2] + Tq[2] - sa * 0.03], 0.5, 1.2, 1.0);
      }
      band(0.275, 0.285, 0, 0, 30, 0.5, 0.8);
    } else if (kind === 'crescent') {   // croissant vertical derrière la tête
      const seg = 22;
      for (let s = 0; s < seg; s++) {
        const a0 = -0.35 + s / seg * (Math.PI + 0.7), a1 = -0.35 + (s + 1) / seg * (Math.PI + 0.7);
        const w0 = 0.02 + 0.07 * Math.sin((s / seg) * Math.PI), w1 = 0.02 + 0.07 * Math.sin(((s + 1) / seg) * Math.PI);
        const r = 0.3;
        const A0 = [Math.cos(a0) * r, Math.sin(a0) * r, 0], A1 = [Math.cos(a1) * r, Math.sin(a1) * r, 0];
        const B0 = [Math.cos(a0) * (r + w0), Math.sin(a0) * (r + w0), 0], B1 = [Math.cos(a1) * (r + w1), Math.sin(a1) * (r + w1), 0];
        tri(A0, A1, B1, 1.1, 1.1, 0.4); tri(A0, B1, B0, 1.1, 0.4, 0.4);
      }
    } else if (kind === 'glyph') {      // cercle runique horizontal (texture runes, rangée unique)
      const seg = 36, r0 = 0.3, r1 = 0.44;
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * TAU, a1 = (s + 1) / seg * TAU, u0 = s / seg * 4, u1 = (s + 1) / seg * 4;
        const A0 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0], A1 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
        const B0 = [Math.cos(a0) * r1, 0, Math.sin(a0) * r1], B1 = [Math.cos(a1) * r1, 0, Math.sin(a1) * r1];
        tri(A0, A1, B1, 1, 1, 1, [u0, 0], [u1, 0], [u1, 0.25]); tri(A0, B1, B0, 1, 1, 1, [u0, 0], [u1, 0.25], [u0, 0.25]);
      }
      band(0.44, 0.455, 0, 0, 36, 1.2, 1.2);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    g.userData.shared = true;
    return (HALO_GEO[kind] = g);
  }
  function haloMat(kind, hex) {
    const key = 'halo|' + kind + '|' + hex;
    if (MATS[key]) return MATS[key];
    const m = mat(key, { map: kind === 'glyph' ? patTex('runes') : atlas(), side: T.DoubleSide });
    m.vertexColors = true; m.color.setHex(hex);
    return m;
  }
  function makeHalo(st, kind, head) {
    if (!head || kind === 'none') return null;
    const root = st.root;
    root.updateMatrixWorld(true);
    const hw = new T.Vector3().setFromMatrixPosition(head.matrixWorld);
    const rw = new T.Vector3().setFromMatrixPosition(root.matrixWorld);
    const top = rw.y + st.H * (kind === 'crown' || kind === 'thorns' || kind === 'laurel' ? 0.955 : 1.04);
    const tgt = kind === 'crescent' ? new T.Vector3(hw.x, Math.max(hw.y + 0.1 * st.k, top - 0.22 * st.k), hw.z) : new T.Vector3(hw.x, Math.max(top, hw.y + 0.2 * st.k), hw.z);
    // derrière la tête (-Z du héros) pour le croissant
    if (kind === 'crescent') { const bz = new T.Vector3(0, 0, -0.2 * st.k).applyQuaternion(root.getWorldQuaternion(new T.Quaternion())); tgt.add(bz); }
    const inv = new T.Matrix4().copy(head.matrixWorld).invert();
    const local = tgt.clone().applyMatrix4(inv);
    const hs = head.getWorldScale(new T.Vector3());
    const m = vfxMesh(haloGeo(kind), haloMat(kind, st.hex1), st, false);
    m.position.copy(local);
    const kk = st.k * (kind === 'glyph' ? 0.95 : 1);
    m.scale.set(kk / (hs.x || 1), kk / (hs.y || 1), kk / (hs.z || 1));
    if (kind === 'crescent') m.rotation.set(0.25, 0, 0);
    else m.rotation.set(kind === 'glyph' ? 0.12 : 0.1, 0, 0);
    head.add(m);
    return { mesh: m, kind, sx: m.scale.x, sy: m.scale.y, sz: m.scale.z, py: m.position.y };
  }
  function updateHalo(st, h, t) {
    const m = h.mesh;
    if (h.kind === 'crescent') m.rotation.z = Math.sin(t * 0.8) * 0.12;
    else m.rotation.y = t * (h.kind === 'glyph' ? 0.6 : h.kind === 'thorns' ? -0.25 : 0.35);
    const s = 1 + 0.04 * Math.sin(t * 2.2);
    m.scale.set(h.sx * s, h.sy, h.sz * s);
    m.position.y = h.py + Math.sin(t * 1.6) * 0.015 * st.k / h.sy;
  }

  // ------------------------------------------------------------------
  //  5) Cape d'énergie (mythique) : grille 4x8, attachée au torse, ondule (plus fort en courant)
  // ------------------------------------------------------------------
  const CAPE_W = 4, CAPE_H = 8;
  function makeCape(st, chest) {
    if (!chest) return null;
    const root = st.root; root.updateMatrixWorld(true);
    // recul de la cape : derrière le torse réel (boîte du héros à l'attache, hors effets), borné
    let back0 = 0.26 * st.k;
    try {
      const bb = new T.Box3(), tmp = new T.Box3();
      root.traverse(o => { if (o.isMesh && !o.userData.vfx && !o.userData.isOutline && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); const c = tmp.getCenter(new T.Vector3()); if (c.y > st.H * 0.3 && c.y < st.H * 0.8 && Math.abs(c.x - root.matrixWorld.elements[12]) < 0.35 * st.k) bb.union(tmp); } });
      if (!bb.isEmpty()) back0 = Math.min(0.6 * st.k, Math.max(back0, root.matrixWorld.elements[14] - bb.min.z + 0.03 * st.k));
    } catch (e) { /* valeur par défaut */ }
    const nv = CAPE_W * CAPE_H, idx = [];
    for (let r = 0; r < CAPE_H - 1; r++) for (let c = 0; c < CAPE_W - 1; c++) {
      const a = r * CAPE_W + c, b = a + 1, d = a + CAPE_W, e = d + 1; idx.push(a, d, b, b, d, e);
    }
    const g = bufGeo(nv, idx, true);
    const uv = g.attributes.uv.array;
    const inv = new T.Matrix4().copy(chest.matrixWorld).invert(), w = new T.Vector3();
    const base = new Float32Array(nv * 3), back = new Float32Array(nv * 3);
    const bq = root.getWorldQuaternion(new T.Quaternion()), bk = new T.Vector3(0, 0, -1).applyQuaternion(bq);
    const rw = new T.Vector3().setFromMatrixPosition(root.matrixWorld);
    // direction « arrière » exprimée dans le repère de l'os
    const o0 = new T.Vector3().copy(rw).applyMatrix4(inv), o1 = new T.Vector3().copy(rw).add(bk).applyMatrix4(inv), bl = o1.sub(o0).normalize();
    for (let r = 0; r < CAPE_H; r++) for (let c = 0; c < CAPE_W; c++) {
      const i = r * CAPE_W + c, v = r / (CAPE_H - 1), u = c / (CAPE_W - 1);
      const half = (0.2 + 0.16 * v) * st.k;
      const lx = (u - 0.5) * 2 * half, ly = st.H * (0.76 - 0.6 * v), lz = -(back0 + 0.1 * v * st.k) - 0.05 * Math.cos((u - 0.5) * Math.PI) * st.k;
      w.set(lx, ly, lz).applyQuaternion(bq).add(rw).applyMatrix4(inv);
      base[i * 3] = w.x; base[i * 3 + 1] = w.y; base[i * 3 + 2] = w.z;
      back[i * 3] = bl.x; back[i * 3 + 1] = bl.y; back[i * 3 + 2] = bl.z;
      uv[i * 2] = u; uv[i * 2 + 1] = v * 1.5;
    }
    const m = vfxMesh(g, mat('cape', { map: patTex('flow'), side: T.DoubleSide }), st, false);
    m.frustumCulled = false;
    chest.add(m);
    return { mesh: m, geo: g, base, back, s: 1 / Math.max(0.2, chest.getWorldScale(w).x) };
  }
  function updateCape(st, cp, t) {
    const pos = cp.geo.attributes.position.array, col = cp.geo.attributes.color.array, uv = cp.geo.attributes.uv.array;
    const sp = Math.min(1, st.speed / 6), k = st.k * cp.s;
    for (let r = 0; r < CAPE_H; r++) {
      const v = r / (CAPE_H - 1), v2 = v * v;
      for (let c = 0; c < CAPE_W; c++) {
        const i = r * CAPE_W + c, j = i * 3, u = c / (CAPE_W - 1);
        const wave = Math.sin(t * 3.2 - v * 4 + u * 1.5) * (0.05 + 0.08 * sp) + sp * 0.35 * v;
        const side = Math.sin(t * 2.3 - v * 3 + 1.1) * 0.04 * v;
        const d = wave * v2 * k * 1.6;
        pos[j] = cp.base[j] + cp.back[j] * d + side * k; pos[j + 1] = cp.base[j + 1] + cp.back[j + 1] * d + sp * 0.2 * v2 * k; pos[j + 2] = cp.base[j + 2] + cp.back[j + 2] * d;
        const edge = Math.sin(u * Math.PI);
        const f = (1 - v) ** 0.8 * (0.3 + 0.7 * edge) * Math.min(1, v * 6 + 0.25) * 0.55 * st.vis;
        const A = st.capeA, B = st.capeB, q = v;
        col[j] = (A[0] * (1 - q) + B[0] * q) * f; col[j + 1] = (A[1] * (1 - q) + B[1] * q) * f; col[j + 2] = (A[2] * (1 - q) + B[2] * q) * f;
        uv[i * 2 + 1] = v * 1.5 + t * 0.35;
      }
    }
    cp.geo.attributes.position.needsUpdate = true; cp.geo.attributes.color.needsUpdate = true; cp.geo.attributes.uv.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  //  6) Traînée d'arme : ruban monde à tampon circulaire (N échantillons base/pointe), 0 allocation
  // ------------------------------------------------------------------
  const TN = 16, TRAIL_LIFE = 0.28;
  function makeTrail(st) {
    const ud = st.ud;
    let src = ud.blade && ud.blade.isMesh ? ud.blade : null;
    let a = [0, 0, 0], b = [0, 0.3, 0], host = src;
    if (src && src.geometry) {
      const g = src.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox, sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      const cx = (bb.max.x + bb.min.x) / 2, cy = (bb.max.y + bb.min.y) / 2, cz = (bb.max.z + bb.min.z) / 2;
      const mx = Math.max(sx, sy, sz), mn = Math.min(sx, sy, sz);
      if (mx < mn * 1.7) { const h = Math.max(0.1, mx * 0.5); a = [cx, cy - h, cz]; b = [cx, cy + h, cz]; }  // orbe
      else if (mx === sx) { a = [bb.min.x, cy, cz]; b = [bb.max.x, cy, cz]; }
      else if (mx === sy) { a = [cx, bb.min.y, cz]; b = [cx, bb.max.y, cz]; }
      else { a = [cx, cy, bb.min.z]; b = [cx, cy, bb.max.z]; }
    } else {
      host = bone(ud, st.root, ['weaponR', 'wristR', 'armR']);
      if (!host) return null;
      a = [0, 0, 0.1]; b = [0, 0, 0.8];
    }
    const nv = TN * 2, idx = [];
    for (let i = 0; i < TN - 1; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const g = bufGeo(nv, idx, false);
    const m = vfxMesh(g, mat('trail', { side: T.DoubleSide }), st, true);
    m.visible = false;
    st.root.add(m);
    return {
      mesh: m, geo: g, host, la: a, lb: b, head: 0, count: 0,
      ax: new Float32Array(TN), ay: new Float32Array(TN), az: new Float32Array(TN),
      bx: new Float32Array(TN), by: new Float32Array(TN), bz: new Float32Array(TN), t: new Float32Array(TN),
      until: 0, col: [1, 1, 1],
    };
  }
  function trailColor(st, tr) {
    const lv = st.ud.weaponLevels || {};
    let tier = 0; for (const k in lv) { const l = lv[k] | 0; const ti = l >= 10 ? 3 : l >= 7 ? 2 : l >= 4 ? 1 : 0; if (ti > tier) tier = ti; }
    st.tier = tier;
    if (st.rank >= 3) {
      const c = st.trC;
      if (tier === 3) { const g = TIER_RGB[3]; tr.col[0] = (c[0] + g[0]) / 2; tr.col[1] = (c[1] + g[1]) / 2; tr.col[2] = (c[2] + g[2]) / 2; }
      else { tr.col[0] = c[0]; tr.col[1] = c[1]; tr.col[2] = c[2]; }
    } else if (tier) { const g = TIER_RGB[tier]; tr.col[0] = g[0]; tr.col[1] = g[1]; tr.col[2] = g[2]; }
    return st.rank >= 3 || tier > 0;
  }
  const TIER_RGB = GLOW_TIERS.map(rgb);
  function trailOn(st, dur, t) {
    const tr = st.trail; if (!tr) return;
    if (!trailColor(st, tr)) return;
    tr.until = Math.max(tr.until, (t || nowSec()) + (dur || 0.32));
    if (!tr.mesh.visible) { tr.mesh.visible = true; tr.count = 0; }
  }
  function updateTrail(st, tr, t) {
    const active = t < tr.until && tr.host && tr.host.visible !== false;
    if (active) {   // nouvel échantillon (base/pointe) en monde
      const e = tr.host.matrixWorld.elements, A = tr.la, B = tr.lb;
      tr.head = (tr.head + 1) % TN; const h = tr.head;
      tr.ax[h] = e[0] * A[0] + e[4] * A[1] + e[8] * A[2] + e[12]; tr.ay[h] = e[1] * A[0] + e[5] * A[1] + e[9] * A[2] + e[13]; tr.az[h] = e[2] * A[0] + e[6] * A[1] + e[10] * A[2] + e[14];
      tr.bx[h] = e[0] * B[0] + e[4] * B[1] + e[8] * B[2] + e[12]; tr.by[h] = e[1] * B[0] + e[5] * B[1] + e[9] * B[2] + e[13]; tr.bz[h] = e[2] * B[0] + e[6] * B[1] + e[10] * B[2] + e[14];
      tr.t[h] = t; if (tr.count < TN) tr.count++;
    }
    const pos = tr.geo.attributes.position.array, col = tr.geo.attributes.color.array, C = tr.col;
    let alive = 0, last = tr.head;
    for (let i = 0; i < TN; i++) {   // du plus récent au plus ancien
      let s = (tr.head - i + TN) % TN;
      let age = i < tr.count ? t - tr.t[s] : 99;
      if (age > TRAIL_LIFE) { s = last; age = TRAIL_LIFE; } else last = s;
      const f = 1 - age / TRAIL_LIFE, a = f * f * st.vis;
      if (a > 0.01) alive++;
      const o = i * 6;
      pos[o] = tr.ax[s]; pos[o + 1] = tr.ay[s]; pos[o + 2] = tr.az[s];
      pos[o + 3] = tr.bx[s]; pos[o + 4] = tr.by[s]; pos[o + 5] = tr.bz[s];
      col[o] = C[0] * a * 0.35; col[o + 1] = C[1] * a * 0.35; col[o + 2] = C[2] * a * 0.35;
      col[o + 3] = C[0] * a * 1.3; col[o + 4] = C[1] * a * 1.3; col[o + 5] = C[2] * a * 1.3;
    }
    tr.geo.attributes.position.needsUpdate = true; tr.geo.attributes.color.needsUpdate = true;
    if (!active && !alive) { tr.mesh.visible = false; tr.count = 0; }
  }

  // ------------------------------------------------------------------
  //  Déclenchement par le jeu : skillCast (joueur), états publiés par HeroAnim
  // ------------------------------------------------------------------
  let busHooked = false;
  function playerHero() { try { const r = G.game && G.game.run; return r && r.player && r.player.hero; } catch (e) { return null; } }
  function hookBus() {
    if (busHooked || !G.bus || !G.bus.on) return;
    busHooked = true;
    G.bus.on('skillCast', () => {
      const h = playerHero(), st = h && h.userData && h.userData.vfx6;
      if (st && !st.dead) trailOn(st, 0.34);
    });
  }

  hookBus(); // abonnement unique dès le chargement (pas à la 1re création de héros)

  // ------------------------------------------------------------------
  //  Boucle par héros (une fois par image)
  // ------------------------------------------------------------------
  function tick(st, t, cam) {
    // une simulation par image ; une 2e caméra dans la même image (aperçu, raster multi-vues) ne fait
    // que réorienter billboards / fresnel (dt = 0)
    const same = st.t > 0 && t - st.t < 0.004;
    const cs = cam ? cam.matrixWorld.elements[12] + cam.matrixWorld.elements[13] * 3.1 + cam.matrixWorld.elements[14] * 7.3 : 0;
    if (same && cam === st.cam && cs === st.camS) return;
    st.cam = cam; st.camS = cs;
    const first = st.t === 0;
    const dt = same ? 0 : first ? 0.016 : Math.min(0.05, Math.max(0, t - st.t));
    if (!same) st.t = t;
    if (first && st.parts) prewarm(st, st.parts, t);
    const e = st.root.matrixWorld.elements;
    if (dt > 0) {
      const dx = e[12] - st.px, dz = e[14] - st.pz, sp = Math.sqrt(dx * dx + dz * dz) / dt;
      st.speed += (Math.min(sp, 20) - st.speed) * Math.min(1, dt * 8);
    }
    st.px = e[12]; st.pz = e[14];
    const ud = st.ud, an = ud.animState || ud.anim6;
    if (an && (an.attack > 0.05 || an.attacking)) trailOn(st, 0.12, t);
    // coquilles lourdes (> 4000 sommets) : fresnel recalculé une image sur deux (sauf changement de caméra)
    if (!same) st.frame++;
    for (let i = 0; i < st.shells.length; i++) { const sh = st.shells[i]; if (same || sh.n < 4000 || ((st.frame + i) & 1) === 0) updateShell(st, sh, cam, t); }
    if (st.parts) updateParticles(st, st.parts, dt, t, cam);
    if (st.orbit) updateOrbit(st, st.orbit, t);
    if (st.halo) updateHalo(st, st.halo, t);
    if (st.cape) updateCape(st, st.cape, t);
    if (st.trail && st.trail.mesh.visible) updateTrail(st, st.trail, t);
    if (st.light) st.light.intensity = st.lightI * (0.85 + 0.1 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.7)) * st.vis;
  }

  // ------------------------------------------------------------------
  //  API
  // ------------------------------------------------------------------
  function attach(root, spec) {
    if (!root || !settings.enabled) return null;
    spec = spec || {};
    const ud = root.userData || (root.userData = {});
    if (ud.vfx6) return ud.vfx6;
    try {
      hookBus();
      const classId = spec.classId || ud.classId || 'Guerrier';
      const fx0 = spec.fx || {};
      const rank = rarityRank(spec.rarity != null ? spec.rarity : spec.skin && spec.skin.rarity != null ? spec.skin.rarity : fx0.rarity != null ? fx0.rarity : fx0.tier);
      const th = themeFor(classId, spec, rank);
      const low = !!(G.HeroRender && G.HeroRender.lowQuality);
      const q = Math.max(0.2, Math.min(1, settings.quality)) * (low ? 0.5 : 1);
      const H = +ud.height || 2.2;
      const st = {
        root, ud, rank, theme: th, classId, H, k: H / 2.2, t: 0, px: 0, pz: 0, speed: 0, vis: 1, seed: Math.random() * TAU,
        hex1: th.hc != null ? th.hc : th.c1, c1: rgb(th.c1), c2: rgb(th.c2), pc1: rgb(th.pc != null ? th.pc : th.c1), rimC: rgb(th.rimc != null ? th.rimc : th.c1),
        patC: rgb(th.patc != null ? th.patc : th.c1), capeA: rgb(th.cc1 != null ? vivid(th.cc1) : th.c1), capeB: rgb(th.cc2 != null ? vivid(th.cc2) : th.c2), trC: rgb(th.tc != null ? th.tc : th.c1), shells: [], parts: null, orbit: null, halo: null, cape: null, trail: null,
        light: null, lightI: 0, tier: 0, dead: false, meshes: [], frame: 0,
      };
      ud.vfx6 = st;
      root.updateMatrixWorld(true);
      let dc = 0;
      // ce qu'A4 (hero-outfits) construit déjà : pas de doublon de halo / couronne / cape d'énergie
      const a4 = { halo: false, crown: false, energyCape: false };
      try {
        const rec = ud.hero6 && G.HeroOutfits && G.HeroOutfits.recipe ? G.HeroOutfits.recipe(spec) : null;
        if (rec) {
          a4.halo = rec.head === 'halo' || (Array.isArray(rec.extras) && rec.extras.indexOf('halo') >= 0);
          a4.crown = /crown|diadem|circlet|tiara|laurel/i.test(String(rec.head || ''));
          a4.energyCape = rec.cape === 'energy';
        }
      } catch (e) { /* A4 absent */ }
      st.a4 = a4;
      const reg = m => { if (m) { st.meshes.push(m); dc++; } };
      // traînée : toujours créée (cachée), visible pendant les attaques si légendaire+ ou palier d'arme >= 4
      st.trail = makeTrail(st); if (st.trail) reg(st.trail.mesh);
      const budget = () => MAX_DC - dc;
      if (rank >= 4) {
        st.parts = makeParticles(st, th.part, Math.round((th.pcount || 110) * q)); root.add(st.parts.mesh); reg(st.parts.mesh);
        st.orbit = makeOrbit(st, th.orbit); reg(st.orbit.mesh);
        const head = bone(ud, root, ['head']);
        if (!a4.halo && !(a4.crown && CROWNISH[th.halo])) { st.halo = makeHalo(st, th.halo, head); if (st.halo) reg(st.halo.mesh); }
        if (!th.noCape && !a4.energyCape) { st.cape = makeCape(st, bone(ud, root, ['chest', 'spine', 'body'])); if (st.cape) reg(st.cape.mesh); }
        if (settings.light && !low && !th.noLight && T.PointLight) {
          st.lightI = th.lightI || 0.9;
          st.light = new T.PointLight(th.light, 0, (th.lightD || 4.2) * st.k, 2);
          st.light.position.set(0, H * 0.55, 0.35 * st.k); st.light.castShadow = false; st.light.userData.vfx = true;
          root.add(st.light);
        }
      } else if (rank === 3) {
        st.parts = makeParticles(st, th.part, Math.round(Math.min(90, th.pcount || 64) * q)); root.add(st.parts.mesh); reg(st.parts.mesh);
        if (th.legHalo && !a4.halo && !a4.crown) { st.halo = makeHalo(st, th.halo, bone(ud, root, ['head'])); if (st.halo) reg(st.halo.mesh); }
      }
      if (rank >= 2 || (rank === 1 && !th.noRim)) {
        const want = rank >= 4 ? 2 : rank === 3 ? (st.halo ? 1 : 2) : 3;
        for (const src of pickShellMeshes(root, Math.min(want, budget()))) { const sh = makeShell(st, src, rank >= 2 ? th.pat : null); st.shells.push(sh); reg(sh.mesh); }
      }
      st.drawCalls = dc;
      st.particles = st.parts ? st.parts.n : 0;
      if (dc > MAX_DC || st.particles > MAX_PART) console.warn('[HeroVFX] budget dépassé', dc, st.particles);
      return st;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[HeroVFX] attach', e);
      return null;
    }
  }
  function update(root, time, camera) {
    const st = root && root.userData && root.userData.vfx6;
    if (!st || st.dead) return;
    root.updateMatrixWorld(true);
    tick(st, time != null ? time : nowSec(), camera || null);
    for (const m of st.meshes) if (m.userData.world) m.matrixWorld.identity();
  }
  function trail(root, on, dur) {
    const st = root && root.userData && root.userData.vfx6;
    if (!st || !st.trail) return;
    if (on === false) { st.trail.until = 0; return; }
    trailOn(st, dur);
  }
  function info(root) {
    const st = root && root.userData && root.userData.vfx6;
    if (!st) return null;
    return {
      rarity: st.rank, theme: st.theme, drawCalls: st.meshes.filter(m => m.visible).length, maxDrawCalls: st.drawCalls,
      particles: st.particles, orbiters: st.orbit ? st.orbit.n : 0, light: !!st.light,
      parts: st.meshes.map(m => (m === (st.trail && st.trail.mesh) ? 'trail' : m === (st.parts && st.parts.mesh) ? 'particles' : m === (st.orbit && st.orbit.mesh) ? 'orbit' : m === (st.halo && st.halo.mesh) ? 'halo:' + st.halo.kind : m === (st.cape && st.cape.mesh) ? 'cape' : 'shell')),
    };
  }

  G.HeroVFX = { attach, update, trail, info, settings, rarityRank, themeFor, CLASS_FX, SKIN_FX, budget: { drawCalls: MAX_DC, particles: MAX_PART } };
})();
