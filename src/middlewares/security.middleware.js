const { AppError } = require('./errorHandler.middleware');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

/**
 * Middleware لحماية التطبيق من هجمات XSS
 */
const xssProtection = (req, res, next) => {
  try {
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          req.body[key] = xss(req.body[key], {
            whiteList: {}, // لا تسمح بأي tags
            stripIgnoreTag: true, // إزالة جميع tags
            stripIgnoreTagBody: ['script'] // إزالة محتوى script tags
          });
        }
      });
    }
    
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = xss(req.query[key]);
        }
      });
    }
    
    if (req.params) {
      Object.keys(req.params).forEach(key => {
        if (typeof req.params[key] === 'string') {
          req.params[key] = xss(req.params[key]);
        }
      });
    }
    
    next();
  } catch (error) {
    next(new AppError('XSS protection failed', 400));
  }
};

/**
 * Middleware لمنع هجمات NoSQL injection
 */
const nosqlInjectionProtection = (req, res, next) => {
  try {
    mongoSanitize.sanitize(req.body);
    mongoSanitize.sanitize(req.query);
    mongoSanitize.sanitize(req.params);
    
    next();
  } catch (error) {
    next(new AppError('NoSQL injection protection failed', 400));
  }
};

/**
 * Middleware لمنع parameter pollution
 */
const parameterPollutionProtection = hpp({
  whitelist: [
    'page',
    'limit',
    'sort',
    'fields',
    'search',
    'type',
    'category',
    'minPrice',
    'maxPrice',
    'minRating',
    'status'
  ]
});

/**
 * Rate limiting مخصص للتطبيق
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: {
      success: false,
      message: "Too many requests from this IP, please try again later"
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      return req.ip + ':' + (req.user?.id || 'anonymous');
    }
  };
  
  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * Rate limiters مختلفة لأنواع مختلفة من الطلبات
 */
const rateLimiters = {
  // للتسجيل والدخول
  auth: createRateLimiter({
    windowMs: 60 * 60 * 1000, // ساعة واحدة
    max: 5, // 5 محاولات فقط
    message: {
      success: false,
      message: "Too many login attempts, please try again after an hour"
    },
    skipSuccessfulRequests: true
  }),
  
  // لإنشاء الطلبات
  orders: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 20, // 20 طلب كل 15 دقيقة
    message: {
      success: false,
      message: "Too many orders, please wait before creating more"
    }
  }),
  
  // للرفع
  upload: createRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 دقائق
    max: 20, // 20 ملف في 10 دقائق
    message: {
      success: false,
      message: "Too many file uploads, please try again later"
    }
  }),
  
  // للـ API العامة
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: {
      success: false,
      message: "Too many API requests, please try again later"
    }
  }),
  
  // للبحث
  search: createRateLimiter({
    windowMs: 60 * 1000, // دقيقة واحدة
    max: 30, // 30 طلب بحث في الدقيقة
    message: {
      success: false,
      message: "Too many search requests, please slow down"
    }
  })
};

/**
 * Middleware للتحقق من أصل الطلب (CORS)
 */
const corsProtection = (req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://fooddelivery.com',
    'https://www.fooddelivery.com',
    process.env.CLIENT_URL
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 ساعة
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
};

/**
 * Middleware للتحقق من نوع المحتوى
 */
const contentTypeValidation = (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.headers['content-type'];
    
    if (!contentType || !contentType.includes('application/json')) {
      if (contentType && contentType.includes('multipart/form-data')) {
        // مسموح لرفع الملفات
        return next();
      }
      return next(new AppError('Content-Type must be application/json', 415));
    }
  }
  
  next();
};

/**
 * Middleware لمنع MIME type sniffing
 */
const noSniff = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

/**
 * Middleware لمنع clickjacking
 */
const antiClickjacking = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
};

/**
 * Middleware لمنع XSS عبر المتصفح
 */
const xssBrowserProtection = (req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

/**
 * Middleware للتحقق من حجم الطلب
 */
const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const maxSizeInMB = parseInt(maxSize);
      
      if (sizeInMB > maxSizeInMB) {
        return next(new AppError(`Request size exceeds ${maxSize} limit`, 413));
      }
    }
    
    next();
  };
};

/**
 * Middleware للتحقق من user agent
 */
const userAgentValidation = (req, res, next) => {
  const userAgent = req.headers['user-agent'];
  
  if (!userAgent) {
    return next(new AppError('User-Agent header is required', 400));
  }
  
  // يمكن إضافة مزيد من التحقق هنا
  const blockedAgents = [
    'curl',
    'wget',
    'python-requests',
    'go-http-client',
    'java'
  ];
  
  const isBlocked = blockedAgents.some(agent => 
    userAgent.toLowerCase().includes(agent)
  );
  
  if (isBlocked && process.env.NODE_ENV === 'production') {
    return next(new AppError('Access denied for this user agent', 403));
  }
  
  next();
};

/**
 * Middleware للتحقق من referrer
 */
const referrerValidation = (req, res, next) => {
  const referrer = req.headers.referer || req.headers.referrer;
  
  if (referrer && process.env.NODE_ENV === 'production') {
    const allowedDomains = [
      'fooddelivery.com',
      'www.fooddelivery.com',
      'localhost:3000',
      'localhost:3001'
    ];
    
    const isAllowed = allowedDomains.some(domain => 
      referrer.includes(domain)
    );
    
    if (!isAllowed) {
      console.warn(`Blocked request from unauthorized referrer: ${referrer}`);
      return next(new AppError('Access denied', 403));
    }
  }
  
  next();
};

/**
 * Middleware شامل للأمان
 */
const securityMiddleware = (app) => {
  // Helmet للحماية الأساسية
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        connectSrc: ["'self'", "ws://localhost:3000"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" }
  }));
  
  // CORS protection
  app.use(corsProtection);
  
  // NoSQL injection protection
  app.use(nosqlInjectionProtection);
  
  // XSS protection
  app.use(xssProtection);
  
  // Parameter pollution protection
  app.use(parameterPollutionProtection);
  
  // Request size limit
  app.use(requestSizeLimit('10mb'));
  
  // Content type validation
  app.use(contentTypeValidation);
  
  // Additional security headers
  app.use(noSniff);
  app.use(antiClickjacking);
  app.use(xssBrowserProtection);
  
  // User agent validation (في الإنتاج فقط)
  if (process.env.NODE_ENV === 'production') {
    app.use(userAgentValidation);
    app.use(referrerValidation);
  }
  
  console.log('✅ Security middleware initialized');
};

module.exports = {
  securityMiddleware,
  rateLimiters,
  xssProtection,
  nosqlInjectionProtection,
  corsProtection,
  contentTypeValidation,
  requestSizeLimit,
  userAgentValidation,
  referrerValidation
};