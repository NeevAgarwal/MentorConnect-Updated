// ─────────────────────────────────────────────────────────
// ROLE SELECTION
// ─────────────────────────────────────────────────────────

let selectedRole = "student";

function setRole(role) {
  selectedRole = role;
  const studentBtn = document.getElementById("roleStudent");
  const mentorBtn  = document.getElementById("roleMentor");
  if (role === "student") {
    studentBtn?.classList.add("active");
    mentorBtn?.classList.remove("active");
  } else {
    mentorBtn?.classList.add("active");
    studentBtn?.classList.remove("active");
  }
}

// ─────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────

function showToast(msg, type = "success") {
  const existing = document.getElementById("mc-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "mc-toast";
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
    padding: 14px 24px; border-radius: 12px;
    background: ${type === "error" ? "rgba(248,113,113,0.15)" : "rgba(212,175,55,0.15)"};
    border: 1px solid ${type === "error" ? "rgba(248,113,113,0.4)" : "rgba(212,175,55,0.4)"};
    color: ${type === "error" ? "#F87171" : "#D4AF37"};
    font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: toastIn 0.3s ease;
  `;

  // Inject keyframe once
  if (!document.getElementById("toastStyle")) {
    const style = document.createElement("style");
    style.id = "toastStyle";
    style.textContent = `@keyframes toastIn { from { opacity:0; transform:translateY(12px);} to { opacity:1; transform:translateY(0);} }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function showErr(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerText = msg;
}

function clearErr(id) {
  const el = document.getElementById(id);
  if (el) el.innerText = "";
}

function setLoading(textId, spinnerId, loading) {
  const text    = document.getElementById(textId);
  const spinner = document.getElementById(spinnerId);
  if (!text || !spinner) return;
  if (loading) {
    text.style.display = "none";
    spinner.classList.remove("hidden");
  } else {
    text.style.display = "inline";
    spinner.classList.add("hidden");
  }
}

// ─────────────────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────────────────

async function handleSignup(e) {
  e.preventDefault();

  clearErr("firstNameErr");
  clearErr("lastNameErr");
  clearErr("signupEmailErr");
  clearErr("signupPasswordErr");
  clearErr("confirmPasswordErr");

  const firstName       = document.getElementById("firstName")?.value.trim();
  const lastName        = document.getElementById("lastName")?.value.trim();
  const email           = document.getElementById("signupEmail")?.value.trim();
  const password        = document.getElementById("signupPassword")?.value;
  const confirmPassword = document.getElementById("confirmPassword")?.value;

  if (!firstName)               { showErr("firstNameErr", "First name required"); return; }
  if (!lastName)                { showErr("lastNameErr", "Last name required"); return; }
  if (!email)                   { showErr("signupEmailErr", "Email required"); return; }
  if (password.length < 6)      { showErr("signupPasswordErr", "Password too short (min 6)"); return; }
  if (password !== confirmPassword) { showErr("confirmPasswordErr", "Passwords do not match"); return; }

  try {
    setLoading("signupBtnText", "signupSpinner", true);

    // Firebase signup
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    await user.updateProfile({ displayName: `${firstName} ${lastName}` });
    const idToken = await user.getIdToken(true);

    // Save to MongoDB with proper API layer
    const registerRes = await mcPost("/api/users/register", {
      idToken,
      name: `${firstName} ${lastName}`,
      email,
      firebaseUID: user.uid,
      role: selectedRole,
    });

    if (!registerRes.ok) {
      throw new Error(registerRes.error || "Registration failed");
    }

    // Persist user info for dashboard
    localStorage.setItem("mc_uid", user.uid);
    localStorage.setItem("mc_name", `${firstName} ${lastName}`);
    localStorage.setItem("mc_email", email);
    localStorage.setItem("mc_role", selectedRole);

    const sessionToken = await syncMcJwt();
    if (!sessionToken) {
      localStorage.removeItem("mc_jwt");
      try { await auth.signOut(); } catch (_) {}
      setLoading("signupBtnText", "signupSpinner", false);
      showToast("Could not create a secure session. Please try again.", "error");
      return;
    }

    showToast("Signup successful! Welcome aboard 🎉");

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 900);

  } catch (err) {
    setLoading("signupBtnText", "signupSpinner", false);
    showToast(err.message || "Signup failed", "error");
    console.error("[AUTH] Signup error:", err);
  }
}

// ─────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();

  const email    = document.getElementById("loginEmail")?.value?.trim();
  const password = document.getElementById("loginPassword")?.value;

  if (!email)    { showToast("Email is required", "error"); return; }
  if (!password) { showToast("Password is required", "error"); return; }

  const textId = document.getElementById("emailBtnText") ? "emailBtnText" : "loginBtnText";
  const spinId = document.getElementById("emailSpinner") ? "emailSpinner" : "loginSpinner";

  try {
    setLoading(textId, spinId, true);

    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Backend session is required before entering the app.
    const sessionToken = await syncMcJwt();
    if (!sessionToken) {
      localStorage.removeItem("mc_jwt");
      try {
        await auth.signOut();
      } catch (signOutErr) {
        console.warn("[AUTH] Firebase sign-out after session failure failed:", signOutErr);
      }
      setLoading(textId, spinId, false);
      showToast("Could not create a secure session. Please try again.", "error");
      return;
    }

    // Fetch user profile from backend
    const profileRes = await mcGet(`/api/users/${user.uid}`);
    
    if (profileRes.ok && profileRes.data.user) {
      localStorage.setItem("mc_uid", user.uid);
      localStorage.setItem("mc_name", profileRes.data.user.name || "");
      localStorage.setItem("mc_email", profileRes.data.user.email || "");
      localStorage.setItem("mc_role", profileRes.data.user.role || "student");
    } else {
      // Fallback to local values
      localStorage.setItem("mc_uid", user.uid);
      localStorage.setItem("mc_name", user.displayName || "User");
      localStorage.setItem("mc_email", email);
    }

    showToast("Login successful! Redirecting…");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 900);

  } catch (err) {
    setLoading(textId, spinId, false);
    showToast(err.message || "Login failed", "error");
    console.error("[AUTH] Login error:", err);
  }
}

