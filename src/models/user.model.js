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
      index: true,
    },
    
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true, // يسمح بقيم null فريدة
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // لا تعرض عند الاستعلام
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
      enum: ["client", "driver", "admin"],
      default: "client",
      index: true,
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
        type: [Number], // [longitude, latitude]
        default: [2.1098, 13.5126], // Niamey
      },
    },
    
    dateOfBirth: {
      type: Date,
    },
    
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say"],
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
        default: "ar",
        enum: ["ar", "fr", "en"],
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
      isAvailable: { type: Boolean, default: true },
      currentLocation: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: [Number],
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
      ref: "Restaurant",
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

// Indexes
userSchema.index({ location: "2dsphere" });
userSchema.index({ "driverInfo.currentLocation": "2dsphere" });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtuals
userSchema.virtual("age").get(function() {
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

userSchema.virtual("fullProfile").get(function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    image: this.image,
    isVerified: this.isVerified,
    stats: this.stats,
  };
});

// Middleware
userSchema.pre("save", function(next) {
  if (this.isModified("password")) {
    this.passwordChangedAt = Date.now();
  }
  next();
});

// Methods
userSchema.methods.logActivity = function(action, details = {}, req) {
  this.activityLog.push({
    action,
    details,
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.headers["user-agent"],
  });
  
  // حفظ فقط آخر 100 نشاط
  if (this.activityLog.length > 100) {
    this.activityLog = this.activityLog.slice(-100);
  }
  
  this.lastActivity = Date.now();
  return this.save();
};

// في user.model.js - تحديث دالة updateStats
userSchema.methods.updateStats = async function() {
  try {
    const Order = require("./order.model");
    
    const stats = await Order.aggregate([
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
    ]);
    
    if (stats.length > 0) {
      this.stats.totalOrders = stats[0].totalOrders || 0;
      this.stats.completedOrders = stats[0].completedOrders || 0;
      this.stats.cancelledOrders = stats[0].cancelledOrders || 0;
      this.stats.totalSpent = stats[0].totalSpent || 0;
      this.stats.lastOrderDate = stats[0].lastOrderDate || null;
    }
    
    // تحديث متوسط التقييم
    const Review = require("./review.model");
    const reviewStats = await Review.aggregate([
      { $match: { user: this._id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          ratingCount: { $sum: 1 }
        }
      }
    ]);
    
    if (reviewStats.length > 0) {
      this.stats.averageRating = reviewStats[0].averageRating || 0;
      this.stats.ratingCount = reviewStats[0].ratingCount || 0;
    }
    
    await this.save();
    return this;
  } catch (error) {
    console.error("Error updating user stats:", error.message);
    return this;
  }
};
module.exports = mongoose.model("User", userSchema);