// src/middlewares/rateLimit.middleware.js
const rateLimit = require('express-rate-limit');
const redisClient = require('../config/redis-client');

class RateLimiterService {
  constructor() {
    this.limiters = new Map();
    this.store = null;
    this.redis = null;

    // محاولة الحصول على اتصال Redis (بدون انتظار)
    this.initRedis();
  }

  /**
   * تهيئة Redis بشكل غير متزامن
   */
  async initRedis() {
    try {
      // محاولة الاتصال بـ Redis
      this.redis = redisClient.getClient();

      if (this.redis) {
        // انتظر قليلاً حتى يكتمل الاتصال
        setTimeout(() => {
          if (redisClient.isConnected()) {
            this.initRedisStore();
          }
        }, 1000);
      }
    } catch (error) {
      console.log('ℹ️ Using memory store for rate limiting');
    }
  }

  /**
   * تهيئة RedisStore بعد اكتمال الاتصال
   */
  initRedisStore() {
    try {
      const { RedisStore } = require('rate-limit-redis');
      this.store = new RedisStore({
        sendCommand: (...args) => this.redis.call(...args),
        prefix: 'rl:'
      });
      console.log('✅ Using Redis store for rate limiting');
    } catch (error) {
      console.log('ℹ️ Using memory store for rate limiting');
    }
  }

  /**
   * الحصول على المخزن المناسب
   */
  getStore() {
    return this.store; // قد يكون null، وفي هذه الحالة rate-limiter يستخدم memory store
  }

  /**
   * إنشاء Rate Limiter مخصص
   */
  createLimiter(options = {}) {
    const defaultOptions = {
      windowMs: 15 * 60 * 1000, // 15 دقيقة
      max: 100,
      message: {
        success: false,
        message: 'محاولات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: options.skipSuccessful || false,
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

    // إضافة store فقط إذا كان متاحاً
    const store = this.getStore();
    if (store) {
      defaultOptions.store = store;
    }

    const limiterOptions = { ...defaultOptions, ...options };
    return rateLimit(limiterOptions);
  }

  // ====== Rate Limiters ======

  get authLimiter() {
    if (!this.limiters.has('auth')) {
      this.limiters.set('auth', this.createLimiter({
        windowMs: 60 * 60 * 1000, // ساعة
        max: 10,
        skipSuccessfulRequests: true,
        message: {
          success: false,
          message: 'محاولات تسجيل دخول كثيرة جداً، الرجاء المحاولة بعد ساعة',
          code: 'AUTH_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('auth');
  }

  get apiLimiter() {
    if (!this.limiters.has('api')) {
      this.limiters.set('api', this.createLimiter({
        windowMs: 15 * 60 * 1000, // 15 دقيقة
        max: 100,
        message: {
          success: false,
          message: 'طلبات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة',
          code: 'API_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('api');
  }

  get strictLimiter() {
    if (!this.limiters.has('strict')) {
      this.limiters.set('strict', this.createLimiter({
        windowMs: 24 * 60 * 60 * 1000, // 24 ساعة
        max: 3,
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

  get uploadLimiter() {
    if (!this.limiters.has('upload')) {
      this.limiters.set('upload', this.createLimiter({
        windowMs: 10 * 60 * 1000, // 10 دقائق
        max: 20,
        message: {
          success: false,
          message: 'رفعت ملفات كثيرة جداً، الرجاء المحاولة بعد 10 دقائق',
          code: 'UPLOAD_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('upload');
  }

  get searchLimiter() {
    if (!this.limiters.has('search')) {
      this.limiters.set('search', this.createLimiter({
        windowMs: 60 * 1000, // دقيقة واحدة
        max: 30,
        message: {
          success: false,
          message: 'طلبات بحث كثيرة جداً، الرجاء التهدئة قليلاً',
          code: 'SEARCH_RATE_LIMIT'
        }
      }));
    }
    return this.limiters.get('search');
  }


  // ====== دوال مساعدة جديدة ======

  /**
   * الحصول على Redis client
   */
  getRedisClient() {
    return this.redis;
  }

  /**
   * الحصول على إحصائيات الـ rate limiting
   */
  async getStats() {
    if (!this.redis || !redisClient.isConnected()) {
      return {
        total: 0,
        active: 0,
        details: []
      };
    }

    try {
      const keys = await this.redis.keys('rl:*');
      const details = [];

      for (const key of keys.slice(0, 20)) {
        const ttl = await this.redis.ttl(key);
        const value = await this.redis.get(key);

        details.push({
          key: key.replace('rl:', ''),
          ttl,
          hits: parseInt(value) || 0
        });
      }

      return {
        total: keys.length,
        active: details.filter(d => d.ttl > 0).length,
        details
      };
    } catch (error) {
      console.error('Error getting rate limit stats:', error);
      return {
        total: 0,
        active: 0,
        details: []
      };
    }
  }

  /**
   * إعادة تعيين حدود مستخدم معين
   */
  async resetUserLimits(userId) {
    if (!this.redis || !redisClient.isConnected()) {
      return false;
    }

    try {
      const keys = await this.redis.keys(`rl:*:*:${userId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Error resetting user limits:', error);
      return false;
    }
  }
}

module.exports = new RateLimiterService();