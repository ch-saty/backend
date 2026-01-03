import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    userName: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },

    profileImage: String,
    bio: String,
    profession: String,
    gender: String,

    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    loops: [{ type: mongoose.Schema.Types.ObjectId, ref: "Loop" }],
    saved: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],

    // ---------- CHEF TRUST ----------
    chefRating: {
      type: Number,
      default: 100,
      index: true,
    },

    chefLevel: {
      type: String,
      enum: ["Sous Chef", "Master Chef", "Michelin", "Legendary"],
      default: "Sous Chef",
    },

    isOtpVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
