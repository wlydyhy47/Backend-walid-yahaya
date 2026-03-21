// ============================================
// ملف: src/routes/order.routes.js (المُصلح - ترتيب محسّن)
// الوصف: جميع مسارات الطلبات
// الإصدار: 5.0
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { orderController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { storeOwnerMiddleware, driverMiddleware } = require("../middlewares/role.middleware");
const { noCache } = require('../middlewares/cache.middleware');
const PaginationUtils = require('../utils/pagination.util');

// ========== ملاحظة مهمة: ترتيب المسارات ==========
// يجب وضع المسارات الأكثر تحديداً أولاً لتجنب التعارض
// مثال: /me قبل /:id

// ========== 1. مسارات العملاء ==========
/**
 * @route   POST /api/v1/orders
 * @desc    إنشاء طلب جديد
 * @access  Client
 */
router.post("/", auth, role("client"), orderController.createOrder);

/**
 * @route   GET /api/v1/orders/me
 * @desc    طلبات المستخدم الحالي
 * @access  Client
 */
router.get('/me', auth, role('client'), PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);

/**
 * @route   GET /api/v1/orders/track/:id
 * @desc    تتبع الطلب (مسار محدد لتجنب التعارض مع /:id)
 * @access  Client
 */
router.get("/track/:id", auth, orderController.trackOrder);

/**
 * @route   GET /api/v1/orders/:id
 * @desc    تفاصيل الطلب (يجب أن يكون بعد المسارات الأكثر تحديداً)
 * @access  Authenticated
 */
router.get("/:id", auth, orderController.getOrderDetails);

/**
 * @route   PUT /api/v1/orders/:id/cancel
 * @desc    إلغاء الطلب
 * @access  Client
 */
router.put("/:id/cancel", auth, role("client"), orderController.cancelOrder);

/**
 * @route   POST /api/v1/orders/:id/rate
 * @desc    تقييم الطلب
 * @access  Client
 */
router.post("/:id/rate", auth, role('client'), orderController.rateOrder);

/**
 * @route   POST /api/v1/orders/:id/report-issue
 * @desc    الإبلاغ عن مشكلة في الطلب
 * @access  Client
 */
router.post("/:id/report-issue", auth, orderController.reportOrderIssue);

// ========== 2. مسارات المندوبين ==========
/**
 * @route   GET /api/v1/orders/driver/deliveries
 * @desc    طلبات المندوب
 * @access  Driver
 */
router.get('/driver/deliveries', auth, driverMiddleware, PaginationUtils.validatePaginationParams, orderController.getDriverOrders);

/**
 * @route   GET /api/v1/orders/driver/current-delivery
 * @desc    التوصيلة الحالية للمندوب
 * @access  Driver
 */
router.get('/driver/current-delivery', auth, driverMiddleware, orderController.getCurrentDelivery);

/**
 * @route   PUT /api/v1/orders/driver/:id/status
 * @desc    تحديث حالة الطلب
 * @access  Driver
 */
router.put("/driver/:id/status", auth, driverMiddleware, noCache, orderController.updateStatus);

/**
 * @route   POST /api/v1/orders/driver/:id/location
 * @desc    تحديث موقع المندوب
 * @access  Driver
 */
router.post("/driver/:id/location", auth, driverMiddleware, orderController.updateDriverLocation);

/**
 * @route   GET /api/v1/orders/driver/earnings
 * @desc    أرباح المندوب
 * @access  Driver
 */
router.get('/driver/earnings', auth, driverMiddleware, orderController.getDriverEarnings);

// ========== 3. مسارات أصحاب المتاجر ==========
/**
 * @route   GET /api/v1/orders/vendor/orders
 * @desc    طلبات المتجر
 * @access  Vendor
 */
router.get('/vendor/orders', auth, storeOwnerMiddleware, PaginationUtils.validatePaginationParams, orderController.getVendorOrders);

/**
 * @route   GET /api/v1/orders/vendor/orders/stats
 * @desc    إحصائيات طلبات المتجر
 * @access  Vendor
 */
router.get('/vendor/orders/stats', auth, storeOwnerMiddleware, orderController.getVendorOrderStats);

/**
 * @route   GET /api/v1/orders/vendor/orders/today
 * @desc    طلبات اليوم
 * @access  Vendor
 */
router.get('/vendor/orders/today', auth, storeOwnerMiddleware, orderController.getTodayOrders);

/**
 * @route   PUT /api/v1/orders/vendor/:id/accept
 * @desc    قبول الطلب
 * @access  Vendor
 */
router.put("/vendor/:id/accept", auth, storeOwnerMiddleware, orderController.acceptOrder);

/**
 * @route   PUT /api/v1/orders/vendor/:id/reject
 * @desc    رفض الطلب
 * @access  Vendor
 */
router.put("/vendor/:id/reject", auth, storeOwnerMiddleware, orderController.rejectOrder);

/**
 * @route   PUT /api/v1/orders/vendor/:id/mark-ready
 * @desc    تأكيد جاهزية الطلب
 * @access  Vendor
 */
router.put("/vendor/:id/mark-ready", auth, storeOwnerMiddleware, orderController.markOrderReady);

/**
 * @route   PUT /api/v1/orders/vendor/:id/start-preparing
 * @desc    بدء تحضير الطلب
 * @access  Vendor
 */
router.put("/vendor/:id/start-preparing", auth, storeOwnerMiddleware, orderController.startPreparing);

// ========== 4. مسارات الأدمن ==========
/**
 * @route   GET /api/v1/orders/admin/orders
 * @desc    جميع الطلبات
 * @access  Admin
 */
router.get('/admin/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);

/**
 * @route   GET /api/v1/orders/admin/orders/stats/overview
 * @desc    إحصائيات الطلبات
 * @access  Admin
 */
router.get('/admin/orders/stats/overview', auth, role('admin'), orderController.getOrderStats);

/**
 * @route   GET /api/v1/orders/admin/orders/stats/daily
 * @desc    إحصائيات يومية
 * @access  Admin
 */
router.get('/admin/orders/stats/daily', auth, role('admin'), orderController.getDailyStats);

/**
 * @route   GET /api/v1/orders/admin/orders/stats/monthly
 * @desc    إحصائيات شهرية
 * @access  Admin
 */
router.get('/admin/orders/stats/monthly', auth, role('admin'), orderController.getMonthlyStats);

/**
 * @route   PUT /api/v1/orders/admin/:id/assign
 * @desc    تعيين مندوب للطلب
 * @access  Admin
 */
router.put("/admin/:id/assign", auth, role("admin"), orderController.assignDriver);

/**
 * @route   PUT /api/v1/orders/admin/:orderId/reassign
 * @desc    إعادة تعيين مندوب للطلب
 * @access  Admin
 */
router.put("/admin/:orderId/reassign", auth, role("admin"), orderController.reassignDriver);

/**
 * @route   PUT /api/v1/orders/admin/:id/force-cancel
 * @desc    إلغاء قسري للطلب
 * @access  Admin
 */
router.put("/admin/:id/force-cancel", auth, role("admin"), orderController.forceCancelOrder);

/**
 * @route   GET /api/v1/orders/admin/drivers/:driverId/orders
 * @desc    طلبات مندوب معين
 * @access  Admin
 */
router.get('/admin/drivers/:driverId/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getDriverOrdersById);

/**
 * @route   GET /api/v1/orders/admin/stores/:storeId/orders
 * @desc    طلبات متجر معين
 * @access  Admin
 */
router.get('/admin/stores/:storeId/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getStoreOrdersById);

// ========== 5. مسارات التتبع العامة ==========
/**
 * @route   GET /api/v1/orders/:id/location
 * @desc    موقع المندوب
 * @access  Authenticated
 */
router.get("/:id/location", auth, orderController.getDriverLocation);

/**
 * @route   GET /api/v1/orders/:id/timeline
 * @desc    الجدول الزمني للطلب
 * @access  Authenticated
 */
router.get("/:id/timeline", auth, orderController.getOrderTimeline);

module.exports = router;