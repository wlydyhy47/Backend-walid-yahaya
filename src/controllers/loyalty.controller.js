// ============================================
// ملف: src/controllers/loyalty.controller.js
// الوصف: إدارة نظام الولاء والنقاط
// الإصدار: 1.0 (جديد)
// ============================================

const { User, Order } = require('../models');
const cache = require("../utils/cache.util");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * حساب مستوى المستخدم بناءً على النقاط
 */
const calculateTier = (points) => {
  if (points >= 5000) return { name: 'platinum', multiplier: 2.0, color: '#E5E4E2' };
  if (points >= 2000) return { name: 'gold', multiplier: 1.5, color: '#FFD700' };
  if (points >= 500) return { name: 'silver', multiplier: 1.2, color: '#C0C0C0' };
  return { name: 'bronze', multiplier: 1.0, color: '#CD7F32' };
};

/**
 * حساب النقاط المستحقة للطلب
 */
const calculatePoints = (orderTotal, tier) => {
  const basePoints = Math.floor(orderTotal); // نقطة واحدة لكل وحدة عملة
  return Math.floor(basePoints * tier.multiplier);
};

/**
 * إبطال كاش الولاء
 */
const invalidateLoyaltyCache = (userId) => {
  cache.del(`loyalty:${userId}`);
  cache.del(`loyalty:transactions:${userId}`);
  cache.del(`loyalty:stats:${userId}`);
  cache.del(`user:complete:${userId}`);
};

// ========== 2. دوال النقاط ==========

/**
 * @desc    الحصول على نقاط المستخدم
 * @route   GET /api/loyalty/points
 * @access  Authenticated
 */
exports.getPoints = async (req, res) => {
  try {
    const userId = req.user.id;

    const cacheKey = `loyalty:${userId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const user = await User.findById(userId)
      .select('loyaltyPoints name email')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const points = user.loyaltyPoints || 0;
    const tier = calculateTier(points);
    
    // حساب النقاط التي ستنتهي قريباً
    const expiringPoints = 0; // TODO: implement expiry logic

    // حساب النقاط اللازمة للمستوى التالي
    const nextTier = {
      bronze: { next: 500, needed: 500 - points, name: 'silver' },
      silver: { next: 2000, needed: 2000 - points, name: 'gold' },
      gold: { next: 5000, needed: 5000 - points, name: 'platinum' },
      platinum: { next: null, needed: 0, name: 'platinum' }
    }[tier.name];

    const responseData = {
      current: points,
      tier: {
        ...tier,
        nextTier: nextTier.next ? {
          name: nextTier.name,
          pointsNeeded: nextTier.needed,
          progress: Math.min(100, Math.floor((points / nextTier.next) * 100))
        } : null
      },
      expiringPoints,
      history: {
        earned: await getTotalEarned(userId),
        redeemed: await getTotalRedeemed(userId)
      }
    };

    cache.set(cacheKey, responseData, 300); // 5 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get points error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get loyalty points"
    });
  }
};

/**
 * @desc    إضافة نقاط للمستخدم
 * @route   POST /api/loyalty/points/add
 * @access  Admin / System
 */
exports.addPoints = async (req, res) => {
  try {
    const { userId, amount, reason, orderId } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "User ID and positive amount are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // إضافة النقاط
    user.loyaltyPoints = (user.loyaltyPoints || 0) + amount;
    
    // تسجيل المعاملة
    if (!user.loyaltyTransactions) {
      user.loyaltyTransactions = [];
    }
    
    user.loyaltyTransactions.push({
      type: 'earn',
      amount,
      reason: reason || 'Order completion',
      orderId,
      balance: user.loyaltyPoints,
      timestamp: new Date()
    });

    await user.save();

    // إبطال الكاش
    invalidateLoyaltyCache(userId);

    res.json({
      success: true,
      message: `Added ${amount} points to user`,
      data: {
        userId,
        newBalance: user.loyaltyPoints,
        transaction: user.loyaltyTransactions[user.loyaltyTransactions.length - 1]
      }
    });
  } catch (error) {
    console.error("❌ Add points error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add points"
    });
  }
};

/**
 * @desc    استبدال النقاط
 * @route   POST /api/loyalty/points/redeem
 * @access  Authenticated
 */
exports.redeemPoints = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, rewardId, orderId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const currentPoints = user.loyaltyPoints || 0;
    
    if (currentPoints < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient points. You have ${currentPoints} points`
      });
    }

    // خصم النقاط
    user.loyaltyPoints = currentPoints - amount;
    
    // تسجيل المعاملة
    if (!user.loyaltyTransactions) {
      user.loyaltyTransactions = [];
    }
    
    user.loyaltyTransactions.push({
      type: 'redeem',
      amount,
      reason: `Redeemed for reward ${rewardId || 'unknown'}`,
      orderId,
      rewardId,
      balance: user.loyaltyPoints,
      timestamp: new Date()
    });

    await user.save();

    // إبطال الكاش
    invalidateLoyaltyCache(userId);

    res.json({
      success: true,
      message: `Redeemed ${amount} points successfully`,
      data: {
        newBalance: user.loyaltyPoints,
        transaction: user.loyaltyTransactions[user.loyaltyTransactions.length - 1]
      }
    });
  } catch (error) {
    console.error("❌ Redeem points error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to redeem points"
    });
  }
};

// ========== 3. دوال المكافآت ==========

/**
 * @desc    الحصول على المكافآت المتاحة
 * @route   GET /api/loyalty/rewards
 * @access  Authenticated
 */
