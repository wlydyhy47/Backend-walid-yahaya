// ============================================
// ملف: src/models/loyaltyReward.model.js (جديد)
// الوصف: نموذج مكافآت الولاء
// ============================================

const mongoose = require("mongoose");

const loyaltyRewardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    
    description: {
      type: String,
      required: true,
    },
    
    points: {
      type: Number,
      required: true,
      min: 0,
    },
    
    category: {
      type: String,
      enum: ["discount", "delivery", "food", "special"],
      required: true,
    },
    
    image: String,
    
    // قيمة الخصم
    discountValue: {
      type: Number,
      min: 0,
      max: 100,
    },
    
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
    },
    
    // صلاحية المكافأة
    validFrom: {
      type: Date,
      default: Date.now,
    },
    
    validUntil: {
      type: Date,
      required: true,
    },
    
    // عدد مرات الاستخدام
    usageLimit: {
      perUser: { type: Number, default: 1 },
      total: { type: Number, default: null }, // null = غير محدود
    },
    
    // المطاعم المشمولة (فارغ = جميع المطاعم)
    restaurants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    }],
    
    // شروط إضافية
    conditions: {
      minOrderAmount: {
        type: Number,
        default: 0,
      },
      firstOrderOnly: {
        type: Boolean,
        default: false,
      },
      specificDays: [{
        type: Number,
        min: 0,
        max: 6,
      }], // 0-6 (الأحد-السبت)
      specificHours: {
        start: String, // "09:00"
        end: String,   // "17:00"
      },
    },
    
    isActive: {
      type: Boolean,
      default: true,
    },
    
    priority: {
      type: Number,
      default: 0, // أعلى رقم = أولوية أعلى
    },
    
    // إحصائيات الاستخدام
    usageCount: {
      type: Number,
      default: 0,
    },
    
    claimedBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      claimedAt: Date,
      usedAt: Date,
      code: String,
    }],
    
    // للمكافآت الخاصة (مثل عيد الميلاد)
    isSpecial: {
      type: Boolean,
      default: false,
    },
    
    specialCondition: {
      type: String,
      enum: ["birthday", "anniversary", "vip"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ========== Indexes ==========
loyaltyRewardSchema.index({ points: 1 });
loyaltyRewardSchema.index({ category: 1, isActive: 1 });
loyaltyRewardSchema.index({ validUntil: 1 });
loyaltyRewardSchema.index({ priority: -1 });

// ========== Virtuals ==========

/**
 * هل المكافأة صالحة الآن
 */
loyaltyRewardSchema.virtual("isValid").get(function () {
  const now = new Date();
  return this.isActive && 
         now >= this.validFrom && 
         now <= this.validUntil;
});

/**
 * هل المكافأة شاملة لكل المطاعم
 */
loyaltyRewardSchema.virtual("isForAllRestaurants").get(function () {
  return !this.restaurants || this.restaurants.length === 0;
});

/**
* الأيام المتبقية على الصلاحية
*/
loyaltyRewardSchema.virtual("daysRemaining").get(function () {
  const now = new Date();
  const diffTime = this.validUntil - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// ========== Methods ==========

/**
 * التحقق من إمكانية استخدام المكافأة
 */
loyaltyRewardSchema.methods.canBeClaimed = async function(userId, orderAmount = null) {
  // التحقق من الصلاحية
  if (!this.isValid) {
    return { allowed: false, reason: "Reward is not valid" };
  }
  
  // التحقق من شرط أول طلب
  if (this.conditions.firstOrderOnly) {
    const Order = require("./order.model");
    const previousOrders = await Order.countDocuments({ 
      user: userId,
      status: "delivered"
    });
    if (previousOrders > 0) {
      return { allowed: false, reason: "This reward is for first order only" };
    }
  }
  
  // التحقق من الحد الأدنى للطلب
  if (this.conditions.minOrderAmount > 0 && orderAmount < this.conditions.minOrderAmount) {
    return { 
      allowed: false, 
      reason: `Minimum order amount is ${this.conditions.minOrderAmount}` 
    };
  }
  
  // التحقق من الأيام المحددة
  if (this.conditions.specificDays && this.conditions.specificDays.length > 0) {
    const today = new Date().getDay();
    if (!this.conditions.specificDays.includes(today)) {
      return { allowed: false, reason: "This reward is not available today" };
    }
  }
  
  // التحقق من عدد مرات الاستخدام للمستخدم
  if (this.usageLimit.perUser > 0) {
    const userClaims = this.claimedBy.filter(c => c.user.toString() === userId.toString());
    if (userClaims.length >= this.usageLimit.perUser) {
      return { allowed: false, reason: "You have already claimed this reward" };
    }
  }
  
  // التحقق من العدد الإجمالي
  if (this.usageLimit.total && this.usageCount >= this.usageLimit.total) {
    return { allowed: false, reason: "This reward is no longer available" };
  }
  
  return { allowed: true };
};

/**
 * استخدام المكافأة
 */
loyaltyRewardSchema.methods.claim = async function(userId) {
  const check = await this.canBeClaimed(userId);
  if (!check.allowed) {
    throw new Error(check.reason);
  }
  
  // إنشاء كود فريد
  const code = generateRewardCode();
  
  this.claimedBy.push({
    user: userId,
    claimedAt: new Date(),
    code
  });
  
  this.usageCount += 1;
  await this.save();
  
  return {
    rewardId: this._id,
    name: this.name,
    code,
    validUntil: this.validUntil
  };
};

/**
 * التحقق من صحة كود المكافأة
 */
loyaltyRewardSchema.statics.validateCode = async function(code, userId) {
  const claim = await this.findOne({
    "claimedBy.code": code,
    "claimedBy.user": userId,
    "claimedBy.usedAt": null
  });
  
  if (!claim) {
    return { valid: false, reason: "Invalid or already used code" };
  }
  
  const now = new Date();
  if (now > claim.validUntil) {
    return { valid: false, reason: "Code has expired" };
  }
  
  return { 
    valid: true, 
    reward: claim,
    discountValue: claim.discountValue,
    discountType: claim.discountType
  };
};

// ========== دوال مساعدة ==========

/**
 * توليد كود مكافأة فريد
 */
function generateRewardCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = mongoose.model("LoyaltyReward", loyaltyRewardSchema);