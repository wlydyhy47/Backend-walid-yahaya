const socketIo = require("socket.io");

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map();
    this.userRooms = new Map();
    this.chatSocketService = null;
  }

  initialize(server) {
    try {
      this.io = socketIo(server, {
        cors: {
          origin: process.env.CLIENT_URL || "http://localhost:3001",
          methods: ["GET", "POST"],
          credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
      });

      this.setupEventHandlers();
      console.log("✅ Socket.io initialized");
      
      // تهيئة خدمات الدردشة
      this.initializeChatServices();
      
      return this.io;
    } catch (error) {
      console.error("❌ Failed to initialize Socket.io:", error.message);
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.io) {
      console.error("❌ Cannot setup event handlers: Socket.io not initialized");
      return;
    }

    this.io.on("connection", (socket) => {
      console.log(`🟢 New socket connection: ${socket.id}`);

      // تعيين معرف المستخدم للـ socket
      socket.userId = null;

      socket.on("authenticate", async (userId) => {
        try {
          if (!userId) {
            socket.emit("error", { message: "User ID is required" });
            return;
          }

          socket.userId = userId.toString();
          
          socket.join(`user:${userId}`);
          this.userSockets.set(userId.toString(), socket.id);
          
          // تخزين الغرف التي انضم إليها المستخدم
          if (!this.userRooms.has(userId.toString())) {
            this.userRooms.set(userId.toString(), new Set());
          }
          this.userRooms.get(userId.toString()).add(`user:${userId}`);
          
          console.log(`👤 User ${userId} authenticated and joined their room`);
          
          socket.emit("authenticated", {
            message: "Successfully authenticated",
            userId: userId,
            timestamp: new Date(),
          });

          // إعلام الآخرين باتصال المستخدم
          socket.broadcast.emit("user:connected", {
            userId: userId,
            socketId: socket.id,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error("Authentication error:", error.message);
          socket.emit("error", { message: "Failed to authenticate" });
        }
      });

      socket.on("join", async (userId) => {
        try {
          if (!userId) {
            socket.emit("error", { message: "User ID is required" });
            return;
          }

          socket.userId = userId.toString();
          
          socket.join(`user:${userId}`);
          this.userSockets.set(userId.toString(), socket.id);
          
          // تخزين الغرف التي انضم إليها المستخدم
          if (!this.userRooms.has(userId.toString())) {
            this.userRooms.set(userId.toString(), new Set());
          }
          this.userRooms.get(userId.toString()).add(`user:${userId}`);
          
          console.log(`👤 User ${userId} joined their room`);
          
          socket.emit("welcome", {
            message: "Connected to notification server",
            userId: userId,
            timestamp: new Date(),
          });

          // إعلام الآخرين باتصال المستخدم
          socket.broadcast.emit("user:connected", {
            userId: userId,
            socketId: socket.id,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error("Join error:", error.message);
          socket.emit("error", { message: "Failed to join room" });
        }
      });

      socket.on("order:subscribe", (orderId) => {
        try {
          if (!orderId) {
            socket.emit("error", { message: "Order ID is required" });
            return;
          }

          socket.join(`order:${orderId}`);
          
          // تخزين الغرفة للمستخدم
          const userId = this.getUserIdBySocket(socket.id);
          if (userId && this.userRooms.has(userId)) {
            this.userRooms.get(userId).add(`order:${orderId}`);
          }
          
          console.log(`📦 Socket ${socket.id} subscribed to order ${orderId}`);
        } catch (error) {
          console.error("Order subscribe error:", error.message);
        }
      });

      socket.on("restaurant:subscribe", (restaurantId) => {
        try {
          if (!restaurantId) {
            socket.emit("error", { message: "Restaurant ID is required" });
            return;
          }

          socket.join(`restaurant:${restaurantId}`);
          
          const userId = this.getUserIdBySocket(socket.id);
          if (userId && this.userRooms.has(userId)) {
            this.userRooms.get(userId).add(`restaurant:${restaurantId}`);
          }
          
          console.log(`🏪 Socket ${socket.id} subscribed to restaurant ${restaurantId}`);
        } catch (error) {
          console.error("Restaurant subscribe error:", error.message);
        }
      });

      socket.on("presence:update", (data) => {
        try {
          const { userId, isOnline } = data;
          
          if (!userId) {
            socket.emit("error", { message: "User ID is required" });
            return;
          }

          socket.broadcast.emit("presence:changed", {
            userId,
            isOnline: Boolean(isOnline),
            timestamp: new Date(),
          });
        } catch (error) {
          console.error("Presence update error:", error.message);
        }
      });

      socket.on("message:send", async (data) => {
        try {
          const { to, message, type = "chat" } = data;
          
          if (!to || !message) {
            socket.emit("error", { message: "To and message are required" });
            return;
          }

          const from = this.getUserIdBySocket(socket.id);
          if (!from) {
            socket.emit("error", { message: "User not authenticated" });
            return;
          }

          this.sendToUser(to, {
            type: "message:new",
            data: {
              from,
              message,
              type,
              timestamp: new Date(),
            },
          });
          
          socket.emit("message:sent", {
            to,
            message,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error("Message send error:", error.message);
          socket.emit("error", { message: "Failed to send message" });
        }
      });

      socket.on("driver:location:update", (data) => {
        try {
          const { driverId, orderId, location } = data;
          
          if (!driverId || !location) {
            socket.emit("error", { message: "Driver ID and location are required" });
            return;
          }

          if (orderId) {
            this.io.to(`order:${orderId}`).emit("driver:location:updated", {
              driverId,
              location,
              timestamp: new Date(),
            });
          }
          
          this.io.to("admin:room").emit("driver:location:updated", {
            driverId,
            location,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error("Driver location update error:", error.message);
          socket.emit("error", { message: "Failed to update location" });
        }
      });

      socket.on("disconnect", (reason) => {
        console.log(`🔴 Socket disconnected: ${socket.id}, reason: ${reason}`);
        
        const userId = this.getUserIdBySocket(socket.id);
        if (userId) {
          this.userSockets.delete(userId.toString());
          
          // تنظيف الغرف
          if (this.userRooms.has(userId.toString())) {
            const rooms = this.userRooms.get(userId.toString());
            rooms.forEach(room => {
              if (this.io) {
                socket.leave(room);
              }
            });
            this.userRooms.delete(userId.toString());
          }
          
          if (this.io) {
            socket.broadcast.emit("user:disconnected", {
              userId,
              socketId: socket.id,
              reason,
              timestamp: new Date(),
            });
          }
        }
      });

      socket.on("error", (error) => {
        console.error(`Socket error ${socket.id}:`, error);
      });
    });
  }

  getUserIdBySocket(socketId) {
    // البحث في userSockets
    for (const [userId, sid] of this.userSockets.entries()) {
      if (sid === socketId) {
        return userId;
      }
    }
    return null;
  }

  sendToUser(userId, data) {
    try {
      if (!this.io) {
        console.error("❌ Socket.io not initialized");
        return { success: false, error: "Socket.io not initialized" };
      }

      const socketId = this.userSockets.get(userId.toString());
      
      if (socketId) {
        this.io.to(socketId).emit(data.type, data.data || data);
        console.log(`📨 Sent ${data.type} to user ${userId}`);
        return { success: true, delivered: true };
      }
      
      console.log(`📭 User ${userId} is not connected, notification queued`);
      return { success: true, delivered: false, queued: true };
    } catch (error) {
      console.error("Send to user error:", error);
      return { success: false, error: error.message };
    }
  }

  sendToUsers(userIds, data) {
    const results = {
      total: userIds.length,
      delivered: 0,
      queued: 0,
      failed: 0,
      errors: []
    };
    
    userIds.forEach(userId => {
      const result = this.sendToUser(userId, data);
      if (result.success) {
        if (result.delivered) {
          results.delivered++;
        } else {
          results.queued++;
        }
      } else {
        results.failed++;
        results.errors.push({ userId, error: result.error });
      }
    });
    
    return results;
  }

  sendToRoom(room, data) {
    try {
      if (!this.io) {
        console.error("❌ Socket.io not initialized");
        return { success: false, error: "Socket.io not initialized" };
      }

      this.io.to(room).emit(data.type, data.data || data);
      console.log(`📨 Sent ${data.type} to room ${room}`);
      return { success: true };
    } catch (error) {
      console.error("Send to room error:", error);
      return { success: false, error: error.message };
    }
  }

  broadcast(data, excludeSocketId = null) {
    try {
      if (!this.io) {
        console.error("❌ Socket.io not initialized");
        return { success: false, error: "Socket.io not initialized" };
      }

      if (excludeSocketId) {
        this.io.except(excludeSocketId).emit(data.type, data.data || data);
      } else {
        this.io.emit(data.type, data.data || data);
      }
      
      console.log(`📢 Broadcast ${data.type} to all connected clients`);
      return { success: true };
    } catch (error) {
      console.error("Broadcast error:", error);
      return { success: false, error: error.message };
    }
  }

  getConnectedUsersCount() {
    return this.userSockets.size;
  }

  isUserConnected(userId) {
    return this.userSockets.has(userId.toString());
  }

  getConnectedUsers() {
    return Array.from(this.userSockets.keys());
  }

  initializeChatServices() {
    try {
      if (!this.io) {
        console.warn("⚠️ Socket.io not initialized yet, chat service will be delayed");
        return null;
      }

      const ChatSocketService = require("./chat.socket.service");
      
      // إنشاء نسخة جديدة من ChatSocketService
      const chatSocketService = ChatSocketService;
      
      // تمرير instance الـ Socket.io لخدمة الدردشة
      if (chatSocketService.initializeWithIO) {
        chatSocketService.initializeWithIO(this.io);
      }
      
      // تخزين المرجع للاستخدام لاحقاً
      this.chatSocketService = chatSocketService;
      
      console.log("✅ Chat socket service initialized");
      return chatSocketService;
    } catch (error) {
      console.error("❌ Chat service initialization failed:", error.message);
      return null;
    }
  }

  // دالة للحصول على instance الـ Socket.io للاستخدام الخارجي
  getIO() {
    if (!this.io) {
      console.warn("⚠️ Socket.io not initialized yet");
    }
    return this.io;
  }

  // دالة للتحقق من تهيئة الخدمة
  isInitialized() {
    return !!this.io;
  }
}

const socketServiceInstance = new SocketService();

module.exports = {
  initialize: (server) => socketServiceInstance.initialize(server),
  sendToUser: (userId, data) => socketServiceInstance.sendToUser(userId, data),
  sendToUsers: (userIds, data) => socketServiceInstance.sendToUsers(userIds, data),
  sendToRoom: (room, data) => socketServiceInstance.sendToRoom(room, data),
  broadcast: (data, excludeSocketId) => socketServiceInstance.broadcast(data, excludeSocketId),
  isUserConnected: (userId) => socketServiceInstance.isUserConnected(userId),
  getConnectedUsers: () => socketServiceInstance.getConnectedUsers(),
  getConnectedUsersCount: () => socketServiceInstance.getConnectedUsersCount(),
  initializeChatServices: () => socketServiceInstance.initializeChatServices(),
  getIO: () => socketServiceInstance.getIO(),
  isInitialized: () => socketServiceInstance.isInitialized(),
  instance: socketServiceInstance
};