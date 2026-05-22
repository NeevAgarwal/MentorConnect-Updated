let currentUID = null;
let currentUser = null;
let skills = [];
let expertiseTags = [];
let interests = [];
let goals = [];
let languages = [];
let bookableSlots = [];
let selectedRole = "student";
let profileDirty = false;
let savingProfile = false;

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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value == null ? "" : value;
}

function setStatus(message, type = "") {
  const el = document.getElementById("profileStatus");
  if (!el) return;
  el.textContent = message || "";
  el.className = `profile-status ${type}`.trim();
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
  const sp = document.getElementById("studentPrefs");
  if (sp) sp.style.opacity = role === "student" ? "1" : "0.65";
  markDirty();
}

function markDirty() {
  profileDirty = true;
}

function setSaving(isSaving) {
  savingProfile = isSaving;
  const text = document.getElementById("saveBtnText");
  const spinner = document.getElementById("saveSpinner");
  const btn = document.getElementById("saveBtn");
  if (text) text.style.display = isSaving ? "none" : "inline";
  if (spinner) spinner.classList.toggle("hidden", !isSaving);
  if (btn) btn.disabled = isSaving;
}

function tagRenderer(containerId, list, onRemove) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = list
    .map(
      (s, i) =>
        `<span class="skill-pill">${escapeHtml(s)}<button type="button" data-i="${i}" aria-label="Remove">x</button></span>`
    )
    .join("");
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => onRemove(Number(btn.getAttribute("data-i"))));
  });
}

function renderSkillPills() {
  tagRenderer("skillsTags", skills, (i) => {
    skills.splice(i, 1);
    markDirty();
    renderSkillPills();
    renderProfileDetails();
  });
  const previewSkills = document.getElementById("previewSkills");
  if (previewSkills) {
    previewSkills.innerHTML = skills.length
      ? skills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("")
      : '<span class="section-sub">Add skills to improve matches</span>';
  }
  renderProfileDetails();
}

function renderExp() {
  tagRenderer("expTags", expertiseTags, (i) => {
    expertiseTags.splice(i, 1);
    markDirty();
    renderExp();
    renderProfileDetails();
  });
  renderProfileDetails();
}
function renderInterest() {
  tagRenderer("interestTags", interests, (i) => {
    interests.splice(i, 1);
    markDirty();
    renderInterest();
  });
}
function renderGoals() {
  tagRenderer("goalTags", goals, (i) => {
    goals.splice(i, 1);
    markDirty();
    renderGoals();
  });
}
function renderLanguages() {
  tagRenderer("languageTags", languages, (i) => {
    languages.splice(i, 1);
    markDirty();
    renderLanguages();
    renderProfileDetails();
  });
}

function addTo(list, raw, max, renderFn) {
  let skippedForLimit = false;
  String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const s = item.slice(0, 48);
      const exists = list.some((x) => x.toLowerCase() === s.toLowerCase());
      if (s && !exists && list.length < max) {
        list.push(s);
        markDirty();
      } else if (s && !exists && list.length >= max) {
        skippedForLimit = true;
      }
    });
  if (skippedForLimit) showToast(`Limit reached (${max})`, "error");
  renderFn();
  renderProfileDetails();
}

function renderSlots() {
  const ul = document.getElementById("slotList");
  if (!ul) return;
  if (!bookableSlots.length) {
    ul.innerHTML = '<li class="slot-empty">No future slots published yet.</li>';
    return;
  }
  ul.innerHTML = bookableSlots
    .map((iso, i) => {
      const d = new Date(iso);
      return `<li><span>${escapeHtml(d.toLocaleString())}</span><button type="button" data-si="${i}">Remove</button></li>`;
    })
    .join("");
  ul.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      bookableSlots.splice(Number(b.getAttribute("data-si")), 1);
      markDirty();
      renderSlots();
    });
  });
}

function updatePreview() {
  const bio = document.getElementById("bioInput")?.value || "";
  const pic = document.getElementById("profilePicInput")?.value || "";
  const previewBio = document.getElementById("previewBio");
  if (previewBio) previewBio.textContent = bio || "Your bio will appear here...";
  const avatar = document.getElementById("previewAvatar");
  if (!avatar) return;
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
  renderProfileDetails();
}

