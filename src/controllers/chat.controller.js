// ============================================
// ملف: src/controllers/chat.controller.js
// الوصف: التحكم الكامل في عمليات الدردشة
// الإصدار: 2.0 (موحد)
// ============================================

const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
const Restaurant = require("../models/store.model");
const chatSocketService = require("../services/chat.socket.service");
const notificationService = require("../services/notification.service");
const cache = require("../utils/cache.util");
const PaginationUtils = require("../utils/pagination.util");
const fileService = require('../services/file.service');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة (Helpers) ==========

/**
 * إبطال الكاش للمحادثة
 */
const invalidateConversationCache = (conversationId, participants = []) => {
  cache.del(`chat:conversation:${conversationId}`);
  cache.invalidatePattern(`chat:messages:${conversationId}:*`);

  participants.forEach(participantId => {
    cache.invalidatePattern(`chat:conversations:${participantId}:*`);
    cache.invalidatePattern(`chat:stats:${participantId}`);
  });
};

/**
 * تحويل الوقت إلى نص نسبي
 */
const getRelativeTime = (date) => {
  if (!date) return null;

  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
  if (diffDays < 365) return `منذ ${Math.floor(diffDays / 30)} شهر`;
  return `منذ ${Math.floor(diffDays / 365)} سنة`;
};

/**
 * التحقق من صلاحية المستخدم في المحادثة
 */
const checkParticipant = async (conversationId, userId) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
    deletedAt: null
  });

  if (!conversation) {
    throw new AppError('المحادثة غير موجودة أو ليس لديك صلاحية الوصول', 404);
  }

  return conversation;
};

// ========== 2. دوال إدارة المحادثات ==========

/**
 * @desc    الحصول على محادثات المستخدم
 * @route   GET /api/chat/conversations
 * @access  Authenticated
 */
exports.getUserConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      type: req.query.type,
      archived: req.query.archived === "true",
      includeExpired: req.query.includeExpired === "true"
    };

    const cacheKey = `chat:conversations:${userId}:${JSON.stringify(options)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`📦 Serving conversations from cache for user ${userId}`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const result = await Conversation.getUserConversations(userId, options);

    // تحديث عدد الرسائل غير المقروءة وإضافة معلومات إضافية
    for (const conversation of result.conversations) {
      // عدد الرسائل غير المقروءة
      conversation.unreadCount = await Message.getUnreadCount(
        conversation._id,
        userId
      );

      // حالة المحادثة
      conversation.isActive = conversation.expiresAt
        ? conversation.expiresAt > new Date()
        : true;

      conversation.isMuted = conversation.notificationSettings?.mute || false;

      // آخر مشارك (غير المستخدم الحالي)
      const otherParticipant = conversation.participants.find(
        p => p._id.toString() !== userId
      );
      conversation.otherParticipant = otherParticipant || null;

      // وقت آخر نشاط نسبي
      conversation.lastActivityRelative = getRelativeTime(conversation.lastActivity);
    }

    // إحصائيات سريعة
    const summary = {
      total: result.pagination.total,
      unreadCount: result.conversations.reduce(
        (sum, conv) => sum + (conv.unreadCount || 0), 0
      ),
      activeCount: result.conversations.filter(conv => conv.isActive).length,
      mutedCount: result.conversations.filter(conv => conv.isMuted).length
    };

    const responseData = {
      success: true,
      data: {
        conversations: result.conversations,
        pagination: result.pagination,
        summary
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 120); // دقيقتان

    res.json(responseData);
  } catch (error) {
    console.error("❌ Get conversations error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب المحادثات"
    });
  }
};

/**
 * @desc    الحصول على محادثة معينة
 * @route   GET /api/chat/conversations/:id
 * @access  Authenticated
 */
exports.getConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const cacheKey = `chat:conversation:${conversationId}:${userId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`📦 Serving conversation ${conversationId} from cache`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    // التحقق من المشاركة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedAt: null
    })
      .populate("participants", "name image role isOnline lastSeen")
      .populate("lastMessage")
      .populate("metadata.order.orderId", "status totalPrice")
      .populate("metadata.support.assignedTo", "name image")
      .lean();

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "المحادثة غير موجودة"
      });
    }

    // حساب الرسائل غير المقروءة
    conversation.unreadCount = await Message.getUnreadCount(conversationId, userId);

    // التحقق من نشاط المحادثة
    conversation.isActive = conversation.expiresAt
      ? conversation.expiresAt > new Date()
      : true;

    conversation.isMuted = conversation.notificationSettings?.mute || false;

    // تحديد المشارك الآخر للمحادثات الفردية
    if (conversation.type === 'direct') {
      conversation.otherParticipant = conversation.participants.find(
        p => p._id.toString() !== userId
      );
    }

    // إحصائيات المحادثة
    const stats = await Message.aggregate([
      { $match: { conversation: conversation._id, "deleted.isDeleted": false } },
      {
        $facet: {
          totalMessages: [{ $count: "count" }],
          byType: [
            {
              $group: {
                _id: "$type",
                count: { $sum: 1 }
              }
            }
          ],
          bySender: [
            {
              $group: {
                _id: "$sender",
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 5 }
          ],
          recentActivity: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$delivery.sentAt" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 7 }
          ]
        }
      }
    ]);

    // تجهيز إحصائيات المشاركين
    const participantStats = {};
    for (const participant of conversation.participants) {
      participantStats[participant._id] = {
        isOnline: participant.isOnline,
        lastSeen: participant.lastSeen,
        lastSeenRelative: getRelativeTime(participant.lastSeen)
      };
    }

    const responseData = {
      success: true,
      data: {
        conversation,
        stats: {
          total: stats[0]?.totalMessages[0]?.count || 0,
          byType: stats[0]?.byType || [],
          bySender: stats[0]?.bySender || [],
          recentActivity: stats[0]?.recentActivity || []
        },
        participantStats
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 60); // دقيقة واحدة

    res.json(responseData);
  } catch (error) {
    console.error("❌ Get conversation error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب المحادثة"
    });
  }
};

/**
 * @desc    إنشاء محادثة مباشرة
 * @route   POST /api/chat/conversations/direct/:userId
 * @access  Authenticated
 */
exports.createDirectChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.userId;

    if (userId === otherUserId) {
      return res.status(400).json({
        success: false,
        message: "لا يمكن إنشاء محادثة مع نفسك"
      });
    }

    // التحقق من وجود المستخدم الآخر
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    // البحث عن محادثة موجودة
    let conversation = await Conversation.findByParticipants([userId, otherUserId], "direct");

    if (!conversation) {
      // إنشاء محادثة جديدة
      conversation = await Conversation.create({
        type: "direct",
        participants: [userId, otherUserId],
        lastActivity: new Date()
      });
    }

    // جلب المحادثة مع البيانات
    const populatedConversation = await Conversation.findById(conversation._id)
      .populate("participants", "name image role isOnline")
      .lean();

    // إبطال الكاش
    invalidateConversationCache(conversation._id, [userId, otherUserId]);

    res.status(201).json({
      success: true,
      message: "تم إنشاء المحادثة بنجاح",
      data: {
        conversation: populatedConversation
      }
    });
  } catch (error) {
    console.error("❌ Create direct chat error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء المحادثة"
    });
  }
};

/**
 * @desc    إنشاء محادثة طلب
 * @route   POST /api/chat/conversations/order/:orderId
 * @access  Authenticated
 */
