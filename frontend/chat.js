let socket = null;
let activeWith = null;
let typingTimer = null;
let socketConnected = false;
let socketRefreshing = false;
let selectSeq = 0;
let pendingByClientId = new Map();
let failedByClientId = new Map();
const scrollByPeer = new Map();
let incomingTypingTimer = null;

function currentJwt() {
  return localStorage.getItem("mc_jwt") || "";
}

async function refreshSocketJwtAndReconnect() {
  if (!socket || socketRefreshing) return;
  socketRefreshing = true;
  try {
    const token = await syncMcJwt();
    if (token) {
      socket.auth = { ...(socket.auth || {}), token };
      socket.disconnect();
      socket.connect();
    }
  } catch (err) {
    console.warn("[CHAT] Socket JWT refresh failed:", err);
  } finally {
    socketRefreshing = false;
  }
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarFor(user) {
  if (user?.profilePic) return `<img src="${esc(user.profilePic)}" alt="" />`;
  return initials(user?.name || "User");
}

function shortTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function params() {
  const u = new URLSearchParams(location.search);
  return u.get("with") || "";
}

async function loadSidebar() {
  const res = await mcGet("/api/chat/conversations");
  const list = document.getElementById("convList");
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = "<p class='conv-empty'>Could not load conversations</p>";
    return;
  }

  const rows = res.data.conversations || [];
  
  if (!rows.length) {
    list.innerHTML = "<p class='conv-empty'>Start by messaging someone from the directory.</p>";
    return;
  }

  list.innerHTML = rows
    .map((c) => `
    <div class="conv-item ${activeWith === c.otherUser?.firebaseUID ? "active" : ""}" data-with="${esc(c.otherUser?.firebaseUID || '')}" data-name="${esc(c.otherUser?.name || 'User')}">
      <div class="conv-avatar">${avatarFor(c.otherUser)}</div>
      <div class="conv-copy">
      <div class="conv-item-top">
        <div class="conv-item-name">${esc(c.otherUser?.name || 'Unknown')}</div>
        <span class="conv-time">${shortTime(c.lastMessage?.createdAt)}</span>
      </div>
      <div class="conv-item-preview">${esc(c.lastMessage?.text || '')}</div>
      </div>
      ${c.unreadCount ? `<span class="conv-unread">${c.unreadCount > 99 ? "99+" : esc(c.unreadCount)}</span>` : ""}
    </div>`)
    .join("");

  list.querySelectorAll(".conv-item").forEach((el) => {
    el.addEventListener("click", () => 
      selectChat(el.getAttribute("data-with"), el.getAttribute("data-name"))
    );
  });

  const deep = params();
  if (deep && !activeWith) {
    const found = rows.find((r) => r.otherUser?.firebaseUID === deep);
    selectChat(deep, found ? found.otherUser.name : "User");
  }
}

function setTypingText(text) {
  const ind = document.getElementById("typingInd");
  if (ind) ind.textContent = text || "";
}

function setPeerStatus(text) {
  const statusEl = document.getElementById("chatPeerStatus");
  if (statusEl) statusEl.textContent = text || "";
}

function updateComposerState() {
  const input = document.getElementById("msgInput");
  const sendBtn = document.getElementById("sendBtn");
  const canSend = Boolean(activeWith && input && input.value.trim());
  if (input) input.disabled = !activeWith;
  if (sendBtn) sendBtn.disabled = !canSend;
}

function messageHtml(m, me, grouped = false) {
  const mine = m.senderFirebaseUID === me;
  const t = shortTime(m.createdAt || Date.now());
  const id = esc(m._id || m.clientId || `${m.senderFirebaseUID}-${m.createdAt || Date.now()}`);
  const status = m.pending ? "Sending..." : m.failed ? "Failed to send - click to retry" : t;
  return `<div class="bubble ${mine ? "me" : "them"} ${grouped ? "grouped" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}" data-msg-id="${id}" ${m.failed ? 'role="button" tabindex="0"' : ""}>${esc(m.text)}<div class="bubble-meta ${m.failed ? "retry-hint" : ""}">${esc(status)}</div></div>`;
}

