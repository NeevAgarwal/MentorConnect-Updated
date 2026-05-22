// MentorConnect dashboard: marketplace, network, booking.

let allUsers = [];
let mentorList = [];
let debounceTimer = null;
let currentMentorForBooking = null;
let dashboardSocket = null;
let dashboardSocketRefreshing = false;
let bookingSubmitting = false;

function showToast(msg, type = "success") {
  const existing = document.getElementById("mc-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "mc-toast";
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:28px;right:28px;z-index:9999;
    padding:13px 22px;border-radius:12px;
    background:${type === "error" ? "rgba(248,113,113,0.13)" : "rgba(212,175,55,0.12)"};
    border:1px solid ${type === "error" ? "rgba(248,113,113,0.35)" : "rgba(212,175,55,0.35)"};
    color:${type === "error" ? "#F87171" : "#D4AF37"};
    font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;
    backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.4);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initialsFor(name) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarHtml(user, className = "mini-avatar") {
  const pic = user?.profilePic ? `<img src="${escapeHtml(user.profilePic)}" alt="" />` : initialsFor(user?.name);
  return `<div class="${className}">${pic}</div>`;
}

function setButtonBusy(btn, busy, labelWhenBusy) {
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || "";
  btn.disabled = !!busy;
  btn.textContent = busy ? labelWhenBusy || "Working..." : btn.dataset.originalText;
}

function setWidgetLoading(id, count = 3) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = Array(count).fill(0).map(() => '<div class="mini-card skeleton-line"></div>').join("");
}

