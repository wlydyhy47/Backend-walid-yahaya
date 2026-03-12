// ============================================
// ملف: src/controllers/notification.controller.js
// الوصف: التحكم الكامل في عمليات الإشعارات
// الإصدار: 2.0 (موحد)
// ============================================

const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const Device = require("../models/device.model");
const cache = require("../utils/cache.util");
const PaginationUtils = require('../utils/pagination.util');
const notificationService = require("../services/notification.service");
const socketService = require("../services/socket.service");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة (Helpers) ==========

/**
 * إبطال الكاش للمستخدم
 */
const invalidateUserCache = (userId) => {
  cache.del(`notifications:user:${userId}`);
  cache.del(`notifications:stats:${userId}`);
  cache.del(`notifications:unread:${userId}`);
  cache.invalidatePattern(`notifications:*:${userId}`);
  cache.del(`user:complete:${userId}`);
  cache.del(`dashboard:${userId}`);
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
 * الحصول على أيقونة حسب نوع الإشعار
 */
const getIconByType = (type) => {
  const icons = {
    system: "🔔",
    order_created: "🛒",
    order_accepted: "✅",
    order_picked: "📦",
    order_delivered: "🚚",
    order_cancelled: "❌",
    driver_assigned: "🚗",
    driver_arrived: "📍",
    payment_success: "💳",
    payment_failed: "⚠️",
    review_reminder: "⭐",
    promotion: "🎁",
    announcement: "📢",
    security: "🔒",
    support: "💬",
    welcome: "👋",
    password_changed: "🔑",
    profile_updated: "👤",
    new_message: "💬"
  };
  
  return icons[type] || "🔔";
};

// ========== 2. دوال المستخدم العادي ==========

/**
 * @desc    الحصول على إشعارات المستخدم
 * @route   GET /api/notifications
 * @access  Authenticated
 */
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      status: req.query.status,
      type: req.query.type,
      priority: req.query.priority,
      unreadOnly: req.query.unreadOnly === "true",
      includeExpired: req.query.includeExpired === "true"
    };

    const cacheKey = `notifications:user:${userId}:${JSON.stringify(options)}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`📦 Serving notifications from cache for user ${userId}`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const result = await notificationService.getUserNotifications(userId, options);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    // إضافة وقت نسبي لكل إشعار
    const notificationsWithTime = result.data.notifications.map(notification => ({
      ...notification,
      timeAgo: getRelativeTime(notification.sentAt),
      isExpired: notification.expiresAt && new Date(notification.expiresAt) < new Date()
    }));

    const responseData = {
      success: true,
      data: {
        notifications: notificationsWithTime,
        pagination: result.data.pagination,
        stats: result.data.stats
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 60); // دقيقة واحدة
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ Get notifications error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب الإشعارات"
    });
  }
};

/**
 * @desc    الحصول على عدد الإشعارات غير المقروءة
 * @route   GET /api/notifications/unread-count
 * @access  Authenticated
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const cacheKey = `notifications:unread:${userId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const count = await Notification.countDocuments({
      user: userId,
      status: "unread",
      expiresAt: { $gt: new Date() }
    });

    const responseData = {
      unreadCount: count,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 30); // 30 ثانية
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get unread count error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب عدد الإشعارات غير المقروءة"
    });
  }
};

/**
 * @desc    الحصول على إحصائيات الإشعارات
 * @route   GET /api/notifications/stats
 * @access  Authenticated
 */
