// ============================================
// ملف: src/services/socket.service.js (المدمج)
// الوصف: خدمة Socket.io الموحدة مع الدردشة
// ============================================

const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

// ✅ استيراد موحد من models/index.js
const { User, Message, Conversation } = require('../models');

const notificationService = require("./notification.service");
const { businessLogger } = require("../utils/logger.util");

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set<socketId>
    this.socketUser = new Map();   // socketId -> userId
    this.userRooms = new Map();    // userId -> Set<rooms>
    this.userStatus = new Map();    // userId -> { online, lastSeen }
    this.typingUsers = new Map();   // conversationId -> Set<userId>
    this.messageQueue = new Map();   // conversationId -> [messages]
    this.onlineUsers = new Map();
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

  // ====== Chat Handlers ======

  /**
   * معالجة الانضمام إلى محادثة
   */
  async handleJoinChat(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!userId || !conversationId) {
        socket.emit("error", { message: "Missing required data" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        deletedAt: null
      });

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found or access denied" });
        return;
      }

      const room = `chat:${conversationId}`;
      socket.join(room);

      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set());
      }
      this.userRooms.get(userId).add(room);

      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Map());
      }
      this.onlineUsers.get(userId).set(conversationId, {
        socketId: socket.id,
        joinedAt: new Date()
      });

      socket.to(room).emit("chat:participant:joined", {
        conversationId,
        userId,
        timestamp: new Date()
      });

      const unreadMessages = await Message.find({
        conversation: conversationId,
        "delivery.readBy.user": { $ne: userId },
        "deleted.isDeleted": false
      })
        .sort({ "delivery.sentAt": -1 })
        .limit(20)
        .populate("sender", "name image")
        .lean();

      if (unreadMessages.length > 0) {
        socket.emit("chat:history:unread", {
          conversationId,
          messages: unreadMessages.reverse()
        });
      }

      businessLogger.info(`User ${userId} joined chat ${conversationId}`);
    } catch (error) {
      businessLogger.error("Join chat error:", error);
      socket.emit("error", { message: "Failed to join chat" });
    }
  }

  /**
   * معالجة مغادرة محادثة
   */
  handleLeaveChat(socket, data) {
    const { conversationId } = data;
    const userId = socket.userId;

    if (!userId || !conversationId) return;

    const room = `chat:${conversationId}`;
    socket.leave(room);

    if (this.userRooms.has(userId)) {
      this.userRooms.get(userId).delete(room);
    }

    if (this.onlineUsers.has(userId)) {
      this.onlineUsers.get(userId).delete(conversationId);
    }

    socket.to(room).emit("chat:participant:left", {
      conversationId,
      userId,
      timestamp: new Date()
    });

    businessLogger.info(`User ${userId} left chat ${conversationId}`);
  }

  /**
   * معالجة إرسال رسالة
   */
  async handleSendMessage(socket, data) {
    try {
      const { conversationId, content, type = "text", replyTo = null, tempId } = data;
      const userId = socket.userId;

      if (!userId || !conversationId || !content) {
        socket.emit("error", { message: "Missing required data" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        deletedAt: null
      });

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      let message;
      if (type === "text") {
        message = await Message.createTextMessage(conversationId, userId, content, replyTo);
      } else {
        socket.emit("error", { message: "Unsupported message type" });
        return;
      }

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "name image role")
        .populate("replyTo", "content.text sender type")
        .lean();

      if (tempId) {
        populatedMessage.tempId = tempId;
      }

      const room = `chat:${conversationId}`;
      socket.to(room).emit("chat:message:new", {
        conversationId,
        message: populatedMessage,
        timestamp: new Date()
      });

      socket.emit("chat:message:sent", {
        conversationId,
        message: populatedMessage,
        tempId
      });

      await this.sendOfflineNotifications(conversation, populatedMessage);

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        lastActivity: new Date()
      });

      businessLogger.info(`Message sent in chat ${conversationId}`, {
        messageId: message._id,
        sender: userId
      });
    } catch (error) {
      businessLogger.error("Send message error:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  }

  /**
   * معالجة قراءة الرسالة
   */
  async handleMessageRead(socket, data) {
    try {
      const { conversationId, messageId } = data;
      const userId = socket.userId;

      if (!userId || !conversationId || !messageId) return;

      await Message.findByIdAndUpdate(messageId, {
        $addToSet: {
          readReceipts: {
            user: userId,
            readAt: new Date()
          }
        }
      });

      const room = `chat:${conversationId}`;
      socket.to(room).emit("chat:message:read", {
        conversationId,
        messageId,
        userId,
        timestamp: new Date()
      });

      await this.updateConversationReadStats(conversationId, userId);
    } catch (error) {
      businessLogger.error("Message read error:", error);
    }
  }

  /**
   * معالجة حالة الكتابة
   */
  handleTyping(socket, data) {
    const { conversationId, isTyping } = data;
    const userId = socket.userId;

    if (!userId || !conversationId) return;

    if (!this.typingUsers.has(conversationId)) {
      this.typingUsers.set(conversationId, new Set());
    }

    if (isTyping) {
      this.typingUsers.get(conversationId).add(userId);
    } else {
      this.typingUsers.get(conversationId).delete(userId);
    }

    const room = `chat:${conversationId}`;
    socket.to(room).emit("chat:typing", {
      conversationId,
      userId,
      isTyping,
      timestamp: new Date()
    });
  }

  /**
   * معالجة رد الفعل على رسالة
   */
  async handleReaction(socket, data) {
    try {
      const { conversationId, messageId, emoji } = data;
      const userId = socket.userId;

      if (!userId || !conversationId || !messageId || !emoji) return;

      const message = await Message.findById(messageId);
      
      if (message) {
        await message.addReaction(userId, emoji);

        const room = `chat:${conversationId}`;
        socket.to(room).emit("chat:message:reaction", {
          conversationId,
          messageId,
          userId,
          emoji,
          timestamp: new Date()
        });

        socket.emit("chat:message:reaction:added", {
          messageId,
          emoji
        });
      }
    } catch (error) {
      businessLogger.error("Reaction error:", error);
    }
  }

  /**
   * معالجة حذف رسالة
   */
  async handleDeleteMessage(socket, data) {
    try {
      const { conversationId, messageId } = data;
      const userId = socket.userId;

      if (!userId || !conversationId || !messageId) return;

      const message = await Message.findOne({
        _id: messageId,
        conversation: conversationId
      });

      if (!message) return;

      const isSender = message.sender.toString() === userId;
      const user = await User.findById(userId);
      const isAdmin = user?.role === 'admin';

      if (!isSender && !isAdmin) return;

      await message.softDelete(userId, isSender ? 'sender' : 'admin');

      const room = `chat:${conversationId}`;
      socket.to(room).emit("chat:message:deleted", {
        conversationId,
        messageId,
        deletedBy: userId,
        timestamp: new Date()
      });
    } catch (error) {
      businessLogger.error("Delete message error:", error);
    }
  }

  /**
   * معالجة تعديل رسالة
   */
  async handleEditMessage(socket, data) {
    try {
      const { conversationId, messageId, newContent } = data;
      const userId = socket.userId;

      if (!userId || !conversationId || !messageId || !newContent) return;

      const message = await Message.findOne({
        _id: messageId,
        conversation: conversationId,
        sender: userId
      });

      if (!message) return;

      await message.edit({ text: newContent });

      const room = `chat:${conversationId}`;
      socket.to(room).emit("chat:message:edited", {
        conversationId,
        messageId,
        newContent,
        editedBy: userId,
        timestamp: new Date()
      });
    } catch (error) {
      businessLogger.error("Edit message error:", error);
    }
  }

  /**
   * معالجة طلب سجل المحادثة
   */
  async handleHistoryRequest(socket, data) {
    try {
      const { conversationId, before, limit = 50 } = data;
      const userId = socket.userId;

      if (!userId || !conversationId) return;

      const messages = await Message.getConversationMessages(conversationId, {
        limit,
        before,
        includeSystem: true
      });

      socket.emit("chat:history", {
        conversationId,
        messages: messages.messages,
        hasMore: messages.pagination.hasMore
      });
    } catch (error) {
      businessLogger.error("History request error:", error);
    }
  }

  /**
   * معالجة البحث في المحادثة
   */
  async handleSearch(socket, data) {
    try {
      const { conversationId, query, limit = 20 } = data;
      const userId = socket.userId;

      if (!userId || !conversationId || !query) return;

      const results = await Message.searchMessages(conversationId, query, { limit });

      socket.emit("chat:search:results", {
        conversationId,
        results: results.messages,
        total: results.pagination.total
      });
    } catch (error) {
      businessLogger.error("Search error:", error);
    }
  }

  /**
   * معالجة الانضمام إلى غرفة الدعم
   */
  async handleJoinSupport(socket, data) {
    try {
      const userId = socket.userId;
      const user = await User.findById(userId);

      if (!user || user.role !== 'admin') {
        socket.emit("error", { message: "Unauthorized" });
        return;
      }

      socket.join("support:room");
      
      const pendingConversations = await Conversation.find({
        type: "support",
        "metadata.support.status": "open",
        deletedAt: null
      })
        .populate("participants", "name image")
        .sort({ lastActivity: -1 })
        .limit(20);

      socket.emit("support:pending", {
        conversations: pendingConversations
      });

      businessLogger.info(`Admin ${userId} joined support room`);
    } catch (error) {
      businessLogger.error("Join support error:", error);
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
      this.socketUser.delete(socket.id);
      
      if (this.userSockets.has(userId)) {
        this.userSockets.get(userId).delete(socket.id);

        if (this.userSockets.get(userId).size === 0) {
          this.userStatus.set(userId, {
            online: false,
            lastSeen: new Date()
          });

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

  // ====== Helper Methods ======

  /**
   * إرسال إشعارات للمستخدمين غير المتصلين
   */
  async sendOfflineNotifications(conversation, message) {
    try {
      const participants = conversation.participants;
      const senderId = message.sender._id.toString();

      for (const participantId of participants) {
        if (participantId.toString() === senderId) continue;

        const isOnline = this.userSockets.has(participantId.toString());

        if (!isOnline) {
          await notificationService.sendNotification({
            user: participantId,
            type: "new_message",
            title: `رسالة جديدة`,
            content: message.content.text?.substring(0, 100) || "📎 مرفق",
            data: {
              conversationId: conversation._id,
              messageId: message._id,
              senderId,
              senderName: message.sender.name
            },
            priority: "medium",
            link: `/chat/${conversation._id}`,
            icon: "💬"
          });
        }
      }
    } catch (error) {
      businessLogger.error("Send offline notifications error:", error);
    }
  }

  /**
   * تحديث إحصائيات القراءة للمحادثة
   */
  async updateConversationReadStats(conversationId, userId) {
    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      const unreadCount = await Message.getUnreadCount(conversationId, userId);
      
      this.sendToUser(userId, {
        type: "chat:unread:updated",
        data: {
          conversationId,
          unreadCount
        }
      });
    } catch (error) {
      businessLogger.error("Update read stats error:", error);
    }
  }

  /**
   * بدء معالج قائمة الانتظار
   */
  startQueueProcessor() {
    setInterval(() => {
      this.processMessageQueue();
    }, 5000);
  }

  /**
   * معالجة قائمة انتظار الرسائل
   */
  async processMessageQueue() {
    // TODO: تنفيذ معالجة قائمة الانتظار
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

  /**
   * الحصول على معلومات Socket
   */
  getSocketInfo(socketId) {
    const userId = this.socketUser.get(socketId);
    return {
      socketId,
      userId,
      isConnected: !!userId,
      rooms: userId ? this.getUserRooms(userId) : []
    };
  }

  /**
   * الحصول على جميع معلومات الاتصالات
   */
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
   * إحصائيات Socket.io
   */
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