const http = require("http");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
require("dotenv").config();

const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminRoutes = require("./routes/adminRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const { initSocket } = require("./socket");

const app = express();
const httpServer = http.createServer(app);

app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(",").map((s) => s.trim()) : true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1.2mb" }));
app.use(mongoSanitize());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 400),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 80),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication attempts", error: "Too many authentication attempts" },
});
app.use("/api/auth", authLimiter);
app.use("/api/users/register", authLimiter);

const uploadsPath = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsPath));

app.get("/", (_req, res) => {
  res.json({ status: "MentorConnect API running", version: "2.0" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);

app.use((err, _req, res, _next) => {
  if (err && err.name === "MulterError") {
    return res.status(400).json({ success: false, message: err.message, error: err.message });
  }
  if (err && err.message === "Only images and PDF allowed") {
    return res.status(400).json({ success: false, message: err.message, error: err.message });
  }
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error", error: "Internal server error" });
});

async function sendSessionReminders() {
  const Booking = require("./models/Booking");
  const { createNotification } = require("./services/notificationService");
  const now = Date.now();
  const windowStart = new Date(now + 50 * 60 * 1000);
  const windowEnd = new Date(now + 70 * 60 * 1000);
  const due = await Booking.find({
    status: "confirmed",
    reminder1hSent: { $ne: true },
    startTime: { $gte: windowStart, $lte: windowEnd },
  }).limit(50);

  for (const b of due) {
    await createNotification(b.studentFirebaseUID, {
      type: "reminder",
      title: "Session starting soon",
      body: `Your session begins at ${b.startTime.toISOString()}`,
      meta: { bookingId: String(b._id) },
    });
    await createNotification(b.mentorFirebaseUID, {
      type: "reminder",
      title: "Session starting soon",
      body: `You have a session at ${b.startTime.toISOString()}`,
      meta: { bookingId: String(b._id) },
    });
    b.reminder1hSent = true;
    await b.save();
  }
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    initSocket(httpServer);
    setInterval(() => {
      sendSessionReminders().catch((e) => console.error("reminder job", e));
    }, 15 * 60 * 1000);

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB Error:", err);
    process.exit(1);
  });
