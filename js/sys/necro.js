window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v3 « Éveil » — js/sys/necro.js   (rôle 12)  → G.Necro
   Rituel d'éveil (0,01 %), classe secrète Nécromancien, compétences,
   serviteurs (armée persistante), IA alliée, panneau « Armée ».

   ---------------------------------------------------------------------
   ÉQUILIBRAGE (documenté — à valider par le rôle 8)
   ---------------------------------------------------------------------
   Perso : 80 PV, 120 mana, int 12 (+1.5/niv). Projectile d'âme = 0.8 × int / 0.5 s
           (≈ 19 dps au niv 1, ≈ 55 % d'un Mage).
   Serviteur  : dmg = dmgK × int × RANK_MULT × (1 + 0.008 × (niveauServ-1)) × RAR_MULT × stats.minionDmg
                pv  = pvK × (50 + 8 × niveauPerso) × (mêmes multiplicateurs) × stats.minionPv
     RANK_MULT  E 1 · D 1.10 · C 1.20 · B 1.32 · A 1.45 · S 1.60      (plafond ×1.6)
     niv serv. 1→60 : +0.8 %/niv (plafond ×1.47) ; RAR_MULT commun 1 · rare 1.12 · légendaire 1.30
     → plafond absolu ≈ ×3.06 vs un serviteur E niv 1 commun (et il faut le grinder).
   DPS d'un serviteur commun E (× int) : guerrier .56 · archer .44 · mage .48 · colosse .39 ·
     chevalier .55 · bête .53 (+poison) · faucheur .75 · titan .67 (rare/légendaire ajoutent leur multiplicateur).
   Armée de départ (3 serviteurs ≈ 1.5 × int dps) + perso (1.6 × int) + Explosion (≈ 0.3 × int) ≈ 3.4 × int
     ≈ 100 % du dps d'un Mage (Boule de feu ≈ 3.3 × int équivalent) à équipement égal.
   Contraintes : perso fragile (80 PV), mana d'invocation, serviteurs tombés à relever (18 s − 2 s/niv Invocation),
     rang du serviteur ≤ rang du joueur + 1, 40 serviteurs max en réserve.
   Armée des morts : 4-6 soldats temporaires × (0.40 + 0.04/niv) de la puissance, 10-15 s, recharge 35 s
     → ≈ +0.6 serviteur-équivalent en moyenne (+20 %), hors cap.
   Souverain des Ombres : 12 s (+0.5/niv), recharge 60 s : serviteurs ×(1.30+0.04/niv), +5..7 gardes (×0.5+),
     perso +15 % dégâts ombre, soin 20 % PV. Uptime 20 % → ≈ +25 % dps moyen.
   Spécialisations : Légion (+1 cap, ×0.85 → puissance totale ×1.13) · Élite (-1 cap, ×1.5 → ×1.0, extraction +25 %).
   Cap : stats.minionCap de G.Stats.compute (base 3 de la classe + rang) ; ce fichier ajoute +1 par 10 niveaux,
     la spé, et Commandement (passif) via le hook 'stats'.
   Extraction manuelle : commun 25 %→41 % · élite 18 %→30 % · boss 20 %→36 % (niv 1→5) ; auto (fin de fenêtre) ×0.5.
   ===================================================================== */
(() => {
  'use strict';

  // =================================================================
  // Constantes
  // =================================================================
  const P_AWAKEN = 0.0001;                       // EXACTEMENT 1 / 10 000
  const RARITY_TEXT = '1 chance sur 10 000 (0,01 %)';
  const CLS = 'Necromancien';
  const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
  const RANK_COLORS = ['#9aa3ad', '#4fd17a', '#3fa9ff', '#b44dff', '#ff8a1a', '#ff3d3d'];
  const RANK_MULT = [1, 1.05, 1.10, 1.15, 1.20, 1.28];
  const RAR_MULT = { commun: 1, rare: 1.12, legendaire: 1.30 };
  const RAR_COLOR = { commun: '#b8c0cc', rare: '#3fa9ff', legendaire: '#ffb020' };
  const RAR_NAME = { commun: 'Commun', rare: 'Rare', legendaire: 'Légendaire' };
  const NECRO_BAL = 0.84;   // (v3 équilibrage) facteur global des dégâts de la classe (perso + serviteurs), calibré par simulation
  const ROSTER_MAX = 40;
  const TEMP_MINION = 'soldat_ombre';   // id invocable via G.SkillAPI.summon (dons, Armée des morts, Souverain)
  const SERV_MAX_LEVEL = 60;
  const HALF_DEFAULT = 13.2;

  const rnd = () => ((G.rng && typeof G.rng.float === 'function') ? G.rng.float() : Math.random());
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rankIdx = (r) => { const i = RANKS.indexOf(String(r || 'E').toUpperCase()); return i < 0 ? (String(r).toUpperCase() === 'SS' ? 5 : 0) : i; };
  const hasDOM = () => typeof document !== 'undefined' && document.body;
  const V3 = (x, y, z) => new window.THREE.Vector3(x, y, z);
  const isNecro = (p) => !!p && p.classe === CLS;
  const gameProfile = () => (G.game && G.game.profile) || null;
  const SA = () => G.SkillAPI;

  // =================================================================
  // Tirage d'éveil (LE seul endroit où la probabilité est évaluée)
  // =================================================================
  function draw() {
    const r = rnd();               // G.rng.float()
    return { won: r < P_AWAKEN, roll: r };
  }

  // état de la tentative gratuite de création quand aucun profil n'existe encore
  const creation = { used: false, won: false };

  // =================================================================
  // Profil
  // =================================================================
  function playerRankIdx(profile) {
    const r = profile && profile.rank;
    try { if (G.Ranks && typeof G.Ranks.index === 'function') return clamp(G.Ranks.index(r || 'E'), 0, 5); } catch (e) { /* secours */ }
    return rankIdx(r);
  }
  function specId(profile) { return profile && profile.skills && profile.skills.spec || null; }
  function skillLevel(profile, id) {
    // Source de vérité : G.Skills.levelOf (le kit de départ de la classe compte comme connu au niveau 1).
    try { if (G.Skills && G.Skills.levelOf) { const l = G.Skills.levelOf(profile, id); if (l > 0) return l; } } catch (e) { /* ignore */ }
    return (profile && profile.skills && profile.skills.levels && profile.skills.levels[id]) || 0;
  }

  function ensureProfile(profile) {
    if (!profile || typeof profile !== 'object') return profile;
    const a = profile.awakening = profile.awakening && typeof profile.awakening === 'object' ? profile.awakening : {};
    if (typeof a.rolls !== 'number') a.rolls = 0;
    if (typeof a.crystals !== 'number') a.crystals = 0;
    if (!Array.isArray(a.history)) a.history = [];
    if (typeof a.creationUsed !== 'boolean') a.creationUsed = false;
    if (typeof a.unlocked !== 'boolean') a.unlocked = false;
    if (typeof a.pending !== 'boolean') a.pending = false;
    const ar = profile.army = profile.army && typeof profile.army === 'object' ? profile.army : {};
    if (!Array.isArray(ar.minions)) ar.minions = [];
    if (!Array.isArray(ar.active)) ar.active = [];
    if (typeof ar.cap !== 'number') ar.cap = 3;
    const uids = {};
    ar.minions = ar.minions.filter(m => m && m.uid && CATS[m.cat] && !uids[m.uid] && (uids[m.uid] = true));
    ar.active = ar.active.filter((u, i, arr) => uids[u] && arr.indexOf(u) === i);
    if (isNecro(profile) && !ar.starterGiven) {
      ar.starterGiven = true;
      if (!ar.minions.length) {
        addServant(profile, { cat: 'guerrier', origin: 'Soldat des limbes' }, true);
        addServant(profile, { cat: 'archer', origin: 'Tireur des limbes' }, true);
      }
    }
    if (!profile.settings || typeof profile.settings !== 'object') profile.settings = {};
    return profile;
  }

  function persist(profile) {
    try { if (G.game && typeof G.game.saveProfile === 'function') G.game.saveProfile(); } catch (e) { /* ignore */ }
    try { G.bus && G.bus.emit('profileChanged', { profile }); } catch (e) { /* ignore */ }
  }

  // =================================================================
  // Rituel d'éveil
  // =================================================================
  function awakeningRoll(profile, source, opts) {
    opts = opts || {};
    source = source === 'cristal' ? 'cristal' : 'creation';
    const out = { won: false, roll: null, source, refused: false, reason: '', rarity: RARITY_TEXT, probability: P_AWAKEN };
    const hasProfile = profile && typeof profile === 'object';
    if (hasProfile) ensureProfile(profile);
    // --- coût / limites
    if (source === 'creation') {
      const used = hasProfile ? profile.awakening.creationUsed : creation.used;
      if (used) { out.refused = true; out.reason = 'Une seule tentative gratuite par création de personnage.'; return out; }
      if (hasProfile) profile.awakening.creationUsed = true; else creation.used = true;
    } else {
      if (!hasProfile) { out.refused = true; out.reason = 'Aucun personnage.'; return out; }
      const a = profile.awakening;
      if (a.crystals > 0) a.crystals--;        // source de vérité : awakening.crystals (l'inventaire recopie pour l'affichage)
      else { out.refused = true; out.reason = 'Aucun Cristal d\'éveil.'; return out; }
      try { const mats = profile.inventory && profile.inventory.materials; if (mats && mats.cristal_eveil != null) { mats.cristal_eveil = a.crystals; if (!a.crystals) delete mats.cristal_eveil; } } catch (e) { /* affichage seulement */ }
    }
    // --- tirage indépendant, aucune garantie
    const d = draw();
    out.won = d.won; out.roll = d.roll;
    if (hasProfile) {
      const a = profile.awakening;
      a.rolls++;
      a.history.push({ at: Date.now(), result: d.won ? 'won' : 'lost', source });
      if (a.history.length > 200) a.history.splice(0, a.history.length - 200);
    }
    out.message = d.won ? 'ÉVEIL INTERDIT — NÉCROMANCIEN' : 'Les morts restent silencieux… (' + RARITY_TEXT + ')';
    if (d.won) {
      if (hasProfile) { profile.awakening.unlocked = true; if (!isNecro(profile) && source === 'cristal') profile.awakening.pending = true; }
      else creation.won = true;
      if (hasProfile && !isNecro(profile) && source === 'creation' && profile.classe) profile.awakening.pending = true;
      try { G.bus && G.bus.emit('necroAwakened', { profile: hasProfile ? profile : null, source, roll: d.roll }); } catch (e) { /* ignore */ }
      if (!opts.silent) {
        out.announcement = announce().then(() => {
          if (hasProfile && profile.awakening.pending && !opts.noOffer) return offerConversion(profile);
          return false;
        });
      }
      if (hasProfile) persist(profile);
    } else if (hasProfile) persist(profile);
    return out;
  }

  function isUnlocked(profile) {
    if (profile) return !!(profile.awakening && profile.awakening.unlocked) || isNecro(profile);
    return creation.won;
  }
  function resetCreation() { creation.used = false; creation.won = false; }
  function creationState() { return { used: creation.used, won: creation.won }; }
  function pendingConversion(profile) { return !!(profile && profile.awakening && profile.awakening.pending && !isNecro(profile)); }

  // Conversion d'un personnage existant (garde niveau / rang / inventaire / or / armes)
  function convertToNecromancien(profile) {
    if (!profile || isNecro(profile)) return false;
    ensureProfile(profile);
    profile.classe = CLS;
    profile.awakening.pending = false; profile.awakening.unlocked = true;
    const sk = profile.skills = profile.skills || { levels: {}, points: 0, equipped: {}, spec: null };
    sk.levels = sk.levels || {};
    sk.equipped = { cast2: 'necro_invoke', cast3: 'necro_extract', super: 'necro_sovereign' };
    sk.spec = null;
    for (const id of ['necro_basic', 'necro_invoke', 'necro_extract']) sk.levels[id] = Math.max(1, sk.levels[id] || 0);   // v5 : l'ultime reste verrouillé jusqu'au niveau 5 (géré par G.Skills.levelOf)
    try { if (G.Skills && typeof G.Skills.respec === 'function') G.Skills.respec(profile); } catch (e) { /* ignore */ }
    profile.army.starterGiven = false;
    ensureProfile(profile);
    try { G.bus && G.bus.emit('classChanged', { profile, classe: CLS }); } catch (e) { /* ignore */ }
    persist(profile);
    try { G.UI && G.UI.refreshCamp && G.UI.refreshCamp(); } catch (e) { /* ignore */ }
    return true;
  }

  function offerConversion(profile) {
    if (!pendingConversion(profile)) return Promise.resolve(false);
    const ui = G.UI;
    if (ui && typeof ui.choice === 'function') {
      return Promise.resolve(ui.choice({
        title: 'ÉVEIL INTERDIT',
        options: [
          { label: 'Devenir Nécromancien', desc: 'Votre niveau, rang, inventaire et or sont conservés. Vos compétences de classe sont réinitialisées.', value: 'yes', icon: '💀' },
          { label: 'Refuser', desc: 'Vous restez ' + (profile.classe || 'ce que vous êtes') + '. Le pouvoir reviendra… peut-être.', value: 'no', icon: '✖' },
        ],
      })).then(v => { if (v === 'yes') return convertToNecromancien(profile); profile.awakening.pending = false; persist(profile); return false; }).catch(() => false);
    }
    return Promise.resolve(false);   // pas d'UI : la proposition reste « pending »
  }

  // =================================================================
  // Annonce plein écran
  // =================================================================
  let audioCtx = null;
  function playEerie() {
    try { if (G.sfx && !G.sfx.muted && typeof G.sfx.play === 'function') G.sfx.play('bossRoar'); } catch (e) { /* ignore */ }
    try {
      if (G.sfx && G.sfx.muted) return;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      audioCtx = audioCtx || new AC(); if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
      const t0 = audioCtx.currentTime, master = audioCtx.createGain();
      master.gain.setValueAtTime(0, t0); master.gain.linearRampToValueAtTime(0.22, t0 + 1.5); master.gain.linearRampToValueAtTime(0, t0 + 6.5);
      master.connect(audioCtx.destination);
      [55, 82.4, 110.7].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), l = audioCtx.createOscillator(), lg = audioCtx.createGain();
        o.type = i === 1 ? 'sawtooth' : 'sine'; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + 6);
        l.frequency.value = 0.4 + i * 0.3; lg.gain.value = f * 0.02; l.connect(lg); lg.connect(o.frequency);
        g.gain.value = 0.5 / (i + 1); o.connect(g); g.connect(master); o.start(t0); l.start(t0); o.stop(t0 + 6.6); l.stop(t0 + 6.6);
      });
      [880, 1318, 1760].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), st = t0 + 1.2 + i * 0.9;
        o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.06, st + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, st + 2.2);
        o.connect(g); g.connect(master); o.start(st); o.stop(st + 2.3);
      });
    } catch (e) { /* pas d'audio */ }
  }

  function announce() {
    if (!hasDOM()) return Promise.resolve();
    injectCSS();
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'necro-awaken';
      ov.innerHTML = '<canvas class="necro-awaken-cv"></canvas><div class="necro-awaken-frame"></div><div class="necro-awaken-txt"><div class="necro-awaken-sys">' + (ico('warning', 14) || '⚠') + ' Alerte système</div><div class="necro-awaken-sub">Un murmure répond depuis l\'au-delà…</div>' +
        '<div class="necro-awaken-title">ÉVEIL INTERDIT</div><div class="necro-awaken-cls">NÉCROMANCIEN</div><div class="necro-awaken-rar">' + RARITY_TEXT + '</div>' +
        '<div class="necro-awaken-hint">Touchez pour continuer</div></div>';
      document.body.appendChild(ov);
      const cv = ov.querySelector('canvas'), cx = cv.getContext && cv.getContext('2d');
      let raf = 0, done = false, t0 = performance.now();
      const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
      fit();
      const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
      const rs = []; for (let i = 0; i < 46; i++) rs.push({ x: Math.random(), y: Math.random(), s: 14 + Math.random() * 30, c: RUNES[Math.floor(Math.random() * RUNES.length)], p: Math.random() * 6.28, v: 0.01 + Math.random() * 0.03 });
      const frame = () => {
        if (done) return;
        const t = (performance.now() - t0) / 1000, w = cv.width, h = cv.height;
        if (cx) {
          cx.clearRect(0, 0, w, h);
          const g = cx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
          g.addColorStop(0, 'rgba(70,20,130,' + Math.min(0.5, t * 0.2) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
          cx.fillStyle = g; cx.fillRect(0, 0, w, h);
          cx.textAlign = 'center'; cx.textBaseline = 'middle';
          for (const r of rs) {
            const a = clamp(t * 0.5 - r.p * 0.1, 0, 1) * (0.25 + 0.2 * Math.sin(t * 1.5 + r.p * 3));
            cx.font = r.s + 'px serif'; cx.fillStyle = 'rgba(181,107,255,' + a.toFixed(3) + ')';
            cx.fillText(r.c, r.x * w, ((r.y - t * r.v) % 1 + 1) % 1 * h);
          }
          cx.strokeStyle = 'rgba(181,107,255,' + clamp(t * 0.3, 0, 0.6).toFixed(2) + ')'; cx.lineWidth = 2;
          for (let k = 0; k < 3; k++) { cx.beginPath(); cx.arc(w / 2, h / 2, Math.min(w, h) * (0.18 + k * 0.1) * (0.9 + 0.05 * Math.sin(t * 2 + k)), t * (k % 2 ? -0.4 : 0.4), t * (k % 2 ? -0.4 : 0.4) + 4.6 + k); cx.stroke(); }
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      requestAnimationFrame(() => ov.classList.add('on'));
      playEerie();
      const end = () => { if (done) return; done = true; cancelAnimationFrame(raf); ov.classList.remove('on'); ov.classList.add('off'); setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(); }, 700); };
      ov.addEventListener('click', end); ov.addEventListener('touchend', end);
      setTimeout(end, 9000);     // UI uniquement (pas de logique de jeu)
    });
  }

  // =================================================================
  // Catégories de serviteurs
  // =================================================================
  //  dmgK × int = dégâts par coup ; pvK × (50 + 8·niv) = PV ; speed u/s ; range ; atkCd s
  const CATS = {
    guerrier: { id: 'guerrier', name: 'Guerrier d\'ombre', icon: '⚔️', model: 'ombre_guerrier', role: 'Mêlée polyvalente', dmgK: 0.50, pvK: 1.0, speed: 5.0, range: 1.8, atkCd: 0.9, melee: true, abCd: 6, abName: 'Tourbillon', abDesc: 'Tourne sur lui-même : 120 % de dégâts autour de lui (rang D).',
      evo: ['Soldat d\'ombre', 'Fantassin spectral', 'Sentinelle des limbes', 'Lame-lige', 'Capitaine funeste', 'Général d\'outre-tombe'], w: 30 },
    archer: { id: 'archer', name: 'Archer d\'ombre', icon: '🏹', model: 'ombre_archer', role: 'Distance', dmgK: 0.42, pvK: 0.6, speed: 4.6, range: 9, atkCd: 0.95, ranged: true, abCd: 7, abName: 'Volée', abDesc: 'Tire 3 flèches en éventail (rang D).',
      evo: ['Tireur d\'ombre', 'Éclaireur fantôme', 'Arbalétrier spectral', 'Chasseur des limbes', 'Arc-noir', 'Tireur de l\'Abîme'], w: 20 },
    mage: { id: 'mage', name: 'Mage d\'ombre', icon: '🔮', model: 'ombre_mage', role: 'Distance — zone', dmgK: 0.62, pvK: 0.55, speed: 4.4, range: 8.5, atkCd: 1.3, ranged: true, abCd: 8, abName: 'Nova d\'ombre', abDesc: 'Explosion ralentissante sur la cible : 140 % (rang D).',
      evo: ['Adepte d\'ombre', 'Invocateur voilé', 'Mage de cendre', 'Occultiste', 'Archimage des limbes', 'Oracle funèbre'], w: 14 },
    colosse: { id: 'colosse', name: 'Colosse d\'ombre', icon: '🗿', model: 'ombre_colosse', role: 'Tank', dmgK: 0.70, pvK: 2.6, speed: 3.6, range: 2.2, atkCd: 1.8, melee: true, abCd: 7, abName: 'Fracas', abDesc: 'Frappe le sol : 130 % de dégâts et étourdit 0,8 s (rang D).',
      evo: ['Brute d\'ombre', 'Géant de brume', 'Colosse de pierre noire', 'Rempart spectral', 'Titan des limbes', 'Gardien de l\'abîme'], w: 10 },
    chevalier: { id: 'chevalier', name: 'Chevalier d\'ombre', icon: '🛡️', model: 'ombre_chevalier', role: 'Mêlée — assaut', dmgK: 0.55, pvK: 1.5, speed: 5.0, range: 2.0, atkCd: 1.0, melee: true, abCd: 6, abName: 'Charge spectrale', abDesc: 'Bondit sur la cible : 140 % et étourdit 0,5 s (rang D).',
      evo: ['Écuyer d\'ombre', 'Chevalier spectral', 'Chevalier-lige', 'Paladin déchu', 'Seigneur-chevalier', 'Maréchal des morts'], w: 14 },
    bete: { id: 'bete', name: 'Bête d\'ombre', icon: '🐺', model: 'ombre_bete', role: 'Mêlée rapide — poison', dmgK: 0.32, pvK: 0.8, speed: 7.2, range: 1.5, atkCd: 0.6, melee: true, hunter: true, abCd: 0, abName: 'Morsure venimeuse', abDesc: 'Ses morsures empoisonnent 3 s (rang D). Chasse les cibles blessées.',
      evo: ['Chien d\'ombre', 'Loup spectral', 'Limier des limbes', 'Meute-alpha', 'Chasseur nocturne', 'Dévoreuse d\'âmes'], w: 12 },
    faucheur: { id: 'faucheur', name: 'Faucheur d\'ombre', icon: '☠️', model: 'ombre_faucheur', role: 'Mêlée — exécution (rare)', dmgK: 0.75, pvK: 1.1, speed: 5.6, range: 2.4, atkCd: 1.0, melee: true, abCd: 0, abName: 'Moisson', abDesc: 'Double ses dégâts sur les cibles sous 25 % de PV, peut frapper en critique.',
      evo: ['Faucheur novice', 'Moissonneur', 'Faucheur des limbes', 'Parque', 'Collecteur d\'âmes', 'Faucheur-roi'], w: 0, rare: true },
    soldat_ombre: { id: 'soldat_ombre', name: 'Soldat d\'ombre', icon: '⚔️', model: 'soldat_ombre', role: 'Invocation temporaire', dmgK: 0.50, pvK: 0.8, speed: 5.0, range: 1.8, atkCd: 0.9, melee: true, abCd: 0, abName: '-', abDesc: 'Soldat éphémère.',
      evo: ['Soldat d\'ombre', 'Soldat d\'ombre', 'Soldat d\'ombre', 'Soldat d\'ombre', 'Soldat d\'ombre', 'Soldat d\'ombre'], w: 0, temp: true },
    titan: { id: 'titan', name: 'Titan d\'ombre', icon: '👹', model: 'ombre_titan', role: 'Colosse — zone (légendaire)', dmgK: 1.0, pvK: 3.5, speed: 4.2, range: 2.6, atkCd: 1.5, melee: true, abCd: 8, abName: 'Piétinement', abDesc: 'Écrase une large zone : 200 % de dégâts.',
      evo: ['Colosse ancestral', 'Titan d\'ombre', 'Titan des limbes', 'Titan sans nom', 'Titan-roi', 'Titan primordial'], w: 0, rare: true },
  };

  function servantName(rec) { const c = CATS[rec.cat]; return c ? c.evo[clamp(rankIdx(rec.rank), 0, 5)] : 'Ombre'; }
  function servantXpNext(level) { return 30 + 12 * level; }
  function levelCapFor(profile) { const cap = Math.min(5, playerRankIdx(profile) + 1); return cap >= 5 ? SERV_MAX_LEVEL : cap * 10 + 9; }
  function rankForLevel(level) { return Math.min(5, Math.floor(level / 10)); }

  function newUid() { return 'sv' + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36); }

  function addServant(profile, spec, autoActivate) {
    ensureProfileLite(profile);
    const ar = profile.army;
    if (ar.minions.length >= ROSTER_MAX) return null;
    const ri = clamp(rankIdx(spec.rank), 0, 5);
    const rec = { uid: newUid(), cat: spec.cat, rarity: spec.rarity || 'commun', rank: RANKS[ri], level: Math.max(1, ri * 10), xp: 0, kills: 0, origin: spec.origin || '', born: Date.now() };
    ar.minions.push(rec);
    if (autoActivate && ar.active.length < capOf(profile)) ar.active.push(rec.uid);
    return rec;
  }
  function ensureProfileLite(p) { if (!p.army || !Array.isArray(p.army.minions)) ensureProfile(p); }

  function releaseServant(profile, uid) {
    ensureProfileLite(profile);
    const ar = profile.army, i = ar.minions.findIndex(m => m.uid === uid);
    if (i < 0) return false;
    ar.minions.splice(i, 1);
    ar.active = ar.active.filter(u => u !== uid);
    dismissByUid(uid);
    return true;
  }
  function setActive(profile, uid, on) {
    ensureProfileLite(profile);
    const ar = profile.army;
    if (!ar.minions.some(m => m.uid === uid)) return false;
    const has = ar.active.indexOf(uid) >= 0;
    if (on && !has) { if (ar.active.length >= capOf(profile)) return false; ar.active.push(uid); }
    if (!on && has) { ar.active = ar.active.filter(u => u !== uid); dismissByUid(uid); }
    return true;
  }

  // =================================================================
  // Cap, stats de joueur, stats de serviteur
  // =================================================================
  function specMods(profile) {
    const s = specId(profile);
    if (s === 'necro_legion') return { cap: 1, mult: 0.85, extract: 1 };
    if (s === 'necro_elite') return { cap: -1, mult: 1.5, extract: 1.25 };
    return { cap: 0, mult: 1, extract: 1 };
  }
  function ownerStats(profile, live) {
    const pl = live && SA() && SA().inRun && SA().inRun() && SA().player && SA().player();
    if (pl && pl.stats) return pl.stats;
    try { if (G.Stats && typeof G.Stats.compute === 'function') return G.Stats.compute(profile) || {}; } catch (e) { /* secours */ }
    const c = (G.CLASSES && G.CLASSES[CLS]) || { base: {}, perLevel: {} }, L = (profile && profile.niveau || 1) - 1;
    return { intelligence: (c.base.intelligence || 12) + (c.perLevel.intelligence || 1.5) * L, minionDmg: 1.15 * specMods(profile).mult, minionPv: 1.15 * specMods(profile).mult };
  }
  function capOf(profile, stats) {
    let cap = 0;
    const s = stats || ownerStats(profile, false);
    if (s && s.minionCap > 0) cap = Math.floor(s.minionCap);
    else cap = 3 + Math.floor((profile.niveau || 1) / 10) + [0, 0, 1, 1, 2, 3, 4][playerRankIdx(profile) + 1 > 6 ? 6 : playerRankIdx(profile) + 1] + specMods(profile).cap;
    cap = clamp(cap, 1, 12);
    if (profile && profile.army) profile.army.cap = cap;
    return cap;
  }

  const pos0 = (v) => (v > 0 ? v : 1);
  function servantStats(rec, stats, ownerLevel) {
    const c = CATS[rec.cat] || CATS.guerrier;
    stats = stats || {};
    const intel = stats.intelligence > 0 ? stats.intelligence : 10;
    const mult = RANK_MULT[clamp(rankIdx(rec.rank), 0, 5)] * (1 + 0.004 * ((rec.level || 1) - 1)) * (RAR_MULT[rec.rarity] || 1);
    const st = {
      dmg: c.dmgK * NECRO_BAL * intel * mult * pos0(stats.minionDmg),
      pv: c.pvK * (50 + 8 * (ownerLevel || 1)) * mult * pos0(stats.minionPv),
      speed: c.speed, range: c.range, atkCd: c.atkCd,
    };
    st.pvMax = st.pv;
    try {
      if (G.hooks) {
        const r = G.hooks.run('minionStats', st, { minion: rec, profile: gameProfile() }) || st;   // modifiable en place ou renvoyé
        if (r.pvMax > 0 && r.pvMax !== st.pv) r.pv = r.pvMax; else r.pvMax = r.pv;
        return r;
      }
    } catch (e) { /* ignore */ }
    return st;
  }

  // Hook 'stats' : passif de classe, spé, Commandement, +1 cap / 10 niveaux (le reste vient de G.Stats)
  function onStats(st, ctx) {
    const p = ctx && ctx.profile;
    if (!isNecro(p) || !st || st._necroApplied) return;
    st._necroApplied = true;
    const sm = specMods(p);
    const m = 1.15 * sm.mult;
    st.minionDmg = pos0(st.minionDmg) * m;
    st.minionPv = pos0(st.minionPv) * m;
    st.minionCap = (st.minionCap || 0) + Math.floor((p.niveau || 1) / 10) + sm.cap;
    return st;
  }

  // =================================================================
  // Rendu / fonctions d'état en donjon
  // =================================================================
  const S = {
    clock: 0, live: [], fallen: {}, corpses: [], markEnemy: null, markUntil: 0, markPct: 0, markLvl: 0,
    sov: { until: 0, mult: 1, hero: null }, pact: null, init: false, run: null, markers: null,
  };

  function setHud() {
    try {
      const n = S.live.filter(l => !l.temp && !l.fadeT).length, p = gameProfile();
      if (G.UI && G.UI.hud && G.UI.hud.setMinions) G.UI.hud.setMinions(n, p ? capOf(p, ownerStats(p, true)) : 0);
    } catch (e) { /* ignore */ }
  }

  function dismissByUid(uid) {
    for (const lv of S.live) if (lv.rec.uid === uid && !lv.fadeT) startFade(lv);
  }
  function startFade(lv) { lv.fadeT = 0.5; lv.fadeMax = 0.5; }
  function removeLive(lv, kill) {
    const i = S.live.indexOf(lv); if (i >= 0) S.live.splice(i, 1);
    const m = lv.m;
    if (m) {
      if (kill) { m.dead = true; if (m.pv > 0) m.pv = 0; }
      const mesh = m.mesh; if (mesh && mesh.parent) mesh.parent.remove(mesh);
    }
  }
  function clearLive() { for (const lv of S.live.slice()) removeLive(lv, true); S.live.length = 0; }

  function swapMesh(m, defId, rec) {
    try {
      if (!G.GFX || !G.GFX.makeMinion || !m.mesh) return;
      const old = m.mesh, parent = old.parent;
      const nm = G.GFX.makeMinion(defId, { rank: rec.rank, rarity: rec.rarity });
      nm.position.copy(old.position); nm.rotation.copy(old.rotation);
      if (parent) { parent.add(nm); parent.remove(old); }
      m.mesh = nm;
    } catch (e) { /* garde le mesh du jeu */ }
  }

  function spawnServant(api, rec, pos, o) {
    o = o || {};
    const pl = api.player(); if (!pl) return null;
    const c = CATS[rec.cat]; if (!c) return null;
    const st = servantStats(rec, pl.stats, pl.level);
    if (o.mult) { st.dmg *= o.mult; st.pv *= o.mult; }
    let m = null;
    try {
      m = api.summon(c.model, { pos: pos.clone ? pos.clone() : pos, duration: o.duration || 99999, level: rec.level, rank: rec.rank, stats: { dmg: st.dmg, speed: st.speed, range: st.range, atkCd: st.atkCd, pv: st.pv }, ai: 'necro', necro: true });
    } catch (e) { m = null; }
    if (!m) return null;
    m.necro = true; m.necroAI = true; m.necroUid = rec.uid; m.cat = rec.cat; m.rank = rec.rank; m.level = rec.level; m.name = servantName(rec);
    m.pvMax = st.pv; m.pv = st.pv; m.dead = false;
    m.stats = Object.assign(m.stats || {}, { dmg: st.dmg, speed: st.speed, range: st.range, atkCd: st.atkCd });
    if (!m.pos && m.mesh) m.pos = m.mesh.position;
    if (rec.rank !== 'E' || rec.rarity !== 'commun' || (G.GFX && G.GFX.hasModel && !G.GFX.hasModel('minion', c.model))) swapMesh(m, c.model, rec);
    const lv = { m, rec, st, c, atkT: rnd() * 0.4, abT: 2 + rnd() * 3, tgt: null, retarget: 0, spawnT: 0.7, atkAnim: 0, temp: !!o.temp, expire: o.duration ? S.clock + o.duration : Infinity, hpHold: 0, lastX: 0, lastZ: 0, slot: S.live.length };
    S.live.push(lv);
    if (m.mesh) { m.mesh.scale.setScalar(0.01); }
    try { api.vfx('summonCircle', m.pos, { color: 0x8a2be2 }); api.vfx('shadowRise', m.pos, {}); } catch (e) { /* ignore */ }
    try { api.sfx('spawn'); } catch (e) { /* ignore */ }
    setHud();
    return lv;
  }

  function liveByUid(uid) { return S.live.find(l => l.rec.uid === uid && !l.temp); }

  function fallenCd(profile) { return Math.max(6, 18 - 2 * skillLevel(profile, 'necro_invoke')); }

  function summonActive(api, o) {
    o = o || {};
    const profile = gameProfile(); if (!profile || !isNecro(profile) || !api.inRun()) return 0;
    ensureProfile(profile);
    const pl = api.player(); if (!pl) return 0;
    const cap = capOf(profile, pl.stats);
    let slots = cap - S.live.filter(l => !l.temp && !l.fadeT).length, n = 0;
    const ar = profile.army;
    const list = ar.active.slice(0, cap);
    for (let i = 0; i < list.length && slots > 0; i++) {
      const uid = list[i];
      if (liveByUid(uid)) continue;
      if (!o.force && S.fallen[uid] && S.clock < S.fallen[uid]) continue;
      const rec = ar.minions.find(m => m.uid === uid); if (!rec) continue;
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 + 0.6, r = 1.8 + (i % 2) * 0.7;
      const p = V3(pl.pos.x + Math.cos(a) * r, 0, pl.pos.z + Math.sin(a) * r);
      const lv = spawnServant(api, rec, p, {});
      if (lv) { slots--; n++; delete S.fallen[uid]; if (o.shield) lv.shield = o.shield * lv.st.pv; }
    }
    return n;
  }

  // =================================================================
  // IA alliée
  // =================================================================
  function halfOf() { const r = S.run; return (r && r.room && r.room.half) || (r && r.half) || HALF_DEFAULT; }

  function pickTarget(api, lv, pl) {
    const m = lv.m;
    if (S.markEnemy && !S.markEnemy.dead && S.clock < S.markUntil) {
      const e = S.markEnemy; const d = Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z); if (d < 26) return e;
    }
    const list = api.enemies(); let best = null, bs = 1e9;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (!e || e.dead || !e.pos) continue;
      const d = Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z);
      const dp = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
      if (d > 12 && dp > 14) continue;
      let sc = d + (e.boss ? -2 : 0);
      if (lv.c.hunter) sc = d * 0.5 + (e.pvMax ? e.pv / e.pvMax : 1) * 8;
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }

  function moveTo(lv, tx, tz, speed, dt, stop) {
    const m = lv.m, dx = tx - m.pos.x, dz = tz - m.pos.z, d = Math.hypot(dx, dz);
    if (d <= stop || d < 1e-4) return false;
    const st = Math.min(speed * dt, d - stop);
    const h = halfOf();
    m.pos.x = clamp(m.pos.x + dx / d * st, -h, h); m.pos.z = clamp(m.pos.z + dz / d * st, -h, h);
    lv.faceX = dx; lv.faceZ = dz;
    return true;
  }

  function mdmg(lv, mult) {
    let d = lv.st.dmg * (mult || 1);
    if (S.sov.until > S.clock) d *= S.sov.mult;
    if (S.pact && S.pact.until > S.clock) d *= S.pact.mult;
    return d;
  }

  function hit(api, lv, e, amount, o) {
    o = o || {};
    e._lastMinion = lv.rec.uid;
    try { return api.damage(e, amount, Object.assign({ element: 'ombre', kind: 'minion', source: 'minion', knockback: o.knockback != null ? o.knockback : 1.2, canCrit: lv.c.id === 'faucheur' }, o)); } catch (err) { return 0; }
  }

  function basicAttack(api, lv, e) {
    const c = lv.c, m = lv.m, ri = rankIdx(lv.rec.rank);
    lv.atkAnim = 1;
    if (c.ranged) {
      const dx = e.pos.x - m.pos.x, dz = e.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
      try {
        api.projectile({ pos: V3(m.pos.x, 1.0, m.pos.z), dir: V3(dx / d, 0, dz / d), speed: 15, model: c.id === 'archer' ? 'arrow' : 'orb', damage: mdmg(lv, 1), element: 'ombre', pierce: (c.id === 'archer' && ri >= 3) ? 1 : 0, radius: 0.45, life: 1.4, owner: 'minion', onHit: (en) => { if (en) en._lastMinion = lv.rec.uid; } });
      } catch (err) { /* ignore */ }
      return;
    }
    let amount = mdmg(lv, 1);
    if (c.id === 'faucheur' && e.pvMax && e.pv / e.pvMax < 0.25) amount *= 2;
    hit(api, lv, e, amount);
    if (c.id === 'bete' && ri >= 1) { try { api.status(e, { id: 'poison', duration: 3, power: amount * 0.25 }); } catch (err) { /* ignore */ } }
  }

  function ability(api, lv, e) {
    const c = lv.c, m = lv.m, ri = rankIdx(lv.rec.rank);
    if (!c.abCd || (ri < 1 && c.id !== 'titan')) return false;
    lv.atkAnim = 1;
    const at = (x, z) => V3(x, 0, z);
    switch (c.id) {
      case 'guerrier': {
        for (const en of api.enemiesInRadius(m.pos, 2.4)) hit(api, lv, en, mdmg(lv, 1.2), { kind: 'aoe' });
        try { api.vfx('slash', m.pos, { color: 0x9d6bff, radius: 2.4 }); } catch (err) { /* ignore */ }
        return true;
      }
      case 'archer': {
        const dx = e.pos.x - m.pos.x, dz = e.pos.z - m.pos.z, base = Math.atan2(dx, dz);
        for (let k = -1; k <= 1; k++) {
          const a = base + k * 0.28;
          try { api.projectile({ pos: V3(m.pos.x, 1.0, m.pos.z), dir: V3(Math.sin(a), 0, Math.cos(a)), speed: 16, model: 'arrow', damage: mdmg(lv, 0.8), element: 'ombre', pierce: 0, radius: 0.45, life: 1.2, owner: 'minion' }); } catch (err) { /* ignore */ }
        }
        return true;
      }
      case 'mage': {
        try { api.aoe({ pos: at(e.pos.x, e.pos.z), radius: 2.6, damage: mdmg(lv, 1.4), element: 'ombre', delay: 0.35, telegraph: false, vfx: 'explosion', onHit: (en) => { try { api.status(en, { id: 'slow', duration: 2, power: 0.4 }); } catch (err) { /* ignore */ } } }); } catch (err) { /* ignore */ }
        return true;
      }
      case 'colosse': {
        for (const en of api.enemiesInRadius(m.pos, 3.2)) { hit(api, lv, en, mdmg(lv, 1.3), { kind: 'aoe', knockback: 2 }); try { api.status(en, { id: 'stun', duration: 0.8, power: 1 }); } catch (err) { /* ignore */ } }
        try { api.vfx('explosion', m.pos, { element: 'ombre', radius: 3.2 }); api.shake(0.2); } catch (err) { /* ignore */ }
        return true;
      }
      case 'chevalier': {
        const dx = e.pos.x - m.pos.x, dz = e.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > 7 || d < 2.2) return false;
        m.pos.x = e.pos.x - dx / d * 1.6; m.pos.z = e.pos.z - dz / d * 1.6;
        hit(api, lv, e, mdmg(lv, 1.4), { knockback: 2.5 });
        try { api.status(e, { id: 'stun', duration: 0.5, power: 1 }); api.vfx('hitSpark', e.pos, { element: 'ombre' }); } catch (err) { /* ignore */ }
        return true;
      }
      case 'titan': {
        for (const en of api.enemiesInRadius(m.pos, 4.2)) hit(api, lv, en, mdmg(lv, 2), { kind: 'aoe', knockback: 3 });
        try { api.vfx('explosion', m.pos, { element: 'ombre', radius: 4.2 }); api.shake(0.35); } catch (err) { /* ignore */ }
        return true;
      }
      default: return false;
    }
  }

  function animate(lv, moving, dt) {
    const m = lv.m; if (!m.mesh) return;
    if (lv.faceX !== undefined && (lv.faceX || lv.faceZ)) m.mesh.rotation.y = Math.atan2(lv.faceX, lv.faceZ);
    lv.atkAnim = Math.max(0, lv.atkAnim - dt * 4);
    try { if (G.GFX && G.GFX.animateCharacter) G.GFX.animateCharacter(m.mesh, S.clock, { moving, windup: 0, attack: lv.atkAnim }); } catch (e) { /* ignore */ }
  }

  function tickServants(api, dt) {
    const pl = api.player(); if (!pl) return;
    const profile = gameProfile();
    const n = S.live.length;
    let idx = 0;
    const behind = Math.atan2(-(pl.dir ? pl.dir.x : 0), -(pl.dir ? pl.dir.z : 1));
    for (const lv of S.live.slice()) {
      const m = lv.m;
      if (!m) { removeLive(lv, false); continue; }
      // sortie du jeu (salle changée, mesh retiré…)
      if (m.dead || m.pv <= 0) {
        if (!lv.temp && profile) { S.fallen[lv.rec.uid] = S.clock + fallenCd(profile); }
        try { api.vfx('shadowRise', m.pos, {}); } catch (e) { /* ignore */ }
        removeLive(lv, true); setHud(); continue;
      }
      if (lv.temp && S.clock >= lv.expire && !lv.fadeT) startFade(lv);
      // apparition
      if (lv.spawnT > 0) {
        lv.spawnT = Math.max(0, lv.spawnT - dt);
        const k = 1 - lv.spawnT / 0.7, e = k * k * (3 - 2 * k), sc = (m.mesh && m.mesh.userData && m.mesh.userData.baseScale) ? 1 : 1;
        if (m.mesh) { m.mesh.scale.setScalar(Math.max(0.01, e * sc)); m.mesh.position.y = -1.4 * (1 - e); }
        if (lv.spawnT === 0 && m.mesh) { m.mesh.scale.setScalar(1); m.mesh.position.y = m.pos.y || 0; }
        idx++; continue;
      }
      // disparition
      if (lv.fadeT) {
        lv.fadeT -= dt;
        const k = Math.max(0, lv.fadeT / lv.fadeMax);
        if (m.mesh) { m.mesh.scale.setScalar(Math.max(0.01, k)); m.mesh.position.y = -1.2 * (1 - k); }
        if (lv.fadeT <= 0) { removeLive(lv, true); setHud(); }
        continue;
      }
      // régénération hors combat
      lv.hpHold += dt;
      if (!lv.tgt && m.pv < m.pvMax) m.pv = Math.min(m.pvMax, m.pv + m.pvMax * 0.02 * dt);
      if (m.shield === undefined && lv.shield) { m.shield = lv.shield; }
      // cible
      lv.retarget -= dt;
      if (lv.retarget <= 0 || !lv.tgt || lv.tgt.dead) { lv.tgt = pickTarget(api, lv, pl); lv.retarget = 0.35 + rnd() * 0.15; }
      const e = lv.tgt;
      lv.atkT -= dt; lv.abT -= dt;
      let moving = false;
      const c = lv.c;
      if (e && !e.dead && e.pos) {
        const dx = e.pos.x - m.pos.x, dz = e.pos.z - m.pos.z, d = Math.hypot(dx, dz);
        lv.faceX = dx; lv.faceZ = dz;
        const reach = c.range * (c.ranged ? 0.95 : 0.9) + (e.boss ? 0.8 : 0.2);
        if (d > reach) moving = moveTo(lv, e.pos.x, e.pos.z, lv.st.speed, dt, reach * 0.8);
        else if (c.ranged && d < c.range * 0.45) moving = moveTo(lv, m.pos.x - dx, m.pos.z - dz, lv.st.speed * 0.9, dt, 0);
        if (d <= reach + 0.3) {
          if (c.abCd && lv.abT <= 0 && ability(api, lv, e)) lv.abT = c.abCd * (0.9 + rnd() * 0.2);
          else if (lv.atkT <= 0) { basicAttack(api, lv, e); lv.atkT = lv.st.atkCd * (rankIdx(lv.rec.rank) >= 2 && c.id === 'guerrier' && m.pv < m.pvMax * 0.5 ? 0.75 : 1); }
        }
      } else {
        // suivre le joueur en formation derrière lui
        const k = (idx - (n - 1) / 2) * 0.75, a = behind + k, r = c.ranged ? 3.2 : 2.2;
        const tx = pl.pos.x + Math.sin(a) * r, tz = pl.pos.z + Math.cos(a) * r;
        const dp = Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
        if (dp > 16) { // pas d'ombre : téléportation vers le maître
          try { api.vfx('shadowRise', m.pos, {}); } catch (err) { /* ignore */ }
          m.pos.x = tx; m.pos.z = tz;
        } else moving = moveTo(lv, tx, tz, lv.st.speed * (dp > 6 ? 1.5 : 1), dt, 0.6);
      }
      idx++;
      // séparation douce
      for (const o of S.live) {
        if (o === lv || !o.m || o.spawnT > 0) continue;
        const sx = m.pos.x - o.m.pos.x, sz = m.pos.z - o.m.pos.z, sd = Math.hypot(sx, sz);
        if (sd < 0.9 && sd > 1e-3) { m.pos.x += sx / sd * 0.9 * dt; m.pos.z += sz / sd * 0.9 * dt; }
      }
      if (m.mesh && m.mesh.position !== m.pos) { m.mesh.position.x = m.pos.x; m.mesh.position.z = m.pos.z; m.mesh.position.y = m.pos.y || 0; }
      animate(lv, moving, dt);
    }
  }

  // =================================================================
  // XP de serviteur
  // =================================================================
  function giveServantXp(profile, rec, amount, lv) {
    const capL = levelCapFor(profile);
    if (rec.level >= capL) { rec.xp = Math.min(rec.xp, servantXpNext(rec.level) - 1); return; }
    rec.xp += amount;
    let up = false, rankUp = false;
    while (rec.xp >= servantXpNext(rec.level) && rec.level < capL) {
      rec.xp -= servantXpNext(rec.level); rec.level++; up = true;
      const nr = rankForLevel(rec.level);
      if (nr > rankIdx(rec.rank)) { rec.rank = RANKS[nr]; rankUp = true; }
    }
    if (rec.level >= capL) rec.xp = Math.min(rec.xp, servantXpNext(rec.level) - 1);
    if (up && lv && lv.m) {
      const pl = SA() && SA().player && SA().player();
      lv.st = servantStats(rec, pl && pl.stats, pl && pl.level); lv.m.level = rec.level;
      const ratio = lv.m.pvMax ? lv.m.pv / lv.m.pvMax : 1; lv.m.pvMax = lv.st.pv; lv.m.pv = lv.st.pv * ratio;
      if (rankUp) {
        lv.m.rank = rec.rank; lv.m.name = servantName(rec); swapMesh(lv.m, lv.c.model, rec);
        try { SA().vfx('levelUpBurst', lv.m.pos, { color: 0xb56bff }); SA().text(lv.m.pos, 'ÉVOLUTION !', '#' + (0xb56bff).toString(16), 1.1); } catch (e) { /* ignore */ }
      }
    }
    if (rankUp) {
      try { G.UI && G.UI.notify && G.UI.notify({ text: 'Serviteur évolué : ' + servantName(rec) + ' (rang ' + rec.rank + ')', rarity: rec.rarity === 'legendaire' ? 'legendaire' : 'epique', icon: '💀' }); } catch (e) { /* ignore */ }
      try { G.bus && G.bus.emit('minionRankUp', { minion: rec }); } catch (e) { /* ignore */ }
    }
  }

  function onKilled(p) {
    const api = SA(); if (!api || !api.inRun || !api.inRun()) return;
    const profile = gameProfile(); if (!isNecro(profile)) return;
    const e = p && p.enemy; if (!e || e.ally) return;
    const def = e.def || {};
    const tier = e.boss ? 6 : e.elite ? 2.5 : 1;
    const base = Math.round((3 + (def.xp || 10) * 0.12) * tier);
    const credited = p.killer === 'minion' ? e._lastMinion : null;
    for (const lv of S.live) {
      if (lv.temp || lv.fadeT) continue;
      const mine = lv.rec.uid === credited;
      if (mine) lv.rec.kills = (lv.rec.kills || 0) + 1;
      giveServantXp(profile, lv.rec, Math.max(1, Math.round(base * (mine ? 2 : 1))), lv);
    }
    // mana de la passive
    try { const pl = api.player(); if (pl && pl.manaMax) api.restoreMana(pl.manaMax * 0.02); } catch (err) { /* ignore */ }
    // transfert de la marque
    if (e === S.markEnemy) {
      if (S.markLvl >= 4) {
        const near = api.enemiesInRadius(e.pos, 6).filter(x => x !== e && !x.dead)[0];
        if (near) applyMark(api, near, S.markLvl, S.markUntil - S.clock);
      }
      S.markEnemy = null;
    }
    // cadavre extractible
    if (e.noExtract || e.summoned) return;
    const lvl = skillLevel(profile, 'necro_extract'); if (lvl < 1) return;
    const win = 4 + 0.4 * lvl;
    const c = { enemy: e, def, pos: e.pos.clone ? e.pos.clone() : e.pos, until: S.clock + win, tried: false, boss: !!e.boss, elite: !!e.elite, marker: null, lvl };
    S.corpses.push(c);
    if (S.corpses.length > 12) removeCorpse(S.corpses[0]);
    addMarker(c);
  }

  // ---------------- extraction ----------------
  function extractChance(c, lvl, profile) {
    let base;
    if (c.boss) base = 0.20 + 0.04 * (lvl - 1); else if (c.elite) base = 0.18 + 0.03 * (lvl - 1); else base = 0.25 + 0.04 * (lvl - 1);
    let cmd = 0; try { cmd = profile && G.Skills && G.Skills.levelOf ? G.Skills.levelOf(profile, 'necro_command') : 0; } catch (e) { cmd = 0; }   // Commandement : +3 %/niv relatifs (décrit, n'était pas appliqué)
    return clamp(base * specMods(profile).extract * (1 + 0.03 * cmd) + (fl('dague') >= 5 ? 0.05 : 0), 0, 0.9);
  }
  function categoryFromEnemy(c) {
    if (c.boss) return 'titan';
    if (c.elite && rnd() < 0.3) return 'faucheur';
    const d = c.def || {}, s = ((d.model || '') + ' ' + (d.ai || '') + ' ' + (d.id || '') + ' ' + (d.name || '')).toLowerCase();
    if (/archer|ranged|arbal/.test(s)) return 'archer';
    if (/wraith|lich|caster|mage|imp|sorc|spectre|fant/.test(s)) return 'mage';
    if (/bat|spider|slime|swarm|wolf|loup|beast|rat|arai|chauve|gelee|gelée/.test(s)) return 'bete';
    if (/knight|chevalier|paladin/.test(s)) return 'chevalier';
    if (/golem|giant|geant|géant|ogre|colosse|troll|charger/.test(s)) return 'colosse';
    return 'guerrier';
  }
  function tryExtract(c, manual) {
    const api = SA(), profile = gameProfile(); if (!api || !isNecro(profile) || c.tried) return { ok: false };
    ensureProfile(profile);
    if (profile.army.minions.length >= ROSTER_MAX) { try { api.text(c.pos, 'Armée pleine', '#ff7a7a', 1); } catch (e) { /* ignore */ } return { ok: false, full: true }; }
    c.tried = true;
    const lvl = Math.max(1, skillLevel(profile, 'necro_extract'));
    const chance = extractChance(c, lvl, profile) * (manual ? 1 : 0.5);
    const won = rnd() < chance;
    removeCorpse(c);
    if (!won) { try { api.text(c.pos, 'L\'âme résiste…', '#9a8cc0', 1); } catch (e) { /* ignore */ } return { ok: false, chance }; }
    const d = c.def || {};
    const rarity = c.boss ? 'legendaire' : c.elite ? 'rare' : 'commun';
    const er = rankIdx((c.enemy && c.enemy.rank) || d.rankMin || (S.run && S.run.dungeon && S.run.dungeon.rank) || 'E');
    const rank = Math.min(er, playerRankIdx(profile));
    const rec = addServant(profile, { cat: categoryFromEnemy(c), rarity, rank: RANKS[rank], origin: d.name || '' }, true);
    if (!rec) return { ok: false };
    soulsAdd(1);   // v5 : chaque extraction réussie donne 1 Âme
    try {
      api.vfx('summonCircle', c.pos, { color: 0xb56bff }); api.vfx('shadowRise', c.pos, {});
      api.text(c.pos, 'ÂME EXTRAITE : ' + servantName(rec), rarity === 'legendaire' ? '#ffb020' : rarity === 'rare' ? '#3fa9ff' : '#d7b8ff', 1.2);
      G.UI && G.UI.notify && G.UI.notify({ text: 'Nouveau serviteur : ' + servantName(rec) + (d.name ? ' (' + d.name + ')' : ''), rarity: rarity === 'commun' ? 'rare' : rarity === 'rare' ? 'epique' : 'legendaire', icon: CATS[rec.cat].icon });
    } catch (e) { /* ignore */ }
    try { G.bus && G.bus.emit('soulExtracted', { servant: rec, from: d.id }); } catch (e) { /* ignore */ }
    persist(profile);
    return { ok: true, servant: rec, chance };
  }

  function nearestCorpse(pos, range) {
    let best = null, bd = range;
    for (const c of S.corpses) { if (c.tried) continue; const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  // repère visuel des cadavres (petite âme qui flotte)
  function addMarker(c) {
    try {
      const T = window.THREE, scene = G.core && G.core.scene; if (!T || !scene) return;
      if (!S.markers) S.markers = { g: new T.OctahedronGeometry(0.22, 0), m: new T.MeshBasicMaterial({ color: 0xc08bff, transparent: true, opacity: 0.85, depthWrite: false }) };
      const mk = new T.Mesh(S.markers.g, S.markers.m); mk.position.set(c.pos.x, 0.8, c.pos.z); scene.add(mk); c.marker = mk;
    } catch (e) { /* ignore */ }
  }
  function removeCorpse(c) {
    const i = S.corpses.indexOf(c); if (i >= 0) S.corpses.splice(i, 1);
    if (c.marker && c.marker.parent) c.marker.parent.remove(c.marker); c.marker = null;
  }
  function tickCorpses(api, dt) {
    const profile = gameProfile();
    for (const c of S.corpses.slice()) {
      if (c.marker) { c.marker.position.y = 0.8 + Math.sin(S.clock * 4 + c.pos.x) * 0.15; c.marker.rotation.y += dt * 2; c.marker.scale.setScalar(0.8 + 0.4 * Math.max(0, (c.until - S.clock) / (4 + 0.4 * c.lvl))); }
      if (S.clock >= c.until) {
        // fenêtre écoulée : extraction automatique (chance réduite) si le maître est proche
        const pl = api.player();
        if (!c.tried && profile && profile.settings.necroAuto !== false && pl && Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) <= 12) tryExtract(c, false);
        else removeCorpse(c);
      }
    }
  }

  // ---------------- marque ----------------
  function applyMark(api, e, lvl, dur) {
    S.markEnemy = e; S.markUntil = S.clock + dur; S.markLvl = lvl; S.markPct = 0.15 + 0.03 * lvl;
    e._necroMark = { until: S.markUntil, pct: S.markPct };
    try { api.status(e, { id: 'curse', duration: dur, power: 0 }); api.vfx('hitSpark', e.pos, { element: 'ombre' }); api.text(e.pos, 'MAUDIT +' + Math.round(S.markPct * 100) + '%', '#c08bff', 1); } catch (err) { /* ignore */ }
  }
  function onIncoming(dmg, ctx) {
    const t = ctx && ctx.target;
    if (!t || !t._necroMark || !dmg || typeof dmg.amount !== 'number') return;
    if (S.clock >= t._necroMark.until) { t._necroMark = null; return; }
    if (ctx.source === 'enemy') return;
    dmg.amount *= 1 + t._necroMark.pct;
    return dmg;
  }
  function onOutgoing(dmg, ctx) {
    if (S.sov.until <= S.clock || !dmg || typeof dmg.amount !== 'number') return;
    if (ctx && (ctx.source === 'minion' || ctx.source === 'enemy')) return;
    if (dmg.element === 'ombre') { dmg.amount *= 1.15; return dmg; }
  }

  // ---------------- transformation ----------------
  function setSovereignForm(hero, on) {
    if (!hero || !hero.userData) return;
    const ud = hero.userData;
    if (ud.sovereign) ud.sovereign.visible = !!on;
    if (!hero.scale) return;
    if (on) { if (ud._sovScale == null) ud._sovScale = hero.scale.x; hero.scale.setScalar(ud._sovScale * 1.12); }
    else if (ud._sovScale != null) { hero.scale.setScalar(ud._sovScale); ud._sovScale = null; }
    if (ud.mats) for (const m of ud.mats) if (m && m.emissive && !m._necroBase) { /* flash géré par game.js */ }
  }
  function endSovereign() {
    if (S.sov.until && S.sov.hero) setSovereignForm(S.sov.hero, false);
    S.sov.until = 0; S.sov.hero = null;
    for (const lv of S.live.slice()) if (lv.temp && lv.sovereign && !lv.fadeT) startFade(lv);
  }

  // ---------------- boucle principale ----------------
  function onTick(p) {
    const api = SA(); if (!api || !api.inRun || !api.inRun()) return;
    const profile = gameProfile(); if (!isNecro(profile)) return;
    const dt = Math.min(0.1, (p && p.dt) || 0.016);
    S.clock += dt; S.run = (p && p.run) || (api.run && api.run()) || S.run;
    if (!S.init) { S.init = true; ensureProfile(profile); const n = api.player() ? summonActive(api, { force: true }) : 0; if (!n) S.init = !!api.player() && S.live.length > 0 || false; }
    if (S.sov.until && S.clock >= S.sov.until) endSovereign();
    if (S.markEnemy && (S.markEnemy.dead || S.clock >= S.markUntil)) S.markEnemy = null;
    tickCorpses(api, dt);
    tickServants(api, dt);
  }

  // =================================================================
  // Compétences (format §5)  — G.SKILLS
  // =================================================================
  function stat(api) { const p = api.player(); return (p && p.stats) || {}; }
  function intel(api) { return stat(api).intelligence > 0 ? stat(api).intelligence : 10; }
  function dirOf(api, ctx) {
    let d = ctx && ctx.dir; if (!d && api.aim) { try { d = api.aim(ctx); } catch (e) { d = null; } }
    const pl = api.player(); if ((!d || (!d.x && !d.z)) && pl && pl.dir) d = pl.dir;
    return d || V3(0, 0, 1);
  }
  function targetOf(api, ctx, range) {
    const pl = api.player(); if (!pl) return null;
    const d = dirOf(api, ctx);
    let list = []; try { list = api.enemiesInCone(pl.pos, d, range, 0.9) || []; } catch (e) { list = []; }
    let best = null, bd = 1e9;
    for (const e of list) { if (!e || e.dead) continue; const dd = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z); if (dd < bd) { bd = dd; best = e; } }
    return best || api.nearestEnemy(pl.pos, range);
  }
  const SK = (def) => Object.assign({ classe: CLS, element: 'ombre', rankReq: 'E', manaCost: 0, cd: 1, v5: true, scale: 'int', upgrades: [], tags: [] }, def, { tags: ['ombre', 'summon'].concat(def.tags || [], [def.kind]) });
  const fl = (k) => { try { return G.Skills && G.Skills.forgeLevel ? G.Skills.forgeLevel(gameProfile(), k) : 1; } catch (e) { return 1; } };
  const soulsHeld = () => { try { return G.Skills && G.Skills.resGet ? Math.floor(G.Skills.resGet('ames') + 1e-6) : 0; } catch (e) { return 0; } };
  const soulsSpend = (n) => { try { return G.Skills && G.Skills.K && G.Skills.K.res.spend('ames', n); } catch (e) { return false; } };
  const soulsAdd = (n) => { try { if (G.Skills && G.Skills.resAdd) G.Skills.resAdd('ames', n); } catch (e) { /* ignore */ } };

  const SKILLS = {
    necro_basic: SK({
      id: 'necro_basic', name: 'Projectile d\'âme', icon: '👻', kind: 'basic', manaCost: 0, cd: 0.5, maxLevel: 5, unlockLevel: 1, tree: { branch: 'A', tier: 1, requires: [] },
      desc: (l) => 'Lance une âme (' + (0.8 + 0.05 * (l - 1)).toFixed(2) + ' × Intelligence, ombre) ; chaque touche rend 1 mana.' + (l >= 3 ? ' Perce 1 ennemi.' : '') + (l >= 5 ? ' Légère auto-visée.' : ''),
      cast(api, l, ctx) {
        const pl = api.player(); if (!pl) return;
        const d = dirOf(api, ctx), p = pl.pos.clone();
        p.y = 1.0;
        api.projectile({ pos: p, dir: d, speed: 15, model: 'orb', damage: intel(api) * NECRO_BAL * (0.8 + 0.05 * (l - 1)) * ((ctx && ctx.dmgMult) || 1), element: 'ombre', pierce: (l >= 3 ? 1 : 0) + (fl('epee') >= 10 ? 1 : 0), source: 'player', tags: ['sk:necro_basic', 'projectile', 'basic'], radius: 0.5, life: 1.3, homing: l >= 5 ? 0.6 : 0, owner: 'player', onHit: () => { try { api.restoreMana(1 + (fl('epee') >= 5 ? 1 : 0)); } catch (e) { /* ignore */ } if (fl('epee') >= 10 && rnd() < 0.15) soulsAdd(1); } });
        try { api.sfx('throw'); } catch (e) { /* ignore */ }
      },
    }),
    necro_invoke: SK({
      id: 'necro_invoke', name: 'Invocation des ombres', icon: '🌑', kind: 'active', manaCost: 20, cd: 10, maxLevel: 5, unlockLevel: 1, tree: { branch: 'B', tier: 1, requires: [] },
      desc: (l) => 'Appelle vos serviteurs actifs manquants autour de vous (jusqu\'au maximum d\'invocations). Arrivée avec un bouclier de ' + (8 * l) + ' % de leurs PV ; un serviteur tombé revient après ' + Math.max(6, 18 - 2 * l) + ' s. Armée déjà présente : ralliement (retour près de vous, soin, bouclier, attaque de la cible visée).',
      cast(api, l, ctx) {
        const n = summonActive(api, { shield: 0.08 * l + (fl('dague') >= 10 ? 0.2 : 0) });
        const pl = api.player();
        if (!n) {
          // armée déjà sur le terrain : ralliement — les serviteurs reviennent près du héros, sont soignés et protégés, puis foncent sur la cible visée
          const live = S.live.filter(x => !x.temp && !x.fadeT && x.m && !x.m.dead);
          if (!live.length) { try { api.text(pl.pos, 'Aucun serviteur : extrais des âmes d\'abord', '#9a8cc0', 1.4); } catch (e) { /* ignore */ } return false; }   // rien à appeler : coût remboursé
          const tgt = targetOf(api, ctx, 14);
          live.forEach((x, i) => {
            const m = x.m;
            if (Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) > 5) { const a = (i / live.length) * Math.PI * 2 + 0.6; m.pos.x = pl.pos.x + Math.cos(a) * 1.9; m.pos.z = pl.pos.z + Math.sin(a) * 1.9; try { api.vfx('shadowRise', m.pos, {}); } catch (e) { /* ignore */ } }
            m.pv = Math.min(m.pvMax, m.pv + m.pvMax * (0.2 + 0.05 * l));
            m.shield = Math.max(m.shield || 0, (0.08 * l + 0.1) * m.pvMax);
            if (tgt) { x.tgt = tgt; x.retarget = 2.5; x.atkT = 0; }
          });
          try { api.vfx('summonCircle', pl.pos, { color: 0x8a2be2 }); api.text(pl.pos, 'Ralliement !', '#b98cff', 1); api.sfx('spawn'); } catch (e) { /* ignore */ }
        }
        try { api.shake(0.15); } catch (e) { /* ignore */ }
      },
    }),
    necro_extract: SK({
      id: 'necro_extract', name: 'Extraction d\'âme', icon: '🕯️', kind: 'active', manaCost: 12, cd: 1.2, maxLevel: 5, unlockLevel: 1, tree: { branch: 'C', tier: 1, requires: [] },
      desc: (l) => 'Arrache l\'âme du cadavre le plus proche (fenêtre de ' + (4 + 0.4 * l).toFixed(1) + ' s après la mort, portée ' + (8 + l) + ') : ' + Math.round(100 * (0.25 + 0.04 * (l - 1))) + ' % (commun), ' + Math.round(100 * (0.18 + 0.03 * (l - 1))) + ' % (élite), ' + Math.round(100 * (0.20 + 0.04 * (l - 1))) + ' % (boss) d\'obtenir un serviteur. Sans action, extraction automatique à moitié de chance. Sans cadavre, arrache un fragment d\'âme à l\'ennemi visé (dégâts d\'ombre, soin léger). Chaque réussite donne 1 Âme (dépensée par Explosion d\'ombre et Armée des morts).',
      cast(api, l, ctx) {
        const pl = api.player(); const c = nearestCorpse(pl.pos, 8 + l);
        if (!c) {
          // pas de cadavre : la main d'ombre arrache un fragment d'âme à l'ennemi visé (dégâts d'ombre + un peu de PV)
          const e = targetOf(api, ctx, 8 + l);
          if (!e) { try { api.restoreMana(this.manaCost); api.text(pl.pos, 'Aucune âme à portée', '#9a8cc0', 1); } catch (err) { /* ignore */ } return false; }
          const at = V3(e.pos.x, 0, e.pos.z);
          api.aoe({ pos: at, radius: 1.3, damage: intel(api) * NECRO_BAL * (1.1 + 0.1 * (l - 1)) * ((ctx && ctx.dmgMult) || 1), element: 'ombre', delay: 0.2, telegraph: false, source: 'player', tags: ['sk:necro_extract', 'aoe'], onHit: () => { try { api.heal(pl.pvMax * 0.03); } catch (err) { /* ignore */ } } });
          try { api.vfx('shadowRise', at, {}); api.sfx('throw'); } catch (err) { /* ignore */ }
          return;
        }
        const r = tryExtract(c, true);
        if (r.full) { try { api.restoreMana(this.manaCost); } catch (e) { /* ignore */ } }
      },
    }),
    necro_mark: SK({
      id: 'necro_mark', name: 'Marque maudite', icon: '☠️', kind: 'active', manaCost: 18, cd: 8, maxLevel: 5, unlockLevel: 5, tree: { branch: 'C', tier: 2, requires: ['necro_extract'] },
      desc: (l) => 'Maudit la cible : elle subit +' + Math.round(100 * (0.15 + 0.03 * l)) + ' % de dégâts pendant ' + (8 + 0.5 * l).toFixed(1) + ' s et vos serviteurs la ciblent en priorité (Invocation des ombres, Armée des morts).' + (l >= 4 ? ' À sa mort, la marque saute sur un ennemi proche.' : ''),
      cast(api, l, ctx) {
        const e = targetOf(api, ctx, 14);
        if (!e) { try { api.restoreMana(this.manaCost); } catch (err) { /* ignore */ } return; }
        applyMark(api, e, l, 8 + 0.5 * l);
      },
    }),
    necro_blast: SK({
      id: 'necro_blast', name: 'Explosion d\'ombre', icon: '💥', kind: 'active', manaCost: 32, cd: 9, maxLevel: 5, unlockLevel: 10, tree: { branch: 'A', tier: 2, requires: ['necro_basic'] },
      desc: (l) => 'Détonation d\'ombre (' + (2.6 + 0.3 * (l - 1)).toFixed(1) + ' × Int, rayon ' + (3.6 + 0.15 * l).toFixed(1) + '). Chaque cadavre proche consumé ajoute +25 % (max 5) mais ne peut plus servir à l\'Extraction d\'âme. Consomme jusqu\'à 5 Âmes : +20 % de dégâts par Âme.' + (l >= 3 ? ' Effraie les ennemis touchés.' : ''),
      cast(api, l, ctx) {
        const pl = api.player(); if (!pl) return;
        const tgt = targetOf(api, ctx, 12);
        const soulN = Math.min(5, soulsHeld()); if (soulN > 0) soulsSpend(soulN);   // v5 : +20 %/Âme consommée
        const d = dirOf(api, ctx);
        const c = tgt ? V3(tgt.pos.x, 0, tgt.pos.z) : V3(pl.pos.x + d.x * 5, 0, pl.pos.z + d.z * 5);
        const radius = 3.6 + 0.15 * l;
        let bonus = 0;
        for (const cp of S.corpses.slice()) { if (bonus >= 5) break; if (Math.hypot(cp.pos.x - c.x, cp.pos.z - c.z) <= radius + 1) { bonus++; try { api.vfx('shadowRise', cp.pos, {}); } catch (e) { /* ignore */ } removeCorpse(cp); } }
        const dmg = intel(api) * NECRO_BAL * (2.6 + 0.3 * (l - 1)) * (1 + 0.25 * bonus) * (1 + 0.2 * soulN) * ((ctx && ctx.dmgMult) || 1);
        api.aoe({ pos: c, radius, damage: dmg, element: 'ombre', delay: 0.45, telegraph: true, source: 'player', tags: ['sk:necro_blast', 'aoe'], onHit: (e) => { if (l >= 3) { try { api.status(e, { id: 'fear', duration: 1.5, power: 1 }); } catch (err) { /* ignore */ } } } });
        try { api.after(0.45, () => { api.vfx('explosion', c, { element: 'ombre', radius }); api.shake(0.4); api.sfx('boom'); }); } catch (e) { /* ignore */ }
      },
    }),
    necro_army: SK({
      id: 'necro_army', name: 'Armée des morts', icon: '🪦', kind: 'active', manaCost: 45, cd: 35, maxLevel: 5, unlockLevel: 20, tree: { branch: 'B', tier: 3, requires: ['necro_invoke'] },
      desc: (l) => 'Fait surgir ' + (4 + Math.floor(l / 2)) + ' soldats spectraux pendant ' + (10 + l) + ' s (' + Math.round(100 * (0.40 + 0.04 * l)) + ' % de la puissance d\'un serviteur, hors limite d\'invocations). +1 soldat par 2 Âmes dépensées (max +4).',
      cast(api, l) { const extra = Math.min(4, Math.floor(soulsHeld() / 2)); if (extra > 0) soulsSpend(extra * 2); raiseTemps(api, 4 + Math.floor(l / 2) + extra, 0.40 + 0.04 * l, 10 + l, false); try { api.shake(0.25); } catch (e) { /* ignore */ } },
    }),
    necro_souls: SK({
      id: 'necro_souls', name: 'Âmes liées', icon: '🔗', kind: 'passive', maxLevel: 5, unlockLevel: 15, tree: { branch: 'B', tier: 2, requires: ['necro_invoke'] },
      desc: (l) => 'Passif : +' + (4 * l) + ' % de dégâts et de PV des serviteurs.',
      passive(stats, l) { stats.minionDmg = pos0(stats.minionDmg) * (1 + 0.04 * l); stats.minionPv = pos0(stats.minionPv) * (1 + 0.04 * l); return stats; },
    }),
    necro_command: SK({
      id: 'necro_command', name: 'Commandement', icon: '👑', kind: 'passive', maxLevel: 5, unlockLevel: 25, tree: { branch: 'C', tier: 4, requires: ['necro_mark'] },
      desc: (l) => 'Passif : ' + (l >= 5 ? '+1 serviteur actif maximum' : '+1 serviteur actif maximum au niveau 5') + ' ; +' + (3 * l) + ' % de chances d\'extraction relatives (Extraction d\'âme).',
      passive(stats, l) { stats.minionCap = (stats.minionCap || 0) + Math.floor(l / 5); return stats; },
    }),
    necro_sovereign: SK({
      id: 'necro_sovereign', name: 'Souverain des Ombres', icon: '👑', kind: 'ultimate', manaCost: 0, cd: 60, maxLevel: 5, unlockLevel: 5, tree: { branch: 'B', tier: 5, requires: [] },
      desc: (l) => 'Transformation de ' + (12 + 0.5 * l).toFixed(1) + ' s : vos serviteurs (même tombés) reviennent, +' + Math.round(100 * (0.30 + 0.04 * l)) + ' % de dégâts, ' + (5 + Math.floor(l / 2)) + ' gardes d\'ombre se joignent au combat ; vous gagnez +15 % de dégâts d\'ombre et récupérez 20 % de vos PV. +4 % de dégâts des serviteurs par Âme tenue (sans les consommer).',
      cast(api, l) {
        const pl = api.player(); if (!pl) return;
        const dur = 12 + 0.5 * l + (fl('feu') >= 5 ? 2 : 0);
        S.sov.until = S.clock + dur; S.sov.mult = 1.30 + 0.04 * l + 0.04 * Math.min(10, soulsHeld()); S.sov.hero = pl.hero;   // v5 : +4 %/Âme tenue, sans consommer
        S.fallen = {};
        summonActive(api, { force: true });
        raiseTemps(api, 5 + Math.floor(l / 2) + (fl('feu') >= 10 ? 1 : 0), 0.5 + 0.03 * l, dur, true);
        try { api.heal(pl.pvMax * 0.2); api.buff({ id: 'sovereign', duration: dur, stats: {}, vfx: 'aura' }); api.vfx('levelUpBurst', pl.pos, { color: 0x7a35e0 }); api.vfx('summonCircle', pl.pos, { color: 0x7a35e0 }); api.shake(0.7); api.hitStop(0.08); api.sfx('super'); } catch (e) { /* ignore */ }
        setSovereignForm(pl.hero, true);
        try { api.after(dur + 0.05, () => { if (S.sov.until && S.clock >= S.sov.until - 0.01) endSovereign(); }); } catch (e) { /* ignore */ }
      },
    }),
    // ---- v5 : compétences exclusives de spécialisation (niveau 15)
    necro_charnier: SK({
      id: 'necro_charnier', name: 'Charnier', icon: '💀', kind: 'active', manaCost: 24, cd: 14, maxLevel: 5, unlockLevel: 15, spec: 'necro_legion', range: 10, radius: 3,
      tags: ['aoe'], tree: { branch: 'C', tier: 1, requires: [] },
      desc: (l) => 'Spécialisation Maître de légion. Fait exploser jusqu\'à ' + (4 + (l >= 5 ? 1 : 0)) + ' cadavres proches (10 m) : ' + Math.round(220 * (1 + 0.22 * (l - 1))) + ' % de dégâts (rayon 3) chacun, et relève 1 squelette temporaire (8 s) par cadavre. Sans cadavre : rien ne se passe.',
      cast(api, l, ctx) {
        const pl = api.player(); if (!pl) return false;
        const list = S.corpses.filter(c => Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) <= 10).slice(0, 4 + (l >= 5 ? 1 : 0));
        if (!list.length) return false;
        for (const cp of list) {
          const c = V3(cp.pos.x, 0, cp.pos.z);
          api.aoe({ pos: c, radius: 3, damage: intel(api) * NECRO_BAL * 2.2 * (1 + 0.22 * (l - 1)) * ((ctx && ctx.dmgMult) || 1), element: 'ombre', delay: 0.3, telegraph: true, source: 'player', tags: ['sk:necro_charnier', 'aoe'] });
          try { api.vfx('shadowRise', cp.pos, {}); api.after(0.3, () => { api.vfx('explosion', c, { element: 'ombre', radius: 3 }); }); } catch (e) { /* ignore */ }
          removeCorpse(cp);
        }
        raiseTemps(api, list.length, 0.45, 8, false);
        try { api.shake(0.35); api.sfx('boom'); } catch (e) { /* ignore */ }
      },
    }),
    necro_pacte: SK({
      id: 'necro_pacte', name: 'Pacte d\'âmes', icon: '👑', kind: 'active', manaCost: 20, cd: 18, maxLevel: 5, unlockLevel: 15, spec: 'necro_elite', range: 0, radius: 0,
      tags: ['buff'], tree: { branch: 'C', tier: 1, requires: [] },
      desc: (l) => 'Spécialisation Seigneur d\'élite. Dépense jusqu\'à 5 Âmes : vos serviteurs gagnent +' + (15 + 2 * (l - 1)) + ' % de dégâts par Âme et récupèrent 10 % de leurs PV par seconde pendant ' + (8 + (l >= 5 ? 2 : 0)) + ' s. Sans Âme : rien ne se passe.',
      cast(api, l) {
        const n = Math.min(5, soulsHeld()); if (n < 1) return false;
        soulsSpend(n);
        const dur = 8 + (l >= 5 ? 2 : 0);
        S.pact = { until: S.clock + dur, mult: 1 + (0.15 + 0.02 * (l - 1)) * n };
        for (let i = 1; i <= dur; i++) { try { api.after(i, () => { for (const lv of S.live) if (!lv.temp && lv.m && !lv.m.dead) lv.m.pv = Math.min(lv.m.pvMax, lv.m.pv + lv.m.pvMax * 0.10); }); } catch (e) { /* ignore */ } }
        const pl = api.player();
        try { api.buff({ id: 'pacte', duration: dur, stats: {}, vfx: 'aura', name: 'Pacte d\'âmes', icon: 'crown' }); api.vfx('summonCircle', pl.pos, { color: 0x7a35e0 }); api.text(pl.pos, 'PACTE ×' + n, '#b56bff', 1.2); api.sfx('upgrade'); } catch (e) { /* ignore */ }
      },
    }),
  };

  function raiseTemps(api, count, mult, dur, sov) {
    const pl = api.player(), profile = gameProfile(); if (!pl) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.5, r = 2.5 + rnd() * 1.5;
      const rec = { uid: 'tmp' + newUid(), cat: i % 3 === 2 ? 'archer' : TEMP_MINION, rarity: 'commun', rank: 'E', level: 1, xp: 0 };
      const lv = spawnServant(api, rec, V3(pl.pos.x + Math.cos(a) * r, 0, pl.pos.z + Math.sin(a) * r), { temp: true, duration: dur, mult });
      if (lv) lv.sovereign = !!sov;
    }
    void profile;
  }

  function registerSkills() {
    G.SKILLS = G.SKILLS || {};
    for (const id in SKILLS) if (!G.SKILLS[id]) G.SKILLS[id] = SKILLS[id];
    // v5 : icônes (noms G.Icons), vfx / sfx ; l'emoji d'origine reste dans d.emoji (repli d'affichage)
    const META = { necro_basic: ['ghost', 'bolt_ombre', 'throw'], necro_invoke: ['summon', 'summon', 'spawn'], necro_extract: ['skull', 'shadow_rise', 'upgrade'], necro_mark: ['target', 'aura', 'upgrade'],
      necro_blast: ['shadow', 'explosion_ombre', 'boom'], necro_army: ['users', 'summon', 'bossRoar'], necro_souls: ['ghost', null, null], necro_command: ['crown', null, null], necro_sovereign: ['crown', 'levelup', 'super'],
      necro_charnier: ['skull', 'shadow_rise', 'boom'], necro_pacte: ['crown', 'buff', 'upgrade'] };
    for (const id in META) { const d = G.SKILLS[id]; if (!d || d.iconSet) continue; d.iconSet = true; if (d.icon && !/^[a-z0-9_]+$/.test(d.icon)) d.emoji = d.icon; d.icon = META[id][0]; d.vfx = META[id][1]; d.sfx = META[id][2]; const RR = { necro_basic: [15, 0.5], necro_extract: [9, 0], necro_mark: [14, 0], necro_blast: [12, 4], necro_charnier: [10, 3] }[id] || [0, 0]; if (d.range == null) d.range = RR[0]; if (d.radius == null) d.radius = RR[1]; }
    G.SKILL_TREES = G.SKILL_TREES || {};
    if (!G.SKILL_TREES.Necromancien) G.SKILL_TREES.Necromancien = {
      branches: { A: { name: 'Kit de départ', icon: '👻', desc: 'Projectile d\'âme, Invocation, Extraction et l\'ultime Souverain.' }, B: { name: 'Déblocages', icon: '🪦', desc: 'Marque, Explosion, Armée et passifs (niveaux 5 à 25).' }, C: { name: 'Spécialisation', icon: '💀', desc: 'Maître de légion (Charnier) ou Seigneur d\'élite (Pacte), au niveau 15.' } },
      core: { basic: 'necro_basic', cast2: 'necro_invoke', cast3: 'necro_extract', super: 'necro_sovereign' },
    };
    G.CLASS_PASSIVES = G.CLASS_PASSIVES || {};
    if (!G.CLASS_PASSIVES.Necromancien) G.CLASS_PASSIVES.Necromancien = { name: 'Seigneur des morts', desc: 'Les serviteurs gagnent +15 % de dégâts et de PV ; une mise à mort par vous ou un serviteur rend 2 % du mana.', apply(st) { return st; } };
  }
  registerSkills();

  // =================================================================
  // Hooks & bus
  // =================================================================
  if (G.hooks) {
    G.hooks.add('stats', onStats, 5);
    G.hooks.add('incomingDamage', onIncoming, 0);
    G.hooks.add('outgoingDamage', onOutgoing, 0);
  }
  if (G.bus) {
    G.bus.on('tick', onTick);
    G.bus.on('enemyKilled', onKilled);
    G.bus.on('runStart', (p) => {
      registerSkills(); clearLive(); for (const c of S.corpses.slice()) removeCorpse(c);
      S.fallen = {}; S.markEnemy = null; S.sov.until = 0; S.sov.hero = null; S.init = false; S.run = p && p.run || null; S.clock = 0;
      const pr = gameProfile(); if (pr) ensureProfile(pr);
    });
    G.bus.on('roomStart', () => {
      // changement de salle : les serviteurs sont ré-invoqués (relevés gratuitement, PV pleins)
      clearLive(); for (const c of S.corpses.slice()) removeCorpse(c); S.fallen = {}; S.markEnemy = null; S.init = false;
    });
    G.bus.on('runEnd', () => {
      endSovereign(); clearLive(); for (const c of S.corpses.slice()) removeCorpse(c); S.init = false; S.run = null;
      const pr = gameProfile(); if (isNecro(pr)) persist(pr);
      setHud();
    });
  }

  // =================================================================
  // Panneau « Armée »
  // =================================================================
  let cssDone = false;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Icône SVG du système (G.Icons) ; '' si absente (on garde alors l'emoji de secours). */
  const ico = (name, size) => { try { const Ic = G.Icons; if (Ic && Ic.svg && (!Ic.has || Ic.has(name))) return Ic.svg(name, { size: size || 18 }) || ''; } catch (e) { /* ignore */ } return ''; };
  const CAT_ICO = { guerrier: 'sword', archer: 'bow', mage: 'staff', colosse: 'shield', chevalier: 'shield', bete: 'dagger', faucheur: 'skull', soldat_ombre: 'sword' };
  const RAR_FULL = { commun: '#b8c0cc', rare: '#3fa9ff', epique: '#b44dff', legendaire: '#ffb020', mythique: '#ff3d6e' };
  function injectCSS() {
    if (cssDone || !hasDOM()) return; cssDone = true;
    try { G.__pcUi && G.__pcUi.dsFallback && G.__pcUi.dsFallback(); } catch (e) { /* ignore */ }
    const st = document.createElement('style'); st.id = 'necro-style';
    st.textContent = `
.necro-help { margin: 10px 0 4px; padding: 10px 12px; border-radius: 10px; background: rgba(139,77,255,.10); border: 1px solid rgba(139,77,255,.35); font-size: 13px; line-height: 1.45; } .necro-help ul { margin: 6px 0 0; padding-left: 18px; } .necro-help li { margin: 3px 0; } .necro-panel{color:var(--ds-text,#e8f0ff);font-family:var(--ds-font-body,'Nunito',sans-serif);font-size:13px;padding:0 0 20px}
.necro-panel *{box-sizing:border-box}
.necro-ic{display:inline-flex;align-items:center;justify-content:center;line-height:0}.necro-ic svg{display:block}
.necro-head{position:relative;padding:14px 14px 12px;margin:0 0 12px;overflow:hidden;
  background:radial-gradient(ellipse 80% 120% at 0% 0%,rgba(139,107,255,.28),transparent 60%),linear-gradient(180deg,#140d2c,#0b0a1d);
  border:1px solid rgba(139,107,255,.5);border-radius:var(--ds-r-lg,16px);box-shadow:0 0 24px rgba(139,107,255,.16);
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
.necro-head::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(190,160,255,.04) 0 1px,transparent 1px 4px);pointer-events:none}
.necro-head__top{position:relative;display:flex;align-items:center;gap:12px}
.necro-emblem{flex:0 0 auto;width:46px;height:46px;display:flex;align-items:center;justify-content:center;color:#d7c8ff;font-size:24px;
  border:1px solid rgba(139,107,255,.7);border-radius:var(--ds-r-md,10px);background:linear-gradient(155deg,rgba(139,107,255,.4),rgba(10,6,26,.9));box-shadow:0 0 16px rgba(139,107,255,.45)}
.necro-title{font:700 18px/1.1 var(--ds-font-display,'Chakra Petch',sans-serif);letter-spacing:.08em;text-transform:uppercase;color:#e6dcff;text-shadow:0 0 14px rgba(139,107,255,.6)}
.necro-sub{margin-top:3px;font-size:12px;color:var(--ds-text-2,#a9b8d6);font-weight:700}
.necro-capbox{margin-left:auto;text-align:right;line-height:1}
.necro-capbox small{display:block;font:700 9px var(--ds-font-display,sans-serif);letter-spacing:.14em;color:var(--ds-text-3,#6f7fa3);text-transform:uppercase;margin-bottom:3px}
.necro-capbox b{font:700 24px var(--ds-font-display,sans-serif);color:#d7c8ff}.necro-capbox b i{font-style:normal;font-size:15px;color:var(--ds-text-3,#6f7fa3)}
.necro-slots{position:relative;display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 4px}
.necro-slot{position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center;padding:0;color:#d7c8ff;font-size:22px;cursor:pointer;
  border:1.5px solid color-mix(in srgb,var(--rk,#9aa3ad) 80%,transparent);border-radius:var(--ds-r-md,10px);background:linear-gradient(155deg,rgba(139,107,255,.42),rgba(10,6,26,.92) 75%);
  box-shadow:0 0 12px rgba(139,107,255,.35)}
.necro-slot b{position:absolute;right:3px;bottom:1px;font:700 10px var(--ds-font-display,sans-serif);color:var(--rk,#fff);text-shadow:0 1px 2px #000}
.necro-slot.empty{cursor:default;border:1.5px dashed rgba(139,107,255,.4);background:rgba(10,6,26,.5);box-shadow:none;color:rgba(190,160,255,.35)}
.necro-slot:focus-visible,.necro-btn:focus-visible{outline:2px solid var(--ds-accent,#46d4ff);outline-offset:2px}
.necro-opt{position:relative;display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(139,107,255,.25);font-size:12px;font-weight:800;color:var(--ds-text-2,#a9b8d6);cursor:pointer}
.necro-sw{position:relative;flex:0 0 auto;width:42px;height:24px}
.necro-sw input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.necro-sw i{position:absolute;inset:0;border-radius:99px;background:rgba(255,255,255,.1);border:1px solid var(--ds-line-strong,rgba(130,200,255,.36));transition:background var(--ds-med,220ms)}
.necro-sw i::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#cfd8ee;transition:transform var(--ds-med,220ms) var(--ds-ease,ease)}
.necro-sw input:checked+i{background:rgba(139,107,255,.55);border-color:#8b6bff}.necro-sw input:checked+i::after{transform:translateX(18px);background:#fff}
.necro-sw input:focus-visible+i{outline:2px solid var(--ds-accent,#46d4ff);outline-offset:2px}
.necro-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px}
.necro-card{position:relative;display:flex;flex-direction:column;gap:9px;padding:12px;border-radius:var(--ds-r-md,10px);
  background:linear-gradient(160deg,color-mix(in srgb,var(--rc,#b8c0cc) 12%,transparent),rgba(10,8,26,.88) 55%);border:1px solid color-mix(in srgb,var(--rc,#b8c0cc) 45%,var(--ds-line,rgba(130,180,255,.16)))}
.necro-card.active{border-color:#8b6bff;box-shadow:0 0 0 1px rgba(139,107,255,.6),0 0 18px rgba(139,107,255,.28)}
.necro-top{display:flex;align-items:center;gap:11px}
.necro-sil{position:relative;flex:0 0 auto;width:56px;height:62px;display:flex;align-items:center;justify-content:center;color:#d7c8ff;font-size:28px;
  border-radius:var(--ds-r-md,10px);border:1.5px solid color-mix(in srgb,var(--rc,#b8c0cc) 70%,transparent);
  background:radial-gradient(circle at 50% 35%,rgba(139,107,255,.55),rgba(14,8,34,.95) 70%);box-shadow:inset 0 -10px 16px rgba(0,0,0,.4),0 0 14px rgba(139,107,255,.35)}
.necro-sil::after{content:'';position:absolute;left:12%;right:12%;bottom:5px;height:5px;border-radius:50%;background:radial-gradient(ellipse,rgba(139,107,255,.7),transparent 70%)}
.necro-sil .necro-ic{filter:drop-shadow(0 0 8px #8b6bff)}
.necro-tt{flex:1;min-width:0}
.necro-name{font:700 15px/1.15 var(--ds-font-display,sans-serif);letter-spacing:.03em;color:#fff}
.necro-origin{margin-top:2px;font-size:11px;color:var(--ds-text-3,#6f7fa3);font-weight:700}
.necro-rar{margin-top:4px;display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.necro-rar .r{font:700 10px var(--ds-font-display,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--rc,#b8c0cc)}
.necro-rar .ds-badge{font-size:10px;padding:1px 7px}
.necro-rank{flex:0 0 auto}
.necro-xp{display:flex;flex-direction:column;gap:4px}
.necro-xp__t{display:flex;justify-content:space-between;font:700 11px var(--ds-font-display,sans-serif);letter-spacing:.04em;color:var(--ds-text-2,#a9b8d6)}
.necro-xp__t b{color:#d7c8ff}
.necro-xp .ds-bar__fill{background:linear-gradient(90deg,#6a49e0,#b48bff)}
.necro-stats{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.necro-stats .ds-stat{padding:4px 0;font-size:12px}
.necro-stats .ds-stat span{display:inline-flex;align-items:center;gap:5px}
.necro-ab{display:flex;gap:7px;padding:8px 10px;border-radius:var(--ds-r-md,10px);background:rgba(139,107,255,.1);border:1px solid rgba(139,107,255,.25);font-size:11px;line-height:1.35;color:var(--ds-text-2,#a9b8d6);font-weight:700}
.necro-ab .necro-ic{color:#b48bff;margin-top:1px}.necro-ab b{color:#d7c8ff;font-family:var(--ds-font-display,sans-serif);letter-spacing:.03em}
.necro-evo{display:flex;align-items:center;gap:6px;font-size:11px;color:#b9a6f5;font-weight:800}
.necro-evo.max{color:var(--ds-gold,#ffc94a)}
.necro-btns{display:flex;gap:8px;margin-top:2px}
.necro-btns .ds-btn{flex:1;min-height:40px}.necro-btns .necro-rl{flex:0 0 auto;padding:0 14px}
.necro-btns .necro-rl.arm{background:linear-gradient(180deg,#ff6b84,#c42a46);color:#fff;border-color:transparent}
.necro-empty{padding:30px 16px;text-align:center;color:var(--ds-text-3,#6f7fa3);font-weight:700;line-height:1.5;border:1px dashed rgba(139,107,255,.35);border-radius:var(--ds-r-lg,16px)}
.necro-empty .necro-ic{display:flex;justify-content:center;margin-bottom:8px;color:#8b6bff;opacity:.7}
@media(min-width:900px){.necro-panel{font-size:14px}.necro-list{grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}.necro-slot{width:52px;height:52px}}
/* ---- annonce d'éveil ---- */
.necro-awaken{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;transition:background 2.2s ease,opacity .7s ease;opacity:1;cursor:pointer;
  font-family:var(--ds-font-display,'Chakra Petch',sans-serif);-webkit-tap-highlight-color:transparent}
.necro-awaken.on{background:radial-gradient(ellipse at center,rgba(24,8,52,.94),rgba(3,0,10,.98) 75%)}.necro-awaken.off{opacity:0}
.necro-awaken::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(190,160,255,.05) 0 1px,transparent 1px 4px);pointer-events:none;opacity:0;transition:opacity 2s ease 1s}
.necro-awaken.on::before{opacity:1}
.necro-awaken-cv{position:absolute;inset:0;width:100%;height:100%}
.necro-awaken-frame{position:absolute;inset:max(14px,3vmin);pointer-events:none;opacity:0;transition:opacity 1.4s ease 1.2s;
  background:linear-gradient(#8b6bff,#8b6bff) top left/28px 2px no-repeat,linear-gradient(#8b6bff,#8b6bff) top left/2px 28px no-repeat,linear-gradient(#8b6bff,#8b6bff) top right/28px 2px no-repeat,linear-gradient(#8b6bff,#8b6bff) top right/2px 28px no-repeat,
  linear-gradient(#8b6bff,#8b6bff) bottom left/28px 2px no-repeat,linear-gradient(#8b6bff,#8b6bff) bottom left/2px 28px no-repeat,linear-gradient(#8b6bff,#8b6bff) bottom right/28px 2px no-repeat,linear-gradient(#8b6bff,#8b6bff) bottom right/2px 28px no-repeat;filter:drop-shadow(0 0 6px #8b6bff)}
.necro-awaken.on .necro-awaken-frame{opacity:.9}
.necro-awaken-txt{position:relative;width:min(860px,100%);text-align:center;padding:0 20px;opacity:0;transform:scale(.92);transition:opacity 1.6s ease 1.4s,transform 2.4s ease 1.4s}
.necro-awaken.on .necro-awaken-txt{opacity:1;transform:scale(1)}
.necro-awaken-sys{display:inline-flex;align-items:center;gap:8px;padding:4px 14px;margin-bottom:16px;border:1px solid rgba(70,212,255,.45);background:rgba(70,212,255,.08);color:var(--ds-accent,#46d4ff);
  font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:700;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.necro-awaken-sub{color:#b9a6f5;font:700 13px var(--ds-font-body,'Nunito',sans-serif);letter-spacing:.08em;margin-bottom:12px;text-transform:uppercase}
.necro-awaken-title{font-size:clamp(30px,8.6vw,72px);line-height:1;font-weight:700;color:#fff;letter-spacing:.08em;text-shadow:0 0 18px #8b6bff,0 0 44px #5a1fc4,0 0 90px rgba(139,107,255,.5);animation:necrogl 3.2s ease-in-out infinite}
.necro-awaken-cls{display:flex;align-items:center;justify-content:center;gap:14px;font-size:clamp(18px,5vw,34px);font-weight:700;color:#c9b4ff;letter-spacing:.22em;margin-top:12px;text-shadow:0 0 16px #7a35e0}
.necro-awaken-cls::before,.necro-awaken-cls::after{content:'';flex:1;max-width:90px;height:1px;background:linear-gradient(90deg,transparent,#8b6bff)}
.necro-awaken-cls::after{transform:scaleX(-1)}
.necro-awaken-rar{display:inline-block;margin-top:22px;padding:5px 16px;color:var(--ds-gold,#ffc94a);font:700 13px var(--ds-font-display,sans-serif);letter-spacing:.1em;border:1px solid rgba(255,201,74,.5);background:rgba(255,201,74,.09);
  box-shadow:0 0 18px rgba(255,201,74,.18);clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)}
.necro-awaken-hint{margin-top:30px;color:var(--ds-text-3,#6f7fa3);font:700 11px var(--ds-font-display,sans-serif);letter-spacing:.2em;text-transform:uppercase;animation:necroblink 1.6s infinite}
@keyframes necroblink{50%{opacity:.25}}
@keyframes necrogl{0%,100%{text-shadow:0 0 18px #8b6bff,0 0 44px #5a1fc4,0 0 90px rgba(139,107,255,.5)}50%{text-shadow:0 0 26px #b48bff,0 0 60px #7a35e0,0 0 120px rgba(139,107,255,.7)}}
@media(prefers-reduced-motion:reduce){.necro-awaken-title,.necro-awaken-hint{animation:none}.necro-awaken-txt{transition:opacity .6s ease}}
`;
    document.head.appendChild(st);
  }

  function renderPanel(container, profile) {
    injectCSS(); ensureProfile(profile);
    const ar = profile.army, stats = ownerStats(profile, false), cap = capOf(profile, stats);
    const refresh = () => renderPanel(container, profile);
    const capL = levelCapFor(profile);
    const sorted = ar.minions.slice().sort((a, b) => (ar.active.indexOf(b.uid) >= 0) - (ar.active.indexOf(a.uid) >= 0) || rankIdx(b.rank) - rankIdx(a.rank) || b.level - a.level);
    const catIco = (c, size) => ico(CAT_ICO[c.id] || 'skull', size) || '<span>' + c.icon + '</span>';
    const rankBadge = (rank, ri, cls) => '<span class="ds-rank ' + (cls || 'ds-rank--md') + ' necro-rank" data-rank="' + esc(rank) + '" style="--rk:' + RANK_COLORS[ri] + '">' + esc(rank) + '</span>';

    // ---- en-tête : titre, compteur, emplacements actifs, option ----
    let html = '<div class="necro-panel"><div class="necro-head"><div class="necro-head__top"><span class="necro-emblem">' + (ico('skull', 26) || '💀') + '</span>' +
      '<div><div class="necro-title">Armée des ombres</div><div class="necro-sub">Réserve : ' + ar.minions.length + ' / ' + ROSTER_MAX + ' · les actifs vous suivent en donjon</div></div>' +
      '<div class="necro-capbox"><small>Actifs</small><b>' + ar.active.length + '<i> / ' + cap + '</i></b></div></div><div class="necro-slots" role="group" aria-label="Serviteurs actifs">';
    const actives = ar.active.map((u) => ar.minions.find((m) => m.uid === u)).filter(Boolean);
    for (let i = 0; i < cap; i++) {
      const rec = actives[i];
      if (rec) { const c = CATS[rec.cat], ri = rankIdx(rec.rank); html += '<button type="button" class="necro-slot" style="--rk:' + RANK_COLORS[ri] + '" data-act="off" data-uid="' + esc(rec.uid) + '" title="' + esc(servantName(rec) + ' — retirer des actifs') + '" aria-label="' + esc(servantName(rec) + ' : retirer des actifs') + '"><span class="necro-ic">' + catIco(c, 22) + '</span><b>' + esc(rec.rank) + '</b></button>'; }
      else html += '<div class="necro-slot empty" aria-label="Emplacement libre"><span class="necro-ic">' + (ico('plus', 18) || '+') + '</span></div>';
    }
    // ---- aide : comment avoir plus de soldats ----
    {
      const lv = profile.niveau || 1, nextLv = (Math.floor(lv / 10) + 1) * 10;
      const key = (() => { try { const eq = profile.skills && profile.skills.equipped || {}; const slot = Object.keys(eq).find(sl => eq[sl] === 'necro_extract'); return slot && G.Keys && G.Keys.labelOf ? G.Keys.labelOf(slot) : ''; } catch (e) { return ''; } })();
      html += '<div class="necro-help"><b>Comment avoir plus de soldats ?</b><ul>' +
        '<li><b>Recruter :</b> en donjon, utilise <b>Extraction d\'âme</b>' + (key ? ' (touche <b>' + esc(key) + '</b>)' : '') + ' juste après avoir vaincu un ennemi : son âme peut devenir un serviteur (les boss et élites donnent les meilleurs).</li>' +
        '<li><b>Plus de places actives</b> (' + ar.active.length + ' / ' + cap + ') : +1 au <b>niveau ' + nextLv + '</b> (puis tous les 10 niveaux), +1 en rang D, +2 en rang B, +3 en A, +4 en S, +1 avec la spécialisation <b>Maître de légion</b>, +1 avec <b>Commandement</b> niveau 5.</li>' +
        '<li><b>Renforts temporaires :</b> <b>Armée des morts</b> (niveau 20) et l\'ultime <b>Souverain des Ombres</b> (niveau 5) font surgir des soldats en plus de ta limite.</li>' +
        '</ul></div>';
    }
    html += '</div><label class="necro-opt"><span class="necro-sw"><input type="checkbox" data-act="auto"' + (profile.settings.necroAuto !== false ? ' checked' : '') + '><i></i></span>Extraction automatique (chance réduite)</label></div>';

    if (!ar.minions.length) {
      html += '<div class="necro-empty"><span class="necro-ic">' + (ico('skull', 34) || '💀') + '</span>Aucun serviteur.<br>Extrayez l\'âme des ennemis vaincus en donjon.</div></div>';
      container.innerHTML = html; bind(); return;
    }
    html += '<div class="ds-section-title">Serviteurs · ' + ar.minions.length + '</div><div class="necro-list">';
    for (const rec of sorted) {
      const c = CATS[rec.cat], ri = rankIdx(rec.rank), st = servantStats(rec, stats, profile.niveau || 1), isAct = ar.active.indexOf(rec.uid) >= 0;
      const nx = servantXpNext(rec.level), atCap = rec.level >= capL;
      const pct = atCap ? 100 : Math.floor(100 * rec.xp / nx);
      const nextRankLevel = (ri + 1) * 10;
      const full = !isAct && ar.active.length >= cap;
      html += '<div class="necro-card' + (isAct ? ' active' : '') + '" data-uid="' + esc(rec.uid) + '" style="--rc:' + (RAR_COLOR[rec.rarity] || RAR_FULL[rec.rarity] || '#b8c0cc') + ';--rk:' + RANK_COLORS[ri] + '">' +
        '<div class="necro-top"><div class="necro-sil"><span class="necro-ic">' + catIco(c, 30) + '</span></div><div class="necro-tt"><div class="necro-name">' + esc(servantName(rec)) + '</div>' +
        '<div class="necro-origin">' + esc(c.role + (rec.origin ? ' · ' + rec.origin : '')) + '</div>' +
        '<div class="necro-rar"><span class="r">' + esc(RAR_NAME[rec.rarity] || rec.rarity) + '</span><span class="ds-badge ds-badge--violet">Niv. ' + rec.level + '</span><span class="ds-badge">' + (rec.kills || 0) + ' victimes</span></div></div>' + rankBadge(rec.rank, ri) + '</div>' +
        '<div class="necro-xp"><div class="necro-xp__t"><span>' + (atCap ? (rec.level >= SERV_MAX_LEVEL ? 'Niveau maximum' : 'Plafonné par votre rang') : 'XP') + '</span><span>' + (atCap ? '' : '<b>' + rec.xp + '</b> / ' + nx) + '</span></div><div class="ds-bar ds-bar--xp"><span class="ds-bar__fill" style="width:' + pct + '%"></span></div></div>' +
        '<div class="ds-stat-grid necro-stats"><div class="ds-stat"><span class="ds-stat__label">' + (ico('heart', 14) || '❤️') + ' PV</span><b class="ds-stat__value">' + Math.round(st.pv) + '</b></div><div class="ds-stat"><span class="ds-stat__label">' + (ico('sword', 14) || '⚔️') + ' Dégâts</span><b class="ds-stat__value">' + Math.round(st.dmg) + '</b></div>' +
        '<div class="ds-stat"><span class="ds-stat__label">' + (ico('arrow-right', 14) || '👟') + ' Vitesse</span><b class="ds-stat__value">' + st.speed.toFixed(1) + '</b></div><div class="ds-stat"><span class="ds-stat__label">' + (ico('target', 14) || '🎯') + ' Portée</span><b class="ds-stat__value">' + st.range.toFixed(1) + '</b></div></div>' +
        '<div class="necro-ab"><span class="necro-ic">' + (ico('sparkles', 14) || '✦') + '</span><span><b>' + esc(c.abName) + '</b> — ' + esc(c.abDesc) + '</span></div>' +
        (ri < 5 ? '<div class="necro-evo"><span class="necro-ic">' + (ico('arrow-up', 13) || '▲') + '</span>Niv. ' + nextRankLevel + ' → ' + esc(c.evo[ri + 1]) + (nextRankLevel > capL ? ' (rang du maître insuffisant)' : '') + '</div>'
          : '<div class="necro-evo max"><span class="necro-ic">' + (ico('star-fill', 13) || '★') + '</span>Évolution maximale</div>') +
        '<div class="necro-btns"><button type="button" class="ds-btn ' + (isAct ? 'ds-btn--secondary' : 'ds-btn--violet') + '" data-act="' + (isAct ? 'off' : 'on') + '" data-uid="' + esc(rec.uid) + '"' + (full ? ' disabled title="Maximum d\'invocations atteint"' : '') + '>' + (isAct ? 'Actif · retirer' : full ? 'Armée au complet' : 'Mettre en actif') + '</button>' +
        '<button type="button" class="ds-btn ds-btn--danger necro-rl" data-act="rl" data-uid="' + esc(rec.uid) + '">Renvoyer</button></div></div>';
    }
    html += '</div></div>';
    container.innerHTML = html; bind();

    function bind() {
      const auto = container.querySelector('[data-act="auto"]');
      if (auto) auto.onchange = () => { profile.settings.necroAuto = auto.checked; persist(profile); };
      container.onclick = (ev) => {
        const el = ev.target.closest && ev.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT' || !container.contains(el)) return;
        const act = el.dataset.act, uid = el.dataset.uid;
        if (act === 'on' || act === 'off') { setActive(profile, uid, act === 'on'); persist(profile); refresh(); }
        else if (act === 'rl') {
          if (!el._armed) { el._armed = true; el.classList.add('arm'); el.textContent = 'Confirmer ?'; el._to = setTimeout(() => { el._armed = false; el.classList.remove('arm'); el.textContent = 'Renvoyer'; }, 3000); return; }
          clearTimeout(el._to); releaseServant(profile, uid); persist(profile); refresh();
        }
      };
    }
  }

  function registerPanel() {
    const def = { id: 'armee', title: 'Armée', icon: '💀', order: 60, visible: (p) => !!p && p.classe === CLS, render: renderPanel, badge: (p) => (p && p.army && p.army.minions ? p.army.minions.length : 0) };
    try {
      if (G.UI && typeof G.UI.registerPanel === 'function') G.UI.registerPanel(def);
      else if (G.Panels && typeof G.Panels.register === 'function') { if (!(G.Panels.has && G.Panels.has('armee'))) G.Panels.register('armee', def); }
    } catch (e) { /* ignore */ }
  }
  registerPanel();

  // =================================================================
  // Export
  // =================================================================
  G.Necro = {
    P: P_AWAKEN, rarityText: RARITY_TEXT,
    TEMP_MINION, ensureProfile, awakeningRoll, announce, isUnlocked, resetCreation, creationState, pendingConversion, offerConversion, convertToNecromancien,
    cap: (profile) => capOf(profile, ownerStats(profile, false)),
    CATEGORIES: CATS, RANKS, SKILLS,
    addServant, releaseServant, setActive, servantStats: (rec, stats, lvl) => servantStats(rec, stats, lvl), servantName, servantXpNext,
    activeServants: (profile) => { ensureProfile(profile); return profile.army.active.map(u => profile.army.minions.find(m => m.uid === u)).filter(Boolean); },
    summonActive: (api) => summonActive(api || SA(), {}),
    liveCount: () => S.live.length, corpses: () => S.corpses.length,
    renderPanel, registerSkills, sovereignActive: () => !!(S.sov.until && S.clock < S.sov.until),
    __state: S,
    __test: { simulate(n) { let w = 0; n = n | 0; for (let i = 0; i < n; i++) if (draw().won) w++; return w; } },
  };
})();
