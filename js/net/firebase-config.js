window.G = window.G || {};
/* =====================================================================
   js/net/firebase-config.js — configuration Firebase du mode en ligne
   ---------------------------------------------------------------------
   1. Crée un projet sur https://console.firebase.google.com (voir SETUP-FIREBASE.md).
   2. Dans « Paramètres du projet → Vos applications → Application Web », copie
      les valeurs de l'objet firebaseConfig ci-dessous.
   3. Passe enabled à true.
   Tant que enabled vaut false (ou que apiKey / projectId / databaseURL sont vides),
   le jeu ne charge RIEN depuis Internet pour le mode en ligne : le solo reste intact.

   Remarque : ces valeurs ne sont pas secrètes (elles finissent de toute façon dans
   le navigateur des joueurs). La sécurité vient des règles firestore.rules et
   database.rules.json, et des domaines autorisés dans Firebase Authentication.
   ===================================================================== */
G.FIREBASE_CONFIG = {
  enabled: false,                 // ← passe à true une fois les champs remplis
  apiKey: '',                     // ex. 'AIza…'
  authDomain: '',                 // ex. 'mon-projet.firebaseapp.com'
  projectId: '',                  // ex. 'mon-projet'
  databaseURL: '',                // ex. 'https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app'
  storageBucket: '',              // facultatif
  messagingSenderId: '',          // facultatif
  appId: '',                      // ex. '1:123456789:web:abcdef'
  sdkVersion: '10.12.2',          // version du SDK « compat » chargée depuis gstatic.com
};