function currentDraft() {
  return {
    ...(currentUser || {}),
    role: selectedRole,
    bio: document.getElementById("bioInput")?.value?.trim() || "",
    skills,
    expertiseTags,
    interests,
    goals,
    linkedin: document.getElementById("linkedinInput")?.value?.trim() || "",
    github: document.getElementById("githubInput")?.value?.trim() || "",
    company: document.getElementById("companyInput")?.value?.trim() || "",
    education: document.getElementById("educationInput")?.value?.trim() || "",
    experience: document.getElementById("experienceInput")?.value?.trim() || "",
    experienceYears: Number(document.getElementById("experienceYearsInput")?.value || 0),
    languages,
    timezone: document.getElementById("timezoneInput")?.value?.trim() || "",
    availabilityStatus: document.getElementById("availabilityStatusInput")?.value || "open",
    learningProgress: Number(document.getElementById("learningProgressInput")?.value || 0),
    profilePic: document.getElementById("profilePicInput")?.value?.trim() || "",
    resumeUrl: document.getElementById("resumeUrlInput")?.value?.trim() || "",
    domain: document.getElementById("domainInput")?.value?.trim() || "",
    pricePerSession: Number(document.getElementById("priceInput")?.value || 0),
    currency: document.getElementById("currencyInput")?.value?.trim() || "INR",
    bookableSlots,
  };
}

function profileCompletion(user) {
  const base = ["bio", "profilePic", "linkedin"];
  const mentor = ["company", "education", "domain", "experience", "experienceYears", "languages", "timezone", "skills", "expertiseTags", "bookableSlots"];
  const student = ["skills", "interests", "goals", "languages", "timezone", "learningProgress"];
  const fields = [...base, ...(user.role === "mentor" ? mentor : student)];
  const done = fields.filter((key) => {
    const value = user[key];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(String(value || "").trim());
  }).length;
  return Math.round((done / fields.length) * 100);
}

function mentorTrustScore(user) {
  const response = Number(user.responseRate || 96);
  const rating = Number(user.ratingAvg || 0) * 12;
  const sessions = Math.min(18, Number(user.totalSessions || 0) * 1.5);
  const completion = profileCompletion(user) * 0.18;
  const availability = user.availabilityStatus === "open" ? 8 : user.availabilityStatus === "busy" ? 4 : 1;
  return Math.max(40, Math.min(99, Math.round(response * 0.25 + rating + sessions + completion + availability)));
}

function renderProfileDetails() {
  const user = currentDraft();
  const pct = profileCompletion(user);
  const pctEl = document.getElementById("completionPct");
  const bar = document.getElementById("completionBar");
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (bar) bar.style.width = `${pct}%`;

  const stats = document.getElementById("previewStats");
  if (stats) {
    stats.innerHTML = [
      { label: "Sessions", value: user.totalSessions || 0 },
      { label: "Trust", value: mentorTrustScore(user) },
      { label: "Years", value: user.role === "mentor" ? Number(user.experienceYears || 0) : `${Number(user.learningProgress || 0)}%` },
    ]
      .map((item) => `<div class="preview-stat"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>`)
      .join("");
  }

  const presence = document.getElementById("previewPresence");
  if (presence) {
    const label = user.availabilityStatus === "busy" ? "Limited availability" : user.availabilityStatus === "away" ? "Away" : "Open to bookings";
    presence.className = `preview-presence ${escapeHtml(user.availabilityStatus || "open")}`;
    presence.innerHTML = `<span class="presence-dot"></span><span>${escapeHtml(label)}</span>`;
  }

  const achievements = document.getElementById("previewAchievements");
  if (achievements) {
    const badges = [
      pct >= 80 ? "Complete profile" : null,
      user.role === "mentor" && user.featured ? "Featured mentor" : null,
      user.role === "mentor" && Number(user.responseRate || 96) >= 90 ? "Fast responder" : null,
      user.role === "mentor" && Number(user.ratingAvg || 0) >= 4.7 ? "Top rated" : null,
      user.role === "mentor" && Number(user.totalSessions || 0) >= 10 ? "Session pro" : null,
      user.role === "student" && Number(user.learningProgress || 0) >= 50 ? "Growth streak" : null,
      (user.languages || []).length >= 2 ? "Multilingual" : null,
    ].filter(Boolean);
    achievements.innerHTML = badges.length
      ? badges.map((b) => `<span class="achievement-pill">${escapeHtml(b)}</span>`).join("")
      : '<span class="section-sub">Badges unlock as you complete your profile</span>';
  }

  const links = document.getElementById("previewLinks");
  if (links) {
    const items = [
      user.linkedin ? { label: "LinkedIn", href: user.linkedin } : null,
      user.github ? { label: "GitHub", href: user.github } : null,
      user.resumeUrl ? { label: "Resume", href: user.resumeUrl } : null,
    ].filter(Boolean);
    links.innerHTML = items.length
      ? items
          .map((item) => `<a class="preview-link" href="${escapeHtml(item.href)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>`)
          .join("")
      : '<span class="section-sub">Add links to strengthen your profile</span>';
  }

  const timeline = document.getElementById("profileTimeline");
  if (timeline) {
    const points = [
      user.company ? `Company: ${user.company}` : "",
      user.education ? `Education: ${user.education}` : "",
      user.experience ? `Experience: ${user.experience}` : "",
      user.experienceYears ? `${user.experienceYears}+ years of experience` : "",
      user.languages?.length ? `Languages: ${user.languages.join(", ")}` : "",
      user.timezone ? `Timezone: ${user.timezone}` : "",
      user.domain ? `Domain: ${user.domain}` : "",
    ].filter(Boolean);
    timeline.innerHTML = points.map((p) => `<div class="timeline-item">${escapeHtml(p)}</div>`).join("");
  }
}

function isSafeUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch (_) {
    return false;
  }
}

function isHostUrl(value, hostPart) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return isSafeUrl(value) && u.hostname.toLowerCase().includes(hostPart);
  } catch (_) {
    return false;
  }
}

function normalizeSlots(values) {
  return [...new Set(values)]
    .map((s) => new Date(s))
    .filter((d) => !Number.isNaN(d.getTime()) && d > new Date())
    .sort((a, b) => a - b)
    .map((d) => d.toISOString());
}

async function loadProfile(uid) {
  try {
    const res = await mcGet(`/api/users/${uid}`);
    if (!res.ok) {
      showToast("Could not load profile", "error");
      return;
    }

    currentUser = res.data.user;

    setText("sidebarName", currentUser?.name || "User");
    setText("sidebarRole", currentUser?.role || "student");
    setText("sidebarAvatar", (currentUser?.name || "U").charAt(0).toUpperCase());

    setText("previewName", currentUser?.name || "User");
    setText("previewBio", currentUser?.bio || "No bio yet.");
    const previewAvatar = document.getElementById("previewAvatar");
    if (previewAvatar && currentUser?.profilePic) {
      previewAvatar.innerHTML = `<img src="${escapeHtml(currentUser.profilePic)}" alt="" />`;
    } else if (previewAvatar) {
      previewAvatar.textContent = (currentUser?.name || "U").charAt(0).toUpperCase();
    }

    setRole(currentUser?.role || "student");

    const bioInput = document.getElementById("bioInput");
    if (bioInput) {
      bioInput.value = currentUser?.bio || "";
      setText("bioCount", String(bioInput.value.length));
    }

    setValue("linkedinInput", currentUser?.linkedin || "");
    setValue("experienceInput", currentUser?.experience || "");
    setValue("experienceYearsInput", currentUser?.experienceYears ?? 0);
    setValue("timezoneInput", currentUser?.timezone || "");
    setValue("availabilityStatusInput", currentUser?.availabilityStatus || "open");
    setValue("learningProgressInput", currentUser?.learningProgress ?? 0);
    setValue("profilePicInput", currentUser?.profilePic || "");
    setValue("githubInput", currentUser?.github || "");
    setValue("companyInput", currentUser?.company || "");
    setValue("educationInput", currentUser?.education || "");
    setValue("domainInput", currentUser?.domain || "");
    setValue("priceInput", currentUser?.pricePerSession ?? 0);
    setValue("currencyInput", currentUser?.currency || "INR");
    setValue("resumeUrlInput", currentUser?.resumeUrl || "");

    skills = [...(currentUser?.skills || [])];
    expertiseTags = [...(currentUser?.expertiseTags || [])];
    interests = [...(currentUser?.interests || [])];
    goals = [...(currentUser?.goals || [])];
    languages = [...(currentUser?.languages || [])];
    bookableSlots = normalizeSlots(currentUser?.bookableSlots || []);

    renderSkillPills();
    renderExp();
    renderInterest();
    renderGoals();
    renderLanguages();
    renderSlots();
    renderProfileDetails();

    const previewRole = document.getElementById("previewRole");
    if (previewRole) {
      previewRole.textContent = currentUser?.role || "student";
      previewRole.className = `card-role ${currentUser?.role || "student"}`;
    }
    profileDirty = false;
  } catch (err) {
    console.error("[PROFILE] Error loading profile:", err);
    showToast("Could not load profile", "error");
  }
}

