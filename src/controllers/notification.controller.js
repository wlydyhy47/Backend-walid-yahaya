const notificationService = require("../services/notification.service");
const PaginationUtils = require("../utils/pagination.util");

/**
 * 📋 الحصول على إشعارات المستخدم
 * GET /api/notifications
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
      includeExpired: req.query.includeExpired === "true",
    };

    const result = await notificationService.getUserNotifications(userId, options);
    
    if (result.success) {
      res.json({
        success: true,
        ...result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Get notifications error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get notifications",
    });
  }
};

/**
 * 📊 الحصول على إحصائيات الإشعارات
 * GET /api/notifications/stats
 */
exports.getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await notificationService.getNotificationStats(userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Get notification stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get notification statistics",
    });
  }
};

/**
 * 👁️ تحديث حالة الإشعار
 * PUT /api/notifications/:id/status
 */
exports.updateNotificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    const { status } = req.body;

    if (!["read", "unread", "archived"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed: read, unread, archived",
      });
    }

    const result = await notificationService.updateNotificationStatus(
      userId,
      notificationId,
      status
    );

    if (result.success) {
      res.json({
        success: true,
        message: `Notification marked as ${status}`,
        data: result.data,
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Update notification status error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update notification status",
    });
  }
};

/**
 * ✅ تحديد جميع الإشعارات كمقروءة
 * PUT /api/notifications/mark-all-read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await notificationService.markAllAsRead(userId);
    
    if (result.success) {
      res.json({
        success: true,
        message: "All notifications marked as read",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Mark all as read error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
    });
  }
};

/**
 * 🗑️ حذف إشعار
 * DELETE /api/notifications/:id
 */
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await notificationService.deleteNotification(userId, notificationId);

    if (result.success) {
      res.json({
        success: true,
        message: "Notification deleted successfully",
        data: result.data,
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Delete notification error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
    });
  }
};

/**
 * 🧹 حذف جميع الإشعارات المقروءة
 * DELETE /api/notifications/read
 */
exports.deleteReadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { olderThan } = req.query;
    
    const query = {
      user: userId,
      status: "read",
    };
    
    if (olderThan) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(olderThan));
      query.readAt = { $lt: date };
    }

    const Notification = require("../models/notification.model");
    const result = await Notification.deleteMany(query);

    // إبطال الكاش
    const cache = require("../utils/cache.util");
    cache.invalidatePattern(`notifications:*:${userId}`);

    res.json({
      success: true,
      message: "Read notifications deleted successfully",
      data: {
        deletedCount: result.deletedCount,
      },
    });
  } catch (error) {
    console.error("❌ Delete read notifications error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete read notifications",
    });
  }
};

/**
 * 🎯 إرسال إشعار مخصص (للأدمن فقط)
 * POST /api/notifications/send
 */
exports.sendCustomNotification = async (req, res) => {
  try {
    // التحقق من صلاحية الأدمن
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can send custom notifications",
      });
    }

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
      settings = {},
    } = req.body;

    // التحقق من البيانات
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User IDs are required",
      });
    }

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    // التحقق من عدد المستخدمين
    const maxUsers = 1000; // حد أقصى لإرسال دفعة واحدة
    if (userIds.length > maxUsers) {
      return res.status(400).json({
        success: false,
        message: `Cannot send to more than ${maxUsers} users at once`,
      });
    }

    // إنشاء إشعارات لكل مستخدم
    const notificationsData = userIds.map(userId => ({
      user: userId,
      type,
      title,
      content,
      priority,
      data,
      link,
      icon: icon || Notification.getIconByType(type),
      campaignId,
      group,
      tags: [...tags, "custom", "admin_sent"],
      settings: {
        push: settings.push !== undefined ? settings.push : true,
        email: settings.email || false,
        sms: settings.sms || false,
        inApp: settings.inApp !== undefined ? settings.inApp : true,
      },
    }));

    // إرسال الإشعارات
    const result = await notificationService.sendBulkNotifications(notificationsData);

    res.json({
      success: true,
      message: "Notifications sent successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Send custom notification error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to send notifications",
    });
  }
};

/**
 * 📈 الحصول على إحصائيات الحملة (للأدمن)
 * GET /api/notifications/campaign/:campaignId/stats
 */
exports.getCampaignStats = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can view campaign stats",
      });
    }

    const { campaignId } = req.params;
    const Notification = require("../models/notification.model");

    const [
      totalCount,
      readCount,
      byType,
      byPriority,
      byDay,
      deliveryStats,
    ] = await Promise.all([
      Notification.countDocuments({ campaignId }),
      Notification.countDocuments({ campaignId, status: "read" }),
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
          },
        },
      ]),
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
          },
        },
      ]),
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$sentAt" },
            },
            count: { $sum: 1 },
            readCount: {
              $sum: { $cond: [{ $eq: ["$status", "read"] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: -1 } },
      ]),
      Notification.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: null,
            pushSent: { $sum: { $cond: [{ $eq: ["$delivery.pushSent", true] }, 1, 0] } },
            emailSent: { $sum: { $cond: [{ $eq: ["$delivery.emailSent", true] }, 1, 0] } },
            smsSent: { $sum: { $cond: [{ $eq: ["$delivery.smsSent", true] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const uniqueUsers = await Notification.distinct("user", { campaignId });
    
    res.json({
      success: true,
      data: {
        campaignId,
        total: totalCount,
        read: readCount,
        unread: totalCount - readCount,
        uniqueUsers: uniqueUsers.length,
        engagementRate: totalCount > 0 ? (readCount / totalCount) * 100 : 0,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byPriority: byPriority.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byDay,
        delivery: deliveryStats[0] || {},
      },
    });
  } catch (error) {
    console.error("❌ Get campaign stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get campaign statistics",
    });
  }
};

/**
 * 🔔 تحديث تفضيلات الإشعارات
 * PUT /api/notifications/preferences
 */
exports.updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body;

    const User = require("../models/user.model");
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // تحديث التفضيلات
    user.preferences = {
      ...user.preferences,
      notifications: {
        ...user.preferences?.notifications,
        ...preferences,
      },
    };

    await user.save();

    // إبطال الكاش
    const cache = require("../utils/cache.util");
    cache.del(`user:${userId}`);
    cache.del(`user:complete:${userId}`);

    res.json({
      success: true,
      message: "Notification preferences updated",
      data: {
        preferences: user.preferences.notifications,
      },
    });
  } catch (error) {
    console.error("❌ Update preferences error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update notification preferences",
    });
  }
};

/**
 * 📱 تسجيل جهاز لـ Push Notifications
 * POST /api/notifications/devices
 */
exports.registerDevice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceToken, platform, deviceId, appVersion } = req.body;

    if (!deviceToken || !platform) {
      return res.status(400).json({
        success: false,
        message: "Device token and platform are required",
      });
    }

    const Device = require("../models/device.model");
    
    // التحقق إذا كان الجهاز مسجلاً بالفعل
    let device = await Device.findOne({ deviceId, user: userId });
    
    if (device) {
      // تحديث الجهاز الحالي
      device.deviceToken = deviceToken;
      device.platform = platform;
      device.appVersion = appVersion;
      device.lastActive = new Date();
      device.isActive = true;
    } else {
      // تسجيل جهاز جديد
      device = await Device.create({
        user: userId,
        deviceToken,
        platform,
        deviceId,
        appVersion,
        lastActive: new Date(),
        isActive: true,
      });
    }

    await device.save();

    res.json({
      success: true,
      message: "Device registered successfully",
      data: {
        deviceId: device._id,
        platform: device.platform,
        registeredAt: device.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Register device error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to register device",
    });
  }
};