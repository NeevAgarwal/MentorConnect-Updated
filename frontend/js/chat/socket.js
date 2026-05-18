import { getState } from "../state/store.js";
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

  const setStatus = (t, kind) => {
    handlers.onConnectionState?.(t, kind);
  };

  socket.on("connect", () => setStatus("Live", "ok"));
  socket.on("disconnect", (reason) => setStatus("Disconnected", "warn"));
  socket.on("connect_error", (err) => {
    logger.warn("socket connect_error", err?.message);
    setStatus("Reconnecting…", "warn");
  });
  socket.on("reconnect_attempt", () => setStatus("Reconnecting…", "warn"));
  socket.on("reconnect_failed", () => setStatus("Offline", "err"));

  socket.on("chat:message", (payload) => {
    handlers.onChatMessage?.(payload);
  });
  socket.on("chat:typing", (payload) => {
    handlers.onTyping?.(payload);
  });

  return {
    socket,
    disconnect() {
      try {
        socket.removeAllListeners();
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
