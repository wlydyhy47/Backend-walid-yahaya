// ============================================
// ملف: src/routes/vendor.routes.js
// الوصف: مسارات أصحاب المتاجر الموحدة
// الإصدار: 3.0
// ============================================

const express = require('express');
const router = express.Router();

const { 
  vendorController,
  productController,
  orderController,
  reviewController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const { storeOwnerMiddleware } = require('../middlewares/role.middleware');
const handleFormData = require('../middlewares/formDataHandler');
const validate = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// Validators
const {
  updateProfileSchema,
  avatarSchema
} = require('../validators/user.validator');

const {
  createStoreSchema,
  updateStoreSchema
} = require('../validators/store.validator');

const {
  createProductSchema,
  updateProductSchema,
  updateInventorySchema
} = require('../validators/product.validator');

/**
 * @swagger
 * tags:
 *   name: 🏪 Vendor
 *   description: مسارات أصحاب المتاجر
 */

// جميع المسارات تحتاج توثيق ودور vendor
router.use(auth);
router.use(storeOwnerMiddleware);

// ========== 1. ملف التاجر الشخصي ==========

/**
 * @swagger
 * /vendor/profile:
 *   get:
 *     summary: ملف التاجر الشخصي
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات التاجر والمتجر
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
 *                     storeStats:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: غير مصرح - يتطلب دور تاجر
 */
router.get('/profile', vendorController.getMyProfile);

/**
 * @swagger
 * /vendor/profile:
 *   put:
 *     summary: تحديث الملف الشخصي للتاجر
 *     tags: [🏪 Vendor]
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
router.put('/profile', validate(updateProfileSchema), vendorController.updateProfile);

/**
 * @swagger
 * /vendor/profile/avatar:
 *   put:
 *     summary: رفع صورة شخصية للتاجر
 *     tags: [🏪 Vendor]
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
  vendorController.updateAvatar
);

// ========== 2. إدارة المتجر ==========

/**
 * @swagger
 * /vendor/store:
 *   get:
 *     summary: الحصول على بيانات متجري
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات المتجر
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Store'
 */
router.get('/store', vendorController.getMyStore);

/**
 * @swagger
 * /vendor/store:
 *   put:
 *     summary: تحديث بيانات المتجر
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateStoreInput'
 *     responses:
 *       200:
 *         description: تم تحديث المتجر
 */
router.put('/store', validate(updateStoreSchema), vendorController.updateStore);

/**
 * @swagger
 * /vendor/store/logo:
 *   put:
 *     summary: رفع شعار المتجر
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: تم تحديث شعار المتجر
 */
router.put('/store/logo', 
  upload('stores/logos', ['image']).single('logo'), 
  vendorController.updateStoreLogo
);

/**
 * @swagger
 * /vendor/store/cover:
 *   put:
 *     summary: رفع صورة غلاف المتجر
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               cover:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: تم تحديث صورة الغلاف
 */
router.put('/store/cover', 
  upload('stores/covers', ['image']).single('cover'), 
  vendorController.updateStoreCover
);

/**
 * @swagger
 * /vendor/store/toggle-status:
 *   put:
 *     summary: تغيير حالة المتجر (مفتوح/مغلق)
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم تغيير حالة المتجر
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
 *                     isOpen:
 *                       type: boolean
 *                     updatedAt:
 *                       type: string
 */
router.put('/store/toggle-status', vendorController.toggleStoreStatus);

// ========== 3. عناوين المتجر ==========

/**
 * @swagger
 * /vendor/store/addresses:
 *   get:
 *     summary: قائمة عناوين المتجر
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: قائمة العناوين
 */
router.get('/store/addresses', vendorController.getAddresses);

/**
 * @swagger
 * /vendor/store/addresses:
 *   post:
 *     summary: إضافة عنوان جديد للمتجر
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addressLine
 *               - latitude
 *               - longitude
 *             properties:
 *               label:
 *                 type: string
 *                 default: Main Branch
 *               addressLine:
 *                 type: string
 *               city:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               phone:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: تم إنشاء العنوان
 */
router.post('/store/addresses', vendorController.createAddress);

/**
 * @swagger
 * /vendor/store/addresses/{id}:
 *   put:
 *     summary: تحديث عنوان المتجر
 *     tags: [🏪 Vendor]
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
 *               label:
 *                 type: string
 *               addressLine:
 *                 type: string
 *               city:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               phone:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: تم تحديث العنوان
 */
router.put('/store/addresses/:id', vendorController.updateAddress);

/**
 * @swagger
 * /vendor/store/addresses/{id}:
 *   delete:
 *     summary: حذف عنوان المتجر
 *     tags: [🏪 Vendor]
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
router.delete('/store/addresses/:id', vendorController.deleteAddress);

/**
 * @swagger
 * /vendor/store/addresses/{id}:
 *   get:
 *     summary: تفاصيل عنوان محدد
 *     tags: [🏪 Vendor]
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
router.get('/store/addresses/:id', vendorController.getAddressById);

// ========== 4. المنتجات ==========

/**
 * @swagger
 * /vendor/products:
 *   get:
 *     summary: قائمة منتجاتي
 *     tags: [🏪 Vendor]
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
 *           default: 20
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: isAvailable
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: inStock
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: قائمة المنتجات
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
 *                     products:
 *                       type: array
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                     stats:
 *                       type: object
 */
router.get('/products', PaginationUtils.validatePaginationParams, productController.getVendorProducts);

/**
 * @swagger
 * /vendor/products:
 *   post:
 *     summary: إضافة منتج جديد
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductInput'
 *     responses:
 *       201:
 *         description: تم إنشاء المنتج
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: بيانات غير صحيحة
 */
router.post('/products', 
  validate(createProductSchema),
  upload('products', ['image']).single('image'),
   handleFormData, 
  productController.createProduct
);

/**
 * @swagger
 * /vendor/products/{id}:
 *   get:
 *     summary: تفاصيل منتج محدد
 *     tags: [🏪 Vendor]
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
 *         description: تفاصيل المنتج
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 */
router.get('/products/:id', productController.getProductById);

/**
 * @swagger
 * /vendor/products/{id}:
 *   put:
 *     summary: تحديث منتج
 *     tags: [🏪 Vendor]
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
 *             $ref: '#/components/schemas/UpdateProductInput'
 *     responses:
 *       200:
 *         description: تم تحديث المنتج
 */
router.put('/products/:id',
   validate(updateProductSchema),
   handleFormData,
    productController.updateProduct);

/**
 * @swagger
 * /vendor/products/{id}/image:
 *   put:
 *     summary: تحديث صورة المنتج
 *     tags: [🏪 Vendor]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: تم تحديث صورة المنتج
 */
router.put('/products/:id/image', 
  upload('products', ['image']).single('image'), 
  productController.updateProductImage
);

/**
 * @swagger
 * /vendor/products/{id}:
 *   delete:
 *     summary: حذف منتج
 *     tags: [🏪 Vendor]
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
 *         description: تم حذف المنتج
 */
router.delete('/products/:id', productController.deleteProduct);

/**
 * @swagger
 * /vendor/products/{id}/toggle-availability:
 *   put:
 *     summary: تغيير حالة توفر المنتج
 *     tags: [🏪 Vendor]
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
 *         description: تم تغيير حالة التوفر
 */
router.put('/products/:id/toggle-availability', productController.toggleAvailability);

/**
 * @swagger
 * /vendor/products/{id}/inventory:
 *   put:
 *     summary: تحديث المخزون
 *     tags: [🏪 Vendor]
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
 *             $ref: '#/components/schemas/UpdateInventoryInput'
 *     responses:
 *       200:
 *         description: تم تحديث المخزون
 */
router.put('/products/:id/inventory', validate(updateInventorySchema), productController.updateInventory);

// ========== 5. الطلبات ==========

/**
 * @swagger
 * /vendor/orders:
 *   get:
 *     summary: قائمة طلبات المتجر
 *     tags: [🏪 Vendor]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, ready, picked, delivered, cancelled]
 *       - in: query
 *         name: date
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
 */
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getVendorOrders);

