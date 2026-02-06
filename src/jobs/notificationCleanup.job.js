const cron = require("node-cron");
const notificationService = require("../services/notification.service");
const Notification = require("../models/notification.model");

class NotificationCleanupJob {
  constructor() {
    this.jobs = [];
  }

  /**
   * بدء جميع المهام المجدولة
   */
  start() {
    console.log("⏰ Starting notification cleanup jobs...");

    // مهمة تنظيف الإشعارات المنتهية كل يوم في منتصف الليل
    this.jobs.push(
      cron.schedule("0 0 * * *", async () => {
        console.log("🧹 Running expired notifications cleanup...");
        try {
          const result = await notificationService.cleanupExpiredNotifications();
          console.log(`✅ Cleanup completed: ${result.deletedCount} notifications deleted`);
        } catch (error) {
          console.error("❌ Cleanup job error:", error.message);
        }
      })
    );

    // مهمة إرسال تذكير التقييم كل يوم في 6 مساءً
    this.jobs.push(
      cron.schedule("0 18 * * *", async () => {
        console.log("⭐ Sending review reminder notifications...");
        await this.sendReviewReminders();
      })
    );

    // مهمة تحديث إحصائيات الإشعارات كل ساعة
    this.jobs.push(
      cron.schedule("0 * * * *", async () => {
        console.log("📊 Updating notification statistics...");
        await this.updateNotificationStats();
      })
    );

    // مهمة إعادة محاولة إرسال الإشعارات الفاشلة كل 5 دقائق
    this.jobs.push(
      cron.schedule("*/5 * * * *", async () => {
        console.log("🔄 Retrying failed notifications...");
        await this.retryFailedNotifications();
      })
    );

    console.log("✅ Notification cleanup jobs started");
  }

  /**
   * إرسال تذكير التقييم للطلبات المكتملة
   */
  async sendReviewReminders() {
    try {
      const Order = require("../models/order.model");
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // البحث عن الطلبات المكتملة منذ 24 ساعة ولم يتم تقييمها
      const orders = await Order.find({
        status: "delivered",
        deliveredAt: { 
          $gte: oneDayAgo,
          $lt: new Date(Date.now() - 23 * 60 * 60 * 1000), // بين 23 و 24 ساعة
        },
      })
      .populate("user", "name")
      .populate("restaurant", "name");

      // التحقق إذا كان هناك تقييم سابق
      const Review = require("../models/review.model");
      
      for (const order of orders) {
        const existingReview = await Review.findOne({
          user: order.user._id,
          restaurant: order.restaurant._id,
          order: order._id,
        });

        if (!existingReview) {
          // إرسال إشعار تذكير التقييم
          await notificationService.sendNotification({
            user: order.user._id,
            type: "review_reminder",
            title: "كيف كانت تجربتك؟",
            content: `شاركنا رأيك في تجربة طلبك من ${order.restaurant.name}`,
            data: {
              orderId: order._id,
              restaurantId: order.restaurant._id,
              restaurantName: order.restaurant.name,
            },
            priority: "low",
            link: `/restaurants/${order.restaurant._id}/review`,
            icon: "⭐",
            tags: ["review", "reminder", `order_${order._id}`],
          });
        }
      }

      console.log(`✅ Sent ${orders.length} review reminders`);
    } catch (error) {
      console.error("❌ Review reminder job error:", error.message);
    }
  }

  /**
   * تحديث إحصائيات الإشعارات
   */
  async updateNotificationStats() {
    try {
      // تحديث إحصائيات الحملات النشطة
      const activeCampaigns = await Notification.distinct("campaignId", {
        campaignId: { $exists: true },
        sentAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      });

      for (const campaignId of activeCampaigns) {
        const stats = await Notification.aggregate([
          { $match: { campaignId } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              read: { 
                $sum: { $cond: [{ $eq: ["$status", "read"] }, 1, 0] } 
              },
              delivered: {
                $sum: { $cond: [{ $eq: ["$delivery.pushSent", true] }, 1, 0] },
              },
            },
          },
        ]);

        if (stats.length > 0) {
          console.log(`📊 Campaign ${campaignId}:`, stats[0]);
        }
      }
    } catch (error) {
      console.error("❌ Stats update job error:", error.message);
    }
  }

  /**
   * إعادة محاولة إرسال الإشعارات الفاشلة
   */
  async retryFailedNotifications() {
    try {
      const notifications = await Notification.find({
        $or: [
          { "delivery.pushSent": false, "delivery.retryCount": { $lt: 3 } },
          { "delivery.emailSent": false, "delivery.retryCount": { $lt: 3 } },
          { "delivery.smsSent": false, "delivery.retryCount": { $lt: 3 } },
        ],
        sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      for (const notification of notifications) {
        try {
          await notification.retryDelivery();
          console.log(`🔄 Retrying notification ${notification._id}`);
        } catch (error) {
          console.error(`❌ Retry failed for ${notification._id}:`, error.message);
        }
      }
    } catch (error) {
      console.error("❌ Retry job error:", error.message);
    }
  }

  /**
   * إيقاف جميع المهام
   */
  stop() {
    this.jobs.forEach(job => job.stop());
    console.log("🛑 Notification cleanup jobs stopped");
  }
}

module.exports = new NotificationCleanupJob();