// ============================================
// ملف: src/services/chat.socket.service.js (محدث)
// الوصف: خدمة الدردشة عبر Socket.io المتقدمة
// ============================================

const socketService = require("./socket.service");
const Message = require("../models/message.model");
const Conversation = require("../models/conversation.model");
const User = require("../models/user.model");
const notificationService = require("./notification.service");
const { businessLogger } = require("../utils/logger.util");

class ChatSocketService {
  constructor() {
    this.socketService = socketService;
    this.typingUsers = new Map(); // conversationId -> Set<userId>
    this.onlineUsers = new Map();  // userId -> { socketId, lastSeen }
    this.messageQueue = new Map();  // conversationId -> [messages]
    this.setupChatEventHandlers = this.setupChatEventHandlers.bind(this);
  }

  /**
   * تهيئة الخدمة مع Socket.io
   */
  initializeWithIO(io) {
    if (!this.socketService) {
      this.socketService = { io };
    } else {
      this.socketService.io = io;
    }
    
    this.setupChatEventHandlers();
    businessLogger.info("ChatSocketService initialized with Socket.IO");
    
    // بدء معالج قائمة الانتظار
    this.startQueueProcessor();
  }

  /**
   * إعداد معالجات أحداث الدردشة
   */
  setupChatEventHandlers() {
    const io = this.socketService?.io;
    
    if (!io) {
      businessLogger.error("Socket.IO not available for chat service");
      return;
    }

    io.on("connection", (socket) => {
      businessLogger.info(`Chat socket connected: ${socket.id}`);

      // ====== انضمام إلى محادثة ======
      socket.on("chat:join", (data) => {
        this.handleJoinChat(socket, data);
      });

      // ====== مغادرة محادثة ======
      socket.on("chat:leave", (data) => {
        this.handleLeaveChat(socket, data);
      });

      // ====== إرسال رسالة ======
      socket.on("chat:message:send", async (data) => {
        await this.handleSendMessage(socket, data);
      });

      // ====== تحديث حالة القراءة ======
      socket.on("chat:message:read", async (data) => {
        await this.handleMessageRead(socket, data);
      });

      // ====== تحديث حالة الكتابة ======
      socket.on("chat:typing", (data) => {
        this.handleTyping(socket, data);
      });

      // ====== إضافة رد فعل ======
      socket.on("chat:message:react", async (data) => {
        await this.handleReaction(socket, data);
      });

      // ====== حذف رسالة ======
      socket.on("chat:message:delete", async (data) => {
        await this.handleDeleteMessage(socket, data);
      });

      // ====== تحديث رسالة ======
      socket.on("chat:message:edit", async (data) => {
        await this.handleEditMessage(socket, data);
      });

      // ====== إرسال ملف ======
      socket.on("chat:file:upload", async (data) => {
        await this.handleFileUpload(socket, data);
      });

      // ====== طلب سجل المحادثة ======
      socket.on("chat:history:request", async (data) => {
        await this.handleHistoryRequest(socket, data);
      });

      // ====== البحث في المحادثة ======
      socket.on("chat:search", async (data) => {
        await this.handleSearch(socket, data);
      });

      // ====== تحديث حالة الاتصال ======
      socket.on("chat:presence", (data) => {
        this.handlePresence(socket, data);
      });

      // ====== الانضمام إلى غرفة الدعم ======
      socket.on("chat:support:join", (data) => {
        this.handleJoinSupport(socket, data);
      });

      // ====== قطع الاتصال ======
      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });
    });
  }

  // ========== 1. معالجات الانضمام والمغادرة ==========

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

      // التحقق من صلاحية المستخدم
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        deletedAt: null
      });

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found or access denied" });
        return;
      }

      // الانضمام إلى غرفة المحادثة
      const room = `chat:${conversationId}`;
      socket.join(room);

      // تخزين حالة المستخدم
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Map());
      }
      this.onlineUsers.get(userId).set(conversationId, {
        socketId: socket.id,
        joinedAt: new Date()
      });

      // إعلام الآخرين
      socket.to(room).emit("chat:participant:joined", {
        conversationId,
        userId,
        timestamp: new Date()
      });

      // إرسال آخر 20 رسالة غير مقروءة
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

    // إزالة حالة المستخدم
    if (this.onlineUsers.has(userId)) {
      this.onlineUsers.get(userId).delete(conversationId);
    }

    // إعلام الآخرين
    socket.to(room).emit("chat:participant:left", {
      conversationId,
      userId,
      timestamp: new Date()
    });

    businessLogger.info(`User ${userId} left chat ${conversationId}`);
  }

  // ========== 2. معالجات الرسائل ==========

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

      // التحقق من المشاركة
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        deletedAt: null
      });

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      // إنشاء الرسالة
      let message;
      if (type === "text") {
        message = await Message.createTextMessage(conversationId, userId, content, replyTo);
      } else {
        // سيتم معالجة الأنواع الأخرى لاحقاً
        socket.emit("error", { message: "Unsupported message type" });
        return;
      }

      // جلب الرسالة مع البيانات
      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "name image role")
        .populate("replyTo", "content.text sender type")
        .lean();

      // إضافة معرف مؤقت
      if (tempId) {
        populatedMessage.tempId = tempId;
      }

      // إرسال إلى جميع المشاركين
      const room = `chat:${conversationId}`;
      socket.to(room).emit("chat:message:new", {
        conversationId,
        message: populatedMessage,
        timestamp: new Date()
      });

      // تأكيد الإرسال للمرسل
      socket.emit("chat:message:sent", {
        conversationId,
        message: populatedMessage,
        tempId
      });

      // إرسال إشعارات للمستخدمين غير المتصلين
      await this.sendOfflineNotifications(conversation, populatedMessage);

      // تحديث آخر نشاط
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

      // تحديث إيصال القراءة
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: {
          readReceipts: {
            user: userId,
            readAt: new Date()
          }
        }
      });

      // إعلام الآخرين
      const room = `chat:${conversationId}`;
      socket.to(room).emit("chat:message:read", {
        conversationId,
        messageId,
        userId,
        timestamp: new Date()
      });

      // تحديث إحصائيات المحادثة
      await this.updateConversationReadStats(conversationId, userId);
    } catch (error) {
      businessLogger.error("Message read error:", error);
    }
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

        // إعلام الآخرين
        const room = `chat:${conversationId}`;
        socket.to(room).emit("chat:message:reaction", {
          conversationId,
          messageId,
          userId,
          emoji,
          timestamp: new Date()
        });

        // تأكيد للمرسل
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

      // التحقق من الصلاحية
      const isSender = message.sender.toString() === userId;
      const user = await User.findById(userId);
      const isAdmin = user?.role === 'admin';

      if (!isSender && !isAdmin) return;

      await message.softDelete(userId, isSender ? 'sender' : 'admin');

      // إعلام الجميع
      const room = `chat:${conversationId}`;
      io.to(room).emit("chat:message:deleted", {
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
      io.to(room).emit("chat:message:edited", {
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
   * معالجة رفع ملف
   */
  async handleFileUpload(socket, data) {
    try {
      const { conversationId, fileData } = data;
      const userId = socket.userId;

      // TODO: تنفيذ رفع الملفات عبر Socket.io
      socket.emit("error", { message: "File upload via socket not implemented yet" });
    } catch (error) {
      businessLogger.error("File upload error:", error);
    }
  }

  // ========== 3. معالجات الحالة ==========

  /**
   * معالجة حالة الكتابة
   */
  handleTyping(socket, data) {
    const { conversationId, isTyping } = data;
    const userId = socket.userId;

    if (!userId || !conversationId) return;

    // تخزين حالة الكتابة
    if (!this.typingUsers.has(conversationId)) {
      this.typingUsers.set(conversationId, new Set());
    }

    if (isTyping) {
      this.typingUsers.get(conversationId).add(userId);
    } else {
      this.typingUsers.get(conversationId).delete(userId);
    }

    // إعلام الآخرين
    const room = `chat:${conversationId}`;
    socket.to(room).emit("chat:typing", {
      conversationId,
      userId,
      isTyping,
      timestamp: new Date()
    });
  }

  /**
   * معالجة تحديث الحالة
   */
  handlePresence(socket, data) {
    const { isOnline } = data;
    const userId = socket.userId;

    if (!userId) return;

    // تحديث حالة المستخدم
    if (isOnline) {
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Map());
      }
    } else {
      this.onlineUsers.delete(userId);
    }

    // إعلام المشتركين
    socket.broadcast.emit("chat:presence", {
      userId,
      isOnline,
      timestamp: new Date()
    });
  }

  // ========== 4. معالجات الطلبات ==========

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
      
      // إرسال قائمة محادثات الدعم المعلقة
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

  // ========== 5. معالجة قطع الاتصال ==========

  /**
   * معالجة قطع الاتصال
   */
  handleDisconnect(socket) {
    const userId = socket.userId;

    if (userId) {
      // إزالة من حالة الكتابة
      for (const [convId, users] of this.typingUsers.entries()) {
        if (users.has(userId)) {
          users.delete(userId);
          
          // إعلام الآخرين
          socket.to(`chat:${convId}`).emit("chat:typing", {
            conversationId: convId,
            userId,
            isTyping: false,
            timestamp: new Date()
          });
        }
      }

      // إزالة من حالة الاتصال
      this.onlineUsers.delete(userId);

      // إعلام الآخرين
      socket.broadcast.emit("chat:presence", {
        userId,
        isOnline: false,
        timestamp: new Date()
      });
    }

    businessLogger.info(`Chat socket disconnected: ${socket.id}`);
  }

  // ========== 6. دوال مساعدة ==========

  /**
   * إرسال إشعارات للمستخدمين غير المتصلين
   */
  async sendOfflineNotifications(conversation, message) {
    try {
      const participants = conversation.participants;
      const senderId = message.sender._id.toString();

      for (const participantId of participants) {
        if (participantId.toString() === senderId) continue;

        // التحقق إذا كان المستخدم متصلاً
        const isOnline = this.onlineUsers.has(participantId.toString());

        if (!isOnline) {
          // إرسال إشعار
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
      
      // إرسال تحديث عدد غير المقروء
      socketService.sendToUser(userId, {
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
    }, 5000); // كل 5 ثواني
  }

  /**
   * معالجة قائمة انتظار الرسائل
   */
  async processMessageQueue() {
    // TODO: تنفيذ معالجة قائمة الانتظار
  }

  // ========== 7. دوال عامة ==========

  /**
   * إرسال رسالة عبر Socket
   */
  async sendMessage(conversationId, messageData) {
    try {
      const io = this.socketService?.io;
      
      if (!io) {
        businessLogger.warn("Socket.IO not available");
        return false;
      }

      io.to(`chat:${conversationId}`).emit("chat:message:new", {
        conversationId,
        message: messageData,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      businessLogger.error("Send message via socket error:", error);
      return false;
    }
  }

  /**
   * تحديث حالة المحادثة
   */
  updateConversationStatus(conversationId, statusData) {
    const io = this.socketService?.io;
    
    if (!io) return;
    
    io.to(`chat:${conversationId}`).emit("chat:status", {
      conversationId,
      ...statusData,
      timestamp: new Date()
    });
  }

  /**
   * إضافة مشارك إلى المحادثة
   */
  addParticipantToChat(conversationId, userId) {
    const io = this.socketService?.io;
    
    if (!io) return;
    
    io.to(`chat:${conversationId}`).emit("chat:participant:added", {
      conversationId,
      userId,
      timestamp: new Date()
    });
  }

  /**
   * إزالة مشارك من المحادثة
   */
  removeParticipantFromChat(conversationId, userId) {
    const io = this.socketService?.io;
    
    if (!io) return;
    
    io.to(`chat:${conversationId}`).emit("chat:participant:removed", {
      conversationId,
      userId,
      timestamp: new Date()
    });
  }

  /**
   * الحصول على حالة الخدمة
   */
  getStatus() {
    return {
      initialized: this.socketService?.io != null,
      onlineUsers: this.onlineUsers.size,
      typingUsers: this.typingUsers.size,
      messageQueue: this.messageQueue.size,
      timestamp: new Date()
    };
  }
}

module.exports = new ChatSocketService();