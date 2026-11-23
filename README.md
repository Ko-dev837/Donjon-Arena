# Donjon Arena 3D

Jeu d'action-RPG en 3D jouable dans le navigateur : vue de dessus façon arène, progression par rangs (E → SS), portails et donjons uniques, 8 classes (dont une classe secrète), skins, forge, talents et ambiance horrifique.

## Lancer le jeu

Aucun outil de compilation n'est nécessaire : c'est du HTML, du CSS et du JavaScript pur.

- **En local :** ouvre `index.html` dans un navigateur récent. Si le navigateur bloque les fichiers locaux, lance un petit serveur dans le dossier :
  ```bash
  python3 -m http.server 8000
  ```
  puis ouvre http://localhost:8000
- **GitHub Pages :** pousse le dépôt, puis active *Settings → Pages → Deploy from a branch* (branche `main`, dossier `/root`). Le jeu sera disponible à l'adresse `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

three.js r128 est chargé depuis le CDN cdnjs (voir `index.html`) : il faut une connexion internet au premier lancement.

## Commandes

- ZQSD ou flèches : se déplacer
- Souris : viser
- 1 / 2 / 3 : compétences
- Espace : roulade
- X : ultime
- R / F : potions
- Échap : pause

Le jeu est aussi jouable au tactile.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `index.html` | page du jeu et ordre de chargement des scripts |
| `css/` | styles (design system, menus, sélection de classe) |
| `js/core.js` | moteur : rendu, boucle, entrées, sauvegarde, bus d'événements |
| `js/game.js` | logique de partie (salles, combats, butin, boss) |
| `js/graphics.js`, `js/gfx/` | modèles 3D, thèmes de donjons, monstres, boss |
| `js/gfx/heroes/` | personnages v6 : squelette, textures, tenues, armes, animations, effets |
| `js/data/` | données : classes, compétences, monstres, boss, donjons, objets, rangs |
| `js/sys/` | systèmes : progression, compétences, inventaire, portails, horreur, audio… |
| `js/ui.js`, `js/ui/` | interface et menus |

La sauvegarde est stockée dans le `localStorage` du navigateur.
