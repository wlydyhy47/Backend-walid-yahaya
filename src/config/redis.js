// src/config/redis.js
const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
  }

  connect() {
    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || null,
        retryStrategy: (times) => {
          // إعادة المحاولة مع تأخير تصاعدي
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      this.client.on('error', (error) => {
        console.error('❌ Redis error:', error.message);
      });

      return this.client;
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      return null;
    }
  }

  getClient() {
    if (!this.client) {
      this.connect();
    }
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      console.log('👋 Redis disconnected');
    }
  }
}

module.exports = new RedisClient();