exports.getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const cacheKey = `notifications:stats:${userId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const result = await notificationService.getNotificationStats(userId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    const responseData = {
      success: true,
      data: result.data,
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 300); // 5 دقائق
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ Get notification stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات الإشعارات"
    });
  }
};

// ========== 3. دوال إدارة الإشعارات الفردية ==========

/**
 * @desc    تحديث حالة الإشعار (مقروء)
 * @route   PUT /api/notifications/:id/read
 * @access  Authenticated
 */
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await notificationService.updateNotificationStatus(
      userId,
      notificationId,
      "read"
    );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    // إبطال الكاش
    invalidateUserCache(userId);

    // إرسال تحديث عبر Socket.io
    socketService.sendToUser(userId, {
      type: "notification:read",
      data: {
        id: notificationId,
        readAt: new Date()
      }
    });

    res.json({
      success: true,
      message: "تم تحديث حالة الإشعار",
      data: result.data
    });
  } catch (error) {
    console.error("❌ Mark as read error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الإشعار"
    });
  }
};

/**
 * @desc    تحديث حالة الإشعار (غير مقروء)
 * @route   PUT /api/notifications/:id/unread
 * @access  Authenticated
 */
exports.markAsUnread = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await notificationService.updateNotificationStatus(
      userId,
      notificationId,
      "unread"
    );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    // إبطال الكاش
    invalidateUserCache(userId);

    // إرسال تحديث عبر Socket.io
    socketService.sendToUser(userId, {
      type: "notification:unread",
      data: {
        id: notificationId
      }
    });

    res.json({
      success: true,
      message: "تم تحديث حالة الإشعار",
      data: result.data
    });
  } catch (error) {
    console.error("❌ Mark as unread error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الإشعار"
    });
  }
};

/**
 * @desc    أرشفة إشعار
 * @route   PUT /api/notifications/:id/archive
 * @access  Authenticated
 */
exports.archive = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await notificationService.updateNotificationStatus(
      userId,
      notificationId,
      "archived"
    );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    // إبطال الكاش
    invalidateUserCache(userId);

    res.json({
      success: true,
      message: "تم أرشفة الإشعار",
      data: result.data
    });
  } catch (error) {
    console.error("❌ Archive error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل أرشفة الإشعار"
    });
  }
};

/**
 * @desc    حذف إشعار
 * @route   DELETE /api/notifications/:id
 * @access  Authenticated
 */
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await notificationService.deleteNotification(userId, notificationId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    // إبطال الكاش
    invalidateUserCache(userId);

    // إرسال تحديث عبر Socket.io
    socketService.sendToUser(userId, {
      type: "notification:deleted",
      data: {
        id: notificationId
      }
    });

    res.json({
      success: true,
      message: "تم حذف الإشعار بنجاح",
      data: result.data
    });
  } catch (error) {
    console.error("❌ Delete notification error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل حذف الإشعار"
    });
  }
};

// ========== 4. دوال الإدارة الجماعية ==========

/**
 * @desc    تحديث جميع الإشعارات كمقروءة
 * @route   PUT /api/notifications/mark-all-read
 * @access  Authenticated
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await notificationService.markAllAsRead(userId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    // إبطال الكاش
    invalidateUserCache(userId);

    // إرسال تحديث عبر Socket.io
    socketService.sendToUser(userId, {
      type: "notification:all_read",
      data: {
        count: result.data.modifiedCount,
        timestamp: new Date()
      }
    });

    res.json({
      success: true,
      message: "تم تحديد جميع الإشعارات كمقروءة",
      data: result.data
    });
  } catch (error) {
    console.error("❌ Mark all as read error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث الإشعارات"
    });
  }
};

/**
 * @desc    حذف جميع الإشعارات المقروءة
 * @route   DELETE /api/notifications/read/cleanup
 * @access  Authenticated
 */
exports.deleteReadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { olderThan } = req.query; // بالأيام
    
    const query = {
      user: userId,
      status: "read"
    };
    
    if (olderThan) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(olderThan));
      query.readAt = { $lt: date };
    }

    const result = await Notification.deleteMany(query);

    // إبطال الكاش
    invalidateUserCache(userId);

    res.json({
      success: true,
      message: "تم حذف الإشعارات المقروءة بنجاح",
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error("❌ Delete read notifications error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل حذف الإشعارات المقروءة"
    });
  }
};

// ========== 5. دوال التفضيلات والأجهزة ==========

/**
 * @desc    تحديث تفضيلات الإشعارات
 * @route   PUT /api/notifications/preferences
 * @access  Authenticated
 */
exports.updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // تحديث التفضيلات
    user.preferences = {
      ...user.preferences,
      notifications: {
        ...user.preferences?.notifications,
        ...preferences
      }
    };

    await user.save();

    // إبطال الكاش
    cache.del(`user:${userId}`);
    cache.del(`user:complete:${userId}`);

    res.json({
      success: true,
      message: "تم تحديث تفضيلات الإشعارات",
      data: {
        preferences: user.preferences.notifications
      }
    });
  } catch (error) {
    console.error("❌ Update preferences error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث تفضيلات الإشعارات"
    });
  }
};

/**
 * @desc    تسجيل جهاز لـ Push Notifications
 * @route   POST /api/notifications/devices
 * @access  Authenticated
 */
exports.registerDevice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceToken, platform, deviceId, deviceModel, osVersion, appVersion } = req.body;

    if (!deviceToken || !platform) {
      return res.status(400).json({
        success: false,
        message: "Device token and platform are required"
      });
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform. Must be ios, android, or web"
      });
    }
    
    // التحقق إذا كان الجهاز مسجلاً بالفعل
    let device = await Device.findOne({ deviceId, user: userId });
    
    if (device) {
      // تحديث الجهاز الحالي
      device.deviceToken = deviceToken;
      device.platform = platform;
      device.deviceModel = deviceModel;
      device.osVersion = osVersion;
      device.appVersion = appVersion;
      device.lastActive = new Date();
      device.isActive = true;
    } else {
      // تسجيل جهاز جديد
      device = await Device.create({
        user: userId,
        deviceToken,
        platform,
        deviceId: deviceId || `device-${Date.now()}`,
        deviceModel,
        osVersion,
        appVersion,
        lastActive: new Date(),
        isActive: true
      });
    }

    await device.save();

    // إبطال الكاش
    cache.del(`user:${userId}`);

    res.json({
      success: true,
      message: "تم تسجيل الجهاز بنجاح",
      data: {
        deviceId: device._id,
        platform: device.platform,
        registeredAt: device.createdAt
      }
    });
  } catch (error) {
    console.error("❌ Register device error:", error.message);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Device already registered"
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل تسجيل الجهاز"
    });
  }
};

/**
 * @desc    إلغاء تسجيل جهاز
 * @route   DELETE /api/notifications/devices/:deviceId
 * @access  Authenticated
 */
exports.unregisterDevice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;

    const device = await Device.findOneAndUpdate(
      { _id: deviceId, user: userId },
      { isActive: false },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Device not found"
      });
    }

    // إبطال الكاش
    cache.del(`user:${userId}`);

    res.json({
      success: true,
      message: "تم إلغاء تسجيل الجهاز بنجاح"
    });
  } catch (error) {
    console.error("❌ Unregister device error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إلغاء تسجيل الجهاز"
    });
  }
};

// ========== 6. دوال الأدمن ==========

/**
 * @desc    إرسال إشعار مخصص (للأدمن)
 * @route   POST /api/notifications/send
 * @access  Admin
 */
exports.sendCustomNotification = async (req, res) => {
  try {
    const {
      userIds,
      title,
      content,
      type = "system",
      priority = "medium",
      data = {},
      link,
      icon,
      campaignId,
      group,
      tags = [],
      settings = {}
    } = req.body;

    // التحقق من البيانات
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User IDs are required"
      });
    }

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required"
      });
    }

    // التحقق من عدد المستخدمين
    const maxUsers = 1000;
    if (userIds.length > maxUsers) {
      return res.status(400).json({
        success: false,
        message: `Cannot send to more than ${maxUsers} users at once`
      });
    }

    // التحقق من وجود المستخدمين
    const existingUsers = await User.find({ 
      _id: { $in: userIds },
      isActive: true 
    }).select('_id');
    
    const existingIds = existingUsers.map(u => u._id.toString());
    const invalidIds = userIds.filter(id => !existingIds.includes(id));

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Some users not found or inactive: ${invalidIds.join(', ')}`
      });
    }

    // إنشاء إشعارات لكل مستخدم
    const notificationsData = existingIds.map(userId => ({
      user: userId,
      type,
      title,
      content,
      priority,
      data,
      link,
      icon: icon || getIconByType(type),
      campaignId: campaignId || `campaign-${Date.now()}`,
      group,
      tags: [...tags, "custom", "admin_sent"],
      settings: {
        push: settings.push !== undefined ? settings.push : true,
        email: settings.email || false,
        sms: settings.sms || false,
        inApp: settings.inApp !== undefined ? settings.inApp : true
      }
    }));

    // إرسال الإشعارات
    const result = await notificationService.sendBulkNotifications(notificationsData);

    // إبطال الكاش لجميع المستخدمين
    existingIds.forEach(userId => {
      invalidateUserCache(userId);
      
      // إرسال إشعار فوري عبر Socket.io
      socketService.sendToUser(userId, {
        type: "notification:new",
        data: {
          title,
          content,
          type,
          priority,
          link,
          icon,
          timestamp: new Date()
        }
      });
    });

    res.json({
      success: true,
      message: "تم إرسال الإشعارات بنجاح",
      data: {
        ...result,
        campaignId: notificationsData[0]?.campaignId,
        totalUsers: existingIds.length,
        invalidIds: invalidIds.length > 0 ? invalidIds : undefined
      }
    });
  } catch (error) {
    console.error("❌ Send custom notification error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إرسال الإشعارات"
    });
  }
};