function renderMessages(messages) {
  const thread = document.getElementById("msgThread");
  if (!thread) return;
  const me = auth.currentUser?.uid;
  let lastDay = "";
  let lastSender = "";
  let lastTime = 0;
  thread.innerHTML = (messages || []).map((m) => {
    const d = new Date(m.createdAt || Date.now());
    const day = d.toDateString();
    const gap = d.getTime() - lastTime;
    const grouped = lastSender === m.senderFirebaseUID && gap < 5 * 60 * 1000 && lastDay === day;
    const dateBreak = day !== lastDay ? `<div class="date-divider">${esc(d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }))}</div>` : "";
    lastDay = day;
    lastSender = m.senderFirebaseUID;
    lastTime = d.getTime();
    return dateBreak + messageHtml(m, me, grouped);
  }).join("");
  const saved = activeWith ? scrollByPeer.get(activeWith) : null;
  thread.scrollTop = Number.isFinite(saved) ? saved : thread.scrollHeight;
}

function appendMessage(message) {
  const thread = document.getElementById("msgThread");
  if (!thread || !message) return false;
  const id = message._id || "";
  if (id && Array.from(thread.querySelectorAll(".bubble")).some((el) => el.getAttribute("data-msg-id") === id)) return false;
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
  const prev = thread.querySelector(".bubble:last-of-type");
  const prevSender = prev?.classList.contains("me") ? auth.currentUser?.uid : "other";
  const grouped = Boolean(prev) && ((message.senderFirebaseUID === auth.currentUser?.uid && prevSender === auth.currentUser?.uid) || (message.senderFirebaseUID !== auth.currentUser?.uid && prevSender === "other"));
  thread.insertAdjacentHTML("beforeend", messageHtml(message, auth.currentUser?.uid, grouped));
  if (nearBottom || message.senderFirebaseUID === auth.currentUser?.uid) thread.scrollTop = thread.scrollHeight;
  return true;
}

function replaceOptimisticMessage(clientId, message) {
  const thread = document.getElementById("msgThread");
  const el = thread ? Array.from(thread.querySelectorAll(".bubble")).find((node) => node.getAttribute("data-msg-id") === clientId) : null;
  pendingByClientId.delete(clientId);
  failedByClientId.delete(clientId);
  const serverId = message?._id;
  const existingServer = serverId && thread ? Array.from(thread.querySelectorAll(".bubble")).find((node) => node.getAttribute("data-msg-id") === serverId) : null;
  if (existingServer && el) {
    el.remove();
    thread.scrollTop = thread.scrollHeight;
    return true;
  }
  if (!el || !message) return appendMessage(message);
  el.outerHTML = messageHtml(message, auth.currentUser?.uid);
  thread.scrollTop = thread.scrollHeight;
  return true;
}

function replaceMatchingPendingEcho(message) {
  if (!message || message.senderFirebaseUID !== auth.currentUser?.uid) return false;
  for (const [clientId, pending] of pendingByClientId.entries()) {
    const pendingPeer = typeof pending === "string" ? pending : pending?.toFirebaseUID;
    const pendingText = typeof pending === "string" ? "" : pending?.text || "";
    if (pendingPeer === activeWith && (!pendingText || pendingText === message.text)) {
      return replaceOptimisticMessage(clientId, message);
    }
  }
  return false;
}

function markOptimisticFailed(clientId, retryPayload) {
  const thread = document.getElementById("msgThread");
  const el = thread ? Array.from(thread.querySelectorAll(".bubble")).find((node) => node.getAttribute("data-msg-id") === clientId) : null;
  pendingByClientId.delete(clientId);
  if (retryPayload) failedByClientId.set(clientId, retryPayload);
  if (!el) return;
  el.classList.remove("pending");
  el.classList.add("failed");
  const meta = el.querySelector(".bubble-meta");
  if (meta) {
    meta.classList.add("retry-hint");
    meta.textContent = "Failed to send - click to retry";
  }
}

function clearActiveUnread() {
  if (!activeWith) return;
  const item = Array.from(document.querySelectorAll(".conv-item")).find((el) => el.getAttribute("data-with") === activeWith);
  item?.querySelector(".conv-unread")?.remove();
}

