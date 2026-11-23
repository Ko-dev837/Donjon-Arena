/* =====================================================================
 *  Donjon Arena 3D — v5 « Ténèbres » — AGENT 9 : Sound Designer  →  G.Audio
 *  Tout est SYNTHÉTISÉ en WebAudio (aucun fichier). Voir CONTRACT-V5.md §4.
 *
 *  API : unlock(), music(id,{fade}), intensity(x), ambience(id), play(name,opts),
 *        at(name,x,z,opts), duck(level,ms,opts), stinger(name), stopAll(),
 *        setReverb(kind), tension(), debug(), list(), resolveStyle(id).
 * ===================================================================== */
window.G = window.G || {};
(function () {
  'use strict';
  const A = G.Audio = G.Audio || {};

  // ------------------------------------------------------------------
  //  Utilitaires
  // ------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tokens = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  /** mots-clés : 'abc' = préfixe, 'abc$' = mot exact */
  function kw(toks, list) {
    for (let i = 0; i < toks.length; i++) for (let j = 0; j < list.length; j++) {
      const k = list[j];
      if (k.charAt(k.length - 1) === '$' ? toks[i] === k.slice(0, -1) : toks[i].indexOf(k) === 0) return true;
    }
    return false;
  }
  const settings = () => (G.settings || {});
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  // ------------------------------------------------------------------
  //  État du moteur
  // ------------------------------------------------------------------
  let ac = null, realDest = null, master = null, comp = null;
  let noiseW = null, noiseP = null, noiseB = null;
  let busM = null, busA = null, busS = null, busT = null;   // musique, ambiance, sfx, stingers
  let revIn = null, revOut = null;
  const revConv = {};
  let revKind = 'pierre';
  let live = 0, liveMax = 0;
  let wanted = { music: null, amb: null, mopts: null };
  let muted = false, suspended = false, injected = false;
  const MAXV = 24;
  let voices = [];
  const lastPlay = {};
  let tensionV = 0, tensionAt = 0, manualX = 0, autoX = 0, effX = 0;
  let cur = null, olds = [];
  let curAmb = null, oldAmbs = [];
  let timer = null, lastTick = 0, tickN = 0;
  let duckAmbUntil = 0;
  let heartNext = 0, breathNext = 0;
  let inRunFlag = false, screenId = null, runDungeon = null, bossActive = false;
  let lastEnemyVoice = 0;

  // ------------------------------------------------------------------
  //  Nœuds de base : suivi des sources, bruits, enveloppes
  // ------------------------------------------------------------------
  function track(src, set) {
    live++; if (live > liveMax) liveMax = live;
    if (set) set.add(src);
    src.onended = () => { live--; if (set) set.delete(src); try { src.disconnect(); } catch (_) {} };
    return src;
  }
  function mkBuf(kind) {
    const sr = ac.sampleRate, len = sr * 3, b = ac.createBuffer(1, len, sr), d = b.getChannelData(0);
    if (kind === 'w') for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    else if (kind === 'p') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else { let l = 0; for (let i = 0; i < len; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }
    const x = 2000; for (let i = 0; i < x; i++) { const k = i / x; d[len - x + i] = d[len - x + i] * (1 - k) + d[i] * k; }
    return b;
  }
  function env(param, t, a, dur, vol, o) {
    o = o || {};
    const v = Math.max(0.0002, vol), end = t + Math.max(0.02, dur);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(v, t + Math.min(a, dur * 0.9));
    if (o.hold) param.setValueAtTime(v, Math.max(t + a, end - Math.min(o.rel || dur * 0.3, dur * 0.8)));
    param.exponentialRampToValueAtTime(0.0001, end);
  }
  /** oscillateur + enveloppe -> dest. o : {f2, det, a, vol, hold, rel, set} */
  function O(type, f, t, dur, dest, o) {
    o = o || {};
    f = Math.max(1, fin(f, 220)); dur = Math.max(0.03, fin(dur, 0.2));
    const s = ac.createOscillator(); s.type = type; s.frequency.setValueAtTime(f, t);
    if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + dur);
    if (o.det) s.detune.value = o.det;
    const g = ac.createGain();
    env(g.gain, t, o.a == null ? 0.005 : o.a, dur, o.vol == null ? 0.2 : o.vol, o);
    s.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.05); track(s, o.set);
    return g;
  }
  /** bruit filtré + enveloppe. o : {type,f,f2,q,vol,a,hold,rel,color,am,amd,set} */
  function N(t, dur, dest, o) {
    o = o || {};
    dur = Math.max(0.02, fin(dur, 0.2));
    const s = ac.createBufferSource(); s.buffer = o.color === 'p' ? noiseP : o.color === 'b' ? noiseB : noiseW; s.loop = true;
    let last = s;
    if (o.type) {
      const f = ac.createBiquadFilter(); f.type = o.type; f.frequency.setValueAtTime(Math.max(10, fin(o.f, 1000)), t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t + dur);
      f.Q.value = fin(o.q, 1); s.connect(f); last = f;
    }
    const g = ac.createGain();
    env(g.gain, t, o.a == null ? 0.003 : o.a, dur, o.vol == null ? 0.2 : o.vol, o);
    last.connect(g); last = g;
    if (o.am) {
      const dp = o.amd == null ? 0.8 : o.amd, m = ac.createGain(); m.gain.value = 1 - dp;
      const l = ac.createOscillator(); l.frequency.value = o.am; const lg = ac.createGain(); lg.gain.value = dp;
      l.connect(lg); lg.connect(m.gain); l.start(t); l.stop(t + dur + 0.05); track(l, o.set);
      last.connect(m); last = m;
    }
    last.connect(dest);
    s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.05); track(s, o.set);
    return g;
  }
  function bp(dest, f, q) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }
  function lpf(dest, f, q) { const b = ac.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q || 0.7; b.connect(dest); return b; }
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };

  // ------------------------------------------------------------------
  //  Bus + réverbération par convolution synthétique
  // ------------------------------------------------------------------
  function mkBus() {
    const b = {};
    b.in = gain(1); b.duck = gain(1); b.vol = gain(1);
    b.wetIn = gain(1); b.duckW = gain(1); b.volW = gain(1);
    b.in.connect(b.duck); b.duck.connect(b.vol); b.vol.connect(master);
    b.wetIn.connect(b.duckW); b.duckW.connect(b.volW); b.volW.connect(revIn);
    return b;
  }
  const IR = {
    pierre:     { len: 1.7, decay: 2.8, damp: 0.30, gain: 1.0 },
    caverne:    { len: 3.2, decay: 2.2, damp: 0.20, gain: 0.9 },
    foret:      { len: 1.3, decay: 2.2, damp: 0.45, gain: 0.8, sparse: true },
    cathedrale: { len: 5.0, decay: 1.9, damp: 0.38, gain: 0.95 },
  };
  function makeIR(kind) {
    const c = IR[kind] || IR.pierre, sr = ac.sampleRate, n = Math.floor(c.len * sr);
    const buf = ac.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n, e = Math.pow(1 - t, c.decay), coef = clamp(c.damp * (1 - t * 0.85), 0.02, 1);
        let x = Math.random() * 2 - 1;
        if (c.sparse && Math.random() < 0.55) x *= 0.2;
        lp += (x - lp) * coef; d[i] = lp * e * 2.2 * c.gain;
      }
      for (let i = 0; i < 200; i++) d[i] *= i / 200;
    }
    return buf;
  }
  function setReverb(kind) {
    if (!IR[kind]) kind = 'pierre';
    revKind = kind;
    if (!ac) return;
    if (!revConv[kind]) {
      const conv = ac.createConvolver(); conv.normalize = true; conv.buffer = makeIR(kind);
      const send = gain(0); revIn.connect(send); send.connect(conv); conv.connect(revOut);
      revConv[kind] = { conv, send };
    }
    const t = ac.currentTime;
    for (const k in revConv) { const g = revConv[k].send.gain; g.cancelScheduledValues(t); g.setTargetAtTime(k === kind ? 1 : 0, t, 0.6); }
  }
  A.setReverb = setReverb;

  // ------------------------------------------------------------------
  //  Création du contexte
  // ------------------------------------------------------------------
  function build(ctx) {
    ac = ctx;
    try {   // destination native : G.UI enveloppe ctx.destination d'un gain volume*sfxVolume, on gère nos volumes nous-mêmes
      let proto = Object.getPrototypeOf(ctx), d = null;
      while (proto && !d) { d = Object.getOwnPropertyDescriptor(proto, 'destination'); proto = Object.getPrototypeOf(proto); }
      realDest = d && d.get ? d.get.call(ctx) : ctx.destination;
    } catch (_) { realDest = ctx.destination; }
    master = gain(0.85); comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    master.connect(comp); comp.connect(realDest);
    revIn = gain(1); revOut = gain(0.55); revOut.connect(master);
    noiseW = mkBuf('w'); noiseP = mkBuf('p'); noiseB = mkBuf('b');
    busM = mkBus(); busA = mkBus(); busS = mkBus(); busT = mkBus();
    setReverb(revKind);
    applyVolumes(true);
  }
  function applyVolumes(immediate) {
    if (!ac) return;
    const s = settings(), t = ac.currentTime;
    const mv = clamp(num(s.volume, 80) / 100, 0, 1), sv = clamp(num(s.sfxVolume, 100) / 100, 0, 1), muv = clamp(num(s.musicVolume, 70) / 100, 0, 1);
    muted = !!(G.sfx && G.sfx.muted);
    const set = (g, v) => { g.cancelScheduledValues(t); if (immediate) g.setValueAtTime(v, t); else g.setTargetAtTime(v, t, 0.05); };
    set(master.gain, muted ? 0 : 0.85 * mv);
    set(busM.vol.gain, muv * 0.8); set(busM.volW.gain, muv * 0.8);
    set(busT.vol.gain, muv * 0.9); set(busT.volW.gain, muv * 0.9);
    set(busA.vol.gain, sv * 0.8); set(busA.volW.gain, sv * 0.8);
    set(busS.vol.gain, sv); set(busS.volW.gain, sv);
  }
  A.unlock = function () {
    try {
      if (!ac) {
        if (injected) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        build(new AC({ latencyHint: 'interactive' }));
        startTimer();
        const w = wanted; wanted = { music: null, amb: null, mopts: null };
        if (w.amb) A.ambience(w.amb);
        if (w.music) A.music(w.music, w.mopts || {});
        pollScreen(true);
      }
      if (ac.state === 'suspended' && !document.hidden && ac.resume) ac.resume();
    } catch (e) { console.warn('[audio] unlock', e); }
  };
  A.ready = () => !!ac;
  /** Test : injecte un contexte (OfflineAudioContext) à la place du contexte réel. */
  A._useContext = function (ctx) { injected = true; build(ctx); };
  ['pointerdown', 'keydown', 'touchend', 'click'].forEach(ev => { try { addEventListener(ev, () => A.unlock(), true); } catch (_) {} });
  try {
    document.addEventListener('visibilitychange', () => {
      if (!ac || injected) return;
      if (document.hidden) { suspended = true; safe(() => ac.suspend()); }
      else { suspended = false; safe(() => ac.resume()); lastTick = performance.now(); }
    });
  } catch (_) {}

  // ------------------------------------------------------------------
  //  Sortie d'un son : gain -> [filtre de distance] -> [pan] -> bus (+ envoi réverb)
  // ------------------------------------------------------------------
  function buildChain(o, bus, g) {
    let last = g;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; last.connect(f); last = f; }
    if (o.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); last.connect(p); last = p; }
    last.connect(bus.in);
    if (o.rev > 0.01) { const s = gain(o.rev); last.connect(s); s.connect(bus.wetIn); g._send = s; }
    g._tail = last;
    return g;
  }

  // ------------------------------------------------------------------
  //  Voix formantiques et notes de base
  // ------------------------------------------------------------------
  const VOW = { a: [800, 1150], o: [450, 800], u: [325, 700], e: [400, 2000], i: [270, 2300], oe: [500, 1500] };
  const VOWL = ['a', 'o', 'u', 'e', 'i', 'oe'];
  /** murmure : bruit filtré par 2 formants dont la voyelle change à chaque syllabe */
  function whisper(t, o, p, opt) {
    const dur = opt.dur || 1.8, syl = opt.syl || Math.round(dur * 3.2), vol = opt.vol || 1;
    const src = ac.createBufferSource(); src.buffer = noiseW; src.loop = true;
    const amp = ac.createGain(); amp.gain.setValueAtTime(0.0001, t); amp.connect(o);
    const g2 = gain(0.55); g2.connect(amp);
    const b1 = bp(amp, 500, opt.q || 6), b2 = bp(g2, 1500, opt.q || 6);
    src.connect(b1); src.connect(b2);
    const step = dur / syl;
    for (let i = 0; i < syl; i++) {
      const v = VOW[pick(VOWL)], ts = t + i * step + rnd(0, step * 0.2);
      b1.frequency.setTargetAtTime(v[0] * p.pitch, ts, 0.03); b2.frequency.setTargetAtTime(v[1] * p.pitch, ts, 0.03);
      amp.gain.setTargetAtTime(vol * rnd(0.5, 1) * 1.3, ts, 0.025); amp.gain.setTargetAtTime(0.02, ts + step * rnd(0.45, 0.7), 0.04);
      if (Math.random() < 0.6) N(ts, 0.07, o, { type: 'highpass', f: 5500, vol: 0.13 * vol, a: 0.01 });
    }
    amp.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.4); track(src);
    return dur + 0.4;
  }
  /** son voisé (cri, rire, gémissement) : dents de scie + 2 formants */
  function voiced(t, o, f, f2, dur, vow, opt) {
    opt = opt || {};
    const v = VOW[vow || 'a'], mix = gain(1), g = ac.createGain();
    env(g.gain, t, opt.a == null ? 0.04 : opt.a, dur, opt.vol || 0.3, opt);
    const b1 = bp(g, v[0], opt.q || 5), b2 = bp(g, v[1], opt.q || 5);
    mix.connect(b1); mix.connect(b2); g.connect(o);
    [-9, 0, 11].forEach(d => {
      const s = ac.createOscillator(); s.type = opt.wave || 'sawtooth'; s.frequency.setValueAtTime(f, t);
      if (f2) s.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      s.detune.value = d;
      if (opt.vib) { const l = ac.createOscillator(); l.frequency.value = opt.vib; const lg = gain(opt.vibd || 25); l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + dur + 0.05); track(l); }
      const sg = gain(0.33); s.connect(sg); sg.connect(mix); s.start(t); s.stop(t + dur + 0.05); track(s);
    });
    if (opt.breath) N(t, dur, o, { type: 'bandpass', f: v[1], q: 2, vol: opt.breath, a: opt.a || 0.05 });
    return dur;
  }
  const metalHit = (t, o, f, dur, vol, ratios) => {
    (ratios || [1, 2.32, 4.25, 6.63]).forEach((r, i) => O('sine', f * r, t, dur / (1 + i * 0.7), o, { vol: vol / (1 + i * 0.6), a: 0.002 }));
    N(t, 0.02, o, { type: 'highpass', f: 3500, vol: vol * 0.5 });
  };

  // ------------------------------------------------------------------
  //  BRUITAGES  fn(t, out, p) -> durée ; p = {pitch}
  // ------------------------------------------------------------------
  const SFX = {
    pas_pierre(t, o, p) {
      O('sine', 120 * p.pitch, t, 0.14, o, { f2: 48 * p.pitch, vol: 0.7 });
      N(t, 0.09, o, { type: 'lowpass', f: 1100 * p.pitch, vol: 0.5 }); N(t, 0.025, o, { type: 'bandpass', f: 2600, q: 1.5, vol: 0.22 });
      return 0.2;
    },
    pas_bois(t, o, p) {
      O('sine', 190 * p.pitch, t, 0.1, o, { f2: 95 * p.pitch, vol: 0.6 }); O('triangle', 330 * p.pitch, t, 0.16, o, { vol: 0.15 });
      N(t, 0.07, o, { type: 'bandpass', f: 700 * p.pitch, q: 3, vol: 0.45 });
      if (Math.random() < 0.3) O('sawtooth', 160, t + 0.05, 0.25, bp(o, 520, 9), { f2: 240, vol: 0.12, a: 0.05 });
      return 0.4;
    },
    pas_eau(t, o, p) {
      N(t, 0.2, o, { type: 'bandpass', f: 1300 * p.pitch, f2: 600, q: 1, vol: 0.5, a: 0.01 });
      O('sine', 420 * p.pitch, t + 0.02, 0.07, o, { f2: 900 * p.pitch, vol: 0.2 }); N(t + 0.04, 0.12, o, { type: 'highpass', f: 3200, vol: 0.1 });
      return 0.3;
    },
    craquement(t, o, p) {
      const n = 3 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) { const ti = t + Math.random() * 0.3; N(ti, rnd(0.008, 0.03), o, { type: 'highpass', f: rnd(1200, 3000), vol: rnd(0.3, 0.7) }); O('sine', rnd(60, 120) * p.pitch, ti, 0.1, o, { vol: 0.25 }); }
      N(t, 0.3, o, { type: 'bandpass', f: 380, q: 2, vol: 0.12, a: 0.05 });
      return 0.5;
    },
    porte_claque(t, o, p) {
      N(t, 0.6, o, { type: 'lowpass', f: 420 * p.pitch, f2: 140, vol: 0.9, a: 0.002 }); O('sine', 75 * p.pitch, t, 0.6, o, { f2: 32, vol: 0.9 });
      N(t, 0.06, o, { type: 'bandpass', f: 1600, q: 1, vol: 0.5 }); N(t + 0.1, 0.25, o, { type: 'lowpass', f: 300, vol: 0.3 });
      O('sine', 60, t + 0.1, 0.2, o, { f2: 40, vol: 0.4 });
      return 0.9;
    },
    objet_tombe(t, o, p) {
      const f = rnd(500, 1100) * p.pitch;
      [0, 0.13, 0.22, 0.28].forEach((d, i) => { const k = Math.pow(0.5, i); metalHit(t + d, o, f * (1 + i * 0.02), 0.3 * k + 0.1, 0.32 * k, [1, 2.7, 5.2]); N(t + d, 0.05, o, { type: 'lowpass', f: 600, vol: 0.4 * k }); });
      return 0.7;
    },
    murmure(t, o, p) { return whisper(t, o, p, { dur: rnd(1.8, 2.8), vol: 0.9 }); },
    chuchotement(t, o, p) { return whisper(t, o, p, { dur: rnd(0.9, 1.4), vol: 1.2, q: 9 }); },
    ricanement(t, o, p) {
      const n = 5 + ((Math.random() * 3) | 0), f = rnd(260, 380) * p.pitch;
      for (let i = 0; i < n; i++) voiced(t + i * 0.13, o, f * rnd(0.95, 1.1), f * 0.85, 0.1, 'a', { vol: 0.2 * (1 - i / (n + 2)), q: 6, breath: 0.08, a: 0.01 });
      return n * 0.13 + 0.2;
    },
    cri_lointain(t, o, p) {
      voiced(t, o, 540 * p.pitch, 700 * p.pitch, 1.7, 'a', { vol: 0.28, a: 0.25, vib: 6, vibd: 40, breath: 0.1 });
      O('sine', 1100 * p.pitch, t + 0.2, 1.2, o, { f2: 1300, vol: 0.05, a: 0.3 });
      return 2.0;
    },
    griffures(t, o, p) {
      for (let i = 0; i < 3; i++) N(t + i * 0.16, 0.3, o, { type: 'bandpass', f: 4200, f2: 2600, q: 2, vol: 0.28, am: 24, amd: 0.9, a: 0.02 });
      return 0.8;
    },
    cloche(t, o, p) {
      const f = 392 * p.pitch;
      [[1, 1, 3.2], [2.0, 0.55, 2.4], [2.76, 0.5, 1.8], [5.4, 0.22, 1.1], [8.93, 0.1, 0.6]].forEach(r => O('sine', f * r[0], t, r[2] * 1.4, o, { vol: 0.22 * r[1], a: 0.002 }));
      N(t, 0.03, o, { type: 'highpass', f: 2500, vol: 0.2 });
      return 4.5;
    },
    gong(t, o, p) {
      const f = 110 * p.pitch;
      [1, 1.47, 2.09, 2.53, 3.2, 4.1].forEach((r, i) => { O('sine', f * r, t, 6 - i * 0.6, o, { vol: 0.2 / (1 + i * 0.4), a: 0.03 + i * 0.02 }); O('sine', f * r * 1.006, t, 5 - i * 0.5, o, { vol: 0.1 / (1 + i * 0.4), a: 0.05 }); });
      N(t, 1.4, o, { type: 'lowpass', f: 700, vol: 0.15, a: 0.25 });
      return 6.2;
    },
    eboulement(t, o, p) {
      N(t, 2.4, o, { type: 'lowpass', f: 520, f2: 150, vol: 0.55, a: 0.15, color: 'b' }); O('sine', 44, t, 2.2, o, { f2: 30, vol: 0.45, a: 0.2 });
      for (let i = 0; i < 9; i++) { const ti = t + Math.pow(Math.random(), 1.6) * 2; N(ti, rnd(0.03, 0.09), o, { type: 'bandpass', f: rnd(500, 2500), q: 2, vol: rnd(0.15, 0.4) }); }
      return 2.8;
    },
    wagonnet(t, o, p) {
      N(t, 2.6, o, { type: 'lowpass', f: 400, vol: 0.3, a: 0.5, color: 'b' });
      let tt = 0, gap = 0.28;
      for (let i = 0; i < 9; i++) { metalHit(t + tt, o, 700 * p.pitch, 0.1, 0.18, [1, 1.9]); N(t + tt, 0.05, o, { type: 'lowpass', f: 900, vol: 0.3 }); tt += gap; gap *= 0.93; }
      N(t, 2.6, o, { type: 'bandpass', f: 1500, q: 1.2, vol: 0.06, a: 0.6 });
      return 3;
    },
    chaines(t, o, p) {
      const n = 8 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) { const ti = t + Math.random() * 1.1, f = rnd(2000, 4200); O('sine', f, ti, 0.08, o, { vol: rnd(0.04, 0.12) }); O('sine', f * 1.51, ti, 0.05, o, { vol: 0.04 }); N(ti, 0.03, o, { type: 'highpass', f: 4500, vol: rnd(0.08, 0.2) }); }
      N(t, 1.2, o, { type: 'bandpass', f: 900, q: 3, vol: 0.05, a: 0.2 });
      return 1.5;
    },
    goutte(t, o, p) {
      const f = rnd(900, 2100) * p.pitch;
      O('sine', f, t, 0.13, o, { f2: f * 1.5, vol: 0.28, a: 0.003 }); O('sine', f * 1.02, t + 0.17, 0.1, o, { f2: f * 1.5, vol: 0.07, a: 0.003 });
      return 0.4;
    },
    grincement(t, o, p) {
      const d = rnd(0.8, 1.6), f = rnd(110, 180) * p.pitch, b = bp(o, rnd(500, 900), 10);
      O('sawtooth', f, t, d, b, { f2: f * rnd(0.7, 1.5), vol: 0.5, a: d * 0.3 });
      N(t, d, b, { type: 'highpass', f: 2000, vol: 0.05, a: d * 0.4 });
      return d + 0.1;
    },
    souffle(t, o) { N(t, 3.2, o, { type: 'bandpass', f: 250, f2: 900, q: 1.1, vol: 0.4, a: 1.0, color: 'p' }); return 3.4; },
    respiration(t, o) {
      N(t, 1.1, o, { type: 'bandpass', f: 550, f2: 750, q: 1.4, vol: 0.3, a: 0.5, color: 'p' });
      N(t + 1.2, 1.3, o, { type: 'bandpass', f: 700, f2: 380, q: 1.4, vol: 0.25, a: 0.3, color: 'p' });
      return 2.6;
    },
    coeur(t, o) {
      O('sine', 62, t, 0.16, o, { f2: 38, vol: 0.9, a: 0.004 }); N(t, 0.1, o, { type: 'lowpass', f: 140, vol: 0.5 });
      O('sine', 55, t + 0.22, 0.14, o, { f2: 36, vol: 0.6, a: 0.004 }); N(t + 0.22, 0.08, o, { type: 'lowpass', f: 120, vol: 0.3 });
      return 0.5;
    },
    grondement(t, o, p) {
      const d = rnd(2.2, 3.4);
      N(t, d, o, { type: 'lowpass', f: 180 * p.pitch, f2: 70, vol: 0.7, a: d * 0.35, color: 'b' }); O('sine', 40 * p.pitch, t, d, o, { f2: 28, vol: 0.55, a: d * 0.3 });
      return d + 0.2;
    },
    crepitement(t, o) {
      const n = 3 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) N(t + Math.random() * 0.4, rnd(0.004, 0.02), o, { type: 'highpass', f: rnd(1500, 5000), vol: rnd(0.1, 0.4) });
      return 0.5;
    },
    lave_bulle(t, o) {
      const f = rnd(70, 160); O('sine', f, t, 0.22, o, { f2: f * 2.4, vol: 0.4, a: 0.01 }); N(t + 0.2, 0.08, o, { type: 'lowpass', f: 900, vol: 0.25 }); return 0.4;
    },
    // ---- monstres : catégories ----
    monstre_grognement(t, o, p) {
      const f = 75 * p.pitch, d = 0.95;
      const g = ac.createGain(); env(g.gain, t, 0.08, d, 0.55); const am = gain(0.55); g.connect(am); am.connect(o);
      const l = ac.createOscillator(); l.frequency.value = rnd(24, 34); const lg = gain(0.45); l.connect(lg); lg.connect(am.gain); l.start(t); l.stop(t + d + 0.1); track(l);
      const f1 = lpf(g, 900, 1.5), s = ac.createOscillator(); s.type = 'sawtooth';
      s.frequency.setValueAtTime(f * 1.15, t); s.frequency.exponentialRampToValueAtTime(f * 0.75, t + d);
      s.connect(f1); s.start(t); s.stop(t + d + 0.05); track(s);
      N(t, d, o, { type: 'lowpass', f: 500, vol: 0.25, a: 0.06 });
      return d + 0.2;
    },
    monstre_cri(t, o, p) {
      voiced(t, o, 620 * p.pitch, 1100 * p.pitch, 0.8, 'a', { vol: 0.32, a: 0.03, vib: 9, vibd: 50, wave: 'square', q: 4, breath: 0.12 });
      N(t, 0.5, o, { type: 'highpass', f: 4000, vol: 0.1, a: 0.05 }); return 1.0;
    },
    monstre_rale(t, o, p) {
      const d = 1.2;
      voiced(t, o, 95 * p.pitch, 60 * p.pitch, d, 'o', { vol: 0.28, a: 0.15, vib: 4, vibd: 30, q: 3 });
      N(t, d, o, { type: 'bandpass', f: 330, q: 2, vol: 0.28, am: 11, amd: 0.9, a: 0.1 });
      for (let i = 0; i < 4; i++) O('sine', rnd(200, 500), t + rnd(0.1, d - 0.2), 0.05, o, { f2: rnd(500, 900), vol: 0.1 });
      return d + 0.2;
    },
    monstre_insecte(t, o, p) {
      const d = 0.8;
      N(t, d, o, { type: 'highpass', f: 5500 * p.pitch, vol: 0.2, am: rnd(38, 56), amd: 0.95, a: 0.02 });
      O('square', 2400 * p.pitch, t, d, bp(o, 3000, 3), { f2: 1800 * p.pitch, vol: 0.12, a: 0.05 });
      for (let i = 0; i < 6; i++) N(t + i * 0.09 + rnd(0, 0.03), 0.02, o, { type: 'bandpass', f: rnd(2500, 5000), q: 3, vol: 0.18 });
      return d + 0.1;
    },
    monstre_spectre(t, o, p) {
      const d = 2.2, f = rnd(380, 460) * p.pitch;
      [0, 7, -9].forEach((dt, i) => O('sine', f * (1 + i * 0.5), t, d, o, { f2: f * (0.8 + i * 0.4), det: dt, vol: 0.12 / (1 + i * 0.4), a: 0.5 }));
      voiced(t + 0.1, o, f * 2, f * 1.6, d - 0.2, 'o', { vol: 0.07, a: 0.7, vib: 5.5, vibd: 45, wave: 'sine', breath: 0.06 });
      N(t, d, o, { type: 'bandpass', f: 1800, q: 4, vol: 0.08, a: 0.6, am: 6, amd: 0.6 });
      return d + 0.3;
    },
    monstre_metal(t, o, p) {
      metalHit(t, o, 300 * p.pitch, 0.5, 0.4, [1, 2.32, 4.1, 6.2]); metalHit(t + 0.11, o, 410 * p.pitch, 0.3, 0.25);
      N(t + 0.15, 0.4, o, { type: 'bandpass', f: 2100, f2: 1500, q: 5, vol: 0.12, am: 30, amd: 0.9, a: 0.05 });
      return 0.8;
    },
    monstre_eau(t, o, p) {
      const n = 6 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) { const f = rnd(300, 800) * p.pitch; O('sine', f, t + i * 0.1 + rnd(0, 0.04), 0.07, o, { f2: f * 1.6, vol: 0.2, a: 0.005 }); }
      N(t, 1, o, { type: 'bandpass', f: 500, q: 1.2, vol: 0.2, am: 9, amd: 0.7, a: 0.1 }); O('sine', 60 * p.pitch, t, 0.9, o, { vol: 0.2, a: 0.1 });
      return 1.1;
    },
    monstre_boss(t, o, p) {
      const d = 2.2;
      SFX.monstre_grognement(t, o, { pitch: 0.55 * p.pitch });
      O('sine', 42, t, d, o, { f2: 28, vol: 0.7, a: 0.2 }); N(t, d, o, { type: 'lowpass', f: 260, vol: 0.4, a: 0.3, color: 'b' });
      voiced(t + 0.15, o, 180 * p.pitch, 90, 1.6, 'o', { vol: 0.2, a: 0.1, vib: 5, vibd: 30 });
      return d + 0.4;
    },
    sting_apparition(t, o) {
      [0, 1, 6].forEach((s, i) => O('sawtooth', 110 * Math.pow(2, s / 12), t, 1.3, lpf(o, 1400, 1), { vol: 0.2, a: 0.004, det: i * 9 }));
      N(t, 0.5, o, { type: 'bandpass', f: 1800, f2: 600, q: 1, vol: 0.5, a: 0.002 }); O('sine', 48, t, 1.1, o, { f2: 30, vol: 0.6, a: 0.004 });
      return 1.5;
    },
    sting_swell(t, o) {
      [0, 1, 7].forEach((s, i) => O('sawtooth', 82 * Math.pow(2, s / 12), t, 3.2, lpf(o, 500, 2), { vol: 0.1, a: 2.2, det: i * 7 }));
      N(t, 3.2, o, { type: 'bandpass', f: 300, f2: 1200, q: 2, vol: 0.12, a: 2.4 });
      return 3.4;
    },
  };
  const SFX_ALIAS = {
    pas: 'pas_pierre', pas_dalle: 'pas_pierre', pas_roche: 'pas_pierre', pas_plancher: 'pas_bois', pas_flaque: 'pas_eau',
    porte: 'porte_claque', claque: 'porte_claque', porte_claquee: 'porte_claque', chute: 'objet_tombe', objet: 'objet_tombe', objet_chute: 'objet_tombe',
    cri: 'cri_lointain', hurlement: 'cri_lointain', rire: 'ricanement', rit: 'ricanement',
    chaine: 'chaines', griffure: 'griffures', cloches: 'cloche', eboulis: 'eboulement', rocher: 'eboulement', wagon: 'wagonnet', gouttes: 'goutte',
    vent: 'souffle', battement: 'coeur', respire: 'respiration', murmures: 'murmure', chuchote: 'chuchotement', grince: 'grincement', craque: 'craquement',
    crepite: 'crepitement', feu: 'crepitement', bulle: 'lave_bulle', apparition: 'sting_apparition', sursaut: 'sting_apparition', rugissement: 'monstre_boss', grondements: 'grondement', roulement: 'grondement', boss: 'monstre_boss',
    // v5 (QA) : sons de pièges / secrets publiés dans DUNGEON-IDS et joués par events.js via G.Audio.at — sans alias ils restaient muets
    grisou: 'crepitement', racines: 'craquement', os_qui_roulent: 'objet_tombe', lustre_chute: 'objet_tombe', lame_pendule: 'grincement', glyphe: 'gong',
    neon_grille: 'crepitement', faille: 'sting_swell', pages: 'souffle', veine_pulse: 'coeur', geyser_lave: 'lave_bulle', etoile_filante: 'sting_swell',
    orgue_barbarie: 'cloche', mur_fissure: 'craquement', levier: 'grincement', secret_trouve: 'gong',
  };
  const MON_CATS = [
    ['insecte', ['insect', 'arai', 'scarab', 'mouche', 'essaim', 'ver$', 'larve', 'guep', 'cafard', 'fourmi', 'mante', 'scorpion', 'cloporte', 'puce', 'moustique', 'cocon', 'chitin', 'abeille', 'mite', 'termite', 'spider', 'mandib', 'ruche', 'sauterelle', 'grillon', 'tique', 'vermine']],
    ['eau', ['eau', 'noye', 'kraken', 'murloc', 'poisson', 'sirene', 'naga', 'lac$', 'marais', 'boue', 'slime', 'gelee', 'limon', 'vase', 'crabe', 'anguille', 'tentacul', 'hydre', 'leviathan', 'marin', 'piranha', 'meduse', 'sang', 'ichor', 'bave']],
    ['spectre', ['spectr', 'fantom', 'esprit', 'revenant', 'banshee', 'wraith', 'ghost', 'ombre', 'ame$', 'ames$', 'vide$', 'neant', 'eclipse', 'lueur', 'voile', 'ectopl', 'phantom', 'apparit', 'echo$']],
    ['metal', ['squelet', 'os$', 'osse', 'armure', 'golem', 'chevalier', 'automate', 'robot', 'fer$', 'acier', 'metal', 'garde', 'sentinelle', 'gargouille', 'statue', 'cuiras', 'lame', 'epee', 'pantin', 'mecan', 'rouage', 'horloge', 'gladiateur', 'bone', 'skeleton', 'knight', 'armor']],
    ['cri', ['harpie', 'chauve', 'corbeau', 'oiseau', 'aigle', 'imp$', 'diablotin', 'demon', 'succube', 'sorcier', 'mage', 'hurl', 'cri$', 'griffon', 'vautour', 'phenix', 'fee$', 'lutin', 'gobelin', 'sorciere', 'incube', 'chimere', 'wyverne', 'drake', 'dragon']],
    ['rale', ['zombie', 'goule', 'ghoul', 'momie', 'cadavre', 'mort', 'vampire', 'liche', 'necro', 'pestif', 'putr', 'infect', 'malade', 'damne', 'cultiste', 'pretre', 'moine', 'fou$', 'patient', 'asile', 'chair', 'abomination', 'ogre', 'troll']],
  ];
  const SFX_KEYS = [
    ['pas_eau', ['eau', 'flaque', 'splash']], ['pas_bois', ['bois', 'plancher', 'parquet']], ['pas_pierre', ['pas$', 'marche', 'step', 'foot']],
    ['porte_claque', ['porte', 'door', 'claque']], ['murmure', ['murmur', 'whisper', 'voix']], ['chuchotement', ['chuchot']], ['ricanement', ['rican', 'rire', 'rit$', 'laugh']],
    ['cri_lointain', ['cri', 'scream', 'hurl']], ['griffures', ['griff', 'scratch']], ['cloche', ['cloche', 'bell', 'glas']], ['gong', ['gong']], ['chaines', ['chaine', 'chain']],
    ['goutte', ['goutte', 'drip']], ['craquement', ['craq', 'crack']], ['grincement', ['grinc', 'creak']], ['coeur', ['coeur', 'heart']], ['eboulement', ['ebou', 'rock']], ['grondement', ['grond', 'rumble']],
  ];
  function monsterCat(rest) {
    const tk = tokens(rest);
    for (let i = 0; i < MON_CATS.length; i++) if (kw(tk, MON_CATS[i][1])) return MON_CATS[i][0];
    return 'grognement';
  }
  function monsterPitch(rest) {
    const tk = tokens(rest), h = hash(rest);
    let p = 0.82 + (h % 1000) / 1000 * 0.42;
    if (kw(tk, ['petit', 'gobelin', 'imp$', 'rat$', 'larve', 'lutin', 'diablotin', 'essaim', 'chauve'])) p *= 1.25;
    if (kw(tk, ['geant', 'titan', 'ogre', 'golem', 'troll', 'boss', 'dragon', 'colosse', 'behemoth', 'hydre', 'kraken'])) p *= 0.72;
    return clamp(p, 0.4, 1.9);
  }
  /** -> {fn, pitch, key} ou null */
  function resolveSfx(name) {
    const n = norm(name).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!n) return null;
    if (SFX[n]) return { fn: SFX[n], pitch: 1, key: n };
    if (SFX_ALIAS[n]) return { fn: SFX[SFX_ALIAS[n]], pitch: 1, key: SFX_ALIAS[n] };
    if (/^(monstre|monster|mob|enemy|ennemi|voix)(_|$)/.test(n)) {
      const rest = n.replace(/^(monstre|monster|mob|enemy|ennemi|voix)_?/, '');
      if (SFX['monstre_' + rest]) return { fn: SFX['monstre_' + rest], pitch: 1, key: 'monstre_' + rest };
      const cat = monsterCat(rest);
      return { fn: SFX['monstre_' + cat], pitch: monsterPitch(rest), key: 'monstre_' + cat };
    }
    const tk = tokens(n);
    for (let i = 0; i < SFX_KEYS.length; i++) if (kw(tk, SFX_KEYS[i][1])) return { fn: SFX[SFX_KEYS[i][0]], pitch: 1, key: SFX_KEYS[i][0] };
    return null;
  }

  // ------------------------------------------------------------------
  //  Lecture des bruitages : voix limitées, spatialisation
  // ------------------------------------------------------------------
  function activeWeight() {
    const t = ac.currentTime; let w = 0;
    voices = voices.filter(v => v.end > t);
    for (let i = 0; i < voices.length; i++) w += voices[i].w;
    return w;
  }
  function playSfx(name, o) {
    if (!ac || muted || suspended) return false;
    o = o || {};
    const r = resolveSfx(name);
    if (!r) return false;
    const nowMs = performance.now(), k = r.key + (o.keyExtra || '');
    const gap = o.gap != null ? o.gap : (r.key === 'coeur' ? 0 : 45);
    if (lastPlay[k] && nowMs - lastPlay[k] < gap) return false;
    if (!(o.priority > 0) && activeWeight() >= MAXV) return false;
    lastPlay[k] = nowMs; lastPlay[r.key] = nowMs;
    const t = ac.currentTime + 0.01 + fin(o.delay, 0);
    const p = { pitch: fin(o.pitch, 1) * r.pitch * (o.noVar ? 1 : rnd(0.95, 1.05)) };
    const out = buildChain(o, o.bus || busS, gain(o.vol == null ? 1 : fin(o.vol, 1)));
    const before = live; let dur = 1;
    try { dur = r.fn(t, out, p) || 1; } catch (e) { console.warn('[audio] sfx ' + r.key, e); }
    voices.push({ end: t + Math.min(dur, 3), w: Math.max(1, live - before) });
    setTimeout(() => { try { out.disconnect(); if (out._tail) out._tail.disconnect(); if (out._send) out._send.disconnect(); } catch (_) {} }, (dur + 0.6 + fin(o.delay, 0)) * 1000);
    return true;
  }
  function camRight() {
    const cam = safe(() => G.core.camera, null);
    if (cam && cam.matrixWorld && cam.matrixWorld.elements) {
      const e = cam.matrixWorld.elements, x = e[0], z = e[2], l = Math.hypot(x, z);
      if (l > 0.01) return { x: x / l, z: z / l };
    }
    return { x: 1, z: 0 };
  }
  function playerPos() {
    const pl = safe(() => G.SkillAPI && G.SkillAPI.player && G.SkillAPI.player(), null);
    return pl && pl.pos ? pl.pos : null;
  }
  function spatial(x, z) {
    const pp = playerPos();
    if (!pp) return { pan: 0, vol: 0.55, lp: 0, rev: 0.25, d: 8 };
    const dx = x - pp.x, dz = z - pp.z, d = Math.hypot(dx, dz), r = camRight();
    const dot = d > 0.01 ? (dx * r.x + dz * r.z) / d : 0;
    return {
      pan: clamp(dot * clamp(d / 3, 0, 1) * 0.95, -1, 1),
      vol: clamp(1 / (1 + Math.pow(d / 7, 1.4)), 0.04, 1),
      lp: d > 10 ? clamp(16000 / (1 + d / 6), 900, 16000) : 0,
      rev: clamp(0.12 + d / 45, 0.1, 0.7), d,
    };
  }
  A.spatial = spatial;
  A.play = function (name, opts) {
    if (!ac) return false;
    opts = opts || {};
    if (typeof opts.x === 'number' && typeof opts.z === 'number') return A.at(name, opts.x, opts.z, opts);
    return playSfx(name, opts);
  };
  A.at = function (name, x, z, opts) {
    if (x && typeof x === 'object') { opts = z; z = x.z; x = x.x; }
    if (!ac) return false;
    opts = Object.assign({}, opts || {});
    const s = spatial(fin(x, 0), fin(z, 0));
    opts.pan = s.pan; opts.vol = fin(opts.vol, 1) * s.vol; opts.lp = s.lp || opts.lp; opts.rev = Math.max(fin(opts.rev, 0), s.rev);
    if (opts.vol < 0.02) return false;
    return playSfx(name, opts);
  };

  // ------------------------------------------------------------------
  //  INSTRUMENTS (musique)  f, t, dur, vol, dest, set
  // ------------------------------------------------------------------
  const INST = {
    organ(f, t, d, v, dest, set, det) {
      [[1, 1], [2, 0.5], [3, 0.33], [4, 0.2], [6, 0.1]].forEach(([r, a], i) => {
        O('sine', f * r, t, d, dest, { vol: v * a * 0.5, a: Math.min(0.5, d * 0.3), hold: true, rel: 0.6, set, det: det ? rnd(-det, det) : 0 });
        if (det && i < 2) O('sine', f * r, t, d, dest, { vol: v * a * 0.3, a: 0.5, hold: true, rel: 0.6, set, det: rnd(-det, det) + 14 });
      });
    },
    organ_det(f, t, d, v, dest, set) { INST.organ(f * (1 + rnd(-0.012, 0.012)), t, d, v, dest, set, 28); },
    organ_wet(f, t, d, v, dest, set) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 4; fl.frequency.setValueAtTime(420, t);
      fl.frequency.linearRampToValueAtTime(900, t + d * 0.5); fl.frequency.linearRampToValueAtTime(380, t + d); fl.connect(dest);
      INST.organ(f, t, d, v, fl, set, 10);
    },
    harpsi(f, t, d, v, dest, set) {
      const lp = lpf(dest, 3800, 0.8), dd = Math.min(d, 1.3);
      O('sawtooth', f, t, dd, lp, { vol: v * 0.5, a: 0.002, set, det: rnd(-14, 14) }); O('square', f * 2, t, dd * 0.6, lp, { vol: v * 0.22, a: 0.002, set, det: rnd(-18, 18) });
      N(t, 0.012, lp, { type: 'highpass', f: 2500, vol: v * 0.3, set });
    },
    music_box(f, t, d, v, dest, set) {
      O('sine', f, t, Math.min(d, 1.6), dest, { vol: v * 0.5, a: 0.002, set }); O('triangle', f * 3.01, t, 0.5, dest, { vol: v * 0.12, a: 0.002, set });
    },
    bell(f, t, d, v, dest, set) {
      [[1, 1, 1], [2.0, 0.5, 0.7], [2.76, 0.45, 0.55], [5.4, 0.2, 0.3], [8.93, 0.08, 0.15]].forEach(r => O('sine', f * r[0], t, Math.max(1, d * 1.2) * r[2] * 1.6, dest, { vol: v * 0.4 * r[1], a: 0.003, set }));
    },
    choir(f, t, d, v, dest, set, vow) {
      const vw = VOW[vow || pick(['a', 'o', 'u'])], g = ac.createGain();
      env(g.gain, t, Math.min(1, d * 0.4), d, v * 0.5, { hold: true, rel: Math.min(1.2, d * 0.4) });
      const lp = lpf(g, 3000, 0.5), b1 = bp(lp, vw[0], 4), b2 = bp(lp, vw[1], 4), mix = gain(1);
      mix.connect(b1); mix.connect(b2); g.connect(dest);
      [-10, 0, 9].forEach(dt => { const s = ac.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = dt + rnd(-4, 4); const sg = gain(0.3); s.connect(sg); sg.connect(mix); s.start(t); s.stop(t + d + 0.1); track(s, set); });
      N(t, d, dest, { type: 'bandpass', f: vw[1], q: 2, vol: v * 0.05, a: 0.5, set });
    },
    wood(f, t, d, v, dest, set) {
      O('sine', f * 0.985, t, d, dest, { f2: f, vol: v * 0.45, a: 0.12, hold: true, rel: 0.4, set }); O('triangle', f * 2, t, d, dest, { vol: v * 0.05, a: 0.2, set });
      N(t, d, dest, { type: 'bandpass', f: f, q: 14, vol: v * 0.7, a: 0.1, hold: true, rel: 0.4, set });
    },
    brass(f, t, d, v, dest, set) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 1.5; fl.frequency.setValueAtTime(250, t);
      fl.frequency.exponentialRampToValueAtTime(1900, t + Math.min(0.35, d * 0.5)); fl.frequency.exponentialRampToValueAtTime(600, t + d); fl.connect(dest);
      [-7, 7].forEach(dt => O('sawtooth', f, t, d, fl, { vol: v * 0.3, a: Math.min(0.2, d * 0.3), hold: true, rel: 0.3, set, det: dt }));
    },
    strings(f, t, d, v, dest, set) {
      const lp = lpf(dest, 1700, 0.6);
      [-9, 0, 9].forEach(dt => O('sawtooth', f, t, d, lp, { vol: v * 0.18, a: Math.min(0.8, d * 0.4), hold: true, rel: 0.8, set, det: dt }));
    },
    metal(f, t, d, v, dest, set) {
      [1, 2.32, 4.25, 6.63].forEach((r, i) => O('sine', f * r, t, Math.min(d, 0.9) / (1 + i * 0.6), dest, { vol: v * 0.4 / (1 + i * 0.7), a: 0.002, set }));
      N(t, 0.02, dest, { type: 'highpass', f: 3000, vol: v * 0.3, set });
    },
    drip(f, t, d, v, dest, set) { O('sine', f, t, 0.15, dest, { f2: f * 1.4, vol: v * 0.5, a: 0.003, set }); },
    sub(f, t, d, v, dest, set) { O('sine', f, t, d, dest, { vol: v * 0.7, a: 0.1, hold: true, rel: 0.5, set }); },
    bass(f, t, d, v, dest, set) {
      const lp = lpf(dest, 520, 2); O('sawtooth', f, t, Math.min(d, 0.3), lp, { vol: v * 0.55, a: 0.005, set }); O('sine', f, t, Math.min(d, 0.3), dest, { vol: v * 0.4, a: 0.005, set });
    },
    pad(f, t, d, v, dest, set) {
      [-6, 6].forEach(dt => O('triangle', f, t, d, dest, { vol: v * 0.25, a: Math.min(1, d * 0.4), hold: true, rel: 0.8, set, det: dt }));
    },
  };
  function drum(kit, voice, t, vel, dest, set) {
    const v = vel;
    if (kit === 'taiko') {
      if (voice === 'k') { O('sine', 105, t, 0.55, dest, { f2: 42, vol: 0.9 * v, a: 0.003, set }); N(t, 0.1, dest, { type: 'lowpass', f: 700, vol: 0.4 * v, set }); }
      else if (voice === 't') O('sine', 150, t, 0.35, dest, { f2: 75, vol: 0.55 * v, a: 0.003, set });
      else if (voice === 's') N(t, 0.1, dest, { type: 'bandpass', f: 1800, q: 1, vol: 0.28 * v, set });
      else O('triangle', 1250, t, 0.03, dest, { vol: 0.12 * v, a: 0.001, set });
    } else if (kit === 'metal') {
      if (voice === 'k') { O('sine', 75, t, 0.3, dest, { f2: 40, vol: 0.8 * v, a: 0.003, set }); metalHit(t, dest, 190, 0.3, 0.2 * v); }
      else if (voice === 't') metalHit(t, dest, 330, 0.35, 0.3 * v, [1, 2.76, 5.4]);
      else if (voice === 's') { metalHit(t, dest, 520, 0.25, 0.3 * v, [1, 2.32, 4.25]); N(t, 0.15, dest, { type: 'highpass', f: 3500, vol: 0.2 * v, set }); }
      else N(t, 0.025, dest, { type: 'highpass', f: 6000, vol: 0.15 * v, set });
    } else if (kit === 'deep') {
      if (voice === 'k') { O('sine', 58, t, 0.9, dest, { f2: 28, vol: 1.0 * v, a: 0.004, set }); N(t, 0.25, dest, { type: 'lowpass', f: 180, vol: 0.5 * v, set }); }
      else if (voice === 't') O('sine', 90, t, 0.5, dest, { f2: 45, vol: 0.6 * v, a: 0.003, set });
      else if (voice === 's') N(t, 0.25, dest, { type: 'lowpass', f: 900, f2: 300, vol: 0.4 * v, set });
      else N(t, 0.03, dest, { type: 'bandpass', f: 4000, q: 2, vol: 0.08 * v, set });
    } else {   // bone
      if (voice === 'k') { O('sine', 170, t, 0.18, dest, { f2: 80, vol: 0.7 * v, a: 0.002, set }); O('triangle', 340, t, 0.08, dest, { vol: 0.2 * v, set }); }
      else if (voice === 't') O('triangle', 700, t, 0.07, dest, { f2: 420, vol: 0.4 * v, a: 0.001, set });
      else if (voice === 's') { N(t, 0.02, dest, { type: 'bandpass', f: 3000, q: 2, vol: 0.4 * v, set }); N(t + 0.04, 0.02, dest, { type: 'bandpass', f: 3500, q: 2, vol: 0.3 * v, set }); }
      else N(t, 0.015, dest, { type: 'highpass', f: 5000, vol: 0.12 * v, set });
    }
  }

  // ------------------------------------------------------------------
  //  STYLES MUSICAUX
  // ------------------------------------------------------------------
  const SC = {
    phr: [0, 1, 3, 5, 7, 8, 10], aeo: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], loc: [0, 1, 3, 5, 6, 8, 10],
    dor: [0, 2, 3, 5, 7, 9, 10], dbl: [0, 1, 4, 5, 7, 8, 11], hun: [0, 2, 3, 6, 7, 8, 11],
  };
  const STYLES = {
    menu: { calm: true, root: 45, scale: SC.aeo, bpm: 62, rev: 'cathedrale', wet: 0.7, prog: [0, 5, 3, 4], chord: [0, 2, 4], pad: 'strings', padVol: 0.2, drone: 'choir', droneVol: 0.16,
      arp: { inst: 'music_box', vol: 0.17, pat: 'x.x.x.x.x.x.x.x.' }, lead: 'wood', leadProb: 0.07, leadVol: 0.22, hits: { kit: 'taiko', pat: 'x...............', vel: 0.45, every: 2 } },
    camp: { calm: true, root: 50, scale: SC.dor, bpm: 54, rev: 'foret', wet: 0.5, prog: [0, 3, 0, 4], chord: [0, 2, 4], pad: 'pad', padVol: 0.2, drone: null,
      arp: { inst: 'music_box', vol: 0.1, pat: 'x...x...x.x.....' }, lead: 'wood', leadProb: 0.1, leadVol: 0.2, leadOct: 1 },
    chateau: { root: 40, scale: SC.phr, bpm: 58, rev: 'pierre', wet: 0.7, prog: [0, 0, 5, 4, 0, 3, 5, 1], chord: [0, 4], pad: 'organ_det', padVol: 0.3, drone: 'organ_det', droneVol: 0.22,
      lead: 'harpsi', leadProb: 0.3, leadVol: 0.3, leadOct: 1, acc: { inst: 'bell', p: 0.2, vol: 0.2 }, hits: { kit: 'bone', pat: 'x.......x.......', vel: 0.55 }, combatBass: 'x.x.x.xxx.x.x.x.',
      tens: 'strings', stab: 'organ_det', kit: 'bone' },
    foret: { root: 38, scale: SC.aeo, bpm: 50, rev: 'foret', wet: 0.6, prog: [0, 5, 3, 0, 0, 6, 5, 4], chord: [0, 4], pad: 'pad', padVol: 0.22, drone: 'sub', droneVol: 0.3,
      lead: 'wood', leadProb: 0.2, leadVol: 0.35, leadOct: 1, acc: { inst: 'wood', p: 0.18, vol: 0.18 }, hits: { kit: 'bone', pat: 'x...............', vel: 0.4 }, combatBass: 'x..x..x.x..x..x.',
      tens: 'strings', stab: 'brass', kit: 'bone' },
    catacombes: { root: 36, scale: SC.phr, bpm: 48, rev: 'caverne', wet: 0.8, prog: [0, 1, 0, 6, 0, 5, 1, 0], chord: [0, 4], pad: 'choir', padVol: 0.3, drone: 'choir', droneVol: 0.2,
      lead: 'bell', leadProb: 0.16, leadVol: 0.3, leadOct: 1, acc: { inst: 'bell', p: 0.35, vol: 0.22 }, hits: { kit: 'deep', pat: 'x...............', vel: 0.5 }, combatBass: 'x...x...x.x.x...',
      tens: 'strings', stab: 'choir', kit: 'deep' },
    temple: { root: 40, scale: SC.harm, bpm: 84, rev: 'pierre', wet: 0.55, prog: [0, 0, 1, 0, 0, 5, 4, 0], chord: [0, 4], pad: 'strings', padVol: 0.16, drone: 'sub', droneVol: 0.3,
      lead: 'metal', leadProb: 0.14, leadVol: 0.2, leadOct: 1, acc: { inst: 'metal', p: 0.25, vol: 0.18 }, baseDrums: { kit: 'taiko', k: 'x.......x.......', t: '........x...x.x.', vel: 0.55 },
      hits: { kit: 'taiko', pat: 'x.......x...x...', vel: 0.8 }, combatBass: 'x.xx.x.xx.xx.x.x', tens: 'brass', stab: 'brass', kit: 'taiko' },
    abime: { root: 31, scale: SC.phr, bpm: 40, rev: 'caverne', wet: 0.8, prog: [0, 0, 1, 0, 0, 5, 1, 0], chord: [0, 4], pad: 'brass', padVol: 0.2, drone: 'sub', droneVol: 0.5,
      lead: 'brass', leadProb: 0.07, leadVol: 0.28, leadOct: 0, acc: { inst: 'metal', p: 0.1, vol: 0.2 }, hits: { kit: 'deep', pat: 'x...............', vel: 0.6 }, combatBass: 'x..xx..xx.x..x..',
      tens: 'brass', stab: 'brass', kit: 'deep' },
    mine: { root: 42, scale: SC.aeo, bpm: 56, rev: 'caverne', wet: 0.7, prog: [0, 0, 6, 5, 0, 3, 4, 0], chord: [0, 4], pad: 'strings', padVol: 0.14, drone: 'sub', droneVol: 0.28,
      lead: 'metal', leadProb: 0.12, leadVol: 0.24, leadOct: 1, acc: { inst: 'drip', p: 0.9, vol: 0.28, hi: 2.5 }, hits: { kit: 'metal', pat: 'x.......x.......', vel: 0.5 }, combatBass: 'x.x.x.x.x.x.xx.x',
      tens: 'strings', stab: 'metal', kit: 'metal' },
    cathedrale: { root: 38, scale: SC.dor, bpm: 46, rev: 'cathedrale', wet: 0.9, prog: [0, 3, 5, 4, 0, 6, 5, 3], chord: [0, 2, 4], pad: 'organ_wet', padVol: 0.34, drone: 'organ_wet', droneVol: 0.28,
      lead: 'bell', leadProb: 0.12, leadVol: 0.24, leadOct: 1, acc: { inst: 'drip', p: 0.6, vol: 0.2, hi: 1.5 }, hits: { kit: 'deep', pat: 'x...............', vel: 0.45 }, combatBass: 'x...x...x..xx...',
      tens: 'organ_wet', stab: 'organ_wet', kit: 'deep' },
    glace: { root: 52, scale: SC.aeo, bpm: 52, rev: 'cathedrale', wet: 0.85, prog: [0, 5, 2, 4], chord: [0, 2, 4], pad: 'choir', padVol: 0.22, drone: 'organ', droneVol: 0.14,
      lead: 'bell', leadProb: 0.2, leadVol: 0.24, leadOct: 1, acc: { inst: 'music_box', p: 0.3, vol: 0.18 }, hits: { kit: 'deep', pat: 'x...............', vel: 0.45 }, combatBass: 'x...x...x.x.x...',
      tens: 'strings', stab: 'choir', kit: 'deep' },
    asile: { root: 47, scale: SC.loc, bpm: 66, rev: 'pierre', wet: 0.6, prog: [0, 1, 0, 6], chord: [0, 4], pad: 'organ_det', padVol: 0.18, drone: 'sub', droneVol: 0.2,
      lead: 'music_box', leadProb: 0.3, leadVol: 0.26, leadOct: 1, acc: { inst: 'metal', p: 0.2, vol: 0.16 }, hits: { kit: 'bone', pat: 'x.......x.......', vel: 0.5 }, combatBass: 'x.x.x.x.xx.x.x.x',
      tens: 'strings', stab: 'metal', kit: 'bone' },
    dungeon_default: { root: 38, scale: SC.phr, bpm: 56, rev: 'caverne', wet: 0.7, prog: [0, 0, 5, 4, 0, 6, 5, 1], chord: [0, 4], pad: 'strings', padVol: 0.2, drone: 'sub', droneVol: 0.3,
      lead: 'bell', leadProb: 0.12, leadVol: 0.26, leadOct: 1, acc: { inst: 'drip', p: 0.3, vol: 0.2, hi: 2 }, hits: { kit: 'deep', pat: 'x...............', vel: 0.5 }, combatBass: 'x.x.x.xxx.x.x.x.',
      tens: 'strings', stab: 'brass', kit: 'deep' },
  };
  // v5 (QA) : une musique propre par donjon (bibliothèque, nécropole, jardin, observatoire et foire retombaient sur le style d'un autre donjon)
  Object.assign(STYLES, {
    bibliotheque: Object.assign({}, STYLES.cathedrale, { root: 41, scale: SC.aeo, bpm: 44, rev: 'pierre', pad: 'strings', drone: 'organ', lead: 'harpsi', leadProb: 0.16, acc: { inst: 'music_box', p: 0.25, vol: 0.16 }, kit: 'bone' }),
    jardin: Object.assign({}, STYLES.foret, { root: 35, scale: SC.dbl, bpm: 62, rev: 'caverne', pad: 'choir', drone: 'sub', lead: 'wood', leadProb: 0.12, acc: { inst: 'drip', p: 0.5, vol: 0.22, hi: 1.2 }, hits: { kit: 'deep', pat: 'x..x............', vel: 0.55 } }),
    observatoire: Object.assign({}, STYLES.glace, { root: 33, scale: SC.hun, bpm: 38, rev: 'cathedrale', wet: 0.95, pad: 'pad', drone: 'sub', droneVol: 0.4, lead: 'bell', leadProb: 0.1, acc: { inst: 'music_box', p: 0.12, vol: 0.14 }, kit: 'deep' }),
    foire: Object.assign({}, STYLES.asile, { root: 45, scale: SC.harm, bpm: 72, rev: 'pierre', pad: 'organ_det', lead: 'music_box', leadProb: 0.4, acc: { inst: 'bell', p: 0.2, vol: 0.16 }, hits: { kit: 'bone', pat: 'x...x...x...x...', vel: 0.4 } }),
  });
  const STYLE_KEYS = [
    ['bibliotheque', ['bibliotheque', 'biblio', 'grimoire']], ['glace', ['necropole']], ['jardin', ['jardin', 'serre']],
    ['observatoire', ['observatoire', 'astre', 'etoile']], ['foire', ['foire', 'pantin', 'cirque', 'fete$']],
    ['menu', ['menu', 'titre', 'title']], ['camp', ['camp$', 'hub', 'repos', 'refuge']],
    ['cathedrale', ['cathedral', 'noye', 'engloutie', 'bibliotheque', 'eglise', 'chapelle', 'monastere', 'abbaye', 'submerg', 'inonde', 'sanctuaire']],
    ['glace', ['glace', 'givre', 'neige', 'gel$', 'froid', 'hiver', 'nordique', 'polaire', 'blizzard']],
    ['asile', ['hopital', 'asile', 'faille', 'clinique', 'sanatorium', 'psychi']],
    ['temple', ['temple', 'sang', 'rituel', 'sacrifice', 'autel', 'pyramide', 'desert', 'tombeau', 'sanglant', 'sacre']],
    ['abime', ['abime', 'abysse', 'enfer', 'infern', 'volcan', 'lave', 'magma', 'demon', 'brasier', 'forge', 'vide$', 'neant', 'observatoire', 'feu$', 'cendre']],
    ['mine', ['mine', 'carriere', 'tunnel', 'galerie', 'grotte', 'cristal', 'nain', 'caverne', 'minier', 'filon']],
    ['catacombes', ['catacomb', 'crypte', 'ossuaire', 'tombe', 'necropole', 'cimetiere', 'souterrain', 'sepulcre', 'ossement', 'charnier']],
    ['foret', ['foret', 'bois$', 'sylv', 'jardin', 'marais', 'arbre', 'forest', 'chair', 'racine', 'ronce', 'verger', 'clairiere', 'terrier']],
    ['chateau', ['chateau', 'manoir', 'hant', 'maudit', 'forteresse', 'donjon', 'citadelle', 'palais', 'tour$', 'cour$', 'royaume']],
  ];
  function styleKey(id) {
    const tk = tokens(id);
    for (let i = 0; i < STYLE_KEYS.length; i++) if (kw(tk, STYLE_KEYS[i][1])) return STYLE_KEYS[i][0];
    return 'dungeon_default';
  }
  const bossCache = {};
  /** Style de boss paramétré par l'identifiant (chaque boss sonne différemment) */
  function bossStyle(id) {
    if (bossCache[id]) return bossCache[id];
    const h = hash(id), r = mulberry(h), tk = tokens(id);
    const scales = [SC.phr, SC.harm, SC.loc, SC.dbl, SC.hun, SC.aeo];
    const kits = ['taiko', 'metal', 'deep', 'bone'], leads = ['brass', 'choir', 'metal', 'strings'], pads = ['brass', 'organ', 'choir', 'strings'], revs = ['caverne', 'pierre', 'cathedrale'];
    const pat = dens => { let s = ''; for (let i = 0; i < 16; i++) s += (i % 8 === 0 || r() < dens) ? 'x' : '.'; return s; };
    const st = {
      boss: true, id, root: 31 + (h % 12), scale: scales[(h >>> 4) % scales.length], bpm: 94 + ((h >>> 8) % 50), rev: revs[(h >>> 12) % revs.length], wet: 0.6,
      prog: [0, 0, 1 + ((h >>> 3) % 2) * 4, 0, 0, 5, 4 - ((h >>> 5) % 2) * 3, 1], chord: [0, 4], pad: pads[(h >>> 14) % 4], padVol: 0.24, drone: 'sub', droneVol: 0.4,
      lead: leads[(h >>> 16) % 4], leadProb: 0.3, leadVol: 0.3, leadOct: 1, kit: kits[(h >>> 18) % 4], tens: 'strings', stab: 'brass',
      combatBass: pat(0.5), kPat: pat(0.28), tPat: pat(0.3), riff: [], acc: { inst: 'metal', p: 0.2, vol: 0.2 },
    };
    for (let i = 0; i < 8; i++) st.riff.push(r() < 0.25 ? null : ((r() * 6) | 0));
    if (kw(tk, ['roi', 'liche', 'necro', 'reine', 'archi', 'pretre', 'grand'])) { st.pad = 'organ'; st.lead = 'choir'; }
    if (kw(tk, ['dragon', 'demon', 'infern', 'seigneur', 'titan', 'colosse'])) { st.lead = 'brass'; st.kit = 'taiko'; st.scale = SC.phr; }
    if (kw(tk, ['golem', 'automate', 'rouage', 'horloge', 'forge'])) { st.kit = 'metal'; st.lead = 'metal'; }
    if (kw(tk, ['araign', 'insect', 'ruche', 'essaim'])) { st.bpm += 14; st.kit = 'bone'; }
    if (kw(tk, ['spectr', 'fantom', 'ombre', 'ame$', 'revenant', 'banshee'])) { st.lead = 'choir'; st.pad = 'choir'; st.rev = 'cathedrale'; }
    if (kw(tk, ['kraken', 'eau', 'noye', 'leviathan', 'maree', 'hydre'])) { st.pad = 'organ_wet'; st.rev = 'caverne'; st.lead = 'bell'; }
    return (bossCache[id] = st);
  }
  function resolveStyle(id) {
    const n = norm(id).replace(/[^a-z0-9_]+/g, '_');
    if (n && STYLES[n]) return { key: n, def: STYLES[n] };
    if (/^boss/.test(n) || /(^|_)boss(_|$)/.test(n)) return { key: 'boss:' + n, def: bossStyle(n) };
    const k = styleKey(n);
    return { key: k, def: STYLES[k] };
  }
  A.resolveStyle = id => resolveStyle(id).key;

  // ------------------------------------------------------------------
  //  SÉQUENCEUR
  // ------------------------------------------------------------------
  function degNote(st, deg) {
    const L = st.scale.length, o = Math.floor(deg / L), i = ((deg % L) + L) % L;
    return st.root + st.scale[i] + 12 * o;
  }
  function startMusic(id, fade) {
    const rs = resolveStyle(id), st = rs.def;
    const out = ac.createGain(); out.gain.value = 0.0001;
    const wet = gain(st.wet == null ? 0.6 : st.wet);
    out.connect(busM.in); out.connect(wet); wet.connect(busM.wetIn);
    const L = {};
    ['base', 'tens', 'combat', 'boss'].forEach(k => { L[k] = gain(k === 'base' ? 1 : 0); L[k].connect(out); });
    const inst = { id, key: rs.key, st, out, wet, L, srcs: new Set(), step: 0, nextT: ac.currentTime + 0.12, rng: mulberry(hash(id) ^ 0x9e3779b9), tempoMul: 1, dead: false, tgt: { tens: 0, combat: 0, boss: 0 } };
    const t = ac.currentTime, f = Math.max(0.05, fin(fade, 2.5));
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + f);
    setReverb(st.rev);
    if (st.boss) inst.minX = { tens: 0.9, combat: 0.9, boss: 0.95 };
    return inst;
  }
  function freeMusic(m) {
    m.srcs.forEach(s => { try { s.stop(); } catch (_) {} });
    try { m.out.disconnect(); m.wet.disconnect(); } catch (_) {}
    olds = olds.filter(x => x !== m);
  }
  function killMusic(m, fade) {
    if (!m || m.dead) return;
    m.dead = true;
    const t = ac.currentTime, f = Math.max(0.05, fin(fade, 2));
    m.out.gain.cancelScheduledValues(t); m.out.gain.setValueAtTime(Math.max(0.0001, m.out.gain.value), t); m.out.gain.linearRampToValueAtTime(0.0001, t + f);
    olds.push(m);
    setTimeout(() => freeMusic(m), (f + 0.4) * 1000);
    while (olds.length > 3) freeMusic(olds[0]);
  }
  const on = (s, i) => s.charAt(i & 15) === 'x';
  function scheduleStep(m, i, t, sd) {
    const st = m.st, p = i & 15, bar = i >> 4, set = m.srcs, r = m.rng;
    const gB = m.L.base, gT = m.L.tens, gC = m.L.combat, gX = m.L.boss;
    const lvT = m.tgt.tens, lvC = m.tgt.combat, lvX = m.tgt.boss;
    const deg = st.prog[bar % st.prog.length], barDur = sd * 16, beat = sd * 4;
    // ---- BASE : nappes, drone, arpège, mélodie, accents, percussions rituelles ----
    if (p === 0) {
      (st.chord || [0, 4]).forEach((c, k) => INST[st.pad](mtof(degNote(st, deg + c) + (k ? 12 : 0)), t, barDur * 1.05, st.padVol || 0.2, gB, set));
      if (st.drone && bar % 2 === 0) INST[st.drone](mtof(degNote(st, deg) - 12), t, barDur * 2.1, st.droneVol || 0.25, gB, set);
    }
    if (st.arp && on(st.arp.pat, p)) {
      const ch = st.chord || [0, 2, 4];
      INST[st.arp.inst](mtof(degNote(st, deg + ch[(i >> 1) % ch.length]) + 12 + ((p & 4) ? 12 : 0)), t, beat, st.arp.vol, gB, set);
    }
    if (st.lead && (p & 1) === 0 && r() < (st.leadProb || 0.1) / (st.boss ? 3 : 1)) {
      INST[st.lead](mtof(degNote(st, deg + [0, 1, 2, 3, 4, 2, 5][(r() * 7) | 0]) + 12 * (st.leadOct || 0)), t, sd * (2 + ((r() * 4) | 0)), st.leadVol || 0.25, gB, set);
    }
    if (st.acc && p === ((bar * 5 + 3) & 15) && r() < st.acc.p) INST[st.acc.inst](mtof(degNote(st, deg + ((r() * 5) | 0)) + 12 * (st.acc.hi || 1)), t + rnd(0, sd), beat * 2, st.acc.vol, gB, set);
    if (st.acc && st.acc.inst === 'drip' && r() < 0.05) INST.drip(rnd(1200, 2400), t, 0.2, st.acc.vol * 0.6, gB, set);
    if (st.baseDrums) {
      const bd = st.baseDrums;
      if (on(bd.k, p)) drum(bd.kit, 'k', t, bd.vel, gB, set);
      if (bd.t && on(bd.t, p)) drum(bd.kit, 't', t, bd.vel * 0.8, gB, set);
    }
    if (st.hits && (!st.hits.every || bar % st.hits.every === 0) && on(st.hits.pat, p) && (st.calm || (lvC < 0.05 && !st.boss))) drum(st.hits.kit, 'k', t, st.hits.vel * (st.calm ? 1 : 0.7), gB, set);
    // ---- TENSION : pulsation lub-dub, dissonance, cordes ----
    if (lvT > 0.03) {
      if (p === 0 || p === 6 || p === 8 || p === 14) O('sine', 55, t, 0.2, gT, { f2: 35, vol: (p === 0 || p === 8) ? 0.55 : 0.35, a: 0.004, set });
      if (p === 0 && bar % 2 === 0) {
        INST[st.tens || 'strings'](mtof(degNote(st, deg + 1) + 12), t, barDur * 2, 0.16, gT, set);
        INST[st.tens || 'strings'](mtof(degNote(st, deg) + 18), t + beat, barDur * 2 - beat, 0.1, gT, set);
      }
      if ((st.boss || st.tens === 'brass') && p === 0 && bar % 4 === 3) N(t, barDur, gT, { type: 'bandpass', f: 300, f2: 2400, q: 2, vol: 0.12, a: barDur * 0.9, set });
    }
    // ---- COMBAT : percussions + basse ostinato ----
    if (lvC > 0.03) {
      const kp = st.kPat || 'x.....x.x.......', tp = st.tPat || '..x...x...x...x.', bpat = st.combatBass || 'x.x.x.x.x.x.x.x.';
      if (on(kp, p)) drum(st.kit, 'k', t, 0.95, gC, set);
      if (p === 4 || p === 12) drum(st.kit, 's', t, 0.8, gC, set);
      else if (on(tp, p) && !on(kp, p)) drum(st.kit, 't', t, 0.6, gC, set);
      if ((p & 1) === 0) drum(st.kit, 'h', t, 0.6, gC, set);
      if (on(bpat, p)) INST.bass(mtof(degNote(st, deg) - 12 + (p === 14 ? 7 : 0)), t, sd * 1.6, 0.3, gC, set);
      if (p === 0 || (p === 10 && bar % 2)) INST[st.stab || 'brass'](mtof(degNote(st, deg) + 12), t, beat * 1.2, 0.2, gC, set);
    }
    // ---- BOSS : riff, nappe de cuivres/chœur ----
    if (lvX > 0.03) {
      if (p === 0 || p === 8) INST[st.pad === 'organ' ? 'organ' : 'brass'](mtof(degNote(st, deg)), t, beat * 3, 0.26, gX, set);
      if (p === 0 && bar % 2 === 0) INST.choir(mtof(degNote(st, deg + 4) + 12), t, barDur * 2, 0.22, gX, set, 'a');
      const rf = st.riff || [0, null, 2, null, 4, 3, null, 1];
      if ((p & 1) === 0) { const k = rf[(p >> 1) & 7]; if (k != null) INST[st.lead === 'choir' ? 'brass' : st.lead](mtof(degNote(st, deg + k) + 12), t, sd * 1.8, 0.22, gX, set); }
      if (p % 4 === 2) drum(st.kit, 't', t, 0.45, gX, set);
      if (bar % 4 === 3 && p >= 12) drum(st.kit, 's', t, 0.7, gX, set);
    }
  }
  function pump(until) {
    const m = cur;
    if (!m || m.dead) return;
    let guard = 0;
    while (m.nextT < until && guard++ < 64) {
      const sd = 60 / (m.st.bpm * m.tempoMul) / 4;
      try { scheduleStep(m, m.step, m.nextT, sd); } catch (e) { console.warn('[audio] seq', e); }
      m.step++; m.nextT += sd;
    }
  }
  A._pump = pump;

  A.music = function (id, opts) {
    opts = opts || {};
    if (id == null || id === false || id === 'none' || id === 'silence') {
      wanted.music = null;
      if (ac && cur) { killMusic(cur, fin(opts.fade, 2)); cur = null; }
      return false;
    }
    if (!ac) { wanted.music = id; wanted.mopts = opts; return false; }
    const key = resolveStyle(id).key;
    if (cur && !cur.dead && cur.key === key && !opts.restart) { cur.id = id; return true; }
    const fade = fin(opts.fade, 2.5);
    if (cur) killMusic(cur, Math.min(fade, 3));
    cur = startMusic(id, fade);
    updateLayers(true);
    if (!injected) pump(ac.currentTime + 0.4);
    return true;
  };
  A.currentMusic = () => (cur && !cur.dead ? { id: cur.id, key: cur.key } : null);
  /** 0 = exploration, ~0.4 = tension, ~0.7 = combat, 1 = boss */
  A.intensity = function (x) {
    if (x === undefined) return effX;
    manualX = clamp(fin(x, 0), 0, 1);
    updateLayers();
    return manualX;
  };
  const sstep = (x, a, b) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  function updateLayers(immediate) {
    effX = Math.max(manualX, autoX);
    const m = cur;
    if (!m || m.dead || !ac) return;
    const x = effX;
    let tg = { tens: Math.max(sstep(x, 0.12, 0.45), sstep(tensionV, 0.3, 0.8) * 0.9), combat: sstep(x, 0.45, 0.75), boss: sstep(x, 0.8, 0.98) };
    if (m.st.calm) tg = { tens: 0, combat: 0, boss: 0 };
    if (m.minX) for (const k in m.minX) tg[k] = Math.max(tg[k], m.minX[k]);
    m.tgt = tg;
    const t = ac.currentTime;
    ['tens', 'combat', 'boss'].forEach(k => { const g = m.L[k].gain; g.cancelScheduledValues(t); if (immediate) g.setValueAtTime(tg[k], t); else g.setTargetAtTime(tg[k], t, 0.7); });
  }

  // ------------------------------------------------------------------
  //  STINGERS
  // ------------------------------------------------------------------
  const STING = {
    victoire(t, o) {
      const R = 293.66;
      [[0, 0, 1.6], [7, 0.18, 1.4], [12, 0.36, 1.3], [16, 0.54, 1.2], [19, 0.72, 2.6]].forEach(n => INST.brass(R * Math.pow(2, n[0] / 12), t + n[1], n[2], 0.3, o, null));
      [0, 7, 12, 16].forEach(s => INST.strings(R * Math.pow(2, s / 12 - 1), t + 0.7, 3.4, 0.3, o, null));
      INST.bell(R * 4, t + 0.75, 3, 0.3, o, null); drum('taiko', 'k', t, 0.9, o); drum('taiko', 'k', t + 0.72, 0.9, o);
      return 5;
    },
    defaite(t, o) {
      [[0, 0], [-1, 2.3]].forEach(([s, d]) => INST.bell(98 * Math.pow(2, s / 12), t + d, 3.5, 0.6, o, null));
      [0, 3, 7].forEach(s => INST.organ(104 * Math.pow(2, s / 12), t + 0.2, 4.5, 0.3, o, null, 12));
      [0, 3, 6].forEach(s => INST.organ(98 * Math.pow(2, s / 12), t + 2.4, 3.5, 0.28, o, null, 14));
      N(t, 5, o, { type: 'lowpass', f: 160, vol: 0.3, a: 1.5, color: 'b' }); O('sine', 46, t, 5, o, { f2: 32, vol: 0.5, a: 0.4 });
      return 7;
    },
    promotion(t, o) {
      const R = 392;
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => { INST.brass(R * Math.pow(2, s / 12 - 1), t + i * 0.12, 1.2, 0.24, o, null); INST.bell(R * Math.pow(2, s / 12), t + i * 0.12 + 0.05, 2.5, 0.2, o, null); });
      [0, 4, 7, 12].forEach(s => INST.strings(R * Math.pow(2, s / 12 - 1), t + 0.9, 3, 0.26, o, null));
      drum('taiko', 'k', t, 0.8, o); drum('taiko', 'k', t + 0.84, 0.9, o);
      return 5;
    },
    secret(t, o) {
      [0, 4, 7, 11, 14, 19, 23].forEach((s, i) => INST.music_box(659 * Math.pow(2, s / 12 - 1), t + i * 0.09, 1.2, 0.3, o, null));
      O('sine', 1318, t + 0.1, 2.2, o, { f2: 2637, vol: 0.06, a: 0.6 }); N(t, 1.8, o, { type: 'highpass', f: 6000, vol: 0.05, a: 0.6 });
      return 3;
    },
    boss(t, o) {
      INST.brass(55, t, 2.2, 0.5, o, null); INST.brass(82.5, t + 0.05, 2, 0.35, o, null); drum('deep', 'k', t, 1, o); drum('taiko', 'k', t + 0.4, 0.9, o);
      N(t, 1.2, o, { type: 'bandpass', f: 200, f2: 3000, q: 1.5, vol: 0.2, a: 1.0 }); return 3;
    },
    phase(t, o) {
      INST.brass(61.7, t, 1.5, 0.45, o, null); drum('deep', 'k', t, 1, o); metalHit(t, o, 160, 1.4, 0.3); N(t, 0.9, o, { type: 'bandpass', f: 400, f2: 2500, q: 1.5, vol: 0.16, a: 0.7 }); return 2;
    },
  };
  const STING_ALIAS = { victory: 'victoire', defeat: 'defaite', rank: 'promotion', decouverte: 'secret', boss_intro: 'boss', boss_phase: 'phase' };
  A.stinger = function (name, opts) {
    if (!ac || muted || suspended) return false;
    const n = norm(name), k = STING[n] ? n : STING_ALIAS[n];
    if (!k) return false;
    opts = opts || {};
    const out = gain(fin(opts.vol, 1)), w = gain(0.5);
    out.connect(busT.in); out.connect(w); w.connect(busT.wetIn);
    let d = 4;
    try { d = STING[k](ac.currentTime + 0.03, out) || 4; } catch (e) { console.warn('[audio] stinger', e); }
    if (opts.duck !== false) A.duck(0.25, Math.min(d, 5) * 800, { quick: true });
    setTimeout(() => { try { out.disconnect(); w.disconnect(); } catch (_) {} }, (d + 1) * 1000);
    return true;
  };

  // ------------------------------------------------------------------
  //  AMBIANCES : lits continus + événements aléatoires
  // ------------------------------------------------------------------
  function loop(buf, set) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); track(s, set); return s;
  }
  function lfo(freq, depth, target, set) {
    const l = ac.createOscillator(); l.frequency.value = freq; const g = gain(depth); l.connect(g); g.connect(target); l.start(); track(l, set); return l;
  }
  /** source de bruit -> filtre -> gain -> out ; renvoie {f, g} pour moduler */
  function bedNoise(buf, type, freq, q, vol, out, set) {
    const s = loop(buf, set), f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = gain(vol); s.connect(f); f.connect(g); g.connect(out); return { f, g };
  }
  const BEDS = {
    wind(out, v, set) {
      const a = bedNoise(noiseP, 'bandpass', 420, 0.9, v * 1.6, out, set); lfo(0.07, 260, a.f.frequency, set); lfo(0.13, v * 0.7, a.g.gain, set);
      const b = bedNoise(noiseP, 'bandpass', 900, 3, v * 0.5, out, set); lfo(0.09, 400, b.f.frequency, set); lfo(0.05, v * 0.4, b.g.gain, set);
    },
    rumble(out, v, set) {
      const a = bedNoise(noiseB, 'lowpass', 130, 1, v * 1.8, out, set); lfo(0.11, v * 0.5, a.g.gain, set);
      const o = ac.createOscillator(); o.frequency.value = 38; const og = gain(v * 0.8); o.connect(og); og.connect(out); o.start(); track(o, set); lfo(0.05, 4, o.frequency, set);
    },
    water(out, v, set) {
      for (let i = 0; i < 2; i++) { const a = bedNoise(noiseP, 'bandpass', 900 + i * 700, 0.6, v * 0.9, out, set); lfo(0.9 + i * 0.8, 350, a.f.frequency, set); lfo(0.4 + i * 0.3, v * 0.35, a.g.gain, set); }
    },
    lava(out, v, set) {
      const a = bedNoise(noiseB, 'lowpass', 320, 1.5, v * 1.6, out, set); lfo(2.5, v * 0.7, a.g.gain, set);
      const b = bedNoise(noiseW, 'bandpass', 2800, 1, v * 0.05, out, set); lfo(7, v * 0.05, b.g.gain, set);
    },
    insects(out, v, set) {
      [[4300, 37, 0.4], [5200, 29, 0.27], [3700, 44, 0.19]].forEach(c => {
        const o = ac.createOscillator(); o.frequency.value = c[0]; const am = gain(0), slow = gain(0.5);
        lfo(c[1], v * 0.07, am.gain, set); lfo(c[2], 0.5, slow.gain, set);
        o.connect(am); am.connect(slow); slow.connect(out); o.start(); track(o, set);
      });
    },
    hum(out, v, set) {
      [-1, 1].forEach(d => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55; o.detune.value = d * 8; const f = lpf(out, 150, 1), g = gain(v * 0.5); o.connect(g); g.connect(f); o.start(); track(o, set); });
      const o2 = ac.createOscillator(); o2.frequency.value = 82.4; const g2 = gain(v * 0.12); o2.connect(g2); g2.connect(out); o2.start(); track(o2, set); lfo(0.06, v * 0.06, g2.gain, set);
    },
    room(out, v, set) { const a = bedNoise(noiseP, 'lowpass', 260, 0.7, v * 0.9, out, set); lfo(0.08, v * 0.3, a.g.gain, set); },
    fire(out, v, set) { const a = bedNoise(noiseB, 'lowpass', 600, 0.8, v * 1.6, out, set); lfo(1.7, v * 0.35, a.g.gain, set); },
  };
  const E = (name, rate, o) => ({ name, rate, o: o || {} });
  const AMB = {
    chateau:    { beds: { wind: 0.3, hum: 0.2 }, ev: [E('grincement', 0.05), E('porte_claque', 0.008, { vol: 0.35, lp: 1500 }), E('murmure', 0.03), E('chaines', 0.03), E('pas_pierre#4', 0.02, { vol: 0.4, lp: 1800 })] },
    foret:      { beds: { wind: 0.4, insects: 0.4 }, ev: [E('craquement', 0.08, { lp: 5000 }), E('murmure', 0.02), E('cri_lointain', 0.008, { vol: 0.3 }), E('souffle', 0.02)] },
    catacombes: { beds: { room: 0.45, hum: 0.2 }, ev: [E('goutte', 0.28), E('chaines', 0.04), E('murmure', 0.05), E('eboulement', 0.004, { vol: 0.3, lp: 1000 }), E('cri_lointain', 0.01, { vol: 0.25 }), E('griffures', 0.02, { vol: 0.4 })] },
    temple:     { beds: { hum: 0.35, fire: 0.15 }, ev: [E('murmure', 0.05), E('gong', 0.01, { vol: 0.3, lp: 1800 }), E('chaines', 0.03), E('crepitement', 0.2, { vol: 0.4 })] },
    abime:      { beds: { rumble: 0.6, lava: 0.45 }, ev: [E('lave_bulle', 0.4), E('cri_lointain', 0.03, { vol: 0.3 }), E('eboulement', 0.01, { vol: 0.4, lp: 1200 }), E('grincement', 0.02)] },
    mine:       { beds: { room: 0.35, wind: 0.2 }, ev: [E('goutte', 0.3), E('wagonnet', 0.01, { vol: 0.35, lp: 1800 }), E('eboulement', 0.01, { vol: 0.35 }), E('craquement', 0.05), E('grincement', 0.03)] },
    cathedrale: { beds: { water: 0.35, hum: 0.2 }, ev: [E('goutte', 0.22), E('cloche', 0.012, { vol: 0.3, lp: 2500 }), E('murmure', 0.04), E('chaines', 0.015)] },
    glace:      { beds: { wind: 0.7 }, ev: [E('craquement', 0.07, { lp: 4000 }), E('cloche', 0.01, { vol: 0.2, lp: 3000 })] },
    asile:      { beds: { room: 0.35, hum: 0.15 }, ev: [E('grincement', 0.06), E('chuchotement', 0.04), E('ricanement', 0.007, { vol: 0.4, lp: 2500 }), E('pas_pierre#3', 0.04, { vol: 0.4, lp: 1800 }), E('chaines', 0.02)] },
    camp:       { beds: { fire: 0.5, insects: 0.2 }, ev: [E('crepitement', 0.9, { vol: 0.5, near: true })] },
    dungeon_default: { beds: { wind: 0.3, room: 0.3 }, ev: [E('goutte', 0.1), E('grincement', 0.03), E('murmure', 0.02), E('craquement', 0.03)] },
    vent:       { beds: { wind: 0.65 }, ev: [E('souffle', 0.02)] },
    gouttes:    { beds: { room: 0.35 }, ev: [E('goutte', 0.5)] },
    chaines:    { beds: { room: 0.3 }, ev: [E('chaines', 0.12)] },
    coeur:      { beds: { room: 0.3 }, ev: [], heart: 0.85 },
    grondements: { beds: { rumble: 0.65 }, ev: [E('eboulement', 0.01, { vol: 0.4 })] },
    lave:       { beds: { rumble: 0.4, lava: 0.5 }, ev: [E('lave_bulle', 0.5)] },
    eau:        { beds: { water: 0.5 }, ev: [E('goutte', 0.15)] },
    insectes:   { beds: { insects: 0.6 }, ev: [] },
    murmures:   { beds: { room: 0.25 }, ev: [E('murmure', 0.16), E('chuchotement', 0.06)] },
    silence:    { beds: {}, ev: [] },
  };
  function resolveAmb(id) {
    const n = norm(id).replace(/[^a-z0-9_]+/g, '_');
    if (AMB[n]) return n;
    return styleKey(n);
  }
  function freeAmb(a) {
    a.set.forEach(s => { try { s.stop(); } catch (_) {} });
    try { a.out.disconnect(); a.wet.disconnect(); } catch (_) {}
    oldAmbs = oldAmbs.filter(x => x !== a);
  }
  function killAmb(a, f) {
    const t = ac.currentTime;
    a.out.gain.cancelScheduledValues(t); a.out.gain.setValueAtTime(Math.max(0.0001, a.out.gain.value), t); a.out.gain.linearRampToValueAtTime(0.0001, t + f);
    oldAmbs.push(a);
    setTimeout(() => freeAmb(a), (f + 0.3) * 1000);
    while (oldAmbs.length > 2) freeAmb(oldAmbs[0]);
  }
  A.ambience = function (id, opts) {
    opts = opts || {};
    if (id == null || id === false || id === 'none') {
      wanted.amb = null;
      if (ac && curAmb) { killAmb(curAmb, 2); curAmb = null; }
      return false;
    }
    if (!ac) { wanted.amb = id; return false; }
    const key = resolveAmb(id);
    if (curAmb && curAmb.key === key) return true;
    if (curAmb) killAmb(curAmb, 2.5);
    const prof = AMB[key] || AMB.dungeon_default, out = gain(0.0001), set = new Set(), wet = gain(0.5), t = ac.currentTime;
    out.connect(busA.in); out.connect(wet); wet.connect(busA.wetIn);
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + fin(opts.fade, 3));
    for (const b in prof.beds) if (BEDS[b]) { try { BEDS[b](out, prof.beds[b], set); } catch (e) { console.warn('[audio] bed ' + b, e); } }
    curAmb = { key, prof, out, set, wet, id };
    return true;
  };
  function ambEvent(e) {
    let name = e.name, rep = 1;
    const m = /^(.*)#(\d+)$/.exec(name); if (m) { name = m[1]; rep = +m[2]; }
    const o = Object.assign({ bus: busA, gap: 200 }, e.o);
    if (!e.o.near) {
      const d = rnd(8, 26), a = rnd(0, 6.283), v = clamp(1 / (1 + Math.pow(d / 7, 1.4)), 0.05, 1);
      o.pan = clamp(Math.sin(a) * 0.95, -1, 1);
      o.vol = (e.o.vol != null ? e.o.vol : 0.7) * (0.35 + v * 0.8) * rnd(0.7, 1);
      o.lp = e.o.lp || clamp(16000 / (1 + d / 6), 1200, 9000); o.rev = Math.max(e.o.rev || 0, clamp(0.2 + d / 40, 0.2, 0.75));
    }
    for (let i = 0; i < rep; i++) { o.delay = i * rnd(0.4, 0.65); o.keyExtra = '#' + i; playSfx(name, o); if (rep > 1) o.vol *= 0.9; }
  }
  /** atténue la musique (et l'ambiance si opts.amb) : faux silence de l'horreur */
  A.duck = function (level, ms, opts) {
    if (!ac) return;
    opts = opts || {};
    level = Math.max(0.0001, clamp(fin(level, 0.1), 0, 1)); ms = fin(ms, 3000); if (ms <= 120) ms *= 1000;   // accepte des secondes (<= 120) ou des ms
    ms = Math.max(100, ms);
    const t = ac.currentTime, tot = ms / 1000, f = opts.quick ? 0.15 : 0.5, bs = [busM.duck, busM.duckW];
    if (opts.amb || opts.ambience) { bs.push(busA.duck, busA.duckW); duckAmbUntil = Math.max(duckAmbUntil, performance.now() + ms); }
    bs.forEach(g => {
      const p = g.gain; p.cancelScheduledValues(t); p.setValueAtTime(Math.max(0.0001, p.value), t);
      p.linearRampToValueAtTime(level, t + f); p.setValueAtTime(level, t + tot); p.linearRampToValueAtTime(1, t + tot + (opts.release || 1.5));
    });
  };
  /** faux silence (secondes) : coupe musique + ambiance */
  A.silence = function (sec, level) { A.duck(level == null ? 0.03 : level, fin(sec, 5) * 1000, { amb: true }); };
  A.stopAll = function () {
    wanted = { music: null, amb: null, mopts: null };
    if (!ac) return;
    if (cur) { killMusic(cur, 0.4); cur = null; }
    if (curAmb) { killAmb(curAmb, 0.4); curAmb = null; }
    const t = ac.currentTime;
    [busS.vol.gain, busS.volW.gain, busT.vol.gain, busT.volW.gain].forEach(g => { g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); });
    setTimeout(() => applyVolumes(false), 250);
    voices = [];
  };
  A.tension = () => tensionV;

  // ------------------------------------------------------------------
  //  Boucle de contrôle (≈ 10 Hz) : séquenceur, ambiance, cœur, volumes
  // ------------------------------------------------------------------
  function startTimer() { if (!timer && !injected) timer = setInterval(tick, 100); }
  function tick() {
    if (!ac || suspended || ac.state !== 'running') { lastTick = performance.now(); return; }
    const nowMs = performance.now(), dt = clamp((nowMs - (lastTick || nowMs)) / 1000, 0, 0.5); lastTick = nowMs; tickN++;
    pump(ac.currentTime + 0.4);
    if (nowMs - tensionAt > 2500 && tensionV > 0) tensionV = Math.max(0, tensionV - dt * 0.2);
    if (autoX > 0) autoX = Math.max(0, autoX - dt * 0.05);
    if (tickN % 3 === 0) updateLayers();
    if (tickN % 5 === 0) { applyVolumes(false); pollScreen(false); }
    const quiet = nowMs < duckAmbUntil;
    if (curAmb && !quiet) {
      const ev = curAmb.prof.ev;
      for (let i = 0; i < ev.length; i++) if (Math.random() < ev[i].rate * dt) ambEvent(ev[i]);
    }
    const hv = curAmb && curAmb.prof.heart ? curAmb.prof.heart : 0, tn = Math.max(tensionV, hv);
    if (!quiet && tn > 0.55 && ac.currentTime > heartNext) {
      playSfx('coeur', { bus: busA, vol: 0.25 + tn * 0.7, noVar: true, rev: 0.1, gap: 0 });
      heartNext = ac.currentTime + 60 / (58 + tn * 62);
    }
    if (!quiet && tn > 0.35 && ac.currentTime > breathNext) {
      if (Math.random() < 0.5) playSfx('respiration', { bus: busA, vol: 0.12 + tn * 0.3, rev: 0.25, pan: rnd(-0.2, 0.2), gap: 1000 });
      breathNext = ac.currentTime + rnd(3.2, 5.5) - tn * 1.5;
    }
  }

  // ------------------------------------------------------------------
  //  Écrans (titre / camp) : bus 'screen', sinon observation du DOM
  // ------------------------------------------------------------------
  function activeScreen() {
    const el = safe(() => document.querySelector('.screen.active'), null);
    return el && el.id ? el.id.replace(/^screen-/, '') : null;
  }
  function onScreen(id) {
    if (!id || id === screenId) return;
    const prev = screenId; screenId = id;
    if (id === 'title' || id === 'create') { if (prev !== 'create' && prev !== 'title') A.ambience(null); A.music('menu', { fade: 2 }); }
    else if (id === 'hub' || id === 'forge') { A.music('camp', { fade: 2.5 }); if (id === 'hub') A.ambience('camp'); }
  }
  function pollScreen(force) {
    if (force) screenId = null;
    if (inRunFlag && !force) return;
    onScreen(activeScreen());
  }
  A.screen = onScreen;

  // ------------------------------------------------------------------
  //  Réactions au bus de jeu
  // ------------------------------------------------------------------
  function coreTheme() { return safe(() => G.core && G.core.theme, null) || {}; }
  function applyThemeSound(d, fade) {
    d = d || {};
    const th = coreTheme(), sk = styleKey([d.theme, d.id, d.name].join(' '));
    A.ambience(d.ambience || th.ambience || sk, { fade: 3 });
    if (!bossActive) A.music(d.music || th.music || sk, { fade: fade == null ? 3 : fade });
  }
  function bossIdOf(b) {
    const def = (b && b.def) || {}, id = (b && b.id) || def.id || def.name || 'boss', m = def.music;
    if (m && !/^boss\d*$/.test(norm(m))) return 'boss_' + String(m).replace(/^boss_?/, '') + '_' + id;
    return 'boss_' + id;
  }
  function hookBus() {
    if (!G.bus || !G.bus.on || hookBus.done) return;
    hookBus.done = true;
    const B = (ev, fn) => G.bus.on(ev, p => { try { fn(p || {}); } catch (e) { console.warn('[audio] ' + ev, e); } });
    B('runStart', p => {
      inRunFlag = true; bossActive = false; runDungeon = p.dungeon || null; autoX = 0; manualX = 0.05; tensionV = 0; heartNext = 0;
      applyThemeSound(runDungeon, 3); updateLayers();
    });
    B('themeChanged', p => { if (inRunFlag && !bossActive) { const th = p.theme || {}; if (th.ambience) A.ambience(th.ambience); if (th.music) A.music(th.music, { fade: 2.5 }); } });
    B('roomStart', p => {
      inRunFlag = true; const rm = p.room || {};
      if (rm.type !== 'boss' && (bossActive || (cur && cur.st.boss))) { bossActive = false; applyThemeSound(runDungeon, 2.5); }
      autoX = Math.min(autoX, 0.2); manualX = rm.type === 'miniboss' ? 0.7 : 0.05; updateLayers();
    });
    B('roomCleared', () => { autoX = 0; manualX = 0.05; updateLayers(); });
    B('tension', p => { tensionV = clamp(fin(p.value, 0), 0, 1); tensionAt = performance.now(); });
    B('enemySpawn', p => {
      const e = p.enemy; if (!e || !e.pos) return;
      if (e.boss) {
        if (!e.mini) { bossActive = true; A.music(bossIdOf(e), { fade: 0.8 }); manualX = 1; updateLayers(); A.stinger('boss_intro'); }
        else { manualX = 0.85; updateLayers(); A.stinger('boss_intro', { vol: 0.6 }); }
        A.at('monstre_boss', e.pos.x, e.pos.z, { vol: 1, priority: 1, gap: 0 });
        return;
      }
      autoX = Math.min(1, autoX + 0.1);
      const nowMs = performance.now(); if (nowMs - lastEnemyVoice < 300) return; lastEnemyVoice = nowMs;
      const def = e.def || {}, nm = String(def.voice || def.sfx || def.sound || ('monstre_' + (e.id || def.id || def.model || 'x')));
      A.at(SFX[nm] || /^monstre/.test(nm) ? nm : 'monstre_' + nm, e.pos.x, e.pos.z, { vol: e.elite ? 1 : 0.75 });
    });
    B('enemyKilled', p => {
      const e = p.enemy; if (!e || !e.pos || e.boss || Math.random() > 0.35) return;
      A.at('monstre_' + (e.id || (e.def && e.def.id) || 'x'), e.pos.x, e.pos.z, { vol: 0.55, pitch: 0.85, gap: 150 });
    });
    B('damageDealt', () => { autoX = Math.min(1, Math.max(autoX, 0.55) + 0.03); });
    B('playerHit', () => { autoX = Math.min(1, Math.max(autoX, 0.6) + 0.12); tensionV = Math.min(1, tensionV + 0.08); });
    B('bossPhase', p => {
      A.stinger('boss_phase'); if (cur && cur.st.boss) cur.tempoMul = 1 + 0.06 * Math.max(0, fin(p.phase, 1) - 1);
      autoX = 1;
    });
    B('bossKilled', p => {
      A.stinger('victoire'); autoX = 0; manualX = 0; updateLayers();
      if (!p.mini) A.music(null, { fade: 3 }); else { bossActive = false; applyThemeSound(runDungeon, 3); }
    });
    B('runEnd', p => {
      inRunFlag = false; bossActive = false; autoX = 0; manualX = 0;
      A.music(null, { fade: 1.5 }); A.ambience(null);
      A.stinger(p.victory ? 'victoire' : 'defaite', { duck: false });
      setTimeout(() => { if (!inRunFlag) { screenId = null; A.music('camp', { fade: 4 }); if (activeScreen() === 'hub') A.ambience('camp'); } }, 6500);
    });
    B('horrorEvent', p => horrorSound(String(p.id || p.type || '')));
    B('settingsChanged', () => applyVolumes(false));
    B('screen', p => onScreen(p.id || p.screen || p.name));
    B('promotion', () => A.stinger('promotion'));
    B('rankUp', () => A.stinger('promotion'));
    B('secretFound', () => A.stinger('secret'));
    B('secretDiscovered', () => A.stinger('secret'));
  }
  const HORROR_MAP = [
    [/porte|door/, 'porte_claque'], [/pas|foot|step/, 'pas_pierre'], [/murmur|whisper|voix/, 'murmure'], [/chuchot/, 'chuchotement'],
    [/objet|chute|tomb/, 'objet_tombe'], [/rire|rican/, 'ricanement'], [/cri|scream/, 'cri_lointain'], [/griff|scratch/, 'griffures'], [/chaine/, 'chaines'],
    [/lumiere|lampe|extinct|noir|light|dark/, 'souffle'], [/statue|bouge/, 'craquement'], [/apparit|surgi|jump|sursaut|soudain/, 'sting_apparition'],
    [/ombre|silhouette|spectre/, 'sting_swell'], [/piece|lointain|autre/, 'eboulement'],
  ];
  function horrorSound(id) {
    const n = norm(id);
    if (/silence/.test(n)) { A.duck(0.03, 5000, { amb: true }); return; }
    if (/chasseur|poursuit|hunter/.test(n)) { tensionV = Math.max(tensionV, 0.85); tensionAt = performance.now(); A.play('sting_swell', { vol: 0.8 }); return; }
    for (let i = 0; i < HORROR_MAP.length; i++) if (HORROR_MAP[i][0].test(n)) {
      const nm = HORROR_MAP[i][1];
      if (lastPlay[nm] && performance.now() - lastPlay[nm] < 700) return;   // l'agent horreur a déjà joué ce son
      if (nm === 'pas_pierre') { for (let j = 0; j < 4; j++) A.play(nm, { delay: j * 0.42, vol: 0.55, pan: rnd(-0.4, 0.4), keyExtra: '#' + j, gap: 0 }); return; }
      A.play(nm, { vol: 0.8, pan: rnd(-0.7, 0.7), rev: 0.5 }); return;
    }
    A.play('sting_swell', { vol: 0.5 });
  }
  hookBus();
  if (!hookBus.done) { try { document.addEventListener('DOMContentLoaded', hookBus); } catch (_) {} setTimeout(hookBus, 0); }

  // ------------------------------------------------------------------
  //  Introspection / tests
  // ------------------------------------------------------------------
  A.list = () => ({ sfx: Object.keys(SFX), alias: Object.keys(SFX_ALIAS), musics: Object.keys(STYLES).concat(['boss_<id>']), ambiences: Object.keys(AMB), stingers: Object.keys(STING) });
  A.resolveSfx = name => { const r = resolveSfx(name); return r ? { key: r.key, pitch: r.pitch } : null; };
  A.debug = () => ({
    ready: !!ac, state: ac && ac.state, live, liveMax, voices: ac ? activeWeight() : 0, music: cur && { id: cur.id, key: cur.key, step: cur.step, tgt: cur.tgt }, olds: olds.length,
    amb: curAmb && curAmb.key, tension: tensionV, intensity: effX, auto: autoX, reverb: revKind, muted, screen: screenId,
  });
})();