function setWidgetEmpty(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="widget-empty">${escapeHtml(text)}</div>`;
}

function compactDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function notificationCategory(n) {
  const t = String(n?.type || "system");
  if (t === "message") return "Messages";
  if (t === "booking" || t === "mentor_decision") return "Bookings";
  if (t === "reminder") return "Reminders";
  return "System";
}

function countdownText(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No date";
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "Starting now";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

function profileCompletionFor(user) {
  const base = ["bio", "profilePic", "linkedin"];
  const mentor = ["company", "education", "domain", "experience", "skills", "expertiseTags", "bookableSlots"];
  const student = ["skills", "interests", "goals"];
  const fields = [...base, ...(user?.role === "mentor" ? mentor : student)];
  const done = fields.filter((key) => {
    const value = user?.[key];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(String(value || "").trim());
  }).length;
  return Math.round((done / fields.length) * 100);
}

function renderQuickActions() {
  const el = document.getElementById("quickActions");
  if (!el) return;
  const role = localStorage.getItem("mc_role") || "student";
  const actions = [
    { label: "Find mentor", href: "#mentorsMarketGrid", hint: "Browse matches" },
    { label: "Continue chat", href: "chat.html", hint: "Open messages" },
    { label: role === "mentor" ? "Add slots" : "Edit goals", href: "profile.html", hint: "Improve matching" },
    { label: "View sessions", href: "sessions.html", hint: "Manage bookings" },
  ];
  el.innerHTML = actions
    .map((a) => `<a class="quick-action" href="${escapeHtml(a.href)}"><strong>${escapeHtml(a.label)}</strong><span>${escapeHtml(a.hint)}</span></a>`)
    .join("");
}

function renderSmartDashboard(chats, bookings, notifications) {
  const now = new Date();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const upcoming = bookings
    .filter((b) => new Date(b.startTime) > now && ["pending", "confirmed"].includes(b.status))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const completed = bookings.filter((b) => b.status === "completed");
  const completedWeek = completed.filter((b) => new Date(b.updatedAt || b.startTime) >= weekAgo);
  const chatWeek = chats.filter((c) => new Date(c.lastMessage?.createdAt || 0) >= weekAgo);
  const unread = notifications.filter((n) => !n.read);
  const profile = getAuthState?.().mcUser || {};
  const completion = profileCompletionFor(profile);

  const countdown = document.getElementById("nextSessionCountdown");
  if (countdown) {
    const next = upcoming[0];
    if (!next) {
      countdown.innerHTML = '<div class="widget-empty">No upcoming session yet. Book or publish availability to get one on the calendar.</div>';
    } else {
      const person = next.mentorFirebaseUID === auth.currentUser?.uid ? next.student : next.mentor;
      countdown.innerHTML = `
        <div class="countdown-num">${escapeHtml(countdownText(next.startTime))}</div>
        <div class="countdown-title">${escapeHtml(next.topic || "Mentor session")}</div>
        <div class="countdown-sub">${escapeHtml(person?.name || "Participant")} - ${escapeHtml(compactDate(next.startTime))}</div>
        <div class="readiness-row"><span></span><span style="width:${Math.min(100, completion)}%"></span></div>`;
    }
  }

  const learning = document.getElementById("learningStats");
  if (learning) {
    const streak = Number(profile.streakCount || 0) || Math.min(7, Math.max(1, completed.length + chatWeek.length));
    learning.innerHTML = [
      { label: "Profile", value: `${completion}%` },
      { label: "Streak", value: `${streak}d` },
      { label: "Completed", value: completed.length },
      { label: "Unread", value: unread.length },
    ]
      .map((m) => `<div class="metric-pill"><strong>${escapeHtml(m.value)}</strong><span>${escapeHtml(m.label)}</span></div>`)
      .join("");
  }

  const activity = document.getElementById("recentActivityFeed");
  if (activity) {
    const items = [
      ...notifications.slice(0, 8).map((n) => ({ type: n.type || "system", title: n.title, body: n.body, time: n.createdAt, href: n.type === "message" ? "chat.html" : "sessions.html" })),
      ...chats.slice(0, 5).map((c) => ({ type: "message", title: c.otherUser?.name || "Conversation", body: c.lastMessage?.text || "No messages yet", time: c.lastMessage?.createdAt, href: `chat.html?with=${encodeURIComponent(c.otherUser?.firebaseUID || "")}` })),
      ...upcoming.slice(0, 5).map((b) => ({ type: "booking", title: b.topic || "Upcoming session", body: compactDate(b.startTime), time: b.createdAt || b.startTime, href: "sessions.html" })),
    ]
      .filter((x) => x.time)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 7);
    activity.innerHTML = items.length
      ? items.map((item) => `<a class="activity-item" href="${escapeHtml(item.href)}"><span class="activity-dot ${escapeHtml(item.type)}"></span><div><strong>${escapeHtml(item.title || "Activity")}</strong><p>${escapeHtml(item.body || "")}</p></div><em>${escapeHtml(timeAgo(item.time))}</em></a>`).join("")
      : '<div class="widget-empty">Activity will appear here as you book sessions, chat, and receive updates.</div>';
  }

  const summary = document.getElementById("weeklySummary");
  if (summary) {
    summary.innerHTML = [
      { label: "Sessions completed", value: completedWeek.length },
      { label: "Active chats", value: chatWeek.length },
      { label: "Upcoming", value: upcoming.length },
      { label: "New alerts", value: notifications.filter((n) => new Date(n.createdAt) >= weekAgo).length },
    ]
      .map((m) => `<div class="summary-row"><span>${escapeHtml(m.label)}</span><strong>${escapeHtml(m.value)}</strong></div>`)
      .join("");
  }
}

function renderTopLists() {
  const skillCounts = new Map();
  const domainCounts = new Map();
  allUsers.forEach((u) => {
    [...(u.skills || []), ...(u.expertiseTags || [])].forEach((s) => {
      const key = String(s || "").trim();
      if (key) skillCounts.set(key, (skillCounts.get(key) || 0) + 1);
    });
    if (u.role === "mentor" && u.domain) {
      domainCounts.set(u.domain, (domainCounts.get(u.domain) || 0) + 1);
    }
  });

  const renderCloud = (id, entries, empty) => {
    const el = document.getElementById(id);
    if (!el) return;
    const list = [...entries].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!list.length) {
      el.innerHTML = `<div class="widget-empty">${escapeHtml(empty)}</div>`;
      return;
    }
    el.innerHTML = list.map(([label, count]) => `<span class="tag-chip">${escapeHtml(label)} <strong>${count}</strong></span>`).join("");
  };

  renderCloud("topSkills", skillCounts, "Skills will appear as profiles are completed.");
  renderCloud("trendingDomains", domainCounts, "Mentor domains will appear after mentors add them.");
}

function renderMentorWidgets() {
  const rec = document.getElementById("recommendedMentors");
  const active = document.getElementById("recentlyActiveMentors");
  const myUid = auth.currentUser?.uid || "";
  if (rec) {
    const mentors = mentorList.filter((m) => m.firebaseUID !== myUid).slice(0, 4);
    if (!mentors.length) {
      setWidgetEmpty("recommendedMentors", "Complete your interests and goals to unlock smarter recommendations.");
    } else {
      rec.innerHTML = mentors
        .map(
          (m) => `
          <div class="mini-card">
            ${avatarHtml(m)}
            <div>
              <div class="mini-title">${escapeHtml(m.name || "Mentor")}</div>
              <div class="mini-sub">${escapeHtml([m.domain || "General", m.company || ""].filter(Boolean).join(" - "))}</div>
            </div>
            <a class="mini-link" href="chat.html?with=${encodeURIComponent(m.firebaseUID || "")}">${m.matchScore ?? 0}%</a>
          </div>`
        )
        .join("");
    }
  }
  if (active) {
    const mentors = mentorList
      .filter((m) => m.firebaseUID !== myUid)
      .slice()
      .sort((a, b) => {
        const slotScore = (b.bookableSlots?.length || 0) - (a.bookableSlots?.length || 0);
        if (slotScore) return slotScore;
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      })
      .slice(0, 4);
    if (!mentors.length) {
      setWidgetEmpty("recentlyActiveMentors", "No active mentors yet. New mentor activity will show here.");
    } else {
      active.innerHTML = mentors
        .map(
          (m) => `
          <div class="mini-card">
            ${avatarHtml(m)}
            <div>
              <div class="mini-title">${escapeHtml(m.name || "Mentor")}</div>
              <div class="mini-sub">${(m.bookableSlots || []).length} open slots - ${escapeHtml(m.domain || "General")}</div>
            </div>
            <a class="mini-link" href="chat.html?with=${encodeURIComponent(m.firebaseUID || "")}">Open</a>
          </div>`
        )
        .join("");
    }
  }
}

function availabilityLabel(status) {
  if (status === "busy") return "Limited";
  if (status === "away") return "Away";
  return "Open";
}

async function loadDashboardActivity() {
  ["continueConversation", "upcomingSessions", "unreadNotifications"].forEach((id) => setWidgetLoading(id, 2));
  const [chatRes, bookingRes, notifRes] = await Promise.allSettled([
    mcGet("/api/chat/conversations"),
    mcGet("/api/bookings/mine"),
    mcGet("/api/notifications/mine"),
  ]);

  const chats = chatRes.value?.ok ? chatRes.value.data.conversations || [] : [];
  const conv = document.getElementById("continueConversation");
  if (conv) {
    if (!chats.length) {
      setWidgetEmpty("continueConversation", "No conversations yet. Message a mentor from the marketplace to start one.");
    } else {
      conv.innerHTML = chats
        .slice(0, 4)
        .map((c) => {
          const u = c.otherUser || {};
          return `
          <div class="mini-card">
            ${avatarHtml(u)}
            <div>
              <div class="mini-title">${escapeHtml(u.name || "User")}</div>
              <div class="mini-sub">${escapeHtml(c.lastMessage?.text || "No messages yet")}</div>
            </div>
            <a class="mini-link" href="chat.html?with=${encodeURIComponent(u.firebaseUID || "")}">${c.unreadCount ? `${c.unreadCount} new` : "Open"}</a>
          </div>`;
        })
        .join("");
    }
  }

  const bookings = bookingRes.value?.ok ? bookingRes.value.data.bookings || [] : [];
  const upcoming = bookings
    .filter((b) => new Date(b.startTime) > new Date() && ["pending", "confirmed"].includes(b.status))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, 4);
  const sessions = document.getElementById("upcomingSessions");
  if (sessions) {
    if (!upcoming.length) {
      setWidgetEmpty("upcomingSessions", "No upcoming sessions. Book a mentor when you are ready.");
    } else {
      const me = auth.currentUser?.uid;
      sessions.innerHTML = upcoming
        .map((b) => {
          const person = b.mentorFirebaseUID === me ? b.student : b.mentor;
          return `
          <div class="mini-card">
            ${avatarHtml(person || {})}
            <div>
              <div class="mini-title">${escapeHtml(b.topic || "Mentor session")}</div>
              <div class="mini-sub">${escapeHtml(person?.name || "Participant")} - ${compactDate(b.startTime)}</div>
            </div>
            <a class="mini-link" href="sessions.html">${escapeHtml(b.status)}</a>
          </div>`;
        })
        .join("");
    }
  }

  const notifications = notifRes.value?.ok ? notifRes.value.data.notifications || [] : [];
  renderSmartDashboard(chats, bookings, notifications);
  const unread = notifications.filter((n) => !n.read).slice(0, 4);
  const notif = document.getElementById("unreadNotifications");
  if (notif) {
    if (!unread.length) {
      setWidgetEmpty("unreadNotifications", "All caught up. New booking and chat alerts will land here.");
    } else {
      notif.innerHTML = unread
        .map(
          (n) => `
          <div class="mini-card">
            <div class="mini-avatar">!</div>
            <div>
              <div class="mini-title">${escapeHtml(n.title || "Notification")}</div>
              <div class="mini-sub">${escapeHtml(n.body || "")}</div>
            </div>
            <span class="mini-meta">${compactDate(n.createdAt)}</span>
          </div>`
        )
        .join("");
    }
  }
}

function toDatetimeLocalValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function currentJwt() {
  return localStorage.getItem("mc_jwt") || "";
}

async function refreshDashboardSocketJwt() {
  if (!dashboardSocket || dashboardSocketRefreshing) return;
  dashboardSocketRefreshing = true;
  try {
    const token = await syncMcJwt();
    if (token) {
      dashboardSocket.auth = { ...(dashboardSocket.auth || {}), token };
      dashboardSocket.disconnect();
      dashboardSocket.connect();
    }
  } finally {
    dashboardSocketRefreshing = false;
  }
}

function connectDashboardRealtime() {
  if (dashboardSocket || typeof io === "undefined") return;
  const token = currentJwt();
  if (!token) return;
  const base = window.MC_API || "http://localhost:5000";
  dashboardSocket = io(base, {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
  });
  dashboardSocket.on("connect_error", (err) => {
    if (/unauthorized|invalid|expired/i.test(err?.message || "")) {
      refreshDashboardSocketJwt();
    }
  });
  dashboardSocket.io.on("reconnect_attempt", () => {
    const token = currentJwt();
    if (token) dashboardSocket.auth = { ...(dashboardSocket.auth || {}), token };
  });
  dashboardSocket.on("notification:new", () => {
    loadNotificationsBadge();
    loadDashboardActivity();
    if (document.getElementById("notifDropdown")?.classList.contains("open")) {
      loadNotifList();
    }
  });
  window.addEventListener("mc:session", () => {
    const token = currentJwt();
    if (!token || !dashboardSocket) return;
    dashboardSocket.auth = { ...(dashboardSocket.auth || {}), token };
    if (!dashboardSocket.connected) dashboardSocket.connect();
  });
}

async function loadNotificationsBadge() {
  const wrap = document.getElementById("notifBadge");
  if (!wrap) return;
  try {
    const res = await mcGet("/api/notifications/mine");
    if (!res.ok) {
      wrap.style.display = "none";
      return;
    }
    const n = res.data.unread || 0;
    wrap.textContent = n > 99 ? "99+" : String(n);
    wrap.style.display = n > 0 ? "inline-flex" : "none";
  } catch (err) {
    console.error("[DASHBOARD] Error loading notifications badge:", err);
    wrap.style.display = "none";
  }
}

async function loadNotifList() {
  const list = document.getElementById("notifList");
  if (!list) return;
  list.innerHTML = '<div class="notif-loading">Loading...</div>';
  try {
    const res = await mcGet("/api/notifications/mine");
    if (!res.ok || !res.data.notifications || res.data.notifications.length === 0) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    const rows = res.data.notifications.slice(0, 30);
    const groups = rows.reduce((acc, n) => {
      const key = n.read ? notificationCategory(n) : "Unread";
      if (!acc[key]) acc[key] = [];
      acc[key].push(n);
      return acc;
    }, {});
    list.innerHTML = Object.entries(groups)
      .map(
        ([group, items]) => `
        <div class="notif-group-label">${escapeHtml(group)} <span>${items.length}</span></div>
        ${items
          .map(
            (n) => `
          <div class="notif-item ${n.read ? "" : "unread"}" data-id="${n._id}">
            <div class="notif-row-top">
              <div class="notif-title">${escapeHtml(n.title)}</div>
              <span class="notif-category">${escapeHtml(notificationCategory(n))}</span>
            </div>
            <div class="notif-body">${escapeHtml(n.body)}</div>
            <div class="notif-time">${escapeHtml(timeAgo(n.createdAt))}</div>
          </div>`
          )
          .join("")}`
      )
      .join("");
    list.querySelectorAll(".notif-item").forEach((el) => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        const n = (res.data.notifications || []).find((item) => item._id === id);
        await mcPatch(`/api/notifications/${id}/read`, {});
        el.classList.remove("unread");
        loadNotificationsBadge();
        loadDashboardActivity();
        if (n?.meta?.conversationId || n?.type === "message") {
          const peer = n.meta?.from || "";
          if (peer) window.location.href = `chat.html?with=${encodeURIComponent(peer)}`;
        } else if (n?.meta?.bookingId || /booking|session/i.test(n?.type || n?.title || "")) {
          window.location.href = "sessions.html";
        }
      });
    });
  } catch (err) {
    console.error("[DASHBOARD] Error loading notifications:", err);
    list.innerHTML = '<div class="notif-empty">Could not load</div>';
  }
}

async function markAllNotificationsRead() {
  const btn = document.getElementById("markAllNotifBtn");
  setButtonBusy(btn, true, "Marking...");
  try {
    const res = await mcPost("/api/notifications/mark-all-read", {});
    if (!res.ok) throw new Error(res.error || "Could not update notifications");
    await Promise.allSettled([loadNotificationsBadge(), loadNotifList(), loadDashboardActivity()]);
  } catch (err) {
    console.error("[DASHBOARD] Mark all notifications error:", err);
    showToast(err.message || "Could not update notifications", "error");
  } finally {
    setButtonBusy(btn, false);
  }
}

async function clearAllNotifications() {
  const btn = document.getElementById("clearAllNotifBtn");
  if (!confirm("Clear all notifications?")) return;
  setButtonBusy(btn, true, "Clearing...");
  try {
    const res = await mcDelete("/api/notifications/mine");
    if (!res.ok) throw new Error(res.error || "Could not clear notifications");
    await Promise.allSettled([loadNotificationsBadge(), loadNotifList(), loadDashboardActivity()]);
  } catch (err) {
    console.error("[DASHBOARD] Clear notifications error:", err);
    showToast(err.message || "Could not clear notifications", "error");
  } finally {
    setButtonBusy(btn, false);
  }
}

function bindNotificationPrefs() {
  const prefs = document.getElementById("notifPrefs");
  if (!prefs || prefs.dataset.bound) return;
  prefs.dataset.bound = "1";
  let state = {};
  try {
    state = JSON.parse(localStorage.getItem("mc_notif_prefs") || "{}");
  } catch (_) {}
  prefs.querySelectorAll("input[type='checkbox']").forEach((input) => {
    const key = input.getAttribute("data-pref");
    input.checked = state[key] !== false;
    input.addEventListener("change", () => {
      state[key] = input.checked;
      localStorage.setItem("mc_notif_prefs", JSON.stringify(state));
      showToast("Notification preferences saved");
    });
  });
}

function toggleNotifDropdown() {
  const dd = document.getElementById("notifDropdown");
  if (!dd) return;
  const willOpen = !dd.classList.contains("open");
  dd.classList.toggle("open", willOpen);
  if (willOpen) loadNotifList();
  if (willOpen) bindNotificationPrefs();
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".notif-bell-wrap")) {
    document.getElementById("notifDropdown")?.classList.remove("open");
  }
});

async function initAuthGuard() {
  await initAuthState();
  const state = getAuthState();
  if (!state.firebaseUser) return;

  const profile = state.mcUser || {};
  const name = profile.name || localStorage.getItem("mc_name") || state.firebaseUser.displayName || "User";
  const role = profile.role || localStorage.getItem("mc_role") || "student";

  document.getElementById("sidebarName").textContent = name;
  document.getElementById("sidebarRole").textContent = role;
  const av = document.getElementById("sidebarAvatar");
  if (av) av.textContent = name.charAt(0).toUpperCase();

  const adminLink = document.getElementById("adminNavItem");
  if (adminLink) {
    adminLink.style.display = profile.isAdmin || localStorage.getItem("mc_admin") === "1" ? "flex" : "none";
  }
  const analyticsLink = document.getElementById("analyticsNavItem");
  if (analyticsLink) {
    analyticsLink.style.display = role === "mentor" ? "flex" : "none";
  }

  ["recommendedMentors", "recentlyActiveMentors"].forEach((id) => setWidgetLoading(id, 2));
  ["topSkills", "trendingDomains"].forEach((id) => setWidgetEmpty(id, "Loading..."));
  loadUsers();
  loadMentors();
  renderQuickActions();
  loadDashboardActivity();
  loadNotificationsBadge();
  connectDashboardRealtime();

  const theme = localStorage.getItem("mc_theme");
  if (theme === "light") document.body.classList.add("theme-light");
}

async function loadUsers() {
  try {
    const res = await mcGet("/api/users/");
    if (!res.ok) {
      throw new Error(res.error || "Failed to load users");
    }
    allUsers = res.data.users || [];
    const mentors = allUsers.filter((u) => u.role === "mentor").length;
    const students = allUsers.filter((u) => u.role === "student").length;
    const statTotal = document.getElementById("statTotal");
    const statMentors = document.getElementById("statMentors");
    const statStudents = document.getElementById("statStudents");
    
    if (statTotal) statTotal.textContent = allUsers.length || 0;
    if (statMentors) statMentors.textContent = mentors;
    if (statStudents) statStudents.textContent = students;
    
    renderNetwork(allUsers);
    renderTopLists();
  } catch (err) {
    console.error("[DASHBOARD] Error loading users:", err);
    showToast("Could not load directory", "error");
    allUsers = [];
    ["statTotal", "statMentors", "statStudents"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "0";
    });
    renderNetwork([]);
    renderTopLists();
  }
}

async function loadMentors() {
  const grid = document.getElementById("mentorsMarketGrid");
  const empty = document.getElementById("mentorsMarketEmpty");
  if (!grid) return;
  if (empty) empty.classList.add("hidden");
  
  grid.innerHTML = Array(6)
    .fill(0)
    .map(() => '<div class="card-skeleton"></div>')
    .join("");
  
  try {
    const qs = buildQuery();
    const res = await mcGet("/api/users/mentors" + (qs ? "?" + qs : ""));
    
    if (!res.ok) {
      throw new Error(res.error || "Failed to load mentors");
    }
    
    mentorList = Array.isArray(res.data.mentors) ? res.data.mentors : [];
    if (!mentorList.length) {
      grid.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      renderMentorWidgets();
      return;
    }
    
    if (empty) empty.classList.add("hidden");
    
    const myUid = auth.currentUser?.uid;
    grid.innerHTML = mentorList
      .map((m) => {
        const initials = (m.name || "?")
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        const pic = m.profilePic ? `<img src="${escapeHtml(m.profilePic)}" alt="" />` : initials;
        const skills =
          (m.skills || []).slice(0, 5).map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("") ||
          '<span class="skill-tag">-</span>';
        const expertise = (m.expertiseTags || []).slice(0, 3).map((s) => `<span class="skill-tag expert">${escapeHtml(s)}</span>`).join("");
        const slotCount = (m.bookableSlots || []).filter((d) => new Date(d) > new Date()).length;
        const trust = Math.min(99, Math.round((m.matchScore || 70) * 0.45 + Number(m.responseRate || 96) * 0.35 + Math.min(20, Number(m.totalSessions || 0))));
        const bookBtn =
          myUid && myUid !== m.firebaseUID && (localStorage.getItem("mc_role") || "") === "student"
            ? `<button type="button" class="connect-btn book-open" data-uid="${escapeHtml(m.firebaseUID)}">Book</button>`
            : `<a href="chat.html?with=${encodeURIComponent(m.firebaseUID)}" class="connect-btn">Message</a>`;
        return `
        <div class="mentor-card market-card" data-uid="${escapeHtml(m.firebaseUID)}">
          <div class="card-header">
            <div class="card-avatar">${pic}</div>
            <div class="card-info">
              <div class="card-name">${escapeHtml(m.name || "Unknown")} ${m.featured ? '<span class="featured-badge">Featured</span>' : ""}</div>
              <span class="badge-domain">${escapeHtml(m.domain || "General")}</span>
              <div class="card-meta">${escapeHtml(m.company || "")}</div>
            </div>
          </div>
          <div class="mentor-signal-row">
            <span class="status-chip ${escapeHtml(m.availabilityStatus || "open")}"><i></i>${escapeHtml(availabilityLabel(m.availabilityStatus))}</span>
            <span>${escapeHtml(Number(m.experienceYears || 0))}+ yrs</span>
            <span>${escapeHtml(m.responseRate || 96)}% response</span>
            <span>${escapeHtml(trust)} trust</span>
          </div>
          <div class="match-row"><span class="match-label">Match</span><span class="match-score">${m.matchScore ?? "-"}</span></div>
          <div class="rating-row">
            <span class="stars">Star ${(m.ratingAvg || 0).toFixed(1)}</span>
            <span class="sessions-count">${m.totalSessions || 0} sessions</span>
            <span class="sessions-count">${slotCount} open slots</span>
            <span class="price-tag">${escapeHtml(m.currency || "INR")} ${m.pricePerSession || 0}<small>/session</small></span>
          </div>
          <p class="card-bio">${escapeHtml((m.bio || "").slice(0, 160))}${(m.bio || "").length > 160 ? "..." : ""}</p>
          ${(m.languages || []).length ? `<div class="mentor-mini-meta">${escapeHtml((m.languages || []).slice(0, 3).join(" / "))}${m.timezone ? ` - ${escapeHtml(m.timezone)}` : ""}</div>` : ""}
          <div class="card-skills">${skills}${expertise}</div>
          <div class="card-actions">
            ${m.linkedin ? `<a class="connect-btn outline" href="${escapeHtml(m.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}
            ${bookBtn}
          </div>
        </div>`;
      })
      .join("");

    grid.querySelectorAll(".book-open").forEach((btn) => {
      btn.addEventListener("click", () => openBookingModal(btn.getAttribute("data-uid")));
    });
    grid.querySelectorAll(".market-card").forEach((card) => {
      card.addEventListener("click", (ev) => {
        if (ev.target.closest("a") || ev.target.closest("button")) return;
        const uid = card.getAttribute("data-uid");
        if (uid) {
          mcPost(`/api/users/${uid}/profile-view`, {}).catch((err) => {
            console.error("[DASHBOARD] Error logging profile view:", err);
          });
        }
      });
    });
    renderMentorWidgets();
  } catch (err) {
    console.error("[DASHBOARD] Error loading mentors:", err);
    grid.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    showToast("Could not load mentors", "error");
    renderMentorWidgets();
  }
}

