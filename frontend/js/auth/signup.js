import { redirectIfAuthed } from "./guards.js";
import { getAuth } from "./auth-state.esm.js";
import { syncBackendJwt } from "./session-sync.js";
import { showToast } from "../utils/toast.js";
import { setLoading, showFieldErr, clearFieldErr } from "./auth-ui.js";

let selectedRole = "student";

function setRole(role) {
  selectedRole = role;
  document.getElementById("roleStudent")?.classList.toggle("active", role === "student");
  document.getElementById("roleMentor")?.classList.toggle("active", role === "mentor");
}

window.setRole = setRole;

function checkStrength(password) {
  const strengthBar = document.getElementById("strengthFill");
  const strengthText = document.getElementById("strengthText");
  if (!strengthBar || !strengthText) return;
  let strength = 0;
  if (password.length >= 6) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  const percent = (strength / 4) * 100;
  strengthBar.style.width = percent + "%";
  if (strength <= 1) {
    strengthText.textContent = "Weak";
    strengthBar.style.background = "#F87171";
  } else if (strength <= 3) {
    strengthText.textContent = "Good";
    strengthBar.style.background = "#FBBF24";
  } else {
    strengthText.textContent = "Strong";
    strengthBar.style.background = "#34D399";
  }
}

window.checkStrength = checkStrength;

window.togglePassword = function (inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    btn.classList.add("active");
  } else {
    input.type = "password";
    btn.classList.remove("active");
  }
};

async function handleSignup(e) {
  e.preventDefault();
  clearFieldErr("firstNameErr");
  clearFieldErr("lastNameErr");
  clearFieldErr("signupEmailErr");
  clearFieldErr("signupPasswordErr");
  clearFieldErr("confirmPasswordErr");

  const firstName = document.getElementById("firstName")?.value.trim();
  const lastName = document.getElementById("lastName")?.value.trim();
  const email = document.getElementById("signupEmail")?.value.trim();
  const password = document.getElementById("signupPassword")?.value;
  const confirmPassword = document.getElementById("confirmPassword")?.value;

  if (!firstName) {
    showFieldErr("firstNameErr", "First name required");
    return;
  }
  if (!lastName) {
    showFieldErr("lastNameErr", "Last name required");
    return;
  }
  if (!email) {
    showFieldErr("signupEmailErr", "Email required");
    return;
  }
  if (password.length < 6) {
    showFieldErr("signupPasswordErr", "Password too short (min 6)");
    return;
  }
  if (password !== confirmPassword) {
    showFieldErr("confirmPasswordErr", "Passwords do not match");
    return;
  }

  setLoading("signupBtnText", "signupSpinner", true);
  try {
    const cred = await getAuth().createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: `${firstName} ${lastName}` });
    const idToken = await cred.user.getIdToken(true);

    const res = await mcPost("/api/users/register", {
      idToken,
      name: `${firstName} ${lastName}`,
      email,
      firebaseUID: cred.user.uid,
      role: selectedRole,
    });
    if (!res.ok) throw new Error(res.error || "Registration failed");

    localStorage.setItem("mc_uid", cred.user.uid);
    localStorage.setItem("mc_name", `${firstName} ${lastName}`);
    localStorage.setItem("mc_email", email);
    localStorage.setItem("mc_role", selectedRole);

    const session = await syncBackendJwt(cred.user);
    if (!session?.token) throw new Error("Session exchange failed");

    showToast("Signup successful! Welcome aboard");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 600);
  } catch (err) {
    try { await getAuth().signOut(); } catch (_) {}
    localStorage.removeItem("mc_jwt");
    showToast(err.message || "Signup failed", "error");
  } finally {
    setLoading("signupBtnText", "signupSpinner", false);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await redirectIfAuthed("dashboard.html").catch(() => {});
  const signupForm = document.getElementById("signupForm");
  if (signupForm) signupForm.addEventListener("submit", handleSignup);
});