exports.createOrderChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.orderId;

    // جلب الطلب
    const order = await Order.findById(orderId)
      .populate('user', '_id name')
      .populate('driver', '_id name')
      .populate('restaurant', '_id name');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    // التحقق من الصلاحية
    const isOwner = order.user._id.toString() === userId;
    const isDriver = order.driver && order.driver._id.toString() === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بإنشاء محادثة لهذا الطلب"
      });
    }

    // تجميع المشاركين
    const participants = [order.user._id];
    if (order.driver) participants.push(order.driver._id);

    // البحث عن محادثة موجودة
    let conversation = await Conversation.findOne({
      type: "order",
      "metadata.order.orderId": orderId,
      deletedAt: null
    });

    if (!conversation) {
      // إنشاء محادثة جديدة
      conversation = await Conversation.create({
        type: "order",
        title: `محادثة الطلب #${orderId.toString().slice(-6)}`,
        participants,
        metadata: {
          order: {
            orderId,
            restaurant: order.restaurant._id,
            driver: order.driver?._id,
            status: "active"
          }
        },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 يوم
        lastActivity: new Date()
      });
    }

    // إضافة المستخدم الحالي إذا لم يكن موجوداً
    if (!conversation.participants.includes(userId)) {
      conversation.participants.push(userId);
      await conversation.save();
    }

    // جلب المحادثة مع البيانات
    const populatedConversation = await Conversation.findById(conversation._id)
      .populate("participants", "name image role")
      .populate("metadata.order.orderId", "status totalPrice")
      .populate("metadata.order.restaurant", "name image")
      .populate("metadata.order.driver", "name image")
      .lean();

    // إبطال الكاش
    invalidateConversationCache(conversation._id, participants);

    res.status(201).json({
      success: true,
      message: "تم إنشاء محادثة الطلب بنجاح",
      data: {
        conversation: populatedConversation
      }
    });
  } catch (error) {
    console.error("❌ Create order chat error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء محادثة الطلب"
    });
  }
};

/**
 * @desc    إنشاء محادثة دعم
 * @route   POST /api/chat/conversations/support
 * @access  Authenticated
 */
exports.createSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { department = "general", title, description } = req.body;

    // البحث عن ممثل دعم متاح
    const supportAgent = await User.findOne({
      role: "admin",
      "preferences.supportAgent": true,
      isOnline: true
    });

    // إنشاء المحادثة
    const conversation = await Conversation.create({
      type: "support",
      title: title || `دعم فني - ${department}`,
      description,
      participants: [userId, ...(supportAgent ? [supportAgent._id] : [])],
      metadata: {
        support: {
          department,
          priority: department === "complaints" ? "high" : "medium",
          status: "open",
          assignedTo: supportAgent?._id || null,
          tags: [department, "new"]
        }
      },
      lastActivity: new Date()
    });

    // جلب المحادثة مع البيانات
    const populatedConversation = await Conversation.findById(conversation._id)
      .populate("participants", "name image role")
      .populate("metadata.support.assignedTo", "name image")
      .lean();

    // إرسال إشعار للمشرفين
    if (!supportAgent) {
      // لا يوجد مشرف متصل، إرسال إشعار لجميع المشرفين
      const admins = await User.find({ role: "admin" }).select('_id');

      admins.forEach(admin => {
        notificationService.sendNotification({
          user: admin._id,
          type: "support",
          title: "طلب دعم جديد",
          content: `طلب دعم جديد من ${req.user.name}`,
          data: {
            conversationId: conversation._id,
            userId,
            department
          },
          priority: "medium",
          link: `/admin/support/${conversation._id}`,
          icon: "💬"
        });
      });
    }

    // إبطال الكاش
    invalidateConversationCache(conversation._id, [userId]);

    res.status(201).json({
      success: true,
      message: "تم إنشاء محادثة الدعم بنجاح",
      data: {
        conversation: populatedConversation,
        estimatedWaitTime: supportAgent ? "فوري" : "قد يستغرق الرد بعض الوقت"
      }
    });
  } catch (error) {
    console.error("❌ Create support chat error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء محادثة الدعم"
    });
  }
};

/**
 * @desc    إنشاء محادثة جماعية
 * @route   POST /api/chat/conversations/group
 * @access  Authenticated
 */
exports.createGroupChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, participantIds, isPublic = false } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "عنوان المجموعة مطلوب"
      });
    }

    if (!participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        success: false,
        message: "قائمة المشاركين مطلوبة"
      });
    }

    // التحقق من وجود المستخدمين
    const users = await User.find({ _id: { $in: participantIds } });
    if (users.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        message: "بعض المستخدمين غير موجودين"
      });
    }

    // تجميع جميع المشاركين (بما فيهم المنشئ)
    const allParticipants = [...new Set([userId, ...participantIds])];

    // إنشاء المجموعة
    const conversation = await Conversation.create({
      type: "group",
      title,
      description,
      participants: allParticipants,
      metadata: {
        group: {
          isPublic,
          maxParticipants: 100,
          admins: [userId],
          joinCode: isPublic ? Math.random().toString(36).substring(2, 8).toUpperCase() : null
        }
      },
      lastActivity: new Date()
    });

    // جلب المحادثة مع البيانات
    const populatedConversation = await Conversation.findById(conversation._id)
      .populate("participants", "name image role")
      .lean();

    // إرسال إشعارات للمشاركين
    participantIds.forEach(participantId => {
      if (participantId !== userId) {
        notificationService.sendNotification({
          user: participantId,
          type: "system",
          title: "دعوة مجموعة جديدة",
          content: `تمت إضافتك إلى مجموعة ${title}`,
          data: {
            conversationId: conversation._id,
            addedBy: userId
          },
          priority: "medium",
          link: `/chat/${conversation._id}`,
          icon: "👥"
        });
      }
    });

    // إبطال الكاش
    invalidateConversationCache(conversation._id, allParticipants);

    res.status(201).json({
      success: true,
      message: "تم إنشاء المجموعة بنجاح",
      data: {
        conversation: populatedConversation,
        inviteCode: conversation.metadata.group.joinCode
      }
    });
  } catch (error) {
    console.error("❌ Create group chat error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء المجموعة"
    });
  }
};

/**
 * @desc    تحديث محادثة
 * @route   PUT /api/chat/conversations/:id
 * @access  Authenticated
 */
exports.updateConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const updateData = req.body;

    const conversation = await checkParticipant(conversationId, userId);

    // التحقق من الصلاحيات للتحديث
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin && (updateData.title || updateData.description || updateData.image)) {
        return res.status(403).json({
          success: false,
          message: "المشرفون فقط يمكنهم تحديث بيانات المجموعة"
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
      "tags"
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
    invalidateConversationCache(conversationId, conversation.participants);

    // إرسال تحديث عبر Socket
    chatSocketService.updateConversationStatus(conversationId, {
      type: "updated",
      updatedBy: userId,
      updates: Object.keys(filteredUpdates)
    });

    res.json({
      success: true,
      message: "تم تحديث المحادثة بنجاح",
      data: { conversation }
    });
  } catch (error) {
    console.error("❌ Update conversation error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل تحديث المحادثة"
    });
  }
};

/**
 * @desc    حذف محادثة (Soft Delete)
 * @route   DELETE /api/chat/conversations/:id
 * @access  Authenticated
 */
