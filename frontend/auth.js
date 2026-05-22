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
  const el = document.getElementById(resolveErrId(id));
  if (el) el.innerText = msg;
}

function clearErr(id) {
  const el = document.getElementById(resolveErrId(id));
  if (el) el.innerText = "";
}

function resolveErrId(id) {
  const aliases = {
    signupPasswordErr: "signupPassErr",
    confirmPasswordErr: "confirmPassErr",
  };
  return document.getElementById(id) ? id : aliases[id] || id;
}

function setLoading(textId, spinnerId, loading) {
  const text    = document.getElementById(textId);
  const spinner = document.getElementById(spinnerId);
  if (!text || !spinner) return;
  const button = text.closest("button") || spinner.closest("button");
  if (loading) {
    text.style.display = "none";
    spinner.classList.remove("hidden");
  } else {
    text.style.display = "inline";
    spinner.classList.add("hidden");
  }
  if (button) button.disabled = !!loading;
}

function authUnavailableMessage() {
  return "Authentication is still loading. Check your connection and try again.";
}

function isAuthAvailable() {
  return typeof auth !== "undefined" && auth;
}

function firebaseAuthNamespace() {
  return typeof firebase !== "undefined" && firebase?.auth ? firebase.auth : null;
}

function requireAuthAvailable() {
  if (isAuthAvailable()) return true;
  showToast(authUnavailableMessage(), "error");
  return false;
}

function setAuthPersistenceFromForm() {
  const remember = document.getElementById("rememberMe");
  const fbAuth = firebaseAuthNamespace();
  if (!remember || !isAuthAvailable() || !auth.setPersistence || !fbAuth?.Auth?.Persistence) return Promise.resolve();
  const mode = remember.checked ? fbAuth.Auth.Persistence.LOCAL : fbAuth.Auth.Persistence.SESSION;
  return auth.setPersistence(mode).catch((err) => {
    console.warn("[AUTH] Could not set persistence:", err);
  });
}

async function registerBackendUser(user, role = "student", fallbackName = "User") {
  const idToken = await user.getIdToken(true);
  const email = user.email || `firebase_${user.uid}@ideasphere-web.firebaseapp.com`;
  const name = user.displayName || fallbackName || (email.includes("@") ? email.split("@")[0] : "User");
  const res = await mcPost("/api/users/register", {
    idToken,
    name,
    email,
    firebaseUID: user.uid,
    role,
  });
  if (!res.ok) throw new Error(res.error || "Could not create profile");
  return res.data.user || res.data;
}

async function enterAppAfterProviderAuth(user, role = "student") {
  await registerBackendUser(user, role, user.displayName || "User");
  const sessionToken = await syncMcJwt();
  if (!sessionToken) {
    try { await auth.signOut(); } catch (_) {}
    throw new Error("Could not create a secure session. Please try again.");
  }
  const profileRes = await mcGet(`/api/users/${user.uid}`);
  const profile = profileRes.ok ? profileRes.data.user : null;
  localStorage.setItem("mc_uid", user.uid);
  localStorage.setItem("mc_name", profile?.name || user.displayName || "User");
  localStorage.setItem("mc_email", profile?.email || user.email || "");
  localStorage.setItem("mc_role", profile?.role || role);
  if (profile?.isAdmin) localStorage.setItem("mc_admin", "1");
  else localStorage.removeItem("mc_admin");
}

// ─────────────────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────────────────

