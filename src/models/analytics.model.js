// ============================================
// ملف: src/models/analytics.model.js (جديد)
// الوصف: تخزين بيانات التحليلات
// ============================================

const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema(
  {
    // نوع الحدث
    eventType: {
      type: String,
      required: true,
      enum: [
        "page_view",
        "click",
        "search",
        "order_started",
        "order_completed",
        "order_cancelled",
        "user_login",
        "user_register",
        "store_view",
        "item_view",
        "add_to_cart",
        "remove_from_cart",
        "apply_coupon",
        "share",
        "review_written",
        "driver_assigned",
        "payment_attempt",
        "payment_success",
        "payment_failed"
      ],
      index: true,
    },

    // المستخدم (إذا كان مسجلاً)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // جلسة المستخدم
    sessionId: {
      type: String,
      index: true,
    },

    // البيانات المرتبطة
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // المسار
    page: String,
    referrer: String,

    // الجهاز والمتصفح
    device: {
      type: {
        type: String, // mobile, tablet, desktop
        enum: ["mobile", "tablet", "desktop", "unknown"],
      },
      browser: String,
      os: String,
      screenSize: String,
    },

    // الموقع
    location: {
      ip: String,
      country: String,
      city: String,
      latitude: Number,
      longitude: Number,
    },

    // الوقت المستغرق
    duration: Number, // بالمللي ثانية

    // قيمة الحدث (مثل سعر الطلب)
    value: Number,

    // مصدر الزائر
    utm: {
      source: String,
      medium: String,
      campaign: String,
      term: String,
      content: String,
    },

    // ملاحظات إضافية
    tags: [String],
  },
  {
    timestamps: true,
    timeseries: {
      timeField: "createdAt",
      metaField: "eventType",
      granularity: "hours",
    },
  }
);

// ========== Indexes ==========
analyticsSchema.index({ createdAt: -1 });
analyticsSchema.index({ eventType: 1, createdAt: -1 });
analyticsSchema.index({ user: 1, createdAt: -1 });
analyticsSchema.index({ sessionId: 1, createdAt: -1 });

// ========== Static Methods ==========

/**
 * تسجيل حدث
 */
analyticsSchema.statics.track = async function (eventData) {
  const event = new this(eventData);
  await event.save();

  // تحديث إحصائيات الأداء
  global.requestCount = (global.requestCount || 0) + 1;

  return event;
};

/**
 * الحصول على إحصائيات عامة
 */
analyticsSchema.statics.getOverview = async function (startDate, endDate) {
  const match = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  return this.aggregate([
    { $match: match },
    {
      $facet: {
        byEventType: [
          { $group: { _id: "$eventType", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        byDay: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        byDevice: [
          { $group: { _id: "$device.type", count: { $sum: 1 } } }
        ],
        uniqueUsers: [
          { $match: { user: { $ne: null } } },
          { $group: { _id: "$user" } },
          { $count: "count" }
        ],
        totalEvents: [
          { $count: "count" }
        ]
      }
    }
  ]);
};

/**
 * الحصول على إحصائيات المستخدم
 */
analyticsSchema.statics.getUserStats = async function (userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        user: userId,
        createdAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        byEventType: [
          { $group: { _id: "$eventType", count: { $sum: 1 } } }
        ],
        byDay: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        total: [
          { $count: "count" }
        ],
        lastActive: [
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { lastActive: "$createdAt" } }
        ]
      }
    }
  ]);
};

module.exports = mongoose.model("Analytics", analyticsSchema);