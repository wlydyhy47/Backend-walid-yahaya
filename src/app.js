// ============================================
// ملف: src/app.js
// الوصف: التطبيق الرئيسي - منظم بالكامل مع أفضل الممارسات
// الإصدار: 3.0.0
// التاريخ: 2026-03-25
// ============================================

const express = require("express");
const path = require('path');
const fs = require('fs');
const cors = require("cors");
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const yaml = require('js-yaml');

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
let autoSwaggerDoc = {};

// محاولة تحميل التوثيق التلقائي
try {
  const autoSwaggerPath = path.join(__dirname, './config/swagger/auto-docs/swagger.auto.json');
  if (fs.existsSync(autoSwaggerPath)) {
    autoSwaggerDoc = require(autoSwaggerPath);
    console.log('✅ Auto Swagger documentation loaded');
  } else {
    console.warn('⚠️ Auto Swagger file not found. Run `npm run swagger:generate` first.');
  }
} catch (error) {
  console.error('❌ Error loading auto swagger:', error.message);
}

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

// عرض معلومات بدء التشغيل
console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Food Delivery API Server Starting...                 ║
║   📦 Version: 3.0.0                                       ║
║   🌍 Environment: ${(process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT').padEnd(30)}║
║   🔧 API Base: ${BASE_PATH.padEnd(42)}║
║   📚 Docs: /api-docs-auto                                 ║
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
  if (origin && (corsOptions.origin === true || corsOptions.origin?.includes(origin))) {
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
  setHeaders: (res, filePath) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'public, max-age=2592000');
    
    // تعيين نوع المحتوى المناسب
    if (filePath.endsWith('.svg')) {
      res.header('Content-Type', 'image/svg+xml');
    } else if (filePath.endsWith('.ico')) {
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
  { path: `/api/${API_PREFIX}/${API_VERSION}/auth`, limiter: rateLimiters.authLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/auth/login`, limiter: rateLimiters.authLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/auth/register`, limiter: rateLimiters.authLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/auth/forgot-password`, limiter: rateLimiters.strictLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/auth/reset-password`, limiter: rateLimiters.strictLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/map/driver/location`, limiter: rateLimiters.apiLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/map/geocode`, limiter: rateLimiters.searchLimiter },
  { path: `/api/${API_PREFIX}/${API_VERSION}/search`, limiter: rateLimiters.searchLimiter },
  { path: '/api/uploads', limiter: rateLimiters.uploadLimiter }
];

rateLimitConfig.forEach(({ path: routePath, limiter }) => {
  app.use(routePath, limiter);
});

// Rate Limiting عام لجميع مسارات API
app.use(`/api/${API_PREFIX}/${API_VERSION}`, rateLimiters.apiLimiter);

// ========== 6. Swagger Documentation ==========

// نقطة نهاية JSON للتوثيق التلقائي
app.get('/swagger-auto.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(autoSwaggerDoc);
});

// نقطة نهاية YAML للتوثيق التلقائي
app.get('/swagger-auto.yaml', (req, res) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.send(yaml.dump(autoSwaggerDoc));
});

// واجهة Swagger UI للتوثيق التلقائي
if (Object.keys(autoSwaggerDoc).length > 0) {
  app.use('/api-docs-auto', swaggerUi.serve, swaggerUi.setup(autoSwaggerDoc, {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { background-color: #2c3e50; }
      .swagger-ui .info .title { color: #2c3e50; }
      .swagger-ui .btn.authorize { border-color: #2c3e50; color: #2c3e50; }
    `,
    customSiteTitle: "Food Delivery API - التوثيق التلقائي",
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      displayRequestDuration: true,
      tryItOutEnabled: true
    }
  }));
}

// نقطة نهاية JSON للتوثيق اليدوي (للتوافق مع الإصدارات السابقة)
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(autoSwaggerDoc);
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
 * @route   GET /
 * @desc    معلومات API
 * @access  Public
 */
app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "Food Delivery API is running ✅", 
    version: "3.0.0",
    environment: process.env.NODE_ENV || 'development',
    documentation: "/api-docs-auto",
    health: "/health",
    swaggerJson: "/swagger-auto.json",
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
 * @route   GET /health
 * @desc    فحص صحة النظام (سريع)
 * @access  Public
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
 * @route   GET /health/detailed
 * @desc    فحص صحة النظام بالتفصيل
 * @access  Public
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

/**
 * @route   GET /health/ready
 * @desc    فحص جاهزية النظام (Readiness Probe)
 * @access  Public
 */
app.get('/health/ready', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const isReady = mongoose.connection.readyState === 1;
    
    if (isReady) {
      res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ ready: false, reason: 'Database not connected' });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

/**
 * @route   GET /health/live
 * @desc    فحص حيوية النظام (Liveness Probe)
 * @access  Public
 */
app.get('/health/live', (req, res) => {
  res.status(200).json({ alive: true, timestamp: new Date().toISOString() });
});

// ========== 11. إحصائيات API ==========

/**
 * @route   GET /api/stats/endpoints
 * @desc    إحصائيات المسارات
 * @access  Public
 */
app.get('/api/stats/endpoints', (req, res) => {
  const stats = {
    totalEndpoints: Object.keys(autoSwaggerDoc.paths || {}).length,
    documentationAvailable: Object.keys(autoSwaggerDoc).length > 0,
    lastGenerated: new Date().toISOString(),
    docsUrl: '/api-docs-auto'
  };
  res.json({ success: true, data: stats });
});

// ========== 12. Cache Monitoring (للتطوير فقط) ==========

if (isDevelopment) {
  /**
   * @route   GET /api/cache-stats
   * @desc    إحصائيات الكاش (للتطوير فقط)
   * @access  Development
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

// ========== 13. مسارات الاختبار (للتطوير فقط) ==========

if (isDevelopment) {
  /**
   * @route   GET /test-routes
   * @desc    اختبار المسارات (للتطوير فقط)
   * @access  Development
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
        docs: '/api-docs-auto'
      },
      timestamp: new Date().toISOString()
    });
  });
  
  /**
   * @route   GET /api/env-check
   * @desc    فحص المتغيرات البيئية (للتطوير فقط)
   * @access  Development
   */
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

// ========== 14. Error Handling ==========

// 404 Handler
app.use(notFoundHandler);

// Error Logger
app.use(errorLogger);

// Global Error Handler
app.use(errorHandler);

// ========== 15. Unhandled Errors ==========

// Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  if (isProduction) {
    // يمكن إضافة إرسال إلى خدمة مراقبة مثل Sentry هنا
    // Sentry.captureException(reason);
  }
});

// Uncaught Exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  if (isProduction) {
    // يمكن إضافة إرسال إلى خدمة مراقبة هنا
    // Sentry.captureException(error);
    process.exit(1);
  }
});

// ========== 16. تصدير التطبيق ==========

module.exports = app;

// ========== 17. بدء التشغيل (إذا كان الملف الرئيسي) ==========
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   ✅ Server started successfully!                         ║
║   📍 URL: http://localhost:${PORT}                         ║
║   📚 Auto Docs: http://localhost:${PORT}/api-docs-auto     ║
║   🏥 Health: http://localhost:${PORT}/health               ║
║   🔧 Environment: ${(process.env.NODE_ENV || 'development').padEnd(30)}║
║   📦 API Base: ${BASE_PATH.padEnd(42)}║
║   📊 Endpoints: ${String(Object.keys(autoSwaggerDoc.paths || {}).length).padEnd(36)}║
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