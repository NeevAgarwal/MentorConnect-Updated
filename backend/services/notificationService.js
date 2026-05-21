const Notification = require("../models/Notification");

async function createNotification(userFirebaseUID, payload) {
  const notification = await Notification.create({ userFirebaseUID, ...payload });
  try {
    const { getIo } = require("../socket");
    const io = getIo();
    if (io) {
      io.to(`user:${userFirebaseUID}`).emit("notification:new", { notification: notification.toObject() });
    }
  } catch (_) {
    /* socket is optional for background jobs and tests */
  }
  return notification;
}

module.exports = { createNotification };
