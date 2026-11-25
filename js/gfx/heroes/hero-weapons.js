/* =====================================================================
 *  v6 — hero-weapons.js (A4 Armor & Clothing Designer)
 *  G.HeroWeapons.build(R, spec) -> { weapon:{bone,layer}, glowWeapons:{epee,dague,feu} }
 *  Une arme par classe (spec.weapon de G.HeroDefs : kind, variant, parts, offhand) :
 *    sword (+ bouclier), staff, daggers, twin-blades, longbow (+ flèche, carquois), mace (+ bouclier),
 *    scepter, scythe. Lame/partie principale en couche 'blade' (lueur des paliers de forge).
 *  Repère (hero-kit) : weaponR/weaponL au centre du poing, axe de l'arme = +Z local (lame vers l'avant),
 *  main pendante le long de -Y, pouce vers +Z. Plat des lames face ±X, tranchants vers ±Y.
 *  Dépend de G.HeroOutfits.util (même agent) ; sans lui : renvoie seulement les couches.
 * ===================================================================== */
window.G = window.G || {};
(function () {
  'use strict';
  const G = window.G;
  const PI = Math.PI, TAU = PI * 2, HP = PI / 2;

  const DEFAULT_GLOW = {
    Guerrier: { epee: [['weaponR', 'blade']], dague: [['weaponR', 'gem']], feu: [['forearmL', 'glow']] },
    Mage: { epee: [['weaponR', 'blade']], dague: [['beltL', 'glow']], feu: [['weaponR', 'glow']] },
    Voleur: { epee: [['weaponR', 'blade']], dague: [['weaponL', 'blade']], feu: [['beltR', 'glow']] },
    Assassin: { epee: [['weaponR', 'blade'], ['weaponL', 'blade']], dague: [['weaponR', 'glow'], ['weaponL', 'glow']], feu: [['beltL', 'glow']] },
    Archer: { epee: [['weaponL', 'blade']], dague: [['back', 'glow']], feu: [['beltR', 'glow']] },
    Paladin: { epee: [['weaponR', 'blade']], dague: [['beltL', 'glow']], feu: [['forearmL', 'glow']] },
    Elementaliste: { epee: [['weaponR', 'blade']], dague: [['weaponR', 'gem']], feu: [['weaponR', 'glow']] },
    Necromancien: { epee: [['weaponR', 'blade']], dague: [['beltL', 'glow']], feu: [['weaponR', 'glow']] },
  };
  const DEFAULT_KIND = { Guerrier: 'sword', Mage: 'staff', Voleur: 'daggers', Assassin: 'twin-blades', Archer: 'longbow', Paladin: 'mace', Elementaliste: 'scepter', Necromancien: 'scythe' };

  function result(cls, main) {
    const g = DEFAULT_GLOW[cls] || DEFAULT_GLOW.Guerrier;
    return { weapon: main || { bone: g.epee[0][0], layer: g.epee[0][1] }, glowWeapons: { epee: g.epee.slice(), dague: g.dague.slice(), feu: g.feu.slice() } };
  }

  // =================================================================
  function build(R, spec) {
    spec = spec || {};
    const cls = spec.classId || 'Guerrier';
    const U = G.HeroOutfits && G.HeroOutfits.util;
    if (!U || !R || !R.bones || typeof R.add !== 'function' || !window.THREE) return result(cls);
    const { hex, shade, GE, alignEuler, composeEuler, NO } = U;
    const pal = spec.palette || {};
    const w = spec.weapon || {};
    const parts = w.parts || {};
    const kind = w.kind && w.kind !== 'none' ? w.kind : DEFAULT_KIND[cls] || 'sword';
    const variant = w.variant || 'base';
    const PC = U.palette(spec);
    const C = (v, d) => { // couleur : hex, ou nom de clé de palette
      if (typeof v === 'number' && isFinite(v)) return v >>> 0;
      if (typeof v === 'string' && pal[v] != null) return hex(pal[v]);
      if (typeof v === 'string' && v[0] === '#') return hex(v);
      return hex(d);
    };
    const P0 = {
      blade: C('blade', 0xdfe7f2), edge: C('bladeEdge', 0xf4f8ff), gold: C('gold', PC.trim), metal: C('metal', PC.metal), metalD: C('metalDark', PC.metalD),
      leather: C('leather', PC.leather), leatherD: C('leatherDark', PC.leatherD), primary: C('primary', PC.main), primaryD: C('primaryDark', PC.mainD),
      secondary: C('secondary', PC.second), gem: C('gem', PC.gem), glow: C('glow', PC.glow), accent: C('accent', PC.gem), accent2: C('accent2', PC.glow),
      bone: C('bone', 0xe6dcc4), trans: C('trans', 0xbfe6ff),
    };
    const LAY = (mat, d) => { const L = ['skin', 'cloth', 'cloth2', 'leather', 'metal', 'gold', 'hair', 'gem', 'glow', 'trans', 'cape', 'fur', 'bone', 'blade']; return L.indexOf(mat) >= 0 ? mat : d; };
    let tris = 0;
    const add = (bone, layer, geo, col, pos, scl, rot, o) => {
      if (!geo || !R.bones[bone]) return;
      const s = typeof scl === 'number' ? [scl, scl, scl] : scl;
      o = o || {};
      if (o.outline == null) { const mx = Math.max(s[0], s[1], s[2]); o = { outline: mx >= 0.22 && layer !== 'glow' && layer !== 'trans' }; }
      tris += (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3) * (o.outline ? 2 : 1);
      R.add(bone, layer, geo, hex(col), pos, s, rot || [0, 0, 0], o);
    };
    // orientation : géométrie +Y (longueur) → axe Z de l'arme ; géo +Z (épaisseur) → ±X (plat) ; géo X (largeur) → Y
    const ALONG = alignEuler([0, 0, 1], [1, 0, 0]);
    const BACKW = alignEuler([0, 0, -1], [1, 0, 0]);
    const ROT = (dir, extra) => (extra ? composeEuler(dir, extra) : dir);
    const CYLZ = [HP, 0, 0]; // cylindre (axe Y) couché sur Z
    const glowOut = result(cls);

    // --------------------------------------------------------------- pièces communes
    /** poignée gainée (cuir tressé) le long de Z, centrée sur z0 */
    function grip(bone, z0, len, r, col, layer, wrap) {
      add(bone, layer || 'leather', GE.cyl(8), col, [0, 0, z0], [r * 2, len, r * 2], CYLZ);
      if (wrap !== false) {
        const n = Math.max(2, Math.round(len / 0.06));
        for (let i = 0; i < n; i++) add(bone, layer || 'leather', GE.torus(0.35, 8), shade(col, i % 2 ? -0.2 : 0.12), [0, 0, z0 - len / 2 + (i + 0.5) * len / n], [r * 2.15, r * 2.15, r * 0.9], [0, 0, (i % 2 ? 0.25 : -0.25)], NO);
      }
    }
    /** profil de lame : style ogive | leaf | flamberge | serrated | serrated-zigzag | curved | needle */
    function bladeProfile(style, waves) {
      switch (style) {
        case 'flamberge': { const p = [[0, 0.5], [0.06, 0.5]]; const n = (waves || 5) * 2; for (let i = 1; i <= n; i++) { const y = 0.06 + 0.84 * i / n; p.push([y, (0.5 - 0.12 * y) * (i % 2 ? 0.78 : 1.0)]); } p.push([1, 0]); return p; }
        case 'serrated': case 'serrated-zigzag': { const p = [[0, 0.5]]; const n = 8; for (let i = 1; i <= n; i++) { const y = 0.85 * i / n; p.push([y, (0.5 - 0.1 * y) * (i % 2 ? 0.7 : 1.05)]); } p.push([1, 0]); return p; }
        case 'leaf': return [[0, 0.32], [0.25, 0.48], [0.55, 0.52], [0.82, 0.32], [1, 0]];
        case 'needle': return [[0, 0.4], [0.7, 0.3], [1, 0]];
        default: return [[0, 0.5], [0.1, 0.5], [0.72, 0.44], [0.9, 0.3], [1, 0]];
      }
    }
    /** lame le long de +Z (ou -Z si back), base en z0 */
    function blade(bone, z0, len, width, thick, opt) {
      const o = opt || {};
      const name = (o.style || 'ogive') + '|' + (o.waves || 0) + '|' + (o.curve || 0);
      const g = GE.blade(name, bladeProfile(o.style, o.waves), o.curve || 0, o.fuller ? 0.35 : 0);
      const dir = o.back ? -1 : 1;
      add(bone, o.layer || 'blade', g, o.col != null ? o.col : P0.blade, [0, 0, z0 * dir], [width, len, thick], o.back ? BACKW : ALONG, o.outline === false ? NO : undefined);
      // gouttière (fuller) : bande sombre sur chaque plat
      if (o.fuller) for (const sx of [-1, 1]) add(bone, o.layer || 'blade', GE.box(), shade(o.col != null ? o.col : P0.blade, -0.25), [sx * thick * 0.36, 0, (z0 + len * o.fuller * 0.5) * dir], [thick * 0.2, width * 0.18, len * o.fuller], null, NO);
      // gravures dorées près de la garde
      if (o.engraved) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) add(bone, 'gold', GE.box(), P0.gold, [sx * thick * 0.42, (i - 1) * width * 0.14, (z0 + 0.05 + i * 0.045) * dir], [0.004, width * 0.12, 0.03], [0, 0, 0], NO);
    }
    function gemAt(bone, pos, r, col, layer, rot) { add(bone, layer || 'gem', GE.gemCut(), col, pos, [r * 2, r * 1.6, r * 2], rot || [0, 0, HP], NO); }

    /** garde d'épée (barre le long de Y) */
    function guard(bone, z, len, style, col, layer, gem) {
      const L = layer || 'gold';
      if (style === 'S') {
        add(bone, L, GE.box(), col, [0, 0, z], [0.03, len * 0.6, 0.025]);
        add(bone, L, GE.torus(0.3, 8), col, [0, len * 0.32, z + 0.03], [0.06, 0.06, 0.05], [0, HP, 0], NO);
        add(bone, L, GE.torus(0.3, 8), col, [0, -len * 0.32, z - 0.03], [0.06, 0.06, 0.05], [0, HP, 0], NO);
      } else if (style === 'crescent') {
        add(bone, L, GE.torus(0.22, 12), col, [0, 0, z + 0.035], [len * 0.9, len * 0.9, 0.06], [0, HP, 0]);
      } else if (style === 'root') {
        for (let i = 0; i < 5; i++) add(bone, L, GE.cone(5), shade(col, -0.05 * i), [0, (i - 2) * len * 0.12, z + 0.02], [0.03, len * (0.35 - 0.04 * Math.abs(i - 2)), 0.03], [(i - 2) * 0.5 + PI, 0, 0]);
        add(bone, L, GE.sph(), col, [0, 0, z], [0.06, 0.08, 0.07]);
      } else {
        add(bone, L, GE.box(), col, [0, 0, z], [0.04, len, 0.038]);
        add(bone, L, GE.sph(), shade(col, 0.1), [0, 0, z], [0.06, 0.07, 0.06]);
        if (style === 'straight-upturned' || style === 'upturned' || !style) for (const sy of [-1, 1]) add(bone, L, GE.spike(), col, [0, sy * len * 0.5, z + 0.02], [0.034, 0.075, 0.034], [-HP + sy * 0.6, 0, 0]);
        // langets (bouts de garde sur le plat)
        add(bone, L, GE.box(), shade(col, -0.1), [0, 0, z + 0.035], [0.05, 0.03, 0.05]);
      }
      if (gem) for (const sx of [-1, 1]) gemAt(bone, [sx * 0.032, 0, z], 0.016, gem, 'gem', [0, 0, sx * HP]);
    }
    function pommel(bone, z, style, col, layer) {
      const L = layer || 'gold';
      if (style === 'ring' || style === 'ring-tassel') {
        add(bone, L, GE.torus(0.25, 10), col, [0, 0, z - 0.02], [0.05, 0.05, 0.04], [0, HP, 0]);
      } else if (style === 'disc') {
        add(bone, L, GE.cyl(12), col, [0, 0, z], [0.075, 0.03, 0.075], [0, 0, HP]);
        add(bone, 'gem', GE.gemCut(), P0.gem, [0.018, 0, z], [0.03, 0.022, 0.03], [0, 0, -HP], NO);
        add(bone, 'gem', GE.gemCut(), P0.gem, [-0.018, 0, z], [0.03, 0.022, 0.03], [0, 0, HP], NO);
      } else add(bone, L, GE.sph(), col, [0, 0, z], [0.055, 0.055, 0.06]);
    }

    /** bouclier sur l'avant-bras gauche ; o = spec offhand ; forme heater | kite | round */
    function shield(o) {
      const bone = R.bones[o.bone] ? o.bone : 'forearmL';
      const P = R.P || {};
      const fore = P.fore || 0.27, fr = (P.foreR || 0.047) * 1.3;
      const id = String(o.id || 'heater-shield');
      const shape = /round|rondache/.test(id) ? 'round' : /kite/.test(id) ? 'kite' : 'heater';
      const W = +o.w || (shape === 'round' ? 0.6 : 0.6), H = +o.h || (shape === 'kite' ? 0.85 : shape === 'round' ? W : 0.78);
      const faceL = o.mat === 'glow' ? 'glow' : (o.face && /wood/.test(id)) ? 'leather' : 'cloth';
      const face = C(o.face, P0.primary), rimL = o.rim === 'gold' ? 'gold' : o.rim === 'trans' ? 'trans' : 'metal', rim = C(o.rim, P0.metal);
      const ox = fr + 0.022; // décalage vers l'extérieur (+X), plaqué sur l'avant-bras
      const cy = -fore * 0.55;
      const geo = shieldGeo(shape);
      // face (plan de face normale +X), dos métallique, bord
      const rot = [0, HP, 0];
      add(bone, rimL, geo, rim, [ox, cy, 0], [W * 1.04, H * 1.04, 0.03], rot);
      add(bone, faceL === 'glow' ? 'glow' : faceL, geo, face, [ox + 0.012, cy, 0], [W * 0.9, H * 0.92, 0.03], rot);
      // bosse centrale + rivets du bord
      const boss = C(o.boss, P0.gold);
      if (shape === 'round' || o.boss) add(bone, o.boss === 'gold' || !o.boss ? 'gold' : 'metal', GE.dome(1), boss, [ox + 0.028, cy + (shape === 'round' ? 0 : H * 0.08), 0], [0.13, 0.05, 0.13], [0, 0, -HP]);
      const nR = shape === 'round' ? 10 : 8;
      for (let i = 0; i < nR; i++) {
        const a = i / nR * TAU;
        let px, py;
        if (shape === 'round') { px = Math.cos(a) * W * 0.47; py = Math.sin(a) * H * 0.47; } else { px = Math.cos(a) * W * 0.42; py = Math.sin(a) * H * 0.38 + H * 0.06; }
        add(bone, rimL === 'trans' ? 'metal' : rimL, GE.rivet(), shade(rim, 0.2), [ox + 0.03, cy + py, px], [0.025, 0.012, 0.025], [0, 0, -HP], NO);
      }
      // emblème (couche glow → relique « feu » pour Guerrier/Paladin)
      const em = o.emblem;
      if (em !== null) {
        const ec = C(o.emblemColor, P0.gold);
        const ex = ox + 0.034, ey = cy + (shape === 'round' ? 0 : H * 0.06);
        const L = 'glow';
        switch (em) {
          case 'sun': case 'sunrise':
            add(bone, L, GE.cyl(12), ec, [ex, ey, 0], [W * 0.26, 0.012, W * 0.26], [0, 0, HP]);
            for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(bone, L, GE.cone(4), ec, [ex, ey + Math.sin(a) * W * 0.22, Math.cos(a) * W * 0.22], [0.04, W * 0.14, 0.012], [a - HP, 0, 0], NO); }
            break;
          case 'snowflake': for (let i = 0; i < 3; i++) add(bone, L, GE.box(), ec, [ex, ey, 0], [0.012, W * 0.5, 0.035], [i * PI / 3, 0, 0], NO); break;
          case 'crescent': add(bone, L, GE.torus(0.3, 12), ec, [ex, ey, 0], [W * 0.38, W * 0.38, 0.03], [0.6, HP, 0]); break;
          case 'oak-leaf': add(bone, L, GE.panel({ cv: 0.05, fl: 0.1, th: 0.1, n: 3, tip: 0.3 }), ec, [ex, ey + H * 0.15, 0], [W * 0.3, H * 0.4, W * 0.3], [0, HP, 0], NO); break;
          default: // tower / tour : tour crénelée
            add(bone, L, GE.box(), ec, [ex, ey - H * 0.03, 0], [0.012, H * 0.3, W * 0.2], null);
            for (let i = -1; i <= 1; i++) add(bone, L, GE.box(), ec, [ex, ey + H * 0.15, i * W * 0.08], [0.012, H * 0.06, W * 0.05], null, NO);
        }
        if (o.gem) gemAt(bone, [ex + 0.01, ey - H * 0.25, 0], 0.03, C(o.gem, P0.gem), 'gem', [0, 0, -HP]);
      }
      // sangles intérieures (énarmes)
      for (const t of [0.25, 0.75]) add(bone, 'leather', GE.box(), P0.leatherD, [ox - 0.02, -fore * t, 0], [0.025, 0.03, fr * 2.4], null, NO);
      // usure : éraflures sur le bord (petits éclats sombres)
      if (o.wear) for (let i = 0; i < 3; i++) add(bone, rimL, GE.box(), shade(rim, -0.35), [ox + 0.016, cy + H * (0.3 - i * 0.28), W * (i % 2 ? 0.3 : -0.25)], [0.005, 0.04, 0.012], [0.4 * i, 0, 0], NO);
    }
    function shieldGeo(shape) {
      return U.cache('shield|' + shape, () => {
        const T = window.THREE;
        const s = new T.Shape();
        if (shape === 'round') { s.absarc(0, 0, 0.5, 0, TAU, false); }
        else if (shape === 'kite') { s.moveTo(-0.5, 0.38); s.quadraticCurveTo(0, 0.52, 0.5, 0.38); s.quadraticCurveTo(0.48, -0.1, 0, -0.5); s.quadraticCurveTo(-0.48, -0.1, -0.5, 0.38); }
        else { s.moveTo(-0.5, 0.5); s.lineTo(0.5, 0.5); s.lineTo(0.5, 0.1); s.quadraticCurveTo(0.45, -0.3, 0, -0.5); s.quadraticCurveTo(-0.45, -0.3, -0.5, 0.1); s.lineTo(-0.5, 0.5); }
        const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 8 });
        g.translate(0, 0, -0.5);
        return g;
      });
    }

    // =============================================================== par type d'arme
    const B = 'weaponR';
    if (kind === 'sword') {
      const bl = parts.blade || {}, gd = parts.guard || {}, gp = parts.grip || {}, pm = parts.pommel || {};
      const len = Math.min(0.9, (+bl.len || 1.0) * 0.86), wid = +bl.width || 0.085, gl = Math.min(0.22, +gp.len || 0.22);
      const bmat = LAY(bl.mat, 'blade');
      grip(B, 0.02, gl, 0.024, C(gp.color, P0.primary), LAY(gp.mat, 'leather'));
      guard(B, 0.02 + gl / 2 + 0.02, +gd.len || 0.32, gd.style || 'straight-upturned', C(gd.color, P0.gold), LAY(gd.mat, 'gold'), gd.gem === false ? null : C(gd.gem || 'gem', P0.gem));
      blade(B, 0.02 + gl / 2 + 0.04, len, wid * 1.0, 0.026, { style: bl.style, waves: bl.waves, fuller: +bl.fuller || 0.6, engraved: bl.engraved || variant === 'souveraine' || variant === 'soleil', layer: bmat === 'glow' ? 'blade' : bmat, col: C(bl.color, P0.blade) });
      if (bl.energy) blade(B, 0.02 + gl / 2 + 0.06, len * 0.9, wid * 1.35, 0.012, { layer: 'glow', col: P0.glow, outline: false });
      if (bl.frost) for (let i = 0; i < 4; i++) add(B, 'trans', GE.octa(), P0.trans, [0, (i % 2 ? 1 : -1) * wid * 0.45, 0.02 + gl / 2 + 0.2 + i * 0.2], [0.02, 0.06, 0.03], [i, 0, 0.5], NO);
      pommel(B, 0.02 - gl / 2 - 0.035, pm.style || 'disc', C(pm.color, P0.gold), LAY(pm.mat, 'gold'));
      if (parts.ribbon) add(B, 'cloth2', GE.panel({ cv: 0.1, fl: 1.4, th: 0.1, n: 3, jag: 0.1 }), C(parts.ribbon.color, P0.primary), [0, -0.01, 0.02 - gl / 2 - 0.06], [0.04, 0.2, 0.04], [0, HP, 0.15], NO);
      const off = w.offhand;
      if (off && !off.floating) shield(off);
      else if (off && off.floating) { // fragments de bouclier flottants (mythique) : 5 éclats autour du bras gauche
        const fb = R.bones.forearmL ? 'forearmL' : 'chest';
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; add(fb, 'glow', GE.octa(), i % 2 ? P0.glow : P0.gold, [0.14 + Math.cos(a) * 0.05, -0.14 + Math.sin(a) * 0.2, Math.cos(a + 1) * 0.18], [0.07, 0.16, 0.025], [a, HP, 0]); }
        add(fb, 'gold', GE.torus(0.12, 18), P0.gold, [0.12, -0.14, 0], [0.5, 0.5, 0.2], [0, HP, 0], NO);
      }
      glowOut.weapon = { bone: B, layer: 'blade' };
    } else if (kind === 'mace') {
      const hd = parts.head || {}, sh = parts.shaft || {}, gm = parts.gem || {};
      const len = 0.7;
      add(B, 'metal', GE.cyl(8), P0.metalD, [0, 0, len * 0.28], [0.036, len * 1.02, 0.036], CYLZ);
      add(B, 'blade', GE.cyl(8), P0.metal, [0, 0, 0.13], [0.05, 0.05, 0.05], CYLZ); // virole au-dessus du poing (lueur de forge jusqu'à la main)
      grip(B, 0.0, 0.2, 0.026, C(sh.color, P0.secondary), 'leather');
      add(B, 'gold', GE.cyl(10), P0.gold, [0, 0, 0.12], [0.06, 0.025, 0.06], CYLZ);
      pommel(B, -0.13, 'ball', C((parts.pommel || {}).color, P0.gold), 'gold');
      const zH = 0.66;
      const hc = C(hd.color, P0.metal);
      add(B, 'blade', GE.sph(), hc, [0, 0, zH], [0.17, 0.17, 0.22]);
      const style = hd.style || 'flanged';
      if (style === 'spiked') for (let i = 0; i < (hd.spikes || 8); i++) { const a = i / (hd.spikes || 8) * TAU; add(B, 'blade', GE.spike(), shade(hc, 0.1), [Math.cos(a) * 0.1, Math.sin(a) * 0.1, zH + (i % 2 ? 0.04 : -0.04)], [0.05, 0.12, 0.05], alignEuler([Math.cos(a), Math.sin(a), 0], [0, 0, 1])); }
      else for (let i = 0; i < (hd.flanges || 6); i++) {
        const a = i / (hd.flanges || 6) * TAU;
        add(B, 'blade', GE.panel({ cv: 0, fl: 0.6, th: 0.25, n: 2, tip: 0.2 }), style === 'flanged-obsidian' ? 0x1a1a22 : shade(hc, 0.08), [Math.cos(a) * 0.07, Math.sin(a) * 0.07, zH + 0.11], [0.15, 0.26, 0.15], alignEuler([0, 0, -1], [Math.cos(a), Math.sin(a), 0], [0, HP, 0]));
      }
      if (style === 'flanged-obsidian') add(B, 'glow', GE.sph(), P0.glow, [0, 0, zH], [0.09, 0.09, 0.14], null, NO);
      add(B, 'gold', GE.torus(0.25, 12), C(hd.trim, P0.gold), [0, 0, zH - 0.11], [0.15, 0.15, 0.06], null, NO);
      add(B, 'glow', GE.gemCut(), C(gm.color, P0.glow), [0, 0, zH + 0.15], [0.06, 0.07, 0.06], [-HP, 0, 0]);
      if (w.offhand) shield(w.offhand);
      glowOut.weapon = { bone: B, layer: 'blade' };
    } else if (kind === 'staff') {
      const sh = parts.shaft || {}, hd = parts.head || {}, orb = parts.orb || {}, rings = parts.rings || {};
      const len = Math.max(2.0, +sh.len || 1.75), z0 = -0.85, z1 = z0 + len;
      const scol = C(sh.color, P0.leatherD);
      const living = sh.style === 'living-branch';
      // fût en 3 tronçons légèrement décalés (bois noueux) + bagues
      for (let i = 0; i < 3; i++) add(B, 'leather', GE.fr(0.86, 8), shade(scol, i * 0.05 - (sh.charred ? 0.2 : 0)), [living ? (i - 1) * 0.008 : 0, 0, z0 + len * (i + 0.5) / 3], [0.05 - i * 0.004, len / 3 + 0.01, 0.05 - i * 0.004], [HP, 0, (i - 1) * 0.04]);
      if (sh.twist) for (let i = 0; i < 9; i++) add(B, 'leather', GE.torus(0.3, 8), shade(scol, 0.15), [0, 0, z0 + 0.25 + i * 0.12], [0.052, 0.052, 0.03], [0.3, 0, 0], NO);
      if (sh.bands !== false) for (const t of [0.62, 0.86]) add(B, 'gold', GE.cyl(10), P0.gold, [0, 0, z0 + len * t], [0.06, 0.03, 0.06], CYLZ);
      for (const z of [-0.12, 0.12]) add(B, 'blade', GE.cyl(10), C(rings.color, P0.gold), [0, 0, z], [0.062, 0.03, 0.062], CYLZ); // bagues runiques encadrant la main
      grip(B, 0.0, 0.18, 0.027, P0.leather, 'leather');
      add(B, 'metal', GE.cone(8), C((parts.foot || {}).color, P0.metal), [0, 0, z0 - 0.05], [0.045, 0.1, 0.045], [-HP, 0, 0]);
      if (living) for (let i = 0; i < 5; i++) add(B, 'cloth2', GE.panel({ cv: 0.2, fl: 0.2, th: 0.1, n: 3, tip: 0.3 }), shade(C(sh.leaves, 0x3fbf6a), (i % 3) * 0.07), [Math.cos(i * 2.1) * 0.03, Math.sin(i * 2.1) * 0.03, z0 + len * (0.55 + i * 0.08)], [0.06, 0.09, 0.06], alignEuler([Math.cos(i * 2.1), Math.sin(i * 2.1), 0.5], [0, 0, 1]), NO);
      // tête : trois griffes (ou racines, ou armillaire) enserrant l'orbe
      const style = hd.style || 'three-claws';
      const hcol = C(hd.color, P0.gold), hL = LAY(hd.mat, 'gold');
      const r = +orb.r || 0.11, zo = z1 + r * 1.1;
      add(B, hL, GE.fr(1.6, 10), hcol, [0, 0, z1 - 0.02], [0.06, 0.08, 0.06], CYLZ);
      if (style === 'armillary') {
        for (let i = 0; i < 3; i++) add(B, 'gold', GE.torus(0.06, 20), hcol, [0, 0, zo], [r * 3.0, r * 3.0, r * 3.0], [i * 1.05, i * 0.7, 0], NO);
      } else {
        const n = style === 'roots' ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU;
          add(B, hL, GE.spike(), hcol, [Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, zo - r * 0.2], [0.03, r * 2.6, 0.03], alignEuler([-Math.cos(a) * 0.35, -Math.sin(a) * 0.35, 1], [Math.cos(a), Math.sin(a), 0]));
          add(B, hL, GE.sphLo(), shade(hcol, 0.1), [Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, zo - r * 0.9], 0.03, null, NO);
        }
      }
      // anneaux runiques (couche blade : lueur forge « Arme de classe »)
      const nRing = Math.max(0, +rings.count || 2);
      for (let i = 0; i < nRing; i++) add(B, 'blade', GE.torus(0.07, 20), C(rings.color, P0.gold), [0, 0, zo], [r * (2.4 + i * 0.5), r * (2.4 + i * 0.5), r * (2.4 + i * 0.5)], [0.7 + i * 0.9, 0.4 * i, 0], NO);
      if (!nRing) add(B, 'blade', GE.torus(0.1, 12), P0.gold, [0, 0, z1 - 0.06], [0.08, 0.08, 0.05], null, NO);
      // orbe (couche glow, relique) + cœur
      add(B, 'glow', GE.sph(), C(orb.color, P0.gem), [0, 0, zo], r * 2);
      add(B, 'gem', GE.ico(), C(orb.core, P0.accent), [0, 0, zo], r * 1.0, null, NO);
      const nSh = (parts.shards && +parts.shards.count) || 0;
      for (let i = 0; i < nSh; i++) { const a = i / nSh * TAU; add(B, 'trans', GE.octa(), P0.trans, [Math.cos(a) * 0.22, Math.sin(a) * 0.22, zo], [0.04, 0.1, 0.04], alignEuler([0, 0, 1], [Math.cos(a), Math.sin(a), 0]), NO); }
      glowOut.weapon = { bone: B, layer: 'blade' };
    } else if (kind === 'scepter') {
      const sh = parts.shaft || {}, hd = parts.head || {}, gp = parts.grip || {};
      const len = Math.max(1.3, +sh.len || 1.2), z0 = -0.4, z1 = z0 + len;
      add(B, 'blade', GE.fr(0.8, 8), C(sh.color, P0.metal), [0, 0, (z0 + z1) / 2], [0.042, len, 0.042], CYLZ);
      grip(B, 0.0, 0.2, 0.026, C(gp.color, 0xf0f4fa), 'leather');
      for (const t of [0.42, 0.7]) add(B, 'gold', GE.torus(0.3, 10), P0.gold, [0, 0, z0 + len * t], [0.05, 0.05, 0.03], null, NO);
      add(B, 'metal', GE.sph(), P0.metalD, [0, 0, z0 - 0.02], [0.05, 0.05, 0.06]);
      // fourche asymétrique : branche glace (gauche, cristal) / branche cuivre (droite)
      const left = hd.left || {}, right = hd.right || {};
      add(B, 'gold', GE.sph(), P0.gold, [0, 0, z1], [0.07, 0.07, 0.07]);
      const crystal = (side, o, isIce) => {
        const L = LAY(o.mat, isIce ? 'trans' : 'gold');
        const col = C(o.color, isIce ? P0.accent : P0.gold);
        const sy = side;
        if (isIce || L === 'trans') {
          add(B, L === 'trans' ? 'blade' : L, GE.octa(), col, [0, sy * 0.07, z1 + 0.14], [0.06, 0.24, 0.06], alignEuler([0, sy * 0.4, 1], [1, 0, 0]));
          add(B, L === 'trans' ? 'blade' : L, GE.octa(), shade(col, 0.3), [0, sy * 0.12, z1 + 0.06], [0.035, 0.12, 0.035], alignEuler([0, sy * 1.0, 1], [1, 0, 0]), NO);
        } else {
          add(B, 'gold', GE.cyl(6), col, [0, sy * 0.06, z1 + 0.11], [0.025, 0.2, 0.025], alignEuler([0, sy * 0.45, 1], [1, 0, 0]));
          for (let i = 0; i < 3; i++) add(B, 'gold', GE.torus(0.25, 8), shade(col, 0.15), [0, sy * (0.04 + i * 0.022), z1 + 0.06 + i * 0.045], [0.04, 0.04, 0.03], alignEuler([0, sy * 0.45, 1], [1, 0, 0], [HP, 0, 0]), NO);
          add(B, 'gem', GE.octa(), C(o.color2, P0.accent2), [0, sy * 0.11, z1 + 0.22], [0.04, 0.07, 0.04], null, NO);
        }
      };
      const prism = hd.style === 'crystal-fork';
      crystal(1, left, true);
      crystal(-1, right, prism);
      // arc électrique entre les branches (glow, relique)
      add(B, 'glow', GE.torus(0.08, 12), C((parts.arc || {}).color, P0.accent2), [0, 0, z1 + 0.16], [0.16, 0.16, 0.12], [0, HP, 0], NO);
      add(B, 'gem', GE.gemCut(), P0.gem, [0, 0, z1 + 0.02], [0.05, 0.05, 0.05], [-HP, 0, 0], NO);
      glowOut.weapon = { bone: B, layer: 'blade' };
    } else if (kind === 'scythe') {
      const sh = parts.shaft || {}, bl = parts.blade || {}, sk = parts.skull || {};
      const len = Math.max(2.1, +sh.len || 2.0), z0 = -0.8, z1 = z0 + len;
      const scol = C(sh.color, 0x1a141e), sL = LAY(sh.mat, 'leather');
      for (let i = 0; i < 4; i++) add(B, sL, GE.fr(0.9, 7), shade(scol, (i % 2) * 0.08), [(i % 2 ? 0.006 : -0.006), 0, z0 + len * (i + 0.5) / 4], [0.05, len / 4 + 0.01, 0.05], [HP, 0, (i % 2 ? 0.03 : -0.03)]);
      if (sh.gnarled !== false) for (let i = 0; i < 4; i++) add(B, sL, GE.sphLo(), shade(scol, 0.1), [0.012 * (i % 2 ? 1 : -1), 0, z0 + len * (0.2 + i * 0.2)], [0.065, 0.06, 0.07], null, NO);
      grip(B, 0.0, 0.2, 0.028, P0.leatherD, 'leather');
      grip(B, 0.55, 0.16, 0.028, P0.leatherD, 'leather');
      for (const z of [-0.13, 0.13]) add(B, 'blade', GE.cyl(8), P0.metal, [0, 0, z], [0.064, 0.03, 0.064], CYLZ); // viroles d'âme (lueur de forge près de la main)
      if (sh.chain) for (let i = 0; i < 6; i++) add(B, sh.chain === 'gold' ? 'gold' : 'metal', GE.torus(0.25, 8), sh.chain === 'gold' ? P0.gold : P0.metal, [0, -0.03 - i * 0.002, z1 - 0.15 - i * 0.045], [0.035, 0.035, 0.03], [i % 2 ? HP : 0, 0, 0], NO);
      add(B, 'metal', GE.spike(), P0.metalD, [0, 0, z0 - 0.08], [0.04, 0.16, 0.04], [-HP, 0, 0]);
      // lame courbe : part de l'extrémité, vers -Y (vers l'avant quand le fût est dressé), se recourbe
      const blen = +bl.len || 0.9, bw = +bl.width || 0.16;
      const bcol = C(bl.color, P0.blade), bL = LAY(bl.mat, 'blade');
      // croissant : l'échelle X suit la LONGUEUR (sinon la courbure, multipliée par la largeur, disparaissait → planche droite)
      const sx = blen * 0.6, hw = (bw * 0.5) / sx, cur = -(+bl.curve || 0.8) * 1.15;
      const prof = bl.style === 'serrated'
        ? [[0, hw], [0.15, hw * 1.15], [0.3, hw * 0.85], [0.45, hw * 1.05], [0.6, hw * 0.75], [0.75, hw * 0.7], [0.9, hw * 0.35], [1, 0]]
        : [[0, hw], [0.25, hw * 1.1], [0.5, hw * 0.95], [0.75, hw * 0.6], [0.9, hw * 0.3], [1, 0]];
      const g = GE.blade('scythe2|' + (bl.style || 's') + '|' + cur.toFixed(2) + '|' + hw.toFixed(3), prof, cur, 0);
      const RB = alignEuler([0, -1, 0], [0, 0, 1]);
      add(B, bL === 'bone' ? 'bone' : 'blade', g, bcol, [0, 0, z1 - 0.08], [sx, blen, 0.03], RB);
      if (bl.edgeGlow) {
        // fil lumineux le long du bord intérieur (côté concave), même courbe que la lame
        const ep = prof.map(([y, w]) => [y, Math.min(w, hw * 0.16), -(w - Math.min(w, hw * 0.16))]);
        add(B, 'glow', GE.blade('scythe2Edge|' + cur.toFixed(2) + '|' + hw.toFixed(3) + '|' + (bl.style || 's'), ep, cur, 0), C(bl.edge, P0.glow), [0, 0, z1 - 0.08], [sx, blen * 1.005, 0.036], RB, NO);
      }
      // collier + crâne à la jonction (yeux = glow → relique)
      add(B, 'metal', GE.cyl(8), P0.metalD, [0, -0.02, z1 - 0.06], [0.07, 0.11, 0.07], CYLZ);
      const skc = C(sk.color, P0.bone), skL = LAY(sk.mat, 'bone');
      add(B, skL, GE.sph(), skc, [0, 0.06, z1 - 0.13], [0.11, 0.1, 0.12]);
      add(B, skL, GE.box(), shade(skc, -0.1), [0, 0.035, z1 - 0.2], [0.07, 0.04, 0.06]);
      for (const sx of [-1, 1]) add(B, 'glow', GE.sphLo(), C(sk.eyes, P0.glow), [sx * 0.026, 0.1, z1 - 0.15], 0.025, null, NO);
      glowOut.weapon = { bone: B, layer: 'blade' };
    } else if (kind === 'daggers' || kind === 'twin-blades') {
      const twin = kind === 'twin-blades';
      const bl = parts.blade || {}, gd = parts.guard || {}, gp = parts.grip || {}, pm = parts.pommel || {};
      const len = +bl.len || (twin ? 0.5 : 0.42), wid = +bl.width || (twin ? 0.055 : 0.05), gl = +gp.len || 0.12;
      const back = !!bl.reverse;
      const bmat = LAY(bl.mat, 'blade');
      const style = bl.style === 'serrated-zigzag' ? 'serrated-zigzag' : twin ? 'ogive' : 'leaf';
      for (const bn of ['weaponR', 'weaponL']) {
        if (!R.bones[bn]) continue;
        const dz = back ? -1 : 1;
        grip(bn, 0, gl, 0.02, C(gp.color, P0.leatherD), 'leather');
        guard(bn, dz * (gl / 2 + 0.012), twin ? 0.12 : 0.15, gd.style || (twin ? 'crescent' : 'S'), C(gd.color, P0.metal), LAY(gd.mat, 'metal'), null);
        blade(bn, gl / 2 + 0.02, len, wid, 0.018, { style, curve: (+bl.curve || 0) * (back ? -1 : 1), back, layer: bmat === 'trans' ? 'blade' : bmat, col: C(bl.color, P0.blade) });
        // fil lumineux (couche glow = « Focalisateur » pour l'Assassin)
        if (twin || bl.edgeGlow) add(bn, 'glow', GE.blade('edge|' + (+bl.curve || 0), [[0, 0.1], [0.8, 0.08], [1, 0]], (+bl.curve || 0) * 4 * (back ? -1 : 1), 0), C(bl.edge, P0.edge), [0, wid * 0.42, (gl / 2 + 0.03) * dz], [wid * 0.35, len * 0.94, 0.02], back ? BACKW : ALONG, NO);
        const pz = -dz * (gl / 2 + 0.02);
        pommel(bn, pz, pm.style || 'ring', C(pm.color, P0.metal), LAY(pm.mat, 'metal'));
        if (pm.tassel) add(bn, 'cloth2', GE.panel({ cv: 0.1, fl: 1.6, th: 0.1, n: 3, jag: 0.15 }), C(pm.tassel, P0.accent), [0, -0.02, pz - dz * 0.04], [0.03, 0.12, 0.03], [0, HP, 0.2], NO);
        if (bl.void) add(bn, 'glow', GE.blade('void', [[0, 0.3], [0.85, 0.25], [1, 0]], 0, 0), C(bl.core, P0.glow), [0, 0, (gl / 2 + 0.03) * dz], [wid * 0.5, len * 0.9, 0.022], back ? BACKW : ALONG, NO);
      }
      // Voleur : lames de lancer (anneaux plats) à la ceinture droite (relique « feu » = boucle de la sacoche)
      if (!twin) {
        const tb = R.bones.beltR ? 'beltR' : 'hips';
        const th = parts.throwing || {};
        for (let i = 0; i < 3; i++) add(tb, 'metal', GE.torus(0.28, 10), C(th.color, P0.metal), [-0.02, -0.04 - i * 0.012, 0.04 + i * 0.03], [0.06, 0.06, 0.03], [0.2 * i, -1.2, 0], NO);
        add(tb, 'glow', GE.gemCut(), P0.glow, [-0.035, 0.02, 0.06], [0.03, 0.025, 0.03], [0, -1.2, HP], NO);
      } else {
        // Assassin : fiole du Voile à la ceinture gauche (relique)
        const vb = R.bones.beltL ? 'beltL' : 'hips';
        add(vb, 'leather', GE.box(), P0.leatherD, [0.02, 0.0, 0.03], [0.05, 0.03, 0.05], [0, 1.2, 0]);
        add(vb, 'glow', GE.vial(), P0.glow, [0.02, -0.06, 0.03], [0.045, 0.1, 0.045], null);
      }
      glowOut.weapon = { bone: 'weaponR', layer: 'blade' };
    } else if (kind === 'longbow') {
      const lm = parts.limbs || {}, tp = parts.tips || {}, gp = parts.grip || {}, st = parts.string || {}, ar = parts.arrow || {};
      const BL = R.bones.weaponL ? 'weaponL' : 'weaponR';
      const len = +lm.len || 1.7, half = len / 2, rec = +lm.recurve || 0.2;
      const lcol = C(lm.color, P0.blade), lL = 'blade'; // toujours 'blade' : game.js et setHeroWeaponLevel s'appuient sur ud.blade (branches lumineuses : couleur claire + lueur de palier)
      // branches : 4 segments par côté, courbés vers +Y (côté archer), section décroissante
      const N = 4; let prev = null;
      const pts = [];
      for (let i = 0; i <= N; i++) { const t = i / N; pts.push([0, 0.16 * t * t * (1 - rec * 0.8) + (t > 0.8 ? -rec * 0.25 * (t - 0.8) * 5 : 0), t * half]); }
      for (const sz of [1, -1]) {
        for (let i = 0; i < N; i++) {
          const a = pts[i], b = pts[i + 1];
          const dy = b[1] - a[1], dz = (b[2] - a[2]) * sz, l = Math.hypot(dy, dz);
          const wdt = 0.045 * (1 - i * 0.16);
          add(BL, lL, GE.box(), shade(lcol, i % 2 ? -0.04 : 0.03), [0, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 * sz], [wdt * 0.8, wdt, l * 1.04], [-Math.atan2(dy, dz), 0, 0]);
          // ventre (face interne) de couleur différente
          add(BL, 'leather', GE.box(), C(lm.belly, 0x8a5a2e), [0, (a[1] + b[1]) / 2 + wdt * 0.45, (a[2] + b[2]) / 2 * sz], [wdt * 0.6, wdt * 0.15, l * 1.0], [-Math.atan2(dy, dz), 0, 0], NO);
        }
        // pointes en corne / os + encoches
        const e = pts[N];
        add(BL, LAY(tp.mat, 'bone'), GE.spike(), C(tp.color, P0.bone), [0, e[1], e[2] * sz + sz * 0.035], [0.03, 0.08, 0.03], [sz > 0 ? HP : -HP, 0, 0]);
        // gravures dorées sur la branche
        if (lm.carvings) for (let i = 1; i < 3; i++) add(BL, 'gold', GE.box(), C(lm.carvings, P0.gold), [0.019, pts[i][1], pts[i][2] * sz], [0.004, 0.02, 0.06], null, NO);
        if (lm.leaves) for (let i = 1; i < 4; i++) add(BL, 'cloth2', GE.panel({ cv: 0.2, fl: 0.2, th: 0.1, n: 3, tip: 0.3 }), shade(C(lm.leaves, 0x3fa070), i * 0.06), [0.02, pts[i][1] - 0.02, pts[i][2] * sz], [0.05, 0.08, 0.05], [0, HP, sz * 0.6], NO);
        if (lm.veins) add(BL, 'glow', GE.box(), C(lm.veins, P0.glow), [0.02, pts[2][1], pts[2][2] * sz], [0.004, 0.012, half * 0.6], null, NO);
      }
      // poignée gainée + repose-flèche
      grip(BL, 0, 0.16, 0.03, C(gp.color, P0.primary), 'leather');
      add(BL, 'leather', GE.box(), P0.leatherD, [0, -0.035, 0.07], [0.02, 0.02, 0.03], null, NO);
      // corde (fine, sans contour) tendue entre les pointes côté +Y
      const tipY = pts[N][1] + 0.025;
      add(BL, 'cloth2', GE.cyl(4), C(st.color, 0xf4f4f0), [0, tipY + 0.0, 0], [0.006, len, 0.006], CYLZ, NO);
      // flèche encochée dans la main droite (pointe vers l'avant)
      if (R.bones.weaponR && BL !== 'weaponR') arrow('weaponR', 0.18, ar, 0.75);
      // carquois dans le dos (os back) : étui de cuir + bandes + flèches (pointes = glow → Focalisateur)
      quiver(ar);
      // talisman de Sylvanie (relique) sur beltR
      const tb = R.bones.beltR ? 'beltR' : 'hips';
      add(tb, 'cloth2', GE.cyl(4), P0.leatherD, [-0.01, -0.03, 0.03], [0.006, 0.08, 0.006], null, NO);
      add(tb, 'glow', GE.octa(), P0.glow, [-0.01, -0.09, 0.03], [0.04, 0.06, 0.02], null);
      glowOut.weapon = { bone: BL, layer: 'blade' };
    }

    // --------------------------------------------------------------- reliques / focalisateurs à la ceinture (Mage, Paladin, Nécro)
    if (cls === 'Mage' || cls === 'Paladin' || cls === 'Necromancien') {
      const bb = R.bones.beltL ? 'beltL' : 'hips';
      if (cls === 'Necromancien') { // phylactère : cage dorée + âme verte
        add(bb, 'metal', GE.cyl(6), P0.metalD, [0.02, -0.02, 0.04], [0.06, 0.012, 0.06], null);
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; add(bb, 'metal', GE.cyl(4), P0.metal, [0.02 + Math.cos(a) * 0.025, -0.07, 0.04 + Math.sin(a) * 0.025], [0.008, 0.1, 0.008], null, NO); }
        add(bb, 'glow', GE.octa(), P0.glow, [0.02, -0.07, 0.04], [0.04, 0.07, 0.04], null);
        add(bb, 'metal', GE.cone(6), P0.metalD, [0.02, -0.13, 0.04], [0.06, 0.03, 0.06], [PI, 0, 0]);
      } else { // gemme sertie du grimoire / livre des serments (le livre lui-même est porté par la tenue)
        add(bb, 'gold', GE.torus(0.3, 10), P0.gold, [0.06, -0.07, 0.07], [0.05, 0.05, 0.03], [0, 1.1, 0], NO);
        add(bb, 'glow', GE.gemCut(), P0.glow, [0.065, -0.07, 0.075], [0.035, 0.03, 0.035], [0, 1.1, HP]);
      }
    }

    function arrow(bone, z0, ar, len) {
      const L = len || 0.75;
      add(bone, 'leather', GE.cyl(5), C(ar.shaft, 0xd8c098), [0, 0, z0], [0.012, L, 0.012], CYLZ, NO);
      add(bone, LAY(ar.headMat, 'metal'), GE.blade('arrowhead', [[0, 0.3], [0.3, 0.5], [1, 0]], 0, 0), ar.headMat === 'glow' ? P0.glow : P0.metal, [0, 0, z0 + L / 2], [0.035, 0.07, 0.01], ALONG);
      const fl = ar.fletch || [0xf4f4f0, 0xc8322a];
      for (let i = 0; i < 3; i++) add(bone, 'cloth2', GE.panel({ cv: 0, fl: 0.5, th: 0.1, n: 2 }), C(fl[i % fl.length], 0xf4f4f0), [0, 0, z0 - L / 2 + 0.06], [0.03, 0.1, 0.03], alignEuler([0, 0, -1], [Math.cos(i * TAU / 3), Math.sin(i * TAU / 3), 0], [0, HP, 0]), NO);
    }
    function quiver(ar) {
      const qb = R.bones.back ? 'back' : 'chest';
      const base = qb === 'back' ? [0, 0, -0.03] : [0, 0.25, -0.2];
      const tilt = [0, 0, -0.5]; // en diagonale : ouverture au-dessus de l'épaule droite (côté -X)
      const ax = [Math.sin(0.5), Math.cos(0.5), 0];
      const at = (t, r) => [base[0] - ax[0] * t + (r ? r[0] : 0), base[1] + ax[1] * t + (r ? r[1] : 0), base[2] + (r ? r[2] : 0)];
      add(qb, 'leather', GE.fr(1.15, 10), P0.leather, at(0), [0.12, 0.55, 0.1], [0, 0, 0.5]);
      add(qb, 'leather', GE.cyl(10), P0.leatherD, at(-0.27), [0.11, 0.03, 0.09], [0, 0, 0.5]);
      for (const t of [-0.15, 0.12, 0.25]) add(qb, 'leather', GE.torus(0.25, 10), t > 0.2 ? P0.gold : P0.leatherD, at(t), [0.135, 0.135, 0.06], [HP, 0, 0.5], NO);
      // flèches qui dépassent (empennage) ; pointes non visibles ; lueur : petites gemmes dans l'ouverture (glow)
      for (let i = 0; i < 6; i++) {
        const dx = (i % 3 - 1) * 0.025, dz = (i < 3 ? -0.015 : 0.015);
        add(qb, 'leather', GE.cyl(4), C(ar.shaft, 0xd8c098), at(0.33, [dx, 0, dz]), [0.01, 0.16, 0.01], [0, 0, 0.5], NO);
        const fl = ar.fletch || [0xf4f4f0, 0xc8322a];
        add(qb, 'cloth2', GE.panel({ cv: 0, fl: 0.5, th: 0.1, n: 2 }), C(fl[i % fl.length], 0xf4f4f0), at(0.44, [dx, 0, dz]), [0.035, 0.1, 0.035], [0, i * 1.1, 0.5], NO);
      }
      add(qb, 'glow', GE.torus(0.2, 10), P0.glow, at(0.28), [0.1, 0.1, 0.06], [HP, 0, 0.5], NO);
      // sangle de poitrine (diagonale)
      if (R.bones.chest) {
        const P = R.P || {};
        const cw = (P.chestW || 0.19) * 2.5, cd = (P.chestD || 0.125) * 2.6, cy = (P.neckY || 0.29) * 0.5;
        add('chest', 'leather', GE.shell({ rt: 1.0, th: 0.08, n: 18 }), P0.leatherD, [0, cy, 0], [cw, 0.045, cd], [0, 0, -0.65]);
      }
    }

    R._a4w = { kind, variant, tris };
    return glowOut;
  }

  G.HeroWeapons = {
    build(R, spec) {
      try { return build(R, spec); } catch (e) { G.HeroWeapons.lastError = (e && e.stack) || String(e); if (window.console) console.error('[HeroWeapons]', e); if (G.HeroWeapons.rethrow) throw e; return result((spec && spec.classId) || 'Guerrier'); }
    },
    glowDefaults: DEFAULT_GLOW,
  };
})();
