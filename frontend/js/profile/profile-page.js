import { getState } from "../state/store.js";
import { getAuth } from "../auth/auth-state.esm.js";
import { apiJson } from "../api/client.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/sanitize.js";

let currentUID = null;
let currentUser = null;
let skills = [];
let expertiseTags = [];
let interests = [];
let goals = [];
let bookableSlots = [];
let selectedRole = "student";

export function setRole(role) {
  selectedRole = role;
  document.getElementById("roleStudent")?.classList.toggle("active", role === "student");
  document.getElementById("roleMentor")?.classList.toggle("active", role === "mentor");
  const previewRole = document.getElementById("previewRole");
  if (previewRole) {
    previewRole.textContent = role;
    previewRole.className = `card-role ${role}`;
  }
  const ms = document.getElementById("mentorSlots");
  if (ms) ms.style.display = role === "mentor" ? "block" : "none";
  const me = document.getElementById("mentorExtras");
  if (me) me.style.opacity = role === "mentor" ? "1" : "0.65";
}

window.setRole = setRole;

function tagRenderer(containerId, list, onRemove) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = list
    .map(
      (s, i) =>
        `<span class="skill-pill">${escapeHtml(s)}<button type="button" data-i="${i}" aria-label="Remove">×</button></span>`
    )
    .join("");
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => onRemove(Number(btn.getAttribute("data-i"))));
  });
}

function renderSkillPills() {
  tagRenderer("skillsTags", skills, (i) => {
    skills.splice(i, 1);
    renderSkillPills();
  });
  const previewSkills = document.getElementById("previewSkills");
  if (previewSkills) {
    previewSkills.innerHTML = skills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("");
  }
}

function renderExp() {
  tagRenderer("expTags", expertiseTags, (i) => {
    expertiseTags.splice(i, 1);
    renderExp();
  });
}
function renderInterest() {
  tagRenderer("interestTags", interests, (i) => {
    interests.splice(i, 1);
    renderInterest();
  });
}
function renderGoals() {
  tagRenderer("goalTags", goals, (i) => {
    goals.splice(i, 1);
    renderGoals();
  });
}

function addTo(list, raw, max, renderFn) {
  const s = raw.trim().replace(/,$/, "").trim();
  if (s && !list.includes(s) && list.length < max) {
    list.push(s);
    renderFn();
  }
}

function renderSlots() {
  const ul = document.getElementById("slotList");
  if (!ul) return;
  ul.innerHTML = bookableSlots
    .map((iso, i) => {
      const d = new Date(iso);
      return `<li><span>${escapeHtml(d.toLocaleString())}</span><button type="button" data-si="${i}">Remove</button></li>`;
    })
    .join("");
  ul.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      bookableSlots.splice(Number(b.getAttribute("data-si")), 1);
      renderSlots();
    });
  });
}

function updatePreview() {
  const bio = document.getElementById("bioInput")?.value || "";
  const pic = document.getElementById("profilePicInput")?.value || "";
  document.getElementById("previewBio").textContent = bio || "Your bio will appear here…";
  const avatar = document.getElementById("previewAvatar");
  const initial = currentUser?.name?.charAt(0)?.toUpperCase() || "?";
  if (pic) {
    const img = document.createElement("img");
    img.src = pic;
    img.alt = "";
    img.addEventListener("error", () => {
      avatar.textContent = initial;
    });
    avatar.textContent = "";
    avatar.appendChild(img);
  } else {
    avatar.textContent = initial;
  }
}

async function loadProfile(uid) {
  try {
    const data = await apiJson("/api/users/" + uid);
    if (!data.success) return;
    currentUser = data.user;

    document.getElementById("sidebarName").textContent = currentUser.name;
    document.getElementById("sidebarRole").textContent = currentUser.role;
    document.getElementById("sidebarAvatar").textContent = currentUser.name?.charAt(0).toUpperCase();

    document.getElementById("previewName").textContent = currentUser.name;
    document.getElementById("previewBio").textContent = currentUser.bio || "No bio yet.";
    const previewAvatar = document.getElementById("previewAvatar");
    if (currentUser.profilePic) {
      previewAvatar.innerHTML = `<img src="${escapeHtml(currentUser.profilePic)}" alt="" />`;
    } else {
      previewAvatar.textContent = currentUser.name?.charAt(0).toUpperCase();
    }

    setRole(currentUser.role || "student");

    const bioInput = document.getElementById("bioInput");
    if (bioInput) {
      bioInput.value = currentUser.bio || "";
      document.getElementById("bioCount").textContent = String(bioInput.value.length);
    }

    document.getElementById("linkedinInput").value = currentUser.linkedin || "";
    document.getElementById("experienceInput").value = currentUser.experience || "";
    document.getElementById("profilePicInput").value = currentUser.profilePic || "";
    document.getElementById("githubInput").value = currentUser.github || "";
    document.getElementById("companyInput").value = currentUser.company || "";
    document.getElementById("domainInput").value = currentUser.domain || "";
    document.getElementById("priceInput").value = currentUser.pricePerSession ?? 0;
    document.getElementById("currencyInput").value = currentUser.currency || "INR";
    document.getElementById("resumeUrlInput").value = currentUser.resumeUrl || "";

    skills = [...(currentUser.skills || [])];
    expertiseTags = [...(currentUser.expertiseTags || [])];
    interests = [...(currentUser.interests || [])];
    goals = [...(currentUser.goals || [])];
    bookableSlots = (currentUser.bookableSlots || []).map((d) => new Date(d).toISOString());

    renderSkillPills();
    renderExp();
    renderInterest();
    renderGoals();
    renderSlots();

    const previewRole = document.getElementById("previewRole");
    if (previewRole) {
      previewRole.textContent = currentUser.role;
      previewRole.className = `card-role ${currentUser.role}`;
    }
  } catch (e) {
    showToast(e.message || "Could not load profile", "error");
  }
}

