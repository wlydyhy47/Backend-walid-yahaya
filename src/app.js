// ============================================
// ملف: src/app.js (محدث)
// ============================================

const express = require("express");
const path = require('path');
const cors = require("cors");
const helmet = require('helmet');
const compression = require('compression');

// ✅ استيراد الإعدادات الجديدة
const apiConfig = require('./config/api.config');

// ✅ استيراد المسارات المجمعة
const apiRoutes = require('./routes/api'); // بدلاً من './routes/index'

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
app.use("/api/auth", rateLimiters.authLimiter);
app.use("/api/auth/forgot-password", rateLimiters.strictLimiter);
app.use("/api/auth/reset-password", rateLimiters.strictLimiter);
app.use("/api/uploads", rateLimiters.uploadLimiter);
app.use("/api", rateLimiters.apiLimiter);

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
    message: "Food Delivery API is working ✅", 
    version: "1.0.0",
    developer: "WALID YAHAYA",
    documentation: "/api-docs",
    health: "/health",
    api: `/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}`
  });
});

// ========== 10. ✅ المسارات المجمعة (الأهم) ==========
app.use(`/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}`, apiRoutes);

// ========== 11. Health Check ==========
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
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


// طباعة المسارات بعد التأكد من وجودها (آمن للاختبارات)
if (process.env.NODE_ENV !== 'test' && app._router && app._router.stack) {
  console.log('📋 المسارات المسجلة:');
  app._router.stack.forEach(layer => {
    if (layer.route) {
      console.log(`${Object.keys(layer.route.methods)} ${layer.route.path}`);
    }
  });
}

// ========== 13. Error Handling ==========


app.use(notFoundHandler);
app.use(errorLogger);
app.use(errorHandler);




// ========== مسار اختبار بسيط ==========
app.get('/test-routes', (req, res) => {
  res.json({
    success: true,
    message: 'Test route is working',
    routes: {
      root: '/',
      api: '/api',
      apiV1: '/api/v1',
      auth: '/api/v1/auth',
      authTest: '/api/v1/auth/test'
    }
  });
});



module.exports = app;