import uploadOnCloudinary from "../config/cloudinary.js";
import Notification from "../models/notification.model.js";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import { getSocketId, io } from "../socket.js";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";

export const uploadPost = asyncHandler(async (req, res) => {
  const {
    caption,
    tags = [],
    pricePerServing,
    foodReadyTime,
    totalServings,
    latitude,
    longitude,
  } = req.body;

  if (!req.files?.length) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "At least one image is required",
    });
  }

  const normalizedTags = tags.map((t) => t.toLowerCase().trim());
  const dishKey = normalizedTags[0];

  // check if dish exists before by same chef
  const previousDish = await Post.findOne({
    author: req.userId,
    dishKey,
  });

  const isCookingPost = !!foodReadyTime;

  // cooking validation
  if (isCookingPost) {
    const readyTime = new Date(foodReadyTime);
    if (readyTime - Date.now() < 2 * 60 * 60 * 1000) {
      return sendResponse(res, {
        status: false,
        code: 400,
        message: "Dish must be posted at least 2 hours before ready time",
      });
    }
  }

  const media = await Promise.all(
    req.files.map((f) => uploadOnCloudinary(f.path))
  );

  const post = await Post.create({
    author: req.userId,
    caption,
    tags: normalizedTags,
    dishKey,
    media,
    postType: isCookingPost ? "cooking" : "informational",
    orderable: isCookingPost && !!previousDish,
    pricePerServing,
    foodReadyTime,
    totalServings,
    availableServings: totalServings,
    status: isCookingPost ? "in_progress" : "published",
    location:
      latitude && longitude
        ? {
            type: "Point",
            coordinates: [longitude, latitude],
          }
        : undefined,
  });

  await User.updateOne({ _id: req.userId }, { $addToSet: { posts: post._id } });

  const populated = await Post.findById(post._id).populate(
    "author",
    "name userName profileImage chefRating chefLevel"
  );

  return sendResponse(res, {
    code: 201,
    message: "Dish post created successfully",
    data: populated,
  });
});

export const repostDish = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { pricePerServing, foodReadyTime, totalServings } = req.body;

  if (!pricePerServing || !foodReadyTime || !totalServings) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "pricePerServing, foodReadyTime and totalServings are required",
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

  // only chef
  if (post.author.toString() !== req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "You are not allowed to repost this dish",
    });
  }

  // 🔴 CRITICAL GUARD
  if (post.status === "in_progress") {
    return sendResponse(res, {
      status: false,
      code: 400,
      message:
        "Dish is already in progress. Complete or expire it before reposting.",
    });
  }

  // 2-hour rule
  const readyTime = new Date(foodReadyTime);
  if (readyTime - Date.now() < 2 * 60 * 60 * 1000) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Dish must be reposted at least 2 hours before ready time",
    });
  }

  post.postType = "cooking";
  post.status = "in_progress";
  post.orderable = true;

  post.pricePerServing = pricePerServing;
  post.foodReadyTime = foodReadyTime;
  post.totalServings = totalServings;
  post.availableServings = totalServings;

  await post.save();

  const populated = await Post.findById(post._id).populate(
    "author",
    "name userName profileImage chefRating chefLevel"
  );

  return sendResponse(res, {
    message: "Dish reposted and now accepting orders",
    data: populated,
  });
});

 
export const updatePostStatus = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { status } = req.body;

  if (!["completed", "expired"].includes(status)) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Invalid status update",
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

  // only chef
  if (post.author.toString() !== req.userId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 403,
      message: "Not authorized to update dish status",
    });
  }

  // only active dishes
  if (post.status !== "in_progress") {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Only in-progress dishes can be updated",
    });
  }

  post.status = status;
  post.orderable = false;

  await post.save();

  return sendResponse(res, {
    message: `Dish marked as ${status}`,
    data: post,
  });
});

