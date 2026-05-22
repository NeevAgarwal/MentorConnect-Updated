const firebaseConfig = {
  apiKey: "AIzaSyAWKBZoiYNI8ja-7nR7HOcfCkfRhA2KTN0",
  authDomain: "ideasphere-web.firebaseapp.com",
  projectId: "ideasphere-web",
  storageBucket: "ideasphere-web.firebasestorage.app",
  messagingSenderId: "688275537304",
  appId: "1:688275537304:web:cf113441defb0e5ac0ffed"
};

// ── Initialize Firebase ──
let auth = null;

if (typeof firebase !== "undefined" && firebase?.initializeApp && firebase?.auth) {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
} else {
  console.error("[Firebase] SDK unavailable. Authentication actions will be disabled until it loads.");
}

// ── Auth instance (used across all pages) ──
