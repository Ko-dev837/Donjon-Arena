window.G = window.G || {};
/* =====================================================================
 * Donjon Arena 3D v3 — js/sys/portals.js (rôle 7) -> G.Portals
 * Portails (failles) : génération, accès, description, panneau « Portails »
 * du camp, animations d'ouverture, cycle de vie après chaque run.
 * Voir CONTRACT-V3.md §8 / §10.  Préfixe CSS : .pt-
 * ===================================================================== */
(() => {
  const G = window.G;
  const ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'Z'];
  const RCOL = { E: '#9aa3ad', D: '#4fd17a', C: '#3fa9ff', B: '#b44dff', A: '#ff8a1a', S: '#ff3d3d', Z: '#ffd700' };
  const RNAME = { E: 'Rang E', D: 'Rang D', C: 'Rang C', B: 'Rang B', A: 'Rang A', S: 'Rang S', Z: 'Rang Z' };
  const RARS = ['commun', 'rare', 'epique', 'legendaire', 'mythique'];
  const RAR_COL = { commun: '#b8c0cc', rare: '#3fa9ff', epique: '#b44dff', legendaire: '#ffb020', mythique: '#ff3d6e', secret: '#00ffd0' };
  const RAR_NAME = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire', mythique: 'Mythique' };
  const RAR_BY_RANK = { E: ['commun', 'rare'], D: ['commun', 'rare'], C: ['rare', 'epique'], B: ['rare', 'epique', 'legendaire'], A: ['epique', 'legendaire'], S: ['epique', 'legendaire', 'mythique'], Z: ['legendaire', 'mythique'] };
  const FALLBACK_POWER = { E: 0, D: 480, C: 600, B: 820, A: 1100, S: 1650, Z: 2150 };
  const TYPES = {
    normal: { label: 'Portail', accent: null },
    rouge: { label: 'Faille rouge', accent: '#e0102e' },
    double: { label: 'Double faille', accent: '#8a6bff' },
    cache: { label: 'Faille cachée', accent: '#00ffd0' },
    evenement: { label: 'Événement', accent: '#ffb020' },
    epreuve: { label: 'Épreuve de rang', accent: '#ffe9a0' },
  };
  // modificateurs propres aux portails (affichage) — les autres viennent de G.ProcgenMeta
  const FLAG_MODS = {
    sortie_bloquee: { name: 'Sortie bloquée', desc: 'Impossible de quitter le donjon avant la mort du boss.', icon: '🔒' },
    recompenses_x2: { name: 'Récompenses x2', desc: 'Or et expérience doublés.', icon: '💰' },
    donjon_cache: { name: 'Donjon caché', desc: 'Un second donjon, plus dur, se dissimule derrière le boss.', icon: '🌀' },
    butin_voile: { name: 'Butin voilé', desc: 'Récompenses améliorées (x1,5).', icon: '🎁' },
    instable: { name: 'Faille instable', desc: 'Récompenses améliorées (x1,5), durée de vie courte.', icon: '⚡' },
    doree: { name: 'Portail doré', desc: 'Or x3 !', icon: '🌟' },
  };
  const TARGET_MIN = 6, TARGET_MAX = 9;
  const MSG = (req, cur) => 'ACCÈS REFUSÉ : RANG ' + req + ' REQUIS. VOTRE RANG ACTUEL EST ' + cur + '.';

  // ------------------------------------------------------------------ utilitaires
  const rng = {
    f() { return (G.rng && G.rng.float) ? G.rng.float() : Math.random(); },
    int(a, b) { return a + Math.floor(rng.f() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(rng.f() * arr.length)]; },
    chance(p) { return rng.f() < p; },
    weighted(list) {
      const tot = list.reduce((s, x) => s + x.w, 0); let r = rng.f() * tot;
      for (const x of list) { r -= x.w; if (r < 0) return x; }
      return list[list.length - 1];
    },
  };
  const ri = (r) => ORDER.indexOf(r);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let seq = 0;
  const newId = () => 'pt' + Date.now().toString(36) + (seq++).toString(36) + Math.floor(rng.f() * 1e6).toString(36);
  const newSeed = () => rng.int(1, 2147483646);
  const curProfile = () => (G.game && G.game.profile) || null;
  function rgb(hex) {
    const h = String(hex || '#ffffff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16) || 0xffffff;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function persist() { try { G.game && G.game.saveProfile && G.game.saveProfile(); } catch (e) { /* ignore */ } }

  function playerRank(p) {
    let r = null;
    try { const c = G.Ranks && G.Ranks.current && G.Ranks.current(p); r = typeof c === 'string' ? c : (c && c.id); } catch (e) { /* ignore */ }
    if (ri(r) < 0) r = p && p.rank;
    return ri(r) >= 0 ? r : 'E';
  }

  // ------------------------------------------------------------------ modèles de donjon
  let v2Cache = null, v2Len = -1;
  function v2Templates() {
    const arr = (G.DATA && G.DATA.DUNGEONS) || [];
    if (v2Cache && v2Len === arr.length) return v2Cache;
    v2Len = arr.length;
    v2Cache = arr.map((d, i) => {
      const mons = []; let boss = null;
      (d.rooms || []).forEach((r) => {
        (r.waves || []).forEach((w) => w.forEach((e) => { if (mons.indexOf(e.type) < 0) mons.push(e.type); }));
        if (r.boss) boss = r.boss;
      });
      const rw = d.reward || {};
      return { id: d.id, name: d.name, desc: d.desc, rank: ORDER[Math.min(i, 5)], type: 'classique', theme: d.theme, icon: d.icon,
        monsters: mons, elites: [], minibosses: [], boss, rooms: { min: d.rooms.length, max: d.rooms.length },
        rewards: { gold: [rw.gold || 0, rw.gold || 0], xp: rw.xp || 0 }, v2: true, v2Index: i };
    });
    return v2Cache;
  }
  function allTemplates() {
    let list = [];
    const D = G.DUNGEONS;
    if (D) list = Array.isArray(D) ? D.slice() : Object.keys(D).map((k) => { const t = D[k]; if (t && !t.id) t.id = k; return t; });
    list = list.filter((t) => t && t.id && ri(t.rank) >= 0);
    return list.length ? list : v2Templates();
  }
  function getTemplate(id) {
    const D = G.DUNGEONS;
    if (D && !Array.isArray(D) && D[id]) { const t = D[id]; if (!t.id) t.id = id; return t; }
    const l = allTemplates();
    for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  const isSecretTpl = (t) => t.type === 'secret' || !!t.secret;
  const pools = () => {
    const all = allTemplates();
    return {
      all,
      normal: all.filter((t) => !isSecretTpl(t) && t.type !== 'evenement' && t.type !== 'epreuve'),
      secret: all.filter(isSecretTpl),
      event: all.filter((t) => t.type === 'evenement'),
      trial: all.filter((t) => t.type === 'epreuve'),
    };
  };
  function monsterName(id) {
    return (G.MONSTERS && G.MONSTERS[id] && G.MONSTERS[id].name) || (G.DATA && G.DATA.ENEMIES && G.DATA.ENEMIES[id] && G.DATA.ENEMIES[id].name) || id;
  }
  function bossName(id) {
    return (G.BOSSES && G.BOSSES[id] && G.BOSSES[id].name) || (G.DATA && G.DATA.BOSSES && G.DATA.BOSSES[id] && G.DATA.BOSSES[id].name) || id;
  }
  const hasMonster = (id) => !!((G.MONSTERS && G.MONSTERS[id]) || (G.DATA && G.DATA.ENEMIES && G.DATA.ENEMIES[id]));
  const hasBoss = (id) => !!((G.BOSSES && G.BOSSES[id]) || (G.DATA && G.DATA.BOSSES && G.DATA.BOSSES[id]));
  function resolvedTpl(t) {
    try { if (t.fallback && G.DungeonsMeta && G.DungeonsMeta.resolve) return G.DungeonsMeta.resolve(t, hasMonster, hasBoss); } catch (e) { /* ignore */ }
    return t;
  }
  function tplRooms(t) {
    const r = t.rooms;
    if (typeof r === 'number') return r;
    if (Array.isArray(r)) return r.length;
    if (r && r.min != null) return rng.int(r.min, r.max != null ? r.max : r.min);
    return 4;
  }
  function tplUnlocked(t, p) {
    if (!t.secret) return true;
    try { if (G.DungeonsMeta && G.DungeonsMeta.isUnlocked) return !!G.DungeonsMeta.isUnlocked(t, p); } catch (e) { /* ignore */ }
    return checkCond(t.secret.condition, p).ok;
  }

  // ------------------------------------------------------------------ conditions (fallback local)
  function checkCond(c, p) {
    if (!c) return { ok: true, text: '' };
    p = p || {}; const st = p.stats || {};
    const bad = (text) => ({ ok: false, text });
    switch (c.kind) {
      case 'goldenKills': return (st.goldenKills || 0) >= c.n ? { ok: true } : bad(c.n + ' spécimens dorés à tuer');
      case 'secretsFound': return (st.secrets || 0) >= c.n ? { ok: true } : bad(c.n + ' salles secrètes à trouver');
      case 'class': return p.classe === c.value ? { ok: true } : bad('classe ' + c.value);
      case 'rankMin': return ri(playerRank(p)) >= ri(c.rank) ? { ok: true } : bad('rang ' + c.rank);
      case 'item': {
        const inv = p.inventory || {};
        const ok = (inv.items || []).some((i) => i.baseId === c.id || i.id === c.id) || (inv.materials && inv.materials[c.id] > 0);
        return ok ? { ok: true } : bad('objet requis');
      }
      case 'all': { for (const x of (c.of || [])) { const r = checkCond(x, p); if (!r.ok) return r; } return { ok: true }; }
      default: break;
    }
    // ancien format libre
    if (c.level != null && (p.niveau || 1) < c.level) return bad('niveau ' + c.level);
    if (c.rank && ri(playerRank(p)) < ri(c.rank)) return bad('rang ' + c.rank);
    return { ok: true };
  }

  // ------------------------------------------------------------------ accès
  function canEnter(profile, portal) {
    if (!portal) return { ok: false, reason: 'PORTAIL INVALIDE.' };
    const cur = playerRank(profile);
    let req = portal.minRank || portal.rank || 'E';
    if (portal.type === 'epreuve') {
      // EXCEPTION UNIQUE : l'épreuve vise le rang suivant ; elle est ouverte au joueur du rang juste en dessous,
      // et seulement si c'est bien l'épreuve renvoyée par G.Ranks.eligibleForTrial(profile).
      req = ORDER[Math.max(0, ri(portal.rank) - 1)];
      if (G.Ranks && G.Ranks.eligibleForTrial) {
        let el = null;
        try { el = normTrial(G.Ranks.eligibleForTrial(profile)); } catch (e) { /* ignore */ }
        if (!el || el.id !== portal.trialId) return { ok: false, reason: 'ACCÈS REFUSÉ : ÉPREUVE NON DÉBLOQUÉE.', kind: 'trial' };
      }
    }
    let ok = ri(cur) >= ri(req);
    try {
      if (G.Ranks && G.Ranks.canEnter) {
        const r = G.Ranks.canEnter(profile, req);
        if (r && typeof r.ok === 'boolean') ok = r.ok && ok; // aucun passe-droit : le plus strict gagne
      }
    } catch (e) { /* ignore */ }
    if (!ok) return { ok: false, reason: MSG(req, cur), kind: 'rank' };
    if (portal.expiresAfterRuns != null && portal.expiresAfterRuns <= 0) return { ok: false, reason: 'ACCÈS REFUSÉ : CE PORTAIL S\'EST EFFONDRÉ.', kind: 'expired' };
    const t = getTemplate(portal.templateId);
    if (t && t.secret && !tplUnlocked(t, profile)) {
      const hint = t.secret.hint ? ' ' + t.secret.hint : '';
      return { ok: false, reason: 'ACCÈS REFUSÉ : CONDITION SECRÈTE NON REMPLIE.' + hint, kind: 'secret' };
    }
    return { ok: true, reason: '' };
  }

  // ------------------------------------------------------------------ modificateurs procgen
  function procgenMods() {
    const m = G.ProcgenMeta; if (!m) return [];
    const src = m.modifiers || m.MODIFIERS; if (!src) return [];
    const arr = Array.isArray(src) ? src : Object.keys(src).map((k) => Object.assign({ id: k }, src[k]));
    return arr.filter((x) => x && x.id && !x.portalOnly).map((x) => ({
      id: x.id, name: x.name || x.id, desc: x.desc || '', icon: x.icon || '✦', w: x.weight != null ? x.weight : 1,
      min: typeof x.rankMin === 'number' ? x.rankMin : (x.rankMin ? ri(x.rankMin) : 0),
    }));
  }
  function pickMods(rankI, type) {
    const list = procgenMods().filter((m) => m.min <= rankI);
    if (!list.length) return [];
    let n = 0;
    if (rankI >= 3) n = rng.int(1, 2); else if (rankI >= 1) n = rng.chance(0.5) ? 1 : 0;
    if (type === 'rouge') n += 1;
    const out = [];
    for (let i = 0; i < n && list.length; i++) {
      const m = rng.weighted(list); out.push(m.id); list.splice(list.indexOf(m), 1);
    }
    return out;
  }
  function modInfo(id) {
    if (FLAG_MODS[id]) return Object.assign({ id }, FLAG_MODS[id]);
    const l = procgenMods().find((m) => m.id === id);
    if (l) return { id, name: l.name, desc: l.desc, icon: l.icon };
    const mm = G.DungeonsMeta && G.DungeonsMeta.mechanics && G.DungeonsMeta.mechanics[id];
    if (mm) return { id, name: mm.name, desc: mm.desc, icon: '✦' };
    return { id, name: id, desc: '', icon: '✦' };
  }

  // ------------------------------------------------------------------ création d'un portail
  function raritiesFor(rank, tpl, type) {
    let r = (RAR_BY_RANK[rank] || ['commun']).slice();
    const g = (tpl && tpl.rewards && tpl.rewards.guaranteed) || [];
    g.forEach((x) => { if (x && x.rarity && r.indexOf(x.rarity) < 0 && RARS.indexOf(x.rarity) >= 0) r.push(x.rarity); });
    if (type === 'rouge' || type === 'cache' || type === 'double') {
      const top = Math.min(RARS.length - 1, RARS.indexOf(r[r.length - 1]) + 1);
      if (r.indexOf(RARS[top]) < 0) r.push(RARS[top]);
    }
    return r.sort((a, b) => RARS.indexOf(a) - RARS.indexOf(b));
  }
  function makePortal(profile, tpl, type, extra) {
    extra = extra || {};
    const rank = tpl.rank;
    const rI = ri(rank);
    const mods = extra.noMods ? [] : pickMods(rI, type);
    const flags = {};
    let rewardMult = 1, goldMult = 1, expires = rng.int(2, 5);
    let name = tpl.name, tag = null;
    if (type === 'rouge') { flags.exitLocked = true; rewardMult = 2; expires = rng.int(2, 3); name = 'Faille écarlate · ' + tpl.name; }
    else if (type === 'double') { rewardMult = 1.25; expires = rng.int(2, 4); name = 'Double faille · ' + tpl.name; }
    else if (type === 'cache') { rewardMult = 1.5; expires = rng.int(1, 2); name = isSecretTpl(tpl) ? tpl.name : 'Faille voilée · ' + tpl.name; }
    else if (type === 'evenement') { rewardMult = 1.5; expires = rng.int(2, 3); name = isSecretTpl(tpl) || tpl.type === 'evenement' ? tpl.name : 'Faille instable · ' + tpl.name; if (tpl.type !== 'evenement') flags.instable = true; }
    if (extra.tag === 'dore') { goldMult = 3; rewardMult = 1; name = 'Faille dorée · ' + tpl.name; flags.doree = true; expires = 2; }
    if (extra.tag === 'vague') { rewardMult = 1.5; expires = 3; name = 'Vague de failles · ' + tpl.name; }
    if (extra.tag) tag = extra.tag;
    const accent = extra.tag === 'dore' ? '#ffd700' : TYPES[type].accent;
    const p = {
      id: newId(), templateId: tpl.id, templateName: tpl.name, rank, minRank: rank, type,
      color: RCOL[rank], accent, name, theme: tpl.theme || 'crypte', icon: tpl.icon || '🌀',
      danger: clamp(Math.round(1 + rI * 0.55 + mods.length * 0.3 + (type === 'rouge' ? 1 : 0) + (type === 'cache' ? 0.5 : 0)), 1, 5),
      roomsCount: tplRooms(tpl), monsterTypes: [], hasBoss: !!tpl.boss || tpl.type !== 'horde',
      rewardsPreview: raritiesFor(rank, tpl, type), modifiers: mods, flags, rewardMult, goldMult,
      expiresAfterRuns: expires, seed: newSeed(), eventTag: tag, createdAt: Date.now(),
    };
    const rt = resolvedTpl(tpl);
    const names = [];
    (rt.monsters || []).concat(rt.elites || []).forEach((m) => { const n = monsterName(m); if (names.indexOf(n) < 0) names.push(n); });
    p.monsterTypes = names.slice(0, 8);
    p.hasBoss = !!(rt.boss || (rt.minibosses && rt.minibosses.length));
    if (type === 'double') {
      const pl = pools().normal.concat(pools().secret.filter((t) => tplUnlocked(t, profile)));
      const up = clamp(rI + (rng.chance(0.5) ? 1 : 0), 0, 5);
      let cands = pl.filter((t) => ri(t.rank) === up && t.id !== tpl.id);
      if (!cands.length) cands = pl.filter((t) => t.id !== tpl.id && ri(t.rank) <= up);
      const h = cands.length ? rng.pick(cands) : tpl;
      p.double = { templateId: h.id, templateName: h.name, rank: h.rank, seed: newSeed(), rewardMult: 2 };
    }
    return p;
  }

  // ------------------------------------------------------------------ épreuve de promotion
  function normTrial(t) {
    if (!t) return null;
    if (typeof t === 'string') t = (Array.isArray(G.RANKS_TRIALS) ? G.RANKS_TRIALS.find((x) => x.id === t) : G.RANKS_TRIALS && G.RANKS_TRIALS[t]) || null;
    return t && t.id ? t : null;
  }
  function makeTrialPortal(profile, trial) {
    const cur = playerRank(profile);
    const target = ri(trial.rank) >= 0 ? trial.rank : (ORDER[Math.min(6, ri(cur) + 1)]);
    const P = pools();
    const hint = trial.templateHint || {};
    let tpl = trial.templateId ? getTemplate(trial.templateId) : null;
    if (!tpl) {
      const score = (t) => (t.theme === hint.theme ? 2 : 0) + (t.boss === hint.boss ? 3 : 0) + (t.type === 'epreuve' && t.rank === target ? 4 : 0) - Math.abs(ri(t.rank) - ri(target)) * 3;
      const cands = P.normal.concat(P.trial).slice().sort((a, b) => score(b) - score(a));
      tpl = cands[0] || P.all[0];
    }
    if (!tpl) return null;
    const rI = ri(target);
    const c = trial.constraints || {};
    return {
      id: newId(), templateId: tpl.id, templateName: tpl.name, rank: target, minRank: ORDER[Math.max(0, ri(target) - 1)], type: 'epreuve',
      color: RCOL[target], accent: TYPES.epreuve.accent, name: trial.name || 'Épreuve de rang ' + target,
      theme: hint.theme || tpl.theme || 'crypte', icon: '⚖️', danger: clamp(hint.danger || (2 + Math.floor(rI / 2)), 1, 5),
      roomsCount: hint.rooms ? rng.int(hint.rooms.min, hint.rooms.max) : tplRooms(tpl),
      monsterTypes: (resolvedTpl(tpl).monsters || []).map(monsterName).slice(0, 8), hasBoss: true,
      rewardsPreview: [], modifiers: [], flags: { trial: true, noPotions: !!c.noPotions, noDash: !!c.noDash, timeLimit: c.timeLimit || null, maxHits: c.maxHits || null, oneLife: !!c.oneLife },
      rewardMult: 1, goldMult: 1, expiresAfterRuns: null, seed: newSeed(), eventTag: null, createdAt: Date.now(),
      trialId: trial.id, trial: { id: trial.id, name: trial.name, desc: trial.desc, rank: target, templateHint: hint, constraints: JSON.parse(JSON.stringify(c)), rewards: trial.rewards || null },
      bossOverride: hint.boss || null, constraints: JSON.parse(JSON.stringify(c)), reward: trial.rewards || null,
    };
  }
  function syncTrial(profile) {
    const st = profile.portals; if (!st) return;
    let trial = null;
    try { trial = normTrial(G.Ranks && G.Ranks.eligibleForTrial && G.Ranks.eligibleForTrial(profile)); } catch (e) { /* ignore */ }
    const idx = st.list.findIndex((x) => x.type === 'epreuve');
    if (!trial) { if (idx >= 0) st.list.splice(idx, 1); return; }
    if (idx >= 0 && st.list[idx].trialId === trial.id) return;
    if (idx >= 0) st.list.splice(idx, 1);
    const p = makeTrialPortal(profile, trial);
    if (p) st.list.unshift(p);
  }

  // ------------------------------------------------------------------ génération de la liste
  function pickTemplate(profile, list, rankIdx, type, allowLocked) {
    const P = pools();
    let pool;
    if (type === 'cache') pool = P.secret.filter((t) => ri(t.rank) <= ri(playerRank(profile)) + 1);
    else if (type === 'evenement') pool = P.event.filter((t) => ri(t.rank) <= ri(playerRank(profile)) + 1);
    else pool = P.normal;
    if (!pool.length) { if (type === 'cache' || type === 'evenement') return null; pool = P.all; }
    const maxR = ri(playerRank(profile)) + 1;
    let cands = pool.filter((t) => ri(t.rank) === rankIdx);
    if (!cands.length) {
      // plus proche rang disponible (en dessous d'abord), sans dépasser rang+1
      const avail = pool.filter((t) => ri(t.rank) <= maxR);
      const src = avail.length ? avail : pool;
      let best = null;
      src.forEach((t) => { const d = Math.abs(ri(t.rank) - rankIdx) + (ri(t.rank) > rankIdx ? 0.5 : 0); if (best == null || d < best.d) best = { d, t }; });
      if (!best) return null;
      cands = src.filter((t) => t.rank === best.t.rank);
    }
    // évite les doublons template+type
    const fresh = cands.filter((t) => !list.some((x) => x.templateId === t.id && x.type === type));
    const fresh2 = fresh.filter((t) => !list.some((x) => x.templateId === t.id));
    return rng.pick(fresh2.length ? fresh2 : (fresh.length ? fresh : cands));
  }
  function addOne(profile, list, rankIdx, forceType) {
    const pI = ri(playerRank(profile));
    const locked = rankIdx > pI;
    let type = forceType;
    if (!type) {
      const r = rng.f();
      if (r < 0.03 && !locked) type = 'cache';
      else if (r < 0.15 && rankIdx >= 1) type = 'rouge';
      else if (r < 0.25 && rankIdx >= 1 && !locked) type = 'double';
      else if (r < 0.30 && !locked) type = 'evenement';
      else type = 'normal';
    }
    let tpl = pickTemplate(profile, list, rankIdx, type);
    if (!tpl && type !== 'normal') { type = 'normal'; tpl = pickTemplate(profile, list, rankIdx, type); }
    if (!tpl) return null;
    // un portail verrouillé ne peut pas dépasser rang+1
    if (ri(tpl.rank) > pI + 1 && ri(tpl.rank) > rankIdx) { if (list.length) return null; }
    const p = makePortal(profile, tpl, type);
    list.push(p);
    return p;
  }
  function fill(profile, list, target) {
    const pI = ri(playerRank(profile));
    const nonTrial = () => list.filter((x) => x.type !== 'epreuve');
    const accessible = () => nonTrial().filter((x) => ri(x.rank) <= pI && !x.eventTag);
    if (!accessible().length) addOne(profile, list, pI, 'normal');
    if (pI > 0 && accessible().length < 2) addOne(profile, list, pI - 1, 'normal');
    if (!list.some((x) => ri(x.rank) > pI) && pI < 6) addOne(profile, list, pI + 1, rng.chance(0.25) ? 'rouge' : 'normal');
    let guard = 0;
    while (list.length < target && guard++ < 40) {
      const o = rng.weighted([{ w: 36, v: 0 }, { w: 24, v: -1 }, { w: 12, v: -2 }, { w: 6, v: -3 },
        { w: list.filter((x) => ri(x.rank) > pI).length < 2 ? 14 : 3, v: 1 }]).v;
      addOne(profile, list, clamp(pI + o, 0, 6));
    }
    return list;
  }
  function addEvent(profile, list) {
    const pI = ri(playerRank(profile));
    const st = profile.portals;
    if (list.some((x) => x.eventTag)) return;
    const r = rng.f();
    if (r < 0.07) {
      st.event = { id: 'vague', at: Date.now() };
      const mk = (ranki) => { const tpl = pickTemplate(profile, list, ranki, 'normal'); if (tpl) list.push(makePortal(profile, tpl, 'evenement', { tag: 'vague' })); };
      mk(pI); mk(pI); if (pI < 6) { mk(pI + 1); mk(pI + 1); }
    } else if (r < 0.12) {
      st.event = { id: 'dore', at: Date.now() };
      const tpl = pickTemplate(profile, list, pI, 'normal');
      if (tpl) list.push(makePortal(profile, tpl, 'evenement', { tag: 'dore' }));
    }
  }
  function generate(profile, keep) {
    const st = profile.portals;
    const list = (keep || []).slice();
    const target = list.some((x) => x.eventTag === 'vague') ? TARGET_MAX : rng.int(TARGET_MIN, TARGET_MAX);
    st.target = target;
    st.event = list.some((x) => x.eventTag) ? st.event : null;
    st.list = list;
    syncTrial(profile);
    if (!keep) addEvent(profile, st.list);
    if (st.list.length > TARGET_MAX) { /* événement : ok, plafonné par le remplissage */ }
    fill(profile, st.list, Math.max(target, TARGET_MIN));
    st.list = sortList(st.list, profile);
    st.rank = playerRank(profile);
    st.seed = newSeed(); st.refreshedAt = Date.now();
    return st.list;
  }
  function sortList(list, profile) {
    const pI = ri(playerRank(profile));
    const key = (x) => (x.type === 'epreuve' ? 0 : x.eventTag ? 1 : ri(x.rank) > pI ? 9 : 2);
    return list.map((x, i) => ({ x, i })).sort((a, b) => (key(a.x) - key(b.x)) || (ri(a.x.rank) - ri(b.x.rank)) || (a.i - b.i)).map((o) => o.x);
  }
  function valid(p) {
    return !!(p && p.id && p.templateId && ri(p.rank) >= 0 && TYPES[p.type] && Array.isArray(p.modifiers) && p.seed != null);
  }

  // ------------------------------------------------------------------ API publique
  const Portals = {
    ORDER, RANK_COLORS: RCOL, RARITY_COLORS: RAR_COL, TYPES,
    ensureProfile(profile) {
      if (!profile) return profile;
      const s = profile.portals && typeof profile.portals === 'object' ? profile.portals : (profile.portals = {});
      if (!Array.isArray(s.list)) s.list = [];
      if (s.seed == null) s.seed = newSeed();
      if (s.refreshedAt == null) s.refreshedAt = 0;
      if (s.event === undefined) s.event = null;
      s.list = s.list.filter(valid);
      return profile;
    },
    list(profile) {
      profile = profile || curProfile(); if (!profile) return [];
      Portals.ensureProfile(profile);
      const s = profile.portals;
      const before = s.list.length;
      s.list = s.list.filter((x) => x.expiresAfterRuns == null || x.expiresAfterRuns > 0);
      if (s.rank !== playerRank(profile) || !s.list.length) { generate(profile, null); persist(); return s.list; }
      const had = s.list.map((x) => x.id).join();
      syncTrial(profile);
      if (s.list.filter((x) => x.type !== 'epreuve').length < TARGET_MIN) fill(profile, s.list, TARGET_MIN);
      s.list = sortList(s.list, profile);
      if (had !== s.list.map((x) => x.id).join() || before !== s.list.length) persist();
      return s.list;
    },
    refresh(profile) {
      profile = profile || curProfile(); if (!profile) return [];
      Portals.ensureProfile(profile);
      const keep = profile.portals.list.filter((x) => x.type === 'epreuve' || (x.eventTag && x.expiresAfterRuns > 0));
      generate(profile, keep.filter((x) => x.type !== 'epreuve'));
      persist();
      return profile.portals.list;
    },
    refreshCost(profile) { return 40 + 60 * ri(playerRank(profile || curProfile() || {})); },
    // refresh payant (or). -> {ok, cost, reason?}
    buyRefresh(profile) {
      profile = profile || curProfile(); if (!profile) return { ok: false, cost: 0, reason: 'Aucun profil.' };
      const cost = Portals.refreshCost(profile);
      if ((profile.gold || 0) < cost) return { ok: false, cost, reason: "Pas assez d'or !" };
      profile.gold -= cost;
      Portals.refresh(profile);
      persist();
      try { G.bus && G.bus.emit('profileChanged', { profile }); } catch (e) { /* ignore */ }
      return { ok: true, cost };
    },
    canEnter,
    getTemplate,

    describe(portal, profile) {
      if (!portal) return null;
      profile = profile || curProfile();
      const tpl = getTemplate(portal.templateId) || {};
      const pv = previewOf(portal, tpl);
      const mods = (portal.modifiers || []).map(modInfo);
      if (portal.flags) {
        if (portal.flags.exitLocked) mods.unshift(modInfo('sortie_bloquee'), modInfo('recompenses_x2'));
        if (portal.type === 'double') mods.unshift(modInfo('donjon_cache'));
        if (portal.type === 'cache' && !isSecretTpl(tpl)) mods.unshift(modInfo('butin_voile'));
        if (portal.flags.instable) mods.unshift(modInfo('instable'));
        if (portal.flags.doree) mods.unshift(modInfo('doree'));
      }
      // difficulté : puissance joueur vs recommandée
      let power = null;
      try { if (profile && G.Stats && G.Stats.compute) power = G.Stats.compute(profile).power; } catch (e) { /* ignore */ }
      let rec = tpl.recommendedPower || 0;
      if (!rec && Array.isArray(G.RANKS)) { const r = G.RANKS.find((x) => x.id === portal.rank); rec = r && r.requirements && r.requirements.power; }
      if (!rec) rec = FALLBACK_POWER[portal.rank] || 0;
      rec = Math.max(60, rec) * (portal.type === 'rouge' ? 1.25 : 1) * Math.pow(1.05, (portal.modifiers || []).length);
      let diff = { key: 'inconnue', label: 'Inconnue', ratio: null, color: '#b9b3d6', power, recommended: Math.round(rec) };
      if (typeof power === 'number' && isFinite(power)) {
        const ratio = power / rec;
        const k = ratio >= 2 ? ['tres_facile', 'Très facile', '#66e04f'] : ratio >= 1.3 ? ['facile', 'Facile', '#9be34f']
          : ratio >= 0.9 ? ['equilibree', 'Équilibrée', '#3fb6ff'] : ratio >= 0.6 ? ['risquee', 'Risquée', '#ff9a2e'] : ['mortelle', 'Mortelle', '#ff3d3d'];
        diff = { key: k[0], label: k[1], ratio, color: k[2], power, recommended: Math.round(rec) };
      }
      const rw = tpl.rewards || {};
      const gm = (portal.rewardMult || 1) * (portal.goldMult || 1), xm = portal.rewardMult || 1;
      const gold = Array.isArray(rw.gold) ? [Math.round(rw.gold[0] * gm), Math.round(rw.gold[1] * gm)] : (typeof rw.gold === 'number' ? [Math.round(rw.gold * gm), Math.round(rw.gold * gm)] : null);
      const cd = profile ? canEnter(profile, portal) : { ok: true, reason: '' };
      return {
        id: portal.id, name: portal.name, templateName: portal.templateName || tpl.name, desc: tpl.desc || '', lore: tpl.lore || '',
        type: portal.type, typeLabel: (TYPES[portal.type] || TYPES.normal).label, rank: portal.rank, rankName: RNAME[portal.rank],
        minRank: portal.minRank || portal.rank, color: portal.color, accent: portal.accent, theme: portal.theme, icon: portal.icon,
        danger: portal.danger, difficulty: diff, rooms: pv.rooms || portal.roomsCount, monsterTypes: pv.monsters && pv.monsters.length ? pv.monsters : portal.monsterTypes,
        hasBoss: pv.hasBoss != null ? pv.hasBoss : portal.hasBoss, bossName: pv.bossName || (tpl.boss ? bossName(resolvedTpl(tpl).boss) : null),
        rewards: { rarities: portal.rewardsPreview, gold, xp: typeof rw.xp === 'number' ? Math.round(rw.xp * xm) : null, mult: portal.rewardMult, goldMult: portal.goldMult || 1 },
        rewardsPreview: portal.rewardsPreview, modifiers: mods, flags: portal.flags || {}, expiresAfterRuns: portal.expiresAfterRuns,
        trial: portal.trial || null, double: portal.double || null, mechanics: (tpl.mechanics || []).map(modInfo),
        accessible: cd.ok, reason: cd.reason, secretHint: tpl.secret && !tplUnlocked(tpl, profile) ? tpl.secret.hint : null,
      };
    },

    // Construit le donjon jouable. -> dungeon
    buildDungeon(portal) {
      const tpl = getTemplate(portal.templateId);
      const d = buildOne(portal, tpl, portal.rank, portal.seed, portal.modifiers || [], portal);
      d.portalId = portal.id; d.portalType = portal.type; d.rank = portal.rank;
      d.exitLocked = !!(portal.flags && portal.flags.exitLocked);
      d.rewardMult = portal.rewardMult || 1; d.goldMult = portal.goldMult || 1;
      d.reward = scaleReward(d.reward, d.rewardMult, d.goldMult);
      if (portal.trial) { d.trialRewards = portal.reward; d.trial = portal.trial; d.constraints = portal.trial.constraints; d.trialId = portal.trialId; }
      else if (portal.flags && (portal.flags.noPotions || portal.flags.timeLimit)) d.constraints = { noPotions: !!portal.flags.noPotions, timeLimit: portal.flags.timeLimit };
      if (portal.double) {
        const ht = getTemplate(portal.double.templateId);
        const h = buildOne(portal, ht, portal.double.rank, portal.double.seed, [], null);
        h.reward = scaleReward(h.reward, portal.double.rewardMult || 2, 1);
        h.hiddenOf = d.id; d.hidden = h;
      }
      return d;
    },
    makeTrialPortal(profile, trial) { return makeTrialPortal(profile, normTrial(trial)); },
    isValid: valid,
    denyFx(reason, el) { return denyFx(el, reason); },
  };

  const previewCache = {};
  function previewOf(portal, tpl) {
    const k = portal.id;
    if (previewCache[k]) return previewCache[k];
    const out = {};
    try {
      if (G.Procgen && G.Procgen.generate && tpl && tpl.id) {
        const d = G.Procgen.generate(tpl, { rank: portal.rank, seed: portal.seed, modifiers: portal.modifiers || [] });
        if (d && Array.isArray(d.rooms)) {
          out.rooms = d.rooms.length;
          const names = [];
          let boss = null;
          d.rooms.forEach((r) => {
            (r.waves || []).forEach((w) => (w || []).forEach((e) => { const n = monsterName(e.type); if (names.indexOf(n) < 0) names.push(n); }));
            if (r.type === 'boss' && r.boss) boss = r.boss;
          });
          out.monsters = names.slice(0, 8); out.hasBoss = !!boss; out.bossName = boss ? bossName(boss) : null;
        }
      }
    } catch (e) { /* aperçu approximatif */ }
    if (Object.keys(previewCache).length > 80) Object.keys(previewCache).forEach((x) => { delete previewCache[x]; });
    previewCache[k] = out;
    return out;
  }
  function scaleReward(rw, mult, gm) {
    if (!rw || typeof rw !== 'object') return rw;
    const o = Object.assign({}, rw);
    if (typeof o.gold === 'number') o.gold = Math.round(o.gold * mult * gm);
    else if (Array.isArray(o.gold)) o.gold = o.gold.map((g) => Math.round(g * mult * gm));
    if (typeof o.xp === 'number') o.xp = Math.round(o.xp * mult);
    return o;
  }
  function v2Convert(v2, rank, tplName) {
    const rooms = [];
    (v2.rooms || []).forEach((r) => {
      if (r.boss) { rooms.push({ type: 'boss', layout: 'boss', boss: r.boss, waves: [], data: {} }); return; }
      rooms.push({ type: 'combat', layout: r.layout || 'arena', waves: (r.waves || []).map((w) => w.map((e) => ({ type: e.type, count: e.count, elite: false }))), data: {} });
      if (r.chest) rooms.push({ type: 'chest', layout: 'arena', waves: [], data: {} });
    });
    return { id: v2.id, templateId: v2.id, name: tplName || v2.name, rank, theme: v2.theme, modifiers: [], rooms, reward: Object.assign({}, v2.reward), v2: true };
  }
  function buildOne(portal, tpl, rank, seed, mods, ctxPortal) {
    let d = null;
    if (tpl && G.Procgen && G.Procgen.generate) {
      try {
        const opts = { rank, seed, modifiers: mods };
        if (ctxPortal && ctxPortal.type) opts.portalType = ctxPortal.type;
        if (ctxPortal && ctxPortal.trial) { opts.trial = ctxPortal.trial; opts.constraints = ctxPortal.trial.constraints; if (ctxPortal.bossOverride) opts.boss = ctxPortal.bossOverride; if (ctxPortal.trial.templateHint && ctxPortal.trial.templateHint.rooms) opts.rooms = ctxPortal.trial.templateHint.rooms; }
        d = G.Procgen.generate(tpl, opts);
      } catch (e) { console.error('[Portals] Procgen.generate a échoué', e); d = null; }
    }
    if (d && Array.isArray(d.rooms) && d.rooms.length) { d.templateId = d.templateId || (tpl && tpl.id); return d; }
    // fallback : donjon v2
    const list = v2Templates();
    let v2 = tpl && tpl.v2 ? (G.DATA.DUNGEONS[tpl.v2Index]) : null;
    if (!v2) v2 = (G.DATA && G.DATA.DUNGEONS || [])[Math.min(ri(rank), ((G.DATA && G.DATA.DUNGEONS) || []).length - 1)];
    if (!v2 && list.length) v2 = G.DATA.DUNGEONS[0];
    return v2Convert(v2 || { id: 'vide', name: 'Faille', theme: 'crypte', rooms: [], reward: { gold: 0, xp: 0 } }, rank, (tpl && tpl.name) || null);
  }

  // ------------------------------------------------------------------ après chaque run
  function onRunEnd(ev) {
    const p = curProfile(); if (!p) return;
    Portals.ensureProfile(p);
    const s = p.portals;
    const played = (ev && ev.run && ev.run.portal) || (ev && ev.portal) || null;
    const pid = played && played.id;
    const victory = !!(ev && ev.victory);
    s.list = s.list.filter((x) => {
      if (x.type === 'epreuve') return !(pid === x.id && victory);       // épreuve : reste tant qu'elle n'est pas réussie
      if (x.expiresAfterRuns != null) x.expiresAfterRuns -= 1;
      if (pid === x.id) {
        if (victory) return false;                                       // terminé : retiré
        if (x.type === 'rouge' || x.type === 'cache' || x.type === 'evenement') return false; // s'effondre après un échec
      }
      return x.expiresAfterRuns == null || x.expiresAfterRuns > 0;
    });
    if (s.event && !s.list.some((x) => x.eventTag)) s.event = null;
    syncTrial(p);
    if (s.rank !== playerRank(p)) generate(p, null);
    else { fill(p, s.list, Math.max(TARGET_MIN, s.target || TARGET_MIN)); s.list = sortList(s.list, p); }
    persist();
    try { G.bus.emit('portalsChanged', { profile: p }); } catch (e) { /* ignore */ }
    if (mounted && mounted.isConnected) { try { renderPanel(mounted, p); } catch (e) { /* ignore */ } }
  }
  try { if (G.bus && G.bus.on) G.bus.on('runEnd', (ev) => { try { onRunEnd(ev); } catch (e) { console.error('[Portals] runEnd', e); } }); } catch (e) { /* ignore */ }

  // ===================================================================
  //  INTERFACE
  // ===================================================================
  let mounted = null;
  const CSS = `
.pt-root{position:relative;padding:0 0 24px;color:var(--ds-text,#e8f0ff);font-family:var(--ds-font-body,'Nunito',sans-serif);font-weight:600}
.pt-root svg,.pt-sheet svg{display:block;flex:none}
.pt-ic{display:inline-flex;align-items:center;justify-content:center;flex:none}
.pt-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:0 0 12px}
.pt-filters{display:flex;flex:1 1 100%}
.pt-filters>*{flex:1 1 0;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;white-space:nowrap}
.pt-filters i{font-style:normal;font-family:var(--ds-font-display,sans-serif);font-size:11px;opacity:.7}
.pt-rkline{display:flex;align-items:center;gap:8px;font-family:var(--ds-font-display,sans-serif);font-weight:600;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ds-text-2,#a9b8d6);flex:1 1 auto;min-width:0}
.pt-rkline .pt-arrow{opacity:.55}
.pt-refresh{flex:0 0 auto;white-space:nowrap}
.pt-refresh .pt-cost{display:inline-flex;align-items:center;gap:4px;color:var(--ds-gold,#ffc94a);margin-left:2px}
@media(min-width:720px){.pt-filters{flex:0 0 auto}.pt-filters>*{flex:0 0 auto;padding-inline:16px}.pt-rkline{justify-content:flex-end}}
.pt-event{position:relative;overflow:hidden;display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:10px 14px;border-radius:var(--ds-r-md,10px);border:1px solid rgba(255,201,74,.55);background:linear-gradient(90deg,rgba(255,201,74,.22),rgba(255,138,26,.1));color:var(--ds-gold,#ffc94a);font-family:var(--ds-font-display,sans-serif);font-weight:600;font-size:13px;letter-spacing:.04em;line-height:1.3;box-shadow:0 0 18px rgba(255,201,74,.18)}
.pt-event::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.16) 50%,transparent 65%);background-size:250% 100%;animation:ptShine 3s linear infinite;pointer-events:none}
.pt-grid{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:720px){.pt-grid{grid-template-columns:1fr 1fr}}
@media(min-width:1100px){.pt-grid{grid-template-columns:1fr 1fr 1fr}}
.pt-card{--pc:#9aa3ad;--pa:var(--pc);--c:var(--pc);gap:10px;padding:12px;cursor:pointer;touch-action:manipulation;animation:ptIn .4s var(--ds-ease,ease) both}
.pt-card:active{transform:scale(.985)}
@media(hover:hover){.pt-card:hover{transform:translateY(-2px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 75%,rgba(130,200,255,.5)),0 0 22px color-mix(in srgb,var(--pc) 24%,transparent),var(--ds-shadow-2,0 12px 40px rgba(0,0,0,.55))}}
.pt-card.pt-rouge{--c:#e0102e;animation:ptIn .4s var(--ds-ease,ease) both,ptFlick 2.4s ease-in-out infinite}
.pt-main{position:relative;display:flex;flex-direction:column;gap:10px}
.pt-row{display:flex;gap:12px;align-items:center}
.pt-vx{position:relative;flex:none;width:84px;height:84px}
.pt-vx .pt-ring{position:absolute;inset:0;border-radius:50%;overflow:hidden;border:1px solid color-mix(in srgb,var(--pa) 60%,transparent);background:radial-gradient(circle,rgba(2,0,12,.9),rgba(6,9,18,.95));box-shadow:0 0 18px color-mix(in srgb,var(--pa) 38%,transparent),inset 0 0 14px rgba(0,0,0,.7)}
.pt-vx canvas{width:100%;height:100%;display:block}
.pt-vx .ds-rank{position:absolute;right:-8px;bottom:-6px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
.pt-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.pt-top{display:flex;align-items:center;justify-content:space-between;gap:6px}
.pt-type{color:var(--pa);border-color:color-mix(in srgb,var(--pa) 55%,transparent)!important;background:color-mix(in srgb,var(--pa) 14%,transparent)!important}
.pt-type.pt-plain{color:var(--ds-text-2,#a9b8d6);border-color:var(--ds-line,rgba(130,180,255,.16))!important;background:rgba(130,180,255,.06)!important}
.pt-exp{display:inline-flex;align-items:center;gap:4px;font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:12px;color:var(--ds-warning,#ffb547)}
.pt-name{font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:16px;line-height:1.15;letter-spacing:.02em;color:var(--ds-text,#e8f0ff);overflow-wrap:anywhere}
.pt-sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pt-skulls{display:inline-flex;gap:2px;color:var(--ds-danger,#ff4d6a)}
.pt-skulls i{display:inline-flex;opacity:.2}.pt-skulls i.on{opacity:1;filter:drop-shadow(0 0 4px rgba(255,77,106,.6))}
.pt-diff{font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.pt-info{display:flex;flex-direction:column}
.pt-info .ds-stat{padding:5px 0}
.pt-info .ds-stat__label{display:inline-flex;align-items:center;gap:7px}
.pt-info .ds-stat__label .pt-ic{color:var(--ds-text-3,#6f7fa3)}
.pt-info .ds-stat__value{display:inline-flex;align-items:center;gap:6px;text-align:right}
.pt-pips{display:inline-flex;gap:4px;align-items:center}
.pt-pip{width:11px;height:11px;background:var(--c);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);box-shadow:0 0 6px var(--c)}
.pt-x{color:var(--ds-gold,#ffc94a);font-family:var(--ds-font-display,sans-serif);font-weight:700}
.pt-chips{display:flex;flex-wrap:wrap;gap:5px}
.pt-chips .ds-chip{font-size:11.5px;padding:2px 8px}
.pt-chips .pt-modchip{border-color:rgba(255,77,106,.45);background:rgba(255,77,106,.1);color:#ffc2cb}
.pt-hint{display:flex;gap:6px;align-items:center;color:var(--r-secret,#00ffd0);font-size:12px}
.pt-go{position:relative;z-index:1;margin-top:auto}
.pt-banner{display:flex;align-items:center;gap:8px;margin:-12px -12px 0;padding:8px 14px;background:linear-gradient(90deg,#ffd76b,#f0a41c);color:#2a1a04;font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.pt-banner small{margin-left:auto;font-size:11px;letter-spacing:.06em;opacity:.8}
.pt-card.pt-epreuve{--c:#ffd76b;background:radial-gradient(120% 90% at 0% 0%,rgba(255,201,74,.22),transparent 60%),linear-gradient(170deg,#2a2210,var(--ds-bg-1,#0b1122));box-shadow:inset 0 0 0 1px rgba(255,215,107,.7),0 0 26px rgba(255,201,74,.22);animation:ptIn .4s var(--ds-ease,ease) both,ptGlow 2.6s ease-in-out infinite}
.pt-card.pt-epreuve::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,236,170,.14) 50%,transparent 65%);background-size:250% 100%;animation:ptShine 3.2s linear infinite;pointer-events:none}
@media(min-width:720px){.pt-card.pt-epreuve{grid-column:1/-1}}
.pt-card.pt-locked{--c:var(--ds-line-strong,rgba(130,200,255,.36));cursor:not-allowed}
.pt-card.pt-locked .pt-main>.pt-row,.pt-card.pt-locked .pt-main>.pt-info,.pt-card.pt-locked .pt-main>.pt-chips{filter:saturate(.3) brightness(.8)}
.pt-frost{position:absolute;inset:-4px;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;border-radius:var(--ds-r-md,10px);pointer-events:none;
 -webkit-backdrop-filter:blur(1.5px) saturate(.6);backdrop-filter:blur(1.5px) saturate(.6);
 background:linear-gradient(160deg,rgba(190,225,255,.12),rgba(9,14,30,.5) 55%),repeating-linear-gradient(115deg,rgba(255,255,255,.035) 0 2px,transparent 2px 9px);
 box-shadow:inset 0 0 0 1px rgba(170,215,255,.22),inset 0 0 30px rgba(120,190,255,.12)}
.pt-lockc{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;color:#cfe6ff;background:rgba(9,14,30,.8);border:1px solid rgba(170,215,255,.45);box-shadow:0 0 18px rgba(120,190,255,.3)}
.pt-need{font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#ffb3bf;padding:3px 10px;border-radius:6px;background:rgba(9,14,30,.8);border:1px solid rgba(255,77,106,.5)}
.pt-frost .pt-hint{max-width:90%;font-size:11.5px;background:rgba(9,14,30,.75);padding:2px 8px;border-radius:6px}
.pt-shake{animation:ptShake .5s cubic-bezier(.36,.07,.19,.97) both!important}
.pt-redflash{position:absolute;inset:0;z-index:5;background:radial-gradient(circle,rgba(255,60,80,.55),rgba(255,40,60,.25));box-shadow:inset 0 0 0 2px rgba(255,77,106,.9);pointer-events:none;animation:ptRed .6s ease-out forwards}
.pt-vig{position:fixed;inset:0;z-index:99990;pointer-events:none;background:radial-gradient(ellipse at center,rgba(255,0,30,0) 40%,rgba(255,0,30,.45) 100%);animation:ptVig .8s ease-out forwards}
.pt-deny{position:fixed;left:0;right:0;margin:0 auto;top:34%;z-index:99991;width:min(88vw,400px);padding:14px 16px 12px;text-align:center;cursor:pointer;
 background:var(--ds-glass-strong,rgba(9,14,30,.94));border:1px solid rgba(255,77,106,.7);border-radius:var(--ds-r-md,10px);color:#ffd5db;
 font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:14px;line-height:1.35;letter-spacing:.05em;text-transform:uppercase;box-shadow:0 0 0 1px rgba(255,77,106,.25),0 0 36px rgba(255,40,60,.5),var(--ds-shadow-2,0 12px 40px rgba(0,0,0,.55));animation:ptPop .3s var(--ds-ease,ease) both,ptShake .5s .05s both}
.pt-deny .pt-denyic{display:grid;place-items:center;margin:0 auto 6px;width:40px;height:40px;border-radius:50%;color:var(--ds-danger,#ff4d6a);border:1px solid rgba(255,77,106,.6);background:rgba(255,77,106,.12)}
.pt-empty{padding:28px 16px;text-align:center;color:var(--ds-text-3,#6f7fa3);grid-column:1/-1}
/* fiche */
.pt-modal{position:fixed;inset:0;z-index:99980;display:flex;align-items:center;justify-content:center;padding:12px;animation:ptFade .2s ease-out both}
.pt-win{position:relative;display:flex;flex-direction:column;width:min(96vw,500px);max-height:92vh;max-height:92dvh;animation:ptWin .32s var(--ds-ease-out-back,cubic-bezier(.34,1.56,.64,1)) both}
.pt-win .ds-window__body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}
.pt-win .ds-window__footer{flex:none;display:flex;gap:10px}
.pt-win .ds-window__footer .ds-btn{flex:1}
.pt-win .ds-window__footer .ds-btn.pt-wide{flex:2}
.pt-sheet{display:flex;flex-direction:column;gap:14px;text-align:left;color:var(--ds-text,#e8f0ff)}
.pt-sh-top{display:flex;gap:14px;align-items:center}
.pt-sh-top .pt-vx{width:104px;height:104px}
.pt-sh-top .pt-vx .ds-rank{right:-8px;bottom:-8px}
.pt-sh-name{font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:20px;line-height:1.1;letter-spacing:.03em}
.pt-sh-desc{font-size:13px;color:var(--ds-text-2,#a9b8d6);line-height:1.45}
.pt-sh-top .pt-body{gap:7px}
.pt-gauge{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--ds-r-md,10px);border:1px solid var(--ds-line,rgba(130,180,255,.16));background:rgba(130,180,255,.05)}
.pt-gauge-h{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--ds-font-display,sans-serif);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ds-text-2,#a9b8d6)}
.pt-gauge-h b{font-size:15px;letter-spacing:.04em}
.pt-gauge small{font-size:11.5px;color:var(--ds-text-3,#6f7fa3)}
.pt-sec{display:flex;align-items:center;gap:10px;font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ds-text-2,#a9b8d6);margin-bottom:8px}
.pt-sec::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--ds-line-strong,rgba(130,200,255,.36)),transparent)}
.pt-mods{display:flex;flex-direction:column;gap:6px}
.pt-mod{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:var(--ds-r-md,10px);background:rgba(255,77,106,.07);border:1px solid rgba(255,77,106,.3)}
.pt-mod .pt-mi{flex:none;width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:rgba(255,77,106,.14);font-size:15px}
.pt-mod b{display:block;font-family:var(--ds-font-display,sans-serif);font-size:13px;letter-spacing:.03em;color:#ffd5db}
.pt-mod span{font-size:12px;color:var(--ds-text-2,#a9b8d6);line-height:1.35}
.pt-boss{border-color:rgba(255,201,74,.5)!important;background:rgba(255,201,74,.1)!important;color:var(--ds-gold,#ffc94a)!important}
.pt-rars{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px}
.pt-rar{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--ds-r-md,10px);border:1px solid color-mix(in srgb,var(--c) 55%,transparent);background:linear-gradient(135deg,color-mix(in srgb,var(--c) 16%,transparent),transparent);font-family:var(--ds-font-display,sans-serif);font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--c)}
.pt-note{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:var(--ds-r-md,10px);font-size:12.5px;line-height:1.4;border:1px solid var(--ds-line,rgba(130,180,255,.16));background:rgba(130,180,255,.06);color:var(--ds-text-2,#a9b8d6)}
.pt-note b{color:var(--ds-text,#e8f0ff)}
.pt-note.pt-n-red{border-color:rgba(255,77,106,.5);background:rgba(255,77,106,.1);color:#ffd5db}
.pt-note.pt-n-violet{border-color:rgba(139,107,255,.55);background:rgba(139,107,255,.12);color:#ddd3ff}
.pt-note.pt-n-gold{border-color:rgba(255,201,74,.55);background:rgba(255,201,74,.1);color:#ffeab0}
.pt-note .pt-ic{margin-top:1px}
.pt-open{position:fixed;inset:0;z-index:99995;background:#000;touch-action:none;overflow:hidden}
.pt-open canvas{position:absolute;inset:0;width:100%;height:100%}
.pt-open-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.pt-open-cap{position:absolute;left:0;right:0;bottom:16%;text-align:center;pointer-events:none;color:var(--ds-text,#e8f0ff);font-family:var(--ds-font-display,sans-serif);font-weight:700;letter-spacing:.2em;text-transform:uppercase;font-size:12px;opacity:0;animation:ptCap .9s .15s ease-out forwards;text-shadow:0 0 14px var(--pc,#46d4ff)}
.pt-open-cap b{display:block;margin-top:6px;font-size:clamp(18px,5vw,30px);letter-spacing:.1em;color:#fff}
@keyframes ptIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes ptFade{from{opacity:0}to{opacity:1}}
@keyframes ptWin{from{opacity:0;transform:translateY(18px) scale(.94)}to{opacity:1;transform:none}}
@keyframes ptCap{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes ptGlow{0%,100%{box-shadow:inset 0 0 0 1px rgba(255,215,107,.5),0 0 14px rgba(255,201,74,.16)}50%{box-shadow:inset 0 0 0 1px rgba(255,215,107,.9),0 0 34px rgba(255,201,74,.4)}}
@keyframes ptFlick{0%,100%{border-color:rgba(224,16,46,.75)}50%{border-color:rgba(122,0,20,.8)}}
@keyframes ptShine{from{background-position:150% 0}to{background-position:-100% 0}}
@keyframes ptShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(5px)}30%,50%,70%{transform:translateX(-9px)}40%,60%{transform:translateX(9px)}}
@keyframes ptRed{0%{opacity:1}100%{opacity:0}}
@keyframes ptVig{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
@keyframes ptPop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.pt-card,.pt-card.pt-rouge,.pt-card.pt-epreuve,.pt-event::after,.pt-card.pt-epreuve::after,.pt-win,.pt-modal{animation:none!important}.pt-open-cap{animation:none;opacity:1}}
`;
  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById('pt-style')) return;
    const st = document.createElement('style'); st.id = 'pt-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const sfx = (n) => { try { G.sfx && G.sfx.play && G.sfx.play(n); } catch (e) { /* ignore */ } };
  const toast = (t) => { try { G.UI && G.UI.toast && G.UI.toast(t); } catch (e) { /* ignore */ } };

  // ---------------- vortex 2D ----------------
  function vxOpts(portal, locked) {
    const hex = locked ? '#7b82a0' : (portal.accent && portal.type !== 'epreuve' ? portal.accent : portal.color);
    const i = ri(portal.rank);
    return { rgb: rgb(hex), rgb2: rgb(portal.color), arms: 3 + Math.min(3, Math.floor(i / 2)), speed: locked ? 0.35 : 1.2 + i * 0.12, twist: 5 + i * 0.4,
      int: locked ? 0.4 : 1, type: portal.type, rankI: i, locked, jitter: portal.type === 'rouge' ? 0.05 : portal.type === 'cache' ? 0.03 : 0 };
  }
  function newParts(n) { const a = []; for (let i = 0; i < n; i++) a.push({ a: Math.random() * 6.283, r: 0.2 + Math.random() * 0.8, sp: 0.25 + Math.random() * 0.4, sz: Math.random() }); return a; }
  function drawVortex(ctx, cx, cy, R, t, o, parts, dt) {
    const [r, g, b] = o.rgb, [r2, g2, b2] = o.rgb2, TAU = 6.2832;
    const pulse = 1 + 0.05 * Math.sin(t * 2.3);
    ctx.globalCompositeOperation = 'source-over';
    let gr = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.12 * pulse);
    gr.addColorStop(0, `rgba(${r},${g},${b},${0.55 * o.int})`); gr.addColorStop(0.6, `rgba(${r},${g},${b},${0.16 * o.int})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gr; ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? `rgba(${Math.min(255, r2 + 90)},${Math.min(255, g2 + 90)},${Math.min(255, b2 + 90)},${0.5 * o.int})` : `rgba(${r},${g},${b},${0.7 * o.int})`;
      ctx.lineWidth = R * (pass ? 0.025 : 0.075);
      for (let k = 0; k < o.arms; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const s = i / 20, rad = R * (0.1 + 0.9 * s) * (1 + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0));
          const ang = t * o.speed * (pass ? 1.35 : 1) + k * TAU / o.arms + s * o.twist + (pass ? 0.4 : 0);
          const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
    gr.addColorStop(0, 'rgba(2,0,10,.96)'); gr.addColorStop(0.7, 'rgba(2,0,10,.7)'); gr.addColorStop(1, 'rgba(2,0,10,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.8 * o.int})`; ctx.lineWidth = Math.max(1.5, R * 0.03);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.9 * pulse, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const suck = o.suck || 1;
    for (const p of parts) {
      p.r -= dt * p.sp * 0.5 * suck; p.a += dt * (1.2 + (1 - p.r) * 3.5) * (o.locked ? 0.3 : 1) * suck;
      if (p.r < 0.08) { p.r = 0.95 + Math.random() * 0.15; p.a = Math.random() * TAU; }
      const x = cx + Math.cos(p.a) * p.r * R, y = cy + Math.sin(p.a) * p.r * R;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, p.r * 1.1) * 0.8 * o.int})`;
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, R * (0.012 + p.sz * 0.02)), 0, TAU); ctx.fill();
    }
    if (!o.locked && o.rankI >= 5 && Math.random() < 0.08) {
      const a = Math.random() * TAU; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, R * 0.02);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2);
      for (let i = 1; i <= 4; i++) ctx.lineTo(cx + Math.cos(a + (Math.random() - 0.5) * 0.6) * R * (0.2 + i * 0.18), cy + Math.sin(a + (Math.random() - 0.5) * 0.6) * R * (0.2 + i * 0.18));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const Vortex = (() => {
    const items = new Set(); let raf = 0, last = 0, io = null;
    try { if (typeof IntersectionObserver !== 'undefined') io = new IntersectionObserver((es) => es.forEach((e) => { e.target.__ptVis = e.isIntersecting; }), { rootMargin: '80px' }); } catch (e) { io = null; }
    function loop(ts) {
      raf = 0;
      const dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts;
      items.forEach((it) => {
        if (!it.cv.isConnected) { it.gone += dt; if (it.gone > 1.5) { items.delete(it); if (io) io.unobserve(it.cv); } return; }
        it.gone = 0;
        if (it.cv.__ptVis === false) return;
        it.t += dt;
        const W = it.cv.width, H = it.cv.height;
        it.ctx.clearRect(0, 0, W, H);
        drawVortex(it.ctx, W / 2, H / 2, Math.min(W, H) * 0.46, it.t, it.o, it.parts, dt);
      });
      if (items.size) raf = requestAnimationFrame(loop);
    }
    return {
      add(cv, o, n) {
        const it = { cv, ctx: cv.getContext('2d'), o, t: Math.random() * 10, parts: newParts(n || 16), gone: 0 };
        items.add(it); if (io) io.observe(cv);
        if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
      },
    };
  })();
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // ---------------- icônes (G.Icons avec repli emoji) ----------------
  const ICO_FB = { skull: '💀', lock: '🔒', portal: '🌀', crown: '👑', gift: '🎁', gold: '🪙', xp: '✨', timer: '⏳', refresh: '↻', star: '★', 'star-fill': '★', warning: '⚠', close: '✕', check: '✔', flag: '⚑', chest: '🎁', sword: '⚔', key: '🗝', eye: '👁', map: '🗺', target: '◎', info: 'ℹ' };
  function ico(name, size, cls) {
    size = size || 16;
    try {
      if (G.Icons && typeof G.Icons.svg === 'function' && (!G.Icons.has || G.Icons.has(name))) {
        const s = G.Icons.svg(name, { size, cls });
        if (s) return '<span class="pt-ic">' + s + '</span>';
      }
    } catch (e) { /* repli emoji */ }
    return '<span class="pt-ic" style="font-size:' + Math.round(size * 0.85) + 'px;line-height:1">' + (ICO_FB[name] || '•') + '</span>';
  }
  const rankBadge = (r, size) => '<span class="ds-rank ds-rank--' + (size || 'sm') + '" data-rank="' + esc(r) + '">' + esc(r) + '</span>';
  const fmtX = (v) => 'x' + String(v).replace('.', ',');

  // ---------------- effet « accès refusé » ----------------
  function denyFx(card, reason) {
    sfx('error');
    try {
      injectStyle();
      if (card) {
        card.classList.remove('pt-shake'); void card.offsetWidth; card.classList.add('pt-shake');
        const f = document.createElement('div'); f.className = 'pt-redflash'; card.appendChild(f);
        setTimeout(() => { f.remove(); card.classList.remove('pt-shake'); }, 700);
      }
      document.querySelectorAll('.pt-deny,.pt-vig').forEach((e) => e.remove());
      const v = document.createElement('div'); v.className = 'pt-vig';
      const m = document.createElement('div'); m.className = 'pt-deny'; m.setAttribute('role', 'alert');
      m.innerHTML = '<div class="pt-denyic">' + ico('lock', 22) + '</div>' + esc(reason);
      document.body.appendChild(v); document.body.appendChild(m);
      try { G.core && G.core.shake && G.core.shake(0.4); } catch (e) { /* ignore */ }
      const kill = () => { v.remove(); m.remove(); };
      m.addEventListener('click', kill);
      setTimeout(kill, 2800);
    } catch (e) { /* ignore */ }
    return reason;
  }

  // ---------------- fiche détaillée ----------------
  function skulls(n) { let s = ''; for (let i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '">' + ico('skull', 14) + '</i>'; return '<span class="pt-skulls" aria-label="Danger ' + n + ' sur 5">' + s + '</span>'; }
  function pips(list) { return '<span class="pt-pips">' + (list || []).map((r) => '<span class="pt-pip" style="--c:' + (RAR_COL[r] || '#fff') + '" title="' + esc(RAR_NAME[r] || r) + '"></span>').join('') + '</span>'; }
  const secHead = (t) => '<div class="pt-sec">' + esc(t) + '</div>';
  const typeBadge = (d) => '<span class="ds-badge pt-type' + (d.type === 'normal' ? ' pt-plain' : '') + '" style="--pa:' + esc(d.accent || d.color) + '">' + esc(d.typeLabel) + '</span>';
  function sheetNode(d, portal) {
    const el = document.createElement('div'); el.className = 'pt-sheet';
    const dg = d.difficulty;
    el.style.setProperty('--pc', d.color); el.style.setProperty('--pa', d.type === 'epreuve' ? '#ffd76b' : (d.accent || d.color));
    let h = '<div class="pt-sh-top"><div class="pt-vx"><div class="pt-ring"><canvas width="160" height="160"></canvas></div>' + rankBadge(d.rank, 'md') + '</div>'
      + '<div class="pt-body"><div class="pt-sh-name">' + esc(d.name) + '</div>'
      + '<div class="pt-sub">' + typeBadge(d) + skulls(d.danger) + '</div>'
      + (d.desc ? '<div class="pt-sh-desc">' + esc(d.desc) + '</div>' : '') + '</div></div>';
    // jauge de difficulté
    const pct = dg.ratio != null ? clamp(Math.round(dg.ratio / 2 * 100), 4, 100) : 0;
    h += '<div class="pt-gauge"><div class="pt-gauge-h"><span>Difficulté</span><b style="color:' + esc(dg.color) + '">' + esc(dg.label) + '</b></div>'
      + (dg.ratio != null ? '<div class="ds-bar"><div class="ds-bar__fill" style="width:' + pct + '%;background:' + esc(dg.color) + '"></div></div><small>Votre puissance ' + Math.round(dg.power) + ' · recommandée ' + dg.recommended + '</small>' : '<small>Puissance recommandée : ' + dg.recommended + '</small>') + '</div>';
    h += '<div class="ds-stat-grid">'
      + '<div class="ds-stat"><span class="ds-stat__label">Rang du donjon</span><b class="ds-stat__value" style="color:' + esc(d.color) + '">' + esc(d.rankName) + '</b></div>'
      + '<div class="ds-stat"><span class="ds-stat__label">Rang requis</span><b class="ds-stat__value">' + esc(RNAME[d.minRank] || d.minRank) + '</b></div>'
      + '<div class="ds-stat"><span class="ds-stat__label">Salles</span><b class="ds-stat__value">' + esc(d.rooms) + '</b></div>'
      + '<div class="ds-stat"><span class="ds-stat__label">Boss</span><b class="ds-stat__value">' + (d.hasBoss ? (d.bossName ? esc(d.bossName) : 'Oui') : 'Aucun') + '</b></div></div>';
    if (d.monsterTypes && d.monsterTypes.length) {
      h += '<div>' + secHead('Créatures') + '<div class="pt-chips">'
        + (d.hasBoss && d.bossName ? '<span class="ds-chip pt-boss">' + ico('crown', 13) + esc(d.bossName) + '</span>' : '')
        + d.monsterTypes.map((m) => '<span class="ds-chip">' + esc(m) + '</span>').join('') + '</div></div>';
    }
    // récompenses par rareté
    const rw = d.rewards;
    h += '<div>' + secHead('Récompenses possibles') + '<div class="pt-rars">' + (rw.rarities || []).map((r) => '<div class="pt-rar" style="--c:' + (RAR_COL[r] || '#fff') + '"><span class="pt-pip" style="--c:' + (RAR_COL[r] || '#fff') + '"></span>' + esc(RAR_NAME[r] || r) + '</div>').join('') + '</div>'
      + ((rw.gold || rw.xp) ? '<div class="ds-stat-grid" style="margin-top:6px">'
        + (rw.gold ? '<div class="ds-stat"><span class="ds-stat__label">' + ico('gold', 15) + ' Or</span><b class="ds-stat__value" style="color:var(--ds-gold,#ffc94a)">' + rw.gold[0] + '–' + rw.gold[1] + (rw.goldMult > 1 ? ' <span class="pt-x">or ' + fmtX(rw.goldMult) + '</span>' : '') + '</b></div>' : '')
        + (rw.xp ? '<div class="ds-stat"><span class="ds-stat__label">' + ico('xp', 15) + ' Expérience</span><b class="ds-stat__value">' + rw.xp + ' XP</b></div>' : '') + '</div>' : '')
      + (rw.mult > 1 ? '<div class="pt-note pt-n-gold" style="margin-top:8px">' + ico('star', 15) + '<span>Récompenses <b>' + fmtX(rw.mult) + '</b> sur ce portail.</span></div>' : '') + '</div>';
    if (d.modifiers.length) h += '<div>' + secHead('Modificateurs') + '<div class="pt-mods">' + d.modifiers.map((m) => '<div class="pt-mod"><span class="pt-mi">' + esc(m.icon || '✦') + '</span><div><b>' + esc(m.name) + '</b><span>' + esc(m.desc) + '</span></div></div>').join('') + '</div></div>';
    if (d.mechanics && d.mechanics.length) h += '<div>' + secHead('Particularités du lieu') + '<div class="pt-chips">' + d.mechanics.map((m) => '<span class="ds-chip" title="' + esc(m.desc) + '">' + esc(m.name) + '</span>').join('') + '</div></div>';
    if (d.type === 'rouge') h += '<div class="pt-note pt-n-red">' + ico('lock', 16) + '<span><b>Faille rouge</b> : la sortie est scellée tant que le boss n\'est pas tombé. Récompenses x2.</span></div>';
    if (d.double) h += '<div class="pt-note pt-n-violet">' + ico('portal', 16) + '<span>Un second donjon (<b>' + esc(d.double.templateName) + '</b>, rang ' + esc(d.double.rank) + ') se cache derrière celui-ci.</span></div>';
    if (d.trial) {
      const c = d.trial.constraints || {}; const L = [];
      if (c.timeLimit) L.push('⏱ ' + Math.floor(c.timeLimit / 60) + ' min ' + (c.timeLimit % 60 ? (c.timeLimit % 60) + ' s' : ''));
      if (c.noPotions) L.push('🚫 potions interdites'); if (c.noDash) L.push('🚫 roulade interdite'); if (c.maxHits) L.push('💥 ' + c.maxHits + ' coups max'); if (c.oneLife) L.push('☠ une seule vie');
      if (c.survive) L.push('🌊 tenir ' + c.survive.seconds + ' s'); if (c.bossBuff) L.push('👑 boss renforcé');
      h += '<div>' + secHead('Épreuve de promotion') + '<div class="pt-note pt-n-gold">' + ico('star', 16) + '<span><b>' + esc(d.trial.name) + '</b><br>' + esc(d.trial.desc || '')
        + (L.length ? '<br><span class="pt-chips" style="margin-top:6px">' + L.map((x) => '<span class="ds-chip">' + esc(x) + '</span>').join('') + '</span>' : '')
        + '<br><i>Réussir = promotion au ' + esc(RNAME[d.trial.rank] || d.trial.rank) + '.</i></span></div></div>';
    }
    if (d.expiresAfterRuns != null) h += '<div class="pt-note">' + ico('timer', 16) + '<span>Ce portail s\'effondrera après <b>' + d.expiresAfterRuns + ' donjon' + (d.expiresAfterRuns > 1 ? 's' : '') + '</b>.</span></div>';
    el.innerHTML = h;
    Vortex.add(el.querySelector('canvas'), vxOpts(portal, false), 24);
    return el;
  }
  // fenêtre système .ds-modal > .ds-window ; résout avec la valeur du bouton ('enter' | 'cancel')
  function ownModal(title, subtitle, node, buttons) {
    return new Promise((resolve) => {
      injectStyle();
      const o = document.createElement('div'); o.className = 'ds-modal pt-modal'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
      const done = (v) => { document.removeEventListener('keydown', onKey, true); o.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done('cancel'); } };
      o.innerHTML = '<div class="ds-modal__backdrop"></div><div class="ds-window pt-win"><div class="ds-window__header"><span class="ds-window__icon">' + ico('map', 20) + '</span><div class="ds-window__titles"><h2 class="ds-window__title pt-wt"></h2><p class="ds-window__subtitle pt-ws"></p></div><div class="ds-window__actions"><button type="button" class="ds-icon-btn ds-icon-btn--round ds-icon-btn--sm" data-act="cancel" aria-label="Fermer">' + ico('close', 18) + '</button></div></div><div class="ds-window__body"></div><div class="ds-window__footer"></div></div>';
      o.querySelector('.pt-wt').textContent = title;
      o.querySelector('.pt-ws').textContent = subtitle || '';
      o.querySelector('.ds-window__body').appendChild(node);
      const bar = o.querySelector('.ds-window__footer');
      buttons.forEach((b) => {
        const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.act = b.value;
        bt.className = 'ds-btn ds-btn--lg ' + (b.style === 'primary' ? 'ds-btn--gold pt-wide' : 'ds-btn--secondary');
        bt.innerHTML = (b.icon ? '<span class="ds-btn__icon">' + b.icon + '</span>' : '') + esc(b.label);
        bar.appendChild(bt);
      });
      o.addEventListener('click', (e) => {
        if (e.target.classList.contains('ds-modal__backdrop')) return done('cancel');
        const b = e.target.closest && e.target.closest('[data-act]'); if (b) done(b.dataset.act);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(o);
    });
  }
  let busy = false;
  function openSheet(portal, profile, card) {
    if (busy) return;
    const chk = canEnter(profile, portal);
    if (!chk.ok) { denyFx(card, chk.reason); return; }
    sfx('click');
    const d = Portals.describe(portal, profile);
    const node = sheetNode(d, portal);
    const trial = portal.type === 'epreuve';
    const btns = [{ label: 'Retour', value: 'cancel', style: 'ghost' }, { label: trial ? "Tenter l'épreuve" : 'Entrer', value: 'enter', style: 'primary', icon: ico(trial ? 'star' : 'play', 18) }];
    busy = true;
    ownModal(d.name, d.typeLabel + ' · ' + d.rankName, node, btns).then((v) => {
      busy = false;
      if (v === 'enter') startOpening(portal, profile, card);
    }, () => { busy = false; });
  }
  // ---------------- animation d'ouverture ----------------
  let opening = false;
  function startOpening(portal, profile, card) {
    if (opening) return;
    // re-vérification juste avant l'entrée
    const chk = canEnter(profile, portal);
    if (!chk.ok) { denyFx(card, chk.reason); return; }
    opening = true;
    const go = () => {
      try {
        if (G.game && G.game.enterPortal) G.game.enterPortal(portal);
        else if (G.UI && G.UI.on && G.UI.on.enterDungeon) G.UI.on.enterDungeon(portal.templateId);
        else toast('Entrée indisponible.');
      } catch (e) { console.error('[Portals] enterPortal', e); toast('Impossible d\'ouvrir le portail.'); }
    };
    if (typeof document === 'undefined') { opening = false; go(); return; }
    const ov = document.createElement('div'); ov.className = 'pt-open';
    const W = Math.max(200, Math.round(innerWidth / 2)), H = Math.max(200, Math.round(innerHeight / 2));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; ov.appendChild(cv);
    const fl = document.createElement('div'); fl.className = 'pt-open-flash'; ov.appendChild(fl);
    const cap = document.createElement('div'); cap.className = 'pt-open-cap'; cap.style.setProperty('--pc', portal.color); cap.innerHTML = 'Ouverture de la faille<b>' + esc(portal.name) + '</b>'; ov.appendChild(cap);
    document.body.appendChild(ov);
    const rect = card ? (card.querySelector('.pt-vx') || card).getBoundingClientRect() : { left: innerWidth / 2 - 50, top: innerHeight / 2 - 50, width: 100, height: 100 };
    const x0 = (rect.left + rect.width / 2) / innerWidth * W, y0 = (rect.top + rect.height / 2) / innerHeight * H;
    const R0 = rect.width / innerWidth * W * 0.46, R1 = Math.hypot(W, H) * 0.62;
    const o = vxOpts(portal, false); const parts = newParts(70);
    const ctx = cv.getContext('2d');
    const T = reduced() ? 0.35 : 1.25;
    let t0 = 0, last = 0, called = false;
    sfx('spawn'); sfx('door');
    const frame = (ts) => {
      if (!t0) { t0 = ts; last = ts; }
      const e = (ts - t0) / 1000, dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      const p = Math.min(1, e / T), ease = p * p * (0.4 + 0.6 * p);
      const mv = Math.min(1, p / 0.6);
      o.suck = 1 + p * 5; o.speed = vxOpts(portal, false).speed * (1 + p * 6);
      const cx = x0 + (W / 2 - x0) * (mv * mv), cy = y0 + (H / 2 - y0) * (mv * mv);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.25 + 0.75 * p) + ')'; ctx.fillRect(0, 0, W, H);
      drawVortex(ctx, cx, cy, R0 + (R1 - R0) * ease, e, o, parts, dt);
      ov.style.transform = p > 0.5 ? 'translate(' + ((Math.random() - 0.5) * p * 6).toFixed(1) + 'px,' + ((Math.random() - 0.5) * p * 6).toFixed(1) + 'px)' : '';
      fl.style.opacity = p > 0.8 ? String(Math.min(1, (p - 0.8) / 0.2)) : '0';
      if (p >= 1 && !called) {
        called = true; ov.style.transform = '';
        go();
        setTimeout(() => {
          ov.style.transition = 'opacity .5s'; ov.style.opacity = '0';
          setTimeout(() => { ov.remove(); opening = false; }, 560);
        }, 350);
        return;
      }
      if (!called) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---------------- panneau ----------------
  let filterMode = 'all';
  const isSpecial = (p) => p.type !== 'normal';
  function cardNode(portal, profile) {
    const d = Portals.describe(portal, profile);
    const chk = canEnter(profile, portal);
    const locked = !chk.ok;
    const trial = portal.type === 'epreuve';
    const isSecretLocked = chk.kind === 'secret';
    const el = document.createElement('div');
    el.className = 'ds-card pt-card pt-' + portal.type + (locked ? ' pt-locked' : '') + (trial ? ' pt-featured' : '');
    el.dataset.id = portal.id;
    const pcol = locked ? '#7b82a0' : portal.color;
    el.style.setProperty('--pc', pcol);
    el.style.setProperty('--pa', locked ? '#7b82a0' : (trial ? '#ffd76b' : (portal.accent || portal.color)));
    const mods = d.modifiers.slice(0, 3).map((m) => '<span class="ds-chip pt-modchip">' + esc(m.icon || '✦') + ' ' + esc(m.name) + '</span>').join('')
      + (d.modifiers.length > 3 ? '<span class="ds-chip">+' + (d.modifiers.length - 3) + '</span>' : '');
    const exp = portal.expiresAfterRuns != null ? '<span class="pt-exp" title="Disparaît après ' + portal.expiresAfterRuns + ' donjon(s)">' + ico('timer', 14) + portal.expiresAfterRuns + '</span>' : '';
    el.innerHTML =
      (trial ? '<div class="pt-banner">' + ico('star', 15) + 'Épreuve de promotion<small>Rang ' + esc(portal.rank) + '</small></div>' : '')
      + '<div class="pt-main"><div class="pt-row">'
      + '<div class="pt-vx"><div class="pt-ring"><canvas width="128" height="128"></canvas></div>' + rankBadge(portal.rank, 'sm') + '</div>'
      + '<div class="pt-body"><div class="pt-top">' + typeBadge(d) + exp + '</div>'
      + '<div class="pt-name">' + esc(d.name) + '</div>'
      + '<div class="pt-sub">' + skulls(d.danger) + '<span class="pt-diff" style="color:' + esc(d.difficulty.color) + '">' + esc(d.difficulty.label) + '</span></div></div></div>'
      + '<div class="pt-info">'
      + '<div class="ds-stat"><span class="ds-stat__label">' + ico('map', 15) + 'Salles</span><b class="ds-stat__value">' + esc(d.rooms) + '</b></div>'
      + '<div class="ds-stat"><span class="ds-stat__label">' + ico('crown', 15) + 'Boss</span><b class="ds-stat__value">' + (d.hasBoss ? (d.bossName ? esc(d.bossName) : 'Oui') : 'Aucun') + '</b></div>'
      + (trial ? '<div class="ds-stat"><span class="ds-stat__label">' + ico('star', 15) + 'Récompense</span><b class="ds-stat__value">Promotion</b></div>'
        : '<div class="ds-stat"><span class="ds-stat__label">' + ico('gift', 15) + 'Butin</span><b class="ds-stat__value">' + pips(d.rewards.rarities) + (d.rewards.mult > 1 ? '<span class="pt-x">' + fmtX(d.rewards.mult) + '</span>' : '') + (d.rewards.goldMult > 1 ? '<span class="pt-x">or ' + fmtX(d.rewards.goldMult) + '</span>' : '') + '</b></div>')
      + '</div>'
      + (mods ? '<div class="pt-chips">' + mods + '</div>' : '')
      + (locked ? '<div class="pt-frost"><div class="pt-lockc">' + ico('lock', 24) + '</div><div class="pt-need">' + (isSecretLocked ? 'SECRET' : 'RANG ' + esc(portal.minRank || portal.rank) + ' REQUIS') + '</div>'
        + (isSecretLocked && d.secretHint ? '<div class="pt-hint">' + ico('eye', 13) + esc(d.secretHint) + '</div>' : '') + '</div>' : '')
      + '</div>'
      + '<button type="button" class="ds-btn ds-btn--block pt-go ' + (locked ? 'ds-btn--secondary' : (trial ? 'ds-btn--gold' : 'ds-btn--primary')) + '"' + (locked ? ' aria-disabled="true"' : '') + '>'
      + '<span class="ds-btn__icon">' + ico(locked ? 'lock' : (trial ? 'star' : 'play'), 16) + '</span>' + (locked ? (isSecretLocked ? 'SCELLÉ' : 'VERROUILLÉ') : (trial ? "TENTER L'ÉPREUVE" : 'ENTRER')) + '</button>';
    Vortex.add(el.querySelector('canvas'), vxOpts(portal, locked), locked ? 8 : 16);
    el.addEventListener('click', () => {
      const pf = curProfile() || profile;
      if (locked || !canEnter(pf, portal).ok) { denyFx(el, canEnter(pf, portal).reason || chk.reason); return; }
      openSheet(portal, pf, el);
    });
    return el;
  }
  function renderPanel(container, profile) {
    injectStyle();
    profile = profile || curProfile();
    mounted = container;
    container.innerHTML = '';
    if (!profile) { container.innerHTML = '<div class="ds-empty pt-empty">Aucun héros.</div>'; return; }
    Portals.ensureProfile(profile);
    const list = Portals.list(profile);
    const cur = playerRank(profile), nxt = ORDER[ri(cur) + 1];
    const root = document.createElement('div'); root.className = 'pt-root';
    const cost = Portals.refreshCost(profile);
    const pI = ri(cur);
    const counts = { all: list.length, avail: list.filter((p) => ri(p.rank) <= pI || p.type === 'epreuve').length, special: list.filter(isSpecial).length };
    const filt = (id, label, n) => '<button type="button" data-f="' + id + '" class="' + (filterMode === id ? 'is-active' : '') + '" aria-pressed="' + (filterMode === id) + '">' + label + ' <i>' + n + '</i></button>';
    root.innerHTML = '<div class="ds-section-title">Carte des failles</div>'
      + (profile.portals.event ? '<div class="pt-event">' + ico('star', 18) + '<span>' + (profile.portals.event.id === 'vague' ? 'VAGUE DE FAILLES ! Des portails exceptionnels sont apparus, pour un temps limité.' : 'PORTAIL DORÉ ! Une faille déborde d\'or, ne tardez pas.') + '</span></div>' : '')
      + '<div class="pt-bar"><div class="ds-segmented pt-filters" role="group" aria-label="Filtrer les failles">' + filt('all', 'Tous', counts.all) + filt('avail', 'Disponibles', counts.avail) + filt('special', 'Spéciaux', counts.special) + '</div>'
      + '<div class="pt-rkline">Rang ' + rankBadge(cur, 'sm') + (nxt ? '<span class="pt-arrow">→</span>' + rankBadge(nxt, 'sm') : '') + '</div>'
      + '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm pt-refresh"><span class="ds-btn__icon">' + ico('refresh', 16) + '</span>Actualiser<span class="pt-cost">' + cost + ico('gold', 14) + '</span></button></div>';
    const grid = document.createElement('div'); grid.className = 'pt-grid';
    const fillGrid = () => {
      grid.innerHTML = '';
      const shown = list.filter((p) => filterMode === 'all' || (filterMode === 'avail' ? (ri(p.rank) <= pI || p.type === 'epreuve') : isSpecial(p)));
      shown.forEach((p, i) => { const c = cardNode(p, profile); c.style.animationDelay = Math.min(i, 8) * 45 + 'ms'; grid.appendChild(c); });
      if (!shown.length) grid.innerHTML = '<div class="ds-empty pt-empty">' + ico('portal', 28) + '<div style="margin-top:8px">' + (list.length ? 'Aucune faille ne correspond à ce filtre.' : 'Aucune faille détectée.') + '</div></div>';
    };
    fillGrid();
    root.appendChild(grid);
    container.appendChild(root);
    root.querySelector('.pt-filters').addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-f]'); if (!b || b.dataset.f === filterMode) return;
      filterMode = b.dataset.f; sfx('click');
      root.querySelectorAll('.pt-filters [data-f]').forEach((x) => { const on = x.dataset.f === filterMode; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); });
      fillGrid();
    });
    root.querySelector('.pt-refresh').addEventListener('click', () => {
      const r = Portals.buyRefresh(profile);
      if (!r.ok) { sfx('error'); toast(r.reason); return; }
      sfx('gold'); toast('Les failles se sont réorganisées. −' + r.cost + ' 🪙');
      try { G.UI && G.UI.refreshCamp ? G.UI.refreshCamp() : renderPanel(container, profile); } catch (e) { renderPanel(container, profile); }
      if (container.isConnected && container.firstChild && container.querySelector('.pt-root') === null) renderPanel(container, profile);
    });
  }
  // ---------------- enregistrement du panneau ----------------
  const panelDef = {
    id: 'portails', title: 'Portails', icon: '🌀', order: 1,
    visible() { return true; },
    badge(profile) { try { const l = (profile && profile.portals && profile.portals.list) || []; return l.some((x) => x.type === 'epreuve') ? '!' : (profile && profile.portals && profile.portals.event ? '★' : null); } catch (e) { return null; } },
    render(container, profile) { renderPanel(container, profile); },
  };
  try {
    if (G.Panels && !G.Panels.has('portails')) {
      if (G.UI && G.UI.registerPanel) G.UI.registerPanel(panelDef); else G.Panels.register('portails', panelDef);
    }
  } catch (e) { console.error('[Portals] panneau', e); }

  G.Portals = Portals;
})();