async function saveProfile() {
  if (!currentUID) return;
  document.getElementById("saveBtnText").style.display = "none";
  document.getElementById("saveSpinner").classList.remove("hidden");

  const body = {
    bio: document.getElementById("bioInput")?.value.trim() || "",
    skills,
    expertiseTags,
    interests,
    goals,
    domain: document.getElementById("domainInput")?.value.trim() || "",
    linkedin: document.getElementById("linkedinInput")?.value.trim() || "",
    github: document.getElementById("githubInput")?.value.trim() || "",
    company: document.getElementById("companyInput")?.value.trim() || "",
    experience: document.getElementById("experienceInput")?.value.trim() || "",
    profilePic: document.getElementById("profilePicInput")?.value.trim() || "",
    resumeUrl: document.getElementById("resumeUrlInput")?.value.trim() || "",
    pricePerSession: Number(document.getElementById("priceInput")?.value || 0),
    currency: document.getElementById("currencyInput")?.value.trim() || "INR",
    bookableSlots: bookableSlots.map((s) => new Date(s).toISOString()),
    role: selectedRole,
  };

  try {
    await apiJson("/api/users/" + currentUID, { method: "PUT", body });
    localStorage.setItem("mc_role", selectedRole);
    showToast("Profile saved!");
    await loadProfile(currentUID);
  } catch (e) {
    showToast(e.message || "Save failed", "error");
  } finally {
    document.getElementById("saveBtnText").style.display = "inline";
    document.getElementById("saveSpinner").classList.add("hidden");
  }
}

async function handleLogout() {
  const { clearStoredSession } = await import("../state/store.js");
  clearStoredSession();
  await getAuth().signOut();
  localStorage.clear();
  window.location.href = "login.html";
}

function bindTagInput(inputId, list, max, renderFn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTo(list, el.value, max, renderFn);
      el.value = "";
    }
  });
  el.addEventListener("blur", () => {
    if (el.value.trim()) {
      addTo(list, el.value, max, renderFn);
      el.value = "";
    }
  });
}

export function initProfilePage() {
  const user = getAuth().currentUser;
  if (!user) return;
  currentUID = user.uid;
  loadProfile(user.uid);

  document.getElementById("bioInput")?.addEventListener("input", function () {
    document.getElementById("bioCount").textContent = String(this.value.length);
    document.getElementById("previewBio").textContent = this.value || "Your bio will appear here…";
  });

  bindTagInput("skillInput", skills, 12, renderSkillPills);
  bindTagInput("expInput", expertiseTags, 15, renderExp);
  bindTagInput("interestInput", interests, 15, renderInterest);
  bindTagInput("goalInput", goals, 15, renderGoals);

  document.getElementById("profilePicInput")?.addEventListener("input", updatePreview);

  document.getElementById("addSlotBtn")?.addEventListener("click", () => {
    const v = document.getElementById("slotPicker").value;
    if (!v) return;
    const iso = new Date(v).toISOString();
    if (!bookableSlots.includes(iso)) bookableSlots.push(iso);
    bookableSlots.sort();
    renderSlots();
  });

  document.getElementById("picFile")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { apiFetch } = await import("../api/client.js");
      const res = await apiFetch("/api/upload/profile-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const base = window.MC_API || "";
      document.getElementById("profilePicInput").value = base + data.url;
      updatePreview();
      showToast("Image uploaded");
    } catch (err) {
      showToast(err.message, "error");
    }
    e.target.value = "";
  });

  document.getElementById("resumeFile")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { apiFetch } = await import("../api/client.js");
      const res = await apiFetch("/api/upload/document", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const base = window.MC_API || "";
      document.getElementById("resumeUrlInput").value = base + data.url;
      showToast("Document uploaded");
    } catch (err) {
      showToast(err.message, "error");
    }
    e.target.value = "";
  });

  document.getElementById("saveBtn")?.addEventListener("click", saveProfile);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("hamburger")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
}
