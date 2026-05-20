const express = require("express");
const { body, validationResult } = require("express-validator");
const { verifyFirebaseIdToken } = require("../services/firebaseVerify");
const User = require("../models/User");
const { sendWelcomeEmail } = require("../services/emailService");
const { signAuthToken } = require("../middleware/authMiddleware");

const router = express.Router();

function fail(res, status, message, code) {
  return res.status(status).json({ success: false, message, error: message, code });
}

router.post(
  "/session",
  body("idToken").isString().isLength({ min: 20, max: 12000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return fail(res, 400, "Invalid session request", "VALIDATION_ERROR");
    }
    const projectId = process.env.FIREBASE_PROJECT_ID || "ideasphere-web";
    try {
      const { uid, email } = await verifyFirebaseIdToken(req.body.idToken, projectId);
      const user = await User.findOne({ firebaseUID: uid });
      if (!user) {
        return fail(res, 404, "User not registered in MentorConnect. Please sign up first.", "USER_NOT_REGISTERED");
      }
      if (user.banned) {
        return fail(res, 403, "Account suspended", "USER_BANNED");
      }
      const token = signAuthToken(user);
      const sessionUser = {
        firebaseUID: user.firebaseUID,
        name: user.name,
        email: user.email || email || "",
        role: user.role,
        isAdmin: !!user.isAdmin,
      };
      return res.json({
        success: true,
        data: { token, user: sessionUser },
        token,
        user: sessionUser,
      });
    } catch (e) {
      if (e.message === "JWT_SECRET not configured") {
        return fail(res, 500, "Server authentication is not configured", "AUTH_CONFIG_ERROR");
      }
      return fail(res, e.status || 401, e.message || "Invalid Firebase token", e.code || "FIREBASE_TOKEN_INVALID");
    }
  }
);

router.post(
  "/welcome-email",
  body("idToken").isString().isLength({ min: 20, max: 12000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return fail(res, 400, "Invalid welcome email request", "VALIDATION_ERROR");
    }
    const projectId = process.env.FIREBASE_PROJECT_ID || "ideasphere-web";
    try {
      const { uid } = await verifyFirebaseIdToken(req.body.idToken, projectId);
      const user = await User.findOne({ firebaseUID: uid });
      if (!user) return fail(res, 404, "User not found", "USER_NOT_FOUND");
      if (user.banned) return fail(res, 403, "Account suspended", "USER_BANNED");
      await sendWelcomeEmail(user.email, user.name);
      return res.json({ success: true, data: { sent: true } });
    } catch (e) {
      return fail(res, e.status || 400, e.message || "Welcome email failed", e.code || "WELCOME_EMAIL_FAILED");
    }
  }
);

module.exports = router;
