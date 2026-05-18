/**
 * Classic script (non-module). Run after Firebase compat SDKs.
 * Initializes a single Firebase app + auth with LOCAL persistence.
 */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAWKBZoiYNI8ja-7nR7HOcfCkfRhA2KTN0",
    authDomain: "ideasphere-web.firebaseapp.com",
    projectId: "ideasphere-web",
    storageBucket: "ideasphere-web.firebasestorage.app",
    messagingSenderId: "688275537304",
    appId: "1:688275537304:web:cf113441defb0e5ac0ffed",
  };

  if (!window.firebase || !firebase.initializeApp) {
    console.error("[MentorConnect] Firebase SDK not loaded before firebase-init.js");
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

  window.__MC_FIREBASE_READY = true;
})();
