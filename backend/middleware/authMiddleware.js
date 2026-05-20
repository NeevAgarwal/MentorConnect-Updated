const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_ISSUER = process.env.JWT_ISSUER || "mentorconnect-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "mentorconnect-client";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function authError(res, status, message, code) {
  return res.status(status).json({
    success: false,
    message,
    error: message,
    code,
  });
}

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function signAuthToken(user) {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET not configured");
  return jwt.sign(
    {
      uid: user.firebaseUID,
      email: user.email || "",
      role: user.role || "student",
      isAdmin: !!user.isAdmin,
      typ: "mc_access",
    },
    secret,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

function verifyAuthToken(token) {
  const secret = getJwtSecret();
  if (!secret) {
    const err = new Error("JWT_SECRET not configured");
    err.code = "JWT_SECRET_MISSING";
    throw err;
  }
  const payload = jwt.verify(token, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (!payload || payload.typ !== "mc_access" || !payload.uid) {
    const err = new Error("Invalid session token");
    err.code = "TOKEN_INVALID";
    throw err;
  }
  return payload;
}

async function hydrateAuthenticatedUser(req, res, next, { required }) {
  const token = getBearerToken(req);
  if (!token) {
    req.auth = null;
    req.user = null;
    return required ? authError(res, 401, "Authorization required", "TOKEN_MISSING") : next();
  }

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch (err) {
    req.auth = null;
    req.user = null;
    if (!required) return next();
    if (err.code === "JWT_SECRET_MISSING") {
      return authError(res, 500, "Server authentication is not configured", "AUTH_CONFIG_ERROR");
    }
    if (err.name === "TokenExpiredError") {
      return authError(res, 401, "Session expired", "TOKEN_EXPIRED");
    }
    return authError(res, 401, "Invalid session", "TOKEN_INVALID");
  }

  const user = await User.findOne({ firebaseUID: payload.uid });
  if (!user) {
    req.auth = null;
    req.user = null;
    return required ? authError(res, 401, "Session user no longer exists", "USER_NOT_FOUND") : next();
  }
  if (user.banned) {
    req.auth = null;
    req.user = null;
    return required ? authError(res, 403, "Account suspended", "USER_BANNED") : next();
  }

  req.user = user;
  req.auth = {
    uid: user.firebaseUID,
    email: user.email || payload.email || "",
    role: user.role || "student",
    isAdmin: !!user.isAdmin,
    tokenExp: payload.exp || null,
    tokenIat: payload.iat || null,
  };
  return next();
}

function requireAuth(req, res, next) {
  return hydrateAuthenticatedUser(req, res, next, { required: true });
}

function optionalAuth(req, res, next) {
  return hydrateAuthenticatedUser(req, res, next, { required: false });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !req.user) {
      return authError(res, 401, "Authorization required", "TOKEN_MISSING");
    }
    if (!roles.includes(req.auth.role)) {
      return authError(res, 403, "Forbidden", "ROLE_FORBIDDEN");
    }
    return next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.auth || !req.user) return authError(res, 401, "Authorization required", "TOKEN_MISSING");
  if (!req.auth.isAdmin) return authError(res, 403, "Admin only", "ADMIN_REQUIRED");
  return next();
}

function requireMentor(req, res, next) {
  return requireRole("mentor")(req, res, next);
}

function requireStudent(req, res, next) {
  return requireRole("student")(req, res, next);
}

function requireSelfOrAdmin(paramName = "firebaseUID") {
  return (req, res, next) => {
    if (!req.auth) return authError(res, 401, "Authorization required", "TOKEN_MISSING");
    const target = req.params[paramName];
    if (req.auth.uid === target || req.auth.isAdmin) return next();
    return authError(res, 403, "Forbidden", "SELF_OR_ADMIN_REQUIRED");
  };
}

module.exports = {
  authError,
  getBearerToken,
  signAuthToken,
  verifyAuthToken,
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireMentor,
  requireStudent,
  requireSelfOrAdmin,
};
