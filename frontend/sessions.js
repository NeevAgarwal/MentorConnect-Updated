let allBookings = [];
let tab = "upcoming";
let sessionSocket = null;
let sessionSocketRefreshing = false;
let pendingActionId = null;
let rescheduleBookingId = null;

function toast(msg, err) {
  const t = document.createElement("div");
  t.style.cssText =
    "position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;background:" +
    (err ? "rgba(248,113,113,0.2)" : "rgba(212,175,55,0.15)") +
    ";color:" +
    (err ? "#F87171" : "#D4AF37");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function currentJwt() {
  return localStorage.getItem("mc_jwt") || "";
}

function toDatetimeLocalValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function compactDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Invalid date";
  return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function setButtonBusy(btn, busy, label) {
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || "";
  btn.disabled = !!busy;
  btn.textContent = busy ? label || "Working..." : btn.dataset.originalText;
}

async function refreshSessionSocketJwt() {
  if (!sessionSocket || sessionSocketRefreshing) return;
  sessionSocketRefreshing = true;
  try {
    const token = await syncMcJwt();
    if (token) {
      sessionSocket.auth = { ...(sessionSocket.auth || {}), token };
      sessionSocket.disconnect();
      sessionSocket.connect();
    }
  } finally {
    sessionSocketRefreshing = false;
  }
}

function connectSessionsRealtime() {
  if (sessionSocket || typeof io === "undefined") return;
  const token = currentJwt();
  if (!token) return;
  sessionSocket = io(window.MC_API || "http://localhost:5000", {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
  });
  sessionSocket.on("connect_error", (err) => {
    if (/unauthorized|invalid|expired/i.test(err?.message || "")) refreshSessionSocketJwt();
  });
  sessionSocket.io.on("reconnect_attempt", () => {
    const token = currentJwt();
    if (token) sessionSocket.auth = { ...(sessionSocket.auth || {}), token };
  });
  sessionSocket.on("notification:new", (payload) => {
    const type = payload?.notification?.type || "";
    if (["booking", "mentor_decision", "reminder"].includes(type)) loadBookings();
  });
  window.addEventListener("mc:session", () => {
    const token = currentJwt();
    if (!token || !sessionSocket) return;
    sessionSocket.auth = { ...(sessionSocket.auth || {}), token };
    if (!sessionSocket.connected) sessionSocket.connect();
  });
}

function renderLoading() {
  const list = document.getElementById("sessionsList");
  const empty = document.getElementById("sessionsEmpty");
  if (empty) empty.classList.add("hidden");
  if (!list) return;
  list.innerHTML = Array(3)
    .fill(0)
    .map(() => '<div class="session-card glass-panel"><div class="card-skeleton" style="height:110px"></div></div>')
    .join("");
}

async function loadBookings() {
  try {
    renderLoading();
    const res = await mcGet("/api/bookings/mine");
    if (!res.ok) {
      toast("Could not load bookings", true);
      allBookings = [];
      render();
      return;
    }
    allBookings = res.data.bookings || [];
    render();
  } catch (err) {
    console.error("[SESSIONS] Error loading bookings:", err);
    toast("Error loading bookings", true);
    allBookings = [];
    render();
  }
}

function filterBookings() {
  const uid = auth.currentUser?.uid;
  const now = new Date();
  return allBookings.filter((b) => {
    const start = new Date(b.startTime);
    const future = start >= now;
    if (tab === "pending") return b.status === "pending";
    if (tab === "past") return b.status === "completed" || (!future && b.status === "confirmed");
    if (tab === "cancelled") return b.status === "cancelled" || b.status === "rejected";
    return future && ["confirmed", "pending"].includes(b.status);
  });
}

function participantLabel(booking, isMentor) {
  const person = isMentor ? booking.student : booking.mentor;
  const fallback = isMentor ? booking.studentFirebaseUID : booking.mentorFirebaseUID;
  const role = isMentor ? "Student" : "Mentor";
  return { role, name: person?.name || fallback || "User", uid: fallback || "" };
}

function render() {
  const list = document.getElementById("sessionsList");
  const empty = document.getElementById("sessionsEmpty");
  if (!list || !empty) return;
  const rows = filterBookings().sort((a, b) => {
    const diff = new Date(a.startTime) - new Date(b.startTime);
    return tab === "upcoming" || tab === "pending" ? diff : -diff;
  });
  if (!rows.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  const uid = auth.currentUser?.uid;
  list.innerHTML = rows
    .map((b) => {
      const isMentor = b.mentorFirebaseUID === uid;
      const otherInfo = participantLabel(b, isMentor);
      const other = otherInfo.uid;
      const start = compactDate(b.startTime);
      const endDate = new Date(b.endTime);
      const end = Number.isNaN(endDate.getTime()) ? "" : endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const link = b.meetingLink && b.status === "confirmed"
        ? `<a class="connect-btn" href="${esc(b.meetingLink)}" target="_blank" rel="noopener">Join video</a>`
        : "";
      let actions = "";
      const reviewBtn =
        !isMentor && b.status === "completed"
          ? `<button type="button" class="connect-btn outline" data-review data-mid="${esc(b.mentorFirebaseUID)}" data-bid="${esc(
              String(b._id)
            )}">Review mentor</button>`
          : "";
      if (b.status === "pending" && isMentor) {
        actions += `<button class="connect-btn" data-act="confirm" data-id="${b._id}">Accept</button>`;
        actions += `<button class="connect-btn outline" data-act="reject" data-id="${b._id}">Reject</button>`;
      }
      if (["pending", "confirmed"].includes(b.status)) {
        actions += `<button class="connect-btn outline" data-act="cancel" data-id="${b._id}">Cancel</button>`;
      }
      if (b.status === "confirmed") {
        actions += `<button class="connect-btn outline" data-act="complete" data-id="${b._id}">Mark complete</button>`;
        if (isMentor) actions += `<button class="connect-btn outline" data-act="resched" data-id="${b._id}">Reschedule</button>`;
      }
      actions += `<a class="connect-btn outline" href="chat.html?with=${encodeURIComponent(other)}">Chat</a>`;
      actions += reviewBtn;
      return `
        <div class="session-card glass-panel">
          <div class="session-top">
            <span class="session-status ${b.status}">${b.status}</span>
            <span class="session-time">${esc(start)}</span>
          </div>
          <div class="session-body">
            <strong>${esc(otherInfo.role)}:</strong> ${esc(otherInfo.name)}<br/>
            <span>${esc(start)}${end ? ` - ${esc(end)}` : ""}</span><br/>
            ${b.topic ? `<span>Topic: ${esc(b.topic)}</span>` : ""}
          </div>
          <div class="session-actions">${link}${actions}</div>
        </div>`;
    })
    .join("");

  list.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => onAction(btn.getAttribute("data-act"), btn.getAttribute("data-id"), btn));
  });
  list.querySelectorAll("button[data-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const mid = btn.getAttribute("data-mid");
        const bid = btn.getAttribute("data-bid");
        const rating = parseInt(prompt("Rating 1-5", "5"), 10);
        if (!(rating >= 1 && rating <= 5)) return;
        const comment = prompt("Review (optional)", "") || "";
        
        const res = await mcPost("/api/reviews/", {
          mentorFirebaseUID: mid,
          rating,
          comment,
          bookingId: bid,
        });
        
        if (res.ok) {
          toast("Thanks for your review!");
        } else {
          toast(res.error || "Failed", true);
        }
        loadBookings();
      } catch (err) {
        console.error("[SESSIONS] Review error:", err);
        toast("Error submitting review", true);
      }
    });
  });
}

