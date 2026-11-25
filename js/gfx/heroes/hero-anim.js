window.G = window.G || {};
/* =====================================================================
 *  v6 — hero-anim.js (A5 Animation) — G.HeroAnim
 *  Animateur procédural du squelette v6 (CONTRACT-V6 §1 / §5).
 *    G.HeroAnim.init(root, spec)            : prépare l'état (appelé par heroes.js)
 *    G.HeroAnim.update(root, time, st)      : une image (st = { moving, windup, attack })
 *    G.HeroAnim.trigger(root, name, data)   : 'attack','cast','skill','ultimate','dash','hit','victory','defeat','spawn','idle'
 *  Branchement : chaîne G.GFX.animateCharacter (userData.hero6 → ici, sinon fonction précédente).
 *  Bus : UN seul abonnement global (skillCast, playerHit, runEnd, heroCreated) ; l'état vit dans
 *  root.userData._ha (libéré avec le héros : aucune référence globale vers un héros → pas de fuite).
 *  Aperçus hors jeu (sélection de classe, personnalisation) : personne n'appelle animateCharacter →
 *  auto-animation via onBeforeRender d'une mesh du héros (chaînée avec l'existant).
 *  Aucune allocation par image (tampons Float32Array préalloués), robuste à dt = 0 et aux NaN.
 *  Conventions (identiques à graphics.js) : regard +Z, L = +X ; x < 0 sur bras/cuisse = vers l'avant ;
 *  x > 0 sur tibia = flexion du genou ; x < 0 sur avant-bras = flexion du coude ; x > 0 sur buste = penché en avant.
 * ===================================================================== */
