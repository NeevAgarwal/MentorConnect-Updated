/**
 * Global handlers referenced from auth HTML (onclick / onsubmit).
 * Depends on Firebase compat on window + getAuth from auth-state.
 */
import { getAuth } from "./auth-state.esm.js";
import { syncBackendJwt } from "./session-sync.js";
import { showToast } from "../utils/toast.js";
import { setLoading } from "./auth-ui.js";
import { apiJson, ApiError } from "../api/client.js";

let phoneConfirmation = null;
let recaptchaVerifier = null;

function getFirebaseAuthNs() {
  return window.firebase?.auth;
}

window.switchTab = function (tab) {
  const emailForm = document.getElementById("emailForm");
  const otpForm = document.getElementById("otpForm");
  const tabEmail = document.getElementById("tabEmail");
  const tabOtp = document.getElementById("tabOtp");
  if (tab === "otp") {
    emailForm?.classList.add("hidden");
    otpForm?.classList.remove("hidden");
    tabEmail?.classList.remove("active");
    tabOtp?.classList.add("active");
  } else {
    otpForm?.classList.add("hidden");
    emailForm?.classList.remove("hidden");
    tabOtp?.classList.remove("active");
    tabEmail?.classList.add("active");
  }
};

function collectOtpDigits() {
  const boxes = document.querySelectorAll("#loginOtpBoxes .otp-box");
  return Array.from(boxes)
    .map((b) => b.value)
    .join("")
    .trim();
}

window.sendPhoneOtp = async function () {
  const ns = getFirebaseAuthNs();
  if (!ns) {
    showToast("Auth not ready", "error");
    return;
  }
  const phoneRaw = document.getElementById("loginPhone")?.value.trim() || "";
  if (phoneRaw.length !== 10 || !/^\d{10}$/.test(phoneRaw)) {
    showToast("Enter a valid 10-digit mobile number", "error");
    return;
  }
  const phoneNumber = "+91" + phoneRaw;
  try {
    setLoading("otpBtnText", "otpSpinner", true);
    const auth = getAuth();
    if (!recaptchaVerifier) {
      recaptchaVerifier = new ns.RecaptchaVerifier("recaptcha-container", { size: "invisible" });
      await recaptchaVerifier.render();
    }
    phoneConfirmation = await auth.signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
    document.getElementById("otpInputGroup")?.classList.remove("hidden");
    document.getElementById("sendOtpBtn")?.classList.add("hidden");
    document.getElementById("verifyOtpBtn")?.classList.remove("hidden");
    showToast("OTP sent");
  } catch (e) {
    showToast(e.message || "Could not send OTP", "error");
    phoneConfirmation = null;
  } finally {
    setLoading("otpBtnText", "otpSpinner", false);
  }
};

window.verifyPhoneOtp = async function (e) {
  e.preventDefault();
  if (!phoneConfirmation) {
    showToast("Request OTP first", "error");
    return;
  }
  const code = collectOtpDigits();
  if (code.length < 6) {
    showToast("Enter the 6-digit code", "error");
    return;
  }
  try {
    const cred = await phoneConfirmation.confirm(code);
    if (window.MC_API) {
      try {
        await syncBackendJwt(cred.user);
      } catch (err) {
        showToast(err.message || "Session sync failed", "error");
        return;
      }
      try {
        await apiJson("/api/users/" + cred.user.uid);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          const syntheticEmail = `firebase_${cred.user.uid}@ideasphere-web.firebaseapp.com`;
          await apiJson("/api/users/register", {
            method: "POST",
            body: {
              name,
              email: cred.user.email || syntheticEmail,
              firebaseUID: cred.user.uid,
              role: "student",
            },
          });
          await syncBackendJwt(cred.user);
        } else {
          showToast(e.message || "Profile setup failed", "error");
          return;
        }
      }
    }
    showToast("Signed in");
    window.location.href = "dashboard.html";
  } catch (err) {
    showToast(err.message || "Invalid code", "error");
  }
};

window.handleGoogleLogin = async function () {
  const ns = getFirebaseAuthNs();
  if (!ns) {
    showToast("Auth not ready", "error");
    return;
  }
  try {
    const provider = new ns.GoogleAuthProvider();
    const cred = await getAuth().signInWithPopup(provider);
    if (window.MC_API) {
      try {
        await syncBackendJwt(cred.user);
      } catch (err) {
        showToast(err.message || "Could not start session", "error");
        return;
      }
      try {
        await apiJson("/api/users/" + cred.user.uid);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          const email = cred.user.email || "";
          const name = cred.user.displayName || (email ? email.split("@")[0] : "User");
          await apiJson("/api/users/register", {
            method: "POST",
            body: {
              name,
              email,
              firebaseUID: cred.user.uid,
              role: "student",
            },
          });
          await syncBackendJwt(cred.user);
        } else {
          showToast(e.message || "Profile check failed", "error");
          return;
        }
      }
    }
    showToast("Signed in");
    window.location.href = "dashboard.html";
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user") {
      showToast(err.message || "Google sign-in failed", "error");
    }
  }
};
