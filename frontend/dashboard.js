// ─────────────────────────────────────────────────────────────
// MentorConnect — dashboard.js (marketplace + network + booking)
// ─────────────────────────────────────────────────────────────

let allUsers = [];
let mentorList = [];
let debounceTimer = null;
let currentMentorForBooking = null;

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
  list.innerHTML = '<div class="notif-loading">Loading…</div>';
  try {
    const res = await mcGet("/api/notifications/mine");
    if (!res.ok || !res.data.notifications || res.data.notifications.length === 0) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = res.data.notifications
      .slice(0, 20)
      .map(
        (n) => `
      <div class="notif-item ${n.read ? "" : "unread"}" data-id="${n._id}">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-body">${escapeHtml(n.body)}</div>
        <div class="notif-time">${new Date(n.createdAt).toLocaleString()}</div>
      </div>
    `
      )
      .join("");
    list.querySelectorAll(".notif-item").forEach((el) => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        await mcPatch(`/api/notifications/${id}/read`, {});
        el.classList.remove("unread");
        loadNotificationsBadge();
      });
    });
  } catch (err) {
    console.error("[DASHBOARD] Error loading notifications:", err);
    list.innerHTML = '<div class="notif-empty">Could not load</div>';
  }
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

  const name = state.profile?.name || localStorage.getItem("mc_name") || state.firebaseUser.displayName || "User";
  const role = state.profile?.role || localStorage.getItem("mc_role") || "student";

  document.getElementById("sidebarName").textContent = name;
  document.getElementById("sidebarRole").textContent = role;
  const av = document.getElementById("sidebarAvatar");
  if (av) av.textContent = name.charAt(0).toUpperCase();

  const adminLink = document.getElementById("adminNavItem");
  if (adminLink) {
    adminLink.style.display = state.profile?.isAdmin || localStorage.getItem("mc_admin") === "1" ? "flex" : "none";
  }

  loadUsers();
  loadMentors();
  loadNotificationsBadge();

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
  } catch (err) {
    console.error("[DASHBOARD] Error loading users:", err);
    showToast("Could not load directory", "error");
    renderNetwork([]);
  }
}

async function loadMentors() {
  const grid = document.getElementById("mentorsMarketGrid");
  const empty = document.getElementById("mentorsMarketEmpty");
  if (!grid) return;
  
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
    
    mentorList = res.data.mentors || [];
    if (!mentorList.length) {
      grid.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
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
          '<span class="skill-tag">—</span>';
        const bookBtn =
          myUid && myUid !== m.firebaseUID && (localStorage.getItem("mc_role") || "") === "student"
            ? `<button type="button" class="connect-btn book-open" data-uid="${escapeHtml(m.firebaseUID)}">Book</button>`
            : `<a href="chat.html?with=${encodeURIComponent(m.firebaseUID)}" class="connect-btn">Message</a>`;
        return `
        <div class="mentor-card market-card" data-uid="${escapeHtml(m.firebaseUID)}">
          <div class="card-header">
            <div class="card-avatar">${pic}</div>
            <div class="card-info">
              <div class="card-name">${escapeHtml(m.name || "Unknown")}</div>
              <span class="badge-domain">${escapeHtml(m.domain || "General")}</span>
              <div class="card-meta">${escapeHtml(m.company || "")}</div>
            </div>
          </div>
          <div class="match-row"><span class="match-label">Match</span><span class="match-score">${m.matchScore ?? "—"}</span></div>
          <div class="rating-row">
            <span class="stars">★ ${(m.ratingAvg || 0).toFixed(1)}</span>
            <span class="sessions-count">${m.totalSessions || 0} sessions</span>
            <span class="price-tag">${escapeHtml(m.currency || "INR")} ${m.pricePerSession || 0}<small>/session</small></span>
          </div>
          <p class="card-bio">${escapeHtml((m.bio || "").slice(0, 160))}${(m.bio || "").length > 160 ? "…" : ""}</p>
          <div class="card-skills">${skills}</div>
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
  } catch (err) {
    console.error("[DASHBOARD] Error loading mentors:", err);
    grid.innerHTML = "";
    showToast("Could not load mentors", "error");
  }
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
    "<span class='skill-tag'>—</span>";
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
    <div class="card-skills">${skillsHtml}</div>
    <div class="card-actions">
      ${chat}
    </div>`;
  return card;
}

async function handleLogout() {
  try {
    localStorage.removeItem("mc_jwt");
    localStorage.removeItem("mc_admin");
    await auth.signOut();
    localStorage.removeItem("mc_uid");
    localStorage.removeItem("mc_name");
    localStorage.removeItem("mc_email");
    localStorage.removeItem("mc_role");
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
          `<button type="button" class="slot-chip" data-start="${d.toISOString()}">${d.toLocaleString()}</button>`
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
  document.getElementById("bmStart").value = "";
  document.getElementById("bmTopic").value = "";
  modal.classList.add("open");
}

function closeBookingModal() {
  document.getElementById("bookingModal")?.classList.remove("open");
}

async function submitBooking() {
  if (!currentMentorForBooking) return;
  const startVal = document.getElementById("bmStart").value;
  if (!startVal) {
    showToast("Choose a start time", "error");
    return;
  }
  const startDate = new Date(startVal);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const topic = document.getElementById("bmTopic").value.trim();
  try {
    const res = await mcPost("/api/bookings/", {
      mentorFirebaseUID: currentMentorForBooking.firebaseUID,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      topic,
    });
    
    if (!res.ok) {
      throw new Error(res.error || "Booking failed");
    }
    
    showToast("Booking requested! Check Sessions.");
    closeBookingModal();
    loadMentors();
    loadNotificationsBadge();
  } catch (err) {
    console.error("[DASHBOARD] Booking error:", err);
    showToast(err.message || "Booking failed", "error");
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

  document.getElementById("notifBell")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNotifDropdown();
  });

  // Close notification dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".notif-bell-wrap")) {
      document.getElementById("notifDropdown")?.classList.remove("open");
    }
  });

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
    if (window.innerWidth <= 900 && !sidebar?.contains(e.target) && e.target !== hamburger) {
      sidebar?.classList.remove("open");
    }
  });
});
