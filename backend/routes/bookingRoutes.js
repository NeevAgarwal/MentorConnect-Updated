const express = require("express");
const mongoose = require("mongoose");
const { body, param, validationResult } = require("express-validator");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { requireAuth, requireStudent } = require("../middleware/authMiddleware");
const { sendBookingConfirmation } = require("../services/emailService");
const { createNotification } = require("../services/notificationService");

const router = express.Router();

function jitsiLink(bookingId) {
  const room = `MentorConnect-${String(bookingId)}`;
  return `https://meet.jit.si/${encodeURIComponent(room)}#config.prejoinPageEnabled=false`;
}

async function notifyUser(uid, payload) {
  await createNotification(uid, payload);
}

async function sendBookingEmailSafe(to, details) {
  if (!to) return;
  try {
    await sendBookingConfirmation(to, details);
  } catch (err) {
    console.warn("[booking] email notification skipped:", err.message || err);
  }
}

function transactionUnsupported(err) {
  const msg = String(err?.message || "");
  return /Transaction numbers|replica set member|mongos|transactions are not supported/i.test(msg);
}

async function createBookingCore({ studentFirebaseUID, mentorFirebaseUID, start, end, topic, mentor, usedPublishedSlot }, session) {
  const query = Booking.findOne({
    mentorFirebaseUID,
    status: { $in: ["pending", "confirmed"] },
    startTime: { $lt: end },
    endTime: { $gt: start },
  });
  const overlap = session ? await query.session(session) : await query;
  if (overlap) throw new Error("DOUBLE_BOOK");

  const payload = {
    studentFirebaseUID,
    mentorFirebaseUID,
    startTime: start,
    endTime: end,
    status: "pending",
    topic: topic || "",
    meetingLink: "",
    priceAtBooking: mentor.pricePerSession || 0,
    usedPublishedSlot,
  };

  let created;
  if (session) {
    const docs = await Booking.create([payload], { session });
    created = docs[0];
  } else {
    created = await Booking.create(payload);
  }

  if (usedPublishedSlot) {
    const update = User.updateOne({ firebaseUID: mentorFirebaseUID }, { $pull: { bookableSlots: start } });
    if (session) await update.session(session);
    else await update;
  }

  return created;
}

async function releasePublishedSlot(booking) {
  if (!booking.usedPublishedSlot) return;
  await User.updateOne(
    { firebaseUID: booking.mentorFirebaseUID },
    { $addToSet: { bookableSlots: booking.startTime } }
  );
}

router.post(
  "/",
  requireAuth,
  requireStudent,
  body("mentorFirebaseUID").isString().trim().isLength({ min: 5, max: 128 }),
  body("startTime").isISO8601(),
  body("endTime").isISO8601(),
  body("topic").optional().isString().isLength({ max: 280 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const studentFirebaseUID = req.auth.uid;
    const { mentorFirebaseUID, startTime, endTime, topic } = req.body;

    if (mentorFirebaseUID === studentFirebaseUID) {
      return res.status(400).json({ success: false, error: "Cannot book yourself" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!(start < end)) {
      return res.status(400).json({ success: false, error: "Invalid time range" });
    }
    if (start <= new Date()) {
      return res.status(400).json({ success: false, error: "Start time must be in the future" });
    }

    const mentor = await User.findOne({ firebaseUID: mentorFirebaseUID, role: "mentor", banned: { $ne: true } });
    if (!mentor) {
      return res.status(404).json({ success: false, error: "Mentor not found" });
    }

    const mentorSlots = mentor.bookableSlots || [];
    const usedPublishedSlot = mentorSlots.some((d) => new Date(d).getTime() === start.getTime());
    const slotOk = usedPublishedSlot || mentorSlots.length === 0;

    if (mentorSlots.length > 0 && !slotOk) {
      return res.status(400).json({ success: false, error: "Selected slot is not available" });
    }

    let created;
    const bookingArgs = { studentFirebaseUID, mentorFirebaseUID, start, end, topic, mentor, usedPublishedSlot };
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        created = await createBookingCore(bookingArgs, session);
      });
    } catch (e) {
      if (e.message === "DOUBLE_BOOK" || e.code === 11000) {
        return res.status(409).json({ success: false, error: "Slot already booked" });
      }
      if (transactionUnsupported(e)) {
        try {
          created = await createBookingCore(bookingArgs, null);
        } catch (fallbackErr) {
          if (fallbackErr.message === "DOUBLE_BOOK" || fallbackErr.code === 11000) {
            return res.status(409).json({ success: false, error: "Slot already booked" });
          }
          return res.status(500).json({ success: false, error: fallbackErr.message });
        }
      } else {
        return res.status(500).json({ success: false, error: e.message });
      }
    } finally {
      await session.endSession();
    }

    if (!created) {
      return res.status(500).json({ success: false, error: "Booking create failed" });
    }

    await notifyUser(mentorFirebaseUID, {
      type: "booking",
      title: "New booking request",
      body: `A student requested a session on ${created.startTime.toISOString()}`,
      meta: { bookingId: String(created._id) },
    });
    await notifyUser(studentFirebaseUID, {
      type: "booking",
      title: "Booking submitted",
      body: "Your mentor will confirm shortly.",
      meta: { bookingId: String(created._id) },
    });

    const student = await User.findOne({ firebaseUID: studentFirebaseUID });
    await sendBookingEmailSafe(student?.email, {
      mentorName: mentor.name,
      studentName: student?.name || "Student",
      startTime: created.startTime.toISOString(),
      meetingLink: "",
      status: "pending",
    });

    return res.status(201).json({ success: true, booking: created });
  }
);