exports.deleteConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const conversation = await checkParticipant(conversationId, userId);

    // التحقق من الصلاحية (فقط المشرف أو منشئ المجموعة)
    if (conversation.type === 'group') {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: "لا تملك صلاحية حذف هذه المحادثة"
        });
      }
    }

    // Soft delete
    conversation.deletedAt = new Date();
    await conversation.save();

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    // إرسال تحديث عبر Socket
    chatSocketService.updateConversationStatus(conversationId, {
      type: "deleted",
      deletedBy: userId
    });

    res.json({
      success: true,
      message: "تم حذف المحادثة بنجاح"
    });
  } catch (error) {
    console.error("❌ Delete conversation error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل حذف المحادثة"
    });
  }
};

/**
 * @desc    أرشفة محادثة
 * @route   PUT /api/chat/conversations/:id/archive
 * @access  Authenticated
 */
exports.archiveConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const conversation = await checkParticipant(conversationId, userId);

    conversation.archivedAt = new Date();
    await conversation.save();

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    res.json({
      success: true,
      message: "تم أرشفة المحادثة بنجاح"
    });
  } catch (error) {
    console.error("❌ Archive conversation error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل أرشفة المحادثة"
    });
  }
};

/**
 * @desc    كتم المحادثة
 * @route   PUT /api/chat/conversations/:id/mute
 * @access  Authenticated
 */
exports.muteConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { duration } = req.body; // بالساعات

    const conversation = await checkParticipant(conversationId, userId);

    await conversation.mute(duration);

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    res.json({
      success: true,
      message: duration ? `تم كتم المحادثة لمدة ${duration} ساعة` : "تم كتم المحادثة",
      data: {
        mute: true,
        muteUntil: conversation.notificationSettings.muteUntil
      }
    });
  } catch (error) {
    console.error("❌ Mute conversation error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل كتم المحادثة"
    });
  }
};

/**
 * @desc    إلغاء كتم المحادثة
 * @route   PUT /api/chat/conversations/:id/unmute
 * @access  Authenticated
 */
exports.unmuteConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const conversation = await checkParticipant(conversationId, userId);

    await conversation.unmute();

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    res.json({
      success: true,
      message: "تم إلغاء كتم المحادثة"
    });
  } catch (error) {
    console.error("❌ Unmute conversation error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إلغاء كتم المحادثة"
    });
  }
};

// ========== 3. دوال إدارة المشاركين ==========

/**
 * @desc    إضافة مشارك للمحادثة
 * @route   POST /api/chat/conversations/:id/participants
 * @access  Authenticated
 */
exports.addParticipant = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { participantId } = req.body;

    const conversation = await checkParticipant(conversationId, userId);

    // التحقق من الصلاحيات
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "المشرفون فقط يمكنهم إضافة مشاركين"
        });
      }

      // التحقق من الحد الأقصى
      if (conversation.participants.length >= conversation.metadata.group.maxParticipants) {
        return res.status(400).json({
          success: false,
          message: `لا يمكن إضافة المزيد من المشاركين (الحد الأقصى ${conversation.metadata.group.maxParticipants})`
        });
      }
    }

    // إضافة المشارك
    await conversation.addParticipant(participantId);

    // إرسال إشعار للمشارك الجديد
    notificationService.sendNotification({
      user: participantId,
      type: "system",
      title: "تمت إضافتك إلى محادثة",
      content: conversation.title
        ? `تمت إضافتك إلى محادثة ${conversation.title}`
        : "تمت إضافتك إلى محادثة جديدة",
      data: {
        conversationId,
        addedBy: userId
      },
      priority: "medium",
      link: `/chat/${conversationId}`,
      icon: "👥"
    });

    // إبطال الكاش
    invalidateConversationCache(conversationId, [participantId, ...conversation.participants]);

    // إرسال تحديث عبر Socket
    chatSocketService.addParticipantToChat(conversationId, participantId);

    res.json({
      success: true,
      message: "تم إضافة المشارك بنجاح",
      data: {
        conversationId,
        participantId
      }
    });
  } catch (error) {
    console.error("❌ Add participant error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إضافة المشارك"
    });
  }
};

/**
 * @desc    إزالة مشارك من المحادثة
 * @route   DELETE /api/chat/conversations/:id/participants/:participantId
 * @access  Authenticated
 */
exports.removeParticipant = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: conversationId, participantId } = req.params;

    const conversation = await checkParticipant(conversationId, userId);

    // التحقق من الصلاحيات
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      const isSelf = participantId === userId;

      if (!isAdmin && !isSelf) {
        return res.status(403).json({
          success: false,
          message: "المشرفون فقط يمكنهم إزالة المشاركين الآخرين"
        });
      }
    }

    // إزالة المشارك
    await conversation.removeParticipant(participantId);

    // إبطال الكاش
    invalidateConversationCache(conversationId, [participantId, ...conversation.participants]);

    // إرسال تحديث عبر Socket
    chatSocketService.removeParticipantFromChat(conversationId, participantId);

    res.json({
      success: true,
      message: "تم إزالة المشارك بنجاح",
      data: {
        conversationId,
        participantId,
        removedBy: userId
      }
    });
  } catch (error) {
    console.error("❌ Remove participant error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إزالة المشارك"
    });
  }
};

/**
 * @desc    الحصول على قائمة المشاركين
 * @route   GET /api/chat/conversations/:id/participants
 * @access  Authenticated
 */
exports.getParticipants = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const conversation = await checkParticipant(conversationId, userId);

    const participants = await User.find({
      _id: { $in: conversation.participants }
    })
      .select('name image role isOnline lastSeen')
      .lean();

    // إضافة معلومات إضافية
    const participantsWithInfo = participants.map(p => ({
      ...p,
      isAdmin: conversation.metadata.group?.admins?.includes(p._id) || false,
      lastSeenRelative: getRelativeTime(p.lastSeen)
    }));

    res.json({
      success: true,
      data: {
        participants: participantsWithInfo,
        count: participants.length,
        type: conversation.type
      }
    });
  } catch (error) {
    console.error("❌ Get participants error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل جلب المشاركين"
    });
  }
};

/**
 * @desc    تعيين مشارك كمشرف
 * @route   PUT /api/chat/conversations/:id/participants/:participantId/admin
 * @access  Authenticated
 */
exports.makeAdmin = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: conversationId, participantId } = req.params;

    const conversation = await checkParticipant(conversationId, userId);

    if (conversation.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: "هذه العملية متاحة فقط للمجموعات"
      });
    }

    // التحقق من أن المستخدم الحالي مشرف
    if (!conversation.metadata.group.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "المشرفون فقط يمكنهم تعيين مشرفين جدد"
      });
    }

    // إضافة كمشرف إذا لم يكن موجوداً
    if (!conversation.metadata.group.admins.includes(participantId)) {
      conversation.metadata.group.admins.push(participantId);
      await conversation.save();

      // إرسال إشعار
      notificationService.sendNotification({
        user: participantId,
        type: "system",
        title: "تم ترقيتك إلى مشرف",
        content: `تم ترقيتك إلى مشرف في مجموعة ${conversation.title}`,
        data: { conversationId },
        priority: "medium",
        link: `/chat/${conversationId}`,
        icon: "👑"
      });
    }

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    res.json({
      success: true,
      message: "تم تعيين المشارك كمشرف بنجاح"
    });
  } catch (error) {
    console.error("❌ Make admin error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل تعيين المشرف"
    });
  }
};

