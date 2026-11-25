window.G = window.G || {};
// =====================================================================
//  ui.js — interface v4 « Interface d'Éveil » : écrans (chargement, titre,
//  création, camp à onglets, forge, boutique, résultats), HUD, pause,
//  paramètres (G.settings), tutoriel, bannières, toasts, notifications,
//  modales, choix, infobulles, coffre piégé.
//  API G.UI conservée (CONTRACT.md + CONTRACT-V3.md §10). Toutes les
//  fonctions sont défensives (appel avant init() ou données partielles).
//  Dépend (au runtime, optionnel) de G.Icons (js/ui/icons.js) et G.DS (js/ui/ds.js).
// =====================================================================
(() => {
  const G = window.G;

  // ------------------------------------------------------------------
  //  OUTILS
  // ------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const DATA = () => G.DATA || {};
  const isNum = v => typeof v === 'number' && isFinite(v);
  const num = (v, d = 0) => (isNum(v) ? v : d);
  const clamp01 = v => Math.max(0, Math.min(1, num(v)));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safe = (fn, dflt) => { try { const r = fn(); return r === undefined ? dflt : r; } catch (_) { return dflt; } };
  const fmtInt = n => String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const round = (v, d = 1) => { const k = Math.pow(10, d); return Math.round(num(v) * k) / k; };
  const fmtDec = (v, d = 2) => String(round(v, d)).replace('.', ',');
  function fmtTime(s) {
    if (!isNum(s)) return '--:--';
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function cssColor(c, dflt = '#46d4ff') {
    if (isNum(c)) return '#' + (Math.max(0, Math.floor(c)) & 0xffffff).toString(16).padStart(6, '0');
    if (typeof c === 'string' && c) return c;
    return dflt;
  }
  /** Icône SVG du système de design (secours : texte/emoji échappé) */
  function ico(name, size, fallback) {
    const s = safe(() => (G.Icons && G.Icons.has(name) ? G.Icons.svg(name, { size: size || 20 }) : ''), '');
    return s || esc(fallback == null ? '' : fallback);
  }
  const hasIco = n => !!safe(() => G.Icons && G.Icons.has(n), false);
  function fillIcons(root) {
    (root || document).querySelectorAll('[data-ico]').forEach(el => {
      if (el._ico === el.dataset.ico) return;
      el._ico = el.dataset.ico;
      const s = ico(el.dataset.ico, +el.dataset.size || undefined);
      if (s) el.innerHTML = s;
    });
  }
  function sfx(name) { try { if (G.sfx && G.sfx.play) G.sfx.play(name); } catch (_) {} }
  function dsTransition(from, to, type, o) { try { if (G.DS && G.DS.transition) return G.DS.transition(from, to, type, o); } catch (_) {} return null; }
  function countUp(el, a, b, ms, o) {
    if (!el) return;
    if (G.DS && G.DS.countUp) { G.DS.countUp(el, a, b, ms, o); return; }
    el.textContent = (o && o.prefix || '') + fmtInt(b);
  }
  // Appelle UI.on[name] (game.js peut remplacer l'objet entier : on relit toujours UI.on)
  function call(name, ...args) {
    const f = UI.on && UI.on[name];
    if (typeof f === 'function') { try { return f(...args); } catch (e) { console.error('[UI.on.' + name + ']', e); } }
    return undefined;
  }
  function hasCb(name) { return !!(UI.on && typeof UI.on[name] === 'function'); }
  function tap(el, fn, sound = 'click') {
    if (!el || el._tap) return;
    el._tap = true;
    el.addEventListener('click', e => {
      if (sound) sfx(sound);
      try { fn(e); } catch (err) { console.error('[UI]', err); }
    });
  }
  const cache = new WeakMap();
  function setText(el, v) {
    if (!el) return;
    v = String(v == null ? '' : v);
    if (cache.get(el) === v) return;
    cache.set(el, v); el.textContent = v;
  }
  function setStyle(el, prop, v) {
    if (!el) return;
    const key = '_s_' + prop;
    if (el[key] === v) return;
    el[key] = v;
    if (prop.startsWith('--')) el.style.setProperty(prop, v); else el.style[prop] = v;
  }
  function toggle(el, cls, on) { if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
  function restartAnim(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  const isTouch = () => safe(() => matchMedia('(pointer: coarse)').matches, false);
  function vibrate(p) { try { if (G.settings && G.settings.vibration && navigator.vibrate) navigator.vibrate(p); } catch (_) {} }

  const STAR_D = 'M12 2.6l2.9 5.9 6.5 1-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-1z';
  function starSVG(on) {
    return `<span class="star${on ? ' on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="s-off" d="${STAR_D}"/><path class="s-on" d="${STAR_D}"/></svg></span>`;
  }

  // ------------------------------------------------------------------
  //  DONNÉES (tolère l'absence de G.DATA ; préfère G.CLASSES v3)
  // ------------------------------------------------------------------
  const classesObj = () => DATA().CLASSES || {};
  function classInfo(id) {
    const C = classesObj();
    const c2 = C[id] || Object.values(C).find(x => x && x.id === id) || {};
    const c3 = (G.CLASSES && G.CLASSES[id]) || {};
    const base = c3.base || {};
    return {
      id: c3.id || c2.id || id || '?', name: c3.name || c2.name || id || 'Héros', icon: c3.icon || c2.icon || '🛡️',
      pv: isNum(base.pv) ? base.pv : c2.pv, speed: isNum(base.vitesse) ? base.vitesse : c2.speed,
      color: cssColor(c3.color != null ? c3.color : c2.color), desc: c3.desc || c2.desc || '', bonus: c2.bonus || {}, evolutions: Array.isArray(c3.evolutions) ? c3.evolutions : [],
    };
  }
  const RANK_COLORS = { E: '#9aa3ad', D: '#4fd17a', C: '#3fa9ff', B: '#b44dff', A: '#ff8a1a', S: '#ff3d3d', Z: '#ffd700' };
  const RARITY_COLORS = { commun: '#b8c0cc', rare: '#3fa9ff', epique: '#b44dff', legendaire: '#ffb020', mythique: '#ff3d6e', secret: '#00ffd0' };
  const RARITY_NAMES = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire', mythique: 'Mythique', secret: 'Secret' };
  const rankOrder = () => (G.Ranks && Array.isArray(G.Ranks.order) && G.Ranks.order.length ? G.Ranks.order : ['E', 'D', 'C', 'B', 'A', 'S', 'Z']);
  function rankIndex(r) { const i = rankOrder().indexOf(r); return i < 0 ? 0 : i; }
  function rankDef(id) {
    const arr = Array.isArray(G.RANKS) ? G.RANKS : (G.RANKS && typeof G.RANKS === 'object' ? Object.values(G.RANKS) : []);
    return arr.find(r => r && r.id === id) || null;
  }
  function rankColor(id) { const d = rankDef(id); return cssColor(d && d.color != null ? d.color : null, RANK_COLORS[id] || RANK_COLORS.E); }
  function rankName(id) { const d = rankDef(id); return (d && d.name) || ('Rang ' + id); }
  function normRarity(r) {
    const k = String(r == null ? 'commun' : r).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
    return RARITY_COLORS[k] ? k : 'commun';
  }
  function rarityColor(r) { return RARITY_COLORS[normRarity(r)]; }
  /** Badge de rang hexagonal (.ds-rank) ; size : xs|sm|md|lg|xl */
  function rankBadgeHTML(id, size) {
    id = String(id || 'E').replace(/[^A-Za-z]/g, '').toUpperCase() || 'E';
    const sz = ['xs', 'sm', 'md', 'lg', 'xl'].indexOf(size) >= 0 ? size : 'md';
    return `<span class="ds-rank ds-rank--${sz} rank-badge" data-rank="${esc(id)}" data-r="${esc(id)}" style="--rk:${esc(rankColor(id))}" title="${esc(rankName(id))}">${esc(id)}</span>`;
  }
  function profileRank(p) {
    let r = p && p.rank;
    if (!r) { const c = safe(() => G.Ranks.current(p), null); r = c && typeof c === 'object' ? c.id : c; }
    return typeof r === 'string' && r ? r : 'E';
  }
  function evolvedClassName(p) {
    const c = classInfo(p && p.classe);
    const ri = rankIndex(profileRank(p));
    let name = c.name;
    c.evolutions.forEach(e => { if (e && e.name && rankIndex(e.rank) <= ri) name = e.name; });
    return name;
  }
  function weaponsList() {
    const W = DATA().WEAPONS || {};
    return Object.keys(W).map(k => Object.assign({ id: k }, W[k])).sort((a, b) => num(a.slot, 9) - num(b.slot, 9));
  }
  const WEAPON_COLORS = { epee: '#b8c9de', dague: '#3fd8b8', feu: '#ff7a2e' };
  const WEAPON_ICONS = { epee: 'sword', dague: 'dagger', feu: 'fire' };
  function xpFor(n) { return safe(() => DATA().XP.forLevel(n), null); }
  function maxLevel() { return num(safe(() => DATA().XP.maxLevel, 30), 30); }
  function itemsList() {
    const I = DATA().ITEMS || {};
    return Object.keys(I).map(k => Object.assign({ id: k, name: k }, I[k]));
  }
  function bonusText(bonus) {
    const names = { epee: 'Épée', dague: 'Dague', feu: 'Feu' };
    const out = [];
    for (const k in (bonus || {})) {
      const v = bonus[k];
      if (!isNum(v)) continue;
      const pct = (v > 0 && v < 5) ? Math.round((v - 1) * 100) : Math.round(v);
      if (!pct) continue;
      out.push(`${names[k] || k} ${pct > 0 ? '+' : ''}${pct}%`);
    }
    return out;
  }
  const profNow = () => (G.game && G.game.profile) || lastProfile;
  function portraitHTML(p, size) {
    const viaCos = safe(() => (G.Cosmetics && typeof G.Cosmetics.portraitHtml === 'function' ? G.Cosmetics.portraitHtml(p, { size }) : ''), '');
    if (viaCos) return viaCos;
    const c = classInfo(p && p.classe);
    const ini = String((p && p.nom) || 'H').trim().charAt(0).toUpperCase() || 'H';
    return `<span class="ds-portrait" style="--pc:${esc(c.color)};--ps:${size}px"><b>${esc(ini)}</b><i>${esc(c.icon)}</i></span>`;
  }

  // ------------------------------------------------------------------
  //  OBJET PUBLIC
  // ------------------------------------------------------------------
  const UI = G.UI = G.UI || {};
  UI.on = UI.on || {};
  let inited = false;
  let current = null;
  let lastProfile = null;
  let selectedClass = null;
  let hasSaveFlag = false;

  // ==================================================================
  //  PARAMÈTRES (G.settings) — persistés dans localStorage
  // ==================================================================
  const SET_KEY = 'donjon-arena-settings';
  const DEFAULTS = {
    volume: 80, sfxVolume: 100, musicVolume: 70,
    quality: 'auto', shadows: true, resolution: 'auto', shake: 'normal', screenFlash: true, reduceMotion: false,
    autoAim: true, damageNumbers: true, vibration: true, hints: true,
    joySize: 'm', hudOpacity: 100, btnSize: 'm', showKeys: true,
    horror: 'normal',
  };
  function loadSettings() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(SET_KEY) || 'null'); } catch (_) { o = null; }
    const s = Object.assign({}, DEFAULTS);
    if (o && typeof o === 'object') for (const k in DEFAULTS) if (k in o && typeof o[k] === typeof DEFAULTS[k]) s[k] = o[k];
    // réglage Horreur : G.Horror (chargé avant) a pu lire sa propre clé ; on ne l'écrase pas s'il n'est pas dans nos réglages
    const hz = G.settings && G.settings.horror;
    if (!(o && typeof o === 'object' && 'horror' in o) && (hz === 'normal' || hz === 'reduit' || hz === 'off')) s.horror = hz;
    if (s.horror !== 'normal' && s.horror !== 'reduit' && s.horror !== 'off') s.horror = 'normal';
    return s;
  }
  const settings = G.settings = Object.assign(G.settings && typeof G.settings === 'object' ? G.settings : {}, loadSettings());
  function saveSettings() {
    const o = {}; for (const k in DEFAULTS) o[k] = settings[k];
    try { localStorage.setItem(SET_KEY, JSON.stringify(o)); } catch (_) {}
  }
  function setSetting(k, v, silent) {
    if (!(k in DEFAULTS)) return;
    if (typeof v !== typeof DEFAULTS[k]) {
      if (typeof DEFAULTS[k] === 'number') v = +v; else if (typeof DEFAULTS[k] === 'boolean') v = !!v; else v = String(v);
    }
    if (settings[k] === v) return;
    settings[k] = v;
    saveSettings();
    applySettings(k);
    if (!silent) safe(() => G.bus && G.bus.emit && G.bus.emit('settingsChanged', { key: k, value: v, settings }));
  }
  Object.defineProperties(settings, {
    set: { value: setSetting, enumerable: false, configurable: true },
    save: { value: saveSettings, enumerable: false, configurable: true },
    defaults: { value: Object.assign({}, DEFAULTS), enumerable: false, configurable: true },
    reset: { value() { for (const k in DEFAULTS) settings[k] = DEFAULTS[k]; saveSettings(); applySettings(); safe(() => G.bus.emit('settingsChanged', { key: '*', settings })); }, enumerable: false, configurable: true },
  });
  UI.setSetting = setSetting;

  // ---- Audio : volume général via un gain inséré devant la destination de l'AudioContext ----
  const audioMasters = [];
  function audioGain() { return Math.max(0, Math.min(1, num(settings.volume, 80) / 100 * num(settings.sfxVolume, 100) / 100)); }
  function applyVolume() { audioMasters.forEach(g => { try { g.gain.value = audioGain(); } catch (_) {} }); }
  (function installAudioHook() {
    try {
      const N = window.AudioContext || window.webkitAudioContext;
      if (!N || N.__dsWrapped) return;
      class DSAudioContext extends N {
        constructor(...a) {
          super(...a);
          try {
            const real = super.destination;
            const g = N.prototype.createGain.call(this);
            g.connect(real);
            Object.defineProperty(this, 'destination', { value: g, configurable: true });
            audioMasters.push(g); applyVolume();
          } catch (_) {}
        }
      }
      DSAudioContext.__dsWrapped = true;
      window.AudioContext = DSAudioContext;
      if (window.webkitAudioContext) window.webkitAudioContext = DSAudioContext;
    } catch (_) {}
  })();

  // ---- branchements runtime (secousses, nombres de dégâts, visée auto) ----
  let hooksInstalled = false;
  function installRuntimeHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;
    // volume exposé sur G.sfx
    try {
      if (G.sfx && !('volume' in G.sfx)) Object.defineProperty(G.sfx, 'volume', { get: () => num(settings.volume, 80) / 100, set: v => setSetting('volume', Math.round(clamp01(v) * 100)), configurable: true });
      if (G.sfx && !G.sfx.setVolume) G.sfx.setVolume = v => setSetting('volume', Math.round(clamp01(v) * 100));
    } catch (_) {}
    // secousses d'écran
    try {
      if (G.core && typeof G.core.shake === 'function' && !G.core.shake.__ds) {
        const orig = G.core.shake;
        const w = function (a) { const m = settings.shake === 'off' ? 0 : settings.shake === 'reduit' ? 0.45 : 1; if (!m) return; return orig.call(this, (isNum(a) && a > 0 ? a : 0.3) * m); };
        w.__ds = true; G.core.shake = w;
      }
    } catch (_) {}
    // nombres de dégâts flottants
    try {
      if (G.fx && typeof G.fx.text === 'function' && !G.fx.text.__ds) {
        const orig = G.fx.text;
        const w = function (pos, text) { if (!settings.damageNumbers && /^[-+−]?\s*\d[\d\s.,]*\s*!*$/.test(String(text == null ? '' : text).trim())) return; return orig.apply(this, arguments); };
        w.__ds = true; G.fx.text = w;
      }
    } catch (_) {}
    // visée automatique désactivée : sans direction manuelle ni souris, on tire droit devant
    try {
      if (G.input && typeof G.input.fire === 'function' && !G.input.fire.__ds) {
        const orig = G.input.fire;
        const AIM = { cast1: 1, cast2: 1, cast3: 1, super: 1 };
        const w = function (name, data) {
          if (!settings.autoAim && AIM[name] && !(data && data.dir) && !(G.input.mouseActive && G.input.mouseWorld)) {
            const pl = safe(() => G.SkillAPI && G.SkillAPI.inRun() && G.SkillAPI.player(), null);
            if (pl && pl.dir) data = Object.assign({}, data || {}, { dir: pl.dir.clone ? pl.dir.clone() : { x: pl.dir.x, y: 0, z: pl.dir.z } });
          }
          return orig.call(this, name, data);
        };
        w.__ds = true; G.input.fire = w;
      }
    } catch (_) {}
  }
  function applyGraphics() {
    const V = safe(() => G.VFX && G.VFX.settings, null);
    if (V && typeof V === 'object') {
      const Q = { auto: [1, 300, true], haute: [1, 300, false], moyenne: [0.7, 200, false], basse: [0.45, 110, false] }[settings.quality] || [1, 300, true];
      V.quality = Q[0]; V.maxParticles = Q[1]; V.adaptive = Q[2];
      V.screenFlash = !!settings.screenFlash;
    }
    const R = safe(() => G.core && G.core.renderer, null);
    if (R) {
      try {
        if (R.shadowMap && R.shadowMap.enabled !== !!settings.shadows) {
          R.shadowMap.enabled = !!settings.shadows;
          const sc = G.core.scene;
          if (sc && typeof sc.traverse === 'function') sc.traverse(o => { const m = o && o.material; (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm) mm.needsUpdate = true; }); });
        }
      } catch (_) {}
      try {
        const dpr = window.devicePixelRatio || 1;
        const pr = { auto: Math.min(dpr, 1.75), eco: 1, standard: Math.min(dpr, 1.5), haute: Math.min(dpr, 2) }[settings.resolution] || Math.min(dpr, 1.75);
        const cur = typeof R.getPixelRatio === 'function' ? R.getPixelRatio() : null;
        if (typeof R.setPixelRatio === 'function' && (cur == null || Math.abs(cur - pr) > 0.01)) R.setPixelRatio(pr);
      } catch (_) {}
    }
  }
  function applyHudPrefs() {
    const r = document.documentElement;
    if (!r) return;
    r.style.setProperty('--joy-scale', { s: 0.8, m: 1, l: 1.2 }[settings.joySize] || 1);
    r.style.setProperty('--act-scale', { s: 0.86, m: 1, l: 1.14 }[settings.btnSize] || 1);
    r.style.setProperty('--hud-opacity', Math.max(0.35, Math.min(1, num(settings.hudOpacity, 100) / 100)));
    toggle(r, 'ds-reduce-motion', !!settings.reduceMotion);
    toggle(r, 'hide-keys', !settings.showKeys);
  }
  function applySettings(k) {
    if (!k || k === 'volume' || k === 'sfxVolume' || k === 'musicVolume') applyVolume();
    if (!k || ['quality', 'shadows', 'resolution', 'screenFlash'].indexOf(k) >= 0) applyGraphics();
    if (!k || ['joySize', 'btnSize', 'hudOpacity', 'reduceMotion', 'showKeys'].indexOf(k) >= 0) applyHudPrefs();
    if (k === 'horror' || !k) safe(() => { if (G.Horror && typeof G.Horror.setLevel === 'function') G.Horror.setLevel(settings.horror); });
  }

  // ==================================================================
  //  ÉCRANS + TRANSITIONS
  // ==================================================================
  const SCREENS = { title: 'screen-title', create: 'screen-create', hub: 'screen-hub', forge: 'screen-forge', game: 'screen-game', results: 'screen-results' };
  const TRANS = { title: 'fade', create: 'left', hub: 'zoom', forge: 'left', game: 'fade', results: 'up' };
  UI.showScreen = function (id) {
    if (!SCREENS[id]) id = 'title';
    const prev = current;
    current = id;
    if (prev === 'create' && id !== 'create') unmountClassSelect();
    if (id === 'hub' && prev !== 'hub' && prev !== 'forge') { campTab = null; tabsSig = ''; }
    const prevEl = prev && prev !== id ? $(SCREENS[prev]) : null;
    for (const k in SCREENS) {
      const el = $(SCREENS[k]);
      if (!el) continue;
      const show = k === id || (id === 'results' && k === 'game');
      toggle(el, 'active', show);
      if (k === id && el.classList.contains('screen')) el.scrollTop = 0;
    }
    if (id !== 'game') { UI.setPaused(false); hideCoach(); }
    if (id !== 'game' && id !== 'results') {
      UI.hud.setBoss(null);
      const b = $('ov-banner-in'); if (b) b.className = 'ov-banner-in';
    }
    if (id === 'game') { const h = $('screen-results'); toggle(h, 'active', false); }
    if (id === 'create') { if (!mountClassSelect()) prepareCreate(); }
    if (id === 'hub') renderCamp(0);
    if (id === 'title') UI.renderTitle(hasSaveFlag);
    titleFX(id === 'title');
    syncSound();
    // transition (non bloquante) : l'ancien écran s'efface pendant que le nouveau entre
    if (prev && prev !== id) {
      const toEl = $(SCREENS[id]);
      const leaving = (id === 'results' && prev === 'game') ? null : (prev === 'results' && id === 'game' ? null : prevEl);
      if (leaving && prev === 'results') { const g = $('screen-game'); if (g && id !== 'game') dsTransition(g, null, 'fade', { flash: false }); }
      dsTransition(leaving, id === 'results' ? $('results-card') : toEl, TRANS[id], { flash: id !== 'game' && id !== 'results', duration: id === 'results' ? 340 : 300 });
    }
  };
  UI.current = () => current;

  // ------------------------------------------------------------------
  //  SON
  // ------------------------------------------------------------------
  function isMuted() { return !!safe(() => G.sfx.muted, false); }
  function syncSound() {
    const m = isMuted();
    document.querySelectorAll('.btn-sound').forEach(b => {
      if (b._muted === m) return;
      b._muted = m;
      b.innerHTML = ico(m ? 'sound-off' : 'sound-on', b.classList.contains('ds-icon-btn--sm') ? 18 : 22, m ? '🔇' : '🔊');
      b.setAttribute('aria-label', m ? 'Activer le son' : 'Couper le son'); b.title = m ? 'Son coupé' : 'Son activé';
      toggle(b, 'is-muted', m);
    });
    const ps = $('pause-sound'); if (ps) setText(ps, m ? 'Son : coupé' : 'Son : activé');
  }
  function toggleSound() {
    try { if (G.sfx && G.sfx.unlock) G.sfx.unlock(); if (G.sfx && G.sfx.toggle) G.sfx.toggle(); } catch (_) {}
    syncSound();
  }

  // ==================================================================
  //  TITRE : fond animé (vortex canvas 2D + particules + parallaxe)
  // ==================================================================
  const tfx = { on: false, raf: 0, parts: [], w: 0, h: 0, dpr: 1, mx: 0, my: 0, px: 0, py: 0, t0: 0 };
  function titleFX(on) {
    if (on === tfx.on) return;
    tfx.on = on;
    if (on) { tfx.t0 = performance.now(); tfx.raf = requestAnimationFrame(titleFrame); }
    else cancelAnimationFrame(tfx.raf);
  }
  function titleResize(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    if (w === tfx.w && h === tfx.h && dpr === tfx.dpr) return;
    tfx.w = w; tfx.h = h; tfx.dpr = dpr;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const n = Math.round(Math.min(260, 90 + w * h / 6000));
    tfx.parts = Array.from({ length: n }, () => newPart(true));
  }
  function newPart(anywhere) {
    const R = Math.hypot(tfx.w, tfx.h) * 0.62;
    return { a: Math.random() * Math.PI * 2, r: anywhere ? 20 + Math.random() * R : R * (0.85 + Math.random() * 0.2), s: 0.3 + Math.random() * 1.1, z: Math.random(), hue: Math.random() < 0.7 ? 0 : 1 };
  }
  function titleFrame(now) {
    if (!tfx.on) return;
    tfx.raf = requestAnimationFrame(titleFrame);
    const cv = $('title-canvas');
    if (!cv || document.hidden) return;
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return;
    titleResize(cv);
    const t = (now - tfx.t0) / 1000, w = tfx.w, h = tfx.h, dpr = tfx.dpr;
    const reduce = settings.reduceMotion || safe(() => G.DS.reducedMotion(), false);
    tfx.px += (tfx.mx - tfx.px) * 0.05; tfx.py += (tfx.my - tfx.py) * 0.05;
    const cx = w / 2 + tfx.px * 22, cy = h * (w > h ? 0.3 : 0.27) + tfx.py * 16;
    const R = Math.min(w, h) * (w > h ? 0.36 : 0.44);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // fond
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.9);
    bg.addColorStop(0, '#16224a'); bg.addColorStop(0.35, '#0b1430'); bg.addColorStop(1, '#04060e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // halo du portail
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    const halo = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.25);
    halo.addColorStop(0, 'rgba(180,240,255,' + (0.55 + pulse * 0.15) + ')');
    halo.addColorStop(0.18, 'rgba(70,212,255,.35)');
    halo.addColorStop(0.45, 'rgba(139,107,255,.16)');
    halo.addColorStop(1, 'rgba(10,16,40,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
    // anneaux du vortex (ellipses inclinées en rotation)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const k = i / 6;
      const rr = R * (0.28 + k * 0.78);
      const rot = (reduce ? 0 : t * (0.25 + (1 - k) * 0.5)) * (i % 2 ? -1 : 1) + i;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.42, rot * 0.15, rot, rot + Math.PI * (1.1 + k * 0.5));
      ctx.strokeStyle = i % 3 === 2 ? 'rgba(139,107,255,' + (0.42 - k * 0.25) + ')' : 'rgba(70,212,255,' + (0.5 - k * 0.32) + ')';
      ctx.lineWidth = 2.2 - k * 1.2;
      ctx.shadowColor = i % 3 === 2 ? '#8b6bff' : '#46d4ff'; ctx.shadowBlur = 12;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // particules aspirées en spirale
    const parts = tfx.parts, dt = reduce ? 0 : 1;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.a += dt * (0.004 + 1.6 / Math.max(30, p.r)) * p.s;
      p.r -= dt * (0.25 + 60 / Math.max(40, p.r)) * p.s * 0.6;
      if (p.r < 8) { parts[i] = newPart(false); continue; }
      const x = Math.cos(p.a) * p.r, y = Math.sin(p.a) * p.r * 0.5;
      const near = 1 - Math.min(1, p.r / (R * 1.6));
      const sz = 0.6 + p.z * 1.6 + near * 1.2;
      ctx.fillStyle = p.hue ? 'rgba(185,166,255,' + (0.25 + near * 0.6) + ')' : 'rgba(150,230,255,' + (0.25 + near * 0.65) + ')';
      ctx.fillRect(x - sz / 2 + tfx.px * p.z * 10, y - sz / 2 + tfx.py * p.z * 8, sz, sz);
    }
    // cœur
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.22);
    core.addColorStop(0, 'rgba(255,255,255,.7)'); core.addColorStop(0.4, 'rgba(160,236,255,.32)'); core.addColorStop(1, 'rgba(70,212,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.22, R * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    // sol en perspective (grille)
    const hy = h * 0.72;
    ctx.strokeStyle = 'rgba(70,212,255,.07)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -12; i <= 12; i++) { ctx.moveTo(w / 2 + i * 18 + tfx.px * 6, hy); ctx.lineTo(w / 2 + i * 140 + tfx.px * 30, h); }
    for (let j = 0; j < 7; j++) { const yy = hy + Math.pow(j / 7, 1.8) * (h - hy) + ((t * 8) % 12) * (j / 7); ctx.moveTo(0, yy); ctx.lineTo(w, yy); }
    ctx.stroke();
  }
  window.addEventListener('pointermove', e => { if (!tfx.on) return; tfx.mx = (e.clientX / (window.innerWidth || 1)) * 2 - 1; tfx.my = (e.clientY / (window.innerHeight || 1)) * 2 - 1; }, { passive: true });

  UI.renderTitle = function (hasSave) {
    hasSaveFlag = !!hasSave;
    const c = $('btn-continue');
    if (c) c.style.display = hasSaveFlag ? '' : 'none';
    const n = $('btn-new');
    if (n) toggle(n, 'ds-btn--primary', !hasSaveFlag);
    const p = hasSaveFlag ? (profNow() || safe(() => G.save.load(), null)) : null;
    const card = $('title-hero');
    if (card) {
      if (p && p.nom) {
        const rk = profileRank(p);
        const sig = [p.nom, p.classe, rk, p.niveau, p.cosmetics && JSON.stringify(p.cosmetics)].join('|');
        if (card._sig !== sig) {
          card._sig = sig;
          card.innerHTML = `<div class="th-portrait">${portraitHTML(p, 48)}</div>
            <div class="th-id"><div class="th-kicker">Héros sauvegardé</div><div class="th-name">${esc(p.nom)}</div>
            <div class="th-meta"><span>${esc(evolvedClassName(p))}</span><span class="th-dot"></span><span>Niv. <b>${num(p.niveau, 1)}</b></span></div></div>
            <div class="th-rank">${rankBadgeHTML(rk, 'md')}</div>`;
        }
        card.hidden = false;
      } else card.hidden = true;
    }
    const info = $('title-save-info');
    if (info) setText(info, hasSaveFlag && p && p.nom ? '' : 'Aucune sauvegarde : commence une nouvelle aventure !');
  };

  // ---- compte en ligne sur l'écran titre : se connecter pour retrouver son héros ----
  function renderTitleAccount() {
    const box = $('title-account'); if (!box) return;
    const O = G.Online;
    const mode = O && O.mode;
    if (!O || (mode !== 'firebase' && mode !== 'loading')) { box.hidden = true; box.innerHTML = ''; return; }
    let sig, html;
    if (mode === 'loading') { sig = 'loading'; html = '<p class="ta-note">Connexion au serveur…</p>'; }
    else if (!O.user) {
      sig = 'out';
      html = '<button class="ds-btn ds-btn--lg ds-btn--block ta-signin" type="button" data-ta="in"><span class="ds-btn__icon">' + ico('user', 18) + '</span><span class="ds-btn__label">Se connecter à mon compte</span></button>'
        + '<p class="ta-note">Tu as déjà un compte ? Retrouve ton héros, tes amis et ta guilde.</p>';
    } else {
      const nm = esc((O.me && O.me.name) || O.user.name || 'Joueur');
      sig = 'in|' + nm + '|' + (O.cloudAt ? 1 : 0);
      html = '<div class="ta-who"><span class="ta-dot"></span><span>Connecté : <b>' + nm + '</b></span>'
        + '<button class="ds-btn ds-btn--ghost ds-btn--sm" type="button" data-ta="out">Changer de compte</button></div>'
        + (O.cloudAt ? '<p class="ta-note">Héros sauvegardé sur ton compte.</p>' : '');
    }
    if (box._sig !== sig) { box._sig = sig; box.innerHTML = html; }
    box.hidden = false;
  }
  function initTitleAccount() {
    const box = $('title-account'); if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ta]'); if (!b || !G.Online) return;
      sfx('click');
      if (b.dataset.ta === 'in') G.Online.signIn();
      else G.Online.signOut();
    });
    if (G.bus) G.bus.on('online', renderTitleAccount);
    renderTitleAccount();
  }
  UI.renderTitleAccount = renderTitleAccount;

  // ==================================================================
  //  CRÉATION DU PERSONNAGE
  // ==================================================================
  let csMounted = false;
  function mountClassSelect() {
    const CS = G.ClassSelect;
    const scr = $('screen-create'), host = $('create-cs');
    if (!CS || typeof CS.mount !== 'function' || !scr || !host) return false;
    unmountClassSelect();
    host.innerHTML = '';
    scr.classList.add('cs-mode');
    try {
      CS.mount(host, {
        onConfirm: (classId, nom, extra) => call('newGame', String(nom || '').trim() || 'Héros', classId, extra),
        onCancel: () => UI.showScreen('title'),
        profile: null,
      });
      csMounted = true;
      return true;
    } catch (e) {
      console.error('[UI] G.ClassSelect.mount', e);
      scr.classList.remove('cs-mode'); host.innerHTML = '';
      return false;
    }
  }
  function unmountClassSelect() {
    const scr = $('screen-create'), host = $('create-cs');
    if (csMounted) { csMounted = false; try { G.ClassSelect && G.ClassSelect.unmount && G.ClassSelect.unmount(); } catch (e) { console.error('[UI] G.ClassSelect.unmount', e); } }
    if (scr) scr.classList.remove('cs-mode');
    if (host) host.innerHTML = '';
  }
  function prepareCreate() {
    const grid = $('class-grid');
    if (!grid) return;
    const ids = Object.keys(classesObj());
    if (!ids.length) { grid.innerHTML = '<p class="create-warn">Classes indisponibles.</p>'; }
    else {
      if (!selectedClass || ids.indexOf(selectedClass) < 0) selectedClass = ids[0];
      grid.innerHTML = ids.map(id => {
        const c = classInfo(id);
        const b = bonusText(c.bonus);
        const sp = num(c.speed, 0);
        return `<button type="button" class="ds-card class-card${id === selectedClass ? ' is-selected sel' : ''}" data-class="${esc(id)}" style="--c:${esc(c.color)}">
          <span class="ds-card__media">${esc(c.icon)}</span>
          <span class="ds-card__title">${esc(c.name)}</span>
          <span class="cc-stats"><span class="ds-chip">${ico('heart', 14)}<b>${isNum(c.pv) ? c.pv : '—'}</b> PV</span><span class="ds-chip">${ico('dash', 14)}<b>${sp ? fmtDec(sp, 1) : '—'}</b></span></span>
          <span class="ds-card__meta">${b.length ? b.map(esc).join(' · ') : 'Équilibré'}</span>
        </button>`;
      }).join('');
      grid.querySelectorAll('.class-card').forEach(card => tap(card, () => {
        selectedClass = card.dataset.class;
        grid.querySelectorAll('.class-card').forEach(x => { toggle(x, 'is-selected', x === card); toggle(x, 'sel', x === card); });
        updatePreview();
      }));
    }
    const warn = $('create-warn');
    if (warn) setText(warn, hasSaveFlag ? 'Une nouvelle partie remplacera ta sauvegarde actuelle.' : '');
    updatePreview();
  }
  function heroName() {
    const inp = $('create-name');
    const v = inp ? inp.value.replace(/\s+/g, ' ').trim().slice(0, 14) : '';
    return v || 'Héros';
  }
  function updatePreview() {
    const c = classInfo(selectedClass);
    const ava = $('create-preview-ava');
    if (ava) { ava.textContent = c.icon; ava.style.setProperty('--c', c.color); }
    const t = $('create-preview-text');
    if (t) {
      const pv = isNum(c.pv) ? c.pv : '?';
      const extra = isNum(c.speed) ? ` et une vitesse de ${fmtDec(c.speed, 1)}` : '';
      t.innerHTML = `<b>${esc(heroName())}</b> — ${esc(c.name)} de niveau 1 avec <b>${esc(pv)} PV</b>${extra}.` + (c.desc ? `<span class="class-desc">${esc(c.desc)}</span>` : '');
    }
  }

  // ==================================================================
  //  CAMP (HUB) : en-tête + onglets pilotés par G.Panels
  // ==================================================================
  let campTab = null, campRendering = false, campRaf = 0, tabsSig = '';
  const panels = () => G.Panels || { all: () => [], get: () => null, has: () => false, register() {} };
  const TAB_ICONS = { portails: 'portal', heros: 'user', competences: 'sparkles', dons: 'rune', inventaire: 'bag', armee: 'army', forge: 'anvil', boutique: 'shop', succes: 'trophy', perso: 'palette', donjons: 'swords' };
  function tabIcon(d, size) {
    const n = TAB_ICONS[d.id] || (hasIco(d.icon) ? d.icon : null);
    return n ? ico(n, size) : `<span class="ct-emo">${esc(d.icon || '◈')}</span>`;
  }
  const SHORT = { competences: 'Compét.', inventaire: 'Sac', perso: 'Style', personnalisation: 'Style', heros: 'Héros', succes: 'Succès', portails: 'Portails', boutique: 'Boutique' };
  const shortTitle = (t, id) => SHORT[id] || String(t || '').split(/\s+&\s+|\s+-\s+/)[0];

  function visiblePanels(p) {
    let all = [];
    try { all = panels().all() || []; } catch (_) {}
    return all.filter(d => d && d.id && safe(() => (typeof d.visible === 'function' ? d.visible(p) : true), true) !== false)
      .sort((a, b) => num(a.order, 50) - num(b.order, 50));
  }
  function defaultTab(list) {
    const pt = list.find(d => d.id === 'portails');
    return (pt || list[0] || {}).id || null;
  }

  function updateCampHeader(p) {
    const niveau = num(p.niveau, 1);
    const c = classInfo(p.classe);
    setText($('hub-gold'), fmtInt(num(p.gold, 0)));
    setText($('hub-name'), p.nom || 'Héros');
    setText($('hub-class'), evolvedClassName(p));
    setText($('hub-cico'), c.icon);
    setText($('hub-level'), niveau);
    const need = niveau >= maxLevel() ? null : xpFor(niveau);
    const xp = num(p.xp, 0);
    setStyle($('hub-xp-fill'), 'width', ((need ? clamp01(xp / need) : 1) * 100).toFixed(1) + '%');
    setText($('hub-xp-text'), need ? `${fmtInt(xp)} / ${fmtInt(need)} XP` : 'NIVEAU MAX');
    const pw = safe(() => G.Stats.compute(p).power, null);
    const pe = $('hub-power');
    if (pe) { pe.style.display = isNum(pw) ? '' : 'none'; if (isNum(pw)) setText(pe.querySelector('b'), fmtInt(pw)); }
    const gems = safe(() => (p.talents && isNum(p.talents.shards) ? p.talents.shards : null), null);
    const ge = $('hub-gems');
    if (ge) { ge.hidden = !(gems > 0); if (gems > 0) { setText($('hub-gems-n'), fmtInt(gems)); ge.title = 'Éclats de don'; } }
    const rk = profileRank(p);
    const re = $('hub-rank');
    if (re && re._rk !== rk + rankColor(rk)) { re._rk = rk + rankColor(rk); re.innerHTML = rankBadgeHTML(rk, 'sm'); }
    const pt = $('hub-portrait');
    if (pt) {
      const sig = [p.nom, p.classe, JSON.stringify(p.cosmetics || null)].join('|');
      if (pt._sig !== sig) { pt._sig = sig; pt.innerHTML = portraitHTML(p, 44); }
    }
    const head = $('hub-hero');
    if (head) {
      const bc = safe(() => (G.Cosmetics && typeof G.Cosmetics.bannerClass === 'function' ? G.Cosmetics.bannerClass(p) : ''), '');
      if (head._bc !== bc) {
        Array.from(head.classList).filter(k => k.indexOf('cos-banner--') === 0).forEach(k => head.classList.remove(k));
        if (bc) String(bc).split(/\s+/).filter(Boolean).forEach(k => head.classList.add(k));
        head._bc = bc;
      }
    }
  }

  function renderTabs(list, p) {
    const bar = $('camp-tabs');
    if (!bar) return;
    const sig = list.map(d => d.id + '|' + (d.icon || '') + '|' + (d.title || '') + '|' + badgeOf(d, p)).join(';') + '#' + campTab;
    if (sig === tabsSig) return;
    const first = !bar.childElementCount;
    tabsSig = sig;
    bar.innerHTML = list.map(d => {
      const b = badgeOf(d, p);
      const bh = b === true ? '<span class="ct-badge dot"></span>' : (b ? `<span class="ct-badge">${esc(b)}</span>` : '');
      return `<button type="button" role="tab" class="ctab${d.id === campTab ? ' on is-active' : ''}" data-tab="${esc(d.id)}" aria-selected="${d.id === campTab}" title="${esc(d.title || d.id)}">` +
        `<span class="ct-ico">${tabIcon(d, 22)}</span><span class="ct-lbl">${esc(d.title || d.id)}</span><span class="ct-lbl-s">${esc(shortTitle(d.title || d.id, d.id))}</span>${bh}</button>`;
    }).join('');
    if (first && G.DS && G.DS.stagger) G.DS.stagger(bar);
  }
  function badgeOf(d, p) {
    if (typeof d.badge !== 'function') return '';
    const b = safe(() => d.badge(p), '');
    if (b === true) return true;
    if (typeof b === 'number') return b > 0 ? (b > 99 ? '99+' : String(b)) : '';
    return b ? String(b) : '';
  }

  // ---- tuto en bulles de chaque page du camp (comme le tuto des touches) : 1re visite automatique, puis bouton « ? Aide » ----
  const KEY = (a) => { try { return G.Keys && G.Keys.labelOf ? G.Keys.labelOf(a) : a; } catch (_) { return a; } };
  // s : élément visé (1er sélecteur visible) · t : titre · x : texte court (HTML simple)
  const GUIDES = {
    portails: () => [
      { s: '.pt-card', t: 'Un portail = un donjon', x: 'La lettre est la difficulté. Tu entres seulement dans ceux de ton rang.' },
      { s: '.pt-go', t: 'Entrer', x: 'Clique ici pour lancer le donjon.' },
      { s: '.pt-filters', t: 'Filtres', x: 'Affiche tous les portails, ceux disponibles ou les spéciaux.' },
      { s: '.pt-rkline', t: 'Ton rang', x: 'Monte de rang pour débloquer des portails plus durs.' },
    ],
    heros: () => [
      { s: '.rk-reqs', t: 'Prochain rang', x: 'Remplis ces conditions…' },
      { s: '.rk-trial', t: 'Épreuve', x: '…puis réussis cette épreuve pour monter de rang.' },
      { s: '.rk-attr', t: 'Attributs', x: 'Tes points d’attributs : clique sur + pour les répartir.' },
      { s: '.rk-titles', t: 'Titre', x: 'Choisis le titre affiché sous ton nom.' },
    ],
    competences: () => [
      { s: '.sk-points', t: 'Tes points', x: 'Tu gagnes 1 point à chaque niveau.' },
      { s: '.sk-list, .sk-tl', t: 'Choisis', x: 'Clique sur une compétence pour la voir.' },
      { s: '.sk-side', t: 'Apprendre', x: '<b>Apprendre</b> / <b>Améliorer</b> dépense tes points. Puis <b>Équiper</b> sur une touche.' },
      { s: '.sk-kit', t: 'Ton kit', x: 'Tes sorts sur les touches <b>' + esc(KEY('cast1')) + '</b>, <b>' + esc(KEY('cast2')) + '</b>, <b>' + esc(KEY('cast3')) + '</b> et l’ultime <b>' + esc(KEY('super')) + '</b>.' },
      { s: '[data-act="respec"]', t: 'Réinitialiser', x: 'Rend tous tes points contre un peu d’or.' },
    ],
    dons: () => [
      { s: '.tl-slots', t: 'Emplacements', x: 'Tes dons équipés. Ton rang en débloque d’autres.' },
      { s: '.tl-grid', t: 'Collection', x: 'Clique sur un don puis <b>Équiper</b>.' },
      { s: '.tl-stat.gem', t: 'Éclats', x: 'Les doublons donnent des éclats pour améliorer tes dons.' },
    ],
    inventaire: () => [
      { s: '.inv-doll', t: 'Équipement', x: 'Ce que ton héros porte.' },
      { s: '.inv-grid, .inv-cap', t: 'Ton sac', x: 'Clique sur un objet pour l’équiper ou le recycler.' },
      { s: '.inv-tool', t: 'Trier', x: 'Filtre par rareté et trie ton sac.' },
      { s: '.inv-root > .ds-tabs', t: 'Onglets', x: 'Matériaux à vendre et fabrication d’objets.' },
    ],
    perso: () => [
      { s: '.cos-tabs', t: 'Apparence', x: 'Skins, auras, cadres, bannières et titres.' },
      { s: '.cos-grid', t: 'Débloquer', x: 'Chaque carte dit comment l’obtenir.' },
      { s: '.cos-action', t: 'Équiper', x: 'Valide ton choix ici.' },
    ],
    forge: () => [
      { s: '.wcard', t: 'Tes pièces', x: 'Chaque pièce renforce tes sorts.' },
      { s: '.wcard .ds-btn--lg', t: 'Améliorer', x: 'Coûte de l’or : le prix est sur le bouton.' },
      { s: '.w-perks', t: 'Paliers', x: 'Bonus spécial aux niveaux 5 et 10.' },
    ],
    succes: () => [
      { s: '.rk-top', t: 'Progression', x: 'Tes succès et titres obtenus.' },
      { s: '.rk-ach', t: 'Défis', x: 'Réussis-les pour gagner des récompenses.' },
    ],
    boutique: () => [
      { s: '.shop-item', t: 'Potions', x: 'Achète-les avec ton or.' },
      { s: '.shop-hero', t: 'En donjon', x: 'Soin : touche <b>' + esc(KEY('potion1')) + '</b> · Mana : touche <b>' + esc(KEY('potion2')) + '</b>.' },
    ],
    guilde: () => [
      { s: '.gd-create, .gd-root .ds-card', t: 'Créer', x: 'Nom, tag et emblème, puis <b>Fonder la guilde</b>.' },
      { s: '.gd-join, .gd-root .ds-card + .ds-card', t: 'Rejoindre', x: 'Entre le code de 6 lettres d’un membre.' },
      { s: '.gd-root .ds-tabs, .gd-tabs', t: 'Ta guilde', x: 'Membres, discussion, journal et rôles.' },
      { s: '.gd-root', t: 'Compte', x: 'Il faut être connecté à ton compte (onglet En ligne).' },
    ],
    classement: () => [
      { s: '.lb-me', t: 'Ta place', x: 'Ton rang dans le classement.' },
      { s: '.lb-table', t: 'Joueurs', x: 'Triés par rang puis par niveau.' },
      { s: '.lb-filter', t: 'Filtrer', x: 'Affiche une seule classe.' },
      { s: '.lb-wrap', t: 'Classement', x: 'Connecte-toi pour y apparaître.' },
    ],
    enligne: () => [
      { s: '.net-tabs', t: 'En ligne', x: '<b>Compte</b> : connexion · <b>Amis</b> : code ami · <b>Groupe</b> : jouer ensemble.' },
      { s: '.net-body', t: 'Compte', x: 'Connecte-toi : ton héros est sauvegardé sur ton compte.' },
    ],
    armee: () => [
      { s: '.necro-slots', t: 'Actifs', x: 'Ces serviteurs te suivent en donjon.' },
      { s: '.necro-list', t: 'Réserve', x: 'Clique <b>Actif</b> / <b>Retirer</b> pour choisir qui vient.' },
      { s: '.necro-help', t: 'Plus de soldats', x: 'Tout est expliqué ici.' },
    ],
  };
  const GUIDE_KEY = 'donjon-guides-v2';
  const guideSeen = (id) => { try { return !!(JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}') || {})[id]; } catch (_) { return false; } };
  const guideMark = (id) => { try { const st = JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}') || {}; st[id] = 1; localStorage.setItem(GUIDE_KEY, JSON.stringify(st)); } catch (_) {} };
  let pc = { id: null, steps: [], i: -1, el: null, tgt: null, t: 0 };
  const visibleEl = (sel) => { const root = $('camp-panel'); if (!root) return null; for (const part of sel.split(',')) { let list = []; try { list = root.querySelectorAll(part.trim()); } catch (_) { list = []; } for (const el of list) { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4) return el; } } return null; };
  function stopPageCoach(done) {
    clearTimeout(pc.t);
    if (pc.tgt) pc.tgt.classList.remove('pc-target');
    if (pc.el) pc.el.remove();
    if (done && pc.id) guideMark(pc.id);
    pc = { id: null, steps: [], i: -1, el: null, tgt: null, t: 0 };
  }
  function startPageCoach(id) {
    stopPageCoach(false);
    const fn = GUIDES[id]; if (!fn) return;
    let steps = []; try { steps = fn() || []; } catch (_) { steps = []; }
    steps = steps.filter(s => visibleEl(s.s));                    // seulement les bulles dont l'élément est à l'écran
    if (!steps.length) return;
    pc.id = id; pc.steps = steps; pc.i = -1;
    pc.el = document.createElement('div'); pc.el.className = 'page-coach';
    document.body.appendChild(pc.el);
    stepPageCoach(1);
  }
  function stepPageCoach(d) {
    if (!pc.el) return;
    const n = pc.i + d;
    if (n < 0) return;
    if (n >= pc.steps.length) { stopPageCoach(true); return; }
    pc.i = n;
    const s = pc.steps[n], tgt = visibleEl(s.s);
    if (pc.tgt) pc.tgt.classList.remove('pc-target');
    pc.tgt = tgt;
    if (tgt) { try { tgt.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { tgt.scrollIntoView(); } tgt.classList.add('pc-target'); }
    const last = n === pc.steps.length - 1;
    pc.el.innerHTML = `<div class="coach-bubble ds-anim-pop" role="note"><div class="coach-head"><span class="coach-ico">${ico('tutorial', 18)}</span><b>${esc(s.t)}</b><span class="coach-n">${n + 1}/${pc.steps.length}</span></div><p>${s.x}</p><div class="coach-btns"><button type="button" class="ds-btn ds-btn--ghost ds-btn--sm pc-skip">Passer</button>${n > 0 ? '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm pc-prev">Retour</button>' : ''}<button type="button" class="ds-btn ds-btn--primary ds-btn--sm pc-next">${last ? 'Compris' : 'Suivant'}</button></div></div>`;
    const bub = pc.el.firstChild;
    bub.querySelector('.pc-next').addEventListener('click', () => { sfx('click'); stepPageCoach(1); });
    bub.querySelector('.pc-skip').addEventListener('click', () => { sfx('click'); stopPageCoach(true); });
    const pv = bub.querySelector('.pc-prev'); if (pv) pv.addEventListener('click', () => { sfx('click'); stepPageCoach(-1); });
    clearTimeout(pc.t);
    pc.t = setTimeout(() => placePageCoach(), tgt ? 320 : 0);      // après le défilement doux
    placePageCoach();
  }
  function placePageCoach() {
    if (!pc.el || !pc.el.firstChild) return;
    const bub = pc.el.firstChild, tgt = pc.tgt;
    const vw = window.innerWidth, vh = window.innerHeight, bw = Math.min(300, vw - 24);
    bub.style.width = bw + 'px';
    const bh = bub.offsetHeight || 120;
    let x, y, arrow = 'none';
    if (tgt && tgt.isConnected) {
      const r = tgt.getBoundingClientRect();
      x = Math.max(12, Math.min(vw - bw - 12, r.left + Math.min(r.width, 360) / 2 - bw / 2));
      if (r.bottom + bh + 18 < vh) { y = r.bottom + 12; arrow = 'up'; }
      else if (r.top - bh - 18 > 0) { y = r.top - bh - 12; arrow = 'down'; }
      else { y = Math.max(12, Math.min(vh - bh - 12, r.top + 12)); }
      bub.style.setProperty('--ax', Math.max(16, Math.min(bw - 16, r.left + Math.min(r.width, 360) / 2 - x)) + 'px');
    } else { x = (vw - bw) / 2; y = vh * 0.3; }
    bub.dataset.arrow = arrow;
    bub.style.left = x + 'px'; bub.style.top = y + 'px';
  }
  function renderGuide(def) {
    // ancien encadré de texte : remplacé par les bulles
    const box = $('camp-guide'); if (box) { box.hidden = true; box.innerHTML = ''; }
    if (pc.id && (!def || pc.id !== def.id)) stopPageCoach(false);
    if (def && GUIDES[def.id] && !guideSeen(def.id) && pc.id !== def.id) {
      const id = def.id;
      setTimeout(() => { if (campTab === id && current === 'hub' && !pc.id) startPageCoach(id); }, 450);   // 1re visite
    }
  }
  function initGuide() {
    const head = $('camp-panel-head');
    if (head) head.addEventListener('click', (e) => {
      const b = e.target.closest('[data-guide]'); if (!b || !campTab) return;
      sfx('click'); startPageCoach(campTab);
    });
    window.addEventListener('resize', () => placePageCoach());
    const main = $('hub-content'); if (main) main.addEventListener('scroll', () => placePageCoach(), { passive: true });
    if (G.bus) G.bus.on('screen', (e) => { if (!e || e.id !== 'hub') stopPageCoach(false); });
  }

  function renderPanelHead(def) {
    const h = $('camp-panel-head');
    if (!h) return;
    const sig = def ? def.id + '|' + def.title : '';
    if (h._sig === sig) { renderGuide(def); return; }
    h._sig = sig;
    h.innerHTML = def ? `<span class="cph-ico">${tabIcon(def, 20)}</span><h2 class="cph-title">${esc(def.title || def.id)}</h2><span class="cph-line"></span>` + (GUIDES[def.id] ? `<button type="button" class="cph-help ds-btn ds-btn--ghost ds-btn--sm" data-guide="toggle" aria-label="Comment ça marche ?"><span class="ds-btn__label">? Aide</span></button>` : '') : '';
    renderGuide(def);
  }
  function renderPanel(dir) {
    const host = $('camp-panel'), main = $('hub-content');
    if (!host || !main) return;
    const p = lastProfile || {};
    const def = campTab ? panels().get(campTab) : null;
    const scroll = dir ? 0 : main.scrollTop;
    if (host._def && typeof host._def.dispose === 'function') { try { host._def.dispose(host); } catch (_) {} }
    const node = document.createElement('div');
    node.id = 'camp-panel'; node.className = 'camp-panel';
    node.setAttribute('role', 'tabpanel');
    node._def = def;
    if (def) node.dataset.panel = def.id;
    renderPanelHead(def);
    try {
      if (!def || typeof def.render !== 'function') node.innerHTML = emptyHTML('info', 'Rien ici', 'Rien à afficher pour le moment.');
      else def.render(node, p, UI);
    } catch (e) {
      console.error('[UI] panneau ' + campTab, e);
      node.innerHTML = emptyHTML('warning', 'Panneau indisponible', 'Ce panneau a rencontré un problème.');
    }
    host.replaceWith(node);
    fillIcons(node);
    if (dir) {
      main.scrollTop = 0;
      dsTransition(null, node, dir > 0 ? 'slide-left' : dir < 0 ? 'slide-right' : 'up', { flash: false, duration: 260 });
      const hd = $('camp-panel-head'); if (hd) dsTransition(null, hd, 'fade', { flash: false, duration: 200 });
    } else main.scrollTop = scroll;
  }
  function emptyHTML(icon, title, text) {
    return `<div class="ds-empty"><span class="ds-empty__icon">${ico(icon, 30)}</span><div class="ds-empty__title">${esc(title)}</div><div>${esc(text)}</div></div>`;
  }

  function renderCamp(dir) {
    if (campRendering) return;
    campRendering = true;
    try {
      if (!lastProfile && G.game && G.game.profile) lastProfile = G.game.profile;
      const p = lastProfile || {};
      updateCampHeader(p);
      const list = visiblePanels(p);
      if (!campTab || !list.some(d => d.id === campTab)) { campTab = defaultTab(list); dir = dir || 0; tabsSig = ''; }
      renderTabs(list, p);
      renderPanel(dir);
      const on = document.querySelector('#camp-tabs .ctab.on');
      if (on && on.scrollIntoView && dir) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {} }
    } finally { campRendering = false; }
  }

  UI.setTab = UI.openPanel = function (id) {
    const list = visiblePanels(lastProfile || {});
    if (!list.some(d => d.id === id) || id === campTab) return;
    const oi = list.findIndex(d => d.id === campTab), ni = list.findIndex(d => d.id === id);
    campTab = id; tabsSig = '';
    renderCamp(ni > oi ? 1 : -1);
  };
  UI.currentTab = () => campTab;
  UI.refreshCamp = function () { renderCamp(0); };
  function refreshCampSoon() {
    if (campRaf) return;
    campRaf = requestAnimationFrame(() => { campRaf = 0; if (current === 'hub') renderCamp(0); });
  }
  UI.registerPanel = function (def) {
    if (!def || !def.id) return null;
    const r = panels().register(def.id, def);
    tabsSig = '';
    if (current === 'hub') refreshCampSoon();
    return r;
  };
  UI.renderHub = function (profile) {
    if (profile) lastProfile = profile;
    renderCamp(0);
    syncSound();
  };

  // ---- panneaux de secours : donjons (v2), boutique, forge ----
  const POTION_STYLE = [{ ic: 'potion', c: '#ff5a74' }, { ic: 'potion-mana', c: '#46b6ff' }, { ic: 'potion', c: '#b48bff' }];
  function renderShopInto(shop, p) {
    if (!shop) return;
    const gold = num(p.gold, 0);
    const items = itemsList();
    const pots = p.potions || {};
    shop.innerHTML = items.length ? items.map((it, i) => {
      const price = num(it.price, 0);
      const can = gold >= price;
      const st = POTION_STYLE[i] || POTION_STYLE[2];
      const own = num(pots[it.id], 0);
      return `<div class="ds-card shop-item" style="--c:${st.c}">
        <div class="ds-card__row">
          <span class="ds-card__media shop-ico">${ico(st.ic, 28, it.icon || '🧪')}<span class="own" title="Possédées">×${own}</span></span>
          <span class="shop-txt"><span class="ds-card__title">${esc(it.name)}</span><span class="ds-card__meta">${esc(it.desc || '')}</span></span>
          <button type="button" class="ds-btn ds-btn--sm ${can ? 'ds-btn--gold' : 'is-disabled'}" data-buy="${esc(it.id)}" data-price="${price}"><span class="ds-btn__icon">${ico('gold', 15)}</span><span class="ds-btn__label">${fmtInt(price)}</span></button>
        </div>
      </div>`;
    }).join('') : emptyHTML('shop', 'Boutique fermée', 'Reviens plus tard.');
    shop.querySelectorAll('[data-buy]').forEach(b => tap(b, () => {
      const price = num(+b.dataset.price, 0);
      const g = num((lastProfile || {}).gold, 0);
      if (g < price) { sfx('error'); UI.toast("Pas assez d'or !"); return; }
      call('buy', b.dataset.buy);
      const card = b.closest('.shop-item'); if (card) restartAnim(card, 'flash');
    }, null));
  }
  const THEME_COLORS = { crypte: '#8fa3c8', foret: '#4fd17a', catacombes: '#c9a46a', glace: '#7fe0ff', abysse: '#8b6bff', volcan: '#ff7a3d' };
  function renderDungeonsInto(list, p) {
    if (!list) return;
    const niveau = num(p.niveau, 1);
    const D = DATA().DUNGEONS || [];
    const cleared = p.cleared || {};
    let nextMarked = false;
    list.innerHTML = D.length ? D.map((d, i) => {
      const req = num(d.levelRequired, 1);
      const locked = niveau < req;
      const cl = cleared[d.id] || null;
      const stars = cl && Array.isArray(cl.stars) ? cl.stars : [];
      const best = cl && isNum(cl.best) ? cl.best : null;
      const rooms = Array.isArray(d.rooms) ? d.rooms : [];
      const bossRoom = rooms.filter(r => r && r.boss).pop();
      const boss = bossRoom ? (DATA().BOSSES || {})[bossRoom.boss] : null;
      let next = false;
      if (!locked && !cl && !nextMarked) { next = true; nextMarked = true; }
      return `<button type="button" class="ds-card dg th-${esc(d.theme || 'crypte')}${locked ? ' locked is-locked' : ''}${next ? ' is-new next' : ''}" data-dungeon="${esc(d.id)}" data-req="${req}" style="--c:${THEME_COLORS[d.theme] || '#46d4ff'}">
        <span class="ds-card__row"><span class="ds-card__media dg-ico">${esc(d.icon || '🏰')}</span>
          <span class="ds-grow"><span class="dg-num">Donjon ${i + 1}</span><span class="ds-card__title dg-name">${esc(d.name || 'Donjon')}</span><span class="dg-stars">${[0, 1, 2].map(k => starSVG(!!stars[k])).join('')}</span></span></span>
        <span class="ds-card__meta dg-desc">${esc(d.desc || '')}</span>
        <span class="dg-foot">
          <span class="ds-chip">${ico('level-up', 14)}Niv. <b>${req}</b></span>
          ${rooms.length ? `<span class="ds-chip">${ico('door', 14)}<b>${rooms.length}</b> salles</span>` : ''}
          ${boss && boss.name ? `<span class="ds-chip">${ico('skull', 14)}${esc(boss.name)}</span>` : ''}
          ${best != null ? `<span class="ds-chip ds-chip--gold">${ico('timer', 14)}<b>${fmtTime(best)}</b></span>` : ''}
        </span>
        ${locked ? `<span class="dg-lock">${ico('lock', 16)}Niveau ${req} requis</span>` : ''}
      </button>`;
    }).join('') : emptyHTML('map', 'Aucun donjon', 'Aucun donjon disponible.');
    list.querySelectorAll('[data-dungeon]').forEach(el => tap(el, () => {
      if (el.classList.contains('locked')) { sfx('error'); UI.toast(`Atteins le niveau ${el.dataset.req} pour entrer ici !`); return; }
      sfx('click');
      call('enterDungeon', el.dataset.dungeon);
    }, null));
  }
  function registerFallbackPanels() {
    const P = G.Panels;
    if (!P || !P.register) return;
    if (!P.has('donjons')) P.register('donjons', {
      id: 'donjons', title: 'Donjons', icon: '⚔️', order: 1,
      visible: () => !(G.Panels && G.Panels.has('portails')),
      render(c, p) {
        c.innerHTML = '<div class="dungeon-grid ds-grid" id="hub-dungeons" style="--min:260px"></div><div class="ds-section-title">Boutique</div><div class="shop-grid" id="hub-shop"></div>';
        renderDungeonsInto(c.querySelector('#hub-dungeons'), p);
        renderShopInto(c.querySelector('#hub-shop'), p);
        if (G.DS) G.DS.stagger(c.querySelector('#hub-dungeons'));
      },
    });
    if (!P.has('boutique')) P.register('boutique', {
      id: 'boutique', title: 'Boutique', icon: '🧪', order: 8,
      visible: () => !!(G.Panels && G.Panels.has('portails')),
      render(c, p) {
        c.innerHTML = `<div class="shop-hero ds-card ds-card--flat"><span class="shop-hero-ico">${ico('shop', 26)}</span><div><div class="ds-card__title">Comptoir de l'alchimiste</div><div class="ds-card__meta">Les potions se boivent en donjon avec les boutons du HUD (touches <span class="ds-kbd">R</span> et <span class="ds-kbd">F</span>).</div></div><span class="ds-chip ds-chip--gold">${ico('gold', 14)}<b>${fmtInt(num(p.gold, 0))}</b></span></div><div class="ds-section-title">Potions</div><div class="shop-grid" id="hub-shop"></div>`;
        renderShopInto(c.querySelector('#hub-shop'), p);
        if (G.DS) G.DS.stagger(c.querySelector('#hub-shop'));
      },
    });
    if (!P.has('forge')) P.register('forge', {
      id: 'forge', title: 'Forge', icon: '🔨', order: 7,
      render(c, p) {
        c.innerHTML = `<div class="forge-grid"></div>`;
        renderForgeInto(c.querySelector('.forge-grid'), p);
      },
    });
  }

  // ==================================================================
  //  FORGE
  // ==================================================================
  const STAT_LABELS = { lifesteal: 'Vol de vie', shockwave: 'Onde de choc', waveRange: 'Portée de l’onde', waveDmg: 'Dégâts de l’onde', crit: 'Critique', critDmg: 'Dégâts critiques', slow: 'Ralentissement', stun: 'Étourdissement', cd: 'Recharge', range: 'Portée', arc: 'Angle', speed: 'Vitesse', pierce: 'Perforation', radius: 'Rayon', count: 'Projectiles', knockback: 'Recul', burn: 'Brûlure' };
  function statRows(w, lvl) {
    const s = safe(() => w.stats(lvl), null) || {};
    const rows = [];
    if (Array.isArray(s.values)) {
      const vals = s.values.filter(isNum);
      rows.push({ k: 'Dégâts', v: vals.length ? vals.map(v => fmtInt(v)).join(' / ') : '—', n: vals.length ? Math.max(...vals) : 0 });
    } else if (isNum(s.min) || isNum(s.max)) {
      rows.push({ k: 'Dégâts', v: `${fmtInt(num(s.min))}–${fmtInt(num(s.max))}`, n: num(s.min) + num(s.max) });
    } else if (isNum(s.dmg)) rows.push({ k: 'Dégâts', v: fmtInt(s.dmg), n: s.dmg });
    for (const key in s) {
      if (['min', 'max', 'values', 'dmg'].indexOf(key) >= 0) continue;
      const v = s[key];
      if (!isNum(v) && typeof v !== 'boolean') continue;
      let txt;
      if (key === 'cd') txt = fmtDec(v, 2) + ' s';
      else if (key === 'arc') txt = (v <= 6.3 ? Math.round(v * 180 / Math.PI) : Math.round(v)) + '°';
      else if (key === 'pierce') txt = v ? (v === true ? 'Oui' : '×' + v) : 'Non';
      else if (typeof v === 'boolean') txt = v ? 'Oui' : 'Non';
      else txt = fmtDec(v, 1);
      rows.push({ k: STAT_LABELS[key] || key, v: txt, n: +v, key });
    }
    return rows;
  }
  UI.renderForge = function (profile) {
    if (profile) lastProfile = profile;
    const p = lastProfile || {};
    setText($('forge-gold'), fmtInt(num(p.gold, 0)));
    if (current === 'hub') { if (campTab === 'forge') renderCamp(0); else updateCampHeader(p); return; }
    renderForgeInto($('forge-list'), p);
  };
  // ---- Forge v5 : Arme de classe (epee) / Focalisateur (dague) / Relique (feu) — noms et bonus propres à chaque classe ----
  const FORGE_ROLE = {
    epee: { tag: 'Arme de classe', improves: 'Attaque de base', ico: 'sword' },
    dague: { tag: 'Focalisateur', improves: 'Compétences actives', ico: 'rune' },
    feu: { tag: 'Relique', improves: 'Ultime', ico: 'crown' },
  };
  function forgeTargets(p, key) {
    const SK = G.SKILLS || {};
    const eq = safe(() => G.Skills.equipped(p), null) || (p.skills && p.skills.equipped) || {};
    const nm = id => (SK[id] && SK[id].name) || '';
    if (key === 'epee') { const id = eq.cast1 || safe(() => G.CLASSES[p.classe].basic.skillId, ''); return { ids: [id], names: [nm(id)].filter(Boolean) }; }
    if (key === 'feu') { const id = eq.super || safe(() => G.CLASSES[p.classe].ultimate.skillId, ''); return { ids: [id], names: [nm(id)].filter(Boolean) }; }
    const ids = [eq.cast2, eq.cast3].filter(Boolean);
    return { ids, names: ids.map(nm).filter(Boolean) };
  }
  const pctTxt = (v, sign) => (sign < 0 ? '−' : '+') + Math.round(Math.abs(v) * 10) / 10 + ' %';
  function forgeRows(key, lvl, maxL) {
    const fm = safe(() => DATA().forgeMult, null);
    if (typeof fm !== 'function') return [];
    const cur = fm(key, lvl), nxt = lvl >= maxL ? null : fm(key, lvl + 1);
    const rows = [];
    const add = (label, icon, cv, nv, dir) => {
      const cp = dir > 0 ? (cv - 1) * 100 : (1 - cv) * 100, np = nv == null ? null : (dir > 0 ? (nv - 1) * 100 : (1 - nv) * 100);
      rows.push({ label, icon, cur: cp, nxt: np, dir, gain: dir > 0 ? cv : 1 / Math.max(0.05, cv) });
    };
    add('Dégâts', 'swords', cur.dmg, nxt && nxt.dmg, 1);
    add('Recharge', 'timer', cur.cd, nxt && nxt.cd, -1);
    if (Math.abs(1 - num(fm(key, maxL).mana, 1)) > 1e-6) add('Coût en mana', 'mana', cur.mana, nxt && nxt.mana, -1);
    return rows;
  }
  function renderForgeInto(box, p) {
    if (!box) return;
    const gold = num(p.gold, 0);
    const wl = p.weapons || {};
    const list = weaponsList();
    if (!list.length) { box.innerHTML = emptyHTML('anvil', 'La forge est froide', 'Aucune arme à améliorer.'); return; }
    const ci = classInfo(p.classe);
    const ccol = cssColor(ci.color, '#46d4ff');
    const head = `<div class="fg-head" style="--cc:${ccol}"><span class="fg-head__ic">${ci.icon && !hasIco(ci.icon) ? esc(ci.icon) : ico('anvil', 22)}</span><div><b>Forge de ${esc(ci.name || p.classe || 'héros')}</b><span>Trois pièces uniques à ta classe : l’Arme de classe renforce ton attaque de base, le Focalisateur tes compétences, la Relique ton ultime.</span></div></div>`;
    box.innerHTML = head + list.map(w => {
      const key = w.id;
      const role = FORGE_ROLE[key] || { tag: w.name || key, improves: '', ico: 'anvil' };
      const info = safe(() => DATA().forgeInfo(p.classe, key), null) || {};
      const lvl = num(wl[key], 1);
      const maxL = num(w.maxLevel, 10);
      const isMax = lvl >= maxL;
      const cost = isMax ? null : safe(() => w.cost(lvl), null);
      const can = !isMax && isNum(cost) && gold >= cost;
      const tg = forgeTargets(p, key);
      const SK = G.SKILLS || {};
      const iconName = key === 'epee' || key === 'feu' ? ((SK[tg.ids[0]] || {}).icon || role.ico) : role.ico;
      const rows = forgeRows(key, lvl, maxL).map(r => {
        const changed = r.nxt != null && Math.round(r.nxt * 10) !== Math.round(r.cur * 10);
        const sign = r.dir;
        return `<div class="ds-stat w-row${changed ? ' is-up' : ''}"><span class="ds-stat__label">${ico(r.icon, 15)}${esc(r.label)}</span><span class="w-vals"><span class="ds-stat__value w-cur">${r.cur > 0.05 ? pctTxt(r.cur, sign) : '—'}</span>${changed ? `<span class="w-arrow">${ico('arrow-right', 14)}</span><span class="ds-stat__value up">${pctTxt(r.nxt, sign)}</span>` : ''}</span></div>`;
      }).join('');
      const perksSrc = info.perks && typeof info.perks === 'object' ? info.perks : (w.perks || {});
      const perks = Object.keys(perksSrc).map(Number).filter(isNum).sort((a, b) => a - b);
      const nextPerk = perks.find(L => L > lvl);
      const perkHtml = perks.length ? `<div class="w-perks-title">Paliers de maîtrise</div><ul class="w-perks">${perks.map(L => {
        const st = L <= lvl ? 'done' : (L === nextPerk ? 'next' : '');
        return `<li class="${st}"><span class="pl">${L <= lvl ? ico('check', 13) : 'Niv. ' + L}</span><span>${esc(perksSrc[L])}</span></li>`;
      }).join('')}</ul>` : '';
      const pips = Array.from({ length: Math.min(maxL, 20) }, (_, i) => `<i class="${i < lvl ? 'on' : ''}${perks.indexOf(i + 1) >= 0 ? ' ms' : ''}"></i>`).join('');
      const col = WEAPON_COLORS[key] || '#ffb547';
      const btn = isMax
        ? `<button type="button" class="ds-btn ds-btn--violet ds-btn--lg ds-btn--block is-disabled" data-up="${esc(key)}" data-state="max"><span class="ds-btn__icon">${ico('crown', 18)}</span><span class="ds-btn__label">Niveau maximum</span></button>`
        : `<button type="button" class="ds-btn ${can ? 'ds-btn--gold' : 'is-disabled'} ds-btn--lg ds-btn--block" data-up="${esc(key)}" data-state="${can ? 'ok' : 'poor'}"><span class="ds-btn__icon">${ico('arrow-up', 18)}</span><span class="ds-btn__label">Améliorer</span><span class="ds-btn__meta">${ico('gold', 14)}${isNum(cost) ? fmtInt(cost) : '?'}</span></button>`;
      return `<div class="ds-card wcard${lvl >= 5 ? ' glow' : ''}" data-w="${esc(key)}" style="--c:${col}">
        <div class="ds-card__row wcard-head">
          <div class="ds-card__media w-ico">${ico(iconName, 28) || esc(w.icon || '⚔️')}</div>
          <div class="ds-grow">
            <div class="w-role">${esc(role.tag)}</div>
            <div class="ds-card__title w-name">${esc(info.name || w.name || key)}</div>
            <div class="w-lvl"><span class="ds-badge ds-badge--accent">Niv. ${lvl} / ${maxL}</span>${tg.names.length ? `<span class="w-for">${esc(role.improves)} · ${esc(tg.names.join(' & '))}</span>` : `<span class="w-for">${esc(role.improves)}</span>`}</div>
          </div>
        </div>
        ${info.desc ? `<p class="w-desc">${esc(info.desc)}</p>` : ''}
        <div class="w-pips">${pips}</div>
        <div class="w-stats">${rows || '<div class="ds-stat"><span class="ds-stat__label">Bonus</span><span class="ds-stat__value">—</span></div>'}</div>
        ${perkHtml}
        ${btn}
      </div>`;
    }).join('');
    if (G.DS && !box._staggered) { box._staggered = true; G.DS.stagger(box); }
    box.querySelectorAll('[data-up]').forEach(b => tap(b, () => {
      const st = b.dataset.state;
      if (st === 'max') { sfx('error'); UI.toast('Cette pièce est déjà au niveau maximum !'); return; }
      if (st === 'poor') { sfx('error'); UI.toast("Pas assez d'or ! Explore les donjons pour en gagner."); return; }
      const id = b.dataset.up;
      call('upgrade', id);
      requestAnimationFrame(() => { const c2 = document.querySelector(`.wcard[data-w="${id}"]`); if (c2) restartAnim(c2, 'flash'); });
    }, null));
  }

  // ==================================================================
  //  HUD
  // ==================================================================
  let lastGold = null;
  const hud = UI.hud = {
    setPlayer(o) {
      o = o || {};
      if (o.nom != null) setText($('hud-name'), o.nom);
      if (o.niveau != null) {
        const lv = $('hud-level');
        if (lv && cache.get(lv) !== String(o.niveau) && cache.get(lv) != null) restartAnim($('hud-ava'), 'lvl-up');
        setText(lv, o.niveau);
      }
      if (o.classe != null) {
        const ava = $('hud-ava');
        if (ava && ava._cls !== o.classe) {
          ava._cls = o.classe;
          const c = classInfo(o.classe);
          setText($('hud-ava-i'), c.icon);
          ava.style.setProperty('--cc', c.color);
        }
      }
      if (isNum(o.pv) || isNum(o.pvMax)) {
        const max = Math.max(1, num(o.pvMax, hud._pvMax || 100));
        hud._pvMax = max;
        const pv = Math.max(0, num(o.pv, max));
        const f = clamp01(pv / max);
        setStyle($('hud-hp-fill'), 'width', (f * 100).toFixed(1) + '%');
        setStyle($('hud-hp-ghost'), 'width', (f * 100).toFixed(1) + '%');
        setText($('hud-hp-text'), `${Math.ceil(pv)} / ${Math.round(max)}`);
        const bar = $('hud-hp-fill') && $('hud-hp-fill').parentNode;
        toggle(bar, 'mid', f <= 0.5 && f > 0.25);
        toggle(bar, 'low', f <= 0.25);
        toggle($('hud'), 'hp-critical', f <= 0.25 && f > 0);
      }
      if (isNum(o.xp) || isNum(o.xpNext)) {
        const need = num(o.xpNext, 0);
        const f = need > 0 ? clamp01(num(o.xp) / need) : 1;
        setStyle($('hud-xp-fill'), 'width', (f * 100).toFixed(1) + '%');
      }
      if (o.rank != null) hud.setRank(o.rank);
      if (isNum(o.manaMax)) hud.setMana(isNum(o.mana) ? o.mana : hud._mana, o.manaMax);
      if (isNum(o.gold)) {
        setText($('hud-gold'), fmtInt(o.gold));
        if (lastGold != null && o.gold > lastGold) { const g = $('hud-gold'); if (g) restartAnim(g.parentNode, 'bump'); }
        lastGold = o.gold;
      }
    },
    setCooldowns(c) {
      c = c || {};
      const map = { 1: 'btn-cast1', 2: 'btn-cast2', 3: 'btn-cast3', dash: 'btn-dash' };
      for (const k in map) {
        if (!(k in c)) continue;
        const el = $(map[k]);
        if (!el || el._cdSkills) continue;
        const q = Math.round(clamp01(c[k]) * 100) / 100;
        setStyle(el, '--cd', String(q));
        const now = q > 0.001;
        if (el.classList.contains('cooling') !== now) { toggle(el, 'cooling', now); if (!now) restartAnim(el, 'ready'); }
      }
    },
    setSuper(frac) {
      const el = $('btn-super');
      if (!el) return;
      const f = clamp01(frac);
      setStyle(el, '--sp', String(Math.round(f * 100) / 100));
      toggle(el, 'ready-super', f >= 0.999);
    },
    setObjective(text) {
      const el = $('hud-objective');
      if (!el) return;
      const t = String(text == null ? '' : text);
      if (cache.get(el) === t) return;
      setText(el, t);
      toggle(el, 'empty', !t);
      if (t) restartAnim(el, 'flash');
    },
    setRoom(text) { setText($('hud-room'), text); },
    setDungeonName(text) { setText($('hud-dungeon'), text); },
    setTimer(seconds) { setText($('hud-timer'), fmtTime(num(seconds, 0))); },
    setBoss(name, frac) {
      const el = $('hud-boss');
      if (!el) return;
      if (name == null || name === false || name === '') { toggle(el, 'on', false); toggle($('hud'), 'has-boss', false); return; }
      setText($('hud-boss-name'), name);
      const f = clamp01(frac == null ? 1 : frac);
      const w = (f * 100).toFixed(1) + '%';
      setStyle($('hud-boss-fill'), 'width', w);
      setStyle($('hud-boss-trail'), 'width', w);
      toggle(el, 'enraged', f <= 0.3);
      toggle(el, 'on', true);
      toggle($('hud'), 'has-boss', true);
    },
    setInventory(potions) {
      potions = potions || {};
      const items = itemsList();
      const names = items.length ? items.map(i => i.id) : Object.keys(potions);
      [1, 2].forEach(n => {
        const el = $('btn-potion' + n);
        if (!el) return;
        const id = names[n - 1];
        if (!id) { el.style.display = 'none'; return; }
        el.style.display = '';
        const count = Math.max(0, Math.floor(num(potions[id], 0)));
        const nEl = el.querySelector('.potion-n');
        const prev = nEl ? +nEl.textContent : count;
        setText(nEl, count);
        toggle(el, 'empty', count <= 0);
        if (el.title !== id) { el.title = id; el.setAttribute('aria-label', id); }
        if (count < prev) restartAnim(el, 'used');
      });
    },
  };
  hud.setDungeon = hud.setDungeonName;

  const SK_IDS = { cast1: 'btn-cast1', cast2: 'btn-cast2', cast3: 'btn-cast3', super: 'btn-super' };
  hud._mana = null; hud._sk = {};
  function applyManaState() {
    for (const k in SK_IDS) {
      const el = $(SK_IDS[k]); const st = hud._sk[k];
      if (!el || !st) continue;
      toggle(el, 'nomana', st.mana > 0 && !st.locked && isNum(hud._mana) && hud._mana < st.mana - 1e-6);
    }
  }
  hud.setMana = function (cur, max) {
    const box = $('hud-mp');
    if (!box) return;
    max = num(max, 0); cur = Math.max(0, num(cur, 0));
    hud._mana = cur;
    toggle(box, 'on', max > 0);
    if (max > 0) {
      const f = clamp01(cur / max);
      setStyle($('hud-mp-fill'), 'width', (f * 100).toFixed(1) + '%');
      setText($('hud-mp-text'), `${Math.floor(cur)} / ${Math.round(max)}`);
      toggle(box, 'low', f < 0.2);
    }
    applyManaState();
  };
  hud.setRank = function (rankId) {
    const el = $('hud-rank');
    if (!el) return;
    const key = rankId ? String(rankId) + rankColor(rankId) : '';
    if (el._rk === key) return;
    el._rk = key;
    el.innerHTML = rankId ? rankBadgeHTML(rankId, 'sm') : '';
  };
  hud.setSkills = function (o) {
    o = o || {};
    if (o.res !== undefined) hud.setResource(o.res);
    for (const k in SK_IDS) {
      if (!(k in o)) continue;
      const el = $(SK_IDS[k]);
      if (!el) continue;
      const s = o[k];
      if (!s) { hud._sk[k] = { mana: 0, locked: true }; toggle(el, 'locked', true); toggle(el, 'has-mana', false); toggle(el, 'nomana', false); continue; }
      if (s.icon != null) {
        const ie = el.querySelector('.act-ico');
        if (ie && ie._v !== s.icon) { ie._v = s.icon; if (hasIco(s.icon)) ie.innerHTML = ico(s.icon, 26); else ie.textContent = s.icon; }
      }
      if (s.name != null) {
        setText(el.querySelector('.act-lbl'), k === 'super' && !s.name ? 'Ultime' : s.name);
        if (el._nm !== s.name) { el._nm = s.name; el.setAttribute('aria-label', s.name); el.title = s.name; }
      }
      if (s.color) {
        const c = cssColor(s.color);
        setStyle(el, '--c1', `color-mix(in srgb, ${c}, #fff 35%)`); setStyle(el, '--c2', `color-mix(in srgb, ${c}, #000 35%)`);
      }
      if (isNum(s.cdFrac)) {
        el._cdSkills = true;
        const q = Math.round(clamp01(s.cdFrac) * 100) / 100;
        setStyle(el, '--cd', String(q));
        const now = q > 0.001;
        if (el.classList.contains('cooling') !== now) { toggle(el, 'cooling', now); if (!now) restartAnim(el, 'ready'); }
      }
      if (isNum(s.charge)) { setStyle(el, '--sp', String(Math.round(clamp01(s.charge) * 100) / 100)); toggle(el, 'ready-super', s.charge >= 0.999); }
      if ('maxCharges' in s || 'charges' in s) setActCharges(el, s.charges, s.maxCharges);
      const mana = Math.max(0, num(s.mana, 0));
      const mEl = el.querySelector('.act-mana');
      if (mEl) setText(mEl, mana ? Math.round(mana) : '');
      toggle(el, 'has-mana', mana > 0);
      toggle(el, 'locked', !!s.locked);
      hud._sk[k] = { mana, locked: !!s.locked };
    }
    applyManaState();
  };
  hud.setBuffs = function (list) {
    const box = $('hud-buffs');
    if (!box) return;
    list = Array.isArray(list) ? list.slice(0, 8) : [];
    while (box.children.length > list.length) box.removeChild(box.lastChild);
    list.forEach((b, i) => {
      let el = box.children[i];
      if (!el) { el = document.createElement('span'); el.className = 'buff'; el.innerHTML = '<i class="buff-i"></i>'; box.appendChild(el); }
      b = b || {};
      const ie = el.firstChild;
      const icv = b.icon || '✨';
      if (ie._v !== icv) { ie._v = icv; if (hasIco(icv)) ie.innerHTML = ico(icv, 16); else ie.textContent = icv; }
      const t = clamp01(b.timeFrac == null ? 1 : b.timeFrac);
      setStyle(el, '--t', String(Math.round(t * 50) / 50));
      setStyle(el, '--bc', cssColor(b.color, '#46d4ff'));
      toggle(el, 'ending', t > 0 && t < 0.25);
      if (el._nm !== b.name) { el._nm = b.name; el.title = b.name || ''; el.setAttribute('aria-label', b.name || 'Effet'); }
    });
  };
  // ---- indicateur de charges (compétences à plusieurs charges : pastilles sous le bouton) ----
  function setActCharges(el, n, max) {
    max = Math.max(0, Math.floor(num(max, 0))); n = Math.max(0, Math.floor(num(n, 0)));
    let box = el.querySelector('.act-chg');
    if (max < 2) { if (box) { box.remove(); } toggle(el, 'has-chg', false); return; }
    if (!box) { box = document.createElement('span'); box.className = 'act-chg'; el.appendChild(box); }
    const sig = n + '/' + max;
    if (box._sig === sig) return;
    box._sig = sig;
    box.innerHTML = Array.from({ length: Math.min(max, 6) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    toggle(el, 'has-chg', true);
  }
  // indicateur de charge maintenue (frac 0..1, null = masqué) : anneau autour du bouton de la compétence
  hud.setCharge = function (slot, frac) {
    const el = $(SK_IDS[slot] || SK_IDS['cast' + slot] || '');
    document.querySelectorAll('.act.is-charging').forEach(x => { if (x !== el) { x.classList.remove('is-charging'); x.style.removeProperty('--ch'); } });
    if (!el) return;
    if (frac == null || frac === false) { el.classList.remove('is-charging', 'charged'); el.style.removeProperty('--ch'); return; }
    const f = clamp01(frac);
    setStyle(el, '--ch', String(Math.round(f * 100) / 100));
    toggle(el, 'is-charging', true); toggle(el, 'charged', f >= 0.999);
  };

  // ---- ressource secondaire de classe (Rage, Lames, Combo, Concentration, Foi, Givre/Orage, Âmes, Écho) ----
  // res = { id, name, value, max, color, parts?:[{id,name,value,max,color}] }   (G.Skills.resource())
  const RES_SHORT = { rage: 'Rage', lames: 'Lames', combo: 'Combo', conc: 'Concentr.', concentration: 'Concentr.', foi: 'Foi', ames: 'Âmes', echo: 'Écho', givre: 'Givre', orage: 'Orage' };
  const RES_ICON = { rage: 'fire', lames: 'daggers', combo: 'target', conc: 'bow', concentration: 'bow', foi: 'holy', ames: 'ghost', echo: 'sparkles', givre: 'ice', orage: 'lightning' };
  function gaugeKind(r) {
    if (!r || !(num(r.max) > 0)) return 'none';
    if (r.id === 'rage' || r.id === 'conc' || r.id === 'concentration' || r.id === 'foi') return 'bar';
    return num(r.max) <= 12 ? 'pips' : 'bar';
  }
  /** HTML d'une jauge de ressource. o.compact : sans libellé. */
  function resGaugeHTML(r, o) {
    o = o || {};
    if (!r) return '';
    const col = cssColor(r.color, '#8b6bff');
    const mk = (rr, extra) => {
      const kind = gaugeKind(rr), max = Math.max(1, Math.floor(num(rr.max))), val = Math.max(0, num(rr.value));
      const c = cssColor(rr.color || r.color, col);
      if (kind === 'bar') {
        const f = clamp01(val / max);
        return `<span class="rg-g rg-bar rg-${esc(rr.id)}" style="--rc:${c};--f:${f.toFixed(3)}"><i class="rg-fill"></i><i class="rg-tick"></i></span>`;
      }
      const n = Math.min(max, 12), on = Math.floor(val + 1e-6);
      return `<span class="rg-g rg-pips rg-${esc(rr.id)}${extra || ''}" style="--rc:${c}" data-n="${n}">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span>`;
    };
    if (Array.isArray(r.parts) && r.parts.length) {
      return r.parts.map(pt => `<span class="rg-row rg-part" data-res="${esc(pt.id)}" style="--rc:${cssColor(pt.color || r.color, col)}">${o.compact ? '' : `<span class="rg-name">${ico(RES_ICON[pt.id] || 'sparkles', 11)}${esc(RES_SHORT[pt.id] || pt.name)}</span>`}${mk(pt)}<b class="rg-val">${Math.floor(num(pt.value) + 1e-6)}</b></span>`).join('');
    }
    const shown = gaugeKind(r) === 'bar' ? Math.round(num(r.value)) : Math.floor(num(r.value) + 1e-6);
    return `<span class="rg-row" data-res="${esc(r.id)}" style="--rc:${col}">${o.compact ? '' : `<span class="rg-name">${ico(RES_ICON[r.id] || 'sparkles', 11)}${esc(RES_SHORT[r.id] || r.name)}</span>`}${mk(r)}<b class="rg-val">${shown}</b></span>`;
  }
  UI.resGauge = resGaugeHTML;
  UI.resShort = id => RES_SHORT[id] || id;
  function resEl() {
    let el = $('hud-res');
    if (el) return el;
    const mp = $('hud-mp'); if (!mp || !mp.parentNode) return null;
    el = document.createElement('div'); el.id = 'hud-res'; el.className = 'hud-res';
    el.setAttribute('role', 'meter'); el.setAttribute('aria-live', 'off');
    mp.parentNode.insertBefore(el, mp.nextSibling);
    return el;
  }
  hud._res = null;
  hud.setResource = function (res) {
    const el = resEl(); if (!el) return;
    if (!res || !(num(res.max) > 0)) { hud._res = null; el.innerHTML = ''; el._sig = ''; toggle(el, 'on', false); toggle($('hud'), 'has-res', false); return; }
    const parts = Array.isArray(res.parts) ? res.parts : null;
    const sig = [res.id, res.max, res.color, parts ? parts.map(p => p.id + ':' + p.max).join('|') : ''].join('#');
    const first = el._sig !== sig;
    if (first) { el._sig = sig; el.innerHTML = resGaugeHTML(res); el.className = 'hud-res on rg-k-' + esc(res.id) + (parts ? ' rg-two' : ''); toggle($('hud'), 'has-res', true); }
    const lbl = `${res.name || res.id} : ${Math.floor(num(res.value))} sur ${Math.round(num(res.max))}`;
    if (el._lbl !== lbl) { el._lbl = lbl; el.setAttribute('aria-label', lbl); }
    const rows = Array.prototype.slice.call(el.querySelectorAll('.rg-row'));
    const list = parts || [res];
    let gained = false, full = false;
    list.forEach((r, i) => {
      const row = rows[i]; if (!row) return;
      const g = row.querySelector('.rg-g'), v = row.querySelector('.rg-val');
      const val = Math.max(0, num(r.value)), max = Math.max(1, num(r.max));
      const prev = row._v == null ? val : row._v; row._v = val;
      if (val > prev + 1e-6) gained = true;
      if (g.classList.contains('rg-bar')) {
        setStyle(g, '--f', clamp01(val / max).toFixed(3));
      } else {
        const on = Math.floor(val + 1e-6);
        Array.prototype.forEach.call(g.children, (pip, k) => { const o = k < on; if (pip.classList.contains('on') !== o) { pip.classList.toggle('on', o); if (o && !first) restartAnim(pip, 'pop'); } });
      }
      const txt = String(g.classList.contains('rg-bar') ? Math.round(val) : Math.floor(val + 1e-6));
      if (v && v.textContent !== txt) v.textContent = txt;
      if (val >= max - 1e-6) full = true;
    });
    toggle(el, 'is-full', full);
    if (gained && !first) restartAnim(el, 'gain');
  };
  safe(() => G.bus && G.bus.on && G.bus.on('resourceChanged', e => { try { hud.setResource((e && e.resource) || (G.Skills && G.Skills.resource && G.Skills.resource())); } catch (_) {} }));
  safe(() => G.bus && G.bus.on && G.bus.on('runStart', () => { try { hud.setResource(G.Skills && G.Skills.resource && G.Skills.resource()); } catch (_) {} }));

  hud.setMinions = function (n, cap) {
    const el = $('hud-minions');
    if (!el) return;
    n = Math.max(0, Math.floor(num(n, 0))); cap = Math.max(0, Math.floor(num(cap, 0)));
    toggle(el, 'on', cap > 0 || n > 0);
    if (!el._ic) { el._ic = true; el.innerHTML = ico('army', 15, '👥') + '<b></b>'; }
    setText(el.querySelector('b'), `${n}${cap > 0 ? '/' + cap : ''}`);
  };

  function bindHud() {
    const bind = (id, action) => {
      const el = $(id);
      if (!el) return;
      if (G.input && typeof G.input.bindButton === 'function') {
        try { G.input.bindButton(el, action); } catch (e) { console.error('[UI] bindButton', e); }
      }
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    bind('btn-cast1', 'cast1'); bind('btn-cast2', 'cast2'); bind('btn-cast3', 'cast3');
    bind('btn-super', 'super'); bind('btn-dash', 'dash');
    bind('btn-potion1', 'potion1'); bind('btn-potion2', 'potion2');
    bind('btn-pause', 'pause');
    const W = DATA().WEAPONS || {};
    [['epee', 'btn-cast1'], ['dague', 'btn-cast2'], ['feu', 'btn-cast3']].forEach(([wid, bid]) => {
      const w = W[wid]; const el = $(bid);
      if (!w || !el) return;
      if (w.icon) setText(el.querySelector('.act-ico'), w.icon);
      if (w.name) { setText(el.querySelector('.act-lbl'), w.name); el.setAttribute('aria-label', w.name); }
    });
    const S = DATA().SUPER;
    if (S && S.icon) setText($('btn-super-ico'), S.icon);
    if (S && S.name) $('btn-super') && $('btn-super').setAttribute('aria-label', 'Ultime : ' + S.name);
    const dI = document.querySelector('#btn-dash .act-ico'); if (dI) dI.innerHTML = ico('dash', 24, '💨');
    document.querySelectorAll('.act-lock').forEach(l => { l.innerHTML = ico('lock', 22, '🔒'); });
    const pb = $('btn-pause'); if (pb) pb.innerHTML = ico('pause', 20, 'II');
    const items = itemsList();
    ['btn-potion1', 'btn-potion2'].forEach((id, i) => {
      const el = $(id);
      if (!el) return;
      el.classList.add('p' + (i + 1));
      const pi = el.querySelector('.potion-ico'); if (pi) pi.innerHTML = ico(i === 0 ? 'potion' : 'potion-mana', 22, i === 0 ? '❤️' : '💧');
      if (items[i]) el.title = items[i].id;
    });
  }

  // ---- tutoriel contextuel (bulles sur le HUD lors du premier donjon) ----
  const COACH_KEY = 'donjon-arena-coach-done';
  let coachT = 0, coachStep = -1, coachSteps = [];
  function coachDone() { try { return localStorage.getItem(COACH_KEY) === '1'; } catch (_) { return false; } }
  function setCoachDone() { try { localStorage.setItem(COACH_KEY, '1'); } catch (_) {} }
  function hideCoach() { clearTimeout(coachT); coachStep = -1; const c = $('hud-coach'); if (c) { c.innerHTML = ''; c.classList.remove('on'); } }
  function startCoach(force) {
    if (!force && (!settings.hints || coachDone())) return;
    const touch = isTouch();
    coachSteps = [
      { at: null, icon: touch ? 'joystick' : 'keyboard', title: 'Se déplacer', text: touch ? 'Pose le pouce sur la moitié gauche de l’écran et glisse pour te déplacer.' : 'ZQSD ou les flèches pour te déplacer. La souris oriente tes tirs.' },
      { at: 'btn-cast1', icon: 'sword', title: 'Attaquer', text: 'Touche un sort pour viser automatiquement. Glisse depuis le bouton pour viser à la main.' },
      { at: 'btn-dash', icon: 'dash', title: 'Roulade', text: 'Une roulade juste avant un coup = esquive parfaite (ralenti + contre-attaque).' },
      { at: 'btn-super', icon: 'tornado', title: 'Ultime', text: 'Se charge en infligeant des dégâts. Quand il brille, déchaîne-le !' },
      { at: 'btn-pause', icon: 'pause', title: 'Pause', text: 'Pause, paramètres et sortie du donjon sont ici.' },
    ];
    coachStep = -1;
    nextCoach();
  }
  function nextCoach() {
    clearTimeout(coachT);
    coachStep++;
    const box = $('hud-coach');
    if (!box) return;
    if (coachStep >= coachSteps.length || current !== 'game') { hideCoach(); setCoachDone(); return; }
    const s = coachSteps[coachStep];
    box.innerHTML = `<div class="coach-bubble ds-anim-pop" role="note"><div class="coach-head"><span class="coach-ico">${ico(s.icon, 18)}</span><b>${esc(s.title)}</b><span class="coach-n">${coachStep + 1}/${coachSteps.length}</span></div><p>${esc(s.text)}</p><div class="coach-btns"><button type="button" class="ds-btn ds-btn--ghost ds-btn--sm coach-skip">Passer</button><button type="button" class="ds-btn ds-btn--primary ds-btn--sm coach-ok">${coachStep + 1 < coachSteps.length ? 'Suivant' : 'Compris'}</button></div></div>`;
    box.classList.add('on');
    const bub = box.firstChild;
    ['pointerdown', 'touchstart', 'mousedown'].forEach(ev => bub.addEventListener(ev, e => e.stopPropagation()));
    bub.querySelector('.coach-ok').addEventListener('click', () => { sfx('click'); nextCoach(); });
    bub.querySelector('.coach-skip').addEventListener('click', () => { sfx('click'); hideCoach(); setCoachDone(); });
    // position près de la cible
    const tgt = s.at ? $(s.at) : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const bw = Math.min(280, vw - 24);
    bub.style.width = bw + 'px';
    let x, y, arrow = 'none';
    if (tgt && tgt.offsetParent !== null) {
      const r = tgt.getBoundingClientRect();
      x = Math.max(12, Math.min(vw - bw - 12, r.left + r.width / 2 - bw / 2));
      const bh = bub.offsetHeight || 130;
      if (r.top > bh + 24) { y = r.top - bh - 14; arrow = 'down'; } else { y = r.bottom + 14; arrow = 'up'; }
      bub.style.setProperty('--ax', Math.max(16, Math.min(bw - 16, r.left + r.width / 2 - x)) + 'px');
      toggle(tgt, 'coach-target', true);
      setTimeout(() => toggle(tgt, 'coach-target', false), 4800);
    } else { x = 14; y = vh * 0.48; bub.classList.add('coach-zone'); }
    bub.dataset.arrow = arrow;
    bub.style.left = x + 'px'; bub.style.top = y + 'px';
    coachT = setTimeout(nextCoach, 7000);
  }
  UI.startHudTutorial = () => startCoach(true);

  // ==================================================================
  //  BANNIÈRE / TOASTS / LEVEL UP
  // ==================================================================
  let bannerT = 0, bannerT2 = 0;
  UI.banner = function (html, durationSec) {
    const el = $('ov-banner-in');
    if (!el) return;
    clearTimeout(bannerT); clearTimeout(bannerT2);
    el.innerHTML = `<i class="bn-line l"></i><span class="bn-txt">${html == null ? '' : String(html)}</span><i class="bn-line r"></i>`;
    el.className = 'ov-banner-in';
    void el.offsetWidth;
    el.classList.add('show');
    const d = Math.max(0.4, num(durationSec, 2)) * 1000;
    bannerT = setTimeout(() => {
      el.classList.remove('show'); el.classList.add('hide');
      bannerT2 = setTimeout(() => { el.className = 'ov-banner-in'; }, 360);
    }, d);
  };

  function toastKind(t) {
    const s = t.toLowerCase();
    if (/pas assez|refus|impossible|verrouill|requis|interdit|non obtenue|introuvable/.test(s)) return ['danger', 'warning'];
    if (/\bor\b|💰|achet/.test(s)) return ['gold', 'gold'];
    if (/niveau|amélior|débloqu|bravo|réussi|obtenu/.test(s)) return ['success', 'check'];
    return ['', 'info'];
  }
  UI.toast = function (text) {
    const box = $('ov-toasts');
    if (!box || text == null || text === '') return;
    const s = String(text);
    const k = toastKind(s);
    const t = document.createElement('div');
    t.className = 'toast ds-toast' + (k[0] ? ' ds-toast--' + k[0] : '');
    t.innerHTML = ico(k[1], 18);
    const sp = document.createElement('span'); sp.textContent = s; t.appendChild(sp);
    box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2300);
  };

  let luT = 0, luT2 = 0;
  UI.levelUp = function (niveau, lines) {
    const el = $('ov-levelup');
    if (!el) return;
    clearTimeout(luT); clearTimeout(luT2);
    setText($('lu-num'), niveau == null ? '' : niveau);
    const ul = $('lu-lines');
    if (ul) {
      const arr = Array.isArray(lines) ? lines : (lines ? [lines] : []);
      ul.innerHTML = arr.slice(0, 5).map((l, i) => `<li style="--i:${i}">${ico('arrow-up', 14)}<span>${esc(l)}</span></li>`).join('');
    }
    el.className = 'ov-levelup';
    void el.offsetWidth;
    el.classList.add('show');
    vibrate([30, 40, 30]);
    luT = setTimeout(() => {
      el.classList.add('hide');
      luT2 = setTimeout(() => { el.className = 'ov-levelup'; }, 420);
    }, 3200);
  };

  // ==================================================================
  //  COFFRE PIÉGÉ → Promise<{won, code}>
  // ==================================================================
  let chestPending = null;
  UI.chestGame = function (opts) {
    const C = DATA().CHEST || {};
    opts = opts || {};
    let min = Math.floor(num(opts.min, num(C.min, 1)));
    let max = Math.floor(num(opts.max, num(C.max, 20)));
    if (max < min) { const t = min; min = max; max = t; }
    if (max - min > 59) max = min + 59;
    const tries = Math.max(1, Math.floor(num(opts.tries, num(C.tries, 3))));
    const code = Math.floor(Math.random() * (max - min + 1)) + min;
    if (chestPending) { const r = chestPending; chestPending = null; r.resolve({ won: false, code: r.code }); }
    return new Promise(resolve => {
      const ov = $('ov-chest');
      const grid = $('chest-grid');
      const msg = $('chest-msg');
      const triesEl = $('chest-tries');
      const btn = $('chest-continue');
      const icoEl = $('chest-ico');
      if (!ov || !grid || !msg) { resolve({ won: false, code }); return; }
      const state = { code, left: tries, done: false, won: false, resolve, lo: min, hi: max };
      chestPending = state;
      setText($('chest-rule'), `Trouve le code entre ${min} et ${max} en ${tries} essai${tries > 1 ? 's' : ''}, sinon le coffre mange ton or !`);
      msg.className = 'chest-msg'; msg.innerHTML = `${ico('help', 18)}<span>Choisis un nombre</span>`;
      if (icoEl) { icoEl.innerHTML = ico('chest', 22, '🧰'); icoEl.className = 'ds-window__icon chest-ico'; }
      btn.classList.remove('show');
      grid.classList.remove('done');
      const drawTries = () => {
        if (!triesEl) return;
        let h = '<span class="ct-lbl">Essais</span><span class="ct-keys">';
        for (let i = 0; i < tries; i++) h += `<span class="k${i >= state.left ? ' used' : ''}">${ico('key', 16, '🗝️')}</span>`;
        h += `</span><span class="ct-range">${state.lo} – ${state.hi}</span>`;
        triesEl.innerHTML = h;
      };
      drawTries();
      grid.innerHTML = '';
      for (let n = min; n <= max; n++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cnum'; b.textContent = n; b.dataset.n = n;
        b.style.setProperty('--i', n - min);
        b.addEventListener('click', () => guess(n, b));
        grid.appendChild(b);
      }
      function finish(won) {
        state.done = true; state.won = won;
        grid.classList.add('done');
        if (won) {
          msg.className = 'chest-msg win';
          msg.innerHTML = `${ico('sparkles', 20)}<span>Bravo ! Vous avez trouvé l'Arme Ultime !</span>`;
          if (icoEl) { icoEl.innerHTML = ico('lightning', 22, '⚡'); icoEl.className = 'ds-window__icon chest-ico win'; }
          sfx('chestOk');
        } else {
          msg.className = 'chest-msg lose';
          msg.innerHTML = `${ico('skull', 20)}<span>Le coffre a mangé votre Or !<small>Le code était ${code}.</small></span>`;
          if (icoEl) { icoEl.innerHTML = ico('skull', 22, '😈'); icoEl.className = 'ds-window__icon chest-ico lose'; }
          const r = grid.querySelector(`[data-n="${code}"]`); if (r) r.classList.add('reveal');
          sfx('chestBad');
          vibrate(120);
        }
        btn.classList.add('show');
      }
      function guess(n, b) {
        if (state.done || b.classList.contains('tried')) return;
        sfx('click');
        state.left -= 1;
        if (n === code) { b.classList.add('good'); drawTries(); finish(true); return; }
        b.classList.add('tried');
        if (n > code) {
          b.classList.add('hi');
          msg.className = 'chest-msg hi'; msg.innerHTML = `${ico('arrow-down', 18)}<span>Trop haut</span>`;
          state.hi = Math.min(state.hi, n - 1);
        } else {
          b.classList.add('lo');
          msg.className = 'chest-msg lo'; msg.innerHTML = `${ico('arrow-up', 18)}<span>Trop bas</span>`;
          state.lo = Math.max(state.lo, n + 1);
        }
        restartAnim(msg, 'pulse');
        grid.querySelectorAll('.cnum').forEach(x => { const v = +x.dataset.n; toggle(x, 'out', v < state.lo || v > state.hi); });
        drawTries();
        if (state.left <= 0) finish(false);
      }
      btn.onclick = () => {
        if (!state.done) return;
        sfx('click');
        ov.classList.remove('show');
        if (chestPending === state) chestPending = null;
        resolve({ won: state.won, code });
      };
      ov.classList.add('show');
    });
  };

  // ==================================================================
  //  RÉSULTATS
  // ==================================================================
  UI.results = function (r) {
    r = r || {};
    const vic = !!r.victory;
    const scr = $('screen-results');
    if (scr) { scr.classList.toggle('defeat', !vic); scr.classList.toggle('victory', vic); }
    setText($('res-kicker'), vic ? (r.firstClear ? 'Premier passage' : 'Donjon terminé') : (r.reason === 'quit' || r.reason === 'abandon' ? 'Expédition abandonnée' : 'Expédition échouée'));
    setText($('res-title'), vic ? 'VICTOIRE' : 'DÉFAITE');
    const dn = $('res-dungeon');
    if (dn) dn.innerHTML = `${r.rank ? rankBadgeHTML(r.rank, 'xs') : ''}<span>${esc(r.dungeonName || '')}</span>`;
    const resRetry = $('res-retry');
    if (resRetry) resRetry.innerHTML = `<span class="ds-btn__icon">${ico('restart', 18)}</span><span class="ds-btn__label">${vic ? 'Rejouer' : 'Réessayer'}</span>`;
    const resHub = $('res-hub');
    if (resHub) resHub.innerHTML = `<span class="ds-btn__icon">${ico('tent', 18)}</span><span class="ds-btn__label">Retour au camp</span>`;

    // Étoiles : victoire / PV > 50 % / chrono
    const stars = Array.isArray(r.stars) ? r.stars : [vic, false, false];
    let limitTxt = 'Chrono';
    const D = DATA().DUNGEONS || [];
    const di = D.findIndex(d => d && d.name === r.dungeonName);
    const lim = di >= 0 ? safe(() => DATA().STARS.timeLimit(di), null) : null;
    if (isNum(lim)) limitTxt = `< ${fmtTime(lim)}`;
    const labels = ['Victoire', 'PV > 50 %', limitTxt];
    let order = 0;
    const sb = $('res-stars');
    if (sb) {
      sb.innerHTML = [0, 1, 2].map(i => {
        const got = !!stars[i];
        const d = got ? (0.45 + 0.3 * (order++)) : 0;
        return `<div class="rstar${got ? ' got' : ''}${i === 1 ? ' mid' : ''}" style="--d:${d}s">${starSVG(got)}<small>${esc(labels[i])}</small></div>`;
      }).join('');
      for (let i = 0; i < order; i++) setTimeout(() => { if (current === 'results') sfx('pickup'); }, (0.45 + 0.3 * i) * 1000 + 200);
    }
    const badges = $('res-badges');
    if (badges) {
      let h = '';
      if (vic && r.firstClear) h += `<span class="ds-badge ds-badge--accent" style="--d:1.3s">${ico('flag', 12)}Premier passage</span>`;
      if (vic && r.newBest) h += `<span class="ds-badge ds-badge--gold" style="--d:1.45s">${ico('trophy', 12)}Nouveau record</span>`;
      if (r.stats && r.stats.bossKilled) h += `<span class="ds-badge ds-badge--danger" style="--d:1.6s">${ico('crown', 12)}Boss vaincu</span>`;
      if (r.stats && r.stats.secretsFound) h += `<span class="ds-badge ds-badge--violet" style="--d:1.75s">${ico('key', 12)}${num(r.stats.secretsFound)} secret${r.stats.secretsFound > 1 ? 's' : ''}</span>`;
      badges.innerHTML = h;
    }
    const xp = Math.max(0, Math.round(num(r.xpGained))), gold = Math.max(0, Math.round(num(r.goldGained)));
    const st = $('res-stats');
    if (st) {
      st.innerHTML = `
        <div class="rs"><span class="rs-i">${ico('timer', 18)}</span><span class="rs-k">Temps</span><span class="rs-v">${fmtTime(r.time)}</span></div>
        <div class="rs"><span class="rs-i">${ico('skull', 18)}</span><span class="rs-k">Monstres</span><span class="rs-v" id="res-kills">0</span></div>
        <div class="rs rs-xp"><span class="rs-i">${ico('xp', 18)}</span><span class="rs-k">XP gagnée</span><span class="rs-v" id="res-xp">+0</span></div>
        <div class="rs rs-gold"><span class="rs-i">${ico('gold', 18)}</span><span class="rs-k">Or gagné</span><span class="rs-v" id="res-gold">+0</span></div>`;
      countUp($('res-kills'), 0, num(r.kills), 800, { delay: 500 });
      countUp($('res-xp'), 0, xp, 1000, { delay: 650, prefix: '+' });
      countUp($('res-gold'), 0, gold, 1000, { delay: 800, prefix: '+' });
    }
    // graphique : dégâts infligés / subis
    const ch = $('res-chart');
    if (ch) {
      const s = r.stats || {};
      const dd = Math.max(0, num(s.damageDealt)), dt = Math.max(0, num(s.damageTaken));
      if (dd || dt) {
        const m = Math.max(dd, dt, 1);
        ch.innerHTML = `<div class="ds-section-title">${ico('chart', 16)}Combat</div>
          <div class="rc-row"><span class="rc-k">Infligés</span><div class="ds-bar ds-bar--lg rc-bar dealt"><i class="ds-bar__fill" style="width:0" data-w="${(dd / m * 100).toFixed(1)}"></i></div><span class="rc-v ds-num" id="res-dd">0</span></div>
          <div class="rc-row"><span class="rc-k">Subis</span><div class="ds-bar ds-bar--lg ds-bar--danger rc-bar"><i class="ds-bar__fill" style="width:0" data-w="${(dt / m * 100).toFixed(1)}"></i></div><span class="rc-v ds-num" id="res-dt">0</span></div>`;
        setTimeout(() => ch.querySelectorAll('[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; }), 700);
        countUp($('res-dd'), 0, dd, 1000, { delay: 700 });
        countUp($('res-dt'), 0, dt, 1000, { delay: 700 });
        ch.hidden = false;
      } else { ch.innerHTML = ''; ch.hidden = true; }
    }
    // butin
    const lt = $('res-loot');
    if (lt) {
      const loot = Array.isArray(r.loot) ? r.loot.slice() : [];
      const RO = ['secret', 'mythique', 'legendaire', 'epique', 'rare', 'commun'];
      loot.sort((a, b) => RO.indexOf(normRarity(a && a.rarity)) - RO.indexOf(normRarity(b && b.rarity)));
      const mats = r.materials && typeof r.materials === 'object' ? Object.keys(r.materials).filter(k => num(r.materials[k]) > 0) : [];
      if (loot.length || mats.length) {
        const shown = loot.slice(0, 8);
        const matName = id => safe(() => { const M = G.ITEMS && G.ITEMS.materials; const m = M && (M[id] || (Array.isArray(M) && M.find(x => x && x.id === id))); return (m && m.name) || id; }, id);
        lt.innerHTML = `<div class="ds-section-title">${ico('gift', 16)}Butin<span class="ds-section-title__aside">${loot.length} objet${loot.length > 1 ? 's' : ''}</span></div>
          <div class="rl-list">${shown.map((it, i) => { const rr = normRarity(it && it.rarity); return `<div class="rl-item" data-rarity="${rr}" style="--c:${RARITY_COLORS[rr]};--i:${i}"><span class="rl-ico">${hasIco(it && it.icon) ? ico(it.icon, 18) : esc((it && it.icon) || '◆')}</span><span class="rl-name">${esc((it && it.name) || 'Objet')}</span><span class="rl-r">${RARITY_NAMES[rr]}</span></div>`; }).join('')}
          ${loot.length > shown.length ? `<div class="rl-more">+ ${loot.length - shown.length} autre${loot.length - shown.length > 1 ? 's' : ''}</div>` : ''}</div>
          ${mats.length ? `<div class="rl-mats">${mats.slice(0, 8).map(k => `<span class="ds-chip">${ico('rune', 14)}${esc(matName(k))} <b>×${fmtInt(r.materials[k])}</b></span>`).join('')}</div>` : ''}`;
        lt.hidden = false;
      } else { lt.innerHTML = ''; lt.hidden = true; }
    }
    const lv = $('res-level');
    if (lv) {
      const a = num(r.levelBefore, 0), b = num(r.levelAfter, 0);
      if (b > a) { lv.innerHTML = `${ico('level-up', 20)}<span>Niveau <b>${a}</b></span>${ico('arrow-right', 16)}<b class="lv-new">${b}</b>`; lv.className = 'res-level show'; }
      else { lv.className = 'res-level'; lv.innerHTML = ''; }
    }
    if (vic) vibrate([40, 60, 40]); else vibrate(160);
    UI.showScreen('results');
    const card = $('results-card'); if (card) card.scrollTop = 0;
    if (scr) scr.scrollTop = 0;
  };

  // ==================================================================
  //  PAUSE
  // ==================================================================
  let pausedFlag = false;
  function renderPauseStats() {
    const box = $('pause-stats');
    if (!box) return;
    const r = safe(() => G.game && G.game.run, null);
    if (!r) { box.innerHTML = ''; return; }
    const d = r.dungeon || {};
    setText($('pause-sub'), d.name || 'Donjon en cours');
    const rooms = safe(() => (d.rooms && d.rooms.length) || 0, 0);
    const ri = num(r.roomIndex, -1);
    const s = r.stats || {};
    const cell = (icn, k, v) => `<div class="ps"><span class="ps-i">${ico(icn, 16)}</span><span class="ps-v">${v}</span><span class="ps-k">${k}</span></div>`;
    box.innerHTML = cell('timer', 'Temps', fmtTime(num(r.time))) + cell('skull', 'Monstres', fmtInt(num(r.kills))) +
      cell('door', 'Salle', rooms ? `${Math.max(1, ri + 1)}/${rooms}` : (ri >= 0 ? ri + 1 : '—')) + cell('swords', 'Dégâts', fmtInt(num(s.damageDealt)));
  }
  UI.setPaused = function (b) {
    pausedFlag = !!b;
    const ov = $('ov-pause');
    if (ov) toggle(ov, 'show', pausedFlag);
    if (pausedFlag) { syncSound(); renderPauseStats(); }
  };
  UI.isPaused = () => pausedFlag;

  // ==================================================================
  //  FENÊTRES « SYSTÈME » : modal, choice, notify, tooltip
  // ==================================================================
  const sysStack = [];
  const BTN_VARIANT = { primary: 'primary', danger: 'danger', red: 'danger', ghost: 'ghost', grey: 'ghost', gold: 'gold', yellow: 'gold', green: 'success', purple: 'violet', violet: 'violet', secondary: '' };
  function openSys(build, opts) {
    const layer = $('ov-sys') || document.body;
    const ov = document.createElement('div');
    ov.className = 'sys-overlay ds-modal' + (opts.cls ? ' ' + opts.cls : '');
    const bd = document.createElement('div'); bd.className = 'ds-modal__backdrop'; ov.appendChild(bd);
    const entry = { ov, dismissable: opts.dismissable !== false, onKey: null, done: false, prevFocus: document.activeElement };
    ['pointerdown', 'touchstart', 'mousedown'].forEach(ev => ov.addEventListener(ev, e => e.stopPropagation()));
    let resolveFn;
    const promise = new Promise(r => { resolveFn = r; });
    entry.close = function (value) {
      if (entry.done) return;
      entry.done = true;
      const i = sysStack.indexOf(entry); if (i >= 0) sysStack.splice(i, 1);
      ov.classList.add('closing', 'is-closing');
      setTimeout(() => ov.remove(), 230);
      if (typeof entry.onClose === 'function') { try { entry.onClose(); } catch (_) {} }
      try { if (entry.prevFocus && entry.prevFocus.focus) entry.prevFocus.focus({ preventScroll: true }); } catch (_) {}
      resolveFn(value === undefined ? null : value);
    };
    ov.addEventListener('click', e => { if (entry.dismissable && (e.target === ov || e.target === bd)) { sfx('click'); entry.close(null); } });
    build(ov, entry);
    layer.appendChild(ov);
    sysStack.push(entry);
    fillIcons(ov);
    promise.close = entry.close;
    return promise;
  }
  function btnClass(style, i, n) {
    const st = BTN_VARIANT[style] != null ? style : (i === n - 1 ? 'primary' : 'ghost');
    const v = BTN_VARIANT[st];
    return { st, cls: 'sys-btn ' + st + ' ds-btn' + (v ? ' ds-btn--' + v : '') };
  }

  // G.UI.modal({title, html|node|text, icon, buttons:[{label, value, style}], danger, wide, dismissable, onOpen(body, close)}) -> Promise<value|null>
  UI.modal = function (o) {
    o = o || {};
    const btns = Array.isArray(o.buttons) && o.buttons.length ? o.buttons : [{ label: 'OK', value: true, style: 'primary' }];
    return openSys((ov, entry) => {
      const win = document.createElement('div');
      win.className = 'sys-win sys-modal ds-window' + (o.danger ? ' danger ds-window--danger' : '') + (o.wide ? ' wide' : '');
      win.setAttribute('role', 'dialog'); win.setAttribute('aria-modal', 'true');
      const icn = o.icon ? (hasIco(o.icon) ? ico(o.icon, 20) : esc(o.icon)) : '';
      win.innerHTML = `<div class="sys-head ds-window__header">${icn ? `<span class="sm-ico ds-window__icon">${icn}</span>` : ''}<div class="ds-window__titles"><h2 class="sys-title ds-window__title"></h2></div></div><div class="sys-body ds-window__body ds-scroll"></div><div class="sys-foot ds-window__footer"></div>`;
      const head = win.querySelector('.sys-head');
      win.querySelector('.sys-title').textContent = o.title || '';
      if (!o.title && !o.icon) head.style.display = 'none';
      const body = win.querySelector('.sys-body');
      if (o.node instanceof Node) body.appendChild(o.node);
      else if (o.html != null) body.innerHTML = String(o.html);
      else if (o.text != null) body.textContent = String(o.text);
      const foot = win.querySelector('.sys-foot');
      if (btns.length > 2) foot.classList.add('many');
      let defBtn = null;
      btns.forEach((b, i) => {
        const el = document.createElement('button');
        el.type = 'button';
        const bc = btnClass(b.style, i, btns.length);
        el.className = bc.cls;
        el.textContent = b.label == null ? 'OK' : b.label;
        el.addEventListener('click', () => { sfx('click'); entry.close(b.value === undefined ? b.label : b.value); });
        foot.appendChild(el);
        if (bc.st !== 'ghost' && bc.st !== 'grey' && !defBtn) defBtn = el;
      });
      entry.defBtn = defBtn || foot.lastChild;
      ov.appendChild(win);
      setTimeout(() => { try { entry.defBtn && entry.defBtn.focus({ preventScroll: true }); } catch (_) {} }, 60);
      if (typeof o.onOpen === 'function') { try { o.onOpen(body, entry.close); } catch (e) { console.error('[UI.modal onOpen]', e); } }
    }, o);
  };

  // G.UI.choice({title, subtitle, options:[{label, desc, value, icon, rarity, tag, disabled, color}], cancelable, cancelLabel}) -> Promise<value|null>
  UI.choice = function (o) {
    o = o || {};
    const opts = Array.isArray(o.options) ? o.options : [];
    return openSys((ov, entry) => {
      const win = document.createElement('div');
      win.className = 'sys-win sys-choice-wrap ds-window';
      win.innerHTML = `<div class="ds-window__header"><span class="ds-window__icon">${ico('sparkles', 20)}</span><div class="ds-window__titles"><h2 class="sys-title ds-window__title"></h2>${o.subtitle ? '<p class="sys-sub ds-window__subtitle"></p>' : ''}</div></div><div class="ds-window__body ds-scroll"><div class="sys-choices n${Math.min(4, Math.max(1, opts.length))}"></div></div>`;
      win.querySelector('.sys-title').textContent = o.title || 'Choisis';
      const sub = win.querySelector('.sys-sub'); if (sub) sub.textContent = o.subtitle;
      const box = win.querySelector('.sys-choices');
      const pick = i => {
        const op = opts[i]; if (!op) return;
        if (op.disabled) { sfx('error'); return; }
        sfx('click'); entry.close(op.value === undefined ? i : op.value);
      };
      entry.pick = pick;
      opts.forEach((op, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        const r = op.rarity ? normRarity(op.rarity) : '';
        b.className = 'sys-choice ds-card' + (r ? ' r-' + r : '') + (op.disabled ? ' disabled is-locked' : '');
        b.style.setProperty('--i', i);
        const col = op.color ? cssColor(op.color) : (r ? RARITY_COLORS[r] : '');
        if (col) { b.style.setProperty('--rc', col); b.style.setProperty('--c', col); }
        b.innerHTML = `<span class="c-key ds-kbd">${i + 1}</span><span class="c-ico ds-card__media"></span><span class="c-txt"><span class="c-lbl ds-card__title"></span><span class="c-desc ds-card__meta"></span></span>${r && r !== 'commun' || op.tag ? '<span class="c-tag ds-badge"></span>' : ''}`;
        const ci = b.querySelector('.c-ico');
        if (op.icon && hasIco(op.icon)) ci.innerHTML = ico(op.icon, 26); else ci.textContent = op.icon || '◈';
        b.querySelector('.c-lbl').textContent = op.label == null ? '' : op.label;
        const d = b.querySelector('.c-desc'); if (op.desc) d.textContent = op.desc; else d.style.display = 'none';
        const tg = b.querySelector('.c-tag'); if (tg) { tg.textContent = op.tag || RARITY_NAMES[r]; if (col) tg.style.setProperty('--bc', col); }
        b.addEventListener('click', () => pick(i));
        box.appendChild(b);
      });
      if (!opts.length) box.innerHTML = emptyHTML('info', 'Aucune option', 'Aucune option disponible.');
      if (o.cancelable) {
        const f = document.createElement('div'); f.className = 'ds-window__footer ds-window__footer--center';
        const c = document.createElement('button');
        c.type = 'button'; c.className = 'sys-btn ghost ds-btn ds-btn--ghost sys-choice-cancel'; c.textContent = o.cancelLabel || 'Annuler';
        c.addEventListener('click', () => { sfx('click'); entry.close(null); });
        f.appendChild(c); win.appendChild(f);
      }
      entry.dismissable = !!o.cancelable;
      ov.appendChild(win);
    }, { dismissable: !!o.cancelable });
  };
  UI.hasModal = () => sysStack.length > 0;
  UI.closeAllModals = () => sysStack.slice().forEach(e => e.close(null));

  window.addEventListener('keydown', e => {
    const top = sysStack[sysStack.length - 1];
    if (!top) return;
    if (top.keyCapture && top.onKey) { if (top.onKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; } }
    if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'text')) { if (e.key === 'Escape' && top.dismissable) { top.close(null); e.preventDefault(); } e.stopImmediatePropagation(); return; }
    if (e.key === 'Escape') { if (top.dismissable) { sfx('click'); top.close(null); } e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (top.pick && /^[1-9]$/.test(e.key)) { top.pick(+e.key - 1); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (top.onKey && top.onKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Enter' && top.defBtn && !(e.target && e.target.tagName === 'BUTTON')) { top.defBtn.click(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keyup', e => { if (sysStack.length) e.stopImmediatePropagation(); }, true);

  // ---- rappels de touches (HUD + boutons d'action) selon les touches personnalisées ----
  function refreshKeyHints() {
    const KB = G.Keys; if (!KB) return;
    const L = (id) => KB.labelOf(id);
    const kb = (t) => `<span class="ds-kbd">${esc(t)}</span>`;
    const hk = $('hud-keys');
    if (hk) hk.innerHTML = `<span>${kb(L('up'))}${kb(L('left'))}${kb(L('down'))}${kb(L('right'))} bouger</span><span>${kb(L('cast1'))}${kb(L('cast2'))}${kb(L('cast3'))} sorts</span><span>${kb(L('dash'))} roulade</span><span>${kb(L('super'))} ultime</span><span>${kb(L('potion1'))}${kb(L('potion2'))} potions</span><span>${kb(L('pause'))} pause</span>`;
    ['cast1', 'cast2', 'cast3', 'super', 'dash', 'potion1', 'potion2'].forEach(id => { const b = $('btn-' + id); const k = b && b.querySelector('.kkey'); if (k) k.textContent = L(id); });
  }
  if (G.bus && G.bus.on) G.bus.on('keysChanged', refreshKeyHints);
  setTimeout(refreshKeyHints, 0);

  // ---- notifications de butin colorées par rareté ----
  UI.notify = function (o) {
    const box = $('ov-notify');
    if (!box) return null;
    if (typeof o === 'string') o = { text: o };
    o = o || {};
    if (o.text == null || o.text === '') return null;
    const r = normRarity(o.rarity);
    const el = document.createElement('div');
    el.className = 'notif ds-notify r-' + r;
    el.dataset.rarity = r;
    el.style.setProperty('--rc', RARITY_COLORS[r]);
    el.innerHTML = '<span class="n-ico ds-notify__icon"></span><span class="n-txt ds-notify__text"></span>';
    const ie = el.querySelector('.n-ico');
    if (o.icon && hasIco(o.icon)) ie.innerHTML = ico(o.icon, 20); else if (o.icon) ie.textContent = o.icon; else ie.innerHTML = ico('sparkles', 20);
    const t = el.querySelector('.n-txt');
    t.textContent = String(o.text);
    if ((o.rarity && r !== 'commun') || o.sub) {
      const sub = document.createElement('span'); sub.className = 'n-sub ds-notify__sub'; sub.textContent = o.sub || RARITY_NAMES[r]; t.insertBefore(sub, t.firstChild);
    }
    box.appendChild(el);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    const big = r === 'legendaire' || r === 'mythique' || r === 'secret';
    if (!o.silent) sfx(big ? 'upgrade' : 'pickup');
    if (big) vibrate(60);
    const life = big ? 4800 : 3000;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 360); }, num(o.duration, life / 1000) * 1000);
    return el;
  };

  // ---- infobulles : survol (PC) + appui long (mobile) ----
  let tipEl = null, tipFor = null, lastTouchAt = 0;
  function tipNode() { return tipEl || (tipEl = $('ui-tooltip')); }
  function tipContent(el) { let c = el._tipContent; if (typeof c === 'function') c = safe(() => c(el), ''); return c; }
  function showTip(el, x, y, anchorRect) {
    const t = tipNode(); if (!t) return;
    const c = tipContent(el);
    if (c == null || c === '') { hideTip(); return; }
    if (c instanceof Node) { t.innerHTML = ''; t.appendChild(c); } else t.innerHTML = String(c);
    tipFor = el;
    t.classList.add('show');
    const w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let px, py;
    if (anchorRect) { px = anchorRect.left + anchorRect.width / 2 - w / 2; py = anchorRect.top - h - 10; if (py < 6) py = anchorRect.bottom + 10; }
    else { px = x + 14; py = y + 18; if (px + w > vw - 6) px = x - w - 10; if (py + h > vh - 6) py = y - h - 12; }
    t.style.left = Math.max(6, Math.min(vw - w - 6, px)) + 'px';
    t.style.top = Math.max(6, Math.min(vh - h - 6, py)) + 'px';
  }
  function hideTip() { const t = tipNode(); if (t) t.classList.remove('show'); tipFor = null; }
  UI.tooltip = function (el, content) {
    if (!el) return () => {};
    el._tipContent = content;
    if (el._tipOff) return el._tipOff;
    let timer = 0, sx = 0, sy = 0, shownByTouch = false, hideT = 0;
    const L = [];
    const on = (type, fn, o) => { el.addEventListener(type, fn, o); L.push([type, fn, o]); };
    on('mouseenter', e => { if (Date.now() - lastTouchAt < 700) return; showTip(el, e.clientX, e.clientY); });
    on('mousemove', e => { if (tipFor === el && Date.now() - lastTouchAt >= 700) showTip(el, e.clientX, e.clientY); });
    on('mouseleave', () => { if (tipFor === el) hideTip(); });
    on('touchstart', e => {
      lastTouchAt = Date.now();
      const t0 = e.touches[0]; sx = t0.clientX; sy = t0.clientY;
      clearTimeout(timer); clearTimeout(hideT);
      timer = setTimeout(() => { shownByTouch = true; el._tipJustShown = Date.now(); showTip(el, sx, sy, el.getBoundingClientRect()); }, 450);
    }, { passive: true });
    on('touchmove', e => { const t0 = e.touches[0]; if (Math.abs(t0.clientX - sx) + Math.abs(t0.clientY - sy) > 12) clearTimeout(timer); }, { passive: true });
    const end = () => { lastTouchAt = Date.now(); clearTimeout(timer); if (shownByTouch) { shownByTouch = false; hideT = setTimeout(() => { if (tipFor === el) hideTip(); }, 1800); } };
    on('touchend', end); on('touchcancel', end);
    on('contextmenu', e => { if (Date.now() - (el._tipJustShown || 0) < 2500) e.preventDefault(); });
    on('click', e => { if (Date.now() - (el._tipJustShown || 0) < 700) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    el._tipOff = function () { L.forEach(([t, f, o]) => el.removeEventListener(t, f, o)); el._tipOff = null; el._tipContent = null; clearTimeout(timer); if (tipFor === el) hideTip(); };
    return el._tipOff;
  };
  UI.tooltip.hide = hideTip;
  window.addEventListener('scroll', hideTip, true);
  document.addEventListener('pointerdown', e => { if (tipFor && e.pointerType !== 'touch' && !(tipFor.contains && tipFor.contains(e.target))) hideTip(); }, true);

  // ==================================================================
  //  PARAMÈTRES (fenêtre à onglets)
  // ==================================================================
  const SET_TABS = [
    { id: 'audio', label: 'Audio', icon: 'sound-on' },
    { id: 'graphismes', label: 'Graphismes', icon: 'monitor' },
    { id: 'jeu', label: 'Jeu', icon: 'gamepad' },
    { id: 'controles', label: 'Contrôles', icon: 'keyboard' },
    { id: 'compte', label: 'Compte', icon: 'user' },
  ];
  let settingsTab = 'audio';
  function rowHTML(icon, label, desc, control, cls) {
    return `<div class="set-row${cls ? ' ' + cls : ''}"><span class="set-ico">${ico(icon, 18)}</span><div class="set-txt"><div class="set-lbl">${esc(label)}</div>${desc ? `<div class="set-desc">${esc(desc)}</div>` : ''}</div><div class="set-ctl">${control}</div></div>`;
  }
  const ctlToggle = k => `<label class="ds-toggle"><input type="checkbox" data-set="${k}"${settings[k] ? ' checked' : ''}><span class="ds-toggle__track"></span></label>`;
  const ctlSlider = (k, unit) => `<div class="set-slider"><input type="range" class="ds-slider" min="0" max="100" step="5" value="${num(settings[k])}" data-set="${k}" aria-label="${k}"><output class="set-val ds-num" data-out="${k}">${num(settings[k])}${unit || ''}</output></div>`;
  const ctlSeg = (k, opts) => `<div class="ds-segmented" role="group">${opts.map(([v, l]) => `<button type="button" data-seg="${k}" data-v="${v}" class="${settings[k] === v ? 'is-active' : ''}" aria-pressed="${settings[k] === v}">${esc(l)}</button>`).join('')}</div>`;
  function settingsBody(tab) {
    const muted = isMuted();
    if (tab === 'audio') {
      return `<div class="ds-section-title">Son</div>` +
        rowHTML(muted ? 'sound-off' : 'sound-on', 'Son activé', 'Coupe ou rétablit tous les sons du jeu.', `<label class="ds-toggle"><input type="checkbox" data-mute${muted ? '' : ' checked'}><span class="ds-toggle__track"></span></label>`) +
        rowHTML('sound-on', 'Volume général', '', ctlSlider('volume', ' %'), 'set-col') +
        rowHTML('swords', 'Effets sonores', 'Coups, sorts, butin, interface.', ctlSlider('sfxVolume', ' %'), 'set-col') +
        rowHTML('music', 'Musique', 'Réglage conservé pour les thèmes musicaux.', ctlSlider('musicVolume', ' %'), 'set-col') +
        `<div class="set-actions"><button type="button" class="ds-btn ds-btn--sm" data-act="test-sound"><span class="ds-btn__icon">${ico('play', 15)}</span><span class="ds-btn__label">Tester le son</span></button></div>`;
    }
    if (tab === 'graphismes') {
      return `<div class="ds-section-title">Rendu</div>` +
        rowHTML('sparkles', 'Qualité des effets', 'Particules et effets visuels. « Auto » s’adapte à ton appareil.', ctlSeg('quality', [['auto', 'Auto'], ['basse', 'Basse'], ['moyenne', 'Moy.'], ['haute', 'Haute']]), 'set-col') +
        rowHTML('monitor', 'Résolution', 'Une résolution plus basse économise la batterie.', ctlSeg('resolution', [['eco', 'Éco'], ['standard', 'Std'], ['auto', 'Auto'], ['haute', 'Haute']]), 'set-col') +
        rowHTML('shadow', 'Ombres', 'Ombres dynamiques des personnages.', ctlToggle('shadows')) +
        `<div class="ds-section-title">Confort</div>` +
        rowHTML('target', 'Secousses de l’écran', '', ctlSeg('shake', [['off', 'Non'], ['reduit', 'Réduites'], ['normal', 'Normales']]), 'set-col') +
        rowHTML('lightning', 'Flashs lumineux', 'Éclairs plein écran lors des gros impacts.', ctlToggle('screenFlash')) +
        rowHTML('eye', 'Animations réduites', 'Limite les animations de l’interface.', ctlToggle('reduceMotion'));
    }
    if (tab === 'jeu') {
      return `<div class="ds-section-title">Ambiance</div>` +
        rowHTML('skull', 'Horreur', 'Silhouettes, bruits, lumières qui vacillent, événements dans le noir. « Réduite » les atténue de moitié, « Désactivée » les coupe.', ctlSeg('horror', [['normal', 'Normale'], ['reduit', 'Réduite'], ['off', 'Désactivée']]), 'set-col') +
        `<div class="ds-section-title">Combat</div>` +
        rowHTML('target', 'Visée automatique', 'Un appui vise l’ennemi le plus proche. Sinon : droit devant.', ctlToggle('autoAim')) +
        rowHTML('chart', 'Nombres de dégâts', 'Chiffres flottants au-dessus des ennemis.', ctlToggle('damageNumbers')) +
        rowHTML('vibrate', 'Vibrations', 'Retour haptique sur téléphone (coups, butin, niveau).', ctlToggle('vibration')) +
        `<div class="ds-section-title">Aide</div>` +
        rowHTML('help', 'Astuces du premier donjon', 'Bulles d’aide sur le HUD lors de ta première expédition.', ctlToggle('hints')) +
        `<div class="set-actions"><button type="button" class="ds-btn ds-btn--sm" data-act="tutorial"><span class="ds-btn__icon">${ico('tutorial', 15)}</span><span class="ds-btn__label">Revoir le tutoriel</span></button><button type="button" class="ds-btn ds-btn--sm ds-btn--ghost" data-act="coach-reset"><span class="ds-btn__icon">${ico('refresh', 15)}</span><span class="ds-btn__label">Réactiver les bulles</span></button></div>`;
    }
    if (tab === 'controles') {
      const K = (keys, txt) => `<div class="kb-row"><span class="kb-keys">${keys.map(k => `<span class="ds-kbd">${esc(k)}</span>`).join('')}</span><span class="kb-txt">${esc(txt)}</span></div>`;
      const KB = G.Keys;
      const groups = [['move', 'Déplacements'], ['combat', 'Combat'], ['other', 'Divers']];
      const binds = KB ? groups.map(([g, gl]) => `<div class="kbr-group">${esc(gl)}</div>` + KB.actions().filter(a => a.group === g).map(a => {
        const b = KB.get(a.id);
        return `<div class="kbr-row"><span class="kbr-lbl">${esc(a.label)}</span><span class="kbr-keys">${[0, 1].map(i => `<button type="button" class="kbr-key ds-kbd${b[i] ? '' : ' is-empty'}" data-bind="${a.id}" data-slot="${i}" aria-label="${esc(a.label)} : touche ${i + 1}">${esc(b[i] ? KB.label(b[i]) : '—')}</button>`).join('')}</span></div>`;
      }).join('')).join('') : '';
      return `<div class="ds-section-title">${ico('keyboard', 16)}Touches du clavier</div>
        <div class="kbr-help">Clique sur une touche puis appuie sur la nouvelle. <b>Échap</b> annule, <b>Retour arrière</b> efface. Chaque action peut avoir deux touches.</div>
        <div class="kbr-list">${binds}</div>
        <div class="set-actions"><button type="button" class="ds-btn ds-btn--sm" data-act="keys-reset"><span class="ds-btn__icon">${ico('refresh', 15)}</span><span class="ds-btn__label">Touches par défaut</span></button></div>
        <div class="kb-list">` + K(['Clic G', 'Clic D'], 'Compétence 2 / Compétence 3 vers le curseur') + `</div>` +
        `<div class="ds-section-title">${ico('touch', 16)}Tactile</div>` +
        rowHTML('joystick', 'Taille du joystick', '', ctlSeg('joySize', [['s', 'Petit'], ['m', 'Moyen'], ['l', 'Grand']]), 'set-col') +
        rowHTML('target2', 'Taille des boutons', '', ctlSeg('btnSize', [['s', 'Petits'], ['m', 'Moyens'], ['l', 'Grands']]), 'set-col') +
        rowHTML('eye', 'Opacité du HUD', 'Boutons d’action et joystick.', ctlSlider('hudOpacity', ' %'), 'set-col') +
        rowHTML('keyboard', 'Afficher l’aide clavier', 'Rappel des touches en bas de l’écran (PC).', ctlToggle('showKeys'));
    }
    // compte
    const p = profNow() || safe(() => G.save.load(), null);
    const hero = p && p.nom ? `<div class="acc-hero ds-card ds-card--flat"><span class="acc-pt">${portraitHTML(p, 48)}</span><div class="ds-grow"><div class="ds-card__title">${esc(p.nom)}</div><div class="ds-card__meta">${esc(evolvedClassName(p))} · Niv. ${num(p.niveau, 1)}</div></div>${rankBadgeHTML(profileRank(p), 'md')}</div>
      <div class="ds-stat-grid acc-stats">
        <div class="ds-stat"><span class="ds-stat__label">${ico('skull', 15)}Monstres</span><span class="ds-stat__value">${fmtInt(safe(() => p.stats.kills, 0))}</span></div>
        <div class="ds-stat"><span class="ds-stat__label">${ico('crown', 15)}Boss</span><span class="ds-stat__value">${fmtInt(safe(() => p.stats.bosses, 0))}</span></div>
        <div class="ds-stat"><span class="ds-stat__label">${ico('portal', 15)}Donjons</span><span class="ds-stat__value">${fmtInt(safe(() => p.stats.dungeons, 0))}</span></div>
        <div class="ds-stat"><span class="ds-stat__label">${ico('clock', 15)}Temps de jeu</span><span class="ds-stat__value">${fmtPlay(safe(() => p.stats.playTime, 0))}</span></div>
      </div>` : `<div class="ds-empty"><span class="ds-empty__icon">${ico('user', 30)}</span><div class="ds-empty__title">Aucune sauvegarde</div><div>Crée un héros pour commencer.</div></div>`;
    return `<div class="ds-section-title">Profil</div>${hero}
      <div class="ds-section-title">Données</div>
      <div class="set-actions"><button type="button" class="ds-btn ds-btn--sm" data-act="reset-settings"><span class="ds-btn__icon">${ico('refresh', 15)}</span><span class="ds-btn__label">Paramètres par défaut</span></button></div>
      ${p && p.nom ? `<div class="danger-zone" data-step="0">
        <div class="dz-head">${ico('warning', 18)}<b>Zone dangereuse</b></div>
        <p class="dz-txt">Effacer la sauvegarde supprime définitivement ton héros : niveau, rang, or, objets, dons et étoiles.</p>
        <button type="button" class="ds-btn ds-btn--danger ds-btn--block dz-1" data-act="reset-1"><span class="ds-btn__icon">${ico('trash', 18)}</span><span class="ds-btn__label">Réinitialiser la sauvegarde</span></button>
        <div class="dz-confirm">
          <p class="dz-q">Es-tu vraiment sûr ? Cette action est <b>irréversible</b>.</p>
          <div class="dz-btns"><button type="button" class="ds-btn ds-btn--ghost" data-act="reset-cancel">Annuler</button><button type="button" class="ds-btn ds-btn--danger dz-2" data-act="reset-2" disabled><span class="ds-btn__label">Tout effacer</span></button></div>
        </div>
      </div>` : ''}`;
  }
  function fmtPlay(s) { s = Math.max(0, Math.floor(num(s))); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; }

  UI.openSettings = function (tab) {
    if (sysStack.some(e => e.kind === 'settings')) return null;
    if (tab && SET_TABS.some(t => t.id === tab)) settingsTab = tab;
    installRuntimeHooks();
    let dzTimer = 0;
    return openSys((ov, entry) => {
      entry.kind = 'settings';
      const win = document.createElement('div');
      win.className = 'sys-win ds-window settings-win';
      win.setAttribute('role', 'dialog'); win.setAttribute('aria-modal', 'true'); win.setAttribute('aria-label', 'Paramètres');
      win.innerHTML = `<div class="ds-window__header"><span class="ds-window__icon">${ico('settings', 20)}</span><div class="ds-window__titles"><h2 class="ds-window__title">Paramètres</h2><p class="ds-window__subtitle">Enregistrés automatiquement</p></div><div class="ds-window__actions"><button type="button" class="ds-icon-btn ds-icon-btn--sm set-close" aria-label="Fermer">${ico('close', 18)}</button></div></div>
        <div class="set-layout"><nav class="ds-tabs set-tabs" role="tablist">${SET_TABS.map(t => `<button type="button" role="tab" class="ds-tab" data-stab="${t.id}">${ico(t.icon, 18)}<span>${esc(t.label)}</span></button>`).join('')}</nav>
        <div class="ds-window__body set-body ds-scroll"></div></div>`;
      ov.appendChild(win);
      const body = win.querySelector('.set-body');
      const draw = (dir) => {
        clearTimeout(dzTimer);
        win.querySelectorAll('[data-stab]').forEach(b => { const on = b.dataset.stab === settingsTab; toggle(b, 'is-active', on); b.setAttribute('aria-selected', on); });
        body.innerHTML = `<div class="set-page">${settingsBody(settingsTab)}</div>`;
        if (G.DS) { G.DS.syncSliders(body); if (dir) G.DS.transition(null, body.firstChild, dir > 0 ? 'slide-left' : 'slide-right', { flash: false, duration: 220 }); }
        body.scrollTop = 0;
      };
      win.querySelector('.set-close').addEventListener('click', () => { sfx('click'); entry.close(null); });
      win.querySelector('.set-tabs').addEventListener('click', e => {
        const b = e.target.closest('[data-stab]'); if (!b || b.dataset.stab === settingsTab) return;
        const oi = SET_TABS.findIndex(t => t.id === settingsTab), ni = SET_TABS.findIndex(t => t.id === b.dataset.stab);
        sfx('click'); settingsTab = b.dataset.stab; draw(ni > oi ? 1 : -1);
      });
      body.addEventListener('input', e => {
        const t = e.target;
        if (t.matches('input[type=range][data-set]')) {
          setSetting(t.dataset.set, +t.value);
          const o = body.querySelector(`[data-out="${t.dataset.set}"]`); if (o) o.textContent = t.value + ' %';
        }
      });
      body.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('input[type=checkbox][data-set]')) { sfx('click'); setSetting(t.dataset.set, !!t.checked); }
        else if (t.matches('input[type=checkbox][data-mute]')) { if (isMuted() === t.checked) toggleSound(); draw(0); }
        else if (t.matches('input[type=range][data-set]')) sfx('click');
      });
      const stopCapture = () => { entry.keyCapture = null; if (G.Keys) G.Keys.capturing = false; body.querySelectorAll('.kbr-key.is-capturing').forEach(x => x.classList.remove('is-capturing')); };
      entry.onKey = (e) => {
        const c = entry.keyCapture; if (!c || !G.Keys) return false;
        if (e.type && e.type !== 'keydown') return true;
        const k = String(e.key || '').toLowerCase();
        if (k === 'escape') { stopCapture(); draw(0); return true; }
        if (k === 'backspace' || k === 'delete') { G.Keys.set(c.id, c.slot, null); stopCapture(); draw(0); return true; }
        if (!k || k === 'unidentified' || k === 'dead') return true;
        const stolen = G.Keys.set(c.id, c.slot, k);
        stopCapture(); draw(0); sfx('click');
        if (stolen && stolen !== c.id) { const a = G.Keys.actions().find(x => x.id === stolen); UI.toast('« ' + G.Keys.label(k) + ' » retirée de : ' + (a ? a.label : stolen)); }
        return true;
      };
      body.addEventListener('click', e => {
        const kb = e.target.closest('[data-bind]');
        if (kb && G.Keys) {
          sfx('click'); stopCapture();
          entry.keyCapture = { id: kb.dataset.bind, slot: +kb.dataset.slot }; G.Keys.capturing = true;
          kb.classList.add('is-capturing'); kb.textContent = 'Appuie…';
          return;
        }
        const sg = e.target.closest('[data-seg]');
        if (sg) {
          sfx('click'); setSetting(sg.dataset.seg, sg.dataset.v);
          sg.parentNode.querySelectorAll('button').forEach(x => { toggle(x, 'is-active', x === sg); x.setAttribute('aria-pressed', x === sg); });
          return;
        }
        const a = e.target.closest('[data-act]');
        if (!a) return;
        const act = a.dataset.act;
        if (act === 'keys-reset') { sfx('click'); if (G.Keys) G.Keys.reset(); draw(0); UI.toast('Touches par défaut rétablies.'); return; }
        if (act === 'test-sound') { try { G.sfx.unlock && G.sfx.unlock(); } catch (_) {} sfx('levelup'); }
        else if (act === 'tutorial') { sfx('click'); entry.close(null); setTimeout(() => UI.openTutorial(0), 120); }
        else if (act === 'coach-reset') { sfx('click'); try { localStorage.removeItem(COACH_KEY); } catch (_) {} setSetting('hints', true); UI.toast('Les bulles d’aide réapparaîtront au prochain donjon.'); draw(0); }
        else if (act === 'reset-settings') { sfx('click'); settings.reset(); draw(0); UI.toast('Paramètres réinitialisés.'); }
        else if (act === 'reset-1') {
          sfx('error');
          const dz = body.querySelector('.danger-zone'); if (!dz) return;
          dz.dataset.step = '1';
          const b2 = dz.querySelector('.dz-2'); let n = 3;
          b2.disabled = true; b2.querySelector('.ds-btn__label').textContent = `Tout effacer (${n})`;
          const tick = () => { n--; if (n > 0) { b2.querySelector('.ds-btn__label').textContent = `Tout effacer (${n})`; dzTimer = setTimeout(tick, 1000); } else { b2.disabled = false; b2.querySelector('.ds-btn__label').textContent = 'Tout effacer'; } };
          dzTimer = setTimeout(tick, 1000);
        } else if (act === 'reset-cancel') { sfx('click'); clearTimeout(dzTimer); const dz = body.querySelector('.danger-zone'); if (dz) dz.dataset.step = '0'; }
        else if (act === 'reset-2') {
          if (a.disabled) return;
          sfx('click'); entry.close(null);
          UI.setPaused(false);
          lastProfile = null;
          call('resetSave');
          UI.toast('Sauvegarde effacée.');
        }
      });
      entry.onClose = () => { clearTimeout(dzTimer); if (G.Keys) G.Keys.capturing = false; };
      draw(0);
    }, { dismissable: true, cls: 'settings-modal' });
  };

  // ==================================================================
  //  TUTORIEL « Comment jouer » (paginé, illustré)
  // ==================================================================
  function tutoPages() {
    const touch = isTouch();
    const rk = ['E', 'D', 'C', 'B', 'A', 'S', 'Z'].map(r => rankBadgeHTML(r, 'md')).join('');
    return [
      { icon: 'joystick', title: 'Se déplacer', kicker: 'Les bases',
        art: `<div class="tu-art tu-move"><div class="tu-joy"><i class="tu-knob"></i><i class="tu-arr a1"></i><i class="tu-arr a2"></i><i class="tu-arr a3"></i><i class="tu-arr a4"></i></div><div class="tu-keys"><span class="ds-kbd k-z">Z</span><span class="ds-kbd">Q</span><span class="ds-kbd">S</span><span class="ds-kbd">D</span></div></div>`,
        text: touch ? 'Pose le pouce n’importe où sur la <b>moitié gauche</b> de l’écran : un joystick apparaît. Glisse pour courir dans la salle.' : 'Utilise <span class="ds-kbd">Z</span><span class="ds-kbd">Q</span><span class="ds-kbd">S</span><span class="ds-kbd">D</span> ou les flèches. Sur téléphone, un joystick apparaît sous ton pouce gauche.' },
      { icon: 'target', title: 'Attaquer & viser', kicker: 'Combat',
        art: `<div class="tu-art tu-aim"><div class="tu-btns"><i class="tu-b b1">1</i><i class="tu-b b2">2</i><i class="tu-b b3">3</i></div><div class="tu-drag"><i class="tu-finger"></i><i class="tu-ray"></i></div><div class="tu-target">${ico('target', 34)}</div></div>`,
        text: '<b>Touche</b> un bouton de sort : la visée automatique cible l’ennemi le plus proche. <b>Glisse</b> depuis le bouton pour viser à la main, relâche pour tirer. Sur PC : clic gauche / droit vers le curseur.' },
      { icon: 'dash', title: 'Roulade & esquive parfaite', kicker: 'Défense',
        art: `<div class="tu-art tu-dodge"><div class="tu-timeline"><i class="tu-win"></i><i class="tu-hit"></i><i class="tu-cursor"></i></div><div class="tu-legend"><span><i class="lg-win"></i>0,15 s</span><span><i class="lg-hit"></i>Impact</span></div></div>`,
        text: 'La roulade te rend brièvement invulnérable. Déclenchée <b>juste avant</b> un coup (0,15 s), elle devient une <b>esquive parfaite</b> : ralenti et contre-attaque.' },
      { icon: 'tornado', title: 'Ultime', kicker: 'Puissance',
        art: `<div class="tu-art tu-ult"><div class="tu-ring"><i></i><span>${ico('tornado', 30)}</span></div></div>`,
        text: 'L’ultime se <b>charge en infligeant des dégâts</b>. Quand l’anneau est plein et que le bouton brille, déclenche-le au cœur de la mêlée.' },
      { icon: 'portal', title: 'Rangs & portails', kicker: 'Progression',
        art: `<div class="tu-art tu-ranks"><div class="tu-rk">${rk}</div><div class="tu-portal">${ico('portal', 42)}</div></div>`,
        text: 'Les portails ont un <b>rang</b> (E → Z). Tu ne peux entrer que dans ceux de ton rang. Remplis les conditions puis réussis une <b>épreuve de promotion</b> pour monter d’un rang.' },
      { icon: 'bag', title: 'Équipement, dons & compétences', kicker: 'Personnalisation',
        art: `<div class="tu-art tu-gear"><div class="tu-tile" style="--c:var(--r-epique)">${ico('shirt', 26)}<small>Objets</small></div><div class="tu-tile" style="--c:var(--ds-accent-2)">${ico('rune', 26)}<small>Dons</small></div><div class="tu-tile" style="--c:var(--ds-accent)">${ico('sparkles', 26)}<small>Compétences</small></div></div>`,
        text: 'Au camp : équipe le butin dans l’<b>Inventaire</b>, choisis tes <b>Dons</b> (synergies entre éléments) et dépense tes points dans l’arbre de <b>Compétences</b>. La <b>Forge</b> améliore tes armes.' },
      { icon: 'skull', title: 'Le Nécromancien', kicker: 'Classe secrète',
        art: `<div class="tu-art tu-necro"><div class="tu-skull">${ico('skull', 46)}</div><div class="tu-odds">0,01 %</div></div>`,
        text: 'Une classe secrète sommeille. Chaque <b>Rituel d’éveil</b> (un à la création, un par Cristal d’éveil) a exactement <b>1 chance sur 10 000</b> de t’éveiller en Nécromancien, maître d’une armée d’ombres. Aucune garantie : seule la chance compte.' },
    ];
  }
  UI.openTutorial = function (start) {
    const pages = tutoPages();
    let i = Math.max(0, Math.min(pages.length - 1, num(start, 0)));
    return openSys((ov, entry) => {
      entry.kind = 'tutorial';
      const win = document.createElement('div');
      win.className = 'sys-win ds-window tuto-win';
      win.setAttribute('role', 'dialog'); win.setAttribute('aria-modal', 'true'); win.setAttribute('aria-label', 'Comment jouer');
      win.innerHTML = `<div class="ds-window__header"><span class="ds-window__icon">${ico('tutorial', 20)}</span><div class="ds-window__titles"><h2 class="ds-window__title">Comment jouer</h2><p class="ds-window__subtitle tu-count"></p></div><div class="ds-window__actions"><button type="button" class="ds-icon-btn ds-icon-btn--sm tu-close" aria-label="Fermer">${ico('close', 18)}</button></div></div>
        <div class="ds-window__body tu-body"></div>
        <div class="ds-window__footer tu-foot"><button type="button" class="ds-btn ds-btn--sm tu-prev">${ico('chevron-left', 16)}<span class="ds-btn__label">Préc.</span></button><div class="tu-dots">${pages.map((_, k) => `<button type="button" class="tu-dot" data-p="${k}" aria-label="Page ${k + 1}"></button>`).join('')}</div><button type="button" class="ds-btn ds-btn--primary ds-btn--sm tu-next"><span class="ds-btn__label">Suivant</span>${ico('chevron-right', 16)}</button></div>`;
      ov.appendChild(win);
      const body = win.querySelector('.tu-body');
      const draw = dir => {
        const p = pages[i];
        body.innerHTML = `<div class="tu-page"><div class="tu-illu">${p.art}</div><div class="tu-kicker">${ico(p.icon, 16)}${esc(p.kicker)}</div><h3 class="tu-title">${esc(p.title)}</h3><p class="tu-text">${p.text}</p></div>`;
        setText(win.querySelector('.tu-count'), `Page ${i + 1} sur ${pages.length}`);
        win.querySelectorAll('.tu-dot').forEach((d, k) => toggle(d, 'on', k === i));
        win.querySelector('.tu-prev').disabled = i === 0;
        const nx = win.querySelector('.tu-next');
        nx.querySelector('.ds-btn__label').textContent = i === pages.length - 1 ? 'Terminer' : 'Suivant';
        if (dir) dsTransition(null, body.firstChild, dir > 0 ? 'slide-left' : 'slide-right', { flash: false, duration: 240 });
      };
      const go = d => { const n = i + d; if (n < 0) return; if (n >= pages.length) { sfx('click'); entry.close(true); return; } sfx('click'); i = n; draw(d); };
      win.querySelector('.tu-prev').addEventListener('click', () => go(-1));
      win.querySelector('.tu-next').addEventListener('click', () => go(1));
      win.querySelector('.tu-close').addEventListener('click', () => { sfx('click'); entry.close(null); });
      win.querySelector('.tu-dots').addEventListener('click', e => { const d = e.target.closest('[data-p]'); if (!d) return; const n = +d.dataset.p; if (n !== i) { const dir = n > i ? 1 : -1; i = n; sfx('click'); draw(dir); } });
      entry.onKey = e => { if (e.key === 'ArrowRight') { go(1); return true; } if (e.key === 'ArrowLeft') { go(-1); return true; } return false; };
      // glisser horizontal (mobile)
      let sx = null;
      body.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
      body.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
      entry.defBtn = win.querySelector('.tu-next');
      draw(0);
    }, { dismissable: true, cls: 'tuto-modal' });
  };

  UI.openCredits = function () {
    return UI.modal({
      title: 'Crédits', icon: 'scroll',
      html: `<div class="credits"><div class="cr-logo">DONJON <b>ARENA</b> 3D</div><p class="cr-sub">Action-RPG original · v4 « Éveil »</p>
        <div class="ds-stat"><span class="ds-stat__label">${ico('swords', 15)}Conception & gameplay</span><span class="ds-stat__value">Équipe Donjon Arena</span></div>
        <div class="ds-stat"><span class="ds-stat__label">${ico('palette', 15)}Interface « Éveil »</span><span class="ds-stat__value">Système de design v4</span></div>
        <div class="ds-stat"><span class="ds-stat__label">${ico('monitor', 15)}Moteur 3D</span><span class="ds-stat__value">three.js r128</span></div>
        <div class="ds-stat"><span class="ds-stat__label">${ico('book', 15)}Polices</span><span class="ds-stat__value">Chakra Petch · Nunito</span></div>
        <p class="cr-note">Personnages, monstres, univers et icônes originaux. Merci de jouer !</p></div>`,
      buttons: [{ label: 'Fermer', value: true, style: 'primary' }],
    });
  };

  // utilitaires pour les panneaux des autres rôles
  UI.esc = esc; UI.fmtInt = fmtInt; UI.fmtTime = fmtTime;
  UI.rarityColor = rarityColor; UI.rarityName = r => RARITY_NAMES[normRarity(r)];
  UI.rankColor = rankColor; UI.rankBadge = rankBadgeHTML; UI.rankName = rankName;
  UI.classInfo = classInfo; UI.evolvedClassName = evolvedClassName;
  UI.icon = (name, size, fallback) => ico(name, size, fallback);
  UI.hideBoot = function () { const b = $('boot'); if (b && !b.classList.contains('failed')) { b.classList.add('done'); setTimeout(() => b.remove(), 600); } };

  // ==================================================================
  //  INIT
  // ==================================================================
  UI.init = function () {
    if (inited) return;
    inited = true;
    fillIcons(document);
    installRuntimeHooks();
    applySettings();
    // icônes des boutons fixes
    const setIco = (id, n, s) => { const el = $(id); if (el && !el.innerHTML.trim()) el.innerHTML = ico(n, s || 22); };
    setIco('title-settings', 'settings'); setIco('create-back', 'back'); setIco('forge-back', 'back');
    setIco('hub-forge', 'anvil', 18); setIco('hub-settings', 'settings', 18);
    // Titre
    tap($('btn-continue'), () => call('continueGame'));
    tap($('btn-new'), () => UI.showScreen('create'));
    initTitleAccount();
    initGuide();
    tap($('btn-settings'), () => UI.openSettings());
    tap($('title-settings'), () => UI.openSettings());
    tap($('btn-tutorial'), () => UI.openTutorial(0));
    tap($('btn-credits'), () => UI.openCredits());
    // Création (écran de secours v2)
    tap($('create-back'), () => UI.showScreen('title'));
    const inp = $('create-name');
    if (inp) {
      inp.addEventListener('input', updatePreview);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      inp.addEventListener('keyup', e => e.stopPropagation());
    }
    tap($('create-start'), () => {
      const ids = Object.keys(classesObj());
      call('newGame', heroName(), selectedClass || ids[0] || 'Guerrier');
    });
    // Camp
    tap($('hub-forge'), () => { UI.showScreen('forge'); UI.renderForge(lastProfile); });
    tap($('hub-settings'), () => UI.openSettings());
    const tabs = $('camp-tabs');
    if (tabs) {
      tabs.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.ctab'); if (b) { sfx('click'); UI.setTab(b.dataset.tab); } });
      tabs.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const list = visiblePanels(lastProfile || {}); const i = list.findIndex(d => d.id === campTab);
        const n = list[i + ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1)];
        if (n) { UI.setTab(n.id); const el = tabs.querySelector('.ctab.on'); if (el) el.focus(); e.preventDefault(); }
      });
    }
    registerFallbackPanels();
    if (G.bus && G.bus.on) {
      G.bus.on('profileChanged', pl => { if (pl && pl.profile) lastProfile = pl.profile; if (current === 'hub') refreshCampSoon(); const p = profNow(); if (p) hud.setRank(profileRank(p)); });
      G.bus.on('portalsChanged', () => { if (current === 'hub') refreshCampSoon(); });
      G.bus.on('runEnd', () => { const p = profNow(); if (p) lastProfile = p; if (current === 'hub') refreshCampSoon(); hideCoach(); });
      G.bus.on('runStart', () => {
        const p = profNow(); if (p) hud.setRank(profileRank(p));
        if (p && num(safe(() => p.stats.dungeons, 0), 0) === 0 && settings.hints && !coachDone()) setTimeout(() => { if (current === 'game') startCoach(false); }, 1600);
      });
      G.bus.on('playerHit', pl => { if (pl && num(pl.amount) > 0) vibrate(22); });
      G.bus.on('bossKilled', () => vibrate([60, 40, 90]));
    }
    // Forge
    tap($('forge-back'), () => { UI.renderHub(lastProfile); UI.showScreen('hub'); });
    // Résultats
    tap($('res-retry'), () => call('restartDungeon'));
    tap($('res-hub'), () => call('backToHub'));
    // Pause
    tap($('pause-resume'), () => { if (hasCb('resume')) call('resume'); else UI.setPaused(false); });
    tap($('pause-settings'), () => UI.openSettings());
    tap($('pause-restart'), () => { UI.setPaused(false); call('restartDungeon'); });
    tap($('pause-quit'), () => { UI.setPaused(false); call('quitDungeon'); });
    // Son
    document.querySelectorAll('.btn-sound').forEach(b => tap(b, toggleSound, null));
    tap($('pause-sound'), toggleSound, null);

    bindHud();
    hud.setCooldowns({ 1: 0, 2: 0, 3: 0, dash: 0 });
    hud.setSuper(0);
    hud.setBoss(null);
    hud.setObjective('');
    syncSound();
    if (typeof THREE !== 'undefined') { const bm = $('boot-msg'); if (bm) bm.textContent = 'Chargement…'; }
    if (!current) UI.showScreen('title');
  };
})();
