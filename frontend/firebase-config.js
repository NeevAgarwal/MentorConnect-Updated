const firebaseConfig = {
  apiKey: "AIzaSyAWKBZoiYNI8ja-7nR7HOcfCkfRhA2KTN0",
  authDomain: "ideasphere-web.firebaseapp.com",
  projectId: "ideasphere-web",
  storageBucket: "ideasphere-web.firebasestorage.app",
  messagingSenderId: "688275537304",
  appId: "1:688275537304:web:cf113441defb0e5ac0ffed"
};

// ── Initialize Firebase ──
firebase.initializeApp(firebaseConfig);

// ── Auth instance (used across all pages) ──
const auth = firebase.auth();