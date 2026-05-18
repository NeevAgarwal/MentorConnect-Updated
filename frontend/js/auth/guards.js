import { getState, subscribe } from "../state/store.js";
import { startAuthEngine } from "./auth-state.esm.js";
import { logger } from "../utils/logger.js";

export function protectPage(loginPath = "login.html") {
  startAuthEngine();
  return new Promise((resolve, reject) => {
    const unsub = subscribe(() => {
      const s = getState();
      if (!s.authHydrated) return;
      unsub();
      if (!s.firebaseUser) {
        const next = encodeURIComponent(location.pathname + location.search);
        window.location.href = loginPath + (next ? "?next=" + next : "");
        reject(new Error("redirect"));
        return;
      }
      if (s.authError && !s.jwt) {
        logger.warn("No backend session", s.authError);
      }
      resolve(s);
    });
  });
}

export function redirectIfAuthed(targetPath = "dashboard.html") {
  startAuthEngine();
  return new Promise((resolve) => {
    const unsub = subscribe(() => {
      const s = getState();
      if (!s.authHydrated) return;
      if (s.firebaseUser && s.jwt) {
        unsub();
        window.location.href = targetPath;
        return;
      }
      unsub();
      resolve(s);
    });
  });
}
