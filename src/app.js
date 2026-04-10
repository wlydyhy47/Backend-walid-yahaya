// ============================================
// ملف: src/app.js
// الوصف: التطبيق الرئيسي - منظم بالكامل مع أفضل الممارسات
// الإصدار: 3.0.0
// التاريخ: 2026-03-25
// ============================================

const express = require("express");
const path = require('path');
const cors = require("cors");
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// ✅ استيراد الإعدادات
const apiConfig = require('./config/api.config');

// ✅ استيراد المسارات المجمعة
const apiRoutes = require('./routes/api');

// ✅ استيراد الميدلوير
const rateLimiters = require('./middlewares/rateLimit.middleware');
const { cacheMiddleware } = require("./middlewares/cache.middleware");
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler.middleware');
const { httpLogger, errorLogger } = require('./utils/logger.util');
const performanceService = require('./services/performance.service');

// ✅ استيراد التوثيق
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger/swagger.config');
// ✅ استيراد الأدوات المساعدة
const cache = require('./utils/cache.util');
const { securityHeaders } = require('./middlewares/security.middleware');

const app = express();

// ========== 1. إعدادات البيئة ==========
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 3000;
const API_PREFIX = apiConfig.api.prefix;
const API_VERSION = apiConfig.api.defaultVersion;
const BASE_PATH = `/${API_PREFIX}/${API_VERSION}`;

console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Food Delivery API Server Starting...                 ║
║   📦 Version: 3.0.0                                       ║
║   🌍 Environment: ${process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT'}                              ║
║   🔧 API Base: ${BASE_PATH}                               ║
║   📚 Docs: /api-docs                                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

// ========== 2. إعدادات CORS المحسنة ==========
const corsOptions = {
  origin: isProduction 
    ? [process.env.FRONTEND_URL, 'https://api.fooddelivery.com'].filter(Boolean)
    : true,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key', 'X-Device-Id'],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Limit', 'X-Rate-Limit-Remaining']
};

app.use(cors(corsOptions));

// إضافة رؤوس CORS إضافية
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (corsOptions.origin === true || corsOptions.origin.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
    res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
    res.header('Access-Control-Expose-Headers', corsOptions.exposedHeaders.join(', '));
  }
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ========== 3. MIDDLEWARES الأساسية ==========

// Trust Proxy (لـ Nginx, Heroku, etc.)
app.set('trust proxy', 1);

// Body Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Compression
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));

// Custom Security Headers
app.use(securityHeaders);

// Logging
if (!isProduction) {
  app.use(morgan('dev'));
}
app.use(httpLogger);

// Performance Monitoring
app.use(performanceService.measureRequest());

// Cache Middleware
app.use(cacheMiddleware);

// ========== 4. الملفات الثابتة ==========

// تكوين الملفات الثابتة
const staticOptions = {
  maxAge: isProduction ? '30d' : '1d',
  immutable: true,
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'public, max-age=2592000');
    
    // تعيين نوع المحتوى المناسب
    if (path.endsWith('.svg')) {
      res.header('Content-Type', 'image/svg+xml');
    } else if (path.endsWith('.ico')) {
      res.header('Content-Type', 'image/x-icon');
    }
  }
};

app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/images', express.static(path.join(__dirname, 'public/images'), staticOptions));
app.use('/icons', express.static(path.join(__dirname, 'public/icons'), staticOptions));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));

// ========== 5. Rate Limiting المُحسن ==========