/**
 * @desc    إزالة صلاحية المشرف
 * @route   DELETE /api/chat/conversations/:id/participants/:participantId/admin
 * @access  Authenticated
 */
exports.removeAdmin = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: conversationId, participantId } = req.params;

    const conversation = await checkParticipant(conversationId, userId);

    if (conversation.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: "هذه العملية متاحة فقط للمجموعات"
      });
    }

    // التحقق من أن المستخدم الحالي مشرف
    if (!conversation.metadata.group.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "المشرفون فقط يمكنهم إزالة المشرفين"
      });
    }

    // لا يمكن إزالة آخر مشرف
    if (conversation.metadata.group.admins.length <= 1 &&
      conversation.metadata.group.admins.includes(participantId)) {
      return res.status(400).json({
        success: false,
        message: "لا يمكن إزالة آخر مشرف في المجموعة"
      });
    }

    // إزالة من قائمة المشرفين
    conversation.metadata.group.admins = conversation.metadata.group.admins.filter(
      id => id.toString() !== participantId
    );
    await conversation.save();

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    res.json({
      success: true,
      message: "تم إزالة صلاحية المشرف بنجاح"
    });
  } catch (error) {
    console.error("❌ Remove admin error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إزالة صلاحية المشرف"
    });
  }
};

// ========== 4. دوال إدارة الرسائل ==========

/**
 * @desc    الحصول على رسائل المحادثة
 * @route   GET /api/chat/conversations/:id/messages
 * @access  Authenticated
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
      includeSystem: req.query.includeSystem !== "false"
    };

    // التحقق من المشاركة
    await checkParticipant(conversationId, userId);

    const cacheKey = `chat:messages:${conversationId}:${JSON.stringify(options)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`📦 Serving messages from cache for conversation ${conversationId}`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const result = await Message.getConversationMessages(conversationId, options);

    // تحديث حالة القراءة للمستخدم الحالي
    if (options.page === 1) {
      await Message.markAllAsRead(conversationId, userId);

      // إبطال كاش المحادثات للمستخدم
      cache.invalidatePattern(`chat:conversations:${userId}:*`);
    }

    // إضافة وقت نسبي للرسائل
    const messagesWithTime = result.messages.map(message => ({
      ...message,
      timeAgo: getRelativeTime(message.delivery?.sentAt),
      isOwn: message.sender?._id?.toString() === userId
    }));

    const responseData = {
      success: true,
      data: {
        messages: messagesWithTime,
        pagination: result.pagination,
        conversation: {
          id: conversationId
        }
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 30); // 30 ثانية

    res.json(responseData);
  } catch (error) {
    console.error("❌ Get messages error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل جلب الرسائل"
    });
  }
};

/**
 * @desc    إرسال رسالة نصية
 * @route   POST /api/chat/conversations/:id/messages/text
 * @access  Authenticated
 */
exports.sendTextMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { content, replyTo } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "محتوى الرسالة مطلوب"
      });
    }

    // التحقق من المشاركة
    const conversation = await checkParticipant(conversationId, userId);

    // التحقق من حالة المحادثة
    if (!conversation.isActive) {
      return res.status(400).json({
        success: false,
        message: "المحادثة غير نشطة"
      });
    }

    // التحقق من الرسالة المرد عليها
    if (replyTo) {
      const repliedMessage = await Message.findOne({
        _id: replyTo,
        conversation: conversationId
      });

      if (!repliedMessage) {
        return res.status(404).json({
          success: false,
          message: "الرسالة المطلوب الرد عليها غير موجودة"
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

    // إضافة وقت نسبي
    populatedMessage.timeAgo = getRelativeTime(populatedMessage.delivery?.sentAt);
    populatedMessage.isOwn = true;

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    // إرسال الرسالة عبر Socket
    chatSocketService.sendMessage(conversationId, populatedMessage);

    res.status(201).json({
      success: true,
      message: "تم إرسال الرسالة بنجاح",
      data: { message: populatedMessage }
    });
  } catch (error) {
    console.error("❌ Send text message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إرسال الرسالة"
    });
  }
};

/**
 * @desc    إرسال رسالة وسائط (صورة، فيديو، ملف)
 * @route   POST /api/chat/conversations/:id/messages/media
 * @access  Authenticated
 */
exports.sendMediaMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "لم يتم رفع أي ملف"
      });
    }

    // التحقق من المشاركة
    const conversation = await checkParticipant(conversationId, userId);

    // التحقق من الإذن لرفع الملفات
    if (!conversation.privacySettings?.allowMedia) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح برفع الوسائط في هذه المحادثة"
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
        thumbnail: req.file.thumbnail,
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      type
    );

    // جلب الرسالة مع البيانات الكاملة
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name image role")
      .lean();

    // إضافة وقت نسبي
    populatedMessage.timeAgo = getRelativeTime(populatedMessage.delivery?.sentAt);
    populatedMessage.isOwn = true;

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    // إرسال الرسالة عبر Socket
    chatSocketService.sendMessage(conversationId, populatedMessage);

    res.status(201).json({
      success: true,
      message: "تم رفع الملف وإرساله بنجاح",
      data: { message: populatedMessage }
    });
  } catch (error) {
    console.error("❌ Send media message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إرسال الملف"
    });
  }
};

/**
 * @desc    إرسال رسالة موقع
 * @route   POST /api/chat/conversations/:id/messages/location
 * @access  Authenticated
 */
exports.sendLocationMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "إحداثيات الموقع مطلوبة"
      });
    }

    const conversation = await checkParticipant(conversationId, userId);

    // إنشاء رسالة الموقع
    const message = await Message.create({
      conversation: conversationId,
      sender: userId,
      type: "location",
      content: {
        location: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address: address?.trim()
        }
      },
      delivery: { sentAt: new Date() }
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name image role")
      .lean();

    // إبطال الكاش
    invalidateConversationCache(conversationId, conversation.participants);

    // إرسال عبر Socket
    chatSocketService.sendMessage(conversationId, populatedMessage);

    res.status(201).json({
      success: true,
      message: "تم إرسال الموقع بنجاح",
      data: { message: populatedMessage }
    });
  } catch (error) {
    console.error("❌ Send location error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إرسال الموقع"
    });
  }
};

/**
 * @desc    إرسال رسالة جهة اتصال
 * @route   POST /api/chat/conversations/:id/messages/contact
 * @access  Authenticated
 */
exports.sendContactMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "الاسم ورقم الهاتف مطلوبان"
      });
    }

    const conversation = await checkParticipant(conversationId, userId);

    const message = await Message.create({
      conversation: conversationId,
      sender: userId,
      type: "contact",
      content: {
        contact: { name, phone, email }
      },
      delivery: { sentAt: new Date() }
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name image role")
      .lean();

    invalidateConversationCache(conversationId, conversation.participants);
    chatSocketService.sendMessage(conversationId, populatedMessage);

    res.status(201).json({
      success: true,
      message: "تم إرسال جهة الاتصال بنجاح",
      data: { message: populatedMessage }
    });
  } catch (error) {
    console.error("❌ Send contact error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إرسال جهة الاتصال"
    });
  }
};

/**
 * @desc    تحديث رسالة
 * @route   PUT /api/chat/conversations/:conversationId/messages/:messageId
 * @access  Authenticated
 */
