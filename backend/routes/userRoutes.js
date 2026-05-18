const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const User = require("../models/User");
const { optionalAuth, requireAuth, requireSelfOrAdmin } = require("../middleware/authMiddleware");
const { sendWelcomeEmail } = require("../services/emailService");

const router = express.Router();

router.post(
  "/register",
  body("name").isString().trim().isLength({ min: 1, max: 120 }),
  body("email").isEmail().normalizeEmail(),
  body("firebaseUID").isString().trim().isLength({ min: 5, max: 128 }),
  body("role").optional().isIn(["student", "mentor"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, email, firebaseUID, role } = req.body;
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = adminEmails.includes(String(email).toLowerCase());

    const existing = await User.findOne({ firebaseUID });
    if (existing) {
      return res.status(200).json({ success: true, message: "User already exists", user: existing });
    }

    const newUser = new User({
      name,
      email,
      firebaseUID,
      role: role === "mentor" ? "mentor" : "student",
      isAdmin,
    });
    await newUser.save();
    try {
      await sendWelcomeEmail(newUser.email, newUser.name);
    } catch (_) {
      /* optional */
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: newUser,
    });
  }
);

router.get(
  "/mentors",
  optionalAuth,
  query("q").optional().isString().isLength({ max: 120 }),
  query("domain").optional().isString().isLength({ max: 80 }),
  query("minPrice").optional().isFloat({ min: 0 }),
  query("maxPrice").optional().isFloat({ min: 0 }),
  query("minRating").optional().isFloat({ min: 0, max: 5 }),
  query("skills").optional().isString(),
  query("sort").optional().isIn(["recommended", "rating", "price_asc", "price_desc", "sessions"]),
  query("interests").optional().isString(),
  query("goals").optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const filter = { role: "mentor", banned: { $ne: true } };
    if (req.query.domain) filter.domain = new RegExp(req.query.domain, "i");
    if (req.query.minPrice != null) filter.pricePerSession = { ...filter.pricePerSession, $gte: Number(req.query.minPrice) };
    if (req.query.maxPrice != null) {
      filter.pricePerSession = { ...(filter.pricePerSession || {}), $lte: Number(req.query.maxPrice) };
    }
    if (req.query.minRating != null) {
      filter.ratingAvg = { $gte: Number(req.query.minRating) };
    }
    const skills = (req.query.skills || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const andParts = [];
    if (skills.length) andParts.push({ skills: { $all: skills } });
    if (req.query.q) {
      const q = req.query.q.trim();
      andParts.push({
        $or: [
          { name: new RegExp(q, "i") },
          { bio: new RegExp(q, "i") },
          { company: new RegExp(q, "i") },
          { skills: new RegExp(q, "i") },
          { expertiseTags: new RegExp(q, "i") },
        ],
      });
    }
    if (andParts.length) filter.$and = andParts;

    let sort = { featured: -1, ratingAvg: -1, createdAt: -1 };
    if (req.query.sort === "price_asc") sort = { pricePerSession: 1 };
    if (req.query.sort === "price_desc") sort = { pricePerSession: -1 };
    if (req.query.sort === "rating") sort = { ratingAvg: -1, ratingCount: -1 };
    if (req.query.sort === "sessions") sort = { totalSessions: -1 };

    let mentors = await User.find(filter).sort(sort).limit(120).lean();

    const interestTokens = (req.query.interests || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const goalTokens = (req.query.goals || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const viewer = req.auth ? await User.findOne({ firebaseUID: req.auth.uid }).lean() : null;

    function score(m) {
      let s = 0;
      if (m.featured) s += 15;
      s += (m.ratingAvg || 0) * 8;
      s += Math.min(25, (m.totalSessions || 0) * 0.5);
      const pool = [...(m.skills || []), ...(m.expertiseTags || [])].map((x) => String(x).toLowerCase());
      if (viewer) {
        (viewer.skills || []).forEach((k) => {
          if (pool.some((p) => p.includes(String(k).toLowerCase()))) s += 12;
        });
        (viewer.interests || []).forEach((k) => {
          if (pool.some((p) => p.includes(String(k).toLowerCase()))) s += 8;
        });
        (viewer.goals || []).forEach((k) => {
          if ((m.bio || "").toLowerCase().includes(String(k).toLowerCase())) s += 6;
        });
      }
      interestTokens.forEach((t) => {
        if (pool.some((p) => p.includes(t))) s += 10;
      });
      goalTokens.forEach((t) => {
        if ((m.bio || "").toLowerCase().includes(t)) s += 8;
      });
      return Math.min(100, Math.round(s));
    }

    if (req.query.sort === "recommended" || !req.query.sort) {
      mentors = mentors
        .map((m) => ({ ...m, matchScore: score(m) }))
        .sort((a, b) => b.matchScore - a.matchScore);
    } else {
      mentors = mentors.map((m) => ({ ...m, matchScore: score(m) }));
    }

    res.json({ success: true, mentors });
  }
);

router.get("/", async (_req, res) => {
  const users = await User.find({ banned: { $ne: true } }).sort({ createdAt: -1 }).limit(300).lean();
  res.json({ success: true, users });
});

router.get("/:firebaseUID", param("firebaseUID").isString(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  const user = await User.findOne({ firebaseUID: req.params.firebaseUID });
  if (!user) return res.status(404).json({ success: false, error: "User not found" });
  res.json({ success: true, user });
});

router.post(
  "/:firebaseUID/profile-view",
  param("firebaseUID").isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    await User.updateOne({ firebaseUID: req.params.firebaseUID, role: "mentor" }, { $inc: { profileViews: 1 } });
    res.json({ success: true });
  }
);

router.put(
  "/:firebaseUID",
  requireAuth,
  requireSelfOrAdmin("firebaseUID"),
  param("firebaseUID").isString(),
  body("bio").optional().isString().isLength({ max: 2000 }),
  body("skills").optional().isArray({ max: 30 }),
  body("expertiseTags").optional().isArray({ max: 30 }),
  body("interests").optional().isArray({ max: 30 }),
  body("goals").optional().isArray({ max: 30 }),
  body("domain").optional().isString().isLength({ max: 80 }),
  body("linkedin").optional().isString().isLength({ max: 500 }),
  body("github").optional().isString().isLength({ max: 500 }),
  body("company").optional().isString().isLength({ max: 120 }),
  body("experience").optional().isString().isLength({ max: 500 }),
  body("profilePic").optional().isString().isLength({ max: 2000 }),
  body("resumeUrl").optional().isString().isLength({ max: 2000 }),
  body("pricePerSession").optional().isFloat({ min: 0, max: 100000 }),
  body("currency").optional().isString().isLength({ max: 8 }),
  body("weeklyAvailability").optional().isArray({ max: 50 }),
  body("bookableSlots").optional().isArray({ max: 200 }),
  body("role").optional().isIn(["student", "mentor"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const allowed = [
      "bio",
      "skills",
      "expertiseTags",
      "interests",
      "goals",
      "domain",
      "linkedin",
      "github",
      "company",
      "experience",
      "profilePic",
      "resumeUrl",
      "pricePerSession",
      "currency",
      "weeklyAvailability",
      "bookableSlots",
      "role",
    ];
    const patch = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });

    const updated = await User.findOneAndUpdate(
      { firebaseUID: req.params.firebaseUID },
      { $set: patch },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, message: "Profile updated", user: updated });
  }
);

