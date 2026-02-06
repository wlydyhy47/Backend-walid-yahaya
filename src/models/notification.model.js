const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // المستخدم المستهدف
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    // نوع الإشعار
    type: {
      type: String,
      required: true,
      enum: [
        "system",           // إشعارات النظام
        "order_created",    // طلب جديد
        "order_accepted",   // تم قبول الطلب
        "order_picked",     // تم استلام الطلب
        "order_delivered",  // تم التوصيل
        "order_cancelled",  // طلب ملغي
        "driver_assigned",  // تم تعيين مندوب
        "driver_arrived",   // المندوب وصل
        "payment_success",  // دفع ناجح
        "payment_failed",   // دفع فاشل
        "review_reminder",  // تذكير بالتقييم
        "promotion",        // عروض ترويجية
        "announcement",     // إعلانات
        "security",         // إشعارات أمنية
        "support",          // ردود الدعم
      ],
      index: true,
    },
    
    // العنوان
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    
    // المحتوى
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    
    // البيانات الإضافية
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // الصورة أو الأيقونة
    icon: {
      type: String,
    },
    
    // الرابط المرتبط
    link: {
      type: String,
      trim: true,
    },
    
    // أولوية الإشعار
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    
    // حالة الإشعار
    status: {
      type: String,
      enum: ["unread", "read", "archived", "deleted"],
      default: "unread",
      index: true,
    },
    
    // وقت الإرسال
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    
    // وقت القراءة
    readAt: {
      type: Date,
    },
    
    // تاريخ انتهاء الصلاحية
    expiresAt: {
      type: Date,
      index: true,
    },
    
    // الإعدادات
    settings: {
      push: { type: Boolean, default: true },       // إرسال push notification
      email: { type: Boolean, default: false },     // إرسال email
      sms: { type: Boolean, default: false },       // إرسال SMS
      inApp: { type: Boolean, default: true },      // عرض في التطبيق
    },
    
    // تفاصيل الإرسال
    delivery: {
      pushSent: { type: Boolean, default: false },
      emailSent: { type: Boolean, default: false },
      smsSent: { type: Boolean, default: false },
      pushError: String,
      emailError: String,
      smsError: String,
      retryCount: { type: Number, default: 0 },
    },
    
    // تتبع الحملة
    campaignId: {
      type: String,
      index: true,
    },
    
    // المجموعة
    group: {
      type: String,
      index: true,
    },
    
    // الوسوم
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

