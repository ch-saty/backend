import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ---------- MEDIA ----------
    mediaType: {
      type: String,
      enum: ["image"],
      default: "image",
    },

    media: [
      {
        type: String,
        required: true,
      },
    ],

    caption: {
      type: String,
      trim: true,
    },

    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
        index: true,
      },
    ],

    // Normalized primary dish identifier
    dishKey: {
      type: String,
      lowercase: true,
      index: true,
    },

    // ---------- POST TYPE ----------
    postType: {
      type: String,
      enum: ["informational", "cooking"],
      default: "informational",
    },

    status: {
      type: String,
      enum: ["draft", "published", "in_progress", "completed", "expired"],
      default: "published",
      index: true,
    },

    orderable: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ---------- COOKING FIELDS ----------
    pricePerServing: {
      type: Number,
      min: 0,
    },

    foodReadyTime: {
      type: Date,
      index: true,
    },

    totalServings: {
      type: Number,
      min: 1,
    },

    availableServings: {
      type: Number,
      min: 0,
    },

    // ---------- GEO ----------
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        index: "2dsphere",
      },
    },

    // ---------- ENGAGEMENT ----------
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    comments: [
      {
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        message: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // ---------- STATS (for feed ranking) ----------
    stats: {
      ordersCount: { type: Number, default: 0 },
      savedCount: { type: Number, default: 0 },
      likesCount: { type: Number, default: 0 },
      commentsCount: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// auto sync counts
postSchema.pre("save", function (next) {
  this.stats.likesCount = this.likes.length;
  this.stats.commentsCount = this.comments.length;
  next();
});

const Post = mongoose.model("Post", postSchema);
export default Post;
