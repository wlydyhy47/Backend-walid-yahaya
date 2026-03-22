// ============================================
// ملف: src/config/redis.js
// الوصف: إعدادات Redis للتخزين المؤقت
// ============================================

const Redis = require('ioredis');
const { businessLogger } = require("../utils/logger.util");

class RedisClient {
  constructor() {
    this.client = null;
    this.connectionPromise = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * الحصول على عميل Redis
   */
  getClient() {
    if (this.client) {
      return this.client;
    }

    const redisUrl = process.env.REDIS_URL;
    const redisEnabled = process.env.REDIS_ENABLED === 'true';

    if (!redisEnabled || !redisUrl) {
      businessLogger.warn('Redis is disabled or URL not provided');
      return null;
    }

    try {
      businessLogger.info('Creating Redis client...');

      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          this.reconnectAttempts = times;
          
          if (times > this.maxReconnectAttempts) {
            businessLogger.error('Redis max retries reached');
            return null;
          }

          const delay = Math.min(times * 100, 3000);
          businessLogger.info(`Redis reconnecting... attempt ${times} in ${delay}ms`);
          return delay;
        },
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 10000,
        disconnectTimeout: 5000,
        commandTimeout: 5000,
        keepAlive: 30000,
        family: 4,
        db: 0
      });

      this.setupEventListeners();

      return this.client;
    } catch (error) {
      businessLogger.error('Redis creation error:', error);
      return null;
    }
  }

  /**
   * إعداد مستمعي الأحداث
   */
  setupEventListeners() {
    if (!this.client) return;

    this.client.on('connect', () => {
      businessLogger.info('Redis connected ✅');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('ready', () => {
      businessLogger.info('Redis ready to accept commands');
    });

    this.client.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        businessLogger.warn('Redis connection refused');
      } else if (err.message.includes('already connecting')) {
        // تجاهل هذا الخطأ
      } else {
        businessLogger.error('Redis error:', err.message);
      }
      this.isConnected = false;
    });

    this.client.on('close', () => {
      businessLogger.info('Redis connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      businessLogger.info('Redis reconnecting...');
    });
  }

  /**
   * الاتصال بـ Redis
   */
  async connect() {
    if (this.isConnected) {
      return true;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const client = this.getClient();
    if (!client) {
      return false;
    }

    this.connectionPromise = client.connect()
      .then(() => {
        this.isConnected = true;
        this.connectionPromise = null;
        return true;
      })
      .catch(err => {
        businessLogger.warn('Redis connection failed:', err.message);
        this.connectionPromise = null;
        this.isConnected = false;
        return false;
      });

    return this.connectionPromise;
  }

  /**
   * قطع الاتصال بـ Redis
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      businessLogger.info('Redis disconnected');
    }
  }

  /**
   * التحقق من حالة الاتصال
   */
  isConnected() {
    return this.isConnected && this.client && this.client.status === 'ready';
  }

  /**
   * الحصول على حالة الاتصال
   */
  getStatus() {
    return {
      connected: this.isConnected(),
      status: this.client ? this.client.status : 'disconnected',
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * الحصول على المخزن لـ rate limiting
   */
  getRateLimitStore() {
    const client = this.getClient();
    
    if (!client || !this.isConnected()) {
      businessLogger.info('Using memory store for rate limiting');
      return null;
    }

    try {
      const { RedisStore } = require('rate-limit-redis');
      return new RedisStore({
        sendCommand: (...args) => client.call(...args),
        prefix: 'rl:'
      });
    } catch (error) {
      businessLogger.warn('RedisStore error:', error.message);
      return null;
    }
  }

  /**
   * الحصول على إحصائيات Redis
   */
  async getStats() {
    if (!this.isConnected()) {
      return null;
    }

    try {
      const info = await this.client.info();
      const stats = {
        memory: await this.client.info('memory'),
        stats: await this.client.info('stats'),
        keyspace: await this.client.info('keyspace')
      };

      return {
        version: await this.client.call('info', 'server').then(i => i.match(/redis_version:(.+)/)?.[1]?.trim()),
        usedMemory: await this.client.call('info', 'memory').then(i => i.match(/used_memory_human:(.+)/)?.[1]?.trim()),
        connectedClients: await this.client.call('info', 'clients').then(i => i.match(/connected_clients:(.+)/)?.[1]?.trim()),
        uptime: await this.client.call('info', 'server').then(i => i.match(/uptime_in_seconds:(.+)/)?.[1]?.trim()),
        totalKeys: await this.client.dbsize()
      };
    } catch (error) {
      businessLogger.error('Error getting Redis stats:', error);
      return null;
    }
  }

  /**
   * مسح الكاش
   */
  async flushAll() {
    if (!this.isConnected()) {
      return false;
    }

    try {
      await this.client.flushall();
      businessLogger.info('Redis cache flushed');
      return true;
    } catch (error) {
      businessLogger.error('Error flushing Redis:', error);
      return false;
    }
  }
}

// تصدير نسخة واحدة (Singleton)
const redisClient = new RedisClient();
module.exports = redisClient;