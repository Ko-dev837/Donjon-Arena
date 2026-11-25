window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v3/v5 — js/sys/events.js (rôle 15, v5 : agent 5) → G.RoomTypes : trap, event, secret, shrine, treasure, choice
   v5 : pièges/mécanismes PROPRES à chaque donjon (TRAP_DEF), révélations secrètes (mur fissuré, levier, symboles/énigme),
        caches, événements rares de donjon (EV.donjon), gardien = créature secrète, récompenses exclusives.
   + interrupteur de salle secrète (toutes salles hôtes) + champs de pièges réutilisables (G.Events).
   Dépend de G.Procgen (procgen.js, chargé avant) pour : util (or / XP / objets), newField, hazards, buffs.
   Contexte de salle : ctx = {run, room: roomDef, built?, api, ui} ; on tolère aussi ctx.room = salle construite.
   ===================================================================== */
(() => {
  'use strict';
  const HALF = 14;
  const hasTHREE = () => typeof THREE !== 'undefined';
  const P = () => G.Procgen;
  const U = () => G.Procgen.util;
  const rnd = (a, b) => a + G.rng.float() * (b - a);
  // --- coop (voir G.game.net) : objets partagés ouverts par l'hôte, butin propre à chaque joueur ---
  const NET = () => (G.game && G.game.net) || null;
  const isGuest = () => { const n = NET(); return !!(n && n.role === 'guest'); };
  function netReg(key, def) { const n = NET(); if (n && n.role && n.objRegister) n.objRegister(key, def); }
  /** true = ouvrir ici (solo / hôte) ; false = invité : la demande part chez l'hôte */
  function netUse(key, S, o) {
    const n = NET(); if (!n || !n.objUse || n.objUse(key)) return true;
    if (S && o) after(S, 1.5, () => { o.armed = true; });      // invité : la demande est renvoyée tant que l'hôte n'a pas ouvert
    return false;
  }
  function netDone(key, info) { const n = NET(); if (n && n.objDone) n.objDone(key, info); }
  /** Petit générateur déterministe (positions identiques chez tous les joueurs) */
  function srng(seed) { let s2 = (Math.floor(Number(seed) || 1) >>> 0) || 1; return () => { s2 = (Math.imul(s2, 1664525) + 1013904223) >>> 0; return s2 / 4294967296; }; }
  const rint = (a, b) => G.rng.int(a, b);
  const safe = (fn, fb) => { try { return fn(); } catch (e) { console.error('[events]', e); return fb; } };
  const rankIdx = (run) => { const r = run && run.dungeon && run.dungeon.rank; return Math.max(0, ['E', 'D', 'C', 'B', 'A', 'S', 'Z'].indexOf(r)); };

  let cur = null;           // état de la salle spéciale active
  const traps = [];         // pièges actifs (salles piège ou mécanique pieges_pics)
  let sw = null;            // interrupteur secret actif
  let swRoom = null;

  // ------------------------------------------------------------------
  //  Aides générales
  // ------------------------------------------------------------------
  function resolve(ctx) {
    ctx = ctx || {};
    const run = ctx.run || U().run();
    const isBuilt = (o) => o && (o.obstacles || o.spawnPoints);
    let def = ctx.roomData || (ctx.room && !isBuilt(ctx.room) ? ctx.room : null);
    let built = ctx.built || (isBuilt(ctx.room) ? ctx.room : null) || (run && run.room) || null;
    if (!def && run) def = run.roomData || (run.dungeon && run.dungeon.rooms && run.dungeon.rooms[run.roomIndex]) || null;
    return { run, def: def || { data: {} }, built };
  }
  function pl() { return U().player(); }
  function dist2(p, x, z) { return Math.hypot(p.pos.x - x, p.pos.z - z); }
  function blocked(built, x, z, rad) {
    const obs = (built && built.obstacles) || [];
    return Math.abs(x) > HALF - 1.2 || Math.abs(z) > HALF - 1.2 || obs.some((o) => Math.abs(x - o.x) < o.hw + rad && Math.abs(z - o.z) < o.hd + rad);
  }
  function randFree(built, rad, zmin, zmax, xr) {
    for (let k = 0; k < 40; k++) {
      const x = rnd(-(xr || HALF - 2), xr || HALF - 2), z = rnd(zmin == null ? -HALF + 3 : zmin, zmax == null ? HALF - 3 : zmax);
      if (!blocked(built, x, z, rad)) return [x, z];
    }
    return [0, 0];
  }
  const toonM = (c, o) => (G.GFX && G.GFX.toon ? G.GFX.toon(c, o) : new THREE.MeshLambertMaterial({ color: c }));
  const basicM = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op == null ? 1 : op, depthWrite: false });

  function makeLabel(text, color) {
    if (!hasTHREE() || typeof document === 'undefined') return null;
    return safe(() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const g = c.getContext('2d');
      g.font = '700 26px "Chakra Petch", "Nunito", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = Math.min(244, g.measureText(text).width + 30), x0 = 128 - tw / 2;
      g.fillStyle = 'rgba(9,14,30,.82)'; g.beginPath(); g.moveTo(x0 + 8, 8); g.lineTo(x0 + tw, 8); g.lineTo(x0 + tw, 56 - 8); g.lineTo(x0 + tw - 8, 56); g.lineTo(x0, 56); g.lineTo(x0, 16); g.closePath(); g.fill();
      g.lineWidth = 2; g.strokeStyle = color || 'rgba(70,212,255,.8)'; g.stroke();
      g.fillStyle = color || '#e8f0ff'; g.fillText(text, 128, 33, 232);
      const tex = new THREE.CanvasTexture(c);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(4, 1, 1);
      return s;
    }, null);
  }
  function setObj(S, text) {
    if (!S || S.obj === text) return;
    S.obj = text;
    if (S.run) S.run.objective = text;
    if (G.UI && G.UI.hud && G.UI.hud.setObjective) safe(() => G.UI.hud.setObjective(text));
  }

  // --- état de salle ---
  function begin(ctx) {
    endCurrent();
    const r = resolve(ctx);
    const S = { run: r.run, def: r.def, built: r.built, data: r.def.data || {}, f: P().newField(r.def), t: 0, done: false, usables: [], anim: [], timers: [], mine: [], expect: 0, expectUntil: 0, busy: false, obj: null, id: Math.random() };
    cur = S;
    return S;
  }
  function endCurrent() {
    if (!cur) return;
    const S = cur; cur = null;
    if (S.run && S.busy) S.run.modal = false;
    if (S.f) S.f.clear();
    if (S.onEnd) safe(() => S.onEnd(S));
  }
  const addAnim = (S, fn) => S.anim.push(fn);
  const after = (S, s, fn) => S.timers.push({ t: s, fn });
  function place(S, obj, x, z, labelText, labelColor, labelY) {
    if (!obj) return null;
    obj.position.set(x, obj.position.y || 0, z);
    S.f.add(obj);
    if (labelText) { const l = makeLabel(labelText, labelColor); if (l) { l.position.set(x, labelY || 2.6, z); S.f.add(l); obj.userData.label = l; } }
    return obj;
  }
  function addUsable(S, o) { o.armed = true; S.usables.push(o); return o; }

  function enemyList() {
    const a = G.SkillAPI;
    const l = a && a.enemies ? a.enemies() : ((U().run() || {}).enemies || []);
    return l.filter((e) => !e.dead);
  }
  function aliveMine(S) {
    const n = S.mine.filter((e) => !e.dead).length;
    const pend = S.expect > 0 && S.t < S.expectUntil ? S.expect : 0;
    return n + pend;
  }
  function monsterIds(S, elite) {
    const d = (S.run && S.run.dungeon) || {};
    const l = elite && d.elites && d.elites.length ? d.elites : (d.monsters && d.monsters.length ? d.monsters : ['squelette']);
    return l;
  }
  function spawnMobs(S, ids, opt) {
    opt = opt || {};
    const api = G.SkillAPI;
    if (!api || !api.spawnEnemy || !hasTHREE()) return;
    const p = pl();
    const pts = (S.built && S.built.spawnPoints || []).filter((s) => !p || Math.hypot(s[0] - p.pos.x, s[1] - p.pos.z) > 6);
    const pool = pts.length ? pts : [[0, -6]];
    const center = opt.near;
    ids.forEach((id, i) => {
      let pt = pool[Math.floor(G.rng.float() * pool.length)];
      if (center) { const a = rnd(0, Math.PI * 2), d = rnd(4, 7); pt = [Math.max(-12, Math.min(12, center[0] + Math.cos(a) * d)), Math.max(-12, Math.min(12, center[1] + Math.sin(a) * d))]; }
      S.expect++; S.expectUntil = S.t + 6 + ids.length * 0.2;
      after(S, i * 0.18, () => {
        if (G.fx && G.fx.ring) safe(() => G.fx.ring(new THREE.Vector3(pt[0], 0.05, pt[1]), 0xb46bff, 1.2, 0.6));
        const e = api.spawnEnemy(id, new THREE.Vector3(pt[0], 0, pt[1]), { elite: !!opt.elite });
        if (e && typeof e === 'object' && S.mine.indexOf(e) < 0 && !e._ev) { e._ev = S; S.mine.push(e); S.expect = Math.max(0, S.expect - 1); }
      });
    });
  }
  G.bus.on('enemySpawn', (p) => {
    const e = p && p.enemy; if (!e || !cur || cur.expect <= 0 || e._ev || e.boss) return;
    if (cur.mine.indexOf(e) >= 0) return;
    e._ev = cur; cur.mine.push(e); cur.expect--;
  });

  // ------------------------------------------------------------------
  //  Fenêtres d'événements (refonte v4 : fenêtres système, cartes de choix, icônes G.Icons)
  // ------------------------------------------------------------------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (name, size) => { try { const Ic = G.Icons; if (Ic && Ic.svg && (!Ic.has || Ic.has(name))) return Ic.svg(name, { size: size || 20 }) || ''; } catch (e) { /* ignore */ } return ''; };
  /** icône SVG si disponible, sinon l'emoji de secours (pour les bannières) */
  const bi = (name, emoji) => { const s = ico(name, 16); return s ? '<span style="display:inline-flex;vertical-align:-3px;margin-right:2px">' + s + '</span>' : (emoji || ''); };
  // type d'événement → icône, couleur, étiquette
  const EVKIND = [
    [/marchand/i, { ico: 'shop', col: 'var(--ds-gold,#ffc94a)', tag: 'Marchand' }],
    [/pacte/i, { ico: 'skull', col: 'var(--ds-danger,#ff4d6a)', tag: 'Pacte' }],
    [/fontaine/i, { ico: 'heart', col: 'var(--ds-accent,#46d4ff)', tag: 'Fontaine' }],
    [/[ée]nigme/i, { ico: 'scroll', col: 'var(--ds-accent-2,#8b6bff)', tag: 'Énigme' }],
    [/sanctuaire|b[ée]n[ée]diction/i, { ico: 'holy', col: 'var(--ds-gold,#ffc94a)', tag: 'Sanctuaire' }],
    [/chemin|voie|bifurc/i, { ico: 'map', col: 'var(--ds-accent,#46d4ff)', tag: 'Choix de chemin' }],
    [/d[ée]fi|chrono/i, { ico: 'timer', col: 'var(--ds-warning,#ffb547)', tag: 'Défi' }],
  ];
  const EMO_ICO = { '🚪': 'exit', '🗝️': 'key', '❤️': 'heart', '💖': 'heart', '💧': 'heart', '⚗️': 'sparkles', '🔰': 'shield', '🎁': 'gift', '📘': 'book', '🩸': 'skull', '🪙': 'gold', '☠️': 'skull', '❔': 'help', '👻': 'skull', '🌟': 'star-fill', '⚔️': 'sword', '🛡️': 'shield', '💰': 'gold' };
  function evKind(title) { for (const k of EVKIND) if (k[0].test(title || '')) return k[1]; return { ico: 'info', col: 'var(--ds-accent,#46d4ff)', tag: 'Événement' }; }

  let evCss = false;
  function injectEvCss() {
    if (evCss || typeof document === 'undefined') return; evCss = true;
    try { G.__pcUi && G.__pcUi.dsFallback && G.__pcUi.dsFallback(); } catch (e) { /* ignore */ }
    const st = document.createElement('style'); st.id = 'evt-style';
    st.textContent = `
.evt{font-family:var(--ds-font-body,'Nunito',sans-serif);color:var(--ds-text,#e8f0ff);display:flex;flex-direction:column;gap:12px;min-width:0}
.evt *{box-sizing:border-box}
.evt-ic{display:inline-flex;align-items:center;justify-content:center;line-height:0}.evt-ic svg{display:block}
.evt-hero{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid color-mix(in srgb,var(--ec) 50%,transparent);border-radius:var(--ds-r-md,10px);
  background:linear-gradient(120deg,color-mix(in srgb,var(--ec) 22%,transparent),rgba(7,11,24,.6) 75%)}
.evt-hero__ico{flex:0 0 auto;width:48px;height:48px;display:flex;align-items:center;justify-content:center;color:var(--ec);border-radius:var(--ds-r-md,10px);
  border:1.5px solid var(--ec);background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--ec) 35%,transparent),rgba(7,11,24,.9));box-shadow:0 0 16px color-mix(in srgb,var(--ec) 40%,transparent)}
.evt-kicker{font:700 10px var(--ds-font-display,'Chakra Petch',sans-serif);letter-spacing:.18em;text-transform:uppercase;color:var(--ec)}
.evt-title{font:700 20px/1.1 var(--ds-font-display,'Chakra Petch',sans-serif);letter-spacing:.05em;text-transform:uppercase;color:#fff}
.evt-desc{margin:0;font-size:14px;line-height:1.45;color:var(--ds-text-2,#a9b8d6);font-weight:700}
.evt-quote{margin:0;padding:12px 14px;border-left:3px solid var(--ec);border-radius:0 var(--ds-r-md,10px) var(--ds-r-md,10px) 0;background:color-mix(in srgb,var(--ec) 10%,transparent);
  font-size:15px;line-height:1.45;color:var(--ds-text,#e8f0ff);font-weight:800;font-style:italic}
.evt-purse{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:99px;border:1px solid rgba(255,201,74,.45);background:rgba(255,201,74,.1);color:var(--ds-gold,#ffc94a);font:700 14px var(--ds-font-display,sans-serif)}
.evt-choices{display:flex;flex-direction:column;gap:8px}
.evt-opt{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:62px;padding:10px 12px;text-align:left;cursor:pointer;color:var(--ds-text,#e8f0ff);font-family:inherit;
  border:1px solid var(--ds-line-strong,rgba(130,200,255,.36));border-radius:var(--ds-r-md,10px);background:linear-gradient(135deg,rgba(70,212,255,.08),rgba(9,14,30,.85) 70%);
  transition:transform var(--ds-fast,120ms),border-color var(--ds-fast,120ms),box-shadow var(--ds-fast,120ms)}
.evt-opt:hover{border-color:var(--ec);box-shadow:0 0 16px color-mix(in srgb,var(--ec) 30%,transparent)}
.evt-opt:active{transform:scale(.985)}
.evt-opt:focus-visible{outline:2px solid var(--ds-accent,#46d4ff);outline-offset:2px}
.evt-opt__ico{flex:0 0 auto;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--ec);border-radius:var(--ds-r-md,10px);border:1px solid color-mix(in srgb,var(--ec) 60%,transparent);background:color-mix(in srgb,var(--ec) 14%,rgba(7,11,24,.8))}
.evt-opt__tx{flex:1;min-width:0}
.evt-opt__lb{display:block;font:700 15px/1.2 var(--ds-font-display,sans-serif);letter-spacing:.03em}
.evt-opt__ds{display:block;margin-top:3px;font-size:12px;line-height:1.35;color:var(--ds-text-2,#a9b8d6);font-weight:700}
.evt-opt__pr{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;border:1px solid rgba(255,201,74,.5);background:rgba(255,201,74,.1);color:var(--ds-gold,#ffc94a);font:700 14px var(--ds-font-display,sans-serif)}
.evt-opt.poor{opacity:.6}.evt-opt.poor .evt-opt__pr{color:var(--ds-danger,#ff4d6a);border-color:rgba(255,77,106,.5);background:rgba(255,77,106,.1)}
.evt-opt.warn:hover{border-color:var(--ds-danger,#ff4d6a)}
.evt-opt.leave{min-height:46px;background:transparent;border-color:var(--ds-line,rgba(130,180,255,.16));justify-content:center;gap:8px;color:var(--ds-text-2,#a9b8d6)}
.evt-opt.leave .evt-opt__lb{font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.evt-opt.leave .evt-opt__ds{display:none}
@media(min-width:700px){.evt-choices.n3,.evt-choices.n4{display:grid;grid-template-columns:1fr 1fr}.evt-choices .leave{grid-column:1/-1}}
`;
    document.head.appendChild(st);
  }
  /** Fenêtre système d'événement. Résout avec la valeur de l'option, ou null/undefined si indisponible. */
  function evWindow(title, desc, options) {
    const U2 = G.UI;
    if (typeof document === 'undefined' || !U2 || typeof U2.modal !== 'function') return null;
    injectEvCss();
    const kind = evKind(title), root = document.createElement('div');
    root.className = 'evt'; root.style.setProperty('--ec', kind.col);
    const purse = /marchand/i.test(title) && /(\d+)\s*or/.test(desc || '') ? (desc.match(/(\d+)\s*or/) || [])[1] : null;
    let h = '<div class="evt-hero"><span class="evt-hero__ico">' + (ico(kind.ico, 28) || '◈') + '</span><div><div class="evt-kicker">Événement</div><div class="evt-title">' + esc(title) + '</div></div>' +
      (purse != null ? '<span class="evt-purse"><span class="evt-ic">' + (ico('gold', 16) || '💰') + '</span>' + esc(purse) + '</span>' : '') + '</div>';
    if (desc && purse == null) h += kind.tag === 'Énigme' ? '<blockquote class="evt-quote">' + esc(desc) + '</blockquote>' : '<p class="evt-desc">' + esc(desc) + '</p>';
    h += '<div class="evt-choices n' + Math.min(4, options.length) + '">';
    options.forEach((o, i) => {
      const leave = o.icon === '🚪' || o.value === null || o.value === -1;
      const m = !leave && /^(.*?)\s+—\s+(\d+)\s*or\s*$/.exec(o.label || '');
      const label = m ? m[1] : o.label, price = m ? m[2] : null;
      const poor = /or insuffisant/.test(o.desc || '');
      const iname = EMO_ICO[o.icon];
      const icon = (iname && ico(iname, 22)) || esc(o.icon || '◈');
      h += '<button type="button" class="evt-opt' + (leave ? ' leave' : '') + (poor ? ' poor' : '') + (/-\d+\s*%\s*PV/.test(o.label || '') ? ' warn' : '') + '" data-i="' + i + '">' +
        '<span class="evt-opt__ico">' + (leave ? (ico('exit', 18) || '🚪') : icon) + '</span><span class="evt-opt__tx"><span class="evt-opt__lb">' + esc(label) + '</span>' + (o.desc ? '<span class="evt-opt__ds">' + esc(o.desc) + '</span>' : '') + '</span>' +
        (price != null ? '<span class="evt-opt__pr"><span class="evt-ic">' + (ico('gold', 14) || '💰') + '</span>' + esc(price) + '</span>' : '') + '</button>';
    });
    root.innerHTML = h + '</div>';
    let closeFn = null, modalBox = null;
    const finish = (i) => {
      const v = options[i].value;
      if (closeFn) closeFn(v === undefined ? i : v);
      else if (modalBox) { const bs = modalBox.querySelectorAll('button:not(.evt-opt)'); if (bs[i]) bs[i].click(); }
    };
    Array.prototype.forEach.call(root.querySelectorAll('.evt-opt'), (b) => { b.addEventListener('click', () => finish(+b.dataset.i)); });
    // repli : si le modal n'appelle pas onOpen, les boutons du pied de fenêtre restent utilisables (même valeurs)
    const p = U2.modal({
      node: root, wide: false, dismissable: false,
      buttons: options.map((o) => ({ label: o.label, value: o.value, style: 'ghost' })),
      onOpen: (body, close) => {
        closeFn = close;
        try { const win = root.closest('.sys-win,.ds-window,.ds-modal') || body.parentNode; const ft = win && win.querySelector('.sys-foot,.ds-window__footer,.ds-modal__footer'); if (ft) ft.style.display = 'none'; } catch (e) { /* ignore */ }
      },
    });
    setTimeout(() => { if (!closeFn) modalBox = root.closest('.sys-win,.ds-window,.ds-modal') || root.parentNode; }, 0);
    return p;
  }

  /** Dialogue (promesse). options:[{label,desc,value,icon}] */
  function ask(S, title, options, desc) {
    S.busy = true;
    if (S.run) S.run.modal = true;
    let p = safe(() => evWindow(title, desc, options), null);
    if (!p && G.UI && G.UI.choice) p = safe(() => G.UI.choice({ title, desc, options }), null);
    else if (!p && G.UI && G.UI.modal) p = safe(() => G.UI.modal({ title, html: (desc || '') + '<br>' + options.map((o) => o.label + ' — ' + (o.desc || '')).join('<br>'), buttons: options.map((o) => ({ label: o.label, value: o.value })) }), null);
    if (!p || !p.then) p = Promise.resolve(options[options.length - 1].value);
    const id = S.id;
    const fin = (v) => { if (S.run) S.run.modal = false; S.busy = false; return cur && cur.id === id ? v : undefined; };
    return Promise.resolve(p).then(fin, () => fin(undefined));
  }

  function runUpdate(S, dt) {
    S.t += dt;
    for (let i = S.timers.length - 1; i >= 0; i--) { const tm = S.timers[i]; tm.t -= dt; if (tm.t <= 0) { S.timers.splice(i, 1); safe(() => tm.fn()); } }
    S.anim.forEach((f) => f(S.t, dt));
    const p = pl();
    if (p && !S.busy) {
      for (const o of S.usables) {
        if (o.disabled) continue;
        const d = dist2(p, o.x, o.z);
        if (d > o.r + 1.2) o.armed = true;
        if (d < o.r && o.armed && !(S.run && S.run.modal)) { o.armed = false; safe(() => o.onUse(S, o)); }
      }
    }
  }

  // --- récompenses communes ---
  function reward(S, spec, pos) {
    const run = S.run, r = rankIdx(run), u = U();
    const gold = Math.round((spec.gold || 0) * (1 + 0.25 * r));
    if (gold) u.giveGold(gold, pos);
    if (spec.xp) u.giveXP(Math.round(spec.xp * (1 + 0.3 * r)));
    if (spec.item && G.rng.chance(spec.item.p)) u.giveItem(spec.item.rarity);
    if (spec.potion && G.rng.chance(spec.potion)) { u.addPotion(G.rng.chance(0.6) ? 'Potion de soin' : 'Potion de mana', 1); u.notify('Potion trouvée', 'commun', '🧪'); }
    u.save();
  }
  function fxBurst(pos, color, n) { if (G.fx && G.fx.burst && hasTHREE()) safe(() => G.fx.burst(pos, color || 0xffd23f, n || 20, { speed: 5, up: 5, life: 0.8, size: 0.18, gravity: 8 })); }
  function pos3(x, y, z) { return hasTHREE() ? new THREE.Vector3(x, y, z) : { x, y, z }; }

  // ------------------------------------------------------------------
  //  Modèles simples
  // ------------------------------------------------------------------
  function mkAltar(color) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.7, 12), toonM(0x4a4458)); base.position.y = 0.35; g.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 12), toonM(0x6a6478)); top.position.y = 0.8; g.add(top);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), basicM(color, 0.95)); orb.position.y = 1.5; g.add(orb);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), basicM(color, 0.5)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.userData.orb = orb; g.userData.ring = ring;
    return g;
  }
  function mkNpc(body, hat) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 10), toonM(body)); b.position.y = 0.75; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), toonM(0xf0d2b0)); h.position.y = 1.7; g.add(h);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 10), toonM(hat)); c.position.y = 2.15; g.add(c);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), toonM(0x8a5a2a)); bag.position.set(-0.55, 0.9, -0.3); g.add(bag);
    return g;
  }
  function mkStatue() {
    const g = new THREE.Group();
    const m = toonM(0x8a8f99);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), m); base.position.y = 0.25; g.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.7), m); body.position.y = 1.4; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), m); head.position.y = 2.6; g.add(head);
    const eyeM = basicM(0x66ddff, 0.95);
    [-0.18, 0.18].forEach((x) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.05), eyeM); e.position.set(x, 2.65, 0.37); g.add(e); });
    g.userData.eyes = eyeM;
    return g;
  }
  function mkGhost() {
    const g = new THREE.Group();
    const m = basicM(0xcfe8ff, 0.7);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 10), m); body.position.y = 0.9; body.rotation.x = Math.PI; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), m); head.position.y = 1.7; g.add(head);
    const ey = basicM(0x223355, 1);
    [-0.15, 0.15].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), ey); e.position.set(x, 1.75, 0.36); g.add(e); });
    return g;
  }
  function mkSeal(color) {
    const g = new THREE.Group();
    const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), basicM(color, 0.9)); o.position.y = 1.3; g.add(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 32), basicM(color, 0.55)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), basicM(0xffffff, 0.35)); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.06; fill.scale.setScalar(0.001); g.add(fill);
    g.userData.orb = o; g.userData.fill = fill; g.userData.ring = ring;
    return g;
  }
  function mkChest() {
    const c = G.GFX && G.GFX.makeChest ? safe(() => G.GFX.makeChest(), null) : null;
    if (c) return c;
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.9), toonM(0x8a5a2a)); b.position.y = 0.4; g.add(b);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.3, 0.94), toonM(0xc8902a)); lid.position.y = 0.95; g.add(lid);
    g.userData.lid = lid;
    return g;
  }
  function openChestVisual(c) { if (G.GFX && G.GFX.openChest) safe(() => G.GFX.openChest(c)); else if (c && c.userData && c.userData.lid) c.userData.lid.rotation.x = -1.1; }
  function mkCoin() {
    const c = G.GFX && G.GFX.makePickup ? safe(() => G.GFX.makePickup('gold'), null) : null;
    if (c) return c;
    return new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 10), basicM(0xffd23f, 1));
  }
  const spinOrb = (S, g, spd) => addAnim(S, (t) => { if (g.userData.orb) { g.userData.orb.rotation.y = t * (spd || 1.5); g.userData.orb.position.y = (g.userData.orb.position.y > 1 ? 1.5 : 1.3) + 0.0; g.userData.orb.scale.setScalar(1 + 0.1 * Math.sin(t * 3)); } if (g.userData.ring) g.userData.ring.material.opacity = 0.35 + 0.2 * Math.sin(t * 2.5); });
  const dimAltar = (g) => { if (g && g.userData.orb) g.userData.orb.material.opacity = 0.15; if (g && g.userData.ring) g.userData.ring.visible = false; };

  const altarSpot = (S, dx, dz) => { const c = (S.built && S.built.chestPos) || [0, -4]; return U().freeSpot(S.built, c[0] + (dx || 0), c[1] + (dz || 0), 1.4); };

  // ------------------------------------------------------------------
  //  PIÈGES (champs réutilisables)
  // ------------------------------------------------------------------
  const trapDmg = (pct) => Math.max(4, Math.round(U().pvMax() * pct));

  function spikeField(o) {
    o = o || {};
    const run = U().run(); const built = run && run.room;
    const f = P().newField();
    const T = { kind: 'spikes', owner: U().roomRef(), f, armed: o.armed !== false, tiles: [] };
    if (!hasTHREE()) { traps.push(T); return T; }
    const count = o.count || 8, inten = o.intensity || 1;
    const dmg = o.dmg || trapDmg(0.08 + 0.012 * rankIdx(run));
    const sz = 2.2;
    const baseM = toonM(0x2a2730), spkM = toonM(0xd8dde6);
    const used = [];
    for (let i = 0; i < count; i++) {
      let pos = null;
      for (let k = 0; k < 30 && !pos; k++) {
        const x = rnd(-HALF + 2.5, HALF - 2.5), z = rnd(-HALF + 3.5, HALF - 6);
        if (blocked(built, x, z, 1.2)) continue;
        if (used.some((u) => Math.abs(u[0] - x) < sz + 0.2 && Math.abs(u[1] - z) < sz + 0.2)) continue;
        if (Math.abs(x) < 2.5 && z < -HALF + 4.5) continue;
        pos = [x, z];
      }
      if (!pos) continue;
      used.push(pos);
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(sz, 0.08, sz), baseM); plate.position.y = 0.04; g.add(plate);
      const spikes = new THREE.Group();
      for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), spkM); c.position.set(a * 0.5, 0.45, b * 0.5); spikes.add(c); }
      spikes.position.y = -1; g.add(spikes);
      const tele = G.GFX && G.GFX.makeTelegraph ? G.GFX.makeTelegraph('circle', sz * 0.6) : null;
      if (tele) g.add(tele);
      f.add(g);
      T.tiles.push({ x: pos[0], z: pos[1], g, spikes, tele, state: 'idle', t: rnd(0.2, 2.4) / inten, hit: false, half: sz / 2 + 0.15, dmg });
    }
    T.update = (dt) => {
      const p = pl();
      T.tiles.forEach((tl) => {
        if (!T.armed) { tl.spikes.position.y = -1; if (tl.tele) tl.tele.visible = false; return; }
        tl.t -= dt;
        if (tl.state === 'idle') { if (tl.tele) tl.tele.visible = false; if (tl.t <= 0) { tl.state = 'warn'; tl.t = 0.95; tl.w = 0.95; if (tl.tele) tl.tele.visible = true; } }
        else if (tl.state === 'warn') {
          if (tl.tele && tl.tele.userData.setProgress) tl.tele.userData.setProgress(1 - tl.t / tl.w);
          if (tl.t <= 0) { tl.state = 'up'; tl.t = 0.5; tl.hit = false; tl.spikes.position.y = 0; if (tl.tele) tl.tele.visible = false; U().sfx('slam'); }
        } else if (tl.state === 'up') {
          if (p && !tl.hit && Math.abs(p.pos.x - tl.x) < tl.half && Math.abs(p.pos.z - tl.z) < tl.half && !(p.dashT > 0)) { tl.hit = true; U().damagePlayer(tl.dmg, { element: 'physique', source: 'pics' }); }
          if (tl.t <= 0) { tl.state = 'idle'; tl.t = rnd(1.4, 2.8) / inten; tl.spikes.position.y = -1; }
        }
      });
    };
    traps.push(T);
    return T;
  }

  function bladeField(o) {
    o = o || {};
    const run = U().run(); const built = run && run.room;
    const f = P().newField();
    const T = { kind: 'blades', owner: U().roomRef(), f, armed: true, blades: [] };
    if (!hasTHREE()) { traps.push(T); return T; }
    const n = o.count || 2, inten = o.intensity || 1;
    const dmg = o.dmg || trapDmg(0.09 + 0.012 * rankIdx(run));
    const L = 4.6;
    for (let i = 0; i < n; i++) {
      let px = (i - (n - 1) / 2) * 8 + rnd(-1, 1), pz = rnd(-6, 3);
      if (blocked(built, px, pz, 0.8)) { const s = randFree(built, 0.8, -6, 3, 9); px = s[0]; pz = s[1]; }
      const g = new THREE.Group(); g.position.set(px, 0, pz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8), toonM(0x4a4850)); post.position.y = 0.6; g.add(post);
      const arm = new THREE.Group(); arm.position.y = 0.9;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(L * 2, 0.12, 0.5), toonM(0xc9ced8)); arm.add(bar);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(L * 2, 0.05, 0.12), basicM(0xff4a4a, 0.9)); edge.position.y = 0.1; arm.add(edge);
      g.add(arm); f.add(g);
      T.blades.push({ x: px, z: pz, arm, ang: rnd(0, Math.PI), spd: (1.1 + 0.25 * inten) * (i % 2 ? -1 : 1), cd: 0, L, dmg });
    }
    T.update = (dt) => {
      const p = pl();
      T.blades.forEach((b) => {
        if (T.armed) b.ang += b.spd * dt;
        b.arm.rotation.y = -b.ang;
        b.cd -= dt;
        if (!T.armed || !p || b.cd > 0) return;
        const dx = p.pos.x - b.x, dz = p.pos.z - b.z;
        const ux = Math.cos(b.ang), uz = Math.sin(b.ang);
        const along = dx * ux + dz * uz, perp = Math.abs(-dx * uz + dz * ux);
        if (Math.abs(along) < b.L && perp < 0.75 && !(p.dashT > 0)) { b.cd = 0.9; U().damagePlayer(b.dmg, { element: 'physique', source: 'lame' }); if (G.core && G.core.shake) G.core.shake(0.2); }
      });
    };
    traps.push(T);
    return T;
  }

  function arrowField(o) {
    o = o || {};
    const run = U().run(); const built = run && run.room;
    const f = P().newField();
    const T = { kind: 'arrows', owner: U().roomRef(), f, armed: true, turrets: [] };
    if (!hasTHREE()) { traps.push(T); return T; }
    const n = o.count || 3, inten = o.intensity || 1;
    const dmg = o.dmg || trapDmg(0.07 + 0.01 * rankIdx(run));
    const rows = [-9, -4, 1, 6].sort(() => G.rng.float() - 0.5).slice(0, n);
    rows.forEach((z, i) => {
      const side = i % 2 ? 1 : -1, x = side * (HALF - 0.7);
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 1.1), toonM(0x55505c)); b.position.y = 0.9; g.add(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), toonM(0x222), undefined); m.rotation.z = Math.PI / 2; m.position.set(-side * 0.5, 1.0, 0); g.add(m);
      f.add(g);
      let tele = null;
      if (G.GFX && G.GFX.makeTelegraph) { tele = G.GFX.makeTelegraph('line', { length: HALF * 2 - 1.5, width: 0.9 }); tele.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; tele.position.set(x, 0.05, z); tele.visible = false; f.add(tele); }
      T.turrets.push({ x, z, side, tele, t: rnd(0.8, 3) / inten, state: 'idle', w: 0.8, dmg });
    });
    T.update = (dt) => {
      const p = pl(), api = G.SkillAPI;
      T.turrets.forEach((tr) => {
        if (!T.armed) { if (tr.tele) tr.tele.visible = false; return; }
        tr.t -= dt;
        if (tr.state === 'idle') { if (tr.t <= 0) { tr.state = 'warn'; tr.t = tr.w; if (tr.tele) tr.tele.visible = true; } }
        else {
          if (tr.tele && tr.tele.userData.setProgress) tr.tele.userData.setProgress(1 - tr.t / tr.w);
          if (tr.t <= 0) {
            tr.state = 'idle'; tr.t = rnd(2.2, 3.6) / inten; if (tr.tele) tr.tele.visible = false;
            U().sfx('arrow');
            const dir = pos3(-tr.side, 0, 0);
            if (api && api.projectile && hasTHREE()) {
              safe(() => api.projectile({ pos: pos3(tr.x - tr.side * 0.8, 1.0, tr.z), dir, speed: 17, damage: tr.dmg, element: 'physique', radius: 0.45, life: 2.4, pierce: 0, owner: 'enemy', model: 'arrow', netLocal: true }));
            } else if (p && Math.abs(p.pos.z - tr.z) < 0.7) U().damagePlayer(tr.dmg, { element: 'physique', source: 'fleche' });
          }
        }
      });
    };
    traps.push(T);
    return T;
  }

  function updateTraps(dt) {
    const cr = U().roomRef();
    for (let i = traps.length - 1; i >= 0; i--) {
      const T = traps[i];
      if (T.owner && T.owner !== cr) { T.f.clear(); if (T.dispose) safe(() => T.dispose()); traps.splice(i, 1); continue; }
      if (T.update) safe(() => T.update(dt));
    }
  }

  // ------------------------------------------------------------------
  //  INTERRUPTEUR DE SALLE SECRÈTE (n'importe quelle salle hôte)
  // ------------------------------------------------------------------
  function swReady(run, rm) {
    const t = rm.type || (rm.boss ? 'boss' : 'combat');
    if (['combat', 'elite', 'chest', 'miniboss'].indexOf(t) >= 0) return run.roomState === 'cleared' || (run.roomState === undefined && enemyList().length === 0);
    if (t === 'trap' || t === 'event' || t === 'treasure') return cur ? cur.done || cur.t > 6 : true;
    return true;
  }
  /** Passage secret partagé : l'hôte l'ouvre, l'invité l'applique (même salle insérée chez tous) */
  function netRegSecret(rm) {
    const n = NET(); if (!n || !n.role || rm._netSecret) return;
    rm._netSecret = true;
    netReg('secret', {
      hostUse: () => { const run = U().run(); if (run && P().revealSecret(run, rm)) { netDone('secret'); U().banner('<b>' + bi('key', '🗝️') + ' Un passage secret s\'ouvre…</b>', 2.2); U().sfx('door'); if (sw && sw.room === rm) { sw.f.clear(); sw = null; } } },
      apply: () => {
        const run = U().run(); if (!run) return;
        P().revealSecret(run, rm);
        if (sw && sw.room === rm) { sw.f.clear(); sw = null; }
        if (rev && rev.room === rm && !rev.done) { rev.done = true; rev.f.clear(); }
        U().banner('<b>' + bi('key', '🗝️') + ' Un passage secret s\'ouvre…</b><br><small>La porte du nord mène à une salle cachée</small>', 2.4);
        U().sfx('door');
      },
    });
  }
  function updateSwitch(dt, run) {
    const rm = U().roomRef();
    if (swRoom !== rm) {
      if (sw && sw.f) sw.f.clear();
      sw = null; swRoom = rm;
      if (rm && rm.data && rm.data.secret && !rm.data.secret._revealed && !(rm.data.secret.data && rm.data.secret.data.reveal) && hasTHREE()) {
        const f = P().newField(rm);
        const sr = srng((rm.seed || 7) * 31 + 11);      // même position chez tous les joueurs (coop)
        const side = sr() < 0.5 ? -1 : 1, x = side * (HALF - 1.4), z = -6 + sr() * 10;
        const g = new THREE.Group(); g.position.set(x, 0, z);
        const rune = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 24), basicM(0x66ddff, 0.35)); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.06; g.add(rune);
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), basicM(0x66ddff, 0.5)); gem.position.set(side > 0 ? 0.6 : -0.6, 1.1, 0); g.add(gem);
        const prog = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), basicM(0xffffff, 0.5)); prog.rotation.x = -Math.PI / 2; prog.position.y = 0.07; prog.scale.setScalar(0.001); g.add(prog);
        f.add(g);
        sw = { f, x, z, g, rune, gem, prog, hold: 0, t: 0, hinted: false, room: rm };
        netRegSecret(rm);
      }
    }
    if (!sw || !run) return;
    sw.t += dt;
    const ready = swReady(run, sw.room);
    sw.rune.material.opacity = ready ? 0.3 + 0.25 * Math.sin(sw.t * 3) : 0;
    sw.gem.material.opacity = ready ? 0.45 + 0.25 * Math.sin(sw.t * 3 + 1) : 0;
    sw.gem.rotation.y += dt * 2;
    if (!ready) return;
    if (!sw.hinted && sw.room.data.secretHint) { sw.hinted = true; U().toast('🔎 ' + sw.room.data.secretHint); }
    const p = pl();
    if (!p || run.modal) return;
    const near = dist2(p, sw.x, sw.z) < 1.7;
    sw.hold = near ? sw.hold + dt : Math.max(0, sw.hold - dt * 2);
    sw.prog.scale.setScalar(Math.max(0.001, Math.min(1, sw.hold / 1.5)));
    if (sw.hold >= 1.5) {
      if (!netUse('secret')) { sw.hold = -2; U().toast('🔎 Mécanisme activé…'); return; }      // invité : l'hôte ouvre le passage pour tous
      const ok = P().revealSecret(run, sw.room);
      if (ok) netDone('secret');
      sw.f.clear(); sw = null;
      if (ok) {
        U().banner('<b>' + bi('key', '🗝️') + ' Un passage secret s\'ouvre…</b><br><small>La porte du nord mène à une salle cachée</small>', 2.4);
        U().sfx('door');
        if (G.core && G.core.shake) G.core.shake(0.3);
        fxBurst(p.pos, 0x66ddff, 26);
      }
    }
  }

  // ------------------------------------------------------------------
  //  ROOM TYPE : trap
  // ------------------------------------------------------------------
  G.RoomTypes.register('trap', {
    start(ctx) {
      const S = begin(ctx), d = S.data, r = rankIdx(S.run);
      const inten = d.intensity || 1 + r * 0.2;
      const kind = d.kind || 'spikes';
      S.traps = [];
      if (d.dungeonTrap && (d.traps || []).length) {
        (d.traps || []).forEach((id) => { const T = dungeonTrap(id, { intensity: inten * 1.15 }); if (T) { T.keepArmed = true; S.traps.push(T); } });
        if (hasTHREE() && r >= 2) S.traps.push(spikeField({ count: 4 + r, intensity: inten * 0.7 }));
        U().banner('<b>Salle piégée</b><br><small>' + d.traps.map(trapName).join(' · ') + ' — traversez jusqu\'à la porte du nord</small>', 2.8);
        setObj(S, 'Traversez la salle piégée');
        return;
      }
      if (hasTHREE()) {
        if (kind === 'spikes' || kind === 'mixed') S.traps.push(spikeField({ count: Math.round(9 + inten * 3), intensity: inten }));
        if (kind === 'blades' || kind === 'mixed') S.traps.push(bladeField({ count: kind === 'mixed' ? 2 : Math.min(3, 2 + Math.floor(inten / 2)), intensity: inten }));
        if (kind === 'arrows' || kind === 'mixed') S.traps.push(arrowField({ count: Math.min(4, 2 + Math.floor(inten / 1.5)), intensity: inten }));
      }
      const names = { spikes: 'dalles à pics', blades: 'lames tournantes', arrows: 'flèches murales', mixed: 'pièges variés' };
      U().banner('<b>Salle piégée</b><br><small>' + (names[kind] || '') + ' — traversez jusqu\'à la porte du nord</small>', 2.6);
      setObj(S, 'Traversez la salle piégée');
    },
    update(dt, ctx) {
      const S = cur; if (!S) return;
      runUpdate(S, dt);
      const p = pl();
      if (!S.done && p && p.pos.z < -(HALF - 4.5)) {
        S.done = true;
        S.traps.forEach((T) => { T.armed = false; });
        setObj(S, 'Salle franchie');
        reward(S, { gold: 25 + (S.data.reward === 'rich' ? 40 : 0), xp: 15, item: S.data.reward === 'rich' ? { p: 0.5, rarity: 'rare' } : null }, p.pos);
        U().banner('Piège déjoué !', 1.2);
      }
    },
    isCleared() { return !!(cur && cur.done); },
    end() { endCurrent(); },
  });

  // ------------------------------------------------------------------
  //  ROOM TYPE : treasure
  // ------------------------------------------------------------------
  G.RoomTypes.register('treasure', {
    start(ctx) {
      const S = begin(ctx), d = S.data, r = rankIdx(S.run);
      const n = d.chests || 2;
      S.chests = [];
      const base = (S.built && S.built.chestPos) || [0, -4];
      for (let i = 0; i < n; i++) {
        let x = base[0] + (i - (n - 1) / 2) * 5, z = base[1] + (i % 2 ? 2 : 0);
        [x, z] = U().freeSpot(S.built, x, z, 1.2);
        const c = hasTHREE() ? place(S, mkChest(), x, z, d.rich ? 'Grand coffre' : 'Coffre', '#ffd23f') : null;
        const mimic = G.rng.chance(typeof d.mimicChance === 'number' ? d.mimicChance : 0.1);   // 0 explicite = aucune mimique
        const ch = { x, z, mesh: c, opened: false, mimic, i };
        S.chests.push(ch);
        const key = 'tr' + i;
        addUsable(S, { x, z, r: 1.9, onUse: (S2, o) => { if (!ch.opened && netUse(key, S, o)) openTreasure(S, ch); } });
        netReg(key, { hostUse: () => openTreasure(S, ch), apply: (info) => openTreasure(S, ch, info) });
      }
      S.mimicPending = false;
      U().banner('<b>Salle au trésor</b><br><small>Ouvrez les coffres… si vous l\'osez</small>', 2.2);
      setObj(S, 'Ouvrez les coffres (0/' + n + ')');
    },
    update(dt) {
      const S = cur; if (!S) return;
      runUpdate(S, dt);
      const opened = S.chests.filter((c) => c.opened).length;
      if (!S.done) {
        setObj(S, aliveMine(S) > 0 ? 'Terrassez la mimique !' : 'Ouvrez les coffres (' + opened + '/' + S.chests.length + ')');
        if (opened === S.chests.length && aliveMine(S) === 0 && S.t > 1) { S.done = true; setObj(S, 'Salle nettoyée'); }
      }
      S.chests.forEach((c) => { if (c.mimic && c.mesh && c.mesh.userData.chomp > 0) c.mesh.userData.chomp -= dt; });
    },
    isCleared() { return !!(cur && cur.done); },
    end() { endCurrent(); },
  });
  /** remote : invité, l'hôte a ouvert ce coffre (info 'm' = mimique) → visuel + butin propre au joueur */
  function openTreasure(S, ch, remote) {
    if (ch.opened) return;
    ch.opened = true;
    if (remote !== undefined) ch.mimic = remote === 'm';
    else netDone('tr' + ch.i, ch.mimic ? 'm' : 1);
    if (ch.mesh) openChestVisual(ch.mesh);
    const p3 = pos3(ch.x, 1, ch.z), r = rankIdx(S.run), rich = S.data.rich;
    if (ch.mimic) {
      if (remote !== undefined) {      // la mimique est simulée par l'hôte (marionnette ici)
        U().banner('<b>C\'était une mimique !</b>', 1.5); U().sfx('chestBad');
        if (ch.mesh) ch.mesh.userData.chomp = 0.8;
        reward(S, { gold: 30 + 20 * r }, p3);
        return;
      }
      U().banner('<b>C\'était une mimique !</b>', 1.5);
      U().sfx('chestBad');
      if (G.core && G.core.shake) G.core.shake(0.4);
      if (ch.mesh) ch.mesh.userData.chomp = 0.8;
      spawnMobs(S, [monsterIds(S, true)[0]], { elite: true, near: [ch.x, ch.z] });
      reward(S, { gold: 30 + 20 * r }, p3);   // la mimique crache un peu d'or
      return;
    }
    U().sfx('chestOk');
    fxBurst(p3, 0xffd23f, 26);
    reward(S, { gold: (35 + 25 * r) * (rich ? 2 : 1), xp: 12 + 5 * r, item: { p: rich ? 0.6 : 0.18, rarity: rich ? 'epique' : 'rare' }, potion: 0.35 }, p3);
  }

  // ------------------------------------------------------------------
  //  ROOM TYPE : shrine
  // ------------------------------------------------------------------
  G.RoomTypes.register('shrine', {
    start(ctx) {
      const S = begin(ctx), d = S.data;
      const [x, z] = altarSpot(S);
      const Meta = G.ProcgenMeta;
      if (hasTHREE()) {
        const a = place(S, mkAltar(0x7ad8ff), x, z, 'Sanctuaire', '#9ae6ff');
        S.altar = a; spinOrb(S, a);
      }
      S.used = false;
      const costly = ((S.run.dungeon || {}).mechanics || []).indexOf('sanctuaires') >= 0;
      addUsable(S, { x, z, r: 2.1, onUse: () => useShrine(S, d, Meta, costly) });
      S.done = true;   // pacifique : la porte s'ouvre tout de suite
      U().banner('<b>Sanctuaire</b><br><small>Approchez de l\'autel pour recevoir une bénédiction</small>', 2.2);
      setObj(S, 'Recevez une bénédiction');
    },
    update(dt) { if (cur) runUpdate(cur, dt); },
    isCleared() { return !!(cur && cur.done); },
    end() { endCurrent(); },
  });
  function useShrine(S, d, Meta, costly) {
    if (S.used) return;
    const BL = Meta.blessings, lv = d.level || 1;
    const ids = (d.blessings && d.blessings.length ? d.blessings : ['vigueur', 'lame']);
    const cost = costly ? 0.1 : 0;
    const opts = ids.map((id) => ({ label: BL[id].name, desc: BL[id].desc(1 + 0.15 * lv) + (costly ? ' — prix : -10 % PV' : ''), value: id, icon: BL[id].icon }));
    opts.push({ label: 'Partir', desc: 'Ne rien prendre', value: null, icon: '🚪' });
    ask(S, 'Sanctuaire', opts, 'Une aura apaisante émane de l\'autel. Choisissez une bénédiction (durée limitée).').then((v) => {
      if (!v) return;
      const b = BL[v];
      S.used = true;
      if (cost) { const p = pl(); const amt = Math.min(Math.round(U().pvMax() * cost), Math.max(0, (p ? p.pv : 0) - 1)); if (amt > 0) U().damagePlayer(amt, { source: 'sanctuaire' }); }
      P().addBuff({ id: 'shrine_' + v, name: b.name, icon: b.icon, duration: 240, fx: b.fx(lv) });
      if (b.heal) U().heal(U().pvMax() * b.heal);
      U().notify(b.name + ' (4 min)', 'rare', b.icon);
      U().sfx('heal');
      const p = pl(); if (p) fxBurst(p.pos, 0x7ad8ff, 30);
      if (S.altar) dimAltar(S.altar);
      const u = S.usables[0]; if (u) u.disabled = true;
    });
  }

  // ------------------------------------------------------------------
  //  ROOM TYPE : choice
  // ------------------------------------------------------------------
  G.RoomTypes.register('choice', {
    start(ctx) {
      const S = begin(ctx), d = S.data;
      S.chosen = null;
      const opts = d.options || [];
      if (hasTHREE()) {
        opts.forEach((o, i) => {
          const x = (i === 0 ? -1 : 1) * 6.5, z = -6;
          const col = o.danger > 1 ? 0xff5a3a : 0x5aff9a;
          const g = new THREE.Group();
          const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.22, 8, 24, Math.PI), basicM(col, 0.9)); arch.position.y = 0.1; g.add(arch);
          const glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24, 0, Math.PI), basicM(col, 0.25)); glow.position.y = 0.1; g.add(glow);
          place(S, g, x, z, o.label, o.danger > 1 ? '#ff9a7a' : '#9affc0', 3.4);
          addAnim(S, (t) => { glow.material.opacity = 0.2 + 0.12 * Math.sin(t * 3 + i); });
        });
      }
      setObj(S, 'Choisissez votre chemin');
      after(S, 0.9, () => pick(S, d));
    },
    update(dt) { if (cur) runUpdate(cur, dt); },
    isCleared() { return !!(cur && cur.done); },
    end() { endCurrent(); },
  });
  function pick(S, d) {
    if (isGuest()) { setObj(S, 'Le chef du groupe choisit le chemin'); return; }      // coop : l'hôte choisit, la salle suivante arrive par le réseau
    const opts = d.options || [];
    if (!opts.length) { S.done = true; return; }
    const uiOpts = opts.map((o, i) => ({ label: o.label, desc: o.desc, value: i, icon: o.icon }));
    ask(S, d.prompt || 'Deux chemins s\'offrent à vous', uiOpts, 'Chaque chemin mène à des salles différentes avant de se rejoindre.').then((v) => {
      if (v === undefined || v === null) v = 1 % opts.length;      // fenêtre fermée : chemin « sûr »
      const o = opts[v] || opts[0];
      S.chosen = o;
      if (S.run) S.run.choicePath = o.id;
      P().insertAfter(S.run, S.def, o.rooms || []);
      U().banner('<b>' + (EMO_ICO[o.icon] ? bi(EMO_ICO[o.icon], o.icon) : o.icon) + ' ' + o.label + '</b><br><small>' + o.desc + '</small>', 2.2);
      U().sfx('door');
      S.done = true;
      setObj(S, 'Franchissez la porte du nord');
    });
  }

  // ------------------------------------------------------------------
  //  ROOM TYPE : secret
  // ------------------------------------------------------------------
  G.RoomTypes.register('secret', {
    start(ctx) {
      const S = begin(ctx), d = S.data, r = rankIdx(S.run);
      const [x, z] = altarSpot(S);
      S.opened = false;
      S.chest = hasTHREE() ? place(S, mkChest(), x, z, 'Reliquaire secret', '#66ddff') : null;
      S.cx = x; S.cz = z; S.locked = false;
      if (d.guardian) {
        S.locked = true;
        spawnMobs(S, [monsterIds(S, true)[0]], { elite: true });
        U().banner('<b>' + bi('key', '🗝️') + ' Salle secrète</b><br><small>Un gardien veille sur le reliquaire !</small>', 2.4);
      } else U().banner('<b>' + bi('key', '🗝️') + ' Salle secrète</b><br><small>Un reliquaire vous attend</small>', 2.4);
      addUsable(S, { x, z, r: 2.0, onUse: (S2, o) => { if (S.locked && !isGuest()) { U().toast('Le reliquaire est scellé tant que le gardien vit'); return; } if (!S.opened && netUse('sec', S, o)) openSecret(S); } });
      netReg('sec', { hostUse: () => { if (S.locked) return; openSecret(S); }, apply: () => openSecret(S, true) });
      // v5 : la créature secrète du donjon n'apparaît qu'ici (comportement propre : disparaît ou offre un présent)
      if (d.creature && G.SkillAPI && G.SkillAPI.spawnEnemy && hasTHREE() && (G.MONSTERS && G.MONSTERS[d.creature])) {
        after(S, 1.6, () => {
          const s2 = randFree(S.built, 0.8, -HALF + 3, -2);
          const e = safe(() => G.SkillAPI.spawnEnemy(d.creature, new THREE.Vector3(s2[0], 0, s2[1]), {}), null);
          if (e) { S.creature = e; e._secretRoom = S; horrorEv('creature_secrete'); U().toast('… Vous n\'êtes pas seul ici.'); }
        });
      }
      setObj(S, S.locked ? 'Vainquez le gardien' : 'Ouvrez le reliquaire');
    },
    update(dt) {
      const S = cur; if (!S) return;
      runUpdate(S, dt);
      if (S.locked && S.t > 1 && aliveMine(S) === 0) { S.locked = false; setObj(S, 'Ouvrez le reliquaire'); }
    },
    isCleared() { return !!(cur && cur.done); },
    end() { endCurrent(); },
  });
  function openSecret(S, remote) {
    if (S.opened) return;
    S.opened = true;
    if (!remote) netDone('sec');
    if (S.chest) openChestVisual(S.chest);
    const r = rankIdx(S.run), p3 = pos3(S.cx, 1, S.cz), tier = S.data.tier || 'rare';
    U().sfx('chestOk');
    fxBurst(p3, 0x66ddff, 40);
    if (G.core && G.core.shake) G.core.shake(0.3);
    reward(S, { gold: 90 + 70 * r, xp: 40 + 25 * r, potion: 0.5 }, p3);
    if (!U().giveItem(tier)) U().giveGold(60 + 40 * r, p3);
    P().addBuff({ id: 'faveur_secrete', name: 'Faveur secrète', icon: '🗝️', duration: 300, fx: { dmgDealt: 1.1, xp: 1.15 } });
    const pr = U().profile(); if (pr) { pr.stats = pr.stats || {}; pr.stats.secrets = (pr.stats.secrets || 0) + 1; }
    if (S.run) { S.run.secretsFound = (S.run.secretsFound || 0) + 1; if (S.run.stats && typeof S.run.stats.secretsFound === 'number') S.run.stats.secretsFound++; }
    G.bus.emit('secretFound', { run: S.run });
    U().save();
    U().banner('<b>Secret découvert !</b>', 1.6);
    S.done = true;
  }

  // ------------------------------------------------------------------
  //  ROOM TYPE : event (dispatch par data.kind)
  // ------------------------------------------------------------------
  const EV = {};
  G.RoomTypes.register('event', {
    start(ctx) {
      const S = begin(ctx);
      const kind = S.data.kind || 'fountain';
      S.kind = kind; S.rng = G.Procgen.makeRng(S.data.seed || 1);
      const h = EV[kind] || EV.fountain;
      const meta = G.ProcgenMeta.eventKinds[kind];
      if (meta && meta.rare) U().banner('<b>' + bi('sparkles', '✨') + ' Événement rare : ' + meta.name + '</b>', 2.8);
      h.start(S);
    },
    update(dt) {
      const S = cur; if (!S) return;
      runUpdate(S, dt);
      const h = EV[S.kind]; if (h && h.update) h.update(S, dt);
    },
    isCleared() { return !!(cur && cur.done); },
    end() { endCurrent(); },
  });

  // ---- marchand errant ----
  EV.merchant = {
    start(S) {
      const [x, z] = altarSpot(S);
      if (hasTHREE()) place(S, mkNpc(0x4a6a8a, 0x8a3a5a), x, z, 'Marchand errant', '#ffe08a');
      const r = rankIdx(S.run), pm = 1 + 0.45 * r;
      const pool = [
        { label: 'Potion de soin', icon: '❤️', desc: 'Une potion de soin', price: 40, give: () => U().addPotion('Potion de soin', 1) },
        { label: 'Potion de mana', icon: '💧', desc: 'Une potion de mana', price: 35, give: () => U().addPotion('Potion de mana', 1) },
        { label: 'Élixir de puissance', icon: '⚗️', desc: '+20 % de dégâts (4 min)', price: 110, give: () => P().addBuff({ id: 'm_pow', name: 'Élixir de puissance', icon: '⚗️', duration: 240, fx: { dmgDealt: 1.2 } }) },
        { label: 'Rune de garde', icon: '🔰', desc: '-15 % de dégâts subis (4 min)', price: 110, give: () => P().addBuff({ id: 'm_guard', name: 'Rune de garde', icon: '🔰', duration: 240, fx: { dmgTaken: 0.85 } }) },
        { label: 'Soin complet', icon: '💖', desc: 'Restaure tous vos PV', price: 70, give: () => U().heal(U().pvMax()) },
        { label: 'Objet mystérieux', icon: '🎁', desc: 'Un équipement rare', price: 190, give: () => U().giveItem('rare'), needs: () => !!(G.Inventory && G.Inventory.generate) },
        { label: 'Tome de savoir', icon: '📘', desc: '+30 % d\'XP (5 min)', price: 100, give: () => P().addBuff({ id: 'm_xp', name: 'Tome de savoir', icon: '📘', duration: 300, fx: { xp: 1.3 } }) },
      ].filter((o) => !o.needs || o.needs());
      S.stock = S.rng.shuffle(pool).slice(0, 3).map((o) => Object.assign({}, o, { price: Math.round(o.price * pm / 5) * 5, sold: false }));
      S.done = true;
      addUsable(S, { x, z, r: 2.4, onUse: () => EV.merchant.shop(S) });
      U().banner('<b>' + bi('shop', '🧙') + ' Marchand errant</b><br><small>Approchez pour voir sa marchandise</small>', 2.2);
      setObj(S, 'Un marchand vous propose ses services');
    },
    shop(S) {
      const pr = U().profile();
      const opts = S.stock.filter((o) => !o.sold).map((o, i) => ({ label: o.label + ' — ' + o.price + ' or', desc: o.desc + ((pr && pr.gold < o.price) ? ' (or insuffisant)' : ''), value: S.stock.indexOf(o), icon: o.icon }));
      opts.push({ label: 'Partir', desc: 'Prendre congé', value: -1, icon: '🚪' });
      ask(S, 'Marchand errant', opts, 'Vous avez ' + (pr ? pr.gold : 0) + ' or.').then((v) => {
        if (v === undefined || v === null || v < 0) return;
        const o = S.stock[v];
        if (!o || o.sold) return;
        const p = U().profile();
        if (!p || p.gold < o.price) { U().toast('Pas assez d\'or'); U().sfx('error'); return EV.merchant.shop(S); }
        p.gold -= o.price; if (S.run && typeof S.run.goldGained === 'number') S.run.goldGained -= 0;
        o.sold = true; o.give(); U().sfx('pickup'); U().save();
        U().notify(o.label + ' acheté', 'rare', o.icon);
        if (S.stock.some((x) => !x.sold)) EV.merchant.shop(S);
      });
    },
  };

  // ---- autel du pacte ----
  EV.pact = {
    start(S) {
      const [x, z] = altarSpot(S);
      if (hasTHREE()) { const a = place(S, mkAltar(0xff3a4a), x, z, 'Autel du pacte', '#ff8a8a'); S.altar = a; spinOrb(S, a, 2.5); }
      S.used = false; S.done = true;
      addUsable(S, { x, z, r: 2.1, onUse: () => EV.pact.use(S) });
      U().banner('<b>' + bi('skull', '🩸') + ' Autel du pacte</b><br><small>Le sang appelle le pouvoir…</small>', 2.2);
      setObj(S, 'Un autel réclame votre sang');
    },
    use(S) {
      if (S.used) return;
      const p = pl(), pvMax = U().pvMax(), pv = p ? p.pv : pvMax, r = rankIdx(S.run);
      const mk = (pct, label, icon, desc, fn) => ({ label: label + ' (-' + Math.round(pct * 100) + ' % PV)', desc, value: { pct, fn }, icon, bad: pv - pvMax * pct < 1 });
      const opts = [
        mk(0.3, 'Pacte de sang', '🩸', '+35 % de dégâts jusqu\'à la fin du donjon', () => P().addBuff({ id: 'pact_blood', name: 'Pacte de sang', icon: '🩸', duration: null, fx: { dmgDealt: 1.35 } })),
        mk(0.2, 'Pacte d\'or', '🪙', 'Or immédiat et +30 % d\'or', () => { U().giveGold(80 + 70 * r, p && p.pos); P().addBuff({ id: 'pact_gold', name: 'Pacte d\'or', icon: '🪙', duration: null, fx: { gold: 1.3 } }); }),
        mk(0.25, 'Pacte d\'ombre', '🌑', 'Un équipement rare', () => { if (!U().giveItem('rare')) U().giveXP(120 + 80 * r); }),
      ].filter((o) => !o.bad);
      const all = opts.map((o) => ({ label: o.label, desc: o.desc, value: o.value, icon: o.icon }));
      all.push({ label: 'Refuser', desc: 'Ne rien sacrifier', value: null, icon: '🚪' });
      if (!opts.length) { U().toast('Vous êtes trop faible pour un pacte'); return; }
      ask(S, 'Autel du pacte', all, 'Sacrifiez une part de votre vitalité en échange d\'un pouvoir.').then((v) => {
        if (!v) return;
        S.used = true;
        const amt = Math.min(Math.round(pvMax * v.pct), Math.max(0, (pl() ? pl().pv : pv) - 1));
        if (amt > 0) U().damagePlayer(amt, { source: 'pacte' });
        v.fn();
        U().sfx('chestBad');
        if (G.core && G.core.shake) G.core.shake(0.3);
        if (S.altar) dimAltar(S.altar);
        const u = S.usables[0]; if (u) u.disabled = true;
      });
    },
  };

  // ---- fontaine ----
  EV.fountain = {
    start(S) {
      const [x, z] = altarSpot(S);
      const variant = S.rng.pick(['vie', 'vie', 'mana', 'maudite']);
      S.variant = variant;
      const col = variant === 'mana' ? 0x4aa8ff : variant === 'maudite' ? 0x9a3aff : 0x4aff8a;
      if (hasTHREE()) { const a = place(S, mkAltar(col), x, z, variant === 'maudite' ? 'Fontaine trouble' : 'Fontaine', '#bdf'); S.altar = a; spinOrb(S, a, 1); }
      S.used = false; S.done = true;
      addUsable(S, { x, z, r: 2.1, onUse: () => EV.fountain.use(S) });
      setObj(S, 'Une fontaine scintille');
    },
    use(S) {
      if (S.used) return;
      const v = S.variant;
      const desc = v === 'vie' ? 'Eau claire : soigne 45 % des PV.' : v === 'mana' ? 'Eau bleutée : restaure tout votre mana et soigne 15 %.' : 'Eau trouble : peut soigner entièrement… ou vous empoisonner.';
      ask(S, 'Fontaine', [{ label: 'Boire', desc, value: 'boire', icon: '💧' }, { label: 'Partir', desc: 'Passer son chemin', value: null, icon: '🚪' }]).then((c) => {
        if (!c) return;
        S.used = true;
        const pvMax = U().pvMax();
        if (v === 'vie') U().heal(pvMax * 0.45);
        else if (v === 'mana') { U().heal(pvMax * 0.15); if (G.SkillAPI && G.SkillAPI.restoreMana) G.SkillAPI.restoreMana(9999); }
        else if (G.rng.chance(0.5)) { U().heal(pvMax); U().notify('L\'eau trouble vous régénère !', 'epique', '💜'); }
        else {
          const p = pl(); const amt = Math.min(Math.round(pvMax * 0.15), Math.max(0, (p ? p.pv : 10) - 1)); if (amt) U().damagePlayer(amt, { element: 'poison', source: 'fontaine' });
          P().addBuff({ id: 'fountain_curse', name: 'Eau maudite', icon: '☠️', duration: 90, fx: { dmgTaken: 1.15 } });
          U().notify('L\'eau était maudite… (-15 % PV, +15 % dégâts subis 90 s)', 'commun', '☠️');
        }
        U().sfx('heal'); const p = pl(); if (p) fxBurst(p.pos, 0x4aff8a, 24);
        if (S.altar) dimAltar(S.altar);
        const u = S.usables[0]; if (u) u.disabled = true;
      });
    },
  };

  // ---- défi chronométré ----
  EV.timed = {
    start(S) {
      const r = rankIdx(S.run);
      S.count = 6 + Math.round(r * 1.5);
      S.limit = 28 + S.count * 1.5;
      S.phase = 'wait'; S.tl = S.limit; S.ok = false;
      U().banner('<b>' + bi('timer', '⏳') + ' Défi chronométré</b><br><small>Tuez-les tous en ' + Math.round(S.limit) + ' s pour une grosse récompense !</small>', 2.6);
      setObj(S, 'Préparez-vous…');
      after(S, 2.4, () => {
        const ids = []; const pool = monsterIds(S, false);
        for (let i = 0; i < S.count; i++) ids.push(pool[i % pool.length]);
        spawnMobs(S, ids, {});
        S.phase = 'fight';
      });
    },
    update(S, dt) {
      if (S.phase !== 'fight' || S.done) return;
      const alive = aliveMine(S);
      S.tl -= dt;
      setObj(S, alive > 0 ? 'Défi : ' + alive + ' ennemis — ' + Math.max(0, Math.ceil(S.tl)) + ' s' : 'Défi terminé');
      if (alive === 0 && S.t > 3.5) {
        S.done = true;
        const p = pl(), r = rankIdx(S.run);
        if (S.tl > 0) {
          U().banner('<b>Défi réussi !</b>', 1.8);
          reward(S, { gold: 70 + 45 * r, xp: 40 + 20 * r, item: { p: 0.55, rarity: 'rare' }, potion: 0.6 }, p && p.pos);
          if (p) fxBurst(p.pos, 0xffd23f, 36);
        } else {
          U().banner('Temps écoulé…<br><small>Pas de récompense, mais pas de pénalité</small>', 1.8);
          reward(S, { gold: 12 + 6 * r }, p && p.pos);
        }
      }
    },
  };

  // ---- embuscade ----
  EV.ambush = {
    start(S) {
      const [x, z] = altarSpot(S);
      S.cx = x; S.cz = z; S.phase = 'bait';
      if (hasTHREE()) S.bait = place(S, mkChest(), x, z, 'Coffre', '#ffd23f');
      addUsable(S, { x, z, r: 1.9, onUse: () => EV.ambush.spring(S) });
      U().banner('<b>Un coffre sans surveillance…</b><br><small>Trop beau pour être vrai ?</small>', 2.2);
      setObj(S, 'Ouvrez le coffre');
    },
    spring(S) {
      if (S.phase !== 'bait') return;
      S.phase = 'wave1';
      if (S.bait) openChestVisual(S.bait);
      U().banner('<b>EMBUSCADE !</b>', 1.4); U().sfx('bossRoar');
      if (G.core && G.core.shake) G.core.shake(0.4);
      const r = rankIdx(S.run), pool = monsterIds(S, false), ids = [];
      for (let i = 0; i < 4 + r; i++) ids.push(pool[i % pool.length]);
      spawnMobs(S, ids, {});
      S.wave2 = false;
    },
    update(S) {
      if (S.phase === 'bait' && S.t > 16) EV.ambush.spring(S);
      if (S.phase === 'wave1' && S.t > 2 && aliveMine(S) === 0 && !S.wave2) {
        S.wave2 = true; S.phase = 'wave2';
        const e = monsterIds(S, true)[0];
        spawnMobs(S, [e], { elite: true }); spawnMobs(S, [monsterIds(S, false)[0], monsterIds(S, false)[0]], {});
        U().toast('Les renforts arrivent !');
      } else if (S.phase === 'wave2' && S.t > 2 && aliveMine(S) === 0) {
        S.phase = 'end'; S.done = true;
        const p3 = pos3(S.cx, 1, S.cz), r = rankIdx(S.run);
        reward(S, { gold: 80 + 50 * r, xp: 35 + 18 * r, item: { p: 0.4, rarity: 'rare' }, potion: 0.5 }, p3);
        fxBurst(p3, 0xffd23f, 30); U().banner('Embuscade déjouée !', 1.4);
      }
      if (!S.done) setObj(S, S.phase === 'bait' ? 'Ouvrez le coffre' : 'Survivez à l\'embuscade (' + aliveMine(S) + ')');
    },
  };

  // ---- statue à énigme ----
  const RIDDLES = [
    { q: 'Plus on m\'enlève de choses, plus je deviens grand. Que suis-je ?', a: 'Un trou', w: ['Une ombre', 'Un feu'] },
    { q: 'J\'ai des villes sans maisons, des forêts sans arbres et des rivières sans eau. Que suis-je ?', a: 'Une carte', w: ['Un rêve', 'Un tableau'] },
    { q: 'Je parle sans bouche et j\'entends sans oreilles. Que suis-je ?', a: 'Un écho', w: ['Un fantôme', 'Le vent'] },
    { q: 'Plus il y en a, moins on voit. Qu\'est-ce ?', a: 'L\'obscurité', w: ['Le brouillard doré', 'La poussière'] },
    { q: 'Je suis toujours devant toi, mais tu ne peux jamais me voir. Que suis-je ?', a: 'L\'avenir', w: ['Ton ombre', 'Un mur'] },
  ];
  function genRiddle(rng) {
    const t = rng.int(0, 7);
    if (t < 3) return RIDDLES[rng.int(0, RIDDLES.length - 1)];
    if (t === 3 || t === 4) {
      const a = rng.int(2, 9), d = rng.int(2, 7), s = [a, a + d, a + 2 * d, a + 3 * d], ans = a + 4 * d;
      return { q: 'Quel nombre complète la suite : ' + s.join(', ') + ', ? ', a: String(ans), w: [String(ans + d), String(ans - 1)] };
    }
    if (t === 5) {
      const a = rng.int(2, 4), s = [a, a * 2, a * 4, a * 8], ans = a * 16;
      return { q: 'Quel nombre complète la suite : ' + s.join(', ') + ', ? ', a: String(ans), w: [String(ans - a * 4), String(ans + a * 2)] };
    }
    const a = rng.int(3, 9), b = rng.int(3, 9), c = rng.int(2, 9), ans = a + b * c;
    return { q: 'Combien font ' + a + ' + ' + b + ' × ' + c + ' ?', a: String(ans), w: [String((a + b) * c), String(ans + b)] };
  }
  EV.riddle = {
    start(S) {
      const [x, z] = altarSpot(S);
      if (hasTHREE()) { const st = place(S, mkStatue(), x, z, 'Statue énigmatique', '#9ae6ff', 3.6); S.statue = st; }
      S.riddle = genRiddle(S.rng); S.used = false; S.phase = 'idle';
      addUsable(S, { x, z, r: 2.4, onUse: () => EV.riddle.use(S) });
      U().banner('<b>' + bi('scroll', '🗿') + ' La statue vous parle…</b><br><small>Répondez juste pour être récompensé</small>', 2.2);
      setObj(S, 'Répondez à l\'énigme de la statue');
      S.cx = x; S.cz = z;
    },
    use(S) {
      if (S.used) return;
      const rd = S.riddle;
      const opts = S.rng.shuffle([rd.a, rd.w[0], rd.w[1]]).map((t) => ({ label: t, desc: '', value: t, icon: '❔' }));
      ask(S, 'Énigme', opts, rd.q).then((v) => {
        if (v === undefined) return;
        S.used = true;
        const r = rankIdx(S.run), p = pl();
        if (v === rd.a) {
          U().banner('<b>Bonne réponse !</b>', 1.6); U().sfx('chestOk');
          reward(S, { gold: 60 + 35 * r, xp: 40 + 20 * r, item: { p: 0.35, rarity: 'rare' }, potion: 0.5 }, p && p.pos);
          if (p) fxBurst(p.pos, 0x9ae6ff, 28);
          S.done = true;
        } else {
          U().banner('<b>Mauvaise réponse…</b><br><small>La statue s\'anime !</small>', 1.8); U().sfx('bossRoar');
          if (G.core && G.core.shake) G.core.shake(0.4);
          S.phase = 'angry';
          const pool = monsterIds(S, false); spawnMobs(S, [pool[0], pool[pool.length - 1], monsterIds(S, true)[0]], { near: [S.cx, S.cz] });
        }
        const u = S.usables[0]; if (u) u.disabled = true;
      });
    },
    update(S) { if (S.phase === 'angry' && S.t > 1 && aliveMine(S) === 0 && !S.done) { S.done = true; U().banner('La statue est apaisée.', 1.2); } },
  };

  // ---- fantôme à protéger ----
  EV.ghost = {
    start(S) {
      const [x, z] = altarSpot(S, 0, 4);
      S.gx = x; S.gz = z; S.gpv = 100; S.gmax = 100; S.wave = 0; S.phase = 'wait';
      if (hasTHREE()) { S.gm = place(S, mkGhost(), x, z, 'Fantôme égaré', '#cfe8ff', 3); addAnim(S, (t) => { if (S.gm) S.gm.position.y = 0.4 + 0.2 * Math.sin(t * 2); }); }
      U().banner('<b>' + bi('skull', '👻') + ' Un fantôme implore votre aide</b><br><small>Gardez les monstres loin de lui !</small>', 2.6);
      setObj(S, 'Protégez le fantôme');
      after(S, 2.5, () => EV.ghost.nextWave(S));
    },
    nextWave(S) {
      if (S.wave >= 3) return;
      S.wave++;
      const r = rankIdx(S.run), pool = monsterIds(S, false), ids = [];
      for (let i = 0; i < 3 + r + S.wave; i++) ids.push(pool[i % pool.length]);
      spawnMobs(S, ids, { near: [S.gx, S.gz] });
      S.phase = 'fight'; U().toast('Vague ' + S.wave + ' / 3');
    },
    update(S, dt) {
      if (S.done) return;
      const r = rankIdx(S.run);
      if (S.phase === 'fight' || S.phase === 'wait') {
        const near = S.mine.filter((e) => !e.dead && e.pos && Math.hypot(e.pos.x - S.gx, e.pos.z - S.gz) < 3.2).length;
        if (near) { S.gpv -= near * (4 + r) * dt; if (S.gm && G.fx && G.fx.text && Math.floor(S.t * 2) % 2 === 0 && G.rng.chance(0.05)) safe(() => G.fx.text(pos3(S.gx, 2.6, S.gz), '-', '#ff6666', 0.9)); }
        const p = pl();
        if (p && dist2(p, S.gx, S.gz) < 2.5 && S.gpv < S.gmax) S.gpv = Math.min(S.gmax, S.gpv + 3 * dt);
        if (S.gm) S.gm.traverse((m) => { if (m.material && m.material.opacity != null) m.material.opacity = 0.35 + 0.4 * Math.max(0, S.gpv / S.gmax); });
        setObj(S, 'Fantôme : ' + Math.max(0, Math.round(S.gpv)) + ' %');
        if (S.gpv <= 0) {
          S.done = true; S.phase = 'lost';
          if (S.gm) S.gm.visible = false;
          U().banner('<b>Le fantôme s\'est évanoui…</b>', 1.8);
          S.mine.forEach((e) => { /* les monstres restants restent à tuer */ });
          S.done = false; S.phase = 'cleanup';
        } else if (S.phase === 'fight' && S.t > 3 && aliveMine(S) === 0) {
          if (S.wave < 3) after(S, 1.4, () => EV.ghost.nextWave(S)), S.phase = 'wait';
          else {
            S.done = true; S.phase = 'won';
            U().banner('<b>Le fantôme vous remercie !</b>', 2);
            const pp = pl();
            reward(S, { gold: 75 + 40 * r, xp: 50 + 20 * r, item: { p: 0.35, rarity: 'rare' } }, pp && pp.pos);
            P().addBuff({ id: 'ghost_blessing', name: 'Bénédiction spectrale', icon: '👻', duration: 240, fx: { dmgDealt: 1.15, speed: 1.08 } });
          }
        }
      } else if (S.phase === 'cleanup' && aliveMine(S) === 0) { S.done = true; }
    },
  };

  // ---- pluie d'or (rare) ----
  EV.goldrain = {
    start(S) {
      S.coins = []; S.tspawn = 0; S.dur = 15; S.phase = 'rain';
      S.val = 5 + 3 * rankIdx(S.run);
      U().banner('<b>' + bi('gold', '🌧️') + ' PLUIE D\'OR !</b><br><small>Ramassez un maximum de pièces !</small>', 2.6);
      setObj(S, 'Ramassez les pièces !');
      S.done = false;
    },
    update(S, dt) {
      const p = pl();
      if (S.t < S.dur && hasTHREE()) {
        S.tspawn -= dt;
        while (S.tspawn <= 0 && S.coins.length < 70) {
          S.tspawn += 0.14;
          const [x, z] = randFree(S.built, 0.4);
          const m = mkCoin(); m.position.set(x, 9, z); S.f.add(m);
          S.coins.push({ m, x, z, y: 9, vy: 0, landed: false, age: 0 });
        }
      }
      for (let i = S.coins.length - 1; i >= 0; i--) {
        const c = S.coins[i];
        if (!c.landed) { c.vy -= 22 * dt; c.y += c.vy * dt; if (c.y <= 0.4) { c.y = 0.4; c.landed = true; } c.m.position.y = c.y; }
        else c.age += dt;
        c.m.rotation.y += 5 * dt;
        let take = false;
        if (p && c.landed) {
          const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
          if (d < 3) { c.x += (p.pos.x - c.x) * Math.min(1, 6 * dt); c.z += (p.pos.z - c.z) * Math.min(1, 6 * dt); c.m.position.x = c.x; c.m.position.z = c.z; }
          if (d < 1.1) take = true;
        }
        if (take) { U().giveGold(S.val, null); U().sfx('gold'); S.f.group && S.f.group.remove(c.m); S.coins.splice(i, 1); S.got = (S.got || 0) + S.val; }
        else if (c.age > 9) { S.f.group && S.f.group.remove(c.m); S.coins.splice(i, 1); }
      }
      if (S.t >= S.dur && !S.done && S.coins.filter((c) => c.landed).length === 0) { S.done = true; U().banner('Pluie d\'or terminée : <b>+' + (S.got || 0) + ' or</b>', 2); }
      else if (S.t >= S.dur + 8 && !S.done) S.done = true;
    },
  };

  // ---- source primordiale (rare) ----
  EV.spring = {
    start(S) {
      const [x, z] = altarSpot(S);
      if (hasTHREE()) { const a = place(S, mkAltar(0xfff2a0), x, z, 'Source primordiale', '#fff2a0'); S.altar = a; spinOrb(S, a, 1); }
      S.used = false; S.done = true;
      addUsable(S, { x, z, r: 2.2, onUse: () => {
        if (S.used) return; S.used = true;
        U().heal(U().pvMax()); if (G.SkillAPI && G.SkillAPI.restoreMana) G.SkillAPI.restoreMana(9999);
        P().addBuff({ id: 'spring', name: 'Souffle primordial', icon: '🌟', duration: 300, fx: { dmgDealt: 1.2, pvMax: 1.2, xp: 1.3, cdr: 0.1 } });
        U().notify('Souffle primordial (5 min)', 'legendaire', '🌟'); U().sfx('levelup');
        const p = pl(); if (p) fxBurst(p.pos, 0xfff2a0, 50);
        if (S.altar) dimAltar(S.altar);
      } });
      setObj(S, 'Une source de pouvoir ancestral');
    },
  };

  // ---- sceaux gardiens (mécanique gardien_sceaux) ----
  EV.seals = {
    start(S) {
      const n = S.data.count || 3;
      S.seals = [];
      for (let i = 0; i < n; i++) {
        const [x, z] = randFree(S.built, 1.6, -8, 4, 10);
        const g = hasTHREE() ? place(S, mkSeal(0xb46bff), x, z, 'Sceau', '#d9a8ff', 3) : null;
        if (g) addAnim(S, (t) => { g.userData.orb.rotation.y = t * 2; });
        S.seals.push({ x, z, g, hold: 0, done: false, spawned: false });
      }
      U().banner('<b>' + bi('rune', '🔮') + ' Sceaux gardiens</b><br><small>Restez sur chaque sceau pour le purifier</small>', 2.6);
      setObj(S, 'Purifiez les sceaux (0/' + n + ')');
    },
    update(S, dt) {
      if (S.done) return;
      const p = pl(); const r = rankIdx(S.run);
      let doneN = 0;
      S.seals.forEach((s) => {
        if (s.done) { doneN++; return; }
        const near = p && dist2(p, s.x, s.z) < 1.8 && !(S.run && S.run.modal);
        if (near && !s.spawned) { s.spawned = true; const pool = monsterIds(S, false), ids = []; for (let i = 0; i < 2 + Math.floor(r / 2); i++) ids.push(pool[i % pool.length]); spawnMobs(S, ids, { near: [s.x, s.z] }); }
        s.hold = near ? s.hold + dt : Math.max(0, s.hold - dt);
        if (s.g && s.g.userData.fill) s.g.userData.fill.scale.setScalar(Math.max(0.001, s.hold / 2.2));
        if (s.hold >= 2.2) { s.done = true; doneN++; if (s.g) { s.g.userData.orb.material.color.setHex(0x66ff99); } U().sfx('chestOk'); fxBurst(pos3(s.x, 1, s.z), 0x66ff99, 20); }
      });
      setObj(S, 'Purifiez les sceaux (' + doneN + '/' + S.seals.length + ')');
      if (doneN === S.seals.length && aliveMine(S) === 0) { S.done = true; U().banner('Les sceaux sont brisés !<br><small>La voie du boss est libre</small>', 2); }
    },
  };


  // ==================================================================
  //  v5 (agent 5) — PIÈGES ET MÉCANISMES PROPRES À CHAQUE DONJON
  //  Les salles de combat portent rd.data.traps = [id] (pièges ambiants, désarmés à la fin du combat) ;
  //  les salles 'trap' d'un donjon v5 portent data.dungeonTrap + data.traps. Chaque id a un moteur (TRAP_DEF)
  //  qui s'appuie sur la salle construite (room.mech de js/gfx/dungeon-themes.js : lustres, rails, niches,
  //  eau, canaux, évents, statues...) et retombe sur des positions libres sinon.
  // ==================================================================
  const SND_FB = { eboulement: 'slam', wagonnet: 'boom', grisou: 'boom', racines: 'hit', os_qui_roulent: 'spawn', lustre_chute: 'slam', porte_claque: 'door', armure_grince: 'spawn',
    eau_monte: 'fizzle', cloche: 'bossRoar', lame_pendule: 'swing', glyphe: 'fire', neon_grille: 'fizzle', faille: 'spawn', pages: 'swing', glace_craque: 'hit', veine_pulse: 'hit',
    geyser_lave: 'fire', chaine: 'swing', etoile_filante: 'boom', orgue_barbarie: 'spawn', mur_fissure: 'hit', levier: 'door', secret_trouve: 'chestOk', murmure: 'spawn' };
  function snd(name, x, z) {
    try { if (G.Audio && G.Audio.at && x != null) { G.Audio.at(name, x, z); return; } if (G.Audio && G.Audio.play) { G.Audio.play(name); return; } } catch (e) { /* repli */ }
    U().sfx(SND_FB[name] || 'hit');
  }
  const builtRoom = () => { const r = U().run(); return r && r.room; };
  const mechOf = () => { const b = builtRoom(); return (b && b.mech) || {}; };
  const curRank = () => rankIdx(U().run());
  const shake = (a) => { if (G.core && G.core.shake) G.core.shake(a); };
  const horrorEv = (id) => { try { G.bus.emit('horrorEvent', { id, source: 'piege' }); } catch (e) { /* rien */ } };
  function nearSpot(p, d) {
    const b = builtRoom();
    for (let k = 0; k < 20; k++) {
      const a = rnd(0, Math.PI * 2), r = rnd(0, d), x = (p ? p.pos.x : 0) + Math.cos(a) * r, z = (p ? p.pos.z : 0) + Math.sin(a) * r;
      if (!blocked(b, x, z, 0.6) && !(Math.abs(x) < 2.5 && z < -HALF + 4)) return [x, z];
    }
    return randFree(b, 0.6);
  }
  // objet qui tombe (rocher, stalactite, lustre, éclat, étoile) puis reste au sol
  function fallMesh(f, kind, x, z, color) {
    if (!hasTHREE() || !f) return null;
    let m;
    if (kind === 'stalactite') m = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6), toonM(color || 0xa8d8f0));
    else if (kind === 'eclat') m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), basicM(color || 0x6ad8ff, 0.9));
    else if (kind === 'braise' || kind === 'etoile') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), basicM(color || 0xff8a2a, 1));
    else m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), toonM(color || 0x4a3e34));
    if (kind === 'stalactite') m.rotation.x = Math.PI;
    m.userData.own = true;
    m.position.set(x, 9, z); f.add(m);
    return m;
  }

  // définition des pièges : type de moteur + paramètres
  const TRAP_DEF = {
    // MINE
    eboulement: { eng: 'fall', fall: 'rocher', every: [3.5, 5.5], r: 1.8, pct: 0.11, near: 3, sound: 'eboulement', color: 0x4a3e34, n: 2 },
    wagonnet_fou: { eng: 'cart', every: [7, 10], pct: 0.16, sound: 'wagonnet' },
    poche_grisou: { eng: 'pulse', spots: 'vents', every: [4, 6], r: 1.7, pct: 0.12, element: 'feu', color: 0x9aff5a, sound: 'grisou', n: 2 },
    lanternes_soufflees: { eng: 'dark', every: [11, 16], dur: [2.5, 3.5], sound: 'murmure' },
    // FORÊT
    racines_saisissantes: { eng: 'root', every: [6, 9], r: 1.5, root: 1.3, pct: 0.06, color: 0x6a4a2a, sound: 'racines' },
    brume_rampante: { eng: 'dark', every: [12, 18], dur: [4, 5], soft: 0.35, sound: 'murmure' },
    champignons_spores: { eng: 'pulse', spots: 'spores', every: [4.5, 6.5], r: 2.1, pct: 0.06, element: 'poison', color: 0x9affc0, cloud: 5, sound: 'grisou', n: 1 },
    piege_a_loup: { eng: 'hidden', count: 5, r: 0.8, root: 1.6, pct: 0.09, color: 0x8a8a90, sound: 'racines' },
    // CATACOMBES
    niches_ossements: { eng: 'spawn', spots: 'niches', every: [9, 13], n: [1, 2], max: 3, sound: 'os_qui_roulent', pick: 'cata_squelette_niche' },
    dalles_effondrees: { eng: 'pit', every: [6, 9], r: 1.4, pct: 0.1, life: 7, dps: 12, sound: 'eboulement' },
    souffle_fosse: { eng: 'dark', every: [13, 18], dur: [2, 3], sound: 'murmure' },
    sarcophage_eveille: { eng: 'spawn', spots: 'sarcophagi', every: [10, 14], n: [1, 1], max: 3, sound: 'porte_claque', pick: 'cata_goule' },
    // CHÂTEAU
    armures_animees: { eng: 'statue', every: [8, 12], max: 2, sound: 'armure_grince', pick: 'chateau_armure_hantee', kind: 'armure' },
    lustre_qui_tombe: { eng: 'chandelier', every: [6, 9], r: 2.2, pct: 0.18, sound: 'lustre_chute' },
    portes_qui_claquent: { eng: 'doors', every: [9, 14], sound: 'porte_claque' },
    trappe_oubliettes: { eng: 'pit', every: [7, 10], r: 1.2, pct: 0.1, life: 6, dps: 14, sound: 'porte_claque', square: true },
    // CATHÉDRALE
    montee_des_eaux: { eng: 'flood', every: [14, 20], dur: 7, slow: 0.65, sound: 'eau_monte' },
    courant_nef: { eng: 'push', every: [10, 14], dur: 3, force: 2.6, sound: 'eau_monte' },
    cloche_assourdissante: { eng: 'ring', every: [9, 13], r: 5.5, pct: 0.09, sound: 'cloche' },
    vitrail_brise: { eng: 'fall', fall: 'eclat', every: [4, 6], r: 1.3, pct: 0.08, near: 3.5, sound: 'glace_craque', color: 0x3ab0ff, n: 3 },
    // TEMPLE
    dalles_sacrificielles: { eng: 'pulse', spots: 'slabs', every: [3.5, 5], r: 1.2, pct: 0.13, element: 'feu', color: 0xff2a3a, sound: 'glyphe', n: 2, nearOnly: 6 },
    lames_pendulaires: { eng: 'blades', count: 2, sound: 'lame_pendule' },
    canaux_de_sang: { eng: 'heal', heal: 0.05, sound: 'veine_pulse' },
    glyphes_brulants: { eng: 'pulse', spots: 'near', every: [3.5, 5], r: 1.6, pct: 0.1, element: 'feu', color: 0xff5a2a, sound: 'glyphe', n: 2 },
    // ASILE
    neons_grilles: { eng: 'dark', every: [9, 13], dur: [1.5, 2.5], sound: 'neon_grille' },
    portes_cellules: { eng: 'spawn', spots: 'cells', every: [10, 14], n: [1, 2], max: 3, sound: 'porte_claque', pick: 'asile_patient_fracture' },
    faille_instable: { eng: 'teleport', every: [8, 12], r: 1.8, sound: 'faille' },
    sol_electrifie: { eng: 'pulse', spots: 'near', every: [3, 4.5], r: 1.4, pct: 0.1, element: 'foudre', color: 0x9ad0ff, sound: 'neon_grille', n: 3 },
    // BIBLIOTHÈQUE
    rayonnages_mouvants: { eng: 'fall', fall: 'rocher', every: [4, 6], r: 1.4, pct: 0.09, near: 3, sound: 'pages', color: 0x5a2a1a, n: 2 },
    encre_montante: { eng: 'flood', every: [13, 18], dur: 6, slow: 0.6, ink: true, sound: 'eau_monte' },
    silence_absolu: { eng: 'noise', casts: 9, pick: 'biblio_gardien_silence', sound: 'murmure' },
    tourbillon_pages: { eng: 'cloud', every: [9, 13], r: 1.8, pct: 0.05, life: 7, color: 0xe8dcc0, element: 'physique', sound: 'pages' },
    // NÉCROPOLE
    stalactites: { eng: 'chandelier', every: [5, 8], r: 1.7, pct: 0.14, sound: 'glace_craque', ice: true },
    tombeaux_geles: { eng: 'spawn', spots: 'tombs', every: [10, 14], n: [1, 2], max: 3, sound: 'glace_craque', pick: 'necropole_momie_givre' },
    blizzard: { eng: 'push', every: [11, 15], dur: 4, force: 2.2, dark: true, sound: 'murmure' },
    glace_fragile: { eng: 'pit', every: [7, 10], r: 1.5, pct: 0.08, life: 6, dps: 12, sound: 'glace_craque' },
    // JARDIN
    veines_pulsantes: { eng: 'pulse', spots: 'veins', every: [4, 6], r: 1.5, pct: 0.11, element: 'poison', color: 0xff3a5a, sound: 'veine_pulse', n: 2 },
    pollen_toxique: { eng: 'cloud', every: [8, 11], r: 2.4, pct: 0.04, life: 8, color: 0xd8ff40, element: 'poison', sound: 'grisou' },
    bulbes_explosifs: { eng: 'bulbs', r: 2.2, pct: 0.16, sound: 'veine_pulse' },
    sol_respirant: { eng: 'push', every: [12, 16], dur: 3, force: 2, center: true, sound: 'veine_pulse' },
    // ABÎME
    geysers_lave: { eng: 'pulse', spots: 'vents', every: [3.5, 5], r: 1.6, pct: 0.14, element: 'feu', color: 0xff5a10, sound: 'geyser_lave', n: 2 },
    chaines_balancees: { eng: 'blades', count: 2, sound: 'chaine' },
    pont_effondre: { eng: 'pit', every: [7, 10], r: 1.4, pct: 0.12, life: 6, dps: 16, sound: 'eboulement' },
    pluie_braises: { eng: 'fall', fall: 'braise', every: [2.5, 4], r: 1.3, pct: 0.08, near: 4, sound: 'geyser_lave', color: 0xff8a2a, n: 3 },
    // OBSERVATOIRE
    gravite_neant: { eng: 'push', every: [11, 15], dur: 3.5, force: 2.4, center: true, sound: 'faille' },
    etoiles_filantes: { eng: 'fall', fall: 'etoile', every: [3, 4.5], r: 2.0, pct: 0.12, near: 3.5, sound: 'etoile_filante', color: 0xe0e8ff, n: 2 },
    zone_oubli: { eng: 'dark', every: [12, 16], dur: [3, 4], sound: 'murmure' },
    anneaux_tournants: { eng: 'blades', count: 2, sound: 'chaine' },
    // FOIRE
    manege_fou: { eng: 'blades', count: 1, carousel: true, sound: 'orgue_barbarie' },
    boite_a_musique: { eng: 'music', every: [13, 17], sound: 'orgue_barbarie' },
    ampoules_qui_eclatent: { eng: 'fall', fall: 'eclat', every: [3.5, 5], r: 1.4, pct: 0.08, near: 3.5, sound: 'neon_grille', color: 0xffd080, n: 2 },
    couteaux_lances: { eng: 'arrows', count: 2, sound: 'lame_pendule' },
  };
  const trapName = (id) => { const t = G.DungeonsMeta && G.DungeonsMeta.traps && G.DungeonsMeta.traps[id]; return t ? t.name : id; };

  // spots de mécanisme fournis par l'architecture
  function mechSpots(kind) {
    const m = mechOf();
    const fromList = (l) => (l || []).map((x) => (Array.isArray(x) ? [x[0], x[1]] : [x.x, x.z]));
    switch (kind) {
      case 'vents': return fromList(m.vents);
      case 'spores': return fromList(m.spores);
      case 'slabs': return fromList(m.slabs);
      case 'niches': return fromList(m.niches);
      case 'sarcophagi': return fromList(m.sarcophagi).map((p) => [p[0], p[1] + 1.6]);
      case 'cells': return fromList(m.cells);
      case 'tombs': return fromList(m.tombs);
      case 'veins': return (m.veins || []).map((v) => [(v[0] + v[2]) / 2 + rnd(-2, 2), (v[1] + v[3]) / 2 + rnd(-2, 2)]);
      default: return [];
    }
  }
  function spawnIds(pref) {
    const run = U().run(), d = (run && run.dungeon) || {};
    const ok = (id) => !!((G.MONSTERS && G.MONSTERS[id]) || (G.DATA && G.DATA.ENEMIES && G.DATA.ENEMIES[id]));
    if (pref && ok(pref) && (d.monsters || []).indexOf(pref) >= 0) return pref;
    const l = (d.monsters || []).filter(ok);
    return l.length ? l[Math.floor(G.rng.float() * l.length)] : 'squelette';
  }
  function trapSpawn(T, x, z, id) {
    const api = G.SkillAPI;
    if (!api || !api.spawnEnemy || !hasTHREE()) return null;
    if (G.fx && G.fx.ring) safe(() => G.fx.ring(new THREE.Vector3(x, 0.05, z), 0xb46bff, 1.3, 0.7));
    const e = safe(() => api.spawnEnemy(id, new THREE.Vector3(x, 0, z), {}), null);
    if (e) T.spawned = (T.spawned || 0) + 1;
    return e;
  }

  function dungeonTrap(id, o) {
    o = o || {};
    const D = TRAP_DEF[id];
    if (!D) return null;
    const run = U().run(), f = P().newField();
    const T = { kind: 'dt_' + id, id, def: D, owner: U().roomRef(), f, armed: true, t: rnd(2.5, 4.5), inten: o.intensity || 1, objs: [], st: {} };
    const k = Math.max(0.6, Math.min(2.2, T.inten));
    const next = () => rnd(D.every ? D.every[0] : 6, D.every ? D.every[1] : 9) / Math.sqrt(k);
    const dmg = () => trapDmg((D.pct || 0.08) * (0.85 + 0.15 * k) + 0.008 * curRank());
    const p0 = () => pl();
    // --- moteurs ---
    const ENG = {
      fall() {
        const p = p0(); if (!p) return;
        for (let i = 0; i < (D.n || 1); i++) {
          const [x, z] = i === 0 ? nearSpot(p, D.near || 3) : nearSpot(null, HALF - 2);
          const m = fallMesh(f, D.fall, x, z, D.color);
          const h = P().hazardCircle({ x, z, r: D.r || 1.5, delay: 1.25, dmg: dmg(), element: D.fall === 'braise' ? 'feu' : 'physique', color: D.color, onStrike: () => { if (m) m.position.y = 0.4; snd(D.sound, x, z); } });
          if (m) T.objs.push({ m, h, y: 9 });
        }
      },
      chandelier() {
        const m = mechOf(), p = p0(); if (!p) return;
        const list = (D.ice ? m.stalactites : m.chandeliers) || [];
        const c = list.filter((c2) => !c2.fallen && Math.hypot(c2.x - p.pos.x, c2.z - p.pos.z) < 10).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0];
        if (!c) { ENG.fall.call(null, D.ice ? 'stalactite' : 'rocher'); return; }
        c.fallen = true;
        snd(D.ice ? 'glace_craque' : 'chaine', c.x, c.z);
        P().hazardCircle({ x: c.x, z: c.z, r: D.r || 2, delay: 1.4, dmg: dmg(), element: D.ice ? 'glace' : 'physique', color: D.ice ? 0x9adfff : 0xffc070, onStrike: () => { snd(D.sound, c.x, c.z); shake(0.35); } });
        T.objs.push({ m: c.obj, fallTo: D.ice ? 0.7 : 0.3, delay: 1.25, y: c.obj ? c.obj.position.y : 4 });
      },
      pulse() {
        const p = p0(); if (!p) return;
        let spots = D.spots === 'near' ? [] : mechSpots(D.spots);
        if (D.nearOnly) spots = spots.filter((s) => Math.hypot(s[0] - p.pos.x, s[1] - p.pos.z) < D.nearOnly);
        const n = D.n || 1;
        for (let i = 0; i < n; i++) {
          const s = spots.length ? spots[Math.floor(G.rng.float() * spots.length)] : nearSpot(p, i === 0 ? 2.5 : 6);
          P().hazardCircle({ x: s[0], z: s[1], r: D.r || 1.5, delay: 1.1, dmg: dmg(), element: D.element || 'feu', color: D.color, cloud: D.cloud ? { life: D.cloud, every: 0.6 } : null, onStrike: () => snd(D.sound, s[0], s[1]) });
          if (D.cloud) { /* nuage persistant : dégâts faibles et continus */ }
        }
      },
      cloud() {
        const p = p0(); if (!p) return;
        const s = nearSpot(p, 4);
        P().hazardCircle({ x: s[0], z: s[1], r: D.r || 2, delay: 0.8, dmg: Math.max(2, Math.round(dmg() * 0.5)), element: D.element || 'poison', color: D.color, cloud: { life: D.life || 7, every: 0.7 } });
        snd(D.sound, s[0], s[1]);
      },
      root() {
        const p = p0(); if (!p) return;
        const x = p.pos.x, z = p.pos.z;
        snd(D.sound, x, z);
        P().hazardCircle({ x, z, r: D.r || 1.4, delay: 1.0, dmg: dmg(), element: 'physique', color: D.color, onStrike: (hit) => { if (hit) rootPlayer(D.root || 1.2); } });
      },
      pit() {
        const p = p0(); if (!p) return;
        const [x, z] = nearSpot(p, 2.5);
        snd(D.sound, x, z);
        P().hazardCircle({ x, z, r: D.r || 1.4, delay: 1.3, dmg: dmg(), element: 'physique', color: 0x222222, onStrike: () => {
          const b = builtRoom(); if (!b) return;
          const hz = { x, z, r: (D.r || 1.4) * 0.85, dps: D.dps || 12, kind: 'fosse', _trap: true };
          b.hazards.push(hz);
          let m = null;
          if (hasTHREE()) { m = new THREE.Mesh(D.square ? new THREE.BoxGeometry(hz.r * 2, 0.02, hz.r * 2) : new THREE.CircleGeometry(hz.r, 16), basicM(0x000000, 0.95)); if (!D.square) m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); m.userData.own = true; f.add(m); }
          T.objs.push({ pit: hz, m, life: D.life || 6 });
        } });
      },
      dark() {
        const b = builtRoom(); if (!b) return;
        const dur = rnd(D.dur ? D.dur[0] : 2, D.dur ? D.dur[1] : 3);
        if (D.soft && b.setLightLevel) { b.setLightLevel(D.soft); T.st.restore = dur; }
        else if (b.blackout) b.blackout(dur);
        snd(D.sound, null, null); horrorEv('lumieres_' + id);
      },
      doors() {
        const b = builtRoom(), A = (b && b.anchors) || {};
        const s = (A.sounds && A.sounds.length) ? A.sounds[Math.floor(G.rng.float() * A.sounds.length)] : [0, -HALF - 2];
        snd(D.sound, s[0], s[1]); shake(0.15); if (b && b.blackout) b.blackout(0.35); horrorEv('porte_' + id);
        T.st.n = (T.st.n || 0) + 1;
        if (T.st.n % 2 === 0 && (T.spawned || 0) < 2) { const sh = (A.shadows && A.shadows.length) ? A.shadows[Math.floor(G.rng.float() * A.shadows.length)] : randFree(b, 0.6); trapSpawn(T, sh[0], sh[1], spawnIds()); }
      },
      spawn() {
        if ((T.spawned || 0) >= (D.max || 3)) return;
        const p = p0(); let spots = mechSpots(D.spots).filter((s) => !p || Math.hypot(s[0] - p.pos.x, s[1] - p.pos.z) > 3.5);
        if (!spots.length) spots = [randFree(builtRoom(), 0.6)];
        const n = Math.round(rnd(D.n ? D.n[0] : 1, D.n ? D.n[1] : 1));
        for (let i = 0; i < n && (T.spawned || 0) < (D.max || 3); i++) { const s = spots[Math.floor(G.rng.float() * spots.length)]; snd(D.sound, s[0], s[1]); trapSpawn(T, s[0], s[1], spawnIds(D.pick)); }
      },
      statue() {
        const b = builtRoom(); if (!b || (T.spawned || 0) >= (D.max || 2)) return;
        const p = p0();
        const st = ((b.anchors && b.anchors.statues) || []).filter((g) => g.visible !== false && (!D.kind || g.userData.kind === D.kind) && (!p || Math.hypot(g.position.x - p.pos.x, g.position.z - p.pos.z) > 3));
        if (!st.length) { ENG.spawn(); return; }
        const g = st[Math.floor(G.rng.float() * st.length)];
        snd(D.sound, g.position.x, g.position.z); shake(0.2);
        T.objs.push({ wake: g, t: 1.0 });
      },
      cart() {
        const m = mechOf(), p = p0(); if (!p) return;
        const rails = m.rails || [];
        let r = rails.length ? rails[Math.floor(G.rng.float() * rails.length)] : null;
        if (!r) { const z = Math.max(-HALF + 3, Math.min(HALF - 4, p.pos.z)); r = { x0: -HALF + 1, z0: z, x1: HALF - 1, z1: z }; }
        const dir = G.rng.chance(0.5);
        const a = dir ? [r.x0, r.z0] : [r.x1, r.z1], bb = dir ? [r.x1, r.z1] : [r.x0, r.z0];
        const L = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
        let tele = null;
        if (G.GFX && G.GFX.makeTelegraph && hasTHREE()) { tele = G.GFX.makeTelegraph('line', { length: L, width: 1.6 }); tele.position.set(a[0], 0.05, a[1]); tele.rotation.y = Math.atan2(bb[0] - a[0], bb[1] - a[1]); f.add(tele); }
        let obj = m.cart || null;
        if (!obj && hasTHREE()) { obj = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.6), toonM(0x4a4448)); obj.userData.own = true; f.add(obj); }
        snd(D.sound, a[0], a[1]);
        T.objs.push({ cart: obj, a, b: bb, L, t: -1.3, tele, hit: false, home: obj ? [obj.position.x, obj.position.z, obj.rotation.y] : null });
        U().toast('🛤️ Un wagonnet dévale les rails !');
      },
      flood() {
        const b = builtRoom(), w = mechOf().water;
        T.st.flood = D.dur || 6; snd(D.sound, null, null);
        if (w && w.set) w.set(0.75);
        P().agg().tmpSpeed = D.slow || 0.65;
        U().banner(D.ink ? '🖋️ L\'encre monte !<br><small>Elle colle aux pieds</small>' : '🌊 L\'eau monte !<br><small>Vous êtes ralenti</small>', 1.4);
        if (b && !w && hasTHREE() && !T.st.plane) { const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), basicM(D.ink ? 0x05050e : 0x1a5a7a, 0)); m.rotation.x = -Math.PI / 2; m.position.y = 0.2; m.userData.own = true; f.add(m); T.st.plane = m; }
      },
      push() {
        const p = p0(); if (!p) return;
        T.st.push = D.dur || 3;
        const a = rnd(0, Math.PI * 2); T.st.dir = [Math.cos(a), Math.sin(a)];
        snd(D.sound, null, null);
        if (D.dark) { const b = builtRoom(); if (b && b.setLightLevel) { b.setLightLevel(0.4); T.st.restore = D.dur; } }
        U().toast(D.center ? '🌀 Le sol vous attire vers le centre !' : (D.dark ? '❄️ Le blizzard se lève !' : '🌊 Le courant vous emporte !'));
      },
      ring() {
        const m = mechOf(), c = (m.bell && [m.bell.x, m.bell.z]) || (pl() ? [pl().pos.x + rnd(-3, 3), pl().pos.z + rnd(-3, 3)] : [0, 0]);
        snd(D.sound, c[0], c[1]);
        P().hazardCircle({ x: c[0], z: c[1], r: D.r || 5, delay: 1.6, dmg: dmg(), element: 'physique', color: 0x9adfff, onStrike: () => shake(0.3) });
      },
      teleport() {
        const p = p0(); if (!p) return;
        const x = p.pos.x, z = p.pos.z;
        snd(D.sound, x, z);
        P().hazardCircle({ x, z, r: D.r || 1.8, delay: 1.2, dmg: Math.max(2, Math.round(dmg() * 0.4)), element: 'ombre', color: 0xb04aff, onStrike: (hit) => {
          if (!hit) return; const pp = pl(); if (!pp) return;
          const s = randFree(builtRoom(), 0.8, -HALF + 4, HALF - 3);
          pp.pos.x = s[0]; pp.pos.z = s[1];
          const b = builtRoom(); if (b && b.blackout) b.blackout(0.6);
          horrorEv('faille');
        } });
      },
      music() {
        const api = G.SkillAPI; if (!api || !api.status) return;
        snd(D.sound, null, null);
        U().banner('🎶 La boîte à musique joue…<br><small>Tout s\'arrête. Puis repart plus vite.</small>', 1.6);
        enemyList().forEach((e) => { if (!e.boss) safe(() => api.status(e, { id: 'stun', duration: 2.2 })); });
        T.st.fast = 2.2;
      },
      noop() {},
    };
    T.fire = () => { const fn = ENG[D.eng] || ENG.noop; safe(() => fn()); };
    // moteurs continus : préparation
    if (D.eng === 'blades' && hasTHREE()) {
      const bf = bladeField({ count: D.count || 2, intensity: k });
      if (bf) { bf.parent = T; T.child = bf; }
      if (D.carousel) { const c = mechOf().carousel; if (c) c.speed = 1.6; }
    }
    if (D.eng === 'arrows' && hasTHREE()) { const af = arrowField({ count: D.count || 2, intensity: k }); if (af) T.child = af; }
    if (D.eng === 'hidden' && hasTHREE()) {
      const b = builtRoom();
      T.st.jaws = [];
      for (let i = 0; i < (D.count || 4); i++) {
        const [x, z] = randFree(b, 0.8, -HALF + 4, HALF - 5);
        const g = new THREE.Group(); g.position.set(x, 0.05, z);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 4, 12), toonM(D.color || 0x8a8a90)); ring.rotation.x = Math.PI / 2; g.add(ring);
        ring.material.transparent = true; ring.material.opacity = 0.15;
        g.traverse((mm) => { if (mm.geometry) mm.userData.own = true; });
        f.add(g); T.st.jaws.push({ x, z, g, ring, used: false });
      }
    }
    if (D.eng === 'bulbs') T.st.bulbs = (mechOf().bulbs || []).slice();
    if (D.eng === 'heal') T.st.ch = (mechOf().channels || []).slice();
    if (D.eng === 'noise') { T.st.casts = 0; T.st.off = G.bus.on('skillCast', () => { if (T.armed && U().roomRef() === T.owner) T.st.casts++; }); }

    T.update = (dt) => {
      if (T.child) T.child.armed = T.armed;
      // objets animés (chutes, wagonnet, fosses, statues qui s'éveillent)
      for (let i = T.objs.length - 1; i >= 0; i--) {
        const o = T.objs[i];
        if (o.h && o.m) { if (o.h.state === 'warn') { o.m.position.y = Math.max(0.4, 9 - 8.6 * Math.min(1, o.h.t / (o.h.o.delay || 1))); o.m.rotation.y += dt * 3; } else { o.m.position.y = 0.4; T.objs.splice(i, 1); } continue; }
        if (o.fallTo != null) { o.delay -= dt; if (o.delay <= 0 && o.m) { o.m.position.y = Math.max(o.fallTo, o.m.position.y - dt * 26); if (o.m.position.y <= o.fallTo) { o.m.rotation.z = 0.3; T.objs.splice(i, 1); } } continue; }
        if (o.pit) { o.life -= dt; if (o.life <= 0) { const b = builtRoom(); if (b) { const k2 = b.hazards.indexOf(o.pit); if (k2 >= 0) b.hazards.splice(k2, 1); } if (o.m && o.m.parent) o.m.parent.remove(o.m); T.objs.splice(i, 1); } continue; }
        if (o.wake) {
          o.t -= dt; const g = o.wake;
          g.rotation.z = Math.sin(o.t * 40) * 0.05;
          if (o.t <= 0) {
            g.visible = false; const ob = g.userData.obstacle; const b = builtRoom();
            if (ob && b) { const k2 = b.obstacles.indexOf(ob); if (k2 >= 0) b.obstacles.splice(k2, 1); }
            trapSpawn(T, g.position.x, g.position.z, spawnIds(D.pick));
            T.objs.splice(i, 1);
          }
          continue;
        }
        if (o.cart) {
          o.t += dt;
          if (o.t < 0) { if (o.tele && o.tele.userData.setProgress) o.tele.userData.setProgress(1 + o.t / 1.3); continue; }
          if (o.tele) { o.tele.visible = false; }
          const d = o.t * 15, u = Math.min(1, d / o.L);
          const x = o.a[0] + (o.b[0] - o.a[0]) * u, z = o.a[1] + (o.b[1] - o.a[1]) * u;
          if (o.cart) { o.cart.position.x = x; o.cart.position.z = z; o.cart.rotation.y = Math.atan2(o.b[0] - o.a[0], o.b[1] - o.a[1]); }
          const p = pl();
          if (p && !o.hit && Math.hypot(p.pos.x - x, p.pos.z - z) < 1.3 && !(p.dashT > 0)) { o.hit = true; U().damagePlayer(dmg(), { element: 'physique', source: 'wagonnet' }); shake(0.4); }
          if (u >= 1) { snd('eboulement', x, z); if (o.cart && o.home) { o.cart.position.x = o.home[0]; o.cart.position.z = o.home[1]; o.cart.rotation.y = o.home[2]; } T.objs.splice(i, 1); }
        }
      }
      // fosses : dégâts via room.hazards (désarmé = retirées)
      if (!T.armed) {
        const b = builtRoom();
        T.objs.forEach((o) => { if (o.pit && b) { const k2 = b.hazards.indexOf(o.pit); if (k2 >= 0) b.hazards.splice(k2, 1); } });
        if (T.st.flood > 0) { T.st.flood = 0; P().agg().tmpSpeed = 1; const w = mechOf().water; if (w && w.set) w.set(w.base || 0.12); }
        if (T.st.restore > 0) { T.st.restore = 0; const bb = builtRoom(); if (bb && bb.setLightLevel) bb.setLightLevel(1); }
        if (T.st.root > 0) T.st.root = 0;
        return;
      }
      if (T.st.restore > 0) { T.st.restore -= dt; if (T.st.restore <= 0) { const b = builtRoom(); if (b && b.setLightLevel) b.setLightLevel(1); } }
      if (T.st.flood > 0) {
        T.st.flood -= dt;
        if (T.st.plane) T.st.plane.material.opacity = Math.min(0.5, T.st.flood > 1 ? 0.5 : T.st.flood * 0.5);
        if (T.st.flood <= 0) { P().agg().tmpSpeed = 1; const w = mechOf().water; if (w && w.set) w.set(w.base || 0.12); }
      }
      if (T.st.push > 0) {
        T.st.push -= dt;
        const p = pl(), b = builtRoom();
        if (p && b) {
          let dx = T.st.dir[0], dz = T.st.dir[1];
          if (D.center) { const L = Math.hypot(p.pos.x, p.pos.z) || 1; dx = -p.pos.x / L; dz = -p.pos.z / L; }
          const nx = p.pos.x + dx * (D.force || 2) * dt, nz = p.pos.z + dz * (D.force || 2) * dt;
          if (!blocked(b, nx, nz, 0.45)) { p.pos.x = nx; p.pos.z = nz; }
        }
      }
      if (T.st.root > 0) { T.st.root -= dt; const p = pl(); if (p && T.st.rootAt) { p.pos.x = T.st.rootAt[0]; p.pos.z = T.st.rootAt[1]; } }
      if (T.st.fast > 0) { T.st.fast -= dt; if (T.st.fast <= 0) snd('orgue_barbarie', null, null); }
      // pièges continus
      if (D.eng === 'hidden' && T.st.jaws) {
        const p = pl();
        T.st.jaws.forEach((j) => {
          if (j.used || !p) return;
          const d = Math.hypot(p.pos.x - j.x, p.pos.z - j.z);
          j.ring.material.opacity = d < 3.2 ? 0.85 : 0.12;
          if (d < (D.r || 0.8) && !(p.dashT > 0)) { j.used = true; j.ring.material.opacity = 0.3; snd(D.sound, j.x, j.z); U().damagePlayer(dmg(), { element: 'physique', source: 'piege_a_loup' }); rootPlayer(D.root || 1.5); shake(0.25); }
        });
        return;
      }
      if (D.eng === 'bulbs' && T.st.bulbs) {
        const p = pl();
        T.st.bulbs.forEach((bl) => {
          if (bl.popped || !p) return;
          if (Math.hypot(p.pos.x - bl.x, p.pos.z - bl.z) < 2.6) {
            bl.popped = true;
            P().hazardCircle({ x: bl.x, z: bl.z, r: D.r || 2.2, delay: 0.9, dmg: dmg(), element: 'poison', color: 0xc8ff40, onStrike: () => { snd(D.sound, bl.x, bl.z); if (bl.obj) bl.obj.visible = false; } });
          }
        });
        return;
      }
      if (D.eng === 'heal' && T.st.ch) {
        T.st.ht = (T.st.ht || 0) - dt;
        if (T.st.ht <= 0) {
          T.st.ht = 1;
          enemyList().forEach((e) => {
            if (e.boss || !e.pos) return;
            if (T.st.ch.some((c) => Math.abs(e.pos.x - c.x) < c.hw + 0.6 && Math.abs(e.pos.z - c.z) < c.hd + 0.6) && e.pv < e.pvMax) {
              e.pv = Math.min(e.pvMax, e.pv + e.pvMax * (D.heal || 0.05));
              if (G.fx && G.fx.text && hasTHREE()) safe(() => G.fx.text(new THREE.Vector3(e.pos.x, 2, e.pos.z), '+', '#ff3a5a', 0.8));
            }
          });
        }
        return;
      }
      if (D.eng === 'noise') {
        if (T.st.casts >= (D.casts || 9)) {
          T.st.casts = 0;
          const p = pl(); if (!p) return;
          U().banner('🤫 « Chuuut… »<br><small>Le bruit a réveillé le Gardien du Silence</small>', 1.6);
          snd(D.sound, p.pos.x, p.pos.z);
          const s = nearSpot(p, 6); trapSpawn(T, s[0], s[1], spawnIds(D.pick));
        }
        return;
      }
      if (D.eng === 'blades' || D.eng === 'arrows') return;
      T.t -= dt;
      if (T.t <= 0) { T.t = next(); if (!(U().run() || {}).modal) T.fire(); }
    };
    T.dispose = () => { if (T.st.off) T.st.off(); if (T.st.flood > 0) P().agg().tmpSpeed = 1; const c = mechOf().carousel; if (c && D.carousel) c.speed = 0.2; };
    traps.push(T);
    return T;
  }
  let rootState = null;
  function rootPlayer(sec) {
    const p = pl(); if (!p) return;
    rootState = { t: sec, at: [p.pos.x, p.pos.z] };
    U().toast('🌿 Immobilisé !');
  }
  function updateRoot(dt) {
    if (!rootState) return;
    rootState.t -= dt;
    const p = pl();
    if (!p || rootState.t <= 0) { rootState = null; return; }
    p.pos.x = rootState.at[0]; p.pos.z = rootState.at[1];
  }
  // démarre les pièges ambiants de la salle courante
  function startRoomTraps(rd, inten) {
    const list = (rd && rd.data && rd.data.traps) || [];
    const out = [];
    list.forEach((id) => { const T = dungeonTrap(id, { intensity: inten || (rd.data && rd.data.trapIntensity) || 1 }); if (T) out.push(T); });
    return out;
  }
  G.bus.on('roomStart', (p) => {
    const rd = (p && p.room) || U().roomRef();
    if (!rd || !rd.data || !rd.data.traps || !rd.data.traps.length) return;
    const t = rd.type || 'combat';
    if (['combat', 'elite', 'chest'].indexOf(t) < 0) return;
    const T = startRoomTraps(rd);
    if (T.length) U().toast('⚠️ ' + rd.data.traps.map(trapName).join(' · '));
  });
  G.bus.on('roomCleared', () => {
    const cr = U().roomRef();
    traps.forEach((T) => { if (T.owner === cr && T.kind && T.kind.indexOf('dt_') === 0 && !T.keepArmed) T.armed = false; });
    rootState = null;
  });

  // ==================================================================
  //  v5 — CACHES (urnes / caisses fissurées) dans les salles nettoyées
  // ==================================================================
  let cache = null;
  function updateCache(dt, run) {
    const rm = U().roomRef();
    if (cache && cache.room !== rm) { cache.f.clear(); cache = null; }
    if (!cache && rm && rm.data && rm.data.cache && !rm.data.cache.taken && run.roomState === 'cleared' && hasTHREE()) {
      const b = run.room, f = P().newField(rm);
      const arch = (run.dungeon && run.dungeon.archi) || '';
      const col = /chateau|cathedrale/.test(arch) ? 0x8a7a6a : /mine|foire|biblio/.test(arch) ? 0x6a4a2a : /jardin/.test(arch) ? 0x8a3a44 : /necropole|glace/.test(arch) ? 0xa8d8f0 : 0x6a5a4a;
      const orf = G.rng.float; if (NET() && NET().role) G.rng.float = srng((rm.seed || 3) * 17 + 5);     // coop : même cachette chez tous
      let x, z; try { [x, z] = randFree(b, 0.9, -HALF + 4, HALF - 4); } finally { G.rng.float = orf; }
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 8), toonM(col)); body.position.y = 0.45; body.userData.own = true; g.add(body);
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.02), basicM(0xffd23f, 0.7)); crack.position.set(0.1, 0.5, 0.44); crack.rotation.z = 0.4; crack.userData.own = true; g.add(crack);
      f.add(g);
      cache = { room: rm, f, x, z, g, crack, hits: 0, hold: 0, t: 0 };
      netReg('cache', { hostUse: () => takeCache(rm, U().run()), apply: () => takeCache(rm, U().run(), true) });
    }
    if (!cache) return;
    cache.t += dt;
    cache.crack.material.opacity = 0.4 + 0.4 * Math.sin(cache.t * 4);
    const p = pl(); if (!p || run.modal) return;
    const d = Math.hypot(p.pos.x - cache.x, p.pos.z - cache.z);
    cache.hold = d < 1.6 ? cache.hold + dt : 0;
    if (cache.hold > 1.2 || cache.hits >= 1) {
      if (!netUse('cache')) { cache.hold = -2; cache.hits = 0; return; }     // invité : l'hôte casse la cache pour tous
      takeCache(rm, run);
    }
  }
  /** Cache cassée : butin propre au joueur ; remote = l'hôte l'a cassée (invité) */
  function takeCache(rm, run, remote) {
    if (!cache || cache.room !== rm || rm.data.cache.taken) return;
    rm.data.cache.taken = true;
    if (!remote) netDone('cache');
    snd('mur_fissure', cache.x, cache.z);
    const r = rankIdx(run), rich = rm.data.cache.rich;
    U().giveGold(Math.round((20 + 18 * r) * (rich ? 2.2 : 1)), pos3(cache.x, 1, cache.z));
    if (rich && G.rng.chance(0.35)) U().giveItem('rare');
    fxBurst(pos3(cache.x, 0.8, cache.z), 0xffd23f, 18);
    U().toast(rich ? '🏺 Une cache bien garnie !' : '🏺 Une cache oubliée');
    cache.f.clear(); cache = null;
  }
  G.bus.on('skillCast', () => { if (cache) { const p = pl(); if (p && Math.hypot(p.pos.x - cache.x, p.pos.z - cache.z) < 2.6) cache.hits++; } });

  // ==================================================================
  //  v5 — RÉVÉLATION DES SALLES SECRÈTES : mur fissuré à frapper, levier, symboles (énigme)
  // ==================================================================
  let rev = null;
  function swReady2(run, rm) { return swReady(run, rm); }
  function buildReveal(rm, run) {
    const sec = rm.data.secret, R = (sec.data && sec.data.reveal) || { kind: 'rune' };
    const b = run.room || {}, spots = b.secretSpots || {};
    const f = P().newField(rm);
    const o = { kind: R.kind, puzzle: R.puzzle, f, room: rm, t: 0, hinted: false, hits: 0, hold: 0, step: 0, order: null, done: false };
    if (!hasTHREE()) return o;
    if (R.kind === 'mur') {
      const w = (spots.wall && spots.wall.length) ? spots.wall[Math.floor(G.rng.float() * spots.wall.length)] : { x: -HALF + 1.1, z: 0, side: 'W', wx: -HALF };
      o.x = w.x; o.z = w.z;
      const g = new THREE.Group(); g.position.set(w.wx != null ? w.wx + (w.side === 'W' ? 0.52 : -0.52) : w.x, 0, w.z);
      for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5 + G.rng.float() * 0.5, 0.06), basicM(0x66ddff, 0)); c.position.set(0, 0.5 + i * 0.3, (i - 2) * 0.22); c.rotation.x = (i % 2 ? 0.6 : -0.5); c.userData.own = true; g.add(c); }
      f.add(g); o.g = g;
      o.hint = 'Un pan de mur sonne creux… frappez-le !';
    } else if (R.kind === 'levier') {
      const l = (spots.lever && spots.lever.length) ? spots.lever[Math.floor(G.rng.float() * spots.lever.length)] : [-9, -9];
      o.x = l[0]; o.z = l[1];
      const g = new THREE.Group(); g.position.set(l[0], 0, l[1]);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), toonM(0x3a3a40)); base.position.y = 0.18; base.userData.own = true; g.add(base);
      const arm = new THREE.Group(); arm.position.y = 0.35; g.add(arm);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), toonM(0x6a5a40)); stick.position.y = 0.45; stick.userData.own = true; arm.add(stick);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), basicM(0x66ddff, 0.2)); knob.position.y = 0.9; knob.userData.own = true; arm.add(knob);
      arm.rotation.z = -0.6;
      f.add(g); o.g = g; o.arm = arm; o.knob = knob;
      o.hint = 'Un levier oublié dépasse de l\'ombre…';
    } else if (R.kind === 'symbole') {
      const pts = ((spots.symbol && spots.symbol.length >= 3) ? spots.symbol : [[-5, -5], [5, -5], [0, 4]]).slice(0, 3);
      o.syms = pts.map((p2, i) => {
        const g = new THREE.Group(); g.position.set(p2[0], 0.06, p2[1]);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 3 + i), basicM(0x66ddff, 0)); ring.rotation.x = -Math.PI / 2; ring.userData.own = true; g.add(ring);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3 + i), basicM(0xffffff, 0)); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.01; fill.userData.own = true; g.add(fill);
        f.add(g);
        return { x: p2[0], z: p2[1], g, ring, fill, lit: false, hold: 0 };
      });
      if (R.puzzle === 'ordre') { const ord = [0, 1, 2].sort(() => G.rng.float() - 0.5); o.order = ord; o.hint = 'Trois symboles s\'allument dans un ordre… répétez-le.'; }
      else o.hint = 'Trois symboles effacés au sol… réveillez-les tous.';
    } else {
      o.kind = 'rune';
    }
    return o;
  }
  function revealNow(o, run) {
    if (o.done) return;
    o.done = true;
    const ok = P().revealSecret(run, o.room);
    if (ok) netDone('secret');
    o.f.clear();
    if (ok) {
      const sec = o.room.data.secret, hb = sec && sec.data && sec.data.hiddenBoss;
      U().banner('<b>' + bi('key', '🗝️') + ' Un passage secret s\'ouvre…</b><br><small>' + (hb ? 'Quelque chose de massif garde la salle cachée' : 'La porte du nord mène à une salle cachée') + '</small>', 2.6);
      snd('secret_trouve', o.x || 0, o.z || 0); U().sfx('door'); shake(0.3);
      const p = pl(); if (p) fxBurst(p.pos, 0x66ddff, 26);
      horrorEv('secret');
    }
  }
  function updateReveal(dt, run) {
    const rm = U().roomRef();
    if (rev && rev.room !== rm) { if (!rev.done) rev.f.clear(); rev = null; }
    if (!rev && rm && rm.data && rm.data.secret && !rm.data.secret._revealed && rm.data.secret.data && rm.data.secret.data.reveal) {
      netRegSecret(rm);
      if (isGuest()) return;      // énigme résolue par l'hôte ; le passage s'ouvre ensuite chez tous
      if (!swReady2(run, rm)) return;
      rev = buildReveal(rm, run);
    }
    if (!rev || rev.done) return;
    if (rev.kind === 'rune') { rev.f.clear(); rev = null; rm.data.secret.data.reveal = null; return; }   // repli : interrupteur v3
    rev.t += dt;
    if (!rev.hinted) { rev.hinted = true; U().toast('🔎 ' + (rm.data.secretHint || rev.hint)); }
    const p = pl(); if (!p || run.modal) return;
    const pulse = 0.35 + 0.3 * Math.sin(rev.t * 3);
    if (rev.kind === 'mur') {
      rev.g.children.forEach((c) => { c.material.opacity = pulse * (0.4 + rev.hits * 0.2); });
      const near = Math.hypot(p.pos.x - rev.x, p.pos.z - rev.z) < 2.2;
      rev.hold = near ? rev.hold + dt : 0;
      if (rev.hits >= 3 || rev.hold > 4) revealNow(rev, run);
    } else if (rev.kind === 'levier') {
      rev.knob.material.opacity = pulse + 0.2;
      if (Math.hypot(p.pos.x - rev.x, p.pos.z - rev.z) < 1.3) { rev.arm.rotation.z = 0.6; snd('levier', rev.x, rev.z); revealNow(rev, run); }
    } else if (rev.kind === 'symbole') {
      // démonstration de l'ordre (énigme)
      if (rev.order && !rev.shown) {
        const k = Math.floor(rev.t / 0.8) % 5;
        rev.syms.forEach((s, i) => { s.ring.material.opacity = (k < 3 && rev.order[k] === i) ? 0.95 : 0.15; });
        if (rev.t > 4.5) { rev.shown = true; }
        return;
      }
      rev.syms.forEach((s, i) => {
        if (!s.lit) s.ring.material.opacity = 0.2 + 0.25 * Math.sin(rev.t * 2 + i);
        const near = Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 1.0;
        if (s.lit || !near) { if (!s.lit) s.hold = 0; return; }
        s.hold += dt;
        s.fill.material.opacity = Math.min(0.6, s.hold);
        if (s.hold > 0.7) {
          if (rev.order && rev.order[rev.step] !== i) {
            rev.syms.forEach((q) => { q.lit = false; q.hold = 0; q.fill.material.opacity = 0; }); rev.step = 0; rev.shown = false; rev.t = 0;
            U().toast('✖ Mauvais ordre… les symboles s\'éteignent'); snd('murmure', s.x, s.z); return;
          }
          s.lit = true; s.ring.material.opacity = 1; s.fill.material.opacity = 0.5; rev.step++; snd('glyphe', s.x, s.z);
        }
      });
      if (rev.syms.every((s) => s.lit)) revealNow(rev, run);
    }
  }
  G.bus.on('skillCast', () => { if (rev && rev.kind === 'mur' && !rev.done) { const p = pl(); if (p && Math.hypot(p.pos.x - rev.x, p.pos.z - rev.z) < 2.8) { rev.hits++; snd('mur_fissure', rev.x, rev.z); shake(0.12); } } });

  // ==================================================================
  //  v5 — ÉVÉNEMENTS RARES PROPRES AU DONJON (event kind 'donjon')
  // ==================================================================
  EV.donjon = {
    start(S) {
      const dv = S.data.devent || { kind: 'tresor', name: 'Événement', desc: '' };
      S.dv = dv;
      U().banner('<b>' + (dv.icon || '❗') + ' ' + esc(dv.name) + '</b><br><small>' + esc(dv.desc || '') + '</small>', 3);
      if (dv.kind === 'embuscade') { S.sub = EV.ambush; EV.ambush.start(S); return; }
      if (dv.kind === 'pacte') { S.sub = EV.pact; EV.pact.start(S); return; }
      if (dv.kind === 'apparition') { EV.donjon.apparition(S); return; }
      EV.donjon.tresor(S);
    },
    apparition(S) {
      const [x, z] = altarSpot(S);
      if (hasTHREE()) { const g = place(S, mkGhost(), x, z, S.dv.name, '#cfe8ff'); S.ghost = g; addAnim(S, (t) => { if (g) { g.position.y = 0.2 + Math.sin(t * 1.5) * 0.15; g.traverse((m) => { if (m.material && m.material.transparent) m.material.opacity = 0.35 + 0.3 * Math.sin(t * 2); }); } }); }
      S.done = true; S.used = false;
      horrorEv('apparition');
      addUsable(S, { x, z, r: 2.0, onUse: () => {
        if (S.used) return;
        const r = rankIdx(S.run), excl = ((S.run && S.run.dungeon && S.run.dungeon.reward && S.run.dungeon.reward.exclusive) || []);
        ask(S, S.dv.name, [
          { label: 'Écouter', desc: 'Elle murmure un secret… (XP et faveur)', value: 'ecouter', icon: '👂' },
          { label: 'Tendre la main', desc: 'Un présent… ou une malédiction ?', value: 'main', icon: '✋' },
          { label: 'Reculer', desc: 'Ne pas déranger les morts', value: null, icon: '🚪' },
        ], S.dv.desc || '').then((v) => {
          if (!v) return;
          S.used = true;
          if (S.ghost) S.ghost.visible = false;
          if (v === 'ecouter') { U().giveXP(60 + 50 * r); P().addBuff({ id: 'murmure', name: 'Murmure des morts', icon: '👻', duration: 240, fx: { xp: 1.2, crit: 0.05 } }); U().notify('Murmure des morts (4 min)', 'rare', '👻'); }
          else if (G.rng.chance(0.65)) {
            const ex = excl.length && G.Inventory && G.Inventory.grantReward ? excl[0] : null;
            if (ex) safe(() => G.Inventory.grantReward(U().profile(), [ex])); else U().giveItem(r >= 3 ? 'epique' : 'rare');
            U().giveGold(40 + 40 * r, null);
          } else { U().damagePlayer(Math.round(U().pvMax() * 0.2), { source: 'malediction' }); U().banner('<b>Ses doigts sont glacés…</b>', 1.4); spawnMobs(S, [monsterIds(S, false)[0], monsterIds(S, false)[0]], {}); S.done = false; S.waitMobs = true; }
          snd('murmure', x, z);
        });
      } });
      setObj(S, 'Approchez… si vous l\'osez');
    },
    tresor(S) {
      const [x, z] = altarSpot(S);
      S.chest = hasTHREE() ? place(S, mkChest(), x, z, S.dv.name, '#ffd23f') : null;
      S.done = true;
      addUsable(S, { x, z, r: 1.9, onUse: () => {
        if (S.opened) return; S.opened = true;
        if (S.chest) openChestVisual(S.chest);
        const r = rankIdx(S.run);
        reward(S, { gold: 60 + 45 * r, xp: 20 + 10 * r, item: { p: 0.45, rarity: r >= 3 ? 'epique' : 'rare' }, potion: 0.4 }, pos3(x, 1, z));
        fxBurst(pos3(x, 1, z), 0xffd23f, 30); U().sfx('chestOk');
      } });
      setObj(S, 'Un trésor propre à ce donjon');
    },
    update(S, dt) {
      if (S.sub && S.sub.update) S.sub.update(S, dt);
      if (S.waitMobs && S.t > 1 && aliveMine(S) === 0) { S.waitMobs = false; S.done = true; }
    },
  };

  // ==================================================================
  //  v5 — SALLE SECRÈTE : gardien = créature secrète, récompenses exclusives
  // ==================================================================
  G.bus.on('secretCreature', (p) => {
    if (!p) return;
    const run = U().run(), r = rankIdx(run), at = pos3(p.x || 0, 1, p.z || 0);
    if (p.outcome === 'gift') {
      U().banner('<b>🎁 Un présent…</b><br><small>La créature a laissé quelque chose derrière elle</small>', 2);
      U().giveGold(60 + 50 * r, at);
      const ex = (run && run.dungeon && run.dungeon.reward && run.dungeon.reward.exclusive) || [];
      if (ex.length && G.Inventory && G.Inventory.grantReward) safe(() => G.Inventory.grantReward(U().profile(), [ex[0]], { rank: run.dungeon.rank })); else U().giveItem(r >= 3 ? 'epique' : 'rare');
      fxBurst(at, 0xffd23f, 30); snd('secret_trouve', p.x, p.z);
    } else if (p.outcome === 'vanish') { U().toast('… Elle a disparu. Il ne reste qu\'un froid.'); snd('murmure', p.x, p.z); }
  });
  G.bus.on('secretFound', (p) => {
    const run = (p && p.run) || U().run(); const rm = U().roomRef();
    const ex = rm && rm.data && rm.data.exclusive;
    if (ex && ex.length && G.Inventory && G.Inventory.grantReward) safe(() => G.Inventory.grantReward(U().profile(), [ex[Math.floor(G.rng.float() * ex.length)]], { rank: run && run.dungeon && run.dungeon.rank }));
  });

  // ------------------------------------------------------------------
  //  Boucle globale (pièges, interrupteur secret) + réinitialisation
  // ------------------------------------------------------------------
  G.bus.on('tick', (p) => {
    const run = (p && p.run) || U().run();
    if (!run || !run.dungeon) return;
    const dt = (p && p.dt) || 0;
    safe(() => updateTraps(dt));
    safe(() => updateSwitch(dt, run));
    safe(() => updateReveal(dt, run));
    safe(() => updateCache(dt, run));
    safe(() => updateRoot(dt));
  });
  G.bus.on('runEnd', () => { endCurrent(); traps.forEach((T) => { if (T.dispose) safe(() => T.dispose()); if (T.f) T.f.clear(); }); traps.length = 0; rev = null; cache = null; rootState = null; if (sw && sw.f) sw.f.clear(); sw = null; swRoom = null; });
  G.bus.on('roomStart', () => { if (cur && cur.def !== U().roomRef()) endCurrent(); });

  G.Events = { spikeField, bladeField, arrowField, dungeonTrap, trapDefs: TRAP_DEF, rootPlayer, kinds: Object.keys(EV), riddles: RIDDLES, genRiddle, __cur: () => cur, __rev: () => rev, __traps: () => traps };
})();
