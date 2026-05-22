const mongoose = require("mongoose");

const WeeklySlotSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    firebaseUID: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ["student", "mentor"], default: "student" },
    isAdmin: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },

    bio: { type: String, default: "", maxlength: 2000 },
    skills: { type: [String], default: [] },
    expertiseTags: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    goals: { type: [String], default: [] },
    domain: { type: String, default: "", trim: true, maxlength: 80 },

    profilePic: { type: String, default: "" },
    resumeUrl: { type: String, default: "" },

    linkedin: { type: String, default: "", maxlength: 500 },
    github: { type: String, default: "", maxlength: 500 },
    company: { type: String, default: "", maxlength: 120 },
    education: { type: String, default: "", maxlength: 160 },
    experience: { type: String, default: "", maxlength: 500 },
    experienceYears: { type: Number, default: 0, min: 0, max: 60 },
    languages: { type: [String], default: [] },
    timezone: { type: String, default: "", maxlength: 80 },
    availabilityStatus: {
      type: String,
      enum: ["open", "busy", "away"],
      default: "open",
    },
    responseRate: { type: Number, default: 96, min: 0, max: 100 },
    lastActiveAt: { type: Date, default: Date.now },
    streakCount: { type: Number, default: 0, min: 0 },
    learningProgress: { type: Number, default: 0, min: 0, max: 100 },

    pricePerSession: { type: Number, default: 0, min: 0, max: 100000 },
    currency: { type: String, default: "INR", maxlength: 8 },

    weeklyAvailability: { type: [WeeklySlotSchema], default: [] },
    /** Explicit bookable ISO start times (mentor-published slots) */
    bookableSlots: { type: [Date], default: [] },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    totalSessions: { type: Number, default: 0, min: 0 },
    profileViews: { type: Number, default: 0, min: 0 },
    earningsTotal: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1, domain: 1 });
UserSchema.index({ featured: -1, ratingAvg: -1 });

module.exports = mongoose.model("User", UserSchema);