router.get("/mine", requireAuth, async (req, res) => {
  const uid = req.auth.uid;
  const list = await Booking.find({
    $or: [{ studentFirebaseUID: uid }, { mentorFirebaseUID: uid }],
  })
    .sort({ startTime: -1 })
    .lean();
  const participantUids = [
    ...new Set(list.flatMap((b) => [b.studentFirebaseUID, b.mentorFirebaseUID]).filter(Boolean)),
  ];
  const users = await User.find({ firebaseUID: { $in: participantUids } })
    .select("firebaseUID name role profilePic")
    .lean();
  const userByUid = new Map(users.map((u) => [u.firebaseUID, u]));
  const bookings = list.map((b) => ({
    ...b,
    student: userByUid.get(b.studentFirebaseUID) || null,
    mentor: userByUid.get(b.mentorFirebaseUID) || null,
  }));
  res.json({ success: true, bookings });
});

router.patch(
  "/:id/status",
  requireAuth,
  param("id").isMongoId(),
  body("status").isIn(["confirmed", "rejected", "cancelled", "completed"]),
  body("mentorNotes").optional().isString().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: "Not found" });

    const uid = req.auth.uid;
    const isStudent = booking.studentFirebaseUID === uid;
    const isMentor = booking.mentorFirebaseUID === uid;

    if (req.body.status === "confirmed" || req.body.status === "rejected") {
      if (!isMentor || req.auth.role !== "mentor") return res.status(403).json({ success: false, error: "Mentor only" });
      if (!["pending"].includes(booking.status)) {
        return res.status(400).json({ success: false, error: "Invalid state transition" });
      }
    } else if (req.body.status === "cancelled") {
      if (!isStudent && !isMentor) return res.status(403).json({ success: false, error: "Forbidden" });
      if (["completed", "cancelled", "rejected"].includes(booking.status)) {
        return res.status(400).json({ success: false, error: "Cannot cancel" });
      }
    } else if (req.body.status === "completed") {
      if (!isMentor && !isStudent) return res.status(403).json({ success: false, error: "Forbidden" });
      if (booking.status !== "confirmed") {
        return res.status(400).json({ success: false, error: "Must be confirmed" });
      }
    }

    const prev = booking.status;
    booking.status = req.body.status;
    if (req.body.mentorNotes != null && isMentor) booking.mentorNotes = req.body.mentorNotes;

    if (req.body.status === "confirmed" && !booking.meetingLink) {
      booking.meetingLink = jitsiLink(booking._id);
    }

    await booking.save();

    if (req.body.status === "rejected" || req.body.status === "cancelled") {
      await releasePublishedSlot(booking);
    }

    if (req.body.status === "completed") {
      await User.updateOne(
        { firebaseUID: booking.mentorFirebaseUID },
        { $inc: { totalSessions: 1, earningsTotal: booking.priceAtBooking || 0 } }
      );
    }

    await notifyUser(booking.studentFirebaseUID, {
      type: "mentor_decision",
      title: "Booking update",
      body: `Status: ${booking.status}`,
      meta: { bookingId: String(booking._id) },
    });
    await notifyUser(booking.mentorFirebaseUID, {
      type: "mentor_decision",
      title: "Booking update",
      body: `Status: ${booking.status}`,
      meta: { bookingId: String(booking._id) },
    });

    const student = await User.findOne({ firebaseUID: booking.studentFirebaseUID });
    const mentorUser = await User.findOne({ firebaseUID: booking.mentorFirebaseUID });
    await sendBookingEmailSafe(student?.email, {
      mentorName: mentorUser?.name || "Mentor",
      studentName: student?.name || "Student",
      startTime: booking.startTime.toISOString(),
      meetingLink: booking.meetingLink,
      status: booking.status,
    });

    res.json({ success: true, booking });
  }
);

router.patch(
  "/:id/reschedule",
  requireAuth,
  param("id").isMongoId(),
  body("startTime").isISO8601(),
  body("endTime").isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: "Not found" });
    if (booking.mentorFirebaseUID !== req.auth.uid || req.auth.role !== "mentor") {
      return res.status(403).json({ success: false, error: "Mentor only" });
    }
    if (!["pending", "confirmed"].includes(booking.status)) {
      return res.status(400).json({ success: false, error: "Cannot reschedule" });
    }

    const start = new Date(req.body.startTime);
    const end = new Date(req.body.endTime);
    if (!(start < end)) {
      return res.status(400).json({ success: false, error: "Invalid time range" });
    }
    if (start <= new Date()) {
      return res.status(400).json({ success: false, error: "Start time must be in the future" });
    }
    const overlap = await Booking.findOne({
      _id: { $ne: booking._id },
      mentorFirebaseUID: booking.mentorFirebaseUID,
      status: { $in: ["pending", "confirmed"] },
      startTime: { $lt: end },
      endTime: { $gt: start },
    });
    if (overlap) return res.status(409).json({ success: false, error: "Slot conflict" });

    await releasePublishedSlot(booking);

    booking.startTime = start;
    booking.endTime = end;
    booking.meetingLink = jitsiLink(booking._id);
    booking.usedPublishedSlot = false;
    await booking.save();

    await notifyUser(booking.studentFirebaseUID, {
      type: "booking",
      title: "Session rescheduled",
      body: `New start: ${start.toISOString()}`,
      meta: { bookingId: String(booking._id) },
    });

    res.json({ success: true, booking });
  }
);

module.exports = router;
