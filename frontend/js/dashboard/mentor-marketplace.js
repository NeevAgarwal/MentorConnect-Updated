import { apiJson, apiFetch } from "../api/client.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/sanitize.js";
import { getState } from "../state/store.js";
import { buildMentorQuery } from "./filters.js";
import { openBookingModal } from "./booking.js";

let mentorList = [];

export function getMentorList() {
  return mentorList;
}

export async function loadMentors() {
  const grid = document.getElementById("mentorsMarketGrid");
  const empty = document.getElementById("mentorsMarketEmpty");
  if (!grid) return;
  grid.innerHTML = Array(6)
    .fill(0)
    .map(() => '<div class="card-skeleton"></div>')
    .join("");
  try {
    const qs = buildMentorQuery();
    const data = await apiJson("/api/users/mentors" + (qs ? "?" + qs : ""));
    mentorList = data.mentors || [];
    if (!mentorList.length) {
      grid.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    const uid = getState().firebaseUser?.uid;
    const role = getState().profile?.role || localStorage.getItem("mc_role") || "student";

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
          uid && uid !== m.firebaseUID && role === "student"
            ? `<button type="button" class="connect-btn book-open" data-uid="${escapeHtml(m.firebaseUID)}">Book</button>`
            : `<a href="chat.html?with=${encodeURIComponent(m.firebaseUID)}" class="connect-btn">Message</a>`;
        return `
        <div class="mentor-card market-card" data-uid="${escapeHtml(m.firebaseUID)}">
          <div class="card-header">
            <div class="card-avatar">${pic}</div>
            <div class="card-info">
              <div class="card-name">${escapeHtml(m.name)}</div>
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
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openBookingModal(btn.getAttribute("data-uid"), mentorList);
      });
    });
    grid.querySelectorAll(".market-card").forEach((card) => {
      card.addEventListener("click", (ev) => {
        if (ev.target.closest("a") || ev.target.closest("button")) return;
        const id = card.getAttribute("data-uid");
        if (id) {
          apiFetch("/api/users/" + id + "/profile-view", { method: "POST", body: {} }).catch(() => {});
        }
      });
    });
  } catch (e) {
    grid.innerHTML = "";
    showToast(e.message || "Could not load mentors", "error");
  }
}

export function wireMentorFilters(scheduleReload) {
  ["mentorSearch", "filterDomain", "filterMinPrice", "filterMaxPrice", "filterMinRating", "filterSort", "filterSkills"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", scheduleReload);
    el.addEventListener("change", () => loadMentors());
  });
}
