// ============================================
// ملف: src/routes/driver.routes.js (النسخة المحسنة)
// الوصف: مسارات المندوبين الموحدة
// الإصدار: 4.0
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

// Validators
const {
  avatarSchema,
  presenceSchema
} = require('../validators/user.validator');

const {
  updateStatusSchema
} = require('../validators/order.validator');

/**
 * @swagger
 * tags:
 *   name: 🚗 Driver
 *   description: مسارات المندوبين
 */

// جميع المسارات تحتاج توثيق ودور driver
router.use(auth);
router.use(driverMiddleware);

// ========== 1. ملف المندوب الشخصي ==========

/**
 * @swagger
 * /driver/profile:
 *   get:
 *     summary: ملف المندوب الشخصي
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات المندوب
 */
router.get('/profile', driverController.getMyProfile);

/**
 * @swagger
 * /driver/profile/avatar:
 *   put:
 *     summary: رفع صورة شخصية للمندوب
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: تم تحديث الصورة الشخصية
 */
router.put('/profile/avatar', 
  validate(avatarSchema),
  upload('users/avatars', ['image']).single('image'), 
  driverController.updateAvatar
);

/**
 * @swagger
 * /driver/profile/availability:
 *   put:
 *     summary: تغيير حالة التوفر (متاح/غير متاح)
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PresenceInput'
 *     responses:
 *       200:
 *         description: تم تغيير حالة التوفر
 */
router.put('/profile/availability', validate(presenceSchema), driverController.toggleAvailability);

/**
 * @swagger
 * /driver/profile/location:
 *   put:
 *     summary: تحديث موقع المندوب الحالي
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               accuracy:
 *                 type: number
 *               heading:
 *                 type: number
 *               speed:
 *                 type: number
 *     responses:
 *       200:
 *         description: تم تحديث الموقع
 */
router.put('/profile/location', driverController.updateLocation);

// ========== 2. التوصيلات ==========

/**
 * @swagger
 * /driver/orders:
 *   get:
 *     summary: قائمة الطلبات الخاصة بي
 *     tags: [🚗 Driver]
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
 *           enum: [pending, accepted, picked, delivered, cancelled]
 *     responses:
 *       200:
 *         description: قائمة الطلبات
 */
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getDriverOrders);

/**
 * @swagger
 * /driver/orders/active:
 *   get:
 *     summary: الطلب الحالي (قيد التوصيل)
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات الطلب الحالي
 *       204:
 *         description: لا يوجد طلب حالي
 */
router.get('/orders/active', orderController.getCurrentDelivery);

/**
 * @swagger
 * /driver/orders/history:
 *   get:
 *     summary: ✅ NEW - تاريخ الطلبات المكتملة
 *     tags: [🚗 Driver]
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
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: تاريخ الطلبات مع إحصائيات
 */
router.get('/orders/history', PaginationUtils.validatePaginationParams, orderController.getDriverOrdersHistory);

/**
 * @swagger
 * /driver/orders/{id}:
 *   get:
 *     summary: تفاصيل طلب محدد
 *     tags: [🚗 Driver]
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
 */
router.get('/orders/:id', orderController.getOrderDetails);

/**
 * @swagger
 * /driver/orders/{id}/accept:
 *   put:
 *     summary: قبول طلب
 *     tags: [🚗 Driver]
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
 *         description: تم قبول الطلب
 */
router.put('/orders/:id/accept', orderController.acceptOrder);

/**
 * @swagger
 * /driver/orders/{id}/reject:
 *   put:
 *     summary: رفض طلب
 *     tags: [🚗 Driver]
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
 *     responses:
 *       200:
 *         description: تم رفض الطلب
 */
router.put('/orders/:id/reject', orderController.rejectOrder);

/**
 * @swagger
 * /driver/orders/{id}/status:
 *   put:
 *     summary: تحديث حالة الطلب
 *     tags: [🚗 Driver]
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
 *             $ref: '#/components/schemas/UpdateStatusInput'
 *     responses:
 *       200:
 *         description: تم تحديث الحالة
 */
router.put('/orders/:id/status', validate(updateStatusSchema), orderController.updateStatus);

/**
 * @swagger
 * /driver/orders/{id}/start:
 *   post:
 *     summary: ✅ NEW - بدء التوصيل (تغيير الحالة إلى picked)
 *     tags: [🚗 Driver]
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
 *         description: تم بدء التوصيل بنجاح
 */
router.post('/orders/:id/start', orderController.startDelivery);

/**
 * @swagger
 * /driver/orders/{id}/complete:
 *   post:
 *     summary: ✅ NEW - إنهاء الطلب (تغيير الحالة إلى delivered)
 *     tags: [🚗 Driver]
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
 *               signature:
 *                 type: string
 *               deliveryPhoto:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم إنهاء الطلب بنجاح
 */
router.post('/orders/:id/complete', orderController.completeOrder);

// ========== 3. الموقع والتتبع ==========

/**
 * @swagger
 * /driver/location:
 *   put:
 *     summary: تحديث موقع المندوب الحالي
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               accuracy:
 *                 type: number
 *               heading:
 *                 type: number
 *               speed:
 *                 type: number
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تحديث الموقع
 */
router.put('/location', driverController.updateLocation);

/**
 * @swagger
 * /driver/location/current:
 *   get:
 *     summary: الحصول على الموقع الحالي للمندوب
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: الموقع الحالي
 */
router.get('/location/current', driverController.getCurrentLocation);

/**
 * @swagger
 * /driver/location/order/{orderId}:
 *   get:
 *     summary: ✅ NEW - الحصول على موقع الطلب (الاستلام والتوصيل)
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: موقع الاستلام والتوصيل
 */
router.get('/location/order/:orderId', orderController.getOrderLocation);

// ========== 4. الأرباح ==========

/**
 * @swagger
 * /driver/earnings:
 *   get:
 *     summary: أرباح المندوب
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, all]
 *           default: week
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: بيانات الأرباح
 */
router.get('/earnings', orderController.getDriverEarnings);

/**
 * @swagger
 * /driver/earnings/stats:
 *   get:
 *     summary: إحصائيات الأرباح
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الأرباح
 */
router.get('/earnings/stats', driverController.getMyStats);

/**
 * @swagger
 * /driver/earnings/history:
 *   get:
 *     summary: سجل الأرباح
 *     tags: [🚗 Driver]
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
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: سجل الأرباح
 */
router.get('/earnings/history', PaginationUtils.validatePaginationParams, driverController.getEarningsHistory);

// ========== 5. الإحصائيات ==========

/**
 * @swagger
 * /driver/stats:
 *   get:
 *     summary: إحصائيات المندوب
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الأداء
 */
router.get('/stats', driverController.getMyStats);

/**
 * @swagger
 * /driver/performance:
 *   get:
 *     summary: تقرير أداء المندوب
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: week
 *     responses:
 *       200:
 *         description: تقرير الأداء
 */
router.get('/performance', driverController.getPerformanceReport);

module.exports = router;