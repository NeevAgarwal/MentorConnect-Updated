let socket = null;
let activeWith = null;
let typingTimer = null;
let socketConnected = false;
let socketRefreshing = false;

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
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function params() {
  const u = new URLSearchParams(location.search);
  return u.get("with") || "";
}

async function loadSidebar() {
  const res = await mcGet("/api/chat/conversations");
  if (!res.ok) {
    const list = document.getElementById("convList");
    list.innerHTML = "<p class='conv-empty'>Could not load conversations</p>";
    return;
  }

  const rows = res.data.conversations || [];
  const list = document.getElementById("convList");
  
  if (!rows.length) {
    list.innerHTML = "<p class='conv-empty'>Start by messaging someone from the directory.</p>";
    return;
  }

  list.innerHTML = rows
    .map((c) => `
    <div class="conv-item" data-with="${esc(c.otherUser?.firebaseUID || '')}" data-name="${esc(c.otherUser?.name || 'User')}">
      <div class="conv-item-name">${esc(c.otherUser?.name || 'Unknown')}</div>
      <div class="conv-item-preview">${esc(c.lastMessage?.text || '')}</div>
    </div>`)
    .join("");

  list.querySelectorAll(".conv-item").forEach((el) => {
    el.addEventListener("click", () => 
      selectChat(el.getAttribute("data-with"), el.getAttribute("data-name"))
    );
  });

  const deep = params();
  if (deep) {
    const found = rows.find((r) => r.otherUser?.firebaseUID === deep);
    selectChat(deep, found ? found.otherUser.name : "User");
  }
}

async function selectChat(uid, name) {
  if (!uid) return;
  
  activeWith = uid;
  document.querySelectorAll(".conv-item").forEach((x) => 
    x.classList.toggle("active", x.getAttribute("data-with") === uid)
  );
  
  const peerNameEl = document.getElementById("chatPeerName");
  if (peerNameEl) peerNameEl.textContent = name || uid;
  
  const res = await mcGet(`/api/chat/messages?withUser=${encodeURIComponent(uid)}`);
  const thread = document.getElementById("msgThread");
  
  if (!res.ok) {
    if (thread) thread.innerHTML = "<p>Could not load messages</p>";
    return;
  }

  const me = auth.currentUser?.uid;
  if (thread) {
    thread.innerHTML = (res.data.messages || [])
      .map((m) => {
        const mine = m.senderFirebaseUID === me;
        const t = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `<div class="bubble ${mine ? "me" : "them"}">${esc(m.text)}<div class="bubble-meta">${t}</div></div>`;
      })
      .join("");
    thread.scrollTop = thread.scrollHeight;
  }
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
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("[CHAT] Socket connected");
      socketConnected = true;
    });

    socket.on("disconnect", () => {
      console.log("[CHAT] Socket disconnected");
      socketConnected = false;
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
      if (!activeWith || !payload) return;
      const cidParts = (payload.conversationId || "").split("__");
      if (!cidParts.includes(activeWith)) return;
      const peerName = document.getElementById("chatPeerName")?.textContent || "User";
      selectChat(activeWith, peerName);
    });

    socket.on("chat:typing", (payload) => {
      if (!activeWith || !payload) return;
      if (!payload.conversationId?.includes(activeWith)) return;
      const ind = document.getElementById("typingInd");
      if (ind) {
        ind.textContent = payload.typing ? "Typing…" : "";
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

  try {
    const res = await mcPost("/api/chat/messages", {
      toFirebaseUID: activeWith,
      text,
    });

    if (res.ok) {
      if (input) input.value = "";
      const peerName = document.getElementById("chatPeerName")?.textContent || "User";
      selectChat(activeWith, peerName);
      loadSidebar();
      
      if (socket && socketConnected) {
        socket.emit("typing", {
          conversationId: [auth.currentUser?.uid, activeWith].sort().join("__"),
          typing: false,
        });
      }
    } else {
      console.error("[CHAT] Message send failed:", res.error);
    }
  } catch (err) {
    console.error("[CHAT] Error sending message:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthState();
  const state = getAuthState();
  if (!state.firebaseUser) return;

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
    }

    const deep = params();
    if (deep) {
      const exists = document.querySelector(`.conv-item[data-with="${deep}"]`);
      if (exists) exists.click();
      else selectChat(deep, "User");
    }
  } catch (err) {
    console.error("[CHAT] Initialization error:", err);
  }

  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.addEventListener("click", sendMessage);

  const msgInput = document.getElementById("msgInput");
  if (msgInput) {
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    msgInput.addEventListener("input", () => {
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
