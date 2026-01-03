import express from "express";
import isAuth from "../middlewares/isAuth.js";
import { rateOrder } from "../controllers/rating.controllers.js";

const router = express.Router();

router.post("/:orderId", isAuth, rateOrder);

export default router;
