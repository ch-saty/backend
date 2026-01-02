import sendMail from "../config/Mail.js";
import genToken from "../config/token.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

import { sendResponse } from "../config/response.js";
import { asyncHandler } from "../config/asyncHandler.js";

export const signUp = asyncHandler(async (req, res) => {
  const { name, email, password, userName } = req.body;

  const requiredFields = ["name", "email", "password", "userName"];
  const missingFields = requiredFields.filter((f) => !req.body?.[f]);

  if (missingFields.length > 0) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Required fields are missing",
      data: { missingFields },
    });
  }

  if (password.length < 6) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Password must be at least 6 characters",
    });
  }

  if (await User.exists({ email })) {
    return sendResponse(res, {
      status: false,
      code: 409,
      message: "Email already exists",
    });
  }

  if (await User.exists({ userName })) {
    return sendResponse(res, {
      status: false,
      code: 409,
      message: "Username already exists",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    userName,
    password: hashedPassword,
  });

  const token = await genToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "Strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
  });

  return sendResponse(res, {
    code: 201,
    message: "Signup successful",
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        userName: user.userName,
        createdAt: user.createdAt,
      },
      token,
    },
  });
});

export const signIn = asyncHandler(async (req, res) => {
  const { email, userName, password } = req.body;

  if ((!email && !userName) || !password) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Email or username and password are required",
    });
  }

  const user = await User.findOne({
    $or: [email && { email }, userName && { userName }].filter(Boolean),
  }).select("+password");

  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return sendResponse(res, {
      status: false,
      code: 401,
      message: "Incorrect password",
    });
  }

  const token = await genToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "Strict",
    secure: process.env.NODE_ENV === "production",
  });

  return sendResponse(res, {
    message: "Signin successful",
    data: {
      user: {
        _id: user._id,
        name: user.name,
        userName: user.userName,
        email: user.email,
      },
      token,
    },
  });
});

export const signOut = asyncHandler(async (req, res) => {
  res.clearCookie("token");

  return sendResponse(res, {
    message: "Sign out successful",
  });
});

export const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Email is required",
    });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return sendResponse(res, {
      status: false,
      code: 404,
      message: "User not found",
    });
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  user.resetOtp = otp;
  user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 mins
  user.isOtpVerified = false;

  await user.save();
  await sendMail(email, otp);

  return sendResponse(res, {
    message: "OTP sent successfully",
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Email and OTP are required",
    });
  }

  const user = await User.findOne({ email });

  if (
    !user ||
    user.resetOtp !== otp ||
    !user.otpExpires ||
    user.otpExpires < Date.now()
  ) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Invalid or expired OTP",
    });
  }

  user.isOtpVerified = true;
  user.resetOtp = undefined;
  user.otpExpires = undefined;
  await user.save();

  return sendResponse(res, {
    message: "OTP verified successfully",
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Email and new password are required",
    });
  }

  if (password.length < 6) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "Password must be at least 6 characters long",
    });
  }

  const user = await User.findOne({ email });

  if (!user || !user.isOtpVerified) {
    return sendResponse(res, {
      status: false,
      code: 400,
      message: "OTP verification required",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  user.password = hashedPassword;
  user.isOtpVerified = false;
  await user.save();

  return sendResponse(res, {
    message: "Password reset successfully",
  });
});