// Indexes
notificationSchema.index({ user: 1, status: 1, sentAt: -1 });
notificationSchema.index({ type: 1, sentAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // لحذف المنتهية تلقائياً

// Middleware
notificationSchema.pre("save", function(next) {
  if (this.isModified("status") && this.status === "read" && !this.readAt) {
    this.readAt = new Date();
  }
  
  // تعيين تاريخ انتهاء الصلاحية إذا لم يكن موجوداً
  if (!this.expiresAt) {
    const expiryDays = {
      urgent: 7,     // 7 أيام للإشعارات العاجلة
      high: 14,      // 14 يوم للإشعارات المهمة
      medium: 30,    // 30 يوم للإشعارات العادية
      low: 60,       // 60 يوم للإشعارات المنخفضة
    };
    
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + (expiryDays[this.priority] || 30));
  }
  
  next();
});

// Virtuals
notificationSchema.virtual("isExpired").get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

notificationSchema.virtual("timeAgo").get(function() {
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

// Static Methods
notificationSchema.statics.createForOrder = async function(order, type, additionalData = {}) {
  const Notification = this;
  
  let title, content, priority = "medium";
  
  switch (type) {
    case "order_created":
      title = "تم إنشاء طلب جديد";
      content = `تم إنشاء طلبك #${order._id.toString().slice(-6)} بنجاح.`;
      priority = "high";
      break;
      
    case "order_accepted":
      title = "تم قبول طلبك";
      content = `تم قبول طلبك #${order._id.toString().slice(-6)} وجاري تجهيزه.`;
      priority = "high";
      break;
      
    case "driver_assigned":
      title = "تم تعيين مندوب";
      content = `تم تعيين مندوب لتوصيل طلبك #${order._id.toString().slice(-6)}.`;
      priority = "high";
      break;
      
    case "order_picked":
      title = "تم استلام الطلب";
      content = `تم استلام طلبك #${order._id.toString().slice(-6)} من المطعم.`;
      priority = "medium";
      break;
      
    case "order_delivered":
      title = "تم توصيل الطلب";
      content = `تم توصيل طلبك #${order._id.toString().slice(-6)} بنجاح.`;
      priority = "high";
      break;
      
    case "order_cancelled":
      title = "تم إلغاء الطلب";
      content = `تم إلغاء طلبك #${order._id.toString().slice(-6)}.`;
      priority = "urgent";
      break;
      
    default:
      title = "تحديث على طلبك";
      content = `هناك تحديث على طلبك #${order._id.toString().slice(-6)}.`;
  }
  
  const notification = await Notification.create({
    user: order.user,
    type,
    title,
    content,
    priority,
    data: {
      orderId: order._id,
      orderNumber: order._id.toString().slice(-6),
      status: order.status,
      totalPrice: order.totalPrice,
      restaurant: order.restaurant?._id || order.restaurant,
      driver: order.driver?._id || order.driver,
      ...additionalData,
    },
    link: `/orders/${order._id}`,
    icon: this.getIconByType(type),
    tags: ["order", type, `order_${order._id}`],
  });
  
  return notification;
};

notificationSchema.statics.createForUser = async function(userId, type, data = {}) {
  const Notification = this;
  
  const templates = {
    welcome: {
      title: "مرحباً بك!",
      content: "شكراً لانضمامك إلينا. نتمنى لك تجربة ممتعة.",
      priority: "medium",
    },
    password_changed: {
      title: "تم تغيير كلمة المرور",
      content: "تم تغيير كلمة مرور حسابك بنجاح.",
      priority: "high",
    },
    profile_updated: {
      title: "تم تحديث الملف الشخصي",
      content: "تم تحديث معلومات ملفك الشخصي بنجاح.",
      priority: "low",
    },
    new_message: {
      title: "رسالة جديدة",
      content: data.message || "لديك رسالة جديدة.",
      priority: "medium",
    },
    review_reminder: {
      title: "كيف كانت تجربتك؟",
      content: "شاركنا تجربتك مع المطعم لتساعد الآخرين.",
      priority: "low",
    },
  };
  
  const template = templates[type] || {
    title: "إشعار جديد",
    content: data.content || "لديك إشعار جديد.",
    priority: "medium",
  };
  
  const notification = await Notification.create({
    user: userId,
    type: "system",
    title: template.title,
    content: template.content,
    priority: template.priority,
    data,
    icon: this.getIconByType(type),
    tags: ["user", type, `user_${userId}`],
  });
  
  return notification;
};

notificationSchema.statics.createPromotional = async function(userId, data) {
  const Notification = this;
  
  const notification = await Notification.create({
    user: userId,
    type: "promotion",
    title: data.title || "عرض خاص!",
    content: data.content || "استمتع بعروضنا الخاصة والمميزة.",
    priority: data.priority || "medium",
    data: {
      promotionId: data.promotionId,
      discount: data.discount,
      validUntil: data.validUntil,
      ...data,
    },
    link: data.link,
    icon: data.icon || "🎁",
    campaignId: data.campaignId,
    group: data.group,
    tags: ["promotion", "marketing", ...(data.tags || [])],
  });
  
  return notification;
};

notificationSchema.statics.getIconByType = function(type) {
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
    new_message: "💬",
  };
  
  return icons[type] || "🔔";
};

notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    user: userId,
    status: "unread",
    expiresAt: { $gt: new Date() },
  });
};

notificationSchema.statics.markAllAsRead = async function(userId) {
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

notificationSchema.statics.cleanupExpired = async function() {
  return await this.deleteMany({
    expiresAt: { $lt: new Date() },
  });
};

// Instance Methods
notificationSchema.methods.markAsRead = async function() {
  this.status = "read";
  this.readAt = new Date();
  return await this.save();
};

notificationSchema.methods.markAsUnread = async function() {
  this.status = "unread";
  this.readAt = null;
  return await this.save();
};

notificationSchema.methods.archive = async function() {
  this.status = "archived";
  return await this.save();
};

notificationSchema.methods.retryDelivery = async function() {
  if (this.delivery.retryCount >= 3) {
    throw new Error("Maximum retry attempts reached");
  }
  
  this.delivery.retryCount += 1;
  this.delivery.pushSent = false;
  this.delivery.emailSent = false;
  this.delivery.smsSent = false;
  
  await this.save();
  
  // TODO: إعادة محاولة الإرسال
  return this;
};

module.exports = mongoose.model("Notification", notificationSchema);