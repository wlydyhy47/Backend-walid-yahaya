// ============================================
// ملف: src/routes/client.routes.js
// الوصف: مسارات العملاء الموحدة
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
 *                     coverImage:
 *                       type: string
 *                     role:
 *                       type: string
 *                     isVerified:
 *                       type: boolean
 *                     loyaltyPoints:
 *                       type: integer
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
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: أحمد محمد
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [male, female]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isOnline:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [online, away, busy, offline]
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
 *           enum: [pending, accepted, preparing, ready, picked, delivered, cancelled]
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
 *               useLoyaltyPoints:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: تم إنشاء الطلب بنجاح
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
router.put('/orders/:id/cancel', validate(cancelOrderSchema), orderController.cancelOrder);

/**
 * @swagger
 * /client/orders/{id}/track:
 *   get:
 *     summary: تتبع طلب
 *     tags: [👤 Client]
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
 *                       properties:
 *                         latitude:
 *                           type: number
 *                         longitude:
 *                           type: number
 *                     estimatedArrival:
 *                       type: string
 *                       format: date-time
 *                     timeline:
 *                       type: array
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
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               review:
 *                 type: string
 *                 example: خدمة ممتازة وسرعة في التوصيل
 *               driverRating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
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
 */
router.post('/orders/:id/report-issue', validate(reportIssueSchema), orderController.reportOrderIssue);

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
 *             type: object
 *             required:
 *               - title
 *               - address
 *               - latitude
 *               - longitude
 *             properties:
 *               title:
 *                 type: string
 *                 example: المنزل
 *               address:
 *                 type: string
 *                 example: شارع الملك فهد، الرياض
 *               latitude:
 *                 type: number
 *                 example: 24.7136
 *               longitude:
 *                 type: number
 *                 example: 46.6753
 *               apartment:
 *                 type: string
 *               floor:
 *                 type: string
 *               landmark:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *                 default: false
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
 */
router.get('/favorites/:storeId/status', favoriteController.checkFavoriteStatus);

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
 */
router.get('/notifications/unread-count', notificationController.getUnreadCount);

/**
 * @swagger
 * /client/notifications/{id}/read:
 *   put:
 *     summary: تعليم إشعار كمقروء
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 */
router.put('/notifications/:id/read', notificationController.markAsRead);

/**
 * @swagger
 * /client/notifications/mark-all-read:
 *   put:
 *     summary: تعليم جميع الإشعارات كمقروءة
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
 */
router.put('/notifications/mark-all-read', notificationController.markAllAsRead);

/**
 * @swagger
 * /client/notifications/preferences:
 *   put:
 *     summary: تحديث تفضيلات الإشعارات
 *     tags: [👤 Client]
 *     security:
 *       - bearerAuth: []
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
 */
router.post('/notifications/devices', notificationController.registerDevice);

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
 */
router.get('/activity', PaginationUtils.validatePaginationParams, userController.getActivityLog);

module.exports = router;