// src/routes/admin.routes.js (محدث)

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');

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
    const stats = await rateLimiter.getStats();
    
    if (!stats) {
      return res.status(503).json({
        success: false,
        message: 'Redis غير متاح حالياً'
      });
    }
    
    res.json({
      success: true,
      data: stats,
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
    
    const result = await rateLimiter.resetUserLimits(userId);
    
    // تسجيل العملية
    console.log(`🔐 Admin ${req.user.id} reset limits for user ${userId}${reason ? `: ${reason}` : ''}`);
    
    res.json({
      success: result,
      message: result ? '✅ تم إعادة تعيين حدود المستخدم بنجاح' : '❌ فشل إعادة التعيين',
      data: {
        userId,
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
    
    if (!rateLimiter.redis) {
      return res.status(503).json({
        success: false,
        message: 'Redis غير متاح'
      });
    }
    
    // البحث عن جميع مفاتيح هذا المستخدم
    const keys = await rateLimiter.redis.keys(`rl:user:${userId}*`);
    const limits = [];
    
    for (const key of keys) {
      const ttl = await rateLimiter.redis.ttl(key);
      const value = await rateLimiter.redis.get(key);
      const keyParts = key.replace('rl:', '').split(':');
      
      limits.push({
        type: keyParts[2] || 'general',
        remaining: Math.max(0, 10 - parseInt(value)), // افتراض أن الحد 10
        total: 10,
        resetsIn: `${Math.floor(ttl / 60)} دقيقة و ${ttl % 60} ثانية`,
        ttl
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
    
    if (!rateLimiter.redis) {
      return res.status(503).json({
        success: false,
        message: 'Redis غير متاح'
      });
    }
    
    const keys = await rateLimiter.redis.keys('rl:*');
    if (keys.length > 0) {
      await rateLimiter.redis.del(...keys);
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

/**
 * @route   GET /api/admin/rate-limit/dashboard
 * @desc    لوحة تحكم بسيطة لمراقبة rate limiting
 * @access  Admin only
 */
router.get('/rate-limit/dashboard', async (req, res) => {
  try {
    const stats = await rateLimiter.getStats();
    
    if (!stats) {
      return res.send(`
        <html>
          <head><title>Rate Limiting Dashboard</title></head>
          <body>
            <h1>❌ Redis غير متاح</h1>
          </body>
        </html>
      `);
    }
    
    // إنشاء جدول HTML بسيط
    const tableRows = stats.details.map(item => `
      <tr>
        <td>${item.key}</td>
        <td>${item.ttl}</td>
        <td>${item.hits}</td>
      </tr>
    `).join('');
    
    res.send(`
      <html>
        <head>
          <title>Rate Limiting Dashboard</title>
          <style>
            body { font-family: Arial; padding: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #4CAF50; color: white; }
            tr:nth-child(even) { background-color: #f2f2f2; }
            .stats { margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>📊 Rate Limiting Dashboard</h1>
          <div class="stats">
            <p><strong>Total Keys:</strong> ${stats.total}</p>
            <p><strong>Active Keys:</strong> ${stats.active}</p>
          </div>
          <table>
            <tr>
              <th>Key</th>
              <th>TTL</th>
              <th>Hits</th>
            </tr>
            ${tableRows}
          </table>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Error loading dashboard');
  }
});

module.exports = router;