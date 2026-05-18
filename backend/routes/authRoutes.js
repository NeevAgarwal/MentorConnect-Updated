const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { verifyFirebaseIdToken } = require("../services/firebaseVerify");
const User = require("../models/User");
const { sendWelcomeEmail } = require("../services/emailService");

const router = express.Router();

router.post(
  "/session",
  body("idToken").isString().isLength({ min: 20, max: 12000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, error: "JWT_SECRET not set on server" });
    }
    const projectId = process.env.FIREBASE_PROJECT_ID || "ideasphere-web";
    try {
      const { uid, email } = await verifyFirebaseIdToken(req.body.idToken, projectId);
      let user = await User.findOne({ firebaseUID: uid });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not registered in MentorConnect. Please sign up first.",
        });
      }
      if (user.banned) {
        return res.status(403).json({ success: false, error: "Account suspended" });
      }
      const token = jwt.sign(
        { uid, email: user.email || email || "" },
        secret,
        { expiresIn: "7d" }
      );
      return res.json({
        success: true,
        token,
        user: {
          firebaseUID: user.firebaseUID,
          name: user.name,
          email: user.email,
          role: user.role,
          isAdmin: !!user.isAdmin,
        },
      });
    } catch (e) {
      return res.status(401).json({ success: false, error: e.message || "Invalid token" });
    }
  }
);

router.post(
  "/welcome-email",
  body("idToken").isString().isLength({ min: 20, max: 12000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const projectId = process.env.FIREBASE_PROJECT_ID || "ideasphere-web";
    try {
      const { uid, email } = await verifyFirebaseIdToken(req.body.idToken, projectId);
      const user = await User.findOne({ firebaseUID: uid });
      if (!user) return res.status(404).json({ success: false, error: "Not found" });
      await sendWelcomeEmail(user.email, user.name);
      return res.json({ success: true });
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }
  }
);

module.exports = router;
