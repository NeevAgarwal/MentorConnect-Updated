const jwt = require("jsonwebtoken");

function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ success: false, error: "Server JWT_SECRET not configured" });
  }
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: "Authorization required" });
  }
  try {
    const payload = jwt.verify(token, secret);
    req.auth = { uid: payload.uid, email: payload.email || "" };
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired session" });
  }
}

function optionalAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;
  const token = getBearerToken(req);
  if (!secret || !token) {
    req.auth = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, secret);
    req.auth = { uid: payload.uid, email: payload.email || "" };
  } catch {
    req.auth = null;
  }
  next();
}

function requireSelfOrAdmin(paramName = "firebaseUID") {
  return async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ success: false, error: "Unauthorized" });
    const target = req.params[paramName];
    if (req.auth.uid === target) return next();
    const User = require("../models/User");
    const u = await User.findOne({ firebaseUID: req.auth.uid }).lean();
    if (u && u.isAdmin) return next();
    return res.status(403).json({ success: false, error: "Forbidden" });
  };
}

module.exports = {
  getBearerToken,
  requireAuth,
  optionalAuth,
  requireSelfOrAdmin,
};
