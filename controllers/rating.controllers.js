import Rating from "../models/rating.model.js";
import Order from "../models/order.model.js";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import { getChefLevel } from "../utils/chefLevel.utils.js";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";

export const rateOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { stars, review } = req.body;

  if (!stars || stars < 1 || stars > 5) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Stars must be between 1 and 5",
    });
  }

  const order = await Order.findById(orderId);
  if (!order || order.status !== "completed") {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Order not completed or not found",
    });
  }

  if (order.user.toString() !== req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Not authorized to rate this order",
    });
  }

  const existing = await Rating.findOne({ order: orderId });
  if (existing) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Order already rated",
    });
  }

  const rating = await Rating.create({
    order: orderId,
    post: order.post,
    chef: order.chef,
    user: order.user,
    stars,
    review,
  });

  // ---------- UPDATE POST AVG RATING ----------
  const ratings = await Rating.find({ post: order.post });
  const avgRating =
    ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;

  await Post.findByIdAndUpdate(order.post, {
    "stats.avgRating": Number(avgRating.toFixed(2)),
  });

  // ---------- UPDATE CHEF TRUST ----------
  const chef = await User.findById(order.chef);
  let increment = stars;
  if (stars === 5) increment += 5;

  chef.chefRating += increment;
  chef.chefLevel = getChefLevel(chef.chefRating);
  await chef.save();

  return sendResponse(res, {
    message: "Rating submitted successfully",
    data: {
      stars,
      chefRating: chef.chefRating,
      chefLevel: chef.chefLevel,
    },
  });
});