exports.updateMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "محتوى الرسالة مطلوب"
      });
    }

    // التحقق من المشاركة
    await checkParticipant(conversationId, userId);

    // جلب الرسالة
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      sender: userId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة أو لا تملك صلاحية تعديلها"
      });
    }

    // تحديث الرسالة
    await message.edit({ text: content });

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:message:edited", {
        conversationId,
        messageId,
        newContent: content,
        editedBy: userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "تم تحديث الرسالة بنجاح",
      data: { messageId, newContent: content }
    });
  } catch (error) {
    console.error("❌ Update message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل تحديث الرسالة"
    });
  }
};

/**
 * @desc    حذف رسالة
 * @route   DELETE /api/chat/conversations/:conversationId/messages/:messageId
 * @access  Authenticated
 */
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    // التحقق من المشاركة
    await checkParticipant(conversationId, userId);

    // جلب الرسالة
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    // التحقق من الصلاحيات
    const isSender = message.sender.toString() === userId;
    const isAdmin = req.user.role === "admin";

    if (!isSender && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "لا تملك صلاحية حذف هذه الرسالة"
      });
    }

    // حذف الرسالة
    await message.softDelete(userId, isSender ? "sender" : "admin");

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:message:deleted", {
        conversationId,
        messageId,
        deletedBy: userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "تم حذف الرسالة بنجاح",
      data: { messageId, deletedBy: userId }
    });
  } catch (error) {
    console.error("❌ Delete message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل حذف الرسالة"
    });
  }
};

/**
 * @desc    إعادة توجيه رسالة
 * @route   PUT /api/chat/conversations/:conversationId/messages/:messageId/forward/:toConversationId
 * @access  Authenticated
 */
exports.forwardMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId, toConversationId } = req.params;

    // التحقق من المشاركة في المحادثة المصدر
    await checkParticipant(conversationId, userId);

    // التحقق من المشاركة في المحادثة الهدف
    await checkParticipant(toConversationId, userId);

    // جلب الرسالة الأصلية
    const originalMessage = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      "deleted.isDeleted": false
    });

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    // إنشاء نسخة جديدة
    const newMessage = await Message.create({
      conversation: toConversationId,
      sender: userId,
      type: originalMessage.type,
      content: originalMessage.content,
      forwarded: {
        isForwarded: true,
        originalMessage: messageId,
        forwardCount: (originalMessage.forwarded?.forwardCount || 0) + 1
      },
      delivery: { sentAt: new Date() }
    });

    // تحديث عداد التوجيه في الرسالة الأصلية
    originalMessage.forwarded.forwardCount = (originalMessage.forwarded?.forwardCount || 0) + 1;
    await originalMessage.save();

    // جلب الرسالة الجديدة مع البيانات
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "name image role")
      .populate("forwarded.originalMessage", "content.type sender")
      .lean();

    // إبطال الكاش
    invalidateConversationCache(toConversationId, [userId]);

    // إرسال عبر Socket
    chatSocketService.sendMessage(toConversationId, populatedMessage);

    res.status(201).json({
      success: true,
      message: "تم إعادة توجيه الرسالة بنجاح",
      data: { message: populatedMessage }
    });
  } catch (error) {
    console.error("❌ Forward message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إعادة توجيه الرسالة"
    });
  }
};

// ========== 5. دوال التفاعلات مع الرسائل ==========

/**
 * @desc    إضافة رد فعل على رسالة
 * @route   POST /api/chat/conversations/:conversationId/messages/:messageId/reactions
 * @access  Authenticated
 */
exports.addReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: "الرمز التعبيري مطلوب"
      });
    }

    await checkParticipant(conversationId, userId);

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    await message.addReaction(userId, emoji);

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:message:reaction", {
        conversationId,
        messageId,
        userId,
        emoji,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "تم إضافة التفاعل بنجاح",
      data: { messageId, emoji, userId }
    });
  } catch (error) {
    console.error("❌ Add reaction error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إضافة التفاعل"
    });
  }
};

/**
 * @desc    إزالة رد فعل من رسالة
 * @route   DELETE /api/chat/conversations/:conversationId/messages/:messageId/reactions
 * @access  Authenticated
 */
exports.removeReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    await checkParticipant(conversationId, userId);

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    await message.removeReaction(userId);

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:message:reaction:removed", {
        conversationId,
        messageId,
        userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "تم إزالة التفاعل بنجاح",
      data: { messageId, userId }
    });
  } catch (error) {
    console.error("❌ Remove reaction error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إزالة التفاعل"
    });
  }
};

/**
 * @desc    تثبيت رسالة
 * @route   POST /api/chat/conversations/:conversationId/messages/:messageId/pin
 * @access  Authenticated
 */
exports.pinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    const conversation = await checkParticipant(conversationId, userId);

    // التحقق من الصلاحيات
    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "المشرفون فقط يمكنهم تثبيت الرسائل"
        });
      }
    }

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    await message.pin(userId);

    // إبطال الكاش
    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    // إرسال تحديث عبر Socket
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:message:pinned", {
        conversationId,
        messageId,
        pinnedBy: userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "تم تثبيت الرسالة بنجاح",
      data: { messageId, pinnedBy: userId }
    });
  } catch (error) {
    console.error("❌ Pin message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل تثبيت الرسالة"
    });
  }
};

/**
 * @desc    إلغاء تثبيت رسالة
 * @route   POST /api/chat/conversations/:conversationId/messages/:messageId/unpin
 * @access  Authenticated
 */
exports.unpinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    const conversation = await checkParticipant(conversationId, userId);

    if (conversation.type === "group") {
      const isAdmin = conversation.metadata.group.admins.includes(userId);
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "المشرفون فقط يمكنهم إلغاء تثبيت الرسائل"
        });
      }
    }

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    await message.unpin();

    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:message:unpinned", {
        conversationId,
        messageId,
        unpinnedBy: userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "تم إلغاء تثبيت الرسالة بنجاح"
    });
  } catch (error) {
    console.error("❌ Unpin message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إلغاء تثبيت الرسالة"
    });
  }
};

/**
 * @desc    تمييز رسالة بنجمة
 * @route   POST /api/chat/conversations/:conversationId/messages/:messageId/star
 * @access  Authenticated
 */
exports.starMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    await checkParticipant(conversationId, userId);

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    await message.toggleStar(userId);

    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    res.json({
      success: true,
      message: "تم تمييز الرسالة بنجمة"
    });
  } catch (error) {
    console.error("❌ Star message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل تمييز الرسالة"
    });
  }
};

/**
 * @desc    إزالة النجمة عن رسالة
 * @route   POST /api/chat/conversations/:conversationId/messages/:messageId/unstar
 * @access  Authenticated
 */
exports.unstarMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    await checkParticipant(conversationId, userId);

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "الرسالة غير موجودة"
      });
    }

    await message.toggleStar(userId); // نفس الدالة تقوم بالتبديل

    cache.invalidatePattern(`chat:messages:${conversationId}:*`);

    res.json({
      success: true,
      message: "تم إزالة النجمة عن الرسالة"
    });
  } catch (error) {
    console.error("❌ Unstar message error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إزالة النجمة"
    });
  }
};

// ========== 6. دوال البحث والوسائط ==========

/**
 * @desc    البحث في رسائل المحادثة
 * @route   GET /api/chat/conversations/:id/search
 * @access  Authenticated
 */
