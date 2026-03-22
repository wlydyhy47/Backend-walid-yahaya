// ============================================
// ملف: src/routes/driver.routes.js (المصحح النهائي مع Validation)
// ============================================

const express = require('express');
const router = express.Router();

const { 
  driverController,
  orderController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const { driverMiddleware } = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// ✅ Validators
const {
  avatarSchema,
  presenceSchema
} = require('../validators/user.validator');

const {
  updateStatusSchema
} = require('../validators/order.validator');

router.use(auth);

// ========== 1. ملف المندوب الشخصي (فقط المندوبين) ==========
router.get('/profile', driverMiddleware, driverController.getMyProfile);
router.put('/profile/avatar', 
  driverMiddleware,
  validate(avatarSchema),
  upload('users/avatars', ['image']).single('image'), 
  driverController.updateAvatar
);
router.put('/profile/availability', driverMiddleware, validate(presenceSchema), driverController.toggleAvailability);
router.put('/profile/location', driverMiddleware, driverController.updateLocation);

// ========== 2. التوصيلات (فقط المندوبين) ==========
router.get('/deliveries', driverMiddleware, PaginationUtils.validatePaginationParams, orderController.getDriverOrders);
router.get('/deliveries/current', driverMiddleware, orderController.getCurrentDelivery);
router.get('/deliveries/:id', driverMiddleware, orderController.getOrderDetails);
router.put('/deliveries/:id/status', driverMiddleware, validate(updateStatusSchema), orderController.updateStatus);
router.post('/deliveries/:id/location', driverMiddleware, orderController.updateDriverLocation);
router.get('/deliveries/:id/track', driverMiddleware, orderController.trackOrder);

// ========== 3. الأرباح (فقط المندوبين) ==========
router.get('/earnings', driverMiddleware, orderController.getDriverEarnings);
router.get('/earnings/stats', driverMiddleware, driverController.getMyStats);
router.get('/earnings/history', driverMiddleware, PaginationUtils.validatePaginationParams, driverController.getEarningsHistory);

// ========== 4. إحصائيات (فقط المندوبين) ==========
router.get('/stats', driverMiddleware, driverController.getMyStats);
router.get('/performance', driverMiddleware, driverController.getPerformanceReport);

module.exports = router;