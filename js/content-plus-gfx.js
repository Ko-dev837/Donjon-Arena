window.G = window.G || {};
/* =====================================================================
   js/content-plus-gfx.js — visuels des 7 donjons supplémentaires (js/content-plus-data.js)
   · 7 architectures (G.DungeonThemes.define) : égouts, marais, forge, désert de verre, ruche, épaves, palais des miroirs
   · modèles des monstres (G.MonsterModels.define) et des boss / mini-boss (G.BossModels.define)
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;

  /* ================================================================== ARCHITECTURES */
  if (G.DungeonThemes && G.DungeonThemes.define) {
    // ---- générateurs de salle partagés : chaque thème fournit ses propres accessoires (big/small/feature) ----
    const LAY = {
      // allée centrale décorative (canal, rivière de miel, tapis…) + gros accessoires sur les bords
      channel(ctx, t, K) {
        const w = t.chanW || 2.4, c = t.chan || ctx.P.accent;
        ctx.glow(K.G_FLAT, c, [0, 0.03, 0.5], [w, 1, 24], null);
        ctx.add(K.G_BOX, K.shade(ctx.P.wall, -0.2), [-w / 2 - 0.15, 0.08, 0.5], [0.3, 0.16, 24], null, false);
        ctx.add(K.G_BOX, K.shade(ctx.P.wall, -0.2), [w / 2 + 0.15, 0.08, 0.5], [0.3, 0.16, 24], null, false);
        for (const z of [-7, 0, 7]) if (t.bridge) t.bridge(ctx, 0, z, w);
        for (const [x, z] of [[-8, -7], [8, -7], [-8, 1], [8, 1], [-9, 8], [9, 8]]) if (ctx.free(x, z, 1.2, { allowCenter: true })) t.big(ctx, x, z);
      },
      // grille de 6 gros accessoires (colonnes, carcasses, alvéoles…)
      pillars(ctx, t) {
        for (const x of [-6, 6]) for (const z of [-7, -0.5, 6]) if (ctx.free(x, z, 1.1, { allowCenter: true })) t.big(ctx, x, z);
      },
      // trois îlots d'accessoires + flaques décoratives
      islands(ctx, t, K) {
        const spots = [[-7.5, -6], [7, -4], [-2, 7]];
        spots.forEach(([x, z], i) => {
          ctx.glow(K.G_DISC, t.pool || ctx.P.accent, [x + 2.6, 0.025, z + 1.2], [1.6 + i * 0.3, 1, 1.2 + i * 0.2], null);
          if (ctx.free(x, z, 1.2, { allowCenter: true })) t.big(ctx, x, z);
          for (let k = 0; k < 3; k++) { const a = ctx.rnd() * K.TAU, r = ctx.r(1.6, 2.4); if (ctx.free(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.5, { allowCenter: true })) t.small(ctx, x + Math.cos(a) * r, z + Math.sin(a) * r); }
        });
      },
      // anneau d'accessoires autour du centre (avec des passages)
      ring(ctx, t, K) {
        const n = 6, R = 7.5;
        for (let i = 0; i < n; i++) { const a = i / n * K.TAU + 0.3, x = Math.cos(a) * R, z = Math.sin(a) * R - 0.5; if (ctx.free(x, z, 1, { allowCenter: true })) t.big(ctx, x, z); }
        if (t.feature) t.feature(ctx, 0, -0.5);
      },
      // accessoires épars
      scatter(ctx, t) {
        for (let i = 0; i < 7; i++) { const x = ctx.r(-11, 11), z = ctx.r(-10, 9); if (ctx.free(x, z, 1.3)) t.big(ctx, x, z); }
        for (let i = 0; i < 12; i++) { const x = ctx.r(-12, 12), z = ctx.r(-11, 10); if (ctx.free(x, z, 0.5)) t.small(ctx, x, z); }
      },
    };
    const make = (cfg) => (K) => {
      const P = cfg.P;
      const t = cfg.props(K, P);
      const layout = {};
      cfg.layouts.forEach((name, i) => { const gen = LAY[cfg.gens[i]]; layout[name] = (ctx) => { gen(ctx, t, K); if (t.anchorsFor) t.anchorsFor(ctx); }; });
      return {
        theme: K.TH(cfg.name, cfg.bg, cfg.fog, cfg.sky, cfg.ground, cfg.sun, cfg.hemiI, cfg.sunI, cfg.dark, cfg.amb, cfg.mus, P),
        palette: P, layouts: cfg.layouts.slice(), wallH: cfg.wallH || 3, southH: cfg.southH || 1.0, doorStyle: cfg.door || 'dalle', pulse: cfg.pulse || { amp: 0.25, speed: 1 },
        floor(g, w, h, rnd) { cfg.floor(g, w, h, rnd, K, P); },
        walls(ctx, side, u0, u1, H) { t.wall(ctx, side, u0, u1, H); },
        layout,
        boss(ctx) {
          for (let i = 0; i < 6; i++) { const a = i / 6 * K.TAU + 0.5, x = Math.cos(a) * 10.4, z = Math.sin(a) * 9.4 - 0.5; if (ctx.free(x, z, 1.2, { allowCenter: true })) t.big(ctx, x, z); }
          if (t.bossFeature) t.bossFeature(ctx);
          ctx.mech.lightSpots = [[-8, -8], [8, -8], [0, 7]];
        },
        decor(ctx) {
          if (ctx.layout !== 'secret' && ctx.layout !== 'boss') for (let i = 0; i < 8; i++) { const x = ctx.r(-12, 12), z = ctx.r(-11, 10); if (ctx.free(x, z, 0.4)) t.small(ctx, x, z); }
          (cfg.parts || []).forEach((p) => K.particles(ctx, p[0], p[1], p[2], p[3], p[4] || {}));
        },
        lights(ctx) {
          const L = ctx.mech.lightSpots || cfg.lightSpots || [[-8, -7], [8, -7], [0, 6]];
          L.slice(0, 3).forEach((p) => t.light(ctx, p[0], p[1]));
        },
        secretDecor(ctx) { t.small(ctx, -5, -8); t.small(ctx, 5, -8); ctx.mech.lightSpots = [[0, -3]]; },
      };
    };
    const D = G.DungeonThemes.define;

    // ---------------------------------------------------------------- 1. ÉGOUTS DE ROUILLEMONT
    D('egouts_rouillemont', make({
      name: 'Égouts de Rouillemont', bg: 0x060806, fog: [14, 42], sky: 0x6a7a5a, ground: 0x10140a, sun: 0xc8ffa0, hemiI: 0.15, sunI: 0.12, dark: 0.75, amb: 'amb_mine', mus: 'mus_mine',
      P: { wall: 0x4a3a30, brick: 0x5a4234, floor: 0x2a2620, accent: 0x6adf3a, pipe: 0x5a5a52, rust: 0x8a4a2a, outer: 0x060604, doorFrame: 0x4a4a44, doorWood: 0x3a3a34, doorBand: 0x6a6a62, doorKey: 0x8aff4a, doorOpen: 0xaaff6a, secret: 0x9aff6a },
      layouts: ['canal', 'collecteur', 'bassins', 'galeries'], gens: ['channel', 'ring', 'islands', 'scatter'], wallH: 3.2, door: 'grille',
      parts: [[40, 0xa0b080, 0.07, 'dust', { op: 0.4, additive: false }], [16, 0x8adf6a, 0.06, 'drip', { y0: 0.05, y1: 3.2, op: 0.7 }]],
      floor(g, w, h, rnd, K, P) { g.fillStyle = K.css(P.floor); g.fillRect(0, 0, w, h); K.P2.flags(g, w, h, rnd, 9, 0x3a342c, 0x1a1814, 0.12); K.P2.blobs(g, w, h, rnd, 30, 0x2a3a1a, 10, 40, 0.45); K.P2.cracks(g, w, h, rnd, 8, 0x0a0a08, 2, 0.5); K.P2.vignette(g, w, h, 0.6); },
      props(K, P) {
        const pipe = (ctx, x, z) => { ctx.add(K.G_CYL, P.pipe, [x, 1.2, z], [0.35, 2.4, 0.35]); ctx.add(K.G_CYL, P.rust, [x, 2.2, z], [0.42, 0.18, 0.42], null, false); ctx.add(K.G_CYL, P.pipe, [x + 0.7, 2.25, z], [0.25, 1.4, 0.25], [0, 0, K.HPI], false); ctx.obs(x, z, 0.45, 0.45); };
        return {
          big(ctx, x, z) { if (ctx.rnd() < 0.5) pipe(ctx, x, z); else { K.PROP.barrel(ctx, x, z, 1.1, 0x4a5a3a); K.PROP.barrel(ctx, x + 0.9, z + 0.3, 0.9, 0x5a4a2a); ctx.glow(K.G_DISC, P.accent, [x + 0.4, 0.03, z + 0.9], [0.8, 1, 0.6]); } },
          small(ctx, x, z) { const k = ctx.rnd(); if (k < 0.4) K.PROP.rubble(ctx, x, z, 0.7, P.brick, 4); else if (k < 0.7) ctx.add(K.G_CYL, 0x3a3a34, [x, 0.03, z], [0.55, 0.06, 0.55], null, false); else K.PROP.bones(ctx, x, z, 0xcfc8b0); },
          bridge(ctx, x, z, w) { ctx.add(K.G_BOX, 0x5a5a52, [x, 0.12, z], [w + 0.8, 0.12, 1.4], null, false); for (const s of [-0.6, 0.6]) ctx.add(K.G_BOX, P.rust, [x, 0.16, z + s], [w + 0.8, 0.05, 0.06], null, false); },
          feature(ctx, x, z) { ctx.add(K.G_CYL, 0x2a2a24, [x, 0.04, z], [2.4, 0.08, 2.4], null, false); ctx.glow(K.ringG(0.8, 24), P.accent, [x, 0.06, z], [2.2, 1, 2.2]); ctx.glow(K.G_DISC, 0x3a7a2a, [x, 0.05, z], [1.7, 1, 1.7]); },
          bossFeature(ctx) { ctx.glow(K.ringG(0.9, 32), P.accent, [0, 0.04, -0.5], [6.5, 1, 6.5]); for (let i = 0; i < 4; i++) { const a = i / 4 * K.TAU; ctx.glow(K.G_DISC, 0x4a8a2a, [Math.cos(a) * 4, 0.035, Math.sin(a) * 4 - 0.5], [1.2, 1, 1.2]); } },
          wall(ctx, side, u0, u1, H) {
            K.runBlocks(ctx, u0, u1, 1.2, 2.2, (u, len) => {
              const hh = side === 'S' ? 0.6 : H, p = K.wpos(ctx, side, u, 0.3), along = side === 'N' || side === 'S';
              ctx.add(K.G_BOX, K.jit(P.brick, ctx.rnd, 0.1), [p[0], hh / 2, p[1]], along ? [len, hh, 0.8] : [0.8, hh, len]);
              if (side !== 'S' && ctx.rnd() < 0.45) { const q = K.wpos(ctx, side, u, 0.8); ctx.add(K.G_CYL, P.pipe, [q[0], H * 0.75, q[1]], [0.2, len * 0.95, 0.2], along ? [0, 0, K.HPI] : [K.HPI, 0, 0], false); }
              if (side !== 'S' && ctx.rnd() < 0.2) { const q = K.wpos(ctx, side, u, 0.75); ctx.glow(K.G_BOX, P.accent, [q[0], 0.25, q[1]], along ? [0.5, 0.5, 0.06] : [0.06, 0.5, 0.5]); }
            });
          },
          light(ctx, x, z) { ctx.glow(K.G_SPH_LO, 0xb8ff8a, [x, 2.6, z], 0.15); return K.addLight(ctx, x, 2.6, z, 0x9adf6a, 1.5, 9, { flicker: 0.3, speed: 6 }); },
        };
      },
    }), 'Tunnels de brique, canal de boue verte, ponts de fer, tuyaux rouillés et grilles.');

    // ---------------------------------------------------------------- 2. MARAIS DES PENDUS
    D('marais_pendus', make({
      name: 'Marais des Pendus', bg: 0x040608, fog: [12, 38], sky: 0x5a6a7a, ground: 0x0a100c, sun: 0x9ab8d8, hemiI: 0.13, sunI: 0.1, dark: 0.8, amb: 'amb_foret', mus: 'mus_foret',
      P: { wall: 0x22261c, trunk: 0x2a2620, water: 0x1a2a2a, floor: 0x1a1e16, accent: 0x5ab8d8, moss: 0x2a3a22, rope: 0x8a7a5a, outer: 0x040604, doorFrame: 0x2a2620, doorWood: 0x2a2620, doorBand: 0x3a3a2a, doorKey: 0x6ad8ff, doorOpen: 0x8ae0ff, secret: 0x9ae8ff },
      layouts: ['tourbiere', 'gibets', 'ilots', 'roselieres'], gens: ['islands', 'ring', 'scatter', 'pillars'], wallH: 6, door: 'grille', pulse: { amp: 0.35, speed: 0.8 },
      parts: [[26, 0x9ab0c0, 0.08, 'spores', { op: 0.35 }], [8, 0x6ad8ff, 0.1, 'spores', { op: 0.8 }]],
      floor(g, w, h, rnd, K, P) { g.fillStyle = K.css(P.floor); g.fillRect(0, 0, w, h); K.P2.blobs(g, w, h, rnd, 26, 0x0e1a1c, 30, 90, 0.7); K.P2.blobs(g, w, h, rnd, 50, 0x2a3a22, 8, 26, 0.5); K.P2.noise(g, w, h, rnd, 1400, [0x2a3022, 0x101410, 0x3a3a2a], 2, 5, 0.4); K.P2.vignette(g, w, h, 0.7); },
      props(K, P) {
        const deadTree = (ctx, x, z) => { const h = ctx.r(3, 4.5); ctx.add(K.G_CYL, K.jit(P.trunk, ctx.rnd, 0.1), [x, h / 2, z], [0.32, h, 0.32]); for (let i = 0; i < 3; i++) { const a = ctx.rnd() * K.TAU; ctx.add(K.G_CYL, P.trunk, [x + Math.cos(a) * 0.6, h * ctx.r(0.6, 0.9), z + Math.sin(a) * 0.6], [0.09, 1.6, 0.09], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], false); } ctx.add(K.G_CYL, P.moss, [x, 0.3, z], [0.4, 0.4, 0.4], null, false); ctx.obs(x, z, 0.4, 0.4); };
        const gallows = (ctx, x, z) => { ctx.add(K.G_BOX, P.trunk, [x, 1.8, z], [0.25, 3.6, 0.25]); ctx.add(K.G_BOX, P.trunk, [x + 0.7, 3.55, z], [1.6, 0.2, 0.2], null, false); ctx.add(K.G_CYL, P.rope, [x + 1.3, 2.9, z], [0.03, 1.2, 0.03], null, false); ctx.add(K.G_SPH_LO, 0x3a3a30, [x + 1.3, 2.2, z], [0.22, 0.35, 0.18], null, false); ctx.add(K.G_BOX, 0x2a2a24, [x + 1.3, 1.55, z], [0.4, 1.0, 0.25], null, false); ctx.obs(x, z, 0.3, 0.3); };
        return {
          big(ctx, x, z) { if (ctx.rnd() < 0.55) deadTree(ctx, x, z); else gallows(ctx, x, z); },
          small(ctx, x, z) { const k = ctx.rnd(); if (k < 0.4) { for (let i = 0; i < 4; i++) ctx.add(K.G_CYL, 0x4a5a3a, [x + ctx.r(-0.3, 0.3), 0.5, z + ctx.r(-0.3, 0.3)], [0.03, 1.0, 0.03], null, false); } else if (k < 0.7) ctx.add(K.G_DISC, 0x3a6a3a, [x, 0.035, z], [0.4, 1, 0.4], null, false); else K.PROP.skull(ctx.B, x, 0.12, z, 0.9, 0xcfc8b0, ctx.rnd() * 3); },
          feature(ctx, x, z) { ctx.glow(K.G_DISC, P.water, [x, 0.03, z], [3, 1, 2.6]); ctx.glow(K.ringG(0.9, 28), P.accent, [x, 0.04, z], [3, 1, 2.6]); },
          bossFeature(ctx) { ctx.glow(K.G_DISC, P.water, [0, 0.03, -0.5], [7, 1, 6]); for (let i = 0; i < 5; i++) { const a = i / 5 * K.TAU; ctx.glow(K.G_SPH_LO, P.accent, [Math.cos(a) * 5, 0.4, Math.sin(a) * 5 - 0.5], 0.12); } },
          wall(ctx, side, u0, u1, H) {
            K.runBlocks(ctx, u0, u1, 1.4, 2.4, (u, len) => {
              const p = K.wpos(ctx, side, u, ctx.r(-0.2, 0.5));
              if (side === 'S') { ctx.add(K.G_SPH, K.jit(P.moss, ctx.rnd, 0.15), [p[0], 0.35, p[1]], [len * 0.55, 0.5, 0.8]); return; }
              const h = ctx.r(H * 0.7, H * 1.2); ctx.add(K.G_CYL, K.jit(P.trunk, ctx.rnd, 0.12), [p[0], h / 2, p[1]], [ctx.r(0.4, 0.7), h, ctx.r(0.4, 0.7)]);
              ctx.add(K.G_SPH, K.jit(0x1a2a1a, ctx.rnd, 0.2), [p[0], 0.4, p[1]], [len * 0.6, 0.7, 1.0], null, false);
            });
          },
          light(ctx, x, z) { ctx.add(K.G_BOX, 0x2a2620, [x, 1.2, z], [0.12, 2.4, 0.12]); ctx.glow(K.G_BOX, 0x8ae0ff, [x, 2.5, z], [0.22, 0.3, 0.22]); return K.addLight(ctx, x, 2.5, z, 0x5ab8d8, 1.5, 9, { flicker: 0.5, speed: 3 }); },
        };
      },
    }), 'Tourbière noyée de brume, arbres morts, gibets et cordes, lanternes bleues.');

    // ---------------------------------------------------------------- 3. FORGE ENGLOUTIE
    D('forge_engloutie', make({
      name: 'Forge Engloutie', bg: 0x0a0604, fog: [14, 44], sky: 0xa0705a, ground: 0x1a0c06, sun: 0xffb080, hemiI: 0.16, sunI: 0.14, dark: 0.7, amb: 'amb_abime', mus: 'mus_abime',
      P: { wall: 0x3a3234, stone: 0x4a4044, floor: 0x241e1c, accent: 0xff6a1a, iron: 0x5a5a62, bronze: 0xa0703a, outer: 0x060404, doorFrame: 0x4a4044, doorWood: 0x3a3234, doorBand: 0x8a6a3a, doorKey: 0xff8a3a, doorOpen: 0xffa060, secret: 0xffb070 },
      layouts: ['coulee', 'enclumes', 'creusets', 'atelier'], gens: ['channel', 'pillars', 'islands', 'ring'], wallH: 3.6, door: 'dalle', pulse: { amp: 0.3, speed: 1.6 },
      parts: [[36, 0xff8a3a, 0.07, 'embers', { op: 0.8 }], [20, 0x9a8a80, 0.08, 'dust', { op: 0.35, additive: false }]],
      floor(g, w, h, rnd, K, P) { g.fillStyle = K.css(P.floor); g.fillRect(0, 0, w, h); K.P2.tiles(g, w, h, 8, 0x2e2624, 0x261e1c, 0x120c0a, rnd, 0.1); K.P2.cracks(g, w, h, rnd, 12, 0xff5a10, 2, 0.35); K.P2.vignette(g, w, h, 0.55); },
      props(K, P) {
        const anvil = (ctx, x, z) => { ctx.add(K.G_BOX, P.stone, [x, 0.45, z], [1.2, 0.9, 1.2]); ctx.add(K.G_BOX, P.iron, [x, 1.05, z], [1.6, 0.3, 0.7]); ctx.add(K.G_CONE, P.iron, [x + 1.0, 1.05, z], [0.25, 0.6, 0.25], [0, 0, -K.HPI], false); ctx.obs(x, z, 0.8, 0.6); };
        const gear = (ctx, x, z) => { ctx.add(K.torus(0.18, K.TAU, 16), P.bronze, [x, 1.6, z], [1.5, 1.5, 1.5], [0, ctx.rnd() * 3, 0]); ctx.add(K.G_CYL, P.iron, [x, 1.6, z], [0.3, 0.4, 0.3], [K.HPI, 0, 0], false); ctx.add(K.G_BOX, P.iron, [x, 0.6, z], [0.4, 1.2, 0.4]); ctx.obs(x, z, 0.5, 0.5); };
        const crucible = (ctx, x, z) => { ctx.add(K.G_CYL, P.iron, [x, 0.55, z], [0.8, 1.1, 0.8]); ctx.glow(K.G_DISC, P.accent, [x, 1.12, z], [0.65, 1, 0.65]); ctx.obs(x, z, 0.85, 0.85); };
        return {
          big(ctx, x, z) { const k = ctx.rnd(); if (k < 0.4) anvil(ctx, x, z); else if (k < 0.7) gear(ctx, x, z); else crucible(ctx, x, z); },
          small(ctx, x, z) { const k = ctx.rnd(); if (k < 0.4) ctx.add(K.G_BOX, P.bronze, [x, 0.1, z], [0.5, 0.2, 0.25], [0, ctx.rnd() * 3, 0], false); else if (k < 0.7) K.PROP.rubble(ctx, x, z, 0.6, P.stone, 4); else ctx.glow(K.G_OCTA, P.accent, [x, 0.1, z], [0.12, 0.1, 0.12]); },
          bridge(ctx, x, z, w) { ctx.add(K.G_BOX, P.iron, [x, 0.14, z], [w + 0.8, 0.14, 1.5], null, false); for (let i = -2; i <= 2; i++) ctx.add(K.G_BOX, 0x2a2a30, [x + i * 0.6, 0.22, z], [0.08, 0.04, 1.5], null, false); },
          feature(ctx, x, z) { crucible(ctx, x, z); },
          bossFeature(ctx) { ctx.glow(K.ringG(0.86, 32), P.accent, [0, 0.04, -0.5], [7, 1, 7]); for (let i = 0; i < 6; i++) { const a = i / 6 * K.TAU; ctx.glow(K.G_BOX, P.accent, [Math.cos(a) * 7, 0.035, Math.sin(a) * 7 - 0.5], [1.4, 0.02, 0.2], [0, -a, 0]); } },
          wall(ctx, side, u0, u1, H) {
            K.runBlocks(ctx, u0, u1, 1.6, 2.6, (u, len) => {
              const hh = side === 'S' ? 0.6 : H, p = K.wpos(ctx, side, u, 0.35), along = side === 'N' || side === 'S';
              ctx.add(K.G_BOX, K.jit(P.stone, ctx.rnd, 0.1), [p[0], hh / 2, p[1]], along ? [len, hh, 0.9] : [0.9, hh, len]);
              if (side !== 'S' && ctx.rnd() < 0.3) { const q = K.wpos(ctx, side, u, 0.85); ctx.add(K.G_BOX, 0x2a2224, [q[0], H * 0.4, q[1]], along ? [1.2, 1.2, 0.3] : [0.3, 1.2, 1.2], null, false); ctx.glow(K.G_BOX, P.accent, [q[0], H * 0.3, q[1]], along ? [0.8, 0.5, 0.32] : [0.32, 0.5, 0.8]); }
            });
          },
          light(ctx, x, z) { ctx.glow(K.G_SPH_LO, 0xffb060, [x, 2.4, z], 0.18); return K.addLight(ctx, x, 2.4, z, 0xff7a2a, 1.7, 10, { flicker: 0.35, speed: 9 }); },
        };
      },
    }), 'Forge naine engloutie : canal de lave, enclumes, roues dentées, creusets et fours.');

    // ---------------------------------------------------------------- 4. DÉSERT DE VERRE
    D('desert_verre', make({
      name: 'Désert de Verre', bg: 0x0e0a06, fog: [16, 48], sky: 0xffe0a0, ground: 0x3a2a14, sun: 0xfff0c0, hemiI: 0.22, sunI: 0.2, dark: 0.45, amb: 'amb_observatoire', mus: 'mus_temple',
      P: { wall: 0xb08a54, sand: 0xc8a060, floor: 0xa88050, accent: 0xfff0a0, glass: 0x9ae0e8, stone: 0xc0a070, outer: 0x1a120a, doorFrame: 0xb08a54, doorWood: 0x8a6a3a, doorBand: 0xffd86a, doorKey: 0xfff0a0, doorOpen: 0xffffc0, secret: 0xfff4b0 },
      layouts: ['dunes', 'obelisques', 'ruines', 'oasis'], gens: ['scatter', 'pillars', 'ring', 'islands'], wallH: 3.2, door: 'dalle', pulse: { amp: 0.2, speed: 0.7 },
      parts: [[50, 0xe8c890, 0.07, 'dust', { op: 0.5, additive: false }], [12, 0xfff0a0, 0.06, 'stars', { op: 0.7 }]],
      floor(g, w, h, rnd, K, P) { g.fillStyle = K.css(P.floor); g.fillRect(0, 0, w, h); K.P2.blobs(g, w, h, rnd, 40, 0xc09858, 30, 80, 0.4); K.P2.noise(g, w, h, rnd, 2400, [0xb89060, 0x90703a, 0xd8b070], 1, 3, 0.5); K.P2.noise(g, w, h, rnd, 160, [0x9ae0e8, 0xd0f0ff], 2, 5, 0.6); K.P2.vignette(g, w, h, 0.45); },
      props(K, P) {
        const obelisk = (ctx, x, z) => { ctx.add(K.G_BOX, P.stone, [x, 0.3, z], [1.4, 0.6, 1.4]); ctx.add(K.G_BOX, K.jit(P.stone, ctx.rnd, 0.08), [x, 2.2, z], [0.7, 3.4, 0.7]); ctx.add(K.G_CONE4, P.accent, [x, 4.1, z], [0.5, 0.6, 0.5], [0, Math.PI / 4, 0]); ctx.glow(K.G_BOX, 0xffd86a, [x, 2.2, z + 0.36], [0.2, 2.4, 0.02]); ctx.obs(x, z, 0.75, 0.75); };
        const glassShard = (ctx, x, z) => { for (let i = 0; i < 3; i++) ctx.glow(K.G_OCTA, P.glass, [x + ctx.r(-0.5, 0.5), ctx.r(0.4, 1.0), z + ctx.r(-0.5, 0.5)], [0.25, ctx.r(0.6, 1.3), 0.25], [ctx.r(-0.3, 0.3), ctx.rnd() * 3, ctx.r(-0.3, 0.3)]); ctx.add(K.G_SPH, P.sand, [x, 0, z], [1.2, 0.4, 1.0], null, false); ctx.obs(x, z, 0.7, 0.6); };
        const statueHead = (ctx, x, z) => { ctx.add(K.G_SPH, P.sand, [x, 0, z], [1.6, 0.6, 1.4], null, false); ctx.add(K.G_BOX, P.stone, [x, 0.9, z], [1.2, 1.4, 1.1], [0.2, ctx.rnd(), 0.1]); ctx.add(K.G_BOX, 0x3a5a8a, [x, 1.4, z], [1.4, 0.5, 1.2], [0.2, 0, 0.1], false); ctx.obs(x, z, 0.9, 0.8); };
        return {
          big(ctx, x, z) { const k = ctx.rnd(); if (k < 0.4) obelisk(ctx, x, z); else if (k < 0.75) glassShard(ctx, x, z); else statueHead(ctx, x, z); },
          small(ctx, x, z) { const k = ctx.rnd(); if (k < 0.5) ctx.glow(K.G_OCTA, P.glass, [x, 0.12, z], [0.1, 0.18, 0.1]); else if (k < 0.8) ctx.add(K.G_SPH, P.sand, [x, 0, z], [0.6, 0.2, 0.5], null, false); else K.PROP.skull(ctx.B, x, 0.1, z, 1, 0xe8dcc0, ctx.rnd() * 3); },
          feature(ctx, x, z) { ctx.glow(K.G_DISC, 0x4ac0d8, [x, 0.03, z], [2.6, 1, 2.2]); for (let i = 0; i < 5; i++) { const a = i / 5 * K.TAU; ctx.add(K.G_CYL, 0x6a8a3a, [x + Math.cos(a) * 2.9, 1.2, z + Math.sin(a) * 2.5], [0.12, 2.4, 0.12], null, false); } },
          bossFeature(ctx) { ctx.glow(K.ringG(0.92, 40), 0xffd86a, [0, 0.04, -0.5], [7.5, 1, 7.5]); ctx.glow(K.ringG(0.9, 32), 0xffd86a, [0, 0.04, -0.5], [4.5, 1, 4.5]); },
          wall(ctx, side, u0, u1, H) {
            K.runBlocks(ctx, u0, u1, 1.8, 3, (u, len) => {
              const p = K.wpos(ctx, side, u, ctx.r(0, 0.5));
              if (side === 'S') { ctx.add(K.G_SPH, P.sand, [p[0], 0, p[1]], [len * 0.6, 0.6, 1]); return; }
              ctx.add(K.G_SPH, K.jit(P.sand, ctx.rnd, 0.06), [p[0], 0, p[1]], [len * 0.7, ctx.r(1.2, 2.2), 1.6]);
              if (ctx.rnd() < 0.35) ctx.add(K.G_BOX, P.stone, [p[0], H * 0.5, p[1]], [0.6, H, 0.6]);
            });
          },
          light(ctx, x, z) { ctx.glow(K.G_OCTA, 0xfff4c0, [x, 2.8, z], [0.2, 0.3, 0.2]); return K.addLight(ctx, x, 2.8, z, 0xffe0a0, 1.6, 11, { flicker: 0.1, speed: 2 }); },
        };
      },
    }), 'Dunes dorées, éclats de verre, obélisques, têtes de statues ensablées, oasis.');

    // ---------------------------------------------------------------- 5. RUCHE ABYSSALE
    D('ruche_abyssale', make({
      name: 'Ruche Abyssale', bg: 0x0a0804, fog: [12, 40], sky: 0xc0a050, ground: 0x1a1206, sun: 0xffe080, hemiI: 0.17, sunI: 0.13, dark: 0.7, amb: 'amb_jardin', mus: 'mus_jardin',
      P: { wall: 0x8a6a2a, wax: 0xb08a3a, honey: 0xe8a020, floor: 0x3a2a12, accent: 0xffc030, chitin: 0x2a2418, outer: 0x080602, doorFrame: 0x8a6a2a, doorWood: 0x6a4a1a, doorBand: 0xc89030, doorKey: 0xffc030, doorOpen: 0xffd060, secret: 0xffe080 },
      layouts: ['alveoles', 'rivieres_miel', 'couvain', 'chambre'], gens: ['pillars', 'channel', 'scatter', 'ring'], wallH: 4, door: 'membrane', pulse: { amp: 0.35, speed: 1.4 },
      parts: [[30, 0xffd060, 0.06, 'spores', { op: 0.6 }], [10, 0xe8a020, 0.07, 'drip', { y0: 0.05, y1: 3.8, op: 0.8 }]],
      floor(g, w, h, rnd, K, P) {
        g.fillStyle = K.css(P.floor); g.fillRect(0, 0, w, h);
        const r = w / 18; g.strokeStyle = K.css(0x5a4218, 0.8); g.lineWidth = 3;
        for (let yy = 0, row = 0; yy < h + r; yy += r * 1.5, row++) for (let xx = (row % 2) * r * 0.87; xx < w + r; xx += r * 1.73) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; g[k ? 'lineTo' : 'moveTo'](xx + Math.cos(a) * r, yy + Math.sin(a) * r); } g.closePath(); g.stroke(); }
        K.P2.blobs(g, w, h, rnd, 18, 0xc88a20, 14, 40, 0.35); K.P2.vignette(g, w, h, 0.6);
      },
      props(K, P) {
        const combColumn = (ctx, x, z) => { for (let i = 0; i < 3; i++) ctx.add(K.G_CYL6, K.jit(P.wax, ctx.rnd, 0.08), [x, 0.8 + i * 1.3, z], [0.85 - i * 0.12, 1.25, 0.85 - i * 0.12]); ctx.glow(K.G_CYL6, P.honey, [x, 0.4, z + 0.55], [0.3, 0.4, 0.1]); ctx.obs(x, z, 0.85, 0.85); };
        const cocoon = (ctx, x, z) => { ctx.add(K.G_SPH, 0xd8c8a0, [x, 1.0, z], [0.7, 1.1, 0.7]); ctx.glow(K.G_SPH_LO, 0x9adf3a, [x, 1.0, z + 0.55], 0.15); ctx.add(K.G_CYL, 0xc8b890, [x, 2.6, z], [0.04, 1.4, 0.04], null, false); ctx.obs(x, z, 0.65, 0.65); };
        return {
          big(ctx, x, z) { if (ctx.rnd() < 0.55) combColumn(ctx, x, z); else cocoon(ctx, x, z); },
          small(ctx, x, z) { const k = ctx.rnd(); if (k < 0.45) ctx.glow(K.G_DISC, P.honey, [x, 0.03, z], [ctx.r(0.4, 0.8), 1, ctx.r(0.3, 0.6)]); else if (k < 0.75) ctx.add(K.G_SPH, 0xe0d0a8, [x, 0.2, z], [0.25, 0.35, 0.25], null, false); else ctx.add(K.G_CYL6, P.wax, [x, 0.15, z], [0.4, 0.3, 0.4], null, false); },
          bridge(ctx, x, z, w) { ctx.add(K.G_BOX, P.wax, [x, 0.12, z], [w + 0.6, 0.14, 1.3], null, false); },
          feature(ctx, x, z) { ctx.add(K.G_CYL6, P.wax, [x, 0.2, z], [2.2, 0.4, 2.2], null, false); ctx.glow(K.G_DISC, P.honey, [x, 0.42, z], [1.8, 1, 1.8]); },
          bossFeature(ctx) { ctx.glow(K.ringG(0.88, 6), P.accent, [0, 0.04, -0.5], [7.5, 1, 7.5]); ctx.glow(K.G_DISC, P.honey, [0, 0.03, -0.5], [3, 1, 3]); },
          wall(ctx, side, u0, u1, H) {
            K.runBlocks(ctx, u0, u1, 1.1, 1.6, (u, len) => {
              const p = K.wpos(ctx, side, u, 0.4), hh = side === 'S' ? 0.65 : H;
              for (let y = 0; y < hh; y += 1.0) ctx.add(K.G_CYL6, K.jit(P.wall, ctx.rnd, 0.12), [p[0], y + 0.5, p[1]], [len * 0.55, Math.min(1, hh - y), 0.6], [K.HPI, 0, 0]);
              if (side !== 'S' && ctx.rnd() < 0.3) { const q = K.wpos(ctx, side, u, 0.9); ctx.glow(K.G_SPH_LO, P.honey, [q[0], ctx.r(0.8, H - 0.5), q[1]], 0.25); }
            });
          },
          light(ctx, x, z) { ctx.glow(K.G_SPH, P.accent, [x, 2.8, z], [0.25, 0.32, 0.25]); return K.addLight(ctx, x, 2.8, z, 0xffb020, 1.6, 10, { flicker: 0.2, speed: 4 }); },
        };
      },
    }), 'Murs d\'alvéoles hexagonales, rivières de miel noir, cocons suspendus, couvain.');

    // ---------------------------------------------------------------- 6. CIMETIÈRE DES NAVIRES
    D('cimetiere_navires', make({
      name: 'Cimetière des Navires', bg: 0x04070c, fog: [12, 40], sky: 0x6a8aa8, ground: 0x0a1018, sun: 0xb0d8ff, hemiI: 0.15, sunI: 0.12, dark: 0.75, amb: 'amb_cathedrale', mus: 'mus_cathedrale',
      P: { wall: 0x3a2e24, plank: 0x4a3a2a, floor: 0x3a2c20, accent: 0x6ad8ff, sea: 0x0a1a2a, sail: 0xb8b0a0, rope: 0x8a7a5a, outer: 0x02060a, doorFrame: 0x3a2e24, doorWood: 0x3a2e24, doorBand: 0x5a5a5a, doorKey: 0x6ad8ff, doorOpen: 0x8ae0ff, secret: 0x9ae8ff },
      layouts: ['pont', 'epaves', 'cales', 'mats'], gens: ['channel', 'islands', 'scatter', 'pillars'], wallH: 3, door: 'bois', pulse: { amp: 0.3, speed: 0.6 },
      parts: [[30, 0xa8c8e0, 0.08, 'spores', { op: 0.3 }], [16, 0x8ad0ff, 0.06, 'drip', { y0: 0.05, y1: 3, op: 0.6 }]],
      floor(g, w, h, rnd, K, P) { g.fillStyle = K.css(P.floor); g.fillRect(0, 0, w, h); K.P2.planks(g, w, h, rnd, 16, 0x4a3828, 0x1a120c); K.P2.blobs(g, w, h, rnd, 18, 0x1a2a3a, 14, 40, 0.4); K.P2.vignette(g, w, h, 0.65); },
      props(K, P) {
        const mast = (ctx, x, z) => { ctx.add(K.G_CYL, P.plank, [x, 3, z], [0.25, 6, 0.25]); ctx.add(K.G_CYL, P.plank, [x, 4.6, z], [0.12, 3.2, 0.12], [0, 0, K.HPI], false); ctx.add(K.G_BOX, K.jit(P.sail, ctx.rnd, 0.1), [x, 3.6, z + 0.2], [2.6, 1.8, 0.05], [0.1, 0, ctx.r(-0.1, 0.1)], false); ctx.add(K.G_CYL, P.rope, [x, 0.25, z], [0.5, 0.5, 0.5], null, false); ctx.obs(x, z, 0.4, 0.4); };
        const cannon = (ctx, x, z) => { ctx.add(K.G_BOX, P.plank, [x, 0.3, z], [1.0, 0.5, 1.4]); ctx.add(K.G_CYL, 0x2a2a30, [x, 0.75, z - 0.3], [0.25, 1.6, 0.25], [K.HPI, 0, 0]); for (const s of [-0.5, 0.5]) for (const t of [-0.5, 0.5]) ctx.add(K.G_CYL, 0x2a2018, [x + s, 0.18, z + t], [0.18, 0.1, 0.18], [0, 0, K.HPI], false); ctx.obs(x, z, 0.6, 0.8); };
        const hull = (ctx, x, z) => { ctx.add(K.G_HEMI, K.jit(P.wall, ctx.rnd, 0.1), [x, 0, z], [1.6, 1.4, 2.6], [0, ctx.rnd() * 3, K.PI]); ctx.add(K.G_BOX, P.plank, [x, 1.0, z], [2.8, 0.15, 0.6], [0, ctx.rnd() * 3, 0.3], false); ctx.obs(x, z, 1.3, 1.3); };
        return {
          big(ctx, x, z) { const k = ctx.rnd(); if (k < 0.35) mast(ctx, x, z); else if (k < 0.7) cannon(ctx, x, z); else { K.PROP.barrel(ctx, x, z, 1, 0x4a3420); K.PROP.crate(ctx, x + 0.9, z + 0.4, 0.45, ctx.rnd(), 0x5a4228); } },
          small(ctx, x, z) { const k = ctx.rnd(); if (k < 0.35) ctx.add(K.torus(0.06, K.TAU, 14), P.rope, [x, 0.06, z], [0.45, 0.45, 0.45], [K.HPI, 0, 0], false); else if (k < 0.65) ctx.add(K.G_SPH_LO, 0x2a2a30, [x, 0.18, z], 0.18, null, false); else K.PROP.bones(ctx, x, z, 0xd8d0c0); },
          bridge(ctx, x, z, w) { ctx.add(K.G_BOX, P.plank, [x, 0.1, z], [w + 0.8, 0.1, 1.2], null, false); for (const s of [-0.65, 0.65]) ctx.add(K.G_CYL, P.rope, [x, 0.6, z + s], [0.04, w + 0.8, 0.04], [0, 0, K.HPI], false); },
          feature(ctx, x, z) { hull(ctx, x - 0.5, z); },
          bossFeature(ctx) { ctx.glow(K.G_DISC, P.sea, [0, 0.025, -0.5], [10, 1, 9]); ctx.add(K.G_CYL, P.plank, [0, 0.06, -0.5], [7.5, 0.12, 7.5], null, false); ctx.glow(K.ringG(0.95, 40), P.accent, [0, 0.13, -0.5], [7.5, 1, 7.5]); },
          wall(ctx, side, u0, u1, H) {
            K.runBlocks(ctx, u0, u1, 1.4, 2.4, (u, len) => {
              const hh = side === 'S' ? 0.55 : H, p = K.wpos(ctx, side, u, 0.35), along = side === 'N' || side === 'S';
              ctx.add(K.G_BOX, K.jit(P.wall, ctx.rnd, 0.12), [p[0], hh / 2, p[1]], along ? [len, hh, 0.7] : [0.7, hh, len], [ctx.r(-0.04, 0.04), 0, ctx.r(-0.04, 0.04)]);
              if (side !== 'S' && ctx.rnd() < 0.35) { const q = K.wpos(ctx, side, u, 0.75); ctx.add(K.G_CYL, 0x2a2a30, [q[0], H * 0.5, q[1]], [0.22, 0.6, 0.22], along ? [K.HPI, 0, 0] : [0, 0, K.HPI], false); }
            });
          },
          light(ctx, x, z) { ctx.add(K.G_CYL, P.plank, [x, 1.2, z], [0.08, 2.4, 0.08]); ctx.glow(K.G_BOX, 0x9ae8ff, [x, 2.5, z], [0.22, 0.3, 0.22]); return K.addLight(ctx, x, 2.5, z, 0x6ad8ff, 1.6, 10, { flicker: 0.4, speed: 2.5 }); },
        };
      },
    }), 'Épaves échouées sur une mer noire : ponts de bois, mâts et voiles, canons, cordages.');

    // ---------------------------------------------------------------- 7. PALAIS DES MIROIRS
    D('palais_miroirs', make({
      name: 'Palais des Miroirs', bg: 0x08080e, fog: [16, 48], sky: 0xb8b8e0, ground: 0x1a1a2a, sun: 0xe8e0ff, hemiI: 0.1, sunI: 0.08, dark: 0.62, amb: 'amb_observatoire', mus: 'mus_observatoire',
      P: { wall: 0x9a9ab4, marble: 0xa8a8c0, floor: 0x5a5a78, accent: 0xc0a8ff, mirror: 0x6a8ab8, gold: 0xe8c860, outer: 0x0a0a12, doorFrame: 0xe8e8f4, doorWood: 0xb8b8cc, doorBand: 0xe8c860, doorKey: 0xc0a8ff, doorOpen: 0xe0d0ff, secret: 0xf0e8ff },
      layouts: ['galerie_glaces', 'labyrinthe', 'salle_bal', 'kaleidoscope'], gens: ['pillars', 'scatter', 'ring', 'islands'], wallH: 4.2, door: 'voile', pulse: { amp: 0.2, speed: 1.2 },
      parts: [[30, 0xe8e0ff, 0.06, 'stars', { op: 0.8 }], [14, 0xc0a8ff, 0.07, 'spores', { op: 0.6 }]],
      floor(g, w, h, rnd, K, P) { g.fillStyle = K.css(P.floor); g.fillRect(0, 0, w, h); K.P2.tiles(g, w, h, 10, 0x7a7a9c, 0x5e5e80, 0x34344c, rnd, 0.06); K.P2.noise(g, w, h, rnd, 200, [0xc0a8ff, 0x9ae0ff, 0xffd0f0], 2, 4, 0.35); K.P2.vignette(g, w, h, 0.4); },
      props(K, P) {
        const mirror = (ctx, x, z) => { const ry = ctx.rnd() * K.PI; ctx.add(K.G_BOX, P.gold, [x, 1.6, z], [1.7, 3.2, 0.2], [0, ry, 0]); ctx.glow(K.G_BOX, P.mirror, [x, 1.6, z], [1.4, 2.8, 0.24], [0, ry, 0]); ctx.add(K.G_BOX, P.marble, [x, 0.12, z], [1.9, 0.24, 0.6], [0, ry, 0]); ctx.obs(x, z, 0.85, 0.85); };
        const column = (ctx, x, z) => { K.PROP.pillar(ctx, x, z, 0.5, 4, P.marble, P.gold, K.G_CYL6); ctx.glow(K.ringG(0.85, 20), P.accent, [x, 0.04, z], [0.9, 1, 0.9]); };
        const prism = (ctx, x, z) => { ctx.add(K.G_CYL, P.marble, [x, 0.4, z], [0.7, 0.8, 0.7]); ctx.glow(K.G_OCTA, P.accent, [x, 1.6, z], [0.5, 0.8, 0.5]); ctx.obs(x, z, 0.7, 0.7); };
        return {
          big(ctx, x, z) { const k = ctx.rnd(); if (k < 0.45) mirror(ctx, x, z); else if (k < 0.75) column(ctx, x, z); else prism(ctx, x, z); },
          small(ctx, x, z) { const k = ctx.rnd(); if (k < 0.5) ctx.glow(K.G_OCTA, ctx.pick([0xc0a8ff, 0x9ae0ff, 0xffd0f0]), [x, 0.1, z], [0.1, 0.16, 0.1]); else ctx.add(K.G_BOX, P.mirror, [x, 0.04, z], [0.6, 0.06, 0.4], [0, ctx.rnd() * 3, 0], false); },
          feature(ctx, x, z) { prism(ctx, x, z); ctx.glow(K.ringG(0.9, 36), P.accent, [x, 0.04, z], [3, 1, 3]); },
          bossFeature(ctx) { ctx.glow(K.ringG(0.93, 48), P.accent, [0, 0.04, -0.5], [8, 1, 8]); ctx.glow(K.ringG(0.9, 6), P.gold, [0, 0.045, -0.5], [5, 1, 5]); },
          wall(ctx, side, u0, u1, H) {
            K.runBlocks(ctx, u0, u1, 2, 2.4, (u, len) => {
              const hh = side === 'S' ? 0.6 : H, p = K.wpos(ctx, side, u, 0.3), along = side === 'N' || side === 'S';
              ctx.add(K.G_BOX, P.marble, [p[0], hh / 2, p[1]], along ? [len, hh, 0.6] : [0.6, hh, len]);
              if (side !== 'S') { const q = K.wpos(ctx, side, u, 0.62); ctx.glow(K.G_BOX, P.mirror, [q[0], H * 0.5, q[1]], along ? [len * 0.7, H * 0.7, 0.04] : [0.04, H * 0.7, len * 0.7]); ctx.add(K.G_BOX, P.gold, [q[0], H * 0.88, q[1]], along ? [len * 0.8, 0.12, 0.1] : [0.1, 0.12, len * 0.8], null, false); }
            });
          },
          light(ctx, x, z) { ctx.glow(K.G_OCTA, 0xffffff, [x, 3.2, z], [0.25, 0.35, 0.25]); return K.addLight(ctx, x, 3.2, z, 0xc8b8ff, 1.2, 10, { flicker: 0.08, speed: 3 }); },
        };
      },
    }), 'Marbre blanc, miroirs à cadre d\'or, colonnes, prismes, sol de cristal.');
  } else console.warn('[content-plus] G.DungeonThemes.define absent : architectures non ajoutées');

  /* ================================================================== MONSTRES */
  const MM = G.MonsterModels && G.MonsterModels.define;
  if (MM) {
    const DEF = {
      // égouts
      egout_egoutier_noye: ['human', { h: 1, skin: 0x8a9a7a, cloth: 0x4a5a3a, legC: 0x3a3a2a, eye: 0xb6ff6a, weapon: 'stick', drip: 1, noye: 1, rags: 0x3a4a2a, boot: 0x2a2a20 }],
      egout_rat_creve: ['hound', { s: 0.55, fur: 0x5a5040, eye: 0xff4a3a, snout: 0x8a6a5a, ear: 0x8a6a5a }],
      egout_limace_boue: ['blob', { s: 0.9, c: 0x4a5a2a, c2: 0x6a8a3a, eyesN: 2, eye: 0xd8ff6a, eyeGlow: 1, tent: 2, op: 0.95 }],
      egout_crapaud_gonfle: ['bulk', { s: 0.8, skin: 0x5a7a3a, cloth: 0x4a6a2a, legC: 0x3a5a2a, eye: 0xffd040, rocks: 0x6a8a4a }],
      egout_cafard_geant: ['crawl', { s: 0.7, tall: 0.6, legs: 6, skin: 0x4a2a18, legC: 0x2a1a10, eye: 0x111111 }],
      egout_guetteur_tuyaux: ['crawl', { s: 1.0, tall: 1.4, legs: 4, skin: 0x7a8a6a, legC: 0x5a6a4a, face: 'human', faceC: 0xc8d0b0, arms: 1, eye: 0xb6ff6a }],
      egout_gros_egoutier: ['human', { h: 1.25, bw: 1.35, skin: 0x8a8a70, cloth: 0x3a4a3a, legC: 0x2a2a20, eye: 0xb6ff6a, weapon: 'mace', apron: 0x5a4a2a, boot: 0x1a1a14, head: 'helm', helmC: 0x5a5a50 }],
      egout_rat_dore: ['hound', { s: 0.6, fur: 0xe8c040, eye: 0xffffff, snout: 0xffd860, ear: 0xffd860 }],
      egout_vieille_aux_chats: ['cloak', { h: 0.95, cloth: 0x3a3428, face: 'veil', veilC: 0x5a5040, eye: 0xb6ff6a, hood: true, claws: 0xc8c0a8 }],
      egout_eboueur_fou: ['bulk', { s: 1.2, skin: 0x7a7a60, cloth: 0x4a4a3a, legC: 0x2a2a20, eye: 0xff6a3a, rocks: 0x5a5a4a }],
      // marais
      marais_pendu: ['cloak', { h: 1.1, cloth: 0x3a3a34, face: 'skull', boneC: 0xd8d0c0, eye: 0x6ad8ff, ghostly: 1, mist: 1, mistC: 0x8aa0b0, chains: 1, claws: 0xd8d0c0 }],
      marais_noye: ['human', { h: 1.1, skin: 0x6a8a8a, cloth: 0x3a4a4a, legC: 0x2a3a3a, eye: 0x6ad8ff, drip: 1, noye: 1, algae: 1, rags: 0x2a3a3a }],
      marais_sangsue: ['worm', { s: 0.8, c: 0x3a2a2a, c2: 0x5a3a3a, eye: 0xff4a4a }],
      marais_feu_follet: ['wisp', { s: 0.9, core: 0x8ae0ff, flame: 0x4ab8ff, trail: 0x6ad8ff, orbitC: 0xc0f0ff, orbitN: 2 }],
      marais_corbeau_gibet: ['wing', { s: 0.85, body: 0x14141a, wing: 0x1e1e26, eye: 0x6ad8ff, beak: 0xb0a060, fingers: 1, tailC: 0x14141a }],
      marais_crapaud_buffle: ['bulk', { s: 1.15, skin: 0x4a5a3a, cloth: 0x3a4a2a, legC: 0x2a3a1a, eye: 0xffb030, rocks: 0x5a6a3a }],
      marais_juge_pendu: ['human', { h: 1.3, skin: 0x8a8a90, cloth: 0x1a1a24, legC: 0x1a1a24, eye: 0x6ad8ff, weapon: 'mace', robe: 0x1a1a24, head: 'top', chains: 1 }],
      marais_grenouille_or: ['bulk', { s: 0.6, skin: 0xe8c040, cloth: 0xd8b030, legC: 0xc8a020, eye: 0xffffff }],
      marais_passeuse: ['cloak', { h: 1.05, cloth: 0x2a3a4a, face: 'veil', veilC: 0xc8d8e8, eye: 0x6ad8ff, hood: true, weapon: 'candle', ghostly: 1 }],
      marais_chose_tourbe: ['bulk', { s: 1.3, skin: 0x3a3a24, cloth: 0x2a2a1a, legC: 0x2a2a1a, eye: 0x9aff6a, bark: 0x4a3a24, leaves: 0x3a5a2a, rocks: 0x3a4a2a }],
      // forge
      forge_forgeron_calcine: ['human', { h: 1.1, bw: 1.2, skin: 0x3a2a24, cloth: 0x5a3a24, legC: 0x2a2018, eye: 0xff8a3a, weapon: 'mace', apron: 0x6a4a2a, braise: 1, boot: 0x1a1410 }],
      forge_automate_bronze: ['bulk', { s: 1.2, skin: 0xa0703a, cloth: 0x8a5a2a, legC: 0x6a4a20, eye: 0xffb040, rocks: 0xc08a40 }],
      forge_salamandre: ['crawl', { s: 0.9, tall: 0.7, legs: 4, skin: 0xd8501a, legC: 0xa0380a, eye: 0xffe040 }],
      forge_escarbille: ['wisp', { s: 0.6, core: 0xffd060, flame: 0xff6a1a, trail: 0xff8a2a, orbitC: 0xffb040, orbitN: 2 }],
      forge_chien_fonte: ['hound', { s: 0.9, fur: 0x3a3a40, eye: 0xff6a1a, snout: 0x2a2a30, ear: 0x2a2a30, spikes: 0xff8a3a }],
      forge_souffleur: ['human', { h: 0.95, skin: 0x8a6a5a, cloth: 0x6a4a3a, legC: 0x3a2a20, eye: 0xffb040, weapon: 'stick', head: 'mask', maskC: 0x8a8a90 }],
      forge_contremaitre_fer: ['human', { h: 1.3, bw: 1.3, skin: 0x6a5a50, cloth: 0x3a3a40, legC: 0x2a2a30, eye: 0xff6a1a, weapon: 'whip', plate: 0x5a5a62, head: 'helm', helmC: 0x5a5a62, chains: 1 }],
      forge_lingot_vivant: ['obj', { shape: 'gear', s: 0.9, c: 0xe8c040, y: 0.9 }],
      forge_apprenti: ['human', { h: 0.8, skin: 0xd8b090, cloth: 0x6a4a2a, legC: 0x3a2a1a, eye: 0x3a2a1a, apron: 0x8a6a3a, head: 'cap' }],
      forge_coulee_vivante: ['blob', { s: 1.2, c: 0xff5a10, c2: 0xffb040, eyesN: 2, eye: 0xffffff, eyeGlow: 1, tent: 4, op: 1 }],
      // désert
      desert_momie_sable: ['human', { h: 1.1, skin: 0xc8b088, cloth: 0xd8c8a0, legC: 0xc8b088, eye: 0x9ae0e8, bandage: 1, rags: 0xb8a078 }],
      desert_scorpion_verre: ['crab', { s: 1.0, shell: 0x9ae0e8, eye: 0xfff0a0 }],
      desert_vautour_solaire: ['wing', { s: 0.9, body: 0x6a4a2a, wing: 0x8a6a3a, eye: 0xffd040, beak: 0xe8c860, fingers: 1, tailC: 0x6a4a2a }],
      desert_djinn_mirage: ['wisp', { s: 1.1, core: 0x9ae0ff, flame: 0x4ab0ff, trail: 0xfff0a0, orbitC: 0xfff0a0, orbitN: 3 }],
      desert_ver_sables: ['worm', { s: 1.2, c: 0xb8904a, c2: 0x9a7a3a, eye: 0xff6a3a, spikes: 0xfff0a0 }],
      desert_pretre_solaire: ['cloak', { h: 1.1, cloth: 0xe8d8b0, face: 'mask', eye: 0xfff0a0, hood: true, weapon: 'ball', weaponC: 0xffd86a, stars: 3, starC: 0xfff0a0 }],
      desert_gardien_obelisque: ['statue', { kind: 'idol', h: 1.3, stone: 0xc0a070, cracks: 0xffd86a, tears: 0 }],
      desert_scarabee_or: ['crab', { s: 0.6, shell: 0xe8c040, eye: 0xffffff }],
      desert_marchand_mirage: ['cloak', { h: 1.05, cloth: 0x8a3a2a, face: 'veil', veilC: 0xe8c860, eye: 0x9ae0e8, hood: true, ghostly: 1 }],
      desert_tempete_vivante: ['wisp', { s: 1.4, core: 0xe8c890, flame: 0xc8a060, trail: 0xe8d8b0, orbitC: 0x9ae0e8, orbitN: 5 }],
      // ruche
      ruche_ouvriere: ['wing', { s: 0.6, body: 0xe8b020, wing: 0xd8d0b0, eye: 0x111111, fingers: 0, tailC: 0x1a1408 }],
      ruche_soldat_chitine: ['crab', { s: 1.2, shell: 0x2a2418, eye: 0xffc030 }],
      ruche_larve: ['worm', { s: 0.7, c: 0xe8dcc0, c2: 0xd0c0a0, eye: 0x1a1408 }],
      ruche_cracheuse: ['crawl', { s: 0.9, tall: 0.9, legs: 6, skin: 0x6a8a2a, legC: 0x3a4a1a, eye: 0xffe040 }],
      ruche_nourrice: ['plant', { s: 0.9, stem: 0xc8a050, petal: 0xffc030, bulb: 0xe8a020, vines: 3, eyeBud: 1, eye: 0x1a1408 }],
      ruche_bourdon_blinde: ['bulk', { s: 1.1, skin: 0x2a2418, cloth: 0xe8a020, legC: 0x1a1408, eye: 0xffc030, rocks: 0xe8b030 }],
      ruche_garde_royale: ['human', { h: 1.3, bw: 1.2, skin: 0x2a2418, cloth: 0xe8a020, legC: 0x1a1408, eye: 0xffc030, weapon: 'spear', plate: 0x3a3020, head: 'helm', helmC: 0x2a2418, wings: 1 }],
      ruche_abeille_ambre: ['wing', { s: 0.7, body: 0xffb020, wing: 0xffe080, eye: 0xffffff }],
      ruche_reine_dechue: ['cloak', { h: 1.0, cloth: 0x8a6a2a, face: 'veil', veilC: 0xffd060, eye: 0xffc030, hood: true, ghostly: 1, wings: 1 }],
      ruche_essaim_vivant: ['wisp', { s: 1.3, core: 0x2a2418, flame: 0xe8b020, trail: 0x6a5a20, orbitC: 0xffc030, orbitN: 6 }],
      // navires
      navire_matelot_noye: ['human', { h: 1.05, skin: 0x7a9aa0, cloth: 0x3a4a6a, legC: 0x2a3a4a, eye: 0x6ad8ff, weapon: 'knife', drip: 1, noye: 1, algae: 1, head: 'cap' }],
      navire_pirate_spectral: ['cloak', { h: 1.15, cloth: 0x2a3a4a, face: 'skull', boneC: 0xd8e0e8, eye: 0x6ad8ff, ghostly: 1, mist: 1, mistC: 0x8ab0c8, weapon: 'sword', hat: 0x1a1a24 }],
      navire_crabe_abysses: ['crab', { s: 1.4, shell: 0x5a3a4a, eye: 0x6ad8ff }],
      navire_mouette_squelette: ['wing', { s: 0.7, body: 0xd8d0c0, wing: 0xb8b0a0, eye: 0x6ad8ff, beak: 0xe8c060, fingers: 1, tailC: 0xd8d0c0 }],
      navire_artilleur: ['human', { h: 1.0, skin: 0x8aa0a8, cloth: 0x5a2a2a, legC: 0x2a2a30, eye: 0xff8a3a, weapon: 'dynamite', ghostly: 1, head: 'cap' }],
      navire_sirene: ['cloak', { h: 1.05, cloth: 0x2a6a7a, face: 'veil', veilC: 0x9ae8ff, eye: 0x9ae8ff, hair: 0x4ac8b8, ghostly: 1, mist: 1, mistC: 0x6ab8c8 }],
      navire_second_capitaine: ['human', { h: 1.3, bw: 1.3, skin: 0x7a9098, cloth: 0x2a2a3a, legC: 0x1a1a24, eye: 0x6ad8ff, weapon: 'chain', plate: 0x5a5a62, cape: 0x3a1a1a, drip: 1, head: 'top' }],
      navire_coffre_vivant: ['crab', { s: 0.9, shell: 0x8a5a2a, reliquary: 1, eye: 0xffd040 }],
      navire_mousse: ['human', { h: 0.75, skin: 0xb8c8d0, cloth: 0x6a8aa0, legC: 0x3a4a5a, eye: 0x3a4a5a, ghostly: 1, head: 'cap' }],
      navire_noyeur: ['blob', { s: 1.3, c: 0x1a3a5a, c2: 0x3a6a8a, eyesN: 2, eye: 0x9ae8ff, eyeGlow: 1, tent: 6, op: 0.85 }],
      // miroirs
      miroir_reflet: ['human', { h: 1.0, skin: 0xd8e0f0, cloth: 0xa8b8d8, legC: 0x8898b8, eye: 0xffffff, weapon: 'sword', head: 'blank', crystals: 1 }],
      miroir_eclat: ['obj', { shape: 'shard', s: 0.7, c: 0xc8e0ff, y: 1.0 }],
      miroir_ange_verre: ['statue', { kind: 'angel', h: 1.2, stone: 0xd0e0f0, cracks: 0xc0a8ff, tears: 0 }],
      miroir_spectre_prisme: ['wisp', { s: 1.0, core: 0xffffff, flame: 0xc0a8ff, trail: 0x9ae0ff, orbitC: 0xffd0f0, orbitN: 4 }],
      miroir_chevalier_argent: ['human', { h: 1.3, bw: 1.2, skin: 0xc8d0e0, cloth: 0xb8c0d0, legC: 0xa0a8b8, eye: 0xc0a8ff, weapon: 'sword', shield: 1, plate: 0xd8e0f0, head: 'helm', helmC: 0xd8e0f0 }],
      miroir_voyeur: ['eye', { s: 1.0, iris: 0xc0a8ff, veins: 0, stone: 0xd8d8e8, ring: 0xe8c860 }],
      miroir_le_double: ['human', { h: 1.3, bw: 1.25, skin: 0x2a2a3a, cloth: 0x1a1a2a, legC: 0x101018, eye: 0xc0a8ff, weapon: 'sword', head: 'blank', crystals: 1, cape: 0x1a1a2a }],
      miroir_miroir_or: ['obj', { shape: 'star', s: 0.9, c: 0xe8c860, y: 1.0 }],
      miroir_princesse: ['cloak', { h: 1.0, cloth: 0xe8d8f8, face: 'veil', veilC: 0xffffff, eye: 0xc0a8ff, hood: false, ghostly: 1, crown: 1 }],
      miroir_devoreur_reflets: ['cloak', { h: 1.35, cloth: 0x0a0a12, face: 'none', eye: 0xffffff, tendrils: 6, tendrilC: 0x1a1a2a, ghostly: 1 }],
    };
    Object.keys(DEF).forEach((id) => { try { MM(id, DEF[id][0], DEF[id][1]); } catch (e) { console.warn('[content-plus] modèle ' + id, e); } });
  }

  /* ================================================================== BOSS & MINI-BOSS */
  const BM = G.BossModels;
  if (BM && BM.define) {
    const tricorn = (c, p, s) => { const h = c.parts.head; if (!h) return; c.add(h, 'cyl', 0x1a1a24, [0, 0.42 * s, 0], [0.62 * s, 0.12 * s, 0.62 * s]); c.add(h, 'cone', 0x1a1a24, [0, 0.62 * s, 0], [0.42 * s, 0.4 * s, 0.42 * s]); c.add(h, 'box', p.trim, [0, 0.5 * s, 0.4 * s], [0.5 * s, 0.06 * s, 0.04 * s]); };
    const BOSS = {
      egout_reine_des_rats: () => BM.beast({ scale: 1.15, pal: { fur: 0x6a5a48, dark: 0x3a3028, belly: 0xb8a890, eye: 0xff3a2a, glow: 0x9adf6a }, aura: true }),
      marais_bourreau_noye: () => BM.humanoid({ scale: 1.15, pal: { skin: 0x5a7a5a, dark: 0x1a2028, trim: 0x8a7a5a, cloth: 0x1a2a34, glow: 0x6ad8ff, eye: 0x6ad8ff }, weapon: 'axe', head: 'hood', cape: true }),
      forge_forgeron_sans_visage: () => BM.humanoid({ scale: 1.25, heavy: 1.3, pal: { skin: 0x5a4034, dark: 0x2a2224, trim: 0xa0703a, cloth: 0x4a2a1a, glow: 0xff6a1a, eye: 0xff8a3a }, weapon: 'hammer', head: 'helm', chestGlow: true, spikes: true }),
      desert_pharaon_verre: () => BM.robed({ scale: 1.15, pal: { robe: 0x9ae0e8, dark: 0xb08a54, trim: 0xffd86a, glow: 0xfff0a0, eye: 0xffffff, skin: 0xc8f0f8 }, crown: true, staff: true, orbitN: 3, ring: true }),
      ruche_reine_essaim: () => BM.tentacled({ scale: 1.15, pal: { skin: 0xe8b020, dark: 0x2a2418, belly: 0xffd060, eye: 0x111111, glow: 0xffc030 }, crown: true, tentacles: 4 }),
      navire_capitaine_sans_repos: () => BM.humanoid({ scale: 1.2, pal: { skin: 0x7a98a8, dark: 0x1a1a24, trim: 0xe8c060, cloth: 0x2a2a3a, glow: 0x6ad8ff, eye: 0x6ad8ff }, weapon: 'sword', head: 'none', cape: true, extra: tricorn }),
      miroir_roi_reflet: () => BM.crystalBoss({ scale: 1.2, pal: { cry: 0xe0e8ff, core: 0xc0a8ff, dark: 0xb8b8cc, eye: 0xffffff } }),
      egout_crocodile_blanc: () => BM.beast({ scale: 0.95, pal: { fur: 0xd8e0d0, dark: 0xa8b0a0, belly: 0xf0f0e0, eye: 0xff4a3a, glow: 0x9adf6a } }),
      marais_sorciere_tourbe: () => BM.robed({ scale: 0.95, pal: { robe: 0x3a4a2a, dark: 0x1a2414, trim: 0x8aa060, glow: 0x9adf6a, eye: 0x9aff6a, skin: 0x8a9a7a }, staff: true }),
      forge_marteau_pilon: () => BM.humanoid({ scale: 1.1, heavy: 1.4, pal: { skin: 0x5a5a62, dark: 0x2a2a30, trim: 0xa0703a, cloth: 0x3a3a40, glow: 0xff8a3a, eye: 0xff8a3a }, weapon: 'hammer', head: 'helm' }),
      desert_sphinx_brise: () => BM.beast({ scale: 1.0, pal: { fur: 0xc8a060, dark: 0x8a6a3a, belly: 0xe8d0a0, eye: 0x9ae0e8, glow: 0xffd86a }, aura: true }),
      ruche_matriarche_larves: () => BM.tentacled({ scale: 0.95, pal: { skin: 0xe8dcc0, dark: 0xb8a880, belly: 0xffe8b0, eye: 0x1a1408, glow: 0xffc030 }, tentacles: 6, bubbles: true }),
      navire_figure_de_proue: () => BM.robed({ scale: 1.0, pal: { robe: 0x6a5a40, dark: 0x3a2e24, trim: 0xe8c060, glow: 0x6ad8ff, eye: 0x9ae8ff, skin: 0xb8a888 }, ring: true }),
      miroir_narcisse: () => BM.robed({ scale: 0.95, pal: { robe: 0xe8e8f4, dark: 0xb8b8cc, trim: 0xe8c860, glow: 0xc0a8ff, eye: 0xffffff, skin: 0xf0e8f0 }, crown: true, orbitN: 4 }),
    };
    Object.keys(BOSS).forEach((id) => { try { BM.define(id, BOSS[id]); } catch (e) { console.warn('[content-plus] boss ' + id, e); } });
  }
})();
