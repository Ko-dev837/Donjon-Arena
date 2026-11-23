window.G = window.G || {};
// =====================================================================
//  js/ui/ds.js — G.DS : comportements du système de design v4
//   - onde (ripple) automatique sur .ds-btn / .ds-icon-btn / .ds-card cliquables / .ds-tab (délégation)
//   - curseurs .ds-slider : remplissage synchronisé (--v)
//   - G.DS.el(html) / G.DS.stagger(container) / G.DS.transition(from, to, type)
//   - G.DS.countUp(el, from, to, ms) / G.DS.sound(type) / G.DS.reducedMotion()
// =====================================================================
(() => {
  const G = window.G;
  const DS = G.DS = G.DS || {};

  const mq = (typeof matchMedia === 'function') ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  DS.reducedMotion = () => !!((mq && mq.matches) || (document.documentElement && document.documentElement.classList.contains('ds-reduce-motion')));

  DS.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Crée un élément (ou un fragment s'il y a plusieurs racines) depuis du HTML */
  DS.el = function (html) {
    const t = document.createElement('template');
    t.innerHTML = String(html == null ? '' : html).trim();
    const c = t.content;
    return c.childNodes.length === 1 ? c.firstChild : c;
  };

  /** Icône (raccourci vers G.Icons) avec secours texte */
  DS.icon = (name, opts, fallback) => (G.Icons && G.Icons.has(name) ? G.Icons.svg(name, opts) : DS.esc(fallback || ''));

  // ------------------------------------------------------------------
  //  SONS d'interface (G.sfx si dispo)
  // ------------------------------------------------------------------
  const SOUND_MAP = { hover: null, click: 'click', open: 'click', close: 'click', error: 'error', confirm: 'upgrade', tab: 'click', reward: 'pickup' };
  let lastSound = {};
  DS.sound = function (type) {
    try {
      const sfx = G.sfx; if (!sfx || typeof sfx.play !== 'function') return;
      const name = Object.prototype.hasOwnProperty.call(SOUND_MAP, type) ? SOUND_MAP[type] : type;
      if (!name) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (lastSound[name] && now - lastSound[name] < 60) return;
      lastSound[name] = now;
      sfx.play(name);
    } catch (_) {}
  };

  // ------------------------------------------------------------------
  //  RIPPLE (délégation globale)
  // ------------------------------------------------------------------
  const RIPPLE_SEL = '.ds-btn, .ds-icon-btn, .ds-tab, .ds-segmented > button, button.ds-card, a.ds-card, .ds-card.is-clickable, .ds-card[data-click], .ds-ripple-host';
  function clickableCard(el) {
    if (!el.classList.contains('ds-card')) return true;
    return el.tagName === 'BUTTON' || el.tagName === 'A' || el.classList.contains('is-clickable') || el.hasAttribute('data-click') || el.getAttribute('role') === 'button';
  }
  function ripple(e) {
    if (e.button != null && e.button !== 0) return;
    const t = e.target && e.target.closest ? e.target.closest(RIPPLE_SEL) : null;
    if (!t || !clickableCard(t)) return;
    if (t.disabled || t.classList.contains('is-disabled') || t.classList.contains('is-locked') || t.getAttribute('aria-disabled') === 'true') return;
    if (DS.reducedMotion()) return;
    const r = t.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const size = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ds-ripple';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - r.left - size / 2) + 'px';
    s.style.top = (e.clientY - r.top - size / 2) + 'px';
    const cs = getComputedStyle(t);
    if (cs.position === 'static') t.style.position = 'relative';
    if (cs.overflow === 'visible' && !t.classList.contains('ds-ripple-host')) t.style.overflow = 'hidden';
    t.appendChild(s);
    const kill = () => { if (s.parentNode) s.parentNode.removeChild(s); };
    s.addEventListener('animationend', kill);
    setTimeout(kill, 900);
  }
  document.addEventListener('pointerdown', ripple, { capture: true, passive: true });

  // Son de survol (souris uniquement, discret)
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target && e.target.closest ? e.target.closest('.ds-btn, .ds-tab, button.ds-card') : null;
    if (!t || t === DS._hovered) return;
    DS._hovered = t;
    DS.sound('hover');
  }, { passive: true });

  // ------------------------------------------------------------------
  //  CURSEURS : remplissage
  // ------------------------------------------------------------------
  DS.syncSlider = function (inp) {
    if (!inp) return;
    const min = +inp.min || 0, max = inp.max === '' ? 100 : +inp.max, v = +inp.value;
    const f = max > min ? (v - min) / (max - min) : 0;
    inp.style.setProperty('--v', (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%');
  };
  document.addEventListener('input', e => { const t = e.target; if (t && t.classList && t.classList.contains('ds-slider')) DS.syncSlider(t); }, true);
  DS.syncSliders = root => (root || document).querySelectorAll('.ds-slider').forEach(DS.syncSlider);

  // ------------------------------------------------------------------
  //  APPARITION ÉCHELONNÉE
  // ------------------------------------------------------------------
  DS.stagger = function (container, opts) {
    if (!container) return container;
    opts = opts || {};
    const kids = opts.sel ? container.querySelectorAll(opts.sel) : container.children;
    const max = opts.max == null ? 14 : opts.max;
    Array.prototype.forEach.call(kids, (k, i) => { k.style.setProperty('--i', Math.min(i, max)); });
    container.classList.remove('ds-stagger');
    void container.offsetWidth;
    container.classList.add('ds-stagger');
    return container;
  };

  // ------------------------------------------------------------------
  //  TRANSITIONS D'ÉCRAN / DE PANNEAU (non bloquantes, ≤ 350 ms)
  //  type : 'fade' | 'up' | 'down' | 'left' | 'right' | 'zoom' | 'slide-left' | 'slide-right'
  // ------------------------------------------------------------------
  const IN = {
    fade: 'translateY(0)', up: 'translateY(16px)', down: 'translateY(-16px)', zoom: 'scale(1.035)',
    left: 'translateX(28px)', right: 'translateX(-28px)', 'slide-left': 'translateX(36px)', 'slide-right': 'translateX(-36px)',
  };
  const OUT = {
    fade: 'translateY(0)', up: 'translateY(-10px)', down: 'translateY(10px)', zoom: 'scale(.975)',
    left: 'translateX(-22px)', right: 'translateX(22px)', 'slide-left': 'translateX(-30px)', 'slide-right': 'translateX(30px)',
  };
  function flash(opts) {
    if (!document.body) return;
    const f = document.createElement('div');
    f.className = 'ds-screen-flash';
    if (opts && opts.color) f.style.setProperty('--ds-accent', opts.color);
    document.body.appendChild(f);
    const done = () => f.remove();
    if (f.animate) {
      const a = f.animate([
        { transform: 'translateY(0) scaleX(.2)', opacity: 0 },
        { transform: 'translateY(0) scaleX(1)', opacity: 1, offset: .25 },
        { transform: 'translateY(' + Math.round(window.innerHeight * .9) + 'px) scaleX(1)', opacity: 0 },
      ], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
      a.onfinish = done; a.oncancel = done;
    } else setTimeout(done, 340);
  }
  DS.flash = flash;
  DS.transition = function (fromEl, toEl, type, opts) {
    opts = opts || {};
    type = IN[type] ? type : 'fade';
    const reduce = DS.reducedMotion();
    const dur = Math.min(350, opts.duration || 300);
    const anims = [];
    if (fromEl && fromEl !== toEl && fromEl.animate && !reduce) {
      fromEl.classList.add('is-leaving');
      try {
        const a = fromEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: OUT[type] }], { duration: Math.round(dur * .65), easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
        const end = () => { fromEl.classList.remove('is-leaving'); try { a.cancel(); } catch (_) {} };
        a.onfinish = end; a.oncancel = () => fromEl.classList.remove('is-leaving');
        anims.push(a);
      } catch (_) { fromEl.classList.remove('is-leaving'); }
    }
    if (toEl && toEl.animate && !reduce) {
      try {
        const a = toEl.animate([{ opacity: 0, transform: IN[type] }, { opacity: 1, transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)', delay: opts.delay || 0, fill: 'backwards' });
        anims.push(a);
      } catch (_) {}
    }
    if (opts.flash !== false && !reduce) flash(opts);
    return new Promise(r => setTimeout(r, anims.length ? dur + (opts.delay || 0) + 20 : 0));
  };

  // ------------------------------------------------------------------
  //  COMPTEUR ANIMÉ
  // ------------------------------------------------------------------
  const fmtInt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  DS.fmtInt = fmtInt;
  DS.countUp = function (el, from, to, ms, opts) {
    if (!el) return () => {};
    opts = opts || {};
    from = +from || 0; to = +to || 0; ms = ms == null ? 900 : ms;
    const fmt = typeof opts.format === 'function' ? opts.format : (v => (opts.prefix || '') + fmtInt(v) + (opts.suffix || ''));
    if (el._dsCount) el._dsCount();
    if (DS.reducedMotion() || ms <= 0) { el.textContent = fmt(to); return () => {}; }
    let raf = 0, stopped = false;
    const t0 = performance.now() + (opts.delay || 0);
    el.textContent = fmt(from);
    const step = t => {
      if (stopped) return;
      const k = Math.max(0, Math.min(1, (t - t0) / ms));
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else { el._dsCount = null; if (opts.onDone) try { opts.onDone(); } catch (_) {} }
    };
    raf = requestAnimationFrame(step);
    el._dsCount = () => { stopped = true; cancelAnimationFrame(raf); el._dsCount = null; };
    return el._dsCount;
  };

  // ------------------------------------------------------------------
  //  Petits constructeurs HTML (utilisables par tous les panneaux)
  // ------------------------------------------------------------------
  /** Bouton : DS.btn({label, icon, variant:'primary'|..., size:'sm'|'lg'|'xl', block, id, attrs, meta}) -> HTML */
  DS.btn = function (o) {
    o = o || {};
    const cls = ['ds-btn'];
    if (o.variant) cls.push('ds-btn--' + o.variant);
    if (o.size) cls.push('ds-btn--' + o.size);
    if (o.block) cls.push('ds-btn--block');
    if (o.cls) cls.push(o.cls);
    const ic = o.icon ? `<span class="ds-btn__icon">${DS.icon(o.icon, { size: 18 }, o.iconFallback)}</span>` : '';
    const meta = o.meta ? `<span class="ds-btn__meta">${o.meta}</span>` : '';
    return `<button type="button" class="${cls.join(' ')}"${o.id ? ` id="${DS.esc(o.id)}"` : ''}${o.disabled ? ' disabled' : ''}${o.attrs ? ' ' + o.attrs : ''}>${ic}<span class="ds-btn__label">${o.html != null ? o.html : DS.esc(o.label || '')}</span>${meta}</button>`;
  };
  /** Badge de rang hexagonal */
  DS.rank = function (r, size) {
    r = String(r || 'E').replace(/[^A-Za-z]/g, '').toUpperCase() || 'E';
    return `<span class="ds-rank ds-rank--${size || 'md'}" data-rank="${DS.esc(r)}">${DS.esc(r)}</span>`;
  };
  /** Barre de progression */
  DS.bar = function (frac, variant, text) {
    const f = Math.max(0, Math.min(1, +frac || 0));
    return `<div class="ds-bar${variant ? ' ds-bar--' + variant : ''}"><i class="ds-bar__fill" style="width:${(f * 100).toFixed(1)}%"></i>${text != null ? `<span class="ds-bar__text">${DS.esc(text)}</span>` : ''}</div>`;
  };
  DS.empty = function (icon, title, text) {
    return `<div class="ds-empty"><span class="ds-empty__icon">${DS.icon(icon || 'info', { size: 30 })}</span>${title ? `<div class="ds-empty__title">${DS.esc(title)}</div>` : ''}${text ? `<div>${DS.esc(text)}</div>` : ''}</div>`;
  };
})();