async function selectChat(uid, name) {
  if (!uid) return;
  const thread = document.getElementById("msgThread");
  if (activeWith && thread) {
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    if (nearBottom) scrollByPeer.delete(activeWith);
    else scrollByPeer.set(activeWith, thread.scrollTop);
  }
  const requestId = ++selectSeq;
  
  activeWith = uid;
  updateComposerState();
  document.querySelectorAll(".conv-item").forEach((x) => 
    x.classList.toggle("active", x.getAttribute("data-with") === uid)
  );
  
  const peerNameEl = document.getElementById("chatPeerName");
  if (peerNameEl) peerNameEl.textContent = name || uid;
  const statusEl = document.getElementById("chatPeerStatus");
  if (statusEl) statusEl.textContent = socketConnected ? "Realtime connected" : "Syncing messages";
  
  setTypingText("Loading...");
  const res = await mcGet(`/api/chat/messages?withUser=${encodeURIComponent(uid)}`);
  if (requestId !== selectSeq || activeWith !== uid) return;
  
  if (!res.ok) {
    if (thread) thread.innerHTML = "<p>Could not load messages</p>";
    setTypingText("");
    setPeerStatus("Could not load this conversation");
    return;
  }

  renderMessages(res.data.messages || []);
  clearActiveUnread();
  setTypingText("");
}

async function recoverChat() {
  await loadSidebar();
  if (!activeWith) return;
  const name = document.getElementById("chatPeerName")?.textContent || "User";
  await selectChat(activeWith, name);
}

