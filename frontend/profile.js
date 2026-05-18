let currentUID = null;
let currentUser = null;
let skills = [];
let expertiseTags = [];
let interests = [];
let goals = [];
let bookableSlots = [];
let selectedRole = "student";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function setRole(role) {
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
    avatar.innerHTML = `<img src="${escapeHtml(pic)}" alt="" onerror="this.parentNode.textContent='${initial}'"/>`;
  } else {
    avatar.textContent = initial;
  }
}

async function loadProfile(uid) {
  try {
    const res = await mcGet(`/api/users/${uid}`);
    if (!res.ok) {
      showToast("Could not load profile", "error");
      return;
    }

    currentUser = res.data.user;

    document.getElementById("sidebarName").textContent = currentUser?.name || "User";
    document.getElementById("sidebarRole").textContent = currentUser?.role || "student";
    document.getElementById("sidebarAvatar").textContent = (currentUser?.name || "U").charAt(0).toUpperCase();

    document.getElementById("previewName").textContent = currentUser?.name || "User";
    document.getElementById("previewBio").textContent = currentUser?.bio || "No bio yet.";
    const previewAvatar = document.getElementById("previewAvatar");
    if (currentUser?.profilePic) {
      previewAvatar.innerHTML = `<img src="${escapeHtml(currentUser.profilePic)}" alt="" />`;
    } else {
      previewAvatar.textContent = (currentUser?.name || "U").charAt(0).toUpperCase();
    }

    setRole(currentUser?.role || "student");

    const bioInput = document.getElementById("bioInput");
    if (bioInput) {
      bioInput.value = currentUser?.bio || "";
      document.getElementById("bioCount").textContent = String(bioInput.value.length);
    }

    document.getElementById("linkedinInput").value = currentUser?.linkedin || "";
    document.getElementById("experienceInput").value = currentUser?.experience || "";
    document.getElementById("profilePicInput").value = currentUser?.profilePic || "";
    document.getElementById("githubInput").value = currentUser?.github || "";
    document.getElementById("companyInput").value = currentUser?.company || "";
    document.getElementById("domainInput").value = currentUser?.domain || "";
    document.getElementById("priceInput").value = currentUser?.pricePerSession ?? 0;
    document.getElementById("currencyInput").value = currentUser?.currency || "INR";
    document.getElementById("resumeUrlInput").value = currentUser?.resumeUrl || "";

    skills = [...(currentUser?.skills || [])];
    expertiseTags = [...(currentUser?.expertiseTags || [])];
    interests = [...(currentUser?.interests || [])];
    goals = [...(currentUser?.goals || [])];
    bookableSlots = (currentUser?.bookableSlots || []).map((d) => new Date(d).toISOString());

    renderSkillPills();
    renderExp();
    renderInterest();
    renderGoals();
    renderSlots();

    const previewRole = document.getElementById("previewRole");
    if (previewRole) {
      previewRole.textContent = currentUser?.role || "student";
      previewRole.className = `card-role ${currentUser?.role || "student"}`;
    }
  } catch (err) {
    console.error("[PROFILE] Error loading profile:", err);
    showToast("Could not load profile", "error");
  }
}

async function saveProfile() {
  if (!currentUID) return;
  document.getElementById("saveBtnText").style.display = "none";
  document.getElementById("saveSpinner").classList.remove("hidden");

  const body = {
    bio: document.getElementById("bioInput")?.value?.trim() || "",
    skills,
    expertiseTags,
    interests,
    goals,
    domain: document.getElementById("domainInput")?.value?.trim() || "",
    linkedin: document.getElementById("linkedinInput")?.value?.trim() || "",
    github: document.getElementById("githubInput")?.value?.trim() || "",
    company: document.getElementById("companyInput")?.value?.trim() || "",
    experience: document.getElementById("experienceInput")?.value?.trim() || "",
    profilePic: document.getElementById("profilePicInput")?.value?.trim() || "",
    resumeUrl: document.getElementById("resumeUrlInput")?.value?.trim() || "",
    pricePerSession: Number(document.getElementById("priceInput")?.value || 0),
    currency: document.getElementById("currencyInput")?.value?.trim() || "INR",
    bookableSlots: bookableSlots.map((s) => new Date(s).toISOString()),
    role: selectedRole,
  };

  try {
    const res = await mcPut(`/api/users/${currentUID}`, body);
    if (!res.ok) {
      throw new Error(res.error || "Save failed");
    }
    localStorage.setItem("mc_role", selectedRole);
    showToast("Profile saved!");
    loadProfile(currentUID);
  } catch (err) {
    console.error("[PROFILE] Save error:", err);
    showToast(err.message || "Failed to save", "error");
  } finally {
    document.getElementById("saveBtnText").style.display = "inline";
    document.getElementById("saveSpinner").classList.add("hidden");
  }
}

async function handleLogout() {
  localStorage.removeItem("mc_jwt");
  await auth.signOut();
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

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthState();
  const state = getAuthState();
  if (!state.firebaseUser) return;
  currentUID = state.firebaseUser.uid;
  loadProfile(state.firebaseUser.uid);

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
    try {
      const f = e.target.files?.[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      const res = await mcPost("/api/upload/profile-image", fd);
      if (res.ok && res.data.url) {
        const base = window.MC_API || "http://localhost:5000";
        document.getElementById("profilePicInput").value = base + res.data.url;
        updatePreview();
        showToast("Image uploaded");
      } else {
        showToast(res.error || "Upload failed", "error");
      }
    } catch (err) {
      console.error("[PROFILE] Image upload error:", err);
      showToast("Upload failed", "error");
    }
    e.target.value = "";
  });

  document.getElementById("resumeFile")?.addEventListener("change", async (e) => {
    try {
      const f = e.target.files?.[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      const res = await mcPost("/api/upload/document", fd);
      if (res.ok && res.data.url) {
        const base = window.MC_API || "http://localhost:5000";
        document.getElementById("resumeUrlInput").value = base + res.data.url;
        showToast("Document uploaded");
      } else {
        showToast(res.error || "Upload failed", "error");
      }
    } catch (err) {
      console.error("[PROFILE] Resume upload error:", err);
      showToast("Upload failed", "error");
    }
    e.target.value = "";
  });

  document.getElementById("saveBtn")?.addEventListener("click", saveProfile);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("hamburger")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
});
