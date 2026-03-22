// ============================================
// ملف: src/routes/public.routes.js
// الوصف: جميع المسارات العامة تحت /public
// ============================================

const express = require('express');
const router = express.Router();

const { 
  healthController,
  assetsController,
  storeController,
  authController,
  aggregateController,
  securityController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');
// ✅ التصحيح: استيراد validate بشكل صحيح
const validate = require('../middlewares/validate.middleware');
const { registerSchema, loginSchema } = require("../validators/auth.validator");
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. مسارات الصحة ==========
router.get('/health', healthController.quickHealthCheck);
router.get('/health/detailed', healthController.fullHealthCheck);
router.get('/health/ready', healthController.readinessProbe);
router.get('/health/live', healthController.livenessProbe);

// ========== 2. مسارات المصادقة (تحت /public/auth) ==========
// http://localhost:3000/api/v1/public/auth/register
router.post("/auth/register", 
  rateLimiter.authLimiter, 
  validate(registerSchema), 
  authController.register
);

// http://localhost:3000/api/v1/public/auth/login
router.post("/auth/login", 
  rateLimiter.authLimiter, 
  validate(loginSchema), 
  authController.login
);

// http://localhost:3000/api/v1/public/auth/verify
router.post("/auth/verify", 
  rateLimiter.authLimiter, 
  authController.verifyAccount
);

// http://localhost:3000/api/v1/public/auth/resend-verification
router.post("/auth/resend-verification", 
  rateLimiter.authLimiter, 
  authController.resendVerification
);

// http://localhost:3000/api/v1/public/auth/forgot-password
router.post("/auth/forgot-password", 
  rateLimiter.strictLimiter, 
  authController.forgotPassword
);

// http://localhost:3000/api/v1/public/auth/reset-password
router.post("/auth/reset-password", 
  rateLimiter.strictLimiter, 
  authController.resetPassword
);

// http://localhost:3000/api/v1/public/auth/refresh
router.post("/auth/refresh", 
  rateLimiter.authLimiter, 
  authController.refreshToken
);

// http://localhost:3000/api/v1/public/auth/logout (يتطلب توكن)
router.post("/auth/logout", auth, authController.logout);

// http://localhost:3000/api/v1/public/auth/validate (يتطلب توكن)
router.get("/auth/validate", auth, authController.validateToken);

// ========== 3. الملفات الثابتة ==========
router.get('/assets/images', assetsController.getImages);
router.get('/assets/icons', assetsController.getIcons);
router.get('/assets/defaults', assetsController.getDefaultImages);

// ========== 4. المتاجر (عام) ==========
router.get('/stores', PaginationUtils.validatePaginationParams, storeController.getStoresPaginated);
router.get('/stores/smart', storeController.getStoresSmart);
router.get('/stores/search', storeController.searchStores);
router.get('/stores/search/advanced', PaginationUtils.validatePaginationParams, storeController.advancedSearch);
router.get('/stores/:id', storeController.getStoreDetails);
router.get('/stores/:id/products', storeController.getStoreProducts);
router.get('/stores/:storeId/reviews', storeController.getStoreReviews);

// ========== 5. البيانات العامة ==========
router.get('/home', aggregateController.getHomeData);
router.get('/search', aggregateController.unifiedSearch);
router.get('/stats', aggregateController.getPublicStats);

// ========== 6. مسارات مع توثيق اختياري ==========
router.get('/stores/:id/full', auth.optional, aggregateController.getStoreDetails);

// ========== 7. التحليلات العامة ==========
router.post('/analytics/events', (req, res) => {
  const { eventName, ...data } = req.body;
  console.log(`📊 [Analytics] Public Event: ${eventName}`, data);
  res.json({ success: true });
});

router.post('/analytics/events/batch', (req, res) => {
  const { events = [] } = req.body;
  console.log(`📊 [Analytics] Public Batch: ${events.length} events`);
  res.json({ success: true, count: events.length });
});

// ========== 8. فحص الأمان ==========
router.post('/security/check-password', 
  rateLimiter.apiLimiter, 
  securityController.checkPassword
);

router.post('/security/check-email', 
  rateLimiter.apiLimiter, 
  securityController.checkEmail
);

// ========== 9. معلومات النظام ==========
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Food Delivery Platform',
      version: '2.0.0',
      description: 'منصة توصيل طعام متكاملة',
      baseUrl: 'http://localhost:3000/api/v1',
      endpoints: {
        auth: {
          register: 'POST /public/auth/register',
          login: 'POST /public/auth/login',
          verify: 'POST /public/auth/verify',
          forgotPassword: 'POST /public/auth/forgot-password',
          resetPassword: 'POST /public/auth/reset-password',
          refresh: 'POST /public/auth/refresh',
          logout: 'POST /public/auth/logout',
          validate: 'GET /public/auth/validate'
        },
        public: {
          stores: 'GET /public/stores',
          store: 'GET /public/stores/:id',
          home: 'GET /public/home',
          search: 'GET /public/search',
          stats: 'GET /public/stats'
        }
      }
    }
  });
});

module.exports = router;