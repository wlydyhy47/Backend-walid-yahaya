// ============================================
// ملف: src/routes/admin.routes.js
// الوصف: مسارات المشرف الموحدة مع توثيق كامل
// الإصدار: 3.1
// ============================================

const express = require('express');
const router = express.Router();

const { 
  userController,
  storeController,
  productController,
  orderController,
  driverController,
  vendorController,
  aggregateController,
  notificationController,
  analyticsController,
  securityController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// Validators
const {
  createUserSchema,
  updateUserByAdminSchema
} = require('../validators/user.validator');

const {
  createStoreSchema,
  updateStoreSchema
} = require('../validators/store.validator');

const {
  assignDriverSchema,
  cancelOrderSchema
} = require('../validators/order.validator');

const {
  createProductSchema,
  updateProductSchema,
  updateInventorySchema
} = require('../validators/product.validator');

/**
 * @swagger
 * tags:
 *   name: 👑 Admin
 *   description: مسارات المشرف (صلاحيات كاملة)
 */

// جميع مسارات المشرف تحتاج توثيق ودور admin
router.use(auth);
router.use(role('admin'));

// ========== 1. لوحة التحكم والإحصائيات ==========

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     summary: لوحة تحكم المشرف الرئيسية
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات لوحة التحكم
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
 *                     stats:
 *                       type: object
 *                     usersByRole:
 *                       type: array
 *                     recentOrders:
 *                       type: array
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: غير مصرح - يتطلب صلاحيات المشرف
 */
router.get('/dashboard', aggregateController.getAdminDashboard);

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: إحصائيات عامة
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: الإحصائيات العامة
 */
router.get('/stats', aggregateController.getAdminStats);

/**
 * @swagger
 * /admin/stats/users:
 *   get:
 *     summary: إحصائيات المستخدمين
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات المستخدمين
 */
router.get('/stats/users', aggregateController.getAdminUserStats);

/**
 * @swagger
 * /admin/stats/orders:
 *   get:
 *     summary: إحصائيات الطلبات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الطلبات
 */
router.get('/stats/orders', aggregateController.getAdminOrderStats);

/**
 * @swagger
 * /admin/stats/revenue:
 *   get:
 *     summary: إحصائيات الإيرادات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الإيرادات
 */
router.get('/stats/revenue', aggregateController.getAdminRevenueStats);

// ========== 2. إدارة المستخدمين ==========

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: قائمة المستخدمين
 *     tags: [👑 Admin]
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
 *         name: role
 *         schema:
 *           type: string
 *           enum: [client, vendor, driver, admin]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: بحث بالاسم أو البريد أو رقم الهاتف
 *     responses:
 *       200:
 *         description: قائمة المستخدمين
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
 *                     users:
 *                       type: array
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                     stats:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: غير مصرح - يتطلب صلاحيات المشرف
 */
router.get('/users', PaginationUtils.validatePaginationParams, userController.getUsers);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: تفاصيل مستخدم محدد
 *     tags: [👑 Admin]
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
 *         description: تفاصيل المستخدم
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
 *                     orders:
 *                       type: array
 *                     addresses:
 *                       type: array
 *                     reviews:
 *                       type: array
 *       404:
 *         description: المستخدم غير موجود
 */
router.get('/users/:id', userController.getUserById);

/**
 * @swagger
 * /admin/users:
 *   post:
 *     summary: إنشاء مستخدم جديد (للمشرف)
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserInput'
 *     responses:
 *       201:
 *         description: تم إنشاء المستخدم
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: البريد الإلكتروني أو رقم الهاتف موجود مسبقاً
 */
router.post('/users', validate(createUserSchema), userController.createUser);

/**
 * @swagger
 * /admin/users/{id}:
 *   put:
 *     summary: تحديث مستخدم (للمشرف)
 *     tags: [👑 Admin]
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
 *             $ref: '#/components/schemas/UpdateUserByAdminInput'
 *     responses:
 *       200:
 *         description: تم تحديث المستخدم
 *       404:
 *         description: المستخدم غير موجود
 */
router.put('/users/:id', validate(updateUserByAdminSchema), userController.updateUserById);

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: حذف مستخدم (للمشرف)
 *     tags: [👑 Admin]
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
 *         description: تم حذف المستخدم
 *       404:
 *         description: المستخدم غير موجود
 */
router.delete('/users/:id', userController.deleteUserById);

// ========== 3. إدارة التجار ==========

/**
 * @swagger
 * /admin/vendors:
 *   get:
 *     summary: قائمة التجار
 *     tags: [👑 Admin]
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
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: قائمة التجار
 */
router.get('/vendors', PaginationUtils.validatePaginationParams, vendorController.getVendors);

/**
 * @swagger
 * /admin/vendors/{id}:
 *   get:
 *     summary: تفاصيل تاجر محدد
 *     tags: [👑 Admin]
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
 *         description: تفاصيل التاجر
 */
router.get('/vendors/:id', vendorController.getVendorById);

/**
 * @swagger
 * /admin/vendors/{id}/verify:
 *   put:
 *     summary: توثيق تاجر
 *     tags: [👑 Admin]
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
 *         description: تم توثيق التاجر
 */
router.put('/vendors/:id/verify', vendorController.verifyVendor);

/**
 * @swagger
 * /admin/vendors/{id}/status:
 *   put:
 *     summary: تغيير حالة التاجر (تفعيل/تعطيل)
 *     tags: [👑 Admin]
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
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: تم تغيير حالة التاجر
 */
router.put('/vendors/:id/status', vendorController.toggleVendorStatus);

// ========== 4. إدارة المتاجر ==========

/**
 * @swagger
 * /admin/stores:
 *   get:
 *     summary: قائمة المتاجر
 *     tags: [👑 Admin]
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
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: isOpen
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: قائمة المتاجر
 */
router.get('/stores', PaginationUtils.validatePaginationParams, storeController.getStoresPaginated);

/**
 * @swagger
 * /admin/stores/{id}:
 *   get:
 *     summary: تفاصيل متجر محدد
 *     tags: [👑 Admin]
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
 *         description: تفاصيل المتجر
 */
router.get('/stores/:id', storeController.getStoreDetails);

/**
 * @swagger
 * /admin/stores:
 *   post:
 *     summary: إنشاء متجر جديد (للمشرف)
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/CreateStoreInput'
 *     responses:
 *       201:
 *         description: تم إنشاء المتجر
 */
router.post('/stores', 
  validate(createStoreSchema),
  upload('stores', ['image']).fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
  ]), 
  storeController.createStore
);

