window.G = window.G || {};
/* v6 — hero-render.js (A7 Technical Artist) : rendu des héros v6.
 *
 *   G.HeroRender.patchMaterial(mat)   rim light (onBeforeCompile) pour MeshToon / MeshStandard / MeshPhysical / MeshPhong / MeshLambert r128.
 *                                     - injecté après <emissivemap_fragment> (ajouté à totalEmissiveRadiance) → passe par le fog, ne touche pas aux ombres ;
 *                                     - chaîne l'onBeforeCompile / customProgramCacheKey existants (ex. HTGlowToon de hero-tex) ;
 *                                     - uniforms PARTAGÉS (G.HeroRender.rim) : changer la couleur/force ne recompile rien ;
 *                                     - clé de programme stable 'heroRim1|' + clé précédente → un seul programme par variante ;
 *                                     - les clones (game.prepareFlash) restent patchés ; userData.heroRim décrit le rim pour l'aperçu raster.
 *   G.HeroRender.prepare(root, spec)  ombres (castShadow sur le corps), LOD simplifié (lowQuality ou héros petit à l'écran), budget mesuré.
 *   G.HeroRender.budget(root)         -> { drawCalls, tris, mats, textures, meshes, outlines, points, particles, lights }
 *   G.HeroRender.setLowQuality(bool)  bascule globale (appliquée à l'image suivante par chaque héros préparé).
 *
 * Conventions LOD (pour A2/A4/A6) : un objet avec userData.lod === 'detail' (ou userData.lodHide) est masqué en basse qualité ;
 * userData.lod === 'keep' n'est jamais masqué. Les petits détails (< 0,035 u de rayon) sont masqués automatiquement, sauf lame/arme/lueur.
 * En lowQuality explicite (réglage joueur) les contours sont aussi masqués (HR.hideOutlineLow) ; jamais quand le héros est seulement petit à l'écran.
 * Limite : avec l'assemblage skinné d'A2 (1 mesh par couche), il n'y a presque pas de « petits détails » séparés : le vrai gain viendrait
 * d'une géométrie basse résolution fournie par A2 (voir v6/PERF.md).
 * Aucune allocation par image ; aucune ressource GPU créée (rien à libérer, rien de partagé détruit).
 */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) { G.HeroRender = { patchMaterial: m => m, prepare: r => r, budget: () => ({ drawCalls: 0, tris: 0, mats: 0, textures: 0 }), lowQuality: false }; return; }

  // ------------------------------------------------------------------ rim light
  const RIM_COLOR = 0x9fb8ff;
  const U = {
    htRimColor: { value: new T.Color(RIM_COLOR) },
    htRimStrength: { value: 0.32 },
    htRimPower: { value: 2.6 },
  };
  const PATCHED = new WeakSet();
  const RIM_GLSL_DECL = 'uniform vec3 htRimColor;\nuniform float htRimStrength;\nuniform float htRimPower;\n';
  const RIM_GLSL = '\n\t{ // rim light héros v6 (A7)\n'
    + '\t\tfloat htRimF = 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );\n'
    + '\t\ttotalEmissiveRadiance += htRimColor * ( pow( htRimF, htRimPower ) * htRimStrength );\n\t}\n';
  const ANCHOR = '#include <emissivemap_fragment>';

  function rimSupported(m) {
    return !!(m && (m.isMeshToonMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) && !m.isShaderMaterial);
  }
  function rimInfo() { return { color: U.htRimColor.value.getHex(), strength: U.htRimStrength.value, power: U.htRimPower.value }; }

  function patchMaterial(mat) {
    try {
      if (!mat || PATCHED.has(mat)) return mat;
      if (Array.isArray(mat)) { mat.forEach(patchMaterial); return mat; }
      if (!rimSupported(mat)) return mat;
      // MeshLambert r128 : éclairage par sommet, pas de vViewPosition fiable dans le fragment → pas de rim (on n'invente rien)
      if (mat.isMeshLambertMaterial) return mat;
      PATCHED.add(mat);
      const prevCompile = mat.onBeforeCompile;           // méthode de classe (HTGlowToon) ou d'instance, ou la vide par défaut
      const prevKey = mat.customProgramCacheKey;
      const proto = Object.getPrototypeOf(mat);
      mat.onBeforeCompile = function (shader, renderer) {
        try { if (typeof prevCompile === 'function') prevCompile.call(this, shader, renderer); } catch (e) { /* rien */ }
        try {
          if (shader.fragmentShader.indexOf('htRimColor') >= 0) return;
          if (shader.fragmentShader.indexOf(ANCHOR) < 0) return;          // chunk absent : on n'ajoute rien
          shader.uniforms.htRimColor = U.htRimColor;
          shader.uniforms.htRimStrength = U.htRimStrength;
          shader.uniforms.htRimPower = U.htRimPower;
          shader.fragmentShader = RIM_GLSL_DECL + shader.fragmentShader.replace(ANCHOR, ANCHOR + RIM_GLSL);
        } catch (e) { /* rien */ }
      };
      // clé de cache : stable par variante (pas de fonction anonyme dont le source changerait) → pas de recompilation
      let baseKey = '';
      try { baseKey = typeof prevKey === 'function' && prevKey !== T.Material.prototype.customProgramCacheKey ? String(prevKey.call(mat)) : ''; } catch (e) { baseKey = ''; }
      const key = 'heroRim1|' + baseKey;
      mat.customProgramCacheKey = function () { return key; };
      // clones (game.prepareFlash, HeroTex.instance) : r128 ne copie pas onBeforeCompile → on repatche le clone
      mat.clone = function () { const c = proto.clone.call(this); try { delete c.onBeforeCompile; delete c.customProgramCacheKey; delete c.clone; } catch (e) { /* rien */ } return patchMaterial(c); };
      mat.userData = mat.userData || {};
      mat.userData.heroRim = rimInfo();                   // lu par /home/claude/qa/raster.js (aperçu) ; JSON-sérialisable
      mat.needsUpdate = true;
    } catch (e) { /* jamais d'exception */ }
    return mat;
  }
  function setRim(color, strength, power) {
    if (color != null) U.htRimColor.value.set(color);
    if (strength != null) U.htRimStrength.value = +strength;
    if (power != null) U.htRimPower.value = +power;
  }

  // ------------------------------------------------------------------ budget
  const TEX_KEYS = ['map', 'gradientMap', 'bumpMap', 'normalMap', 'emissiveMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'envMap', 'aoMap', 'lightMap', 'specularMap', 'displacementMap'];
  function visibleChain(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }
  function budget(root) {
    const r = { drawCalls: 0, tris: 0, mats: 0, textures: 0, meshes: 0, outlines: 0, points: 0, sprites: 0, particles: 0, lights: 0 };
    if (!root || !root.traverse) return r;
    const mats = new Set(), texs = new Set();
    root.traverse(o => {
      if (o.isLight) r.lights++;
      if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine) || !visibleChain(o)) return;
      const g = o.geometry, ms = Array.isArray(o.material) ? o.material : [o.material];
      r.drawCalls += Array.isArray(o.material) && g && g.groups && g.groups.length ? g.groups.length : 1;
      if (o.isMesh) {
        r.meshes++; if (o.userData && o.userData.isOutline) r.outlines++;
        if (g && g.attributes && g.attributes.position) {
          const n = g.index ? g.index.count : g.attributes.position.count;
          const dc = g.drawRange && g.drawRange.count != null ? g.drawRange.count : Infinity;
          r.tris += Math.floor(Math.min(n, dc) / 3) * (o.isInstancedMesh ? (o.count || 0) : 1);
        }
      }
      if (o.isPoints) { r.points++; if (g && g.attributes && g.attributes.position) r.particles += g.attributes.position.count; }
      if (o.isSprite) r.sprites++;
      for (const m of ms) {
        if (!m) continue; mats.add(m);
        for (const k of TEX_KEYS) if (m[k] && m[k].isTexture) texs.add(m[k]);
        if (m.uniforms) for (const u in m.uniforms) { const v = m.uniforms[u] && m.uniforms[u].value; if (v && v.isTexture) texs.add(v); }
      }
    });
    r.mats = mats.size; r.textures = texs.size;
    return r;
  }
  // budget arbitré par le coordinateur (v6) : les matériaux sont partagés entre instances (coût = programmes, pas mémoire) → 24 ; triangles contour compris → 28 000
  const LIMITS = { drawCalls: 40, tris: 28000, mats: 24, particles: 200 };
  function overBudget(b) {
    const o = [];
    for (const k in LIMITS) if (b[k] > LIMITS[k]) o.push(k + ' ' + b[k] + '>' + LIMITS[k]);
    return o;
  }

  // ------------------------------------------------------------------ LOD
  const _v = new T.Vector3(), _c = new T.Vector3(), _s = new T.Vector3();
  const LOD_SMALL_RADIUS = 0.035;
  function isWeaponish(o) {
    const ud = o.userData || {};
    if (ud.lod === 'keep' || ud.isBlade || ud.weapon) return true;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const layer = (m && m.userData && m.userData.heroLayer) || ud.layer || '';
    return layer === 'blade' || layer === 'glow' || layer === 'eye' || layer === 'eyeWhite';
  }
  function collectLod(root) {
    const list = [];
    const ud = root.userData || {};
    const blade = ud.blade;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (o === root) return;
      const u = o.userData || {};
      if (u.lod === 'keep') return;
      if (u.lod === 'detail' || u.lodHide) { list.push(o); return; }
      if (!o.isMesh || o === blade || isWeaponish(o)) return;
      const g = o.geometry; if (!g || !g.attributes || !g.attributes.position) return;
      try {
        if (!g.boundingSphere) g.computeBoundingSphere();
        o.getWorldScale(_s);
        const rad = g.boundingSphere ? g.boundingSphere.radius * Math.max(_s.x, _s.y, _s.z) : 1;
        if (rad < LOD_SMALL_RADIUS) list.push(o);
      } catch (e) { /* rien */ }
    });
    return list;
  }
  function applyLod(ud, low) {
    const L = ud.heroLod; if (!L) return;
    // contours : masqués seulement en basse qualité EXPLICITE (lowQuality && hideOutlineLow) — jamais pour un simple héros petit à l'écran
    const olOff = low && HR.lowQuality && HR.hideOutlineLow;
    if (L.olOff !== olOff) {
      L.olOff = olOff;
      for (let i = 0; i < L.outlines.length; i++) { const o = L.outlines[i]; if (olOff) { o.userData._lodVisOl = o.visible; o.visible = false; } else o.visible = o.userData._lodVisOl !== false; }
    }
    if (L.low === low) return;
    L.low = low;
    const arr = L.list;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (low) { o.userData._lodVis = o.visible; o.visible = false; }
      else { o.visible = o.userData._lodVis !== false; }
    }
  }
  // hauteur projetée (px) du héros pour la caméra courante (pieds → sommet, projection réelle) ; aucune allocation
  function screenHeightPx(root, camera, renderer) {
    if (!camera || !camera.isCamera || !camera.projectionMatrix) return Infinity;
    let h = 720;
    try { if (renderer && renderer.domElement && renderer.domElement.height) h = renderer.domElement.height; } catch (e) { /* rien */ }
    const ud = root.userData || {};
    const H = (ud.height || 2.2) * (root.scale ? root.scale.y : 1);
    root.getWorldPosition(_c);
    if (camera.matrixWorldInverse) camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    _v.copy(_c).project(camera);
    _s.copy(_c); _s.y += H; _s.project(camera);
    if (!isFinite(_v.y) || !isFinite(_s.y) || _v.z > 1 || _s.z > 1) return Infinity;
    return Math.abs(_s.y - _v.y) * 0.5 * h;
  }

  function setLowQuality(v) { HR.lowQuality = !!v; }

  function prepare(root, spec) {
    try {
      if (!root || !root.traverse) return root;
      const ud = root.userData = root.userData || {};
      let host = null;
      // ombres : le corps projette, les contours / lueurs / transparents / particules non
      root.traverse(o => {
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const glowy = !m || m.transparent || m.blending === T.AdditiveBlending || (m.isMeshBasicMaterial && !(o.userData && o.userData.castShadow));
        const outline = o.userData && o.userData.isOutline;
        o.castShadow = !outline && !glowy;
        o.receiveShadow = false;
        if (!host && !outline && !glowy) host = o;
        if (m) patchMaterial(m);                           // filet de sécurité si un matériau n'est pas passé par HeroTex
      });
      // LOD
      const outlines = []; root.traverse(o => { if (o.isMesh && o.userData && o.userData.isOutline) outlines.push(o); });
      ud.heroLod = { list: collectLod(root), outlines, olOff: false, low: false, px: Infinity, lq: HR.lowQuality };
      if (host) {
        const prev = host.onBeforeRender;
        const hasPrev = typeof prev === 'function' && prev !== T.Object3D.prototype.onBeforeRender;
        let frame = 0;
        host.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
          if (hasPrev) { try { prev.call(this, renderer, scene, camera, geometry, material, group); } catch (e) { /* rien */ } }
          const L0 = ud.heroLod;
          if ((frame++ & 7) !== 0 && L0.lq === HR.lowQuality) return;   // contrôle toutes les 8 images (immédiat si lowQuality change)
          L0.lq = HR.lowQuality;
          try {
            const px = screenHeightPx(root, camera, renderer);
            ud.heroLod.px = px;
            const L = ud.heroLod;
            // hystérésis : passe en bas niveau sous lodPx, revient au-dessus de lodPx × 1.25
            const low = HR.lowQuality || (L.low ? px < HR.lodPx * 1.25 : px < HR.lodPx);
            applyLod(ud, low);
          } catch (e) { /* rien */ }
        };
      }
      if (HR.lowQuality) applyLod(ud, true);
      // budget (mesuré une fois, plein détail)
      const b = budget(root);
      ud.renderBudget = b;
      const over = overBudget(b);
      if (over.length) {
        ud.renderBudgetOver = over;
        const k = (ud.classId || (spec && spec.classId) || '?') + '|' + ((spec && spec.skinId) || '');
        if (HR.debug && !WARNED[k]) { WARNED[k] = 1; console.warn('[HeroRender] budget dépassé ' + k + ' : ' + over.join(', ')); }
      }
    } catch (e) { /* jamais d'exception : le héros reste utilisable */ }
    return root;
  }
  const WARNED = {};

  const HR = G.HeroRender = {
    patchMaterial, prepare, budget, overBudget, setLowQuality, setRim,
    rim: U, LIMITS,
    lowQuality: false,
    lodPx: 48,             // sous cette hauteur à l'écran (px), le héros passe en LOD simplifié
    hideOutlineLow: true,  // en lowQuality explicite, les contours (≈ 30 % des triangles d'un héros v6) sont masqués
    debug: false,
    _applyLod: applyLod,
    _screenHeightPx: screenHeightPx,
  };
})();
