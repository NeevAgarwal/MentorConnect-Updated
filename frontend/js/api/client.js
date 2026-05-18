import { logger } from "../utils/logger.js";
import { getState } from "../state/store.js";
import { syncBackendJwt } from "../auth/session-sync.js";

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function headersFor(body, extra) {
  const h = Object.assign({ Accept: "application/json" }, extra || {});
  const isForm = body instanceof FormData;
  if (!isForm && body && typeof body === "object") {
    h["Content-Type"] = "application/json";
  }
  const jwt = getState().jwt || (typeof localStorage !== "undefined" ? localStorage.getItem("mc_jwt") : null);
  if (jwt) h.Authorization = "Bearer " + jwt;
  return h;
}

async function parseBody(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json().catch(() => ({}));
  }
  return res.text().catch(() => "");
}

export async function apiFetch(path, options = {}) {
  const base = window.MC_API || "";
  if (!base) throw new ApiError("API not configured", 0, null);

  const { skipAuthRetry, _retried, body, ...rest } = options;
  const isJsonBody = body && typeof body === "object" && !(body instanceof FormData);
  const payload = isJsonBody ? JSON.stringify(body) : body;

  let res;
  try {
    res = await fetch(base + path, {
      ...rest,
      headers: headersFor(body, rest.headers),
      body: payload,
    });
  } catch (e) {
    logger.error("apiFetch network", path, e);
    throw new ApiError("Network error", 0, null);
  }

  if (res.status === 401 && !skipAuthRetry && !_retried) {
    const u =
      getState().firebaseUser ||
      (window.firebase && window.firebase.auth && window.firebase.auth().currentUser);
    if (u) {
      try {
        await syncBackendJwt(u);
        return apiFetch(path, { ...options, _retried: true });
      } catch (e) {
        logger.warn("401 refresh failed", e);
      }
    }
  }

  return res;
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options);
  const data = await parseBody(res);
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "Request failed";
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

export async function apiJsonSafe(path, options = {}) {
  try {
    const res = await apiFetch(path, options);
    const data = await parseBody(res);
    return { ok: res.ok, data, status: res.status, res };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, data: e.body, status: e.status, res: null };
    }
    return { ok: false, data: { error: e.message }, status: 0, res: null };
  }
}
