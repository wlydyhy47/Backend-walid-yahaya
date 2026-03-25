// ============================================
// ملف: src/middlewares/security.middleware.js
// الوصف: ميدلوير الأمان الإضافية
// ============================================

/**
 * إضافة رؤوس أمان إضافية
 */
exports.securityHeaders = (req, res, next) => {
  // منع تسريب معلومات الخادم
  res.removeHeader('X-Powered-By');
  
  // إضافة رؤوس أمان إضافية
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Cache Control للمسارات المحمية
  if (req.path.includes('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
  
  next();
};

/**
 * التحقق من مفتاح API (للخدمات الخارجية)
 */
exports.apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;
  
  // إذا كان المسار عام أو يحتوي على استثناءات
  const publicPaths = ['/health', '/api-docs', '/swagger.json'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  if (apiKey && apiKey === validApiKey) {
    return next();
  }
  
  res.status(401).json({
    success: false,
    message: 'API key is required or invalid'
  });
};

/**
 * منع هجمات SQL Injection و XSS
 */
exports.sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj) return obj;
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // إزالة HTML tags
        obj[key] = value.replace(/<[^>]*>/g, '');
        // إزالة SQL Injection patterns
        obj[key] = obj[key].replace(/['";\\-]/g, '');
      } else if (typeof value === 'object' && value !== null) {
        sanitize(value);
      }
    }
    return obj;
  };
  
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
};