async function onAction(act, id, btn) {
  if (act === "resched") {
    openRescheduleModal(id);
    return;
  }
  if (pendingActionId) return;
  pendingActionId = id;
  setButtonBusy(btn, true, "Updating...");
  try {
    let res;
    const label = { confirm: "accept this booking", reject: "reject this booking", cancel: "cancel this booking", complete: "mark this session complete" }[act];
    if (label && !confirm(`Are you sure you want to ${label}?`)) return;
    
    if (act === "confirm") {
      res = await mcPatch(`/api/bookings/${id}/status`, { status: "confirmed" });
    } else if (act === "reject") {
      res = await mcPatch(`/api/bookings/${id}/status`, { status: "rejected" });
    } else if (act === "cancel") {
      res = await mcPatch(`/api/bookings/${id}/status`, { status: "cancelled" });
    } else if (act === "complete") {
      res = await mcPatch(`/api/bookings/${id}/status`, { status: "completed" });
    }

    if (!res?.ok) {
      throw new Error(res?.error || "Action failed");
    }

    toast("Updated");
    loadBookings();
  } catch (err) {
    console.error("[SESSIONS] Action error:", err);
    toast(err.message || "Error", true);
  } finally {
    pendingActionId = null;
    setButtonBusy(btn, false);
  }
}

