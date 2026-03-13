// ============================================
// ملف: src/routes/admin.routes.js (محدث)
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد موحد لكل Controllers التي يحتاجها الأدمن
const { 
  userController,
  orderController,
  aggregateController,
  notificationController 
} = require('../controllers');

// الـ middlewares
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');

// جميع المسارات تحتاج أدمن
router.use(auth);
router.use(role('admin'));

// ========== 1. لوحة التحكم ==========
router.get('/dashboard', aggregateController.getAdminDashboard);
router.get('/stats', aggregateController.getAdminStats);

// ========== 2. إدارة المستخدمين ==========
router.get('/users', userController.getUsers); // استخدم getUsers بدلاً من getAllUsers
router.get('/users/:id', userController.getUserById);
router.put('/users/:id', userController.updateUserById);
router.delete('/users/:id', userController.deleteUserById);
router.post('/users', userController.createUser);

// ========== 3. إدارة الطلبات ==========
router.get('/orders', orderController.getAllOrdersPaginated);
router.get('/orders/stats', orderController.getOrderStats);
router.put('/orders/:id/assign', orderController.assignDriver);
router.put('/orders/:orderId/reassign', orderController.reassignDriver);

// ========== 4. إدارة Rate Limiting ==========
router.get('/rate-limit/stats', rateLimiter.getStats);
router.post('/rate-limit/reset/:userId', rateLimiter.resetUserLimits);
router.delete('/rate-limit/clear-all', rateLimiter.clearAll);

// ========== 5. إدارة الإشعارات ==========
router.post('/notifications/send', notificationController.sendCustomNotification);
router.get('/notifications/campaign/:campaignId/stats', notificationController.getCampaignStats);

// ========== 6. إدارة الكاش ==========
router.post('/cache/clear', aggregateController.clearCache);
router.get('/cache/stats', aggregateController.getCacheStats);

// ========== 7. إحصائيات متقدمة ==========
router.get('/analytics/users', aggregateController.getUserAnalytics);
router.get('/analytics/orders', aggregateController.getOrderAnalytics);
router.get('/analytics/revenue', aggregateController.getRevenueAnalytics);

module.exports = router;