exports.searchMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { q: searchTerm, sender, type, dateFrom, dateTo } = req.query;

    if (!searchTerm && !sender && !type && !dateFrom && !dateTo) {
      return res.status(400).json({
        success: false,
        message: "مطلوب معلمة بحث واحدة على الأقل"
      });
    }

    await checkParticipant(conversationId, userId);

    const options = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      sender: sender || null,
      types: type ? type.split(",") : ["text"],
      dateFrom: dateFrom || null,
      dateTo: dateTo || null
    };

    const result = await Message.searchMessages(
      conversationId,
      searchTerm,
      options
    );

    // إضافة معلومات إضافية للنتائج
    const messagesWithInfo = result.messages.map(msg => ({
      ...msg,
      timeAgo: getRelativeTime(msg.delivery?.sentAt),
      isOwn: msg.sender?._id?.toString() === userId
    }));

    res.json({
      success: true,
      data: {
        messages: messagesWithInfo,
        pagination: result.pagination,
        searchParams: {
          term: searchTerm,
          sender,
          type,
          dateFrom,
          dateTo
        }
      }
    });
  } catch (error) {
    console.error("❌ Search messages error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل البحث في الرسائل"
    });
  }
};

/**
 * @desc    بحث عام في كل محادثات المستخدم
 * @route   GET /api/chat/search
 * @access  Authenticated
 */
exports.globalSearch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q: searchTerm, type, limit = 20 } = req.query;

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: "مطلوب مصطلح البحث"
      });
    }

    // الحصول على محادثات المستخدم
    const conversations = await Conversation.find({
      participants: userId,
      deletedAt: null
    }).select('_id');

    const conversationIds = conversations.map(c => c._id);

    // البحث في الرسائل
    const messages = await Message.find({
      conversation: { $in: conversationIds },
      "content.text": { $regex: searchTerm, $options: "i" },
      "deleted.isDeleted": false
    })
      .populate("conversation", "type title participants")
      .populate("sender", "name image")
      .sort({ "delivery.sentAt": -1 })
      .limit(parseInt(limit))
      .lean();

    // تجميع النتائج حسب المحادثة
    const results = messages.map(msg => ({
      message: {
        id: msg._id,
        content: msg.content.text,
        type: msg.type,
        sentAt: msg.delivery.sentAt,
        timeAgo: getRelativeTime(msg.delivery.sentAt)
      },
      conversation: {
        id: msg.conversation._id,
        type: msg.conversation.type,
        title: msg.conversation.title
      },
      sender: msg.sender
    }));

    res.json({
      success: true,
      data: {
        results,
        total: results.length,
        searchTerm
      }
    });
  } catch (error) {
    console.error("❌ Global search error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل البحث العام"
    });
  }
};

/**
 * @desc    الحصول على وسائط المحادثة
 * @route   GET /api/chat/conversations/:id/media
 * @access  Authenticated
 */
