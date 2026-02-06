const NodeCache = require('node-cache');
const { businessLogger } = require('./logger.util');

class CacheService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL) : 300,
      checkperiod: 60,
      useClones: false,
      deleteOnExpire: true
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
      errors: 0
    };
    
    console.log('✅ Cache service initialized with TTL:', this.cache.options.stdTTL);
  }

  set(key, value, ttl = null) {
    try {
      const success = this.cache.set(key, value, ttl || this.cache.options.stdTTL);
      if (success) {
        this.stats.sets++;
        businessLogger.debug('Cache Set', { key, ttl, size: JSON.stringify(value).length });
      }
      return success;
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Cache Set Error', { key, error: error.message });
      return false;
    }
  }

  get(key) {
    try {
      const value = this.cache.get(key);
      if (value !== undefined) {
        this.stats.hits++;
        businessLogger.debug('Cache Hit', { key });
      } else {
        this.stats.misses++;
        businessLogger.debug('Cache Miss', { key });
      }
      return value;
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Cache Get Error', { key, error: error.message });
      return undefined;
    }
  }

  mget(keys) {
    try {
      const values = this.cache.mget(keys);
      const hitCount = Object.keys(values).filter(k => values[k] !== undefined).length;
      this.stats.hits += hitCount;
      this.stats.misses += (keys.length - hitCount);
      return values;
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Cache MGet Error', { keys, error: error.message });
      return {};
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  del(key) {
    try {
      const deleted = this.cache.del(key);
      if (deleted > 0) {
        this.stats.deletes++;
        businessLogger.debug('Cache Delete', { key });
      }
      return deleted;
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Cache Delete Error', { key, error: error.message });
      return 0;
    }
  }

  flush() {
    try {
      const keys = this.cache.keys();
      this.stats.deletes += keys.length;
      this.cache.flushAll();
      businessLogger.info('Cache Flush', { keysCount: keys.length });
      return keys.length;
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Cache Flush Error', { error: error.message });
      return 0;
    }
  }

  getStats() {
    // الحصول على إحصائيات node-cache بطريقة متوافقة
    const keys = this.cache.keys();
    const stats = this.cache.getStats ? this.cache.getStats() : {};
    
    return {
      ...stats,
      advanced: {
        ...this.stats,
        hitRate: this.stats.hits + this.stats.misses > 0 
          ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2) + '%'
          : '0%',
        efficiency: this.stats.hits > 0 
          ? ((this.stats.hits / (this.stats.hits + this.stats.misses + this.stats.errors)) * 100).toFixed(2) + '%'
          : '0%',
        size: this.calculateCacheSize(),
        avgEntrySize: this.calculateAverageEntrySize()
      },
      keys: keys,
      keyCount: keys.length,
      memoryUsage: process.memoryUsage()
    };
  }

  generateKey(req) {
    try {
      const { originalUrl, method, user, query, params, body } = req;
      const userId = user?.id || 'guest';
      const userRole = user?.role || 'anonymous';
      
      // إزالة query parameters غير الضرورية
      const filteredQuery = { ...query };
      delete filteredQuery._; // إزالة timestamp
      delete filteredQuery.cache; // إزالة معاملات الكاش
      
      const queryStr = JSON.stringify(filteredQuery);
      const paramsStr = JSON.stringify(params);
      
      // إنشاء hash من الـ body (بتجاهل بعض الحقول)
      let bodyHash = 'no-body';
      if (body && Object.keys(body).length > 0) {
        const filteredBody = { ...body };
        
        // إزالة الحقول الحساسة أو الكبيرة
        delete filteredBody.password;
        delete filteredBody.confirmPassword;
        delete filteredBody.token;
        delete filteredBody.image;
        delete filteredBody.file;
        delete filteredBody.files;
        
        if (Object.keys(filteredBody).length > 0) {
          const crypto = require('crypto');
          bodyHash = crypto
            .createHash('md5')
            .update(JSON.stringify(filteredBody))
            .digest('hex')
            .substring(0, 8);
        }
      }
      
      // إنشاء مفتاح أكثر تنظيماً
      const keyParts = [
        method.toUpperCase(),
        originalUrl.split('?')[0], // إزالة query string من URL
        userId,
        userRole,
        queryStr !== '{}' ? queryStr : '',
        paramsStr !== '{}' ? paramsStr : '',
        bodyHash
      ].filter(part => part && part !== '' && part !== '{}');
      
      return keyParts.join(':');
    } catch (error) {
      console.error('❌ Cache key generation error:', error.message);
      // مفتاح افتراضي في حالة الخطأ
      return `fallback:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  async cacheWithFallback(key, fetchFunction, ttl = 300, fallbackFunction = null) {
    const cached = this.get(key);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    try {
      const data = await fetchFunction();
      this.set(key, data, ttl);
      return data;
    } catch (error) {
      businessLogger.error('Cache Fallback Error', { key, error: error.message });
      
      if (fallbackFunction) {
        try {
          const fallbackData = await fallbackFunction();
          businessLogger.warn('Using Cache Fallback', { key });
          return fallbackData;
        } catch (fallbackError) {
          throw new Error(`Primary and fallback both failed: ${error.message}`);
        }
      }
      
      throw error;
    }
  }

  invalidatePattern(pattern) {
    try {
      const keys = this.cache.keys();
      if (!pattern || pattern === '*') {
        return this.flush();
      }
      
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      const matchedKeys = keys.filter(key => regex.test(key));
      
      matchedKeys.forEach(key => this.del(key));
      this.stats.invalidations += matchedKeys.length;
      
      businessLogger.debug('Cache Pattern Invalidation', { 
        pattern, 
        matchedKeys: matchedKeys.length,
        keys: matchedKeys 
      });
      
      return matchedKeys.length;
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Cache Pattern Invalidation Error', { pattern, error: error.message });
      return 0;
    }
  }

  clearByPattern(pattern) {
    return this.invalidatePattern(pattern);
  }

  getCacheInfo() {
    const total = this.stats.hits + this.stats.misses;
    return {
      keys: this.cache.keys().length,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%',
      invalidationCount: this.stats.invalidations,
      errorCount: this.stats.errors,
      size: this.calculateCacheSize(),
      avgEntrySize: this.calculateAverageEntrySize()
    };
  }

  smartCleanup(minHits = 2, maxAgeHours = 24) {
    const keys = this.cache.keys();
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    
    let cleaned = 0;
    
    keys.forEach(key => {
      try {
        const ttl = this.cache.getTtl(key);
        if (ttl) {
          const age = now - (ttl - (this.cache.options.stdTTL * 1000));
          const isOld = age > maxAgeMs;
          
          if (isOld) {
            this.del(key);
            cleaned++;
          }
        }
      } catch (error) {
        console.error(`Error checking key ${key}:`, error.message);
      }
    });
    
    businessLogger.info('Cache Smart Cleanup', { cleaned, totalKeys: keys.length });
    return cleaned;
  }

  calculateCacheSize() {
    try {
      const keys = this.cache.keys();
      let totalSize = 0;
      
      keys.forEach(key => {
        const value = this.cache.get(key);
        if (value) {
          try {
            totalSize += Buffer.byteLength(JSON.stringify(value), 'utf8');
          } catch (error) {
            // تجاهل الأخطاء في حساب الحجم
          }
        }
      });
      
      return {
        bytes: totalSize,
        kilobytes: (totalSize / 1024).toFixed(2),
        megabytes: (totalSize / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      return { bytes: 0, kilobytes: '0.00', megabytes: '0.00' };
    }
  }

  calculateAverageEntrySize() {
    const keys = this.cache.keys();
    if (keys.length === 0) return 0;
    
    const sizeInfo = this.calculateCacheSize();
    return Math.round(sizeInfo.bytes / keys.length);
  }

  // دالة مساعدة جديدة: التحقق من صحة المفتاح
  isValidKey(key) {
    if (!key || typeof key !== 'string') return false;
    if (key.length > 1000) return false; // مفتاح طويل جداً
    if (key.includes('\n') || key.includes('\r')) return false; // أحرف غير مسموحة
    return true;
  }

  // دالة مساعدة جديدة: تنظيف الكاش القديم
  cleanupOldCache(maxAgeMinutes = 60) {
    const keys = this.cache.keys();
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    
    let cleaned = 0;
    
    keys.forEach(key => {
      try {
        const ttl = this.cache.getTtl(key);
        if (ttl) {
          const age = now - (ttl - (this.cache.options.stdTTL * 1000));
          if (age > maxAgeMs) {
            this.del(key);
            cleaned++;
          }
        }
      } catch (error) {
        // تجاهل الأخطاء
      }
    });
    
    return cleaned;
  }
}

module.exports = new CacheService();