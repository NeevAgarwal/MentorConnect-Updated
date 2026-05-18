import { redirectIfAuthed } from "./guards.js";
import { getAuth } from "./auth-state.esm.js";
import { showToast } from "../utils/toast.js";

document.addEventListener("DOMContentLoaded", async () => {
  await redirectIfAuthed("dashboard.html").catch(() => {});

  const resetForm = document.getElementById("resetForm");
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("resetEmail")?.value.trim();
      if (!email) {
        showToast("Enter your email", "error");
        return;
      }
      try {
        await getAuth().sendPasswordResetEmail(email);
        showToast("Reset email sent! Check your inbox.");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }
});
