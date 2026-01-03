import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";
import { getSocketId, io } from "../socket.js";

/**
 * PLACE ORDER
 */
export const placeOrder = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { quantity, deliveryAddress, phone } = req.body;

  if (!quantity || !deliveryAddress) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Quantity and delivery address are required",
    });
  }

  const post = await Post.findById(postId);
  if (!post || !post.orderable) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "This dish cannot be ordered",
    });
  }

  // self-order prevention
  if (post.author.toString() === req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "You cannot order your own dish",
    });
  }

  // 1-hour ordering window
  const oneHourLater = new Date(post.createdAt).getTime() + 60 * 60 * 1000;
  if (Date.now() > oneHourLater) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Order window closed. You can send a special request instead.",
    });
  }

  // atomic serving check
  const session = await mongoose.startSession();
  session.startTransaction();

  const freshPost = await Post.findOneAndUpdate(
    {
      _id: postId,
      availableServings: { $gte: quantity },
    },
    {
      $inc: {
        availableServings: -quantity,
        "stats.ordersCount": 1,
      },
    },
    { new: true, session }
  );

  if (!freshPost) {
    await session.abortTransaction();
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Not enough servings available",
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
    { session }
  );

  await session.commitTransaction();

  // notify chef
  const notification = await Notification.create({
    sender: req.userId,
    receiver: freshPost.author,
    type: "order",
    message: "placed an order on your dish",
  });

  const receiverSocketId = getSocketId(freshPost.author);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("newOrder", order[0]);
  }

  return sendResponse(res, {
    code: 201,
    message: "Order placed successfully",
    data: order[0],
  });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Order not found",
    });
  }

  if (order.chef.toString() !== req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Not authorized",
    });
  }

  const validTransitions = {
    placed: ["accepted"],
    accepted: ["preparing"],
    preparing: ["ready"],
    ready: ["completed"],
  };

  if (!validTransitions[order.status]?.includes(status)) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Invalid order state transition",
    });
  }

  order.status = status;
  await order.save();

  // notify user
  const notification = await Notification.create({
    sender: req.userId,
    receiver: order.user,
    type: "order_status",
    message: `Your order is now ${status}`,
  });

  const receiverSocketId = getSocketId(order.user);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("orderStatusUpdated", order);
  }

  return sendResponse(res, {
    message: "Order status updated",
    data: order,
  });
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
