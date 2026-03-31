// ============================================
// ملف: src/models/store.model.js (الإصدار النهائي - بدون أي middleware)
// الوصف: نموذج المتجر
// الإصدار: 3.0 - نهائي
// ============================================

const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    // الصور
    logo: { type: String },
    coverImage: { type: String },

    // المعلومات الأساسية
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: String,
    category: {
      type: String,
      required: true,
      index: true,
    },

    // معلومات الاتصال
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    website: String,

    // الموقع
    address: {
      street: String,
      city: String,
      state: String,
      country: { type: String, default: "Niger" },
      postalCode: String,
      latitude: Number,
      longitude: Number,
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [2.1098, 13.5126] },
    },

    // حالة المتجر
    isOpen: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },

    // المالك
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // إحصائيات التقييم
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },

    // معلومات التوصيل
    deliveryInfo: {
      hasDelivery: { type: Boolean, default: true },
      deliveryFee: { type: Number, default: 0, min: 0 },
      minOrderAmount: { type: Number, default: 0, min: 0 },
      estimatedDeliveryTime: { type: Number, default: 30 },
      deliveryRadius: { type: Number, default: 10 },
      freeDeliveryThreshold: { type: Number, default: 0 },
    },

    // ساعات العمل
    openingHours: {
      type: Map,
      of: { open: String, close: String, isOpen: Boolean },
      default: {},
    },

    // إحصائيات المتجر
    stats: {
      totalOrders: { type: Number, default: 0 },
      completedOrders: { type: Number, default: 0 },
      cancelledOrders: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
      lastOrderDate: Date,
      totalProducts: { type: Number, default: 0 },
      totalCustomers: { type: Number, default: 0 },
    },

    // إعدادات المتجر
    settings: {
      autoAcceptOrders: { type: Boolean, default: false },
      preparationTimeBuffer: { type: Number, default: 5 },
      maxOrdersPerHour: { type: Number, default: 50 },
      currency: { type: String, default: "XOF" },
      taxRate: { type: Number, default: 0 },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
    },

    // المندوبين المفضلين
    preferredDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // الوسوم
    tags: [{ type: String, trim: true }],

    // الصور الإضافية
    gallery: [{ url: String, caption: String, order: Number }],

    // المستندات
    documents: [{
      type: { type: String, enum: ["license", "tax", "id", "other"] },
      url: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
    }],

    // تاريخ الحذف
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ========== Virtuals ==========
storeSchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "store",
});

storeSchema.virtual("addresses", {
  ref: "StoreAddress",
  localField: "_id",
  foreignField: "store",
});

storeSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "store",
});

storeSchema.virtual("orders", {
  ref: "Order",
  localField: "_id",
  foreignField: "store",
});

storeSchema.virtual("successRate").get(function () {
  if (this.stats.totalOrders === 0) return 0;
  return ((this.stats.completedOrders / this.stats.totalOrders) * 100).toFixed(1);
});

storeSchema.virtual("isOpenNow").get(function () {
  if (!this.openingHours) return false;

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];
  const hours = this.openingHours.get(today);

  if (!hours || !hours.isOpen) return false;

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  return currentTime >= hours.open && currentTime <= hours.close;
});

// ========== Indexes ==========
storeSchema.index({ category: 1, averageRating: -1 });
storeSchema.index({ isOpen: 1, isVerified: 1 });
storeSchema.index({ tags: 1 });
storeSchema.index({ location: "2dsphere" });
storeSchema.index({ 'stats.totalOrders': -1 });
storeSchema.index({ name: 'text', description: 'text', tags: 'text' });

// ========== ❌ لا يوجد أي middleware (لا pre-save ولا أي شيء) ==========
// تم إزالة جميع middleware لتجنب مشكلة "next is not a function"

// ========== Methods ==========

/**
 * تحديث إحصائيات المتجر بعد كل طلب
 */
storeSchema.methods.updateStats = async function () {
  try {
    const Order = require("./order.model");

    const stats = await Order.aggregate([
      { $match: { store: this._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
          cancelledOrders: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          totalRevenue: { $sum: "$totalPrice" },
          lastOrderDate: { $max: "$createdAt" },
          avgOrderValue: { $avg: "$totalPrice" }
        }
      }
    ]);

    if (stats.length > 0) {
      this.stats = {
        ...this.stats.toObject(),
        ...stats[0]
      };
      await this.save();
    }

    return this;
  } catch (error) {
    console.error('❌ Error updating store stats:', error);
    return this;
  }
};

/**
 * تحديث تقييم المتجر
 */
storeSchema.methods.updateRating = async function () {
  try {
    const Review = require("./review.model");
    
    const stats = await Review.aggregate([
      { $match: { store: this._id } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    
    if (stats.length > 0) {
      this.averageRating = stats[0].avgRating;
      this.ratingsCount = stats[0].count;
    } else {
      this.averageRating = 0;
      this.ratingsCount = 0;
    }
    
    await this.save();
    return this;
  } catch (error) {
    console.error('❌ Error updating store rating:', error);
    return this;
  }
};

/**
 * زيادة عدد المنتجات
 */
storeSchema.methods.incrementProductsCount = async function () {
  this.stats.totalProducts = (this.stats.totalProducts || 0) + 1;
  await this.save();
  return this;
};

/**
 * إنقاص عدد المنتجات
 */
storeSchema.methods.decrementProductsCount = async function () {
  this.stats.totalProducts = Math.max(0, (this.stats.totalProducts || 0) - 1);
  await this.save();
  return this;
};

const Store = mongoose.model("Store", storeSchema);
console.log('✅ Store model loaded (NO middleware version)');
module.exports = Store;