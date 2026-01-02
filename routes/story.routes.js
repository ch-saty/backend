import express from "express";
import isAuth from "../middlewares/isAuth.js";

import { upload } from "../middlewares/multer.js";
import {
  getAllStories,
  getStoryByUserName,
  uploadStory,
  viewStory,
  reactToStory,
  addStoryToHighlights,
  getAllHighlights,
} from "../controllers/story.controllers.js";

const storyRouter = express.Router();

storyRouter.post("/upload", isAuth, upload.single("media"), uploadStory);
storyRouter.get("/getByUserName/:userName", isAuth, getStoryByUserName);
storyRouter.get("/getAll", isAuth, getAllStories);
storyRouter.get("/view/:storyId", isAuth, viewStory);
storyRouter.post("/react/:storyId", isAuth, reactToStory);
storyRouter.post("/highlight/:storyId", isAuth, addStoryToHighlights);
storyRouter.get("/highlights", isAuth, getAllHighlights);
export default storyRouter;
