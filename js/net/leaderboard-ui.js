window.G = window.G || {};
/* =====================================================================
   js/net/leaderboard-ui.js — page « Classement » du camp (entre Guilde et En ligne)
   Joueurs ayant connecté un compte : position, pseudo, classe, rang, niveau. Jamais d'adresse email.
   Tri : rang (S → E), puis niveau. Données : G.Online.leaderboard() (Firestore users).
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const O = () => G.Online;
  const H = () => (G.OnlineUI && G.OnlineUI.h) || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (n, s, f) => { try { return G.DS && G.DS.icon ? G.DS.icon(n, { size: s || 16 }, f || '') : esc(f || ''); } catch (_) { return esc(f || ''); } };
  const rankBadge = r => (H().rankBadge ? H().rankBadge(r, 'sm') : '<span class="ds-badge">' + esc(r || 'E') + '</span>');
  const classIcon = c => (H().classIcon ? H().classIcon(c) : '');
  const className = c => (H().className ? H().className(c) : (c || ''));

  const CSS = `
.lb-wrap{display:flex;flex-direction:column;gap:12px}
.lb-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between}
.lb-sub{font-size:13px;color:var(--ds-text-2)}
.lb-filter{display:flex;gap:6px;flex-wrap:wrap}
.lb-filter button{border:0;cursor:pointer;padding:6px 10px;border-radius:999px;font:inherit;font-size:12px;color:var(--ds-text-2);background:rgba(4,8,20,.6);box-shadow:inset 0 0 0 1px var(--ds-line)}
.lb-filter button.is-active{color:#06101c;background:var(--ds-accent)}
.lb-me{padding:10px 12px;border-radius:var(--ds-r-sm);background:color-mix(in srgb,var(--ds-accent) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ds-accent) 45%,transparent);font-size:14px}
.lb-table{width:100%;border-collapse:separate;border-spacing:0 6px}
.lb-table th{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ds-text-3);text-align:left;padding:0 10px;font-weight:600}
.lb-table td{padding:10px;background:rgba(4,8,20,.55);border-top:1px solid var(--ds-line);border-bottom:1px solid var(--ds-line)}
.lb-table td:first-child{border-left:1px solid var(--ds-line);border-radius:10px 0 0 10px;width:56px;text-align:center;font-weight:800}
.lb-table td:last-child{border-right:1px solid var(--ds-line);border-radius:0 10px 10px 0}
.lb-table tr.is-me td{background:color-mix(in srgb,var(--ds-accent) 14%,rgba(4,8,20,.6));border-color:color-mix(in srgb,var(--ds-accent) 50%,transparent)}
.lb-pos1{color:#ffd24a}.lb-pos2{color:#d8dde8}.lb-pos3{color:#e09a5a}
.lb-name{font-weight:700}
.lb-cls{display:inline-flex;align-items:center;gap:6px;color:var(--ds-text-2);font-size:13px}
.lb-empty{padding:24px;text-align:center;color:var(--ds-text-2)}
@media (max-width:700px){.lb-table .lb-hide{display:none}}
`;
  let cssDone = false, mounted = null, data = null, loading = false, err = null, filter = 'all', loadedAt = 0;
  function injectCSS() { if (cssDone) return; cssDone = true; const st = document.createElement('style'); st.id = 'lb-style'; st.textContent = CSS; document.head.appendChild(st); }

  async function load(force) {
    const o = O(); if (!o || o.mode !== 'firebase' || !o.user) return;
    if (loading || (!force && data && Date.now() - loadedAt < 30000)) return;
    loading = true; err = null; paint();
    try { data = await o.leaderboard(200); loadedAt = Date.now(); }
    catch (e) { err = 'Impossible de charger le classement (' + ((e && (e.code || e.message)) || 'erreur') + ').'; console.warn('[Classement]', e); }
    loading = false; paint();
  }

  function paint(first) {
    const c = mounted; if (!c || (!first && !c.isConnected)) return;   // au premier rendu le nœud n'est pas encore dans la page
    const o = O();
    let html = '<div class="lb-wrap">';
    if (!o || (o.mode !== 'firebase' && o.mode !== 'loading')) {
      html += '<div class="lb-empty">Le classement nécessite le mode en ligne.</div></div>'; c.innerHTML = html; return;
    }
    if (!o.user) {
      html += '<div class="lb-empty">Connecte-toi à ton compte pour voir le classement des joueurs.<br><br><button type="button" class="ds-btn ds-btn--primary" data-lb="signin"><span class="ds-btn__label">Se connecter</span></button></div></div>';
      c.innerHTML = html; return;
    }
    const all = data || [];
    const classes = Array.from(new Set(all.map(p => p.classe).filter(Boolean)));
    const list = filter === 'all' ? all : all.filter(p => p.classe === filter);
    const me = all.find(p => p.uid === o.user.uid);
    html += '<div class="lb-head"><div class="lb-sub">' + all.length + ' joueur' + (all.length > 1 ? 's' : '') + ' avec un compte · trié par rang puis niveau</div>'
      + '<button type="button" class="ds-btn ds-btn--sm ds-btn--secondary" data-lb="reload"' + (loading ? ' disabled' : '') + '><span class="ds-btn__label">' + (loading ? 'Chargement…' : 'Actualiser') + '</span></button></div>';
    if (classes.length > 1) html += '<div class="lb-filter"><button type="button" data-lb="f:all" class="' + (filter === 'all' ? 'is-active' : '') + '">Toutes les classes</button>'
      + classes.map(k => '<button type="button" data-lb="f:' + esc(k) + '" class="' + (filter === k ? 'is-active' : '') + '">' + esc(className(k)) + '</button>').join('') + '</div>';
    if (me) html += '<div class="lb-me">Ta place : <b>#' + me.pos + '</b> sur ' + all.length + ' — rang <b>' + esc(me.rank) + '</b>, niveau <b>' + me.niveau + '</b></div>';
    if (err) html += '<div class="lb-empty">' + esc(err) + '</div>';
    else if (!data && loading) html += '<div class="lb-empty">Chargement du classement…</div>';
    else if (!list.length) html += '<div class="lb-empty">Aucun joueur pour l’instant.</div>';
    else {
      html += '<table class="lb-table"><thead><tr><th>#</th><th>Joueur</th><th class="lb-hide">Classe</th><th>Rang</th><th>Niveau</th></tr></thead><tbody>';
      for (const p of list) {
        const pc = p.pos <= 3 ? ' lb-pos' + p.pos : '';
        html += '<tr class="' + (p.uid === o.user.uid ? 'is-me' : '') + '"><td class="' + pc + '">' + (p.pos <= 3 ? ico(p.pos === 1 ? 'crown' : 'trophy', 14) + ' ' : '') + p.pos + '</td>'
          + '<td><span class="lb-name">' + esc(p.name) + '</span>' + (p.uid === o.user.uid ? ' <small>(toi)</small>' : '') + '</td>'
          + '<td class="lb-hide"><span class="lb-cls">' + classIcon(p.classe) + ' ' + esc(className(p.classe) || '—') + '</span></td>'
          + '<td>' + rankBadge(p.rank) + '</td><td><b>' + p.niveau + '</b></td></tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div>';
    c.innerHTML = html;
  }

  function render(c) {
    injectCSS(); mounted = c; paint(true); load(false);
    if (!c._lbBound) {
      c._lbBound = true;
      c.addEventListener('click', e => {
        const b = e.target.closest('[data-lb]'); if (!b) return;
        const a = b.dataset.lb;
        try { G.sfx && G.sfx.play && G.sfx.play('click'); } catch (_) { /* rien */ }
        if (a === 'reload') load(true);
        else if (a === 'signin') { const o = O(); if (o) o.signIn(); }
        else if (a.indexOf('f:') === 0) { filter = a.slice(2); paint(); }
      });
    }
  }
  const PANEL = { id: 'classement', title: 'Classement', icon: 'trophy', order: 8.95, visible: () => true, render, dispose() { mounted = null; } };
  function boot() {
    try { if (G.UI && G.UI.registerPanel) G.UI.registerPanel(PANEL); else if (G.Panels) G.Panels.register(PANEL.id, PANEL); } catch (e) { console.error('[Classement] panneau', e); }
    const hook = () => { if (!G.Online || !G.Online.onChange) return setTimeout(hook, 50); G.Online.onChange(w => { if (w === 'auth') { data = null; load(true); } else if (!data && mounted && mounted.isConnected) load(false); paint(); }); };
    hook();
  }
  G.LeaderboardUI = { refresh: () => load(true) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