exports.getRewards = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('loyaltyPoints');
    const points = user?.loyaltyPoints || 0;

    // قائمة المكافآت (يمكن جلبها من قاعدة بيانات لاحقاً)
    const rewards = [
      {
        id: 'discount_10',
        name: 'خصم 10%',
        description: 'خصم 10% على طلبك القادم',
        points: 100,
        category: 'discount',
        image: '/rewards/discount-10.jpg',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'discount_20',
        name: 'خصم 20%',
        description: 'خصم 20% على طلبك القادم',
        points: 200,
        category: 'discount',
        image: '/rewards/discount-20.jpg',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'free_delivery',
        name: 'توصيل مجاني',
        description: 'توصيل مجاني لطلب واحد',
        points: 50,
        category: 'delivery',
        image: '/rewards/free-delivery.jpg',
        validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'free_drink',
        name: 'مشروب مجاني',
        description: 'احصل على مشروب مجاني مع أي وجبة',
        points: 75,
        category: 'food',
        image: '/rewards/free-drink.jpg',
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'free_dessert',
        name: 'حلى مجاني',
        description: 'قطعة حلى مجانية مع الطلب',
        points: 80,
        category: 'food',
        image: '/rewards/free-dessert.jpg',
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'birthday_special',
        name: 'عرض عيد الميلاد',
        description: 'احصل على مفاجأة في عيد ميلادك',
        points: 0,
        category: 'special',
        image: '/rewards/birthday.jpg',
        special: true
      }
    ];

    // تصنيف المكافآت حسب إمكانية الحصول عليها
    const available = rewards.filter(r => r.points <= points && !r.special);
    const upcoming = rewards.filter(r => r.points > points && !r.special);
    const special = rewards.filter(r => r.special);

    res.json({
      success: true,
      data: {
        available,
        upcoming,
        special,
        userPoints: points
      }
    });
  } catch (error) {
    console.error("❌ Get rewards error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get rewards"
    });
  }
};

// ========== 4. دوال المعاملات ==========

/**
 * @desc    الحصول على سجل المعاملات
 * @route   GET /api/loyalty/transactions
 * @access  Authenticated
 */
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;

    const cacheKey = `loyalty:transactions:${userId}:${page}:${limit}:${type}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const user = await User.findById(userId)
      .select('loyaltyTransactions')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let transactions = user.loyaltyTransactions || [];

    // فلترة حسب النوع
    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    // ترتيب تنازلي
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paginatedTransactions = transactions.slice(start, start + parseInt(limit));

    // إحصائيات
    const stats = {
      totalEarned: transactions
        .filter(t => t.type === 'earn')
        .reduce((sum, t) => sum + t.amount, 0),
      totalRedeemed: transactions
        .filter(t => t.type === 'redeem')
        .reduce((sum, t) => sum + t.amount, 0),
      count: transactions.length
    };

    const responseData = {
      transactions: paginatedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: transactions.length,
        pages: Math.ceil(transactions.length / parseInt(limit))
      },
      stats
    };

    cache.set(cacheKey, responseData, 300); // 5 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get transactions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get transactions"
    });
  }
};

// ========== 5. دوال إحصائية ==========

/**
 * @desc    إحصائيات الولاء
 * @route   GET /api/loyalty/stats
 * @access  Authenticated
 */
exports.getStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const cacheKey = `loyalty:stats:${userId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const user = await User.findById(userId)
      .select('loyaltyPoints loyaltyTransactions createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const transactions = user.loyaltyTransactions || [];
    const points = user.loyaltyPoints || 0;
    const tier = calculateTier(points);

    // إحصائيات حسب الشهر
    const monthlyStats = transactions.reduce((acc, t) => {
      const month = new Date(t.timestamp).toLocaleString('default', { month: 'short' });
      if (!acc[month]) {
        acc[month] = { earn: 0, redeem: 0 };
      }
      acc[month][t.type] += t.amount;
      return acc;
    }, {});

    // آخر نشاط
    const lastActivity = transactions.length > 0 
      ? transactions[transactions.length - 1].timestamp 
      : null;

    const responseData = {
      currentPoints: points,
      tier: tier.name,
      multiplier: tier.multiplier,
      memberSince: user.createdAt,
      lastActivity,
      totalTransactions: transactions.length,
      monthly: monthlyStats,
      nextTier: {
        name: tier.name === 'platinum' ? null : 
              tier.name === 'gold' ? 'platinum' :
              tier.name === 'silver' ? 'gold' : 'silver',
        pointsNeeded: tier.name === 'platinum' ? 0 :
                      tier.name === 'gold' ? 5000 - points :
                      tier.name === 'silver' ? 2000 - points : 500 - points
      }
    };

    cache.set(cacheKey, responseData, 600); // 10 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get loyalty stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get loyalty statistics"
    });
  }
};

// ========== 6. دوال مساعدة داخلية ==========

/**
 * الحصول على إجمالي النقاط المكتسبة
 */
async function getTotalEarned(userId) {
  const user = await User.findById(userId).select('loyaltyTransactions');
  if (!user || !user.loyaltyTransactions) return 0;
  
  return user.loyaltyTransactions
    .filter(t => t.type === 'earn')
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * الحصول على إجمالي النقاط المستبدلة
 */
async function getTotalRedeemed(userId) {
  const user = await User.findById(userId).select('loyaltyTransactions');
  if (!user || !user.loyaltyTransactions) return 0;
  
  return user.loyaltyTransactions
    .filter(t => t.type === 'redeem')
    .reduce((sum, t) => sum + t.amount, 0);
}

module.exports = exports;