// ============================================
// ملف: src/routes/public.routes.js (مصحح)
// الوصف: مسارات عامة (لا تحتاج توثيق)
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد الـ Controllers
const { 
  authController,
  healthController,
  assetsController,
  storeController
} = require('../controllers');

// الـ middlewares
const rateLimiter = require('../middlewares/rateLimit.middleware');
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. المصادقة ==========
router.use('/auth', require('./auth.routes'));

// ========== 2. فحوصات الصحة ==========
router.get('/health', healthController.quickHealthCheck);
router.get('/health/detailed', healthController.fullHealthCheck);
router.get('/health/ready', healthController.readinessProbe);
router.get('/health/live', healthController.livenessProbe);

// ========== 3. الملفات الثابتة ==========
router.get('/assets/images', assetsController.getImages);
router.get('/assets/icons', assetsController.getIcons);
router.get('/assets/defaults', assetsController.getDefaultImages);

// ========== 4. المتاجر (عام) ==========
router.get('/stores', PaginationUtils.validatePaginationParams, storeController.getStoresPaginated);
router.get('/stores/smart', storeController.getStoresSmart);
router.get('/stores/search', storeController.searchStores);
// router.get('/stores/search/advanced', PaginationUtils.validatePaginationParams, storeController.advancedSearch); // مؤقتاً نعطلها
router.get('/stores/:id', storeController.getStoreDetails);
router.get('/stores/:id/products', storeController.getStoreProducts);
router.get('/stores/:storeId/reviews', storeController.getStoreReviews);

module.exports = router;