// src/middlewares/rateLimit.middleware.js - نسخة محدثة بالكامل

const rateLimit = require('express-rate-limit');
const redisClient = require('../config/redis-client');
class RateLimiterService {
  
  constructor() {
  this.limiters = new Map();
  this.redis = redisClient.getClient(); // استخدم getClient()
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
      standardHeaders: true,
      legacyHeaders: false,
      
      // ✅ لا نستخدم keyGenerator مخصص - نترك المكتبة تتعامل مع IP
      // المكتبة ستستخدم req.ip تلقائياً وهو معالج بشكل صحيح لـ IPv6

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
    };

    // ✅ تخزين في Redis (إذا كان متاحاً)
    if (this.redis) {
      try {
        const { RedisStore } = require('rate-limit-redis');
        defaultOptions.store = new RedisStore({
          sendCommand: (...args) => this.redis.call(...args),
          prefix: 'rl:'
        });
        console.log('✅ Using Redis store for rate limiting');
      } catch (storeError) {
        console.warn('⚠️ RedisStore not available, using memory store:', storeError.message);
      }
    } else {
      console.log('ℹ️ Using memory store for rate limiting (Redis not available)');
    }

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
   * Rate Limiter للبحث
   */
  get searchLimiter() {
    if (!this.limiters.has('search')) {
      this.limiters.set('search', this.createLimiter({
        windowMs: 60 * 1000, // دقيقة واحدة
        max: 30, // 30 طلب بحث في الدقيقة
        message: {
          success: false,
          message: 'طلبات بحث كثيرة جداً، الرجاء التهدئة قليلاً',
          code: 'SEARCH_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('search');
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
    if (!this.redis) {
      return {
        total: 0,
        active: 0,
        details: [],
        message: 'Redis not available, using memory store'
      };
    }

    try {
      const keys = await this.redis.keys('rl:*');
      const stats = [];

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        const value = await this.redis.get(key);
        
        stats.push({
          key: key.replace('rl:', ''),
          ttl: ttl > 0 ? `${ttl} ثانية` : 'منتهي',
          hits: parseInt(value) || 0,
          expiresIn: ttl > 0 ? `${Math.floor(ttl / 60)} دقيقة` : 'منتهي'
        });
      }

      return {
        total: stats.length,
        active: stats.filter(s => !s.ttl.includes('منتهي')).length,
        details: stats.slice(0, 20)
      };
    } catch (error) {
      console.error('❌ Redis stats error:', error.message);
      return {
        total: 0,
        active: 0,
        details: [],
        error: error.message
      };
    }
  }

  /**
   * حذف جميع محاولات مستخدم معين
   */
  async resetUserLimits(userId) {
    if (!this.redis) {
      console.log(`ℹ️ Cannot reset limits for user ${userId}: Redis not available`);
      return false;
    }

    try {
      const keys = await this.redis.keys(`rl:user:${userId}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🔄 Reset rate limits for user ${userId} (${keys.length} keys)`);
        return true;
      }
      console.log(`ℹ️ No rate limits found for user ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Reset limits error:', error.message);
      return false;
    }
  }

  /**
   * مسح جميع مفاتيح rate limiting (للمسؤول)
   */
  async clearAllLimits() {
    if (!this.redis) {
      return { success: false, message: 'Redis not available' };
    }

    try {
      const keys = await this.redis.keys('rl:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🗑️ Cleared all rate limits (${keys.length} keys)`);
        return { success: true, clearedCount: keys.length };
      }
      return { success: true, clearedCount: 0 };
    } catch (error) {
      console.error('❌ Clear all limits error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new RateLimiterService();