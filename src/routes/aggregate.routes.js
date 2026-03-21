// ============================================
// ملف: src/routes/aggregate.routes.js (محدث)
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد موحد
const { aggregateController } = require('../controllers');

// الـ middlewares
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. مسارات عامة ==========
router.get('/home', aggregateController.getHomeData);
router.get('/search', aggregateController.unifiedSearch);
router.get('/stats', aggregateController.getPublicStats);

// ========== 2. مسارات تحتاج توثيق ==========
router.get('/dashboard', auth, aggregateController.getDashboardData);
router.get('/stores/:id/full', auth.optional, aggregateController.getStoreDetails);
router.get('/orders/:id/full', auth, aggregateController.getOrderWithTracking);

// ========== 3. مسارات Pagination ==========
router.get('/stores', PaginationUtils.validatePaginationParams, aggregateController.getStoresPaginated);
router.get('/items', PaginationUtils.validatePaginationParams, aggregateController.getItemsPaginated);
router.get('/orders/me', auth, PaginationUtils.validatePaginationParams, aggregateController.getMyOrdersPaginated);

// ========== 4. مسارات الأدمن ==========
router.get('/admin/dashboard', auth, role('admin'), aggregateController.getAdminDashboard);
router.get('/admin/stats/users', auth, role('admin'), aggregateController.getAdminUserStats);
router.get('/admin/stats/orders', auth, role('admin'), aggregateController.getAdminOrderStats);
router.get('/admin/stats/revenue', auth, role('admin'), aggregateController.getAdminRevenueStats);
router.get('/orders/admin', auth, role('admin'), PaginationUtils.validatePaginationParams, aggregateController.getOrdersPaginatedAdmin);

// ========== 5. إدارة الكاش ==========
router.get('/cache/stats', auth, role('admin'), aggregateController.getCacheStats);
router.post('/cache/clear', auth, role('admin'), aggregateController.clearCache);
router.post('/cache/clear/:pattern', auth, role('admin'), aggregateController.clearCachePattern);

module.exports = router;