const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const socketService = require("./socket.service");
const emailService = require("./email.service");
const smsService = require("./sms.service");
const cache = require("../utils/cache.util");

class NotificationService {
  /**
   * إرسال إشعار واحد
   */
  async sendNotification(notificationData) {
    try {
      console.log(`📨 Sending notification to user ${notificationData.user}`);
      
      // إنشاء الإشعار في قاعدة البيانات
      const notification = await Notification.create(notificationData);
      
      // جلب تفضيلات المستخدم
      const user = await User.findById(notificationData.user).select("preferences");
      
      if (!user) {
        console.error(`User ${notificationData.user} not found`);
        return notification;
      }
      
      // إرسال الإشعارات حسب التفضيلات
      const deliveryPromises = [];
      
      // إشعارات داخل التطبيق
      if (notification.settings.inApp) {
        deliveryPromises.push(
          this.sendInAppNotification(notification, user)
        );
      }
      
      // إشعارات Push (إذا كان المستخدم مسموحاً)
      if (notification.settings.push && user.preferences?.notifications?.push) {
        deliveryPromises.push(
          this.sendPushNotification(notification, user)
        );
      }
      
      // إرسال Email (إذا كان مسموحاً)
      if (notification.settings.email && user.preferences?.notifications?.email) {
        deliveryPromises.push(
          this.sendEmailNotification(notification, user)
        );
      }
      
      // إرسال SMS (إذا كان مسموحاً)
      if (notification.settings.sms && user.preferences?.notifications?.sms) {
        deliveryPromises.push(
          this.sendSmsNotification(notification, user)
        );
      }
      
      // تنفيذ جميع عمليات الإرسال بالتوازي
      await Promise.allSettled(deliveryPromises);
      
      // إبطال الكاش
      this.invalidateCache(notification.user);
      
      console.log(`✅ Notification sent: ${notification._id}`);
      return notification;
      
    } catch (error) {
      console.error("❌ Notification sending error:", error.message);
      throw error;
    }
  }

  /**
   * إرسال إشعارات مجمعة
   */
  async sendBulkNotifications(notificationsData) {
    try {
      console.log(`📨 Sending ${notificationsData.length} notifications in bulk`);
      
      const results = await Promise.allSettled(
        notificationsData.map(data => this.sendNotification(data))
      );
      
      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;
      
      console.log(`📊 Bulk sending results: ${successful} successful, ${failed} failed`);
      
      return {
        total: notificationsData.length,
        successful,
        failed,
        results: results.map((r, i) => ({
          data: notificationsData[i],
          status: r.status,
          error: r.status === "rejected" ? r.reason.message : null,
        })),
      };
      
    } catch (error) {
      console.error("❌ Bulk notification error:", error);
      throw error;
    }
  }

  /**
   * إشعارات داخل التطبيق (Real-time via Socket.io)
   */
  async sendInAppNotification(notification, user) {
    try {
      // إرسال عبر Socket.io
      socketService.sendToUser(notification.user.toString(), {
        type: "notification:new",
        data: {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          content: notification.content,
          icon: notification.icon,
          link: notification.link,
          priority: notification.priority,
          timeAgo: notification.timeAgo,
          createdAt: notification.createdAt,
        },
      });
      
      notification.delivery.pushSent = true;
      await notification.save();
      
      return { success: true, channel: "inApp" };
      
    } catch (error) {
      console.error("❌ In-app notification error:", error.message);
      notification.delivery.pushError = error.message;
      await notification.save();
      
      return { success: false, channel: "inApp", error: error.message };
    }
  }

  /**
   * إشعارات Push (FCM/APN)
   */
  async sendPushNotification(notification, user) {
    try {
      // TODO: تنفيذ إرسال Push notifications باستخدام FCM أو APN
      console.log(`📱 Would send push notification to ${user._id}`);
      
      // محاكاة إرسال ناجح للتطوير
      notification.delivery.pushSent = true;
      await notification.save();
      
      return { success: true, channel: "push" };
      
    } catch (error) {
      console.error("❌ Push notification error:", error.message);
      notification.delivery.pushError = error.message;
      await notification.save();
      
      return { success: false, channel: "push", error: error.message };
    }
  }

