const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
const chatSocketService = require("../services/chat.socket.service");
const cache = require("../utils/cache.util");
const PaginationUtils = require("../utils/pagination.util");

/**
 * 💬 الحصول على محادثات المستخدم
 * GET /api/chat/conversations
 */
exports.getUserConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      type: req.query.type,
      archived: req.query.archived === "true",
      includeExpired: req.query.includeExpired === "true",
    };

    const cacheKey = `chat:conversations:${userId}:${JSON.stringify(options)}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log("📦 Serving conversations from cache");
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    const result = await Conversation.getUserConversations(userId, options);
    
    // تحديث عدد الرسائل غير المقروءة
    for (const conversation of result.conversations) {
      conversation.unreadCount = await Message.getUnreadCount(
        conversation._id,
        userId
      );
      
      // إضافة معلومات إضافية
      conversation.isActive = conversation.expiresAt 
        ? conversation.expiresAt > new Date() 
        : true;
        
      conversation.isMuted = conversation.notificationSettings?.mute || false;
    }

    const responseData = {
      success: true,
      data: {
        conversations: result.conversations,
        pagination: result.pagination,
        summary: {
          total: result.pagination.total,
          unreadCount: result.conversations.reduce(
            (sum, conv) => sum + (conv.unreadCount || 0), 0
          ),
          activeCount: result.conversations.filter(
            conv => conv.isActive
          ).length,
        },
      },
      cached: false,
    };

    // حفظ في الكاش لمدة دقيقتين
    cache.set(cacheKey, responseData, 120);
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ Get conversations error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get conversations",
    });
  }
};

/**
 * 💬 الحصول على محادثة معينة
 * GET /api/chat/conversations/:id
 */
exports.getConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    })
      .populate("participants", "name image role isOnline")
      .populate("lastMessage")
      .populate("metadata.order.orderId", "status totalPrice")
      .populate("metadata.support.assignedTo", "name image")
      .lean();

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // حساب الرسائل غير المقروءة
    conversation.unreadCount = await Message.getUnreadCount(conversationId, userId);
    
    // التحقق من نشاط المحادثة
    conversation.isActive = conversation.expiresAt 
      ? conversation.expiresAt > new Date() 
      : true;
      
    conversation.isMuted = conversation.notificationSettings?.mute || false;
    
    // إحصائيات المحادثة
    const stats = await Message.aggregate([
      { $match: { conversation: conversation._id } },
      {
        $facet: {
          totalMessages: [{ $count: "count" }],
          byType: [
            {
              $group: {
                _id: "$type",
                count: { $sum: 1 },
              },
            },
          ],
          bySender: [
            {
              $group: {
                _id: "$sender",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ],
          recentActivity: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$delivery.sentAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 7 },
          ],
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        conversation,
        stats: {
          total: stats[0]?.totalMessages[0]?.count || 0,
          byType: stats[0]?.byType || [],
          bySender: stats[0]?.bySender || [],
          recentActivity: stats[0]?.recentActivity || [],
        },
      },
    });
  } catch (error) {
    console.error("❌ Get conversation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get conversation",
    });
  }
};

/**
 * 💬 إنشاء محادثة جديدة
 * POST /api/chat/conversations
 */
exports.createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, participantIds, title, description, metadata } = req.body;

    if (!type || !participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        success: false,
        message: "Type and participantIds are required",
      });
    }

    // التحقق من وجود المستخدمين
    const users = await User.find({ _id: { $in: participantIds } });
    
    if (users.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        message: "Some users not found",
      });
    }

    let conversation;

    switch (type) {
      case "direct":
        if (participantIds.length !== 1) {
          return res.status(400).json({
            success: false,
            message: "Direct chat requires exactly one other participant",
          });
        }
        
        conversation = await Conversation.createDirectChat(userId, participantIds[0]);
        break;

      case "support":
        conversation = await Conversation.createSupportChat(
          userId,
          metadata?.department || "general"
        );
        break;

      case "order":
        if (!metadata?.orderId) {
          return res.status(400).json({
            success: false,
            message: "Order ID is required for order chat",
          });
        }
        
        const order = await Order.findById(metadata.orderId);
        if (!order) {
          return res.status(404).json({
            success: false,
            message: "Order not found",
          });
        }

        conversation = await Conversation.createOrderChat(
          metadata.orderId,
          userId,
          order.driver,
          order.restaurant
        );
        break;

      case "group":
        if (!title) {
          return res.status(400).json({
            success: false,
            message: "Title is required for group chat",
          });
        }
        
        conversation = await Conversation.createGroupChat(
          userId,
          title,
          description,
          participantIds,
          metadata?.isPublic || false
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid conversation type",
        });
    }

    // إبطال الكاش
    cache.invalidatePattern(`chat:conversations:${userId}:*`);
    participantIds.forEach(participantId => {
      cache.invalidatePattern(`chat:conversations:${participantId}:*`);
    });

    // إرسال إشعار للمشاركين
    const notificationService = require("../services/notification.service");
    
    for (const participantId of participantIds) {
      if (participantId !== userId) {
        await notificationService.sendNotification({
          user: participantId,
          type: "new_message",
          title: "محادثة جديدة",
          content: type === "direct" 
            ? `${req.user.name} بدأ محادثة معك`
            : `تمت إضافتك إلى محادثة ${conversation.title || "جديدة"}`,
          data: {
            conversationId: conversation._id,
            type: conversation.type,
            createdBy: userId,
          },
          priority: "medium",
          link: `/chat/${conversation._id}`,
          icon: "💬",
          tags: ["chat", "conversation", `conversation_${conversation._id}`],
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Conversation created successfully",
      data: {
        conversation,
      },
    });
  } catch (error) {
    console.error("❌ Create conversation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to create conversation",
    });
  }
};

/**
 * 💬 تحديث محادثة
 * PUT /api/chat/conversations/:id
 */
exports.updateConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const updateData = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // التحقق من الصلاحيات للتحديث
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin && (updateData.title || updateData.description || updateData.image)) {
        return res.status(403).json({
          success: false,
          message: "Only admins can update group details",
        });
      }
    }

    // الحقول المسموح بتحديثها
    const allowedUpdates = [
      "title",
      "description",
      "image",
      "notificationSettings",
      "privacySettings",
      "tags",
    ];

    const filteredUpdates = {};
    Object.keys(updateData).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updateData[key];
      }
    });

    // تحديث المحادثة
    Object.assign(conversation, filteredUpdates);
    await conversation.save();

    // إبطال الكاش
    conversation.participants.forEach(participantId => {
      cache.invalidatePattern(`chat:conversations:${participantId}:*`);
    });

    // إرسال تحديث عبر Socket
    chatSocketService.updateConversationStatus(conversationId, {
      type: "updated",
      updatedBy: userId,
      updates: Object.keys(filteredUpdates),
    });

    res.json({
      success: true,
      message: "Conversation updated successfully",
      data: {
        conversation,
      },
    });
  } catch (error) {
    console.error("❌ Update conversation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update conversation",
    });
  }
};

/**
 * 💬 إضافة مشارك للمحادثة
 * POST /api/chat/conversations/:id/participants
 */
exports.addParticipant = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { participantId } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // التحقق من الصلاحيات
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only admins can add participants",
        });
      }
    }

    // التحقق من الحد الأقصى للمشاركين
    if (conversation.type === "group" && 
        conversation.participants.length >= conversation.metadata.group.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: "Maximum participants reached",
      });
    }

    // إضافة المشارك
    await conversation.addParticipant(participantId);

    // إبطال الكاش
    cache.invalidatePattern(`chat:conversations:${participantId}:*`);

    // إرسال إشعار للمشارك الجديد
    const notificationService = require("../services/notification.service");
    await notificationService.sendNotification({
      user: participantId,
      type: "new_message",
      title: "تمت إضافتك إلى محادثة",
      content: conversation.title 
        ? `تمت إضافتك إلى محادثة ${conversation.title}`
        : "تمت إضافتك إلى محادثة جديدة",
      data: {
        conversationId: conversation._id,
        addedBy: userId,
      },
      priority: "medium",
      link: `/chat/${conversation._id}`,
      icon: "👥",
      tags: ["chat", "group", `conversation_${conversation._id}`],
    });

    // إرسال تحديث عبر Socket
    chatSocketService.addParticipantToChat(conversationId, participantId);

    res.json({
      success: true,
      message: "Participant added successfully",
      data: {
        conversationId,
        participantId,
      },
    });
  } catch (error) {
    console.error("❌ Add participant error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to add participant",
    });
  }
};

/**
 * 💬 إزالة مشارك من المحادثة
 * DELETE /api/chat/conversations/:id/participants/:participantId
 */
exports.removeParticipant = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: conversationId, participantId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // التحقق من الصلاحيات
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      const isSelf = participantId === userId;
      
      if (!isAdmin && !isSelf) {
        return res.status(403).json({
          success: false,
          message: "Only admins can remove other participants",
        });
      }
    }

    // إزالة المشارك
    await conversation.removeParticipant(participantId);

    // إبطال الكاش
    cache.invalidatePattern(`chat:conversations:${participantId}:*`);

    // إرسال تحديث عبر Socket
    chatSocketService.removeParticipantFromChat(conversationId, participantId);

    res.json({
      success: true,
      message: "Participant removed successfully",
      data: {
        conversationId,
        participantId,
        removedBy: userId,
      },
    });
  } catch (error) {
    console.error("❌ Remove participant error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to remove participant",
    });
  }
};

/**
 * 💬 الحصول على رسائل المحادثة
 * GET /api/chat/conversations/:id/messages
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 50, 100),
      before: req.query.before,
      after: req.query.after,
      types: req.query.types ? req.query.types.split(",") : [],
      includeDeleted: req.query.includeDeleted === "true",
      includeSystem: req.query.includeSystem !== "false",
    };

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const cacheKey = `chat:messages:${conversationId}:${JSON.stringify(options)}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log("📦 Serving messages from cache");
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    const result = await Message.getConversationMessages(conversationId, options);

    // تحديث حالة القراءة للمستخدم الحالي
    if (options.page === 1) {
      await Message.markAllAsRead(conversationId, userId);
      
      // إبطال الكاش
      cache.invalidatePattern(`chat:conversations:${userId}:*`);
    }

    const responseData = {
      success: true,
      data: {
        messages: result.messages,
        pagination: result.pagination,
        conversation: {
          id: conversation._id,
          type: conversation.type,
          title: conversation.title,
          participants: conversation.participants.length,
        },
      },
      cached: false,
    };

    // حفظ في الكاش لمدة دقيقة
    cache.set(cacheKey, responseData, 60);
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ Get messages error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get messages",
    });
  }
};

