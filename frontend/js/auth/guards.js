import { getState, subscribe } from "../state/store.js";
import { startAuthEngine } from "./auth-state.esm.js";
import { logger } from "../utils/logger.js";

export function protectPage(loginPath = "login.html", timeoutMs = 10000) {
  startAuthEngine();
  return new Promise((resolve, reject) => {
    let unsub = () => {};
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      fn();
    };
    const check = () => {
      const s = getState();
      if (!s.authHydrated) return;
      if (!s.firebaseUser) {
        const next = encodeURIComponent(location.pathname + location.search);
        finish(() => {
          window.location.href = loginPath + (next ? "?next=" + next : "");
          reject(new Error("redirect"));
        });
        return;
      }
      if (!s.jwt) {
        logger.warn("No backend session", s.authError);
        const next = encodeURIComponent(location.pathname + location.search);
        finish(() => {
          window.location.href = loginPath + "?session=expired" + (next ? "&next=" + next : "");
          reject(new Error("backend-session-required"));
        });
        return;
      }
      finish(() => resolve(s));
    };
    const timer = setTimeout(() => {
      logger.warn("protectPage timed out waiting for auth");
      finish(() => reject(new Error("auth-timeout")));
    }, timeoutMs);
    unsub = subscribe(check);
    check();
  });
}

export function redirectIfAuthed(targetPath = "dashboard.html", timeoutMs = 10000) {
  startAuthEngine();
  return new Promise((resolve) => {
    let unsub = () => {};
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(value);
    };
    const check = () => {
      const s = getState();
      if (!s.authHydrated) return;
      if (s.firebaseUser && s.jwt) {
        finish(s);
        window.location.href = targetPath;
        return;
      }
      finish(s);
    };
    const timer = setTimeout(() => {
      logger.warn("redirectIfAuthed timed out waiting for auth");
      finish(getState());
    }, timeoutMs);
    unsub = subscribe(check);
    check();
  });
}
