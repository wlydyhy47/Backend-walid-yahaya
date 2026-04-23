// ============================================
// ملف: src/services/socket.service.js
// الوصف: خدمة Socket.io الموحدة مع الدردشة وإدارة حالة المندوبين
// الإصدار: 3.0 (مع دعم كامل للمندوبين والأدمن)
// ============================================

const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

// استيراد موحد من models/index.js
const { User, Message, Conversation } = require('../models');

const notificationService = require("./notification.service");
const { businessLogger } = require("../utils/logger.util");

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map();      // userId -> Set<socketId>
    this.socketUser = new Map();        // socketId -> userId
    this.userRooms = new Map();         // userId -> Set<rooms>
    this.userStatus = new Map();        // userId -> { online, lastSeen, role }
    this.typingUsers = new Map();       // conversationId -> Set<userId>
    this.messageQueue = new Map();      // conversationId -> [messages]
    this.onlineUsers = new Map();       // userId -> { status, lastSeen }
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
        transports: ['websocket', 'polling']
      });

      this.setupEventHandlers();
      businessLogger.info("Socket.io initialized successfully");

      // بدء معالج قائمة الانتظار
      this.startQueueProcessor();

      return this.io;
    } catch (error) {
      businessLogger.error("Socket.io initialization failed:", error);
      throw error;
    }
  }

  /**
   * إعداد معالجي الأحداث
   */
  setupEventHandlers() {
    if (!this.io) {
      businessLogger.error("Socket.io not initialized");
      return;
    }

    // Middleware للمصادقة
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          socket.userId = null;
          return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        next();
      } catch (error) {
        socket.userId = null;
        next();
      }
    });

    this.io.on("connection", async (socket) => {
      businessLogger.info(`Socket connected: ${socket.id}`, {
        userId: socket.userId
      });

      // تسجيل الاتصال
      if (socket.userId) {
        await this.handleUserConnection(socket);
      }

      // ====== Authentication ======
      socket.on("authenticate", async (token) => {
        await this.handleAuthentication(socket, token);
      });

      // ====== Presence ======
      socket.on("presence:update", (data) => {
        this.handlePresenceUpdate(socket, data);
      });

      // ====== Chat Events ======
      socket.on("chat:join", (data) => {
        this.handleJoinChat(socket, data);
      });

      socket.on("chat:leave", (data) => {
        this.handleLeaveChat(socket, data);
      });

      socket.on("chat:message:send", async (data) => {
        await this.handleSendMessage(socket, data);
      });

      socket.on("chat:message:read", async (data) => {
        await this.handleMessageRead(socket, data);
      });

      socket.on("chat:typing", (data) => {
        this.handleTyping(socket, data);
      });

      socket.on("chat:message:react", async (data) => {
        await this.handleReaction(socket, data);
      });

      socket.on("chat:message:delete", async (data) => {
        await this.handleDeleteMessage(socket, data);
      });

      socket.on("chat:message:edit", async (data) => {
        await this.handleEditMessage(socket, data);
      });

      socket.on("chat:history:request", async (data) => {
        await this.handleHistoryRequest(socket, data);
      });

      socket.on("chat:search", async (data) => {
        await this.handleSearch(socket, data);
      });

      socket.on("chat:support:join", (data) => {
        this.handleJoinSupport(socket, data);
      });

      // ====== Room Management ======
      socket.on("room:join", (room) => {
        this.handleRoomJoin(socket, room);
      });

      socket.on("room:leave", (room) => {
        this.handleRoomLeave(socket, room);
      });

      // ====== Driver Events (محدث) ======

      // ✅ حدث تحديث موقع المندوب
      socket.on("driver:location:updated", async (data) => {
        try {
          const { latitude, longitude, orderId } = data;
          const userId = socket.userId;

          if (!userId) {
            socket.emit("error", { message: "Unauthenticated" });
            return;
          }

          const user = await User.findById(userId);
          if (!user || user.role !== 'driver') {
            socket.emit("error", { message: "Only drivers can update location" });
            return;
          }

          if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            socket.emit("error", { message: "Invalid coordinates" });
            return;
          }

          businessLogger.info(`Driver ${userId} updated location`, { latitude, longitude, orderId });

          // إرسال الموقع إلى العميل إذا كان الطلب نشطاً
          if (orderId) {
            socket.to(`order:${orderId}`).emit("driver:location:tracking", {
              driverId: userId,
              driverName: user.name,
              location: { latitude, longitude },
              orderId,
              timestamp: new Date()
            });

            // إرسال للأدمن للتتبع
            socket.broadcast.emit("driver:location:broadcast", {
              driverId: userId,
              driverName: user.name,
              location: { latitude, longitude },
              orderId,
              timestamp: new Date()
            });
          }

          socket.emit("driver:location:updated:ack", {
            success: true,
            timestamp: new Date()
          });

        } catch (error) {
          businessLogger.error("Driver location update error:", error);
          socket.emit("error", { message: "Failed to update location" });
        }
      });

      // ✅ حدث تبديل حالة التوفر
      socket.on("driver:availability:toggle", async (data) => {
        try {
          const { isAvailable } = data;
          const userId = socket.userId;

          if (!userId) {
            socket.emit("error", { message: "Unauthenticated" });
            return;
          }

          const user = await User.findById(userId);
          if (!user || user.role !== 'driver') {
            socket.emit("error", { message: "Only drivers can change availability" });
            return;
          }

          const oldStatus = user.driverInfo?.isAvailable || false;

          await User.findByIdAndUpdate(userId, {
            'driverInfo.isAvailable': isAvailable,
            'driverInfo.lastAvailableChange': new Date()
          });

          businessLogger.info(`Driver ${userId} toggled availability`, { oldStatus, newStatus: isAvailable });

          // بث التغيير لجميع الأدمن
          this.io.emit('driver:status:changed', {
            driverId: userId,
            driverName: user.name,
            isAvailable: isAvailable,
            isOnline: user.isOnline,
            timestamp: new Date()
          });

          socket.emit("driver:availability:toggled:ack", {
            success: true,
            isAvailable: isAvailable,
            timestamp: new Date()
          });

        } catch (error) {
          businessLogger.error("Driver availability toggle error:", error);
          socket.emit("error", { message: "Failed to toggle availability" });
        }
      });

      // ✅ حدث بدء التوصيل
      socket.on("driver:delivery:started", async (data) => {
        try {
          const { orderId } = data;
          const userId = socket.userId;

          if (!userId) {
            socket.emit("error", { message: "Unauthenticated" });
            return;
          }

          if (!orderId) {
            socket.emit("error", { message: "Order ID required" });
            return;
          }

          const user = await User.findById(userId);
          if (!user || user.role !== 'driver') {
            socket.emit("error", { message: "Only drivers can start delivery" });
            return;
          }

          businessLogger.info(`Driver ${userId} started delivery for order ${orderId}`);

          // إرسال إشعار للعميل
          socket.to(`order:${orderId}`).emit("driver:delivery:started", {
            driverId: userId,
            driverName: user.name,
            orderId,
            timestamp: new Date()
          });

          // إرسال للأدمن
          this.broadcast("order:status:changed", {
            orderId,
            status: "picked",
            driverId: userId,
            driverName: user.name,
            timestamp: new Date()
          });

          socket.emit("driver:delivery:started:ack", {
            success: true,
            orderId,
            timestamp: new Date()
          });

        } catch (error) {
          businessLogger.error("Driver delivery start error:", error);
          socket.emit("error", { message: "Failed to start delivery" });
        }
      });

      // ✅ حدث إكمال التوصيل
      socket.on("driver:delivery:completed", async (data) => {
        try {
          const { orderId, signature, deliveryPhoto } = data;
          const userId = socket.userId;

          if (!userId) {
            socket.emit("error", { message: "Unauthenticated" });
            return;
          }

          if (!orderId) {
            socket.emit("error", { message: "Order ID required" });
            return;
          }

          const user = await User.findById(userId);
          if (!user || user.role !== 'driver') {
            socket.emit("error", { message: "Only drivers can complete delivery" });
            return;
          }

          businessLogger.info(`Driver ${userId} completed delivery for order ${orderId}`);

          // إرسال إشعار للعميل
          socket.to(`order:${orderId}`).emit("driver:delivery:completed", {
            driverId: userId,
            driverName: user.name,
            orderId,
            signature,
            deliveryPhoto,
            timestamp: new Date()
          });

          // إرسال للأدمن
          this.broadcast("order:status:changed", {
            orderId,
            status: "delivered",
            driverId: userId,
            driverName: user.name,
            timestamp: new Date()
          });

          socket.emit("driver:delivery:completed:ack", {
            success: true,
            orderId,
            timestamp: new Date()
          });

        } catch (error) {
          businessLogger.error("Driver delivery complete error:", error);
          socket.emit("error", { message: "Failed to complete delivery" });
        }
      });

      // ✅ حدث طلب حالة المندوب (من الأدمن)
      socket.on("admin:request:driver:status", async (data) => {
        try {
          const userId = socket.userId;
          
          if (!userId) {
            socket.emit("error", { message: "Unauthenticated" });
            return;
          }

          const admin = await User.findById(userId);
          if (!admin || admin.role !== 'admin') {
            socket.emit("error", { message: "Only admins can request driver status" });
            return;
          }

          const { driverId } = data;
          const driver = await User.findById(driverId).select('name driverInfo.isAvailable isOnline');

          if (!driver || driver.role !== 'driver') {
            socket.emit("error", { message: "Driver not found" });
            return;
          }

          const isActuallyOnline = this.isUserOnline(driverId);

          socket.emit("admin:driver:status:response", {
            driverId: driver._id,
            driverName: driver.name,
            isOnline: isActuallyOnline,
            isAvailable: driver.driverInfo?.isAvailable || false,
            timestamp: new Date()
          });

        } catch (error) {
          businessLogger.error("Admin request driver status error:", error);
          socket.emit("error", { message: "Failed to get driver status" });
        }
      });

      // ====== Disconnection ======
      socket.on("disconnect", (reason) => {
        this.handleDisconnect(socket, reason);
      });

      socket.on("error", (error) => {
        businessLogger.error(`Socket error ${socket.id}:`, error);
      });
    });
  }

  // ====== Connection Handlers ======

  /**
   * معالجة اتصال المستخدم (محدث)
   */
  async handleUserConnection(socket) {
    const userId = socket.userId;

    // تخزين الاتصال
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socket.id);
    this.socketUser.set(socket.id, userId);

    // جلب دور المستخدم
    const user = await User.findById(userId).select('name role driverInfo.isAvailable');
    
    // تحديث حالة المستخدم
    this.userStatus.set(userId, {
      online: true,
      lastSeen: new Date(),
      role: user?.role
    });

    // تحديث في قاعدة البيانات
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date()
    });

    // ====== ✅ إضافة: إرسال حالة المندوب للأدمن عند الاتصال ======
    if (user && user.role === 'driver') {
      this.io.emit('driver:connected', {
        driverId: userId,
        driverName: user.name,
        isOnline: true,
        isAvailable: user.driverInfo?.isAvailable || false,
        timestamp: new Date()
      });
      
      businessLogger.info(`Driver ${user.name} (${userId}) connected, availability: ${user.driverInfo?.isAvailable}`);
    }

    // الانضمام إلى غرفة المستخدم
    socket.join(`user:${userId}`);

    // إعلام الآخرين
    socket.broadcast.emit("user:connected", {
      userId,
      timestamp: new Date()
    });

    businessLogger.info(`User ${userId} connected`, {
      socketId: socket.id,
      role: user?.role
    });
  }

  /**
   * معالجة المصادقة
   */
  async handleAuthentication(socket, token) {
    try {
      if (!token) {
        socket.emit("error", { message: "Token required" });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;

      await this.handleUserConnection(socket);

      socket.emit("authenticated", {
        message: "Authentication successful",
        userId: decoded.id
      });
    } catch (error) {
      businessLogger.error("Authentication error:", error);
      socket.emit("error", { message: "Invalid token" });
    }
  }

  // ====== Chat Handlers (مختصرة للاختصار) ======

  async handleJoinChat(socket, data) { /* ... يبقى كما هو ... */ }
  handleLeaveChat(socket, data) { /* ... يبقى كما هو ... */ }
  async handleSendMessage(socket, data) { /* ... يبقى كما هو ... */ }
  async handleMessageRead(socket, data) { /* ... يبقى كما هو ... */ }
  handleTyping(socket, data) { /* ... يبقى كما هو ... */ }
  async handleReaction(socket, data) { /* ... يبقى كما هو ... */ }
  async handleDeleteMessage(socket, data) { /* ... يبقى كما هو ... */ }
  async handleEditMessage(socket, data) { /* ... يبقى كما هو ... */ }
  async handleHistoryRequest(socket, data) { /* ... يبقى كما هو ... */ }
  async handleSearch(socket, data) { /* ... يبقى كما هو ... */ }
  async handleJoinSupport(socket, data) { /* ... يبقى كما هو ... */ }

  // ====== Presence Handlers ======

  handlePresenceUpdate(socket, data) {
    const userId = socket.userId;
    if (!userId) return;

    const { isOnline, status } = data;

    this.userStatus.set(userId, {
      online: isOnline,
      status: status || 'online',
      lastSeen: new Date()
    });

    User.findByIdAndUpdate(userId, {
      isOnline,
      lastSeen: new Date()
    }).catch(err => businessLogger.error('Update presence error:', err));

    socket.broadcast.emit("presence:changed", {
      userId,
      isOnline,
      status,
      timestamp: new Date()
    });
  }

  // ====== Room Management ======

  handleRoomJoin(socket, room) {
    socket.join(room);
    const userId = socket.userId;
    if (userId) {
      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set());
      }
      this.userRooms.get(userId).add(room);
    }
    businessLogger.info(`Socket ${socket.id} joined room ${room}`);
  }

  handleRoomLeave(socket, room) {
    socket.leave(room);
    const userId = socket.userId;
    if (userId && this.userRooms.has(userId)) {
      this.userRooms.get(userId).delete(room);
    }
    businessLogger.info(`Socket ${socket.id} left room ${room}`);
  }

  // ====== Disconnection Handler (محدث) ======

  async handleDisconnect(socket, reason) {
    const userId = this.socketUser.get(socket.id);

    businessLogger.info(`Socket disconnected: ${socket.id}`, {
      userId,
      reason
    });

    if (userId) {
      this.socketUser.delete(socket.id);

      if (this.userSockets.has(userId)) {
        this.userSockets.get(userId).delete(socket.id);

        if (this.userSockets.get(userId).size === 0) {
          this.userStatus.set(userId, {
            online: false,
            lastSeen: new Date()
          });

          // ====== ✅ إضافة: إرسال قطع اتصال المندوب للأدمن ======
          const user = await User.findById(userId).select('name role driverInfo.isAvailable');
          
          if (user && user.role === 'driver') {
            this.io.emit('driver:disconnected', {
              driverId: userId,
              driverName: user.name,
              isOnline: false,
              isAvailable: user.driverInfo?.isAvailable || false,
              timestamp: new Date(),
              reason
            });
            
            businessLogger.info(`Driver ${user.name} (${userId}) disconnected, reason: ${reason}`);
          }

          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date()
          });

          socket.broadcast.emit("user:disconnected", {
            userId,
            timestamp: new Date()
          });
        }
      }

      if (this.userRooms.has(userId)) {
        const rooms = this.userRooms.get(userId);
        rooms.forEach(room => socket.leave(room));
        this.userRooms.delete(userId);
      }

      for (const [convId, users] of this.typingUsers.entries()) {
        if (users.has(userId)) {
          users.delete(userId);
          socket.to(`chat:${convId}`).emit("chat:typing", {
            conversationId: convId,
            userId,
            isTyping: false,
            timestamp: new Date()
          });
        }
      }
    }
  }

  // ====== Core Methods ======

  sendToUser(userId, data) {
    try {
      if (!this.io) {
        businessLogger.error("Socket.io not initialized");
        return { success: false, error: "Socket.io not initialized" };
      }

      const sockets = this.userSockets.get(userId?.toString());

      if (sockets && sockets.size > 0) {
        sockets.forEach(socketId => {
          this.io.to(socketId).emit(data.type, data.data || data);
        });

        businessLogger.debug(`Sent ${data.type} to user ${userId}`, {
          socketsCount: sockets.size
        });

        return { success: true, delivered: true, socketsCount: sockets.size };
      }

      businessLogger.debug(`User ${userId} is offline`, { type: data.type });
      return { success: true, delivered: false, offline: true };
    } catch (error) {
      businessLogger.error("Send to user error:", error);
      return { success: false, error: error.message };
    }
  }

  sendToRoom(room, data) {
    try {
      if (!this.io) {
        return { success: false, error: "Socket.io not initialized" };
      }

      this.io.to(room).emit(data.type, data.data || data);

      businessLogger.debug(`Sent ${data.type} to room ${room}`);
      return { success: true };
    } catch (error) {
      businessLogger.error("Send to room error:", error);
      return { success: false, error: error.message };
    }
  }

  broadcast(data, excludeSocketId = null) {
    try {
      if (!this.io) {
        return { success: false, error: "Socket.io not initialized" };
      }

      if (excludeSocketId) {
        this.io.except(excludeSocketId).emit(data.type, data.data || data);
      } else {
        this.io.emit(data.type, data.data || data);
      }

      businessLogger.debug(`Broadcast ${data.type} to all clients`);
      return { success: true };
    } catch (error) {
      businessLogger.error("Broadcast error:", error);
      return { success: false, error: error.message };
    }
  }

  // ====== Driver-Specific Methods ======

  /**
   * إرسال تحديث موقع المندوب
   */
  sendDriverLocationUpdate(orderId, driverId, location) {
    this.sendToRoom(`order:${orderId}`, {
      type: 'driver:location:updated',
      data: {
        orderId,
        driverId,
        location,
        timestamp: new Date()
      }
    });
  }

  /**
   * إرسال تحديث موقع لجميع المندوبين (للمشرف)
   */
  broadcastAllDriversLocations(driversLocations) {
    this.broadcast({
      type: 'drivers:locations:updated',
      data: driversLocations
    });
  }

  /**
   * بث حالة المندوب لجميع الأدمن
   */
  broadcastDriverStatus(driverId, status) {
    this.io.emit('driver:status:broadcast', {
      driverId,
      ...status,
      timestamp: new Date()
    });
  }

  /**
   * إرسال موقع المندوب لطلب محدد
   */
  sendDriverLocationToOrder(orderId, driverId, location) {
    this.sendToRoom(`order:${orderId}`, {
      type: 'driver:location:tracking',
      data: {
        driverId,
        location,
        timestamp: new Date()
      }
    });
  }

  // ====== Helper Methods ======

  async sendOfflineNotifications(conversation, message) { /* ... يبقى كما هو ... */ }
  async updateConversationReadStats(conversationId, userId) { /* ... يبقى كما هو ... */ }
  startQueueProcessor() { /* ... يبقى كما هو ... */ }
  async processMessageQueue() { /* ... يبقى كما هو ... */ }

  /**
   * الحصول على دور المستخدم
   */
  async getUserRole(userId) {
    try {
      const user = await User.findById(userId).select('role');
      return user?.role;
    } catch (error) {
      businessLogger.error('Error getting user role:', error);
      return null;
    }
  }

  // ====== Info Methods ======

  isUserOnline(userId) {
    return this.userSockets.has(userId?.toString()) &&
      this.userSockets.get(userId?.toString())?.size > 0;
  }

  getUserStatus(userId) {
    return this.userStatus.get(userId?.toString()) || {
      online: false,
      lastSeen: null,
      role: null
    };
  }

  getOnlineUsersCount() {
    return this.userSockets.size;
  }

  getOnlineUsers() {
    return Array.from(this.userStatus.entries())
      .filter(([_, status]) => status.online)
      .map(([userId]) => userId);
  }

  getUserRooms(userId) {
    return this.userRooms.has(userId?.toString())
      ? Array.from(this.userRooms.get(userId.toString()))
      : [];
  }

  getSocketInfo(socketId) {
    const userId = this.socketUser.get(socketId);
    return {
      socketId,
      userId,
      isConnected: !!userId,
      rooms: userId ? this.getUserRooms(userId) : []
    };
  }

  getAllConnectionsInfo() {
    const connections = [];

    for (const [userId, sockets] of this.userSockets.entries()) {
      connections.push({
        userId,
        sockets: Array.from(sockets),
        status: this.getUserStatus(userId),
        rooms: this.getUserRooms(userId)
      });
    }

    return connections;
  }

  getStats() {
    return {
      totalSockets: this.socketUser.size,
      onlineUsers: this.userSockets.size,
      totalRooms: this.io?.sockets?.adapter?.rooms?.size || 0,
      connections: this.getAllConnectionsInfo().length,
      typingUsers: this.typingUsers.size,
      messageQueue: this.messageQueue.size
    };
  }

  getIO() {
    return this.io;
  }

  isInitialized() {
    return !!this.io;
  }
}

// تصدير نسخة واحدة (Singleton)
const socketServiceInstance = new SocketService();

module.exports = socketServiceInstance;