const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.connectionPromise = null;
    this.isConnecting = false;
  }

  getClient() {
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
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('❌ Redis max retries reached');
            return null;
          }
          return Math.min(times * 100, 1000);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 5000
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected (singleton)');
      });

      this.client.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          console.warn('⚠️ Redis connection refused - continuing without Redis');
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

  async connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.isConnecting) {
      return null;
    }

    const client = this.getClient();
    if (!client) {
      return null;
    }

    this.isConnecting = true;

    this.connectionPromise = client.connect().catch(err => {
      console.warn('⚠️ Redis connection failed:', err.message);
      this.connectionPromise = null;
      this.isConnecting = false;
      return null;
    });

    return this.connectionPromise;
  }

  isConnected() {
    return this.client && this.client.status === 'ready';
  }
}

getStatus() {
  return this.client ? this.client.status : 'disconnected';
}

module.exports = new RedisClient();