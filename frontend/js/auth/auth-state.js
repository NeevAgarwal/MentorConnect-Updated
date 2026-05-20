/**
 * MentorConnect Centralized Auth State
 * Manages Firebase auth, JWT sync, and user session across app
 * Vanilla JS version (no ES6 modules)
 */

let authStateReady = false;
let currentAuthUser = null;
let currentMcUser = null;
let authStateCallbacks = [];
let authInitPromise = null;

function clearAuthStorage() {
  currentAuthUser = null;
  currentMcUser = null;
  if (typeof mcGlobalJwt !== "undefined") mcGlobalJwt = null;
  localStorage.removeItem("mc_jwt");
  localStorage.removeItem("mc_uid");
  localStorage.removeItem("mc_name");
  localStorage.removeItem("mc_role");
  localStorage.removeItem("mc_email");
  localStorage.removeItem("mc_admin");
}

/**
 * Initialize auth and wait for state to be ready
 * Call this early on every protected page
 */
async function initAuthState() {
  if (authInitPromise) return authInitPromise;
  authInitPromise = new Promise((resolve) => {
    if (authStateReady) {
      resolve({ user: currentAuthUser, mcUser: currentMcUser });
      return;
    }

    let unsubscribe = () => {};
    unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          clearAuthStorage();
          authStateReady = true;
          notifyAuthStateCallbacks();
          unsubscribe();
          resolve(null);

          // Redirect if on protected page
          if (!isPublicPage()) {
            window.location.href = "login.html";
          }
          return;
        }

        // Firebase user exists
        currentAuthUser = firebaseUser;

        const synced = await syncMcJwt();
        if (!synced) {
          clearAuthStorage();
          try { await auth.signOut(); } catch (_) {}
          authStateReady = true;
          notifyAuthStateCallbacks();
          unsubscribe();
          resolve(null);
          if (!isPublicPage()) {
            window.location.href = "login.html?session=expired";
          }
          return;
        }

        const profileRes = await mcGet(`/api/users/${firebaseUser.uid}`, { skipAuthWait: true });
        if (profileRes.ok && profileRes.data.user) {
          currentMcUser = profileRes.data.user;
        } else if (mcGlobalUser) {
          currentMcUser = mcGlobalUser;
        }
        if (currentMcUser) {
          localStorage.setItem("mc_uid", firebaseUser.uid);
          localStorage.setItem("mc_name", currentMcUser.name || firebaseUser.displayName || "User");
          localStorage.setItem("mc_role", currentMcUser.role || "student");
          localStorage.setItem("mc_email", currentMcUser.email || firebaseUser.email || "");
          if (currentMcUser.isAdmin) localStorage.setItem("mc_admin", "1");
          else localStorage.removeItem("mc_admin");
        }

        authStateReady = true;
        notifyAuthStateCallbacks();
        unsubscribe();
        resolve({ user: currentAuthUser, mcUser: currentMcUser });
      } catch (err) {
        console.error("[AUTH] Error initializing auth state:", err);
        clearAuthStorage();
        authStateReady = true;
        notifyAuthStateCallbacks();
        unsubscribe();
        resolve(null);
        if (!isPublicPage()) {
          window.location.href = "login.html?session=expired";
        }
      }
    });
  });
  window.MC_AUTH_READY = authInitPromise;
  return authInitPromise;
}

/**
 * Get current auth state (synchronously if ready)
 */
function getAuthState() {
  return {
    ready: authStateReady,
    isLoggedIn: !!currentAuthUser,
    firebaseUser: currentAuthUser,
    mcUser: currentMcUser,
    uid: currentAuthUser?.uid || null,
    email: currentAuthUser?.email || null,
    role: currentMcUser?.role || localStorage.getItem("mc_role") || "student",
    isAdmin: currentMcUser?.isAdmin || localStorage.getItem("mc_admin") === "1",
    name: currentMcUser?.name || localStorage.getItem("mc_name") || "User",
  };
}

/**
 * Check if user is logged in
 */
function isLoggedIn() {
  return !!currentAuthUser;
}

/**
 * Get current user (async-safe)
 */
function getCurrentUser() {
  if (!authStateReady) {
    console.warn("[AUTH] Auth state not yet initialized");
    return null;
  }
  return currentAuthUser;
}

/**
 * Get current MentorConnect user profile
 */
function getCurrentMcUser() {
  if (!authStateReady) {
    return null;
  }
  return currentMcUser;
}

/**
 * Logout and clean up
 */
async function logoutUser() {
  try {
    await auth.signOut();
    clearAuthStorage();
    notifyAuthStateCallbacks();
    return true;
  } catch (err) {
    console.error("[AUTH] Logout failed:", err);
    return false;
  }
}

/**
 * Subscribe to auth state changes
 */
function onAuthStateChange(callback) {
  authStateCallbacks.push(callback);
  // Call immediately if ready
  if (authStateReady) {
    callback(getAuthState());
  }
  // Return unsubscribe function
  return () => {
    authStateCallbacks = authStateCallbacks.filter((cb) => cb !== callback);
  };
}

/**
 * Notify all subscribers of auth state change
 */
function notifyAuthStateCallbacks() {
  const state = getAuthState();
  authStateCallbacks.forEach((cb) => {
    try {
      cb(state);
    } catch (err) {
      console.error("[AUTH] Error in auth state callback:", err);
    }
  });
}

/**
 * Check if current page is public (doesn't require auth)
 */
function isPublicPage() {
  const filename = window.location.pathname.split("/").pop() || "index.html";
  const publicPages = [
    "index.html",
    "login.html",
    "signup.html",
    "forgot-password.html",
    "app.html",
    "",
  ];
  return publicPages.includes(filename) || filename === "";
}

/**
 * Require user to be logged in - redirect if not
 */
function requireAuth() {
  if (!isLoggedIn()) {
    console.warn("[AUTH] Auth required but user not logged in");
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/**
 * Require user to be admin
 */
function requireAdmin() {
  const state = getAuthState();
  if (!state.isAdmin) {
    console.warn("[AUTH] Admin access required");
    window.location.href = "dashboard.html";
    return false;
  }
  return true;
}

/**
 * Update user profile in state
 */
async function updateUserProfile(updates) {
  if (!currentAuthUser) return null;

  try {
    const res = await mcPut(`/api/users/${currentAuthUser.uid}`, updates);
    if (res.ok && res.data.user) {
      currentMcUser = res.data.user;
      localStorage.setItem("mc_name", res.data.user.name || "");
      notifyAuthStateCallbacks();
      return res.data.user;
    }
    return null;
  } catch (err) {
    console.error("[AUTH] Failed to update profile:", err);
    return null;
  }
}
