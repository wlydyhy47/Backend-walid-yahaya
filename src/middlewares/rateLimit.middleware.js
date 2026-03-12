// ============================================
// ملف: src/middlewares/rateLimit.middleware.js
// الوصف: تحديد معدل الطلبات المسموح بها
// ============================================

const rateLimit = require('express-rate-limit');
const redisClient = require('../config/redis-client');
const { businessLogger } = require("../utils/logger.util");

class RateLimiterService {
  constructor() {
    this.limiters = new Map();
    this.store = null;
    this.redis = null;
    this.initRedis();
    this.stats = {
      totalLimited: 0,
      byPath: {},
      lastReset: new Date()
    };
  }

  async initRedis() {
    try {
      this.redis = redisClient.getClient();
      if (this.redis) {
        setTimeout(() => {
          if (redisClient.isConnected && redisClient.isConnected()) {
            this.initRedisStore();
          }
        }, 1000);
      }
    } catch (error) {
      businessLogger.warn('Redis not available, using memory store', error);
    }
  }

  initRedisStore() {
    try {
      const { RedisStore } = require('rate-limit-redis');
      this.store = new RedisStore({
        sendCommand: (...args) => this.redis.call(...args),
        prefix: 'rl:'
      });
      businessLogger.info('Using Redis store for rate limiting');
    } catch (error) {
      businessLogger.warn('Failed to initialize RedisStore, using memory store', error);
    }
  }

  getStore() {
    return this.store;
  }

  getLimitMessage(type = 'general') {
    const messages = {
      auth: 'محاولات تسجيل دخول كثيرة جداً، الرجاء المحاولة بعد ساعة',
      api: 'طلبات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة',
      strict: 'لقد تجاوزت الحد المسموح من المحاولات لهذا اليوم',
      upload: 'رفعت ملفات كثيرة جداً، الرجاء المحاولة بعد 10 دقائق',
      search: 'طلبات بحث كثيرة جداً، الرجاء التهدئة قليلاً',
      general: 'محاولات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة'
    };
    return messages[type] || messages.general;
  }

  defaultKeyGenerator(req) {
    if (req.user && req.user.id) {
      return `${req.user.id}:${req.path}`;
    }
    return req.ip;
  }

  createLimiter(options = {}) {
    const {
      windowMs = 15 * 60 * 1000,
      max = 100,
      message = this.getLimitMessage(),
      type = 'general',
      skipSuccessful = false,
      keyGenerator = null
    } = options;

    const limiterOptions = {
      windowMs,
      max,
      message: {
        success: false,
        message,
        code: 'RATE_LIMIT_EXCEEDED',
        type
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: skipSuccessful,
      keyGenerator: keyGenerator || this.defaultKeyGenerator.bind(this),
      handler: (req, res) => {
        this.stats.totalLimited++;
        this.stats.byPath[req.path] = (this.stats.byPath[req.path] || 0) + 1;
        const retryAfter = Math.ceil(windowMs / 1000);
        businessLogger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          type,
          userId: req.user?.id
        });
        res.status(429).json({
          success: false,
          message,
          code: 'RATE_LIMIT_EXCEEDED',
          type,
          retryAfter: `${retryAfter} ثانية`,
          timestamp: new Date().toISOString()
        });
      },
      skip: (req) => {
        if (req.method === 'OPTIONS') return true;
        if (req.path === '/health' || req.path === '/') return true;
        return false;
      }
    };

    const store = this.getStore();
    if (store) {
      limiterOptions.store = store;
    }