/**
 * @desc    الحصول على إحصائيات الحملة
 * @route   GET /api/notifications/campaign/:campaignId/stats
 * @access  Admin
 */
exports.getCampaignStats = async (req, res) => {
  try {
    const { campaignId } = req.params;

    const cacheKey = `campaign:stats:${campaignId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const [
      totalCount,
      readCount,
      byType,
      byPriority,
      byDay,
      deliveryStats,
      users
    ] = await Promise.all([
      Notification.countDocuments({ campaignId }),
      
      Notification.countDocuments({ campaignId, status: "read" }),
      
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 }
          }
        }
      ]),
      
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 }
          }
        }
      ]),
      
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$sentAt" }
            },
            count: { $sum: 1 },
            readCount: {
              $sum: { $cond: [{ $eq: ["$status", "read"] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: -1 } }
      ]),
      
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: null,
            pushSent: { $sum: { $cond: [{ $eq: ["$delivery.pushSent", true] }, 1, 0] } },
            emailSent: { $sum: { $cond: [{ $eq: ["$delivery.emailSent", true] }, 1, 0] } },
            smsSent: { $sum: { $cond: [{ $eq: ["$delivery.smsSent", true] }, 1, 0] } }
          }
        }
      ]),
      
      Notification.distinct("user", { campaignId })
    ]);

    const uniqueUsers = users.length;

    const responseData = {
      success: true,
      data: {
        campaignId,
        summary: {
          total: totalCount,
          read: readCount,
          unread: totalCount - readCount,
          uniqueUsers,
          engagementRate: totalCount > 0 ? ((readCount / totalCount) * 100).toFixed(2) : 0
        },
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byPriority: byPriority.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byDay,
        delivery: deliveryStats[0] || { pushSent: 0, emailSent: 0, smsSent: 0 },
        timeline: {
          startDate: await Notification.findOne({ campaignId })
            .sort({ sentAt: 1 })
            .select('sentAt')
            .lean(),
          endDate: await Notification.findOne({ campaignId })
            .sort({ sentAt: -1 })
            .select('sentAt')
            .lean()
        }
      },
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 600); // 10 دقائق
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ Get campaign stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات الحملة"
    });
  }
};

/**
 * @desc    الحصول على إحصائيات جميع الإشعارات
 * @route   GET /api/notifications/all/stats
 * @access  Admin
 */
exports.getAllNotificationsStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) filter.sentAt.$gte = new Date(startDate);
      if (endDate) filter.sentAt.$lte = new Date(endDate);
    }

    const cacheKey = `notifications:global:stats:${JSON.stringify(filter)}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const stats = await Notification.aggregate([
      { $match: filter },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                read: { $sum: { $cond: [{ $eq: ["$status", "read"] }, 1, 0] } },
                unread: { $sum: { $cond: [{ $eq: ["$status", "unread"] }, 1, 0] } },
                archived: { $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] } }
              }
            }
          ],
          byType: [
            {
              $group: {
                _id: "$type",
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],
          byPriority: [
            {
              $group: {
                _id: "$priority",
                count: { $sum: 1 }
              }
            }
          ],
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$sentAt" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 }
          ],
          topUsers: [
            {
              $group: {
                _id: "$user",
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
          ]
        }
      }
    ]);

    const responseData = {
      success: true,
      data: {
        overview: stats[0]?.overview[0] || { total: 0, read: 0, unread: 0, archived: 0 },
        byType: stats[0]?.byType || [],
        byPriority: stats[0]?.byPriority || [],
        byDay: stats[0]?.byDay || [],
        topUsers: stats[0]?.topUsers.map(item => ({
          userId: item._id,
          count: item.count,
          name: item.userInfo[0]?.name || 'مستخدم محذوف'
        })) || []
      },
      period: { startDate, endDate },
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 300); // 5 دقائق
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ Get all notifications stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات الإشعارات"
    });
  }
};