/**
 * @swagger
 * /admin/stores/{id}:
 *   put:
 *     summary: تحديث متجر
 *     tags: [👑 Admin]
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
 *             $ref: '#/components/schemas/UpdateStoreInput'
 *     responses:
 *       200:
 *         description: تم تحديث المتجر
 */
router.put('/stores/:id', validate(updateStoreSchema), storeController.updateStore);

/**
 * @swagger
 * /admin/stores/{id}:
 *   delete:
 *     summary: حذف متجر
 *     tags: [👑 Admin]
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
 *         description: تم حذف المتجر
 */
router.delete('/stores/:id', storeController.deleteStore);

/**
 * @swagger
 * /admin/stores/{id}/verify:
 *   put:
 *     summary: توثيق متجر
 *     tags: [👑 Admin]
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
 *         description: تم توثيق المتجر
 */
router.put('/stores/:id/verify', storeController.verifyStore);

/**
 * @swagger
 * /admin/stores/{id}/toggle-status:
 *   put:
 *     summary: تغيير حالة المتجر (مفتوح/مغلق)
 *     tags: [👑 Admin]
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
 *         description: تم تغيير حالة المتجر
 */
router.put('/stores/:id/toggle-status', storeController.toggleStoreStatus);

// ========== 5. إدارة المنتجات ==========

/**
 * @swagger
 * /admin/products:
 *   get:
 *     summary: قائمة جميع المنتجات
 *     tags: [👑 Admin]
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
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: store
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
 *     responses:
 *       200:
 *         description: قائمة المنتجات
 */
router.get('/products', PaginationUtils.validatePaginationParams, productController.getAllProducts);

/**
 * @swagger
 * /admin/products/stats:
 *   get:
 *     summary: إحصائيات المنتجات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات المنتجات
 */
