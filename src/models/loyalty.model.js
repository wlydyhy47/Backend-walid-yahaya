// ============================================
// ملف: src/models/loyalty.model.js (جديد)
// الوصف: نموذج برنامج الولاء والمكافآت
// ============================================

const mongoose = require("mongoose");

const loyaltySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    
    points: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    tier: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum"],
      default: "bronze",
    },
    
    totalEarned: {
      type: Number,
      default: 0,
    },
    
    totalRedeemed: {
      type: Number,
      default: 0,
    },
    
    // سجل المعاملات
    transactions: [{
      type: {
        type: String,
        enum: ["earn", "redeem", "expire"],
        required: true,
      },
      amount: {
        type: Number,
        required: true,
      },
      balance: {
        type: Number,
        required: true,
      },
      reason: String,
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
      rewardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LoyaltyReward",
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      expiresAt: Date,
    }],
    
    // نقاط على وشك الانتهاء
    expiringPoints: [{
      amount: Number,
      expiresAt: Date,
    }],
    
    // المكافآت المحصلة
    claimedRewards: [{
      reward: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LoyaltyReward",
      },
      claimedAt: Date,
      usedAt: Date,
      code: String,
      expiresAt: Date,
    }],
    
    stats: {
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastOrderDate: Date,
      monthlyPoints: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// ========== Indexes ==========
loyaltySchema.index({ points: -1 });
loyaltySchema.index({ tier: 1 });
loyaltySchema.index({ 'transactions.timestamp': -1 });

// ========== Virtuals ==========

loyaltySchema.virtual("nextTier").get(function () {
  const tiers = {
    bronze: { next: "silver", pointsNeeded: 500 },
    silver: { next: "gold", pointsNeeded: 2000 },
    gold: { next: "platinum", pointsNeeded: 5000 },
    platinum: { next: null, pointsNeeded: 0 }
  };
  
  const currentTier = tiers[this.tier];
  if (!currentTier || !currentTier.next) return null;
  
  return {
    name: currentTier.next,
    pointsNeeded: Math.max(0, currentTier.pointsNeeded - this.points)
  };
});

loyaltySchema.virtual("progress").get(function () {
  const tierPoints = {
    bronze: { min: 0, max: 499 },
    silver: { min: 500, max: 1999 },
    gold: { min: 2000, max: 4999 },
    platinum: { min: 5000, max: Infinity }
  };
  
  const range = tierPoints[this.tier];
  if (!range) return 0;
  
  if (this.tier === "platinum") return 100;
  
  const progress = ((this.points - range.min) / (range.max - range.min)) * 100;
  return Math.min(100, Math.max(0, progress));
});

// ========== Methods ==========

/**
 * إضافة نقاط
 */
loyaltySchema.methods.addPoints = async function(amount, reason, orderId = null) {
  this.points += amount;
  this.totalEarned += amount;
  
  // تحديث المستوى
  this.tier = this.calculateTier();
  
  this.transactions.push({
    type: "earn",
    amount,
    balance: this.points,
    reason,
    orderId,
    timestamp: new Date()
  });
  
  await this.save();
  return this;
};

/**
 * استبدال نقاط
 */
loyaltySchema.methods.redeemPoints = async function(amount, rewardId, reason) {
  if (this.points < amount) {
    throw new Error("Insufficient points");
  }
  
  this.points -= amount;
  this.totalRedeemed += amount;
  
  // تحديث المستوى
  this.tier = this.calculateTier();
  
  this.transactions.push({
    type: "redeem",
    amount,
    balance: this.points,
    reason,
    rewardId,
    timestamp: new Date()
  });
  
  await this.save();
  return this;
};

/**
 * حساب المستوى
 */
loyaltySchema.methods.calculateTier = function() {
  if (this.points >= 5000) return "platinum";
  if (this.points >= 2000) return "gold";
  if (this.points >= 500) return "silver";
  return "bronze";
};

/**
 * تحديث إحصائيات المستخدم
 */
loyaltySchema.methods.updateStats = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // حساب النقاط الشهرية
  const monthStart = new Date(today);
  monthStart.setDate(1);
  
  const monthlyPoints = this.transactions
    .filter(t => t.type === "earn" && t.timestamp >= monthStart)
    .reduce((sum, t) => sum + t.amount, 0);
  
  this.stats.monthlyPoints = monthlyPoints;
  
  await this.save();
  return this;
};

module.exports = mongoose.model("Loyalty", loyaltySchema);