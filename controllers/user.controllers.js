import uploadOnCloudinary from "../config/cloudinary.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { getSocketId, io } from "../socket.js";
import mongoose from "mongoose";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select(
    "_id name userName profileImage bio profession gender chefRating chefLevel followers following"
  );

  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  return sendResponse(res, {
    message: "Current user fetched successfully",
    data: user,
  });
});

export const suggestedUsers = asyncHandler(async (req, res) => {
  const users = await User.find({
    _id: { $ne: req.userId },
  })
    .select("_id name userName profileImage bio chefRating chefLevel")
    .limit(20);

  return sendResponse(res, {
    message: "Suggested users fetched successfully",
    data: users,
  });
});


export const editProfile = asyncHandler(async (req, res) => {
  const { name, userName, bio, profession, gender } = req.body;

  const user = await User.findById(req.userId);
  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  if (userName) {
    const existing = await User.findOne({ userName });
    if (existing && existing._id.toString() !== req.userId.toString()) {
      return sendResponse(res, {
        status: false,
        code: 400,
        message: "Username already exists",
      });
    }
  }

  if (req.file) {
    user.profileImage = await uploadOnCloudinary(req.file.path);
  }

  user.name = name ?? user.name;
  user.userName = userName ?? user.userName;
  user.bio = bio ?? user.bio;
  user.profession = profession ?? user.profession;
  user.gender = gender ?? user.gender;

  await user.save();

  return sendResponse(res, {
    message: "Profile updated successfully",
    data: {
      _id: user._id,
      name: user.name,
      userName: user.userName,
      profileImage: user.profileImage,
      bio: user.bio,
      profession: user.profession,
      gender: user.gender,
    },
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  const { userName, userId } = req.params;
  const viewerId = req.userId;

  const query = {};
  if (userName) query.userName = userName;
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    query._id = userId;
  }

  if (!Object.keys(query).length) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Invalid search params",
    });
  }

  const user = await User.findOne(query).select(
    "_id name userName profileImage bio chefRating chefLevel followers following"
  );

  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  const isFollowing = user.followers.some(
    (id) => id.toString() === viewerId.toString()
  );

  return sendResponse(res, {
    message: "Profile fetched successfully",
    data: {
      ...user.toObject(),
      isFollowing,
    },
  });
});


export const follow = asyncHandler(async (req, res) => {
  const viewerId = req.userId;
  const { targetUserId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Invalid target user id",
    });
  }

  if (viewerId.toString() === targetUserId.toString()) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "You cannot follow yourself",
    });
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  const isFollowing = await User.exists({
    _id: viewerId,
    following: targetUserId,
  });

  if (isFollowing) {
    await Promise.all([
      User.updateOne({ _id: viewerId }, { $pull: { following: targetUserId } }),
      User.updateOne({ _id: targetUserId }, { $pull: { followers: viewerId } }),
    ]);

    return sendResponse(res, {
      message: "User unfollowed successfully",
      data: { isFollowing: false },
    });
  }

  await Promise.all([
    User.updateOne(
      { _id: viewerId },
      { $addToSet: { following: targetUserId } }
    ),
    User.updateOne(
      { _id: targetUserId },
      { $addToSet: { followers: viewerId } }
    ),
  ]);

  await Notification.create({
    sender: viewerId,
    receiver: targetUserId,
    type: "follow",
    message: "started following you",
  });

  return sendResponse(res, {
    message: "User followed successfully",
    data: { isFollowing: true },
  });
});


export const followingList = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select("following")
    .populate(
      "following",
      "_id name userName profileImage chefRating chefLevel"
    );

  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  return sendResponse(res, {
    message: "Following list fetched successfully",
    data: {
      count: user.following.length,
      users: user.following,
    },
  });
});


export const search = asyncHandler(async (req, res) => {
  const { keyWord } = req.query;

  if (!keyWord) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Keyword is required",
    });
  }

  const users = await User.find({
    $or: [
      { userName: { $regex: keyWord, $options: "i" } },
      { name: { $regex: keyWord, $options: "i" } },
    ],
  }).select("_id name userName profileImage chefRating chefLevel");

  return sendResponse(res, {
    message: "Search results fetched successfully",
    data: users,
  });
});


export const getAllNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({
    receiver: req.userId,
  })
    .populate("sender", "_id name userName profileImage")
    .populate("post", "_id caption")
    .populate("order", "_id status")
    .sort({ createdAt: -1 });

  return sendResponse(res, {
    message: "Notifications fetched successfully",
    data: notifications,
  });
});


export const markAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.body;

  if (!notificationId) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "notificationId is required",
    });
  }

  if (Array.isArray(notificationId)) {
    await Notification.updateMany(
      { _id: { $in: notificationId }, receiver: req.userId },
      { $set: { isRead: true } }
    );
  } else {
    await Notification.findOneAndUpdate(
      { _id: notificationId, receiver: req.userId },
      { $set: { isRead: true } }
    );
  }

  return sendResponse(res, {
    message: "Notification(s) marked as read",
  });
});

