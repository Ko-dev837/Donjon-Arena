window.G = window.G || {};
/* =====================================================================
   js/net/guild-ui.js — page « Guilde » du camp (G.Panels, juste après « En ligne »)
   - Sans guilde : créer (nom, tag, emblème) ou rejoindre par code ; lien ?guilde=CODE proposé après connexion
   - Avec guilde : en-tête (emblème, message du jour, effectifs, code + QR), puis sous-onglets
     Membres · Discussion · Journal · Rôles · Paramètres (chef)
   - Toutes les actions passent par G.Online (règles d'accès : G.Online.guildCan, miroir de firestore.rules)
   - Confirmations (exclure, transférer, dissoudre, quitter) : G.UI.modal du design system, jamais alert/confirm
   Tout texte venant du réseau passe par esc().
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const O = () => G.Online;
  const H = () => (G.OnlineUI && G.OnlineUI.h) || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (n, s, f) => { try { return G.DS && G.DS.icon ? G.DS.icon(n, { size: s || 16 }, f || '') : esc(f || ''); } catch (_) { return esc(f || ''); } };
  const sfx = n => { try { G.sfx && G.sfx.play && G.sfx.play(n); } catch (_) { /* rien */ } };
  const toast = t => { try { G.UI && G.UI.toast && G.UI.toast(t); } catch (_) { /* rien */ } };
  const btn = (label, act, variant, extra) => `<button type="button" class="ds-btn ds-btn--sm ${variant || 'ds-btn--secondary'}" data-act="${esc(act)}"${extra || ''}><span class="ds-btn__label">${label}</span></button>`;
  const rankBadge = r => (H().rankBadge ? H().rankBadge(r) : '<span class="ds-badge">' + esc(r || 'E') + '</span>');
  const classIcon = c => (H().classIcon ? H().classIcon(c) : '🛡️');
  const className = c => (H().className ? H().className(c) : (c || ''));

  const ROLE_L = { chef: 'Chef', officier: 'Officier', membre: 'Membre', recrue: 'Recrue' };
  const ROLE_C = { chef: 'ds-badge--gold', officier: 'ds-badge--violet', membre: 'ds-badge--accent', recrue: '' };
  const ROLE_I = { chef: 'crown', officier: 'shield', membre: 'user', recrue: 'sparkles' };
  const roleBadge = r => `<span class="ds-badge ${ROLE_C[r] || ''} gd-role" data-role="${esc(r)}">${ico(ROLE_I[r] || 'user', 12)}${ROLE_L[r] || esc(r)}</span>`;
  const LOG_I = { creation: ['flag', 'var(--ds-gold)'], arrivee: ['plus', 'var(--ds-success)'], depart: ['exit', 'var(--ds-text-3)'], promotion: ['arrow-up', 'var(--ds-accent)'], retrogradation: ['arrow-down', '#ff9a5a'], exclusion: ['close', 'var(--ds-danger)'], transfert: ['crown', 'var(--ds-gold)'], motd: ['scroll', '#b9a6ff'] };
  // tableau des permissions (lignes) : [libellé, chef, officier, membre, recrue]
  const PERMS = [
    ['Discuter dans le chat de guilde', 1, 1, 1, 1],
    ['Quitter la guilde', 0, 1, 1, 1],
    ['Promouvoir une recrue en membre', 1, 1, 0, 0],
    ['Promouvoir un membre en officier', 1, 0, 0, 0],
    ['Rétrograder (officier → membre → recrue)', 1, 0, 0, 0],
    ['Exclure une recrue ou un membre', 1, 1, 0, 0],
    ['Exclure un officier', 1, 0, 0, 0],
    ['Modifier le message du jour', 1, 1, 0, 0],
    ['Supprimer les messages des autres', 1, 1, 0, 0],
    ['Transférer la direction', 1, 0, 0, 0],
    ['Recrutement et emblème', 1, 0, 0, 0],
    ['Dissoudre la guilde', 1, 0, 0, 0],
  ];

  const CSS = `
.gd-root{display:flex;flex-direction:column;gap:var(--ds-s3)}
.gd-emb{--c:var(--ds-accent);flex:none;display:grid;place-items:center;width:64px;height:64px;border-radius:16px;color:var(--c);
  background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--c) 34%,#0b1122),#070b18 78%);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--c) 70%,transparent),0 0 22px -6px var(--c)}
.gd-emb svg{width:58%;height:58%}
.gd-emb--sm{width:40px;height:40px;border-radius:11px}
.gd-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ds-s4);padding:16px}
.gd-id{display:flex;gap:14px;align-items:center;min-width:0}
.gd-title{font:700 22px/1.15 var(--ds-font-display);color:var(--ds-text);overflow-wrap:anywhere}
.gd-title .gd-tag{color:var(--ds-gold);margin-right:6px}
.gd-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.gd-motd{margin-top:12px;padding:10px 12px;border-radius:var(--ds-r-sm);background:rgba(4,8,20,.5);box-shadow:inset 3px 0 0 #b9a6ff,inset 0 0 0 1px var(--ds-line)}
.gd-motd .ds-label{display:flex;align-items:center;gap:8px;justify-content:space-between}
.gd-motd p{margin:6px 0 0;font-size:14px;line-height:1.45;color:var(--ds-text);white-space:pre-wrap;overflow-wrap:anywhere}
.gd-motd p.empty{color:var(--ds-text-3);font-style:italic}
.gd-motd textarea{width:100%;min-height:72px;margin-top:8px;padding:10px 12px;resize:vertical;font:600 14px/1.4 var(--ds-font-body)}
.gd-inv{display:flex;gap:12px;align-items:center}
.gd-inv .net-qr svg{width:132px;height:132px}
.gd-inv .net-code{font-size:24px}
.gd-inv .net-row{margin-top:6px;gap:6px}
.gd-headbar{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;border-top:1px solid var(--ds-line);padding-top:12px}
.gd-tabs{align-self:flex-start;max-width:100%;flex-wrap:wrap}
.gd-tabs>button{flex:0 0 auto}
.gd-tabs button i{font-style:normal;margin-left:4px;color:var(--ds-gold)}
.gd-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.gd-tools .ds-input{flex:1;min-width:160px}
.gd-table{display:flex;flex-direction:column;gap:6px}
.gd-tr{display:grid;grid-template-columns:110px minmax(120px,1.4fr) minmax(90px,1fr) 44px 56px 120px 96px 84px;align-items:center;gap:10px;padding:8px 12px}
.gd-th{padding:0 12px;font:700 10px/1 var(--ds-font-display);letter-spacing:.14em;text-transform:uppercase;color:var(--ds-text-3)}
.gd-tr .gd-name{font:700 15px/1.2 var(--ds-font-display);color:var(--ds-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gd-tr .gd-name em{font-style:normal;color:var(--ds-text-3);font-size:12px;margin-left:4px}
.gd-tr .gd-cls{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ds-text-2);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gd-tr .gd-st{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--ds-text-2);white-space:nowrap}
.gd-tr .gd-date{font-size:12px;color:var(--ds-text-3);white-space:nowrap}
.gd-tr .gd-lv{font:700 13px var(--ds-font-display);color:var(--ds-text)}
.gd-tr .gd-act{display:flex;justify-content:flex-end}
.gd-tr.is-me{box-shadow:inset 0 0 0 1px rgba(var(--ds-gold-rgb),.35)}
.gd-k{display:none}
.gd-perm{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.gd-perm th,.gd-perm td{padding:9px 10px;border-bottom:1px solid var(--ds-line);text-align:center}
.gd-perm th:first-child,.gd-perm td:first-child{text-align:left;color:var(--ds-text);font-weight:700}
.gd-perm thead th{font:700 11px var(--ds-font-display);letter-spacing:.1em;text-transform:uppercase;color:var(--ds-text-2);position:sticky;top:0}
.gd-perm tr.is-mine td:not(:first-child){background:rgba(70,212,255,.04)}
.gd-perm .yes{color:var(--ds-success)}.gd-perm .no{color:var(--ds-text-3);opacity:.6}
.gd-perm th.is-mine{color:var(--ds-gold)}
.gd-roles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:var(--ds-s2)}
.gd-roles .ds-card{padding:12px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--ds-text-2);line-height:1.4}
.gd-log{display:flex;flex-direction:column}
.gd-li{display:flex;gap:10px;align-items:flex-start;padding:9px 4px;border-bottom:1px solid var(--ds-line)}
.gd-li:last-child{border-bottom:0}
.gd-li .gd-lico{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent)}
.gd-li .gd-lt{flex:1;min-width:0;font-size:13px;color:var(--ds-text);line-height:1.4;overflow-wrap:anywhere}
.gd-li time{flex:none;font-size:11px;color:var(--ds-text-3);white-space:nowrap;padding-top:2px}
.gd-pick{display:grid;grid-template-columns:repeat(6,minmax(0,46px));gap:6px}
.gd-pick button{display:grid;place-items:center;height:44px;min-width:0;border:0;border-radius:10px;cursor:pointer;color:var(--ds-text-2);background:rgba(4,8,20,.6);box-shadow:inset 0 0 0 1px var(--ds-line)}
.gd-pick button svg{width:22px;height:22px}
.gd-pick button.is-active{color:var(--c,var(--ds-accent));box-shadow:inset 0 0 0 2px var(--c,var(--ds-accent)),0 0 12px -4px var(--c,var(--ds-accent))}
.gd-colors{display:flex;gap:8px;flex-wrap:wrap}
.gd-colors button{width:32px;height:32px;border-radius:50%;border:0;cursor:pointer;background:var(--c);box-shadow:inset 0 0 0 2px rgba(0,0,0,.35)}
.gd-colors button.is-active{box-shadow:0 0 0 3px #0b1122,0 0 0 5px var(--c)}
.gd-emb-edit{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:start}
.gd-set{display:flex;flex-direction:row;align-items:center;gap:12px;padding:14px;text-align:left}
.gd-set .net-ico{flex:none;display:grid;place-items:center;width:30px;color:var(--ds-text-2)}
.gd-set .net-main{flex:1;min-width:0}
.gd-set .net-name{font:700 15px/1.2 var(--ds-font-display);color:var(--ds-text)}
.gd-set .net-sub{font-size:12px;font-weight:600;color:var(--ds-text-2);margin-top:2px}
.gd-danger{box-shadow:inset 0 0 0 1px rgba(255,90,116,.45);background:rgba(60,10,22,.35)}
.gd-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--ds-s3)}
.gd-two>.ds-card{padding:16px;display:flex;flex-direction:column;gap:10px}
.gd-msg-del{border:0;background:none;color:var(--ds-text-3);cursor:pointer;padding:0 4px;font-size:14px;line-height:1;vertical-align:middle}
.gd-msg-del:hover{color:var(--ds-danger)}
.gd-menu{display:flex;flex-direction:column;gap:8px}
.gd-menu .ds-btn{justify-content:flex-start}
.gd-confirm-name{margin-top:10px}
@media (max-width:860px){
  .gd-head{grid-template-columns:1fr}
  .gd-inv{border-top:1px solid var(--ds-line);padding-top:12px}
  .gd-th{display:none}
  .gd-tr{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"role name act" "cls cls cls" "st st date";row-gap:6px}
  .gd-tr>.gd-c-role{grid-area:role}.gd-tr>.gd-c-name{grid-area:name}.gd-tr>.gd-act{grid-area:act}
  .gd-tr>.gd-c-cls{grid-area:cls}.gd-tr>.gd-c-rank,.gd-tr>.gd-c-lv{display:none}
  .gd-tr>.gd-c-st{grid-area:st}.gd-tr>.gd-date{grid-area:date;text-align:right}
  .gd-k{display:inline}
  .gd-perm{font-size:12px}.gd-perm th,.gd-perm td{padding:8px 5px}
  .gd-perm thead th{font-size:9px;letter-spacing:.04em}
}
@media (max-width:560px){
  .gd-tabs{align-self:stretch;display:flex}
  .gd-tabs>button{flex:1 1 auto;padding:0 10px}
}
@media (max-width:420px){
  .gd-inv .net-qr svg{width:104px;height:104px}
  .gd-emb{width:52px;height:52px;border-radius:13px}
  .gd-title{font-size:19px}
  .gd-headbar{justify-content:stretch}.gd-headbar .ds-btn{flex:1}
  .gd-emb-edit{grid-template-columns:1fr}
}
`;
  function injectStyle() {
    if (H().injectStyle) H().injectStyle();
    if (document.getElementById('gd-style')) return;
    const st = document.createElement('style'); st.id = 'gd-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  const emblemHTML = (e, sm) => { const n = O() && O().normEmblem ? O().normEmblem(e) : (e || { icon: 'shield', color: '#46d4ff' }); return `<span class="gd-emb${sm ? ' gd-emb--sm' : ''}" style="--c:${esc(n.color)}" data-emblem="${esc(n.icon)}">${ico(n.icon, sm ? 22 : 36, '🛡️')}</span>`; };
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = ms => { if (!ms) return '—'; const d = new Date(ms); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
  function fmtAgo(ms) {
    if (!ms) return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    const d = new Date(ms); return fmtDate(ms) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function statusHTML(m) {
    if (!m.online) return '<span class="net-dot"></span>Hors ligne';
    if (m.inGame) return '<span class="net-dot game"></span>En donjon';
    return '<span class="net-dot on"></span>En ligne';
  }

  // ------------------------------------------------------------------
  // État de la page
  // ------------------------------------------------------------------
  let mounted = null, sub = 'membres', query = '', editMotd = false, dirty = false;
  const draft = { icon: null, color: null };          // emblème en cours de choix (création ou paramètres)
  function resetDraft(e) { const n = O() && O().normEmblem ? O().normEmblem(e) : { icon: 'shield', color: '#46d4ff' }; draft.icon = n.icon; draft.color = n.color; }

  function render(c) {
    injectStyle();
    mounted = c; dirty = false;
    const o = O();
    if (!o) { c.innerHTML = '<div class="ds-empty">Module en ligne absent.</div>'; return; }
    let h;
    try { h = body(o); } catch (e) {
      console.error('[GuildUI]', e);
      h = '<div class="ds-empty"><div class="ds-empty__title">Page indisponible</div><div>Une ancienne version du jeu est peut-être encore en cache : recharge avec <b>Ctrl + F5</b>.</div><div style="opacity:.6;font-size:12px;margin-top:6px">' + String(e && e.message || e).replace(/[<>&]/g, '') + '</div></div>';
    }
    c.innerHTML = `<div class="gd-root" data-guild-root>${h}</div>`;
    const root = c.querySelector('[data-guild-root]');
    root.addEventListener('click', onAction);
    root.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || !ev.target.matches('input[data-enter]')) return;
      ev.preventDefault(); const b = root.querySelector('[data-act="' + ev.target.dataset.enter + '"]'); if (b) b.click();
    });
    root.addEventListener('input', ev => { if (ev.target.matches('[data-in="gsearch"]')) { query = ev.target.value; filterMembers(); } });
    root.addEventListener('change', ev => { if (ev.target.matches('[data-in="gopen"]')) run('gopen', o.setGuildOpen(ev.target.checked)); });
    root.addEventListener('focusout', () => { setTimeout(() => { if (dirty) refresh(); }, 0); });
    filterMembers();
    const ch = root.querySelector('[data-chat]'); if (ch) ch.scrollTop = ch.scrollHeight;
    maybeAskPending();
  }
  function body(o) {
    if (o.mode === 'loading') return '<div class="ds-empty"><div class="ds-empty__title">Connexion à Firebase…</div></div>';
    if (o.mode !== 'firebase') {
      return `<div class="ds-empty"><span class="ds-empty__icon">${ico('shield', 30)}</span><div class="ds-empty__title">${o.mode === 'local' ? 'Guildes indisponibles en coop locale' : 'Mode en ligne non configuré'}</div>
        <div>${o.error ? esc(o.error) : 'Les guildes nécessitent Firebase : remplis <b>js/net/firebase-config.js</b> en suivant <b>SETUP-FIREBASE.md</b>.'}</div></div>${btn('Ouvrir « En ligne »', 'gonline')}`;
    }
    if (!o.user) {
      return `<div class="ds-empty"><span class="ds-empty__icon">${ico('shield', 30)}</span><div class="ds-empty__title">Connecte-toi pour rejoindre une guilde</div>
        <div>${o.pendingGuildCode && o.pendingGuildCode() ? 'Tu as un lien d’invitation (code <b>' + esc(o.pendingGuildCode()) + '</b>) : connecte-toi pour l’utiliser.' : 'Crée ta guilde ou rejoins celle de tes amis avec un code.'}</div></div>
        <button type="button" class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" data-act="gsignin"><span class="ds-btn__label">Se connecter avec Google</span></button>`;
    }
    if (!o.guild) return noGuild(o);
    return guildPage(o);
  }

  // ------------------------------------------------------------------
  // Sans guilde
  // ------------------------------------------------------------------
  function pickerHTML(o) {
    if (!draft.icon) resetDraft(null);
    const icons = (o.EMBLEM_ICONS || []).map(n => `<button type="button" class="${draft.icon === n ? 'is-active' : ''}" style="--c:${esc(draft.color)}" data-act="gicon:${esc(n)}" aria-label="Icône ${esc(n)}" aria-pressed="${draft.icon === n}">${ico(n, 22)}</button>`).join('');
    const cols = (o.EMBLEM_COLORS || []).map(c => `<button type="button" class="${draft.color === c ? 'is-active' : ''}" style="--c:${esc(c)}" data-act="gcolor:${esc(c)}" aria-label="Couleur ${esc(c)}" aria-pressed="${draft.color === c}"></button>`).join('');
    return `<div class="gd-emb-edit"><div data-emb-preview>${emblemHTML(draft)}</div><div class="ds-field"><span class="ds-label">Icône</span><div class="gd-pick">${icons}</div><span class="ds-label">Couleur</span><div class="gd-colors">${cols}</div></div></div>`;
  }
  function noGuild(o) {
    const pend = o.pendingGuildCode ? o.pendingGuildCode() : null;
    return `<div class="gd-two">
      <div class="ds-card" data-sec="create"><div class="ds-section-title">${ico('flag', 16)}Créer une guilde</div>
        <div class="ds-field"><span class="ds-label">Nom (3 à 24 caractères)</span><input class="ds-input" maxlength="24" data-in="gname" placeholder="Les Gardiens du Néant"/></div>
        <div class="ds-field"><span class="ds-label">Tag (3 ou 4 lettres ou chiffres)</span><input class="ds-input" maxlength="4" data-in="gtag" placeholder="GDN" style="text-transform:uppercase"/></div>
        ${pickerHTML(o)}
        <button type="button" class="ds-btn ds-btn--primary ds-btn--block" data-act="gcreate"><span class="ds-btn__label">Fonder la guilde</span></button>
      </div>
      <div class="ds-card" data-sec="join"><div class="ds-section-title">${ico('key', 16)}Rejoindre une guilde</div>
        <div class="net-note">Demande le code d’invitation (6 caractères) à un membre, ou scanne son QR code. Tu arrives avec le rôle <b>Recrue</b>.</div>
        <div class="net-row"><input class="ds-input" maxlength="6" data-in="gcode" data-enter="gjoin" value="${esc(pend || '')}" placeholder="Code de guilde" style="text-transform:uppercase"/>${btn('Rejoindre', 'gjoin', 'ds-btn--primary')}</div>
      </div></div>`;
  }

  // ------------------------------------------------------------------
  // Page d'une guilde
  // ------------------------------------------------------------------
  function guildPage(o) {
    const g = o.guild, role = o.myGuildRole() || 'recrue', ms = o.guildMembers || [];
    const onl = ms.filter(m => m.online).length;
    const link = o.guildLink ? o.guildLink() : '';
    let qr = '';
    try { qr = G.QR ? G.QR.svg(link || g.code, { size: 132, dark: '#0b1122', light: '#ffffff', margin: 3 }) : ''; } catch (_) { qr = ''; }
    const canMotd = o.guildCan('motd');
    const motd = editMotd && canMotd
      ? `<div class="gd-motd" data-motd><span class="ds-label">Message du jour <span class="net-note" data-motd-n>${esc((g.motd || '').length)} / 200</span></span>
          <textarea class="ds-input" maxlength="200" data-in="gmotd" placeholder="Rendez-vous ce soir à 21 h pour le donjon de rang B !">${esc(g.motd || '')}</textarea>
          <div class="net-row" style="justify-content:flex-end;margin-top:8px">${btn('Annuler', 'gmotdcancel', 'ds-btn--ghost')}${btn('Enregistrer', 'gmotdsave', 'ds-btn--primary')}</div></div>`
      : `<div class="gd-motd" data-motd><span class="ds-label">Message du jour ${canMotd ? btn('Modifier', 'gmotdedit', 'ds-btn--ghost') : ''}</span>
          <p class="${g.motd ? '' : 'empty'}" data-motd-text>${g.motd ? esc(g.motd) : (canMotd ? 'Aucun message. Écris le programme de la semaine !' : 'Aucun message du jour.')}</p></div>`;
    const tabs = [['membres', 'Membres', ms.length], ['chat', 'Discussion', 0], ['journal', 'Journal', 0], ['roles', 'Rôles', 0]];
    if (o.guildCan('settings')) tabs.push(['reglages', 'Paramètres', 0]);
    if (!tabs.some(t => t[0] === sub)) sub = 'membres';
    const seg = tabs.map(([id, l, n]) => `<button type="button" data-sub="${id}" class="${sub === id ? 'is-active' : ''}" aria-pressed="${sub === id}">${l}${n ? '<i>' + n + '</i>' : ''}</button>`).join('');
    const SUB = { membres: subMembers, chat: subChat, journal: subLog, roles: subRoles, reglages: subSettings };
    return `<div class="ds-card gd-head" data-sec="head">
        <div><div class="gd-id">${emblemHTML(g.emblem)}<div class="net-main"><div class="gd-title" data-gname><span class="gd-tag">[${esc(g.tag)}]</span>${esc(g.name)}</div>
          <div class="gd-chips"><span class="ds-chip">${ico('users', 14)}<b data-count>${ms.length}</b> membre${ms.length > 1 ? 's' : ''}</span><span class="ds-chip"><span class="net-dot on"></span><b data-online>${onl}</b> en ligne</span>${roleBadge(role)}${g.open ? '' : '<span class="ds-badge ds-badge--danger" data-closed>' + ico('lock', 12) + 'Recrutement fermé</span>'}</div></div></div>
          ${motd}</div>
        <div class="gd-inv">${qr ? `<div class="net-qr" title="Scanne pour rejoindre la guilde">${qr}</div>` : ''}<div class="net-main"><div class="ds-label">Code d’invitation</div><div class="net-code" data-gcode>${esc(g.code)}</div>
          <div class="net-note">${g.open ? 'Partage le code ou le QR code.' : 'Fermé : le code ne permet plus d’entrer.'}</div>
          <div class="net-row net-row--wrap">${btn('Copier le code', 'gcopycode', 'ds-btn--primary')}${btn('Copier le lien', 'gcopylink')}${typeof navigator !== 'undefined' && navigator.share ? btn('Partager', 'gshare') : ''}</div></div></div>
        <div class="gd-headbar">${btn(ico('exit', 15) + ' Quitter la guilde', 'gleave', 'ds-btn--danger')}</div>
      </div>
      <div class="ds-segmented gd-tabs" role="group" aria-label="Sections de la guilde">${seg}</div>
      <div class="gd-sub" data-subpage="${sub}">${SUB[sub](o, role)}</div>`;
  }
  function subMembers(o) {
    const ms = o.guildMembers || [], me = o.user.uid;
    const rows = ms.map(m => {
      const acts = ['promote', 'demote', 'kick', 'transfer'].filter(a => o.guildCan(a, m.uid));
      const hay = (m.name + ' ' + (ROLE_L[m.role] || '') + ' ' + className(m.classe)).toLowerCase();
      return `<div class="ds-card ds-card--flat gd-tr${m.uid === me ? ' is-me' : ''}" data-member="${esc(m.uid)}" data-hay="${esc(hay)}" data-role="${esc(m.role)}">
        <span class="gd-c-role">${roleBadge(m.role)}</span>
        <span class="gd-c-name gd-name">${esc(m.name)}${m.uid === me ? '<em>(toi)</em>' : ''}</span>
        <span class="gd-c-cls gd-cls">${m.classe ? classIcon(m.classe) + ' ' + esc(className(m.classe)) : '—'}<span class="gd-k"> · ${m.rank ? rankBadge(m.rank) : ''} Niv. ${esc(m.niveau || 1)}</span></span>
        <span class="gd-c-rank">${m.rank ? rankBadge(m.rank) : '—'}</span>
        <span class="gd-c-lv gd-lv">${m.niveau != null ? esc(m.niveau) : '—'}</span>
        <span class="gd-c-st gd-st" data-status>${statusHTML(m)}</span>
        <span class="gd-date" title="Arrivée"><span class="gd-k">Arrivé le </span>${fmtDate(m.joined)}</span>
        <span class="gd-act">${acts.length ? btn(ico('menu', 14) + ' Gérer', 'gmenu:' + m.uid, 'ds-btn--ghost', ' aria-label="Gérer ' + esc(m.name) + '"') : ''}</span></div>`;
    }).join('');
    return `<div class="gd-tools"><input class="ds-input" type="search" data-in="gsearch" value="${esc(query)}" placeholder="Rechercher un membre (pseudo, rôle, classe)…" aria-label="Rechercher un membre"/></div>
      <div class="gd-table" data-members>
        <div class="gd-tr gd-th" aria-hidden="true"><span>Rôle</span><span>Pseudo</span><span>Classe</span><span>Rang</span><span>Niveau</span><span>Statut</span><span>Arrivée</span><span></span></div>
        ${rows}<div class="ds-empty" data-noresult hidden><div>Aucun membre ne correspond à la recherche.</div></div></div>`;
  }
  function filterMembers() {
    if (!mounted) return;
    const q = query.trim().toLowerCase();
    let n = 0;
    mounted.querySelectorAll('[data-member]').forEach(r => { const ok = !q || r.dataset.hay.indexOf(q) >= 0; r.hidden = !ok; if (ok) n++; });
    const e = mounted.querySelector('[data-noresult]'); if (e) e.hidden = n > 0 || !mounted.querySelector('[data-member]');
  }
  function chatHTML(o) {
    if (!o.chat.length) return '<div class="net-note">Aucun message. Dis bonjour à ta guilde !</div>';
    const mod = o.guildCan('moderate');
    return o.chat.map(m => {
      const d = new Date(m.at), mine = o.user && m.uid === o.user.uid;
      return `<div class="net-msg${mine ? ' me' : ''}" data-msg="${esc(m.id)}"><b>${esc(m.name)}</b> ${esc(m.text)}<i>${pad(d.getHours())}:${pad(d.getMinutes())}</i>${mine || mod ? `<button type="button" class="gd-msg-del" data-act="gdelmsg:${esc(m.id)}" aria-label="Supprimer le message" title="Supprimer">×</button>` : ''}</div>`;
    }).join('');
  }
  function subChat(o) {
    return `<div class="net-chat" data-chat style="max-height:380px;min-height:200px">${chatHTML(o)}</div>
      <div class="net-row"><input class="ds-input" maxlength="200" data-in="chat" data-enter="gsend" placeholder="Écris un message…"/>${btn('Envoyer', 'gsend', 'ds-btn--primary')}</div>`;
  }
  function logHTML(o) {
    const L = o.guildLog || [];
    if (!L.length) return '<div class="ds-empty"><div>Aucun événement pour le moment.</div></div>';
    return L.map(e => { const [i, c] = LOG_I[e.type] || ['info', 'var(--ds-text-2)']; return `<div class="gd-li" data-log="${esc(e.type)}"><span class="gd-lico" style="--c:${c}">${ico(i, 14)}</span><span class="gd-lt">${esc(e.text)}</span><time>${esc(fmtAgo(e.at))}</time></div>`; }).join('');
  }
  function subLog(o) {
    return `<div class="ds-section-title">Journal <span class="ds-section-title__aside">30 derniers événements</span></div><div class="ds-card ds-card--flat" style="padding:4px 12px"><div class="gd-log" data-logbox>${logHTML(o)}</div></div>`;
  }
  function subRoles(o, role) {
    const cols = ['chef', 'officier', 'membre', 'recrue'];
    const yes = `<span class="yes" aria-label="oui">${ico('check', 16, '✓')}</span>`, no = `<span class="no" aria-label="non">${ico('minus', 16, '—')}</span>`;
    const DESC = {
      chef: 'Dirige la guilde : tous les droits. Ne peut pas quitter sans transférer la direction ou dissoudre.',
      officier: 'Bras droit du chef : accueille les recrues (→ membre), exclut membres et recrues, gère le message du jour et modère le chat.',
      membre: 'Membre confirmé : discute et part en donjon avec la guilde.',
      recrue: 'Nouvel arrivant : même droits qu’un membre, en attente de confirmation par un officier ou le chef.',
    };
    return `<div class="gd-roles">${cols.map(r => `<div class="ds-card ds-card--flat"${r === role ? ' style="box-shadow:inset 0 0 0 1px rgba(var(--ds-gold-rgb),.45)"' : ''}><div>${roleBadge(r)}${r === role ? ' <span class="net-note">ton rôle</span>' : ''}</div>${esc(DESC[r])}</div>`).join('')}</div>
      <div class="ds-section-title">Permissions</div>
      <div class="ds-card ds-card--flat" style="padding:4px 8px;overflow-x:auto"><table class="gd-perm" data-perm><thead><tr><th>Action</th>${cols.map(r => `<th class="${r === role ? 'is-mine' : ''}">${ROLE_L[r]}</th>`).join('')}</tr></thead>
        <tbody>${PERMS.map(p => `<tr>${'<td>' + esc(p[0]) + '</td>' + p.slice(1).map(v => '<td>' + (v ? yes : no) + '</td>').join('')}</tr>`).join('')}</tbody></table></div>
      <div class="net-note">Ordre des rôles : Chef &gt; Officier &gt; Membre &gt; Recrue. Les nouveaux arrivants sont recrues. Chacun peut supprimer ses propres messages.</div>`;
  }
  function subSettings(o) {
    const g = o.guild;
    if (!draft.icon || draft._for !== g.id) { resetDraft(g.emblem); draft._for = g.id; }
    const same = draft.icon === g.emblem.icon && draft.color === g.emblem.color;
    return `<div class="ds-card ds-card--flat gd-set"><span class="net-ico">${ico(g.open ? 'unlock' : 'lock', 22)}</span><div class="net-main"><div class="net-name">Recrutement ${g.open ? 'ouvert' : 'fermé'}</div><div class="net-sub">${g.open ? 'Le code d’invitation et le QR code permettent d’entrer.' : 'Le code ne permet plus d’entrer, même avec le lien.'}</div></div>
        <label class="ds-toggle"><input type="checkbox" data-in="gopen" ${g.open ? 'checked' : ''} aria-label="Recrutement ouvert"/><span class="ds-toggle__track"></span></label></div>
      <div class="ds-section-title">Emblème</div>
      <div class="ds-card ds-card--flat" style="padding:14px">${pickerHTML(o)}
        <div class="net-row" style="justify-content:flex-end;margin-top:12px">${btn('Enregistrer l’emblème', 'gembsave', same ? 'ds-btn--primary is-disabled' : 'ds-btn--primary', same ? ' aria-disabled="true"' : '')}</div></div>
      <div class="ds-section-title">Zone dangereuse</div>
      <div class="ds-card gd-set gd-danger"><span class="net-ico">${ico('warning', 22)}</span><div class="net-main"><div class="net-name">Dissoudre la guilde</div><div class="net-sub">Supprime la guilde, ses membres, son chat et son journal. Irréversible.</div></div>${btn('Dissoudre', 'gdissolve', 'ds-btn--danger')}</div>`;
  }

  // ------------------------------------------------------------------
  // Modales (design system)
  // ------------------------------------------------------------------
  const modal = o => (G.UI && G.UI.modal ? G.UI.modal(o) : Promise.resolve(null));
  function confirmBox(title, html, label, danger) {
    return modal({ title, icon: danger ? 'warning' : 'info', html, danger: !!danger, buttons: [{ label: 'Annuler', value: false, style: 'ghost' }, { label, value: true, style: danger ? 'danger' : 'primary' }] }).then(v => v === true);
  }
  function memberMenu(uid) {
    const o = O(), m = (o.guildMembers || []).find(x => x.uid === uid); if (!m) return;
    const up = o.guildCan('promote', uid) ? o.guildNextRole(uid, 1) : null, down = o.guildCan('demote', uid) ? o.guildNextRole(uid, -1) : null;
    const items = [];
    if (up) items.push({ label: 'Promouvoir ' + ROLE_L[up].toLowerCase(), value: 'up', style: 'primary' });
    if (down) items.push({ label: 'Rétrograder ' + ROLE_L[down].toLowerCase(), value: 'down', style: 'secondary' });
    if (o.guildCan('transfer', uid)) items.push({ label: 'Transférer la direction', value: 'transfer', style: 'gold' });
    if (o.guildCan('kick', uid)) items.push({ label: 'Exclure de la guilde', value: 'kick', style: 'danger' });
    items.push({ label: 'Fermer', value: null, style: 'ghost' });
    modal({ title: m.name, icon: 'user', html: `<div class="gd-menu-info" data-menu-for="${esc(uid)}">${roleBadge(m.role)} ${m.classe ? esc(className(m.classe)) + ' · ' : ''}Niv. ${esc(m.niveau || 1)} · ${statusHTML(m)}</div>`, buttons: items }).then(v => {
      if (v === 'up') run('promote', o.setMemberRole(uid, up));
      else if (v === 'down') run('demote', o.setMemberRole(uid, down));
      else if (v === 'kick') confirmBox('Exclure ' + m.name + ' ?', `<p><b>${esc(m.name)}</b> (${ROLE_L[m.role]}) sera retiré de la guilde. Il pourra revenir avec le code si le recrutement est ouvert.</p>`, 'Exclure', true).then(ok => { if (ok) run('kick', o.kickMember(uid)); });
      else if (v === 'transfer') confirmBox('Transférer la direction ?', `<p><b>${esc(m.name)}</b> deviendra <b>chef</b> de la guilde et tu deviendras <b>officier</b>. Tu ne pourras pas annuler toi-même.</p>`, 'Transférer', true).then(ok => { if (ok) run('transfer', o.transferLeadership(uid)); });
    });
  }
  function askDissolve() {
    const o = O(), g = o.guild; if (!g) return;
    modal({
      title: 'Dissoudre [' + g.tag + '] ' + g.name + ' ?', icon: 'warning', danger: true,
      html: `<p>La guilde, ses ${o.guildMembers.length} membre(s), son chat et son journal seront supprimés. <b>Irréversible.</b></p>
        <div class="ds-field gd-confirm-name"><span class="ds-label">Retape le nom de la guilde pour confirmer</span><input class="ds-input" data-confirm-name maxlength="24" placeholder="${esc(g.name)}" autocomplete="off"/></div>`,
      buttons: [{ label: 'Annuler', value: false, style: 'ghost' }, { label: 'Dissoudre', value: true, style: 'danger' }],
      onOpen(bodyEl) {
        const win = bodyEl.closest('.ds-window'), inp = bodyEl.querySelector('[data-confirm-name]');
        const ok = win && win.querySelector('.sys-foot button:last-child');
        const sync = () => { const good = inp.value.trim() === g.name; if (ok) { ok.disabled = !good; ok.classList.toggle('is-disabled', !good); } };
        if (ok) ok.dataset.dissolveOk = '1';
        inp.addEventListener('input', sync); sync();
        setTimeout(() => { try { inp.focus(); } catch (_) { /* rien */ } }, 80);
      },
    }).then(v => { if (v === true) run('dissolve', o.dissolveGuild().then(r => { if (r) sub = 'membres'; return r; })); });
  }
  function askLeave() {
    const o = O(), others = o.guildMembers.filter(m => m.uid !== o.user.uid);
    if (o.myGuildRole() === 'chef') {
      if (!others.length) { askDissolve(); return; }
      modal({ title: 'Le chef ne peut pas partir ainsi', icon: 'crown', html: '<p>Avant de quitter la guilde, <b>transfère la direction</b> à un autre membre (bouton « Gérer » dans la liste des membres), ou <b>dissous la guilde</b> dans les paramètres.</p>',
        buttons: [{ label: 'Dissoudre…', value: 'dissolve', style: 'danger' }, { label: 'Voir les membres', value: 'members', style: 'primary' }] })
        .then(v => { if (v === 'members') { sub = 'membres'; refresh(true); } else if (v === 'dissolve') askDissolve(); });
      return;
    }
    confirmBox('Quitter la guilde ?', '<p>Tu pourras revenir plus tard avec le code d’invitation, en tant que recrue.</p>', 'Quitter', true).then(ok => { if (ok) run('leave', o.leaveGuild()); });
  }
  // lien ?guilde=CODE : proposé une seule fois, quand le joueur est connecté au camp
  let asking = false;
  function maybeAskPending() {
    const o = O();
    if (asking || !o || o.mode !== 'firebase' || !o.user || !o.me || !o.me.code || !o.pendingGuildCode || !o.pendingGuildCode()) return;
    if (!(G.UI && G.UI.current && G.UI.current() === 'hub')) return;
    const code = o.pendingGuildCode();
    if (o.me.guildId || o.guild) { o.clearPendingGuild(); toast('Tu es déjà dans une guilde : quitte-la pour utiliser ce lien.'); return; }
    asking = true;
    if (G.UI.currentTab && G.UI.currentTab() !== 'guilde' && G.UI.setTab) G.UI.setTab('guilde');
    modal({ title: 'Invitation de guilde', icon: 'shield', html: `<p>Tu as ouvert un lien d’invitation. Rejoindre la guilde du code <b class="net-code" style="font-size:16px">${esc(code)}</b> ?</p><p class="net-note">Tu arriveras avec le rôle Recrue.</p>`,
      buttons: [{ label: 'Plus tard', value: false, style: 'ghost' }, { label: 'Rejoindre', value: true, style: 'primary' }] })
      .then(v => { o.clearPendingGuild(); asking = false; if (v === true) run('join', o.joinGuild(code)); else refresh(true); });
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  function val(k) { const i = mounted && mounted.querySelector('[data-in="' + k + '"]'); return i ? i.value : ''; }
  function run(act, p) {
    return Promise.resolve(p).catch(e => { console.warn('[GuildUI] ' + act, e); toast('Action impossible : ' + ((e && (e.code || e.message)) || 'erreur')); return false; }).then(r => { refresh(true); return r; });
  }
  function copy(text, msg) {
    try { const p = navigator.clipboard && navigator.clipboard.writeText(text); if (p && p.then) p.then(() => toast(msg), () => toast('Copie impossible : ' + text)); else toast(msg); } catch (_) { toast('Copie impossible : ' + text); }
  }
  function onAction(ev) {
    const sb = ev.target.closest('[data-sub]');
    if (sb) { if (sb.dataset.sub !== sub) { sub = sb.dataset.sub; editMotd = false; sfx('click'); refresh(true); } return; }
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.classList.contains('is-disabled')) { sfx('error'); return; }
    const [act, arg] = b.dataset.act.split(/:(.*)/s);
    const o = O(); sfx('click');
    switch (act) {
      case 'gonline': if (G.OnlineUI && G.OnlineUI.open) G.OnlineUI.open('compte'); break;
      case 'gsignin': run(act, o.signIn()); break;
      case 'gicon': draft.icon = arg; refresh(true); break;
      case 'gcolor': draft.color = arg; refresh(true); break;
      case 'gcreate': run(act, o.createGuild(val('gname'), val('gtag'), { icon: draft.icon, color: draft.color }).then(r => { if (r) { sub = 'membres'; draft._for = null; } return r; })); break;
      case 'gjoin': run(act, o.joinGuild(val('gcode')).then(r => { if (r && o.clearPendingGuild) o.clearPendingGuild(); return r; })); break;
      case 'gleave': askLeave(); break;
      case 'gmenu': memberMenu(arg); break;
      case 'gmotdedit': editMotd = true; refresh(true); setTimeout(() => { const t = mounted && mounted.querySelector('[data-in="gmotd"]'); if (t) t.focus(); }, 30); break;
      case 'gmotdcancel': editMotd = false; refresh(true); break;
      case 'gmotdsave': { const t = val('gmotd'); editMotd = false; run(act, o.setGuildMotd(t)); break; }
      case 'gembsave': run(act, o.setGuildEmblem({ icon: draft.icon, color: draft.color }).then(r => { if (r) toast('Emblème enregistré.'); return r; })); break;
      case 'gdissolve': askDissolve(); break;
      case 'gcopycode': copy((o.guild && o.guild.code) || '', 'Code de guilde copié !'); break;
      case 'gcopylink': copy(o.guildLink ? o.guildLink() : '', 'Lien d’invitation copié !'); break;
      case 'gshare': try { navigator.share({ title: 'Donjon Arena 3D', text: 'Rejoins ma guilde [' + o.guild.tag + '] ' + o.guild.name + ' ! Code : ' + o.guild.code, url: o.guildLink() }).catch(() => {}); } catch (_) { /* rien */ } break;
      case 'gdelmsg': run(act, o.deleteChatMessage(arg)); break;
      case 'gsend': {
        const i = mounted.querySelector('[data-in="chat"]'); const t = i ? i.value : '';
        Promise.resolve(o.sendChat(t)).then(ok => { if (ok && i) i.value = ''; refresh(); }).catch(e => toast('Message refusé : ' + ((e && e.code) || 'erreur')));
        break;
      }
      default: break;
    }
  }
  let refreshQ = false, force = false;
  function refresh(f) {
    if (f) force = true;
    if (refreshQ) return; refreshQ = true;
    requestAnimationFrame(() => {
      refreshQ = false;
      const forced = force; force = false;
      if (!mounted || !mounted.isConnected) { maybeAskPending(); return; }
      const a = document.activeElement, o = O();
      // ne pas effacer une saisie en cours : seuls le fil de discussion et le journal sont rafraîchis
      if (!forced && a && mounted.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.value && a.type !== 'checkbox') {
        const ch = mounted.querySelector('[data-chat]'); if (ch && o) { ch.innerHTML = chatHTML(o); ch.scrollTop = ch.scrollHeight; }
        const lg = mounted.querySelector('[data-logbox]'); if (lg && o) lg.innerHTML = logHTML(o);
        dirty = true;
        return;
      }
      const keep = a && mounted.contains(a) && a.dataset ? a.dataset.in : null;
      const vals = {};
      mounted.querySelectorAll('input[data-in]:not([type="checkbox"]),textarea[data-in]').forEach(i => { if (i.value) vals[i.dataset.in] = i.value; });
      const main = document.getElementById('hub-content'), sc = main ? main.scrollTop : 0;
      render(mounted);
      Object.keys(vals).forEach(k => { const i = mounted.querySelector('[data-in="' + k + '"]'); if (i && !i.value && k !== 'chat') i.value = vals[k]; });
      if (main) main.scrollTop = sc;
      if (keep) { const i = mounted.querySelector('[data-in="' + keep + '"]'); if (i) i.focus(); }
      if (G.DS && G.DS.syncSliders) { /* rien à synchroniser */ }
    });
  }

  // ------------------------------------------------------------------
  // Enregistrement : juste après « En ligne » (order 9)
  // ------------------------------------------------------------------
  const PANEL = {
    id: 'guilde', title: 'Guilde', icon: 'shield', order: 8.9,
    visible: () => true,
    badge() { const o = O(); return o && o.pendingGuildCode && o.pendingGuildCode() ? true : ''; },
    render(c) { render(c); },
    dispose() { mounted = null; editMotd = false; },
  };
  G.GuildUI = {
    refresh, open(s) { if (s) sub = s; if (G.UI && G.UI.setTab) G.UI.setTab('guilde'); refresh(true); },
    get sub() { return sub; },
  };
  function boot() {
    try { if (G.UI && G.UI.registerPanel) G.UI.registerPanel(PANEL); else if (G.Panels) G.Panels.register(PANEL.id, PANEL); } catch (e) { console.error('[GuildUI] panneau', e); }
    const hook = () => {
      if (!G.Online || !G.Online.onChange) return setTimeout(hook, 50);
      G.Online.onChange(() => refresh());
      if (G.bus) G.bus.on('screen', e => { if (e && e.id === 'hub') setTimeout(maybeAskPending, 300); });
    };
    hook();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
