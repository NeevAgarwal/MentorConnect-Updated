import { setState, getState, clearStoredSession } from "../state/store.js";
import { logger } from "../utils/logger.js";
import { syncBackendJwt } from "./session-sync.js";

let inited = false;
let hydrated = false;
let waiters = [];
let authReadyPromise = null;

function resolveWaiters(user) {
  while (waiters.length) {
    const r = waiters.shift();
    try { r(user || null); } catch (e) { /* ignore */ }
  }
}

export function getAuth() {
  if (typeof firebase === "undefined" || !firebase.auth) {
    throw new Error("Firebase auth is not initialized. Ensure firebase-config.js is loaded first.");
  }
  return firebase.auth();
}

export function waitForAuthReady(timeoutMs = 10000) {
  if (hydrated) return Promise.resolve(getState().firebaseUser || null);
  return new Promise((resolve) => {
    waiters.push(resolve);
    if (timeoutMs) {
      setTimeout(() => {
        if (!hydrated) {
          logger.warn("auth-state: waitForAuthReady timed out");
          resolve(null);
        }
      }, timeoutMs);
    }
  });
}

export async function startAuthEngine() {
  if (authReadyPromise) return authReadyPromise;
  if (inited) return;
  inited = true;
  setState({ authHydrated: false, sessionReady: false, authError: null });

  authReadyPromise = new Promise((resolve) => {
    try {
    const auth = getAuth();

    auth.onAuthStateChanged(async (user) => {
      logger.debug("auth-state: change", !!user);
      setState({ firebaseUser: user, authHydrated: false, sessionReady: false, authError: null });

      if (user) {
        try {
          const data = await syncBackendJwt(user);
          if (data && data.token) {
            setState({ jwt: data.token, profile: data.user || null, sessionReady: true, authError: null });
            try { localStorage.setItem("mc_jwt", data.token); } catch {}
          } else {
            throw new Error("Backend session sync failed");
          }
        } catch (e) {
          logger.warn("auth-state: syncBackendJwt failed", e);
          clearStoredSession();
          setState({ firebaseUser: null, jwt: null, profile: null, sessionReady: false, authError: e.message || "Session sync failed" });
          try { await auth.signOut(); } catch (_) {}
          user = null;
        }
      } else {
        clearStoredSession();
        setState({ jwt: null, profile: null, sessionReady: false, authError: null });
      }

      hydrated = true;
      setState({ authHydrated: true });
      resolveWaiters(user);
      resolve(user || null);
    });

    try { window.auth = auth; } catch (e) {}
    } catch (e) {
      logger.error("startAuthEngine failed", e);
      clearStoredSession();
      hydrated = true;
      setState({ firebaseUser: null, jwt: null, profile: null, authHydrated: true, sessionReady: false, authError: e.message || "Auth failed" });
      resolveWaiters(null);
      resolve(null);
    }
  });
  try { window.MC_AUTH_READY = authReadyPromise; } catch (_) {}

  return authReadyPromise;
}

export async function bootstrapAuth() {
  await startAuthEngine();
  await waitForAuthReady();
  return getState();
}

export default { startAuthEngine, bootstrapAuth, getAuth, waitForAuthReady };
