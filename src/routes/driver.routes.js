// ============================================
// ملف: src/routes/driver.routes.js (مصحح)
// الوصف: مسارات المندوبين
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد الـ Controllers
const { 
  driverController,
  orderController
} = require('../controllers');

// ✅ استيراد الـ middlewares
const auth = require('../middlewares/auth.middleware');
const { driverMiddleware } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload'); // ✅ تأكد من استيراد upload
const PaginationUtils = require('../utils/pagination.util');

// جميع مسارات المندوب تحتاج توثيق
router.use(auth);
router.use(driverMiddleware);

// ========== 1. ملف المندوب الشخصي ==========
router.get('/profile', driverController.getMyProfile);
// router.put('/profile/avatar', upload('users/avatars').single('image'), driverController.updateAvatar); // مؤقتاً نعطلها
router.put('/profile/availability', driverController.toggleAvailability);
router.put('/profile/location', driverController.updateLocation);

// ========== 2. التوصيلات ==========
router.get('/deliveries', PaginationUtils.validatePaginationParams, orderController.getDriverOrders);
router.get('/deliveries/current', orderController.getCurrentDelivery);
router.get('/deliveries/:id', orderController.getOrderDetails);
router.put('/deliveries/:id/status', orderController.updateStatus);
router.put('/deliveries/:id/location', orderController.updateDriverLocation);
router.get('/deliveries/:id/track', orderController.trackOrder);

// ========== 3. الأرباح ==========
router.get('/earnings', orderController.getDriverEarnings);
router.get('/earnings/stats', driverController.getMyStats);
// router.get('/earnings/history', PaginationUtils.validatePaginationParams, driverController.getEarningsHistory); // مؤقتاً نعطلها

// ========== 4. إحصائيات ==========
router.get('/stats', driverController.getMyStats);
// router.get('/performance', driverController.getPerformanceReport); // مؤقتاً نعطلها

module.exports = router;