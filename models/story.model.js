import mongoose from "mongoose";

const storySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    mediaType: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
    media: {
      type: String,
      required: true,
    },
    viewers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: String,
      },
    ],
    isHighlighted: { type: Boolean, default: false },

    expiresAt: { type: Date, index: true },
    createdAt: {
      type: Date,
      default: Date.now(),
      expires: 86400,
    },
  },
  { timestamps: true }
);

const Story=mongoose.model("Story",storySchema)
export default Story

