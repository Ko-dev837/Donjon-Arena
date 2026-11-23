window.G = window.G || {};
/* =====================================================================
   Donjon Arena 3D v3 — js/ui/class-select.js  (rôle 13)
   Écran de création immersif : galerie de 8 classes, présentation animée
   propre à chaque classe (canvas 2D + SVG/CSS), Nécromancien secret,
   « Rituel d'éveil ».

   API : G.ClassSelect.mount(container, {onConfirm(classId, nom, extra), onCancel, profile, necroUnlocked, defaultName})
         G.ClassSelect.unmount()        // nettoie rAF, audio, WebGL, listeners, DOM
         G.ClassSelect.select(id)       // sélection programmatique (démo/tests)
         G.ClassSelect.demoNecro()      // joue l'obtention du Nécromancien (démo)
         G.ClassSelect.isMounted()
   onConfirm reçoit en 3e argument { awakening:{ rolled:boolean, won:boolean } }.
   Un seul requestAnimationFrame ; aucun setTimeout (tout est piloté par la timeline du rAF).
   ===================================================================== */
(() => {
  'use strict';

  const IDS = ['Guerrier', 'Mage', 'Voleur', 'Assassin', 'Archer', 'Paladin', 'Elementaliste', 'Necromancien'];
  const OL = '#120c26';
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);       // visuel uniquement (jamais le gameplay)
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3);

  // ------------------------------------------------------------------
  //  DONNÉES DE SECOURS (si G.CLASSES absent ou incomplet)
  // ------------------------------------------------------------------
  const FB = {
    Guerrier: { name: 'Guerrier', icon: '🛡️', color: '#ff5a3c', role: 'Rempart · Mêlée',
      desc: "Rempart de la crypte. Armure lourde, épée à deux mains et volonté de fer : il encaisse tout et frappe comme un marteau.",
      stats: { pv: 100, force: 88, defense: 95, vitesse: 38, intelligence: 18, mana: 30 },
      skills: [['⚔️', "Coup d'épée"], ['📣', 'Cri de guerre'], ['💥', 'Onde de choc'], ['🌪️', 'Tornade Ultime']] },
    Mage: { name: 'Mage', icon: '🔮', color: '#a05bff', role: 'Magie · Distance',
      desc: "Fragile mais dévastateur. Il tisse les runes, jongle avec le feu, la glace et l'arcane, et rase des groupes entiers.",
      stats: { pv: 45, force: 30, defense: 28, vitesse: 55, intelligence: 100, mana: 100 },
      skills: [['🔥', 'Boule de feu'], ['❄️', 'Éclat de givre'], ['🌀', 'Nova arcanique'], ['☄️', 'Météore']] },
    Voleur: { name: 'Voleur', icon: '🗡️', color: '#2fd0b6', role: 'Ruse · Distance',
      desc: "Rapide et insaisissable. Dagues lancées, pièces volées, fumigènes : on ne le touche jamais là où il est.",
      stats: { pv: 55, force: 55, defense: 40, vitesse: 85, intelligence: 45, mana: 50 },
      skills: [['🗡️', 'Lancer de dague'], ['💨', 'Fumigène'], ['🪙', 'Pluie de pièces'], ['🌪️', 'Tornade de lames']] },
    Assassin: { name: 'Assassin', icon: '🥷', color: '#ff2e5b', role: 'Vitesse · Critique',
      desc: "Une ombre qui frappe avant d'être vue. Des coups critiques foudroyants, des déplacements éclairs, aucune pitié.",
      stats: { pv: 48, force: 82, defense: 30, vitesse: 100, intelligence: 40, mana: 55 },
      skills: [['🔪', 'Lame fantôme'], ['👤', 'Pas d\'ombre'], ['✖️', 'Entaille croisée'], ['🌑', 'Danse mortelle']] },
    Archer: { name: 'Archer', icon: '🏹', color: '#58e06c', role: 'Précision · Distance',
      desc: "Œil de faucon et flèches qui traversent tout. Il frappe de loin, pose des pièges et ne manque jamais sa cible.",
      stats: { pv: 52, force: 70, defense: 35, vitesse: 78, intelligence: 50, mana: 55 },
      skills: [['🏹', 'Tir précis'], ['🎯', 'Flèche perçante'], ['🌧️', 'Pluie de flèches'], ['💫', 'Tir du faucon']] },
    Paladin: { name: 'Paladin', icon: '⚜️', color: '#ffd23f', role: 'Sacré · Soutien',
      desc: "Chevalier de lumière. Sa foi le protège, soigne ses alliés et réduit en cendres les créatures de l'ombre.",
      stats: { pv: 90, force: 68, defense: 88, vitesse: 40, intelligence: 62, mana: 70 },
      skills: [['🔨', 'Marteau sacré'], ['✨', 'Lumière guérisseuse'], ['🛡️', 'Égide divine'], ['☀️', 'Jugement céleste']] },
    Elementaliste: { name: 'Élémentaliste', icon: '⚡', color: '#4fd8ff', role: 'Foudre · Glace',
      desc: "Maître des tempêtes et du givre. La foudre frappe, la glace fige : deux éléments, une seule volonté.",
      stats: { pv: 50, force: 40, defense: 34, vitesse: 62, intelligence: 95, mana: 90 },
      skills: [['⚡', 'Éclair'], ['❄️', 'Lance de glace'], ['🌩️', 'Chaîne de foudre'], ['🌨️', 'Tempête polaire']] },
    Necromancien: { name: 'Nécromancien', icon: '💀', color: '#a63cff', role: 'Ombre · Armée',
      desc: "Il commande les morts. Squelettes, spectres et ombres se lèvent à son appel pour former une armée qui ne dort jamais.",
      stats: { pv: 58, force: 45, defense: 40, vitesse: 50, intelligence: 100, mana: 100 },
      skills: [['💀', 'Trait d\'ombre'], ['🦴', 'Lever les morts'], ['👻', 'Étreinte spectrale'], ['🕯️', 'Armée des ombres']] },
  };
  const STAT_KEYS = [['pv', 'PV'], ['force', 'Force'], ['defense', 'Défense'], ['vitesse', 'Vitesse'], ['intelligence', 'Magie'], ['mana', 'Mana']];
  const RARITY_NECRO = '0,01\u00a0% — 1 chance sur 10\u00a0000';

  // ------------------------------------------------------------------
  //  HABILLAGE « Interface d'Éveil » : icônes SVG (G.Icons, secours emoji), difficulté, noms aléatoires
  // ------------------------------------------------------------------
  const CLS_ICON = { Guerrier: 'sword', Mage: 'staff', Voleur: 'dagger', Assassin: 'shadow', Archer: 'bow', Paladin: 'holy', Elementaliste: 'lightning', Necromancien: 'skull' };
  const EL_ICON = { physique: 'sword', feu: 'fire', glace: 'ice', foudre: 'lightning', ombre: 'shadow', sacre: 'holy', poison: 'poison' };
  const FB_SKILL_ICONS = {
    Guerrier: ['sword', 'flag', 'hammer', 'refresh'], Mage: ['fire', 'ice', 'sparkles', 'star'], Voleur: ['dagger', 'eye', 'gold', 'refresh'],
    Assassin: ['dagger', 'shadow', 'sword', 'skull'], Archer: ['bow', 'target', 'arrow-up', 'star'], Paladin: ['hammer', 'heart', 'shield', 'holy'],
    Elementaliste: ['lightning', 'ice', 'lightning', 'ice'], Necromancien: ['shadow', 'skull', 'users', 'crown'],
  };
  const SKILL_KIND = ['Attaque de base', 'Active', 'Active', 'Ultime'];
  const STAT_ICON = { pv: 'heart', force: 'sword', defense: 'shield', vitesse: 'timer', intelligence: 'sparkles', mana: 'mana' };
  const DIFF = { Guerrier: 1, Archer: 2, Paladin: 2, Mage: 3, Voleur: 3, Assassin: 4, Elementaliste: 4, Necromancien: 5 };
  const DIFF_LBL = ['', 'Facile', 'Accessible', 'Moyen', 'Difficile', 'Expert'];
  const NAME_A = ['Ka', 'Ly', 'Mor', 'Thal', 'Zar', 'Eld', 'Syl', 'Bran', 'Ori', 'Va', 'Nyx', 'Kael', 'Rho', 'Isa', 'Dra', 'Fen', 'Gor', 'Hel', 'Jor', 'Lum', 'Tor', 'Ze', 'Ari', 'Cor'];
  const NAME_B = ['', '', 'ra', 'vi', 'lo', 'na', 'dri', 'mu', 'the', 'ki', 'sa'];
  const NAME_C = ['n', 'ris', 'dor', 'wen', 'x', 'th', 'la', 'mir', 'gar', 'ion', 'a', 'el', 'os', 'ek', 'ia', 'dan'];
  const DICE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/></svg>';
  const CRACK_SVG = '<svg class="cs-crack-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M58 0 L52 14 L60 27 L47 41 L55 55 L41 70 L48 84 L40 100" stroke-width="1.4"/><path d="M60 27 L78 33 L88 48 M47 41 L28 38 L14 49 M55 55 L72 64 L80 80 M41 70 L24 76 L12 92 M52 14 L36 10 L24 0" stroke-width=".9"/><path d="M78 33 L84 22 M28 38 L22 26 M72 64 L86 62" stroke-width=".6"/></g></svg>';
  function icoOk(name) { try { return !!(G.Icons && G.Icons.svg && (!G.Icons.has || G.Icons.has(name))); } catch (_) { return false; } }
  function ic(name, size, fb) {
    try { if (icoOk(name)) { const r = G.Icons.svg(name, { size: size || 20 }); if (r) return r; } } catch (_) {}
    return fb ? `<span class="cs-emo" aria-hidden="true">${fb}</span>` : '';
  }
  function hoverSnd() { try { G.DS && G.DS.sound && G.DS.sound('hover'); } catch (_) {} }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function genName() {
    const pk = (a) => a[Math.floor(Math.random() * a.length)];
    for (let i = 0; i < 8; i++) { const n = pk(NAME_A) + pk(NAME_B) + pk(NAME_C); if (n.length >= 4 && n.length <= 11) return n.charAt(0).toUpperCase() + n.slice(1); }
    return 'Kaelor';
  }
  function roleParts(role) { return String(role || '').split(/\s*[·\/,|]\s*/).filter(Boolean).slice(0, 2); }

  const hex = (c, d) => typeof c === 'number' ? '#' + ('000000' + c.toString(16)).slice(-6) : (typeof c === 'string' && c ? c : d);
  function rgba(h, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return `rgba(255,255,255,${a})`;
    const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Fusionne G.CLASSES (rôle 12) avec le secours local : jamais de champ vide
  function info(id) {
    const f = FB[id] || FB.Guerrier;
    const c = (G.CLASSES && G.CLASSES[id]) || null;
    const o = { id, name: f.name, icon: f.icon, color: f.color, role: f.role, desc: f.desc, secret: id === 'Necromancien', rarityText: id === 'Necromancien' ? RARITY_NECRO : '' };
    let statsAbs = null, skills = f.skills.map((s, i) => ({ icon: s[0], name: s[1], ico: (FB_SKILL_ICONS[id] || [])[i] || 'star', kind: SKILL_KIND[i] }));
    if (c) {
      if (c.name) o.name = c.name;
      if (c.icon) o.icon = c.icon;
      if (c.colorCss || c.color != null) o.color = c.colorCss || hex(c.color, f.color);
      if (c.role) o.role = c.role;
      if (c.desc) o.desc = c.desc;
      if (c.rarityText) o.rarityText = c.rarityText;
      if (c.base) {
        statsAbs = {}; STAT_KEYS.forEach(([k]) => { if (c.base[k] != null) statsAbs[k] = c.base[k]; });
        if (!Object.keys(statsAbs).length) statsAbs = null;
      }
      if (G.SKILLS) {
        const ids = [c.basic && c.basic.skillId, c.defaultSkills && c.defaultSkills.cast2, c.defaultSkills && c.defaultSkills.cast3, c.defaultSkills && c.defaultSkills.super];
        ids.forEach((sid, i) => {
          const s = sid && G.SKILLS[sid]; if (!s) return;
          let d = ''; try { d = typeof s.desc === 'function' ? s.desc(1) : (s.desc || ''); } catch (_) { d = ''; }
          skills[i] = { icon: s.icon || skills[i].icon, name: s.name || skills[i].name, ico: EL_ICON[s.element] || skills[i].ico, kind: skills[i].kind, desc: d, mana: s.manaCost, cd: s.cd, element: s.element };
        });
      }
    }
    o.statsAbs = statsAbs; o.skills = skills; o.fbStats = f.stats;
    o.diff = clamp(Math.round((c && c.difficulty) || DIFF[id] || 3), 1, 5);
    return o;
  }
  // Barres 0..1 : relatives au max de toutes les classes lues dans G.CLASSES ; sinon échelle locale
  function statBars(o) {
    const out = [];
    STAT_KEYS.forEach(([k, label]) => {
      let v, frac;
      if (o.statsAbs && o.statsAbs[k] != null) {
        let max = 0; IDS.forEach(i => { const cc = G.CLASSES && G.CLASSES[i]; if (cc && cc.base && cc.base[k] > max) max = cc.base[k]; });
        v = o.statsAbs[k]; frac = max > 0 ? v / max : 0.5; v = Math.round(v * 10) / 10;
      } else { v = o.fbStats[k]; frac = v / 100; }
      out.push({ k, label, frac: clamp(frac, 0.08, 1), val: v });
    });
    return out;
  }

  // ------------------------------------------------------------------
  //  ILLUSTRATIONS SVG (viewBox 200x280, contours noirs cartoon)
  // ------------------------------------------------------------------
  const P_ = (d, fill, sw) => `<path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${sw == null ? 4 : sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const C_ = (x, y, r, fill, sw) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${OL}" stroke-width="${sw == null ? 4 : sw}"/>`;
  const E_ = (x, y, rx, ry, fill, sw, extra) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${OL}" stroke-width="${sw == null ? 4 : sw}" ${extra || ''}/>`;
  const R_ = (x, y, w, h, r, fill, sw) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${OL}" stroke-width="${sw == null ? 4 : sw}" stroke-linejoin="round"/>`;
  const L_ = (x1, y1, x2, y2, w, c) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${OL}" stroke-width="${w + 6}" stroke-linecap="round" fill="none"/><path d="M${x1} ${y1}L${x2} ${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
  const SKIN = '#f6cfa4';
  const legs = (pants, boots) => L_(86, 196, 86, 250, 17, pants) + L_(114, 196, 114, 250, 17, pants) + R_(74, 246, 25, 22, 8, boots) + R_(101, 246, 25, 22, 8, boots);
  const eyes = (kind, col) => {
    if (kind === 'glow') return `<ellipse cx="89" cy="88" rx="6" ry="4" fill="${col}" class="cs-glow"/><ellipse cx="111" cy="88" rx="6" ry="4" fill="${col}" class="cs-glow"/>`;
    if (kind === 'narrow') return `<path d="M80 86 L97 91 L80 93Z" fill="#fff" stroke="${OL}" stroke-width="3"/><path d="M120 86 L103 91 L120 93Z" fill="#fff" stroke="${OL}" stroke-width="3"/><circle cx="91" cy="90" r="2.5" fill="${col || '#ff2e5b'}" class="cs-glow"/><circle cx="109" cy="90" r="2.5" fill="${col || '#ff2e5b'}" class="cs-glow"/>`;
    return `<ellipse cx="89" cy="90" rx="6" ry="7.5" fill="#fff" stroke="${OL}" stroke-width="3"/><ellipse cx="111" cy="90" rx="6" ry="7.5" fill="#fff" stroke="${OL}" stroke-width="3"/><circle cx="90.5" cy="91" r="3.4" fill="${OL}"/><circle cx="109.5" cy="91" r="3.4" fill="${OL}"/><circle cx="92" cy="89" r="1.2" fill="#fff"/><circle cx="111" cy="89" r="1.2" fill="#fff"/>`;
  };
  const head = (r) => C_(100, 88, r || 30, SKIN);
  const smile = `<path d="M92 104 Q100 110 108 104" stroke="${OL}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const hand = (x, y) => C_(x, y, 9, SKIN, 3.5);
  const torso = (fill) => P_('M70 126 Q100 114 130 126 L135 200 Q100 210 65 200Z', fill);

  const FIGS = {
    Guerrier: () => `
      ${P_('M72 128 Q100 118 128 128 L146 240 Q100 254 54 240Z', '#b3202f')}
      ${legs('#48546b', '#2b3446')}
      ${torso('#93a4c2')}
      ${P_('M91 126 L109 126 L111 206 L89 206Z', '#d9343f')}
      ${P_('M72 150 Q100 160 128 150', 'none', 3)}${R_(66, 186, 68, 12, 5, '#6a3a1c')}${R_(94, 184, 12, 16, 3, '#ffd23f', 3)}
      ${C_(72, 130, 15, '#aab9d6')}${C_(128, 130, 15, '#aab9d6')}
      ${L_(70, 136, 46, 182, 15, '#93a4c2')}${hand(46, 184)}
      <g class="cs-shield">${C_(36, 186, 30, '#d9343f')}${C_(36, 186, 22, '#f7a400', 3)}${C_(36, 186, 9, '#fff3b0', 3)}</g>
      ${head()}${smile}${eyes('n')}
      ${P_('M68 86 Q64 46 100 44 Q136 46 132 86 Q116 78 100 79 Q84 78 68 86Z', '#aab9d6')}
      ${R_(95, 52, 10, 28, 3, '#8798b8', 3)}
      <g class="cs-plume">${P_('M100 46 Q94 16 62 22 Q82 30 90 50Z', '#e0343f')}${P_('M100 46 Q110 20 136 28 Q118 32 108 50Z', '#ff7b3d')}</g>
      <g class="cs-sw">${L_(130, 134, 154, 186, 15, '#93a4c2')}
        ${R_(147, 170, 14, 30, 4, '#6a3a1c')}${C_(154, 168, 7, '#ffd23f', 3)}
        ${P_('M134 198 L174 198 L170 206 L138 206Z', '#ffd23f')}
        ${P_('M146 206 L162 206 L160 262 L154 276 L148 262Z', '#e9f1ff')}<path d="M154 208 L154 266" stroke="#9fb3d8" stroke-width="3"/>
        ${hand(154, 186)}</g>`,

    Mage: () => `
      ${P_('M70 126 Q100 114 130 126 L148 252 Q100 268 52 252Z', '#6b3fc4')}
      ${P_('M52 252 Q100 268 148 252 L146 240 Q100 254 54 240Z', '#ffd23f', 3)}
      ${P_('M92 130 L108 130 L112 250 L88 250Z', '#8a5be0', 3)}${R_(66, 184, 68, 11, 5, '#ffd23f', 3)}${C_(100, 190, 6, '#4fd8ff', 3)}
      ${R_(76, 246, 22, 18, 7, '#3b2a6a')}${R_(102, 246, 22, 18, 7, '#3b2a6a')}
      ${L_(70, 136, 52, 178, 16, '#7a4ed6')}${hand(52, 180)}
      <g class="cs-float"><circle cx="46" cy="148" r="11" fill="#ff7b3d" stroke="${OL}" stroke-width="3" class="cs-glow"/><circle cx="43" cy="145" r="4" fill="#fff3b0"/></g>
      ${head()}${smile}${eyes('n')}
      ${P_('M70 78 Q100 98 130 78 Q124 108 100 118 Q76 108 70 78Z', '#efe6ff', 3.5)}
      ${P_('M54 70 Q100 46 146 70 Q100 62 54 70Z', '#6b3fc4')}
      ${P_('M72 66 Q80 20 118 -2 Q112 28 128 66Z', '#6b3fc4')}
      ${R_(70, 60, 62, 11, 5, '#ffd23f', 3)}
      <g class="cs-glow" fill="#fff3b0"><path d="M98 34 l3 7 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1z"/></g>
      <g class="cs-staff">${L_(150, 70, 150, 268, 8, '#8b5a2b')}${L_(138, 120, 162, 120, 5, '#ffd23f')}
        <circle cx="150" cy="56" r="17" fill="#c9a6ff" stroke="${OL}" stroke-width="4" class="cs-glow"/><circle cx="144" cy="50" r="6" fill="#fff"/></g>
      ${L_(130, 136, 150, 160, 16, '#7a4ed6')}${hand(150, 162)}`,

    Voleur: () => `
      ${legs('#2a3a3d', '#1b2427')}
      ${torso('#2a9d8f')}
      ${P_('M70 126 L100 150 L130 126 L132 160 L100 176 L68 160Z', '#1f7a70', 3.5)}
      ${R_(64, 182, 72, 12, 5, '#5a3a1c')}
      <g class="cs-float">${C_(130, 206, 11, '#ffd23f', 3.5)}<text x="130" y="211" font-size="13" font-weight="900" text-anchor="middle" fill="#a87100" font-family="Arial Black">$</text></g>
      ${L_(70, 134, 48, 182, 15, '#1f7a70')}${hand(48, 184)}
      <g class="cs-dagL">${R_(41, 160, 14, 8, 3, '#5a3a1c', 3)}${P_('M44 160 L52 160 L48 112 Z', '#e9f1ff', 3.5)}${R_(36, 163, 24, 6, 3, '#ffd23f', 3)}</g>
      ${hand(48, 184)}
      ${head()}${eyes('n')}
      ${P_('M70 92 Q100 80 130 92 Q128 118 100 124 Q72 118 70 92Z', '#1f7a70', 3.5)}
      ${P_('M66 92 Q60 40 100 38 Q140 40 134 92 Q128 66 100 62 Q72 66 66 92Z', '#2a9d8f')}
      ${P_('M100 38 Q118 30 138 54 Q122 46 108 52Z', '#1f7a70', 3)}
      <g class="cs-dagR">${L_(130, 134, 152, 182, 15, '#1f7a70')}${R_(145, 160, 14, 8, 3, '#5a3a1c', 3)}${P_('M148 160 L156 160 L152 112 Z', '#e9f1ff', 3.5)}${R_(140, 163, 24, 6, 3, '#ffd23f', 3)}${hand(152, 184)}</g>`,

    Assassin: () => `
      <g class="cs-scarf">${P_('M72 122 Q40 128 22 160 Q50 148 70 150Z', '#e0143f', 3.5)}${P_('M70 130 Q38 150 30 188 Q56 166 72 158Z', '#a80d2c', 3.5)}</g>
      ${legs('#23253a', '#12131f')}
      ${torso('#2f3150')}
      ${P_('M70 126 L130 126 L100 196Z', '#1b1c30', 3)}${R_(64, 184, 72, 11, 5, '#e0143f', 3)}
      ${L_(70, 136, 56, 178, 15, '#23253a')}${hand(56, 180)}
      <g class="cs-bladeL">${P_('M56 176 Q18 150 40 96 Q36 140 62 168Z', '#dfe8ff', 3.5)}${R_(52, 174, 10, 14, 3, '#e0143f', 3)}</g>
      ${head()}${eyes('narrow', '#ff2e5b')}
      ${P_('M68 96 Q100 86 132 96 Q130 120 100 126 Q70 120 68 96Z', '#23253a', 3.5)}
      ${P_('M64 94 Q58 40 100 36 Q142 40 136 94 L126 80 Q100 70 74 80Z', '#2f3150')}
      ${P_('M96 40 Q104 20 130 14 Q120 34 108 44Z', '#2f3150', 3)}
      <g class="cs-bladeR">${L_(130, 136, 146, 178, 15, '#23253a')}${P_('M144 176 Q182 150 160 96 Q164 140 138 168Z', '#dfe8ff', 3.5)}${R_(138, 174, 10, 14, 3, '#e0143f', 3)}${hand(146, 180)}</g>`,

    Archer: () => `
      <g class="cs-quiver">${P_('M122 116 L146 136 L134 190 L112 170Z', '#7a4a22')}<path d="M130 120 L136 92M136 126 L146 100M124 122 L124 92" stroke="${OL}" stroke-width="3"/><path d="M136 92 l-4 -8 8 0z M146 100 l-4 -8 8 0z M124 92 l-4 -8 8 0z" fill="#e0343f" stroke="${OL}" stroke-width="2"/></g>
      ${legs('#6b4a2a', '#4a2f17')}
      ${torso('#3f9f4a')}
      ${P_('M70 126 L130 126 L100 162Z', '#2f7d3a', 3)}${R_(64, 184, 72, 12, 5, '#5a3a1c')}${R_(94, 183, 12, 14, 3, '#ffd23f', 3)}
      ${head()}${smile}${eyes('n')}
      ${P_('M66 80 Q70 44 100 42 Q130 44 134 80 Q116 66 100 66 Q84 66 66 80Z', '#2f7d3a')}
      ${P_('M96 46 Q100 14 140 8 Q122 22 118 50Z', '#e0343f', 3.5)}
      <g class="cs-bow">${P_('M30 96 Q-8 180 30 262', 'none', 7)}<path d="M30 96 Q-8 180 30 262" stroke="#c88a45" stroke-width="5" fill="none" stroke-linecap="round"/>
        <g class="cs-string"><path d="M30 96 L66 178 L30 262" stroke="#f4efe0" stroke-width="2.5" fill="none"/>
        <g class="cs-nock"><path d="M66 178 L168 178" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M66 178 L168 178" stroke="#e8c78a" stroke-width="3.5" stroke-linecap="round"/><path d="M168 178 l-12 -8 0 16z" fill="#dfe8ff" stroke="${OL}" stroke-width="2.5"/><path d="M68 178 l-10 -7 6 7 -6 7z" fill="#e0343f" stroke="${OL}" stroke-width="2"/></g></g></g>
      ${L_(70, 136, 40, 170, 15, '#2f7d3a')}${hand(36, 176)}${L_(130, 136, 118, 164, 15, '#2f7d3a')}${hand(70, 178)}`,

    Paladin: () => `
      <g class="cs-wings">${P_('M72 130 Q10 90 -6 28 Q40 40 56 62 Q30 70 40 98 Q60 84 66 110Z', '#fff7d6', 3.5)}${P_('M128 130 Q190 90 206 28 Q160 40 144 62 Q170 70 160 98 Q140 84 134 110Z', '#fff7d6', 3.5)}</g>
      ${P_('M72 128 Q100 118 128 128 L140 244 Q100 256 60 244Z', '#f4f0e0')}
      ${legs('#c9a63e', '#8a6b1c')}
      ${torso('#f6d46b')}
      ${P_('M91 126 L109 126 L111 206 L89 206Z', '#fff7d6', 3)}${R_(64, 186, 72, 12, 5, '#a87100', 3.5)}
      ${C_(72, 130, 15, '#ffe48a')}${C_(128, 130, 15, '#ffe48a')}
      ${L_(70, 136, 50, 178, 15, '#f6d46b')}${hand(50, 180)}
      <g class="cs-shield">${P_('M22 160 L62 160 L62 196 Q42 222 22 196Z', '#fff7d6')}<path d="M42 166 L42 204 M28 178 L56 178" stroke="#e0a800" stroke-width="7" stroke-linecap="round"/></g>
      ${head()}${smile}${eyes('n')}
      ${P_('M68 88 Q64 46 100 44 Q136 46 132 88 Q116 80 100 81 Q84 80 68 88Z', '#ffe48a')}
      ${P_('M100 44 Q84 24 62 34 Q80 38 94 52Z', '#fff7d6', 3)}${P_('M100 44 Q116 24 138 34 Q120 38 106 52Z', '#fff7d6', 3)}
      <ellipse cx="100" cy="30" rx="26" ry="8" fill="none" stroke="#fff3b0" stroke-width="5" class="cs-halo"/>
      <g class="cs-sw">${L_(130, 136, 152, 180, 15, '#f6d46b')}
        ${P_('M146 118 L158 118 L158 196 L146 196Z', '#8a6b1c', 3)}
        ${P_('M138 60 L152 28 L166 60 L162 118 L142 118Z', '#fffbe8')}<path d="M152 36 L152 112" stroke="#ffe48a" stroke-width="4"/>
        ${R_(132, 114, 40, 9, 4, '#ffd23f', 3.5)}${hand(152, 182)}</g>`,

    Elementaliste: () => `
      ${P_('M70 126 Q100 114 130 126 L146 246 Q100 260 54 246Z', '#2e62d6')}
      ${P_('M100 118 L130 126 L146 246 Q120 254 100 256Z', '#f2c21d')}
      ${P_('M100 118 L100 256', 'none', 3)}
      ${R_(76, 246, 22, 18, 7, '#1b3a8f')}${R_(102, 246, 22, 18, 7, '#8a6b00')}
      ${R_(66, 184, 68, 11, 5, '#e9f1ff', 3)}
      ${L_(70, 136, 46, 170, 16, '#2e62d6')}${hand(44, 174)}
      <g class="cs-float"><path d="M44 120 L56 140 L44 164 L32 140Z" fill="#aef2ff" stroke="${OL}" stroke-width="3.5" class="cs-glow"/><path d="M44 126 L44 158" stroke="#fff" stroke-width="2"/></g>
      ${head()}${smile}${eyes('n')}
      ${P_('M70 78 Q66 40 84 30 L88 50 L100 22 L110 50 L124 28 Q134 44 130 78 Q116 62 100 62 Q84 62 70 78Z', '#7de8ff')}
      ${P_('M100 22 L110 50 L124 28 Q134 44 130 78 Q120 64 106 62Z', '#ffe45c')}
      <g class="cs-float2">${L_(130, 136, 154, 168, 16, '#f2c21d')}${hand(156, 172)}
        <circle cx="156" cy="138" r="14" fill="#fff2a0" stroke="${OL}" stroke-width="3.5" class="cs-glow"/><path d="M160 124 L150 140 L158 140 L152 154 L166 134 L158 134Z" fill="#6a3cff" stroke="${OL}" stroke-width="2"/></g>`,

    Necromancien: () => `
      <g class="cs-tatters">${P_('M64 124 Q100 112 136 124 L156 262 L140 250 L132 268 L116 252 L100 270 L84 252 L68 268 L60 250 L44 262Z', '#2a1448')}</g>
      ${P_('M92 130 L108 130 L116 258 L84 258Z', '#3f1f6e', 3)}
      ${R_(66, 184, 68, 11, 5, '#6b3fa0', 3)}${C_(100, 190, 7, '#b46bff', 3)}
      ${L_(70, 136, 50, 180, 17, '#2a1448')}${hand(48, 182).replace(SKIN, '#d9d2ea')}
      <g class="cs-float"><path d="M40 150 Q30 132 44 120 Q40 134 54 138 Q46 146 40 150Z" fill="#b46bff" class="cs-glow" stroke="${OL}" stroke-width="2.5"/></g>
      ${P_('M62 100 Q56 36 100 30 Q144 36 138 100 Q136 132 100 134 Q64 132 62 100Z', '#2a1448')}
      ${P_('M72 92 Q76 66 100 64 Q124 66 128 92 Q124 118 100 120 Q76 118 72 92Z', '#0b0614', 3)}
      ${eyes('glow', '#d9a0ff')}
      <path d="M92 108 L108 108" stroke="#6b3fa0" stroke-width="3" stroke-linecap="round"/>
      <g class="cs-sw">${L_(130, 136, 150, 180, 17, '#2a1448')}
        <path d="M152 262 L152 76" stroke="${OL}" stroke-width="10" stroke-linecap="round"/><path d="M152 262 L152 76" stroke="#6b4a8a" stroke-width="5" stroke-linecap="round"/>
        ${C_(152, 58, 17, '#e9e2f5')}${R_(144, 70, 16, 10, 3, '#e9e2f5', 3)}<ellipse cx="146" cy="58" rx="4" ry="5" fill="#120c26"/><ellipse cx="158" cy="58" rx="4" ry="5" fill="#120c26"/>
        <circle cx="152" cy="40" r="6" fill="#b46bff" class="cs-glow"/>${hand(152, 182).replace(SKIN, '#d9d2ea')}</g>`,
  };

  const SERVANT = (i) => `<svg viewBox="0 0 100 150" aria-hidden="true">
    <path d="M50 8 Q78 12 78 48 Q82 64 88 140 L70 128 L60 146 L50 130 L40 146 L30 128 L12 140 Q18 64 22 48 Q22 12 50 8Z" fill="#0a0612" stroke="#c28bff" stroke-width="3.5" stroke-linejoin="round"/>
    <ellipse cx="40" cy="40" rx="5" ry="3.4" fill="#d9a0ff"/><ellipse cx="60" cy="40" rx="5" ry="3.4" fill="#d9a0ff"/>
    ${i % 3 === 0 ? '<path d="M84 150 L84 30" stroke="#7a3fd0" stroke-width="3"/><path d="M78 30 L90 30 L84 18Z" fill="#b46bff"/>' : i % 3 === 1 ? '<path d="M20 64 L8 96 M80 64 L92 96" stroke="#7a3fd0" stroke-width="3.5" stroke-linecap="round"/>' : '<circle cx="50" cy="78" r="6" fill="#7a3fd0" opacity=".7"/>'}
  </svg>`;
  const figSvg = (id) => `<svg class="cs-fig" viewBox="-10 -4 220 284" aria-hidden="true" preserveAspectRatio="xMidYMax meet"><ellipse class="cs-fig-shadow" cx="100" cy="268" rx="62" ry="9" fill="rgba(0,0,0,.35)"/>${(FIGS[id] || FIGS.Guerrier)()}</svg>`;

  // ------------------------------------------------------------------
  //  AUDIO (WebAudio synthétisé ; réutilise le contexte de G.sfx s'il est exposé)
  // ------------------------------------------------------------------
  const Aud = {
    ctx: null, own: false, master: null, noise: null, buses: [],
    muted() { try { return !!(G.sfx && G.sfx.muted); } catch (_) { return false; } },
    ensure() {
      try {
        if (this.muted()) return false;
        if (!this.ctx) {
          const s = G.sfx || {};
          const shared = s.ctx || s.ac || s.context || s.audioContext;
          if (shared && shared.createGain) { this.ctx = shared; this.own = false; }
          else {
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
            this.ctx = new AC(); this.own = true;
          }
          this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
          this.master.connect(s.master && s.master.connect ? s.master : this.ctx.destination);
          const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), d = n.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          this.noise = n;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      } catch (_) { return false; }
    },
    bus() {
      if (!this.ensure()) return null;
      const g = this.ctx.createGain(); g.gain.value = 1; g.connect(this.master);
      const b = { g, dead: false }; this.buses.push(b);
      if (this.buses.length > 6) this.kill(this.buses[0]);
      return b;
    },
    kill(b) {
      if (!b || b.dead) return; b.dead = true;
      try { const t = this.ctx.currentTime; b.g.gain.cancelScheduledValues(t); b.g.gain.setTargetAtTime(0, t, 0.03); } catch (_) {}
      const i = this.buses.indexOf(b); if (i >= 0) this.buses.splice(i, 1);
    },
    killAll() { this.buses.slice().forEach(b => this.kill(b)); },
    tone(b, f, d, type, v, f2, delay) {
      if (!b || b.dead) return; const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(18, f2), t + d);
      const a = Math.min(0.02, d * 0.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v || 0.1), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(b.g); o.start(t); o.stop(t + d + 0.05);
    },
    pad(b, f, d, type, v, delay, att) {   // son tenu avec attaque lente
      if (!b || b.dead) return; const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (att || d * 0.5)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(b.g); o.start(t); o.stop(t + d + 0.05);
    },
    noiseHit(b, d, v, f1, delay, type, f2) {
      if (!b || b.dead) return; const c = this.ctx, t = c.currentTime + (delay || 0);
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = d > 0.9;
      const fl = c.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.03, d * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(b.g); s.start(t); s.stop(t + d + 0.05);
    },
    destroy() {
      this.killAll();
      try { if (this.master) this.master.disconnect(); } catch (_) {}
      try { if (this.own && this.ctx && this.ctx.close) this.ctx.close(); } catch (_) {}
      this.ctx = null; this.master = null; this.noise = null; this.own = false; this.buses = [];
    },
  };
  // Une signature sonore par classe (délais en secondes depuis le début de la présentation)
  const SOUNDS = {
    Guerrier(a, b) {
      a.pad(b, 98, 1.6, 'sawtooth', 0.07, 0, 0.5); a.pad(b, 147, 1.6, 'sawtooth', 0.04, 0, 0.5);          // cor de guerre
      a.noiseHit(b, 0.5, 0.35, 700, 0.5, 'lowpass', 60); a.tone(b, 70, 0.6, 'sine', 0.35, 30, 0.5);        // impact au sol
      a.tone(b, 1250, 0.35, 'square', 0.06, 900, 0.52); a.tone(b, 1880, 0.25, 'square', 0.04, 1500, 0.52);  // clang
      a.noiseHit(b, 0.12, 0.3, 3000, 0.4, 'bandpass', 900);                                                // sifflement de la lame
    },
    Mage(a, b) {
      [523, 659, 784, 988, 1175, 1568].forEach((f, i) => { a.tone(b, f, 0.5, 'sine', 0.07, null, 0.1 + i * 0.12); a.tone(b, f * 1.005, 0.5, 'triangle', 0.03, null, 0.1 + i * 0.12); });
      a.noiseHit(b, 1.0, 0.12, 400, 0.05, 'bandpass', 4000); a.pad(b, 261, 1.8, 'sine', 0.06, 0.2, 0.7);
      a.tone(b, 2400, 0.3, 'sine', 0.04, 3600, 1.0);
    },
    Voleur(a, b) {
      a.noiseHit(b, 0.5, 0.2, 2200, 0, 'highpass', 600);                                                    // pff fumigène
      for (let i = 0; i < 6; i++) { const t = 0.6 + i * 0.09 + Math.random() * 0.04; a.tone(b, 2100 + (i % 3) * 420, 0.14, 'square', 0.04, null, t); a.tone(b, 3100 + (i % 2) * 500, 0.2, 'sine', 0.03, null, t + 0.04); }
      a.noiseHit(b, 0.1, 0.18, 4500, 0.35, 'highpass'); a.tone(b, 700, 0.12, 'triangle', 0.05, 1500, 0.32);
    },
    Assassin(a, b) {
      a.noiseHit(b, 0.35, 0.28, 400, 0.0, 'bandpass', 4000);                                                // course
      a.noiseHit(b, 0.12, 0.3, 6000, 0.55, 'highpass'); a.noiseHit(b, 0.12, 0.3, 6500, 0.68, 'highpass');   // deux entailles
      a.tone(b, 55, 0.25, 'sine', 0.3, 40, 0.3); a.tone(b, 55, 0.25, 'sine', 0.3, 40, 0.62);                // battements
      a.pad(b, 82, 1.4, 'sawtooth', 0.025, 0.3, 0.4);
    },
    Archer(a, b) {
      a.tone(b, 190, 0.3, 'triangle', 0.18, 90, 0.82); a.tone(b, 380, 0.18, 'square', 0.05, 200, 0.82);       // corde
      a.noiseHit(b, 0.5, 0.2, 5200, 0.84, 'highpass', 1800); a.tone(b, 3000, 0.5, 'sine', 0.04, 1400, 0.84);  // sifflement
      a.tone(b, 140, 0.25, 'sine', 0.3, 60, 1.38); a.noiseHit(b, 0.15, 0.3, 1600, 1.38, 'lowpass', 300);      // impact
      a.tone(b, 880, 0.2, 'triangle', 0.05, 1320, 0.1);
    },
    Paladin(a, b) {
      [392, 494, 587, 784].forEach((f, i) => { a.pad(b, f, 2.4, 'sine', 0.06, i * 0.1, 0.9); a.pad(b, f * 2.003, 2.4, 'sine', 0.02, i * 0.1, 0.9); });
      a.tone(b, 1568, 1.2, 'sine', 0.07, null, 0.7); a.tone(b, 2349, 1.0, 'sine', 0.04, null, 0.7);           // carillon
      a.noiseHit(b, 0.8, 0.1, 6000, 0.2, 'highpass', 3000);
    },
    Elementaliste(a, b) {
      for (let k = 0; k < 7; k++) a.noiseHit(b, 0.06 + Math.random() * 0.05, 0.28, 3000 + Math.random() * 3000, 0.1 + k * 0.07, 'highpass');       // crépitements
      a.noiseHit(b, 0.9, 0.35, 500, 0.25, 'lowpass', 70); a.tone(b, 60, 0.7, 'sine', 0.3, 35, 0.25);        // tonnerre
      [2637, 3136, 3951, 3322].forEach((f, i) => a.tone(b, f, 0.35, 'sine', 0.05, f * 0.98, 1.2 + i * 0.1));  // givre
      a.noiseHit(b, 1.2, 0.12, 5500, 1.2, 'highpass');
    },
    Necromancien(a, b) {
      a.pad(b, 55, 6, 'sawtooth', 0.05, 0, 2.5); a.pad(b, 55.7, 6, 'sawtooth', 0.04, 0, 2.5); a.pad(b, 82.4, 5, 'triangle', 0.05, 0.5, 2.5);
      a.noiseHit(b, 3.2, 0.14, 300, 0.2, 'bandpass', 1400);                                                    // murmures
      [0, 1].forEach(i => { a.tone(b, 110, 2.5, 'sine', 0.12, null, 0.6 + i * 1.6); a.tone(b, 233, 2.0, 'sine', 0.06, null, 0.6 + i * 1.6); }); // glas
      for (let i = 0; i < 6; i++) a.tone(b, 90 - i * 4, 0.35, 'sine', 0.2, 35, 2.0 + i * 0.45);                // serviteurs
      for (let i = 0; i < 5; i++) a.tone(b, 400 + Math.random() * 800, 0.05, 'square', 0.04, null, 3.3 + i * 0.03); // glitch
      a.noiseHit(b, 1.8, 0.5, 900, 3.4, 'lowpass', 40); a.tone(b, 45, 1.8, 'sine', 0.4, 28, 3.4); a.pad(b, 220, 2.5, 'sawtooth', 0.03, 3.4, 0.3);   // pouvoir
    },
    ritual(a, b) {
      a.tone(b, 90, 2.1, 'sine', 0.09, 880, 0); a.tone(b, 180, 2.1, 'triangle', 0.04, 1760, 0);
      for (let i = 0; i < 14; i++) a.tone(b, 700 + i * 20, 0.05, 'square', 0.03, null, i * 0.15 - i * i * 0.004);
      a.noiseHit(b, 2.1, 0.12, 200, 0, 'bandpass', 3500);
    },
    ritualFail(a, b) { a.tone(b, 392, 0.7, 'sine', 0.1, 330, 0); a.tone(b, 294, 1.1, 'sine', 0.08, 220, 0.25); a.noiseHit(b, 0.7, 0.1, 3000, 0, 'highpass', 400); },
    ritualWin(a, b) { a.noiseHit(b, 1.4, 0.5, 1400, 0, 'lowpass', 40); a.tone(b, 50, 1.6, 'sine', 0.45, 25, 0); [220, 277, 330, 440].forEach((f, i) => a.pad(b, f, 2.2, 'sawtooth', 0.04, i * 0.08, 0.2)); },
    ready(a, b) { a.tone(b, 880, 0.12, 'triangle', 0.06, null, 0); a.tone(b, 1320, 0.18, 'triangle', 0.05, null, 0.08); },
    error(a, b) { a.tone(b, 160, 0.18, 'square', 0.07, 110, 0); },
  };
  function playSound(name) {
    const b = Aud.bus(); if (!b) return null;
    try { SOUNDS[name] && SOUNDS[name](Aud, b); } catch (_) {}
    return b;
  }

  // ------------------------------------------------------------------
  //  MOTEUR : instance, particules, helpers de dessin
  // ------------------------------------------------------------------
  let I = null;                       // instance courante (un seul écran à la fois)
  let MEMO = null;                    // état conservé si l'UI re-monte l'écran (évite de rejouer l'animation)
  const MAXP = 380;
  const RMQ = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

  const hp = (sx, sy) => { const b = I.hero, k = b.h / 284; return { x: b.x + (sx + 10) * k, y: b.y + (sy + 4) * k }; };
  const U = () => I.hero.h / 284;
  function spawn(o) {
    if (I.parts.length >= MAXP) return;
    o.age = 0; if (o.life == null) o.life = 1; if (o.alpha == null) o.alpha = 1; if (o.size == null) o.size = 3;
    I.parts.push(o);
  }
  function at(t, fn, final) {
    if (I.settled) { if (final) fn(); return; }
    I.cues.push({ t: I.clock + t, fn, g: false });
  }
  function atG(t, fn) { I.cues.push({ t: I.clock + t, fn, g: true }); }
  function flare(x, y, size, color, life) { I.flares.push({ x, y, size, color, life: life || 0.5, age: 0 }); }
  function shake(amp, dur) {
    if (I.rm || !I.els.stage.animate) return;
    const a = amp, kf = [{ transform: 'translate(0,0)' }];
    for (let i = 0; i < 8; i++) { const f = 1 - (i + 1) / 9; kf.push({ transform: `translate(${(rnd(-1, 1) * a * f).toFixed(1)}px,${(rnd(-1, 1) * a * f).toFixed(1)}px)` }); }
    kf.push({ transform: 'translate(0,0)' });
    I.anims.push(I.els.stage.animate(kf, { duration: dur * 1000, easing: 'linear' }));
  }
  function flashScreen(color, peak, dur) {
    if (I.rm || !I.els.flash.animate) return;
    I.els.flash.style.background = color;
    I.anims.push(I.els.flash.animate([{ opacity: 0 }, { opacity: peak, offset: 0.15 }, { opacity: 0 }], { duration: dur * 1000, easing: 'ease-out' }));
  }

  function drawParticle(c, p) {
    const f = p.age / p.life, a = p.alpha * Math.pow(1 - f, p.fade == null ? 1 : p.fade) * (p.pop ? clamp(p.age / p.pop, 0, 1) : 1);
    if (a <= 0.005) return;
    c.globalAlpha = a;
    c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    const s = p.size + (p.grow || 0) * p.age;
    switch (p.kind) {
      case 'spark': c.strokeStyle = p.color; c.lineWidth = Math.max(1, s); c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); c.stroke(); break;
      case 'streak': c.strokeStyle = p.color; c.lineWidth = s; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - Math.sign(p.vx || 1) * p.len, p.y - (p.vy / (Math.abs(p.vx) + 1)) * p.len); c.stroke(); break;
      case 'ring': c.strokeStyle = p.color; c.lineWidth = p.lw || 3; c.beginPath(); c.arc(p.x, p.y, Math.max(1, s), 0, TAU); c.stroke(); break;
      case 'ering': c.strokeStyle = p.color; c.lineWidth = (p.lw || 4) * (1 - f * 0.6); c.beginPath(); c.ellipse(p.x, p.y, Math.max(1, s), Math.max(1, s * 0.3), 0, 0, TAU); c.stroke(); break;
      case 'coin': { const w = Math.abs(Math.cos(p.rot)) * s; c.fillStyle = '#ffd23f'; c.strokeStyle = '#a87100'; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y, Math.max(1.2, w), s, 0, 0, TAU); c.fill(); c.stroke(); if (w > s * 0.5) { c.fillStyle = '#fff3b0'; c.beginPath(); c.ellipse(p.x, p.y, w * 0.45, s * 0.5, 0, 0, TAU); c.fill(); } break; }
      case 'feather': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.beginPath(); c.ellipse(0, 0, s * 0.28, s, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -s); c.lineTo(0, s); c.stroke(); c.restore(); break;
      case 'leaf': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 0.8, 0, 0, s); c.quadraticCurveTo(-s * 0.8, 0, 0, -s); c.fill(); c.restore(); break;
      case 'smoke': c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, Math.max(1, s), 0, TAU); c.fill(); break;
      case 'shard': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.4, 0); c.lineTo(0, s * 0.7); c.lineTo(-s * 0.4, 0); c.closePath(); c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.stroke(); c.restore(); break;
      case 'flame': { const h = s * (1 - f * 0.55); c.fillStyle = p.color; c.beginPath(); c.moveTo(p.x, p.y - h * 1.6); c.quadraticCurveTo(p.x + h * 0.95, p.y, p.x, p.y + h * 0.6); c.quadraticCurveTo(p.x - h * 0.95, p.y, p.x, p.y - h * 1.6); c.fill(); break; }
      case 'rune': c.save(); c.translate(p.x, p.y); c.strokeStyle = p.color; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); const g = GLYPHS[p.g % GLYPHS.length]; g.forEach((q, i) => { i % 2 === 0 ? c.moveTo(q[0] * s, q[1] * s) : c.lineTo(q[0] * s, q[1] * s); }); c.stroke(); c.restore(); break;
      default: c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, Math.max(0.6, s), 0, TAU); c.fill();
        if (p.add && s > 3) { c.globalAlpha = a * 0.25; c.beginPath(); c.arc(p.x, p.y, s * 2.2, 0, TAU); c.fill(); }
    }
  }
  // glyphes de runes (paires de points → segments)
  const GLYPHS = (() => {
    const out = []; let seed = 7; const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 14; i++) { const g = [], n = 3 + Math.floor(r() * 3); let px = -0.5 + r(), py = -1; for (let j = 0; j < n; j++) { const nx = -0.6 + r() * 1.2, ny = -1 + (j + 1) * (2 / n); g.push([px, py], [nx, ny]); px = nx; py = ny; } out.push(g); }
    return out;
  })();
  function stepParticles(dt) {
    const P = I.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.age += dt;
      if (p.age >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
      if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
      p.vy += (p.g || 0) * dt; p.vx += (p.ax || 0) * dt;
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if (p.sway) p.x += Math.sin(p.age * p.swayF + p.ph) * p.sway * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.home) { const dx = p.home.x - p.x, dy = p.home.y - p.y; p.x += dx * Math.min(1, dt * p.homeK); p.y += dy * Math.min(1, dt * p.homeK); }
    }
  }
  function drawParticles() {
    const c = I.fc;
    c.save();
    for (let i = 0; i < I.parts.length; i++) drawParticle(c, I.parts[i]);
    c.restore();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  // éclair : polyligne par déplacement de point milieu
  function boltPts(x1, y1, x2, y2, disp, depth) {
    if (depth === 0) return [[x1, y1], [x2, y2]];
    const mx = (x1 + x2) / 2 + rnd(-1, 1) * disp, my = (y1 + y2) / 2 + rnd(-1, 1) * disp * 0.5;
    const a = boltPts(x1, y1, mx, my, disp / 2, depth - 1), b = boltPts(mx, my, x2, y2, disp / 2, depth - 1);
    return a.concat(b.slice(1));
  }
  function drawBolt(c, pts, color, w, alpha) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    [[w * 4, 0.18], [w * 1.8, 0.45], [w * 0.6, 1]].forEach(([lw, al], i) => {
      c.globalAlpha = alpha * al; c.strokeStyle = i === 2 ? '#ffffff' : color; c.lineWidth = lw; c.beginPath();
      pts.forEach((q, j) => j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.stroke();
    });
    c.restore();
  }
  function drawStar(c, x, y, s, color, a) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.fillStyle = color;
    c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s * 0.28, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s * 0.28, y); c.quadraticCurveTo(x, y, x, y - s); c.fill();
    c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x, y, x, y - s * 0.28); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s * 0.28); c.quadraticCurveTo(x, y, x - s, y); c.fill();
    c.globalAlpha = a * 0.6; c.beginPath(); c.arc(x, y, s * 0.28, 0, TAU); c.fill();
    c.restore();
  }
  function radial(c, x, y, r, stops) {
    const g = c.createRadialGradient(x, y, 0, x, y, Math.max(1, r)); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g;
  }
  // cercle magique « à plat » (espace cercle puis écrasé verticalement)
  function magicCircle(c, cx, cy, R, squash, T, col, col2, scale, rot) {
    if (scale <= 0.01) return;
    c.save(); c.translate(cx, cy); c.scale(scale, scale * squash); c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    const rings = [[1, 4], [0.84, 2.5], [0.58, 3]];
    rings.forEach(([r, lw], i) => { c.strokeStyle = i === 1 ? col2 : col; c.globalAlpha = 0.85; c.lineWidth = lw / Math.max(0.4, squash + 0.4); c.beginPath(); c.arc(0, 0, R * r, 0, TAU); c.stroke(); });
    // graduations + runes sur l'anneau externe/intermédiaire
    c.save(); c.rotate(rot || T * 0.5); c.strokeStyle = col; c.lineWidth = 2; c.globalAlpha = 0.9;
    for (let i = 0; i < 12; i++) { c.save(); c.rotate(i * TAU / 12); c.translate(R * 0.92, 0); c.beginPath(); const g = GLYPHS[i]; g.forEach((q, j) => j % 2 === 0 ? c.moveTo(q[0] * R * 0.045, q[1] * R * 0.06) : c.lineTo(q[0] * R * 0.045, q[1] * R * 0.06)); c.stroke(); c.restore(); }
    c.restore();
    c.save(); c.rotate(-(rot || T * 0.5) * 1.4); c.strokeStyle = col2; c.globalAlpha = 0.8; c.lineWidth = 2.5; c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 * 2 % TAU; const x = Math.cos(a) * R * 0.58, y = Math.sin(a) * R * 0.58; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.stroke();
    c.restore();
    c.restore();
  }

  // ------------------------------------------------------------------
  //  SCÈNES : une présentation propre à chaque classe
  //  timing = instants (s) d'apparition : titre / description / stats / compétences / prêt
  // ------------------------------------------------------------------
  const SC = {};
  const rate = (dt, perSec) => { const n = perSec * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---- GUERRIER : arme qui s'abat, onde de choc, aura rouge/or ----
  SC.Guerrier = {
    timing: { title: 0.55, desc: 1.1, stats: 1.5, skills: 2.0, ready: 2.7 },
    init() {
      const sc = I.sc = { cracks: [], slashT: I.clock + 0.34, crackT: I.settled ? I.clock - 6 : -9 };
      const f = hp(100, 266), k = U();
      for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.05 + i * (Math.PI * 1.1 / 8), pts = [[f.x, f.y]]; let r = 0; const L = (70 + rnd(0, 90)) * k; while (r < L) { r += rnd(14, 26) * k; pts.push([f.x + Math.cos(a + rnd(-0.18, 0.18)) * r * 1.6, f.y + Math.sin(a + rnd(-0.18, 0.18)) * r * 0.32]); } sc.cracks.push(pts); }
      at(0.0, () => flashScreen('#ffd23f', 0.28, 0.5));
      at(0.5, () => {
        const f = hp(100, 266), k = U();
        for (let i = 0; i < 3; i++) at(i * 0.11, () => spawn({ kind: 'ering', x: f.x, y: f.y, size: 12 * k, grow: 300 * k, life: 0.95, color: i === 1 ? '#ffd23f' : '#ff5a3c', lw: 6, add: true }));
        for (let i = 0; i < 26; i++) { const a = rnd(0, TAU); spawn({ kind: 'smoke', x: f.x + Math.cos(a) * 20 * k, y: f.y - 4 * k, vx: Math.cos(a) * rnd(60, 190) * k / 1.6, vy: -rnd(10, 60) * k, drag: 2, size: rnd(8, 18) * k, grow: 22 * k, life: rnd(0.6, 1.1), color: '#8a7a6a', alpha: 0.55 }); }
        for (let i = 0; i < 46; i++) { const a = rnd(-Math.PI, 0); spawn({ kind: 'spark', x: f.x + rnd(-14, 14) * k, y: f.y, vx: Math.cos(a) * rnd(120, 520) * k / 1.6, vy: Math.sin(a) * rnd(160, 560) * k / 1.6, g: 900 * k / 1.6, size: rnd(1.5, 3.4), life: rnd(0.5, 1.1), color: pick(['#fff3b0', '#ffd23f', '#ff8a1a']), add: true }); }
        flare(f.x + 8 * k, f.y - 6 * k, 90 * k, '#fff3b0', 0.45); shake(11, 0.5); flashScreen('#fff3b0', 0.5, 0.35);
        I.sc.crackT = I.clock;
      });
    },
    step(T, dt) {
      if (T < 0.5) return; const f = hp(100, 266), k = U();
      for (let n = rate(dt, 70); n > 0; n--) spawn({ kind: 'flame', x: f.x + rnd(-62, 62) * k, y: f.y - rnd(0, 26) * k, vx: rnd(-12, 12) * k, vy: -rnd(70, 190) * k / 1.6, size: rnd(6, 13) * k, life: rnd(0.55, 1.1), color: pick(['#ff3d2e', '#ff6a1a', '#ffb02e', '#ffd23f']), add: true, alpha: 0.85 });
      for (let n = rate(dt, 14); n > 0; n--) spawn({ kind: 'dot', x: f.x + rnd(-70, 70) * k, y: f.y - rnd(0, 60) * k, vx: rnd(-20, 20), vy: -rnd(40, 120) * k / 1.6, size: rnd(1.2, 2.6), life: rnd(0.8, 1.6), color: '#ffd23f', add: true });
    },
    bg(c, T) {
      const b = I.hero, ctr = hp(100, 150), k = U(), ramp = ease((T - 0.2) / 0.8), pulse = 0.85 + Math.sin(T * 3.2) * 0.15;
      c.fillStyle = radial(c, ctr.x, ctr.y + 30 * k, 230 * k, [[0, rgba('#ff4a2e', 0.55 * ramp * pulse)], [0.45, rgba('#ff8a1a', 0.22 * ramp)], [1, 'rgba(255,60,30,0)']]); c.fillRect(0, 0, I.W, I.H);
      const f = hp(100, 266); c.fillStyle = radial(c, f.x, f.y, 130 * k, [[0, rgba('#ffd23f', 0.45 * ramp)], [1, 'rgba(255,210,63,0)']]);
      c.save(); c.translate(f.x, f.y); c.scale(1, 0.3); c.beginPath(); c.arc(0, 0, 130 * k, 0, TAU); c.fill(); c.restore();
      const ct = I.sc.crackT;
      if (ct > -9) { const a = clamp(1 - (I.clock - ct) / 3.5, 0.25, 1); c.save(); c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round'; I.sc.cracks.forEach(pts => { [[7, 0.25], [2.4, 1]].forEach(([w, al]) => { c.strokeStyle = w > 3 ? '#ff5a1a' : '#ffe08a'; c.globalAlpha = a * al * ease((I.clock - ct) * 5); c.lineWidth = w; c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.stroke(); }); }); c.restore(); }
    },
    fg(c, T) {
      const p = (I.clock - I.sc.slashT) / 0.2; if (p < 0 || p > 1.6) return;
      const f = hp(100, 266), k = U(), a = 1 - clamp((p - 1) / 0.6, 0, 1), pp = clamp(p, 0, 1);
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.globalAlpha = a;
      const cx = f.x + 30 * k, cy = f.y - 150 * k, R = 150 * k, a0 = -Math.PI * 0.95, a1 = a0 + pp * Math.PI * 0.8;
      [[22, 'rgba(255,90,50,.35)'], [9, '#ffd23f'], [3, '#fff']].forEach(([w, col]) => { c.strokeStyle = col; c.lineWidth = w * k / 1.4; c.beginPath(); c.arc(cx, cy + R * 0.55, R, a0, a1); c.stroke(); });
      c.restore();
    },
  };

  // ---- MAGE : cercle runique, particules arcaniques, orbes élémentaires ----
  SC.Mage = {
    timing: { title: 0.7, desc: 1.2, stats: 1.6, skills: 2.1, ready: 2.8 },
    init() { I.sc = { runes: 0 }; at(0.35, () => { const c = hp(100, 150), k = U(); spawn({ kind: 'ring', x: c.x, y: c.y, size: 10, grow: 330 * k, life: 0.8, color: '#c9a6ff', lw: 3, add: true }); flare(c.x, c.y, 80 * k, '#c9a6ff', 0.6); flashScreen('#a05bff', 0.25, 0.5); }); },
    step(T, dt) {
      const k = U(), c0 = hp(100, 160);
      for (let n = rate(dt, 34); n > 0; n--) { const a = rnd(0, TAU), r = rnd(50, 95) * k; spawn({ kind: 'dot', x: c0.x + Math.cos(a) * r, y: c0.y + 90 * k + Math.sin(a) * r * 0.3, vx: Math.cos(a + 1.57) * 40 * k, vy: -rnd(40, 150) * k, size: rnd(1.5, 3.6), life: rnd(0.9, 1.8), color: pick(['#c9a6ff', '#7de8ff', '#ff9bd2', '#ffffff']), add: true, sway: 30, swayF: 3, ph: rnd(0, 6) }); }
      for (let n = rate(dt, 3); n > 0; n--) spawn({ kind: 'rune', g: Math.floor(rnd(0, 14)), x: c0.x + rnd(-90, 90) * k, y: c0.y + rnd(0, 120) * k, vy: -rnd(25, 60) * k, size: rnd(7, 12) * k, life: rnd(1.4, 2.2), color: pick(['#c9a6ff', '#7de8ff']), add: true, alpha: 0.9 });
    },
    bg(c, T) {
      const f = hp(100, 266), k = U(), s = ease(T / 0.9);
      c.fillStyle = radial(c, f.x, f.y - 100 * k, 260 * k, [[0, 'rgba(150,80,255,.5)'], [1, 'rgba(60,20,140,0)']]); c.globalAlpha = s; c.fillRect(0, 0, I.W, I.H); c.globalAlpha = 1;
      magicCircle(c, f.x, f.y - 2 * k, 150 * k, 0.3, T, '#c9a6ff', '#7de8ff', s, T * 0.6);
      if (s > 0.2) { const g = c.createLinearGradient(0, f.y, 0, f.y - 280 * k); g.addColorStop(0, 'rgba(200,160,255,.45)'); g.addColorStop(1, 'rgba(200,160,255,0)'); c.fillStyle = g; c.globalAlpha = s * (0.7 + Math.sin(T * 4) * 0.15); c.fillRect(f.x - 55 * k, f.y - 280 * k, 110 * k, 280 * k); c.globalAlpha = 1; }
    },
    fg(c, T) {
      const ctr = hp(100, 150), k = U(), s = ease((T - 0.5) / 0.6); if (s <= 0) return;
      const orbs = [['#ff7b3d', '#fff3b0'], ['#7de8ff', '#ffffff'], ['#c07bff', '#ffe6ff']];
      const list = orbs.map((o, i) => { const a = T * 2.3 + i * TAU / 3; return { o, x: ctr.x + Math.cos(a) * 112 * k * s, y: ctr.y + 10 * k + Math.sin(a) * 34 * k, z: Math.sin(a) }; }).sort((a, b) => a.z - b.z);
      list.forEach(q => {
        const r = (13 + q.z * 3.5) * k;
        c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = radial(c, q.x, q.y, r * 2.8, [[0, rgba(q.o[0], 0.9)], [1, rgba(q.o[0], 0)]]); c.beginPath(); c.arc(q.x, q.y, r * 2.8, 0, TAU); c.fill();
        c.globalCompositeOperation = 'source-over'; c.fillStyle = q.o[0]; c.strokeStyle = OL; c.lineWidth = 3; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.fill(); c.stroke(); c.fillStyle = q.o[1]; c.beginPath(); c.arc(q.x - r * 0.3, q.y - r * 0.3, r * 0.38, 0, TAU); c.fill(); c.restore();
        if (Math.random() < 0.5) spawn({ kind: 'dot', x: q.x, y: q.y, vx: rnd(-20, 20), vy: rnd(-20, 20), size: r * 0.4, life: 0.5, color: q.o[0], add: true, alpha: 0.7 });
      });
    },
  };

  // ---- VOLEUR : fumée, pièces, éclats de lames ----
  SC.Voleur = {
    timing: { title: 0.7, desc: 1.2, stats: 1.6, skills: 2.1, ready: 2.8 },
    init() {
      I.sc = {};
      at(0, () => { const f = hp(100, 250), k = U(); for (let i = 0; i < 30; i++) { const a = rnd(0, TAU), r = rnd(0.2, 1); spawn({ kind: 'smoke', x: f.x + Math.cos(a) * 30 * k * r, y: f.y - rnd(0, 120) * k, vx: Math.cos(a) * rnd(40, 150) * k / 1.6, vy: -rnd(0, 60) * k, drag: 1.4, size: rnd(18, 40) * k, grow: 30 * k, life: rnd(1.1, 1.8), color: pick(['#47585c', '#5c7378', '#2f3d40']), alpha: 0.75, fade: 1.4 }); } });
      at(0.65, () => {
        const k = U(), h = [hp(48, 184), hp(152, 184)];
        h.forEach((q, i) => flare(q.x, q.y - 40 * k, 62 * k, '#ffffff', 0.5));
        for (let i = 0; i < 18; i++) { const q = h[i % 2], a = -Math.PI / 2 + rnd(-1.1, 1.1); spawn({ kind: 'coin', x: q.x, y: q.y - 10 * k, vx: Math.cos(a) * rnd(80, 260) * k / 1.6, vy: Math.sin(a) * rnd(180, 420) * k / 1.6, g: 760 * k / 1.6, rot: rnd(0, 6), vr: rnd(6, 14), size: rnd(7, 11) * k, life: rnd(1.4, 2.0), fade: 0.4 }); }
        flashScreen('#2fd0b6', 0.25, 0.4);
      });
    },
    step(T, dt) {
      const k = U(), f = hp(100, 262);
      if (T > 0.9) for (let n = rate(dt, 2.6); n > 0; n--) { const q = hp(rnd(40, 160), 150); spawn({ kind: 'coin', x: q.x, y: q.y - 30 * k, vx: rnd(-40, 40), vy: -rnd(60, 160) * k / 1.6, g: 520 * k / 1.6, rot: rnd(0, 6), vr: rnd(6, 12), size: rnd(6, 9) * k, life: 1.4, fade: 0.5 }); }
      for (let n = rate(dt, 12); n > 0; n--) spawn({ kind: 'smoke', x: f.x + rnd(-70, 70) * k, y: f.y - rnd(0, 10) * k, vx: rnd(-14, 14), vy: -rnd(10, 30) * k, size: rnd(10, 18) * k, grow: 16 * k, life: rnd(1.2, 2), color: '#3d5156', alpha: 0.28 });
      if (T > 1 && Math.random() < dt * 2.5) { const q = hp(rnd(36, 170), rnd(40, 200)); flare(q.x, q.y, rnd(16, 30) * k, '#ffffff', 0.35); }
    },
    bg(c, T) {
      const ctr = hp(100, 160), k = U(), s = ease(T / 0.6);
      c.fillStyle = radial(c, ctr.x, ctr.y, 260 * k, [[0, rgba('#2fd0b6', 0.4 * s)], [0.6, rgba('#1f7a70', 0.15 * s)], [1, 'rgba(10,30,30,0)']]); c.fillRect(0, 0, I.W, I.H);
      const m = hp(160, 20); c.fillStyle = radial(c, m.x, m.y, 90 * k, [[0, 'rgba(230,255,250,.35)'], [1, 'rgba(230,255,250,0)']]); c.beginPath(); c.arc(m.x, m.y, 90 * k, 0, TAU); c.fill();
    },
    fg() {},
  };

  // ---- ASSASSIN : traînées de vitesse, ombres, dédoublement, entailles ----
  SC.Assassin = {
    timing: { title: 0.55, desc: 1.05, stats: 1.45, skills: 1.9, ready: 2.6 },
    init() {
      I.sc = { slashes: [] };
      at(0.52, () => {
        const c = hp(100, 140), k = U(), L = 150 * k;
        [[-1, -1, 1, 1], [1, -1, -1, 1]].forEach((d, i) => at(i * 0.1, () => { I.sc.slashes.push({ x1: c.x + d[0] * L, y1: c.y + d[1] * L, x2: c.x + d[2] * L, y2: c.y + d[3] * L, t0: I.clock }); I.sc.last = I.clock; shake(7, 0.25); }));
        flashScreen('#ff2e5b', 0.35, 0.35);
        for (let i = 0; i < 34; i++) { const a = rnd(0, TAU); spawn({ kind: 'spark', x: c.x, y: c.y, vx: Math.cos(a) * rnd(160, 520) * k / 1.6, vy: Math.sin(a) * rnd(160, 520) * k / 1.6, drag: 3, size: rnd(1.5, 3), life: rnd(0.3, 0.7), color: pick(['#ff2e5b', '#ffffff', '#ff7a9a']), add: true }); }
      });
    },
    step(T, dt) {
      const k = U(), f = hp(100, 262), W = I.W;
      for (let n = rate(dt, T < 1.2 ? 60 : 16); n > 0; n--) { const y = I.hero.y + rnd(0, I.hero.h); spawn({ kind: 'streak', x: W + 40, y, vx: -rnd(1100, 2200), vy: 0, len: rnd(60, 220) * k, size: rnd(1, 2.6), life: rnd(0.25, 0.5), color: pick(['#ffffff', '#ff7a9a', '#c1123b']), add: true, alpha: 0.7 }); }
      for (let n = rate(dt, 14); n > 0; n--) spawn({ kind: 'smoke', x: f.x + rnd(-70, 70) * k, y: f.y - rnd(0, 20) * k, vx: rnd(-20, 20) * k, vy: -rnd(30, 100) * k, size: rnd(10, 22) * k, grow: 14 * k, life: rnd(0.9, 1.6), color: pick(['#0a0814', '#2a1030', '#1a0a20']), alpha: 0.7 });
      for (let n = rate(dt, 6); n > 0; n--) spawn({ kind: 'dot', x: f.x + rnd(-60, 60) * k, y: f.y - rnd(0, 40) * k, vy: -rnd(40, 110) * k, size: rnd(1.2, 2.4), life: 1.2, color: '#ff2e5b', add: true });
    },
    bg(c, T) {
      const ctr = hp(100, 150), k = U(), s = ease(T / 0.5);
      c.fillStyle = radial(c, ctr.x, ctr.y, 300 * k, [[0, rgba('#c1123b', 0.38 * s)], [0.55, rgba('#4a0d2a', 0.3 * s)], [1, 'rgba(10,0,20,0.45)']]); c.fillRect(0, 0, I.W, I.H);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.07 * s; c.fillStyle = '#ff7a9a';
      for (let i = 0; i < 6; i++) { const x = ((i * 0.23 + T * 0.35) % 1.4 - 0.2) * I.W; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 40 * k, 0); c.lineTo(x - 60 * k, I.H); c.lineTo(x - 100 * k, I.H); c.fill(); } c.restore();
    },
    fg(c, T) {
      I.sc.slashes.forEach(s => {
        const p = (I.clock - s.t0) / 0.14, a = 1 - clamp((I.clock - s.t0 - 0.14) / 0.5, 0, 1); if (a <= 0) return; const pp = clamp(p, 0, 1);
        const x = lerp(s.x1, s.x2, pp), y = lerp(s.y1, s.y2, pp), k = U();
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.globalAlpha = a;
        [[16, 'rgba(255,46,91,.4)'], [6, '#ff7a9a'], [2.5, '#ffffff']].forEach(([w, col]) => { c.strokeStyle = col; c.lineWidth = w * k / 1.5; c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(x, y); c.stroke(); });
        c.restore();
      });
    },
  };

  // ---- ARCHER : flèche qui traverse l'écran, traînée, impact ----
  SC.Archer = {
    timing: { title: 0.6, desc: 1.15, stats: 1.6, skills: 2.1, ready: 2.9 },
    init() {
      I.sc = { arrow: null, stuck: null, ring: 0 };
      at(0.25, () => I.els.hero.classList.add('cs-drawn'));
      at(0.88, () => {
        const k = U(), s = hp(168, 178), W = I.W, tx = W - 26, ty = clamp(I.hero.y + I.hero.h * 0.18, 30, I.H * 0.5);
        const ang = Math.atan2(ty - s.y, tx - s.x), spd = 1700;
        I.sc.arrow = { x: s.x, y: s.y, ang, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, trail: [], tx, ty };
        I.els.hero.classList.add('cs-shot');
        spawn({ kind: 'ring', x: s.x, y: s.y, size: 6, grow: 150 * k, life: 0.45, color: '#e8ffe8', lw: 3, add: true }); flare(s.x, s.y, 60 * k, '#ffffff', 0.35); shake(3, 0.2);
        for (let i = 0; i < 14; i++) spawn({ kind: 'streak', x: s.x - rnd(0, 120), y: s.y + rnd(-60, 60) * k, vx: rnd(500, 1000), vy: 0, len: rnd(40, 110) * k, size: 1.6, life: 0.4, color: '#c8ffd0', add: true, alpha: 0.7 });
      });
    },
    step(T, dt) {
      const k = U(), a = I.sc.arrow;
      if (a && !a.hit) {
        a.x += a.vx * dt; a.y += a.vy * dt; a.trail.push([a.x, a.y]); if (a.trail.length > 22) a.trail.shift();
        spawn({ kind: 'dot', x: a.x, y: a.y, vx: rnd(-30, 30), vy: rnd(-30, 30), size: rnd(2, 4), life: 0.5, color: pick(['#c8ffd0', '#58e06c', '#ffffff']), add: true });
        if (a.x >= a.tx - 4) {
          a.hit = true; I.sc.stuck = { x: a.tx, y: a.ty, ang: a.ang, t0: I.clock };
          spawn({ kind: 'ring', x: a.tx, y: a.ty, size: 6, grow: 260 * k, life: 0.6, color: '#c8ffd0', lw: 4, add: true }); spawn({ kind: 'ring', x: a.tx, y: a.ty, size: 4, grow: 140 * k, life: 0.45, color: '#ffffff', lw: 3, add: true });
          flare(a.tx, a.ty, 110 * k, '#ffffff', 0.5); shake(9, 0.4); flashScreen('#58e06c', 0.22, 0.4);
          for (let i = 0; i < 40; i++) { const an = rnd(Math.PI * 0.5, Math.PI * 1.5); spawn({ kind: 'spark', x: a.tx, y: a.ty, vx: Math.cos(an) * rnd(100, 520) * k / 1.6, vy: Math.sin(an) * rnd(160, 520) * k / 1.6 - 80, g: 700 * k / 1.6, size: rnd(1.5, 3.2), life: rnd(0.4, 0.9), color: pick(['#c8ffd0', '#58e06c', '#ffffff']), add: true }); }
        }
      }
      for (let n = rate(dt, 6); n > 0; n--) spawn({ kind: 'leaf', x: -10, y: rnd(0, I.H * 0.7), vx: rnd(120, 260), vy: rnd(10, 50), size: rnd(5, 9) * k, rot: rnd(0, 6), vr: rnd(-4, 4), sway: 40, swayF: 3, ph: rnd(0, 6), life: rnd(2.2, 3.6), color: pick(['#58e06c', '#3f9f4a', '#9af27a']), alpha: 0.85, fade: 0.5 });
      for (let n = rate(dt, 8); n > 0; n--) spawn({ kind: 'streak', x: -20, y: rnd(0, I.H), vx: rnd(700, 1300), vy: 0, len: rnd(50, 140) * k, size: 1.2, life: 0.5, color: '#c8ffd0', add: true, alpha: 0.28 });
    },
    bg(c, T) {
      const ctr = hp(100, 150), k = U(), s = ease(T / 0.5);
      c.fillStyle = radial(c, ctr.x, ctr.y, 280 * k, [[0, rgba('#58e06c', 0.32 * s)], [0.6, rgba('#1f6b34', 0.18 * s)], [1, 'rgba(5,30,15,0)']]); c.fillRect(0, 0, I.W, I.H);
    },
    fg(c, T) {
      const a = I.sc.arrow, k = U();
      if (a) {
        const tr = a.trail; c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        for (let i = 1; i < tr.length; i++) { const f = i / tr.length; c.globalAlpha = f * 0.9; c.strokeStyle = f > 0.7 ? '#ffffff' : '#7dffa0'; c.lineWidth = f * 9 * k / 1.4; c.beginPath(); c.moveTo(tr[i - 1][0], tr[i - 1][1]); c.lineTo(tr[i][0], tr[i][1]); c.stroke(); }
        c.restore();
        if (!a.hit) drawArrow(c, a.x, a.y, a.ang, k);
      }
      const s = I.sc.stuck;
      if (s) {
        const age = I.clock - s.t0, al = 1 - clamp((age - 1.6) / 0.9, 0, 1); if (al > 0) {
          c.save(); c.globalAlpha = al; c.strokeStyle = '#ff5263'; c.lineWidth = 3; for (let i = 1; i <= 3; i++) { c.globalAlpha = al * (0.9 - i * 0.2); c.beginPath(); c.arc(s.x, s.y, i * 20 * k + Math.sin(age * 8) * 1.5, 0, TAU); c.stroke(); }
          c.globalAlpha = al; drawArrow(c, s.x, s.y, s.ang, k); c.restore();
        }
      }
    },
  };
  function drawArrow(c, x, y, ang, k) {
    c.save(); c.translate(x, y); c.rotate(ang); const L = 66 * k;
    c.lineCap = 'round'; c.strokeStyle = OL; c.lineWidth = 7 * k / 1.4; c.beginPath(); c.moveTo(-L, 0); c.lineTo(0, 0); c.stroke();
    c.strokeStyle = '#e8c78a'; c.lineWidth = 3.5 * k / 1.4; c.beginPath(); c.moveTo(-L, 0); c.lineTo(0, 0); c.stroke();
    c.fillStyle = '#e9f1ff'; c.strokeStyle = OL; c.lineWidth = 2.5; c.beginPath(); c.moveTo(14 * k, 0); c.lineTo(-4 * k, -8 * k); c.lineTo(-4 * k, 8 * k); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e0343f'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-L, 0); c.lineTo(-L - 12 * k, s * 9 * k); c.lineTo(-L + 12 * k, s * 8 * k); c.closePath(); c.fill(); c.stroke(); }
    c.restore();
  }

  // ---- PALADIN : aura sacrée dorée, rayons, plumes ----
  SC.Paladin = {
    timing: { title: 0.8, desc: 1.3, stats: 1.75, skills: 2.25, ready: 3.0 },
    init() {
      I.sc = {};
      at(0.75, () => { const c = hp(100, 150), k = U(); spawn({ kind: 'ring', x: c.x, y: c.y, size: 10, grow: 360 * k, life: 0.9, color: '#fff3b0', lw: 5, add: true }); spawn({ kind: 'ering', x: hp(100, 266).x, y: hp(100, 266).y, size: 10, grow: 300 * k, life: 1, color: '#ffd23f', lw: 5, add: true }); flare(c.x, c.y - 30 * k, 170 * k, '#fff7d6', 0.8); flashScreen('#fff3b0', 0.55, 0.7); shake(4, 0.3); });
    },
    step(T, dt) {
      const k = U(), c = hp(100, 150);
      for (let n = rate(dt, 8); n > 0; n--) spawn({ kind: 'feather', x: rnd(0, I.W), y: -10, vx: rnd(-10, 10), vy: rnd(40, 90) * k / 1.2, size: rnd(9, 16) * k, rot: rnd(0, 6), vr: rnd(-1.5, 1.5), sway: 34, swayF: 2, ph: rnd(0, 6), life: rnd(3, 4.5), color: pick(['#fffbe8', '#fff3b0', '#ffe48a']), alpha: 0.95, fade: 0.4 });
      for (let n = rate(dt, 26); n > 0; n--) spawn({ kind: 'dot', x: c.x + rnd(-95, 95) * k, y: hp(100, 266).y - rnd(0, 20) * k, vy: -rnd(40, 160) * k / 1.4, size: rnd(1.4, 3.2), life: rnd(1, 1.8), color: pick(['#fff3b0', '#ffd23f', '#ffffff']), add: true });
    },
    bg(c, T) {
      const ctr = hp(100, 140), k = U(), s = ease(T / 0.7), R = Math.hypot(I.W, I.H);
      c.fillStyle = radial(c, ctr.x, ctr.y, 290 * k, [[0, rgba('#fff3b0', 0.65 * s)], [0.4, rgba('#ffd23f', 0.28 * s)], [1, 'rgba(255,180,40,0)']]); c.fillRect(0, 0, I.W, I.H);
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = radial(c, ctr.x, ctr.y, R * 0.6, [[0, rgba('#fff3b0', 0.55 * s)], [1, 'rgba(255,230,140,0)']]);
      c.beginPath(); const N = 14; for (let i = 0; i < N; i++) { const a = T * 0.18 + i * TAU / N, w = 0.09 + Math.sin(T * 1.3 + i) * 0.03; c.moveTo(ctr.x, ctr.y); c.lineTo(ctr.x + Math.cos(a - w) * R, ctr.y + Math.sin(a - w) * R); c.lineTo(ctr.x + Math.cos(a + w) * R, ctr.y + Math.sin(a + w) * R); c.closePath(); } c.fill(); c.restore();
      const col = c.createLinearGradient(0, 0, 0, hp(100, 266).y); col.addColorStop(0, 'rgba(255,250,220,.85)'); col.addColorStop(1, 'rgba(255,230,140,0)'); c.fillStyle = col; c.globalAlpha = s * (T < 1 ? 1 : 0.35); c.fillRect(ctr.x - 56 * k, 0, 112 * k, hp(100, 266).y); c.globalAlpha = 1;
      const f = hp(100, 266); c.save(); c.translate(f.x, f.y); c.scale(1, 0.28); c.fillStyle = radial(c, 0, 0, 140 * k, [[0, rgba('#ffe48a', 0.65 * s)], [1, 'rgba(255,228,138,0)']]); c.beginPath(); c.arc(0, 0, 140 * k, 0, TAU); c.fill(); c.restore();
    },
    fg(c, T) { const h = hp(100, 36), k = U(), s = ease((T - 0.6) / 0.5); if (s > 0) drawStar(c, h.x, h.y, (34 + Math.sin(T * 3) * 6) * k * s, '#fff7d6', 0.9); },
  };

  // ---- ÉLÉMENTALISTE : foudre et givre en alternance ----
  SC.Elementaliste = {
    timing: { title: 0.6, desc: 1.1, stats: 1.55, skills: 2.05, ready: 2.8 },
    init() { I.sc = { mix: 0, bolts: [], spikes: [], lastPhase: -1, nextBolt: 0.2 }; },
    phase(T) { return ((T - 0.1) % 2.4 + 2.4) % 2.4 < 1.2 ? 0 : 1; },
    step(T, dt) {
      const sc = I.sc, k = U(), ph = this.phase(T), f = hp(100, 266), W = I.W;
      sc.mix += ((ph) - sc.mix) * Math.min(1, dt * 5);
      if (ph !== sc.lastPhase) {
        sc.lastPhase = ph;
        if (ph === 1) {
          spawn({ kind: 'ering', x: f.x, y: f.y, size: 10, grow: 320 * k, life: 1, color: '#aef2ff', lw: 6, add: true });
          sc.spikes = []; for (let i = 0; i < 13; i++) sc.spikes.push({ a: -Math.PI * 0.04 + i * Math.PI * 1.08 / 12, h: rnd(36, 90) * k, r: rnd(40, 130) * k, t0: I.clock + i * 0.02 });
          flashScreen('#aef2ff', 0.3, 0.5); flare(f.x, f.y - 20 * k, 100 * k, '#ffffff', 0.5);
          if (T > 0.5) shake(5, 0.3);
        } else { flashScreen('#ffe45c', 0.4, 0.4); }
      }
      if (ph === 0) {
        sc.nextBolt -= dt;
        if (sc.nextBolt <= 0) {
          sc.nextBolt = rnd(0.14, 0.3); const tx = hp(rnd(60, 150), rnd(60, 200)); const sx = rnd(0.1, 0.9) * W;
          sc.bolts.push({ pts: boltPts(sx, -10, tx.x, tx.y, 90 * k, 5), t0: I.clock });
          if (Math.random() < 0.5) { const sx2 = tx.x + rnd(-1, 1) * 120 * k; sc.bolts.push({ pts: boltPts(tx.x, tx.y, sx2, tx.y + 140 * k, 50 * k, 4), t0: I.clock }); }
          for (let i = 0; i < 10; i++) spawn({ kind: 'spark', x: tx.x, y: tx.y, vx: rnd(-1, 1) * 380 * k / 1.6, vy: rnd(-1, 1) * 380 * k / 1.6, drag: 3, size: rnd(1.4, 2.6), life: rnd(0.2, 0.5), color: pick(['#fff7a0', '#ffe45c', '#ffffff', '#9c8cff']), add: true });
        }
      } else {
        for (let n = rate(dt, 24); n > 0; n--) spawn({ kind: 'dot', x: rnd(0, W), y: -8, vx: rnd(-24, 24), vy: rnd(60, 140) * k / 1.4, size: rnd(1.4, 3.4), life: 3, color: '#e6fbff', alpha: 0.9, sway: 22, swayF: 2, ph: rnd(0, 6), fade: 0.3 });
        for (let n = rate(dt, 14); n > 0; n--) { const a = rnd(-Math.PI, 0); spawn({ kind: 'shard', x: f.x + rnd(-40, 40) * k, y: f.y - 6 * k, vx: Math.cos(a) * rnd(60, 260) * k / 1.6, vy: Math.sin(a) * rnd(120, 360) * k / 1.6, g: 520 * k / 1.6, rot: rnd(0, 6), vr: rnd(-6, 6), size: rnd(6, 13) * k, life: rnd(0.7, 1.2), color: pick(['#aef2ff', '#7de8ff', '#e6fbff']), add: true }); }
      }
      sc.bolts = sc.bolts.filter(b => I.clock - b.t0 < 0.22);
    },
    bg(c, T) {
      const ctr = hp(100, 150), k = U(), m = I.sc.mix, s = ease(T / 0.5);
      const mixc = (a, b) => Math.round(lerp(a, b, m));
      const col = `rgba(${mixc(255, 125)},${mixc(228, 232)},${mixc(92, 255)},${0.42 * s})`, col2 = `rgba(${mixc(90, 26)},${mixc(60, 92)},${mixc(255, 207)},${0.35 * s})`;
      c.fillStyle = radial(c, ctr.x, ctr.y, 300 * k, [[0, col], [0.55, col2], [1, 'rgba(10,10,40,.2)']]); c.fillRect(0, 0, I.W, I.H);
      const f = hp(100, 266); I.sc.spikes.forEach(sp => {
        const p = ease((I.clock - sp.t0) / 0.35), x = f.x + Math.cos(sp.a) * sp.r * 1.7, y = f.y + Math.sin(sp.a) * sp.r * 0.3 * 0.6 + 6 * k;
        const fade = 1 - clamp((I.clock - sp.t0 - 1.0) / 0.5, 0, 1); if (p <= 0 || fade <= 0) return;
        c.save(); c.globalAlpha = fade; c.fillStyle = '#bff4ff'; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 9 * k, y); c.lineTo(x, y - sp.h * p); c.lineTo(x + 9 * k, y); c.closePath(); c.fill(); c.stroke(); c.restore();
      });
    },
    fg(c, T) {
      I.sc.bolts.forEach(b => { const a = 1 - (I.clock - b.t0) / 0.22; drawBolt(c, b.pts, '#ffe45c', 3 * U() / 1.4, a * (Math.random() < 0.25 ? 0.5 : 1)); });
    },
  };

  // ---- NÉCROMANCIEN : obscurité, armée d'ombres, glitch, pouvoir unique ----
  SC.Necromancien = {
    timing: { title: 3.3, desc: 4.2, stats: 4.6, skills: 5.1, ready: 6.0 },
    init() {
      I.sc = { pulse: -9, rings: 0 };
      const els = I.els.servants.children;
      for (let i = 0; i < els.length; i++) at(2.0 + i * 0.45, () => { els[i].classList.add('on'); const r = els[i].getBoundingClientRect(), s = I.els.stage.getBoundingClientRect(); const x = r.left - s.left + r.width / 2, y = r.bottom - s.top - 6, k = U(); spawn({ kind: 'ering', x, y, size: 6, grow: 90 * k, life: 0.8, color: '#a63cff', lw: 3, add: true }); for (let j = 0; j < 12; j++) spawn({ kind: 'flame', x: x + rnd(-20, 20) * k, y, vy: -rnd(60, 180) * k / 1.6, size: rnd(5, 10) * k, life: rnd(0.5, 0.9), color: pick(['#a63cff', '#6a1fd0', '#1a0830']), add: true }); shake(3, 0.2); }, true);
      at(3.3, () => {
        const c = hp(100, 150), f = hp(100, 266), k = U(); I.sc.pulse = I.clock;
        for (let i = 0; i < 3; i++) at(i * 0.16, () => spawn({ kind: 'ring', x: c.x, y: c.y, size: 20 * k, grow: Math.max(I.W, I.H) * 1.3, life: 1.1, color: i === 1 ? '#d9a0ff' : '#7a1fe0', lw: 8 - i * 2, add: true }));
        spawn({ kind: 'ering', x: f.x, y: f.y, size: 10, grow: 420 * k, life: 1.3, color: '#a63cff', lw: 8, add: true });
        flare(c.x, c.y, 260 * k, '#d9a0ff', 0.9); flashScreen('#7a1fe0', 0.7, 0.8); shake(15, 0.7);
        for (let i = 0; i < 60; i++) { const a = rnd(0, TAU); spawn({ kind: 'spark', x: c.x, y: c.y, vx: Math.cos(a) * rnd(200, 700) * k / 1.6, vy: Math.sin(a) * rnd(200, 700) * k / 1.6, drag: 2.2, size: rnd(1.6, 3.4), life: rnd(0.5, 1.2), color: pick(['#d9a0ff', '#a63cff', '#ffffff']), add: true }); }
      });
    },
    step(T, dt) {
      const k = U(), f = hp(100, 266), ctr = hp(100, 150), s = clamp(T / 2.5, 0, 1);
      for (let n = rate(dt, 10 + 16 * s); n > 0; n--) spawn({ kind: 'smoke', x: f.x + rnd(-90, 90) * k, y: f.y - rnd(0, 20) * k, vx: rnd(-16, 16), vy: -rnd(30, 90) * k, size: rnd(12, 24) * k, grow: 16 * k, life: rnd(1.1, 1.8), color: pick(['#0a0414', '#1a0830', '#26104a']), alpha: 0.4 });
      for (let n = rate(dt, 16 * s); n > 0; n--) spawn({ kind: 'dot', x: f.x + rnd(-80, 80) * k, y: f.y - rnd(0, 150) * k, vy: -rnd(40, 160) * k / 1.4, size: rnd(1.4, 3.2), life: rnd(0.9, 1.7), color: pick(['#a63cff', '#d9a0ff', '#6a1fd0']), add: true });
      if (T > 3.3) {
        const tr = I.els.title.getBoundingClientRect(), sr = I.els.stage.getBoundingClientRect();
        for (let n = rate(dt, 40); n > 0; n--) spawn({ kind: 'flame', x: tr.left - sr.left + rnd(0, tr.width), y: tr.top - sr.top + tr.height * rnd(0.45, 0.8), vy: -rnd(50, 140) * k / 1.2, size: rnd(5, 10) * k, life: rnd(0.45, 0.9), color: pick(['#a63cff', '#7a1fe0', '#220a40', '#d9a0ff']), add: true, alpha: 0.9 });
      }
    },
    bg(c, T) {
      const ctr = hp(100, 150), f = hp(100, 266), k = U(), d = ease(T / 2.5), W = I.W, H = I.H;
      c.fillStyle = radial(c, ctr.x, ctr.y, Math.hypot(W, H) * 0.7, [[0, `rgba(10,2,22,${0.35 * d})`], [0.5, `rgba(4,0,12,${0.8 * d})`], [1, `rgba(0,0,4,${0.96 * d})`]]); c.fillRect(0, 0, W, H);
      const pul = 0.8 + Math.sin(T * 2.6) * 0.2, a = ease((T - 1) / 1.5);
      c.fillStyle = radial(c, ctr.x, ctr.y + 20 * k, 250 * k, [[0, rgba('#a63cff', 0.5 * a * pul)], [0.5, rgba('#5a14b8', 0.22 * a)], [1, 'rgba(60,10,120,0)']]); c.fillRect(0, 0, W, H);
      magicCircle(c, f.x, f.y - 2 * k, 170 * k, 0.28, T, '#a63cff', '#d9a0ff', ease((T - 1.0) / 1.2), -T * 0.4);
      if (I.sc.pulse > -9) { const g = c.createLinearGradient(0, 0, 0, f.y); g.addColorStop(0, 'rgba(166,60,255,0)'); g.addColorStop(1, 'rgba(166,60,255,.5)'); c.fillStyle = g; c.globalAlpha = clamp(1 - (I.clock - I.sc.pulse) / 3, 0.35, 1) * 0.8; c.fillRect(ctr.x - 46 * k, 0, 92 * k, f.y); c.globalAlpha = 1; }
    },
    fg(c, T) { if (T > 1.8) { const h = hp(88, 88), h2 = hp(112, 88), k = U(), a = 0.6 + Math.sin(T * 5) * 0.3; drawStar(c, h.x, h.y, 14 * k, '#d9a0ff', a * ease((T - 1.8) / 0.6)); drawStar(c, h2.x, h2.y, 14 * k, '#d9a0ff', a * ease((T - 1.8) / 0.6)); } },
  };

  // ---- ??? : classe secrète verrouillée ----
  SC.locked = {
    timing: { title: 0.4, desc: 0.9, stats: 99, skills: 99, ready: 99 },
    init() { I.sc = {}; },
    step(T, dt) {
      const k = U(), f = hp(100, 266);
      for (let n = rate(dt, 14); n > 0; n--) spawn({ kind: 'smoke', x: f.x + rnd(-100, 100) * k, y: f.y - rnd(0, 30) * k, vx: rnd(-10, 10), vy: -rnd(14, 44) * k, size: rnd(16, 30) * k, grow: 14 * k, life: rnd(1.8, 2.8), color: pick(['#1a0830', '#26104a', '#120626']), alpha: 0.5 });
      for (let n = rate(dt, 5); n > 0; n--) spawn({ kind: 'dot', x: f.x + rnd(-80, 80) * k, y: f.y - rnd(0, 180) * k, vy: -rnd(10, 40) * k, size: rnd(1, 2.2), life: rnd(1.2, 2.2), color: '#a63cff', add: true, alpha: 0.7 });
    },
    bg(c, T) { const ctr = hp(100, 150), k = U(); c.fillStyle = radial(c, ctr.x, ctr.y, 300 * k, [[0, 'rgba(60,20,110,.45)'], [1, 'rgba(0,0,10,.75)']]); c.fillRect(0, 0, I.W, I.H); const f = hp(100, 266); magicCircle(c, f.x, f.y, 140 * k, 0.28, T, 'rgba(120,70,200,.6)', 'rgba(90,50,150,.5)', 0.8, T * 0.15); },
    fg() {},
  };

  SOUNDS.locked = (a, b) => { a.pad(b, 65, 1.4, 'sawtooth', 0.05, 0, 0.5); a.noiseHit(b, 1.2, 0.1, 300, 0, 'bandpass', 900); a.tone(b, 330, 0.9, 'sine', 0.04, 300, 0.2); };

  // ------------------------------------------------------------------
  //  CONSTRUCTION DE L'ÉCRAN
  // ------------------------------------------------------------------
  const corners = '<i class="cs-corner tl"></i><i class="cs-corner tr"></i><i class="cs-corner bl"></i><i class="cs-corner br"></i>';
  const TPL = () => `
    <header class="cs-head" style="--i:0">
      <button class="cs-back ds-icon-btn" type="button" aria-label="Retour">${ic('back', 22, '←')}</button>
      <div class="cs-headtitle"><span class="cs-kicker">Éveil · Création</span><h1 class="cs-h1">Choisis ta voie</h1></div>
      <div class="cs-name">
        <label class="cs-name-lbl" for="cs-name-in">Nom du héros</label>
        <div class="cs-name-row">
          <input id="cs-name-in" class="cs-name-in ds-input" type="text" maxlength="14" autocomplete="off" spellcheck="false" placeholder="Ex : Goro">
          <button class="cs-dice ds-icon-btn" type="button" aria-label="Nom aléatoire" title="Nom aléatoire">${DICE_SVG}</button>
        </div>
      </div>
    </header>
    <aside class="cs-list cs-panel ds-window ds-window--glass" style="--i:1">
      <div class="cs-sectitle ds-section-title"><span>Classes</span><span class="ds-section-title__aside cs-count">0/8</span></div>
      <div class="cs-gallery" role="listbox" aria-label="Classes"></div>
    </aside>
    <section class="cs-center">
      <div class="cs-frame" style="--i:2">
        ${corners}
        <div class="cs-stage">
          <canvas class="cs-cv cs-cv-back"></canvas>
          <div class="cs-servants"></div>
          <div class="cs-title"><div class="cs-role"></div><h2 class="cs-letters"></h2></div>
          <div class="cs-hero"><div class="cs-hero-in"></div></div>
          <canvas class="cs-cv cs-cv-front"></canvas>
          <div class="cs-mist" aria-hidden="true"></div>
          <div class="cs-crack" aria-hidden="true">${CRACK_SVG}</div>
          <button class="cs-3d ds-btn ds-btn--secondary ds-btn--sm" type="button" hidden aria-pressed="false">3D</button>
          <div class="cs-banner" hidden></div>
          <div class="cs-flash"></div>
        </div>
        <div class="cs-caption"><span class="cs-diff"><b>Difficulté</b><span class="cs-pips" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><em class="cs-diff-l">—</em></span><span class="cs-idx">—</span></div>
      </div>
      <div class="cs-foot" style="--i:4">
        <div class="cs-actions">
          <button class="cs-btn cs-ritual ds-btn ds-btn--violet" type="button"><span class="cs-runes" aria-hidden="true"></span><span class="cs-btn-txt"><span class="cs-ritual-t">Rituel d'éveil</span><small class="cs-ritual-s">0,01 %</small></span></button>
          <button class="cs-btn cs-confirm ds-btn ds-btn--primary ds-btn--lg" type="button" disabled><span class="ds-btn__icon">${ic('check', 22, '✔')}</span><span class="cs-confirm-t">Confirmer</span></button>
        </div>
        <p class="cs-warn" aria-live="polite"></p>
      </div>
    </section>
    <section class="cs-details cs-panel ds-window ds-window--glass" style="--i:3">
      <button class="cs-det-toggle" type="button" aria-expanded="false"><span class="cs-det-t">Fiche de classe</span><span class="cs-det-n"></span><span class="cs-chev">${ic('chevron-down', 18, '▾')}</span></button>
      <div class="cs-det-body">
        <p class="cs-desc"></p>
        <div class="cs-sectitle ds-section-title cs-st-stats"><span>Attributs</span></div>
        <div class="cs-stats"></div>
      </div>
      <div class="cs-sectitle ds-section-title cs-st-skills"><span>Compétences</span></div>
      <div class="cs-skills"></div>
    </section>
    <div class="cs-tip ds-tooltip" role="tooltip" hidden></div>`;

  // v6 : portraits des cartes rendus depuis les modèles 3D (une seule fois, mis en cache)
  const THUMBS = (G.__heroThumbs = G.__heroThumbs || {});
  function renderThumbs(ids) {
    const T = window.THREE; if (!T || !T.WebGLRenderer || !G.GFX || !G.GFX.makeHero) return;
    const todo = ids.filter(id => !THUMBS[id]); if (!todo.length) return;
    let r = null; const cv = document.createElement('canvas');
    try {
      r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(192, 192, false); r.setClearColor(0x000000, 0);
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(24, 1, 0.1, 40);
      scene.add(new T.HemisphereLight(0xffffff, 0x3a3060, 1.05)); const d = new T.DirectionalLight(0xfff2e0, 1.0); d.position.set(1.5, 3, 4); scene.add(d);
      const back = new T.DirectionalLight(0x9ab8ff, 0.6); back.position.set(-2, 2, -3); scene.add(back);
      todo.forEach(id => {
        let hero = null;
        try {
          hero = G.GFX.makeHero(id, {}); scene.add(hero);
          const h = (hero.userData && hero.userData.height) || 2.2;
          hero.rotation.y = 0.35; hero.updateMatrixWorld(true);
          cam.position.set(0.25, h * 0.86, 3.1); cam.lookAt(0, h * 0.74, 0); cam.updateProjectionMatrix();
          r.render(scene, cam);
          THUMBS[id] = cv.toDataURL('image/png');
        } catch (e) { /* garde le portrait illustré */ }
        if (hero) {
          scene.remove(hero);
          try { hero.traverse(o => { if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared) && o.geometry.dispose) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x && !(x.userData && x.userData.shared) && x.dispose) x.dispose(); }); }); } catch (_) {}
        }
      });
    } catch (e) { /* pas de WebGL : portraits illustrés */ }
    try { if (r) { r.dispose(); if (r.forceContextLoss) r.forceContextLoss(); } } catch (_) {}
  }
  function applyThumbs() {
    if (!I) return;
    I.els.gallery.querySelectorAll('.cs-card').forEach(c => {
      const id = c.dataset.id, url = THUMBS[id]; if (!url || c.classList.contains('locked')) return;
      const port = c.querySelector('.cs-card-port'); if (!port || port.querySelector('.cs-pimg')) return;
      const svg = port.querySelector('.cs-pfig'); const img = document.createElement('img');
      img.className = 'cs-pimg'; img.alt = ''; img.src = url; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 20%;pointer-events:none;';
      if (svg) svg.replaceWith(img); else port.insertBefore(img, port.firstChild);
    });
  }
  function portraitSVG(id) {
    const f = FIGS[id]; if (!f) return '';
    return `<svg class="cs-pfig" viewBox="22 6 156 132" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${f()}</svg>`;
  }
  function cardHTML(id, locked) {
    const o = info(id);
    if (locked) return `<span class="cs-card-port cs-lockport"><span class="cs-mist2"></span><span class="cs-lockico">${ic('lock', 26, '🔒')}</span>${CRACK_SVG}</span><span class="cs-card-name">???</span><span class="cs-card-sub">0,01 %</span><i class="cs-card-bar"></i>`;
    return `<span class="cs-card-port">${portraitSVG(id)}<span class="cs-card-ico">${ic(CLS_ICON[id] || 'star', 14, o.icon)}</span></span><span class="cs-card-name">${esc(o.name)}</span><span class="cs-card-sub">${esc(roleParts(o.role)[0] || '')}</span><i class="cs-card-bar"></i>`;
  }

  function mount(container, opts) {
    opts = opts || {};
    if (!container) return null;
    if (I) {
      if (I.root.parentNode === container && container.contains(I.root)) { I.opts = Object.assign(I.opts, opts); refreshUnlock(); return api; }   // re-render de l'UI : on ne relance rien
      MEMO = snapshot(); destroyInstance();
    }
    const rm = RMQ();
    I = {
      opts, container, rm, W: 0, H: 0, dpr: 1, hero: { x: 0, y: 0, w: 1, h: 1 },
      parts: [], cues: [], ticks: [], anims: [], flares: [], clock: 0, selT0: 0, last: 0, raf: 0, sel: null, scene: null, sc: {},
      bus: null, aw: { rolled: false, won: false }, rit: null, ready: false, uiDone: false, settled: false, kick: 3,
      necroUnlocked: false, t3: null, use3d: !!(window.THREE && window.THREE.WebGLRenderer), ro: null, handlers: [], tmpProfile: { awakening: { rolls: 0, crystals: 0, history: [] } },
    };
    const root = document.createElement('div'); root.className = 'cs-root cs-enter cs-collapsed'; root.innerHTML = TPL(); container.appendChild(root);
    I.root = root;
    const q = (s) => root.querySelector(s);
    I.els = { stage: q('.cs-stage'), hero: q('.cs-hero'), heroIn: q('.cs-hero-in'), title: q('.cs-title'), role: q('.cs-role'), letters: q('.cs-letters'), desc: q('.cs-desc'), stats: q('.cs-stats'), skills: q('.cs-skills'),
      tip: q('.cs-tip'), dice: q('.cs-dice'), detToggle: q('.cs-det-toggle'), detN: q('.cs-det-n'), pips: q('.cs-pips'), diffL: q('.cs-diff-l'), idx: q('.cs-idx'), count: q('.cs-count'), h1: q('.cs-h1'), confirmT: q('.cs-confirm-t'),
      servants: q('.cs-servants'), flash: q('.cs-flash'), banner: q('.cs-banner'), gallery: q('.cs-gallery'), confirm: q('.cs-confirm'), ritual: q('.cs-ritual'), warn: q('.cs-warn'), name: q('.cs-name-in'), back: q('.cs-back'), b3d: q('.cs-3d'), cvB: q('.cs-cv-back'), cvF: q('.cs-cv-front') };
    I.bc = I.els.cvB.getContext('2d'); I.fc = I.els.cvF.getContext('2d');
    // serviteurs du Nécromancien (derrière le héros)
    for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'cs-servant s' + i; d.innerHTML = SERVANT(i); I.els.servants.appendChild(d); }
    I.necroUnlocked = isNecroUnlocked(opts);
    IDS.forEach(id => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cs-card ds-card'; b.dataset.id = id; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', 'false');
      const o = info(id); b.style.setProperty('--c', o.color);
      const locked = id === 'Necromancien' && !I.necroUnlocked;
      if (locked) b.classList.add('locked');
      b.innerHTML = cardHTML(id, locked); b.style.setProperty('--n', IDS.indexOf(id));
      I.els.gallery.appendChild(b);
      on(b, 'click', () => onPick(id));
      on(b, 'pointerenter', (e) => { if (e.pointerType === 'mouse') hoverSnd(); });
    });
    on(I.els.confirm, 'click', confirm);
    on(I.els.ritual, 'click', startRitual);
    on(I.els.back, 'click', cancel);
    on(I.els.name, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (I.ready) confirm(); else onPickDefault(); } e.stopPropagation(); });
    on(I.els.name, 'input', () => { I.els.warn.textContent = ''; });
    on(I.els.b3d, 'click', toggle3D);
    on(I.els.dice, 'click', rollName);
    on(I.els.dice, 'pointerenter', (e) => { if (e.pointerType === 'mouse') hoverSnd(); });
    on(I.els.ritual, 'pointerenter', (e) => { if (e.pointerType === 'mouse' && !I.els.ritual.disabled) hoverSnd(); });
    on(I.els.confirm, 'pointerenter', (e) => { if (e.pointerType === 'mouse' && !I.els.confirm.disabled) hoverSnd(); });
    on(I.els.detToggle, 'click', () => { const c = I.root.classList.toggle('cs-collapsed'); I.els.detToggle.setAttribute('aria-expanded', c ? 'false' : 'true'); hideTip(); measureSoon(); });
    // info-bulles des compétences (survol, focus, ou appui sur écran tactile)
    on(I.els.skills, 'pointerover', (e) => { if (e.pointerType === 'mouse') { const b = e.target.closest && e.target.closest('.cs-skill'); b ? showTip(b) : hideTip(); } });
    on(I.els.skills, 'pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
    on(I.els.skills, 'focusin', (e) => { const b = e.target.closest && e.target.closest('.cs-skill'); if (b) showTip(b); });
    on(I.els.skills, 'focusout', hideTip);
    on(I.els.skills, 'click', (e) => { const b = e.target.closest && e.target.closest('.cs-skill'); if (!b) return; I.tipEl === b && !I.els.tip.hidden ? hideTip() : showTip(b); });
    on(document, 'pointerdown', (e) => { if (I && !I.els.tip.hidden && !(e.target.closest && e.target.closest('.cs-skill'))) hideTip(); });
    on(root, 'keydown', (e) => { if (e.target === I.els.name) return; const i = IDS.indexOf(I.sel); if (e.key === 'ArrowRight') onPick(IDS[(i + 1) % 8]); if (e.key === 'ArrowLeft') onPick(IDS[(i + 7) % 8]); });
    on(window, 'resize', measureSoon);
    if (window.ResizeObserver) { I.ro = new ResizeObserver(measureSoon); I.ro.observe(I.els.stage); }
    I.els.name.value = (MEMO && MEMO.name) || opts.defaultName || '';
    if (G.GFX && G.GFX.makeHero && window.THREE) { I.els.b3d.hidden = false; if (I.use3d) { I.els.b3d.classList.add('on'); I.els.b3d.setAttribute('aria-pressed', 'true'); } }
    // portraits 3D des cartes (après l'animation d'entrée, pour ne pas la saccader)
    atG(0.25, () => { if (!I) return; try { renderThumbs(IDS.filter(id => id !== 'Necromancien' || I.necroUnlocked)); applyThumbs(); } catch (_) {} });
    if (!MEMO) { try { G.Necro && G.Necro.resetCreation && G.Necro.resetCreation(); } catch (_) {} }
    if (MEMO) { I.aw = MEMO.aw; if (MEMO.rolled) I.els.ritual.disabled = true; }
    updateRitualBtn(); updateCount();
    measure();
    atG(1.3, () => { if (I) I.root.classList.remove('cs-enter'); });
    const first = (MEMO && MEMO.sel) || null;
    if (first) { I.settled = true; if (first === 'locked') playLocked(true); else play(first, { settled: true }); I.settled = false; }
    else { setEmpty(); }
    MEMO = null;
    kick();
    return api;
  }

  function rollName() {
    if (!I) return; const inp = I.els.name; inp.value = genName(); I.els.warn.textContent = '';
    const d = I.els.dice; d.classList.remove('cs-spin'); void d.offsetWidth; d.classList.add('cs-spin');
    inp.classList.remove('cs-flashname'); void inp.offsetWidth; inp.classList.add('cs-flashname');
    if (G.sfx && G.sfx.play) { try { G.sfx.play('click'); } catch (_) {} }
  }
  function updateCount() { if (I) I.els.count.textContent = (IDS.length - (I.necroUnlocked ? 0 : 1)) + '/' + IDS.length; }
  function showTip(el) {
    if (!I || !I.cl) return; const k = +el.dataset.k, sk = I.cl.skills[k]; if (!sk) return;
    const t = I.els.tip; I.tipEl = el;
    const meta = [sk.kind, sk.mana != null ? sk.mana + ' mana' : '', sk.cd != null ? sk.cd + ' s' : ''].filter(Boolean).join(' · ');
    t.innerHTML = `<b>${esc(sk.name)}</b><em>${esc(meta)}</em>${sk.desc ? `<span>${esc(sk.desc)}</span>` : ''}`;
    t.hidden = false;
    const r = el.getBoundingClientRect(), rr = I.root.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
    let x = r.left - rr.left + r.width / 2 - tw / 2; x = clamp(x, 6, Math.max(6, rr.width - tw - 6));
    let y = r.top - rr.top - th - 8; if (y < 6) y = r.bottom - rr.top + 8;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (I && I.els.tip) { I.els.tip.hidden = true; I.tipEl = null; } }

  function on(el, ev, fn, o) { el.addEventListener(ev, fn, o); I.handlers.push([el, ev, fn, o]); }
  function snapshot() { return I ? { sel: I.sel, name: I.els.name.value, aw: I.aw, rolled: I.aw.rolled } : null; }
  function isNecroUnlocked(o) {
    if (o.necroUnlocked) return true;
    const p = o.profile;
    try { if (G.Necro && G.Necro.isUnlocked && G.Necro.isUnlocked(p)) return true; } catch (_) {}
    return !!(p && (p.classe === 'Necromancien' || (p.unlockedClasses && p.unlockedClasses.indexOf('Necromancien') >= 0)));
  }
  function refreshUnlock() { if (I.opts.necroUnlocked && !I.necroUnlocked) unlockNecro(true); }

  function setEmpty() {
    I.els.letters.textContent = ''; I.els.role.innerHTML = '<span class="cs-badge ds-badge ds-badge--accent">Choisis ta voie</span>';
    I.els.desc.textContent = 'Touche une classe pour voir sa présentation.';
    I.els.stage.dataset.cls = 'none';
    I.els.stats.innerHTML = `<div class="cs-empty-d ds-empty">${ic('user', 28, '⚔️')}<span>Sélectionne une classe pour afficher ses attributs.</span></div>`; I.els.skills.innerHTML = '';
    I.els.detN.textContent = ''; setCaption(null);
    I.els.heroIn.innerHTML = `<div class="cs-empty"><span class="cs-empty-ring"></span>${ic('portal', 72, '⚔️')}</div>`;
    I.els.stage.classList.add('cs-idle'); I.els.stage.classList.remove('cs-showing');
    paintBlank();
  }
  function setCaption(cl, locked) {
    const n = cl ? cl.diff : (locked ? 5 : 0);
    I.els.pips.querySelectorAll('i').forEach((e, i) => e.classList.toggle('on', i < n));
    I.els.pips.dataset.n = n;
    I.els.diffL.textContent = n ? (locked ? 'Légendaire' : DIFF_LBL[n]) : '—';
    I.els.idx.textContent = cl ? String(IDS.indexOf(cl.id) + 1).padStart(2, '0') + ' / 0' + IDS.length : (locked ? '08 / 0' + IDS.length : '—');
  }
  function paintBlank() { if (!I) return; clear(); const c = I.bc, ctr = { x: I.W / 2, y: I.H * 0.45 }; c.fillStyle = radial(c, ctr.x, ctr.y, Math.max(I.W, I.H) * 0.6, [[0, 'rgba(255,210,63,.12)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, 0, I.W, I.H); }

  function measureSoon() { if (I) { I.needMeasure = true; kick(); } }
  function measure() {
    const st = I.els.stage.getBoundingClientRect(); I.W = st.width; I.H = st.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); I.dpr = dpr;
    [I.els.cvB, I.els.cvF].forEach(cv => { const w = Math.max(1, Math.round(I.W * dpr)), h = Math.max(1, Math.round(I.H * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } });
    I.bc.setTransform(dpr, 0, 0, dpr, 0, 0); I.fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hr = I.els.hero.getBoundingClientRect(); I.hero = { x: hr.left - st.left, y: hr.top - st.top, w: Math.max(1, hr.width), h: Math.max(1, hr.height) };
    I.needMeasure = false;
    if (I.t3) resize3D();
  }
  function clear() { I.bc.clearRect(0, 0, I.W, I.H); I.fc.clearRect(0, 0, I.W, I.H); }

  // ------------------------------------------------------------------
  //  PRÉSENTATION D'UNE CLASSE
  // ------------------------------------------------------------------
  function stopScene() {
    if (!I) return;
    I.cues = I.cues.filter(c => c.g); I.ticks = []; I.parts.length = 0; I.flares.length = 0;
    I.anims.forEach(a => { try { a.cancel(); } catch (_) {} }); I.anims = [];
    if (I.bus) { Aud.kill(I.bus); I.bus = null; }
    destroy3D();
    I.els.stage.style.transform = '';
    I.els.servants.querySelectorAll('.on').forEach(e => e.classList.remove('on'));
    I.els.hero.classList.remove('cs-drawn', 'cs-shot');
  }
  function setReady() { if (!I.ready) { I.ready = true; I.els.confirm.disabled = false; I.els.confirm.classList.add('cs-ready'); } }

  function play(id, o) {
    o = o || {};
    stopScene();
    const cl = info(id), sc = SC[id], settled = !!(o.settled || I.rm);
    I.settled = settled; I.sel = id; I.scene = sc; I.cl = cl; I.uiDone = false; I.ready = false; I.last = 0;
    I.els.confirm.disabled = true; I.els.confirm.classList.remove('cs-ready');
    I.selT0 = I.clock - (settled ? 4 : 0);
    const st = I.els.stage; st.dataset.cls = id; st.classList.remove('cs-idle', 'cs-locked'); st.classList.add('cs-showing');
    I.root.style.setProperty('--cc', cl.color); st.classList.remove('cs-locked'); I.root.classList.remove('cs-lockedmode');
    I.els.gallery.querySelectorAll('.cs-card').forEach(c => { const a = c.dataset.id === id; c.classList.toggle('sel', a); c.classList.toggle('is-selected', a); c.setAttribute('aria-selected', a ? 'true' : 'false'); });
    // hero : nouveau nœud = animation d'entrée CSS rejouée
    const hin = document.createElement('div'); hin.className = 'cs-hero-in'; hin.innerHTML = figSvg(id);
    I.els.hero.replaceChild(hin, I.els.heroIn); I.els.heroIn = hin; I.els.hero.classList.remove('cs-is3d');
    if (settled) hin.classList.add('cs-settled');
    // ghosts (Assassin) : copies translucides pour le dédoublement
    if (id === 'Assassin') for (let i = 0; i < 3; i++) { const g = document.createElement('div'); g.className = 'cs-ghost g' + i; g.innerHTML = figSvg(id); hin.appendChild(g); }
    hideTip();
    I.els.role.innerHTML = roleParts(cl.role).map((r, i) => `<span class="cs-badge ds-badge${i ? '' : ' ds-badge--accent'}">${esc(r)}</span>`).join('') + `<span class="cs-badge ds-badge cs-bdiff ds-badge--gold" data-d="${cl.diff}">${esc(DIFF_LBL[cl.diff])}</span>`;
    I.els.stats.innerHTML = statBars(cl).map(s => `<div class="cs-stat" data-k="${s.k}"><span class="cs-stat-l">${ic(STAT_ICON[s.k], 14)}<span>${s.label}</span></span><span class="cs-bar ds-bar"><i class="ds-bar__fill" style="--w:${(s.frac * 100).toFixed(0)}%"></i></span><span class="cs-stat-v">${s.val}</span></div>`).join('');
    I.els.skills.innerHTML = cl.skills.map((s, i) => `<button type="button" class="cs-skill${i === 3 ? ' cs-ult' : ''}" data-k="${i}" aria-label="${esc(s.name)}"><span class="cs-skill-i">${ic(s.ico, 26, s.icon)}</span><span class="cs-skill-n">${esc(s.name)}</span></button>`).join('');
    I.els.detN.textContent = cl.name; setCaption(cl);
    I.els.letters.innerHTML = ''; const name = cl.name.toUpperCase(); I.letters = [];
    for (const ch of name) { const s = document.createElement('span'); s.className = 'cs-l'; s.textContent = ch === ' ' ? ' ' : ch; s.dataset.ch = s.textContent; I.els.letters.appendChild(s); I.letters.push(s); }
    I.els.letters.setAttribute('aria-label', cl.name); I.els.letters.dataset.text = name;
    I.els.desc.textContent = ''; measure();
    if (!settled) {
      const tm = sc.timing, stats = I.els.stats.children, sk = I.els.skills.children;
      const necro = id === 'Necromancien';
      I.ticks.push(titleTicker(I.clock + tm.title, necro ? 0.1 : 0.06, necro));
      I.ticks.push(descTicker(cl.desc, I.clock + tm.desc, necro ? 60 : 85));
      for (let i = 0; i < stats.length; i++) at(tm.stats + i * 0.1, () => stats[i] && stats[i].classList.add('on'));
      for (let i = 0; i < sk.length; i++) at(tm.skills + i * 0.28, () => { sk[i] && sk[i].classList.add('on'); const r = sk[i].getBoundingClientRect(), s = I.els.stage.getBoundingClientRect(); if (!I.rm && r.top < s.bottom) for (let j = 0; j < 6; j++) spawn({ kind: 'dot', x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, vx: rnd(-90, 90), vy: rnd(-90, 90), drag: 3, size: rnd(1.5, 3), life: 0.5, color: cl.color, add: true }); if (Aud.ctx && !Aud.muted()) { const b = Aud.bus(); b && Aud.tone(b, 700 + i * 160, 0.1, 'triangle', 0.05, 1100 + i * 160); } });
      at(tm.ready, () => { setReady(); const b = Aud.bus(); b && SOUNDS.ready(Aud, b); });
      I.bus = playSound(id);
    } else completeUI();
    if (sc.init) sc.init(settled);
    if (I.use3d) mount3D(id);
    if (!settled && G.sfx && G.sfx.play) { try { G.sfx.play('click'); } catch (_) {} }
    if (o.fromRitual) { /* titre « ÉVEIL » géré par la bannière */ }
    kick();
  }

  function completeUI() {
    if (!I || I.uiDone) return; I.uiDone = true;
    I.letters && I.letters.forEach(s => { s.classList.add('on'); s.textContent = s.dataset.ch; });
    if (I.cl) I.els.desc.textContent = I.cl.desc;
    I.els.stats.querySelectorAll('.cs-stat').forEach(e => e.classList.add('on'));
    I.els.skills.querySelectorAll('.cs-skill').forEach(e => e.classList.add('on'));
    I.els.stage.classList.add('cs-done');
    I.ticks = []; setReady();
  }
  function titleTicker(t0, step, scramble) {
    let shown = -1;
    return () => {
      if (I.uiDone) return true;
      const L = I.letters, now = I.clock - t0; if (now < 0) return false;
      let done = true;
      for (let i = 0; i < L.length; i++) {
        const age = now - i * step; if (age < 0) { done = false; continue; }
        if (!L[i].classList.contains('on')) { L[i].classList.add('on'); if (!I.rm) { const r = L[i].getBoundingClientRect(), s = I.els.stage.getBoundingClientRect(); if (r.width) spawn({ kind: 'dot', x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, vx: rnd(-60, 60), vy: rnd(-90, 20), g: 120, size: rnd(1.5, 3), life: 0.6, color: I.cl.color, add: true }); } }
        if (scramble && age < 0.5) { L[i].textContent = '▓▒░#@%&$ABCDEFGHJKLMNPRSTUVWXZ'.charAt(Math.floor(Math.random() * 29)); done = false; } else L[i].textContent = L[i].dataset.ch;
      }
      return done;
    };
  }
  function descTicker(text, t0, cps) {
    let n = -1;
    return () => {
      if (I.uiDone) return true; const now = I.clock - t0; if (now < 0) return false;
      const k = Math.min(text.length, Math.floor(now * cps)); if (k !== n) { n = k; I.els.desc.textContent = text.slice(0, k); }
      return k >= text.length;
    };
  }

  function playLocked(settled) {
    stopScene();
    const sc = SC.locked; I.settled = !!settled; I.sel = 'locked'; I.scene = sc; I.cl = null; I.uiDone = false; I.ready = false; I.selT0 = I.clock - (settled ? 4 : 0);
    I.els.confirm.disabled = true; I.els.confirm.classList.remove('cs-ready');
    const st = I.els.stage; st.dataset.cls = 'locked'; st.classList.remove('cs-idle', 'cs-done'); st.classList.add('cs-showing', 'cs-locked');
    I.root.style.setProperty('--cc', '#a63cff'); I.root.classList.add('cs-lockedmode'); hideTip();
    I.els.gallery.querySelectorAll('.cs-card').forEach(c => { const a = c.dataset.id === 'Necromancien'; c.classList.toggle('sel', a); c.classList.toggle('is-selected', a); c.setAttribute('aria-selected', a ? 'true' : 'false'); });
    const hin = document.createElement('div'); hin.className = 'cs-hero-in'; hin.innerHTML = `<svg class="cs-fig cs-mystery" viewBox="-10 -4 220 284" aria-hidden="true"><ellipse cx="100" cy="268" rx="62" ry="9" fill="rgba(0,0,0,.35)"/><path d="M100 18 Q150 24 150 92 Q156 120 168 262 L136 240 L118 268 L100 244 L82 268 L64 240 L32 262 Q44 120 50 92 Q50 24 100 18Z" fill="#0a0612" stroke="#5a2fa0" stroke-width="4" stroke-linejoin="round"/><text x="100" y="150" font-size="96" font-weight="900" text-anchor="middle" fill="#a63cff" class="cs-glow" font-family="'Lilita One','Arial Black',sans-serif">?</text></svg>`;
    I.els.hero.replaceChild(hin, I.els.heroIn); I.els.heroIn = hin; I.els.hero.classList.remove('cs-is3d');
    I.els.role.innerHTML = '<span class="cs-badge ds-badge ds-badge--violet">Classe secrète</span><span class="cs-badge ds-badge ds-badge--danger">1 chance sur 10\u00a0000</span>';
    I.els.letters.innerHTML = '<span class="cs-l on">?&nbsp;?&nbsp;?</span>';
    I.letters = [];
    I.els.stats.innerHTML = `<div class="cs-empty-d ds-empty cs-sealed">${ic('lock', 28, '🔒')}<span>Attributs scellés. Seul le Rituel d'éveil peut lever le sceau.</span></div>`; I.els.skills.innerHTML = '';
    I.els.detN.textContent = '???'; setCaption(null, true);
    I.els.desc.innerHTML = '';
    const txt = `Une classe secrète sommeille quelque part. Rareté : ${RARITY_NECRO}. Seul le « Rituel d'éveil » peut la révéler.`;
    if (settled) I.els.desc.textContent = txt; else I.ticks.push(descTicker(txt, I.clock + 0.4, 80));
    measure();
    if (!settled) I.bus = playSound('locked');
    if (sc.init) sc.init();
    kick();
  }

  function onPick(id) {
    if (!I) return;
    Aud.ensure();
    if (I.rit) { const won = finishRitual(true); if (won) return; }
    if (id === 'Necromancien' && !I.necroUnlocked) { if (I.sel !== 'locked') playLocked(); return; }
    if (id === I.sel) { completeUI(); return; }          // 2e clic : tout afficher, Confirmer actif
    play(id);
  }
  function onPickDefault() { if (!I.sel) onPick('Guerrier'); }

  // ------------------------------------------------------------------
  //  RITUEL D'ÉVEIL
  // ------------------------------------------------------------------
  function updateRitualBtn() {
    const b = I.els.ritual, t = b.querySelector('.cs-ritual-t'), s = b.querySelector('.cs-ritual-s');
    b.classList.remove('cs-casting');
    if (I.necroUnlocked && !I.aw.rolled) { b.disabled = true; t.textContent = 'Éveil accompli'; s.textContent = 'Nécromancien disponible'; return; }
    if (I.aw.rolled) { b.disabled = true; t.textContent = I.aw.won ? 'Éveil accompli' : 'Rituel accompli'; s.textContent = I.aw.won ? 'Nécromancien éveillé' : 'une tentative par héros'; }
    else { b.disabled = false; t.textContent = "Rituel d'éveil"; s.textContent = '0,01 % · 1 tentative'; }
  }
  function doRoll() {
    let res = null;
    try { if (G.Necro && G.Necro.awakeningRoll) res = G.Necro.awakeningRoll(I.opts.profile || null, 'creation', { noOffer: true, silent: true }); } catch (_) { res = null; }
    if (!res) {     // secours si G.Necro est absent : même probabilité exacte (1 / 10 000), tirage cryptographique
      let f = Math.random();
      try { if (G.rng && G.rng.float) f = G.rng.float(); else if (window.crypto && crypto.getRandomValues) f = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch (_) {}
      res = { won: f < 0.0001, roll: f };
    }
    return res;
  }
  function startRitual() {
    if (!I || I.aw.rolled || I.rit) return;
    Aud.ensure();
    const res = doRoll();                       // le résultat est fixé dès maintenant (impossible à relancer en quittant)
    if (res.refused) { I.aw = { rolled: true, won: false, refused: true }; updateRitualBtn(); banner(`<b>Rituel indisponible</b><span>${res.reason || ''}</span>`, 'fail', 3); return; }
    I.aw = { rolled: true, won: !!res.won, roll: res.roll };
    const dur = I.rm ? 0.5 : 2.4;
    I.rit = { t0: I.clock, dur, won: I.aw.won, phase: 'charge', out: 0 };
    I.els.stage.classList.add('cs-ritualing'); I.root.classList.add('cs-ritualing'); I.els.ritual.disabled = true; I.els.ritual.classList.add('cs-casting');
    I.els.ritual.querySelector('.cs-ritual-t').textContent = 'Éveil en cours…';
    I.ritBus = I.rm ? null : playSound('ritual');
    kick();
  }
  function banner(html, cls, dur) {
    const b = I.els.banner; b.className = 'cs-banner ' + (cls || ''); b.innerHTML = html; b.hidden = false;
    void b.offsetWidth; b.classList.add('show');
    const key = ++I.bKey || (I.bKey = 1);
    atG(dur, () => { if (I && I.bKey === key) { I.els.banner.classList.remove('show'); I.els.banner.hidden = true; } });
  }
  // fin du rituel ; renvoie true si gagné. instant = interrompu par un clic ailleurs
  function finishRitual(instant) {
    const r = I.rit; if (!r) return false; I.rit = null;
    I.els.stage.classList.remove('cs-ritualing'); I.root.classList.remove('cs-ritualing'); I.els.stage.style.transform = '';
    if (I.ritBus) { Aud.kill(I.ritBus); I.ritBus = null; }
    updateRitualBtn();
    if (r.won) {
      unlockNecro(false); I.necroUnlocked = true; updateRitualBtn();
      banner(`<b>ÉVEIL !</b><span>Une classe secrète répond à ton appel…</span>`, 'win', 3.2);
      play('Necromancien', { fromRitual: true });
      const b = Aud.bus(); b && SOUNDS.ritualWin(Aud, b);
      flashScreen('#ffffff', 0.9, 0.9);
      return true;
    }
    banner(`<b>L'éveil n'a pas répondu…</b><span>0,01 %</span>`, 'fail', 3.4);
    const b = Aud.bus(); b && SOUNDS.ritualFail(Aud, b);
    if (!instant && !I.rm) { const c = hp(100, 150), k = U(); for (let i = 0; i < 40; i++) { const a = rnd(0, TAU); spawn({ kind: 'shard', x: c.x + Math.cos(a) * Math.min(I.W, I.H) * 0.4, y: c.y + Math.sin(a) * Math.min(I.W, I.H) * 0.4, vx: Math.cos(a) * rnd(40, 160), vy: Math.sin(a) * rnd(40, 160) + 30, g: 200, rot: rnd(0, 6), vr: rnd(-4, 4), size: rnd(4, 9) * k, life: rnd(0.8, 1.5), color: '#a98be0', add: true, alpha: 0.8 }); } }
    return false;
  }
  function unlockNecro() {
    I.necroUnlocked = true;
    const b = I.els.gallery.querySelector('[data-id="Necromancien"]'); if (b) { b.classList.remove('locked'); b.classList.add('cs-new', 'is-new'); b.innerHTML = cardHTML('Necromancien', false); try { renderThumbs(['Necromancien']); applyThumbs(); } catch (_) {} }
    updateCount();
  }
  function ritualDraw(T) {
    const r = I.rit, rt = I.clock - r.t0, p = clamp(rt / r.dur, 0, 1), c0 = hp(100, 150), R = Math.min(I.W, I.H) * 0.42, k = U();
    const b = I.bc, f = I.fc;
    if (I.rm) { b.fillStyle = 'rgba(10,0,30,.6)'; b.fillRect(0, 0, I.W, I.H); if (rt >= r.dur) finishRitual(false); return; }
    b.fillStyle = `rgba(6,0,18,${0.62 * ease(p * 2.5)})`; b.fillRect(0, 0, I.W, I.H);
    b.fillStyle = radial(b, c0.x, c0.y, R * (0.4 + p), [[0, `rgba(${Math.round(lerp(150, 255, p * p))},${Math.round(lerp(80, 255, p * p * p))},255,${0.15 + p * 0.5})`], [1, 'rgba(120,60,255,0)']]); b.fillRect(0, 0, I.W, I.H);
    // anneaux qui se remplissent
    b.save(); b.translate(c0.x, c0.y); b.globalCompositeOperation = 'lighter'; b.lineCap = 'round';
    const rot = rt * (0.6 + 5 * p * p);
    [[1, 5, '#c9a6ff', 1], [0.8, 3, '#7de8ff', -1], [0.6, 3, '#ff9bd2', 1]].forEach(([rr, lw, col, dir]) => { b.strokeStyle = col; b.lineWidth = lw; b.globalAlpha = 0.25; b.beginPath(); b.arc(0, 0, R * rr, 0, TAU); b.stroke(); b.globalAlpha = 0.95; b.beginPath(); b.arc(0, 0, R * rr, -Math.PI / 2 + rot * dir * 0.3, -Math.PI / 2 + rot * dir * 0.3 + TAU * p); b.stroke(); });
    const N = 12; for (let i = 0; i < N; i++) { if (i / N > p) break; const a = rot * 0.5 + i * TAU / N; b.save(); b.rotate(a); b.translate(R * 0.9, 0); b.strokeStyle = '#fff3ff'; b.globalAlpha = 0.5 + 0.5 * Math.sin(rt * 9 + i); b.lineWidth = 2.5; b.beginPath(); GLYPHS[i].forEach((q, j) => j % 2 === 0 ? b.moveTo(q[0] * R * 0.06, q[1] * R * 0.08) : b.lineTo(q[0] * R * 0.06, q[1] * R * 0.08)); b.stroke(); b.restore(); }
    b.rotate(-rot * 0.7); b.strokeStyle = '#e6d6ff'; b.globalAlpha = 0.7; b.lineWidth = 2; b.beginPath(); for (let i = 0; i < 5; i++) { const a = i * TAU * 2 / 5; const x = Math.cos(a) * R * 0.58, y = Math.sin(a) * R * 0.58; i ? b.lineTo(x, y) : b.moveTo(x, y); } b.closePath(); b.stroke();
    b.restore();
    // particules qui convergent vers le cercle
    for (let n = rate(0.016, 40 + 160 * p); n > 0; n--) { const a = rnd(0, TAU), d = R * rnd(1.0, 1.5); spawn({ kind: 'dot', x: c0.x + Math.cos(a) * d, y: c0.y + Math.sin(a) * d, home: { x: c0.x, y: c0.y }, homeK: 2.5 + 4 * p, size: rnd(1.4, 3), life: rnd(0.4, 0.8), color: pick(['#c9a6ff', '#7de8ff', '#ffffff']), add: true }); }
    if (p > 0.8) { f.save(); f.globalCompositeOperation = 'lighter'; f.globalAlpha = (p - 0.8) * 3 * (0.6 + Math.random() * 0.4); f.fillStyle = radial(f, c0.x, c0.y, R, [[0, '#ffffff'], [0.3, 'rgba(200,170,255,.6)'], [1, 'rgba(120,60,255,0)']]); f.fillRect(0, 0, I.W, I.H); f.restore(); }
    const amp = 2.5 * p * p; I.els.stage.style.transform = `translate(${rnd(-amp, amp).toFixed(1)}px,${rnd(-amp, amp).toFixed(1)}px)`;
    if (rt >= r.dur) finishRitual(false);
  }

  // ------------------------------------------------------------------
  //  APERÇU 3D OPTIONNEL (G.GFX.makeHero dans un petit renderer dédié)
  // ------------------------------------------------------------------
  function toggle3D() {
    if (!I) return; I.use3d = !I.use3d; I.els.b3d.setAttribute('aria-pressed', I.use3d ? 'true' : 'false'); I.els.b3d.classList.toggle('on', I.use3d);
    if (I.use3d) { if (I.sel && I.sel !== 'locked') mount3D(I.sel); if (!I.t3) { I.use3d = false; I.els.b3d.classList.remove('on'); } } else destroy3D();
    kick();
  }
  function mount3D(id) {
    destroy3D();
    try {
      const T = window.THREE; if (!T || !G.GFX || !G.GFX.makeHero) return;
      if (['Guerrier', 'Mage', 'Voleur'].indexOf(id) < 0 && G.GFX.hasModel && !G.GFX.hasModel('hero', id)) return;
      const cv = document.createElement('canvas'); cv.className = 'cs-3dcv';
      const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setClearColor(0x000000, 0);
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(28, 1, 0.1, 60);
      scene.add(new T.HemisphereLight(0xffffff, 0x4a3a7a, 1.0)); const d = new T.DirectionalLight(0xffffff, 0.9); d.position.set(2, 4, 3); scene.add(d);
      const hero = G.GFX.makeHero(id, {}); scene.add(hero);
      I.els.heroIn.appendChild(cv); I.els.hero.classList.add('cs-is3d');
      I.t3 = { r, scene, cam, hero, cv }; resize3D();
    } catch (e) { destroy3D(); }
  }
  function resize3D() {
    const t = I.t3; if (!t) return; const w = Math.max(2, I.hero.w), h = Math.max(2, I.hero.h);
    t.r.setSize(w, h, false); t.cam.aspect = w / h; t.cam.position.set(0, 1.25, 6.2); t.cam.lookAt(0, 0.95, 0); t.cam.updateProjectionMatrix();
  }
  function destroy3D() {
    if (!I || !I.t3) { if (I) I.els.hero.classList.remove('cs-is3d'); return; }
    const t = I.t3; I.t3 = null;
    try { t.scene.traverse(o => { if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared) && o.geometry.dispose) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x && !(x.userData && x.userData.shared) && x.dispose) x.dispose(); }); }); t.r.dispose(); if (t.r.forceContextLoss) t.r.forceContextLoss(); } catch (_) {}
    try { t.cv.remove(); } catch (_) {}
    I.els.hero.classList.remove('cs-is3d');
  }

  // ------------------------------------------------------------------
  //  BOUCLE UNIQUE (un seul requestAnimationFrame)
  // ------------------------------------------------------------------
  function kick(n) { if (!I) return; I.kick = Math.max(I.kick, n || 3); if (!I.raf) I.raf = requestAnimationFrame(frame); }
  function frame(ts) {
    if (!I) return; I.raf = 0;
    const now = ts / 1000, dt = I.last ? clamp(now - I.last, 0, 0.05) : 0.016; I.last = now;
    I.clock += dt;
    if (I.needMeasure) measure();
    // cues planifiés
    if (I.cues.length) { const due = I.cues.filter(c => c.t <= I.clock); if (due.length) { I.cues = I.cues.filter(c => c.t > I.clock); due.sort((a, b) => a.t - b.t).forEach(c => { try { c.fn(); } catch (e) { /* un cue raté ne doit pas casser la boucle */ } }); } }
    for (let i = I.ticks.length - 1; i >= 0; i--) { let d = false; try { d = I.ticks[i](); } catch (_) { d = true; } if (d) I.ticks.splice(i, 1); }
    const visible = I.root.offsetParent !== null && I.W > 4;
    const animating = !I.rm || I.rit;
    if (visible && (animating || I.kick > 0)) {
      const T = I.clock - I.selT0;
      clear();
      const sc = I.scene;
      if (sc) {
        if (!I.rm || I.kick > 0) { try { sc.bg.call(sc, I.bc, T); } catch (_) {} }
        if (animating && !I.settledStatic) { try { sc.step.call(sc, T, dt); } catch (_) {} }
        stepParticles(dt); drawParticles();
        try { sc.fg.call(sc, I.fc, T); } catch (_) {}
        for (let i = I.flares.length - 1; i >= 0; i--) { const f = I.flares[i]; f.age += dt; if (f.age >= f.life) { I.flares.splice(i, 1); continue; } const q = f.age / f.life; drawStar(I.fc, f.x, f.y, f.size * (0.4 + Math.sin(q * Math.PI) * 0.6), f.color, 1 - q); }
      } else if (!I.sel) paintBlank();
      if (I.rit) ritualDraw(T);
      if (I.t3) { const t = I.t3; t.hero.rotation.y = 0.32 + Math.sin(I.clock * 0.35) * 0.22; try { t.r.render(t.scene, t.cam); } catch (_) {} }
    }
    if (I.kick > 0) I.kick--;
    if (animating || I.kick > 0 || I.cues.length || I.ticks.length) I.raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------
  //  CONFIRMER / ANNULER / NETTOYAGE
  // ------------------------------------------------------------------
  function confirm() {
    if (!I) return;
    Aud.ensure();
    const warn = (m) => { I.els.warn.textContent = m; if (!Aud.muted()) { const b = Aud.bus(); b && SOUNDS.error(Aud, b); } I.els.name.classList.remove('cs-shake'); void I.els.name.offsetWidth; I.els.name.classList.add('cs-shake'); };
    if (!I.sel || I.sel === 'locked') return warn('Choisis une classe.');
    const nom = I.els.name.value.trim().slice(0, 14);
    if (!nom) { I.els.name.focus(); return warn('Donne un nom à ton héros.'); }
    if (I.rit) finishRitual(true);
    const cb = I.opts.onConfirm, id = I.sel, extra = { awakening: { rolled: !!I.aw.rolled, won: !!I.aw.won } };
    if (G.sfx && G.sfx.play) { try { G.sfx.play('upgrade'); } catch (_) {} }
    let keep = false;
    try { keep = cb && cb(id, nom, extra) === false; } catch (e) { keep = true; if (window.console) console.error(e); }
    if (!keep) { MEMO = null; destroyInstance(); }
  }
  function cancel() {
    if (!I) return; const cb = I.opts.onCancel; MEMO = null; destroyInstance();
    try { cb && cb(); } catch (e) { if (window.console) console.error(e); }
  }
  function destroyInstance() {
    if (!I) return; const x = I;
    if (x.raf) cancelAnimationFrame(x.raf); x.raf = 0;
    stopScene(); x.cues = [];
    if (x.ritBus) Aud.kill(x.ritBus);
    x.handlers.forEach(([el, ev, fn, o]) => { try { el.removeEventListener(ev, fn, o); } catch (_) {} }); x.handlers = [];
    if (x.ro) { try { x.ro.disconnect(); } catch (_) {} x.ro = null; }
    destroy3D();
    Aud.destroy();
    try { x.root.parentNode && x.root.parentNode.removeChild(x.root); } catch (_) {}
    I = null;
  }
  function unmount() { MEMO = null; destroyInstance(); }

  const api = {
    version: 1,
    mount, unmount,
    isMounted: () => !!I,
    select(id) { if (I && IDS.indexOf(id) >= 0) onPick(id); },
    selected: () => (I ? I.sel : null),
    demoNecro() { if (!I) return; Aud.ensure(); if (I.rit) finishRitual(true); unlockNecro(); banner(`<b>ÉVEIL !</b><span>Une classe secrète répond à ton appel…</span>`, 'win', 3.2); I.sel = null; play('Necromancien', { fromRitual: true }); },
    awakening: () => (I ? { rolled: !!I.aw.rolled, won: !!I.aw.won } : null),
    _debug: () => (I ? { parts: I.parts.length, cues: I.cues.length, raf: I.raf, ticks: I.ticks.length, clock: I.clock, t3: !!I.t3, buses: Aud.buses.length } : null),
  };
  G.ClassSelect = api;
})();
