import { startAuthEngine } from "../auth/auth-state.esm.js";
import { protectPage } from "../auth/guards.js";
import { getAuth } from "../auth/auth-state.esm.js";
import { apiJson } from "../api/client.js";
import { showToast } from "../utils/toast.js";
import { loadConversationSidebar, paramsWithUser } from "./conversations.js";
import { renderThread, appendMessageIfNew, appendOptimistic, markClientMessage, setBubbleFailed } from "./messages.js";
import { createChatSocket, emitTyping } from "./socket.js";

let activeWith = null;
let activeName = "";
let typingTimer = null;
let typingEmitTimer = null;
let socketApi = { socket: null, disconnect: () => {} };
let listenersBound = false;

function conversationId(me, other) {
  return [me, other].sort().join("__");
}

function updateSocketStatusEl(text, kind) {
  const el = document.getElementById("socketStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("chat-socket-status--ok", "chat-socket-status--warn", "chat-socket-status--err");
  if (kind === "ok") el.classList.add("chat-socket-status--ok");
  else if (kind === "warn") el.classList.add("chat-socket-status--warn");
  else if (kind === "err") el.classList.add("chat-socket-status--err");
}

async function selectChat(uid, name) {
  const auth = getAuth();
  const me = auth.currentUser?.uid;
  if (!me || !uid) return;
  activeWith = uid;
  activeName = name || uid;
  document.querySelectorAll(".conv-item").forEach((x) => x.classList.toggle("active", x.getAttribute("data-with") === uid));
  const title = document.getElementById("chatPeerName");
  if (title) title.textContent = activeName;
  const thread = document.getElementById("msgThread");
  try {
    const data = await apiJson("/api/chat/messages?withUser=" + encodeURIComponent(uid));
    renderThread(thread, data.messages || [], me);
  } catch (e) {
    if (thread) thread.innerHTML = "<p>Could not load messages</p>";
    showToast(e.message || "Messages failed", "error");
  }
}

async function sendMessage() {
  const auth = getAuth();
  const me = auth.currentUser?.uid;
  const text = document.getElementById("msgInput")?.value.trim();
  const thread = document.getElementById("msgThread");
  if (!text || !activeWith || !me) return;

  const cid = conversationId(me, activeWith);
  emitTyping(socketApi.socket, cid, false);

  const clientId = "tmp_" + Date.now();
  appendOptimistic(thread, text, me, clientId);
  document.getElementById("msgInput").value = "";

  try {
    const data = await apiJson("/api/chat/messages", {
      method: "POST",
      body: { toFirebaseUID: activeWith, text },
    });
    const msg = data.message;
    markClientMessage(thread, clientId, msg, me);
    await loadConversationSidebar(document.getElementById("convList"), (u, n) => selectChat(u, n));
    const deep = paramsWithUser();
    if (deep) {
      const exists = document.querySelector('.conv-item[data-with="' + deep + '"]');
      if (exists) exists.classList.add("active");
    }
  } catch (e) {
    setBubbleFailed(thread, clientId);
    showToast(e.message || "Send failed", "error");
  }
}

function wireDomOnce() {
  if (listenersBound) return;
  listenersBound = true;
  document.getElementById("sendBtn")?.addEventListener("click", sendMessage);
  document.getElementById("msgInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  document.getElementById("msgInput")?.addEventListener("input", () => {
    const auth = getAuth();
    const me = auth.currentUser?.uid;
    if (!socketApi.socket || !activeWith || !me) return;
    const cid = conversationId(me, activeWith);
    clearTimeout(typingEmitTimer);
    typingEmitTimer = setTimeout(() => {
      emitTyping(socketApi.socket, cid, true);
    }, 200);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      emitTyping(socketApi.socket, cid, false);
    }, 1200);
  });
}

export async function initChatApp() {
  startAuthEngine();
  try {
    await protectPage();
  } catch {
    return;
  }
  wireDomOnce();

  const auth = getAuth();
  const me = auth.currentUser?.uid;

  const rows = await loadConversationSidebar(document.getElementById("convList"), (u, n) => selectChat(u, n));

  socketApi = createChatSocket({
    onConnectionState: updateSocketStatusEl,
    onChatMessage: (payload) => {
      if (!activeWith || !payload?.conversationId) return;
      const parts = String(payload.conversationId).split("__");
      if (!parts.includes(activeWith)) return;
      const msg = payload.message;
      const thread = document.getElementById("msgThread");
      appendMessageIfNew(thread, msg, me);
      loadConversationSidebar(document.getElementById("convList"), (u, n) => selectChat(u, n)).then(() => {
        document.querySelectorAll(".conv-item").forEach((x) => x.classList.toggle("active", x.getAttribute("data-with") === activeWith));
      });
    },
    onTyping: (payload) => {
      if (!payload || !activeWith) return;
      if (String(payload.conversationId || "").indexOf(activeWith) === -1) return;
      if (payload.from === me) return;
      const ind = document.getElementById("typingInd");
      if (!ind) return;
      ind.textContent = payload.typing ? "Typing…" : "";
    },
  });

  window.addEventListener(
    "pagehide",
    () => {
      socketApi.disconnect();
    },
    { once: true }
  );

  const deep = paramsWithUser();
  if (deep) {
    const found = rows.find((r) => r.otherUser.firebaseUID === deep);
    await selectChat(deep, found ? found.otherUser.name : "User");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initChatApp();
});
