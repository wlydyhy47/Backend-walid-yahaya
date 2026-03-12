// ============================================
// ملف: src/services/socket.service.js (محدث)
// الوصف: خدمة Socket.io المتقدمة
// ============================================

const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const { businessLogger } = require("../utils/logger.util");

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set<socketId>
    this.socketUser = new Map();   // socketId -> userId
    this.userRooms = new Map();    // userId -> Set<rooms>
    this.userStatus = new Map();    // userId -> { online, lastSeen }
    this.chatSocketService = null;
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
      
      this.initializeChatServices();
      
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

      // ====== Typing Indicators ======
      socket.on("typing:start", (data) => {
        this.handleTypingStart(socket, data);
      });

      socket.on("typing:stop", (data) => {
        this.handleTypingStop(socket, data);
      });

      // ====== Read Receipts ======
      socket.on("message:read", (data) => {
        this.handleMessageRead(socket, data);
      });

      // ====== Room Management ======
      socket.on("room:join", (room) => {
        this.handleRoomJoin(socket, room);
      });

      socket.on("room:leave", (room) => {
        this.handleRoomLeave(socket, room);
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
   * معالجة اتصال المستخدم
   */
  async handleUserConnection(socket) {
    const userId = socket.userId;

    // تخزين الاتصال
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socket.id);
    this.socketUser.set(socket.id, userId);

    // تحديث حالة المستخدم
    this.userStatus.set(userId, {
      online: true,
      lastSeen: new Date()
    });

    // تحديث في قاعدة البيانات
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date()
    });

    // الانضمام إلى غرفة المستخدم
    socket.join(`user:${userId}`);

    // إعلام الآخرين
    socket.broadcast.emit("user:connected", {
      userId,
      timestamp: new Date()
    });

    businessLogger.info(`User ${userId} connected`, {
      socketId: socket.id
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

  // ====== Presence Handlers ======

  /**
   * معالجة تحديث الحالة
   */
  handlePresenceUpdate(socket, data) {
    const userId = socket.userId;
    if (!userId) return;

    const { isOnline, status } = data;

    this.userStatus.set(userId, {
      online: isOnline,
      status: status || 'online',
      lastSeen: new Date()
    });

    // تحديث في قاعدة البيانات
    User.findByIdAndUpdate(userId, {
      isOnline,
      lastSeen: new Date()
    }).catch(err => businessLogger.error('Update presence error:', err));

    // إعلام المشتركين
    socket.broadcast.emit("presence:changed", {
      userId,
      isOnline,
      status,
      timestamp: new Date()
    });
  }

  // ====== Typing Handlers ======

  /**
   * معالجة بدء الكتابة
   */
  handleTypingStart(socket, data) {
    const { conversationId } = data;
    const userId = socket.userId;

    if (!userId || !conversationId) return;

    socket.to(`chat:${conversationId}`).emit("typing:started", {
      conversationId,
      userId,
      timestamp: new Date()
    });
  }

  /**
   * معالجة توقف الكتابة
   */
  handleTypingStop(socket, data) {
    const { conversationId } = data;
    const userId = socket.userId;

    if (!userId || !conversationId) return;

    socket.to(`chat:${conversationId}`).emit("typing:stopped", {
      conversationId,
      userId,
      timestamp: new Date()
    });
  }

  // ====== Read Receipts ======

  /**
   * معالجة قراءة الرسالة
   */
  async handleMessageRead(socket, data) {
    const { conversationId, messageId } = data;
    const userId = socket.userId;

    if (!userId || !conversationId || !messageId) return;

    try {
      const Message = require("../models/message.model");
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: {
          readReceipts: {
            user: userId,
            readAt: new Date()
          }
        }
      });

      socket.to(`chat:${conversationId}`).emit("message:read", {
        conversationId,
        messageId,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      businessLogger.error('Message read error:', error);
    }
  }

  // ====== Room Management ======

  /**
   * معالجة الانضمام لغرفة
   */
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

  /**
   * معالجة مغادرة غرفة
   */
  handleRoomLeave(socket, room) {
    socket.leave(room);

    const userId = socket.userId;
    if (userId && this.userRooms.has(userId)) {
      this.userRooms.get(userId).delete(room);
    }

    businessLogger.info(`Socket ${socket.id} left room ${room}`);
  }

  // ====== Disconnection Handler ======

  /**
   * معالجة قطع الاتصال
   */
  async handleDisconnect(socket, reason) {
    const userId = this.socketUser.get(socket.id);

    businessLogger.info(`Socket disconnected: ${socket.id}`, { 
      userId, 
      reason 
    });

    if (userId) {
      // إزالة من التخزين
      this.socketUser.delete(socket.id);
      
      if (this.userSockets.has(userId)) {
        this.userSockets.get(userId).delete(socket.id);

        // إذا كان آخر اتصال للمستخدم
        if (this.userSockets.get(userId).size === 0) {
          this.userStatus.set(userId, {
            online: false,
            lastSeen: new Date()
          });

          // تحديث في قاعدة البيانات
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date()
          });

          // إعلام الآخرين
          socket.broadcast.emit("user:disconnected", {
            userId,
            timestamp: new Date()
          });
        }
      }

      // تنظيف الغرف
      if (this.userRooms.has(userId)) {
        const rooms = this.userRooms.get(userId);
        rooms.forEach(room => socket.leave(room));
        this.userRooms.delete(userId);
      }
    }
  }

  // ====== Core Methods ======

  /**
   * إرسال إلى مستخدم
   */
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

  /**
   * إرسال إلى عدة مستخدمين
   */
  sendToUsers(userIds, data) {
    const results = {
      total: userIds.length,
      delivered: 0,
      offline: 0,
      failed: 0,
      errors: []
    };

    userIds.forEach(userId => {
      const result = this.sendToUser(userId, data);
      if (result.success) {
        if (result.delivered) {
          results.delivered++;
        } else if (result.offline) {
          results.offline++;
        }
      } else {
        results.failed++;
        results.errors.push({ userId, error: result.error });
      }
    });

    businessLogger.info(`Broadcast to ${userIds.length} users`, {
      delivered: results.delivered,
      offline: results.offline
    });

    return results;
  }

  /**
   * إرسال إلى غرفة
   */
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

  /**
   * بث للجميع
   */
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

  // ====== Info Methods ======

  /**
   * التحقق من اتصال المستخدم
   */
  isUserOnline(userId) {
    return this.userSockets.has(userId?.toString()) && 
           this.userSockets.get(userId?.toString())?.size > 0;
  }

  /**
   * الحصول على حالة المستخدم
   */
  getUserStatus(userId) {
    return this.userStatus.get(userId?.toString()) || {
      online: false,
      lastSeen: null
    };
  }

  /**
   * الحصول على عدد المستخدمين المتصلين
   */
  getOnlineUsersCount() {
    return this.userSockets.size;
  }

  /**
   * الحصول على جميع المستخدمين المتصلين
   */
  getOnlineUsers() {
    return Array.from(this.userStatus.entries())
      .filter(([_, status]) => status.online)
      .map(([userId]) => userId);
  }

  /**
   * الحصول على غرف المستخدم
   */
  getUserRooms(userId) {
    return this.userRooms.has(userId?.toString()) 
      ? Array.from(this.userRooms.get(userId.toString()))
      : [];
  }

  // ====== Chat Services ======

  /**
   * تهيئة خدمات الدردشة
   */
  initializeChatServices() {
    try {
      if (!this.io) {
        businessLogger.warn("Socket.io not ready for chat services");
        return null;
      }

      const ChatSocketService = require("./chat.socket.service");
      
      if (ChatSocketService.initializeWithIO) {
        ChatSocketService.initializeWithIO(this.io);
      }
      
      this.chatSocketService = ChatSocketService;
      
      businessLogger.info("Chat socket service initialized");
      return ChatSocketService;
    } catch (error) {
      businessLogger.error("Chat service initialization failed:", error);
      return null;
    }
  }

  // ====== Utility Methods ======

  getIO() {
    return this.io;
  }

  isInitialized() {
    return !!this.io;
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

  /**
   * إحصائيات Socket.io
   */
  getStats() {
    return {
      totalSockets: this.socketUser.size,
      onlineUsers: this.userSockets.size,
      totalRooms: this.io?.sockets?.adapter?.rooms?.size || 0,
      connections: this.getAllConnectionsInfo().length
    };
  }
}

