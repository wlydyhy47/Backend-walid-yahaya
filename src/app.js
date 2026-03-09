const express = require("express");
const path = require('path');
const cors = require("cors");
const helmet = require('helmet');
const compression = require('compression');

// ✅ استيراد rate limiters من الملف الصحيح
const rateLimiters = require('./middlewares/rateLimit.middleware');

// ✅ استيراد middleware الأمان
const { cacheMiddleware, noCache, cacheResponse } = require("./middlewares/cache.middleware");
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler.middleware');
const { httpLogger, errorLogger } = require('./utils/logger.util');
const performanceService = require('./services/performance.service');

// استيراد routes
const adminRoutes = require('./routes/admin.routes');
const userRoutes = require("./routes/user.routes");
const restaurantOwnerRoutes = require("./routes/restaurantOwner.routes");
const authRoutes = require("./routes/auth.routes");
const restaurantRoutes = require("./routes/restaurant.routes");
const orderRoutes = require("./routes/order.routes");
const itemRoutes = require("./routes/item.routes");
const addressRoutes = require("./routes/address.routes");
const restaurantAddressRoutes = require("./routes/restaurantAddress.routes");
const aggregateRoutes = require("./routes/aggregate.routes");
const restaurantCompleteRoutes = require("./routes/restaurantComplete.routes");
const userCompleteRoutes = require("./routes/userComplete.routes");
const notificationRoutes = require("./routes/notification.routes");
const chatRoutes = require("./routes/chat.routes");
const healthRoutes = require('./routes/health.routes');
const securityRoutes = require('./routes/security.routes');
const performanceRoutes = require('./routes/performance.routes');
const driverRoutes = require('./routes/driver.routes');
// ✅ استيراد المسارات الجديدة
const loyaltyRoutes = require('./routes/loyalty.routes');
const analyticsRoutes = require('./routes/analytics.routes');

// استيراد Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
const cache = require('./utils/cache.util');
const app = express();

// ========== 1. ✅ إعدادات CORS المبسطة - السماح بكل شيء ==========
console.log('🌐 CORS: تم تفعيل الوضع المبسط - السماح بكل شيء');

// ✅ خيارات CORS المبسطة - السماح بكل شيء
const corsOptions = {
  origin: true,           // السماح لجميع النطاقات
  credentials: true,      // السماح بإرسال الكوكيز
  optionsSuccessStatus: 200 // حالة النجاح لطلبات OPTIONS
};

// ✅ تطبيق CORS على كل الطلبات
app.use(cors(corsOptions));

// ✅ Middleware إضافي لضبط CORS يدوياً (للتأكد من تغطية جميع الحالات)
app.use((req, res, next) => {
  // السماح لجميع النطاقات
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  // السماح بجميع الطرق
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
  
  // ✅ السماح بجميع الهيدرات (الحل الرئيسي للمشكلة)
  res.header('Access-Control-Allow-Headers', '*');
  
  // السماح بإرسال الكوكيز
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // السماح بعرض جميع الهيدرات
  res.header('Access-Control-Expose-Headers', '*');
  
  // معالجة طلبات OPTIONS فوراً
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ========== 2. MIDDLEWARES الأساسية ==========
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(compression({
  level: 6,
  threshold: 100 * 1024 // ضغط الردود أكبر من 100KB
}));

// تطبيق helmet مع إعدادات متوافقة مع CORS
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
    setHeaders: (res, path) => {
        if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.svg')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        // إضافة هيدرات CORS للملفات الثابتة
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
        res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.header('Access-Control-Allow-Headers', '*');
    }
}));

app.use('/icons', express.static(path.join(__dirname, 'public/icons'), {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.header('Access-Control-Allow-Headers', '*');
    }
}));

// ========== 4. Logging ==========
app.use(httpLogger);

// ========== 5. Performance Monitoring ==========
app.use(performanceService.measureRequest());

// ========== 6. Cache Middleware ==========
app.use(cacheMiddleware);

// ========== 7. Rate Limiting ==========
// تطبيق rate limiters المحسّنة
app.use("/api/auth", rateLimiters.authLimiter);
app.use("/api/auth/forgot-password", rateLimiters.strictLimiter);
app.use("/api/auth/reset-password", rateLimiters.strictLimiter);
app.use("/api/uploads", rateLimiters.uploadLimiter);
app.use("/api", rateLimiters.apiLimiter);

// ========== 8. Swagger Documentation ==========
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
  
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpecs);
  });
}

// ========== 9. مسارات الملفات الثابتة ==========
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/icons/favicon.ico'));
});

app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/images/logo.png'));
});

app.get('/api/assets/images', (req, res) => {
    const fs = require('fs');
    const imagesDir = path.join(__dirname, 'public/images');
    
    fs.readdir(imagesDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Cannot read images directory' });
        }
        
        const images = files
            .filter(file => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file))
            .map(file => ({
                filename: file,
                url: `/images/${file}`,
                thumbnail: `/images/${file}`,
                type: file.split('.').pop().toLowerCase()
            }));
        
        res.json({
            success: true,
            data: images
        });
    });
});

// ========== 10. Health Check Route ==========
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOstring(),
    version: '1.0.0',
    service: 'Food Delivery API'
  });
});

// ========== 11. Routes ==========
// Public routes
app.get("/", (req, res) => {
  res.json({ 
    message: "Food Delivery API is working ✅", 
    version: "1.0.0",
    developer: "WALID YAHAYA",
    documentation: "/api-docs",
    health: "/health"
  });
});

// المسارات الجديدة
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/analytics", analyticsRoutes);

// API routes
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/restaurant-owner", restaurantOwnerRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/restaurants", restaurantCompleteRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/restaurant-addresses", restaurantAddressRoutes);
app.use("/api/aggregate", aggregateRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/driver", driverRoutes);
// ========== 12. Static Files ==========
app.use('/uploads', express.static('uploads'));

// ========== 13. Error Handling ==========
app.use(notFoundHandler);
app.use(errorLogger);
app.use(errorHandler);

// ========== 14. Cache Monitoring ==========
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

module.exports = app;