/**
 * @swagger
 * /vendor/orders/{id}:
 *   get:
 *     summary: تفاصيل طلب محدد
 *     tags: [🏪 Vendor]
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
 * /vendor/orders/{id}/accept:
 *   put:
 *     summary: قبول طلب
 *     tags: [🏪 Vendor]
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
 *               estimatedTime:
 *                 type: integer
 *                 description: الوقت المتوقع بالدقائق
 *     responses:
 *       200:
 *         description: تم قبول الطلب
 */
router.put('/orders/:id/accept', orderController.acceptOrder);

/**
 * @swagger
 * /vendor/orders/{id}/reject:
 *   put:
 *     summary: رفض طلب
 *     tags: [🏪 Vendor]
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
 *               - reason
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
 * /vendor/orders/{id}/start-preparing:
 *   put:
 *     summary: بدء تحضير الطلب
 *     tags: [🏪 Vendor]
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
 *               estimatedTime:
 *                 type: integer
 *                 description: الوقت المتوقع بالدقائق
 *     responses:
 *       200:
 *         description: تم بدء تحضير الطلب
 */
router.put('/orders/:id/start-preparing', orderController.startPreparing);

/**
 * @swagger
 * /vendor/orders/{id}/mark-ready:
 *   put:
 *     summary: تعليم الطلب جاهز للتسليم
 *     tags: [🏪 Vendor]
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
 *         description: تم تعليم الطلب جاهزاً
 */
