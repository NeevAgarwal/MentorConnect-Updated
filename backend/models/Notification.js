const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    userFirebaseUID: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["booking", "message", "reminder", "system", "mentor_decision"],
      default: "system",
    },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 1000 },
    read: { type: Boolean, default: false, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", NotificationSchema);
