// ============================================
// ملف: src/routes/order.routes.js
// الوصف: مسارات الطلبات الموحدة لجميع الأدوار
// ============================================

const express = require("express");
const router = express.Router();

const { orderController } = require('../controllers');
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { storeOwnerMiddleware, driverMiddleware } = require("../middlewares/role.middleware");
const validate = require('../middlewares/validate.middleware');
const { noCache } = require('../middlewares/cache.middleware');
const PaginationUtils = require('../utils/pagination.util');

// Validators
const {
  createOrderSchema,
  updateStatusSchema,
  cancelOrderSchema,
  rateOrderSchema,
  reportIssueSchema,
  assignDriverSchema
} = require('../validators/order.validator');

/**
 * @swagger
 * tags:
 *   name: 📦 Orders
 *   description: إدارة الطلبات لجميع الأدوار
 */

// ========== 1. مسارات العملاء (Client) ==========

/**
 * @swagger
 * /orders/me:
 *   get:
 *     summary: طلباتي كعميل
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, preparing, ready, picked, delivered, cancelled]
 *     responses:
 *       200:
 *         description: قائمة الطلبات
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                     pagination:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', auth, role('client'), PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: إنشاء طلب جديد
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - storeId
 *               - items
 *               - addressId
 *             properties:
 *               storeId:
 *                 type: string
 *                 example: 60d21b4667d0d8992e610c85
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                     notes:
 *                       type: string
 *               addressId:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash, card, wallet]
 *                 default: cash
 *               deliveryInstructions:
 *                 type: string
 *               couponCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: تم إنشاء الطلب بنجاح
 *       400:
 *         description: بيانات غير صحيحة أو المتجر مغلق
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/", auth, role("client"), validate(createOrderSchema), orderController.createOrder);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: تفاصيل طلب محدد
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تفاصيل الطلب
 *       403:
 *         description: ليس لديك صلاحية لعرض هذا الطلب
 *       404:
 *         description: الطلب غير موجود
 */
router.get("/:id", auth, orderController.getOrderDetails);

/**
 * @swagger
 * /orders/{id}/cancel:
 *   put:
 *     summary: إلغاء طلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: changed my mind
 *     responses:
 *       200:
 *         description: تم إلغاء الطلب
 *       400:
 *         description: لا يمكن إلغاء الطلب في هذه المرحلة
 */
router.put("/:id/cancel", auth, role("client"), validate(cancelOrderSchema), orderController.cancelOrder);

/**
 * @swagger
 * /orders/{id}/track:
 *   get:
 *     summary: تتبع طلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: معلومات تتبع الطلب
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     driverLocation:
 *                       type: object
 *                     estimatedArrival:
 *                       type: string
 *                     timeline:
 *                       type: array
 */
router.get("/track/:id", auth, orderController.trackOrder);

/**
 * @swagger
 * /orders/{id}/rate:
 *   post:
 *     summary: تقييم طلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               review:
 *                 type: string
 *               driverRating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       200:
 *         description: تم إضافة التقييم
 */
router.post("/:id/rate", auth, role('client'), validate(rateOrderSchema), orderController.rateOrder);

/**
 * @swagger
 * /orders/{id}/report-issue:
 *   post:
 *     summary: الإبلاغ عن مشكلة في الطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issueType
 *             properties:
 *               issueType:
 *                 type: string
 *                 enum: [wrong_item, missing_item, damaged, late, other]
 *               description:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: تم الإبلاغ عن المشكلة
 */
router.post("/:id/report-issue", auth, validate(reportIssueSchema), orderController.reportOrderIssue);

/**
 * @swagger
 * /orders/{id}/location:
 *   get:
 *     summary: موقع المندوب الحالي للطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get("/:id/location", auth, orderController.getDriverLocation);

/**
 * @swagger
 * /orders/{id}/timeline:
 *   get:
 *     summary: الجدول الزمني للطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get("/:id/timeline", auth, orderController.getOrderTimeline);

// ========== 2. مسارات المندوبين (Driver) ==========

/**
 * @swagger
 * /orders/driver/deliveries:
 *   get:
 *     summary: قائمة التوصيلات الخاصة بالمندوب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/driver/deliveries', auth, driverMiddleware, PaginationUtils.validatePaginationParams, orderController.getDriverOrders);

/**
 * @swagger
 * /orders/driver/current-delivery:
 *   get:
 *     summary: التوصيل الحالي للمندوب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/driver/current-delivery', auth, driverMiddleware, orderController.getCurrentDelivery);

/**
 * @swagger
 * /orders/driver/{id}/status:
 *   put:
 *     summary: تحديث حالة الطلب (للمندوب)
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [picked, delivered]
 *               location:
 *                 type: object
 *     responses:
 *       200:
 *         description: تم تحديث الحالة
 */
