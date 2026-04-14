// ============================================
// ملف: src/models/notification.model.js (محدث)
// الوصف: نموذج الإشعارات مع ميزات متقدمة
// ============================================

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "system", "order_created", "order_accepted", "order_picked",
        "order_delivered", "order_cancelled", "driver_assigned",
        "order_assigned",  // ✅ أضف هذا السطر
        "driver_arrived", "payment_success", "payment_failed",
        "review_reminder", "promotion", "announcement", "security",
        "support", "welcome", "password_changed", "profile_updated",
        "new_message", "loyalty_points_earned", "loyalty_points_redeemed",
        "order_ready", "order_preparing",  // ✅ أضف هذا أيضاً
        "reward_available", "reward_expiring"
      ],
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    // ========== 🔥 إضافات جديدة ==========

    /**
     * بيانات إضافية منظمة
     */
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * روابط للإجراءات
     */
    actions: [{
      label: String,
      url: String,
      type: {
        type: String,
        enum: ["primary", "secondary", "danger"],
      }
    }],

    /**
     * صورة مصغرة
     */
    image: String,

    /**
     * لون الإشعار
     */
    color: String,

    /**
     * مجموعة الإشعار (للتجميع)
     */
    group: {
      type: String,
      index: true,
    },

    /**
     * معرف الحملة التسويقية
     */
    campaignId: {
      type: String,
      index: true,
    },

    // ========== نهاية الإضافات ==========

    icon: String,

    link: String,

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    status: {
      type: String,
      enum: ["unread", "read", "archived", "deleted"],
      default: "unread",
      index: true,
    },

    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    readAt: Date,

    expiresAt: Date,

    settings: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      inApp: { type: Boolean, default: true },
    },

    delivery: {
      pushSent: { type: Boolean, default: false },
      emailSent: { type: Boolean, default: false },
      smsSent: { type: Boolean, default: false },
      pushError: String,
      emailError: String,
      smsError: String,
      retryCount: { type: Number, default: 0 },
    },

    tags: [{
      type: String,
      trim: true,
      index: true,
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========== Indexes ==========
notificationSchema.index({ user: 1, status: 1, sentAt: -1 });
notificationSchema.index({ type: 1, sentAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ campaignId: 1, status: 1 });

// ========== Virtuals ==========

notificationSchema.virtual("isExpired").get(function () {
  return this.expiresAt && this.expiresAt < new Date();
});

notificationSchema.virtual("timeAgo").get(function () {
  const now = new Date();
  const sent = new Date(this.sentAt);
  const diffMs = now - sent;
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
});

// ========== Middleware ==========

notificationSchema.pre('save', function (next) {
  if (this.isModified("status") && this.status === "read" && !this.readAt) {
    this.readAt = new Date();
  }

  if (!this.expiresAt) {
    const expiryDays = {
      urgent: 7,
      high: 14,
      medium: 30,
      low: 60,
    };

    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + (expiryDays[this.priority] || 30));
  }

  // تأكد من أن next هي دالة قبل استدعائها
  if (typeof next === 'function') {
    next();
  }
});
// ========== Static Methods ==========

/**
 * إنشاء إشعار لطلب
 */
notificationSchema.statics.createForOrder = async function (order, type, additionalData = {}) {
  const Notification = this;

  let title, content, priority = "medium", icon;

  switch (type) {
    case "order_created":
      title = "تم إنشاء طلب جديد";
      content = `تم إنشاء طلبك #${order._id.toString().slice(-6)} بنجاح.`;
      priority = "high";
      icon = "🛒";
      break;

    case "order_accepted":
      title = "تم قبول طلبك";
      content = `تم قبول طلبك #${order._id.toString().slice(-6)} وجاري تجهيزه.`;
      priority = "high";
      icon = "✅";
      break;

    case "driver_assigned":
      title = "تم تعيين مندوب";
      content = `تم تعيين مندوب لتوصيل طلبك #${order._id.toString().slice(-6)}.`;
      priority = "high";
      icon = "🚗";
      break;

    case "order_picked":
      title = "تم استلام الطلب";
      content = `تم استلام طلبك #${order._id.toString().slice(-6)} من المطعم.`;
      priority = "medium";
      icon = "📦";
      break;

    case "order_delivered":
      title = "تم توصيل الطلب";
      content = `تم توصيل طلبك #${order._id.toString().slice(-6)} بنجاح.`;
      priority = "high";
      icon = "🚚";
      break;

    case "order_cancelled":
      title = "تم إلغاء الطلب";
      content = `تم إلغاء طلبك #${order._id.toString().slice(-6)}.`;
      priority = "urgent";
      icon = "❌";
      break;

    default:
      title = "تحديث على طلبك";
      content = `هناك تحديث على طلبك #${order._id.toString().slice(-6)}.`;
      icon = "🔔";
  }

  const notification = await Notification.create({
    user: order.user,
    type,
    title,
    content,
    priority,
    icon,
    data: {
      orderId: order._id,
      orderNumber: order._id.toString().slice(-6),
      status: order.status,
      totalPrice: order.totalPrice,
      store: order.store?._id || order.store,
      driver: order.driver?._id || order.driver,
      ...additionalData,
    },
    link: `/orders/${order._id}`,
    tags: ["order", type, `order_${order._id}`],
    actions: [
      {
        label: "عرض الطلب",
        url: `/orders/${order._id}`,
        type: "primary"
      }
    ]
  });

  return notification;
};

/**
 * إنشاء إشعار نقاط الولاء
 */
notificationSchema.statics.createLoyaltyNotification = async function (userId, points, reason, type = "earn") {
  const Notification = this;

  let title, content, icon;

  if (type === "earn") {
    title = "🎉 نقاط ولاء جديدة!";
    content = `لقد حصلت على ${points} نقطة ولاء ${reason ? `بسبب ${reason}` : ''}.`;
    icon = "⭐";
  } else {
    title = "🔄 تم استبدال النقاط";
    content = `لقد استبدلت ${points} نقطة ولاء ${reason ? `مقابل ${reason}` : ''}.`;
    icon = "🎁";
  }

  const notification = await Notification.create({
    user: userId,
    type: `loyalty_points_${type}`,
    title,
    content,
    priority: "medium",
    icon,
    data: { points, reason },
    link: "/loyalty",
    tags: ["loyalty", `points_${type}`],
  });

  return notification;
};

/**
 * الحصول على الإشعارات غير المقروءة
 */
notificationSchema.statics.getUnreadCount = async function (userId) {
  return await this.countDocuments({
    user: userId,
    status: "unread",
    expiresAt: { $gt: new Date() },
  });
};

/**
 * تحديد الكل كمقروء
 */
notificationSchema.statics.markAllAsRead = async function (userId) {
  return await this.updateMany(
    {
      user: userId,
      status: "unread",
    },
    {
      status: "read",
      readAt: new Date(),
    }
  );
};

/**
 * تنظيف الإشعارات المنتهية
 */
notificationSchema.statics.cleanupExpired = async function () {
  return await this.deleteMany({
    expiresAt: { $lt: new Date() },
  });
};

// ========== Methods ==========

notificationSchema.methods.markAsRead = async function () {
  this.status = "read";
  this.readAt = new Date();
  return await this.save();
};

notificationSchema.methods.markAsUnread = async function () {
  this.status = "unread";
  this.readAt = null;
  return await this.save();
};

notificationSchema.methods.archive = async function () {
  this.status = "archived";
  return await this.save();
};

notificationSchema.methods.retryDelivery = async function () {
  if (this.delivery.retryCount >= 3) {
    throw new Error("Maximum retry attempts reached");
  }

  this.delivery.retryCount += 1;
  this.delivery.pushSent = false;
  this.delivery.emailSent = false;
  this.delivery.smsSent = false;

  await this.save();
  return this;
};

module.exports = mongoose.model("Notification", notificationSchema);