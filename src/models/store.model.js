// ============================================
// ملف: src/models/store.model.js (مصحح)
// الوصف: نموذج المتجر (يشمل مطاعم، بقالات، صيدليات...)
// الإصدار: 2.0
// ============================================

const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    // الصور
    logo: {
      type: String,
    },
    
    coverImage: {
      type: String,
    },
    
    // المعلومات الأساسية
    name: {
      type: String,
      required: true,
      trim: true,
      index: true, // ✅ هذا كافٍ، لا نحتاج فهرس منفصل
    },
    
    description: String,
    
    category: {
      type: String,
      required: true,
      enum: [
        "restaurant", "cafe", "bakery", "fast-food", "grocery",
        "supermarket", "pharmacy", "clothing", "electronics",
        "furniture", "books", "sports", "beauty", "flowers",
        "pet-shop", "other"
      ],
      index: true, // ✅ هذا كافٍ
    },
    
    // معلومات الاتصال
    phone: {
      type: String,
      trim: true,
    },
    
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    
    website: String,
    
    // الموقع
    address: {
      street: String,
      city: String,
      state: String,
      country: { type: String, default: "Niger" },
      postalCode: String,
    },
    
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        default: [2.1098, 13.5126],
      },
    },
    
    // حالة المتجر
    isOpen: {
      type: Boolean,
      default: true,
    },
    
    isVerified: {
      type: Boolean,
      default: false,
    },
    
    // المالك
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true, // ✅ هذا كافٍ
    },
    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    // إحصائيات التقييم
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
      of: {
        open: String,
        close: String,
        isOpen: Boolean,
      },
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
    preferredDrivers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
    // الوسوم
    tags: [{
      type: String,
      trim: true,
      // ❌ تم إزالة index من هنا لتجنب التكرار
    }],
    
    // الصور الإضافية
    gallery: [{
      url: String,
      caption: String,
      order: Number,
    }],
    
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
  const currentTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  return currentTime >= hours.open && currentTime <= hours.close;
});

// ========== Indexes (مركزة هنا) ==========
// ✅ جميع الفهارس في مكان واحد لتجنب التكرار
storeSchema.index({ category: 1, averageRating: -1 });
storeSchema.index({ isOpen: 1, isVerified: 1 });
storeSchema.index({ tags: 1 }); // ✅ تم نقل فهرس tags إلى هنا
storeSchema.index({ location: "2dsphere" });
storeSchema.index({ 'stats.totalOrders': -1 });
storeSchema.index({ name: 'text', description: 'text', tags: 'text' });
// storeSchema.index({ owner: 1 }); // ❌ تم إزالة التكرار (موجود في الحقل نفسه)

// ========== Middleware ==========
storeSchema.pre('save', function(next) {
  // تحديث إجمالي المنتجات
  if (this.isModified('products')) {
    // سيتم تحديثه لاحقاً
  }
  next();
});

/**
 * تحديث إحصائيات المتجر بعد كل طلب
 */
storeSchema.methods.updateStats = async function(order) {
  const Order = require("./order.model");
  
  const stats = await Order.aggregate([
    { $match: { store: this._id } },
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

module.exports = mongoose.model("Store", storeSchema);