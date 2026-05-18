/**
 * Lightweight centralized application state (no framework).
 * Subscribe via subscribe(fn) → returns unsubscribe.
 */
const state = {
  firebaseUser: null,
  jwt: null,
  profile: null,
  sessionReady: false,
  authHydrated: false,
  authError: null,
  theme: typeof localStorage !== "undefined" ? localStorage.getItem("mc_theme") || "dark" : "dark",
  mentors: [],
  activeChatUid: null,
  bookingDraft: null,
};

const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(getState());
    } catch (e) {
      console.error("[store] listener error", e);
    }
  });
}

export function getState() {
  return { ...state };
}

export function setState(partial) {
  Object.assign(state, partial);
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function persistSessionPrefs() {
  try {
    if (state.jwt) localStorage.setItem("mc_jwt", state.jwt);
    else localStorage.removeItem("mc_jwt");
    if (state.profile?.name) localStorage.setItem("mc_name", state.profile.name);
    if (state.profile?.email) localStorage.setItem("mc_email", state.profile.email);
    if (state.profile?.role) localStorage.setItem("mc_role", state.profile.role);
    if (state.profile?.firebaseUID) localStorage.setItem("mc_uid", state.profile.firebaseUID);
    localStorage.removeItem("mc_admin");
  } catch {
    /* storage blocked */
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem("mc_jwt");
    localStorage.removeItem("mc_uid");
    localStorage.removeItem("mc_name");
    localStorage.removeItem("mc_email");
    localStorage.removeItem("mc_role");
    localStorage.removeItem("mc_admin");
  } catch {
    /* ignore */
  }
}

export function hydrateFromStorage() {
  try {
    const jwt = localStorage.getItem("mc_jwt");
    if (jwt) setState({ jwt });
  } catch {
    /* ignore */
  }
}