function openRescheduleModal(id) {
  rescheduleBookingId = id;
  const modal = document.getElementById("rescheduleModal");
  const input = document.getElementById("reschedStart");
  if (input) {
    input.min = toDatetimeLocalValue(new Date(Date.now() + 30 * 60 * 1000));
    input.value = "";
  }
  modal?.classList.add("open");
}

function closeRescheduleModal() {
  rescheduleBookingId = null;
  document.getElementById("rescheduleModal")?.classList.remove("open");
}

async function submitReschedule() {
  if (!rescheduleBookingId) return;
  const btn = document.getElementById("reschedSubmit");
  const value = document.getElementById("reschedStart")?.value;
  const start = new Date(value);
  if (!value || Number.isNaN(start.getTime()) || start <= new Date()) {
    toast("Choose a valid future start time", true);
    return;
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  setButtonBusy(btn, true, "Saving...");
  try {
    const res = await mcPatch(`/api/bookings/${rescheduleBookingId}/reschedule`, {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    if (!res.ok) throw new Error(res.error || "Reschedule failed");
    toast("Session rescheduled");
    closeRescheduleModal();
    loadBookings();
  } catch (err) {
    console.error("[SESSIONS] Reschedule error:", err);
    toast(err.message || "Reschedule failed", true);
  } finally {
    setButtonBusy(btn, false);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthState();
  const state = getAuthState();
  if (!state.firebaseUser) return;
  const profile = state.mcUser || {};
  document.getElementById("sidebarName").textContent = profile.name || localStorage.getItem("mc_name") || "User";
  document.getElementById("sidebarRole").textContent = profile.role || localStorage.getItem("mc_role") || "student";
  document.getElementById("sidebarAvatar").textContent = (profile.name || localStorage.getItem("mc_name") || "U").charAt(0).toUpperCase();
  const analyticsLink = document.getElementById("analyticsNavItem");
  const role = profile.role || localStorage.getItem("mc_role") || "student";
  if (analyticsLink) analyticsLink.style.display = role === "mentor" ? "flex" : "none";
  loadBookings();
  connectSessionsRealtime();

  document.querySelectorAll(".tab-pill").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".tab-pill").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      tab = b.getAttribute("data-tab");
      render();
    });
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    if (sessionSocket) sessionSocket.disconnect();
    if (typeof clearAuthStorage === "function") clearAuthStorage();
    else if (typeof clearMcSession === "function") clearMcSession();
    await auth.signOut();
    location.href = "login.html";
  });
  document.getElementById("hamburger")?.addEventListener("click", () => {
    document.getElementById("sidebar")?.classList.toggle("open");
  });
  document.getElementById("reschedClose")?.addEventListener("click", closeRescheduleModal);
  document.getElementById("reschedCancel")?.addEventListener("click", closeRescheduleModal);
  document.getElementById("reschedSubmit")?.addEventListener("click", submitReschedule);
  document.getElementById("rescheduleModal")?.addEventListener("click", (e) => {
    if (e.target.id === "rescheduleModal") closeRescheduleModal();
  });
});
