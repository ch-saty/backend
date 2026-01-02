import uploadOnCloudinary from "../config/cloudinary.js";
import Story from "../models/story.model.js";
import User from "../models/user.model.js";
import fs from "fs";
import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";

export const uploadStory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  if (!req.file) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Story image is required",
    });
  }

  // delete old story if exists
  if (user.story) {
    await Story.findByIdAndDelete(user.story);
    user.story = null;
  }

  const media = await uploadOnCloudinary(req.file.path);

  // ✅ SAFE CLEANUP
  if (req.file?.path && fs.existsSync(req.file.path)) {
    fs.unlinkSync(req.file.path);
  }

  const story = await Story.create({
    author: req.userId,
    media,
    mediaType: "image",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
  });

  user.story = story._id;
  await user.save();

  const populatedStory = await Story.findById(story._id)
    .populate("author", "name userName profileImage")
    .populate("viewers", "name userName profileImage");

  return sendResponse(res, {
    code: 201,
    message: "Story uploaded successfully",
    data: populatedStory,
  });
});

export const viewStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;

  const story = await Story.findById(storyId);
  if (!story) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Story not found",
    });
  }

  const alreadyViewed = story.viewers.some(
    (id) => id.toString() === req.userId.toString()
  );

  if (!alreadyViewed) {
    story.viewers.push(req.userId);
    await story.save();
  }

  const populatedStory = await Story.findById(story._id)
    .populate("author", "name userName profileImage")
    .populate("viewers", "name userName profileImage");

  return sendResponse(res, {
    message: "Story viewed successfully",
    data: populatedStory,
  });
});

export const getStoryByUserName = asyncHandler(async (req, res) => {
  const { userName } = req.params;

  const user = await User.findOne({ userName });
  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  const stories = await Story.find({
    author: user._id,
    expiresAt: { $gt: new Date() },
  })
    .populate("author", "name userName profileImage")
    .populate("viewers", "name userName profileImage")
    .sort({ createdAt: -1 });

  return sendResponse(res, {
    message: "Stories fetched successfully",
    data: stories,
  });
});

export const getAllStories = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.userId);

  const stories = await Story.find({
    author: { $in: currentUser.following },
    expiresAt: { $gt: new Date() },
  })
    .populate("author", "name userName profileImage")
    .populate("viewers", "name userName profileImage")
    .sort({ createdAt: -1 });

  const unseen = [];
  const seen = [];

  stories.forEach((story) => {
    const hasSeen = story.viewers.some(
      (v) => v._id.toString() === req.userId.toString()
    );
    hasSeen ? seen.push(story) : unseen.push(story);
  });

  return sendResponse(res, {
    message: "Stories fetched successfully",
    data: { unseen, seen },
  });
});

export const reactToStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const { emoji } = req.body;

  const story = await Story.findById(storyId);
  if (!story) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Story not found",
    });
  }

  story.reactions.push({
    user: req.userId,
    emoji,
  });

  await story.save();

  return sendResponse(res, {
    message: "Reaction added",
    data: story.reactions,
  });
});

export const addStoryToHighlights = asyncHandler(async (req, res) => {
  const { storyId } = req.params;

  const story = await Story.findById(storyId);
  if (!story) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "Story not found",
    });
  }

  story.isHighlighted = true;
  await story.save();

  return sendResponse(res, {
    message: "Story added to highlights",
  });
});

export const getAllHighlights = asyncHandler(async (req, res) => {
  const highlights = await Story.find({
    isHighlighted: true,
  })
    .populate("author", "name userName profileImage")
    .populate("viewers", "name userName profileImage")
    .sort({ createdAt: -1 });

  return sendResponse(res, {
    message: "Highlighted stories fetched successfully",
    data: highlights,
  });
});