function connectSocket() {
  const base = window.MC_API || "http://localhost:5000";
  const token = currentJwt();
  
  if (!token) {
    console.warn("[CHAT] No JWT token for socket connection");
    return;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  try {
    socket = io(base, {
      transports: ["websocket", "polling"],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => {
      console.log("[CHAT] Socket connected");
      socketConnected = true;
      setTypingText("");
      setPeerStatus(activeWith ? "Realtime connected" : "Choose a thread to continue");
      recoverChat().catch((err) => console.warn("[CHAT] Recovery failed:", err));
    });

    socket.on("disconnect", () => {
      console.log("[CHAT] Socket disconnected");
      socketConnected = false;
      setTypingText("Reconnecting...");
      setPeerStatus("Reconnecting and recovering missed messages");
    });

    socket.on("connect_error", (err) => {
      console.error("[CHAT] Socket connection error:", err);
      if (/unauthorized|invalid|expired/i.test(err?.message || "")) {
        refreshSocketJwtAndReconnect();
      }
    });

    socket.io.on("reconnect_attempt", () => {
      const next = currentJwt();
      if (next) socket.auth = { ...(socket.auth || {}), token: next };
    });

    socket.on("chat:message", (payload) => {
      if (!payload) return;
      const cidParts = (payload.conversationId || "").split("__");
      if (activeWith && cidParts.includes(activeWith)) {
        if (replaceMatchingPendingEcho(payload.message)) {
          loadSidebar();
          return;
        }
        appendMessage(payload.message);
        clearActiveUnread();
        if (payload.message?.senderFirebaseUID !== auth.currentUser?.uid) {
          mcGet(`/api/chat/messages?withUser=${encodeURIComponent(activeWith)}`).then(() => loadSidebar());
        } else {
          loadSidebar();
        }
        return;
      }
      loadSidebar();
    });

    socket.on("notification:new", () => {
      loadSidebar();
    });

    socket.on("chat:typing", (payload) => {
      if (!activeWith || !payload) return;
      if (!payload.conversationId?.includes(activeWith)) return;
      setTypingText(payload.typing ? "Typing..." : "");
      clearTimeout(incomingTypingTimer);
      if (payload.typing) {
        incomingTypingTimer = setTimeout(() => setTypingText(""), 2500);
      }
    });
  } catch (err) {
    console.error("[CHAT] Socket connection failed:", err);
  }
}

async function sendMessage() {
  const input = document.getElementById("msgInput");
  const text = input?.value?.trim();
  
  if (!text || !activeWith) return;
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = true;
  const clientId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const activeAtSend = activeWith;
  appendMessage({
    clientId,
    senderFirebaseUID: auth.currentUser?.uid,
    text,
    createdAt: new Date().toISOString(),
    pending: true,
  });
  pendingByClientId.set(clientId, { toFirebaseUID: activeAtSend, text });
  if (input) input.value = "";
  updateComposerState();

  try {
    const res = await mcPost("/api/chat/messages", {
      toFirebaseUID: activeAtSend,
      text,
    });

    if (res.ok) {
      if (activeWith === activeAtSend) {
        replaceOptimisticMessage(clientId, res.data.message);
      } else {
        pendingByClientId.delete(clientId);
      }
      loadSidebar();
      
      if (socket && socketConnected) {
        socket.emit("typing", {
          conversationId: [auth.currentUser?.uid, activeAtSend].sort().join("__"),
          typing: false,
        });
      }
    } else {
      if (activeWith === activeAtSend) markOptimisticFailed(clientId, { toFirebaseUID: activeAtSend, text });
      console.error("[CHAT] Message send failed:", res.error);
      setPeerStatus(res.error || "Message failed. Click it to retry.");
    }
  } catch (err) {
    if (activeWith === activeAtSend) markOptimisticFailed(clientId, { toFirebaseUID: activeAtSend, text });
    console.error("[CHAT] Error sending message:", err);
    setPeerStatus("Message failed. Click it to retry.");
  } finally {
    updateComposerState();
  }
}

async function retryFailedMessage(clientId) {
  const payload = failedByClientId.get(clientId);
  if (!payload || !payload.toFirebaseUID || !payload.text) return;
  const thread = document.getElementById("msgThread");
  const el = thread ? Array.from(thread.querySelectorAll(".bubble")).find((node) => node.getAttribute("data-msg-id") === clientId) : null;
  if (el) {
    el.classList.remove("failed");
    el.classList.add("pending");
    const meta = el.querySelector(".bubble-meta");
    if (meta) {
      meta.classList.remove("retry-hint");
      meta.textContent = "Sending...";
    }
  }
  pendingByClientId.set(clientId, payload.toFirebaseUID);
  failedByClientId.delete(clientId);
  try {
    const res = await mcPost("/api/chat/messages", payload);
    if (res.ok) {
      replaceOptimisticMessage(clientId, res.data.message);
      loadSidebar();
      setPeerStatus("Realtime connected");
    } else {
      markOptimisticFailed(clientId, payload);
      setPeerStatus(res.error || "Retry failed.");
    }
  } catch (err) {
    markOptimisticFailed(clientId, payload);
    setPeerStatus("Retry failed.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthState();
  const state = getAuthState();
  if (!state.firebaseUser) return;
  updateComposerState();

  try {
    await loadSidebar();
    connectSocket();
    if (!window.__mcChatSessionListener) {
      window.__mcChatSessionListener = true;
      window.addEventListener("mc:session", () => {
        if (!socket) return;
        const token = currentJwt();
        if (!token) return;
        socket.auth = { ...(socket.auth || {}), token };
        if (!socket.connected) socket.connect();
      });
      window.addEventListener("focus", () => recoverChat().catch(() => null));
      window.addEventListener("online", () => {
        if (socket && !socket.connected) socket.connect();
        recoverChat().catch(() => null);
      });
      window.addEventListener("offline", () => setTypingText("Offline"));
    }

    const deep = params();
    if (deep && !activeWith) {
      const exists = Array.from(document.querySelectorAll(".conv-item")).find((el) => el.getAttribute("data-with") === deep);
      if (exists) exists.click();
      else selectChat(deep, "User");
    }
  } catch (err) {
    console.error("[CHAT] Initialization error:", err);
  }

  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.addEventListener("click", sendMessage);
  const thread = document.getElementById("msgThread");
  if (thread) {
    thread.addEventListener("click", (e) => {
      const bubble = e.target.closest(".bubble.failed");
      if (!bubble) return;
      retryFailedMessage(bubble.getAttribute("data-msg-id"));
    });
    thread.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const bubble = e.target.closest(".bubble.failed");
      if (!bubble) return;
      e.preventDefault();
      retryFailedMessage(bubble.getAttribute("data-msg-id"));
    });
  }

  const msgInput = document.getElementById("msgInput");
  if (msgInput) {
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    msgInput.addEventListener("input", () => {
      updateComposerState();
      if (!socket || !socketConnected || !activeWith || !auth.currentUser) return;
      const cid = [auth.currentUser.uid, activeWith].sort().join("__");
      socket.emit("typing", { conversationId: cid, typing: true });

      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (socket && socketConnected) {
          socket.emit("typing", { conversationId: cid, typing: false });
        }
      }, 1200);
    });
  }
});
