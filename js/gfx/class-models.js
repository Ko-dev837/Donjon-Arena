window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v3 « Éveil » — js/gfx/class-models.js   (rôle 12)
   Modèles 3D toon des nouvelles classes + des serviteurs d'ombre.

   Héros  : G.GFX.registerModel('hero', id, build)  → Assassin, Archer, Paladin,
            Elementaliste, Necromancien  (chibi, mêmes proportions que makeHero :
            squelette legL/legR/body/head/armL/armR/wristL/wristR, regard +Z,
            pieds en y = 0, hauteur ≈ 1,95–2,2).
            userData : { kind:'hero', rig, parts, rest, blade, armL, armR, legL, legR,
                         head, body, mats, height, radius:0.5, classId, glow, auras,
                         weaponLevels, sovereign? (Nécromancien : groupe masqué, affiché
                         pendant l'ultime) }
   Minions: G.GFX.registerModel('minion', id, build({rank, rarity, tint, scale}))
            ombre_guerrier, ombre_archer, ombre_mage, ombre_colosse, ombre_chevalier,
            ombre_bete, ombre_faucheur (rare), ombre_titan (légendaire), ombre (générique).
            Silhouettes violet/noir, yeux lumineux à la couleur du rang (E→S), variante
            plus imposante selon le rang (taille, épaulières, cornes, anneau runique,
            couronne de flammes, aura).
   Animation : G.GFX.animateCharacter (userData.kind/rig/parts/rest renseignés).
   Technique : pièces fusionnées par os (peu de draw calls), contours toon fusionnés,
               matériaux par instance (le flash de dégâts ne déteint pas sur les autres).
   ===================================================================== */
(() => {
  'use strict';
  const T = window.THREE;
  const G = window.G;
  if (!T || !G.GFX || typeof G.GFX.registerModel !== 'function') {
    if (typeof console !== 'undefined') console.warn('[class-models] THREE ou G.GFX.registerModel introuvable : modèles non enregistrés');
    return;
  }

  const PI = Math.PI, HPI = PI / 2, TAU = PI * 2;
  const nowSec = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) / 1000;

  // ------------------------------------------------------------------
  // Couleurs
  // ------------------------------------------------------------------
  const _ca = new T.Color(), _cb = new T.Color();
  function shade(hex, f) {
    _ca.setHex(hex);
    if (f >= 0) _ca.lerp(_cb.setHex(0xffffff), f); else _ca.multiplyScalar(1 + f);
    return _ca.getHex();
  }
  const RANK_IDS = ['E', 'D', 'C', 'B', 'A', 'S'];
  const RANK_COLORS = [0x9aa3ad, 0x4fd17a, 0x3fa9ff, 0xb44dff, 0xff8a1a, 0xff3d3d];
  const rankIdx = (r) => { const i = RANK_IDS.indexOf(String(r || 'E').toUpperCase()); return i < 0 ? (String(r).toUpperCase() === 'Z' ? 5 : 0) : i; };

  // ------------------------------------------------------------------
  // Géométries unitaires partagées
  // ------------------------------------------------------------------
  const GK = {};
  const gk = (key, fn) => GK[key] || (GK[key] = fn());
  const BOX = new T.BoxGeometry(1, 1, 1);
  const SPH = new T.SphereGeometry(1, 14, 10);
  const SPHLO = new T.SphereGeometry(1, 8, 6);
  const HEMI = new T.SphereGeometry(1, 14, 6, 0, TAU, 0, HPI);
  const CYL = new T.CylinderGeometry(1, 1, 1, 12);
  const CYL8 = new T.CylinderGeometry(1, 1, 1, 8);
  const CONE = new T.ConeGeometry(1, 1, 10);
  const CONE4 = new T.ConeGeometry(1, 1, 4);
  const OCTA = new T.OctahedronGeometry(1, 0);
  const ICO = new T.IcosahedronGeometry(1, 0);
  const cylT = (top, seg) => { seg = seg || 12; return gk('cylT' + top.toFixed(2) + '_' + seg, () => new T.CylinderGeometry(top, 1, 1, seg)); };
  const torus = (tube, arc, seg) => {
    arc = arc == null ? TAU : arc; seg = seg || 16;
    return gk('tor' + tube + '_' + arc.toFixed(3) + '_' + seg, () => new T.TorusGeometry(1, tube, 6, seg, arc));
  };
  // robe effilochée (cylindre ouvert, bas dentelé)
  const ROBE = gk('robe', () => {
    const g = new T.CylinderGeometry(0.42, 1, 1, 14, 3, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -0.49) pos.setY(i, pos.getY(i) - ((i % 15) % 2 ? 0.22 : 0.02));
    }
    g.computeVertexNormals();
    return g;
  });
  // cape : demi-cylindre arrière ouvert (côté -Z)
  const CAPE = gk('cape', () => new T.CylinderGeometry(0.75, 1, 1, 10, 1, true, HPI, PI));

  // ------------------------------------------------------------------
  // Fusion de pièces → une géométrie par (os, couche)
  // pièce = { g, c, p:[x,y,z], s:[sx,sy,sz], r:[rx,ry,rz], ol }
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
  function inflateF(size, s, t) { const S = size * Math.abs(s || 1); return S > 1e-4 ? Math.min(1 + 2 * t / S, 1.7) : 1; }

  function mergePieces(list, outline, thick) {
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
        const bb = bbox(p.g);
        const fx = inflateF(bb.max.x - bb.min.x, p.s[0], thick);
        const fy = inflateF(bb.max.y - bb.min.y, p.s[1], thick);
        const fz = inflateF(bb.max.z - bb.min.z, p.s[2], thick);
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

  // rotation (Euler XYZ) qui aligne +Y sur la direction donnée
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
  // Enregistreur de squelette
  // couches : solid, trans, glow (plein éclat), aura (additif translucide), eyes (émissif),
  //           blade (arme, contour), cape (double face)
  // ------------------------------------------------------------------
  const DEFAULT_OL = { solid: true, trans: true, blade: true, glow: false, aura: false, eyes: false, cape: false };
  class Rig {
    constructor() {
      this.root = new T.Group(); this.rig = new T.Group(); this.rig.name = 'rig'; this.root.add(this.rig);
      this.bones = { root: this.rig }; this.pieces = {}; this.order = []; this.fns = [];
    }
    bone(name, parent, x, y, z) {
      const g = new T.Group(); g.name = name; g.position.set(x || 0, y || 0, z || 0);
      (this.bones[parent] || this.rig).add(g); this.bones[name] = g; return g;
    }
    add(bone, layer, geo, color, p, s, r, ol) {
      if (!this.bones[bone]) bone = 'root';
      const L = layer || 'solid', key = bone + '|' + L;
      if (!this.pieces[key]) { this.pieces[key] = []; this.order.push(key); }
      if (s == null) s = [1, 1, 1]; else if (typeof s === 'number') s = [s, s, s];
      this.pieces[key].push({ g: geo, c: color, p: p || [0, 0, 0], s, r: r || [0, 0, 0], ol: ol != null ? !!ol : !!DEFAULT_OL[L] });
    }
    // segment (boîte/cylindre) entre deux points ; w = épaisseur
    seg(bone, layer, geo, color, a, b, w, d, ol) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      this.add(bone, layer, geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [w, len, d == null ? w : d], rotTo(dx, dy, dz), ol);
    }
    // animation d'ambiance : fn(t, bones) appelée au rendu (pas de dépendance au game)
    fx(fn) { this.fns.push(fn); }
  }

  const OUT_MAT = new T.MeshBasicMaterial({ color: 0x000000, side: T.BackSide }); OUT_MAT.userData.shared = true;
  const GEO_CACHE = {};

  function assemble(R, key, o) {
    o = o || {};
    let cache = GEO_CACHE[key];
    const build = !cache;
    if (build) cache = GEO_CACHE[key] = {};
    const mats = {}, flash = [], meshes = {};
    const toon = G.GFX.toon;
    const getMat = (L) => {
      if (mats[L]) return mats[L];
      let m;
      switch (L) {
        case 'glow': m = new T.MeshBasicMaterial({ vertexColors: true }); break;
        case 'aura': m = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o.auraOpacity || 0.5, blending: T.AdditiveBlending, depthWrite: false }); break;
        case 'trans': m = toon(0xffffff, { vertexColors: true, transparent: true, opacity: o.transOpacity || 0.72, depthWrite: false }); flash.push(m); break;
        case 'cape': m = toon(0xffffff, { vertexColors: true, side: T.DoubleSide }); flash.push(m); break;
        case 'eyes': m = toon(0xffffff, { vertexColors: true, emissive: o.eyeColor != null ? o.eyeColor : 0xb44dff, emissiveIntensity: 0.9 }); break;
        case 'blade': m = toon(0xffffff, { vertexColors: true, emissive: o.bladeEmissive != null ? o.bladeEmissive : 0x000000, emissiveIntensity: 0.6 }); flash.push(m); break;
        default: m = toon(0xffffff, { vertexColors: true }); flash.push(m);
      }
      return (mats[L] = m);
    };
    const boneNames = [];
    for (const k of R.order) {
      const i = k.indexOf('|');
      const bone = k.slice(0, i), L = k.slice(i + 1);
      if (boneNames.indexOf(bone) < 0) boneNames.push(bone);
      let geo = cache[k];
      if (build) { geo = cache[k] = mergePieces(R.pieces[k], false, 0); if (geo) geo.userData.shared = true; }
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
        geo = cache[ok] = mergePieces(all, true, o.outline != null ? o.outline : 0.03); if (geo) geo.userData.shared = true;
      }
      if (!geo) continue;
      const m = new T.Mesh(geo, OUT_MAT);
      m.userData.isOutline = true;
      R.bones[bone].add(m);
    }
    return { mats, flash, meshes };
  }

  // userData compatible G.GFX.animateCharacter
  function finish(R, asm, info, kind) {
    const root = R.root, rig = R.rig, B = R.bones, ud = root.userData, sc = info.scale || 1;
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
    ud.rest = {};
    for (const k in B) if (k !== 'root') ud.rest[k] = [B[k].rotation.x, B[k].rotation.y, B[k].rotation.z];
    rig.position.y = ud.baseY;
    rig.scale.setScalar(sc);
    ud.meshes = asm.meshes;
    ud.auras = [];
    // animations d'ambiance (flammes, orbes…) pilotées par le rendu d'un mesh du modèle
    if (R.fns.length) {
      let host = null;
      for (const b in asm.meshes) { for (const L in asm.meshes[b]) { host = asm.meshes[b][L]; break; } if (host) break; }
      if (host) {
        const fns = R.fns;
        host.onBeforeRender = function () {
          const t = nowSec();
          for (let i = 0; i < fns.length; i++) { try { fns[i](t, B); } catch (e) { /* ne casse pas le rendu */ } }
        };
      }
    }
    rig.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.userData.owner = kind; });
    return root;
  }

  // ==================================================================
  // HÉROS
  // ==================================================================
  const SIDES = [['L', 1], ['R', -1]];

  function heroSkeleton(R) {
    R.bone('legL', 'root', 0.16, 0.62, 0); R.bone('legR', 'root', -0.16, 0.62, 0);
    R.bone('body', 'root', 0, 0.62, 0);
    R.bone('head', 'body', 0, 0.72, 0);
    R.bone('armL', 'body', 0.37, 0.44, 0); R.bone('armR', 'body', -0.37, 0.44, 0);
    R.bone('wristL', 'armL', 0, -0.42, 0.03); R.bone('wristR', 'armR', 0, -0.42, 0.03);
  }
  function heroLegs(R, p) {
    for (const [s] of SIDES) {
      const b = 'leg' + s;
      R.add(b, 'solid', CYL, p.cloth, [0, -0.2, 0], [0.11, 0.42, 0.11]);
      R.add(b, 'solid', CYL, shade(p.boot, 0.15), [0, -0.42, 0.01], [0.125, 0.08, 0.125]);
      R.add(b, 'solid', SPH, p.boot, [0, -0.53, 0.04], [0.13, 0.1, 0.18]);
    }
  }
  function heroArms(R, p) {
    for (const [s] of SIDES) {
      const b = 'arm' + s;
      R.add(b, 'solid', CYL, p.sleeve, [0, -0.17, 0], [0.085, 0.36, 0.085]);
      R.add(b, 'solid', CYL, p.bracer || p.sleeve, [0, -0.31, 0], [0.1, 0.1, 0.1]);
      R.add(b, 'solid', SPH, p.glove, [0, -0.4, 0.01], 0.1);
    }
  }
  // visage chibi : yeux, sourcils, joues, bouche (copie du style makeHero)
  function heroFace(R, skin, browC, o) {
    o = o || {};
    R.add('head', 'solid', SPH, skin, [0, 0.05, 0], [0.4, 0.38, 0.38]);
    for (const [, sx] of SIDES) {
      R.add('head', 'solid', SPH, o.eyeDark != null ? o.eyeDark : 0x1d1d2b, [sx * 0.14, 0.03, 0.335], [0.06, 0.09, 0.04], null, false);
      R.add('head', 'glow', SPHLO, o.glint != null ? o.glint : 0xffffff, [sx * 0.14 + 0.02, 0.07, 0.37], [0.022, 0.026, 0.015]);
      R.add('head', 'solid', BOX, browC, [sx * 0.14, 0.15, 0.335], [0.1, 0.025, 0.03], [0, 0, -sx * 0.12], false);
      if (!o.noBlush) R.add('head', 'solid', SPHLO, 0xff9a9a, [sx * 0.25, -0.06, 0.275], [0.06, 0.03, 0.02], [0, sx * 0.6, 0], false);
      if (o.ears !== false) R.add('head', 'solid', SPH, skin, [sx * 0.39, 0.02, 0], [0.07, 0.1, 0.07]);
    }
    if (!o.noMouth) R.add('head', 'solid', BOX, 0x8a3b2e, [0, -0.12, 0.345], [0.08, 0.022, 0.02], null, false);
    R.add('head', 'solid', SPHLO, shade(skin, -0.08), [0, -0.03, 0.36], 0.03, null, false);
    R.add('body', 'solid', CYL, skin, [0, 0.6, 0], [0.1, 0.12, 0.1]);
  }
  function bangs(R, hair, hairD, y, z) {
    R.add('head', 'solid', CONE, hair, [0, y, z], [0.07, 0.17, 0.06], [PI - 0.45, 0, 0]);
    R.add('head', 'solid', CONE, hairD, [0.29, y - 0.05, z - 0.1], [0.08, 0.22, 0.07], [PI - 0.3, 0, 0.25]);
    R.add('head', 'solid', CONE, hair, [-0.29, y - 0.05, z - 0.1], [0.08, 0.22, 0.07], [PI - 0.3, 0, -0.25]);
    R.add('head', 'solid', CONE, hairD, [0.15, y + 0.03, z - 0.01], [0.06, 0.12, 0.05], [PI - 0.5, 0, 0.35]);
    R.add('head', 'solid', CONE, hair, [-0.15, y + 0.03, z - 0.01], [0.06, 0.12, 0.05], [PI - 0.5, 0, -0.35]);
  }

  function heroFinish(R, key, classId, info, bladeBone, bladeLayer, wristR, wristL, asmOpts) {
    const asm = assemble(R, key, Object.assign({ outline: 0.03 }, asmOpts || {}));
    R.bones.wristR.rotation.x = wristR;
    R.bones.wristL.rotation.x = wristL;
    finish(R, asm, { height: info.height || 1.95, radius: 0.5, walkSpeed: 10 }, 'hero');
    const ud = R.root.userData;
    ud.classId = classId;
    ud.wristRest = wristR;
    ud.blade = (asm.meshes[bladeBone] && asm.meshes[bladeBone][bladeLayer]) || null;
    ud.glow = { epee: [], dague: [], feu: [] };
    ud.weaponLevels = { epee: 1, dague: 1, feu: 1 };
    ud.rest.wristR = [wristR, 0, 0]; ud.rest.wristL = [wristL, 0, 0];
    return R.root;
  }

  // ---------------- ASSASSIN : capuche sombre, masque, deux lames ----------------
  function buildAssassin(opts) {
    opts = opts || {};
    const skin = opts.skin != null ? opts.skin : 0xf2c9a4;
    const P = { main: 0x2a2d45, mainD: 0x161827, accent: 0xe63946, cloth: 0x1d1f30, boot: 0x2b2b3a, sleeve: 0x2a2d45, bracer: 0xe63946, glove: 0x14151f };
    const R = new Rig(); heroSkeleton(R); heroLegs(R, P); heroArms(R, P);
    heroFace(R, skin, 0x14151f, { ears: false, noMouth: true });
    for (const [s] of SIDES) R.add('leg' + s, 'solid', CYL, P.accent, [0, -0.3, 0], [0.118, 0.05, 0.118]);
    // capuche + masque
    R.add('head', 'solid', HEMI, P.main, [0, 0.07, -0.03], [0.47, 0.47, 0.47], [-0.45, 0, 0]);
    R.add('head', 'solid', SPH, P.main, [0, -0.02, -0.14], [0.44, 0.42, 0.36]);
    R.add('head', 'solid', CONE, P.mainD, [0, 0.22, -0.42], [0.12, 0.34, 0.12], [-1.9, 0, 0]);
    R.add('head', 'solid', torus(0.1), P.accent, [0, 0.17, 0.0], [0.4, 0.4, 0.4], [HPI - 0.12, 0, 0]);
    R.add('head', 'solid', SPH, P.mainD, [0, -0.13, 0.2], [0.31, 0.15, 0.2]);
    R.add('head', 'solid', CONE4, P.accent, [0, 0.19, 0.4], [0.05, 0.12, 0.02], [PI + 0.2, 0, 0], false);
    bangs(R, P.mainD, shade(P.mainD, 0.15), 0.15, 0.35);
    // tenue
    R.add('body', 'solid', cylT(0.85), P.main, [0, 0.27, 0], [0.31, 0.54, 0.27]);
    R.add('body', 'solid', BOX, P.accent, [0, 0.3, 0.255], [0.06, 0.6, 0.03], [0, 0, 0.75], false);
    R.add('body', 'solid', BOX, P.mainD, [0, 0.3, 0.26], [0.06, 0.6, 0.03], [0, 0, -0.75], false);
    R.add('body', 'solid', CYL, 0x14151f, [0, 0.06, 0], [0.33, 0.08, 0.29]);
    R.add('body', 'solid', BOX, 0xc9d1dd, [0, 0.06, 0.29], [0.08, 0.07, 0.03]);
    R.add('body', 'solid', cylT(0.85), P.mainD, [0, -0.05, 0], [0.34, 0.16, 0.3]);
    R.add('body', 'solid', torus(0.38), P.accent, [0, 0.55, 0], [0.22, 0.21, 0.2], [HPI, 0, 0]);
    R.add('body', 'glow', OCTA, 0xff4d6d, [0, 0.5, 0.25], [0.04, 0.05, 0.03]);
    // écharpe animée par ANIM.hero (os 'scarf')
    R.bone('scarf', 'body', 0.08, 0.56, -0.2);
    R.add('scarf', 'solid', BOX, P.accent, [0, -0.06, -0.14], [0.12, 0.04, 0.34], [-0.5, 0, 0]);
    R.add('scarf', 'solid', BOX, shade(P.accent, -0.2), [-0.09, -0.1, -0.1], [0.1, 0.035, 0.26], [-0.7, 0.2, 0]);
    // lames croisées dans le dos
    R.add('body', 'solid', BOX, 0x3a3a4a, [0, 0.3, -0.3], [0.08, 0.64, 0.05], [0, 0, 0.7]);
    R.add('body', 'solid', BOX, 0x3a3a4a, [0, 0.3, -0.32], [0.08, 0.64, 0.05], [0, 0, -0.7]);
    R.add('body', 'solid', CYL8, P.accent, [-0.24, 0.58, -0.3], [0.03, 0.12, 0.03], [0, 0, 0.7]);
    R.add('body', 'solid', CYL8, P.accent, [0.24, 0.58, -0.32], [0.03, 0.12, 0.03], [0, 0, -0.7]);
    // kunaï à la ceinture
    R.add('body', 'solid', BOX, 0x8a8f9c, [0.3, 0.0, 0.1], [0.04, 0.2, 0.05], [0.25, 0, 0.2]);
    // deux lames courbes (os poignets)
    for (const w of ['wristR', 'wristL']) {
      R.add(w, 'solid', CYL8, 0x14151f, [0, 0, -0.02], [0.03, 0.14, 0.03], [HPI, 0, 0]);
      R.add(w, 'solid', BOX, P.accent, [0, 0, 0.06], [0.16, 0.04, 0.05]);
      R.add(w, 'blade', BOX, 0xe9eef7, [0, 0, 0.26], [0.06, 0.03, 0.36]);
      R.add(w, 'blade', CONE4, 0xe9eef7, [0, 0.03, 0.5], [0.03, 0.14, 0.012], [HPI + 0.3, 0, 0]);
      R.add(w, 'glow', BOX, 0xff4d6d, [0, -0.02, 0.25], [0.012, 0.01, 0.34], null, false);
    }
    return heroFinish(R, 'hero|Assassin|' + skin, 'Voleur', { height: 1.95 }, 'wristR', 'blade', -0.25, -0.25, { bladeEmissive: 0x331018 });
  }

  // ---------------- ARCHER : capuche verte à plume, arc, carquois ----------------
  function buildArcher(opts) {
    opts = opts || {};
    const skin = opts.skin != null ? opts.skin : 0xffd2a8;
    const hair = opts.hair != null ? opts.hair : 0x8a5a2e, hairD = shade(hair, -0.25);
    const P = { main: 0x3f9a50, mainD: 0x2a6b38, leather: 0x8a5a32, trim: 0xe6c35c, cloth: 0x5b4630, boot: 0x5a3a1e, sleeve: 0x3f9a50, bracer: 0x8a5a32, glove: 0x7a4b2a };
    const R = new Rig(); heroSkeleton(R); heroLegs(R, P); heroArms(R, P);
    heroFace(R, skin, hairD, {});
    // cheveux + bonnet de chasseur
    R.add('head', 'solid', SPH, hair, [0, 0.0, -0.12], [0.4, 0.36, 0.3]);
    bangs(R, hair, hairD, 0.17, 0.36);
    R.add('head', 'solid', HEMI, P.main, [0, 0.12, -0.02], [0.43, 0.38, 0.43], [-0.3, 0, 0]);
    R.add('head', 'solid', CYL, P.mainD, [0, 0.2, 0.04], [0.5, 0.035, 0.5], [-0.22, 0, 0]);
    R.add('head', 'solid', CYL, P.trim, [0, 0.25, 0.02], [0.43, 0.04, 0.43], [-0.22, 0, 0]);
    R.add('head', 'solid', CONE, 0xe0463a, [0.22, 0.4, -0.08], [0.05, 0.42, 0.025], [0.2, 0, -0.75], false);
    R.add('head', 'solid', CONE, 0xf4f4f0, [0.3, 0.36, -0.1], [0.04, 0.3, 0.02], [0.2, 0, -0.9], false);
    // tunique de cuir
    R.add('body', 'solid', cylT(0.85), P.main, [0, 0.27, 0], [0.31, 0.54, 0.27]);
    R.add('body', 'solid', cylT(0.9), P.leather, [0, 0.19, 0.0], [0.325, 0.3, 0.285]);
    R.add('body', 'solid', BOX, 0x4a2c18, [0, 0.3, 0.26], [0.07, 0.6, 0.03], [0, 0, 0.7], false);
    R.add('body', 'solid', CYL, 0x3a2414, [0, 0.06, 0], [0.33, 0.08, 0.29]);
    R.add('body', 'solid', BOX, P.trim, [0, 0.06, 0.29], [0.08, 0.07, 0.03]);
    R.add('body', 'solid', cylT(0.85), P.mainD, [0, -0.05, 0], [0.34, 0.16, 0.3]);
    R.add('body', 'solid', torus(0.38), P.mainD, [0, 0.55, 0], [0.24, 0.22, 0.22], [HPI, 0, 0]);
    R.add('body', 'glow', OCTA, 0x9affc0, [0, 0.5, 0.25], [0.04, 0.05, 0.03]);
    // carquois dans le dos + flèches
    R.add('body', 'solid', CYL, P.leather, [-0.12, 0.33, -0.34], [0.1, 0.56, 0.1], [0.18, 0, 0.3]);
    R.add('body', 'solid', CYL, P.trim, [-0.12, 0.33, -0.34], [0.105, 0.06, 0.105], [0.18, 0, 0.3]);
    for (let k = 0; k < 3; k++) {
      const ox = -0.18 + k * 0.045;
      R.add('body', 'solid', CYL8, 0x6b4226, [ox - 0.05, 0.7, -0.36 + k * 0.01], [0.014, 0.28, 0.014], [0.18, 0, 0.3]);
      R.add('body', 'solid', CONE4, 0xf4f4f0, [ox - 0.12, 0.84, -0.37 + k * 0.01], [0.04, 0.1, 0.012], [0.18, 0, 0.3 + (k - 1) * 0.1], false);
    }
    // arc long (main gauche) : arc de cercle dans le plan YZ, ventre vers +Z, corde droite
    R.add('wristL', 'blade', torus(0.05, 2.2), 0x8a5a2e, [0, 0, -0.32], [0.62, 0.62, 0.62], [0, -HPI, -1.1]);
    R.add('wristL', 'blade', torus(0.068, 0.5), P.trim, [0, 0, -0.32], [0.62, 0.62, 0.62], [0, -HPI, -0.25]);
    R.add('wristL', 'glow', BOX, 0xeafff0, [0, 0, -0.05], [0.008, 1.08, 0.008], null, false);
    R.add('wristL', 'solid', SPH, P.glove, [0, 0, 0.0], 0.1);
    // pointe de flèche posée dans la main droite
    R.add('wristR', 'solid', CYL8, 0x6b4226, [0, 0, 0.18], [0.014, 0.5, 0.014], [HPI, 0, 0]);
    R.add('wristR', 'glow', OCTA, 0x9affc0, [0, 0, 0.45], [0.025, 0.025, 0.05]);
    return heroFinish(R, 'hero|Archer|' + hair + '|' + skin, 'Archer', { height: 2.0 }, 'wristL', 'blade', -0.45, -0.1);
  }

  // ---------------- PALADIN : armure argent/or, bouclier, épée sacrée, halo ----------------
  function buildPaladin(opts) {
    opts = opts || {};
    const skin = opts.skin != null ? opts.skin : 0xffd2a8;
    const hair = opts.hair != null ? opts.hair : 0xf3d77a;
    const P = { silver: 0xdfe6f2, silverD: 0x9aa6bd, gold: 0xffc933, blue: 0x2d5fd1, blueD: 0x1f3d8a, cloth: 0x26325c, boot: 0x8a95aa, sleeve: 0xb7c2d8, bracer: 0xffc933, glove: 0xdfe6f2 };
    const R = new Rig(); heroSkeleton(R); heroLegs(R, P); heroArms(R, P);
    heroFace(R, skin, shade(hair, -0.2), {});
    // casque ouvert + crête ailée + halo
    R.add('head', 'solid', SPH, hair, [0, 0.0, -0.12], [0.4, 0.36, 0.3]);
    bangs(R, hair, shade(hair, -0.2), 0.17, 0.36);
    R.add('head', 'solid', HEMI, P.silver, [0, 0.1, -0.02], [0.44, 0.38, 0.44], [-0.3, 0, 0]);
    R.add('head', 'solid', CYL, P.gold, [0, 0.2, 0.03], [0.45, 0.04, 0.45], [-0.3, 0, 0]);
    R.add('head', 'solid', BOX, P.silver, [0.4, 0.0, 0.05], [0.05, 0.22, 0.14]);
    R.add('head', 'solid', BOX, P.silver, [-0.4, 0.0, 0.05], [0.05, 0.22, 0.14]);
    for (const [, sx] of SIDES) {
      R.add('head', 'solid', CONE, P.gold, [sx * 0.46, 0.22, -0.02], [0.05, 0.34, 0.03], [0, 0, -sx * 0.9]);
      R.add('head', 'solid', CONE, P.gold, [sx * 0.52, 0.12, -0.02], [0.04, 0.26, 0.03], [0, 0, -sx * 1.25]);
    }
    R.add('head', 'glow', SPH, 0xfff2b0, [0, 0.22, 0.4], [0.05, 0.05, 0.03]);
    R.add('head', 'glow', torus(0.07), 0xffe58a, [0, 0.66, -0.04], [0.3, 0.3, 0.3], [HPI, 0, 0]);
    // armure
    R.add('body', 'solid', cylT(0.85), P.silver, [0, 0.27, 0], [0.32, 0.54, 0.28]);
    R.add('body', 'solid', SPH, shade(P.silver, 0.2), [0, 0.33, 0.17], [0.24, 0.2, 0.12]);
    R.add('body', 'solid', BOX, P.gold, [0, 0.36, 0.28], [0.05, 0.22, 0.03], null, false);
    R.add('body', 'solid', BOX, P.gold, [0, 0.4, 0.28], [0.16, 0.05, 0.03], null, false);
    R.add('body', 'solid', CYL, 0x5a3a1e, [0, 0.06, 0], [0.335, 0.09, 0.295]);
    R.add('body', 'solid', BOX, P.gold, [0, 0.06, 0.295], [0.1, 0.08, 0.03]);
    R.add('body', 'solid', cylT(0.9), P.blueD, [0, -0.04, 0], [0.34, 0.14, 0.3]);
    R.add('body', 'solid', BOX, P.blue, [0, -0.17, 0.27], [0.26, 0.5, 0.03], [-0.08, 0, 0]);
    R.add('body', 'solid', BOX, P.gold, [0, -0.17, 0.29], [0.04, 0.46, 0.015], [-0.08, 0, 0], false);
    R.add('body', 'solid', torus(0.38), P.gold, [0, 0.55, 0], [0.24, 0.23, 0.22], [HPI, 0, 0]);
    // cape (couche double face)
    R.add('body', 'cape', CAPE, P.blue, [0, 0.12, -0.04], [0.36, 0.95, 0.33]);
    // épaulières
    for (const [s, sx] of SIDES) {
      R.add('arm' + s, 'solid', SPH, P.silver, [sx * 0.03, 0.03, 0], [0.19, 0.15, 0.19]);
      R.add('arm' + s, 'solid', CYL, P.gold, [sx * 0.03, -0.04, 0], [0.192, 0.035, 0.192]);
    }
    // bouclier rond (os du bras gauche)
    R.add('armL', 'solid', CYL, P.blueD, [0.1, -0.3, 0.22], [0.31, 0.06, 0.31], [HPI, 0, 0]);
    R.add('armL', 'solid', torus(0.11), P.gold, [0.1, -0.3, 0.255], [0.31, 0.31, 0.31]);
    R.add('armL', 'solid', BOX, P.gold, [0.1, -0.3, 0.27], [0.07, 0.42, 0.02], null, false);
    R.add('armL', 'solid', BOX, P.gold, [0.1, -0.26, 0.27], [0.3, 0.07, 0.02], null, false);
    R.add('armL', 'glow', SPH, 0xfff2b0, [0.1, -0.26, 0.29], 0.05);
    // épée sacrée
    R.add('wristR', 'solid', CYL8, 0x5a3a1e, [0, 0, -0.02], [0.035, 0.2, 0.035], [HPI, 0, 0]);
    R.add('wristR', 'solid', SPH, P.gold, [0, 0, -0.13], 0.05);
    R.add('wristR', 'solid', BOX, P.gold, [0, 0, 0.09], [0.34, 0.06, 0.07]);
    R.add('wristR', 'blade', BOX, 0xfff6d6, [0, 0, 0.5], [0.1, 0.035, 0.78]);
    R.add('wristR', 'blade', CONE4, 0xfff6d6, [0, 0, 0.95], [0.05, 0.14, 0.0175], [HPI, 0, 0]);
    R.add('wristR', 'glow', BOX, 0xffe58a, [0, 0.02, 0.48], [0.02, 0.006, 0.66], null, false);
    return heroFinish(R, 'hero|Paladin|' + hair + '|' + skin, 'Paladin', { height: 2.05 }, 'wristR', 'blade', -0.5, 0, { bladeEmissive: 0x4a3a10, auraOpacity: 0.5 });
  }

  // ---------------- ÉLÉMENTALISTE : robe indigo, orbes glace/foudre, bâton cristal ----------------
  function buildElementaliste(opts) {
    opts = opts || {};
    const skin = opts.skin != null ? opts.skin : 0xffd9bd;
    const hair = opts.hair != null ? opts.hair : 0xcfe9ff;
    const P = { main: 0x2c3c86, mainD: 0x1b2558, ice: 0x8fe8ff, bolt: 0xffe14d, trim: 0xdfe8ff, cloth: 0x1b2558, boot: 0x2a3366, sleeve: 0x2c3c86, bracer: 0x8fe8ff, glove: 0xffd9bd };
    const R = new Rig(); heroSkeleton(R); heroLegs(R, P);
    // bras à manches larges
    for (const [s] of SIDES) {
      const b = 'arm' + s;
      R.add(b, 'solid', cylT(0.55), P.sleeve, [0, -0.2, 0], [0.14, 0.4, 0.14]);
      R.add(b, 'solid', torus(0.2), s === 'L' ? P.ice : P.bolt, [0, -0.39, 0], [0.135, 0.135, 0.3], [HPI, 0, 0]);
      R.add(b, 'solid', SPH, P.glove, [0, -0.42, 0.01], 0.085);
    }
    heroFace(R, skin, shade(hair, -0.4), {});
    // cheveux blanc-bleu en pointes
    R.add('head', 'solid', HEMI, hair, [0, 0.07, -0.02], [0.43, 0.42, 0.43], [-0.28, 0, 0]);
    R.add('head', 'solid', SPH, hair, [0, 0.0, -0.12], [0.4, 0.36, 0.3]);
    bangs(R, hair, shade(hair, -0.2), 0.17, 0.36);
    R.add('head', 'solid', CONE, hair, [0, 0.47, -0.05], [0.1, 0.28, 0.1], [-0.5, 0, 0]);
    R.add('head', 'solid', CONE, P.ice, [0.17, 0.42, 0.0], [0.08, 0.26, 0.08], [-0.2, 0, -0.55]);
    R.add('head', 'solid', CONE, P.bolt, [-0.17, 0.42, 0.0], [0.08, 0.26, 0.08], [-0.2, 0, 0.55]);
    // diadème à gemme
    R.add('head', 'solid', torus(0.07), 0xdfe8ff, [0, 0.19, 0.0], [0.4, 0.4, 0.4], [HPI - 0.12, 0, 0]);
    R.add('head', 'glow', OCTA, P.ice, [0, 0.2, 0.395], [0.05, 0.07, 0.03]);
    // robe
    R.add('body', 'solid', cylT(0.8), P.main, [0, 0.27, 0], [0.3, 0.54, 0.27]);
    R.add('body', 'solid', cylT(0.62), P.main, [0, -0.2, 0], [0.48, 0.5, 0.44]);
    R.add('body', 'solid', torus(0.18), P.trim, [0, -0.43, 0], [0.48, 0.44, 0.3], [HPI, 0, 0]);
    R.add('body', 'solid', BOX, P.ice, [-0.12, -0.15, 0.33], [0.07, 0.5, 0.03], [-0.37, 0, 0], false);
    R.add('body', 'solid', BOX, P.bolt, [0.12, -0.15, 0.33], [0.07, 0.5, 0.03], [-0.37, 0, 0], false);
    R.add('body', 'solid', CYL, P.trim, [0, 0.06, 0], [0.31, 0.07, 0.28]);
    R.add('body', 'solid', cylT(1.3), P.mainD, [0, 0.56, 0], [0.2, 0.1, 0.2]);
    R.add('body', 'glow', OCTA, P.ice, [-0.06, 0.4, 0.27], [0.04, 0.06, 0.03]);
    R.add('body', 'glow', OCTA, P.bolt, [0.06, 0.4, 0.27], [0.04, 0.06, 0.03]);
    // épaulettes : cristaux de glace à gauche, éclair à droite
    for (let k = 0; k < 3; k++) R.add('armL', 'solid', CONE, 0xbdf1ff, [0.02 + k * 0.05, 0.1 + (k === 1 ? 0.06 : 0), (k - 1) * 0.07], [0.05, 0.2 - k * 0.03, 0.05], [0, 0, -0.5 + k * 0.3]);
    R.add('armR', 'glow', BOX, P.bolt, [-0.02, 0.15, 0.0], [0.04, 0.12, 0.04], [0, 0, 0.5]);
    R.add('armR', 'glow', BOX, P.bolt, [-0.06, 0.07, 0.0], [0.04, 0.12, 0.04], [0, 0, -0.5]);
    R.add('armR', 'glow', BOX, P.bolt, [-0.02, 0.0, 0.0], [0.04, 0.12, 0.04], [0, 0, 0.5]);
    // orbes en orbite (os 'orbs' tournant)
    R.bone('orbs', 'body', 0, 0.62, 0);
    R.add('orbs', 'glow', ICO, P.ice, [0.62, 0.0, 0], [0.12, 0.12, 0.12]);
    R.add('orbs', 'aura', ICO, P.ice, [0.62, 0.0, 0], [0.2, 0.2, 0.2]);
    R.add('orbs', 'glow', OCTA, P.bolt, [-0.62, 0.0, 0], [0.11, 0.15, 0.11]);
    R.add('orbs', 'aura', OCTA, P.bolt, [-0.62, 0.0, 0], [0.19, 0.24, 0.19]);
    R.fx((t, B) => { if (B.orbs) { B.orbs.rotation.y = t * 1.6; B.orbs.position.y = 0.62 + Math.sin(t * 2.1) * 0.06; } });
    // bâton à cristaux jumeaux
    R.add('wristR', 'solid', CYL8, 0x6a7ac0, [0, 0, 0.2], [0.035, 1.3, 0.035], [HPI, 0, 0]);
    R.add('wristR', 'solid', torus(0.1), P.trim, [0, 0, 0.84], [0.1, 0.1, 0.1]);
    R.add('wristR', 'solid', SPHLO, P.trim, [0, 0, -0.45], 0.05);
    R.add('wristR', 'blade', ICO, P.ice, [0.0, 0.05, 0.98], [0.1, 0.1, 0.16], [0, 0, 0.3]);
    R.add('wristR', 'glow', OCTA, P.bolt, [0.0, -0.09, 0.9], [0.05, 0.05, 0.1]);
    return heroFinish(R, 'hero|Elementaliste|' + hair + '|' + skin, 'Mage', { height: 2.2 }, 'wristR', 'blade', -1.47, 0, { bladeEmissive: 0x2a8fff });
  }

  // ---------------- NÉCROMANCIEN : robe noire/violette, capuche, faux, grimoire, flammes d'ombre ----------------
  function buildNecromancien(opts) {
    opts = opts || {};
    const P = { main: 0x15101f, mainD: 0x0b0812, violet: 0x7a35e0, violetL: 0xb56bff, bone: 0xe8e0cf, cloth: 0x100c19, boot: 0x1a1426, sleeve: 0x15101f, bracer: 0x7a35e0, glove: 0x241a38 };
    const R = new Rig(); heroSkeleton(R); heroLegs(R, P); heroArms(R, P);
    // visage dans l'ombre de la capuche : vide sombre + yeux violets
    R.add('head', 'solid', SPH, 0xcdbfd9, [0, 0.05, 0], [0.4, 0.38, 0.38]);
    R.add('head', 'solid', SPH, 0x0a0710, [0, 0.03, 0.1], [0.36, 0.34, 0.3]);
    for (const [, sx] of SIDES) {
      R.add('head', 'eyes', SPHLO, P.violetL, [sx * 0.13, 0.06, 0.34], [0.065, 0.045, 0.03]);
      R.add('head', 'glow', SPHLO, 0xffffff, [sx * 0.13, 0.06, 0.37], [0.02, 0.016, 0.01]);
    }
    R.add('body', 'solid', CYL, 0xcdbfd9, [0, 0.6, 0], [0.1, 0.12, 0.1]);
    // capuche profonde
    R.add('head', 'solid', HEMI, P.main, [0, 0.06, -0.02], [0.5, 0.5, 0.5], [-0.35, 0, 0]);
    R.add('head', 'solid', SPH, P.main, [0, -0.03, -0.14], [0.46, 0.46, 0.38]);
    R.add('head', 'solid', torus(0.13), P.violet, [0, 0.07, 0.05], [0.44, 0.44, 0.44], [-HPI - 0.35, 0, 0]);
    R.add('head', 'solid', CONE, P.main, [0, 0.12, -0.46], [0.16, 0.42, 0.16], [-2.0, 0, 0]);
    R.add('head', 'solid', CONE, P.violet, [0.2, 0.38, 0.0], [0.05, 0.24, 0.05], [0, 0, -0.5]);
    R.add('head', 'solid', CONE, P.violet, [-0.2, 0.38, 0.0], [0.05, 0.24, 0.05], [0, 0, 0.5]);
    // robe effilochée
    R.add('body', 'solid', cylT(0.8), P.main, [0, 0.27, 0], [0.31, 0.54, 0.28]);
    R.add('body', 'solid', ROBE, P.main, [0, -0.2, 0], [0.5, 0.52, 0.46]);
    R.add('body', 'solid', torus(0.16), P.violet, [0, -0.45, 0], [0.5, 0.46, 0.3], [HPI, 0, 0]);
    R.add('body', 'solid', BOX, P.violet, [0, -0.15, 0.34], [0.07, 0.5, 0.03], [-0.37, 0, 0], false);
    R.add('body', 'solid', CYL, 0x2a1d44, [0, 0.06, 0], [0.32, 0.07, 0.29]);
    R.add('body', 'solid', SPH, P.bone, [0, 0.06, 0.3], [0.085, 0.1, 0.07]);
    R.add('body', 'solid', SPHLO, 0x0a0710, [0.025, 0.075, 0.355], [0.02, 0.025, 0.012], null, false);
    R.add('body', 'solid', SPHLO, 0x0a0710, [-0.025, 0.075, 0.355], [0.02, 0.025, 0.012], null, false);
    R.add('body', 'solid', cylT(1.3), P.mainD, [0, 0.56, 0], [0.21, 0.1, 0.21]);
    R.add('body', 'glow', OCTA, P.violetL, [0, 0.4, 0.27], [0.05, 0.07, 0.03]);
    // épaulières à pointes
    for (const [s, sx] of SIDES) {
      R.add('arm' + s, 'solid', SPH, P.mainD, [sx * 0.03, 0.03, 0], [0.17, 0.13, 0.17]);
      R.add('arm' + s, 'solid', CONE, P.violet, [sx * 0.12, 0.12, 0], [0.05, 0.22, 0.05], [0, 0, -sx * 1.0]);
    }
    // cape en lambeaux
    R.add('body', 'cape', CAPE, 0x1c1430, [0, 0.12, -0.04], [0.38, 0.98, 0.34]);
    // faux (manche le long de Z, relevé par wristRest) : lame courbe vers l'avant
    R.add('wristR', 'solid', CYL8, 0x3a2a55, [0, 0, 0.2], [0.035, 1.3, 0.035], [HPI, 0, 0]);
    R.add('wristR', 'solid', SPHLO, P.violet, [0, 0, -0.45], 0.05);
    R.add('wristR', 'solid', BOX, P.mainD, [0, 0, 0.86], [0.07, 0.07, 0.12]);
    const BL = [[0, 0.04, 0.9], [0, -0.1, 1.0], [0, -0.26, 1.03], [0, -0.42, 0.97], [0, -0.55, 0.85], [0, -0.63, 0.7]];
    for (let i = 0; i < BL.length - 1; i++) {
      const w = 0.075 - i * 0.008;
      R.seg('wristR', 'blade', BOX, 0xcdbcff, BL[i], BL[i + 1], 0.03, w * 2, true);
    }
    R.add('wristR', 'glow', SPHLO, P.violetL, [0, -0.3, 1.02], 0.025);
    // grimoire flottant (os 'book')
    R.bone('book', 'body', 0.62, 0.15, 0.32);
    R.add('book', 'solid', BOX, 0x4a1f8c, [0, 0, 0], [0.26, 0.32, 0.07]);
    R.add('book', 'solid', BOX, P.bone, [0, 0, 0.037], [0.22, 0.28, 0.012], null, false);
    R.add('book', 'glow', BOX, P.violetL, [0, 0.0, 0.045], [0.12, 0.14, 0.006], null, false);
    R.add('book', 'aura', SPH, P.violet, [0, 0, 0], [0.28, 0.3, 0.14]);
    R.fx((t, B) => { if (B.book) { B.book.position.y = 0.15 + Math.sin(t * 2.0) * 0.07; B.book.rotation.y = -0.5 + Math.sin(t * 1.1) * 0.25; B.book.rotation.z = Math.sin(t * 1.6) * 0.1; } });
    // flammes d'ombre autour des pieds et épaules
    R.bone('flames', 'root', 0, 0.05, 0);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, rr = 0.55 + (k % 2) * 0.12;
      R.add('flames', 'aura', CONE, k % 2 ? P.violet : 0x4a1f8c, [Math.cos(a) * rr, 0.22 + (k % 3) * 0.06, Math.sin(a) * rr], [0.1, 0.5 + (k % 3) * 0.14, 0.1]);
    }
    R.fx((t, B) => {
      if (!B.flames) return;
      B.flames.rotation.y = t * 0.5;
      const s = 1 + Math.sin(t * 9) * 0.1 + Math.sin(t * 5.3) * 0.08;
      B.flames.scale.set(1, s, 1);
    });
    // transformation « Souverain des Ombres » : couronne, ailes d'ombre, grande aura (masquée par défaut)
    R.bone('sov', 'body', 0, 0, 0);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU;
      R.add('sov', 'glow', CONE, 0xd9b8ff, [Math.cos(a) * 0.3, 1.3 + (k % 2) * 0.06, Math.sin(a) * 0.3 - 0.02], [0.05, 0.22 + (k % 2) * 0.08, 0.05]);
    }
    R.add('sov', 'glow', torus(0.05), P.violetL, [0, 1.22, -0.02], [0.32, 0.32, 0.32], [HPI, 0, 0]);
    R.add('sov', 'aura', SPH, 0x5a1fc4, [0, 0.4, 0], [0.9, 1.1, 0.9]);
    R.add('sov', 'aura', torus(0.05), P.violetL, [0, 0.1, 0], [0.95, 0.95, 0.95], [HPI, 0, 0]);
    for (const [, sx] of SIDES) {
      for (let k = 0; k < 3; k++) {
        R.add('sov', 'solid', CONE, 0x1b1030, [sx * (0.5 + k * 0.28), 0.62 + k * 0.1, -0.3], [0.08, 0.7 - k * 0.12, 0.05], [0.5, 0, -sx * (1.15 + k * 0.2)]);
      }
    }
    R.fx((t, B) => { if (B.sov && B.sov.visible) { B.sov.rotation.y = Math.sin(t * 0.8) * 0.06; const s = 1 + Math.sin(t * 6) * 0.04; B.sov.scale.set(s, 1, s); } });
    const root = heroFinish(R, 'hero|Necromancien', 'Mage', { height: 2.1 }, 'wristR', 'blade', -1.45, 0, { bladeEmissive: 0x3a1a88, eyeColor: P.violetL });
    R.bones.sov.visible = false;
    root.userData.sovereign = R.bones.sov;
    root.userData.auraColor = P.violet;
    return root;
  }

  // ==================================================================
  // SERVITEURS D'OMBRE (kind 'minion')
  // ==================================================================
  const SH = { body: 0x160d27, mid: 0x261445, light: 0x3f2478, edge: 0x5d37a8, bone: 0xcfc6e4 };
  const RANK_SCALE = [0.88, 0.94, 1.0, 1.07, 1.14, 1.22];

  function minionSkeleton(R) { heroSkeleton(R); }
  function sLegs(R, o) {
    o = o || {};
    for (const [s] of SIDES) {
      const b = 'leg' + s, w = o.w || 0.11;
      R.add(b, 'solid', CYL, SH.mid, [0, -0.2, 0], [w, 0.42, w]);
      R.add(b, 'solid', SPH, SH.body, [0, -0.53, 0.04], [w + 0.02, 0.1, w + 0.07]);
    }
  }
  function sArms(R, o) {
    o = o || {};
    for (const [s] of SIDES) {
      const b = 'arm' + s, w = o.w || 0.085;
      R.add(b, 'solid', CYL, SH.mid, [0, -0.17, 0], [w, 0.36, w]);
      R.add(b, 'solid', SPH, SH.body, [0, -0.4, 0.01], w + 0.02);
    }
  }
  function sHead(R, o) {
    o = o || {};
    R.add('head', 'solid', SPH, SH.body, [0, 0.05, 0], [0.4, 0.38, 0.38]);
    for (const [, sx] of SIDES) {
      R.add('head', 'eyes', SPHLO, 0xffffff, [sx * 0.14, 0.07, 0.34], [0.075, 0.05, 0.03]);
      R.add('head', 'glow', SPHLO, o.eye, [sx * 0.14, 0.07, 0.36], [0.09, 0.062, 0.03]);
    }
    R.add('body', 'solid', CYL, SH.body, [0, 0.6, 0], [0.1, 0.12, 0.1]);
  }
  // volutes d'ombre sous le corps (aura additive, jamais de contour)
  function wisps(R, bone, y, n, r, h, color) {
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + 0.3;
      R.add(bone, 'aura', CONE, color, [Math.cos(a) * r, y, Math.sin(a) * r], [0.09, h * (0.7 + (k % 3) * 0.2), 0.09], [PI, 0, 0]);
    }
  }
  // décorations de rang (E→S)
  function rankDeco(R, ri, o) {
    o = o || {};
    const top = o.top != null ? o.top : 0.42, sh = o.shoulder != null ? o.shoulder : 0.4;
    const col = RANK_COLORS[ri];
    if (ri >= 1) for (const [s, sx] of SIDES) R.add('arm' + s, 'solid', CONE, SH.edge, [sx * 0.08, 0.14, 0], [0.05, 0.2 + ri * 0.02, 0.05], [0, 0, -sx * 0.7]);
    if (ri >= 2) {
      R.add('head', 'solid', CONE, SH.light, [0.22, top, 0.0], [0.06, 0.3, 0.06], [0, 0, -0.45]);
      R.add('head', 'solid', CONE, SH.light, [-0.22, top, 0.0], [0.06, 0.3, 0.06], [0, 0, 0.45]);
    }
    if (ri >= 3) { // anneau runique
      R.bone('rune', 'body', 0, sh, 0);
      R.add('rune', 'glow', torus(0.035), col, [0, 0, 0], [0.55, 0.55, 0.55], [HPI, 0, 0]);
      for (let k = 0; k < 4; k++) { const a = k * HPI; R.add('rune', 'glow', BOX, col, [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [0.07, 0.07, 0.07]); }
      R.fx((t, B) => { if (B.rune) { B.rune.rotation.y = t * 1.4; B.rune.position.y = sh + Math.sin(t * 2) * 0.04; } });
    }
    if (ri >= 4) { // couronne de flammes
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; R.add('head', 'aura', CONE, col, [Math.cos(a) * 0.26, top + 0.1, Math.sin(a) * 0.26], [0.06, 0.28, 0.06]); }
    }
    if (ri >= 5) { // grande aura
      R.add('body', 'aura', SPH, col, [0, 0.2, 0], [0.7, 1.2, 0.7]);
    }
  }
  function rarityDeco(R, rarity, o) {
    o = o || {};
    if (rarity === 'rare') R.add('body', 'aura', torus(0.04), 0x6fa8ff, [0, 0.1, 0], [0.62, 0.62, 0.62], [HPI, 0, 0]);
    if (rarity === 'legendaire') {
      R.add('body', 'aura', torus(0.05), 0xffc233, [0, 0.1, 0], [0.75, 0.75, 0.75], [HPI, 0, 0]);
      R.add('head', 'glow', torus(0.04), 0xffd04a, [0, (o.top || 0.42) + 0.12, 0], [0.26, 0.26, 0.26], [HPI, 0, 0]);
    }
  }

  // construit un minion : fn(R, ctx{ri, eye, rarity}) remplit le squelette et renvoie {height, scale, anim, float, baseY}
  function minionBuilder(id, fn) {
    return function (opts) {
      opts = opts || {};
      const ri = rankIdx(opts.rank), rarity = opts.rarity || 'commun';
      const eye = opts.eyeColor != null ? opts.eyeColor : RANK_COLORS[ri];
      const R = new Rig();
      const info = fn(R, { ri, eye, rarity, opts }) || {};
      const asm = assemble(R, 'minion|' + id + '|' + ri + '|' + rarity + '|' + eye, { outline: info.outline != null ? info.outline : 0.03, eyeColor: 0xffffff, auraOpacity: 0.42, transOpacity: 0.8 });
      const sc = (info.scale || 1) * RANK_SCALE[ri] * (opts.scale || 1);
      if (R.bones.wristR) R.bones.wristR.rotation.x = info.wristR || 0;
      if (R.bones.wristL) R.bones.wristL.rotation.x = info.wristL || 0;
      finish(R, asm, { height: info.height || 1.8, radius: info.radius || 0.5, walkSpeed: info.walkSpeed || 9, scale: sc, baseY: info.baseY || 0, float: info.float }, 'minion');
      const ud = R.root.userData;
      ud.anim = info.anim || 'humanoid';
      ud.minionId = id; ud.rank = RANK_IDS[ri]; ud.rarity = rarity;
      ud.rest.wristR = [info.wristR || 0, 0, 0]; ud.rest.wristL = [info.wristL || 0, 0, 0];
      ud.blade = null;
      return R.root;
    };
  }

  // --- guerrier d'ombre : épée + écu
  const buildGuerrier = minionBuilder('ombre_guerrier', (R, c) => {
    minionSkeleton(R); sLegs(R); sArms(R); sHead(R, { eye: c.eye });
    R.add('head', 'solid', HEMI, SH.mid, [0, 0.1, -0.02], [0.43, 0.36, 0.43], [-0.2, 0, 0]);
    R.add('head', 'solid', BOX, SH.body, [0, 0.0, 0.3], [0.06, 0.2, 0.12]);
    R.add('body', 'solid', cylT(0.85), SH.mid, [0, 0.27, 0], [0.31, 0.54, 0.27]);
    R.add('body', 'solid', SPH, SH.light, [0, 0.33, 0.17], [0.23, 0.18, 0.1]);
    R.add('body', 'solid', cylT(0.9), SH.body, [0, -0.02, 0], [0.33, 0.16, 0.29]);
    R.add('wristR', 'solid', CYL8, SH.body, [0, 0, -0.02], [0.035, 0.18, 0.035], [HPI, 0, 0]);
    R.add('wristR', 'solid', BOX, SH.edge, [0, 0, 0.09], [0.26, 0.05, 0.06]);
    R.add('wristR', 'blade', BOX, SH.light, [0, 0, 0.45], [0.09, 0.03, 0.66]);
    R.add('wristR', 'blade', CONE4, SH.light, [0, 0, 0.84], [0.045, 0.12, 0.015], [HPI, 0, 0]);
    R.add('wristR', 'glow', BOX, c.eye, [0, 0.018, 0.43], [0.018, 0.006, 0.55], null, false);
    R.add('armL', 'solid', CYL, SH.light, [0.08, -0.3, 0.17], [0.24, 0.05, 0.24], [HPI, 0, 0]);
    R.add('armL', 'solid', torus(0.1), SH.edge, [0.08, -0.3, 0.2], [0.24, 0.24, 0.24]);
    wisps(R, 'body', -0.2, 7, 0.28, 0.6, SH.light);
    rankDeco(R, c.ri); rarityDeco(R, c.rarity);
    return { height: 1.9, wristR: -0.5, scale: 1 };
  });

  // --- archer d'ombre : capuche, arc spectral
  const buildArcherO = minionBuilder('ombre_archer', (R, c) => {
    minionSkeleton(R); sLegs(R, { w: 0.095 }); sArms(R, { w: 0.075 }); sHead(R, { eye: c.eye });
    R.add('head', 'solid', HEMI, SH.mid, [0, 0.08, -0.03], [0.46, 0.45, 0.46], [-0.4, 0, 0]);
    R.add('head', 'solid', CONE, SH.mid, [0, 0.2, -0.42], [0.11, 0.34, 0.11], [-1.9, 0, 0]);
    R.add('body', 'solid', cylT(0.8), SH.mid, [0, 0.27, 0], [0.28, 0.54, 0.25]);
    R.add('body', 'solid', BOX, SH.light, [0, 0.3, 0.24], [0.06, 0.55, 0.03], [0, 0, 0.7], false);
    R.add('body', 'solid', CYL, SH.body, [-0.1, 0.33, -0.32], [0.09, 0.5, 0.09], [0.18, 0, 0.3]);
    R.add('body', 'glow', OCTA, c.eye, [-0.2, 0.62, -0.34], [0.03, 0.05, 0.03]);
    R.add('wristL', 'blade', torus(0.05, 2.2), SH.light, [0, 0, -0.3], [0.58, 0.58, 0.58], [0, -HPI, -1.1]);
    R.add('wristL', 'glow', BOX, c.eye, [0, 0, -0.04], [0.008, 1.0, 0.008], null, false);
    wisps(R, 'body', -0.22, 6, 0.24, 0.55, SH.light);
    rankDeco(R, c.ri); rarityDeco(R, c.rarity);
    return { height: 1.9, wristL: -0.1, wristR: -0.3, scale: 0.95, walkSpeed: 10 };
  });

  // --- mage d'ombre : flottant, grand chapeau pointu, orbe
  const buildMageO = minionBuilder('ombre_mage', (R, c) => {
    minionSkeleton(R); sArms(R, { w: 0.09 }); sHead(R, { eye: c.eye });
    R.add('head', 'solid', CYL, SH.body, [0, 0.3, 0], [0.52, 0.04, 0.52], [-0.12, 0, 0]);
    R.add('head', 'solid', cylT(0.5), SH.mid, [0, 0.52, -0.02], [0.34, 0.46, 0.34], [-0.12, 0, 0]);
    R.add('head', 'solid', CONE, SH.mid, [0, 0.9, -0.18], [0.2, 0.4, 0.2], [-0.7, 0, 0]);
    R.add('body', 'solid', cylT(0.8), SH.mid, [0, 0.27, 0], [0.3, 0.54, 0.27]);
    R.add('body', 'solid', ROBE, SH.mid, [0, -0.18, 0], [0.48, 0.58, 0.44]);
    R.add('body', 'solid', torus(0.15), SH.edge, [0, -0.44, 0], [0.48, 0.44, 0.3], [HPI, 0, 0]);
    R.add('wristR', 'solid', CYL8, SH.body, [0, 0, 0.2], [0.03, 1.1, 0.03], [HPI, 0, 0]);
    R.add('wristR', 'glow', SPH, c.eye, [0, 0, 0.8], 0.1);
    R.add('wristR', 'aura', SPH, c.eye, [0, 0, 0.8], 0.18);
    wisps(R, 'body', -0.5, 8, 0.22, 0.6, SH.edge);
    rankDeco(R, c.ri, { top: 0.55, shoulder: 0.3 }); rarityDeco(R, c.rarity, { top: 0.8 });
    return { height: 2.2, wristR: -1.4, anim: 'wraith', float: true, baseY: 0.35, scale: 0.95 };
  });

  // --- colosse : massif, poings énormes
  const buildColosse = minionBuilder('ombre_colosse', (R, c) => {
    minionSkeleton(R);
    for (const [s] of SIDES) {
      R.add('leg' + s, 'solid', CYL, SH.mid, [0, -0.2, 0], [0.16, 0.42, 0.16]);
      R.add('leg' + s, 'solid', SPH, SH.body, [0, -0.53, 0.05], [0.18, 0.11, 0.24]);
    }
    for (const [s, sx] of SIDES) {
      R.add('arm' + s, 'solid', CYL, SH.mid, [0, -0.2, 0], [0.14, 0.42, 0.14]);
      R.add('arm' + s, 'solid', SPH, SH.light, [sx * 0.03, 0.04, 0], [0.24, 0.2, 0.24]);
      R.add('arm' + s, 'solid', SPH, SH.body, [0, -0.46, 0.02], [0.17, 0.17, 0.17]);
      for (let k = 0; k < 3; k++) R.add('arm' + s, 'solid', CONE, SH.edge, [sx * 0.03 + (k - 1) * 0.09, 0.2, 0], [0.05, 0.2, 0.05]);
    }
    R.add('head', 'solid', SPH, SH.body, [0, 0.0, 0], [0.34, 0.32, 0.34]);
    for (const [, sx] of SIDES) {
      R.add('head', 'eyes', SPHLO, 0xffffff, [sx * 0.12, 0.03, 0.29], [0.07, 0.04, 0.03]);
      R.add('head', 'glow', SPHLO, c.eye, [sx * 0.12, 0.03, 0.31], [0.085, 0.05, 0.03]);
      R.add('head', 'solid', CONE, SH.edge, [sx * 0.2, 0.28, 0], [0.07, 0.3, 0.07], [0, 0, -sx * 0.4]);
    }
    R.add('body', 'solid', CYL, SH.body, [0, 0.52, 0], [0.12, 0.1, 0.12]);
    R.add('body', 'solid', cylT(1.0), SH.mid, [0, 0.26, 0], [0.42, 0.62, 0.36]);
    R.add('body', 'solid', SPH, SH.light, [0, 0.34, 0.2], [0.3, 0.22, 0.12]);
    R.add('body', 'glow', OCTA, c.eye, [0, 0.34, 0.31], [0.06, 0.09, 0.04]);
    R.add('body', 'solid', cylT(0.95), SH.body, [0, -0.04, 0], [0.43, 0.2, 0.37]);
    wisps(R, 'body', -0.14, 8, 0.36, 0.55, SH.light);
    rankDeco(R, c.ri, { top: 0.4, shoulder: 0.35 }); rarityDeco(R, c.rarity, { top: 0.4 });
    return { height: 1.7, scale: 1.45, anim: 'knight', walkSpeed: 7, radius: 0.55 };
  });

  // --- chevalier : heaume, grande épée, bouclier-tour
  const buildChevalier = minionBuilder('ombre_chevalier', (R, c) => {
    minionSkeleton(R); sLegs(R, { w: 0.12 }); sArms(R, { w: 0.095 }); sHead(R, { eye: c.eye });
    R.add('head', 'solid', cylT(0.95), SH.light, [0, 0.07, -0.01], [0.43, 0.56, 0.43]);
    R.add('head', 'solid', BOX, SH.body, [0, 0.07, 0.32], [0.34, 0.07, 0.1], null, false);
    R.add('head', 'glow', BOX, c.eye, [0, 0.07, 0.375], [0.28, 0.03, 0.02], null, false);
    R.add('head', 'solid', CONE, SH.edge, [0, 0.58, -0.04], [0.06, 0.3, 0.2], [-0.15, 0, 0]);
    R.add('body', 'solid', cylT(0.9), SH.light, [0, 0.27, 0], [0.34, 0.54, 0.3]);
    R.add('body', 'solid', SPH, SH.edge, [0, 0.33, 0.19], [0.24, 0.19, 0.11]);
    R.add('body', 'solid', cylT(0.9), SH.body, [0, -0.04, 0], [0.36, 0.2, 0.32]);
    R.add('body', 'solid', BOX, SH.mid, [0, -0.2, 0.28], [0.3, 0.5, 0.04], [-0.06, 0, 0]);
    for (const [s, sx] of SIDES) {
      R.add('arm' + s, 'solid', SPH, SH.light, [sx * 0.03, 0.03, 0], [0.2, 0.16, 0.2]);
      R.add('arm' + s, 'solid', CONE, SH.edge, [sx * 0.1, 0.14, 0], [0.04, 0.2, 0.04], [0, 0, -sx * 0.9]);
    }
    R.add('body', 'cape', CAPE, SH.body, [0, 0.1, -0.04], [0.36, 0.95, 0.33]);
    R.add('wristR', 'solid', CYL8, SH.body, [0, 0, -0.02], [0.035, 0.2, 0.035], [HPI, 0, 0]);
    R.add('wristR', 'solid', BOX, SH.edge, [0, 0, 0.1], [0.36, 0.06, 0.07]);
    R.add('wristR', 'blade', BOX, SH.edge, [0, 0, 0.58], [0.12, 0.035, 0.9]);
    R.add('wristR', 'blade', CONE4, SH.edge, [0, 0, 1.13], [0.06, 0.15, 0.02], [HPI, 0, 0]);
    R.add('wristR', 'glow', BOX, c.eye, [0, 0.02, 0.56], [0.02, 0.006, 0.78], null, false);
    R.add('armL', 'solid', BOX, SH.light, [0.1, -0.28, 0.2], [0.34, 0.5, 0.05]);
    R.add('armL', 'solid', BOX, SH.edge, [0.1, -0.28, 0.23], [0.06, 0.42, 0.02], null, false);
    R.add('armL', 'glow', SPH, c.eye, [0.1, -0.24, 0.26], 0.04);
    wisps(R, 'body', -0.18, 7, 0.3, 0.55, SH.light);
    rankDeco(R, c.ri, { top: 0.5 }); rarityDeco(R, c.rarity, { top: 0.55 });
    return { height: 2.0, wristR: -0.45, scale: 1.05, anim: 'knight', walkSpeed: 8 };
  });

  // --- bête d'ombre : quadrupède (les « bras » sont les pattes avant)
  const buildBete = minionBuilder('ombre_bete', (R, c) => {
    R.bone('legL', 'root', 0.16, 0.5, -0.38); R.bone('legR', 'root', -0.16, 0.5, -0.38);
    R.bone('body', 'root', 0, 0.55, 0);
    R.bone('head', 'body', 0, 0.12, 0.62);
    R.bone('armL', 'body', 0.16, -0.05, 0.38); R.bone('armR', 'body', -0.16, -0.05, 0.38);
    R.bone('wristL', 'armL', 0, -0.3, 0); R.bone('wristR', 'armR', 0, -0.3, 0);
    R.bone('tail', 'body', 0, 0.12, -0.55);
    for (const [s] of SIDES) {
      R.add('leg' + s, 'solid', CYL, SH.mid, [0, -0.2, 0.0], [0.09, 0.4, 0.09]);
      R.add('leg' + s, 'solid', SPH, SH.body, [0, -0.45, 0.05], [0.1, 0.07, 0.15]);
      R.add('arm' + s, 'solid', CYL, SH.mid, [0, -0.2, 0.0], [0.09, 0.42, 0.09]);
      R.add('arm' + s, 'solid', SPH, SH.body, [0, -0.45, 0.05], [0.1, 0.07, 0.15]);
    }
    R.add('body', 'solid', SPH, SH.mid, [0, 0.1, 0], [0.3, 0.3, 0.62]);
    R.add('body', 'solid', SPH, SH.light, [0, 0.2, 0.15], [0.24, 0.2, 0.4]);
    for (let k = 0; k < 4; k++) R.add('body', 'solid', CONE, SH.edge, [0, 0.38, -0.3 + k * 0.22], [0.05, 0.2, 0.06]);
    R.add('head', 'solid', SPH, SH.body, [0, 0, 0], [0.26, 0.24, 0.3]);
    R.add('head', 'solid', SPH, SH.mid, [0, -0.06, 0.28], [0.16, 0.12, 0.22]);
    for (const [, sx] of SIDES) {
      R.add('head', 'solid', CONE, SH.mid, [sx * 0.14, 0.26, -0.05], [0.07, 0.24, 0.05], [0, 0, -sx * 0.25]);
      R.add('head', 'glow', SPHLO, c.eye, [sx * 0.12, 0.05, 0.2], [0.07, 0.05, 0.03]);
    }
    R.add('head', 'solid', CONE4, SH.bone, [0.06, -0.14, 0.4], [0.025, 0.07, 0.02], [PI, 0, 0], false);
    R.add('head', 'solid', CONE4, SH.bone, [-0.06, -0.14, 0.4], [0.025, 0.07, 0.02], [PI, 0, 0], false);
    R.add('tail', 'solid', CONE, SH.mid, [0, 0, -0.25], [0.09, 0.6, 0.09], [HPI + 0.5, 0, 0]);
    R.add('tail', 'aura', CONE, SH.edge, [0, 0.05, -0.4], [0.14, 0.7, 0.14], [HPI + 0.5, 0, 0]);
    wisps(R, 'body', -0.12, 6, 0.32, 0.45, SH.light);
    if (c.ri >= 3) { R.add('body', 'glow', torus(0.03), RANK_COLORS[c.ri], [0, 0.12, 0.0], [0.42, 0.42, 0.42], [HPI, 0, 0]); }
    if (c.ri >= 4) for (let k = 0; k < 4; k++) R.add('body', 'aura', CONE, RANK_COLORS[c.ri], [0, 0.42 + (k % 2) * 0.06, -0.25 + k * 0.2], [0.07, 0.3, 0.07]);
    if (c.ri >= 5) R.add('body', 'aura', SPH, RANK_COLORS[c.ri], [0, 0.15, 0], [0.5, 0.5, 0.9]);
    if (c.ri >= 1) for (const [s, sx] of SIDES) R.add('head', 'solid', CONE, SH.edge, [sx * 0.1, 0.18, 0.0], [0.04, 0.2 + c.ri * 0.02, 0.04], [0, 0, -sx * 0.3]);
    rarityDeco(R, c.rarity, { top: 0.3 });
    R.fx((t, B) => { if (B.tail) B.tail.rotation.y = Math.sin(t * 5) * 0.4; });
    return { height: 1.2, scale: 1.0, walkSpeed: 14, radius: 0.55 };
  });

  // --- faucheur (rare) : spectre élancé à faux, flottant
  const buildFaucheur = minionBuilder('ombre_faucheur', (R, c) => {
    minionSkeleton(R); sArms(R, { w: 0.07 });
    R.add('head', 'solid', SPH, SH.body, [0, 0.03, 0], [0.34, 0.32, 0.34]);
    R.add('head', 'solid', HEMI, SH.mid, [0, 0.08, -0.03], [0.46, 0.5, 0.46], [-0.4, 0, 0]);
    R.add('head', 'solid', CONE, SH.mid, [0, 0.2, -0.44], [0.13, 0.4, 0.13], [-1.9, 0, 0]);
    for (const [, sx] of SIDES) {
      R.add('head', 'eyes', SPHLO, 0xffffff, [sx * 0.11, 0.05, 0.29], [0.07, 0.04, 0.03]);
      R.add('head', 'glow', SPHLO, c.eye, [sx * 0.11, 0.05, 0.31], [0.085, 0.05, 0.03]);
    }
    R.add('body', 'solid', cylT(0.7), SH.mid, [0, 0.3, 0], [0.26, 0.62, 0.22]);
    R.add('body', 'solid', ROBE, SH.mid, [0, -0.22, 0], [0.42, 0.7, 0.38]);
    R.add('body', 'solid', torus(0.16), SH.edge, [0, -0.52, 0], [0.42, 0.4, 0.26], [HPI, 0, 0]);
    R.add('body', 'cape', CAPE, SH.body, [0, 0.14, -0.04], [0.36, 1.1, 0.3]);
    for (const [s, sx] of SIDES) R.add('arm' + s, 'solid', CONE, SH.edge, [sx * 0.1, 0.14, 0], [0.05, 0.26, 0.05], [0, 0, -sx * 0.9]);
    R.add('wristR', 'solid', CYL8, SH.body, [0, 0, 0.2], [0.03, 1.3, 0.03], [HPI, 0, 0]);
    const BL = [[0, 0.04, 0.9], [0, -0.1, 1.0], [0, -0.26, 1.03], [0, -0.42, 0.97], [0, -0.55, 0.85], [0, -0.63, 0.7]];
    for (let i = 0; i < BL.length - 1; i++) R.seg('wristR', 'blade', BOX, SH.bone, BL[i], BL[i + 1], 0.03, (0.075 - i * 0.008) * 2, true);
    R.add('wristR', 'glow', SPHLO, c.eye, [0, -0.3, 1.02], 0.025);
    wisps(R, 'body', -0.6, 8, 0.2, 0.7, SH.edge);
    rankDeco(R, c.ri, { top: 0.5, shoulder: 0.3 });
    R.add('body', 'aura', torus(0.04), 0x6fa8ff, [0, 0.1, 0], [0.62, 0.62, 0.62], [HPI, 0, 0]);
    return { height: 2.2, wristR: -1.45, anim: 'wraith', float: true, baseY: 0.4, scale: 1.0 };
  });

  // --- titan (légendaire) : géant cornu à couronne de flammes
  const buildTitan = minionBuilder('ombre_titan', (R, c) => {
    minionSkeleton(R);
    for (const [s] of SIDES) {
      R.add('leg' + s, 'solid', CYL, SH.mid, [0, -0.2, 0], [0.17, 0.42, 0.17]);
      R.add('leg' + s, 'solid', SPH, SH.body, [0, -0.53, 0.05], [0.19, 0.11, 0.26]);
    }
    for (const [s, sx] of SIDES) {
      R.add('arm' + s, 'solid', CYL, SH.mid, [0, -0.2, 0], [0.15, 0.42, 0.15]);
      R.add('arm' + s, 'solid', SPH, SH.edge, [sx * 0.03, 0.05, 0], [0.27, 0.22, 0.27]);
      R.add('arm' + s, 'solid', SPH, SH.body, [0, -0.46, 0.02], [0.18, 0.18, 0.18]);
      for (let k = 0; k < 3; k++) R.add('arm' + s, 'solid', CONE, SH.light, [sx * (0.05 + k * 0.08), 0.2 + k * 0.05, 0], [0.06, 0.3, 0.06], [0, 0, -sx * (0.3 + k * 0.3)]);
    }
    R.add('head', 'solid', SPH, SH.body, [0, 0.0, 0], [0.36, 0.34, 0.36]);
    R.add('head', 'solid', BOX, SH.light, [0, -0.1, 0.3], [0.26, 0.08, 0.1], null, false);
    for (const [, sx] of SIDES) {
      R.add('head', 'eyes', SPHLO, 0xffffff, [sx * 0.13, 0.04, 0.31], [0.08, 0.045, 0.03]);
      R.add('head', 'glow', SPHLO, c.eye, [sx * 0.13, 0.04, 0.33], [0.095, 0.055, 0.03]);
      R.add('head', 'solid', CONE, SH.edge, [sx * 0.24, 0.3, 0], [0.09, 0.5, 0.09], [0, 0, -sx * 0.6]);
      R.add('head', 'solid', CONE, SH.light, [sx * 0.32, 0.16, 0], [0.06, 0.34, 0.06], [0, 0, -sx * 1.1]);
    }
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; R.add('head', 'aura', CONE, 0xffc233, [Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3], [0.07, 0.34, 0.07]); }
    R.add('body', 'solid', CYL, SH.body, [0, 0.52, 0], [0.13, 0.1, 0.13]);
    R.add('body', 'solid', cylT(1.0), SH.mid, [0, 0.26, 0], [0.46, 0.64, 0.4]);
    R.add('body', 'solid', SPH, SH.light, [0, 0.34, 0.22], [0.34, 0.24, 0.13]);
    R.add('body', 'glow', OCTA, 0xffc233, [0, 0.34, 0.34], [0.07, 0.11, 0.04]);
    R.add('body', 'solid', cylT(0.95), SH.body, [0, -0.04, 0], [0.47, 0.22, 0.41]);
    R.add('body', 'cape', CAPE, SH.body, [0, 0.12, -0.05], [0.45, 1.0, 0.4]);
    R.add('body', 'aura', torus(0.06), 0xffc233, [0, 0.1, 0], [0.9, 0.9, 0.9], [HPI, 0, 0]);
    wisps(R, 'body', -0.16, 9, 0.42, 0.6, SH.edge);
    rankDeco(R, Math.max(c.ri, 2), { top: 0.5, shoulder: 0.35 });
    return { height: 1.8, scale: 1.7, anim: 'knight', walkSpeed: 6, radius: 0.6 };
  });

  // --- générique (secours)
  const buildOmbre = minionBuilder('ombre', (R, c) => {
    minionSkeleton(R); sLegs(R); sArms(R); sHead(R, { eye: c.eye });
    R.add('head', 'solid', HEMI, SH.mid, [0, 0.08, -0.03], [0.45, 0.42, 0.45], [-0.3, 0, 0]);
    R.add('body', 'solid', cylT(0.85), SH.mid, [0, 0.27, 0], [0.3, 0.54, 0.27]);
    wisps(R, 'body', -0.2, 7, 0.28, 0.6, SH.light);
    rankDeco(R, c.ri); rarityDeco(R, c.rarity);
    return { height: 1.8, scale: 1 };
  });

  // ==================================================================
  // ENREGISTREMENT
  // ==================================================================
  const HEROES = { Assassin: buildAssassin, Archer: buildArcher, Paladin: buildPaladin, Elementaliste: buildElementaliste, Necromancien: buildNecromancien };
  const MINIONS = {
    ombre_guerrier: buildGuerrier, ombre_archer: buildArcherO, ombre_mage: buildMageO, ombre_colosse: buildColosse,
    soldat_ombre: buildGuerrier, ombre_chevalier: buildChevalier, ombre_bete: buildBete, ombre_faucheur: buildFaucheur, ombre_titan: buildTitan, ombre: buildOmbre,
  };
  for (const id in HEROES) {
    const fn = HEROES[id];
    G.GFX.registerModel('hero', id, function (opts) {
      const root = fn(opts);
      root.userData.heroId = id;   // vraie classe ; userData.classId peut être un alias d'animation (Assassin→Voleur, Elementaliste/Necromancien→Mage)
      return root;
    });
  }
  for (const id in MINIONS) G.GFX.registerModel('minion', id, MINIONS[id]);

  G.ClassModels = { heroIds: Object.keys(HEROES), minionIds: Object.keys(MINIONS), RANK_COLORS, RANK_IDS };
})();
