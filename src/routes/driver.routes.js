// ============================================
// ملف: src/routes/driver.routes.js
// الوصف: مسارات المندوبين الموحدة
// الإصدار: 3.0
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     avatar:
 *                       type: string
 *                     isAvailable:
 *                       type: boolean
 *                     currentLocation:
 *                       type: object
 *                     rating:
 *                       type: number
 *                     totalDeliveries:
 *                       type: integer
 *                     totalEarnings:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: غير مصرح - يتطلب دور مندوب
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
 *                 example: 24.7136
 *               longitude:
 *                 type: number
 *                 example: 46.6753
 *               accuracy:
 *                 type: number
 *                 description: دقة الموقع بالمتر
 *               heading:
 *                 type: number
 *                 description: الاتجاه بالدرجات
 *               speed:
 *                 type: number
 *                 description: السرعة كم/ساعة
 *     responses:
 *       200:
 *         description: تم تحديث الموقع
 */
router.put('/profile/location', driverController.updateLocation);

// ========== 2. التوصيلات ==========

/**
 * @swagger
 * /driver/deliveries:
 *   get:
 *     summary: قائمة التوصيلات الخاصة بي
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
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: قائمة التوصيلات
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
 *                       $ref: '#/components/schemas/Pagination'
 *                     stats:
 *                       type: object
 */
router.get('/deliveries', PaginationUtils.validatePaginationParams, orderController.getDriverOrders);

/**
 * @swagger
 * /driver/deliveries/current:
 *   get:
 *     summary: التوصيل الحالي
 *     tags: [🚗 Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات التوصيل الحالي
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
 *                     order:
 *                       $ref: '#/components/schemas/Order'
 *                     driverLocation:
 *                       type: object
 *                     estimatedDelivery:
 *                       type: string
 *                     timeline:
 *                       type: array
 *       204:
 *         description: لا يوجد توصيل حالي
 */
router.get('/deliveries/current', orderController.getCurrentDelivery);

/**
 * @swagger
 * /driver/deliveries/{id}:
 *   get:
 *     summary: تفاصيل توصيل محدد
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
 *         description: تفاصيل التوصيل
 */
router.get('/deliveries/:id', orderController.getOrderDetails);

/**
 * @swagger
 * /driver/deliveries/{id}/status:
 *   put:
 *     summary: تحديث حالة التوصيل
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
router.put('/deliveries/:id/status', validate(updateStatusSchema), orderController.updateStatus);

/**
 * @swagger
 * /driver/deliveries/{id}/location:
 *   post:
 *     summary: تحديث موقع التوصيل الحالي
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
router.post('/deliveries/:id/location', orderController.updateDriverLocation);

/**
 * @swagger
 * /driver/deliveries/{id}/track:
 *   get:
 *     summary: تتبع تقدم التوصيل
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
 *         description: معلومات التتبع
 */
router.get('/deliveries/:id/track', orderController.trackOrder);

// ========== 3. الأرباح ==========

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
 *                     period:
 *                       type: string
 *                     earnings:
 *                       type: array
 *                     totals:
 *                       type: object
 *                     currency:
 *                       type: string
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
 *                     today:
 *                       type: object
 *                     week:
 *                       type: object
 *                     month:
 *                       type: object
 *                     total:
 *                       type: object
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
 *                     earnings:
 *                       type: array
 *                     monthlyStats:
 *                       type: array
 *                     stats:
 *                       type: object
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 */
router.get('/earnings/history', PaginationUtils.validatePaginationParams, driverController.getEarningsHistory);

// ========== 4. الإحصائيات ==========

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
 *                     today:
 *                       type: object
 *                     week:
 *                       type: object
 *                     month:
 *                       type: object
 *                     total:
 *                       type: object
 *                     recentOrders:
 *                       type: array
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
 *                     period:
 *                       type: object
 *                     performance:
 *                       type: object
 *                     summary:
 *                       type: object
 */
router.get('/performance', driverController.getPerformanceReport);

module.exports = router;