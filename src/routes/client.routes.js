// ============================================
// ملف: src/routes/client.routes.js
// الوصف: مسارات العملاء الموحدة
// الإصدار: 3.0
// ============================================

const express = require('express');
const router = express.Router();

const { 
  userController,
  orderController,
  addressController,
  favoriteController,
  reviewController,
  loyaltyController,
  notificationController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// Validators
const {
  updateProfileSchema,
  avatarSchema,
  presenceSchema
} = require('../validators/user.validator');

const {
  createOrderSchema,
  cancelOrderSchema,
  rateOrderSchema,
  reportIssueSchema
} = require('../validators/order.validator');

const {
  createAddressSchema,
  updateAddressSchema
} = require('../validators/address.validator');

/**
 * @swagger
 * tags:
 *   name: 👤 Client
 *   description: مسارات العملاء (المستخدمين العاديين)
 */

// جميع المسارات تحتاج توثيق ودور client
router.use(auth);
router.use(role('client'));

// ========== 1. الملف الشخصي ==========

/**
 * @swagger
 * /client/profile:
 *   get:
 *     summary: الحصول على ملفي الشخصي
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات الملف الشخصي
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/profile', userController.getMyProfile);

/**
 * @swagger
 * /client/profile/complete:
 *   get:
 *     summary: الحصول على الملف الشخصي الكامل (مع بيانات إضافية)
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: الملف الشخصي الكامل
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     addresses:
 *                       type: array
 *                     recentOrders:
 *                       type: array
 *                     favoriteStores:
 *                       type: array
 *                     recentReviews:
 *                       type: array
 *                     stats:
 *                       type: object
 *                     summary:
 *                       type: object
 */
router.get('/profile/complete', userController.getMyCompleteProfile);

/**
 * @swagger
 * /client/profile:
 *   put:
 *     summary: تحديث الملف الشخصي
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileInput'
 *     responses:
 *       200:
 *         description: تم تحديث الملف الشخصي
 */
router.put('/profile', validate(updateProfileSchema), userController.updateMyProfile);

/**
 * @swagger
 * /client/profile/avatar:
 *   put:
 *     summary: رفع صورة شخصية
 *     tags: [👤 Client]
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     image:
 *                       type: object
 */
router.put('/profile/avatar', 
  validate(avatarSchema),
  upload('users/avatars', ['image']).single('image'), 
  userController.uploadAvatar
);

/**
 * @swagger
 * /client/profile/cover:
 *   put:
 *     summary: رفع صورة الغلاف
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
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
 *         description: تم تحديث صورة الغلاف
 */
router.put('/profile/cover', 
  upload('users/covers', ['image']).single('image'), 
  userController.updateCoverImage
);

/**
 * @swagger
 * /client/profile/avatar:
 *   delete:
 *     summary: حذف الصورة الشخصية
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم حذف الصورة الشخصية
 */
router.delete('/profile/avatar', userController.deleteAvatar);

/**
 * @swagger
 * /client/profile/presence:
 *   put:
 *     summary: تحديث حالة التواجد
 *     tags: [👤 Client]
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
 *         description: تم تحديث حالة التواجد
 */
router.put('/profile/presence', validate(presenceSchema), userController.updatePresence);

// ========== 2. الطلبات ==========

/**
 * @swagger
 * /client/orders:
 *   get:
 *     summary: قائمة طلباتي
 *     tags: [👤 Client]
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
 *           enum: [pending, accepted, ready, picked, delivered, cancelled]
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
 *                       $ref: '#/components/schemas/Pagination'
 *                     stats:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);

/**
 * @swagger
 * /client/orders:
 *   post:
 *     summary: إنشاء طلب جديد
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderInput'
 *     responses:
 *       201:
 *         description: تم إنشاء الطلب بنجاح
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
 *                     assignedDriver:
 *                       type: object
 *                     timeline:
 *                       type: array
 *                     estimatedDelivery:
 *                       type: string
 *       400:
 *         description: بيانات غير صحيحة أو المتجر مغلق
 */
router.post('/orders', validate(createOrderSchema), orderController.createOrder);

/**
 * @swagger
 * /client/orders/{id}:
 *   get:
 *     summary: تفاصيل طلب محدد
 *     tags: [👤 Client]
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
 *                     tracking:
 *                       type: object
 *                     timeline:
 *                       type: array
 *                     permissions:
 *                       type: object
 *       403:
 *         description: ليس لديك صلاحية لعرض هذا الطلب
 *       404:
 *         description: الطلب غير موجود
 */
router.get('/orders/:id', orderController.getOrderDetails);

/**
 * @swagger
 * /client/orders/{id}/cancel:
 *   put:
 *     summary: إلغاء طلب
 *     tags: [👤 Client]
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
 *             $ref: '#/components/schemas/CancelOrderInput'
 *     responses:
 *       200:
 *         description: تم إلغاء الطلب
 *       400:
 *         description: لا يمكن إلغاء الطلب في هذه المرحلة
 */
router.put('/orders/:id/cancel', validate(cancelOrderSchema), orderController.cancelOrder);

/**
 * @swagger
 * /client/orders/{id}/track:
 *   get:
 *     summary: تتبع طلب
 *     tags: [👤 Client]
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
 *                     trackingPoints:
 *                       type: array
 *                     driver:
 *                       type: object
 *                     store:
 *                       type: object
 */
router.get('/orders/:id/track', orderController.trackOrder);

/**
 * @swagger
 * /client/orders/{id}/rate:
 *   post:
 *     summary: تقييم طلب
 *     tags: [👤 Client]
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
 *             $ref: '#/components/schemas/RateOrderInput'
 *     responses:
 *       200:
 *         description: تم إضافة التقييم
 */
router.post('/orders/:id/rate', validate(rateOrderSchema), orderController.rateOrder);

/**
 * @swagger
 * /client/orders/{id}/report-issue:
 *   post:
 *     summary: الإبلاغ عن مشكلة في الطلب
 *     tags: [👤 Client]
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
 *             $ref: '#/components/schemas/ReportIssueInput'
 *     responses:
 *       201:
 *         description: تم الإبلاغ عن المشكلة
 */
router.post('/orders/:id/report-issue', validate(reportIssueSchema), orderController.reportOrderIssue);

/**
 * @swagger
 * /client/orders/{id}/location:
 *   get:
 *     summary: موقع المندوب الحالي للطلب
 *     tags: [👤 Client]
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
 *         description: موقع المندوب
 */
router.get('/orders/:id/location', orderController.getDriverLocation);

/**
 * @swagger
 * /client/orders/{id}/timeline:
 *   get:
 *     summary: الجدول الزمني للطلب
 *     tags: [👤 Client]
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
 *         description: الجدول الزمني
 */
router.get('/orders/:id/timeline', orderController.getOrderTimeline);

// ========== 3. العناوين ==========

/**
 * @swagger
 * /client/addresses:
 *   get:
 *     summary: قائمة عناويني
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: قائمة العناوين
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Address'
 */
router.get('/addresses', addressController.getMyAddresses);

/**
 * @swagger
 * /client/addresses:
 *   post:
 *     summary: إضافة عنوان جديد
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAddressInput'
 *     responses:
 *       201:
 *         description: تم إضافة العنوان
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Address'
 */
router.post('/addresses', validate(createAddressSchema), addressController.createAddress);

/**
 * @swagger
 * /client/addresses/{id}:
 *   put:
 *     summary: تحديث عنوان
 *     tags: [👤 Client]
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
 *             $ref: '#/components/schemas/UpdateAddressInput'
 *     responses:
 *       200:
 *         description: تم تحديث العنوان
 */
router.put('/addresses/:id', validate(updateAddressSchema), addressController.updateAddress);

/**
 * @swagger
 * /client/addresses/{id}:
 *   delete:
 *     summary: حذف عنوان
 *     tags: [👤 Client]
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
 *         description: تم حذف العنوان
 */
router.delete('/addresses/:id', addressController.deleteAddress);

/**
 * @swagger
 * /client/addresses/{id}/set-default:
 *   put:
 *     summary: تعيين عنوان كافتراضي
 *     tags: [👤 Client]
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
 *         description: تم تعيين العنوان كافتراضي
 */
router.put('/addresses/:id/set-default', addressController.setDefaultAddress);

/**
 * @swagger
 * /client/addresses/{id}:
 *   get:
 *     summary: تفاصيل عنوان محدد
 *     tags: [👤 Client]
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
 *         description: تفاصيل العنوان
 */
router.get('/addresses/:id', addressController.getAddressById);

// ========== 4. المفضلة ==========

/**
 * @swagger
 * /client/favorites:
 *   get:
 *     summary: قائمة المتاجر المفضلة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: قائمة المتاجر المفضلة
 */
router.get('/favorites', favoriteController.getUserFavorites);

/**
 * @swagger
 * /client/favorites/{storeId}:
 *   post:
 *     summary: إضافة متجر إلى المفضلة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: تمت الإضافة إلى المفضلة
 */
router.post('/favorites/:storeId', favoriteController.addToFavorites);

/**
 * @swagger
 * /client/favorites/{storeId}:
 *   delete:
 *     summary: إزالة متجر من المفضلة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تمت الإزالة من المفضلة
 */
router.delete('/favorites/:storeId', favoriteController.removeFromFavorites);

/**
 * @swagger
 * /client/favorites/{storeId}/status:
 *   get:
 *     summary: التحقق من حالة المفضلة لمتجر
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: حالة المفضلة
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
 *                     isFavorite:
 *                       type: boolean
 *                     storeId:
 *                       type: string
 */
router.get('/favorites/:storeId/status', favoriteController.checkFavoriteStatus);

/**
 * @swagger
 * /client/favorites/{storeId}:
 *   put:
 *     summary: تحديث المفضلة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: تم تحديث المفضلة
 */
router.put('/favorites/:storeId', favoriteController.updateFavorite);

// ========== 5. التقييمات ==========

/**
 * @swagger
 * /client/reviews/{storeId}:
 *   post:
 *     summary: إضافة تقييم لمتجر
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
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
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: تم إضافة التقييم
 */
router.post('/reviews/:storeId', reviewController.addReview);

// ========== 6. نقاط الولاء ==========

/**
 * @swagger
 * /client/loyalty/points:
 *   get:
 *     summary: نقاط الولاء الخاصة بي
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: نقاط الولاء
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/LoyaltyPoints'
 */
router.get('/loyalty/points', loyaltyController.getPoints);

/**
 * @swagger
 * /client/loyalty/rewards:
 *   get:
 *     summary: المكافآت المتاحة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [discount, free_item, free_delivery, exclusive]
 *       - in: query
 *         name: minPoints
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: قائمة المكافآت
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
 *                     available:
 *                       type: array
 *                     upcoming:
 *                       type: array
 *                     special:
 *                       type: array
 *                     userPoints:
 *                       type: integer
 */
router.get('/loyalty/rewards', loyaltyController.getRewards);

/**
 * @swagger
 * /client/loyalty/transactions:
 *   get:
 *     summary: سجل معاملات النقاط
 *     tags: [👤 Client]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [earned, redeemed, expired, adjusted]
 *     responses:
 *       200:
 *         description: سجل المعاملات
 */
router.get('/loyalty/transactions', loyaltyController.getTransactions);

/**
 * @swagger
 * /client/loyalty/redeem:
 *   post:
 *     summary: استبدال النقاط
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rewardId
 *             properties:
 *               rewardId:
 *                 type: string
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم استبدال النقاط
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
 *                     reward:
 *                       type: object
 *                     pointsAfter:
 *                       type: integer
 *                     code:
 *                       type: string
 */
router.post('/loyalty/redeem', loyaltyController.redeemPoints);

/**
 * @swagger
 * /client/loyalty/stats:
 *   get:
 *     summary: إحصائيات الولاء
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الولاء
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
 *                     currentPoints:
 *                       type: integer
 *                     tier:
 *                       type: string
 *                     multiplier:
 *                       type: number
 *                     memberSince:
 *                       type: string
 *                     lastActivity:
 *                       type: string
 *                     totalTransactions:
 *                       type: integer
 *                     monthly:
 *                       type: object
 *                     nextTier:
 *                       type: object
 */
router.get('/loyalty/stats', loyaltyController.getStats);

// ========== 7. الإشعارات ==========

/**
 * @swagger
 * /client/notifications:
 *   get:
 *     summary: قائمة إشعاراتي
 *     tags: [👤 Client]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [order, promotion, system, chat, loyalty]
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: قائمة الإشعارات
 */
router.get('/notifications', PaginationUtils.validatePaginationParams, notificationController.getUserNotifications);

/**
 * @swagger
 * /client/notifications/unread-count:
 *   get:
 *     summary: عدد الإشعارات غير المقروءة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: عدد الإشعارات غير المقروءة
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
 *                     unreadCount:
 *                       type: integer
 */
router.get('/notifications/unread-count', notificationController.getUnreadCount);

/**
 * @swagger
 * /client/notifications/stats:
 *   get:
 *     summary: إحصائيات الإشعارات
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الإشعارات
 */
router.get('/notifications/stats', notificationController.getNotificationStats);

/**
 * @swagger
 * /client/notifications/{id}/read:
 *   put:
 *     summary: تعليم إشعار كمقروء
 *     tags: [👤 Client]
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
 *         description: تم تعليم الإشعار كمقروء
 */
router.put('/notifications/:id/read', notificationController.markAsRead);

/**
 * @swagger
 * /client/notifications/{id}/unread:
 *   put:
 *     summary: تعليم إشعار كغير مقروء
 *     tags: [👤 Client]
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
 *         description: تم تعليم الإشعار كغير مقروء
 */
router.put('/notifications/:id/unread', notificationController.markAsUnread);

/**
 * @swagger
 * /client/notifications/{id}/archive:
 *   put:
 *     summary: أرشفة إشعار
 *     tags: [👤 Client]
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
 *         description: تم أرشفة الإشعار
 */
router.put('/notifications/:id/archive', notificationController.archive);

/**
 * @swagger
 * /client/notifications/{id}:
 *   delete:
 *     summary: حذف إشعار
 *     tags: [👤 Client]
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
 *         description: تم حذف الإشعار
 */
router.delete('/notifications/:id', notificationController.deleteNotification);

/**
 * @swagger
 * /client/notifications/mark-all-read:
 *   put:
 *     summary: تعليم جميع الإشعارات كمقروءة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم تعليم جميع الإشعارات كمقروءة
 */
router.put('/notifications/mark-all-read', notificationController.markAllAsRead);

/**
 * @swagger
 * /client/notifications/read/cleanup:
 *   delete:
 *     summary: حذف جميع الإشعارات المقروءة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم حذف الإشعارات المقروءة
 */
router.delete('/notifications/read/cleanup', notificationController.deleteReadNotifications);

/**
 * @swagger
 * /client/notifications/preferences:
 *   put:
 *     summary: تحديث تفضيلات الإشعارات
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: boolean
 *               push:
 *                 type: boolean
 *               sms:
 *                 type: boolean
 *               orderUpdates:
 *                 type: boolean
 *               promotions:
 *                 type: boolean
 *               system:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: تم تحديث تفضيلات الإشعارات
 */
router.put('/notifications/preferences', notificationController.updateNotificationPreferences);

/**
 * @swagger
 * /client/notifications/devices:
 *   post:
 *     summary: تسجيل جهاز للإشعارات
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *               - platform
 *             properties:
 *               deviceId:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [ios, android, web]
 *               pushToken:
 *                 type: string
 *               model:
 *                 type: string
 *               appVersion:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تسجيل الجهاز
 */
router.post('/notifications/devices', notificationController.registerDevice);

/**
 * @swagger
 * /client/notifications/devices/{deviceId}:
 *   delete:
 *     summary: إلغاء تسجيل جهاز
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إلغاء تسجيل الجهاز
 */
router.delete('/notifications/devices/:deviceId', notificationController.unregisterDevice);

// ========== 8. إحصائيات ==========

/**
 * @swagger
 * /client/stats:
 *   get:
 *     summary: إحصائيات المستخدم
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الطلبات والنشاط
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
 *                       type: object
 *                     reviews:
 *                       type: object
 *                     memberSince:
 *                       type: object
 *                     lastActive:
 *                       type: object
 */
router.get('/stats', userController.getUserStats);

/**
 * @swagger
 * /client/activity:
 *   get:
 *     summary: سجل النشاطات
 *     tags: [👤 Client]
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
 *     responses:
 *       200:
 *         description: سجل النشاطات
 */
router.get('/activity', PaginationUtils.validatePaginationParams, userController.getActivityLog);

module.exports = router;