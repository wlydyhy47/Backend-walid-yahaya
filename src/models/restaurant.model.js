// ============================================
// ملف: src/models/restaurant.model.js (محدث)
// الوصف: نموذج المطعم مع إحصائيات محسنة
// ============================================

const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    image: {
      type: String,
    },
    
    coverImage: {
      type: String,
    },
    
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    
    description: String,
    
    isOpen: {
      type: Boolean,
      default: true,
    },
    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    
    ratingsCount: {
      type: Number,
      default: 0,
    },
    
    type: {
      type: String,
      default: "restaurant",
      enum: ["restaurant", "cafe", "bakery", "fast-food", "grocery", "pharmacy", "other"],
    },
    
    phone: {
      type: String,
      trim: true,
    },
    
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    
    openingHours: {
      type: Map,
      of: String,
      default: {},
    },
    
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    estimatedDeliveryTime: {
      type: Number,
      default: 30,
      min: 5,
    },
    
    // ========== 🔥 إضافات جديدة ==========
    
    /**
     * متوسط وقت التحضير
     */
    averagePreparationTime: {
      type: Number,
      default: 15,
      min: 0,
    },
    
    /**
     * إحصائيات المطعم
     */
    stats: {
      totalOrders: { type: Number, default: 0 },
      completedOrders: { type: Number, default: 0 },
      cancelledOrders: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
      lastOrderDate: Date,
    },
    
    /**
     * معلومات المالك
     */
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    /**
     * قائمة المندوبين المفضلين
     */
    preferredDrivers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
    /**
     * إعدادات المطعم
     */
    settings: {
      autoAcceptOrders: { type: Boolean, default: false },
      preparationTimeBuffer: { type: Number, default: 5 },
      maxOrdersPerHour: { type: Number, default: 50 },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
    },
    
    // ========== نهاية الإضافات ==========
    
    tags: [{
      type: String,
      trim: true,
      index: true,
    }],
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ========== Virtuals ==========
restaurantSchema.virtual("items", {
  ref: "Item",
  localField: "_id",
  foreignField: "restaurant",
});

restaurantSchema.virtual("addresses", {
  ref: "RestaurantAddress",
  localField: "_id",
  foreignField: "restaurant",
});

restaurantSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "restaurant",
});

/**
 * معدل نجاح الطلبات
 */
restaurantSchema.virtual("successRate").get(function () {
  if (this.stats.totalOrders === 0) return 0;
  return ((this.stats.completedOrders / this.stats.totalOrders) * 100).toFixed(1);
});

/**
 * هل المطعم مفتوح الآن
 */
restaurantSchema.virtual("isOpenNow").get(function () {
  if (!this.openingHours) return false;
  
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];
  const hours = this.openingHours.get(today);
  
  if (!hours) return false;
  
  // TODO: تحقق من الوقت الحالي مع ساعات العمل
  return true;
});

// ========== Indexes ==========
restaurantSchema.index({ type: 1, averageRating: -1 });
restaurantSchema.index({ isOpen: 1, tags: 1 });
restaurantSchema.index({ 'stats.totalOrders': -1 });
restaurantSchema.index({ name: 'text', description: 'text', tags: 'text' });

// ========== Middleware ==========

/**
 * تحديث إحصائيات المطعم بعد كل طلب
 */
restaurantSchema.methods.updateStats = async function(order) {
  const Order = require("./order.model");
  
  const stats = await Order.aggregate([
    { $match: { restaurant: this._id } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        completedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
        },
        cancelledOrders: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
        },
        totalRevenue: { $sum: "$totalPrice" },
        lastOrderDate: { $max: "$createdAt" },
        avgOrderValue: { $avg: "$totalPrice" }
      }
    }
  ]);

  if (stats.length > 0) {
    this.stats = {
      ...this.stats,
      ...stats[0]
    };
    await this.save();
  }
  
  return this;
};

module.exports = mongoose.model("Restaurant", restaurantSchema);