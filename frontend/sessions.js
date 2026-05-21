let allBookings = [];
let tab = "upcoming";
let sessionSocket = null;
let sessionSocketRefreshing = false;

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
    if (tab === "pending") return b.status === "pending";
    if (tab === "past") return b.status === "completed";
    if (tab === "cancelled") return b.status === "cancelled" || b.status === "rejected";
    const future = new Date(b.startTime) >= now;
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
  const uid = auth.currentUser.uid;
  list.innerHTML = rows
    .map((b) => {
      const isMentor = b.mentorFirebaseUID === uid;
      const otherInfo = participantLabel(b, isMentor);
      const other = otherInfo.uid;
      const start = new Date(b.startTime).toLocaleString();
      const end = new Date(b.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const link = b.meetingLink
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
      if (b.status === "confirmed" && isMentor) {
        actions += `<button class="connect-btn outline" data-act="complete" data-id="${b._id}">Mark complete</button>`;
        actions += `<button class="connect-btn outline" data-act="resched" data-id="${b._id}">Reschedule</button>`;
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
            <span>${esc(start)} - ${esc(end)}</span><br/>
            ${b.topic ? `<span>Topic: ${esc(b.topic)}</span>` : ""}
          </div>
          <div class="session-actions">${link}${actions}</div>
        </div>`;
    })
    .join("");

  list.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => onAction(btn.getAttribute("data-act"), btn.getAttribute("data-id")));
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

async function onAction(act, id) {
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
    } else if (act === "resched") {
      const iso = prompt("New start time (ISO 8601), e.g. 2026-05-20T15:00:00");
      if (!iso) return;
      const start = new Date(iso);
      if (Number.isNaN(start.getTime()) || start <= new Date()) {
        throw new Error("Enter a valid future start time");
      }
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      res = await mcPatch(`/api/bookings/${id}/reschedule`, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
    }

    if (!res?.ok) {
      throw new Error(res?.error || "Action failed");
    }

    toast("Updated");
    loadBookings();
  } catch (err) {
    console.error("[SESSIONS] Action error:", err);
    toast(err.message || "Error", true);
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

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    localStorage.removeItem("mc_jwt");
    await auth.signOut();
    location.href = "login.html";
  });
  document.getElementById("hamburger").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
});