function buildQuery() {
  const q = new URLSearchParams();
  const search = document.getElementById("mentorSearch")?.value?.trim();
  const domain = document.getElementById("filterDomain")?.value?.trim();
  const minRaw = document.getElementById("filterMinPrice")?.value;
  const maxRaw = document.getElementById("filterMaxPrice")?.value;
  const ratingRaw = document.getElementById("filterMinRating")?.value;
  const minP = minRaw === "" || minRaw == null ? null : Number(minRaw);
  const maxP = maxRaw === "" || maxRaw == null ? null : Number(maxRaw);
  const minR = ratingRaw === "" || ratingRaw == null ? null : Number(ratingRaw);
  const sort = document.getElementById("filterSort")?.value || "recommended";
  const skills = document.getElementById("filterSkills")?.value?.trim();

  if (search) q.set("q", search);
  if (domain) q.set("domain", domain);
  const hasMin = Number.isFinite(minP) && minP >= 0;
  const hasMax = Number.isFinite(maxP) && maxP >= 0;
  if (hasMin && hasMax && minP > maxP) {
    q.set("minPrice", String(maxP));
    q.set("maxPrice", String(minP));
  } else {
    if (hasMin) q.set("minPrice", String(minP));
    if (hasMax) q.set("maxPrice", String(maxP));
  }
  if (Number.isFinite(minR) && minR >= 0 && minR <= 5) q.set("minRating", String(minR));
  if (sort) q.set("sort", sort);
  if (skills) q.set("skills", skills);
  return q.toString();
}

