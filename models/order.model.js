import mongoose from "mongoose";

/* ---------- SHOP ORDER ITEM ---------- */
const shopOrderItemSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    name: String,
    price: Number,
    quantity: Number,
  },
  { timestamps: true },
);

/* ---------- SHOP ORDER ---------- */
const shopOrderSchema = new mongoose.Schema(
  {
    shop: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    subtotal: Number,

    shopOrderItems: [shopOrderItemSchema],

    status: {
      type: String,
      enum: ["pending", "preparing", "out of delivery", "delivered"],
      default: "pending",
    },

    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAssignment",
      default: null,
    },

    assignedDeliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    deliveryOtp: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/* ---------- MAIN ORDER ---------- */
const orderSchema = new mongoose.Schema(
  {
    /* existing fields */
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },

    chef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    quantity: { type: Number, required: true, min: 1 },
    pricePerServing: { type: Number, required: true },

    totalAmount: { type: Number, required: true },

    /* added from old model */
    paymentMethod: {
      type: String,
      enum: ["cod", "online"],
      default: "cod",
    },

    payment: {
      type: Boolean,
      default: false,
    },

    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },

    deliveryAddress: {
      text: String,
      latitude: Number,
      longitude: Number,
    },

    shopOrders: [shopOrderSchema],

    phone: String,

    status: {
      type: String,
      enum: [
        "placed",
        "accepted",
        "preparing",
        "ready",
        "completed",
        "cancelled",
      ],
      default: "placed",
      index: true,
    },
  },
  { timestamps: true },
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
