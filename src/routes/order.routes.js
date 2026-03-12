// ============================================
// ملف: src/routes/order.routes.js
// الوصف: جميع مسارات الطلبات - نسخة نهائية كاملة
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { orderController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { restaurantOwnerMiddleware, driverMiddleware } = require("../middlewares/role.middleware");
const { noCache } = require('../middlewares/cache.middleware');
const PaginationUtils = require('../utils/pagination.util');
const { validateOrder } = require('../middlewares/validation.middleware');

// ========== 1. مسارات العملاء ==========
router.post("/", auth, role("client"), validateOrder, orderController.createOrder);
router.get('/me', auth, role('client'), PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);
router.get("/:id", auth, orderController.getOrderDetails);
router.put("/:id/cancel", auth, role("client"), orderController.cancelOrder);
router.get("/:id/track", auth, orderController.trackOrder);
router.post("/:id/rate", auth, role('client'), orderController.rateOrder);
router.post("/:id/report-issue", auth, orderController.reportOrderIssue);

// ========== 2. مسارات المندوبين ==========
router.get('/driver/me', auth, driverMiddleware, PaginationUtils.validatePaginationParams, orderController.getDriverOrders);
router.get('/driver/current', auth, driverMiddleware, orderController.getCurrentDelivery);
router.put("/:id/status", auth, driverMiddleware, noCache, orderController.updateStatus);
router.post("/:id/location", auth, driverMiddleware, orderController.updateDriverLocation);
router.get('/driver/earnings', auth, driverMiddleware, orderController.getDriverEarnings);

// ========== 3. مسارات أصحاب المطاعم ==========
router.get('/restaurant/me', auth, restaurantOwnerMiddleware, PaginationUtils.validatePaginationParams, orderController.getRestaurantOrders);
router.get('/restaurant/stats', auth, restaurantOwnerMiddleware, orderController.getRestaurantOrderStats);
router.put("/:id/accept", auth, restaurantOwnerMiddleware, orderController.acceptOrder);
router.put("/:id/reject", auth, restaurantOwnerMiddleware, orderController.rejectOrder);
router.put("/:id/mark-ready", auth, restaurantOwnerMiddleware, orderController.markOrderReady);
router.put("/:id/start-preparing", auth, restaurantOwnerMiddleware, orderController.startPreparing);
router.get('/restaurant/today', auth, restaurantOwnerMiddleware, orderController.getTodayOrders);

// ========== 4. مسارات الأدمن ==========
router.get('/', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);
router.get('/stats/overview', auth, role('admin'), orderController.getOrderStats);
router.get('/stats/daily', auth, role('admin'), orderController.getDailyStats);
router.get('/stats/monthly', auth, role('admin'), orderController.getMonthlyStats);
router.put("/:id/assign", auth, role("admin"), orderController.assignDriver);
router.put("/:orderId/reassign", auth, role("admin"), orderController.reassignDriver);
router.put("/:id/force-cancel", auth, role("admin"), orderController.forceCancelOrder);
router.get('/driver/:driverId/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getDriverOrdersById);
router.get('/restaurant/:restaurantId/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getRestaurantOrdersById);

// ========== 5. مسارات التتبع ==========
router.get("/:id/location", auth, orderController.getDriverLocation);
router.get("/:id/timeline", auth, orderController.getOrderTimeline);

module.exports = router;