exports.getConversationMedia = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { page = 1, limit = 20 } = req.query;

    await checkParticipant(conversationId, userId);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const media = await Message.find({
      conversation: conversationId,
      type: { $in: ["image", "video"] },
      "deleted.isDeleted": false
    })
      .select('content.media type delivery.sentAt')
      .sort({ "delivery.sentAt": -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Message.countDocuments({
      conversation: conversationId,
      type: { $in: ["image", "video"] },
      "deleted.isDeleted": false
    });

    res.json({
      success: true,
      data: {
        media: media.map(m => ({
          id: m._id,
          type: m.type,
          url: m.content.media?.url,
          thumbnail: m.content.media?.thumbnail,
          size: m.content.media?.size,
          sentAt: m.delivery.sentAt,
          timeAgo: getRelativeTime(m.delivery.sentAt)
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("❌ Get media error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل جلب الوسائط"
    });
  }
};

/**
 * @desc    الحصول على ملفات المحادثة
 * @route   GET /api/chat/conversations/:id/files
 * @access  Authenticated
 */
exports.getConversationFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { page = 1, limit = 20 } = req.query;

    await checkParticipant(conversationId, userId);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const files = await Message.find({
      conversation: conversationId,
      type: "file",
      "deleted.isDeleted": false
    })
      .select('content.media type delivery.sentAt')
      .sort({ "delivery.sentAt": -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Message.countDocuments({
      conversation: conversationId,
      type: "file",
      "deleted.isDeleted": false
    });

    res.json({
      success: true,
      data: {
        files: files.map(f => ({
          id: f._id,
          filename: f.content.media?.filename,
          url: f.content.media?.url,
          size: f.content.media?.size,
          mimeType: f.content.media?.mimeType,
          sentAt: f.delivery.sentAt,
          timeAgo: getRelativeTime(f.delivery.sentAt)
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("❌ Get files error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل جلب الملفات"
    });
  }
};

/**
 * @desc    الحصول على روابط المحادثة
 * @route   GET /api/chat/conversations/:id/links
 * @access  Authenticated
 */
exports.getConversationLinks = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { page = 1, limit = 20 } = req.query;

    await checkParticipant(conversationId, userId);

    // البحث عن الروابط في النصوص
    const urlRegex = /https?:\/\/[^\s]+/g;

    const messages = await Message.find({
      conversation: conversationId,
      type: "text",
      "content.text": { $regex: "https?://", $options: "i" },
      "deleted.isDeleted": false
    })
      .select('content.text delivery.sentAt sender')
      .populate('sender', 'name image')
      .sort({ "delivery.sentAt": -1 })
      .limit(parseInt(limit) * 2) // نأخذ ضعف العدد لاستخراج الروابط
      .lean();

    // استخراج الروابط من النصوص
    const links = [];
    messages.forEach(msg => {
      const matches = msg.content.text.match(urlRegex);
      if (matches) {
        matches.forEach(url => {
          links.push({
            url,
            messageId: msg._id,
            sentAt: msg.delivery.sentAt,
            timeAgo: getRelativeTime(msg.delivery.sentAt),
            sender: msg.sender
          });
        });
      }
    });

    // تطبيق pagination على النتائج
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paginatedLinks = links.slice(start, start + parseInt(limit));

    res.json({
      success: true,
      data: {
        links: paginatedLinks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: links.length,
          pages: Math.ceil(links.length / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("❌ Get links error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل جلب الروابط"
    });
  }
};

// ========== 7. دوال الإحصائيات ==========

/**
 * @desc    إحصائيات الدردشة للمستخدم
 * @route   GET /api/chat/stats
 * @access  Authenticated
 */
exports.getChatStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const cacheKey = `chat:stats:${userId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const [
      totalConversations,
      unreadMessages,
      recentConversations,
      messagesByType,
      activeChats,
      topContacts
    ] = await Promise.all([
      // العدد الكلي للمحادثات
      Conversation.countDocuments({
        participants: userId,
        deletedAt: null,
        archivedAt: null
      }),

      // الرسائل غير المقروءة
      Message.countDocuments({
        conversation: { $in: await Conversation.find({ participants: userId }).distinct('_id') },
        sender: { $ne: userId },
        "delivery.readBy.user": { $ne: userId },
        "deleted.isDeleted": false
      }),

      // المحادثات الحديثة
      Conversation.find({
        participants: userId,
        deletedAt: null,
        archivedAt: null
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
            as: "conversationData"
          }
        },
        { $unwind: "$conversationData" },
        {
          $match: {
            "conversationData.participants": userId,
            "deleted.isDeleted": false
          }
        },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalSize: { $sum: "$content.media.size" }
          }
        }
      ]),

      // المحادثات النشطة
      Conversation.countDocuments({
        participants: userId,
        deletedAt: null,
        archivedAt: null,
        lastActivity: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),

      // أكثر الأشخاص تواصلاً
      Message.aggregate([
        {
          $lookup: {
            from: "conversations",
            localField: "conversation",
            foreignField: "_id",
            as: "conversationData"
          }
        },
        { $unwind: "$conversationData" },
        {
          $match: {
            "conversationData.participants": userId,
            "conversationData.type": "direct",
            "deleted.isDeleted": false
          }
        },
        {
          $group: {
            _id: "$sender",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userInfo"
          }
        }
      ])
    ]);

    const stats = {
      success: true,
      data: {
        overview: {
          totalConversations,
          unreadMessages,
          activeChats,
          totalMessages: messagesByType.reduce((sum, item) => sum + item.count, 0)
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
          lastActivityRelative: getRelativeTime(conv.lastActivity),
          unreadCount: conv.unreadCount || 0,
          participants: conv.participants.slice(0, 3)
        })),
        topContacts: topContacts.map(item => ({
          user: item.userInfo[0],
          messageCount: item.count
        })),
        usage: {
          storageUsed: messagesByType.reduce((sum, item) => sum + (item.totalSize || 0), 0),
          averageMessagesPerDay: await calculateAverageMessages(userId),
          busiestDay: await getBusiestChatDay(userId)
        }
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, stats, 300); // 5 دقائق

    res.json(stats);
  } catch (error) {
    console.error("❌ Get chat stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات الدردشة"
    });
  }
};

/**
 * @desc    إحصائيات محادثة معينة
 * @route   GET /api/chat/conversations/:id/stats
 * @access  Authenticated
 */
exports.getConversationStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    await checkParticipant(conversationId, userId);

    const stats = await Message.aggregate([
      { $match: { conversation: conversationId, "deleted.isDeleted": false } },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalMessages: { $sum: 1 },
                totalMedia: {
                  $sum: { $cond: [{ $in: ["$type", ["image", "video"]] }, 1, 0] }
                },
                totalFiles: {
                  $sum: { $cond: [{ $eq: ["$type", "file"] }, 1, 0] }
                }
              }
            }
          ],
          bySender: [
            {
              $group: {
                _id: "$sender",
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "userInfo"
              }
            }
          ],
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$delivery.sentAt" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 }
          ],
          byHour: [
            {
              $group: {
                _id: { $hour: "$delivery.sentAt" },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0]?.overview[0] || { totalMessages: 0, totalMedia: 0, totalFiles: 0 },
        bySender: stats[0]?.bySender.map(item => ({
          user: item.userInfo[0],
          count: item.count
        })) || [],
        byDay: stats[0]?.byDay || [],
        byHour: stats[0]?.byHour || []
      }
    });
  } catch (error) {
    console.error("❌ Get conversation stats error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات المحادثة"
    });
  }
};

/**
 * @desc    الحصول على المشاركين المتصلين
 * @route   GET /api/chat/conversations/:id/online
 * @access  Authenticated
 */
exports.getOnlineParticipants = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const conversation = await checkParticipant(conversationId, userId);

    const onlineParticipants = await User.find({
      _id: { $in: conversation.participants },
      isOnline: true
    }).select('name image role');

    res.json({
      success: true,
      data: {
        online: onlineParticipants,
        count: onlineParticipants.length,
        total: conversation.participants.length
      }
    });
  } catch (error) {
    console.error("❌ Get online participants error:", error.message);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل جلب المشاركين المتصلين"
    });
  }
};

/**
 * @desc    الحصول على إجمالي الرسائل غير المقروءة
 * @route   GET /api/chat/unread/total
 * @access  Authenticated
 */
exports.getTotalUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const cacheKey = `chat:unread:total:${userId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const conversations = await Conversation.find({
      participants: userId,
      deletedAt: null
    }).select('_id');

    let totalUnread = 0;
    for (const conv of conversations) {
      const unread = await Message.getUnreadCount(conv._id, userId);
      totalUnread += unread;
    }

    const responseData = { totalUnread, timestamp: new Date() };
    cache.set(cacheKey, responseData, 30); // 30 ثانية

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get total unread error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب إجمالي الرسائل غير المقروءة"
    });
  }
};

// ========== 8. دوال مساعدة داخلية ==========

/**
 * حساب متوسط الرسائل اليومية
 */
async function calculateAverageMessages(userId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await Message.aggregate([
    {
      $lookup: {
        from: "conversations",
        localField: "conversation",
        foreignField: "_id",
        as: "conversationData"
      }
    },
    { $unwind: "$conversationData" },
    {
      $match: {
        "conversationData.participants": userId,
        "delivery.sentAt": { $gte: thirtyDaysAgo },
        "deleted.isDeleted": false
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$delivery.sentAt" }
        },
        messageCount: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: null,
        average: { $avg: "$messageCount" },
        totalDays: { $sum: 1 }
      }
    }
  ]);

  return result[0]?.average || 0;
}

/**
 * الحصول على أكثر يوم ازدحاماً بالرسائل
 */
async function getBusiestChatDay(userId) {
  const result = await Message.aggregate([
    {
      $lookup: {
        from: "conversations",
        localField: "conversation",
        foreignField: "_id",
        as: "conversationData"
      }
    },
    { $unwind: "$conversationData" },
    {
      $match: {
        "conversationData.participants": userId,
        "deleted.isDeleted": false
      }
    },
    {
      $group: {
        _id: {
          $dayOfWeek: "$delivery.sentAt"
        },
        messageCount: { $sum: 1 },
        dayName: { $first: { $dayOfWeek: "$delivery.sentAt" } }
      }
    },
    { $sort: { messageCount: -1 } },
    { $limit: 1 }
  ]);

  if (result.length === 0) return null;

  const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const dayIndex = result[0].dayName - 1; // MongoDB returns 1-7

  return {
    day: days[dayIndex],
    count: result[0].messageCount
  };
}

// ========== 9. دوال الأدمن للدعم ==========

/**
 * @desc    الحصول على محادثات الدعم (للأدمن)
 * @route   GET /api/chat/admin/support-conversations
 * @access  Admin
 */
exports.getSupportConversations = async (req, res) => {
  try {
    const { status, department, assignedTo } = req.query;

    const query = {
      type: "support",
      deletedAt: null
    };

    if (status) query["metadata.support.status"] = status;
    if (department) query["metadata.support.department"] = department;
    if (assignedTo) query["metadata.support.assignedTo"] = assignedTo;

    const conversations = await Conversation.find(query)
      .populate("participants", "name image")
      .populate("metadata.support.assignedTo", "name image")
      .sort({ lastActivity: -1 })
      .limit(50)
      .lean();

    // إحصائيات الدعم
    const stats = await Conversation.aggregate([
      { $match: { type: "support", deletedAt: null } },
      {
        $group: {
          _id: {
            status: "$metadata.support.status",
            department: "$metadata.support.department"
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$stats.avgResponseTime" }
        }
      }
    ]);

    // حساب وقت الاستجابة لكل محادثة
    for (const conv of conversations) {
      const firstMessage = await Message.findOne({
        conversation: conv._id,
        type: { $ne: "system" }
      }).sort({ "delivery.sentAt": 1 });

      const firstResponse = await Message.findOne({
        conversation: conv._id,
        sender: { $in: conv.metadata.support.assignedTo ? [conv.metadata.support.assignedTo._id] : null }
      }).sort({ "delivery.sentAt": 1 });

      if (firstMessage && firstResponse) {
        const responseTime = (firstResponse.delivery.sentAt - firstMessage.delivery.sentAt) / 60000; // دقائق
        conv.responseTime = Math.round(responseTime);
      }
    }

    res.json({
      success: true,
      data: {
        conversations,
        stats: stats.reduce((acc, item) => {
          if (!acc[item._id.department]) {
            acc[item._id.department] = {};
          }
          acc[item._id.department][item._id.status] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error("❌ Get support conversations error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب محادثات الدعم"
    });
  }
};

/**
 * @desc    تعيين محادثة دعم لمشرف
 * @route   PUT /api/chat/admin/conversations/:id/assign
 * @access  Admin
 */
exports.assignSupportAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      {
        "metadata.support.assignedTo": assignedTo || req.user.id,
        "metadata.support.status": "pending"
      },
      { new: true }
    )
      .populate("metadata.support.assignedTo", "name image")
      .populate("participants", "name image");

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "المحادثة غير موجودة"
      });
    }

    // إرسال رسالة نظام
    await Message.createSystemMessage(
      conversation._id,
      "support_assigned",
      {
        assignedTo: conversation.metadata.support.assignedTo,
        assignedBy: req.user.id
      }
    );

    // إرسال إشعار للمستخدم
    const userId = conversation.participants.find(
      p => p._id.toString() !== (assignedTo || req.user.id)
    )?._id;

    if (userId) {
      notificationService.sendNotification({
        user: userId,
        type: "support",
        title: "تم تعيين مسؤول دعم",
        content: `تم تعيين ${conversation.metadata.support.assignedTo.name} للرد على استفسارك`,
        data: { conversationId: conversation._id },
        priority: "medium",
        link: `/chat/${conversation._id}`,
        icon: "💬"
      });
    }

    // إبطال الكاش
    invalidateConversationCache(id, conversation.participants.map(p => p._id));

    res.json({
      success: true,
      message: "تم تعيين المحادثة بنجاح",
      data: { conversation }
    });
  } catch (error) {
    console.error("❌ Assign conversation error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تعيين المحادثة"
    });
  }
};

/**
 * @desc    إنهاء محادثة دعم
 * @route   PUT /api/chat/admin/conversations/:id/resolve
 * @access  Admin
 */
exports.resolveSupportChat = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      {
        "metadata.support.status": "resolved",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 أيام
      },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "المحادثة غير موجودة"
      });
    }

    // إرسال رسالة نظام
    await Message.createSystemMessage(
      conversation._id,
      "support_resolved",
      { resolvedBy: req.user.id }
    );

    // إبطال الكاش
    invalidateConversationCache(id, conversation.participants);

    res.json({
      success: true,
      message: "تم إنهاء محادثة الدعم بنجاح"
    });
  } catch (error) {
    console.error("❌ Resolve support chat error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إنهاء المحادثة"
    });
  }
};

