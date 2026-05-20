import { logger } from "../utils/logger.js";
import { setState, persistSessionPrefs } from "../state/store.js";

function apiBase() {
  const b = window.MC_API;
  if (!b) {
    logger.warn("MC_API not set — configure js/config.js or meta mc-api-base");
  }
  return b || "";
}

/**
 * Exchange Firebase ID token for backend JWT + normalized user profile.
 */
export async function syncBackendJwt(firebaseUser) {
  if (!firebaseUser) return null;
  const idToken = await firebaseUser.getIdToken(true);
  const base = apiBase();
  if (!base) throw new Error("API base URL not configured");

  try {
    const res = await fetch(base + "/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ idToken }),
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })).catch(() => ({ ok: r.ok, status: r.status, data: {} })));

    if (!res || !res.ok) {
      throw new Error((res && res.data && (res.data.message || res.data.error)) || "Session exchange failed");
    }

    const raw = res.data || {};
    const data = raw.data || raw;
    if (!data.token) throw new Error(raw.error || raw.message || "Invalid session response");

    setState({ jwt: data.token, profile: data.user || null, sessionReady: true, authError: null });
    persistSessionPrefs();
    return data;
  } catch (e) {
    logger.error("session sync failed", e);
    throw e;
  }
}
