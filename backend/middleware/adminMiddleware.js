const User = require("../models/User");

async function requireAdmin(req, res, next) {
  if (!req.auth) return res.status(401).json({ success: false, error: "Unauthorized" });
  const u = await User.findOne({ firebaseUID: req.auth.uid });
  if (!u || !u.isAdmin) {
    return res.status(403).json({ success: false, error: "Admin only" });
  }
  req.adminUser = u;
  next();
}

module.exports = { requireAdmin };
