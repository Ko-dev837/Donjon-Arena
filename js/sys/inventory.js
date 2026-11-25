/* =====================================================================
   js/sys/inventory.js — RÔLE 5 : G.Inventory (génération, équipement, amélioration, fabrication,
   effets uniques, butin) + panneau « Inventaire ».
   Dépend (à l'exécution seulement) de : G.ITEMS, G.rng, G.bus, G.hooks, G.Panels, G.game, G.SkillAPI, G.UI, G.Ranks.

   API :
     ensureProfile(p) · generate(level, rank, rarityHint, opts{classe,slot,luck,boost}) -> item
     add(p,item)->{ok,recycled?} · equip(p,uid)->{ok,reason} · unequip(p,slotOrUid)->{ok,reason}
     salvage(p,uid)->{ok,mats} · salvageAll(p,{maxRarity})->{count,mats} · lock(p,uid)
     upgradeCost(item) · upgrade(p,uid)->{ok,reason,cost} · craft(p,recipeId,{slot,uid,classe})->{ok,reason,item}
     grantReward(p,id|{id,count}|[...]) · addMaterial(p,id,n) · hasMaterials(p,mats) · sellMaterial(p,id,n) · convertMaterial(p,id,n)
     statsFromGear(p) -> {add,pct,dmg,total,power,sets,effects} · itemTotals(item) · itemPower(item)
     applyEffects(p) · fmtStat(key,val) · describe(item) · EFFECTS (implémentations)
   Item : { uid, baseId, slot, name, icon, rarity, level, rankReq, stats:{base}, affixes:[{id,value,text}],
            set, upgrade, classes, effect, locked }
   Les stats de base (item.stats) et les affixes sont stockées BRUTES ; le bonus d'amélioration (+3 %/palier)
   est appliqué par itemTotals().
   ===================================================================== */
