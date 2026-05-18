const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    senderFirebaseUID: { type: String, required: true, index: true },
    text: { type: String, required: true, maxlength: 4000 },
    readBy: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);
