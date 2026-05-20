import { redirectIfAuthed } from "./guards.js";
import { getAuth } from "./auth-state.esm.js";
import { syncBackendJwt } from "./session-sync.js";
import { showToast } from "../utils/toast.js";
import { setLoading, showFieldErr, clearFieldErr } from "./auth-ui.js";

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value;
  if (!email) {
    showToast("Email is required", "error");
    return;
  }
  if (!password) {
    showToast("Password is required", "error");
    return;
  }

  const textId = document.getElementById("emailBtnText") ? "emailBtnText" : "loginBtnText";
  const spinId = document.getElementById("emailSpinner") ? "emailSpinner" : "loginSpinner";

  setLoading(textId, spinId, true);
  try {
    const cred = await getAuth().signInWithEmailAndPassword(email, password);
    const session = await syncBackendJwt(cred.user);
    if (!session?.token) throw new Error("Session exchange failed");

    const user = session.user || {};
    localStorage.setItem("mc_uid", cred.user.uid);
    localStorage.setItem("mc_name", user.name || cred.user.displayName || "User");
    localStorage.setItem("mc_email", user.email || email);
    localStorage.setItem("mc_role", user.role || "student");
    if (user.isAdmin) localStorage.setItem("mc_admin", "1");
    else localStorage.removeItem("mc_admin");

    showToast("Login successful! Redirecting...");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 500);
  } catch (err) {
    try { await getAuth().signOut(); } catch (_) {}
    localStorage.removeItem("mc_jwt");
    showToast(err.message || "Login failed", "error");
  } finally {
    setLoading(textId, spinId, false);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await redirectIfAuthed("dashboard.html").catch(() => {});

  const emailForm = document.getElementById("emailForm");
  if (emailForm) emailForm.addEventListener("submit", handleLogin);

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  const resetForm = document.getElementById("resetForm");
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const em = document.getElementById("resetEmail")?.value.trim();
      if (!em) {
        showToast("Enter your email", "error");
        return;
      }
      try {
        await getAuth().sendPasswordResetEmail(em);
        showToast("Reset email sent! Check your inbox.");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }
});

export { clearFieldErr, showFieldErr };