router.put("/driver/:id/status", auth, driverMiddleware, noCache, validate(updateStatusSchema), orderController.updateStatus);

/**
 * @swagger
 * /orders/driver/{id}/location:
 *   post:
 *     summary: تحديث موقع المندوب للطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.post("/driver/:id/location", auth, driverMiddleware, orderController.updateDriverLocation);

/**
 * @swagger
 * /orders/driver/earnings:
 *   get:
 *     summary: أرباح المندوب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/driver/earnings', auth, driverMiddleware, orderController.getDriverEarnings);

// ========== 3. مسارات أصحاب المتاجر (Vendor) ==========

/**
 * @swagger
 * /orders/vendor/orders:
 *   get:
 *     summary: طلبات المتجر (لصاحب المتجر)
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, preparing, ready, picked, delivered, cancelled]
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 */
router.get('/vendor/orders', auth, storeOwnerMiddleware, PaginationUtils.validatePaginationParams, orderController.getVendorOrders);

/**
 * @swagger
 * /orders/vendor/orders/stats:
 *   get:
 *     summary: إحصائيات طلبات المتجر
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/vendor/orders/stats', auth, storeOwnerMiddleware, orderController.getVendorOrderStats);

/**
 * @swagger
 * /orders/vendor/orders/today:
 *   get:
 *     summary: طلبات اليوم للمتجر
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/vendor/orders/today', auth, storeOwnerMiddleware, orderController.getTodayOrders);

/**
 * @swagger
 * /orders/vendor/{id}/accept:
 *   put:
 *     summary: قبول طلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.put("/vendor/:id/accept", auth, storeOwnerMiddleware, orderController.acceptOrder);

/**
 * @swagger
 * /orders/vendor/{id}/reject:
 *   put:
 *     summary: رفض طلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 */
router.put("/vendor/:id/reject", auth, storeOwnerMiddleware, orderController.rejectOrder);

/**
 * @swagger
 * /orders/vendor/{id}/mark-ready:
 *   put:
 *     summary: تجهيز الطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.put("/vendor/:id/mark-ready", auth, storeOwnerMiddleware, orderController.markOrderReady);

/**
 * @swagger
 * /orders/vendor/{id}/start-preparing:
 *   put:
 *     summary: بدء تحضير الطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.put("/vendor/:id/start-preparing", auth, storeOwnerMiddleware, orderController.startPreparing);

// ========== 4. مسارات الأدمن (Admin) ==========

/**
 * @swagger
 * /orders/admin/orders:
 *   get:
 *     summary: جميع الطلبات (للمشرف)
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);

/**
 * @swagger
 * /orders/admin/orders/stats/overview:
 *   get:
 *     summary: نظرة عامة على إحصائيات الطلبات
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/orders/stats/overview', auth, role('admin'), orderController.getOrderStats);

/**
 * @swagger
 * /orders/admin/orders/stats/daily:
 *   get:
 *     summary: إحصائيات يومية للطلبات
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/orders/stats/daily', auth, role('admin'), orderController.getDailyStats);

/**
 * @swagger
 * /orders/admin/orders/stats/monthly:
 *   get:
 *     summary: إحصائيات شهرية للطلبات
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/orders/stats/monthly', auth, role('admin'), orderController.getMonthlyStats);

/**
 * @swagger
 * /orders/admin/{id}/assign:
 *   put:
 *     summary: تعيين مندوب للطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 */
router.put("/admin/:id/assign", auth, role("admin"), validate(assignDriverSchema), orderController.assignDriver);

/**
 * @swagger
 * /orders/admin/{id}/reassign:
 *   put:
 *     summary: إعادة تعيين مندوب للطلب
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.put("/admin/:id/reassign", auth, role("admin"), orderController.reassignDriver);

/**
 * @swagger
 * /orders/admin/{id}/force-cancel:
 *   put:
 *     summary: إلغاء طلب بالقوة (للمشرف)
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.put("/admin/:id/force-cancel", auth, role("admin"), validate(cancelOrderSchema), orderController.forceCancelOrder);

/**
 * @swagger
 * /orders/admin/drivers/{id}/orders:
 *   get:
 *     summary: طلبات مندوب محدد
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/drivers/:id/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getDriverOrdersById);

/**
 * @swagger
 * /orders/admin/stores/{id}/orders:
 *   get:
 *     summary: طلبات متجر محدد
 *     tags: [📦 Orders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/stores/:id/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getStoreOrdersById);

module.exports = router;