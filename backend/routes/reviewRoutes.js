const express = require("express");
const { body, param, validationResult } = require("express-validator");
const Review = require("../models/Review");
const User = require("../models/User");
const Booking = require("../models/Booking");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

async function recalcMentor(mentorFirebaseUID) {
  const agg = await Review.aggregate([
    { $match: { mentorFirebaseUID } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const row = agg[0];
  await User.updateOne(
    { firebaseUID: mentorFirebaseUID },
    {
      ratingAvg: row ? Math.round(row.avg * 10) / 10 : 0,
      ratingCount: row ? row.count : 0,
    }
  );
}

router.get("/mentor/:mentorFirebaseUID", param("mentorFirebaseUID").isString(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  const list = await Review.find({ mentorFirebaseUID: req.params.mentorFirebaseUID })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const users = await User.find({
    firebaseUID: { $in: list.map((r) => r.studentFirebaseUID) },
  }).lean();
  const nameMap = Object.fromEntries(users.map((u) => [u.firebaseUID, u.name]));
  const enriched = list.map((r) => ({
    ...r,
    studentName: nameMap[r.studentFirebaseUID] || "Student",
  }));
  res.json({ success: true, reviews: enriched });
});

router.post(
  "/",
  requireAuth,
  body("mentorFirebaseUID").isString().trim(),
  body("rating").isInt({ min: 1, max: 5 }),
  body("comment").optional().isString().isLength({ max: 1200 }),
  body("bookingId").optional().custom((v) => !v || /^[a-f0-9]{24}$/i.test(String(v))),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const studentFirebaseUID = req.auth.uid;
    const { mentorFirebaseUID, rating, comment, bookingId } = req.body;

    if (mentorFirebaseUID === studentFirebaseUID) {
      return res.status(400).json({ success: false, error: "Invalid" });
    }

    if (bookingId) {
      const b = await Booking.findById(bookingId);
      if (!b || b.studentFirebaseUID !== studentFirebaseUID || b.mentorFirebaseUID !== mentorFirebaseUID) {
        return res.status(400).json({ success: false, error: "Invalid booking" });
      }
      if (b.status !== "completed") {
        return res.status(400).json({ success: false, error: "Complete the session before reviewing" });
      }
    }

    const doc = await Review.findOneAndUpdate(
      { mentorFirebaseUID, studentFirebaseUID },
      { $set: { rating, comment: comment || "", bookingId: bookingId || null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await recalcMentor(mentorFirebaseUID);
    res.status(201).json({ success: true, review: doc });
  }
);

router.delete("/:id", requireAuth, param("id").isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  const r = await Review.findById(req.params.id);
  if (!r) return res.status(404).json({ success: false, error: "Not found" });
  if (r.studentFirebaseUID !== req.auth.uid) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  const mentor = r.mentorFirebaseUID;
  await r.deleteOne();
  await recalcMentor(mentor);
  res.json({ success: true });
});

module.exports = router;
