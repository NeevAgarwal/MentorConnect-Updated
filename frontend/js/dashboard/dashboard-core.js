import { apiJson } from "../api/client.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/sanitize.js";
import { getState, subscribe, clearStoredSession } from "../state/store.js";
import { getAuth } from "../auth/auth-state.esm.js";
import { loadMentors, wireMentorFilters } from "./mentor-marketplace.js";
import { refreshNotificationBadge, initNotifications } from "./notifications.js";
import { initBookingModal } from "./booking.js";
import { debounce } from "./filters.js";

let allUsers = [];

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
        <span class="card-role ${escapeHtml(user.role)}">${escapeHtml(user.role)}</span>
      </div>
    </div>
    <p class="card-bio">${escapeHtml((user.bio || "No bio yet.").slice(0, 140))}</p>
    <div class="card-skills">${skillsHtml}</div>
    <div class="card-actions">${chat}</div>`;
  return card;
}

async function loadUsers() {
  try {
    const data = await apiJson("/api/users/");
    allUsers = data.users || [];
    const mentors = allUsers.filter((u) => u.role === "mentor").length;
    const students = allUsers.filter((u) => u.role === "student").length;
    const totalEl = document.getElementById("statTotal");
    const mentorsEl = document.getElementById("statMentors");
    const studentsEl = document.getElementById("statStudents");
    if (totalEl) totalEl.textContent = String(allUsers.length);
    if (mentorsEl) mentorsEl.textContent = String(mentors);
    if (studentsEl) studentsEl.textContent = String(students);
    renderNetwork(allUsers);
  } catch (e) {
    showToast(e.message || "Could not load directory", "error");
    renderNetwork([]);
  }
}

function updateSidebarFromState() {
  const s = getState();
  const name = s.profile?.name || localStorage.getItem("mc_name") || s.firebaseUser?.displayName || "User";
  const role = s.profile?.role || localStorage.getItem("mc_role") || "student";
  const elName = document.getElementById("sidebarName");
  const elRole = document.getElementById("sidebarRole");
  const elAv = document.getElementById("sidebarAvatar");
  if (elName) elName.textContent = name;
  if (elRole) elRole.textContent = role;
  if (elAv) elAv.textContent = name.charAt(0).toUpperCase();

  const adminLink = document.getElementById("adminNavItem");
  if (adminLink) {
    adminLink.style.display = s.profile?.isAdmin ? "flex" : "none";
  }
}

async function handleLogout() {
  try {
    clearStoredSession();
    await getAuth().signOut();
    window.location.href = "login.html";
  } catch (e) {
    showToast(e.message || "Logout failed", "error");
  }
}

let _sidebarUnsub = null;

export function initDashboard() {
  if (_sidebarUnsub) {
    _sidebarUnsub();
    _sidebarUnsub = null;
  }
  _sidebarUnsub = subscribe(() => updateSidebarFromState());

  updateSidebarFromState();

  const scheduleMentors = debounce(() => loadMentors(), 320);
  wireMentorFilters(scheduleMentors);

  loadUsers();
  loadMentors();
  refreshNotificationBadge();
  initNotifications();
  initBookingModal(() => {
    loadMentors();
    refreshNotificationBadge();
  });

  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("searchInput")?.addEventListener("input", () => renderNetwork(allUsers));
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderNetwork(allUsers);
    });
  });

  document.getElementById("themeToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("theme-light");
    const light = document.body.classList.contains("theme-light");
    localStorage.setItem("mc_theme", light ? "light" : "dark");
  });

  const theme = localStorage.getItem("mc_theme");
  if (theme === "light") document.body.classList.add("theme-light");

  const hamburger = document.getElementById("hamburger");
  const sidebar = document.getElementById("sidebar");
  hamburger?.addEventListener("click", () => sidebar.classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 900 && sidebar && !sidebar.contains(e.target) && e.target !== hamburger) {
      sidebar.classList.remove("open");
    }
  });
}
