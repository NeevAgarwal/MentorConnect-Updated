/**
 * MentorConnect Centralized API Layer
 * Handles JWT sync, error handling, retries, and consistent response parsing
 */

// Global state for current JWT and user
let mcGlobalJwt = localStorage.getItem("mc_jwt") || null;
let mcGlobalUser = null;

/**
 * Store JWT and user info from session response
 */
function storeMcSession(data) {
  if (data && data.success && data.token) {
    mcGlobalJwt = data.token;
    localStorage.setItem("mc_jwt", data.token);
    if (data.user) {
      mcGlobalUser = data.user;
      localStorage.setItem("mc_role", data.user.role || "student");
      localStorage.setItem("mc_name", data.user.name || "");
      localStorage.setItem("mc_uid", data.user.firebaseUID || "");
      if (data.user.isAdmin) localStorage.setItem("mc_admin", "1");
      else localStorage.removeItem("mc_admin");
    }
    return true;
  }
  return false;
}

/**
 * Sync Firebase ID token with backend to get JWT
 */
async function syncMcJwt() {
  try {
    if (typeof auth === "undefined" || !auth.currentUser) {
      console.warn("[API] Auth not ready for JWT sync");
      return null;
    }

    const idToken = await auth.currentUser.getIdToken(true);
    const base = window.MC_API || "http://localhost:5000";

    const res = await fetch(base + "/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      console.error("[API] JWT sync failed:", res.status);
      return null;
    }

    const data = await res.json().catch(() => null);
    if (storeMcSession(data)) {
      console.log("[API] JWT synced successfully");
      return mcGlobalJwt;
    }
    return null;
  } catch (err) {
    console.error("[API] JWT sync error:", err);
    return null;
  }
}

/**
 * Get current JWT from memory or localStorage
 */
function getMcJwt() {
  return mcGlobalJwt || localStorage.getItem("mc_jwt") || null;
}

/**
 * Build API headers with JWT auth
 */
function apiHeaders(isJson, extraHeaders = {}) {
  const h = { Accept: "application/json", ...extraHeaders };
  if (isJson) h["Content-Type"] = "application/json";
  const jwt = getMcJwt();
  if (jwt) h.Authorization = "Bearer " + jwt;
  return h;
}

/**
 * Parse response and extract data with error handling
 */
async function parseApiResponse(res, path) {
  try {
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return { status: res.status, data, ok: res.ok };
  } catch (err) {
    console.error("[API] Failed to parse response from", path, err);
    return { status: res.status, data: {}, ok: res.ok, parseError: true };
  }
}

/**
 * Main API fetch function with retry logic and error handling
 * Returns { ok: boolean, status: number, data: object, error?: string }
 */
async function mcFetch(path, options = {}) {
  const base = window.MC_API || "http://localhost:5000";

  if (!base) {
    return {
      ok: false,
      status: 0,
      data: {},
      error: "API_NOT_CONFIGURED",
    };
  }

  const isForm = options.body instanceof FormData;
  const isJson = options.body && typeof options.body === "object" && !isForm;
  const { _retried, skipAuthRetry, timeout, ...fetchOptions } = options;

  try {
    // Prepare request
    const headers = apiHeaders(isJson, fetchOptions.headers);
    const controller = new AbortController();

    // Apply timeout if specified (default 30s)
    const timeoutMs = timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(base + path, {
      ...fetchOptions,
      headers,
      body: isJson ? JSON.stringify(options.body) : options.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle auth token expiration - retry with fresh JWT
    if (response.status === 401 && !_retried && !skipAuthRetry && typeof auth !== "undefined" && auth.currentUser) {
      const freshToken = await syncMcJwt();
      if (freshToken && freshToken !== getMcJwt()) {
        // Retry with fresh token
        return mcFetch(path, {
          ...options,
          _retried: true,
          skipAuthRetry: true,
        });
      }
    }

    // Parse response
    const { status, data, ok } = await parseApiResponse(response, path);

    // Handle errors
    if (!ok) {
      const error = data.error || data.message || "API_ERROR";
      return {
        ok: false,
        status,
        data,
        error,
      };
    }

    // Success
    return {
      ok: true,
      status,
      data: data.data || data,
      error: null,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        data: {},
        error: "REQUEST_TIMEOUT",
      };
    }
    console.error("[API] Fetch error:", path, err);
    return {
      ok: false,
      status: 0,
      data: {},
      error: err.message || "NETWORK_ERROR",
    };
  }
}

/**
 * Convenience wrapper for GET requests
 */
async function mcGet(path, options = {}) {
  return mcFetch(path, { method: "GET", ...options });
}

/**
 * Convenience wrapper for POST requests
 */
async function mcPost(path, body, options = {}) {
  return mcFetch(path, { method: "POST", body, ...options });
}

/**
 * Convenience wrapper for PUT requests
 */
async function mcPut(path, body, options = {}) {
  return mcFetch(path, { method: "PUT", body, ...options });
}

/**
 * Convenience wrapper for PATCH requests
 */
async function mcPatch(path, body, options = {}) {
  return mcFetch(path, { method: "PATCH", body, ...options });
}

/**
 * Convenience wrapper for DELETE requests
 */
async function mcDelete(path, options = {}) {
  return mcFetch(path, { method: "DELETE", ...options });
}