router.get(
  "/:firebaseUID/analytics",
  requireAuth,
  requireSelfOrAdmin("firebaseUID"),
  param("firebaseUID").isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const u = await User.findOne({ firebaseUID: req.params.firebaseUID }).lean();
    if (!u || u.role !== "mentor") {
      return res.status(400).json({ success: false, error: "Mentor analytics only" });
    }
    const Booking = require("../models/Booking");
    const Review = require("../models/Review");

    const [upcoming, completed, byMonth, ratingDist] = await Promise.all([
      Booking.countDocuments({
        mentorFirebaseUID: u.firebaseUID,
        status: "confirmed",
        startTime: { $gte: new Date() },
      }),
      Booking.countDocuments({ mentorFirebaseUID: u.firebaseUID, status: "completed" }),
      Booking.aggregate([
        { $match: { mentorFirebaseUID: u.firebaseUID, status: "completed" } },
        {
          $group: {
            _id: { y: { $year: "$startTime" }, m: { $month: "$startTime" } },
            count: { $sum: 1 },
            revenue: { $sum: "$priceAtBooking" },
          },
        },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
        { $limit: 12 },
      ]),
      Review.aggregate([
        { $match: { mentorFirebaseUID: u.firebaseUID } },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      analytics: {
        profileViews: u.profileViews || 0,
        earningsTotal: u.earningsTotal || 0,
        totalSessions: u.totalSessions || 0,
        ratingAvg: u.ratingAvg || 0,
        ratingCount: u.ratingCount || 0,
        upcomingConfirmed: upcoming,
        completedBookings: completed,
        revenueByMonth: byMonth,
        ratingDistribution: ratingDist,
      },
    });
  }
);

module.exports = router;
