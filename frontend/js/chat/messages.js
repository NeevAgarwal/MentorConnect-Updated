import { escapeHtml } from "../utils/sanitize.js";

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function bubbleFromMessage(m, myUid) {
  const mine = m.senderFirebaseUID === myUid;
  const wrap = document.createElement("div");
  wrap.className = "bubble " + (mine ? "me" : "them");
  wrap.dataset.msgId = String(m._id || m.clientId || "");
  const text = document.createElement("div");
  text.className = "bubble-text";
  text.textContent = m.text || "";
  const meta = document.createElement("div");
  meta.className = "bubble-meta";
  meta.textContent = formatTime(m.createdAt);
  if (m.deliveryState === "sending") {
    meta.textContent += " · Sending…";
  } else if (m.deliveryState === "failed") {
    meta.textContent += " · Failed";
  }
  wrap.appendChild(text);
  wrap.appendChild(meta);
  return wrap;
}

export function renderThread(container, messages, myUid) {
  if (!container) return;
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const m of messages || []) {
    frag.appendChild(bubbleFromMessage(m, myUid));
  }
  container.appendChild(frag);
  container.scrollTop = container.scrollHeight;
}

export function appendMessageIfNew(container, m, myUid) {
  if (!container || !m) return;
  const id = String(m._id || "");
  if (id && container.querySelector(`[data-msg-id="${id}"]`)) return;
  container.appendChild(bubbleFromMessage(m, myUid));
  container.scrollTop = container.scrollHeight;
}

export function markClientMessage(container, clientId, serverMsg, myUid) {
  if (!clientId || !serverMsg) return;
  const el = container.querySelector(`[data-msg-id="${clientId}"]`);
  if (el) {
    el.dataset.msgId = String(serverMsg._id || "");
    const meta = el.querySelector(".bubble-meta");
    if (meta) meta.textContent = formatTime(serverMsg.createdAt);
  } else {
    appendMessageIfNew(container, serverMsg, myUid);
  }
}

export function appendOptimistic(container, text, myUid, clientId) {
  if (!container) return;
  const m = {
    _id: clientId,
    clientId,
    senderFirebaseUID: myUid,
    text,
    createdAt: new Date().toISOString(),
    deliveryState: "sending",
  };
  appendMessageIfNew(container, m, myUid);
}

export function setBubbleFailed(container, clientId) {
  const el = container?.querySelector(`[data-msg-id="${clientId}"]`);
  if (!el) return;
  const meta = el.querySelector(".bubble-meta");
  if (meta) meta.textContent += " · Failed";
}
