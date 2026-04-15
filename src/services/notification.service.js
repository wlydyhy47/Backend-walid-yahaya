// ============================================
// ملف: src/services/notification.service.js (محدث)
// الوصف: خدمة الإشعارات المتقدمة
// ============================================

const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const Device = require("../models/device.model");
const socketService = require("./socket.service");
const emailService = require("./email.service");
const smsService = require("./sms.service");
const cache = require("../utils/cache.util");
const { businessLogger } = require("../utils/logger.util");

class NotificationService {
  constructor() {
    this.deliveryQueue = [];
    this.maxRetries = 3;
    this.batchSize = 50;
  }

  // ========== 1. دوال أساسية ==========

  /**
   * إرسال إشعار واحد
   */
  async sendNotification(notificationData) {
    try {
      businessLogger.info('Sending notification', {
        user: notificationData.user,
        type: notificationData.type
      });

      const notification = await Notification.create(notificationData);
      const user = await User.findById(notificationData.user)
        .select("preferences email phone name");

      if (!user) {
        businessLogger.error('User not found for notification', {
          userId: notificationData.user
        });
        return notification;
      }

      const deliveryPromises = [];

      // إشعار داخل التطبيق (دائماً)
      deliveryPromises.push(
        this.sendInAppNotification(notification, user)
          .catch(err => this.handleDeliveryError(notification, 'inApp', err))
      );

      // Push Notification
      if (notification.settings.push && user.preferences?.notifications?.push) {
        deliveryPromises.push(
          this.sendPushNotification(notification, user)
            .catch(err => this.handleDeliveryError(notification, 'push', err))
        );
      }

      // Email
      if (notification.settings.email && user.preferences?.notifications?.email && user.email) {
        deliveryPromises.push(
          this.sendEmailNotification(notification, user)
            .catch(err => this.handleDeliveryError(notification, 'email', err))
        );
      }

      // SMS
      if (notification.settings.sms && user.preferences?.notifications?.sms && user.phone) {
        deliveryPromises.push(
          this.sendSmsNotification(notification, user)
            .catch(err => this.handleDeliveryError(notification, 'sms', err))
        );
      }

      await Promise.allSettled(deliveryPromises);

      // تجميع الإشعارات المتشابهة
      await this.groupSimilarNotifications(notification);

      this.invalidateCache(notification.user);

      businessLogger.info('Notification sent successfully', {
        id: notification._id,
        user: notification.user
      });

      return notification;
    } catch (error) {
      businessLogger.error('Notification sending failed', {
        error: error.message,
        data: notificationData
      });
      throw error;
    }
  }

  /**
   * إرسال إشعارات مجمعة
   */
  async sendBulkNotifications(notificationsData) {
    try {
      businessLogger.info(`Sending ${notificationsData.length} bulk notifications`);

      const batches = [];
      for (let i = 0; i < notificationsData.length; i += this.batchSize) {
        batches.push(notificationsData.slice(i, i + this.batchSize));
      }

      const results = {
        total: notificationsData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(data => this.sendNotification(data))
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.successful++;
          } else {
            results.failed++;
            results.errors.push({
              data: batch[index],
              error: result.reason?.message
            });
          }
        });

        // تأخير بين الدفعات لتجنب rate limiting
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      businessLogger.info('Bulk notifications completed', {
        total: results.total,
        successful: results.successful,
        failed: results.failed
      });

