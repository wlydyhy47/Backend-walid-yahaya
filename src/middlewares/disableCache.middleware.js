// ============================================
// ملف: src/middlewares/disableCache.middleware.js (محدث)
// الوصف: تعطيل التخزين المؤقت لمسارات محددة
// ============================================

const { businessLogger } = require("../utils/logger.util");

/**
 * @desc    تعطيل الكاش للاستجابة
 */
const disableCache = (req, res, next) => {
  // تعطيل الكاش
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // إضافة headers إضافية للأمان
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // إشارة إلى تعطيل الكاش
  res.locals.noCache = true;

  // تسجيل للمسارات التي يتم تعطيل الكاش فيها (اختياري)
  if (process.env.NODE_ENV === 'development') {
    businessLogger.debug(`Cache disabled for: ${req.method} ${req.originalUrl}`);
  }

  next();
};

/**
 * @desc    تعطيل الكاش مع فترة محددة
 */
const disableCacheWithExpiry = (expirySeconds = 0) => {
  return (req, res, next) => {
    if (expirySeconds > 0) {
      res.setHeader('Cache-Control', `private, max-age=${expirySeconds}`);
    } else {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.locals.noCache = true;
    
    next();
  };
};

/**
 * @desc    تعطيل الكاش لمسارات معينة فقط
 */
const disableCacheForPaths = (paths = []) => {
  return (req, res, next) => {
    if (paths.some(path => req.path.includes(path))) {
      return disableCache(req, res, next);
    }
    next();
  };
};

/**
 * @desc    تمكين الكاش مع فترة محددة
 */
const enableCache = (maxAge = 3600) => {
  return (req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.setHeader('Pragma', 'cache');
    res.locals.noCache = false;
    next();
  };
};

module.exports = disableCache;
module.exports.disableCacheWithExpiry = disableCacheWithExpiry;
module.exports.disableCacheForPaths = disableCacheForPaths;
module.exports.enableCache = enableCache;