// تطبيق Rate Limiting حسب المسارات
const rateLimitConfig = [
  { path: `/api/${API_PREFIX}/${API_VERSION}/public/auth`, limiter: rateLimiters.authLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/public/auth/forgot-password`, limiter: rateLimiters.strictLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/public/auth/reset-password`, limiter: rateLimiters.strictLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/map/driver/location`, limiter: rateLimiters.apiLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/map/geocode`, limiter: rateLimiters.searchLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/search`, limiter: rateLimiters.searchLimiter },
  { path: '/api/uploads', limiter: rateLimiters.uploadLimiter }
];

rateLimitConfig.forEach(({ path, limiter }) => {
  app.use(path, limiter);
});

// Rate Limiting عام لجميع مسارات API
app.use(`/api/${API_PREFIX}/${API_VERSION}`, rateLimiters.apiLimiter);

// ========== 6. Swagger Documentation ==========

// تكوين Swagger UI
const swaggerOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { background-color: #2c3e50; display: block; }
    .swagger-ui .topbar .download-url-wrapper .select-label select { border-color: #2c3e50; }
    .swagger-ui .info .title { color: #2c3e50; }
    .swagger-ui .scheme-container { background: #f8f9fa; }
    .swagger-ui .btn.authorize { border-color: #2c3e50; color: #2c3e50; }
    .swagger-ui .btn.authorize svg { fill: #2c3e50; }
  `,
  customSiteTitle: "Food Delivery API - التوثيق التفاعلي",
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'none',
    filter: true,
    displayRequestDuration: true,
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    tryItOutEnabled: true,
    syntaxHighlight: {
      activate: true,
      theme: 'monokai'
    }
  }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { background-color: #2c3e50; }
    .swagger-ui .info .title { color: #2c3e50; }
    .swagger-ui .btn.authorize { border-color: #2c3e50; color: #2c3e50; }
  `,
  customSiteTitle: "Food Delivery API - توثيق المسارات",
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'none',
    filter: true,
    displayRequestDuration: true,
    tryItOutEnabled: true
  }
}));
// نقطة نهاية JSON
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

app.get('/swagger.yaml', (req, res) => {
  const yaml = require('js-yaml');
  res.setHeader('Content-Type', 'text/yaml');
  res.send(yaml.dump(swaggerSpecs));
});

// ========== 7. مسارات الملفات الثابتة ==========

// Favicon
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/icons/favicon.ico'));
});

// Logo
app.get('/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/images/logo.png'));
});

// Robots.txt
app.get('/robots.txt', (req, res) => {
  const robotsTxt = isProduction 
    ? 'User-agent: *\nAllow: /\nSitemap: https://api.fooddelivery.com/sitemap.xml'
    : 'User-agent: *\nDisallow: /';
  res.type('text/plain');
  res.send(robotsTxt);
});

// ========== 8. المسار الرئيسي ==========

/**
 * @swagger
 * /:
 *   get:
 *     summary: معلومات API
 *     tags: [🚀 API]
 *     responses:
 *       200:
 *         description: معلومات الإصدار والمسارات المتاحة
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 version:
 *                   type: string
 *                 documentation:
 *                   type: string
 *                 baseUrl:
 *                   type: string
 */
app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "Food Delivery API is running ✅", 
    version: "3.0.0",
    environment: process.env.NODE_ENV || 'development',
    documentation: "/api-docs",
    health: "/health",
    swaggerJson: "/swagger.json",
    baseUrl: BASE_PATH,
    endpoints: {
      auth: `${BASE_PATH}/auth`,
      public: `${BASE_PATH}/public`,
      client: `${BASE_PATH}/client`,
      vendor: `${BASE_PATH}/vendor`,
      driver: `${BASE_PATH}/driver`,
      admin: `${BASE_PATH}/admin`,
      map: `${BASE_PATH}/map`,
      chat: `${BASE_PATH}/chat`,
      orders: `${BASE_PATH}/orders`
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ========== 9. المسارات المجمعة ==========
app.use(BASE_PATH, apiRoutes);

// ========== 10. Health Check Endpoints ==========

/**
 * @swagger
 * /health:
 *   get:
 *     summary: فحص صحة النظام
 *     tags: [🏥 Health]
 *     responses:
 *       200:
 *         description: النظام يعمل بشكل طبيعي
 */
app.get('/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    service: 'Food Delivery API',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: فحص صحة النظام بالتفصيل
 *     tags: [🏥 Health]
 *     responses:
 *       200:
 *         description: تفاصيل حالة النظام
 */
app.get('/health/detailed', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const redis = require('redis');
    
    const health = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      },
      services: {
        database: {
          status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          name: mongoose.connection.name || 'unknown'
        },
        redis: { status: 'unknown' },
        api: { status: 'running' }
      }
    };
    
    // فحص Redis
    try {
      const client = redis.createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.ping();
      health.services.redis.status = 'connected';
      await client.quit();
    } catch (error) {
      health.services.redis.status = 'disconnected';
      health.services.redis.error = error.message;
    }
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ========== 11. Cache Monitoring (غير الإنتاج) ==========

if (isDevelopment) {
  /**
   * @swagger
   * /api/cache-stats:
   *   get:
   *     summary: إحصائيات الكاش (للتطوير فقط)
   *     tags: [🔧 Development]
   */
  app.get('/api/cache-stats', (req, res) => {
    const stats = cache.getStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date()
    });
  });
  
  // تنظيف الكاش التلقائي
  setInterval(() => {
    const cleaned = cache.smartCleanup(2, 24);
    if (cleaned > 0) {
      console.log(`🧹 Smart cache cleanup: ${cleaned} keys removed`);
    }
  }, 60 * 60 * 1000);
}

// ========== 12. مسارات الاختبار (للتطوير فقط) ==========

if (isDevelopment) {
  /**
   * @swagger
   * /test-routes:
   *   get:
   *     summary: اختبار المسارات (للتطوير فقط)
   *     tags: [🔧 Development]
   */
  app.get('/test-routes', (req, res) => {
    res.json({
      success: true,
      message: 'Test route is working',
      environment: 'development',
      baseUrl: BASE_PATH,
      routes: {
        root: '/',
        api: '/api',
        apiV1: BASE_PATH,
        auth: {
          login: `${BASE_PATH}/auth/login`,
          register: `${BASE_PATH}/auth/register`,
          logout: `${BASE_PATH}/auth/logout`,
          validate: `${BASE_PATH}/auth/validate`,
          refresh: `${BASE_PATH}/auth/refresh`
        },
        public: `${BASE_PATH}/public`,
        admin: `${BASE_PATH}/admin`,
        client: `${BASE_PATH}/client`,
        driver: `${BASE_PATH}/driver`,
        vendor: `${BASE_PATH}/vendor`,
        map: `${BASE_PATH}/map`,
        chat: `${BASE_PATH}/chat`,
        orders: `${BASE_PATH}/orders`,
        health: '/health',
        docs: '/api-docs'
      },
      timestamp: new Date().toISOString()
    });
  });
  
  // مسار لفحص المتغيرات البيئية (آمن للتطوير)
  app.get('/api/env-check', (req, res) => {
    const safeEnv = {
      NODE_ENV: process.env.NODE_ENV,
      API_VERSION: API_VERSION,
      PORT: PORT,
      MONGODB_DATABASE: process.env.MONGODB_DATABASE
    };
    res.json({ success: true, environment: safeEnv });
  });
}

// ========== 13. Error Handling ==========

// 404 Handler
app.use(notFoundHandler);

// Error Logger
app.use(errorLogger);

// Global Error Handler
app.use(errorHandler);

// Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // في الإنتاج، قد ترغب في إرسال تنبيه
  if (isProduction) {
    // إرسال إلى خدمة مراقبة مثل Sentry
    // Sentry.captureException(reason);
  }
});

// Uncaught Exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  if (isProduction) {
    // إرسال إلى خدمة مراقبة
    // Sentry.captureException(error);
    // إغلاق التطبيق بشكل آمن
    process.exit(1);
  }
});

// ========== 14. تصدير التطبيق ==========

module.exports = app;

// ========== 15. معلومات بدء التشغيل ==========
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   ✅ Server started successfully!                         ║
║   📍 URL: http://localhost:${PORT}                         ║
║   📚 Docs: http://localhost:${PORT}/api-docs               ║
║   🏥 Health: http://localhost:${PORT}/health               ║
║   🔧 Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   📦 API Base: ${BASE_PATH}                               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
  
  // Graceful Shutdown
  const gracefulShutdown = () => {
    console.log('\n🛑 Received shutdown signal, closing server...');
    server.close(() => {
      console.log('✅ Server closed successfully');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⚠️ Force closing server after timeout');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}