/**
 * 💬 إرسال رسالة
 * POST /api/chat/conversations/:id/messages
 */
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { content, type = "text", replyTo = null } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // التحقق من حالة المحادثة
    if (!conversation.isActive) {
      return res.status(400).json({
        success: false,
        message: "Conversation is not active",
      });
    }

    // التحقق من الرسالة المرد عليها
    if (replyTo) {
      const repliedMessage = await Message.findOne({
        _id: replyTo,
        conversation: conversationId,
      });
      
      if (!repliedMessage) {
        return res.status(404).json({
          success: false,
          message: "Replied message not found",
        });
      }
    }

    // إنشاء الرسالة
    const message = await Message.createTextMessage(
      conversationId,
      userId,
      content,
      replyTo
    );

    // جلب الرسالة مع البيانات الكاملة
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name image role")
      .populate("replyTo", "content.text sender type delivery.sentAt")
      .lean();

    // إبطال الكاش
    conversation.participants.forEach(participantId => {
      cache.invalidatePattern(`chat:conversations:${participantId}:*`);
      cache.invalidatePattern(`chat:messages:${conversationId}:*`);
    });

    // إرسال الرسالة عبر Socket
    chatSocketService.sendMessage(conversationId, populatedMessage);

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: {
        message: populatedMessage,
      },
    });
  } catch (error) {
    console.error("❌ Send message error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

/**
 * 💬 تحديث رسالة
 * PUT /api/chat/conversations/:conversationId/messages/:messageId
 */
exports.updateMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // جلب الرسالة
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      sender: userId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found or you don't have permission to edit it",
      });
    }

    // تحديث الرسالة
    await message.edit({ text: content });

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = require("../socket").io;
    io.to(`chat:${conversationId}`).emit("chat:message:edited", {
      conversationId,
      messageId,
      newContent: content,
      editedBy: userId,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: "Message updated successfully",
      data: {
        messageId,
        newContent: content,
      },
    });
  } catch (error) {
    console.error("❌ Update message error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update message",
    });
  }
};

