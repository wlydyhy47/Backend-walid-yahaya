// src/routes/admin.routes.js (محدث ومصحح)

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');
const redisClient = require('../config/redis-client');

// ==================== جميع المسارات هنا تحتاج أدمن ====================
router.use(auth);
router.use(role('admin'));

// ========== 1. مسارات المستخدمين ==========
router.use('/users', require('./admin/users.routes'));

// ========== 2. مسارات Rate Limiting ==========

/**
 * @route   GET /api/admin/rate-limit/stats
 * @desc    إحصائيات الـ Rate Limiting
 * @access  Admin only
 */
router.get('/rate-limit/stats', async (req, res) => {
  try {
    const redis = redisClient.getClient();
    
    if (!redis || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis غير متاح حالياً',
        usingMemoryStore: true,
        data: {
          total: 0,
          active: 0,
          details: []
        }
      });
    }
    
    const keys = await redis.keys('rl:*');
    const stats = [];
    
    for (const key of keys.slice(0, 20)) {
      const ttl = await redis.ttl(key);
      const value = await redis.get(key);
      
      stats.push({
        key: key.replace('rl:', ''),
        ttl: `${ttl} ثانية`,
        hits: parseInt(value) || 0,
        expiresIn: ttl > 0 ? `${Math.floor(ttl / 60)} دقيقة و ${ttl % 60} ثانية` : 'منتهي'
      });
    }
    
    res.json({
      success: true,
      data: {
        total: keys.length,
        active: stats.filter(s => s.ttl > 0).length,
        details: stats
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Rate limit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب إحصائيات rate limiting',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/rate-limit/reset/:userId
 * @desc    إعادة تعيين حدود مستخدم معين
 * @access  Admin only
 */
router.post('/rate-limit/reset/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    // التحقق من صحة الـ userId
    if (!userId || userId.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'معرف المستخدم غير صالح'
      });
    }
    
    const redis = redisClient.getClient();
    
    if (!redis || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis غير متاح، لا يمكن إعادة تعيين الحدود'
      });
    }
    
    const keys = await redis.keys(`rl:*:*:${userId}:*`);
    
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    
    // تسجيل العملية
    console.log(`🔐 Admin ${req.user.id} reset limits for user ${userId}${reason ? `: ${reason}` : ''}`);
    
    res.json({
      success: true,
      message: '✅ تم إعادة تعيين حدود المستخدم بنجاح',
      data: {
        userId,
        resetKeys: keys.length,
        resetAt: new Date().toISOString(),
        adminId: req.user.id
      }
    });
  } catch (error) {
    console.error('❌ Reset limits error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إعادة تعيين حدود المستخدم',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/rate-limit/user/:userId
 * @desc    عرض حدود مستخدم معين
 * @access  Admin only
 */
router.get('/rate-limit/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const redis = redisClient.getClient();
    
    if (!redis || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis غير متاح'
      });
    }
    
    // البحث عن جميع مفاتيح هذا المستخدم
    const keys = await redis.keys(`rl:*:*:${userId}:*`);
    const limits = [];
    
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      const value = await redis.get(key);
      const keyParts = key.split(':');
      
      // استخراج النوع من المفتاح
      let type = 'general';
      if (keyParts[2]) type = keyParts[2];
      
      limits.push({
        type,
        remaining: Math.max(0, (await this.getLimitForType(type)) - parseInt(value || '0')),
        total: await this.getLimitForType(type),
        resetsIn: this.formatTTL(ttl),
        ttl
      });
    }
    
    // إضافة الإحصائيات الافتراضية إذا لم توجد مفاتيح
    if (keys.length === 0) {
      limits.push({
        type: 'general',
        remaining: 100,
        total: 100,
        resetsIn: 'غير محدود',
        ttl: -1
      });
    }
    
    res.json({
      success: true,
      data: {
        userId,
        limits,
        totalKeys: keys.length
      }
    });
  } catch (error) {
    console.error('❌ Get user limits error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب حدود المستخدم'
    });
  }
});

// دالة مساعدة لتنسيق TTL
function formatTTL(ttl) {
  if (ttl <= 0) return 'منتهي';
  if (ttl < 60) return `${ttl} ثانية`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)} دقيقة`;
  return `${Math.floor(ttl / 3600)} ساعة`;
}

// دالة مساعدة للحصول على الحد المسموح حسب النوع
async function getLimitForType(type) {
  const limits = {
    auth: 10,
    api: 100,
    upload: 20,
    search: 30,
    general: 100
  };
  return limits[type] || 100;
}

/**
 * @route   DELETE /api/admin/rate-limit/clear-all
 * @desc    مسح جميع حدود rate limiting (للمسؤول الرئيسي فقط)
 * @access  Admin only
 */
router.delete('/rate-limit/clear-all', async (req, res) => {
  try {
    // تحقق إضافي - فقط أدمن معين يمكنه مسح الكل
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'هذا الإجراء للمسؤول الرئيسي فقط'
      });
    }
    
    const redis = redisClient.getClient();
    
    if (!redis || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis غير متاح'
      });
    }
    
    const keys = await redis.keys('rl:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    
    // تسجيل العملية
    console.log(`⚠️ Admin ${req.user.id} cleared ALL rate limits (${keys.length} keys)`);
    
    res.json({
      success: true,
      message: `✅ تم مسح ${keys.length} مفتاح rate limiting`,
      data: {
        clearedKeys: keys.length,
        clearedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Clear all limits error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل مسح جميع الحدود'
    });
  }
});

module.exports = router;