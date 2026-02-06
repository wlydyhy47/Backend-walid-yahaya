const rateLimit = require('express-rate-limit');

// Rate limiter للـ API العامة
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // 100 طلب لكل IP
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter أكثر تشدداً للـ authentication
exports.authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة واحدة
  max: 50, // 5 محاولات تسجيل دخول فقط
  message: {
    success: false,
    message: "Too many login attempts, please try again after an hour"
  },
  skipSuccessfulRequests: true,
});

// Rate limiter للإشعارات
exports.notificationLimiter = rateLimit({
  windowMs: 60 * 1000, // دقيقة واحدة
  max: 10, // 10 إشعارات في الدقيقة
  message: {
    success: false,
    message: "Too many notification requests"
  }
});

// Rate limiter للـ Upload
exports.uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 دقائق
  max: 20, // 20 ملف في 10 دقائق
  message: {
    success: false,
    message: "Too many file uploads, please try again later"
  }
});