window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D — js/graphics.js  →  G.GFX
   Modèles toon (héros, monstres, boss), salles, projectiles, ramassables,
   télégraphes. Dépend uniquement de THREE (r128).
   ===================================================================== */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T) { console.error('[GFX] THREE introuvable : graphics.js doit être chargé après three.min.js'); return; }

  // ------------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------------
  const PI = Math.PI, TAU = PI * 2, HPI = PI / 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const nowSec = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) / 1000;

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const _ca = new T.Color(), _cb = new T.Color();
  function mix(a, b, t) { return _ca.setHex(a).lerp(_cb.setHex(b), t).getHex(); }
  function shade(hex, f) {
    _ca.setHex(hex);
    if (f >= 0) _ca.lerp(_cb.setHex(0xffffff), f); else _ca.multiplyScalar(1 + f);
    return _ca.getHex();
  }
  function css(hex, a) {
    _ca.setHex(hex);
    if (a == null) return '#' + _ca.getHexString();
    return 'rgba(' + Math.round(_ca.r * 255) + ',' + Math.round(_ca.g * 255) + ',' + Math.round(_ca.b * 255) + ',' + a + ')';
  }
  function jitterColor(hex, rnd, amt) { return shade(hex, (rnd() - 0.5) * 2 * amt); }

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }

  // ------------------------------------------------------------------
  // Matériaux toon
  // ------------------------------------------------------------------
  // 4 texels, 3 tons francs (ombre / mi-ton / lumière)
  const GRADIENT = (() => {
    const tex = new T.DataTexture(new Uint8Array([88, 168, 255, 255]), 4, 1, T.LuminanceFormat);
    tex.minFilter = T.NearestFilter;
    tex.magFilter = T.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  })();

  function toon(color, opts) {
    const o = opts || {};
    const p = { color: color == null ? 0xffffff : color, gradientMap: GRADIENT };
    if (o.emissive != null) { p.emissive = o.emissive; p.emissiveIntensity = o.emissiveIntensity != null ? o.emissiveIntensity : 1; }
    if (o.map) p.map = o.map;
    if (o.emissiveMap) { p.emissiveMap = o.emissiveMap; if (p.emissive == null) p.emissive = 0xffffff; }
    if (o.vertexColors) p.vertexColors = true;
    if (o.transparent || (o.opacity != null && o.opacity < 1)) { p.transparent = true; p.opacity = o.opacity != null ? o.opacity : 1; }
    if (o.side != null) p.side = o.side;
    if (o.depthWrite != null) p.depthWrite = o.depthWrite;
    if (o.flatShading) p.flatShading = true;
    return new T.MeshToonMaterial(p);
  }

  const OUTLINE_MATS = {};
  function outlineMat(color) {
    const c = color || 0;
    if (!OUTLINE_MATS[c]) { OUTLINE_MATS[c] = new T.MeshBasicMaterial({ color: c, side: T.BackSide }); OUTLINE_MATS[c].userData.shared = true; } return OUTLINE_MATS[c];
  }
  // matériaux partagés (pas de flash)
  const GLOW_VC = new T.MeshBasicMaterial({ vertexColors: true }); GLOW_VC.userData.shared = true;
  const AURA_VC = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false }); AURA_VC.userData.shared = true;
  const ENV_MAT = toon(0xffffff, { vertexColors: true });
  const BASIC = {};
  function basic(color, opacity, additive, side) {
    const k = color + '|' + (opacity == null ? 1 : opacity) + '|' + (additive ? 1 : 0) + '|' + (side || 0);
    if (BASIC[k]) return BASIC[k];
    const p = { color };
    if (opacity != null && opacity < 1) { p.transparent = true; p.opacity = opacity; p.depthWrite = false; }
    if (additive) { p.blending = T.AdditiveBlending; p.transparent = true; p.depthWrite = false; }
    if (side) p.side = side;
    BASIC[k] = new T.MeshBasicMaterial(p); BASIC[k].userData.shared = true; return BASIC[k];
  }
  const TOONS = {};
  function toonShared(color) { if (!TOONS[color]) { TOONS[color] = toon(color); TOONS[color].userData.shared = true; } return TOONS[color]; }

  // ------------------------------------------------------------------
  // Contour cartoon : copie BackSide noire agrandie (géométrie partagée)
  //   thickness > 1  → facteur d'échelle uniforme (ex. 1.06)
  //   thickness ≤ 1  → épaisseur absolue (unités locales, défaut 0.035)
  // ------------------------------------------------------------------
  const _v1 = new T.Vector3(), _v2 = new T.Vector3();
  function addOutline(object3D, thickness, color) {
    if (!object3D) return object3D;
    const list = [];
    object3D.traverse(o => {
      if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline && !o.userData.hasOutline) list.push(o);
    });
    const mat = outlineMat(color || 0);
    for (const m of list) {
      const g = m.geometry;
      if (!g) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      const out = new T.Mesh(g, mat);
      out.userData.isOutline = true;
      out.castShadow = false; out.receiveShadow = false;
      const size = g.boundingBox.getSize(_v1), c = g.boundingBox.getCenter(_v2);
      let fx, fy, fz;
      if (thickness != null && thickness > 1) { fx = fy = fz = thickness; }
      else {
        const t = thickness != null ? thickness : 0.035;
        fx = inflateF(size.x, m.scale.x, t); fy = inflateF(size.y, m.scale.y, t); fz = inflateF(size.z, m.scale.z, t);
      }
      out.scale.set(fx, fy, fz);
      out.position.set(c.x * (1 - fx), c.y * (1 - fy), c.z * (1 - fz));
      m.add(out);
      m.userData.hasOutline = true;
    }
    return object3D;
  }
  function inflateF(size, s, t) {
    const S = size * Math.abs(s || 1);
    return S > 1e-4 ? Math.min(1 + 2 * t / S, 1.7) : 1;
  }

  // ------------------------------------------------------------------
  // Géométries primitives partagées (unitaires, mises à l'échelle par pièce)
  // ------------------------------------------------------------------
  const GEO = {};
  const gk = (k, f) => GEO[k] || (GEO[k] = (() => { const g = f(); g.userData.shared = true; return g; })());   // cache partagé : jamais libéré par game.js
  const G_BOX = new T.BoxGeometry(1, 1, 1);
  G_BOX.userData.shared = true;
  const G_SPH = new T.SphereGeometry(1, 14, 10);
  G_SPH.userData.shared = true;
  const G_SPH_LO = new T.SphereGeometry(1, 8, 6);
  G_SPH_LO.userData.shared = true;
  const G_HEMI = new T.SphereGeometry(1, 14, 6, 0, TAU, 0, HPI);
  G_HEMI.userData.shared = true;
  const G_CYL = new T.CylinderGeometry(1, 1, 1, 12);
  G_CYL.userData.shared = true;
  const G_CYL8 = new T.CylinderGeometry(1, 1, 1, 8);
  G_CYL8.userData.shared = true;
  const G_CYL6 = new T.CylinderGeometry(1, 1, 1, 6);
  G_CYL6.userData.shared = true;
  const G_CONE = new T.ConeGeometry(1, 1, 10);
  G_CONE.userData.shared = true;
  const G_CONE6 = new T.ConeGeometry(1, 1, 6);
  G_CONE6.userData.shared = true;
  const G_CONE4 = new T.ConeGeometry(1, 1, 4);
  G_CONE4.userData.shared = true;
  const G_DODE = new T.DodecahedronGeometry(1, 0);
  G_DODE.userData.shared = true;
  const G_ICO = new T.IcosahedronGeometry(1, 0);
  G_ICO.userData.shared = true;
  const G_OCTA = new T.OctahedronGeometry(1, 0);
  G_OCTA.userData.shared = true;
  const cylT = (top, seg) => { seg = seg || 12; return gk('cylT' + top.toFixed(2) + '_' + seg, () => new T.CylinderGeometry(top, 1, 1, seg)); };
  const torus = (tube, arc, seg) => {
    arc = arc == null ? TAU : arc; seg = seg || 16;
    return gk('tor' + tube + '_' + arc.toFixed(3) + '_' + seg, () => new T.TorusGeometry(1, tube, 6, seg, arc));
  };
  // robe effilochée (cylindre ouvert, bas dentelé)
  const G_ROBE = gk('robe', () => {
    const g = new T.CylinderGeometry(0.42, 1, 1, 14, 3, true);
    const pos = g.attributes.position;
    const cols = 15;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -0.49) {
        const col = i % cols;
        pos.setY(i, pos.getY(i) - (col % 2 ? 0.22 : 0.02));
      }
    }
    g.computeVertexNormals();
    return g;
  });
  // cape : demi-cylindre arrière ouvert
  const G_CAPE = gk('cape', () => new T.CylinderGeometry(0.75, 1, 1, 10, 1, true, HPI, PI));
  // aile de chauve-souris (extrudée, fine)
  const G_WING = gk('wing', () => {
    const s = new T.Shape();
    s.moveTo(0, 0.12);
    s.lineTo(0.32, 0.34); s.lineTo(0.62, 0.32); s.lineTo(0.95, 0.12);
    s.quadraticCurveTo(0.82, 0.02, 0.78, -0.12);
    s.quadraticCurveTo(0.66, -0.04, 0.55, -0.16);
    s.quadraticCurveTo(0.42, -0.06, 0.3, -0.16);
    s.quadraticCurveTo(0.18, -0.06, 0, -0.1);
    s.lineTo(0, 0.12);
    const g = new T.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -0.0175);
    return g;
  });

  // ------------------------------------------------------------------
  // Fusion de pièces (une géométrie par os → peu de draw calls)
  // pièce = { g, c, p:[x,y,z], s:[sx,sy,sz], r:[rx,ry,rz], ol, ot }
  // ------------------------------------------------------------------
  const _m4 = new T.Matrix4(), _m4b = new T.Matrix4(), _m3 = new T.Matrix3();
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

  function mergePieces(list, mode, t) {
    const outline = mode === 'outline';
    let n = 0;
    for (const p of list) { if (outline && !p.ol) continue; n += nonIdx(p.g).attributes.position.count; }
    if (!n) return null;
    const pos = new Float32Array(n * 3);
    const nor = outline ? null : new Float32Array(n * 3);
    const col = outline ? null : new Float32Array(n * 3);
    let o = 0;
    for (const p of list) {
      if (outline && !p.ol) continue;
      const g = nonIdx(p.g);
      const pa = g.attributes.position.array, na = g.attributes.normal ? g.attributes.normal.array : null;
      const cnt = g.attributes.position.count;
      _eu.set(p.r[0], p.r[1], p.r[2], 'XYZ'); _q.setFromEuler(_eu);
      _m4.compose(_va.set(p.p[0], p.p[1], p.p[2]), _q, _vb.set(p.s[0], p.s[1], p.s[2]));
      if (outline) {
        const bb = bbox(p.g), tt = p.ot != null ? p.ot : t;
        const fx = inflateF(bb.max.x - bb.min.x, p.s[0], tt);
        const fy = inflateF(bb.max.y - bb.min.y, p.s[1], tt);
        const fz = inflateF(bb.max.z - bb.min.z, p.s[2], tt);
        _m4b.makeScale(fx, fy, fz);
        _m4b.setPosition((bb.max.x + bb.min.x) * 0.5 * (1 - fx), (bb.max.y + bb.min.y) * 0.5 * (1 - fy), (bb.max.z + bb.min.z) * 0.5 * (1 - fz));
        _m4.multiply(_m4b);
      } else {
        _m3.getNormalMatrix(_m4);
        _col.setHex(p.c);
      }
      const e = _m4.elements, m = _m3.elements;
      const flip = p.s[0] * p.s[1] * p.s[2] < 0;
      for (let i = 0; i < cnt; i++) {
        const k = flip ? (i - (i % 3)) + FLIP[i % 3] : i;
        const x = pa[k * 3], y = pa[k * 3 + 1], z = pa[k * 3 + 2], j = o * 3;
        pos[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (!outline) {
          const nx = na ? na[k * 3] : 0, ny = na ? na[k * 3 + 1] : 1, nz = na ? na[k * 3 + 2] : 0;
          const X = m[0] * nx + m[3] * ny + m[6] * nz, Y = m[1] * nx + m[4] * ny + m[7] * nz, Z = m[2] * nx + m[5] * ny + m[8] * nz;
          const L = Math.sqrt(X * X + Y * Y + Z * Z) || 1;
          nor[j] = X / L; nor[j + 1] = Y / L; nor[j + 2] = Z / L;
          col[j] = _col.r; col[j + 1] = _col.g; col[j + 2] = _col.b;
        }
        o++;
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    if (nor) { geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3)); }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  // orientation : rotation (Euler XYZ) qui aligne +Y sur la direction donnée
  const _up = new T.Vector3(0, 1, 0), _dir = new T.Vector3(), _qq = new T.Quaternion(), _ee = new T.Euler();
  function rotTo(x, y, z) {
    _dir.set(x, y, z);
    if (_dir.lengthSq() < 1e-9) return [0, 0, 0];
    _dir.normalize();
    _qq.setFromUnitVectors(_up, _dir);
    _ee.setFromQuaternion(_qq, 'XYZ');
    return [_ee.x, _ee.y, _ee.z];
  }

  // ------------------------------------------------------------------
  // Enregistreur de squelette (os = Group) + pièces par os/couche
  // couches : solid, trans, glow, aura, eyes, blade, g_epee, g_dague, g_feu, cape
  // ------------------------------------------------------------------
  const DEFAULT_OL = { solid: true, trans: true, glow: false, aura: false, eyes: false, blade: true, g_epee: true, g_dague: true, g_feu: true, cape: false };
  class Rec {
    constructor(root) { this.root = root; this.bones = { root }; this.pieces = {}; this.order = []; }
    bone(name, parent, x, y, z) {
      const g = new T.Group();
      g.name = name;
      g.position.set(x || 0, y || 0, z || 0);
      (this.bones[parent] || this.root).add(g);
      this.bones[name] = g;
      return g;
    }
    add(bone, layer, g, c, p, s, r, ol) {
      if (!this.bones[bone]) bone = 'root';
      const L = layer || 'solid';
      const key = bone + '|' + L;
      if (!this.pieces[key]) { this.pieces[key] = []; this.order.push(key); }
      if (s == null) s = [1, 1, 1]; else if (typeof s === 'number') s = [s, s, s];
      this.pieces[key].push({ g, c, p: p || [0, 0, 0], s, r: r || [0, 0, 0], ol: ol != null ? !!ol : !!DEFAULT_OL[L] });
    }
  }
  // segment (cylindre) entre deux points
  function seg(R, bone, layer, geo, color, a, b, rad, ol) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
    R.add(bone, layer, geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [rad, len, rad], rotTo(dx, dy, dz), ol);
  }

  const RIG_CACHE = {};
  function assemble(R, key, o) {
    o = o || {};
    let cache = RIG_CACHE[key];
    const build = !cache;
    if (build) cache = RIG_CACHE[key] = {};
    const mats = {}, flash = [], meshes = {};
    const getMat = L => {
      if (mats[L]) return mats[L];
      let m;
      switch (L) {
        case 'glow': m = GLOW_VC; break;
        case 'aura': m = AURA_VC; break;
        case 'trans': m = toon(0xffffff, { vertexColors: true, transparent: true, opacity: o.transOpacity || 0.7 }); flash.push(m); break;
        case 'cape': m = toon(0xffffff, { vertexColors: true, side: T.DoubleSide }); flash.push(m); break;
        case 'eyes': m = toon(0xffffff, { vertexColors: true, emissive: o.eyeColor != null ? o.eyeColor : 0xff3030, emissiveIntensity: 0.85 }); break;
        case 'solid': m = toon(0xffffff, { vertexColors: true }); flash.push(m); break;
        default: m = toon(0xffffff, { vertexColors: true });
      }
      return (mats[L] = m);
    };
    const boneNames = [];
    for (const k of R.order) {
      const i = k.indexOf('|');
      const bone = k.slice(0, i), L = k.slice(i + 1);
      if (boneNames.indexOf(bone) < 0) boneNames.push(bone);
      let geo = cache[k];
      if (build) { geo = cache[k] = mergePieces(R.pieces[k], 'solid'); if (geo) geo.userData.shared = true; }
      if (!geo) continue;
      const mesh = new T.Mesh(geo, getMat(L));
      mesh.castShadow = L !== 'aura';
      mesh.receiveShadow = false;
      mesh.userData.layer = L;
      if (L === 'aura') mesh.renderOrder = 2;
      R.bones[bone].add(mesh);
      (meshes[bone] = meshes[bone] || {})[L] = mesh;
    }
    for (const bone of boneNames) {
      const ok = 'OL|' + bone;
      let geo = cache[ok];
      if (build) {
        const all = [];
        for (const k of R.order) if (k.slice(0, k.indexOf('|')) === bone) for (const p of R.pieces[k]) all.push(p);
        geo = cache[ok] = mergePieces(all, 'outline', o.outline != null ? o.outline : 0.035); if (geo) geo.userData.shared = true;
      }
      if (!geo) continue;
      const m = new T.Mesh(geo, outlineMat(o.outlineColor || 0));
      m.userData.isOutline = true;
      R.bones[bone].add(m);
    }
    return { mats, flash, meshes };
  }

  function charRoot(kind) {
    const root = new T.Group();
    root.name = kind;
    const rig = new T.Group();
    rig.name = 'rig';
    root.add(rig);
    return { root, rig };
  }

  function finalizeChar(root, rig, R, asm, info, sc, kind) {
    const ud = root.userData, B = R.bones;
    ud.kind = kind;
    ud.rig = rig;
    ud.mats = asm.flash;
    ud.height = (info.height || 1.8) * sc;
    ud.radius = (info.radius || 0.5) * sc;
    ud.baseScale = sc;
    ud.baseY = info.baseY || 0;
    ud.float = !!info.float;
    ud.walkSpeed = info.walkSpeed || 9;
    ud.phase = Math.random() * TAU;
    ud.eyes = asm.mats.eyes ? [asm.mats.eyes] : [];
    for (const k of ['armL', 'armR', 'legL', 'legR', 'head', 'body']) if (B[k]) ud[k] = B[k];
    ud.parts = {};
    for (const k in B) if (k !== 'root') ud.parts[k] = B[k];
    if (info.legs) { ud.parts.legs = info.legs.map(n => B[n]).filter(Boolean); ud.legInfo = info.legInfo || []; }
    ud.rest = {};
    for (const k in B) if (k !== 'root') ud.rest[k] = [B[k].rotation.x, B[k].rotation.y, B[k].rotation.z];
    rig.position.y = ud.baseY;
    rig.scale.setScalar(sc);
    ud.meshes = asm.meshes;
    return root;
  }

  // ==================================================================
  // HÉROS (chibi : grosse tête, regard vers +Z, pieds en y = 0)
  //   bras droit = côté -X (le perso regarde +Z)
  // ==================================================================
  const HERO_PAL = {
    Guerrier: { main: 0x3d7cff, mainD: 0x2450c8, trim: 0xffcc33, cloth: 0x27356a, boot: 0x687286, metal: 0xd3dceb, sleeve: 0x3d7cff, glove: 0x9aa6bb },
    Mage:     { main: 0x9147e6, mainD: 0x5e2aa6, trim: 0xffcf40, cloth: 0x45286f, boot: 0x3a2560, metal: 0xd8c8ff, sleeve: 0x9147e6, glove: 0xffd2a8 },
    Voleur:   { main: 0x2fb551, mainD: 0x1c7c37, trim: 0xe8443a, cloth: 0x4b3527, boot: 0x6b4423, metal: 0xd0d6de, sleeve: 0x2fb551, glove: 0x7a4b2a },
  };
  const SIDES = [['L', 1], ['R', -1]];

  function heroFace(R, skin, hair, hairD, withEars) {
    const A = R.add.bind(R);
    A('head', 'solid', G_SPH, skin, [0, 0.05, 0], [0.4, 0.38, 0.38]);
    for (const [, sx] of SIDES) {
      A('head', 'solid', G_SPH, 0x1d1d2b, [sx * 0.14, 0.03, 0.335], [0.06, 0.09, 0.04], null, false);
      A('head', 'glow', G_SPH_LO, 0xffffff, [sx * 0.14 + 0.02, 0.07, 0.37], [0.022, 0.026, 0.015]);
      A('head', 'solid', G_BOX, hairD, [sx * 0.14, 0.15, 0.335], [0.1, 0.025, 0.03], [0, 0, -sx * 0.12], false);
      A('head', 'solid', G_SPH_LO, 0xff9a9a, [sx * 0.25, -0.06, 0.275], [0.06, 0.03, 0.02], [0, sx * 0.6, 0], false);
      if (withEars) A('head', 'solid', G_SPH, skin, [sx * 0.39, 0.02, 0], [0.07, 0.1, 0.07]);
    }
    A('head', 'solid', G_BOX, 0x8a3b2e, [0, -0.12, 0.345], [0.08, 0.022, 0.02], null, false);
    A('head', 'solid', G_SPH_LO, shade(skin, -0.08), [0, -0.03, 0.36], 0.03, null, false);
  }
  function heroBangs(R, hair, hairD, y, z) {
    const A = R.add.bind(R);
    A('head', 'solid', G_CONE, hair, [0, y, z], [0.07, 0.17, 0.06], [PI - 0.45, 0, 0]);
    A('head', 'solid', G_CONE, hairD, [0.29, y - 0.05, z - 0.1], [0.08, 0.22, 0.07], [PI - 0.3, 0, 0.25]);
    A('head', 'solid', G_CONE, hair, [-0.29, y - 0.05, z - 0.1], [0.08, 0.22, 0.07], [PI - 0.3, 0, -0.25]);
    A('head', 'solid', G_CONE, hairD, [0.15, y + 0.03, z - 0.01], [0.06, 0.12, 0.05], [PI - 0.5, 0, 0.35]);
    A('head', 'solid', G_CONE, hair, [-0.15, y + 0.03, z - 0.01], [0.06, 0.12, 0.05], [PI - 0.5, 0, -0.35]);
  }
  function heroHairFull(R, hair, hairD) {
    const A = R.add.bind(R);
    A('head', 'solid', G_HEMI, hair, [0, 0.07, -0.02], [0.43, 0.42, 0.43], [-0.28, 0, 0]);
    A('head', 'solid', G_SPH, hair, [0, 0.0, -0.12], [0.4, 0.36, 0.3]);
    heroBangs(R, hair, hairD, 0.17, 0.36);
    // mèches en pointes (style anime)
    A('head', 'solid', G_CONE, hair, [0, 0.47, -0.05], [0.1, 0.26, 0.1], [-0.5, 0, 0]);
    A('head', 'solid', G_CONE, hairD, [0.17, 0.42, 0.0], [0.09, 0.24, 0.09], [-0.2, 0, -0.55]);
    A('head', 'solid', G_CONE, hairD, [-0.17, 0.42, 0.0], [0.09, 0.24, 0.09], [-0.2, 0, 0.55]);
    A('head', 'solid', G_CONE, hair, [0.1, 0.38, -0.22], [0.09, 0.24, 0.09], [-0.95, 0, -0.3]);
    A('head', 'solid', G_CONE, hair, [-0.1, 0.38, -0.22], [0.09, 0.24, 0.09], [-0.95, 0, 0.3]);
    A('head', 'solid', G_CONE, hairD, [0, 0.22, -0.38], [0.1, 0.22, 0.1], [-1.9, 0, 0]);
  }
  function beltDagger(R, x, y, z) {
    const A = R.add.bind(R);
    A('body', 'solid', G_BOX, 0x5a3a1e, [x, y - 0.12, z], [0.05, 0.2, 0.07], [0.25, 0, 0.2]);
    A('body', 'solid', G_CYL8, 0x3b2a1e, [x - 0.01, y + 0.03, z + 0.03], [0.025, 0.1, 0.025], [0.25, 0, 0.2]);
    A('body', 'g_dague', G_OCTA, 0x9fd8ff, [x - 0.02, y + 0.1, z + 0.05], [0.04, 0.05, 0.04]);
  }

  function makeHero(classId, opts) {
    opts = opts || {};
    const cls = HERO_PAL[classId] ? classId : 'Guerrier';
    const pal = Object.assign({}, HERO_PAL[cls]);
    if (opts.color != null) { pal.main = opts.color; pal.mainD = shade(opts.color, -0.3); pal.sleeve = opts.color; }
    const skin = opts.skin != null ? opts.skin : 0xffd2a8;
    const hair = opts.hair != null ? opts.hair : 0xffd23f;
    const hairD = shade(hair, -0.22);
    const { root, rig } = charRoot('hero');
    const R = new Rec(rig);
    const A = R.add.bind(R);

    R.bone('legL', 'root', 0.16, 0.62, 0); R.bone('legR', 'root', -0.16, 0.62, 0);
    R.bone('body', 'root', 0, 0.62, 0);
    R.bone('head', 'body', 0, 0.72, 0);
    R.bone('armL', 'body', 0.37, 0.44, 0); R.bone('armR', 'body', -0.37, 0.44, 0);
    R.bone('wristL', 'armL', 0, -0.42, 0.03); R.bone('wristR', 'armR', 0, -0.42, 0.03);

    // jambes
    for (const [s] of SIDES) {
      const b = 'leg' + s;
      A(b, 'solid', G_CYL, pal.cloth, [0, -0.2, 0], [0.11, 0.42, 0.11]);
      A(b, 'solid', G_CYL, shade(pal.boot, 0.15), [0, -0.42, 0.01], [0.125, 0.08, 0.125]);
      A(b, 'solid', G_SPH, pal.boot, [0, -0.53, 0.04], [0.13, 0.1, 0.18]);
    }
    // bras
    for (const [s, sx] of SIDES) {
      const b = 'arm' + s;
      if (cls === 'Mage') {
        A(b, 'solid', cylT(0.55), pal.sleeve, [0, -0.2, 0], [0.14, 0.4, 0.14]);
        A(b, 'solid', torus(0.2), pal.trim, [0, -0.39, 0], [0.135, 0.135, 0.3], [HPI, 0, 0]);
        A(b, 'solid', G_SPH, skin, [0, -0.42, 0.01], 0.085);
      } else {
        A(b, 'solid', G_CYL, pal.sleeve, [0, -0.17, 0], [0.085, 0.36, 0.085]);
        A(b, 'solid', G_CYL, cls === 'Voleur' ? 0x7a4b2a : pal.metal, [0, -0.31, 0], [0.1, 0.1, 0.1]);
        A(b, 'solid', G_SPH, pal.glove, [0, -0.4, 0.01], 0.1);
      }
      if (cls === 'Guerrier') {
        A(b, 'solid', G_SPH, pal.mainD, [sx * 0.03, 0.03, 0], [0.17, 0.14, 0.17]);
        A(b, 'solid', G_CYL, pal.trim, [sx * 0.03, -0.04, 0], [0.172, 0.035, 0.172]);
      }
    }
    // visage + cheveux
    heroFace(R, skin, hair, hairD, cls !== 'Voleur');
    A('body', 'solid', G_CYL, skin, [0, 0.6, 0], [0.1, 0.12, 0.1]);

    let mainBone = 'wristR', mainLayer = 'g_epee', wristRest = -0.5, wristRestL = 0, height = 1.95;

    if (cls === 'Guerrier') {
      heroHairFull(R, hair, hairD);
      A('body', 'solid', cylT(0.85), pal.main, [0, 0.27, 0], [0.31, 0.54, 0.27]);
      A('body', 'solid', G_SPH, shade(pal.main, 0.28), [0, 0.32, 0.18], [0.23, 0.19, 0.11]);
      A('body', 'solid', G_BOX, pal.trim, [0, 0.47, 0.17], [0.3, 0.04, 0.12]);
      A('body', 'g_feu', G_OCTA, 0xff5a3a, [0, 0.34, 0.29], [0.055, 0.075, 0.035]);
      A('body', 'solid', G_CYL, 0x6b4226, [0, 0.06, 0], [0.325, 0.09, 0.285]);
      A('body', 'solid', G_BOX, pal.trim, [0, 0.06, 0.285], [0.1, 0.08, 0.03]);
      A('body', 'solid', cylT(0.9), pal.mainD, [0, -0.04, 0], [0.33, 0.14, 0.29]);
      // bouclier dans le dos
      A('body', 'solid', G_CYL, pal.mainD, [0, 0.3, -0.33], [0.3, 0.06, 0.3], [HPI + 0.15, 0, 0]);
      A('body', 'solid', torus(0.13), pal.metal, [0, 0.3, -0.335], [0.3, 0.3, 0.3], [0.15, 0, 0]);
      A('body', 'solid', G_BOX, 0xffffff, [0, 0.3, -0.37], [0.06, 0.32, 0.02], [0.15, 0, 0], false);
      A('body', 'solid', G_BOX, 0xffffff, [0, 0.34, -0.375], [0.24, 0.06, 0.02], [0.15, 0, 0], false);
      A('body', 'solid', G_SPH, pal.trim, [0, 0.3, -0.38], 0.06);
      beltDagger(R, 0.3, 0.02, 0.1);
      // épée
      A('wristR', 'solid', G_CYL8, 0x6b4226, [0, 0, -0.02], [0.035, 0.2, 0.035], [HPI, 0, 0]);
      A('wristR', 'solid', G_SPH, pal.trim, [0, 0, -0.13], 0.05);
      A('wristR', 'solid', G_BOX, pal.trim, [0, 0, 0.09], [0.34, 0.06, 0.07]);
      A('wristR', 'solid', G_SPH_LO, 0xff4a3a, [0, 0, 0.09], 0.04, null, false);
      A('wristR', 'g_epee', G_BOX, 0xe3ebf7, [0, 0, 0.5], [0.1, 0.035, 0.78]);
      A('wristR', 'g_epee', G_CONE4, 0xe3ebf7, [0, 0, 0.95], [0.05, 0.14, 0.0175], [HPI, 0, 0]);
      A('wristR', 'g_epee', G_BOX, 0xaebcd4, [0, 0.019, 0.47], [0.025, 0.006, 0.62], null, false);
      mainBone = 'wristR'; mainLayer = 'g_epee'; wristRest = -0.5;
    } else if (cls === 'Mage') {
      // cheveux longs sous le chapeau
      A('head', 'solid', G_SPH, hair, [0, -0.02, -0.12], [0.41, 0.4, 0.31]);
      A('head', 'solid', G_HEMI, hair, [0, 0.07, -0.02], [0.42, 0.4, 0.42], [-0.28, 0, 0]);
      A('head', 'solid', G_SPH, hairD, [0.33, -0.1, 0.06], [0.09, 0.22, 0.1]);
      A('head', 'solid', G_SPH, hairD, [-0.33, -0.1, 0.06], [0.09, 0.22, 0.1]);
      A('head', 'solid', G_SPH, hair, [0, -0.25, -0.24], [0.26, 0.24, 0.16]);
      heroBangs(R, hair, hairD, 0.17, 0.36);
      // chapeau pointu
      A('head', 'solid', G_CYL, pal.mainD, [0, 0.3, 0], [0.58, 0.04, 0.58], [-0.12, 0, 0]);
      A('head', 'solid', cylT(0.55), pal.mainD, [0, 0.52, -0.02], [0.36, 0.44, 0.36], [-0.12, 0, 0]);
      A('head', 'solid', G_CYL, pal.trim, [0, 0.36, 0.0], [0.37, 0.07, 0.37], [-0.12, 0, 0]);
      A('head', 'solid', G_CONE, pal.mainD, [0, 0.898, -0.181], [0.2, 0.42, 0.2], [-0.7, 0, 0]);
      A('head', 'glow', G_OCTA, 0xffe066, [0, 0.38, 0.37], [0.065, 0.065, 0.03]);
      // robe
      A('body', 'solid', cylT(0.8), pal.main, [0, 0.27, 0], [0.3, 0.54, 0.27]);
      A('body', 'solid', cylT(0.62), pal.main, [0, -0.2, 0], [0.48, 0.5, 0.44]);
      A('body', 'solid', torus(0.18), pal.trim, [0, -0.43, 0], [0.48, 0.44, 0.3], [HPI, 0, 0]);
      A('body', 'solid', G_BOX, pal.trim, [0, -0.15, 0.33], [0.08, 0.5, 0.03], [-0.37, 0, 0], false);
      A('body', 'solid', G_CYL, pal.trim, [0, 0.06, 0], [0.31, 0.07, 0.28]);
      A('body', 'solid', cylT(1.3), pal.mainD, [0, 0.56, 0], [0.2, 0.1, 0.2]);
      A('body', 'g_epee', G_OCTA, 0x7cf0ff, [0, 0.4, 0.27], [0.05, 0.065, 0.03]);
      A('body', 'solid', G_BOX, 0x5a3a1e, [0.2, 0.0, 0.25], [0.05, 0.14, 0.04], [0.3, 0, 0.3]);
      A('body', 'g_dague', G_OCTA, 0x9fd8ff, [0.18, 0.1, 0.28], [0.04, 0.05, 0.04]);
      // bâton + orbe
      A('wristR', 'solid', G_CYL8, 0x7a4a24, [0, 0, 0.2], [0.035, 1.3, 0.035], [HPI, 0, 0]);
      A('wristR', 'solid', G_CYL8, pal.trim, [0, 0, 0.84], [0.06, 0.06, 0.06], [HPI, 0, 0]);
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3;
        A('wristR', 'solid', G_CONE, pal.trim, [Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.92], [0.03, 0.2, 0.03], [HPI, 0, 0]);
      }
      A('wristR', 'solid', G_SPH_LO, pal.trim, [0, 0, -0.45], 0.05);
      A('wristR', 'g_feu', G_SPH, 0x7fe3ff, [0, 0, 0.98], 0.13);
      mainBone = 'wristR'; mainLayer = 'g_feu'; wristRest = -1.47; height = 2.3;
    } else { // Voleur
      A('head', 'solid', G_HEMI, pal.main, [0, 0.07, -0.03], [0.47, 0.47, 0.47], [-0.45, 0, 0]);
      A('head', 'solid', G_SPH, pal.main, [0, -0.02, -0.14], [0.44, 0.42, 0.36]);
      A('head', 'solid', torus(0.12), pal.mainD, [0, 0.07, -0.03], [0.47, 0.47, 0.47], [-HPI - 0.45, 0, 0]);
      A('head', 'solid', G_CONE, pal.mainD, [0, 0.22, -0.42], [0.12, 0.3, 0.12], [-1.9, 0, 0]);
      heroBangs(R, hair, hairD, 0.15, 0.35);
      // tunique + cuir
      A('body', 'solid', cylT(0.85), pal.main, [0, 0.27, 0], [0.31, 0.54, 0.27]);
      A('body', 'solid', cylT(0.88), 0x7a4b2a, [0, 0.2, 0], [0.32, 0.3, 0.28]);
      A('body', 'solid', G_BOX, 0x4a2c18, [0, 0.3, 0.26], [0.07, 0.55, 0.03], [0, 0, 0.7], false);
      A('body', 'solid', G_CYL, 0x3a2414, [0, 0.06, 0], [0.33, 0.08, 0.29]);
      A('body', 'solid', cylT(0.85), pal.mainD, [0, -0.05, 0], [0.34, 0.16, 0.3]);
      A('body', 'solid', G_BOX, 0x8a5a32, [0.24, 0.02, 0.17], [0.1, 0.12, 0.08], [0, -0.6, 0]);
      A('body', 'solid', G_BOX, 0x8a5a32, [-0.27, 0.02, 0.1], [0.08, 0.1, 0.08], [0, 0.9, 0]);
      // écharpe
      A('body', 'solid', torus(0.38), pal.trim, [0, 0.55, 0], [0.22, 0.21, 0.2], [HPI, 0, 0]);
      A('body', 'g_feu', G_OCTA, 0xffb03a, [0, 0.51, 0.25], [0.045, 0.055, 0.03]);
      R.bone('scarf', 'body', 0.08, 0.56, -0.2);
      A('scarf', 'solid', G_BOX, pal.trim, [0, -0.06, -0.14], [0.12, 0.04, 0.3], [-0.5, 0, 0]);
      A('scarf', 'solid', G_BOX, shade(pal.trim, -0.15), [-0.09, -0.1, -0.1], [0.1, 0.035, 0.24], [-0.7, 0.2, 0]);
      // épée courte dans le dos
      A('body', 'solid', G_BOX, 0x4a2c18, [0, 0.3, -0.3], [0.08, 0.6, 0.05], [0, 0, 0.7]);
      A('body', 'solid', G_CYL8, 0x3b2a1e, [-0.22, 0.56, -0.3], [0.025, 0.14, 0.025], [0, 0, 0.7]);
      A('body', 'g_epee', G_OCTA, 0x9fe8ff, [-0.27, 0.62, -0.3], [0.045, 0.06, 0.045]);
      // dagues
      for (const w of ['wristR', 'wristL']) {
        A(w, 'solid', G_CYL8, 0x3b2a1e, [0, 0, -0.02], [0.03, 0.14, 0.03], [HPI, 0, 0]);
        A(w, 'solid', G_BOX, 0x9aa3ad, [0, 0, 0.06], [0.18, 0.04, 0.05]);
        A(w, 'g_dague', G_BOX, 0xe6edf5, [0, 0, 0.24], [0.07, 0.025, 0.32]);
        A(w, 'g_dague', G_CONE4, 0xe6edf5, [0, 0, 0.44], [0.035, 0.1, 0.0125], [HPI, 0, 0]);
      }
      mainBone = 'wristR'; mainLayer = 'g_dague'; wristRest = -0.25; wristRestL = -0.25; height = 1.95;
    }

    const key = 'hero|' + cls + '|' + hair + '|' + skin + '|' + pal.main;
    const asm = assemble(R, key, { outline: 0.03 });
    R.bones.wristR.rotation.x = wristRest;
    R.bones.wristL.rotation.x = wristRestL;
    finalizeChar(root, rig, R, asm, { height, radius: 0.5, walkSpeed: 10 }, 1, 'hero');
    const ud = root.userData;
    ud.classId = cls;
    ud.wristRest = wristRest;
    ud.blade = (asm.meshes[mainBone] && asm.meshes[mainBone][mainLayer]) || null;
    ud.glow = { epee: [], dague: [], feu: [] };
    for (const b in asm.meshes) for (const L in asm.meshes[b]) {
      if (L === 'g_epee') ud.glow.epee.push(asm.meshes[b][L]);
      if (L === 'g_dague') ud.glow.dague.push(asm.meshes[b][L]);
      if (L === 'g_feu') ud.glow.feu.push(asm.meshes[b][L]);
    }
    if (cls === 'Mage') for (const m of ud.glow.feu) {
      m.material.emissive.setHex(0x2a8fff); m.material.emissiveIntensity = 0.55;
      m.material.userData.base = [0x2a8fff, 0.55];
    }
    ud.weaponLevels = { epee: 1, dague: 1, feu: 1 };
    ud.auras = [];
    rig.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.userData.owner = 'hero'; });
    return root;
  }

  // ------------------------------------------------------------------
  // Lueur d'arme : niv ≥ 4 bleu, ≥ 7 violet, 10 or
  // ------------------------------------------------------------------
  const AURA_MATS = {};
  function auraMat(color) {
    if (!AURA_MATS[color]) { AURA_MATS[color] = new T.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, side: T.BackSide,
    }); AURA_MATS[color].userData.shared = true; }
    return AURA_MATS[color];
  }
  const GLOW_TIERS = [0, 0x3fa9ff, 0xb44dff, 0xffc633];
  function setHeroWeaponLevel(hero, weaponId, level) {
    const ud = hero && hero.userData;
    if (!ud || !ud.glow) return;
    level = Math.max(0, level | 0);
    ud.weaponLevels[weaponId] = level;
    const list = ud.glow[weaponId];
    if (!list) return;
    const tier = level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0;
    const color = GLOW_TIERS[tier];
    for (const mesh of list) {
      const m = mesh.material, base = m.userData.base;
      if (tier) { m.emissive.setHex(color); m.emissiveIntensity = tier === 3 ? 0.95 : 0.7; }
      else if (base) { m.emissive.setHex(base[0]); m.emissiveIntensity = base[1]; }
      else { m.emissive.setHex(0); m.emissiveIntensity = 1; }
      let aura = mesh.userData.aura;
      if (!aura && tier) {
        aura = new T.Mesh(mesh.geometry, auraMat(color));
        aura.userData.isOutline = true;
        aura.renderOrder = 3;
        mesh.add(aura);
        mesh.userData.aura = aura;
        ud.auras.push(aura);
      }
      if (aura) {
        aura.visible = !!tier;
        if (tier) {
          aura.material = auraMat(color);
          const g = mesh.geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          const size = g.boundingBox.getSize(_v1), c = g.boundingBox.getCenter(_v2);
          const t = 0.035 + tier * 0.018;
          const fx = inflateF(size.x, 1, t), fy = inflateF(size.y, 1, t), fz = inflateF(size.z, 1, t);
          aura.scale.set(fx, fy, fz);
          aura.position.set(c.x * (1 - fx), c.y * (1 - fy), c.z * (1 - fz));
        }
      }
    }
  }

  // ==================================================================
  // ENNEMIS
  // ==================================================================
  const tinted = (hex, tint, k) => (tint == null ? hex : mix(hex, tint, k == null ? 0.55 : k));

  // squelette générique (k = facteur d'échelle), utilisé par skeleton/archer/skeletonKing
  function buildSkeleton(R, pal, k, o) {
    o = o || {};
    const A = R.add.bind(R);
    const eyeLayer = o.eyeLayer || 'glow';
    const hipY = 0.6 * k;
    R.bone('legL', 'root', 0.12 * k, hipY, 0); R.bone('legR', 'root', -0.12 * k, hipY, 0);
    R.bone('body', 'root', 0, hipY, 0);
    R.bone('head', 'body', 0, 0.66 * k, 0);
    R.bone('jaw', 'head', 0, -0.02 * k, 0.0);
    R.bone('armL', 'body', 0.25 * k, 0.5 * k, 0); R.bone('armR', 'body', -0.25 * k, 0.5 * k, 0);
    const bone = pal.bone, dark = pal.dark;
    for (const [s] of SIDES) {
      const b = 'leg' + s;
      A(b, 'solid', G_CYL8, bone, [0, -0.14 * k, 0], [0.045 * k, 0.27 * k, 0.045 * k]);
      A(b, 'solid', G_SPH_LO, bone, [0, -0.29 * k, 0], 0.06 * k);
      A(b, 'solid', G_CYL8, bone, [0, -0.43 * k, 0], [0.04 * k, 0.25 * k, 0.04 * k]);
      A(b, 'solid', G_BOX, dark, [0, -0.57 * k, 0.04 * k], [0.11 * k, 0.06 * k, 0.2 * k]);
    }
    A('body', 'solid', G_SPH, bone, [0, 0.02 * k, 0], [0.17 * k, 0.08 * k, 0.11 * k]);
    A('body', 'solid', G_CYL8, dark, [0, 0.25 * k, -0.03 * k], [0.04 * k, 0.46 * k, 0.04 * k]);
    for (const [y, r] of [[0.22, 0.15], [0.31, 0.18], [0.40, 0.19]]) {
      A('body', 'solid', torus(0.16), bone, [0, y * k, 0.01 * k], [r * k, r * 0.8 * k, r * k], [HPI, 0, 0]);
    }
    A('body', 'solid', G_BOX, bone, [0, 0.48 * k, 0], [0.44 * k, 0.06 * k, 0.08 * k]);
    A('body', 'solid', G_BOX, bone, [0, 0.33 * k, 0.15 * k], [0.05 * k, 0.22 * k, 0.03 * k]);
    A('body', 'solid', G_BOX, pal.cloth, [0, -0.08 * k, 0.1 * k], [0.18 * k, 0.2 * k, 0.02 * k], [0.15, 0, 0]);
    A('body', 'solid', G_BOX, pal.cloth, [0, -0.08 * k, -0.1 * k], [0.2 * k, 0.18 * k, 0.02 * k], [-0.15, 0, 0]);
    // crâne
    A('head', 'solid', G_SPH, bone, [0, 0.12 * k, 0], [0.25 * k, 0.24 * k, 0.25 * k]);
    A('head', 'solid', G_BOX, bone, [0, 0.0, 0.1 * k], [0.2 * k, 0.08 * k, 0.14 * k]);
    for (const [, sx] of SIDES) {
      A('head', 'solid', G_SPH_LO, 0x1a1414, [sx * 0.09 * k, 0.11 * k, 0.2 * k], [0.07 * k, 0.075 * k, 0.05 * k], null, false);
      A('head', eyeLayer, G_SPH_LO, pal.eye, [sx * 0.09 * k, 0.11 * k, 0.235 * k], 0.036 * k);
    }
    A('head', 'solid', G_CONE4, 0x1a1414, [0, 0.03 * k, 0.235 * k], [0.025 * k, 0.05 * k, 0.02 * k], [PI, 0, 0], false);
    A('head', 'solid', G_BOX, 0xffffff, [0, -0.025 * k, 0.17 * k], [0.15 * k, 0.03 * k, 0.02 * k], null, false);
    A('jaw', 'solid', G_BOX, bone, [0, -0.06 * k, 0.08 * k], [0.19 * k, 0.07 * k, 0.16 * k]);
    A('jaw', 'solid', G_BOX, 0xffffff, [0, -0.02 * k, 0.155 * k], [0.15 * k, 0.025 * k, 0.02 * k], null, false);
    for (const [s] of SIDES) {
      const b = 'arm' + s;
      A(b, 'solid', G_SPH_LO, bone, [0, 0, 0], 0.065 * k);
      A(b, 'solid', G_CYL8, bone, [0, -0.13 * k, 0], [0.035 * k, 0.24 * k, 0.035 * k]);
      A(b, 'solid', G_SPH_LO, bone, [0, -0.26 * k, 0], 0.045 * k);
      A(b, 'solid', G_CYL8, bone, [0, -0.38 * k, 0], [0.03 * k, 0.22 * k, 0.03 * k]);
      A(b, 'solid', G_SPH_LO, bone, [0, -0.5 * k, 0.01 * k], [0.055 * k, 0.06 * k, 0.06 * k]);
    }
  }

  const ENEMY_BUILD = {
    skeleton(R, tint) {
      const pal = { bone: tinted(0xefe8d4, tint), dark: tinted(0xb8ad90, tint), eye: 0xff2a2a, cloth: 0x5b3a2a };
      buildSkeleton(R, pal, 1);
      const A = R.add.bind(R);
      // épée rouillée
      A('armR', 'solid', G_CYL8, 0x5a3a20, [0, -0.5, 0.02], [0.025, 0.15, 0.025], [HPI, 0, 0]);
      A('armR', 'solid', G_BOX, 0x8a6a4a, [0, -0.5, 0.1], [0.18, 0.04, 0.04]);
      A('armR', 'solid', G_BOX, 0xaaa79a, [0, -0.5, 0.38], [0.07, 0.02, 0.52]);
      A('armR', 'solid', G_CONE4, 0xaaa79a, [0, -0.5, 0.67], [0.035, 0.08, 0.01], [HPI, 0, 0]);
      A('armR', 'solid', G_BOX, 0x7a5a3a, [0.02, -0.49, 0.3], [0.03, 0.022, 0.08], null, false);
      // petit bouclier en bois
      A('armL', 'solid', G_CYL, 0x7a5230, [0.07, -0.32, 0.02], [0.2, 0.04, 0.2], [0, 0, HPI]);
      A('armL', 'solid', G_SPH_LO, 0x8a8a8a, [0.1, -0.32, 0.02], 0.05);
      return { height: 1.7, radius: 0.45, walkSpeed: 9 };
    },
    archer(R, tint) {
      const pal = { bone: tinted(0xe4dcc4, tint), dark: tinted(0xb0a586, tint), eye: 0x8dff4a, cloth: 0x3d3350 };
      buildSkeleton(R, pal, 1);
      const A = R.add.bind(R);
      const hood = tinted(0x4b3d63, tint, 0.3);
      A('head', 'solid', G_HEMI, hood, [0, 0.13, -0.02], [0.29, 0.3, 0.29], [-0.35, 0, 0]);
      A('head', 'solid', G_SPH, hood, [0, 0.06, -0.1], [0.27, 0.25, 0.22]);
      A('head', 'solid', G_CONE, hood, [0, 0.2, -0.27], [0.08, 0.22, 0.08], [-1.9, 0, 0]);
      A('body', 'solid', cylT(0.6), hood, [0, 0.42, -0.02], [0.3, 0.2, 0.24]);
      // carquois
      A('body', 'solid', G_CYL8, 0x6b4226, [0.1, 0.32, -0.17], [0.08, 0.46, 0.08], [-0.25, 0, -0.35]);
      A('body', 'solid', G_CYL8, 0x8a5a32, [0.1, 0.32, -0.17], [0.085, 0.06, 0.085], [-0.25, 0, -0.35]);
      for (const [dx, dz, c] of [[0, 0, 0xe53935], [0.04, 0.03, 0xffffff], [-0.03, 0.03, 0xe53935]]) {
        A('body', 'solid', G_CONE4, c, [0.2 + dx, 0.6, -0.24 + dz], [0.035, 0.1, 0.012], [-0.25, 0, -0.35]);
      }
      // arc
      const bow = gk('bowArc', () => new T.TorusGeometry(1, 0.06, 5, 14, 2.3));
      A('armL', 'solid', bow, 0x8b5a2b, [0, -0.08, 0.05], 0.42, [0, HPI, -HPI - 1.15]);
      A('armL', 'solid', G_CYL8, 0xeeeeee, [0, -0.251, 0.05], [0.008, 0.767, 0.008], [HPI, 0, 0], false);
      A('armL', 'solid', G_CYL8, 0x4a2a14, [0, -0.5, 0.05], [0.035, 0.12, 0.035], [HPI, 0, 0]);
      return { height: 1.7, radius: 0.45, walkSpeed: 9, anim: 'archer' };
    },
    slime(R, tint) {
      R.bone('body', 'root', 0, 0, 0);
      const A = R.add.bind(R);
      const gel = tinted(0x5fe05f, tint), core = shade(gel, -0.4);
      A('body', 'trans', G_SPH, gel, [0, 0.46, 0], [0.62, 0.48, 0.6]);
      A('body', 'trans', G_SPH, gel, [0.36, 0.07, 0.22], [0.17, 0.08, 0.17]);
      A('body', 'trans', G_SPH, gel, [-0.32, 0.07, -0.24], [0.15, 0.07, 0.15]);
      A('body', 'trans', G_SPH, gel, [-0.1, 0.06, 0.4], [0.12, 0.06, 0.12]);
      A('body', 'solid', G_SPH, core, [0, 0.36, -0.08], [0.22, 0.2, 0.22], null, false);
      A('body', 'solid', G_DODE, shade(gel, -0.2), [0.18, 0.55, -0.2], 0.07, null, false);
      A('body', 'glow', G_SPH_LO, 0xffffff, [-0.31, 0.85, 0.22], [0.12, 0.05, 0.08], [0, 0, 0.5]);
      A('body', 'glow', G_SPH_LO, 0xffffff, [-0.12, 0.92, 0.2], [0.04, 0.025, 0.03]);
      for (const [, sx] of SIDES) {
        A('body', 'solid', G_SPH, 0xffffff, [sx * 0.17, 0.58, 0.54], [0.12, 0.14, 0.07]);
        A('body', 'solid', G_SPH, 0x111122, [sx * 0.16, 0.57, 0.6], [0.06, 0.08, 0.03], null, false);
        A('body', 'glow', G_SPH_LO, 0xffffff, [sx * 0.14, 0.61, 0.625], 0.02);
      }
      A('body', 'solid', torus(0.25, PI), shade(gel, -0.65), [0, 0.42, 0.585], [0.08, 0.06, 0.08], [0, 0, PI], false);
      return { height: 1.0, radius: 0.62, walkSpeed: 7, outlineColor: shade(gel, -0.8), transOpacity: 0.8, anim: 'slime' };
    },
    bat(R, tint) {
      R.bone('body', 'root', 0, 0, 0);
      R.bone('head', 'body', 0, 0.28, 0.08);
      R.bone('wingL', 'body', 0.2, 0.08, -0.02); R.bone('wingR', 'body', -0.2, 0.08, -0.02);
      const A = R.add.bind(R);
      const fur = tinted(0x5a3478, tint), belly = shade(fur, 0.25), wing = shade(fur, -0.15), eye = 0xff3a5a;
      A('body', 'solid', G_SPH, fur, [0, 0, 0], [0.26, 0.3, 0.24]);
      A('body', 'solid', G_SPH, belly, [0, -0.02, 0.1], [0.18, 0.22, 0.15]);
      A('head', 'solid', G_SPH, fur, [0, 0.05, 0], [0.22, 0.2, 0.21]);
      A('head', 'solid', G_SPH, shade(fur, 0.12), [0, -0.02, 0.17], [0.08, 0.06, 0.06]);
      A('head', 'solid', G_SPH_LO, 0x2a1830, [0, 0.0, 0.225], [0.03, 0.02, 0.02], null, false);
      for (const [, sx] of SIDES) {
        A('body', 'solid', G_CONE, 0x2a1a30, [sx * 0.08, -0.32, 0], [0.04, 0.1, 0.04], [PI, 0, 0]);
        A('head', 'solid', G_CONE, fur, [sx * 0.12, 0.27, -0.02], [0.08, 0.24, 0.05], [0, 0, -sx * 0.35]);
        A('head', 'solid', G_CONE, 0xff8fb0, [sx * 0.12, 0.25, 0.012], [0.045, 0.16, 0.02], [0, 0, -sx * 0.35], false);
        A('head', 'glow', G_SPH_LO, eye, [sx * 0.08, 0.08, 0.18], [0.05, 0.055, 0.04]);
        A('head', 'solid', G_CONE, 0xffffff, [sx * 0.04, -0.09, 0.19], [0.018, 0.06, 0.018], [PI, 0, 0], false);
      }
      A('wingL', 'solid', G_WING, wing, [0, 0, 0], [1, 1, 1], [HPI, 0, 0]);
      A('wingR', 'solid', G_WING, wing, [0, 0, 0], [-1, 1, 1], [HPI, 0, 0]);
      A('wingL', 'solid', G_BOX, shade(fur, -0.4), [0.3, 0.02, 0.2], [0.55, 0.03, 0.035], [0, -0.55, 0]);
      A('wingR', 'solid', G_BOX, shade(fur, -0.4), [-0.3, 0.02, 0.2], [0.55, 0.03, 0.035], [0, 0.55, 0]);
      return { height: 1.95, radius: 0.5, float: true, baseY: 1.2, walkSpeed: 14, anim: 'bat' };
    },
    knight(R, tint) {
      const steel = tinted(0x8d9bb0, tint), dark = shade(steel, -0.35), trim = 0xe0b040, cloth = 0xb3263a, plume = 0xe53935;
      R.bone('legL', 'root', 0.2, 0.72, 0); R.bone('legR', 'root', -0.2, 0.72, 0);
      R.bone('body', 'root', 0, 0.72, 0);
      R.bone('head', 'body', 0, 0.68, 0);
      R.bone('armL', 'body', 0.47, 0.5, 0); R.bone('armR', 'body', -0.47, 0.5, 0);
      const A = R.add.bind(R);
      for (const [s] of SIDES) {
        const b = 'leg' + s;
        A(b, 'solid', G_CYL, dark, [0, -0.2, 0], [0.13, 0.4, 0.13]);
        A(b, 'solid', G_SPH, steel, [0, -0.3, 0.05], [0.12, 0.1, 0.1]);
        A(b, 'solid', cylT(1.2), steel, [0, -0.48, 0], [0.13, 0.22, 0.14]);
        A(b, 'solid', G_BOX, dark, [0, -0.66, 0.06], [0.2, 0.12, 0.32]);
      }
      A('body', 'solid', cylT(1.2), steel, [0, 0.3, 0], [0.38, 0.62, 0.3]);
      A('body', 'solid', G_SPH, shade(steel, 0.22), [0, 0.38, 0.19], [0.34, 0.26, 0.16]);
      A('body', 'solid', G_BOX, cloth, [0, 0.05, 0.31], [0.3, 0.45, 0.03]);
      A('body', 'solid', G_OCTA, trim, [0, 0.12, 0.335], [0.08, 0.1, 0.02], null, false);
      A('body', 'solid', G_CYL, 0x4a3020, [0, 0.02, 0], [0.4, 0.08, 0.32]);
      A('body', 'solid', cylT(0.85), dark, [0, -0.08, 0], [0.42, 0.18, 0.34]);
      A('head', 'solid', G_CYL, steel, [0, 0.16, 0], [0.25, 0.34, 0.25]);
      A('head', 'solid', G_HEMI, steel, [0, 0.33, 0], [0.25, 0.16, 0.25]);
      A('head', 'solid', G_BOX, 0x111111, [0, 0.18, 0.24], [0.3, 0.06, 0.04], null, false);
      A('head', 'solid', G_BOX, trim, [0, 0.36, 0.0], [0.04, 0.1, 0.52]);
      A('head', 'solid', G_BOX, shade(steel, 0.15), [0, 0.06, 0.24], [0.04, 0.16, 0.04], null, false);
      for (const [, sx] of SIDES) A('head', 'glow', G_SPH_LO, 0xff4030, [sx * 0.08, 0.18, 0.255], [0.035, 0.025, 0.012]);
      const pl = [[0, 0.52, 0.05, 0.08], [0, 0.57, -0.07, 0.09], [0, 0.55, -0.19, 0.085], [0, 0.47, -0.29, 0.075], [0, 0.37, -0.34, 0.06]];
      for (const [x, y, z, r] of pl) A('head', 'solid', G_SPH, plume, [x, y, z], [r * 0.7, r * 1.1, r * 1.2]);
      for (const [s, sx] of SIDES) {
        const b = 'arm' + s;
        A(b, 'solid', G_SPH, steel, [sx * 0.04, 0.05, 0], [0.24, 0.19, 0.24]);
        A(b, 'solid', G_CYL, trim, [sx * 0.04, -0.02, 0], [0.245, 0.04, 0.245]);
        A(b, 'solid', G_CYL, dark, [0, -0.2, 0], [0.1, 0.38, 0.1]);
        A(b, 'solid', G_BOX, steel, [0, -0.42, 0.02], [0.17, 0.17, 0.17]);
      }
      // grand bouclier (bras gauche, côté +X)
      A('armL', 'solid', G_BOX, shade(steel, -0.15), [0.14, -0.3, 0.08], [0.06, 0.82, 0.6]);
      A('armL', 'solid', G_CONE4, shade(steel, -0.15), [0.14, -0.81, 0.08], [0.03, 0.2, 0.3], [PI, 0, 0]);
      A('armL', 'solid', G_BOX, cloth, [0.175, -0.3, 0.08], [0.02, 0.68, 0.48], null, false);
      A('armL', 'solid', G_BOX, trim, [0.19, -0.27, 0.08], [0.02, 0.44, 0.08], null, false);
      A('armL', 'solid', G_BOX, trim, [0.19, -0.18, 0.08], [0.02, 0.08, 0.32], null, false);
      // masse d'armes
      A('armR', 'solid', G_CYL8, 0x4a3020, [0, -0.43, 0.18], [0.03, 0.5, 0.03], [HPI, 0, 0]);
      A('armR', 'solid', G_SPH, dark, [0, -0.43, 0.48], 0.12);
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0.6, 0.6, 0.5], [-0.6, 0.6, 0.5], [0.6, -0.6, 0.5], [-0.6, -0.6, 0.5]];
      for (const d of dirs) {
        const L = Math.hypot(d[0], d[1], d[2]);
        A('armR', 'solid', G_CONE4, steel, [d[0] / L * 0.15, -0.43 + d[1] / L * 0.15, 0.48 + d[2] / L * 0.15], [0.04, 0.1, 0.04], rotTo(d[0], d[1], d[2]));
      }
      return { height: 2.05, radius: 0.6, walkSpeed: 7, anim: 'knight' };
    },
    spider(R, tint) {
      const col = tinted(0x3d2a52, tint), dark = shade(col, -0.4), mark = 0xff8a1a, eye = 0xff2040, fang = 0xe8e0d0;
      R.bone('body', 'root', 0, 0.45, 0);
      R.bone('head', 'body', 0, 0.02, 0.35);
      const A = R.add.bind(R);
      A('body', 'solid', G_SPH, col, [0, 0.0, 0.12], [0.28, 0.22, 0.3]);
      A('body', 'solid', G_SPH, col, [0, 0.12, -0.42], [0.42, 0.34, 0.48]);
      A('body', 'solid', G_OCTA, mark, [0, 0.45, -0.42], [0.13, 0.03, 0.22], null, false);
      for (const [, sx] of SIDES) A('body', 'solid', G_SPH_LO, mark, [sx * 0.22, 0.4, -0.28], 0.05, null, false);
      A('body', 'solid', G_CONE, dark, [0, 0.05, -0.9], [0.06, 0.12, 0.06], [-HPI, 0, 0]);
      A('head', 'solid', G_SPH, shade(col, 0.08), [0, 0, 0.05], [0.17, 0.14, 0.15]);
      for (const [, sx] of SIDES) {
        A('head', 'glow', G_SPH_LO, eye, [sx * 0.06, 0.07, 0.17], 0.04);
        A('head', 'glow', G_SPH_LO, eye, [sx * 0.11, 0.04, 0.15], 0.025);
        A('head', 'glow', G_SPH_LO, eye, [sx * 0.03, 0.11, 0.15], 0.022);
        A('head', 'solid', G_CONE, fang, [sx * 0.05, -0.1, 0.16], [0.03, 0.12, 0.03], [PI - 0.4, 0, 0]);
      }
      const legs = [], legInfo = [];
      let n = 0;
      for (let i = 0; i < 4; i++) for (const [, s] of SIDES) {
        const name = 'leg' + n;
        const b = R.bone(name, 'body', s * 0.16, 0, 0.26 - i * 0.1);
        const th = -(1.5 - i) * 0.42;
        b.rotation.y = s > 0 ? th : -PI - th;
        seg(R, name, 'solid', G_CYL8, col, [0, 0, 0], [0.44, 0.24, 0], 0.04);
        A(name, 'solid', G_SPH_LO, dark, [0.44, 0.24, 0], 0.05);
        seg(R, name, 'solid', cylT(0.4, 8), col, [0.44, 0.24, 0], [0.7, -0.45, 0], 0.035);
        legs.push(name); legInfo.push({ side: s, phase: ((i + (s > 0 ? 0 : 1)) % 2) * PI, front: i === 0 });
        n++;
      }
      return { height: 0.95, radius: 0.8, walkSpeed: 14, legs, legInfo, anim: 'spider' };
    },
    imp(R, tint) {
      const skin = tinted(0xe8403a, tint), dark = shade(skin, -0.3), belly = mix(skin, 0xffb07a, 0.5), horn = 0xf3e2c0, eye = 0xffe14a;
      R.bone('legL', 'root', 0.1, 0.36, 0); R.bone('legR', 'root', -0.1, 0.36, 0);
      R.bone('body', 'root', 0, 0.36, 0);
      R.bone('head', 'body', 0, 0.36, 0.03);
      R.bone('armL', 'body', 0.19, 0.28, 0); R.bone('armR', 'body', -0.19, 0.28, 0);
      R.bone('wingL', 'body', 0.08, 0.3, -0.14); R.bone('wingR', 'body', -0.08, 0.3, -0.14);
      R.bone('tail', 'body', 0, 0.04, -0.16);
      R.bones.wingL.rotation.set(0, 0.35, 0.6); R.bones.wingR.rotation.set(0, -0.35, -0.6);
      const A = R.add.bind(R);
      for (const [s] of SIDES) {
        const b = 'leg' + s;
        A(b, 'solid', G_CYL8, skin, [0, -0.1, 0.02], [0.06, 0.2, 0.06], [0.3, 0, 0]);
        A(b, 'solid', G_CYL8, skin, [0, -0.26, 0.0], [0.05, 0.16, 0.05], [-0.3, 0, 0]);
        A(b, 'solid', G_CYL8, 0x2a1a1a, [0, -0.33, 0.02], [0.06, 0.06, 0.07]);
      }
      A('body', 'solid', G_SPH, skin, [0, 0.15, 0], [0.2, 0.22, 0.18]);
      A('body', 'solid', G_SPH, belly, [0, 0.12, 0.08], [0.14, 0.15, 0.11]);
      A('body', 'solid', G_BOX, 0x3a1e2e, [0, 0.0, 0.13], [0.15, 0.12, 0.03]);
      A('head', 'solid', G_SPH, skin, [0, 0.14, 0], [0.27, 0.25, 0.25]);
      for (const [, sx] of SIDES) {
        A('head', 'solid', G_CONE, skin, [sx * 0.29, 0.16, -0.02], [0.06, 0.2, 0.04], [0, 0, -sx * 1.25]);
        A('head', 'solid', G_CONE, horn, [sx * 0.13, 0.4, 0], [0.055, 0.2, 0.055], [0, 0, -sx * 0.45]);
        A('head', 'solid', G_CONE, horn, [sx * 0.21, 0.53, -0.03], [0.03, 0.12, 0.03], [-0.3, 0, -sx * 0.9]);
        A('head', 'glow', G_SPH_LO, eye, [sx * 0.1, 0.18, 0.215], [0.065, 0.05, 0.03], [0, 0, sx * 0.25]);
        A('head', 'solid', G_BOX, 0x111111, [sx * 0.1, 0.18, 0.245], [0.015, 0.07, 0.01], null, false);
        const b = 'arm' + (sx > 0 ? 'L' : 'R');
        A(b, 'solid', G_CYL8, skin, [0, -0.11, 0], [0.045, 0.22, 0.045]);
        A(b, 'solid', G_SPH_LO, skin, [0, -0.24, 0.01], 0.055);
      }
      A('head', 'solid', G_BOX, 0x3a0a0a, [0, 0.04, 0.235], [0.16, 0.04, 0.02], null, false);
      A('head', 'solid', G_BOX, 0xffffff, [0, 0.055, 0.243], [0.14, 0.015, 0.015], null, false);
      A('head', 'solid', G_SPH_LO, dark, [0, 0.11, 0.25], 0.03);
      // fourche
      A('armR', 'solid', G_CYL8, 0x3a2a2a, [0, -0.16, 0.06], [0.022, 0.8, 0.022]);
      A('armR', 'solid', G_BOX, 0x9a9a9a, [0, 0.24, 0.06], [0.16, 0.025, 0.025]);
      for (const x of [-0.07, 0, 0.07]) A('armR', 'solid', G_CONE, 0xb0b0b0, [x, 0.31, 0.06], [0.018, 0.12, 0.018]);
      A('wingL', 'solid', G_WING, dark, [0, 0, 0], [0.42, 0.42, 0.42], [HPI, 0, 0]);
      A('wingR', 'solid', G_WING, dark, [0, 0, 0], [-0.42, 0.42, 0.42], [HPI, 0, 0]);
      seg(R, 'tail', 'solid', G_CYL8, skin, [0, 0, 0], [0, -0.08, -0.2], 0.025);
      seg(R, 'tail', 'solid', G_CYL8, skin, [0, -0.08, -0.2], [0, 0.0, -0.38], 0.022);
      seg(R, 'tail', 'solid', G_CYL8, skin, [0, 0.0, -0.38], [0, 0.15, -0.46], 0.02);
      A('tail', 'solid', G_CONE4, dark, [0, 0.21, -0.48], [0.07, 0.12, 0.02], [-0.4, 0, 0]);
      return { height: 1.25, radius: 0.4, walkSpeed: 12, anim: 'imp' };
    },
    wraith(R, tint) {
      const robe = tinted(0x8a7cf0, tint), inner = 0x140a2a, eye = 0x7ffcff, hand = 0xd8d8e8;
      R.bone('body', 'root', 0, 0, 0);
      R.bone('head', 'body', 0, 1.42, 0.02);
      R.bone('armL', 'body', 0.3, 1.25, 0.02); R.bone('armR', 'body', -0.3, 1.25, 0.02);
      const A = R.add.bind(R);
      A('body', 'trans', G_ROBE, robe, [0, 0.72, 0], [0.5, 1.25, 0.46]);
      A('body', 'solid', G_SPH, inner, [0, 0.8, 0], [0.26, 0.55, 0.24], null, false);
      A('body', 'trans', G_SPH, robe, [0, 1.28, 0], [0.36, 0.22, 0.3]);
      A('body', 'glow', G_OCTA, eye, [0, 1.2, 0.29], [0.05, 0.07, 0.03]);
      A('body', 'trans', G_SPH_LO, robe, [0.14, 0.12, -0.32], [0.1, 0.08, 0.18]);
      A('body', 'trans', G_SPH_LO, robe, [-0.12, 0.2, -0.36], [0.08, 0.07, 0.14]);
      A('head', 'trans', G_SPH, robe, [0, 0.1, -0.02], [0.28, 0.3, 0.28]);
      A('head', 'solid', G_SPH, inner, [0, 0.06, 0.13], [0.2, 0.22, 0.16], null, false);
      A('head', 'trans', G_CONE, robe, [0, 0.34, -0.12], [0.14, 0.32, 0.14], [-0.75, 0, 0]);
      for (const [s, sx] of SIDES) {
        A('head', 'glow', G_SPH_LO, eye, [sx * 0.07, 0.08, 0.28], [0.04, 0.055, 0.02]);
        const b = 'arm' + s;
        A(b, 'trans', cylT(0.45), robe, [0, -0.24, 0.02], [0.13, 0.5, 0.13]);
        for (const j of [-1, 0, 1]) A(b, 'solid', G_CONE, hand, [j * 0.04, -0.55, 0.03], [0.018, 0.14, 0.018], [PI, 0, j * 0.25]);
      }
      return { height: 2.1, radius: 0.5, float: true, baseY: 0.35, walkSpeed: 6, outlineColor: 0x1a0b33, transOpacity: 0.72, anim: 'wraith' };
    },
  };

  function makeEnemy(model, opts) {
    opts = opts || {};
    const id = ENEMY_BUILD[model] ? model : 'skeleton';
    const { root, rig } = charRoot(id);
    const R = new Rec(rig);
    const tint = (opts.tint == null || opts.tint === false) ? null : (typeof opts.tint === 'string' ? parseInt(opts.tint.replace('#', ''), 16) : opts.tint);
    const info = ENEMY_BUILD[id](R, tint);
    const asm = assemble(R, 'en|' + id + '|' + (tint == null ? '-' : tint), info);
    const sc = opts.scale || 1;
    finalizeChar(root, rig, R, asm, info, sc, id);
    root.userData.anim = info.anim || 'humanoid';
    root.userData.model = id;
    return root;
  }

  // ==================================================================
  // BOSS (2.5 à 4 de haut) — parts animables + yeux émissifs
  // ==================================================================
  function spiderLegs(R, prefix, n4, col, knee, upperEnd, footEnd, radU, radL, spacing, z0, xOff, spread) {
    const A = R.add.bind(R);
    const legs = [], legInfo = [];
    let n = 0;
    for (let i = 0; i < n4; i++) for (const [, s] of SIDES) {
      const name = prefix + n;
      const b = R.bone(name, 'body', s * xOff, 0.1, z0 - i * spacing);
      const th = -(1.5 - i) * spread;
      b.rotation.y = s > 0 ? th : -PI - th;
      seg(R, name, 'solid', G_CYL8, col, [0, 0, 0], upperEnd, radU);
      A(name, 'solid', G_SPH_LO, knee, upperEnd, radU * 1.2);
      seg(R, name, 'solid', cylT(0.35, 8), col, upperEnd, footEnd, radL);
      legs.push(name); legInfo.push({ side: s, phase: ((i + (s > 0 ? 0 : 1)) % 2) * PI, front: i === 0 });
      n++;
    }
    return { legs, legInfo };
  }

  const BOSS_BUILD = {
    golem(R) {
      const stone = 0x8b919c, dark = 0x5f6670, moss = 0x63b04a, mossD = 0x3f8a32, crystal = 0x63e6ff, eye = 0xffa526;
      R.bone('legL', 'root', 0.55, 1.0, 0); R.bone('legR', 'root', -0.55, 1.0, 0);
      R.bone('body', 'root', 0, 1.0, 0);
      R.bone('head', 'body', 0, 1.72, 0.3);
      R.bone('armL', 'body', 1.15, 1.45, 0); R.bone('armR', 'body', -1.15, 1.45, 0);
      const A = R.add.bind(R);
      for (const [s] of SIDES) {
        const b = 'leg' + s;
        A(b, 'solid', G_DODE, dark, [0, -0.42, 0], [0.42, 0.52, 0.42]);
        A(b, 'solid', G_DODE, stone, [0, -0.82, 0.1], [0.46, 0.24, 0.56]);
        A(b, 'solid', G_SPH, moss, [0, -0.62, 0.15], [0.3, 0.07, 0.3], null, false);
      }
      A('body', 'solid', G_DODE, stone, [0, 0.92, 0], [1.0, 0.85, 0.78]);
      A('body', 'solid', G_DODE, dark, [0, 0.25, 0.05], [0.72, 0.5, 0.6]);
      A('body', 'eyes', G_OCTA, eye, [0, 0.95, 0.72], [0.16, 0.2, 0.08]);
      A('body', 'solid', G_BOX, 0x3a3e45, [0.22, 1.1, 0.7], [0.3, 0.04, 0.04], [0, 0, -0.6], false);
      A('body', 'solid', G_BOX, 0x3a3e45, [-0.2, 0.75, 0.72], [0.28, 0.04, 0.04], [0, 0, -0.5], false);
      A('body', 'solid', G_SPH, moss, [0.3, 1.62, 0.05], [0.55, 0.14, 0.45]);
      A('body', 'solid', G_SPH, mossD, [-0.4, 1.52, 0.3], [0.35, 0.1, 0.3]);
      for (const x of [-0.5, -0.2, 0.45]) A('body', 'solid', G_CONE, mossD, [x, 1.38, 0.62], [0.06, 0.3, 0.06], [PI - 0.2, 0, 0], false);
      for (const [x, y, z, r, h, rx, rz] of [[0.3, 1.55, -0.5, 0.13, 0.65, -0.6, -0.3], [-0.25, 1.62, -0.48, 0.11, 0.55, -0.5, 0.35], [0, 1.78, -0.32, 0.15, 0.8, -0.3, 0], [0.6, 1.25, -0.55, 0.09, 0.45, -0.9, -0.5], [-0.62, 1.2, -0.5, 0.1, 0.42, -0.8, 0.6]]) {
        A('body', 'glow', G_CONE6, crystal, [x, y, z], [r, h, r], [rx, 0, rz], true);
      }
      A('head', 'solid', G_DODE, stone, [0, 0.1, 0], [0.42, 0.36, 0.4]);
      A('head', 'solid', G_BOX, dark, [0, 0.2, 0.3], [0.55, 0.1, 0.16]);
      for (const [, sx] of SIDES) A('head', 'eyes', G_BOX, eye, [sx * 0.14, 0.08, 0.37], [0.13, 0.06, 0.06]);
      A('head', 'solid', G_BOX, dark, [0, -0.15, 0.18], [0.4, 0.14, 0.28]);
      A('head', 'solid', G_SPH, moss, [0.05, 0.4, -0.02], [0.3, 0.08, 0.28]);
      for (const [s, sx] of SIDES) {
        const b = 'arm' + s;
        A(b, 'solid', G_DODE, stone, [0, 0, 0], 0.52);
        A(b, 'solid', G_SPH, moss, [0, 0.38, 0], [0.4, 0.12, 0.38]);
        A(b, 'glow', G_CONE6, crystal, [sx * 0.18, 0.55, -0.1], [0.1, 0.5, 0.1], [-0.2, 0, -sx * 0.45], true);
        A(b, 'solid', G_DODE, dark, [0, -0.55, 0], [0.34, 0.48, 0.34]);
        A(b, 'solid', G_DODE, stone, [0, -1.02, 0.05], [0.42, 0.5, 0.42]);
        A(b, 'solid', G_DODE, stone, [0, -1.55, 0.12], [0.55, 0.48, 0.55]);
        A(b, 'solid', G_BOX, dark, [0, -1.45, 0.6], [0.6, 0.12, 0.1], null, false);
      }
      return { height: 3.3, radius: 1.5, eyeColor: eye, outline: 0.06, walkSpeed: 4.5, anim: 'bossHumanoid' };
    },
    spiderQueen(R) {
      const chitin = 0x40225a, dark = 0x24112f, pattern = 0xff4fa8, crown = 0xffcf3a, gem = 0xff2a50, eye = 0xff2244, fang = 0xf0e6d8;
      R.bone('body', 'root', 0, 1.25, 0);
      R.bone('abdomen', 'body', 0, 0.55, -0.55);
      R.bone('head', 'body', 0, 0.25, 1.05);
      R.bone('fangL', 'head', 0.17, -0.22, 0.33); R.bone('fangR', 'head', -0.17, -0.22, 0.33);
      const A = R.add.bind(R);
      A('body', 'solid', G_SPH, chitin, [0, 0.15, 0.35], [0.78, 0.55, 0.82]);
      A('body', 'solid', G_SPH, shade(chitin, 0.12), [0, 0.45, 0.4], [0.5, 0.25, 0.55]);
      A('abdomen', 'solid', G_SPH, chitin, [0, 0.1, -0.8], [1.25, 1.0, 1.45]);
      for (const dz of [0.5, -0.05, -0.6]) {
        const k = Math.sqrt(1 - (dz / 1.45) * (dz / 1.45));
        A('abdomen', 'solid', torus(0.05, TAU, 20), pattern, [0, 0.1, -0.8 + dz], [1.255 * k, 1.005 * k, 1.2], null, false);
      }
      A('abdomen', 'solid', G_OCTA, pattern, [0, 1.08, -0.75], [0.38, 0.06, 0.55], null, false);
      for (const [, sx] of SIDES) A('abdomen', 'solid', G_SPH_LO, 0x14081c, [sx * 0.14, 1.11, -0.62], [0.09, 0.03, 0.07], null, false);
      for (const [x, y, z] of [[0, 1.05, -1.25], [0.45, 0.85, -1.4], [-0.45, 0.85, -1.4], [0, 0.6, -1.95]]) {
        A('abdomen', 'solid', G_CONE, dark, [x, y, z], [0.1, 0.35, 0.1], rotTo(x * 0.5, y - 0.1, z + 0.8));
      }
      A('head', 'solid', G_SPH, shade(chitin, 0.08), [0, 0, 0], [0.5, 0.42, 0.45]);
      for (const [, sx] of SIDES) {
        A('head', 'eyes', G_SPH_LO, eye, [sx * 0.16, 0.14, 0.4], 0.09);
        A('head', 'eyes', G_SPH_LO, eye, [sx * 0.3, 0.08, 0.34], 0.06);
        A('head', 'eyes', G_SPH_LO, eye, [sx * 0.08, 0.26, 0.36], 0.05);
        A('head', 'eyes', G_SPH_LO, eye, [sx * 0.24, 0.24, 0.3], 0.045);
      }
      A('head', 'solid', G_CYL, crown, [0, 0.4, -0.05], [0.3, 0.12, 0.3]);
      for (let j = 0; j < 7; j++) {
        const a = j / 7 * TAU;
        A('head', 'solid', G_CONE4, crown, [Math.sin(a) * 0.28, 0.58, -0.05 + Math.cos(a) * 0.28], [0.06, 0.26, 0.06], [0, a, 0]);
        if (j === 0 || j === 1 || j === 6) A('head', 'glow', G_OCTA, gem, [Math.sin(a) * 0.31, 0.42, -0.05 + Math.cos(a) * 0.31], 0.05);
      }
      for (const f of ['fangL', 'fangR']) {
        A(f, 'solid', G_CONE, dark, [0, -0.12, 0.08], [0.08, 0.35, 0.08], [PI - 0.5, 0, 0]);
        A(f, 'solid', G_CONE, fang, [0, -0.3, 0.2], [0.04, 0.14, 0.04], [PI - 0.7, 0, 0]);
      }
      const L = spiderLegs(R, 'leg', 4, chitin, pattern, [1.0, 0.9, 0], [1.9, -1.35, 0], 0.12, 0.1, 0.32, 0.55, 0.45, 0.5);
      return { height: 2.9, radius: 2.0, eyeColor: eye, outline: 0.06, walkSpeed: 9, legs: L.legs, legInfo: L.legInfo, anim: 'spiderBoss' };
    },
    skeletonKing(R) {
      const k = 2.1;
      const pal = { bone: 0xeee6cf, dark: 0xb5a98a, eye: 0x52ffc8, cloth: 0x3a1a4a };
      buildSkeleton(R, pal, k, { eyeLayer: 'eyes' });
      const A = R.add.bind(R);
      const crown = 0xffc83a, iron = 0x4a4f5c, cape = 0xb3202f, steel = 0xbac6d8;
      A('head', 'solid', G_CYL, crown, [0, 0.26 * k, 0], [0.215 * k, 0.09 * k, 0.215 * k]);
      for (let j = 0; j < 6; j++) {
        const a = j / 6 * TAU;
        A('head', 'solid', G_CONE4, crown, [Math.sin(a) * 0.2 * k, 0.37 * k, Math.cos(a) * 0.2 * k], [0.04 * k, 0.16 * k, 0.04 * k], [0, a, 0]);
      }
      A('head', 'eyes', G_OCTA, 0xff3060, [0, 0.27 * k, 0.215 * k], [0.035 * k, 0.045 * k, 0.02 * k]);
      for (const [s, sx] of SIDES) {
        const b = 'arm' + s;
        A(b, 'solid', G_SPH, iron, [sx * 0.03 * k, 0.03 * k, 0], [0.13 * k, 0.1 * k, 0.13 * k]);
        A(b, 'solid', G_CONE, iron, [sx * 0.08 * k, 0.14 * k, 0], [0.035 * k, 0.12 * k, 0.035 * k], [0, 0, -sx * 0.5]);
      }
      A('body', 'solid', cylT(0.8), pal.cloth, [0, -0.1 * k, 0], [0.22 * k, 0.25 * k, 0.16 * k]);
      A('body', 'solid', G_CYL, iron, [0, 0.03 * k, 0], [0.2 * k, 0.05 * k, 0.14 * k]);
      A('body', 'eyes', G_SPH_LO, pal.eye, [0, 0.33 * k, -0.01 * k], 0.06 * k);
      // cape
      R.bone('cape', 'body', 0, 0.5 * k, -0.04 * k);
      A('cape', 'cape', G_CAPE, cape, [0, -0.5 * k, -0.02 * k], [0.3 * k, 1.0 * k, 0.22 * k]);
      A('cape', 'solid', torus(0.3), shade(cape, -0.35), [0, 0.0, -0.02 * k], [0.24 * k, 0.17 * k, 0.24 * k], [HPI, 0, 0]);
      // épée géante
      R.bone('sword', 'armR', 0, -0.5 * k, 0.02 * k);
      R.bones.sword.rotation.x = -0.3;
      A('sword', 'solid', G_CYL8, 0x3a2a1a, [0, 0, 0.0], [0.03 * k, 0.24 * k, 0.03 * k], [HPI, 0, 0]);
      A('sword', 'eyes', G_SPH_LO, pal.eye, [0, 0, -0.13 * k], 0.04 * k);
      A('sword', 'solid', G_BOX, crown, [0, 0, 0.13 * k], [0.42 * k, 0.06 * k, 0.07 * k]);
      A('sword', 'solid', G_BOX, steel, [0, 0, 0.72 * k], [0.11 * k, 0.035 * k, 1.1 * k]);
      A('sword', 'solid', G_CONE4, steel, [0, 0, 1.34 * k], [0.055 * k, 0.14 * k, 0.0175 * k], [HPI, 0, 0]);
      A('sword', 'eyes', G_BOX, pal.eye, [0, 0.02 * k, 0.68 * k], [0.025 * k, 0.008 * k, 0.8 * k]);
      return { height: 3.7, radius: 1.3, eyeColor: pal.eye, outline: 0.055, walkSpeed: 5, anim: 'bossHumanoid' };
    },
    frostGiant(R) {
      const skin = 0x9fd4f5, skinD = 0x6ba6d6, beard = 0xf4fbff, fur = 0xe9e4da, leather = 0x7a5a40, ice = 0x8ff0ff, eye = 0xd8fbff;
      R.bone('legL', 'root', 0.45, 1.15, 0); R.bone('legR', 'root', -0.45, 1.15, 0);
      R.bone('body', 'root', 0, 1.15, 0);
      R.bone('head', 'body', 0, 1.62, 0.18);
      R.bone('armL', 'body', 0.98, 1.35, 0); R.bone('armR', 'body', -0.98, 1.35, 0);
      R.bone('club', 'armR', 0, -1.2, 0.05);
      R.bones.club.rotation.x = -0.4;
      const A = R.add.bind(R);
      for (const [s] of SIDES) {
        const b = 'leg' + s;
        A(b, 'solid', G_CYL, skinD, [0, -0.35, 0], [0.27, 0.7, 0.27]);
        A(b, 'solid', cylT(0.9), fur, [0, -0.86, 0.03], [0.33, 0.4, 0.35]);
        A(b, 'solid', G_SPH, leather, [0, -1.07, 0.16], [0.3, 0.1, 0.32]);
      }
      A('body', 'solid', G_SPH, skin, [0, 0.78, 0], [0.85, 0.85, 0.66]);
      A('body', 'solid', G_SPH, shade(skin, 0.14), [0, 0.45, 0.22], [0.6, 0.55, 0.45]);
      A('body', 'solid', G_CYL, leather, [0, 0.12, 0], [0.72, 0.16, 0.56]);
      A('body', 'glow', G_OCTA, ice, [0, 0.12, 0.57], [0.13, 0.13, 0.06], null, true);
      A('body', 'solid', cylT(0.85), fur, [0, -0.12, 0], [0.74, 0.38, 0.58]);
      A('body', 'solid', torus(0.42), fur, [0, 1.42, -0.05], [0.62, 0.55, 0.62], [HPI, 0, 0]);
      for (const [x, z] of [[0.55, 0.15], [-0.55, 0.15], [0.3, -0.4], [-0.3, -0.4], [0, -0.5]]) A('body', 'solid', G_SPH, fur, [x, 1.5, z], 0.22);
      const crystals = [[0.62, 1.7, -0.2, 0.12, 0.6, 0.6, 0.7, -0.2], [0.75, 1.55, 0.05, 0.08, 0.4, 1, 0.5, 0], [-0.62, 1.7, -0.2, 0.12, 0.6, -0.6, 0.7, -0.2], [-0.75, 1.55, 0.05, 0.08, 0.4, -1, 0.5, 0], [0.2, 1.65, -0.55, 0.11, 0.55, 0.2, 0.6, -0.8], [-0.25, 1.6, -0.55, 0.1, 0.5, -0.3, 0.6, -0.8], [0, 1.4, -0.68, 0.09, 0.45, 0, 0.3, -1]];
      for (const [x, y, z, r, h, dx, dy, dz] of crystals) A('body', 'glow', G_CONE6, ice, [x, y, z], [r, h, r], rotTo(dx, dy, dz), true);
      A('head', 'solid', G_SPH, skin, [0, 0.12, 0], [0.42, 0.42, 0.4]);
      A('head', 'solid', G_BOX, skinD, [0, 0.24, 0.3], [0.5, 0.1, 0.16]);
      A('head', 'solid', G_SPH_LO, skinD, [0, 0.07, 0.4], [0.08, 0.1, 0.07]);
      for (const [, sx] of SIDES) {
        A('head', 'eyes', G_SPH_LO, eye, [sx * 0.14, 0.16, 0.36], [0.07, 0.05, 0.03]);
        A('head', 'solid', G_SPH, beard, [sx * 0.1, 0.0, 0.37], [0.14, 0.06, 0.07], [0, 0, sx * 0.3]);
      }
      for (const [x, y, z, r, h] of [[0, -0.25, 0.28, 0.2, 0.75], [0.18, -0.18, 0.24, 0.14, 0.55], [-0.18, -0.18, 0.24, 0.14, 0.55], [0.3, -0.05, 0.15, 0.1, 0.4], [-0.3, -0.05, 0.15, 0.1, 0.4]]) {
        A('head', 'solid', G_CONE, beard, [x, y, z], [r, h, r], [PI - 0.25, 0, 0]);
      }
      for (let j = 0; j < 5; j++) {
        const a = (j - 2) * 0.45;
        A('head', 'glow', G_CONE6, ice, [Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.1 - 0.1], [0.07, 0.35 + (j === 2 ? 0.15 : 0), 0.07], [-0.2, 0, -a * 0.8], true);
      }
      A('head', 'solid', G_SPH, beard, [0, 0.2, -0.22], [0.4, 0.32, 0.25]);
      for (const [s, sx] of SIDES) {
        const b = 'arm' + s;
        A(b, 'solid', G_SPH, skin, [0, 0, 0], 0.36);
        A(b, 'solid', G_CYL, skin, [0, -0.45, 0], [0.25, 0.7, 0.25]);
        A(b, 'solid', G_CYL, fur, [0, -0.9, 0], [0.29, 0.3, 0.29]);
        A(b, 'solid', G_SPH, skinD, [0, -1.2, 0.05], 0.3);
        A(b, 'glow', G_CONE6, ice, [sx * 0.2, 0.32, -0.05], [0.07, 0.35, 0.07], rotTo(sx * 0.6, 1, -0.2), true);
      }
      A('club', 'solid', G_CYL8, leather, [0, 0, 0.4], [0.07, 1.0, 0.07], [HPI, 0, 0]);
      A('club', 'glow', cylT(1.6, 6), ice, [0, 0, 1.2], [0.22, 0.8, 0.22], [HPI, 0, 0], true);
      for (let j = 0; j < 6; j++) {
        const a = j / 6 * TAU;
        A('club', 'glow', G_CONE6, shade(ice, 0.3), [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 1.3], [0.07, 0.3, 0.07], rotTo(Math.cos(a), Math.sin(a), 0.3), true);
      }
      return { height: 3.8, radius: 1.5, eyeColor: eye, outline: 0.06, walkSpeed: 4.5, anim: 'bossHumanoid' };
    },
    lich(R) {
      const robe = 0x2d2158, robeD = 0x1a1236, trim = 0x5ef0a0, bone = 0xe6dfc8, eye = 0x66ff8a, crown = 0xb8962e;
      R.bone('body', 'root', 0, 0, 0);
      R.bone('head', 'body', 0, 2.5, 0.05);
      R.bone('armL', 'body', 0.62, 2.2, 0); R.bone('armR', 'body', -0.62, 2.2, 0);
      R.bone('orbs', 'root', 0, 1.7, 0);
      const A = R.add.bind(R);
      A('body', 'solid', G_ROBE, robe, [0, 1.1, 0], [0.95, 2.0, 0.85]);
      A('body', 'glow', torus(0.06, TAU, 24), trim, [0, 0.55, 0], [0.835, 0.75, 1], [HPI, 0, 0]);
      A('body', 'glow', torus(0.06, TAU, 24), trim, [0, 1.25, 0], [0.68, 0.61, 1], [HPI, 0, 0]);
      A('body', 'solid', G_SPH, robeD, [0, 2.1, 0], [0.6, 0.42, 0.48]);
      A('body', 'solid', G_SPH, bone, [0, 1.95, 0.4], [0.14, 0.13, 0.08]);
      A('body', 'eyes', G_SPH_LO, eye, [0, 1.97, 0.47], 0.035);
      for (let j = -2; j <= 2; j++) A('body', 'solid', G_CONE, robeD, [j * 0.17, 2.55, -0.32 + Math.abs(j) * 0.05], [0.09, 0.6, 0.07], [-0.25, 0, -j * 0.25]);
      for (const [, sx] of SIDES) {
        A('body', 'solid', G_SPH, robe, [sx * 0.55, 2.25, 0], [0.25, 0.18, 0.25]);
        A('body', 'solid', G_CONE, bone, [sx * 0.62, 2.42, 0], [0.06, 0.22, 0.06], [0, 0, -sx * 0.4]);
      }
      A('head', 'solid', G_SPH, bone, [0, 0.1, 0], [0.28, 0.27, 0.28]);
      A('head', 'solid', G_BOX, bone, [0, -0.12, 0.08], [0.2, 0.1, 0.18]);
      A('head', 'solid', G_BOX, 0xffffff, [0, -0.08, 0.17], [0.16, 0.03, 0.02], null, false);
      for (const [, sx] of SIDES) {
        A('head', 'solid', G_SPH_LO, 0x0a1a10, [sx * 0.1, 0.1, 0.22], [0.08, 0.08, 0.05], null, false);
        A('head', 'eyes', G_SPH_LO, eye, [sx * 0.1, 0.1, 0.255], 0.042);
      }
      A('head', 'solid', G_CYL, crown, [0, 0.28, 0], [0.24, 0.08, 0.24]);
      for (let j = 0; j < 5; j++) {
        const a = (j - 2) * 0.55;
        A('head', 'solid', G_CONE4, crown, [Math.sin(a) * 0.22, 0.46 + (j === 2 ? 0.06 : 0), Math.cos(a) * 0.22], [0.05, 0.32 + (j === 2 ? 0.12 : 0), 0.05], [0, a, 0]);
      }
      A('head', 'eyes', G_OCTA, eye, [0, 0.3, 0.245], [0.04, 0.05, 0.02]);
      for (const [s] of SIDES) {
        const b = 'arm' + s;
        A(b, 'solid', cylT(0.4), robe, [0, -0.32, 0.02], [0.22, 0.65, 0.22]);
        A(b, 'glow', torus(0.1), trim, [0, -0.62, 0.02], [0.22, 0.22, 0.4], [HPI, 0, 0]);
        A(b, 'solid', G_SPH_LO, bone, [0, -0.72, 0.04], [0.08, 0.09, 0.08]);
        for (const j of [-1, 0, 1]) A(b, 'solid', G_CONE, bone, [j * 0.05, -0.85, 0.06], [0.02, 0.16, 0.02], [PI, 0, j * 0.25]);
      }
      // bâton
      A('armR', 'solid', G_CYL8, 0x3a2a1e, [0, -0.6, 0.12], [0.04, 2.6, 0.04]);
      A('armR', 'solid', G_SPH, bone, [0, 0.8, 0.12], 0.13);
      A('armR', 'eyes', G_OCTA, eye, [0, 1.02, 0.12], [0.1, 0.14, 0.1]);
      for (const sx of [1, -1]) A('armR', 'solid', G_CONE, 0x3a2a1e, [sx * 0.12, 0.98, 0.12], [0.03, 0.3, 0.03], [0, 0, -sx * 0.35]);
      // orbes qui tournent
      const oc = [0x7dff9a, 0xb070ff, 0x60e8ff];
      for (let j = 0; j < 3; j++) {
        const a = j * TAU / 3, x = Math.cos(a) * 1.35, z = Math.sin(a) * 1.35;
        A('orbs', 'glow', G_SPH, oc[j], [x, 0, z], 0.17);
        A('orbs', 'aura', G_SPH_LO, oc[j], [x, 0, z], 0.3);
      }
      return { height: 3.5, radius: 1.2, eyeColor: eye, outline: 0.055, float: true, baseY: 0.45, walkSpeed: 4, anim: 'lich' };
    },
    demon(R) {
      const skin = 0x3b2426, skinD = 0x241416, crack = 0xff6a10, horn = 0x2a1a18, hornTip = 0xffcf6a, wing = 0x6a1e1e, eye = 0xffe14d, flame = 0xff8a1a;
      R.bone('legL', 'root', 0.52, 1.3, 0); R.bone('legR', 'root', -0.52, 1.3, 0);
      R.bone('body', 'root', 0, 1.3, 0);
      R.bone('head', 'body', 0, 1.78, 0.3);
      R.bone('flame', 'head', 0, 0.42, -0.08);
      R.bone('armL', 'body', 1.15, 1.5, 0.05); R.bone('armR', 'body', -1.15, 1.5, 0.05);
      R.bone('wingL', 'body', 0.45, 1.35, -0.45); R.bone('wingR', 'body', -0.45, 1.35, -0.45);
      R.bone('tail', 'body', 0, 0.25, -0.45);
      R.bones.wingL.rotation.set(0, 0.5, 0.55); R.bones.wingR.rotation.set(0, -0.5, -0.55);
      const A = R.add.bind(R);
      for (const [s] of SIDES) {
        const b = 'leg' + s;
        seg(R, b, 'solid', G_CYL, skin, [0, 0, 0], [0, -0.55, 0.25], 0.28);
        A(b, 'solid', G_SPH, skin, [0, -0.55, 0.25], 0.22);
        seg(R, b, 'solid', cylT(0.8), skin, [0, -0.55, 0.25], [0, -1.0, -0.15], 0.2);
        seg(R, b, 'solid', cylT(1.3, 8), skinD, [0, -1.0, -0.15], [0, -1.28, 0.02], 0.15);
        seg(R, b, 'eyes', G_CYL6, crack, [0.1, -0.15, 0.24], [0.05, -0.45, 0.33], 0.03);
      }
      A('body', 'solid', G_SPH, skin, [0, 1.05, 0], [0.95, 0.72, 0.68]);
      A('body', 'solid', G_SPH, skin, [0, 0.4, 0.05], [0.65, 0.6, 0.52]);
      A('body', 'eyes', G_SPH, crack, [0, 0.95, 0.5], [0.22, 0.22, 0.2]);
      for (const sx of [1, -1]) {
        const pts = [[0.08 * sx, 1.32, 0.6], [0.32 * sx, 1.12, 0.6], [0.2 * sx, 0.82, 0.62], [0.42 * sx, 0.55, 0.47]];
        for (let i = 0; i < pts.length - 1; i++) seg(R, 'body', 'eyes', G_CYL6, crack, pts[i], pts[i + 1], 0.035);
        seg(R, 'body', 'eyes', G_CYL6, crack, [0.7 * sx, 1.3, 0.25], [0.55 * sx, 0.95, 0.42], 0.03);
        A('body', 'solid', G_CONE, horn, [sx * 0.75, 1.6, -0.1], [0.12, 0.4, 0.12], rotTo(sx * 0.5, 1, -0.2));
      }
      A('body', 'solid', cylT(0.8), skinD, [0, -0.05, 0], [0.62, 0.35, 0.5]);
      A('body', 'solid', G_CYL, 0x5a3a20, [0, 0.1, 0], [0.64, 0.1, 0.52]);
      A('body', 'solid', G_SPH, 0xe8dcc0, [0, 0.1, 0.52], [0.12, 0.12, 0.06]);
      A('head', 'solid', G_SPH, skin, [0, 0.1, 0], [0.45, 0.42, 0.43]);
      A('head', 'solid', G_BOX, skinD, [0, -0.18, 0.2], [0.42, 0.18, 0.3]);
      A('head', 'solid', G_BOX, skinD, [0, 0.22, 0.32], [0.6, 0.1, 0.14], [0.2, 0, 0]);
      for (const [, sx] of SIDES) {
        A('head', 'eyes', G_SPH_LO, eye, [sx * 0.15, 0.13, 0.385], [0.09, 0.045, 0.04], [0, 0, sx * 0.3]);
        A('head', 'solid', G_CONE, 0xfff2d8, [sx * 0.13, -0.05, 0.35], [0.035, 0.12, 0.035], null, false);
        const hp = [[sx * 0.3, 0.35, 0.05], [sx * 0.6, 0.55, 0.0], [sx * 0.78, 0.9, 0.1], [sx * 0.72, 1.2, 0.3]];
        const rr = [0.13, 0.1, 0.07];
        for (let i = 0; i < 3; i++) seg(R, 'head', 'solid', cylT(0.75, 8), horn, hp[i], hp[i + 1], rr[i]);
        A('head', 'glow', G_CONE, hornTip, [sx * 0.7, 1.3, 0.36], [0.05, 0.2, 0.05], rotTo(-sx * 0.2, 1, 0.6), true);
      }
      A('flame', 'aura', G_CONE, flame, [0, 0.2, 0], [0.22, 0.55, 0.22]);
      A('flame', 'aura', G_CONE, 0xffd24a, [0, 0.12, 0.02], [0.13, 0.35, 0.13]);
      for (const [s, sx] of SIDES) {
        const b = 'arm' + s;
        A(b, 'solid', G_SPH, skin, [0, 0, 0], 0.38);
        seg(R, b, 'solid', G_CYL, skin, [0, 0, 0], [0, -0.7, 0], 0.27);
        seg(R, b, 'solid', cylT(1.15), skin, [0, -0.7, 0], [0, -1.3, 0.15], 0.24);
        A(b, 'solid', G_SPH, skinD, [0, -1.4, 0.18], 0.3);
        for (const j of [-1, 0, 1]) A(b, 'solid', G_CONE, hornTip, [j * 0.12, -1.6, 0.32], [0.05, 0.2, 0.05], rotTo(j * 0.3, -1, 0.6));
        seg(R, b, 'eyes', G_CYL6, crack, [sx * 0.2, -0.2, 0.2], [sx * 0.1, -0.6, 0.24], 0.03);
        seg(R, b, 'eyes', G_CYL6, crack, [sx * 0.05, -0.8, 0.25], [sx * 0.18, -1.15, 0.28], 0.03);
      }
      for (const [s, sx] of SIDES) {
        const w = 'wing' + s;
        A(w, 'solid', G_WING, wing, [0, 0, 0], [sx * 2.7, 2.7, 2.7], [HPI, 0, 0]);
        const pts = [[0, 0.04, 0.32], [sx * 0.86, 0.04, 0.92], [sx * 1.67, 0.04, 0.86], [sx * 2.56, 0.04, 0.32]];
        for (let i = 0; i < 3; i++) seg(R, w, 'solid', G_CYL8, skinD, pts[i], pts[i + 1], 0.07);
        seg(R, w, 'solid', G_CYL8, skinD, pts[1], [sx * 1.2, 0.04, -0.3], 0.04);
        seg(R, w, 'solid', G_CYL8, skinD, pts[2], [sx * 2.0, 0.04, -0.2], 0.04);
      }
      const tp = [[0, 0, 0], [0, -0.3, -0.5], [0, -0.5, -1.0], [0, -0.4, -1.5]];
      for (let i = 0; i < 3; i++) seg(R, 'tail', 'solid', cylT(0.75, 8), skin, tp[i], tp[i + 1], 0.16 - i * 0.04);
      A('tail', 'solid', G_CONE4, skinD, [0, -0.33, -1.68], [0.18, 0.3, 0.05], [-HPI - 0.2, 0, 0]);
      A('tail', 'aura', G_CONE, flame, [0, -0.25, -1.6], [0.12, 0.4, 0.12]);
      return { height: 4.0, radius: 1.6, eyeColor: eye, outline: 0.06, walkSpeed: 5, anim: 'bossHumanoid' };
    },
  };

  function makeBoss(model) {
    const id = BOSS_BUILD[model] ? model : 'golem';
    const { root, rig } = charRoot(id);
    const R = new Rec(rig);
    const info = BOSS_BUILD[id](R);
    const asm = assemble(R, 'boss|' + id, info);
    finalizeChar(root, rig, R, asm, info, 1, id);
    const ud = root.userData;
    ud.anim = info.anim || 'bossHumanoid';
    ud.model = id;
    ud.isBoss = true;
    if (!ud.eyes.length) ud.eyes = [toon(info.eyeColor || 0xff3030, { emissive: info.eyeColor || 0xff3030 })];
    return root;
  }

  // ==================================================================
  // ANIMATION procédurale
  //   animateCharacter(group, time, { moving, windup:0..1, attack:0..1 })
  //   attack : 1 au moment du coup puis décroît vers 0 (coup rapide)
  // ==================================================================
  function setR(ud, bone, name, dx, dy, dz) {
    if (!bone) return;
    const r = ud.rest && ud.rest[name];
    bone.rotation.set((r ? r[0] : 0) + dx, (r ? r[1] : 0) + dy, (r ? r[2] : 0) + dz);
  }

  function animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, o) {
    o = o || {};
    const legA = o.legAmp != null ? o.legAmp : 0.75, armA = o.armAmp != null ? o.armAmp : 0.6;
    setR(ud, P.legL, 'legL', sw * legA, 0, 0);
    setR(ud, P.legR, 'legR', -sw * legA, 0, 0);
    if (rig) rig.position.y = (ud.baseY || 0) + Math.abs(Math.sin(ph)) * (o.bob != null ? o.bob : 0.07) * mv * (ud.baseScale || 1) - (o.crouch || 0) * w;
    const br = Math.sin(t * 2.2) * 0.03;
    const twist = o.twist != null ? o.twist : 1;
    if (P.body) setR(ud, P.body, 'body', 0.06 * mv + (o.lean != null ? o.lean : 0.12) * a - (o.leanBack || 0.05) * w, (Math.sin(ph) * 0.08 * mv - 0.35 * w + 0.5 * a) * twist, 0);
    let lx = -sw * armA, lz = 0.12 + br, rx = sw * armA, rz = -0.12 - br;
    rx = lerp(rx, o.windR != null ? o.windR : -2.5, w); rz = lerp(rz, o.windRz != null ? o.windRz : -0.45, w);
    lx = lerp(lx, o.windL != null ? o.windL : -0.6, w); lz = lerp(lz, o.windLz != null ? o.windLz : 0.35, w);
    rx = lerp(rx, o.hitR != null ? o.hitR : -1.45, a); rz = lerp(rz, o.hitRz != null ? o.hitRz : 0.35, a);
    lx = lerp(lx, o.hitL != null ? o.hitL : 0.35, a); lz = lerp(lz, o.hitLz != null ? o.hitLz : 0.2, a);
    setR(ud, P.armL, 'armL', lx, 0, lz);
    setR(ud, P.armR, 'armR', rx, 0, rz);
    if (P.head) setR(ud, P.head, 'head', -0.12 * w + 0.12 * a + Math.sin(t * 1.7) * 0.03, Math.sin(t * 0.6) * 0.12 * (1 - mv) * (1 - w), 0);
    if (P.wristR) setR(ud, P.wristR, 'wristR', lerp(lerp(0, -0.9, w), 1.45 - (ud.wristRest || 0), a), 0, 0);
    if (P.wristL) setR(ud, P.wristL, 'wristL', lerp(0, 1.2, a), 0, 0);
    if (P.jaw) setR(ud, P.jaw, 'jaw', Math.max(0, Math.sin(t * 7)) * 0.12 + 0.25 * w, 0, 0);
  }

  const ANIM = {
    humanoid(ud, P, rig, t, mv, w, a, ph, sw) { animHumanoid(ud, P, rig, t, mv, w, a, ph, sw); },
    hero(ud, P, rig, t, mv, w, a, ph, sw) {
      const c = ud.classId;
      if (c === 'Mage') animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, { windR: -2.0, windRz: -0.3, hitR: -1.5, hitRz: 0.1, hitL: -0.8, windL: -0.9, twist: 0.6 });
      else if (c === 'Voleur') animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, { windR: -2.2, windL: -1.6, windLz: 0.5, hitR: -1.55, hitL: -1.3, hitLz: -0.15, bob: 0.09, legAmp: 0.85 });
      else animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, { windL: -0.9, hitL: -0.2 });
      if (P.scarf) setR(ud, P.scarf, 'scarf', -0.15 - 0.45 * mv + Math.sin(t * 9) * 0.12 * mv, Math.sin(t * 4) * 0.12, 0);
      if (ud.auras && ud.auras.length) {
        const op = 0.38 + 0.2 * Math.sin(nowSec() * 5.5);
        for (const au of ud.auras) if (au.visible) au.material.opacity = op;
      }
    },
    archer(ud, P, rig, t, mv, w, a, ph, sw) {
      animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, { windR: -1.35, windRz: 0.35, windL: -1.55, windLz: -0.25, hitR: -1.0, hitRz: -0.5, hitL: -1.55, hitLz: -0.25, twist: -0.6 });
    },
    knight(ud, P, rig, t, mv, w, a, ph, sw) {
      animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, { legAmp: 0.55, armAmp: 0.35, bob: 0.05, windL: -1.2, windLz: -0.25, hitL: -1.0, hitLz: -0.2 });
    },
    imp(ud, P, rig, t, mv, w, a, ph, sw) {
      animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, { bob: 0.14, legAmp: 0.9, windR: -2.6, hitR: -1.3 });
      const f = Math.sin(t * 11) * 0.35;
      setR(ud, P.wingL, 'wingL', 0, 0, f); setR(ud, P.wingR, 'wingR', 0, 0, -f);
      setR(ud, P.tail, 'tail', Math.sin(t * 3) * 0.15, Math.sin(t * 2.4) * 0.5, 0);
    },
    slime(ud, P, rig, t, mv, w, a) {
      const f = mv > 0.5 ? 6.5 : 3.2;
      const h = Math.abs(Math.sin(t * f));
      const bs = ud.baseScale || 1;
      rig.position.y = h * (0.06 + 0.3 * mv) * (1 - w) * bs;
      let sy = 1 - (1 - h) * 0.16 * (0.5 + mv);
      let sxz = 1 / Math.sqrt(sy);
      sy *= 1 - 0.32 * w; sxz *= 1 + 0.18 * w;
      sy *= 1 + 0.3 * a; sxz *= 1 - 0.1 * a;
      if (P.body) { P.body.scale.set(sxz, sy, sxz); setR(ud, P.body, 'body', 0.35 * a, 0, 0); }
    },
    bat(ud, P, rig, t, mv, w, a) {
      rig.position.y = (ud.baseY || 1.2) + Math.sin(t * 3) * 0.15 - 0.5 * a + 0.15 * w;
      const fl = Math.sin(t * (16 + 10 * w)) * (0.7 + 0.2 * w);
      setR(ud, P.wingL, 'wingL', 0, 0, fl);
      setR(ud, P.wingR, 'wingR', 0, 0, -fl);
      setR(ud, P.body, 'body', 0.25 * mv + 0.7 * a - 0.35 * w, 0, Math.sin(t * 1.3) * 0.1);
      setR(ud, P.head, 'head', -0.3 * a + 0.2 * w, 0, 0);
    },
    spider(ud, P, rig, t, mv, w, a, ph, sw, amp) {
      amp = amp || 1;
      const legs = P.legs || [], li = ud.legInfo || [];
      for (let i = 0; i < legs.length; i++) {
        const inf = li[i] || { side: 1, phase: 0 };
        const q = ph + inf.phase;
        const swing = Math.sin(q) * 0.35 * mv * amp * (inf.side > 0 ? -1 : 1);
        const lift = Math.max(0, Math.cos(q)) * 0.3 * mv * amp + (inf.front ? 0.7 * w - 0.2 * a : 0) + Math.sin(t * 2 + i) * 0.03;
        setR(ud, legs[i], 'leg' + i, 0, swing, lift);
      }
      rig.position.y = (ud.baseY || 0) + Math.abs(Math.sin(ph * 2)) * 0.03 * mv * (ud.baseScale || 1);
      setR(ud, P.body, 'body', -0.35 * w + 0.25 * a, Math.sin(ph) * 0.05 * mv, 0);
      if (P.fangL) {
        const f = 0.15 + Math.sin(t * 6) * 0.15 + 0.4 * w - 0.3 * a;
        setR(ud, P.fangL, 'fangL', 0, -f, 0); setR(ud, P.fangR, 'fangR', 0, f, 0);
      }
      if (P.abdomen) {
        setR(ud, P.abdomen, 'abdomen', Math.sin(t * 1.5) * 0.05 - 0.15 * w, Math.sin(ph * 0.5) * 0.06 * mv, 0);
        const s = 1 + Math.sin(t * 2.2) * 0.025;
        P.abdomen.scale.set(s, s, s);
      }
    },
    spiderBoss(ud, P, rig, t, mv, w, a, ph, sw) { ANIM.spider(ud, P, rig, t, mv, w, a, ph, sw, 0.8); },
    wraith(ud, P, rig, t, mv, w, a) {
      rig.position.y = (ud.baseY || 0.35) + Math.sin(t * 2.2) * 0.12;
      setR(ud, P.body, 'body', 0.2 * mv + 0.3 * a - 0.15 * w, 0, Math.sin(t * 1.1) * 0.05);
      const ax = lerp(lerp(-0.3 * mv + Math.sin(t * 2) * 0.1, -2.0, w), -1.5, a);
      const az = 0.2 + 0.35 * w;
      setR(ud, P.armL, 'armL', ax, 0, az + Math.sin(t * 2.6) * 0.05);
      setR(ud, P.armR, 'armR', ax, 0, -az - Math.sin(t * 2.6) * 0.05);
      setR(ud, P.head, 'head', -0.15 * w + 0.15 * a + Math.sin(t * 1.3) * 0.05, Math.sin(t * 0.7) * 0.15, 0);
    },
    lich(ud, P, rig, t, mv, w, a) {
      rig.position.y = (ud.baseY || 0.45) + Math.sin(t * 1.8) * 0.15;
      setR(ud, P.body, 'body', 0.12 * mv + 0.2 * a - 0.12 * w, 0, Math.sin(t * 0.9) * 0.04);
      const lx = lerp(lerp(-0.2 + Math.sin(t * 1.6) * 0.08, -2.4, w), -1.4, a);
      setR(ud, P.armL, 'armL', lx, 0, 0.25 + 0.4 * w);
      setR(ud, P.armR, 'armR', lerp(lerp(-0.25, -1.6, w), -1.1, a), 0, -0.15 - 0.2 * w);
      setR(ud, P.head, 'head', -0.2 * w + 0.15 * a, Math.sin(t * 0.7) * 0.12, 0);
      if (P.orbs) {
        P.orbs.rotation.y = t * (1.2 + 3.5 * w);
        const s = 1 + 0.25 * w + Math.sin(t * 4) * 0.05;
        P.orbs.scale.set(s, 1, s);
      }
    },
    bossHumanoid(ud, P, rig, t, mv, w, a, ph, sw) {
      const k = ud.kind;
      const o = { legAmp: 0.45, armAmp: 0.35, bob: 0.06, windR: -2.7, windRz: -0.35, windL: -2.7, windLz: 0.35, hitR: -1.0, hitRz: 0.1, hitL: -1.0, hitLz: -0.1, lean: 0.35, leanBack: 0.15, twist: 0, crouch: 0.15 };
      if (k === 'skeletonKing') { o.windL = -1.0; o.hitL = -0.3; o.twist = 0.6; o.windR = -2.9; o.hitR = -0.9; }
      if (k === 'frostGiant') { o.windL = -1.6; o.hitL = -0.6; o.twist = 0.4; }
      animHumanoid(ud, P, rig, t, mv, w, a, ph, sw, o);
      if (P.cape) setR(ud, P.cape, 'cape', 0.08 + 0.3 * mv + Math.sin(t * 2.3) * 0.04 + 0.2 * w, 0, Math.sin(t * 1.7) * 0.03);
      if (P.sword) setR(ud, P.sword, 'sword', lerp(0, -0.6, w) + lerp(0, 0.9, a), 0, 0);
      if (P.club) setR(ud, P.club, 'club', lerp(0, -0.5, w) + lerp(0, 0.8, a), 0, 0);
      if (P.wingL) {
        const f = Math.sin(t * 2.4) * 0.22 + 0.35 * w - 0.2 * a;
        setR(ud, P.wingL, 'wingL', 0, -0.2 * w, f); setR(ud, P.wingR, 'wingR', 0, 0.2 * w, -f);
      }
      if (P.tail) setR(ud, P.tail, 'tail', Math.sin(t * 1.8) * 0.12, Math.sin(t * 1.3) * 0.35, 0);
      if (P.flame) { const s = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08; P.flame.scale.set(1, s + 0.4 * w, 1); }
    },
  };

  function animateCharacter(group, time, st) {
    if (!group || !group.userData) return;
    const ud = group.userData;
    if (!ud.kind || !ud.rig) return;
    st = st || {};
    time = +time || 0;
    const target = st.moving ? 1 : 0;
    ud._mv = ud._mv == null ? target : ud._mv + (target - ud._mv) * 0.2;
    const mv = ud._mv;
    const w = clamp(+st.windup || 0, 0, 1), a = clamp(+st.attack || 0, 0, 1);
    const t = time + (ud.phase || 0);
    const ph = t * (ud.walkSpeed || 9);
    const sw = Math.sin(ph) * mv;
    const fn = ud.kind === 'hero' ? ANIM.hero : (ANIM[ud.anim] || ANIM.humanoid);
    try { fn(ud, ud.parts || {}, ud.rig, t, mv, w, a, ph, sw); }
    catch (e) { if (!ud._animErr) { ud._animErr = true; console.warn('[GFX] animateCharacter', ud.kind, e); } }
  }

  // ==================================================================
  // SALLES
  // ==================================================================
  const THEMES = {
    crypte:     { name: 'Crypte oubliée',     bg: 0x121827, fog: [34, 80], hemiSky: 0xa9bcff, hemiGround: 0x2b2440, sun: 0xdde6ff },
    foret:      { name: 'Forêt maudite',      bg: 0x0e2114, fog: [34, 80], hemiSky: 0xc8f0a8, hemiGround: 0x2a3a1c, sun: 0xfff1c9 },
    catacombes: { name: 'Catacombes',         bg: 0x1d140d, fog: [34, 80], hemiSky: 0xffe2b8, hemiGround: 0x3a2a1a, sun: 0xffe6c0 },
    glace:      { name: 'Cavernes gelées',    bg: 0x1e3550, fog: [34, 85], hemiSky: 0xeaf7ff, hemiGround: 0x4d6b8a, sun: 0xf2f9ff },
    abysse:     { name: 'Abysse du Néant',    bg: 0x0b0615, fog: [32, 78], hemiSky: 0xb39cff, hemiGround: 0x1a0f2e, sun: 0xd8c8ff },
    volcan:     { name: 'Cœur du volcan',     bg: 0x1a0705, fog: [34, 80], hemiSky: 0xffb894, hemiGround: 0x3a1208, sun: 0xffd6ae },
  };

  // ---------- textures procédurales partagées ----------
  let DOT_TEX = null;
  function dotTex() {
    if (DOT_TEX) return DOT_TEX;
    const c = mkCanvas(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    DOT_TEX = new T.CanvasTexture(c);
    return DOT_TEX;
  }
  let LAVA_TEX = null, LAVA_SEA = null;
  function lavaTex() {
    if (LAVA_TEX) return LAVA_TEX;
    const N = 256, c = mkCanvas(N), x = c.getContext('2d');
    const rnd = mulberry32(777);
    x.fillStyle = '#b8240a'; x.fillRect(0, 0, N, N);
    const blob = (px, py, r, col) => {
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,90,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px + ox, py + oy, r, 0, TAU); x.fill();
      }
    };
    for (let i = 0; i < 40; i++) blob(rnd() * N, rnd() * N, 18 + rnd() * 40, 'rgba(255,110,20,0.85)');
    for (let i = 0; i < 26; i++) blob(rnd() * N, rnd() * N, 8 + rnd() * 22, 'rgba(255,214,80,0.9)');
    x.strokeStyle = 'rgba(70,10,0,0.55)'; x.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      x.beginPath(); let px = rnd() * N, py = rnd() * N; x.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += (rnd() - 0.5) * 60; py += (rnd() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
    LAVA_TEX = new T.CanvasTexture(c);
    LAVA_TEX.wrapS = LAVA_TEX.wrapT = T.RepeatWrapping;
    LAVA_SEA = LAVA_TEX.clone();
    LAVA_SEA.wrapS = LAVA_SEA.wrapT = T.RepeatWrapping;
    LAVA_SEA.repeat.set(16, 16);
    LAVA_SEA.needsUpdate = true;
    return LAVA_TEX;
  }
  let WEB_TEX = null;
  function webTex() {
    if (WEB_TEX) return WEB_TEX;
    const N = 128, c = mkCanvas(N), x = c.getContext('2d');
    x.strokeStyle = 'rgba(235,240,255,0.85)'; x.lineWidth = 1.5;
    const cx = 0, cy = N;
    for (let i = 0; i <= 6; i++) {
      const a = -i / 6 * HPI;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * N * 1.2, cy + Math.sin(a) * N * 1.2); x.stroke();
    }
    for (let r = 14; r < N * 1.1; r += 16) {
      x.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = -i / 6 * HPI, rr = r * (0.92 + 0.08 * Math.sin(i * 2.3 + r));
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (i === 0) x.moveTo(px, py); else x.quadraticCurveTo(cx + Math.cos(a + 0.13) * rr * 0.9, cy + Math.sin(a + 0.13) * rr * 0.9, px, py);
      }
      x.stroke();
    }
    WEB_TEX = new T.CanvasTexture(c);
    return WEB_TEX;
  }
  function gradTex(colorHex, vertical) {
    const c = mkCanvas(8, 64), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 64, 0, 0);
    g.addColorStop(0, css(colorHex, vertical ? 0.75 : 0)); g.addColorStop(1, css(colorHex, vertical ? 0 : 1));
    x.fillStyle = g; x.fillRect(0, 0, 8, 64);
    return new T.CanvasTexture(c);
  }

  // ---------- peinture du sol ----------
  function quadPath(x, a, b, c, d) { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.lineTo(d[0], d[1]); x.closePath(); }
  function drawTiles(x, N, cells, jit, rnd, fillFn, joint, jointW, bevel, ex, exJoint) {
    const cs = N / cells, row = cells + 1, pts = [];
    for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) {
      const jx = (i === 0 || i === cells) ? 0 : (rnd() - 0.5) * 2 * jit * cs;
      const jy = (j === 0 || j === cells) ? 0 : (rnd() - 0.5) * 2 * jit * cs;
      pts.push([i * cs + jx, j * cs + jy]);
    }
    const tiles = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const a = pts[j * row + i], b = pts[j * row + i + 1], c = pts[(j + 1) * row + i + 1], d = pts[(j + 1) * row + i];
      quadPath(x, a, b, c, d);
      x.fillStyle = fillFn(i, j); x.fill();
      if (bevel) {
        x.save(); quadPath(x, a, b, c, d); x.clip();
        x.lineWidth = bevel * 2;
        x.translate(bevel, bevel); quadPath(x, a, b, c, d); x.strokeStyle = 'rgba(255,255,255,0.14)'; x.stroke();
        x.translate(-bevel * 2, -bevel * 2); quadPath(x, a, b, c, d); x.strokeStyle = 'rgba(0,0,0,0.22)'; x.stroke();
        x.restore();
      }
      quadPath(x, a, b, c, d);
      x.lineWidth = jointW; x.strokeStyle = joint; x.stroke();
      if (ex && exJoint) { quadPath(ex, a, b, c, d); ex.lineWidth = jointW + 1; ex.strokeStyle = exJoint; ex.stroke(); }
      tiles.push({ x: (a[0] + c[0]) / 2, y: (a[1] + c[1]) / 2, s: cs, i, j });
    }
    return tiles;
  }
  function crack(x, px, py, len, rnd, color, w, ex, exColor) {
    const pts = [[px, py]];
    let a = rnd() * TAU;
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) { a += (rnd() - 0.5) * 1.4; px += Math.cos(a) * len / n; py += Math.sin(a) * len / n; pts.push([px, py]); }
    const draw = (c, col, lw) => {
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
      c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    };
    draw(x, color, w);
    if (ex) draw(ex, exColor, w + 1.5);
    if (rnd() < 0.5) {
      const m = pts[1 + Math.floor(rnd() * (pts.length - 1))];
      const b = a + (rnd() < 0.5 ? 1 : -1) * (0.8 + rnd() * 0.6);
      x.beginPath(); x.moveTo(m[0], m[1]); x.lineTo(m[0] + Math.cos(b) * len * 0.35, m[1] + Math.sin(b) * len * 0.35); x.lineWidth = w * 0.7; x.strokeStyle = color; x.stroke();
    }
  }
  function blob(x, px, py, r, col) {
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
  function edgeShade(x, N, w, a) {
    const sides = [[0, 0, 0, w], [0, N, 0, N - w], [0, 0, w, 0], [N, 0, N - w, 0]];
    for (const [x0, y0, x1, y1] of sides) {
      const g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, N, N);
    }
  }
  function centerMotif(x, N, ppu, color, alpha, ex) {
    const c = N / 2;
    const ring = (c2, r, lw, col) => { c2.beginPath(); c2.arc(c, c, r, 0, TAU); c2.lineWidth = lw; c2.strokeStyle = col; c2.stroke(); };
    const targets = ex ? [[x, css(color, alpha)], [ex, css(color, 0.9)]] : [[x, css(color, alpha)]];
    for (const [c2, col] of targets) {
      ring(c2, 3.2 * ppu, 5, col); ring(c2, 2.7 * ppu, 2, col); ring(c2, 1.1 * ppu, 3, col);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        c2.beginPath(); c2.moveTo(c + Math.cos(a) * 1.3 * ppu, c + Math.sin(a) * 1.3 * ppu); c2.lineTo(c + Math.cos(a) * 2.6 * ppu, c + Math.sin(a) * 2.6 * ppu);
        c2.lineWidth = 3; c2.strokeStyle = col; c2.stroke();
        c2.beginPath(); c2.arc(c + Math.cos(a + 0.39) * 2.95 * ppu, c + Math.sin(a + 0.39) * 2.95 * ppu, 0.12 * ppu, 0, TAU); c2.fillStyle = col; c2.fill();
      }
    }
  }
  function rune(x, px, py, s, col, lw, rnd) {
    x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round';
    x.beginPath(); x.arc(px, py, s, 0, TAU); x.stroke();
    x.beginPath();
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, b = a + PI * (0.5 + rnd());
      x.moveTo(px + Math.cos(a) * s * 0.7, py + Math.sin(a) * s * 0.7); x.lineTo(px + Math.cos(b) * s * 0.7, py + Math.sin(b) * s * 0.7);
    }
    x.stroke();
  }

  const FLOOR_CACHE = {};
  function floorTextures(th, variant, half) {
    const key = th + '|' + variant + '|' + half;
    if (FLOOR_CACHE[key]) return FLOOR_CACHE[key];
    const S = STYLE[th];
    const N = 1024, cv = mkCanvas(N), x = cv.getContext('2d');
    let ecv = null, ex = null;
    if (S.emissiveFloor) {
      ecv = mkCanvas(512); ex = ecv.getContext('2d');
      ex.fillStyle = '#000'; ex.fillRect(0, 0, 512, 512); ex.scale(0.5, 0.5);
    }
    const rnd = mulberry32(hashStr(key));
    const ppu = N / (half * 2);
    S.paintFloor(x, N, ppu, rnd, ex);
    edgeShade(x, N, 1.4 * ppu, 0.5);
    const map = new T.CanvasTexture(cv);
    map.anisotropy = 4;
    let emis = null;
    if (ecv) { emis = new T.CanvasTexture(ecv); }
    return (FLOOR_CACHE[key] = { map, emis });
  }

  // ---------- lots de géométrie statique fusionnée ----------
  class Batch {
    constructor() { this.list = []; }
    add(g, c, p, s, r, ol, ot) {
      this.list.push({ g, c, p, s: typeof s === 'number' ? [s, s, s] : s, r: r || [0, 0, 0], ol: ol !== false, ot });
    }
    build(mat, olT, olColor) {
      if (!this.list.length) return null;
      const g = mergePieces(this.list, 'solid');
      const mesh = new T.Mesh(g, mat);
      const og = mergePieces(this.list, 'outline', olT != null ? olT : 0.045);
      const out = og ? new T.Mesh(og, outlineMat(olColor || 0)) : null;
      if (out) out.userData.isOutline = true;
      return { mesh, out };
    }
  }
  const rot2 = (x, z, dx, dz, ry) => [x + dx * Math.cos(ry) + dz * Math.sin(ry), z - dx * Math.sin(ry) + dz * Math.cos(ry)];

  // ---------- accessoires génériques ----------
  const PROP = {
    crate(B, x, z, s, ry, wood) {
      const w = wood || 0x9a6a3a, d = shade(w, -0.35);
      B.add(G_BOX, w, [x, s, z], [2 * s, 2 * s, 2 * s], [0, ry, 0]);
      B.add(G_BOX, d, [x, 0.1, z], [2 * s + 0.06, 0.16, 2 * s + 0.06], [0, ry, 0]);
      B.add(G_BOX, d, [x, 2 * s - 0.1, z], [2 * s + 0.06, 0.16, 2 * s + 0.06], [0, ry, 0]);
      for (const [dx, dz] of [[s, s], [-s, s], [s, -s], [-s, -s]]) {
        const p = rot2(x, z, dx, dz, ry);
        B.add(G_BOX, d, [p[0], s, p[1]], [0.16, 2 * s, 0.16], [0, ry, 0]);
      }
      const f = rot2(x, z, 0, s + 0.01, ry);
      B.add(G_BOX, d, [f[0], s, f[1]], [0.14, 2 * s * 1.3, 0.04], [0, ry, 0.78], false);
    },
    rock(B, x, z, s, c, rnd) {
      B.add(G_DODE, c, [x, s * 0.45, z], [s, s * 0.75, s * 0.9], [rnd() * 0.3, rnd() * TAU, rnd() * 0.3]);
      const p = rot2(x, z, s * 0.9, s * 0.3, rnd() * TAU);
      B.add(G_DODE, shade(c, -0.12), [p[0], s * 0.2, p[1]], [s * 0.4, s * 0.32, s * 0.4], [0, rnd() * TAU, 0]);
    },
    column(B, x, z, h, r, c, cTop) {
      B.add(G_BOX, cTop, [x, 0.16, z], [r * 2.5, 0.32, r * 2.5]);
      B.add(G_CYL8, c, [x, h / 2, z], [r, h - 0.5, r]);
      B.add(G_CYL8, cTop, [x, 0.42, z], [r * 1.15, 0.18, r * 1.15]);
      B.add(G_CYL8, cTop, [x, h - 0.42, z], [r * 1.15, 0.18, r * 1.15]);
      B.add(G_BOX, cTop, [x, h - 0.16, z], [r * 2.5, 0.32, r * 2.5]);
    },
    sarcophagus(B, x, z, ry, c, lid, deco) {
      B.add(G_BOX, c, [x, 0.32, z], [1.0, 0.64, 2.0], [0, ry, 0]);
      B.add(G_BOX, lid, [x, 0.72, z], [1.12, 0.18, 2.14], [0, ry, 0]);
      const a = rot2(x, z, 0, 0.15, ry);
      B.add(G_BOX, deco, [a[0], 0.84, a[1]], [0.14, 0.07, 1.3], [0, ry, 0], false);
      const b = rot2(x, z, 0, 0.45, ry);
      B.add(G_BOX, deco, [b[0], 0.84, b[1]], [0.65, 0.07, 0.14], [0, ry, 0], false);
    },
    coffin(B, x, z, ry, wood, deco) {
      B.add(G_BOX, wood, [x, 0.28, z], [0.95, 0.5, 1.95], [0, ry, 0]);
      B.add(G_BOX, shade(wood, 0.12), [x, 0.58, z], [0.85, 0.12, 1.85], [0, ry, 0]);
      const a = rot2(x, z, 0, 0.25, ry);
      B.add(G_BOX, deco, [a[0], 0.66, a[1]], [0.1, 0.05, 0.9], [0, ry, 0], false);
      const b = rot2(x, z, 0, 0.45, ry);
      B.add(G_BOX, deco, [b[0], 0.66, b[1]], [0.45, 0.05, 0.1], [0, ry, 0], false);
    },
    skull(B, x, y, z, s, c, ry) {
      B.add(G_SPH_LO, c, [x, y + s, z], [s, s * 0.95, s]);
      const j = rot2(x, z, 0, s * 0.35, ry || 0);
      B.add(G_BOX, c, [j[0], y + s * 0.35, j[1]], [s * 0.8, s * 0.4, s * 0.8], [0, ry || 0, 0]);
      for (const sx of [1, -1]) {
        const e = rot2(x, z, sx * s * 0.38, s * 0.82, ry || 0);
        B.add(G_SPH_LO, 0x1a1410, [e[0], y + s * 1.05, e[1]], s * 0.26, null, false);
      }
    },
    bones(B, x, z, n, rnd, c) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, d = rnd() * 0.5, L = 0.3 + rnd() * 0.25;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, ry = rnd() * TAU;
        B.add(G_CYL8, c, [px, 0.05 + i * 0.015, pz], [0.035, L, 0.035], [HPI, ry, 0]);
        for (const e of [-1, 1]) {
          const q = rot2(px, pz, 0, e * L / 2, ry);
          B.add(G_SPH_LO, c, [q[0], 0.06 + i * 0.015, q[1]], 0.055);
        }
      }
    },
    candle(B, GB, x, y, z, h, c) {
      B.add(G_CYL8, c || 0xf3e6c4, [x, y + h / 2, z], [0.06, h, 0.06]);
      GB.add(G_CONE, 0xffc040, [x, y + h + 0.08, z], [0.045, 0.14, 0.045], null, false);
      GB.add(G_SPH_LO, 0xfff2b0, [x, y + h + 0.05, z], 0.03, null, false);
    },
    mushroom(B, GB, x, z, s, cap, rnd) {
      const ry = rnd() * TAU, tilt = (rnd() - 0.5) * 0.4;
      B.add(G_CYL8, 0xf0ead8, [x, 0.18 * s, z], [0.07 * s, 0.36 * s, 0.07 * s], [tilt, ry, 0]);
      GB.add(G_HEMI, cap, [x, 0.34 * s, z], [0.24 * s, 0.17 * s, 0.24 * s], [tilt, ry, 0], true, 0.03);
      GB.add(G_SPH_LO, 0xffffff, [x + 0.08 * s, 0.47 * s, z], 0.035 * s, null, false);
    },
    pine(B, x, z, s, c1, c2) {
      B.add(G_CYL8, 0x6b4426, [x, 0.4 * s, z], [0.16 * s, 0.8 * s, 0.16 * s]);
      B.add(G_CONE, c1, [x, 1.25 * s, z], [0.95 * s, 1.2 * s, 0.95 * s]);
      B.add(G_CONE, c2, [x, 1.95 * s, z], [0.72 * s, 1.0 * s, 0.72 * s]);
      B.add(G_CONE, c1, [x, 2.6 * s, z], [0.48 * s, 0.85 * s, 0.48 * s]);
    },
    roundTree(B, x, z, s, c1, c2, rnd) {
      B.add(cylT(0.7, 8), 0x7a5030, [x, 0.7 * s, z], [0.2 * s, 1.4 * s, 0.2 * s]);
      B.add(G_SPH, c1, [x, 1.9 * s, z], [0.95 * s, 0.8 * s, 0.95 * s]);
      B.add(G_SPH, c2, [x + 0.45 * s, 1.6 * s, z + 0.2 * s], [0.6 * s, 0.5 * s, 0.6 * s]);
      B.add(G_SPH, shade(c1, 0.12), [x - 0.3 * s, 2.35 * s, z - 0.15 * s], [0.55 * s, 0.45 * s, 0.55 * s], [0, rnd() * TAU, 0]);
    },
    bush(B, x, z, s, c, rnd) {
      B.add(G_SPH, c, [x, 0.35 * s, z], [0.55 * s, 0.45 * s, 0.55 * s]);
      B.add(G_SPH, shade(c, 0.12), [x + 0.35 * s, 0.28 * s, z + 0.1 * s], [0.36 * s, 0.32 * s, 0.36 * s]);
      B.add(G_SPH, shade(c, -0.1), [x - 0.3 * s, 0.25 * s, z - 0.15 * s], [0.34 * s, 0.3 * s, 0.34 * s], [0, rnd() * TAU, 0]);
    },
    crystal(GB, x, z, s, c, rnd, y) {
      y = y || 0;
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, tilt = i === 0 ? 0 : 0.35 + rnd() * 0.4;
        const h = (i === 0 ? 1.2 : 0.5 + rnd() * 0.5) * s, r = (i === 0 ? 0.2 : 0.11 + rnd() * 0.06) * s;
        const dir = [Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)];
        GB.add(G_CONE6, i % 2 ? shade(c, 0.25) : c, [x + dir[0] * h * 0.45, y + dir[1] * h * 0.45, z + dir[2] * h * 0.45], [r, h, r], rotTo(dir[0], dir[1], dir[2]), true, 0.035);
      }
    },
    stalagmite(B, x, z, h, c, rnd) {
      B.add(G_CONE6, c, [x, h / 2, z], [0.42 * h * 0.45, h, 0.42 * h * 0.45], [0, rnd() * TAU, 0]);
      B.add(G_CONE6, shade(c, -0.1), [x + 0.35, h * 0.22, z + 0.15], [0.18 * h * 0.45, h * 0.45, 0.18 * h * 0.45], [0, 0, -0.2]);
      B.add(G_CONE6, shade(c, 0.12), [x - 0.3, h * 0.17, z - 0.2], [0.14 * h * 0.45, h * 0.34, 0.14 * h * 0.45], [0.15, 0, 0.15]);
    },
    urn(B, x, z, s, c, rnd) {
      B.add(G_SPH, c, [x, 0.32 * s, z], [0.28 * s, 0.32 * s, 0.28 * s]);
      B.add(G_CYL8, shade(c, -0.15), [x, 0.66 * s, z], [0.13 * s, 0.14 * s, 0.13 * s]);
      B.add(G_CYL8, shade(c, 0.1), [x, 0.75 * s, z], [0.18 * s, 0.06 * s, 0.18 * s]);
      if (rnd() < 0.5) B.add(G_BOX, shade(c, 0.3), [x, 0.35 * s, z], [0.58 * s, 0.06 * s, 0.58 * s], [0, rnd(), 0], false);
    },
  };

  // ---------- zones libres ----------
  function isFree(ctx, x, z, r, o) {
    o = o || {};
    const h = ctx.half;
    if (Math.abs(x) > h - 0.6 - r || Math.abs(z) > h - 0.6 - r) return false;
    for (const ob of ctx.obstacles) if (Math.abs(x - ob.x) < ob.hw + r && Math.abs(z - ob.z) < ob.hd + r) return false;
    if (!o.allowHazard) for (const hz of ctx.hazards) if (Math.hypot(x - hz.x, z - hz.z) < hz.r + r) return false;
    if (!o.allowStart && Math.hypot(x - ctx.playerStart[0], z - ctx.playerStart[1]) < 2.8 + r) return false;
    if (!o.allowCenter && Math.hypot(x, z) < 3.6 + r) return false;
    if (!o.allowDoor && Math.abs(x) < 3 + r && z < -h + 5 + r) return false;
    for (const rs of ctx.reserved) if (Math.hypot(x - rs[0], z - rs[1]) < rs[2] + r) return false;
    return true;
  }

  // ---------- murs ----------
  function sidePlace(ctx, side, u, n, su, sn) {
    const h = ctx.half + 0.5;
    switch (side) {
      case 'N': return [u, -h + n, su, sn];
      case 'S': return [u, h - n, su, sn];
      case 'W': return [-h + n, u, sn, su];
      default: return [h - n, u, sn, su];
    }
  }
  function wallPiece(ctx, side, u, n, y, su, sy, sn, color, geo, B, ry, ol) {
    const p = sidePlace(ctx, side, u, n, su, sn);
    const isZ = side === 'W' || side === 'E';
    (B || ctx.B).add(geo || G_BOX, color, [p[0], y, p[1]], geo && geo !== G_BOX ? [su, sy, sn] : [p[2], sy, p[3]], [0, (ry || 0) + (isZ && geo && geo !== G_BOX ? HPI : 0), 0], ol);
  }
  function masonryRun(ctx, side, u0, u1, H) {
    const { S, rnd } = ctx, W = S.wall;
    const rows = side === 'S' ? Math.max(1, Math.round(W.rows * H / ctx.H)) : W.rows;
    wallPiece(ctx, side, (u0 + u1) / 2, 0.04, 0.13, u1 - u0, 0.26, 1.1, W.base);
    let y = 0;
    const rh = H / rows;
    for (let r = 0; r < rows; r++) {
      let u = u0, first = true;
      while (u < u1 - 0.05) {
        let len = W.blockLen * (0.7 + rnd() * 0.6);
        if (first && r % 2) len *= 0.5;
        first = false;
        if (u + len > u1 - 0.25) len = u1 - u;
        const c = jitterColor(r === rows - 1 ? W.top : W.color, rnd, W.jit || 0.07);
        wallPiece(ctx, side, u + len / 2, (rnd() - 0.5) * 0.05, y + rh / 2, len - 0.05, rh - 0.04, 1.0, c);
        u += len;
      }
      y += rh;
    }
    if (W.pilaster && side !== 'S') for (let u = u0 + 2.3; u < u1 - 1; u += 4.6) {
      wallPiece(ctx, side, u, -0.15, (H + 0.35) / 2, 0.8, H + 0.35, 1.3, W.pilaster);
      wallPiece(ctx, side, u, -0.15, H + 0.42, 0.95, 0.14, 1.42, W.top);
    }
  }
  function basaltRun(ctx, side, u0, u1, H) {
    const { S, rnd } = ctx, W = S.wall;
    wallPiece(ctx, side, (u0 + u1) / 2, -0.1, H * 0.38, u1 - u0, H * 0.76, 0.85, W.base);
    for (let u = u0 + 0.3; u < u1; u += 0.6 + rnd() * 0.1) {
      const h = H * (side === 'S' ? 1 : 0.8 + rnd() * 0.38), r = 0.34 + rnd() * 0.08, n = -0.15 + rnd() * 0.25;
      const p = sidePlace(ctx, side, u, n, 1, 1);
      ctx.B.add(G_CYL6, jitterColor(W.color, rnd, 0.1), [p[0], h / 2, p[1]], [r, h, r], [0, rnd(), 0]);
      ctx.B.add(G_CYL6, W.top, [p[0], h + 0.04, p[1]], [r * 0.9, 0.08, r * 0.9], [0, rnd(), 0], false);
    }
  }
  function buildWalls(ctx) {
    const { S, half } = ctx;
    const H = ctx.H;
    const sides = { N: [[-half, -2.9], [2.9, half]], S: [[-half, half]], W: [[-half - 1, half + 1]], E: [[-half - 1, half + 1]] };
    for (const side in sides) {
      const Hs = side === 'S' ? (S.southH || 1.1) : H;
      for (const [u0, u1] of sides[side]) {
        if (S.wall.style === 'basalt') basaltRun(ctx, side, u0, u1, Hs); else masonryRun(ctx, side, u0, u1, Hs);
        if (S.wallTop) S.wallTop(ctx, side, u0, u1, Hs);
      }
    }
    ctx.addObs(-(half + 0.5), 0, 0.5, half + 1);
    ctx.addObs(half + 0.5, 0, 0.5, half + 1);
    ctx.addObs(0, half + 0.5, half + 1, 0.5);
    const nw = (half - 1) / 2;
    ctx.addObs(-(half + 3) / 2, -(half + 0.5), nw, 0.5);
    ctx.addObs((half + 3) / 2, -(half + 0.5), nw, 0.5);
  }

  // ---------- porte nord + arche + couloir ----------
  function buildDoor(ctx) {
    const { S, half, group, B } = ctx;
    const H = ctx.H, D = S.door, z = -(half + 0.5), top = Math.max(H, 2.2) + 0.6;
    for (const sx of [1, -1]) {
      B.add(G_BOX, D.frame, [sx * 2.45, top / 2, z], [0.9, top, 1.4]);
      B.add(G_BOX, shade(D.frame, 0.15), [sx * 2.45, top + 0.08, z], [1.1, 0.16, 1.55]);
      B.add(G_BOX, shade(D.frame, -0.12), [sx * 2.45, 0.16, z], [1.1, 0.32, 1.55]);
    }
    const archG = torus(0.17, PI, 14);
    B.add(archG, D.frame, [0, top, z], [2.45, 1.15, 4.0]);
    B.add(G_BOX, D.key, [0, top + 1.15, z + 0.05], [0.55, 0.62, 1.5]);
    B.add(G_BOX, 0x07070b, [0, top + 0.42, z - 0.25], [4.0, 0.95, 0.2], null, false);
    // couloir derrière
    const cz = -(half + 4);
    for (const sx of [1, -1]) B.add(G_BOX, shade(S.wall.color, -0.35), [sx * 2.7, (H + 0.4) / 2, cz], [0.7, H + 0.4, 6]);
    const cg = new T.PlaneGeometry(4.8, 7.2); cg.rotateX(-HPI);
    const cf = new T.Mesh(cg, toon(S.corridor));
    cf.position.set(0, 0.004, cz + 0.3); cf.receiveShadow = true; group.add(cf);
    ctx.owned.push(cg, cf.material);
    const dg = new T.PlaneGeometry(4.8, 7.2); dg.rotateX(-HPI);
    const dark = new T.Mesh(dg, new T.MeshBasicMaterial({ map: gradTex(0x000000, false), transparent: true, depthWrite: false }));
    dark.position.set(0, 0.02, cz + 0.3); dark.renderOrder = 1; group.add(dark);
    ctx.owned.push(dg, dark.material, dark.material.map);

    // battant (descend dans le sol)
    const doorG = new T.Group();
    doorG.position.set(0, 0, -(half + 0.35));
    const DB = new Batch();
    const pw = 4.0 / 5;
    for (let i = 0; i < 5; i++) DB.add(G_BOX, i % 2 ? D.wood : shade(D.wood, -0.1), [-2 + pw * (i + 0.5), top / 2 - 0.02, 0], [pw - 0.03, top - 0.04, 0.28]);
    for (const y of [0.45, top / 2, top - 0.45]) {
      DB.add(G_BOX, D.band, [0, y, 0.02], [4.02, 0.2, 0.34]);
      for (let i = 0; i < 6; i++) DB.add(G_SPH_LO, shade(D.band, 0.3), [-1.75 + i * 0.7, y, 0.19], 0.05, null, false);
    }
    DB.add(G_OCTA, D.key, [0, top / 2 + 0.45, 0.2], [0.28, 0.36, 0.08]);
    DB.add(torus(0.18), D.band, [0.55, top / 2 - 0.2, 0.2], [0.16, 0.16, 0.25]);
    DB.add(torus(0.18), D.band, [-0.55, top / 2 - 0.2, 0.2], [0.16, 0.16, 0.25]);
    const db = DB.build(ENV_MAT, 0.04);
    db.mesh.castShadow = true; doorG.add(db.mesh); if (db.out) doorG.add(db.out);
    ctx.owned.push(db.mesh.geometry, db.out && db.out.geometry);
    group.add(doorG);

    // lueur verte (porte ouverte)
    const glowMat = new T.MeshBasicMaterial({ color: 0x5dff7a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    const archGlow = new T.Mesh(archG, glowMat);
    archGlow.position.set(0, top, z + 0.75); archGlow.scale.set(2.45, 1.2, 0.6);
    const sideGlowG = gk('doorSideGlow', () => new T.BoxGeometry(0.1, 1, 0.1));
    const pillars = [1, -1].map(sx => { const m = new T.Mesh(sideGlowG, glowMat); m.position.set(sx * 2.02, top / 2, z + 0.72); m.scale.set(1, top, 1); return m; });
    const portalTex = gradTex(0x5dff7a, true);
    const portal = new T.Mesh(gk('portalPlane', () => new T.PlaneGeometry(1, 1)), new T.MeshBasicMaterial({ map: portalTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    portal.position.set(0, top / 2, z - 0.1); portal.scale.set(3.9, top, 1);
    const arrowG = gk('doorArrow', () => {
      const s = new T.Shape();
      s.moveTo(0, 1); s.lineTo(0.75, 0.15); s.lineTo(0.3, 0.15); s.lineTo(0.3, -0.85); s.lineTo(-0.3, -0.85); s.lineTo(-0.3, 0.15); s.lineTo(-0.75, 0.15); s.lineTo(0, 1);
      const g = new T.ShapeGeometry(s); g.rotateX(-HPI); return g;
    });
    const arrowMat = new T.MeshBasicMaterial({ color: 0x6dff8a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const arrows = [0, 1].map(i => { const m = new T.Mesh(arrowG, arrowMat); m.position.set(0, 0.04 + i * 0.002, -half + 2.6 + i * 1.9); m.scale.setScalar(i ? 0.75 : 1.05); m.renderOrder = 2; return m; });
    const fx = new T.Group();
    fx.add(archGlow, pillars[0], pillars[1], portal, arrows[0], arrows[1]);
    fx.visible = false;
    group.add(fx);
    ctx.owned.push(glowMat, portal.material, portalTex, arrowMat);

    const obstacle = ctx.addObs(0, -(half + 0.5), 2.0, 0.5);
    const st = { target: 0, p: 0 };
    ctx.anims.push((dt, t) => {
      const sp = dt * 1.05;
      if (st.p < st.target) st.p = Math.min(st.target, st.p + sp); else if (st.p > st.target) st.p = Math.max(st.target, st.p - sp);
      const e = smooth(st.p);
      doorG.position.y = -(top + 0.1) * e;
      doorG.visible = st.p < 0.999;
      fx.visible = st.p > 0.01;
      if (fx.visible) {
        glowMat.opacity = e * (0.55 + 0.25 * Math.sin(t * 4));
        portal.material.opacity = e * (0.5 + 0.15 * Math.sin(t * 3));
        arrowMat.opacity = st.p > 0.5 ? (st.p - 0.5) * 2 * (0.55 + 0.4 * Math.sin(t * 5)) : 0;
        arrows[0].position.z = -half + 2.6 - (Math.sin(t * 3) * 0.5 + 0.5) * 0.45;
        arrows[1].position.z = -half + 4.5 - (Math.sin(t * 3 - 1) * 0.5 + 0.5) * 0.45;
      }
    });
    return { obstacle, setOpen: open => { st.target = open ? 1 : 0; } };
  }

  // ---------- sources lumineuses (≤ 4 PointLight) ----------
  const G_FLAME = G_CONE;
  function buildLights(ctx) {
    const { S, half, group, B, GB } = ctx;
    const L = S.light, H = ctx.H;
    const spots = [[-6.5, 'N'], [6.5, 'N'], [2.5, 'W'], [2.5, 'E']];
    const outer = basic(L.flame, 0.85, true), inner = basic(0xfff2c0, 0.95, true), halo = basic(L.flame, 0.22, true);
    for (const [u, side] of spots) {
      const inw = side === 'N' ? [0, 1] : side === 'W' ? [1, 0] : [-1, 0];
      const face = side === 'N' ? [u, -half] : side === 'W' ? [-half, u] : [half, u];
      const at = d => [face[0] + inw[0] * d, face[1] + inw[1] * d];
      const ry = Math.atan2(inw[0], inw[1]);
      let fp, fy, fs = 1;
      if (L.style === 'torch') {
        const b = at(0.12), s = at(0.38);
        B.add(G_BOX, 0x3a3a40, [b[0], 1.55, b[1]], [0.22, 0.3, 0.12], [0, ry, 0]);
        B.add(G_CYL8, 0x5a3a22, [s[0], 1.7, s[1]], [0.06, 0.55, 0.06], [0.45, ry, 0]);
        B.add(cylT(1.5, 8), 0x3a3a40, [at(0.5)[0], 1.98, at(0.5)[1]], [0.09, 0.14, 0.09]);
        fp = at(0.5); fy = 2.15;
        ctx.reserved.push([fp[0], fp[1], 0.4]);
      } else if (L.style === 'lantern') {
        const p = at(1.1);
        B.add(G_CYL8, 0x4a3020, [p[0], 1.05, p[1]], [0.08, 2.1, 0.08]);
        B.add(G_BOX, 0x2a2a2a, [p[0], 2.12, p[1]], [0.42, 0.06, 0.42]);
        B.add(G_BOX, 0x2a2a2a, [p[0], 1.64, p[1]], [0.36, 0.05, 0.36]);
        GB.add(G_BOX, 0xffe7a0, [p[0], 1.88, p[1]], [0.3, 0.4, 0.3], null, true, 0.03);
        B.add(G_CONE4, 0x2a2a2a, [p[0], 2.3, p[1]], [0.34, 0.3, 0.34], [0, PI / 4, 0]);
        fp = p; fy = 1.85; fs = 0.6;
        ctx.addObs(p[0], p[1], 0.3, 0.3);
      } else if (L.style === 'candles') {
        const p = at(0.8);
        B.add(G_CYL8, 0x6b5a48, [p[0], 0.35, p[1]], [0.3, 0.7, 0.3]);
        PROP.skull(B, p[0] + inw[0] * 0.2, 0.7, p[1] + inw[1] * 0.2, 0.13, 0xe8dcc0, ry);
        for (const [dx, dz, h] of [[0.18, -0.1, 0.4], [-0.16, -0.12, 0.3], [0.05, -0.2, 0.55]]) {
          const q = rot2(p[0], p[1], dx, dz, ry);
          PROP.candle(B, GB, q[0], 0.7, q[1], h);
        }
        fp = rot2(p[0], p[1], 0.0, -0.2, ry); fy = 1.4; fs = 0.55;
        ctx.addObs(p[0], p[1], 0.35, 0.35);
      } else { // brazier
        const p = at(1.15);
        for (let k = 0; k < 3; k++) {
          const a = k / 3 * TAU;
          B.add(G_CYL8, 0x2c2c32, [p[0] + Math.cos(a) * 0.22, 0.42, p[1] + Math.sin(a) * 0.22], [0.045, 0.85, 0.045], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]);
        }
        B.add(cylT(1.5), S.light.bowl || 0x3a3a44, [p[0], 0.95, p[1]], [0.3, 0.32, 0.3]);
        B.add(torus(0.18), shade(S.light.bowl || 0x3a3a44, 0.25), [p[0], 1.1, p[1]], [0.46, 0.46, 0.4], [HPI, 0, 0]);
        GB.add(G_SPH, L.flame, [p[0], 1.1, p[1]], [0.36, 0.08, 0.36], null, false);
        fp = p; fy = 1.3; fs = 1.2;
        ctx.addObs(p[0], p[1], 0.45, 0.45);
      }
      const fg = new T.Group();
      fg.position.set(fp[0], fy, fp[1]);
      const o = new T.Mesh(G_FLAME, outer); o.scale.set(0.2 * fs, 0.55 * fs, 0.2 * fs); o.position.y = 0.2 * fs;
      const i2 = new T.Mesh(G_FLAME, inner); i2.scale.set(0.1 * fs, 0.32 * fs, 0.1 * fs); i2.position.y = 0.12 * fs;
      const h2 = new T.Mesh(G_SPH_LO, halo); h2.scale.setScalar(0.5 * fs); h2.position.y = 0.15 * fs;
      fg.add(o, i2, h2);
      group.add(fg);
      const light = new T.PointLight(L.color, L.intensity || 1.4, L.distance || 13, 1.6);
      light.position.set(fp[0] + inw[0] * 0.35, fy + 0.25, fp[1] + inw[1] * 0.35);
      group.add(light);
      const base = light.intensity, ph = ctx.rnd() * 10;
      ctx.anims.push((dt, t) => {
        const f = 0.84 + 0.09 * Math.sin(t * 11 + ph) + 0.07 * Math.sin(t * 23.7 + ph * 1.7);
        light.intensity = base * f;
        o.scale.y = 0.55 * fs * (0.85 + (f - 0.84) * 2.5);
        o.rotation.z = Math.sin(t * 7 + ph) * 0.08;
        i2.scale.y = 0.32 * fs * (0.9 + (f - 0.84) * 2);
        h2.scale.setScalar(0.5 * fs * (0.9 + (f - 0.84)));
      });
    }
  }

  // ---------- disposition des obstacles ----------
  function buildLayout(ctx) {
    const { layout, rnd, half, S } = ctx;
    if (layout === 'pillars') {
      const pts = [[-6, -5], [6, -5], [-6, 4.5], [6, 4.5]];
      if (rnd() < 0.5) pts.push([-10, -0.5], [10, -0.5]);
      for (const [x, z] of pts) S.pillar(ctx, x, z, 1);
    } else if (layout === 'cross') {
      S.muret(ctx, 7, 0, 2.5, 0.4); S.muret(ctx, -7, 0, 2.5, 0.4);
      S.muret(ctx, 0, -6.25, 0.4, 1.75); S.muret(ctx, 0, 6, 0.4, 1.5);
      for (const [x, z] of [[-8.5, -8], [8.5, 7.5]]) if (ctx.free(x, z, 1.2)) S.cover(ctx, x, z, 0.75);
    } else if (layout === 'boss') {
      for (const [x, z] of [[-10.5, -9.5], [10.5, -9.5], [-10.5, 8.5], [10.5, 8.5]]) S.pillar(ctx, x, z, 0.8);
    } else {
      const n = 4 + Math.floor(rnd() * 3), pts = [];
      let tries = 0;
      while (pts.length < n && tries++ < 400) {
        const x = (rnd() * 2 - 1) * (half - 3.5), z = (rnd() * 2 - 1) * (half - 3.5);
        const s = 0.65 + rnd() * 0.35;
        if (!ctx.free(x, z, s + 0.9)) continue;
        if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 4.2)) continue;
        S.cover(ctx, x, z, s);
        pts.push([x, z]);
      }
    }
  }

  // ---------- dangers au sol ----------
  const flatCircle = r => gk('fcirc' + r.toFixed(2), () => { const g = new T.CircleGeometry(r, 32); g.rotateX(-HPI); return g; });
  const flatRing = (a, b) => gk('fring' + a.toFixed(2) + '_' + b.toFixed(2), () => { const g = new T.RingGeometry(a, b, 40); g.rotateX(-HPI); return g; });

  function hazardVisual(ctx, kind, x, z, r) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    ctx.group.add(g);
    const rnd = ctx.rnd;
    const HB = new Batch();
    const addBatch = (mat, ol) => {
      const b = HB.build(mat || ENV_MAT, ol != null ? ol : 0.03);
      if (!b) return null;
      const holder = new T.Group();
      holder.add(b.mesh); if (b.out) holder.add(b.out);
      ctx.owned.push(b.mesh.geometry, b.out && b.out.geometry);
      g.add(holder);
      return holder;
    };
    const rim = (col, op) => { const m = new T.Mesh(flatRing(r - 0.1, r), basic(col, op == null ? 0.7 : op)); m.position.y = 0.035; m.renderOrder = 1; g.add(m); return m; };
    const disk = (mat, y, s) => { const m = new T.Mesh(flatCircle(r), mat); m.position.y = y; if (s) m.scale.setScalar(s); m.renderOrder = 1; g.add(m); return m; };
    const bubbles = (col, n, maxH) => {
      const list = [];
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(G_SPH_LO, basic(col));
        const a = rnd() * TAU, d = rnd() * r * 0.7;
        m.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d);
        m.userData.ph = rnd();
        g.add(m); list.push(m);
      }
      ctx.anims.push((dt, t) => {
        for (const m of list) {
          const k = (t * 0.6 + m.userData.ph) % 1;
          m.position.y = 0.04 + k * maxH;
          m.scale.setScalar(0.04 + 0.1 * Math.sin(k * PI));
        }
      });
    };
    if (kind === 'lava') {
      lavaTex();
      const lm = new T.MeshBasicMaterial({ map: LAVA_TEX, color: 0xffffff });
      ctx.owned.push(lm);
      disk(lm, 0.03);
      const rimM = new T.Mesh(flatRing(r - 0.05, r + 0.35), toonShared(0x2a1f1d)); rimM.position.y = 0.04; g.add(rimM);
      const halo = new T.Mesh(flatRing(r + 0.3, r + 0.9), basic(0xff5a10, 0.18, true)); halo.position.y = 0.03; g.add(halo);
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + rnd() * 0.4; HB.add(G_DODE, 0x2b2220, [Math.cos(a) * (r + 0.2), 0.12, Math.sin(a) * (r + 0.2)], [0.28, 0.2, 0.25], [rnd(), rnd() * TAU, 0]); }
      addBatch();
      bubbles(0xffd25a, 4, 0.25);
      ctx.anims.push((dt, t) => { lm.color.setScalar(0.85 + 0.15 * Math.sin(t * 2.5 + x)); halo.material.opacity = 0.14 + 0.08 * Math.sin(t * 2.5 + x); });
    } else if (kind === 'spikes') {
      disk(toonShared(0x353a46), 0.025);
      rim(0xff4a3a, 0.65);
      const n = Math.round(r * 6);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rnd() * 0.3, d = (i % 2 ? 0.35 : 0.68) * r;
        HB.add(G_CONE4, 0xcfd6e2, [Math.cos(a) * d, 0.22, Math.sin(a) * d], [0.1, 0.5, 0.1], [0, a, 0]);
      }
      HB.add(G_CONE4, 0xcfd6e2, [0, 0.26, 0], [0.12, 0.58, 0.12]);
      const sp = addBatch();
      const ph = rnd() * 3;
      ctx.anims.push((dt, t) => {
        const k = ((t + ph) % 2.4) / 2.4;
        const up = k < 0.15 ? k / 0.15 : k < 0.55 ? 1 : k < 0.75 ? 1 - (k - 0.55) / 0.2 : 0;
        sp.position.y = -0.38 + 0.38 * smooth(up);
      });
    } else if (kind === 'ronces') {
      disk(toonShared(0x3a2a1c), 0.025);
      rim(0xc0392b, 0.45);
      const vine = 0x4a5a22, thorn = 0xd8c99a;
      const arcG = torus(0.11, PI * 1.25, 10);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + rnd() * 0.5, s = r * (0.35 + rnd() * 0.3);
        HB.add(arcG, i % 2 ? vine : shade(vine, -0.2), [Math.cos(a) * r * 0.35, 0.05, Math.sin(a) * r * 0.35], [s, s * 0.7, s], [-0.2 + rnd() * 0.4, a, 0]);
        for (let k = 0; k < 4; k++) {
          const b = a + (rnd() - 0.5) * 1.6, d = r * (0.2 + rnd() * 0.65);
          HB.add(G_CONE4, thorn, [Math.cos(b) * d, 0.12 + rnd() * 0.35, Math.sin(b) * d], [0.04, 0.16, 0.04], [rnd() - 0.5, rnd() * TAU, rnd() - 0.5], false);
        }
      }
      for (let i = 0; i < 4; i++) { const a = rnd() * TAU, d = rnd() * r * 0.7; HB.add(G_SPH_LO, 0x8e2a5a, [Math.cos(a) * d, 0.2, Math.sin(a) * d], 0.07); }
      const v = addBatch();
      const ph = rnd() * 5;
      ctx.anims.push((dt, t) => { v.rotation.y = Math.sin(t * 0.9 + ph) * 0.06; const s = 1 + Math.sin(t * 3 + ph) * 0.04; v.scale.set(s, 1 + Math.sin(t * 2.2 + ph) * 0.08, s); });
    } else if (kind === 'poison' || kind === 'acid') {
      const col = kind === 'poison' ? 0x63ff3a : 0xc23cff, lite = kind === 'poison' ? 0xc6ff7a : 0xf0a8ff;
      const pm = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false });
      ctx.owned.push(pm);
      disk(toonShared(shade(col, -0.7)), 0.02, 1.08);
      disk(pm, 0.03);
      const inner = disk(basic(lite, 0.55), 0.035, 0.55);
      rim(shade(col, -0.45), 0.9);
      bubbles(lite, 5, 0.3);
      const ph = rnd() * 5;
      ctx.anims.push((dt, t) => { inner.scale.setScalar(0.5 + 0.08 * Math.sin(t * 2 + ph)); pm.opacity = 0.72 + 0.1 * Math.sin(t * 3 + ph); });
    } else { // iceSpikes
      disk(basic(0xdaf6ff, 0.6), 0.025);
      rim(0x6fdcff, 0.85);
      const n = Math.round(r * 5);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rnd() * 0.4, d = (0.3 + rnd() * 0.5) * r, h = 0.45 + rnd() * 0.4, tl = 0.15 + rnd() * 0.25;
        const dir = [Math.cos(a) * Math.sin(tl), Math.cos(tl), Math.sin(a) * Math.sin(tl)];
        HB.add(G_CONE6, i % 2 ? 0x8ff0ff : 0xc8f8ff, [Math.cos(a) * d + dir[0] * h * 0.5, dir[1] * h * 0.5, Math.sin(a) * d + dir[2] * h * 0.5], [0.12, h, 0.12], rotTo(dir[0], dir[1], dir[2]));
      }
      HB.add(G_CONE6, 0xc8f8ff, [0, 0.35, 0], [0.16, 0.7, 0.16]);
      const sp = addBatch(GLOW_VC);
      const ph = rnd() * 5;
      ctx.anims.push((dt, t) => { const s = 0.88 + 0.12 * Math.sin(t * 2.2 + ph); sp.scale.set(1, s, 1); });
    }
    return g;
  }
  function buildHazards(ctx) {
    const { layout, rnd, S, half } = ctx;
    const hz = S.hazard;
    const count = { arena: 1, pillars: 1, cross: 2, boss: 2 }[layout] || 0;
    const fixed = layout === 'boss' ? [[-7.5, -2.5], [7.5, -2.5]] : null;
    for (let i = 0; i < count; i++) {
      const r = hz.r || 1.4;
      let pos = null;
      if (fixed && ctx.free(fixed[i][0], fixed[i][1], r + 0.3)) pos = fixed[i];
      for (let k = 0; !pos && k < 300; k++) {
        const x = (rnd() * 2 - 1) * (half - 4), z = (rnd() * 2 - 1) * (half - 4.5);
        if (fixed && Math.sign(x) !== Math.sign(fixed[i][0])) continue;
        if (ctx.free(x, z, r + 0.8)) pos = [x, z];
      }
      if (!pos) continue;
      ctx.hazards.push({ x: pos[0], z: pos[1], r, dps: hz.dps });
      hazardVisual(ctx, hz.kind, pos[0], pos[1], r);
    }
  }

  // ---------- emplacements en bordure ----------
  function borderSpots(ctx, step, dist) {
    const { half, rnd } = ctx;
    const out = [];
    for (const side of ['N', 'W', 'E', 'S']) {
      for (let u = -half + 2.2; u <= half - 2.2; u += step * (0.8 + rnd() * 0.4)) {
        if (side === 'N' && Math.abs(u) < 4.3) continue;
        if (side === 'N' && Math.abs(Math.abs(u) - 6.5) < 1.3) continue;
        if ((side === 'W' || side === 'E') && Math.abs(u - 2.5) < 1.6) continue;
        if (side === 'S' && Math.abs(u) < 3.2) continue;
        const inw = side === 'N' ? [0, 1] : side === 'S' ? [0, -1] : side === 'W' ? [1, 0] : [-1, 0];
        const face = side === 'N' ? [u, -half] : side === 'S' ? [u, half] : side === 'W' ? [-half, u] : [half, u];
        out.push({ side, u, x: face[0] + inw[0] * dist, z: face[1] + inw[1] * dist, inw, ry: Math.atan2(inw[0], inw[1]) });
      }
    }
    return out;
  }

  // ---------- particules d'ambiance ----------
  function buildParticles(ctx) {
    const P = ctx.S.particles;
    if (!P) return;
    const { half, rnd } = ctx;
    const n = P.count || 50;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    const ymax = P.kind === 'snow' ? 6 : 4.5;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() * 2 - 1) * half; pos[i * 3 + 1] = rnd() * ymax; pos[i * 3 + 2] = (rnd() * 2 - 1) * half;
      seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = pos[i * 3]; seed[i * 4 + 3] = pos[i * 3 + 2];
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const mat = new T.PointsMaterial({ color: P.color, size: P.size || 0.15, map: dotTex(), transparent: true, opacity: P.opacity || 0.85, depthWrite: false, blending: P.additive === false ? T.NormalBlending : T.AdditiveBlending, sizeAttenuation: true });
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    ctx.group.add(pts);
    ctx.owned.push(geo, mat);
    ctx.anims.push((dt, t) => {
      for (let i = 0; i < n; i++) {
        const s0 = seed[i * 4], s1 = seed[i * 4 + 1];
        let y = pos[i * 3 + 1];
        if (P.kind === 'embers') {
          y += dt * (0.5 + s0 * 0.9);
          pos[i * 3] = seed[i * 4 + 2] + Math.sin(t * (0.6 + s1) + s0 * 9) * 0.6;
          pos[i * 3 + 2] = seed[i * 4 + 3] + Math.cos(t * (0.5 + s0) + s1 * 9) * 0.6;
          if (y > ymax) y = 0.1;
        } else if (P.kind === 'snow') {
          y -= dt * (0.35 + s0 * 0.4);
          pos[i * 3] = seed[i * 4 + 2] + Math.sin(t * 0.7 + s1 * 9) * 0.8;
          if (y < 0) y = ymax;
        } else if (P.kind === 'fireflies') {
          pos[i * 3] = seed[i * 4 + 2] + Math.sin(t * (0.3 + s0 * 0.4) + s1 * 9) * 1.5;
          pos[i * 3 + 2] = seed[i * 4 + 3] + Math.cos(t * (0.25 + s1 * 0.4) + s0 * 9) * 1.5;
          y = 0.6 + s0 * 2.2 + Math.sin(t * (0.8 + s1) + s0 * 20) * 0.4;
        } else if (P.kind === 'wisps') {
          y += dt * (0.2 + s0 * 0.3);
          pos[i * 3] = seed[i * 4 + 2] + Math.sin(t * 0.8 + s1 * 9) * 0.4;
          if (y > ymax) y = 0.1;
        } else {
          y += Math.sin(t * 0.5 + s0 * 20) * dt * 0.12;
          pos[i * 3] = seed[i * 4 + 2] + Math.sin(t * 0.15 + s1 * 9) * 1.2;
        }
        pos[i * 3 + 1] = y;
      }
      geo.attributes.position.needsUpdate = true;
      if (P.kind === 'fireflies') mat.opacity = 0.6 + 0.3 * Math.sin(t * 2.3);
    });
  }

  // ---------- points d'apparition + coffre ----------
  function computeSpawns(ctx) {
    const out = [];
    const ps = ctx.playerStart;
    for (const r of [9.5, 7, 11.2, 5.4]) for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU, x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (Math.hypot(x - ps[0], z - ps[1]) < 7) continue;
      if (!ctx.free(x, z, 0.9, { allowCenter: true })) continue;
      if (out.some(p => Math.hypot(p[0] - x, p[1] - z) < 2.2)) continue;
      out.push([+x.toFixed(2), +z.toFixed(2)]);
    }
    if (out.length < 8) {
      for (let gz = -ctx.half + 2; gz <= ctx.half - 2 && out.length < 12; gz += 1.5) for (let gx = -ctx.half + 2; gx <= ctx.half - 2 && out.length < 12; gx += 1.5) {
        if (Math.hypot(gx - ps[0], gz - ps[1]) < 5) continue;
        if (!ctx.free(gx, gz, 0.6, { allowCenter: true, allowDoor: true })) continue;
        if (out.some(p => Math.hypot(p[0] - gx, p[1] - gz) < 1.5)) continue;
        out.push([gx, gz]);
      }
    }
    while (out.length < 8) out.push([(out.length % 2 ? 1 : -1) * 2, -2 - out.length]);
    return out;
  }
  function computeChest(ctx) {
    for (const c of [[0, -2.5], [0, -4], [2.5, -2.5], [-2.5, -2.5], [0, 2], [3, 0], [-3, 0]]) {
      if (ctx.free(c[0], c[1], 0.9, { allowCenter: true })) return c;
    }
    return [0, 0];
  }

  // ---------- assemblage ----------
  const ROOMS = [];
  function sweepRooms() {
    for (let i = ROOMS.length - 1; i >= 0; i--) {
      const r = ROOMS[i];
      if (r._used && !r.group.parent) { r.dispose(); ROOMS.splice(i, 1); }
    }
  }
  // v5 : registre de thèmes/architectures supplémentaires : G.GFX.registerTheme(id, {theme:{...THEMES-like}, build(opts) -> room})
  const EXTRA_THEMES = {};
  function registerTheme(id, def) { EXTRA_THEMES[id] = def; if (def && def.theme) THEMES[id] = def.theme; }
  function buildRoom(themeId, opts) {
    if (EXTRA_THEMES[themeId] && EXTRA_THEMES[themeId].build) {
      try { sweepRooms(); } catch (e) { /* rien */ }
      return EXTRA_THEMES[themeId].build(opts || {});
    }
    opts = opts || {};
    const th = STYLE[themeId] ? themeId : 'crypte';
    const S = STYLE[th];
    const half = opts.half || 14;
    const layout = ['arena', 'pillars', 'cross', 'boss'].indexOf(opts.layout) >= 0 ? opts.layout : 'arena';
    const seed = (typeof opts.seed === 'number' ? Math.floor(opts.seed) : hashStr(opts.seed == null ? th : opts.seed)) >>> 0;
    const rnd = mulberry32(seed ^ hashStr(th + '|' + layout));
    sweepRooms();
    const group = new T.Group();
    group.name = 'room_' + th;
    const ctx = {
      th, S, half, layout, rnd, group, B: new Batch(), GB: new Batch(), obstacles: [], hazards: [], anims: [], owned: [],
      H: S.wallH || 2.2, reserved: [], playerStart: [0, half - 3],
    };
    ctx.addObs = (x, z, hw, hd) => { const o = { x, z, hw, hd }; ctx.obstacles.push(o); return o; };
    ctx.free = (x, z, r, o) => isFree(ctx, x, z, r, o);
    ctx.glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    ctx.owned.push(ctx.glowMat);

    // sol
    const ft = floorTextures(th, seed % 3, half);
    const floorMat = toon(0xffffff, { map: ft.map, emissiveMap: ft.emis || null });
    if (ft.emis) { floorMat.emissive.setHex(0xffffff); floorMat.emissiveIntensity = 1; }
    const fg = new T.PlaneGeometry(half * 2, half * 2); fg.rotateX(-HPI);
    const floor = new T.Mesh(fg, floorMat);
    floor.receiveShadow = true; floor.name = 'floor';
    group.add(floor);
    ctx.owned.push(fg, floorMat);
    const og = new T.PlaneGeometry(half * 2 + 80, half * 2 + 80); og.rotateX(-HPI);
    let omat;
    if (th === 'volcan') { lavaTex(); omat = new T.MeshBasicMaterial({ map: LAVA_SEA, color: 0xe0e0e0 }); }
    else omat = toon(S.outer);
    const outer = new T.Mesh(og, omat);
    outer.position.y = -0.05; outer.receiveShadow = th !== 'volcan';
    group.add(outer);
    ctx.owned.push(og, omat);

    buildWalls(ctx);
    const door = buildDoor(ctx);
    buildLights(ctx);
    buildLayout(ctx);
    buildHazards(ctx);
    if (S.decor) S.decor(ctx);
    if (S.outside) S.outside(ctx);
    buildParticles(ctx);

    const sb = ctx.B.build(ENV_MAT, 0.045);
    if (sb) {
      sb.mesh.castShadow = true; sb.mesh.receiveShadow = true; sb.mesh.name = 'decor';
      group.add(sb.mesh); if (sb.out) group.add(sb.out);
      ctx.owned.push(sb.mesh.geometry, sb.out && sb.out.geometry);
    }
    const gb = ctx.GB.build(ctx.glowMat, 0.035);
    if (gb) {
      gb.mesh.name = 'glow';
      group.add(gb.mesh); if (gb.out) group.add(gb.out);
      ctx.owned.push(gb.mesh.geometry, gb.out && gb.out.geometry);
    }
    if (S.pulse) {
      const pz = S.pulse;
      ctx.anims.push((dt, t) => {
        const k = 1 - pz.amp + pz.amp * (0.5 + 0.5 * Math.sin(t * pz.speed));
        ctx.glowMat.color.setScalar(k);
        if (ft.emis) floorMat.emissiveIntensity = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(t * pz.speed * 0.8));
      });
    }
    if (th === 'volcan') ctx.anims.push((dt, t) => { if (LAVA_SEA) { LAVA_SEA.offset.x = t * 0.012; LAVA_SEA.offset.y = Math.sin(t * 0.1) * 0.05; } if (LAVA_TEX) LAVA_TEX.offset.set(t * 0.03, t * 0.017); });
    else ctx.anims.push((dt, t) => { if (LAVA_TEX) LAVA_TEX.offset.set(t * 0.03, t * 0.017); });

    const spawnPoints = computeSpawns(ctx);
    const chestPos = computeChest(ctx);
    let tAcc = 0, disposed = false;
    const room = {
      group,
      obstacles: ctx.obstacles,
      door: { obstacle: door.obstacle },
      setDoorOpen: open => door.setOpen(!!open),
      hazards: ctx.hazards,
      spawnPoints,
      playerStart: ctx.playerStart.slice(),
      chestPos,
      theme: th, layout, half, seed,
      update(dt, time) {
        room._used = true;
        dt = Math.min(Math.max(+dt || 0, 0), 0.1);
        tAcc += dt;
        const t = (time != null && isFinite(time)) ? +time : tAcc;
        for (let i = 0; i < ctx.anims.length; i++) ctx.anims[i](dt, t);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (group.parent) group.parent.remove(group);
        for (const o of ctx.owned) if (o && o.dispose) o.dispose();
        ctx.owned.length = 0;
      },
    };
    ROOMS.push(room);
    return room;
  }

  // ==================================================================
  // THÈMES (palette + peinture du sol + décor)
  // ==================================================================
  function genericMuret(ctx, x, z, hw, hd, c, top, h) {
    h = h || 1.0;
    const along = hw >= hd, L = 2 * (along ? hw : hd), D = 2 * (along ? hd : hw);
    let u = -L / 2;
    while (u < L / 2 - 0.05) {
      let len = Math.min(L / 2 - u, 0.9 + ctx.rnd() * 0.7);
      if (L / 2 - u - len < 0.3) len = L / 2 - u;
      const cx = along ? x + u + len / 2 : x, cz = along ? z : z + u + len / 2;
      ctx.B.add(G_BOX, jitterColor(c, ctx.rnd, 0.07), [cx, h / 2, cz], along ? [len - 0.05, h, D] : [D, h, len - 0.05]);
      u += len;
    }
    ctx.B.add(G_BOX, top, [x, h + 0.07, z], [2 * hw + 0.1, 0.14, 2 * hd + 0.1]);
    ctx.addObs(x, z, hw, hd);
  }
  function outsideSpots(ctx, n, d0, d1, allowSouth) {
    const { half, rnd } = ctx, out = [];
    for (let i = 0; i < n * 4 && out.length < n; i++) {
      const sides = allowSouth ? ['N', 'W', 'E', 'N', 'S'] : ['N', 'W', 'E', 'N'];
      const side = sides[Math.floor(rnd() * sides.length)];
      const d = half + d0 + rnd() * (d1 - d0), u = (rnd() * 2 - 1) * (half + d1);
      let x, z;
      if (side === 'N') { x = u; z = -d; if (Math.abs(x) < 4.5) continue; }
      else if (side === 'S') { x = u; z = d; }
      else if (side === 'W') { x = -d; z = u; }
      else { x = d; z = u; }
      if (side !== 'S' && z > half + 1) continue;
      out.push({ x, z, side });
    }
    return out;
  }
  function cobwebs(ctx) {
    const { half, group } = ctx;
    const g = gk('webTri', () => {
      const s = new T.Shape(); s.moveTo(0, 0); s.lineTo(1, 0); s.lineTo(0, 1); s.lineTo(0, 0);
      const ge = new T.ShapeGeometry(s); ge.rotateX(-HPI); return ge;
    });
    const mat = basic(0xffffff, 0.55, false, T.DoubleSide);
    mat.map = webTex();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (sz > 0) continue;
      const m = new T.Mesh(g, mat);
      m.position.set(sx * half, ctx.H - 0.05, sz * half);
      m.scale.set(-sx * 1.9, 1, sz * 1.9);
      m.renderOrder = 2;
      group.add(m);
    }
  }
  function floatingThing(ctx, buildFn, positions, amp, spin) {
    const FB = new Batch();
    buildFn(FB);
    const b = FB.build(ENV_MAT, 0.04);
    if (!b) return;
    ctx.owned.push(b.mesh.geometry, b.out && b.out.geometry);
    const list = [];
    for (const p of positions) {
      const g = new T.Group();
      g.position.set(p[0], p[1], p[2]);
      g.add(new T.Mesh(b.mesh.geometry, ENV_MAT));
      if (b.out) { const o = new T.Mesh(b.out.geometry, outlineMat(0)); o.userData.isOutline = true; g.add(o); }
      g.children[0].castShadow = true;
      g.userData.y0 = p[1]; g.userData.ph = ctx.rnd() * TAU;
      if (p[3]) g.scale.setScalar(p[3]);
      ctx.group.add(g);
      list.push(g);
    }
    ctx.anims.push((dt, t) => {
      for (const g of list) {
        g.position.y = g.userData.y0 + Math.sin(t * 1.1 + g.userData.ph) * amp;
        g.rotation.y = t * spin + g.userData.ph;
      }
    });
  }

  const STYLE = {
    // ---------------------------------------------------------------
    crypte: {
      wallH: 1.85, southH: 1.0,
      wall: { color: 0x66738c, top: 0x7b88a1, base: 0x434b5e, pilaster: 0x56627a, rows: 3, blockLen: 1.6, jit: 0.07 },
      door: { frame: 0x56627a, key: 0x9fd0ff, wood: 0x6b4a2e, band: 0x3b4150 },
      outer: 0x161b27, corridor: 0x2c3242,
      light: { style: 'torch', flame: 0xff9a3a, color: 0xffa050, intensity: 1.5 },
      hazard: { kind: 'spikes', dps: 6, r: 1.3 },
      particles: { kind: 'dust', color: 0xbfd6ff, count: 45, size: 0.12, opacity: 0.6 },
      paintFloor(x, N, ppu, rnd) {
        x.fillStyle = '#1f2330'; x.fillRect(0, 0, N, N);
        const tiles = drawTiles(x, N, 14, 0.05, rnd, () => css(jitterColor(0x5b6883, rnd, 0.1)), '#1b1f2b', 4, 3);
        for (const t of tiles) {
          if (rnd() < 0.28) crack(x, t.x + (rnd() - 0.5) * t.s * 0.4, t.y + (rnd() - 0.5) * t.s * 0.4, t.s * 0.55, rnd, 'rgba(18,22,32,0.85)', 2.2);
          if (rnd() < 0.14) blob(x, t.x + (rnd() - 0.5) * t.s, t.y + (rnd() - 0.5) * t.s, t.s * 0.35, 'rgba(90,150,130,0.28)');
          if (rnd() < 0.05) {
            x.strokeStyle = 'rgba(30,35,50,0.6)'; x.lineWidth = 5; x.beginPath();
            x.moveTo(t.x, t.y - t.s * 0.28); x.lineTo(t.x, t.y + t.s * 0.28); x.moveTo(t.x - t.s * 0.16, t.y - t.s * 0.1); x.lineTo(t.x + t.s * 0.16, t.y - t.s * 0.1); x.stroke();
          }
        }
        centerMotif(x, N, ppu, 0x9fd0ff, 0.16);
      },
      wallTop(ctx, side, u0, u1, H) {
        if (side === 'S') return;
        for (let u = u0 + 0.4; u < u1 - 0.3; u += 1.3) wallPiece(ctx, side, u, -0.05, H + 0.2, 0.72, 0.4, 0.9, jitterColor(ctx.S.wall.top, ctx.rnd, 0.06));
      },
      cover(ctx, x, z, s) {
        const r = ctx.rnd(), B = ctx.B;
        if (r < 0.4) { PROP.crate(B, x, z, s * 0.75, ctx.rnd() * 0.5, 0x8a6440); ctx.addObs(x, z, s * 0.85, s * 0.85); }
        else if (r < 0.7) {
          B.add(G_BOX, 0x4f5870, [x, 0.15, z], [1.3, 0.3, 1.3]);
          B.add(G_CYL8, 0x6f7a92, [x, 0.75, z], [0.45, 1.0, 0.45]);
          B.add(G_CONE4, 0x6f7a92, [x + 0.1, 1.35, z], [0.4, 0.4, 0.4], [0.3, 0.6, 0.2]);
          B.add(G_CYL8, 0x6f7a92, [x + 0.9, 0.3, z + 0.4], [0.35, 0.8, 0.35], [HPI, 0.7, 0]);
          ctx.addObs(x, z, 0.7, 0.7);
        } else {
          const ry = ctx.rnd() < 0.5 ? 0 : HPI;
          PROP.sarcophagus(B, x, z, ry, 0x6f7a92, 0x8994ad, 0x4b5468);
          ctx.addObs(x, z, ry ? 1.07 : 0.57, ry ? 0.57 : 1.07);
        }
      },
      pillar(ctx, x, z, k) {
        PROP.column(ctx.B, x, z, 3.3 * k, 0.5 * k, 0x6f7a92, 0x56627a);
        ctx.GB.add(torus(0.15), 0x7fd0ff, [x, 1.6 * k, z], [0.52 * k, 0.52 * k, 0.4 * k], [HPI, 0, 0], false);
        ctx.addObs(x, z, 0.65 * k, 0.65 * k);
      },
      muret(ctx, x, z, hw, hd) { genericMuret(ctx, x, z, hw, hd, 0x66738c, 0x7b88a1); },
      decor(ctx) {
        const { B, GB, rnd, half } = ctx;
        for (const sp of borderSpots(ctx, 2.6, 0.78)) {
          const r = rnd();
          if (r < 0.22) {
            const along = sp.side === 'N' || sp.side === 'S' ? HPI : 0;
            const x = sp.x + sp.inw[0] * 0.05, z = sp.z + sp.inw[1] * 0.05;
            PROP.sarcophagus(B, x, z, along, 0x667189, 0x7f8aa3, 0x454e62);
            ctx.addObs(x, z, along ? 1.07 : 0.57, along ? 0.57 : 1.07);
          } else if (r < 0.42) PROP.urn(B, sp.x, sp.z, 0.9 + rnd() * 0.4, 0x7a6a8a, rnd);
          else if (r < 0.62) { for (let i = 0; i < 3; i++) PROP.candle(B, GB, sp.x + (rnd() - 0.5) * 0.6, 0, sp.z + (rnd() - 0.5) * 0.6, 0.2 + rnd() * 0.35); }
          else if (r < 0.8) { PROP.skull(B, sp.x, 0, sp.z, 0.16, 0xe8e2cc, sp.ry); PROP.bones(B, sp.x + 0.3, sp.z + 0.2, 3, rnd, 0xe8e2cc); }
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = sx * (half - 0.9), z = sz * (half - 0.9);
          PROP.skull(B, x, 0, z, 0.2, 0xe8e2cc, Math.atan2(-sx, -sz));
          PROP.skull(B, x - sx * 0.35, 0, z + 0.1, 0.16, 0xe8e2cc, Math.atan2(-sx, -sz) + 0.4);
          PROP.bones(B, x, z - sz * 0.4, 4, rnd, 0xe8e2cc);
          PROP.candle(B, GB, x - sx * 0.1, 0, z - sz * 0.45, 0.45);
        }
        cobwebs(ctx);
      },
      outside(ctx) {
        const { B, rnd } = ctx;
        for (const p of outsideSpots(ctx, 18, 1.8, 7, false)) {
          const w = 1.6 + rnd() * 2.4, h = 2.5 + rnd() * 3.5, d = 1.6 + rnd() * 2;
          B.add(G_BOX, jitterColor(0x2c3345, rnd, 0.1), [p.x, h / 2, p.z], [w, h, d], [0, rnd() * 0.4, 0]);
          if (rnd() < 0.6) B.add(G_CONE4, 0x232838, [p.x, h + 0.7, p.z], [Math.min(w, d) * 0.7, 1.4, Math.min(w, d) * 0.7], [0, PI / 4, 0]);
          else B.add(G_CONE6, 0x232838, [p.x, h + 1.2, p.z], [0.35, 2.4, 0.35]);
        }
      },
    },
    // ---------------------------------------------------------------
    foret: {
      wallH: 1.1, southH: 0.9,
      wall: { color: 0x7d8a70, top: 0x6e8a5a, base: 0x4f5a45, pilaster: 0, rows: 2, blockLen: 1.3, jit: 0.08 },
      door: { frame: 0x6a7560, key: 0x8fe86a, wood: 0x7a5232, band: 0x3b3a30 },
      outer: 0x1d3818, corridor: 0x3a3226,
      light: { style: 'lantern', flame: 0xffc050, color: 0xffd27a, intensity: 1.4 },
      hazard: { kind: 'ronces', dps: 8, r: 1.4 },
      particles: { kind: 'fireflies', color: 0xd8ff6a, count: 40, size: 0.17 },
      paintFloor(x, N, ppu, rnd) {
        x.fillStyle = '#4c9338'; x.fillRect(0, 0, N, N);
        for (let i = 0; i < 380; i++) blob(x, rnd() * N, rnd() * N, 10 + rnd() * 45, rnd() < 0.5 ? 'rgba(120,195,85,0.28)' : 'rgba(35,95,38,0.3)');
        // sentier sud → nord
        const c = N / 2;
        for (let y = N; y > -10; y -= 6) {
          const px = c + Math.sin(y / N * 7) * ppu * 1.2;
          blob(x, px, y, ppu * (1.4 + rnd() * 0.3), 'rgba(140,108,66,0.55)');
        }
        x.fillStyle = 'rgba(140,108,66,0.5)'; x.beginPath(); x.arc(c, c, ppu * 3.4, 0, TAU); x.fill();
        for (let y = N - ppu * 0.8; y > 0; y -= ppu * 1.35) {
          if (Math.abs(y - c) < ppu * 3) continue;
          const px = c + Math.sin(y / N * 7) * ppu * 1.2 + (rnd() - 0.5) * ppu * 0.5;
          x.beginPath();
          for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = ppu * (0.45 + rnd() * 0.15); x.lineTo(px + Math.cos(a) * rr * 1.2, y + Math.sin(a) * rr); }
          x.closePath(); x.fillStyle = css(jitterColor(0x8f978a, rnd, 0.1)); x.fill(); x.lineWidth = 3; x.strokeStyle = '#4a4f44'; x.stroke();
        }
        for (let i = 0; i < 2600; i++) {
          const px = rnd() * N, py = rnd() * N, l = 4 + rnd() * 7, a = -HPI + (rnd() - 0.5) * 0.8;
          x.strokeStyle = rnd() < 0.5 ? 'rgba(150,215,100,0.55)' : 'rgba(30,85,30,0.5)'; x.lineWidth = 2;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
        }
        for (let i = 0; i < 90; i++) {
          const px = rnd() * N, py = rnd() * N;
          x.fillStyle = ['#ffffff', '#ffe35a', '#ff8ad8', '#9ad8ff'][Math.floor(rnd() * 4)];
          x.beginPath(); x.arc(px, py, 3 + rnd() * 2, 0, TAU); x.fill();
          x.fillStyle = '#ffcf3a'; x.beginPath(); x.arc(px, py, 1.4, 0, TAU); x.fill();
        }
        centerMotif(x, N, ppu, 0xe8ffb0, 0.12);
      },
      wallTop(ctx, side, u0, u1, H) {
        if (side === 'S') return;
        const greens = [0x3f8f3a, 0x4fa645, 0x367a33, 0x5cb04a];
        for (let u = u0 + 0.3; u < u1; u += 0.75 + ctx.rnd() * 0.2) {
          const r = 0.5 + ctx.rnd() * 0.25;
          const p = sidePlace(ctx, side, u, (ctx.rnd() - 0.5) * 0.3, 1, 1);
          ctx.B.add(G_SPH, greens[Math.floor(ctx.rnd() * 4)], [p[0], H + r * 0.55, p[1]], [r, r * 0.9, r], [0, ctx.rnd() * TAU, 0]);
          if (ctx.rnd() < 0.15) ctx.B.add(G_SPH_LO, ctx.rnd() < 0.5 ? 0xff8ad8 : 0xfff07a, [p[0], H + r * 1.35, p[1]], 0.09, null, false);
        }
      },
      cover(ctx, x, z, s) {
        const B = ctx.B, rnd = ctx.rnd;
        if (rnd() < 0.55) {
          PROP.rock(B, x, z, s * 1.1, 0x7d8478, rnd);
          B.add(G_SPH, 0x5aa845, [x, s * 0.82, z], [s * 0.75, s * 0.18, s * 0.65]);
          ctx.addObs(x, z, s * 0.95, s * 0.85);
        } else {
          const along = rnd() < 0.5;
          B.add(G_CYL8, 0x7a5030, [x, 0.42, z], [0.42, 2.2, 0.42], along ? [0, 0, HPI] : [HPI, 0, 0]);
          for (const e of [-1, 1]) B.add(G_CYL8, 0xc8a06a, along ? [x + e * 1.1, 0.42, z] : [x, 0.42, z + e * 1.1], [0.36, 0.04, 0.36], along ? [0, 0, HPI] : [HPI, 0, 0], false);
          B.add(G_SPH, 0x5aa845, along ? [x + 0.3, 0.82, z] : [x, 0.82, z - 0.3], [0.4, 0.12, 0.35]);
          ctx.addObs(x, z, along ? 1.15 : 0.45, along ? 0.45 : 1.15);
        }
      },
      pillar(ctx, x, z, k) {
        PROP.column(ctx.B, x, z, 3.0 * k, 0.5 * k, 0x8a9580, 0x6e7a62);
        for (let i = 0; i < 9; i++) {
          const a = i * 1.3, y = 0.4 + i * 0.3 * k;
          ctx.B.add(G_SPH_LO, i % 2 ? 0x3f8f3a : 0x5cb04a, [x + Math.cos(a) * 0.5 * k, y, z + Math.sin(a) * 0.5 * k], [0.18, 0.14, 0.18]);
        }
        ctx.B.add(G_SPH, 0x4fa645, [x, 3.0 * k + 0.05, z], [0.7 * k, 0.25, 0.7 * k]);
        ctx.addObs(x, z, 0.65 * k, 0.65 * k);
      },
      muret(ctx, x, z, hw, hd) {
        genericMuret(ctx, x, z, hw, hd, 0x7d8a70, 0x6e8a5a, 0.7);
        const along = hw >= hd, L = 2 * (along ? hw : hd);
        for (let u = -L / 2 + 0.35; u < L / 2; u += 0.7) ctx.B.add(G_SPH, ctx.rnd() < 0.5 ? 0x3f8f3a : 0x4fa645, along ? [x + u, 0.95, z] : [x, 0.95, z + u], [0.42, 0.36, 0.42]);
      },
      decor(ctx) {
        const { B, GB, rnd, half } = ctx;
        const caps = [0x7dffd8, 0xc6ff6a, 0xff7ad8, 0x7ab8ff];
        for (const sp of borderSpots(ctx, 2.0, 0.8)) {
          const r = rnd();
          if (r < 0.38) PROP.bush(B, sp.x, sp.z, 0.8 + rnd() * 0.5, rnd() < 0.5 ? 0x3f8f3a : 0x4c9a3e, rnd);
          else if (r < 0.66) { const c = caps[Math.floor(rnd() * caps.length)]; for (let i = 0; i < 3; i++) PROP.mushroom(B, GB, sp.x + (rnd() - 0.5) * 0.8, sp.z + (rnd() - 0.5) * 0.8, 0.7 + rnd() * 0.8, c, rnd); }
          else if (r < 0.76) { B.add(G_CYL8, 0x7a5030, [sp.x, 0.25, sp.z], [0.38, 0.5, 0.38]); B.add(G_CYL8, 0xc8a06a, [sp.x, 0.51, sp.z], [0.34, 0.03, 0.34], null, false); ctx.addObs(sp.x, sp.z, 0.38, 0.38); }
          else if (r < 0.9) { for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + rnd(); B.add(G_CONE, 0x5cb04a, [sp.x + Math.cos(a) * 0.25, 0.3, sp.z + Math.sin(a) * 0.25], [0.12, 0.6, 0.05], [Math.sin(a) * 0.6, a, -Math.cos(a) * 0.6]); } }
          else PROP.rock(B, sp.x, sp.z, 0.45, 0x7d8478, rnd);
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = sx * (half - 1.1), z = sz * (half - 1.1);
          PROP.roundTree(B, x, z, 0.85, 0x3f8f3a, 0x2f7a30, rnd);
          ctx.addObs(x, z, 0.4, 0.4);
          PROP.mushroom(B, GB, x - sx * 0.9, z - sz * 0.3, 1.3, caps[0], rnd);
          PROP.mushroom(B, GB, x - sx * 0.3, z - sz * 0.9, 1.0, caps[2], rnd);
        }
      },
      outside(ctx) {
        const { B, rnd } = ctx;
        for (const p of outsideSpots(ctx, 46, 1.4, 8, true)) {
          if (p.side === 'S') { PROP.bush(B, p.x, p.z, 1 + rnd() * 0.6, 0x2f6f2c, rnd); continue; }
          const s = 1.1 + rnd() * 0.9;
          if (rnd() < 0.6) PROP.pine(B, p.x, p.z, s, rnd() < 0.5 ? 0x2f7a3a : 0x24663a, 0x3a8f45);
          else PROP.roundTree(B, p.x, p.z, s, 0x3f8f3a, 0x2f7a30, rnd);
        }
      },
    },
    // ---------------------------------------------------------------
    catacombes: {
      wallH: 2.2, southH: 1.1,
      wall: { color: 0xa8885e, top: 0xbf9f72, base: 0x6e5537, pilaster: 0x8f7350, rows: 4, blockLen: 1.0, jit: 0.08 },
      door: { frame: 0x8f7350, key: 0xffe0a0, wood: 0x5a3a22, band: 0x3a3028 },
      outer: 0x2a1e14, corridor: 0x4a3a28,
      light: { style: 'candles', flame: 0xffb040, color: 0xffc46a, intensity: 1.45 },
      hazard: { kind: 'poison', dps: 8, r: 1.35 },
      particles: { kind: 'dust', color: 0xffe0b0, count: 45, size: 0.1, opacity: 0.5 },
      paintFloor(x, N, ppu, rnd) {
        x.fillStyle = '#4f3c28'; x.fillRect(0, 0, N, N);
        const rowH = ppu * 1.0, bw = ppu * 2.0;
        for (let r = 0; r * rowH < N; r++) {
          const off = (r % 2) * bw / 2;
          for (let c = -1; c * bw < N; c++) {
            const x0 = c * bw + off, y0 = r * rowH;
            x.fillStyle = css(jitterColor(0xb0946a, rnd, 0.1)); x.fillRect(x0 + 2, y0 + 2, bw - 4, rowH - 4);
            x.fillStyle = 'rgba(255,240,210,0.16)'; x.fillRect(x0 + 2, y0 + 2, bw - 4, 4);
            x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(x0 + 2, y0 + rowH - 6, bw - 4, 4);
            if (rnd() < 0.1) crack(x, x0 + bw * rnd(), y0 + rowH * 0.5, bw * 0.4, rnd, 'rgba(60,40,20,0.7)', 2);
          }
        }
        for (let i = 0; i < 50; i++) blob(x, rnd() * N, rnd() * N, 20 + rnd() * 50, 'rgba(40,25,10,0.3)');
        for (let i = 0; i < 70; i++) {
          const px = rnd() * N, py = rnd() * N, a = rnd() * TAU, l = 8 + rnd() * 10;
          x.strokeStyle = '#efe6cf'; x.lineWidth = 4; x.lineCap = 'round';
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
          x.fillStyle = '#efe6cf';
          for (const e of [0, 1]) { x.beginPath(); x.arc(px + Math.cos(a) * l * e, py + Math.sin(a) * l * e, 3.5, 0, TAU); x.fill(); }
        }
        centerMotif(x, N, ppu, 0x3a2414, 0.35);
      },
      wallTop(ctx, side, u0, u1, H) {
        const { rnd } = ctx;
        wallPiece(ctx, side, (u0 + u1) / 2, 0, H + 0.07, u1 - u0, 0.14, 1.12, 0xc4a57a);
        if (side === 'S') return;
        for (let u = u0 + 1.3; u < u1 - 0.8; u += 2.4) {
          if (side === 'N' && Math.abs(Math.abs(u) - 6.5) < 1.2) continue;
          if ((side === 'W' || side === 'E') && Math.abs(u - 2.5) < 1.6) continue;
          wallPiece(ctx, side, u, 0.5, 1.15, 1.0, 0.62, 0.04, 0x1e140c, null, null, null, false);
          const inwRy = side === 'N' ? 0 : side === 'S' ? PI : side === 'W' ? HPI : -HPI;
          for (const du of [-0.28, 0.02, 0.3]) {
            if (rnd() < 0.2) continue;
            const p = sidePlace(ctx, side, u + du, 0.56, 1, 1);
            PROP.skull(ctx.B, p[0], 0.86, p[1], 0.11, 0xefe6cf, inwRy + (rnd() - 0.5) * 0.4);
          }
          const q = sidePlace(ctx, side, u, 0.55, 1, 1);
          ctx.B.add(G_BOX, 0x8f7350, [q[0], 0.84, q[1]], side === 'N' || side === 'S' ? [1.05, 0.06, 0.14] : [0.14, 0.06, 1.05]);
        }
      },
      cover(ctx, x, z, s) {
        const B = ctx.B, rnd = ctx.rnd;
        if (rnd() < 0.5) { const ry = rnd() < 0.5 ? 0 : HPI; PROP.coffin(B, x, z, ry, 0x6b4426, 0xd8b04a); ctx.addObs(x, z, ry ? 1.0 : 0.5, ry ? 0.5 : 1.0); }
        else {
          for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; PROP.skull(B, x + Math.cos(a) * 0.45, 0, z + Math.sin(a) * 0.45, 0.2, 0xe8dcc0, -a + HPI); }
          for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; PROP.skull(B, x + Math.cos(a) * 0.22, 0.36, z + Math.sin(a) * 0.22, 0.19, 0xe8dcc0, -a + HPI); }
          PROP.skull(B, x, 0.7, z, 0.2, 0xefe6cf, 0);
          PROP.bones(B, x, z, 5, rnd, 0xe8dcc0);
          ctx.addObs(x, z, 0.7, 0.7);
        }
      },
      pillar(ctx, x, z, k) {
        PROP.column(ctx.B, x, z, 3.2 * k, 0.5 * k, 0xa8885e, 0x8f7350);
        for (const y of [1.0, 1.75, 2.5]) for (let i = 0; i < 4; i++) {
          const a = i / 4 * TAU + y;
          PROP.skull(ctx.B, x + Math.sin(a) * 0.47 * k, y * k - 0.13, z + Math.cos(a) * 0.47 * k, 0.13, 0xefe6cf, a);
        }
        ctx.addObs(x, z, 0.65 * k, 0.65 * k);
      },
      muret(ctx, x, z, hw, hd) { genericMuret(ctx, x, z, hw, hd, 0xa8885e, 0xc4a57a); },
      decor(ctx) {
        const { B, GB, rnd, half } = ctx;
        for (const sp of borderSpots(ctx, 2.4, 0.55)) {
          const r = rnd();
          if (r < 0.22) {
            const x = sp.x, z = sp.z;
            B.add(G_BOX, 0x6b4426, [x, 0.95, z], [0.85, 1.9, 0.42], [0, sp.ry, 0]);
            const f = rot2(x, z, 0, 0.22, sp.ry);
            B.add(G_BOX, 0xd8b04a, [f[0], 1.2, f[1]], [0.08, 0.8, 0.04], [0, sp.ry, 0], false);
            B.add(G_BOX, 0xd8b04a, [f[0], 1.35, f[1]], [0.4, 0.08, 0.04], [0, sp.ry, 0], false);
            ctx.addObs(x, z, sp.side === 'N' || sp.side === 'S' ? 0.45 : 0.25, sp.side === 'N' || sp.side === 'S' ? 0.25 : 0.45);
          } else if (r < 0.48) PROP.bones(B, sp.x, sp.z, 4 + Math.floor(rnd() * 3), rnd, 0xe8dcc0);
          else if (r < 0.74) { for (let i = 0; i < 4; i++) PROP.candle(B, GB, sp.x + (rnd() - 0.5) * 0.7, 0, sp.z + (rnd() - 0.5) * 0.7, 0.15 + rnd() * 0.45); }
          else if (r < 0.86) PROP.urn(B, sp.x, sp.z, 1.0, 0x8a5a3a, rnd);
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = sx * (half - 1.0), z = sz * (half - 1.0);
          for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; PROP.skull(B, x + Math.cos(a) * 0.4, 0, z + Math.sin(a) * 0.4, 0.18, 0xe8dcc0, -a + HPI); }
          PROP.skull(B, x, 0.32, z, 0.2, 0xefe6cf, Math.atan2(-sx, -sz));
          PROP.bones(B, x, z, 4, rnd, 0xe8dcc0);
          ctx.addObs(x, z, 0.6, 0.6);
        }
      },
      outside(ctx) {
        const { B, rnd } = ctx;
        for (const p of outsideSpots(ctx, 20, 1.5, 7, false)) {
          const s = 1.2 + rnd() * 1.8;
          B.add(G_DODE, jitterColor(0x4a3826, rnd, 0.12), [p.x, s * 0.5, p.z], [s, s * (0.9 + rnd() * 0.8), s], [rnd(), rnd() * TAU, 0]);
        }
      },
    },
    // ---------------------------------------------------------------
    glace: {
      wallH: 2.0, southH: 1.0,
      wall: { color: 0x9fd4ef, top: 0xc8ecfb, base: 0x6ea8cf, pilaster: 0xb5e2f7, rows: 2, blockLen: 1.8, jit: 0.06 },
      door: { frame: 0x8fc4e4, key: 0x7fe8ff, wood: 0x5a7fa8, band: 0x2e4a6a },
      outer: 0xcfe6f2, corridor: 0x6f93b0,
      light: { style: 'brazier', flame: 0x7fe8ff, color: 0x8fd8ff, intensity: 1.35, bowl: 0x4a6a8a },
      hazard: { kind: 'iceSpikes', dps: 10, r: 1.35 },
      particles: { kind: 'snow', color: 0xffffff, count: 70, size: 0.13, opacity: 0.9, additive: false },
      paintFloor(x, N, ppu, rnd) {
        x.fillStyle = '#7fb0d0'; x.fillRect(0, 0, N, N);
        const tiles = drawTiles(x, N, 10, 0.12, rnd, () => css(jitterColor(0xb4e0f5, rnd, 0.06)), 'rgba(100,160,205,0.95)', 3, 4);
        for (const t of tiles) if (rnd() < 0.2) crack(x, t.x, t.y, t.s * 0.5, rnd, 'rgba(240,252,255,0.85)', 2);
        x.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
          const px = rnd() * N, py = rnd() * N, l = 20 + rnd() * 80;
          x.strokeStyle = 'rgba(255,255,255,' + (0.2 + rnd() * 0.3) + ')'; x.lineWidth = 2 + rnd() * 6;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + l * 0.7, py - l * 0.7); x.stroke();
        }
        for (let i = 0; i < 45; i++) {
          let px = rnd() * N, py = rnd() * N;
          if (rnd() < 0.7) { if (rnd() < 0.5) px = rnd() < 0.5 ? rnd() * ppu * 3 : N - rnd() * ppu * 3; else py = rnd() < 0.5 ? rnd() * ppu * 3 : N - rnd() * ppu * 3; }
          blob(x, px, py, 20 + rnd() * 60, 'rgba(255,255,255,0.6)');
        }
        centerMotif(x, N, ppu, 0xffffff, 0.25);
      },
      wallTop(ctx, side, u0, u1, H) {
        const { rnd } = ctx;
        wallPiece(ctx, side, (u0 + u1) / 2, 0, H + 0.1, u1 - u0, 0.2, 1.15, 0xf4fbff);
        for (let u = u0 + 0.4; u < u1; u += 0.9 + rnd() * 0.6) {
          const p = sidePlace(ctx, side, u, (rnd() - 0.5) * 0.4, 1, 1);
          ctx.B.add(G_SPH, 0xf4fbff, [p[0], H + 0.2, p[1]], [0.4 + rnd() * 0.3, 0.16, 0.45]);
        }
        if (side === 'S') return;
        for (let u = u0 + 0.25; u < u1; u += 0.45) {
          if (rnd() < 0.4) continue;
          const h = 0.25 + rnd() * 0.45;
          const p = sidePlace(ctx, side, u, 0.55, 1, 1);
          ctx.B.add(G_CONE6, 0xc8f4ff, [p[0], H - h / 2, p[1]], [0.07 + rnd() * 0.05, h, 0.07 + rnd() * 0.05], [PI, 0, 0]);
        }
      },
      cover(ctx, x, z, s) {
        const B = ctx.B, rnd = ctx.rnd;
        if (rnd() < 0.55) {
          B.add(G_BOX, 0xa8dcf5, [x, s * 0.8, z], [s * 1.6, s * 1.6, s * 1.6], [0, rnd() * 0.6, 0]);
          B.add(G_BOX, 0xf4fbff, [x, s * 1.65, z], [s * 1.7, 0.16, s * 1.7], [0, rnd() * 0.6, 0]);
          ctx.GB.add(G_OCTA, 0xdffaff, [x, s * 0.8, z + s * 0.81], [0.12, 0.2, 0.02], null, false);
          ctx.addObs(x, z, s * 0.95, s * 0.95);
        } else {
          PROP.rock(B, x, z, s * 1.1, 0xbfe4f5, rnd);
          PROP.crystal(ctx.GB, x + 0.3, z - 0.2, 0.7, 0x7fe8ff, rnd, s * 0.4);
          ctx.addObs(x, z, s * 0.95, s * 0.85);
        }
      },
      pillar(ctx, x, z, k) {
        ctx.B.add(G_CYL6, 0xa8dcf5, [x, 1.6 * k, z], [0.55 * k, 3.2 * k, 0.55 * k]);
        ctx.B.add(G_CYL6, 0xf4fbff, [x, 3.25 * k, z], [0.62 * k, 0.16, 0.62 * k]);
        ctx.B.add(G_CYL6, 0x8fc4e4, [x, 0.15, z], [0.68 * k, 0.3, 0.68 * k]);
        PROP.crystal(ctx.GB, x + 0.55 * k, z + 0.2, 0.6, 0x7fe8ff, ctx.rnd);
        ctx.addObs(x, z, 0.65 * k, 0.65 * k);
      },
      muret(ctx, x, z, hw, hd) { genericMuret(ctx, x, z, hw, hd, 0x9fd4ef, 0xf4fbff); },
      decor(ctx) {
        const { B, GB, rnd, half } = ctx;
        for (const sp of borderSpots(ctx, 2.3, 0.8)) {
          const r = rnd();
          if (r < 0.36) PROP.crystal(GB, sp.x, sp.z, 0.7 + rnd() * 0.5, rnd() < 0.7 ? 0x7fe8ff : 0xa8b8ff, rnd);
          else if (r < 0.66) B.add(G_SPH, 0xf4fbff, [sp.x, 0.05, sp.z], [0.7 + rnd() * 0.4, 0.3, 0.6 + rnd() * 0.3], [0, rnd() * TAU, 0]);
          else if (r < 0.8) { PROP.rock(B, sp.x, sp.z, 0.5, 0xbfe4f5, rnd); }
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = sx * (half - 1.0), z = sz * (half - 1.0);
          PROP.stalagmite(B, x, z, 2.2, 0xa8dcf5, rnd);
          PROP.crystal(GB, x - sx * 0.8, z, 0.6, 0x7fe8ff, rnd);
          ctx.addObs(x, z, 0.55, 0.55);
        }
      },
      outside(ctx) {
        const { B, rnd } = ctx;
        for (const p of outsideSpots(ctx, 30, 1.4, 8, true)) {
          if (p.side === 'S') { B.add(G_SPH, 0xf4fbff, [p.x, 0, p.z], [1.5 + rnd(), 0.6, 1.2 + rnd()]); continue; }
          if (rnd() < 0.6) {
            const h = 2.5 + rnd() * 4.5;
            B.add(G_CONE6, rnd() < 0.5 ? 0xa8dcf5 : 0xd8f4ff, [p.x, h / 2, p.z], [0.5 + h * 0.12, h, 0.5 + h * 0.12], [(rnd() - 0.5) * 0.3, rnd() * TAU, (rnd() - 0.5) * 0.3]);
          } else B.add(G_SPH, 0xf4fbff, [p.x, 0, p.z], [1.6 + rnd() * 1.5, 0.8 + rnd() * 0.8, 1.6 + rnd() * 1.5]);
        }
      },
    },
    // ---------------------------------------------------------------
    abysse: {
      wallH: 2.2, southH: 1.1,
      wall: { color: 0x3a2a5a, top: 0x4f3a78, base: 0x22163a, pilaster: 0x2d2048, rows: 2, blockLen: 2.0, jit: 0.08 },
      door: { frame: 0x2d2048, key: 0xd05cff, wood: 0x241a38, band: 0x5a3a8a },
      outer: 0x07040d, corridor: 0x1d1430,
      light: { style: 'brazier', flame: 0xd060ff, color: 0xb050ff, intensity: 1.6, bowl: 0x2a1f40 },
      hazard: { kind: 'acid', dps: 12, r: 1.4 },
      particles: { kind: 'wisps', color: 0xc080ff, count: 50, size: 0.15 },
      emissiveFloor: true,
      pulse: { amp: 0.35, speed: 1.6 },
      paintFloor(x, N, ppu, rnd, ex) {
        x.fillStyle = '#140c22'; x.fillRect(0, 0, N, N);
        const tiles = drawTiles(x, N, 14, 0.04, rnd, () => css(jitterColor(0x30244a, rnd, 0.12)), '#120a1e', 4, 3, ex, 'rgba(120,60,200,0.35)');
        for (const t of tiles) {
          if (rnd() < 0.09) {
            const col = rnd() < 0.5 ? '#d05cff' : '#5cf0ff', s = t.s * 0.28;
            const sub = mulberry32(Math.floor(rnd() * 1e9));
            rune(x, t.x, t.y, s, 'rgba(208,140,255,0.55)', 3, sub);
            rune(ex, t.x, t.y, s, col, 4, mulberry32(Math.floor(sub() * 1e9)));
          }
          if (rnd() < 0.1) crack(x, t.x, t.y, t.s * 0.5, rnd, 'rgba(160,80,255,0.6)', 2, ex, 'rgba(170,90,255,0.9)');
        }
        centerMotif(x, N, ppu, 0xc070ff, 0.35, ex);
      },
      wallTop(ctx, side, u0, u1, H) {
        const { rnd } = ctx;
        if (side === 'S') return;
        for (let u = u0 + 0.5; u < u1 - 0.3; u += 0.9) {
          if (rnd() < 0.3) continue;
          const col = rnd() < 0.6 ? 0xd05cff : 0x5cf0ff;
          wallPiece(ctx, side, u, 0.51, H * 0.55, 0.5, 0.1, 0.04, col, null, ctx.GB, 0, false);
          if (rnd() < 0.5) wallPiece(ctx, side, u + (rnd() - 0.5) * 0.3, 0.51, H * 0.55 + 0.18, 0.08, 0.25, 0.04, col, null, ctx.GB, 0, false);
        }
        for (let u = u0 + 0.8; u < u1; u += 1.6) {
          const p = sidePlace(ctx, side, u, -0.1, 1, 1), h = 0.4 + rnd() * 0.6;
          ctx.B.add(G_CONE4, 0x2a1f40, [p[0], H + h / 2, p[1]], [0.28, h, 0.28], [0, rnd(), 0]);
        }
      },
      cover(ctx, x, z, s) {
        const B = ctx.B, rnd = ctx.rnd;
        if (rnd() < 0.5) {
          B.add(cylT(0.55, 4), 0x2a1f40, [x, 1.1, z], [s * 0.8, 2.2, s * 0.8], [0, PI / 4, 0]);
          ctx.GB.add(G_BOX, 0xd05cff, [x, 1.2, z + s * 0.48], [0.1, 1.2, 0.04], null, false);
          ctx.GB.add(G_BOX, 0xd05cff, [x, 1.5, z + s * 0.47], [0.4, 0.08, 0.04], null, false);
          ctx.addObs(x, z, s * 0.7, s * 0.7);
        } else {
          PROP.rock(B, x, z, s * 0.9, 0x2a2238, rnd);
          PROP.crystal(ctx.GB, x, z, 1.0, 0xb46bff, rnd, s * 0.3);
          ctx.addObs(x, z, s * 0.85, s * 0.8);
        }
      },
      pillar(ctx, x, z, k) {
        PROP.column(ctx.B, x, z, 3.3 * k, 0.5 * k, 0x3a2a5a, 0x22163a);
        for (const y of [0.9, 1.7, 2.5]) ctx.GB.add(torus(0.12), y === 1.7 ? 0x5cf0ff : 0xd05cff, [x, y * k, z], [0.53 * k, 0.53 * k, 0.4 * k], [HPI, 0, 0], false);
        ctx.addObs(x, z, 0.65 * k, 0.65 * k);
      },
      muret(ctx, x, z, hw, hd) {
        genericMuret(ctx, x, z, hw, hd, 0x3a2a5a, 0x22163a);
        ctx.GB.add(G_BOX, 0xd05cff, [x, 1.16, z], [2 * hw * 0.85, 0.04, 2 * hd * 0.5], null, false);
      },
      decor(ctx) {
        const { B, GB, rnd, half, group } = ctx;
        const ringMats = [];
        for (const sp of borderSpots(ctx, 2.6, 1.0)) {
          const r = rnd();
          if (r < 0.28) {
            const rr = 0.8 + rnd() * 0.4;
            const pool = new T.Mesh(flatCircle(rr), basic(0x06030c));
            pool.position.set(sp.x, 0.02, sp.z); group.add(pool);
            const rm = new T.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false });
            ctx.owned.push(rm);
            const ring = new T.Mesh(flatRing(0.55, 0.62), rm);
            ring.position.set(sp.x, 0.03, sp.z); group.add(ring);
            ringMats.push({ ring, rm, rr, ph: rnd() });
            if (rnd() < 0.6) {
              const a = rnd() * TAU, px = sp.x + Math.cos(a) * rr * 0.4, pz = sp.z + Math.sin(a) * rr * 0.4;
              seg({ add: (b, l, g, c, p, s, ro, ol) => B.add(g, c, p, s, ro, ol) }, 0, 0, cylT(0.6, 8), 0x3a2050, [px, -0.1, pz], [px + 0.15, 0.7, pz + 0.1], 0.12);
              seg({ add: (b, l, g, c, p, s, ro, ol) => B.add(g, c, p, s, ro, ol) }, 0, 0, cylT(0.2, 8), 0x3a2050, [px + 0.15, 0.7, pz + 0.1], [px - 0.1, 1.2, pz + 0.3], 0.07);
            }
          } else if (r < 0.62) PROP.crystal(GB, sp.x, sp.z, 0.7 + rnd() * 0.5, rnd() < 0.6 ? 0xb46bff : 0x5cf0ff, rnd);
          else if (r < 0.75) {
            B.add(cylT(0.5, 4), 0x2a1f40, [sp.x, 0.7, sp.z], [0.35, 1.4, 0.35], [0, PI / 4, 0]);
            GB.add(G_OCTA, 0xd05cff, [sp.x, 1.6, sp.z], [0.15, 0.25, 0.15], null, true);
            ctx.addObs(sp.x, sp.z, 0.3, 0.3);
          }
        }
        if (ringMats.length) ctx.anims.push((dt, t) => {
          for (const o of ringMats) {
            const k = (t * 0.4 + o.ph) % 1;
            o.ring.scale.setScalar(0.4 + k * (o.rr / 0.62 - 0.4));
            o.rm.opacity = 0.6 * (1 - k);
          }
        });
        // piliers flottants dans les coins
        const corners = [];
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = sx * (half - 1.1), z = sz * (half - 1.1);
          B.add(G_CYL6, 0x22163a, [x, 0.2, z], [0.75, 0.4, 0.75]);
          GB.add(torus(0.1), 0xd05cff, [x, 0.42, z], [0.6, 0.6, 0.3], [HPI, 0, 0], false);
          ctx.addObs(x, z, 0.7, 0.7);
          corners.push([x, 1.35, z]);
        }
        floatingThing(ctx, FB => {
          FB.add(G_CYL6, 0x3a2a5a, [0, 0, 0], [0.55, 1.3, 0.55]);
          FB.add(G_CONE6, 0x3a2a5a, [0, 1.0, 0], [0.55, 0.7, 0.55]);
          FB.add(G_CONE6, 0x3a2a5a, [0, -1.0, 0], [0.55, 0.7, 0.55], [PI, 0, 0]);
          FB.add(G_CYL6, 0x5a3a8a, [0, 0.2, 0], [0.6, 0.12, 0.6]);
        }, corners, 0.18, 0.3);
      },
      outside(ctx) {
        const { rnd } = ctx;
        const pts = outsideSpots(ctx, 10, 2, 9, false).map(p => [p.x, 0.5 + rnd() * 2.5, p.z, 0.8 + rnd() * 1.4]);
        floatingThing(ctx, FB => {
          FB.add(G_DODE, 0x2a2238, [0, 0, 0], [1.2, 0.6, 1.0]);
          FB.add(G_CONE6, 0x2a2238, [0, -0.9, 0], [0.8, 1.4, 0.7], [PI, 0, 0]);
          FB.add(G_CONE6, 0xb46bff, [0.3, 0.7, 0.1], [0.15, 0.8, 0.15], [0, 0, -0.3]);
          FB.add(G_CONE6, 0x5cf0ff, [-0.3, 0.55, -0.2], [0.11, 0.55, 0.11], [0.2, 0, 0.3]);
        }, pts, 0.35, 0.1);
      },
    },
    // ---------------------------------------------------------------
    volcan: {
      wallH: 2.2, southH: 1.1,
      wall: { style: 'basalt', color: 0x2f2826, top: 0x4a3f3a, base: 0x221c1b },
      door: { frame: 0x3a302c, key: 0xff7a20, wood: 0x2a2224, band: 0x6a3a20 },
      outer: 0x1a0a06, corridor: 0x2a1c18,
      light: { style: 'brazier', flame: 0xff7a20, color: 0xff6a20, intensity: 1.5, bowl: 0x2a2224 },
      hazard: { kind: 'lava', dps: 18, r: 1.5 },
      particles: { kind: 'embers', color: 0xff8a2a, count: 70, size: 0.13 },
      emissiveFloor: true,
      pulse: { amp: 0.3, speed: 2.2 },
      paintFloor(x, N, ppu, rnd, ex) {
        x.fillStyle = '#1a1210'; x.fillRect(0, 0, N, N);
        const tiles = drawTiles(x, N, 12, 0.22, rnd, () => css(jitterColor(0x3a302d, rnd, 0.14)), '#4a1a0a', 5, 3, ex, 'rgba(255,90,16,0.7)');
        for (const t of tiles) {
          if (rnd() < 0.35) crack(x, t.x, t.y, t.s * 0.5, rnd, 'rgba(160,50,10,0.9)', 2.5, ex, 'rgba(255,140,40,0.95)');
          if (rnd() < 0.2) blob(x, t.x, t.y, t.s * 0.4, 'rgba(120,110,105,0.25)');
        }
        centerMotif(x, N, ppu, 0xff8a3a, 0.2, ex);
      },
      wallTop(ctx, side, u0, u1, H) {
        wallPiece(ctx, side, (u0 + u1) / 2, 0.56, 0.03, u1 - u0, 0.05, 0.14, 0xff6a1a, null, ctx.GB, 0, false);
      },
      cover(ctx, x, z, s) {
        const B = ctx.B, rnd = ctx.rnd;
        PROP.rock(B, x, z, s * 1.1, 0x2b2422, rnd);
        ctx.GB.add(G_BOX, 0xff6a1a, [x, s * 0.5, z], [s * 1.6, 0.05, 0.06], [0, rnd() * TAU, 0.2], false);
        ctx.addObs(x, z, s * 0.95, s * 0.85);
      },
      pillar(ctx, x, z, k) {
        const rnd = ctx.rnd;
        for (const [dx, dz, h] of [[0, 0, 3.4], [0.45, 0.25, 2.4], [-0.35, 0.35, 1.8], [0.1, -0.45, 2.8]]) {
          ctx.B.add(G_CYL6, jitterColor(0x2f2826, rnd, 0.1), [x + dx * k, h * k / 2, z + dz * k], [0.36 * k, h * k, 0.36 * k], [0, rnd(), 0]);
          ctx.B.add(G_CYL6, 0x4a3f3a, [x + dx * k, h * k + 0.04, z + dz * k], [0.33 * k, 0.08, 0.33 * k], [0, rnd(), 0], false);
        }
        ctx.addObs(x, z, 0.75 * k, 0.75 * k);
      },
      muret(ctx, x, z, hw, hd) {
        const along = hw >= hd, L = 2 * (along ? hw : hd), rnd = ctx.rnd;
        ctx.B.add(G_BOX, 0x221c1b, [x, 0.35, z], [2 * hw, 0.7, 2 * hd]);
        for (let u = -L / 2 + 0.35; u < L / 2; u += 0.6) {
          const h = 0.9 + rnd() * 0.35;
          ctx.B.add(G_CYL6, jitterColor(0x2f2826, rnd, 0.1), along ? [x + u, h / 2, z] : [x, h / 2, z + u], [0.36, h, 0.36], [0, rnd(), 0]);
        }
        ctx.addObs(x, z, hw, hd);
      },
      decor(ctx) {
        const { B, GB, rnd, half } = ctx;
        for (const sp of borderSpots(ctx, 2.4, 0.8)) {
          const r = rnd();
          if (r < 0.3) PROP.rock(B, sp.x, sp.z, 0.45 + rnd() * 0.3, 0x1c1618, rnd);
          else if (r < 0.52) {
            GB.add(G_CYL, 0xff7a1a, [sp.x, 0.03, sp.z], [0.45, 0.05, 0.45], null, false);
            GB.add(G_CYL, 0xffd040, [sp.x, 0.05, sp.z], [0.22, 0.05, 0.22], null, false);
            for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; B.add(G_DODE, 0x2b2220, [sp.x + Math.cos(a) * 0.55, 0.1, sp.z + Math.sin(a) * 0.55], [0.2, 0.16, 0.2]); }
          } else if (r < 0.67) { PROP.skull(B, sp.x, 0, sp.z, 0.16, 0x5a4a40, sp.ry); PROP.bones(B, sp.x + 0.3, sp.z, 3, rnd, 0x5a4a40); }
          else if (r < 0.8) {
            for (const [dx, dz, h] of [[0, 0, 1.5], [0.3, 0.2, 1.0], [-0.25, 0.2, 0.7]]) B.add(G_CYL6, jitterColor(0x2f2826, rnd, 0.1), [sp.x + dx, h / 2, sp.z + dz], [0.25, h, 0.25], [0, rnd(), 0]);
            ctx.addObs(sp.x, sp.z, 0.45, 0.45);
          }
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = sx * (half - 1.0), z = sz * (half - 1.0);
          for (const [dx, dz, h] of [[0, 0, 3.2], [-sx * 0.5, 0.1, 2.0], [0.1, -sz * 0.5, 1.5]]) B.add(G_CYL6, jitterColor(0x2f2826, rnd, 0.1), [x + dx, h / 2, z + dz], [0.36, h, 0.36], [0, rnd(), 0]);
          GB.add(G_BOX, 0xff6a1a, [x, 1.2, z - sz * 0.37], [0.05, 1.4, 0.05], [0, 0, 0.15], false);
          ctx.addObs(x, z, 0.65, 0.65);
        }
      },
      outside(ctx) {
        const { B, rnd } = ctx;
        for (const p of outsideSpots(ctx, 22, 2, 10, true)) {
          if (p.side === 'S') { PROP.rock(B, p.x, p.z, 0.8 + rnd(), 0x221c1b, rnd); continue; }
          const n = 2 + Math.floor(rnd() * 3);
          B.add(G_DODE, 0x221c1b, [p.x, 0.1, p.z], [1.6, 0.5, 1.4], [0, rnd() * TAU, 0]);
          for (let i = 0; i < n; i++) {
            const h = 1.5 + rnd() * 4.5, dx = (rnd() - 0.5) * 1.4, dz = (rnd() - 0.5) * 1.2;
            B.add(G_CYL6, jitterColor(0x2a2422, rnd, 0.1), [p.x + dx, h / 2, p.z + dz], [0.35 + rnd() * 0.15, h, 0.35 + rnd() * 0.15], [0, rnd(), 0]);
          }
        }
      },
    },
  };

  // ------------------------------------------------------------------
  // Coffre, projectiles, ramassables, télégraphes, indicateur de visée
  // ------------------------------------------------------------------
  function tMesh(geo, color, pos, scl, rot) {
    const m = new T.Mesh(geo, toonShared(color));
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    return m;
  }
  function bMesh(geo, color, opacity, additive, pos, scl) {
    const m = new T.Mesh(geo, basic(color, opacity, additive));
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    m.userData.noOutline = true;
    return m;
  }

  // ---------- Coffre ----------
  function makeChest() {
    const g = new T.Group();
    g.add(tMesh(G_BOX, 0x8a4b1c, [0, 0.42, 0], [1.5, 0.8, 1.05]));
    g.add(tMesh(G_BOX, 0xd8a43a, [0, 0.42, 0], [1.56, 0.12, 1.1]));
    for (const x of [-0.62, 0.62]) g.add(tMesh(G_BOX, 0xd8a43a, [x, 0.42, 0], [0.12, 0.84, 1.1]));
    const lid = new T.Group();
    lid.position.set(0, 0.82, -0.52);
    const lidTop = tMesh(G_CYL, 0xa65a22, [0, 0, 0.52], [0.53, 1.5, 0.53], [0, 0, HPI]);
    lidTop.scale.set(0.53, 1.5, 0.53);
    lid.add(lidTop);
    lid.add(tMesh(G_BOX, 0xd8a43a, [0, 0.1, 0.52], [0.14, 0.6, 1.12]));
    const lock = tMesh(G_BOX, 0xffd84a, [0, -0.05, 1.07], [0.26, 0.3, 0.1]);
    lock.material = toon(0xffd84a, { emissive: 0x6a4800 });
    lid.add(lock);
    g.add(lid);
    // halo doré au sol + étincelles qui tournent
    const halo = bMesh(new T.CircleGeometry(1.5, 28), 0xffd54a, 0.28, true, [0, 0.04, 0]);
    halo.rotation.x = -HPI;
    g.add(halo);
    const sparks = new T.Group();
    for (let i = 0; i < 6; i++) {
      const s = bMesh(G_OCTA, 0xfff2a0, 1, true, [Math.cos(i / 6 * TAU) * 1.1, 1.2, Math.sin(i / 6 * TAU) * 1.1], [0.09, 0.14, 0.09]);
      sparks.add(s);
    }
    g.add(sparks);
    addOutline(g, 0.035);
    g.userData.lid = lid;
    g.userData.halo = halo;
    const st = { open: 0, target: 0 };
    g.userData.chestState = st;
    // animation autonome (pas besoin d'update externe)
    lidTop.onBeforeRender = () => {
      const t = nowSec();
      st.open += (st.target - st.open) * 0.12;
      lid.rotation.x = -st.open * 1.9;
      sparks.rotation.y = t * 1.2;
      sparks.visible = st.target === 0;
      sparks.position.y = Math.sin(t * 3) * 0.12;
      halo.material.opacity = 0.2 + Math.sin(t * 4) * 0.08;
    };
    return g;
  }
  function openChest(chest) {
    if (chest && chest.userData && chest.userData.chestState) chest.userData.chestState.target = 1;
  }

  // ---------- Projectiles (orientés vers +Z) ----------
  const SPIN = (obj, axis, speed) => {
    const first = obj.children.find(c => c.isMesh) || obj;
    const prev = first.onBeforeRender;
    first.onBeforeRender = function () { obj.rotation[axis] = nowSec() * speed; };
  };
  const PROJ = {
    dagger() {
      const g = new T.Group();
      const blade = tMesh(G_CONE4, 0xe8eef5, [0, 0, 0.18], [0.09, 0.55, 0.03], [HPI, 0, 0]);
      blade.material = toon(0xe8eef5, { emissive: 0x334455 });
      g.add(blade);
      g.add(tMesh(G_BOX, 0xd8a43a, [0, 0, -0.12], [0.26, 0.05, 0.05]));
      g.add(tMesh(G_CYL6, 0x5a3220, [0, 0, -0.25], [0.04, 0.22, 0.04], [HPI, 0, 0]));
      addOutline(g, 0.02);
      return g;
    },
    fireball() {
      const g = new T.Group();
      g.add(bMesh(G_SPH, 0xff5a10, 1, false, null, [0.36, 0.36, 0.36]));
      g.add(bMesh(G_SPH, 0xffd040, 1, false, [0, 0.05, 0.08], [0.22, 0.22, 0.22]));
      g.add(bMesh(G_SPH_LO, 0xff8a20, 0.45, true, [0, 0, -0.15], [0.55, 0.5, 0.75]));
      const tail = bMesh(G_CONE, 0xff6a10, 0.6, true, [0, 0, -0.55], [0.3, 0.8, 0.3]);
      tail.rotation.x = -HPI;
      g.add(tail);
      return g;
    },
    fizzle() {
      const g = new T.Group();
      g.add(bMesh(G_SPH_LO, 0x8a8a8a, 0.9, false, null, [0.22, 0.22, 0.22]));
      g.add(bMesh(G_SPH_LO, 0xbbbbbb, 0.35, false, [0.12, 0.1, -0.15], [0.18, 0.18, 0.18]));
      return g;
    },
    arrow() {
      const g = new T.Group();
      g.add(tMesh(G_CYL6, 0x8a5a2a, [0, 0, 0], [0.03, 0.9, 0.03], [HPI, 0, 0]));
      g.add(tMesh(G_CONE4, 0xcfd6de, [0, 0, 0.5], [0.07, 0.18, 0.07], [HPI, 0, 0]));
      for (const r of [0, HPI]) g.add(tMesh(G_BOX, 0xe23a3a, [0, 0, -0.4], [r ? 0.01 : 0.16, r ? 0.16 : 0.01, 0.16]));
      addOutline(g, 0.015);
      return g;
    },
    rock() {
      const g = new T.Group();
      g.add(tMesh(G_DODE, 0x7c6a58, null, [0.45, 0.4, 0.45]));
      g.add(tMesh(G_DODE, 0x5e9e3c, [0.1, 0.25, 0], [0.2, 0.08, 0.2]));
      addOutline(g, 0.03);
      SPIN(g, 'x', 9);
      return g;
    },
    orb() {
      const g = new T.Group();
      g.add(bMesh(G_SPH, 0xc070ff, 1, false, null, [0.26, 0.26, 0.26]));
      g.add(bMesh(G_SPH, 0xf2d8ff, 1, false, null, [0.13, 0.13, 0.13]));
      g.add(bMesh(G_SPH_LO, 0x9a40ff, 0.4, true, null, [0.48, 0.48, 0.48]));
      return g;
    },
    ice() {
      const g = new T.Group();
      const c = tMesh(G_OCTA, 0xbfefff, null, [0.16, 0.16, 0.5]);
      c.material = toon(0xbfefff, { emissive: 0x2a6a8a });
      g.add(c);
      g.add(bMesh(G_SPH_LO, 0x9be8ff, 0.35, true, null, [0.3, 0.3, 0.55]));
      addOutline(g, 0.02);
      return g;
    },
    web() {
      const g = new T.Group();
      g.add(bMesh(G_SPH_LO, 0xf4f4f4, 0.9, false, null, [0.28, 0.28, 0.28]));
      const ring = bMesh(torus(0.06, TAU, 18), 0xffffff, 0.8, false, null, [0.42, 0.42, 0.42]);
      g.add(ring);
      const ring2 = bMesh(torus(0.06, TAU, 18), 0xffffff, 0.8, false, null, [0.42, 0.42, 0.42]);
      ring2.rotation.y = HPI;
      g.add(ring2);
      SPIN(g, 'z', 5);
      return g;
    },
    flame() {
      const g = new T.Group();
      const c = bMesh(G_CONE, 0xff7a1a, 0.9, true, [0, 0, -0.1], [0.28, 0.75, 0.28]);
      c.rotation.x = -HPI;
      g.add(c);
      g.add(bMesh(G_SPH_LO, 0xffe060, 1, false, [0, 0, 0.15], [0.18, 0.18, 0.18]));
      return g;
    },
    bone() {
      const g = new T.Group();
      g.add(tMesh(G_CYL6, 0xf1ece0, null, [0.06, 0.6, 0.06], [0, 0, HPI]));
      for (const x of [-0.3, 0.3]) for (const z of [-0.06, 0.06]) g.add(tMesh(G_SPH_LO, 0xf1ece0, [x, 0, z], [0.09, 0.09, 0.09]));
      addOutline(g, 0.02);
      SPIN(g, 'y', 14);
      return g;
    },
  };
  function makeProjectile(type) {
    const f = PROJ[type] || PROJ.orb;
    const o = f();
    o.traverse(m => { if (m.isMesh) m.castShadow = !m.userData.isOutline && m.material && !m.material.transparent; });
    return o;
  }

  // ---------- Ramassables ----------
  function bobber(g, inner, spin, amp) {
    const ph = Math.random() * TAU;
    const first = inner.children.find(c => c.isMesh) || inner;
    first.onBeforeRender = () => {
      const t = nowSec();
      inner.position.y = Math.sin(t * 4 + ph) * amp;
      inner.rotation.y = t * spin + ph;
    };
  }
  const PICK = {
    gold() {
      const g = new T.Group(), inner = new T.Group();
      inner.position.y = 0;
      const coin = tMesh(G_CYL, 0xffcf33, [0, 0.45, 0], [0.26, 0.07, 0.26], [HPI, 0, 0]);
      coin.material = toon(0xffcf33, { emissive: 0x5a3c00 });
      inner.add(coin);
      inner.add(tMesh(G_CYL, 0xffe680, [0, 0.45, 0.04], [0.14, 0.02, 0.14], [HPI, 0, 0]));
      addOutline(inner, 0.025);
      g.add(inner);
      const sh = bMesh(new T.CircleGeometry(0.22, 12), 0x000000, 0.25, false, [0, 0.03, 0]);
      sh.rotation.x = -HPI; g.add(sh);
      bobber(g, inner, 4, 0.1);
      return g;
    },
    xp() {
      const g = new T.Group(), inner = new T.Group();
      inner.add(bMesh(G_OCTA, 0x6ad4ff, 1, false, [0, 0.5, 0], [0.16, 0.22, 0.16]));
      inner.add(bMesh(G_SPH_LO, 0x3fa9ff, 0.4, true, [0, 0.5, 0], [0.3, 0.3, 0.3]));
      g.add(inner);
      bobber(g, inner, 3, 0.12);
      return g;
    },
    heart() {
      const g = new T.Group(), inner = new T.Group();
      const red = toon(0xff3355, { emissive: 0x550011 });
      for (const x of [-0.12, 0.12]) { const s = tMesh(G_SPH, 0xff3355, [x, 0.6, 0], [0.16, 0.16, 0.14]); s.material = red; inner.add(s); }
      const c = tMesh(G_CONE, 0xff3355, [0, 0.43, 0], [0.26, 0.3, 0.13], [PI, 0, 0]); c.material = red; inner.add(c);
      addOutline(inner, 0.025);
      inner.add(bMesh(G_SPH_LO, 0xff6680, 0.3, true, [0, 0.52, 0], [0.42, 0.42, 0.42]));
      g.add(inner);
      bobber(g, inner, 2.5, 0.1);
      return g;
    },
  };
  function makePickup(type) { return (PICK[type] || PICK.xp)(); }

  // ---------- Télégraphes (zones rouges à esquiver) ----------
  const G_DISC = new T.CircleGeometry(1, 40);
  G_DISC.userData.shared = true;
  const G_RIM = new T.RingGeometry(0.93, 1, 48);
  G_RIM.userData.shared = true;
  const G_PLANE = new T.PlaneGeometry(1, 1);
  G_PLANE.userData.shared = true;
  function teleMat(color, op) {
    return new T.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: T.DoubleSide });
  }
  function makeTelegraph(kind, size) {
    const g = new T.Group();
    g.position.y = 0.05;
    g.renderOrder = 2;
    const base = teleMat(0xff2a2a, 0.22), fillM = teleMat(0xff3b3b, 0.42), rimM = teleMat(0xff1a1a, 0.95);
    let setP;
    if (kind === 'line') {
      const L = (size && size.length) || 8, W = (size && size.width) || 1.2;
      const b = new T.Mesh(G_PLANE, base); b.rotation.x = -HPI; b.scale.set(W, L, 1); b.position.z = L / 2; g.add(b);
      const f = new T.Mesh(G_PLANE, fillM); f.rotation.x = -HPI; f.position.y = 0.01; g.add(f);
      for (const s of [-1, 1]) {
        const e = new T.Mesh(G_PLANE, rimM); e.rotation.x = -HPI; e.scale.set(0.08, L, 1); e.position.set(s * W / 2, 0.02, L / 2); g.add(e);
      }
      const tip = new T.Mesh(G_PLANE, rimM); tip.rotation.x = -HPI; tip.scale.set(W, 0.1, 1); tip.position.set(0, 0.02, L); g.add(tip);
      setP = p => { p = clamp(p, 0, 1); f.scale.set(W, Math.max(0.001, L * p), 1); f.position.z = L * p / 2; };
    } else if (kind === 'ring') {
      const R = typeof size === 'number' ? size : 1;
      const ring = new T.Mesh(new T.RingGeometry(R * 0.8, R, 56), fillM); ring.rotation.x = -HPI; g.add(ring);
      const rim = new T.Mesh(G_RIM, rimM); rim.rotation.x = -HPI; rim.scale.setScalar(R); rim.position.y = 0.01; g.add(rim);
      setP = p => { p = clamp(p, 0, 1); fillM.opacity = 0.3 + 0.5 * p; rimM.opacity = 0.6 + 0.4 * Math.abs(Math.sin(nowSec() * 12)); };
    } else {
      const R = typeof size === 'number' ? size : (size && size.radius) || 2;
      const b = new T.Mesh(G_DISC, base); b.rotation.x = -HPI; b.scale.setScalar(R); g.add(b);
      const f = new T.Mesh(G_DISC, fillM); f.rotation.x = -HPI; f.position.y = 0.01; g.add(f);
      const rim = new T.Mesh(G_RIM, rimM); rim.rotation.x = -HPI; rim.scale.setScalar(R); rim.position.y = 0.02; g.add(rim);
      setP = p => { p = clamp(p, 0, 1); f.scale.setScalar(Math.max(0.001, R * p)); rimM.opacity = 0.7 + 0.3 * Math.abs(Math.sin(nowSec() * (6 + p * 14))); };
    }
    setP(0);
    g.userData.setProgress = setP;
    g.userData.kind = kind;
    g.traverse(m => { if (m.isMesh) { m.renderOrder = 2; m.castShadow = false; m.receiveShadow = false; } });
    return g;
  }

  // ---------- Indicateur de visée ----------
  function makeAimIndicator() {
    const g = new T.Group();
    g.position.y = 0.06;
    const m = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, side: T.DoubleSide });
    const line = new T.Mesh(G_PLANE, m); line.rotation.x = -HPI; g.add(line);
    const head = new T.Mesh(new T.CircleGeometry(0.45, 3), m); head.rotation.x = -HPI; head.rotation.z = HPI; g.add(head);
    const cone = new T.Mesh(new T.CircleGeometry(1, 24, -0.6 + HPI, 1.2), m); cone.rotation.x = HPI; g.add(cone);
    const circ = new T.Mesh(G_RIM, m); circ.rotation.x = -HPI; g.add(circ);
    const circF = new T.Mesh(G_DISC, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })); circF.rotation.x = -HPI; g.add(circF);
    g.traverse(o => { if (o.isMesh) o.renderOrder = 3; });
    g.userData.set = (mode, length) => {
      const L = length || 6;
      line.visible = head.visible = mode === 'line' || mode === 'circle';
      cone.visible = mode === 'cone';
      circ.visible = circF.visible = mode === 'circle';
      line.scale.set(0.35, L, 1); line.position.z = L / 2;
      head.position.z = L + 0.15;
      cone.scale.setScalar(L);
      const r = mode === 'circle' ? Math.min(3, L * 0.35) : 1;
      circ.scale.setScalar(r); circF.scale.setScalar(r);
      circ.position.z = circF.position.z = L;
      if (mode === 'circle') { line.scale.x = 0.2; head.visible = false; }
    };
    g.userData.set('line', 6);
    return g;
  }

  // ------------------------------------------------------------------
  // EXPORTS
  // ------------------------------------------------------------------
  // Registres de modèles supplémentaires (v3) : G.GFX.registerModel('enemy'|'boss'|'hero'|'minion', id, build(opts) -> Group)
  const EXTRA = { enemy: {}, boss: {}, hero: {}, minion: {} };
  function registerModel(kind, id, build) { (EXTRA[kind] = EXTRA[kind] || {})[id] = build; }
  function finishExtra(g) {
    if (!g) return g;
    g.userData = g.userData || {};
    if (!g.userData.mats) { const mats = []; g.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !o.userData.isOutline && mats.indexOf(o.material) < 0) mats.push(o.material); }); g.userData.mats = mats; }
    if (g.userData.height == null) g.userData.height = 1.8;
    if (g.userData.radius == null) g.userData.radius = 0.5;
    return g;
  }
  const makeEnemyX = (model, opts) => EXTRA.enemy[model] ? finishExtra(EXTRA.enemy[model](opts || {})) : makeEnemy(model, opts);
  const makeBossX = (model, opts) => EXTRA.boss[model] ? finishExtra(EXTRA.boss[model](opts || {})) : makeBoss(model);
  const makeHeroX = (classId, opts) => EXTRA.hero[classId] ? finishExtra(EXTRA.hero[classId](opts || {})) : makeHero(classId, opts);
  const makeMinion = (id, opts) => EXTRA.minion[id] ? finishExtra(EXTRA.minion[id](opts || {})) : makeEnemy('skeleton', Object.assign({ tint: 0x7a3cff }, opts || {}));
  const hasModel = (kind, id) => !!(EXTRA[kind] && EXTRA[kind][id]) || (kind === 'enemy' && !!ENEMY_BUILD[id]) || (kind === 'boss' && !!BOSS_BUILD[id]) || (kind === 'hero' && !!HERO_PAL[id]);

  window.G.GFX = {
    THEMES,
    toon,
    addOutline,
    registerModel,
    registerTheme,
    hasTheme: id => !!(EXTRA_THEMES[id] || STYLE[id]),
    hasModel,
    makeMinion,
    makeHero: makeHeroX,
    setHeroWeaponLevel,
    makeEnemy: makeEnemyX,
    makeBoss: makeBossX,
    animateCharacter,
    buildRoom,
    makeChest,
    openChest,
    makeProjectile,
    makePickup,
    makeTelegraph,
    makeAimIndicator,
  };
})();
