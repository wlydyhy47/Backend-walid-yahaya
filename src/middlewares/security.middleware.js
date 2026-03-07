const { AppError } = require('./errorHandler.middleware');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const Redis = require('ioredis');

// تهيئة Redis للتخزين الموزع
let redisClient;
try {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
  console.log('✅ Redis connected for rate limiting');
} catch (error) {
  console.warn('⚠️ Redis not available, using memory store');
}

/**
 * Middleware لحماية التطبيق من هجمات XSS (محسّن)
 */
const xssProtection = (req, res, next) => {
  try {
    // تنظيف عميق لجميع المدخلات
    const sanitizeDeep = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
          // إزالة أي أكواد JavaScript ضارة
          obj[key] = obj[key]
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/onerror=/gi, '')
            .replace(/onload=/gi, '')
            .replace(/onclick=/gi, '')
            .replace(/onmouseover=/gi, '')
            .trim();
        } else if (typeof obj[key] === 'object') {
          sanitizeDeep(obj[key]);
        }
      });
    };

    sanitizeDeep(req.body);
    sanitizeDeep(req.query);
    sanitizeDeep(req.params);
    
    next();
  } catch (error) {
    next(new AppError('XSS protection failed', 400));
  }
};

/**
 * Middleware لمنع هجمات NoSQL injection (محسّن)
 */
const nosqlInjectionProtection = (req, res, next) => {
  try {
    // تنظيف متقدم للـ NoSQL injection
    const sanitizeNoSQL = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        // الكشف عن محاولات NoSQL injection
        if (typeof obj[key] === 'object') {
          if (obj[key] && ('$where' in obj[key] || '$regex' in obj[key] || 
              '$ne' in obj[key] || '$gt' in obj[key] || '$lt' in obj[key])) {
            console.warn(`⚠️ NoSQL injection attempt detected on field: ${key}`);
            delete obj[key];
          } else {
            sanitizeNoSQL(obj[key]);
          }
        }
      });
    };

    sanitizeNoSQL(req.body);
    sanitizeNoSQL(req.query);
    sanitizeNoSQL(req.params);
    
    // استخدام المكتبة القياسية أيضاً
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
 * Rate limiting مخصص للتطبيق مع Redis (محسّن)
 */
// src/middlewares/security.middleware.js - الجزء المعدل (السطر 115-140)

/**
 * Rate limiting مخصص للتطبيق مع Redis (محسّن)
 */
const createRateLimiter = (options = {}) => {
  // ✅ استخدام try/catch للتعامل مع RedisStore بشكل صحيح
  let store;
  
  if (redisClient) {
    try {
      const { RedisStore } = require('rate-limit-redis');
      store = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix: 'rl:'
      });
      console.log('✅ RedisStore initialized in security middleware');
    } catch (error) {
      console.warn('⚠️ RedisStore not available in security middleware:', error.message);
      store = undefined; // سيستخدم memory store
    }
  }

  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: {
      success: false,
      message: "طلبات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة",
      code: "RATE_LIMIT_EXCEEDED"
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    store, // قد يكون undefined، فيستخدم memory store
    keyGenerator: (req) => {
      // استخدام معرف المستخدم إذا كان مسجلاً، وإلا استخدام IP
      return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    },
    handler: (req, res) => {
      const retryAfter = Math.ceil(options.windowMs / 1000 / 60);
      res.status(429).json({
        success: false,
        message: options.message?.message || 'طلبات كثيرة جداً',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: `${retryAfter} دقيقة`,
        timestamp: new Date().toISOString()
      });
    }
  };
  
  return rateLimit({ ...defaultOptions, ...options });
}; 

/**
 * Rate limiters مختلفة لأنواع مختلفة من الطلبات (محسّنة)
 */
