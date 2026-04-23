// ============================================
// ملف: src/models/user.model.js (مصحح)
// الوصف: نموذج المستخدم مع دعم Loyalty Points
// الإصدار: 4.0
// ============================================

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // المعلومات الأساسية
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    image: {
      type: String,
      default: null,
    },

    coverImage: {
      type: String,
      default: null,
    },

    // الأدوار والصلاحيات
    role: {
      type: String,
      enum: ["client", "driver", "admin", "vendor"],
      default: "client",
    },

    // حالة الحساب
    isActive: {
      type: Boolean,
      default: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    lastSeen: {
      type: Date,
      default: Date.now,
    },

    // معلومات إضافية
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
      default: "Niamey",
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [2.1098, 13.5126],
      },
    },

    dateOfBirth: {
      type: Date,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say"],
    },

    // نقاط الولاء
    loyaltyPoints: {
      type: Number,
      default: 0,
      min: 0,
    },

    loyaltyTransactions: [{
      type: {
        type: String,
        enum: ['earn', 'redeem'],
        required: true
      },
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      reason: String,
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
      },
      rewardId: String,
      balance: {
        type: Number,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],

    // محاولات تسجيل الدخول الفاشلة
    loginAttempts: {
      type: Number,
      default: 0,
      select: false
    },

    lockUntil: {
      type: Date,
      select: false
    },

    // إعدادات المستخدم
    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        orderUpdates: { type: Boolean, default: true },
        promotions: { type: Boolean, default: true },
      },
      language: {
        type: String,
        default: "fr",
        enum: ["ar", "fr", "en", "ha"],
      },
      currency: {
        type: String,
        default: "XOF",
        enum: ["XOF", "EUR", "USD"],
      },
      theme: {
        type: String,
        default: "light",
        enum: ["light", "dark"],
      },
    },

    // الإحصائيات
    stats: {
      totalOrders: { type: Number, default: 0 },
      completedOrders: { type: Number, default: 0 },
      cancelledOrders: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      averageRating: { type: Number, default: 0 },
      ratingCount: { type: Number, default: 0 },
      lastOrderDate: { type: Date },
      joinedDate: { type: Date, default: Date.now },
    },

    // للمندوبين فقط
    driverInfo: {
      licenseNumber: String,
      vehicleType: {
        type: String,
        enum: ["motorcycle", "car", "bicycle", "scooter"],
      },
      vehiclePlate: String,
      isAvailable: { type: Boolean, default: false },
      currentLocation: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point"
        },
        coordinates: {
          type: [Number],
          default: [2.1098, 13.5126]
        }
      },
      rating: { type: Number, default: 0 },
      totalDeliveries: { type: Number, default: 0 },
      earnings: { type: Number, default: 0 },
      documents: [{
        type: { type: String, enum: ["license", "insurance", "registration"] },
        url: String,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
      }],
      // ✅ حقول جديدة لتاريخ الحالة
      statusHistory: [{
        oldStatus: Boolean,
        newStatus: Boolean,
        changedAt: { type: Date, default: Date.now },
        reason: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }],
      lastAvailableChange: { type: Date, default: null },

      // ✅ إعدادات القطع التلقائي (اختياري)
      autoOffline: {
        enabled: { type: Boolean, default: true },
        afterMinutes: { type: Number, default: 30 }
      }
    },

    // ✅ لصاحب المتجر (التاجر) - يبقى storeVendorInfo كما هو
    storeVendorInfo: {
      store: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Store",
        default: null,
      },
      subscription: {
        plan: {
          type: String,
          enum: ["free", "basic", "premium", "enterprise"],
          default: "free",
        },
        expiresAt: Date,
        isActive: { type: Boolean, default: true },
      },
      notificationSettings: {
        newOrders: { type: Boolean, default: true },
        orderUpdates: { type: Boolean, default: true },
        lowStock: { type: Boolean, default: true },
        dailyReport: { type: Boolean, default: true },
        sound: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
      },
      workingHours: {
        monday: { open: String, close: String, isOpen: Boolean },
        tuesday: { open: String, close: String, isOpen: Boolean },
        wednesday: { open: String, close: String, isOpen: Boolean },
        thursday: { open: String, close: String, isOpen: Boolean },
        friday: { open: String, close: String, isOpen: Boolean },
        saturday: { open: String, close: String, isOpen: Boolean },
        sunday: { open: String, close: String, isOpen: Boolean },
      },
      stats: {
        totalOrders: { type: Number, default: 0 },
        totalRevenue: { type: Number, default: 0 },
        averageOrderValue: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
        totalCustomers: { type: Number, default: 0 },
        cancellationRate: { type: Number, default: 0 },
      },
      isStoreOpen: { type: Boolean, default: true },
      staff: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: { type: String, enum: ["manager", "chef", "cashier"] },
        permissions: [String],
        addedAt: { type: Date, default: Date.now },
      }],
    },

    // تواريخ مهمة
    lastLogin: Date,
    lastActivity: Date,
    passwordChangedAt: Date,
    verificationCode: String,
    verificationCodeExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // الحسابات الاجتماعية
    socialAccounts: {
      googleId: String,
      facebookId: String,
      appleId: String,
    },

    // المفضلات
    favorites: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
    }],

    // سجل النشاطات
    activityLog: [{
      action: String,
      details: mongoose.Schema.Types.Mixed,
      timestamp: { type: Date, default: Date.now },
      ipAddress: String,
      userAgent: String,
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ========== Indexes ==========
userSchema.index({ location: "2dsphere" });
userSchema.index({ "driverInfo.currentLocation": "2dsphere" });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ loyaltyPoints: -1 });

