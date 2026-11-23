window.G = window.G || {};
/* =====================================================================
   js/net/transport.js — couche de transport abstraite du mode en ligne
   ---------------------------------------------------------------------
   Une « base temps réel » minimale, identique pour les deux implémentations :
     set(path, v) · update(path, obj) · remove(path) · get(path)
     watch(path, cb(valeur))            → fonction de désabonnement
     push(path, v)                      → événement ordonné (fiable, non rejoué)
     onEvent(path, cb(valeur, clé))     → événements poussés APRÈS l'abonnement
     onDisconnectRemove(path)           → suppression automatique à la déconnexion
     now()                              → horodatage (serveur si Firebase)
   Implémentations :
     'local'    : BroadcastChannel entre onglets de la même origine (test de la coop SANS Firebase).
                  Chaque onglet garde une copie de l'arbre ; les écritures sont diffusées.
     'firebase' : Firebase Realtime Database (SDK compat déjà chargé par online.js).
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const clone = v => (v === undefined ? null : v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));
  const split = p => String(p || '').split('/').filter(Boolean);
  const under = (a, b) => { const A = split(a), B = split(b); const n = Math.min(A.length, B.length); for (let i = 0; i < n; i++) if (A[i] !== B[i]) return false; return true; };

  // ------------------------------------------------------------------
  // Transport LOCAL (BroadcastChannel)
  // ------------------------------------------------------------------
  function createLocal(opts) {
    opts = opts || {};
    if (typeof BroadcastChannel !== 'function') return null;
    const ch = new BroadcastChannel(opts.channel || 'donjon-arena-net-v1');
    const tree = {};
    const watchers = new Set(), evs = new Set(), onDisc = new Set();
    let closed = false, evN = 0;
    const id = Math.random().toString(36).slice(2, 10);

    function getAt(path) { let o = tree; for (const k of split(path)) { if (!o || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; }
    function setAt(path, v) {
      const ks = split(path); if (!ks.length) return;
      let o = tree;
      for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') { if (v === null) return; o[ks[i]] = {}; } o = o[ks[i]]; }
      const last = ks[ks.length - 1];
      if (v === null || v === undefined) delete o[last]; else o[last] = clone(v);
      prune(ks.slice(0, -1));
    }
    function prune(ks) {      // supprime les nœuds devenus vides (comme la RTDB)
      for (let n = ks.length; n > 0; n--) {
        const parent = n > 1 ? getAt(ks.slice(0, n - 1).join('/')) : tree, k = ks[n - 1];
        if (parent && parent[k] && typeof parent[k] === 'object' && !Object.keys(parent[k]).length) delete parent[k]; else break;
      }
    }
    let pending = new Set(), flushQ = false;
    function changed(path) {
      pending.add(path);
      if (flushQ) return;
      flushQ = true;
      Promise.resolve().then(() => {
        flushQ = false;
        const ps = Array.from(pending); pending = new Set();
        watchers.forEach(w => { if (ps.some(p => under(p, w.path))) { try { w.cb(clone(getAt(w.path))); } catch (e) { console.error('[net local] watch', e); } } });
      });
    }
    function merge(dst, src) {
      Object.keys(src || {}).forEach(k => {
        if (src[k] && typeof src[k] === 'object' && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]);
        else if (dst[k] === undefined) dst[k] = clone(src[k]);
      });
    }
    function post(m) { if (closed) return; try { ch.postMessage(Object.assign({ from: id }, m)); } catch (e) { console.warn('[net local] postMessage', e); } }
    ch.onmessage = ev => {
      const m = ev.data;
      if (!m || m.from === id || closed) return;
      if (m.op === 'set') { setAt(m.p, m.v); changed(m.p); }
      else if (m.op === 'upd') { Object.keys(m.v || {}).forEach(k => setAt(m.p + '/' + k, m.v[k])); changed(m.p); }
      else if (m.op === 'ev') deliver(m.p, m.v, m.k);
      else if (m.op === 'sync?') post({ op: 'sync!', tree, to: m.from });
      else if (m.op === 'sync!' && m.to === id) { merge(tree, m.tree || {}); changed(''); }
    };
    function deliver(path, v, k) { evs.forEach(w => { if (w.path === path) { try { w.cb(clone(v), k); } catch (e) { console.error('[net local] event', e); } } }); }
    const db = {
      kind: 'local',
      set(path, v) { setAt(path, v); changed(path); post({ op: 'set', p: path, v: clone(v) }); return Promise.resolve(); },
      update(path, obj) { Object.keys(obj || {}).forEach(k => setAt(path + '/' + k, obj[k])); changed(path); post({ op: 'upd', p: path, v: clone(obj) }); return Promise.resolve(); },
      remove(path) { return db.set(path, null); },
      get(path) { return Promise.resolve(clone(getAt(path))); },
      watch(path, cb) {
        const w = { path, cb }; watchers.add(w);
        Promise.resolve().then(() => { if (watchers.has(w)) { try { cb(clone(getAt(path))); } catch (e) { console.error('[net local] watch', e); } } });
        return () => watchers.delete(w);
      },
      push(path, v) {
        const k = Date.now().toString(36) + '-' + id + '-' + (++evN);
        post({ op: 'ev', p: path, v: clone(v), k });
        Promise.resolve().then(() => deliver(path, v, k));
        return Promise.resolve(k);
      },
      onEvent(path, cb) { const w = { path, cb }; evs.add(w); return () => evs.delete(w); },
      onDisconnectRemove(path) { onDisc.add(path); return Promise.resolve(); },
      cancelDisconnect(path) { onDisc.delete(path); },
      now: () => Date.now(),
      close() {
        if (closed) return;
        onDisc.forEach(p => { setAt(p, null); post({ op: 'set', p, v: null }); });
        onDisc.clear(); closed = true; watchers.clear(); evs.clear();
        try { ch.close(); } catch (_) { /* rien */ }
      },
    };
    const bye = () => db.close();
    addEventListener('pagehide', bye);
    addEventListener('beforeunload', bye);
    post({ op: 'sync?' });
    return db;
  }

  // ------------------------------------------------------------------
  // Transport FIREBASE (Realtime Database, SDK compat)
  // ------------------------------------------------------------------
  function createFirebase(rtdb) {
    if (!rtdb || typeof rtdb.ref !== 'function') return null;
    const subs = new Set();
    const ref = p => rtdb.ref(String(p || ''));
    const TS = () => (window.firebase && firebase.database && firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now());
    let offset = 0;
    try { ref('.info/serverTimeOffset').on('value', s => { offset = Number(s.val()) || 0; }); } catch (_) { /* rien */ }
    const db = {
      kind: 'firebase',
      set: (p, v) => ref(p).set(v === undefined ? null : v),
      update: (p, o) => ref(p).update(o || {}),
      remove: p => ref(p).remove(),
      get: p => ref(p).once('value').then(s => s.val()),
      watch(p, cb) {
        const r = ref(p);
        const fn = s => { try { cb(s.val()); } catch (e) { console.error('[net firebase] watch', e); } };
        const err = e => console.warn('[net firebase] lecture refusée : ' + p, e && e.code);
        r.on('value', fn, err);
        const off = () => { try { r.off('value', fn); } catch (_) { /* rien */ } subs.delete(off); };
        subs.add(off); return off;
      },
      push(p, v) { const r = ref(p).push(); return r.set(v).then(() => r.key); },
      onEvent(p, cb) {
        const base = ref(p);
        const startKey = base.push().key;      // seulement les événements postérieurs à l'abonnement
        const q = base.orderByKey().startAt(startKey);
        const fn = s => { try { cb(s.val(), s.key); } catch (e) { console.error('[net firebase] event', e); } };
        q.on('child_added', fn, e => console.warn('[net firebase] événements refusés : ' + p, e && e.code));
        const off = () => { try { q.off('child_added', fn); } catch (_) { /* rien */ } subs.delete(off); };
        subs.add(off); return off;
      },
      onDisconnectRemove: p => ref(p).onDisconnect().remove(),
      onDisconnectSet: (p, v) => ref(p).onDisconnect().set(v),
      cancelDisconnect: p => { try { ref(p).onDisconnect().cancel(); } catch (_) { /* rien */ } },
      serverTS: TS,
      now: () => Date.now() + offset,
      close() { Array.from(subs).forEach(f => f()); },
    };
    return db;
  }

  G.NetTransport = { createLocal, createFirebase };
})();
