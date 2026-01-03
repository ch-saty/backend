import express from "express";
import isAuth from "../middlewares/isAuth.js";
import { upload } from "../middlewares/multer.js";

import {
  uploadPost,
  getAllPosts,
  like,
  saved,
  comment,
  repostDish,
  updatePostStatus,
} from "../controllers/post.controllers.js";



const postRouter = express.Router();

postRouter.post("/upload", isAuth, upload.array("image", 5), uploadPost);
postRouter.get("/getAll", isAuth, getAllPosts);
postRouter.get("/like/:postId", isAuth, like);
postRouter.patch("/repost/:postId", isAuth, repostDish);
postRouter.patch("/status/:postId", isAuth, updatePostStatus);
postRouter.get("/saved/:postId", isAuth, saved);
postRouter.post("/comment/:postId", isAuth, comment);

export default postRouter;
