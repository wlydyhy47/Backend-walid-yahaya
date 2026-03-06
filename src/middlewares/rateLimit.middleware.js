// src/middlewares/rateLimit.middleware.js - تحديث الملف

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../config/redis');

class RateLimiterService {
  constructor() {
    this.limiters = new Map();
    this.redis = redisClient.getClient();
  }

  /**
   * إنشاء Rate Limiter مخصص
   */
  createLimiter(options = {}) {
    const defaultOptions = {
      windowMs: 15 * 60 * 1000, // 15 دقيقة
      max: 100, // الحد الأقصى للطلبات
      message: {
        success: false,
        message: 'محاولات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true, // إرسال headers قياسية
      legacyHeaders: false, // عدم إرسال headers قديمة
      
      // مفتاح فريد لكل مستخدم/IP
      keyGenerator: (req) => {
        // استخدام معرف المستخدم إذا كان مسجلاً، وإلا استخدام IP
        const userId = req.user?.id || req.userId;
        const ip = req.ip || req.connection.remoteAddress;
        return userId ? `user:${userId}` : `ip:${ip}`;
      },

      // تخطي الطلبات الناجحة (للمصادقة)
      skipSuccessfulRequests: options.skipSuccessful || false,

      // معالج تجاوز الحد
      handler: (req, res) => {
        const retryAfter = Math.ceil(options.windowMs / 1000 / 60);
        res.status(429).json({
          success: false,
          message: options.message?.message || 'محاولات كثيرة جداً',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: `${retryAfter} دقيقة`,
          timestamp: new Date().toISOString()
        });
      },

      // تخزين في Redis (إذا كان متاحاً)
      store: this.redis ? new RedisStore({
        sendCommand: (...args) => this.redis.call(...args),
        prefix: 'rl:'
      }) : undefined
    };

    const limiterOptions = { ...defaultOptions, ...options };
    return rateLimit(limiterOptions);
  }

  /**
   * Rate Limiter للمصادقة (صارم)
   */
  get authLimiter() {
    if (!this.limiters.has('auth')) {
      this.limiters.set('auth', this.createLimiter({
        windowMs: 60 * 60 * 1000, // ساعة
        max: 10, // 10 محاولات في الساعة
        skipSuccessfulRequests: true, // تخطي المحاولات الناجحة
        message: {
          success: false,
          message: 'محاولات تسجيل دخول كثيرة جداً، الرجاء المحاولة بعد ساعة',
          code: 'AUTH_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('auth');
  }

  /**
   * Rate Limiter للـ API العامة
   */
  get apiLimiter() {
    if (!this.limiters.has('api')) {
      this.limiters.set('api', this.createLimiter({
        windowMs: 15 * 60 * 1000, // 15 دقيقة
        max: 100, // 100 طلب لكل IP
        message: {
          success: false,
          message: 'طلبات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة',
          code: 'API_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('api');
  }

  /**
   * Rate Limiter صارم جداً (لإعادة تعيين كلمة المرور)
   */
  get strictLimiter() {
    if (!this.limiters.has('strict')) {
      this.limiters.set('strict', this.createLimiter({
        windowMs: 24 * 60 * 60 * 1000, // 24 ساعة
        max: 3, // 3 محاولات فقط في اليوم
        skipSuccessfulRequests: true,
        message: {
          success: false,
          message: 'لقد تجاوزت الحد المسموح من المحاولات لهذا اليوم',
          code: 'STRICT_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('strict');
  }

  /**
   * Rate Limiter للرفع (Upload)
   */
  get uploadLimiter() {
    if (!this.limiters.has('upload')) {
      this.limiters.set('upload', this.createLimiter({
        windowMs: 10 * 60 * 1000, // 10 دقائق
        max: 20, // 20 ملف في 10 دقائق
        message: {
          success: false,
          message: 'رفعت ملفات كثيرة جداً، الرجاء المحاولة بعد 10 دقائق',
          code: 'UPLOAD_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('upload');
  }

  /**
   * Rate Limiter مخصص لرقم هاتف معين (لمنع هجمات Brute Force)
   */
  createPhoneLimiter(phone) {
    return this.createLimiter({
      windowMs: 60 * 60 * 1000, // ساعة
      max: 5,
      keyGenerator: () => `phone:${phone}`,
      message: {
        success: false,
        message: 'محاولات كثيرة لهذا الرقم، الرجاء المحاولة بعد ساعة',
        code: 'PHONE_RATE_LIMIT'
      }
    });
  }

  /**
   * الحصول على إحصائيات الـ Rate Limiting
   */
  async getStats() {
    if (!this.redis) return null;

    try {
      const keys = await this.redis.keys('rl:*');
      const stats = [];

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        const value = await this.redis.get(key);
        
        stats.push({
          key: key.replace('rl:', ''),
          ttl: `${ttl} ثانية`,
          hits: parseInt(value) || 0
        });
      }

      return {
        total: stats.length,
        active: stats.filter(s => s.ttl > 0).length,
        details: stats.slice(0, 20) // آخر 20 فقط
      };
    } catch (error) {
      console.error('❌ Redis stats error:', error.message);
      return null;
    }
  }

  /**
   * حذف جميع محاولات مستخدم معين
   */
  async resetUserLimits(userId) {
    if (!this.redis) return false;

    try {
      const keys = await this.redis.keys(`rl:user:${userId}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🔄 Reset rate limits for user ${userId}`);
      }
      return true;
    } catch (error) {
      console.error('❌ Reset limits error:', error.message);
      return false;
    }
  }
}

module.exports = new RateLimiterService();