(function () {
  'use strict';
  const G = window.G;
  const PI = Math.PI, TAU = PI * 2;

  // ------------------------------------------------------------------ os et canaux
  const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'browL', 'browR', 'lidL', 'lidR', 'mouth',
    'shoulderL', 'shoulderR', 'armL', 'armR', 'forearmL', 'forearmR', 'wristL', 'wristR', 'weaponL', 'weaponR',
    'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'capeA', 'capeB', 'capeC', 'hairA', 'hairB', 'back', 'beltL', 'beltR'];
  const NB = BONES.length;
  const B = {}; BONES.forEach((n, i) => { B[n] = i; });
  const POS = NB * 3;            // canaux 3 : position des hanches (fraction de longueur de jambe)
  const RIG = POS + 3;           // canaux 2 : inclinaison du rig (x, z) pivot aux pieds
  const N = RIG + 2;
  const LOWER = { hips: 1, legL: 1, legR: 1, shinL: 1, shinR: 1, footL: 1, footR: 1 };
  const FACE = { jaw: 1, browL: 1, browR: 1, lidL: 1, lidR: 1, mouth: 1 };
  const SEC = { capeA: 1, capeB: 1, capeC: 1, hairA: 1, hairB: 1, beltL: 1, beltR: 1 };

  // ------------------------------------------------------------------ utilitaires
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fin = (v, d) => (typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity ? v : d);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
  // bruit lisse déterministe (somme de sinus incommensurables)
  const noise = (t, s) => Math.sin(t * 1.13 + s) * 0.5 + Math.sin(t * 2.31 + s * 1.7) * 0.3 + Math.sin(t * 4.07 + s * 2.9) * 0.2;
  // petit aléa par héros (sans Math.random par image : xorshift sur l'état)
  function rnd(S) { let x = S.seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; S.seed = x; return ((x >>> 0) % 100000) / 100000; }

  // ------------------------------------------------------------------ styles d'animation
  // stance : écart des pieds (rad) ; knee : flexion au repos ; arm : écart des bras ; fore : coude au repos
  // swing : amplitude du balancier ; twist : rotation épaules/bassin ; bob : rebond ; breath : période (s) ;
  // hunch : buste penché ; chin : tête (x<0 = menton levé) ; sway : balancement ; fidget : intervalle (s)
  const STYLES = {
    heavy:  { stance: 0.13, knee: 0.10, arm: 0.16, fore: -0.25, swing: 0.75, twist: 0.16, bob: 1.0, breath: 4.2, hunch: 0.04, chin: -0.02, sway: 0.8, fidget: [4, 6], gaze: 0.8, walkMul: 0.95, lean: 1.0 },
    agile:  { stance: 0.10, knee: 0.24, arm: 0.12, fore: -0.75, swing: 1.05, twist: 0.22, bob: 1.25, breath: 3.0, hunch: 0.10, chin: 0.02, sway: 1.2, fidget: [4, 6], gaze: 1.4, walkMul: 1.1, lean: 1.3 },
    caster: { stance: 0.07, knee: 0.05, arm: 0.12, fore: -0.45, swing: 0.6, twist: 0.12, bob: 0.8, breath: 4.6, hunch: 0.0, chin: -0.04, sway: 1.0, fidget: [4, 6], gaze: 1.0, walkMul: 0.95, lean: 0.8 },
    ranger: { stance: 0.09, knee: 0.12, arm: 0.10, fore: -0.35, swing: 0.9, twist: 0.18, bob: 1.0, breath: 3.8, hunch: 0.05, chin: 0.0, sway: 1.1, fidget: [4, 6], gaze: 1.6, walkMul: 1.05, lean: 1.1 },
    noble:  { stance: 0.08, knee: 0.04, arm: 0.10, fore: -0.3, swing: 0.6, twist: 0.12, bob: 0.8, breath: 4.4, hunch: -0.04, chin: -0.08, sway: 0.6, fidget: [4, 6], gaze: 0.7, walkMul: 0.95, lean: 0.8 },
    dread:  { stance: 0.09, knee: 0.10, arm: 0.14, fore: -0.4, swing: 0.55, twist: 0.10, bob: 0.7, breath: 5.0, hunch: 0.14, chin: 0.10, sway: 1.4, fidget: [4, 6], gaze: 0.6, walkMul: 0.9, lean: 0.9 },
  };
  const CLASS_DEF = {
    Guerrier: ['heavy', 'sword'], Mage: ['caster', 'staff'], Voleur: ['agile', 'throw'], Assassin: ['agile', 'twin'],
    Archer: ['ranger', 'bow'], Paladin: ['noble', 'mace'], Elementaliste: ['caster', 'scepter'], Necromancien: ['dread', 'scythe'],
  };

  // ------------------------------------------------------------------ poses (offsets par rapport au repos)
  // Écrites pour le côté droit (arme en main droite) ; mirror() échange L/R (y et z inversés).
  function mirrorPose(p) {
    const o = {};
    for (const k in p) {
      const v = p[k];
      let n = k;
      if (k.endsWith('L')) n = k.slice(0, -1) + 'R'; else if (k.endsWith('R')) n = k.slice(0, -1) + 'L';
      o[n] = k === 'pos' ? [-v[0], v[1], v[2]] : (k === 'rig' ? [v[0], -v[1]] : [v[0], -v[1], -v[2]]);
    }
    return o;
  }
  function poseBuf(p) {
    const a = new Float32Array(N), m = new Float32Array(NB);
    for (const k in p) {
      const v = p[k];
      if (k === 'pos') { a[POS] = v[0]; a[POS + 1] = v[1]; a[POS + 2] = v[2]; m[B.hips] = 1; continue; }
      if (k === 'rig') { a[RIG] = v[0]; a[RIG + 1] = v[1]; continue; }
      const i = B[k]; if (i == null) continue;
      a[i * 3] = v[0] || 0; a[i * 3 + 1] = v[1] || 0; a[i * 3 + 2] = v[2] || 0; m[i] = 1;
    }
    return { a, m };
  }
  // garde au bouclier (bras gauche) commune aux armes à bouclier
  const SHIELD = { armL: [-0.5, -0.15, 0.3], forearmL: [-1.35, 0, 0], wristL: [0, 0, 0] };
  const withShield = (p) => Object.assign({}, SHIELD, p);

  // clips d'attaque : keys = [u, pose, ease] ; ease : 0 lisse, 1 rapide (décélère : frappe), 2 dépassement
  const ATTACKS = {
    sword: [
      { dur: 0.42, keys: [
        [0.00, withShield({ chest: [0.02, -0.35, 0], spine: [0, -0.15, 0], armR: [-0.5, -0.4, -1.0], forearmR: [-0.9, 0, 0], wristR: [-0.4, 0, 0], head: [0, 0.25, 0] }), 0],
        [0.26, withShield({ chest: [0.04, -0.7, 0], spine: [0, -0.25, 0], armR: [-0.7, -0.5, -1.3], forearmR: [-1.0, 0, 0], wristR: [-0.6, 0, 0], head: [0, 0.45, 0], pos: [0, -0.03, -0.02], legR: [0.15, 0, -0.05], legL: [-0.25, 0, 0.05], shinL: [0.25, 0, 0], shinR: [0.2, 0, 0] }), 0],
        [0.48, withShield({ chest: [0.1, 0.65, 0], spine: [0.05, 0.25, 0], armR: [-0.35, 1.5, -1.25], forearmR: [-0.12, 0, 0], wristR: [0.3, 0, 0], head: [0.05, -0.4, 0], pos: [0, -0.05, 0.06], legL: [-0.55, 0, 0.06], shinL: [0.45, 0, 0], legR: [0.35, 0, -0.06], shinR: [0.15, 0, 0] }), 1],
        [0.62, withShield({ chest: [0.08, 0.55, 0], spine: [0.04, 0.2, 0], armR: [-0.4, 1.35, -1.2], forearmR: [-0.2, 0, 0], wristR: [0.2, 0, 0], head: [0.05, -0.35, 0], pos: [0, -0.05, 0.06], legL: [-0.55, 0, 0.06], shinL: [0.45, 0, 0], legR: [0.35, 0, -0.06], shinR: [0.15, 0, 0] }), 2],
      ] },
      { dur: 0.42, keys: [
        [0.00, withShield({ chest: [0.02, 0.3, 0], armR: [-0.6, 1.2, -1.0], forearmR: [-1.0, 0, 0], head: [0, -0.2, 0] }), 0],
        [0.26, withShield({ chest: [0.05, 0.6, 0], spine: [0, 0.2, 0], armR: [-0.7, 1.75, -0.9], forearmR: [-1.45, 0, 0], wristR: [-0.3, 0, 0], head: [0, -0.4, 0], pos: [0, -0.03, 0], shinL: [0.2, 0, 0], shinR: [0.2, 0, 0] }), 0],
        [0.48, withShield({ chest: [0.1, -0.65, 0], spine: [0.04, -0.25, 0], armR: [-0.35, -0.6, -1.35], forearmR: [-0.15, 0, 0], wristR: [0.25, 0, 0], head: [0.05, 0.45, 0], pos: [0, -0.05, 0.05], legR: [-0.5, 0, -0.05], shinR: [0.45, 0, 0], legL: [0.3, 0, 0.05], shinL: [0.15, 0, 0] }), 1],
        [0.62, withShield({ chest: [0.08, -0.55, 0], spine: [0.03, -0.2, 0], armR: [-0.4, -0.45, -1.3], forearmR: [-0.22, 0, 0], wristR: [0.15, 0, 0], head: [0.05, 0.4, 0], pos: [0, -0.05, 0.05], legR: [-0.5, 0, -0.05], shinR: [0.45, 0, 0], legL: [0.3, 0, 0.05], shinL: [0.15, 0, 0] }), 2],
      ] },
      { dur: 0.52, heavy: 1, keys: [
        [0.00, withShield({ chest: [-0.1, -0.15, 0], armR: [-2.2, 0, -0.35], forearmR: [-1.0, 0, 0], wristR: [-0.3, 0, 0], head: [-0.1, 0.1, 0] }), 0],
        [0.32, withShield({ chest: [-0.22, -0.2, 0], spine: [-0.08, 0, 0], armR: [-2.85, 0.1, -0.3], forearmR: [-1.2, 0, 0], wristR: [-0.5, 0, 0], head: [-0.15, 0.12, 0], pos: [0, 0.01, -0.02], shinL: [0.1, 0, 0], shinR: [0.1, 0, 0] }), 0],
        [0.50, withShield({ chest: [0.42, 0.1, 0], spine: [0.15, 0, 0], armR: [-0.75, 0.15, -0.15], forearmR: [-0.1, 0, 0], wristR: [0.45, 0, 0], head: [0.15, -0.05, 0], pos: [0, -0.12, 0.08], legL: [-0.75, 0, 0.08], shinL: [0.85, 0, 0], footL: [-0.1, 0, 0], legR: [0.45, 0, -0.08], shinR: [0.5, 0, 0] }), 1],
        [0.66, withShield({ chest: [0.38, 0.08, 0], spine: [0.13, 0, 0], armR: [-0.7, 0.15, -0.15], forearmR: [-0.15, 0, 0], wristR: [0.35, 0, 0], head: [0.12, -0.05, 0], pos: [0, -0.11, 0.08], legL: [-0.75, 0, 0.08], shinL: [0.85, 0, 0], footL: [-0.1, 0, 0], legR: [0.45, 0, -0.08], shinR: [0.5, 0, 0] }), 2],
      ] },
    ],
    twin: [
      { dur: 0.3, keys: [
        [0.00, { chest: [0.06, -0.25, 0], armR: [0.15, 0, -0.2], forearmR: [-1.6, 0, 0], armL: [-0.55, 0, 0.2], forearmL: [-1.5, 0, 0] }, 0],
        [0.22, { chest: [0.1, -0.4, 0], armR: [0.35, 0, -0.25], forearmR: [-1.95, 0, 0], wristR: [-0.3, 0, 0], armL: [-0.6, 0, 0.2], forearmL: [-1.6, 0, 0], pos: [0, -0.05, 0], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0] }, 0],
        [0.45, { chest: [0.18, 0.35, 0], spine: [0.06, 0.15, 0], armR: [-1.45, 0.1, -0.1], forearmR: [-0.1, 0, 0], wristR: [0.15, 0, 0], armL: [-0.3, 0, 0.3], forearmL: [-1.7, 0, 0], head: [0.05, -0.25, 0], pos: [0, -0.08, 0.1], legR: [-0.6, 0, 0], shinR: [0.6, 0, 0], legL: [0.4, 0, 0], shinL: [0.35, 0, 0] }, 1],
        [0.6, { chest: [0.16, 0.3, 0], spine: [0.05, 0.12, 0], armR: [-1.35, 0.1, -0.1], forearmR: [-0.2, 0, 0], armL: [-0.3, 0, 0.3], forearmL: [-1.65, 0, 0], head: [0.05, -0.22, 0], pos: [0, -0.08, 0.1], legR: [-0.6, 0, 0], shinR: [0.6, 0, 0], legL: [0.4, 0, 0], shinL: [0.35, 0, 0] }, 2],
      ], alt: 1 },
    ],
    throw: [
      { dur: 0.34, keys: [
        [0.00, { chest: [-0.02, -0.3, 0], armR: [-1.9, 0, -0.5], forearmR: [-1.3, 0, 0], armL: [-0.6, 0, 0.25], forearmL: [-1.0, 0, 0] }, 0],
        [0.25, { chest: [-0.1, -0.5, 0], spine: [-0.04, -0.15, 0], armR: [-2.4, -0.1, -0.55], forearmR: [-1.7, 0, 0], wristR: [-0.5, 0, 0], armL: [-1.1, 0, 0.3], forearmL: [-0.4, 0, 0], head: [0, 0.35, 0], pos: [0, -0.03, -0.02], shinL: [0.2, 0, 0], shinR: [0.25, 0, 0] }, 0],
        [0.48, { chest: [0.2, 0.4, 0], spine: [0.06, 0.15, 0], armR: [-1.1, 0.25, -0.15], forearmR: [-0.05, 0, 0], wristR: [0.5, 0, 0], armL: [0.2, 0, 0.3], forearmL: [-0.9, 0, 0], head: [0.05, -0.3, 0], pos: [0, -0.06, 0.06], legR: [-0.45, 0, 0], shinR: [0.4, 0, 0], legL: [0.35, 0, 0], shinL: [0.2, 0, 0] }, 1],
        [0.62, { chest: [0.17, 0.35, 0], spine: [0.05, 0.12, 0], armR: [-1.0, 0.25, -0.15], forearmR: [-0.15, 0, 0], wristR: [0.35, 0, 0], armL: [0.15, 0, 0.3], forearmL: [-0.9, 0, 0], head: [0.05, -0.28, 0], pos: [0, -0.06, 0.06], legR: [-0.45, 0, 0], shinR: [0.4, 0, 0], legL: [0.35, 0, 0], shinL: [0.2, 0, 0] }, 2],
      ], alt: 1 },
    ],
    bow: [
      { dur: 0.46, keys: [
        [0.00, { chest: [0.02, -0.45, 0], head: [0, 0.45, 0], armL: [-0.4, -0.5, 1.2], forearmL: [-0.3, 0, 0], wristL: [0, 0.8, 0], armR: [-0.4, -0.2, -1.2], forearmR: [-1.6, 0, 0] }, 0],
        [0.24, { chest: [0.02, -0.85, 0], spine: [0, -0.2, 0], head: [-0.03, 0.95, 0], armL: [-0.05, -0.75, 1.5], forearmL: [-0.04, 0, 0], wristL: [0, 1.5, 0], armR: [-0.15, -0.55, -1.45], forearmR: [-2.35, 0, 0], wristR: [0.2, 0, 0], legL: [-0.15, 0, 0.12], legR: [0.1, 0, -0.12], pos: [0, -0.02, 0] }, 0],
        [0.36, { chest: [0.02, -0.85, 0], spine: [0, -0.2, 0], head: [-0.03, 0.95, 0], armL: [-0.05, -0.75, 1.5], forearmL: [-0.04, 0, 0], wristL: [0, 1.5, 0], armR: [-0.15, -0.62, -1.45], forearmR: [-2.4, 0, 0], wristR: [0.2, 0, 0], legL: [-0.15, 0, 0.12], legR: [0.1, 0, -0.12], pos: [0, -0.02, 0] }, 0],
        [0.48, { chest: [0.0, -0.8, 0], spine: [0, -0.2, 0], head: [-0.05, 0.9, 0], armL: [-0.1, -0.7, 1.45], forearmL: [-0.05, 0, 0], wristL: [0, 1.5, 0], armR: [0.1, -1.0, -1.3], forearmR: [-1.1, 0, 0], wristR: [-0.4, 0, 0], legL: [-0.15, 0, 0.12], legR: [0.1, 0, -0.12], pos: [0, -0.02, 0] }, 1],
      ] },
    ],
    staff: [
      { dur: 0.46, keys: [
        [0.00, { chest: [0.0, -0.2, 0], armR: [-0.45, 0, -0.15], forearmR: [-0.9, 0, 0], armL: [-0.5, 0, 0.15], forearmL: [-1.5, 0, 0], wristL: [-0.3, 0, 0] }, 0],
        [0.28, { chest: [-0.08, -0.35, 0], spine: [-0.03, -0.1, 0], armR: [-0.6, 0, -0.2], forearmR: [-1.1, 0, 0], armL: [-0.35, 0, 0.25], forearmL: [-1.9, 0, 0], wristL: [-0.4, 0, 0], head: [-0.05, 0.2, 0], pos: [0, -0.02, -0.02], shinL: [0.1, 0, 0], shinR: [0.15, 0, 0] }, 0],
        [0.48, { chest: [0.14, 0.3, 0], spine: [0.05, 0.1, 0], armR: [-1.05, 0.1, -0.2], forearmR: [-0.5, 0, 0], armL: [-1.5, 0.1, 0.05], forearmL: [-0.08, 0, 0], wristL: [-0.9, 0, 0], head: [0.04, -0.2, 0], pos: [0, -0.04, 0.05], legL: [-0.4, 0, 0], shinL: [0.35, 0, 0], legR: [0.25, 0, 0], shinR: [0.15, 0, 0] }, 1],
        [0.64, { chest: [0.12, 0.25, 0], spine: [0.04, 0.08, 0], armR: [-1.0, 0.1, -0.2], forearmR: [-0.55, 0, 0], armL: [-1.4, 0.1, 0.05], forearmL: [-0.15, 0, 0], wristL: [-0.7, 0, 0], head: [0.04, -0.18, 0], pos: [0, -0.04, 0.05], legL: [-0.4, 0, 0], shinL: [0.35, 0, 0], legR: [0.25, 0, 0], shinR: [0.15, 0, 0] }, 2],
      ] },
    ],
    scepter: [
      { dur: 0.44, keys: [
        [0.00, { chest: [-0.02, -0.2, 0], armR: [-1.6, 0, -0.3], forearmR: [-1.0, 0, 0], armL: [-0.3, 0, 0.6], forearmL: [-0.8, 0, 0] }, 0],
        [0.28, { chest: [-0.12, -0.35, 0], armR: [-2.4, 0, -0.35], forearmR: [-1.1, 0, 0], wristR: [-0.4, 0, 0], armL: [-0.5, 0, 0.9], forearmL: [-0.5, 0, 0], wristL: [-0.6, 0, 0], head: [-0.08, 0.2, 0], pos: [0, -0.02, 0], shinL: [0.12, 0, 0], shinR: [0.12, 0, 0] }, 0],
        [0.48, { chest: [0.15, 0.25, 0], spine: [0.05, 0.08, 0], armR: [-1.5, 0.1, -0.05], forearmR: [-0.05, 0, 0], wristR: [0.35, 0, 0], armL: [0.1, 0, 0.75], forearmL: [-0.4, 0, 0], wristL: [-0.5, 0, 0], head: [0.03, -0.15, 0], pos: [0, -0.05, 0.05], legR: [-0.4, 0, 0], shinR: [0.35, 0, 0], legL: [0.25, 0, 0], shinL: [0.15, 0, 0] }, 1],
        [0.64, { chest: [0.12, 0.2, 0], spine: [0.04, 0.06, 0], armR: [-1.42, 0.1, -0.05], forearmR: [-0.12, 0, 0], wristR: [0.25, 0, 0], armL: [0.05, 0, 0.7], forearmL: [-0.45, 0, 0], head: [0.03, -0.13, 0], pos: [0, -0.05, 0.05], legR: [-0.4, 0, 0], shinR: [0.35, 0, 0], legL: [0.25, 0, 0], shinL: [0.15, 0, 0] }, 2],
      ] },
    ],
    mace: [
      { dur: 0.5, keys: [
        [0.00, withShield({ chest: [-0.05, -0.3, 0], armR: [-2.0, -0.1, -0.5], forearmR: [-1.0, 0, 0], head: [0, 0.2, 0] }), 0],
        [0.3, withShield({ chest: [-0.15, -0.45, 0], spine: [-0.05, -0.12, 0], armR: [-2.65, -0.15, -0.6], forearmR: [-1.25, 0, 0], wristR: [-0.4, 0, 0], head: [-0.08, 0.3, 0], pos: [0, -0.02, -0.02], shinL: [0.15, 0, 0], shinR: [0.15, 0, 0] }), 0],
        [0.5, withShield({ chest: [0.35, 0.35, 0], spine: [0.12, 0.12, 0], armR: [-0.65, 0.55, -0.1], forearmR: [-0.15, 0, 0], wristR: [0.45, 0, 0], head: [0.1, -0.25, 0], pos: [0, -0.1, 0.07], legL: [-0.65, 0, 0.06], shinL: [0.7, 0, 0], legR: [0.4, 0, -0.06], shinR: [0.4, 0, 0] }), 1],
        [0.66, withShield({ chest: [0.3, 0.3, 0], spine: [0.1, 0.1, 0], armR: [-0.62, 0.5, -0.12], forearmR: [-0.22, 0, 0], wristR: [0.35, 0, 0], head: [0.08, -0.22, 0], pos: [0, -0.09, 0.07], legL: [-0.65, 0, 0.06], shinL: [0.7, 0, 0], legR: [0.4, 0, -0.06], shinR: [0.4, 0, 0] }), 2],
      ] },
      { dur: 0.46, keys: [   // coup de bouclier
        [0.00, { chest: [0.0, 0.25, 0], armL: [-0.6, -0.2, 0.3], forearmL: [-1.4, 0, 0], armR: [0.2, 0, -0.3], forearmR: [-0.6, 0, 0] }, 0],
        [0.28, { chest: [-0.05, 0.45, 0], spine: [0, 0.15, 0], armL: [-0.35, -0.3, 0.4], forearmL: [-1.7, 0, 0], armR: [0.3, 0, -0.35], forearmR: [-0.7, 0, 0], head: [0, -0.3, 0], pos: [0, -0.04, -0.03], shinL: [0.25, 0, 0], shinR: [0.25, 0, 0] }, 0],
        [0.48, { chest: [0.25, -0.35, 0], spine: [0.1, -0.12, 0], armL: [-1.45, 0.1, 0.1], forearmL: [-0.35, 0, 0], armR: [0.35, 0, -0.3], forearmR: [-0.8, 0, 0], head: [0.05, 0.25, 0], pos: [0, -0.08, 0.1], legL: [-0.6, 0, 0], shinL: [0.55, 0, 0], legR: [0.45, 0, 0], shinR: [0.3, 0, 0] }, 1],
        [0.64, { chest: [0.22, -0.3, 0], spine: [0.08, -0.1, 0], armL: [-1.35, 0.1, 0.12], forearmL: [-0.45, 0, 0], armR: [0.3, 0, -0.3], forearmR: [-0.8, 0, 0], head: [0.05, 0.22, 0], pos: [0, -0.08, 0.1], legL: [-0.6, 0, 0], shinL: [0.55, 0, 0], legR: [0.45, 0, 0], shinR: [0.3, 0, 0] }, 2],
      ] },
    ],
    scythe: [
      { dur: 0.56, keys: [
        [0.00, { chest: [0.02, -0.5, 0], spine: [0, -0.2, 0], armR: [-0.7, -0.4, -0.9], forearmR: [-0.8, 0, 0], armL: [-0.9, -0.6, 0.1], forearmL: [-1.0, 0, 0], head: [0, 0.4, 0] }, 0],
        [0.3, { chest: [0.05, -0.85, 0], spine: [0.02, -0.3, 0], armR: [-0.8, -0.6, -1.05], forearmR: [-0.9, 0, 0], armL: [-1.0, -0.9, 0.05], forearmL: [-1.15, 0, 0], head: [0, 0.6, 0], pos: [0, -0.06, -0.02], legL: [-0.2, 0, 0.1], shinL: [0.35, 0, 0], legR: [0.15, 0, -0.1], shinR: [0.3, 0, 0] }, 0],
        [0.52, { chest: [0.15, 0.8, 0], spine: [0.06, 0.3, 0], armR: [-0.5, 1.2, -1.0], forearmR: [-0.3, 0, 0], armL: [-1.1, 0.5, 0.2], forearmL: [-0.6, 0, 0], head: [0.05, -0.55, 0], pos: [0, -0.1, 0.05], legL: [-0.6, 0, 0.12], shinL: [0.6, 0, 0], legR: [0.4, 0, -0.12], shinR: [0.3, 0, 0] }, 1],
        [0.68, { chest: [0.13, 0.7, 0], spine: [0.05, 0.25, 0], armR: [-0.55, 1.1, -1.0], forearmR: [-0.35, 0, 0], armL: [-1.05, 0.45, 0.2], forearmL: [-0.65, 0, 0], head: [0.05, -0.5, 0], pos: [0, -0.1, 0.05], legL: [-0.6, 0, 0.12], shinL: [0.6, 0, 0], legR: [0.4, 0, -0.12], shinR: [0.3, 0, 0] }, 2],
      ] },
    ],
  };
  // incantations (compétences) par famille d'arme
  const CASTS = {
    caster: { dur: 0.62, keys: [
      [0.00, { chest: [0.05, 0, 0], armL: [-0.5, 0, 0.3], forearmL: [-1.6, 0, 0], armR: [-0.5, 0, -0.3], forearmR: [-1.4, 0, 0], head: [0.1, 0, 0] }, 0],
      [0.3, { chest: [0.12, 0, 0], spine: [0.05, 0, 0], armL: [-0.35, 0, 0.35], forearmL: [-2.0, 0, 0], wristL: [-0.3, 0, 0], armR: [-0.4, 0, -0.35], forearmR: [-1.6, 0, 0], head: [0.18, 0, 0], pos: [0, -0.07, -0.02], shinL: [0.35, 0, 0], shinR: [0.35, 0, 0], legL: [-0.15, 0, 0], legR: [-0.15, 0, 0] }, 0],
      [0.5, { chest: [-0.2, 0, 0], spine: [-0.06, 0, 0], armL: [-1.7, -0.15, 0.4], forearmL: [-0.05, 0, 0], wristL: [-0.9, 0, 0], armR: [-1.75, 0.15, -0.4], forearmR: [-0.1, 0, 0], wristR: [0.2, 0, 0], head: [-0.15, 0, 0], pos: [0, 0.0, 0.03], legL: [-0.25, 0, 0], shinL: [0.15, 0, 0], legR: [0.15, 0, 0] }, 1],
      [0.7, { chest: [-0.15, 0, 0], spine: [-0.05, 0, 0], armL: [-1.6, -0.15, 0.4], forearmL: [-0.12, 0, 0], wristL: [-0.7, 0, 0], armR: [-1.65, 0.15, -0.4], forearmR: [-0.15, 0, 0], head: [-0.12, 0, 0], pos: [0, 0.0, 0.03], legL: [-0.25, 0, 0], shinL: [0.15, 0, 0], legR: [0.15, 0, 0] }, 2],
    ] },
    cry: { dur: 0.7, keys: [   // cri / pouvoir de mêlée
      [0.00, { chest: [0.15, 0, 0], armL: [-0.3, 0, 0.3], forearmL: [-1.3, 0, 0], armR: [-0.3, 0, -0.3], forearmR: [-1.3, 0, 0], head: [0.15, 0, 0] }, 0],
      [0.25, { chest: [0.3, 0, 0], spine: [0.1, 0, 0], armL: [-0.2, 0, 0.25], forearmL: [-1.7, 0, 0], armR: [-0.2, 0, -0.25], forearmR: [-1.7, 0, 0], head: [0.25, 0, 0], pos: [0, -0.1, 0], shinL: [0.55, 0, 0], shinR: [0.55, 0, 0], legL: [-0.3, 0, 0.1], legR: [-0.3, 0, -0.1] }, 0],
      [0.45, { chest: [-0.3, 0, 0], spine: [-0.1, 0, 0], armL: [-0.6, 0, 1.25], forearmL: [-0.5, 0, 0], armR: [-0.6, 0, -1.25], forearmR: [-0.5, 0, 0], head: [-0.3, 0, 0], pos: [0, -0.04, 0], legL: [-0.1, 0, 0.18], legR: [-0.1, 0, -0.18], shinL: [0.2, 0, 0], shinR: [0.2, 0, 0] }, 1],
      [0.7, { chest: [-0.25, 0, 0], spine: [-0.08, 0, 0], armL: [-0.55, 0, 1.15], forearmL: [-0.55, 0, 0], armR: [-0.55, 0, -1.15], forearmR: [-0.55, 0, 0], head: [-0.25, 0, 0], pos: [0, -0.04, 0], legL: [-0.1, 0, 0.18], legR: [-0.1, 0, -0.18], shinL: [0.2, 0, 0], shinR: [0.2, 0, 0] }, 2],
    ] },
    volley: { dur: 0.6, keys: [   // tir puissant (archer)
      [0.00, { chest: [-0.05, -0.5, 0], head: [-0.05, 0.5, 0], armL: [-0.6, -0.5, 1.2], forearmL: [-0.2, 0, 0], wristL: [0, 0.8, 0], armR: [-0.6, -0.2, -1.2], forearmR: [-1.6, 0, 0] }, 0],
      [0.4, { chest: [-0.15, -0.9, 0], spine: [-0.05, -0.2, 0], head: [-0.2, 1.0, 0], armL: [-0.55, -0.8, 1.5], forearmL: [-0.03, 0, 0], wristL: [0, 1.5, 0], armR: [-0.6, -0.6, -1.45], forearmR: [-2.4, 0, 0], legL: [-0.2, 0, 0.14], legR: [0.15, 0, -0.14], shinL: [0.2, 0, 0], shinR: [0.25, 0, 0], pos: [0, -0.04, 0] }, 0],
      [0.55, { chest: [-0.12, -0.85, 0], spine: [-0.05, -0.2, 0], head: [-0.18, 0.95, 0], armL: [-0.55, -0.75, 1.45], forearmL: [-0.05, 0, 0], wristL: [0, 1.5, 0], armR: [-0.3, -1.05, -1.3], forearmR: [-1.0, 0, 0], wristR: [-0.4, 0, 0], legL: [-0.2, 0, 0.14], legR: [0.15, 0, -0.14], shinL: [0.2, 0, 0], shinR: [0.25, 0, 0], pos: [0, -0.04, 0] }, 1],
      [0.7, { chest: [-0.1, -0.8, 0], spine: [-0.04, -0.18, 0], head: [-0.15, 0.9, 0], armL: [-0.5, -0.7, 1.4], forearmL: [-0.08, 0, 0], wristL: [0, 1.5, 0], armR: [-0.25, -1.0, -1.25], forearmR: [-1.1, 0, 0], legL: [-0.2, 0, 0.14], legR: [0.15, 0, -0.14], shinL: [0.2, 0, 0], shinR: [0.25, 0, 0], pos: [0, -0.04, 0] }, 2],
    ] },
    cross: { dur: 0.46, keys: [   // ciseaux des lames jumelles
      [0.00, { chest: [0.05, 0, 0], armL: [-1.2, -0.3, 0.6], forearmL: [-0.9, 0, 0], armR: [-1.2, 0.3, -0.6], forearmR: [-0.9, 0, 0] }, 0],
      [0.3, { chest: [-0.1, 0, 0], armL: [-2.2, -0.2, 0.8], forearmL: [-0.8, 0, 0], armR: [-2.2, 0.2, -0.8], forearmR: [-0.8, 0, 0], head: [-0.1, 0, 0], pos: [0, -0.03, 0], shinL: [0.2, 0, 0], shinR: [0.2, 0, 0] }, 0],
      [0.5, { chest: [0.3, 0, 0], spine: [0.1, 0, 0], armL: [-0.7, 0.5, 0.15], forearmL: [-0.15, 0, 0], armR: [-0.7, -0.5, -0.15], forearmR: [-0.15, 0, 0], head: [0.1, 0, 0], pos: [0, -0.1, 0.08], legL: [-0.6, 0, 0], shinL: [0.6, 0, 0], legR: [0.4, 0, 0], shinR: [0.4, 0, 0] }, 1],
      [0.68, { chest: [0.26, 0, 0], spine: [0.08, 0, 0], armL: [-0.75, 0.45, 0.18], forearmL: [-0.2, 0, 0], armR: [-0.75, -0.45, -0.18], forearmR: [-0.2, 0, 0], head: [0.08, 0, 0], pos: [0, -0.1, 0.08], legL: [-0.6, 0, 0], shinL: [0.6, 0, 0], legR: [0.4, 0, 0], shinR: [0.4, 0, 0] }, 2],
    ] },
  };
  const CAST_FOR = { sword: 'cry', mace: 'cry', twin: 'cross', throw: 'cross', bow: 'volley', staff: 'caster', scepter: 'caster', scythe: 'caster' };

  // compilation : Float32Array par clé + masque d'os + canaux utilisés (Int16Array)
  function compile(c) {
    const ks = c.keys.map(k => { const pb = poseBuf(k[1]); return { u: k[0], a: pb.a, m: pb.m, e: k[2] || 0 }; });
    if (ks.length === 4 && !c.noExag) {
      // exagération : anticipation (clé 1) poussée à l'opposé de la frappe, suivi (clé 3) qui dépasse la frappe, buste plus tourné
      const a1 = ks[1].a, a2 = ks[2].a, a3 = ks[3].a, a0 = ks[0].a;
      for (let i = 0; i < NB; i++) {
        if (LOWER[BONES[i]] || FACE[BONES[i]]) continue;
        const torso = BONES[i] === 'chest' || BONES[i] === 'spine';
        for (let q = 0; q < 3; q++) {
          const j = i * 3 + q;
          const d = a2[j] - a1[j];
          a1[j] -= d * (torso ? 0.06 : 0.2);
          if (torso && q === 1) { a2[j] *= 1.15; a3[j] *= 1.15; }
          a3[j] = a2[j] + d * 0.1;
        }
        void a0;
      }
    }
    const m = new Float32Array(NB); ks.forEach(k => { for (let i = 0; i < NB; i++) if (k.m[i]) m[i] = 1; });
    const ch = []; for (let i = 0; i < NB; i++) if (m[i]) ch.push(i * 3, i * 3 + 1, i * 3 + 2);
    if (m[B.hips]) ch.push(POS, POS + 1, POS + 2);
    const ku = new Float32Array(ks.length), ke = new Uint8Array(ks.length);
    ks.forEach((k, i) => { ku[i] = k.u; ke[i] = k.e; });
    let hasLeg = false; for (const n in LOWER) if (m[B[n]]) hasLeg = true;
    return { dur: c.dur, heavy: !!c.heavy, alt: !!c.alt, kv: ks.map(k => k.a), ku, ke, nk: ks.length, mask: m, ch: new Int16Array(ch), hasLeg };
  }
  function compileSet(list) {
    return list.map(c => { const a = compile(c); const mc = { dur: c.dur, heavy: c.heavy, keys: c.keys.map(k => [k[0], mirrorPose(k[1]), k[2]]) }; a.mirror = compile(mc); return a; });
  }
  const CA = {}; for (const k in ATTACKS) CA[k] = compileSet(ATTACKS[k]);
  const CC = {}; for (const k in CASTS) { CC[k] = compile(CASTS[k]); }
  const CP = {}; // compilé plus bas (PRESENT défini après)

  // poses de garde (combat) par arme et de repos de l'arme
  const GUARD = {
    sword: poseBuf(withShield({ armR: [-0.3, 0.25, -0.22], forearmR: [-0.9, 0, 0], chest: [0.05, -0.12, 0], head: [0, 0.1, 0] })),
    mace: poseBuf(withShield({ armR: [-0.15, 0.2, -0.2], forearmR: [-0.95, 0, 0], chest: [0.04, -0.1, 0], head: [0, 0.08, 0] })),
    twin: poseBuf({ armR: [-0.25, 0.1, -0.28], forearmR: [-0.75, 0, 0], armL: [-0.3, -0.1, 0.28], forearmL: [-0.75, 0, 0], chest: [0.12, -0.1, 0], head: [-0.05, 0.1, 0] }),
    throw: poseBuf({ armR: [-0.25, 0, -0.25], forearmR: [-0.85, 0, 0], armL: [-0.3, 0, 0.25], forearmL: [-0.7, 0, 0], chest: [0.1, -0.1, 0] }),
    bow: poseBuf({ armL: [0.0, 0, 0.18], forearmL: [-1.0, 0, 0], armR: [-0.15, 0, -0.15], forearmR: [-0.8, 0, 0], chest: [0.04, -0.2, 0], head: [0, 0.2, 0] }),
    staff: poseBuf({ armR: [-0.05, 0, 0.0], forearmR: [-0.5, 0, 0], armL: [-0.45, 0, 0.25], forearmL: [-1.2, 0, 0], wristL: [-0.3, 0, 0] }),
    scepter: poseBuf({ armR: [-0.05, 0, 0.0], forearmR: [-0.5, 0, 0], armL: [-0.3, 0, 0.45], forearmL: [-0.9, 0, 0], wristL: [-0.4, 0, 0] }),
    scythe: poseBuf({ armR: [-0.15, 0.1, -0.25], forearmR: [-1.0, 0.25, 0], armL: [-0.85, -0.55, 0.05], forearmL: [-1.0, 0, 0], chest: [0.08, -0.2, 0], head: [0, 0.2, 0] }),
  };

  // pose héroïque de repos par arme (aperçu de sélection et attente en jeu)
  const HERO_IDLE = {
    sword: poseBuf({ armR: [-0.25, 0.25, -0.22], forearmR: [-0.85, 0, 0], armL: [-0.45, -0.15, 0.3], forearmL: [-1.35, 0, 0], chest: [0, -0.15, 0], spine: [0, -0.05, 0], head: [0, 0.17, 0], legL: [-0.22, 0, 0.06], shinL: [0.22, 0, 0], legR: [0.18, 0, -0.08], shinR: [0.14, 0, 0], footR: [-0.1, 0.25, 0] }),
    staff: poseBuf({ armR: [-0.05, 0, 0.04], forearmR: [-0.4, 0, 0], armL: [-0.45, 0, 0.32], forearmL: [-1.45, 0, 0], wristL: [-0.55, 0, 0], chest: [-0.05, 0.1, 0], head: [-0.06, -0.1, 0], legR: [0.1, 0, -0.04], legL: [-0.08, 0, 0.04] }),
    twin: poseBuf({ armR: [-0.3, 0.1, -0.3], forearmR: [-0.7, 0, 0], armL: [-0.35, -0.1, 0.3], forearmL: [-0.7, 0, 0], chest: [0.16, -0.12, 0], spine: [0.08, 0, 0], head: [-0.12, 0.12, 0], legL: [-0.35, 0, 0.1], shinL: [0.55, 0, 0], legR: [0.15, 0, -0.12], shinR: [0.45, 0, 0] }),
    throw: poseBuf({ armR: [-0.3, 0.05, -0.3], forearmR: [-0.9, 0, 0], armL: [-0.2, 0, 0.3], forearmL: [-0.7, 0, 0], chest: [0.08, -0.2, 0], head: [0, 0.18, 0], legL: [-0.18, 0, 0.06], shinL: [0.22, 0, 0], legR: [0.08, 0, -0.06] }),
    bow: poseBuf({ armL: [0.0, 0, 0.2], forearmL: [-1.0, 0, 0], armR: [-0.2, 0, -0.15], forearmR: [-0.8, 0, 0], chest: [0, -0.2, 0], head: [0, 0.22, 0], legL: [-0.12, 0, 0.08], legR: [0.1, 0, -0.05], shinR: [0.12, 0, 0] }),
    mace: poseBuf({ armR: [0.05, 0.05, 0.05], forearmR: [-0.7, 0, 0], armL: [-0.45, -0.15, 0.3], forearmL: [-1.35, 0, 0], chest: [-0.07, 0, 0], head: [-0.08, -0.05, 0], legL: [-0.1, 0, 0.04] }),
    scepter: poseBuf({ armR: [-0.05, 0, 0.04], forearmR: [-0.45, 0, 0], armL: [-0.4, 0, 0.6], forearmL: [-0.7, 0, 0], wristL: [-0.6, 0, 0], chest: [-0.05, 0.12, 0], head: [-0.05, -0.15, 0.06] }),
    // faux tenue droite sur le côté (façon faucheuse) : le fût et la lame ne passent plus devant le visage
    scythe: poseBuf({ armR: [-0.05, 0, 0.16], forearmR: [-0.45, 0, 0], armL: [-0.35, 0, 0.18], forearmL: [-1.1, 0, 0], wristL: [-0.2, 0, 0], chest: [-0.04, 0.06, 0], head: [0.06, -0.08, 0.06], legL: [-0.1, 0, 0.05], legR: [0.08, 0, -0.04] }),
  };
  // geste de présentation (sélection de classe) par style
  const PRESENT = {
    heavy: { dur: 1.0, noExag: 1, keys: [
      [0.00, { armR: [-0.6, 0.3, -0.2], forearmR: [-1.0, 0, 0] }, 0],
      [0.3, { armR: [-0.45, 0.5, -0.15], forearmR: [-1.25, 0, 0], wristR: [0, 0, 0], armL: [-0.7, -0.2, 0.3], forearmL: [-1.2, 0, 0], chest: [-0.12, 0, 0], head: [-0.12, 0, 0] }, 2],
      [0.7, { armR: [-0.45, 0.48, -0.15], forearmR: [-1.22, 0, 0], wristR: [0, 0, 0], armL: [-0.7, -0.2, 0.3], forearmL: [-1.2, 0, 0], chest: [-0.1, 0, 0], head: [-0.1, 0, 0] }, 0],
      [1.0, { armR: [-0.5, 0.3, -0.2], forearmR: [-0.9, 0, 0], armL: [-0.55, -0.2, 0.22], forearmL: [-1.05, 0, 0] }, 0]] },
    caster: { dur: 1.0, noExag: 1, keys: [
      [0.00, { armR: [-0.05, 0, 0.04], forearmR: [-0.4, 0, 0] }, 0],
      [0.25, { armR: [-0.15, 0, 0.02], forearmR: [-0.7, 0, 0], armL: [-0.6, 0, 0.5], forearmL: [-0.9, 0, 0], wristL: [-0.8, 0, 0], chest: [-0.08, 0.1, 0], head: [-0.1, -0.1, 0] }, 0],
      [0.42, { armR: [0.0, 0, 0.04], forearmR: [-0.35, 0, 0], armL: [-0.65, 0, 0.55], forearmL: [-0.85, 0, 0], wristL: [-0.85, 0, 0], chest: [-0.1, 0.1, 0], head: [-0.12, -0.1, 0] }, 1],
      [0.75, { armR: [-0.03, 0, 0.04], forearmR: [-0.38, 0, 0], armL: [-0.6, 0, 0.5], forearmL: [-0.9, 0, 0], wristL: [-0.8, 0, 0], chest: [-0.08, 0.08, 0], head: [-0.1, -0.08, 0] }, 0],
      [1.0, { armR: [-0.05, 0, 0.04], forearmR: [-0.4, 0, 0], armL: [-0.45, 0, 0.32], forearmL: [-1.45, 0, 0] }, 0]] },
    agile: { dur: 1.0, noExag: 1, keys: [
      [0.00, { armR: [-0.6, 0, -0.3], forearmR: [-1.3, 0, 0] }, 0],
      [0.3, { armR: [-0.95, 0.3, -0.5], forearmR: [-1.45, 0, 0], wristR: [0, 0, 0], armL: [0.3, 0, 0.45], forearmL: [-0.4, 0, 0], chest: [0.22, 0.3, 0], head: [-0.15, -0.3, 0], legL: [-0.5, 0, 0.1], shinL: [0.9, 0, 0], legR: [0.15, 0, -0.14], shinR: [0.6, 0, 0], pos: [0, -0.1, 0] }, 2],
      [0.7, { armR: [-0.9, 0.3, -0.5], forearmR: [-1.45, 0, 0], wristR: [0, 0.2, 0], armL: [0.25, 0, 0.45], forearmL: [-0.45, 0, 0], chest: [0.2, 0.28, 0], head: [-0.12, -0.28, 0], legL: [-0.5, 0, 0.1], shinL: [0.9, 0, 0], legR: [0.15, 0, -0.14], shinR: [0.6, 0, 0], pos: [0, -0.1, 0] }, 0],
      [1.0, { armR: [-0.6, 0, -0.32], forearmR: [-1.5, 0, 0], armL: [-0.7, 0, 0.3], forearmL: [-1.4, 0, 0] }, 0]] },
    ranger: { dur: 1.0, noExag: 1, keys: [
      [0.00, { chest: [0, -0.3, 0], head: [0, 0.3, 0] }, 0],
      [0.32, { chest: [0, -0.85, 0], head: [-0.03, 0.95, 0], armL: [-0.05, -0.75, 1.5], forearmL: [-0.04, 0, 0], wristL: [0, 1.5, 0], armR: [-0.15, -0.55, -1.45], forearmR: [-2.35, 0, 0], legL: [-0.15, 0, 0.12], legR: [0.1, 0, -0.12] }, 2],
      [0.7, { chest: [0, -0.85, 0], head: [-0.03, 0.95, 0], armL: [-0.05, -0.75, 1.5], forearmL: [-0.04, 0, 0], wristL: [0, 1.5, 0], armR: [-0.15, -0.6, -1.45], forearmR: [-2.4, 0, 0], legL: [-0.15, 0, 0.12], legR: [0.1, 0, -0.12] }, 0],
      [1.0, { chest: [0, -0.2, 0], head: [0, 0.22, 0], armL: [-0.45, -0.2, 0.25], forearmL: [-0.7, 0, 0], wristL: [0, 0.8, 0] }, 0]] },
    noble: { dur: 1.0, noExag: 1, keys: [
      [0.00, { armR: [0.05, 0.05, 0.05], forearmR: [-0.7, 0, 0] }, 0],
      [0.32, { armR: [-0.15, 0.3, -0.15], forearmR: [-1.0, 0, 0], armL: [-0.55, -0.2, 0.3], forearmL: [-1.35, 0, 0], chest: [-0.06, 0, 0], head: [0.28, 0, 0] }, 0],
      [0.7, { armR: [-0.15, 0.3, -0.15], forearmR: [-1.0, 0, 0], armL: [-0.55, -0.2, 0.3], forearmL: [-1.35, 0, 0], chest: [-0.05, 0, 0], head: [0.24, 0, 0] }, 0],
      [1.0, { armR: [0.05, 0.05, 0.05], forearmR: [-0.7, 0, 0], armL: [-0.45, -0.15, 0.3], forearmL: [-1.35, 0, 0] }, 0]] },
    dread: { dur: 1.0, noExag: 1, keys: [
      [0.00, { chest: [0.1, 0, 0] }, 0],
      [0.32, { armL: [-0.5, -0.1, 0.25], forearmL: [-1.4, 0, 0], wristL: [-0.6, 0, 0], chest: [-0.08, -0.15, 0], head: [0.05, 0.15, 0.3] }, 0],
      [0.7, { armL: [-0.55, -0.1, 0.25], forearmL: [-1.45, 0, 0], wristL: [-0.7, 0, 0], chest: [-0.06, -0.15, 0], head: [0.08, 0.15, 0.32] }, 0],
      [1.0, { chest: [0.1, -0.2, 0], head: [0.08, 0.2, 0.1] }, 0]] },
  };

  for (const k in PRESENT) CP[k] = compile(PRESENT[k]);

  // alignement de l'axe +Z de la main (bras Rx·Ry·Rz, puis avant-bras+poignet Rx(q)) avec la direction (0, ty, tz)
  function gripScore(ax, ay, az, q, ty, tz) {
    const sq = Math.sin(q), cq = Math.cos(q);
    const x1 = sq * Math.sin(az), y1 = -sq * Math.cos(az), z1 = cq;
    const z2 = -x1 * Math.sin(ay) + z1 * Math.cos(ay);
    const y3 = y1 * Math.cos(ax) - z2 * Math.sin(ax), z3 = y1 * Math.sin(ax) + z2 * Math.cos(ax);
    return y3 * ty + z3 * tz;
  }
  // angle de l'arme voulu (somme des x bras + avant-bras + poignet) : [main droite, main gauche] ; null = libre
  const GRIP = { sword: [-0.75, null], mace: [-1.3, null], staff: [-1.57, null], scepter: [-1.5, null], twin: [-0.8, -0.8], throw: [-0.8, null], scythe: [-1.55, null], bow: [null, -1.57] };

  // ------------------------------------------------------------------ état par héros
  function boneOf(root, ud, name) {
    const P = ud.parts || {};
    if (P[name] && P[name].isObject3D) return P[name];
    const R = ud.rig;
    if (R && R.bones && R.bones[name] && R.bones[name].isObject3D) return R.bones[name];
    return null;
  }
  function makeState(root, spec) {
    const ud = root.userData || (root.userData = {});
    spec = spec || ud.spec || {};
    const cls = spec.classId || ud.classId || ud.heroId || 'Guerrier';
    const def = CLASS_DEF[cls] || CLASS_DEF.Guerrier;
    const an = spec.anim || {};
    const style = STYLES[an.style] ? an.style : def[0];
    const weapon = ATTACKS[an.weapon] ? an.weapon : def[1];
    const S = {
      cls, style, sty: STYLES[style], weapon, variant: an.variant || '', weight: clamp(fin(an.weight, 0.5), 0, 1), bounce: clamp(fin(an.bounce, 0.1), 0, 1),
      idles: idleList(an.idle, style), bones: new Array(NB), rest: new Float32Array(NB * 3), restS: new Float32Array(NB * 3), restP: new Float32Array(NB * 3),
      base: new Float32Array(N), act: new Float32Array(N), out: new Float32Array(N), snap: new Float32Array(N), xf: 0,
      seed: (Math.floor(fin(ud.phase, Math.random() * 10) * 7919) ^ 0x9e3779b) | 1,
      lastT: null, src: 0, lastExt: -1, everExt: false, lastSelf: -1, selfT: 0,
      px: root.position.x, pz: root.position.z, havePos: false, pyaw: root.rotation.y,
      vx: 0, vz: 0, speed: 0, fwd: 0, lat: 0, acc: 0, yawRate: 0, mv: 0, runK: 0, ph: 0, dirSign: 1, hipYaw: 0, bank: 0, accLean: 0,
      exert: 0, combat: 0, atkPrev: 0, suppress: 0, combo: 0, comboT: 0, lastHand: 0,
      a1: { on: false, clip: null, t: 0, dur: 1, rate: 1 },          // action haut du corps (attaque / sort)
      a2: { on: false, kind: '', t: 0, dur: 1, dx: 0, dz: 1, loop: false, data: null }, // action corps entier
      hitH: 0, hitV: 0, hitSide: 0, hitBack: 1,
      gaze: { x: 0, y: 0, tx: 0, ty: 0, next: 1 }, blink: { t: -1, next: 2, dbl: false }, face: { blink: 0, browUp: 0, furrow: 0, jaw: 0, smile: 0 },
      fid: { on: false, id: 0, t: 0, dur: 2, next: 5, side: 1 },
      spr: new Float32Array(7 * 4), sprPrev: new Float32Array(4), chestJ: 0, chestJv: 0,
      legLen: 1, l1: 0.5, l2: 0.5, foot: 0.08, u2l: 1, k: 1, rig: null, rigRest: new Float32Array(6), hasRig: false,
      mesh: null, faceCfg: null, dead: false, valid: true, root,
    };
    ud.animState = ud.animState || { attack: 0, action: '', moving: 0 };
    for (let i = 0; i < NB; i++) {
      const b = boneOf(root, ud, BONES[i]);
      S.bones[i] = b;
      if (!b) continue;
      const r = ud.rest && ud.rest[BONES[i]];
      if (r && r.length >= 3) { S.rest[i * 3] = fin(r[0], 0); S.rest[i * 3 + 1] = fin(r[1], 0); S.rest[i * 3 + 2] = fin(r[2], 0); }
      else if (r && typeof r.x === 'number') { S.rest[i * 3] = fin(r.x, 0); S.rest[i * 3 + 1] = fin(r.y, 0); S.rest[i * 3 + 2] = fin(r.z, 0); }
      else { S.rest[i * 3] = fin(b.rotation.x, 0); S.rest[i * 3 + 1] = fin(b.rotation.y, 0); S.rest[i * 3 + 2] = fin(b.rotation.z, 0); }
      S.restS[i * 3] = fin(b.scale.x, 1); S.restS[i * 3 + 1] = fin(b.scale.y, 1); S.restS[i * 3 + 2] = fin(b.scale.z, 1);
      S.restP[i * 3] = fin(b.position.x, 0); S.restP[i * 3 + 1] = fin(b.position.y, 0); S.restP[i * 3 + 2] = fin(b.position.z, 0);
    }
    if (ud.rig && ud.rig.isObject3D) {
      S.rig = ud.rig; S.hasRig = ud.rig !== root;
      S.rigRest[0] = ud.rig.position.x; S.rigRest[1] = ud.rig.position.y; S.rigRest[2] = ud.rig.position.z;
      S.rigRest[3] = ud.rig.rotation.x; S.rigRest[4] = ud.rig.rotation.y; S.rigRest[5] = ud.rig.rotation.z;
    }
    // mesures du squelette (unités locales de hips.parent)
    const bp = (n) => { const i = B[n]; return S.bones[i] ? Math.hypot(S.restP[i * 3], S.restP[i * 3 + 1], S.restP[i * 3 + 2]) : 0; };
    const l1 = bp('shinL') || bp('shinR'), l2 = bp('footL') || bp('footR');
    const hipY = S.bones[B.hips] ? S.restP[B.hips * 3 + 1] : 0;
    const legY = S.bones[B.legL] ? -S.restP[B.legL * 3 + 1] : 0;
    if (l1 > 0.05 && l2 > 0.05) { S.l1 = l1; S.l2 = l2; } else if (hipY > 0.1) { S.l1 = S.l2 = hipY * 0.46; }
    S.legLen = S.l1 + S.l2;
    S.foot = clamp(hipY > 0 ? hipY - legY - S.legLen : 0.06, 0, 0.4 * S.legLen);
    // facteur monde -> local (échelles entre root et hips.parent)
    let sc = 1, o = S.bones[B.hips] ? S.bones[B.hips].parent : null, guard = 0;
    while (o && guard++ < 8) { sc *= fin(o.scale.y, 1) || 1; if (o === root) break; o = o.parent; }
    S.u2l = 1 / (sc || 1);
    S.k = S.legLen > 0.05 ? S.legLen / 0.95 : 1;
    // configuration du visage (surchargée par A2 via userData.faceRig ou spec.anim.face)
    const fc = ud.faceRig || an.face || {};
    S.faceCfg = {
      lidAxis: fc.lidAxis || 'x', lidClose: fin(fc.lidClose, 1.1), lidScale: !!fc.lidScale,
      browLift: fin(fc.browLift, 0.025 * S.k), browTilt: fin(fc.browTilt, 0.22),
      jawOpen: fin(fc.jawOpen, 0.32), smile: fin(fc.smile, 0.12),
    };
    S.ph = rnd(S) * TAU;
    S.blink.next = 1 + rnd(S) * 3; S.gaze.next = 0.5 + rnd(S) * 2; S.fid.next = lerp(S.sty.fidget[0], S.sty.fidget[1], rnd(S)) * 0.6;
    // ressorts au repos
    return S;
  }

  // ------------------------------------------------------------------ actions
  function startXF(S, dur) { S.snap.set(S.out); S.xf = 1; S.xfRate = 1 / Math.max(0.04, dur || 0.12); }
  function vfxTrail(S, dur) {
    try { if (G.HeroVFX && typeof G.HeroVFX.trail === 'function' && S.root) G.HeroVFX.trail(S.root, true, dur); } catch (e) { warnOnce('trail', e); }
  }
  function playAttack(S, variant, data) {
    const set = CA[S.weapon] || CA.sword;
    let idx = 0;
    if (variant === 'heavy') idx = set.length - 1;
    else if (variant === 'bash' && set.length > 1) idx = 1;
    else { if (S.comboT <= 0) S.combo = 0; idx = S.combo % set.length; if (set[idx].heavy && variant !== 'combo') idx = S.combo % set.length; }
    let clip = set[idx];
    if (clip.alt) { S.lastHand ^= 1; if (S.lastHand) clip = clip.mirror; }
    S.combo++; S.comboT = 0.9;
    if (S.a1.on) startXF(S, 0.08);
    const sp = clamp(fin(data && data.speed, 1), 0.4, 3);
    S.a1.on = true; S.a1.clip = clip; S.a1.t = 0; S.a1.driven = false; S.a1.forced = ''; S.a1.dur = clip.dur / sp; S.a1.kind = 'attack';
    S.combat = 3.5; S.suppress = 0.12;
    vfxTrail(S, 0.3);
  }
  function playCast(S, kind) {
    let clip;
    if (kind === 'ultimate') clip = CC[CAST_FOR[S.weapon] === 'caster' ? 'caster' : 'cry'];
    else if (kind === 'melee') { playAttack(S, 'heavy'); return; }
    else clip = CC[CAST_FOR[S.weapon] || 'caster'];
    if (S.a1.on) startXF(S, 0.08);
    S.a1.on = true; S.a1.clip = clip; S.a1.t = 0; S.a1.driven = false; S.a1.forced = ''; S.a1.dur = clip.dur * (kind === 'ultimate' ? 1.35 : 1); S.a1.kind = kind;
    S.combat = 3.5; S.suppress = 0.15;
    vfxTrail(S, kind === 'ultimate' ? 0.6 : 0.35);
  }
  function playFull(S, kind, dur, data) {
    startXF(S, kind === 'dash' ? 0.06 : 0.15);
    const a = S.a2; a.on = true; a.kind = kind; a.t = 0; a.dur = dur; a.loop = kind === 'victory' || kind === 'defeat'; a.data = data || null;
    if (kind === 'dash') {
      let dx = fin(data && data.dir && data.dir.x, NaN), dz = fin(data && data.dir && data.dir.z, NaN);
      let lx = 0, lz = 1;
      if (dx === dx && dz === dz && (dx || dz)) {
        const yaw = S.yawW || 0, c = Math.cos(yaw), s = Math.sin(yaw);
        lx = dx * c - dz * s; lz = dx * s + dz * c;   // monde -> local (rotation -yaw)
        const l = Math.hypot(lx, lz) || 1; lx /= l; lz /= l;
      }
      a.dx = lx; a.dz = lz;
      if (S.a1.on && S.a1.kind === 'attack') S.a1.on = false;
    }
  }
  function trigger(root, name, data) {
    try {
      const S = root && root.userData && root.userData._ha;
      if (!S) return false;
      switch (name) {
        case 'attack': playAttack(S, data && data.variant, data); break;
        case 'cast': case 'skill': playCast(S, (data && data.kind) || 'skill'); break;
        case 'ultimate': playCast(S, 'ultimate'); break;
        case 'dash': case 'roll': case 'dodge': playFull(S, 'dash', clamp(fin(data && data.duration, 0.18) + 0.24, 0.3, 0.9), data); break;
        case 'hit': {
          const amt = Math.max(0, fin(data && data.amount, 10));
          S.hitV += 7 + Math.min(9, Math.sqrt(amt) * 1.3); S.hitSide = (rnd(S) - 0.5) * 2; S.hitBack = 1;
          const src = data && data.source, sp = src && (src.pos || src.position);
          if (sp && typeof sp.x === 'number') {
            const ox = sp.x - root.position.x, oz = sp.z - root.position.z, yaw = S.yawW || 0;
            const lx = ox * Math.cos(yaw) - oz * Math.sin(yaw), lz = ox * Math.sin(yaw) + oz * Math.cos(yaw);
            const l = Math.hypot(lx, lz); if (l > 1e-3) { S.hitBack = clamp(lz / l, -1, 1); S.hitSide = clamp(-lx / l, -1, 1); }
          }
          S.combat = Math.max(S.combat, 2.5); S.face.furrow = 1; break;
        }
        case 'victory': if (S.a2.kind !== 'victory') playFull(S, 'victory', 2.2, data); break;
        case 'defeat': if (S.a2.kind !== 'defeat') playFull(S, 'defeat', 1.4, data); break;
        case 'spawn': playFull(S, 'spawn', 0.8, data); break;
        case 'present': playFull(S, 'present', 1.9, data); break;
        case 'idle': case 'reset': if (S.a2.on || S.a1.on) startXF(S, 0.25); S.a2.on = false; S.a1.on = false; break;
        default: return false;
      }
      return true;
    } catch (e) { warnOnce('trigger', e); return false; }
  }

  function forcePose(root, S, p6, dt) {
    const u = clamp(fin(+p6.u, 0), 0, 0.999), a = String(p6.a || '');
    if (S.a2.on && (S.a2.kind === 'spawn' || S.a2.kind === 'present') && a !== S.a2.kind) S.a2.on = false;
    if (a === 'run' || a === 'walk') { if (p6.ph != null) S.ph = fin(+p6.ph, 0) * TAU - S.dirSign * TAU * dt * 0; return; }
    if (a === 'attack' || a === 'cast' || a === 'ultimate') {
      if (S.a2.on && (S.a2.kind === 'spawn' || S.a2.kind === 'present')) S.a2.on = false;
      if (!S.a1.on || S.a1.forced !== a + (p6.v | 0)) {
        if (a === 'attack') { S.combo = p6.v | 0; S.comboT = 1; S.lastHand = (p6.v | 0) & 1 ? 0 : 1; playAttack(S, p6.variant); }
        else playCast(S, a === 'ultimate' ? 'ultimate' : (p6.kind || 'skill'));
        S.a1.forced = a + (p6.v | 0); S.xf = 0;
      }
      S.a1.t = u * S.a1.dur - dt; return;
    }
    if (!S.a2.on || S.a2.kind !== a) { trigger(root, a, p6); S.xf = 0; }
    if (S.a2.on) S.a2.t = u * S.a2.dur - dt;
  }

  // ------------------------------------------------------------------ évaluation d'un clip
  function ease(e, x) {
    if (e === 1) return 1 - (1 - x) * (1 - x) * (1 - x);                         // frappe : départ sec
    if (e === 2) { const c = 1.7; const y = x - 1; return 1 + y * y * ((c + 1) * y + c); } // léger dépassement
    return x * x * (3 - 2 * x);
  }
  function evalClip(c, u, out) {
    const ku = c.ku, nk = c.nk, ch = c.ch;
    let i = 0; while (i < nk - 1 && u >= ku[i + 1]) i++;
    if (i >= nk - 1) { const a = c.kv[nk - 1]; for (let j = 0; j < ch.length; j++) out[ch[j]] = a[ch[j]]; return; }
    const span = ku[i + 1] - ku[i];
    const x = span > 1e-6 ? clamp((u - ku[i]) / span, 0, 1) : 1;
    const e = ease(c.ke[i + 1], x);
    const a = c.kv[i], b = c.kv[i + 1];
    for (let j = 0; j < ch.length; j++) { const k = ch[j]; out[k] = a[k] + (b[k] - a[k]) * e; }
  }
  // poids d'une action dans le temps (entrée rapide, sortie douce)
  function envW(u, inT, outT) { return sstep(0, inT, u) * (1 - sstep(outT, 1, u)); }

  // ------------------------------------------------------------------ couches de pose
  function addR(o, name, x, y, z) { const i = B[name] * 3; o[i] += x; o[i + 1] += y; o[i + 2] += z; }

  function locomotion(S, t, o) {
    const sty = S.sty, mv = S.mv, runK = S.runK, idle = 1 - mv;
    const k = S.legLen;
    // --- repos
    const br = Math.sin(t * TAU / sty.breath + 0.3) * (1 + S.exert * 1.4);
    const brF = Math.sin(t * TAU / Math.max(1.2, sty.breath * (1 - 0.55 * S.exert)));
    const breath = lerp(br, brF, clamp(S.exert, 0, 1)) * 0.5;
    addR(o, 'chest', -0.05 * breath, 0, 0); addR(o, 'spine', 0.015 * breath, 0, 0); o[POS + 1] += 0.008 * breath;
    addR(o, 'shoulderL', 0, 0, 0.055 * breath); addR(o, 'shoulderR', 0, 0, -0.055 * breath);
    addR(o, 'neck', 0.01 * breath, 0, 0);
    // bascule du poids
    const sw = (Math.sin(t * TAU / 6.5 + (S.seed % 7)) * 0.75 + noise(t * 0.16 * sty.sway, S.seed % 7) * 0.35) * idle;
    const shift = sw * 0.06 * (0.6 + 0.4 * sty.sway);                 // fraction de jambe
    o[POS] += shift;
    addR(o, 'hips', 0, 0, -sw * 0.05);
    const aShift = Math.asin(clamp(shift, -0.5, 0.5));
    // stance (pieds écartés), genoux, buste par style ; pieds maintenus au sol
    const stalk = S.variant === 'stalker' ? 1 : 0, toes = S.variant === 'dancer' ? 1 : 0;
    const kb = sty.knee * idle + 0.12 * S.combat01 * idle + 0.22 * stalk * idle;
    const legL = sw > 0 ? 0.6 : 1, legR = sw > 0 ? 1 : 0.6;   // la jambe d'appui est plus tendue
    addR(o, 'legL', -kb * 0.5 * legL - 0.04 * Math.max(0, -sw), -0.12 * idle, (sty.stance - aShift) * idle + sw * 0.05);
    addR(o, 'legR', -kb * 0.5 * legR - 0.04 * Math.max(0, sw), 0.12 * idle, (-sty.stance - aShift) * idle + sw * 0.05);
    addR(o, 'shinL', kb * legL + 0.08 * Math.max(0, -sw), 0, 0);
    addR(o, 'shinR', kb * legR + 0.08 * Math.max(0, sw), 0, 0);
    addR(o, 'footL', -kb * 0.5 * legL, 0, -(sty.stance - aShift) * idle);
    addR(o, 'footR', -kb * 0.5 * legR, 0, (sty.stance + aShift) * idle);
    addR(o, 'spine', sty.hunch * 0.6, 0, sw * 0.03);
    addR(o, 'chest', sty.hunch * 0.4, 0, sw * 0.02);
    addR(o, 'head', sty.chin - sty.hunch * 0.6, 0, -sw * 0.04);
    addR(o, 'armL', 0.02 * breath, 0, sty.arm + 0.01 * breath);
    addR(o, 'armR', 0.02 * breath, 0, -sty.arm - 0.01 * breath);
    addR(o, 'forearmL', sty.fore * idle + sty.fore * 0.4 * mv, 0, 0);
    addR(o, 'forearmR', sty.fore * idle + sty.fore * 0.4 * mv, 0, 0);
    // style dread : tête inclinée, lent balancement
    if (S.style === 'dread') addR(o, 'head', 0, 0, 0.1 * idle + noise(t * 0.2, 3) * 0.06);
    o[POS + 1] += Math.abs(Math.sin(t * 3.2)) * 0.03 * S.bounce * idle * (S.combat01 * 0.7 + 0.3);
    if (toes) { addR(o, 'footL', 0.22 * idle, 0, 0); addR(o, 'footR', 0.22 * idle, 0, 0); o[POS + 1] += 0.025 * idle; }
    if (stalk) { addR(o, 'spine', 0.12 * idle, 0, 0); addR(o, 'head', -0.1 * idle, 0, 0); }

    if (mv < 1e-3) return;
    // --- marche / course
    const A = S.stride;
    const dx = S.ldx, dz = S.ldz;                     // direction du déplacement dans le repère des hanches
    const walkK = 1 - runK;
    for (let side = 0; side < 2; side++) {
      const q = S.ph + side * PI;
      const s = Math.sin(q), c = Math.cos(q);
      const a = A * s * mv;
      const thX = -a * Math.abs(dz) * (dz >= -0.2 ? 1 : 1);
      const thZ = a * dx * 0.55 * S.dirSign;
      // genou : forte flexion en phase aérienne (cos q > 0), amorti à la pose du pied
      const swingK = Math.pow(Math.max(0, Math.cos(q + 0.35)), 1.4) * (0.55 * walkK + 1.45 * runK);
      const loadK = Math.max(0, Math.sin(2 * (q - PI / 2))) * (c < 0 ? 1 : 0) * (0.12 * walkK + 0.3 * runK);
      const knee = (swingK + loadK + 0.05) * mv;
      // pied : posé à plat en appui, talon puis roulé jusqu'à la pointe
      const stance = sstep(-0.25, 0.25, -c);
      const heel = Math.exp(-Math.pow(wrapA(q - PI / 2) / 0.45, 2)) * 0.32;
      const toe = Math.exp(-Math.pow(wrapA(q - PI * 1.42) / 0.4, 2)) * (0.45 + 0.35 * runK);
      const flat = -(thX + knee + S.hipX);
      const foot = (lerp(flat * 0.45 + 0.25 * mv, flat, stance) - heel * mv + toe * mv);
      const L = side === 0 ? 'L' : 'R';
      addR(o, 'leg' + L, thX - 0.15 * runK * mv, 0, thZ);
      addR(o, 'shin' + L, knee, 0, 0);
      addR(o, 'foot' + L, foot, 0, -thZ * 0.6);
    }
    const s0 = Math.sin(S.ph), c0 = Math.cos(S.ph);
    // bassin : rotation et roulis ; buste en opposition
    const tw = sty.twist * mv * (0.8 + 0.5 * runK) * Math.min(1, A / 0.5);
    addR(o, 'hips', S.hipX, -tw * s0 + S.hipYaw, -0.05 * mv * c0 * walkK);
    addR(o, 'spine', 0.05 * mv * walkK + 0.27 * mv * runK * sty.lean + S.accLean, tw * 1.25 * s0 - S.hipYaw * 0.75, 0.03 * mv * c0 * walkK);
    addR(o, 'chest', 0.02 * mv, tw * 0.7 * s0 - S.hipYaw * 0.25, 0.02 * mv * c0);
    addR(o, 'head', -(0.05 * walkK + 0.2 * runK * sty.lean) * mv - S.accLean * 0.6, -tw * 0.9 * s0, 0);
    // bras : balancier opposé, coude plié en course
    const Ba = A * sty.swing * (1.15 + 0.45 * runK) * mv;
    const lagS = Math.sin(S.ph - 0.25);
    const shieldL = (S.weapon === 'sword' || S.weapon === 'mace') ? 0.45 : 1;
    const staffR = (S.weapon === 'staff' || S.weapon === 'scythe') ? 0.45 : 1;
    const aL = Ba * lagS * shieldL, aR = -Ba * lagS * staffR;
    addR(o, 'armL', aL, 0, 0.05 * mv + 0.08 * runK * mv);
    addR(o, 'armR', aR, 0, -0.05 * mv - 0.08 * runK * mv);
    addR(o, 'forearmL', -(0.15 * walkK + 1.15 * runK) * mv - 0.35 * Math.max(0, -aL), 0, 0);
    addR(o, 'forearmR', -(0.15 * walkK + 1.15 * runK) * mv - 0.35 * Math.max(0, -aR), 0, 0);
    addR(o, 'shoulderL', 0, 0, 0.02 * mv * s0);
    addR(o, 'shoulderR', 0, 0, 0.02 * mv * s0);
    // rebond vertical (marche : haut à mi-appui, géré par le sol ; course : phase de vol)
    o[POS + 1] += runK * mv * (Math.max(0, -Math.cos(2 * S.ph - 0.6)) * 0.11 * sty.bob - 0.03);
    o[POS + 1] += walkK * mv * Math.cos(2 * S.ph) * 0.012 * sty.bob * (0.7 + 0.6 * S.bounce);
    o[POS + 1] -= mv * 0.018 * S.weight * (Math.exp(-Math.pow(wrapA(S.ph - PI / 2 - 0.15) / 0.3, 2)) + Math.exp(-Math.pow(wrapA(S.ph + PI / 2 - 0.15) / 0.3, 2)));
    if (S.variant === 'stalker') { o[POS + 1] -= 0.06 * mv; addR(o, 'spine', 0.12 * mv, 0, 0); addR(o, 'shinL', 0.15 * mv, 0, 0); addR(o, 'shinR', 0.15 * mv, 0, 0); }
    o[POS + 2] += 0;
    // virage et accélération : inclinaison depuis les pieds
    o[RIG] += 0; o[RIG + 1] += S.bank;
    // garde de l'arme pendant la course pour les armes à bouclier
    if (shieldL < 1) { addR(o, 'armL', -0.35 * mv, 0, 0.05 * mv); addR(o, 'forearmL', -0.6 * mv, 0, 0); }
    if (S.weapon === 'staff') { addR(o, 'armR', -0.15 * mv, 0, 0); addR(o, 'forearmR', -0.5 * mv, 0, 0); }
    if (S.weapon === 'scythe') { addR(o, 'armR', -0.3 * mv, -0.2 * mv, -0.1 * mv); addR(o, 'forearmR', -0.6 * mv, 0, 0); }
    if (S.weapon === 'bow') { addR(o, 'armL', -0.1 * mv, 0, 0); }
    void k;
  }

  // gestes de repos (fidgets) : écrits dans o avec le poids w
  function fidget(S, t, o, w) {
    if (w <= 1e-3) return;
    const f = S.fid, u = clamp(f.t / f.dur, 0, 1), sd = f.side;
    const bell = Math.sin(u * PI);                       // 0 → 1 → 0
    const id = f.id;
    switch (id) {
      case 0: addR(o, 'head', 0.06 * bell * w, 0.75 * sd * sstep(0.05, 0.35, u) * (1 - sstep(0.7, 0.95, u)) * w, 0); addR(o, 'chest', 0, 0.15 * sd * bell * w, 0); break; // regard au loin
      case 1: { const r = Math.sin(u * TAU); addR(o, 'shoulderL', 0, 0, (0.12 * bell + 0.05 * r) * w); addR(o, 'shoulderR', 0, 0, (-0.12 * bell + 0.05 * r) * w); addR(o, 'head', 0.1 * Math.sin(u * TAU * 1.5) * bell * w, 0, 0.12 * Math.sin(u * TAU) * w); break; } // épaules / nuque
      case 2: o[POS] += 0.06 * sd * bell * w; addR(o, 'hips', 0, 0, -0.06 * sd * bell * w); break; // change d'appui
      case 3: addR(o, 'armR', -0.7 * bell * w, 0.3 * bell * w, 0); addR(o, 'forearmR', -1.0 * bell * w, 0, 0); addR(o, 'wristR', 0, 0.35 * Math.sin(u * TAU) * w, 0); addR(o, 'head', 0.3 * bell * w, -0.25 * bell * w, 0); break; // regarde / fait tourner l'arme
      case 4: addR(o, 'armL', -0.6 * bell * w, -0.2 * bell * w, 0.1 * bell * w); addR(o, 'forearmL', -1.3 * bell * w, 0, 0); addR(o, 'wristL', -0.5 * bell * w, 0, 0); addR(o, 'head', 0.25 * bell * w, 0.3 * bell * w, 0.08 * bell * w); break; // regarde sa paume
      case 5: addR(o, 'armL', -1.3 * bell * w, 0, 0.55 * bell * w); addR(o, 'forearmL', -2.0 * bell * w, 0, 0); addR(o, 'head', -0.05 * bell * w, 0.6 * Math.sin(u * TAU) * bell * w, 0); break; // main en visière
      case 6: addR(o, 'chest', -0.1 * bell * w, 0, 0); addR(o, 'head', -0.12 * bell * w, 0, 0); addR(o, 'shoulderL', 0, 0, -0.06 * bell * w); addR(o, 'shoulderR', 0, 0, 0.06 * bell * w); break; // se redresse
      case 7: { const q = Math.sin(u * PI * 3); addR(o, 'head', 0.05 * w, 0, 0.35 * q * bell * w); break; } // inclinaisons lentes (dread)
      case 8: { const h = Math.abs(Math.sin(u * PI * 4)) * bell; o[POS + 1] += 0.03 * h * w; addR(o, 'footL', 0.25 * h * w, 0, 0); addR(o, 'footR', 0.25 * h * w, 0, 0); break; } // sautille
      case 9: addR(o, 'armL', -0.5 * bell * w, -0.2 * bell * w, 0.15 * bell * w); addR(o, 'forearmL', -0.9 * bell * w, 0, 0); addR(o, 'chest', 0.06 * bell * w, -0.15 * bell * w, 0); addR(o, 'head', 0.05 * bell * w, 0.15 * bell * w, 0); break; // lève le bouclier
      case 10: { const q = Math.sin(u * TAU * 2); addR(o, 'armL', -0.6 * bell * w, 0, 0.25 * bell * w); addR(o, 'forearmL', (-1.2 + 0.2 * q) * bell * w, 0, 0); addR(o, 'wristL', -0.5 * bell * w, 0.4 * q * bell * w, 0); addR(o, 'armR', -0.3 * bell * w, 0, -0.1 * bell * w); addR(o, 'forearmR', -0.5 * bell * w, 0, 0); addR(o, 'head', 0.2 * bell * w, 0.2 * bell * w, 0); break; } // trace / fait flotter
      case 11: { const fl = Math.exp(-Math.pow((u - 0.35) / 0.06, 2)); addR(o, 'armR', -0.5 * bell * w, 0, -0.1 * bell * w); addR(o, 'forearmR', -1.5 * bell * w, 0, 0); addR(o, 'wristR', (-0.2 - 0.6 * fl) * bell * w, 0, 0); addR(o, 'head', (0.2 - 0.45 * sstep(0.35, 0.55, u) * (1 - sstep(0.7, 0.9, u))) * bell * w, 0, 0); break; } // pièce lancée
      case 12: { o[POS + 1] -= 0.12 * bell * w; addR(o, 'legL', -0.35 * bell * w, 0, 0); addR(o, 'legR', -0.25 * bell * w, 0, 0); addR(o, 'shinL', 0.7 * bell * w, 0, 0); addR(o, 'shinR', 0.5 * bell * w, 0, 0); addR(o, 'footL', -0.35 * bell * w, 0, 0); addR(o, 'footR', -0.25 * bell * w, 0, 0); addR(o, 'spine', 0.2 * bell * w, 0, 0); addR(o, 'head', -0.15 * bell * w, 0.6 * Math.sin(u * TAU) * bell * w, 0); break; } // accroupi, scrute
      case 13: { const fl = Math.exp(-Math.pow((u - 0.4) / 0.08, 2)); addR(o, 'head', -0.15 * fl * w, 0.35 * fl * sd * w, 0.25 * fl * sd * w); S.spr[3 * 4 + 1] += fl * 0.6 * w; break; } // rejette les cheveux
      case 14: addR(o, 'armR', -2.3 * bell * w, -0.4 * bell * w, -0.2 * bell * w); addR(o, 'forearmR', -1.6 * bell * w, 0, 0); addR(o, 'chest', 0, -0.2 * bell * w, 0); addR(o, 'head', 0, 0.25 * bell * w, 0); break; // main au carquois
      case 15: addR(o, 'armR', -1.0 * bell * w, 0.3 * bell * w, -0.55 * bell * w); addR(o, 'forearmR', -2.1 * bell * w, 0, 0); addR(o, 'head', -0.06 * bell * w, -0.15 * bell * w, 0); break; // masse sur l'épaule
      case 16: addR(o, 'armL', -0.55 * bell * w, -0.25 * bell * w, 0.05 * bell * w); addR(o, 'forearmL', -1.9 * bell * w, 0, 0); addR(o, 'head', 0.4 * bell * w, 0, 0); addR(o, 'spine', 0.06 * bell * w, 0, 0); S.fidLid = 0.85 * sstep(0.2, 0.35, u) * (1 - sstep(0.75, 0.9, u)) * w; break; // prière brève
      case 17: { const r = wrapA(TAU * sstep(0.15, 0.85, u)); addR(o, 'hips', 0, r * sd * w, 0); o[POS + 1] += 0.03 * bell * w; addR(o, 'footL', 0.3 * bell * w, 0, 0); addR(o, 'footR', 0.3 * bell * w, 0, 0); addR(o, 'armL', 0, 0, 0.6 * bell * w); addR(o, 'armR', 0, 0, -0.6 * bell * w); break; } // pas tournoyant
      case 18: { const q = Math.sin(u * TAU); addR(o, 'armR', -0.3 * bell * w, 0.25 * q * w, 0); addR(o, 'armL', -0.2 * bell * w, 0.25 * q * w, 0); addR(o, 'chest', 0, 0.2 * q * w, 0); addR(o, 'spine', 0, 0, 0.05 * q * w); break; } // balance la faux
      default: break;
    }
  }
  // noms de gestes de repos de CHAR-DESIGN / hero-defs (spec.anim.idle) → gestes procéduraux
  const IDLE_MAP = {
    'look-around': 0, 'scan-horizon': 5, 'crouch-scan': 12, 'hair-float': 0, 'shoulder-roll': 1, 'cape-settle': 6, 'shield-guard': 9,
    'dagger-spin': 3, 'blade-flip': 3, 'coin-flip': 11, 'ponytail-toss': 13, 'read-grimoire': 4, 'orb-float': 10, 'glyph-trace': 10,
    'check-string': 4, 'nock-arrow': 14, 'mace-shoulder': 9, 'brief-prayer': 16, 'crystal-juggle': 10, 'spin-step': 17,
    'scythe-sway': 18, 'head-tilt': 7, 'claw-flex': 4,
  };
  function idleList(names, style) {
    const out = [0, 2];
    if (Array.isArray(names)) names.forEach(n => { const id = IDLE_MAP[n]; if (id != null && out.indexOf(id) < 0) out.push(id); });
    if (out.length <= 2) (FIDGETS[style] || FIDGETS.heavy).forEach(id => { if (out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  const FIDGETS = { heavy: [0, 1, 2, 3], agile: [0, 3, 8, 2], caster: [0, 4, 2, 6], ranger: [0, 5, 2, 3], noble: [0, 6, 2, 1], dread: [0, 7, 4, 2] };

  // corps entier : roulade, victoire, défaite, apparition
  function fullBody(S, t, o) {
    const a = S.a2, u = clamp(a.t / a.dur, 0, 1);
    for (let i = 0; i < N; i++) o[i] = 0;
    if (a.kind === 'dash') {
      const st = S.style;
      const fwd = a.dz, side = a.dx;
      const roll = st === 'agile' && fwd > 0.45;   // ranger : pas chassé (l'arc long ne roule pas)
      const tuck = sstep(0, 0.22, u) * (1 - sstep(0.7, 1, u));
      if (roll) {
        // roulade avant : rotation complète autour des hanches, corps groupé
        const r = wrapA(TAU * sstep(0.08, 0.78, u));   // (-π, π] : le mélange de sortie ne « dévisse » pas
        addR(o, 'hips', r, 0, 0);
        // pivot au centre du corps groupé (au-dessus et devant les hanches), gardé à hauteur de rayon
        const Lg = S.legLen, hy = S.restP[B.hips * 3 + 1], cy = 0.32 * Lg, cz = 0.12 * Lg, Rt = 0.7 * Lg;
        const ry = Rt - (cy * Math.cos(r) - cz * Math.sin(r)), rz = -(cy * Math.sin(r) + cz * Math.cos(r)) + cz;
        const rw = sstep(0, 0.14, u) * (1 - sstep(0.8, 1, u)); S.rollW = rw;
        o[POS + 1] = ((ry - hy) / Lg) * rw; o[POS + 2] = (rz / Lg) * rw;
        addR(o, 'spine', 0.55 * tuck, 0, 0); addR(o, 'chest', 0.35 * tuck, 0, 0); addR(o, 'head', 0.45 * tuck, 0, 0);
        addR(o, 'legL', -1.9 * tuck, 0, 0.1 * tuck); addR(o, 'legR', -1.7 * tuck, 0, -0.1 * tuck);
        addR(o, 'shinL', 2.2 * tuck, 0, 0); addR(o, 'shinR', 2.1 * tuck, 0, 0);
        addR(o, 'armL', -0.9 * tuck, 0, 0.3 * tuck); addR(o, 'armR', -0.9 * tuck, 0, -0.3 * tuck);
        addR(o, 'forearmL', -1.5 * tuck, 0, 0); addR(o, 'forearmR', -1.5 * tuck, 0, 0);
        S.groundW = 1 - rw;
      } else {
        // esquive / charge : buste penché dans la direction, jambes en fente, bras qui traînent
        const lean = Math.sin(u * PI) * (st === 'heavy' || st === 'noble' ? 0.5 : 0.65);
        const lx = fwd, lz = side;
        o[RIG] = lean * 0.15 * lx; o[RIG + 1] = -lean * 0.2 * lz;
        addR(o, 'spine', lean * 0.75 * lx, 0, -lean * 0.5 * lz); addR(o, 'chest', lean * 0.4 * lx, 0, -lean * 0.3 * lz);
        addR(o, 'head', -lean * 0.5 * lx, 0, lean * 0.3 * lz);
        o[POS + 1] = -0.08 * tuck;
        const g = st === 'caster' || st === 'dread';
        addR(o, 'legL', (-0.7 * lx + 0.2) * tuck, 0, (0.3 * lz + 0.08) * tuck); addR(o, 'shinL', 0.8 * tuck, 0, 0);
        addR(o, 'legR', (0.55 * lx - 0.1) * tuck, 0, (0.3 * lz - 0.08) * tuck); addR(o, 'shinR', 0.6 * tuck, 0, 0);
        if (st === 'heavy' || st === 'noble') {      // charge épaule/bouclier
          addR(o, 'armL', -1.0 * tuck, -0.3 * tuck, 0.2 * tuck); addR(o, 'forearmL', -1.3 * tuck, 0, 0);
          addR(o, 'armR', 0.5 * tuck, 0, -0.3 * tuck); addR(o, 'forearmR', -0.6 * tuck, 0, 0);
        } else {                                     // bras qui traînent
          addR(o, 'armL', (g ? 0.9 : 0.6) * tuck, 0, 0.45 * tuck); addR(o, 'forearmL', -0.3 * tuck, 0, 0);
          addR(o, 'armR', (g ? 0.9 : 0.6) * tuck, 0, -0.45 * tuck); addR(o, 'forearmR', -0.3 * tuck, 0, 0);
        }
        S.groundW = 1;
      }
      return sstep(0, 0.12, u) * (1 - sstep(0.75, 1, u));
    }
    if (a.kind === 'present') {
      const c = CP[S.style] || CP.heavy;
      evalClip(c, u, o); S.presentMask = c.mask; S.groundW = 1;
      if (u > 0.2 && u < 0.75) { S.face.browUp = 0.4; S.face.smile = S.style === 'dread' ? -0.2 : 0.6; }
      return sstep(0, 0.12, u) * (1 - sstep(0.75, 1, u)) * (1 - S.mv);
    }
    if (a.kind === 'spawn') {
      // réception accroupie puis redressement, regard circulaire
      const c = 1 - sstep(0.1, 0.85, u);
      o[POS + 1] = 0;
      addR(o, 'legL', -0.9 * c, 0, 0.12 * c); addR(o, 'legR', -0.5 * c, 0, -0.12 * c);
      addR(o, 'shinL', 1.5 * c, 0, 0); addR(o, 'shinR', 1.3 * c, 0, 0);
      addR(o, 'footL', -0.6 * c, 0, 0); addR(o, 'footR', -0.8 * c, 0, 0);
      addR(o, 'spine', 0.45 * c, 0, 0); addR(o, 'chest', 0.2 * c, 0, 0); addR(o, 'head', -0.35 * c, 0.4 * Math.sin(u * TAU) * (1 - u), 0);
      addR(o, 'armL', -0.4 * c, 0, 0.6 * c); addR(o, 'armR', -0.4 * c, 0, -0.6 * c); addR(o, 'forearmL', -0.4 * c, 0, 0); addR(o, 'forearmR', -0.4 * c, 0, 0);
      S.groundW = 1;
      return 1 - sstep(0.75, 1, u);
    }
    if (a.kind === 'victory') {
      const st = S.style, in1 = sstep(0, 0.35, u), pulse = Math.sin(a.t * 3.2);
      S.groundW = 1;
      if (st === 'caster' || st === 'dread') {
        addR(o, 'armL', -2.4 * in1, -0.2 * in1, 0.5 * in1); addR(o, 'forearmL', -0.3 * in1, 0, 0);
        addR(o, 'armR', (st === 'dread' ? -0.3 : -2.6) * in1, 0, -(st === 'dread' ? 1.2 : 0.4) * in1); addR(o, 'forearmR', -0.3 * in1, 0, 0);
        addR(o, 'chest', -0.2 * in1, 0, 0); addR(o, 'head', (st === 'dread' ? 0.05 : -0.3) * in1, 0, (st === 'dread' ? 0.2 : 0) * in1);
        addR(o, 'spine', -0.08 * in1 + 0.03 * pulse, 0, 0);
      } else if (st === 'noble') {
        addR(o, 'armR', -1.6 * in1, 0.5 * in1, -0.1 * in1); addR(o, 'forearmR', -1.5 * in1, 0, 0); addR(o, 'wristR', 0.4 * in1, 0, 0);
        addR(o, 'armL', 0, 0, 0.1 * in1); addR(o, 'chest', -0.12 * in1, 0, 0); addR(o, 'head', -0.18 * in1, 0, 0);
      } else if (st === 'agile') {
        addR(o, 'armR', -1.2 * in1, 0.3 * in1, -0.6 * in1); addR(o, 'forearmR', -1.2 * in1, 0, 0); 
        addR(o, 'armL', 0.1 * in1, 0, 0.3 * in1); addR(o, 'forearmL', -0.5 * in1, 0, 0);
        addR(o, 'hips', 0, 0, 0.06 * in1); o[POS] = 0.05 * in1; addR(o, 'head', -0.1 * in1, -0.2 * in1, -0.1 * in1);
      } else {   // heavy / ranger : arme levée, poing serré, poitrine en avant
        addR(o, 'armR', (-2.85 + 0.12 * pulse) * in1, 0, -0.25 * in1); addR(o, 'forearmR', -0.25 * in1, 0, 0);
        addR(o, 'armL', (st === 'ranger' ? -0.2 : -0.5) * in1, 0, 0.35 * in1); addR(o, 'forearmL', -1.6 * in1, 0, 0);
        addR(o, 'chest', -0.18 * in1, 0, 0); addR(o, 'spine', -0.06 * in1, 0, 0); addR(o, 'head', -0.25 * in1, 0, 0);
        addR(o, 'legL', -0.1 * in1, 0, 0.12 * in1); addR(o, 'legR', 0.05 * in1, 0, -0.12 * in1);
      }
      S.face.smile = in1; S.face.browUp = 0.5 * in1; if (st === 'heavy') S.face.jaw = Math.max(S.face.jaw, 0.6 * (1 - sstep(0.4, 0.8, u)) * in1);
      return in1;
    }
    if (a.kind === 'defeat') {
      // genoux qui cèdent, buste affaissé, bras ballants, tête basse
      const c = sstep(0, 0.7, u);
      addR(o, 'legL', -0.8 * c, 0, 0.1 * c); addR(o, 'legR', -0.3 * c, 0, -0.1 * c);
      addR(o, 'shinL', 1.6 * c, 0, 0); addR(o, 'shinR', 1.2 * c, 0, 0); addR(o, 'footL', -0.4 * c, 0, 0);
      addR(o, 'spine', 0.4 * c, 0, 0.08 * c); addR(o, 'chest', 0.25 * c, 0, 0); addR(o, 'head', 0.5 * c, 0.15 * c, 0.15 * c);
      addR(o, 'armL', 0.1 * c, 0, 0.05 * c); addR(o, 'armR', 0.1 * c, 0, -0.05 * c);
      addR(o, 'forearmL', -0.1 * c, 0, 0); addR(o, 'forearmR', -0.1 * c, 0, 0);
      S.face.browUp = -0.5 * c; S.face.blink = Math.max(S.face.blink, 0.55 * c); S.face.smile = -0.6 * c;
      S.groundW = 1;
      return c;
    }
    return 0;
  }

  // ------------------------------------------------------------------ ressorts (cape, cheveux, ceinture)
  // spr : 7 liens × [ax, vx, az, vz] : 0..2 cape A/B/C, 3..4 cheveux A/B, 5..6 ceinture L/R
  const CAPE_MIN = -0.1;
  const SPR_K = [55, 80, 110, 120, 160, 140, 140], SPR_D = [5.5, 6.5, 7.5, 7, 8, 6, 6];
  function springs(S, t, dt, o) {
    const sp = S.spr;
    const speedL = clamp(S.speed * S.u2l / Math.max(0.3, S.legLen) / 6, 0, 1.4);
    const flutter = noise(t * 3.1, 1.7) * (0.06 + 0.08 * speedL);
    // inclinaison du parent (buste) pour que la cape pende vers le sol
    const chestPitch = o[B.hips * 3] + o[B.spine * 3] + o[B.chest * 3] + o[RIG];
    const chestRoll = o[B.hips * 3 + 2] + o[B.spine * 3 + 2] + o[B.chest * 3 + 2] + o[RIG + 1];
    const headPitch = chestPitch + o[B.neck * 3] + o[B.head * 3];
    const yawR = clamp(S.yawRate, -12, 12);
    const latL = S.lat * S.u2l / Math.max(0.3, S.legLen);
    const accL = clamp(S.acc * S.u2l / Math.max(0.3, S.legLen), -40, 40);
    const bobAcc = S.bobAcc;
    const n = Math.max(1, Math.min(4, Math.ceil(dt / (1 / 60))));
    const h = dt / n;
    for (let i = 0; i < 7; i++) {
      const j = i * 4;
      let tx, tz, ax = 0, az = 0;
      if (i < 3) {
        const lift = [0.32, 0.14, 0.1][i];
        tx = clamp(-wrapA(chestPitch) * (i === 0 ? 1 - S.rollW : 0), -1.4, 1.4) + 0.04 + lift * speedL + flutter * (i + 1) * 0.6;
        tz = clamp(-wrapA(chestRoll) * (i === 0 ? 1 : 0), -1, 1) + yawR * 0.05 * (i === 0 ? 1 : 0.6) - latL * 0.1 + noise(t * 2.3, i * 3.1) * 0.04 * speedL;
        ax = accL * 0.012 * (i === 0 ? 1 : 0.5); az = -yawR * 0.4;
      } else if (i < 5) {
        tx = clamp(-wrapA(headPitch) * (i === 3 ? 0.8 : 0), -1.2, 1.2) + 0.25 * speedL * (i === 3 ? 1 : 0.5) + flutter * 0.4;
        tz = clamp(-wrapA(chestRoll) * 0.5, -0.8, 0.8) + yawR * 0.03;
        ax = accL * 0.01; az = -yawR * 0.3;
      } else {
        const L = i === 5 ? 1 : -1;
        tx = clamp(-wrapA(o[B.hips * 3]), -1, 1) + 0.2 * speedL;
        tz = clamp(-wrapA(o[B.hips * 3 + 2]), -0.8, 0.8) + L * 0.03 * speedL;
        ax = accL * 0.015 - bobAcc * 0.02; az = -yawR * 0.25;
      }
      const K = SPR_K[i], D = SPR_D[i];
      for (let s = 0; s < n; s++) {
        sp[j + 1] += (K * (tx - sp[j]) - D * sp[j + 1] + ax) * h; sp[j] += sp[j + 1] * h;
        sp[j + 3] += (K * (tz - sp[j + 2]) - D * sp[j + 3] + az) * h; sp[j + 2] += sp[j + 3] * h;
      }
      // fouet : le lien suivant reçoit l'inverse de la vitesse du précédent
      if (i === 1 || i === 2 || i === 4) { sp[j + 1] -= sp[j - 3] * 0.02; sp[j + 3] -= sp[j - 1] * 0.02; }
      for (let q = 0; q < 4; q++) if (!(sp[j + q] === sp[j + q]) || Math.abs(sp[j + q]) > 50) sp[j + q] = 0;
      sp[j] = clamp(sp[j], -1.5, 1.7); sp[j + 2] = clamp(sp[j + 2], -1.2, 1.2);
    }
    // la cape ne passe jamais devant le plan du torse : angle cumulé (repos + ressort) ≥ CAPE_MIN
    let cum = 0;
    for (let i = 0; i < 3; i++) {
      const bi = B[['capeA', 'capeB', 'capeC'][i]] * 3, j = i * 4;
      const restC = S.rest[bi] + o[bi];
      if (cum + restC + sp[j] < CAPE_MIN) { sp[j] = CAPE_MIN - cum - restC; if (sp[j + 1] < 0) sp[j + 1] = 0; }
      cum += restC + sp[j];
    }
    const map = ['capeA', 'capeB', 'capeC', 'hairA', 'hairB', 'beltL', 'beltR'];
    for (let i = 0; i < 7; i++) { const bi = B[map[i]] * 3; o[bi] += sp[i * 4]; o[bi + 2] += sp[i * 4 + 2]; }
    // inertie du buste (petit ressort sur l'accélération)
    S.chestJv += (-90 * S.chestJ - 9 * S.chestJv - accL * 0.25) * dt; S.chestJ += S.chestJv * dt;
    if (!(S.chestJ === S.chestJ)) { S.chestJ = 0; S.chestJv = 0; }
    S.chestJ = clamp(S.chestJ, -0.25, 0.25);
    addR(o, 'chest', -S.chestJ * 0.6, 0, 0); addR(o, 'spine', -S.chestJ * 0.4, 0, 0);
    addR(o, 'head', S.chestJ * 0.5, 0, 0);
  }

  // ------------------------------------------------------------------ sol : hanches à la bonne hauteur
  function legVert(S, o, L) {
    const hx = o[B.hips * 3], hz = o[B.hips * 3 + 2];
    const a1 = hx + o[B['leg' + L] * 3] + S.rest[B['leg' + L] * 3];
    const z1 = hz + o[B['leg' + L] * 3 + 2] + S.rest[B['leg' + L] * 3 + 2];
    const a2 = a1 + o[B['shin' + L] * 3] + S.rest[B['shin' + L] * 3];
    const cz = Math.cos(z1);
    return (S.l1 * Math.cos(a1) + S.l2 * Math.cos(a2)) * cz;
  }

  // ------------------------------------------------------------------ mise à jour d'une image
  const tmpOut = { v: 0 };
  const ZERO = new Float32Array(N);
  function update(root, time, st, self) {
    const ud = root && root.userData; if (!ud) return;
    let S = ud._ha;
    if (!S) { S = ud._ha = makeState(root, ud.spec); }
    if (!S.valid) return;
    st = st || {};
    time = fin(+time, S.lastT == null ? 0 : S.lastT);
    const src = self ? 1 : 2;
    let dt = (S.lastT == null || S.src !== src) ? 0 : time - S.lastT;
    if (!(dt > 0)) dt = 0; if (dt > 0.1) dt = 0.1;
    S.lastT = time; S.src = src;
    if (!self) { S.lastExt = now(); S.everExt = true; }

    // --- état du jeu (héros joueur)
    let P = null;
    try { const r = G.game && G.game.run; if (r && r.player && r.player.hero === root) P = r.player; } catch (e) { P = null; }
    if (P) {
      const dT = fin(P.dashT, 0);
      if (dT > 0 && !(S.dashPrev > 0)) trigger(root, 'dash', { dir: P.dashDir, duration: dT });
      S.dashPrev = dT;
      if (P.dead && !S.dead) { S.dead = true; trigger(root, 'defeat'); }
    }

    // --- vitesse déduite du déplacement
    const yaw = fin(root.rotation.y, 0);
    S.yawW = yaw;
    const px = fin(root.position.x, 0), pz = fin(root.position.z, 0);
    if (dt > 0) {
      if (!S.havePos) { S.px = px; S.pz = pz; S.havePos = true; S.pyaw = yaw; }
      const ddx = px - S.px, ddz = pz - S.pz;
      const inst = Math.hypot(ddx, ddz) / dt;
      if (inst < 45 && Math.hypot(ddx, ddz) < 4) {
        const k = 1 - Math.exp(-dt / 0.07);
        const nvx = S.vx + (ddx / dt - S.vx) * k, nvz = S.vz + (ddz / dt - S.vz) * k;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const fwdNew = nvx * s + nvz * c;
        const accRaw = (fwdNew - S.fwd) / dt;
        S.acc = damp(S.acc, clamp(accRaw, -80, 80), 10, dt);
        S.vx = nvx; S.vz = nvz;
        S.fwd = fwdNew; S.lat = nvx * c - nvz * s;
      }
      S.px = px; S.pz = pz;
      let dy = wrapA(yaw - S.pyaw); S.pyaw = yaw;
      if (Math.abs(dy) > 1.2) dy = 0;           // rotation brutale (téléportation / spin) : ignorée
      S.yawRate = damp(S.yawRate, dy / dt, 8, dt);
    }
    if (!(S.vx === S.vx) || !(S.vz === S.vz)) { S.vx = S.vz = S.fwd = S.lat = S.acc = 0; }
    S.speed = Math.hypot(S.vx, S.vz);
    const spL = S.speed * S.u2l;                 // vitesse en unités du squelette
    const leg = Math.max(0.2, S.legLen);
    const dashing = S.a2.on && S.a2.kind === 'dash';
    const tgtMv = dashing || S.a2.kind === 'defeat' ? 0 : sstep(0.12 * leg, 0.9 * leg, spL);
    S.mv = damp(S.mv, tgtMv, tgtMv > S.mv ? 9 : 7, dt);
    S.runK = damp(S.runK, sstep(2.0 * leg, 4.6 * leg, spL), 5, dt);
    S.exert = clamp(S.exert + (S.runK * S.mv * 0.08 - 0.05) * dt + (S.a1.on ? 0.15 * dt : 0), 0, 1);
    // direction locale et rotation du bassin (marche latérale / à reculons)
    if (S.speed > 0.05) {
      const ang = Math.atan2(S.lat, S.fwd);
      const fa = Math.abs(ang) <= PI / 2 + 0.15 ? ang : ang - PI * Math.sign(ang);
      const hy = clamp(fa * 0.5, -0.7, 0.7) * S.mv;
      S.hipYaw = damp(S.hipYaw, hy, 8, dt);
      S.ldx = Math.sin(ang - S.hipYaw); S.ldz = Math.cos(ang - S.hipYaw);
      S.dirSign = S.ldz >= -0.15 ? 1 : -1;
    } else { S.hipYaw = damp(S.hipYaw, 0, 6, dt); if (S.ldx == null) { S.ldx = 0; S.ldz = 1; } }
    // foulée : longueur de cycle selon la vitesse, amplitude « pied posé » (2·l·sin A = L/2)
    const cyc = leg * (2.1 + 0.9 * S.runK) / S.sty.walkMul;
    S.stride = Math.asin(clamp(cyc / (4 * leg) * (0.75 + 0.25 * sstep(0, 2 * leg, spL)), 0.12, 0.8)) * (0.85 - 0.1 * S.runK);
    if (S.stride > 0.66) S.stride = 0.66;
    S.ph += S.dirSign * TAU * (spL / cyc) * dt;
    if (S.ph > 1e4 || S.ph < -1e4) S.ph = S.ph % TAU;
    S.hipX = 0.05 * S.runK * S.mv;
    S.accLean = damp(S.accLean, clamp(S.acc * S.u2l / leg * 0.012, -0.15, 0.25) * S.sty.lean, 6, dt);
    const bankT = clamp(-S.yawRate * spL / leg * 0.025, -0.22, 0.22) * S.sty.lean;
    S.bank = damp(S.bank, bankT, 7, dt);
    const prevBobY = S.bobY || 0;

    // --- minuteries
    S.combat = Math.max(0, S.combat - dt); S.combat01 = sstep(0, 1, S.combat);
    S.suppress = Math.max(0, S.suppress - dt); S.comboT = Math.max(0, S.comboT - dt);
    // attaque fournie par le jeu : front montant de st.attack
    const atk = clamp(fin(+st.attack, 0), 0, 1);
    if (atk > S.atkPrev + 0.5 && S.suppress <= 0) playAttack(S);
    else if (atk > S.atkPrev + 1e-4 && atk > 0.02 && !(S.a1.on && S.a1.kind === 'attack' && !S.a1.driven)) {
      // st.attack qui MONTE progressivement (outil d'aperçu, PNJ) : progression pilotée de l'attaque
      if (!S.a1.on || !S.a1.driven) { playAttack(S); S.a1.driven = true; }
      S.a1.t = clamp(atk, 0, 1) * 0.7 * S.a1.dur - dt; S.drivenT = 0.15;
    }
    if (S.a1.driven && !((S.drivenT = (S.drivenT || 0) - dt) > 0)) S.a1.driven = false;
    S.atkPrev = atk;
    // pose forcée (QA / aperçu) : st.pose6 = { a:'attack'|'cast'|'ultimate'|'dash'|'victory'|'defeat'|'spawn'|'run', u:0..1, v:variante, ph:phase }
    const p6 = st.pose6;
    if (p6 && typeof p6 === 'object') forcePose(root, S, p6, dt);
    const wind = clamp(fin(+st.windup, 0), 0, 1);

    // --- pose de base
    const o = S.base; o.fill(0);
    S.groundW = 1 - 0.6 * S.runK * S.mv; S.rollW = 0;
    locomotion(S, time + fin(ud.phase, 0), o);
    // garde de combat
    const hw = (1 - S.mv) * (1 - S.combat01);
    const hp = HERO_IDLE[S.weapon];
    if (hp && hw > 1e-3) for (let i = 0; i < NB; i++) if (hp.m[i]) { const j = i * 3; o[j] += hp.a[j] * hw; o[j + 1] += hp.a[j + 1] * hw; o[j + 2] += hp.a[j + 2] * hw; }
    const gw = S.combat01 * (1 - 0.5 * S.mv);
    const gp = GUARD[S.weapon];
    if (gp && gw > 1e-3) for (let i = 0; i < NB; i++) if (gp.m[i]) { const j = i * 3; o[j] += gp.a[j] * gw; o[j + 1] += gp.a[j + 1] * gw; o[j + 2] += gp.a[j + 2] * gw; }
    // préparation venue du jeu (windup) : anticipation de la 1re clé
    if (wind > 0.01) { const c = (CA[S.weapon] || CA.sword)[0]; const kv = c.kv[1]; for (let j = 0; j < c.ch.length; j++) { const k = c.ch[j]; o[k] += (kv[k] - o[k]) * wind * (k >= POS || LOWER[BONES[(k / 3) | 0]] ? 1 - S.mv : 1); } }
    // gestes de repos
    const calm = (1 - S.mv) * (1 - S.combat01) * (S.a1.on || S.a2.on ? 0 : 1);
    const f = S.fid;
    if (f.on) { f.t += dt; if (f.t >= f.dur) { f.on = false; f.next = lerp(S.sty.fidget[0], S.sty.fidget[1], rnd(S)); } }
    else if (calm > 0.9) { f.next -= dt; if (f.next <= 0) { const L = S.idles; f.id = L[Math.floor(rnd(S) * L.length) % L.length]; f.t = 0; f.dur = 1.6 + rnd(S) * 1.2; f.side = rnd(S) < 0.5 ? -1 : 1; f.on = true; } }
    S.fidW = damp(S.fidW || 0, f.on ? calm : 0, 6, dt); S.fidLid = 0;
    if (f.on || S.fidW > 1e-3) fidget(S, time, o, S.fidW);
    // regard (saccades lissées) et anticipation des virages
    const gz = S.gaze; gz.next -= dt;
    if (gz.next <= 0) { gz.tx = (rnd(S) - 0.5) * 0.9 * S.sty.gaze * (1 - S.mv * 0.6); gz.ty = (rnd(S) - 0.5) * 0.25 - 0.03; gz.next = 0.8 + rnd(S) * 3; if (rnd(S) < 0.35) gz.tx = 0; }
    gz.x = damp(gz.x, gz.tx * (1 - S.combat01 * 0.7) + clamp(S.yawRate * 0.08, -0.4, 0.4), 9, dt);
    gz.y = damp(gz.y, gz.ty * (1 - S.mv), 9, dt);
    addR(o, 'neck', gz.y * 0.4, gz.x * 0.35, 0); addR(o, 'head', gz.y * 0.6, gz.x * 0.65, 0);

    // --- actions corps entier
    let out = S.out;
    out.set(o);
    const a2 = S.a2;
    if (a2.on) {
      a2.t += dt;
      if (!a2.loop && a2.t >= a2.dur) { a2.on = false; if (a2.kind === 'dash') S.a2.kind = ''; }
      else {
        const act = S.act;
        const w = fullBody(S, time, act);
        for (let i = 0; i < NB; i++) {
          const j = i * 3; const wl = FACE[BONES[i]] || SEC[BONES[i]] ? 0 : w;
          if (a2.kind === 'present') { const wm = wl * (S.presentMask ? S.presentMask[i] : 1); out[j] += (act[j] - o[j]) * wm; out[j + 1] += (act[j + 1] - o[j + 1]) * wm; out[j + 2] += (act[j + 2] - o[j + 2]) * wm; }
          else if (a2.kind === 'victory' || a2.kind === 'defeat') { out[j] += (o[j] * (1 - wl) + (o[j] * 0.25 + act[j]) * wl) - o[j]; out[j + 1] += (act[j + 1] - 0) * wl; out[j + 2] += (o[j + 2] * 0.25 + act[j + 2] - o[j + 2]) * wl; }
          else { out[j] += (act[j] - o[j]) * wl; out[j + 1] += (act[j + 1] - o[j + 1]) * wl; out[j + 2] += (act[j + 2] - o[j + 2]) * wl; }
        }
        if (a2.kind !== 'present' || (S.presentMask && S.presentMask[B.hips])) for (let k = POS; k < N; k++) out[k] += (act[k] - o[k]) * w;
      }
    }
    // --- action haut du corps
    const a1 = S.a1;
    if (!a1.on) S.a1w = 0;
    if (a1.on) {
      a1.t += dt;
      const u = a1.dur > 0 ? a1.t / a1.dur : 1;
      if (u >= 1) { S.a1w = 0; a1.on = false; a1.driven = false; a1.forced = ''; }
      else {
        const c = a1.clip, act = S.act;
        evalClip(c, u, act);
        const w = envW(u, 0.08, 0.66); S.a1w = w;
        const legG = (1 - S.mv) * (S.a2.on ? 0 : 1);
        const ch = c.ch;
        for (let j = 0; j < ch.length; j++) {
          const k = ch[j];
          const bn = k < POS ? BONES[(k / 3) | 0] : 'hips';
          const ww = (LOWER[bn] || k >= POS) ? w * legG : w;
          out[k] += (act[k] - out[k]) * ww;
        }
        if (c.heavy || a1.kind === 'ultimate') S.face.jaw = Math.max(S.face.jaw, 0.7 * Math.sin(clamp(u * 1.6, 0, 1) * PI));
      }
    }
    // --- réaction aux impacts (ressort additif)
    S.hitV += (-120 * S.hitH - 13 * S.hitV) * dt; S.hitH += S.hitV * dt;
    if (!(S.hitH === S.hitH) || !(S.hitV === S.hitV)) { S.hitH = 0; S.hitV = 0; }
    S.hitH = clamp(S.hitH, -0.6, 1.4);
    const hH = S.hitH;
    if (Math.abs(hH) > 1e-4) {
      const b = S.hitBack, sd = S.hitSide;
      addR(out, 'spine', -0.18 * hH * b, 0.12 * hH * sd, 0.1 * hH * sd);
      addR(out, 'chest', -0.28 * hH * b, 0.15 * hH * sd, 0.08 * hH * sd);
      addR(out, 'neck', -0.15 * hH * b, 0, 0);
      addR(out, 'head', -0.35 * hH * b, -0.25 * hH * sd, 0.2 * hH * sd);
      addR(out, 'armL', 0.15 * hH, 0, 0.3 * hH); addR(out, 'armR', 0.15 * hH, 0, -0.3 * hH);
      addR(out, 'forearmL', -0.35 * hH, 0, 0); addR(out, 'forearmR', -0.35 * hH, 0, 0);
      out[POS + 2] -= 0.04 * hH * b; out[POS + 1] -= 0.02 * Math.abs(hH);
      addR(out, 'shinL', 0.1 * Math.abs(hH), 0, 0); addR(out, 'shinR', 0.1 * Math.abs(hH), 0, 0);
    }
    // --- fondu enchaîné anti-« pop »
    if (S.xf > 0) {
      S.xf = Math.max(0, S.xf - dt * (S.xfRate || 8));
      const x = S.xf * S.xf * (3 - 2 * S.xf);
      for (let k = 0; k < N; k++) out[k] += (S.snap[k] - out[k]) * x;
    }
    // --- garde-fous anatomiques (pas de genou ni de coude inversé)
    for (let s = 0; s < 2; s++) {
      const L = s ? 'R' : 'L';
      const kn = B['shin' + L] * 3, el = B['forearm' + L] * 3;
      out[kn] = clamp(out[kn], -S.rest[kn] - 0.02, 2.6 - S.rest[kn]);
      out[el] = clamp(out[el], -2.6 - S.rest[el], 0.05 - S.rest[el]);
      const th = B['leg' + L] * 3; out[th] = clamp(out[th], -2.5, 1.3);
    }
    // --- prise de l'arme : le poignet garde l'arme (axe +Z de weaponR/L) à un angle lisible (épée 45° vers l'avant-haut,
    //     masse/bâton/sceptre/arc verticaux, dagues vers l'avant-haut), sauf pendant les attaques/sorts qui pilotent le poignet
    const grip = GRIP[S.weapon];
    if (grip) {
      const gwt = (1 - (S.a1w || 0)) * (S.a2.on && S.a2.kind === 'dash' ? 0.3 : 1);
      for (let s2 = 0; s2 < 2; s2++) {
        const tgt = grip[s2]; if (tgt == null || gwt <= 1e-3) continue;
        const sd = s2 ? 'L' : 'R';
        const ia = B['arm' + sd] * 3, ifo = B['forearm' + sd] * 3, iw = B['wrist' + sd] * 3;
        const ax = S.rest[ia] + out[ia], ay = S.rest[ia + 1] + out[ia + 1], az = S.rest[ia + 2] + out[ia + 2];
        const fx = S.rest[ifo] + out[ifo];
        // recherche du pli de poignet qui aligne le mieux l'axe +Z de l'arme sur la direction voulue (bras complet, abduction comprise)
        const ty = -Math.sin(tgt), tz = Math.cos(tgt);
        let lo = -1.0, hi = 1.0;
        for (let it = 0; it < 14; it++) {
          const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
          if (gripScore(ax, ay, az, fx + m1, ty, tz) < gripScore(ax, ay, az, fx + m2, ty, tz)) lo = m1; else hi = m2;
        }
        const want = (lo + hi) * 0.5 - S.rest[iw];
        out[iw] += (want - out[iw]) * gwt;
      }
    }
    // --- sol : la jambe la plus longue touche le sol (réduit si roulade)
    const lv = Math.max(legVert(S, out, 'L'), legVert(S, out, 'R'));
    const restV = S.restV == null ? (S.restV = legVert(S, ZERO, 'L') || S.legLen) : S.restV;
    if (S.xf <= 0) { /* snap libre */ }
    const drop = (lv - restV) / leg;
    const gW = clamp(fin(S.groundW, 1), 0, 1), cY = out[POS + 1];
    out[POS + 1] = Math.max(cY + gW * drop, drop);   // jamais les pieds sous le sol ; hors appui (gW<1) : seulement ce plancher   // hors appui : seulement empêcher les pieds de passer sous le sol
    S.bobY = out[POS + 1];
    S.bobAcc = dt > 0 ? damp(S.bobAcc || 0, ((S.bobY - prevBobY) / dt), 12, dt) : (S.bobAcc || 0);

    // --- mouvements secondaires
    springs(S, time, dt, out);
    // --- visage
    faceUpdate(S, time, dt);

    // état publié pour les autres modules (HeroVFX…) : objet réutilisé, pas d'allocation
    const as = ud.animState;
    if (as) { as.attack = a1.on ? clamp(envW(clamp(a1.t / (a1.dur || 1), 0, 1), 0.1, 0.6), 0, 1) : 0; as.action = a1.on ? a1.kind || 'attack' : (a2.on ? a2.kind : ''); as.moving = S.mv; }
    apply(S, out, ud);
    void tmpOut;
  }

  function faceUpdate(S, t, dt) {
    const F = S.face, bl = S.blink;
    // clignements (parfois doubles), plus fréquents en combat
    bl.next -= dt;
    if (bl.t < 0 && bl.next <= 0) { bl.t = 0; bl.dbl = rnd(S) < 0.2; }
    let b = 0;
    if (bl.t >= 0) {
      bl.t += dt;
      const d = 0.14;
      b = Math.sin(clamp(bl.t / d, 0, 1) * PI);
      if (bl.t >= d) { if (bl.dbl) { bl.dbl = false; bl.t = -0.08; } else { bl.t = -1; bl.next = (S.combat01 > 0.5 ? 1.2 : 2.2) + rnd(S) * 3.5; } }
    } else if (bl.t > -1 && bl.t < 0) { bl.t += dt; if (bl.t >= 0) bl.t = 0; }
    // micro-expressions
    const hh = clamp(S.hitH, 0, 1);
    const atkK = S.a1.on ? 1 : 0;
    const tgtFur = clamp(S.combat01 * 0.6 + atkK * 0.5 + hh * 0.8 + (S.style === 'dread' ? 0.3 : 0) + (S.style === 'heavy' ? 0.15 : 0), 0, 1);
    F.furrow = damp(F.furrow, tgtFur, 6, dt);
    const tgtUp = (S.a2.kind === 'victory' ? 0.5 : 0) + hh * 0.9 + noise(t * 0.35, 9) * 0.15 * (1 - S.combat01) - (S.a2.kind === 'defeat' ? 0.5 : 0);
    F.browUp = damp(F.browUp, tgtUp, 8, dt);
    const tgtJaw = clamp(S.exert * 0.35 * (0.6 + 0.4 * Math.sin(t * 6)) + hh * 0.5 + (S.a1.on && (S.a1.clip && S.a1.clip.heavy) ? 0.4 : 0), 0, 1);
    F.jaw = damp(F.jaw, tgtJaw, 10, dt);
    const tgtSmile = S.a2.kind === 'victory' ? 1 : S.a2.kind === 'defeat' ? -0.6 : (S.style === 'noble' ? 0.15 : S.style === 'agile' ? 0.25 : 0) - S.combat01 * 0.3;
    F.smile = damp(F.smile, tgtSmile, 4, dt);
    F.blink = Math.max(b, hh * 0.6, S.fidLid || 0, S.a2.kind === 'defeat' ? 0.55 : 0, S.a2.kind === 'dash' ? 0.4 : 0);
  }

  function apply(S, o, ud) {
    const bones = S.bones, rest = S.rest, fc = S.faceCfg, F = S.face;
    for (let i = 0; i < NB; i++) {
      const b = bones[i]; if (!b) continue;
      const n = BONES[i];
      if (n === 'weaponL' || n === 'weaponR' || n === 'back') continue;
      if (FACE[n]) continue;
      const j = i * 3;
      let x = rest[j] + o[j], y = rest[j + 1] + o[j + 1], z = rest[j + 2] + o[j + 2];
      if (!(x === x)) x = rest[j]; if (!(y === y)) y = rest[j + 1]; if (!(z === z)) z = rest[j + 2];
      b.rotation.set(x, y, z);
    }
    // hanches : position (fraction de jambe → unités locales)
    const hb = bones[B.hips];
    if (hb) {
      const L = S.legLen, j = B.hips * 3;
      const px = S.restP[j] + fin(o[POS] * L, 0), py = S.restP[j + 1] + fin(o[POS + 1] * L, 0), pz = S.restP[j + 2] + fin(o[POS + 2] * L, 0);
      hb.position.set(px, Math.max(S.restP[j + 1] * 0.15, py), pz);
    }
    // rig : inclinaison depuis les pieds (virage / esquive)
    if (S.hasRig && S.rig) {
      const rr = S.rigRest;
      const rx = clamp(fin(o[RIG], 0), -0.6, 0.6), rz = clamp(fin(o[RIG + 1], 0), -0.6, 0.6);
      S.rig.rotation.set(rr[3] + rx, rr[4], rr[5] + rz);
      // l'inclinaison pivote aux pieds : on relève d'autant que la pointe / le bord du pied descendrait
      const sc = S.rig.scale.y || 1;
      S.rig.position.set(rr[0], rr[1] + (0.24 * Math.abs(Math.sin(rx)) + 0.17 * Math.abs(Math.sin(rz))) * S.legLen * sc, rr[2]);
    }
    // visage
    const lid = clamp(F.blink, 0, 1);
    for (let s = 0; s < 2; s++) {
      const bi = B[s ? 'lidR' : 'lidL'], b = bones[bi]; if (!b) continue;
      const j = bi * 3;
      if (fc.lidScale) b.scale.set(S.restS[j], S.restS[j + 1] * (1 - 0.9 * lid) + 1e-3, S.restS[j + 2]);
      else if (fc.lidAxis === 'y') b.rotation.set(rest[j], rest[j + 1] + fc.lidClose * lid, rest[j + 2]);
      else b.rotation.set(rest[j] + fc.lidClose * lid, rest[j + 1], rest[j + 2]);
    }
    for (let s = 0; s < 2; s++) {
      const bi = B[s ? 'browR' : 'browL'], b = bones[bi]; if (!b) continue;
      const j = bi * 3, sg = s ? -1 : 1;
      b.position.set(S.restP[j], S.restP[j + 1] + fc.browLift * clamp(F.browUp - F.furrow * 0.4, -1, 1), S.restP[j + 2]);
      b.rotation.set(rest[j], rest[j + 1], rest[j + 2] - sg * fc.browTilt * F.furrow + sg * 0.08 * clamp(F.browUp, -1, 1));
    }
    const jb = bones[B.jaw];
    if (jb) { const j = B.jaw * 3; jb.rotation.set(rest[j] + fc.jawOpen * clamp(F.jaw, 0, 1), rest[j + 1], rest[j + 2]); }
    const mb = bones[B.mouth];
    if (mb) { const j = B.mouth * 3, sm = clamp(F.smile, -1, 1); mb.scale.set(S.restS[j] * (1 + fc.smile * sm), S.restS[j + 1] * (1 + 0.25 * clamp(F.jaw, 0, 1)), S.restS[j + 2]); mb.position.set(S.restP[j], S.restP[j + 1] + 0.004 * S.k * sm, S.restP[j + 2]); }
    void ud;
  }

  // ------------------------------------------------------------------ auto-animation (aperçus hors jeu)
  function hookSelf(root, S) {
    let mesh = null;
    const pick = (o) => { if (!mesh && o.isMesh && !o.userData.isOutline && o.visible !== false) mesh = o; };
    const chest = S.bones[B.chest] || S.bones[B.spine] || S.bones[B.hips];
    if (chest) chest.traverse(pick);
    if (!mesh) root.traverse(pick);
    if (!mesh) return;
    const prev = mesh.onBeforeRender;
    S.mesh = mesh;
    mesh.onBeforeRender = function () {
      if (typeof prev === 'function') { try { prev.apply(this, arguments); } catch (e) { warnOnce('prevOBR', e); } }
      try {
        const S2 = root.userData && root.userData._ha; if (!S2) return;
        const tn = now();
        if (tn - S2.lastSelf < 0.004) return;                 // une fois par image (ombres comprises)
        const external = S2.everExt && tn - S2.lastExt < 0.3;
        if (external) return;
        if (S2.everExt && !S2.dead && !(S2.a2.on && S2.a2.loop)) return; // en jeu : seulement mort / fin de partie
        const dtw = S2.lastSelf < 0 ? 0 : clamp(tn - S2.lastSelf, 0, 0.1);
        S2.lastSelf = tn; S2.selfT += dtw;
        update(root, S2.selfT, null, true);
      } catch (e) { warnOnce('self', e); }
    };
  }

  // ------------------------------------------------------------------ API
  function init(root, spec) {
    try {
      if (!root) return root;
      const ud = root.userData || (root.userData = {});
      if (spec) ud.spec = ud.spec || spec;
      const S = ud._ha = makeState(root, spec || ud.spec);
      ud.hero6 = ud.hero6 !== false;
      hookSelf(root, S);
      trigger(root, 'present');   // aperçu : geste de présentation ; en jeu, heroCreated/roomStart lancent 'spawn' (réception)
      ensureBus();
    } catch (e) { warnOnce('init', e); }
    return root;
  }
  function safeUpdate(root, time, st) { try { update(root, time, st, false); } catch (e) { const ud = root && root.userData; if (ud && !ud._haErr) { ud._haErr = 1; console.warn('[HeroAnim]', e); } } }

  const warned = {};
  function warnOnce(k, e) { if (warned[k]) return; warned[k] = 1; try { console.warn('[HeroAnim] ' + k, e); } catch (_) { /* rien */ } }

  // ------------------------------------------------------------------ bus (un seul abonnement global)
  function playerHero() { try { const r = G.game && G.game.run; const h = r && r.player && r.player.hero; return h && h.userData && h.userData._ha ? h : null; } catch (e) { return null; } }
  let busOn = false;
  function ensureBus() {
    if (busOn || !G.bus || typeof G.bus.on !== 'function') return;
    busOn = true;
    G.bus.on('skillCast', (e) => {
      const h = playerHero(); if (!h) return;
      const kind = e && e.kind, slot = e && e.slot;
      if (kind === 'passive') return;
      if (kind === 'basic' || (!kind && slot === 'cast1')) trigger(h, 'attack', {});
      else if (kind === 'ultimate' || slot === 'super') trigger(h, 'ultimate', {});
      else if (kind === 'melee' || (!kind && slot === 'cast2')) trigger(h, 'cast', { kind: 'melee' });
      else trigger(h, 'cast', { kind: kind || 'skill' });
    });
    G.bus.on('playerHit', (e) => { const h = playerHero(); if (h) trigger(h, 'hit', e || {}); });
    G.bus.on('runEnd', (e) => {
      try { const h = e && e.run && e.run.player && e.run.player.hero; if (h && h.userData && h.userData._ha) trigger(h, e.victory ? 'victory' : 'defeat'); } catch (er) { /* rien */ }
    });
    G.bus.on('heroCreated', (e) => { const h = e && e.hero; if (h && h.userData && h.userData._ha) trigger(h, 'spawn'); });
    G.bus.on('roomStart', () => { const h = playerHero(); if (h) { const S = h.userData._ha; S.havePos = false; S.dead = false; if (S.a2.loop) trigger(h, 'idle'); trigger(h, 'spawn'); } });
  }
  ensureBus();

  // ------------------------------------------------------------------ chaînage de animateCharacter
  function hook() {
    if (!G.GFX || typeof G.GFX.animateCharacter !== 'function' || G.GFX.animateCharacter._ha) return false;
    const prev = G.GFX.animateCharacter;
    const fn = function (group, time, st) {
      const ud = group && group.userData;
      if (ud && ud.hero6 && ud._ha) { safeUpdate(group, time, st); return; }
      if (ud && ud.hero6 && !ud._ha && ud.rig) { init(group, ud.spec); safeUpdate(group, time, st); return; }
      return prev.apply(this, arguments);
    };
    fn._ha = true;
    G.GFX.animateCharacter = fn;
    return true;
  }
  if (!hook()) { let n = 0; const iv = setInterval(() => { if (hook() || ++n > 50) clearInterval(iv); }, 100); }

  G.HeroAnim = {
    init, update: safeUpdate, trigger,
    styles: Object.keys(STYLES), weapons: Object.keys(ATTACKS), BONES: BONES.slice(),
    state: (root) => (root && root.userData && root.userData._ha) || null,
    _internal: { STYLES, CLASS_DEF, ATTACKS, CASTS },
  };
})();
