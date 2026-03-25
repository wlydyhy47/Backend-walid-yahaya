// ============================================
// ملف: src/middlewares/rateLimit.middleware.js
// الوصف: تحديد معدل الطلبات المسموح بها - منظم ومحسن
// الإصدار: 3.0.0
// التاريخ: 2026-03-25
// ============================================

const rateLimit = require('express-rate-limit');
const redisClient = require('../config/redis');
const { businessLogger } = require("../utils/logger.util");

/**
 * خدمة إدارة Rate Limiting
 * توفر حدود مختلفة للطلبات حسب نوع المسار
 */
class RateLimiterService {
  constructor() {
    // تخزين الـ limiters المؤقتة
    this.limiters = new Map();
    
    // تخزين Redis
    this.redis = null;
    this.store = null;
    
    // إحصائيات الـ Rate Limiting
    this.stats = {
      totalLimited: 0,
      byPath: {},
      byType: {},
      lastReset: new Date(),
      startTime: new Date()
    };
    
    // تهيئة Redis
    this.initRedis();
    
    businessLogger.info('RateLimiterService initialized');
  }

  // ========== 1. تهيئة Redis ==========

  /**
   * تهيئة اتصال Redis
   */
  async initRedis() {
    try {
      this.redis = redisClient.getClient();
      
      if (this.redis) {
        // انتظار اتصال Redis
        const checkConnection = () => {
          if (redisClient.isConnected && redisClient.isConnected()) {
            this.initRedisStore();
            businessLogger.info('Redis connected for rate limiting');
          } else {
            setTimeout(checkConnection, 500);
          }
        };
        
        setTimeout(checkConnection, 500);
      } else {
        businessLogger.warn('Redis client not available, using memory store');
      }
    } catch (error) {
      businessLogger.warn('Redis not available for rate limiting', error);
    }
  }

  /**
   * تهيئة Redis Store لـ express-rate-limit
   */
  initRedisStore() {
    try {
      const { RedisStore } = require('rate-limit-redis');
      
      this.store = new RedisStore({
        sendCommand: (...args) => this.redis.call(...args),
        prefix: 'rl:',
        // إضافة مهلة للاتصال
        timeout: 5000
      });
      
      businessLogger.info('RedisStore initialized for rate limiting');
    } catch (error) {
      businessLogger.warn('Failed to initialize RedisStore, using memory store', error);
      this.store = null;
    }
  }

  /**
   * الحصول على الـ store المناسب
   */
  getStore() {
    return this.store;
  }

  // ========== 2. رسائل الأخطاء ==========

  /**
   * الحصول على رسالة الخطأ حسب النوع
   */
  getLimitMessage(type = 'general') {
    const messages = {
      auth: {
        ar: 'محاولات تسجيل دخول كثيرة جداً، الرجاء المحاولة بعد ساعة',
        en: 'Too many login attempts, please try again after an hour'
      },
      api: {
        ar: 'طلبات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة',
        en: 'Too many requests, please try again after 15 minutes'
      },
      strict: {
        ar: 'لقد تجاوزت الحد المسموح من المحاولات لهذا اليوم',
        en: 'You have exceeded the allowed attempts for today'
      },
      upload: {
        ar: 'رفعت ملفات كثيرة جداً، الرجاء المحاولة بعد 10 دقائق',
        en: 'Too many file uploads, please try again after 10 minutes'
      },
      search: {
        ar: 'طلبات بحث كثيرة جداً، الرجاء التهدئة قليلاً',
        en: 'Too many search requests, please slow down'
      },
      premium: {
        ar: 'لقد تجاوزت الحد المسموح للمستخدم المميز',
        en: 'You have exceeded the premium user limit'
      },
      general: {
        ar: 'محاولات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة',
        en: 'Too many attempts, please try again after 15 minutes'
      }
    };
    
    return messages[type] || messages.general;
  }

  // ========== 3. دوال مساعدة ==========

  /**
   * مولد المفتاح الافتراضي
   */
  defaultKeyGenerator(req) {
    // استخدام معرف المستخدم إذا كان مسجلاً
    if (req.user && req.user.id) {
      return `${req.user.id}:${req.path}`;
    }
    
    // استخدام IP إذا لم يكن مسجلاً
    const ip = req.ip || req.connection.remoteAddress;
    return `${ip}:${req.path}`;
  }

  /**
   * مولد مفتاح بدون مسار (للتسجيل مثلاً)
   */
  authKeyGenerator(req) {
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    
    // استخدام البريد أو رقم الهاتف إذا كان موجوداً
    const identifier = req.body.email || req.body.phone || req.ip;
    return `auth:${identifier}`;
  }

  /**
   * التحقق من تخطي التحديد
   */
  defaultSkipChecker(req) {
    // تخطي طلبات OPTIONS
    if (req.method === 'OPTIONS') return true;
    
    // تخطي مسارات الصحة
    const skipPaths = ['/health', '/', '/api-docs', '/swagger.json', '/swagger.yaml'];
    if (skipPaths.includes(req.path)) return true;
    
    // تخطي طلبات الوثائق
    if (req.path.startsWith('/api-docs')) return true;
    
    return false;
  }

