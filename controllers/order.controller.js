dotenv.config();
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Post from "../models/post.model.js";
import Shop from "../models/shop.model.js";
import User from "../models/user.model.js";
import DeliveryAssignment from "../models/deliveryAssignment.model.js";
import Notification from "../models/notification.model.js";
import { sendDeliveryOtpMail } from "../utils/mail.js";
import RazorPay from "razorpay";
import dotenv from "dotenv";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";
import { getSocketId, io } from "../socket.js";

dotenv.config();

/* ================== RAZORPAY ================== */
const razorpay = new RazorPay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ======================================================
   POST BASED ORDER (SOCIAL / CHEF ORDER)
====================================================== */
export const placeOrder = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { quantity, deliveryAddress, phone } = req.body;

  if (!quantity || !deliveryAddress) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Missing fields",
    });
  }

  const post = await Post.findById(postId);
  if (!post || !post.orderable) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Not orderable",
    });
  }

  if (post.author.toString() === req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Self order not allowed",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  const freshPost = await Post.findOneAndUpdate(
    { _id: postId, availableServings: { $gte: quantity } },
    { $inc: { availableServings: -quantity, "stats.ordersCount": 1 } },
    { new: true, session },
  );

  if (!freshPost) {
    await session.abortTransaction();
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Not enough servings",
    });
  }

  const totalAmount = quantity * freshPost.pricePerServing;

  const order = await Order.create(
    [
      {
        post: postId,
        chef: freshPost.author,
        user: req.userId,
        quantity,
        pricePerServing: freshPost.pricePerServing,
        totalAmount,
        deliveryAddress,
        phone,
      },
    ],
    { session },
  );

  await session.commitTransaction();

  const notification = await Notification.create({
    sender: req.userId,
    receiver: freshPost.author,
    type: "order",
    message: "placed an order",
  });

  const chefSocket = getSocketId(freshPost.author);
  if (chefSocket) io.to(chefSocket).emit("newOrder", order[0]);

  return sendResponse(res, {
    code: 201,
    message: "Order placed",
    data: order[0],
  });
});

/* ======================================================
   CART / SHOP BASED ORDER
====================================================== */
export const placeShopOrder = asyncHandler(async (req, res) => {
  const { cartItems, paymentMethod, deliveryAddress, totalAmount } = req.body;

  if (!cartItems?.length) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Cart empty",
    });
  }

  const grouped = {};
  cartItems.forEach((i) => {
    if (!grouped[i.shop]) grouped[i.shop] = [];
    grouped[i.shop].push(i);
  });

  const shopOrders = await Promise.all(
    Object.keys(grouped).map(async (shopId) => {
      const shop = await Shop.findById(shopId).populate("owner");
      if (!shop) throw new Error("Shop not found");

      const items = grouped[shopId];
      const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

      return {
        shop: shop._id,
        owner: shop.owner._id,
        subtotal,
        shopOrderItems: items.map((i) => ({
          item: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
        })),
      };
    }),
  );

  if (paymentMethod === "online") {
    const razorOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    const order = await Order.create({
      user: req.userId,
      paymentMethod,
      deliveryAddress,
      totalAmount,
      shopOrders,
      razorpayOrderId: razorOrder.id,
      payment: false,
    });

    return sendResponse(res, { data: { razorOrder, orderId: order._id } });
  }

  const order = await Order.create({
    user: req.userId,
    paymentMethod,
    deliveryAddress,
    totalAmount,
    shopOrders,
  });

  return sendResponse(res, { code: 201, message: "Order placed", data: order });
});

/* ======================================================
   VERIFY PAYMENT
====================================================== */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_payment_id, orderId } = req.body;

  const payment = await razorpay.payments.fetch(razorpay_payment_id);
  if (!payment || payment.status !== "captured") {
    return sendResponse(res, { status: false, message: "Payment failed" });
  }

  const order = await Order.findById(orderId);
  order.payment = true;
  order.razorpayPaymentId = razorpay_payment_id;
  await order.save();

  return sendResponse(res, { message: "Payment verified", data: order });
});