async function saveProfile() {
  if (!currentUID || savingProfile) return;
  setSaving(true);
  setStatus("Saving profile...");

  const linkedin = document.getElementById("linkedinInput")?.value?.trim() || "";
  const github = document.getElementById("githubInput")?.value?.trim() || "";
  const profilePic = document.getElementById("profilePicInput")?.value?.trim() || "";
  const resumeUrl = document.getElementById("resumeUrlInput")?.value?.trim() || "";
  const price = Number(document.getElementById("priceInput")?.value || 0);

  if (![linkedin, github, profilePic, resumeUrl].every(isSafeUrl)) {
    showToast("Use valid http/https URLs for links and uploads", "error");
    setStatus("Use valid http/https URLs for links and uploads.", "error");
    setSaving(false);
    return;
  }
  if (!isHostUrl(linkedin, "linkedin.com")) {
    showToast("LinkedIn URL should be a linkedin.com link", "error");
    setStatus("LinkedIn URL should be a linkedin.com link.", "error");
    setSaving(false);
    return;
  }
  if (!isHostUrl(github, "github.com")) {
    showToast("GitHub URL should be a github.com link", "error");
    setStatus("GitHub URL should be a github.com link.", "error");
    setSaving(false);
    return;
  }
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    showToast("Enter a valid session price", "error");
    setStatus("Enter a valid session price.", "error");
    setSaving(false);
    return;
  }

  const body = {
    bio: document.getElementById("bioInput")?.value?.trim() || "",
    skills,
    expertiseTags,
    interests,
    goals,
    domain: document.getElementById("domainInput")?.value?.trim() || "",
    linkedin,
    github,
    company: document.getElementById("companyInput")?.value?.trim() || "",
    education: document.getElementById("educationInput")?.value?.trim() || "",
    experience: document.getElementById("experienceInput")?.value?.trim() || "",
    experienceYears: Number(document.getElementById("experienceYearsInput")?.value || 0),
    languages,
    timezone: document.getElementById("timezoneInput")?.value?.trim() || "",
    availabilityStatus: document.getElementById("availabilityStatusInput")?.value || "open",
    learningProgress: Number(document.getElementById("learningProgressInput")?.value || 0),
    profilePic,
    resumeUrl,
    pricePerSession: price,
    currency: document.getElementById("currencyInput")?.value?.trim() || "INR",
    bookableSlots: normalizeSlots(bookableSlots),
    role: selectedRole,
  };

  try {
    const res = await mcPut(`/api/users/${currentUID}`, body);
    if (!res.ok) {
      throw new Error(res.error || "Save failed");
    }
    localStorage.setItem("mc_role", selectedRole);
    currentUser = { ...(currentUser || {}), ...body, ...(res.data.user || {}) };
    profileDirty = false;
    renderProfileDetails();
    updatePreview();
    setStatus("Saved. Your public profile is up to date.", "success");
    showToast("Profile saved!");
    await loadProfile(currentUID);
  } catch (err) {
    console.error("[PROFILE] Save error:", err);
    setStatus(err.message || "Failed to save.", "error");
    showToast(err.message || "Failed to save", "error");
  } finally {
    setSaving(false);
  }
}

