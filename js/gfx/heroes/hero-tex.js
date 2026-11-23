window.G = window.G || {};
/* =====================================================================================
 * v6 « Incarnation » — hero-tex.js (A3 Texture Artist)
 * G.HeroTex : textures procédurales (canvas, aucune ressource réseau) + matériaux par couche.
 *
 * API (CONTRACT-V6 §2)
 *   G.HeroTex.mat(layer, opts)      -> matériau PARTAGÉ (cache, userData.shared = true)
 *   G.HeroTex.instance(layer, opts) -> même matériau, NON partagé (blade, flash…) ; textures partagées
 *   G.HeroTex.face(faceSpec)        -> matériau de tête avec décalque de visage peint (cache par clé)
 *   G.HeroTex.texture(name)         -> CanvasTexture partagée (ou null) ; G.HeroTex.TEX_NAMES
 *   G.HeroTex.stats()               -> { textures, bytes, faces, materials } (estimation mémoire, mips compris)
 *   G.HeroTex.FACE_LAYOUT           -> placement du visage dans l'UV de tête (sphere | lathe), surcharge : faceSpec.layout
 *   G.HeroTex.LAYERS                -> couches reconnues
 *   opts (tous facultatifs) : variant ('dark'|'polished'|'worn'|'silk'|'rough'|'wet'), side, opacity, transparent,
 *     flat (flatShading), emissive (hex), emissiveIntensity, tint (hex, multiplie le blanc), rough, metal,
 *     glow (0..1 : émission proportionnelle à la couleur de sommet), bump (multiplicateur), noMap, depthWrite
 *
 * Principe : chaque texture est un détail en niveaux de gris de moyenne ~0,9 ; la couleur du matériau
 * compense (1/moyenne) → la couleur de sommet (A2/A4) ressort fidèle « autour de 1,0 ». RepeatWrapping partout
 * (UV mises à l'échelle monde par HeroKit : ~1 répétition / 0,5 u). La même texture sert de bumpMap (0 octet en plus).
 *
 * CHOIX MÉTAL / OR / GEMME / LAME : MeshStandardMaterial (metalness + roughnessMap) + envMap procédural partagé
 *   (petite CubeTexture 6×32² peinte : plafond froid lumineux, torches chaudes, sol sombre ; mipmaps, sans PMREM).
 *   Raison : en r128 la MeshToonMaterial n'a plus de spéculaire → un métal toon ne « réagit » pas à la lumière ;
 *   le Standard donne le reflet spéculaire du soleil/des torches ET un reflet d'environnement indépendant de
 *   l'éclairage de la salle (le métal reste lisible et brillant dans les donjons sombres, vu de dessus le reflet
 *   vient du « plafond » clair de la cube map). Coût : 4 matériaux standard max par héros, petites surfaces à l'écran.
 *   Les reflets/bords polis sont en plus PEINTS dans la texture (bandes claires, éraflures brillantes) pour rester
 *   lisibles si l'envMap est indisponible (aperçu raster, stub).
 * Organiques (peau, tissus, cuir, cheveux, fourrure, os, lèvres) : MeshToonMaterial + gradientMap douce 4 tons partagée.
 * glow / trans / eye / eyeWhite : sous-classe toon « HTGlowToon » : émission = couleur de sommet × glowK (uniform),
 *   donc l'émissif reste libre pour le flash de dégâts (customProgramCacheKey distinct).
 * Budget : 256² max (visage : 256² en mode coque A2, 512×256 en repli sphère) ; statique ≈ 2,6 Mo (mips compris)
 *   + ≈ 0,35 Mo par visage coque (+ 0,09 Mo si marques lumineuses), LRU 6 visages.
 * Sans document (stub/Node) : matériaux sans textures, aucune exception.
 * ===================================================================================== */
