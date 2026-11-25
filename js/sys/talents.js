/* =====================================================================
 *  Donjon Arena 3D v3 — SYSTÈME DES DONS            js/sys/talents.js
 *  G.Talents : profil, équipement, amélioration (éclats), évolutions,
 *  synergies, tirage pondéré, application des effets, panneau « Dons ».
 *  Les définitions sont dans js/data/talents.js (G.TALENTS).
 * ===================================================================== */
window.G = window.G || {};
(() => {
  'use strict';
  const M = () => G.TALENT_META;
  const K = () => G.TalentKit;
  const prof = () => (G.game && G.game.profile) || null;
  const rankOrder = () => (G.Ranks && G.Ranks.order) || ['E', 'D', 'C', 'B', 'A', 'S', 'Z'];

  let removers = [];          // fonctions de retrait des dons + synergies actifs
  let appliedSig = null;
  const flags = {};           // drapeaux de synergie lus par les dons (chainBonus…)

  function def(id) { return G.TALENTS && G.TALENTS[id]; }
  function classOk(d, p) { return !d || !d.classes || !p || !p.classe || d.classes.indexOf(p.classe) >= 0; }

  // ------------------------------------------------------------------ profil
  function slotsFor(p) {
    let idx = 0;
    try {
      if (G.Ranks && G.Ranks.index) idx = Math.max(0, G.Ranks.index(p.rank || 'E'));
      else idx = Math.max(0, rankOrder().indexOf(p.rank || 'E'));
    } catch (_) {}
    let bonus = 0;
    try { if (G.Ranks && G.Ranks.talentSlotsBonus) bonus = Math.max(0, G.Ranks.talentSlotsBonus(p) || 0); } catch (_) {}
    return Math.min(9, 2 + idx + bonus);   // base (2 au rang E, +1/rang) + bonus de récompenses de rang (rôle 2)
  }
  function ensureProfile(p) {
    if (!p) return p;
    const t = p.talents = p.talents || {};
    t.owned = t.owned || {}; t.equipped = Array.isArray(t.equipped) ? t.equipped : [];
    if (typeof t.shards !== 'number') t.shards = 0;
    if (typeof t.pending !== 'number') t.pending = 0;
    t.slots = slotsFor(p);
    // nettoyage : dons inconnus / non possédés / classe interdite / doublons / trop d'emplacements
    const seen = {};
    t.equipped = t.equipped.filter(id => {
      if (seen[id] || !t.owned[id] || !def(id) || !classOk(def(id), p)) return false;
      seen[id] = 1; return true;
    }).slice(0, t.slots);
    for (const id of Object.keys(t.owned)) if (!def(id)) delete t.owned[id];
    return p;
  }

  function persist(p) {
    try { applyAll(p); } catch (e) { console.error(e); }
    try { G.game && G.game.saveProfile && G.game.saveProfile(); } catch (_) {}
  }

  // ------------------------------------------------------------------ acquisition / amélioration
  function grant(p, id) {
    ensureProfile(p); const d = def(id); if (!d) return { ok: false, reason: 'inconnu' };
    const t = p.talents;
    if (t.owned[id]) {
      const n = M().dupShards[d.rarity] || 5; t.shards += n;
      return { ok: true, dup: true, shards: n, level: t.owned[id] };
    }
    t.owned[id] = 1;
    let equipped = false;
    if (classOk(d, p) && t.equipped.length < t.slots) { t.equipped.push(id); equipped = true; }
    return { ok: true, dup: false, level: 1, equipped };
  }
  function upgradeCost(id, level) { const d = def(id); return d ? M().upgradeCost(d.rarity, level) : Infinity; }
  function levelUp(p, id) {
    ensureProfile(p); const d = def(id), t = p.talents; const lv = t.owned[id];
    if (!d || !lv) return { ok: false, reason: 'Don non possédé' };
    if (lv >= d.maxLevel) return { ok: false, reason: 'Niveau maximum' };
    const c = upgradeCost(id, lv);
    if (t.shards < c) return { ok: false, reason: 'Éclats insuffisants (' + c + ')', cost: c };
    t.shards -= c; t.owned[id] = lv + 1;
    return { ok: true, level: lv + 1, cost: c };
  }
  function equip(p, id) {
    ensureProfile(p); const d = def(id), t = p.talents;
    if (!d || !t.owned[id]) return { ok: false, reason: 'Don non possédé' };
    if (!classOk(d, p)) return { ok: false, reason: 'Réservé à : ' + d.classes.join(', ') };
    if (t.equipped.indexOf(id) >= 0) return { ok: false, reason: 'Déjà équipé' };
    if (t.equipped.length >= t.slots) return { ok: false, reason: 'Aucun emplacement libre' };
    t.equipped.push(id); return { ok: true };
  }
  function unequip(p, id) {
    ensureProfile(p); const i = p.talents.equipped.indexOf(id);
    if (i < 0) return { ok: false, reason: 'Non équipé' };
    p.talents.equipped.splice(i, 1); return { ok: true };
  }

  // ------------------------------------------------------------------ évolutions
  function canEvolve(p, id) {
    ensureProfile(p); const d = def(id), t = p.talents;
    if (!d || !d.evolution || !t.owned[id]) return { ok: false, reason: 'Aucune évolution' };
    const ev = d.evolution, into = def(ev.into);
    if (!into) return { ok: false, reason: 'Évolution inconnue' };
    if (t.owned[ev.into]) return { ok: false, reason: 'Déjà obtenue' };
    if (t.owned[id] < d.maxLevel) return { ok: false, reason: 'Niveau max requis (' + t.owned[id] + '/' + d.maxLevel + ')' };
    if (!t.owned[ev.requires]) return { ok: false, reason: 'Don requis : ' + (def(ev.requires) || {}).name };
    return { ok: true, into: ev.into };
  }
  function evolve(p, id) {
    const c = canEvolve(p, id); if (!c.ok) return c;
    const t = p.talents; delete t.owned[id]; t.owned[c.into] = 1;
    const i = t.equipped.indexOf(id);
    if (i >= 0) t.equipped[i] = c.into;
    else if (t.equipped.length < t.slots) t.equipped.push(c.into);
    return { ok: true, into: c.into };
  }
  function evolutions(p) {
    ensureProfile(p); const out = [];
    for (const id of Object.keys(p.talents.owned)) {
      const d = def(id); if (!d || !d.evolution) continue;
      const c = canEvolve(p, id); if (!c.ok && c.reason === 'Déjà obtenue') continue;
      out.push({ id, requires: d.evolution.requires, into: d.evolution.into, ok: c.ok, reason: c.reason });
    }
    return out;
  }

  // ------------------------------------------------------------------ synergies
  function tagCounts(p) {
    ensureProfile(p); const c = {};
    for (const id of p.talents.equipped) { const d = def(id); if (d) for (const t of d.tags) c[t] = (c[t] || 0) + 1; }
    return c;
  }
  function activeSynergies(p) {
    const counts = tagCounts(p), out = [], S = G.TALENT_SYNERGIES || {};
    for (const tag of Object.keys(counts)) {
      const n = counts[tag], sy = S[tag]; if (!sy || n < 2) continue;
      const tier = Math.min(4, n);
      const lines = []; for (let k = 2; k <= tier; k++) if (sy.tiers[k]) lines.push({ n: k, desc: sy.tiers[k].desc });
      const nx = tier < 4 ? sy.tiers[tier + 1] : null;
      out.push({ tag, name: M().tagNames[tag] || tag, icon: M().tagIcons[tag] || '', count: n, tier, lines,
        desc: lines.map(l => l.desc).join(' · '), next: nx ? { need: tier + 1, desc: nx.desc } : null });
    }
    out.sort((a, b) => b.count - a.count);
    return out;
  }

  // ------------------------------------------------------------------ tirage
  function eligible(rarity, p, excl) {
    return Object.keys(G.TALENTS).filter(id => { const d = G.TALENTS[id]; return d.rarity === rarity && !d.evolved && !(excl && excl.has(id)) && classOk(d, p); });
  }
  function drawOne(luck, p, excl) {
    const W = M().weights, ord = M().order;
    const list = [];
    ord.forEach((r, i) => {
      let w = W[r] || 0; if (w <= 0) return;
      if (r !== 'commun' && r !== 'secret') w *= 1 + Math.max(0, luck || 0) * i * 0.35;   // la chance ne touche pas aux secrets
      if (eligible(r, p, excl).length) list.push({ r, weight: w });
    });
    if (!list.length) return null;
    const r = G.rng.weighted(list, 'weight').r;
    return G.rng.pick(eligible(r, p, excl));
  }
  function offerChoice(luck, p) {
    p = p || prof(); const out = [], ex = new Set();
    for (let i = 0; i < 3; i++) { const id = drawOne(luck, p, ex); if (!id) break; out.push(id); ex.add(id); }
    return out;
  }

  // ------------------------------------------------------------------ application des effets
  function removeAll() {
    for (const f of removers) { try { f(); } catch (e) { console.error(e); } }
    removers = [];
    for (const k of Object.keys(flags)) delete flags[k];
  }
  function sigOf(p) {
    const t = p.talents;
    return [p.classe, t.equipped.map(id => id + ':' + t.owned[id]).join(',')].join('|');
  }
  function applyAll(p) {
    p = p || prof(); if (!p) return;
    ensureProfile(p); removeAll();
    const t = p.talents;
    for (const id of t.equipped) {
      const d = def(id); if (!d || !classOk(d, p)) continue;
      try { const r = d.apply(t.owned[id] || 1); if (typeof r === 'function') removers.push(r); } catch (e) { console.error('[talent ' + id + ']', e); }
    }
    // synergies
    const kit = K(), S = G.TALENT_SYNERGIES || {};
    for (const sy of activeSynergies(p)) {
      const sc = kit.scope('syn:' + sy.tag, sy.tier);
      for (let k = 2; k <= sy.tier; k++) {
        const tr = S[sy.tag] && S[sy.tag].tiers[k]; if (!tr) continue;
        if (tr.flags) for (const f of Object.keys(tr.flags)) flags[f] = (flags[f] || 0) + tr.flags[f];
        if (tr.stats) sc.hook('stats', s => { tr.stats(s); return s; });
        if (tr.fx) { try { tr.fx(sc); } catch (e) { console.error(e); } }
      }
      removers.push(() => sc.dispose());
    }
    // plafonds globaux anti-dérive
    const cap = kit.scope('caps', 0);
    cap.hook('stats', s => {
      if (s.cdr > 0.6) s.cdr = 0.6; if (s.lifesteal > 0.3) s.lifesteal = 0.3; if (s.dodge > 0.6) s.dodge = 0.6;
      return s;
    }, 900);
    removers.push(() => cap.dispose());
    appliedSig = sigOf(p);
  }
  function syncIfChanged(p) {
    p = p || prof(); if (!p) return;
    ensureProfile(p);
    if (appliedSig !== sigOf(p)) applyAll(p);
  }

  // ------------------------------------------------------------------ choix de dons (boss, niveaux)
  let queue = [], busy = false;
  const seenBoss = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;

  function describeOpt(id, p) {
    const d = def(id), t = p.talents, owned = t.owned[id];
    const tag = '[' + M().names[d.rarity] + '] ';
    if (owned) return tag + 'Déjà possédé (niv ' + owned + ') → +' + M().dupShards[d.rarity] + ' éclats';
    return tag + d.desc(1) + (d.classes ? ' (' + d.classes.join('/') + ')' : '');
  }
  function notify(text, rarity, icon) { try { G.UI && G.UI.notify && G.UI.notify({ text, rarity, icon }); } catch (_) {} }

  async function runChoice(job) {
    const p = prof(); if (!p) return;
    ensureProfile(p);
    const ids = offerChoice(job.luck, p); if (!ids.length) return;
    let pick = ids[0];
    if (G.UI && (G.UI.modal || G.UI.choice)) {
      const wasPaused = G.core && G.core.paused;
      if (G.core && G.SkillAPI && G.SkillAPI.inRun && G.SkillAPI.inRun()) G.core.paused = true;
      try {
        const v = await choiceWindow(ids, p, job);
        if (v && def(v)) pick = v;
      } catch (_) {} finally { if (G.core) G.core.paused = !!wasPaused; }
    }
    const r = grant(p, pick), d = def(pick);
    notify(r.dup ? d.name + ' : +' + r.shards + ' éclats' : 'Nouveau don : ' + d.name, d.rarity, d.icon);
    persist(p);
    try { G.UI && G.UI.refreshCamp && !(G.SkillAPI && G.SkillAPI.inRun && G.SkillAPI.inRun()) && G.UI.refreshCamp(); } catch (_) {}
  }
  async function pump() {
    if (busy) return; busy = true;
    try { while (queue.length) { const j = queue.shift(); await runChoice(j); } } finally { busy = false; }
  }
  function offer(title, luck) { queue.push({ title, luck: luck || 0 }); pump(); }

  function flushPending(p) {
    p = p || prof(); if (!p) return 0; ensureProfile(p);
    let n = 0;
    while (p.talents.pending > 0) { p.talents.pending--; n++; offer('Niveau atteint : choisissez un don', 0.1); }
    if (n) persist(p);
    return n;
  }

  // ------------------------------------------------------------------ événements du jeu (enregistrés au chargement)
  G.bus.on('runStart', () => { const p = prof(); if (p) { applyAll(p); } });
  G.bus.on('profileChanged', e => { const p = (e && e.profile) || prof(); if (p) syncIfChanged(p); });
  G.bus.on('levelUp', e => {
    const p = prof(); if (!p) return; ensureProfile(p);
    const n = (e && e.niveau) || p.niveau || 0;
    if (n > 0 && n % 5 === 0) { p.talents.pending++; notify('Un don vous attend (niveau ' + n + ')', 'epique', '🎁'); G.game && G.game.saveProfile && G.game.saveProfile(); }
  });
  function onBoss(enemy, luck, title) {
    if (enemy && seenBoss) { if (seenBoss.has(enemy)) return; seenBoss.add(enemy); }
    offer(title, luck);
  }
  G.bus.on('bossKilled', e => {
    const b = e && e.boss, mini = b && ((b.def && b.def.miniboss) || b.miniboss);
    onBoss(b, mini ? 0.15 : 0.5, mini ? 'Mini-boss vaincu : choisissez un don' : 'Boss vaincu : choisissez un don');
  });
  G.bus.on('enemyKilled', e => {
    const en = e && e.enemy; if (!en) return;
    if (en.def && en.def.miniboss && !en.def.boss && !en.boss) onBoss(en, 0.15, 'Mini-boss vaincu : choisissez un don');
  });
  G.bus.on('roomCleared', () => { const p = prof(); if (p && p.talents && p.talents.pending > 0) flushPending(p); });

  // ------------------------------------------------------------------ panneau « Dons » — refonte v4
  const CSS = `
.tl-root{--k-bg0:var(--ds-bg-0,#060912);--k-bg1:var(--ds-bg-1,#0b1122);--k-bg2:var(--ds-bg-2,#111a33);--k-bg3:var(--ds-bg-3,#18233f);
--k-line:var(--ds-line,rgba(130,180,255,.16));--k-line2:var(--ds-line-strong,rgba(130,200,255,.36));--k-tx:var(--ds-text,#e8f0ff);--k-tx2:var(--ds-text-2,#a9b8d6);--k-tx3:var(--ds-text-3,#6f7fa3);
--k-acc:var(--ds-accent,#46d4ff);--k-vio:var(--ds-accent-2,#8b6bff);--k-gold:var(--ds-gold,#ffc94a);--k-ok:var(--ds-success,#39e08c);--k-bad:var(--ds-danger,#ff4d6a);
--k-fd:var(--ds-font-display,'Chakra Petch',system-ui,sans-serif);--k-fb:var(--ds-font-body,'Nunito',system-ui,sans-serif);
font-family:var(--k-fb);color:var(--k-tx);max-width:1100px;margin:0 auto;padding:4px 2px 18px;display:block}
.tl-root *,.tl-choice *{box-sizing:border-box}
.tl-root svg,.tl-choice svg{display:block}
.tl-head{display:flex;align-items:stretch;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.tl-stat{flex:1 1 130px;max-width:260px;display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--k-line2);border-radius:var(--ds-r-md,10px);background:linear-gradient(135deg,rgba(70,212,255,.1),rgba(139,107,255,.08));clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))}
.tl-stat .tl-si{width:30px;height:30px;display:grid;place-items:center;color:var(--k-acc);flex:none}
.tl-stat.gem .tl-si{color:var(--k-vio)}.tl-stat.gem{background:linear-gradient(135deg,rgba(139,107,255,.18),rgba(70,212,255,.06))}
.tl-stat b{display:block;font:700 22px/1 var(--k-fd)}
.tl-stat small{font:600 10px var(--k-fd);letter-spacing:.09em;text-transform:uppercase;color:var(--k-tx2)}
.tl-gift{flex:1 1 100%}
.tl-sect{font:700 11px var(--k-fd);letter-spacing:.12em;text-transform:uppercase;color:var(--k-tx3);margin:0 0 8px;display:flex;align-items:center;gap:8px}
.tl-sect::after{content:'';flex:1;height:1px;background:var(--k-line)}
.tl-sect em{font-style:normal;color:var(--k-tx2);letter-spacing:.04em}
.tl-panel{background:linear-gradient(180deg,rgba(17,26,51,.75),rgba(11,17,34,.55));border:1px solid var(--k-line);border-radius:var(--ds-r-lg,16px);padding:10px;margin-bottom:12px}
.tl-top{display:block}
.tl-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px}
.tl-slot{position:relative;aspect-ratio:1;min-height:64px;border:1.5px dashed var(--k-line2);border-radius:var(--ds-r-md,10px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;text-align:center;padding:2px;color:var(--k-tx3);font:600 9px/1.1 var(--k-fd);letter-spacing:.05em;text-transform:uppercase;background:rgba(6,9,18,.5);cursor:default}
.tl-slot.full{border:1.5px solid var(--c);border-style:solid;background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--c) 22%,var(--k-bg2)),var(--k-bg1));box-shadow:0 0 12px -3px var(--c);cursor:pointer;color:var(--c)}
.tl-slot.lock{opacity:.5}
.tl-slot .tl-sn{color:var(--k-tx);font:700 9px/1.1 var(--k-fd);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:0;text-transform:none}
.tl-slot.is-sel{outline:2px solid #fff;outline-offset:1px}
.tl-ladder{display:flex;gap:4px;margin-top:10px;flex-wrap:wrap}
.tl-lad{flex:1;min-width:34px;text-align:center;padding:3px 2px;border-radius:var(--ds-r-sm,6px);border:1px solid var(--k-line);font:700 10px var(--k-fd);color:var(--k-tx3)}
.tl-lad b{display:block;font-size:13px;color:var(--k-tx2)}
.tl-lad.cur{border-color:var(--k-acc);background:rgba(70,212,255,.1)}.tl-lad.cur b{color:var(--k-acc)}
.tl-lad.past b{color:var(--k-tx)}
.tl-syn{display:grid;gap:8px}
.tl-sy{padding:8px 10px;border:1px solid var(--k-line);border-radius:var(--ds-r-md,10px);background:rgba(130,200,255,.04)}
.tl-sy.on{border-color:var(--c);background:linear-gradient(90deg,color-mix(in srgb,var(--c) 14%,transparent),transparent);box-shadow:0 0 14px -6px var(--c)}
.tl-sy-h{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.tl-sy-i{width:26px;height:26px;display:grid;place-items:center;color:var(--c);flex:none}
.tl-sy-n{font:700 13px var(--k-fd);letter-spacing:.05em;text-transform:uppercase;flex:1}
.tl-sy-c{font:700 12px var(--k-fd);color:var(--c)}
.tl-gauge{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.tl-seg{height:8px;border-radius:2px;background:var(--k-bg3);border:1px solid var(--k-line);position:relative}
.tl-seg.on{background:var(--c);border-color:var(--c);box-shadow:0 0 8px var(--c)}
.tl-segl{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:3px;font:700 10px var(--k-fd);color:var(--k-tx3);text-align:center}
.tl-segl .on{color:var(--c)}
.tl-sy-d{font-size:11.5px;line-height:1.35;color:var(--k-tx2);margin-top:5px}
.tl-sy-d .nx{color:var(--k-tx3)}
.tl-syn-idle{display:flex;flex-wrap:wrap;gap:6px}
.tl-idle{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;border:1px dashed var(--k-line2);font:700 11px var(--k-fd);color:var(--k-tx3)}
.tl-idle svg{color:var(--c)}
.tl-muted{color:var(--k-tx3);font-size:12px;line-height:1.4}
.tl-evo{margin-bottom:12px;border:1px solid var(--ds-r-mythique,#ff3d6e);border-color:var(--r-mythique,#ff3d6e);border-radius:var(--ds-r-lg,16px);padding:10px;background:linear-gradient(135deg,rgba(255,61,110,.13),rgba(139,107,255,.08));box-shadow:0 0 24px -8px var(--r-mythique,#ff3d6e);position:relative;overflow:hidden}
.tl-evo .tl-sect{color:var(--r-mythique,#ff3d6e)}.tl-evo .tl-sect::after{background:rgba(255,61,110,.3)}
.tl-evr{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0;border-top:1px solid rgba(255,61,110,.2)}
.tl-evr:first-of-type{border-top:0}
.tl-evc{display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;font:700 10px/1.15 var(--k-fd);text-align:center}
.tl-ico{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--c);background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--c) 28%,var(--k-bg2)),var(--k-bg1) 75%);border:1.5px solid var(--c);box-shadow:0 0 12px -2px var(--c)}
.tl-evp{color:var(--k-tx3);font-weight:700}
.tl-eva{color:var(--r-mythique,#ff3d6e);animation:tlarrow 1.2s ease-in-out infinite}
@keyframes tlarrow{50%{transform:translateX(5px);filter:drop-shadow(0 0 6px var(--r-mythique,#ff3d6e))}}
.tl-evgo{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:1 1 140px}
.tl-evgo .tl-muted{text-align:right}
.tl-filters{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.tl-scrollx{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.tl-scrollx::-webkit-scrollbar{display:none}
.tl-nods .tl-seg2{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--k-line);border-radius:var(--ds-r-md,10px);background:rgba(6,9,18,.6)}
.tl-nods .tl-seg2 button{border:0;background:none;color:var(--k-tx2);font:700 12px var(--k-fd);padding:8px 12px;border-radius:var(--ds-r-sm,6px);cursor:pointer;white-space:nowrap;min-height:36px}
.tl-seg2{min-width:max-content}
.tl-nods .tl-seg2 button.is-active{background:var(--k-bg3);color:var(--c,var(--k-tx));box-shadow:inset 0 -2px 0 var(--c,var(--k-acc))}
.tl-chips{display:flex;gap:6px;min-width:min-content}
.tl-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;border:1px solid var(--k-line2);background:rgba(6,9,18,.5);color:var(--k-tx2);font:700 11px var(--k-fd);cursor:pointer;white-space:nowrap;min-height:32px}
.tl-chip.is-active{border-color:var(--k-acc);color:var(--k-tx);background:rgba(70,212,255,.14)}
.tl-main{display:block}
.tl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tl-card{position:relative;align-items:center;gap:4px;padding:10px 4px 8px;min-height:138px;text-align:center;overflow:hidden}
.tl-nods .tl-card{display:flex;flex-direction:column;border:1.5px solid var(--c);border-radius:var(--ds-r-md,10px);background:linear-gradient(165deg,color-mix(in srgb,var(--c) 14%,var(--k-bg2)),var(--k-bg1) 70%);color:var(--k-tx);cursor:pointer}
.tl-card.dim{opacity:.42;filter:saturate(.45)}
.tl-card.dim:hover{opacity:.8}
.tl-card .tl-ico{width:46px;height:46px}
.tl-cn{font:700 12px/1.15 var(--k-fd);padding:0 4px;min-height:28px;display:flex;align-items:center}
.tl-cr{font:700 9px var(--k-fd);letter-spacing:.12em;text-transform:uppercase;color:var(--c)}
.tl-stars{display:flex;gap:1px;justify-content:center;color:var(--k-bg3)}.tl-stars .on{color:var(--k-gold);filter:drop-shadow(0 0 3px rgba(255,201,74,.6))}
.tl-stars svg{width:11px;height:11px}.tl-stars .tl-star{font-size:10px;line-height:11px}
.tl-eq{position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:var(--k-ok);color:#02150c;display:grid;place-items:center}
.tl-evtag{position:absolute;top:4px;left:4px;color:var(--r-mythique,#ff3d6e);animation:tlarrow 1.2s ease-in-out infinite}
.tl-cls{font:600 9px var(--k-fd);color:var(--k-tx3)}
.tl-shine::after{content:'';position:absolute;top:-20%;bottom:-20%;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);transform:skewX(-18deg);animation:tlshine 3.4s ease-in-out infinite;pointer-events:none}
@keyframes tlshine{0%,55%{left:-60%}100%{left:130%}}
.tl-card.sec{animation:tlsecret 2.4s ease-in-out infinite}
@keyframes tlsecret{50%{box-shadow:0 0 22px 0 var(--c)}}
.tl-card.lvl{animation:tllvl .9s var(--ds-ease-out-back,cubic-bezier(.34,1.56,.64,1))}
@keyframes tllvl{0%{transform:scale(.92)}50%{transform:scale(1.08);box-shadow:0 0 34px 4px var(--c)}100%{transform:scale(1)}}
.tl-fiche{margin-top:12px;position:relative;--wc:var(--c);filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}
.tl-nods .tl-fiche{border:1px solid var(--c);border-radius:var(--ds-r-lg,16px);overflow:hidden;background:linear-gradient(180deg,#0d1530,#080d1d)}
.tl-fh{display:flex;gap:12px;align-items:center;padding:12px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 20%,transparent),transparent);border-bottom:1px solid var(--k-line)}
.tl-fh .tl-ico{width:58px;height:58px;flex:none}
.tl-fn{font:700 17px/1.1 var(--k-fd);letter-spacing:.03em;color:var(--c)}
.tl-fbd{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.tl-bdg{font:700 10px var(--k-fd);letter-spacing:.07em;text-transform:uppercase;padding:2px 8px;border-radius:10px;border:1px solid var(--k-line2);color:var(--k-tx2);display:inline-flex;gap:4px;align-items:center}
.tl-bdg.r{color:var(--c);border-color:var(--c)}
.tl-fx{margin-left:auto;align-self:flex-start;width:36px;height:36px;display:grid;place-items:center;background:none;border:1px solid var(--k-line);border-radius:50%;color:var(--k-tx2);cursor:pointer;flex:none}
.tl-fb{padding:12px;display:flex;flex-direction:column;gap:10px}
.tl-lv{font-size:13px;line-height:1.45;padding:8px 10px;border-radius:var(--ds-r-sm,6px);background:rgba(130,200,255,.05);border-left:3px solid var(--c)}
.tl-lv small{display:flex;align-items:center;gap:6px;font:700 10px var(--k-fd);letter-spacing:.1em;text-transform:uppercase;color:var(--k-tx3);margin-bottom:2px}
.tl-lv.nx{border-left-color:var(--k-ok);background:rgba(57,224,140,.07)}.tl-lv.nx small{color:var(--k-ok)}
.tl-cost{display:grid;gap:5px}
.tl-cost-r{display:flex;justify-content:space-between;align-items:center;font:700 12px var(--k-fd);color:var(--k-tx2)}
.tl-cost-r b{display:inline-flex;align-items:center;gap:4px;color:var(--k-vio)}.tl-cost-r b.bad{color:var(--k-bad)}
.tl-cbar{height:8px;border-radius:4px;background:var(--k-bg3);border:1px solid var(--k-line);overflow:hidden}
.tl-cbar i{display:block;height:100%;background:linear-gradient(90deg,#7c5cff,#b48bff);border-radius:4px;transition:width .5s var(--ds-ease,ease)}
.tl-ff{display:flex;flex-wrap:wrap;gap:8px;padding:0 12px 12px}
.tl-ff .ds-btn{flex:1 1 130px}
@media(min-width:760px){.tl-ff .ds-btn{flex:1 1 100%}}
.tl-msg{font-size:12px;color:var(--ds-warning,#ffb547);padding:0 12px 10px}
.tl-fiche.lvl .tl-ico{animation:tllvl .9s var(--ds-ease-out-back,cubic-bezier(.34,1.56,.64,1))}
.tl-fiche.lvl::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 0,color-mix(in srgb,var(--c) 45%,transparent),transparent 60%);animation:tlflash 1s ease-out forwards;pointer-events:none;z-index:2}
@keyframes tlflash{from{opacity:1}to{opacity:0}}
.tl-lvup{position:absolute;left:50%;top:44px;transform:translateX(-50%);font:700 18px var(--k-fd);color:var(--k-gold);text-shadow:0 0 12px var(--k-gold);animation:tlup 1.1s ease-out forwards;pointer-events:none;z-index:3;letter-spacing:.08em}
@keyframes tlup{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,-34px)}}
.tl-root .ds-btn,.tl-choice .ds-btn{white-space:nowrap}
.tl-nods .ds-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:8px 14px;border-radius:var(--ds-r-md,10px);border:1px solid var(--k-line2);background:var(--k-bg3);color:var(--k-tx);font:700 13px var(--k-fd);letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
.tl-nods .ds-btn--primary{background:var(--k-acc);color:#031018;border-color:var(--k-acc)}
.tl-nods .ds-btn--gold{background:var(--k-gold);border-color:var(--k-gold);color:#241a00}
.tl-nods .ds-btn--violet{background:var(--k-vio);border-color:var(--k-vio);color:#fff}
.tl-nods .ds-btn--danger{background:rgba(255,77,106,.15);color:#ff8fa3;border-color:var(--k-bad)}
.tl-nods .ds-btn[disabled]{opacity:.45;cursor:default}
.tl-bi{display:inline-flex}
@media(max-width:759px){
 .tl-fiche{position:sticky;bottom:6px;z-index:5}
 .tl-fiche .tl-fb{max-height:30vh;overflow:auto}
}
@media(min-width:760px){
 .tl-top{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;align-items:start}
 .tl-top .tl-panel{margin-bottom:12px}
 .tl-main{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
 .tl-grid{grid-template-columns:repeat(auto-fill,minmax(112px,1fr))}
 .tl-fiche{margin-top:0;position:sticky;top:8px}
}
/* ---------- fenêtre de choix (offre de 3 dons) ---------- */
.tl-choice{--k-line:var(--ds-line,rgba(130,180,255,.16));--k-line2:var(--ds-line-strong,rgba(130,200,255,.36));--k-tx:var(--ds-text,#e8f0ff);--k-tx2:var(--ds-text-2,#a9b8d6);--k-tx3:var(--ds-text-3,#6f7fa3);--k-bg1:var(--ds-bg-1,#0b1122);--k-bg2:var(--ds-bg-2,#111a33);--k-bg3:var(--ds-bg-3,#18233f);--k-gold:var(--ds-gold,#ffc94a);--k-vio:var(--ds-accent-2,#8b6bff);
--k-fd:var(--ds-font-display,'Chakra Petch',system-ui,sans-serif);--k-fb:var(--ds-font-body,'Nunito',system-ui,sans-serif);font-family:var(--k-fb);color:var(--k-tx)}
.tl-ch-sub{text-align:center;font:600 12px var(--k-fd);letter-spacing:.1em;text-transform:uppercase;color:var(--k-tx2);margin:0 0 12px}
.tl-ch-row{display:flex;flex-direction:column;gap:10px;perspective:1100px}
.tl-ch-card{position:relative;display:block;width:100%;height:132px;padding:0;border:0;background:none;cursor:pointer;color:inherit;font:inherit;text-align:left;transform-style:preserve-3d;transform:rotateY(180deg);opacity:0;animation:tlflip .8s var(--ds-ease-out-back,cubic-bezier(.34,1.56,.64,1)) forwards;animation-delay:calc(.15s + var(--i,0)*.22s);-webkit-tap-highlight-color:transparent;transition:filter .2s}
@keyframes tlflip{0%{transform:rotateY(180deg) scale(.8);opacity:0}25%{opacity:1}100%{transform:rotateY(0) scale(1);opacity:1}}
.tl-ch-in{position:absolute;inset:0;transition:transform .28s var(--ds-ease,ease);transform-style:preserve-3d}
.tl-ch-card:hover .tl-ch-in,.tl-ch-card:focus-visible .tl-ch-in{transform:translateY(-6px) scale(1.03)}
.tl-ch-card:active .tl-ch-in{transform:scale(.97)}
.tl-ch-card:hover .tl-ch-front{box-shadow:0 0 0 1px var(--c),0 0 40px -2px var(--c),0 18px 30px rgba(0,0,0,.5)}
.tl-ch-card:focus-visible{outline:none}
.tl-ch-front{position:absolute;inset:0;display:flex;gap:12px;align-items:center;padding:12px;border-radius:var(--ds-r-lg,16px);border:1.5px solid var(--c);background:linear-gradient(165deg,color-mix(in srgb,var(--c) 22%,#0d1530),#080d1d 75%);box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 40%,transparent),0 0 26px -4px var(--c);overflow:hidden;backface-visibility:hidden;transition:box-shadow .25s}
.tl-ch-front::before{content:'';position:absolute;left:-30%;top:-40%;width:90%;height:160%;background:radial-gradient(circle,color-mix(in srgb,var(--c) 40%,transparent),transparent 65%);opacity:.55;pointer-events:none;animation:tlhalo 3s ease-in-out infinite}
@keyframes tlhalo{50%{opacity:.9;transform:scale(1.1)}}
.tl-ch-ico{position:relative;width:64px;height:64px;border-radius:50%;display:grid;place-items:center;flex:none;color:var(--c);background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--c) 30%,#111a33),#0b1122 75%);border:2px solid var(--c);box-shadow:0 0 22px var(--c)}
.tl-ch-t{position:relative;min-width:0;flex:1}
.tl-ch-r{font:700 10px var(--k-fd);letter-spacing:.16em;text-transform:uppercase;color:var(--c);margin-bottom:2px;display:flex;align-items:center;gap:6px}
.tl-ch-n{font:700 17px/1.1 var(--k-fd);letter-spacing:.03em;margin-bottom:4px}
.tl-ch-d{font-size:12px;line-height:1.35;color:var(--k-tx2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.tl-ch-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}
.tl-ch-tags span{font:700 9px var(--k-fd);letter-spacing:.06em;text-transform:uppercase;padding:1px 7px;border-radius:9px;border:1px solid var(--k-line2);color:var(--k-tx2)}
.tl-ch-dup{display:inline-flex;align-items:center;gap:4px;color:var(--k-vio);font:700 11px var(--k-fd);margin-top:4px}
.tl-ch-new{position:absolute;top:8px;right:10px;font:700 9px var(--k-fd);letter-spacing:.12em;color:#041018;background:var(--ds-accent,#46d4ff);padding:2px 7px;border-radius:8px}
.tl-ch-key{position:absolute;bottom:6px;right:10px;font:700 10px var(--k-fd);color:var(--k-tx3)}
.tl-ch-front.tl-shine::after{z-index:3}
@media(min-width:620px){
 .tl-ch-row{flex-direction:row;gap:14px}
 .tl-ch-card{height:310px;flex:1;min-width:0}
 .tl-ch-front{flex-direction:column;justify-content:flex-start;text-align:center;padding:18px 14px;gap:10px}
 .tl-ch-ico{width:92px;height:92px;margin-top:6px}
 .tl-ch-t{flex:0 1 auto;width:100%}.tl-ch-r{justify-content:center}.tl-ch-n{font-size:19px}
 .tl-ch-d{-webkit-line-clamp:5;font-size:12.5px}.tl-ch-tags{justify-content:center}
}
@media(prefers-reduced-motion:reduce){.tl-root *,.tl-choice *{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important}.tl-ch-card{opacity:1;transform:none}}
`;
  function injectCss() {
    if (typeof document === 'undefined') return;
    let s = document.getElementById('tl-style');
    if (!s) { s = document.createElement('style'); s.id = 'tl-style'; document.head.appendChild(s); }
    if (s.textContent !== CSS) s.textContent = CSS;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hasIcon = n => { try { return !!(G.Icons && G.Icons.has && G.Icons.has(n) && G.Icons.svg); } catch (_) { return false; } };
  const ic = (n, s, fb) => { if (hasIcon(n)) { try { return G.Icons.svg(n, { size: s }) || ''; } catch (_) {} } return fb ? '<span style="font-size:' + Math.round(s * .9) + 'px;line-height:1">' + esc(fb) + '</span>' : ''; };
  const hasDS = () => { try { return !!getComputedStyle(document.documentElement).getPropertyValue('--ds-accent').trim(); } catch (_) { return false; } };
  const TAG_ICON = { foudre: ['lightning'], feu: ['fire'], glace: ['ice'], ombre: ['shadow'], sacre: ['holy'], poison: ['poison'], physique: ['sword'], critique: ['target', 'star-fill'], invocation: ['users', 'skull'], defense: ['shield'], mobilite: ['dash', 'arrow-right'], butin: ['gold', 'gem'], sort: ['sparkles', 'rune'] };
  const firstIcon = (list, s, fb) => { for (const n of list) if (hasIcon(n)) return ic(n, s); return fb ? ic('x-none', s, fb) : ''; };
  const RAR_COL = { commun: '#b8c0cc', rare: '#3fa9ff', epique: '#b44dff', legendaire: '#ffb020', mythique: '#ff3d6e', secret: '#00ffd0' };
  const rcol = r => (M() && M().colors && M().colors[r]) || RAR_COL[r] || '#b8c0cc';
  const TAG_COL = { foudre: '#ffe45c', feu: '#ff7a3d', glace: '#6fdcff', ombre: '#a67bff', sacre: '#ffe9a0', poison: '#7cdc5a', physique: '#cfd8ea', critique: '#ff6b6b', invocation: '#b48bff', defense: '#5fb0ff', mobilite: '#7cf0d0', butin: '#ffc94a', sort: '#8b9bff' };
  function tIcon(d, s) { const t = d.tags && d.tags[0]; return firstIcon((TAG_ICON[t] || []).concat(['rune']), s, d.icon); }
  function tagIco(tag, s) { return firstIcon(TAG_ICON[tag] || ['rune'], s, (M().tagIcons || {})[tag]); }
  const star = (on, s) => '<span class="' + (on ? 'on' : '') + '">' + (hasIcon('star-fill') ? ic('star-fill', s || 11) : '<span class="tl-star">★</span>') + '</span>';
  const stars = (lv, max) => '<div class="tl-stars">' + Array.from({ length: max }, (_, i) => star(i < lv)).join('') + '</div>';
  const btn = (cls, label, attrs, icon) => '<button type="button" class="ds-btn ' + cls + '" ' + (attrs || '') + '>' + (icon ? '<span class="ds-btn__icon tl-bi">' + icon + '</span>' : '') + label + '</button>';
  const isHigh = r => r === 'legendaire' || r === 'mythique' || r === 'secret';
  function tip(node, html) {
    try { if (G.UI && G.UI.tooltip) { G.UI.tooltip(node, html); return; } } catch (_) {}
    node.title = String(html).replace(/<[^>]+>/g, ' ');
  }

  const ui = { sel: null, filter: 'tous', tag: 'tous', msg: '', flash: null, flashType: '' };

  function render(container, profile) {
    injectCss();
    const p = profile || prof(); if (!p) return;
    ensureProfile(p); const t = p.talents, M_ = M();
    const ord = rankOrder();
    const again = () => render(container, p);
    const act = (fn) => { const r = fn(); ui.msg = (r && r.ok === false && r.reason) ? r.reason : ''; persist(p); again(); return r; };
    const curIdx = Math.max(0, ord.indexOf(p.rank || 'E'));
    const bonus = Math.max(0, t.slots - (2 + curIdx));
    let h = '<div class="tl-root' + (hasDS() ? '' : ' tl-nods') + '">';

    // en-tête
    h += '<div class="tl-head"><div class="tl-stat"><span class="tl-si">' + ic('rune', 26, '🧩') + '</span><div><b>' + t.equipped.length + '/' + t.slots + '</b><small>Emplacements</small></div></div>' +
      '<div class="tl-stat gem"><span class="tl-si">' + ic('gem', 26, '💎') + '</span><div><b>' + t.shards + '</b><small>Éclats</small></div></div>';
    if (t.pending > 0) h += btn('ds-btn--gold ds-btn--lg tl-gift', 'Choisir un don · ' + t.pending, 'data-act="pending"', ic('gift', 18, '🎁'));
    h += '</div>';

    // emplacements + synergies
    h += '<div class="tl-top"><div class="tl-panel"><div class="tl-sect">Dons équipés</div><div class="tl-slots">';
    const nSlots = Math.min(9, Math.max(6, t.slots + 2));
    for (let i = 0; i < nSlots; i++) {
      const id = t.equipped[i];
      if (id) {
        const d = def(id), lv = t.owned[id];
        h += '<div class="tl-slot full' + (ui.sel === id ? ' is-sel' : '') + '" data-sel="' + id + '" data-tip="' + id + '" style="--c:' + rcol(d.rarity) + '">' + tIcon(d, 24) + '<span class="tl-sn">' + esc(d.name) + '</span>' + stars(lv, d.maxLevel).replace('class="tl-stars"', 'class="tl-stars" style="transform:scale(.8)"') + '</div>';
      } else if (i < t.slots) h += '<div class="tl-slot">' + ic('plus', 20, '+') + 'Libre</div>';
      else h += '<div class="tl-slot lock">' + ic('lock', 18, '🔒') + 'Rang ' + esc(ord[Math.min(ord.length - 1, Math.max(0, i - 1 - bonus))] || '?') + '</div>';
    }
    h += '</div><div class="tl-ladder" title="Emplacements par rang">' + ord.map((r, i) => '<div class="tl-lad' + (i === curIdx ? ' cur' : i < curIdx ? ' past' : '') + '">' + esc(r) + '<b>' + Math.min(9, 2 + i + bonus) + '</b></div>').join('') + '</div></div>';

    const counts = tagCounts(p), S = G.TALENT_SYNERGIES || {};
    const tags = Object.keys(counts).filter(k => S[k]).sort((a, b) => counts[b] - counts[a]);
    h += '<div class="tl-panel"><div class="tl-sect">Synergies</div>';
    if (!tags.length) h += '<div class="tl-muted">Équipe 2, 3 ou 4 dons partageant un même tag pour activer des bonus.</div>';
    const act2 = tags.filter(k => counts[k] >= 2), idle = tags.filter(k => counts[k] < 2);
    h += '<div class="tl-syn">';
    act2.forEach(tag => {
      const n = counts[tag], sy = S[tag], tier = Math.min(4, n), c = TAG_COL[tag] || '#46d4ff';
      const nx = tier < 4 && sy.tiers[tier + 1] ? sy.tiers[tier + 1] : null;
      h += '<div class="tl-sy on" style="--c:' + c + '"><div class="tl-sy-h"><span class="tl-sy-i">' + tagIco(tag, 22) + '</span><span class="tl-sy-n">' + esc((M_.tagNames || {})[tag] || tag) + '</span><span class="tl-sy-c">×' + n + '</span></div>' +
        '<div class="tl-gauge">' + [2, 3, 4].map(k => '<span class="tl-seg' + (n >= k ? ' on' : '') + '"></span>').join('') + '</div><div class="tl-segl">' + [2, 3, 4].map(k => '<span class="' + (n >= k ? 'on' : '') + '">' + k + '</span>').join('') + '</div>' +
        '<div class="tl-sy-d">' + [2, 3, 4].filter(k => n >= k && sy.tiers[k]).map(k => esc(sy.tiers[k].desc)).join(' · ') + (nx ? '<div class="nx">Palier ' + (tier + 1) + ' : ' + esc(nx.desc) + '</div>' : '') + '</div></div>';
    });
    h += '</div>';
    if (idle.length) h += '<div class="tl-syn-idle" style="margin-top:' + (act2.length ? 8 : 0) + 'px">' + idle.map(tag => '<span class="tl-idle" style="--c:' + (TAG_COL[tag] || '#46d4ff') + '">' + tagIco(tag, 14) + esc((M_.tagNames || {})[tag] || tag) + ' 1/2</span>').join('') + '</div>';
    h += '</div></div>';

    // évolutions
    const evs = evolutions(p);
    const evOf = {}; evs.forEach(e => { if (e.ok) evOf[e.id] = e; });
    if (evs.length) {
      h += '<div class="tl-evo"><div class="tl-sect">' + ic('crown', 14) + ' Évolutions mythiques</div>';
      evs.forEach((e, i) => {
        const a = def(e.id), b = def(e.requires), c = def(e.into);
        const mini = (d, pre) => '<div class="tl-evc" style="--c:' + rcol(d.rarity) + '"><span class="tl-ico">' + tIcon(d, 22) + '</span><span>' + esc(d.name) + '</span></div>';
        h += '<div class="tl-evr">' + mini(a) + '<span class="tl-evp">+</span>' + mini(b) + '<span class="tl-eva">' + ic('arrow-right', 26, '→') + '</span>' + mini(c) +
          '<div class="tl-evgo">' + (e.ok ? '' : '<span class="tl-muted">' + esc(e.reason || '') + '</span>') + btn('ds-btn--primary', 'Évoluer', 'data-evo="' + i + '"' + (e.ok ? '' : ' disabled'), ic('sparkles', 16)) + '</div></div>';
      });
      h += '</div>';
    }

    // collection
    h += '<div class="tl-main"><div><div class="tl-sect">Collection <em>' + Object.keys(t.owned).length + ' obtenus</em></div><div class="tl-filters"><div class="tl-scrollx"><div class="ds-segmented tl-seg2" role="tablist">';
    ['tous'].concat(M_.order).forEach(f => {
      h += '<button type="button" class="' + (ui.filter === f ? 'is-active' : '') + '" data-filter="' + f + '"' + (f !== 'tous' ? ' style="--c:' + rcol(f) + '"' : '') + '>' + (f === 'tous' ? 'Tous' : esc(M_.names[f])) + '</button>';
    });
    h += '</div></div><div class="tl-scrollx"><div class="tl-chips">' + ['tous'].concat(Object.keys(M_.tagNames || {})).map(f =>
      '<button type="button" class="tl-chip' + (ui.tag === f ? ' is-active' : '') + '" data-tag="' + f + '"' + (f !== 'tous' ? ' style="--c:' + (TAG_COL[f] || '#fff') + '"' : '') + '>' + (f === 'tous' ? 'Tous les tags' : tagIco(f, 14) + esc(M_.tagNames[f])) + '</button>').join('') + '</div></div></div>';
    const ids = Object.keys(G.TALENTS).filter(id => {
      const d = def(id); if (ui.filter !== 'tous' && d.rarity !== ui.filter) return false;
      if (ui.tag !== 'tous' && (d.tags || []).indexOf(ui.tag) < 0) return false;
      if (d.rarity === 'secret' && !t.owned[id]) return false;
      if (d.evolved && !t.owned[id]) return false;
      return true;
    }).sort((a, b) => {
      const da = def(a), db = def(b);
      return (!!t.owned[b] - !!t.owned[a]) || (M_.order.indexOf(db.rarity) - M_.order.indexOf(da.rarity)) || da.name.localeCompare(db.name);
    });
    h += '<div class="tl-grid">';
    for (const id of ids) {
      const d = def(id), lv = t.owned[id] || 0, eq = t.equipped.indexOf(id) >= 0, locked = !classOk(d, p);
      h += '<button type="button" class="tl-card' + (lv ? '' : ' dim') + (ui.sel === id ? ' is-selected' : '') + (d.rarity === 'secret' ? ' sec' : '') + (ui.flash === id && ui.flashType === 'lvl' ? ' lvl' : '') + (isHigh(d.rarity) ? (hasDS() ? ' ds-shine' : ' tl-shine') : '') + ' ds-card ds-card--rarity" data-sel="' + id + '" data-tip="' + id + '" style="--c:' + rcol(d.rarity) + '">' +
        (eq ? '<span class="tl-eq">' + ic('check', 12, '✓') + '</span>' : '') + (evOf[id] ? '<span class="tl-evtag" title="Évolution possible">' + ic('arrow-up', 16, '▲') + '</span>' : '') +
        '<span class="tl-ico">' + tIcon(d, 24) + '</span><span class="tl-cn">' + esc(d.name) + '</span><span class="tl-cr">' + esc(M_.names[d.rarity]) + '</span>' + stars(lv, d.maxLevel) + (locked ? '<span class="tl-cls">' + esc(d.classes.join('/')) + '</span>' : '') + '</button>';
    }
    if (!ids.length) h += '<div class="tl-muted" style="grid-column:1/-1">Aucun don dans cette catégorie. Bats des mini-boss et des boss, ou monte de niveau (tous les 5 niveaux).</div>';
    h += '</div></div>';

    // fiche
    const sel = ui.sel && def(ui.sel) && (t.owned[ui.sel] || def(ui.sel).rarity !== 'secret') ? ui.sel : null;
    if (sel) {
      const id = sel, d = def(id), lv = t.owned[id] || 0, eq = t.equipped.indexOf(id) >= 0, c = rcol(d.rarity);
      h += '<aside class="tl-fiche ds-window' + (ui.flash === id && ui.flashType === 'lvl' ? ' lvl' : '') + '" style="--c:' + c + '">' + (ui.flash === id && ui.flashType === 'lvl' ? '<span class="tl-lvup">NIVEAU ' + lv + '</span>' : '') +
        '<div class="tl-fh ds-window__header"><span class="tl-ico">' + tIcon(d, 30) + '</span><div><div class="tl-fn">' + esc(d.name) + '</div><div class="tl-fbd"><span class="tl-bdg r">' + esc(M_.names[d.rarity]) + '</span>' +
        (d.tags || []).map(x => '<span class="tl-bdg">' + tagIco(x, 11) + esc((M_.tagNames || {})[x] || x) + '</span>').join('') + (d.classes ? '<span class="tl-bdg">' + esc(d.classes.join('/')) + '</span>' : '') + '</div></div><button type="button" class="tl-fx" data-act="close" aria-label="Fermer">' + ic('close', 16, '×') + '</button></div>' +
        '<div class="tl-fb ds-window__body">' + stars(lv, d.maxLevel).replace('<div class="tl-stars">', '<div class="tl-stars" style="gap:3px">') +
        '<div class="tl-lv"><small>' + (lv ? 'Niveau actuel ' + lv + '/' + d.maxLevel : 'Niveau 1') + (d.evolved ? ' · issu d\'une évolution' : '') + '</small>' + esc(d.desc(Math.max(1, lv))) + '</div>';
      if (lv && lv < d.maxLevel) {
        const cst = upgradeCost(id, lv);
        h += '<div class="tl-lv nx"><small>' + ic('arrow-up', 11) + ' Niveau ' + (lv + 1) + '</small>' + esc(d.desc(lv + 1)) + '</div>' +
          '<div class="tl-cost"><div class="tl-cost-r"><span>Coût d\'amélioration</span><b class="' + (t.shards < cst ? 'bad' : '') + '">' + ic('gem', 14, '💎') + cst + '</b></div><div class="tl-cbar"><i style="width:' + Math.min(100, Math.round(100 * t.shards / cst)) + '%"></i></div><div class="tl-cost-r"><span>Tes éclats</span><span>' + t.shards + ' / ' + cst + '</span></div></div>';
      }
      if (d.evolution) {
        const rq = def(d.evolution.requires) || {}, into = def(d.evolution.into) || {};
        h += '<div class="tl-lv" style="border-left-color:var(--r-mythique,#ff3d6e)"><small>' + ic('crown', 11) + ' Évolution</small>Niveau max + <b>' + esc(rq.name) + '</b> → <b style="color:var(--r-mythique,#ff3d6e)">' + esc(into.name) + '</b></div>';
      }
      if (!lv) h += '<div class="tl-muted">Non obtenu — butin de mini-boss, boss et niveaux.</div>';
      h += '</div><div class="tl-ff ds-window__footer">';
      if (lv) {
        if (lv >= d.maxLevel) h += btn('ds-btn--gold', 'Niveau max', 'disabled', ic('star-fill', 16));
        else { const cst = upgradeCost(id, lv); h += btn('ds-btn--gold', 'Améliorer · ' + cst, 'data-act="up"' + (t.shards < cst ? ' disabled' : ''), ic('gem', 16, '💎')); }
        h += btn(eq ? 'ds-btn--secondary' : 'ds-btn--primary', eq ? 'Retirer' : 'Équiper', 'data-act="eq"', ic(eq ? 'minus' : 'plus', 16));
      }
      h += '</div>' + (ui.msg ? '<div class="tl-msg">' + esc(ui.msg) + '</div>' : '') + '</aside>';
    } else h += '<aside class="tl-fiche ds-window" style="--c:#6f7fa3"><div class="tl-fb"><div class="tl-muted" style="text-align:center;padding:18px 6px">Touche un don pour voir sa fiche, l\'équiper ou l\'améliorer avec tes éclats.</div></div></aside>';
    h += '</div></div>';

    const sy = container.scrollTop;
    container.innerHTML = h; container.scrollTop = sy;
    ui.flash = null; ui.flashType = '';
    const q = s => Array.prototype.slice.call(container.querySelectorAll(s));
    q('[data-sel]').forEach(n => {
      const id = n.getAttribute('data-sel'), d = def(id), lv = t.owned[id] || 0;
      n.addEventListener('click', () => { ui.sel = id; ui.msg = ''; again(); });
      if (d) tip(n, '<b>' + esc(d.name) + '</b> — ' + esc(M_.names[d.rarity]) + '<br>' + esc(d.desc(Math.max(1, lv))));
    });
    q('[data-filter]').forEach(n => n.addEventListener('click', () => { ui.filter = n.getAttribute('data-filter'); again(); }));
    q('[data-tag]').forEach(n => n.addEventListener('click', () => { ui.tag = n.getAttribute('data-tag'); again(); }));
    q('[data-evo]').forEach(n => n.addEventListener('click', () => {
      const e = evs[+n.getAttribute('data-evo')]; if (!e) return; const c = def(e.into);
      const r = act(() => evolve(p, e.id)); if (r.ok) { ui.sel = e.into; notify('Évolution : ' + c.name, 'mythique', c.icon); again(); }
    }));
    q('[data-act]').forEach(n => n.addEventListener('click', () => {
      const a = n.getAttribute('data-act');
      if (a === 'pending') { flushPending(p); setTimeout(again, 400); }
      else if (a === 'close') { ui.sel = null; again(); }
      else if (a === 'up') { const r = levelUp(p, ui.sel); ui.msg = r.ok ? '' : (r.reason || ''); if (r.ok) { ui.flash = ui.sel; ui.flashType = 'lvl'; } persist(p); again(); }
      else if (a === 'eq') { const id = ui.sel; act(() => (t.equipped.indexOf(id) >= 0 ? unequip(p, id) : equip(p, id))); }
    }));
  }

  // ------------------------------------------------------------------ fenêtre de choix : 3 cartes qui se retournent
  function choiceWindow(ids, p, job) {
    const M_ = M();
    return new Promise(resolve => {
      if (!(G.UI && G.UI.modal) || typeof document === 'undefined') {
        if (G.UI && G.UI.choice) return G.UI.choice({ title: job.title, options: ids.map(id => ({ label: def(id).name, desc: describeOpt(id, p), value: id, icon: def(id).icon, rarity: def(id).rarity })) }).then(resolve, () => resolve(null));
        return resolve(null);
      }
      injectCss();
      const root = document.createElement('div'); root.className = 'tl-choice' + (hasDS() ? '' : ' tl-nods');
      let h = '<div class="tl-ch-sub">Choisis un don — il est à toi pour toujours</div><div class="tl-ch-row">';
      ids.forEach((id, i) => {
        const d = def(id), owned = p.talents.owned[id], c = rcol(d.rarity);
        h += '<button type="button" class="tl-ch-card" data-pick="' + id + '" style="--c:' + c + ';--i:' + i + '"><span class="tl-ch-in"><span class="tl-ch-front ' + (isHigh(d.rarity) ? (hasDS() ? 'ds-shine' : 'tl-shine') : '') + '">' +
          (owned ? '' : '<span class="tl-ch-new">NOUVEAU</span>') + '<span class="tl-ch-ico">' + tIcon(d, 36) + '</span><span class="tl-ch-t"><span class="tl-ch-r" style="display:flex">' + esc(M_.names[d.rarity]) + '</span><span class="tl-ch-n" style="display:block">' + esc(d.name) + '</span>' +
          '<span class="tl-ch-d" style="display:-webkit-box">' + esc(d.desc(1)) + '</span>' + (owned ? '<span class="tl-ch-dup">Déjà possédé · +' + (M_.dupShards[d.rarity] || 5) + ' ' + ic('gem', 13, '💎') + '</span>' : '') +
          '<span class="tl-ch-tags">' + (d.tags || []).slice(0, 3).map(x => '<span>' + esc((M_.tagNames || {})[x] || x) + '</span>').join('') + (d.classes ? '<span>' + esc(d.classes.join('/')) + '</span>' : '') + '</span></span><span class="tl-ch-key">' + (i + 1) + '</span></span></span></button>';
      });
      root.innerHTML = h + '</div>';
      let closeFn = null, done = false;
      const finish = v => { if (done) return; done = true; resolve(v); };
      const pr = G.UI.modal({
        title: job.title || 'Choisis un don', node: root, wide: true, dismissable: false, buttons: [{ label: 'Choisir', value: null }],
        onOpen: (body, close) => {
          closeFn = close;
          try {
            const host = body.closest('.sys-win,.ds-modal,[role="dialog"]') || body.parentNode;
            if (host && host.style) { host.style.maxWidth = 'min(96vw,880px)'; host.style.width = 'min(96vw,880px)'; }
            const foot = host && host.querySelector('.sys-foot,.ds-modal__footer,.ds-window__footer,[class*="foot"]'); if (foot) foot.style.display = 'none';
          } catch (_) {}
          Array.prototype.forEach.call(root.querySelectorAll('[data-pick]'), b => b.addEventListener('click', () => { const v = b.getAttribute('data-pick'); finish(v); try { close(v); } catch (_) {} }));
        },
      });
      Promise.resolve(pr).then(v => finish(v && def(v) ? v : null), () => finish(null));
    });
  }

  const panel = {
    id: 'dons', title: 'Dons', icon: '🔮', order: 4,
    visible: () => true,
    badge: p => { p = p || prof(); return p && p.talents && p.talents.pending > 0 ? p.talents.pending : 0; },
    render,
  };
  try { if (G.UI && G.UI.registerPanel) G.UI.registerPanel(panel); else G.Panels.register('dons', panel); } catch (e) { console.error(e); }

  // ------------------------------------------------------------------ API publique
  G.Talents = {
    flags,
    ensureProfile, slotsFor, grant, levelUp, upgradeCost, equip, unequip,
    canEvolve, evolve, evolutions,
    tagCounts, activeSynergies,
    offerChoice, applyAll, syncIfChanged, removeAll,
    offer,            // offer(titre, luck) → ouvre un choix de 3 dons (G.UI.choice)
    flushPending,     // ouvre les choix en attente (niveaux 5, 10…)
    render, panel,
    _liveCount() { return removers.length; },
  };
})();
