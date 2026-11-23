window.G = window.G || {};
/* =====================================================================
   js/net/online.js — G.Online : compte, amis, guildes, groupe et coop
   ---------------------------------------------------------------------
   Deux modes, même code de groupe / coop :
     'firebase' : G.FIREBASE_CONFIG rempli (enabled:true) → SDK compat v10 chargé depuis gstatic.
                  Auth Google, Firestore (profils, amis, guildes, chat), Realtime Database
                  (présence /status, invitations /invites, groupes /lobbies).
     'local'    : ?net=local dans l'URL (ou bouton « coop locale ») → BroadcastChannel entre onglets
                  de la même origine. Pas de compte ni de guilde : les « amis » sont les autres onglets.
   Hors ligne, sans configuration ou si le SDK ne se charge pas : mode 'off', le solo n'est jamais touché.

   Coop (2 à 4 joueurs) — modèle « hôte autoritaire » :
     lobbies/{id}/members/{uid}  infos joueur (classe, skin, rang, prêt, accès au portail)
     lobbies/{id}/launch         portail + donjon (JSON) + graine, écrit par le chef → départ simultané
     lobbies/{id}/st/{uid}       état de chaque joueur (~12 Hz) : position, orientation, anim, PV, sorts
     lobbies/{id}/snap           instantané des ennemis par l'hôte (~10 Hz)
     lobbies/{id}/ev             événements : dmg (invité→hôte), hurt (hôte→invité), door, room, clear,
                                 end, revive, loot, leave
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const CFG = () => G.FIREBASE_CONFIG || {};
  const ST_HZ = 12, SNAP_HZ = 10;
  const MAX_PLAYERS = 4;
  const STALE_MS = 6000;
  const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';    // sans 0/O/1/I
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = n => { let s = ''; const a = new Uint32Array(n); try { crypto.getRandomValues(a); } catch (_) { for (let i = 0; i < n; i++) a[i] = Math.random() * 4294967296; } for (let i = 0; i < n; i++) s += CODE_ALPHA[a[i] % CODE_ALPHA.length]; return s; };
  const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Joueur';
  const toast = t => { try { G.UI && G.UI.toast && G.UI.toast(t); } catch (_) { /* rien */ } };
  const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ------------------------------------------------------------------
  // État public
  // ------------------------------------------------------------------
  const O = {
    mode: 'off',            // 'off' | 'loading' | 'local' | 'firebase'
    error: null,
    user: null,             // { uid, name, photo }
    me: null,               // profil en ligne (Firestore) { name, code, guildId, … }
    friends: [],            // [{ uid, name, classe, rank, niveau, online, inGame }]
    requests: [],           // [{ uid, name }]
    invites: [],            // [{ lobbyId, from, name }]
    guild: null,            // { id, name, tag, code, leader }
    guildMembers: [],       // [{ uid, name, role, online }]
    chat: [],               // [{ id, uid, name, text, at }]
    lobby: null,            // { id, leader, state, members:{}, portal, launch }
    session: null,          // partie coop en cours
    db: null,               // transport temps réel (G.NetTransport)
  };
  const listeners = new Set();
  let changeQ = false;
  function changed(what) {
    if (changeQ) return;
    changeQ = true;
    Promise.resolve().then(() => {
      changeQ = false;
      listeners.forEach(fn => { try { fn(what); } catch (e) { console.error('[Online] écouteur', e); } });
      try { G.bus && G.bus.emit('online', { what }); } catch (_) { /* rien */ }
    });
  }
  O.onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const notify = (o) => { try { G.OnlineUI && G.OnlineUI.notify && G.OnlineUI.notify(o); } catch (_) { /* rien */ } };

  // ------------------------------------------------------------------
  // Utilitaires profil local
  // ------------------------------------------------------------------
  function profile() { return (G.game && G.game.profile) || null; }
  function skinId(p) {
    try { const s = G.Cosmetics && G.Cosmetics.skinFor && G.Cosmetics.skinFor(p, p.classe); return (s && s.id) || null; } catch (_) { return null; }
  }
  function pseudo() {
    const p = profile();
    return cleanName((O.me && O.me.name) || (p && p.nom) || (O.user && O.user.name) || 'Joueur');
  }
  function heroInfo() {
    const p = profile() || {};
    return { name: pseudo(), classe: p.classe || 'Guerrier', rank: p.rank || 'E', niveau: num(p.niveau, 1), skin: skinId(p) };
  }

  // ------------------------------------------------------------------
  // Chargement du SDK Firebase (seulement si la config est remplie)
  // ------------------------------------------------------------------
  function configReady() {
    const c = CFG();
    return !!(c.enabled && c.apiKey && c.projectId && c.databaseURL && c.authDomain);
  }
  function loadScript(src, ms) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      const t = setTimeout(() => { s.remove(); rej(new Error('délai dépassé : ' + src)); }, ms || 12000);
      s.onload = () => { clearTimeout(t); res(); };
      s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
  }
  let fb = null;      // { app, auth, fs, rtdb }
  async function loadFirebase() {
    const v = CFG().sdkVersion || '10.12.2';
    const base = 'https://www.gstatic.com/firebasejs/' + v + '/';
    for (const m of ['app', 'auth', 'firestore', 'database']) await loadScript(base + 'firebase-' + m + '-compat.js');
    if (!window.firebase || !firebase.initializeApp) throw new Error('SDK Firebase absent après chargement');
    const c = Object.assign({}, CFG()); delete c.enabled; delete c.sdkVersion;
    const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(c);
    fb = { app, auth: firebase.auth(), fs: firebase.firestore(), rtdb: firebase.database() };
    return fb;
  }

  // ------------------------------------------------------------------
  // Démarrage
  // ------------------------------------------------------------------
  function wantLocal() {
    try { if (/[?&]net=local\b/.test(location.search)) return true; } catch (_) { /* rien */ }
    try { return sessionStorage.getItem('donjon-net-local') === '1'; } catch (_) { return false; }
  }
  async function init() {
    if (O._init) return; O._init = true;
    if (wantLocal()) { O.enableLocal(); return; }
    if (!configReady()) { O.mode = 'off'; O.error = null; changed('mode'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { O.mode = 'off'; O.error = 'Pas de connexion internet : mode en ligne indisponible.'; changed('mode'); return; }
    O.mode = 'loading'; changed('mode');
    try {
      await loadFirebase();
      O.db = G.NetTransport.createFirebase(fb.rtdb);
      O.mode = 'firebase';
      fb.auth.onAuthStateChanged(u => { onAuth(u).catch(e => { console.warn('[Online] connexion', e); O.error = 'Erreur de connexion : ' + (e && (e.code || e.message)); changed('error'); }); });
      fb.auth.getRedirectResult().catch(e => { if (e && e.code) { O.error = 'Connexion Google refusée (' + e.code + ').'; changed('error'); } });
    } catch (e) {
      console.warn('[Online] Firebase indisponible — le jeu reste en solo.', e && e.message);
      O.mode = 'off'; O.error = 'Firebase n’a pas pu être chargé (réseau ou configuration). Le jeu solo fonctionne normalement.';
      fb = null; O.db = null;
    }
    changed('mode');
  }

  /** Coop locale (BroadcastChannel) : identité par onglet, sans compte */
  O.enableLocal = function () {
    if (O.mode === 'local') return true;
    if (O.mode === 'firebase') return false;
    const db = G.NetTransport && G.NetTransport.createLocal();
    if (!db) { O.error = 'BroadcastChannel indisponible dans ce navigateur.'; changed('error'); return false; }
    try { sessionStorage.setItem('donjon-net-local', '1'); } catch (_) { /* rien */ }
    let uid = null;
    try { uid = sessionStorage.getItem('donjon-net-uid'); } catch (_) { /* rien */ }
    if (!uid) { uid = 'L' + rid(9); try { sessionStorage.setItem('donjon-net-uid', uid); } catch (_) { /* rien */ } }
    O.db = db; O.mode = 'local'; O.error = null;
    O.user = { uid, name: null, photo: null, local: true };
    O.me = { name: null, code: uid.slice(1, 7), guildId: null };
    startPresence();
    watchInvites();
    changed('mode');
    return true;
  };

  // ------------------------------------------------------------------
  // AUTH (Firebase)
  // ------------------------------------------------------------------
  O.signIn = async function () {
    if (O.mode !== 'firebase' || !fb) { toast('Mode en ligne non configuré.'); return false; }
    const prov = new firebase.auth.GoogleAuthProvider();
    try { await fb.auth.signInWithPopup(prov); return true; }
    catch (e) {
      const c = e && e.code;
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment' || c === 'auth/cancelled-popup-request') {
        try { await fb.auth.signInWithRedirect(prov); return true; } catch (e2) { O.error = 'Connexion impossible (' + (e2.code || e2.message) + ').'; }
      } else if (c !== 'auth/popup-closed-by-user') O.error = 'Connexion impossible (' + (c || e.message) + ').';
      changed('error'); return false;
    }
  };
  O.signOut = async function () {
    if (!fb) return;
    await leaveLobby().catch(() => {});
    try { if (O.user) await O.db.set('status/' + O.user.uid, { state: 'offline', last: O.db.serverTS() }); } catch (_) { /* rien */ }
    await fb.auth.signOut();
  };

  let socialOff = [];
  function stopSocial() { socialOff.forEach(f => { try { f(); } catch (_) { /* rien */ } }); socialOff = []; }
  async function onAuth(u) {
    stopSocial();
    if (!u) { O.user = null; O.me = null; O.friends = []; O.requests = []; O.invites = []; O.guild = null; O.guildMembers = []; O.chat = []; changed('auth'); return; }
    O.user = { uid: u.uid, name: cleanName(u.displayName || 'Joueur'), photo: u.photoURL || null };
    O.error = null;
    await ensureUserDoc();
    startPresence();
    watchInvites();
    watchFriends();
    watchMe();
    changed('auth');
  }

  // ------------------------------------------------------------------
  // PROFIL Firestore users/{uid} + code ami (codes/{code})
  // ------------------------------------------------------------------
  const FV = () => firebase.firestore.FieldValue;
  async function ensureUserDoc() {
    const ref = fb.fs.collection('users').doc(O.user.uid);
    const snap = await ref.get();
    let data = snap.exists ? snap.data() : null;
    if (!data || !data.code) {
      let code = null;
      for (let i = 0; i < 6 && !code; i++) {
        const c = rid(6);
        try { await fb.fs.collection('codes').doc(c).set({ uid: O.user.uid }); code = c; } catch (e) { /* code déjà pris → on réessaie */ }
      }
      if (!code) throw new Error('impossible de réserver un code ami');
      const hi = heroInfo();
      data = Object.assign({ name: hi.name || O.user.name, guildId: null }, data || {}, { code });
      await ref.set(Object.assign({}, data, { classe: hi.classe, rank: hi.rank, niveau: hi.niveau, skin: hi.skin, photo: O.user.photo || null, updated: FV().serverTimestamp() }), { merge: true });
    }
    O.me = data;
    syncProfileSoon();
  }
  function watchMe() {
    const off = fb.fs.collection('users').doc(O.user.uid).onSnapshot(s => {
      O.me = s.exists ? s.data() : O.me;
      watchGuild(O.me && O.me.guildId);
      changed('me');
    }, e => console.warn('[Online] profil', e && e.code));
    socialOff.push(off);
  }
  let syncT = 0;
  function syncProfileSoon() {
    clearTimeout(syncT);
    syncT = setTimeout(() => {
      if (O.mode !== 'firebase' || !O.user || !profile()) return;
      const hi = heroInfo();
      fb.fs.collection('users').doc(O.user.uid).set({ classe: hi.classe, rank: hi.rank, niveau: hi.niveau, skin: hi.skin, updated: FV().serverTimestamp() }, { merge: true }).catch(e => console.warn('[Online] synchro profil', e && e.code));
      updatePresence();
    }, 1500);
  }
  O.setPseudo = async function (name) {
    name = cleanName(name);
    if (name.length < 3) { toast('Pseudo trop court (3 caractères minimum).'); return false; }
    if (O.mode === 'local') { O.me.name = name; updatePresence(); changed('me'); return true; }
    if (!O.user) return false;
    await fb.fs.collection('users').doc(O.user.uid).set({ name, updated: FV().serverTimestamp() }, { merge: true });
    if (O.me && O.me.guildId) fb.fs.collection('guilds').doc(O.me.guildId).collection('members').doc(O.user.uid).update({ name }).catch(() => {});
    updatePresence();
    return true;
  };

  // ------------------------------------------------------------------
  // PRÉSENCE /status/{uid}
  // ------------------------------------------------------------------
  let presT = 0, presOff = null, inGameFlag = false;
  function presenceVal() {
    const hi = heroInfo();
    return { state: 'online', name: hi.name, classe: hi.classe, rank: hi.rank, niveau: hi.niveau, inGame: !!inGameFlag, last: O.db.kind === 'firebase' ? O.db.serverTS() : Date.now() };
  }
  function updatePresence() { if (O.db && O.user) O.db.set('status/' + O.user.uid, presenceVal()).catch(() => {}); }
  function startPresence() {
    if (!O.db || !O.user) return;
    const path = 'status/' + O.user.uid;
    if (O.db.kind === 'firebase') {
      if (presOff) presOff();
      presOff = O.db.watch('.info/connected', c => {
        if (!c) return;
        O.db.onDisconnectSet(path, { state: 'offline', name: pseudo(), last: O.db.serverTS() }).then(updatePresence).catch(() => {});
      });
    } else {
      O.db.onDisconnectRemove(path);
      updatePresence();
      clearInterval(presT);
      presT = setInterval(updatePresence, 4000);       // battement : un onglet fermé brutalement devient « hors ligne »
      // en local, les « amis » sont les autres onglets du navigateur
      O.db.watch('status', all => {
        const now = Date.now(), list = [];
        Object.keys(all || {}).forEach(uid => {
          if (uid === O.user.uid) return;
          const s = all[uid] || {};
          const online = s.state === 'online' && now - num(s.last, 0) < 12000;
          list.push({ uid, name: cleanName(s.name), classe: s.classe, rank: s.rank, niveau: s.niveau, online, inGame: !!s.inGame });
        });
        diffOnline(list);
        O.friends = list; changed('friends');
      });
    }
  }
  const wasOnline = {};
  function diffOnline(list) {
    list.forEach(f => {
      if (wasOnline[f.uid] === false && f.online) notify({ icon: '🟢', title: f.name + ' est en ligne', kind: 'friend' });
      wasOnline[f.uid] = !!f.online;
    });
  }

  // ------------------------------------------------------------------
  // AMIS (Firestore) : users/{uid}/requests/{from}, users/{uid}/friends/{fid}
  // ------------------------------------------------------------------
  const friendWatch = {};
  function watchFriends() {
    const me = fb.fs.collection('users').doc(O.user.uid);
    socialOff.push(me.collection('requests').onSnapshot(s => {
      const old = new Set(O.requests.map(r => r.uid));
      O.requests = s.docs.map(d => ({ uid: d.id, name: cleanName(d.data().name) }));
      O.requests.forEach(r => { if (!old.has(r.uid) && O._reqLoaded) notify({ icon: '👋', title: 'Demande d’ami', text: r.name + ' veut devenir ton ami.', kind: 'request' }); });
      O._reqLoaded = true;
      changed('requests');
    }, e => console.warn('[Online] demandes', e && e.code)));
    socialOff.push(me.collection('friends').onSnapshot(s => {
      const ids = new Set(s.docs.map(d => d.id));
      Object.keys(friendWatch).forEach(uid => { if (!ids.has(uid)) { friendWatch[uid](); delete friendWatch[uid]; } });
      const keep = O.friends.filter(f => ids.has(f.uid));
      ids.forEach(uid => {
        if (!keep.some(f => f.uid === uid)) keep.push({ uid, name: '…', online: false, inGame: false });
        if (!friendWatch[uid]) friendWatch[uid] = watchFriend(uid);
      });
      O.friends = keep; changed('friends');
    }, e => console.warn('[Online] amis', e && e.code)));
    socialOff.push(() => { Object.keys(friendWatch).forEach(k => { friendWatch[k](); delete friendWatch[k]; }); });
  }
  function watchFriend(uid) {
    const upd = (patch) => { const f = O.friends.find(x => x.uid === uid); if (f) { Object.assign(f, patch); changed('friends'); } };
    const a = fb.fs.collection('users').doc(uid).onSnapshot(s => { if (s.exists) { const d = s.data(); upd({ name: cleanName(d.name), classe: d.classe, rank: d.rank, niveau: d.niveau }); } }, () => {});
    const b = O.db.watch('status/' + uid, st => {
      const online = !!(st && st.state === 'online');
      const f = O.friends.find(x => x.uid === uid);
      if (f && f.online === false && online && f._seen) notify({ icon: '🟢', title: (f.name || 'Un ami') + ' est en ligne', kind: 'friend' });
      upd({ online, inGame: !!(st && st.inGame), _seen: true });
    });
    return () => { a(); b(); };
  }
  O.addFriendByCode = async function (code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (O.mode !== 'firebase' || !O.user) { toast('Connecte-toi pour ajouter des amis.'); return false; }
    if (code.length !== 6) { toast('Un code ami fait 6 caractères.'); return false; }
    if (O.me && code === O.me.code) { toast('C’est ton propre code !'); return false; }
    const c = await fb.fs.collection('codes').doc(code).get();
    if (!c.exists) { toast('Code ami introuvable.'); return false; }
    const to = c.data().uid;
    if (O.friends.some(f => f.uid === to)) { toast('Vous êtes déjà amis.'); return false; }
    await fb.fs.collection('users').doc(to).collection('requests').doc(O.user.uid).set({ name: pseudo(), at: FV().serverTimestamp() });
    toast('Demande envoyée !');
    return true;
  };
  O.acceptFriend = async function (uid) {
    if (!O.user) return false;
    const b = fb.fs.batch(), u = fb.fs.collection('users');
    b.set(u.doc(O.user.uid).collection('friends').doc(uid), { since: FV().serverTimestamp() });
    b.set(u.doc(uid).collection('friends').doc(O.user.uid), { since: FV().serverTimestamp() });
    b.delete(u.doc(O.user.uid).collection('requests').doc(uid));
    await b.commit();
    toast('Nouvel ami ajouté !');
    return true;
  };
  O.declineFriend = async function (uid) { if (O.user) await fb.fs.collection('users').doc(O.user.uid).collection('requests').doc(uid).delete(); };
  O.removeFriend = async function (uid) {
    if (!O.user) return;
    const b = fb.fs.batch(), u = fb.fs.collection('users');
    b.delete(u.doc(O.user.uid).collection('friends').doc(uid));
    b.delete(u.doc(uid).collection('friends').doc(O.user.uid));
    await b.commit();
  };

  // ------------------------------------------------------------------
  // GUILDES : guilds/{gid}, guilds/{gid}/members/{uid}, guilds/{gid}/chat, guildCodes/{code}
  // ------------------------------------------------------------------
  let guildOff = [], guildId = null;
  const ROLES = ['chef', 'officier', 'membre'];
  function watchGuild(gid) {
    if (gid === guildId) return;
    guildOff.forEach(f => f()); guildOff = []; guildId = gid || null;
    O.guild = null; O.guildMembers = []; O.chat = [];
    if (!gid) { changed('guild'); return; }
    const g = fb.fs.collection('guilds').doc(gid);
    guildOff.push(g.onSnapshot(s => { O.guild = s.exists ? Object.assign({ id: gid }, s.data()) : null; changed('guild'); },
      () => { O.guild = null; changed('guild'); }));
    const presence = {};
    guildOff.push(g.collection('members').onSnapshot(s => {
      if (!s.docs.some(d => d.id === O.user.uid)) {     // exclu (ou guilde dissoute) : on nettoie le profil
        fb.fs.collection('users').doc(O.user.uid).set({ guildId: null }, { merge: true }).catch(() => {});
        return;
      }
      O.guildMembers = s.docs.map(d => { const x = d.data(); return { uid: d.id, name: cleanName(x.name), role: ROLES.indexOf(x.role) >= 0 ? x.role : 'membre', online: presence[d.id] || false }; })
        .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
      O.guildMembers.forEach(m => {
        if (presence[m.uid] !== undefined || m.uid === O.user.uid) return;
        presence[m.uid] = false;
        guildOff.push(O.db.watch('status/' + m.uid, st => { presence[m.uid] = !!(st && st.state === 'online'); const mm = O.guildMembers.find(x => x.uid === m.uid); if (mm) { mm.online = presence[m.uid]; changed('guild'); } }));
      });
      changed('guild');
    }, () => {}));
    guildOff.push(g.collection('chat').orderBy('at', 'desc').limit(50).onSnapshot(s => {
      O.chat = s.docs.map(d => { const x = d.data(); return { id: d.id, uid: x.uid, name: cleanName(x.name), text: String(x.text || '').slice(0, 200), at: x.at && x.at.toMillis ? x.at.toMillis() : Date.now() }; }).reverse();
      changed('chat');
    }, () => {}));
  }
  function myRole() { const m = O.guildMembers.find(x => O.user && x.uid === O.user.uid); return m ? m.role : null; }
  O.myGuildRole = myRole;
  O.createGuild = async function (name, tag) {
    if (O.mode !== 'firebase' || !O.user) { toast('Connecte-toi pour créer une guilde.'); return false; }
    name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim();
    tag = String(tag || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (name.length < 3 || name.length > 24) { toast('Nom de guilde : 3 à 24 caractères.'); return false; }
    if (tag.length < 3 || tag.length > 4) { toast('Tag : 3 ou 4 lettres ou chiffres.'); return false; }
    if (O.me && O.me.guildId) { toast('Quitte d’abord ta guilde actuelle.'); return false; }
    const g = fb.fs.collection('guilds').doc();
    const code = rid(6);
    const b = fb.fs.batch(), ts = FV().serverTimestamp();
    b.set(g, { name, tag, code, leader: O.user.uid, created: ts });
    b.set(g.collection('members').doc(O.user.uid), { name: pseudo(), role: 'chef', code, joined: ts, lastMsg: ts });
    b.set(fb.fs.collection('guildCodes').doc(code), { gid: g.id });
    b.set(fb.fs.collection('users').doc(O.user.uid), { guildId: g.id }, { merge: true });
    await b.commit();
    toast('Guilde [' + tag + '] créée !');
    return true;
  };
  O.joinGuild = async function (code) {
    if (O.mode !== 'firebase' || !O.user) { toast('Connecte-toi pour rejoindre une guilde.'); return false; }
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (O.me && O.me.guildId) { toast('Quitte d’abord ta guilde actuelle.'); return false; }
    const c = await fb.fs.collection('guildCodes').doc(code).get();
    if (!c.exists) { toast('Code de guilde introuvable.'); return false; }
    const gid = c.data().gid, ts = FV().serverTimestamp();
    const b = fb.fs.batch();
    b.set(fb.fs.collection('guilds').doc(gid).collection('members').doc(O.user.uid), { name: pseudo(), role: 'membre', code, joined: ts, lastMsg: ts });
    b.set(fb.fs.collection('users').doc(O.user.uid), { guildId: gid }, { merge: true });
    await b.commit();
    toast('Bienvenue dans la guilde !');
    return true;
  };
  O.leaveGuild = async function () {
    if (!O.user || !O.guild) return false;
    const g = fb.fs.collection('guilds').doc(O.guild.id), b = fb.fs.batch();
    const others = O.guildMembers.filter(m => m.uid !== O.user.uid);
    if (myRole() === 'chef') {
      if (others.length) {        // le chef transmet la guilde avant de partir (officier d'abord, sinon le plus ancien listé)
        const heir = others.find(m => m.role === 'officier') || others[0];
        b.update(g.collection('members').doc(heir.uid), { role: 'chef' });
        b.update(g, { leader: heir.uid });
      } else {
        b.delete(g);
        b.delete(fb.fs.collection('guildCodes').doc(O.guild.code));
      }
    }
    b.delete(g.collection('members').doc(O.user.uid));
    b.set(fb.fs.collection('users').doc(O.user.uid), { guildId: null }, { merge: true });
    await b.commit();
    toast('Tu as quitté la guilde.');
    return true;
  };
  O.kickMember = async function (uid) {
    if (!O.guild || myRole() !== 'chef' || uid === O.user.uid) return false;
    await fb.fs.collection('guilds').doc(O.guild.id).collection('members').doc(uid).delete();
    return true;
  };
  O.setMemberRole = async function (uid, role) {
    if (!O.guild || myRole() !== 'chef' || uid === O.user.uid || (role !== 'officier' && role !== 'membre')) return false;
    await fb.fs.collection('guilds').doc(O.guild.id).collection('members').doc(uid).update({ role });
    return true;
  };
  const chatLog = [];
  O.sendChat = async function (text) {
    if (!O.guild || !O.user) return false;
    text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!text) return false;
    const now = Date.now();
    while (chatLog.length && now - chatLog[0].t > 15000) chatLog.shift();
    if (chatLog.length && now - chatLog[chatLog.length - 1].t < 2100) { toast('Doucement ! Attends un peu avant le prochain message.'); return false; }
    if (chatLog.length >= 5) { toast('Trop de messages : patiente quelques secondes.'); return false; }
    if (chatLog.length && chatLog[chatLog.length - 1].text === text) { toast('Message identique au précédent.'); return false; }
    chatLog.push({ t: now, text });
    const g = fb.fs.collection('guilds').doc(O.guild.id), ts = FV().serverTimestamp(), b = fb.fs.batch();
    b.set(g.collection('chat').doc(), { uid: O.user.uid, name: pseudo(), text, at: ts });
    b.update(g.collection('members').doc(O.user.uid), { lastMsg: ts });
    await b.commit();
    return true;
  };

  // ------------------------------------------------------------------
  // INVITATIONS /invites/{uid}/{lobbyId}
  // ------------------------------------------------------------------
  let invOff = null;
  function watchInvites() {
    if (invOff) invOff();
    if (!O.db || !O.user) return;
    const seen = new Set();
    invOff = O.db.watch('invites/' + O.user.uid, all => {
      const list = [];
      Object.keys(all || {}).forEach(lid => {
        const v = all[lid] || {};
        if (Date.now() - num(v.at, Date.now()) > 10 * 60000) return;     // invitation périmée
        list.push({ lobbyId: lid, from: v.from, name: cleanName(v.name) });
        if (!seen.has(lid)) { seen.add(lid); notify({ icon: '⚔️', title: 'Invitation de groupe', text: cleanName(v.name) + ' t’invite dans son groupe.', kind: 'invite', lobbyId: lid }); }
      });
      O.invites = list; changed('invites');
    });
  }

  // ------------------------------------------------------------------
  // GROUPE /lobbies/{id}
  // ------------------------------------------------------------------
  let lobbyOff = null, lastLaunchN = 0;
  const L = id => 'lobbies/' + id;
  function memberEntry(slot) {
    const hi = heroInfo();
    return { name: hi.name, classe: hi.classe, rank: hi.rank, niveau: hi.niveau, skin: hi.skin || null, slot, ready: false, ok: true, reason: '', at: Date.now() };
  }
  function needOnline() {
    if (!O.db || !O.user) { toast(O.mode === 'firebase' ? 'Connecte-toi d’abord.' : 'Mode en ligne indisponible.'); return false; }
    if (!profile()) { toast('Crée d’abord un héros.'); return false; }
    return true;
  }
  O.createLobby = async function () {
    if (!needOnline()) return false;
    if (O.lobby) return true;
    const id = rid(8);
    await O.db.set(L(id), { leader: O.user.uid, state: 'open', created: Date.now(), members: { [O.user.uid]: memberEntry(0) } });
    attachLobby(id);
    return true;
  };
  O.invite = async function (uid) {
    if (!needOnline()) return false;
    if (!O.lobby) await O.createLobby();
    const n = Object.keys(O.lobby && O.lobby.members || {}).length;
    if (n >= MAX_PLAYERS) { toast('Groupe complet (4 joueurs max).'); return false; }
    await O.db.set('invites/' + uid + '/' + O.lobby.id, { from: O.user.uid, name: pseudo(), at: Date.now() });
    toast('Invitation envoyée.');
    return true;
  };
  O.acceptInvite = async function (lobbyId) {
    if (!needOnline()) return false;
    if (O.session) { toast('Termine d’abord ton donjon en cours.'); return false; }
    if (O.lobby && O.lobby.id !== lobbyId) await leaveLobby();
    const lb = await O.db.get(L(lobbyId)).catch(() => null);
    if (!lb || !lb.members) { toast('Ce groupe n’existe plus.'); await O.declineInvite(lobbyId); return false; }
    const used = Object.keys(lb.members).map(k => lb.members[k].slot);
    if (used.length >= MAX_PLAYERS) { toast('Groupe complet.'); await O.declineInvite(lobbyId); return false; }
    if (lb.state === 'ingame') { toast('Le groupe est déjà en donjon : réessaie à la fin.'); return false; }
    let slot = 0; while (used.indexOf(slot) >= 0) slot++;
    await O.db.set(L(lobbyId) + '/members/' + O.user.uid, memberEntry(slot));
    await O.db.remove('invites/' + O.user.uid + '/' + lobbyId).catch(() => {});
    attachLobby(lobbyId);
    return true;
  };
  O.declineInvite = lobbyId => O.db ? O.db.remove('invites/' + O.user.uid + '/' + lobbyId).catch(() => {}) : Promise.resolve();
  function attachLobby(id) {
    if (lobbyOff) lobbyOff();
    O.lobby = { id, members: {} };
    O.db.onDisconnectRemove(L(id) + '/members/' + O.user.uid);
    lastLaunchN = 0;
    let first = true;
    lobbyOff = O.db.watch(L(id), v => {
      if (!v || !v.members || !v.members[O.user.uid]) {
        if (!first || !v) { detachLobby(); if (!O.session) toast('Tu as quitté le groupe.'); }
        return;
      }
      first = false;
      // chef absent (déconnecté) : le joueur au plus petit emplacement reprend le groupe
      if (!v.members[v.leader]) {
        const next = Object.keys(v.members).sort((a, b) => v.members[a].slot - v.members[b].slot)[0];
        if (next === O.user.uid) O.db.set(L(id) + '/leader', O.user.uid).catch(() => {});
      }
      O.lobby = Object.assign({ id }, v);
      checkPortalAccess();
      const ln = v.launch && num(v.launch.n, 0);
      if (v.state === 'ingame' && ln && ln !== lastLaunchN && !O.session) { lastLaunchN = ln; startSession(v.launch); }
      changed('lobby');
    });
    changed('lobby');
  }
  function detachLobby() {
    if (lobbyOff) lobbyOff(); lobbyOff = null;
    if (O.lobby && O.db && O.db.cancelDisconnect) O.db.cancelDisconnect(L(O.lobby.id) + '/members/' + O.user.uid);
    O.lobby = null; changed('lobby');
  }
  async function leaveLobby() {
    if (!O.lobby || !O.db) return;
    const id = O.lobby.id, lb = O.lobby;
    if (O.session) endSession('leave');
    const others = Object.keys(lb.members || {}).filter(k => k !== O.user.uid);
    detachLobby();
    if (!others.length) await O.db.remove(L(id)).catch(() => {});
    else {
      await O.db.remove(L(id) + '/members/' + O.user.uid).catch(() => {});
      if (lb.leader === O.user.uid) await O.db.set(L(id) + '/leader', others.sort((a, b) => lb.members[a].slot - lb.members[b].slot)[0]).catch(() => {});
    }
  }
  O.leaveLobby = leaveLobby;
  O.isLeader = () => !!(O.lobby && O.user && O.lobby.leader === O.user.uid);
  O.setReady = function (b) {
    if (!O.lobby) return Promise.resolve(false);
    return O.db.update(L(O.lobby.id) + '/members/' + O.user.uid, { ready: !!b, at: Date.now() });
  };
  function lobbyPortal() { try { return O.lobby && O.lobby.portal ? JSON.parse(O.lobby.portal) : null; } catch (_) { return null; } }
  O.lobbyPortal = lobbyPortal;
  let lastAccess = '';
  /** Chaque joueur vérifie LUI-MÊME les règles de rang du portail choisi et publie le résultat */
  function checkPortalAccess() {
    const pt = lobbyPortal();
    const res = pt ? G.game.net.checkEntry(pt) : { ok: true, reason: '' };
    const sig = (pt ? pt.id : '-') + '|' + res.ok + '|' + res.reason;
    const m = O.lobby.members[O.user.uid];
    if (sig === lastAccess && m && m.ok === !!res.ok) return;
    lastAccess = sig;
    const hi = heroInfo();
    O.db.update(L(O.lobby.id) + '/members/' + O.user.uid, { ok: !!res.ok, reason: String(res.reason || '').slice(0, 120), classe: hi.classe, rank: hi.rank, niveau: hi.niveau, skin: hi.skin || null, name: hi.name }).catch(() => {});
  }
  O.choosePortal = async function (portal) {
    if (!O.isLeader()) { toast('Seul le chef du groupe choisit le portail.'); return false; }
    const chk = G.game.net.checkEntry(portal);
    if (!chk.ok) { toast(chk.reason); return false; }
    const s = JSON.stringify(portal);
    if (s.length > 20000) { toast('Portail trop volumineux.'); return false; }
    await O.db.set(L(O.lobby.id) + '/portal', s);
    const upd = {};
    Object.keys(O.lobby.members).forEach(k => { upd[k + '/ready'] = false; });
    if (O.db.kind === 'local') Object.keys(O.lobby.members).forEach(k => O.db.set(L(O.lobby.id) + '/members/' + k + '/ready', false));
    else await O.db.update(L(O.lobby.id) + '/members', upd).catch(() => {});
    return true;
  };
  O.canLaunch = function () {
    const lb = O.lobby;
    if (!lb || !O.isLeader()) return { ok: false, reason: 'Seul le chef peut lancer.' };
    const ms = Object.keys(lb.members || {}).map(k => Object.assign({ uid: k }, lb.members[k]));
    if (ms.length < 2) return { ok: false, reason: 'Il faut au moins 2 joueurs.' };
    if (!lobbyPortal()) return { ok: false, reason: 'Choisis un portail.' };
    const no = ms.find(m => !m.ok);
    if (no) return { ok: false, reason: no.name + ' : ' + (no.reason || 'accès refusé.') };
    const nr = ms.find(m => m.uid !== lb.leader && !m.ready);
    if (nr) return { ok: false, reason: nr.name + ' n’est pas prêt.' };
    return { ok: true, reason: '' };
  };
  O.launch = async function () {
    const c = O.canLaunch();
    if (!c.ok) { toast(c.reason); return false; }
    const portal = lobbyPortal();
    const dungeon = G.game.net.buildDungeon(portal);
    if (!dungeon) { toast('Donjon introuvable.'); return false; }
    const ds = JSON.stringify(dungeon);
    if (ds.length > 400000) { toast('Donjon trop volumineux pour le réseau.'); return false; }
    const n = (O.lobby.launch && num(O.lobby.launch.n, 0) || 0) + 1;
    await O.db.update(L(O.lobby.id), { state: 'ingame', launch: { n, host: O.user.uid, portal: JSON.stringify(portal), dungeon: ds, seed: num(portal.seed, 1), at: Date.now() } });
    return true;
  };

  // ------------------------------------------------------------------
  // SESSION COOP (en jeu)
  // ------------------------------------------------------------------
  const tmpV = () => (typeof THREE !== 'undefined' ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
  function heroOptsFor(classe, skin) {
    try {
      const C = G.Cosmetics, list = C && C.CATALOG && C.CATALOG.skins && C.CATALOG.skins[classe];
      const sk = skin && list ? list.find(s => s && s.id === skin) : null;
      return sk && C.heroOptionsFor ? (C.heroOptionsFor(classe, sk) || {}) : {};
    } catch (_) { return {}; }
  }
  function startSession(launch) {
    let dungeon = null, portal = null;
    try { dungeon = JSON.parse(launch.dungeon); portal = JSON.parse(launch.portal); } catch (_) { /* rien */ }
    if (!dungeon) { toast('Lancement impossible : donjon illisible.'); return; }
    const role = launch.host === O.user.uid ? 'host' : 'guest';
    const chk = G.game.net.checkEntry(portal);
    if (!chk.ok) { toast(chk.reason); leaveLobby(); return; }
    const id = O.lobby.id;
    const S = O.session = {
      id, role, host: launch.host, n: launch.n, others: new Map(), off: [], timers: [], wipeT: 0, cs: 0, lastSlot: null, revive: {}, ended: false,
      t0: perfNow(), mySlot: num(O.lobby.members[O.user.uid] && O.lobby.members[O.user.uid].slot, 0), count: Object.keys(O.lobby.members).length, hostSeenT: perfNow(),
    };
    Object.keys(O.lobby.members).forEach(uid => { if (uid !== O.user.uid) addOther(uid, O.lobby.members[uid]); });
    G.game.net.setRole(role, {
      hurtRemote(proxy, dmg, o) { pushEv({ k: 'hurt', to: proxy.uid, d: Math.round(dmg), el: o && o.element || null, sl: num(o && o.slow, 0) }); return true; },
      guestDamage(e, dealt, el, crit) { pushEv({ k: 'dmg', id: e.netId, d: Math.round(dealt), el: el || 'physique', c: crit ? 1 : 0 }); },
      door() { pushEv({ k: 'door' }); },
      down() { pushEv({ k: 'down' }); },
    }, () => {
      const out = [], ri = G.game.run ? G.game.run.roomIndex : -1;
      S.others.forEach(o => { if (o.proxy && o.st && o.st.ri === ri && !o.gone) out.push(o.proxy); });
      return out;
    });
    const ok = G.game.net.startCoop(dungeon, portal);
    if (!ok) { G.game.net.clear(); O.session = null; toast('Lancement impossible.'); return; }
    inGameFlag = true; updatePresence();
    // flux réseau
    S.off.push(O.db.watch(L(id) + '/st', all => onStates(all || {})));
    if (role === 'guest') S.off.push(O.db.watch(L(id) + '/snap', snap => { if (snap && O.session === S) { S.hostSeenT = perfNow(); G.game.net.applySnapshot(snap); } }));
    S.off.push(O.db.onEvent(L(id) + '/ev', ev => onEvent(ev)));
    O.db.onDisconnectRemove(L(id) + '/st/' + O.user.uid);
    S.timers.push(setInterval(sendState, Math.round(1000 / ST_HZ)));
    if (role === 'host') {
      S.timers.push(setInterval(() => { const s = G.game.net.snapshot(); if (s && O.session === S) { s.t = Date.now(); O.db.set(L(id) + '/snap', s).catch(() => {}); } }, Math.round(1000 / SNAP_HZ)));
      if (O.db.kind === 'firebase') S.timers.push(setInterval(pruneEvents, 10000));
    }
    S.timers.push(setInterval(checkStale, 1000));
    // bus du jeu
    const on = (ev, fn) => { if (G.bus) S.off.push(G.bus.on(ev, fn)); };
    on('roomStart', e => {
      if (O.session !== S) return;
      const p = G.game.net.player();
      if (p) { p.pos.x += (S.mySlot - (S.count - 1) / 2) * 1.4; }       // pas tous sur la même case
      if (role === 'host') { const rd = G.game.net.roomData(); const js = rd ? JSON.stringify(rd) : ''; pushEv({ k: 'room', i: e.index, rd: js && js.length < 60000 ? js : null }); }
    });
    on('roomCleared', e => { if (O.session === S && role === 'host') pushEv({ k: 'clear', i: e.index }); });
    on('skillCast', e => { if (O.session === S) { S.cs++; S.lastSlot = e && (e.slot || e.skill || e.id) ? String(e.slot || e.skill || e.id).slice(0, 24) : null; } });
    on('runEnd', e => {
      if (O.session !== S) return;
      if (role === 'host') pushEv({ k: 'end', v: e && e.victory ? 1 : 0, why: e && e.reason === 'abandon' ? 'hostleft' : '' });
      else if (e && e.reason === 'abandon') pushEv({ k: 'leave' });
      endSession(e && e.victory ? 'victory' : 'end');
    });
    sendState();
    changed('session');
  }
  function pushEv(o) {
    const S = O.session; if (!S || !O.db) return;
    o.f = O.user.uid; o.at = Date.now();
    O.db.push(L(S.id) + '/ev', o).catch(e => console.warn('[Online] événement refusé', e && e.code));
  }
  function pruneEvents() {
    const S = O.session; if (!S || O.db.kind !== 'firebase' || !fb) return;
    const cut = Date.now() - 15000;
    fb.rtdb.ref(L(S.id) + '/ev').orderByChild('at').endAt(cut).limitToFirst(200).once('value').then(s => { const u = {}; s.forEach(c => { u[c.key] = null; }); if (Object.keys(u).length) return fb.rtdb.ref(L(S.id) + '/ev').update(u); }).catch(() => {});
  }
  function sendState() {
    const S = O.session; if (!S) return;
    const st = G.game.net.localState();
    if (!st) return;
    st.cs = S.cs; st.sl = S.lastSlot; st.t = Date.now();
    O.db.set(L(S.id) + '/st/' + O.user.uid, st).catch(() => {});
  }
  function addOther(uid, m) {
    const S = O.session;
    const o = { uid, info: m || {}, st: null, lastT: perfNow(), avatar: null, proxy: null, gone: false, cs: 0, atkT: 0, label: null };
    S.others.set(uid, o);
    return o;
  }
  function ensureAvatar(o) {
    if (o.avatar || typeof THREE === 'undefined' || !G.core || !G.core.scene) return;
    let hero = null;
    try { hero = G.GFX && G.GFX.makeHero ? G.GFX.makeHero(o.info.classe || 'Guerrier', heroOptsFor(o.info.classe, o.info.skin)) : null; } catch (e) { console.warn('[Online] makeHero', e); }
    if (!hero) { hero = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8), new THREE.MeshStandardMaterial({ color: 0x46d4ff })); hero.position.y = 0.9; }
    hero.userData = hero.userData || {};
    hero.userData.netAvatar = o.uid;
    G.core.scene.add(hero);
    o.avatar = hero;
    const ud = hero.userData;
    o.proxy = { remote: true, uid: o.uid, pos: hero.position, r: num(ud.radius, 0.5), height: num(ud.height, 1.9), dead: false, face: { x: 0, z: -1 }, dir: tmpV(), pv: 1, pvMax: 1, invuln: 0, dashInvuln: 0, stats: {}, hero };
    if (G.OnlineUI && G.OnlineUI.attachName) o.label = G.OnlineUI.attachName(o);
  }
  function dropAvatar(o) {
    if (o.avatar && o.avatar.parent) o.avatar.parent.remove(o.avatar);
    if (o.label) { try { o.label.remove(); } catch (_) { /* rien */ } }
    o.avatar = null; o.proxy = null; o.label = null;
  }
  function onStates(all) {
    const S = O.session; if (!S) return;
    const t = perfNow();
    Object.keys(all).forEach(uid => {
      if (uid === O.user.uid) return;
      const st = all[uid]; if (!st || typeof st !== 'object') return;
      let o = S.others.get(uid);
      if (!o) o = addOther(uid, (O.lobby && O.lobby.members && O.lobby.members[uid]) || {});
      if (o.gone) return;
      const prev = o.st;
      o.st = st; o.lastT = t;
      if (uid === S.host) S.hostSeenT = t;
      ensureAvatar(o);
      if (o.proxy) {
        o.proxy.dead = !!st.dead; o.proxy.pv = num(st.pv, 1); o.proxy.pvMax = Math.max(1, num(st.pvMax, 1));
        const ry = num(st.ry, 0); o.proxy.face.x = Math.sin(ry); o.proxy.face.z = Math.cos(ry);
        if (o.proxy.dir && o.proxy.dir.set) o.proxy.dir.set(o.proxy.face.x, 0, o.proxy.face.z);
        if (!prev) { o.avatar.position.x = num(st.x, 0); o.avatar.position.z = num(st.z, 0); }
      }
      if (prev && num(st.cs, 0) > num(prev.cs, 0)) o.atkT = 0.3;     // sort lancé : animation d'attaque
      if (prev && !prev.dead && st.dead) notify({ icon: '💀', title: cleanName(o.info.name) + ' est à terre', text: 'Approche-toi pour le réanimer.', kind: 'down' });
    });
    // joueur retiré du flux (onglet fermé, onDisconnect) : déconnexion
    S.others.forEach((o, uid) => { if (o.st && !all[uid] && !o.gone) lost(o); });
  }
  function lost(o) {
    const S = O.session; if (!S || o.gone) return;
    o.gone = true;
    dropAvatar(o);
    if (o.uid === S.host && S.role === 'guest') {
      toast('L’hôte s’est déconnecté : fin de la partie (sans pénalité).');
      const r = G.game.run; if (r) r.netNoPenalty = true;
      G.game.net.finish(false);
    } else toast(cleanName(o.info.name) + ' s’est déconnecté.');
    changed('session');
  }
  function checkStale() {
    const S = O.session; if (!S) return;
    const t = perfNow();
    S.others.forEach(o => { if (!o.gone && o.st && t - o.lastT > STALE_MS) lost(o); });
    if (S.role === 'guest' && t - S.hostSeenT > STALE_MS * 1.5 && !S.others.get(S.host)) {      // hôte jamais vu
      const r = G.game.run; if (r) r.netNoPenalty = true;
      toast('Hôte injoignable : fin de la partie.'); G.game.net.finish(false);
    }
  }
  function onEvent(ev) {
    const S = O.session;
    if (!S || !ev || typeof ev !== 'object' || ev.f === O.user.uid) return;
    if (num(ev.at, 0) && Date.now() - ev.at > 20000) return;      // trop ancien
    const fromHost = ev.f === S.host;
    switch (ev.k) {
      case 'dmg': if (S.role === 'host') G.game.net.applyRemoteDamage(String(ev.id), num(ev.d, 0), ev.el, !!ev.c); break;
      case 'hurt': if (fromHost && ev.to === O.user.uid) G.game.net.hurtLocal(num(ev.d, 0), { element: ev.el || 'physique', slow: num(ev.sl, 0), source: 'net' }); break;
      case 'door': if (S.role === 'host') G.game.net.door(); break;
      case 'room': if (fromHost) { let rd = null; try { rd = ev.rd ? JSON.parse(ev.rd) : null; } catch (_) { rd = null; } G.game.net.gotoRoom(num(ev.i, -1), rd); } break;
      case 'clear': if (fromHost && G.game.run && G.game.run.roomIndex === ev.i) G.game.net.clearRoom(); break;
      case 'end':
        if (fromHost) {
          if (ev.why === 'hostleft') { toast('L’hôte a quitté le donjon.'); const r = G.game.run; if (r) r.netNoPenalty = true; }
          G.game.net.finish(!!ev.v);
        }
        break;
      case 'revive': if (ev.to === O.user.uid && G.game.net.revive(0.35)) toast('Un allié t’a réanimé !'); break;
      case 'leave': { const o = S.others.get(ev.f); if (o) lost(o); break; }
      default: break;
    }
  }
  function endSession(why) {
    const S = O.session; if (!S) return;
    S.ended = true;
    S.timers.forEach(t => clearInterval(t));
    S.off.forEach(f => { try { f(); } catch (_) { /* rien */ } });
    S.others.forEach(o => dropAvatar(o));
    if (O.db) {
      O.db.remove(L(S.id) + '/st/' + O.user.uid).catch(() => {});
      if (S.role === 'host') { O.db.remove(L(S.id) + '/snap').catch(() => {}); O.db.remove(L(S.id) + '/ev').catch(() => {}); }
    }
    G.game.net.clear();
    O.session = null;
    inGameFlag = false; updatePresence();
    // le groupe reste formé : le chef rouvre le salon pour un prochain portail
    if (O.lobby && O.isLeader()) O.db.update(L(S.id), { state: 'open' }).catch(() => {});
    if (O.lobby) O.setReady(false).catch(() => {});
    changed('session');
    void why;
  }
  O.quitSession = function () {
    if (!O.session) return;
    try { G.UI && G.UI.on && G.UI.on.quitDungeon ? G.UI.on.quitDungeon() : null; } catch (_) { /* rien */ }
    if (O.session) { if (O.session.role === 'host') pushEv({ k: 'end', v: 0, why: 'hostleft' }); else pushEv({ k: 'leave' }); endSession('quit'); }
  };

  // Image par image : avatars interpolés, réanimation, défaite commune
  function frame(dt) {
    const S = O.session;
    if (!S || !G.game.run) return;
    const run = G.game.run, me = run.player, ri = run.roomIndex, time = (G.core && G.core.time) || 0;
    const k = 1 - Math.exp(-dt * 12);
    let allDead = !!(me && me.dead), anyAlive = false;
    S.others.forEach(o => {
      if (o.gone || !o.avatar || !o.st) return;
      const st = o.st, a = o.avatar;
      const here = st.ri === ri;
      a.visible = here;
      if (!here) return;
      const ox = a.position.x, oz = a.position.z;
      a.position.x += (num(st.x, ox) - ox) * k; a.position.z += (num(st.z, oz) - oz) * k;
      const ry = num(st.ry, a.rotation.y);
      let d = ry - a.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      a.rotation.y += d * k;
      a.rotation.x += ((st.dead ? -Math.PI / 2 : 0) - a.rotation.x) * k;
      o.atkT = Math.max(0, o.atkT - dt);
      const opts = { moving: !!st.mv && !st.dead, windup: 0, attack: st.at || o.atkT > 0 ? Math.max(o.atkT / 0.3, st.at ? 0.6 : 0) : 0 };
      const ud = a.userData || {};
      try { if (typeof ud.animate === 'function') ud.animate(time, opts); else if (G.GFX && G.GFX.animateCharacter) G.GFX.animateCharacter(a, time, opts); } catch (_) { /* rien */ }
      if (st.dead) { /* compte pour la défaite commune */ } else { allDead = false; anyAlive = true; }
      // réanimation : je suis vivant et proche d'un allié à terre
      if (st.dead && me && !me.dead) {
        const dist = Math.hypot(me.pos.x - a.position.x, me.pos.z - a.position.z);
        if (dist < 1.9) {
          S.revive[o.uid] = (S.revive[o.uid] || 0) + dt;
          if (S.revive[o.uid] >= 2.2) { S.revive[o.uid] = -3; pushEv({ k: 'revive', to: o.uid }); toast('Tu réanimes ' + cleanName(o.info.name) + ' !'); }
        } else if (S.revive[o.uid] > 0) S.revive[o.uid] = Math.max(0, S.revive[o.uid] - dt * 2);
        else if (S.revive[o.uid] < 0) S.revive[o.uid] = Math.min(0, S.revive[o.uid] + dt);
      } else S.revive[o.uid] = 0;
    });
    void anyAlive;
    if (S.role === 'host' && me && !run.finished && !run.ended) {
      S.wipeT = allDead ? S.wipeT + dt : 0;
      if (S.wipeT > 1.2) { S.wipeT = -99; G.game.net.wipe(); }
    }
    if (G.OnlineUI && G.OnlineUI.frame) G.OnlineUI.frame(S, dt);
  }
  O.reviveProgress = () => { const S = O.session; if (!S) return null; let best = null; Object.keys(S.revive).forEach(k => { if (S.revive[k] > 0 && (!best || S.revive[k] > best.t)) best = { uid: k, t: S.revive[k] / 2.2 }; }); return best; };
  O.members = function () {     // pour l'interface : membres du groupe triés
    const lb = O.lobby; if (!lb || !lb.members) return [];
    return Object.keys(lb.members).map(uid => Object.assign({ uid, me: O.user && uid === O.user.uid, leader: uid === lb.leader }, lb.members[uid])).sort((a, b) => num(a.slot, 0) - num(b.slot, 0));
  };

  // ------------------------------------------------------------------
  // Branchements
  // ------------------------------------------------------------------
  function boot() {
    try { if (G.core && G.core.onRender) G.core.onRender(dt => { try { frame(dt); } catch (e) { console.error('[Online] frame', e); } }); } catch (_) { /* rien */ }
    if (G.bus) {
      G.bus.on('profileChanged', () => { if (O.mode === 'firebase') syncProfileSoon(); else if (O.mode === 'local') updatePresence(); if (O.lobby) { lastAccess = ''; checkPortalAccess(); } });
      G.bus.on('runEnd', () => { if (O.mode === 'firebase') syncProfileSoon(); });
      G.bus.on('screen', e => { if (e && e.id === 'hub' && O.lobby) { lastAccess = ''; checkPortalAccess(); } });
    }
    init().catch(e => { console.warn('[Online] init', e); O.mode = 'off'; changed('mode'); });
  }
  O.init = init;
  O.ROLES = ROLES;
  O.MAX_PLAYERS = MAX_PLAYERS;
  O.esc = esc;
  G.Online = O;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