export const getAllPosts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    lat,
    lng,
    search,
    minRating,
    maxRating,
    minPrice,
    maxPrice,
    sortBy,
  } = req.query;

  const safePage = Math.max(parseInt(page), 1);
  const safeLimit = Math.min(parseInt(limit), 50);
  const skip = (safePage - 1) * safeLimit;

  const pipeline = [];

  if (lat && lng) {
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        },
        distanceField: "distance",
        spherical: true,
      },
    });
  }

  const match = { status: { $ne: "expired" } };

  if (search) {
    match.tags = { $regex: search.toLowerCase(), $options: "i" };
  }

  if (minRating || maxRating) {
    match["stats.avgRating"] = {};
    if (minRating) match["stats.avgRating"].$gte = Number(minRating);
    if (maxRating) match["stats.avgRating"].$lte = Number(maxRating);
  }

  if (minPrice || maxPrice) {
    match.pricePerServing = {};
    if (minPrice) match.pricePerServing.$gte = Number(minPrice);
    if (maxPrice) match.pricePerServing.$lte = Number(maxPrice);
  }

  pipeline.push({ $match: match });

  pipeline.push({
    $sort: {
      ...(lat && lng ? { distance: 1 } : {}),
      "stats.avgRating": -1,
      "stats.ordersCount": -1,
      "stats.savedCount": -1,
      "stats.commentsCount": -1,
      "stats.likesCount": -1,
      createdAt: -1,
    },
  });

  pipeline.push({
    $facet: {
      posts: [
        { $skip: skip },
        { $limit: safeLimit },

        {
          $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "author",
          },
        },
        { $unwind: "$author" },

        {
          $project: {
            // post fields
            _id: 1,
            media: 1,
            caption: 1,
            tags: 1,
            postType: 1,
            status: 1,
            orderable: 1,
            pricePerServing: 1,
            foodReadyTime: 1,
            availableServings: 1,
            stats: 1,
            distance: 1,
            createdAt: 1,

            // author (chef) fields
            "author._id": 1,
            "author.name": 1,
            "author.userName": 1,
            "author.profileImage": 1,
            "author.chefRating": 1,
            "author.chefLevel": 1,
          },
        },
      ],
      totalCount: [{ $count: "count" }],
    },
  });

  const result = await Post.aggregate(pipeline);

  const posts = result[0]?.posts || [];
  const totalItems = result[0]?.totalCount[0]?.count || 0;
  const totalPages = Math.ceil(totalItems / safeLimit);

  return sendResponse(res, {
    message: "Feed fetched successfully",
    data: {
      posts,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
      },
    },
  });
});

export const like = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await Post.findById(postId);
  if (!post) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Post not found",
    });
  }

  const alreadyLiked = post.likes.some(
    (id) => id.toString() === req.userId.toString()
  );

  if (alreadyLiked) {
    post.likes.pull(req.userId);
  } else {
    post.likes.addToSet(req.userId);

    if (post.author.toString() !== req.userId.toString()) {
      const notification = await Notification.create({
        sender: req.userId,
        receiver: post.author,
        type: "like",
        post: post._id,
        message: "liked your post",
      });

      const populated = await notification.populate("sender receiver post");

      const receiverSocketId = getSocketId(post.author);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newNotification", populated);
      }
    }
  }

  await post.save();
  await post.populate("author", "name userName profileImage");

  io.emit("likedPost", { postId, likes: post.likes });

  return sendResponse(res, {
    message: alreadyLiked ? "Post unliked" : "Post liked",
    data: post,
  });
});

export const comment = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const { postId } = req.params;

  if (!message) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Comment message is required",
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

  post.comments.push({
    author: req.userId,
    message,
  });

  if (post.author.toString() !== req.userId.toString()) {
    const notification = await Notification.create({
      sender: req.userId,
      receiver: post.author,
      type: "comment",
      post: post._id,
      message: "commented on your post",
    });

    const populated = await notification.populate("sender receiver post");

    const receiverSocketId = getSocketId(post.author);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newNotification", populated);
    }
  }

  await post.save();
  await post.populate("author", "name userName profileImage");
  await post.populate("comments.author", "name userName profileImage");

  io.emit("commentedPost", {
    postId: post._id,
    comments: post.comments,
  });

  return sendResponse(res, {
    message: "Comment added successfully",
    data: post,
  });
});

export const saved = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const user = await User.findById(req.userId);
  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  const alreadySaved = user.saved.some(
    (id) => id.toString() === postId.toString()
  );

  if (alreadySaved) {
    user.saved.pull(postId);
  } else {
    user.saved.addToSet(postId);
  }

  await user.save();
  await user.populate("saved");

  return sendResponse(res, {
    message: alreadySaved ? "Post unsaved" : "Post saved",
    data: user.saved,
  });
});
