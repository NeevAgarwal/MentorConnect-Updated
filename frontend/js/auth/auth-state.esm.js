import { setState, getState } from "../state/store.js";
import { logger } from "../utils/logger.js";
import { syncBackendJwt } from "./session-sync.js";

let inited = false;
let hydrated = false;
let waiters = [];

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
  if (inited) return;
  inited = true;

  try {
    const auth = getAuth();

    auth.onAuthStateChanged(async (user) => {
      logger.debug("auth-state: change", !!user);
      setState({ firebaseUser: user });

      if (user) {
        try {
          const data = await syncBackendJwt(user);
          if (data && data.token) {
            setState({ jwt: data.token, profile: data.user || null });
            try { localStorage.setItem("mc_jwt", data.token); } catch {}
          }
        } catch (e) {
          logger.warn("auth-state: syncBackendJwt failed", e);
        }
      } else {
        setState({ jwt: null, profile: null });
        try {
          localStorage.removeItem("mc_jwt");
        } catch {}
      }

      hydrated = true;
      while (waiters.length) {
        const r = waiters.shift();
        try { r(user || null); } catch (e) { /* ignore */ }
      }
    });

    try { window.auth = auth; } catch (e) {}
  } catch (e) {
    logger.error("startAuthEngine failed", e);
  }
}

export default { startAuthEngine, getAuth, waitForAuthReady };
