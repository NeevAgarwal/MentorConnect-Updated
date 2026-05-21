let apiMentors = [];
let activeFilter = "All";
let activeSort = "recommended";
let searchTimer = null;
let testimonialIndex = 0;
const testimonials = [
  {
    quote: "I booked a product mentor, got a sharper roadmap, and walked into interviews with actual stories.",
    name: "Riya S.",
    role: "Final-year engineering student",
  },
  {
    quote: "The chat and session flow made mentoring feel lightweight. Students came prepared and follow-ups were easy.",
    name: "Kabir M.",
    role: "Senior backend mentor",
  },
  {
    quote: "Search by skills helped me find someone who had solved the exact career switch I was trying to make.",
    name: "Naina P.",
    role: "Career switcher",
  },
];

document.addEventListener("DOMContentLoaded", () => {
  renderTags();
  renderDomainFilters();
  renderSteps();
  renderTestimonials();
  loadMentorsFromApi();
  setInterval(renderTestimonials, 5500);
  document.getElementById("searchInput")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadMentorsFromApi, 350);
  });
});

async function loadMentorsFromApi() {
  const q = document.getElementById("searchInput").value.trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (activeFilter !== "All") params.set("domain", activeFilter);
  params.set("sort", activeSort);
  try {
    const base = window.MC_API || "http://localhost:5000";
    const response = await fetch(`${base}/api/users/mentors?${params.toString()}`);
    const data = response.ok ? await response.json() : null;
    const liveMentors = data?.mentors || [];
    apiMentors = liveMentors.length ? liveMentors : fallbackMentors(q, activeFilter);
    apiMentors
      .map((m) => m.domain)
      .filter(Boolean)
      .forEach((domain) => {
        if (!domains.includes(domain)) domains.push(domain);
      });
    renderDomainFilters();
    renderMentors(apiMentors);
    renderHomeActivity(apiMentors);
  } catch {
    const fallback = fallbackMentors(q, activeFilter);
    renderMentors(fallback);
    renderHomeActivity(fallback);
  }
}

function fallbackMentors(q = "", domain = "All") {
  const term = String(q || "").toLowerCase();
  return mentors.filter((m) => {
    const domainOk = domain === "All" || m.domain === domain;
    const searchOk =
      !term ||
      [m.name, m.role, m.company, m.domain, ...(m.skills || [])]
        .join(" ")
        .toLowerCase()
        .includes(term);
    return domainOk && searchOk;
  });
}

function renderHomeActivity(list) {
  const mentorsList = list || [];
  const skillCounts = new Map();
  const domainCounts = new Map();
  let sessions = 0;
  let ratingTotal = 0;
  let ratingCount = 0;
  mentorsList.forEach((m) => {
    [...(m.skills || []), ...(m.expertiseTags || [])].forEach((s) => {
      if (s) skillCounts.set(s, (skillCounts.get(s) || 0) + 1);
    });
    if (m.domain) domainCounts.set(m.domain, (domainCounts.get(m.domain) || 0) + 1);
    sessions += Number(m.totalSessions || m.reviews || 0);
    if (Number(m.ratingAvg || m.rating)) {
      ratingTotal += Number(m.ratingAvg || m.rating);
      ratingCount += 1;
    }
  });

  const statMentors = document.getElementById("homeStatMentors");
  const statSessions = document.getElementById("homeStatSessions");
  const statRating = document.getElementById("homeStatRating");
  if (statMentors) statMentors.textContent = mentorsList.length ? `${mentorsList.length}+` : "500+";
  if (statSessions) statSessions.textContent = sessions ? `${sessions}+` : "12K+";
  if (statRating) statRating.textContent = ratingCount ? (ratingTotal / ratingCount).toFixed(1) : "4.9";

  const renderTags = (id, map, fallback) => {
    const el = document.getElementById(id);
    if (!el) return;
    const rows = [...map].sort((a, b) => b[1] - a[1]).slice(0, 8);
    el.innerHTML = (rows.length ? rows : fallback.map((x) => [x, ""]))
      .map(([label, count]) => `<button class="activity-tag" onclick='setSearchAndFilter(${JSON.stringify(label)})'>${esc(label)}${count ? ` <span>${count}</span>` : ""}</button>`)
      .join("");
  };
  renderTags("homeTrendingSkills", skillCounts, quickTags);
  renderTags("homeTopDomains", domainCounts, domains.filter((d) => d !== "All"));

  const pulse = document.getElementById("homePulse");
  if (pulse) {
    const activeMentors = mentorsList.filter((m) => (m.bookableSlots || []).length || m.featured).length;
    pulse.innerHTML = `<strong>${activeMentors || mentorsList.length}</strong> mentors are discoverable with live profiles, booking, chat, and recommendations.`;
  }
  if (window.lucide) lucide.createIcons();
}