/* ======================================================
   GET MY ORDERS (USER / OWNER / DELIVERY BOY)
====================================================== */
export const getMyOrders = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (user.role === "user") {
    const orders = await Order.find({ user: req.userId }).sort({
      createdAt: -1,
    });
    return sendResponse(res, { data: orders });
  }

  if (user.role === "owner") {
    const orders = await Order.find({ "shopOrders.owner": req.userId }).sort({
      createdAt: -1,
    });
    return sendResponse(res, { data: orders });
  }

  if (user.role === "deliveryBoy") {
    const orders = await Order.find({
      "shopOrders.assignedDeliveryBoy": req.userId,
    });
    return sendResponse(res, { data: orders });
  }
});

/* ======================================================
   UPDATE ORDER STATUS (OWNER)
====================================================== */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId, shopId } = req.params;
  const { status } = req.body;

  const order = await Order.findById(orderId);
  const shopOrder = order.shopOrders.find((o) => o.shop == shopId);
  shopOrder.status = status;
  await order.save();

  const userSocket = getSocketId(order.user);
  if (userSocket)
    io.to(userSocket).emit("orderStatusUpdated", { orderId, shopId, status });

  return sendResponse(res, { message: "Status updated" });
});

/* ======================================================
   DELIVERY BOY ASSIGNMENT
====================================================== */
export const getDeliveryBoyAssignment = asyncHandler(async (req, res) => {
  const assignments = await DeliveryAssignment.find({
    brodcastedTo: req.userId,
    status: "brodcasted",
  })
    .populate("order")
    .populate("shop");

  return sendResponse(res, { data: assignments });
});

/* ======================================================
   ACCEPT ORDER (DELIVERY BOY)
====================================================== */
export const acceptOrder = asyncHandler(async (req, res) => {
  const { assignmentId } = req.params;

  const assignment = await DeliveryAssignment.findById(assignmentId);
  assignment.assignedTo = req.userId;
  assignment.status = "assigned";
  assignment.acceptedAt = new Date();
  await assignment.save();

  return sendResponse(res, { message: "Order accepted" });
});

/* ======================================================
   SEND DELIVERY OTP
====================================================== */
export const sendDeliveryOtp = asyncHandler(async (req, res) => {
  const { orderId, shopOrderId } = req.body;

  const order = await Order.findById(orderId).populate("user");
  const shopOrder = order.shopOrders.id(shopOrderId);

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  shopOrder.deliveryOtp = otp;
  shopOrder.otpExpires = Date.now() + 5 * 60 * 1000;
  await order.save();

  await sendDeliveryOtpMail(order.user, otp);

  return sendResponse(res, { message: "OTP sent" });
});

/* ======================================================
   VERIFY DELIVERY OTP
====================================================== */
export const verifyDeliveryOtp = asyncHandler(async (req, res) => {
  const { orderId, shopOrderId, otp } = req.body;

  const order = await Order.findById(orderId);
  const shopOrder = order.shopOrders.id(shopOrderId);

  if (shopOrder.deliveryOtp !== otp || shopOrder.otpExpires < Date.now()) {
    return sendResponse(res, { status: false, message: "Invalid OTP" });
  }

  shopOrder.status = "delivered";
  shopOrder.deliveredAt = new Date();
  await order.save();

  await DeliveryAssignment.deleteOne({
    shopOrderId,
    order: orderId,
    assignedTo: shopOrder.assignedDeliveryBoy,
  });

  return sendResponse(res, { message: "Order delivered" });
});

/* ======================================================
   GET ORDER BY ID
====================================================== */
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId)
    .populate("user")
    .populate("shopOrders.shop")
    .populate("shopOrders.assignedDeliveryBoy")
    .populate("shopOrders.shopOrderItems.item");

  if (!order) return sendResponse(res, { status: false, message: "Not found" });

  return sendResponse(res, { data: order });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId);
  if (!order) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Order not found",
    });
  }

  // only the ordering user can cancel
  if (order.user.toString() !== req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Not authorized",
    });
  }

  // only before acceptance
  if (order.status !== "placed") {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Order can no longer be cancelled",
    });
  }

  order.status = "cancelled";
  await order.save();

  // restore servings
  await Post.findByIdAndUpdate(order.post, {
    $inc: { availableServings: order.quantity },
  });

  // 🔔 notify chef
  const notification = await Notification.create({
    sender: req.userId,
    receiver: order.chef,
    type: "order_cancelled",
    order: order._id,
    post: order.post,
    message: "cancelled the order",
  });

  const receiverSocketId = getSocketId(order.chef);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("orderCancelled", {
      orderId: order._id,
    });
  }

  return sendResponse(res, {
    message: "Order cancelled successfully",
  });
});
