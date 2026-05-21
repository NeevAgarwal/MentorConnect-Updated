const express = require("express");
const { query, body, validationResult } = require("express-validator");
const Message = require("../models/Message");
const User = require("../models/User");
const { requireAuth } = require("../middleware/authMiddleware");
const { createNotification } = require("../services/notificationService");

const router = express.Router();

function conversationIdFor(a, b) {
  return [a, b].sort().join("__");
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/conversations", requireAuth, async (req, res) => {
  const uid = req.auth.uid;
  const re = new RegExp(`^${escapeRegex(uid)}__|__${escapeRegex(uid)}$`);
  const convIds = await Message.distinct("conversationId", { conversationId: re });

  const rows = await Promise.all(
    convIds.map(async (cid) => {
      const last = await Message.findOne({ conversationId: cid }).sort({ createdAt: -1 }).lean();
      const other = cid.split("__").find((p) => p !== uid) || uid;
      const u = await User.findOne({ firebaseUID: other }).lean();
      return {
        conversationId: cid,
        otherUser: u || { firebaseUID: other, name: "User", profilePic: "", role: "student" },
        lastMessage: last,
        unreadCount: await Message.countDocuments({
          conversationId: cid,
          senderFirebaseUID: { $ne: uid },
          readBy: { $ne: uid },
        }),
      };
    })
  );

  rows.sort((a, b) => {
    const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return tb - ta;
  });

  res.json({ success: true, conversations: rows });
});

router.get(
  "/messages",
  requireAuth,
  query("withUser").isString().trim().isLength({ min: 5, max: 128 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const otherUser = await User.findOne({ firebaseUID: req.query.withUser, banned: { $ne: true } }).lean();
    if (!otherUser) return res.status(404).json({ success: false, error: "Recipient not found" });
    const cid = conversationIdFor(req.auth.uid, req.query.withUser);
    const list = await Message.find({ conversationId: cid }).sort({ createdAt: 1 }).limit(200).lean();
    await Message.updateMany(
      { conversationId: cid, senderFirebaseUID: { $ne: req.auth.uid } },
      { $addToSet: { readBy: req.auth.uid } }
    );
    res.json({ success: true, messages: list, conversationId: cid });
  }
);

router.post(
  "/messages",
  requireAuth,
  body("toFirebaseUID").isString().trim().isLength({ min: 5, max: 128 }),
  body("text").isString().isLength({ min: 1, max: 4000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { toFirebaseUID, text } = req.body;
    if (toFirebaseUID === req.auth.uid) {
      return res.status(400).json({ success: false, error: "Invalid recipient" });
    }
    const recipient = await User.findOne({ firebaseUID: toFirebaseUID, banned: { $ne: true } }).lean();
    if (!recipient) return res.status(404).json({ success: false, error: "Recipient not found" });
    const cid = conversationIdFor(req.auth.uid, toFirebaseUID);
    const msg = await Message.create({
      conversationId: cid,
      senderFirebaseUID: req.auth.uid,
      text,
      readBy: [req.auth.uid],
    });

    try {
      const { getIo } = require("../socket");
      const io = getIo();
      if (io) {
        io.to(`user:${toFirebaseUID}`).emit("chat:message", { conversationId: cid, message: msg });
        io.to(`user:${req.auth.uid}`).emit("chat:message", { conversationId: cid, message: msg });
        io.to(`user:${toFirebaseUID}`).emit("chat:typing", { conversationId: cid, from: req.auth.uid, typing: false });
      }
    } catch (_) {
      /* socket optional */
    }

    await createNotification(toFirebaseUID, {
      type: "message",
      title: "New message",
      body: text.slice(0, 120),
      meta: { conversationId: cid, from: req.auth.uid },
    });

    res.status(201).json({ success: true, message: msg });
  }
);

module.exports = router;
