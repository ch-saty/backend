import mongoose from "mongoose";
import SpecialRequest from "../models/specialRequest.model.js";
import Post from "../models/post.model.js";
import Order from "../models/order.model.js";
import Notification from "../models/notification.model.js";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";
import { getSocketId, io } from "../socket.js";

export const createSpecialRequest = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { quantity, message } = req.body;

  if (!quantity || !message) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Quantity and message are required",
    });
  }

  const post = await Post.findById(postId);
  if (!post) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Post not found",
    });
  }

  // self-request block
  if (post.author.toString() === req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "You cannot request your own dish",
    });
  }

  // must be AFTER 1 hour window
  const oneHourLater = new Date(post.createdAt).getTime() + 60 * 60 * 1000;

  if (Date.now() <= oneHourLater) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Special requests allowed only after order window closes",
    });
  }

  const request = await SpecialRequest.create({
    post: postId,
    chef: post.author,
    user: req.userId,
    quantity,
    message,
  });

  // notify chef
  const notification = await Notification.create({
    sender: req.userId,
    receiver: post.author,
    type: "special_request",
    message: "sent a special request for your dish",
  });

  const receiverSocketId = getSocketId(post.author);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("newSpecialRequest", request);
  }

  return sendResponse(res, {
    code: 201,
    message: "Special request sent successfully",
    data: request,
  });
});
export const respondToSpecialRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { action, deliveryAddress, phone } = req.body;

  if (!["accept", "reject"].includes(action)) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Invalid action",
    });
  }

  const request = await SpecialRequest.findById(requestId);
  if (!request || request.status !== "pending") {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Request not found or already handled",
    });
  }

  if (request.chef.toString() !== req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Not authorized",
    });
  }

  if (action === "reject") {
    request.status = "rejected";
    await request.save();

    return sendResponse(res, {
      message: "Special request rejected",
    });
  }

  // ACCEPT FLOW
  const session = await mongoose.startSession();
  session.startTransaction();

  const post = await Post.findOneAndUpdate(
    {
      _id: request.post,
      availableServings: { $gte: request.quantity },
    },
    {
      $inc: {
        availableServings: -request.quantity,
        "stats.ordersCount": 1,
      },
    },
    { new: true, session }
  );

  if (!post) {
    await session.abortTransaction();
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Not enough servings available",
    });
  }

  const order = await Order.create(
    [
      {
        post: request.post,
        chef: request.chef,
        user: request.user,
        quantity: request.quantity,
        pricePerServing: post.pricePerServing,
        totalAmount: request.quantity * post.pricePerServing,
        deliveryAddress,
        phone,
      },
    ],
    { session }
  );

  request.status = "accepted";
  await request.save({ session });

  await session.commitTransaction();

  // notify user
  const notification = await Notification.create({
    sender: req.userId,
    receiver: request.user,
    type: "special_request_accepted",
    message: "Your special request was accepted",
  });

  const receiverSocketId = getSocketId(request.user);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("specialRequestAccepted", order[0]);
  }

  return sendResponse(res, {
    message: "Special request accepted and order created",
    data: order[0],
  });
});