const socketServiceInstance = new SocketService();

module.exports = {
  initialize: (server) => socketServiceInstance.initialize(server),
  
  // إرسال الإشعارات
  sendToUser: (userId, data) => socketServiceInstance.sendToUser(userId, data),
  sendToUsers: (userIds, data) => socketServiceInstance.sendToUsers(userIds, data),
  sendToRoom: (room, data) => socketServiceInstance.sendToRoom(room, data),
  broadcast: (data, excludeSocketId) => socketServiceInstance.broadcast(data, excludeSocketId),
  
  // معلومات الاتصال
  isUserOnline: (userId) => socketServiceInstance.isUserOnline(userId),
  getUserStatus: (userId) => socketServiceInstance.getUserStatus(userId),
  getOnlineUsersCount: () => socketServiceInstance.getOnlineUsersCount(),
  getOnlineUsers: () => socketServiceInstance.getOnlineUsers(),
  getUserRooms: (userId) => socketServiceInstance.getUserRooms(userId),
  getSocketInfo: (socketId) => socketServiceInstance.getSocketInfo(socketId),
  getAllConnectionsInfo: () => socketServiceInstance.getAllConnectionsInfo(),
  getStats: () => socketServiceInstance.getStats(),
  
  // الخدمات
  initializeChatServices: () => socketServiceInstance.initializeChatServices(),
  getIO: () => socketServiceInstance.getIO(),
  isInitialized: () => socketServiceInstance.isInitialized(),
  
  // Instance للاستخدام المباشر
  instance: socketServiceInstance
};