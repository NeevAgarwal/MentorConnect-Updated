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

  let res;
  // Use centralized mcPost helper when available
  try {
    const res = await (typeof mcPost === "function"
      ? mcPost("/api/auth/session", { idToken })
      : fetch(base + "/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ idToken }),
        }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d }))));

    if (!res || !res.ok) {
      throw new Error((res && res.data && res.data.error) || "Session exchange failed");
    }

    const data = res.data || res;
    if (!data.success || !data.token) throw new Error(data.error || "Invalid session response");

    setState({ jwt: data.token, profile: data.user || null });
    persistSessionPrefs();
    return data;
  } catch (e) {
    logger.error("session sync failed", e);
    throw e;
  }
}