// ========== Virtuals ==========
userSchema.virtual("age").get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

userSchema.virtual("loyaltyTier").get(function () {
  const points = this.loyaltyPoints || 0;
  if (points >= 5000) return 'platinum';
  if (points >= 2000) return 'gold';
  if (points >= 500) return 'silver';
  return 'bronze';
});

userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

// ========== Middleware ==========
userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.passwordChangedAt = Date.now();
  }
});

// ========== Methods ==========

/**
 * تسجيل النشاط
 */
userSchema.methods.logActivity = async function (action, details = {}) {
  try {
    await this.model('User').updateOne(
      { _id: this._id },
      {
        $push: {
          activityLog: {
            $each: [{
              action,
              details,
              ipAddress: details.ip || '',
              userAgent: details.userAgent || '',
              timestamp: new Date()
            }],
            $slice: -100
          }
        },
        $set: { lastActivity: new Date() }
      }
    );
    this.lastActivity = new Date();
    return this;
  } catch (error) {
    console.error('❌ Error logging activity:', error.message);
    return this;
  }
};

/**
 * إضافة نقاط ولاء
 */
userSchema.methods.addLoyaltyPoints = async function (amount, reason, orderId = null) {
  try {
    this.loyaltyPoints = (this.loyaltyPoints || 0) + amount;

    if (!this.loyaltyTransactions) {
      this.loyaltyTransactions = [];
    }

    this.loyaltyTransactions.push({
      type: 'earn',
      amount,
      reason,
      orderId,
      balance: this.loyaltyPoints,
      timestamp: new Date()
    });

    await this.save();
    return this.loyaltyPoints;
  } catch (error) {
    console.error('❌ Error adding loyalty points:', error);
    throw error;
  }
};

/**
 * استبدال نقاط ولاء
 */
userSchema.methods.redeemLoyaltyPoints = async function (amount, reason, rewardId = null) {
  try {
    if ((this.loyaltyPoints || 0) < amount) {
      throw new Error('Insufficient points');
    }

    this.loyaltyPoints -= amount;

    if (!this.loyaltyTransactions) {
      this.loyaltyTransactions = [];
    }

    this.loyaltyTransactions.push({
      type: 'redeem',
      amount,
      reason,
      rewardId,
      balance: this.loyaltyPoints,
      timestamp: new Date()
    });

    await this.save();
    return this.loyaltyPoints;
  } catch (error) {
    console.error('❌ Error redeeming loyalty points:', error);
    throw error;
  }
};

/**
 * تسجيل محاولة دخول فاشلة
 */
userSchema.methods.incLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < new Date()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + 2 * 60 * 60 * 1000) };
  }

  return this.updateOne(updates);
};

/**
 * إعادة تعيين محاولات الدخول
 */
userSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

/**
 * تحديث الإحصائيات
 */
userSchema.methods.updateStats = async function () {
  try {
    const Order = require("./order.model");
    const Review = require("./review.model");

    const [orderStats, reviewStats] = await Promise.all([
      Order.aggregate([
        { $match: { user: this._id } },
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
            totalSpent: { $sum: "$totalPrice" },
            lastOrderDate: { $max: "$createdAt" },
          },
        },
      ]),
      Review.aggregate([
        { $match: { user: this._id } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            ratingCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const updateData = {
      'stats.lastOrderDate': orderStats[0]?.lastOrderDate || null
    };

    if (orderStats.length > 0) {
      updateData['stats.totalOrders'] = orderStats[0].totalOrders || 0;
      updateData['stats.completedOrders'] = orderStats[0].completedOrders || 0;
      updateData['stats.cancelledOrders'] = orderStats[0].cancelledOrders || 0;
      updateData['stats.totalSpent'] = orderStats[0].totalSpent || 0;
    }

    if (reviewStats.length > 0) {
      updateData['stats.averageRating'] = reviewStats[0].averageRating || 0;
      updateData['stats.ratingCount'] = reviewStats[0].ratingCount || 0;
    }

    await mongoose.model('User').findByIdAndUpdate(
      this._id,
      { $set: updateData },
      { runValidators: false }
    );

    return this;
  } catch (error) {
    console.error("❌ Error updating user stats:", error.message);
    return this;
  }
};

module.exports = mongoose.model("User", userSchema);