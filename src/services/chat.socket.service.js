const socketService = require("./socket.service");

class ChatSocketService {
  constructor() {
    // التحقق من أن socketService موجود وبه io
    if (!socketService || !socketService.io) {
      console.warn("⚠️ Socket.IO not initialized yet. Will retry later...");
      this.socketService = socketService;
      // تأجيل تهيئة الـ event handlers حتى يتم تهيئة Socket.IO
      this.setupChatEventHandlers = this.setupChatEventHandlers.bind(this);
      return;
    }
    
    this.socketService = socketService;
    this.setupChatEventHandlers();
  }

  /**
   * إعداد معالجات أحداث الدردشة
   */
  setupChatEventHandlers() {
    const io = this.socketService?.io;
    
    if (!io) {
      console.error("❌ Socket.IO is not initialized!");
      return;
    }

    io.on("connection", (socket) => {
      console.log(`💬 Chat socket connected: ${socket.id}`);

      // انضمام إلى محادثة
      socket.on("chat:join", (conversationId) => {
        socket.join(`chat:${conversationId}`);
        console.log(`👥 Socket ${socket.id} joined chat ${conversationId}`);
      });

      // مغادرة محادثة
      socket.on("chat:leave", (conversationId) => {
        socket.leave(`chat:${conversationId}`);
        console.log(`👋 Socket ${socket.id} left chat ${conversationId}`);
      });

      // إرسال رسالة
      socket.on("chat:message:send", async (data) => {
        try {
          const { conversationId, content, type = "text", replyTo = null } = data;
          
          console.log(`📨 New message in chat ${conversationId}`);
          
          // حفظ الرسالة في قاعدة البيانات
          const Message = require("../models/message.model");
          const message = await Message.createTextMessage(
            conversationId,
            socket.userId,
            content,
            replyTo
          );

          // جلب الرسالة مع بيانات المرسل
          const populatedMessage = await Message.findById(message._id)
            .populate("sender", "name image role")
            .populate("replyTo", "content.text sender type")
            .lean();

          // إرسال الرسالة لجميع المشاركين في المحادثة
          io.to(`chat:${conversationId}`).emit("chat:message:new", {
            conversationId,
            message: populatedMessage,
            timestamp: new Date(),
          });

          // إرسال إشعارات push للمستخدمين غير المتصلين
          await this.sendMessageNotifications(conversationId, populatedMessage);

        } catch (error) {
          console.error("❌ Send message error:", error.message);
          socket.emit("chat:message:error", {
            error: "Failed to send message",
            details: error.message,
          });
        }
      });

      // تحديث حالة القراءة
      socket.on("chat:message:read", async (data) => {
        try {
          const { conversationId, messageId } = data;
          
          const Message = require("../models/message.model");
          await Message.findByIdAndUpdate(messageId, {
            $push: {
              "delivery.readBy": {
                user: socket.userId,
                readAt: new Date(),
              },
            },
          });

          // إعلام الآخرين بأن الرسالة تمت قراءتها
          socket.to(`chat:${conversationId}`).emit("chat:message:read", {
            conversationId,
            messageId,
            readBy: socket.userId,
            timestamp: new Date(),
          });

        } catch (error) {
          console.error("❌ Mark as read error:", error.message);
        }
      });

      // تحديث حالة الكتابة (Typing indicator)
      socket.on("chat:typing", (data) => {
        const { conversationId, isTyping } = data;
        
        socket.to(`chat:${conversationId}`).emit("chat:typing", {
          conversationId,
          userId: socket.userId,
          isTyping,
          timestamp: new Date(),
        });
      });

      // ردود الفعل على الرسائل
      socket.on("chat:message:react", async (data) => {
        try {
          const { conversationId, messageId, emoji } = data;
          
          const Message = require("../models/message.model");
          const message = await Message.findById(messageId);
          
          if (message) {
            await message.addReaction(socket.userId, emoji);
            
            // إرسال تحديث رد الفعل
            io.to(`chat:${conversationId}`).emit("chat:message:reaction", {
              conversationId,
              messageId,
              userId: socket.userId,
              emoji,
              timestamp: new Date(),
            });
          }
        } catch (error) {
          console.error("❌ Reaction error:", error.message);
        }
      });

      // حذف رسالة
      socket.on("chat:message:delete", async (data) => {
        try {
          const { conversationId, messageId } = data;
          
          const Message = require("../models/message.model");
          await Message.findByIdAndUpdate(messageId, {
            "deleted.isDeleted": true,
            "deleted.deletedAt": new Date(),
            "deleted.deletedBy": socket.userId,
          });

          // إعلام الآخرين بحذف الرسالة
          io.to(`chat:${conversationId}`).emit("chat:message:deleted", {
            conversationId,
            messageId,
            deletedBy: socket.userId,
            timestamp: new Date(),
          });

        } catch (error) {
          console.error("❌ Delete message error:", error.message);
        }
      });

      // تحديث الرسالة
      socket.on("chat:message:edit", async (data) => {
        try {
          const { conversationId, messageId, newContent } = data;
          
          const Message = require("../models/message.model");
          const message = await Message.findById(messageId);
          
          if (message && message.sender.toString() === socket.userId) {
            await message.edit({ text: newContent });
            
            // إرسال تحديث تعديل الرسالة
            io.to(`chat:${conversationId}`).emit("chat:message:edited", {
              conversationId,
              messageId,
              newContent,
              editedBy: socket.userId,
              timestamp: new Date(),
            });
          }
        } catch (error) {
          console.error("❌ Edit message error:", error.message);
        }
      });

      // تحديث حالة المحادثة
      socket.on("chat:presence", (data) => {
        const { conversationId, isOnline } = data;
        
        socket.to(`chat:${conversationId}`).emit("chat:presence", {
          conversationId,
          userId: socket.userId,
          isOnline,
          timestamp: new Date(),
        });
      });

      // حدث الانفصال
      socket.on("disconnect", () => {
        console.log(`💬 Chat socket disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * تهيئة الـ Socket.IO لاحقاً (عندما يكون جاهزاً)
   */
  initializeWithIO(io) {
    if (!this.socketService) {
      this.socketService = { io };
    } else {
      this.socketService.io = io;
    }
    
    // إعداد event handlers الآن بعد أن أصبح io متاحاً
    this.setupChatEventHandlers();
    console.log("✅ ChatSocketService initialized with Socket.IO");
  }

  /**
   * إرسال رسالة جديدة
   */
  async sendMessage(conversationId, messageData) {
    try {
      const io = this.socketService?.io;
      
      if (!io) {
        console.warn("⚠️ Socket.IO not available for sending message");
        return false;
      }
      
      // إرسال الرسالة لجميع المشاركين في المحادثة
      io.to(`chat:${conversationId}`).emit("chat:message:new", {
        conversationId,
        message: messageData,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      console.error("❌ Send message via socket error:", error.message);
      return false;
    }
  }

  /**
   * إرسال إشعارات الرسائل
   */
  async sendMessageNotifications(conversationId, message) {
    try {
      const Conversation = require("../models/conversation.model");
      const notificationService = require("./notification.service");
      
      const conversation = await Conversation.findById(conversationId)
        .populate("participants", "name preferences");
      
      if (!conversation) return;

      // إرسال إشعارات للمستخدمين غير المتصلين
      for (const participant of conversation.participants) {
        if (participant._id.toString() === message.sender._id.toString()) {
          continue; // تخطي المرسل
        }

        // التحقق إذا كان المستخدم متصلاً
        const isConnected = this.socketService?.isUserConnected?.(participant._id.toString());
        
        if (!isConnected && participant.preferences?.notifications?.push) {
          await notificationService.sendNotification({
            user: participant._id,
            type: "new_message",
            title: `رسالة جديدة من ${message.sender.name}`,
            content: message.content.text?.substring(0, 100) || "📎 مرفق",
            data: {
              conversationId,
              messageId: message._id,
              senderId: message.sender._id,
              senderName: message.sender.name,
            },
            priority: "medium",
            link: `/chat/${conversationId}`,
            icon: "💬",
            tags: ["chat", "message", `conversation_${conversationId}`],
          });
        }
      }
    } catch (error) {
      console.error("❌ Send message notifications error:", error.message);
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
      timestamp: new Date(),
    });
  }

  /**
   * إضافة مشارك جديد للمحادثة
   */
  addParticipantToChat(conversationId, userId) {
    const io = this.socketService?.io;
    
    if (!io) return;
    
    // إعلام المشاركين بإضافة عضو جديد
    io.to(`chat:${conversationId}`).emit("chat:participant:added", {
      conversationId,
      userId,
      timestamp: new Date(),
    });

    // إرسال رسالة ترحيب للنظام
    io.to(`chat:${conversationId}`).emit("chat:message:new", {
      conversationId,
      message: {
        type: "system",
        content: {
          text: `انضم ${userId} إلى المحادثة`,
        },
        sender: null,
        delivery: {
          sentAt: new Date(),
        },
      },
      timestamp: new Date(),
    });
  }

  /**
   * إزالة مشارك من المحادثة
   */
  removeParticipantFromChat(conversationId, userId) {
    const io = this.socketService?.io;
    
    if (!io) return;
    
    // إعلام المشاركين بإزالة العضو
    io.to(`chat:${conversationId}`).emit("chat:participant:removed", {
      conversationId,
      userId,
      timestamp: new Date(),
    });

    // إرسال رسالة وداع للنظام
    io.to(`chat:${conversationId}`).emit("chat:message:new", {
      conversationId,
      message: {
        type: "system",
        content: {
          text: `غادر ${userId} المحادثة`,
        },
        sender: null,
        delivery: {
          sentAt: new Date(),
        },
      },
      timestamp: new Date(),
    });
  }

  /**
   * التحقق من أن الخدمة مهيأة
   */
  isInitialized() {
    return !!(this.socketService?.io);
  }
}

module.exports = new ChatSocketService();