// ============================================
// ملف: src/app.js (المعدل بالكامل)
// الوصف: التطبيق الرئيسي - يدعم جميع المسارات بما فيها الخرائط
// ============================================

const express = require("express");
const path = require('path');
const cors = require("cors");
const helmet = require('helmet');
const compression = require('compression');

// ✅ استيراد الإعدادات
const apiConfig = require('./config/api.config');

// ✅ استيراد المسارات المجمعة
const apiRoutes = require('./routes/api');

// ✅ استيراد باقي الملفات
const rateLimiters = require('./middlewares/rateLimit.middleware');
const { cacheMiddleware } = require("./middlewares/cache.middleware");
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler.middleware');
const { httpLogger, errorLogger } = require('./utils/logger.util');
const performanceService = require('./services/performance.service');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
const cache = require('./utils/cache.util');

const app = express();

// ========== 1. إعدادات CORS ==========
console.log('🌐 CORS: تم تفعيل الوضع المبسط - السماح بكل شيء');

app.use(cors({
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ========== 2. MIDDLEWARES الأساسية ==========
app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(compression());

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// ========== 3. الملفات الثابتة ==========
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  immutable: true,
  setHeaders: (res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
  }
}));

app.use('/images', express.static(path.join(__dirname, 'public/images'), {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => {
    res.header('Access-Control-Allow-Origin', '*');
  }
}));

app.use('/icons', express.static(path.join(__dirname, 'public/icons'), {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => {
    res.header('Access-Control-Allow-Origin', '*');
  }
}));

// ========== 4. Logging & Performance ==========
app.use(httpLogger);
app.use(performanceService.measureRequest());

// ========== 5. Cache Middleware ==========
app.use(cacheMiddleware);

// ========== 6. Rate Limiting ==========
// المسارات العامة للمصادقة
app.use("/api/v1/public/auth", rateLimiters.authLimiter);
app.use("/api/v1/public/auth/forgot-password", rateLimiters.strictLimiter);
app.use("/api/v1/public/auth/reset-password", rateLimiters.strictLimiter);

// مسارات الخرائط - حد أعلى (لأنها تتطلب تحديثات متكررة)
app.use("/api/v1/map/driver/location", rateLimiters.apiLimiter);
app.use("/api/v1/map/geocode", rateLimiters.searchLimiter);

// مسارات أخرى
app.use("/api/uploads", rateLimiters.uploadLimiter);
app.use("/api/v1", rateLimiters.apiLimiter);

// ========== 7. Swagger Documentation ==========
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "Food Delivery API Docs",
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      displayRequestDuration: true
    }
  }));
}

// ========== 8. مسارات الملفات الثابتة ==========
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/icons/favicon.ico'));
});

app.get('/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/images/logo.png'));
});

// ========== 9. المسار الرئيسي ==========
app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "Food Delivery API is working ✅", 
    version: "2.1.0",
    developer: "WALID YAHAYA",
    documentation: "/api-docs",
    health: "/health",
    baseUrl: `/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}`,
    endpoints: {
      auth: {
        register: "POST /public/auth/register",
        login: "POST /public/auth/login",
        verify: "POST /public/auth/verify",
        forgotPassword: "POST /public/auth/forgot-password",
        resetPassword: "POST /public/auth/reset-password",
        refresh: "POST /public/auth/refresh",
        logout: "POST /public/auth/logout",
        validate: "GET /public/auth/validate"
      },
      public: {
        stores: "GET /public/stores",
        storeDetails: "GET /public/stores/:id",
        home: "GET /public/home",
        search: "GET /public/search",
        stats: "GET /public/stats",
        health: "GET /public/health"
      },
      client: `/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}/client`,
      vendor: `/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}/vendor`,
      driver: `/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}/driver`,
      admin: `/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}/admin`,
      map: `/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}/map`  // ✅ إضافة مسارات الخرائط
    },
    timestamp: new Date().toISOString()
  });
});

// ========== 10. المسارات المجمعة ==========
app.use(`/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}`, apiRoutes);

// ========== 11. Health Check (سريع) ==========
app.get('/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    service: 'Food Delivery API'
  });
});

// ========== 12. Cache Monitoring ==========
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/cache-stats', (req, res) => {
    const stats = cache.getStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date()
    });
  });

  setInterval(() => {
    const cleaned = cache.smartCleanup(2, 24);
    if (cleaned > 0) {
      console.log(`🧹 Smart cache cleanup: ${cleaned} keys removed`);
    }
  }, 60 * 60 * 1000);
}

// ========== 13. Error Handling ==========
app.use(notFoundHandler);
app.use(errorLogger);
app.use(errorHandler);

// ========== 14. مسار اختبار المسارات ==========
app.get('/test-routes', (req, res) => {
  res.json({
    success: true,
    message: 'Test route is working',
    baseUrl: `/api/v1`,
    routes: {
      root: '/',
      api: '/api',
      apiV1: '/api/v1',
      auth: {
        login: '/api/v1/public/auth/login',
        register: '/api/v1/public/auth/register',
        logout: '/api/v1/public/auth/logout',
        validate: '/api/v1/public/auth/validate'
      },
      public: '/api/v1/public',
      admin: '/api/v1/admin',
      client: '/api/v1/client',
      driver: '/api/v1/driver',
      vendor: '/api/v1/vendor',
      map: '/api/v1/map'  // ✅ إضافة مسار اختبار الخرائط
    }
  });
});

module.exports = app;