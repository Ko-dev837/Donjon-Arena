# Activer le mode en ligne (Firebase) — guide pas à pas

Ce guide explique comment brancher **Donjon Arena 3D** sur Firebase (le service gratuit de Google) pour avoir :
la connexion avec un compte Google, les amis, les guildes avec leur chat, et les donjons en coop à plusieurs.

Compte environ 20 minutes. Tu n'as besoin que d'un compte Google et de ton dépôt GitHub.

> Tant que tu n'as pas fait ces étapes, le jeu marche exactement comme avant, en solo.
> Il ne contacte jamais Firebase si la configuration est vide.

---

## Étape 1 — Créer le projet Firebase

1. Va sur <https://console.firebase.google.com> et connecte-toi avec ton compte Google.
2. Clique sur **Créer un projet** (ou « Ajouter un projet »).
3. Donne-lui un nom, par exemple `donjon-arena`.
4. Google Analytics n'est pas nécessaire : tu peux le **désactiver**.
5. Clique sur **Créer le projet**, attends, puis sur **Continuer**.

## Étape 2 — Déclarer une application Web

1. Sur la page d'accueil du projet, clique sur l'icône **`</>`** (« Web »).
2. Surnom de l'application : `donjon-web`. **Ne coche pas** « Firebase Hosting » (on utilise GitHub Pages).
3. Clique sur **Enregistrer l'application**.
4. Firebase affiche un bloc de code avec `const firebaseConfig = { … }`. **Garde cette page ouverte** : on en a besoin à l'étape 6.
   Tu pourras la retrouver plus tard dans ⚙️ **Paramètres du projet → Général → Vos applications**.

## Étape 3 — Activer la connexion Google

1. Menu de gauche : **Créer → Authentication**, puis **Commencer**.
2. Onglet **Méthode de connexion** (« Sign-in method »), choisis **Google**.
3. Active l'interrupteur, choisis ton adresse e-mail comme « adresse e-mail d'assistance », puis **Enregistrer**.

## Étape 4 — Créer la base Firestore (profils, amis, guildes, chat)

