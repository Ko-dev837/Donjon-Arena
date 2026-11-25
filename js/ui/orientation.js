window.G = window.G || {};
/* =====================================================================
   js/ui/orientation.js — sur téléphone / tablette, le jeu se joue UNIQUEMENT à l'horizontale
   - essaie de verrouiller l'écran en paysage (plein écran + screen.orientation.lock, Android / appli installée)
   - sinon : écran « Tourne ton téléphone » par-dessus le jeu, et pause automatique en donjon
   (le manifeste de l'appli demande aussi "orientation": "landscape")
   ===================================================================== */
(() => {
  'use strict';
  const G = window.G;
  const isTouch = () => { try { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch (_) { return false; } };
  const isPortrait = () => { try { return matchMedia('(orientation: portrait)').matches; } catch (_) { return innerHeight > innerWidth; } };
  const standalone = () => { try { return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (_) { return false; } };
  let el = null, wasPortrait = false;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'rotate-hint'; el.className = 'rotate-hint'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-live', 'assertive');
    el.innerHTML = '<div class="rh-box"><div class="rh-phone" aria-hidden="true"><i></i></div><b>Tourne ton téléphone</b><span>Donjon Arena se joue à l’horizontale.</span><button type="button" class="ds-btn ds-btn--primary rh-btn">Passer en plein écran</button></div>';
    el.querySelector('.rh-btn').addEventListener('click', () => lock(true));
    document.body.appendChild(el);
    return el;
  }
  async function lock(fromClick) {
    try {
      const d = document.documentElement;
      if (!document.fullscreenElement && !standalone() && d.requestFullscreen && fromClick !== false) await d.requestFullscreen({ navigationUI: 'hide' });
    } catch (_) { /* refusé : l'écran d'aide reste */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) { /* iPhone / navigateur : pas de verrouillage possible */ }
    update();
  }
  function pauseIfPlaying() {
    try {
      const scr = G.UI && G.UI.current && G.UI.current();
      if (scr === 'game' && G.core && !G.core.paused && G.input && G.input.fire && !(G.game && G.game.net && G.game.net.role)) G.input.fire('pause');
    } catch (_) { /* rien */ }
  }
  function update() {
    const show = isTouch() && isPortrait();
    build().classList.toggle('on', show);
    document.documentElement.classList.toggle('is-portrait-blocked', show);
    if (show && !wasPortrait) pauseIfPlaying();
    wasPortrait = show;
  }
  function boot() {
    if (!isTouch()) return;                       // PC : rien à faire
    update();
    addEventListener('resize', update);
    addEventListener('orientationchange', () => setTimeout(update, 60));
    try { if (screen.orientation) screen.orientation.addEventListener('change', update); } catch (_) { /* rien */ }
    // 1re touche : plein écran + verrouillage paysage quand c'est possible (Android, appli installée)
    const first = () => { removeEventListener('pointerdown', first, true); lock(true); };
    addEventListener('pointerdown', first, true);
    if (standalone()) lock(false);
  }
  G.Orientation = { update, lock };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
