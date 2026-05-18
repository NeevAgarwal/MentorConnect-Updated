import { apiJson } from "../api/client.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/sanitize.js";

export async function refreshNotificationBadge() {
  const wrap = document.getElementById("notifBadge");
  if (!wrap) return;
  try {
    const data = await apiJson("/api/notifications/mine");
    const n = data.unread || 0;
    wrap.textContent = n > 99 ? "99+" : String(n);
    wrap.classList.toggle("notif-badge--hidden", n <= 0);
  } catch {
    wrap.classList.add("notif-badge--hidden");
  }
}

export async function loadNotificationList() {
  const list = document.getElementById("notifList");
  if (!list) return;
  list.innerHTML = '<div class="notif-loading">Loading…</div>';
  try {
    const data = await apiJson("/api/notifications/mine");
    if (!data.notifications?.length) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = data.notifications
      .slice(0, 20)
      .map(
        (n) => `
      <div class="notif-item ${n.read ? "" : "unread"}" data-id="${escapeHtml(n._id)}">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-body">${escapeHtml(n.body)}</div>
        <div class="notif-time">${escapeHtml(new Date(n.createdAt).toLocaleString())}</div>
      </div>`
      )
      .join("");
    list.querySelectorAll(".notif-item").forEach((el) => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        try {
          await apiJson("/api/notifications/" + id + "/read", { method: "PATCH" });
          el.classList.remove("unread");
          refreshNotificationBadge();
        } catch (e) {
          showToast(e.message || "Failed", "error");
        }
      });
    });
  } catch (e) {
    list.innerHTML = '<div class="notif-empty">Could not load</div>';
    showToast(e.message || "Notifications failed", "error");
  }
}

export function initNotifications() {
  const bell = document.getElementById("notifBell");
  const dd = document.getElementById("notifDropdown");
  if (bell && dd) {
    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dd.classList.toggle("open");
      if (open) loadNotificationList();
    });
  }
  if (!window.__mcNotifOutside) {
    window.__mcNotifOutside = true;
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".notif-bell-wrap")) {
        document.getElementById("notifDropdown")?.classList.remove("open");
      }
    });
  }
}
