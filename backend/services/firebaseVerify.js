const https = require("https");

let admin = null;
try {
  admin = require("firebase-admin");
} catch (_) {
  admin = null;
}

const TOKENINFO = "https://oauth2.googleapis.com/tokeninfo?id_token=";

let firebaseApp = null;

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (_) {
            reject(new Error("Invalid Firebase token response"));
          }
        });
      })
      .on("error", reject);
  });
}

function expectedAudiences(expectedAud) {
  return (process.env.FIREBASE_AUDIENCES || expectedAud || process.env.FIREBASE_PROJECT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getFirebaseApp() {
  if (!admin) return null;
  if (firebaseApp) return firebaseApp;
  if (admin.apps.length) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || "ideasphere-web";
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const options = { projectId };

  if (serviceAccountJson) {
    try {
      options.credential = admin.credential.cert(JSON.parse(serviceAccountJson));
    } catch (err) {
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    options.credential = admin.credential.applicationDefault();
  }

  firebaseApp = admin.initializeApp(options);
  return firebaseApp;
}

async function verifyWithTokenInfo(idToken) {
  const { status, json } = await httpGetJson(TOKENINFO + encodeURIComponent(idToken));
  if (status !== 200 || json.error) {
    const err = new Error(json.error_description || json.error || "Invalid Firebase token");
    err.status = 401;
    err.code = "FIREBASE_TOKEN_INVALID";
    throw err;
  }
  return {
    uid: json.user_id || json.sub,
    email: json.email || "",
    email_verified: json.email_verified === "true" || json.email_verified === true,
    aud: json.aud,
  };
}

async function verifyFirebaseIdToken(idToken, expectedAud) {
  if (!idToken || typeof idToken !== "string") {
    const err = new Error("Missing Firebase token");
    err.status = 401;
    err.code = "FIREBASE_TOKEN_MISSING";
    throw err;
  }

  let decoded;
  const app = getFirebaseApp();
  if (app) {
    try {
      decoded = await app.auth().verifyIdToken(idToken, false);
    } catch (err) {
      const out = new Error("Invalid Firebase token");
      out.status = 401;
      out.code = "FIREBASE_TOKEN_INVALID";
      throw out;
    }
  } else {
    decoded = await verifyWithTokenInfo(idToken);
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
