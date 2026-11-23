window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v6 « Incarnation » — js/gfx/heroes/hero-kit.js  (A2, 3D Modeler)
   G.HeroKit : squelette standard, anatomie (corps, tête, visage, mains, coiffures,
   barbes), assembleur (fusion par os/couche, UV à l'échelle, couleurs de sommets,
   contours toon) et contrat userData (voir CONTRACT-V6.md §1).

   API
     const R = G.HeroKit.rig({ classId, scale, body })   // body = spec.body (facultatif)
     R.bones[name] (THREE.Group) ; R.P (proportions, pour ajuster tenues/armures)
     R.bone(name, parent, x, y, z, { rigid })              // os supplémentaire
     R.add(bone, layer, geo, color, pos, scale, rot, o)    // o = { outline, uv, flat, ao, tag, blend }
     R.seg(bone, layer, geo, color, a, b, w, d, o)         // pièce étirée entre deux points
     R.removeTag(tag)                                      // retire les pièces marquées (ex. 'foot' sous des bottes)
     R.fn((t, bones, ud) => {})                            // animation d'ambiance (onBeforeRender)
     R.finish(info) -> root
     G.HeroKit.body(R, spec.body) ; .head(R, spec.head) ; .hands(R, spec.hands) ; .hair(R, style, color) ; .beard(R, style, color)
     G.HeroKit.geo : géométries unitaires partagées (userData.shared = true)

   Assemblage (choix technique, budget ≤ 40 draw calls) :
     - os « souples » (corps, tête, cheveux, cape…) : UNE SkinnedMesh par couche pour tout le héros
       + UNE SkinnedMesh de contour. Poids rigides (1 os) ou fondus aux articulations (o.blend).
       À la pose de liaison, la géométrie est exactement la pose de repos : un rendu qui ignore le
       skinning montre donc le héros correctement au repos.
     - os « rigides » (weaponR/weaponL et descendants, os créés avec {rigid:true}, paires de
       info.glowWeapons et info.weapon) : 1 mesh par (os, couche) + 1 contour par os (comme v3),
       compatibles setHeroWeaponLevel / game.js (ud.blade, ud.glow).
     - G.HeroKit.config.skinning = false → tout en rigide (diagnostic).
   Conventions : L = gauche du personnage = +X ; regard +Z ; pieds en y = 0.
     Mains : la main pend le long de -Y depuis wristL/R, paume vers l'axe du corps, pouce vers +Z.
     weaponR/weaponL : au centre du poing ; axe de l'arme = +Z local (lame vers l'avant), comme v3.
   ===================================================================== */
