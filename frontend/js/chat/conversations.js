import { apiJson } from "../api/client.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/sanitize.js";

export async function loadConversationSidebar(listEl, onPick) {
  if (!listEl) return [];
  try {
    const data = await apiJson("/api/chat/conversations");
    const rows = data.conversations || [];
    if (!rows.length) {
      listEl.innerHTML = "<p class='conv-empty'>Start by messaging someone from the directory.</p>";
      return rows;
    }
    listEl.innerHTML = rows
      .map(
        (c) => `
    <div class="conv-item" data-with="${escapeHtml(c.otherUser.firebaseUID)}" data-name="${escapeHtml(c.otherUser.name)}">
      <div class="conv-item-name">${escapeHtml(c.otherUser.name)}</div>
      <div class="conv-item-preview">${escapeHtml(c.lastMessage?.text || "")}</div>
    </div>`
      )
      .join("");
    listEl.querySelectorAll(".conv-item").forEach((el) => {
      el.addEventListener("click", () => {
        const uid = el.getAttribute("data-with");
        const name = el.getAttribute("data-name");
        onPick(uid, name);
      });
    });
    return rows;
  } catch (e) {
    listEl.innerHTML = "<p class='conv-empty'>Could not load conversations</p>";
    showToast(e.message || "Conversations failed", "error");
    return [];
  }
}

export function paramsWithUser() {
  const u = new URLSearchParams(location.search);
  return u.get("with") || "";
}
