// ============================================
// ملف: src/middlewares/cache.middleware.js (محدث)
// الوصف: إدارة التخزين المؤقت
// ============================================

const cache = require('../utils/cache.util');
const { businessLogger } = require("../utils/logger.util");

/**
 * قائمة المسارات المستثناة من الكاش
 */
const EXCLUDED_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/logout',
  '/auth/change-password',
  '/orders',
  '/chat',
  '/notifications'
];

/**
 * قائمة الطرق التي لا يتم تخزينها
 */
const EXCLUDED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * التحقق من إمكانية تخزين الطلب
 */
const shouldCache = (req) => {
  // تجاهل طلبات OPTIONS
  if (req.method === 'OPTIONS') return false;

  // تجاهل الطرق التي تعدل البيانات
  if (EXCLUDED_METHODS.includes(req.method.toUpperCase())) return false;

  // تجاهل المسارات المستثناة
  if (EXCLUDED_PATHS.some(path => req.path.includes(path))) return false;

  // تجاهل الملفات الثابتة (يتم تخزينها بواسطة CDN)
  if (req.path.match(/\.(png|jpg|jpeg|gif|ico|svg|css|js|webp|avif|woff|woff2|ttf)$/)) {
    return false;
  }

  // تجاهل إذا كان هناك skipCache
  if (req.skipCache) return false;

  return true;
};

/**
 * الحصول على مدة الكاش حسب المسار
 */
const getCacheTTL = (req) => {
  if (req.path.includes('/home')) return 600; // 10 دقائق
  if (req.path.includes('/restaurants')) return 300; // 5 دقائق
  if (req.path.includes('/items')) return 180; // 3 دقائق
  if (req.path.includes('/dashboard')) return 60; // دقيقة واحدة
  return 60; // دقيقة واحدة افتراضياً
};

// ========== Middleware ==========

/**
 * @desc    إضافة معلومات الكاش للاستجابة
 */
const cacheMiddleware = (req, res, next) => {
  // تجاهل الملفات الثابتة
  if (req.path.startsWith('/public/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/icons/') ||
      req.path === '/logo.png' ||
      req.path === '/favicon.ico' ||
      req.path.match(/\.(png|jpg|jpeg|gif|ico|svg|css|js|webp|avif|woff|woff2|ttf)$/)) {
    
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 ساعة
    return next();
  }

  // حفظ الدوال الأصلية
  const originalJson = res.json;
  const originalSend = res.send;

  // تجاوز الدالة json
  res.json = function (data) {
    if (data && typeof data === 'object' && shouldCache(req)) {
      const cacheKey = cache.generateKey(req);
      const isCached = cache.has(cacheKey);

      // إضافة metadata
      if (!data.metadata) {
        data.metadata = {};
      }

      data.metadata.cacheInfo = {
        cached: isCached,
        key: cacheKey,
        timestamp: new Date().toISOString(),
        ttl: getCacheTTL(req)
      };
    }

    return originalJson.call(this, data);
  };

  // تجاوز الدالة send
  res.send = function (data) {
    if (shouldCache(req)) {
      try {
        // محاولة تحليل JSON
        if (typeof data === 'string') {
          const parsed = JSON.parse(data);
          const cacheKey = cache.generateKey(req);
          const isCached = cache.has(cacheKey);

          if (!parsed.metadata) {
            parsed.metadata = {};
          }

          parsed.metadata.cacheInfo = {
            cached: isCached,
            key: cacheKey,
            timestamp: new Date().toISOString(),
            ttl: getCacheTTL(req)
          };

          data = JSON.stringify(parsed);
        }
      } catch (error) {
        // ليس JSON، تجاهل
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * @desc    منع التخزين المؤقت
 */
const noCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  res.locals.noCache = true;

  next();
};

/**
 * @desc    تخزين الاستجابة في الكاش
 */
const cacheResponse = (ttl = 60) => {
  return (req, res, next) => {
    // تجاهل الطرق التي تعدل البيانات
    if (EXCLUDED_METHODS.includes(req.method.toUpperCase())) {
      return next();
    }

    const cacheKey = cache.generateKey(req);
    const cachedData = cache.get(cacheKey);

    if (cachedData !== undefined && cachedData !== null) {
      businessLogger.debug(`Serving from cache: ${cacheKey}`);

      // إضافة metadata
      const responseData = {
        ...cachedData,
        metadata: {
          ...cachedData.metadata,
          cached: true,
          servedFromCache: true,
          timestamp: new Date().toISOString()
        }
      };

      return res.json(responseData);
    }

    const originalJson = res.json;
    res.json = function (data) {
      try {
        // تخزين الردود الناجحة فقط
        if (res.statusCode >= 200 && res.statusCode < 300 && !res.locals.noCache) {
          cache.set(cacheKey, data, ttl);
          businessLogger.debug(`Cached response: ${cacheKey}`, { ttl });
        }
      } catch (error) {
        businessLogger.error('Cache set error:', error);
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * @desc    مسح الكاش عند تعديل البيانات
 */
const invalidateCacheOnMutation = (patterns = []) => {
  return (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const method = req.method.toUpperCase();

        if (EXCLUDED_METHODS.includes(method)) {
          // تأخير إبطال الكاش لضمان اكتمال العملية
          setTimeout(() => {
            // مسح الأنماط المحددة
            patterns.forEach(pattern => {
              const count = cache.invalidatePattern(pattern);
              if (count > 0) {
                businessLogger.debug(`Invalidated cache pattern: ${pattern}`, { count });
              }
            });

            // مسح الكاش العام للمستخدم
            if (req.user && req.user.id) {
              const userPatterns = [
                `*:${req.user.id}:*`,
                `user:${req.user.id}`,
                `user:complete:${req.user.id}`,
                `dashboard:${req.user.id}`
              ];

              userPatterns.forEach(pattern => {
                cache.del(pattern);
                cache.invalidatePattern(pattern);
              });

              businessLogger.debug(`Invalidated user cache: ${req.user.id}`);
            }

            businessLogger.info(`Cache invalidated for ${req.method} ${req.originalUrl}`);
          }, 100);
        }
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * @desc    الحصول على إحصائيات الكاش
 */
const getCacheStats = (req, res) => {
  const stats = cache.getStats();
  const info = cache.getCacheInfo();

  res.json({
    success: true,
    data: {
      ...info,
      details: stats,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date()
    }
  });
};

/**
 * @desc    مسح الكاش يدوياً
 */
const clearCache = (req, res) => {
  const { pattern, key } = req.body;

  let result;

  if (key) {
    const deleted = cache.del(key);
    result = {
      action: 'delete_key',
      key,
      deleted
    };
  } else if (pattern) {
    const clearedCount = cache.invalidatePattern(pattern);
    result = {
      action: 'clear_pattern',
      pattern,
      clearedCount
    };
  } else {
    const clearedKeys = cache.flush();
    result = {
      action: 'flush_all',
      clearedKeys
    };
  }

  businessLogger.info('Manual cache clear', result);

  res.json({
    success: true,
    message: 'Cache cleared successfully',
    data: result,
    timestamp: new Date()
  });
};

module.exports = {
  cacheMiddleware,
  noCache,
  cacheResponse,
  invalidateCacheOnMutation,
  getCacheStats,
  clearCache,
  cacheLogger: cacheMiddleware
};