      return results;
    } catch (error) {
      businessLogger.error('Bulk notification error:', error);
      throw error;
    }
  }

  // ========== 2. قنوات الإرسال ==========

  /**
   * إشعار داخل التطبيق (Socket.io)
   */
  async sendInAppNotification(notification, user) {
    try {
      socketService.sendToUser(notification.user.toString(), {
        type: "notification:new",
        data: {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          content: notification.content,
          icon: notification.icon,
          image: notification.image,
          link: notification.link,
          actions: notification.actions,
          priority: notification.priority,
          timeAgo: this.getRelativeTime(notification.createdAt),
          createdAt: notification.createdAt,
        },
      });

      notification.delivery.pushSent = true;
      await notification.save();

      return { success: true, channel: "inApp" };
    } catch (error) {
      businessLogger.error('In-app notification error:', error);
      throw error;
    }
  }

  /**
   * إشعار Push (FCM/APN)
   */
  async sendPushNotification(notification, user) {
    try {
      // الحصول على أجهزة المستخدم النشطة
      const devices = await Device.findActiveDevices(user._id);

      if (devices.length === 0) {
        businessLogger.info('No active devices for user', { userId: user._id });
        return { success: false, reason: 'no_devices' };
      }

      // TODO: إرسال Push Notification عبر FCM/APN
      // هذا مثال مبسط - سيتم تنفيذه لاحقاً
      const pushPromises = devices.map(device =>
        this.sendToDevice(device, notification)
      );

      await Promise.allSettled(pushPromises);

      notification.delivery.pushSent = true;
      await notification.save();

      return {
        success: true,
        channel: "push",
        devices: devices.length
      };
    } catch (error) {
      businessLogger.error('Push notification error:', error);
      throw error;
    }
  }

  /**
   * إرسال إلى جهاز محدد
   */
  async sendToDevice(device, notification) {
    // TODO: تنفيذ إرسال Push Notification
    console.log(`📱 Sending push to device ${device.deviceToken}`);
    return { success: true };
  }

  /**
   * إشعار بريد إلكتروني
   */
  async sendEmailNotification(notification, user) {
    try {
      if (!user.email) {
        return { success: false, reason: 'no_email' };
      }

      const result = await emailService.sendNotificationEmail({
        user,
        notification: {
          ...notification.toObject(),
          timeAgo: this.getRelativeTime(notification.createdAt)
        }
      });

      notification.delivery.emailSent = result.success;
      await notification.save();

      return result;
    } catch (error) {
      businessLogger.error('Email notification error:', error);
      throw error;
    }
  }

  /**
   * إشعار SMS
   */
  async sendSmsNotification(notification, user) {
    try {
      if (!user.phone) {
        return { success: false, reason: 'no_phone' };
      }

      // نرسل فقط الإشعارات المهمة عبر SMS
      if (!['urgent', 'high'].includes(notification.priority)) {
        return { success: false, reason: 'low_priority' };
      }

      const result = await smsService.sendNotificationSms({
        phone: user.phone,
        title: notification.title,
        content: notification.content.substring(0, 160), // SMS limit
        link: notification.link
      });

      notification.delivery.smsSent = result.success;
      await notification.save();

      return result;
    } catch (error) {
      businessLogger.error('SMS notification error:', error);
      throw error;
    }
  }

  // ========== 3. إدارة الأخطاء وإعادة المحاولة ==========

  /**
   * معالجة أخطاء الإرسال
   */
  async handleDeliveryError(notification, channel, error) {
    businessLogger.error(`Delivery error for ${channel}`, {
      notificationId: notification._id,
      error: error.message
    });

    // إضافة إلى قائمة إعادة المحاولة
    this.deliveryQueue.push({
      notificationId: notification._id,
      channel,
      attempts: 1,
      lastAttempt: new Date(),
      error: error.message
    });

    // تحديث حالة الإرسال في قاعدة البيانات
    const updateField = `delivery.${channel}Error`;
    await Notification.findByIdAndUpdate(notification._id, {
      [updateField]: error.message,
      $inc: { 'delivery.retryCount': 1 }
    });
  }

  /**
   * إعادة محاولة الإشعارات الفاشلة
   */
  async retryFailedDeliveries() {
    const failedNotifications = await Notification.find({
      $or: [
        { 'delivery.pushSent': false, 'delivery.retryCount': { $lt: this.maxRetries } },
        { 'delivery.emailSent': false, 'delivery.retryCount': { $lt: this.maxRetries } },
        { 'delivery.smsSent': false, 'delivery.retryCount': { $lt: this.maxRetries } }
      ],
      sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    for (const notification of failedNotifications) {
      try {
        await notification.retryDelivery();
        businessLogger.info('Retrying failed notification', {
          id: notification._id
        });
      } catch (error) {
        businessLogger.error('Retry failed', {
          id: notification._id,
          error: error.message
        });
      }
    }
  }

  // ========== 4. تجميع الإشعارات المتشابهة ==========

  /**
   * تجميع الإشعارات المتشابهة
   */
  async groupSimilarNotifications(newNotification) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const similar = await Notification.find({
      user: newNotification.user,
      type: newNotification.type,
      group: newNotification.group,
      createdAt: { $gte: oneHourAgo },
      _id: { $ne: newNotification._id }
    }).sort({ createdAt: -1 }).limit(5);

    if (similar.length >= 3) {
      // إرسال إشعار مجمع
      const groupNotification = await Notification.create({
        user: newNotification.user,
        type: 'system',
        title: `لديك ${similar.length + 1} إشعارات جديدة`,
        content: `هناك ${similar.length + 1} إشعارات من نوع ${newNotification.type}`,
        priority: 'low',
        icon: '📋',
        group: newNotification.group,
        data: {
          grouped: true,
          notifications: similar.map(n => n._id).concat(newNotification._id)
        }
      });

      // إرسال الإشعار المجمع عبر Socket
      socketService.sendToUser(newNotification.user.toString(), {
        type: "notification:grouped",
        data: {
          id: groupNotification._id,
          count: similar.length + 1,
          type: newNotification.type,
          title: groupNotification.title
        }
      });
    }
  }

  // ========== 5. دوال خاصة بالطلبات ==========

  /**
   * إنشاء إشعارات للطلب
   */
  async createOrderNotifications(order) {
    try {
      const notifications = [];

      // إشعار للعميل
      notifications.push({
        user: order.user,
        type: "order_created",
        title: "✅ تم إنشاء طلبك",
        content: `طلبك #${order._id.toString().slice(-6)} بقيمة ${order.totalPrice} قيد الانتظار`,
        priority: "high",
        icon: "🛒",
        link: `/orders/${order._id}`,
        data: {
          orderId: order._id,
          orderNumber: order._id.toString().slice(-6),
          totalPrice: order.totalPrice,
          store: order.store,
          status: order.status
        },
        actions: [
          {
            label: "تتبع الطلب",
            url: `/orders/${order._id}/track`,
            type: "primary"
          }
        ],
        tags: ["order", `order_${order._id}`]
      });

      // إشعار للمطعم (إذا كان موجود)
      if (order.store) {
        const store = await require("../models/store.model")
          .findById(order.store)
          .populate('vendor');

        if (store?.vendor) {
          notifications.push({
            user: store.vendor,
            type: "order_created",
            title: "🛒 طلب جديد!",
            content: `طلب جديد بقيمة ${order.totalPrice} من ${order.user?.name || 'عميل'}`,
            priority: "high",
            icon: "📦",
            link: `/store/orders/${order._id}`,
            data: {
              orderId: order._id,
              totalPrice: order.totalPrice,
              itemsCount: order.items?.length || 0
            },
            tags: ["store", `order_${order._id}`]
          });
        }
      }

      // إشعار للمندوب (إذا تم تعيينه)
      if (order.driver) {
        notifications.push({
          user: order.driver,
          type: "driver_assigned",
          title: "🚚 طلب جديد للتوصيل",
          content: `تم تعيينك لتوصيل طلب #${order._id.toString().slice(-6)}`,
          priority: "high",
          icon: "🚗",
          link: `/driver/orders/${order._id}`,
          data: {
            orderId: order._id,
            pickupAddress: order.pickupAddress,
            deliveryAddress: order.deliveryAddress
          },
          tags: ["driver", `order_${order._id}`]
        });
      }

      // إرسال الإشعارات
      const result = await this.sendBulkNotifications(notifications);

      return {
        success: true,
        notificationsCount: notifications.length,
        details: result
      };
    } catch (error) {
      businessLogger.error('Order notifications error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * تحديث إشعارات حالة الطلب
   */
  async updateOrderStatusNotifications(order, oldStatus, newStatus) {
    try {
      const notificationType = `order_${newStatus}`;

      // تحديد الأولوية والأيقونة حسب الحالة
      const config = this.getStatusConfig(newStatus);

      // إشعار للعميل
      await this.sendNotification({
        user: order.user,
        type: notificationType,
        title: config.title,
        content: config.content(order),
        priority: config.priority,
        icon: config.icon,
        link: `/orders/${order._id}`,
        data: {
          orderId: order._id,
          oldStatus,
          newStatus,
          totalPrice: order.totalPrice
        },
        actions: config.actions,
        tags: ["order", notificationType, `order_${order._id}`]
      });

      // إشعار للمندوب للحالات المهمة
      if (order.driver && ['picked', 'delivered'].includes(newStatus)) {
        await this.sendNotification({
          user: order.driver,
          type: notificationType,
          title: config.driverTitle || config.title,
          content: config.driverContent ? config.driverContent(order) : config.content(order),
          priority: "medium",
          icon: config.icon,
          link: `/driver/orders/${order._id}`,
          data: { orderId: order._id },
          tags: ["driver", notificationType, `order_${order._id}`]
        });
      }

      return { success: true };
    } catch (error) {
      businessLogger.error('Order status notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * إعدادات حالة الطلب
   */
  getStatusConfig(status) {
    const configs = {
      pending: {
        title: "⏳ طلب قيد الانتظار",
        content: (order) => `طلبك #${order._id.toString().slice(-6)} قيد انتظار قبول المطعم`,
        priority: "low",
        icon: "⏳",
        actions: [
          { label: "إلغاء الطلب", url: `/orders/${order._id}/cancel`, type: "danger" }
        ]
      },
      accepted: {
        title: "✅ تم قبول الطلب",
        content: (order) => `تم قبول طلبك #${order._id.toString().slice(-6)} وجاري تجهيزه`,
        priority: "high",
        icon: "✅",
        actions: [
          { label: "تتبع الطلب", url: `/orders/${order._id}/track`, type: "primary" }
        ]
      },
      picked: {
        title: "📦 تم استلام الطلب",
        content: (order) => `تم استلام طلبك #${order._id.toString().slice(-6)} من المطعم`,
        driverTitle: "🚚 قم بتوصيل الطلب",
        driverContent: (order) => `قم بتوصيل طلب #${order._id.toString().slice(-6)} إلى العميل`,
        priority: "high",
        icon: "📦",
        actions: [
          { label: "تتبع المندوب", url: `/orders/${order._id}/track`, type: "primary" }
        ]
      },
      delivered: {
        title: "🎉 تم التوصيل",
        content: (order) => `تم توصيل طلبك #${order._id.toString().slice(-6)} بنجاح`,
        priority: "high",
        icon: "🚚",
        actions: [
          { label: "تقييم التجربة", url: `/orders/${order._id}/review`, type: "primary" }
        ]
      },
      cancelled: {
        title: "❌ تم إلغاء الطلب",
        content: (order) => `تم إلغاء طلبك #${order._id.toString().slice(-6)}`,
        priority: "urgent",
        icon: "❌",
        actions: []
      }
    };

    return configs[status] || configs.pending;
  }

  // ========== 6. دوال خاصة بنقاط الولاء ==========

  /**
   * إنشاء إشعار نقاط ولاء
   */
  async createLoyaltyNotification(userId, points, reason, type = "earn") {
    try {
      const notification = await Notification.createLoyaltyNotification(
        userId, points, reason, type
      );

      // إرسال عبر Socket
      socketService.sendToUser(userId.toString(), {
        type: "loyalty:update",
        data: {
          points,
          reason,
          type,
          notificationId: notification._id
        }
      });

      return notification;
    } catch (error) {
      businessLogger.error('Loyalty notification error:', error);
      return null;
    }
  }

  // ========== 7. دوال الحصول على الإشعارات ==========

  /**
   * الحصول على إشعارات المستخدم
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        priority,
        unreadOnly = false,
        includeExpired = false,
        group
      } = options;

      const skip = (page - 1) * limit;
      const query = { user: userId };

      if (status) query.status = status;
      if (type) query.type = type;
      if (priority) query.priority = priority;
      if (group) query.group = group;

      if (unreadOnly) {
        query.status = "unread";
      }

      if (!includeExpired) {
        query.expiresAt = { $gt: new Date() };
      }

      const [notifications, total] = await Promise.all([
        Notification.find(query)
          .sort({ sentAt: -1, priority: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments(query),
      ]);

      const unreadCount = unreadOnly
        ? total
        : await Notification.getUnreadCount(userId);

      const notificationsWithTime = notifications.map(notification => ({
        ...notification,
        timeAgo: this.getRelativeTime(notification.sentAt),
        isExpired: notification.expiresAt && new Date(notification.expiresAt) < new Date(),
      }));

      return {
        success: true,
        data: {
          notifications: notificationsWithTime,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
          },
          stats: {
            total,
            unreadCount,
            readCount: total - unreadCount,
          },
        },
      };
    } catch (error) {
      businessLogger.error('Get notifications error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * الحصول على إحصائيات الإشعارات
   */
  async getNotificationStats(userId) {
    try {
      const cacheKey = `notifications:stats:${userId}`;
      const cachedStats = cache.get(cacheKey);

      if (cachedStats) {
        return cachedStats;
      }

      const stats = await Notification.aggregate([
        {
          $match: {
            user: userId,
            expiresAt: { $gt: new Date() }
          }
        },
        {
          $facet: {
            byStatus: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 }
                }
              }
            ],
            byType: [
              {
                $group: {
                  _id: "$type",
                  count: { $sum: 1 },
                  unread: {
                    $sum: { $cond: [{ $eq: ["$status", "unread"] }, 1, 0] }
                  }
                }
              }
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
              { $limit: 7 }
            ],
            totals: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  unread: {
                    $sum: { $cond: [{ $eq: ["$status", "unread"] }, 1, 0] }
                  }
                }
              }
            ]
          }
        }
      ]);

      const result = {
        success: true,
        data: {
          totals: stats[0]?.totals[0] || { total: 0, unread: 0 },
          byStatus: stats[0]?.byStatus || [],
          byType: stats[0]?.byType || [],
          byPriority: stats[0]?.byPriority || [],
          byDay: stats[0]?.byDay || [],
          readRate: stats[0]?.totals[0]
            ? ((stats[0].totals[0].total - stats[0].totals[0].unread) / stats[0].totals[0].total * 100).toFixed(1)
            : 0
        }
      };

      cache.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      businessLogger.error('Notification stats error:', error);
      return { success: false, error: error.message };
    }
  }

  // ========== 8. دوال مساعدة ==========

  /**
   * تحديث حالة الإشعار
   */
  async updateNotificationStatus(userId, notificationId, status) {
    try {
      const notification = await Notification.findOne({
        _id: notificationId,
        user: userId,
      });

      if (!notification) {
        return { success: false, error: "Notification not found" };
      }

      const oldStatus = notification.status;

      switch (status) {
        case "read":
          await notification.markAsRead();
          break;
        case "unread":
          await notification.markAsUnread();
          break;
        case "archived":
          await notification.archive();
          break;
        default:
          return { success: false, error: "Invalid status" };
      }

      this.invalidateCache(userId);

      // إرسال تحديث عبر Socket
      socketService.sendToUser(userId.toString(), {
        type: "notification:status",
        data: {
          id: notification._id,
          oldStatus,
          newStatus: status
        }
      });

      return {
        success: true,
        data: { id: notification._id, oldStatus, newStatus: status }
      };
    } catch (error) {
      businessLogger.error('Update notification status error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * تحديد الكل كمقروء
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.markAllAsRead(userId);
      this.invalidateCache(userId);

      // إرسال تحديث عبر Socket
      socketService.sendToUser(userId.toString(), {
        type: "notification:all_read",
        data: { count: result.modifiedCount }
      });

      return { success: true, data: { modifiedCount: result.modifiedCount } };
    } catch (error) {
      businessLogger.error('Mark all as read error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * حذف إشعار
   */
  async deleteNotification(userId, notificationId) {
    try {
      const result = await Notification.findOneAndDelete({
        _id: notificationId,
        user: userId,
      });

      if (!result) {
        return { success: false, error: "Notification not found" };
      }

      this.invalidateCache(userId);

      // إرسال تحديث عبر Socket
      socketService.sendToUser(userId.toString(), {
        type: "notification:deleted",
        data: { id: notificationId }
      });

      return { success: true, data: { id: notificationId, deleted: true } };
    } catch (error) {
      businessLogger.error('Delete notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * تنظيف الإشعارات المنتهية
   */
  async cleanupExpiredNotifications() {
    try {
      const result = await Notification.cleanupExpired();
      businessLogger.info(`Cleaned up ${result.deletedCount} expired notifications`);
      return { success: true, deletedCount: result.deletedCount };
    } catch (error) {
      businessLogger.error('Cleanup error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * إبطال الكاش
   */
  invalidateCache(userId) {
    cache.del(`notifications:user:${userId}`);
    cache.del(`notifications:stats:${userId}`);
    cache.del(`notifications:unread:${userId}`);
    cache.invalidatePattern(`notifications:*:${userId}`);
  }

  /**
   * الحصول على الوقت النسبي
   */
  getRelativeTime(date) {
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
  }
}

module.exports = new NotificationService();