const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/jpeg|image\/png|image\/webp|image\/gif|application\/pdf)$/.test(file.mimetype);
    if (!ok) return cb(new Error("Only images and PDF allowed"));
    cb(null, true);
  },
});

router.post("/profile-image", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: "No file" });
  const publicUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: publicUrl });
});

router.post("/document", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: "No file" });
  const publicUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: publicUrl });
});

module.exports = router;