(() => {
  'use strict';
  const T = window.THREE;
  const G = window.G;
  if (!T) return;

  const PI = Math.PI, HPI = PI / 2, TAU = PI * 2;
  const nowSec = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) / 1000;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const SIDES = [['L', 1], ['R', -1]];

  // ------------------------------------------------------------------
  // Couleurs
  // ------------------------------------------------------------------
  const _ca = new T.Color(), _cb = new T.Color();
  function shade(hex, f) {
    _ca.setHex(hex);
    if (f >= 0) _ca.lerp(_cb.setHex(0xffffff), f); else _ca.multiplyScalar(1 + f);
    return _ca.getHex();
  }
  function mix(a, b, t) { _ca.setHex(a); _cb.setHex(b); _ca.lerp(_cb, t); return _ca.getHex(); }
  function lumOf(hex) { return (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255; }
  function hexOf(v, d) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') {
      const s = v.trim().replace(/^#/, '').replace(/^0x/i, '');
      if (/^[0-9a-f]{6}$/i.test(s)) return parseInt(s, 16);
      if (/^[0-9a-f]{3}$/i.test(s)) return parseInt(s[0] + s[0] + s[1] + s[1] + s[2] + s[2], 16);
    }
    return d;
  }

  // ------------------------------------------------------------------
  // Géométries unitaires partagées
  // ------------------------------------------------------------------
  const META = new WeakMap();            // geo -> { u, v } longueurs unitaires (pour l'échelle des UV)
  const LOWRES = new WeakMap();          // geo -> version basse définition pour le contour
  const shared = (g, u, v, low) => { g.userData.shared = true; META.set(g, { u: u, v: v }); if (low) LOWRES.set(g, low); return g; };

  // révolution maison (enroulement et normales maîtrisés) : prof = [[r, y], ...] du haut vers le bas
  function revolve(prof, segs) {
    const n = prof.length, pos = [], nor = [], uv = [], idx = [];
    // longueur de profil cumulée pour v
    const acc = [0];
    for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    const tot = acc[n - 1] || 1;
    for (let i = 0; i < n; i++) {
      const p0 = prof[Math.max(0, i - 1)], p1 = prof[Math.min(n - 1, i + 1)];
      let dr = p1[0] - p0[0], dy = p1[1] - p0[1];
      // normale du profil (sortante) : (dy', -dr') avec y décroissant → (-dy, dr) orienté vers +r
      let nr = -dy, ny = dr; const L = Math.hypot(nr, ny) || 1; nr /= L; ny /= L;
      if (nr < 0 && prof[i][0] > 1e-4) { nr = -nr; ny = -ny; }
      if (prof[i][0] <= 1e-4) { nr = 0; ny = i === 0 ? 1 : -1; }
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * TAU, s = Math.sin(a), c = Math.cos(a);
        pos.push(prof[i][0] * s, prof[i][1], prof[i][0] * c);
        nor.push(nr * s, ny, nr * c);
        uv.push(j / segs, 1 - acc[i] / tot);
      }
    }
    const W = segs + 1;
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  // profil de membre : rayons relatifs (haut→bas) sur une longueur 1 (y : 0 → -1), extrémités arrondies
  function limbProfile(radii, capTop, capBot) {
    const out = [], n = radii.length;
    const ct = capTop == null ? 0.6 : capTop, cb = capBot == null ? 0.6 : capBot;
    if (ct > 0) for (let k = 0; k <= 2; k++) { const a = k / 3 * HPI; out.push([radii[0] * Math.sin(a), radii[0] * ct * Math.cos(a) * 0.5]); }
    for (let i = 0; i < n; i++) out.push([radii[i], -i / (n - 1)]);
    if (cb > 0) for (let k = 2; k >= 0; k--) { const a = k / 3 * HPI; out.push([radii[n - 1] * Math.sin(a), -1 - radii[n - 1] * cb * Math.cos(a) * 0.5]); }
    return out;
  }
  function limbGeo(radii, segs, ct, cb) {
    const prof = limbProfile(radii, ct, cb);
    const g = revolve(prof, segs);
    const lowR = [];
    for (let i = 0; i < radii.length; i += 2) lowR.push(radii[i]);
    if ((radii.length - 1) % 2) lowR.push(radii[radii.length - 1]);
    const low = revolve(limbProfile(lowR, ct, cb), Math.max(6, segs - 4)); low.userData.shared = true;
    return shared(g, TAU, 1, low);
  }
  // sphère dont le bas est aplati (pieds, semelles, paumes)
  function flatSphere(cut, w, h) {
    const g = new T.SphereGeometry(1, w, h);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < cut) p.setY(i, cut);
    g.computeVertexNormals();
    return g;
  }
  // coque frontale (décalque de visage) : grille (u, v) sur un ellipsoïde unité, u = droite→gauche du perso, v = menton→front
  const FACE_AZ = 2.3, FACE_EL = 1.9, FACE_EL0 = -0.05;
  function faceShell(nu, nv) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= nv; i++) {
      const v = i / nv, el = FACE_EL0 + (v - 0.5) * FACE_EL;
      for (let j = 0; j <= nu; j++) {
        const u = j / nu, az = (u - 0.5) * FACE_AZ;
        const x = Math.sin(az) * Math.cos(el), y = Math.sin(el), z = Math.cos(az) * Math.cos(el);
        pos.push(x, y, z); nor.push(x, y, z); uv.push(u, v);
      }
    }
    const W = nu + 1;
    for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // crâne : sphère unité déformée (mâchoire plus étroite, bas du visage avancé, nuque rentrée) ;
  // les UV de SphereGeometry sont conservées (décalque HeroTex.face : face +Z en u = 0,25, yeux à l'équateur)
  const SKULLS = {};
  function skullGeo(jw) {
    const key = jw.toFixed(2);
    if (SKULLS[key]) return SKULLS[key];
    const g = new T.SphereGeometry(1, 20, 14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = clamp((0.12 - y) / 1.12, 0, 1);           // 0 au-dessus des pommettes, 1 au menton
      const front = clamp(z * 1.4 + 0.3, 0, 1);
      x *= 1 - t * t * (0.42 - 0.22 * (jw - 1)) - 0.06 * t;      // mâchoire qui s'affine vers le menton
      if (y > 0.25) x *= 1 - 0.05 * (y - 0.25);             // tempes
      z += 0.17 * sstep(t * 1.3) * front;                    // bas du visage vers l'avant
      if (z < 0) z *= 1 - 0.3 * t;                           // nuque
      y -= 0.05 * t * front;
      if (z > 0.55 && y > -0.2 && y < 0.35) z -= 0.05 * (z - 0.55) * 4 * (1 - Math.abs(y - 0.07) / 0.28); // face un peu plate
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const low = new T.SphereGeometry(1, 12, 8);
    const lp = low.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      let x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i);
      const t = clamp((0.12 - y) / 1.12, 0, 1), front = clamp(z * 1.4 + 0.3, 0, 1);
      x *= 1 - t * t * (0.42 - 0.22 * (jw - 1)) - 0.06 * t; z += 0.17 * sstep(t * 1.3) * front; if (z < 0) z *= 1 - 0.3 * t; y -= 0.05 * t * front;
      lp.setXYZ(i, x, y, z);
    }
    low.userData.shared = true;
    return (SKULLS[key] = shared(g, TAU, PI, low));
  }
  const SPH_T = shared(new T.SphereGeometry(1, 5, 4), TAU, PI);
  const SPH_XS = shared(new T.SphereGeometry(1, 7, 5), TAU, PI, SPH_T);
  const SPH_LO = shared(new T.SphereGeometry(1, 9, 6), TAU, PI, SPH_XS);
  const GEO = {
    sph: shared(new T.SphereGeometry(1, 13, 9), TAU, PI, SPH_LO),
    sphMid: shared(new T.SphereGeometry(1, 10, 7), TAU, PI, SPH_XS),
    sphT: SPH_T,
    sphLo: SPH_LO,
    sphXs: SPH_XS,
    hemi: shared(new T.SphereGeometry(1, 16, 7, 0, TAU, 0, HPI), TAU, HPI),
    box: shared(new T.BoxGeometry(1, 1, 1), 1, 1),
    cyl: shared(new T.CylinderGeometry(1, 1, 1, 12), TAU, 1),
    cyl8: shared(new T.CylinderGeometry(1, 1, 1, 8), TAU, 1),
    cyl6o: shared(new T.CylinderGeometry(1, 1, 1, 6, 1, true), TAU, 1),
    cone: shared(new T.ConeGeometry(1, 1, 10), TAU, 1),
    cone6: shared(new T.ConeGeometry(1, 1, 6), TAU, 1),
    cone4: shared(new T.ConeGeometry(1, 1, 4), TAU, 1),
    octa: shared(new T.OctahedronGeometry(1, 0), 2, 2),
    ico: shared(new T.IcosahedronGeometry(1, 0), 2, 2),
    foot: shared(flatSphere(-0.45, 12, 9), TAU, PI),
    // lathes (y : 0 → -1, rayon max ≈ 1)
    capsule: limbGeo([1, 1, 1, 1], 12, 1, 1),
    upperArm: limbGeo([0.94, 1.0, 1.0, 0.93, 0.84, 0.8], 10, 0.7, 0.7),
    forearm: limbGeo([0.95, 1.0, 0.95, 0.8, 0.66, 0.6], 10, 0.7, 0.5),
    thigh: limbGeo([1.0, 1.0, 0.94, 0.84, 0.72, 0.66], 10, 0.5, 0.7),
    shin: limbGeo([0.9, 1.0, 1.0, 0.86, 0.66, 0.56, 0.54], 10, 0.7, 0.6),
    neck: limbGeo([0.94, 1.0, 1.08, 1.18], 10, 0, 0),
    // cage thoracique : large en haut (V héroïque), plus étroite à la taille
    chest: shared(revolve([[0, 0.02], [0.55, 0.0], [0.86, -0.05], [0.98, -0.16], [1.0, -0.32], [0.97, -0.5], [0.9, -0.68], [0.82, -0.86], [0.78, -1.0]], 12), TAU, 1),
    abdomen: shared(revolve([[0.9, 0], [0.92, -0.25], [0.96, -0.55], [1.0, -0.8], [0.98, -1.0], [0, -1.02]], 12), TAU, 1),
    lock: limbGeo([0.6, 1.0, 0.8, 0.4, 0.06], 5, 0.4, 0),
    lockLo: limbGeo([0.7, 1.0, 0.5, 0.06], 4, 0.4, 0),
    cap: shared(new T.SphereGeometry(1, 14, 7, 0, TAU, 0, PI * 0.56), TAU, PI * 0.56),
    capLo: shared(new T.SphereGeometry(1, 10, 6, 0, TAU, 0, PI * 0.56), TAU, PI * 0.56),
    face: shared(faceShell(14, 12), 2.3, 1.9),
    beardShell: shared(new T.SphereGeometry(1, 12, 6, 0, PI, PI * 0.5, PI * 0.42), PI, PI * 0.42),
    lidShell: shared(new T.SphereGeometry(1, 10, 4, 0, PI, 0, PI * 0.5), PI, HPI),
    disc: shared(new T.CylinderGeometry(1, 1, 1, 14), TAU, 1),
  };
  // (lidShell : demi-sphère haute orientée vers +Z une fois tournée ; voir head())
  const TOR = {};
  GEO.torus = (tube, arc, seg) => {
    arc = arc == null ? TAU : arc; seg = seg || 16;
    const k = tube + '_' + arc.toFixed(3) + '_' + seg;
    return TOR[k] || (TOR[k] = shared(new T.TorusGeometry(1, tube, 6, seg, arc), arc, TAU * tube));
  };
  const CYLT = {};
  GEO.cylT = (top, seg) => { seg = seg || 12; const k = top.toFixed(3) + '_' + seg; return CYLT[k] || (CYLT[k] = shared(new T.CylinderGeometry(top, 1, 1, seg), TAU, 1)); };
  GEO.limb = (key, radii, segs, ct, cb) => GEO['L_' + key] || (GEO['L_' + key] = limbGeo(radii, segs || 10, ct, cb));
  GEO.revolve = (key, prof, segs) => GEO['R_' + key] || (GEO['R_' + key] = shared(revolve(prof, segs || 12), TAU, 1));

  // ------------------------------------------------------------------
  // Outils de fusion
  // ------------------------------------------------------------------
  const _m4 = new T.Matrix4(), _m4b = new T.Matrix4(), _m4c = new T.Matrix4(), _m3 = new T.Matrix3();
  const _q = new T.Quaternion(), _eu = new T.Euler(), _va = new T.Vector3(), _vb = new T.Vector3(), _col = new T.Color();
  const NI = new WeakMap();
  const FLIP = [0, 2, 1];
  function nonIdx(g) {
    let n = NI.get(g);
    if (!n) {
      n = g.index ? g.toNonIndexed() : g;
      if (!n.attributes.normal) n.computeVertexNormals();
      NI.set(g, n);
    }
    return n;
  }
  function bbox(g) { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox; }
  // proxy de contour : géo basse définition déclarée, sinon décimation par grille (cache par géométrie)
  const PROXY = new WeakMap();
  function outlineGeo(g) {
    const low = LOWRES.get(g) || (g.userData && g.userData.outlineGeo);
    if (low) return low;
    let px = PROXY.get(g);
    if (px) return px;
    px = g;
    try {
      const n = nonIdx(g), pa = n.attributes.position.array, cnt = n.attributes.position.count;
      if (cnt / 3 > 120) {
        const bb = bbox(g), sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
        const M = Math.max(sx, sy, sz) || 1, cell = M / HK.config.proxyCells;
        const cx = Math.max(cell, 1e-6), ids = new Map(), sum = [], vid = new Int32Array(cnt);
        for (let i = 0; i < cnt; i++) {
          const x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2];
          const k = Math.floor((x - bb.min.x) / cx) + ',' + Math.floor((y - bb.min.y) / cx) + ',' + Math.floor((z - bb.min.z) / cx);
          let id = ids.get(k);
          if (id == null) { id = sum.length / 4; ids.set(k, id); sum.push(0, 0, 0, 0); }
          sum[id * 4] += x; sum[id * 4 + 1] += y; sum[id * 4 + 2] += z; sum[id * 4 + 3]++;
          vid[i] = id;
        }
        const out = [], seen = new Set();
        for (let t = 0; t < cnt; t += 3) {
          const a = vid[t], b = vid[t + 1], c = vid[t + 2];
          if (a === b || b === c || a === c) continue;
          const key = a < b ? (a < c ? a + ',' + (b < c ? b + ',' + c : c + ',' + b) : c + ',' + a + ',' + b) : (b < c ? b + ',' + (a < c ? a + ',' + c : c + ',' + a) : c + ',' + b + ',' + a);
          const ori = key + (((b - a) * (c - a)) > 0 ? '' : '');
          if (seen.has(ori + '|' + a + b + c)) continue;
          seen.add(ori + '|' + a + b + c);
          for (const v of [a, b, c]) { const w = sum[v * 4 + 3]; out.push(sum[v * 4] / w, sum[v * 4 + 1] / w, sum[v * 4 + 2] / w); }
        }
        if (out.length / 9 < cnt / 3 * 0.85 && out.length >= 36) {
          px = new T.BufferGeometry();
          px.setAttribute('position', new T.Float32BufferAttribute(out, 3));
          px.boundingBox = bb.clone();
          px.userData.shared = true;
        }
      }
    } catch (e) { px = g; }
    PROXY.set(g, px);
    return px;
  }
  function inflateF(size, s, t) { const S = size * Math.abs(s || 1); return S > 1e-4 ? Math.min(1 + 2 * t / S, 1.6) : 1; }

  // rotation (Euler XYZ) qui aligne +Y sur une direction
  const _up = new T.Vector3(0, 1, 0), _dir = new T.Vector3(), _qq = new T.Quaternion(), _ee = new T.Euler();
  function rotTo(x, y, z) {
    _dir.set(x, y, z);
    if (_dir.lengthSq() < 1e-9) return [0, 0, 0];
    _dir.normalize();
    _qq.setFromUnitVectors(_up, _dir);
    _ee.setFromQuaternion(_qq, 'XYZ');
    return [_ee.x, _ee.y, _ee.z];
  }

  /* Fusion d'une liste de pièces.
     mode : 'solid' | 'outline' ; boneMat(p) → Matrix4 de liaison de l'os de la pièce (ou null = espace de l'os) ;
     skin : { index(boneName) } pour écrire skinIndex/skinWeight */
  function merge(list, mode, thick, boneMat, skin) {
    const outline = mode === 'outline';
    let n = 0;
    for (const p of list) { if (outline && !p.ol) continue; n += nonIdx(outline ? outlineGeo(p.g) : p.g).attributes.position.count; }
    if (!n) return null;
    const pos = new Float32Array(n * 3);
    const nor = outline ? null : new Float32Array(n * 3);
    const col = outline ? null : new Float32Array(n * 3);
    const uv = outline ? null : new Float32Array(n * 2);
    const si = skin ? new Uint16Array(n * 4) : null;
    const sw = skin ? new Float32Array(n * 4) : null;
    let o = 0;
    for (const p of list) {
      if (outline && !p.ol) continue;
      const src = outline ? outlineGeo(p.g) : p.g;
      const g = nonIdx(src);
      const pa = g.attributes.position.array, na = g.attributes.normal ? g.attributes.normal.array : null;
      const ua = g.attributes.uv ? g.attributes.uv.array : null;
      const cnt = g.attributes.position.count;
      _eu.set(p.r[0], p.r[1], p.r[2], 'XYZ'); _q.setFromEuler(_eu);
      _m4.compose(_va.set(p.p[0], p.p[1], p.p[2]), _q, _vb.set(p.s[0], p.s[1], p.s[2]));
      if (outline) {
        const bb = bbox(p.g);
        const fx = inflateF(bb.max.x - bb.min.x, p.s[0], thick * p.olk);
        const fy = inflateF(bb.max.y - bb.min.y, p.s[1], thick * p.olk);
        const fz = inflateF(bb.max.z - bb.min.z, p.s[2], thick * p.olk);
        _m4b.makeScale(fx, fy, fz);
        _m4b.setPosition((bb.max.x + bb.min.x) * 0.5 * (1 - fx), (bb.max.y + bb.min.y) * 0.5 * (1 - fy), (bb.max.z + bb.min.z) * 0.5 * (1 - fz));
        _m4.multiply(_m4b);
      }
      // _m4 : pièce → os ; _m4c : pièce → espace de liaison (rig)
      const bm = boneMat ? boneMat(p) : null;
      if (bm) _m4c.multiplyMatrices(bm, _m4); else _m4c.copy(_m4);
      if (!outline) { _m3.getNormalMatrix(_m4c); _col.setHex(p.c); }
      const e = _m4c.elements, m = _m3.elements, eb = _m4.elements;
      const flip = p.s[0] * p.s[1] * p.s[2] < 0;
      // UV à l'échelle de la taille monde (≈ 1 répétition par 0,5 u × densité)
      let su = 1, sv = 1;
      if (!outline) {
        const mt = META.get(p.g) || { u: 1, v: 1 };
        const dens = p.uv == null ? 1 : p.uv;
        if (dens > 0) {
          su = Math.max(0.25, mt.u * (Math.abs(p.s[0]) + Math.abs(p.s[2])) * 0.5 / 0.5 * dens);
          sv = Math.max(0.25, mt.v * Math.abs(p.s[1]) / 0.5 * dens);
        }
      }
      const bi = skin ? skin.index(p.bone) : 0;
      const bl = skin && p.blend ? p.blend : null;
      const blIdx = bl ? bl.map(b => skin.index(b.to)) : null;
      for (let i = 0; i < cnt; i++) {
        const k = flip ? (i - (i % 3)) + FLIP[i % 3] : i;
        const x = pa[k * 3], y = pa[k * 3 + 1], z = pa[k * 3 + 2], j = o * 3;
        pos[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (!outline) {
          let nx = na ? na[k * 3] : 0, ny = na ? na[k * 3 + 1] : 1, nz = na ? na[k * 3 + 2] : 0;
          const X = m[0] * nx + m[3] * ny + m[6] * nz, Y = m[1] * nx + m[4] * ny + m[7] * nz, Z = m[2] * nx + m[5] * ny + m[8] * nz;
          const L = Math.sqrt(X * X + Y * Y + Z * Z) || 1;
          nor[j] = X / L; nor[j + 1] = Y / L; nor[j + 2] = Z / L;
          // occlusion douce : les faces tournées vers le bas sont un peu plus sombres
          const ao = p.ao === false ? 1 : 0.8 + 0.2 * clamp(nor[j + 1] * 0.5 + 0.62, 0, 1);
          col[j] = _col.r * ao; col[j + 1] = _col.g * ao; col[j + 2] = _col.b * ao;
          if (ua) { uv[o * 2] = ua[k * 2] * su; uv[o * 2 + 1] = ua[k * 2 + 1] * sv; }
        }
        if (skin) {
          const q4 = o * 4;
          si[q4] = bi; sw[q4] = 1;
          if (bl) {
            // y dans l'espace de l'os propriétaire
            const ly = eb[1] * x + eb[5] * y + eb[9] * z + eb[13];
            let rest = 1;
            for (let b = 0; b < bl.length && b < 2; b++) {
              const B = bl[b];
              const w = Math.min(B.max != null ? B.max : 0.85, sstep(0.5 + 0.5 * (ly - B.at) / B.range));
              if (w > 0.001) { si[q4 + 1 + b] = blIdx[b]; sw[q4 + 1 + b] = w; rest -= w; }
            }
            sw[q4] = Math.max(0, rest);
          }
        }
        o++;
      }
      if (!outline && p.flat) {
        for (let t = o - cnt; t < o; t += 3) {
          const a = t * 3, b = a + 3, c = a + 6;
          _va.set(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
          _vb.set(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]);
          _va.cross(_vb).normalize();
          for (let q = 0; q < 3; q++) { nor[a + q * 3] = _va.x; nor[a + q * 3 + 1] = _va.y; nor[a + q * 3 + 2] = _va.z; }
        }
      }
    }
    // garde-fou : une pièce mal paramétrée ne doit jamais produire de sommet NaN (bounding sphere / rendu cassés)
    for (let i = 0; i < pos.length; i++) if (!isFinite(pos[i])) pos[i] = 0;
    if (nor) for (let i = 0; i < nor.length; i++) if (!isFinite(nor[i])) nor[i] = 0;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    if (nor) {
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    }
    if (skin) {
      geo.setAttribute('skinIndex', new T.BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    geo.userData.shared = true;
    return geo;
  }

  // ------------------------------------------------------------------
  // Matériaux : G.HeroTex.mat(layer) si présent, sinon repli toon local
  // ------------------------------------------------------------------
  const LAYERS = ['skin', 'cloth', 'cloth2', 'leather', 'metal', 'gold', 'hair', 'eye', 'eyeWhite', 'lip', 'gem', 'glow', 'trans', 'cape', 'fur', 'bone', 'blade', 'face'];
  const FALLBACK = {};
  function toonMat(o) {
    if (G.GFX && G.GFX.toon) return G.GFX.toon(0xffffff, Object.assign({ vertexColors: true }, o));
    const p = { color: 0xffffff, vertexColors: true };
    if (o.emissive != null) { p.emissive = o.emissive; p.emissiveIntensity = o.emissiveIntensity != null ? o.emissiveIntensity : 1; }
    if (o.transparent) { p.transparent = true; p.opacity = o.opacity; }
    if (o.side != null) p.side = o.side;
    if (o.depthWrite != null) p.depthWrite = o.depthWrite;
    return new T.MeshToonMaterial(p);
  }
  function fallbackMat(layer) {
    if (FALLBACK[layer]) return FALLBACK[layer];
    let m;
    switch (layer) {
      case 'glow': m = new T.MeshBasicMaterial({ vertexColors: true }); break;
      case 'trans': m = toonMat({ transparent: true, opacity: 0.6, depthWrite: false }); break;
      case 'cape': m = toonMat({ side: T.DoubleSide }); break;
      case 'eyeWhite': m = toonMat({ emissive: 0x2a2a2a, emissiveIntensity: 1 }); break;
      case 'eye': m = toonMat({ emissive: 0x111111, emissiveIntensity: 1 }); break;
      case 'gem': m = toonMat({ emissive: 0x222222, emissiveIntensity: 1 }); break;
      case 'metal': case 'gold': case 'blade': m = toonMat({ emissive: 0x000000 }); break;
      default: m = toonMat({});
    }
    m.userData.shared = true;
    if (G.HeroRender && typeof G.HeroRender.patchMaterial === 'function') { try { G.HeroRender.patchMaterial(m); } catch (e) { /* ignore */ } }
    return (FALLBACK[layer] = m);
  }
  function baseMat(layer, opts) {
    if (G.HeroTex && typeof G.HeroTex.mat === 'function') {
      try { const m = G.HeroTex.mat(layer, opts); if (m && m.isMaterial) return m; } catch (e) { /* repli */ }
    }
    return fallbackMat(LAYERS.indexOf(layer) >= 0 ? layer : 'cloth');
  }
  function instanceMat(layer, opts) {
    if (G.HeroTex && typeof G.HeroTex.instance === 'function') {
      try { const m = G.HeroTex.instance(layer, opts); if (m && m.isMaterial) { m.userData.shared = false; return m; } } catch (e) { /* repli */ }
    }
    const b = baseMat(layer, opts);
    const c = b.clone();
    c.onBeforeCompile = b.onBeforeCompile;
    if (b.customProgramCacheKey) c.customProgramCacheKey = b.customProgramCacheKey;
    c.userData = Object.assign({}, b.userData, { shared: false });
    return c;
  }
  // variante skinnée (cache par matériau source, partagée)
  const SKV = new WeakMap();
  function skinVariant(m) {
    if (!m) return m;
    let v = SKV.get(m);
    if (v) return v;
    v = m.clone();
    v.skinning = true;
    v.onBeforeCompile = m.onBeforeCompile;
    if (m.customProgramCacheKey) v.customProgramCacheKey = m.customProgramCacheKey;
    v.userData = Object.assign({}, m.userData, { shared: true, skinnedOf: m });
    SKV.set(m, v);
    return v;
  }
  const OUT_MAT = new T.MeshBasicMaterial({ color: 0x0b0a10, side: T.BackSide }); OUT_MAT.userData.shared = true;
  const OUT_SKIN = new T.MeshBasicMaterial({ color: 0x0b0a10, side: T.BackSide }); OUT_SKIN.skinning = true; OUT_SKIN.userData.shared = true;
  const ID4 = new T.Matrix4();

  // ------------------------------------------------------------------
  // Proportions
  // ------------------------------------------------------------------
  const BUILDS = {
    athletic: { sh: 1.0, lw: 1.0, wa: 1.0, ch: 1.0, hip: 1.0, neck: 1.0, h: 1.0, leg: 1.0 },
    heavy: { sh: 1.13, lw: 1.2, wa: 1.16, ch: 1.14, hip: 1.08, neck: 1.22, h: 1.02, leg: 0.98 },
    slim: { sh: 0.9, lw: 0.84, wa: 0.88, ch: 0.9, hip: 0.95, neck: 0.9, h: 0.99, leg: 1.02 },
    lean: { sh: 0.96, lw: 0.9, wa: 0.86, ch: 0.95, hip: 0.94, neck: 0.95, h: 1.0, leg: 1.02 },
    robed: { sh: 0.94, lw: 0.88, wa: 0.92, ch: 0.94, hip: 1.0, neck: 0.95, h: 1.0, leg: 1.0 },
  };
  function isFemale(b) {
    if (!b) return false;
    const s = String(b.sex || b.gender || b.frame || '').toLowerCase();
    return b.female === true || s === 'f' || s === 'female' || s === 'femme' || s === 'feminine' || s === 'féminin' || s === 'w';
  }
  function proportions(b) {
    b = b || {};
    const BA = { massive: 'heavy', sturdy: 'heavy', burly: 'heavy', slender: 'slim', gaunt: 'lean', thin: 'slim' };
    const bname = BUILDS[b.build] ? b.build : BA[b.build] || 'athletic';
    const B = Object.assign({}, BUILDS[bname]);
    if (b.build === 'sturdy') { B.sh = 1.07; B.lw = 1.1; B.wa = 1.1; B.ch = 1.08; }
    if (b.build === 'gaunt') { B.lw *= 0.88; B.wa *= 0.92; B.ch *= 0.94; }
    const fem = isFemale(b);
    if (fem) { B.sh *= 0.87; B.lw *= 0.84; B.wa *= 0.82; B.ch *= 0.9; B.hip *= 1.13; B.neck *= 0.8; B.h *= 0.965; B.leg *= 1.02; }
    const mus = clamp(num(b.muscle, bname === 'heavy' ? 0.8 : bname === 'slim' || bname === 'robed' ? 0.3 : 0.6), 0, 1);
    const k = B.h;
    const P = {
      fem, mus, build: bname, buildName: b.build || bname, B,
      k,
      hipY: 1.02 * k * B.leg,
      legX: 0.098 * B.hip * (fem ? 1.04 : 1),
      thigh: 0.47 * k * B.leg, shin: 0.45 * k * B.leg, ankle: 0.06 * k,
      spineY: 0.11 * k, chestY: 0.25 * k, neckY: 0.275 * k, headY: 0.075 * k,
      shY: 0.205 * k, shX: 0.25 * B.sh * k, upper: 0.30 * k, fore: 0.27 * k, handL: 0.18 * k,
      chestW: 0.19 * B.ch, chestD: 0.125 * (0.9 + 0.2 * mus) * (fem ? 0.95 : 1), waistW: 0.145 * B.wa, waistD: 0.11 * B.wa,
      hipW: 0.165 * B.hip, armR: 0.057 * B.lw * (0.9 + 0.2 * mus), foreR: 0.052 * B.lw * (0.92 + 0.16 * mus),
      thighR: 0.097 * B.lw * (fem ? 1.08 : 1), shinR: 0.066 * B.lw, neckR: 0.068 * B.neck,
      headS: (fem ? 0.97 : 1) * (b.headScale || 1),
    };
    // hauteur totale approx (sommet du crâne)
    P.H = P.hipY + P.spineY + P.chestY + P.neckY + P.headY + 0.395 * P.headS;
    return P;
  }

  // ------------------------------------------------------------------
  // Recorder (squelette + pièces)
  // ------------------------------------------------------------------
  const RIGID_DEFAULT = {};
  class Rig {
    constructor(opts) {
      opts = opts || {};
      this.classId = opts.classId || 'Guerrier';
      this.scale = num(opts.scale, 1);
      this.root = new T.Group(); this.root.name = 'hero6';
      this.rig = new T.Group(); this.rig.name = 'rig'; this.root.add(this.rig);
      this.bones = {}; this.boneList = []; this.parentOf = {}; this.rigidBones = {};
      this.pieces = []; this.fns = []; this.tags = {};
      this.P = proportions(opts.body);
      this._skeleton();
      this._dims();
    }
    bone(name, parent, x, y, z, o) {
      if (this.bones[name]) { this.bones[name].position.set(x || 0, y || 0, z || 0); return this.bones[name]; }
      const g = new T.Group(); g.name = name; g.position.set(x || 0, y || 0, z || 0);
      const par = this.bones[parent] || this.rig;
      par.add(g); this.bones[name] = g; this.boneList.push(name); this.parentOf[name] = this.bones[parent] ? parent : null;
      if ((o && o.rigid) || RIGID_DEFAULT[name] || (this.parentOf[name] && this.rigidBones[this.parentOf[name]])) this.rigidBones[name] = true;
      return g;
    }
    _skeleton() {
      const P = this.P;
      const b = (n, p, x, y, z, o) => this.bone(n, p, x, y, z, o);
      b('hips', null, 0, P.hipY, 0);
      b('spine', 'hips', 0, P.spineY, 0);
      b('chest', 'spine', 0, P.chestY, 0);
      b('neck', 'chest', 0, P.neckY, -0.012);
      b('head', 'neck', 0, P.headY, 0.018);
      const hs = P.headS;
      b('jaw', 'head', 0, 0.115 * hs, 0.02 * hs);
      b('mouth', 'head', 0, 0.075 * hs, 0.158 * hs);
      for (const [s, sx] of SIDES) {
        b('brow' + s, 'head', sx * 0.056 * hs, 0.243 * hs, 0.152 * hs);
        b('lid' + s, 'head', sx * HEAD.eyeX * hs, HEAD.eyeY * hs, HEAD.eyeZ * hs);
      }
      b('hairA', 'head', 0, 0.16 * hs, -0.15 * hs);
      b('hairB', 'hairA', 0, -0.2, -0.03);
      for (const [s, sx] of SIDES) {
        b('shoulder' + s, 'chest', sx * 0.07, P.shY, -0.01);
        b('arm' + s, 'shoulder' + s, sx * (P.shX - 0.07), -0.025, 0);
        b('forearm' + s, 'arm' + s, 0, -P.upper, -0.005);
        b('wrist' + s, 'forearm' + s, 0, -P.fore, 0.005);
        b('weapon' + s, 'wrist' + s, -sx * 0.034, -0.083, 0.0);
        b('leg' + s, 'hips', sx * P.legX, -0.04, 0);
        b('shin' + s, 'leg' + s, 0, -P.thigh, 0);
        b('foot' + s, 'shin' + s, 0, -P.shin, -0.01);
        b('belt' + s, 'hips', sx * 0.17, 0.0, 0.04);
      }
      b('capeA', 'chest', 0, 0.2, -P.chestD - 0.05);
      b('capeB', 'capeA', 0, -0.42, -0.02);
      b('capeC', 'capeB', 0, -0.42, -0.02);
      b('back', 'chest', 0, 0.06, -P.chestD - 0.06);
      // A-pose légère (le repos n'est jamais en T)
      this.bones.armL.rotation.z = 0.07; this.bones.armR.rotation.z = -0.07;
      this.bones.forearmL.rotation.x = -0.12; this.bones.forearmR.rotation.x = -0.12;
      this.bones.shinL.rotation.x = 0.02; this.bones.shinR.rotation.x = 0.02;
    }
    // mesures exposées aux tenues (G.HeroOutfits lit R.dims / R.k)
    _dims() {
      const P = this.P;
      this.k = P.k; this.height = P.H;
      this.dims = {
        chW: P.chestW * 1.04, chD: P.chestD * 1.06, waW: P.waistW * 1.05, waD: P.waistD * 1.08, hiW: P.hipW * 1.04, hiD: 0.125,
        armR0: P.armR * 1.18, armR1: P.armR * 0.82, foreR0: P.foreR * 1.08, foreR1: P.foreR * 0.62, thR0: P.thighR * 1.04, thR1: P.thighR * 0.7,
        shR0: P.shinR * 1.2, shR1: P.shinR * 0.68, headR: 0.172 * P.headS, headY: HEAD.c[1] * P.headS, neckR: P.neckR * 1.05,
        footL: 0.25, footH: 0.085, footW: 0.056, handL: P.handL,
        // repères du visage dans l'espace de l'os head (y vers le haut, z vers l'avant)
        eyeY: HEAD.eyeY * P.headS, browY: HEAD.browY * P.headS, noseY: 0.135 * P.headS, mouthY: 0.075 * P.headS, chinY: 0.03 * P.headS,
        crownY: HEAD.crownY * P.headS, faceZ: 0.165 * P.headS, noseZ: 0.205 * P.headS, earX: 0.155 * P.headS, skullR: [HEAD.r[0] * P.headS, HEAD.r[1] * P.headS, HEAD.r[2] * P.headS], skullC: [HEAD.c[0] * P.headS, HEAD.c[1] * P.headS, HEAD.c[2] * P.headS],
      };
    }
    // ré-applique de nouvelles proportions (si body() reçoit une autre spec que rig())
    reshape(bodySpec) {
      this.P = proportions(bodySpec);
      this._dims();
      const keep = {};
      for (const n of this.boneList) keep[n] = this.bones[n].rotation.clone();
      this._skeleton();
      for (const n in keep) this.bones[n].rotation.copy(keep[n]);
      this.bones.armL.rotation.z = 0.07; this.bones.armR.rotation.z = -0.07;
    }
    add(bone, layer, geo, color, p, s, r, o) {
      if (!geo) return null;
      if (!this.bones[bone]) bone = 'hips';
      if (s == null) s = [1, 1, 1]; else if (typeof s === 'number') s = [s, s, s];
      if (o === true || o === false) o = { outline: o };
      o = o || {};
      const L = layer || 'cloth';
      const piece = {
        bone, layer: L, g: geo, c: hexOf(color, 0xff00ff), p: p || [0, 0, 0], s, r: r || [0, 0, 0],
        ol: !(geo.userData && geo.userData.noOutline) && (o.outline != null ? !!o.outline : DEFAULT_OL[L] !== false) && (o.outline === true || Math.max(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2])) >= HK.config.minOutline), olk: num(o.outlineK, 1),
        uv: o.uv, flat: !!o.flat, ao: o.ao, tag: o.tag || null, blend: null,
      };
      if (o.blend) {
        const arr = Array.isArray(o.blend) ? o.blend : [o.blend];
        piece.blend = arr.filter(x => x && this.bones[x.to] && x.range).map(x => ({ to: x.to, at: num(x.at, 0), range: x.range, max: x.max }));
        if (!piece.blend.length) piece.blend = null;
      }
      this.pieces.push(piece);
      if (piece.tag) (this.tags[piece.tag] = this.tags[piece.tag] || []).push(piece);
      return piece;
    }
    seg(bone, layer, geo, color, a, b, w, d, o) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      return this.add(bone, layer, geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [w, len, d == null ? w : d], rotTo(dx, dy, dz), o);
    }
    // membre lathe (y : 0 → -1) posé entre a et b
    limb(bone, layer, geo, color, a, b, rx, rz, o) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      return this.add(bone, layer, geo, color, a, [rx, len, rz == null ? rx : rz], rotTo(-dx, -dy, -dz), o);
    }
    // masque des pièces : R.hide(tag) | R.hide(bone, layer)
    hide(a, layer) {
      if (layer == null && this.tags[a]) return this.removeTag(a);
      const before = this.pieces.length;
      this.pieces = this.pieces.filter(p => !(p.bone === a && (layer == null || p.layer === layer)));
      return before - this.pieces.length;
    }
    // peau couverte par une tenue : retire les reliefs (pectoraux, abdos, biceps…) et rentre la base dans le volume
    //   k = 0 → la peau de la région est retirée (vêtement fermé : chemise, pantalon, robe)
    cover(region, k) {
      k = k == null ? 0.92 : k;
      const det = this.tags[region + 'Detail'];
      if (det) this.removeTag(region + 'Detail');
      if (k <= 0) { this.removeTag(region); return; }
      for (const p of (this.tags[region] || [])) {
        if (p.layer !== 'skin' || p._covered) continue;
        p._covered = true; p.ol = false;
        const round = p.g === GEO.sph || p.g === GEO.sphMid || p.g === GEO.sphLo || p.g === GEO.sphXs;
        p.s = round ? [p.s[0] * k * 0.92, p.s[1] * k * 0.92, p.s[2] * k * 0.92] : [p.s[0] * k, p.s[1], p.s[2] * k];
      }
    }
    removeTag(tag) {
      const list = this.tags[tag]; if (!list) return 0;
      this.pieces = this.pieces.filter(p => list.indexOf(p) < 0);
      delete this.tags[tag];
      return list.length;
    }
    fn(f) { if (typeof f === 'function') this.fns.push(f); }
    fx(f) { this.fn(f); }
    finish(info) { return finish(this, info || {}); }
  }
  const DEFAULT_OL = { glow: false, eye: false, eyeWhite: false, lip: false, trans: false, face: false, gem: true };

  // ------------------------------------------------------------------
  // Assemblage + contrat userData
  // ------------------------------------------------------------------
  const GEO_CACHE = new Map();
  let CACHE_N = 0;
  function hashPieces(R, rigidSet) {
    // empreinte rapide des pièces (évite de refusionner pour des héros identiques)
    let h = 2166136261 >>> 0;
    const mixs = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
    const mixn = (v) => { const x = Math.round(v * 10000); h ^= x & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= (x >>> 16) & 0xffff; h = Math.imul(h, 16777619) >>> 0; };
    const gid = (g) => { if (g.userData.__hk == null) g.userData.__hk = ++CACHE_N; return g.userData.__hk; };
    mixs(R.boneList.join(','));
    for (const n of R.boneList) { const b = R.bones[n]; mixn(b.position.x); mixn(b.position.y); mixn(b.position.z); mixn(b.rotation.x); mixn(b.rotation.y); mixn(b.rotation.z); }
    mixs(Object.keys(rigidSet).sort().join(','));
    for (const p of R.pieces) {
      mixs(p.bone); mixs(p.layer); mixn(gid(p.g)); mixn(p.c);
      for (let i = 0; i < 3; i++) { mixn(p.p[i]); mixn(p.s[i]); mixn(p.r[i]); }
      mixn(p.ol ? 1 : 0); mixn(p.olk); mixn(p.uv == null ? -1 : p.uv); mixn(p.flat ? 1 : 0); mixn(p.ao === false ? 1 : 0);
      if (p.blend) for (const b of p.blend) { mixs(b.to); mixn(b.at); mixn(b.range); mixn(b.max == null ? -1 : b.max); }
    }
    return h.toString(36) + '_' + R.pieces.length;
  }

  function finish(R, info) {
    const root = R.root, rig = R.rig, B = R.bones, ud = root.userData;
    const sc = num(info.scale, R.scale);
    rig.scale.setScalar(1);
    root.updateMatrixWorld(true);
    // os/couches rigides
    const rigidPair = {};
    const markPair = (bl) => { if (bl && bl[0]) rigidPair[bl[0] + '|' + (bl[1] || 'blade')] = true; };
    if (info.weapon) markPair([info.weapon.bone, info.weapon.layer]);
    const gw = info.glowWeapons || {};
    for (const k in gw) for (const pr of (gw[k] || [])) markPair(pr);
    const skinning = HK.config.skinning !== false && !!T.SkinnedMesh && !!T.Skeleton;
    const isRigid = (p) => !skinning || R.rigidBones[p.bone] || rigidPair[p.bone + '|' + p.layer];
    const key = R.classId + '|' + (skinning ? 'S' : 'R') + '|' + hashPieces(R, Object.assign({}, rigidPair));
    let cache = GEO_CACHE.get(key);
    const build = !cache;
    if (build) { cache = {}; GEO_CACHE.set(key, cache); if (GEO_CACHE.size > 64) GEO_CACHE.delete(GEO_CACHE.keys().next().value); }

    const boneIdx = {}; R.boneList.forEach((n, i) => { boneIdx[n] = i; });
    const bindMats = {}; for (const n of R.boneList) bindMats[n] = B[n].matrixWorld.clone();
    const skinIdx = { index: (n) => (boneIdx[n] != null ? boneIdx[n] : 0) };

    const meshes = {}, meshList = [], flash = [], usedMats = [];
    const matOpts = { classId: R.classId, spec: info.spec || null };
    const glowLayerSet = {};
    for (const k in gw) for (const pr of (gw[k] || [])) if (pr) glowLayerSet[pr[0] + '|' + (pr[1] || 'glow')] = k;
    const pushMat = (m) => { if (m && usedMats.indexOf(m) < 0) usedMats.push(m); };

    // --- 1) couches skinnées
    let skeleton = null;
    if (skinning) {
      const byLayer = {}, order = [];
      for (const p of R.pieces) { if (isRigid(p)) continue; if (!byLayer[p.layer]) { byLayer[p.layer] = []; order.push(p.layer); } byLayer[p.layer].push(p); }
      if (order.length) {
        const bones = R.boneList.map(n => B[n]);
        const inv = R.boneList.map(n => new T.Matrix4().copy(bindMats[n]).invert());
        skeleton = new T.Skeleton(bones, inv);
        const bm = (p) => bindMats[p.bone];
        for (const L of order) {
          const ck = 'S|' + L;
          let geo = cache[ck];
          if (build) geo = cache[ck] = merge(byLayer[L], 'solid', 0, bm, skinIdx);
          if (!geo) continue;
          let mat;
          if (L === 'face') mat = info.faceMat || R.faceMat || null;
          if (!mat) mat = L === 'blade' ? instanceMat('blade', matOpts) : baseMat(L, matOpts);
          const mesh = new T.SkinnedMesh(geo, skinVariant(mat));
          mesh.bind(skeleton, ID4);
          mesh.frustumCulled = false;
          mesh.castShadow = L !== 'glow' && L !== 'trans' && L !== 'face';
          mesh.receiveShadow = false;
          mesh.name = 'hero6:' + L;
          mesh.userData.layer = L; mesh.userData.skinned = true;
          if (L === 'face') mesh.renderOrder = 1;
          rig.add(mesh);
          (meshes._skinned = meshes._skinned || {})[L] = mesh;
          meshList.push(mesh); pushMat(mesh.material);
        }
        let og = cache['S|OL'];
        if (build) {
          const all = []; for (const L of order) for (const p of byLayer[L]) all.push(p);
          og = cache['S|OL'] = merge(all, 'outline', HK.config.outline, bm, skinIdx);
        }
        if (og) {
          const om = new T.SkinnedMesh(og, OUT_SKIN);
          om.bind(skeleton, ID4);
          om.frustumCulled = false; om.castShadow = false;
          om.userData.isOutline = true; om.name = 'hero6:outline';
          rig.add(om);
          meshList.push(om);
        }
      }
    }
    // --- 2) pièces rigides par (os, couche)
    const rByKey = {}, rOrder = [];
    for (const p of R.pieces) {
      if (!isRigid(p)) continue;
      const k = p.bone + '|' + p.layer;
      if (!rByKey[k]) { rByKey[k] = []; rOrder.push(k); }
      rByKey[k].push(p);
    }
    const rBones = [];
    for (const k of rOrder) {
      const i = k.indexOf('|'), bone = k.slice(0, i), L = k.slice(i + 1);
      if (rBones.indexOf(bone) < 0) rBones.push(bone);
      const ck = 'R|' + k;
      let geo = cache[ck];
      if (build) geo = cache[ck] = merge(rByKey[k], 'solid', 0, null, null);
      if (!geo) continue;
      const isGlowW = glowLayerSet[k] != null;
      let mat;
      if (L === 'blade' || isGlowW || rigidPair[k]) {
        mat = instanceMat(L === 'glow' ? 'gem' : L, matOpts);
        if (!mat.emissive) mat = toonMat({ emissive: 0x000000 });
        mat.userData.shared = false;
      } else mat = baseMat(L, matOpts);
      const mesh = new T.Mesh(geo, mat);
      mesh.castShadow = L !== 'glow' && L !== 'trans';
      mesh.receiveShadow = false;
      mesh.userData.layer = L;
      mesh.name = 'hero6:' + k;
      B[bone].add(mesh);
      (meshes[bone] = meshes[bone] || {})[L] = mesh;
      meshList.push(mesh); pushMat(mat);
    }
    for (const bone of rBones) {
      const ck = 'R|OL|' + bone;
      let geo = cache[ck];
      if (build) {
        const all = []; for (const k of rOrder) if (k.slice(0, k.indexOf('|')) === bone) for (const p of rByKey[k]) all.push(p);
        geo = cache[ck] = merge(all, 'outline', HK.config.outline, null, null);
      }
      if (!geo) continue;
      const m = new T.Mesh(geo, OUT_MAT);
      m.userData.isOutline = true; m.castShadow = false;
      B[bone].add(m);
      meshList.push(m);
    }

    // --- 3) userData (contrat)
    rig.scale.setScalar(sc);
    ud.kind = 'hero';
    ud.hero6 = true;
    ud.classId = R.classId;
    ud.heroId = R.classId;
    ud.rig = rig;
    ud.skeleton = skeleton;
    ud.parts = {};
    for (const n of R.boneList) ud.parts[n] = B[n];
    ud.parts.body = B.spine;                // alias pour l'ancien animateur (repli si HeroAnim absent)
    ud.rest = {};
    for (const n of R.boneList) ud.rest[n] = [B[n].rotation.x, B[n].rotation.y, B[n].rotation.z];
    ud.rest.body = ud.rest.spine;
    ud.restPos = {};
    for (const n of R.boneList) ud.restPos[n] = [B[n].position.x, B[n].position.y, B[n].position.z];
    for (const k of ['armL', 'armR', 'legL', 'legR', 'head']) ud[k] = B[k];
    ud.body = B.spine;
    ud.wristRest = B.wristR.rotation.x;
    ud.height = num(info.height, R.P.H) * sc;
    ud.radius = num(info.radius, 0.5);
    ud.baseScale = sc;
    ud.baseY = num(info.baseY, 0);
    rig.position.y = ud.baseY;
    ud.phase = Math.random() * TAU;
    ud.walkSpeed = num(info.walkSpeed, 9.5);
    ud.meshes = meshes;
    ud.meshList = meshList;
    ud.proportions = R.P;
    ud.spec = info.spec || null;
    ud.auras = [];
    ud.weaponLevels = { epee: 1, dague: 1, feu: 1 };
    // arme principale
    const wb = info.weapon && info.weapon.bone, wl = info.weapon && (info.weapon.layer || 'blade');
    ud.blade = (wb && meshes[wb] && meshes[wb][wl]) || (meshes.weaponR && (meshes.weaponR.blade || firstOf(meshes.weaponR))) || (meshes.weaponL && (meshes.weaponL.blade || firstOf(meshes.weaponL))) || null;
    // lueurs d'arme (setHeroWeaponLevel)
    ud.glow = { epee: [], dague: [], feu: [] };
    for (const k in gw) {
      if (!ud.glow[k]) ud.glow[k] = [];
      for (const pr of (gw[k] || [])) {
        if (!pr) continue;
        const m = meshes[pr[0]] && meshes[pr[0]][pr[1] || 'glow'];
        if (m && m.material && m.material.emissive && ud.glow[k].indexOf(m) < 0) {
          ud.glow[k].push(m);
          if (pr[2] != null) { m.material.emissive.setHex(pr[2]); m.material.emissiveIntensity = num(pr[3], 0.55); m.material.userData.base = [pr[2], m.material.emissiveIntensity]; }
        }
      }
    }
    if (info.bladeEmissive != null && ud.blade && ud.blade.material && ud.blade.material.emissive) {
      ud.blade.material.emissive.setHex(info.bladeEmissive); ud.blade.material.emissiveIntensity = num(info.bladeEmissiveIntensity, 0.6);
      if (!ud.blade.material.userData.base) ud.blade.material.userData.base = [info.bladeEmissive, ud.blade.material.emissiveIntensity];
    }
    // matériaux pour le flash de dégâts (émissifs, hors contour)
    for (const m of usedMats) if (m && m.emissive && flash.indexOf(m) < 0) flash.push(m);
    ud.mats = flash;
    ud.eyes = [];
    const ewm = (meshes._skinned && meshes._skinned.eyeWhite) || (meshes.head && meshes.head.eyeWhite);
    if (ewm && ewm.material && ewm.material.emissive) ud.eyes.push(ewm.material);
    // animations d'ambiance
    if (R.fns.length) {
      let host = meshList.find(m => m.isSkinnedMesh && !m.userData.isOutline) || meshList.find(m => !m.userData.isOutline);
      if (host) {
        const fns = R.fns;
        host.onBeforeRender = function () {
          const t = nowSec();
          for (let i = 0; i < fns.length; i++) { try { fns[i](t, B, ud); } catch (e) { /* ne casse pas le rendu */ } }
        };
      }
    }
    rig.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.userData.owner = 'hero'; });
    ud.stats = { meshes: meshList.length, tris: meshList.reduce((a, m) => a + triCount(m.geometry), 0) };
    return root;
  }
  const LAYER_OF = new WeakMap();
  function isLayerMat(m, L) { return LAYER_OF.get(m) === L; }
  function firstOf(o) { for (const k in o) return o[k]; return null; }
  function triCount(g) { if (!g) return 0; return (g.index ? g.index.count : g.attributes.position.count) / 3; }

  // ==================================================================
  // ANATOMIE
  // ==================================================================
  function skinOf(spec, R) {
    const s = spec || {};
    const pal = (R && R.spec && R.spec.palette) || {};
    return hexOf(s.skin != null ? s.skin : s.skinColor != null ? s.skinColor : pal.skin, 0xe9b892);
  }

  // ---------------- CORPS ----------------
  function body(R, spec) {
    spec = spec || {};
    if (spec.build && spec.build !== R.P.buildName || isFemale(spec) !== R.P.fem || (spec.muscle != null && spec.muscle !== R.P.mus)) R.reshape(spec);
    const P = R.P, mus = P.mus, fem = P.fem;
    const skin = skinOf(spec, R), skinD = shade(skin, -0.12), skinL = shade(skin, 0.06);
    const A = (b, g, c, p, s, r, o) => R.add(b, 'skin', g, c, p, s, r, o);
    const g = GEO;
    // --- bassin
    A('hips', g.sph, skin, [0, -0.02, -0.005], [P.hipW, 0.125, 0.12], null, { tag: 'pelvis', blend: { to: 'spine', at: 0.07, range: 0.07, max: 0.5 } });
    for (const [s, sx] of SIDES) A('hips', g.sphMid, skinD, [sx * 0.072, -0.07, -0.07], [0.085 * (fem ? 1.12 : 1), 0.1, 0.075], null, { tag: 'pelvis' });
    // --- abdomen / taille
    A('spine', g.abdomen, skin, [0, 0.24, 0.0], [P.waistW, 0.3, P.waistD], null, { tag: 'torso', blend: [{ to: 'chest', at: 0.2, range: 0.08, max: 0.6 }, { to: 'hips', at: -0.02, range: -0.06, max: 0.6 }] });
    if (mus > 0.42 && !fem) {
      const d = (mus - 0.42) / 0.58;
      for (let row = 0; row < 3; row++) for (const [, sx] of SIDES) {
        A('spine', g.sphXs, skinL, [sx * 0.033, 0.0 + row * 0.068, P.waistD * 0.86], [0.03, 0.03, 0.012 + 0.012 * d], [0, sx * 0.25, 0], { tag: 'torsoDetail', outline: false });
      }
      for (const [, sx] of SIDES) A('spine', g.sphLo, skin, [sx * 0.1, 0.07, 0.035], [0.035, 0.11, 0.06], [0, 0, sx * 0.15], { tag: 'torsoDetail', outline: false });
    }
    // --- cage thoracique
    A('chest', g.chest, skin, [0, 0.26, -0.005], [P.chestW, 0.36, P.chestD], null, { tag: 'torso' });
    if (fem) {
      for (const [, sx] of SIDES) A('chest', g.sphMid, skin, [sx * 0.066, 0.085, P.chestD * 0.7], [0.068, 0.07, 0.062], [0.25, sx * 0.3, 0], { tag: 'torsoDetail' });
    } else {
      for (const [, sx] of SIDES) A('chest', g.sphMid, skinL, [sx * 0.068, 0.12, P.chestD * 0.62], [0.085 * P.B.ch, 0.06 + 0.012 * mus, 0.035 + 0.03 * mus], [0.1, sx * 0.35, sx * -0.12], { tag: 'torsoDetail', outline: false });
    }
    // clavicules + trapèzes + omoplates
    for (const [s, sx] of SIDES) {
      R.seg('chest', 'skin', g.cyl8, skinL, [sx * 0.025, 0.245, P.chestD * 0.62], [sx * (P.shX - 0.04), 0.245, 0.0], 0.014, null, { tag: 'torsoDetail', outline: false });
      A('chest', g.sphMid, skin, [sx * 0.085, 0.25, -0.03], [0.09 * P.B.neck, 0.048 + 0.02 * mus, 0.065], [0, 0, sx * -0.42], { tag: 'torso' });
      A('chest', g.sphLo, skinD, [sx * 0.075, 0.13, -P.chestD * 0.62], [0.07, 0.085, 0.035], [0, sx * -0.3, 0], { tag: 'torsoDetail', outline: false });
      // dorsaux (V)
      A('chest', g.sphLo, skin, [sx * 0.12, 0.08, -0.02], [0.05, 0.13, 0.085], [0, 0, sx * 0.2], { tag: 'torsoDetail', outline: false });
    }
    // --- cou
    A('neck', g.neck, skin, [0, 0.11, 0], [P.neckR, 0.15, P.neckR * 0.98], null, { tag: 'neck', blend: [{ to: 'head', at: 0.1, range: 0.04, max: 0.6 }, { to: 'chest', at: -0.01, range: -0.04, max: 0.6 }] });
    if (!fem && mus > 0.3) for (const [, sx] of SIDES) R.seg('neck', 'skin', g.cyl8, skinL, [sx * 0.028, 0.1, 0.03], [sx * 0.02, -0.02, 0.05], 0.016, null, { tag: 'neck', outline: false });
    // --- bras
    for (const [s, sx] of SIDES) {
      const arm = 'arm' + s, fa = 'forearm' + s, sh = 'shoulder' + s;
      // deltoïde
      A(arm, g.sph, skin, [sx * 0.012, -0.045, 0.0], [P.armR * 1.45, P.armR * 1.75, P.armR * 1.5], [0, 0, sx * 0.12], { tag: 'upperArmDetail', blend: { to: sh, at: 0.02, range: 0.05, max: 0.35 } });
      R.limb(arm, 'skin', g.upperArm, skin, [0, -0.02, 0], [0, -P.upper - 0.01, 0], P.armR, P.armR * 0.95, { tag: 'upperArm', blend: { to: fa, at: -P.upper, range: -0.05, max: 0.55 } });
      // biceps / triceps
      A(arm, g.sphLo, skinL, [0, -P.upper * 0.45, P.armR * 0.45], [P.armR * 0.72, P.upper * (0.26 + 0.06 * mus), P.armR * (0.6 + 0.25 * mus)], null, { tag: 'upperArmDetail', outline: false });
      A(arm, g.sphLo, skin, [0, -P.upper * 0.4, -P.armR * 0.35], [P.armR * 0.78, P.upper * 0.3, P.armR * 0.7], null, { tag: 'upperArmDetail', outline: false });
      // coude
      A(fa, g.sphLo, skin, [0, 0.005, -0.016], [P.foreR * 0.78, P.foreR * 0.95, P.foreR * 0.72], null, { tag: 'forearm', outline: false, blend: { to: arm, at: 0.0, range: 0.04, max: 0.5 } });
      R.limb(fa, 'skin', g.forearm, skin, [0, 0.005, 0], [0, -P.fore + 0.01, 0.0], P.foreR, P.foreR * 0.88, { tag: 'forearm', blend: { to: arm, at: 0.0, range: 0.045, max: 0.55 } });
      A(fa, g.sphLo, skinL, [sx * 0.012, -P.fore * 0.25, 0.008], [P.foreR * 0.8, P.fore * 0.24, P.foreR * 0.75], null, { tag: 'forearmDetail', outline: false });
    }
    // --- jambes
    for (const [s, sx] of SIDES) {
      const lg = 'leg' + s, sn = 'shin' + s, ft = 'foot' + s;
      R.limb(lg, 'skin', g.thigh, skin, [0, 0.02, 0], [0, -P.thigh, 0.005], P.thighR, P.thighR * 1.02, { tag: 'thigh', blend: [{ to: 'hips', at: -0.01, range: 0.06, max: 0.55 }, { to: sn, at: -P.thigh, range: -0.05, max: 0.55 }] });
      // quadriceps (avant) + adducteur
      A(lg, g.sphLo, skinL, [sx * 0.012, -P.thigh * 0.45, P.thighR * 0.4], [P.thighR * 0.74, P.thigh * 0.32, P.thighR * 0.64], null, { tag: 'thighDetail', outline: false });
      A(lg, g.sphLo, skin, [-sx * P.thighR * 0.35, -P.thigh * 0.3, 0], [P.thighR * 0.6, P.thigh * 0.28, P.thighR * 0.7], null, { tag: 'thighDetail', outline: false });
      // genou
      A(sn, g.sphLo, skin, [0, 0.0, P.shinR * 0.35], [P.shinR * 0.72, P.shinR * 0.85, P.shinR * 0.6], null, { tag: 'shinDetail', outline: false, blend: { to: lg, at: 0.0, range: 0.04, max: 0.45 } });
      R.limb(sn, 'skin', g.shin, skin, [0, 0.01, 0], [0, -P.shin + 0.02, 0], P.shinR, P.shinR * 1.02, { tag: 'shin', blend: [{ to: lg, at: 0.0, range: 0.04, max: 0.55 }, { to: ft, at: -P.shin, range: -0.03, max: 0.5 }] });
      // mollet
      A(sn, g.sphMid, skin, [0, -P.shin * 0.27, -P.shinR * 0.45], [P.shinR * 0.85, P.shin * 0.24, P.shinR * 0.8], null, { tag: 'shinDetail', outline: false });
      // pied : cheville, voûte, orteils
      A(ft, g.sphLo, skin, [0, 0.0, 0.0], [0.04, 0.045, 0.045], null, { tag: 'foot', outline: false });
      A(ft, g.foot, skin, [0, -0.025, 0.055], [0.052, 0.05, 0.12], null, { tag: 'foot' });
      A(ft, g.sphLo, skinD, [0, -0.03, -0.035], [0.042, 0.035, 0.04], null, { tag: 'foot', outline: false });
    }
    return R;
  }

  // ---------------- TÊTE ----------------
  // repères tête (espace os head, avant échelle hs) — utiles aux tenues (casques, capuches)
  const HEAD = { c: [0, 0.205, -0.008], r: [0.148, 0.19, 0.172], eyeY: 0.205, eyeX: 0.056, eyeZ: 0.133, browY: 0.243, chinY: 0.03, crownY: 0.395 };
  function head(R, spec) {
    spec = spec || {};
    const P = R.P, hs = P.headS, fem = P.fem;
    const sp = (R.spec && R.spec.palette) || {};
    const skin = hexOf(spec.skin != null ? spec.skin : (R.spec && R.spec.body && R.spec.body.skin), hexOf(sp.skin, 0xe9b892));
    const skinD = shade(skin, -0.14), skinL = shade(skin, 0.07);
    const hairC = hexOf(spec.hairColor != null ? spec.hairColor : (spec.hair && spec.hair.color) != null ? spec.hair.color : sp.hair, 0x5a3a22);
    const browC = hexOf(spec.brow != null ? spec.brow : spec.browColor, shade(hairC, -0.25));
    const eyeC = hexOf(spec.eyes != null ? spec.eyes : spec.eyeColor != null ? spec.eyeColor : sp.eyes, 0x4a7ab8);
    const lipC = hexOf(spec.lips != null ? spec.lips : spec.lipColor, mix(skin, fem ? 0xc0505a : 0xa85a50, fem ? 0.55 : 0.38));
    const jawT = spec.jaw || (fem ? 'soft' : 'square');
    const jw = jawT === 'square' ? 1.12 : jawT === 'narrow' ? 0.86 : jawT === 'heavy' ? 1.22 : 0.97;
    const S = (v) => v * hs;
    const age = typeof spec.age === 'number' ? (spec.age > 1.5 ? spec.age : spec.age * 80) : /old|vieux|elder/.test(String(spec.age || '')) ? 65 : /mature/.test(String(spec.age || '')) ? 45 : 28;
    const old = clamp((age - 35) / 35, 0, 1);
    const H = (b, L, g, c, p, s, r, o) => R.add(b, L, g, c, [S(p[0]), S(p[1]), S(p[2])], Array.isArray(s) ? [S(s[0]), S(s[1]), S(s[2])] : S(s), r, o);
    const g = GEO;
    // crâne modelé (une seule surface, UV de sphère) : couche 'face' si HeroTex.face est disponible
    let faceMat = null;
    if (G.HeroTex && typeof G.HeroTex.face === 'function' && spec.decal !== false) {
      try {
        const fs = { skin, hairColor: hairC, eyes: eyeC, lips: lipC, sex: fem ? 'f' : 'm', classId: R.classId, seed: R.classId };
        // champs de la spec A1 transmis tels quels (HeroTex.face les comprend : rides, cicatrices, marques, barbe naissante)
        if (spec.age != null) fs.age = spec.age;
        if (spec.scar != null) fs.scar = spec.scar;
        if (spec.marks != null) fs.marks = spec.marks;
        if (spec.beardTex != null) fs.beard = spec.beardTex; else if (spec.beard && typeof spec.beard === 'object') fs.beard = spec.beard;
        if (spec.makeup != null) fs.makeup = spec.makeup;
        const extra = spec.faceSpec && typeof spec.faceSpec === 'object' ? spec.faceSpec : (spec.face && typeof spec.face === 'object' ? spec.face : null);
        if (extra) for (const k in extra) if (extra[k] != null && fs[k] == null) fs[k] = extra[k];
        const fm = G.HeroTex.face(fs);
        if (fm && fm.isMaterial) faceMat = fm;
      } catch (e) { faceMat = null; }
    }
    R.faceMat = faceMat;
    H('head', faceMat ? 'face' : 'skin', skullGeo(jw), faceMat ? shade(skin, -(0.12 + 0.45 * Math.max(0, lumOf(skin) - 0.55))) : skin, HEAD.c, HEAD.r, null, { tag: 'skull', uv: faceMat ? 0 : 1, outline: true });
    // os jugal (pommettes)
    for (const [, sx] of SIDES) H('head', 'skin', g.sphLo, skin, [sx * 0.08, 0.165, 0.1], [0.036, 0.022, 0.036], [0, sx * 0.5, sx * -0.3], { tag: 'face', outline: false });
    // creux des joues (âge, maigreur)
    if (old > 0.2 || R.P.buildName === 'gaunt') for (const [, sx] of SIDES) H('head', 'skin', g.sphXs, skinD, [sx * 0.082, 0.12, 0.108], [0.03, 0.035, 0.02], [0, sx * 0.6, 0], { outline: false });
    // arcade sourcilière
    H('head', 'skin', g.sphMid, skin, [0, 0.238, 0.118], [fem ? 0.1 : 0.11, fem ? 0.022 : 0.028, fem ? 0.04 : 0.046], [0.1, 0, 0], { tag: 'face', outline: false });
    // tempes (aplatissement latéral réaliste)
    // mâchoire (os jaw : s'ouvre) — positions relatives au pivot jaw (0,0.115,0.02)
    const J = (p) => [p[0], p[1] - 0.115, p[2] - 0.02];
    for (const [, sx] of SIDES) H('jaw', 'skin', g.sphLo, skin, J([sx * 0.074 * jw, 0.095, 0.02]), [0.03, 0.05, 0.06], [0, 0, sx * 0.4], { tag: 'jaw', outline: false, blend: { to: 'head', at: S(0.0), range: S(0.04), max: 0.6 } });
    H('jaw', 'skin', g.sphLo, skin, J([0, 0.05, 0.118]), [0.034 * (jawT === 'square' ? 1.25 : 1), 0.026, 0.028], null, { tag: 'jaw', outline: false });
    // nez : arête, pointe, ailes
    const nose = spec.nose || 'straight';
    const nl = nose === 'small' ? 0.85 : nose === 'aquiline' ? 1.08 : nose === 'broad' ? 1.0 : 1;
    const nw = (fem ? 0.85 : 1) * (nose === 'broad' ? 1.3 : 1);
    H('head', 'skin', g.cone6, skin, [0, 0.17, 0.17], [0.021 * nw, 0.082 * nl, 0.027], [0.24 + (nose === 'aquiline' ? -0.14 : 0), 0, 0], { tag: 'face', outline: false });
    H('head', 'skin', g.sphLo, skinL, [0, 0.135, 0.188 + 0.006 * (nl - 1)], [0.021 * nw, 0.019, 0.02], null, { tag: 'face', outline: false });
    for (const [, sx] of SIDES) H('head', 'skin', g.sphXs, skin, [sx * 0.019 * nw, 0.131, 0.174], [0.014, 0.012, 0.013], null, { tag: 'face', outline: false });
    H('head', 'skin', g.sphT, shade(skin, -0.45), [0, 0.124, 0.18], [0.016 * nw, 0.005, 0.008], null, { outline: false, ao: false });
    // oreilles
    const pointed = /point|elf|elfe|pointu/i.test(String(spec.ears || ''));
    for (const [, sx] of SIDES) {
      H('head', 'skin', g.sphLo, skin, [sx * 0.147, 0.19, -0.005], [0.016, 0.042, 0.03], [0, sx * -0.3, sx * 0.1], { tag: 'ear' });
      H('head', 'skin', g.sphXs, skinD, [sx * 0.155, 0.19, 0.002], [0.008, 0.028, 0.018], [0, sx * -0.3, 0], { tag: 'ear', outline: false });
      if (pointed) H('head', 'skin', g.cone6, skin, [sx * 0.175, 0.255, -0.03], [0.014, 0.1, 0.022], [-0.35, 0, sx * -0.9], { tag: 'ear' });
    }
    // yeux : orbites (ombre), blanc, iris, pupille, reflet
    const eyeR = 0.0215 * (fem ? 1.06 : 1);
    for (const [s, sx] of SIDES) {
      const ex = sx * HEAD.eyeX, ey = HEAD.eyeY, ez = HEAD.eyeZ;
      H('head', 'skin', g.sphLo, shade(skin, -0.3 - 0.08 * old), [ex, ey + 0.004, ez - 0.008], [0.034, 0.026, 0.021], null, { tag: 'face', outline: false, ao: false });
      H('head', 'eyeWhite', g.sphLo, 0xeee8e0, [ex, ey, ez], [eyeR, eyeR * 0.92, eyeR * 0.8], null, { outline: false, ao: false });
      H('head', 'eyeWhite', g.sphXs, eyeC, [ex + sx * 0.001, ey, ez + eyeR * 0.68], [eyeR * 0.62, eyeR * 0.62, eyeR * 0.22], null, { outline: false, ao: false });
      H('head', 'eyeWhite', g.sphT, 0x0c0a0a, [ex + sx * 0.001, ey, ez + eyeR * 0.8], [eyeR * 0.3, eyeR * 0.3, eyeR * 0.12], null, { outline: false, ao: false });
      H('head', 'eyeWhite', g.sphT, 0xffffff, [ex + sx * 0.004 + 0.003, ey + 0.005, ez + eyeR * 0.88], [eyeR * 0.16, eyeR * 0.16, eyeR * 0.06], null, { outline: false, ao: false });
      if (old > 0.3) H('head', 'skin', g.sphXs, skinD, [ex, ey - eyeR * 1.35, ez - 0.002], [eyeR * 1.1, eyeR * 0.35, eyeR * 0.6], null, { outline: false });
      // paupières (os lid : rotation +X = fermer) — coque haute + ligne de cils
      const lid = 'lid' + s;
      const lo = [0, 0, 0];   // os lid au centre de l'œil
      R.add(lid, 'skin', g.lidShell, skin, lo, [S(eyeR * 1.12), S(eyeR * 1.06), S(eyeR * 1.1)], [-0.42, 0, 0], { outline: false, tag: 'lid' });
      R.add(lid, 'hair', g.torus(fem ? 0.26 : 0.16, PI * 0.9, 8), shade(browC, -0.4), [0, S(eyeR * 0.36), S(eyeR * 0.98)], [S(eyeR * 1.06), S(eyeR * 0.75), S(eyeR * 0.6)], [-0.25, 0, PI * 0.05], { outline: false, ao: false });
      // paupière inférieure (fixe)
      H('head', 'skin', g.sphXs, skin, [ex, ey - eyeR * 0.85, ez + 0.004], [eyeR * 1.05, eyeR * 0.32, eyeR * 0.7], null, { outline: false, tag: 'lid' });
      // sourcils (os brow)
      const bw = spec.browThick != null ? spec.browThick * 1.2 : fem ? 0.0072 : 0.011;
      R.add('brow' + s, 'hair', g.sphLo, browC, [sx * S(0.004), 0, 0], [S(0.03), S(bw), S(0.01)], [0, sx * 0.25, sx * -0.12], { outline: false, ao: false });
      R.add('brow' + s, 'hair', g.sphXs, browC, [sx * S(-0.022), S(-0.002), S(0.004)], [S(0.012), S(bw * 1.15), S(0.009)], [0, sx * 0.1, sx * 0.2], { outline: false, ao: false });
    }
    // bouche : lèvre sup (os mouth), lèvre inf (jaw), intérieur sombre
    R.add('mouth', 'skin', g.sphLo, lipC, [0, S(0.004), 0], [S(0.03), S(0.0075 * (fem ? 1.3 : 1)), S(0.011)], [0.25, 0, 0], { outline: false });
    R.add('mouth', 'skin', g.sphXs, shade(lipC, 0.1), [0, S(0.009), S(0.008)], [S(0.012), S(0.005), S(0.008)], null, { outline: false });
    H('jaw', 'skin', g.sphLo, shade(lipC, 0.06), J([0, 0.062, 0.158]), [0.03, 0.01 * (fem ? 1.35 : 1), 0.014], [-0.3, 0, 0], { outline: false });
    H('head', 'skin', g.sphXs, 0x2a1414, [0, 0.07, 0.15], [0.03, 0.008, 0.01], null, { outline: false, ao: false });
    // sillons naso-labiaux (suggérés, musclés/âgés)
    if (old > 0.25) for (const [, sx] of SIDES) H('head', 'skin', g.sphXs, skinD, [sx * 0.04, 0.105, 0.155], [0.006, 0.03, 0.006], [0, 0, sx * 0.4], { outline: false });
    // coiffure + barbe
    const hairSpec = spec.hair;
    const style = typeof hairSpec === 'string' ? hairSpec : (hairSpec && hairSpec.style) || spec.hairStyle || 'short';
    hair(R, style, hairC, spec);
    const bs = typeof spec.beard === 'string' ? spec.beard : (spec.beard && spec.beard.style) || null;
    if (bs && bs !== 'none') beard(R, bs, hexOf((spec.beard && spec.beard.color) != null ? spec.beard.color : spec.beardColor, hairC), spec);
    return R;
  }
  // UV du décalque : u = côté droit du perso (-X) → gauche (+X) ; v = bas (menton) → haut (front)
  function faceUV(x, y, z) {
    const dx = (x - HEAD.c[0]) / HEAD.r[0], dy = (y - HEAD.c[1]) / HEAD.r[1], dz = (z - HEAD.c[2]) / HEAD.r[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const el = Math.asin(dy / L), az = Math.atan2(dx, dz);
    return [+(az / FACE_AZ + 0.5).toFixed(3), +((el - FACE_EL0) / FACE_EL + 0.5).toFixed(3)];
  }
  const FACE_UV = {
    eyeL: faceUV(HEAD.eyeX, HEAD.eyeY, 0.15), eyeR: faceUV(-HEAD.eyeX, HEAD.eyeY, 0.15),
    browL: faceUV(0.056, 0.243, 0.155), browR: faceUV(-0.056, 0.243, 0.155),
    nose: faceUV(0, 0.14, 0.18), mouth: faceUV(0, 0.075, 0.16), chin: faceUV(0, 0.04, 0.13),
    cheekL: faceUV(0.085, 0.14, 0.12), cheekR: faceUV(-0.085, 0.14, 0.12), forehead: faceUV(0, 0.3, 0.14),
    eyeRadiusU: 0.035, eyeRadiusV: 0.04,
  };

  // ---------------- COIFFURES ----------------
  // mèche : de a vers b (espace de l'os), largeur w, épaisseur t
  function lock(R, bone, c, a, b, w, t, o) {
    return R.limb(bone, 'hair', o && o.lo ? GEO.lockLo : GEO.lock, c, a, b, w, t, Object.assign({ uv: 1.5, outlineK: 0.6 }, o || {}));
  }
  const HAIR_STYLES = ['short', 'crop', 'shaved', 'swept', 'long', 'ponytail', 'braid', 'crest', 'bun', 'wild', 'hood', 'tied', 'bald'];
  function hair(R, style, color, spec) {
    spec = spec || {};
    const hs = R.P.headS, S = (v) => v * hs;
    const c = hexOf(color, 0x5a3a22), cD = shade(c, -0.22), cL = shade(c, 0.12);
    const C = HEAD.c, Rr = HEAD.r;
    const capAt = (k, tilt, col, low) => R.add('head', 'hair', low ? GEO.capLo : GEO.cap, col == null ? c : col, [S(C[0]), S(C[1] + 0.006), S(C[2] - 0.006)], [S(Rr[0] * k), S(Rr[1] * k * 0.99), S(Rr[2] * k)], [tilt == null ? -0.62 : tilt, 0, 0], { uv: 2, outlineK: 0.7 });
    const hp = (x, y, z) => [S(x), S(y), S(z)];
    // repère : surface du crâne à (az, el) (az 0 = devant, + = gauche du perso)
    const surf = (az, el, k) => { k = k || 1.0; return [S(C[0] + Math.sin(az) * Math.cos(el) * Rr[0] * k), S(C[1] + Math.sin(el) * Rr[1] * k), S(C[2] + Math.cos(az) * Math.cos(el) * Rr[2] * k)]; };
    const fringe = (n, len, spread, droop) => {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5, az = t * spread;
        const a = surf(az, 0.72, 1.02), b = surf(az + t * 0.25, 0.42 - droop, 1.12);
        b[1] -= S(len * 0.3);
        lock(R, 'head', i % 2 ? c : cL, a, b, S(0.03), S(0.012));
      }
    };
    switch (style) {
      case 'bald': case 'none': return R;
      case 'shaved':
        capAt(1.008, -0.7, mix(c, skinOf(spec.skin != null ? spec : null, R), 0.45), true);
        return R;
      case 'crop':
        capAt(1.03, -0.66, c);
        for (let i = 0; i < 6; i++) { const az = (i / 5 - 0.5) * 1.6; lock(R, 'head', i % 2 ? c : cD, surf(az, 0.95, 1.0), surf(az * 1.1, 0.55, 1.07), S(0.035), S(0.012), { lo: true }); }
        return R;
      case 'short': default: {
        capAt(1.045, -0.62, c);
        // volume du dessus, mèches vers l'arrière
        for (let i = 0; i < 9; i++) {
          const az = (i / 8 - 0.5) * 2.4, el = 0.95 + (i % 2) * 0.12;
          lock(R, 'head', i % 3 ? c : cD, surf(az * 0.4, el, 1.0), surf(az, 0.35, 1.1), S(0.045), S(0.018));
        }
        fringe(4, 0.06, 1.3, 0.05);
        // pattes
        for (const [, sx] of SIDES) lock(R, 'head', cD, surf(sx * 1.35, 0.15, 1.02), surf(sx * 1.38, -0.18, 1.02), S(0.02), S(0.008), { outline: false, lo: true });
        if (style !== 'short' && style !== undefined && HAIR_STYLES.indexOf(style) < 0) { /* style inconnu → court */ }
        return R;
      }
      case 'swept': {
        capAt(1.05, -0.6, c);
        for (let i = 0; i < 8; i++) {
          const t = i / 7, az = -1.0 + t * 2.0;
          lock(R, 'head', i % 2 ? c : cL, surf(-0.5 + t * 0.6, 1.05, 1.0), surf(az * 1.1 + 0.4, 0.3 - Math.abs(az) * 0.2, 1.13), S(0.05), S(0.02));
        }
        // longue mèche frontale balayée sur le côté gauche
        lock(R, 'head', cL, surf(-0.35, 0.85, 1.02), surf(0.55, 0.32, 1.14), S(0.05), S(0.016));
        lock(R, 'head', c, surf(-0.1, 0.8, 1.02), surf(0.9, 0.12, 1.12), S(0.04), S(0.014));
        for (let i = 0; i < 5; i++) { const az = PI - 0.9 + i * 0.45; lock(R, 'head', i % 2 ? c : cD, surf(az, 0.6, 1.0), surf(az, -0.2, 1.08), S(0.05), S(0.02)); }
        return R;
      }
      case 'wild': {
        capAt(1.05, -0.6, c);
        for (let i = 0; i < 12; i++) {
          const az = (i / 12) * TAU, el = 0.55 + (i % 3) * 0.2;
          const a = surf(az, el + 0.25, 1.0), b = surf(az, el - 0.25, 1.28 + (i % 2) * 0.08);
          b[1] += S(0.03);
          lock(R, 'head', i % 3 === 0 ? cD : i % 3 === 1 ? c : cL, a, b, S(0.05), S(0.02));
        }
        fringe(5, 0.08, 1.4, 0.0);
        return R;
      }
      case 'crest': case 'mohawk': {
        capAt(1.01, -0.7, mix(c, skinOf(spec.skin != null ? spec : null, R), 0.5), true);
        for (let i = 0; i < 7; i++) {
          const el = 1.5 - i * 0.32, a = [0, S(C[1] + Math.sin(el) * Rr[1]), S(C[2] + Math.cos(el) * Rr[2])];
          const b = [0, a[1] + S(0.09 - Math.abs(i - 3) * 0.012), a[2] - S(0.03 + i * 0.012)];
          lock(R, 'head', i % 2 ? c : cL, a, b, S(0.04), S(0.022));
        }
        return R;
      }
      case 'bun': {
        capAt(1.035, -0.7, c);
        for (let i = 0; i < 8; i++) { const az = (i / 8) * TAU; lock(R, 'head', i % 2 ? c : cD, surf(az, 0.6, 1.0), surf(az * 0.7, 1.25, 1.02), S(0.05), S(0.014), { lo: true, outline: false }); }
        R.add('head', 'hair', GEO.sphMid, c, hp(0, 0.39, -0.1), [S(0.065), S(0.06), S(0.065)], null, { uv: 2 });
        R.add('head', 'hair', GEO.torus(0.3, TAU, 10), cD, hp(0, 0.37, -0.09), S(0.05), [HPI + 0.6, 0, 0]);
        fringe(2, 0.05, 1.6, 0.1);
        return R;
      }
      case 'hood': {
        // capuche de tissu (couche cloth2) ; teinte = spec.hoodColor
        const hc = hexOf(spec.hoodColor, 0x2b2d3a);
        R.add('head', 'cloth2', GEO.sph, hc, hp(0, 0.215, -0.03), [S(0.19), S(0.225), S(0.205)], null, { uv: 1.5 });
        R.add('head', 'cloth2', GEO.torus(0.18, TAU, 18), shade(hc, -0.25), hp(0, 0.19, 0.12), [S(0.15), S(0.19), S(0.14)], [-0.2, 0, 0]);
        R.add('hairA', 'cloth2', GEO.cone, hc, [0, S(0.06), S(-0.05)], [S(0.12), S(0.26), S(0.09)], [-2.2, 0, 0]);
        fringe(3, 0.05, 1.1, 0.05);
        return R;
      }
      case 'long': case 'tied': case 'ponytail': case 'braid': {
        capAt(1.04, -0.62, c);
        const tied = style !== 'long';
        // dessus : mèches vers l'arrière
        for (let i = 0; i < 7; i++) {
          const az = (i / 6 - 0.5) * 2.0;
          lock(R, 'head', i % 2 ? c : cD, surf(az * 0.3, 1.05, 1.0), surf(az * 1.2 + (tied ? 0 : 0), 0.15, tied ? 1.06 : 1.12), S(0.055), S(0.018), { lo: tied });
        }
        fringe(tied ? 2 : 4, 0.07, 1.5, 0.12);
        if (style === 'long') {
          // rideau latéral (head) puis chute dans le dos (hairA → hairB)
          for (const [, sx] of SIDES) {
            lock(R, 'head', c, surf(sx * 1.2, 0.5, 1.02), [sx * S(0.165), S(-0.02), S(0.02)], S(0.05), S(0.02));
            lock(R, 'head', cL, surf(sx * 0.85, 0.65, 1.03), [sx * S(0.15), S(0.0), S(0.07)], S(0.04), S(0.016));
          }
          for (let i = 0; i < 7; i++) {
            const x = (i / 6 - 0.5) * 0.26;
            lock(R, 'hairA', i % 2 ? c : cD, [S(x * 0.8), S(0.06), S(-0.02)], [S(x * 1.1), S(-0.2), S(-0.03)], S(0.05), S(0.02), { blend: { to: 'head', at: S(0.03), range: S(0.05), max: 0.6 } });
            lock(R, 'hairB', i % 2 ? cD : c, [S(x * 1.1), 0.02, S(0.0)], [S(x * 1.2), S(-0.17), S(0.0)], S(0.045), S(0.018), { blend: { to: 'hairA', at: 0.0, range: S(0.04), max: 0.5 } });
          }
        } else {
          // attache
          R.add('hairA', 'leather', GEO.torus(0.35, TAU, 10), 0x3a2416, [0, S(style === 'tied' ? -0.02 : 0.07), S(0.0)], S(0.024), [HPI, 0, 0], { outline: true });
          const y0 = S(style === 'tied' ? -0.03 : 0.06);
          if (style === 'braid') {
            for (let i = 0; i < 9; i++) {
              const bone = i < 4 ? 'hairA' : 'hairB', y = bone === 'hairA' ? y0 - S(0.055 * i) : -S(0.05 * (i - 4)) + S(0.02);
              R.add(bone, 'hair', GEO.sphLo, i % 2 ? c : cL, [S((i % 2 ? 1 : -1) * 0.008), y, S(-0.012)], [S(0.032 - i * 0.0015), S(0.036), S(0.028)], [0, 0, (i % 2 ? 1 : -1) * 0.4]);
            }
            R.add('hairB', 'leather', GEO.cyl8, 0x3a2416, [0, S(-0.23), S(-0.012)], [S(0.016), S(0.02), S(0.016)]);
            lock(R, 'hairB', c, [0, S(-0.24), S(-0.012)], [0, S(-0.31), S(-0.02)], S(0.03), S(0.018), { lo: true });
          } else {
            lock(R, 'hairA', c, [0, y0, S(-0.01)], [0, S(-0.2), S(-0.05)], S(0.07), S(0.05));
            lock(R, 'hairB', cL, [0, S(0.02), S(-0.02)], [0, S(-0.18), S(-0.01)], S(0.055), S(0.04), { blend: { to: 'hairA', at: 0, range: S(0.04), max: 0.5 } });
            lock(R, 'hairA', cD, [S(0.02), y0, S(-0.0)], [S(0.03), S(-0.15), S(-0.06)], S(0.045), S(0.03), { lo: true, outline: false });
          }
        }
        return R;
      }
    }
  }

  // ---------------- BARBES ----------------
  const BEARD_STYLES = ['stubble', 'short', 'full', 'goatee', 'mustache', 'braided'];
  function beard(R, style, color, spec) {
    const hs = R.P.headS, S = (v) => v * hs;
    const c = hexOf(color, 0x4a3020), cD = shade(c, -0.2);
    const J = (x, y, z) => [S(x), S(y - 0.115), S(z - 0.02)];
    // coque de barbe : sous la ligne des pommettes, en retrait des lèvres (les lèvres restent visibles)
    const shell = (k, col) => R.add('jaw', 'hair', GEO.beardShell, col, J(0, 0.105, 0.03), [S(0.122 * k), S(0.1 * k), S(0.122 * k)], [0, 0, 0], { uv: 2, outlineK: 0.6, blend: { to: 'head', at: S(0.0), range: S(0.03), max: 0.5 } });
    const stache = (w) => {
      for (const [, sx] of SIDES) R.add('mouth', 'hair', GEO.sphLo, c, [sx * S(0.018 * w), S(0.014), S(0.006)], [S(0.024 * w), S(0.009), S(0.012)], [0, 0, sx * 0.3], { outline: false });
    };
    switch (style) {
      case 'stubble': if (!R.faceMat) shell(0.99, mix(c, skinOf(spec, R), 0.55)); return R;
      case 'mustache': stache(1.1); return R;
      case 'goatee':
        stache(0.9);
        R.add('jaw', 'hair', GEO.sphLo, c, J(0, 0.035, 0.13), [S(0.03), S(0.04), S(0.025)], null, { outlineK: 0.6 });
        return R;
      case 'short': shell(1.03, c); stache(1); return R;
      case 'full': case 'braided': default:
        shell(1.08, c); stache(1.15);
        R.add('jaw', 'hair', GEO.cone6, c, J(0, 0.0, 0.1), [S(0.055), S(0.09), S(0.04)], [PI - 0.35, 0, 0], { outlineK: 0.6 });
        R.add('jaw', 'hair', GEO.sphLo, cD, J(0, 0.045, 0.098), [S(0.07), S(0.045), S(0.05)], null, { outlineK: 0.6 });
        if (style === 'braided') {
          for (let i = 0; i < 4; i++) R.add('jaw', 'hair', GEO.sphLo, i % 2 ? c : cD, J(0, -0.05 - i * 0.035, 0.105 - i * 0.008), [S(0.022), S(0.024), S(0.02)]);
          R.add('jaw', 'metal', GEO.cyl8, 0xb8a060, J(0, -0.18, 0.08), [S(0.014), S(0.018), S(0.014)]);
        }
        return R;
    }
  }

  // ---------------- MAINS ----------------
  // poses : courbure [phalange proximale, phalanges suivantes] (rad), écart, pouce
  const POSES = {
    open: { c: [0.12, 0.18], sp: 0.08, th: [0.6, 0.15] },
    relaxed: { c: [0.35, 0.5], sp: 0.04, th: [0.5, 0.3] },
    grip: { c: [1.3, 1.35], sp: 0.0, th: [1.1, 0.7] },
    fist: { c: [1.6, 1.9], sp: 0.0, th: [1.3, 1.0] },
    cast: { c: [0.3, 0.35], sp: 0.22, th: [0.9, 0.1] },
  };
  function hand(R, side, pose, color, layer, glove) {
    const sx = side === 'L' ? 1 : -1, b = 'wrist' + side;
    const P = POSES[pose] || POSES.relaxed;
    const L = layer || 'skin', c = color, cD = shade(c, -0.12), cL = shade(c, 0.05);
    const k = R.P.fem ? 0.9 : R.P.build === 'heavy' ? 1.1 : 1;
    const X = (v) => v * k;
    const tag = { tag: 'hand' };
    // poignet + paume (aplatie selon X : paume vers l'axe du corps)
    R.add(b, L, GEO.sphLo, c, [0, X(-0.005), 0], [X(0.026), X(0.03), X(0.032)], null, { tag: 'hand', outline: false, blend: { to: 'forearm' + side, at: X(0.0), range: X(0.03), max: 0.5 } });
    R.add(b, L, GEO.sphMid, c, [sx * X(0.002), X(-0.05), 0], [X(0.021), X(0.048), X(0.043)], null, tag);
    R.add(b, L, GEO.sphLo, cD, [-sx * X(0.012), X(-0.035), X(0.028)], [X(0.016), X(0.03), X(0.02)], [0, 0, sx * 0.3], { tag: 'hand', outline: false }); // éminence thénar
    // doigts : index (+Z) → auriculaire (-Z)
    const fz = [0.03, 0.01, -0.01, -0.028], fl = [0.068, 0.076, 0.07, 0.056], fr = [0.0108, 0.0112, 0.0106, 0.0094];
    const fy = [-0.092, -0.095, -0.093, -0.087];
    for (let i = 0; i < 4; i++) {
      const sp = (i - 1.5) * P.sp * 0.5;
      const a1 = P.c[0] + (pose === 'grip' || pose === 'fist' ? 0 : i * 0.04), a2 = a1 + P.c[1];
      const l1 = fl[i] * 0.52, l2 = fl[i] * 0.48;
      const base = [sx * X(0.001), X(fy[i]), X(fz[i])];
      const d1 = [-sx * Math.sin(a1) * Math.cos(sp), -Math.cos(a1) * Math.cos(sp), Math.sin(sp)];
      const m1 = [base[0] + d1[0] * X(l1), base[1] + d1[1] * X(l1), base[2] + d1[2] * X(l1)];
      const d2 = [-sx * Math.sin(a2) * Math.cos(sp), -Math.cos(a2) * Math.cos(sp), Math.sin(sp)];
      const e2 = [m1[0] + d2[0] * X(l2), m1[1] + d2[1] * X(l2), m1[2] + d2[2] * X(l2)];
      R.add(b, L, GEO.sphT, cL, base, X(fr[i] * 1.15), null, { tag: 'hand', outline: false });
      R.seg(b, L, GEO.cyl6o, c, base, m1, X(fr[i]), null, { tag: 'hand', outline: false });
      R.add(b, L, GEO.sphT, c, m1, X(fr[i] * 1.0), null, { tag: 'hand', outline: false });
      R.seg(b, L, GEO.cyl6o, c, m1, e2, X(fr[i] * 0.9), null, { tag: 'hand', outline: false });
      R.add(b, L, GEO.sphT, c, e2, X(fr[i] * 0.9), null, { tag: 'hand', outline: false });
    }
    // pouce (vers +Z, s'enroule vers l'axe du corps)
    const t0 = [-sx * X(0.012), X(-0.03), X(0.034)];
    const ta = P.th[0], tb = P.th[1];
    const td1 = [-sx * Math.sin(ta) * 0.75, -0.45 - 0.2 * Math.cos(ta), 0.55 * Math.cos(ta * 0.6)];
    const n1 = Math.hypot(td1[0], td1[1], td1[2]);
    const t1 = [t0[0] + td1[0] / n1 * X(0.04), t0[1] + td1[1] / n1 * X(0.04), t0[2] + td1[2] / n1 * X(0.04)];
    const td2 = [-sx * Math.sin(ta + tb) * 0.8, -0.5 + 0.3 * Math.sin(tb), 0.35 - 0.6 * Math.sin(tb)];
    const n2 = Math.hypot(td2[0], td2[1], td2[2]);
    const t2 = [t1[0] + td2[0] / n2 * X(0.034), t1[1] + td2[1] / n2 * X(0.034), t1[2] + td2[2] / n2 * X(0.034)];
    R.seg(b, L, GEO.cyl6o, c, t0, t1, X(0.0135), null, { tag: 'hand', outline: false });
    R.add(b, L, GEO.sphT, c, t1, X(0.0135), null, { tag: 'hand', outline: false });
    R.seg(b, L, GEO.cyl6o, c, t1, t2, X(0.012), null, { tag: 'hand', outline: false });
    R.add(b, L, GEO.sphT, c, t2, X(0.012), null, { tag: 'hand', outline: false });
    return R;
  }
  function hands(R, spec) {
    spec = spec || {};
    const sp = (R.spec && R.spec.palette) || {};
    const skin = hexOf(spec.skin != null ? spec.skin : (R.spec && R.spec.body && R.spec.body.skin), hexOf(sp.skin, 0xe9b892));
    const glove = spec.glove != null ? hexOf(spec.glove, null) : null;
    const layer = glove != null ? (spec.gloveLayer || 'leather') : 'skin';
    const col = glove != null ? glove : skin;
    const pR = spec.poseR || spec.pose || 'grip', pL = spec.poseL || spec.pose || 'relaxed';
    hand(R, 'R', pR, col, layer, glove != null);
    hand(R, 'L', pL, col, layer, glove != null);
    return R;
  }

  // ==================================================================
  // EXPORT
  // ==================================================================
  function rig(opts) {
    opts = opts || {};
    const R = new Rig(opts);
    R.spec = opts.spec || null;
    return R;
  }
  const HK = {
    version: 6,
    config: { skinning: true, outline: 0.016, minOutline: 0.06, proxyCells: 6 },
    rig, body, head, hands, hand, hair, beard,
    geo: GEO, rotTo, shade, mix, hexOf, proportions, merge,
    HEAD, FACE_UV, faceUV,
    // positions des traits sur la sphère du crâne (lues par G.HeroTex.face, mises à jour sur la géométrie réelle)
    FACE_LAYOUT: { u: 0.25, eyeV: 0.5, eyeDU: 0.062, browDV: -0.064, noseDV: 0.117, mouthDV: 0.24, chinDV: 0.33, cheekDU: 0.09, cheekDV: 0.094, faceDU: 0.16, earDU: 0.25 }, HAIR_STYLES, BEAR_STYLES: BEARD_STYLES, BEARD_STYLES, POSES: Object.keys(POSES), LAYERS,
    mat: baseMat, instanceMat, skinVariant,
    clearCache() { GEO_CACHE.clear(); },
    cacheSize() { return GEO_CACHE.size; },
  };
  // marque le calque d'origine des matériaux (pour ud.eyes)
  const _bm = baseMat;
  HK.mat = function (layer, opts) { const m = _bm(layer, opts); if (m && !LAYER_OF.has(m)) LAYER_OF.set(m, layer); return m; };
  G.HeroKit = HK;
})();
