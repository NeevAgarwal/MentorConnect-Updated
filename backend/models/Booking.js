const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    studentFirebaseUID: { type: String, required: true, index: true },
    mentorFirebaseUID: { type: String, required: true, index: true },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected", "cancelled", "completed"],
      default: "pending",
      index: true,
    },
    topic: { type: String, default: "", maxlength: 280 },
    meetingLink: { type: String, default: "" },
    priceAtBooking: { type: Number, default: 0, min: 0 },
    mentorNotes: { type: String, default: "", maxlength: 500 },
    rescheduleOf: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    reminder1hSent: { type: Boolean, default: false },
    usedPublishedSlot: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BookingSchema.index(
  { mentorFirebaseUID: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "confirmed"] } },
  }
);

module.exports = mongoose.model("Booking", BookingSchema);