router.get('/products/stats', productController.getProductStats);

/**
 * @swagger
 * /admin/products/{id}:
 *   get:
 *     summary: تفاصيل منتج محدد
 *     tags: [👑 Admin]
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
 */
router.get('/products/:id', productController.getProductById);

/**
 * @swagger
 * /admin/products:
 *   post:
 *     summary: إنشاء منتج جديد (للمشرف)
 *     tags: [👑 Admin]
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
 */
router.post('/products', 
  upload('products', ['image']).single('image'),
  validate(createProductSchema),
  productController.createProduct
);

/**
 * @swagger
 * /admin/products/{id}:
 *   put:
 *     summary: تحديث منتج
 *     tags: [👑 Admin]
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
 *             $ref: '#/components/schemas/UpdateProductInput'
 *     responses:
 *       200:
 *         description: تم تحديث المنتج
 */
router.put('/products/:id', 
  validate(updateProductSchema),
  productController.updateProduct
);

/**
 * @swagger
 * /admin/products/{id}:
 *   delete:
 *     summary: حذف منتج
 *     tags: [👑 Admin]
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
 * /admin/products/{id}/feature:
 *   put:
 *     summary: تمييز منتج كمميز
 *     tags: [👑 Admin]
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
 *               - featured
 *             properties:
 *               featured:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: تم تحديث حالة التمييز
 */
router.put('/products/:id/feature', productController.toggleFeatured);

/**
 * @swagger
 * /admin/products/{id}/image:
 *   put:
 *     summary: تحديث صورة المنتج
 *     tags: [👑 Admin]
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
 * /admin/products/{id}/toggle-availability:
 *   put:
 *     summary: تغيير حالة توفر المنتج
 *     tags: [👑 Admin]
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
 * /admin/products/{id}/inventory:
 *   put:
 *     summary: تحديث المخزون
 *     tags: [👑 Admin]
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
router.put('/products/:id/inventory', 
  validate(updateInventorySchema),
  productController.updateInventory
);

// ========== 6. إدارة الطلبات ==========

/**
 * @swagger
 * /admin/orders:
 *   get:
 *     summary: قائمة جميع الطلبات
 *     tags: [👑 Admin]
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
 *         name: store
 *         schema:
 *           type: string
 *       - in: query
 *         name: driver
 *         schema:
 *           type: string
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
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
 */
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);

/**
 * @swagger
 * /admin/orders/{id}:
 *   get:
 *     summary: تفاصيل طلب محدد
 *     tags: [👑 Admin]
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
 * /admin/orders/stats/overview:
 *   get:
 *     summary: نظرة عامة على إحصائيات الطلبات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: إحصائيات الطلبات
 */
router.get('/orders/stats/overview', orderController.getOrderStats);

/**
 * @swagger
 * /admin/orders/stats/daily:
 *   get:
 *     summary: إحصائيات يومية للطلبات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات اليوم
 */
router.get('/orders/stats/daily', orderController.getDailyStats);

/**
 * @swagger
 * /admin/orders/stats/monthly:
 *   get:
 *     summary: إحصائيات شهرية للطلبات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: إحصائيات الشهر
 */
router.get('/orders/stats/monthly', orderController.getMonthlyStats);

/**
 * @swagger
 * /admin/orders/{id}/assign:
 *   put:
 *     summary: تعيين مندوب للطلب
 *     tags: [👑 Admin]
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
 *             $ref: '#/components/schemas/AssignDriverInput'
 *     responses:
 *       200:
 *         description: تم تعيين المندوب
 */
router.put('/orders/:id/assign', validate(assignDriverSchema), orderController.assignDriver);

/**
 * @swagger
 * /admin/orders/{id}/reassign:
 *   put:
 *     summary: إعادة تعيين مندوب للطلب
 *     tags: [👑 Admin]
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
 *         description: تم إعادة تعيين المندوب
 */
router.put('/orders/:id/reassign', orderController.reassignDriver);

/**
 * @swagger
 * /admin/orders/{id}/force-cancel:
 *   put:
 *     summary: إلغاء طلب بالقوة (للمشرف)
 *     tags: [👑 Admin]
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
 */
