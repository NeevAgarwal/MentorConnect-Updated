import { getState, subscribe } from "../state/store.js";
import { syncBackendJwt } from "../auth/session-sync.js";
import { logger } from "../utils/logger.js";

export function createChatSocket(handlers) {
  const base = window.MC_API || "";
  if (!base || typeof window.io !== "function") {
    logger.warn("Socket.io or MC_API missing");
    return { socket: null, disconnect: () => {} };
  }

  const token = getState().jwt || localStorage.getItem("mc_jwt");
  if (!token) {
    return { socket: null, disconnect: () => {} };
  }

  const socket = window.io(base, {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 1200,
  });

  let disposed = false;
  let refreshing = false;

  const setStatus = (t, kind) => handlers.onConnectionState?.(t, kind);
  const currentToken = () => getState().jwt || localStorage.getItem("mc_jwt") || "";
  const updateSocketToken = () => {
    const next = currentToken();
    if (next) socket.auth = { ...(socket.auth || {}), token: next };
    return next;
  };

  const reconnectWithFreshToken = async () => {
    if (disposed || refreshing) return;
    refreshing = true;
    try {
      const user = getState().firebaseUser || (window.firebase?.auth && window.firebase.auth().currentUser);
      if (user) await syncBackendJwt(user);
      if (updateSocketToken()) {
        socket.disconnect();
        socket.connect();
      }
    } catch (e) {
      logger.warn("socket token refresh failed", e);
    } finally {
      refreshing = false;
    }
  };

  socket.on("connect", () => setStatus("Live", "ok"));
  socket.on("disconnect", () => setStatus("Disconnected", "warn"));
  socket.on("connect_error", (err) => {
    logger.warn("socket connect_error", err?.message);
    setStatus("Reconnecting...", "warn");
    if (/unauthorized|invalid|expired/i.test(err?.message || "")) {
      reconnectWithFreshToken();
    }
  });
  socket.io.on("reconnect_attempt", () => {
    updateSocketToken();
    setStatus("Reconnecting...", "warn");
  });
  socket.io.on("reconnect_failed", () => setStatus("Offline", "err"));

  socket.on("chat:message", (payload) => handlers.onChatMessage?.(payload));
  socket.on("chat:typing", (payload) => handlers.onTyping?.(payload));

  const unsubStore = subscribe((s) => {
    if (disposed || !s.jwt) return;
    if (socket.auth?.token !== s.jwt) {
      socket.auth = { ...(socket.auth || {}), token: s.jwt };
      if (!socket.connected) socket.connect();
    }
  });
  const onSession = () => {
    if (disposed || !updateSocketToken()) return;
    if (!socket.connected) socket.connect();
  };
  window.addEventListener("mc:session", onSession);

  return {
    socket,
    disconnect() {
      try {
        disposed = true;
        unsubStore();
        window.removeEventListener("mc:session", onSession);
        socket.removeAllListeners();
        socket.io?.removeAllListeners?.();
        socket.disconnect();
      } catch (_) {
        /* ignore */
      }
    },
  };
}

export function emitTyping(socket, conversationId, typing) {
  if (!socket || !socket.connected) return;
  socket.emit("typing", { conversationId, typing });
}
