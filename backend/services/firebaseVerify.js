const fs = require("fs");
const admin = require("firebase-admin");

let firebaseApp = null;

function expectedAudiences(expectedAud) {
  return (process.env.FIREBASE_AUDIENCES || expectedAud || process.env.FIREBASE_PROJECT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeServiceAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const serviceAccount = { ...raw };
  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
  return serviceAccount;
}

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return normalizeServiceAccount(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } catch (_) {
      const err = new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
      err.status = 500;
      err.code = "FIREBASE_ADMIN_CONFIG_INVALID";
      throw err;
    }
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath && fs.existsSync(credentialsPath)) {
    try {
      return normalizeServiceAccount(JSON.parse(fs.readFileSync(credentialsPath, "utf8")));
    } catch (_) {
      const err = new Error("Invalid GOOGLE_APPLICATION_CREDENTIALS service account file");
      err.status = 500;
      err.code = "FIREBASE_ADMIN_CONFIG_INVALID";
      throw err;
    }
  }

  return null;
}

function firebaseProjectId(serviceAccount) {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    (serviceAccount && serviceAccount.project_id) ||
    "ideasphere-web"
  );
}

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  if (admin.apps.length) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const serviceAccount = loadServiceAccount();
  const projectId = firebaseProjectId(serviceAccount);
  const options = { projectId };

  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    options.credential = admin.credential.applicationDefault();
  }

  firebaseApp = admin.initializeApp(options);
  return firebaseApp;
}

async function verifyFirebaseIdToken(idToken, expectedAud) {
  if (!idToken || typeof idToken !== "string") {
    const err = new Error("Missing Firebase token");
    err.status = 401;
    err.code = "FIREBASE_TOKEN_MISSING";
    throw err;
  }

  let decoded;
  try {
    decoded = await admin.auth(getFirebaseApp()).verifyIdToken(idToken, false);
  } catch (err) {
    if (err && err.code === "FIREBASE_ADMIN_CONFIG_INVALID") {
      throw err;
    }
    const out = new Error("Invalid Firebase token");
    out.status = 401;
    out.code = "FIREBASE_TOKEN_INVALID";
    out.cause = err;
    throw out;
  }

  const audiences = expectedAudiences(expectedAud);
  if (audiences.length && !audiences.includes(decoded.aud)) {
    const err = new Error("Firebase token audience mismatch");
    err.status = 401;
    err.code = "FIREBASE_AUDIENCE_MISMATCH";
    throw err;
  }

  const uid = decoded.uid || decoded.user_id || decoded.sub;
  if (!uid) {
    const err = new Error("Firebase token missing user id");
    err.status = 401;
    err.code = "FIREBASE_UID_MISSING";
    throw err;
  }

  return {
    uid,
    email: decoded.email || "",
    emailVerified: !!decoded.email_verified,
    aud: decoded.aud,
  };
}

module.exports = { verifyFirebaseIdToken };
