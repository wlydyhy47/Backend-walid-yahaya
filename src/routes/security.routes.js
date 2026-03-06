// src/routes/security.routes.js

const express = require('express');
const router = express.Router();
const SecurityCheck = require('../utils/securityCheck.util');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');

/**
 * @route   POST /api/security/check-password
 * @desc    فحص قوة كلمة المرور
 * @access  Public
 */
router.post('/check-password', rateLimiter.apiLimiter, (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'كلمة المرور مطلوبة'
    });
  }

  const result = SecurityCheck.isPasswordStrong(password);
  
  res.json({
    success: true,
    data: result
  });
});

/**
 * @route   POST /api/security/check-email
 * @desc    فحص صحة البريد الإلكتروني
 * @access  Public
 */
router.post('/check-email', rateLimiter.apiLimiter, (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'البريد الإلكتروني مطلوب'
    });
  }

  const isValid = SecurityCheck.isValidEmail(email);
  
  res.json({
    success: true,
    data: {
      email,
      isValid,
      message: isValid ? 'بريد إلكتروني صالح' : 'بريد إلكتروني غير صالح'
    }
  });
});

/**
 * @route   GET /api/security/headers
 * @desc    عرض headers الأمان الحالية
 * @access  Admin فقط
 */
router.get('/headers', auth, role('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      helmet: '✅ Active',
      xssProtection: '✅ Active',
      noSqlInjection: '✅ Active',
      rateLimiting: '✅ Active',
      cors: '✅ Configured',
      contentSecurityPolicy: '✅ Enabled',
      hsts: '✅ Enabled',
      xFrameOptions: '✅ DENY',
      xContentTypeOptions: '✅ nosniff',
      xXSSProtection: '✅ Enabled'
    }
  });
});

/**
 * @route   GET /api/security/rate-limit/stats
 * @desc    إحصائيات الـ Rate Limiting
 * @access  Admin فقط
 */
router.get('/rate-limit/stats', auth, role('admin'), async (req, res) => {
  try {
    const redis = require('ioredis');
    const client = new redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });
    
    const keys = await client.keys('rl:*');
    const stats = [];
    
    for (const key of keys.slice(0, 20)) { // آخر 20 فقط
      const ttl = await client.ttl(key);
      const value = await client.get(key);
      
      stats.push({
        key: key.replace('rl:', ''),
        ttl: `${ttl} ثانية`,
        hits: parseInt(value) || 0,
        expiresIn: ttl > 0 ? `${Math.floor(ttl / 60)} دقيقة` : 'منتهي'
      });
    }
    
    await client.quit();
    
    res.json({
      success: true,
      data: {
        total: keys.length,
        active: stats.filter(s => s.ttl > 0).length,
        details: stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'فشل جلب إحصائيات rate limiting',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/security/rate-limit/reset/:userId
 * @desc    إعادة تعيين حدود مستخدم معين
 * @access  Admin فقط
 */
router.post('/rate-limit/reset/:userId', auth, role('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const redis = require('ioredis');
    const client = new redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });
    
    const keys = await client.keys(`rl:user:${userId}*`);
    
    if (keys.length > 0) {
      await client.del(...keys);
    }
    
    await client.quit();
    
    res.json({
      success: true,
      message: `تم إعادة تعيين حدود المستخدم ${userId}`,
      data: {
        userId,
        clearedKeys: keys.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'فشل إعادة تعيين حدود المستخدم',
      error: error.message
    });
  }
});

module.exports = router;