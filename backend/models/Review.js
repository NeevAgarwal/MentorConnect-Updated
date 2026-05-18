const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    mentorFirebaseUID: { type: String, required: true, index: true },
    studentFirebaseUID: { type: String, required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 1200 },
  },
  { timestamps: true }
);

ReviewSchema.index({ mentorFirebaseUID: 1, studentFirebaseUID: 1 }, { unique: true });

module.exports = mongoose.model("Review", ReviewSchema);
