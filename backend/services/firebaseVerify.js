/**
 * Verifies a Firebase ID token using Google's tokeninfo endpoint.
 * No service account required; suitable for development and production
 * when outbound HTTPS is allowed.
 */
const https = require("https");

const TOKENINFO = "https://oauth2.googleapis.com/tokeninfo?id_token=";

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            reject(new Error("Invalid token response"));
          }
        });
      })
      .on("error", reject);
  });
}

/**
 * @param {string} idToken
 * @param {string} expectedAud - Firebase project ID (JWT aud claim)
 */
async function verifyFirebaseIdToken(idToken, expectedAud) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing id token");
  }
  const { status, json } = await httpGetJson(TOKENINFO + encodeURIComponent(idToken));
  if (status !== 200 || json.error) {
    throw new Error(json.error_description || json.error || "Invalid token");
  }
  const audiences = (process.env.FIREBASE_AUDIENCES || expectedAud || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (audiences.length && !audiences.includes(json.aud)) {
    throw new Error("Token audience mismatch");
  }
  const uid = json.user_id || json.sub;
  if (!uid) throw new Error("Token missing user id");
  return {
    uid,
    email: json.email || "",
    emailVerified: json.email_verified === "true" || json.email_verified === true,
  };
}

module.exports = { verifyFirebaseIdToken };