  /**
   * معالج تجاوز الحد
   */
  createHandler(type, windowMs) {
    return (req, res) => {
      // تحديث الإحصائيات
      this.stats.totalLimited++;
      this.stats.byPath[req.path] = (this.stats.byPath[req.path] || 0) + 1;
      this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
      
      const retryAfter = Math.ceil(windowMs / 1000);
      const message = this.getLimitMessage(type);
      
      // تسجيل الحدث
      businessLogger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        type,
        userId: req.user?.id,
        retryAfter
      });
      
      // إرسال الرد
      res.status(429).json({
        success: false,
        message: message.ar,
        messageEn: message.en,
        code: 'RATE_LIMIT_EXCEEDED',
        type,
        retryAfter: `${retryAfter} ثانية`,
        retryAfterSeconds: retryAfter,
        timestamp: new Date().toISOString()
      });
    };
  }

  // ========== 4. إنشاء الـ Limiters ==========

  /**
   * إنشاء Rate Limiter مخصص
   */
  createLimiter(options = {}) {
    const {
      windowMs = 15 * 60 * 1000,      // 15 دقيقة
      max = 100,                       // الحد الأقصى
      type = 'general',                // نوع الـ limiter
      skipSuccessful = false,          // تخطي الطلبات الناجحة
      keyGenerator = null,             // مولد المفتاح
      skipChecker = null               // فحص التخطي
    } = options;

    const message = this.getLimitMessage(type);
    const handler = this.createHandler(type, windowMs);
    const store = this.getStore();
    
    const limiterOptions = {
      windowMs,
      max,
      message: {
        success: false,
        message: message.ar,
        messageEn: message.en,
        code: 'RATE_LIMIT_EXCEEDED',
        type
      },
      standardHeaders: true,           // إضافة رؤوس RateLimit-*
      legacyHeaders: false,            // عدم إضافة رؤوس X-RateLimit-*
      skipSuccessfulRequests: skipSuccessful,
      keyGenerator: keyGenerator || this.defaultKeyGenerator.bind(this),
      skip: skipChecker || this.defaultSkipChecker.bind(this),
      handler
    };

    // إضافة Redis Store إذا كان متاحاً
    if (store) {
      limiterOptions.store = store;
    }

    return rateLimit(limiterOptions);
  }

  // ========== 5. Limiters المحددة ==========

  /**
   * Limiter للمصادقة - 10 محاولات في الساعة
   */
  get authLimiter() {
    if (!this.limiters.has('auth')) {
      this.limiters.set('auth', this.createLimiter({
        windowMs: 60 * 60 * 1000,      // ساعة واحدة
        max: 10,                        // 10 محاولات
        type: 'auth',
        skipSuccessful: true,           // تخطي المحاولات الناجحة
        keyGenerator: this.authKeyGenerator.bind(this)
      }));
    }
    return this.limiters.get('auth');
  }

  /**
   * Limiter عام للـ API - 100 طلب في 15 دقيقة
   */
  get apiLimiter() {
    if (!this.limiters.has('api')) {
      this.limiters.set('api', this.createLimiter({
        windowMs: 15 * 60 * 1000,      // 15 دقيقة
        max: 100,                       // 100 طلب
        type: 'api'
      }));
    }
    return this.limiters.get('api');
  }

  /**
   * Limiter صارم - 3 محاولات في اليوم
   */
  get strictLimiter() {
    if (!this.limiters.has('strict')) {
      this.limiters.set('strict', this.createLimiter({
        windowMs: 24 * 60 * 60 * 1000, // 24 ساعة
        max: 3,                         // 3 محاولات
        type: 'strict',
        skipSuccessful: true
      }));
    }
    return this.limiters.get('strict');
  }

  /**
   * Limiter للرفع - 20 رفع في 10 دقائق
   */
  get uploadLimiter() {
    if (!this.limiters.has('upload')) {
      this.limiters.set('upload', this.createLimiter({
        windowMs: 10 * 60 * 1000,      // 10 دقائق
        max: 20,                        // 20 رفع
        type: 'upload'
      }));
    }
    return this.limiters.get('upload');
  }

  /**
   * Limiter للبحث - 30 بحث في الدقيقة
   */
  get searchLimiter() {
    if (!this.limiters.has('search')) {
      this.limiters.set('search', this.createLimiter({
        windowMs: 60 * 1000,           // دقيقة واحدة
        max: 30,                        // 30 بحث
        type: 'search'
      }));
    }
    return this.limiters.get('search');
  }

  /**
   * Limiter للمستخدمين المميزين - 500 طلب في 15 دقيقة
   */
  get premiumLimiter() {
    if (!this.limiters.has('premium')) {
      this.limiters.set('premium', this.createLimiter({
        windowMs: 15 * 60 * 1000,      // 15 دقيقة
        max: 500,                       // 500 طلب
        type: 'premium',
        keyGenerator: (req) => req.user?.id || req.ip
      }));
    }
    return this.limiters.get('premium');
  }

  /**
   * Limiter للطلب الواحد (حماية ضد التكرار)
   */
  get uniqueRequestLimiter() {
    if (!this.limiters.has('unique')) {
      this.limiters.set('unique', this.createLimiter({
        windowMs: 60 * 1000,           // دقيقة واحدة
        max: 1,                         // طلب واحد فقط
        type: 'unique',
        keyGenerator: (req) => `${req.user?.id || req.ip}:${req.path}:${JSON.stringify(req.body)}`
      }));
    }
    return this.limiters.get('unique');
  }

  /**
   * Limiter مخصص لمستخدم معين
   */
  getUserLimiter(userId, max = 200, windowMs = 15 * 60 * 1000) {
    return this.createLimiter({
      windowMs,
      max,
      type: 'user',
      keyGenerator: () => `user:${userId}`
    });
  }

  // ========== 6. إحصائيات وإدارة ==========

  /**
   * الحصول على إحصائيات rate limiting
   */
  async getStats(req, res) {
    try {
      const stats = {
        totalLimited: this.stats.totalLimited,
        byPath: this.stats.byPath,
        byType: this.stats.byType,
        lastReset: this.stats.lastReset,
        uptime: Math.floor((Date.now() - this.stats.startTime) / 1000),
        redis: {
          available: !!(this.redis && redisClient.isConnected && redisClient.isConnected()),
          storeType: this.store ? 'redis' : 'memory'
        }
      };
      
      // جلب بيانات إضافية من Redis إذا كان متاحاً
      if (this.redis && redisClient.isConnected && redisClient.isConnected()) {
        try {
          const keys = await this.redis.keys('rl:*');
          const details = [];
          
          for (const key of keys.slice(0, 50)) {
            const ttl = await this.redis.ttl(key);
            const value = await this.redis.get(key);
            details.push({
              key: key.replace('rl:', ''),
              ttl,
              ttlHuman: this.formatTTL(ttl),
              hits: parseInt(value) || 0
            });
          }
          
          stats.redis.keys = keys.length;
          stats.redis.activeKeys = details.filter(d => d.ttl > 0).length;
          stats.redis.details = details;
        } catch (error) {
          businessLogger.warn('Error fetching Redis rate limit stats:', error);
        }
      }
      
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      businessLogger.error('Error getting rate limit stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get rate limit stats',
        error: error.message
      });
    }
  }

  /**
   * إعادة تعيين حدود مستخدم معين
   */
  async resetUserLimits(req, res) {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    if (!this.redis || !redisClient.isConnected || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis not available for rate limit reset'
      });
    }
    
    try {
      const keys = await this.redis.keys(`rl:*:${userId}:*`);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        businessLogger.info(`Reset rate limits for user ${userId}`, { 
          keysCount: keys.length,
          userId 
        });
      }
      
      res.json({
        success: true,
        message: `Reset ${keys.length} rate limits for user ${userId}`,
        data: { 
          userId, 
          resetKeys: keys.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      businessLogger.error('Error resetting user limits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset user limits',
        error: error.message
      });
    }
  }

  /**
   * مسح جميع حدود rate limiting
   */
  async clearAll(req, res) {
    if (!this.redis || !redisClient.isConnected || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis not available for rate limit clear'
      });
    }
    
    try {
      const keys = await this.redis.keys('rl:*');
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        businessLogger.info(`Cleared all rate limits`, { 
          keysCount: keys.length 
        });
      }
      
      // إعادة تعيين الإحصائيات
      this.stats.totalLimited = 0;
      this.stats.byPath = {};
      this.stats.byType = {};
      this.stats.lastReset = new Date();
      
      res.json({
        success: true,
        message: `Cleared ${keys.length} rate limits`,
        data: { 
          clearedKeys: keys.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      businessLogger.error('Error clearing all limits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear all limits',
        error: error.message
      });
    }
  }

  /**
   * تنسيق TTL إلى نص مقروء
   */
  formatTTL(seconds) {
    if (seconds <= 0) return 'منتهي';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const parts = [];
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (minutes > 0) parts.push(`${minutes} دقيقة`);
    if (secs > 0 && hours === 0) parts.push(`${secs} ثانية`);
    
    return parts.join(' و ') || 'أقل من ثانية';
  }

  /**
   * إعادة تعيين الإحصائيات
   */
  resetStats() {
    this.stats = {
      totalLimited: 0,
      byPath: {},
      byType: {},
      lastReset: new Date(),
      startTime: this.stats.startTime
    };
    businessLogger.info('Rate limit stats reset');
  }

  /**
   * الحصول على حالة الخدمة
   */
  getStatus() {
    return {
      redisAvailable: !!(this.redis && redisClient.isConnected && redisClient.isConnected()),
      storeType: this.store ? 'redis' : 'memory',
      limitersCount: this.limiters.size,
      totalLimited: this.stats.totalLimited,
      uptime: Math.floor((Date.now() - this.stats.startTime) / 1000)
    };
  }
}

// تصدير نسخة واحدة من الخدمة
module.exports = new RateLimiterService();