    return rateLimit(limiterOptions);
  }

  get authLimiter() {
    if (!this.limiters.has('auth')) {
      this.limiters.set('auth', this.createLimiter({
        windowMs: 60 * 60 * 1000,
        max: 10,
        type: 'auth',
        skipSuccessful: true,
        message: this.getLimitMessage('auth')
      }));
    }
    return this.limiters.get('auth');
  }

  get apiLimiter() {
    if (!this.limiters.has('api')) {
      this.limiters.set('api', this.createLimiter({
        windowMs: 15 * 60 * 1000,
        max: 100,
        type: 'api',
        message: this.getLimitMessage('api')
      }));
    }
    return this.limiters.get('api');
  }

  get strictLimiter() {
    if (!this.limiters.has('strict')) {
      this.limiters.set('strict', this.createLimiter({
        windowMs: 24 * 60 * 60 * 1000,
        max: 3,
        type: 'strict',
        skipSuccessful: true,
        message: this.getLimitMessage('strict')
      }));
    }
    return this.limiters.get('strict');
  }

  get uploadLimiter() {
    if (!this.limiters.has('upload')) {
      this.limiters.set('upload', this.createLimiter({
        windowMs: 10 * 60 * 1000,
        max: 20,
        type: 'upload',
        message: this.getLimitMessage('upload')
      }));
    }
    return this.limiters.get('upload');
  }

  get searchLimiter() {
    if (!this.limiters.has('search')) {
      this.limiters.set('search', this.createLimiter({
        windowMs: 60 * 1000,
        max: 30,
        type: 'search',
        message: this.getLimitMessage('search')
      }));
    }
    return this.limiters.get('search');
  }

  get premiumLimiter() {
    if (!this.limiters.has('premium')) {
      this.limiters.set('premium', this.createLimiter({
        windowMs: 15 * 60 * 1000,
        max: 500,
        type: 'premium',
        keyGenerator: (req) => req.user?.id || req.ip
      }));
    }
    return this.limiters.get('premium');
  }

  /**
   * الحصول على إحصائيات rate limiting
   */
  async getStats(req, res) {
    if (!this.redis || !redisClient.isConnected()) {
      return res.json({
        success: true,
        data: {
          total: 0,
          active: 0,
          details: [],
          memory: this.stats
        }
      });
    }

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

      res.json({
        success: true,
        data: {
          total: keys.length,
          active: details.filter(d => d.ttl > 0).length,
          details,
          memory: this.stats
        }
      });
    } catch (error) {
      businessLogger.error('Error getting rate limit stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get rate limit stats'
      });
    }
  }

  /**
   * إعادة تعيين حدود مستخدم معين
   */
  async resetUserLimits(req, res) {
    const { userId } = req.params;

    if (!this.redis || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis not available'
      });
    }

    try {
      const keys = await this.redis.keys(`rl:*:${userId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        businessLogger.info(`Reset rate limits for user ${userId}`, { keysCount: keys.length });
      }

      res.json({
        success: true,
        message: `Reset ${keys.length} rate limits for user ${userId}`,
        data: { userId, resetKeys: keys.length }
      });
    } catch (error) {
      businessLogger.error('Error resetting user limits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset user limits'
      });
    }
  }

  /**
   * مسح جميع حدود rate limiting
   */
  async clearAll(req, res) {
    if (!this.redis || !redisClient.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis not available'
      });
    }

    try {
      const keys = await this.redis.keys('rl:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        businessLogger.info(`Cleared all rate limits`, { keysCount: keys.length });
      }

      res.json({
        success: true,
        message: `Cleared ${keys.length} rate limits`,
        data: { clearedKeys: keys.length }
      });
    } catch (error) {
      businessLogger.error('Error clearing all limits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear all limits'
      });
    }
  }

  /**
   * تنسيق TTL
   */
  formatTTL(seconds) {
    if (seconds <= 0) return 'منتهي';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (minutes > 0) parts.push(`${minutes} دقيقة`);
    if (secs > 0) parts.push(`${secs} ثانية`);
    return parts.join(' و ');
  }

  getUserLimiter(userId, max = 200) {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000,
      max,
      type: 'user',
      keyGenerator: () => userId
    });
  }
}

module.exports = new RateLimiterService();