function renderTags() {
  const el = document.getElementById("tagList");
  if (!el) return;
  el.innerHTML = quickTags.map(
    (tag) => `<span class="tag" onclick="setSearchAndFilter('${tag}')">${tag}</span>`
  ).join("");
}

function renderDomainFilters() {
  const el = document.getElementById("domainFilters");
  if (!el) return;
  el.innerHTML = domains.map(
    (d) =>
      `<button class="domain-btn ${d === activeFilter ? "active" : ""}" onclick="setDomain('${d}')">${d}</button>`
  ).join("");
}

function renderMentors(list) {
  const grid = document.getElementById("mentorsGrid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<p class="no-results">No mentors found. Try a different search.</p>`;
    return;
  }
  grid.innerHTML = list
    .map((m) => {
      const initials = (m.name || "?")
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
      const avatar = m.profilePic
        ? `<div class="avatar"><img src="${esc(m.profilePic)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/></div>`
        : `<div class="avatar">${initials}</div>`;
      const sk = (m.skills || []).slice(0, 4).map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("");
      const price = m.pricePerSession != null ? m.pricePerSession : m.price != null ? m.price : "-";
      const cur = m.currency || "INR";
      const rating = (m.ratingAvg || 0).toFixed(1);
      const match = m.matchScore != null ? `<span class="match-pill">${m.matchScore}% match</span>` : "";
      return `
    <div class="mentor-card">
      <div class="card-top">
        <div class="mentor-info">
          ${avatar}
          <div>
            <div class="mentor-name">${esc(m.name)}</div>
            <div class="mentor-role">${esc(m.domain || "Mentor")}</div>
            <div class="mentor-company">${esc(m.company || "")}</div>
          </div>
        </div>
        <div class="mentor-rating">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${rating}
        </div>
      </div>
      ${match}
      <div class="skills">${sk || '<span class="skill-tag">Skills TBD</span>'}</div>
      <div class="card-footer">
        <div class="price">${cur} ${price}<span>/session</span></div>
        <button class="btn-gold" style="padding:9px 22px; font-size:13px;" onclick="location.href='signup.html'">Get started</button>
      </div>
    </div>`;
    })
    .join("");
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSteps() {
  const el = document.getElementById("stepsGrid");
  if (!el) return;
  el.innerHTML = steps
    .map(
      (s, i) => `
    <div class="step">
      <div class="step-icon"><i data-lucide="${s.icon}"></i></div>
      <div class="step-num">Step ${i + 1}</div>
      <div class="step-title">${s.title}</div>
      <div class="step-desc">${s.desc}</div>
    </div>`
    )
    .join("");
  lucide.createIcons();
}

function renderTestimonials() {
  const el = document.getElementById("testimonialCard");
  if (!el || !testimonials.length) return;
  const t = testimonials[testimonialIndex % testimonials.length];
  testimonialIndex += 1;
  el.innerHTML = `
    <div class="testimonial-quote">"${esc(t.quote)}"</div>
    <div class="testimonial-person">${esc(t.name)}</div>
    <div class="testimonial-role">${esc(t.role)}</div>
  `;
  if (window.lucide) lucide.createIcons();
}

function filterMentors() {
  loadMentorsFromApi();
}

function setDomain(d) {
  activeFilter = d;
  activeSort = "recommended";
  renderDomainFilters();
  loadMentorsFromApi();
}

function setSearchAndFilter(tag) {
  const input = document.getElementById("searchInput");
  if (input) input.value = tag;
  loadMentorsFromApi();
}

function searchAndScroll() {
  loadMentorsFromApi();
  setTimeout(() => {
    const section = document.getElementById("mentorsSection");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

function quickExplore(term = "", sort = "recommended") {
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("open"));
  activeSort = sort;
  if (term && term !== "new") document.getElementById("searchInput").value = term;
  if (term === "new") document.getElementById("searchInput").value = "";
  loadMentorsFromApi();
  searchAndScroll();
}

function toggleDropdown(id) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    const dd = item.querySelector(".nav-dropdown");
    if (!dd) return;
    dd.id === id ? item.classList.toggle("open") : item.classList.remove("open");
  });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".nav-item")) document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("open"));
});

