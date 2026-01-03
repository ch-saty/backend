import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        // social
        "like",
        "comment",
        "follow",

        // orders
        "order",
        "order_status",
        "order_cancelled",

        // special requests
        "special_request",
        "special_request_accepted",
        "special_request_rejected",

        // ratings
        "rating",
      ],
      required: true,
      index: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },

    loop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loop",
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