  /**
   * إرسال إشعارات عبر البريد الإلكتروني
   */
  async sendEmailNotification(notification, user) {
    try {
      const emailService = require('./email.service');
      const userDetails = await User.findById(user._id).select("email name");
      
      if (!userDetails) {
        return { success: false, channel: "email", error: "User not found" };
      }
      
      if (!userDetails.email) {
        return { success: false, channel: "email", error: "No email address" };
      }
      
      // إرسال البريد الفعلي
      const result = await emailService.sendNotificationEmail({
        user: userDetails,
        notification: notification
      });
      
      notification.delivery.emailSent = result.success;
      await notification.save();
      
      return { 
        success: result.success, 
        channel: "email",
        messageId: result.messageId 
      };
      
    } catch (error) {
      console.error("❌ Email notification error:", error.message);
      notification.delivery.emailError = error.message;
      await notification.save();
      
      return { success: false, channel: "email", error: error.message };
    }
  }

  /**
   * إرسال إشعارات عبر SMS
   */
  async sendSmsNotification(notification, user) {
    try {
      // جلب رقم الهاتف للمستخدم
      const userDetails = await User.findById(user._id).select("phone name");
      
      if (!userDetails || !userDetails.phone) {
        return { success: false, channel: "sms", error: "No phone number" };
      }
      
      // TODO: تنفيذ إرسال SMS فعلي
      console.log(`📱 Would send SMS to ${userDetails.phone}`);
      
      // محاكاة إرسال ناجح للتطوير
      notification.delivery.smsSent = true;
      await notification.save();
      
      return { success: true, channel: "sms" };
      
    } catch (error) {
      console.error("❌ SMS notification error:", error.message);
      notification.delivery.smsError = error.message;
      await notification.save();
      
      return { success: false, channel: "sms", error: error.message };
    }
  }

