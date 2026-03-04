const express = require("express");
const path = require('path');
const cors = require("cors");
const helmet = require('helmet');
const compression = require('compression');

// استيراد middlewares
const { 
  apiLimiter, 
  authLimiter, 
  notificationLimiter,
  uploadLimiter 
} = require('./middlewares/rateLimit.middleware');

const { cacheMiddleware, noCache, cacheResponse } = require("./middlewares/cache.middleware");
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler.middleware');
const { httpLogger, errorLogger } = require('./utils/logger.util');

// استيراد routes
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

// استيراد Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
const cache = require('./utils/cache.util');
const app = express();



// ========== MIDDLEWARES الأساسية ==========
app.use(
  cors({
    origin:process.env.CLIENT_URL || "http://localhost:3000", // مؤقتاً للتجربة فقط 
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.set('trust proxy', 1);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// Middleware لزيادة حجم الرفع
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(compression({
  level: 6,
  threshold: 100 * 1024 // ضغط الردود أكبر من 100KB
}));

// ========== الأمان ==========
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      connectSrc: ["'self'", "ws://localhost:3000", "ws://localhost:3001", process.env.CLIENT_URL],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// إضافة headers أمان إضافية
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ========== Logging ==========
app.use(httpLogger);

// ========== Cache Middleware ==========
app.use(cacheMiddleware);

// ========== Rate Limiting ==========
// تطبيق rate limiting على مسارات محددة
app.use("/api/auth", authLimiter); // للتسجيل والدخول
app.use("/api/notifications/send", notificationLimiter); // لإرسال الإشعارات فقط
app.use("/api/uploads", uploadLimiter); // للرفع
app.use("/api", apiLimiter); // للعامة (يجب أن يكون آخر rate limiter)

// ========== Swagger Documentation ==========
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


//  حل إضافي: تجاهل طلبات favicon.ico
app.get('/favicon.ico', (req, res) => res.status(204).end());


// حل إضافي: route مخصص لـ logo.png مع تخطي الـ cache middleware
app.get('/logo.png', (req, res, next) => {
    // تخطي الـ cache middleware
    req.skipCache = true;
    next();
}, express.static(path.join(__dirname, 'public')));

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpecs);
});

// ========== Health Check Route ==========
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'Food Delivery API'
  });
});

// ========== Routes ==========
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

// API routes
app.use("/api/users", userRoutes);
app.use("/api/complete", userCompleteRoutes);
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

// ========== Static Files ==========
app.use('/uploads', express.static('uploads'));

// ========== Error Handling ==========
app.use(notFoundHandler);
app.use(errorLogger);
app.use(errorHandler);

// ========== Cache Monitoring ==========
// تنظيف الكاش تلقائياً كل ساعة
if (process.env.NODE_ENV !== 'production') {
  // Endpoint لمراقبة الكاش (التطوير فقط)
  app.get('/api/cache-stats', (req, res) => {
    const stats = cache.getStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date()
    });
  });

  // تنظيف الكاش تلقائياً كل ساعة
  setInterval(() => {
    const cleaned = cache.smartCleanup(2, 24);
    if (cleaned > 0) {
      console.log(`🧹 Smart cache cleanup: ${cleaned} keys removed`);
    }
  }, 60 * 60 * 1000);
}

module.exports = app;