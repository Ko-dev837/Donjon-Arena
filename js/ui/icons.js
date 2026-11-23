window.G = window.G || {};
// =====================================================================
//  js/ui/icons.js — jeu d'icônes SVG du système de design v4
//  G.Icons.svg(name, {size=20, cls, stroke=2, title}) -> chaîne SVG (24×24, trait currentColor)
//  G.Icons.has(name) ; G.Icons.el(name, opts) -> Element ; G.Icons.list() -> [noms]
//  Dessinées à la main sur une grille 24×24, trait 2, extrémités et jointures arrondies.
//  Nom inconnu -> '' (l'appelant garde son emoji de secours).
// =====================================================================
(() => {
  const G = window.G;
  // Préfixe « F| » = forme pleine (fill currentColor, sans trait)
  const P = {
    // ---- navigation / actions ----
    play: 'F|<path d="M7.5 4.6c0-.8.9-1.3 1.6-.9l10.6 6.9c.6.4.6 1.4 0 1.8L9.1 19.3c-.7.4-1.6-.1-1.6-.9z"/>',
    continue: '<circle cx="12" cy="12" r="9"/><path d="M10 8.6v6.8l5.4-3.4z"/>',
    settings: '<path d="M12 2.6l2 2.2 3-.4.9 2.9 2.7 1.4-1 2.9 1 2.9-2.7 1.4-.9 2.9-3-.4-2 2.2-2-2.2-3 .4-.9-2.9-2.7-1.4 1-2.9-1-2.9 2.7-1.4.9-2.9 3 .4z"/><circle cx="12" cy="12" r="3.2"/>',
    back: '<path d="M19.5 12H5"/><path d="M11 5.5L4.5 12 11 18.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.6"/><path d="M12 14.5v2.5"/>',
    star: '<path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17.1 6.6 20l1-6.1-4.4-4.3 6.1-.9z"/>',
    'star-fill': 'F|<path d="M12 2.6l2.9 5.9 6.5 1-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    'arrow-up': '<path d="M12 19.5V5"/><path d="M6 10.5l6-6 6 6"/>',
    'arrow-right': '<path d="M4.5 12H19"/><path d="M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19.5 12H5"/><path d="M11 6l-6 6 6 6"/>',
    'arrow-down': '<path d="M12 4.5V19"/><path d="M6 13.5l6 6 6-6"/>',
    'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
    'chevron-right': '<path d="M9 5l7 7-7 7"/>',
    'chevron-down': '<path d="M5 9l7 7 7-7"/>',
    'chevron-up': '<path d="M5 15l7-7 7 7"/>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
    filter: '<path d="M3.5 4.5h17l-6.5 8v6l-4 2v-8z"/>',
    sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5"/><path d="M17 20V4M13.5 7.5L17 4l3.5 3.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/>',
    refresh: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18.5 3v4h-4M5.5 21v-4h4"/>',
    restart: '<path d="M4.2 12a7.8 7.8 0 1 0 2.4-5.6"/><path d="M4 3.8v4.6h4.6"/>',
    exit: '<path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5"/>',
    home: '<path d="M3.5 11L12 3.5l8.5 7.5"/><path d="M5.5 9.5v11h5v-6h3v6h5v-11"/>',
    pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/>',
    trash: '<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14"/><path d="M10 10.5v6M14 10.5v6"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.3C3.9 9 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.7-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3.5 3.5l17 17"/>',
    // ---- info ----
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4"/><path d="M12 17.3h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
    warning: '<path d="M10.3 4.4a2 2 0 0 1 3.4 0l7.6 13.1A2 2 0 0 1 19.6 20.5H4.4a2 2 0 0 1-1.7-3z"/><path d="M12 9.5v4.5M12 17h.01"/>',
    tutorial: '<path d="M2 9.5L12 4.5l10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9.5V15"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h14v-4"/><path d="M9 7.5h7M9 11h5"/>',
    scroll: '<path d="M8 3.5h10.5a2 2 0 0 1 2 2v1.5h-4"/><path d="M16.5 5.5v13a2 2 0 0 1-2 2H6a2.5 2.5 0 0 1-2.5-2.5V17h10.5v1.5a2 2 0 0 0 2.5 2"/><path d="M8 3.5a2 2 0 0 0-2 2V17M9.5 8.5h4M9.5 12h4"/>',
    flag: '<path d="M5 21.5V3.5"/><path d="M5 4h12.5l-2.5 4.5 2.5 4.5H5"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5M19 6.5l1.5-1.5"/>',
    hourglass: '<path d="M6.5 2.5h11M6.5 21.5h11"/><path d="M7.5 2.5c0 5 9 6 9 9.5s-9 4.5-9 9.5M16.5 2.5c0 5-9 6-9 9.5s9 4.5 9 9.5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
    chart: '<path d="M4 20.5h16"/><path d="M7 16.5v-5M12 16.5V6.5M17 16.5v-8"/>',
    // ---- ressources ----
    gold: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    gem: '<path d="M6.5 4h11l3.5 5L12 20.5 3 9z"/><path d="M3 9h18"/><path d="M9.5 4L8.2 9 12 20.5 15.8 9 14.5 4"/>',
    xp: '<path d="M12 2.8l8.5 9.2-8.5 9.2L3.5 12z"/><path d="M8.5 13.5L12 10l3.5 3.5"/>',
    'level-up': '<path d="M12 3l7 7h-4.5v5h-5v-5H5z"/><path d="M8 18.5h8M9.5 21.5h5"/>',
    heart: '<path d="M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 6.7a4.5 4.5 0 0 1 8 2.8c0 6.1-8 11-8 11z"/>',
    'heart-fill': 'F|<path d="M12 21.2s-8.8-5.2-8.8-11.8A5 5 0 0 1 12 6.1a5 5 0 0 1 8.8 3.3c0 6.6-8.8 11.8-8.8 11.8z"/>',
    mana: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    potion: '<path d="M9.5 2.5h5M10.5 2.5v4.6a7 7 0 1 0 3 0V2.5"/><path d="M6.2 13.5h11.6"/><path d="M12 15.5v3M10.5 17h3"/>',
    'potion-mana': '<path d="M9.5 2.5h5M10.5 2.5v4.6a7 7 0 1 0 3 0V2.5"/><path d="M6.2 13.5h11.6"/><path d="M12 15.2s1.6 1.6 1.6 2.6a1.6 1.6 0 0 1-3.2 0c0-1 1.6-2.6 1.6-2.6z"/>',
    chest: '<path d="M3.5 10.5h17v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 10.5V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2.5"/><path d="M10.5 10.5V14h3v-3.5M8 4.4v6.1M16 4.4v6.1"/>',
    key: '<circle cx="8" cy="15.5" r="4.5"/><path d="M11.2 12.3L20.5 3M17 6.5l2.5 2.5M14.5 9l2 2"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5S10.5 3.5 8 4.2c-2 .6-1.2 4.3 4 4.3zM12 8.5s1.5-5 4-4.3c2 .6 1.2 4.3-4 4.3z"/>',
    rune: '<path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z"/><path d="M12 6.5v11M12 9l3.5-2M12 12.5L8.5 10.5M12 15l3.5 2"/>',
    sparkles: '<path d="M10 3l1.6 4.9 4.9 1.6-4.9 1.6L10 16l-1.6-4.9-4.9-1.6 4.9-1.6z"/><path d="M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z"/>',
    // ---- combat / armes ----
    sword: '<path d="M20.5 3.5L20 7.5 9.5 18 6 14.5 16.5 4z"/><path d="M4.8 13.2l6 6"/><path d="M7.2 16.8L3.5 20.5"/>',
    swords: '<path d="M14.5 17.5L3.5 6.5v-3h3l11 11"/><path d="M13 19l6-6M16 16l4 4"/><path d="M9.5 6.5l4-3h3v3l-3 4"/><path d="M5 13l6 6M8 16l-4 4"/>',
    dagger: '<path d="M19.5 4.5L19 8l-6.5 6.5-2.5-2.5L16.5 5z"/><path d="M8.5 11.5l4 4"/><path d="M10.5 13.5L5 19"/><circle cx="4.3" cy="19.7" r="1"/>',
    bow: '<path d="M10 3.5C3.5 6.5 3.5 17.5 10 20.5"/><path d="M10 3.5v17"/><path d="M5.5 12h16"/><path d="M18 8.5l3.5 3.5-3.5 3.5"/>',
    daggers: '<path d="M4 4l10.5 10.5M20 4L9.5 14.5"/><path d="M12.5 16.5l4-4M7.5 12.5l4 4"/><path d="M16 16l3.5 3.5M8 16l-3.5 3.5"/>',
    hook: '<circle cx="12" cy="4.6" r="1.8"/><path d="M12 6.4V19"/><path d="M5 13.2c0 4.2 3 7 7 7s7-2.8 7-7"/><path d="M5 13.2l-1.6 2.2M19 13.2l1.6 2.2"/><path d="M8.5 9.5h7"/>',
    summon: '<circle cx="12" cy="13" r="7.8"/><path d="M12 5.5l4.4 13.6-11.6-8.4h14.3L7.6 19.1z"/><path d="M12 1.8v1.8M5 3.6l1 1.4M19 3.6l-1 1.4"/>',
    wind: '<path d="M3 8c2.3-2.8 4.4 2.8 6.7 0s4.4-2.8 6.6 0c1.5 1.8 3.7 1.2 3.7-.8"/><path d="M3 13c2.3-2.8 4.4 2.8 6.7 0s4.4-2.8 6.6 0 4.7 2 4.7-.2"/><path d="M3 18c2.3-2.8 4.4 2.8 6.7 0 1.2-1.4 2.6-2 3.8-1.3"/>',
    chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    flame: '<path d="M12 21.5c-3 0-5.5-2.2-5.5-5.4 0-3.6 3.5-5.2 3.9-9.6 3 1.6 7.1 5.2 7.1 9.6 0 3.2-2.5 5.4-5.5 5.4z"/>',
    staff: '<path d="M5.5 21L15 11.5"/><circle cx="17.3" cy="6.7" r="3.2"/><path d="M17.3 1.8v.9M22.2 6.7h-.9M13.6 3l.7.7M21 10.4l-.7-.7"/>',
    shield: '<path d="M12 2.8l7.5 2.8v6c0 4.6-3.2 8-7.5 9.6-4.3-1.6-7.5-5-7.5-9.6v-6z"/><path d="M8.5 10.5l3.5 2.5 3.5-2.5"/>',
    dash: '<path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h7"/>',
    tornado: '<path d="M3 4.5h18M5 8.5h13.5M7.5 12.5h9M9.5 16.5h5.5M11 20.5h2.5"/>',
    fire: '<path d="M12 21.5c-3.9 0-7-2.7-7-6.5 0-3.4 2.4-5.4 3.6-8.4.5 2 1.6 3 2.6 3.4.3-3.4 1.8-5.9 4-7.5-.3 3 1 5 2.4 6.8 1.1 1.4 1.4 3.1 1.4 5.2 0 4.1-3.1 7-7 7z"/><path d="M12 21.5c-1.7 0-3-1.2-3-2.9 0-2 1.6-2.8 2.4-4.6 1.4 1.3 3.6 2.4 3.6 4.6 0 1.7-1.3 2.9-3 2.9z"/>',
    ice: '<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/><path d="M9.5 4.2L12 6.5l2.5-2.3M9.5 19.8l2.5-2.3 2.5 2.3"/>',
    lightning: '<path d="M13.5 2.5L4.5 13.5h6.5l-1 8 9-11h-6.5z"/>',
    shadow: '<path d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.8-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8z"/><path d="M9.5 11h.01M14.5 11h.01"/>',
    holy: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    poison: '<path d="M12 21a6 6 0 0 1-6-6c0-4 6-11.5 6-11.5s6 7.5 6 11.5a6 6 0 0 1-6 6z"/><path d="M10 14.5h.01M14 14.5h.01M10.5 17.5h3"/>',
    skull: '<path d="M12 2.8c-4.6 0-8 3.2-8 7.6 0 2.6 1.2 4.4 3 5.5v3.6h10v-3.6c1.8-1.1 3-2.9 3-5.5 0-4.4-3.4-7.6-8-7.6z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 19.5v-2M14 19.5v-2"/>',
    crown: '<path d="M3.5 7.5l4.2 4L12 5l4.3 6.5 4.2-4-1.5 11H5z"/><path d="M5 21h14"/>',
    target2: '<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    // ---- lieux / systèmes ----
    portal: '<ellipse cx="12" cy="12" rx="6" ry="9"/><path d="M12 7.5a3 4.5 0 0 1 3 4.5M12 16.5a3 4.5 0 0 1-3-4.5"/><path d="M3 12h1.5M19.5 12H21M5 5.5l1 1M18 17.5l1 1M19 5.5l-1 1M6 17.5l-1 1"/>',
    map: '<path d="M3.5 6l5.5-2.5 6 2.5 5.5-2.5v14.5L15 20.5l-6-2.5-5.5 2.5z"/><path d="M9 3.5V18M15 6v14.5"/>',
    tent: '<path d="M12 4L2.5 20.5h19z"/><path d="M12 4l-1.6-2M12 4l1.6-2M9 20.5l3-6 3 6"/>',
    door: '<path d="M5.5 21V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v17M3 21h18"/><path d="M15 12h.01"/>',
    bag: '<path d="M5 9.5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 6.5V5a3 3 0 0 1 6 0v1.5M5 13h14M10.5 13v2.5h3V13"/>',
    anvil: '<path d="M3 6.5h13c0 2.6 2.4 3.6 5 3.6v1.4c-3 0-4.6 1.3-5 3.5H8.5C8.3 12.8 6.3 11 3 10.3z"/><path d="M9.5 15l-2 5.5h9l-2-5.5"/>',
    hammer: '<path d="M13.5 2.5l8 8-3 3-8-8z"/><path d="M12.5 9.5l-8.7 8.7a1.8 1.8 0 0 0 2.5 2.5L15 12"/>',
    trophy: '<path d="M7 3.5h10v5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4V7a3 3 0 0 0 3 3M17 5.5h3V7a3 3 0 0 1-3 3"/><path d="M12 13.5v4M9 17.5h6v3.5H9z"/>',
    medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.7L5.5 3h4l2.5 5 2.5-5h4l-3 7.7"/><path d="M12 12.6l.9 1.7 1.9.3-1.4 1.3.3 1.9-1.7-.9-1.7.9.3-1.9-1.4-1.3 1.9-.3z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.2a6.5 6.5 0 0 1 4 5.8"/>',
    army: '<path d="M6 21V8.5M12 21V5.5M18 21V8.5"/><path d="M4.5 9.5L6 5l1.5 4.5M10.5 6.5L12 2l1.5 4.5M16.5 9.5L18 5l1.5 4.5"/><path d="M3.5 16h17"/>',
    shop: '<path d="M3.5 9.5L5 4h14l1.5 5.5"/><path d="M3.5 9.5a2.8 2.8 0 0 0 5.7 0 2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.7 0"/><path d="M5 12v8.5h14V12M10 20.5v-5h4v5"/>',
    cart: '<path d="M2.5 3.5H5l2.4 11.5h11l2-8H6"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2 0-1.5-1.5-1.8-1.5-3.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.3 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    shirt: '<path d="M8.5 3.5L3.5 6.5l2 4.5 2.5-1v10.5h8V10l2.5 1 2-4.5-5-3c-.5 1.5-1.8 2.5-3.5 2.5S9 5 8.5 3.5z"/>',
    // ---- audio / appareil / contrôles ----
    'sound-on': '<path d="M4 9.5h3.5L12.5 5v14l-5-4.5H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.6 6.4a7.6 7.6 0 0 1 0 11.2"/>',
    'sound-off': '<path d="M4 9.5h3.5L12.5 5v14l-5-4.5H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
    music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    vibrate: '<rect x="7.5" y="3.5" width="9" height="17" rx="2"/><path d="M4.5 8v8M19.5 8v8M2 10.5v3M22 10.5v3"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8.5 20.5h7M12 16.5v4"/>',
    gamepad: '<path d="M7 7.5h10a5 5 0 0 1 4.9 6l-.8 3.9a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-2.3 2.5a2.5 2.5 0 0 1-4.3-1.1l-.8-3.9A5 5 0 0 1 7 7.5z"/><path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.5h.01M18 12.5h.01M9.5 12.5h5M7.5 15.3h9"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3.5"/>',
    touch: '<path d="M9 11V5a1.8 1.8 0 0 1 3.6 0v5.5"/><path d="M12.6 10V8.7a1.8 1.8 0 0 1 3.6 0V11M16.2 10.5a1.8 1.8 0 0 1 3.3 1V15a6.5 6.5 0 0 1-6.5 6.5h-1.2A6 6 0 0 1 7 18.9l-3-4.5a1.7 1.7 0 0 1 2.7-2L9 15"/>',
    joystick: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V14a7.5 7.5 0 0 1-7.5 7.5h-.7a6.3 6.3 0 0 1-5.1-2.6L4 15.3a1.6 1.6 0 0 1 2.5-2L8 15"/>',
    power: '<path d="M12 3v8"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>',
    bolt: '<path d="M13.5 2.5L4.5 13.5h6.5l-1 8 9-11h-6.5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    heartbeat: '<path d="M3 12h4l2-4 3 9 2.5-7 1.5 2h5"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    ghost: '<path d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.8-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8z"/><path d="M9.5 11h.01M14.5 11h.01"/>',
  };
  // Alias (noms alternatifs)
  const ALIAS = {
    gear: 'settings', cog: 'settings', x: 'close', ok: 'check', coin: 'gold', coins: 'gold', crystal: 'gem', diamond: 'gem',
    hp: 'heart', life: 'heart', mp: 'mana', drop: 'mana', flask: 'potion', 'potion-heal': 'potion', loot: 'gift', boss: 'crown',
    roll: 'dash', ultimate: 'tornado', super: 'tornado', frost: 'ice', glace: 'ice', feu: 'fire', foudre: 'lightning',
    ombre: 'shadow', sacre: 'holy', physique: 'sword', camp: 'tent', inventory: 'bag', backpack: 'bag', forge: 'anvil', 'sound': 'sound-on',
    mute: 'sound-off', stats: 'chart', achievements: 'trophy', hero: 'user', talents: 'rune', skills: 'sparkles', exit2: 'exit', quit: 'exit',
    rank: 'medal', time: 'timer', kill: 'skull', kills: 'skull', damage: 'swords', credits: 'scroll', new: 'plus', save: 'check',
  };
  const resolve = n => { n = String(n == null ? '' : n).trim().toLowerCase(); return P[n] ? n : (ALIAS[n] && P[ALIAS[n]] ? ALIAS[n] : null); };
  const escA = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function svg(name, opts) {
    const k = resolve(name);
    if (!k) return '';
    opts = opts || {};
    const size = opts.size == null ? 20 : opts.size;
    const raw = P[k];
    const filled = raw.startsWith('F|');
    const body = filled ? raw.slice(2) : raw;
    const sw = opts.stroke == null ? 2 : opts.stroke;
    const paint = filled ? 'fill="currentColor" stroke="none"' : `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
    const title = opts.title ? `<title>${escA(opts.title)}</title>` : '';
    const aria = opts.title ? `role="img" aria-label="${escA(opts.title)}"` : 'aria-hidden="true"';
    return `<svg class="ds-ico ds-ico--${k}${opts.cls ? ' ' + escA(opts.cls) : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint} ${aria} focusable="false">${title}${body}</svg>`;
  }
  function el(name, opts) {
    const s = svg(name, opts);
    if (!s) return null;
    const t = document.createElement('template');
    t.innerHTML = s;
    return t.content.firstChild;
  }
  G.Icons = {
    svg, el,
    has: name => !!resolve(name),
    list: () => Object.keys(P),
    aliases: () => Object.assign({}, ALIAS),
    /** icône SVG si elle existe, sinon le texte de secours échappé (emoji…) */
    or(name, fallback, opts) { const s = svg(name, opts); return s || escA(fallback == null ? '' : fallback); },
  };
})();
