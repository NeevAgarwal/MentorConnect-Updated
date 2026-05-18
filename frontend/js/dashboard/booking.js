import { apiJson } from "../api/client.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/sanitize.js";
import { setState } from "../state/store.js";

let currentMentor = null;

export function openBookingModal(mentorUid, mentorList) {
  currentMentor = mentorList.find((x) => x.firebaseUID === mentorUid);
  const m = currentMentor;
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
          `<button type="button" class="slot-chip" data-start="${escapeHtml(d.toISOString())}">${escapeHtml(
            d.toLocaleString()
          )}</button>`
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
  setState({ bookingDraft: { mentorId: m.firebaseUID } });
}

export function closeBookingModal() {
  document.getElementById("bookingModal")?.classList.remove("open");
  setState({ bookingDraft: null });
}

export async function submitBooking(onSuccess) {
  const m = currentMentor;
  if (!m) return;
  const startVal = document.getElementById("bmStart").value;
  if (!startVal) {
    showToast("Choose a start time", "error");
    return;
  }
  const startDate = new Date(startVal);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const topic = document.getElementById("bmTopic").value.trim();
  try {
    await apiJson("/api/bookings/", {
      method: "POST",
      body: {
        mentorFirebaseUID: m.firebaseUID,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        topic,
      },
    });
    showToast("Booking requested! Check Sessions.");
    closeBookingModal();
    if (typeof onSuccess === "function") onSuccess();
  } catch (e) {
    showToast(e.message || "Booking failed", "error");
  }
}

export function initBookingModal(onSuccess) {
  document.getElementById("bmClose")?.addEventListener("click", closeBookingModal);
  document.getElementById("bmCancel")?.addEventListener("click", closeBookingModal);
  document.getElementById("bmSubmit")?.addEventListener("click", () => submitBooking(onSuccess));
}
