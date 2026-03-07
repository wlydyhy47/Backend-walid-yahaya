// src/routes/loyalty.routes.js
const express = require('express');
const router = express.Router();

// ========== مسارات الولاء المؤقتة ==========

/**
 * @route GET /api/loyalty/points
 * @desc الحصول على نقاط المستخدم
 */
router.get('/points', (req, res) => {
  res.json({
    success: true,
    data: {
      points: 1250,
      tier: 'silver',
      multiplier: 1.2
    }
  });
});

/**
 * @route GET /api/loyalty/rewards
 * @desc الحصول على المكافآت المتاحة
 */
router.get('/rewards', (req, res) => {
  res.json({
    success: true,
    data: {
      rewards: [
        {
          id: 1,
          name: 'خصم 10%',
          description: 'خصم 10% على طلبك القادم',
          points: 500,
          image: '/rewards/discount.jpg',
          category: 'discount'
        },
        {
          id: 2,
          name: 'توصيل مجاني',
          description: 'توصيل مجاني لطلب واحد',
          points: 300,
          image: '/rewards/free-delivery.jpg',
          category: 'delivery'
        },
        {
          id: 3,
          name: 'مشروب مجاني',
          description: 'احصل على مشروب مجاني مع أي وجبة',
          points: 200,
          image: '/rewards/drink.jpg',
          category: 'food'
        }
      ]
    }
  });
});

/**
 * @route GET /api/loyalty/transactions
 * @desc الحصول على سجل المعاملات
 */
router.get('/transactions', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  
  const transactions = [
    {
      id: 'tx_1',
      type: 'earn',
      amount: 100,
      reason: 'طلب #ORD-2024-001',
      timestamp: new Date().toISOString()
    },
    {
      id: 'tx_2',
      type: 'earn',
      amount: 50,
      reason: 'تقييم مطعم',
      timestamp: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'tx_3',
      type: 'redeem',
      amount: 300,
      reason: 'توصيل مجاني',
      timestamp: new Date(Date.now() - 172800000).toISOString()
    }
  ];

  res.json({
    success: true,
    data: {
      transactions,
      total: transactions.length,
      page: parseInt(page),
      totalPages: 1
    }
  });
});

/**
 * @route POST /api/loyalty/points/add
 * @desc إضافة نقاط للمستخدم
 */
router.post('/points/add', (req, res) => {
  const { amount, reason } = req.body;
  
  res.json({
    success: true,
    data: {
      message: 'تم إضافة النقاط بنجاح',
      added: amount,
      newBalance: 1250 + amount,
      transaction: {
        id: `tx_${Date.now()}`,
        type: 'earn',
        amount,
        reason,
        timestamp: new Date().toISOString()
      }
    }
  });
});

/**
 * @route POST /api/loyalty/points/redeem
 * @desc استبدال نقاط
 */
router.post('/points/redeem', (req, res) => {
  const { amount, rewardId } = req.body;
  
  res.json({
    success: true,
    data: {
      message: 'تم استبدال النقاط بنجاح',
      redeemed: amount,
      newBalance: 1250 - amount,
      transaction: {
        id: `tx_${Date.now()}`,
        type: 'redeem',
        amount,
        rewardId,
        timestamp: new Date().toISOString()
      }
    }
  });
});

/**
 * @route GET /api/loyalty/stats
 * @desc إحصائيات الولاء
 */
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalEarned: 1500,
      totalRedeemed: 250,
      currentBalance: 1250,
      tier: 'silver',
      nextTier: 'gold',
      pointsToNextTier: 3750,
      rewardsClaimed: 2
    }
  });
});

module.exports = router;