  /**
   * إنشاء إشعارات تلقائية للطلبات
   */
  async createOrderNotifications(order) {
    try {
      const notifications = [];
      
      // إشعار إنشاء الطلب للعميل
      notifications.push({
        user: order.user,
        type: "order_created",
        title: "تم إنشاء طلب جديد",
        content: `تم إنشاء طلبك #${order._id.toString().slice(-6)} بنجاح.`,
        data: {
          orderId: order._id,
          orderNumber: order._id.toString().slice(-6),
          totalPrice: order.totalPrice,
          restaurant: order.restaurant,
        },
        priority: "high",
        link: `/orders/${order._id}`,
        icon: "🛒",
        tags: ["order", "order_created", `order_${order._id}`],
      });
      
      // إشعار للمطعم (إذا كان لديه حساب أدمن)
      // TODO: جلب أدمن المطعم
      
      // إذا كان هناك مندوب معين
      if (order.driver) {
        notifications.push({
          user: order.driver,
          type: "order_assigned",
          title: "طلب جديد معين لك",
          content: `تم تعيين طلب #${order._id.toString().slice(-6)} لك للتوصيل.`,
          data: {
            orderId: order._id,
            orderNumber: order._id.toString().slice(-6),
            totalPrice: order.totalPrice,
            restaurant: order.restaurant,
            customer: order.user,
          },
          priority: "high",
          link: `/driver/orders/${order._id}`,
          icon: "🚗",
          tags: ["order", "driver", `order_${order._id}`],
        });
      }
      
      // إرسال جميع الإشعارات
      const result = await this.sendBulkNotifications(notifications);
      
      return {
        success: true,
        notificationsCount: notifications.length,
        details: result,
      };
      
    } catch (error) {
      console.error("❌ Order notifications error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * تحديث إشعارات حالة الطلب
   */
  async updateOrderStatusNotifications(order, oldStatus, newStatus) {
    try {
      const notificationType = `order_${newStatus}`;
      
      // إشعار للعميل
      await this.sendNotification({
        user: order.user,
        type: notificationType,
        title: this.getOrderStatusTitle(newStatus),
        content: this.getOrderStatusContent(order, newStatus),
        data: {
          orderId: order._id,
          orderNumber: order._id.toString().slice(-6),
          oldStatus,
          newStatus,
          totalPrice: order.totalPrice,
        },
        priority: this.getOrderStatusPriority(newStatus),
        link: `/orders/${order._id}`,
        icon: this.getOrderStatusIcon(newStatus),
        tags: ["order", notificationType, `order_${order._id}`],
      });
      
      // إذا كان هناك مندوب، أرسل له إشعاراً أيضاً
      if (order.driver && ["picked", "delivered"].includes(newStatus)) {
        await this.sendNotification({
          user: order.driver,
          type: notificationType,
          title: this.getDriverOrderStatusTitle(newStatus),
          content: this.getDriverOrderStatusContent(order, newStatus),
          data: {
            orderId: order._id,
            orderNumber: order._id.toString().slice(-6),
            oldStatus,
            newStatus,
            customer: order.user,
          },
          priority: "medium",
          link: `/driver/orders/${order._id}`,
          icon: this.getOrderStatusIcon(newStatus),
          tags: ["order", "driver", notificationType, `order_${order._id}`],
        });
      }
      
      return { success: true };
      
    } catch (error) {
      console.error("❌ Order status notification error:", error.message);
      return { success: false, error: error.message };
    }
  }

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
      } = options;
      
      const skip = (page - 1) * limit;
      
      // بناء الاستعلام
      const query = { user: userId };
      
      if (status) query.status = status;
      if (type) query.type = type;
      if (priority) query.priority = priority;
      
      if (unreadOnly) {
        query.status = "unread";
      }
      
      if (!includeExpired) {
        query.expiresAt = { $gt: new Date() };
      }
      
      // جلب الإشعارات مع pagination
      const [notifications, total] = await Promise.all([
        Notification.find(query)
          .sort({ sentAt: -1, priority: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        
        Notification.countDocuments(query),
      ]);
      
      // جلب عدد الإشعارات غير المقروءة
      const unreadCount = unreadOnly 
        ? total 
        : await Notification.countDocuments({
            user: userId,
            status: "unread",
            expiresAt: { $gt: new Date() },
          });
      
      // إضافة الوقت النسبي
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
      console.error("❌ Get user notifications error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

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
        return {
          success: false,
          error: "Notification not found",
        };
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
          return {
            success: false,
            error: "Invalid status",
          };
      }
      
      // إبطال الكاش
      this.invalidateCache(userId);
      
      return {
        success: true,
        data: {
          id: notification._id,
          oldStatus,
          newStatus: status,
        },
      };
      
    } catch (error) {
      console.error("❌ Update notification status error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * تحديث جميع الإشعارات كـ مقروءة
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.markAllAsRead(userId);
      
      // إبطال الكاش
      this.invalidateCache(userId);
      
      return {
        success: true,
        data: {
          modifiedCount: result.modifiedCount,
        },
      };
      
    } catch (error) {
      console.error("❌ Mark all as read error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * حذف الإشعار
   */
  async deleteNotification(userId, notificationId) {
    try {
      const result = await Notification.findOneAndDelete({
        _id: notificationId,
        user: userId,
      });
      
      if (!result) {
        return {
          success: false,
          error: "Notification not found",
        };
      }
      
      // إبطال الكاش
      this.invalidateCache(userId);
      
      return {
        success: true,
        data: {
          id: notificationId,
          deleted: true,
        },
      };
      
    } catch (error) {
      console.error("❌ Delete notification error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * تنظيف الإشعارات المنتهية
   */
  async cleanupExpiredNotifications() {
    try {
      const result = await Notification.cleanupExpired();
      
      console.log(`🧹 Cleaned up ${result.deletedCount} expired notifications`);
      
      return {
        success: true,
        deletedCount: result.deletedCount,
      };
      
    } catch (error) {
      console.error("❌ Cleanup notifications error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * إحصائيات الإشعارات
   */
  async getNotificationStats(userId) {
    try {
      const cacheKey = `notifications:stats:${userId}`;
      const cachedStats = cache.get(cacheKey);
      
      if (cachedStats) {
        return cachedStats;
      }
      
      const [
        totalCount,
        unreadCount,
        byType,
        byPriority,
        dailyStats,
        weeklyStats,
      ] = await Promise.all([
        // العدد الكلي
        Notification.countDocuments({ user: userId, expiresAt: { $gt: new Date() } }),
        
        // العدد غير المقروء
        Notification.countDocuments({ 
          user: userId, 
          status: "unread",
          expiresAt: { $gt: new Date() },
        }),
        
        // حسب النوع
        Notification.aggregate([
          { 
            $match: { 
              user: userId,
              expiresAt: { $gt: new Date() },
            } 
          },
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              unread: {
                $sum: { $cond: [{ $eq: ["$status", "unread"] }, 1, 0] },
              },
            },
          },
          { $sort: { count: -1 } },
        ]),
        
        // حسب الأولوية
        Notification.aggregate([
          { 
            $match: { 
              user: userId,
              expiresAt: { $gt: new Date() },
            } 
          },
          {
            $group: {
              _id: "$priority",
              count: { $sum: 1 },
            },
          },
        ]),
        
        // إحصائيات يومية (آخر 7 أيام)
        Notification.aggregate([
          {
            $match: {
              user: userId,
              sentAt: { 
                $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          },
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
        
        // إحصائيات أسبوعية (آخر 4 أسابيع)
        Notification.aggregate([
          {
            $match: {
              user: userId,
              sentAt: { 
                $gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%W", date: "$sentAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 4 },
        ]),
      ]);
      
      const stats = {
        success: true,
        data: {
          total: totalCount,
          unread: unreadCount,
          read: totalCount - unreadCount,
          byType: byType.reduce((acc, item) => {
            acc[item._id] = item;
            return acc;
          }, {}),
          byPriority: byPriority.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          dailyStats: dailyStats,
          weeklyStats: weeklyStats,
          deliveryRate: this.calculateDeliveryRate(byType),
          engagementRate: totalCount > 0 
            ? ((totalCount - unreadCount) / totalCount) * 100 
            : 0,
        },
      };
      
      // حفظ في الكاش لمدة 5 دقائق
      cache.set(cacheKey, stats, 300);
      
      return stats;
      
    } catch (error) {
      console.error("❌ Get notification stats error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ====== دوال مساعدة ======

  getOrderStatusTitle(status) {
    const titles = {
      pending: "طلب قيد الانتظار",
      accepted: "تم قبول الطلب",
      picked: "تم استلام الطلب",
      delivered: "تم التوصيل",
      cancelled: "تم إلغاء الطلب",
    };
    
    return titles[status] || "تحديث على طلبك";
  }

  getOrderStatusContent(order, status) {
    const contents = {
      pending: `طلبك #${order._id.toString().slice(-6)} قيد الانتظار.`,
      accepted: `تم قبول طلبك #${order._id.toString().slice(-6)} وجاري تجهيزه.`,
      picked: `تم استلام طلبك #${order._id.toString().slice(-6)} من المطعم.`,
      delivered: `تم توصيل طلبك #${order._id.toString().slice(-6)} بنجاح.`,
      cancelled: `تم إلغاء طلبك #${order._id.toString().slice(-6)}.`,
    };
    
    return contents[status] || `هناك تحديث على طلبك #${order._id.toString().slice(-6)}.`;
  }

  getDriverOrderStatusTitle(status) {
    const titles = {
      picked: "تم استلام الطلب من المطعم",
      delivered: "تم تسليم الطلب للعميل",
    };
    
    return titles[status] || "تحديث على الطلب";
  }

  getDriverOrderStatusContent(order, status) {
    const contents = {
      picked: `تم استلام طلب #${order._id.toString().slice(-6)} من المطعم.`,
      delivered: `تم تسليم طلب #${order._id.toString().slice(-6)} للعميل.`,
    };
    
    return contents[status] || `تحديث على طلب #${order._id.toString().slice(-6)}.`;
  }

  getOrderStatusPriority(status) {
    const priorities = {
      cancelled: "urgent",
      delivered: "high",
      accepted: "high",
      picked: "medium",
      pending: "low",
    };
    
    return priorities[status] || "medium";
  }

  getOrderStatusIcon(status) {
    const icons = {
      pending: "⏳",
      accepted: "✅",
      picked: "📦",
      delivered: "🚚",
      cancelled: "❌",
    };
    
    return icons[status] || "🔔";
  }

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

  calculateDeliveryRate(byType) {
    const total = byType.reduce((sum, item) => sum + item.count, 0);
    
    if (total === 0) return 0;
    
    const orderNotifications = byType.filter(item => 
      item._id.startsWith("order_")
    ).reduce((sum, item) => sum + item.count, 0);
    
    return (orderNotifications / total) * 100;
  }

  invalidateCache(userId) {
    cache.del(`notifications:user:${userId}`);
    cache.del(`notifications:stats:${userId}`);
    cache.del(`notifications:unread:${userId}`);
    cache.invalidatePattern(`notifications:*:${userId}`);
  }
}

module.exports = new NotificationService();