1. Menu de gauche : **Créer → Firestore Database**, puis **Créer une base de données**.
2. Emplacement : choisis un serveur proche, par exemple `eur3 (europe-west)`.
3. Choisis **Démarrer en mode production** (on mettra nos propres règles à l'étape 7), puis **Créer**.

## Étape 5 — Créer la Realtime Database (présence, invitations, coop)

1. Menu de gauche : **Créer → Realtime Database**, puis **Créer une base de données**.
2. Emplacement : choisis par exemple **Belgique (europe-west1)**.
3. Choisis **Démarrer en mode verrouillé**, puis **Activer**.
4. En haut de la page, tu vois l'adresse de la base, du genre
   `https://donjon-arena-default-rtdb.europe-west1.firebasedatabase.app`. C'est ton `databaseURL`.

## Étape 6 — Coller la configuration dans le jeu

Ouvre le fichier **`js/net/firebase-config.js`** et recopie les valeurs de l'étape 2 :

```js
G.FIREBASE_CONFIG = {
  enabled: true,                                   // ← passe à true
  apiKey: 'AIza…',                                 // copié depuis firebaseConfig
  authDomain: 'donjon-arena.firebaseapp.com',
  projectId: 'donjon-arena',
  databaseURL: 'https://donjon-arena-default-rtdb.europe-west1.firebasedatabase.app',   // étape 5
  storageBucket: 'donjon-arena.appspot.com',       // facultatif
  messagingSenderId: '123456789',                  // facultatif
  appId: '1:123456789:web:abcdef',
  sdkVersion: '10.12.2',
};
```

Ces valeurs ne sont pas des mots de passe : elles finissent dans le navigateur de chaque joueur.
Ce qui protège tes données, ce sont **les règles** (étape 7) et **les domaines autorisés** (étape 8).

## Étape 7 — Publier les règles de sécurité

> **Mise à jour « page Guilde » (rôles, message du jour, journal, recrutement) :** si tu avais déjà publié les règles, republie le contenu actuel de `firestore.rules` (Firestore → Règles → Publier), sinon les nouvelles actions de guilde seront refusées (`permission-denied`).

Sans ces règles, la base reste fermée et le mode en ligne affiche des erreurs « permission-denied ».

**Firestore :**
1. **Firestore Database → onglet Règles**.
2. Efface tout le contenu, puis colle le contenu du fichier **`firestore.rules`** du dépôt.
3. Clique sur **Publier**.

**Realtime Database :**
1. **Realtime Database → onglet Règles**.
2. Efface tout, colle le contenu du fichier **`database.rules.json`**.
3. Clique sur **Publier**.

Si la console signale une erreur à la publication, copie le message exact : il indique la ligne qui pose problème.

<details><summary>Variante en ligne de commande (facultatif)</summary>

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # choisis ton projet
firebase deploy --only firestore:rules,database
```
Il faut alors un fichier `firebase.json` qui pointe vers les deux fichiers de règles :
```json
{ "firestore": { "rules": "firestore.rules" }, "database": { "rules": "database.rules.json" } }
```
</details>

## Étape 8 — Autoriser ton domaine GitHub Pages

La connexion Google ne marche que sur les domaines que tu autorises.

1. **Authentication → onglet Paramètres → Domaines autorisés**.
2. Clique sur **Ajouter un domaine** et saisis `<ton-pseudo>.github.io` (par exemple `goro.github.io`), sans `https://` et sans le nom du dépôt.
3. `localhost` est déjà dans la liste : c'est pratique pour tester chez toi avec `python3 -m http.server 8000`.

## Étape 9 — Publier sur GitHub Pages

1. Envoie le projet sur GitHub (`git add`, `git commit`, `git push`).
2. Sur GitHub, ouvre ton dépôt, puis **Settings → Pages**.
3. Dans **Build and deployment**, choisis **Deploy from a branch**, la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Après une ou deux minutes, le jeu est en ligne à l'adresse `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

## Étape 10 — Vérifier

1. Ouvre le jeu, crée ou charge ton héros, puis va dans l'onglet **En ligne** du camp.
2. **Compte → Se connecter avec Google**. Ton **code ami** à 6 caractères s'affiche.
3. Sur un autre appareil ou un autre compte Google : **Amis → Ajouter un ami** avec ce code, puis accepte la demande.
4. **Groupe → Créer un groupe → Inviter**. Ton ami reçoit une notification « Rejoindre ».
5. Le chef choisit un portail, les autres cliquent **Je suis prêt**, et le chef clique **Lancer le donjon**.

---

## En cas de problème

| Ce que tu vois | Ce qu'il faut faire |
|---|---|
| « Mode en ligne non configuré » | `enabled` est encore à `false`, ou il manque `apiKey`, `projectId`, `authDomain` ou `databaseURL`. |
| « Firebase n'a pas pu être chargé » | Pas d'internet, ou un bloqueur de publicité bloque `gstatic.com`. Le solo continue de marcher. |
| `auth/unauthorized-domain` | Ajoute ton domaine à l'étape 8. |
| `auth/popup-blocked` | Le jeu bascule tout seul sur une connexion par redirection. Sinon, autorise les fenêtres pop-up. |
| `permission-denied` | Les règles de l'étape 7 ne sont pas publiées, ou elles ne sont pas à jour. |
| Ton ami ne reçoit pas l'invitation | Il doit être connecté, avoir le jeu ouvert et ne pas être déjà en donjon. |

## Données enregistrées

Le jeu n'enregistre que le strict nécessaire :
- ton **identifiant Firebase** (uid), ton **pseudo** et, si tu en as une, ta **photo Google** ;
- la classe, le rang, le niveau et le skin de ton héros ;
- ton code ami, ta guilde, tes amis, tes demandes d'ami, les messages de guilde et le journal de guilde (30 derniers événements affichés).

Le jeu n'enregistre **pas** ton adresse e-mail. Ta sauvegarde de jeu reste dans le `localStorage` de ton navigateur.

Le forfait gratuit de Firebase (« Spark ») suffit largement pour jouer entre amis.
