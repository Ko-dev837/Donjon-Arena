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

## Mode en ligne

Onglet **En ligne** du camp, avec les sous-onglets **Compte**, **Amis** et **Groupe** ; l'onglet **Guilde** ouvre la page **Guilde** (entrée juste après « En ligne » dans la barre latérale).

- **Compte :** connexion avec Google, pseudo et code ami à 6 caractères.
- **Amis :** ajout par code ami, demandes à accepter ou refuser, statut (en ligne, en donjon, hors ligne) et invitation dans ton groupe.
- **Guildes (page dédiée) :** création avec un nom, un tag de 3 ou 4 lettres et un emblème (12 icônes, 8 couleurs), adhésion par code, QR code ou lien `?guilde=CODE`. Quatre rôles : **chef > officier > membre > recrue** (les nouveaux arrivent recrues). L'officier promeut les recrues en membres, exclut membres et recrues, modifie le message du jour et modère le chat ; le chef peut tout faire (rétrograder, transférer la direction, fermer le recrutement, changer l'emblème, dissoudre). Liste des membres avec recherche, classe, rang, niveau, statut et date d'arrivée ; tableau des permissions ; journal des 30 derniers événements. Le chat garde les 50 derniers messages, avec un anti-spam (un message toutes les 2 secondes au plus).
- **Groupe et coop (2 à 4 joueurs) :** le chef choisit un portail. Les règles de rang sont vérifiées pour **chaque** joueur. Quand tout le monde est prêt, tous partent en même temps dans le même donjon, avec la même graine.

Le serveur est **Firebase** (Google). Pour l'activer, suis **[SETUP-FIREBASE.md](SETUP-FIREBASE.md)**, puis remplis `js/net/firebase-config.js`.
Sans configuration, ou sans réseau, le jeu ne contacte rien et reste un jeu solo, sans changement.

### Comment marche la coop

C'est un modèle « hôte autoritaire » : le chef du groupe est l'hôte.

- **L'hôte :** il simule les ennemis et envoie leur état environ 10 fois par seconde. Il décide aussi des vagues, des changements de salle et de la fin du donjon.
- **Les invités :** chez eux, les ennemis sont des marionnettes. Leur position est interpolée et leur IA locale est désactivée. Les dégâts d'un invité sont envoyés à l'hôte, qui les applique.
- **Les alliés :** chacun voit les autres avec leur classe et leur skin, plus leur nom et leur barre de PV. Le HUD de groupe s'affiche à gauche.
- **Mort et réanimation :** un joueur tombé reste **à terre**. Un allié le réanime en restant environ 2 secondes à côté de lui. Si tout le groupe tombe, c'est la défaite pour tous. La victoire est partagée.
- **Déconnexions :** si l'hôte part, la partie se termine proprement, sans pénalité. Si un invité part, les autres continuent.
- **Ce que la coop change :** pas de pause du monde (le menu s'ouvre, mais le jeu continue) et pas de mini-jeu de coffre bloquant (le coffre s'ouvre directement).

### Tester la coop sans Firebase (coop locale)

1. Ouvre `index.html?net=local` dans une fenêtre.
2. Dans une **deuxième fenêtre** du même navigateur, ouvre `index.html?net=local&slot=2` (`slot=2` = second héros, indépendant).
3. Place les deux fenêtres côte à côte. Un onglet caché est mis en pause par le navigateur, et l'hôte doit rester visible.
4. Dans l'une des deux : **En ligne → Groupe → Créer un groupe**, puis invite l'autre joueur depuis la liste.

La coop locale utilise `BroadcastChannel`, qui ne marche qu'entre onglets de la même origine. Elle ne gère ni comptes ni guildes.

### Fichiers

| Fichier | Rôle |
|---|---|
| `js/net/firebase-config.js` | configuration Firebase à remplir (`enabled:false` par défaut) |
| `js/net/transport.js` | transport abstrait : `local` (BroadcastChannel) ou `firebase` (Realtime Database) |
| `js/net/online.js` | `G.Online` : auth, profil, présence, amis, guildes, chat, groupe, synchronisation coop |
| `js/net/online-ui.js` | panneau « En ligne », notifications, noms et HUD de groupe en jeu |
| `js/net/guild-ui.js` | page « Guilde » : membres et rôles, permissions, message du jour, journal, chat, paramètres |
| `firestore.rules`, `database.rules.json` | règles de sécurité à publier dans la console Firebase |
| `js/game.js` (`G.game.net`) | pont réseau : rôle hôte ou invité, marionnettes, dégâts distants, réanimation |

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
| `js/net/` | mode en ligne (Firebase, coop) — voir « Mode en ligne » |

La sauvegarde est stockée dans le `localStorage` du navigateur.

## Application Android (Google Play)

Le jeu est une PWA installable (manifeste, service worker hors ligne, icônes). Pour le publier sur le Play Store, suis [PLAY-STORE.md](PLAY-STORE.md). La politique de confidentialité est dans [privacy.html](privacy.html).