/**
 * @desc    إحصائيات الدعم (للأدمن)
 * @route   GET /api/chat/admin/support-stats
 * @access  Admin
 */
exports.getSupportStats = async (req, res) => {
  try {
    const stats = await Conversation.aggregate([
      { $match: { type: "support", deletedAt: null } },
      {
        $facet: {
          byStatus: [
            {
              $group: {
                _id: "$metadata.support.status",
                count: { $sum: 1 }
              }
            }
          ],
          byDepartment: [
            {
              $group: {
                _id: "$metadata.support.department",
                count: { $sum: 1 }
              }
            }
          ],
          responseTime: [
            {
              $lookup: {
                from: "messages",
                let: { convId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$conversation", "$$convId"] },
                      type: { $ne: "system" }
                    }
                  },
                  { $sort: { "delivery.sentAt": 1 } },
                  { $group: { _id: "$conversation", firstMessage: { $first: "$$ROOT" } } }
                ],
                as: "messages"
              }
            }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        byStatus: stats[0]?.byStatus || [],
        byDepartment: stats[0]?.byDepartment || [],
        total: (stats[0]?.byStatus || []).reduce((sum, s) => sum + s.count, 0)
      }
    });
  } catch (error) {
    console.error("❌ Get support stats error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات الدعم"
    });
  }
};

/**
 * @desc    الحصول على جميع المحادثات (للأدمن)
 * @route   GET /api/chat/admin/all-conversations
 * @access  Admin
 */
exports.getAllConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;

    const query = { deletedAt: null };
    if (type) query.type = type;
    if (status && type === 'support') query["metadata.support.status"] = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .populate('participants', 'name image role')
        .populate('lastMessage')
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      Conversation.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        conversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("❌ Get all conversations error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب المحادثات"
    });
  }
};

/**
 * @desc    حذف محادثة (للأدمن)
 * @route   DELETE /api/chat/admin/conversations/:id
 * @access  Admin
 */
exports.adminDeleteConversation = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "المحادثة غير موجودة"
      });
    }

    // حذف جميع الرسائل
    await Message.updateMany(
      { conversation: id },
      { "deleted.isDeleted": true, "deleted.deletedAt": new Date(), "deleted.deletedBy": req.user.id }
    );

    // إبطال الكاش
    invalidateConversationCache(id, conversation.participants);

    res.json({
      success: true,
      message: "تم حذف المحادثة بنجاح"
    });
  } catch (error) {
    console.error("❌ Admin delete conversation error:", error);
    res.status(500).json({
      success: false,
      message: "فشل حذف المحادثة"
    });
  }
};

/**
 * @desc    إرسال رسالة جماعية (للأدمن)
 * @route   POST /api/chat/admin/broadcast
 * @access  Admin
 */
exports.broadcastMessage = async (req, res) => {
  try {
    const { content, userIds, role, type = "text" } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "محتوى الرسالة مطلوب"
      });
    }

    let targetUsers = [];

    if (userIds && Array.isArray(userIds)) {
      targetUsers = userIds;
    } else if (role) {
      // إرسال لمستخدمين بدور معين
      const users = await User.find({ role, isActive: true }).select('_id');
      targetUsers = users.map(u => u._id.toString());
    } else {
      return res.status(400).json({
        success: false,
        message: "يجب تحديد المستخدمين المستهدفين"
      });
    }

    const results = {
      total: targetUsers.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    // إنشاء محادثة وإرسال رسالة لكل مستخدم
    for (const userId of targetUsers) {
      try {
        // البحث عن محادثة مباشرة أو إنشاؤها
        let conversation = await Conversation.findByParticipants([req.user.id, userId], "direct");

        if (!conversation) {
          conversation = await Conversation.create({
            type: "direct",
            participants: [req.user.id, userId],
            lastActivity: new Date()
          });
        }

        // إنشاء الرسالة
        const message = await Message.createTextMessage(
          conversation._id,
          req.user.id,
          content
        );

        results.successful++;

        // إرسال عبر Socket
        chatSocketService.sendMessage(conversation._id, message);

      } catch (error) {
        results.failed++;
        results.errors.push({ userId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: "تم إرسال الرسالة الجماعية",
      data: results
    });
  } catch (error) {
    console.error("❌ Broadcast message error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إرسال الرسالة الجماعية"
    });
  }
};

module.exports = exports;