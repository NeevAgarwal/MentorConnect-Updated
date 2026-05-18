const nodemailer = require("nodemailer");

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const transport = createTransport();

async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@mentorconnect.local";
  if (!transport) {
    console.log("[email] (no SMTP configured) would send:", subject, "→", to);
    return { skipped: true };
  }
  await transport.sendMail({
    from,
    to,
    subject,
    text: text || "",
    html: html || text || "",
  });
  return { sent: true };
}

async function sendWelcomeEmail(to, name) {
  return sendMail({
    to,
    subject: "Welcome to MentorConnect",
    html: `<p>Hi ${escape(name)},</p><p>Welcome to MentorConnect. Complete your profile to get started.</p>`,
  });
}

async function sendBookingConfirmation(to, details) {
  const { mentorName, studentName, startTime, meetingLink, status } = details;
  return sendMail({
    to,
    subject: `Booking ${status === "confirmed" ? "confirmed" : "update"} — MentorConnect`,
    html: `<p>Hi ${escape(studentName)},</p>
      <p>Your session with <strong>${escape(mentorName)}</strong> is <strong>${escape(status)}</strong>.</p>
      <p>Start: ${escape(startTime)}</p>
      ${meetingLink ? `<p><a href="${escapeAttr(meetingLink)}">Join session</a></p>` : ""}`,
  });
}

async function sendPasswordResetNotice(to) {
  return sendMail({
    to,
    subject: "Password reset requested",
    text: "If you did not request a password reset, you can ignore this email.",
  });
}

function escape(s) {
  return String(s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

module.exports = {
  sendMail,
  sendWelcomeEmail,
  sendBookingConfirmation,
  sendPasswordResetNotice,
};
