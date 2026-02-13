import { Server } from "socket.io";
import User from "./models/user.model.js";

const userSocketMap = new Map();
let ioInstance = null;

/* ================= INIT SOCKET ================= */
export const initSocket = (server) => {
  ioInstance = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  ioInstance.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    /* ---------- IDENTITY ---------- */
    socket.on("identity", async ({ userId }) => {
      if (!userId) return;

      userSocketMap.set(String(userId), socket.id);

      await User.findByIdAndUpdate(userId, {
        socketId: socket.id,
        isOnline: true,
      });

      ioInstance.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
    });

    /* ---------- LOCATION UPDATE ---------- */
    socket.on("updateLocation", async ({ latitude, longitude, userId }) => {
      if (!userId) return;

      const user = await User.findByIdAndUpdate(
        userId,
        {
          location: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          isOnline: true,
          socketId: socket.id,
        },
        { new: true },
      );

      if (user) {
        ioInstance.emit("updateDeliveryLocation", {
          deliveryBoyId: userId,
          latitude,
          longitude,
        });
      }
    });

    /* ---------- DISCONNECT ---------- */
    socket.on("disconnect", async () => {
      console.log("Socket disconnected:", socket.id);

      for (const [userId, sId] of userSocketMap.entries()) {
        if (sId === socket.id) {
          userSocketMap.delete(userId);

          await User.findByIdAndUpdate(userId, {
            socketId: null,
            isOnline: false,
          });

          break;
        }
      }

      ioInstance.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
    });
  });

  return ioInstance;
};

export const getSocketId = (userId) => {
  return userSocketMap.get(String(userId));
};

export const io = {
  to: (...args) => ioInstance.to(...args),
  emit: (...args) => ioInstance.emit(...args),
};
export const socketHandler = (io) => {
  ioInstance = io;
};