router.put('/orders/:id/force-cancel', validate(cancelOrderSchema), orderController.forceCancelOrder);

// ========== 7. إدارة المندوبين ==========

/**
 * @swagger
 * /admin/drivers:
 *   get:
 *     summary: قائمة المندوبين
 *     tags: [👑 Admin]
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
 *         name: isAvailable
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isOnline
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: قائمة المندوبين
 */
router.get('/drivers', PaginationUtils.validatePaginationParams, driverController.getDrivers);

/**
 * @swagger
 * /admin/drivers/{id}:
 *   get:
 *     summary: تفاصيل مندوب محدد
 *     tags: [👑 Admin]
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
 *         description: تفاصيل المندوب
 */
router.get('/drivers/:id', driverController.getDriverById);

/**
 * @swagger
 * /admin/drivers/{id}/location:
 *   get:
 *     summary: موقع مندوب محدد
 *     tags: [👑 Admin]
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
router.get('/drivers/:id/location', driverController.getDriverLocation);

/**
 * @swagger
 * /admin/drivers/{id}/stats:
 *   get:
 *     summary: إحصائيات مندوب محدد
 *     tags: [👑 Admin]
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
 *         description: إحصائيات المندوب
 */
router.get('/drivers/:id/stats', driverController.getDriverStatsById);

/**
 * @swagger
 * /admin/drivers/{id}/orders:
 *   get:
 *     summary: طلبات مندوب محدد
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: قائمة طلبات المندوب
 */
router.get('/drivers/:id/orders', PaginationUtils.validatePaginationParams, orderController.getDriverOrdersById);

/**
 * @swagger
 * /admin/drivers/{id}/verify:
 *   put:
 *     summary: توثيق مندوب
 *     tags: [👑 Admin]
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
 *         description: تم توثيق المندوب
 */
router.put('/drivers/:id/verify', driverController.verifyDriver);

/**
 * @swagger
 * /admin/drivers/{id}/status:
 *   put:
 *     summary: تغيير حالة المندوب (تفعيل/تعطيل)
 *     tags: [👑 Admin]
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
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: تم تغيير حالة المندوب
 */
router.put('/drivers/:id/status', driverController.toggleDriverStatus);

// ========== 8. إدارة الإشعارات ==========

/**
 * @swagger
 * /admin/notifications/send:
 *   post:
 *     summary: إرسال إشعار مخصص
 *     tags: [👑 Admin]
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
 *               - message
 *               - userIds
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               type:
 *                 type: string
 *                 enum: [order, promotion, system, chat, loyalty]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               data:
 *                 type: object
 *               link:
 *                 type: string
 *               icon:
 *                 type: string
 *               campaignId:
 *                 type: string
 *     responses:
 *       201:
 *         description: تم إرسال الإشعارات
 */
router.post('/notifications/send', notificationController.sendCustomNotification);

/**
 * @swagger
 * /admin/notifications/campaign/{campaignId}/stats:
 *   get:
 *     summary: إحصائيات حملة إشعارات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: إحصائيات الحملة
 */
router.get('/notifications/campaign/:campaignId/stats', notificationController.getCampaignStats);

/**
 * @swagger
 * /admin/notifications/all/stats:
 *   get:
 *     summary: إحصائيات جميع الإشعارات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: إحصائيات الإشعارات
 */
router.get('/notifications/all/stats', notificationController.getAllNotificationsStats);

// ========== 9. إدارة الكاش ==========

/**
 * @swagger
 * /admin/cache/stats:
 *   get:
 *     summary: إحصائيات الكاش
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الكاش
 */
router.get('/cache/stats', aggregateController.getCacheStats);

/**
 * @swagger
 * /admin/cache/clear:
 *   post:
 *     summary: مسح الكاش بالكامل
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pattern:
 *                 type: string
 *               key:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم مسح الكاش
 */
router.post('/cache/clear', aggregateController.clearCache);

/**
 * @swagger
 * /admin/cache/clear/{pattern}:
 *   post:
 *     summary: مسح الكاش بنمط محدد
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pattern
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم مسح الكاش
 */
router.post('/cache/clear/:pattern', aggregateController.clearCachePattern);

// ========== 10. إدارة Rate Limiting ==========