/**
 * 💬 حذف رسالة
 * DELETE /api/chat/conversations/:conversationId/messages/:messageId
 */
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // جلب الرسالة
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // التحقق من الصلاحيات
    const isSender = message.sender.toString() === userId.toString();
    const isAdmin = req.user.role === "admin";
    
    if (!isSender && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this message",
      });
    }

    // حذف الرسالة
    await message.softDelete(userId, isSender ? "sender" : "admin");

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = require("../socket").io;
    io.to(`chat:${conversationId}`).emit("chat:message:deleted", {
      conversationId,
      messageId,
      deletedBy: userId,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: "Message deleted successfully",
      data: {
        messageId,
        deletedBy: userId,
      },
    });
  } catch (error) {
    console.error("❌ Delete message error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete message",
    });
  }
};

/**
 * 💬 إضافة رد فعل على رسالة
 * POST /api/chat/conversations/:conversationId/messages/:messageId/reactions
 */
exports.addReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: "Emoji is required",
      });
    }

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // جلب الرسالة
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // إضافة رد الفعل
    await message.addReaction(userId, emoji);

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = require("../socket").io;
    io.to(`chat:${conversationId}`).emit("chat:message:reaction", {
      conversationId,
      messageId,
      userId,
      emoji,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: "Reaction added successfully",
      data: {
        messageId,
        emoji,
        userId,
      },
    });
  } catch (error) {
    console.error("❌ Add reaction error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to add reaction",
    });
  }
};