(function () {
  'use strict';
  const G = window.G;
  const T = window.THREE;
  const LAYERS = ['skin', 'cloth', 'cloth2', 'leather', 'metal', 'gold', 'hair', 'eye', 'eyeWhite', 'lip', 'gem', 'glow', 'trans', 'cape', 'fur', 'bone', 'blade'];

  // ---------------------------------------------------------------- utilitaires
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    s = String(s); let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = t => t * t * (3 - 2 * t);
  function hexRGB(hex) { hex = (hex >>> 0) & 0xffffff; return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
  function toHex(v, def) {
    if (v == null) return def;
    if (typeof v === 'number') return v >>> 0;
    if (typeof v === 'string') { const s = v.replace('#', ''); const n = parseInt(s, 16); return isNaN(n) ? def : n; }
    if (v && v.isColor) return v.getHex();
    return def;
  }
  const HAS_DOC = (function () {
    try { return typeof document !== 'undefined' && !!document && typeof document.createElement === 'function'; } catch (e) { return false; }
  })();
  function mkCanvas(w, h) {
    if (!HAS_DOC) return null;
    try {
      const c = document.createElement('canvas'); c.width = w; c.height = h || w;
      const x = c.getContext && c.getContext('2d');
      if (!x || typeof x.getImageData !== 'function' || typeof x.putImageData !== 'function') return null;
      return c;
    } catch (e) { return null; }
  }

  // bruit de valeur PÉRIODIQUE (tuilable) : grille cx×cy, interpolation lissée → Float32Array [0,1]
  function vnoise(w, h, cx, cy, seed) {
    const r = rng(seed), lat = new Float32Array(cx * cy);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = y / h * cy, y0 = Math.floor(fy), ty = smooth(fy - y0), ya = (y0 % cy) * cx, yb = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < w; x++) {
        const fx = x / w * cx, x0 = Math.floor(fx), tx = smooth(fx - x0), xa = x0 % cx, xb = (x0 + 1) % cx;
        const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx;
        const b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
        out[y * w + x] = a + (b - a) * ty;
      }
    }
    return out;
  }
  function fbm(w, h, cx, cy, oct, seed, gain) {
    const out = new Float32Array(w * h); let amp = 1, tot = 0; gain = gain || 0.5;
    for (let o = 0; o < oct; o++) {
      const n = vnoise(w, h, Math.min(cx << o, w), Math.min(cy << o, h), seed + o * 101);
      for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
      tot += amp; amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  // Worley périodique : renvoie { f1, f2, id } (distances normalisées)
  function worley(w, h, cells, seed) {
    const r = rng(seed), pts = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + r()) / cells * w, (j + r()) / cells * h, r()]);
    const f1 = new Float32Array(w * h), f2 = new Float32Array(w * h), id = new Float32Array(w * h);
    const cw = w / cells, ch = h / cells;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ci = Math.floor(x / cw), cj = Math.floor(y / ch); let d1 = 1e9, d2 = 1e9, best = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        let ii = ci + di, jj = cj + dj, ox = 0, oy = 0;
        if (ii < 0) { ii += cells; ox = -w; } else if (ii >= cells) { ii -= cells; ox = w; }
        if (jj < 0) { jj += cells; oy = -h; } else if (jj >= cells) { jj -= cells; oy = h; }
        const p = pts[jj * cells + ii], dx = p[0] + ox - x, dy = p[1] + oy - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = p[2]; } else if (d < d2) d2 = d;
      }
      const k = y * w + x; f1[k] = d1 / cw; f2[k] = d2 / cw; id[k] = best;
    }
    return { f1, f2, id };
  }
  function putGray(ctx, w, h, f) { // f : Float32Array de valeurs 0..1
    const img = ctx.createImageData(w, h), d = img.data;
    for (let i = 0, j = 0; i < f.length; i++, j += 4) { const v = clamp(Math.round(f[i] * 255), 0, 255); d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  // dessine 9 fois (décalages ±w, ±h) → traits tuilables sans couture
  function W9(ctx, w, h, fn) {
    for (let dy = -h; dy <= h; dy += h) for (let dx = -w; dx <= w; dx += w) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); }
  }
  function meanLum(ctx, w, h) {
    try {
      const d = ctx.getImageData(0, 0, w, h).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      return s / (d.length / 4) / 255;
    } catch (e) { return 0.9; }
  }

  // ---------------------------------------------------------------- générateurs de textures
  // chacun : (ctx, w, h) → dessine ; renvoie rien
  const GEN = {};

  // TISSU (toile) : trame armure toile, fils irréguliers, plis verticaux doux, couture + points, usure
  GEN.cloth = function (ctx, w, h) {
    const slub = fbm(w, h, 8, 32, 3, 11), fold = fbm(w, h, 3, 1, 3, 12, 0.45), blot = fbm(w, h, 4, 4, 4, 13);
    const f = new Float32Array(w * h), P = 4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, cx = Math.floor(x / P), cy = Math.floor(y / P), lx = (x % P + 0.5) / P, ly = (y % P + 0.5) / P;
      const warp = ((cx + cy) & 1) === 0;
      const prof = warp ? Math.sin(Math.PI * lx) : Math.sin(Math.PI * ly);   // section du fil
      let v = 0.76 + 0.2 * prof + (slub[i] - 0.5) * 0.12;
      v *= 0.8 + 0.2 * smooth(clamp(fold[i] * 1.6 - 0.3, 0, 1));             // plis
      v *= 1 - 0.06 * smooth(clamp((blot[i] - 0.55) * 4, 0, 1));              // taches d'usure
      f[i] = v;
    }
    putGray(ctx, w, h, f);
    // couture verticale + points de couture de part et d'autre
    W9(ctx, w, h, () => {
      const sx = w * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(sx - 1, 0, 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(sx + 1, 0, 1, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < h; y += 8) { ctx.fillRect(sx - 6, y, 2, 4); ctx.fillRect(sx + 4, y + 4, 2, 4); }
    });
  };
  // TISSU 2 (sergé/laine fine) : côtes diagonales, fibres
  GEN.cloth2 = function (ctx, w, h) {
    const n = fbm(w, h, 8, 8, 3, 21), fib = vnoise(w, h, w / 2, h / 8, 22), fold = fbm(w, h, 2, 1, 2, 23);
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, d = ((x + y) % 4) / 4;
      let v = 0.78 + 0.16 * Math.sin(d * Math.PI) + (fib[i] - 0.5) * 0.08 + (n[i] - 0.5) * 0.12;
      v *= 0.84 + 0.16 * fold[i];
      f[i] = v;
    }
    putGray(ctx, w, h, f);
  };
  // CAPE (laine épaisse) : fibres, grands plis verticaux marqués, ourlet piqué
  GEN.cape = function (ctx, w, h) {
    const fib = vnoise(w, h, w / 2, h / 16, 31), n = fbm(w, h, 8, 8, 4, 32), fold = fbm(w, h, 4, 1, 2, 33, 0.4);
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const fo = Math.sin((x / w) * Math.PI * 4 + fold[i] * 5) * 0.5 + 0.5;    // plis verticaux
      let v = 0.8 + (fib[i] - 0.5) * 0.12 + (n[i] - 0.5) * 0.14;
      v *= 0.82 + 0.18 * smooth(fo);
      f[i] = v;
    }
    putGray(ctx, w, h, f);
    W9(ctx, w, h, () => { // une rangée de points (ourlet / surpiqûre horizontale)
      const y0 = h * 0.86;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, y0 - 1, w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let x = 0; x < w; x += 6) ctx.fillRect(x, y0 + 4, 3, 1.5);
    });
  };
  // CUIR : grain (Worley), plis, taches, surpiqûres, usure claire des bords
  GEN.leather = function (ctx, w, h) {
    const wo = worley(w, h, 40, 41), big = fbm(w, h, 3, 3, 4, 42), fine = vnoise(w, h, 128, 128, 43), wr = fbm(w, h, 2, 6, 3, 45);
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) {
      const crease = smooth(clamp((wo.f2[i] - wo.f1[i]) * 3.2, 0, 1));        // 0 sur les sillons du grain
      const wrinkle = 1 - Math.pow(1 - Math.abs(wr[i] - 0.5) * 2, 10);        // grands plis (lignes fines)
      let v = 0.74 + 0.12 * crease + (wo.id[i] - 0.5) * 0.04 + (fine[i] - 0.5) * 0.07;
      v *= 0.88 + 0.12 * wrinkle;
      v *= 0.82 + 0.18 * big[i];                                               // patine
      f[i] = v;
    }
    putGray(ctx, w, h, f);
    const r = rng(44);
    W9(ctx, w, h, () => {
      // usure claire (éraflures, bords frottés)
      for (let k = 0; k < 14; k++) {
        const x = r() * w, y = r() * h, l = 10 + r() * 30, a = (r() - 0.5) * 0.8;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.08 + r() * 0.12) + ')'; ctx.lineWidth = 1 + r() * 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    });
    W9(ctx, w, h, () => { // deux lignes de surpiqûre parallèles + rainure
      [w * 0.12, w * 0.58].forEach(sx => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx - 7, 0, 1.5, h);
        for (let y = 0; y < h; y += 9) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx - 1, y, 3, 2);      // trou
          ctx.fillStyle = 'rgba(255,240,220,0.55)'; ctx.fillRect(sx - 0.5, y + 2, 2, 5); // fil
        }
      });
    });
  };
  // MÉTAL : brossé, rayures, éraflures, bandes de reflets peints (bords polis)
  GEN.metal = function (ctx, w, h) {
    const brush = vnoise(w, h, 4, h / 2, 51), n = fbm(w, h, 4, 4, 4, 52), fine = vnoise(w, h, 128, 128, 53);
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const band = Math.pow(0.5 + 0.5 * Math.sin(((x / w) + (y / h)) * Math.PI * 2 + 0.7), 6);   // reflet peint diagonal (périodique)
      f[i] = 0.74 + (brush[i] - 0.5) * 0.1 + (n[i] - 0.5) * 0.14 + (fine[i] - 0.5) * 0.04 + band * 0.16;
    }
    putGray(ctx, w, h, f);
    const r = rng(54);
    W9(ctx, w, h, () => {
      for (let k = 0; k < 70; k++) { // rayures fines
        const x = r() * w, y = r() * h, l = 6 + r() * 40, a = r() * Math.PI, li = r() < 0.6;
        ctx.strokeStyle = li ? 'rgba(255,255,255,' + (0.15 + r() * 0.25) + ')' : 'rgba(0,0,0,' + (0.1 + r() * 0.18) + ')';
        ctx.lineWidth = 0.6 + r() * 0.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
      for (let k = 0; k < 9; k++) { // éraflures / impacts : creux sombre + lèvre claire
        const x = r() * w, y = r() * h, s = 1.5 + r() * 3;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.6, r() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x + 0.6, y + 0.6, s * 0.9, 0.2, 2.2); ctx.stroke();
      }
    });
  };
  // OR : poli + gravures (rinceaux, frise de perles, filets)
  GEN.gold = function (ctx, w, h) {
    const n = fbm(w, h, 4, 4, 4, 61), fine = vnoise(w, h, 64, 64, 62);
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, band = Math.pow(0.5 + 0.5 * Math.sin(((x / w) * 2 - (y / h)) * Math.PI * 2), 5);
      f[i] = 0.8 + (n[i] - 0.5) * 0.12 + (fine[i] - 0.5) * 0.04 + band * 0.14;
    }
    putGray(ctx, w, h, f);
    const groove = (draw) => { // gravure : sillon sombre + lèvre claire décalée
      ctx.save(); ctx.translate(0.9, 0.9); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; draw(); ctx.restore();
      ctx.strokeStyle = 'rgba(40,20,0,0.55)'; ctx.lineWidth = 1.6; draw();
    };
    W9(ctx, w, h, () => {
      // filets doubles en haut et au milieu
      [h * 0.04, h * 0.5].forEach(y0 => {
        groove(() => { ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y0); ctx.moveTo(0, y0 + 5); ctx.lineTo(w, y0 + 5); ctx.stroke(); });
        for (let x = 4; x < w; x += 10) { // perles
          ctx.fillStyle = 'rgba(40,20,0,0.35)'; ctx.beginPath(); ctx.arc(x, y0 + 12, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - 0.8, y0 + 11.2, 1, 0, Math.PI * 2); ctx.fill();
        }
      });
      // rinceaux : vague + volutes
      [h * 0.27, h * 0.77].forEach((yc, row) => {
        const per = w / 4;
        groove(() => {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 2) { const y = yc + Math.sin((x / per) * Math.PI * 2 + row * Math.PI) * 9; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke();
        });
        for (let k = 0; k < 4; k++) {
          const up = (k + row) % 2 === 0, cx = (k + 0.25 + row * 0.5) * per, cy = yc + (up ? -9 : 9);
          groove(() => {
            ctx.beginPath();
            for (let t = 0; t < 9.5; t += 0.25) { const rr = 9 - t * 0.85, a = t * (up ? 1 : -1); const x = cx + Math.cos(a) * rr, y = cy + (up ? -1 : 1) * 6 + Math.sin(a) * rr; t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.stroke();
          });
          groove(() => { ctx.beginPath(); ctx.ellipse(cx + per * 0.5, yc, 3, 6, 0.5, 0, Math.PI * 2); ctx.stroke(); }); // feuille
        }
      });
    });
  };
  // CHEVEUX : mèches orientées selon V, masses, reflet anisotrope peint
  GEN.hair = function (ctx, w, h) {
    const clump = vnoise(w, h, w / 8, 2, 71), str = vnoise(w, h, w / 2, 4, 72), str2 = vnoise(w, h, w, 8, 73);
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const hl = Math.exp(-Math.pow((y / h - 0.3 - (clump[i] - 0.5) * 0.08) / 0.06, 2));   // bande de reflet
      f[i] = 0.58 + clump[i] * 0.22 + (str[i] - 0.5) * 0.22 + (str2[i] - 0.5) * 0.1 + hl * 0.2 * (0.5 + str[i]);
    }
    putGray(ctx, w, h, f);
    const r = rng(74);
    W9(ctx, w, h, () => {
      for (let k = 0; k < 160; k++) {
        const x = r() * w, y = r() * h, l = h * (0.25 + r() * 0.5), sway = (r() - 0.5) * 8;
        ctx.strokeStyle = r() < 0.55 ? 'rgba(0,0,0,' + (0.12 + r() * 0.18) + ')' : 'rgba(255,255,255,' + (0.1 + r() * 0.16) + ')';
        ctx.lineWidth = 0.6 + r() * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + sway, y + l * 0.33, x - sway, y + l * 0.66, x + sway * 0.5, y + l); ctx.stroke();
      }
    });
  };
  // PEAU : pores légers, rougeurs/variations de teinte très faibles (légère couleur chaude)
  GEN.skin = function (ctx, w, h) {
    const n = fbm(w, h, 4, 4, 4, 81), red = fbm(w, h, 3, 3, 3, 82), fine = vnoise(w, h, 64, 64, 83), cool = fbm(w, h, 2, 2, 3, 85), mid = vnoise(w, h, 16, 16, 86);
    const img = ctx.createImageData(w, h), d = img.data;
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      const v = 0.9 + (n[i] - 0.5) * 0.1 + (mid[i] - 0.5) * 0.05 + (fine[i] - 0.5) * 0.05;
      const rd = smooth(clamp((red[i] - 0.42) * 2.2, 0, 1)) * 0.09;          // rougeurs (vaisseaux)
      const cl = smooth(clamp((cool[i] - 0.55) * 3, 0, 1)) * 0.05;           // zones légèrement plus froides/olive
      d[j] = clamp(Math.round(v * (1 - cl * 0.6) * 255), 0, 255);
      d[j + 1] = clamp(Math.round(v * (1 - rd) * 255), 0, 255);
      d[j + 2] = clamp(Math.round(v * (1 - rd * 1.15) * (1 + cl * 0.3) * 255), 0, 255); d[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const r = rng(84);
    W9(ctx, w, h, () => {
      for (let k = 0; k < 420; k++) { ctx.fillStyle = 'rgba(80,35,25,' + (0.06 + r() * 0.08) + ')'; ctx.fillRect(r() * w, r() * h, 1, 1); }   // pores
      for (let k = 0; k < 120; k++) { ctx.fillStyle = 'rgba(255,240,230,' + (0.06 + r() * 0.08) + ')'; ctx.fillRect(r() * w, r() * h, 1, 1); } // micro-reflets
    });
  };
  // FOURRURE : touffes, poils orientés vers le bas
  GEN.fur = function (ctx, w, h) {
    const cl = fbm(w, h, 6, 4, 3, 91);
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = 0.5 + cl[i] * 0.3;
    putGray(ctx, w, h, f);
    const r = rng(92);
    W9(ctx, w, h, () => {
      for (let k = 0; k < 900; k++) {
        const x = r() * w, y = r() * h, l = 5 + r() * 10, a = Math.PI / 2 + (r() - 0.5) * 0.7, li = r() < 0.6;
        ctx.strokeStyle = li ? 'rgba(255,255,255,' + (0.18 + r() * 0.25) + ')' : 'rgba(0,0,0,' + (0.15 + r() * 0.2) + ')';
        ctx.lineWidth = 0.7 + r() * 0.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    });
  };
  // OS : ivoire poreux, fines fissures, piqûres
  GEN.bone = function (ctx, w, h) {
    const n = fbm(w, h, 4, 6, 4, 101), por = vnoise(w, h, 48, 48, 102);
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = 0.82 + (n[i] - 0.5) * 0.16 - (por[i] > 0.78 ? (por[i] - 0.78) * 0.9 : 0);
    putGray(ctx, w, h, f);
    const r = rng(103);
    W9(ctx, w, h, () => {
      for (let k = 0; k < 7; k++) { // fissures (marche aléatoire)
        let x = r() * w, y = r() * h, a = r() * Math.PI * 2;
        ctx.strokeStyle = 'rgba(40,25,10,' + (0.25 + r() * 0.2) + ')'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 10; s++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 3.5; y += Math.sin(a) * 3.5; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (let k = 0; k < 30; k++) { ctx.fillStyle = 'rgba(50,30,10,0.3)'; ctx.beginPath(); ctx.arc(r() * w, r() * h, 0.6 + r(), 0, Math.PI * 2); ctx.fill(); }
    });
  };
  // GEMME : facettes (Voronoi à faces planes), arêtes claires, étincelles
  GEN.gem = function (ctx, w, h) {
    const wo = worley(w, h, 5, 111);
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) {
      const edge = 1 - smooth(clamp((wo.f2[i] - wo.f1[i]) * 9, 0, 1));
      f[i] = 0.62 + wo.id[i] * 0.34 + edge * 0.25 - wo.f1[i] * 0.12;
    }
    putGray(ctx, w, h, f);
    const r = rng(112);
    W9(ctx, w, h, () => {
      for (let k = 0; k < 4; k++) {
        const x = r() * w, y = r() * h, s = 3 + r() * 5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x - s * 1.6, y); ctx.lineTo(x + s * 1.6, y); ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x, y + s * 1.6); ctx.stroke();
      }
    });
  };
  // LAME : acier brossé dans la longueur (V), micro-rayures, ondes de trempe discrètes
  GEN.blade = function (ctx, w, h) {
    const br = vnoise(w, h, w / 2, 3, 121), n = fbm(w, h, 3, 3, 3, 122), wave = fbm(w, h, 2, 6, 3, 123);
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, hamon = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 6 + wave[i] * 8);
      f[i] = 0.84 + (br[i] - 0.5) * 0.12 + (n[i] - 0.5) * 0.08 + hamon * 0.06;
    }
    putGray(ctx, w, h, f);
    const r = rng(124);
    W9(ctx, w, h, () => {
      for (let k = 0; k < 30; k++) {
        const x = r() * w, y = r() * h, l = 4 + r() * 18, a = Math.PI / 2 + (r() - 0.5) * 1.4;
        ctx.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    });
  };
  // LÈVRES : fines stries verticales
  GEN.lip = function (ctx, w, h) {
    const st = vnoise(w, h, w / 2, 2, 131), n = vnoise(w, h, 8, 8, 132);
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = 0.86 + (st[i] - 0.5) * 0.12 + (n[i] - 0.5) * 0.06;
    putGray(ctx, w, h, f);
  };
  // TRANSLUCIDE : voiles doux (cristal / spectre)
  GEN.trans = function (ctx, w, h) {
    const n = fbm(w, h, 3, 3, 4, 141);
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = 0.78 + n[i] * 0.22;
    putGray(ctx, w, h, f);
  };

  const TEX_DEF = {   // nom : [largeur, hauteur]
    cloth: [256, 256], cloth2: [128, 128], cape: [128, 128], leather: [256, 256], metal: [256, 256], gold: [256, 256],
    hair: [128, 256], skin: [128, 128], fur: [128, 128], bone: [128, 128], gem: [128, 128], blade: [128, 128], lip: [64, 64], trans: [64, 64],
  };
  const TEX = {}, CANVAS = {}, MEAN = {};
  let texBytes = 0;
  function bytesOf(w, h, mips) { return Math.round(w * h * 4 * (mips ? 4 / 3 : 1)); }
  function makeTex(canvas, o) {
    const t = new T.CanvasTexture(canvas);
    t.wrapS = (o && o.clampS) ? T.ClampToEdgeWrapping : T.RepeatWrapping;
    t.wrapT = (o && o.clampT) ? T.ClampToEdgeWrapping : T.RepeatWrapping;
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = 4;
    t.userData = t.userData || {}; t.userData.shared = true;
    t.needsUpdate = true;
    return t;
  }
  function texture(name) {
    if (name in TEX) return TEX[name];
    TEX[name] = null;
    try {
      const def = TEX_DEF[name], gen = GEN[name];
      if (!def || !gen || !T) return null;
      const c = mkCanvas(def[0], def[1]); if (!c) return null;
      const ctx = c.getContext('2d');
      gen(ctx, def[0], def[1]);
      MEAN[name] = meanLum(ctx, def[0], def[1]);
      CANVAS[name] = c;
      TEX[name] = makeTex(c);
      texBytes += bytesOf(def[0], def[1], true);
    } catch (e) { TEX[name] = null; try { console.warn('[HeroTex] texture ' + name, e); } catch (_) { /* rien */ } }
    return TEX[name];
  }
  // carte de rugosité (canal G) dérivée de la texture : zones claires/polies → lisses
  const ROUGH = {}, ROUGH_BASE = 0.72;   // facteur moyen de la carte (la rugosité du matériau est divisée d'autant)
  function roughTex(name, base, span) {
    const key = name + '|' + base + '|' + span;
    if (key in ROUGH) return ROUGH[key];
    ROUGH[key] = null;
    try {
      const src = texture(name) && CANVAS[name]; if (!src) return null;
      const w = 128, h = 128, c = mkCanvas(w, h); if (!c) return null;
      const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h), d = img.data, m = MEAN[name] || 0.8;
      for (let j = 0; j < d.length; j += 4) {
        const l = d[j] / 255, v = clamp(base - (l - m) * span, 0.04, 1) * 255;
        d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      CANVAS['rough-' + name + '-' + Math.round(base * 100)] = c;
      ROUGH[key] = makeTex(c); texBytes += bytesOf(w, h, true);
    } catch (e) { ROUGH[key] = null; }
    return ROUGH[key];
  }

  // ---------------------------------------------------------------- gradient toon doux 4 tons + envMap
  // 4 tons doux, ton haut 0,84 : sous l'hémisphère 0,85 + soleil 0,9 du jeu, les couleurs claires ne saturent plus en blanc pur
  const GRAD_TONES = [66, 122, 176, 214];
  let GRAD = null;
  function gradient() {
    if (GRAD || !T) return GRAD;
    try {
      const t = new T.DataTexture(new Uint8Array(GRAD_TONES), 4, 1, T.LuminanceFormat);
      t.minFilter = T.NearestFilter; t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
      t.userData = t.userData || {}; t.userData.shared = true;
      GRAD = t;
    } catch (e) { GRAD = null; }
    return GRAD;
  }
  let ENV = undefined;
  function envMap() {
    if (ENV !== undefined) return ENV;
    ENV = null;
    try {
      if (!T || !T.CubeTexture) return null;
      const S = 32, faces = [];
      // ordre three : +x, -x, +y, -y, +z, -z
      const torch = [[0.3, 0.55, '255,170,90', 0.9], null, null, null, null, [0.7, 0.5, '255,150,80', 0.8]];
      const magic = [null, [0.6, 0.5, '130,160,255', 0.7], null, null, [0.25, 0.45, '200,210,255', 0.5], null];
      for (let fi = 0; fi < 6; fi++) {
        const c = mkCanvas(S, S); if (!c) return null;
        const x = c.getContext('2d');
        if (fi === 2) { // plafond : lumière froide claire, « fenêtres »
          const g = x.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S * 0.75);
          g.addColorStop(0, '#f4f7ff'); g.addColorStop(0.5, '#aab4d4'); g.addColorStop(1, '#5a6080');
          x.fillStyle = g; x.fillRect(0, 0, S, S);
          x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(S * 0.2, S * 0.38, S * 0.6, S * 0.08); x.fillRect(S * 0.46, S * 0.15, S * 0.08, S * 0.7);
        } else if (fi === 3) { // sol sombre
          x.fillStyle = '#17121c'; x.fillRect(0, 0, S, S);
          const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.6); g.addColorStop(0, 'rgba(70,50,60,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(0, 0, S, S);
        } else { // murs : haut clair-froid → bas sombre (y canvas = 0 en haut de la face latérale)
          const g = x.createLinearGradient(0, 0, 0, S);
          g.addColorStop(0, '#9aa2c0'); g.addColorStop(0.45, '#66647e'); g.addColorStop(0.62, '#3a3446'); g.addColorStop(1, '#18131c');
          x.fillStyle = g; x.fillRect(0, 0, S, S);
          [torch[fi], magic[fi]].forEach(L => {
            if (!L) return;
            const gx = L[0] * S, gy = L[1] * S, rr = S * 0.32, gg = x.createRadialGradient(gx, gy, 0, gx, gy, rr);
            gg.addColorStop(0, 'rgba(' + L[2] + ',' + L[3] + ')'); gg.addColorStop(1, 'rgba(' + L[2] + ',0)');
            x.fillStyle = gg; x.fillRect(0, 0, S, S);
          });
        }
        faces.push(c);
        CANVAS['env' + fi] = c;
      }
      const t = new T.CubeTexture(faces);
      t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
      t.userData = t.userData || {}; t.userData.shared = true; t.needsUpdate = true;
      texBytes += bytesOf(S, S, true) * 6;
      ENV = t;
    } catch (e) { ENV = null; }
    return ENV;
  }

  // ---------------------------------------------------------------- matériau toon « glow » (émission = couleur de sommet)
  let GlowToon = null;
  try {
    if (T && T.MeshToonMaterial) {
      GlowToon = class HTGlowToon extends T.MeshToonMaterial {
        constructor(p) { super(p); this.glowK = 0.8; this.isHTGlowToon = true; }
        copy(src) { super.copy(src); if (src && src.glowK != null) this.glowK = src.glowK; return this; }
        onBeforeCompile(shader) {
          try {
            shader.uniforms.htGlowK = { value: this.glowK };
            this.userData.htGlowUniform = shader.uniforms.htGlowK;
            shader.fragmentShader = 'uniform float htGlowK;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\n\ttotalEmissiveRadiance += vColor.rgb * htGlowK;\n#endif');
          } catch (e) { /* rien */ }
        }
        customProgramCacheKey() { return 'htGlowToon'; }
      };
    }
  } catch (e) { GlowToon = null; }

  // ---------------------------------------------------------------- recettes par couche
  // kind : toon | glow | std ; tex : nom de texture ; bump : bumpScale ; mean : compensation auto
  const RECIPE = {
    skin: { kind: 'toon', tex: 'skin', bump: 0.005, emissive: 0x080302, expo: 0.8 },
    cloth: { kind: 'toon', tex: 'cloth', bump: 0.012, expo: 0.84 },
    cloth2: { kind: 'toon', tex: 'cloth2', bump: 0.008, expo: 0.84 },
    cape: { kind: 'toon', tex: 'cape', bump: 0.012, side: 'double', expo: 0.88 },
    leather: { kind: 'toon', tex: 'leather', bump: 0.016, expo: 0.95 },
    hair: { kind: 'toon', tex: 'hair', bump: 0.01 },
    fur: { kind: 'toon', tex: 'fur', bump: 0.02 },
    bone: { kind: 'toon', tex: 'bone', bump: 0.01, expo: 0.88 },
    lip: { kind: 'toon', tex: 'lip', bump: 0.003 },
    eye: { kind: 'glow', glow: 0.32 },
    eyeWhite: { kind: 'glow', glow: 0.14, tint: 0xdedede },   // évite le blanc saturé (yeux « vides »)
    glow: { kind: 'glow', glow: 0.9, tint: 0x707070 },
    trans: { kind: 'glow', glow: 0.35, tex: 'trans', opacity: 0.55 },
    metal: { kind: 'std', tex: 'metal', bump: 0.006, metal: 0.76, rough: 0.42, env: 1.0 },
    gold: { kind: 'std', tex: 'gold', bump: 0.01, metal: 0.92, rough: 0.3, env: 1.15 },
    blade: { kind: 'std', tex: 'blade', bump: 0.003, metal: 0.6, rough: 0.3, env: 1.2 },   // métal modéré : une lame plate vue de face reflète surtout les murs sombres
    gem: { kind: 'std', tex: 'gem', bump: 0.004, metal: 0.25, rough: 0.08, env: 1.6, glowE: 0.0 },
  };
  const VARIANTS = {
    dark: { tint: 0xa8a8a8, rough: +0.18, env: -0.3 },
    polished: { rough: -0.18, env: +0.25, bump: 0.5 },
    worn: { rough: +0.1, bump: 1.4 },
    rough: { rough: +0.25, bump: 1.6 },
    silk: { tex: 'cloth2', bump: 0.3 },
    wet: { rough: -0.25, env: +0.3 },
  };

  function patch(m) {
    try { if (G.HeroRender && typeof G.HeroRender.patchMaterial === 'function') G.HeroRender.patchMaterial(m); } catch (e) { /* rien */ }
    return m;
  }
  function sideOf(s) {
    if (s === 'double' || s === 2 || s === T.DoubleSide) return T.DoubleSide;
    if (s === 'back' || s === 1 || s === T.BackSide) return T.BackSide;
    return T.FrontSide;
  }

  function build(layer, opts) {
    const o = opts || {};
    const base = RECIPE[layer] || RECIPE.cloth;
    const v = VARIANTS[o.variant] || {};
    const texName = o.noMap ? null : (v.tex || base.tex || null);
    const tex = texName ? texture(texName) : null;
    const mean = tex ? (MEAN[texName] || 0.9) : 1;
    // compensation de la moyenne de texture : complète pour métal/cheveux, partielle (×expo) pour les matières claires
    const expo = base.expo != null ? base.expo : 1;
    const comp = expo < 1 ? (1 + (clamp(1 / mean, 1, 1.4) - 1) * 0.3) * expo : clamp(1 / mean, 1, 1.4);
    const tintHex = toHex(o.tint, toHex(v.tint, toHex(base.tint, 0xffffff)));
    const color = new T.Color(tintHex); color.multiplyScalar(comp);
    const bumpK = (o.bump != null ? o.bump : 1) * (v.bump != null ? v.bump : 1);
    const p = { color, vertexColors: true, emissive: new T.Color(toHex(o.emissive, toHex(base.emissive, 0x000000))) };
    p.emissiveIntensity = o.emissiveIntensity != null ? o.emissiveIntensity : 1;
    if (tex) { p.map = tex; if (base.bump && bumpK > 0) { p.bumpMap = tex; p.bumpScale = base.bump * bumpK; } }
    const side = o.side != null ? o.side : base.side;
    if (side != null) p.side = sideOf(side);
    const opacity = o.opacity != null ? o.opacity : base.opacity;
    if (o.transparent || (opacity != null && opacity < 1)) { p.transparent = true; p.opacity = opacity != null ? opacity : 1; p.depthWrite = o.depthWrite != null ? !!o.depthWrite : false; }
    if (o.flat) p.flatShading = true;
    let m;
    if (base.kind === 'std' && T.MeshStandardMaterial) {
      p.metalness = clamp(o.metal != null ? o.metal : base.metal, 0, 1);
      p.roughness = clamp((o.rough != null ? o.rough : base.rough) + (v.rough || 0), 0.04, 1);
      const env = envMap();
      if (env) { p.envMap = env; p.envMapIntensity = Math.max(0, base.env + (v.env || 0)); }
      if (tex) { const rt = roughTex(texName, ROUGH_BASE, 1.8); if (rt) { p.roughnessMap = rt; p.roughness = clamp(p.roughness / ROUGH_BASE, 0.04, 1); } }
      m = new T.MeshStandardMaterial(p);
    } else if (base.kind === 'glow' && GlowToon) {
      p.gradientMap = gradient() || undefined;
      if (!p.gradientMap) delete p.gradientMap;
      m = new GlowToon(p);
      m.glowK = o.glow != null ? +o.glow : base.glow;
    } else {
      p.gradientMap = gradient() || undefined;
      if (!p.gradientMap) delete p.gradientMap;
      m = new T.MeshToonMaterial(p);
      if (o.glow != null && GlowToon) { m = new GlowToon(p); m.glowK = +o.glow; }
    }
    m.name = 'hero6-' + layer + (o.variant ? '-' + o.variant : '');
    m.userData = m.userData || {};
    m.userData.heroLayer = layer;
    return m;
  }

  function fallbackMat() {
    try { const m = new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, emissive: new T.Color(0) }); m.userData = { heroLayer: 'fallback' }; return m; } catch (e) { /* rien */ }
    try { return new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }); } catch (e) { return null; }
  }
  function optKey(o) {
    if (!o) return '';
    const k = ['variant', 'side', 'opacity', 'transparent', 'flat', 'emissive', 'emissiveIntensity', 'tint', 'rough', 'metal', 'glow', 'bump', 'noMap', 'depthWrite'];
    let s = '';
    for (let i = 0; i < k.length; i++) if (o[k[i]] != null) s += k[i] + '=' + String(o[k[i]]) + ';';
    return s;
  }

  const MATS = {};
  let matCount = 0;
  function mat(layer, opts) {
    if (!T) return null;
    try {
      layer = LAYERS.indexOf(layer) >= 0 ? layer : (RECIPE[layer] ? layer : 'cloth');
      const key = layer + '|' + optKey(opts);
      if (MATS[key]) return MATS[key];
      const m = build(layer, opts);
      m.userData.shared = true;
      patch(m);
      MATS[key] = m; matCount++;
      return m;
    } catch (e) {
      try { console.warn('[HeroTex] mat ' + layer, e); } catch (_) { /* rien */ }
      const f = fallbackMat(); if (f) { f.userData = f.userData || {}; f.userData.shared = true; } return f;
    }
  }
  function instance(layer, opts) {
    if (!T) return null;
    try {
      layer = LAYERS.indexOf(layer) >= 0 ? layer : (RECIPE[layer] ? layer : 'cloth');
      const m = build(layer, opts);
      m.userData.shared = false;
      return patch(m);
    } catch (e) { return fallbackMat(); }
  }

  // ---------------------------------------------------------------- décalque de visage
  // Deux modes :
  //  • « decal » (HeroKit v6, faceSpec.uv = objet FACE_UV) : coque de visage (faceShell d'A2) au-dessus de la tête,
  //    UV propres 0..1 (u : droite du perso → gauche, v : menton → front). Canvas RGBA TRANSPARENT 256² : seuls les
  //    détails sont peints, en couleurs ABSOLUES calculées depuis faceSpec.skin ; trous aux yeux ; matériau transparent.
  //  • « sphere » / « lathe » (repli) : décalque opaque multiplié par la couleur de sommet (UV de SphereGeometry / Lathe).
  // Positions en unités « sphère » (du : fraction du tour, dv : fraction de hauteur) ; kU/kV les convertissent.
  const FACE_LAYOUT = {
    sphere: { u: 0.25, eyeV: 0.50, kU: 1, kV: 1, eyeDU: 0.066, browDV: -0.065, noseDV: 0.075, mouthDV: 0.155, chinDV: 0.24, cheekDU: 0.085, cheekDV: 0.075, faceDU: 0.16 },
    lathe: { u: 0.0, eyeV: 0.45, kU: 1, kV: 1, eyeDU: 0.066, browDV: -0.07, noseDV: 0.085, mouthDV: 0.175, chinDV: 0.27, cheekDU: 0.085, cheekDV: 0.085, faceDU: 0.16 },
  };
  // FACE_UV d'A2 : { eyeL:[u,v], eyeR, browL, browR, nose, mouth, chin, cheekL, cheekR, forehead, eyeRadiusU, eyeRadiusV }
  function layoutFromUV(U) {
    const P = (k, d) => (Array.isArray(U[k]) && U[k].length >= 2 && isFinite(U[k][0]) && isFinite(U[k][1])) ? U[k] : d;
    const eL = P('eyeL', [0.67, 0.526]), eR = P('eyeR', [0.33, 0.526]);
    const u0 = (eL[0] + eR[0]) / 2, eyeV = 1 - (eL[1] + eR[1]) / 2;
    const kU = Math.max(0.2, (eL[0] - eR[0]) / 2 / 0.066);
    const mouth = P('mouth', [u0, 0.205]), kV = Math.max(0.2, ((1 - mouth[1]) - eyeV) / 0.155);
    const dv = p => ((1 - p[1]) - eyeV) / kV, du = p => (p[0] - u0) / kU;
    const cheek = P('cheekL', [0.786, 0.343]);
    return { u: u0, eyeV, kU, kV, eyeDU: 0.066, browDV: dv(P('browL', [0.665, 0.628])), noseDV: dv(P('nose', [0.5, 0.367])), mouthDV: 0.155,
      chinDV: dv(P('chin', [0.5, 0.092])) + 0.03, cheekDU: Math.abs(du(cheek)), cheekDV: dv(cheek), faceDU: 0.16,
      eyeRU: num(U.eyeRadiusU, 0.035), eyeRV: num(U.eyeRadiusV, 0.04), eyes: [eL, eR], decal: true };
  }
  const FACES = new Map();   // clé → { mat, tex, gtex, canvas, bytes }
  const FACE_MAX = 6;
  function stableKey(x, depth) {
    depth = depth || 0;
    if (x == null || depth > 4) return 'n';
    if (typeof x === 'function') return 'f';
    if (typeof x !== 'object') return JSON.stringify(x);
    if (x.isColor) return '#' + x.getHexString();
    if (Array.isArray(x)) return '[' + x.map(v => stableKey(v, depth + 1)).join(',') + ']';
    return '{' + Object.keys(x).sort().map(k => k + ':' + stableKey(x[k], depth + 1)).join(',') + '}';
  }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function ageT(fs) {
    if (fs.wrinkles != null) return clamp(+fs.wrinkles || 0, 0, 1);
    const a = fs.age;
    if (typeof a === 'number') return a > 1.5 ? clamp((a - 28) / 36, 0, 1) : clamp(a, 0, 1);
    if (a === 'old' || a === 'elder' || a === 'vieux' || a === 'âgé') return 0.85;
    if (a === 'mature' || a === 'middle' || a === 'adulte mûr') return 0.45;
    if (a === 'adult' || a === 'adulte') return 0.2;
    return 0.08;
  }
  // normalise les champs de la spec de tête d'A1 (scar[{type,where}], marks[{type,where,color,glow}], beard{style,color}) + alias
  function normFace(fs) {
    const o = { age: ageT(fs), female: !!(fs.female || fs.sex === 'f' || fs.gender === 'f'), scars: [], marks: [], freckles: num(fs.freckles, 0), mole: [] };
    const beard = fs.beard;
    let stub = num(fs.stubble, 0);
    if (beard === true) stub = Math.max(stub, 0.8);
    else if (typeof beard === 'number') stub = Math.max(stub, beard);
    else if (beard && typeof beard === 'object') stub = Math.max(stub, beard.style === 'stubble' ? 0.85 : beard.style === 'moustache' || beard.style === 'goatee' || beard.style === 'braided-goatee' ? 0.35 : 0.5);
    else if (typeof beard === 'string') stub = Math.max(stub, beard === 'stubble' ? 0.85 : 0.45);
    o.stubble = clamp(stub, 0, 1);
    o.beardColor = toHex(beard && beard.color, toHex(fs.beardColor, toHex(fs.hairColor, toHex(fs.hair && typeof fs.hair === 'object' ? fs.hair.color : fs.hair, 0x3a3030))));
    let sc = fs.scars != null ? fs.scars : fs.scar;
    if (sc === true) sc = ['eye'];
    if (typeof sc === 'number') { const n = sc; sc = []; for (let k = 0; k < n; k++) sc.push(['cheek', 'eye', 'brow', 'lip', 'nose'][k % 5]); }
    if (typeof sc === 'string') sc = [sc];
    if (Array.isArray(sc)) o.scars = sc.filter(Boolean);
    const mk = [].concat(fs.tattoo || [], fs.marks || [], fs.warpaint ? ['stripes'] : []).filter(Boolean);
    const defCol = toHex(fs.tattooColor, toHex(fs.markColor, 0x2a3a6a));
    mk.forEach(m => {
      const t = typeof m === 'string' ? m : (m.type || m.kind || 'runes'), w = typeof m === 'object' ? String(m.where || m.at || '') : '';
      const col = typeof m === 'object' && m.color != null ? toHex(m.color, defCol) : defCol, glow = typeof m === 'object' ? num(m.glow, 0) : 0;
      const side = typeof m === 'object' && m.side != null ? (m.side === 'R' || m.side === 'r' || m.side === 'right' || m.side < 0 ? -1 : 1) : (/R\b|R-|R$/.test(w) ? -1 : 1);
      if (t === 'freckles') { o.freckles = Math.max(o.freckles, 0.7); o.freckleColor = col; o.freckleWhere = w; return; }
      if (t === 'mole') { o.mole.push({ where: w, col }); return; }
      let kind = t;
      if (t === 'paint') kind = /band/.test(w) ? 'mask' : /strokes|stripe/.test(w) ? 'strokes' : /shadow|eye/.test(w) ? 'eyepaint' : 'stripes';
      else if (t === 'tattoo') kind = /line|cheek/.test(w) ? 'lines' : /tear/.test(w) ? 'tears' : 'runes';
      else if (t === 'runes') kind = /forehead|chin/.test(w) ? 'runes-fc' : 'runes';
      else if (t === 'sigil') kind = 'sigil';
      else if (t === 'veins') kind = /temple/.test(w) ? 'veins-t' : 'veins';
      else if (t === 'cracks') kind = 'cracks';
      if (/arms|hands|neck$/.test(w) && !/face/.test(w)) return; // hors visage
      o.marks.push({ kind, col, glow, side, where: w, shape: typeof m === 'object' ? m.shape : null });
    });
    const mku = typeof fs.makeup === 'string' ? { style: fs.makeup } : (fs.makeup || {});
    o.makeup = mku;
    o.blush = clamp(num(fs.blush, num(fs.cheeks, o.female ? 0.55 : 0.38)), 0, 1);
    return o;
  }

  function paintFace(ctx, fs, L, W, H, gctx) {
    const N = normFace(fs), r = rng(hashStr(stableKey(fs)) ^ num(fs.seed, 7)), decal = !!L.decal;
    const SKIN = decal ? hexRGB(toHex(fs.skin, 0xe9b892)) : [255, 255, 255];
    const ps = L.kU * W / 512;   // échelle pixel (1 = repli sphère 512 px)
    const X = du => (L.u + du * L.kU) * W, Y = dv => (L.eyeV + dv * L.kV) * H, SX = d => d * L.kU * W, SY = d => d * L.kV * H;
    const wrap3 = fn => { if (decal) { fn(); return; } for (let k = -1; k <= 1; k++) { ctx.save(); ctx.translate(k * W, 0); fn(); ctx.restore(); } };
    // couleur « relative » (multiplicative sur la peau) → absolue en mode decal
    const rel = (tint, a) => { const t = hexRGB(tint); return 'rgba(' + Math.round(SKIN[0] * t[0] / 255) + ',' + Math.round(SKIN[1] * t[1] / 255) + ',' + Math.round(SKIN[2] * t[2] / 255) + ',' + a + ')'; };
    const abs = (hex, a) => { const c = hexRGB(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
    const light = (a) => 'rgba(' + Math.round(SKIN[0] + (255 - SKIN[0]) * 0.45) + ',' + Math.round(SKIN[1] * 0.92 + (255 - SKIN[1]) * 0.3) + ',' + Math.round(SKIN[2] * 0.92 + (255 - SKIN[2]) * 0.3) + ',' + a + ')';
    const blob = (x, y, rx, ry, colFn, a) => { // tache douce
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, colFn(a)); g.addColorStop(1, colFn(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    const R_ = t => a => rel(t, a), A_ = h => a => abs(h, a);
    const age = N.age, sides = [-1, 1];
    // modelé : orbites, cernes, dessous du nez, creux sous la lèvre, joues, menton
    wrap3(() => {
      sides.forEach(s => {
        blob(X(s * L.eyeDU), Y(-0.01), SX(0.05), SY(0.06), R_(0xa88898), 0.5);
        blob(X(s * L.eyeDU * 1.08), Y(0.035), SX(0.035), SY(0.028), R_(0xb89aa4), 0.3 + age * 0.35);
      });
      blob(X(0), Y(L.noseDV + 0.03), SX(0.022), SY(0.016), R_(0xa07a78), 0.4);
      blob(X(0), Y(L.mouthDV + 0.045), SX(0.03), SY(0.018), R_(0xb89898), 0.3);
      sides.forEach(s => blob(X(s * L.faceDU * 0.92), Y(L.mouthDV + 0.01), SX(0.045), SY(0.11), R_(0xc0a4a4), 0.32 + age * 0.15));
      blob(X(0), Y(L.chinDV + 0.03), SX(0.1), SY(0.04), R_(0xb09aa0), 0.35);
      // joues rosées + bout du nez
      sides.forEach(s => blob(X(s * L.cheekDU), Y(L.cheekDV), SX(0.045), SY(0.05), R_(0xff8a80), 0.4 * N.blush));
      blob(X(0), Y(L.noseDV), SX(0.018), SY(0.028), R_(0xffa098), 0.28 * N.blush);
      // reflets doux (front, pommettes) : seulement visibles en mode decal (couleur > peau)
      if (decal) { blob(X(0), Y(L.browDV - 0.06), SX(0.06), SY(0.035), light, 0.25); sides.forEach(s => blob(X(s * L.cheekDU * 0.95), Y(L.cheekDV - 0.03), SX(0.03), SY(0.02), light, 0.22)); }
    });
    // rides selon l'âge
    if (age > 0.15) {
      const a = Math.min(0.6, (age - 0.1) * 0.6);
      ctx.lineCap = 'round';
      const wav = (x0, y0, x1, y1, amp, seg) => {
        ctx.beginPath(); let pen = false;
        for (let k = 0; k <= seg; k++) {
          const t = k / seg, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * 9 + x0) * amp + (r() - 0.5) * amp;
          if (r() < 0.12) { pen = false; continue; }
          pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true;
        }
        ctx.stroke();
      };
      wrap3(() => {
        ctx.strokeStyle = rel(0x7a4c4c, a); ctx.lineWidth = 0.9 * ps;
        for (let k = 0; k < (age > 0.6 ? 3 : 2); k++) { const y = Y(L.browDV - 0.045 - k * 0.026), half = 0.05 - k * 0.006; wav(X(-half), y + 1.5, X(half), y + 1.5, 1.2, 14); }
        sides.forEach(s => {
          for (let k = -1; k <= 1; k++) {
            const x0 = X(s * (L.eyeDU + 0.034)), y0 = Y(0.004 + k * 0.008), x1 = X(s * (L.eyeDU + 0.052 + (k === 0 ? 0.006 : 0))), y1 = Y(k * 0.024);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + (y1 - y0) * 0.2, x1, y1); ctx.stroke();
          }
          ctx.beginPath(); ctx.moveTo(X(s * 0.022), Y(L.noseDV + 0.01)); ctx.quadraticCurveTo(X(s * 0.046), Y(L.mouthDV - 0.025), X(s * 0.038), Y(L.mouthDV + 0.03)); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(X(s * L.eyeDU), Y(0.016), SX(0.02), SY(0.02), 0, 0.3 * Math.PI, 0.7 * Math.PI); ctx.stroke();
          if (age > 0.55) { ctx.beginPath(); ctx.moveTo(X(s * 0.03), Y(L.mouthDV + 0.03)); ctx.lineTo(X(s * 0.034), Y(L.mouthDV + 0.07)); ctx.stroke(); }
        });
        if (age > 0.45) { ctx.beginPath(); ctx.moveTo(X(-0.006), Y(L.browDV + 0.002)); ctx.lineTo(X(-0.004), Y(L.browDV + 0.035)); ctx.moveTo(X(0.006), Y(L.browDV + 0.002)); ctx.lineTo(X(0.004), Y(L.browDV + 0.035)); ctx.stroke(); }
      });
    }
    // barbe naissante
    const stub = N.female && fs.stubble == null && !fs.beard ? 0 : N.stubble;
    if (stub > 0) {
      const bcol = hexRGB(N.beardColor).map((c, i) => Math.round(c * 0.75 + SKIN[i] * 0.1));
      const bhex = (bcol[0] << 16) | (bcol[1] << 8) | bcol[2];
      const ex = L.faceDU + 0.04;
      const top = ax => ax < 0.3 ? L.noseDV + 0.032 : (L.mouthDV - 0.015) + ((-0.01) - (L.mouthDV - 0.015)) * smooth(clamp((ax - 0.3) / 0.7, 0, 1));
      const bottom = ax => L.chinDV + 0.035 - ax * ax * 0.05;
      const dot = 1.1 * ps;
      wrap3(() => {
        const n = Math.round(2600 * stub * ps * ps);
        for (let k = 0; k < n; k++) {
          const du = (r() * 2 - 1) * ex, ax = Math.abs(du) / ex;
          const t0 = top(ax), b0 = bottom(ax), dv = t0 + r() * (b0 - t0) * 1.05;
          const edge = Math.min(dv - t0, b0 - dv) / 0.03;
          if (dv > b0 || r() > clamp(edge, 0.08, 1)) continue;
          ctx.fillStyle = 'rgba(' + bcol[0] + ',' + bcol[1] + ',' + bcol[2] + ',' + (0.22 + r() * 0.35) * (0.4 + stub * 0.6) + ')';
          ctx.fillRect(X(du), Y(dv), dot, dot);
        }
        blob(X(0), Y(L.mouthDV + 0.04), SX(0.1), SY(0.09), A_(bhex), 0.2 * stub);
        sides.forEach(s => blob(X(s * L.faceDU * 0.85), Y(L.mouthDV), SX(0.04), SY(0.09), A_(bhex), 0.16 * stub));
      });
    }
    // taches de rousseur / grains de beauté
    if (N.freckles > 0) {
      const fc = hexRGB(N.freckleColor != null ? N.freckleColor : 0xaa6946);
      const onCheeks = /cheek/.test(N.freckleWhere || ''), onNose = /nose/.test(N.freckleWhere || '');
      wrap3(() => {
        const n = Math.round(150 * N.freckles);
        for (let k = 0; k < n; k++) {
          const s = r() < 0.5 ? -1 : 1, spread = onNose ? 0.05 : onCheeks ? 0.1 : 0.1;
          const du = s * ((onCheeks ? 0.04 : 0.008) + Math.pow(r(), 0.8) * spread), dv = L.noseDV - 0.03 + (r() - 0.5) * 0.08 + Math.abs(du) * 0.2;
          ctx.fillStyle = 'rgba(' + fc[0] + ',' + fc[1] + ',' + fc[2] + ',' + (0.3 + r() * 0.35) + ')';
          ctx.beginPath(); ctx.arc(X(du), Y(dv), (0.7 + r() * 1.1) * ps, 0, Math.PI * 2); ctx.fill();
        }
      });
    }
    N.mole.forEach(m => { const s = /L/.test(m.where) ? 1 : -1; wrap3(() => { ctx.fillStyle = abs(m.col, 0.85); ctx.beginPath(); ctx.arc(X(s * (L.eyeDU + 0.012)), Y(0.05), 1.6 * ps, 0, Math.PI * 2); ctx.fill(); }); });
    // maquillage
    const mk = N.makeup, style = mk.style || '';
    const liner = clamp(num(mk.eyeliner, style === 'kohl' || style === 'gothic' || style === 'noble' ? 0.8 : 0), 0, 1);
    const shadowHex = toHex(mk.eyeshadow, style === 'gothic' ? 0x503060 : style === 'noble' ? 0xb08060 : style === 'kohl' ? 0x403040 : null);
    wrap3(() => {
      sides.forEach(s => {
        if (shadowHex != null) blob(X(s * L.eyeDU), Y(-0.028), SX(0.04), SY(0.03), A_(shadowHex), 0.5);
        if (liner > 0) {
          ctx.strokeStyle = 'rgba(30,20,30,' + (0.75 * liner) + ')'; ctx.lineWidth = 2 * ps;
          ctx.beginPath(); ctx.moveTo(X(s * (L.eyeDU - 0.03)), Y(-0.012)); ctx.quadraticCurveTo(X(s * L.eyeDU), Y(-0.03), X(s * (L.eyeDU + 0.03)), Y(-0.012));
          ctx.lineTo(X(s * (L.eyeDU + 0.045)), Y(-0.03)); ctx.stroke();
          ctx.lineWidth = 1.2 * ps; ctx.beginPath(); ctx.moveTo(X(s * (L.eyeDU - 0.025)), Y(0.016)); ctx.quadraticCurveTo(X(s * L.eyeDU), Y(0.026), X(s * (L.eyeDU + 0.03)), Y(0.012)); ctx.stroke();
        }
      });
      if (mk.blush != null) sides.forEach(s => blob(X(s * L.cheekDU * 1.05), Y(L.cheekDV - 0.01), SX(0.05), SY(0.035), A_(toHex(mk.blushColor, 0xff7080)), 0.5 * clamp(+mk.blush || 0, 0, 1)));
    });
    // tatouages / marques / peintures (peints aussi dans la carte d'émission si glow > 0)
    const drawMark = (c, m, colStr, lw) => {
      const side = m.side;
      c.strokeStyle = colStr; c.fillStyle = colStr; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
      const k = m.kind, glyph = (x, y, s, i) => { c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x, y + s); c.lineTo(x + s, y - s); if (i % 2) { c.moveTo(x - s, y); c.lineTo(x + s, y); } else { c.moveTo(x, y - s * 1.3); c.lineTo(x, y + s); } c.stroke(); };
      const gs = 4.5 * ps;
      if (k === 'runes') { for (let i = 0; i < 3; i++) glyph(X(side * (L.cheekDU + 0.02)), Y(L.cheekDV - 0.02 + i * 0.04), gs, i); }
      else if (k === 'runes-fc') { for (let i = -1; i <= 1; i++) glyph(X(i * 0.03), Y(L.browDV - 0.06), gs, i + 1); glyph(X(0), Y(L.chinDV - 0.01), gs, 1); }
      else if (k === 'tribal') {
        c.beginPath(); c.moveTo(X(side * 0.02), Y(L.browDV - 0.04)); c.quadraticCurveTo(X(side * 0.11), Y(L.browDV - 0.02), X(side * 0.1), Y(0.04));
        c.quadraticCurveTo(X(side * 0.09), Y(L.mouthDV), X(side * 0.05), Y(L.chinDV)); c.stroke();
        c.beginPath(); c.arc(X(side * 0.1), Y(0.05), gs, 0, Math.PI * 1.5); c.stroke();
      } else if (k === 'lines') { // traits fins de l'œil vers la joue (des deux côtés)
        sides.forEach(s => { for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(X(s * (L.eyeDU + 0.01 + i * 0.012)), Y(0.04)); c.quadraticCurveTo(X(s * (L.eyeDU + 0.02 + i * 0.012)), Y(0.08), X(s * (L.eyeDU + 0.01 + i * 0.014)), Y(L.cheekDV + 0.05)); c.stroke(); } });
      } else if (k === 'tears' || k === 'tear') {
        for (let i = 0; i < 2; i++) { const x = X(side * L.eyeDU), y = Y(0.05 + i * 0.045); c.beginPath(); c.moveTo(x, y - gs); c.quadraticCurveTo(x + gs * 0.8, y + gs * 0.4, x, y + gs * 0.8); c.quadraticCurveTo(x - gs * 0.8, y + gs * 0.4, x, y - gs); c.fill(); }
      } else if (k === 'stripes' || k === 'war') {
        c.lineWidth = lw * 2; sides.forEach(s => { for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(X(s * 0.045), Y(L.cheekDV - 0.02 + i * 0.035)); c.lineTo(X(s * 0.12), Y(L.cheekDV - 0.035 + i * 0.035)); c.stroke(); } });
      } else if (k === 'strokes') { // 3 traits sur une joue
        c.lineWidth = lw * 1.6; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(X(side * 0.05), Y(L.cheekDV - 0.03 + i * 0.03)); c.lineTo(X(side * 0.115), Y(L.cheekDV - 0.045 + i * 0.03)); c.stroke(); }
      } else if (k === 'mask') {
        c.save(); c.globalAlpha *= 0.85; c.beginPath(); c.ellipse(X(0), Y(0), SX(0.135), SY(0.045), 0, 0, Math.PI * 2); c.fill(); c.restore();
      } else if (k === 'eyepaint') { sides.forEach(s => { c.save(); c.globalAlpha *= 0.7; c.beginPath(); c.ellipse(X(s * L.eyeDU), Y(0.005), SX(0.042), SY(0.05), 0, 0, Math.PI * 2); c.fill(); c.restore(); }); }
      else if (k === 'skull') {
        sides.forEach(s => { c.beginPath(); c.ellipse(X(s * L.eyeDU), Y(0), SX(0.04), SY(0.055), 0, 0, Math.PI * 2); c.fill(); });
        c.beginPath(); c.ellipse(X(0), Y(L.noseDV + 0.01), SX(0.014), SY(0.022), 0, 0, Math.PI * 2); c.fill();
        c.lineWidth = lw * 0.7; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(X(i * 0.012), Y(L.mouthDV - 0.025)); c.lineTo(X(i * 0.012), Y(L.mouthDV + 0.025)); c.stroke(); }
      } else if (k === 'sigil' || k === 'third-eye' || k === 'gem') {
        const x = X(0), y = Y(L.browDV - 0.055), s = gs * 1.3;
        if (m.shape === 'sun') { c.beginPath(); c.arc(x, y, s * 0.5, 0, Math.PI * 2); c.fill(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(x + Math.cos(a) * s * 0.75, y + Math.sin(a) * s * 0.75); c.lineTo(x + Math.cos(a) * s * 1.25, y + Math.sin(a) * s * 1.25); c.stroke(); } }
        else { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.7, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.7, y); c.closePath(); c.stroke(); c.beginPath(); c.arc(x, y, s * 0.3, 0, Math.PI * 2); c.fill(); }
      } else if (k === 'dots') { sides.forEach(s => { for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(X(s * (0.06 + i * 0.018)), Y(L.cheekDV - 0.035 + i * 0.004), gs * 0.45, 0, Math.PI * 2); c.fill(); } }); }
      else if (k === 'line' || k === 'chin') { c.beginPath(); c.moveTo(X(0), Y(L.mouthDV + 0.035)); c.lineTo(X(0), Y(L.chinDV + 0.02)); c.stroke(); }
      else if (k === 'veins' || k === 'veins-t' || k === 'cracks') { // veines / fissures ramifiées
        const rr = rng(hashStr(k + m.where)), list = k === 'veins-t' ? [-1, 1] : [side];
        list.forEach(s => {
          const sx = k === 'veins-t' ? s * (L.eyeDU + 0.06) : s * (L.cheekDU + 0.01), sy = k === 'veins-t' ? L.browDV : L.cheekDV + 0.02;
          for (let b = 0; b < (k === 'cracks' ? 5 : 3); b++) {
            let x = X(sx), y = Y(sy), a = -Math.PI / 2 + (rr() - 0.5) * 2.2; c.lineWidth = lw * (k === 'cracks' ? 0.9 : 0.6);
            c.beginPath(); c.moveTo(x, y);
            for (let i = 0; i < 6; i++) { a += (rr() - 0.5) * 0.9; x += Math.cos(a) * gs * 1.2; y += Math.sin(a) * gs * 1.2; c.lineTo(x, y); }
            c.stroke();
          }
        });
      }
    };
    N.marks.forEach(m => {
      const lw = 1.8 * ps;
      wrap3(() => drawMark(ctx, m, abs(m.col, 0.85), lw));
      if (gctx && m.glow > 0) { const c = hexRGB(m.col); gctx.save(); gctx.shadowColor = 'rgba(' + c.join(',') + ',1)'; gctx.shadowBlur = 3; drawMark(gctx, m, 'rgba(' + c.map(v => Math.round(v * clamp(m.glow * 1.4, 0, 1))).join(',') + ',1)', lw * 1.3); gctx.restore(); }
    });
    // cicatrices (A1 : {type, where:'brow-cheekL'|'browR'|'chin'|'lipU'|'cheekL'|'earR'|'neck-cheekR', color} ; ou raccourcis)
    N.scars.forEach((sc, si) => {
      const where = typeof sc === 'string' ? sc : String(sc.where || sc.at || sc.type || 'cheek');
      const type = typeof sc === 'object' ? sc.type || 'line' : 'line';
      const s = (typeof sc === 'object' && sc.side != null) ? (sc.side < 0 || sc.side === 'r' || sc.side === 'R' ? -1 : 1) : (/R$|R-|R\b/.test(where) ? -1 : /L$|L-|L\b/.test(where) ? 1 : (si % 2 ? 1 : -1));
      let pts;
      if (typeof sc === 'object' && Array.isArray(sc.pts)) pts = sc.pts;
      else if (/^eye$|brow-cheek/.test(where)) pts = [[s * L.eyeDU - 0.012, L.browDV - 0.045], [s * L.eyeDU + 0.012, L.cheekDV + 0.02]];
      else if (/brow/.test(where)) pts = [[s * (L.eyeDU + 0.012), L.browDV - 0.03], [s * (L.eyeDU - 0.006), L.browDV + 0.012]];
      else if (/lip/.test(where)) pts = [[s * 0.012, L.mouthDV - 0.045], [s * 0.006, L.mouthDV - 0.008]];
      else if (/chin/.test(where)) pts = [[s * 0.02, L.chinDV - 0.045], [-s * 0.012, L.chinDV]];
      else if (/nose/.test(where)) pts = [[-0.03, L.noseDV - 0.03], [0.03, L.noseDV - 0.01]];
      else if (/neck-cheek/.test(where)) pts = [[s * 0.1, L.cheekDV - 0.02], [s * 0.13, L.chinDV + 0.04]];
      else if (/ear/.test(where)) pts = [[s * 0.15, L.noseDV - 0.03], [s * 0.16, L.noseDV + 0.02]];
      else pts = [[s * 0.05, L.cheekDV - 0.03], [s * 0.115, L.cheekDV + 0.05]];
      const scol = typeof sc === 'object' && sc.color != null ? toHex(sc.color, 0xd99a8a) : 0xd99a8a;
      wrap3(() => {
        const x0 = X(pts[0][0]), y0 = Y(pts[0][1]), x1 = X(pts[1][0]), y1 = Y(pts[1][1]);
        const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len, ny = (x1 - x0) / len, k = ps;
        const path = () => {
          ctx.beginPath(); ctx.moveTo(x0, y0);
          if (type === 'lightning') { for (let t = 1; t <= 4; t++) { const f = t / 4, o = t < 4 ? (t % 2 ? 1 : -1) * 3 * k : 0; ctx.lineTo(x0 + (x1 - x0) * f + nx * o, y0 + (y1 - y0) * f + ny * o); } }
          else ctx.quadraticCurveTo((x0 + x1) / 2 + nx * 2 * k, (y0 + y1) / 2 + ny * 2 * k, x1, y1);
          ctx.stroke();
        };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = rel(0x9a5a5e, 0.5); ctx.lineWidth = (type === 'nick' ? 3.5 : 4.5) * k; path();
        const sc2 = hexRGB(scol); ctx.strokeStyle = 'rgba(' + Math.round((sc2[0] + SKIN[0]) / 2 + 20) + ',' + Math.round((sc2[1] + SKIN[1]) / 2) + ',' + Math.round((sc2[2] + SKIN[2]) / 2) + ',0.85)';
        ctx.lineWidth = 1.7 * k; path();
        if (type === 'line' || type === 'slit') { ctx.strokeStyle = rel(0x8a5055, 0.45); ctx.lineWidth = k; for (let t = 0.2; t < 0.9; t += 0.2) { const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t; ctx.beginPath(); ctx.moveTo(cx - nx * 3 * k, cy - ny * 3 * k); ctx.lineTo(cx + nx * 3 * k, cy + ny * 3 * k); ctx.stroke(); } }
      });
    });
    // trous aux yeux (mode decal) : la coque ne doit jamais voiler les globes oculaires
    if (decal && L.eyes) {
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      L.eyes.forEach(e => {
        const x = e[0] * W, y = (1 - e[1]) * H, rx = L.eyeRU * W, ry = L.eyeRV * H;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function faceBytes(e) { return e ? e.bytes || 0 : 0; }
  function face(faceSpec) {
    if (!T) return null;
    let fs = faceSpec || {};
    try {
      const clean = {};
      Object.keys(fs).forEach(k => { if (!/^\d+$/.test(k)) clean[k] = fs[k]; });
      if (fs.head && typeof fs.head === 'object') Object.keys(fs.head).forEach(k => { if (clean[k] == null) clean[k] = fs.head[k]; });
      fs = clean;
    } catch (e) { fs = {}; }
    let key;
    try { key = stableKey(fs); } catch (e) { key = 'default'; }
    try {
      if (FACES.has(key)) { const e = FACES.get(key); FACES.delete(key); FACES.set(key, e); return e.mat; } // LRU
      const U = fs.uv && typeof fs.uv === 'object' ? fs.uv : (fs.uv === 'decal' && G.HeroKit && G.HeroKit.FACE_UV ? G.HeroKit.FACE_UV : null);
      let L, decal = false;
      if (U) { L = Object.assign(layoutFromUV(U), fs.layout || {}); decal = true; }
      else {
        const kind = fs.uv === 'lathe' || fs.uvMode === 'lathe' ? 'lathe' : 'sphere';
        const kitL = kind === 'sphere' && G.HeroKit && G.HeroKit.FACE_LAYOUT && typeof G.HeroKit.FACE_LAYOUT === 'object' ? G.HeroKit.FACE_LAYOUT : null;
        L = Object.assign({}, FACE_LAYOUT[kind], kitL || {}, fs.layout || {});
        ['u', 'eyeV', 'kU', 'kV', 'eyeDU', 'browDV', 'noseDV', 'mouthDV', 'chinDV', 'cheekDU', 'cheekDV', 'faceDU'].forEach(k => { if (!isFinite(+L[k])) L[k] = FACE_LAYOUT[kind][k]; else L[k] = +L[k]; });
      }
      const W = decal ? 256 : 512, Hh = 256;
      const c = mkCanvas(W, Hh);
      let tex = null, gtex = null, bytes = 0;
      if (c) {
        const ctx = c.getContext('2d');
        let gc = null;
        const needGlow = [].concat(fs.marks || [], fs.tattoo || []).some(m => m && typeof m === 'object' && num(m.glow, 0) > 0);
        if (needGlow) { gc = mkCanvas(W / 2, Hh / 2); if (gc) { const g = gc.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W / 2, Hh / 2); g.scale(0.5, 0.5); } }
        if (!decal) { // fond opaque : pores de peau (raccord avec la couche skin)
          const skinC = texture('skin') && CANVAS.skin;
          if (skinC) { for (let y = 0; y < Hh; y += skinC.height) for (let x = 0; x < W; x += skinC.width) ctx.drawImage(skinC, x, y); }
          else { ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, W, Hh); }
        }
        paintFace(ctx, fs, L, W, Hh, gc ? gc.getContext('2d') : null);
        tex = makeTex(c, { clampT: true, clampS: decal }); bytes += bytesOf(W, Hh, true);
        if (gc) { gtex = makeTex(gc, { clampT: true, clampS: decal }); bytes += bytesOf(W / 2, Hh / 2, true); }
      }
      const skinMean = MEAN.skin || 0.95;
      const p = { color: new T.Color(toHex(fs.tint, 0xffffff)), vertexColors: true, emissive: new T.Color(decal ? 0x000000 : 0x080302), emissiveIntensity: 1 };
      if (!decal) p.color.multiplyScalar((1 + (clamp(1 / skinMean, 1, 1.4) - 1) * 0.3) * RECIPE.skin.expo);   // même exposition que la couche skin
      const gm = gradient(); if (gm) p.gradientMap = gm;
      if (tex) p.map = tex;
      if (gtex) { p.emissiveMap = gtex; p.emissive = new T.Color(0xffffff); }
      if (decal) { p.transparent = true; p.depthWrite = false; p.alphaTest = 0.02; p.polygonOffset = true; p.polygonOffsetFactor = -1; p.polygonOffsetUnits = -1; if (!tex) p.opacity = 0; }
      const m = new T.MeshToonMaterial(p);
      m.name = 'hero6-face'; m.userData = m.userData || {}; m.userData.shared = true; m.userData.heroLayer = 'face'; m.userData.faceDecal = decal;
      patch(m);
      FACES.set(key, { mat: m, tex, gtex, canvas: c, gcanvas: gtex ? gtex.image : null, bytes });
      while (FACES.size > FACE_MAX) { // éviction : libère le GPU (re-téléversé automatiquement si encore utilisé)
        const k0 = FACES.keys().next().value, e0 = FACES.get(k0); FACES.delete(k0);
        try { if (e0.tex) e0.tex.dispose(); if (e0.gtex) e0.gtex.dispose(); } catch (e) { /* rien */ }
      }
      return m;
    } catch (e) {
      try { console.warn('[HeroTex] face', e); } catch (_) { /* rien */ }
      return null;
    }
  }

  function stats() {
    let fb = 0; FACES.forEach(e => { fb += faceBytes(e); });
    return { textures: Object.keys(TEX).filter(k => TEX[k]).length + Object.keys(ROUGH).filter(k => ROUGH[k]).length + (ENV ? 1 : 0),
      bytes: texBytes + fb, staticBytes: texBytes, faceBytes: fb, faces: FACES.size, materials: matCount, hasDocument: HAS_DOC };
  }
  // pour l'export PNG / les tests : tous les canvas générés (force la génération)
  function canvases() {
    Object.keys(TEX_DEF).forEach(texture);
    ['metal', 'gold', 'blade', 'gem'].forEach(n => roughTex(n, ROUGH_BASE, 1.8));
    envMap();
    const out = Object.assign({}, CANVAS);
    let i = 0; FACES.forEach(e => { if (e.canvas) out['face' + i] = e.canvas; if (e.gcanvas) out['faceglow' + i] = e.gcanvas; i++; });
    return out;
  }
  function warm() { try { LAYERS.forEach(l => mat(l)); } catch (e) { /* rien */ } }

  G.HeroTex = { mat, instance, face, texture, stats, canvases, warm, envMap, gradient,
    LAYERS: LAYERS.slice(), TEX_NAMES: Object.keys(TEX_DEF), FACE_LAYOUT, layoutFromUV, version: 2 };
})();
