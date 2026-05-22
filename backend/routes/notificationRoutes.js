const express = require("express");
const { body, param, validationResult } = require("express-validator");
const Notification = require("../models/Notification");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/mine", requireAuth, async (req, res) => {
  const list = await Notification.find({ userFirebaseUID: req.auth.uid })
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();
  const unread = await Notification.countDocuments({ userFirebaseUID: req.auth.uid, read: false });
  res.json({ success: true, notifications: list, unread });
});

router.patch("/:id/read", requireAuth, param("id").isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, userFirebaseUID: req.auth.uid },
    { $set: { read: true } },
    { new: true }
  );
  if (!n) return res.status(404).json({ success: false, error: "Not found" });
  res.json({ success: true, notification: n });
});

router.post("/mark-all-read", requireAuth, async (req, res) => {
  await Notification.updateMany({ userFirebaseUID: req.auth.uid, read: false }, { $set: { read: true } });
  res.json({ success: true });
});

router.delete("/mine", requireAuth, async (req, res) => {
  await Notification.deleteMany({ userFirebaseUID: req.auth.uid });
  res.json({ success: true });
});

module.exports = router;
