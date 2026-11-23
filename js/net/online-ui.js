window.G = window.G || {};
/* =====================================================================
   js/net/online-ui.js — interface du mode en ligne
   - Panneau « En ligne » du camp (G.Panels) : onglets Compte, Amis, Guilde, Groupe
   - Notifications discrètes (invitation reçue, ami connecté, demande d'ami)
   - En jeu : nom + barre de PV au-dessus des alliés, HUD de groupe, jauge de réanimation
   Réutilise le design system (ds-card, ds-btn, ds-chip, ds-badge, ds-input, ds-segmented, ds-bar, ds-notify…).
   Tout texte venant du réseau passe par esc() (jamais injecté brut dans le HTML).
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (n, s, f) => { try { return G.DS && G.DS.icon ? G.DS.icon(n, { size: s || 16 }, f || '') : esc(f || ''); } catch (_) { return esc(f || ''); } };
  const O = () => G.Online;
  const sfx = n => { try { G.sfx && G.sfx.play && G.sfx.play(n); } catch (_) { /* rien */ } };
  const rankBadge = (r, sz) => { try { return G.DS && G.DS.rank ? G.DS.rank(r || 'E', sz || 'xs') : '<span class="ds-badge">' + esc(r || 'E') + '</span>'; } catch (_) { return esc(r || 'E'); } };
  const classIcon = c => { try { const d = (G.CLASSES && G.CLASSES[c]) || (G.DATA && G.DATA.CLASSES && G.DATA.CLASSES[c]); return (d && d.icon) || '🛡️'; } catch (_) { return '🛡️'; } };
  const className = c => { try { const d = (G.CLASSES && G.CLASSES[c]) || (G.DATA && G.DATA.CLASSES && G.DATA.CLASSES[c]); return (d && d.name) || c || ''; } catch (_) { return c || ''; } };
  const btn = (label, act, variant, extra) => `<button type="button" class="ds-btn ds-btn--sm ${variant || 'ds-btn--secondary'}" data-act="${esc(act)}"${extra || ''}><span class="ds-btn__label">${label}</span></button>`;

  const CSS = `
.net-root{display:flex;flex-direction:column;gap:var(--ds-s3)}
.net-row{display:flex;align-items:center;gap:var(--ds-s2);flex-wrap:wrap}
.net-row .ds-input{flex:1;min-width:120px}
.net-item{display:flex;align-items:center;gap:10px;padding:10px 12px}
.net-item .net-ico{font-size:22px;width:30px;text-align:center;flex:none}
.net-item .net-main{flex:1;min-width:0}
.net-item .net-name{font:700 15px/1.2 var(--ds-font-display);color:var(--ds-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.net-item .net-sub{font-size:12px;color:var(--ds-text-2);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px}
.net-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--ds-text-3);flex:none}
.net-dot.on{background:var(--ds-success);box-shadow:0 0 8px var(--ds-success)}
.net-dot.game{background:var(--ds-warning);box-shadow:0 0 8px var(--ds-warning)}
.net-code{font:700 20px/1 var(--ds-font-display);letter-spacing:.25em;color:var(--ds-gold)}
.net-note{font-size:12px;color:var(--ds-text-3);line-height:1.4}
.net-chat{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;padding:8px;border-radius:var(--ds-r-sm);background:rgba(4,8,20,.55);box-shadow:inset 0 0 0 1px var(--ds-line)}
.net-msg{font-size:13px;line-height:1.35;color:var(--ds-text);word-break:break-word}
.net-msg b{font-family:var(--ds-font-display);color:var(--ds-accent)}
.net-msg.me b{color:var(--ds-gold)}
.net-msg i{font-style:normal;color:var(--ds-text-3);font-size:11px;margin-left:4px}
.net-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--ds-s2)}
.net-slot.empty{opacity:.5;justify-content:center;font-size:13px;color:var(--ds-text-3);min-height:58px}
.net-portals{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--ds-s2)}
.net-portal{display:flex;align-items:center;gap:10px;padding:10px;text-align:left;cursor:pointer;color:inherit;font:inherit;border:0}
.net-portal.is-selected{box-shadow:inset 0 0 0 2px var(--ds-accent),var(--ds-glow)}
.net-portal.is-locked{opacity:.55}
.net-notifs{position:fixed;z-index:70;top:calc(var(--ds-sa-t) + 56px);right:var(--ds-sa-r);display:flex;flex-direction:column;gap:6px;width:min(340px,88vw);pointer-events:none}
.net-notifs .ds-notify{pointer-events:auto;--c:var(--ds-accent)}
.net-notifs .ds-notify.k-invite{--c:var(--ds-gold)}
.net-notifs .ds-notify.k-friend{--c:var(--ds-success)}
.net-notifs .ds-notify.k-down{--c:var(--ds-danger)}
.net-notifs .net-nbtn{display:flex;gap:6px;margin-top:6px}
.net-notifs .out{opacity:0;transform:translateX(20px);transition:opacity .3s,transform .3s}
.net-names{position:fixed;inset:0;pointer-events:none;z-index:4}
.net-tag{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:2px;white-space:nowrap}
.net-tag span{font:700 12px/1 var(--ds-font-display);color:#fff;text-shadow:0 1px 3px #000,0 0 6px rgba(0,0,0,.8);letter-spacing:.04em}
.net-tag .ds-bar{width:54px;height:6px}
.net-tag.dead span{color:var(--ds-danger)}
.net-party{position:fixed;z-index:6;left:var(--ds-sa-l);top:calc(var(--ds-sa-t) + 118px);display:none;flex-direction:column;gap:4px;width:170px;pointer-events:none}
.net-party.on{display:flex}
.net-pm{display:flex;flex-direction:column;gap:2px;padding:5px 8px;border-radius:var(--ds-r-sm);background:rgba(9,14,30,.72);box-shadow:inset 0 0 0 1px var(--ds-line)}
.net-pm .t{display:flex;justify-content:space-between;font:700 11px/1.2 var(--ds-font-display);color:var(--ds-text)}
.net-pm .t em{font-style:normal;color:var(--ds-text-3)}
.net-pm.dead .t em{color:var(--ds-danger)}
.net-pm .ds-bar{height:6px}
.net-revive{position:fixed;z-index:6;left:50%;bottom:28%;transform:translateX(-50%);display:none;padding:6px 14px;border-radius:999px;font:700 13px var(--ds-font-display);color:#fff;background:rgba(9,14,30,.8);box-shadow:inset 0 0 0 1px var(--ds-success)}
.net-revive.on{display:block}
`;
  function injectStyle() {
    if (document.getElementById('net-style')) return;
    const st = document.createElement('style'); st.id = 'net-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ------------------------------------------------------------------
  // Notifications
  // ------------------------------------------------------------------
  function notifBox() {
    let b = document.getElementById('net-notifs');
    if (!b) { b = document.createElement('div'); b.id = 'net-notifs'; b.className = 'net-notifs'; b.setAttribute('aria-live', 'polite'); document.body.appendChild(b); }
    return b;
  }
  function notify(o) {
    injectStyle();
    const box = notifBox();
    const el = document.createElement('div');
    el.className = 'ds-notify net-notif k-' + (o.kind || 'info');
    el.innerHTML = '<span class="ds-notify__icon"></span><span class="ds-notify__text"><span class="ds-notify__sub"></span><span class="nt"></span></span>';
    el.querySelector('.ds-notify__icon').textContent = o.icon || '🔔';
    el.querySelector('.ds-notify__sub').textContent = o.title || '';
    el.querySelector('.nt').textContent = o.text || '';
    if (o.kind === 'invite' && o.lobbyId) {
      const row = document.createElement('div'); row.className = 'net-nbtn';
      row.innerHTML = '<button type="button" class="ds-btn ds-btn--sm ds-btn--gold" data-n="yes"><span class="ds-btn__label">Rejoindre</span></button><button type="button" class="ds-btn ds-btn--sm ds-btn--ghost" data-n="no"><span class="ds-btn__label">Refuser</span></button>';
      el.querySelector('.ds-notify__text').appendChild(row);
      row.addEventListener('click', ev => {
        const b = ev.target.closest('[data-n]'); if (!b) return;
        sfx('click');
        if (b.dataset.n === 'yes') O().acceptInvite(o.lobbyId).then(ok => { if (ok && G.UI && G.UI.setTab && G.UI.current && G.UI.current() === 'hub') { panelTab = 'groupe'; G.UI.setTab('enligne'); refresh(); } });
        else O().declineInvite(o.lobbyId);
        close();
      });
    }
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    let gone = false;
    function close() { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 320); }
    setTimeout(close, o.kind === 'invite' ? 15000 : 5000);
    if (o.kind === 'invite') sfx('levelup');
  }

  // ------------------------------------------------------------------
  // Panneau « En ligne »
  // ------------------------------------------------------------------
  let panelTab = 'compte', mounted = null;
  const TABS = [['compte', 'Compte'], ['amis', 'Amis'], ['guilde', 'Guilde'], ['groupe', 'Groupe']];
  function statusOf(f) {
    if (!f.online) return '<span class="net-dot"></span>Hors ligne';
    if (f.inGame) return '<span class="net-dot game"></span>En donjon';
    return '<span class="net-dot on"></span>En ligne';
  }
  function render(c) {
    injectStyle();
    mounted = c;
    const o = O();
    if (!o) { c.innerHTML = '<div class="ds-empty">Module en ligne absent.</div>'; return; }
    const reqN = (o.requests || []).length, invN = (o.invites || []).length;
    const seg = TABS.map(([id, l]) => {
      const n = id === 'amis' ? reqN : id === 'groupe' ? invN : 0;
      return `<button type="button" data-tab="${id}" class="${panelTab === id ? 'is-active' : ''}" aria-pressed="${panelTab === id}">${l}${n ? ' <i>' + n + '</i>' : ''}</button>`;
    }).join('');
    c.innerHTML = `<div class="net-root" data-net-root><div class="ds-segmented net-tabs" role="group" aria-label="Mode en ligne">${seg}</div><div class="net-body"></div></div>`;
    const body = c.querySelector('.net-body');
    try {
      ({ compte: tabCompte, amis: tabAmis, guilde: tabGuilde, groupe: tabGroupe }[panelTab] || tabCompte)(body, o);
    } catch (e) { console.error('[OnlineUI] onglet ' + panelTab, e); body.innerHTML = '<div class="ds-empty">Onglet indisponible.</div>'; }
    c.querySelector('.net-tabs').addEventListener('click', ev => {
      const b = ev.target.closest('[data-tab]'); if (!b || b.dataset.tab === panelTab) return;
      panelTab = b.dataset.tab; sfx('click'); render(c);
    });
    c.querySelector('[data-net-root]').addEventListener('click', onAction);
    c.querySelector('[data-net-root]').addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || !ev.target.matches('input[data-enter]')) return;
      ev.preventDefault(); const b = c.querySelector('[data-act="' + ev.target.dataset.enter + '"]'); if (b) b.click();
    });
  }
  function offline(body, o, what) {
    const base = o.mode === 'loading' ? '<div class="ds-empty"><div class="ds-empty__title">Connexion à Firebase…</div></div>'
      : `<div class="ds-empty"><span class="ds-empty__icon">🌐</span><div class="ds-empty__title">${esc(what || 'Mode en ligne non configuré')}</div>
        <div>${o.error ? esc(o.error) : 'Remplis <b>js/net/firebase-config.js</b> en suivant <b>SETUP-FIREBASE.md</b> pour activer le compte Google, les amis et les guildes.'}</div></div>`;
    body.innerHTML = base + (o.mode === 'off' ? `<div class="ds-card ds-card--flat net-item"><span class="net-ico">🧪</span><div class="net-main"><div class="net-name">Coop locale (test)</div><div class="net-sub">Ouvre le jeu dans deux onglets du même navigateur pour jouer en coop sans Firebase.</div></div>${btn('Activer', 'local', 'ds-btn--primary')}</div>` : '');
  }
  function tabCompte(body, o) {
    if (o.mode === 'off' || o.mode === 'loading') return offline(body, o);
    const u = o.user;
    if (o.mode === 'firebase' && !u) {
      body.innerHTML = `<div class="ds-card net-item"><span class="net-ico">🔑</span><div class="net-main"><div class="net-name">Connexion</div><div class="net-sub">Connecte-toi avec ton compte Google pour retrouver tes amis et ta guilde.</div></div></div>
        <button type="button" class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" data-act="signin"><span class="ds-btn__label">Se connecter avec Google</span></button>
        ${o.error ? '<div class="net-note">' + esc(o.error) + '</div>' : ''}
        <div class="net-note">Seuls ton identifiant, ton pseudo (et ta photo Google si tu en as une) sont utilisés, avec la classe, le rang, le niveau et le skin de ton héros.</div>`;
      return;
    }
    const me = o.me || {}, p = (G.game && G.game.profile) || {};
    body.innerHTML = `<div class="ds-card net-item"><span class="net-ico">${classIcon(p.classe)}</span><div class="net-main"><div class="net-name">${esc((me.name) || p.nom || 'Joueur')}</div>
        <div class="net-sub">${rankBadge(p.rank)} ${esc(className(p.classe))} · Niv. ${esc(p.niveau || 1)}${o.mode === 'local' ? ' · <span class="ds-chip">Coop locale</span>' : ''}</div></div></div>
      <div class="ds-field"><span class="ds-label">Pseudo</span><div class="net-row"><input class="ds-input" maxlength="20" data-in="pseudo" data-enter="pseudo" value="${esc(me.name || p.nom || '')}" placeholder="Ton pseudo"/>${btn('Enregistrer', 'pseudo', 'ds-btn--primary')}</div></div>
      ${o.mode === 'firebase' ? `<div class="ds-card ds-card--flat net-item"><div class="net-main"><div class="ds-label">Ton code ami</div><div class="net-code" data-code>${esc(me.code || '……')}</div></div>${btn('Copier', 'copycode')}</div>
        ${btn('Se déconnecter', 'signout', 'ds-btn--ghost')}` : `<div class="net-note">Coop locale : chaque onglet est un joueur (identifiant ${esc(u && u.uid)}). Les guildes et les demandes d’ami nécessitent Firebase. Astuce : ajoute <b>?net=local&amp;slot=2</b> à l’adresse du second onglet pour utiliser un autre héros.</div>`}`;
  }
  function tabAmis(body, o) {
    if (o.mode === 'off' || o.mode === 'loading') return offline(body, o);
    if (o.mode === 'firebase' && !o.user) { body.innerHTML = '<div class="ds-empty"><div class="ds-empty__title">Connecte-toi (onglet Compte).</div></div>'; return; }
    const fr = (o.friends || []).slice().sort((a, b) => (b.online - a.online) || String(a.name).localeCompare(b.name));
    let h = '';
    if (o.mode === 'firebase') {
      h += `<div class="ds-field"><span class="ds-label">Ajouter un ami</span><div class="net-row"><input class="ds-input" maxlength="6" data-in="fcode" data-enter="addfriend" placeholder="Code ami (6 caractères)" style="text-transform:uppercase"/>${btn('Envoyer', 'addfriend', 'ds-btn--primary')}</div></div>`;
      if ((o.requests || []).length) {
        h += '<div class="ds-section-title">Demandes reçues</div>' + o.requests.map(r => `<div class="ds-card net-item"><span class="net-ico">👋</span><div class="net-main"><div class="net-name">${esc(r.name)}</div></div>${btn('Accepter', 'accept:' + r.uid, 'ds-btn--success')}${btn('Refuser', 'decline:' + r.uid, 'ds-btn--ghost')}</div>`).join('');
      }
    }
    h += `<div class="ds-section-title">${o.mode === 'local' ? 'Joueurs détectés (autres onglets)' : 'Mes amis'} <span class="ds-section-title__aside">${fr.filter(f => f.online).length} / ${fr.length} en ligne</span></div>`;
    h += fr.length ? fr.map(f => `<div class="ds-card net-item" data-friend="${esc(f.uid)}"><span class="net-ico">${classIcon(f.classe)}</span><div class="net-main"><div class="net-name">${esc(f.name)}</div>
        <div class="net-sub">${f.rank ? rankBadge(f.rank) : ''}${f.classe ? esc(className(f.classe)) + ' · ' : ''}${statusOf(f)}</div></div>
        ${f.online && !f.inGame ? btn('Inviter', 'invite:' + f.uid, 'ds-btn--gold') : ''}${o.mode === 'firebase' ? btn('Retirer', 'unfriend:' + f.uid, 'ds-btn--ghost') : ''}</div>`).join('')
      : `<div class="ds-empty"><div>${o.mode === 'local' ? 'Ouvre le jeu dans un autre onglet avec ?net=local.' : 'Aucun ami pour l’instant : partage ton code ami !'}</div></div>`;
    body.innerHTML = h;
  }
  function tabGuilde(body, o) {
    if (o.mode !== 'firebase') return offline(body, o, o.mode === 'local' ? 'Guildes indisponibles en coop locale' : null);
    if (!o.user) { body.innerHTML = '<div class="ds-empty"><div class="ds-empty__title">Connecte-toi (onglet Compte).</div></div>'; return; }
    const g = o.guild;
    if (!g) {
      body.innerHTML = `<div class="ds-section-title">Créer une guilde</div>
        <div class="ds-field"><span class="ds-label">Nom (3 à 24 caractères)</span><input class="ds-input" maxlength="24" data-in="gname" placeholder="Les Gardiens du Néant"/></div>
        <div class="ds-field"><span class="ds-label">Tag (3 ou 4 lettres)</span><div class="net-row"><input class="ds-input" maxlength="4" data-in="gtag" data-enter="gcreate" placeholder="GDN" style="text-transform:uppercase"/>${btn('Créer', 'gcreate', 'ds-btn--primary')}</div></div>
        <div class="ds-section-title">Rejoindre une guilde</div>
        <div class="net-row"><input class="ds-input" maxlength="6" data-in="gcode" data-enter="gjoin" placeholder="Code de guilde" style="text-transform:uppercase"/>${btn('Rejoindre', 'gjoin', 'ds-btn--primary')}</div>`;
      return;
    }
    const role = o.myGuildRole(), uid = o.user.uid;
    const ROLE_L = { chef: 'Chef', officier: 'Officier', membre: 'Membre' }, ROLE_C = { chef: 'ds-badge--gold', officier: 'ds-badge--violet', membre: '' };
    body.innerHTML = `<div class="ds-card net-item"><span class="net-ico">🏰</span><div class="net-main"><div class="net-name">[${esc(g.tag)}] ${esc(g.name)}</div><div class="net-sub">Code d’invitation : <b class="net-code" style="font-size:14px">${esc(g.code)}</b></div></div>${btn('Quitter', 'gleave', 'ds-btn--danger')}</div>
      <div class="ds-section-title">Membres <span class="ds-section-title__aside">${o.guildMembers.length}</span></div>
      ${o.guildMembers.map(m => `<div class="ds-card ds-card--flat net-item"><span class="net-dot ${m.online || m.uid === uid ? 'on' : ''}"></span><div class="net-main"><div class="net-name">${esc(m.name)}${m.uid === uid ? ' (toi)' : ''}</div><div class="net-sub"><span class="ds-badge ${ROLE_C[m.role]}">${ROLE_L[m.role]}</span></div></div>
        ${role === 'chef' && m.uid !== uid ? (m.role === 'membre' ? btn('Promouvoir', 'gpromote:' + m.uid) : btn('Rétrograder', 'gdemote:' + m.uid)) + btn('Exclure', 'gkick:' + m.uid, 'ds-btn--ghost') : ''}</div>`).join('')}
      <div class="ds-section-title">Discussion</div>
      <div class="net-chat" data-chat>${chatHTML(o)}</div>
      <div class="net-row"><input class="ds-input" maxlength="200" data-in="chat" data-enter="gsend" placeholder="Écris un message…"/>${btn('Envoyer', 'gsend', 'ds-btn--primary')}</div>`;
    const ch = body.querySelector('[data-chat]'); if (ch) ch.scrollTop = ch.scrollHeight;
  }
  function chatHTML(o) {
    if (!o.chat.length) return '<div class="net-note">Aucun message. Dis bonjour à ta guilde !</div>';
    return o.chat.map(m => { const d = new Date(m.at); return `<div class="net-msg${o.user && m.uid === o.user.uid ? ' me' : ''}"><b>${esc(m.name)}</b> ${esc(m.text)}<i>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</i></div>`; }).join('');
  }
  function tabGroupe(body, o) {
    if (o.mode === 'off' || o.mode === 'loading') return offline(body, o);
    if (o.mode === 'firebase' && !o.user) { body.innerHTML = '<div class="ds-empty"><div class="ds-empty__title">Connecte-toi (onglet Compte).</div></div>'; return; }
    let h = '';
    if ((o.invites || []).length && !o.lobby) {
      h += '<div class="ds-section-title">Invitations</div>' + o.invites.map(i => `<div class="ds-card net-item"><span class="net-ico">⚔️</span><div class="net-main"><div class="net-name">${esc(i.name)}</div><div class="net-sub">t’invite dans son groupe</div></div>${btn('Rejoindre', 'join:' + i.lobbyId, 'ds-btn--gold')}${btn('Refuser', 'nojoin:' + i.lobbyId, 'ds-btn--ghost')}</div>`).join('');
    }
    const lb = o.lobby;
    if (!lb) {
      h += `<div class="ds-empty"><span class="ds-empty__icon">⚔️</span><div class="ds-empty__title">Aucun groupe</div><div>Crée un groupe puis invite jusqu’à 3 amis pour explorer un donjon ensemble.</div></div>
        <button type="button" class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" data-act="lcreate"><span class="ds-btn__label">Créer un groupe</span></button>`;
      body.innerHTML = h; return;
    }
    const ms = o.members(), lead = o.isLeader(), me = ms.find(m => m.me) || {};
    const slots = [];
    for (let i = 0; i < o.MAX_PLAYERS; i++) {
      const m = ms.find(x => Number(x.slot) === i);
      slots.push(m ? `<div class="ds-card net-item net-slot" data-slot="${i}" data-uid="${esc(m.uid)}"><span class="net-ico">${classIcon(m.classe)}</span><div class="net-main"><div class="net-name">${m.leader ? '👑 ' : ''}${esc(m.name)}${m.me ? ' (toi)' : ''}</div>
          <div class="net-sub">${rankBadge(m.rank)} ${esc(className(m.classe))} · Niv. ${esc(m.niveau || 1)}</div>
          <div class="net-sub">${m.leader ? '<span class="ds-badge ds-badge--gold">Chef</span>' : m.ready ? '<span class="ds-badge ds-badge--success" data-ready="1">Prêt</span>' : '<span class="ds-badge">Pas prêt</span>'}${m.ok === false ? ' <span class="ds-badge ds-badge--danger" title="' + esc(m.reason) + '">Accès refusé</span>' : ''}</div></div></div>`
        : `<div class="ds-card ds-card--flat net-item net-slot empty">Place libre</div>`);
    }
    const pt = o.lobbyPortal();
    h += `<div class="ds-section-title">Groupe <span class="ds-section-title__aside">${ms.length} / ${o.MAX_PLAYERS}</span></div><div class="net-slots">${slots.join('')}</div>`;
    h += `<div class="ds-section-title">Portail</div>` + (pt ? `<div class="ds-card net-item" data-chosen="${esc(pt.id)}"><span class="net-ico">🌀</span><div class="net-main"><div class="net-name">${esc(pt.name || pt.templateName || 'Portail')}</div><div class="net-sub">${rankBadge(pt.rank)} Rang ${esc(pt.rank)}${me.ok === false ? ' · <b style="color:var(--ds-danger)">' + esc(me.reason) + '</b>' : ''}</div></div></div>` : `<div class="net-note">${lead ? 'Choisis un portail ci-dessous.' : 'Le chef choisit le portail.'}</div>`);
    if (lead) {
      let list = [];
      try { list = (G.Portals && G.Portals.list && G.game.profile) ? G.Portals.list(G.game.profile) || [] : []; } catch (_) { list = []; }
      h += '<div class="net-portals">' + list.slice(0, 12).map(p => { const c = G.game.net.checkEntry(p); return `<button type="button" class="ds-card net-portal${pt && pt.id === p.id ? ' is-selected' : ''}${c.ok ? '' : ' is-locked'}" data-act="portal:${esc(p.id)}"><span class="net-ico">${esc(p.icon || '🌀')}</span><span class="net-main"><span class="net-name">${esc(p.name || p.templateName || p.id)}</span><span class="net-sub">${rankBadge(p.rank)}${p.type === 'epreuve' ? ' Épreuve' : ''}${c.ok ? '' : ' 🔒'}</span></span></button>`; }).join('') + '</div>';
      const cl = o.canLaunch();
      h += `<button type="button" class="ds-btn ${cl.ok ? 'ds-btn--gold' : 'is-disabled'} ds-btn--lg ds-btn--block" data-act="launch"${cl.ok ? '' : ' aria-disabled="true"'}><span class="ds-btn__label">Lancer le donjon</span></button>${cl.ok ? '' : '<div class="net-note" data-why>' + esc(cl.reason) + '</div>'}`;
    } else {
      h += `<button type="button" class="ds-btn ${me.ready ? 'ds-btn--secondary' : 'ds-btn--success'} ds-btn--lg ds-btn--block" data-act="ready"><span class="ds-btn__label">${me.ready ? 'Je ne suis plus prêt' : 'Je suis prêt !'}</span></button>`;
    }
    const inv = (o.friends || []).filter(f => f.online && !f.inGame && !ms.some(m => m.uid === f.uid));
    if (inv.length && ms.length < o.MAX_PLAYERS) h += '<div class="ds-section-title">Inviter</div>' + inv.map(f => `<div class="ds-card ds-card--flat net-item"><span class="net-dot on"></span><div class="net-main"><div class="net-name">${esc(f.name)}</div></div>${btn('Inviter', 'invite:' + f.uid, 'ds-btn--gold')}</div>`).join('');
    h += btn('Quitter le groupe', 'lleave', 'ds-btn--ghost');
    body.innerHTML = h;
  }
  function val(k) { const i = mounted && mounted.querySelector('[data-in="' + k + '"]'); return i ? i.value : ''; }
  function onAction(ev) {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const [act, arg] = b.dataset.act.split(/:(.*)/s);
    const o = O(); sfx('click');
    const run = p => Promise.resolve(p).catch(e => { console.warn('[OnlineUI] ' + act, e); G.UI && G.UI.toast && G.UI.toast('Action impossible : ' + (e && (e.code || e.message) || 'erreur')); }).then(refresh);
    switch (act) {
      case 'local': if (o.enableLocal()) { panelTab = 'groupe'; } refresh(); break;
      case 'signin': run(o.signIn()); break;
      case 'signout': run(o.signOut()); break;
      case 'pseudo': run(o.setPseudo(val('pseudo'))); break;
      case 'copycode': try { navigator.clipboard.writeText((o.me && o.me.code) || ''); G.UI.toast('Code copié !'); } catch (_) { /* rien */ } break;
      case 'addfriend': run(o.addFriendByCode(val('fcode'))); break;
      case 'accept': run(o.acceptFriend(arg)); break;
      case 'decline': run(o.declineFriend(arg)); break;
      case 'unfriend': run(o.removeFriend(arg)); break;
      case 'invite': run(o.invite(arg).then(() => { panelTab = 'groupe'; })); break;
      case 'gcreate': run(o.createGuild(val('gname'), val('gtag'))); break;
      case 'gjoin': run(o.joinGuild(val('gcode'))); break;
      case 'gleave': run(o.leaveGuild()); break;
      case 'gkick': run(o.kickMember(arg)); break;
      case 'gpromote': run(o.setMemberRole(arg, 'officier')); break;
      case 'gdemote': run(o.setMemberRole(arg, 'membre')); break;
      case 'gsend': { const i = mounted.querySelector('[data-in="chat"]'); const t = i ? i.value : ''; Promise.resolve(o.sendChat(t)).then(ok => { if (ok && i) i.value = ''; }).catch(e => G.UI.toast('Message refusé : ' + (e && e.code || 'erreur'))); break; }
      case 'lcreate': run(o.createLobby()); break;
      case 'lleave': run(o.leaveLobby()); break;
      case 'join': run(o.acceptInvite(arg)); break;
      case 'nojoin': run(o.declineInvite(arg)); break;
      case 'ready': { const m = o.members().find(x => x.me); run(o.setReady(!(m && m.ready))); break; }
      case 'portal': {
        let list = []; try { list = G.Portals.list(G.game.profile) || []; } catch (_) { /* rien */ }
        const p = list.find(x => x.id === arg); if (p) run(o.choosePortal(p)); break;
      }
      case 'launch': run(o.launch()); break;
      default: break;
    }
  }
  let refreshQ = false;
  function refresh() {
    if (refreshQ) return; refreshQ = true;
    requestAnimationFrame(() => {
      refreshQ = false;
      if (!mounted || !mounted.isConnected) return;
      const a = document.activeElement;
      // ne pas effacer une saisie en cours : seul le fil de discussion est rafraîchi
      if (a && mounted.contains(a) && a.tagName === 'INPUT' && a.value) {
        const ch = mounted.querySelector('[data-chat]'); const o = O();
        if (ch && o) { ch.innerHTML = chatHTML(o); ch.scrollTop = ch.scrollHeight; }
        return;
      }
      const keep = a && mounted.contains(a) && a.dataset ? a.dataset.in : null;
      render(mounted);
      if (keep) { const i = mounted.querySelector('[data-in="' + keep + '"]'); if (i) i.focus(); }
    });
  }

  // ------------------------------------------------------------------
  // En jeu : noms des alliés, HUD de groupe, jauge de réanimation
  // ------------------------------------------------------------------
  let namesEl = null, partyEl = null, reviveEl = null;
  function ensureLayers() {
    injectStyle();
    if (!namesEl) { namesEl = document.createElement('div'); namesEl.className = 'net-names'; namesEl.id = 'net-names'; document.body.appendChild(namesEl); }
    if (!partyEl) { partyEl = document.createElement('div'); partyEl.className = 'net-party'; partyEl.id = 'net-party'; document.body.appendChild(partyEl); }
    if (!reviveEl) { reviveEl = document.createElement('div'); reviveEl.className = 'net-revive'; reviveEl.id = 'net-revive'; document.body.appendChild(reviveEl); }
  }
  function attachName(o) {
    ensureLayers();
    const el = document.createElement('div');
    el.className = 'net-tag';
    el.innerHTML = '<span></span><div class="ds-bar ds-bar--hp ds-bar--thin"><i class="ds-bar__fill" style="width:100%"></i></div>';
    el.firstChild.textContent = (o.info && o.info.name) || 'Allié';
    el.dataset.uid = o.uid;
    namesEl.appendChild(el);
    return { el, fill: el.querySelector('.ds-bar__fill'), remove() { el.remove(); } };
  }
  let partySig = '';
  function frame(S) {
    ensureLayers();
    const run = G.game.run, ri = run ? run.roomIndex : -1;
    const inGame = !!(run && G.UI && G.UI.current && G.UI.current() === 'game');
    partyEl.classList.toggle('on', inGame);
    const rows = [];
    S.others.forEach(o => {
      const st = o.st || {};
      const frac = Math.max(0, Math.min(1, (st.pv || 0) / Math.max(1, st.pvMax || 1)));
      if (o.label && o.avatar) {
        const vis = inGame && o.avatar.visible;
        const pt = vis && G.core && G.core.toScreen ? G.core.toScreen(o.avatar.position, ((o.proxy && o.proxy.height) || 2) + 0.55) : null;
        if (pt && pt.visible) { o.label.el.style.display = ''; o.label.el.style.left = pt.x + 'px'; o.label.el.style.top = pt.y + 'px'; o.label.fill.style.width = (frac * 100).toFixed(0) + '%'; o.label.el.classList.toggle('dead', !!st.dead); }
        else o.label.el.style.display = 'none';
      }
      const state = o.gone ? 'Déconnecté' : !o.st ? 'Connexion…' : st.dead ? 'À terre' : st.ri !== ri ? 'Autre salle' : Math.round(st.pv || 0) + ' PV';
      rows.push({ uid: o.uid, name: (o.info && o.info.name) || 'Allié', frac: o.gone ? 0 : frac, state, dead: !!st.dead || o.gone });
    });
    const sig = rows.map(r => r.uid + r.state + r.frac.toFixed(2)).join('|');
    if (sig !== partySig) {
      partySig = sig;
      partyEl.innerHTML = rows.map(r => `<div class="net-pm${r.dead ? ' dead' : ''}" data-uid="${esc(r.uid)}"><div class="t"><span>${esc(r.name)}</span><em>${esc(r.state)}</em></div><div class="ds-bar ds-bar--hp ds-bar--thin"><i class="ds-bar__fill" style="width:${(r.frac * 100).toFixed(0)}%"></i></div></div>`).join('');
    }
    const rp = O().reviveProgress();
    reviveEl.classList.toggle('on', !!(rp && inGame));
    if (rp) reviveEl.textContent = 'Réanimation… ' + Math.round(rp.t * 100) + ' %';
  }
  function hideGameLayers() {
    if (partyEl) { partyEl.classList.remove('on'); partyEl.innerHTML = ''; partySig = ''; }
    if (reviveEl) reviveEl.classList.remove('on');
  }

  // ------------------------------------------------------------------
  // Enregistrement
  // ------------------------------------------------------------------
  const PANEL = {
    id: 'enligne', title: 'En ligne', icon: '🌐', order: 9,
    visible: () => true,
    badge() { const o = O(); if (!o) return ''; return (o.invites || []).length + (o.requests || []).length; },
    render(c) { render(c); },
    dispose() { mounted = null; },
  };
  G.OnlineUI = {
    notify, attachName, frame, refresh,
    open(tab) { if (tab) panelTab = tab; if (G.UI && G.UI.setTab) G.UI.setTab('enligne'); refresh(); },
    get tab() { return panelTab; },
  };
  function boot() {
    try { if (G.UI && G.UI.registerPanel) G.UI.registerPanel(PANEL); else if (G.Panels) G.Panels.register(PANEL.id, PANEL); } catch (e) { console.error('[OnlineUI] panneau', e); }
    const hook = () => {
      if (!G.Online || !G.Online.onChange) return setTimeout(hook, 50);
      G.Online.onChange(what => {
        refresh();
        if (what === 'session' && !G.Online.session) hideGameLayers();
        if ((what === 'invites' || what === 'requests') && G.UI && G.UI.current && G.UI.current() === 'hub' && G.UI.refreshCamp && !(mounted && mounted.isConnected)) { try { G.UI.refreshCamp(); } catch (_) { /* rien */ } }
      });
    };
    hook();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
