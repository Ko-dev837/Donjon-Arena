window.G = window.G || {};
// =====================================================================
//  core.js — moteur : rendu, caméra, boucle, entrées, sons, effets,
//  barres de vie, sauvegarde. Voir CONTRACT.md.
// =====================================================================
(() => {
  const G = window.G;
  const now = () => performance.now();

  // ------------------------------------------------------------------
  //  RENDU
  // ------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.id = 'game-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;touch-action:none;';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1236);
  scene.fog = new THREE.Fog(0x1a1236, 38, 75);

  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 20, 14);

  const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x3a2a50, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(8, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', onResize);

  const updates = [], renders = [];
  const core = {
    renderer, scene, camera, sun, hemi, canvas,
    paused: false,
    timeScale: 1,
    camFocus: new THREE.Vector3(),
    camZoom: 1,
    time: 0,
    onUpdate(fn) { updates.push(fn); },
    onRender(fn) { renders.push(fn); },
    setTheme(t) {
      if (!t) return;
      if (t.bg != null) { scene.background = new THREE.Color(t.bg); scene.fog.color.set(t.bg); }
      if (t.fog) { scene.fog.near = t.fog[0]; scene.fog.far = t.fog[1]; }
      if (t.hemiSky != null) hemi.color.set(t.hemiSky);
      if (t.hemiGround != null) hemi.groundColor.set(t.hemiGround);
      if (t.sun != null) sun.color.set(t.sun);
      // v5 : intensités (ambiances sombres / horreur). Valeurs par défaut restaurées si absentes.
      hemi.intensity = t.hemiIntensity != null ? t.hemiIntensity : 0.85;
      sun.intensity = t.sunIntensity != null ? t.sunIntensity : 0.9;
      core.theme = t;
      if (G.bus) G.bus.emit('themeChanged', { theme: t });
    },
    shake(a) { shakeAmt = Math.min(1.5, Math.max(shakeAmt, a || 0.3)); },
    hitStop(s) { hitStopT = Math.max(hitStopT, Math.min(0.15, s || 0.05)); },
    toScreen(v, yOff = 0) {
      tmpV.set(v.x, v.y + yOff, v.z).project(camera);
      return { x: (tmpV.x + 1) / 2 * innerWidth, y: (1 - tmpV.y) / 2 * innerHeight, visible: tmpV.z < 1 && tmpV.z > -1 };
    },
    groundPoint(cx, cy) {
      ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(groundPlane, p) ? p : null;
    },
  };
  G.core = core;
  const tmpV = new THREE.Vector3(), ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let shakeAmt = 0, hitStopT = 0;

  // ------------------------------------------------------------------
  //  CAMÉRA
  // ------------------------------------------------------------------
  const camPos = new THREE.Vector3(0, 20, 14), camLook = new THREE.Vector3();
  function updateCamera(dt) {
    const portrait = innerHeight > innerWidth * 1.05;
    const z = core.camZoom || 1;
    const off = portrait ? [0, 25 * z, 14.5 * z] : [0, 18.5 * z, 12.5 * z];
    const f = core.camFocus;
    const target = new THREE.Vector3(f.x * 0.9 + off[0], off[1], f.z + off[2]);
    const k = 1 - Math.pow(0.0015, dt);   // lissage indépendant du framerate
    camPos.lerp(target, k);
    camLook.lerp(new THREE.Vector3(f.x * 0.9, 0, f.z - 1.2), k);
    camera.position.copy(camPos);
    if (shakeAmt > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.6;
      camera.position.z += (Math.random() - 0.5) * shakeAmt;
      shakeAmt *= Math.pow(0.004, dt);
    }
    camera.lookAt(camLook);
    sun.position.set(f.x + 9, 24, f.z + 11);
    sun.target.position.set(f.x, 0, f.z);
  }

  // ------------------------------------------------------------------
  //  BOUCLE
  // ------------------------------------------------------------------
  let last = now();
  function loop() {
    const t = now();
    let dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    core.time += dt;
    if (hitStopT > 0) { hitStopT -= dt; dt = 0; }
    const sdt = dt * core.timeScale;
    if (!core.paused && sdt > 0) {
      for (const fn of updates) { try { fn(sdt, core.time); } catch (e) { console.error('[update]', e); } }
    }
    for (const fn of renders) { try { fn(dt, core.time); } catch (e) { console.error('[render]', e); } }
    fx.update(core.paused ? 0 : dt);
    updateCamera(dt);
    labels.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------
  //  ENTRÉES
  // ------------------------------------------------------------------
  const listeners = [];
  const keys = {};
  let lastMouse = -1e9;
  const joy = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
  const input = {
    enabled: true,
    keys,
    move: { x: 0, z: 0 },
    mouseWorld: null,
    get mouseActive() { return now() - lastMouse < 2500; },
    aiming: null,
    onAction(fn) { listeners.push(fn); },
    fire(name, data) {
      if (!input.enabled && name !== 'pause') return;
      for (const fn of listeners) { try { fn(name, data || { dir: null }); } catch (e) { console.error('[action]', e); } }
    },
    bindButton(el, action) {
      if (!el || el._bound) return;
      el._bound = true;
      el.style.touchAction = 'none';
      let st = null;
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        st = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false };
        el.classList.add('pressed');
      });
      el.addEventListener('pointermove', e => {
        if (!st || e.pointerId !== st.id) return;
        const dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (Math.hypot(dx, dy) > 18) {
          st.drag = true;
          input.aiming = { action, dir: new THREE.Vector3(dx, 0, dy).normalize() };
        }
      });
      const end = (e, cancel) => {
        if (!st || e.pointerId !== st.id) return;
        el.classList.remove('pressed');
        const dir = st.drag && input.aiming ? input.aiming.dir.clone() : null;
        input.aiming = null; st = null;
        if (!cancel) input.fire(action, { dir });
      };
      el.addEventListener('pointerup', e => end(e, false));
      el.addEventListener('pointercancel', e => end(e, true));
      el.addEventListener('contextmenu', e => e.preventDefault());
    },
  };
  G.input = input;

  const KEYMAP = {
    '1': 'cast1', '&': 'cast1', '2': 'cast2', 'é': 'cast2', '3': 'cast3', '"': 'cast3',
    ' ': 'dash', 'shift': 'dash', 'x': 'super', '4': 'super', "'": 'super',
    'r': 'potion1', 'f': 'potion2', 'escape': 'pause', 'p': 'pause',
  };
  addEventListener('keydown', e => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (e.repeat) { keys[k] = true; return; }
    keys[k] = true;
    if (KEYMAP[k]) input.fire(KEYMAP[k], { dir: null });
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // Joystick flottant (moitié gauche) + souris
  const joyBase = document.createElement('div');
  joyBase.id = 'joystick';
  joyBase.style.cssText = 'position:fixed;width:124px;height:124px;margin:-62px 0 0 -62px;border-radius:50%;' +
    'background:radial-gradient(circle,rgba(255,255,255,.10),rgba(255,255,255,.22));border:3px solid rgba(255,255,255,.45);' +
    'display:none;z-index:3;pointer-events:none;box-shadow:0 0 0 3px rgba(0,0,0,.35)';
  const joyKnob = document.createElement('div');
  joyKnob.style.cssText = 'position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;' +
    'background:#fff;border:3px solid #000;box-shadow:0 4px 0 rgba(0,0,0,.4)';
  joyBase.appendChild(joyKnob);

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
      lastMouse = now();
      input.mouseWorld = core.groundPoint(e.clientX, e.clientY);
      if (e.button === 0) input.fire('cast2', { dir: null });
      if (e.button === 2) input.fire('cast3', { dir: null });
      return;
    }
    if (joy.id !== null || e.clientX > innerWidth * 0.55) return;
    joy.id = e.pointerId; joy.x = e.clientX; joy.y = e.clientY; joy.dx = joy.dy = 0;
    joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px';
    joyBase.style.display = 'block'; joyKnob.style.transform = '';
  });
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && e.target === canvas) {
      lastMouse = now();
      input.mouseWorld = core.groundPoint(e.clientX, e.clientY);
    }
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y;
    const d = Math.hypot(dx, dy), max = 52;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    joy.dx = dx / max; joy.dy = dy / max;
    joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const endJoy = e => { if (e.pointerId === joy.id) { joy.id = null; joy.dx = joy.dy = 0; joyBase.style.display = 'none'; } };
  addEventListener('pointerup', endJoy);
  addEventListener('pointercancel', endJoy);

  function updateMove() {
    let x = 0, z = 0;
    if (input.enabled) {
      if (keys['z'] || keys['w'] || keys['arrowup']) z -= 1;
      if (keys['s'] || keys['arrowdown']) z += 1;
      if (keys['q'] || keys['a'] || keys['arrowleft']) x -= 1;
      if (keys['d'] || keys['arrowright']) x += 1;
      if (joy.id !== null) { x = joy.dx; z = joy.dy; }
    }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    if (l < 0.12) { x = 0; z = 0; }
    input.move.x = x; input.move.z = z;
  }
  core.onRender(updateMove);

  // ------------------------------------------------------------------
  //  SONS (synthétisés, aucun fichier)
  // ------------------------------------------------------------------
  let ac = null, master = null, noiseBuf = null;
  const lastPlay = {};
  function tone(f, d, type = 'square', v = 0.12, f2 = null, delay = 0) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.03);
  }
  function noise(d, v = 0.2, freq = 1200, delay = 0, type = 'lowpass', f2 = null) {
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
    const g = ac.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.03);
  }
  const arp = (notes, step = 0.08, type = 'square', v = 0.1, d = 0.14) => notes.forEach((n, i) => tone(n, d, type, v, null, i * step));
  const SFX = {
    swing:   () => noise(0.14, 0.25, 3000, 0, 'bandpass', 900),
    throw:   () => { tone(1100, 0.09, 'triangle', 0.08, 500); noise(0.08, 0.1, 4000, 0, 'highpass'); },
    fire:    () => { noise(0.35, 0.22, 900, 0, 'lowpass', 300); tone(180, 0.3, 'sawtooth', 0.06, 90); },
    fizzle:  () => noise(0.3, 0.12, 2500, 0, 'highpass'),
    boom:    () => { noise(0.6, 0.45, 600, 0, 'lowpass', 80); tone(90, 0.4, 'sine', 0.25, 40); },
    hit:     () => { tone(260, 0.07, 'square', 0.09, 120); noise(0.05, 0.12, 2000); },
    hurt:    () => { tone(200, 0.22, 'sawtooth', 0.14, 70); noise(0.12, 0.15, 900); },
    pickup:  () => tone(1300, 0.07, 'sine', 0.1, 1900),
    gold:    () => { tone(1500, 0.06, 'square', 0.05); tone(2000, 0.1, 'square', 0.05, null, 0.05); },
    heal:    () => arp([523, 659, 784], 0.06, 'sine', 0.12, 0.2),
    levelup: () => arp([523, 659, 784, 1046, 1318], 0.08, 'square', 0.09, 0.22),
    super:   () => { noise(0.8, 0.35, 300, 0, 'bandpass', 3000); tone(150, 0.7, 'sawtooth', 0.12, 600); },
    dash:    () => noise(0.18, 0.18, 1800, 0, 'bandpass', 600),
    chestOk: () => arp([784, 988, 1175, 1568], 0.09, 'triangle', 0.13, 0.3),
    chestBad:() => arp([392, 330, 262, 196], 0.12, 'sawtooth', 0.09, 0.25),
    click:   () => tone(700, 0.05, 'square', 0.06, 900),
    bossRoar:() => { tone(110, 1.1, 'sawtooth', 0.2, 55); noise(1.1, 0.25, 500, 0, 'lowpass', 120); },
    slam:    () => { noise(0.7, 0.5, 400, 0, 'lowpass', 60); tone(60, 0.5, 'sine', 0.3, 30); },
    victory: () => arp([523, 659, 784, 1046, 784, 1046, 1318], 0.11, 'square', 0.1, 0.25),
    defeat:  () => arp([392, 370, 349, 262], 0.22, 'triangle', 0.12, 0.4),
    door:    () => { noise(0.9, 0.2, 300, 0, 'lowpass'); tone(80, 0.8, 'sine', 0.12, 50); },
    arrow:   () => noise(0.12, 0.15, 5000, 0, 'highpass'),
    spawn:   () => tone(300, 0.25, 'sine', 0.08, 900),
    upgrade: () => { arp([659, 880, 1175], 0.07, 'square', 0.1, 0.18); noise(0.2, 0.15, 6000, 0, 'highpass'); },
    error:   () => tone(150, 0.2, 'square', 0.08, 110),
  };
  let muted = false;
  try { muted = localStorage.getItem('donjon-arena-muted') === '1'; } catch (_) {}
  G.sfx = {
    get muted() { return muted; },
    set muted(v) { muted = !!v; try { localStorage.setItem('donjon-arena-muted', muted ? '1' : '0'); } catch (_) {} },
    toggle() { this.muted = !muted; if (!muted) this.play('click'); return muted; },
    unlock() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ac = new AC();
          master = ac.createGain(); master.gain.value = 0.7;
          const comp = ac.createDynamicsCompressor();
          master.connect(comp); comp.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === 'suspended') ac.resume();
      } catch (_) {}
    },
    play(name) {
      if (muted || !ac || !SFX[name]) return;
      const t = now();
      if (lastPlay[name] && t - lastPlay[name] < 45) return;   // évite la saturation
      lastPlay[name] = t;
      try { SFX[name](); } catch (_) {}
    },
  };
  addEventListener('pointerdown', () => G.sfx.unlock(), true);
  addEventListener('keydown', () => G.sfx.unlock(), true);

  // ------------------------------------------------------------------
  //  EFFETS : particules, textes flottants, anneaux
  // ------------------------------------------------------------------
  const layer = document.createElement('div');
  layer.id = 'fx-layer';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2;';
  const style = document.createElement('style');
  style.textContent = `
    #fx-layer .fx-text{position:absolute;transform:translate(-50%,-50%);font-family:'Lilita One',Impact,sans-serif;
      font-size:22px;white-space:nowrap;text-shadow:0 2px 0 #000,0 0 3px #000,2px 0 0 #000,-2px 0 0 #000;will-change:transform,opacity}
    #fx-layer .hpl{position:absolute;transform:translate(-50%,-100%);width:58px;height:9px;background:#2a0d18;border:2px solid #000;
      border-radius:6px;overflow:hidden;box-shadow:0 2px 0 rgba(0,0,0,.35)}
    #fx-layer .hpl>i{display:block;height:100%;width:100%;background:linear-gradient(#ff7a7a,#d62839);transition:width .12s}
    #fx-layer .hpl.player>i{background:linear-gradient(#8dff7a,#2fbf3a)}
    #fx-layer .hpl.elite{width:74px;height:11px;border-color:#5a3a00}
    #fx-layer .hpl.elite>i{background:linear-gradient(#ffd27a,#e08a00)}
    #fx-layer .hpl.boss{display:none}
  `;
  document.head.appendChild(style);

  const PGEO = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const pmats = {};
  const pmat = c => pmats[c] || (pmats[c] = (() => { const m = new THREE.MeshBasicMaterial({ color: c }); m.userData.shared = true; return m; })());
  const parts = [], texts = [], rings = [];
  const RING_GEO = new THREE.RingGeometry(0.82, 1, 40);
  const fx = {
    burst(pos, color = 0xffffff, count = 10, o = {}) {
      if (!pos) return;
      const speed = o.speed ?? 5, up = o.up ?? 4, life = o.life ?? 0.6, size = o.size ?? 1, grav = o.gravity ?? 14;
      for (let i = 0; i < count && parts.length < 320; i++) {
        const m = new THREE.Mesh(PGEO, pmat(color));
        m.position.set(pos.x, (pos.y || 0) + 0.5, pos.z);
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
        const v = new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s);
        const sc = size * (0.6 + Math.random() * 0.8);
        m.scale.setScalar(sc);
        m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        scene.add(m);
        parts.push({ m, v, life: life * (0.7 + Math.random() * 0.6), t: 0, grav, sc });
      }
    },
    trail(pos, color = 0xffffff, size = 0.8) {
      if (!pos || parts.length >= 320) return;
      const m = new THREE.Mesh(PGEO, pmat(color));
      m.position.copy(pos);
      m.position.x += (Math.random() - 0.5) * 0.15; m.position.z += (Math.random() - 0.5) * 0.15;
      m.scale.setScalar(size);
      scene.add(m);
      parts.push({ m, v: new THREE.Vector3(0, 0.6, 0), life: 0.3, t: 0, grav: 0, sc: size });
    },
    text(pos, text, color = '#ffd54a', size = 22) {
      if (!pos) return;
      const el = document.createElement('div');
      el.className = 'fx-text'; el.textContent = text; el.style.color = color; el.style.fontSize = size + 'px';
      layer.appendChild(el);
      texts.push({ el, p: new THREE.Vector3(pos.x, pos.y || 0, pos.z), t: 0, life: 0.95, dx: (Math.random() - 0.5) * 30 });
    },
    ring(pos, color = 0xffffff, radius = 3, life = 0.4) {
      if (!pos) return;
      const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.08, pos.z);
      scene.add(m);
      rings.push({ m, r: radius, t: 0, life });
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.t += dt;
        p.v.y -= p.grav * dt;
        p.m.position.addScaledVector(p.v, dt);
        if (p.m.position.y < 0.05 && p.grav > 0) { p.m.position.y = 0.05; p.v.y *= -0.35; p.v.x *= 0.6; p.v.z *= 0.6; }
        p.m.rotation.x += dt * 6;
        const k = p.t / p.life;
        p.m.scale.setScalar(Math.max(0.001, p.sc * (1 - k)));
        if (k >= 1) { scene.remove(p.m); parts.splice(i, 1); }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.t += dt; const k = Math.min(1, r.t / r.life);
        r.m.scale.setScalar(0.2 + r.r * (1 - Math.pow(1 - k, 3)));
        r.m.material.opacity = 0.85 * (1 - k);
        if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const tx = texts[i]; tx.t += dt; const k = tx.t / tx.life;
        const s = core.toScreen(tx.p, 1.6 + k * 1.3);
        const pop = k < 0.15 ? 1 + (0.15 - k) * 4 : 1;
        tx.el.style.left = (s.x + tx.dx * k) + 'px'; tx.el.style.top = s.y + 'px';
        tx.el.style.transform = `translate(-50%,-50%) scale(${pop})`;
        tx.el.style.opacity = k > 0.6 ? (1 - k) / 0.4 : 1;
        if (k >= 1) { tx.el.remove(); texts.splice(i, 1); }
      }
    },
    clear() {
      parts.forEach(p => scene.remove(p.m)); parts.length = 0;
      rings.forEach(r => scene.remove(r.m)); rings.length = 0;
      texts.forEach(t => t.el.remove()); texts.length = 0;
    },
  };
  G.fx = fx;

  // ------------------------------------------------------------------
  //  BARRES DE VIE QUI SUIVENT LES OBJETS
  // ------------------------------------------------------------------
  const attached = new Set();
  const wp = new THREE.Vector3();
  const labels = {
    attach(obj, yOff = 2, kind = 'enemy') {
      const el = document.createElement('div');
      el.className = 'hpl ' + kind;
      el.innerHTML = '<i></i>';
      layer.appendChild(el);
      const h = {
        obj, yOff, el, bar: el.firstChild,
        set(f) { h.bar.style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; },
        setText(t) { el.title = t; },
        remove() { el.remove(); attached.delete(h); },
      };
      attached.add(h);
      return h;
    },
    update() {
      attached.forEach(h => {
        if (!h.obj || !h.obj.parent || !h.obj.visible) { h.el.style.display = 'none'; return; }
        h.obj.getWorldPosition(wp);
        const s = core.toScreen(wp, h.yOff);
        if (!s.visible) { h.el.style.display = 'none'; return; }
        h.el.style.display = '';
        h.el.style.left = s.x + 'px'; h.el.style.top = s.y + 'px';
      });
    },
    clear() { attached.forEach(h => h.el.remove()); attached.clear(); },
  };
  G.labels = labels;

  // ------------------------------------------------------------------
  //  BUS D'ÉVÉNEMENTS + HOOKS + REGISTRES (v3, voir CONTRACT-V3.md)
  // ------------------------------------------------------------------
  const busMap = {};
  G.bus = {
    on(ev, fn) { (busMap[ev] = busMap[ev] || []).push(fn); return () => G.bus.off(ev, fn); },
    off(ev, fn) { const a = busMap[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    emit(ev, payload) {
      const a = busMap[ev]; if (!a) return payload;
      for (const fn of a.slice()) { try { fn(payload); } catch (e) { console.error('[bus ' + ev + ']', e); } }
      return payload;
    },
  };
  const hookMap = {};
  G.hooks = {
    // fn(value, ctx) -> nouvelle valeur (ou undefined = inchangée). priority croissante = exécuté plus tôt.
    add(name, fn, priority = 0) {
      const a = hookMap[name] = hookMap[name] || [];
      a.push({ fn, priority }); a.sort((x, y) => x.priority - y.priority);
      return () => { const i = a.findIndex(h => h.fn === fn); if (i >= 0) a.splice(i, 1); };
    },
    run(name, value, ctx) {
      const a = hookMap[name]; if (!a) return value;
      for (const h of a) {
        try { const r = h.fn(value, ctx); if (r !== undefined) value = r; } catch (e) { console.error('[hook ' + name + ']', e); }
      }
      return value;
    },
  };
  G.makeRegistry = function (label) {
    const items = {};
    return {
      register(id, def) { if (items[id]) console.warn('[' + label + '] redéfinition de ' + id); items[id] = def; return def; },
      get(id) { return items[id]; },
      has(id) { return !!items[id]; },
      all() { return Object.values(items); },
      ids() { return Object.keys(items); },
    };
  };
  // Registres partagés (remplis par les fichiers data/sys/gfx)
  G.AI = G.AI || G.makeRegistry('AI');                    // comportements d'ennemis
  G.BossAttacks = G.BossAttacks || G.makeRegistry('BossAttacks');
  G.RoomTypes = G.RoomTypes || G.makeRegistry('RoomTypes');
  G.Panels = G.Panels || G.makeRegistry('Panels');        // onglets du camp (UI)
  // Hasard cryptographique (Nécromancien 0,01 %, loot)
  G.rng = {
    float() {
      try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (_) { return Math.random(); }
    },
    int(min, max) { return min + Math.floor(G.rng.float() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(G.rng.float() * arr.length)]; },
    chance(p) { return G.rng.float() < p; },
    weighted(list, wKey = 'weight') {
      const tot = list.reduce((s, x) => s + (x[wKey] || 0), 0); let r = G.rng.float() * tot;
      for (const x of list) { r -= (x[wKey] || 0); if (r < 0) return x; }
      return list[list.length - 1];
    },
  };

  // ------------------------------------------------------------------
  //  SAUVEGARDE
  // ------------------------------------------------------------------
  const KEY = 'donjon-arena-save-v2';
  G.save = {
    load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; } },
    save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (_) { return false; } },
    clear() { try { localStorage.removeItem(KEY); } catch (_) {} },
  };

  // ------------------------------------------------------------------
  //  DÉMARRAGE
  // ------------------------------------------------------------------
  function mount() {
    document.body.prepend(canvas);
    document.body.appendChild(layer);
    document.body.appendChild(joyBase);
    requestAnimationFrame(loop);
  }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
})();