async function handleLogout() {
  if (typeof clearAuthStorage === "function") clearAuthStorage();
  else if (typeof clearMcSession === "function") clearMcSession();
  await auth.signOut();
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
  await loadProfile(state.firebaseUser.uid);
  const analyticsLink = document.getElementById("analyticsNavItem");
  const role = state.mcUser?.role || localStorage.getItem("mc_role") || "student";
  if (analyticsLink) analyticsLink.style.display = role === "mentor" ? "flex" : "none";

  document.getElementById("bioInput")?.addEventListener("input", function () {
    setText("bioCount", String(this.value.length));
    setText("previewBio", this.value || "Your bio will appear here...");
    markDirty();
    setStatus("");
  });

  bindTagInput("skillInput", skills, 12, renderSkillPills);
  bindTagInput("expInput", expertiseTags, 15, renderExp);
  bindTagInput("interestInput", interests, 15, renderInterest);
  bindTagInput("goalInput", goals, 15, renderGoals);
  bindTagInput("languageInput", languages, 12, renderLanguages);
  const slotPicker = document.getElementById("slotPicker");
  if (slotPicker) slotPicker.min = new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 16);

  [
    "linkedinInput",
    "experienceInput",
    "experienceYearsInput",
    "timezoneInput",
    "availabilityStatusInput",
    "learningProgressInput",
    "githubInput",
    "companyInput",
    "educationInput",
    "domainInput",
    "priceInput",
    "currencyInput",
    "resumeUrlInput",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      markDirty();
      setStatus("");
      renderProfileDetails();
    });
  });

  document.getElementById("profilePicInput")?.addEventListener("input", () => {
    markDirty();
    setStatus("");
    updatePreview();
  });

  document.getElementById("addSlotBtn")?.addEventListener("click", () => {
    const v = document.getElementById("slotPicker").value;
    if (!v) return;
    const d = new Date(v);
    if (Number.isNaN(d.getTime()) || d <= new Date()) {
      showToast("Choose a future availability slot", "error");
      return;
    }
    const iso = d.toISOString();
    if (!bookableSlots.includes(iso)) bookableSlots.push(iso);
    bookableSlots.sort();
    markDirty();
    renderSlots();
  });

  document.getElementById("picFile")?.addEventListener("change", async (e) => {
    try {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!/^image\//.test(f.type) || f.size > 8 * 1024 * 1024) {
        showToast("Choose an image under 8 MB", "error");
        return;
      }
      const localUrl = URL.createObjectURL(f);
      setValue("profilePicInput", localUrl);
      markDirty();
      updatePreview();
      setStatus("Uploading image...");
      const fd = new FormData();
      fd.append("file", f);
      const res = await mcPost("/api/upload/profile-image", fd);
      if (res.ok && res.data.url) {
        const base = window.MC_API || "http://localhost:5000";
        setValue("profilePicInput", base + res.data.url);
        markDirty();
        updatePreview();
        setStatus("Image uploaded. Save profile to publish it.", "success");
        showToast("Image uploaded");
      } else {
        setValue("profilePicInput", currentUser?.profilePic || "");
        updatePreview();
        setStatus(res.error || "Upload failed", "error");
        showToast(res.error || "Upload failed", "error");
      }
      URL.revokeObjectURL(localUrl);
    } catch (err) {
      console.error("[PROFILE] Image upload error:", err);
      setStatus("Upload failed.", "error");
      showToast("Upload failed", "error");
    }
    e.target.value = "";
  });

  document.getElementById("resumeFile")?.addEventListener("change", async (e) => {
    try {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!/^(image\/|application\/pdf$)/.test(f.type) || f.size > 8 * 1024 * 1024) {
        showToast("Choose a PDF or image under 8 MB", "error");
        return;
      }
      setStatus("Uploading document...");
      const fd = new FormData();
      fd.append("file", f);
      const res = await mcPost("/api/upload/document", fd);
      if (res.ok && res.data.url) {
        const base = window.MC_API || "http://localhost:5000";
        setValue("resumeUrlInput", base + res.data.url);
        markDirty();
        setStatus("Document uploaded. Save profile to publish it.", "success");
        showToast("Document uploaded");
      } else {
        setStatus(res.error || "Upload failed", "error");
        showToast(res.error || "Upload failed", "error");
      }
    } catch (err) {
      console.error("[PROFILE] Resume upload error:", err);
      setStatus("Upload failed.", "error");
      showToast("Upload failed", "error");
    }
    e.target.value = "";
  });

  document.getElementById("saveBtn")?.addEventListener("click", saveProfile);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("hamburger")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  window.addEventListener("beforeunload", (e) => {
    if (!profileDirty || savingProfile) return;
    e.preventDefault();
    e.returnValue = "";
  });
});
