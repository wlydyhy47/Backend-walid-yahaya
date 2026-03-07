// src/config/redis.js
const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
  }

  connect() {
    try {
      // ✅ الأولوية لـ REDIS_URL إذا كان موجوداً
      if (process.env.REDIS_URL) {
        console.log('🔌 Connecting to Redis using URL...');
        
        this.client = new Redis(process.env.REDIS_URL, {
          retryStrategy: (times) => {
            // إعادة المحاولة مع تأخير تصاعدي، لكن نتوقف بعد 10 محاولات
            if (times > 10) {
              console.error('❌ Redis max retries reached, giving up');
              return null;
            }
            const delay = Math.min(times * 100, 3000);
            console.log(`🔄 Redis retry attempt ${times} in ${delay}ms`);
            return delay;
          },
          maxRetriesPerRequest: 3,
          connectTimeout: 10000, // 10 ثوانٍ timeout للاتصال
          lazyConnect: true // لا تتصل فوراً، انتظر حتى نحتاج
        });
      } else {
        // الرجوع للإعدادات الافتراضية
        console.log('🔌 Connecting to Redis using host/port...');
        console.log(`   Host: ${process.env.REDIS_HOST || 'localhost'}`);
        console.log(`   Port: ${process.env.REDIS_PORT || 6379}`);
        console.log(`   Password: ${process.env.REDIS_PASSWORD ? '****' : 'none'}`);
        
        this.client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD || null,
          retryStrategy: (times) => {
            if (times > 10) {
              console.error('❌ Redis max retries reached, giving up');
              return null;
            }
            const delay = Math.min(times * 100, 3000);
            console.log(`🔄 Redis retry attempt ${times} in ${delay}ms`);
            return delay;
          },
          maxRetriesPerRequest: 3,
          connectTimeout: 10000,
          lazyConnect: true
        });
      }

      this.client.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis ready to accept commands');
      });

      this.client.on('error', (error) => {
        // ✅ تجاهل أخطاء ECONNREFUSED إذا كنا لا نحتاج Redis فعلاً
        if (error.code === 'ECONNREFUSED') {
          console.warn('⚠️ Redis connection refused - continuing without Redis');
          // لا نعيد رمي الخطأ، فقط نسجله
        } else {
          console.error('❌ Redis error:', error.message);
        }
      });

      this.client.on('close', () => {
        console.log('👋 Redis connection closed');
      });

      return this.client;
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      // ✅ لا نرمي الخطأ، نعيد null والخدمات ستستخدم fallback
      return null;
    }
  }

  getClient() {
    if (!this.client) {
      this.client = this.connect();
    }
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      console.log('👋 Redis disconnected');
    }
  }

  // ✅ دالة للتحقق من اتصال Redis
  isConnected() {
    return this.client && this.client.status === 'ready';
  }

  // ✅ دالة للاختبار
  async testConnection() {
    try {
      if (!this.isConnected()) {
        console.log('⚠️ Redis not connected, skipping test');
        return false;
      }
      
      await this.client.set('test:connection', 'ok');
      const result = await this.client.get('test:connection');
      console.log('✅ Redis test:', result === 'ok' ? 'passed' : 'failed');
      return result === 'ok';
    } catch (error) {
      console.error('❌ Redis test failed:', error.message);
      return false;
    }
  }
}

module.exports = new RedisClient();