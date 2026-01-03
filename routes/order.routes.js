import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  placeOrder,
  updateOrderStatus,
  cancelOrder,
} from "../controllers/order.controllers.js";

const orderRouter = express.Router();

orderRouter.post("/:postId/place", isAuth, placeOrder);
orderRouter.patch("/:orderId/status", isAuth, updateOrderStatus);
orderRouter.patch("/:orderId/cancel", isAuth, cancelOrder);

export default orderRouter;