window.G = window.G || {};
(() => {
  const RO = ['E', 'D', 'C', 'B', 'A', 'S', 'Z'];
  const SLOT_IDS = ['arme', 'armure', 'casque', 'bottes', 'anneau', 'amulette'];
  const rIdx = (r) => Math.max(0, RO.indexOf(r));
  const I = () => G.ITEMS;
  const rarIdx = (id) => Math.max(0, I().rarities.findIndex((r) => r.id === id));
  const rarOf = (item) => I().rarities[rarIdx(item.rarity)];
  const BAL = () => I().balance;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let uidCount = 0;
  const newUid = () => 'it_' + Date.now().toString(36) + Math.floor(G.rng.float() * 1e9).toString(36) + (uidCount++).toString(36);
  const levelRank = (l) => (l < 5 ? 'E' : l < 10 ? 'D' : l < 15 ? 'C' : l < 22 ? 'B' : l < 28 ? 'A' : 'S');
  const tierOfRank = (r) => (rIdx(r) <= 1 ? 0 : rIdx(r) <= 3 ? 1 : 2);
  const prof = () => (G.game && (G.game.profile || (G.game.getProfile && G.game.getProfile()) || (G.game.state && G.game.state.profile))) || null;
  const apiOn = () => { const a = G.SkillAPI; try { return a && a.inRun && a.inRun() ? a : null; } catch (_) { return null; } };
  const fnum = (x, d) => { const s = (Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString(); return s.replace('.', ','); };

  // ------------------------------------------------------------------
  // CONVERSIONS stat <-> % de puissance
  // ------------------------------------------------------------------
  function unitOf(key) { const s = I().stats[key]; if (!s) return 0.01; return s.kind === 'flat' ? (BAL().refs[key] || s.ref) / 100 : 0.01; }
  const powerOf = (key, v) => { const s = I().stats[key]; return s ? s.w * v / unitOf(key) : 0; };
  const valueFor = (key, pct) => { const s = I().stats[key]; return s ? pct / s.w * unitOf(key) : 0; };
  function roundVal(key, v) {
    const s = I().stats[key];
    if (s.int) return Math.round(v);
    if (s.kind === 'flat') { const d = s.dec != null ? s.dec : (Math.abs(v) >= 10 ? 0 : 1); const m = Math.pow(10, d); return Math.round(v * m) / m; }
    return Math.round(v * 10000) / 10000;
  }
  function fmtVal(key, v, signed) {
    const s = I().stats[key]; if (!s) return String(v);
    const sg = signed ? (v >= 0 ? '+' : '−') : '+';
    const a = Math.abs(v);
    if (s.kind === 'flat') return sg + fnum(a, s.int ? 0 : (s.dec != null ? s.dec : (a >= 10 ? 0 : 1)));
    return sg + fnum(a * 100, a * 100 >= 10 ? 0 : 1) + ' %';
  }
  function fmtStat(key, v) { const s = I().stats[key]; return s ? fmtVal(key, v) + ' ' + s.label : key; }

  // ------------------------------------------------------------------
  // GÉNÉRATION
  // ------------------------------------------------------------------
  function levelFactor(level) { const b = BAL(); return b.levelFloor + (1 - b.levelFloor) * Math.min(level, b.levelCap) / b.levelCap; }
  function weightedPick(list, wf) {
    let tot = 0; for (const x of list) tot += wf(x);
    if (tot <= 0) return list[Math.floor(G.rng.float() * list.length)];
    let r = G.rng.float() * tot;
    for (const x of list) { r -= wf(x); if (r < 0) return x; }
    return list[list.length - 1];
  }
  function rarityWeights(rank, luck, opts) {
    const w = (I().rarityWeights[rank] || I().rarityWeights.E).slice();
    for (let i = 0; i < w.length; i++) w[i] *= Math.pow(1 + Math.max(0, luck || 0), i);
    if (opts && opts.boost) { w[3] *= opts.boost.leg || 1; w[4] *= opts.boost.myth || 1; }
    return w;
  }
  function pickRarity(rank, luck, hint, opts) {
    let w = rarityWeights(rank, luck, opts);
    if (hint) {
      const plus = /\+$/.test(hint); const id = hint.replace('+', ''); const i = rarIdx(id);
      if (!plus) return i;
      for (let k = 0; k < i; k++) w[k] = 0;
      if (w.reduce((a, b) => a + b, 0) <= 0) return i;
    }
    const tot = w.reduce((a, b) => a + b, 0); let r = G.rng.float() * tot;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return 0;
  }
  const classOk = (base, classe) => !classe || !base.classes || base.classes.indexOf(classe) >= 0;

  function pickBaseId(ri, rank, opts) {
    const items = I(), D = BAL().drops, classe = opts.classe, ranki = rIdx(rank);
    const slotOk = (b) => !opts.slot || b.slot === opts.slot;
    // objet nommé (légendaire / mythique)
    if (ri >= 3 && (ri === 4 || G.rng.chance(D.uniqueChance))) {
      let pool = Object.values(items.bases).filter((b) => b.unique && b.rarity === items.rarities[ri].id && rIdx(b.rankReq) <= ranki && slotOk(b));
      const pref = pool.filter((b) => classOk(b, classe));
      if (classe) pool = pref; // jamais d'objet réservé à une autre classe
      if (pool.length) return G.rng.pick(pool).id;
    }
    // pièce d'ensemble
    if ((ri === 2 || ri === 3) && G.rng.chance(D.setChance)) {
      let sets = Object.values(items.sets).filter((s) => s.rarity === items.rarities[ri].id && rIdx(s.minRank) <= ranki);
      const pref = sets.filter((s) => !classe || s.classes.indexOf(classe) >= 0);
      if (classe) sets = pref;
      if (sets.length) {
        const s = G.rng.pick(sets); const pcs = s.pieces.filter((p) => (!opts.slot || p.slot === opts.slot) && classOk(p, classe));
        if (pcs.length) return G.rng.pick(pcs).id;
      }
    }
    // base générique
    const slot = opts.slot || weightedPick(items.slots, (s) => s.weight).id;
    const tier = tierOfRank(rank);
    let c = Object.values(items.bases).filter((b) => !b.unique && !b.set && b.slot === slot && b.tier === tier);
    if (classe) c = c.filter((b) => classOk(b, classe));
    if (!c.length) c = Object.values(items.bases).filter((b) => !b.unique && !b.set && b.slot === slot && classOk(b, classe));
    if (!c.length) c = Object.values(items.bases).filter((b) => !b.unique && !b.set && b.slot === slot);
    return G.rng.pick(c).id;
  }

  function rollAffixes(base, ri, budgetAffix, exclude) {
    const R = I().rarities[ri], J = BAL().jitter, out = [];
    let pool = Object.values(I().affixes).filter((a) => ri >= a.minRarity && (!a.slots || a.slots.indexOf(base.slot) >= 0));
    for (let n = 0; n < R.affixes && pool.length; n++) {
      const a = weightedPick(pool, (x) => x.weight);
      pool = pool.filter((x) => x !== a);
      const pct = budgetAffix / R.affixes * (J[0] + G.rng.float() * (J[1] - J[0]));
      let v = valueFor(a.stat, pct);
      if (a.max) v = Math.min(v, a.max);
      v = roundVal(a.stat, v);
      if (I().stats[a.stat].int && v < 1) v = 1;
      if (!(v > 0)) continue;
      out.push({ id: a.id, value: v, text: fmtStat(a.stat, v) });
    }
    return out;
  }
  function itemName(base, affixes, ri) {
    if (base.unique || base.set || ri < 1 || !affixes.length) return base.name;
    return base.name + ' ' + I().affixes[affixes[0].id].suffix;
  }
  function build(baseId, ri, level, rank) {
    const base = I().bases[baseId], R = I().rarities[ri], slot = I().slots.find((s) => s.id === base.slot);
    const budget = R.budget * slot.weight * levelFactor(level), bs = BAL().baseShare, stats = {};
    Object.keys(base.baseStats).forEach((k) => {
      const v = roundVal(k, valueFor(k, budget * bs * base.baseStats[k]));
      if (v > 0) stats[k] = v;
    });
    const affixes = rollAffixes(base, ri, budget * (1 - bs));
    const item = {
      uid: newUid(), baseId, slot: base.slot, name: itemName(base, affixes, ri), icon: base.icon, rarity: R.id, level: Math.round(level),
      rankReq: (base.unique || base.set) ? base.rankReq : rank, stats, affixes, set: base.set || null, upgrade: 0,
      classes: base.classes ? base.classes.slice() : null, effect: base.effect || null, locked: false, born: Date.now(),
    };
    return item;
  }
  function generate(level, rank, rarityHint, opts) {
    opts = Object.assign({}, opts || {});
    // butin toujours adapté à la classe du héros (jamais d'arme réservée à une autre classe)
    if (!opts.classe && opts.anyClass !== true) { try { const pr = G.game && G.game.profile; if (pr && pr.classe) opts.classe = pr.classe; } catch (_) { /* rien */ } }
    level = clamp(Math.round(level || 1), 1, 99);
    rank = rank || levelRank(level);
    const ri = pickRarity(rank, opts.luck || 0, rarityHint, opts);
    return build(pickBaseId(ri, rank, opts), ri, level, rank);
  }

  // ------------------------------------------------------------------
  // STATS D'UN OBJET / DE L'ÉQUIPEMENT
  // ------------------------------------------------------------------
  function itemTotals(item) {
    const t = {}; const um = 1 + I().upgrade.statPerLevel * (item.upgrade || 0);
    const add = (k, v) => { const s = I().stats[k]; if (!s) return; t[k] = (t[k] || 0) + (s.int ? v : v * um); };
    Object.keys(item.stats || {}).forEach((k) => add(k, item.stats[k]));
    (item.affixes || []).forEach((a) => add(a.id, a.value));
    return t;
  }
  function itemPower(item) { const t = itemTotals(item); let p = 0; Object.keys(t).forEach((k) => { p += powerOf(k, t[k]); }); return p; }
  function setBonusValues(bonus, level) {
    if (bonus.stats) return Object.assign({}, bonus.stats);
    const out = {}; const lf = levelFactor(level || 30);
    Object.keys(bonus.mix).forEach((k) => { out[k] = valueFor(k, bonus.pct * lf * bonus.mix[k]); if (I().stats[k].int) out[k] = Math.max(1, Math.round(out[k])); });
    return out;
  }
  function equippedItems(p) {
    const inv = p.inventory, out = {};
    SLOT_IDS.forEach((s) => { const uid = inv.equipped[s]; const it = uid && inv.items.find((i) => i.uid === uid); if (it) out[s] = it; });
    return out;
  }
  function statsFromGear(p) {
    if (!p || !p.inventory) return { add: {}, pct: {}, dmg: {}, total: {}, power: 0, sets: [], effects: [] };
    const eq = equippedItems(p), total = {}, effects = [], setCount = {}, lvls = {};
    let power = 0;
    Object.values(eq).forEach((it) => {
      const t = itemTotals(it);
      Object.keys(t).forEach((k) => { total[k] = (total[k] || 0) + t[k]; power += powerOf(k, t[k]); });
      if (it.effect && effects.indexOf(it.effect) < 0) effects.push(it.effect);
      if (it.set) { setCount[it.set] = (setCount[it.set] || 0) + 1; lvls[it.set] = (lvls[it.set] || 0) + it.level; }
    });
    const sets = [];
    Object.keys(setCount).forEach((sid) => {
      const S = I().sets[sid], n = setCount[sid], active = [], avgLvl = lvls[sid] / n;
      Object.keys(S.bonuses).map(Number).sort().forEach((need) => {
        if (n < need) return;
        const b = S.bonuses[need]; active.push(need);
        const vals = setBonusValues(b, avgLvl);
        Object.keys(vals).forEach((k) => { total[k] = (total[k] || 0) + vals[k]; power += powerOf(k, vals[k]); });
        if (b.effect && effects.indexOf(b.effect) < 0) effects.push(b.effect);
      });
      sets.push({ id: sid, name: S.name, count: n, total: S.pieces.length, active });
    });
    // plafonds
    Object.keys(total).forEach((k) => { const s = I().stats[k]; if (s && s.cap && total[k] > s.cap) total[k] = s.cap; });
    const add = {}, pct = {}, dmg = {};
    Object.keys(total).forEach((k) => {
      const s = I().stats[k];
      if (k.indexOf('dmg_') === 0) dmg[k.slice(4)] = total[k];
      else if (s.kind === 'pct') pct[k.replace('Pct', '')] = total[k];
      else add[k] = total[k];
    });
    return { add, pct, dmg, total, power, sets, effects };
  }
  const MULT1 = { xpMult: 1, goldMult: 1, minionDmg: 1, minionPv: 1 };
  function gearHook(stats, ctx) {
    const p = (ctx && ctx.profile) || prof(); if (!p || !p.inventory || !stats) return;
    const g = statsFromGear(p), U = BAL().percentUnits ? 100 : 1;
    const PCTU = { crit: 1, critDmg: 1, cdr: 1, lifesteal: 1, dodge: 1 };
    Object.keys(g.add).forEach((k) => {
      const v = g.add[k] * (PCTU[k] ? U : 1);
      stats[k] = (stats[k] != null ? stats[k] : (MULT1[k] || 0)) + v;
    });
    Object.keys(g.pct).forEach((k) => { if (stats[k] != null) stats[k] *= 1 + g.pct[k]; });
    stats.dmg = stats.dmg || {};
    Object.keys(g.dmg).forEach((el) => { stats.dmg[el] = (stats.dmg[el] != null ? stats.dmg[el] : 1) + g.dmg[el]; });
    if (typeof stats.power === 'number') stats.power *= 1 + g.power / 100;
    stats.gearPower = g.power;
    return stats;
  }

  // ------------------------------------------------------------------
  // PROFIL
  // ------------------------------------------------------------------
  function ensureProfile(p) {
    if (!p) return p;
    const inv = p.inventory = p.inventory || {};
    if (!Array.isArray(inv.items)) inv.items = [];
    inv.equipped = inv.equipped || {};
    SLOT_IDS.forEach((s) => { if (inv.equipped[s] === undefined) inv.equipped[s] = null; });
    inv.materials = inv.materials || {};
    if (!(inv.capacity > 0)) inv.capacity = 60;
    SLOT_IDS.forEach((s) => { if (inv.equipped[s] && !inv.items.some((i) => i.uid === inv.equipped[s])) inv.equipped[s] = null; });
    p.awakening = p.awakening || { rolls: 0, crystals: 0, history: [] };
    inv.materials.cristal_eveil = p.awakening.crystals || 0;
    if (!inv.starterGiven) {
      inv.starterGiven = true;
      const cls = p.classe;
      const wb = Object.values(I().bases).filter((b) => b.slot === 'arme' && !b.unique && !b.set && b.tier === 0 && b.classes && b.classes.indexOf(cls) >= 0);
      if (wb.length && !inv.equipped.arme) {
        const it = build(wb[0].id, 0, p.niveau || 1, 'E'); inv.items.push(it); inv.equipped.arme = it.uid;
      }
    }
    return p;
  }
  function commit(p, quiet) {
    try { G.game && G.game.saveProfile && G.game.saveProfile(); } catch (e) { console.error(e); }
    if (!quiet) G.bus.emit('profileChanged', { profile: p });
  }
  function validateEquipped(p) {
    if (!p || !p.inventory) return;
    let ch = false; const inv = p.inventory;
    SLOT_IDS.forEach((s) => {
      const it = inv.equipped[s] && inv.items.find((i) => i.uid === inv.equipped[s]);
      if (it && it.classes && it.classes.indexOf(p.classe) < 0) { inv.equipped[s] = null; ch = true; }
    });
    if (ch) { try { G.game && G.game.saveProfile && G.game.saveProfile(); } catch (_) {} }
  }
  const find = (p, uid) => p.inventory.items.find((i) => i.uid === uid);
  const isEq = (p, it) => p.inventory.equipped[it.slot] === it.uid;
  const bagCount = (p) => p.inventory.items.filter((i) => !isEq(p, i)).length;
  const bagFree = (p) => p.inventory.capacity - bagCount(p);

  // ------------------------------------------------------------------
  // MATÉRIAUX
  // ------------------------------------------------------------------
  function addMaterial(p, id, n) {
    ensureProfile(p); n = Math.floor(n == null ? 1 : n); if (!n) return;
    const m = p.inventory.materials;
    if (id === 'cristal_eveil') {
      p.awakening = p.awakening || { rolls: 0, crystals: 0, history: [] };
      p.awakening.crystals = Math.max(0, (p.awakening.crystals || 0) + n); m.cristal_eveil = p.awakening.crystals; return;
    }
    m[id] = Math.max(0, (m[id] || 0) + n);
  }
  const matCount = (p, id) => (id === 'cristal_eveil' ? ((p.awakening && p.awakening.crystals) || 0) : (p.inventory.materials[id] || 0));
  function essTotal(p) { return Object.keys(I().materials).filter((k) => I().materials[k].kind === 'essence').reduce((s, k) => s + matCount(p, k), 0); }
  function missing(p, cost) {
    const out = [];
    if (cost.gold && (p.gold || 0) < cost.gold) out.push('or');
    Object.keys(cost.mats || {}).forEach((k) => { if (matCount(p, k) < cost.mats[k]) out.push(I().materials[k] ? I().materials[k].name : k); });
    if (cost.anyEssence && essTotal(p) < cost.anyEssence) out.push('essences');
    return out;
  }
  function pay(p, cost) {
    p.gold = (p.gold || 0) - (cost.gold || 0);
    Object.keys(cost.mats || {}).forEach((k) => addMaterial(p, k, -cost.mats[k]));
    let n = cost.anyEssence || 0;
    if (n) {
      const ks = Object.keys(I().materials).filter((k) => I().materials[k].kind === 'essence').sort((a, b) => matCount(p, b) - matCount(p, a));
      for (const k of ks) { const t = Math.min(n, matCount(p, k)); if (t) { addMaterial(p, k, -t); n -= t; } if (!n) break; }
    }
  }
  const hasMaterials = (p, mats) => missing(p, { mats }).length === 0;
  function sellMaterial(p, id, n) {
    const d = I().materials[id]; n = Math.min(n || 1, matCount(p, id));
    if (!d || !d.sell || d.noSell || n <= 0) return { ok: false, reason: 'Non vendable.' };
    addMaterial(p, id, -n); p.gold = (p.gold || 0) + d.sell * n; commit(p); return { ok: true, gold: d.sell * n };
  }
  function convertMaterial(p, id, n) {
    const d = I().materials[id]; n = Math.min(n || 1, matCount(p, id));
    if (!d || !d.convert || n <= 0) return { ok: false, reason: 'Non convertible.' };
    addMaterial(p, id, -n); Object.keys(d.convert).forEach((k) => addMaterial(p, k, d.convert[k] * n)); commit(p); return { ok: true };
  }

  // ------------------------------------------------------------------
  // AJOUT / ÉQUIPEMENT / RECYCLAGE
  // ------------------------------------------------------------------
  function salvageYield(item) {
    const R = rarOf(item), ri = rarIdx(item.rarity), m = {};
    m.fragment = Math.max(1, Math.round(R.salvage * (0.6 + item.level / 30 * 0.8)));
    if (ri >= 1) m.poussiere_rune = ri >= 3 ? 3 : ri;
    if (ri >= 4) m.coeur_boss = 1;
    // remboursement partiel des fragments investis dans l'amélioration
    let inv = 0; for (let n = 1; n <= (item.upgrade || 0); n++) inv += I().upgrade.mats(n, ri).fragment;
    if (inv) m.fragment += Math.floor(inv * 0.4);
    // essence de l'élément dominant
    let best = null, bv = 0; (item.affixes || []).forEach((a) => { if (a.id.indexOf('dmg_') === 0 && a.id !== 'dmg_physique' && a.value > bv) { best = a.id.slice(4); bv = a.value; } });
    if (best && ri >= 1) m['essence_' + best] = 1;
    return m;
  }
  function doSalvage(p, item) {
    const m = salvageYield(item); Object.keys(m).forEach((k) => addMaterial(p, k, m[k]));
    const inv = p.inventory; inv.items.splice(inv.items.indexOf(item), 1); return m;
  }
  const wrongClass = (p, item) => !!(item && p && p.classe && Array.isArray(item.classes) && item.classes.length && item.classes.indexOf(p.classe) < 0);
  /** objets réservés à une autre classe déjà dans le sac : recyclés en matériaux (jamais ceux équipés ou verrouillés) */
  function purgeWrongClass(p) {
    if (!p || !p.classe || !p.inventory || !Array.isArray(p.inventory.items)) return 0;
    const bad = p.inventory.items.filter((i) => wrongClass(p, i) && !isEq(p, i) && !i.locked);
    bad.forEach((i) => doSalvage(p, i));
    if (bad.length) notify(bad.length + ' objet' + (bad.length > 1 ? 's' : '') + ' d\u2019une autre classe recyclé' + (bad.length > 1 ? 's' : '') + ' en matériaux', 'commun', '♻️');
    return bad.length;
  }
  function add(p, item) {
    ensureProfile(p); const inv = p.inventory;
    if (wrongClass(p, item)) return { ok: false, wrongClass: true };          // jamais d'objet d'une autre classe dans le sac
    if (bagFree(p) > 0) { inv.items.push(item); return { ok: true }; }
    const ri = rarIdx(item.rarity);
    if (ri > 0) {
      const cand = inv.items.filter((i) => !isEq(p, i) && !i.locked && rarIdx(i.rarity) < ri)
        .sort((a, b) => rarIdx(a.rarity) - rarIdx(b.rarity) || a.level - b.level);
      if (cand.length) { const victim = cand[0]; doSalvage(p, victim); inv.items.push(item); return { ok: true, recycled: victim }; }
    }
    inv.items.push(item);
    const mats = doSalvage(p, item);
    return { ok: true, recycled: item, selfRecycled: true, mats };
  }
  function rankReason(p, req) {
    const cur = (p && p.rank) || 'E';
    return 'OBJET VERROUILLÉ : RANG ' + req + ' REQUIS. VOTRE RANG ACTUEL EST ' + cur + '.';
  }
  function canEquip(p, item) {
    if (item.classes && item.classes.indexOf(p.classe) < 0) return { ok: false, reason: 'Réservé : ' + item.classes.join(', ') + '.' };
    if (rIdx((p && p.rank) || 'E') < rIdx(item.rankReq)) return { ok: false, reason: rankReason(p, item.rankReq) };
    return { ok: true };
  }
  function equip(p, uid) {
    ensureProfile(p); const it = find(p, uid);
    if (!it) return { ok: false, reason: 'Objet introuvable.' };
    const c = canEquip(p, it); if (!c.ok) return c;
    p.inventory.equipped[it.slot] = it.uid; commit(p); return { ok: true, item: it };
  }
  function unequip(p, slotOrUid) {
    ensureProfile(p); const inv = p.inventory;
    const slot = SLOT_IDS.indexOf(slotOrUid) >= 0 ? slotOrUid : (inv.items.find((i) => i.uid === slotOrUid) || {}).slot;
    if (!slot || !inv.equipped[slot]) return { ok: false, reason: 'Rien à retirer.' };
    inv.equipped[slot] = null; commit(p); return { ok: true };
  }
  function salvage(p, uid) {
    ensureProfile(p); const it = find(p, uid);
    if (!it) return { ok: false, reason: 'Objet introuvable.' };
    if (isEq(p, it)) return { ok: false, reason: 'Retirez d\'abord l\'objet équipé.' };
    if (it.locked) return { ok: false, reason: 'Objet verrouillé.' };
    const mats = doSalvage(p, it); commit(p); return { ok: true, mats };
  }
  function salvageAll(p, o) {
    ensureProfile(p); const max = rarIdx((o && o.maxRarity) || 'commun'); const tot = {}; let n = 0;
    p.inventory.items.filter((i) => !isEq(p, i) && !i.locked && rarIdx(i.rarity) <= max).forEach((i) => {
      const m = doSalvage(p, i); n++; Object.keys(m).forEach((k) => { tot[k] = (tot[k] || 0) + m[k]; });
    });
    if (n) commit(p); return { count: n, mats: tot };
  }
  function lock(p, uid) { const it = find(p, uid); if (!it) return { ok: false }; it.locked = !it.locked; commit(p, true); return { ok: true, locked: it.locked }; }

  // ------------------------------------------------------------------
  // AMÉLIORATION / FABRICATION / REFORGE
  // ------------------------------------------------------------------
  function upgradeCost(item) {
    const U = I().upgrade, next = (item.upgrade || 0) + 1, ri = rarIdx(item.rarity);
    if (next > U.max) return null;
    return { next, gold: U.gold(next, item.level, ri), mats: U.mats(next, ri) };
  }
  function upgrade(p, uid) {
    ensureProfile(p); const it = find(p, uid);
    if (!it) return { ok: false, reason: 'Objet introuvable.' };
    const c = upgradeCost(it); if (!c) return { ok: false, reason: 'Déjà au maximum (+' + I().upgrade.max + ').' };
    const miss = missing(p, c); if (miss.length) return { ok: false, reason: 'Il manque : ' + miss.join(', ') + '.', cost: c };
    pay(p, c); it.upgrade = c.next; commit(p); return { ok: true, cost: c, item: it };
  }
  function reforgeCost(item) {
    const ri = rarIdx(item.rarity);
    const mats = { fragment: 8 * (ri + 1) }; if (ri >= 1) mats.poussiere_rune = ri * 2; if (ri >= 3) mats.coeur_boss = ri - 2;
    return { gold: 100 * (ri + 1) * (ri + 1), mats };
  }
  function craft(p, recipeId, o) {
    ensureProfile(p); o = o || {};
    const r = I().recipes[recipeId]; if (!r) return { ok: false, reason: 'Recette inconnue.' };
    if (r.rankMin && rIdx(p.rank || 'E') < rIdx(r.rankMin)) return { ok: false, reason: 'Rang ' + r.rankMin + ' requis.' };
    if (r.kind === 'reforge') {
      const it = find(p, o.uid); if (!it) return { ok: false, reason: 'Choisissez un objet.' };
      if (it.rarity === 'commun') return { ok: false, reason: 'Inutile sur un objet commun.' };
      const c = reforgeCost(it), miss = missing(p, c); if (miss.length) return { ok: false, reason: 'Il manque : ' + miss.join(', ') + '.' };
      pay(p, c);
      const base = I().bases[it.baseId], ri = rarIdx(it.rarity), budget = I().rarities[ri].budget * I().slots.find((s) => s.id === it.slot).weight * levelFactor(it.level);
      it.affixes = rollAffixes(base, ri, budget * (1 - BAL().baseShare)); it.name = itemName(base, it.affixes, ri);
      commit(p); return { ok: true, item: it };
    }
    const cost = { gold: r.gold, mats: r.mats, anyEssence: r.anyEssence };
    const miss = missing(p, cost); if (miss.length) return { ok: false, reason: 'Il manque : ' + miss.join(', ') + '.' };
    if (r.kind === 'potion') {
      pay(p, cost); p.potions = p.potions || {}; p.potions[r.potion] = (p.potions[r.potion] || 0) + r.count; commit(p); return { ok: true };
    }
    if (bagFree(p) <= 0) return { ok: false, reason: 'Inventaire plein.' };
    const slot = o.slot || 'arme';
    pay(p, cost);
    const rank = p.rank || 'E';
    const it = generate(p.niveau || 1, rank, r.rarity, { classe: p.classe, slot, luck: 0 });
    p.inventory.items.push(it); commit(p); return { ok: true, item: it };
  }

  // ------------------------------------------------------------------
  // RÉCOMPENSES (rewards.guaranteed des donjons, coffres...) : id | {id,count} | tableau
  // ------------------------------------------------------------------
  function grantReward(p, spec, o) {
    p = p || prof(); if (!p) return { items: [], materials: {} };
    ensureProfile(p);
    const res = { items: [], materials: {} };
    const list = Array.isArray(spec) ? spec : [spec];
    list.forEach((s) => {
      if (!s) return;
      const id = typeof s === 'string' ? s : s.id, count = typeof s === 'string' ? 1 : (s.count || 1);
      if (id === 'objet_legendaire' || id === 'objet_mythique') {
        for (let i = 0; i < count; i++) {
          const rank = (o && o.rank) || p.rank || levelRank(p.niveau || 1);
          const it = generate(p.niveau || 1, rank, id === 'objet_mythique' ? 'mythique' : 'legendaire', { classe: p.classe });
          const r = add(p, it); res.items.push(it); announceItem(it, r);
        }
      } else if (I().bases[id]) {
        for (let i = 0; i < count; i++) {
          let it = build(id, rarIdx(I().bases[id].rarity || 'rare'), p.niveau || 1, p.rank || 'E');
          // équipement de boss réservé à une autre classe : remplacé par une pièce de même rareté pour TA classe
          if (wrongClass(p, it)) it = generate(p.niveau || 1, (o && o.rank) || p.rank || 'E', it.rarity, { classe: p.classe });
          if (!it || wrongClass(p, it)) continue;
          add(p, it); res.items.push(it); announceItem(it);
        }
      } else {
        addMaterial(p, id, count); res.materials[id] = (res.materials[id] || 0) + count;
        const d = I().materials[id]; notify((d ? d.icon + ' ' : '') + '+' + count + ' ' + (d ? d.name : id), d ? d.rarity : 'commun', d && d.icon);
      }
    });
    if (!(o && o.silent)) commit(p);
    return res;
  }

  // ------------------------------------------------------------------
  // NOTIFICATIONS
  // ------------------------------------------------------------------
  function notify(text, rarity, icon) {
    try {
      if (G.UI && G.UI.notify) G.UI.notify({ text, rarity: rarity || 'commun', icon: icon || '🎁' });
      else if (G.UI && G.UI.toast) G.UI.toast(text);
    } catch (_) {}
  }
  function announceItem(it, r) {
    notify('Objet obtenu : ' + it.name + (it.upgrade ? ' +' + it.upgrade : ''), it.rarity, it.icon);
    if (r && r.recycled && r.selfRecycled) notify('Inventaire plein : ' + it.name + ' recyclé', 'commun', '♻️');
    else if (r && r.recycled) notify('Inventaire plein : ' + r.recycled.name + ' recyclé', 'commun', '♻️');
    G.bus.emit('loot', { item: it });
  }

  // ------------------------------------------------------------------
  // BUTIN
  // ------------------------------------------------------------------
  function runRank(run, p) {
    const r = run && (run.rank || (run.dungeon && run.dungeon.rank) || (run.portal && run.portal.rank));
    return r || (p && p.rank) || 'E';
  }
  function luckOf(p) {
    const a = apiOn();
    try { const s = a && a.player().stats; if (s && typeof s.lootLuck === 'number') return s.lootLuck; } catch (_) {}
    return statsFromGear(p).total.lootLuck || 0;
  }
  const ESS = ['feu', 'glace', 'foudre', 'ombre', 'sacre', 'poison'];
  function dropFor(en, run) {
    const p = prof(); if (!p || !en || en._lootDone) return; en._lootDone = true;
    ensureProfile(p);
    const D = BAL().drops, rank = runRank(run, p), luck = luckOf(p), lvl = p.niveau || 1;
    const def = en.def || {};
    const kind = en.boss ? ((def.miniboss || en.miniboss) ? 'miniboss' : 'boss') : en.elite ? 'elite' : 'normal';
    const drops = [], R = G.rng;
    const el = def.element || en.element; const essId = () => 'essence_' + (ESS.indexOf(el) >= 0 ? el : R.pick(ESS));
    const itemDrop = (hint, boost) => drops.push({ type: 'item', item: generate(lvl, rank, hint, { classe: p.classe, luck, boost }) });
    if (kind === 'normal') {
      const d = D.normal;
      if (R.chance(d.item * (1 + luck))) itemDrop();
      if (R.chance(d.fragment)) drops.push({ type: 'material', id: 'fragment', n: R.int(1, 2) });
      if (R.chance(d.essence)) drops.push({ type: 'material', id: essId(), n: 1 });
    } else if (kind === 'elite') {
      const d = D.elite;
      if (R.chance(Math.min(0.9, d.item * (1 + luck)))) itemDrop(R.chance(0.35) ? 'rare+' : null);
      if (R.chance(d.fragment)) drops.push({ type: 'material', id: 'fragment', n: R.int(2, 4) });
      if (R.chance(d.essence)) drops.push({ type: 'material', id: essId(), n: 1 });
      if (R.chance(0.04) && rIdx(rank) >= 1) drops.push({ type: 'material', id: 'poussiere_rune', n: 1 });
    } else {
      const d = kind === 'boss' ? D.boss : D.miniboss, boost = kind === 'boss' ? { leg: D.boss.legendBoost, myth: D.boss.mythBoost } : { leg: 1.3, myth: 1 };
      for (let i = 0; i < d.items; i++) itemDrop('rare+', boost);
      if (R.chance(d.extraChance)) itemDrop('rare+', boost);
      drops.push({ type: 'material', id: 'fragment', n: R.int(6, 12) });
      drops.push({ type: 'material', id: 'poussiere_rune', n: R.int(1, 3) });
      if (kind === 'boss') {
        drops.push({ type: 'material', id: 'coeur_boss', n: 1 + (rIdx(rank) >= 4 && R.chance(0.3) ? 1 : 0) });
        const bRank = def.rank || rank;
        if (rIdx(bRank) >= rIdx(D.boss.cristalMinRank) && R.chance(D.boss.cristal)) drops.push({ type: 'material', id: 'cristal_eveil', n: 1 });
      }
      if (R.chance(d.essence)) drops.push({ type: 'material', id: essId(), n: R.int(1, 2) });
    }
    let out = G.hooks.run('lootTable', drops, { enemy: en, run });
    if (!Array.isArray(out)) out = drops;
    const pos = en.pos || (en.mesh && en.mesh.position) || null;
    const matSum = {};
    out.forEach((d) => {
      if (!d) return;
      if (d.type === 'item' && d.item) dispatchItem(d.item, pos);
      else if (d.type === 'material') matSum[d.id] = (matSum[d.id] || 0) + (d.n || 1);
    });
    const ids = Object.keys(matSum);
    ids.forEach((id) => { addMaterial(p, id, matSum[id]); const d = I().materials[id]; G.bus.emit('loot', { material: { id, n: matSum[id] } });
      if (id === 'cristal_eveil') notify('✨ CRISTAL D\'ÉVEIL obtenu !', 'secret', '🔮');
      else if (kind !== 'normal' && (id !== 'fragment' || matSum[id] > 3)) notify('+' + matSum[id] + ' ' + (d ? d.name : id), d ? d.rarity : 'commun', d && d.icon); });
    if (ids.length) pendingSave = true;
    if (kind === 'boss' || kind === 'miniboss') flushSave(p);
  }
  let pendingSave = false;
  function flushSave(p) { if (pendingSave || p) { pendingSave = false; try { G.game && G.game.saveProfile && G.game.saveProfile(); } catch (_) {} } }
  function dispatchItem(item, pos) {
    const a = G.SkillAPI;
    const pick = () => { const p = prof(); if (!p) return; const r = add(p, item); announceItem(item, r); commit(p); };
    if (a && a.dropItem && pos && apiOn()) { try { a.dropItem({ pos, item, rarity: item.rarity, onPickup: pick }); return; } catch (e) { console.error(e); } }
    pick();
  }

  // ------------------------------------------------------------------
  // EFFETS UNIQUES (implémentations ; paramètres dans G.ITEMS.effects[id].p)
  // ------------------------------------------------------------------
  const T = { now: 0 };
  let disp = [], busy = false;
  const reg = (ev, fn) => { disp.push(G.bus.on(ev, fn)); };
  const hk = (name, fn, pr) => { disp.push(G.hooks.add(name, fn, pr || 0)); };
  const fromPlayer = (e) => e && !busy && e.source !== 'minion' && e.source !== 'item' && e.kind !== 'minion' && e.kind !== 'dot';
  const pstat = (a) => { try { return a.player().stats || {}; } catch (_) { return {}; } };
  const baseDmg = (a) => { const s = pstat(a); return Math.max(10, s.force || 0, s.intelligence || 0); };
  function hitAoe(a, pos, radius, amount, element, extra) {
    busy = true;
    try { a.enemiesInRadius(pos, radius).forEach((en) => { if (!en.dead) { a.damage(en, amount, { element, kind: 'aoe', source: 'item', canCrit: false }); extra && extra(en); } }); } finally { busy = false; }
    try { a.vfx && a.vfx('explosion', pos, { radius, element }); } catch (_) {}
  }
  function chain(a, from, src, n, range, amount, element) {
    const list = a.enemiesInRadius(from, range).filter((e) => e !== src && !e.dead).slice(0, n);
    busy = true;
    try { list.forEach((e) => { a.damage(e, amount, { element, kind: 'skill', source: 'item', canCrit: false }); try { G.VFX && G.VFX.lightning && G.VFX.lightning(from, e.pos); } catch (_) {} }); } finally { busy = false; }
  }
  const healPct = (a, f) => { try { const pl = a.player(); a.heal(pl.pvMax * f); } catch (_) {} };
  const EFFECTS = {};
  function waveFx(p) {
    let n = 0;
    reg('damageDealt', (e) => {
      if (!fromPlayer(e) || ++n % p.every) return;
      const a = apiOn(); if (!a) return; const pl = a.player();
      hitAoe(a, pl.pos, p.radius, baseDmg(a) * p.mult * 2.5, p.element);
      if (p.heal) healPct(a, p.heal);
    });
  }
  EFFECTS.ombre_10 = waveFx; EFFECTS.aube_6 = waveFx; EFFECTS.eclipse = waveFx;
  EFFECTS.poison_nuit = (p) => reg('damageDealt', (e) => {
    if (!fromPlayer(e) || !e.target || !G.rng.chance(p.chance)) return; const a = apiOn(); if (!a) return;
    a.status(e.target, { id: 'poison', duration: p.duration, power: baseDmg(a) * p.mult });
  });
  EFFECTS.brasier = (p) => reg('damageDealt', (e) => {
    if (!fromPlayer(e) || e.element !== 'feu' || !e.target || !G.rng.chance(p.chance)) return; const a = apiOn(); if (!a) return;
    a.status(e.target, { id: 'burn', duration: p.duration, power: baseDmg(a) * p.mult });
  });
  EFFECTS.foudre_crit = (p) => reg('damageDealt', (e) => {
    if (!fromPlayer(e) || !e.crit || !e.target || !G.rng.chance(p.chance)) return; const a = apiOn(); if (!a) return;
    chain(a, e.target.pos, e.target, p.targets, p.range, e.amount * p.mult, 'foudre');
  });
  EFFECTS.givre_nova = (p) => reg('enemyKilled', (e) => {
    if (!e.enemy || e.killer === 'minion' || !G.rng.chance(p.chance)) return; const a = apiOn(); if (!a) return;
    hitAoe(a, e.enemy.pos, p.radius, baseDmg(a) * p.mult * 2.5, 'glace', (en) => { try { a.status(en, { id: 'slow', duration: p.slow, power: 0.4 }); } catch (_) {} });
  });
  EFFECTS.moisson_ames = (p) => {
    let n = 0, until = 0;
    reg('enemyKilled', () => {
      if (++n % p.every) return; const a = apiOn(); if (!a) return;
      until = T.now + p.duration;
      try { a.minions().forEach((m) => { if (!m.dead) m.pv = Math.min(m.pvMax, m.pv + m.pvMax * p.heal); }); } catch (_) {}
    });
    hk('minionStats', (s) => { if (T.now < until && s && typeof s.dmg === 'number') s.dmg *= 1 + p.dmg; return s; });
  };
  EFFECTS.eclat_necro = (p) => reg('enemyKilled', (e) => {
    const a = apiOn(); if (!a) return;
    if (e.killer === 'minion') a.restoreMana(p.mana);
    else try { a.minions().forEach((m) => { if (!m.dead) m.pv = Math.min(m.pvMax, m.pv + m.pvMax * p.heal); }); } catch (_) {}
  });
  const bastion = (p) => {
    let next = 0;
    hk('incomingDamage', (d) => { if (d && T.now >= next) { next = T.now + p.cd; d.amount *= 1 - p.reduce; } return d; }, 50);
  };
  EFFECTS.bastion = bastion; EFFECTS.bastion_fort = bastion;
  EFFECTS.phenix = (p) => {
    let used = false; reg('runStart', () => { used = false; });
    hk('incomingDamage', (d) => {
      const a = apiOn(); if (!a || used || !d) return d; const pl = a.player();
      if (d.amount >= pl.pv && pl.pv > 1) { used = true; d.amount = Math.max(0, pl.pv - 1); a.after(0.05, () => healPct(a, p.heal)); a.text && a.text(pl.pos, 'RENAISSANCE', '#ff8a1a', 1.2); }
      return d;
    }, 100);
  };
  EFFECTS.vent_fantome = (p) => reg('playerDodge', () => {
    const a = apiOn(); if (!a) return; const v = (pstat(a).vitesse || 5) * p.speedMult;
    a.buff({ id: 'vent_fantome', duration: p.duration, stats: { vitesse: v } });
  });
  EFFECTS.echo_mana = (p) => reg('skillCast', () => { const a = apiOn(); if (a && G.rng.chance(p.chance)) a.restoreMana(p.mana); });
  EFFECTS.vampire = (p) => { let last = -1; reg('damageDealt', (e) => {
    if (!fromPlayer(e) || !e.crit || T.now - last < 0.3) return; const a = apiOn(); if (!a) return; last = T.now; healPct(a, p.heal); }); };
  EFFECTS.chasseur_elite = (p) => reg('enemyKilled', (e) => {
    if (!e.enemy || !(e.enemy.elite || e.enemy.boss)) return; const a = apiOn(); if (!a) return; healPct(a, p.heal); a.restoreMana(p.mana);
  });
  const burstDmg = (p, kindKey, ev) => {
    let until = 0;
    reg(ev, (e) => { if (ev === 'enemyKilled' && !(e.enemy && (e.enemy.elite || e.enemy.boss))) return; until = T.now + p.duration; });
    hk('outgoingDamage', (d) => { if (d && T.now < until) d.amount *= 1 + p.dmg; return d; }, 20);
  };
  EFFECTS.surcharge = (p) => burstDmg(p, 'surcharge', 'enemyKilled');
  EFFECTS.lune_ombre = (p) => burstDmg(p, 'lune', 'playerDodge');
  EFFECTS.tempete = (p) => {
    let n = 0;
    reg('skillCast', () => {
      if (++n % p.every) return; const a = apiOn(); if (!a) return; const pl = a.player();
      const t = a.nearestEnemy(pl.pos, p.range); if (!t) return;
      busy = true; try { a.damage(t, baseDmg(a) * p.mult * 2.5, { element: 'foudre', kind: 'skill', source: 'item', canCrit: false }); } finally { busy = false; }
      try { G.VFX && G.VFX.lightning && G.VFX.lightning(pl.pos, t.pos); } catch (_) {}
      chain(a, t.pos, t, p.targets - 1, 5, baseDmg(a) * p.mult * 1.5, 'foudre');
    });
  };
  EFFECTS.aube_set = (p) => reg('enemyKilled', (e) => { if (e.killer === 'minion') return; const a = apiOn(); if (a) healPct(a, p.heal); });
  EFFECTS.sentinelle = (p) => hk('outgoingDamage', (d) => { if (d && d.kind === 'projectile') d.amount *= 1 + p.dmg; return d; }, 20);

  function applyEffects(p) {
    disp.forEach((f) => { try { f(); } catch (_) {} }); disp = [];
    p = p || prof(); if (!p || !p.inventory) return [];
    const g = statsFromGear(p);
    g.effects.forEach((id) => { const impl = EFFECTS[id], def = I().effects[id]; if (impl && def) { try { impl(def.p || {}); } catch (e) { console.error('[effet ' + id + ']', e); } } });
    return g.effects;
  }

  // ------------------------------------------------------------------
  // DESCRIPTION
  // ------------------------------------------------------------------
  function describe(item) {
    const tot = itemTotals(item), lines = Object.keys(tot).map((k) => fmtStat(k, tot[k]));
    const fx = item.effect && I().effects[item.effect];
    return { name: item.name, rarity: item.rarity, lines, effect: fx ? fx.name + ' — ' + fx.desc : null, power: itemPower(item) };
  }

  // ------------------------------------------------------------------
  // ENREGISTREMENTS AU CHARGEMENT
  // ------------------------------------------------------------------
  G.hooks.add('stats', gearHook, 0);
  G.bus.on('tick', (e) => { if (e && typeof e.time === 'number') T.now = e.time; });
  G.bus.on('runStart', () => { const p = prof(); if (p) { validateEquipped(p); applyEffects(p); } });
  G.bus.on('profileChanged', (e) => { const p = (e && e.profile) || prof(); if (p && p.inventory) { validateEquipped(p); applyEffects(p); } });
  G.bus.on('runEnd', () => { flushSave(); });
  G.bus.on('enemyKilled', (e) => { if (e && e.enemy) { try { dropFor(e.enemy, apiOn() && G.SkillAPI.run && G.SkillAPI.run()); } catch (err) { console.error('[butin]', err); } } });
  G.bus.on('bossKilled', (e) => { if (e && e.boss) { try { if (e.boss.boss === undefined) e.boss.boss = true; dropFor(e.boss, e.run); } catch (err) { console.error('[butin boss]', err); } } });

  G.Inventory = {
    ensureProfile, generate, add, purgeWrongClass, wrongClass, equip, unequip, salvage, salvageAll, lock, upgrade, upgradeCost, reforgeCost, craft,
    statsFromGear, itemTotals, itemPower, grantReward, addMaterial, matCount, hasMaterials, sellMaterial, convertMaterial,
    applyEffects, canEquip, equippedItems, describe, fmtStat, fmtVal, salvageYield, bagFree, missing, validateEquipped,
    levelRank, EFFECTS, SLOT_IDS, _build: build, _pickRarity: pickRarity, _rarityWeights: rarityWeights, _powerOf: powerOf,
  };

  // ==================================================================
  //  PANNEAU « INVENTAIRE » (refonte v4 : fenêtres système, classes ds-*)
  // ==================================================================
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Icône SVG du système (G.Icons) ; chaîne vide si absente (l'appelant garde son emoji de secours). */
  const ico = (name, size, cls) => {
    try { const Ic = G.Icons; if (Ic && Ic.svg && (!Ic.has || Ic.has(name))) return Ic.svg(name, { size: size || 18, cls: cls || '' }) || ''; } catch (_) {}
    return '';
  };
  const FALLBACK_CSS = `:where(:root){--ds-bg-0:#060912;--ds-bg-1:#0b1122;--ds-bg-2:#111a33;--ds-bg-3:#18233f;--ds-glass:rgba(13,20,40,.78);--ds-glass-strong:rgba(9,14,30,.92);--ds-line:rgba(130,180,255,.16);--ds-line-strong:rgba(130,200,255,.36);--ds-text:#e8f0ff;--ds-text-2:#a9b8d6;--ds-text-3:#6f7fa3;--ds-accent:#46d4ff;--ds-accent-2:#8b6bff;--ds-gold:#ffc94a;--ds-success:#39e08c;--ds-danger:#ff4d6a;--ds-warning:#ffb547;--r-commun:#b8c0cc;--r-rare:#3fa9ff;--r-epique:#b44dff;--r-legendaire:#ffb020;--r-mythique:#ff3d6e;--r-secret:#00ffd0;--rk-E:#9aa3ad;--rk-D:#4fd17a;--rk-C:#3fa9ff;--rk-B:#b44dff;--rk-A:#ff8a1a;--rk-S:#ff3d3d;--rk-Z:#ffd700;--ds-font-display:'Chakra Petch','Lilita One',sans-serif;--ds-font-body:'Nunito',sans-serif;--ds-r-sm:6px;--ds-r-md:10px;--ds-r-lg:16px;--ds-cut:10px;--ds-shadow-1:0 4px 14px rgba(0,0,0,.35);--ds-shadow-2:0 12px 40px rgba(0,0,0,.55);--ds-fast:120ms;--ds-med:220ms;--ds-slow:380ms;--ds-ease:cubic-bezier(.2,.8,.2,1)}
:where(.ds-btn){display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid var(--ds-line-strong);border-radius:var(--ds-r-md);background:var(--ds-glass);color:var(--ds-text);font:700 14px var(--ds-font-display);letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
:where(.ds-btn--primary){background:linear-gradient(180deg,#6fe0ff,#2aa8dc);color:#04121c;border-color:transparent}
:where(.ds-btn--gold){background:linear-gradient(180deg,#ffd978,#e0a21c);color:#2a1a00;border-color:transparent}
:where(.ds-btn--danger){background:rgba(255,77,106,.14);color:#ff8499;border-color:rgba(255,77,106,.5)}
:where(.ds-btn--violet){background:linear-gradient(180deg,#a68cff,#6a49e0);color:#fff;border-color:transparent}
:where(.ds-btn--ghost){background:transparent;border-color:var(--ds-line)}
:where(.ds-btn--sm){min-height:36px;padding:0 12px;font-size:12px}:where(.ds-btn--block){display:flex;width:100%}
:where(.ds-btn[disabled]){opacity:.45;cursor:not-allowed}
:where(.ds-btn__icon){display:inline-flex}
:where(.ds-icon-btn){display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:var(--ds-r-md);border:1px solid var(--ds-line);background:var(--ds-glass);color:var(--ds-text);cursor:pointer}
:where(.ds-window){position:relative;background:var(--ds-glass-strong);border:1px solid var(--ds-line-strong);border-radius:var(--ds-r-lg);box-shadow:var(--ds-shadow-2);color:var(--ds-text)}
:where(.ds-window__header){display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--ds-line)}
:where(.ds-window__body){padding:12px 16px}:where(.ds-window__footer){padding:12px 16px;border-top:1px solid var(--ds-line)}
:where(.ds-card){background:var(--ds-glass);border:1px solid var(--ds-line);border-radius:var(--ds-r-md)}
:where(.ds-tabs){display:flex;gap:4px;border-bottom:1px solid var(--ds-line)}
:where(.ds-tab){flex:1;min-height:44px;background:none;border:0;border-bottom:2px solid transparent;color:var(--ds-text-2);font:700 13px var(--ds-font-display);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
:where(.ds-tab.is-active){color:var(--ds-accent);border-bottom-color:var(--ds-accent)}
:where(.ds-segmented){display:inline-flex;border:1px solid var(--ds-line);border-radius:var(--ds-r-md);overflow:hidden}
:where(.ds-segmented>button){min-height:36px;padding:0 12px;background:none;border:0;color:var(--ds-text-2);font:700 12px var(--ds-font-display);cursor:pointer}
:where(.ds-segmented>button.is-active){background:rgba(70,212,255,.16);color:var(--ds-accent)}
:where(.ds-badge){display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;background:rgba(130,180,255,.12);border:1px solid var(--ds-line);font:700 11px var(--ds-font-display);color:var(--ds-text-2)}
:where(.ds-badge--gold){color:var(--ds-gold);border-color:rgba(255,201,74,.4);background:rgba(255,201,74,.1)}
:where(.ds-badge--violet){color:#c6b4ff;border-color:rgba(139,107,255,.5);background:rgba(139,107,255,.14)}
:where(.ds-badge--accent){color:var(--ds-accent);border-color:rgba(70,212,255,.4);background:rgba(70,212,255,.1)}
:where(.ds-badge--danger){color:var(--ds-danger);border-color:rgba(255,77,106,.4);background:rgba(255,77,106,.1)}
:where(.ds-chip){display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;border-radius:99px;border:1px solid var(--ds-line);background:rgba(130,180,255,.06);color:var(--ds-text-2);font:700 12px var(--ds-font-body);cursor:pointer}
:where(.ds-rank){display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 4px;border:2px solid var(--rk,#9aa3ad);border-radius:6px;color:var(--rk,#9aa3ad);font:700 13px var(--ds-font-display);background:rgba(0,0,0,.4)}
:where(.ds-rank[data-rank=E]){--rk:var(--rk-E)}:where(.ds-rank[data-rank=D]){--rk:var(--rk-D)}:where(.ds-rank[data-rank=C]){--rk:var(--rk-C)}:where(.ds-rank[data-rank=B]){--rk:var(--rk-B)}:where(.ds-rank[data-rank=A]){--rk:var(--rk-A)}:where(.ds-rank[data-rank=S]){--rk:var(--rk-S)}:where(.ds-rank[data-rank=Z]){--rk:var(--rk-Z)}
:where(.ds-rank--sm){min-width:20px;height:20px;font-size:11px}
:where(.ds-bar){height:8px;border-radius:99px;background:rgba(0,0,0,.45);overflow:hidden;border:1px solid var(--ds-line)}
:where(.ds-bar__fill){display:block;height:100%;background:linear-gradient(90deg,#2aa8dc,#46d4ff)}
:where(.ds-bar--xp .ds-bar__fill){background:linear-gradient(90deg,#7c5cff,#b48bff)}
:where(.ds-bar--gold .ds-bar__fill){background:linear-gradient(90deg,#e0a21c,#ffc94a)}
:where(.ds-bar--hp .ds-bar__fill){background:linear-gradient(90deg,#1fae66,#39e08c)}
:where(.ds-stat){display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--ds-line);font-size:13px;color:var(--ds-text-2)}
:where(.ds-stat b){color:var(--ds-text);font-family:var(--ds-font-display)}
:where(.ds-stat.is-up b){color:var(--ds-success)}:where(.ds-stat.is-down b){color:var(--ds-danger)}
:where(.ds-stat-grid){display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
:where(.ds-section-title){display:flex;align-items:center;gap:10px;margin:14px 0 8px;font:700 13px var(--ds-font-display);letter-spacing:.1em;text-transform:uppercase;color:var(--ds-text-2)}
:where(.ds-section-title)::after{content:'';flex:1;height:1px;background:var(--ds-line)}
:where(.ds-select){min-height:40px;padding:0 10px;border-radius:var(--ds-r-md);border:1px solid var(--ds-line-strong);background:var(--ds-bg-2);color:var(--ds-text);font:700 13px var(--ds-font-body)}
:where(.ds-empty){padding:28px 16px;text-align:center;color:var(--ds-text-3);font-weight:700}
`;
  /** Styles de repli (spécificité nulle) si css/ds.css n'est pas chargé : partagés avec necro.js / events.js. */
  function dsFallback() {
    if (typeof document === 'undefined' || document.getElementById('pc-ds-fallback')) return;
    try { if (getComputedStyle(document.documentElement).getPropertyValue('--ds-bg-0').trim()) return; } catch (_) {}
    const s = document.createElement('style'); s.id = 'pc-ds-fallback'; s.textContent = FALLBACK_CSS; document.head.appendChild(s);
  }
  G.__pcUi = { ico, dsFallback };
  const SLOT_ICO = { arme: 'sword', armure: 'shield', casque: 'crown', bottes: 'arrow-up', anneau: 'gem', amulette: 'rune' };
  const RANK_COL = { E: '#9aa3ad', D: '#4fd17a', C: '#3fa9ff', B: '#b44dff', A: '#ff8a1a', S: '#ff3d3d', Z: '#ffd700' };
  const SEEN = new Set();                 // objets « nouveaux » déjà consultés (interface seulement)
  const T_LOAD = Date.now();
  const isNewItem = (it) => !SEEN.has(it.uid) && (it.born || 0) >= T_LOAD - 1500 && !it.locked;

  const CSS = `
.inv-root{font-family:var(--ds-font-body,'Nunito',sans-serif);color:var(--ds-text,#e8f0ff);padding:0 0 24px;position:relative;font-size:13px}
.inv-root *{box-sizing:border-box}
.inv-root button,.inv-sheet button{font-family:inherit}
.inv-sheet{font-family:var(--ds-font-body,'Nunito',sans-serif);color:var(--ds-text,#e8f0ff);font-size:13px}.inv-sheet *{box-sizing:border-box}
.inv-ic{display:inline-flex;align-items:center;justify-content:center;line-height:0}
.inv-ic svg{display:block}
.inv-msg{display:flex;align-items:center;gap:8px;background:var(--ds-glass-strong,#0b1122);border:1px solid var(--ds-line-strong);border-left:3px solid var(--ds-accent);border-radius:var(--ds-r-md,10px);padding:9px 12px;margin:0 0 10px;font-weight:800;font-size:13px}
.inv-msg.err{border-left-color:var(--ds-danger);color:#ffb3c0}.inv-msg.ok{border-left-color:var(--ds-success);color:#b8ffd8}
.inv-root .ds-tabs{margin:0 0 12px;gap:2px}
.inv-root .ds-tab{min-width:0;padding:0 4px;font-size:12px;white-space:nowrap;letter-spacing:.04em}
.inv-root .ds-tab .inv-ic{opacity:.9}
/* ---- poupée d'équipement ---- */
.inv-doll{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:14px 12px 12px;margin:0 0 10px;
  background:radial-gradient(ellipse 70% 60% at 50% 45%,rgba(70,212,255,.12),transparent 70%),linear-gradient(180deg,var(--ds-bg-2,#111a33),var(--ds-bg-1,#0b1122));
  border:1px solid var(--ds-line-strong);border-radius:var(--ds-r-lg,16px);overflow:hidden;
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
.inv-doll::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(130,200,255,.035) 0 1px,transparent 1px 4px);pointer-events:none}
.inv-doll__col{display:flex;flex-direction:column;gap:8px;position:relative;z-index:1}
.inv-doll__mid{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;align-self:stretch}
.inv-sil{width:100%;max-width:150px;height:auto;max-height:210px;filter:drop-shadow(0 0 12px rgba(70,212,255,.35))}
.inv-pow{margin-top:2px;text-align:center;line-height:1.1}
.inv-pow small{display:block;font:700 10px var(--ds-font-display);letter-spacing:.14em;color:var(--ds-text-3);text-transform:uppercase}
.inv-pow b{font:700 20px var(--ds-font-display);color:var(--ds-gold);text-shadow:0 0 12px rgba(255,201,74,.35)}
.inv-slot{position:relative;width:66px;height:66px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;cursor:pointer;color:var(--ds-text);
  border:1.5px solid color-mix(in srgb,var(--rc,#6f7fa3) 75%,transparent);border-radius:var(--ds-r-md,10px);
  background:linear-gradient(155deg,color-mix(in srgb,var(--rc,#6f7fa3) 30%,transparent),rgba(7,11,24,.92) 72%);
  box-shadow:inset 0 0 14px color-mix(in srgb,var(--rc,#6f7fa3) 22%,transparent),0 0 12px color-mix(in srgb,var(--rc,#6f7fa3) 28%,transparent);transition:transform var(--ds-fast,120ms),box-shadow var(--ds-fast,120ms)}
.inv-slot:active{transform:scale(.96)}
.inv-slot:focus-visible,.inv-cell:focus-visible{outline:2px solid var(--ds-accent);outline-offset:2px}
.inv-slot__ico{font-size:28px;line-height:1;margin-top:-6px}
.inv-slot__lbl{position:absolute;bottom:2px;left:0;right:0;text-align:center;font:700 9px var(--ds-font-display);letter-spacing:.08em;text-transform:uppercase;color:var(--ds-text-2)}
.inv-slot.empty{cursor:default;border:1.5px dashed var(--ds-line-strong);background:rgba(8,13,28,.55);box-shadow:none;color:var(--ds-text-3)}
.inv-slot.empty .inv-ic{margin-top:-8px;opacity:.7}
.inv-slot.empty .inv-slot__em{font-size:24px;margin-top:-8px;opacity:.35}
.inv-plus{position:absolute;top:3px;right:4px;font:700 11px var(--ds-font-display);color:var(--ds-gold);text-shadow:0 1px 2px #000}
/* ---- récapitulatif ---- */
.inv-sum{margin:0 0 12px;padding:10px 12px;background:var(--ds-glass);border:1px solid var(--ds-line);border-radius:var(--ds-r-md,10px)}
.inv-sum__head{display:flex;align-items:center;gap:8px;margin:0 0 6px;font:700 12px var(--ds-font-display);letter-spacing:.1em;text-transform:uppercase;color:var(--ds-text-2)}
.inv-sum__head .ds-badge{margin-left:auto}
.inv-sum .ds-stat-grid{grid-template-columns:1fr 1fr;gap:0 18px}
.inv-sum .ds-stat{padding:4px 0}
.inv-more{display:block;width:100%;margin-top:6px;padding:6px;background:none;border:0;color:var(--ds-accent);font:700 11px var(--ds-font-display);letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.inv-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
/* ---- barre d'outils ---- */
.inv-tool{display:flex;flex-direction:column;gap:8px;margin:0 0 10px}
.inv-row{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:1px 1px 3px}
.inv-row::-webkit-scrollbar{display:none}
.inv-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 11px;border-radius:99px;cursor:pointer;
  border:1px solid var(--ds-line);background:rgba(130,180,255,.06);color:var(--ds-text-2);font:800 12px var(--ds-font-body)}
.inv-chip .dot{width:8px;height:8px;border-radius:50%;background:var(--rc);box-shadow:0 0 6px var(--rc)}
.inv-chip.is-active{background:rgba(70,212,255,.16);border-color:var(--ds-accent);color:var(--ds-text)}
.inv-chip.rar.is-active{border-color:var(--rc);background:color-mix(in srgb,var(--rc) 20%,transparent)}
.inv-sort{display:flex;align-items:center;gap:8px;color:var(--ds-text-3)}
.inv-sort .ds-segmented{flex:1;display:flex}.inv-sort .ds-segmented>button{flex:1;padding:0 6px;white-space:nowrap}
.inv-cap{margin:2px 0 10px}
.inv-cap__top{display:flex;justify-content:space-between;align-items:center;margin:0 0 5px;font:700 12px var(--ds-font-display);letter-spacing:.06em;color:var(--ds-text-2);text-transform:uppercase}
.inv-cap__top b{color:var(--ds-text)}
.inv-cap.warn .ds-bar{--fill:linear-gradient(90deg,#e08a1c,var(--ds-warning));--glowc:var(--ds-warning)}
.inv-cap.full .ds-bar{--fill:linear-gradient(90deg,#c22a46,var(--ds-danger));--glowc:var(--ds-danger)}
.inv-cap.full .inv-cap__top b{color:var(--ds-danger)}
/* ---- grille d'objets ---- */
.inv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:7px}
.inv-cell{position:relative;aspect-ratio:1;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;color:var(--ds-text);font-size:25px;line-height:1;
  border:1.5px solid color-mix(in srgb,var(--rc) 70%,transparent);border-radius:var(--ds-r-md,10px);
  background:linear-gradient(155deg,color-mix(in srgb,var(--rc) 30%,transparent),rgba(7,11,24,.92) 72%);
  box-shadow:inset 0 0 10px color-mix(in srgb,var(--rc) 18%,transparent);transition:transform var(--ds-fast,120ms)}
.inv-cell:active{transform:scale(.94)}
.inv-cell.hi{box-shadow:inset 0 0 10px color-mix(in srgb,var(--rc) 25%,transparent),0 0 10px color-mix(in srgb,var(--rc) 35%,transparent)}
.inv-cell.locked{border-style:dashed}
.inv-cell .inv-plus{top:2px;right:3px;font-size:10px}
.inv-rk{position:absolute;bottom:2px;right:4px;font:700 10px var(--ds-font-display);text-shadow:0 1px 2px #000}
.inv-lk{position:absolute;top:3px;left:3px;color:var(--ds-text-2)}
.inv-new{position:absolute;top:-3px;left:-3px;width:11px;height:11px;border-radius:50%;background:var(--ds-accent);border:2px solid var(--ds-bg-0,#060912);box-shadow:0 0 8px var(--ds-accent);animation:inv-pulse 1.6s ease-in-out infinite}
.inv-setpip{position:absolute;bottom:3px;left:4px;width:6px;height:6px;border-radius:1px;transform:rotate(45deg);background:var(--rc);box-shadow:0 0 6px var(--rc)}
@keyframes inv-pulse{50%{transform:scale(1.25);opacity:.7}}
.inv-empty{padding:26px 12px;text-align:center;color:var(--ds-text-3);font-weight:700;line-height:1.4}
.inv-empty .inv-ic{display:flex;margin:0 auto 8px;opacity:.6}
.inv-bulk{margin-top:14px}
/* ---- fenêtre d'objet ---- */
.inv-sheet{position:fixed;inset:0;z-index:80;background:rgba(3,6,16,.72);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;animation:inv-fade var(--ds-med,220ms) ease}
@media(min-width:700px){.inv-sheet{align-items:center}}
@keyframes inv-fade{from{opacity:0}}@keyframes inv-rise{from{transform:translateY(24px);opacity:0}}
.inv-win{--wc:var(--rc);width:min(460px,100%);max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;animation:inv-rise var(--ds-med,220ms) var(--ds-ease,ease);filter:drop-shadow(0 0 22px color-mix(in srgb,var(--rc) 30%,transparent))}
.inv-win .ds-window__header{align-items:center;background:linear-gradient(90deg,color-mix(in srgb,var(--rc) 22%,transparent),transparent 80%)}
.inv-win .ds-window__body{flex:1;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch}
.inv-win .ds-window__footer{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:rgba(5,8,18,.6)}
.inv-win .ds-window__footer .wide{grid-column:1/-1}
.inv-win .ds-window__footer .ds-btn{min-height:42px}
.inv-win__ico{flex:0 0 auto;width:52px;height:52px;display:flex;align-items:center;justify-content:center;font-size:28px;border-radius:var(--ds-r-md,10px);
  border:1.5px solid var(--rc);background:linear-gradient(155deg,color-mix(in srgb,var(--rc) 34%,transparent),rgba(7,11,24,.92));box-shadow:0 0 14px color-mix(in srgb,var(--rc) 40%,transparent)}
.inv-win__tt{flex:1;min-width:0}
.inv-ttl{font:700 18px/1.15 var(--ds-font-display);letter-spacing:.03em;color:var(--rc);text-shadow:0 0 14px color-mix(in srgb,var(--rc) 40%,transparent)}
.inv-sub{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:var(--ds-text-2);font-weight:800}
.inv-sub .rar{color:var(--rc);font-family:var(--ds-font-display);letter-spacing:.06em;text-transform:uppercase}
.inv-meta{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.inv-meta .bad{color:var(--ds-danger);border-color:rgba(255,77,106,.5);background:rgba(255,77,106,.1)}
.inv-power{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:8px 10px;margin:0 0 6px;border:1px solid var(--ds-line);border-radius:var(--ds-r-md,10px);background:rgba(255,201,74,.06)}
.inv-power span{font:700 11px var(--ds-font-display);letter-spacing:.1em;text-transform:uppercase;color:var(--ds-text-2)}
.inv-power b{font:700 17px var(--ds-font-display);color:var(--ds-gold)}
.inv-win .ds-section-title{margin:12px 0 4px}
.inv-win .ds-stat{align-items:center;font-size:13px}
.inv-win .ds-stat.aff .ds-stat__label{color:#9fd9ff}
.inv-delta{display:inline-flex;align-items:center;gap:2px;margin-left:8px;font:700 11px var(--ds-font-display)}
.inv-delta.up{color:var(--ds-success)}.inv-delta.dn{color:var(--ds-danger)}
.inv-fx{display:flex;gap:10px;margin:10px 0;padding:10px 12px;border:1px solid rgba(255,201,74,.55);border-radius:var(--ds-r-md,10px);
  background:linear-gradient(135deg,rgba(255,201,74,.16),rgba(255,201,74,.04));box-shadow:0 0 16px rgba(255,201,74,.12);font-size:13px;line-height:1.35}
.inv-fx .inv-ic{color:var(--ds-gold);margin-top:1px}
.inv-fx b{display:block;font:700 13px var(--ds-font-display);letter-spacing:.06em;color:var(--ds-gold);text-transform:uppercase;margin-bottom:2px}
.inv-set{margin:10px 0;padding:10px 12px;border:1px solid color-mix(in srgb,var(--sc,#8b6bff) 55%,transparent);border-radius:var(--ds-r-md,10px);background:color-mix(in srgb,var(--sc,#8b6bff) 8%,transparent)}
.inv-set__h{display:flex;align-items:center;gap:8px;font:700 13px var(--ds-font-display);letter-spacing:.06em;color:var(--sc);text-transform:uppercase;margin:0 0 6px}
.inv-set__h .ds-badge{margin-left:auto}
.inv-pieces{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 6px}
.inv-pc{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800;border:1px solid var(--ds-line);color:var(--ds-text-3)}
.inv-pc.on{color:var(--ds-text);border-color:var(--sc);background:color-mix(in srgb,var(--sc) 20%,transparent);box-shadow:0 0 8px color-mix(in srgb,var(--sc) 30%,transparent)}
.inv-tier{display:flex;gap:8px;padding:3px 0;font-size:12px;line-height:1.35;color:var(--ds-text-3)}
.inv-tier b{flex:0 0 auto;font:700 11px var(--ds-font-display);padding:1px 6px;border-radius:4px;border:1px solid var(--ds-line);height:fit-content}
.inv-tier.on{color:var(--ds-text)}.inv-tier.on b{color:var(--sc);border-color:var(--sc);background:color-mix(in srgb,var(--sc) 18%,transparent)}
.inv-costs{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.inv-cost{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--ds-text-2);font-weight:800}
.inv-cost__c{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0}
.inv-cost>em{flex:0 0 92px;white-space:nowrap;padding-top:6px;font-style:normal;font:700 10px var(--ds-font-display);letter-spacing:.1em;text-transform:uppercase;color:var(--ds-text-3)}
.inv-ing{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;border:1px solid var(--ds-line);background:rgba(130,180,255,.06);font-size:12px;font-weight:800;color:var(--ds-text)}
.inv-ing.no{color:#ff8fa3;border-color:rgba(255,77,106,.5);background:rgba(255,77,106,.08)}
.inv-ing.ok{border-color:rgba(57,224,140,.35)}
.inv-ing small{color:var(--ds-text-3);font-weight:800}.inv-ing.no small{color:#ff8fa3}
.inv-ing .inv-ic{color:var(--ds-gold)}
/* ---- matériaux ---- */
.inv-mats{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px}
.inv-mat{position:relative;display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid color-mix(in srgb,var(--rc) 40%,var(--ds-line));border-radius:var(--ds-r-md,10px);
  background:linear-gradient(160deg,color-mix(in srgb,var(--rc) 14%,transparent),rgba(7,11,24,.8) 60%)}
.inv-mat.zero{opacity:.55}
.inv-mat__top{display:flex;align-items:center;gap:10px}
.inv-mat__ico{flex:0 0 auto;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:23px;border-radius:var(--ds-r-md,10px);border:1.5px solid color-mix(in srgb,var(--rc) 70%,transparent);background:linear-gradient(155deg,color-mix(in srgb,var(--rc) 28%,transparent),rgba(7,11,24,.9))}
.inv-mat__nm{flex:1;min-width:0;font:700 12px/1.2 var(--ds-font-display);letter-spacing:.03em;color:var(--rc)}
.inv-mat__n{font:700 20px var(--ds-font-display);color:var(--ds-text)}
.inv-mat__n::before{content:'×';font-size:12px;color:var(--ds-text-3);margin-right:2px}
.inv-mat small{color:var(--ds-text-3);font-weight:700;font-size:11px;line-height:1.3}
.inv-mat__act{display:flex;gap:6px;flex-wrap:wrap}
.inv-mat__act .ds-btn{min-height:32px;padding:0 10px;font-size:11px}
/* ---- fabrication ---- */
.inv-recs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.inv-rec{display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--ds-glass);border:1px solid var(--ds-line-strong);border-radius:var(--ds-r-md,10px);
  background-image:linear-gradient(160deg,rgba(70,212,255,.07),transparent 55%)}
.inv-rec.can{border-color:rgba(57,224,140,.45)}
.inv-rec__h{display:flex;align-items:center;gap:10px}
.inv-rec__ico{flex:0 0 auto;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:24px;border-radius:var(--ds-r-md,10px);border:1px solid var(--ds-line-strong);background:rgba(70,212,255,.08)}
.inv-rec__nm{flex:1;min-width:0;font:700 15px/1.15 var(--ds-font-display);letter-spacing:.03em}
.inv-rec__d{font-size:12px;color:var(--ds-text-2);line-height:1.35;font-weight:700}
.inv-rec__ing{display:flex;flex-wrap:wrap;gap:6px}
.inv-hint{margin-top:12px;padding:10px 12px;border:1px dashed var(--ds-line-strong);border-radius:var(--ds-r-md,10px);color:var(--ds-text-2);font-size:12px;font-weight:700;display:flex;gap:8px;align-items:center}
@media(min-width:900px){
  .inv-root{font-size:14px}
  .inv-top{display:grid;grid-template-columns:minmax(380px,460px) 1fr;gap:16px;align-items:start}
  .inv-slot{width:76px;height:76px}.inv-slot__ico{font-size:32px}
  .inv-grid{grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px}
  .inv-tool{flex-direction:row;flex-wrap:wrap;align-items:center}.inv-sort{margin-left:auto;min-width:340px}
}
@media(prefers-reduced-motion:reduce){.inv-new,.inv-sheet,.inv-win{animation:none}}
`;
  function injectCss() {
    if (typeof document === 'undefined') return;
    dsFallback();
    if (document.getElementById('inv-style')) return;
    const s = document.createElement('style'); s.id = 'inv-style'; s.textContent = CSS; document.head.appendChild(s);
  }
  const rc = (id) => (I().rarities[rarIdx(id)] || I().rarities[0]).color;
  const slotDef = (id) => I().slots.find((s) => s.id === id);
  const slotIco = (s, size) => ico(SLOT_ICO[s.id] || 'bag', size) || '<span>' + s.icon + '</span>';
  const goldIco = () => ico('gold', 14) || '💰';
  const costHtml = (p, c) => {
    const parts = [];
    if (c.gold) parts.push('<span class="inv-ing ' + ((p.gold || 0) >= c.gold ? 'ok' : 'no') + '"><span class="inv-ic">' + goldIco() + '</span>' + fnum(c.gold, 0) + ' <small>/ ' + fnum(p.gold || 0, 0) + '</small></span>');
    Object.keys(c.mats || {}).forEach((k) => { const d = I().materials[k], have = matCount(p, k); parts.push('<span class="inv-ing ' + (have >= c.mats[k] ? 'ok' : 'no') + '" title="' + esc(d ? d.name : k) + '">' + (d ? d.icon : '') + ' ' + esc(d ? d.name : k) + ' <small>' + have + '/' + c.mats[k] + '</small></span>'); });
    if (c.anyEssence) parts.push('<span class="inv-ing ' + (essTotal(p) >= c.anyEssence ? 'ok' : 'no') + '">🌈 Essences <small>' + essTotal(p) + '/' + c.anyEssence + '</small></span>');
    return parts.join('');
  };
  const SIL = '<svg class="inv-sil" viewBox="0 0 120 220" aria-hidden="true"><defs><linearGradient id="inv-sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46d4ff" stop-opacity=".55"/><stop offset="1" stop-color="#8b6bff" stop-opacity=".18"/></linearGradient></defs>' +
    '<ellipse cx="60" cy="208" rx="46" ry="8" fill="none" stroke="#46d4ff" stroke-opacity=".5"/><ellipse cx="60" cy="208" rx="30" ry="5" fill="#46d4ff" fill-opacity=".12"/>' +
    '<g fill="url(#inv-sg)" stroke="#46d4ff" stroke-opacity=".7" stroke-width="1.5" stroke-linejoin="round"><circle cx="60" cy="30" r="17"/>' +
    '<path d="M60 52c-17 0-31 7-34 20l-6 52 12 3 4-30 4 80h12l6-62 6 62h12l4-80 4 30 12-3-6-52C91 59 77 52 60 52z"/></g>' +
    '<path d="M60 56v62M42 70c6 6 30 6 36 0" fill="none" stroke="#46d4ff" stroke-opacity=".3"/></svg>';

  function renderPanel(container, profile) {
    injectCss();
    const p = profile || prof(); if (!p) { container.innerHTML = '<div class="inv-root"><div class="inv-empty">Aucun profil.</div></div>'; return; }
    ensureProfile(p);
    const S = container.__inv = container.__inv || { tab: 'equip', slot: 'all', rar: 'all', sort: 'rarete', sel: null, msg: null, confirm: null };
    try { Array.prototype.forEach.call(document.querySelectorAll('.inv-portal'), (n) => { if (n !== S.portal && n.parentNode) n.parentNode.removeChild(n); }); } catch (_) {}
    const inv = p.inventory, eq = equippedItems(p);
    const g = statsFromGear(p);
    const rankChip = (r) => '<span class="ds-rank ds-rank--sm" data-rank="' + esc(r) + '" style="--rk:' + (RANK_COL[r] || '#9aa3ad') + '">' + esc(r) + '</span>';

    function itemCell(it) {
      const col = rc(it.rarity);
      return '<button type="button" class="inv-cell' + (rarIdx(it.rarity) >= 3 ? ' hi' : '') + (it.locked ? ' locked' : '') + '" style="--rc:' + col + '" data-act="sel" data-uid="' + it.uid + '" aria-label="' + esc(it.name) + '">' + esc(it.icon) +
        (it.upgrade ? '<span class="inv-plus">+' + it.upgrade + '</span>' : '') + (it.locked ? '<span class="inv-lk inv-ic">' + (ico('lock', 11) || '🔒') + '</span>' : (isNewItem(it) ? '<span class="inv-new" title="Nouveau"></span>' : '')) +
        (it.set ? '<span class="inv-setpip"></span>' : '') +
        '<span class="inv-rk" style="color:' + (RANK_COL[it.rankReq] || '#fff') + '">' + esc(it.rankReq) + '</span></button>';
    }
    function slotBtn(s) {
      const it = eq[s.id];
      return it
        ? '<button type="button" class="inv-slot" style="--rc:' + rc(it.rarity) + '" data-act="sel" data-uid="' + it.uid + '" aria-label="' + esc(s.name + ' : ' + it.name) + '"><span class="inv-slot__ico">' + esc(it.icon) + '</span>' + (it.upgrade ? '<span class="inv-plus">+' + it.upgrade + '</span>' : '') + '<span class="inv-slot__lbl">' + s.name + '</span></button>'
        : '<div class="inv-slot empty" aria-label="' + esc(s.name) + ' vide"><span class="inv-ic">' + slotIco(s, 26) + '</span><span class="inv-slot__lbl">' + s.name + '</span></div>';
    }
    const sd = (id) => I().slots.find((s) => s.id === id);

    function statsHtml() {
      const keys = Object.keys(g.total), SHOW = 6, all = S.sumOpen || keys.length <= SHOW;
      let h = '<div class="inv-sum"><div class="inv-sum__head"><span class="inv-ic">' + ico('chart', 16) + '</span>Bonus d\'équipement<span class="ds-badge ds-badge--gold">+' + fnum(g.power, 1) + ' % puissance</span></div>';
      if (!keys.length) h += '<div class="inv-empty" style="padding:10px">Aucun bonus. Équipez des objets !</div>';
      else {
        h += '<div class="ds-stat-grid">';
        (all ? keys : keys.slice(0, SHOW)).forEach((k) => { h += '<div class="ds-stat is-up"><span class="ds-stat__label">' + esc(I().stats[k].label) + '</span><b class="ds-stat__value">' + fmtVal(k, g.total[k]) + '</b></div>'; });
        h += '</div>';
        if (keys.length > SHOW) h += '<button type="button" class="inv-more" data-act="more">' + (S.sumOpen ? 'Réduire' : 'Tout afficher (' + keys.length + ')') + '</button>';
      }
      if (g.sets.length || g.effects.length) {
        h += '<div class="inv-tags">';
        g.sets.forEach((s) => { h += '<span class="ds-badge ds-badge--violet">' + esc(s.name) + ' ' + s.count + '/' + s.total + '</span>'; });
        g.effects.forEach((id) => { const d = I().effects[id]; h += '<span class="ds-badge ds-badge--gold"><span class="inv-ic">' + (ico('sparkles', 12) || '✦') + '</span>' + esc(d.name) + '</span>'; });
        h += '</div>';
      }
      return h + '</div>';
    }
    function dollHtml() {
      return '<div class="inv-doll"><div class="inv-doll__col">' + ['casque', 'armure', 'bottes'].map((i) => slotBtn(sd(i))).join('') + '</div>' +
        '<div class="inv-doll__mid">' + SIL + '<div class="inv-pow"><small>Puissance</small><b>+' + fnum(g.power, 1) + ' %</b></div></div>' +
        '<div class="inv-doll__col">' + ['amulette', 'arme', 'anneau'].map((i) => slotBtn(sd(i))).join('') + '</div></div>';
    }
    function equipTab() {
      let h = '<div class="inv-top"><div>' + dollHtml() + '</div><div>' + statsHtml() + '</div></div>';
      // outils : emplacement, rareté, tri
      h += '<div class="inv-tool"><div class="inv-row"><button type="button" class="inv-chip' + (S.slot === 'all' ? ' is-active' : '') + '" data-act="fslot" data-v="all">Tout</button>';
      I().slots.forEach((s) => { h += '<button type="button" class="inv-chip' + (S.slot === s.id ? ' is-active' : '') + '" data-act="fslot" data-v="' + s.id + '" aria-label="' + esc(s.name) + '" title="' + esc(s.name) + '"><span class="inv-ic">' + slotIco(s, 16) + '</span></button>'; });
      h += '</div><div class="inv-row"><button type="button" class="inv-chip' + (S.rar === 'all' ? ' is-active' : '') + '" data-act="frar" data-v="all">Toutes</button>';
      I().rarities.forEach((r) => { h += '<button type="button" class="inv-chip rar' + (S.rar === r.id ? ' is-active' : '') + '" style="--rc:' + r.color + '" data-act="frar" data-v="' + r.id + '"><i class="dot"></i>' + r.name + '</button>'; });
      const so = [['rarete', 'Rareté'], ['puissance', 'Puiss.'], ['niveau', 'Niv.'], ['recent', 'Récent']];
      h += '</div><div class="inv-sort"><span class="inv-ic">' + (ico('sort', 18) || '⇅') + '</span><div class="ds-segmented" role="group" aria-label="Tri">' + so.map((o) => '<button type="button" class="' + (S.sort === o[0] ? 'is-active' : '') + '" data-act="sortv" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div></div></div>';
      let list = inv.items.filter((i) => !isEq(p, i) && (S.slot === 'all' || i.slot === S.slot) && (S.rar === 'all' || i.rarity === S.rar));
      const key = { rarete: (a, b) => rarIdx(b.rarity) - rarIdx(a.rarity) || itemPower(b) - itemPower(a), puissance: (a, b) => itemPower(b) - itemPower(a), niveau: (a, b) => b.level - a.level, recent: (a, b) => (b.born || 0) - (a.born || 0) }[S.sort];
      list.sort(key);
      const n = bagCount(p), cp = inv.capacity || 60, ratio = n / cp;
      h += '<div class="inv-cap' + (ratio >= 1 ? ' full' : ratio >= 0.85 ? ' warn' : '') + '"><div class="inv-cap__top"><span><span class="inv-ic" style="vertical-align:-3px">' + (ico('bag', 16) || '🎒') + '</span> Sac</span><span><b>' + n + '</b> / ' + cp + '</span></div><div class="ds-bar ds-bar--gold"><span class="ds-bar__fill" style="width:' + Math.min(100, Math.round(ratio * 100)) + '%"></span></div></div>';
      h += list.length ? '<div class="inv-grid">' + list.map((i) => itemCell(i)).join('') + '</div>'
        : '<div class="inv-empty"><span class="inv-ic">' + ico('bag', 34) + '</span>Aucun objet ici.<br>Vainquez des monstres et des boss pour trouver du butin !</div>';
      h += '<div class="inv-bulk"><button type="button" class="ds-btn ds-btn--danger ds-btn--sm ds-btn--block" data-act="salvcom"><span class="ds-btn__icon">' + (ico('refresh', 16) || '♻') + '</span>Recycler les communs</button></div>';
      return h;
    }
    function matsTab() {
      const ids = Object.keys(I().materials).filter((k) => matCount(p, k) > 0 || I().materials[k].kind === 'craft' || I().materials[k].kind === 'essence' || k === 'cristal_eveil');
      if (!ids.length) return '<div class="inv-empty">Aucun matériau.</div>';
      return '<div class="inv-mats">' + ids.map((k) => {
        const d = I().materials[k], n = matCount(p, k);
        let extra = '';
        if (d.convert && n > 0) extra += '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-act="conv" data-id="' + k + '">Convertir</button>';
        if (d.sell && !d.noSell && n > 0) extra += '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-act="sellm" data-id="' + k + '">Vendre ' + d.sell + ' <span class="inv-ic">' + goldIco() + '</span></button>';
        return '<div class="inv-mat' + (n ? '' : ' zero') + '" style="--rc:' + rc(d.rarity === 'secret' ? 'mythique' : d.rarity) + '"><div class="inv-mat__top"><span class="inv-mat__ico">' + d.icon + '</span><span class="inv-mat__nm">' + esc(d.name) + '</span><span class="inv-mat__n">' + n + '</span></div><small>' + esc(d.desc) + '</small>' + (extra ? '<div class="inv-mat__act">' + extra + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    function craftTab() {
      const rec = I().recipes;
      let h = '<div class="inv-recs">';
      Object.keys(rec).forEach((id) => {
        const r = rec[id]; if (r.kind === 'reforge') return;
        const cost = { gold: r.gold, mats: r.mats, anyEssence: r.anyEssence };
        const rankOk = !r.rankMin || rIdx(p.rank || 'E') >= rIdx(r.rankMin), can = rankOk && !missing(p, cost).length;
        h += '<div class="inv-rec' + (can ? ' can' : '') + '"><div class="inv-rec__h"><span class="inv-rec__ico">' + r.icon + '</span><span class="inv-rec__nm">' + esc(r.name) + '</span>' + (r.rankMin ? rankChip(r.rankMin) : '') + '</div><div class="inv-rec__d">' + esc(r.desc) + (r.rankMin && !rankOk ? ' <span style="color:var(--ds-danger)">Rang ' + r.rankMin + ' requis.</span>' : '') + '</div>';
        if (r.kind === 'item') h += '<select class="ds-select" data-rid="' + id + '" aria-label="Emplacement">' + I().slots.map((s) => '<option value="' + s.id + '">' + s.icon + ' ' + s.name + '</option>').join('') + '</select>';
        h += '<div class="inv-rec__ing">' + costHtml(p, cost) + '</div><button type="button" class="ds-btn ' + (can ? 'ds-btn--primary' : 'ds-btn--secondary') + ' ds-btn--block" data-act="craft" data-id="' + id + '"' + (can ? '' : ' disabled') + '><span class="ds-btn__icon">' + (ico('hammer', 16) || '') + '</span>Fabriquer</button></div>';
      });
      return h + '</div><div class="inv-hint"><span class="inv-ic">' + (ico('refresh', 18) || '🔁') + '</span>Reforger : ouvrez un objet et choisissez « Reforger ».</div>';
    }
    function sheetHtml() {
      const it = S.sel && find(p, S.sel); if (!it) return '';
      const col = rc(it.rarity), R = rarOf(it), tot = itemTotals(it), cur = eq[it.slot] && eq[it.slot].uid !== it.uid ? eq[it.slot] : null;
      const ctot = cur ? itemTotals(cur) : null;
      const equipped = isEq(p, it), can = canEquip(p, it), rankBad = rIdx(p.rank || 'E') < rIdx(it.rankReq);
      const sl = slotDef(it.slot);
      let h = '<div class="inv-sheet" data-act="close"><div class="ds-window inv-win" role="dialog" aria-modal="true" aria-label="' + esc(it.name) + '" style="--rc:' + col + '" data-stop="1">';
      h += '<div class="ds-window__header"><span class="inv-win__ico">' + esc(it.icon) + '</span><div class="inv-win__tt"><div class="inv-ttl">' + esc(it.name) + (it.upgrade ? ' +' + it.upgrade : '') + '</div>' +
        '<div class="inv-sub"><span class="rar">' + R.name + '</span><span aria-hidden="true">·</span><span class="inv-ic">' + slotIco(sl, 14) + '</span>' + sl.name + (equipped ? '<span class="ds-badge ds-badge--accent">Équipé</span>' : '') + '</div></div>' +
        '<button type="button" class="ds-icon-btn" data-act="close" aria-label="Fermer">' + (ico('close', 20) || '✕') + '</button></div>';
      h += '<div class="ds-window__body"><div class="inv-meta"><span class="ds-badge">Niv. ' + it.level + '</span><span class="ds-badge' + (rankBad ? ' bad' : '') + '" title="Rang requis">Rang requis ' + rankChip(it.rankReq) + '</span>' + (it.classes ? '<span class="ds-badge ' + (it.classes.indexOf(p.classe) < 0 ? 'bad' : '') + '">' + esc(it.classes.join(' / ')) + '</span>' : '') + (it.locked ? '<span class="ds-badge"><span class="inv-ic">' + ico('lock', 12) + '</span>Verrouillé</span>' : '') + '</div>';
      const pw = itemPower(it), pwd = cur ? pw - itemPower(cur) : 0;
      h += '<div class="inv-power"><span>Puissance</span><b>+' + fnum(pw, 1) + ' %' + (cur && Math.abs(pwd) > 1e-9 ? '<span class="inv-delta ' + (pwd > 0 ? 'up' : 'dn') + '">' + (pwd > 0 ? '▲ ' : '▼ ') + fnum(Math.abs(pwd), 1) + '</span>' : '') + '</b></div>';
      const baseKeys = Object.keys(it.stats || {}), affKeys = Object.keys(tot).filter((k) => baseKeys.indexOf(k) < 0);
      const row = (k, aff) => {
        let d = '', cls = '';
        if (ctot) { const diff = tot[k] - (ctot[k] || 0); if (Math.abs(diff) > 1e-9) { cls = diff > 0 ? ' is-up' : ' is-down'; const dv = fmtVal(k, Math.abs(diff)).replace('+', ''); d = '<span class="inv-delta ' + (diff > 0 ? 'up' : 'dn') + '">' + (diff > 0 ? '▲' : '▼') + (/^0(\s%)?$/.test(dv) ? '' : ' ' + dv) + '</span>'; } }
        return '<div class="ds-stat' + cls + (aff ? ' aff' : '') + '"><span class="ds-stat__label">' + (aff ? (ico('sparkles', 12) || '✦') + ' ' : '') + esc(I().stats[k].label) + '</span><b class="ds-stat__value">' + fmtVal(k, tot[k]) + d + '</b></div>';
      };
      h += '<div class="ds-section-title">Statistiques</div>' + baseKeys.map((k) => row(k, false)).join('');
      if (affKeys.length) h += '<div class="ds-section-title">Affixes</div>' + affKeys.map((k) => row(k, true)).join('');
      if (ctot) {
        const lost = Object.keys(ctot).filter((k) => !(k in tot));
        if (lost.length) h += '<div class="ds-section-title">Perdu vs équipé</div>' + lost.map((k) => '<div class="ds-stat is-down"><span class="ds-stat__label">' + esc(I().stats[k].label) + '</span><b class="ds-stat__value">' + fmtVal(k, -ctot[k], true).replace('-', '−') + '<span class="inv-delta dn">▼</span></b></div>').join('');
      }
      if (it.effect && I().effects[it.effect]) { const f = I().effects[it.effect]; h += '<div class="inv-fx"><span class="inv-ic">' + (ico('sparkles', 20) || '✦') + '</span><div><b>' + esc(f.name) + '</b>' + esc(f.desc) + '</div></div>'; }
      if (it.set && I().sets[it.set]) {
        const S2 = I().sets[it.set], n = g.sets.find((s) => s.id === it.set); const have = n ? n.count : 0;
        h += '<div class="inv-set" style="--sc:' + S2.color + '"><div class="inv-set__h"><span class="inv-ic">' + (ico('crown', 16) || '') + '</span>' + esc(S2.name) + '<span class="ds-badge ds-badge--violet">' + have + ' / ' + S2.pieces.length + '</span></div><div class="inv-pieces">';
        S2.pieces.forEach((pc) => { const worn = eq[pc.slot] && eq[pc.slot].baseId === pc.id; h += '<span class="inv-pc' + (worn ? ' on' : '') + '">' + (worn ? (ico('check', 12) || '✔') : (ico('lock', 12) || '✗')) + ' ' + esc(pc.name) + '</span>'; });
        h += '</div>';
        Object.keys(S2.bonuses).map(Number).sort().forEach((need) => {
          const b = S2.bonuses[need], vals = setBonusValues(b, it.level), txt = Object.keys(vals).map((k) => fmtStat(k, vals[k])).join(', ') + (b.effect ? (Object.keys(vals).length ? ' + ' : '') + '✦ ' + I().effects[b.effect].name + ' : ' + I().effects[b.effect].desc : '');
          h += '<div class="inv-tier' + (have >= need ? ' on' : '') + '"><b>' + need + ' pcs</b><span>' + esc(txt) + '</span></div>';
        });
        h += '</div>';
      }
      if (!equipped && !can.ok) h += '<div class="inv-msg err" style="margin-top:10px"><span class="inv-ic">' + (ico('warning', 16) || '⚠') + '</span>' + esc(can.reason) + '</div>';
      if (S.msg && S.msgSheet) h += '<div class="inv-msg ' + (S.msg.ok ? 'ok' : 'err') + '" style="margin-top:10px">' + esc(S.msg.t) + '</div>';
      const uc = upgradeCost(it), y = salvageYield(it);
      h += '<div class="inv-costs">';
      if (uc) h += '<div class="inv-cost"><em>Amélioration</em><span class="inv-cost__c">' + costHtml(p, { gold: uc.gold, mats: uc.mats }) + '</span></div>';
      h += '<div class="inv-cost"><em>Recyclage</em><span class="inv-cost__c">' + Object.keys(y).map((k) => '<span class="inv-ing ok">' + (I().materials[k] ? I().materials[k].icon : '') + ' <small style="color:var(--ds-text)">×' + y[k] + '</small></span>').join('') + '</span></div>';
      if (it.rarity !== 'commun') h += '<div class="inv-cost"><em>Reforge</em><span class="inv-cost__c">' + costHtml(p, reforgeCost(it)) + '</span></div>';
      h += '</div></div>';
      // pied : actions
      h += '<div class="ds-window__footer">';
      h += equipped ? '<button type="button" class="ds-btn ds-btn--secondary wide" data-act="uneq" data-uid="' + it.uid + '">Retirer</button>'
        : '<button type="button" class="ds-btn ds-btn--primary wide" data-act="eq" data-uid="' + it.uid + '"' + (can.ok ? '' : ' disabled') + '><span class="ds-btn__icon">' + (ico('check', 16) || '') + '</span>Équiper</button>';
      h += uc ? '<button type="button" class="ds-btn ds-btn--gold" data-act="up" data-uid="' + it.uid + '"><span class="ds-btn__icon">' + (ico('anvil', 16) || ico('arrow-up', 16)) + '</span>Améliorer +' + uc.next + '</button>' : '<button type="button" class="ds-btn ds-btn--secondary" disabled>Niveau max</button>';
      h += it.rarity !== 'commun' ? '<button type="button" class="ds-btn ds-btn--secondary" data-act="reforge" data-uid="' + it.uid + '"><span class="ds-btn__icon">' + (ico('refresh', 16) || '') + '</span>Reforger</button>' : '<span></span>';
      h += '<button type="button" class="ds-btn ds-btn--ghost" data-act="lock" data-uid="' + it.uid + '"><span class="ds-btn__icon">' + (ico(it.locked ? 'unlock' : 'lock', 16) || '') + '</span>' + (it.locked ? 'Déverrouiller' : 'Verrouiller') + '</button>';
      h += '<button type="button" class="ds-btn ds-btn--danger" data-act="rec" data-uid="' + it.uid + '"' + (equipped || it.locked ? ' disabled' : '') + '><span class="ds-btn__icon">' + (ico('refresh', 16) || '') + '</span>' + (S.confirm === it.uid ? 'Confirmer ?' : 'Recycler') + '</button>';
      h += '</div>';
      return h + '</div></div>';
    }

    const tabs = [['equip', 'bag', '🎒', 'Équipement'], ['mats', 'gem', '🔩', 'Matériaux'], ['craft', 'hammer', '🔨', 'Fabrication']];
    let html = '<div class="inv-root">';
    if (S.msg && !S.msgSheet) html += '<div class="inv-msg ' + (S.msg.ok ? 'ok' : 'err') + '">' + esc(S.msg.t) + '</div>';
    html += '<div class="ds-tabs" role="tablist">' + tabs.map((t) => '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" class="ds-tab' + (S.tab === t[0] ? ' is-active' : '') + '" data-act="tab" data-v="' + t[0] + '"><span class="inv-ic">' + (ico(t[1], 16) || t[2]) + '</span>' + t[3] + '</button>').join('') + '</div>';
    html += S.tab === 'equip' ? equipTab() : S.tab === 'mats' ? matsTab() : craftTab();
    html += '</div>';
    container.innerHTML = html;
    // la fenêtre d'objet est montée dans <body> (le conteneur du camp est animé/transformé : position:fixed y serait relative)
    const old = S.portal, sc = old && old.querySelector('.inv-win .ds-window__body'), scTop = sc ? sc.scrollTop : 0;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    S.portal = null;
    const sheet = sheetHtml();
    if (sheet && typeof document !== 'undefined') {
      const pt = document.createElement('div'); pt.className = 'inv-portal'; pt.innerHTML = sheet; document.body.appendChild(pt); S.portal = pt; S.host = container;
      if (scTop) { const n = pt.querySelector('.inv-win .ds-window__body'); if (n) n.scrollTop = scTop; }
      pt.onclick = (ev) => onAct(ev);
    }

    const redraw = () => renderPanel(container, p);
    const say = (r, okText) => { S.msg = { ok: !!r.ok, t: r.ok ? okText : (r.reason || 'Impossible.') }; S.msgSheet = !!S.sel; };
    container.onchange = null;
    const onAct = (ev) => {
      const el = ev.target.closest && ev.target.closest('[data-act]'); if (!el || !(container.contains(el) || (S.portal && S.portal.contains(el)))) return;
      const act = el.dataset.act, uid = el.dataset.uid;
      if (act === 'close') { if (el.classList.contains('inv-sheet') && ev.target !== el) return; S.sel = null; S.msg = null; S.confirm = null; return redraw(); }
      S.msg = null; S.msgSheet = false;
      if (act === 'tab') { S.tab = el.dataset.v; S.sel = null; }
      else if (act === 'fslot') S.slot = el.dataset.v;
      else if (act === 'frar') S.rar = el.dataset.v;
      else if (act === 'sortv') S.sort = el.dataset.v;
      else if (act === 'more') S.sumOpen = !S.sumOpen;
      else if (act === 'sel') { S.sel = uid; S.confirm = null; SEEN.add(uid); }
      else if (act === 'eq') { const r = equip(p, uid); say(r, 'Équipé.'); if (r.ok) S.sel = null; }
      else if (act === 'uneq') { const r = unequip(p, uid); say(r, 'Retiré.'); if (r.ok) S.sel = null; }
      else if (act === 'up') { const r = upgrade(p, uid); say(r, 'Amélioré !'); try { G.sfx && G.sfx.play(r.ok ? 'upgrade' : 'error'); } catch (_) {} }
      else if (act === 'lock') { lock(p, uid); }
      else if (act === 'reforge') { const r = craft(p, 'reforge', { uid }); say(r, 'Affixes reforgés !'); }
      else if (act === 'rec') {
        if (S.confirm !== uid) { S.confirm = uid; } else { const r = salvage(p, uid); say(r, 'Recyclé.'); S.msgSheet = false; if (r.ok) { S.sel = null; S.confirm = null; } }
      }
      else if (act === 'salvcom') { const r = salvageAll(p, { maxRarity: 'commun' }); S.msg = { ok: true, t: r.count + ' objet(s) commun(s) recyclé(s).' }; }
      else if (act === 'craft') {
        const sel = container.querySelector('select[data-rid="' + el.dataset.id + '"]');
        const r = craft(p, el.dataset.id, { slot: sel ? sel.value : 'arme' }); say(r, r.item ? 'Fabriqué : ' + r.item.name : 'Fabriqué !'); S.msgSheet = false;
        if (r.ok && r.item) announceItem(r.item);
      }
      else if (act === 'sellm') { const r = sellMaterial(p, el.dataset.id, 1); say(r, 'Vendu : +' + (r.gold || 0) + ' or.'); }
      else if (act === 'conv') { const r = convertMaterial(p, el.dataset.id, 1); say(r, 'Converti.'); }
      redraw();
    };
    container.onclick = onAct;
  }


  const PANEL = { id: 'inventaire', title: 'Inventaire', icon: '🎒', order: 5, visible: () => true, render: renderPanel,
    dispose: (host) => { try { const S = host && host.__inv; if (S && S.portal && S.portal.parentNode) S.portal.parentNode.removeChild(S.portal); if (S) S.portal = null; } catch (_) {} },
    badge: (p) => (p && p.inventory ? 0 : 0) };
  if (G.UI && G.UI.registerPanel) G.UI.registerPanel(PANEL); else if (G.Panels && G.Panels.register) G.Panels.register(PANEL.id, PANEL);
  G.Inventory.panel = PANEL;
  // changement de classe (Nécromancien…) : les objets de l'ancienne classe ne servent plus → matériaux
  try { if (G.bus) G.bus.on('classChanged', (e) => { const p = (e && e.profile) || prof(); if (p && purgeWrongClass(p)) commit(p); }); } catch (_) { /* rien */ }
})();
