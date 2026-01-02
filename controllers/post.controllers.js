import uploadOnCloudinary from "../config/cloudinary.js";
import Notification from "../models/notification.model.js";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import { getSocketId, io } from "../socket.js";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";

export const uploadPost = asyncHandler(async (req, res) => {
  const { caption } = req.body;

  if (!req.files || req.files.length === 0) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "At least one image is required",
    });
  }

  const media = await Promise.all(
    req.files.map((file) => uploadOnCloudinary(file.path))
  );

  const post = await Post.create({
    caption,
    media,
    author: req.userId,
    mediaType: "image",
  });

  await User.updateOne({ _id: req.userId }, { $push: { posts: post._id } });

  const populatedPost = await Post.findById(post._id).populate(
    "author",
    "name userName profileImage"
  );

  return sendResponse(res, {
    code: 201,
    message: "Image post uploaded successfully",
    data: populatedPost,
  });
});

export const getAllPosts = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const skip = (page - 1) * limit;

  const totalItems = await Post.countDocuments();

  const posts = await Post.find({})
    .populate("author", "name userName profileImage")
    .populate("comments.author", "name userName profileImage")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalPages = Math.ceil(totalItems / limit);

  return sendResponse(res, {
    message: "Posts fetched successfully",
    data: {
      posts,
      pagination: {
        page,
        limit,
        totalPages,
        totalItems,
        hasNextPage: page < totalPages,
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
