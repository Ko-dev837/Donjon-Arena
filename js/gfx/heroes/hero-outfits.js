/* =====================================================================
 *  v6 — hero-outfits.js (A4 Armor & Clothing Designer)
 *  G.HeroOutfits.build(R, spec) : tenues, armures (légère / intermédiaire /
 *  lourde), capes (chaîne capeA > capeB > capeC), bottes, gants, ceintures,
 *  ornements, coiffes — pour les 8 classes et leurs skins.
 *  Toutes les pièces passent par R.add(os, couche, géo, couleur, pos, échelle, rot, o)
 *  (fusion par (os, couche) côté HeroKit). Géométries unitaires partagées
 *  (userData.shared = true), construites une seule fois. Aucune logique par image.
 *  Expose aussi G.HeroOutfits.util (utilisé par hero-weapons.js).
 * ===================================================================== */
window.G = window.G || {};
(function () {
  'use strict';
  const G = window.G;
  const PI = Math.PI, TAU = PI * 2, HP = PI / 2;

  // ------------------------------------------------------------------ couleurs
  function hex(c, d) {
    if (typeof c === 'number' && isFinite(c)) return c >>> 0;
    if (typeof c === 'string') { const v = parseInt(c.replace('#', ''), 16); if (isFinite(v)) return v; }
    if (c && c.isColor) return c.getHex();
    return d == null ? 0x888888 : d;
  }
  function shade(c, f) {
    c = hex(c);
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }
  function mix(a, b, t) {
    a = hex(a); b = hex(b);
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
    const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
    const bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }

  // ------------------------------------------------------------------ géométries
  const GEO = {};
  function cache(key, mk) {
    let g = GEO[key];
    if (!g) { g = mk(); g.userData = g.userData || {}; g.userData.shared = true; GEO[key] = g; }
    return g;
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  /** mini constructeur de maillage indexé */
  function MB() {
    const p = [], uv = [], ix = [];
    return {
      v(x, y, z, u, w) { p.push(x, y, z); uv.push(u || 0, w || 0); return p.length / 3 - 1; },
      tri(a, b, c) { ix.push(a, b, c); },
      quad(a, b, c, d) { ix.push(a, b, c, a, c, d); },
      geo() {
        const T = window.THREE;
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        g.setIndex(ix);
        g.computeVertexNormals();
        return g;
      },
    };
  }

  /** Coque (anneau épais, arc ou tube complet) : rayon 0.5 en bas, y ∈ [-0.5, 0.5].
   *  o = { span (rad), back (centré sur -Z), rt (rayon haut / bas), rm (rayon milieu), th (épaisseur relative),
   *        pl (nb de plis), pa (amplitude des plis en bas), n (segments), jag (ourlet déchiqueté) } */
  function shellGeo(o) {
    o = o || {};
    const span = o.span == null ? TAU : Math.min(TAU, o.span), back = !!o.back;
    const rt = o.rt == null ? 1 : o.rt, rm = o.rm == null ? (1 + rt) / 2 : o.rm;
    const th = o.th == null ? 0.12 : o.th, pl = o.pl || 0, pa = o.pa || 0, jag = o.jag || 0;
    const n = Math.max(5, Math.round((o.n || 16) * 0.62));
    const three = o.rm != null || pl > 0 || jag > 0; // 3 rangées seulement si bombé / plissé
    const inner = o.inner != null ? !!o.inner : (pa > 0.05 || !!o.open);
    const key = 'sh|' + (three ? 3 : 2) + (inner ? 'i' : '') + '|' + r2(span) + '|' + (back ? 1 : 0) + '|' + r2(rt) + '|' + r2(rm) + '|' + r2(th) + '|' + pl + '|' + r2(pa) + '|' + n + '|' + r2(jag);
    return cache(key, () => {
      const full = span >= TAU - 1e-3;
      const rows = three ? [[0.5, rt, 0.25], [0, rm, 0.6], [-0.5, 1, 1]] : [[0.5, rt, 0.25], [-0.5, 1, 1]];
      const NR = rows.length, LAST = NR - 1;
      const off = back ? PI : 0;
      const m = MB();
      const P = (ri, i, inner) => {
        const f = i / n, ph = off - span / 2 + span * f;
        const row = rows[ri];
        let r = 0.5 * row[1] * (1 + pa * row[2] * Math.cos(pl * ph));
        if (inner) r *= (1 - th);
        let y = row[0];
        if (ri === LAST && jag) y += jag * ((i % 2) ? 1 : 0.15 * ((i * 7) % 3));
        return [Math.sin(ph) * r, y, Math.cos(ph) * r, f];
      };
      const surf = (inner) => {
        const id = [];
        for (let ri = 0; ri < NR; ri++) { id.push([]); for (let i = 0; i <= n; i++) { const q = P(ri, i, inner); id[ri].push(m.v(q[0], q[1], q[2], q[3] * span, 0.5 - q[1])); } }
        for (let ri = 0; ri < LAST; ri++) for (let i = 0; i < n; i++) {
          const t0 = id[ri][i], b0 = id[ri + 1][i], b1 = id[ri + 1][i + 1], t1 = id[ri][i + 1];
          if (!inner) m.quad(t0, b0, b1, t1); else m.quad(t0, t1, b1, b0);
        }
      };
      surf(false); if (inner) surf(true);
      // bords haut / bas (le bas seulement si l'intérieur est construit)
      for (const ri of [0, LAST]) {
        const oi = [], ni = [];
        for (let i = 0; i <= n; i++) { const a = P(ri, i, false), b = P(ri, i, true); oi.push(m.v(a[0], a[1], a[2], a[3], 0)); ni.push(m.v(b[0], b[1], b[2], a[3], 0.05)); }
        for (let i = 0; i < n; i++) {
          if (ri === 0) m.quad(oi[i], oi[i + 1], ni[i + 1], ni[i]); else m.quad(oi[i], ni[i], ni[i + 1], oi[i + 1]);
        }
      }
      if (!full) {
        for (const i of [0, n]) {
          const ids = [];
          for (let ri = 0; ri < NR; ri++) { const a = P(ri, i, false), b = P(ri, i, true); ids.push([m.v(a[0], a[1], a[2], 0, ri * 0.5), m.v(b[0], b[1], b[2], 0.05, ri * 0.5)]); }
          for (let ri = 0; ri < LAST; ri++) {
            const ot = ids[ri][0], nt = ids[ri][1], ob = ids[ri + 1][0], nb = ids[ri + 1][1];
            if (i === 0) m.quad(ot, nt, nb, ob); else m.quad(ot, ob, nb, nt);
          }
        }
      }
      return m.geo();
    });
  }

  /** Panneau épais légèrement courbé : haut en y=0, bas en y=-1, x ∈ [-0.5,0.5] (bas × fl),
   *  bombé vers +Z (cv, relatif à la largeur), épaisseur th, ourlet déchiqueté jag. */
  function panelGeo(o) {
    o = o || {};
    const cv = o.cv == null ? 0.12 : o.cv, fl = o.fl == null ? 1 : o.fl, th = o.th == null ? 0.05 : o.th;
    const n = o.n || 6, jag = o.jag || 0, tip = o.tip || 0;
    const key = 'pn|' + r2(cv) + '|' + r2(fl) + '|' + r2(th) + '|' + n + '|' + r2(jag) + '|' + r2(tip);
    return cache(key, () => {
      const m = MB();
      const P = (row, i, side) => {
        const f = i / n, w = row ? fl : 1, x = (f - 0.5) * w;
        let z = cv * (1 - 4 * (f - 0.5) * (f - 0.5)) * (row ? 1.15 : 1);
        z += side * th / 2;
        let y = row ? -1 : 0;
        if (row && jag) y += jag * ((i % 2) ? 1 : 0.2 * ((i * 5) % 3));
        if (row && tip) y -= tip * (1 - Math.abs(f - 0.5) * 2);
        return [x, y, z, f];
      };
      const surf = (side) => {
        const t = [], b = [];
        for (let i = 0; i <= n; i++) { const a = P(0, i, side), c = P(1, i, side); t.push(m.v(a[0], a[1], a[2], a[3], 0)); b.push(m.v(c[0], c[1], c[2], c[3], 1)); }
        for (let i = 0; i < n; i++) { if (side > 0) m.quad(t[i], b[i], b[i + 1], t[i + 1]); else m.quad(t[i], t[i + 1], b[i + 1], b[i]); }
      };
      surf(1); surf(-1);
      for (const row of [0, 1]) {
        const oi = [], ni = [];
        for (let i = 0; i <= n; i++) { const a = P(row, i, 1), b = P(row, i, -1); oi.push(m.v(a[0], a[1], a[2], a[3], 0)); ni.push(m.v(b[0], b[1], b[2], a[3], 0.05)); }
        for (let i = 0; i < n; i++) { if (row === 0) m.quad(oi[i], oi[i + 1], ni[i + 1], ni[i]); else m.quad(oi[i], ni[i], ni[i + 1], oi[i + 1]); }
      }
      for (const i of [0, n]) {
        const ot = m.v(...P(0, i, 1).slice(0, 3)), nt = m.v(...P(0, i, -1).slice(0, 3));
        const ob = m.v(...P(1, i, 1).slice(0, 3)), nb = m.v(...P(1, i, -1).slice(0, 3));
        if (i === 0) m.quad(ot, nt, nb, ob); else m.quad(ot, ob, nb, nt);
      }
      return m.geo();
    });
  }

  /** Lame / pointe à section losange le long de +Y (y ∈ [0,1]), largeur 1 (x), épaisseur 1 (z).
   *  prof : tableau [y, demi-largeur] ; edge : épaisseur relative du fil ; curve : courbure (décalage x ∝ y²). */
  function bladeGeo(name, prof, curve, fuller) {
    return cache('bl|' + name, () => {
      const m = MB();
      const cz = 0.5, fz = fuller || 0;
      const ring = [];
      for (let k = 0; k < prof.length; k++) {
        const y = prof[k][0], w = prof[k][1], cx = (curve || 0) * y * y + (prof[k][2] || 0);
        const zc = cz * Math.min(1, w * 2.2 + 0.05);
        // 6 points : fil gauche, dos haut, (gouttière), fil droit, dos bas
        ring.push([
          [cx - w, y, 0], [cx - w * 0.35, y, zc * (1 - fz)], [cx, y, zc], [cx + w * 0.35, y, zc * (1 - fz)], [cx + w, y, 0],
          [cx + w * 0.35, y, -zc * (1 - fz)], [cx, y, -zc], [cx - w * 0.35, y, -zc * (1 - fz)],
        ]);
      }
      const N = 8;
      for (let k = 0; k < ring.length - 1; k++) {
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          const a = ring[k][i], b = ring[k][j], c = ring[k + 1][j], d = ring[k + 1][i];
          const va = m.v(a[0], a[1], a[2], i / N, a[1]), vb = m.v(b[0], b[1], b[2], (i + 1) / N, b[1]);
          const vc = m.v(c[0], c[1], c[2], (i + 1) / N, c[1]), vd = m.v(d[0], d[1], d[2], i / N, d[1]);
          m.quad(va, vb, vc, vd); // normales sortantes (le contour du profil tourne en sens horaire vu de +Y)
        }
      }
      // fond (bas) fermé
      const c0 = m.v(ring[0][2][0], ring[0][0][1], 0, 0.5, 0);
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; const a = ring[0][i], b = ring[0][j]; m.tri(c0, m.v(a[0], a[1], a[2]), m.v(b[0], b[1], b[2])); }
      return m.geo();
    });
  }

  function latheGeo(name, pts, segs) {
    return cache('la|' + name + '|' + (segs || 12), () => {
      const T = window.THREE;
      const v = pts.map((p) => new T.Vector2(Math.max(0.0001, p[0]), p[1]));
      return new T.LatheGeometry(v, segs || 12);
    });
  }

  const GE = {
    box: () => cache('box', () => new window.THREE.BoxGeometry(1, 1, 1)),
    sph: () => cache('sph', () => new window.THREE.SphereGeometry(0.5, 9, 6)),
    sphLo: () => cache('sphLo', () => new window.THREE.SphereGeometry(0.5, 6, 4)),
    hemi: () => cache('hemi', () => new window.THREE.SphereGeometry(0.5, 12, 4, 0, TAU, 0, HP)),
    dome: (k) => cache('dome' + k, () => new window.THREE.SphereGeometry(0.5, 11, 4, 0, TAU, 0, HP * k)),
    cyl: (n) => { const nn = Math.min(n || 8, 8); return cache('cyl' + nn, () => new window.THREE.CylinderGeometry(0.5, 0.5, 1, nn, 1)); },
    fr: (ratio, n) => { const r = r2(ratio), nn = Math.min(n || 8, 9); return cache('fr' + r + '|' + nn, () => new window.THREE.CylinderGeometry(0.5 * r, 0.5, 1, nn, 1)); },
    cone: (n) => { const nn = Math.min(n || 7, 7); return cache('cone' + nn, () => new window.THREE.ConeGeometry(0.5, 1, nn)); },
    torus: (t, n) => { const tt = r2(t), nn = Math.max(6, Math.round((n || 16) * 0.55)); return cache('to' + tt + '|' + nn, () => new window.THREE.TorusGeometry(0.5, 0.5 * tt, 4, nn)); },
    octa: () => cache('octa', () => new window.THREE.OctahedronGeometry(0.5, 0)),
    ico: () => cache('ico', () => new window.THREE.IcosahedronGeometry(0.5, 0)),
    tetra: () => cache('tetra', () => new window.THREE.TetrahedronGeometry(0.5, 0)),
    shell: shellGeo, panel: panelGeo, blade: bladeGeo, lathe: latheGeo,
    /** capuche : sphère sans la partie frontale basse (ouverture du visage) ; f = profondeur de la calotte avant */
    hoodGeo: (f) => cache('hood' + r2(f), () => {
      const m = MB(), nT = 6, nP = 12, R0 = 0.5;
      // la calotte couvre tout le haut (theta < thetaFront) ; devant, l'ouverture descend jusqu'au menton
      const open = 1.1; // demi-largeur angulaire de l'ouverture (rad) autour de +Z
      const tMax = 2.25, tFront = 0.95 * f + 0.25;
      const V = [];
      for (let i = 0; i <= nT; i++) {
        V.push([]);
        for (let j = 0; j <= nP; j++) {
          const ph = j / nP * TAU; // ph = 0 → +Z
          const da = Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph)));
          const lim = da < open ? tFront + (tMax - tFront) * Math.pow(da / open, 2) : tMax;
          const th = i / nT * lim;
          V[i].push([Math.sin(th) * Math.sin(ph) * R0, Math.cos(th) * R0, Math.sin(th) * Math.cos(ph) * R0]);
        }
      }
      for (const side of [1, -1]) {
        const id = V.map((row, i) => row.map((p, j) => { const s2 = side > 0 ? 1 : 0.95; return m.v(p[0] * s2, p[1] * s2, p[2] * s2, j / nP, i / nT); }));
        for (let i = 0; i < nT; i++) for (let j = 0; j < nP; j++) {
          const a = id[i][j], b = id[i + 1][j], c = id[i + 1][j + 1], d = id[i][j + 1];
          if (side > 0) m.quad(a, b, c, d); else m.quad(a, d, c, b);
        }
      }
      return m.geo();
    }),
    // fiole (lathe) : col, panse ronde
    vial: () => latheGeo('vial', [[0, -0.5], [0.45, -0.4], [0.5, 0.0], [0.18, 0.28], [0.18, 0.5], [0, 0.5]], 6),
    gemCut: () => latheGeo('gem', [[0, -0.5], [0.5, 0.05], [0.36, 0.38], [0, 0.42]], 6),
    rivet: () => cache('rivet', () => new window.THREE.ConeGeometry(0.5, 0.6, 4, 1)),
    // pointe d'épaulière / corne recourbée (lathe effilée)
    spike: () => latheGeo('spike', [[0.5, -0.5], [0.36, -0.05], [0.14, 0.32], [0, 0.5]], 5),
  };

  // ------------------------------------------------------------------ orientation (build seulement)
  let _tmp = null;
  function tmp() {
    const T = window.THREE;
    if (!_tmp) _tmp = { m: new T.Matrix4(), q: new T.Quaternion(), q2: new T.Quaternion(), e: new T.Euler(), v: new T.Vector3(), x: new T.Vector3(), y: new T.Vector3(), z: new T.Vector3() };
    return _tmp;
  }
  /** rotation (Euler XYZ) qui envoie +Y sur dir et +Z vers 'front' (local), puis applique la rotation locale rl */
  function alignEuler(dir, front, rl) {
    const t = tmp();
    t.y.set(dir[0], dir[1], dir[2]).normalize();
    t.z.set(front ? front[0] : 0, front ? front[1] : 0, front ? front[2] : 1);
    t.z.addScaledVector(t.y, -t.z.dot(t.y));
    if (t.z.lengthSq() < 1e-6) { t.z.set(1, 0, 0); t.z.addScaledVector(t.y, -t.z.dot(t.y)); }
    t.z.normalize();
    t.x.crossVectors(t.y, t.z).normalize();
    t.m.makeBasis(t.x, t.y, t.z);
    t.q.setFromRotationMatrix(t.m);
    if (rl) { t.e.set(rl[0] || 0, rl[1] || 0, rl[2] || 0); t.q2.setFromEuler(t.e); t.q.multiply(t.q2); }
    t.e.setFromQuaternion(t.q);
    return [t.e.x, t.e.y, t.e.z];
  }
  /** compose deux rotations Euler (a puis b dans le repère de a) */
  function composeEuler(a, b) {
    const t = tmp();
    t.e.set(a[0], a[1], a[2]); t.q.setFromEuler(t.e);
    t.e.set(b[0], b[1], b[2]); t.q2.setFromEuler(t.e);
    t.q.multiply(t.q2); t.e.setFromQuaternion(t.q);
    return [t.e.x, t.e.y, t.e.z];
  }

  // ------------------------------------------------------------------ mesures du rig
  const DEF = { // pour k = 1 (héros ≈ 2,25 u)
    chW: 0.205, chD: 0.135, waW: 0.165, waD: 0.12, hiW: 0.18, hiD: 0.13,
    armR0: 0.064, armR1: 0.05, foreR0: 0.052, foreR1: 0.036, thR0: 0.09, thR1: 0.064, shR0: 0.064, shR1: 0.043,
    headR: 0.165, headY: 0.14, neckR: 0.06, footL: 0.25, footH: 0.085, footW: 0.058, handL: 0.17,
  };
  function measure(R, spec) {
    const B = R.bones || {};
    const P = (n) => (B[n] && B[n].position) || null;
    const H = (spec && +spec.height) || R.height || 2.25;
    const k = +(R.k || R.scaleK || (spec && spec.scale) || H / 2.25) || 1;
    const D = R.dims || (R.info && R.info.dims) || {};
    const d = (name) => (D[name] != null ? D[name] : DEF[name] * k);
    const len = (n, def) => { const p = P(n); return p && p.length() > 1e-4 ? p.length() : def * k; };
    const dir = (n, def) => { const p = P(n); if (!p || p.length() < 1e-4) return def.slice(); const l = p.length(); return [p.x / l, p.y / l, p.z / l]; };
    const wy = (name) => { let y = 0, b = B[name], g = 0; while (b && g++ < 20) { if (b === R.root || b === R.rig) break; y += b.position.y; b = b.parent; } return y; };
    const m = { k, H, dims: D };
    for (const s of ['L', 'R']) {
      m['arm' + s] = len('forearm' + s, 0.3); m['aArm' + s] = dir('forearm' + s, [0, -1, 0]);
      m['fore' + s] = len('wrist' + s, 0.27); m['aFore' + s] = dir('wrist' + s, [0, -1, 0]);
      m['thigh' + s] = len('shin' + s, 0.46); m['aThigh' + s] = dir('shin' + s, [0, -1, 0]);
      m['shin' + s] = len('foot' + s, 0.44); m['aShin' + s] = dir('foot' + s, [0, -1, 0]);
    }
    const nk = P('neck'), sh = P('shoulderL'), ar = P('armL'), lg = P('legL'), ch = P('chest');
    m.neckY = nk ? nk.y : 0.36 * k; m.neckZ = nk ? nk.z : 0;
    m.spineLen = ch ? ch.y : 0.2 * k;
    m.shX = Math.abs((sh ? sh.x : 0.1 * k) + (ar ? ar.x : 0.12 * k)) || 0.22 * k;
    m.shY = (sh ? sh.y : 0.3 * k) + (ar ? ar.y : 0);
    m.hipX = lg ? Math.abs(lg.x) : 0.1 * k; m.legY = lg ? lg.y : -0.04 * k;
    for (const n in DEF) m[n] = d(n);
    m.capeLen = [len('capeB', 0.38), len('capeC', 0.38)];
    m.yChest = wy('chest'); m.yCapeA = B.capeA ? wy('capeA') : m.yChest + m.neckY * 0.9;
    m.capeA = P('capeA') ? [P('capeA').x, P('capeA').y, P('capeA').z] : [0, m.neckY * 0.92, -m.chD];
    m.ground = 0.03 * k; // bas des capes longues
    return m;
  }

  // ------------------------------------------------------------------ palette
  const CLASS_PAL = {
    Guerrier: { main: 0x2f5fa8, second: 0xd8dde6, trim: 0xc9a23a, metal: 0xaab4c0, leather: 0x6b4423, gem: 0x46b4ff },
    Mage: { main: 0x5b2a9a, second: 0x2a1748, trim: 0xd9b24a, metal: 0x9aa0b4, leather: 0x4a2c1c, gem: 0xb44dff },
    Voleur: { main: 0x2f6b4a, second: 0x2a3a2f, trim: 0x2fd4c0, metal: 0x9aa3ad, leather: 0x5a3a22, gem: 0x2fd4c0 },
    Assassin: { main: 0x1c1a22, second: 0x8a1424, trim: 0xd7343f, metal: 0x7a808c, leather: 0x2a2228, gem: 0xff3d4e },
    Archer: { main: 0x2f6e3a, second: 0x6b8a3a, trim: 0xc9a86a, metal: 0x9aa3ad, leather: 0x7a5230, gem: 0x7dffb0 },
    Paladin: { main: 0xf0ead8, second: 0x2f6fd1, trim: 0xe0b53a, metal: 0xd8dde6, leather: 0x6b4423, gem: 0xfff2a8 },
    Elementaliste: { main: 0x2a5aa8, second: 0xdff3ff, trim: 0x9fe8ff, metal: 0xb8c8dc, leather: 0x3a3048, gem: 0x7ad8ff },
    Necromancien: { main: 0x2a1838, second: 0x12101a, trim: 0x8b6bff, metal: 0x6a6478, leather: 0x2a2028, gem: 0x3dffb0 },
  };
  function palette(spec) {
    const cls = spec.classId, base = CLASS_PAL[cls] || CLASS_PAL.Guerrier;
    const p = spec.palette || {};
    const pick = (...ks) => { for (const k of ks) if (p[k] != null) return hex(p[k]); return null; };
    const main = pick('primary', 'main', 'cloth', 'color', 'outfit') ?? (spec.color != null ? hex(spec.color) : base.main);
    const second = pick('secondary', 'second', 'cloth2') ?? base.second;
    const trim = pick('gold', 'trim', 'ornament') ?? base.trim;
    const metal = pick('metal', 'armor', 'steel', 'plate') ?? base.metal;
    const leather = pick('leather', 'strap') ?? base.leather;
    const gem = pick('gem', 'accent', 'glow', 'eye') ?? base.gem;
    const glow = pick('glow', 'accent', 'gem') ?? gem;
    return {
      main, mainD: pick('primaryDark') ?? shade(main, -0.32), mainL: shade(main, 0.18), second, secondD: shade(second, -0.3),
      cloth2: pick('cloth2') ?? shade(second, -0.3),
      trim, trimD: shade(trim, -0.3), metal, metalD: pick('metalDark') ?? shade(metal, -0.35), metalL: shade(metal, 0.25),
      leather, leatherD: pick('leatherDark') ?? shade(leather, -0.35), leatherL: shade(leather, 0.2), gem, glow,
      accent: pick('accent') ?? gem, accent2: pick('accent2') ?? glow,
      cape: pick('cape'), capeLining: pick('capeLining'),
      fur: pick('fur') ?? 0xd9cdb8, bone: pick('bone') ?? 0xe8e0c8, cord: pick('cord', 'rope') ?? 0xb89a6a,
      dark: pick('dark') ?? shade(main, -0.6), stitch: shade(leather, 0.45),
    };
  }

  // ------------------------------------------------------------------ contexte de construction
  function ctx(R, spec) {
    const m = measure(R, spec), c = palette(spec);
    let tris = 0;
    const triCount = (g) => (g.index ? g.index.count / 3 : (g.attributes.position.count / 3));
    const X = {
      R, spec, m, c, k: m.k,
      get tris() { return tris; },
      /** ajout brut (pos / échelle / rot en repère local de l'os) */
      add(bone, layer, geo, color, pos, scale, rot, o) {
        if (!geo || !R.bones || !R.bones[bone]) return;
        const s = typeof scale === 'number' ? [scale, scale, scale] : (scale || [1, 1, 1]);
        if (!(s[0] > 1e-5 && s[1] > 1e-5 && s[2] > 1e-5)) return;
        o = o || {};
        if (o.outline == null) { const mx = Math.max(s[0], s[1], s[2]); o = Object.assign({}, o, { outline: mx >= 0.25 * m.k && layer !== 'glow' && layer !== 'trans' }); }
        tris += triCount(geo) * (o.outline ? 2 : 1);
        R.add(bone, layer, geo, hex(color), pos || [0, 0, 0], s, rot || [0, 0, 0], o);
      },
      /** repère d'un segment de membre : origine de l'os → os enfant */
      seg(bone, s, part) {
        const L = m[part + s], a = m['a' + (part[0].toUpperCase() + part.slice(1)) + s];
        return { L, a };
      },
    };
    return X;
  }

  /** pièce le long d'un segment (bras/jambe) : t ∈ [0,1] le long, off = décalage [x,y?,z] (x : +X os, z : avant) */
  function onSeg(X, bone, part, s, t0, t1, geo, layer, col, sx, sz, o, rl, off) {
    const L = X.m[part + s], a = X.m['a' + part[0].toUpperCase() + part.slice(1) + s];
    const tm = (t0 + t1) / 2 * L, h = Math.abs(t1 - t0) * L;
    const ox = off ? off[0] : 0, oz = off ? off[2] || 0 : 0;
    const pos = [a[0] * tm + ox, a[1] * tm, a[2] * tm + oz];
    const dir = t1 >= t0 ? a : [-a[0], -a[1], -a[2]];
    X.add(bone, layer, geo, col, pos, [sx * 2, h, (sz == null ? sx : sz) * 2], alignEuler(dir, [0, 0, 1], rl), o);
  }
  /** point le long d'un segment */
  function segPt(X, part, s, t, ox, oz) {
    const L = X.m[part + s], a = X.m['a' + part[0].toUpperCase() + part.slice(1) + s];
    return [a[0] * t * L + (ox || 0), a[1] * t * L, a[2] * t * L + (oz || 0)];
  }

  const NO = { outline: false };
  const SIDES = [['L', 1], ['R', -1]];
  /** poids de peau « suit les jambes » d'un tissu qui pend (yTop → yBot, repère de l'os porteur) :
   *  la moitié gauche suit la cuisse gauche, la droite la droite, de plus en plus vers le bas → les jambes ne traversent plus le tissu */
  function legFollow(X, yTop, yBot, max) {
    const m = X.m, span = Math.max(0.02, yTop - yBot);
    const at = yTop - span * 0.4, range = -span * 0.5, xr = Math.max(0.03, (m.hipX || m.hiW * 0.5) * 1.1), mx = max || 0.9;
    return [{ to: 'legL', at, range, max: mx, sx: 1, xr }, { to: 'legR', at, range, max: mx, sx: -1, xr }];
  }
  const withB = (o, bl) => Object.assign({}, o || {}, { blend: bl });

  // =================================================================
  //  BIBLIOTHÈQUE DE PIÈCES
  // =================================================================
  const P = {};

  /** rivets en ligne (pas de contour) */
  P.rivets = function (X, bone, layer, col, pts, r) {
    const g = GE.rivet();
    for (let i = 0; i < pts.length; i += (pts.length > 3 ? 2 : 1)) { const p = pts[i]; X.add(bone, layer, g, col, [p[0], p[1], p[2]], [r * 2, r, r * 2], p[3] || [HP, 0, 0], NO); }
  };
  /** surpiqûres : petits traits clairs le long d'une ligne a→b (pas de contour) */
  P.stitches = function (X, bone, col, a, b, nb, layer) {
    const g = GE.box(), k = X.k;
    for (let i = 0; i < nb; i++) {
      const t = (i + 0.5) / nb;
      X.add(bone, layer || 'leather', g, col, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], [0.006 * k, 0.018 * k, 0.006 * k], null, NO);
    }
  };
  /** boucle de ceinture/sangle (cadre + ardillon) orientée vers +Z (ou rot) */
  P.buckle = function (X, bone, pos, size, col, rot) {
    const k = X.k, s = size * k;
    X.add(bone, 'metal', GE.torus(0.28, 4), col, pos, [s, s * 1.2, s], composeEuler(rot || [0, 0, 0], [0, 0, PI / 4]), NO);
    X.add(bone, 'metal', GE.box(), col, [pos[0], pos[1], pos[2]], [s * 0.1, s * 0.75, s * 0.12], rot, NO);
  };

  // ---------------------------------------------------------------- torse
  /** sous-couche : chemise/gambison ajusté (toujours présent : évite la peau sous l'armure) */
  P.undershirt = function (X, col, layer, opt) {
    const m = X.m, o = opt || {};
    const pad = o.pad || 1.04;
    // poitrine (chest) : du bas (0) au cou
    X.add('chest', layer, GE.shell({ rt: m.chW > 0 ? 0.8 : 0.8, rm: 1.1, th: 0.25, pl: o.quilt ? 10 : 0, pa: o.quilt ? 0.03 : 0, n: 16 }), col,
      [0, m.neckY * 0.48, 0.0], [m.chW * 2 * pad, m.neckY * 1.0, m.chD * 2 * pad]);
    // ventre (spine)
    X.add('spine', layer, GE.shell({ rt: 1.08, th: 0.25, n: 14, pl: o.quilt ? 8 : 0, pa: o.quilt ? 0.035 : 0 }), col,
      [0, m.spineLen * 0.5, 0], [m.waW * 2 * pad, m.spineLen * 1.15, m.waD * 2 * pad]);
    // bassin
    X.add('hips', layer, GE.shell({ rt: 0.95, th: 0.25, n: 14 }), shade(col, -0.08), [0, 0.0, 0], [m.hiW * 2 * pad, 0.2 * X.k, m.hiD * 2 * pad]);
  };

  /** manches (tissu) sur bras/avant-bras ; style 'tight' | 'puff' | 'robe' (évasée) | 'rolled' */
  P.sleeves = function (X, col, layer, style, len) {
    const m = X.m;
    for (const [s] of SIDES) {
      const r0 = m.armR0 * 1.18, r1 = m.armR1 * 1.15;
      onSeg(X, 'arm' + s, 'arm', s, -0.05, 1.0, GE.fr(r1 / r0, 10), layer, col, r0, r0 * 0.98);
      // coiffe d'épaule (recouvre le deltoïde)
      X.add('arm' + s, layer, GE.sph(), col, [(s === 'L' ? 1 : -1) * 0.012 * X.k, -0.045 * X.k, 0], [m.armR0 * 1.42, m.armR0 * 1.62, m.armR0 * 1.42]);
      if (style === 'puff') onSeg(X, 'arm' + s, 'arm', s, 0.0, 0.45, GE.sph(), layer, shade(col, 0.06), r0 * 1.35, r0 * 1.25);
      if (len === 'short') continue;
      if (style === 'robe') {
        // manche évasée à plis, ourlet
        onSeg(X, 'forearm' + s, 'fore', s, -0.04, 0.82, GE.shell({ rt: 0.55, th: 0.14, pl: 7, pa: 0.12, n: 14 }), layer, col, m.foreR0 * 2.3, m.foreR0 * 2.2, null, [PI, 0, 0]);
        onSeg(X, 'forearm' + s, 'fore', s, 0.78, 0.86, GE.torus(0.25, 14), 'cloth2', X.c.trim, m.foreR0 * 2.25, m.foreR0 * 2.15, NO, [HP, 0, 0]);
      } else {
        const f0 = m.foreR0 * 1.1, f1 = m.foreR1 * 1.12;
        onSeg(X, 'forearm' + s, 'fore', s, -0.04, style === 'rolled' ? 0.45 : 0.92, GE.fr(f1 / f0, 10), layer, col, f0, f0 * 0.95);
        if (style === 'rolled') onSeg(X, 'forearm' + s, 'fore', s, 0.4, 0.52, GE.torus(0.5, 12), layer, shade(col, 0.1), f0 * 1.05, f0, NO, [HP, 0, 0]);
      }
    }
  };

  /** pantalon / chausses (cuisses + tibias), avec genouillère optionnelle (renfort) */
  P.trousers = function (X, col, layer, opt) {
    const m = X.m, o = opt || {};
    for (const [s, sg] of SIDES) {
      const wd = o.wide ? 1.3 : 1;
      onSeg(X, 'leg' + s, 'thigh', s, -0.06, 1.02, GE.fr(m.thR1 / m.thR0 * (o.wide ? 1.15 : 1), 10), layer, col, m.thR0 * 1.08 * (o.wide ? 1.12 : 1), m.thR0 * 1.05 * (o.wide ? 1.12 : 1));
      onSeg(X, 'shin' + s, 'shin', s, -0.02, 0.75, o.wide ? GE.shell({ rt: 1.0, rm: 1.25, th: 0.12, pl: 5, pa: 0.06, n: 12 }) : GE.fr(m.shR1 / m.shR0, 10), layer, col, m.shR0 * 1.1 * wd, m.shR0 * 1.08 * wd, null, o.wide ? [PI, 0, 0] : null);
      // couture latérale
      const a0 = segPt(X, 'thigh', s, 0.05, sg * m.thR0 * 1.1, 0), a1 = segPt(X, 'thigh', s, 0.9, sg * m.thR1 * 1.12, 0);
      P.stitches(X, 'leg' + s, shade(col, 0.35), a0, a1, 4, layer);
      if (o.knee) onSeg(X, 'shin' + s, 'shin', s, -0.08, 0.14, GE.sph(), 'leather', o.knee, m.shR0 * 1.18, m.shR0 * 1.2, null, null, [0, 0, m.shR0 * 0.25]);
      if (o.wrap) for (let i = 0; i < 4; i++) onSeg(X, 'shin' + s, 'shin', s, 0.3 + i * 0.1, 0.36 + i * 0.1, GE.torus(0.4, 10), 'cloth2', o.wrap, m.shR0 * 1.12, m.shR0 * 1.1, NO, [HP, 0, 0.25 * (i % 2 ? 1 : -1)]);
    }
  };

  /** jambières de cuir / protège-tibias (intermédiaire / léger) + genouillères */
  P.shinGuards = function (X, col, layer, knees) {
    const m = X.m, k = X.k, c = X.c;
    for (const [s, sg] of SIDES) {
      onSeg(X, 'shin' + s, 'shin', s, 0.12, 0.72, GE.shell({ span: 3.0, rt: 1.2, th: 0.16, n: 8 }), layer, col, m.shR1 * 1.5, m.shR1 * 1.55, null, [PI, PI, 0]);
      for (const t of [0.3, 0.6]) onSeg(X, 'shin' + s, 'shin', s, t - 0.03, t + 0.03, GE.fr(1, 10), 'leather', c.leatherD, (m.shR0 + (m.shR1 - m.shR0) * t) * 1.3, (m.shR0 + (m.shR1 - m.shR0) * t) * 1.25);
      if (knees) onSeg(X, 'shin' + s, 'shin', s, -0.08, 0.1, GE.sph(), layer, shade(col, 0.08), m.shR0 * 1.15, m.shR0 * 0.95, null, null, [0, 0, m.shR0 * 0.5]);
    }
  };

  /** cuirasse de plaques : plastron bombé + dossière + lames d'abdomen + gorgerin + rivets */
  P.cuirass = function (X, col, opt) {
    const m = X.m, k = X.k, o = opt || {}, c = X.c;
    const W = m.chW * 2.32, D = m.chD * 2.5;
    const trim = o.trim != null ? o.trim : c.trim;
    // plastron (avant) + dossière (arrière)
    X.add('chest', 'metal', GE.shell({ span: 3.3, rt: 0.86, rm: 1.08, th: 0.16, n: 16 }), col, [0, m.neckY * 0.5, 0.005 * k], [W, m.neckY * 1.02, D]);
    X.add('chest', 'metal', GE.shell({ span: 3.3, back: true, rt: 0.9, rm: 1.04, th: 0.16, n: 14 }), shade(col, -0.08), [0, m.neckY * 0.5, -0.005 * k], [W * 0.98, m.neckY * 1.02, D * 0.96]);
    // arête centrale + liseré du col
    X.add('chest', 'metal', GE.box(), shade(col, 0.15), [0, m.neckY * 0.55, m.chD * 1.2], [0.022 * k, m.neckY * 0.75, 0.03 * k], [-0.12, 0, 0]);
    X.add('chest', o.goldTrim ? 'gold' : 'metal', GE.shell({ span: 3.3, rt: 0.92, th: 0.3, n: 16 }), trim, [0, m.neckY * 0.985, 0], [W * 0.9, 0.035 * k, D * 0.92], null, NO);
    X.add('chest', o.goldTrim ? 'gold' : 'metal', GE.shell({ span: 3.3, rt: 1, th: 0.3, n: 16 }), trim, [0, 0.012 * k, 0.0], [W * 1.02, 0.03 * k, D * 1.0], null, NO);
    // gorgerin
    X.add('chest', 'metal', GE.shell({ rt: 0.82, th: 0.2, n: 14 }), shade(col, -0.05), [0, m.neckY * 1.02, m.neckZ * 0.5], [m.neckR * 3.6, 0.1 * k, m.neckR * 3.3]);
    X.add('chest', 'metal', GE.torus(0.18, 14), shade(col, 0.12), [0, m.neckY * 1.06, m.neckZ * 0.5], [m.neckR * 3.1, m.neckR * 2.8, 0.02 * k], [HP, 0, 0], NO);
    // lames d'abdomen superposées (spine), chacune plus étroite, chevauchement
    const nl = o.lames || 2;
    for (let i = 0; i < nl; i++) {
      const t = i / nl;
      const yy = m.spineLen * (1.0 - (t + 0.5 / nl) * 1.05);
      const ww = (m.chW + (m.waW - m.chW) * (t + 0.3)) * 2.32, dd = (m.chD + (m.waD - m.chD) * (t + 0.3)) * 2.5;
      X.add('spine', 'metal', GE.shell({ span: 3.0, rt: 1.04, rm: 1.04, th: 0.14, n: 14 }), shade(col, -0.04 * i), [0, yy, 0.004 * k * (nl - i)], [ww, m.spineLen / nl * 1.35, dd], null, NO);
      // rivets aux extrémités de chaque lame
      const ang = 1.3;
      P.rivets(X, 'spine', 'metal', c.metalL, [
        [Math.sin(ang) * ww * 0.5, yy, Math.cos(ang) * dd * 0.5, [HP, 0, ang]], [-Math.sin(ang) * ww * 0.5, yy, Math.cos(ang) * dd * 0.5, [HP, 0, -ang]],
      ], 0.012 * k);
    }
    // rivets du plastron (le long du bord supérieur)
    const pts = [];
    for (let i = -2; i <= 2; i++) { const a = i * 0.38; pts.push([Math.sin(a) * W * 0.47, m.neckY * 0.9, Math.cos(a) * D * 0.43, [HP - 0.2, a, 0]]); }
    P.rivets(X, 'chest', 'metal', c.metalL, pts, 0.013 * k);
    // sangles latérales (cuir) reliant plastron et dossière
    for (const [, sg] of SIDES) {
      X.add('chest', 'leather', GE.box(), c.leatherD, [sg * m.chW * 1.1, m.neckY * 0.42, 0], [0.02 * k, 0.05 * k, m.chD * 1.2]);
      P.buckle(X, 'chest', [sg * m.chW * 1.17, m.neckY * 0.42, 0.02 * k], 0.035, c.metalL, [0, sg * HP, 0]);
    }
  };

  /** brigandine (intermédiaire) : gilet de cuir rembourré + plaquettes rivetées + plaque pectorale */
  P.brigandine = function (X, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const W = m.chW * 2.22, D = m.chD * 2.36;
    X.add('chest', 'leather', GE.shell({ rt: 0.84, rm: 1.07, th: 0.18, n: 16, pl: 12, pa: 0.015 }), col, [0, m.neckY * 0.48, 0], [W, m.neckY * 1.0, D]);
    X.add('spine', 'leather', GE.shell({ rt: 1.08, th: 0.18, n: 14 }), shade(col, -0.05), [0, m.spineLen * 0.5, 0], [m.waW * 2.24, m.spineLen * 1.1, m.waD * 2.34]);
    // rangées de rivets (plaquettes cousues dessous)
    const pts = [];
    for (let r = 0; r < 3; r++) for (let i = -3; i <= 3; i++) {
      if (r === 0 && Math.abs(i) < 1) continue;
      const a = i * 0.3, y = m.neckY * (0.25 + r * 0.22);
      pts.push([Math.sin(a) * W * 0.5, y, Math.cos(a) * D * 0.5 + 0.002 * k, [HP, a, 0]]);
    }
    P.rivets(X, 'chest', 'metal', o.rivet || c.metalL, pts, 0.011 * k);
    // plaque pectorale (petite)
    if (o.plate !== false) X.add('chest', 'metal', GE.shell({ span: 1.6, rt: 0.9, rm: 1.1, th: 0.2, n: 10 }), o.plateCol || c.metal, [0, m.neckY * 0.62, 0.01 * k], [W * 1.04, m.neckY * 0.48, D * 1.06]);
    // laçage central
    for (let i = 0; i < 4; i++) X.add('chest', 'leather', GE.box(), c.cord, [0, m.neckY * (0.12 + i * 0.1), D * 0.5 + 0.004 * k], [0.05 * k, 0.008 * k, 0.008 * k], [0, 0, (i % 2 ? 0.5 : -0.5)], NO);
    // col montant matelassé
    X.add('chest', 'leather', GE.shell({ rt: 0.86, th: 0.25, n: 14 }), shade(col, -0.1), [0, m.neckY * 1.0, m.neckZ * 0.5], [m.neckR * 3.5, 0.075 * k, m.neckR * 3.2]);
    P.stitches(X, 'chest', c.stitch, [-W * 0.35, m.neckY * 0.08, D * 0.47], [W * 0.35, m.neckY * 0.08, D * 0.47], 7);
  };

  /** pourpoint / gilet de cuir léger (voleur, archer, assassin) */
  P.jerkin = function (X, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const W = m.chW * 2.16, D = m.chD * 2.28;
    X.add('chest', 'leather', GE.shell({ rt: 0.82, rm: 1.06, th: 0.16, n: 16 }), col, [0, m.neckY * 0.46, 0], [W, m.neckY * 0.98, D]);
    X.add('spine', 'leather', GE.shell({ rt: 1.08, th: 0.16, n: 14 }), shade(col, -0.06), [0, m.spineLen * 0.5, 0], [m.waW * 2.18, m.spineLen * 1.08, m.waD * 2.28]);
    // revers croisé (fermeture en biais) + boutons
    X.add('chest', 'leather', GE.box(), shade(col, -0.18), [m.chW * 0.12, m.neckY * 0.5, D * 0.5], [0.05 * k, m.neckY * 0.95, 0.014 * k], [0.12, 0, 0.32]);
    for (let i = 0; i < 3; i++) X.add('chest', 'metal', GE.sphLo(), o.button || c.trim, [m.chW * (0.02 + i * 0.12), m.neckY * (0.28 + i * 0.2), D * 0.52], 0.018 * k, null, NO);
    P.stitches(X, 'chest', c.stitch, [-W * 0.08, m.neckY * 0.05, D * 0.49], [W * 0.3, m.neckY * 0.9, D * 0.46], 8);
    if (o.collar !== false) X.add('chest', 'leather', GE.shell({ span: 4.2, back: true, rt: 1.2, th: 0.2, n: 12 }), shade(col, -0.12), [0, m.neckY * 1.03, m.neckZ * 0.4], [m.neckR * 3.8, 0.1 * k, m.neckR * 3.6]);
  };

  /** robe (mage, élémentaliste, nécromancien) : buste + jupe longue à plis, fente avant, ourlet brodé */
  P.robe = function (X, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const len = o.len || 1; // 1 = chevilles, 0.6 = genoux
    const legTot = m.thighL + m.shinL;
    const skirtH = (0.12 * k + legTot * 0.98) * len;
    X.add('chest', 'cloth', GE.shell({ rt: 0.82, rm: 1.07, th: 0.18, n: 16, pl: 6, pa: 0.02 }), col, [0, m.neckY * 0.48, 0], [m.chW * 2.18, m.neckY * 1.0, m.chD * 2.3]);
    X.add('spine', 'cloth', GE.shell({ rt: 1.08, th: 0.18, n: 14 }), col, [0, m.spineLen * 0.5, 0], [m.waW * 2.2, m.spineLen * 1.12, m.waD * 2.3]);
    // jupe haute (hanches) : légère, plis qui s'ouvrent vers le bas, fente avant
    const gap = o.gap == null ? 0.7 : o.gap;
    const BL = legFollow(X, 0.08 * k, 0.08 * k - skirtH);
    X.add('hips', 'cloth', GE.shell({ span: TAU - gap, back: true, rt: 0.62, rm: 0.82, th: 0.08, pl: 9, pa: 0.09, n: 20, jag: o.jag || 0 }), col,
      [0, 0.08 * k - skirtH * 0.5, -0.01 * k], [m.hiW * 2 * (1.25 + 0.55 * len), skirtH, m.hiD * 2 * (1.35 + 0.5 * len)], null, { blend: BL });
    // sous-robe visible par la fente
    X.add('hips', 'cloth2', GE.shell({ span: 1.5, rt: 0.64, rm: 0.84, th: 0.08, pl: 3, pa: 0.05, n: 8 }), o.under || c.second,
      [0, 0.06 * k - skirtH * 0.5, 0.0], [m.hiW * 2 * (1.17 + 0.5 * len), skirtH * 0.97, m.hiD * 2 * (1.25 + 0.45 * len)], null, { blend: BL });
    // ourlet brodé
    if (o.hem !== false) X.add('hips', o.hemLayer || 'cloth2', GE.shell({ span: TAU - gap, back: true, rt: 1, th: 0.12, pl: 9, pa: 0.09, n: 20 }), o.hem || c.trim,
      [0, 0.08 * k - skirtH + 0.025 * k, -0.01 * k], [m.hiW * 2 * (1.25 + 0.55 * len) * 1.02, 0.045 * k, m.hiD * 2 * (1.35 + 0.5 * len) * 1.02], null, { blend: BL });
    // bandes verticales de bordure le long de la fente
    for (const [, sg] of SIDES) X.add('hips', 'cloth2', GE.box(), o.hem || c.trim, [sg * Math.sin(gap / 2) * m.hiW * (1.2 + 0.5 * len), 0.06 * k - skirtH * 0.5, Math.cos(gap / 2) * m.hiD * (1.3 + 0.48 * len)], [0.03 * k, skirtH * 0.96, 0.012 * k], [0.05 * len, sg * gap / 2, 0], withB(NO, BL));
    // col en V / encolure brodée
    X.add('chest', 'cloth2', GE.box(), o.hem || c.trim, [m.chW * 0.18, m.neckY * 0.72, m.chD * 1.12], [0.03 * k, m.neckY * 0.6, 0.012 * k], [-0.15, 0, 0.35], NO);
    X.add('chest', 'cloth2', GE.box(), o.hem || c.trim, [-m.chW * 0.18, m.neckY * 0.72, m.chD * 1.12], [0.03 * k, m.neckY * 0.6, 0.012 * k], [-0.15, 0, -0.35], NO);
  };

  /** jambes de robe : panneaux de tissu attachés aux cuisses/tibias (suivent la marche) */
  P.robeLegs = function (X, col, len) {
    const m = X.m;
    for (const [s] of SIDES) {
      onSeg(X, 'leg' + s, 'thigh', s, 0.2, 1.0, GE.shell({ rt: 0.86, th: 0.12, pl: 5, pa: 0.08, n: 12 }), 'cloth', col, m.thR0 * 1.42, m.thR0 * 1.4, null, [PI, 0, 0]);
      if (len >= 0.9) onSeg(X, 'shin' + s, 'shin', s, 0.0, 0.86, GE.shell({ rt: 0.82, th: 0.12, pl: 5, pa: 0.1, n: 12 }), 'cloth', col, m.shR0 * 1.75, m.shR0 * 1.7, null, [PI, 0, 0]);
    }
  };

  /** tabard / tassettes / pans : panneaux sur les hanches */
  P.tabard = function (X, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const len = (o.len || 0.55) * (m.thighL + 0.1 * k);
    const W = o.w || m.hiW * 1.3;
    // pan avant + arrière (sur les hanches, au-dessus de la ceinture)
    const TB = legFollow(X, 0.07 * k, -len, 0.85);
    X.add('hips', 'cloth', GE.panel({ cv: 0.1, fl: 1.05, th: 0.03, n: 6, jag: o.jag || 0, tip: o.tip || 0 }), col, [0, 0.07 * k, m.hiD * 1.14], [W, len + 0.07 * k, W], null, { blend: TB });
    X.add('hips', 'cloth', GE.panel({ cv: 0.1, fl: 1.05, th: 0.03, n: 6, jag: o.jag || 0, tip: o.tip || 0 }), shade(col, -0.08), [0, 0.07 * k, -m.hiD * 1.14], [W, len + 0.07 * k, W], [0, PI, 0], { blend: TB });
    // galon
    if (o.trim !== false) {
      X.add('hips', 'cloth2', GE.box(), o.trim || c.trim, [0, 0.07 * k - len - 0.05 * k, m.hiD * 1.14 + 0.022 * k], [W * 1.02, 0.03 * k, 0.012 * k], [0.08, 0, 0], withB(NO, TB));
      for (const [, sg] of SIDES) X.add('hips', 'cloth2', GE.box(), o.trim || c.trim, [sg * W * 0.48, 0.07 * k - len * 0.5, m.hiD * 1.14 + 0.02 * k], [0.022 * k, len, 0.012 * k], [0.06, 0, 0], withB(NO, TB));
    }
    if (o.emblem) P.emblem(X, 'hips', o.emblem, [0, 0.07 * k - len * 0.42, m.hiD * 1.14 + 0.03 * k], 0.11 * k, o.emblemCol || c.trim);
  };

  /** tassettes de plaques (lourd) : 2 à 3 lames par côté sur les hanches */
  P.tassets = function (X, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    for (const [, sg] of SIDES) for (let i = 0; i < (o.n || 2); i++) {
      X.add('hips', 'metal', GE.shell({ span: 1.25, rt: 0.94, th: 0.14, n: 8 }), shade(col, -0.05 * i),
        [sg * m.hipX * 0.25, -0.02 * k - i * 0.075 * k, 0.005 * k * i], [m.hiW * 2.55 + i * 0.02 * k, 0.1 * k, m.hiD * 2.7 + i * 0.02 * k], [0, sg * 0.75, 0]);
      P.rivets(X, 'hips', 'metal', c.metalL, [[sg * (m.hiW * 0.9 + 0.012 * k * i), -0.0 * k - i * 0.075 * k, m.hiD * 0.95, [HP, sg * 0.75, 0]]], 0.011 * k);
    }
    // pan de maille sous les tassettes (cotte)
    if (o.mail !== false) X.add('hips', 'metal', GE.shell({ rt: 0.95, th: 0.08, pl: 14, pa: 0.03, n: 18 }), c.metalD, [0, -0.12 * k, 0], [m.hiW * 2.28, 0.2 * k, m.hiD * 2.4]);
  };

  /** ceinture : bande + boucle + accessoires (sacoches, fioles, parchemins, couteau, crâne, livre) */
  P.belt = function (X, style, items, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const col = o.col || (style === 'sash' ? c.second : style === 'rope' ? c.cord : c.leatherD);
    const layer = style === 'sash' || style === 'rope' ? 'cloth2' : style === 'plate' || style === 'chain' ? 'metal' : 'leather';
    const y = 0.075 * k, W = m.hiW * 2.32, D = m.hiD * 2.4;
    X.add('hips', layer, GE.shell({ rt: 1.02, th: 0.12, n: 18, pl: style === 'sash' ? 10 : 0, pa: style === 'sash' ? 0.02 : 0 }), col, [0, y, 0], [W, (style === 'sash' ? 0.085 : o.wide ? 0.08 : 0.05) * k, D]);
    if (o.double) X.add('hips', 'leather', GE.shell({ rt: 1.0, th: 0.12, n: 18 }), shade(col, 0.1), [0, y - 0.06 * k, 0.01 * k], [W * 1.04, 0.03 * k, D * 1.06], [0.12, 0, 0.08]);
    if (style === 'sash') {
      // nœud + pans qui pendent
      X.add('hips', 'cloth2', GE.sph(), shade(col, 0.08), [m.hiW * 0.55, y, D * 0.48], [0.07 * k, 0.06 * k, 0.04 * k]);
      X.add('hips', 'cloth2', GE.panel({ cv: 0.1, fl: 1.3, th: 0.1, n: 3, jag: 0.06 }), col, [m.hiW * 0.6, y - 0.02 * k, D * 0.5], [0.07 * k, 0.26 * k, 0.07 * k], [0, 0.3, -0.12]);
      X.add('hips', 'cloth2', GE.panel({ cv: 0.1, fl: 1.2, th: 0.1, n: 3, jag: 0.06 }), shade(col, -0.1), [m.hiW * 0.45, y - 0.02 * k, D * 0.5], [0.06 * k, 0.2 * k, 0.06 * k], [0, 0.25, 0.1]);
    } else if (style === 'rope') {
      X.add('hips', 'cloth2', GE.torus(0.5, 10), col, [0, y - 0.02 * k, D * 0.5], [0.06 * k, 0.06 * k, 0.04 * k], null, NO);
      for (const dx of [-0.02, 0.025]) X.add('hips', 'cloth2', GE.cyl(6), col, [dx * k, y - 0.13 * k, D * 0.5], [0.018 * k, 0.2 * k, 0.018 * k], [0, 0, dx * 3]);
      for (const dx of [-0.02, 0.025]) X.add('hips', 'cloth2', GE.sphLo(), shade(col, -0.2), [dx * k * 1.6, y - 0.24 * k, D * 0.5], 0.03 * k, null, NO);
    } else {
      // boucle principale (grande, plaque ornée selon style)
      if (style === 'plate' || o.bigBuckle) {
        X.add('hips', 'gold', GE.box(), c.trim, [0, y, D * 0.5 + 0.006 * k], [0.1 * k, 0.075 * k, 0.018 * k]);
        X.add('hips', 'gem', GE.gemCut(), c.gem, [0, y, D * 0.5 + 0.018 * k], [0.032 * k, 0.03 * k, 0.032 * k], [HP, 0, 0], NO);
      } else {
        P.buckle(X, 'hips', [0, y, D * 0.5 + 0.005 * k], 0.06, c.metalL);
        X.add('hips', 'leather', GE.box(), col, [0.05 * k, y - 0.04 * k, D * 0.5 + 0.004 * k], [0.03 * k, 0.07 * k, 0.008 * k], [0, 0, 0.1]);
      }
      P.stitches(X, 'hips', c.stitch, [-W * 0.42, y + 0.016 * k, D * 0.44], [-W * 0.12, y + 0.016 * k, D * 0.5], 4);
      P.stitches(X, 'hips', c.stitch, [W * 0.12, y + 0.016 * k, D * 0.5], [W * 0.42, y + 0.016 * k, D * 0.44], 4);
    }
    P.beltItems(X, items || [], y, W, D);
  };

  /** accessoires de ceinture répartis sur beltL / beltR (os de hanche animés) puis hips */
  P.beltItems = function (X, items, y, W, D) {
    const k = X.k, c = X.c, m = X.m;
    const slots = [['beltL', 1, 0.0], ['beltR', -1, 0.0], ['beltL', 1, -0.75], ['beltR', -1, -0.75], ['hips', 1, -2.3], ['hips', -1, -2.3]];
    items.forEach((it, i) => {
      const sl = slots[i % slots.length];
      const bone = X.R.bones[sl[0]] ? sl[0] : 'hips';
      const sg = sl[1];
      const ang = sg * (1.05 + sl[2] * 0.5) + (sl[2] < -1 ? 0 : 0);
      // position : sur la hanche ; si os beltL/R, on reste relatif à l'origine de l'os
      let px = Math.sin(ang) * W * 0.52, pz = Math.cos(ang) * D * 0.52, py = y - 0.07 * k;
      if (bone !== 'hips') { const bp = X.R.bones[bone].position; px -= bp.x; py -= bp.y; pz -= bp.z; }
      const ry = ang;
      if (it === 'pouch') {
        X.add(bone, 'leather', GE.box(), c.leather, [px, py, pz], [0.1 * k, 0.11 * k, 0.06 * k], [0, ry, 0]);
        X.add(bone, 'leather', GE.box(), c.leatherD, [px + Math.sin(ry) * 0.018 * k, py + 0.04 * k, pz + Math.cos(ry) * 0.018 * k], [0.104 * k, 0.045 * k, 0.03 * k], [0.25, ry, 0]);
        X.add(bone, 'metal', GE.sphLo(), c.metalL, [px + Math.sin(ry) * 0.034 * k, py + 0.02 * k, pz + Math.cos(ry) * 0.034 * k], 0.016 * k, null, NO);
      } else if (it === 'vial' || it === 'vialG' || it === 'vialR') {
        const vc = it === 'vialR' ? 0xff3d4e : it === 'vialG' ? 0x39e08c : c.gem;
        X.add(bone, 'leather', GE.box(), c.leatherD, [px, py + 0.02 * k, pz], [0.05 * k, 0.03 * k, 0.05 * k], [0, ry, 0]);
        X.add(bone, 'trans', GE.vial(), vc, [px, py - 0.03 * k, pz], [0.05 * k, 0.11 * k, 0.05 * k]);
        X.add(bone, 'leather', GE.cyl(6), 0x8a6a4a, [px, py + 0.035 * k, pz], [0.018 * k, 0.03 * k, 0.018 * k], null, NO);
      } else if (it === 'scroll') {
        X.add(bone, 'cloth2', GE.cyl(8), 0xe8dcc0, [px, py, pz], [0.04 * k, 0.15 * k, 0.04 * k], [0, ry, 0.35 * sg]);
        X.add(bone, 'cloth2', GE.torus(0.4, 8), 0xa83a2a, [px, py, pz], [0.045 * k, 0.045 * k, 0.04 * k], [HP, 0, 0.35 * sg], NO);
      } else if (it === 'book') {
        X.add(bone, 'leather', GE.box(), c.mainD, [px, py, pz], [0.13 * k, 0.16 * k, 0.05 * k], [0, ry, 0.1 * sg]);
        X.add(bone, 'cloth2', GE.box(), 0xe8dcc0, [px - Math.sin(ry) * 0.002 * k, py, pz - Math.cos(ry) * 0.002 * k], [0.12 * k, 0.15 * k, 0.04 * k], [0, ry, 0.1 * sg], NO);
        X.add(bone, 'gold', GE.box(), c.trim, [px + Math.sin(ry) * 0.027 * k, py, pz + Math.cos(ry) * 0.027 * k], [0.05 * k, 0.05 * k, 0.008 * k], [0, ry, 0.1 * sg + PI / 4], NO);
      } else if (it === 'skull') {
        X.add(bone, 'bone', GE.sph(), c.bone, [px, py, pz], [0.075 * k, 0.07 * k, 0.08 * k], [0, ry, 0]);
        X.add(bone, 'bone', GE.box(), shade(c.bone, -0.1), [px + Math.sin(ry) * 0.02 * k, py - 0.04 * k, pz + Math.cos(ry) * 0.02 * k], [0.05 * k, 0.03 * k, 0.05 * k], [0, ry, 0]);
        X.add(bone, 'eye', GE.sphLo(), 0x111111, [px + Math.sin(ry + 0.35) * 0.04 * k, py + 0.005 * k, pz + Math.cos(ry + 0.35) * 0.04 * k], 0.018 * k, null, NO);
        X.add(bone, 'eye', GE.sphLo(), 0x111111, [px + Math.sin(ry - 0.35) * 0.04 * k, py + 0.005 * k, pz + Math.cos(ry - 0.35) * 0.04 * k], 0.018 * k, null, NO);
      } else if (it === 'knife') {
        X.add(bone, 'leather', GE.box(), c.leatherD, [px, py - 0.03 * k, pz], [0.035 * k, 0.15 * k, 0.025 * k], [0, ry, 0.2 * sg]);
        X.add(bone, 'leather', GE.cyl(6), 0x2a1a12, [px - sg * 0.016 * k, py + 0.08 * k, pz], [0.018 * k, 0.07 * k, 0.018 * k], [0, ry, 0.2 * sg]);
        X.add(bone, 'metal', GE.box(), c.metal, [px - sg * 0.009 * k, py + 0.045 * k, pz], [0.05 * k, 0.01 * k, 0.02 * k], [0, ry, 0.2 * sg], NO);
      } else if (it === 'gem' || it === 'crystal') {
        X.add(bone, 'leather', GE.torus(0.3, 8), c.leatherD, [px, py + 0.04 * k, pz], [0.04 * k, 0.04 * k, 0.03 * k], [0, ry, 0], NO);
        X.add(bone, 'gem', GE.octa(), c.gem, [px, py - 0.02 * k, pz], [0.05 * k, 0.1 * k, 0.05 * k], [0, ry, 0]);
      } else if (it === 'horn') {
        X.add(bone, 'bone', GE.fr(0.35, 8), 0xe8dcc0, [px, py, pz], [0.07 * k, 0.2 * k, 0.07 * k], [0.3, ry, sg * 1.3]);
        X.add(bone, 'gold', GE.torus(0.25, 10), c.trim, [px - sg * 0.07 * k, py - 0.01 * k, pz], [0.075 * k, 0.075 * k, 0.05 * k], [0, ry, sg * 1.3 + HP], NO);
      } else if (it === 'censer') {
        X.add(bone, 'metal', GE.cyl(4), c.metalD, [px, py + 0.04 * k, pz], [0.008 * k, 0.12 * k, 0.008 * k], null, NO);
        X.add(bone, 'metal', GE.sph(), c.metal, [px, py - 0.06 * k, pz], [0.08 * k, 0.07 * k, 0.08 * k]);
        X.add(bone, 'glow', GE.sphLo(), c.glow, [px, py - 0.06 * k, pz + 0.035 * k], 0.03 * k, null, NO);
      } else if (it === 'hook') {
        X.add(bone, 'cloth2', GE.torus(0.25, 12), c.cord, [px, py, pz], [0.1 * k, 0.1 * k, 0.05 * k], [0, ry, 0]);
        X.add(bone, 'metal', GE.spike(), c.metal, [px, py - 0.08 * k, pz], [0.03 * k, 0.09 * k, 0.03 * k], [PI, 0, 0]);
      } else if (it === 'cutlass') {
        X.add(bone, 'leather', GE.box(), c.leatherD, [px, py - 0.18 * k, pz - 0.02 * k], [0.05 * k, 0.5 * k, 0.025 * k], [0.25, ry, 0.15 * sg]);
        X.add(bone, 'gold', GE.torus(0.25, 10), c.trim, [px, py + 0.1 * k, pz + 0.02 * k], [0.08 * k, 0.08 * k, 0.04 * k], [0, ry + HP, 0], NO);
      } else if (it === 'chain') {
        for (let j = 0; j < 4; j++) X.add(bone, 'metal', GE.torus(0.3, 8), c.metalD, [px, py - j * 0.035 * k, pz], [0.035 * k, 0.035 * k, 0.03 * k], [j % 2 ? HP : 0, ry, 0], NO);
      } else if (it === 'coin') {
        X.add(bone, 'leather', GE.sph(), c.leather, [px, py - 0.01 * k, pz], [0.09 * k, 0.1 * k, 0.08 * k], [0, ry, 0]);
        X.add(bone, 'cloth2', GE.torus(0.4, 8), c.cord, [px, py + 0.035 * k, pz], [0.05 * k, 0.05 * k, 0.04 * k], [HP, 0, 0], NO);
        X.add(bone, 'gold', GE.cyl(8), 0xffd24a, [px + Math.sin(ry) * 0.04 * k, py + 0.05 * k, pz + Math.cos(ry) * 0.04 * k], [0.03 * k, 0.006 * k, 0.03 * k], [0.6, ry, 0], NO);
      }
    });
  };

  // ---------------------------------------------------------------- épaules
  /** épaulière sur armL/armR. style : round, tiered, spiked, lion, winged, leather, fur, bone, crystal, leaf, cloth, plateSmall */
  P.pauldron = function (X, s, sg, style, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const bone = 'arm' + s;
    const r = m.armR0 * (o.size || 1);
    const up = [0, r * 0.55, 0];
    const trim = o.trim != null ? o.trim : c.trim;
    const tl = o.goldTrim ? 'gold' : 'metal';
    if (style === 'leather' || style === 'fur' || style === 'cloth') {
      const layer = style === 'fur' ? 'fur' : style === 'cloth' ? 'cloth' : 'leather';
      X.add(bone, layer, GE.dome(1.15), col, [sg * r * 0.15, up[1] * 0.8, 0], [r * 3.1, r * 2.4, r * 2.9], [0, 0, -sg * 0.35]);
      if (style === 'leather') {
        X.add(bone, 'leather', GE.shell({ span: 3.6, rt: 0.9, th: 0.18, n: 10 }), shade(col, -0.12), [sg * r * 0.45, -r * 0.35, 0], [r * 2.6, r * 0.9, r * 2.5], [0, sg * HP, -sg * 0.2]);
        P.rivets(X, bone, 'metal', c.metalL, [[sg * r * 1.25, up[1] * 0.4, r * 0.4, [0, 0, -sg * 1.2]], [sg * r * 1.25, up[1] * 0.4, -r * 0.4, [0, 0, -sg * 1.2]]], 0.012 * k);
        // sangle sous le bras
        onSeg(X, bone, 'arm', s, 0.2, 0.3, GE.torus(0.22, 10), c.leatherD, m.armR0 * 1.18, m.armR0 * 1.12, NO, [HP, 0, 0]);
        // NB : couche fournie par position (onSeg -> 'metal' inexact) : corrigé ci-dessous
      }
      if (style === 'fur') for (let i = 0; i < 4; i++) X.add(bone, 'fur', GE.cone(5), shade(col, -0.1 + 0.05 * i), [sg * r * (0.8 + 0.12 * i), up[1] * 0.2 - r * 0.25 * i, (i - 1.5) * r * 0.5], [r * 0.6, r * 1.1, r * 0.5], [0, 0, sg * (2.2 + 0.1 * i)], NO);
      return;
    }
    if (style === 'bone') {
      X.add(bone, 'bone', GE.dome(1.2), c.bone, [sg * r * 0.2, up[1], 0], [r * 3.0, r * 2.2, r * 2.7], [0, 0, -sg * 0.35]);
      for (let i = 0; i < 3; i++) X.add(bone, 'bone', GE.spike(), shade(c.bone, -0.05 * i), [sg * r * (0.7 + 0.25 * i), up[1] + r * (1.0 - 0.2 * i), (i - 1) * r * 0.65], [r * 0.5, r * (1.5 - 0.25 * Math.abs(i - 1)), r * 0.5], [0, 0, -sg * (0.5 + 0.25 * i)]);
      // crâne sur l'épaule
      if (o.skull !== false) {
        X.add(bone, 'bone', GE.sph(), c.bone, [sg * r * 1.25, up[1] * 0.1, r * 0.55], [r * 1.25, r * 1.15, r * 1.25]);
        X.add(bone, 'eye', GE.sphLo(), 0x15101a, [sg * r * 1.0, up[1] * 0.25, r * 1.1], r * 0.35, null, NO);
        X.add(bone, 'eye', GE.sphLo(), 0x15101a, [sg * r * 1.55, up[1] * 0.25, r * 1.0], r * 0.35, null, NO);
      }
      return;
    }
    if (style === 'coil') {
      X.add(bone, 'gold', GE.dome(1.1), col === X.c.metal ? X.c.trim : col, [sg * r * 0.15, up[1], 0], [r * 2.7, r * 1.9, r * 2.5], [0, 0, -sg * 0.35]);
      for (let i = 0; i < 3; i++) onSeg(X, bone, 'arm', s, 0.08 + i * 0.12, 0.13 + i * 0.12, GE.torus(0.35, 12), 'gold', shade(X.c.trim, 0.1 * (i % 2)), m.armR0 * 1.32, m.armR0 * 1.28, NO, [HP, 0, 0]);
      X.add(bone, 'glow', GE.octa(), X.c.accent2, [sg * r * 0.6, up[1] + r * 0.9, 0], [r * 0.45, r * 0.9, r * 0.45], [0, 0, -sg * 0.4], NO);
      return;
    }
    if (style === 'lacquer') {
      for (let i = 0; i < 3; i++) X.add(bone, 'metal', GE.shell({ span: 3.2, rt: 0.92, th: 0.16, n: 10 }), i % 2 ? shade(col, -0.15) : col, [sg * r * (0.35 + 0.08 * i), up[1] * 0.6 - r * 0.55 * i, 0], [r * (2.9 - 0.15 * i), r * 0.75, r * (2.7 - 0.15 * i)], [0, sg * HP, -sg * (0.35 + 0.08 * i)]);
      X.add(bone, 'cloth2', GE.box(), X.c.cord, [sg * r * 1.35, up[1] * 0.2, 0], [0.01 * k, r * 1.8, 0.012 * k], [0, 0, -sg * 0.4], NO);
      return;
    }
    if (style === 'crystal') {
      X.add(bone, 'metal', GE.dome(1.1), col, [sg * r * 0.15, up[1], 0], [r * 2.9, r * 2.1, r * 2.7], [0, 0, -sg * 0.35]);
      for (let i = 0; i < 4; i++) X.add(bone, 'trans', GE.octa(), i % 2 ? c.gem : shade(c.gem, 0.4), [sg * r * (0.6 + 0.3 * (i % 2)), up[1] + r * (0.9 - 0.15 * i), (i - 1.5) * r * 0.55], [r * 0.55, r * (2.0 - 0.3 * (i % 3)), r * 0.55], [0.15 * (i - 1.5), 0, -sg * (0.3 + 0.2 * i)]);
      return;
    }
    if (style === 'leaf') {
      for (let i = 0; i < 4; i++) X.add(bone, 'leather', GE.panel({ cv: 0.18, fl: 0.2, th: 0.12, n: 4, tip: 0.3 }), shade(col, -0.06 * i), [sg * r * (0.4 + 0.2 * i), up[1] + r * (0.6 - 0.3 * i), (i % 2 ? -1 : 1) * r * 0.25], [r * 2.4, r * 2.2, r * 2.4], [-HP * 0.15, sg * HP, -sg * (0.9 + 0.25 * i)]);
      return;
    }
    // --- plaques métalliques : dôme + lames superposées + bordure + rivets
    const big = style === 'tiered' || style === 'lion' || style === 'winged' ? 1.18 : style === 'plateSmall' ? 0.85 : 1.05;
    X.add(bone, 'metal', GE.dome(1.18), col, [sg * r * 0.2, up[1], 0], [r * 3.2 * big, r * 2.3 * big, r * 2.9 * big], [0, 0, -sg * 0.38]);
    X.add(bone, tl, GE.torus(0.12, 14), trim, [sg * r * 0.2, up[1] - r * 0.22 * big, 0], [r * 3.15 * big, r * 2.85 * big, r * 1.0], [HP, 0, -sg * 0.38], NO);
    const lam = style === 'tiered' ? 3 : style === 'plateSmall' ? 1 : 2;
    for (let i = 0; i < lam; i++) {
      X.add(bone, 'metal', GE.shell({ span: 3.4, rt: 0.94, th: 0.15, n: 10 }), shade(col, -0.06 * (i + 1)), [sg * r * (0.55 + 0.05 * i), -r * (0.35 + 0.6 * i) * big, 0], [r * (2.75 - 0.2 * i) * big, r * 0.7 * big, r * (2.6 - 0.2 * i) * big], [0, sg * HP, -sg * (0.18 + 0.05 * i)]);
      P.rivets(X, bone, 'metal', c.metalL, [[sg * r * (1.75 - 0.08 * i) * big, -r * (0.35 + 0.6 * i) * big, 0, [0, 0, -sg * HP]]], 0.012 * k);
    }
    P.rivets(X, bone, 'metal', c.metalL, [[sg * r * 0.55, up[1] + r * 0.82 * big, r * 0.9, [0.6, 0, -sg * 0.4]], [sg * r * 0.55, up[1] + r * 0.82 * big, -r * 0.9, [-0.6, 0, -sg * 0.4]]], 0.013 * k);
    if (style === 'spiked') for (let i = 0; i < 3; i++) X.add(bone, 'metal', GE.spike(), c.metalD, [sg * r * (0.3 + 0.35 * i), up[1] + r * (1.05 - 0.25 * i), (i - 1) * r * 0.2], [r * 0.45, r * (1.6 - 0.3 * i), r * 0.45], [0, 0, -sg * (0.35 + 0.35 * i)]);
    if (style === 'lion') {
      X.add(bone, 'gold', GE.sph(), c.trim, [sg * r * 1.45, up[1] * 0.4, r * 0.15], [r * 1.0, r * 1.05, r * 0.9]);
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; X.add(bone, 'gold', GE.cone(5), c.trimD, [sg * r * 1.5 + sg * Math.cos(a) * r * 0.1, up[1] * 0.4 + Math.sin(a) * r * 0.6, r * 0.15 + Math.cos(a) * r * 0.6], [r * 0.35, r * 0.6, r * 0.35], [Math.cos(a) * 1.3, 0, -sg * HP + Math.sin(a) * 1.3 * sg], NO); }
    }
    if (style === 'winged') for (let i = 0; i < 3; i++) X.add(bone, o.wingLayer || tl, GE.panel({ cv: 0.05, fl: 0.25, th: 0.12, n: 3, tip: 0.2 }), i % 2 ? trim : shade(trim, 0.2), [sg * r * 0.9, up[1] + r * (0.6 - 0.1 * i), -r * (0.2 + 0.45 * i)], [r * 1.6, r * (3.0 - 0.6 * i), r * 1.6], [-0.25 - 0.25 * i, sg * HP, -sg * (0.6 + 0.12 * i)], NO);
    if (o.emblem) P.emblem(X, bone, o.emblem, [sg * r * 1.62 * big, up[1] * 0.5, 0], r * 1.0, trim, [0, sg * HP, -sg * 0.3]);
  };

  // ---------------------------------------------------------------- bras / mains
  /** canons d'avant-bras / brassards. style : plate | bracer | wrap | crystal | bone */
  P.vambraces = function (X, style, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    for (const [s, sg] of SIDES) {
      if (o.side && o.side !== s) continue;
      const b = 'forearm' + s, r0 = m.foreR0, r1 = m.foreR1;
      if (style === 'coil') { for (let i = 0; i < 3; i++) onSeg(X, b, 'fore', s, 0.55 + i * 0.12, 0.6 + i * 0.12, GE.torus(0.3, 12), 'gold', c.trim, (r0 + (r1 - r0) * (0.6 + i * 0.12)) * 1.15, (r0 + (r1 - r0) * (0.6 + i * 0.12)) * 1.1, NO, [HP, 0, 0]); continue; }
      if (style === 'plate') {
        onSeg(X, b, 'fore', s, 0.15, 0.92, GE.fr((r1 * 1.35) / (r0 * 1.3), 12), 'metal', col, r0 * 1.32, r0 * 1.25);
        onSeg(X, b, 'fore', s, 0.88, 1.02, GE.fr(1.35, 12), 'metal', shade(col, 0.1), r1 * 1.4, r1 * 1.35);
        // coudière (couter) : dôme + ailette
        onSeg(X, b, 'fore', s, -0.12, 0.1, GE.sph(), 'metal', shade(col, -0.05), r0 * 1.35, r0 * 1.3, null, null, [0, 0, -r0 * 0.25]);
        X.add(b, 'metal', GE.panel({ cv: 0.2, fl: 0.3, th: 0.12, n: 4, tip: 0.2 }), col, [sg * r0 * 0.9, 0.02 * k, -r0 * 0.5], [r0 * 2.0, r0 * 1.8, r0 * 2.0], [0, sg * 2.2, 0]);
        // canon de bras (rerebrace)
        onSeg(X, 'arm' + s, 'arm', s, 0.45, 0.95, GE.fr(1.0, 12), 'metal', shade(col, -0.05), m.armR0 * 1.22, m.armR0 * 1.18);
        const p = segPt(X, 'fore', s, 0.5, 0, r0 * 1.32);
        P.rivets(X, b, 'metal', c.metalL, [[p[0], p[1], p[2], [HP, 0, 0]]], 0.012 * k);
        if (o.trim) onSeg(X, b, 'fore', s, 0.15, 0.2, GE.torus(0.2, 12), o.goldTrim ? 'gold' : 'metal', o.trim, r0 * 1.35, r0 * 1.28, NO, [HP, 0, 0]);
      } else if (style === 'bracer' || (style === 'bracerL' && s === 'L')) {
        onSeg(X, b, 'fore', s, 0.25, 0.92, GE.fr((r1 * 1.3) / (r0 * 1.22), 10), 'leather', col, r0 * 1.24, r0 * 1.18);
        for (const t of [0.42, 0.75]) {
          onSeg(X, b, 'fore', s, t - 0.04, t + 0.04, GE.fr(1, 10), 'leather', c.leatherD, (r0 + (r1 - r0) * t) * 1.32, (r0 + (r1 - r0) * t) * 1.27);
          const p = segPt(X, 'fore', s, t, 0, (r0 + (r1 - r0) * t) * 1.32);
          X.add(b, 'metal', GE.box(), c.metalL, p, [0.026 * k, 0.022 * k, 0.008 * k], null, NO);
        }
        const p0 = segPt(X, 'fore', s, 0.28, 0, r0 * 1.2), p1 = segPt(X, 'fore', s, 0.9, 0, r1 * 1.3);
        P.stitches(X, b, c.stitch, [p0[0] + 0.02 * k * sg, p0[1], p0[2]], [p1[0] + 0.015 * k * sg, p1[1], p1[2]], 5);
      } else if (style === 'wrap' || style === 'bracerL') {
        for (let i = 0; i < 5; i++) onSeg(X, b, 'fore', s, 0.45 + i * 0.1, 0.53 + i * 0.1, GE.torus(0.45, 10), 'cloth2', o.wrapCol || c.second, (r0 + (r1 - r0) * (0.5 + i * 0.1)) * 1.12, (r0 + (r1 - r0) * (0.5 + i * 0.1)) * 1.08, NO, [HP, 0, 0.3 * (i % 2 ? 1 : -1)]);
      } else if (style === 'crystal') {
        onSeg(X, b, 'fore', s, 0.3, 0.92, GE.fr((r1 * 1.3) / (r0 * 1.2), 8), 'metal', col, r0 * 1.22, r0 * 1.16);
        const p = segPt(X, 'fore', s, 0.55, sg * r0 * 1.3, 0);
        X.add(b, 'trans', GE.octa(), c.gem, p, [r0 * 0.9, r0 * 2.2, r0 * 0.9], [0, 0, sg * 0.2]);
      } else if (style === 'bone') {
        onSeg(X, b, 'fore', s, 0.3, 0.9, GE.fr((r1 * 1.3) / (r0 * 1.2), 8), 'leather', c.leatherD, r0 * 1.2, r0 * 1.15);
        for (let i = 0; i < 3; i++) { const p = segPt(X, 'fore', s, 0.38 + i * 0.2, sg * r0 * 0.9, -r0 * 0.4); X.add(b, 'bone', GE.spike(), c.bone, p, [r0 * 0.5, r0 * 1.4, r0 * 0.5], [-0.9, 0, sg * 0.5]); }
      }
    }
  };

  /** gants : poignet évasé (+ plaque du dos de la main pour les gantelets). Ne recouvre pas les doigts (pose 'grip' d'A2). */
  P.gloves = function (X, style, col) {
    const m = X.m, k = X.k, c = X.c;
    for (const [s, sg] of SIDES) {
      const b = 'wrist' + s; if (!X.R.bones[b]) continue;
      const r = m.foreR1;
      const dirH = X.m['aFore' + s];
      const along = (t) => [dirH[0] * t, dirH[1] * t, dirH[2] * t];
      if (style === 'claw') {
        X.add(b, 'leather', GE.fr(1.3, 10), c.leatherD, along(-0.02 * k), [r * 2.35, 0.06 * k, r * 2.2], alignEuler([-dirH[0], -dirH[1], -dirH[2]], [0, 0, 1]));
        const pp = along(0.05 * k);
        X.add(b, 'metal', GE.shell({ span: 1.6, rt: 1.0, th: 0.25, n: 6 }), col, [pp[0] + sg * 0.004 * k, pp[1], pp[2]], [r * 2.4, 0.07 * k, r * 2.2], alignEuler(dirH, [0, 0, 1], [0, sg * HP, 0]));
        for (let i = 0; i < 3; i++) X.add(b, 'metal', GE.spike(), c.metalL, [pp[0] + sg * r * 1.0, pp[1] - 0.05 * k, pp[2] + (i - 1) * 0.018 * k], [0.012 * k, 0.07 * k, 0.012 * k], alignEuler(dirH, [0, 0, 1]), NO);
      } else if (style === 'gauntlet') {
        // manchette évasée vers le coude
        X.add(b, 'metal', GE.fr(1.45, 12), col, along(-0.025 * k), [r * 2.5, 0.075 * k, r * 2.35], alignEuler([-dirH[0], -dirH[1], -dirH[2]], [0, 0, 1]));
        X.add(b, 'metal', GE.torus(0.16, 12), shade(col, 0.15), along(-0.062 * k), [r * 3.4, r * 3.2, r * 1], alignEuler(dirH, [0, 0, 1], [HP, 0, 0]), NO);
        // plaque du dos de la main (côté extérieur +X pour L)
        const pp = along(0.05 * k);
        X.add(b, 'metal', GE.shell({ span: 1.6, rt: 1.0, th: 0.25, n: 6 }), shade(col, -0.05), [pp[0] + sg * 0.004 * k, pp[1], pp[2]], [r * 2.5, 0.07 * k, r * 2.3], alignEuler(dirH, [0, 0, 1], [0, sg * HP, 0]));
      } else if (style === 'glove' || style === 'fingerless') {
        X.add(b, 'leather', GE.fr(1.3, 10), col, along(-0.02 * k), [r * 2.35, 0.06 * k, r * 2.2], alignEuler([-dirH[0], -dirH[1], -dirH[2]], [0, 0, 1]));
        X.add(b, 'leather', GE.torus(0.2, 10), shade(col, -0.15), along(-0.05 * k), [r * 3.0, r * 2.8, r], alignEuler(dirH, [0, 0, 1], [HP, 0, 0]), NO);
      } else if (style === 'wrap') {
        for (let i = 0; i < 3; i++) X.add(b, 'cloth2', GE.torus(0.4, 10), col, along((-0.03 + i * 0.022) * k), [r * 2.3, r * 2.2, r * 0.9], alignEuler(dirH, [0, 0, 1], [HP, 0.3 * (i % 2 ? 1 : -1), 0]), NO);
      }
    }
  };

  // ---------------------------------------------------------------- jambes / pieds
  /** protections de jambes lourdes : cuissots + genouillères (poleyns) + grèves */
  P.legPlates = function (X, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    for (const [s, sg] of SIDES) {
      onSeg(X, 'leg' + s, 'thigh', s, 0.12, 0.85, GE.shell({ span: 3.2, rt: 1.12, th: 0.15, n: 10 }), 'metal', col, m.thR0 * 1.25, m.thR0 * 1.25, null, [PI, PI, 0]);
      // genouillère + ailette
      onSeg(X, 'shin' + s, 'shin', s, -0.1, 0.1, GE.sph(), 'metal', shade(col, 0.08), m.shR0 * 1.25, m.shR0 * 1.0, null, null, [0, 0, m.shR0 * 0.55]);
      const pk = segPt(X, 'shin', s, 0.0, sg * m.shR0 * 0.75, m.shR0 * 0.75);
      X.add('shin' + s, 'metal', GE.panel({ cv: 0.2, fl: 0.4, th: 0.12, n: 4, tip: 0.15 }), col, [pk[0], pk[1] + 0.05 * k, pk[2]], [m.shR0 * (o.winged ? 2.2 : 1.7), m.shR0 * (o.winged ? 2.0 : 1.7), m.shR0 * 1.7], [0, sg * 0.8, 0]);
      // cuissot supérieur (plaque sur le haut de la cuisse)
      onSeg(X, 'leg' + s, 'thigh', s, 0.05, 0.3, GE.shell({ span: 3.0, rt: 1.05, th: 0.15, n: 8 }), 'metal', shade(col, 0.06), m.thR0 * 1.32, m.thR0 * 1.32, null, [PI, PI, 0]);
      P.rivets(X, 'shin' + s, 'metal', c.metalL, [[pk[0] * 0.5, pk[1], m.shR0 * 1.62, [HP, 0, 0]]], 0.012 * k);
      // grève (devant du tibia)
      onSeg(X, 'shin' + s, 'shin', s, 0.12, 0.8, GE.shell({ span: 3.6, rt: 1.25, th: 0.13, n: 10 }), 'metal', shade(col, -0.04), m.shR1 * 1.5, m.shR1 * 1.55, null, [PI, PI, 0]);
      if (o.trim) onSeg(X, 'shin' + s, 'shin', s, 0.12, 0.16, GE.shell({ span: 3.6, th: 0.3, n: 10 }), o.goldTrim ? 'gold' : 'metal', o.trim, m.shR0 * 1.42, m.shR0 * 1.4, NO, [PI, PI, 0]);
    }
  };

  /** bottes. style : sabaton (plaques) | boot | tall | wrap | soft (robe) | fur */
  P.boots = function (X, style, col, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const fl = m.footL, fh = m.footH, fw = m.footW;
    for (const [s, sg] of SIDES) {
      const f = 'foot' + s;
      const metal = style === 'sabaton';
      const layer = metal ? 'metal' : style === 'fur' ? 'leather' : 'leather';
      // tige (sur le tibia)
      const top = style === 'tall' || style === 'sabaton' ? 0.45 : style === 'soft' ? 0.78 : 0.6;
      onSeg(X, 'shin' + s, 'shin', s, top, 1.04, GE.fr(1.08, 12), layer, col, m.shR0 * (1.12 + (1 - top) * 0.3), m.shR0 * (1.08 + (1 - top) * 0.3));
      if (style === 'tall' || style === 'boot') {
        // revers replié + sangle à boucle
        onSeg(X, 'shin' + s, 'shin', s, top - 0.07, top + 0.04, GE.fr(0.9, 12), 'leather', shade(col, -0.12), m.shR0 * 1.35, m.shR0 * 1.3);
        onSeg(X, 'shin' + s, 'shin', s, 0.82, 0.88, GE.fr(1, 12), 'leather', c.leatherD, m.shR1 * 1.42, m.shR1 * 1.38);
        const p = segPt(X, 'shin', s, 0.85, sg * m.shR1 * 1.38, 0);
        P.buckle(X, 'shin' + s, p, 0.035, c.metalL, [0, sg * HP, 0]);
      }
      if (style === 'wrap') for (let i = 0; i < 4; i++) onSeg(X, 'shin' + s, 'shin', s, 0.62 + i * 0.09, 0.69 + i * 0.09, GE.torus(0.45, 10), 'cloth2', o.wrapCol || c.second, m.shR1 * 1.38, m.shR1 * 1.32, NO, [HP, 0, 0.3 * (i % 2 ? 1 : -1)]);
      if (style === 'fur') onSeg(X, 'shin' + s, 'shin', s, top - 0.1, top + 0.06, GE.shell({ rt: 0.9, th: 0.3, pl: 9, pa: 0.12, n: 14, jag: 0.15 }), 'fur', c.fur, m.shR0 * 1.55, m.shR0 * 1.5);
      // pied : empeigne + bout + semelle + talon (le pied d'A2 est en +Z depuis la cheville)
      if (!X.R.bones[f]) continue;
      // chaussure modelée sur le pied du corps (sphère à fond plat, rayon 1) : empeigne + semelle débordante d'un rien + talon
      // (avant : un œuf trop court posé sur une planche plus longue que lui → « boule sur une planche »)
      const FG = (G.HeroKit && G.HeroKit.geo && G.HeroKit.geo.foot) || null, fs = FG ? 1 : 2, FOOT = FG || GE.sph();
      X.add(f, layer, FOOT, col, [0, -fh * 0.22, fl * 0.24], [fw * 1.14 * fs, fh * 0.78 * fs, fl * 0.6 * fs], null, { outline: true });
      if (!metal) X.add(f, layer, FOOT, shade(col, -0.05), [0, -fh * 0.3, fl * 0.42], [fw * 1.02 * fs, fh * 0.62 * fs, fl * 0.42 * fs], null, NO);
      X.add(f, 'leather', FOOT, c.leatherD, [0, -fh * 0.6, fl * 0.24], [fw * 1.2 * fs, fh * 0.22 * fs, fl * 0.63 * fs], null, NO);
      X.add(f, 'leather', GE.box(), c.leatherD, [0, -fh * 0.62, -fl * 0.04], [fw * 1.7, fh * 0.34, fl * 0.2], null, NO);
      if (metal) {
        // lames articulées du soleret (sur le cou-de-pied) + embout
        for (let i = 0; i < 3; i++) X.add(f, 'metal', GE.shell({ span: 3.0, rt: 0.95, th: 0.18, n: 8 }), shade(col, -0.04 * i), [0, -fh * (0.02 + 0.08 * i), fl * (0.08 + 0.13 * i)], [fw * 2.2, fh * 0.45, fl * 0.42], [-1.25, 0, 0], NO);
        X.add(f, 'metal', FOOT, shade(col, 0.08), [0, -fh * 0.34, fl * 0.62], [fw * 0.95 * fs, fh * 0.55 * fs, fl * 0.22 * fs], null, NO);
      } else {
        P.stitches(X, f, c.stitch, [-fw * 1.1, -fh * 0.7, fl * 0.15], [-fw * 1.0, -fh * 0.65, fl * 0.75], 4, layer);
        P.stitches(X, f, c.stitch, [fw * 1.1, -fh * 0.7, fl * 0.15], [fw * 1.0, -fh * 0.65, fl * 0.75], 4, layer);
        if (o.curl) X.add(f, layer, GE.cone(6), col, [0, -fh * 0.1, fl * 0.98], [fw * 0.9, fl * 0.35, fw * 0.9], [1.0, 0, 0]);
      }
    }
  };

  // ---------------------------------------------------------------- cape
  /** cape sur la chaîne capeA > capeB > capeC.
   *  style : short | long | tattered | royal | fur | double | half | energy ; o.col, o.lining, o.trim */
  P.cape = function (X, style, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    const B = X.R.bones;
    if (!B.capeA) return;
    const col = o.col != null ? o.col : c.main, lining = o.lining != null ? o.lining : c.mainD;
    const layer = o.layer || 'cape';
    const L1 = m.capeLen[0], L2 = m.capeLen[1];
    const yA = m.yCapeA;
    let total = style === 'short' || style === 'half' ? Math.min(yA * 0.42, L1 + L2 * 0.4) : Math.max(L1 + L2 + 0.1 * k, yA - m.ground - 0.08 * k);
    if (style === 'tattered') total *= 0.93;
    const w0 = (o.narrow ? 1.32 : style === 'half' ? 1.2 : 1.85) * m.shX, fl = o.narrow ? 1.3 : style === 'royal' ? 1.55 : style === 'short' ? 1.25 : 1.4;
    const cv = o.narrow ? 0.34 : 0.16;   // cape étroite qui épouse le dos (Nécromancien) au lieu d'un panneau plat
    const segs = [['capeA', Math.min(L1, total)], ['capeB', Math.min(L2, Math.max(0, total - L1))], ['capeC', Math.max(0, total - L1 - L2)]];
    let done = 0, wTop = w0;
    const jag = style === 'tattered' ? 0.16 : style === 'energy' ? 0.1 : 0;
    const off = style === 'half' ? -m.shX * 0.35 : 0; // demi-cape sur l'épaule gauche (côté +X)... décalée
    segs.forEach(([bn, ln], i) => {
      if (!(ln > 0.02 * k) || !B[bn]) return;
      const last = i === 2 || (segs[i + 1] && !(segs[i + 1][1] > 0.02 * k));
      const f = 1 + (fl - 1) * ((done + ln) / total) - (1 + (fl - 1) * (done / total)) + 1;
      const wBot = w0 * (1 + (fl - 1) * ((done + ln) / total));
      const flr = wBot / wTop;
      const h = ln + (last ? 0 : 0.05 * k);
      X.add(bn, layer, GE.panel({ cv, fl: flr, th: 0.022 / (wTop / k), n: 8, jag: last ? jag / Math.max(0.3, h / k) * 0.6 : 0 }), col, [i === 0 ? -off : 0, 0.02 * k * (i === 0 ? 1 : 0), 0], [wTop, h, wTop], [0, PI, 0]);
      // doublure (intérieur, couleur foncée) légèrement en avant
      X.add(bn, 'cloth2', GE.panel({ cv, fl: flr, th: 0.01 / (wTop / k), n: 6, jag: last ? jag / Math.max(0.3, h / k) * 0.6 : 0 }), lining, [i === 0 ? -off : 0, 0.0, 0.012 * k], [wTop * 0.96, h * 0.99, wTop * 0.96], [0, PI, 0], NO);
      if (last && o.trim !== false && style !== 'tattered' && style !== 'energy') {
        X.add(bn, o.trimLayer || 'cloth2', GE.panel({ cv: 0.16, fl: 1, th: 0.05, n: 8 }), o.trim || c.trim, [0, -h + 0.035 * k, -0.002 * k], [wBot * 1.01, 0.04 * k, wBot * 1.01], [0, PI, 0], NO);
      }
      if (style === 'fur' && i === 0) X.add(bn, 'fur', GE.shell({ span: 3.6, back: true, rt: 0.85, th: 0.4, pl: 11, pa: 0.12, n: 16, jag: 0.12 }), c.fur, [0, 0.0, m.chD * 0.9], [m.shX * 2.3, 0.14 * k, m.chD * 3.0]);
      if (style === 'royal' && i === 0) {
        // mantelet d'hermine
        X.add(bn, 'fur', GE.shell({ span: 3.8, back: true, rt: 0.8, th: 0.35, n: 16 }), 0xf4f0e8, [0, -0.03 * k, m.chD * 0.95], [m.shX * 2.35, 0.17 * k, m.chD * 3.1]);
        for (let j = -2; j <= 2; j++) X.add(bn, 'cloth2', GE.box(), 0x15151a, [j * m.shX * 0.35, -0.08 * k, -0.04 * k], [0.018 * k, 0.04 * k, 0.012 * k], null, NO);
      }
      if (style === 'double' && i === 0) X.add(bn, layer, GE.panel({ cv: 0.2, fl: 1.25, th: 0.02 / (wTop / k), n: 8, jag: 0 }), o.col2 || c.second, [0, 0.03 * k, -0.025 * k], [wTop * 1.06, h * 0.75, wTop * 1.06], [0, PI, 0]);
      if (o.emblem && i === 1) P.emblem(X, bn, o.emblem, [0, -h * 0.35, -0.035 * k], 0.16 * k, o.emblemCol || c.trim, [0, PI, 0]);
      done += ln; wTop = wBot;
    });
    // agrafes / fermoirs sur le torse
    if (style !== 'energy') for (const [, sg] of SIDES) {
      if (style === 'half' && sg < 0) continue;
      X.add('chest', o.claspLayer || 'gold', GE.cyl(10), o.clasp || c.trim, [sg * m.chW * 0.72, m.neckY * 0.9, m.chD * 0.95], [0.06 * k, 0.018 * k, 0.06 * k], [HP, 0, 0]);
      X.add('chest', 'gem', GE.gemCut(), c.gem, [sg * m.chW * 0.72, m.neckY * 0.9, m.chD * 0.95 + 0.012 * k], [0.03 * k, 0.025 * k, 0.03 * k], [HP, 0, 0], NO);
      X.add('chest', layer, GE.box(), col, [sg * m.chW * 0.95, m.neckY * 0.95, 0], [0.04 * k, 0.04 * k, m.chD * 1.9], [0, 0, -sg * 0.2]);
    }
  };

  // ---------------------------------------------------------------- col / coiffes
  P.collar = function (X, style, col, opt) {
    const m = X.m, k = X.k, c = X.c;
    const y = m.neckY * 0.98;
    if (style === 'fur') X.add('chest', 'fur', GE.shell({ rt: 0.72, th: 0.4, pl: 13, pa: 0.12, n: 18, jag: 0.12 }), col || c.fur, [0, y, 0], [m.shX * 2.15, 0.15 * k, m.chD * 2.9]);
    else if (style === 'high') { X.add('chest', 'cloth', GE.shell({ span: 4.4, back: true, rt: 1.35, th: 0.12, n: 14 }), col || c.mainD, [0, y + 0.07 * k, m.neckZ * 0.3], [m.neckR * 4.4, 0.2 * k, m.neckR * 4.0]); X.add('chest', 'cloth2', GE.shell({ span: 4.4, back: true, rt: 1, th: 0.3, n: 14 }), c.trim, [0, y + 0.17 * k, m.neckZ * 0.3], [m.neckR * 5.9, 0.025 * k, m.neckR * 5.4], null, NO); }
    else if (style === 'mantle') {
      X.add('chest', 'cloth', GE.shell({ rt: 0.6, rm: 0.95, th: 0.12, pl: 8, pa: 0.06, n: 18 }), col || c.mainD, [0, y - 0.06 * k, 0], [m.shX * 2.35, 0.24 * k, m.chD * 2.9]);
      X.add('chest', 'cloth2', GE.shell({ rt: 1, th: 0.25, pl: 8, pa: 0.06, n: 18 }), c.trim, [0, y - 0.175 * k, 0], [m.shX * 2.38, 0.025 * k, m.chD * 2.95], null, NO);
    } else if (style === 'cowl') X.add('chest', 'cloth', GE.shell({ rt: 0.55, rm: 0.85, th: 0.12, pl: 6, pa: 0.08, n: 16 }), col || c.mainD, [0, y - 0.02 * k, 0], [m.shX * 2.1, 0.22 * k, m.chD * 2.8]);
    else if (style === 'bone') {
      X.add('chest', 'leather', GE.shell({ rt: 0.7, th: 0.25, n: 16 }), c.leatherD, [0, y, 0], [m.shX * 1.9, 0.08 * k, m.chD * 2.6]);
      for (let i = 0; i < 9; i++) { const a = PI + (i - 4) * 0.36; X.add('chest', 'bone', GE.spike(), c.bone, [Math.sin(a) * m.shX * 0.85, y + 0.07 * k, Math.cos(a) * m.chD * 1.2], [0.035 * k, (0.11 + 0.05 * (1 - Math.abs(i - 4) / 4)) * k, 0.035 * k], [Math.cos(a) * -0.5, 0, Math.sin(a) * 0.5]); }
    } else if (style === 'leaf') for (let i = 0; i < 9; i++) { const a = PI + (i - 4) * 0.42; X.add('chest', 'cloth2', GE.panel({ cv: 0.2, fl: 0.2, th: 0.1, n: 3, tip: 0.3 }), shade(col || c.second, (i % 3) * 0.08), [Math.sin(a) * m.shX * 0.8, y + 0.02 * k, Math.cos(a) * m.chD * 1.15], [0.1 * k, 0.16 * k, 0.1 * k], [-0.6, a, 0], NO); }
    else if (style === 'crystal') for (let i = 0; i < 7; i++) { const a = PI + (i - 3) * 0.45; X.add('chest', 'trans', GE.octa(), i % 2 ? c.gem : shade(c.gem, 0.4), [Math.sin(a) * m.shX * 0.75, y + 0.08 * k, Math.cos(a) * m.chD * 1.15], [0.05 * k, (0.14 + 0.06 * (i % 2)) * k, 0.05 * k], [Math.cos(a) * -0.4, 0, Math.sin(a) * 0.4]); }
    else if (style === 'scarf') {
      X.add('chest', 'cloth2', GE.torus(0.42, 14), col || c.second, [0, y + 0.01 * k, m.neckZ * 0.3], [m.neckR * 3.6, m.neckR * 3.4, 0.09 * k], [HP + 0.15, 0, 0]);
      X.add('chest', 'cloth2', GE.panel({ cv: 0.1, fl: 1.2, th: 0.12, n: 3, jag: 0.1 }), shade(col || c.second, -0.08), [m.chW * 0.35, y - 0.02 * k, m.chD * 1.15], [0.09 * k, 0.32 * k, 0.09 * k], [0.15, 0, 0.12]);
    }
  };

  /** emblème : lion, sun, cross, leaf, skull, star, flame, snow, bolt, eye, moon, crown */
  P.emblem = function (X, bone, kind, pos, size, col, rot) {
    const k = X.k, s = size, r = rot || [0, 0, 0], c = X.c;
    const L = 'gold';
    const at = (dx, dy, dz) => { // position dans le plan de l'emblème
      const e = r[1] || 0;
      return [pos[0] + dx * Math.cos(e) + dz * Math.sin(e), pos[1] + dy, pos[2] - dx * Math.sin(e) + dz * Math.cos(e)];
    };
    X.add(bone, L, GE.cyl(10), shade(col, -0.25), at(0, 0, -0.004 * k), [s * 1.0, 0.012 * k, s * 1.0], composeEuler(r, [HP, 0, 0]));
    switch (kind) {
      case 'sun': X.add(bone, L, GE.cyl(10), col, at(0, 0, 0.004 * k), [s * 0.45, 0.012 * k, s * 0.45], composeEuler(r, [HP, 0, 0]), NO); for (let i = 0; i < 8; i++) X.add(bone, L, GE.cone(4), col, at(Math.cos(i * TAU / 8) * s * 0.36, Math.sin(i * TAU / 8) * s * 0.36, 0.004 * k), [s * 0.12, s * 0.22, 0.01 * k], composeEuler(r, [0, 0, i * TAU / 8 - HP]), NO); break;
      case 'cross': X.add(bone, L, GE.box(), col, at(0, 0, 0.004 * k), [s * 0.16, s * 0.75, 0.012 * k], r, NO); X.add(bone, L, GE.box(), col, at(0, s * 0.1, 0.004 * k), [s * 0.55, s * 0.16, 0.012 * k], r, NO); break;
      case 'lion': X.add(bone, L, GE.sph(), col, at(0, 0, 0.004 * k), [s * 0.55, s * 0.6, 0.03 * k], r, NO); for (let i = 0; i < 8; i += 2) X.add(bone, L, GE.cone(4), shade(col, -0.1), at(Math.cos(i * TAU / 8) * s * 0.3, Math.sin(i * TAU / 8) * s * 0.3, 0), [s * 0.14, s * 0.2, 0.012 * k], composeEuler(r, [0, 0, i * TAU / 8 - HP]), NO); break;
      case 'skull': X.add(bone, 'bone', GE.sph(), c.bone, at(0, s * 0.05, 0.006 * k), [s * 0.55, s * 0.5, 0.03 * k], r, NO); X.add(bone, 'bone', GE.box(), c.bone, at(0, -s * 0.22, 0.006 * k), [s * 0.3, s * 0.15, 0.025 * k], r, NO); break;
      case 'leaf': X.add(bone, L, GE.panel({ cv: 0.05, fl: 0.1, th: 0.08, n: 3, tip: 0.3 }), col, at(0, s * 0.35, 0.006 * k), [s * 0.45, s * 0.7, s * 0.45], r, NO); break;
      case 'flame': for (let i = -1; i <= 1; i++) X.add(bone, L, GE.cone(5), col, at(i * s * 0.16, (i ? -0.05 : 0.05) * s, 0.006 * k), [s * 0.22, s * (i ? 0.45 : 0.65), 0.02 * k], composeEuler(r, [0, 0, -i * 0.3]), NO); break;
      case 'snow': for (let i = 0; i < 3; i++) X.add(bone, L, GE.box(), col, at(0, 0, 0.006 * k), [s * 0.08, s * 0.8, 0.012 * k], composeEuler(r, [0, 0, i * PI / 3]), NO); break;
      case 'bolt': X.add(bone, L, GE.box(), col, at(0.03 * s, 0.15 * s, 0.006 * k), [s * 0.12, s * 0.45, 0.012 * k], composeEuler(r, [0, 0, -0.5]), NO); X.add(bone, L, GE.box(), col, at(-0.03 * s, -0.15 * s, 0.006 * k), [s * 0.12, s * 0.45, 0.012 * k], composeEuler(r, [0, 0, -0.5]), NO); break;
      case 'eye': X.add(bone, L, GE.sph(), col, at(0, 0, 0.004 * k), [s * 0.7, s * 0.32, 0.02 * k], r, NO); X.add(bone, 'gem', GE.sphLo(), c.gem, at(0, 0, 0.012 * k), [s * 0.22, s * 0.22, 0.02 * k], r, NO); break;
      case 'moon': X.add(bone, L, GE.torus(0.35, 10), col, at(0, 0, 0.004 * k), [s * 0.6, s * 0.6, 0.03 * k], composeEuler(r, [0, 0, 0.5]), NO); break;
      case 'crown': for (let i = -1; i <= 1; i++) X.add(bone, L, GE.cone(4), col, at(i * s * 0.22, s * 0.05 + (i ? 0 : 0.05 * s), 0.006 * k), [s * 0.16, s * 0.4, 0.012 * k], r, NO); X.add(bone, L, GE.box(), col, at(0, -s * 0.15, 0.006 * k), [s * 0.6, s * 0.12, 0.012 * k], r, NO); break;
      default: X.add(bone, 'gem', GE.gemCut(), c.gem, at(0, 0, 0.01 * k), [s * 0.4, s * 0.3, s * 0.4], composeEuler(r, [HP, 0, 0]), NO);
    }
  };

  /** coiffes et casques (os head). Repère tête : centre du crâne en (0, headY, 0), rayon headR. */
  P.head = function (X, style, opt) {
    const m = X.m, k = X.k, c = X.c, o = opt || {};
    if (!style || style === 'none' || !X.R.bones.head) return;
    const hy = m.headY, hr = m.headR, B = 'head';
    const col = o.col != null ? o.col : c.main;
    const metal = o.metal != null ? o.metal : c.metal;
    const trim = o.trim != null ? o.trim : c.trim;
    const helmet = (vis) => {
      X.add(B, 'metal', GE.dome(1.12), metal, [0, hy + 0.0 * k, -0.012 * k], [hr * 2.42, hr * 2.42, hr * 2.55]); // assez haut/profond pour couvrir les cheveux d'A2
      X.add(B, 'metal', GE.shell({ span: 4.4, back: true, rt: 1.05, th: 0.12, n: 14 }), shade(metal, -0.08), [0, hy - hr * 0.42, -0.01 * k], [hr * 2.38, hr * 0.95, hr * 2.4]);
      X.add(B, o.goldTrim ? 'gold' : 'metal', GE.torus(0.1, 18), trim, [0, hy + 0.01 * k, 0], [hr * 2.36, hr * 2.36, hr * 1.2], [HP, 0, 0], NO);
      // crête centrale
      if (vis === 'great') X.add(B, 'metal', GE.box(), shade(metal, 0.12), [0, hy + hr * 1.05, -0.01 * k], [0.018 * k, 0.03 * k, hr * 1.9], null, NO);
      if (vis === 'nasal') X.add(B, 'metal', GE.box(), shade(metal, 0.1), [0, hy - hr * 0.2, hr * 1.13], [0.028 * k, hr * 0.7, 0.02 * k]);
      if (vis === 'great') {
        // visière avec fente des yeux et trous de respiration
        X.add(B, 'metal', GE.shell({ span: 2.6, rt: 1.0, rm: 1.04, th: 0.14, n: 12 }), metal, [0, hy - hr * 0.35, 0.01 * k], [hr * 2.4, hr * 1.25, hr * 2.45]);
        X.add(B, 'eye', GE.box(), 0x0a0a10, [0, hy - hr * 0.08, hr * 1.2], [hr * 1.1, 0.022 * k, 0.03 * k], null, NO);
        X.add(B, 'metal', GE.box(), shade(metal, 0.15), [0, hy - hr * 0.42, hr * 1.2], [0.022 * k, hr * 0.68, 0.03 * k]);
        for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) X.add(B, 'eye', GE.sphLo(), 0x0a0a10, [sg * hr * 0.3, hy - hr * (0.45 + i * 0.13), hr * 1.16], 0.012 * k, null, NO);
      }
      // rivets sur le bandeau
      const pts = []; for (let i = -3; i <= 3; i++) pts.push([Math.sin(i * 0.45) * hr * 1.19, hy + 0.012 * k, Math.cos(i * 0.45) * hr * 1.19, [HP, i * 0.45, 0]]);
      P.rivets(X, B, 'metal', c.metalL, pts, 0.012 * k);
    };
    switch (style) {
      case 'halfHelm': helmet(o.winglets ? null : 'nasal'); if (o.winglets) for (const sg of [-1, 1]) for (let i = 0; i < 2; i++) X.add(B, 'gold', GE.panel({ cv: 0.05, fl: 0.3, th: 0.12, n: 3, tip: 0.2 }), shade(trim, 0.1 * i), [sg * hr * 1.15, hy + hr * (0.2 + i * 0.12), -hr * (0.1 + i * 0.2)], [hr * 0.5, hr * (1.0 - 0.25 * i), hr * 0.5], [-0.8 - 0.3 * i, sg * HP, -sg * 0.3], NO); break;
      case 'helmGreat': helmet('great'); if (o.emblem) P.emblem(X, B, o.emblem, [0, hy + hr * 0.45, hr * 1.12], 0.08 * k, trim, [-0.4, 0, 0]); break;
      case 'helmHorned':
        helmet(o.visor || 'great');
        for (const sg of [-1, 1]) {
          X.add(B, 'bone', GE.spike(), o.horn || c.bone, [sg * hr * 1.05, hy + hr * 0.35, 0], [hr * 0.45, hr * 1.0, hr * 0.45], [0, 0, -sg * 1.05]);
          X.add(B, 'bone', GE.spike(), shade(o.horn || c.bone, -0.1), [sg * hr * 1.55, hy + hr * 0.95, 0.0], [hr * 0.3, hr * 0.8, hr * 0.3], [0.2, 0, -sg * 0.25]);
        }
        break;
      case 'helmCrest':
        helmet(o.visor || 'nasal');
        // plumet en éventail (crinière)
        for (let i = 0; i < 9; i++) { const a = -0.6 + i * 0.15; X.add(B, 'cloth2', GE.panel({ cv: 0.1, fl: 0.5, th: 0.15, n: 3, tip: 0.2 }), shade(o.plume || c.main, (i % 3) * 0.06), [0, hy + hr * (1.0 + 0.05 * Math.cos(a)), -hr * 0.2 + Math.sin(a) * hr * 0.9], [0.05 * k, hr * 1.1, 0.05 * k], [a - 0.3, HP, 0], NO); }
        break;
      case 'helmWinged':
        helmet(o.visor || 'nasal');
        for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) X.add(B, o.wingLayer || 'gold', GE.panel({ cv: 0.05, fl: 0.3, th: 0.12, n: 3, tip: 0.2 }), shade(trim, 0.1 * i), [sg * hr * 1.12, hy + hr * (0.25 + i * 0.12), -hr * (0.1 + i * 0.25)], [hr * 0.6, hr * (1.4 - 0.25 * i), hr * 0.6], [-0.7 - 0.3 * i, sg * HP, -sg * 0.3], NO);
        break;
      case 'crown': case 'iceCrown': case 'skullCrown': case 'thornCrown': {
        const L = style === 'iceCrown' ? 'trans' : style === 'skullCrown' ? 'bone' : 'gold';
        const cc = style === 'iceCrown' ? 0xbfefff : style === 'skullCrown' ? c.bone : (o.gold || trim);
        const rr = hr * 1.03, yb = hy + hr * 0.3;
        X.add(B, style === 'iceCrown' ? 'metal' : L, GE.shell({ rt: 1.08, th: 0.1, n: 18 }), style === 'iceCrown' ? c.metalL : cc, [0, yb, -0.01 * k], [rr * 2, hr * 0.3, rr * 2.06]);
        const nP = style === 'thornCrown' ? 10 : 7;
        for (let i = 0; i < nP; i++) {
          const a = (i - (nP - 1) / 2) * (TAU / nP);
          const hh = (style === 'iceCrown' ? 0.75 : style === 'thornCrown' ? 0.6 : 0.5) * hr * (i === (nP - 1) / 2 ? 1.5 : 1 - 0.08 * Math.abs(i - (nP - 1) / 2));
          X.add(B, L, style === 'iceCrown' ? GE.octa() : GE.spike(), i % 2 && style === 'iceCrown' ? shade(cc, 0.3) : cc, [Math.sin(a) * rr * 1.0, yb + hr * 0.15 + hh * 0.45, Math.cos(a) * rr * 1.0 - 0.01 * k], [hr * (style === 'iceCrown' ? 0.25 : 0.2), hh, hr * 0.2], [Math.cos(a) * -0.15, 0, Math.sin(a) * 0.15]);
        }
        if (style === 'crown') X.add(B, 'gem', GE.gemCut(), c.gem, [0, yb + hr * 0.02, rr * 1.04], [hr * 0.24, hr * 0.2, hr * 0.24], [HP, 0, 0], NO);
        if (style === 'skullCrown') { X.add(B, 'bone', GE.sph(), c.bone, [0, yb + hr * 0.2, rr * 1.02], [hr * 0.45, hr * 0.42, hr * 0.3]); X.add(B, 'eye', GE.sphLo(), c.gem, [hr * 0.09, yb + hr * 0.23, rr * 1.14], hr * 0.1, null, NO); X.add(B, 'eye', GE.sphLo(), c.gem, [-hr * 0.09, yb + hr * 0.23, rr * 1.14], hr * 0.1, null, NO); }
        break;
      }
      case 'circlet': case 'diadem': case 'leafCrown': {
        const rr = hr * 1.04, yb = hy + hr * 0.25;
        X.add(B, style === 'leafCrown' ? 'leather' : 'gold', GE.torus(0.1, 20), style === 'leafCrown' ? 0x6b4a2a : trim, [0, yb, -0.01 * k], [rr * 2.05, rr * 2.1, hr * 0.5], [HP - 0.25, 0, 0], NO);
        if (style === 'circlet' || style === 'diadem') {
          X.add(B, 'gem', GE.gemCut(), o.gem || c.gem, [0, yb + hr * 0.25, rr * 0.96], [hr * 0.22, hr * 0.2, hr * 0.22], [HP - 0.2, 0, 0], NO);
          X.add(B, 'gold', GE.cone(4), trim, [0, yb + hr * 0.45, rr * 0.93], [hr * 0.18, hr * 0.4, hr * 0.06], [-0.25, 0, 0], NO);
          if (style === 'diadem') for (const sg of [-1, 1]) for (let i = 1; i <= 3; i++) X.add(B, 'gold', GE.cone(4), trim, [sg * Math.sin(i * 0.4) * rr, yb + hr * (0.32 - i * 0.06), Math.cos(i * 0.4) * rr * 0.95], [hr * 0.12, hr * (0.35 - 0.07 * i), hr * 0.05], [-0.25, sg * i * 0.4, 0], NO);
        } else for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; X.add(B, o.leaf != null && o.leaf === trim ? 'gold' : 'cloth2', GE.panel({ cv: 0.2, fl: 0.15, th: 0.1, n: 3, tip: 0.3 }), shade(o.leaf || 0x3fa05a, (i % 3) * 0.08 - 0.05), [Math.sin(a) * rr, yb + hr * 0.12, Math.cos(a) * rr], [hr * 0.38, hr * 0.55, hr * 0.38], [-0.3, a, 0], NO); }
        if (o.antlers) for (const sg of [-1, 1]) { X.add(B, 'bone', GE.cyl(6), 0x8a6a4a, [sg * hr * 0.7, yb + hr * 0.55, -hr * 0.1], [0.025 * k, hr * 1.0, 0.025 * k], [0, 0, -sg * 0.5]); X.add(B, 'bone', GE.cyl(6), 0x8a6a4a, [sg * hr * 0.95, yb + hr * 0.75, -hr * 0.05], [0.02 * k, hr * 0.6, 0.02 * k], [0.4, 0, -sg * 1.1]); X.add(B, 'bone', GE.cyl(6), 0x8a6a4a, [sg * hr * 1.0, yb + hr * 1.1, -hr * 0.2], [0.018 * k, hr * 0.5, 0.018 * k], [-0.3, 0, -sg * 0.1]); }
        break;
      }
      case 'hood': case 'hoodUp': case 'cowl': case 'hoodTall': case 'hoodTight': case 'deepHood': case 'deepHoodIce': {
        // capuche OUVERTE devant : calotte haute + coque arrière (le visage reste visible)
        const L = o.layer || 'cloth';
        const big = style === 'cowl' || style === 'deepHood' || style === 'deepHoodIce' ? 1.12 : style === 'hoodTight' ? 1.0 : 1.05;
        const deep = style === 'deepHood' || style === 'deepHoodIce' ? 1 : 0;
        X.add(B, L, GE.hoodGeo(deep ? 0.85 : 0.72), col, [0, hy + 0.01 * k, -0.02 * k - deep * hr * 0.05], [hr * 2.3 * big, hr * 2.3 * big, hr * 2.4 * big]);
        // ourlet épais qui encadre le visage (anneau ouvert, ne couvre pas le visage)
        { const hs = m.headR / 0.172; // ourlet fin qui épouse le contour du visage (ellipse 0,17 × 0,23)
          X.add(B, L, GE.torus(0.1, 22), shade(col, -0.12), [0, 0.19 * hs, (0.15 - 0.03 * deep) * hs], [0.37 * hs * big, 0.47 * hs * big, 0.08 * hs], [-0.18, 0, 0], NO); }
        // pointe tombante dans le dos
        X.add(B, L, GE.panel({ cv: 0.2, fl: 0.4, th: 0.1, n: 4, tip: 0.3 }), col, [0, hy - hr * 0.2, -hr * 1.12], [hr * 1.2, hr * (style === 'hoodTall' ? 1.6 : 1.0), hr * 1.2], [0.25, PI, 0], NO);
        // pans sur les épaules (encolure)
        X.add(B, L, GE.shell({ span: 4.4, back: true, rt: 0.75, th: 0.1, pl: 5, pa: 0.06, n: 12 }), col, [0, hy - hr * 1.2, -hr * 0.15], [hr * 2.7 * big, hr * 1.25, hr * 2.6 * big]);
        if (style === 'hoodTall') X.add(B, L, GE.cone(8), shade(col, -0.05), [0, hy + hr * 1.15, -hr * 0.55], [hr * 0.9, hr * 1.4, hr * 0.9], [-0.9, 0, 0]);
        if (style === 'deepHood') P.head(X, 'skullCrown', { trim: o.trim });
        if (style === 'deepHoodIce') P.head(X, 'iceCrown', {});
        break;
      }
      case 'hat': case 'hatTall': {
        // chapeau de mage : bord large ondulé + cône recourbé + bandeau
        const tall = style === 'hatTall' ? 1.35 : 1;
        X.add(B, 'cloth', GE.shell({ rt: 0.42, th: 0.6, pl: 7, pa: 0.04, n: 20 }), shade(col, -0.1), [0, hy + hr * 0.35, -0.01 * k], [hr * 4.0, 0.04 * k, hr * 4.0], [-0.1, 0, 0]);
        X.add(B, 'cloth', GE.fr(0.55, 14), col, [0, hy + hr * 0.82, -hr * 0.08], [hr * 2.2, hr * 1.05 * tall, hr * 2.2], [-0.12, 0, 0]);
        X.add(B, 'cloth', GE.fr(0.4, 12), col, [0, hy + hr * (1.55 + 0.35 * (tall - 1)), -hr * 0.35], [hr * 1.15, hr * 0.7 * tall, hr * 1.15], [-0.45, 0, 0]);
        X.add(B, 'cloth', GE.cone(10), shade(col, -0.05), [0, hy + hr * (1.95 + 0.5 * (tall - 1)), -hr * 0.82], [hr * 0.48, hr * 0.85 * tall, hr * 0.48], [-1.25, 0, 0]);
        X.add(B, 'cloth2', GE.fr(0.95, 14), trim, [0, hy + hr * 0.5, -hr * 0.03], [hr * 2.25, hr * 0.22, hr * 2.25], [-0.12, 0, 0]);
        X.add(B, 'gold', GE.box(), shade(trim, 0.15), [0, hy + hr * 0.5, hr * 1.1], [hr * 0.35, hr * 0.3, 0.02 * k], [-0.12, 0, 0]);
        X.add(B, 'gem', GE.gemCut(), c.gem, [0, hy + hr * 0.5, hr * 1.14], [hr * 0.2, hr * 0.17, hr * 0.2], [HP - 0.12, 0, 0], NO);
        if (o.stars) for (let i = 0; i < 4; i++) X.add(B, 'gold', GE.octa(), 0xfff2a8, [Math.sin(i * 1.6) * hr * 0.9, hy + hr * (0.85 + i * 0.22), Math.cos(i * 1.6) * hr * 0.75 - hr * 0.1], 0.035 * k, null, NO);
        break;
      }
      case 'bandana':
        X.add(B, 'cloth2', GE.dome(1.0), col, [0, hy + 0.005 * k, -0.01 * k], [hr * 2.22, hr * 1.85, hr * 2.28], [-0.12, 0, 0]);
        X.add(B, 'cloth2', GE.torus(0.14, 16), shade(col, -0.15), [0, hy + hr * 0.15, 0], [hr * 2.18, hr * 2.25, hr * 0.8], [HP - 0.12, 0, 0], NO);
        X.add(B, 'cloth2', GE.sph(), col, [0, hy + hr * 0.1, -hr * 1.08], [hr * 0.35, hr * 0.3, hr * 0.25]);
        for (const sg of [-1, 1]) X.add(B, 'cloth2', GE.panel({ cv: 0.1, fl: 1.2, th: 0.12, n: 3, jag: 0.08 }), col, [sg * hr * 0.12, hy + hr * 0.08, -hr * 1.12], [hr * 0.35, hr * 1.1, hr * 0.35], [0.3, PI, sg * 0.35]);
        if (o.goggles) { for (const sg of [-1, 1]) { X.add(B, 'metal', GE.torus(0.3, 10), 0x9a7a4a, [sg * hr * 0.38, hy + hr * 0.5, hr * 0.92], [hr * 0.5, hr * 0.5, hr * 0.4], [-0.5, 0, 0], NO); X.add(B, 'trans', GE.cyl(10), 0xffb347, [sg * hr * 0.38, hy + hr * 0.5, hr * 0.93], [hr * 0.38, 0.015 * k, hr * 0.38], [HP - 0.5, 0, 0], NO); } }
        break;
      case 'tricorn': {
        X.add(B, 'cloth', GE.dome(1.0), col, [0, hy + hr * 0.15, -0.01 * k], [hr * 2.2, hr * 1.5, hr * 2.25]);
        for (let i = 0; i < 3; i++) { const a = i * TAU / 3; X.add(B, 'cloth', GE.panel({ cv: 0.25, fl: 1.3, th: 0.08, n: 6 }), shade(col, -0.08), [Math.sin(a) * hr * 0.95, hy + hr * 0.2, Math.cos(a) * hr * 0.95], [hr * 1.9, hr * 0.7, hr * 1.9], [-0.35, a, 0]); }
        X.add(B, 'gold', GE.torus(0.1, 18), trim, [0, hy + hr * 0.3, 0], [hr * 2.25, hr * 2.3, hr], [HP, 0, 0], NO);
        X.add(B, 'cloth2', GE.panel({ cv: 0.15, fl: 0.3, th: 0.1, n: 4, tip: 0.3 }), o.plume || 0xff3d4e, [hr * 0.6, hy + hr * 0.65, -hr * 0.2], [hr * 0.6, hr * 1.9, hr * 0.6], [-1.0, 0.6, -0.3], NO);
        break;
      }
      case 'kasa': // chapeau conique large (assassin jade)
        X.add(B, 'cloth', GE.cone(16), col, [0, hy + hr * 0.75, 0], [hr * 4.2, hr * 0.85, hr * 4.2]);
        X.add(B, 'cloth2', GE.torus(0.08, 18), trim, [0, hy + hr * 0.35, 0], [hr * 4.1, hr * 4.1, hr], [HP, 0, 0], NO);
        X.add(B, 'gold', GE.sphLo(), trim, [0, hy + hr * 1.18, 0], hr * 0.2, null, NO);
        break;
      case 'halo':
        X.add(B, 'glow', GE.torus(0.08, 24), o.glowCol || 0xfff2a8, [0, hy + hr * 1.55, -hr * 0.2], [hr * 1.9, hr * 1.9, hr], [HP - 0.25, 0, 0], NO);
        break;
      case 'horns':
        for (const sg of [-1, 1]) { X.add(B, 'bone', GE.spike(), o.horn || 0x2a2228, [sg * hr * 0.6, hy + hr * 0.7, -hr * 0.1], [hr * 0.35, hr * 0.9, hr * 0.35], [-0.4, 0, -sg * 0.5]); X.add(B, 'bone', GE.spike(), o.horn || 0x2a2228, [sg * hr * 0.95, hy + hr * 1.35, -hr * 0.45], [hr * 0.22, hr * 0.7, hr * 0.22], [-1.0, 0, -sg * 0.15]); }
        break;
    }
    // masques (en plus de la coiffe)
    if (o.mask) P.mask(X, o.mask, o.maskCol);
    if (o.halo && style !== 'halo') P.head(X, 'halo', { glowCol: o.haloCol });
  };

  /** masque : cloth (bas du visage) | metal (demi-masque) | bone (crâne) | full (sans visage) */
  P.mask = function (X, kind, col) {
    const m = X.m, k = X.k, c = X.c, B = 'head';
    // tête réelle d'A2 : ellipsoïde centre (0, 0.205, -0.008), rayons (0.148, 0.19, 0.172) × hs ; yeux y 0.205 ; nez z ≈ 0.19 ; bouche y 0.075 ; menton y 0.03
    const hs = m.headR / 0.172;
    const CY = 0.205 * hs, CZ = -0.008 * hs, RX = 0.148 * hs, RY = 0.19 * hs, RZ = 0.172 * hs;
    const e = (y) => Math.sqrt(Math.max(0.05, 1 - Math.pow((y - CY) / RY, 2)));
    const gap = 0.012 * hs;
    /** bande qui épouse le visage entre y0 (bas) et y1 (haut), arc frontal span */
    const band = (layer, color, y0, y1, span, bulge, o) => {
      const eb = e(y0), et = e(y1);
      // le visage (nez, lèvres, pommettes) dépasse l'ellipsoïde vers l'avant : profondeur = 1,6 × largeur, centre reculé
      const rxt = RX * et + gap, rxb = Math.max(RX * eb + gap, rxt * 0.9), zr = o && o.zr || 1.5;
      X.add(B, layer, GE.shell({ span, rt: rxt / rxb, rm: bulge || null, th: 0.06, n: 16 }), color, [0, (y0 + y1) / 2, CZ - 0.01 * hs], [rxb * 2, y1 - y0, rxb * 2 * zr], null, o);
    };
    if (kind === 'cloth' || kind === 'filter') {
      const cc = col || c.mainD;
      // du dessous des yeux (y 0.172) jusque sous le menton, enveloppe la mâchoire ; arête du nez
      band('cloth2', cc, -0.005 * hs, 0.17 * hs, 3.8, 1.04, { outline: true });
            // plis horizontaux légers
      
      if (kind === 'filter') for (const sg of [-1, 1]) X.add(B, 'metal', GE.cyl(8), c.metalD, [sg * 0.075 * hs, 0.07 * hs, 0.14 * hs], [0.05 * hs, 0.035 * hs, 0.05 * hs], [HP, sg * 0.6, 0]);
    } else if (kind === 'metal') {
      band('metal', col || c.metal, 0.02 * hs, 0.168 * hs, 3.0, null, { outline: true });
      X.add(B, 'metal', GE.box(), shade(col || c.metal, 0.15), [0, 0.1 * hs, 0.185 * hs], [0.012 * hs, 0.12 * hs, 0.014 * hs], [-0.2, 0, 0], NO);
      for (const sg of [-1, 1]) X.add(B, 'metal', GE.spike(), shade(col || c.metal, -0.1), [sg * 0.05 * hs, 0.04 * hs, 0.15 * hs], [0.018 * hs, 0.05 * hs, 0.018 * hs], [PI, 0, 0], NO);
    } else if (kind === 'full' || kind === 'porcelain' || kind === 'gold' || kind === 'bone') {
      const L = kind === 'gold' ? 'gold' : kind === 'full' ? 'metal' : 'bone';
      const cc = col || (kind === 'full' ? 0x15121c : kind === 'bone' ? c.bone : 0xf4f0ea);
      band(L, cc, 0.02 * hs, 0.275 * hs, 2.5, 1.08, { outline: true });
      // fentes des yeux (sur la surface du masque, devant les yeux réels)
      for (const sg of [-1, 1]) X.add(B, 'eye', GE.sphLo(), kind === 'full' ? c.glow : 0x0a0a10, [sg * 0.056 * hs, 0.205 * hs, (RZ * e(0.205 * hs) + gap) * 1.0 + CZ + 0.012 * hs], [0.05 * hs, 0.018 * hs, 0.012 * hs], [0, 0, sg * 0.15], NO);
      if (kind === 'porcelain') X.add(B, 'glow', GE.box(), c.glow, [0.056 * hs, 0.15 * hs, 0.185 * hs], [0.006 * hs, 0.06 * hs, 0.006 * hs], null, NO);
      if (kind === 'bone') X.add(B, 'bone', GE.box(), shade(cc, -0.2), [0, 0.07 * hs, 0.175 * hs], [0.07 * hs, 0.006 * hs, 0.01 * hs], null, NO);
    } else if (kind === 'beak') {
      // masque de peste : haut du visage (yeux cerclés de verres lumineux) + long bec d'os ; la bouche et le menton restent visibles
      const bc = col || shade(c.bone, -0.12);
      band('bone', bc, 0.16 * hs, 0.27 * hs, 2.4, 1.06, { outline: true });
      for (const sg of [-1, 1]) {
        X.add(B, 'metal', GE.torus(0.3, 10), c.metalD, [sg * 0.056 * hs, 0.205 * hs, (RZ * e(0.205 * hs) + gap) + CZ + 0.02 * hs], [0.034 * hs, 0.034 * hs, 0.02 * hs], null, NO);
        X.add(B, 'glow', GE.sphLo(), c.glow, [sg * 0.056 * hs, 0.205 * hs, (RZ * e(0.205 * hs) + gap) + CZ + 0.024 * hs], [0.026 * hs, 0.026 * hs, 0.01 * hs], null, NO);
      }
      X.add(B, 'bone', GE.cone(8), bc, [0, 0.15 * hs, (RZ * e(0.15 * hs) + gap) + CZ + 0.12 * hs], [0.05 * hs, 0.26 * hs, 0.045 * hs], [-1.1, 0, 0]);
    }
  };

  /** bandoulière (diagonale sur le torse) avec lames/fioles/flèches */
  P.bandolier = function (X, items, col, dir) {
    const m = X.m, k = X.k, c = X.c, d = dir || 1;
    const ang = 0.75 * d;
    X.add('chest', 'leather', GE.shell({ rt: 1.0, th: 0.1, n: 18 }), col || c.leatherD, [0, m.neckY * 0.48, 0], [m.chW * 2.42, 0.05 * k, m.chD * 2.55], [0, 0, ang]);
    const n = items === 'knives' ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) * 0.32;
      const lx = Math.sin(t) * m.chW * 1.2, lz = Math.cos(t) * m.chD * 1.25;
      const x = lx * Math.cos(ang), y = m.neckY * 0.48 + lx * Math.sin(ang);
      X.add('chest', 'leather', GE.box(), c.leather, [x, y, lz + 0.004 * k], [0.04 * k, 0.06 * k, 0.012 * k], [0, t, ang]);
      if (items === 'knives') {
        X.add('chest', 'metal', GE.box(), c.metalL, [x - Math.sin(ang) * 0.06 * k, y + Math.cos(ang) * 0.06 * k, lz + 0.01 * k], [0.022 * k, 0.11 * k, 0.006 * k], [0, t, ang], NO);
        X.add('chest', 'leather', GE.cyl(6), 0x2a1a12, [x + Math.sin(ang) * 0.03 * k, y - Math.cos(ang) * 0.03 * k, lz + 0.01 * k], [0.014 * k, 0.05 * k, 0.014 * k], [0, t, ang], NO);
      } else if (items === 'vials') {
        X.add('chest', 'trans', GE.vial(), i % 2 ? 0x39e08c : c.gem, [x, y + 0.035 * k, lz + 0.014 * k], [0.035 * k, 0.075 * k, 0.035 * k], [0, t, ang], NO);
      } else if (items === 'skulls') {
        X.add('chest', 'bone', GE.sph(), c.bone, [x, y, lz + 0.02 * k], [0.05 * k, 0.05 * k, 0.045 * k], [0, t, ang]);
      }
    }
  };

  /** ailes dans le dos (os back) : plumes en éventail */
  P.wings = function (X, col, opt) {
    const m = X.m, k = X.k, o = opt || {};
    const bone = X.R.bones.back ? 'back' : 'chest';
    const base = bone === 'back' ? [0, 0, -0.02 * k] : [0, m.neckY * 0.65, -m.chD * 1.1];
    for (const [, sg] of SIDES) for (let i = 0; i < 6; i++) {
      const a = 0.35 + i * 0.22, len = (0.55 - Math.abs(i - 1.5) * 0.06) * k * (o.size || 1);
      X.add(bone, o.layer || 'cloth2', GE.panel({ cv: 0.1, fl: 0.35, th: 0.06, n: 3, tip: 0.15 }), shade(col, -0.04 * i),
        [base[0] + sg * (0.08 + 0.05 * i) * k, base[1] + 0.12 * k - 0.04 * k * i, base[2] - 0.04 * k - 0.006 * k * i], [0.16 * k, len, 0.16 * k], [0.2, PI, sg * (PI - a)], NO);
    }
  };

  /** éclats/cristaux décoratifs autour (os back), ex. élémentaliste */
  P.backShards = function (X, col, n) {
    const k = X.k, bone = X.R.bones.back ? 'back' : 'chest', m = X.m;
    const base = bone === 'back' ? [0, 0, -0.08 * k] : [0, m.neckY * 0.6, -m.chD * 1.4];
    for (let i = 0; i < (n || 3); i++) { const a = (i - ((n || 3) - 1) / 2) * 0.6; X.add(bone, 'trans', GE.octa(), i % 2 ? col : shade(col, 0.35), [base[0] + Math.sin(a) * 0.22 * k, base[1] + 0.12 * k + Math.cos(a) * 0.12 * k, base[2]], [0.06 * k, (0.2 + 0.05 * (i % 2)) * k, 0.06 * k], [0, 0, -a * 0.6]); }
  };

  // =================================================================
  //  RECETTES PAR CLASSE (base + skins)
  // =================================================================
  // champs : torso, legs, skirt, pauldron, arms, hands, boots, belt, items, cape, collar, head, mask, extras, emblem
  const RECIPES = {
    Guerrier: {
      _base: { weight: 'heavy', torso: 'plate', legs: 'plate', skirt: 'tabard', tassets: true, pauldron: 'round', arms: 'plate', hands: 'gauntlet', boots: 'sabaton', belt: 'leather', items: ['pouch', 'vialR'], cape: 'short', collar: null, head: 'none', emblem: 'lion' },
      acier: {},
      foret: { pauldron: 'leaf', collar: 'fur', cape: 'fur', emblem: 'leaf', head: 'circlet', headOpt: { gem: 0x7dffb0 }, items: ['pouch', 'vialG', 'knife'] },
      carmin: { pauldron: 'spiked', head: 'halfHelm', cape: 'tattered', emblem: 'flame', items: ['pouch', 'vialR', 'vialR'] },
      ebene: { pauldron: 'spiked', pauldronSize: 1.15, head: 'helmHorned', headOpt: { horn: 0x1a1a22 }, cape: 'tattered', skirt: 'tabard', tabardJag: 0.12, emblem: 'skull', collar: 'gorget' },
      aurore: { pauldron: 'crystal', collar: 'fur', head: 'helmWinged', headOpt: { wingLayer: 'metal' }, cape: 'fur', emblem: 'snow' },
      dore: { pauldron: 'lion', goldTrim: true, head: 'helmCrest', cape: 'royal', emblem: 'lion', belt: 'plate', armsTrim: true },
      souverain: { pauldron: 'winged', pauldronSize: 1.15, goldTrim: true, head: 'crown', cape: 'double', emblem: 'crown', belt: 'plate', armsTrim: true, extras: ['halo'] },
    },
    Paladin: {
      _base: { weight: 'heavy', torso: 'plateOrnate', legs: 'plate', skirt: 'tabard', tassets: true, pauldron: 'tiered', arms: 'plate', hands: 'gauntlet', boots: 'sabaton', belt: 'plate', items: ['book', 'pouch'], cape: 'long', head: 'none', emblem: 'sun', goldTrim: true },
      azur: {},
      pourpre: { pauldron: 'spiked', emblem: 'cross', head: 'circlet' },
      emeraude: { head: 'leafCrown', pauldron: 'round', emblem: 'leaf', collar: 'mantle' },
      ecarlate: { head: 'helmGreat', headOpt: { emblem: 'cross' }, emblem: 'cross', cape: 'tattered', pauldron: 'round' },
      aube: { head: 'diadem', pauldron: 'winged', emblem: 'sun', extras: ['halo'], cape: 'royal' },
      obsidienne: { head: 'helmHorned', headOpt: { horn: 0x2a1a1a, visor: 'great' }, pauldron: 'spiked', pauldronSize: 1.15, emblem: 'flame', cape: 'tattered' },
      seraphin: { head: 'crown', pauldron: 'winged', pauldronSize: 1.18, emblem: 'sun', cape: 'double', extras: ['wings', 'halo'] },
    },
    Archer: {
      _base: { weight: 'medium', torso: 'brigandine', legs: 'leather', skirt: 'coat', pauldron: 'leather', pauldronSide: 'R', arms: 'bracerL', hands: 'fingerless', boots: 'tall', belt: 'leather', items: ['pouch', 'knife', 'pouch'], cape: 'short', head: 'hood', collar: null },
      sylve: {},
      automne: { collar: 'leaf', pauldron: 'leaf', pauldronSide: 'both', cape: 'tattered', head: 'none' },
      pervenche: { head: 'tricorn', headOpt: { plume: 0xffffff }, cape: 'half', pauldron: 'leather' },
      nuit: { head: 'cowl', mask: 'cloth', cape: 'long', pauldron: 'plateSmall' },
      braise: { head: 'bandana', collar: 'scarf', pauldron: 'fur', cape: 'half', items: ['pouch', 'vialR', 'knife'] },
      emeraude: { head: 'leafCrown', headOpt: { antlers: true }, cape: 'long', pauldron: 'leaf', pauldronSide: 'both', goldTrim: true, collar: 'leaf' },
      argent: { head: 'circlet', pauldron: 'winged', pauldronSide: 'both', pauldronSize: 0.9, torso: 'plateLight', cape: 'double', extras: ['wingsSmall'] },
    },
    Voleur: {
      _base: { weight: 'light', torso: 'jerkin', legs: 'leather', skirt: 'none', pauldron: 'leather', pauldronSide: 'L', arms: 'bracer', hands: 'fingerless', boots: 'boot', belt: 'leather', items: ['pouch', 'coin', 'vial', 'knife'], cape: 'short', head: 'hood', collar: 'scarf', extras: ['bandolierKnives'] },
      vert: {},
      nuit: { mask: 'cloth', head: 'cowl', cape: 'long' },
      rouille: { head: 'bandana', headOpt: { goggles: true }, cape: 'none', collar: 'scarf', extras: ['bandolierKnives', 'bandolierKnives2'] },
      poison: { extras: ['bandolierVials'], items: ['vialG', 'vialG', 'pouch', 'vialG'], head: 'hood', mask: 'cloth', cape: 'tattered' },
      ombre: { head: 'hoodTall', collar: 'scarf', cape: 'tattered', mask: 'metal' },
      jade: { head: 'tricorn', cape: 'royal', goldTrim: true, items: ['coin', 'coin', 'pouch', 'knife'], extras: ['bandolierKnives', 'chains'] },
      spectre: { head: 'hoodTall', mask: 'full', cape: 'energy', collar: 'scarf' },
    },
    Assassin: {
      _base: { weight: 'light', torso: 'wrapped', legs: 'leather', skirt: 'sashTails', pauldron: 'plateSmall', pauldronSide: 'L', arms: 'wrap', hands: 'glove', boots: 'wrap', belt: 'sash', items: ['vialR', 'knife'], cape: 'none', head: 'hood', mask: 'cloth', collar: null },
      nuit: {},
      cendre: { head: 'cowl', mask: 'metal', cape: 'tattered' },
      sang: { head: 'hood', headOpt: { horns: true }, mask: 'cloth', pauldron: 'spiked', items: ['vialR', 'vialR', 'knife'] },
      jade: { head: 'kasa', mask: 'cloth', pauldron: 'leaf', cape: 'half' },
      foudre: { head: 'hoodTall', mask: 'metal', pauldron: 'spiked', cape: 'tattered' },
      neige: { head: 'hood', collar: 'fur', cape: 'fur', mask: 'cloth', pauldron: 'fur' },
      neant: { head: 'thornCrown', mask: 'full', cape: 'energy', pauldron: 'spiked', pauldronSide: 'both' },
    },
    Mage: {
      _base: { weight: 'robe', torso: 'robe', robeLen: 1, legs: 'robe', skirt: 'none', pauldron: null, arms: 'robeSleeve', hands: 'none', boots: 'soft', belt: 'sash', items: ['book', 'scroll', 'vial'], cape: 'none', head: 'hat', collar: 'mantle' },
      violet: {},
      azur: { head: 'hood', collar: 'mantle', items: ['scroll', 'scroll', 'vial'] },
      rubis: { head: 'circlet', collar: 'high', cape: 'short' },
      sylve: { head: 'leafCrown', headOpt: { antlers: true }, collar: 'leaf', items: ['vialG', 'pouch', 'scroll'], robeJag: 0.08 },
      cendres: { head: 'hoodTall', collar: 'cowl', cape: 'tattered', robeJag: 0.12, items: ['vialR', 'book'] },
      astral: { head: 'hatTall', headOpt: { stars: true }, cape: 'long', capeEmblem: 'moon', collar: 'high' },
      archimage: { head: 'hatTall', headOpt: { stars: true }, pauldron: 'winged', pauldronSize: 0.85, pauldronSide: 'both', cape: 'royal', collar: 'high', goldTrim: true, extras: ['halo'] },
    },
    Elementaliste: {
      _base: { weight: 'robe', torso: 'robe', robeLen: 0.62, legs: 'leather', skirt: 'none', pauldron: 'crystal', pauldronSide: 'L', arms: 'crystal', hands: 'glove', boots: 'tall', belt: 'sash', items: ['crystal', 'pouch'], cape: 'half', head: 'circlet', collar: null },
      marine: {},
      braise: { head: 'hood', collar: 'scarf', cape: 'tattered', items: ['vialR', 'crystal'] },
      sylve: { head: 'leafCrown', collar: 'leaf', pauldron: 'leaf', cape: 'short' },
      tempete: { head: 'hoodTall', pauldron: 'spiked', cape: 'tattered', extras: ['shards'] },
      glacier: { head: 'iceCrown', collar: 'crystal', pauldronSide: 'both', cape: 'fur' },
      prisme: { head: 'diadem', collar: 'crystal', pauldronSide: 'both', cape: 'long', extras: ['shards'] },
      cataclysme: { head: 'horns', collar: 'crystal', pauldronSide: 'both', pauldronSize: 1.2, cape: 'energy', extras: ['shards', 'halo'] },
    },
    Necromancien: {
      _base: { weight: 'robe', torso: 'robe', robeLen: 1, robeJag: 0.1, legs: 'robe', skirt: 'none', pauldron: 'bone', pauldronSide: 'both', arms: 'bone', hands: 'glove', boots: 'soft', belt: 'rope', items: ['skull', 'book', 'vialG'], cape: 'tattered', head: 'cowl', collar: 'bone' },
      violet: {},
      vert: { mask: 'bone', head: 'hood', items: ['skull', 'vialG', 'vialG'] },
      sang: { head: 'cowl', headOpt: { horns: true }, extras: ['bandolierSkulls'], items: ['vialR', 'skull'] },
      glace: { head: 'iceCrown', collar: 'crystal', cape: 'long' },
      or: { head: 'skullCrown', goldTrim: true, belt: 'plate', cape: 'royal', collar: 'bone' },
      roi: { head: 'crown', mask: 'bone', cape: 'double', collar: 'bone', goldTrim: true, extras: ['halo'], pauldronSize: 1.2 },
    },
  };

  /** traduction des pièces de G.HeroDefs (A1 : slots → ids) vers les champs de recette A4 */
  const A1MAP = {
    torso: { 'plate-cuirass': 'plate', 'chased-silver-cuirass': 'plateLight', brigandine: 'brigandine', 'boiled-leather-cuirass': 'leatherCuirass',
      'studded-jerkin': 'jerkin', 'long-vest': 'jerkin', bodysuit: 'bodysuit', 'lamellar-lacquer': 'lamellar', 'corset-laced': 'robe' },
    pauldron: { 'pauldron-lames': 'tiered', 'pauldron-disc': 'round', 'pauldron-boiled-leather': 'leather', 'pauldron-lacquer': 'lacquer', 'ice-crystal-pauldron': 'crystal',
      'copper-coil-pauldron': 'coil', 'frost-leaf-pauldron': 'leaf', 'wood-copper-pauldron': 'leaf', 'bone-pauldron': 'bone', 'pauldron-feather': 'winged' },
    head: { 'wizard-hat': 'hat', 'hood-scholar': 'hood', 'great-helm-t': 'helmGreat', 'laurel-crown': 'laurel', 'crown-helm-blades': 'crownHelm', 'hood-soft': 'hood',
      bandana: 'bandana', 'hood-tight': 'hoodTight', 'wide-hat-plume': 'tricorn', 'hood-mist': 'hoodTall', 'hood-up': 'hood', 'antler-diadem': 'antlerCrown',
      'crown-mask-silver': 'circlet', 'bascinet-open': 'bascinet', 'leaf-crown-gold': 'laurel', 'great-helm-crest': 'helmCrestGreat', 'ice-crown': 'iceCrown',
      'crescent-diadem': 'diadem', 'rune-ring-crown': 'circlet', 'antler-leaf-crown': 'antlerCrown', 'deep-hood-bone-crown': 'deepHood', 'deep-hood-ice-crown': 'deepHoodIce' },
    mask: { 'cloth-mask': 'cloth', 'cloth-mask-down': 'down', 'filter-mask': 'filter', 'porcelain-mask': 'porcelain', 'jade-fang-mask': 'metal', 'frost-mask': 'metal',
      'void-mask': 'full', 'beak-mask-bone': 'beak', 'death-mask-gold': 'gold' },
    cape: { 'cape-short': 'short', 'cape-hooded': 'short', 'cape-long': 'long', 'cape-long-torn': 'tattered', 'cape-fur': 'fur', 'cape-energy': 'energy', 'capelet-hooded': 'capelet',
      'leaf-mantle-hooded': 'leafMantle', 'cape-living-leaves': 'leafLong', 'wings-energy': 'wingsEnergy', 'wings-light-4': 'wingsLight', 'cape-starry': 'long', 'cape-ash': 'tattered',
      'cape-tattered-trailing': 'trailing' },
    boots: { 'boots-sabaton': 'sabaton', sabatons: 'sabaton', 'soft-boots-cuffed': 'boot', 'soft-boots': 'soft', 'soft-boots-thin': 'wrap', 'tall-boots-cuffed': 'tall', 'tall-laced-boots': 'tallLaced', 'pointed-boots': 'pointed' },
    collar: { gorget: 'gorget', 'fur-collar': 'fur', 'high-collar': 'high', 'leaf-collar': 'leaf', 'feather-collar': 'feather' },
    belt: { 'wide-belt': 'wide', 'ivy-belt': 'leather', 'double-belt': 'double', 'low-belt': 'leather', 'sash-long': 'sash', 'rope-belt': 'rope', 'belt-white': 'plate', belt: 'leather', 'wide-belt-twin-crystals': 'wide' },
  };
  function fromA1(spec, r) {
    const pc = (spec.outfit && spec.outfit.pieces) || {};
    const hd = spec.head || {};
    const id = (slot) => (pc[slot] && pc[slot].id) || null;
    const o = {};
    if (!Object.keys(pc).length && !hd.headgear && !hd.mask) return o;
    const w = spec.outfit && spec.outfit.armorWeight;
    const t = id('torso'), og = id('overgarment'), tu = id('torsoUnder');
    if (t && A1MAP.torso[t]) o.torso = A1MAP.torso[t];
    // robes / manteaux
    if (og === 'long-robe-split' || tu === 'robe-floor-tattered' || og === 'surplice-long-tails') { o.torso = 'robe'; o.weight = 'robe'; o.legs = 'robe'; o.robeLen = 1; if (og === 'surplice-long-tails' || tu === 'robe-floor-tattered') { o.robeJag = 0.12; o.surplice = true; } }
    if (og === 'long-coat-open-4tails' || og === 'fur-coat-4tails') { o.torso = 'coat4'; o.weight = 'medium'; o.fur4 = og === 'fur-coat-4tails'; }
    if (og === 'long-coat') o.skirt = 'longCoat';
    if (og === 'tabard' || og === 'tabard-long') { o.skirt = 'tabard'; o.tabardLen = og === 'tabard-long' ? 0.95 : 0.62; }
    // épaulières par côté
    for (const s of ['L', 'R']) { const pid = id('pauldron' + s); o['p' + s] = pid ? (A1MAP.pauldron[pid] || 'round') : null; }
    // bras / mains
    const bl = id('bracerL'), br = id('bracerR'), sl = id('sleeves');
    const armOf = (x) => (x === 'vambrace' ? 'plate' : x === 'laced-bracer' ? 'bracer' : x === 'archer-bracer' ? 'bracer' : x === 'copper-bracelets' ? 'coil' : null);
    o.armL = armOf(bl); o.armR = armOf(br);
    if (sl === 'arm-wraps' || sl === 'bandages-stained') { o.armL = o.armL || 'wrap'; o.armR = o.armR || 'wrap'; }
    if (sl === 'flared-sleeves' || sl === 'wide-tattered-sleeves') { o.arms = 'robeSleeve'; o.sleeveJag = sl === 'wide-tattered-sleeves' ? 0.12 : 0; }
    if (sl === 'frost-sleeve') o.sleeveL = 'frost';
    if (sl === 'mail-sleeve') o.mailSleeves = true;
    const gl = id('gloves');
    if (gl) o.hands = /gauntlet/.test(gl) ? (gl === 'gauntlet-claw' ? 'claw' : 'gauntlet') : /fingerless/.test(gl) ? 'fingerless' : 'glove';
    // jambes
    const lg = id('legs'), gr = id('greaves'), kn = id('knees');
    if (lg && o.legs !== 'robe') o.legs = lg === 'wide-pants-gathered' ? 'wide' : 'pants';
    if (gr === 'greaves' || (w === 'heavy' && !gr && o.legs !== 'robe')) o.greaves = 'plate';
    else if (gr === 'greaves-leather') o.greaves = 'leather';
    else if (gr === 'shin-guards') o.greaves = 'shin';
    if (kn) o.knees = /poleyn/.test(kn) ? (kn === 'poleyn-winged' ? 'poleynWinged' : 'poleyn') : 'leather';
    if (id('mail')) o.mail = true;
    if (id('boots')) o.boots = A1MAP.boots[id('boots')] || 'boot';
    const sk = id('skirt');
    if (sk === 'tassets') o.tassets = true;
    if (sk === 'leather-tassets-split') o.skirt = 'coat';
    if (id('belt')) o.belt = A1MAP.belt[id('belt')] || 'leather';
    // ceinture : accessoires
    const items = [];
    const hipL = id('hipL'), hipR = id('hipR'), bi = id('beltItems');
    const itemOf = (x) => ({ 'belt-dagger': 'knife', 'war-horn': 'horn', pouch: 'pouch', pouches: 'pouch', vials: 'vial', 'grimoire-chained': 'book', 'oath-book-chained': 'book', 'hunting-horn': 'horn',
      'hunting-knife': 'knife', satchel: 'pouch', 'needle-holster': 'knife', 'veil-vial': null, phylactery: null, 'mini-skulls': 'skull', 'skull-relic': 'skull', 'censer-smoking': 'censer',
      'grapple-hook': 'hook', 'cutlass-sheathed': 'cutlass', 'broken-chains': 'chain' })[x];
    for (const x of [hipL, hipR, bi]) { const it = x && itemOf(x); if (it) items.push(it); }
    if (bi === 'vials') items.push('vialG', 'vialG');
    if (bi === 'pouches') items.push('coin');
    if (items.length) o.items = items;
    const cp = id('cape');
    if (cp) o.cape = A1MAP.cape[cp] || 'short'; else if (Object.keys(pc).length) o.cape = 'none';
    if (cp === 'cape-starry') o.capeEmblem = 'moon';
    const co = id('collar');
    if (co) o.collar = A1MAP.collar[co] || co; else if (Object.keys(pc).length && !/robe/.test(o.torso || '')) o.collar = null;
    const sc = id('scarf');
    if (sc === 'scarf-knotted' && !o.collar) o.collar = 'scarf';
    if (sc === 'stole') o.stole = true;
    if (id('bandolier')) o.bandolier = true;
    if (id('emblem')) o.emblem = ({ tower: 'tower', 'oak-leaf': 'leaf', crescent: 'moon', snowflake: 'snow', sunrise: 'sun', crown: 'crown', 'sunrise-repousse': 'sun', 'sun-cross': 'cross' })[id('emblem')] || 'sun';
    // tête
    const hg = hd.headgear && hd.headgear.id;
    o.head = hg ? (A1MAP.head[hg] || 'circlet') : 'none';
    if (hg === 'crown-mask-silver') o.maskA1 = 'metal';
    if (hg === 'rune-ring-crown') o.haloExtra = true;
    const mk = hd.mask && hd.mask.id;
    o.mask = mk ? (A1MAP.mask[mk] || 'cloth') : (o.maskA1 || null);
    if (o.mask === 'down') { o.mask = null; if (!o.collar || o.collar === 'scarf') o.collar = 'scarfDown'; }
    o.weightA1 = w;
    o.hairHidden = hd.hair && hd.hair.style === 'hidden';
    return o;
  }

  /** combine base + skin (A4) + pièces de la spec (A1, traduites) + overrides explicites (pieces.a4) */
  function resolveRecipe(spec) {
    const cls = RECIPES[spec.classId] ? spec.classId : 'Guerrier';
    const tab = RECIPES[cls];
    const out = spec.outfit || {};
    let key = spec.skinId || out.variant || '';
    if (typeof key === 'string' && key.indexOf(':') >= 0) key = key.split(':').pop();
    const sk = (key && tab[key]) || {};
    const r = Object.assign({}, tab._base, sk);
    const a1 = fromA1(spec, r);
    // pièces A1 héritées telles quelles de la base de classe : elles ne doivent pas écraser une pièce exclusive du skin A4
    let a1b = null;
    try { if (key && G.HeroDefs && G.HeroDefs.resolve) { const bs = G.HeroDefs.resolve(spec.classId, {}); if (bs && bs.skinId !== key) a1b = fromA1(bs, Object.assign({}, tab._base)); } } catch (e) { a1b = null; }
    for (const n in a1) {
      if (a1[n] === undefined) continue;
      if (a1b && sk[n] !== undefined && JSON.stringify(a1[n]) === JSON.stringify(a1b[n])) continue;
      r[n] = a1[n];
    }
    // le skin A4 garde la main sur ses pièces exclusives (coiffe / épaulières / cape) quand A1 ne précise rien
    if (sk.head && (!a1.head || a1.head === 'none') && cls !== 'Assassin') r.head = sk.head; // l'Assassin reste tête nue (queue de cheval = signature)
    if (sk.cape && (a1.cape === 'none' || a1.cape == null)) r.cape = sk.cape;
    const pa = (out.pieces && out.pieces.a4) || null;
    if (pa && typeof pa === 'object') Object.assign(r, pa);
    // côtés d'épaulières
    if (r.pL === undefined && r.pR === undefined) {
      const side = r.pauldronSide || 'both';
      r.pL = r.pauldron && (side === 'both' || side === 'L') ? r.pauldron : null;
      r.pR = r.pauldron && (side === 'both' || side === 'R') ? r.pauldron : null;
    } else if (sk.pauldron && sk.pauldron !== tab._base.pauldron) { // skin A4 exclusif : remplace la forme
      if (r.pL) r.pL = sk.pauldron; if (r.pR) r.pR = sk.pauldron;
    }
    if (r.armL === undefined) { r.armL = r.arms === 'bracerL' ? 'bracer' : r.arms; r.armR = r.arms === 'bracerL' ? null : r.arms; }
    // Nécromancien : pas de masque plein (plaque blanche/dorée qui cachait le visage), capuche + couronne pour l'Or noir et le Roi blanc
    if (cls === 'Necromancien') {
      const NF = { vert: { mask: null }, or: { head: 'deepHood', mask: null }, roi: { head: 'deepHood', mask: null } }[key];
      if (NF) Object.assign(r, NF);
    }
    r._key = key; r._cls = cls;
    return r;
  }

  // =================================================================
  //  ASSEMBLAGE
  // =================================================================
  function build(R, spec) {
    if (!R || !R.bones || typeof R.add !== 'function' || !window.THREE) return null;
    spec = spec || {};
    const X = ctx(R, spec);
    const r = resolveRecipe(spec);
    const c = X.c, m = X.m, k = X.k;
    const metal = r.metalCol != null ? hex(r.metalCol) : c.metal;
    const trim = c.trim;
    const heavy = r.weight === 'heavy' || r.weightA1 === 'heavy';
    const robe = r.torso === 'robe';
    const coat4 = r.torso === 'coat4';
    const light = !heavy && !robe && (r.weightA1 === 'light' || r.weight === 'light');

    // ---- sous-couches (toujours : pas de peau nue sous l'armure)
    const under = heavy ? c.cloth2 : robe ? c.mainD : coat4 ? c.cloth2 : light ? c.cloth2 : c.second;
    P.undershirt(X, under, heavy ? 'cloth2' : 'cloth', { quilt: heavy || r.weight === 'medium' });
    if (r.arms === 'robeSleeve') P.sleeves(X, c.main, 'cloth', 'robe');
    else P.sleeves(X, heavy ? c.cloth2 : coat4 ? c.main : light ? c.mainD : c.second, heavy ? 'cloth2' : 'cloth', light ? 'rolled' : 'tight');
    if (r.mailSleeves || (heavy && r.mail)) for (const [s] of SIDES) onSeg(X, 'arm' + s, 'arm', s, 0.0, 0.62, GE.shell({ rt: 0.95, th: 0.1, pl: 10, pa: 0.04, n: 12 }), 'metal', c.metalD, m.armR0 * 1.22, m.armR0 * 1.18, null, [PI, 0, 0]);

    // ---- torse
    if (r.torso === 'plate') {
      if (r.mail) X.add('spine', 'metal', GE.shell({ rt: 1.05, th: 0.12, pl: 16, pa: 0.03, n: 18 }), c.metalD, [0, m.spineLen * 0.3, 0], [m.waW * 2.3, m.spineLen * 0.9, m.waD * 2.4]);
      P.cuirass(X, metal, { goldTrim: !!r.goldTrim, trim: r.goldTrim ? trim : shade(metal, 0.18), lames: 2 });
      if (r.goldTrim || spec.classId === 'Paladin') for (const [, sg] of SIDES) X.add('chest', 'gold', GE.torus(0.12, 12), trim, [sg * m.chW * 0.52, m.neckY * 0.55, m.chD * 1.2], [m.chW * 0.55, m.chW * 0.7, 0.02 * k], [-0.2, sg * 0.45, 0], NO);
      if (r.emblem && r.skirt !== 'tabard') P.emblem(X, 'chest', r.emblem, [0, m.neckY * 0.58, m.chD * 1.3], 0.12 * k, trim, [-0.12, 0, 0]);
    } else if (r.torso === 'plateLight') {
      P.brigandine(X, c.leather, { plateCol: metal, plate: false });
      X.add('chest', 'metal', GE.shell({ span: 2.8, rt: 0.86, rm: 1.08, th: 0.15, n: 14 }), metal, [0, m.neckY * 0.52, 0.01 * k], [m.chW * 2.34, m.neckY * 0.9, m.chD * 2.52]);
      X.add('chest', 'gold', GE.shell({ span: 2.8, th: 0.3, n: 14 }), trim, [0, m.neckY * 0.1, 0.01 * k], [m.chW * 2.38, 0.025 * k, m.chD * 2.56], null, NO);
      for (const [, sg] of SIDES) X.add('chest', 'gold', GE.torus(0.1, 12), trim, [sg * m.chW * 0.45, m.neckY * 0.55, m.chD * 1.2], [m.chW * 0.5, m.chW * 0.65, 0.02 * k], [-0.2, sg * 0.45, 0], NO);
    } else if (r.torso === 'brigandine') P.brigandine(X, c.leather, {});
    else if (r.torso === 'leatherCuirass') {
      // cuir bouilli moulé : plastron galbé + plaques d'abdomen en cuir, coutures
      P.brigandine(X, c.leatherD, { plate: false, rivet: c.trim });
      X.add('chest', 'leather', GE.shell({ span: 3.0, rt: 0.86, rm: 1.1, th: 0.16, n: 14 }), c.leather, [0, m.neckY * 0.55, 0.008 * k], [m.chW * 2.32, m.neckY * 0.82, m.chD * 2.5]);
      for (let i = 0; i < 2; i++) X.add('spine', 'leather', GE.shell({ span: 2.6, rt: 1.04, th: 0.14, n: 12 }), shade(c.leather, -0.06 * i), [0, m.spineLen * (0.72 - i * 0.38), 0.004 * k], [m.waW * 2.36, m.spineLen * 0.46, m.waD * 2.48]);
      P.stitches(X, 'chest', c.stitch, [-m.chW * 0.8, m.neckY * 0.2, m.chD * 1.2], [m.chW * 0.8, m.neckY * 0.2, m.chD * 1.2], 8);
    } else if (r.torso === 'jerkin') P.jerkin(X, c.leather, { button: r.goldTrim ? 0xffd24a : c.metalL });
    else if (r.torso === 'bodysuit') {
      P.jerkin(X, c.main, { collar: false, button: c.metal });
    } else if (r.torso === 'lamellar' || r.torso === 'wrapped') {
      // lamelles laquées (assassin) : rangées de petites plaques + bandes croisées
      P.jerkin(X, c.main, { collar: false, button: c.metal });
      for (let row = 0; row < 3; row++) X.add('chest', 'metal', GE.shell({ span: 2.4, rt: 1.02, th: 0.14, pl: 9, pa: 0.03, n: 18 }), row % 2 ? shade(c.second, -0.1) : c.second, [0, m.neckY * (0.62 - row * 0.2), 0.004 * k * (3 - row)], [m.chW * (2.36 - row * 0.06), m.neckY * 0.22, m.chD * (2.5 - row * 0.05)]);
      for (const d of [1, -1]) X.add('chest', 'cloth2', GE.shell({ rt: 1.0, th: 0.1, n: 16 }), c.cloth2, [0, m.neckY * 0.45, 0], [m.chW * 2.44, 0.035 * k, m.chD * 2.58], [0, 0, d * 0.6], NO);
    } else if (robe) {
      P.robe(X, c.main, { len: r.robeLen || 1, jag: r.robeJag || 0, hem: trim, under: c.second, gap: (r.robeLen || 1) < 0.8 ? 1.0 : 0.7 });
      if (r.surplice) { // surplis à longs pans (nécro) : panneaux déchiquetés devant/derrière
        const SB = legFollow(X, -m.spineLen * 0.85, m.neckY * 0.95 - (m.neckY + m.spineLen + 0.7 * k), 0.8);
        X.add('chest', 'cloth2', GE.panel({ cv: 0.12, fl: 1.0, th: 0.04, n: 5, jag: 0.06 }), c.cloth2 || c.second, [0, m.neckY * 0.95, m.chD * 1.12], [m.chW * 1.0, m.neckY + m.spineLen + 0.55 * k, m.chW], [0.06, 0, 0], { blend: SB });
        X.add('chest', 'cloth2', GE.panel({ cv: 0.12, fl: 1.1, th: 0.04, n: 5, jag: 0.08 }), c.cloth2 || c.second, [0, m.neckY * 0.95, -m.chD * 1.12], [m.chW * 1.1, m.neckY + m.spineLen + 0.7 * k, m.chW * 1.1], [-0.05, PI, 0], { blend: SB });
      }
    } else if (coat4) {
      // manteau ouvert à 4 pans (élémentaliste) : buste ajusté + col haut + 4 pans qui flottent (asymétrique)
      const coat = r.fur4 ? shade(c.main, 0.05) : c.main;
      X.add('chest', 'cloth', GE.shell({ span: 5.2, back: true, rt: 0.82, rm: 1.08, th: 0.16, n: 16 }), coat, [0, m.neckY * 0.48, 0], [m.chW * 2.3, m.neckY * 1.0, m.chD * 2.45]);
      X.add('spine', 'cloth', GE.shell({ span: 5.0, back: true, rt: 1.06, th: 0.16, n: 14 }), coat, [0, m.spineLen * 0.5, 0], [m.waW * 2.32, m.spineLen * 1.1, m.waD * 2.45]);
      for (const [, sg] of SIDES) X.add('chest', 'cloth2', GE.box(), trim, [sg * m.chW * 0.42, m.neckY * 0.5, m.chD * 1.17], [0.03 * k, m.neckY * 0.98, 0.014 * k], [0, sg * 0.3, sg * 0.08], NO);
      P.collar(X, 'high', coat);
      const tl = (m.thighL + m.shinL) * 0.85;
      const tails = [[0.62, 0.3, coat], [-0.62, -0.3, shade(coat, -0.08)], [2.25, 0.0, shade(coat, -0.12)], [-2.25, 0.0, shade(coat, -0.18)]];
      const CB = legFollow(X, 0.1 * k, 0.1 * k - tl, 0.88);
      tails.forEach(([a, tw, col], i) => X.add('hips', 'cloth', GE.panel({ cv: 0.18, fl: 1.25, th: 0.04, n: 4, tip: 0.12 }), col, [Math.sin(a) * m.hiW * 1.12, 0.1 * k, Math.cos(a) * m.hiD * 1.15], [m.hiW * 1.05, tl * (i < 2 ? 0.92 : 1.0), m.hiW * 1.05], [Math.cos(a) * 0.1, a + tw * 0.2, 0], { blend: CB }));
      if (r.fur4) P.collar(X, 'fur', c.fur);
    }

    // ---- bas du corps
    const pantsCol = heavy ? c.cloth2 : r.legs === 'wide' ? c.cloth2 : light ? shade(c.cloth2, -0.1) : shade(c.main, -0.4);
    if (r.legs === 'robe') { P.trousers(X, c.mainD, 'cloth'); P.robeLegs(X, c.main, r.robeLen || 1); }
    else if (r.legs === 'wide') P.trousers(X, pantsCol, 'cloth', { wide: true });
    else P.trousers(X, pantsCol, heavy ? 'cloth2' : 'cloth', { knee: !heavy && (r.knees === 'leather' || !r.knees) && !r.greaves ? c.leather : null });
    if (r.greaves === 'plate' || r.legs === 'plate' || (heavy && r.greaves !== 'leather')) P.legPlates(X, metal, { trim: r.goldTrim ? trim : null, goldTrim: !!r.goldTrim, winged: r.knees === 'poleynWinged' });
    else if (r.greaves === 'leather' || r.greaves === 'shin') P.shinGuards(X, r.greaves === 'shin' ? c.second : c.leather, r.greaves === 'shin' ? 'metal' : 'leather', r.knees);

    // ---- jupe / pans
    if (r.tassets) P.tassets(X, heavy ? metal : c.leather, { mail: !!r.mail || heavy, leather: !heavy });
    if (r.skirt === 'tabard') P.tabard(X, c.main, { emblem: r.emblem, emblemCol: trim, trim, jag: r.tabardJag || 0, len: r.tabardLen || 0.62 });
    else if (r.skirt === 'coat' || r.skirt === 'longCoat') {
      const L = r.skirt === 'longCoat' ? 1.35 : 0.72, col = r.skirt === 'longCoat' ? c.main : shade(c.leather, -0.05), lay = r.skirt === 'longCoat' ? 'cloth' : 'leather';
      for (const [, sg] of SIDES) X.add('hips', lay, GE.panel({ cv: 0.12, fl: 1.1, th: 0.06, n: 4 }), col, [sg * m.hiW * 0.6, 0.06 * k, m.hiD * 0.98], [m.hiW * 0.95, m.thighL * L * 0.85, m.hiW * 0.95], [0.08, sg * 0.4, 0], { blend: legFollow(X, 0.06 * k, 0.06 * k - m.thighL * L, 0.88) });
      for (const [, sg] of SIDES) X.add('hips', lay, GE.panel({ cv: 0.12, fl: 1.1, th: 0.06, n: 4 }), shade(col, -0.1), [sg * m.hiW * 0.5, 0.06 * k, -m.hiD * 0.98], [m.hiW * 1.0, m.thighL * L, m.hiW * 1.0], [-0.08, PI - sg * 0.3, 0], { blend: legFollow(X, 0.06 * k, 0.06 * k - m.thighL * L, 0.88) });
    } else if (r.skirt === 'sashTails') {
      for (const [, sg] of SIDES) X.add('hips', 'cloth2', GE.panel({ cv: 0.1, fl: 0.8, th: 0.06, n: 3, tip: 0.25 }), sg > 0 ? c.second : shade(c.second, -0.15), [sg * m.hiW * 0.4, 0.04 * k, -m.hiD * 1.05], [m.hiW * 0.55, m.thighL * 0.9, m.hiW * 0.55], [-0.1, PI, -sg * 0.08]);
    }

    // ---- ceinture + accessoires
    const beltStyle = r.belt === 'wide' || r.belt === 'double' ? 'leather' : r.belt;
    P.belt(X, beltStyle, r.items, { col: r.belt === 'sash' ? (spec.classId === 'Assassin' ? c.accent : c.second) : r.belt === 'plate' && spec.classId === 'Paladin' ? 0xf4f0e6 : undefined, bigBuckle: !!r.goldTrim || r.belt === 'wide', wide: r.belt === 'wide', double: r.belt === 'double' });
    if (r.sash2 || (spec.classId === 'Assassin' && r.belt === 'sash')) { // deux pans rouges (signature de l'Assassin)
      for (const [, sg] of SIDES) X.add('hips', 'cloth2', GE.panel({ cv: 0.1, fl: 0.9, th: 0.06, n: 3, jag: 0.08 }), sg > 0 ? c.accent : shade(c.accent, -0.2), [sg * m.hiW * 0.35, 0.05 * k, -m.hiD * 1.08], [m.hiW * 0.5, m.thighL * 1.1, m.hiW * 0.5], [-0.12, PI, -sg * 0.1]);
    }

    // ---- épaules (par côté)
    for (const [s, sg] of SIDES) {
      const st = r['p' + s]; if (!st) continue;
      const pcol = st === 'leather' ? c.leather : st === 'fur' ? c.fur : st === 'leaf' ? shade(c.main, 0.05) : st === 'lacquer' ? c.accent : metal;
      P.pauldron(X, s, sg, st, pcol, { size: (r.pauldronSize || 1) * (heavy ? 1.15 : 1), goldTrim: !!r.goldTrim || spec.classId === 'Paladin', trim: r.goldTrim || spec.classId === 'Paladin' ? trim : shade(metal, 0.18) });
    }
    // ---- bras / mains
    for (const [s] of SIDES) {
      const st = r['arm' + s]; if (!st || st === 'robeSleeve') continue;
      P.vambraces(X, st, st === 'plate' ? metal : st === 'crystal' ? metal : c.leather, { side: s, trim: r.goldTrim || spec.classId === 'Paladin' ? trim : null, goldTrim: !!r.goldTrim, wrapCol: c.second });
    }
    if (r.sleeveL === 'frost') X.add('forearmL', 'trans', GE.octa(), c.accent, segPt(X, 'fore', 'L', 0.4, m.foreR0 * 1.2, 0), [m.foreR0 * 0.8, m.foreR0 * 2.4, m.foreR0 * 0.8], [0, 0, 0.3]);
    if (r.hands && r.hands !== 'none') P.gloves(X, r.hands, r.hands === 'gauntlet' || r.hands === 'claw' ? metal : c.leatherD);

    // ---- pieds (les pieds nus d'A2 sont retirés sous des bottes fermées)
    const bs = r.boots === 'tallLaced' ? 'tall' : r.boots === 'pointed' ? 'soft' : r.boots;
    P.boots(X, bs, bs === 'sabaton' ? metal : bs === 'soft' ? (robe ? c.secondD : c.leatherD) : c.leatherD, { wrapCol: c.second, curl: r.boots === 'pointed' || bs === 'soft', laced: r.boots === 'tallLaced' });
    if (typeof R.removeTag === 'function') R.removeTag('foot');

    // ---- col
    if (r.collar && r.collar !== 'gorget') P.collar(X, r.collar === 'scarfDown' ? 'scarf' : r.collar === 'feather' ? 'fur' : r.collar, r.collar === 'fur' ? c.fur : r.collar === 'feather' ? 0x1a1a22 : r.collar === 'leaf' ? shade(c.main, 0.1) : r.collar === 'scarf' || r.collar === 'scarfDown' ? (spec.classId === 'Voleur' ? 0xc8322a : c.second) : c.mainD);
    if (r.stole) for (const [, sg] of SIDES) X.add('chest', 'cloth2', GE.panel({ cv: 0.15, fl: 1.1, th: 0.05, n: 3 }), trim, [sg * m.chW * 0.45, m.neckY * 1.02, m.chD * 1.15], [0.075 * k, m.neckY + m.spineLen + 0.3 * k, 0.075 * k], [0.08, 0, sg * 0.04]);
    if (r.bandolier) { P.bandolier(X, 'knives', c.leatherD, 1); P.bandolier(X, 'knives', c.leatherD, -1); }

    // ---- cape
    const cs = r.cape;
    if (cs && cs !== 'none') {
      const capeCol = r.capeCol != null ? hex(r.capeCol) : c.cape != null ? c.cape : (heavy ? c.main : robe ? c.mainD : shade(c.main, -0.1));
      const map = { capelet: 'short', leafMantle: 'tattered', leafLong: 'long', trailing: 'tattered', wingsEnergy: 'energy', wingsLight: 'energy' };
      const st = map[cs] || cs;
      const eng = st === 'energy';
      if (cs === 'wingsLight' || cs === 'wingsEnergy') P.wings(X, cs === 'wingsLight' ? 0xfffaf0 : shade(c.glow, 0.3), { layer: 'glow', size: cs === 'wingsLight' ? 1.15 : 0.85 });
      else P.cape(X, st, { col: capeCol, lining: c.capeLining != null ? c.capeLining : st === 'royal' ? c.second : shade(capeCol, -0.35), trim, trimLayer: r.goldTrim ? 'gold' : 'cloth2', emblem: r.capeEmblem || (heavy && st !== 'tattered' && !eng ? r.emblem : null), emblemCol: trim, col2: c.second, layer: eng ? 'glow' : 'cape', clasp: r.goldTrim ? trim : c.metalL, claspLayer: r.goldTrim ? 'gold' : 'metal', short: cs === 'capelet' ? 0.6 : 1, leaves: cs === 'leafMantle' || cs === 'leafLong', trail: cs === 'trailing', narrow: cs === 'trailing' });
    }

    // ---- tête (coiffe A1 traduite ou coiffe exclusive du skin A4)
    const hopt = Object.assign({ col: r.head === 'hat' || r.head === 'hatTall' ? c.main : r.head === 'bandana' ? (spec.classId === 'Voleur' ? 0xc8322a : c.second) : shade(c.main, -0.08), metal, trim, goldTrim: !!r.goldTrim || spec.classId === 'Paladin', mask: null }, r.headOpt || {});
    const hm = { laurel: 'leafCrown', antlerCrown: 'leafCrown', bascinet: 'halfHelm', helmCrestGreat: 'helmCrest', crownHelm: 'crown' };
    if (r.head === 'laurel') { hopt.leaf = trim; }
    if (r.head === 'antlerCrown') hopt.antlers = true;
    if (r.head === 'helmCrestGreat') { hopt.visor = 'great'; hopt.plume = c.main; }
    if (r.head === 'bascinet') hopt.winglets = true;
    P.head(X, hm[r.head] || r.head, hopt);
    if (r.head === 'crownHelm') P.head(X, 'halfHelm', hopt);
    if (r.mask) P.mask(X, r.mask, r.mask === 'cloth' || r.mask === 'filter' ? (spec.classId === 'Assassin' ? 0x111114 : c.mainD) : r.mask === 'gold' ? trim : r.mask === 'porcelain' ? 0xf4f0ea : undefined);
    if (r.headOpt && r.headOpt.horns) P.head(X, 'horns', {});

    // ---- extras
    const ex = r.extras || [];
    if (ex.indexOf('chains') >= 0) for (let i = 0; i < 2; i++) X.add('chest', 'gold', GE.torus(0.12, 18), 0xffd24a, [0, m.neckY * (0.7 - i * 0.1), m.chD * 0.4], [m.chW * (1.3 + i * 0.25), m.chD * (1.9 + i * 0.3), m.neckY * 0.5], [HP - 0.5, 0, 0], NO);
    if (ex.indexOf('wings') >= 0 && cs !== 'wingsLight') P.wings(X, 0xfffaf0, { layer: 'cloth2', size: 1.1 });
    if (ex.indexOf('shards') >= 0) P.backShards(X, c.gem, 3);

    X.R._a4 = { recipe: r, tris: X.tris };
    return { tris: X.tris, recipe: r, covers: covers(r) };
  }

  /** ce que couvre la coiffe (pour A2 : cheveux à réduire) */
  function covers(r) {
    const h = r && r.head;
    if (!h || h === 'none' || h === 'halo' || h === 'horns') return { head: null };
    if (/^helm|^halfHelm|bascinet|crownHelm|hood|Hood|cowl|hat|bandana|tricorn|kasa/i.test(h)) return { head: /hood|cowl/i.test(h) ? 'hood' : /halfHelm|bascinet|bandana|crownHelm/.test(h) ? 'top' : 'full' };
    return { head: 'band' };
  }

  G.HeroOutfits = {
    build(R, spec) {
      try { return build(R, spec); } catch (e) { G.HeroOutfits.lastError = (e && e.stack) || String(e); if (window.console) console.error('[HeroOutfits]', e); if (G.HeroOutfits.rethrow) throw e; return null; }
    },
    covers(spec) { try { return covers(resolveRecipe(spec || {})); } catch (e) { return { head: null }; } },
    recipe(spec) { return resolveRecipe(spec || {}); },
    RECIPES,
    util: { hex, shade, mix, GE, cache, MB, alignEuler, composeEuler, measure, palette, ctx, P, onSeg, segPt, NO, SIDES },
  };
})();