function scheduleMentorReload() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => loadMentors(), 320);
}

function renderNetwork(users) {
  const grid = document.getElementById("networkGrid");
  const empty = document.getElementById("networkEmpty");
  if (!grid) return;
  grid.innerHTML = "";
  const q = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  let filtered = users;
  const chip = document.querySelector(".chip.active")?.dataset.filter || "all";
  if (chip !== "all") filtered = filtered.filter((u) => u.role === chip);
  if (q) {
    filtered = filtered.filter((u) => {
      const blob = [u.name, u.role, u.bio, ...(u.skills || [])].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }
  if (!filtered.length) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  filtered.forEach((user, i) => {
    grid.appendChild(buildNetworkCard(user, i));
  });
}

function buildNetworkCard(user, index) {
  const card = document.createElement("div");
  card.className = "mentor-card";
  card.style.animationDelay = `${index * 0.04}s`;
  const initials = (user.name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avatarContent = user.profilePic ? `<img src="${escapeHtml(user.profilePic)}" alt="" />` : initials;
  const skillsHtml =
    (user.skills || []).slice(0, 4).map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("") ||
    "<span class='skill-tag'>-</span>";
  const chat = user.firebaseUID
    ? `<a class="connect-btn" href="chat.html?with=${encodeURIComponent(user.firebaseUID)}">Chat</a>`
    : "";
  card.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">${avatarContent}</div>
      <div class="card-info">
        <div class="card-name">${escapeHtml(user.name)}</div>
        <span class="card-role ${user.role}">${escapeHtml(user.role)}</span>
      </div>
    </div>
    <p class="card-bio">${escapeHtml((user.bio || "No bio yet.").slice(0, 140))}</p>
    ${user.role === "mentor" ? `<div class="mentor-signal-row compact"><span class="status-chip ${escapeHtml(user.availabilityStatus || "open")}"><i></i>${escapeHtml(availabilityLabel(user.availabilityStatus))}</span><span>${escapeHtml(user.responseRate || 96)}% response</span></div>` : ""}
    <div class="card-skills">${skillsHtml}</div>
    <div class="card-actions">
      ${chat}
    </div>`;
  return card;
}

async function handleLogout() {
  try {
    if (dashboardSocket) dashboardSocket.disconnect();
    if (typeof clearAuthStorage === "function") clearAuthStorage();
    else if (typeof clearMcSession === "function") clearMcSession();
    await auth.signOut();
    window.location.href = "login.html";
  } catch (err) {
    showToast("Logout failed: " + err.message, "error");
  }
}

function openBookingModal(mentorUid) {
  const m = mentorList.find((x) => x.firebaseUID === mentorUid);
  currentMentorForBooking = m;
  const modal = document.getElementById("bookingModal");
  if (!modal || !m) return;
  document.getElementById("bmMentorName").textContent = m.name;
  document.getElementById("bmPrice").textContent = `${m.currency || "INR"} ${m.pricePerSession || 0}`;
  const slotsWrap = document.getElementById("bmSlots");
  const slots = (m.bookableSlots || []).map((d) => new Date(d)).filter((d) => d > new Date());
  slots.sort((a, b) => a - b);
  if (!slots.length) {
    slotsWrap.innerHTML =
      '<p class="slot-hint">Mentor has not published specific slots. Pick a start time (60 min session) below.</p>';
  } else {
    slotsWrap.innerHTML = slots
      .slice(0, 24)
      .map(
        (d) =>
          `<button type="button" class="slot-chip" data-start="${escapeHtml(toDatetimeLocalValue(d))}">${escapeHtml(d.toLocaleString())}</button>`
      )
      .join("");
    slotsWrap.querySelectorAll(".slot-chip").forEach((b) => {
      b.addEventListener("click", () => {
        slotsWrap.querySelectorAll(".slot-chip").forEach((x) => x.classList.remove("picked"));
        b.classList.add("picked");
        document.getElementById("bmStart").value = b.getAttribute("data-start");
      });
    });
  }
  const startInput = document.getElementById("bmStart");
  if (startInput) {
    startInput.value = "";
    startInput.min = toDatetimeLocalValue(new Date(Date.now() + 30 * 60 * 1000));
  }
  const topicInput = document.getElementById("bmTopic");
  if (topicInput) topicInput.value = "";
  const goalsInput = document.getElementById("bmGoals");
  if (goalsInput) goalsInput.value = "";
  modal.classList.add("open");
}

function closeBookingModal() {
  document.getElementById("bookingModal")?.classList.remove("open");
}

async function submitBooking() {
  if (!currentMentorForBooking || bookingSubmitting) return;
  const startVal = document.getElementById("bmStart").value;
  if (!startVal) {
    showToast("Choose a start time", "error");
    return;
  }
  const startDate = new Date(startVal);
  if (Number.isNaN(startDate.getTime()) || startDate <= new Date()) {
    showToast("Choose a valid future start time", "error");
    return;
  }
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const topic = document.getElementById("bmTopic").value.trim();
  const sessionGoals = String(document.getElementById("bmGoals")?.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const submitBtn = document.getElementById("bmSubmit");
  bookingSubmitting = true;
  setButtonBusy(submitBtn, true, "Requesting...");
  try {
    const res = await mcPost("/api/bookings/", {
      mentorFirebaseUID: currentMentorForBooking.firebaseUID,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      topic,
      sessionGoals,
    });
    
    if (!res.ok) {
      throw new Error(res.error || "Booking failed");
    }
    
    showToast("Booking requested! Check Sessions.");
    closeBookingModal();
    loadMentors();
    loadDashboardActivity();
    loadNotificationsBadge();
  } catch (err) {
    console.error("[DASHBOARD] Booking error:", err);
    showToast(err.message || "Booking failed", "error");
  } finally {
    bookingSubmitting = false;
    setButtonBusy(submitBtn, false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initAuthGuard();

  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("searchInput")?.addEventListener("input", () => renderNetwork(allUsers));
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderNetwork(allUsers);
    });
  });

  ["mentorSearch", "filterDomain", "filterMinPrice", "filterMaxPrice", "filterMinRating", "filterSort", "filterSkills"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", scheduleMentorReload);
    el.addEventListener("change", () => loadMentors());
  });
  document.getElementById("clearMentorFilters")?.addEventListener("click", () => {
    ["mentorSearch", "filterDomain", "filterMinPrice", "filterMaxPrice", "filterMinRating", "filterSkills"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const sort = document.getElementById("filterSort");
    if (sort) sort.value = "recommended";
    loadMentors();
  });

  document.getElementById("notifBell")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNotifDropdown();
  });
  document.getElementById("markAllNotifBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    markAllNotificationsRead();
  });
  document.getElementById("clearAllNotifBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearAllNotifications();
  });
  document.getElementById("notifPrefsBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("notifPrefs")?.classList.toggle("open");
    bindNotificationPrefs();
  });
  if (!window.__mcNotifRecover) {
    window.__mcNotifRecover = true;
    window.addEventListener("mc:session", () => loadNotificationsBadge());
    window.addEventListener("focus", () => loadNotificationsBadge());
  }

  document.getElementById("themeToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("theme-light");
    localStorage.setItem("mc_theme", document.body.classList.contains("theme-light") ? "light" : "dark");
  });

  document.getElementById("bmClose")?.addEventListener("click", closeBookingModal);
  document.getElementById("bmCancel")?.addEventListener("click", closeBookingModal);
  document.getElementById("bmSubmit")?.addEventListener("click", submitBooking);

  const hamburger = document.getElementById("hamburger");
  const sidebar = document.getElementById("sidebar");
  hamburger?.addEventListener("click", () => sidebar?.classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 900 && !sidebar?.contains(e.target) && !hamburger?.contains(e.target)) {
      sidebar?.classList.remove("open");
    }
  });
});