const rateLimiters = {
  // للتسجيل والدخول
  auth: createRateLimiter({
    windowMs: 60 * 60 * 1000, // ساعة واحدة
    max: 10, // 10 محاولات فقط (زيادة من 5)
    message: {
      success: false,
      message: "محاولات تسجيل دخول كثيرة جداً، الرجاء المحاولة بعد ساعة",
      code: "AUTH_RATE_LIMIT"
    },
    skipSuccessfulRequests: true
  }),
  
  // صارم جداً لنسيان كلمة المرور
  strict: createRateLimiter({
    windowMs: 24 * 60 * 60 * 1000, // 24 ساعة
    max: 3, // 3 محاولات فقط في اليوم
    message: {
      success: false,
      message: "لقد تجاوزت الحد المسموح من المحاولات لهذا اليوم",
      code: "STRICT_RATE_LIMIT"
    },
    skipSuccessfulRequests: true
  }),
  
  // لإنشاء الطلبات
  orders: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 20, // 20 طلب كل 15 دقيقة
    message: {
      success: false,
      message: "طلبات كثيرة جداً، الرجاء الانتظار قبل إنشاء المزيد",
      code: "ORDERS_RATE_LIMIT"
    }
  }),
  
  // للرفع
  upload: createRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 دقائق
    max: 20, // 20 ملف في 10 دقائق
    message: {
      success: false,
      message: "رفعت ملفات كثيرة جداً، الرجاء المحاولة بعد 10 دقائق",
      code: "UPLOAD_RATE_LIMIT"
    }
  }),
  
  // للـ API العامة
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: {
      success: false,
      message: "طلبات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة",
      code: "API_RATE_LIMIT"
    }
  }),
  
  // للبحث
  search: createRateLimiter({
    windowMs: 60 * 1000, // دقيقة واحدة
    max: 30, // 30 طلب بحث في الدقيقة
    message: {
      success: false,
      message: "طلبات بحث كثيرة جداً، الرجاء التهدئة قليلاً",
      code: "SEARCH_RATE_LIMIT"
    }
  })
};

/**
 * Middleware للتحقق من أصل الطلب (CORS) - محسّن
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
  
  // السماح بالطلبات من نفس المصدر حتى لو لم يكن في القائمة
  if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 ساعة
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
};

/**
 * Middleware للتحقق من نوع المحتوى - محسّن
 */
const contentTypeValidation = (req, res, next) => {
  // تجاهل طرق GET و OPTIONS
  if (['GET', 'OPTIONS', 'HEAD', 'DELETE'].includes(req.method)) {
    return next();
  }
  
  const contentType = req.headers['content-type'];
  
  if (!contentType) {
    return next(new AppError('Content-Type header مطلوب', 415));
  }
  
  // السماح لـ multipart/form-data (لرفع الملفات)
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  
  // التحقق من أن المحتوى JSON للطرق التي ترسل بيانات
  if (!contentType.includes('application/json')) {
    return next(new AppError('Content-Type must be application/json', 415));
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
 * Middleware للتحقق من حجم الطلب - محسّن
 */
const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    // تجاهل طرق معينة
    if (['GET', 'OPTIONS', 'DELETE'].includes(req.method)) {
      return next();
    }
    
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const maxSizeInMB = parseInt(maxSize);
      
      if (sizeInMB > maxSizeInMB) {
        return next(new AppError(`حجم الطلب يتجاوز الحد المسموح به (${maxSize})`, 413));
      }
    }
    
    next();
  };
};

/**
 * Middleware للتحقق من user agent - محسّن
 */
const userAgentValidation = (req, res, next) => {
  const userAgent = req.headers['user-agent'];
  
  // في الإنتاج، نتحقق من وجود User-Agent
  if (process.env.NODE_ENV === 'production' && !userAgent) {
    return next(new AppError('User-Agent header مطلوب', 400));
  }

  // حظر بعض الـ User-Agents الضارة
  const blockedAgents = [
    'curl',
    'wget',
    'python-requests',
    'go-http-client',
    'java',
    'scrapy',
    'nikto',
    'nmap'
  ];
  
  if (userAgent) {
    const isBlocked = blockedAgents.some(agent => 
      userAgent.toLowerCase().includes(agent)
    );
    
    if (isBlocked && process.env.NODE_ENV === 'production') {
      console.warn(`🚫 Blocked request from ${userAgent}`);
      return next(new AppError('Access denied for this user agent', 403));
    }
  }
  
  next();
};

/**
 * Middleware للتحقق من referrer - محسّن
 */
const referrerValidation = (req, res, next) => {
  const referrer = req.headers.referer || req.headers.referrer;
  
  if (referrer && process.env.NODE_ENV === 'production') {
    const allowedDomains = [
      'fooddelivery.com',
      'www.fooddelivery.com',
      'localhost:3000',
      'localhost:3001',
      process.env.CLIENT_URL
    ].filter(Boolean).map(domain => domain.replace(/https?:\/\//, ''));
    
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
 * Middleware شامل للأمان (محسّن)
 */
const securityMiddleware = (app) => {
  // Helmet للحماية الأساسية (محدث)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
        connectSrc: ["'self'", "ws://localhost:3000", process.env.CLIENT_URL].filter(Boolean),
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
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