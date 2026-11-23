# Publier Donjon Arena 3D sur le Google Play Store

Le jeu est maintenant une **PWA**, une application web installable. Elle a son icône, s'ouvre en plein écran et marche hors ligne en solo.
Pour aller sur le Play Store, on l'emballe en application Android avec **PWABuilder**. C'est gratuit, ça se fait depuis Windows et sans Android Studio.

Compte environ 1 h la première fois, plus le délai de vérification de Google.

---

## Étape 0 — Vérifier que la PWA marche

1. Ouvre `https://ko-dev837.github.io/Donjon-Arena/` dans Chrome, sur ton téléphone Android.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. L'icône du jeu apparaît sur ton téléphone. Lance-la : le jeu doit s'ouvrir en plein écran.

## Étape 1 — Créer le compte développeur Google Play

1. Va sur <https://play.google.com/console> et connecte-toi avec ton compte Google.
2. Crée un compte développeur **personnel**. Il y a des frais d'inscription uniques (environ 25 $ à ce jour, vérifie le montant affiché).
3. Google demande une **vérification d'identité** (pièce d'identité) et une **adresse e-mail de contact** publique.
   Cette vérification peut prendre quelques jours.

> **Nouveaux comptes personnels :** Google peut exiger un **test fermé** avant la publication publique.
> Ce test demande un nombre minimum de testeurs pendant plusieurs jours (souvent 12 testeurs pendant 14 jours ; le chiffre exact est affiché dans la console).
> Prépare des amis avec un téléphone Android et une adresse Gmail.

## Étape 2 — Générer l'application Android avec PWABuilder

1. Va sur <https://www.pwabuilder.com>.
2. Colle l'adresse `https://ko-dev837.github.io/Donjon-Arena/`, puis clique sur **Start**.
3. PWABuilder note la PWA. Le manifeste, le service worker et les icônes sont déjà prêts.
4. Clique sur **Package for stores**, puis **Android → Generate package**.
   - **Package ID** : par exemple `io.github.kodev837.donjonarena`. Choisis-le bien, **il ne pourra plus changer**.
   - **App name** : `Donjon Arena 3D` · **Launcher name** : `Donjon Arena`.
   - **Display mode** : `Fullscreen`.
   - **Signing key** : laisse « Create new ».
5. Télécharge le ZIP. Il contient :
   - un fichier **`.aab`** : c'est celui que tu envoies sur le Play Store ;
   - un fichier **`.apk`** : pour tester sur ton téléphone ;
   - un fichier **`signing.keystore`** et **`signing-key-info.txt`** : **garde-les précieusement, en double**. Sans eux, tu ne pourras plus jamais mettre l'application à jour ;
   - un fichier **`assetlinks.json`** (voir l'étape 3).

## Étape 3 — Enlever la barre d'adresse (assetlinks.json)

Sans cette étape, l'application affiche une barre d'adresse en haut, comme un navigateur.

Android cherche ce fichier **à la racine du domaine** : `https://ko-dev837.github.io/.well-known/assetlinks.json`.
Ton jeu est dans un sous-dossier (`/Donjon-Arena/`), donc il faut un **deuxième dépôt** :

1. Sur GitHub, crée un dépôt public nommé exactement **`ko-dev837.github.io`**.
2. Ajoute :
   - un fichier vide nommé **`.nojekyll`** à la racine, sinon GitHub Pages ignore les dossiers qui commencent par un point ;
   - le fichier **`.well-known/assetlinks.json`** fourni par PWABuilder.
3. Active GitHub Pages sur ce dépôt (Settings → Pages → branche `main`).
4. Vérifie que `https://ko-dev837.github.io/.well-known/assetlinks.json` s'affiche.
5. **Important :** après l'envoi sur le Play Store, Google re-signe l'application avec sa propre clé.
   Dans Play Console → **Intégrité de l'application → Signature de l'application**, copie l'**empreinte SHA-256 de la clé de signature de l'application**.
   Ajoute-la dans `assetlinks.json`, dans la liste `sha256_cert_fingerprints`, à côté de celle de PWABuilder.

## Étape 4 — Connexion Google (mode en ligne) dans l'application

L'application Android ouvre le jeu dans Chrome (Trusted Web Activity) : la connexion Google y marche comme sur le site.
Vérifie seulement que `ko-dev837.github.io` est bien dans **Firebase → Authentication → Paramètres → Domaines autorisés**.

## Étape 5 — Créer la fiche du jeu dans Play Console

1. **Créer une application** → nom `Donjon Arena 3D`, type **Jeu**, **Gratuit**.
2. **Fiche Play Store principale :**
   - Description courte (80 caractères max) :
     `Action-RPG 3D : portails, rangs E à SS, boss uniques et coop entre amis.`
   - Description complète : reprends le README (classes, donjons, rangs, coop, guildes).
   - **Icône** 512×512 : `icons/icon-512.png`.
   - **Image de présentation** 1024×500 : `icons/feature-graphic-1024x500.png` (tu peux la remplacer par une plus belle).
   - **Captures d'écran** : au moins 2, prises sur ton téléphone (jeu en cours, sélection de classe, donjon…).
3. **Contenu de l'application**, à remplir :
   - **Règles de confidentialité** : `https://ko-dev837.github.io/Donjon-Arena/privacy.html`
   - **Accès à l'application** : tout est accessible sans compte. Coche « Toutes les fonctionnalités sont disponibles sans restriction », car le mode en ligne est facultatif.
   - **Annonces** : non.
   - **Classification du contenu** : questionnaire IARC. Le jeu contient de la violence fantastique (combats contre des monstres), une ambiance horrifique et un chat entre joueurs (guilde).
   - **Public cible** : 13 ans et plus, conseillé à cause de l'ambiance horrifique et du chat.
   - **Sécurité des données** : déclare les données du mode en ligne (identifiant, pseudo, photo de profil, messages de guilde), qui sont chiffrées en transit et ne sont pas partagées avec des tiers. La liste exacte est dans `privacy.html`.
4. **Tests → Test fermé** (ou **Production** si ton compte le permet) → **Créer une version** → envoie le fichier **`.aab`**.
5. Envoie la version en vérification. Google répond en général en quelques jours.

## Mettre à jour l'application

- **Le jeu lui-même** (code, équilibrage, nouveautés) : il suffit de pousser sur GitHub. L'application charge le site, donc les joueurs ont la mise à jour **sans repasser par le Play Store**.
- **L'emballage Android** (nom, icône, version d'Android visée) : régénère le paquet avec PWABuilder **en réutilisant ta clé de signature** (« Use existing »), augmente le numéro de version, puis envoie le nouveau `.aab`.

## Fichiers prêts dans ce dépôt

| Fichier | Rôle |
|---|---|
| `manifest.webmanifest` | nom, icônes, plein écran, couleurs |
| `sw.js` | service worker : le jeu marche hors ligne en solo (le mode en ligne demande internet) |
| `icons/` | icônes 192, 512, adaptatives (maskable), 1024 et image de présentation 1024×500 |
| `privacy.html` | politique de confidentialité exigée par Google Play |