const modalContent = {
  "For Students": {
    icon: "graduation-cap",
    title: "IdeaSphere for Students",
    sections: [
      { heading: "What you get", body: "Access to verified mentors. Book sessions, chat in real time, and grow with structured guidance." },
      { heading: "How to find a mentor", body: "Use search and filters on the homepage and dashboard. Match scores reflect your interests and goals." },
      { heading: "Booking a session", body: "Create an account, choose a slot, and receive Jitsi Meet links after confirmation." },
      { heading: "What to expect", body: "Sessions are 1-on-1 with calendar, notifications, and session history in the app." },
      { heading: "Pricing", body: "Mentors set their own session price in INR (or your configured currency)." },
    ],
  },
  "For Mentors": {
    icon: "users",
    title: "IdeaSphere for Mentors",
    sections: [
      { heading: "Who can apply", body: "Anyone with experience to share. Complete your profile, pricing, and availability slots." },
      { heading: "Setting up your profile", body: "Upload a photo, resume, expertise tags, and GitHub or LinkedIn links." },
      { heading: "Getting students", body: "Appear in marketplace search and recommended lists based on skills and ratings." },
      { heading: "Earnings", body: "Track completed sessions and revenue in the analytics dashboard." },
      { heading: "Your commitment", body: "Accept or reject booking requests; reschedule when needed." },
    ],
  },
  "Mentor Profile Tips": {
    icon: "clipboard-list",
    title: "Mentor Profile Tips",
    sections: [
      { heading: "Lead with outcomes", body: "Use your bio to explain the decisions, interviews, projects, or career moves you can help with." },
      { heading: "Add proof", body: "Complete company, education, GitHub, LinkedIn, expertise tags, and availability so students can trust the profile." },
      { heading: "Keep slots fresh", body: "Published availability improves booking confidence and helps the dashboard surface active mentors." },
      { heading: "Price clearly", body: "Set a session price that matches your experience and update it as demand grows." },
    ],
  },
  Earnings: {
    icon: "trending-up",
    title: "Mentor Earnings",
    sections: [
      { heading: "Set your rate", body: "Mentors control their price per session from the profile page." },
      { heading: "Track performance", body: "Completed sessions, profile views, ratings, and total earnings are visible in mentor analytics." },
      { heading: "Grow demand", body: "Strong expertise tags, reliable availability, and faster responses improve discovery and repeat bookings." },
    ],
  },
  "Booking Process": {
    icon: "calendar",
    title: "How Booking Works",
    sections: [
      { heading: "Step 1 - Find a mentor", body: "Browse the homepage or full dashboard marketplace." },
      { heading: "Step 2 - Choose a slot", body: "Pick mentor-published slots or propose a datetime when slots are open." },
      { heading: "Step 3 - Confirm", body: "Mentors approve requests; you receive notifications and email when SMTP is configured." },
      { heading: "Step 4 - Join the session", body: "Use the secure Jitsi Meet room generated for each booking." },
      { heading: "After the session", body: "Leave a review; mentors mark complete to update analytics." },
    ],
  },
  FAQs: {
    icon: "help-circle",
    title: "Frequently Asked Questions",
    sections: [
      { heading: "Can I cancel a booking?", body: "Yes, students and mentors can cancel from the Sessions page when status allows." },
      { heading: "Real-time chat?", body: "Socket.io powers typing indicators and instant message delivery." },
      { heading: "Is data secure?", body: "APIs use JWT after Firebase sign-in, rate limits, Helmet, and Mongo sanitization." },
      { heading: "How are mentors verified?", body: "Community-driven reviews and admin tools for moderation." },
      { heading: "Deploy anywhere", body: "Configure MONGO_URI, JWT_SECRET, SMTP, and CORS_ORIGIN for production." },
    ],
  },
};

function openModal(key) {
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("open"));
  const data = modalContent[key];
  if (!data) return;
  const existing = document.getElementById("ideaModal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "ideaModal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <div class="modal-icon"><i data-lucide="${data.icon}"></i></div>
          <h2 class="modal-title">${data.title}</h2>
        </div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        ${data.sections
          .map(
            (s) => `
          <div class="modal-section">
            <h3 class="modal-section-title">${s.heading}</h3>
            <p class="modal-section-body">${s.body}</p>
          </div>`
          )
          .join("")}
      </div>
    </div>`;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("open"));
  document.body.style.overflow = "hidden";
  lucide.createIcons();
}

function closeModal() {
  const modal = document.getElementById("ideaModal");
  if (!modal) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
  setTimeout(() => modal.remove(), 300);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function comingSoon(feature) {
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("open"));
  showToast(`"${feature}" is available from the dashboard.`);
}

function showToast(msg, type = "default") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}