/**
 * 💬 إزالة رد فعل من رسالة
 * DELETE /api/chat/conversations/:conversationId/messages/:messageId/reactions
 */
exports.removeReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // جلب الرسالة
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // إزالة رد الفعل
    await message.removeReaction(userId);

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = require("../socket").io;
    io.to(`chat:${conversationId}`).emit("chat:message:reaction:removed", {
      conversationId,
      messageId,
      userId,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: "Reaction removed successfully",
      data: {
        messageId,
        userId,
      },
    });
  } catch (error) {
    console.error("❌ Remove reaction error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to remove reaction",
    });
  }
};

/**
 * 💬 تثبيت رسالة
 * POST /api/chat/conversations/:conversationId/messages/:messageId/pin
 */
exports.pinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // التحقق من الصلاحيات (فقط الأدمن أو منشئ المجموعة)
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only admins can pin messages",
        });
      }
    }

    // جلب الرسالة
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // تثبيت الرسالة
    await message.pin(userId);

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = require("../socket").io;
    io.to(`chat:${conversationId}`).emit("chat:message:pinned", {
      conversationId,
      messageId,
      pinnedBy: userId,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: "Message pinned successfully",
      data: {
        messageId,
        pinnedBy: userId,
      },
    });
  } catch (error) {
    console.error("❌ Pin message error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to pin message",
    });
  }
};

/**
 * 💬 البحث في رسائل المحادثة
 * GET /api/chat/conversations/:id/search
 */
exports.searchMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { q: searchTerm, sender, type, dateFrom, dateTo } = req.query;

    if (!searchTerm && !sender && !type && !dateFrom && !dateTo) {
      return res.status(400).json({
        success: false,
        message: "At least one search parameter is required",
      });
    }

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const options = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      sender: sender || null,
      types: type ? type.split(",") : ["text"],
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    };

    const result = await Message.searchMessages(
      conversationId,
      searchTerm,
      options
    );

    res.json({
      success: true,
      data: {
        messages: result.messages,
        pagination: result.pagination,
        searchParams: {
          term: searchTerm,
          sender,
          type,
          dateFrom,
          dateTo,
        },
      },
    });
  } catch (error) {
    console.error("❌ Search messages error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to search messages",
    });
  }
};

/**
 * 💬 رفع ملف لمحادثة
 * POST /api/chat/conversations/:id/upload
 */
exports.uploadFile = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // التحقق من مشاركة المستخدم في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // التحقق من الإذن لرفع الملفات
    if (!conversation.privacySettings?.allowMedia) {
      return res.status(403).json({
        success: false,
        message: "Media upload is not allowed in this conversation",
      });
    }

    // تحديد نوع الملف
    const mimeType = req.file.mimetype;
    let type = "file";
    
    if (mimeType.startsWith("image/")) {
      type = "image";
    } else if (mimeType.startsWith("video/")) {
      type = "video";
    } else if (mimeType.startsWith("audio/")) {
      type = "audio";
    }

    // إنشاء رسالة الملف
    const message = await Message.createMediaMessage(
      conversationId,
      userId,
      {
        url: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
      type
    );

    // جلب الرسالة مع البيانات الكاملة
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name image role")
      .lean();

    // إبطال الكاش
    conversation.participants.forEach(participantId => {
      cache.invalidatePattern(`chat:conversations:${participantId}:*`);
      cache.invalidatePattern(`chat:messages:${conversationId}:*`);
    });

    // إرسال الرسالة عبر Socket
    chatSocketService.sendMessage(conversationId, populatedMessage);

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        message: populatedMessage,
      },
    });
  } catch (error) {
    console.error("❌ Upload file error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to upload file",
    });
  }
};

