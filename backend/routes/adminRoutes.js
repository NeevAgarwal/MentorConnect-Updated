const express = require("express");
const { body, param, validationResult } = require("express-validator");
const User = require("../models/User");
const Booking = require("../models/Booking");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/overview", async (req, res) => {
  const [users, mentors, students, bookings, revenue] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "mentor" }),
    User.countDocuments({ role: "student" }),
    Booking.countDocuments(),
    Booking.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, sum: { $sum: "$priceAtBooking" } } },
    ]),
  ]);
  res.json({
    success: true,
    analytics: {
      users,
      mentors,
      students,
      bookings,
      revenueCompleted: revenue[0]?.sum || 0,
    },
  });
});

router.get("/users", async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 }).limit(500).lean();
  res.json({ success: true, users });
});

router.get("/bookings", async (req, res) => {
  const bookings = await Booking.find({}).sort({ startTime: -1 }).limit(500).lean();
  res.json({ success: true, bookings });
});

router.patch(
  "/users/:firebaseUID/ban",
  param("firebaseUID").isString(),
  body("banned").isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    if (req.params.firebaseUID === req.auth.uid) {
      return res.status(400).json({ success: false, error: "Cannot ban self" });
    }
    const u = await User.findOneAndUpdate(
      { firebaseUID: req.params.firebaseUID },
      { $set: { banned: req.body.banned } },
      { new: true }
    );
    if (!u) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, user: u });
  }
);

router.delete("/users/:firebaseUID", param("firebaseUID").isString(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  if (req.params.firebaseUID === req.auth.uid) {
    return res.status(400).json({ success: false, error: "Cannot delete self" });
  }
  await User.deleteOne({ firebaseUID: req.params.firebaseUID });
  res.json({ success: true });
});

router.patch(
  "/users/:firebaseUID/featured",
  param("firebaseUID").isString(),
  body("featured").isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const u = await User.findOneAndUpdate(
      { firebaseUID: req.params.firebaseUID, role: "mentor" },
      { $set: { featured: req.body.featured } },
      { new: true }
    );
    if (!u) return res.status(404).json({ success: false, error: "Mentor not found" });
    res.json({ success: true, user: u });
  }
);

module.exports = router;