async function handleEmailLogin(e) {
  return handleLogin(e);
}

// ─────────────────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────────────────

async function sendResetEmail(e) {
  e.preventDefault();
  const email = document.getElementById("resetEmail")?.value.trim();
  if (!email) { showToast("Enter your email", "error"); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    showToast("Reset email sent! Check your inbox.");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─────────────────────────────────────────────────────────
// PASSWORD STRENGTH
// ─────────────────────────────────────────────────────────

function checkStrength(password) {
  const strengthBar  = document.getElementById("strengthFill");
  const strengthText = document.getElementById("strengthText");
  if (!strengthBar || !strengthText) return;
  let strength = 0;
  if (password.length >= 6)          strength++;
  if (/[A-Z]/.test(password))        strength++;
  if (/[0-9]/.test(password))        strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  const percent = (strength / 4) * 100;
  strengthBar.style.width = percent + "%";
  if (strength <= 1) {
    strengthText.innerText = "Weak";
    strengthBar.style.background = "#F87171";
  } else if (strength <= 3) {
    strengthText.innerText = "Good";
    strengthBar.style.background = "#FBBF24";
  } else {
    strengthText.innerText = "Strong";
    strengthBar.style.background = "#34D399";
  }
}

function togglePassword(inputId, icon) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    icon.classList.add("active");
  } else {
    input.type = "password";
    icon.classList.remove("active");
  }
}

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  const emailForm = document.getElementById("emailForm");
  if (emailForm) {
    emailForm.addEventListener("submit", handleLogin);
  }

  const resetForm = document.getElementById("resetForm");
  if (resetForm) {
    resetForm.addEventListener("submit", sendResetEmail);
  }
});
