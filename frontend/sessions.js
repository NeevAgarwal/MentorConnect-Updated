let allBookings = [];
let tab = "upcoming";

function toast(msg, err) {
  const t = document.createElement("div");
  t.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;background:"+(err?"rgba(248,113,113,0.2)":"rgba(212,175,55,0.15)");color:"+(err?"#F87171":"#D4AF37");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

async function loadBookings() {
  try {
    const res = await mcGet("/api/bookings/mine");
    if (!res.ok) {
      toast("Could not load bookings", true);
      return;
    }
    allBookings = res.data.bookings || [];
    render();
  } catch (err) {
    console.error("[SESSIONS] Error loading bookings:", err);
    toast("Error loading bookings", true);
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

function render() {
  const list = document.getElementById("sessionsList");
  const empty = document.getElementById("sessionsEmpty");
  const rows = filterBookings().sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
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
      const other = isMentor ? b.studentFirebaseUID : b.mentorFirebaseUID;
      const start = new Date(b.startTime).toLocaleString();
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
            <strong>${isMentor ? "Student" : "Mentor"} ID:</strong> ${esc(other)}<br/>
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
  document.getElementById("sidebarName").textContent = state.profile?.name || localStorage.getItem("mc_name") || "User";
  document.getElementById("sidebarRole").textContent = state.profile?.role || localStorage.getItem("mc_role") || "student";
  document.getElementById("sidebarAvatar").textContent = (state.profile?.name || localStorage.getItem("mc_name") || "U").charAt(0).toUpperCase();
  loadBookings();

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