router.put('/orders/:id/mark-ready', orderController.markOrderReady);

/**
 * @swagger
 * /vendor/orders/today:
 *   get:
 *     summary: طلبات اليوم
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: طلبات اليوم
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
 *                     stats:
 *                       type: object
 *                     date:
 *                       type: string
 */
router.get('/orders/today', orderController.getTodayOrders);

/**
 * @swagger
 * /vendor/orders/stats:
 *   get:
 *     summary: إحصائيات الطلبات
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الطلبات
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
 *                     weekly:
 *                       type: array
 *                     total:
 *                       type: object
 *                     byStatus:
 *                       type: object
 */
router.get('/orders/stats', orderController.getVendorOrderStats);

// ========== 6. التحليلات ==========

/**
 * @swagger
 * /vendor/analytics:
 *   get:
 *     summary: تحليلات المتجر
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
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
 *         description: بيانات التحليلات
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
 *                     weekly:
 *                       type: object
 *                     monthly:
 *                       type: object
 *                     topProducts:
 *                       type: array
 *                     orderStatus:
 *                       type: object
 */
router.get('/analytics', vendorController.getAnalytics);

/**
 * @swagger
 * /vendor/analytics/financial:
 *   get:
 *     summary: تقرير مالي
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: التقرير المالي
 */
router.get('/analytics/financial', vendorController.getFinancialReport);

/**
 * @swagger
 * /vendor/analytics/performance:
 *   get:
 *     summary: تقرير الأداء
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير الأداء
 */
router.get('/analytics/performance', vendorController.getPerformanceReport);

/**
 * @swagger
 * /vendor/analytics/products:
 *   get:
 *     summary: تحليلات المنتجات
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [sales, revenue, rating]
 *           default: sales
 *     responses:
 *       200:
 *         description: تحليلات المنتجات
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
 *                     byCategory:
 *                       type: array
 *                     availability:
 *                       type: object
 *                     priceRange:
 *                       type: object
 */
router.get('/analytics/products', vendorController.getProductAnalytics);

// ========== 7. التقييمات ==========

/**
 * @swagger
 * /vendor/reviews:
 *   get:
 *     summary: قائمة تقييمات المتجر
 *     tags: [🏪 Vendor]
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
 *       - in: query
 *         name: rating
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *     responses:
 *       200:
 *         description: قائمة التقييمات
 */
router.get('/reviews', PaginationUtils.validatePaginationParams, reviewController.getVendorReviews);

/**
 * @swagger
 * /vendor/reviews/stats:
 *   get:
 *     summary: إحصائيات التقييمات
 *     tags: [🏪 Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات التقييمات
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
 *                     overview:
 *                       type: object
 *                     percentages:
 *                       type: object
 *                     monthly:
 *                       type: array
 *                     recent:
 *                       type: array
 */
router.get('/reviews/stats', reviewController.getVendorReviewStats);

/**
 * @swagger
 * /vendor/reviews/{id}/reply:
 *   post:
 *     summary: الرد على تقييم
 *     tags: [🏪 Vendor]
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
 *               - reply
 *             properties:
 *               reply:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: تم إضافة الرد
 */
router.post('/reviews/:id/reply', reviewController.replyToReview);

module.exports = router;