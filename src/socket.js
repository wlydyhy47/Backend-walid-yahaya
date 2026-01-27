// src/socket.js
const { Server } = require("socket.io");
const DriverLocation = require("./models/driverLocation.model");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    /**
     * ADMIN joins
     */
    socket.on("joinAdmin", () => {
      socket.join("admin-room");
      console.log("👑 Admin joined admin-room");
    });

    /**
     * CLIENT joins order room
     */
    socket.on("joinOrder", ({ orderId }) => {
      socket.join(`order-${orderId}`);
      console.log(`📦 Client joined order-${orderId}`);
    });

    /**
     * DRIVER sends location
     */
    socket.on("driverLocationUpdate", async (data) => {
      try {
        const { driverId, orderId, latitude, longitude } = data;

        if (!driverId || !latitude || !longitude) return;

        const location = await DriverLocation.create({
          driver: driverId,
          order: orderId || null,
          location: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        });

        const payload = {
          driverId,
          orderId,
          latitude,
          longitude,
          timestamp: location.timestamp,
        };

        // 👑 Admin sees all drivers
        io.to("admin-room").emit("driverLocationUpdated", payload);

        // 📦 Client sees only his driver
        if (orderId) {
          io.to(`order-${orderId}`).emit(
            "driverLocationUpdated",
            payload
          );
        }
      } catch (err) {
        console.error("❌ Location update error:", err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });
};

module.exports = initSocket;
