import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  placeOrder,
  placeShopOrder,
  verifyPayment,
  getMyOrders,
  updateOrderStatus,
  getDeliveryBoyAssignment,
  acceptOrder,
  sendDeliveryOtp,
  verifyDeliveryOtp,
  getOrderById,
} from "../controllers/order.controller.js";

const orderRouter = express.Router();

orderRouter.post("/post/:postId", isAuth, placeOrder);

orderRouter.post("/shop/place", isAuth, placeShopOrder);

orderRouter.post("/payment/verify", isAuth, verifyPayment);

orderRouter.get("/my", isAuth, getMyOrders);
orderRouter.get("/:orderId", isAuth, getOrderById);

orderRouter.patch("/:orderId/:shopId/status", isAuth, updateOrderStatus);
orderRouter.post("/send-delivery-otp", isAuth, sendDeliveryOtp);

orderRouter.get("/delivery/assignments", isAuth, getDeliveryBoyAssignment);
orderRouter.patch("/delivery/accept/:assignmentId", isAuth, acceptOrder);
orderRouter.post("/delivery/verify-otp", isAuth, verifyDeliveryOtp);

export default orderRouter;
