const socketIo = require("socket.io");

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // تخزين userId -> socketId
    this.userRooms = new Map(); // تخزين userId -> Set<rooms>
    this.chatSocketService = null;
    this.User = null; // سيتم استيراده عند الحاجة
  }

  /**
   * تهيئة Socket.io
   */
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
      
      this.initializeChatServices();
      
      return this.io;
    } catch (error) {
      console.error("❌ Failed to initialize Socket.io:", error.message);
      throw error;
    }
  }

  /**
   * إعداد معالجي الأحداث
   */
  setupEventHandlers() {
    if (!this.io) {
      console.error("❌ Cannot setup event handlers: Socket.io not initialized");
      return;
    }

    this.io.on("connection", (socket) => {
      console.log(`🟢 New socket connection: ${socket.id}`);
      socket.userId = null;

      // ====== Authentication & Connection ======
      socket.on("authenticate", async (userId) => {
        await this.handleAuthentication(socket, userId);
      });

      socket.on("join", async (userId) => {
        await this.handleJoin(socket, userId);
      });

      // ====== Room Subscriptions ======
      socket.on("order:subscribe", (orderId) => {
        this.handleOrderSubscription(socket, orderId);
      });

      socket.on("restaurant:subscribe", async (restaurantId) => {
        await this.handleRestaurantSubscription(socket, restaurantId);
      });

      // ====== Presence & Status ======
      socket.on("presence:update", (data) => {
        this.handlePresenceUpdate(socket, data);
      });

      // ====== Messaging ======
      socket.on("message:send", async (data) => {
        await this.handleMessageSend(socket, data);
      });

      // ====== Driver Tracking ======
      socket.on("driver:location:update", (data) => {
        this.handleDriverLocationUpdate(socket, data);
      });

      // ====== Admin Features ======
      socket.on("admin:join", () => {
        this.handleAdminJoin(socket);
      });

      socket.on("dashboard:subscribe", () => {
        this.handleDashboardSubscription(socket);
      });

      // ====== Disconnection ======
      socket.on("disconnect", (reason) => {
        this.handleDisconnect(socket, reason);
      });

      socket.on("error", (error) => {
        console.error(`Socket error ${socket.id}:`, error);
      });
    });
  }

  // ====== Authentication Handlers ======
  
  async handleAuthentication(socket, userId) {
    try {
      if (!userId) {
        socket.emit("error", { message: "يجب إدخال معرف المستخدم" });
        return;
      }

      socket.userId = userId.toString();
      
      // الانضمام إلى غرفة المستخدم الخاصة
      socket.join(`user:${userId}`);
      this.userSockets.set(userId.toString(), socket.id);
      
      // تخزين الغرف
      if (!this.userRooms.has(userId.toString())) {
        this.userRooms.set(userId.toString(), new Set());
      }
      this.userRooms.get(userId.toString()).add(`user:${userId}`);
      
      console.log(`👤 User ${userId} authenticated and joined their room`);
      
      socket.emit("authenticated", {
        message: "تم المصادقة بنجاح",
        userId: userId,
        timestamp: new Date(),
      });

      // إشعار الآخرين باتصال المستخدم
      socket.broadcast.emit("user:connected", {
        userId: userId,
        socketId: socket.id,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Authentication error:", error.message);
      socket.emit("error", { message: "فشلت المصادقة" });
    }
  }

  async handleJoin(socket, userId) {
    try {
      if (!userId) {
        socket.emit("error", { message: "يجب إدخال معرف المستخدم" });
        return;
      }

      socket.userId = userId.toString();
      socket.join(`user:${userId}`);
      this.userSockets.set(userId.toString(), socket.id);
      
      if (!this.userRooms.has(userId.toString())) {
        this.userRooms.set(userId.toString(), new Set());
      }
      this.userRooms.get(userId.toString()).add(`user:${userId}`);
      
      console.log(`👤 User ${userId} joined their room`);
      
      socket.emit("welcome", {
        message: "تم الاتصال بخادم الإشعارات",
        userId: userId,
        timestamp: new Date(),
      });

      socket.broadcast.emit("user:connected", {
        userId: userId,
        socketId: socket.id,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Join error:", error.message);
      socket.emit("error", { message: "فشل الانضمام" });
    }
  }

  // ====== Subscription Handlers ======
  
  handleOrderSubscription(socket, orderId) {
    try {
      if (!orderId) {
        socket.emit("error", { message: "يجب إدخال معرف الطلب" });
        return;
      }

      const room = `order:${orderId}`;
      socket.join(room);
      
      // تخزين الغرفة للمستخدم
      const userId = this.getUserIdBySocket(socket.id);
      if (userId && this.userRooms.has(userId)) {
        this.userRooms.get(userId).add(room);
      }
      
      console.log(`📦 Socket ${socket.id} subscribed to order ${orderId}`);
      
      socket.emit("order:subscribed", {
        orderId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Order subscribe error:", error.message);
      socket.emit("error", { message: "فشل الاشتراك في الطلب" });
    }
  }

  async handleRestaurantSubscription(socket, restaurantId) {
    try {
      if (!restaurantId) {
        socket.emit("error", { message: "يجب إدخال معرف المطعم" });
        return;
      }

      const userId = this.getUserIdBySocket(socket.id);
      if (!userId) {
        socket.emit("error", { message: "يجب تسجيل الدخول أولاً" });
        return;
      }

      // تأخير استيراد الموديل حتى الحاجة الفعلية
      if (!this.User) {
        this.User = require("../models/user.model");
      }

      // التحقق من صلاحيات المستخدم
      const user = await this.User.findById(userId);
      if (!user) {
        socket.emit("error", { message: "المستخدم غير موجود" });
        return;
      }

      const isAuthorized = this.checkRestaurantAccess(user, restaurantId);
      if (!isAuthorized) {
        socket.emit("error", { message: "غير مصرح لك بالوصول لهذا المطعم" });
        return;
      }

      const room = `restaurant:${restaurantId}`;
      socket.join(room);
      
      // تخزين الغرفة
      if (this.userRooms.has(userId)) {
        this.userRooms.get(userId).add(room);
      }
      
      console.log(`🏪 User ${userId} subscribed to restaurant ${restaurantId}`);
      
      socket.emit("restaurant:subscribed", {
        restaurantId,
        userId,
        role: user.role,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Restaurant subscribe error:", error);
      socket.emit("error", { message: "فشل الاشتراك في المطعم" });
    }
  }

  // ====== Presence & Messaging Handlers ======
  
  handlePresenceUpdate(socket, data) {
    try {
      const { userId, isOnline } = data;
      
      if (!userId) {
        socket.emit("error", { message: "يجب إدخال معرف المستخدم" });
        return;
      }

      socket.broadcast.emit("presence:changed", {
        userId,
        isOnline: Boolean(isOnline),
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Presence update error:", error.message);
      socket.emit("error", { message: "فشل تحديث الحالة" });
    }
  }

  async handleMessageSend(socket, data) {
    try {
      const { to, message, type = "chat" } = data;
      
      if (!to || !message) {
        socket.emit("error", { message: "يجب إدخال المستلم والرسالة" });
        return;
      }

      const from = this.getUserIdBySocket(socket.id);
      if (!from) {
        socket.emit("error", { message: "المستخدم غير مصرح به" });
        return;
      }

      // إرسال الرسالة
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
      socket.emit("error", { message: "فشل إرسال الرسالة" });
    }
  }

  // ====== Driver Tracking Handlers ======
  
  handleDriverLocationUpdate(socket, data) {
    try {
      const { driverId, orderId, location } = data;
      
      if (!driverId || !location) {
        socket.emit("error", { message: "يجب إدخال معرف السائق والموقع" });
        return;
      }

      // تحديث الموقع لمتابعي الطلب
      if (orderId) {
        this.io.to(`order:${orderId}`).emit("driver:location:updated", {
          driverId,
          orderId,
          location,
          timestamp: new Date(),
        });
      }
      
      // تحديث الموقع للمشرفين
      this.io.to("admin:room").emit("driver:location:updated", {
        driverId,
        location,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Driver location update error:", error.message);
      socket.emit("error", { message: "فشل تحديث الموقع" });
    }
  }

  // ====== Admin Handlers ======
  
  handleAdminJoin(socket) {
    try {
      const userId = this.getUserIdBySocket(socket.id);
      if (!userId) {
        socket.emit("error", { message: "يجب تسجيل الدخول أولاً" });
        return;
      }

      // TODO: التحقق من صلاحيات المشرف
      socket.join("admin:room");
      
      console.log(`👑 Admin ${userId} joined admin room`);
      
      socket.emit("admin:joined", {
        message: "تم الانضمام لغرفة المشرفين",
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Admin join error:", error.message);
      socket.emit("error", { message: "فشل الانضمام لغرفة المشرفين" });
    }
  }

  handleDashboardSubscription(socket) {
    try {
      const userId = this.getUserIdBySocket(socket.id);
      if (!userId) {
        socket.emit("error", { message: "يجب تسجيل الدخول أولاً" });
        return;
      }

      socket.join("dashboard:updates");
      
      console.log(`📊 User ${userId} subscribed to dashboard updates`);
      
      socket.emit("dashboard:subscribed", {
        message: "تم الاشتراك في تحديثات لوحة التحكم",
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Dashboard subscription error:", error.message);
      socket.emit("error", { message: "فشل الاشتراك في لوحة التحكم" });
    }
  }

  // ====== Disconnection Handler ======
  
  handleDisconnect(socket, reason) {
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
  }

  // ====== Helper Methods ======
  
  /**
   * التحقق من صلاحية الوصول للمطعم
   */
  checkRestaurantAccess(user, restaurantId) {
    // صاحب المطعم
    if (user.role === "restaurant_owner") {
      return user.restaurantOwnerInfo?.restaurant?.toString() === restaurantId;
    }
    
    // المشرف أو الموظف
    if (user.role === "admin" || user.role === "staff") {
      return true;
    }
    
    // السائق - قد يرى بعض المعلومات
    if (user.role === "driver") {
      // يمكن للسائق رؤية مطاعم الطلبات الموكلة إليه
      return true;
    }
    
    return false;
  }

  getUserIdBySocket(socketId) {
    for (const [userId, sid] of this.userSockets.entries()) {
      if (sid === socketId) {
        return userId;
      }
    }
    return null;
  }

  // ====== Core Methods ======
  
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

  getUserRooms(userId) {
    return this.userRooms.has(userId.toString()) 
      ? Array.from(this.userRooms.get(userId.toString())) 
      : [];
  }

  // ====== Chat Service Integration ======
  
  initializeChatServices() {
    try {
      if (!this.io) {
        console.warn("⚠️ Socket.io not initialized yet, chat service will be delayed");
        return null;
      }

      const ChatSocketService = require("./chat.socket.service");
      
      const chatSocketService = ChatSocketService;
      
      if (chatSocketService.initializeWithIO) {
        chatSocketService.initializeWithIO(this.io);
      }
      
      this.chatSocketService = chatSocketService;
      
      console.log("✅ Chat socket service initialized");
      return chatSocketService;
    } catch (error) {
      console.error("❌ Chat service initialization failed:", error.message);
      return null;
    }
  }

  // ====== Utility Methods ======
  
  getIO() {
    if (!this.io) {
      console.warn("⚠️ Socket.io not initialized yet");
    }
    return this.io;
  }

  isInitialized() {
    return !!this.io;
  }

  getSocketInfo(socketId) {
    const userId = this.getUserIdBySocket(socketId);
    return {
      socketId,
      userId,
      isConnected: !!userId,
      rooms: userId ? this.getUserRooms(userId) : [],
    };
  }

  getAllConnectionsInfo() {
    const connections = [];
    
    for (const [userId, socketId] of this.userSockets.entries()) {
      connections.push({
        userId,
        socketId,
        rooms: this.getUserRooms(userId),
        connectedAt: new Date().toISOString(), // يمكن إضافة وقت الاتصال الفعلي
      });
    }
    
    return connections;
  }
}

const socketServiceInstance = new SocketService();

module.exports = {
  // الأساسية
  initialize: (server) => socketServiceInstance.initialize(server),
  
  // إرسال الإشعارات
  sendToUser: (userId, data) => socketServiceInstance.sendToUser(userId, data),
  sendToUsers: (userIds, data) => socketServiceInstance.sendToUsers(userIds, data),
  sendToRoom: (room, data) => socketServiceInstance.sendToRoom(room, data),
  broadcast: (data, excludeSocketId) => socketServiceInstance.broadcast(data, excludeSocketId),
  
  // معلومات الاتصال
  isUserConnected: (userId) => socketServiceInstance.isUserConnected(userId),
  getConnectedUsers: () => socketServiceInstance.getConnectedUsers(),
  getConnectedUsersCount: () => socketServiceInstance.getConnectedUsersCount(),
  getUserRooms: (userId) => socketServiceInstance.getUserRooms(userId),
  getSocketInfo: (socketId) => socketServiceInstance.getSocketInfo(socketId),
  getAllConnectionsInfo: () => socketServiceInstance.getAllConnectionsInfo(),
  
  // الخدمات
  initializeChatServices: () => socketServiceInstance.initializeChatServices(),
  getIO: () => socketServiceInstance.getIO(),
  isInitialized: () => socketServiceInstance.isInitialized(),
  
  // Instance للاستخدام المباشر إذا لزم الأمر
  instance: socketServiceInstance
};