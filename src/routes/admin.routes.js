// ============================================
// ملف: src/routes/admin.routes.js (المصحح بالكامل)
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

// ✅ تم تفعيل مسارات CRUD للمتاجر
router.post('/stores', 
  upload('stores', ['image']).fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
  ]), 
  storeController.createStore
);

router.put('/stores/:id', storeController.updateStore);
router.delete('/stores/:id', storeController.deleteStore);
router.put('/stores/:id/verify', storeController.verifyStore);
router.put('/stores/:id/toggle-status', storeController.toggleStoreStatus);

// ========== 5. إدارة المنتجات ==========
router.get('/products', PaginationUtils.validatePaginationParams, productController.getAllProducts);
router.get('/products/:id', productController.getProductById);

// ✅ تم تفعيل مسار تمييز المنتجات
router.put('/products/:id/feature', productController.toggleFeatured);

// ========== 6. إدارة الطلبات ==========
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);
router.get('/orders/:id', orderController.getOrderDetails);

// ✅ تم تفعيل مسارات تعيين المندوبين - مع التأكد من وجود الدوال
if (orderController.assignDriver) {
  router.put('/orders/:id/assign', orderController.assignDriver);
} else {
  console.warn('⚠️ orderController.assignDriver غير موجودة');
}

if (orderController.reassignDriver) {
  router.put('/orders/:orderId/reassign', orderController.reassignDriver);
} else {
  console.warn('⚠️ orderController.reassignDriver غير موجودة');
}

if (orderController.forceCancelOrder) {
  router.put('/orders/:id/force-cancel', orderController.forceCancelOrder);
} else {
  console.warn('⚠️ orderController.forceCancelOrder غير موجودة');
}

router.get('/orders/stats/overview', orderController.getOrderStats);
router.get('/orders/stats/daily', orderController.getDailyStats);
router.get('/orders/stats/monthly', orderController.getMonthlyStats);

// ========== 7. إدارة المندوبين ==========
router.get('/drivers', PaginationUtils.validatePaginationParams, driverController.getDrivers);
router.get('/drivers/:id', driverController.getDriverById);
router.get('/drivers/:id/location', driverController.getDriverLocation);
router.get('/drivers/:id/stats', driverController.getDriverStatsById);

// ✅ تم تفعيل مسارات إضافية للمندوبين - مع التأكد من وجود الدوال
if (orderController.getDriverOrdersById) {
  router.get('/drivers/:driverId/orders', 
    PaginationUtils.validatePaginationParams, 
    orderController.getDriverOrdersById
  );
} else {
  console.warn('⚠️ orderController.getDriverOrdersById غير موجودة');
}

if (driverController.verifyDriver) {
  router.put('/drivers/:id/verify', driverController.verifyDriver);
} else {
  console.warn('⚠️ driverController.verifyDriver غير موجودة');
}

if (driverController.toggleDriverStatus) {
  router.put('/drivers/:id/status', driverController.toggleDriverStatus);
} else {
  console.warn('⚠️ driverController.toggleDriverStatus غير موجودة');
}

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

// ========== 12. تصدير التقارير (جديد) - مع التأكد من وجود الدوال ==========
if (aggregateController.exportOrdersReport) {
  router.get('/reports/orders', aggregateController.exportOrdersReport);
} else {
  console.warn('⚠️ aggregateController.exportOrdersReport غير موجودة');
}

if (aggregateController.exportUsersReport) {
  router.get('/reports/users', aggregateController.exportUsersReport);
} else {
  console.warn('⚠️ aggregateController.exportUsersReport غير موجودة');
}

if (aggregateController.exportRevenueReport) {
  router.get('/reports/revenue', aggregateController.exportRevenueReport);
} else {
  console.warn('⚠️ aggregateController.exportRevenueReport غير موجودة');
}

if (aggregateController.exportDriversReport) {
  router.get('/reports/drivers', aggregateController.exportDriversReport);
} else {
  console.warn('⚠️ aggregateController.exportDriversReport غير موجودة');
}

if (aggregateController.exportStoresReport) {
  router.get('/reports/stores', aggregateController.exportStoresReport);
} else {
  console.warn('⚠️ aggregateController.exportStoresReport غير موجودة');
}

// ========== 13. إدارة حملات الإشعارات (جديد) - مع التأكد من وجود الدوال ==========
if (notificationController.createCampaign) {
  router.post('/campaigns/notifications/create', notificationController.createCampaign);
} else {
  console.warn('⚠️ notificationController.createCampaign غير موجودة');
}

if (notificationController.getCampaigns) {
  router.get('/campaigns/notifications/list', notificationController.getCampaigns);
} else {
  console.warn('⚠️ notificationController.getCampaigns غير موجودة');
}

if (notificationController.pauseCampaign) {
  router.put('/campaigns/notifications/:id/pause', notificationController.pauseCampaign);
} else {
  console.warn('⚠️ notificationController.pauseCampaign غير موجودة');
}

if (notificationController.resumeCampaign) {
  router.put('/campaigns/notifications/:id/resume', notificationController.resumeCampaign);
} else {
  console.warn('⚠️ notificationController.resumeCampaign غير موجودة');
}

if (notificationController.deleteCampaign) {
  router.delete('/campaigns/notifications/:id', notificationController.deleteCampaign);
} else {
  console.warn('⚠️ notificationController.deleteCampaign غير موجودة');
}

// ========== 14. إحصائيات متقدمة (جديد) - مع التأكد من وجود الدوال ==========
if (aggregateController.getDailyAdvancedStats) {
  router.get('/advanced-stats/daily', aggregateController.getDailyAdvancedStats);
} else {
  console.warn('⚠️ aggregateController.getDailyAdvancedStats غير موجودة');
}

if (aggregateController.getWeeklyAdvancedStats) {
  router.get('/advanced-stats/weekly', aggregateController.getWeeklyAdvancedStats);
} else {
  console.warn('⚠️ aggregateController.getWeeklyAdvancedStats غير موجودة');
}

if (aggregateController.getMonthlyAdvancedStats) {
  router.get('/advanced-stats/monthly', aggregateController.getMonthlyAdvancedStats);
} else {
  console.warn('⚠️ aggregateController.getMonthlyAdvancedStats غير موجودة');
}

if (aggregateController.getCustomStats) {
  router.get('/advanced-stats/custom', aggregateController.getCustomStats);
} else {
  console.warn('⚠️ aggregateController.getCustomStats غير موجودة');
}

module.exports = router;