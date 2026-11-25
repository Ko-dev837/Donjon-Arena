/* =====================================================================
   js/sys/cosmetics.js — Cosmétiques (v4) : skins par classe, auras, cadres de portrait, bannières, titre affiché.
   Expose G.Cosmetics. Panneau « Personnalisation » (id 'perso') dans le camp.
   Intégration : hook 'heroOptions' (v6 : { skinId, rarity } + anciennes couleurs, passés à G.GFX.makeHero → G.HeroDefs.resolve), bus 'heroCreated' (teinte des
   modèles qui ignorent opts), 'runStart' / 'runEnd' (aura), 'rankUp' / 'profileChanged' / 'runEnd' / 'roomCleared' (déblocages).
   Profil : profile.cosmetics = { skin:{[classe]:id}, aura, frame, banner, unlocked:{'s:Classe:id'|'a:id'|'f:id'|'b:id':true} }
   ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  const RARITY_NAMES = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire', mythique: 'Mythique', secret: 'Secret' };
  const RARITY_HEX = { commun: '#b8c0cc', rare: '#3fa9ff', epique: '#b44dff', legendaire: '#ffb020', mythique: '#ff3d6e', secret: '#00ffd0' };
  const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'Z'];
  const AURA_LEVEL = { commun: 1, rare: 2, epique: 3, legendaire: 4, mythique: 5, secret: 5 };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = (n) => '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const ico = (name, fb, size) => { try { if (G.Icons && G.Icons.svg && (!G.Icons.has || G.Icons.has(name))) { const s = G.Icons.svg(name, { size: size || 18 }); if (s) return s; } } catch (e) { /* ignore */ } return fb || ''; };
  function shade(hex, f) {
    let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  // ------------------------------------------------------------------
  //  CATALOGUE
  //  condition (texte court) : 'free' | 'gold:N' | 'rank:X' | 'ach:id' | 'boss:N' | 'level:N'
  // ------------------------------------------------------------------
  function parseCond(s) {
    const [t, v] = String(s || 'free').split(':');
    if (t === 'gold') return { t, cost: +v };
    if (t === 'rank') return { t, rank: v };
    if (t === 'ach') return { t, id: v };
    if (t === 'boss' || t === 'level') return { t, n: +v };
    return { t: 'free' };
  }
  // Ce que chaque modèle de héros sait lire / teindre
  //   native : makeHero lit opts.color ; hair / skin : opts.hair / opts.skin sont pris en compte
  //   src    : couleurs d'origine [hex, décalage] du modèle (teinte « principale ») recolorées après coup (modèles qui ignorent opts.color)
  //   acc    : couleurs d'accent d'origine recolorées par skin.accent
  const MODEL = {
    Guerrier: { native: true, hair: true, skin: true },
    Mage: { native: true, hair: true, skin: true },
    Voleur: { native: true, hair: true, skin: true },
    Assassin: { hair: false, skin: true, src: [[0x2a2d45, 0], [0x161827, -0.45]], acc: [[0xe63946, 0]] },
    Archer: { hair: true, skin: true, src: [[0x3f9a50, 0], [0x2a6b38, -0.3]], acc: [[0xe6c35c, 0]] },
    Paladin: { hair: true, skin: true, src: [[0x2d5fd1, 0], [0x1f3d8a, -0.3], [0x26325c, -0.15]], acc: [[0xffc933, 0]] },
    Elementaliste: { hair: true, skin: true, src: [[0x2c3c86, 0], [0x1b2558, -0.3], [0x2a3366, -0.15]], acc: [[0x8fe8ff, 0], [0xffe14d, 0]] },
    Necromancien: { hair: false, skin: false, src: [[0x7a35e0, 0], [0xb56bff, 0.3]], acc: [] },
  };
  const CLASS_ORDER = ['Guerrier', 'Mage', 'Voleur', 'Assassin', 'Archer', 'Paladin', 'Elementaliste', 'Necromancien'];
  // [id, nom, rareté, couleur, cheveux, peau, condition, accent]
  const SKIN_TABLE = {
    Guerrier: [
      ['acier', "Acier d'origine", 'commun', null, null, null, 'free'],
      ['foret', 'Garde sylvestre', 'rare', 0x2fa05a, 0x6b4423, 0xe8b48a, 'gold:400'],
      ['carmin', 'Lame carmin', 'rare', 0xd7343f, 0x2b1a12, 0xf2c29b, 'rank:D'],
      ['ebene', "Chevalier d'ébène", 'epique', 0x3a3f52, 0xe9eef7, 0x8d5a3c, 'ach:boss_10'],
      ['aurore', 'Aurore de givre', 'epique', 0x66d9ff, 0xffffff, 0xffe0c8, 'ach:ice_150'],
      ['dore', 'Champion doré', 'legendaire', 0xe0a526, 0xfff1c2, 0xffd2a8, 'rank:A'],
      ['souverain', 'Armure souveraine', 'mythique', 0xf4f1ff, 0xff3d6e, 0xffd9c2, 'rank:S'],
    ],
    Mage: [
      ['violet', 'Violet originel', 'commun', null, null, null, 'free'],
      ['azur', 'Azur', 'rare', 0x2f8cff, 0xdff3ff, 0xffe0c8, 'gold:400'],
      ['rubis', 'Rubis', 'rare', 0xd6336c, 0x2a0f1e, 0xf2c29b, 'rank:D'],
      ['sylve', 'Sylvestre', 'epique', 0x1faa7a, 0xb8ffd9, 0xdfa982, 'ach:cast_500'],
      ['cendres', 'Mage des cendres', 'epique', 0x3b2a4a, 0xff7a3d, 0xffd9bd, 'ach:fire_150'],
      ['astral', 'Astral', 'legendaire', 0x23244f, 0xfff2a8, 0xd9c2ff, 'rank:A'],
      ['archimage', 'Archimage', 'mythique', 0xffffff, 0xb44dff, 0xffe9d6, 'rank:S'],
    ],
    Voleur: [
      ['vert', 'Vert des bois', 'commun', null, null, null, 'free'],
      ['nuit', 'Nuit sans lune', 'rare', 0x2a2a46, 0xaab4ff, 0xf2c9a4, 'gold:400'],
      ['rouille', 'Rouille', 'rare', 0xc0662a, 0x3a2412, 0xe0a97c, 'rank:D'],
      ['poison', 'Venin', 'epique', 0x8e44ad, 0x39e08c, 0xd9e8c0, 'ach:dodge_200'],
      ['ombre', 'Ombre pâle', 'epique', 0x15151f, 0xffffff, 0xcfd6e6, 'ach:flawless_3'],
      ['jade', 'Roi des voleurs', 'legendaire', 0x1c6a5a, 0xffd24a, 0xe8b48a, 'boss:40'],
      ['spectre', 'Spectre', 'mythique', 0xe6f0ff, 0x00ffd0, 0xb8c0cc, 'rank:S'],
    ],
    Assassin: [
      ['nuit', 'Nuit rouge', 'commun', null, null, null, 'free'],
      ['cendre', 'Cendre', 'rare', 0x4a4f63, null, 0xf2c9a4, 'gold:400', 0xaab4c8],
      ['sang', 'Sang séché', 'rare', 0x4a1420, null, 0xe8b48a, 'rank:D', 0xff4d6a],
      ['jade', 'Lame de jade', 'epique', 0x1f4d3d, null, 0xd9b48f, 'ach:parry_30', 0x39e08c],
      ['foudre', 'Éclair noir', 'epique', 0x2b2f6b, null, 0xf2c9a4, 'ach:thunder_150', 0xffe14d],
      ['neige', 'Fantôme des neiges', 'legendaire', 0xe6ecf7, null, 0xffe3cf, 'rank:A', 0x46d4ff],
      ['neant', 'Néant', 'mythique', 0x0b0b12, null, 0xcdbfd9, 'rank:S', 0xb44dff],
    ],
    Archer: [
      ['sylve', 'Vert sylvestre', 'commun', null, null, null, 'free'],
      ['automne', 'Automne', 'rare', 0xc46a2b, 0x5a3418, 0xe8b48a, 'gold:400', 0xffd24a],
      ['pervenche', 'Pervenche', 'rare', 0x3f6fd1, 0xd9b36a, 0xffd2a8, 'rank:D', 0xe6f0ff],
      ['nuit', 'Œil de nuit', 'epique', 0x2c2f4a, 0xe6ecf7, 0xcfa88a, 'ach:crit_300', 0x8fb4ff],
      ['braise', 'Braise', 'epique', 0x8a2a1f, 0xff9a3d, 0xe0a97c, 'ach:fire_150', 0xffcf40],
      ['emeraude', 'Prince des bois', 'legendaire', 0x1f7a52, 0xfff3b0, 0xf2cfa8, 'ach:boss_25', 0xffffff],
      ['argent', "Rôdeur d'argent", 'mythique', 0xdfe6f2, 0x00ffd0, 0xffe0c8, 'rank:S', 0xff3d6e],
    ],
    Paladin: [
      ['azur', "Azur d'origine", 'commun', null, null, null, 'free'],
      ['pourpre', 'Pourpre', 'rare', 0x8a2bd1, 0x2b1a12, 0xffd2a8, 'gold:400'],
      ['emeraude', 'Émeraude', 'rare', 0x1f9a6a, 0xe8d8a0, 0xe8b48a, 'rank:D'],
      ['ecarlate', 'Croisé écarlate', 'epique', 0xc0392b, 0xfff1c2, 0xf2c29b, 'ach:survivor_10'],
      ['aube', 'Aube', 'epique', 0xffe8a0, 0xffffff, 0xffe0c8, 'ach:loot_leg_5', 0xfff7d6],
      ['obsidienne', 'Obsidienne', 'legendaire', 0x23232f, 0xff7a3d, 0xc68642, 'rank:A', 0xff3d6e],
      ['seraphin', 'Séraphin', 'mythique', 0xffffff, 0xffd700, 0xffe9d6, 'rank:S', 0xffffff],
    ],
    Elementaliste: [
      ['marine', 'Bleu originel', 'commun', null, null, null, 'free'],
      ['braise', 'Braise', 'rare', 0x8a2a1f, 0xffb347, 0xffd9bd, 'gold:400', 0xff9a3d],
      ['sylve', 'Sylve', 'rare', 0x1f6b4a, 0xd9ffd9, 0xffd9bd, 'rank:D', 0x7dffb0],
      ['tempete', 'Tempête', 'epique', 0x3a2a7a, 0xffe14d, 0xffd9bd, 'ach:thunder_150', 0xffe14d],
      ['glacier', 'Glacier', 'epique', 0x7ac8ff, 0xffffff, 0xffe9d6, 'ach:ice_150', 0xffffff],
      ['prisme', 'Prisme', 'legendaire', 0x6a2cc0, 0xff7ad9, 0xffd9bd, 'rank:A', 0x00ffd0],
      ['cataclysme', 'Cataclysme', 'mythique', 0x14142a, 0xff3d6e, 0xffd9bd, 'rank:S', 0xff3d6e],
    ],
    Necromancien: [
      ['violet', 'Violet funèbre', 'commun', null, null, null, 'free'],
      ['vert', 'Flamme verte', 'rare', 0x2fd48a, null, null, 'gold:400'],
      ['sang', 'Rite de sang', 'rare', 0xd6336c, null, null, 'rank:D'],
      ['glace', 'Glace funèbre', 'epique', 0x46d4ff, null, null, 'ach:ice_150'],
      ['corbeau', 'Corbeau de peste', 'epique', 0x7ad84a, null, null, 'ach:cleared_6'],   // v6 : 7e skin du Nécromancien (nouvelle clé, aucune clé existante modifiée)
      ['or', 'Or noir', 'legendaire', 0xffc94a, null, null, 'rank:A'],
      ['roi', 'Roi blanc', 'mythique', 0xf2f0ff, null, null, 'rank:S'],
    ],
  };
  const SKINS = {};
  CLASS_ORDER.forEach((c) => {
    SKINS[c] = SKIN_TABLE[c].map((r, i) => {
      const it = { id: c + ':' + r[0], key: 's:' + c + ':' + r[0], kind: 'skin', classe: c, skinId: r[0], name: r[1], rarity: r[2], color: r[3], hair: r[4], skin: r[5], accent: r[7] == null ? null : r[7], cond: parseCond(r[6]), isDefault: i === 0 };
      // v6 : nom et description viennent de G.HeroDefs (CHAR-DESIGN.md) quand il est chargé ; sinon le nom du tableau
      try {
        const d = G.HeroDefs && G.HeroDefs.skins && (G.HeroDefs.skins(c) || []).find((x) => x.id === r[0]);
        if (d) { if (d.name) it.name = d.name; it.desc = d.desc || ''; }
      } catch (e) { /* ignore */ }
      if (it.desc == null) it.desc = '';
      return it;
    });
  });
  // [id, nom, rareté, couleur, niveau d'intensité, condition]
  const AURAS = [
    ['none', 'Aucune', 'commun', 0xffffff, 0, 'free'],
    ['braise', 'Braise', 'rare', 0xff7a2a, 2, 'gold:500'],
    ['sylve', 'Sylve', 'rare', 0x39e08c, 2, 'gold:500'],
    ['givre', 'Givre', 'rare', 0x7ad8ff, 2, 'ach:ice_150'],
    ['foudre', 'Foudre', 'rare', 0xffe14d, 2, 'ach:thunder_150'],
    ['sacre', 'Lumière sacrée', 'epique', 0xfff2a8, 3, 'ach:loot_leg_5'],
    ['ombre', 'Ombre', 'epique', 0x8b6bff, 3, 'rank:B'],
    ['sang', 'Sang', 'epique', 0xff3d6e, 3, 'ach:red_1'],
    ['or', 'Or royal', 'legendaire', 0xffc94a, 4, 'rank:A'],
    ['souverain', 'Souverain', 'mythique', 0xffd700, 5, 'rank:Z'],
    ['neant', 'Néant', 'secret', 0x00ffd0, 5, 'ach:necro'],
  ].map((r) => ({ id: r[0], key: 'a:' + r[0], kind: 'aura', name: r[1], rarity: r[2], color: r[3], level: r[4], cond: parseCond(r[5]) }));
  // [id, nom, rareté, c1, c2, forme, animé, condition]
  const FRAMES = [
    ['novice', 'Novice', 'commun', '#b8c0cc', '#6f7fa3', 'round', 0, 'free'],
    ['cuivre', 'Cuivre', 'commun', '#d08a4a', '#7a4a22', 'round', 0, 'gold:200'],
    ['eveille', 'Éveillé', 'rare', '#4fd17a', '#2a8a50', 'hex', 0, 'rank:D'],
    ['aguerri', 'Aguerri', 'rare', '#3fa9ff', '#1f6fc0', 'hex', 0, 'rank:C'],
    ['brasier', 'Brasier', 'rare', '#ff7a2a', '#ffcf40', 'round', 0, 'ach:fire_150'],
    ['givre', 'Givre', 'rare', '#7ad8ff', '#ffffff', 'round', 0, 'ach:ice_150'],
    ['foudre', 'Foudre', 'rare', '#ffe14d', '#46d4ff', 'round', 0, 'ach:thunder_150'],
    ['veteran', 'Vétéran', 'epique', '#b44dff', '#6a22b0', 'hex', 0, 'rank:B'],
    ['chasseur', 'Chasseur de boss', 'epique', '#ff3d6e', '#b44dff', 'round', 0, 'ach:boss_25'],
    ['elite', 'Élite', 'legendaire', '#ff8a1a', '#ffc94a', 'hex', 1, 'rank:A'],
    ['legende', 'Légende', 'mythique', '#ff3d3d', '#ff9a3d', 'hex', 1, 'rank:S'],
    ['souverain', 'Souverain', 'mythique', '#ffd700', '#fff4c0', 'hex', 1, 'rank:Z'],
    ['neant', 'Néant', 'secret', '#00ffd0', '#8b6bff', 'hex', 1, 'ach:necro'],
  ].map((r) => ({ id: r[0], key: 'f:' + r[0], kind: 'frame', name: r[1], rarity: r[2], c1: r[3], c2: r[4], shape: r[5], anim: !!r[6], cond: parseCond(r[7]) }));
  // [id, nom, rareté, dégradé, condition]
  const BANNERS = [
    ['aube', 'Aube', 'commun', 'linear-gradient(135deg,#18233f,#2b4a7a 55%,#46d4ff)', 'free'],
    ['crepuscule', 'Crépuscule', 'rare', 'linear-gradient(135deg,#2a1b4a,#8b6bff 60%,#ff7ab0)', 'level:10'],
    ['portail', 'Portail bleu', 'rare', 'radial-gradient(circle at 70% 40%,#46d4ff 0,#1f4a9a 38%,#0b1122 75%)', 'ach:win_10'],
    ['foret', 'Forêt', 'rare', 'linear-gradient(135deg,#0e2a1e,#1f6b4a 60%,#39e08c)', 'gold:400'],
    ['braise', 'Braise', 'rare', 'linear-gradient(135deg,#2a0f0a,#a8321a 60%,#ffb347)', 'gold:600'],
    ['givre', 'Givre', 'epique', 'linear-gradient(135deg,#0b1f33,#2a7ab0 60%,#d8f4ff)', 'ach:ice_150'],
    ['abysse', 'Abysses', 'epique', 'radial-gradient(circle at 25% 70%,#00ffd0 0,#1b2558 40%,#05070f 80%)', 'ach:cleared_6'],
    ['breche', 'Brèche rouge', 'epique', 'linear-gradient(135deg,#1a0509,#7a1020 55%,#ff3d6e)', 'ach:red_1'],
    ['couronne', 'Couronne dorée', 'legendaire', 'linear-gradient(135deg,#2a1d05,#a8741a 55%,#ffd24a)', 'boss:40'],
    ['legende', 'Légende', 'mythique', 'linear-gradient(135deg,#200808,#ff3d3d 55%,#ffd24a)', 'rank:S'],
    ['souverain', 'Souverain', 'mythique', 'linear-gradient(120deg,#1a1405,#ffd700 45%,#fff4c0 55%,#a8741a)', 'rank:Z'],
    ['neant', 'Néant', 'secret', 'radial-gradient(circle at 50% 120%,#00ffd0 0,#0b3a33 35%,#000 75%)', 'ach:necro'],
  ].map((r) => ({ id: r[0], key: 'b:' + r[0], kind: 'banner', name: r[1], rarity: r[2], bg: r[3], cond: parseCond(r[4]) }));

  const byId = (arr, id) => arr.find((x) => x.id === id) || null;
  const ALL_ITEMS = () => [].concat(...CLASS_ORDER.map((c) => SKINS[c]), AURAS, FRAMES, BANNERS);

  // ------------------------------------------------------------------
  //  PROFIL & CONDITIONS
  // ------------------------------------------------------------------
  const curProfile = () => (G.game && G.game.profile) || null;
  function ensureProfile(p) {
    if (!p) return p;
    const c = (p.cosmetics = p.cosmetics && typeof p.cosmetics === 'object' ? p.cosmetics : {});
    if (!c.skin || typeof c.skin !== 'object') c.skin = {};
    if (typeof c.aura !== 'string') c.aura = 'none';
    if (typeof c.frame !== 'string') c.frame = 'novice';
    if (typeof c.banner !== 'string') c.banner = 'aube';
    if (!c.unlocked || typeof c.unlocked !== 'object') c.unlocked = {};
    return p;
  }
  function rankIdx(r) { try { if (G.Ranks && G.Ranks.index) { const i = G.Ranks.index(r); if (i >= 0) return i; } } catch (e) { /* ignore */ } return Math.max(0, RANK_ORDER.indexOf(String(r || 'E'))); }
  const bossesOf = (p) => Math.max(num(p.stats && p.stats.bosses, 0), num(p.counters && p.counters.bossKills, 0));
  const achDef = (id) => (G.ACHIEVEMENTS || []).find((a) => a.id === id) || null;
  const rankName = (r) => { const d = (G.RANKS || []).find((x) => x.id === r); return d ? d.name : 'Rang ' + r; };

  /** { met:bool, buyable:bool, text, progress? } : la condition est-elle remplie ? */
  function condInfo(p, cond) {
    const c = cond || { t: 'free' };
    switch (c.t) {
      case 'free': return { met: true, text: 'Gratuit' };
      case 'gold': return { met: false, buyable: true, cost: c.cost, text: 'Acheter : ' + c.cost + ' or' };
      case 'rank': return { met: rankIdx(p.rank) >= rankIdx(c.rank), text: 'Atteindre le ' + rankName(c.rank) };
      case 'level': return { met: num(p.niveau, 1) >= c.n, text: 'Atteindre le niveau ' + c.n, progress: Math.min(c.n, num(p.niveau, 1)) + '/' + c.n };
      case 'boss': { const b = bossesOf(p); return { met: b >= c.n, text: 'Vaincre ' + c.n + ' boss', progress: Math.min(c.n, b) + '/' + c.n }; }
      case 'ach': {
        const a = achDef(c.id); const done = !!(p.achievements && p.achievements[c.id]);
        const secret = a && a.secret && !done;
        return { met: done, text: secret ? 'Succès secret' : 'Succès : ' + (a ? a.name : c.id) };
      }
      default: return { met: false, text: '?' };
    }
  }
  const isUnlocked = (p, item) => !!(p.cosmetics && p.cosmetics.unlocked && p.cosmetics.unlocked[item.key]);
  function evaluate(p, silent) {
    if (!p) return [];
    if (!p.cosmetics) silent = true;   // première initialisation : migration silencieuse (pas de rafale de notifications)
    ensureProfile(p);
    const fresh = [];
    ALL_ITEMS().forEach((it) => {
      if (isUnlocked(p, it)) return;
      const ci = condInfo(p, it.cond);
      if (ci.met) { p.cosmetics.unlocked[it.key] = true; fresh.push(it); }
    });
    if (fresh.length) {
      if (!silent) announce(fresh);
      persist();
      emitBus('cosmeticsUnlocked', { items: fresh.map((i) => i.key) });
    }
    return fresh;
  }
  function announce(list) {
    const cl = (curProfile() || {}).classe;
    const shown = list.filter((i) => !i.isDefault && !(i.cond.t === 'free') && (i.kind !== 'skin' || i.classe === cl)).sort((a, b) => rarRank(b.rarity) - rarRank(a.rarity));
    shown.slice(0, 3).forEach((it) => {
      const what = { skin: 'Skin', aura: 'Aura', frame: 'Cadre', banner: 'Bannière' }[it.kind];
      try { G.UI && G.UI.notify && G.UI.notify({ text: what + ' débloqué : ' + it.name, rarity: it.rarity, icon: '🎨' }); } catch (e) { /* ignore */ }
    });
    if (shown.length > 3) { try { G.UI && G.UI.notify && G.UI.notify({ text: '…et ' + (shown.length - 3) + ' autres cosmétiques (onglet Perso)', rarity: 'rare', icon: '🎨' }); } catch (e) { /* ignore */ } }
  }
  const rarRank = (r) => ['commun', 'rare', 'epique', 'legendaire', 'mythique', 'secret'].indexOf(r);
  function persist() { try { if (G.game && G.game.saveProfile) G.game.saveProfile(); } catch (e) { /* ignore */ } }
  function emitBus(ev, d) { try { G.bus && G.bus.emit(ev, d); } catch (e) { /* ignore */ } }

  function status(p, item) {
    ensureProfile(p);
    const c = p.cosmetics, un = isUnlocked(p, item);
    let eq = false;
    if (item.kind === 'skin') eq = skinFor(p, item.classe).id === item.id;
    else if (item.kind === 'aura') eq = c.aura === item.id;
    else if (item.kind === 'frame') eq = c.frame === item.id;
    else if (item.kind === 'banner') eq = c.banner === item.id;
    const ci = condInfo(p, item.cond);
    return { unlocked: un, equipped: eq, cond: ci, buyable: !un && !!ci.buyable, affordable: !un && ci.buyable && num(p.gold, 0) >= ci.cost };
  }
  function skinFor(p, classe) {
    ensureProfile(p);
    const list = SKINS[classe] || [];
    const id = p.cosmetics.skin[classe];
    const it = id && list.find((s) => s.id === id);
    if (it && isUnlocked(p, it)) return it;
    return list[0] || { id: classe + ':default', color: null, hair: null, skin: null, accent: null, isDefault: true };
  }
  const find = (kind, id) => (kind === 'aura' ? byId(AURAS, id) : kind === 'frame' ? byId(FRAMES, id) : kind === 'banner' ? byId(BANNERS, id) : ALL_ITEMS().find((x) => x.kind === 'skin' && x.id === id) || null);

  function equip(p, kind, id) {
    ensureProfile(p);
    if (kind === 'title') {
      let ok = false;
      if (id !== null && (!p.titles || p.titles.indexOf(id) < 0)) return { ok: false, reason: 'Titre non obtenu.' };
      if (G.Progress && G.Progress.equipTitle) ok = G.Progress.equipTitle(p, id);
      else { p.activeTitle = id; p.titleChosen = true; ok = true; persist(); }
      return { ok: !!ok };
    }
    const it = find(kind, id);
    if (!it) return { ok: false, reason: 'Cosmétique inconnu.' };
    if (!isUnlocked(p, it)) return { ok: false, reason: 'Non débloqué.' };
    if (kind === 'skin') p.cosmetics.skin[it.classe] = it.id;
    else p.cosmetics[kind] = it.id;
    persist();
    emitBus('cosmeticEquipped', { kind, id });
    return { ok: true };
  }
  function buy(p, kind, id) {
    ensureProfile(p);
    const it = find(kind, id);
    if (!it) return { ok: false, reason: 'Cosmétique inconnu.' };
    if (isUnlocked(p, it)) return { ok: true, already: true };
    if (it.cond.t !== 'gold') return { ok: false, reason: 'Ne s’achète pas.' };
    if (num(p.gold, 0) < it.cond.cost) return { ok: false, reason: 'Or insuffisant.' };
    p.gold -= it.cond.cost;
    p.cosmetics.unlocked[it.key] = true;
    persist();
    return { ok: true };
  }

  // ------------------------------------------------------------------
  //  APPLICATION EN JEU
  // ------------------------------------------------------------------
  /** options pour G.GFX.makeHero : skinId + rarity (v6, G.HeroDefs.resolve), puis les anciens champs couleur (repli v5) */
  function heroOptionsFor(classe, skin) {
    const o = {}, m = MODEL[classe] || {};
    if (!skin) return o;
    const sid = skin.skinId || (typeof skin.id === 'string' ? skin.id.slice(skin.id.lastIndexOf(':') + 1) : null);
    if (sid) o.skinId = sid;
    if (skin.rarity) o.rarity = skin.rarity;
    if (skin.isDefault) return o;
    if (skin.accent != null) o.accent = skin.accent;
    if (skin.color != null && m.native) o.color = skin.color;
    if (skin.hair != null && m.hair) o.hair = skin.hair;
    if (skin.skin != null && m.skin) o.skin = skin.skin;
    return o;
  }
  if (G.hooks && G.hooks.add) {
    G.hooks.add('heroOptions', (opts, ctx) => {
      try {
        const p = (ctx && ctx.profile) || curProfile(); if (!p) return opts;
        const classe = (ctx && ctx.classe) || p.classe;
        return Object.assign({}, opts || {}, heroOptionsFor(classe, skinFor(p, classe)));
      } catch (e) { return opts; }
    }, 0);
  }

  // Teinte des modèles qui ignorent opts.color : on recolore les couleurs de sommet d'origine (sur des géométries CLONÉES)
  const _clones = new WeakMap();    // hero -> [geometries clonées]
  function applyTint(hero, classe, skin) {
    const m = MODEL[classe];
    if (!hero || !m || !m.src || !skin || skin.isDefault || skin.color == null) return 0;
    if (hero.userData && hero.userData.hero6) return 0;   // v6 : le skin est construit par G.HeroDefs/HeroOutfits, pas de recoloration après coup
    const maps = [];
    m.src.forEach((s) => maps.push([s[0], shade(skin.color, s[1])]));
    if (skin.accent != null) (m.acc || []).forEach((s) => maps.push([s[0], shade(skin.accent, s[1])]));
    const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
    const M = maps.map((x) => ({ s: rgb(x[0]), t: rgb(x[1]) }));
    const T = window.THREE; let n = 0; const made = [];
    const cache = new Map();   // géométrie d'origine -> clone teinté (partagée entre pièces)
    try {
      hero.traverse((o) => {
        const g = o && o.geometry;
        if (!g || !g.attributes || !g.attributes.color) return;
        let ng = cache.get(g);
        if (!ng) {
          const src = g.attributes.color.array, arr = new Float32Array(src.length); let changed = false;
          for (let i = 0; i < src.length; i += 3) {
            const r = src[i], gg = src[i + 1], b = src[i + 2]; let out = null;
            for (let k = 0; k < M.length; k++) { const s = M[k].s; if (Math.abs(r - s[0]) < 0.012 && Math.abs(gg - s[1]) < 0.012 && Math.abs(b - s[2]) < 0.012) { out = M[k].t; break; } }
            if (out) { arr[i] = out[0]; arr[i + 1] = out[1]; arr[i + 2] = out[2]; changed = true; } else { arr[i] = r; arr[i + 1] = gg; arr[i + 2] = b; }
          }
          if (!changed) { cache.set(g, g); ng = g; } else {
            ng = g.clone();
            ng.setAttribute('color', new T.BufferAttribute(arr, 3));
            made.push(ng); cache.set(g, ng);
          }
        }
        if (ng !== g) { o.geometry = ng; n++; }
      });
    } catch (e) { if (typeof console !== 'undefined') console.warn('[cosmetics] teinte impossible', e); }
    if (made.length) { const prev = _clones.get(hero) || []; _clones.set(hero, prev.concat(made)); }
    return n;
  }
  function releaseTint(hero) { const l = hero && _clones.get(hero); if (l) { l.forEach((g) => { try { g.dispose && g.dispose(); } catch (e) { /* ignore */ } }); _clones.delete(hero); } }
  let _lastHero = null;
  G.bus && G.bus.on('heroCreated', (d) => {
    try {
      if (!d || !d.hero) return;
      const p = d.profile || curProfile(); if (!p) return;
      ensureProfile(p);
      if (_lastHero && _lastHero !== d.hero) releaseTint(_lastHero);
      _lastHero = d.hero;
      applyTint(d.hero, d.classe || p.classe, skinFor(p, d.classe || p.classe));
    } catch (e) { if (typeof console !== 'undefined') console.warn('[cosmetics] heroCreated', e); }
  });
  // aura : le héros est dans la scène au runStart (pas au heroCreated)
  let _aura = null;
  function clearAura() { if (_aura) { try { _aura.remove && _aura.remove(); } catch (e) { /* ignore */ } _aura = null; } }
  G.bus && G.bus.on('runStart', (d) => {
    clearAura();
    try {
      const p = curProfile(); if (!p) return; ensureProfile(p);
      const a = byId(AURAS, p.cosmetics.aura); if (!a || a.id === 'none' || !isUnlocked(p, a)) return;
      let hero = null;
      try { hero = (d && d.run && d.run.player && d.run.player.hero) || (G.SkillAPI && G.SkillAPI.player && G.SkillAPI.player().hero); } catch (e) { /* ignore */ }
      if (!hero || !G.VFX || !G.VFX.aura) return;
      _aura = G.VFX.aura(hero, a.color, Infinity, { level: a.level, radius: 0.95 + a.level * 0.06, height: 2 + a.level * 0.2 });
    } catch (e) { if (typeof console !== 'undefined') console.warn('[cosmetics] aura', e); }
  });
  G.bus && G.bus.on('runEnd', () => { clearAura(); if (_lastHero) { releaseTint(_lastHero); _lastHero = null; } try { const p = curProfile(); if (p) evaluate(p); } catch (e) { /* ignore */ } });
  // déblocages : le rang, les succès (poussés par progression.js au fil des évènements), les boss
  G.bus && G.bus.on('rankUp', (d) => { try { evaluate((d && d.profile) || curProfile()); } catch (e) { /* ignore */ } });
  G.bus && G.bus.on('roomCleared', () => { try { const p = curProfile(); if (p) evaluate(p); } catch (e) { /* ignore */ } });
  G.bus && G.bus.on('profileChanged', (d) => { try { evaluate((d && d.profile) || curProfile()); } catch (e) { /* ignore */ } });

  // ------------------------------------------------------------------
  //  CSS (préfixe .cos-) : cadres / bannières générés depuis le catalogue ; le reste utilise ds-*
  // ------------------------------------------------------------------
  function injectCSS() {
    if (document.getElementById('cos-style')) return;
    let h = `
@property --cos-a{syntax:'<angle>';inherits:false;initial-value:0deg}
.cos-wrap{display:flex;flex-direction:column;gap:var(--ds-gap,12px);padding-bottom:84px;color:var(--ds-text,#e8f0ff)}
.cos-hero{position:relative;border-radius:var(--ds-r-lg,16px);overflow:hidden;border:1px solid var(--ds-line,rgba(130,180,255,.16));background:#0b1122}
.cos-hero__bg{position:absolute;inset:0;opacity:.9;transition:background .4s}
.cos-hero__bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,9,18,.15),rgba(6,9,18,.78))}
.cos-stage{position:relative;height:216px}
.cos-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.cos-fallback{position:absolute;inset:0;display:grid;place-items:center;font-size:84px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.5))}
.cos-id{position:relative;display:flex;align-items:center;gap:12px;padding:10px 14px 14px}
.cos-id__txt{min-width:0;flex:1}
.cos-id__name{font:700 18px/1.1 var(--ds-font-display,'Chakra Petch',sans-serif);letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 6px rgba(0,0,0,.6)}
.cos-id__title{font:700 13px/1.3 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-gold,#ffc94a);text-shadow:0 1px 4px rgba(0,0,0,.7)}
.cos-id__sub{font:600 11px/1.3 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-text-2,#a9b8d6)}
.cos-frame{--fc:#b8c0cc;--fc2:#6f7fa3;--sz:56px;display:inline-grid;flex:none;width:var(--sz);height:var(--sz);padding:3px;border-radius:50%;background:conic-gradient(from var(--cos-a),var(--fc),var(--fc2),var(--fc));box-shadow:0 0 14px color-mix(in srgb,var(--fc) 55%,transparent)}
.cos-frame--hex,.cos-frame--hex .cos-frame__in{clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);border-radius:0;box-shadow:none}
.cos-frame--anim{animation:cos-spin 5s linear infinite}
@keyframes cos-spin{to{--cos-a:360deg}}
.cos-frame__in{display:grid;place-items:center;border-radius:50%;background:var(--ds-bg-1,#0b1122);font-size:calc(var(--sz) * .5);line-height:1}
.cos-tabs{overflow-x:auto;scrollbar-width:none}
.cos-tabs::-webkit-scrollbar{display:none}
.cos-tabs .ds-tab{white-space:nowrap;padding-left:10px;padding-right:10px;font-size:12px;letter-spacing:.03em}
.cos-hint{font:600 12px/1.4 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-text-2,#a9b8d6);margin:0}
.cos-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cos-card{position:relative;display:flex;flex-direction:column;gap:6px;text-align:left;cursor:pointer;min-width:0;padding:10px;color:inherit;font:inherit;border:1px solid color-mix(in srgb,var(--c,#b8c0cc) 40%,transparent);background:var(--ds-glass,rgba(13,20,40,.78));border-radius:var(--ds-r-md,10px);transition:transform var(--ds-fast,120ms),box-shadow var(--ds-med,220ms),border-color var(--ds-med,220ms)}
.cos-card:hover{transform:translateY(-2px);box-shadow:0 0 0 1px var(--c),0 6px 18px color-mix(in srgb,var(--c) 30%,transparent)}
.cos-card.is-selected{box-shadow:0 0 0 2px var(--c),0 0 20px color-mix(in srgb,var(--c) 45%,transparent)}
.cos-card.is-locked .cos-media{filter:saturate(.35) brightness(.7)}
.cos-card:focus-visible{outline:2px solid var(--ds-accent,#46d4ff);outline-offset:2px}
.cos-media{height:64px;border-radius:var(--ds-r-sm,6px);display:grid;place-items:center;position:relative;overflow:hidden;background:rgba(255,255,255,.04)}
.cos-sw{display:flex;align-items:center;gap:6px}
.cos-dot{width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.35);box-shadow:0 2px 6px rgba(0,0,0,.45)}
.cos-dot.s{width:18px;height:18px}
.cos-dot.def{background:conic-gradient(#3d7cff,#9147e6,#2fb551,#3d7cff)}
.cos-orb{width:44px;height:44px;border-radius:50%;box-shadow:0 0 18px var(--oc),inset 0 0 12px var(--oc);border:2px solid var(--oc);background:radial-gradient(circle,transparent 45%,color-mix(in srgb,var(--oc) 35%,transparent))}
.cos-ttl{font:700 13px/1.2 var(--ds-font-display,'Chakra Petch',sans-serif);letter-spacing:.03em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cos-meta{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;font:700 11px/1.3 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-text-2,#a9b8d6)}
.cos-rar{color:var(--c);text-transform:uppercase;letter-spacing:.06em;font-size:10px}
.cos-st{display:flex;align-items:center;gap:4px;font:600 11px/1.3 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-text-2,#a9b8d6)}
.cos-st svg{flex:none}
.cos-st.ok{color:var(--ds-success,#39e08c)}
.cos-st.eq{color:var(--ds-accent,#46d4ff)}
.cos-badge{position:absolute;top:6px;right:6px;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(6,9,18,.8);color:var(--ds-text-2,#a9b8d6)}
.cos-card.is-equipped .cos-badge{color:var(--ds-bg-0,#060912);background:var(--ds-accent,#46d4ff)}
.cos-action{position:sticky;bottom:0;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 12px;margin:0 -2px;border-radius:var(--ds-r-md,10px);border:1px solid var(--ds-line-strong,rgba(130,200,255,.36));background:var(--ds-glass-strong,rgba(9,14,30,.92));backdrop-filter:blur(8px);box-shadow:var(--ds-shadow-2,0 12px 40px rgba(0,0,0,.55))}
.cos-action__txt{flex:1;min-width:0}
.cos-action__name{font:700 14px/1.2 var(--ds-font-display,'Chakra Petch',sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cos-action__sub{font:600 11px/1.3 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-text-2,#a9b8d6)}
.cos-action .ds-btn{flex:none;min-width:112px}
.cos-flash{position:absolute;inset:0;pointer-events:none;z-index:3;background:radial-gradient(circle at 50% 55%,var(--fx,#fff) 0,transparent 62%);opacity:0;animation:cos-flash .7s var(--ds-ease,ease-out)}
@keyframes cos-flash{0%{opacity:.95;transform:scale(.6)}100%{opacity:0;transform:scale(1.5)}}
.cos-spark{position:absolute;left:50%;top:60%;width:6px;height:6px;border-radius:50%;background:var(--fx,#fff);box-shadow:0 0 8px var(--fx,#fff);pointer-events:none;z-index:4;opacity:0;animation:cos-spark .9s var(--ds-ease,ease-out) forwards}
@keyframes cos-spark{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.2)}}
.cos-titles{display:flex;flex-direction:column;gap:8px}
.cos-title{display:flex;align-items:center;gap:10px;text-align:left;width:100%;padding:10px 12px;color:inherit;font:inherit;cursor:pointer;border-radius:var(--ds-r-md,10px);border:1px solid var(--ds-line,rgba(130,180,255,.16));background:var(--ds-glass,rgba(13,20,40,.78))}
.cos-title.is-selected{border-color:var(--ds-accent,#46d4ff);box-shadow:var(--ds-glow,0 0 0 1px rgba(130,200,255,.36))}
.cos-title.is-locked{opacity:.6}
.cos-title__n{font:700 14px/1.2 var(--ds-font-display,'Chakra Petch',sans-serif)}
.cos-title__d{font:600 11px/1.3 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-text-2,#a9b8d6)}
.cos-title__bonus{font:700 11px/1.3 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-success,#39e08c)}
.cos-count{font:700 11px/1 var(--ds-font-body,Nunito,sans-serif);color:var(--ds-text-3,#6f7fa3);margin-left:6px}
/* secours si ds.css n'est pas chargé (spécificité nulle : ds.css l'emporte toujours) */
:where(.cos-tabs){display:flex;gap:4px;border-bottom:1px solid rgba(130,180,255,.16)}
:where(.cos-tabs .ds-tab){display:inline-flex;align-items:center;gap:6px;flex:none;min-height:44px;padding:0 14px;background:none;border:0;border-bottom:2px solid transparent;color:#a9b8d6;font:700 13px/1 'Chakra Petch',sans-serif;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}
:where(.cos-tabs .ds-tab.is-active){color:#46d4ff;border-bottom-color:#46d4ff}
:where(.cos-action .ds-btn){min-height:44px;padding:0 16px;border-radius:8px;border:1px solid rgba(130,200,255,.36);background:rgba(17,26,51,.9);color:#e8f0ff;font:700 13px/1 'Chakra Petch',sans-serif;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
:where(.cos-action .ds-btn--primary){background:#46d4ff;border-color:#46d4ff;color:#04101c}
:where(.cos-action .ds-btn--gold){background:#ffc94a;border-color:#ffc94a;color:#2a1a00}
:where(.cos-action .ds-btn[disabled]){opacity:.55;cursor:default}
@media (min-width:700px){.cos-wrap{display:grid;grid-template-columns:340px 1fr;align-items:start;column-gap:16px;padding-bottom:84px}.cos-hero{grid-row:1 / span 3;position:sticky;top:0}.cos-stage{height:300px}.cos-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.cos-action{grid-column:2}}
@media (prefers-reduced-motion:reduce){.cos-frame--anim{animation:none}.cos-flash,.cos-spark{animation-duration:.01s}}
`;
    FRAMES.forEach((f) => { h += '.cos-frame--' + f.id + '{--fc:' + f.c1 + ';--fc2:' + f.c2 + '}\n'; });
    BANNERS.forEach((b) => { h += '.cos-banner--' + b.id + '{background:' + b.bg + '}\n'; });
    const st = document.createElement('style'); st.id = 'cos-style'; st.textContent = h; document.head.appendChild(st);
  }

  // ------------------------------------------------------------------
  //  AIDES D'AFFICHAGE (réutilisables par le camp / la sélection)
  // ------------------------------------------------------------------
  function frameHtml(frameId, content, size) {
    const f = byId(FRAMES, frameId) || FRAMES[0];
    return '<span class="cos-frame cos-frame--' + f.id + (f.shape === 'hex' ? ' cos-frame--hex' : '') + (f.anim ? ' cos-frame--anim' : '') + '" style="--sz:' + (size || 56) + 'px"><span class="cos-frame__in">' + (content == null ? '' : content) + '</span></span>';
  }
  function titleName(p) { const t = p && p.activeTitle && (G.TITLES || []).find((x) => x.id === p.activeTitle); return t ? t.name : ''; }
  function classIcon(c) { return (G.CLASSES && G.CLASSES[c] && G.CLASSES[c].icon) || '⚔️'; }

  // ------------------------------------------------------------------
  //  APERÇU 3D (renderer dédié, persistant d'un rendu à l'autre du panneau)
  // ------------------------------------------------------------------
  let ST = null;
  function stageCreate() {
    const T = window.THREE;
    const el = document.createElement('div'); el.className = 'cos-stage';
    const S = { el, r: null, scene: null, cam: null, hero: null, ring: null, parts: [], raf: 0, last: 0, gone: 0, hidden: 0, look: null, w: 0, h: 0, dead: false, auraColor: null, auraLevel: 0, auraObj: [] };
    try {
      if (!T || !T.WebGLRenderer || !G.GFX || !G.GFX.makeHero) throw new Error('no3d');
      const cv = document.createElement('canvas'); el.appendChild(cv);
      const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setClearColor(0x000000, 0);
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(28, 1, 0.1, 60);
      scene.add(new T.HemisphereLight(0xffffff, 0x4a3a7a, 1.0));
      const d = new T.DirectionalLight(0xffffff, 0.9); d.position.set(2, 4, 3); scene.add(d);
      const rim = new T.DirectionalLight(0x6fb8ff, 0.5); rim.position.set(-3, 2, -3); scene.add(rim);
      cam.position.set(0, 1.35, 6.6); cam.lookAt(0, 1.0, 0);
      S.r = r; S.scene = scene; S.cam = cam;
    } catch (e) {
      S.r = null; const fb = document.createElement('div'); fb.className = 'cos-fallback'; el.appendChild(fb); S.fb = fb;
    }
    S.raf = requestAnimationFrame((t) => stageFrame(S, t));
    return S;
  }
  function stageDestroy(S) {
    if (!S || S.dead) return; S.dead = true;
    try { cancelAnimationFrame(S.raf); } catch (e) { /* ignore */ }
    try { if (S.hero) { S.scene && S.scene.remove(S.hero); releaseTint(S.hero); } } catch (e) { /* ignore */ }
    try { S.auraObj.forEach((o) => { S.scene.remove(o); o.geometry && o.geometry.dispose && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); }); } catch (e) { /* ignore */ }
    try { if (S.r) { S.r.dispose && S.r.dispose(); S.r.forceContextLoss && S.r.forceContextLoss(); } } catch (e) { /* ignore */ }
    try { S.el.remove(); } catch (e) { /* ignore */ }
    if (ST === S) ST = null;
  }
  function stageFrame(S, ts) {
    if (S.dead) return;
    S.raf = requestAnimationFrame((t) => stageFrame(S, t));
    // retiré du DOM (re-rendu du panneau, autre onglet, retour en donjon) => on attend un peu, puis on libère
    if (!S.el.isConnected) { if (++S.gone > 20) stageDestroy(S); return; } S.gone = 0;
    if (S.el.offsetParent === null) { if (++S.hidden > 300) stageDestroy(S); return; } S.hidden = 0;
    const dt = Math.min(0.05, S.last ? (ts - S.last) / 1000 : 0.016); S.last = ts;
    if (!S.r) return;
    const w = S.el.clientWidth, h = S.el.clientHeight;
    if (w && h && (w !== S.w || h !== S.h)) { S.w = w; S.h = h; S.r.setSize(w, h, false); S.cam.aspect = w / h; S.cam.updateProjectionMatrix(); }
    if (S.hero) S.hero.rotation.y += dt * 0.8;
    const t = ts / 1000;
    S.auraObj.forEach((o, i) => {
      if (o.userData.ring) { o.rotation.z += dt * 0.8; const k = 1 + 0.06 * Math.sin(t * 4); o.scale.set(k, k, 1); }
      else if (o.userData.p) { const u = (t * 0.5 + o.userData.p) % 1; o.position.y = 0.1 + u * 2.2; o.material.opacity = 0.9 * (1 - u); const a = t * 1.5 + i; o.position.x = Math.cos(a) * o.userData.rad; o.position.z = Math.sin(a) * o.userData.rad; }
    });
    try { S.r.render(S.scene, S.cam); } catch (e) { if (!S.warned) { S.warned = true; console.warn('[cosmetics] render', e); } }
  }
  /** look = { classe, skin (item), aura (item) } */
  function stageSet(S, look) {
    const key = look.classe + '|' + (look.skin ? look.skin.id : '') + '|' + (look.aura ? look.aura.id : '');
    if (S.look === key) return; S.look = key;
    const T = window.THREE;
    if (S.fb) { S.fb.textContent = classIcon(look.classe); return; }
    if (!S.scene) return;
    const heroKey = look.classe + '|' + (look.skin ? look.skin.id : '');
    if (S.heroKey !== heroKey) {
      S.heroKey = heroKey;
      const ry = S.hero ? S.hero.rotation.y : 0;
      if (S.hero) { S.scene.remove(S.hero); releaseTint(S.hero); }
      try {
        const opts = heroOptionsFor(look.classe, look.skin);
        const hero = G.GFX.makeHero(look.classe, opts);
        if (hero) { applyTint(hero, look.classe, look.skin); hero.rotation.y = ry; S.scene.add(hero); S.hero = hero; }
      } catch (e) { console.warn('[cosmetics] aperçu', e); S.hero = null; }
    }
    const akey = look.aura ? look.aura.id : '';
    if (S.auraId !== akey) {
      S.auraId = akey;
      S.auraObj.forEach((o) => { S.scene.remove(o); o.geometry && o.geometry.dispose && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); }); S.auraObj = [];
      if (look.aura && look.aura.id !== 'none') {
        try {
          const col = look.aura.color, lv = look.aura.level;
          const ring = new T.Mesh(new T.RingGeometry(0.85, 0.97 + lv * 0.04, 40), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.userData.ring = true; S.scene.add(ring); S.auraObj.push(ring);
          for (let i = 0; i < 6 + lv * 3; i++) {
            const m = new T.Mesh(new T.SphereGeometry(0.05 + lv * 0.008, 6, 5), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
            m.userData.p = i / (6 + lv * 3); m.userData.rad = 0.55 + (i % 3) * 0.2; S.scene.add(m); S.auraObj.push(m);
          }
        } catch (e) { /* aperçu d'aura facultatif */ }
      }
    }
  }

  // ------------------------------------------------------------------
  //  PANNEAU « PERSONNALISATION »
  // ------------------------------------------------------------------
  const memo = { tab: 'skin', sel: {}, flash: null };
  const TABS = [['skin', 'Skins', 'shirt'], ['aura', 'Auras', 'sparkles'], ['frame', 'Cadres', 'user'], ['banner', 'Bannières', 'flag'], ['title', 'Titres', 'crown']];

  function itemsOf(kind, p) { return kind === 'skin' ? (SKINS[p.classe] || []) : kind === 'aura' ? AURAS : kind === 'frame' ? FRAMES : BANNERS; }
  const equippedId = (p, kind) => (kind === 'skin' ? skinFor(p, p.classe).id : kind === 'title' ? p.activeTitle : p.cosmetics[kind]);

  function mediaHtml(it) {
    if (it.kind === 'skin') {
      const m = MODEL[it.classe] || {};
      if (it.isDefault) return '<div class="cos-sw"><span class="cos-dot def"></span></div>';
      return '<div class="cos-sw"><span class="cos-dot" style="background:' + css(it.color != null ? it.color : 0x888888) + '"></span>' +
        (m.hair && it.hair != null ? '<span class="cos-dot s" style="background:' + css(it.hair) + '"></span>' : '') +
        (m.skin && it.skin != null ? '<span class="cos-dot s" style="background:' + css(it.skin) + '"></span>' : '') +
        (it.accent != null ? '<span class="cos-dot s" style="background:' + css(it.accent) + '"></span>' : '') + '</div>';
    }
    if (it.kind === 'aura') return it.id === 'none' ? '<span class="cos-st">' + ico('close', '✕', 22) + '</span>' : '<span class="cos-orb" style="--oc:' + css(it.color) + '"></span>';
    if (it.kind === 'frame') return frameHtml(it.id, classIcon(curProfile() && curProfile().classe), 48);
    if (it.kind === 'banner') return '<div class="cos-banner--' + it.id + '" style="position:absolute;inset:0"></div>';
    return '';
  }
  function cardHtml(it, p, sel, ix) {
    const s = status(p, it), rar = it.rarity;
    let st;
    if (s.equipped) st = '<span class="cos-st eq">' + ico('check', '✓', 14) + 'Équipé</span>';
    else if (s.unlocked) st = '<span class="cos-st ok">' + ico('unlock', '', 14) + 'Débloqué</span>';
    else {
      const c = s.cond;
      st = '<span class="cos-st">' + ico('lock', '🔒', 14) + '<span>' + esc(c.text) + (c.progress ? ' (' + c.progress + ')' : '') + '</span></span>';
    }
    return '<button type="button" class="ds-card cos-card' + (sel === it.id ? ' is-selected' : '') + (s.unlocked ? '' : ' is-locked') + (s.equipped ? ' is-equipped' : '') + '" data-id="' + esc(it.id) + '"' + (it.desc ? ' title="' + esc(it.desc) + '"' : '') + ' style="--c:' + RARITY_HEX[rar] + ';--i:' + ix + '" aria-pressed="' + (sel === it.id) + '">' +
      '<div class="ds-card__media cos-media">' + mediaHtml(it) + '</div>' +
      '<div class="ds-card__title cos-ttl">' + esc(it.name) + '</div>' +
      '<div class="ds-card__meta cos-meta"><span class="cos-rar">' + RARITY_NAMES[rar] + '</span></div>' + st +
      (s.unlocked ? '' : '<span class="cos-badge">' + ico('lock', '🔒', 12) + '</span>') + (s.equipped ? '<span class="cos-badge">' + ico('check', '✓', 12) + '</span>' : '') + '</button>';
  }
  const BONUS_LBL = { pvMult: 'PV', dmg: 'dégâts', crit: 'critique', critDmg: 'dégâts crit.', defense: 'défense', vitesse: 'vitesse', cdr: 'récup.', dodge: 'esquive', lifesteal: 'vol de vie', xpMult: 'XP', goldMult: 'or', lootLuck: 'butin', minionDmg: 'serviteurs' };
  function bonusText(b) { return Object.keys(b || {}).map((k) => { const v = b[k]; const pct = ['defense'].indexOf(k) < 0; return '+' + (pct ? Math.round(v * 1000) / 10 + ' %' : v) + ' ' + (BONUS_LBL[k] || k); }).join(', '); }
  function titlesHtml(p, sel) {
    const all = G.TITLES || [];
    let h = '<div class="cos-titles">';
    const row = (id, name, desc, owned, bonus, ix) => '<button type="button" class="cos-title' + (sel === id ? ' is-selected' : '') + (owned ? '' : ' is-locked') + '" data-id="' + esc(id == null ? '' : id) + '" style="--i:' + ix + '"><span class="cos-st ' + (p.activeTitle === id ? 'eq' : '') + '">' + (owned ? ico(p.activeTitle === id ? 'check' : 'crown', '★', 18) : ico('lock', '🔒', 18)) + '</span><span style="min-width:0;flex:1"><div class="cos-title__n">' + esc(name) + '</div><div class="cos-title__d">' + esc(desc) + '</div>' + (bonus ? '<div class="cos-title__bonus">' + esc(bonus) + '</div>' : '') + '</span></button>';
    h += row(null, '(Aucun titre)', 'Ne pas afficher de titre.', true, '', 0);
    all.forEach((t, i) => { h += row(t.id, t.name, t.desc, p.titles && p.titles.indexOf(t.id) >= 0, bonusText(t.bonus), i + 1); });
    return h + '</div>';
  }

  function render(container, profile) {
    injectCSS();
    const p = profile || curProfile() || {};
    ensureProfile(p); evaluate(p, true);
    const classe = p.classe || 'Guerrier';
    const S = { container, p, classe };
    container._cos = S;
    if (memo.cls !== classe) { memo.cls = classe; memo.sel = {}; }
    container.className = (container.className ? container.className + ' ' : '') + 'cos-root';
    container.innerHTML =
      '<div class="cos-wrap ds-anim-in">' +
      '<div class="cos-hero"><div class="cos-hero__bg" data-r="bg"></div><div data-r="stage"></div>' +
      '<div class="cos-id"><span data-r="frame"></span><div class="cos-id__txt"><div class="cos-id__name" data-r="name"></div><div class="cos-id__title" data-r="title"></div><div class="cos-id__sub" data-r="sub"></div></div><span data-r="rank"></span></div></div>' +
      '<div class="ds-tabs cos-tabs" role="tablist" data-r="tabs"></div>' +
      '<div data-r="body"></div>' +
      '<div class="cos-action" data-r="action"></div></div>';
    const $ = (r) => container.querySelector('[data-r="' + r + '"]');
    S.$ = $;
    // aperçu 3D : on réutilise le renderer existant (le camp re-rend le panneau à chaque sauvegarde)
    if (!ST || ST.dead) ST = stageCreate();
    $('stage').replaceWith(ST.el); ST.gone = 0;
    S.stage = ST;

    const selOf = (kind) => (memo.sel[kind] !== undefined ? memo.sel[kind] : equippedId(p, kind));
    const selItem = (kind) => (kind === 'title' ? null : find(kind, selOf(kind)));

    function paintHero() {
      const skin = selItem('skin') || skinFor(p, classe), aura = selItem('aura') || byId(AURAS, 'none');
      stageSet(S.stage, { classe, skin, aura });
      const fr = selItem('frame') || FRAMES[0], bn = selItem('banner') || BANNERS[0];
      $('bg').className = 'cos-hero__bg cos-banner--' + bn.id;
      $('frame').innerHTML = frameHtml(fr.id, classIcon(classe), 56);
      $('name').textContent = p.nom || 'Héros';
      const tid = memo.sel.title !== undefined ? memo.sel.title : p.activeTitle;
      const td = tid && (G.TITLES || []).find((t) => t.id === tid);
      $('title').textContent = td ? td.name : '';
      let cn = classe; try { cn = (G.CLASSES && G.CLASSES[classe] && G.CLASSES[classe].name) || classe; } catch (e) { /* ignore */ }
      $('sub').textContent = cn + ' · niv. ' + num(p.niveau, 1);
      $('rank').innerHTML = '<span class="ds-rank ds-rank--md" data-rank="' + esc(p.rank || 'E') + '" style="color:var(--rk-' + esc(p.rank || 'E') + ')">' + esc(p.rank || 'E') + '</span>';
    }
    function paintTabs() {
      $('tabs').innerHTML = TABS.map((t) => '<button type="button" role="tab" class="ds-tab' + (memo.tab === t[0] ? ' is-active' : '') + '" data-tab="' + t[0] + '" aria-selected="' + (memo.tab === t[0]) + '">' + ico(t[2], '', 16) + ' ' + t[1] + '</button>').join('');
    }
    function paintBody() {
      const kind = memo.tab;
      let counts = '';
      if (kind === 'title') { $('body').innerHTML = '<p class="cos-hint" style="margin-bottom:8px">Le titre s’affiche sous ton nom ; ses petits bonus restent actifs tant qu’il est équipé.</p>' + titlesHtml(p, selOf('title')); return; }
      const items = itemsOf(kind, p), sel = selOf(kind);
      const owned = items.filter((i) => isUnlocked(p, i)).length;
      const hint = { skin: 'Skins de ta classe : seules les couleurs changent, pas les statistiques.', aura: 'L’aura t’entoure pendant les donjons.', frame: 'Le cadre entoure ton portrait dans le camp.', banner: 'La bannière orne ta carte de profil.' }[kind];
      $('body').innerHTML = '<p class="cos-hint" style="margin-bottom:8px">' + hint + '<span class="cos-count">' + owned + '/' + items.length + '</span></p><div class="cos-grid ds-stagger">' + items.map((it, i) => cardHtml(it, p, sel, i)).join('') + '</div>' + counts;
    }
    function paintAction() {
      const kind = memo.tab, A = $('action');
      let name = '', sub = '', btn = '';
      if (kind === 'title') {
        const id = selOf('title') || null; const t = id ? (G.TITLES || []).find((x) => x.id === id) : null; const owned = id === null || (p.titles && p.titles.indexOf(id) >= 0);
        name = t ? t.name : '(Aucun titre)'; sub = t ? (owned ? 'Titre obtenu' : t.desc) : 'Aucun titre affiché';
        const isEq = (p.activeTitle || null) === (id || null);
        btn = isEq ? '<button class="ds-btn ds-btn--secondary" disabled>Équipé</button>' : owned ? '<button class="ds-btn ds-btn--primary" data-act="equip">Équiper</button>' : '<button class="ds-btn ds-btn--secondary" disabled>' + ico('lock', '🔒', 16) + ' Verrouillé</button>';
      } else {
        const it = selItem(kind) || itemsOf(kind, p)[0], s = status(p, it);
        name = it.name; sub = RARITY_NAMES[it.rarity] + ' · ' + (s.unlocked ? (s.equipped ? 'Équipé' : 'Débloqué') : s.cond.text + (s.cond.progress ? ' (' + s.cond.progress + ')' : ''));
        if (s.equipped) btn = '<button class="ds-btn ds-btn--secondary" disabled>' + ico('check', '✓', 16) + ' Équipé</button>';
        else if (s.unlocked) btn = '<button class="ds-btn ds-btn--primary" data-act="equip">Équiper</button>';
        else if (s.buyable) btn = '<button class="ds-btn ds-btn--gold" data-act="buy"' + (s.affordable ? '' : ' disabled') + '>' + ico('gold', '', 16) + ' ' + s.cond.cost + '</button>';
        else btn = '<button class="ds-btn ds-btn--secondary" disabled>' + ico('lock', '🔒', 16) + ' Verrouillé</button>';
        A.style.setProperty('--fx', RARITY_HEX[it.rarity]);
      }
      const tip = kind === 'skin' ? ((selItem(kind) || itemsOf(kind, p)[0] || {}).desc || '') : '';
      A.innerHTML = '<div class="cos-action__txt"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><div class="cos-action__name">' + esc(name) + '</div><div class="cos-action__sub">' + esc(sub) + '</div></div>' + btn;
    }
    function paintAll() { paintHero(); paintTabs(); paintBody(); paintAction(); }

    function celebrate(color) {
      const host = container.querySelector('.cos-hero'); if (!host) return;
      const fl = document.createElement('div'); fl.className = 'cos-flash'; fl.style.setProperty('--fx', color); host.appendChild(fl);
      for (let i = 0; i < 14; i++) {
        const sp = document.createElement('i'); sp.className = 'cos-spark'; const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4, d = 70 + Math.random() * 60;
        sp.style.setProperty('--fx', color); sp.style.setProperty('--dx', Math.cos(a) * d + 'px'); sp.style.setProperty('--dy', Math.sin(a) * d * 0.8 - 30 + 'px'); sp.style.animationDelay = Math.random() * 0.12 + 's'; host.appendChild(sp);
      }
      setTimeout(() => { host.querySelectorAll('.cos-flash,.cos-spark').forEach((n) => n.remove()); }, 1200);
    }
    S.celebrate = celebrate;

    container.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-tab],[data-id],[data-act]'); if (!t || !container.contains(t)) return;
      if (t.dataset.tab) { memo.tab = t.dataset.tab; paintTabs(); paintBody(); paintAction(); return; }
      const kind = memo.tab;
      if (t.dataset.act) {
        const act = t.dataset.act;
        const id = kind === 'title' ? (selOf('title') || null) : selOf(kind);
        let res;
        if (act === 'buy') { res = buy(p, kind, id); if (!res.ok) { try { G.UI && G.UI.notify && G.UI.notify({ text: res.reason, rarity: 'commun', icon: '⚠️' }); } catch (e) { /* ignore */ } paintAction(); return; } }
        res = equip(p, kind, id);
        if (res.ok) {
          const it = kind === 'title' ? { rarity: 'legendaire', name: ((G.TITLES || []).find((x) => x.id === id) || {}).name || 'Aucun titre' } : find(kind, id);
          memo.flash = RARITY_HEX[it.rarity];
          memo.sel = {}; paintAll(); celebrate(memo.flash); memo.flash = null;
          try { G.sfx && G.sfx.play && G.sfx.play('upgrade'); } catch (e) { /* ignore */ }
        } else { try { G.UI && G.UI.notify && G.UI.notify({ text: res.reason || 'Impossible', rarity: 'commun', icon: '⚠️' }); } catch (e) { /* ignore */ } }
        return;
      }
      if (t.dataset.id !== undefined) {
        const id = t.dataset.id === '' ? null : t.dataset.id;
        memo.sel[kind] = id; paintHero(); paintBody(); paintAction();
      }
    });
    paintAll();
    if (memo.flash) { celebrate(memo.flash); memo.flash = null; }
  }
  function dispose(host) {
    // le camp re-rend le panneau à chaque sauvegarde : on laisse la boucle de l'aperçu libérer le renderer si personne ne le reprend
    if (ST && !ST.dead) ST.gone = Math.max(ST.gone, 10);
    if (host) host._cos = null;
  }

  const PANEL = { id: 'perso', title: 'Personnalisation', icon: 'palette', order: 6, render, dispose, visible: () => true };
  try {
    if (G.UI && G.UI.registerPanel) G.UI.registerPanel(PANEL);
    else if (G.Panels && G.Panels.register) G.Panels.register(PANEL.id, PANEL);
  } catch (e) { if (typeof console !== 'undefined') console.warn('[cosmetics] panneau', e); }

  G.Cosmetics = {
    CATALOG: { skins: SKINS, auras: AURAS, frames: FRAMES, banners: BANNERS },
    ensureProfile, evaluate, status, equip, buy,
    skinFor, heroOptionsFor, applyTint,
    activeSkin: (p, c) => skinFor(p, c || (p && p.classe)),
    frameHtml, bannerClass: (p) => 'cos-banner--' + ((p && p.cosmetics && p.cosmetics.banner) || 'aube'),
    frameClass: (p) => { const f = byId(FRAMES, p && p.cosmetics && p.cosmetics.frame) || FRAMES[0]; return 'cos-frame cos-frame--' + f.id + (f.shape === 'hex' ? ' cos-frame--hex' : '') + (f.anim ? ' cos-frame--anim' : ''); },
    portraitHtml: (p, o) => { ensureProfile(p); injectCSS(); return frameHtml(p.cosmetics.frame, o && o.content != null ? o.content : classIcon(p.classe), (o && o.size) || 56); },
    injectCSS, titleName,
    _panel: PANEL,
  };
})();