async function handleSignup(e) {
  e.preventDefault();
  if (!requireAuthAvailable()) return;

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
  if (password.length < 8)      { showErr("signupPasswordErr", "Password too short (min 8)"); return; }
  if (password !== confirmPassword) { showErr("confirmPasswordErr", "Passwords do not match"); return; }

  try {
    setLoading("signupBtnText", "signupSpinner", true);

    await setAuthPersistenceFromForm();

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

    showToast("Signup successful! Welcome aboard.");

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
  if (!requireAuthAvailable()) return;

  const email    = document.getElementById("loginEmail")?.value?.trim();
  const password = document.getElementById("loginPassword")?.value;

  if (!email)    { showToast("Email is required", "error"); return; }
  if (!password) { showToast("Password is required", "error"); return; }

  const textId = document.getElementById("emailBtnText") ? "emailBtnText" : "loginBtnText";
  const spinId = document.getElementById("emailSpinner") ? "emailSpinner" : "loginSpinner";

  try {
    setLoading(textId, spinId, true);
    await setAuthPersistenceFromForm();

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

    showToast("Login successful! Redirecting...");
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

function switchTab(tab) {
  const emailForm = document.getElementById("emailForm");
  const otpForm = document.getElementById("otpForm");
  const tabEmail = document.getElementById("tabEmail");
  const tabOtp = document.getElementById("tabOtp");
  const useOtp = tab === "otp";
  emailForm?.classList.toggle("hidden", useOtp);
  otpForm?.classList.toggle("hidden", !useOtp);
  tabEmail?.classList.toggle("active", !useOtp);
  tabOtp?.classList.toggle("active", useOtp);
}

let phoneConfirmation = null;
let recaptchaVerifier = null;

function collectOtpDigits() {
  return Array.from(document.querySelectorAll("#loginOtpBoxes .otp-box"))
    .map((box) => box.value.trim())
    .join("");
}

async function sendPhoneOtp() {
  if (!requireAuthAvailable()) return;
  const phoneRaw = document.getElementById("loginPhone")?.value.trim() || "";
  if (!/^\d{10}$/.test(phoneRaw)) {
    showToast("Enter a valid 10-digit mobile number", "error");
    return;
  }
  const fbAuth = firebaseAuthNamespace();
  if (!fbAuth?.RecaptchaVerifier) {
    showToast("Phone login is not available in this browser session.", "error");
    return;
  }
  try {
    setLoading("otpBtnText", "otpSpinner", true);
    if (!recaptchaVerifier) {
      recaptchaVerifier = new fbAuth.RecaptchaVerifier("recaptcha-container", { size: "invisible" });
      await recaptchaVerifier.render();
    }
    phoneConfirmation = await auth.signInWithPhoneNumber("+91" + phoneRaw, recaptchaVerifier);
    document.getElementById("otpInputGroup")?.classList.remove("hidden");
    document.getElementById("sendOtpBtn")?.classList.add("hidden");
    document.getElementById("verifyOtpBtn")?.classList.remove("hidden");
    showToast("OTP sent");
  } catch (err) {
    phoneConfirmation = null;
    showToast(err.message || "Could not send OTP", "error");
    if (recaptchaVerifier?.clear) recaptchaVerifier.clear();
    recaptchaVerifier = null;
  } finally {
    setLoading("otpBtnText", "otpSpinner", false);
  }
}

async function verifyPhoneOtp(e) {
  e.preventDefault();
  if (!requireAuthAvailable()) return;
  if (!phoneConfirmation) {
    showToast("Request OTP first", "error");
    return;
  }
  const code = collectOtpDigits();
  if (!/^\d{6}$/.test(code)) {
    showToast("Enter the 6-digit OTP", "error");
    return;
  }
  try {
    const cred = await phoneConfirmation.confirm(code);
    await enterAppAfterProviderAuth(cred.user, "student");
    showToast("Login successful! Redirecting...");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 700);
  } catch (err) {
    showToast(err.message || "Invalid OTP", "error");
  }
}

async function handleGoogleLogin() {
  if (!requireAuthAvailable()) return;
  const fbAuth = firebaseAuthNamespace();
  if (!fbAuth?.GoogleAuthProvider) {
    showToast("Google login is not available right now.", "error");
    return;
  }
  try {
    const provider = new fbAuth.GoogleAuthProvider();
    const cred = await auth.signInWithPopup(provider);
    const role = document.getElementById("signupForm") ? selectedRole : "student";
    await enterAppAfterProviderAuth(cred.user, role);
    showToast("Login successful! Redirecting...");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 700);
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user") {
      showToast(err.message || "Google login failed", "error");
      console.error("[AUTH] Google login error:", err);
    }
  }
}

// ─────────────────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────────────────

async function sendResetEmail(e) {
  e.preventDefault();
  if (!requireAuthAvailable()) return;
  const email = document.getElementById("resetEmail")?.value.trim();
  if (!email) { showToast("Enter your email", "error"); return; }
  try {
    setLoading("resetBtnText", "resetSpinner", true);
    await auth.sendPasswordResetEmail(email);
    const msg = document.getElementById("resetSentMsg");
    if (msg) msg.textContent = `We've sent a password reset link to ${email}.`;
    goToStep(2);
    showToast("Reset email sent! Check your inbox.");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading("resetBtnText", "resetSpinner", false);
  }
}

function goToStep(step) {
  document.getElementById("step1")?.classList.toggle("hidden", step !== 1);
  document.getElementById("step2")?.classList.toggle("hidden", step !== 2);
}

function showPolicy(kind) {
  const copy = {
    Terms: "Use MentorConnect respectfully, keep sessions professional, and follow mentor-specific booking expectations.",
    Privacy: "MentorConnect stores account, profile, booking, chat, and notification data needed to run the demo experience.",
  };
  showToast(copy[kind] || "Policy details are available from the homepage footer.");
}

// ─────────────────────────────────────────────────────────
// PASSWORD STRENGTH
// ─────────────────────────────────────────────────────────

function checkStrength(password) {
  const strengthBar  = document.getElementById("strengthFill") || document.getElementById("strengthBar");
  const strengthText = document.getElementById("strengthText") || document.getElementById("strengthLabel");
  if (!strengthBar || !strengthText) return;
  let strength = 0;
  if (password.length >= 8)          strength++;
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