// ========== 7. دوال مساعدة للنظام ==========

/**
 * @desc    تنظيف الإشعارات المنتهية (للمهام المجدولة)
 * @access  Internal
 */
exports.cleanupExpiredNotifications = async () => {
  try {
    const result = await Notification.deleteMany({
      expiresAt: { $lt: new Date() }
    });

    console.log(`🧹 Cleaned up ${result.deletedCount} expired notifications`);
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    console.error("❌ Cleanup error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * @desc    إنشاء إشعار ترحيبي للمستخدم الجديد
 * @access  Internal
 */
exports.createWelcomeNotification = async (userId, userName) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type: "welcome",
      title: "مرحباً بك! 👋",
      content: `شكراً لانضمامك إلينا ${userName}. نتمنى لك تجربة ممتعة مع تطبيقنا.`,
      priority: "medium",
      icon: "👋",
      tags: ["welcome", "system"],
      settings: {
        push: true,
        email: true,
        inApp: true
      }
    });

    return notification;
  } catch (error) {
    console.error("❌ Create welcome notification error:", error.message);
    return null;
  }
};

/**
 * @desc    إنشاء إشعار لتغيير كلمة المرور
 * @access  Internal
 */
exports.createPasswordChangedNotification = async (userId) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type: "security",
      title: "🔐 تم تغيير كلمة المرور",
      content: "تم تغيير كلمة مرور حسابك بنجاح. إذا لم تكن أنت من قام بهذا التغيير، يرجى التواصل مع الدعم فوراً.",
      priority: "high",
      icon: "🔐",
      tags: ["security", "password"],
      settings: {
        push: true,
        email: true,
        inApp: true
      }
    });

    return notification;
  } catch (error) {
    console.error("❌ Create password changed notification error:", error.message);
    return null;
  }
};

module.exports = exports;