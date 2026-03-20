// ============================================
// ملف: src/routes/admin.routes.js (مصحح)
// الوصف: مسارات المشرفين
// الإصدار: 2.0
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد الـ Controllers
const { 
  userController,
  storeController,
  productController,
  orderController,
  driverController,
  vendorController,
  aggregateController,
  notificationController,
  analyticsController
} = require('../controllers');

// الـ middlewares
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// جميع مسارات المشرف تحتاج توثيق ودور admin
router.use(auth);
router.use(role('admin'));

// ========== 1. لوحة التحكم ==========
router.get('/dashboard', aggregateController.getAdminDashboard);
router.get('/stats', aggregateController.getAdminStats);
router.get('/stats/users', aggregateController.getAdminUserStats);
router.get('/stats/orders', aggregateController.getAdminOrderStats);
router.get('/stats/revenue', aggregateController.getAdminRevenueStats);

// ========== 2. إدارة المستخدمين ==========
router.get('/users', PaginationUtils.validatePaginationParams, userController.getUsers);
router.get('/users/:id', userController.getUserById);
router.post('/users', userController.createUser);
router.put('/users/:id', userController.updateUserById);
router.delete('/users/:id', userController.deleteUserById);

// ========== 3. إدارة التجار ==========
router.get('/vendors', PaginationUtils.validatePaginationParams, vendorController.getVendors);
router.get('/vendors/:id', vendorController.getVendorById);
router.put('/vendors/:id/verify', vendorController.verifyVendor);
router.put('/vendors/:id/status', vendorController.toggleVendorStatus);

// ========== 4. إدارة المتاجر ==========
router.get('/stores', PaginationUtils.validatePaginationParams, storeController.getStoresPaginated);
router.get('/stores/:id', storeController.getStoreDetails);
// router.post('/stores', upload('stores').fields([...]), storeController.createStore); // مؤقتاً نعطلها
// router.put('/stores/:id', storeController.updateStore); // مؤقتاً نعطلها
// router.delete('/stores/:id', storeController.deleteStore); // مؤقتاً نعطلها
// router.put('/stores/:id/verify', storeController.verifyStore); // مؤقتاً نعطلها
// router.put('/stores/:id/toggle-status', storeController.toggleStoreStatus); // مؤقتاً نعطلها

// ========== 5. إدارة المنتجات ==========
router.get('/products', PaginationUtils.validatePaginationParams, productController.getAllProducts);
router.get('/products/:id', productController.getProductById);
// router.put('/products/:id/feature', productController.toggleFeatured); // مؤقتاً نعطلها

// ========== 6. إدارة الطلبات ==========
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);
router.get('/orders/:id', orderController.getOrderDetails);
// router.put('/orders/:id/assign', orderController.assignDriver); // مؤقتاً نعطلها
// router.put('/orders/:orderId/reassign', orderController.reassignDriver); // مؤقتاً نعطلها
// router.put('/orders/:id/force-cancel', orderController.forceCancelOrder); // مؤقتاً نعطلها
router.get('/orders/stats/overview', orderController.getOrderStats);
router.get('/orders/stats/daily', orderController.getDailyStats);
router.get('/orders/stats/monthly', orderController.getMonthlyStats);

// ========== 7. إدارة المندوبين ==========
router.get('/drivers', PaginationUtils.validatePaginationParams, driverController.getDrivers);
router.get('/drivers/:id', driverController.getDriverById);
router.get('/drivers/:id/location', driverController.getDriverLocation);
router.get('/drivers/:id/stats', driverController.getDriverStatsById);
// router.get('/drivers/:id/orders', PaginationUtils.validatePaginationParams, orderController.getDriverOrdersById); // مؤقتاً نعطلها
// router.put('/drivers/:id/verify', driverController.verifyDriver); // مؤقتاً نعطلها
// router.put('/drivers/:id/status', driverController.toggleDriverStatus); // مؤقتاً نعطلها

// ========== 8. إدارة Rate Limiting ==========
router.get('/rate-limit/stats', rateLimiter.getStats);
router.post('/rate-limit/reset/:userId', rateLimiter.resetUserLimits);
router.delete('/rate-limit/clear-all', rateLimiter.clearAll);

// ========== 9. إدارة الإشعارات ==========
router.post('/notifications/send', notificationController.sendCustomNotification);
router.get('/notifications/campaign/:campaignId/stats', notificationController.getCampaignStats);
router.get('/notifications/all/stats', notificationController.getAllNotificationsStats);

// ========== 10. إدارة الكاش ==========
router.get('/cache/stats', aggregateController.getCacheStats);
router.post('/cache/clear', aggregateController.clearCache);
router.post('/cache/clear/:pattern', aggregateController.clearCachePattern);

// ========== 11. التحليلات المتقدمة ==========
router.get('/analytics/users', analyticsController.getUserAnalytics);
router.get('/analytics/orders', analyticsController.getOrderAnalytics);
router.get('/analytics/revenue', analyticsController.getRevenueAnalytics);

module.exports = router;