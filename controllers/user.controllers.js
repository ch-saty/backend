import uploadOnCloudinary from "../config/cloudinary.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { getSocketId, io } from "../socket.js";
import mongoose from "mongoose";
export const getCurrentUser = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId)
      .select("-password -resetOtp -otpExpires")
      .populate("posts loops posts.author posts.comments story following");
    if (!user) {
      return res.status(400).json({ message: "user not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: `get current user error ${error}` });
  }
};

export const suggestedUsers = async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.userId },
      isDeleted: false,
    }).select("_id username displayName avatarUrl bio  postsCount");

    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({
      message: `get suggested user error ${error.message}`,
    });
  }
};

export const editProfile = async (req, res) => {
  try {
    const { name, userName, bio, profession, gender } = req.body;
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(400).json({ message: "user not found" });
    }

    const sameUserWithUserName = await User.findOne({ userName }).select(
      "-password"
    );

    if (sameUserWithUserName && sameUserWithUserName._id != req.userId) {
      return res.status(400).json({ message: "userName already exist" });
    }

    let profileImage;
    if (req.file) {
      profileImage = await uploadOnCloudinary(req.file.path);
    }

    user.name = name;
    user.userName = userName;
    if (profileImage) {
      user.profileImage = profileImage;
    }
    user.bio = bio;
    user.profession = profession;
    user.gender = gender;

    await user.save();

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: `edit profile error ${error}` });
  }
};

export const getProfile = async (req, res) => {
  try {
    const { userName, userId } = req.params;
    const viewerId = req.userId; // logged-in user

    let query = {};
    if (userName) query.username = userName;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query._id = userId;
    }

    if (Object.keys(query).length === 0) {
      return res.status(400).json({ message: "Invalid search params" });
    }

    const user = await User.findOne(query)
      .select(
        "_id username displayName avatarUrl bio followers following followersCount followingCount postsCount"
      )
      .populate("posts loops");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 👇 CHECK FOLLOW STATUS
    const isFollowing = user.followers.some(
      (id) => id.toString() === viewerId.toString()
    );

    return res.status(200).json({
      ...user.toObject(),
      isFollowing, // 👈 boolean for UI
    });
  } catch (error) {
    return res.status(500).json({
      message: `get profile error ${error.message}`,
    });
  }
};

export const follow = async (req, res) => {
  try {
    const viewerId = req.userId; // from auth token
    const { targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid target user id" });
    }

    if (viewerId.toString() === targetUserId.toString()) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔎 check follow state
    const isFollowing = await User.exists({
      _id: viewerId,
      following: targetUserId,
    });

    if (isFollowing) {
      // -------- UNFOLLOW --------
      await Promise.all([
        User.updateOne(
          { _id: viewerId },
          { $pull: { following: targetUserId } }
        ),
        User.updateOne(
          { _id: targetUserId },
          { $pull: { followers: viewerId } }
        ),
      ]);

      return res.status(200).json({
        isFollowing: false,
        action: "unfollowed",
      });
    }

    // -------- FOLLOW --------
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

    // 🔔 notify only on follow
    const notification = await Notification.create({
      sender: viewerId,
      receiver: targetUserId,
      type: "follow",
      message: "started following you",
    });

    const populatedNotification = await Notification.findById(
      notification._id
    ).populate("sender receiver");

    const receiverSocketId = getSocketId(targetUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newNotification", populatedNotification);
    }

    return res.status(200).json({
      isFollowing: true,
      action: "followed",
    });
  } catch (error) {
    return res.status(500).json({
      message: `follow error ${error.message}`,
    });
  }
};

export const followingList = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("following").populate({
      path: "following",
      select: "_id username displayName avatarUrl bio ",
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      count: user.following.length,
      users: user.following,
    });
  } catch (error) {
    return res.status(500).json({
      message: `following error ${error.message}`,
    });
  }
};

export const search = async (req, res) => {
  try {
    const keyWord = req.query.keyWord;

    if (!keyWord) {
      return res.status(400).json({ message: "keyword is required" });
    }

    const users = await User.find({
      $or: [
        { userName: { $regex: keyWord, $options: "i" } },
        { name: { $regex: keyWord, $options: "i" } },
      ],
    }).select("-password");

    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: `search error ${error}` });
  }
};

export const getAllNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      receiver: req.userId,
    })
      .populate("sender receiver post loop")
      .sort({ createdAt: -1 });
    return res.status(200).json(notifications);
  } catch (error) {
    return res.status(500).json({ message: `get notification error ${error}` });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.body;

    if (Array.isArray(notificationId)) {
      // bulk mark-as-read
      await Notification.updateMany(
        { _id: { $in: notificationId }, receiver: req.userId },
        { $set: { isRead: true } }
      );
    } else {
      // mark single notification as read
      await Notification.findOneAndUpdate(
        { _id: notificationId, receiver: req.userId },
        { $set: { isRead: true } }
      );
    }
    return res.status(200).json({ message: "marked as read" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: `read notification error ${error}` });
  }
};
