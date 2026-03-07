// src/config/redis-client.js
const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.connectionPromise = null;
    this.isInitialized = false;
  }

  /**
   * الحصول على عميل Redis (بدون إنشاء اتصال جديد إذا كان موجوداً)
   */
  getClient() {
    // إذا كان العميل موجوداً بالفعل، استخدمه
    if (this.client) {
      return this.client;
    }

    const redisUrl = process.env.REDIS_URL;
    const redisEnabled = process.env.REDIS_ENABLED === 'true';

    if (!redisEnabled || !redisUrl) {
      console.warn('⚠️ Redis is disabled or URL not provided');
      return null;
    }

    try {
      console.log('🔌 Creating Redis client (singleton)...');
      
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 2) {
            console.error('❌ Redis max retries reached');
            return null;
          }
          return Math.min(times * 100, 500);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 3000,
        showFriendlyErrorStack: false
      });

      // معالجة الأحداث مرة واحدة فقط
      this.client.on('connect', () => {
        console.log('✅ Redis connected (singleton)');
      });

      this.client.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          console.warn('⚠️ Redis connection refused - continuing without Redis');
        } else if (err.message.includes('already connecting')) {
          // تجاهل هذا الخطأ - لا تفعل شيئاً
        } else {
          console.error('❌ Redis error:', err.message);
        }
      });

      return this.client;
    } catch (error) {
      console.error('❌ Redis creation error:', error.message);
      return null;
    }
  }

  /**
   * الاتصال بـ Redis (مرة واحدة فقط)
   */
  async connect() {
    // إذا كان متصلاً بالفعل، ارجع النجاح
    if (this.isConnected()) {
      return true;
    }

    // إذا كان هناك اتصال قيد التنفيذ، انتظره
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const client = this.getClient();
    if (!client) {
      return false;
    }

    // منع محاولات الاتصال المتعددة
    this.connectionPromise = client.connect()
      .then(() => {
        this.isInitialized = true;
        return true;
      })
      .catch(err => {
        console.warn('⚠️ Redis connection failed:', err.message);
        this.connectionPromise = null;
        return false;
      });

    return this.connectionPromise;
  }

  /**
   * التحقق من حالة الاتصال
   */
  isConnected() {
    return this.client && this.client.status === 'ready';
  }

  /**
   * الحصول على حالة الاتصال
   */
  getStatus() {
    return this.client ? this.client.status : 'disconnected';
  }

  /**
   * الحصول على المخزن لـ rate limiting
   */
  getRateLimitStore() {
    const client = this.getClient();
    
    if (!client || !this.isConnected()) {
      console.log('ℹ️ Using memory store for rate limiting');
      return null;
    }

    try {
      const { RedisStore } = require('rate-limit-redis');
      return new RedisStore({
        sendCommand: (...args) => client.call(...args),
        prefix: 'rl:'
      });
    } catch (error) {
      console.warn('⚠️ RedisStore error:', error.message);
      return null;
    }
  }
}

// تصدير نسخة واحدة فقط (Singleton)
module.exports = new RedisClient();