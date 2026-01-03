import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  createSpecialRequest,
  respondToSpecialRequest,
} from "../controllers/specialRequest.controllers.js";

const router = express.Router();

router.post("/:postId", isAuth, createSpecialRequest);
router.patch("/:requestId/respond", isAuth, respondToSpecialRequest);

export default router;
