const cache = require('../utils/cache.util');

/**
 * Middleware لتسجيل معلومات الكاش في الاستجابة
 */
const cacheMiddleware = (req, res, next) => {
  // ✅ تجاهل الملفات الثابتة
  // ✅ تجاهل الملفات الثابتة ولكن نسمح لها بالمرور
    if (req.path.startsWith('/public/') ||
        req.path.startsWith('/images/') ||
        req.path.startsWith('/icons/') ||
        req.path === '/logo.png' ||
        req.path === '/favicon.ico' ||
        req.path.match(/\.(png|jpg|jpeg|gif|ico|svg|css|js|webp|avif|woff|woff2|ttf)$/)) {
        
        // نسمح للملفات بالمرور ولكن لا نطبق عليها معالجة الكاش
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 ساعة
        return next();
    }

    
  // ✅ إذا كان هناك skipCache, تجاهل الكاش
  if (req.skipCache) {
    return next();
  }
  const originalJson = res.json;
  const originalSend = res.send;

  res.json = function (data) {
    if (data && typeof data === 'object') {
      const cacheKey = cache.generateKey(req);
      const isCached = cache.has(cacheKey);

      // إضافة metadata فقط إذا لم تكن موجودة بالفعل
      if (!data.metadata) {
        data.metadata = {};
      }

      data.metadata.cacheInfo = {
        cached: isCached,
        key: cacheKey,
        timestamp: new Date().toISOString(),
        ttl: cache.cache.options.stdTTL || 300
      };
    }

    return originalJson.call(this, data);
  };

  res.send = function (data) {
    // التحقق إذا كان JSON
    try {
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
          ttl: cache.cache.options.stdTTL || 300
        };

        data = JSON.stringify(parsed);
      }
    } catch (error) {
      // ليس JSON، تجاهل
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Middleware لمنع التخزين في الكاش
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
 * Middleware لتفعيل الكاش للمسارات المحددة
 */
const cacheResponse = (ttl = 300) => {
  return (req, res, next) => {
    // التحقق من طرق HTTP التي يجب عدم تخزينها
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
      return next();
    }

    const cacheKey = cache.generateKey(req);
    const cachedData = cache.get(cacheKey);

    if (cachedData !== undefined && cachedData !== null) {
      console.log(`📦 Serving from cache: ${cacheKey}`);

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
        // فقط تخزين الردود الناجحة
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // التحقق من عدم وجود noCache flag
          if (!res.locals.noCache) {
            cache.set(cacheKey, data, ttl);
          }
        }
      } catch (error) {
        console.error('❌ Cache set error:', error.message);
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Middleware لمسح الكاش عند الطلبات التي تعدل البيانات
 */
const invalidateCacheOnMutation = (patterns = []) => {
  return (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const method = req.method.toUpperCase();

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          // تأخير إبطال الكاش لضمان اكتمال العملية
          setTimeout(() => {
            // مسح الأنماط المحددة
            patterns.forEach(pattern => {
              cache.invalidatePattern(pattern);
            });

            // مسح الكاش العام للمستخدم
            if (req.user && req.user.id) {
              cache.invalidatePattern(`*:${req.user.id}:*`);
              cache.invalidatePattern(`*:${req.user.id}`);
              cache.del(`user:${req.user.id}`);
              cache.del(`user:complete:${req.user.id}`);
              cache.del(`dashboard:${req.user.id}`);
            }

            console.log(`🗑️ Invalidated cache for ${req.method} ${req.originalUrl}`);
          }, 100);
        }
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

module.exports = {
  cacheMiddleware,
  noCache,
  cacheResponse,
  invalidateCacheOnMutation,
  cacheLogger: cacheMiddleware // للحفاظ على التوافق
};