/**
 * @swagger
 * /admin/rate-limit/stats:
 *   get:
 *     summary: إحصائيات Rate Limiting
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الحدود
 */
router.get('/rate-limit/stats', rateLimiter.getStats);

/**
 * @swagger
 * /admin/rate-limit/reset/{userId}:
 *   post:
 *     summary: إعادة تعيين حدود مستخدم
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إعادة تعيين الحدود
 */
router.post('/rate-limit/reset/:userId', rateLimiter.resetUserLimits);

/**
 * @swagger
 * /admin/rate-limit/clear-all:
 *   delete:
 *     summary: مسح جميع حدود Rate Limiting
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم مسح جميع الحدود
 */
router.delete('/rate-limit/clear-all', rateLimiter.clearAll);

// ========== 11. التحليلات المتقدمة ==========

/**
 * @swagger
 * /admin/analytics/users:
 *   get:
 *     summary: تحليلات المستخدمين
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: تحليلات المستخدمين
 */
router.get('/analytics/users', analyticsController.getUserAnalytics);

/**
 * @swagger
 * /admin/analytics/orders:
 *   get:
 *     summary: تحليلات الطلبات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: تحليلات الطلبات
 */
router.get('/analytics/orders', analyticsController.getOrderAnalytics);

/**
 * @swagger
 * /admin/analytics/revenue:
 *   get:
 *     summary: تحليلات الإيرادات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: تحليلات الإيرادات
 */
router.get('/analytics/revenue', analyticsController.getRevenueAnalytics);

// ========== 12. فحص الأمان (للأدمن) ==========

/**
 * @swagger
 * /admin/security/headers:
 *   get:
 *     summary: الحصول على رؤوس الأمان الحالية
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: رؤوس الأمان
 */
router.get('/security/headers', securityController.getSecurityHeaders);

// ========== 13. تصدير التقارير ==========

/**
 * @swagger
 * /admin/reports/orders:
 *   get:
 *     summary: تصدير تقرير الطلبات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *     responses:
 *       200:
 *         description: تقرير الطلبات
 */
router.get('/reports/orders', aggregateController.exportOrdersReport);

/**
 * @swagger
 * /admin/reports/users:
 *   get:
 *     summary: تصدير تقرير المستخدمين
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير المستخدمين
 */
router.get('/reports/users', aggregateController.exportUsersReport);

/**
 * @swagger
 * /admin/reports/revenue:
 *   get:
 *     summary: تصدير تقرير الإيرادات
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: تقرير الإيرادات
 */
router.get('/reports/revenue', aggregateController.exportRevenueReport);

/**
 * @swagger
 * /admin/reports/drivers:
 *   get:
 *     summary: تصدير تقرير المندوبين
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير المندوبين
 */
router.get('/reports/drivers', aggregateController.exportDriversReport);

/**
 * @swagger
 * /admin/reports/stores:
 *   get:
 *     summary: تصدير تقرير المتاجر
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير المتاجر
 */
router.get('/reports/stores', aggregateController.exportStoresReport);

// ========== 14. إحصائيات متقدمة ==========

/**
 * @swagger
 * /admin/advanced-stats/daily:
 *   get:
 *     summary: إحصائيات يومية متقدمة
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات اليوم
 */
router.get('/advanced-stats/daily', aggregateController.getDailyAdvancedStats);

/**
 * @swagger
 * /admin/advanced-stats/weekly:
 *   get:
 *     summary: إحصائيات أسبوعية متقدمة
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الأسبوع
 */
router.get('/advanced-stats/weekly', aggregateController.getWeeklyAdvancedStats);

/**
 * @swagger
 * /admin/advanced-stats/monthly:
 *   get:
 *     summary: إحصائيات شهرية متقدمة
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: إحصائيات الشهر
 */
router.get('/advanced-stats/monthly', aggregateController.getMonthlyAdvancedStats);

/**
 * @swagger
 * /admin/advanced-stats/custom:
 *   get:
 *     summary: إحصائيات مخصصة حسب الفترة
 *     tags: [👑 Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *     responses:
 *       200:
 *         description: إحصائيات مخصصة
 */
router.get('/advanced-stats/custom', aggregateController.getCustomStats);

module.exports = router;