/**
 * 💬 إحصائيات الدردشة
 * GET /api/chat/stats
 */
exports.getChatStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const cacheKey = `chat:stats:${userId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    const [
      totalConversations,
      unreadMessages,
      recentConversations,
      messagesByType,
      activeChats,
    ] = await Promise.all([
      // العدد الكلي للمحادثات
      Conversation.countDocuments({
        participants: userId,
        deletedAt: null,
        archivedAt: null,
      }),

      // الرسائل غير المقروءة
      Conversation.aggregate([
        {
          $match: {
            participants: userId,
            deletedAt: null,
          },
        },
        {
          $lookup: {
            from: "messages",
            let: { conversationId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$conversation", "$$conversationId"] },
                      { $ne: ["$sender", userId] },
                      { $not: { $in: [userId, "$delivery.readBy.user"] } },
                      { $eq: ["$deleted.isDeleted", false] },
                    ],
                  },
                },
              },
              { $count: "count" },
            ],
            as: "unreadMessages",
          },
        },
        {
          $group: {
            _id: null,
            totalUnread: { $sum: { $arrayElemAt: ["$unreadMessages.count", 0] } },
          },
        },
      ]),

      // المحادثات الحديثة
      Conversation.find({
        participants: userId,
        deletedAt: null,
        archivedAt: null,
      })
        .sort({ lastActivity: -1 })
        .limit(5)
        .populate("participants", "name image")
        .populate("lastMessage")
        .lean(),

      // الرسائل حسب النوع
      Message.aggregate([
        {
          $lookup: {
            from: "conversations",
            localField: "conversation",
            foreignField: "_id",
            as: "conversationData",
          },
        },
        { $unwind: "$conversationData" },
        {
          $match: {
            "conversationData.participants": userId,
            "deleted.isDeleted": false,
          },
        },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalSize: { $sum: "$content.media.size" },
          },
        },
      ]),

      // المحادثات النشطة
      Conversation.countDocuments({
        participants: userId,
        deletedAt: null,
        archivedAt: null,
        lastActivity: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    const stats = {
      success: true,
      data: {
        overview: {
          totalConversations,
          unreadMessages: unreadMessages[0]?.totalUnread || 0,
          activeChats,
          totalMessages: messagesByType.reduce((sum, item) => sum + item.count, 0),
        },
        byType: messagesByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentConversations: recentConversations.map(conv => ({
          id: conv._id,
          title: conv.title,
          type: conv.type,
          lastActivity: conv.lastActivity,
          unreadCount: conv.unreadCount || 0,
          participants: conv.participants.slice(0, 3),
        })),
        usage: {
          storageUsed: messagesByType.reduce((sum, item) => sum + (item.totalSize || 0), 0),
          averageMessagesPerDay: await calculateAverageMessages(userId),
          busiestDay: await getBusiestChatDay(userId),
        },
      },
      cached: false,
    };

    // حفظ في الكاش لمدة 5 دقائق
    cache.set(cacheKey, stats, 300);
    
    res.json(stats);
  } catch (error) {
    console.error("❌ Get chat stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get chat statistics",
    });
  }
};

// دوال مساعدة
async function calculateAverageMessages(userId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const result = await Message.aggregate([
    {
      $lookup: {
        from: "conversations",
        localField: "conversation",
        foreignField: "_id",
        as: "conversationData",
      },
    },
    { $unwind: "$conversationData" },
    {
      $match: {
        "conversationData.participants": userId,
        "delivery.sentAt": { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$delivery.sentAt" },
        },
        messageCount: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        average: { $avg: "$messageCount" },
        totalDays: { $sum: 1 },
      },
    },
  ]);

  return result[0]?.average || 0;
}

async function getBusiestChatDay(userId) {
  const result = await Message.aggregate([
    {
      $lookup: {
        from: "conversations",
        localField: "conversation",
        foreignField: "_id",
        as: "conversationData",
      },
    },
    { $unwind: "$conversationData" },
    {
      $match: {
        "conversationData.participants": userId,
      },
    },
    {
      $group: {
        _id: {
          $dayOfWeek: "$delivery.sentAt",
        },
        messageCount: { $sum: 1 },
        dayName: { $first: { $dayOfWeek: "$delivery.sentAt" } },
      },
    },
    { $sort: { messageCount: -1 } },
    { $limit: 1 },
  ]);

  if (result.length === 0) return null;

  const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const dayIndex = result[0].dayName - 1; // MongoDB returns 1-7
  
  return {
    day: days[dayIndex],
    count: result[0].messageCount,
  };
}